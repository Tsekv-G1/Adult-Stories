'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {appendCtaFile}=require('../server/audio-crop.cjs');
const ffmpeg=process.env.FFMPEG_PATH||'/usr/bin/ffmpeg';
function ff(args){const res=spawnSync(ffmpeg,['-nostdin','-hide_banner','-loglevel','error',...args],{timeout:40000});assert.equal(res.status,0,String(res.stderr));return res.stdout}
function rms(file,at){const raw=ff(['-ss',String(at),'-i',file,'-t','0.18','-ac','1','-ar','16000','-f','s16le','pipe:1']);let sum=0;for(let i=0;i<raw.length;i+=2)sum+=raw.readInt16LE(i)**2;return Math.sqrt(sum/(raw.length/2))}

test('resume bounds: restart near the end; never restore invalid negative time',async()=>{
 const {resumeSeconds}=await import('../public/audio-experience.js');
 assert.equal(resumeSeconds(55,120),55);
 assert.equal(resumeSeconds(-10,120),0);
 assert.equal(resumeSeconds(Number.NaN,120),0);
 assert.equal(resumeSeconds(3,120),0);
 assert.equal(resumeSeconds(114,120),0);
 assert.equal(resumeSeconds(58,Infinity),58);
});

test('sleep timer supports 5/10/15/30/45/60 minutes, wall-clock expiration',async()=>{
 const {sleepOptions,remainingSleepMinutes,sleepExpired}=await import('../public/audio-experience.js');
 assert.deepEqual(sleepOptions,[0,5,10,15,30,45,60]);
 const now=Date.parse('2026-11-04T10:00:00Z'),deadline=now+5*60000;
 assert.equal(remainingSleepMinutes(deadline,now),5);
 assert.equal(remainingSleepMinutes(deadline,now+4*60000+1),1);
 assert.equal(remainingSleepMinutes(deadline,now+6*60000),0);
 assert.equal(sleepExpired(deadline,now+6*60000),true);
 assert.equal(sleepExpired(deadline,now+3*60000),false);
 assert.equal(sleepExpired(0,now),false);
});

test('player checks timer after returning from background and clears completed resume position',()=>{
 const source=readFileSync(path.join(__dirname,'../public/audio-player.js'),'utf8');
 assert.match(source,/else checkSleep\(\)/);
 assert.match(source,/onProgress\(\{\.\.\.track,current:0/);
 assert.match(source,/resumeSeconds\(resumeAt,audio\.duration\)/);
});

test('home Continue Listening supports immediate preview resume',()=>{
 const source=readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 assert.match(source,/data-continue-audio/);
 assert.match(source,/if\(button\.dataset\.continueAudio\)/);
});

test('Smart Audio evens out a quiet CTA and fades CTA tail while keeping silence silent',async()=>{
 const base=await mkdtemp(path.join(tmpdir(),'adult-v4-lufs-'));
 try{
  const preview=path.join(base,'p.mp3'),cta=path.join(base,'c.mp3'),mixed=path.join(base,'m.mp3');
  ff(['-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','libmp3lame','-y',preview]);
  ff(['-f','lavfi','-i','sine=frequency=880:duration=2','-af','volume=0.07','-c:a','libmp3lame','-y',cta]);
  await appendCtaFile(preview,cta,mixed,1.5,{binary:ffmpeg});
  const p=rms(mixed,1.5),c=rms(mixed,5.3),gap=rms(mixed,3.7),end=rms(mixed,6.46);
  assert.ok(p>1000&&c>1000,`Normalized clips must be audible: ${p} vs ${c}`);
  assert.ok(c/p>.45&&c/p<2.2,`Clips should have similar volume after normalizing: ${p}, ${c}`);
  assert.ok(gap<50,`Gap must remain silent: ${gap}`);
  assert.ok(end<c*.6,`CTA tail should fade out: ${end} < ${c*.6}`);
 }finally{await rm(base,{recursive:true,force:true})}
});
