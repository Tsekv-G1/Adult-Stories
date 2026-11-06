'use strict';
const crypto=require('node:crypto');
const c=require('../../server/core.cjs');
function authorized(event){
 const supplied=c.header(event,'x-editor-audio-signature'),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||!/^[a-f\d]{64}$/i.test(supplied))return false;
 const expected=crypto.createHmac('sha256',key).update(event.body||'').digest();
 return crypto.timingSafeEqual(Buffer.from(supplied,'hex'),expected);
}
async function update(id,patch){
 await c.db('adult_audio_crop_jobs?id=eq.'+id,{method:'PATCH',data:{...patch,updated_at:new Date().toISOString()},prefer:'return=minimal'});
}
exports.handler=async event=>{
 if(event.httpMethod!=='POST'||!authorized(event))return c.reply(401,{ok:false,error:'unauthorized'});
 let input;try{input=JSON.parse(event.body||'{}')}catch{return c.reply(400,{ok:false,error:'invalid_request'})}
 const id=input.job_id;if(!/^[a-f\d-]{36}$/i.test(id||''))return c.reply(400,{ok:false,error:'invalid_id'});
 let owned=false;
 try{
  const rows=await c.db('adult_audio_crop_jobs?id=eq.'+id+'&select=id,status&limit=1'),job=rows?.[0];
  if(!job||job.status!=='queued')return c.reply(200,{ok:true,ignored:true});
  const claimed=await c.db('adult_audio_crop_jobs?id=eq.'+id+'&status=eq.queued',{method:'PATCH',data:{status:'processing',error_code:'',updated_at:new Date().toISOString()},prefer:'return=representation'});
  if(!claimed?.length)return c.reply(200,{ok:true,ignored:true});
  owned=true;
  const processor=require('../../server/audio-crop.cjs');
  const result=await (input.existing_preview?processor.appendExisting(input):processor.crop(input));
  if(input.apply_story)await require('../../server/cta-bulk.cjs').apply(input,result);
  await update(id,{status:'ready',duration_seconds:result.duration_seconds,error_code:''});
 }catch(error){if(!owned)return c.reply(503,{ok:false,error:'audio_crop_claim_unavailable'});const code=String(error?.message||'audio_processor_failed');await update(id,{status:'failed',error_code:/^[a-z0-9_]{1,64}$/.test(code)?code:'audio_processor_failed'}).catch(()=>{})}
 return c.reply(200,{ok:true});
};
