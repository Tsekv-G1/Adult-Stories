'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const ffmpeg=require('ffmpeg-static');
const {trimFile}=require('../server/audio-crop.cjs');
const core=require('../server/core.cjs');
const background=require('../netlify/functions/editor-audio-crop-background.js');

test('IN/OUT creates a playable MP3 preview from M4A and rejects time past the source',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'adult-crop-test-'));
 try{
  const source=path.join(root,'source.m4a'),preview=path.join(root,'preview.mp3');
  const generated=spawnSync(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=8','-c:a','aac','-y',source],{timeout:30000});
  assert.equal(generated.status,0,generated.stderr?.toString());
  const seconds=await trimFile(source,preview,2,7,{binary:ffmpeg});
  assert.ok(seconds>=4.5&&seconds<=5.5,`Expected a five-second clip, got ${seconds}`);
  const data=await readFile(preview);
  assert.ok(data.length>10000);
  assert.ok(data.subarray(0,3).toString()==='ID3'||data[0]===0xff,'Preview should be MP3 data');
  await assert.rejects(trimFile(source,path.join(root,'past-end.mp3'),20,26,{binary:ffmpeg}),/invalid_audio_range/);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('background crop accepts only the exact server-signed job request',async()=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY,originalDb=core.db;
 const key='local-test-service-key',body=JSON.stringify({job_id:'123e4567-e89b-12d3-a456-426614174000'});
 process.env.SUPABASE_SERVICE_ROLE_KEY=key;
 core.db=async()=>[{id:'123e4567-e89b-12d3-a456-426614174000',status:'ready'}];
 try{
  const signature=crypto.createHmac('sha256',key).update(body).digest('hex');
  const valid=await background.handler({httpMethod:'POST',body,headers:{'x-editor-audio-signature':signature}});
  assert.equal(valid.statusCode,200);
  const tampered=await background.handler({httpMethod:'POST',body:body+' ',headers:{'x-editor-audio-signature':signature}});
  assert.equal(tampered.statusCode,401);
 }finally{
  core.db=originalDb;
  if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;
 }
});
