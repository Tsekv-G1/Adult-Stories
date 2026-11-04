'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const file=name=>readFileSync(path.resolve(__dirname,'..',name),'utf8');

test('paid story full-audio URLs fail closed unless they are signed private references',async()=>{
 const r2Id=require.resolve('../server/r2.cjs'),old=require.cache[r2Id],oldSupabase=process.env.SUPABASE_URL;
 require.cache[r2Id]={id:r2Id,filename:r2Id,loaded:true,exports:{privatePath:raw=>raw==='https://private.r2.audio/pay.mp3'?'pay.mp3':null,signedAudio:async()=> 'https://signed.r2.audio/pay.mp3?token=shortlived'}};
 process.env.SUPABASE_URL='https://sample.supabase.co';
 try{
  const audio=require('../server/audio.cjs');
  assert.deepEqual(await audio.resolveForStory('https://pub-123.r2.dev/paid.mp3',{paid:true}),{url:'',migrationRequired:true});
  assert.deepEqual(await audio.resolveForStory('https://pub-123.r2.dev/free.mp3',{paid:false}),{url:'https://pub-123.r2.dev/free.mp3',migrationRequired:false});
  assert.deepEqual(await audio.resolveForStory('https://private.r2.audio/pay.mp3',{paid:true}),{url:'https://signed.r2.audio/pay.mp3?token=shortlived',migrationRequired:false});
  assert.deepEqual(await audio.resolveForStory('',{paid:true}),{url:'',migrationRequired:false});
 }finally{
  if(old)require.cache[r2Id]=old;else delete require.cache[r2Id];
  if(oldSupabase===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldSupabase;
 }
});

test('server access is checked before paid story body or signed audio',()=>{
 const source=file('netlify/functions/member.js');
 assert.match(source,/if\(s\.price>0&&!await c\.access\(u\.id,id\)\)c\.fail\(403,'access_required'\)/);
 assert.match(source,/audio\.resolveForStory\(body\.full_audio_url,\{paid:Number\(s\.price\)>0\}\)/);
 assert.match(source,/audio_expires_at:privateReference&&body\.full_audio_url/);
});

test('R2 private references cannot use the public media bucket',()=>{
 const source=file('server/r2.cjs');
 assert.match(source,/if\(audio===bucket\)c\.fail\(503,'r2_buckets_must_differ'\)/);
 assert.match(source,/if\(!process\.env\.R2_AUDIO_BUCKET\)return null/);
 assert.match(source,/const prefix='\/'\+s\.audio\+'\/'/);
 assert.match(file('public/admin.js'),/private R2 audio bucket/);
});

test('billing tables remain RLS-only and server role-only in hardening migration',()=>{
 const sql=file('supabase/013_security_hardening.sql');
 for(const table of ['adult_members','adult_sessions','adult_payment_orders','adult_entitlements','adult_audit','adult_rate_limits','adult_first_purchase_redemptions','adult_audio_crop_jobs']){
  assert.ok(sql.includes(`public.${table}`));
  assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
 }
 assert.match(sql,/from public, anon, authenticated/);
 assert.match(sql,/to service_role/);
});

test('transfer reporting can only advance pending orders once, with member ownership and rate limit',()=>{
 const source=file('netlify/functions/member.js');
 assert.match(source,/await c\.rate\(e,'payment-report',8,900,u\.id\)/);
 assert.match(source,/member_id=eq\.'\+u\.id\+'\&status=eq\.pending\&payment_reported_at=is\.null/);
 assert.match(source,/already_reported:true/);
 assert.match(source,/notifyPayment\(\{event:'reported',order:rows\[0\]\}\)/);
});

test('payment details show backend memo instead of an invented IBAN',()=>{
 const core=file('server/core.cjs'),checkout=file('public/checkout.js');
 assert.match(core,/process\.env\.PAYMENT_IBAN/);
 assert.doesNotMatch(core,/PAYMENT_ACCOUNT\|\|['\"]\d/);
 assert.match(checkout,/memo=String\(o\.memo\|\|''\)\.trim\(\)/);
 assert.match(checkout,/id="copyMemo"/);
 assert.doesNotMatch(checkout, /iban='18000500'/);
 assert.match(checkout,/esc\(memo\)/);
});

test('order creation fails closed before RPC when operator bank env is missing',()=>{
 const member=file('netlify/functions/member.js');
 assert.match(member,/if\(!bank\.bank\|\|!bank\.account\|\|!bank\.name\)c\.fail\(503,'payment_not_configured'\)/);
 assert.ok(member.indexOf("payment_not_configured")<member.indexOf("c.rpc('adult_create_order'"));
});

test('approval RPC repairs invalid SQL, serializes payments, and prevents intro-offer reuse',()=>{
 const sql=file('supabase/013_security_hardening.sql');
 const rpc=sql.slice(sql.lastIndexOf('create or replace function public.adult_decide_order('));
 assert.doesNotMatch(rpc,/list_cost/);
 assert.match(rpc,/for update;/);
 assert.match(rpc,/first_purchase_offer_used/);
 assert.match(rpc,/on conflict\(member_id\) do nothing/);
 assert.match(rpc,/if o.status='approved' and p_approve then return to_jsonb\(o\)/);
 assert.match(rpc,/grant execute on function public.adult_decide_order/);
});

test('deployment prevents third-party framing and forces HTTPS transport policy',()=>{
 const config=file('netlify.toml');
 assert.match(config,/X-Frame-Options = "SAMEORIGIN"/);
 assert.match(config,/Strict-Transport-Security = "max-age=31536000"/);
 assert.match(config,/Permissions-Policy = "camera=\(\), microphone=\(\), geolocation=\(\)"/);
});
