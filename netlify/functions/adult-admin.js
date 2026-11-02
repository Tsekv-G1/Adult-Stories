const c=require('../../server/core.cjs');
const audioWorkflow=require('../../server/audio-workflow.cjs');
exports.handler=c.endpoint(['POST'],async e=>{
 const actor=await c.admin(e),b=c.body(e),limit=Math.min(100,Math.max(1,Math.floor(Number(b.limit)||50))),offset=Math.min(100000,Math.max(0,Math.floor(Number(b.offset)||0)));
 if(b.action==='orders'){const f=['pending','approved','rejected'].includes(b.status)?'&status=eq.'+b.status:'';const orders=await c.db('adult_payment_orders?select=id,member_id,story_id,kind,membership_days,amount,status,memo,customer_reference,bank_reference,payment_reported_at,created_at,adult_members(phone,name),stories(title),adult_entitlements(revoked_at,expires_at)'+f+'&order=created_at.desc&limit='+limit+'&offset='+offset);return c.reply(200,{ok:true,orders,next_offset:orders.length===limit?offset+limit:null})}
 if(b.action==='members'){const rows=await c.db('adult_members?select=id,phone,name,status,created_at,adult_entitlements(membership_days,expires_at,revoked_at,story_id,stories(title))&order=created_at.desc&limit='+limit+'&offset='+offset),now=Date.now(),members=rows.map(m=>{const active=(m.adult_entitlements||[]).filter(x=>!x.revoked_at&&(!x.expires_at||Date.parse(x.expires_at)>now)),noExpiry=active.some(x=>!x.expires_at),ends=active.map(x=>Date.parse(x.expires_at)).filter(Number.isFinite);return{id:m.id,phone:m.phone,name:m.name,status:m.status,created_at:m.created_at,active_access:active.length>0,access_expires_at:noExpiry||!ends.length?null:new Date(Math.max(...ends)).toISOString(),access_expires_never:noExpiry,active_entitlements:active.length,entitlements:active.map(x=>({story_id:x.story_id,title:x.story_id?(x.stories?.title||'Өгүүллэг'):`${Number(x.membership_days)||30} хоногийн бүх сан`,expires_at:x.expires_at}))}});return c.reply(200,{ok:true,members,next_offset:members.length===limit?offset+limit:null})}
 if(['approve','reject'].includes(b.action)){const receipt=String(b.receipt||'').replace(/\s+/g,'').toUpperCase(),note=String(b.note||'').trim()||(b.action==='approve'?'Админ төлбөрийг баталсан.':'Админ төлбөрийг цуцалсан.');if(receipt&&receipt.length<4)c.fail(400,'invalid_bank_reference');if(note.length>500)c.fail(400,'verification_note_required');const order=await c.rpc('adult_decide_order',{p_order_id:c.uuid(b.id),p_approve:b.action==='approve',p_receipt:receipt,p_note:note,p_actor:actor});await require('../../server/telegram.cjs').notifyPayment({event:b.action==='approve'?'approved':'rejected',order});return c.reply(200,{ok:true,order})}
 if(b.action==='revoke'){const note=String(b.note||'').trim();if(note.length<5||note.length>500)c.fail(400,'verification_note_required');await c.rpc('adult_revoke_entitlement',{p_order_id:c.uuid(b.id),p_note:note,p_actor:actor});return c.reply(200,{ok:true})}

 if(b.action==='report')return c.reply(200,{ok:true,report:await c.rpc('adult_dashboard_report',{})});
 if(b.action==='recoveries'){const recoveries=await c.db('adult_reset_requests?resolved_at=is.null&select=member_id,requested_at,adult_members(phone,name)&order=requested_at.asc&limit='+limit+'&offset='+offset);return c.reply(200,{ok:true,recoveries,next_offset:recoveries.length===limit?offset+limit:null})}
 if(b.action==='reset-password'){
  const note=String(b.note||'').trim()||'Админ нууц үгийг шинэчилсэн.';if(note.length>500)c.fail(400,'verification_note_required');
  const id=c.uuid(b.id),member=(await c.db('adult_members?id=eq.'+id+'&select=phone&limit=1'))?.[0];if(!member)c.fail(404,'account_not_found');
  const password='As!'+require('node:crypto').randomBytes(12).toString('base64url');const digest=await c.passwordHash(password);
  await c.rpc('adult_reset_password',{p_member:id,p_hash:digest,p_actor:actor,p_note:note});
  return c.reply(200,{ok:true,phone:member.phone,new_password:password});
 }
 if(['media-config','media-upload','media-complete','media-list','audio-list'].includes(b.action)){
  const r2=require('../../server/r2.cjs');
  if(b.action==='media-config'){const s=r2.settings();return c.reply(200,{ok:true,provider:'r2',bucket:s.bucket,public_base:s.publicBase,audio_bucket:s.audio||null})}
  if(b.action==='media-upload')return c.reply(200,{ok:true,...await r2.upload(b)});
  if(b.action==='media-complete')return c.reply(200,{ok:true,asset:await r2.complete(b)});
  return c.reply(200,{ok:true,...await r2.list({cursor:b.cursor||'',audio:b.action==='audio-list'})});
 }
 if(b.action==='audio-upload')return c.reply(200,{ok:true,...await require('../../server/audio.cjs').upload(String(b.extension||''))});
 if(b.action==='audio-preview')return c.reply(200,{ok:true,url:await require('../../server/audio.cjs').sign(String(b.reference||''))});
 if(b.action==='audio-workflow-config'){
  const configured=!!(process.env.GEMINI_API_KEY&&process.env.ELEVENLABS_API_KEY&&process.env.ELEVENLABS_VOICE_ID&&process.env.HF_TOKEN&&process.env.HF_MUSIC_URL&&process.env.AUDIO_PROCESSOR_URL&&process.env.AUDIO_PROCESSOR_TOKEN&&process.env.EDITOR_AUDIO_JOB_SECRET&&process.env.R2_AUDIO_BUCKET&&process.env.R2_ACCESS_KEY_ID&&process.env.R2_SECRET_ACCESS_KEY&&process.env.R2_ACCOUNT_ID&&process.env.R2_PUBLIC_BASE_URL);
  return c.reply(200,{ok:true,configured,steps:{gemini:!!process.env.GEMINI_API_KEY,elevenlabs:!!(process.env.ELEVENLABS_API_KEY&&process.env.ELEVENLABS_VOICE_ID),huggingface:!!(process.env.HF_TOKEN&&process.env.HF_MUSIC_URL),audio_processor:!!(process.env.AUDIO_PROCESSOR_URL&&process.env.AUDIO_PROCESSOR_TOKEN),storage:!!(process.env.R2_AUDIO_BUCKET&&process.env.R2_ACCESS_KEY_ID&&process.env.R2_SECRET_ACCESS_KEY),background:!!process.env.EDITOR_AUDIO_JOB_SECRET}});
 }
 if(b.action==='audio-script'){
  const id=c.uuid(b.story_id),story=(await c.db('stories?id=eq.'+id+'&select=id,title,category&limit=1'))?.[0];if(!story)c.fail(404,'story_unavailable');
  const body=(await c.db('story_private?story_id=eq.'+id+'&select=full_text&limit=1'))?.[0]||{};
  const preview=(await c.db('stories?id=eq.'+id+'&select=preview_text&limit=1'))?.[0]?.preview_text||'';
  return c.reply(200,{ok:true,script:await audioWorkflow.generateNarration({title:story.title,category:story.category,preview,full:body.full_text})});
 }
 if(b.action==='audio-latest'){
  const id=c.uuid(b.story_id),rows=await c.db('adult_audio_jobs?story_id=eq.'+id+'&select=id,story_id,status,progress,stage,preview_audio_url,duration_seconds,error_code,created_at,updated_at&order=created_at.desc&limit=1');return c.reply(200,{ok:true,job:rows?.[0]||null});
 }
 if(b.action==='audio-start'){
  const id=c.uuid(b.story_id),musicPrompt=String(b.music_prompt||'').trim().slice(0,500),previewSeconds=audioWorkflow.clamp(b.preview_seconds,15,180);
  const script=String((await c.db('story_private?story_id=eq.'+id+'&select=narration_script&limit=1'))?.[0]?.narration_script||'').trim();
  if(script.length<20||script.length>50000)c.fail(400,'audio_script_length_invalid');
  const rows=await c.db('story_private?story_id=eq.'+id+'&select=story_id&limit=1');if(!rows?.length)c.fail(404,'story_unavailable');
  const jobId=require('node:crypto').randomUUID(),job={id:jobId,story_id:id,status:'queued',progress:1,stage:'Дараалалд хүлээж байна',script,music_prompt:musicPrompt||'Монгол өгүүллэгийн намуухан, үггүй cinematic ambient хөгжим; зөөлөн дулаан өнгө, voice-оос нам түвшинтэй, дуу хоолой болон хэмнэлгүй.',preview_seconds:previewSeconds};
  await c.db('adult_audio_jobs',{method:'POST',data:job,prefer:'return=minimal'});
  let started;try{started=await fetch(c.origin()+'/.netlify/functions/editor-audio-background',{method:'POST',headers:{'Content-Type':'application/json','x-editor-audio-secret':c.config('EDITOR_AUDIO_JOB_SECRET')},body:JSON.stringify({job_id:jobId}),signal:AbortSignal.timeout(10000)})}catch{started=null}
  if(!started?.ok){await c.db('adult_audio_jobs?id=eq.'+jobId,{method:'PATCH',data:{status:'failed',progress:0,stage:'Аудио ажил эхэлсэнгүй',error_code:'background_start_failed',updated_at:new Date().toISOString()},prefer:'return=minimal'});c.fail(503,'audio_background_start_failed')}
  return c.reply(202,{ok:true,job:{id:jobId,status:'queued',progress:1,stage:job.stage}});
 }
 if(b.action==='audio-status'){
  const id=c.uuid(b.id),rows=await c.db('adult_audio_jobs?id=eq.'+id+'&select=id,story_id,status,progress,stage,preview_audio_url,duration_seconds,error_code,created_at,updated_at&limit=1');if(!rows?.length)c.fail(404,'audio_job_not_found');return c.reply(200,{ok:true,job:rows[0]});
 }
 if(b.action==='audio-approve'){
  const id=c.uuid(b.id),rows=await c.db('adult_audio_jobs?id=eq.'+id+'&select=id,story_id,status,full_audio_ref,preview_audio_url&limit=1'),job=rows?.[0];if(!job)c.fail(404,'audio_job_not_found');if(job.status!=='ready'||!job.full_audio_ref||!job.preview_audio_url)c.fail(409,'audio_job_not_ready');
  await c.db('story_private?story_id=eq.'+job.story_id,{method:'PATCH',data:{full_audio_url:job.full_audio_ref},prefer:'return=minimal'});
  await c.db('stories?id=eq.'+job.story_id,{method:'PATCH',data:{audio_preview_url:job.preview_audio_url},prefer:'return=minimal'});
  await c.db('adult_audio_jobs?id=eq.'+id,{method:'PATCH',data:{status:'approved',progress:100,stage:'Studio-оос баталсан',updated_at:new Date().toISOString()},prefer:'return=minimal'});
  return c.reply(200,{ok:true,story_id:job.story_id});
 }
 if(b.action==='settings')return c.reply(200,{ok:true,payment:c.payment(),cms_url:c.origin()+'/admin.html'});
 c.fail(400,'invalid_action');
},{admin:true});
