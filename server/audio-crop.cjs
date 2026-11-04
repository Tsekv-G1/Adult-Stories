'use strict';
const {spawn}=require('node:child_process');
const {createWriteStream}=require('node:fs');
const {mkdtemp,readFile,rm,stat}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {isIP}=require('node:net');

const MAX_INPUT=60*1024*1024;
const MAX_CTA_INPUT=12*1024*1024;
const sourceUrl=raw=>{
 let url;try{url=new URL(raw)}catch{throw Error('invalid_audio_source')}
 if(url.protocol!=='https:'||!url.hostname||url.username||url.password||(url.port&&url.port!=='443')||isIP(url.hostname)||url.hostname==='localhost'||url.hostname.endsWith('.localhost'))throw Error('invalid_audio_source');
 return url.href;
};
const uploadUrl=raw=>{
 let url;try{url=new URL(raw)}catch{throw Error('invalid_upload_target')}
 if(url.protocol!=='https:'||!/^[a-f\d]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com$/i.test(url.hostname)||!url.searchParams.get('X-Amz-Signature'))throw Error('invalid_upload_target');
 return url.href;
};
function ctaSettings(raw,gapSeconds=1.5){
 const url=String(raw||'').trim();
 if(!url)return {url:'',gap:1.5};
 if(url.length>2048)throw Error('invalid_cta_url');
 let valid;try{valid=sourceUrl(url)}catch{throw Error('invalid_cta_url')}
 const parsed=new URL(valid);
 // Store stable references; private objects are signed only when processing.
 const privateCta=require('./r2.cjs').privatePath(valid);
 if(parsed.search||parsed.hash||/\.r2\.cloudflarestorage\.com$/i.test(parsed.hostname)&&!privateCta)throw Error('invalid_cta_url');
 // Prevent server-side fetch of arbitrary hosts. Default to R2 public domains;
 // custom CDN domains must be configured explicitly by an operator.
 const allowed=new Set((process.env.CTA_ALLOWED_HOSTS||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean));
 try{const publicBase=new URL(process.env.R2_PUBLIC_BASE_URL||'');if(publicBase.protocol==='https:')allowed.add(publicBase.hostname.toLowerCase())}catch{}
 if(!privateCta&&!/^[a-z0-9-]+\.r2\.dev$/i.test(parsed.hostname)&&!allowed.has(parsed.hostname.toLowerCase()))throw Error('invalid_cta_host');
 const gap=Number(gapSeconds);
 if(!Number.isFinite(gap)||gap<1||gap>2)throw Error('invalid_cta_gap');
 return {url:valid,gap};
}
async function download(raw,target,maxBytes=MAX_INPUT){
 let response;
 try{response=await fetch(sourceUrl(raw),{redirect:'error',signal:AbortSignal.timeout(120000)})}catch(error){if(error.message==='invalid_audio_source')throw error;throw Error('audio_source_unavailable')}
 if(!response.ok||!response.body)throw Error('audio_source_unavailable');
 if(Number(response.headers.get('content-length'))>maxBytes)throw Error('audio_too_large');
 let bytes=0;
 const limit=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;done(bytes>maxBytes?Error('audio_too_large'):null,chunk)}});
 try{await pipeline(Readable.fromWeb(response.body),limit,createWriteStream(target))}catch(error){if(error.message==='audio_too_large')throw error;throw Error('audio_source_unavailable')}
 if(!bytes)throw Error('audio_source_unavailable');
}
// Netlify background execution is capped; surface a failed job rather than polling forever.
function cropJobExpired(job,now=Date.now()){
 const last=Date.parse(job?.updated_at||job?.created_at||'');
 return ['queued','processing'].includes(job?.status)&&Number.isFinite(last)&&now-last>20*60*1000;
}
function ffmpegPath(){return process.env.FFMPEG_PATH||require('ffmpeg-static')}
async function trimFile(source,target,start,end,{binary=ffmpegPath()}={}){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>86400||end-start<5||end-start>180)throw Error('invalid_audio_range');
 if(!binary)throw Error('audio_processor_unavailable');
 const length=end-start,fadeOut=Math.min(.4,length/6),fadeStart=Math.max(0,length-fadeOut);
 const args=['-nostdin','-hide_banner','-loglevel','error','-y','-ss',start.toFixed(3),'-i',source,'-t',length.toFixed(3),'-vn','-af',`afade=t=in:st=0:d=0.12,afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeOut.toFixed(3)}`,'-ac','2','-ar','44100','-c:a','libmp3lame','-b:a','128k','-progress','pipe:1',target];
 let progress='';
 await new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('audio_processor_failed'))},300000);
  child.stdout.on('data',chunk=>{progress=(progress+chunk.toString()).slice(-16384)});
  child.stderr.on('data',()=>{});
  child.on('error',()=>{clearTimeout(timer);reject(Error('audio_processor_unavailable'))});
  child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('audio_processor_failed'))});
 });
 const seconds=Number(progress.match(/out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)?.at(-1)?.split('=')[1]?.split(':').reduce((total,part)=>total*60+Number(part),0));
 if(!Number.isFinite(seconds)||seconds<length-.8||(await stat(target)).size<1024)throw Error('invalid_audio_range');
 return seconds;
}
// Render one physical MP3: selected preview -> exact silent gap -> CTA.
// A single file prevents autoplay blocking, seeking glitches and duplicate CTA playback.
async function appendCtaFile(preview,cta,target,gap=1.5,{binary=ffmpegPath()}={}){
 if(!Number.isFinite(gap)||gap<1||gap>2)throw Error('invalid_cta_gap');
 if(!binary)throw Error('audio_processor_unavailable');
 const args=['-nostdin','-hide_banner','-loglevel','error','-y',
  '-i',preview,'-f','lavfi','-t',String(gap),'-i','anullsrc=r=44100:cl=stereo','-i',cta,
  '-filter_complex',
  '[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,loudnorm=I=-18:TP=-1.5:LRA=9:linear=false[p];'+
  '[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[s];'+
  '[2:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=duration=60,asetpts=PTS-STARTPTS,loudnorm=I=-18:TP=-1.5:LRA=9:linear=false,afade=t=in:st=0:d=0.12,areverse,afade=t=in:st=0:d=0.3,areverse[c];'+
  '[p][s][c]concat=n=3:v=0:a=1[out]',
  '-map','[out]','-vn','-ac','2','-ar','44100','-c:a','libmp3lame','-b:a','128k','-progress','pipe:1',target];
 let progress='';
 await new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('audio_processor_failed'))},300000);
  child.stdout.on('data',chunk=>{progress=(progress+chunk.toString()).slice(-16384)});
  child.stderr.on('data',()=>{});
  child.on('error',()=>{clearTimeout(timer);reject(Error('audio_processor_unavailable'))});
  child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('audio_processor_failed'))});
 });
 const seconds=Number(progress.match(/out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)?.at(-1)?.split('=')[1]?.split(':').reduce((total,part)=>total*60+Number(part),0));
 if((await stat(target)).size<1024||!Number.isFinite(seconds)||seconds<gap+.35)throw Error('audio_processor_failed');
 return seconds;
}
async function fileDuration(file,{binary=ffmpegPath()}={}){
 let progress='';
 await new Promise((resolve,reject)=>{
  const child=spawn(binary,['-nostdin','-hide_banner','-loglevel','error','-i',file,'-vn','-progress','pipe:1','-f','null','-'],{stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('audio_processor_failed'))},120000);
  child.stdout.on('data',chunk=>{progress=(progress+chunk.toString()).slice(-16384)});child.stderr.on('data',()=>{});
  child.on('error',()=>{clearTimeout(timer);reject(Error('audio_processor_unavailable'))});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('audio_processor_failed'))});
 });
 const seconds=Number(progress.match(/out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)?.at(-1)?.split('=')[1]?.split(':').reduce((total,part)=>total*60+Number(part),0));
 if(!Number.isFinite(seconds)||seconds<=0)throw Error('audio_processor_failed');return seconds;
}
async function appendExisting({source_url,put_url,cta_url,cta_gap_seconds=1.5,base_seconds=null}){
 const cta=ctaSettings(cta_url,cta_gap_seconds);if(!cta.url)throw Error('invalid_cta_url');
 const root=await mkdtemp(path.join(tmpdir(),'adult-existing-preview-'));
 try{
  const source=path.join(root,'source'),base=path.join(root,'base.mp3'),outro=path.join(root,'cta'),final=path.join(root,'final.mp3');
  await download(source_url,source);
  let baseFile=source;
  if(base_seconds!==null){await trimFile(source,base,0,Number(base_seconds));baseFile=base}
  const length=await fileDuration(baseFile);
  if(length<5||length>181)throw Error('invalid_audio_range');
  const ctaSource=require('./r2.cjs').privatePath(cta.url)?await require('./r2.cjs').signedAudio(cta.url):cta.url;
  await download(ctaSource,outro,MAX_CTA_INPUT);
  const duration=await appendCtaFile(baseFile,outro,final,cta.gap);
  if(duration<length+cta.gap+.35)throw Error('audio_cta_missing');
  await upload(put_url,final);return {duration_seconds:duration,base_seconds:length};
 }finally{await rm(root,{recursive:true,force:true})}
}
async function upload(raw,file){
 let response;
 try{response=await fetch(uploadUrl(raw),{method:'PUT',headers:{'Content-Type':'audio/mpeg'},body:await readFile(file),signal:AbortSignal.timeout(120000)})}catch(error){if(error.message==='invalid_upload_target')throw error;throw Error('r2_upload_failed')}
 if(!response.ok)throw Error('r2_upload_failed');
}
async function crop({source_url,put_url,start_seconds,end_seconds,cta_url='',cta_gap_seconds=1.5}){
 const cta=ctaSettings(cta_url,cta_gap_seconds);
 const root=await mkdtemp(path.join(tmpdir(),'adult-audio-crop-'));
 try{
  const source=path.join(root,'source-audio'),preview=path.join(root,'preview.mp3');
  await download(source_url,source);
  const seconds=await trimFile(source,preview,Number(start_seconds),Number(end_seconds));
  let uploadFile=preview,outputSeconds=seconds;
  if(cta.url){
   const ctaSource=path.join(root,'cta-audio'),combined=path.join(root,'preview-with-cta.mp3');
   const ctaSourceUrl=require('./r2.cjs').privatePath(cta.url)?await require('./r2.cjs').signedAudio(cta.url):cta.url;
   await download(ctaSourceUrl,ctaSource,MAX_CTA_INPUT);
   outputSeconds=await appendCtaFile(preview,ctaSource,combined,cta.gap);
   if(outputSeconds<seconds+cta.gap+.35)throw Error('audio_cta_missing');
   uploadFile=combined;
  }
  await upload(put_url,uploadFile);
  return {duration_seconds:Math.round(outputSeconds*100)/100};
 }finally{await rm(root,{recursive:true,force:true})}
}
module.exports={appendExisting,fileDuration,crop,trimFile,appendCtaFile,ctaSettings,cropJobExpired};
