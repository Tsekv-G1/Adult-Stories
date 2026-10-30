import {importCloudBackup} from './cloud-import.js?v=6.2.0';
import {createMediaWorkspace} from './media-workspace.js?v=6.2.0';
import {CONFIG,online,$,$$,esc,overlayCSS,overlayDefault,safeUrl,getData,getBody,saveStory,removeStory,saveSite,saveAsset,updateAsset,removeAsset,uploadCloudinary,session,signIn,signOut,isAdmin,persistenceInfo,importLocalBackup} from './core.js?v=6.2.0';
import {visualDefault,cloudSettings,visualFor,cropFor,applyPhoto,audioSeconds,clockDuration,automaticSlug,automaticPublishAt,measureAudio} from './studio.js?v=6.2.0';
let mediaWorkspace=null;
let data=null,active='overview',editing=null,returnSlot=null,editingAssetId=null,pendingImport=null;
let storyOverlay=overlayDefault(),homeOverlay=overlayDefault(),themeDraft=visualDefault();
let storyDirty=false,homeDirty=false,themeDirty=false,settingsDirty=false,bodyReady=true,editToken=0;
let audioState={url:'',seconds:0,status:'empty',promise:null},audioToken=0,audioProbeTimer;
let bodyData={full_text:'',full_audio_url:''};
const cropDevices={story:'desktop',home:'desktop'},previewModes={story:'desktop',home:'desktop',design:'desktop'},previewViews={story:'reader',home:'home',design:'home'};
const toast=(message,problem=false)=>{const box=$('#toast');box.textContent=message;box.style.borderColor=problem?'#ad3e56':'#248452';box.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>box.classList.add('hidden'),4800)};
const working=t=>$('#saveStatus').textContent=t;
const asset=id=>data?.assets.find(a=>a.id===id);
const allStories=()=>data?.stories||[];
const statusNames={draft:'Ноорог',published:'Нийтлэгдсэн',archived:'Архив'};
function setTab(t){active=t;$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));$$('[data-section]').forEach(s=>s.classList.toggle('active',s.dataset.section===t));if(t==='media')renderMedia();if(t==='stories')renderList();queuePreviews()}
function setEditorTab(tab){$$('[data-editor-tab]').forEach(b=>{const on=b.dataset.editorTab===tab;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on))});$$('[data-editor-pane]').forEach(p=>{const on=p.dataset.editorPane===tab;p.hidden=!on;p.classList.toggle('active',on)});queuePreviews()}
$$('[data-editor-tab]').forEach(b=>b.addEventListener('click',()=>setEditorTab(b.dataset.editorTab)));
$$('[data-open-design]').forEach(b=>b.addEventListener('click',()=>setTab('design')));
function markStory(){if(!data)return;storyDirty=true;working('Хадгалаагүй өөрчлөлт');updateStoryMeta();queuePreviews()}
function updateStoryMeta(){
 $('#storyAutoSlug').textContent=$('#storyTitle').value.trim()?automaticSlug($('#storyTitle').value,allStories(),editing):'Гарчгаас автоматаар';
 $('#storyPublishedAt').textContent=editing?.publish_at?new Date(editing.publish_at).toLocaleString('mn-MN'):'Нийтлэх үед автоматаар';
 $('#storyCoverTitle').textContent=$('#storyTitle').value||'Өгүүллэгийн гарчиг';
 $('#storyCurrentStatus').textContent=statusNames[$('#storyStatus').value];
 $('#storyEditorTitle').textContent=$('#storyTitle').value||'Шинэ өгүүллэг';
 $('#saveStory').textContent='ХАДГАЛАХ';$('#saveStory').classList.toggle('is-dirty',storyDirty);
}
function showOriginal(url){if(!url)return toast('Эх зураг сонгоогүй байна',true);$('#lightboxImage').src=url;$('#lightbox').classList.remove('hidden')}
$('#lightbox').addEventListener('click',()=>$('#lightbox').classList.add('hidden'));
function imagePreview(scope){
 const node=$(`#${scope}ImagePreview`),overlay=scope==='story'?storyOverlay:homeOverlay,id=$(`#${scope==='story'?'storyCover':'homeImage'}`).value;
 let im=node.querySelector('img'),a=asset(id);if(a){if(!im){im=document.createElement('img');im.draggable=false;node.prepend(im)}if(im.getAttribute('src')!==a.url)im.src=a.url;im.alt=a.alt_text||a.filename||'Зураг';applyPhoto(im,visualFor({visual_theme:themeDraft},overlay,cropDevices[scope]==='mobile'))}else im?.remove();
 node.querySelector('.cover-overlay').style.background=overlayCSS(visualFor({visual_theme:themeDraft},overlay));
 node.classList.toggle('has-image',Boolean(a));
}
function cropControlHTML(scope){return `<div class="crop-device-bar"><strong>Зургийн байрлал</strong><div class="segmented"><button type="button" class="active" data-crop-device="desktop" data-crop-scope="${scope}">Desktop</button><button type="button" data-crop-device="mobile" data-crop-scope="${scope}">Утас</button></div></div><div class="form-stack"><div class="field"><label for="${scope}Zoom">Zoom <output id="${scope}ZoomLabel"></output></label><input id="${scope}Zoom" type="range" min="100" max="300" step="1"></div><div class="field"><label for="${scope}Y">Дээш / доош <output id="${scope}YLabel"></output></label><input id="${scope}Y" type="range" min="0" max="100"></div><div class="field"><label for="${scope}X">Зүүн / баруун <output id="${scope}XLabel"></output></label><input id="${scope}X" type="range" min="0" max="100"></div><div class="field"><label for="${scope}Fit">Харагдац</label><select id="${scope}Fit"><option value="cover">Cover · талбайг дүүргэх</option><option value="contain">Contain · бүтнээр</option></select></div><button type="button" class="btn tiny outline" data-reset-crop="${scope}">Байрлалыг анхны болгох</button></div>`}
for(const scope of ['story','home'])$(`#${scope}GradientControls`).innerHTML=cropControlHTML(scope);
function controlsSet(scope,values){if(scope==='story')storyOverlay={...values};else homeOverlay={...values};drawCropControls(scope)}
function drawCropControls(scope){const source=scope==='story'?storyOverlay:homeOverlay,e=cropFor(source,cropDevices[scope]==='mobile');for(const key of ['X','Y','Zoom']){$(`#${scope}${key}`).value=key==='Zoom'?Math.round(e.zoom*100):e[key.toLowerCase()];$(`#${scope}${key}Label`).textContent=key==='Zoom'?Math.round(e.zoom*100)+'%':Math.round(e[key.toLowerCase()])+'%'}$(`#${scope}Fit`).value=e.fit;$$(`[data-crop-scope="${scope}"]`).forEach(b=>b.classList.toggle('active',b.dataset.cropDevice===cropDevices[scope]));imagePreview(scope)}
function updateCrop(scope,patch){let source=scope==='story'?storyOverlay:homeOverlay;if(cropDevices[scope]==='mobile')source.mobile={...cropFor(source,true),...patch};else Object.assign(source,patch);drawCropControls(scope);if(scope==='story')markStory();else{homeDirty=true;working('Нүүр хуудасны хадгалаагүй өөрчлөлт');queuePreviews()}}
for(const scope of ['story','home']){
 for(const key of ['X','Y','Zoom','Fit'])$(`#${scope}${key}`).addEventListener('input',()=>updateCrop(scope,{[key.toLowerCase()]:key==='Fit'?$(`#${scope}${key}`).value:Number($(`#${scope}${key}`).value)/(key==='Zoom'?100:1)}));
 $(`[data-reset-crop="${scope}"]`).addEventListener('click',()=>updateCrop(scope,{x:50,y:50,zoom:1,fit:'cover'}));
 const node=$(`#${scope}ImagePreview`);let drag=null;
 node.addEventListener('pointerdown',e=>{const im=node.querySelector('img');if(!im||!im.naturalWidth)return;const box=node.getBoundingClientRect(),crop=cropFor(scope==='story'?storyOverlay:homeOverlay,cropDevices[scope]==='mobile'),ratio=(crop.fit==='contain'?Math.min:Math.max)(box.width/im.naturalWidth,box.height/im.naturalHeight);drag={id:e.pointerId,x:e.clientX,y:e.clientY,crop,overflowX:Math.max(1,im.naturalWidth*ratio*crop.zoom-box.width),overflowY:Math.max(1,im.naturalHeight*ratio*crop.zoom-box.height)};node.setPointerCapture(e.pointerId);node.classList.add('dragging')});
 node.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;updateCrop(scope,{x:Math.max(0,Math.min(100,drag.crop.x-(e.clientX-drag.x)/drag.overflowX*100)),y:Math.max(0,Math.min(100,drag.crop.y-(e.clientY-drag.y)/drag.overflowY*100))})});
 const end=()=>{drag=null;node.classList.remove('dragging')};node.addEventListener('pointerup',end);node.addEventListener('pointercancel',end);node.addEventListener('lostpointercapture',end);
}
$$('[data-crop-device]').forEach(b=>b.addEventListener('click',()=>{const scope=b.dataset.cropScope;cropDevices[scope]=b.dataset.cropDevice;previewModes[scope]=b.dataset.cropDevice;drawCropControls(scope);queuePreviews()}));
function fillAssetSelect(input,value=''){input.value=(data?.assets||[]).some(a=>a.id===value)?value:'';mediaWorkspace?.renderPickers()}
function fillCategories(value){const cats=new Set([...(data.site.categories||[]),...allStories().map(x=>x.category).filter(Boolean)]);if(value)cats.add(value);$('#storyCategory').innerHTML=[...cats].map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');$('#storyCategory').value=value||[...cats][0]||''}
function dashboard(){const stories=allStories();$('#dashboardStats').innerHTML=[['Нийт өгүүллэг',stories.length],['Нийтлэгдсэн',stories.filter(s=>s.status==='published').length],['Ноорог',stories.filter(s=>s.status==='draft').length],['Media assets',data.assets.length]].map(([k,v])=>`<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');$('#recentStories').innerHTML=stories.slice(0,7).map(s=>`<div class="recent-story"><div><strong>${esc(s.title)}</strong><small>${esc(s.category)}</small></div><span class="status ${esc(s.status)}">${statusNames[s.status]||esc(s.status)}</span></div>`).join('')||'<div class="empty">Өгүүллэг алга.</div>';
 $('#connectionLabel').textContent=online?'Supabase · Online':persistenceInfo().mode==='disk'?'Компьютерт файлд хадгалсан':'Зөвхөн энэ браузерт';$('#modeBadge').textContent=online?'LIVE / SUPABASE':persistenceInfo().mode==='disk'?'LOCAL FILE':'BROWSER DEMO';$('#syncExplainer').textContent=online?'Хадгалсан өөрчлөлт Supabase руу шууд бичигдэнэ.':persistenceInfo().mode==='disk'?'Контент, зургийн сан компьютерийн Documents / Adult Stories CMS дотор файлд хадгалагдана. Сервер дахин асаахад хэвээр байна.':'Энэ горим зөвхөн браузерт хадгална. start.py-аар асаавал файлд хадгалдаг болно.';$('#setupAlert').textContent=online?'Онлайн холболт идэвхтэй.':persistenceInfo().mode==='disk'?'Файл хадгалалт идэвхтэй · Өөр төхөөрөмжийн sync хийхэд Supabase холбоно.':'Браузерийн горим · start.py-аар файл хадгалалтыг асаана.';
}
function renderList(){if(!data)return;const q=$('#storyListSearch').value.toLowerCase(),status=$('#storyListStatus').value;const list=allStories().filter(s=>(status==='all'||status===s.status)&&`${s.title} ${s.category}`.toLowerCase().includes(q)).sort((a,b)=>Number(a.sort_order??100)-Number(b.sort_order??100));$('#storyList').innerHTML=list.map(s=>`<div class="story-row" draggable="true" data-story-id="${esc(s.id)}"><button class="list-button ${editing?.id===s.id?'active':''}" data-edit="${esc(s.id)}"><strong><span class="story-grip" aria-hidden="true">⠿</span>${esc(s.title)}</strong><small>${esc(s.category)} · <span class="status ${esc(s.status)}">${statusNames[s.status]||esc(s.status)}</span></small></button><div class="story-order-buttons"><button type="button" data-order-story="${esc(s.id)}" data-direction="up" aria-label="${esc(s.title)} дээш эрэмбэлэх">↑</button><button type="button" data-order-story="${esc(s.id)}" data-direction="down" aria-label="${esc(s.title)} доош эрэмбэлэх">↓</button></div></div>`).join('')||'<div class="empty">Өгүүллэг олдсонгүй.</div>'}
function showAudioState(message=''){$('#storyDuration').textContent=audioState.seconds?`${clockDuration(audioState.seconds)} · ${Math.ceil(audioState.seconds/60)} мин`:audioState.status==='loading'?'Уншиж байна…':'Аудио оруулаагүй';$('#audioMeasureStatus').textContent=message||(audioState.seconds?'Бүтэн аудионы бодит хугацаа · автоматаар':'URL оруулсны дараа автоматаар шалгана.');$('#measureAudio').disabled=audioState.status==='loading'}
function resetAudio(url='',seconds=0){clearTimeout(audioProbeTimer);audioToken++;seconds=url?(Number(seconds)||0):0;audioState={url,seconds,status:seconds?'ready':'empty',promise:null};showAudioState()}
async function probeFullAudio(force=false){
 const raw=$('#storyAudioFull').value.trim(),url=safeUrl(raw);if(!raw){resetAudio();return true}if(!url){resetAudio();audioState.status='error';showAudioState('Зөв HTTPS эсвэл localhost аудио URL оруулна уу.');return false}
 if(!force&&audioState.url===url&&audioState.seconds>0)return true;
 if(!force&&audioState.url===url&&audioState.promise)return audioState.promise;
 const token=++audioToken;audioState={url,seconds:0,status:'loading',promise:null};showAudioState();
 const promise=measureAudio(url).then(seconds=>{if(token!==audioToken)return false;audioState={url,seconds,status:'ready',promise:null};showAudioState();markStory();return true}).catch(e=>{if(token!==audioToken)return false;audioState={url,seconds:0,status:'error',promise:null};showAudioState(e.message);return false});audioState.promise=promise;return promise;
}
$('#storyAudioFull').addEventListener('input',()=>{if(safeUrl($('#storyAudioFull').value)!==audioState.url)resetAudio();markStory();clearTimeout(audioProbeTimer);audioProbeTimer=setTimeout(()=>probeFullAudio(),650)});$('#storyAudioFull').addEventListener('change',()=>probeFullAudio());$('#measureAudio').addEventListener('click',()=>probeFullAudio(true));
function newStory({force=false}={}){if(!force&&storyDirty&&!confirm('Хадгалаагүй өөрчлөлтийг орхиод шинэ өгүүллэг нээх үү?'))return;editToken++;editing=null;bodyData={full_text:'',full_audio_url:''};bodyReady=true;for(const id of ['storyTitle','storyExcerpt','storyPreview','storyFull','storyTags','storyAudioPreview','storyAudioFull'])$('#'+id).value='';$('#storyFull').disabled=false;$('#storyAudioFull').disabled=false;$('#storyPrice').value=9900;$('#storyOrder').value=allStories().length+1;$('#storyStatus').value='draft';fillCategories();fillAssetSelect($('#storyCover'));resetAudio();controlsSet('story',overlayDefault());storyDirty=false;$('#saveStory').disabled=false;updateStoryMeta();renderList();setEditorTab('content')}
async function editStory(id,{force=false}={}){
 if(!force&&storyDirty&&!confirm('Хадгалаагүй өөрчлөлтийг орхиод өгүүллэг солих уу?'))return;
 const s=allStories().find(x=>x.id===id);if(!s)return;const token=++editToken;editing=structuredClone(s);bodyReady=false;bodyData={full_text:'',full_audio_url:''};
 for(const [key,value] of Object.entries({storyTitle:s.title,storyExcerpt:s.excerpt,storyPreview:s.preview_text,storyPrice:s.price,storyOrder:s.sort_order,storyStatus:s.status,storyTags:(s.tags||[]).join(', '),storyAudioPreview:s.audio_preview_url||''}))$('#'+key).value=value??'';
 $('#storyFull').value='';$('#storyAudioFull').value='';$('#storyFull').disabled=true;$('#storyAudioFull').disabled=true;$('#saveStory').disabled=true;resetAudio();fillCategories(s.category);fillAssetSelect($('#storyCover'),s.cover_id);controlsSet('story',s.overlay||overlayDefault());storyDirty=false;updateStoryMeta();renderList();working('Хувийн агуулгыг ачаалж байна…');queuePreviews();
 try{const body=await getBody(id);if(token!==editToken)return;bodyData=body;$('#storyFull').value=body.full_text||'';$('#storyAudioFull').value=body.full_audio_url||'';bodyReady=true;$('#storyFull').disabled=false;$('#storyAudioFull').disabled=false;$('#saveStory').disabled=false;resetAudio(safeUrl(body.full_audio_url),audioSeconds(s));working('Бэлэн');if(body.full_audio_url&&!audioSeconds(s))probeFullAudio()}
 catch(e){if(token!==editToken)return;working('Хувийн агуулга уншигдсангүй');toast('Хувийн текст ачаалсангүй. Өгүүллэгээ дахин сонгож ачаална уу. '+e.message,true)}
}
function formStory(validate=true){
 const title=$('#storyTitle').value.trim();if(validate&&(!title||!$('#storyExcerpt').value.trim()||!$('#storyPreview').value.trim()))throw Error('Гарчиг, товч танилцуулга, preview текстээ бөглөнө үү.');
 const seconds=audioState.url===safeUrl($('#storyAudioFull').value)?audioState.seconds:0,overlay={...storyOverlay,audio_seconds:seconds};
 return {...(editing||{}),title,slug:automaticSlug(title,allStories(),editing),category:$('#storyCategory').value,status:$('#storyStatus').value,excerpt:$('#storyExcerpt').value.trim(),preview_text:$('#storyPreview').value.trim(),cover_id:$('#storyCover').value||null,overlay,price:Math.max(0,Number($('#storyPrice').value)||0),read_minutes:Math.max(1,Math.ceil(seconds/60)),sort_order:Math.max(0,Number($('#storyOrder').value)||0),tags:$('#storyTags').value.split(',').map(x=>x.trim()).filter(Boolean),audio_preview_url:safeUrl($('#storyAudioPreview').value),publish_at:automaticPublishAt($('#storyStatus').value,editing?.publish_at)};
}
async function reload({reset=false}={}){
 working('Контент уншиж байна…');const first=!data,storyCover=$('#storyCover').value,homeImage=$('#homeImage').value,category=$('#storyCategory').value;
 data=await getData({admin:true});data.site=cloudSettings(data.site,CONFIG);if(data.site.cloudinary_name)CONFIG.cloudName=data.site.cloudinary_name;if(data.site.upload_preset)CONFIG.unsignedUploadPreset=data.site.upload_preset;
 if(first||reset){fillHome();fillSettings();fillDesign();homeDirty=false;settingsDirty=false}else{fillAssetSelect($('#homeImage'),homeImage);const featured=$('#homeFeatured').value;$('#homeFeatured').innerHTML='<option value="">Автоматаар сонгох</option>'+allStories().map(st=>`<option value="${esc(st.id)}">${esc(st.title)}</option>`).join('');$('#homeFeatured').value=featured;imagePreview('home')}
 fillAssetSelect($('#storyCover'),storyCover);fillCategories(category);imagePreview('story');dashboard();renderList();renderMedia();working('Синхрончилсон');queuePreviews();
}
async function saveStoryAction(){
 try{if(!bodyReady)throw Error('Хувийн агуулга бүрэн ачаалагдаагүй байна. Өгүүллэгээ дахин сонгоно уу.');formStory();$('#saveStory').disabled=true;working('Хадгалж байна…');
 const fullRaw=$('#storyAudioFull').value.trim(),previewRaw=$('#storyAudioPreview').value.trim();if(fullRaw&&!safeUrl(fullRaw))throw Error('Бүтэн аудио URL буруу байна.');if(previewRaw&&!safeUrl(previewRaw))throw Error('Preview аудио URL буруу байна.');
 const measured=await probeFullAudio();if(fullRaw&&!measured&&$('#storyStatus').value==='published')throw Error('Нийтлэхээс өмнө бүтэн аудионы хугацааг уншуулах шаардлагатай. URL-аа шалгах эсвэл ноорог хадгална уу.');
 const saved=await saveStory(formStory(),{full_text:$('#storyFull').value,full_audio_url:safeUrl(fullRaw)});storyDirty=false;await reload();await editStory(saved.id,{force:true});toast('Өгүүллэг хадгалагдлаа · '+statusNames[saved.status]);
 }catch(e){working('Хадгалж чадсангүй');toast(e.message,true)}finally{$('#saveStory').disabled=!bodyReady}
}
$('#storyList').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)editStory(b.dataset.edit)});$('#newStory').addEventListener('click',()=>newStory());$('#overviewNew').addEventListener('click',()=>{setTab('stories');newStory()});$('#storyListSearch').addEventListener('input',renderList);$('#storyListStatus').addEventListener('change',renderList);
$$('.story-editor input,.story-editor textarea,.story-editor select').filter(el=>!el.closest('#storyGradientControls')&&!el.closest('[data-asset-picker]')&&el.id!=='storyAudioFull').forEach(el=>el.addEventListener('input',markStory));
$('#storyCover').addEventListener('change',()=>{imagePreview('story');markStory()});$('#homeImage').addEventListener('change',()=>{imagePreview('home');homeDirty=true;queuePreviews()});
$('#saveStory').addEventListener('click',saveStoryAction);
$('#deleteStory').addEventListener('click',async()=>{if(!editing)return toast('Устгах өгүүллэг сонгоогүй',true);if(!confirm('“'+editing.title+'” өгүүллэгийг бүр мөсөн устгах уу?'))return;try{await removeStory(editing.id);storyDirty=false;await reload();newStory({force:true});toast('Өгүүллэг устгагдлаа')}catch(e){toast(e.message,true)}});
$('#duplicateStory').addEventListener('click',()=>{if(!bodyReady)return toast('Хувийн агуулгаа эхлээд ачаална уу.',true);const title=$('#storyTitle').value.trim();if(!title)return toast('Хуулбарлах өгүүллэгээ сонгоно уу.',true);editToken++;editing=null;$('#storyTitle').value=title+' — хуулбар';$('#storyStatus').value='draft';markStory();renderList();toast('Хуулбар бэлэн. Хадгалахад шинэ өгүүллэг үүснэ.')});
$('#previewStory').addEventListener('click',()=>{setEditorTab('cover');queuePreviews();toast('Хадгалаагүй өөрчлөлтийг бодит layout дээр харуулж байна.')});
$('#storyFullImage').addEventListener('click',()=>showOriginal(asset($('#storyCover').value)?.url));$('#homeFullImage').addEventListener('click',()=>showOriginal(asset($('#homeImage').value)?.url));
function renderMedia(){mediaWorkspace?.render()}
function fillHome(){const s=data.site;for(const [id,key] of Object.entries({homeKicker:'hero_kicker',homeHeading:'hero_heading',homeAccent:'hero_accent',homeDescription:'hero_description'}))$('#'+id).value=s[key]||'';$('#homeFeatured').innerHTML='<option value="">Автоматаар сонгох</option>'+allStories().map(st=>`<option value="${esc(st.id)}">${esc(st.title)}</option>`).join('');$('#homeFeatured').value=s.featured_story_id||'';fillAssetSelect($('#homeImage'),s.hero_asset_id);controlsSet('home',s.hero_overlay||overlayDefault());renderHomePreview()}
function homeDraft(){return {...data.site,hero_kicker:$('#homeKicker').value,hero_heading:$('#homeHeading').value,hero_accent:$('#homeAccent').value,hero_description:$('#homeDescription').value,featured_story_id:$('#homeFeatured').value||null,hero_asset_id:$('#homeImage').value||null,hero_overlay:homeOverlay}}
function renderHomePreview(){$('#homePreviewTitle').textContent=$('#homeHeading').value+' '+$('#homeAccent').value;imagePreview('home');queuePreviews()}
for(const id of ['homeKicker','homeHeading','homeAccent','homeDescription','homeFeatured'])$('#'+id).addEventListener('input',()=>{homeDirty=true;renderHomePreview()});
$('#saveHomepage').addEventListener('click',async()=>{const button=$('#saveHomepage');try{button.disabled=true;await saveSite(homeDraft());homeDirty=false;await reload();toast('Нүүр хуудас хадгалагдлаа')}catch(e){toast(e.message,true)}finally{button.disabled=false}});
const themePresets={crimson:{red:38,dark:55,direction:105,tint:'#db123a'},noir:{red:0,dark:68,direction:110,tint:'#db123a'},soft:{red:22,dark:40,direction:95,tint:'#db123a'}};
function fillDesign(){themeDraft={...visualDefault(),...data.site.visual_theme};themeDirty=false;drawThemeControls();imagePreview('story');imagePreview('home')}
function drawThemeControls(){for(const key of ['Red','Dark','Direction']){$('#theme'+key).value=themeDraft[key.toLowerCase()];$('#theme'+key+'Label').textContent=themeDraft[key.toLowerCase()]+(key==='Direction'?'°':'%')}$('#themeGrayscale').checked=themeDraft.grayscale;$$('[data-theme-preset]').forEach(b=>b.classList.toggle('active',b.dataset.themePreset===themeDraft.preset));$('#designSaveStatus').textContent=themeDirty?'Хадгалаагүй · Preview дээр бүх зураг өөрчлөгдсөн.':'Хадгалсан нэгдсэн загвар';}
function themeChanged(){themeDirty=true;drawThemeControls();imagePreview('story');imagePreview('home');renderMedia();queuePreviews();working('Дизайны хадгалаагүй өөрчлөлт')}
$$('[data-theme-preset]').forEach(b=>b.addEventListener('click',()=>{Object.assign(themeDraft,themePresets[b.dataset.themePreset],{preset:b.dataset.themePreset});themeChanged()}));
for(const key of ['Red','Dark','Direction'])$('#theme'+key).addEventListener('input',()=>{themeDraft[key.toLowerCase()]=Number($('#theme'+key).value);themeDraft.preset='custom';themeChanged()});$('#themeGrayscale').addEventListener('change',()=>{themeDraft.grayscale=$('#themeGrayscale').checked;themeChanged()});
$('#saveDesign').addEventListener('click',async()=>{const button=$('#saveDesign');try{button.disabled=true;await saveSite({...data.site,visual_theme:{...themeDraft}});themeDirty=false;await reload();drawThemeControls();toast('Нэгдсэн дизайн бүх сайтад хадгалагдлаа')}catch(e){toast(e.message,true)}finally{button.disabled=false}});
let previewTimer;
function queuePreviews(){clearTimeout(previewTimer);previewTimer=setTimeout(renderPreviews,100)}
function previewPayload(scope){
 const site={...homeDraft(),visual_theme:{...themeDraft}};let rows=allStories().map(s=>({...s}));const draft=formStory(false),currentId=editing?.id||'studio-draft';
 if(draft.title){const item={...draft,id:currentId,status:'published',publish_at:null};rows=rows.filter(s=>s.id!==currentId);rows.unshift(item)}
 return {type:'adult-studio-preview',data:{site,stories:rows,assets:data.assets,bodies:[]},view:previewViews[scope],storyId:draft.title?currentId:site.featured_story_id||rows[0]?.id};
}
function fitPreview(scope){const frame=$(`[data-preview-frame="${scope}"]`),stage=frame.parentElement;if(!stage.clientWidth)return;const width=previewModes[scope]==='mobile'?390:1180,height=previewModes[scope]==='mobile'?800:840,scale=Math.min(1,stage.clientWidth/width);frame.style.width=width+'px';frame.style.height=height+'px';frame.style.transform=`scale(${scale})`;frame.style.left=Math.max(0,(stage.clientWidth-width*scale)/2)+'px';stage.style.height=Math.ceil(height*scale)+'px';frame.closest('.site-preview').querySelector('.preview-caption').textContent=`${width} px · ${previewModes[scope]==='mobile'?'Утас':'Desktop'} · Preview дотор scroll хийж болно.`;$$(`[data-preview-scope="${scope}"]`).forEach(b=>b.classList.toggle('active',b.dataset.viewport===previewModes[scope]))}
function renderPreviews(){if(!data)return;for(const scope of ['story','home','design']){const frame=$(`[data-preview-frame="${scope}"]`);if(!frame.closest('[data-section]').classList.contains('active')||(scope==='story'&&$('#paneCover').hidden))continue;fitPreview(scope);if(!frame.getAttribute('src'))frame.src='index.html?studio=1&v=6.2.0'+(CONFIG.localContentMode?'&local=1':'');if(frame.dataset.ready==='yes')frame.contentWindow.postMessage(previewPayload(scope),location.origin)}}
$$('[data-viewport]').forEach(b=>b.addEventListener('click',()=>{const scope=b.dataset.previewScope;previewModes[scope]=b.dataset.viewport;if(scope!=='design'){cropDevices[scope]=b.dataset.viewport;drawCropControls(scope)}queuePreviews()}));
$$('[data-preview-view]').forEach(select=>{select.value=previewViews[select.dataset.previewView];select.addEventListener('change',()=>{previewViews[select.dataset.previewView]=select.value;queuePreviews()})});
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.data?.type!=='adult-studio-ready')return;const frame=$$('[data-preview-frame]').find(f=>f.contentWindow===event.source);if(frame){frame.dataset.ready='yes';queuePreviews()}});
const previewObserver=new ResizeObserver(()=>{for(const scope of ['story','home','design'])fitPreview(scope)});$$('.preview-stage').forEach(stage=>previewObserver.observe(stage));
window.addEventListener('beforeunload',e=>{if(storyDirty||homeDirty||themeDirty||settingsDirty){e.preventDefault();e.returnValue=''}});
function fillSettings(){let s=data.site;$('#settingBrand').value=s.brand||'';$('#settingCategories').value=(s.categories||[]).join('\n');$('#settingMembership').value=s.membership_price||0;$('#settingAnnouncement').value=s.announcement||'';$('#settingSeoTitle').value=s.seo_title||'';$('#settingSeoDescription').value=s.seo_description||'';$('#settingCloudName').value=s.cloudinary_name||CONFIG.cloudName||'';$('#settingPreset').value=s.upload_preset||CONFIG.unsignedUploadPreset||''}
$('#saveSettings').addEventListener('click',async()=>{try{let s={...data.site,brand:$('#settingBrand').value,categories:[...new Set($('#settingCategories').value.split('\n').map(x=>x.trim()).filter(Boolean))],membership_price:Math.max(0,Number($('#settingMembership').value)||0),announcement:$('#settingAnnouncement').value,seo_title:$('#settingSeoTitle').value,seo_description:$('#settingSeoDescription').value,cloudinary_name:$('#settingCloudName').value.trim(),upload_preset:$('#settingPreset').value.trim()};if(!/^[\w-]+$/.test(s.cloudinary_name))throw Error('Cloud name буруу байна');CONFIG.cloudName=s.cloudinary_name;CONFIG.unsignedUploadPreset=s.upload_preset;await saveSite(s);settingsDirty=false;await reload();toast('Системийн тохиргоо хадгалагдлаа')}catch(e){toast(e.message,true)}});
function downloadFile(name,text){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
$('#exportBackup').addEventListener('click',async()=>{try{working('Backup бэлдэж байна...');let b=JSON.parse(JSON.stringify(data));b.bodies=[];for(let s of b.stories)b.bodies.push(await getBody(s.id));downloadFile('adult-stories-cms-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({...b,export_version:6,exported_at:new Date().toISOString()},null,2));working('Backup бэлэн');toast('JSON backup татагдлаа')}catch(e){toast(e.message,true)}});
$('#importBackup').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{let raw=JSON.parse(await f.text());if(!Array.isArray(raw.stories)||!Array.isArray(raw.assets)||!raw.site)throw Error('Backup JSON формат буруу');pendingImport=raw;toast(`${raw.stories.length} өгүүллэг, ${raw.assets.length} зурагтай backup уншлаа.`)}catch(err){toast(err.message,true)}});
$('#performImport').addEventListener('click',async()=>{
 if(!pendingImport)return toast('Эхлээд backup файл сонгоно уу',true);
 const backup=pendingImport,homepage=!!$('#importHomepage')?.checked,button=$('#performImport');
 if(!confirm(online?`${backup.stories.length} өгүүллэг, ${backup.assets.length} зургийг Supabase руу нэмэх үү? Ижил холбоостой одоогийн өгүүллэгийг алгасна. ${homepage?'Нүүр хуудасны дизайн, тохиргоог backup-аар солино.':'Нүүр хуудасны тохиргоог хэвээр үлдээнэ.'}`:'Одоогийн локал контентыг backup-оор солих уу?'))return;
 button.disabled=true;
 try{
  if(online){const result=await importCloudBackup(backup,{homepage,onProgress:working});toast(`${result.stories} өгүүллэг, ${result.assets} зураг нэмлээ. ${result.skipped} өгүүллэг алгассан.`)}
  else{await importLocalBackup(backup);toast('Локал backup импорт амжилттай')}
  pendingImport=null;storyDirty=false;await reload({reset:true});newStory({force:true});working('Импорт дууслаа');
 }catch(error){working('Импорт зогслоо. Нэмэгдсэн зүйлс хадгалагдсан; ижил backup-аар дахин оролдож болно.');toast(error.message,true)}finally{button.disabled=false}
});
$('#adminNav').addEventListener('click',e=>{let b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab)});$('#refreshBtn').addEventListener('click',async()=>{try{if((homeDirty||themeDirty||settingsDirty)&&!confirm('Хадгалаагүй сайтын тохиргоог орхиод серверээс шинэчлэх үү?'))return;await reload({reset:true});toast('Серверээс шинэчиллээ')}catch(e){toast(e.message,true)}});
$('#logoutBtn').addEventListener('click',async()=>{if(online){await signOut();$('#appRoot').classList.add('hidden');$('#loginWrap').classList.remove('hidden')}else location.href='index.html'+(CONFIG.localContentMode?'?local=1':'')});
$$('[data-editor-tab]').forEach((button,index)=>button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=$$('[data-editor-tab]'),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[next].focus();setEditorTab(tabs[next].dataset.editorTab)}));
$('#loginBtn').addEventListener('click',login);$('#loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
async function login(){try{$('#loginError').classList.add('hidden');working('Нэвтэрч байна...');await signIn($('#loginEmail').value,$('#loginPassword').value);if(!await isAdmin()){await signOut();throw Error('Энэ хэрэглэгч admin_users бүртгэлд алга.');}$('#loginWrap').classList.add('hidden');$('#appRoot').classList.remove('hidden');await reload();newStory()}catch(e){$('#loginError').textContent=e.message;$('#loginError').classList.remove('hidden')}}
$$('[data-section="settings"] input,[data-section="settings"] textarea').forEach(el=>el.addEventListener('input',()=>{settingsDirty=true}));
mediaWorkspace=createMediaWorkspace({
 data:()=>data,theme:()=>themeDraft,editor:()=>({id:editing?.id,token:editToken,title:$('#storyTitle').value}),value:scope=>$(scope==='story'?'#storyCover':'#homeImage').value,
 toast,original:showOriginal,reload,download:downloadFile,
 select:(scope,id)=>{const input=$(scope==='story'?'#storyCover':'#homeImage');input.value=id||'';imagePreview(scope);if(scope==='story')markStory();else{homeDirty=true;queuePreviews()}},
 assigned:(kind,id,assetId)=>{if(kind==='home'){$('#homeImage').value=assetId||'';imagePreview('home')}else if(editing?.id===id){editing.cover_id=assetId;$('#storyCover').value=assetId||'';imagePreview('story')}queuePreviews()},
 removed:id=>{if($('#storyCover').value===id){$('#storyCover').value='';if(editing)editing.cover_id=null;imagePreview('story')}if($('#homeImage').value===id){$('#homeImage').value='';imagePreview('home')}},
 reordered:ids=>{if(editing&&ids.includes(editing.id)){editing.sort_order=ids.indexOf(editing.id)+1;$('#storyOrder').value=editing.sort_order}},
 openCover:()=>{setTab('stories');setEditorTab('cover')}
});
window.addEventListener('keydown',event=>{
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();if(document.querySelector('dialog[open]'))return;const button={stories:'saveStory',homepage:'saveHomepage',design:'saveDesign',settings:'saveSettings'}[active];if(button)$('#'+button).click();else toast('Хадгалах өөрчлөлт энэ хэсэгт алга.');}
 if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.target.closest('input,textarea,select,[contenteditable=true]')){const search=active==='media'?$('#mediaSearch'):active==='stories'?$('#storyListSearch'):null;if(search){event.preventDefault();search.focus()}}
 if(event.key==='Escape'){$('#lightbox').classList.add('hidden');$('#assetEditModal').classList.add('hidden')}
});
async function boot(){if(!online){$('#appRoot').classList.remove('hidden');await reload();newStory();return}try{let s=await session();if(s&&await isAdmin()){$('#appRoot').classList.remove('hidden');await reload();newStory()}else{$('#loginWrap').classList.remove('hidden')}}catch(e){$('#loginWrap').classList.remove('hidden');$('#loginError').textContent='Холболт амжилтгүй: '+e.message;$('#loginError').classList.remove('hidden')}}
try{await boot()}catch(e){
 console.error('Adult Stories admin startup failed:',e);
 const help=$('#openHelp');
 if(help){
  help.style.display='grid';
  help.setAttribute('aria-live','assertive');
  help.querySelector('h1').textContent='Admin студиог ачаалж чадсангүй';
  help.querySelectorAll('p')[0].textContent='Ачаалалтын үед алдаа гарлаа. Тохиргоо болон холболтоо шалгаад хуудсыг дахин ачаална уу.';
  const detail=document.createElement('p');detail.className='small';detail.textContent=e?.message||String(e);help.querySelector('.open-help-card').append(detail);
 }
}
