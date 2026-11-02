const c=require('../../server/core.cjs');
exports.handler=c.endpoint(['GET','POST'],async e=>{
 const b=e.httpMethod==='POST'?c.body(e):{},action=e.httpMethod==='GET'?(e.queryStringParameters?.action||'me'):b.action;
 if(e.httpMethod==='POST'&&action==='track'){
  await c.rate(e,'story-activity',90,900);
  const storyId=c.uuid(b.story_id),event=String(b.event||''),viewerId=String(b.viewer_id||'');
  if(!['read','listen'].includes(event)||!/^([a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})$/i.test(viewerId))c.fail(400,'invalid_activity');
  const day=new Date().toISOString().slice(0,10),secret=c.config('SUPABASE_SERVICE_ROLE_KEY');
  const viewerHash=require('node:crypto').createHmac('sha256',secret).update(`adult-story-v1:${day}:${event}:${viewerId}`).digest('hex');
  const recorded=await c.rpc('adult_record_story_activity',{p_story_id:storyId,p_event_type:event,p_viewer_hash:viewerHash});
  return c.reply(200,{ok:true,recorded:recorded===true});
 }
 if(e.httpMethod==='GET'&&action==='stats'){
  await c.rate(e,'story-metrics',90,60);
  const raw=String(e.queryStringParameters?.ids||'').split(',').filter(Boolean).slice(0,40),ids=[...new Set(raw.map(c.uuid))];
  if(!ids.length)c.fail(400,'invalid_activity');
  const since=new Date(Date.now()-29*86400000).toISOString().slice(0,10);
  const metrics=await c.rpc('adult_story_metrics',{p_story_ids:ids,p_since:since});
  return c.reply(200,{ok:true,metrics:Array.isArray(metrics)?metrics:[]});
 }
 if(e.httpMethod==='POST'&&['register','login'].includes(action)){
  await c.rate(e,action,action==='register'?8:40);const phone=c.phone(b.phone);if(action==='login')await c.rate(e,'login-phone',15,900,phone);let row;
  if(action==='register'){const digest=await c.passwordHash(b.password);row=(await c.db('adult_members',{method:'POST',data:{phone,name:String(b.name||'').trim().slice(0,80),password_hash:digest},prefer:'return=representation'}))[0]}
  else{row=(await c.db('adult_members?phone=eq.'+encodeURIComponent(phone)+'&select=id,phone,name,status,password_hash&limit=1'))?.[0];if(!await c.matches(b.password,row?.password_hash)||row.status!=='active')c.fail(401,'invalid_credentials')}
  return c.reply(action==='register'?201:200,{ok:true,user:{id:row.id,phone:row.phone,name:row.name}},{'Set-Cookie':await c.newSession(row.id,row.password_hash)});
 }
 if(e.httpMethod==='POST'&&action==='logout'){const token=c.sessionToken(e);if(token)await c.db('adult_sessions?token_hash=eq.'+c.hash(token),{method:'DELETE'});return c.reply(200,{ok:true},{'Set-Cookie':c.cookie('',0)})}

 if(e.httpMethod==='POST'&&action==='request-reset'){
  await c.rate(e,'reset-ip',6);const phone=c.phone(b.phone);await c.rate(e,'reset-phone',3,3600,phone);
  await c.rpc('adult_request_reset',{p_phone:phone});return c.reply(200,{ok:true,message:'request_received'});
 }
 const u=await c.auth(e);
 if(e.httpMethod==='GET'&&action==='library'){const rows=await c.db('adult_library?member_id=eq.'+u.id+'&select=story_id,saved,read_fraction,audio_seconds,audio_duration,audio_kind,revision,updated_at&order=updated_at.desc&limit=1000');return c.reply(200,{ok:true,rows})}
 if(e.httpMethod==='POST'&&action==='library'){
  await c.rate(e,'library',240,900,u.id);const patch={};if(b.patch?.saved!==undefined){if(typeof b.patch.saved!=='boolean')c.fail(400,'invalid_progress');patch.saved=b.patch.saved}
  for(const [key,max]of [['read_fraction',1],['audio_seconds',864000],['audio_duration',864000]])if(b.patch?.[key]!==undefined){const v=b.patch[key];if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)c.fail(400,'invalid_progress');patch[key]=v}
  if(b.patch?.audio_kind!==undefined){if(!['preview','full'].includes(b.patch.audio_kind))c.fail(400,'invalid_progress');patch.audio_kind=b.patch.audio_kind}
  if(!Object.keys(patch).length||!Number.isSafeInteger(b.revision)||b.revision<0)c.fail(400,'invalid_progress');
  return c.reply(200,{ok:true,...await c.rpc('adult_library_patch',{p_member:u.id,p_story:c.uuid(b.id),p_revision:b.revision,p_patch:patch})});
 }
 if(e.httpMethod==='POST'&&action==='change-password'){
  await c.rate(e,'password-change',8,900,u.id);const row=(await c.db('adult_members?id=eq.'+u.id+'&select=password_hash&limit=1'))[0];if(!await c.matches(b.current_password,row.password_hash))c.fail(401,'invalid_credentials');
  const digest=await c.passwordHash(b.password);await c.rpc('adult_change_password',{p_member:u.id,p_expected:row.password_hash,p_hash:digest});return c.reply(200,{ok:true},{'Set-Cookie':await c.newSession(u.id,digest)});
 }

 if(e.httpMethod==='GET'&&action==='me'){const [orders,entitlements]=await Promise.all([c.db('adult_payment_orders?member_id=eq.'+u.id+'&select=id,kind,story_id,membership_days,amount,status,memo,payment_reported_at,created_at&order=created_at.desc&limit=50'),c.db('adult_entitlements?member_id=eq.'+u.id+'&revoked_at=is.null&select=id,story_id,membership_days,expires_at,created_at,stories(title)&order=created_at.desc&limit=100')]);return c.reply(200,{ok:true,user:{id:u.id,phone:u.phone,name:u.name},orders,entitlements,payment:c.payment()})}
 if(e.httpMethod==='GET'&&action==='body'){const id=c.uuid(e.queryStringParameters?.id),s=(await c.db('stories?id=eq.'+id+'&status=eq.published&select=id,price,publish_at&limit=1'))?.[0];if(!s||(s.publish_at&&Date.parse(s.publish_at)>Date.now()))c.fail(404,'story_unavailable');if(s.price>0&&!await c.access(u.id,id))c.fail(403,'access_required');const rows=await c.db('story_private?story_id=eq.'+id+'&select=story_id,full_text,full_audio_url&limit=1');const body=rows?.[0]||{story_id:id,full_text:'',full_audio_url:''};const audio=require('../../server/audio.cjs');const privateReference=!!audio.path(body.full_audio_url);try{body.full_audio_url=await audio.resolve(body.full_audio_url)}catch{body.full_audio_url='';body.audio_unavailable=true}return c.reply(200,{ok:true,body,audio_expires_at:privateReference&&body.full_audio_url?new Date(Date.now()+900000).toISOString():null,audio_migration_required:false})}
 if(e.httpMethod==='POST'&&action==='order'){await c.rate(e,'order',10);if(!['story','membership'].includes(b.kind))c.fail(400,'invalid_order');const days=b.kind==='membership'?Number(b.membership_days||30):null;if(b.kind==='membership'&&![7,30].includes(days))c.fail(400,'invalid_order');const order=await c.rpc('adult_create_order',{p_member_id:u.id,p_kind:b.kind,p_story_id:b.kind==='story'?c.uuid(b.story_id):null,p_client_id:c.uuid(b.client_id),p_membership_days:days});return c.reply(200,{ok:true,order,payment:c.payment()})}
 if(e.httpMethod==='POST'&&action==='report'){const receipt=String(b.receipt||'').trim();if(receipt.length<4||receipt.length>120)c.fail(400,'receipt_required');const rows=await c.db('adult_payment_orders?id=eq.'+c.uuid(b.id)+'&member_id=eq.'+u.id+'&status=eq.pending&select=id,kind,amount',{method:'PATCH',data:{customer_reference:receipt,payment_reported_at:new Date().toISOString()},prefer:'return=representation'});if(!rows?.length)c.fail(409,'order_not_pending');await require('../../server/telegram.cjs').notifyPayment({event:'reported',order:rows[0]});return c.reply(200,{ok:true})}
 c.fail(400,'invalid_action');
});
