'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const c=require('../server/core.cjs'),r2=require('../server/r2.cjs'),{cleanup}=require('../server/preview-cleanup.cjs');
const id='123e4567-e89b-12d3-a456-426614174000';
test('cleanup keeps any referenced preview and only removes unreferenced old job output',async t=>{
 const deleted=[];t.mock.method(r2,'deleteGeneratedPreview',async url=>{deleted.push(url);return true});
 t.mock.method(c,'db',async(route,options)=>{
  if(options?.method==='PATCH')return [];
  if(route.includes('status=in.(queued,processing)'))return [];
  if(route.startsWith('adult_audio_crop_jobs?')){assert.match(route,/created_at=lt\./);return [{id,preview_url:'keep.mp3'},{id,preview_url:'unused.mp3'},{id,preview_url:'shared.mp3'},{id,preview_url:'source.mp3'}]}
  if(route.startsWith('stories?'))return [{audio_preview_url:'keep.mp3'}];
  if(route.startsWith('site_settings?'))return [{content:{shared_preview_url:'shared.mp3'}}];
  if(route.startsWith('story_private?'))return [{full_audio_url:'source.mp3'}];
  if(route.startsWith('media_assets?'))return [];throw Error(route);
 });
 assert.equal((await cleanup()).deleted,1);assert.deepEqual(deleted,['unused.mp3']);
});
test('cleanup defers while a render may still need its source',async t=>{
 t.mock.method(c,'db',async()=>[{id}]);t.mock.method(r2,'deleteGeneratedPreview',()=>{throw Error('Must not delete')});
 assert.deepEqual(await cleanup(),{deleted:0,deferred:true});
});
test('R2 deletion cannot remove originals, CTA files, or arbitrary bucket objects',async t=>{
 const env={R2_ACCOUNT_ID:'a'.repeat(32),R2_MEDIA_BUCKET:'public-media',R2_AUDIO_BUCKET:'private-audio',R2_PUBLIC_BASE_URL:'https://media.example.com',R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test'};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v}});
 const sdk=require('@aws-sdk/client-s3'),calls=[];t.mock.method(sdk.S3Client.prototype,'send',async command=>{calls.push(command.input);return {}});
 for(const url of ['https://media.example.com/CTA.mp3','https://media.example.com/generated/full.mp3','https://other.example.com/audio-preview/'+id+'/'+id+'.mp3'])assert.equal(await r2.deleteGeneratedPreview(url),false);
 assert.equal(calls.length,0);
 assert.equal(await r2.deleteGeneratedPreview('https://media.example.com/audio-preview/'+id+'/'+id+'.mp3'),true);assert.equal(calls[0].Bucket,'public-media');
});
