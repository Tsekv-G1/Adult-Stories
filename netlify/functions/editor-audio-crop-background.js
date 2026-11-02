'use strict';
const crypto=require('node:crypto');
const c=require('../../server/core.cjs');
function authorized(event){
 const supplied=String(Object.entries(event.headers||{}).find(([key])=>key.toLowerCase()==='x-editor-audio-secret')?.[1]||''),expected=process.env.EDITOR_AUDIO_JOB_SECRET||'';
 return !!(supplied&&expected&&crypto.timingSafeEqual(Buffer.from(c.hash(supplied)),Buffer.from(c.hash(expected))));
}
async function update(id,patch){
 await c.db('adult_audio_crop_jobs?id=eq.'+id,{method:'PATCH',data:{...patch,updated_at:new Date().toISOString()},prefer:'return=minimal'});
}
exports.handler=async event=>{
 if(event.httpMethod!=='POST'||!authorized(event))return c.reply(401,{ok:false,error:'unauthorized'});
 let input;try{input=JSON.parse(event.body||'{}')}catch{return c.reply(400,{ok:false,error:'invalid_request'})}
 const id=input.job_id;if(!/^[a-f\d-]{36}$/i.test(id||''))return c.reply(400,{ok:false,error:'invalid_id'});
 try{
  const rows=await c.db('adult_audio_crop_jobs?id=eq.'+id+'&select=id,status&limit=1'),job=rows?.[0];
  if(!job||job.status!=='queued')return c.reply(200,{ok:true,ignored:true});
  await update(id,{status:'processing',error_code:''});
  const base=process.env.AUDIO_PROCESSOR_URL||'';let endpoint;try{endpoint=new URL('/trim',base)}catch{c.fail(503,'audio_processor_unavailable')}
  if(endpoint.protocol!=='https:'||!process.env.AUDIO_PROCESSOR_TOKEN)c.fail(503,'audio_processor_unavailable');
  const form=new FormData();form.append('source_url',String(input.source_url||''));form.append('upload_preview_url',String(input.put_url||''));form.append('start_seconds',String(input.start_seconds));form.append('end_seconds',String(input.end_seconds));
  let response;try{response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+c.config('AUDIO_PROCESSOR_TOKEN')},body:form,signal:AbortSignal.timeout(720000)})}catch{c.fail(503,'audio_processor_unavailable')}
  const result=await response.json().catch(()=>null);if(!response.ok||!result?.ok)c.fail(503,result?.detail||'audio_processor_failed');
  await update(id,{status:'ready',duration_seconds:Number(result.duration_seconds)||0,error_code:''});
 }catch(error){const code=String(error?.message||'audio_processor_failed');await update(id,{status:'failed',error_code:/^[a-z0-9_]{1,64}$/.test(code)?code:'audio_processor_failed'}).catch(()=>{})}
 return c.reply(200,{ok:true});
};
