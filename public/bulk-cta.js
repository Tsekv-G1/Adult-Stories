import {mediaRequest} from './core.js';
const key='adult_bulk_cta_v1';
export async function cleanOldPreviews(onProgress=()=>{}){
 let deleted=0;
 for(;;){const result=await mediaRequest({action:'audio-preview-cleanup'});deleted+=result.deleted||0;onProgress(deleted);if(result.deferred||!result.more||!result.deleted)return {...result,deleted}}
}
export function createBulkCta({status,onDone=async()=>{}}){
 let running=false;
 const store=task=>localStorage.setItem(key,JSON.stringify(task));
 const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
 const pause=()=>new Promise(resolve=>setTimeout(resolve,2200));
 function progress(task,detail=''){
  status.textContent=`Бүх өгүүллэгийн CTA: ${task.index}/${task.items.length} · шинэчилсэн ${task.updated||0} · хэвээр ${task.unchanged||0} · preview-гүй ${task.empty||0} · алдаа ${task.failed.length}. ${detail}`;
 }
 async function run(task){
  if(running)return;running=true;
  try{
   for(;task.index<task.items.length;){
    const item=task.items[task.index];progress(task,item.title||'');
    try{
     if(!task.job){
      const result=await mediaRequest({action:'audio-cta-apply',story_id:item.id,cta_url:task.ctaUrl,cta_gap_seconds:task.gap});
      if(result.skipped){if(result.reason==='unchanged')task.unchanged++;else task.empty++;task.index++;store(task);continue}
      task.job={id:result.job.id,busy:!!result.busy};store(task);
     }
     const result=await mediaRequest({action:'audio-crop-status',id:task.job.id,story_id:item.id});
     if(['queued','processing'].includes(result.job.status)){await pause();continue}
     if(task.job.busy){task.job=null;store(task);continue}
     if(result.job.status!=='ready')throw Object.assign(Error(result.job.error_code||'audio_processor_failed'),{code:result.job.error_code});
     task.updated++;task.index++;task.job=null;store(task);
    }catch(error){
     if(['shared_cta_changed','unauthorized','admin_required'].includes(error.code))throw error;
     if(!error.code){store(task);progress(task,'Холболт тасарсан. Админаар дахин нээх эсвэл «Үргэлжлүүлэх» дарна уу.');return}
     task.failed.push({id:item.id,title:item.title,error:error.code||error.message});task.index++;task.job=null;store(task);
    }
   }
   progress(task,'Шалгалт дууслаа.');
   if(task.failed.length){status.textContent+=' Шинэчлэгдээгүй: '+task.failed.map(row=>row.title||row.id).join(', ');store(task)}else localStorage.removeItem(key);
   try{const clean=await cleanOldPreviews();if(clean.deleted)status.textContent+=` Хуучин ${clean.deleted} файл цэвэрлэлээ.`}catch{status.textContent+=' Хуучин файлын цэвэрлэгээ дараа дахин ажиллана.'}
   await onDone();
  }catch(error){store(task);progress(task,error.message)}finally{running=false}
 }
 return {
  async apply({items,ctaUrl,gap}){
   if(running)throw Error('Бүх өгүүллэгийн CTA шинэчлэлт ажиллаж байна.');
   const catalog=[];let offset=0;do{const page=await mediaRequest({action:'audio-cta-catalog',offset,limit:100});catalog.push(...page.stories);offset=page.next_offset}while(offset!==null&&offset!==undefined);
   const task={items:catalog.map(item=>({id:item.id,title:item.title})),ctaUrl,gap,index:0,job:null,updated:0,unchanged:0,empty:0,failed:[]};store(task);await run(task);
  },
  resume(){const task=read();if(!task||running)return;if(task.index>=task.items.length&&task.failed.length){task.items=task.failed.map(row=>({id:row.id,title:row.title}));task.index=0;task.job=null;task.failed=[];task.updated=0;task.unchanged=0;task.empty=0}return run(task)},
  get running(){return running}
 };
}
