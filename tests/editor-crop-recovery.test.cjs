'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{readFileSync}=require('node:fs'),path=require('node:path');
test('a completed preview remains resumable after saving fails and is forgotten only after a successful save',async()=>{
 const source=readFileSync(path.join(__dirname,'../public/admin.js'),'utf8');
 const begin=source.indexOf('async function pollAudioCrop('),end=source.indexOf('\nfunction resumeAudioCrop(',begin);
 assert.ok(begin>=0&&end>begin);
 const id='123e4567-e89b-12d3-a456-426614174000',job={id:'223e4567-e89b-12d3-a456-426614174000',configuration:{reference:'full',start:0,end:25,ctaUrl:'cta',ctaGap:1.5}},memory=new Map([['adult_audio_crop_'+id,JSON.stringify(job)]]),nodes=new Map();
 let canSave=false,requests=0,saves=0;const alerts=[];
 const context={editing:{id},cropApplying:new Set(),cropPollTimer:null,cropJobId:job.id,segmentStatus:{textContent:''},storyOverlay:{},
  clearTimeout, setTimeout:()=>{throw Error('Unexpected polling retry')},
  localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
  $:selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',textContent:''});return nodes.get(selector)},
  decodeCropJob:raw=>raw?JSON.parse(raw):null,cropConfigurationMatches:()=>true,currentCropConfiguration:()=>job.configuration,
  previewResultComplete:()=>true,syncCtaAudio:()=>{},markStory:()=>{},cropError:code=>code,toast:text=>alerts.push(text),
  mediaRequest:async()=>{requests++;return {job:{status:'ready',preview_url:'combined.mp3',start_seconds:0,end_seconds:25,duration_seconds:31.5}}},
  saveStoryAction:async()=>{saves++;await context.pollAudioCrop(job,id);return canSave?id:null}
 };
 vm.createContext(context);new vm.Script(source.slice(begin,end)).runInContext(context);
 await context.pollAudioCrop(job,id);
 assert.equal(memory.has('adult_audio_crop_'+id),true);assert.equal(JSON.parse(memory.get('adult_audio_crop_'+id)).completedPreview,'combined.mp3');assert.equal(context.cropApplying.size,0);assert.equal(requests,1);assert.equal(saves,1);assert.ok(alerts.some(text=>text.includes('хадгалагдсангүй')));
 canSave=true;await context.pollAudioCrop(job,id);
 assert.equal(memory.has('adult_audio_crop_'+id),false);assert.equal(context.cropApplying.size,0);assert.equal(requests,2);assert.equal(saves,2);
});
