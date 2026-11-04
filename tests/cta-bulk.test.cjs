'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const c=require('../server/core.cjs'),r2=require('../server/r2.cjs'),bulk=require('../server/cta-bulk.cjs');
const id='123e4567-e89b-12d3-a456-426614174000',jobId='223e4567-e89b-12d3-a456-426614174000';
const cta='https://pub-test.r2.dev/cta.mp3';
test('bulk CTA skips an already matching preview instead of creating more files',async t=>{
 const calls=[];t.mock.method(c,'db',async route=>{calls.push(route);if(route.startsWith('stories?'))return [{id,audio_preview_url:'https://pub-test.r2.dev/existing.mp3',overlay:{audio_preview_rendered_url:'https://pub-test.r2.dev/existing.mp3',audio_cta_rendered_url:cta,audio_cta_rendered_gap:1.5}}];if(route.startsWith('site_settings?'))return [{content:{shared_cta_url:cta}}];throw Error('Unexpected write')});
 assert.deepEqual(await bulk.start(id,cta,1.5),{skipped:true,reason:'unchanged'});assert.equal(calls.length,2);
});
test('bulk CTA includes already completed previews and cuts off the old CTA before replacement',async t=>{
 const oldConfig=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-signing-key';t.after(()=>{if(oldConfig===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldConfig});
 const previous='https://pub-test.r2.dev/old.mp3';let payload;
 t.mock.method(c,'origin',()=> 'https://site.example.com');
 t.mock.method(c,'db',async(route,options)=>{
  if(route.startsWith('stories?'))return [{id,audio_preview_url:previous,updated_at:'2026-11-01T00:00:00Z',overlay:{audio_preview_rendered_url:previous,audio_cta_rendered_url:'https://pub-test.r2.dev/old-cta.mp3',audio_preview_rendered_start:50,audio_preview_rendered_end:75}}];
  if(route.startsWith('site_settings?'))return [{content:{shared_cta_url:cta}}];
  if(route.startsWith('adult_audio_crop_jobs?'))return [];
  if(route==='adult_audio_crop_jobs')return [{id:jobId}];throw Error(route);
 });
 t.mock.method(r2,'audioPreviewTarget',async()=>({url:'https://pub-test.r2.dev/new.mp3',put_url:'signed-put'}));
 t.mock.method(global,'fetch',async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,status:202}});
 const result=await bulk.start(id,cta,1.5);assert.equal(result.job.id,jobId);assert.equal(payload.existing_preview,true);assert.equal(payload.base_seconds,25);assert.equal(payload.source_url,previous);assert.equal(payload.apply_story.id,id);
});
test('completed bulk audio preserves story settings and uses a conditional update',async t=>{
 let write;
 t.mock.method(c,'db',async(route,options)=>{
  if(options?.method==='PATCH'){write={route,data:options.data};return [{id}]}
  if(route.startsWith('stories?'))return [{id,audio_preview_url:'old.mp3',updated_at:'version-one',overlay:{x:30,audio_preview_start:50}}];
  if(route.startsWith('site_settings?'))return [{content:{shared_cta_url:cta}}];
  if(route.startsWith('story_private?'))return [{full_audio_url:'private-full'}];throw Error(route);
 });
 await bulk.apply({cta_url:cta,cta_gap_seconds:1.5,apply_story:{id,preview:'old.mp3',updated_at:'version-one',output_url:'new.mp3'}},{base_seconds:25,duration_seconds:31.5});
 assert.match(write.route,/updated_at=eq.version-one/);assert.equal(write.data.audio_preview_url,'new.mp3');assert.equal(write.data.overlay.x,30);assert.equal(write.data.overlay.audio_preview_rendered_end,75);assert.equal(write.data.overlay.audio_cta_rendered_url,cta);
});
test('a concurrently edited story is not overwritten by bulk audio',async t=>{
 t.mock.method(c,'db',async route=>route.startsWith('stories?')?[{id,updated_at:'new-version',audio_preview_url:'old.mp3'}]:[{content:{shared_cta_url:cta}}]);
 await assert.rejects(bulk.apply({cta_url:cta,apply_story:{id,preview:'old.mp3',updated_at:'old-version'}},{base_seconds:25}),/story_changed_elsewhere/);
});
