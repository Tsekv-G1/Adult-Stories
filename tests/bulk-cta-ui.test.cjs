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
