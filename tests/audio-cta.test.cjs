'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {mkdtemp,readFile,writeFile,rm}=require('node:fs/promises');
const {readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {appendCtaFile,ctaSettings,crop}=require('../server/audio-crop.cjs');
const binary=process.env.FFMPEG_PATH||'/usr/bin/ffmpeg';
const probe=process.env.FFPROBE_PATH||'/usr/bin/ffprobe';
function ff(args){const call=spawnSync(binary,['-nostdin','-hide_banner','-loglevel','error',...args],{timeout:30000});assert.equal(call.status,0,String(call.stderr));return call.stdout}
function duration(file){const call=spawnSync(probe,['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8'});assert.equal(call.status,0,call.stderr);return Number(call.stdout)}
function rms(file,offset){const raw=ff(['-ss',String(offset),'-i',file,'-t','0.18','-ac','1','-ar','16000','-f','s16le','pipe:1']);let sum=0;for(let n=0;n<raw.length;n+=2){const x=raw.readInt16LE(n);sum+=x*x}return Math.sqrt(sum/(raw.length/2))}
function tone(file,freq,seconds,codec='libmp3lame'){ff(['-f','lavfi','-i',`sine=frequency=${freq}:duration=${seconds}`,'-c:a',codec,'-y',file])}

test('CTA URL validation blocks local/private source syntax and enforces a 1–2s gap',()=>{
 assert.deepEqual(ctaSettings('',99),{url:'',gap:1.5});
 assert.equal(ctaSettings('https://pub-123.r2.dev/cta.mp3',1.5).gap,1.5);
 assert.throws(()=>ctaSettings('http://media.example.com/cta.mp3',1.5),/invalid_cta_url/);
 assert.throws(()=>ctaSettings('https://127.0.0.1/audio.mp3',1.5),/invalid_cta_url/);
 assert.throws(()=>ctaSettings('https://pub-test.r2.dev/cta.mp3?token=private',1.5),/invalid_cta_url/);
 assert.throws(()=>ctaSettings('https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com/private.mp3',1.5),/invalid_cta_url/);
 assert.throws(()=>ctaSettings('https://pub-test.r2.dev/cta.mp3',.5),/invalid_cta_gap/);
 assert.throws(()=>ctaSettings('https://pub-test.r2.dev/cta.mp3',3),/invalid_cta_gap/);
 assert.throws(()=>ctaSettings('https://unknown.invalid/cta.mp3',1.5),/invalid_cta_host/);
 assert.throws(()=>ctaSettings('https://evil.r2.dev.attack.invalid/cta.mp3',1.5),/invalid_cta_host/);
});

test('appendCtaFile produces ONE playable MP3 with actual 1.5-second silence before CTA',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'adult-cta-test-'));
 try{
  const source=path.join(root,'source.mp3'),cta=path.join(root,'cta.mp3'),combined=path.join(root,'combined.mp3');
  tone(source,440,3);tone(cta,880,2);
  const seconds=await appendCtaFile(source,cta,combined,1.5,{binary});
  assert.ok(seconds>6.2&&seconds<6.9,`Duration from ffmpeg progress is ${seconds}`);
  assert.ok(Math.abs(duration(combined)-6.5)<.3,'Combined duration must include 3s + 1.5s gap + 2s CTA');
  assert.ok(rms(combined,1.5)>300,'Preview tone must play');
  assert.ok(rms(combined,3.7)<50,'Gap must be genuinely silent, not a paused player');
  assert.ok(rms(combined,5.1)>300,'CTA tone must play after gap');
  const bytes=await readFile(combined);assert.ok(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===0xff);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('crop downloads public CTA, concatenates once, and uploads one combined R2 MP3',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'adult-cta-crop-test-'));
 const oldFetch=global.fetch,oldBinary=process.env.FFMPEG_PATH;
 try{
  const source=path.join(root,'source.m4a'),cta=path.join(root,'cta.mp3');
  tone(source,300,8,'aac');tone(cta,880,1.8);
  const audio=new Uint8Array(await readFile(source)),outro=new Uint8Array(await readFile(cta));
  let uploads=0,uploaded;
  global.fetch=async(url,options={})=>{
   if(options.method==='PUT'){uploads++;uploaded=options.body;return new Response('',{status:200})}
   if(url==='https://audio.example.com/source.m4a')return new Response(audio,{status:200,headers:{'content-length':String(audio.byteLength)}});
   if(url==='https://pub-test.r2.dev/cta.mp3')return new Response(outro,{status:200,headers:{'content-length':String(outro.byteLength)}});
   throw Error('unexpected_fetch');
  };
  process.env.FFMPEG_PATH=binary;
  const result=await crop({source_url:'https://audio.example.com/source.m4a',cta_url:'https://pub-test.r2.dev/cta.mp3',cta_gap_seconds:1.5,start_seconds:1,end_seconds:7,put_url:'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com/audio-preview/a.mp3?X-Amz-Signature=abc'});
  assert.equal(uploads,1,'Exactly one final MP3 should be uploaded');
  assert.ok(result.duration_seconds>8.8&&result.duration_seconds<10.1,`Returned duration ${result.duration_seconds}`);
  const file=path.join(root,'result.mp3');await writeFile(file,uploaded);
  assert.ok(Math.abs(duration(file)-9.3)<.35);
  assert.ok(rms(file,6.7)<50,'Gap is silent');
  assert.ok(rms(file,8)>300,'CTA is included in the uploaded MP3');
 }finally{
  global.fetch=oldFetch;
  if(oldBinary===undefined)delete process.env.FFMPEG_PATH;else process.env.FFMPEG_PATH=oldBinary;
  await rm(root,{recursive:true,force:true});
 }
});


