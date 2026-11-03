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
async function download(raw,target){
 let response;
 try{response=await fetch(sourceUrl(raw),{redirect:'error',signal:AbortSignal.timeout(120000)})}catch(error){if(error.message==='invalid_audio_source')throw error;throw Error('audio_source_unavailable')}
 if(!response.ok||!response.body)throw Error('audio_source_unavailable');
 if(Number(response.headers.get('content-length'))>MAX_INPUT)throw Error('audio_too_large');
 let bytes=0;
 const limit=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;done(bytes>MAX_INPUT?Error('audio_too_large'):null,chunk)}});
 try{await pipeline(Readable.fromWeb(response.body),limit,createWriteStream(target))}catch(error){if(error.message==='audio_too_large')throw error;throw Error('audio_source_unavailable')}
 if(!bytes)throw Error('audio_source_unavailable');
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
async function upload(raw,file){
 let response;
 try{response=await fetch(uploadUrl(raw),{method:'PUT',headers:{'Content-Type':'audio/mpeg'},body:await readFile(file),signal:AbortSignal.timeout(120000)})}catch(error){if(error.message==='invalid_upload_target')throw error;throw Error('r2_upload_failed')}
 if(!response.ok)throw Error('r2_upload_failed');
}
async function crop({source_url,put_url,start_seconds,end_seconds}){
 const root=await mkdtemp(path.join(tmpdir(),'adult-audio-crop-'));
 try{
  const source=path.join(root,'source-audio'),preview=path.join(root,'preview.mp3');
  await download(source_url,source);
  const seconds=await trimFile(source,preview,Number(start_seconds),Number(end_seconds));
  await upload(put_url,preview);
  return {duration_seconds:Math.round(seconds*100)/100};
 }finally{await rm(root,{recursive:true,force:true})}
}
module.exports={crop,trimFile};
