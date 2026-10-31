import {memberRequest} from './customer-api.js?v=8.2.0';
// Local outbox belongs to one member. Failed writes survive reload; false saved values are tombstones.
export function createLibrary({onChange=()=>{},onStatus=()=>{}}={}){
 let initialized=false,user=null,epoch=0,busy=false,timer=null,rows={},pending={};
 const key=()=>`adult_library_v8_${user?.id||'guest'}`;
 function persist(){try{localStorage.setItem(key(),JSON.stringify({rows,pending}))}catch{onStatus('Энэ төхөөрөмжид хадгалж чадсангүй.')}}
 const snapshot=()=>Object.values(rows).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
 function emit(){onChange(snapshot())}
 async function flush(){
  if(!user||busy)return;busy=true;const token=epoch,id=user.id;
  try{for(const storyId of Object.keys(pending)){
   if(token!==epoch)break;const patch={...pending[storyId]};let result;
   for(let retry=0;retry<3;retry++){
    result=await memberRequest('library',{id:storyId,revision:rows[storyId]?.revision||0,patch});if(token!==epoch)return;
    if(!result.conflict)break;rows[storyId]={...result.row,...pending[storyId]};
   }
   if(result.conflict)throw Error('conflict');
   const remaining=pending[storyId]||{};for(const field of Object.keys(patch))if(remaining[field]===patch[field])delete remaining[field];
   if(!Object.keys(remaining).length)delete pending[storyId];rows[storyId]={...result.row,...remaining};persist();
  }if(token===epoch){onStatus(Object.keys(pending).length?'Синк хийж байна…':'Сан синхрончилсон');emit()}}
  catch(error){if(token===epoch)onStatus(error.status===401?'Синк хийхийн тулд дахин нэвтэрнэ үү.':'Төхөөрөмжид хадгалсан · Холбогдоход синк хийнэ.')}
  finally{busy=false;if(token!==epoch&&user)flush()}
 }
 async function refresh(){if(!user)return;const token=epoch;try{const result=await memberRequest('library');if(token!==epoch)return;for(const row of result.rows)rows[row.story_id]={...row,...pending[row.story_id]};persist();emit();await flush()}catch{if(token===epoch)onStatus('Төхөөрөмжийн сан · Холбогдоход синк хийнэ.')}}
 async function setUser(next){if(initialized&&user?.id===next?.id){if(next)refresh();return}initialized=true;epoch++;user=next;rows={};pending={};try{const cached=JSON.parse(localStorage.getItem(key())||'{}');rows=cached.rows||{};pending=cached.pending||{}}catch{}emit();if(user){onStatus('Санг синк хийж байна…');await refresh()}else onStatus('Энэ төхөөрөмжид хадгална.')}
 function patch(id,values){if(!id)return;rows[id]={story_id:id,revision:0,...rows[id],...values,updated_at:new Date().toISOString()};if(user)pending[id]={...pending[id],...values};persist();emit();clearTimeout(timer);timer=setTimeout(flush,900)}
 window.addEventListener('online',refresh);window.addEventListener('focus',refresh);setInterval(()=>{if(user&&document.visibilityState==='visible')refresh()},60000);
 return {setUser,patch,refresh,flush,rows:snapshot,get:id=>rows[id]};
}
