'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
test('a change made while a save is in flight is automatically sent after the first request',async()=>{
 const saved={window:global.window,document:global.document,localStorage:global.localStorage,setInterval:global.setInterval};
 const store=new Map(),calls=[];let release,second;
 const receivedSecond=new Promise(resolve=>second=resolve);
 try{
  global.window={addEventListener(){}};global.document={visibilityState:'visible'};
  global.localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
  global.__libraryRequest=async(action,values)=>{
   if(!values)return {rows:[]};calls.push(values);
   if(calls.length===1)return new Promise(resolve=>release=()=>resolve({row:{story_id:'story-a',saved:true,revision:1}}));
   second();return {row:{story_id:'story-a',saved:values.patch.saved,revision:2}};
  };
  const source=readFileSync(path.join(__dirname,'../public/member-library.js'),'utf8').replace(/^import[^\n]+/,'const memberRequest=globalThis.__libraryRequest;');
  const {createLibrary}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  global.setInterval=()=>0;const library=createLibrary();global.setInterval=saved.setInterval;
  await library.setUser({id:'member-a'});library.patch('story-a',{saved:true});const first=library.flush();
  library.patch('story-a',{saved:false});
  await new Promise(resolve=>setTimeout(resolve,1000));release();await first;
  let timer;await Promise.race([receivedSecond,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Latest saved state was never synchronized')),2500)})]).finally(()=>clearTimeout(timer));
  await Promise.resolve();await Promise.resolve();
  assert.equal(calls.length,2);assert.equal(calls[1].patch.saved,false);assert.equal(calls[1].revision,1);assert.equal(library.get('story-a').saved,false);
 }finally{Object.assign(global,saved);delete global.__libraryRequest}
});
