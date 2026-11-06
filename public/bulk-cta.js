import {mediaRequest} from './core.js';
const key='adult_bulk_cta_v1';
export async function cleanOldPreviews(onProgress=()=>{}){
 let deleted=0,marked=0;
 for(;;){const result=await mediaRequest({action:'audio-preview-cleanup'});deleted+=result.deleted||0;marked+=result.marked||0;onProgress(deleted);if(result.deferred||!result.more||!result.deleted)return {...result,deleted,marked}}
}
export function createBulkCta({status,onDone=async()=>{}}){
 let running=false,preparing=false,currentTask=null,durable=true;
 const store=task=>{currentTask=task;try{localStorage.setItem(key,JSON.stringify(task))}catch{durable=false}};
 const clear=()=>{currentTask=null;try{localStorage.removeItem(key)}catch{}};
 const read=()=>{
  if(!durable)return currentTask;
  let task;try{task=JSON.parse(localStorage.getItem(key)||'null')}catch{return currentTask}
  if(!task)return currentTask;
  if(!Array.isArray(task.items)||!Array.isArray(task.failed)||!Number.isInteger(task.index)||task.index<0||task.index>task.items.length||typeof task.ctaUrl!=='string'||!Number.isFinite(task.gap)||task.gap<1||task.gap>2||task.items.some(item=>!item||typeof item.id!=='string')||task.failed.some(item=>!item||typeof item.id!=='string')||task.job&&typeof task.job.id!=='string'){clear();return null}
  for(const key of ['updated','unchanged','empty'])if(!Number.isFinite(task[key]))task[key]=0;
  return task;
 };
 const pause=()=>new Promise(resolve=>setTimeout(resolve,2200));
 function progress(task,detail=''){
  status.textContent=`Бүх өгүүллэгийн CTA: ${task.index}/${task.items.length} · шинэчилсэн ${task.updated||0} · хэвээр ${task.unchanged||0} · preview-гүй ${task.empty||0} · алдаа ${task.failed.length}. ${detail}${durable?'':' · Энэ browser явцыг хадгалж чадахгүй байна. Табыг хаахгүй байлгана уу.'}`;
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
     if(result.job.status!=='ready')throw Object.assign(Error(result.job.error_code||'audio_processor_failed'),{code:result.job.error_code||'audio_processor_failed'});
     task.updated++;task.index++;task.job=null;store(task);
    }catch(error){
     if(['shared_cta_changed','unauthorized','admin_required'].includes(error.code))throw error;
     if(!error.code||['database_unavailable','service_unavailable','rate_limited','auth_unavailable','login_required'].includes(error.code)){store(task);progress(task,'Холболт тасарсан. Админаар дахин нээх эсвэл «Үргэлжлүүлэх» дарна уу.');return}
     task.failed.push({id:item.id,title:item.title,error:error.code||error.message});task.index++;task.job=null;store(task);
    }
   }
   progress(task,'Шалгалт дууслаа.');
   if(task.failed.length){status.textContent+=' Шинэчлэгдээгүй: '+task.failed.map(row=>row.title||row.id).join(', ');store(task)}else clear();
   try{const clean=await cleanOldPreviews();if(clean.deleted)status.textContent+=` Хуучин ${clean.deleted} файл цэвэрлэлээ.`}catch{status.textContent+=' Хуучин файлын цэвэрлэгээ дараа дахин ажиллана.'}
   try{await onDone()}catch{status.textContent+=' Аудио хадгалагдсан. Жагсаалтыг шинэчлэх товчийг дарна уу.'}
  }catch(error){store(task);progress(task,error.message)}finally{running=false}
 }
 return {
  async apply({ctaUrl,gap}){
   if(running||preparing)throw Error('Бүх өгүүллэгийн CTA шинэчлэлт ажиллаж байна.');
   preparing=true;let task;
   try{
    const catalog=[];let offset=0;const seen=new Set();
    do{
     if(seen.has(offset))throw Error('Өгүүллэгийн жагсаалтын хуудас давтагдсан байна. Дахин шинэчилнэ үү.');seen.add(offset);
     const page=await mediaRequest({action:'audio-cta-catalog',offset,limit:100});
     if(!Array.isArray(page.stories))throw Error('Өгүүллэгийн жагсаалтыг уншиж чадсангүй.');
     catalog.push(...page.stories);offset=page.next_offset;
    }while(offset!==null&&offset!==undefined);
    task={items:[...new Map(catalog.map(item=>[item.id,{id:item.id,title:item.title}])).values()],ctaUrl,gap,index:0,job:null,updated:0,unchanged:0,empty:0,failed:[]};store(task);
   }finally{preparing=false}
   await run(task);
  },
  resume(){const task=read();if(!task||running||preparing)return;if(task.index>=task.items.length&&task.failed.length){task.items=task.failed.map(row=>({id:row.id,title:row.title}));task.index=0;task.job=null;task.failed=[];task.updated=0;task.unchanged=0;task.empty=0}return run(task)},
  get running(){return running||preparing}
 };
}
