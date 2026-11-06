'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const baseId=crypto.randomUUID(),orderId=crypto.randomUUID(),storyId=crypto.randomUUID();

function withMocks(fake,fn){
 const coreId=require.resolve('../server/core.cjs'),telegramId=require.resolve('../server/telegram.cjs'),memberId=require.resolve('../netlify/functions/member.js');
 const originals=new Map([[coreId,require.cache[coreId]],[telegramId,require.cache[telegramId]],[memberId,require.cache[memberId]]]);
 for(const [id,exports] of [[coreId,fake.core],[telegramId,fake.telegram]])require.cache[id]={id,filename:id,loaded:true,exports};
 delete require.cache[memberId];
 const handler=require('../netlify/functions/member.js').handler;
 return Promise.resolve().then(()=>fn(handler)).finally(()=>{for(const [id,value] of originals){if(value)require.cache[id]=value;else delete require.cache[id]}});
}
function memberCore(db,extra={}){
 const calls=[];
 return {calls,core:{endpoint:(_methods,handler)=>handler,body:e=>JSON.parse(e.body),auth:async()=>({id:baseId}),rate:async(...args)=>calls.push(['rate',...args]),uuid:v=>v,db:async(...args)=>db(...args),reply:(code,payload)=>({statusCode:code,body:JSON.stringify(payload)}),fail:(code,text)=>{const e=new Error(text);e.status=code;throw e;},payment:()=>({bank:'',account:'',name:''}),...extra}}
}

test('first payment report records once and notifies once; retry does not spam Telegram',async()=>{
 let reported=false,notifications=0,updates=0,notice;
 const payer={id:baseId,name:'Энхжин',phone:'+97699112233'};
 const mock=memberCore(async(path,opts)=>{
  if(opts?.method==='PATCH'){
   updates++;assert.match(path,/payment_reported_at=is\.null/);assert.match(path,/membership_days/);
   if(reported)return [];
   reported=true;return [{id:orderId,member_id:baseId,kind:'membership',membership_days:7,amount:1000}];
  }
  assert.match(path,/member_id=eq\./);return [{status:'pending',payment_reported_at:'2026-11-04T00:00:00Z'}];
 },{auth:async()=>payer});
 await withMocks({core:mock.core,telegram:{notifyPayment:async payload=>{notifications++;notice=payload}}},async(handler)=>{
  const event={httpMethod:'POST',body:JSON.stringify({action:'report',id:orderId})};
  const first=await handler(event),second=await handler(event);
  assert.equal(first.statusCode,200);
  assert.equal(second.statusCode,200);
  assert.equal(JSON.parse(second.body).already_reported,true);
 });
 assert.equal(notifications,1);assert.equal(updates,2);assert.deepEqual(notice.member,payer);assert.equal(notice.order.membership_days,7);
 assert.equal(mock.calls.filter(row=>row[2]==='payment-report').length,2);
});

test('non-owner payment report never succeeds',async()=>{
 const mock=memberCore(async()=>[]);
 await withMocks({core:mock.core,telegram:{notifyPayment:async()=>{throw Error('must not notify')}}},async(handler)=>{
  await assert.rejects(handler({httpMethod:'POST',body:JSON.stringify({action:'report',id:orderId})}),error=>error.status===409&&error.message==='order_not_pending');
 });
});

test('payment order RPC is not called when bank settings have not been configured',async()=>{
 let requested=false;
 const mock=memberCore(async()=>{requested=true;throw Error('unexpected db call')});
 mock.core.rpc=async()=>{requested=true;throw Error('unexpected RPC call')};
 await withMocks({core:mock.core,telegram:{}},async(handler)=>{
  await assert.rejects(handler({httpMethod:'POST',body:JSON.stringify({action:'order',kind:'story',story_id:storyId,client_id:orderId})}),error=>error.status===503&&error.message==='payment_not_configured');
 });
 assert.equal(requested,false);
});

test('unauthorized member cannot fetch paid body and public paid audio remains hidden for owner',async()=>{
 let permitted=false,signRequests=0;
 const mock=memberCore(async(path)=>{
  if(path.startsWith('stories?'))return [{id:storyId,price:9900}];
  if(path.startsWith('story_private?'))return [{story_id:storyId,full_text:'Accessible once paid',full_audio_url:'https://pub-test.r2.dev/full-paid.mp3'}];
  throw Error('unexpected '+path);
 },{access:async()=>permitted});
 const audioId=require.resolve('../server/audio.cjs'),originalAudio=require.cache[audioId];
 require.cache[audioId]={id:audioId,filename:audioId,loaded:true,exports:{path:()=>null,resolveForStory:async(url,{paid})=>{assert.equal(paid,true);signRequests++;return {url:'',migrationRequired:true}}}};
 try{
  await withMocks({core:mock.core,telegram:{}},async(handler)=>{
   const event={httpMethod:'GET',queryStringParameters:{action:'body',id:storyId}};
   await assert.rejects(handler(event),error=>error.status===403&&error.message==='access_required');
   permitted=true;
   const response=await handler(event),body=JSON.parse(response.body);
   assert.equal(response.statusCode,200);
   assert.equal(body.body.full_audio_url,'');
   assert.equal(body.audio_migration_required,true);
   assert.equal(body.body.full_text,'Accessible once paid');
  });
 }finally{if(originalAudio)require.cache[audioId]=originalAudio;else delete require.cache[audioId]}
 assert.equal(signRequests,1);
});
