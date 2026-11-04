import {prepareUpscale} from './image-upscale.js?v=8.5.0';
import {createLocalRepository} from './local-repository.js?v=8.5.0';
import {importWithTimeout} from './loader-resilience.js?v=9.1.0';
import {createClient} from '@supabase/supabase-js';
/* Shared store: local preview or online Supabase. No private keys are ever embedded. */
export const CONFIG=window.ADULT_CONFIG||{};
export const authConfigured=Boolean(CONFIG.supabaseUrl&&CONFIG.supabaseAnonKey);
export const online=authConfigured&&!CONFIG.localContentMode;
const DB_KEY='adult_cms_v5_content';
const CHANNEL='adult_cms_v5_changes';
export const $=(s,root=document)=>root.querySelector(s);
export const $$=(s,root=document)=>[...root.querySelectorAll(s)];
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const textParas=s=>String(s||'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
export const uid=()=>crypto.randomUUID?crypto.randomUUID():`draft-${Date.now()}`;
export const safeUrl=v=>{try{let u=new URL(v);if(u.username||u.password)return '';return u.protocol==='https:'||(['127.0.0.1','localhost'].includes(u.hostname)&&u.protocol==='http:')?u.href:''}catch{return''}};
export const slugify=v=>String(v||'').trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9а-яөүё\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').slice(0,90)||('story-'+Date.now());
export const overlayDefault=()=>({tint:'#db123a',red:42,dark:55,direction:105,x:50,y:50,fit:'cover'});
export const overlayCSS=(o={})=>{let e={...overlayDefault(),...o};let n=Math.max(0,Math.min(90,Number(e.red)||0))/100;let d=Math.max(0,Math.min(95,Number(e.dark)||0))/100;let hex=/^#[\da-f]{6}$/i.test(e.tint)?e.tint:'#db123a';let rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return `linear-gradient(0deg,rgba(3,3,7,${Math.max(.4,d).toFixed(2)}) 0%,transparent 70%),linear-gradient(${Number(e.direction)||105}deg,rgba(3,3,8,${d.toFixed(2)}) 0%,rgba(${rgb.join(',')},${n.toFixed(2)}) 100%)`};
export const fmtPrice=n=>(Number(n)||0).toLocaleString('en-US')+'₮';
const samples=[
 ['train','Шөнийн галт тэрэг','Нууцлаг','Шөнийн сүүлийн вагонд хэн нэгэн түүнийг хүлээж байлаа.','Сүүлчийн галт тэрэг хөдлөхөд тэр ганцаараа байлаа. Цонхны цаана хотын гэрэл сүүмэлзэж, хоосон суудал дээр улаан дугтуй хэвтэж байв.\n\nДугтуйн гадна талд зөвхөн түүний нэрийг бичжээ.','Галт тэрэг дараагийн буудал дээр зогсоход вагон руу хэн ч орж ирсэнгүй. Харин дугтуй доторх захианд “Яг одоо бууж болохгүй” гэж бичсэн байв.\n\nТэр цонхоор харахад хотын гэрэл удаан анивчиж, холдсоор байлаа.'],
 ['room','Улаан өрөө','Романтик','Танил бус нэгэн өрөө, удаан мартагдсан захиа.','Тэр орой хагас нээлттэй хаалганы завсраар улаан гэрэл тусч байв. Дотор байсан хүн инээмсэглэн түүнийг хүлээж зогслоо.\n\nШирээн дээр онгорхой захиа байв.','Захианы үг бүр тэдний өмнө нь орхисон дурсамжуудыг сэргээж байлаа. Хоёул хэсэг чимээгүй суув.\n\nДараа нь тэд анх уулзсан өдрийнхөө тухай ярьж эхлэв.'],
 ['signal','Чимээгүй дохио','Триллер','Нэг л тэмдэг түүний өнгөрснийг сэрээв.','Утсанд ирсэн улаан тэмдэг энгийн мэт харагдсан. Гэхдээ үүнийг зөвхөн гурван жилийн өмнө алга болсон хүн хэрэглэдэг байсан юм.\n\nТэр шууд хариу бичсэнгүй.','Мессежийн ард хотын төвийн нэгэн хуучин студийн хаяг байв. Хаалга нь түгжээтэй ч цонхонд гэрэл ассаар.\n\nШирээн дээрх зураг түүнд дэндүү танил санагджээ.'],
 ['letter','Сүүлчийн захиа','Нууцлаг','Өглөө болоход бүх зүйл өөрчлөгдөнө.','Түүний үүдэнд улаан тамгатай дугтуй байв. “Маргааш өглөө чи энэ бүхнийг мартсан байх болно” хэмээн эхэлсэн нь хачин байлаа.\n\nТэр дахин уншлаа.','Захианд түүний огт мэдэхгүй дурсамжуудын тухай бичжээ. Тэр цонх руу харвал эсрэг талын байшинд ижилхэн захиа уншиж буй хүн харагдав.'],
 ['window','Цонхны цаана','Романтик','Хоёр хөршийн шөнийн танилцал.','Хоёр цонх шөнө бүр нэгэн зэрэг гэрэлтдэг байлаа. Тэр өдөр бүр ижилхэн хөгжим сонсогдохыг анзаарсан боловч хэн тавьдагийг мэдэхгүй байв.','Нэг орой нөгөө цонхонд “Энэ дуу танд таалагддаг уу?” гэсэн бичиг гарч иржээ. Энэ нь тэдний анхны яриа байв.'],
 ['secret','Арван хоёр дахь цаг','Триллер','Цагны зүү зогсоход нууц эхэлнэ.','Хонгилын хуучин цаг шөнө дунд болохоор зогсдог байв. Өмнөх эзэн цагийг засаж болохгүй гэж сануулсан ч тэр тоогоогүй.','Гэрэл анивчихад дээр давхраас алхах чимээ сонсогдлоо. Тэр болгоомжтой шатаар өгсөхөд үүдний өмнө түлхүүр хэвтэж байв.']
];
export function defaults(){return {site:{id:'main',brand:'ADULT STORIES',hero_heading:'ШӨНИЙН',hero_accent:'ХҮСЭЛ ЭНДЭЭС.',hero_kicker:'ӨГҮҮЛЛЭГИЙН ШИНЭ МЭДРЭМЖ',hero_description:'Нэг л мөр таны дараагийн руу татна. Сэтгэл хөдөлгөх түүхийн эхлэлийг үнэгүй уншиж, богино preview-г сонсоод, үргэлжлэлийг өөрөө нээгээрэй.',hero_asset_id:null,featured_story_id:'train',hero_overlay:overlayDefault(),membership_price:29900,membership_first_price:24900,membership_list_price:34900,membership_week_price:9900,announcement:'Нууцлаг түүхүүд. Үнэгүй эхлэл. Таны сонголт.',categories:['Нууцлаг','Романтик','Триллер'],seo_title:'ADULT Stories — Өгүүллэгийн сан',seo_description:'Насанд хүрэгчдэд зориулсан өгүүллэг болон аудио preview.'},assets:[],stories:samples.map((s,i)=>({id:s[0],slug:s[0],title:s[1],category:s[2],excerpt:s[3],preview_text:s[4],status:'published',cover_id:null,overlay:overlayDefault(),price:9900,read_minutes:8+i,sort_order:i+1,featured:i===0,publish_at:null,author:'ADULT Stories',tags:[],audio_preview_url:'',created_at:new Date().toISOString(),updated_at:new Date().toISOString()})),bodies:samples.map(s=>({story_id:s[0],full_text:s[5],full_audio_url:''}))};}
function parseLocal(){
 try{const got=JSON.parse(localStorage.getItem(DB_KEY)||'null');if(got&&Array.isArray(got.stories))return got}catch{}
 // Best-effort migration from V4 Media Studio, only when origins share localStorage.
 const d=defaults();
 try{
  const old=JSON.parse(localStorage.getItem('adult_v4_media_state')||'null');
  if(old?.slots && Array.isArray(old.assets)){
   const asEffect=e=>{const v={...overlayDefault(),...e};return {...v,direction:({'to right':90,'to left':270,'to bottom':180,'to top':0}[e?.direction]||105),fit:'cover'}};
   d.assets=old.assets.filter(a=>safeUrl(a.url)).map(a=>({id:a.id||uid(),url:safeUrl(a.url),public_id:a.publicId||'',asset_id:'',filename:a.name||'V4 asset',alt_text:a.name||'',width:a.width||0,height:a.height||0,bytes:0,format:'migrated',created_at:new Date().toISOString()}));
   for(const story of d.stories){const slot=old.slots[story.id];if(slot){story.cover_id=d.assets.some(a=>a.id===slot.assetId)?slot.assetId:null;story.overlay=asEffect(slot.effects)}}
   const hero=old.slots.hero;if(hero){d.site.hero_asset_id=d.assets.some(a=>a.id===hero.assetId)?hero.assetId:null;d.site.hero_overlay=asEffect(hero.effects)}
   localStorage.setItem(DB_KEY,JSON.stringify(d));
  }
 }catch(e){console.warn('V4 migration skipped',e)}
 return d;
}
const PENDING_MEDIA_KEY='adult_cms_pending_media';
function pendingMedia(){try{return JSON.parse(localStorage.getItem(PENDING_MEDIA_KEY)||'[]')}catch{return []}}
function journalMedia(asset,remove=false){try{const pending=pendingMedia().filter(a=>a.url!==asset.url);if(!remove)pending.push({...asset,id:asset.id||uid()});localStorage.setItem(PENDING_MEDIA_KEY,JSON.stringify(pending))}catch{}}
function rawLocal(){try{const raw=JSON.parse(localStorage.getItem(DB_KEY)||'null'),valid=raw&&Array.isArray(raw.stories)&&Array.isArray(raw.assets)&&raw.site,queued=pendingMedia();if(!valid&&!queued.length)return null;const base=valid?raw:defaults();return {...base,bodies:base.bodies||[],assets:[...base.assets,...queued]}}catch{return null}}
function mirrorLocal(content){try{localStorage.setItem(DB_KEY,JSON.stringify(content))}catch(e){console.warn('Browser mirror unavailable; disk store is authoritative',e)}}
const repository=createLocalRepository({legacy:rawLocal,defaults:parseLocal,mirror:mirrorLocal,changed:alertChange});
export const persistenceInfo=()=>online?{mode:'supabase',ready:true}:repository.info();
let client=null;let channel;
try{channel=new BroadcastChannel(CHANNEL)}catch{}
// The SDK is bundled into each entry point; startup needs no third-party JS CDN.
export async function supa(){
 if(!authConfigured)return null;
 if(client)return client;
 client=createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
 return client;
}
function alertChange(){try{channel?.postMessage(Date.now())}catch{}window.dispatchEvent(new CustomEvent('adult-data-changed'))}
function updateLocal(next){localStorage.setItem(DB_KEY,JSON.stringify(next));alertChange()}
export async function getData({admin=false}={}){
 if(!online)return repository.read({admin});
 const sb=await supa();let [s,a,st]=await importWithTimeout(()=>Promise.all([sb.from('site_settings').select('*').eq('id','main').maybeSingle(),sb.from('media_assets').select('*').order('created_at',{ascending:false}),sb.from('stories').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:false})]),12000);
 for(const r of [s,a,st])if(r.error)throw r.error;
 return {site:s.data?.content||defaults().site,assets:a.data||[],stories:st.data||[],bodies:[]};
}
export async function getBody(id){if(!online)return (await repository.read({admin:true})).bodies.find(x=>x.story_id===id)||{story_id:id,full_text:'',full_audio_url:''};let sb=await supa();let r=await sb.from('story_private').select('*').eq('story_id',id).maybeSingle();if(r.error)throw r.error;return r.data||{story_id:id,full_text:'',full_audio_url:''}}
export async function saveStory(story,body){
 const now=new Date().toISOString();let s={...story,updated_at:now};if(!s.slug)s.slug=slugify(s.title);if(!online){const stored=await repository.mutate('save-story',{story:s,body});if(stored)return stored.result;const d=parseLocal();if(!s.id)s.id=uid();const i=d.stories.findIndex(x=>x.id===s.id);if(i<0)d.stories.push({...s,created_at:now});else d.stories[i]={...d.stories[i],...s};if(body){const j=d.bodies.findIndex(x=>x.story_id===s.id);if(j<0)d.bodies.push({story_id:s.id,...body});else d.bodies[j]={...d.bodies[j],...body}}updateLocal(d);return s}
 const sb=await supa();if(!s.id)delete s.id;const r=await sb.rpc('adult_save_story',{p_story:s,p_body:body??null,p_expected_updated_at:story.updated_at||null});if(r.error){if(r.error.message==='story_changed_elsewhere')throw Error('Энэ өгүүллэгийг өөр цонхноос шинэчилсэн байна. Нооргоо хадгалаад дахин ачаална уу.');throw r.error}alertChange();return r.data;
}
export async function removeStory(id){if(!online){if(await repository.mutate('remove-story',{id}))return;let d=parseLocal();d.stories=d.stories.filter(s=>s.id!==id);d.bodies=d.bodies.filter(b=>b.story_id!==id);if(d.site.featured_story_id===id)d.site.featured_story_id=d.stories[0]?.id||null;updateLocal(d);return}let sb=await supa();let r=await sb.from('stories').delete().eq('id',id);if(r.error?.code==='23503')throw Error('Төлбөрийн захиалгатай өгүүллэгийг устгах боломжгүй. Төлөвийг Архив болгож хадгална уу.');if(r.error)throw r.error;alertChange()}
// Merge shared audio independently of other editor panels and reject concurrent writes.
export async function saveSite(content,{sharedKey}={}){
 const keys=['shared_preview_url','shared_cta_url'];
 if(sharedKey&&!keys.includes(sharedKey))throw Error('invalid_audio_setting');
 const merge=current=>{
  if(sharedKey)return {...current,[sharedKey]:content[sharedKey]};
  const next={...content};
  for(const key of keys){if(current[key])next[key]=current[key];else delete next[key]}
  return next;
 };
 if(!online){
  const d=await repository.read({admin:true}),next=merge(d.site);
  if(!await repository.mutate('save-site',{content:next}))updateLocal({...d,site:{...next,id:'main'}});
  return next;
 }
 const sb=await supa(),row=await sb.from('site_settings').select('content,updated_at').eq('id','main').maybeSingle();
 if(row.error)throw row.error;
 const next=merge(row.data?.content||{});
 const result=row.data
  ?await sb.from('site_settings').update({content:next}).eq('id','main').eq('updated_at',row.data.updated_at).select('id')
  :await sb.from('site_settings').insert({id:'main',content:next}).select('id');
 if(result.error)throw result.error;
 if(!result.data?.length)throw Error('Тохиргоог өөр цонхноос өөрчилсөн байна. Дахин оролдоно уу.');
 alertChange();return next;
}

