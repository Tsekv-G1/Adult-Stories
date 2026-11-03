/* Shared presentation rules. Stored in existing JSON settings: no database migration. */
export const visualDefault=()=>({preset:'crimson',tint:'#db123a',red:38,dark:55,direction:105,grayscale:true});
export function cloudSettings(site,config){
 if(Number(config.cloudConfigVersion||0)>Number(site.cloudinary_config_version||0))return {...site,cloudinary_name:config.cloudName,cloudinary_config_version:config.cloudConfigVersion};
 return {...site};
}
const limit=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
export function cropFor(overlay={},mobile=false){
 const v={x:50,y:50,zoom:1,fit:'cover',...overlay,...(mobile?overlay.mobile:{})};
 return {x:limit(v.x,0,100,50),y:limit(v.y,0,100,50),zoom:limit(v.zoom,1,3,1),fit:v.fit==='contain'?'contain':'cover'};
}
export function visualFor(site={},overlay={},mobile=false){return {...visualDefault(),...site.visual_theme,...cropFor(overlay,mobile)}}
export function applyPhoto(image,e){
 image.style.objectFit=e.fit;image.style.objectPosition=`${e.x}% ${e.y}%`;
 image.style.transform=`scale(${e.zoom})`;image.style.transformOrigin=`${e.x}% ${e.y}%`;
 image.style.filter=e.grayscale?'grayscale(1)':'none';
}
export const audioSeconds=s=>Math.max(0,Number(s?.overlay?.audio_seconds)||0);
export const durationLabel=s=>audioSeconds(s)?`${Math.ceil(audioSeconds(s)/60)} МИН`:'ТЕКСТ';
export function clockDuration(seconds){const n=Math.round(seconds||0);return n>=3600?`${Math.floor(n/3600)}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`}
export function parseClockTime(value){const raw=String(value??'').trim();if(!raw)return NaN;if(/^\d+(?:\.\d+)?$/.test(raw))return Number(raw);const parts=raw.split(':');if(parts.length<2||parts.length>3||parts.some(part=>!/^\d+(?:\.\d+)?$/.test(part)))return NaN;const nums=parts.map(Number);if(nums.slice(1).some(part=>part>=60))return NaN;return nums.length===2?nums[0]*60+nums[1]:nums[0]*3600+nums[1]*60+nums[2]}
export function automaticSlug(title,stories=[],current=null){
 if(current?.slug)return current.slug;
 const base=String(title||'').trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9а-яөүё\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,78)||'story';
 const occupied=new Set(stories.filter(s=>s.id!==current?.id).map(s=>s.slug));let slug=base,i=2;
 while(occupied.has(slug))slug=`${base}-${i++}`;
 return slug;
}
export function automaticPublishAt(status,previous,now=new Date()){
 if(status!=='published')return previous||null;
 const date=new Date(previous);return previous&&Number.isFinite(date.getTime())&&date<=now?previous:now.toISOString();
}
export function measureAudio(url,{timeout=20000}={}){
 return new Promise((resolve,reject)=>{
  const audio=document.createElement('audio');audio.preload='metadata';
  let timer;const finish=(error,seconds)=>{clearTimeout(timer);audio.removeEventListener('loadedmetadata',loaded);audio.removeEventListener('durationchange',loaded);audio.removeEventListener('error',failed);audio.removeAttribute('src');audio.load();error?reject(error):resolve(seconds)};
  const loaded=()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)finish(null,audio.duration)};
  const failed=()=>finish(Error('Аудио уншигдсангүй. Файлын шууд URL, хандалтын эрх болон форматыг шалгана уу.'));
  audio.addEventListener('loadedmetadata',loaded);audio.addEventListener('durationchange',loaded);audio.addEventListener('error',failed);
  timer=setTimeout(()=>finish(Error('Аудионы хугацаа унших хугацаа хэтэрлээ. Дахин шалгана уу.')),timeout);
  audio.src=url;audio.load();
 });
}
