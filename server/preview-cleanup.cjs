'use strict';
const c=require('./core.cjs');
const r2=require('./r2.cjs');
async function all(route){let rows=[],offset=0;for(;;){const page=await c.db(route+'&limit=500&offset='+offset);rows.push(...page);if(page.length<500)return rows;offset+=500}}
const HOLD_MS=24*60*60*1000;
function retentionAction(job,referenced,now){
 if(referenced)return job.error_code==='unused_preview_pending'?'restore':'keep';
 const markedAt=Date.parse(job.updated_at||'');
 if(job.error_code!=='unused_preview_pending'||!Number.isFinite(markedAt))return 'mark';
 return now-markedAt>=HOLD_MS?'delete':'wait';
}
async function cleanup({now=Date.now()}={}){
 // No preview is removed while a render may still need its source.
 const activeCutoff=encodeURIComponent(new Date(now-20*60*1000).toISOString());
 const active=await c.db('adult_audio_crop_jobs?status=in.(queued,processing)&updated_at=gt.'+activeCutoff+'&select=id&limit=1');
 if(active.length)return {deleted:0,deferred:true};
 await c.db('adult_audio_crop_jobs?status=in.(queued,processing)&updated_at=lt.'+activeCutoff,{method:'PATCH',data:{status:'failed',error_code:'audio_crop_timeout'},prefer:'return=minimal'});
 const cutoff=new Date(now-HOLD_MS).toISOString();
 const candidates=await all('adult_audio_crop_jobs?status=in.(ready,failed)&error_code=neq.unused_preview_cleaned&created_at=lt.'+encodeURIComponent(cutoff)+'&select=id,preview_url,error_code,updated_at&order=created_at.asc');
 if(!candidates.length)return {deleted:0,deferred:false};
 const [stories,settings,privateRows,media]=await Promise.all([all('stories?select=audio_preview_url,overlay,preview_text&order=id'),all('site_settings?select=content&order=id'),all('story_private?select=full_audio_url,full_text&order=story_id'),all('media_assets?select=url&order=id')]);
 const referenced=JSON.stringify([stories,settings,privateRows,media]);let deleted=0,marked=0;
 for(const job of candidates){
  if(deleted>=10)break;
  if(!job.preview_url)continue;
  const action=retentionAction(job,referenced.includes(job.preview_url),now);
  if(action==='restore'||action==='mark'){await c.db('adult_audio_crop_jobs?id=eq.'+c.uuid(job.id),{method:'PATCH',data:{error_code:action==='mark'?'unused_preview_pending':'',updated_at:new Date(now).toISOString()},prefer:'return=minimal'});if(action==='mark')marked++;continue}
  if(action!=='delete')continue;
  // Recheck current references immediately before deletion, including unsaved jobs.
  if((await c.db('adult_audio_crop_jobs?status=in.(queued,processing)&updated_at=gt.'+activeCutoff+'&select=id&limit=1')).length)break;
  const current=JSON.stringify(await Promise.all([all('stories?select=audio_preview_url,overlay,preview_text&order=id'),all('site_settings?select=content&order=id'),all('story_private?select=full_audio_url,full_text&order=story_id'),all('media_assets?select=url&order=id')]));
  if(current.includes(job.preview_url))continue;
  if(await r2.deleteGeneratedPreview(job.preview_url)){
   deleted++;await c.db('adult_audio_crop_jobs?id=eq.'+c.uuid(job.id),{method:'PATCH',data:{status:'failed',error_code:'unused_preview_cleaned',updated_at:new Date().toISOString()},prefer:'return=minimal'});
  }
 }
 return {deleted,marked,deferred:false,more:deleted>=10};
}
module.exports={cleanup,retentionAction};