test('editor saves CTA config and server signs it into the background crop job',()=>{
 const root=path.resolve(__dirname,'..');
 const editor=readFileSync(path.join(root,'public/admin.js'),'utf8');
 const html=readFileSync(path.join(root,'public/admin.html'),'utf8');
 const endpoint=readFileSync(path.join(root,'netlify/functions/adult-admin.js'),'utf8');
 for(const id of ['storyCtaAudio','storyCtaGap','ctaAudioPlayer','audioCombinedPreview'])assert.ok(html.includes(`id="${id}"`));
 assert.match(editor,/audio_cta_url:safeUrl\(/);
 assert.match(editor,/audio_cta_gap_seconds:Number\(/);
 assert.match(editor,/action:'audio-crop-start'[^\n]+cta_url:/);
 assert.match(endpoint,/cta_url:cta.url,cta_gap_seconds:cta.gap/);
 assert.match(editor,/storyOverlay.audio_cta_rendered_url=/);
});


test('CTA is never marked rendered when preview URL or IN/OUT/source/CTA changes',async()=>{
 const {cropConfiguration,cropConfigurationMatches,decodeCropJob,audioPreviewIsStale}=await import('../public/audio-preview-state.js');
 const config=cropConfiguration({reference:'https://example.com/full.m4a',start:90,end:150,ctaUrl:'https://pub-test.r2.dev/cta.mp3',ctaGap:1.5});
 const rendered={...config,previewUrl:'https://pub-test.r2.dev/combined.mp3'};
 assert.equal(audioPreviewIsStale({preview:rendered.previewUrl,current:config,rendered}),false);
 for(const changed of [{ctaUrl:'https://pub-test.r2.dev/new.mp3'},{ctaGap:2},{start:91},{end:151},{reference:'https://example.com/another.m4a'}]){
  const next={...config,...changed};
  assert.equal(cropConfigurationMatches(config,next),false);
  assert.equal(audioPreviewIsStale({preview:rendered.previewUrl,current:next,rendered}),true);
 }
 assert.equal(audioPreviewIsStale({preview:'https://pub-test.r2.dev/other.mp3',current:config,rendered}),true);
 assert.equal(audioPreviewIsStale({preview:rendered.previewUrl,current:config,rendered:{ctaUrl:config.ctaUrl,ctaGap:config.ctaGap}}),true);
 assert.deepEqual(decodeCropJob(JSON.stringify({id:'123e4567-e89b-12d3-a456-426614174000',configuration:config})).configuration,config);
 assert.deepEqual(decodeCropJob('123e4567-e89b-12d3-a456-426614174000'),{id:'123e4567-e89b-12d3-a456-426614174000'});
});

test('crop polling publishes only the config captured when background work started',()=>{
 const editor=readFileSync(path.resolve(__dirname,'../public/admin.js'),'utf8');
 assert.match(editor,/cropConfigurationMatches\(job\.configuration,currentCropConfiguration\(\)\)/);
 assert.match(editor,/JSON\.stringify\(jobInfo\)/);
 assert.match(editor,/storyOverlay\.audio_preview_rendered_url=row\.preview_url/);
 assert.match(editor,/audioPreviewIsStale\(/);
});


test('stalled background jobs time out instead of polling indefinitely',()=>{
 const {cropJobExpired}=require('../server/audio-crop.cjs');
 const now=Date.parse('2026-11-04T10:00:00Z');
 const stale={status:'processing',updated_at:'2026-11-04T09:39:00Z'};
 assert.equal(cropJobExpired(stale,now),true);
 assert.equal(cropJobExpired({...stale,updated_at:'2026-11-04T09:45:00Z'},now),false);
 assert.equal(cropJobExpired({...stale,status:'ready'},now),false);
 const admin=readFileSync(path.resolve(__dirname,'../netlify/functions/adult-admin.js'),'utf8');
 assert.match(admin,/cropJobExpired\(job\)/);
 assert.match(admin,/error_code:'audio_crop_timeout'/);
});

test('CTA accepts stable references only in the configured private R2 audio bucket',t=>{
 const values={R2_ACCOUNT_ID:'a'.repeat(32),R2_ENDPOINT:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',R2_MEDIA_BUCKET:'public-media',R2_AUDIO_BUCKET:'private-audio',R2_PUBLIC_BASE_URL:'https://media.example.com'};
 const before=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values);
 t.after(()=>{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value}});
 const reference=values.R2_ENDPOINT+'/private-audio/folder/outro.m4a';
 assert.deepEqual(ctaSettings(reference,1.5),{url:reference,gap:1.5});
 assert.throws(()=>ctaSettings(reference+'?X-Amz-Signature=temporary',1.5),/invalid_cta_url/);
 assert.throws(()=>ctaSettings(reference.replace('/private-audio/','/other-bucket/'),1.5),/invalid_cta_url/);
 assert.throws(()=>ctaSettings(reference.replace('/folder/','/../'),1.5),/invalid_cta_url/);
});

test('private M4A CTA is signed at processing time and merged into the public preview',async t=>{
 const r2=require('../server/r2.cjs');
 const values={R2_ACCOUNT_ID:'b'.repeat(32),R2_ENDPOINT:'https://'+'b'.repeat(32)+'.r2.cloudflarestorage.com',R2_MEDIA_BUCKET:'public-media',R2_AUDIO_BUCKET:'private-audio',R2_PUBLIC_BASE_URL:'https://media.example.com',FFMPEG_PATH:binary};
 const before=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values);
 const root=await mkdtemp(path.join(tmpdir(),'adult-private-cta-'));
 t.after(async()=>{await rm(root,{recursive:true,force:true});for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value}});
 const reference=values.R2_ENDPOINT+'/private-audio/outro.m4a';
 const signed=reference+'?X-Amz-Signature=temporary';let signCount=0,putCount=0;
 t.mock.method(r2,'signedAudio',async raw=>{assert.equal(raw,reference);signCount++;return signed});
 const source=path.join(root,'source.m4a'),outro=path.join(root,'outro.m4a');tone(source,300,8,'aac');tone(outro,880,2,'aac');
 const audio=new Uint8Array(await readFile(source)),cta=new Uint8Array(await readFile(outro));
 t.mock.method(global,'fetch',async(url,options={})=>{
  if(options.method==='PUT'){putCount++;return new Response('',{status:200})}
  if(url==='https://audio.example.com/source.m4a')return new Response(audio);
  assert.equal(url,signed,'Private CTA is fetched using a fresh signature');return new Response(cta);
 });
 const result=await crop({source_url:'https://audio.example.com/source.m4a',cta_url:reference,start_seconds:1,end_seconds:7,put_url:values.R2_ENDPOINT+'/public-media/clip.mp3?X-Amz-Signature=upload'});
 assert.equal(signCount,1);assert.equal(putCount,1);assert.ok(result.duration_seconds>9&&result.duration_seconds<10);
});

