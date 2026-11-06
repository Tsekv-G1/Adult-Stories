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

test('duplicate signed background deliveries claim the job only once',async t=>{
 const processor=require('../server/audio-crop.cjs'),old=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='atomic-test-key';
 t.after(()=>{if(old===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old});
 let claimed=false,renders=0;
 t.mock.method(core,'db',async(route,options)=>{
  if(!options)return [{id:'123e4567-e89b-12d3-a456-426614174000',status:'queued'}];
  if(route.includes('status=eq.queued')){if(claimed)return [];claimed=true;return [{id:'123e4567-e89b-12d3-a456-426614174000',status:'processing'}]}
  return [];
 });
 t.mock.method(processor,'crop',async()=>{renders++;await new Promise(resolve=>setImmediate(resolve));return {duration_seconds:31.5}});
 const body=JSON.stringify({job_id:'123e4567-e89b-12d3-a456-426614174000'}),signature=crypto.createHmac('sha256','atomic-test-key').update(body).digest('hex');
 const event={httpMethod:'POST',body,headers:{'x-editor-audio-signature':signature}};
 const replies=await Promise.all([background.handler(event),background.handler(event)]);
 assert.equal(renders,1);assert.ok(replies.some(row=>JSON.parse(row.body).ignored===true));assert.ok(replies.every(row=>row.statusCode===200));
});

test('a failed claim cannot mark a job owned by another worker as failed',async t=>{
 const old=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='claim-failure-test';
 t.after(()=>{if(old===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old});
 let failureWrites=0;
 t.mock.method(core,'db',async(route,options)=>{
  if(!options)return [{id:'123e4567-e89b-12d3-a456-426614174000',status:'queued'}];
  if(route.includes('status=eq.queued'))throw Error('temporary database failure');
  if(options.data.status==='failed')failureWrites++;return [];
 });
 const body=JSON.stringify({job_id:'123e4567-e89b-12d3-a456-426614174000'}),signature=crypto.createHmac('sha256','claim-failure-test').update(body).digest('hex');
 const reply=await background.handler({httpMethod:'POST',body,headers:{'x-editor-audio-signature':signature}});
 assert.equal(reply.statusCode,503);assert.equal(failureWrites,0);
});
