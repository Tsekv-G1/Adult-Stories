const c=require('../../server/core.cjs');
exports.handler=c.endpoint(['POST'],async e=>{
 const actor=await c.admin(e),b=c.body(e),limit=Math.min(100,Math.max(1,Math.floor(Number(b.limit)||50))),offset=Math.min(100000,Math.max(0,Math.floor(Number(b.offset)||0)));
 if(b.action==='orders'){const f=['pending','approved','rejected'].includes(b.status)?'&status=eq.'+b.status:'';const orders=await c.db('adult_payment_orders?select=id,member_id,story_id,kind,amount,status,memo,customer_reference,bank_reference,payment_reported_at,created_at,adult_members(phone,name),stories(title),adult_entitlements(revoked_at,expires_at)'+f+'&order=created_at.desc&limit='+limit+'&offset='+offset);return c.reply(200,{ok:true,orders,next_offset:orders.length===limit?offset+limit:null})}
 if(b.action==='members'){const members=await c.db('adult_members?select=id,phone,name,status,created_at&order=created_at.desc&limit='+limit+'&offset='+offset);return c.reply(200,{ok:true,members,next_offset:members.length===limit?offset+limit:null})}
 if(['approve','reject'].includes(b.action)){const receipt=String(b.receipt||'').replace(/\s+/g,'').toUpperCase(),note=String(b.note||'').trim();if(b.action==='approve'&&receipt.length<4)c.fail(400,'receipt_required');if(note.length<5||note.length>500)c.fail(400,'verification_note_required');const order=await c.rpc('adult_decide_order',{p_order_id:c.uuid(b.id),p_approve:b.action==='approve',p_receipt:receipt,p_note:note,p_actor:actor});return c.reply(200,{ok:true,order})}
 if(b.action==='revoke'){const note=String(b.note||'').trim();if(note.length<5||note.length>500)c.fail(400,'verification_note_required');await c.rpc('adult_revoke_entitlement',{p_order_id:c.uuid(b.id),p_note:note,p_actor:actor});return c.reply(200,{ok:true})}

 if(b.action==='report')return c.reply(200,{ok:true,report:await c.rpc('adult_dashboard_report',{})});
 if(b.action==='recoveries'){const recoveries=await c.db('adult_reset_requests?resolved_at=is.null&select=member_id,requested_at,adult_members(phone,name)&order=requested_at.asc&limit='+limit+'&offset='+offset);return c.reply(200,{ok:true,recoveries,next_offset:recoveries.length===limit?offset+limit:null})}
 if(b.action==='reset-password'){
  if(b.confirmed_owner!==true)c.fail(400,'owner_verification_required');const note=String(b.note||'').trim();if(note.length<5||note.length>500)c.fail(400,'verification_note_required');
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
 if(b.action==='settings')return c.reply(200,{ok:true,payment:c.payment(),cms_url:c.origin()+'/admin.html'});
 c.fail(400,'invalid_action');
},{admin:true});