export async function saveAsset(asset){
 if(!online){journalMedia(asset);const stored=await repository.mutate('save-asset',{asset});if(stored){journalMedia(asset,true);return stored.result}const d=parseLocal(),existing=d.assets.find(a=>(a.asset_id&&a.asset_id===asset.asset_id)||a.url===asset.url);if(existing){journalMedia(asset,true);return existing}const a={...asset,id:asset.id||uid(),created_at:new Date().toISOString()};d.assets.unshift(a);updateLocal(d);journalMedia(asset,true);return a}
 const sb=await supa();const {data,error}=await sb.from('media_assets').insert(asset).select().single();if(error)throw error;alertChange();return data;
}
export async function updateAsset(asset){
 if(!asset?.id)throw Error('Asset ID шаардлагатай');
 if(!online){const stored=await repository.mutate('update-asset',{asset});if(stored)return stored.result;let d=parseLocal();let i=d.assets.findIndex(a=>a.id===asset.id);if(i<0)throw Error('Зураг олдсонгүй');d.assets[i]={...d.assets[i],...asset};updateLocal(d);return d.assets[i]}
 let sb=await supa();const {id,...patch}=asset;let {data,error}=await sb.from('media_assets').update(patch).eq('id',id).select().single();if(error)throw error;alertChange();return data;
}
export async function removeAsset(id){if(!online){if(await repository.mutate('remove-asset',{id}))return;let d=parseLocal();d.assets=d.assets.filter(a=>a.id!==id);for(let s of d.stories)if(s.cover_id===id)s.cover_id=null;if(d.site.hero_asset_id===id)d.site.hero_asset_id=null;updateLocal(d);return}let sb=await supa();let r=await sb.from('media_assets').delete().eq('id',id);if(r.error)throw r.error;alertChange()}
export async function session(){if(!online)return null;let sb=await supa();let r=await importWithTimeout(()=>sb.auth.getSession(),12000);return r.data.session}
export async function signIn(email,password){let sb=await supa();let r=await importWithTimeout(()=>sb.auth.signInWithPassword({email,password}),12000);if(r.error)throw r.error;return r.data}
export async function signOut(){let sb=await supa();let r=await importWithTimeout(()=>sb.auth.signOut(),12000);if(r.error)throw r.error}
export async function isAdmin(){if(!online)return true;let sb=await supa();let r=await importWithTimeout(()=>sb.rpc('is_admin'),12000);if(r.error)throw r.error;return !!r.data}
export async function mediaRequest(payload){
 const sb=await supa();if(!sb)throw Error('R2 upload хийхдээ Netlify дээрх админаар нэвтэрнэ үү.');
 const {data}=await sb.auth.getSession();if(!data.session)throw Error('Админаар нэвтэрнэ үү.');
 let response;try{response=await fetch('/api/adult-admin',{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)})}catch{throw Error('R2 сервер холбогдсонгүй. Netlify холболтоо шалгана уу.')}
 let result;try{result=await response.json()}catch{throw Error('R2 сервер JSON хариу өгсөнгүй. Netlify дээр шинэ Functions-тай хамт deploy хийнэ үү.')}
 if(!response.ok||!result?.ok){const {mediaError}=await import('./r2-media.js?v=8.5.0');throw Error(mediaError(result?.error))}return result;
}
export async function uploadImage(file,options={}){if(CONFIG.mediaProvider==='r2'){const {uploadR2}=await import('./r2-media.js?v=8.5.0');return uploadR2(file,options)}return uploadCloudinary(file,options)}
export async function uploadCloudinary(file,{signal,upscale=CONFIG.autoUpscaleImages!==false,onStatus=()=>{}}={}){
 if(!file?.type.startsWith('image/'))throw Error('Зөвхөн зураг upload хийнэ.');
 if(file.size>25*1024*1024)throw Error('Зургийн хэмжээ 25MB-аас хэтэрлээ.');
 let f=new FormData();f.append('file',file,file.name);
 let cloud=CONFIG.cloudName,params={};
 if(online&&CONFIG.signedUpload){let sb=await supa();let {data,error}=await sb.functions.invoke('sign-cloudinary',{body:{purpose:'story-image'}});if(error)throw error;if(data.cloud_name!==CONFIG.cloudName)throw Error('Signed upload серверийн CLOUDINARY_CLOUD_NAME тохиргоог '+CONFIG.cloudName+' болгож шинэчилнэ үү.');cloud=data.cloud_name;params=data;for(let k of ['api_key','signature','timestamp','asset_folder'])f.append(k,String(data[k]));}
 else {if(!CONFIG.unsignedUploadPreset)throw Error('config.js дотор unsignedUploadPreset оруулна уу.');f.append('upload_preset',CONFIG.unsignedUploadPreset)}
 const res=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`,{method:'POST',body:f,signal});let data;try{data=await res.json()}catch{throw Error('Cloudinary зураг хүлээж авсангүй. Cloud name, upload preset болон холболтоо шалгана уу.')}if(!res.ok)throw Error(data.error?.message||'Cloudinary upload амжилтгүй');
 const enhanced=await prepareUpscale(data.secure_url,data.width,data.height,{enabled:upscale,signal,onStatus});const result={url:enhanced.url,public_id:data.public_id,asset_id:data.asset_id||'',filename:file.name,width:data.width||0,height:data.height||0,bytes:data.bytes||file.size,format:data.format||'',alt_text:file.name.replace(/\.[^.]+$/,''),created_at:new Date().toISOString()};Object.defineProperty(result,'uploadNotice',{value:enhanced.message,enumerable:false});return result;
}
export function subscribeChanges(callback){const local=()=>callback();window.addEventListener('adult-data-changed',local);channel?.addEventListener('message',local);window.addEventListener('storage',ev=>{if(ev.key===DB_KEY)callback()});let cleanup=()=>{};if(online){supa().then(sb=>{const sub=sb.channel('cms-live').on('postgres_changes',{event:'*',schema:'public',table:'stories'},callback).on('postgres_changes',{event:'*',schema:'public',table:'media_assets'},callback).on('postgres_changes',{event:'*',schema:'public',table:'site_settings'},callback).subscribe();cleanup=()=>sb.removeChannel(sub)}).catch(()=>{});}return ()=>{cleanup();window.removeEventListener('adult-data-changed',local);channel?.removeEventListener('message',local)}}

export async function assignCover(kind,storyId,assetId){
 if(!online){const stored=await repository.mutate('assign-cover',{kind,story_id:storyId,asset_id:assetId});if(stored)return stored.result;const d=parseLocal();let target=kind==='home'?d.site:d.stories.find(s=>s.id===storyId);if(!target)throw Error('Өгүүллэг олдсонгүй.');const key=kind==='home'?'hero_asset_id':'cover_id',previous_id=target[key]||null;target[key]=assetId;updateLocal(d);return {previous_id}}
 const sb=await supa();if(kind==='story'){const old=await sb.from('stories').select('cover_id').eq('id',storyId).single();if(old.error)throw old.error;const result=await sb.from('stories').update({cover_id:assetId}).eq('id',storyId);if(result.error)throw result.error;alertChange();return {previous_id:old.data.cover_id}}
 const fresh=await getData({admin:true});const previous_id=fresh.site.hero_asset_id||null;await saveSite({...fresh.site,hero_asset_id:assetId});return {previous_id};
}
export async function reorderStories(ids){
 if(!online){if(await repository.mutate('reorder-stories',{ids}))return;const d=parseLocal();if(new Set(ids).size!==d.stories.length||d.stories.some(s=>!ids.includes(s.id)))throw Error('Жагсаалтаа шинэчлээд дахин эрэмбэлнэ үү.');d.stories.forEach(s=>s.sort_order=ids.indexOf(s.id)+1);updateLocal(d);return}
 const sb=await supa();const results=await Promise.all(ids.map((id,i)=>sb.from('stories').update({sort_order:i+1}).eq('id',id)));const failed=results.find(r=>r.error);alertChange();if(failed)throw failed.error;
}
export async function mergeMedia(assets){
 if(!Array.isArray(assets))throw Error('Зургийн жагсаалт буруу байна.');
 if(!online){const stored=await repository.mutate('merge-media',{assets});if(stored)return stored.result;}
 let added=0,current=await getData({admin:true});for(const a of assets){if(!safeUrl(a.url))continue;if(current.assets.some(x=>x.url===a.url||(a.asset_id&&x.asset_id===a.asset_id)))continue;const {id,created_at,...safe}=a;const allowed={url:safeUrl(safe.url),public_id:safe.public_id||'',asset_id:safe.asset_id||'',filename:safe.filename||'Image',alt_text:safe.alt_text||'',width:Math.max(0,Number(safe.width)||0),height:Math.max(0,Number(safe.height)||0),bytes:Math.max(0,Number(safe.bytes)||0),format:safe.format||''};const saved=await saveAsset(allowed);current.assets.push(saved);added++}return {added};
}
export async function importLocalBackup(content){if(online)throw Error('Live bulk import идэвхгүй.');if(await repository.mutate('replace-content',{content}))return;updateLocal(content);}
