'use strict';
const c=require('./core.cjs');
const r2=require('./r2.cjs');
const audio=require('./audio-crop.cjs');
const uuid=v=>/^[a-f\d-]{36}$/i.test(v||'');
const savedGap=site=>{const gap=Number(site.shared_cta_gap_seconds);return Number.isFinite(gap)&&gap>=1&&gap<=2?gap:1.5};
async function start(storyId,ctaUrl,gap){
 c.uuid(storyId);const cta=audio.ctaSettings(ctaUrl,gap);
 if(!cta.url)c.fail(400,'invalid_cta_url');
 const story=(await c.db('stories?id=eq.'+storyId+'&select=id,overlay,audio_preview_url,updated_at&limit=1'))?.[0];
 if(!story)c.fail(404,'story_unavailable');
 const site=(await c.db('site_settings?id=eq.main&select=content&limit=1'))?.[0]?.content||{};
 if(site.shared_cta_url!==cta.url||savedGap(site)!==cta.gap)c.fail(409,'shared_cta_changed');
 const preview=story.audio_preview_url||site.shared_preview_url||'',overlay=story.overlay||{};
 if(!preview)return {skipped:true,reason:'no_preview'};
 if(overlay.audio_preview_rendered_url===preview&&overlay.audio_cta_rendered_url===cta.url&&Number(overlay.audio_cta_rendered_gap)===cta.gap)return {skipped:true,reason:'unchanged'};
 const active=(await c.db('adult_audio_crop_jobs?story_id=eq.'+storyId+'&status=in.(queued,processing)&order=created_at.desc&limit=1'))?.[0];
 if(active&&!audio.cropJobExpired(active))return {busy:true,job:active};
 const rendered=overlay.audio_preview_rendered_url===preview&&!!overlay.audio_cta_rendered_url;
 const baseSeconds=Number(overlay.audio_preview_rendered_end)-Number(overlay.audio_preview_rendered_start);
 if(rendered&&(!Number.isFinite(baseSeconds)||baseSeconds<5||baseSeconds>180))c.fail(409,'preview_source_unknown');
 const source=await require('./audio.cjs').resolve(preview);if(!source)c.fail(400,'invalid_audio_source');
 const target=await r2.audioPreviewTarget(storyId);
 const job=(await c.db('adult_audio_crop_jobs',{method:'POST',data:{story_id:storyId,status:'queued',start_seconds:0,end_seconds:rendered?baseSeconds:180,preview_url:target.url,error_code:''},prefer:'return=representation'}))?.[0];
 if(!job?.id)c.fail(503,'audio_crop_start_failed');
 const payload=JSON.stringify({job_id:job.id,source_url:source,put_url:target.put_url,cta_url:cta.url,cta_gap_seconds:cta.gap,existing_preview:true,base_seconds:rendered?baseSeconds:null,apply_story:{id:storyId,preview,updated_at:story.updated_at,output_url:target.url}});
 const signature=require('node:crypto').createHmac('sha256',c.config('SUPABASE_SERVICE_ROLE_KEY')).update(payload).digest('hex');
 let response;try{response=await fetch(c.origin()+'/.netlify/functions/editor-audio-crop-background',{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Audio-Signature':signature},body:payload,signal:AbortSignal.timeout(12000)})}catch{}
 if(!response?.ok){await c.db('adult_audio_crop_jobs?id=eq.'+job.id,{method:'PATCH',data:{status:'failed',error_code:'audio_crop_start_failed'},prefer:'return=minimal'});c.fail(503,'audio_crop_start_failed')}
 return {job:{id:job.id,status:'queued',story_id:storyId}};
}
async function apply(input,result){
 const target=input.apply_story;if(!target||!uuid(target.id))throw Error('invalid_id');
 const row=(await c.db('stories?id=eq.'+target.id+'&select=id,overlay,audio_preview_url,updated_at&limit=1'))?.[0];
 const site=(await c.db('site_settings?id=eq.main&select=content&limit=1'))?.[0]?.content||{};
 if(site.shared_cta_url!==input.cta_url||savedGap(site)!==Number(input.cta_gap_seconds))throw Error('shared_cta_changed');
 if(!row||row.updated_at!==target.updated_at||(row.audio_preview_url||site.shared_preview_url||'')!==target.preview)throw Error('story_changed_elsewhere');
 const privateRow=(await c.db('story_private?story_id=eq.'+target.id+'&select=full_audio_url&limit=1'))?.[0];
 const overlay={...row.overlay},start=Math.round(Number(overlay.audio_preview_start)||0),end=start+Math.round(result.base_seconds);
 Object.assign(overlay,{audio_cta_url:input.cta_url,audio_cta_gap_seconds:input.cta_gap_seconds,audio_cta_rendered_url:input.cta_url,audio_cta_rendered_gap:input.cta_gap_seconds,audio_preview_start:start,audio_preview_end:end,audio_preview_rendered_start:start,audio_preview_rendered_end:end,audio_preview_rendered_source:privateRow?.full_audio_url||'',audio_preview_rendered_url:target.output_url,audio_preview_rendered_duration:result.duration_seconds});
 const saved=await c.db('stories?id=eq.'+target.id+'&updated_at=eq.'+encodeURIComponent(target.updated_at),{method:'PATCH',data:{overlay,audio_preview_url:target.output_url,updated_at:new Date().toISOString()},prefer:'return=representation'});
 if(!saved?.length)throw Error('story_changed_elsewhere');
}
module.exports={start,apply};
