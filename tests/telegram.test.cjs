'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {notifyPayment,notifyRegistration}=require('../server/telegram.cjs');

const saved={token:process.env.TELEGRAM_BOT_TOKEN,chat:process.env.TELEGRAM_CHAT_ID,fetch:global.fetch};
function restore(){if(saved.token===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=saved.token;if(saved.chat===undefined)delete process.env.TELEGRAM_CHAT_ID;else process.env.TELEGRAM_CHAT_ID=saved.chat;global.fetch=saved.fetch}
test.afterEach(restore);

test('Telegram is optional when server credentials are not configured',async()=>{
 delete process.env.TELEGRAM_BOT_TOKEN;delete process.env.TELEGRAM_CHAT_ID;let called=false;global.fetch=async()=>{called=true};
 assert.equal(await notifyPayment({event:'reported',order:{id:'12345678-abcd',kind:'story',amount:9900}}),false);
 assert.equal(called,false);
});

test('payment report identifies the payer without exposing the order ID or bank references',async()=>{
 process.env.TELEGRAM_BOT_TOKEN='test-only-token';process.env.TELEGRAM_CHAT_ID='test-chat';let request;
 global.fetch=async(url,options)=>{request={url,options};return{ok:true}};
 assert.equal(await notifyPayment({event:'reported',order:{id:'12345678-abcd',kind:'membership',amount:29900,customer_reference:'PRIVATE-REF',password_hash:'SECRET-HASH'},member:{name:'Бат',phone:'+97699112233'}}),true);
 assert.match(request.url,/api\.telegram\.org\/bottest-only-token\/sendMessage/);
 const body=JSON.parse(request.options.body);
 assert.equal(body.chat_id,'test-chat');assert.match(body.text,/29,900₮/);
 assert.match(body.text,/Нэр: Бат/);assert.match(body.text,/Утас: 99112233/);
 assert.doesNotMatch(body.text,/PRIVATE-REF|12345678|Захиалга:|SECRET-HASH/);
});

test('Telegram payment notices show the selected membership duration',async()=>{
 process.env.TELEGRAM_BOT_TOKEN='test-only-token';process.env.TELEGRAM_CHAT_ID='test-chat';let text='';global.fetch=async(_url,options)=>{text=JSON.parse(options.body).text;return{ok:true}};
 assert.equal(await notifyPayment({event:'reported',order:{id:'87654321-abcd',kind:'membership',membership_days:7,amount:9900}}),true);
 assert.match(text,/7 хоногийн эрх/);assert.match(text,/9,900₮/);
});

test('Telegram errors are best effort and do not reject payment action callers',async()=>{
 process.env.TELEGRAM_BOT_TOKEN='test-only-token';process.env.TELEGRAM_CHAT_ID='test-chat';global.fetch=async()=>{throw Error('network failure')};
 assert.equal(await notifyPayment({event:'approved',order:{id:'12345678-abcd',kind:'story',amount:9900}}),false);
});

test('successful member registration sends a minimal server-side notice without a password',async()=>{
 process.env.TELEGRAM_BOT_TOKEN='test-only-token';process.env.TELEGRAM_CHAT_ID='test-chat';let request;
 global.fetch=async(url,options)=>{request={url,options};return{ok:true}};
 assert.equal(await notifyRegistration({member:{name:'Test Member',phone:'+97688748966',password_hash:'must-not-be-sent'}}),true);
 assert.match(request.url,/api\.telegram\.org\/bottest-only-token\/sendMessage/);
 const body=JSON.parse(request.options.body);
 assert.equal(body.chat_id,'test-chat');assert.match(body.text,/Шинэ хэрэглэгч бүртгүүллээ/);
 assert.match(body.text,/88748966/);assert.match(body.text,/Test Member/);
 assert.doesNotMatch(body.text,/must-not-be-sent/);
});

test('unknown notification events are ignored',async()=>{
 process.env.TELEGRAM_BOT_TOKEN='test-only-token';process.env.TELEGRAM_CHAT_ID='test-chat';let called=false;global.fetch=async()=>{called=true};
 assert.equal(await notifyPayment({event:'signup',order:{id:'12345678-abcd',kind:'story',amount:9900}}),false);
 assert.equal(called,false);
});


test('approval and rejection look up the payer using only member name and phone',async t=>{
 process.env.TELEGRAM_BOT_TOKEN='test-only-token';process.env.TELEGRAM_CHAT_ID='test-chat';
 const core=require('../server/core.cjs'),queries=[],messages=[];
 const memberId='123e4567-e89b-12d3-a456-426614174000';
 t.mock.method(core,'db',async query=>{queries.push(query);return [{name:'Энхжин',phone:'+97688748966'}]});
 global.fetch=async(_url,options)=>{messages.push(JSON.parse(options.body).text);return {ok:true}};
 for(const event of ['approved','rejected'])assert.equal(await notifyPayment({event,order:{id:'b8d24df0-abcd',member_id:memberId,kind:'membership',membership_days:30,amount:24900,bank_reference:'PRIVATE-BANK-REF'}}),true);
 assert.equal(queries.length,2);assert.equal(queries[0],'adult_members?id=eq.'+memberId+'&select=name,phone&limit=1');
 for(const text of messages){assert.match(text,/Нэр: Энхжин/);assert.match(text,/Утас: 88748966/);assert.match(text,/24,900₮/);assert.doesNotMatch(text,/b8d24df0|PRIVATE-BANK-REF|Захиалга:/)}
});

test('names cannot add fake lines to Telegram notices and international phone numbers remain complete',async()=>{
 process.env.TELEGRAM_BOT_TOKEN='test-only-token';process.env.TELEGRAM_CHAT_ID='test-chat';let text;
 global.fetch=async(_url,options)=>{text=JSON.parse(options.body).text;return {ok:true}};
 await notifyPayment({event:'reported',order:{id:'b8d24df0',kind:'membership',membership_days:7,amount:9900},member:{name:'  Бат\n  <Тест>  ',phone:'+821012345678'}});
 assert.match(text,/Нэр: Бат Тест\nУтас: \+821012345678/);assert.match(text,/7 хоногийн эрх/);assert.doesNotMatch(text,/b8d24df0/);
});

test('member lookup failure never prevents an already approved payment from completing',async t=>{
 process.env.TELEGRAM_BOT_TOKEN='test-only-token';process.env.TELEGRAM_CHAT_ID='test-chat';
 const core=require('../server/core.cjs');t.mock.method(core,'db',async()=>{throw Error('database unavailable')});
 global.fetch=async()=>({ok:true});
 assert.equal(await notifyPayment({event:'approved',order:{id:'order',member_id:'123e4567-e89b-12d3-a456-426614174000',kind:'membership',amount:24900}}),true);
});