test('25-second preview ends with 1.5 seconds of silence then the five-second CTA',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'adult-25s-cta-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const voice=path.join(root,'preview.mp3'),cta=path.join(root,'cta.mp3'),final=path.join(root,'final.mp3');
 tone(voice,300,25);tone(cta,880,5);
 const seconds=await appendCtaFile(voice,cta,final,1.5,{binary});
 assert.ok(Math.abs(seconds-31.5)<.35,`Expected 31.5s, received ${seconds}`);
 assert.ok(rms(final,24)>300,'Preview still plays before its end');
 assert.ok(rms(final,25.5)<50,'The 1.5-second gap is silent');
 assert.ok(rms(final,27)>300,'CTA plays after the silent gap');
 assert.ok(rms(final,30)>300,'Playback includes the CTA tail, not just the 25-second preview');
});

test('saving a selected CTA requires rendering and the generated preview wins over an old shared preview',async()=>{
 const source=readFileSync(path.resolve(__dirname,'../public/audio-preview-state.js'),'utf8');
 const {previewNeedsRender,resolvedPreviewUrl}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const current={reference:'https://private/full.m4a',start:0,end:25,ctaUrl:'https://private/cta.mp3',ctaGap:1.5};
 assert.equal(previewNeedsRender({preview:'https://public/old.mp3',current,rendered:{}}),true);
 assert.equal(previewNeedsRender({preview:'',current,rendered:{}}),true);
 assert.equal(previewNeedsRender({preview:'https://public/new.mp3',current,rendered:{...current,previewUrl:'https://public/new.mp3'}}),false);
 assert.equal(previewNeedsRender({preview:'',current:{...current,reference:''}}),false);
 assert.equal(resolvedPreviewUrl({preview:'new.mp3',renderedPreview:'new.mp3',sharedPreview:'old.mp3'}),'new.mp3');
 assert.equal(resolvedPreviewUrl({preview:'story.mp3',sharedPreview:'shared.mp3'}),'shared.mp3');
 assert.equal(resolvedPreviewUrl({preview:'story.mp3'}),'story.mp3');
});

