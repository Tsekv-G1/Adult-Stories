'use strict';
const crypto=require('node:crypto');
const {S3Client,PutObjectCommand,HeadObjectCommand,ListObjectsV2Command,GetObjectCommand}=require('@aws-sdk/client-s3');
const {getSignedUrl}=require('@aws-sdk/s3-request-presigner');
const c=require('./core.cjs');
const IMAGE_TYPES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'};
const imageKey=k=>/\.(jpe?g|png|webp|avif)$/i.test(k);
const audioKey=k=>/\.(mp3|m4a|wav|ogg|webm|flac)$/i.test(k);
const validKey=k=>typeof k==='string'&&k.length>0&&k.length<=1024&&!/[\x00-\x1f\x7f\\]/.test(k)&&!k.split('/').some(p=>p==='.'||p==='..'||!p);
function settings(){
 const account=process.env.R2_ACCOUNT_ID||'',endpoint=process.env.R2_ENDPOINT||( /^[a-f\d]{32}$/i.test(account)?`https://${account}.r2.cloudflarestorage.com`:'' );
 let u;try{u=new URL(endpoint)}catch{c.fail(503,'r2_not_configured')}
 if(u.protocol!=='https:'||!/^([a-f\d]{32})(\.(eu|us|fedramp))?\.r2\.cloudflarestorage\.com$/i.test(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')c.fail(503,'r2_not_configured');
 const bucket=process.env.R2_MEDIA_BUCKET||'adultstories',audio=process.env.R2_AUDIO_BUCKET||'';
 if(!/^[a-z\d][a-z\d-]{1,61}[a-z\d]$/.test(bucket)||(audio&&!/^[a-z\d][a-z\d-]{1,61}[a-z\d]$/.test(audio)))c.fail(503,'r2_not_configured');
 if(audio===bucket)c.fail(503,'r2_buckets_must_differ');
 const base=process.env.R2_PUBLIC_BASE_URL||'';let publicUrl;try{publicUrl=new URL(base)}catch{c.fail(503,'r2_not_configured')}
 if(publicUrl.protocol!=='https:'||publicUrl.username||publicUrl.password||publicUrl.search||publicUrl.hash||publicUrl.pathname!=='/'||publicUrl.hostname.endsWith('.r2.cloudflarestorage.com'))c.fail(503,'r2_not_configured');
 return {endpoint:u.origin,bucket,audio,publicBase:publicUrl.origin};
}
function client(){const s=settings();return new S3Client({region:'auto',endpoint:s.endpoint,forcePathStyle:true,maxAttempts:2,credentials:{accessKeyId:c.config('R2_ACCESS_KEY_ID'),secretAccessKey:c.config('R2_SECRET_ACCESS_KEY')},requestHandler:{requestTimeout:12000,connectionTimeout:5000}})}
const encoded=k=>k.split('/').map(encodeURIComponent).join('/');
function publicUrl(key){if(!validKey(key))c.fail(400,'invalid_media_key');return settings().publicBase+'/'+encoded(key)}
function privatePath(raw){if(!process.env.R2_AUDIO_BUCKET)return null;try{const s=settings(),u=new URL(raw);if(u.origin!==s.endpoint||u.search||u.hash||u.username||u.password)return null;const prefix='/'+s.audio+'/';if(!u.pathname.startsWith(prefix))return null;const key=decodeURIComponent(u.pathname.slice(prefix.length));return validKey(key)&&audioKey(key)?key:null}catch{return null}}
async function signedAudio(raw){const key=privatePath(raw);if(!key)return '';try{return await getSignedUrl(client(),new GetObjectCommand({Bucket:settings().audio,Key:key}),{expiresIn:900})}catch{c.fail(503,'r2_audio_unavailable')}}
async function upload(body){
 const type=String(body.type||''),size=Number(body.size);if(!IMAGE_TYPES[type]||!Number.isSafeInteger(size)||size<1||size>25*1024*1024)c.fail(400,'invalid_media_file');
 const key='cms-images/'+crypto.randomUUID()+'.'+IMAGE_TYPES[type];
 const variants=Array.isArray(body.variants)?body.variants:[];if(variants.length>2||new Set(variants.map(v=>v.kind)).size!==variants.length||variants.some(v=>!['screen','thumb'].includes(v.kind)||!Number.isSafeInteger(v.size)||v.size<1||v.size>25*1024*1024))c.fail(400,'invalid_media_file');
 try{const sign=(path,mime,bytes)=>getSignedUrl(client(),new PutObjectCommand({Bucket:settings().bucket,Key:path,ContentType:mime,ContentLength:bytes}),{expiresIn:600,signableHeaders:new Set(['content-type','content-length'])});const url=await sign(key,type,size);return {key,url,headers:{'Content-Type':type},public_url:publicUrl(key),variants:await Promise.all(variants.map(async v=>({kind:v.kind,url:await sign(key+'.'+v.kind+'.webp','image/webp',v.size),headers:{'Content-Type':'image/webp'}})))}}catch(e){if(e instanceof c.ApiError)throw e;c.fail(503,'r2_upload_unavailable')}
}
function asset(key,{filename,bytes=0,width=0,height=0,etag=''}={}){return {url:publicUrl(key),public_id:key,asset_id:'r2:'+settings().bucket+':'+key,filename:filename||key.split('/').pop(),alt_text:(filename||key.split('/').pop()).replace(/\.[^.]+$/,''),width,height,bytes,format:key.split('.').pop().toLowerCase()}}
async function complete(body){
 const key=String(body.key||'');if(!/^cms-images\/[a-f\d-]{36}\.(jpg|png|webp|avif)$/.test(key))c.fail(400,'invalid_media_key');
 let object;try{object=await client().send(new HeadObjectCommand({Bucket:settings().bucket,Key:key}))}catch{c.fail(503,'r2_upload_not_found')}
 if(!IMAGE_TYPES[object.ContentType]||!object.ContentLength||object.ContentLength>25*1024*1024)c.fail(400,'invalid_media_file');
 const dimension=v=>Number.isSafeInteger(v)&&v>0&&v<=100000?v:0;
 const value=asset(key,{filename:String(body.filename||'').replace(/[\x00-\x1f\x7f]/g,'').slice(0,240)||undefined,bytes:object.ContentLength,width:dimension(body.width),height:dimension(body.height)});
 if(body.optimized===true){try{const screen=await client().send(new HeadObjectCommand({Bucket:settings().bucket,Key:key+'.screen.webp'})),thumb=await client().send(new HeadObjectCommand({Bucket:settings().bucket,Key:key+'.thumb.webp'}));if(screen.ContentType==='image/webp'&&thumb.ContentType==='image/webp')value.url=publicUrl(key+'.screen.webp')}catch{}}return value;
}
async function list({cursor='',audio=false}={}){
 const s=settings(),bucket=audio?s.audio:s.bucket;if(!bucket)c.fail(503,'r2_audio_not_configured');
 if(typeof cursor!=='string'||cursor.length>4096)c.fail(400,'invalid_cursor');
 let result;try{result=await client().send(new ListObjectsV2Command({Bucket:bucket,MaxKeys:100,...(cursor?{ContinuationToken:cursor}:{})}))}catch{c.fail(503,'r2_list_unavailable')}
 const objects=(result.Contents||[]).filter(o=>!/^cms-images\/[a-f\d-]{36}\.(jpg|png|webp|avif)\.(screen|thumb)\.webp$/.test(o.Key)&&validKey(o.Key)&&(audio?audioKey(o.Key):imageKey(o.Key)));
 return {items:objects.map(o=>audio?{key:o.Key,filename:o.Key.split('/').pop(),bytes:o.Size||0,reference:s.endpoint+'/'+bucket+'/'+encoded(o.Key)}:asset(o.Key,{bytes:o.Size||0})),next_cursor:result.IsTruncated?result.NextContinuationToken||null:null};
}
module.exports={settings,client,upload,complete,list,publicUrl,privatePath,signedAudio,validKey};
