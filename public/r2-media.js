import {mediaRequest,mergeMedia,safeUrl} from './core.js?v=9.1.0';
export const r2Messages={r2_not_configured:'R2 тохиргоо дутуу байна. Netlify-ийн R2 хувьсагчдыг шалгаад дахин deploy хийнэ үү.',r2_buckets_must_differ:'Зураг болон хувийн аудионы bucket тусдаа байх ёстой.',r2_audio_not_configured:'R2_AUDIO_BUCKET тохиргоо алга. Хувийн аудио bucket-ийн нэрийг Netlify-д оруулна уу.',r2_list_unavailable:'R2 сангийн жагсаалт нээгдсэнгүй. API key, bucket нэр болон Object Read & Write эрхийг шалгана уу.',r2_upload_not_found:'Upload хийсэн файл R2 дээр баталгаажсангүй. Дахин оролдоно уу.',r2_upload_unavailable:'R2 upload холбоос үүссэнгүй. Серверийн тохиргоог шалгана уу.',invalid_media_file:'JPG, PNG, WEBP, AVIF зураг 25 MB хүртэл оруулна уу.',gemini_unavailable:'Gemini холбогдсонгүй. Netlify API key болон model тохиргоог шалгана уу.',gemini_empty_response:'Gemini уншлагын текст буцаасангүй.',audio_source_text_missing:'Preview болон бүтэн өгүүллэгийн текстийг хадгална уу.',audio_script_length_invalid:'Уншлагын текст 20–50,000 тэмдэгт байх ёстой.',elevenlabs_unavailable:'ElevenLabs voice үүсгэсэнгүй. API key, voice ID, хэрэглээний лимитийг шалгана уу.',elevenlabs_invalid_audio:'ElevenLabs-аас аудио файл ирсэнгүй.',huggingface_unavailable:'Hugging Face хөгжмийн загвар ажилласангүй. Token болон model-ийн inference тохиргоог шалгана уу.',huggingface_invalid_audio:'Hugging Face-аас аудио track ирсэнгүй.',audio_processor_unavailable:'Netlify-ийн FFmpeg function ажиллахгүй байна. Deploy болон function log-ийг шалгана уу.',audio_processor_failed:'Сонгосон хэсгийг тайрч боловсруулахад алдаа гарлаа.',audio_crop_start_failed:'Preview тайрах ажил эхэлсэнгүй.',audio_crop_not_found:'Preview тайрах ажлын мэдээлэл олдсонгүй.',save_audio_first:'Preview гаргахын өмнө бүтэн аудионы URL-аа өгүүллэгтэйгээ хадгална уу.',invalid_audio_range:'Preview 5 секундээс 3 минутын хооронд байна. IN/OUT цэгээ шалгана уу.',invalid_audio_source:'Энэ аудио холбоосыг боловсруулах боломжгүй байна. HTTPS URL эсвэл R2 сангийн файл сонгоно уу.',audio_source_unavailable:'Бүтэн аудиог уншиж чадсангүй. Файлын холбоос болон хандалтыг шалгана уу.',audio_too_large:'Эх аудио 60 MB-аас хэтэрсэн байна.',r2_upload_failed:'Тайрсан preview-г R2-д хадгалж чадсангүй.',story_unavailable:'Өгүүллэгийн мэдээлэл олдсонгүй.'};
export function mediaError(code){return r2Messages[code]||'R2 үйлчилгээ холбогдсонгүй. Нэвтрэлт болон Netlify/R2 тохиргоогоо шалгана уу.'}
export async function prepareImages(file){
 const result={width:0,height:0,variants:[]};if(typeof createImageBitmap!=='function')return result;let bitmap;
 try{bitmap=await createImageBitmap(file);result.width=bitmap.width;result.height=bitmap.height;
  for(const [kind,limit] of [['screen',1600],['thumb',800]]){const ratio=Math.min(1,limit/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));const ctx=canvas.getContext('2d');if(!ctx)continue;ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));if(blob?.type==='image/webp')result.variants.push({kind,blob,size:blob.size});canvas.width=canvas.height=1}
 }catch{}finally{bitmap?.close()}if(result.variants.length!==2)result.variants=[];return result;
}
export async function uploadR2(file,{signal,onStatus=()=>{}}={}){
 if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file?.type)||!file.size||file.size>25*1024*1024)throw Error(r2Messages.invalid_media_file);
 onStatus('Хурдан харагдах зургийн хувилбар бэлдэж байна…');const prepared=await prepareImages(file);const ticket=await mediaRequest({action:'media-upload',type:file.type,size:file.size,variants:prepared.variants.map(v=>({kind:v.kind,size:v.size}))});
 onStatus('Эх зургийг R2 рүү оруулж байна…');let response;try{response=await fetch(ticket.url,{method:'PUT',headers:ticket.headers,body:file,signal})}catch(error){if(error.name==='AbortError')throw error;throw Error('R2 upload холбогдсонгүй. Bucket-ийн CORS дотор энэ сайтын хаяг болон PUT зөвшөөрөгдсөн эсэхийг шалгана уу.')}
 if(!response.ok)throw Error('R2 зураг хүлээж авсангүй ('+response.status+'). API эрх, CORS болон файл хэмжээг шалгаад дахин оролдоно уу.');
 let optimized=false;try{for(const variant of prepared.variants){const target=ticket.variants?.find(v=>v.kind===variant.kind);if(!target)throw Error();const uploaded=await fetch(target.url,{method:'PUT',headers:target.headers,body:variant.blob,signal});if(!uploaded.ok)throw Error()}optimized=prepared.variants.length===2}catch(error){if(error.name==='AbortError')throw error}
 onStatus('R2 дээрх файлыг баталгаажуулж байна…');const result=await mediaRequest({action:'media-complete',key:ticket.key,filename:file.name,width:prepared.width,height:prepared.height,optimized});
 if(!safeUrl(result.asset?.url))throw Error('R2 нийтийн зурагны хаяг буруу байна.');
 Object.defineProperty(result.asset,'uploadNotice',{value:'R2-д эх хэмжээгээр хадгалсан',enumerable:false});return result.asset;
}
export async function importR2Page(cursor=''){
 const page=await mediaRequest({action:'media-list',cursor});if(!Array.isArray(page.items))throw Error('R2 жагсаалтын формат буруу байна.');const result=await mergeMedia(page.items);return{...result,count:page.items.length,cursor:page.next_cursor};
}
export function mountR2({reload,toast,editorToken,onAudio}){
 const $=s=>document.querySelector(s);let cursor='',importing=false,audioCursor='',requestVersion=0,audioTarget=null;
 $('#importR2Media').addEventListener('click',async()=>{if(importing)return;importing=true;const button=$('#importR2Media');button.disabled=true;
  try{const page=await importR2Page(cursor);cursor=page.cursor||'';await reload();button.textContent=cursor?'R2 · дараагийн 100 файл':'R2 САНГААС ЗУРАГ НЭМЭХ';toast(`${page.added} шинэ зураг санд нэмлээ. ${page.count-page.added} зураг өмнө нь байсан.`)}catch(error){toast(error.message,true)}finally{button.disabled=false;importing=false}
 });
 const dialog=$('#r2AudioDialog'),list=$('#r2AudioList'),search=$('#r2AudioSearch');
 const more=$('#r2AudioMore'),status=$('#r2AudioStatus'),counter=$('#r2AudioCount');
 let audioItems=[],loading=false;
 function filterAudio(){
  const q=search.value.trim().toLocaleLowerCase();let visible=0;
  for(const button of list.children){const show=button.dataset.search.includes(q);button.hidden=!show;if(show)visible++}
  counter.textContent=audioItems.length+' файл'+(q?' · '+visible+' таарсан':'');
  if(!loading)status.textContent=visible?'Файлын нэр дээр дарж сонгоно уу.':q?'Ийм нэртэй аудио олдсонгүй.':audioCursor?'Дараагийн файлуудыг уншина уу.':'Энэ санд сонгох аудио алга.';
 }
 search.addEventListener('input',filterAudio);
 async function loadAudio(){
  if(loading||!audioTarget)return;
  const version=requestVersion,{kind,token}=audioTarget;loading=true;more.disabled=true;status.textContent='Аудионы санг уншиж байна…';
  try{
   let pages=0;
   do{
    const page=await mediaRequest({action:kind==='full'?'audio-list':kind==='cta'?'cta-list':'preview-list',cursor:audioCursor});
    if(version!==requestVersion||!dialog.open)return;
    for(const item of page.items||[]){
     if(kind==='cta'&&!/\.mp3$/i.test(item.key))continue;
     const button=document.createElement('button'),name=item.filename||item.key?.split('/').pop()||'Аудио';
     button.type='button';button.className='r2-audio-item';button.dataset.search=(name+' '+item.key).toLocaleLowerCase();
     button.innerHTML='<span class="r2-audio-name"></span><small></small>';
     button.querySelector('span').textContent=name;
     button.querySelector('small').textContent=((item.bytes||0)/1024/1024).toFixed(1)+' MB';
     button.title=item.key||name;
     button.addEventListener('click',()=>{
      if(editorToken()===token)onAudio(item.reference,kind);
      else toast('Өгүүллэг солигдсон байна. Аудиогоо дахин сонгоно уу.',true);
      dialog.close();
     });
     audioItems.push(item);list.append(button);
    }
    audioCursor=page.next_cursor||'';pages++;filterAudio();
    if(audioCursor)status.textContent=audioItems.length+' файл уншлаа…';
   }while(audioCursor&&pages<50);
   more.hidden=!audioCursor;more.textContent='Үлдсэн файлыг ачаалах';filterAudio();
   if(!audioItems.length&&!audioCursor)status.textContent=kind==='full'?'Хувийн R2 аудио санд бүтэн аудио алга.':kind==='cta'?'Нийтийн санд CTA MP3 алга. Preview файлуудыг энд харуулахгүй.':'Нийтийн санд preview аудио алга.';
  }catch(error){
   if(version!==requestVersion||!dialog.open)return;
   status.textContent=error.message;more.hidden=false;more.textContent='Дахин оролдох';
  }finally{if(version===requestVersion){loading=false;more.disabled=false}}
 }
 function open(kind){
  requestVersion++;loading=false;audioTarget={kind,token:editorToken()};audioCursor='';audioItems=[];list.replaceChildren();search.value='';counter.textContent='';
  $('#r2AudioTitle').textContent=kind==='full'?'Бүтэн аудио · хувийн сан':kind==='cta'?'CTA · нийтийн аудио':'Preview · нийтийн сан';
  $('#r2AudioHelp').textContent=kind==='full'?'Энд хувийн R2 сангийн бүх бүтэн аудио харагдана.':kind==='cta'?'Зөвхөн нийтийн MP3. Тайрсан preview файлуудыг хассан.':'Нийтийн сангийн preview аудио.';
  more.hidden=true;dialog.showModal();loadAudio();search.focus();
 }
 $('#chooseR2Audio').addEventListener('click',()=>open('full'));
 for(const button of document.querySelectorAll('[data-r2-kind]'))button.onclick=()=>open(button.dataset.r2Kind);
 $('#r2AudioClose').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{requestVersion++;loading=false;audioTarget=null});
 more.onclick=loadAudio;
}