test('a crop response containing only the 25-second source cannot be published as CTA audio',async()=>{
 const source=readFileSync(path.resolve(__dirname,'../public/audio-preview-state.js'),'utf8');
 const {previewResultComplete}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const configuration={start:0,end:25,ctaUrl:'https://r2.example/cta.mp3',ctaGap:1.5};
 assert.equal(previewResultComplete(configuration,25),false);
 assert.equal(previewResultComplete(configuration,26.5),false);
 assert.equal(previewResultComplete(configuration,31.5),true);
 assert.equal(previewResultComplete(configuration,NaN),false);
 assert.equal(previewResultComplete({...configuration,ctaUrl:''},25),true);
});

test('changing a global CTA replaces the old outro instead of appending twice',async t=>{
 const {appendExisting}=require('../server/audio-crop.cjs');
 const root=await mkdtemp(path.join(tmpdir(),'adult-replace-cta-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const preview=path.join(root,'preview.mp3'),oldCta=path.join(root,'old-cta.mp3'),newCta=path.join(root,'new-cta.mp3'),previous=path.join(root,'previous.mp3');
 tone(preview,300,25);tone(oldCta,600,5);tone(newCta,1000,3);
 await appendCtaFile(preview,oldCta,previous,1.5,{binary});
 const source=new Uint8Array(await readFile(previous)),cta=new Uint8Array(await readFile(newCta));let uploaded;
 const before=process.env.FFMPEG_PATH;process.env.FFMPEG_PATH=binary;t.after(()=>{if(before===undefined)delete process.env.FFMPEG_PATH;else process.env.FFMPEG_PATH=before});
 t.mock.method(global,'fetch',async(url,options={})=>{
  if(options.method==='PUT'){uploaded=options.body;return new Response('',{status:200})}
  if(url==='https://pub-test.r2.dev/old-preview.mp3')return new Response(source);
  if(url==='https://pub-test.r2.dev/new-cta.mp3')return new Response(cta);
  throw Error('unexpected_fetch');
 });
 const result=await appendExisting({source_url:'https://pub-test.r2.dev/old-preview.mp3',cta_url:'https://pub-test.r2.dev/new-cta.mp3',base_seconds:25,cta_gap_seconds:1.5,put_url:'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com/previews/final.mp3?X-Amz-Signature=test'});
 assert.ok(Math.abs(result.duration_seconds-29.5)<.4,`Expected 25+1.5+3, got ${result.duration_seconds}`);
 const final=path.join(root,'final.mp3');await writeFile(final,uploaded);assert.ok(rms(final,25.6)<50);assert.ok(rms(final,27)>300);
});
