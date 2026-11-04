'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
class Element{
 constructor(){this.children=[];this.dataset={};this.handlers={};this.value='';this.open=false;this.hidden=false;this.textContent=''}
 addEventListener(name,handler){this.handlers[name]=handler}
 querySelector(selector){return (this.parts??={})[selector]??=new Element()}
 append(child){this.children.push(child)}
 replaceChildren(){this.children=[]}
 showModal(){this.open=true}close(){this.open=false;this.handlers.close?.()}
 focus(){}
}
async function setup(t,request){
 const nodes=new Map(),get=s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s)};
 const cta=new Element();cta.dataset.r2Kind='cta';
 const previous={document:global.document,stub:global.__r2PickerTest};
 global.document={querySelector:get,querySelectorAll:()=>[cta],createElement:()=>new Element()};
 global.__r2PickerTest={mediaRequest:request,mergeMedia:async()=>({}),safeUrl:v=>v};
 t.after(()=>{global.document=previous.document;global.__r2PickerTest=previous.stub});
 const source=readFileSync(path.join(__dirname,'../public/r2-media.js'),'utf8').replace(/^import[^\n]+/,"const {mediaRequest,mergeMedia,safeUrl}=globalThis.__r2PickerTest;");
 const module=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// '+Math.random()).toString('base64'));
 const selections=[];module.mountR2({reload:async()=>{},toast:()=>{},editorToken:()=>1,onAudio:(...args)=>selections.push(args)});
 return {get,cta,selections};
}
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))};
test('CTA picker traverses private and public pages, includes previews and M4A, and selects the stable reference',async t=>{
 const calls=[];
 const {get,cta,selections}=await setup(t,async payload=>{
  calls.push(payload);
  if(payload.action==='audio-list')return {items:[{key:'outro.m4a',reference:'https://private/outro.m4a',bytes:100}],next_cursor:null};
  return payload.cursor?{items:[{key:'CTA.wav',reference:'https://public/CTA.wav'}],next_cursor:null}:{items:[{key:'audio-preview/a.mp3',reference:'https://public/audio-preview/a.mp3'}],next_cursor:'next'};
 });
 cta.onclick();await settle();
 assert.deepEqual(calls.map(v=>[v.action,v.cursor]),[['audio-list',''],['preview-list',''],['preview-list','next']]);
 const list=get('#r2AudioList');assert.equal(list.children.length,3);assert.equal(get('#r2AudioMore').hidden,true);
 assert.equal(get('#r2AudioStatus').textContent,'Файлын нэр дээр дарж сонгоно уу.');
 get('#r2AudioSearch').value='outro';get('#r2AudioSearch').handlers.input();
 assert.deepEqual(list.children.map(v=>v.hidden),[false,true,true]);
 list.children[0].handlers.click();assert.deepEqual(selections,[['https://private/outro.m4a','cta']]);
});
test('CTA picker still opens the public library when no private audio bucket is configured',async t=>{
 const {get,cta}=await setup(t,async payload=>{
  if(payload.action==='audio-list')throw Object.assign(Error('localized message'),{code:'r2_audio_not_configured'});
  return {items:[{key:'CTA.mp3',reference:'https://public/CTA.mp3'}]};
 });
 cta.onclick();await settle();assert.equal(get('#r2AudioList').children.length,1);
 assert.equal(get('#r2AudioStatus').textContent,'Файлын нэр дээр дарж сонгоно уу.');
});
