import {optimizedImage} from './image-delivery.js?v=8.5.0';
import {originalImageUrl} from './image-upscale.js?v=8.5.0';
import {esc,safeUrl,online,saveAsset,updateAsset,removeAsset,uploadImage,assignCover,reorderStories,mergeMedia,persistenceInfo} from './core.js?v=8.5.0';
const MEDIA='application/x-adult-media',STORY='application/x-adult-story';
export function createMediaWorkspace(o){
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],selected=new Set(),tasks=[];
 let assigning=null,running=false,queueId=0,lastUndo=null,queueCollapsed=false;
 const data=()=>o.data(),assets=()=>data()?.assets||[],asset=id=>assets().find(a=>a.id===id),filtered=q=>assets().filter(a=>`${a.filename||''} ${a.alt_text||''} ${a.public_id||''}`.toLowerCase().includes(q.toLowerCase()));
 const imageStyle=()=>o.theme().grayscale?'grayscale(1)':'none';
 function renderPickers(){
  if(!data())return;
  for(const scope of ['story','home']){
   const id=o.value(scope),items=filtered($(`#${scope}AssetSearch`).value);
   $(`#${scope}AssetCount`).textContent=`${items.length} / ${assets().length} зураг`;
   $(`#${scope}AssetGrid`).innerHTML=items.length?items.map(a=>`<div class="asset-choice" role="listitem" draggable="true" data-media-id="${esc(a.id)}"><button type="button" class="${id===a.id?'selected':''}" data-picker-select="${esc(a.id)}" data-scope="${scope}" aria-pressed="${id===a.id}" aria-label="${esc(a.filename||'Зураг')} сонгох"><img src="${esc(optimizedImage(a.url,320))}" alt="${esc(a.alt_text||a.filename||'Зураг')}" style="filter:${imageStyle()}" loading="lazy" draggable="false"><span class="choice-name">${esc(a.filename||'Зураг')}</span>${id===a.id?'<span class="choice-tick">✓</span>':''}</button></div>`).join(''):'<div class="empty">'+(assets().length?'Хайлтад тохирох зураг алга.':'Зургийн сан хоосон байна. Файлуудаа энд чирж оруулна уу.')+'</div>';
  }
 }
 function updateSelected(){for(const id of selected)if(!asset(id))selected.delete(id);$('#selectedMediaCount').textContent=`${selected.size} сонгосон`;$('#exportSelectedMedia').disabled=!selected.size;$('#deleteSelectedMedia').disabled=!selected.size;$$('#mediaGrid [data-media-id]').forEach(card=>{card.classList.toggle('media-selected',selected.has(card.dataset.mediaId));const checkbox=card.querySelector('[data-media-check]');if(checkbox)checkbox.checked=selected.has(card.dataset.mediaId)})}
 function render(){
  if(!data())return;const items=filtered($('#mediaSearch').value);
  $('#assetCount').textContent=`${assets().length} зураг · ${items.length} харагдаж байна`;
  const info=persistenceInfo(),note=$('#mediaPersistence');note.classList.toggle('browser-only',info.mode==='browser');
  note.textContent=info.mode==='disk'?'✓ Зургийн сан файлд хадгалагдаж байна · Сервер дахин асаах, хавтас шинэчлэхэд хадгалагдана.':info.mode==='supabase'?'✓ Зургийн сан Supabase дээр хадгалагдаж байна.':'Локал туршилтын зургийн сан энэ браузерт хадгалагдана. Онлайн санд Supabase ашиглана; өмнөх зургуудыг JSON backup-аас нэгтгэж болно.';
  $('#mediaGrid').innerHTML=items.length?items.map(a=>`<article class="asset-card" draggable="true" data-media-id="${esc(a.id)}"><label class="asset-check"><input type="checkbox" data-media-check="${esc(a.id)}" aria-label="${esc(a.filename||'Зураг')} багцад сонгох"></label><div class="asset-thumb"><button type="button" data-open-assignment="${esc(a.id)}" aria-label="${esc(a.filename||'Зураг')} сонгох"><img src="${esc(optimizedImage(a.url,320))}" alt="${esc(a.alt_text||'Зураг')}" style="filter:${imageStyle()}" loading="lazy" draggable="false"></button></div><div class="asset-body"><strong title="${esc(a.filename||'Зураг')}">${esc(a.filename||'Зураг')}</strong><small>${a.width||'?'} × ${a.height||'?'} · ${a.bytes?(a.bytes/1024/1024).toFixed(2)+' MB':'URL'}</small><div class="asset-actions"><button type="button" class="btn primary choose-media" data-open-assignment="${esc(a.id)}">СОНГОХ</button><button type="button" class="btn tiny outline" data-original="${esc(a.id)}">Эх зураг</button><button type="button" class="btn tiny outline" data-edit-media="${esc(a.id)}">Засах</button><button type="button" class="btn tiny danger" data-remove-media="${esc(a.id)}">Хасах</button></div></div></article>`).join(''):'<div class="empty">'+(assets().length?'Хайлтад тохирох зураг алга.':'Хадгалсан зураг алга. Upload хийх эсвэл өмнөх JSON сангаа нэгтгэнэ үү.')+'</div>';
  updateSelected();renderPickers();
 }
 function choose(scope,id){if(id&&!asset(id))return;o.select(scope,id);renderPickers()}
 function openAssignment(id){
  const a=asset(id);if(!a)return;assigning=id;$('#mediaAssignImage').src=optimizedImage(a.url,960);$('#mediaAssignImage').style.filter=imageStyle();$('#mediaAssignName').textContent=a.filename||'Зураг';
  const current=o.editor();$('#mediaAssignTarget').innerHTML='<option value="">Хаана ашиглахаа сонгоно уу</option>'+(!current.id?'<option value="draft">Шинэ өгүүллэг / одоогийн ноорог</option>':'')+'<option value="home">Нүүр хуудасны Hero</option>'+data().stories.map(s=>`<option value="story:${esc(s.id)}">${esc(s.title)}</option>`).join('');
  $('#mediaAssignTarget').value=current.id?'story:'+current.id:'';assignmentHelp();$('#mediaAssignDialog').showModal();
 }
 function assignmentHelp(){const draft=$('#mediaAssignTarget').value==='draft';$('#mediaAssignHelp').textContent=draft?'Ноорог дээр сонгоно. Өгүүллэгээ Хадгалах дарж баталгаажуулна.':'Cover-ийг шууд хадгална. Өгүүллэгийн бусад агуулга өөрчлөгдөхгүй.';$('#confirmMediaAssign').textContent=draft?'НООРОГТ СОНГОХ':'ОНООЖ ХАДГАЛАХ'}
 function undoNotice(text,action){lastUndo=action;$('#mediaUndoText').textContent=text;$('#mediaUndoBar').classList.remove('hidden')}
 async function persistAssignment(kind,storyId,id,{undo=true}={}){
  const result=await assignCover(kind,storyId,id);o.assigned(kind,storyId,id);await o.reload();
  const title=kind==='home'?'Hero':data().stories.find(s=>s.id===storyId)?.title||'Өгүүллэг';
  if(undo)undoNotice(title+' · Cover хадгалагдлаа',{kind:'cover',target:kind,storyId,assetId:result.previous_id});
  render();return result;
 }
 async function confirmAssignment(){
  const target=$('#mediaAssignTarget').value;if(!target)return o.toast('Хаана ашиглахаа сонгоно уу.',true);const button=$('#confirmMediaAssign');button.disabled=true;
  try{if(target==='draft'){choose('story',assigning);o.openCover();o.toast('Ноорогт зураг сонголоо. Өгүүллэгээ хадгална уу.')}else await persistAssignment(target==='home'?'home':'story',target.startsWith('story:')?target.slice(6):null,assigning);$('#mediaAssignDialog').close()}
  catch(e){o.toast(e.message,true)}finally{button.disabled=false}
 }
 $('#confirmMediaAssign').addEventListener('click',confirmAssignment);$('#mediaAssignTarget').addEventListener('change',assignmentHelp);$('#closeMediaAssign').addEventListener('click',()=>$('#mediaAssignDialog').close());
 $('#undoMediaAction').addEventListener('click',async()=>{const action=lastUndo;if(!action)return;$('#undoMediaAction').disabled=true;try{if(action.kind==='cover')await persistAssignment(action.target,action.storyId,action.assetId,{undo:false});else{await reorderStories(action.ids);o.reordered(action.ids);await o.reload()}lastUndo=null;$('#mediaUndoBar').classList.add('hidden');o.toast('Буцаалаа')}catch(e){o.toast(e.message,true)}finally{$('#undoMediaAction').disabled=false}});
 for(const scope of ['story','home']){
  $(`#${scope}AssetSearch`).addEventListener('input',renderPickers);
  $(`#${scope}AssetGrid`).addEventListener('click',event=>{const button=event.target.closest('[data-picker-select]');if(button){const id=button.dataset.pickerSelect;choose(scope,id);$(`#${scope}AssetGrid [data-picker-select="${CSS.escape(id)}"]`)?.focus({preventScroll:true})}});
  $(`#${scope}AssetGrid`).addEventListener('keydown',event=>{if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(event.key))return;const buttons=$$(`#${scope}AssetGrid [data-picker-select]`),index=buttons.indexOf(event.target);if(index<0)return;event.preventDefault();const columns=getComputedStyle($(`#${scope}AssetGrid`)).gridTemplateColumns.split(' ').length,step=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:event.key==='ArrowDown'?columns:-columns;buttons[Math.max(0,Math.min(buttons.length-1,index+step))]?.focus()});
 }
 let editingAssetId=null;
 $('#mediaGrid').addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  const id=button.dataset.openAssignment||button.dataset.original||button.dataset.editMedia||button.dataset.removeMedia;
  if(button.dataset.openAssignment){if(event.metaKey||event.ctrlKey){selected.has(id)?selected.delete(id):selected.add(id);updateSelected()}else openAssignment(id)}
  if(button.dataset.original)o.original(originalImageUrl(asset(id)?.url));
  if(button.dataset.editMedia){editingAssetId=id;$('#assetEditName').value=asset(id)?.filename||'';$('#assetEditAlt').value=asset(id)?.alt_text||'';$('#assetEditModal').classList.remove('hidden')}
  if(button.dataset.removeMedia){if(!confirm('Зургийг CMS сангаас хасах уу? Хадгалсан эх файл хадгалагдана.'))return;try{await removeAsset(id);o.removed(id);await o.reload();render();o.toast('Сангаас хаслаа. Хадгалсан эх файл хэвээр.')}catch(e){o.toast(e.message,true)}}
 });
 $('#mediaGrid').addEventListener('change',event=>{const box=event.target.closest('[data-media-check]');if(!box)return;box.checked?selected.add(box.dataset.mediaCheck):selected.delete(box.dataset.mediaCheck);updateSelected()});
 $('#deleteSelectedMedia').addEventListener('click',async()=>{
  const chosen=assets().filter(a=>selected.has(a.id));if(!chosen.length)return;
  const site=data().site||{},stories=data().stories||[],used=chosen.filter(a=>site.hero_asset_id===a.id||stories.some(s=>s.cover_id===a.id)),removable=chosen.filter(a=>!used.includes(a));
  if(!removable.length)return o.toast(`${used.length} зураг одоо Hero эсвэл өгүүллэгт ашиглагдаж байна. Эхлээд тэдгээрээс салгана уу.`,true);
  const button=$('#deleteSelectedMedia'),label=button.textContent;
  if(!confirm(`${removable.length} ашиглагдаагүй зургийг CMS сангаас хасах уу? R2 дээрх эх файлууд үлдэнэ.${used.length?` ${used.length} ашиглагдаж буй зураг хасагдахгүй.`:''}`))return;
  button.disabled=true;let removed=0,error=null;
  for(const a of removable){try{await removeAsset(a.id);selected.delete(a.id);removed++}catch(e){error=e;break}}
  try{await o.reload()}catch(e){error=error||e}render();button.textContent=label;
  if(error)o.toast(`${removed} зураг хаслаа. Үлдсэн сонголтыг шалгаад дахин оролдоно уу: ${error.message}`,true);
  else o.toast(`${removed} зургийг сангаас хаслаа${used.length?` · ${used.length} ашиглагдаж буйг алгасав`:''}.`);
 });
 $('#assetEditSave').addEventListener('click',async()=>{const a=asset(editingAssetId);if(!a)return;try{await updateAsset({id:a.id,filename:$('#assetEditName').value.trim()||a.filename,alt_text:$('#assetEditAlt').value.trim()});$('#assetEditModal').classList.add('hidden');await o.reload();render();o.toast('Зургийн мэдээлэл хадгалагдлаа')}catch(e){o.toast(e.message,true)}});
 $('#assetEditClose').addEventListener('click',()=>$('#assetEditModal').classList.add('hidden'));$('#assetEditModal').addEventListener('click',e=>{if(e.target.id==='assetEditModal')$('#assetEditModal').classList.add('hidden')});
 $('#mediaSearch').addEventListener('input',render);$('#selectVisibleMedia').addEventListener('click',()=>{filtered($('#mediaSearch').value).forEach(a=>selected.add(a.id));updateSelected()});$('#clearSelectedMedia').addEventListener('click',()=>{selected.clear();updateSelected()});
 $('#exportSelectedMedia').addEventListener('click',()=>o.download('adult-media-library.json',JSON.stringify({version:1,assets:assets().filter(a=>selected.has(a.id))},null,2)));
 $('#mergeMediaBackup').addEventListener('click',()=>$('#mediaBackupFile').click());$('#mediaBackupFile').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{const raw=JSON.parse(await file.text()),result=await mergeMedia(Array.isArray(raw)?raw:raw.assets);await o.reload();render();o.toast(`${result.added} зураг нэмлээ. Одоогийн сан хадгалагдсан.`)}catch(e){o.toast(e.message,true)}finally{event.target.value=''}});
 $('#addMediaUrl').addEventListener('click',async()=>{const url=safeUrl($('#mediaUrl').value);if(!url)return o.toast('Зөв HTTPS зураг URL оруулна уу.',true);try{const filename=new URL(url).pathname.split('/').pop()||'Image';await saveAsset({url,filename,alt_text:$('#mediaAlt').value.trim()||filename,public_id:'',asset_id:'',width:0,height:0,bytes:0,format:'external'});$('#mediaUrl').value='';$('#mediaAlt').value='';await o.reload();render();o.toast('Зургийн санд хадгаллаа')}catch(e){o.toast(e.message,true)}});
 function capture(scope){return scope==='library'?null:{scope,token:o.editor().token,storyId:o.editor().id,before:o.value(scope)}}
 function renderQueue(){
  if(!queueCollapsed)$('#uploadQueuePanel').classList.remove('hidden');const done=tasks.filter(t=>t.state==='done').length;$('#uploadQueueSummary').textContent=`Upload · ${done}/${tasks.length} хадгалсан`;
  $('#uploadQueue').innerHTML=tasks.map(t=>`<div class="upload-item ${t.state}"><div><strong title="${esc(t.file.name)}">${esc(t.file.name)}</strong><small>${esc(t.message)}</small></div>${t.state==='error'?`<button class="btn tiny secondary" data-retry-upload="${t.id}">Дахин</button>`:t.state==='queued'?`<button class="btn tiny outline" data-cancel-upload="${t.id}">✕</button>`:''}</div>`).join('');
 }
 async function applyBatch(batch,id){if(!batch?.target||batch.assigned)return;batch.assigned=true;const target=batch.target;
  if(target.kind==='saved-story'){await persistAssignment('story',target.storyId,id);return}
  if(target.scope==='story'&&target.token!==o.editor().token){o.toast('Зураг санд хадгалагдлаа. Өгүүллэг солигдсон тул cover-ийг өөрчлөөгүй.');return}
  if(o.value(target.scope)!==target.before){o.toast('Зураг санд хадгалагдлаа. Сонгосон cover-ийг хэвээр үлдээлээ.');return}
  choose(target.scope,id);o.toast('Зураг санд хадгалж cover-д сонголоо. Өөрчлөлтөө хадгална уу.');
 }
 async function processQueue(){if(running)return;running=true;try{for(const task of tasks){if(task.state!=='queued')continue;try{task.state='uploading';task.message=task.uploaded?'Санд дахин хадгалж байна…':'Зургийг upload хийж байна…';renderQueue();if(!task.uploaded)task.uploaded=await uploadImage(task.file,{upscale:task.upscale,onStatus:message=>{task.message=message;renderQueue()}});task.message='Зургийн санд хадгалж байна…';renderQueue();const saved=await saveAsset(task.uploaded);task.state='assigning';task.message='Cover сонголтыг шинэчилж байна…';await o.reload();await applyBatch(task.batch,saved.id);task.state='done';task.message='✓ '+(task.uploaded.uploadNotice||'Санд хадгалсан')}catch(e){task.state='error';task.message=e.message}renderQueue()}render()}finally{running=false;if(tasks.some(task=>task.state==='queued'))queueMicrotask(processQueue)}}
 function enqueue(files,target=null){if(!files.length)return;queueCollapsed=false;const batch={target,assigned:false};for(const file of files)tasks.push({id:++queueId,file,upscale:$('#autoUpscaleImages')?.checked!==false,state:'queued',message:'Дараалалд хүлээж байна',uploaded:null,batch});renderQueue();processQueue()}
 $('#uploadQueue').addEventListener('click',event=>{const retry=event.target.closest('[data-retry-upload]'),cancel=event.target.closest('[data-cancel-upload]');if(retry){const task=tasks.find(t=>t.id===Number(retry.dataset.retryUpload));if(task){task.state='queued';task.message='Дараалалд';renderQueue();processQueue()}}if(cancel){const task=tasks.find(t=>t.id===Number(cancel.dataset.cancelUpload));if(task?.state==='queued'){task.state='cancelled';task.message='Цуцлагдсан';renderQueue()}}});
 $('#closeUploadQueue').addEventListener('click',()=>{queueCollapsed=true;$('#uploadQueuePanel').classList.add('hidden')});
 let chosenTarget=null;
 function chooseUpload(scope){chosenTarget=capture(scope);$('#uploadInput').click()}
 $('#chooseUpload').addEventListener('click',event=>{event.stopPropagation();chooseUpload('library')});$('#storyJumpMedia').addEventListener('click',()=>chooseUpload('story'));$('#homeJumpMedia').addEventListener('click',()=>chooseUpload('home'));
 $('#uploadInput').addEventListener('change',event=>{enqueue([...event.target.files],chosenTarget);event.target.value='';chosenTarget=null});
 $('#dropZone').addEventListener('click',event=>{if(event.target.id!=='uploadInput'&&!event.target.closest('button'))chooseUpload('library')});
 function bindDrop(node,target){node.addEventListener('dragover',event=>{if([...event.dataTransfer.types].some(t=>t==='Files'||t===MEDIA)){event.preventDefault();node.classList.add('drag-over')}});node.addEventListener('dragleave',event=>{if(!node.contains(event.relatedTarget))node.classList.remove('drag-over')});node.addEventListener('drop',async event=>{event.preventDefault();event.stopPropagation();node.classList.remove('drag-over');const scope=target();if(event.dataTransfer.files.length){if(scope.scope==='library'&&event.dataTransfer.files.length===1&&event.dataTransfer.files[0].name.toLowerCase().endsWith('.json')){try{const raw=JSON.parse(await event.dataTransfer.files[0].text()),result=await mergeMedia(Array.isArray(raw)?raw:raw.assets);await o.reload();o.toast(`${result.added} зураг нэгтгэлээ.`)}catch(error){o.toast(error.message,true)}return}enqueue([...event.dataTransfer.files],scope.kind==='saved-story'?scope:capture(scope.scope));return}const id=event.dataTransfer.getData(MEDIA);if(!asset(id))return;if(scope.kind==='saved-story'){try{await persistAssignment('story',scope.storyId,id)}catch(e){o.toast(e.message,true)}}else if(scope.scope!=='library')choose(scope.scope,id)})}
 bindDrop($('#dropZone'),()=>({scope:'library'}));$$('[data-file-drop]').forEach(node=>bindDrop(node,()=>({scope:node.dataset.fileDrop})));
 document.addEventListener('dragstart',event=>{const card=event.target.closest('[data-media-id]');if(!card)return;const a=asset(card.dataset.mediaId);if(!a)return;event.dataTransfer.setData(MEDIA,a.id);event.dataTransfer.setData('text/uri-list',a.url);event.dataTransfer.effectAllowed='copy';card.classList.add('dragging')});document.addEventListener('dragend',()=>$$('.dragging,.drag-over').forEach(n=>n.classList.remove('dragging','drag-over')));
 const list=$('#storyList');
 list.addEventListener('dragstart',event=>{const row=event.target.closest('.story-row');if(!row)return;event.dataTransfer.setData(STORY,row.dataset.storyId);event.dataTransfer.effectAllowed='move';row.classList.add('dragging')});
 list.addEventListener('dragover',event=>{const row=event.target.closest('.story-row');if(row&&[...event.dataTransfer.types].some(t=>[MEDIA,STORY,'Files'].includes(t))){event.preventDefault();row.classList.add('drag-over')}});
 list.addEventListener('dragleave',event=>event.target.closest('.story-row')?.classList.remove('drag-over'));
 async function moveStory(id,before){const previous=[...data().stories].sort((a,b)=>(a.sort_order??100)-(b.sort_order??100)).map(s=>s.id);if(id===before)return;const next=previous.filter(x=>x!==id);next.splice(next.indexOf(before),0,id);try{await reorderStories(next);o.reordered(next);await o.reload();undoNotice('Өгүүллэгийн эрэмбэ хадгалагдлаа',{kind:'order',ids:previous})}catch(e){await o.reload();o.toast('Эрэмбийг бүрэн хадгалсангүй: '+e.message,true)}}
 list.addEventListener('drop',async event=>{const row=event.target.closest('.story-row');if(!row)return;event.preventDefault();event.stopPropagation();row.classList.remove('drag-over');const storyId=row.dataset.storyId,id=event.dataTransfer.getData(MEDIA),moved=event.dataTransfer.getData(STORY);if(event.dataTransfer.files.length)enqueue([...event.dataTransfer.files],{kind:'saved-story',storyId});else if(asset(id)){try{await persistAssignment('story',storyId,id)}catch(e){o.toast(e.message,true)}}else if(data().stories.some(s=>s.id===moved))await moveStory(moved,storyId)});
 list.addEventListener('click',event=>{const button=event.target.closest('[data-order-story]');if(!button)return;const sorted=[...data().stories].sort((a,b)=>(a.sort_order??100)-(b.sort_order??100)),index=sorted.findIndex(s=>s.id===button.dataset.orderStory),neighbor=sorted[index+(button.dataset.direction==='up'?-1:1)];if(!neighbor)return;if(button.dataset.direction==='up')moveStory(sorted[index].id,neighbor.id);else moveStory(neighbor.id,sorted[index].id)});
 document.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault()});document.addEventListener('drop',e=>{if([...e.dataTransfer.types].some(t=>t==='Files'||t===MEDIA)){e.preventDefault();o.toast('Зургаа Cover grid, Media Library эсвэл өгүүллэгийн мөр дээр чирнэ үү.')}});
 window.addEventListener('beforeunload',event=>{if(tasks.some(task=>['queued','uploading','assigning'].includes(task.state))){event.preventDefault();event.returnValue=''}});
 return {render,renderPickers,chooseUpload,pendingForStory(){const editor=o.editor();return tasks.some(t=>['queued','uploading','assigning'].includes(t.state)&&((t.batch?.target?.scope==='story'&&t.batch.target.token===editor.token)||(t.batch?.target?.kind==='saved-story'&&t.batch.target.storyId===editor.id)))}};
}
