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

test('payment report sends a minimal server-side admin notice without member or bank details',async()=>{
 process.env.TELEGRAM_BOT_TOKEN='test-only-token';process.env.TELEGRAM_CHAT_ID='test-chat';let request;
 global.fetch=async(url,options)=>{request={url,options};return{ok:true}};
 assert.equal(await notifyPayment({event:'reported',order:{id:'12345678-abcd',kind:'membership',amount:29900,phone:'+97699112233',customer_reference:'PRIVATE-REF'}}),true);
 assert.match(request.url,/api\.telegram\.org\/bottest-only-token\/sendMessage/);
 const body=JSON.parse(request.options.body);
 assert.equal(body.chat_id,'test-chat');assert.match(body.text,/29,900₮/);
 assert.doesNotMatch(body.text,/PRIVATE-REF|99112233/);
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
