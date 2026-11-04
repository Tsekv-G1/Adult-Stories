'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
let r2;
try{r2=require('../server/r2.cjs')}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error}

test('trimmed public preview can be signed without enabling a private audio bucket',{skip:!r2?'AWS SDK dependencies are not installed in this local workspace':false},async()=>{
 const names=['R2_ACCOUNT_ID','R2_ENDPOINT','R2_MEDIA_BUCKET','R2_AUDIO_BUCKET','R2_PUBLIC_BASE_URL','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'];
 const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 Object.assign(process.env,{R2_ACCOUNT_ID:'a'.repeat(32),R2_MEDIA_BUCKET:'adultstories',R2_AUDIO_BUCKET:'',R2_PUBLIC_BASE_URL:'https://media.example.com',R2_ACCESS_KEY_ID:'test-access-key',R2_SECRET_ACCESS_KEY:'test-secret-access-key'});
 delete process.env.R2_ENDPOINT;
 try{
  const target=await r2.audioPreviewTarget('123e4567-e89b-12d3-a456-426614174000');
  assert.match(target.url,/^https:\/\/media\.example\.com\/audio-preview\/123e4567-e89b-12d3-a456-426614174000\/[a-f0-9-]+\.mp3$/);
  assert.match(target.put_url,/X-Amz-Signature=/);
 }finally{
  for(const name of names){if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name]}
 }
});

test('preview picker lists only public audio and keeps the private library separate',async t=>{
 const sdk=require('@aws-sdk/client-s3');
 const names={R2_ACCOUNT_ID:'a'.repeat(32),R2_ENDPOINT:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',R2_MEDIA_BUCKET:'public-media',R2_AUDIO_BUCKET:'private-audio',R2_PUBLIC_BASE_URL:'https://media.example.com',R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test'};
 const before={...process.env};Object.assign(process.env,names);
 t.after(()=>{for(const k of Object.keys(names)){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k]}});
 const calls=[];
 t.mock.method(sdk.S3Client.prototype,'send',async command=>{
  calls.push(command.input);
  return {Contents:[{Key:'folder/санал 1.mp3',Size:1024},{Key:'photo.jpg'},{Key:'../bad.mp3'}],IsTruncated:true,NextContinuationToken:'next'};
 });
 const page=await r2.list({publicAudio:true,cursor:'cursor'});
 assert.equal(calls[0].Bucket,'public-media');assert.equal(calls[0].ContinuationToken,'cursor');
 assert.equal(page.next_cursor,'next');assert.equal(page.items.length,1);
 assert.equal(page.items[0].reference,'https://media.example.com/folder/'+encodeURIComponent('санал 1.mp3'));
 const full=await r2.list({audio:true});assert.equal(calls[1].Bucket,'private-audio');
 assert.ok(full.items[0].reference.startsWith(names.R2_ENDPOINT+'/private-audio/'));
});

test('CTA picker excludes generated previews while full picker retains private originals',async t=>{
 const sdk=require('@aws-sdk/client-s3');
 const names={R2_ACCOUNT_ID:'a'.repeat(32),R2_MEDIA_BUCKET:'public-media',R2_AUDIO_BUCKET:'private-audio',R2_PUBLIC_BASE_URL:'https://media.example.com',R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test'};
 const before=Object.fromEntries(Object.keys(names).map(key=>[key,process.env[key]]));Object.assign(process.env,names);
 t.after(()=>{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value}});
 t.mock.method(sdk.S3Client.prototype,'send',async command=>({Contents:command.input.Bucket==='private-audio'?[{Key:'Зүүд.m4a',Size:4000000},{Key:'generated/full.mp3',Size:9000000}]:[{Key:'audio-preview/story/clip.mp3',Size:500000},{Key:'CTA.mp3',Size:900000},{Key:'Зураг.jpg',Size:1000}]}));
 const cta=await r2.list({publicAudio:true,publicKind:'cta'});
 assert.deepEqual(cta.items.map(item=>item.filename),['CTA.mp3']);
 assert.equal(cta.items[0].reference,'https://media.example.com/CTA.mp3');
 const full=await r2.list({audio:true});
 assert.deepEqual(full.items.map(item=>item.filename),['Зүүд.m4a','full.mp3']);
 assert.ok(full.items.every(item=>item.reference.includes('/private-audio/')));
});
