'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),path=require('node:path');
async function setup(t,request){
 const previous={localStorage:global.localStorage,request:global.__bulkCtaRequest},saved=new Map();
 global.localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};global.__bulkCtaRequest=request;
 t.after(()=>{global.localStorage=previous.localStorage;global.__bulkCtaRequest=previous.request});
 const source=readFileSync(path.join(__dirname,'../public/bulk-cta.js'),'utf8').replace(/^import[^\n]+/,'const mediaRequest=globalThis.__bulkCtaRequest;');
 const module=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// '+Math.random()).toString('base64'));
 return {module,saved};
}
test('global CTA traverses all catalog pages, includes existing previews and reports skips',async t=>{
 const calls=[];const {module,saved}=await setup(t,async request=>{
  calls.push(request);
  if(request.action==='audio-cta-catalog')return request.offset?{stories:[{id:'same'},{id:'empty'}],next_offset:null}:{stories:[{id:'existing',title:'Existing preview'}],next_offset:100};
  if(request.action==='audio-cta-apply')return request.story_id==='existing'?{job:{id:'job'}}:{skipped:true,reason:request.story_id==='same'?'unchanged':'no_preview'};
  if(request.action==='audio-crop-status')return {job:{status:'ready'}};
  if(request.action==='audio-preview-cleanup')return {deleted:0};throw Error('unexpected');
 });
 let complete=0;const status={textContent:''},bulk=module.createBulkCta({status,onDone:async()=>complete++});
 await bulk.apply({ctaUrl:'cta',gap:1.5});
 assert.deepEqual(calls.filter(row=>row.action==='audio-cta-apply').map(row=>row.story_id),['existing','same','empty']);
 assert.equal(complete,1);assert.equal(saved.size,0);assert.match(status.textContent,/3\/3/);
});
test('interrupted dispatch resumes from the persisted story rather than restarting completed work',async t=>{
 let disconnected=true,applied=0;
 const {module,saved}=await setup(t,async request=>{
  if(request.action==='audio-cta-catalog')return {stories:[{id:'existing'}],next_offset:null};
  if(request.action==='audio-cta-apply'){applied++;if(disconnected)throw Error('network');return {job:{id:'job'}}}
  if(request.action==='audio-crop-status')return {job:{status:'ready'}};
  if(request.action==='audio-preview-cleanup')return {deleted:0};throw Error('unexpected');
 });
 const bulk=module.createBulkCta({status:{textContent:''}});await bulk.apply({ctaUrl:'cta',gap:1.5});assert.equal(saved.size,1);
 disconnected=false;await bulk.resume();assert.equal(applied,2);assert.equal(saved.size,0);
});

test('malformed saved queue does not crash admin startup',async t=>{
 let calls=0;const {module,saved}=await setup(t,async()=>{calls++;throw Error('Must not call backend')});
 saved.set('adult_bulk_cta_v1',JSON.stringify({items:null,failed:null}));
 await module.createBulkCta({status:{textContent:''}}).resume();assert.equal(calls,0);assert.equal(saved.size,0);
});
test('blocked browser storage does not prevent a global CTA update',async t=>{
 const {module}=await setup(t,async request=>{
  if(request.action==='audio-cta-catalog')return {stories:[{id:'story'}],next_offset:null};
  if(request.action==='audio-cta-apply')return {skipped:true,reason:'unchanged'};
  if(request.action==='audio-preview-cleanup')return {deleted:0};throw Error('unexpected');
 });
 global.localStorage.setItem=()=>{throw Error('QuotaExceeded')};global.localStorage.removeItem=()=>{throw Error('SecurityError')};
 const status={textContent:''};await module.createBulkCta({status}).apply({ctaUrl:'cta',gap:1.5});assert.match(status.textContent,/1\/1/);assert.match(status.textContent,/Табыг хаахгүй/);
});
test('temporary backend outage pauses the current story without marking the whole catalog failed',async t=>{
 const {module,saved}=await setup(t,async request=>{
  if(request.action==='audio-cta-catalog')return {stories:[{id:'one'},{id:'two'}],next_offset:null};
  throw Object.assign(Error('offline'),{code:'database_unavailable'});
 });
 await module.createBulkCta({status:{textContent:''}}).apply({ctaUrl:'cta',gap:1.5});
 const task=JSON.parse(saved.get('adult_bulk_cta_v1'));assert.equal(task.index,0);assert.deepEqual(task.failed,[]);
});
