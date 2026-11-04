const c=require('../../server/core.cjs');
exports.handler=c.endpoint(['POST'],async e=>{
 const actor=await c.admin(e),b=c.body(e),limit=Math.min(100,Math.max(1,Math.floor(Number(b.limit)||50))),offset=Math.min(100000,Math.max(0,Math.floor(Number(b.offset)||0)));
 if(b.action==='orders'){const f=['pending','approved','rejected'].includes(b.status)?'&status=eq.'+b.status:'';const orders=await c.db('adult_payment_orders?select=id,member_id,story_id,kind,membership_days,amount,status,created_at,adult_members(phone,name),stories(title),adult_entitlements(revoked_at,expires_at)'+f+'&order=created_at.desc&limit='+limit+'&offset='+offset);return c.reply(200,{ok:true,orders,next_offset:orders.length===limit?offset+limit:null})}
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
 if(['media-config','media-upload','media-complete','media-list','audio-list','preview-list','cta-list'].includes(b.action)){
  const r2=require('../../server/r2.cjs');
  if(b.action==='media-config'){const s=r2.settings();return c.reply(200,{ok:true,provider:'r2',bucket:s.bucket,public_base:s.publicBase,audio_bucket:s.audio||null})}
  if(b.action==='media-upload')return c.reply(200,{ok:true,...await r2.upload(b)});
  if(b.action==='media-complete')return c.reply(200,{ok:true,asset:await r2.complete(b)});
  return c.reply(200,{ok:true,...await r2.list({cursor:b.cursor||'',audio:b.action==='audio-list',publicAudio:b.action==='preview-list'||b.action==='cta-list',publicKind:b.action==='cta-list'?'cta':''})});
 }
 if(b.action==='audio-crop-start'){
  const storyId=c.uuid(b.story_id),reference=String(b.reference||''),start=Number(b.start_seconds),end=Number(b.end_seconds);
  let cta;try{cta=require('../../server/audio-crop.cjs').ctaSettings(b.cta_url,b.cta_gap_seconds)}catch(error){c.fail(400,error.message)}
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start<5||end-start>180)c.fail(400,'invalid_audio_range');
  const row=(await c.db('story_private?story_id=eq.'+storyId+'&select=full_audio_url&limit=1'))?.[0];
  if(!row||row.full_audio_url!==reference)c.fail(409,'save_audio_first');
  const source=await require('../../server/audio.cjs').resolve(reference);if(!source)c.fail(400,'invalid_audio_source');
  const r2=require('../../server/r2.cjs'),target=await r2.audioPreviewTarget(storyId);
  const created=await c.db('adult_audio_crop_jobs',{method:'POST',data:{story_id:storyId,status:'queued',start_seconds:start,end_seconds:end,preview_url:target.url,error_code:''},prefer:'return=representation'}),job=created?.[0];
  if(!job?.id)c.fail(503,'audio_crop_start_failed');
  const payload=JSON.stringify({job_id:job.id,source_url:source,put_url:target.put_url,start_seconds:start,end_seconds:end,cta_url:cta.url,cta_gap_seconds:cta.gap});
  const signature=require('node:crypto').createHmac('sha256',c.config('SUPABASE_SERVICE_ROLE_KEY')).update(payload).digest('hex');
  let started;try{started=await fetch(c.origin()+'/.netlify/functions/editor-audio-crop-background',{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Audio-Signature':signature},body:payload,signal:AbortSignal.timeout(12000)})}catch{started=null}
  if(!started||!(started.ok||started.status===202)){await c.db('adult_audio_crop_jobs?id=eq.'+job.id,{method:'PATCH',data:{status:'failed',error_code:'audio_crop_start_failed',updated_at:new Date().toISOString()},prefer:'return=minimal'});c.fail(503,'audio_crop_start_failed')}
  return c.reply(200,{ok:true,job:{id:job.id,status:'queued',story_id:storyId}})
 }
 if(b.action==='audio-crop-status'){
  const id=c.uuid(b.id),storyId=c.uuid(b.story_id),job=(await c.db('adult_audio_crop_jobs?id=eq.'+id+'&story_id=eq.'+storyId+'&select=id,story_id,status,start_seconds,end_seconds,duration_seconds,preview_url,error_code,created_at,updated_at&limit=1'))?.[0];
  if(!job)c.fail(404,'audio_crop_not_found');
  if(require('../../server/audio-crop.cjs').cropJobExpired(job)){
   const rows=await c.db('adult_audio_crop_jobs?id=eq.'+id+'&status=eq.'+job.status,{method:'PATCH',data:{status:'failed',error_code:'audio_crop_timeout',updated_at:new Date().toISOString()},prefer:'return=representation'});
   if(rows?.[0])Object.assign(job,rows[0]);
  }
  return c.reply(200,{ok:true,job});
 }
 if(b.action==='audio-upload')return c.reply(200,{ok:true,...await require('../../server/audio.cjs').upload(String(b.extension||''))});
 if(b.action==='audio-preview')return c.reply(200,{ok:true,url:await require('../../server/audio.cjs').sign(String(b.reference||''))});
 if(b.action==='settings')return c.reply(200,{ok:true,payment:c.payment(),cms_url:c.origin()+'/admin.html'});
 c.fail(400,'invalid_action');
},{admin:true});
