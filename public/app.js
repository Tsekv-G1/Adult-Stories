import {priceOffer} from './price-offer.js';
import {normalizeSearch,readDiscovery,discoveryUrl,readerFontSize} from './discovery.js';
import {deliverImage,excerptText,optimizedImage} from './image-delivery.js?v=8.8.0';
import {createLibrary} from './member-library.js?v=8.10.0';
import {memberRequest} from './customer-api.js?v=9.0.0';
import {createCheckout} from './checkout.js?v=9.0.0';
import {getData,getBody,CONFIG,online,esc,$,$$,overlayCSS,fmtPrice,textParas,subscribeChanges,defaults,safeUrl} from './core.js?v=9.1.0';
import {visualFor,applyPhoto,durationLabel,audioSeconds} from './studio.js?v=8.8.0';
import {createAudioPlayer} from './audio-player.js?v=9.0.0';
import {previewCompletionAction} from './preview-completion.js?v=8.24.0';
import {isPrivateAudio} from './private-audio.js?v=8.19.0';
import {activeEntitlements,hasActiveStoryEntitlement,isPublishedStory} from './story-access.js?v=8.22.0';
import {createMemberAuth} from './member-auth.js?v=8.12.0';
import {recordStoryActivity,loadStoryMetrics} from './story-activity.js?v=8.8.0';
const studioMode=new URLSearchParams(location.search).get('studio')==='1'&&window.parent!==window;
const mobileViewport=window.matchMedia('(max-width:690px)');
function stored(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
const saved=stored('adult_v5_saved',[]),unlocked=stored('adult_v5_unlock_demo',[]);
const state={data:null,...readDiscovery(location.href),audioQueue:[],reader:null,saved:Array.isArray(saved)?saved:[],unlocked:Array.isArray(unlocked)?unlocked:[],member:localStorage.getItem('adult_v5_member_demo')==='yes'};
$('#storySearch').value=state.search;$('#storySort').value=state.sort;
let hasCatalog=false;
let storyMetrics=new Map(),metricsRevision=0,readTimer=null;const trackedListen=new Set();
const asset=id=>state.data?.assets.find(a=>a.id===id),story=id=>state.data?.stories.find(s=>s.id===id&&(studioMode||isPublishedStory(s)));
function publicCatalog(data){
 const site={...defaults().site,...data.site};
 const shared=safeUrl(site.shared_preview_url);
 const stories=shared&&!isPrivateAudio(shared)?data.stories.map(row=>({...row,audio_preview_url:shared})):data.stories;
 return {...data,site,stories};
}
const visible=()=>state.data.stories.filter(s=>isPublishedStory(s)).sort((a,b)=>Number(a.sort_order??100)-Number(b.sort_order??100));
const adultConfirmed=()=>localStorage.getItem('adult_v5_age')==='yes';
const audioAvailable=s=>adultConfirmed()&&!!safeUrl(s?.audio_preview_url)&&!isPrivateAudio(s.audio_preview_url),durationText=s=>(hasActiveStoryEntitlement(grantedEntitlements,s?.id)||(!online&&(state.member||state.unlocked.includes(s?.id))))&&audioSeconds(s)?durationLabel(s):'';
let readerLoading=false;
let readerRequest=0,readerAudioTarget=null,reloading=null,lastModalFocus=null;
let savedStorageKey='adult_v5_saved';
let libraryReady=false,restoreReading=false,lastReadSave=0;
const library=createLibrary({onChange:rows=>{if(!libraryReady)return;state.saved=rows.filter(r=>r.saved).map(r=>r.story_id);if(state.data){syncSavedButtons();renderContinue();renderSavedLibrary()}},onStatus:()=>{}});
const player=createAudioPlayer({onChange:syncAudioButtons,onProgress:track=>{if(!studioMode)library.patch(track.id,{audio_seconds:track.current,audio_duration:track.duration,audio_kind:track.kind});if(!studioMode&&track.current>=15){const key=`${track.id}_${new Date().toISOString().slice(0,10)}`;let already=trackedListen.has(key);try{already ||= !!sessionStorage.getItem('adult_activity_listen_'+key);if(!already)sessionStorage.setItem('adult_activity_listen_'+key,'yes')}catch{}if(!already){trackedListen.add(key);recordStoryActivity(track.id,'listen').then(refreshStoryMetrics)}}},onEnded:({track,autoNext})=>{handleAudioCompletion({track,autoNext})}}),memberAuth=createMemberAuth();
const checkout=createCheckout({memberAuth,modal,closeModal,getSite:()=>state.data?.site});
let feedbackAction=null,feedbackTimer=null;
function hideFeedback(){clearTimeout(feedbackTimer);feedbackAction=null;$('#feedbackToast').hidden=true;if($('#libraryUndo'))$('#libraryUndo').hidden=true;if($('#libraryFeedback'))$('#libraryFeedback').hidden=true}
function feedback(message,undo=null){
 clearTimeout(feedbackTimer);feedbackAction=undo;$('#feedbackText').textContent=message;$('#feedbackUndo').hidden=!undo;const inLibrary=!$('#modal').classList.contains('hidden')&&$('#modalBody').dataset.libraryView==='yes';$('#feedbackToast').hidden=inLibrary;if($('#libraryUndo'))$('#libraryUndo').hidden=!undo;if(inLibrary){$('#libraryFeedback').textContent=message;$('#libraryFeedback').hidden=false}
 feedbackTimer=setTimeout(hideFeedback,undo?10000:4500);
}
$('#feedbackClose').addEventListener('click',hideFeedback);
function undoFeedback(){const action=feedbackAction;hideFeedback();action?.();if($('#modalBody').dataset.libraryView==='yes')$('#librarySearch')?.focus()}
$('#feedbackUndo').addEventListener('click',undoFeedback);
function persistDiscovery(){
 if(studioMode)return;const next=discoveryUrl(location.href,state);if(next!==location.href)history.replaceState(history.state,'',next);
}
function resetDiscovery(){
 state.search='';state.filter='Бүгд';state.shortOnly=false;state.sort='editor';$('#storySearch').value='';$('#storySort').value=state.sort;persistDiscovery();renderGrid();$('#storySearch').focus({preventScroll:true});
}
$('#resetFilters').addEventListener('click',resetDiscovery);
function renderSavedLibrary(){
 if($('#modal').classList.contains('hidden')||$('#modalBody').dataset.libraryView!=='yes')return;
 const query=normalizeSearch($('#librarySearch').value),all=library.rows().filter(r=>r.saved).map(r=>({r,s:story(r.story_id)})).filter(x=>x.s);
 const rows=all.filter(({s})=>normalizeSearch(`${s.title} ${s.category||''} ${s.excerpt||''}`).includes(query));
 $('#libraryResultCount').textContent=(query?rows.length+' / '+all.length:all.length)+' хадгалсан өгүүллэг';
 $('#libraryResults').innerHTML=rows.length?rows.map(({s,r})=>`<div class="saved-library-row"><button type="button" data-story="${esc(s.id)}" data-resume="true" class="saved-story"><span><strong>${esc(s.title)}</strong><small>${r.read_fraction>0||r.audio_seconds>0?'Зогссон газраасаа үргэлжлүүлэх':'Уншиж эхлэх'}</small></span><span aria-hidden="true">↗</span></button><button type="button" class="saved-library-remove" data-library-remove="${esc(s.id)}" aria-label="${esc(s.title)} — сангаас хасах">Хасах</button></div>`).join(''):all.length?'<div class="library-empty"><p>Хайлтад тохирох өгүүллэг олдсонгүй.</p></div>':'<div class="library-empty"><span aria-hidden="true">◇</span><h3>Дуртай түүхээ энд цуглуулаарай.</h3><p>Өгүүллэгийн ◇ товчийг дарж хадгална.</p><button type="button" class="btn primary" data-browse-library>Өгүүллэгүүд үзэх ↗</button></div>';
}
function openSavedLibrary(){
 modal('Миний сан','<label class="sr-only" for="librarySearch">Хадгалсан өгүүллэгээс хайх</label><input id="librarySearch" type="search" placeholder="Хадгалсан өгүүллэгээс хайх…" maxlength="180" autocomplete="off"><p id="libraryResultCount" class="small" role="status"></p><p id="libraryFeedback" class="small" role="status" hidden></p><button type="button" id="libraryUndo" class="btn outline" hidden>Сүүлийн үйлдлийг буцаах</button><div id="libraryResults"></div>');
 $('#modalBody').dataset.libraryView='yes';$('#librarySearch').addEventListener('input',renderSavedLibrary);$('#libraryUndo').addEventListener('click',undoFeedback);renderSavedLibrary();if(!$('#feedbackToast').hidden){$('#libraryFeedback').textContent=$('#feedbackText').textContent;$('#libraryFeedback').hidden=false;$('#libraryUndo').hidden=!feedbackAction;$('#feedbackToast').hidden=true}$('#librarySearch').focus();
}
let activeMemberId=null,grantedEntitlements=[],entitlementSignature='[]';
function updateEntitlements(rows){
 const active=activeEntitlements(rows),signature=JSON.stringify(active.map(row=>[row.story_id||'',row.expires_at||'']).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
 if(signature===entitlementSignature)return false;
 grantedEntitlements=active;entitlementSignature=signature;
 if(state.data){renderHero();renderGrid();if(state.reader)$('#readerMeta').textContent=durationText(story(state.reader))}
 return true;
}
const knownOrderStates=new Map();let entitlementMonitor=null,approvalNoticeTimer=null;
function approvalNotice(order){
 const key=`adult_approval_notice_${memberAuth.user?.id||'guest'}_${order.id}`;try{if(localStorage.getItem(key))return;localStorage.setItem(key,'yes')}catch{}
 let box=document.getElementById('accessGrantedNotice');if(!box){box=document.createElement('section');box.id='accessGrantedNotice';box.className='access-granted-notice';box.setAttribute('role','alert');box.setAttribute('aria-live','assertive');box.innerHTML='<div class="access-granted-sparkles" aria-hidden="true"></div><div class="access-granted-mark" aria-hidden="true">✓</div><div class="access-granted-copy"><strong>Таны эрх нээгдлээ</strong><span></span></div><button type="button" class="access-granted-open">Үргэлжлүүлэх</button><button type="button" class="access-granted-close" aria-label="Мэдэгдлийг хаах">×</button>';document.body.append(box);box.querySelector('.access-granted-close').onclick=()=>{box.classList.remove('is-visible');clearTimeout(approvalNoticeTimer)};box.querySelector('.access-granted-open').onclick=()=>{box.classList.remove('is-visible');if(order.story_id)openReader(order.story_id);else location.hash='#stories'};}
 const title=order.kind==='membership'?`${Number(order.membership_days)||30} хоногийн бүх сангийн эрх`:order.story_id?(story(order.story_id)?.title||'Өгүүллэг унших эрх'):'Таны сонгосон өгүүллэгийн эрх';box.querySelector('.access-granted-copy span').textContent=title;box.classList.remove('is-visible');void box.offsetWidth;box.classList.add('is-visible');clearTimeout(approvalNoticeTimer);approvalNoticeTimer=setTimeout(()=>box.classList.remove('is-visible'),12000);
}
async function pollEntitlements(initial=false){
 const user=memberAuth.user;if(!online||!user)return;const userId=user.id;
 try{const account=await memberRequest('me');if(memberAuth.user?.id!==userId)return;const changed=updateEntitlements(account.entitlements);if(changed&&state.reader)renderReader();for(const order of account.orders||[]){const previous=knownOrderStates.get(order.id);if(order.status==='approved'&&previous==='pending')approvalNotice(order);else if(order.status==='approved'&&initial&&order.decided_at&&Date.now()-Date.parse(order.decided_at)<24*60*60*1000)approvalNotice(order);knownOrderStates.set(order.id,order.status)}
 }catch{}
}
function startEntitlementMonitor(){clearInterval(entitlementMonitor);knownOrderStates.clear();pollEntitlements(true);entitlementMonitor=setInterval(()=>{if(document.visibilityState==='visible')pollEntitlements(false)},7000)}
function addApprovalNoticeStyles(){if(document.getElementById('accessGrantedStyles'))return;const style=document.createElement('style');style.id='accessGrantedStyles';style.textContent=`@keyframes adult-rights-pop{0%{opacity:0;transform:translate(-50%,-20px) scale(.96)}65%{opacity:1;transform:translate(-50%,4px) scale(1.01)}100%{opacity:1;transform:translate(-50%,0) scale(1)}}.access-granted-notice{position:fixed;z-index:1000000;top:max(14px,env(safe-area-inset-top));left:50%;width:min(640px,calc(100vw - 28px));display:flex;align-items:center;gap:14px;padding:16px 18px;border:1px solid #e84b78;border-radius:16px;background:linear-gradient(115deg,#22121cfa,#55112dfa 58%,#8b1236fa);color:#fff;box-shadow:0 18px 65px #000a;opacity:0;visibility:hidden;pointer-events:none;transform:translate(-50%,-20px) scale(.97)}.access-granted-notice.is-visible{visibility:visible;pointer-events:auto;animation:adult-rights-pop .48s cubic-bezier(.2,.8,.2,1) both}.access-granted-mark{width:42px;height:42px;flex:none;display:grid;place-items:center;border-radius:50%;background:#fa285c;color:white;font-size:24px;font-weight:900;box-shadow:0 0 0 7px #fa285c24}.access-granted-copy{display:grid;gap:3px;min-width:0;flex:1}.access-granted-copy strong{font-size:16px}.access-granted-copy span{color:#f2c8d5;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.access-granted-notice button{min-height:38px;padding:8px 12px;border:1px solid #ffffff45;border-radius:10px;background:#ffffff12;color:#fff;font:inherit;font-size:12px;font-weight:750;cursor:pointer}.access-granted-notice .access-granted-open{background:#f32558;border-color:#f32558}.access-granted-notice .access-granted-close{font-size:20px;padding:5px 9px}@media(max-width:560px){.access-granted-notice{gap:10px;padding:13px}.access-granted-mark{width:36px;height:36px}.access-granted-copy strong{font-size:14px}.access-granted-copy span{font-size:11px}.access-granted-notice button{font-size:11px;padding:7px 9px}}@media(prefers-reduced-motion:reduce){.access-granted-notice.is-visible{animation:none;opacity:1;transform:translateX(-50%)}}`;document.head.append(style)}
addApprovalNoticeStyles();
function showMembershipExpiry(entitlements,userId){
 const notice=$('#membershipExpiryNotice');if(!userId||!Array.isArray(entitlements)){notice.hidden=true;return}
 const memberships=entitlements.filter(row=>row.story_id==null&&(row.membership_days!=null||row.expires_at));
 if(!memberships.length){notice.hidden=true;return}
 const expiries=memberships.map(row=>Date.parse(row.expires_at)).filter(Number.isFinite);if(!expiries.length){notice.hidden=true;return}
 const latest=Math.max(...expiries),remaining=latest-Date.now();if(remaining>3*86400000){notice.hidden=true;return}
 const key=`adult_membership_expiry_notice_${userId}_${latest}`;try{if(sessionStorage.getItem(key)){notice.hidden=true;return}}catch{}
 const date=new Intl.DateTimeFormat('mn-MN',{dateStyle:'medium',timeZone:'Asia/Ulaanbaatar'}).format(new Date(latest));
 $('#membershipExpiryText').textContent=remaining<=0?`Таны бүх сангийн эрх ${date}-нд дууссан байна.`:`Таны бүх сангийн эрх ${date}-нд дуусна.`;
 notice.dataset.dismissKey=key;notice.hidden=false;
}
$('#membershipExpiryClose').addEventListener('click',()=>{const key=$('#membershipExpiryNotice').dataset.dismissKey;try{if(key)sessionStorage.setItem(key,'yes')}catch{}$('#membershipExpiryNotice').hidden=true});
$('#membershipExpiryRenew').addEventListener('click',()=>paywall('membership'));
window.addEventListener('adult-member-changed',async event=>{libraryReady=true;hideFeedback();const guestRows=!activeMemberId&&event.detail?library.rows():[];if(activeMemberId!==event.detail?.id)player.stop();activeMemberId=event.detail?.id;updateEntitlements([]);if(state.reader)resetReaderContent(story(state.reader),!!event.detail);await library.setUser(event.detail);if(activeMemberId!==event.detail?.id)return;if(event.detail){try{const account=await memberAuth.refresh();if(activeMemberId!==event.detail.id)return;updateEntitlements(account?.entitlements);showMembershipExpiry(account?.entitlements,event.detail.id)}catch{showMembershipExpiry([],event.detail.id)}const guestMigration='adult_library_guest_migrated_'+event.detail.id;if(!localStorage.getItem(guestMigration)){for(const row of guestRows){const existing=library.get(row.story_id);if(!existing||(!existing.saved&&!existing.read_fraction&&!existing.audio_seconds)){const patch={};if(row.saved)patch.saved=true;if(row.read_fraction)patch.read_fraction=row.read_fraction;if(row.audio_seconds){patch.audio_seconds=row.audio_seconds;patch.audio_duration=row.audio_duration||0;patch.audio_kind=row.audio_kind||(row.audio_seconds>0?'full':null)}if(Object.keys(patch).length)library.patch(row.story_id,patch)}}localStorage.setItem(guestMigration,'yes')}}savedStorageKey=event.detail?.id?'adult_saved_'+event.detail.id:'adult_v5_saved';const bookmarks=stored(savedStorageKey,[]);const migrationKey=savedStorageKey+'_migrated_v8';if(!localStorage.getItem(migrationKey)){for(const id of Array.isArray(bookmarks)?bookmarks:[])library.patch(id,{saved:true});localStorage.setItem(migrationKey,'yes')}state.saved=library.rows().filter(r=>r.saved).map(r=>r.story_id);if(!event.detail){player.stop();$('#membershipExpiryNotice').hidden=true}if(state.data){renderGrid();if(state.reader)renderReader()}});
window.addEventListener('adult-entitlements-refreshed',event=>{if(event.detail?.user?.id!==activeMemberId)return;updateEntitlements(event.detail.account?.entitlements);showMembershipExpiry(event.detail.account?.entitlements,activeMemberId);if(state.reader)renderReader()});
window.addEventListener('adult-member-changed',event=>{if(event.detail)startEntitlementMonitor();else{clearInterval(entitlementMonitor);entitlementMonitor=null;knownOrderStates.clear();document.getElementById('accessGrantedNotice')?.classList.remove('is-visible')}});
window.addEventListener('adult-payment-approved',event=>{if(event.detail?.order)approvalNotice(event.detail.order)});
window.addEventListener('focus',()=>{if(memberAuth.user)pollEntitlements(false)});
function picture(node,url,o={},priority=false){const effect=visualFor(state.data?.site||{},o,mobileViewport.matches);let image=node.querySelector('img');if(!url){image?.remove();return}if(!image||image.dataset.original!==url){image?.remove();image=document.createElement('img');image.dataset.original=url;deliverImage(image,url,{kind:node.id==='heroImage'?'hero':node.id==='readerCover'?'reader':'card',priority:priority||node.id==='heroImage'||node.id==='readerCover'});node.prepend(image)}applyPhoto(image,effect);const overlay=node.querySelector('.cover-overlay');if(overlay)overlay.style.background=overlayCSS(effect)}
function resetButtons(){const featured=story(state.data.site.featured_story_id)||visible()[0];$('#heroTitle').textContent=featured?.title||'';$('#heroInfo').textContent=featured?[durationText(featured),(state.data.site.categories||[]).includes(featured.category)?featured.category:''].filter(Boolean).join(' · '):'';$('#readFeatured').disabled=!featured;$('#listenFeatured').hidden=!audioAvailable(featured);$('#listenFeatured').disabled=!audioAvailable(featured);$('#listenFeatured').dataset.audioId=featured?.id||'';syncAudioButtons()}
function renderHero(){const s=state.data.site;$('#heroHeading').textContent=s.hero_heading||'';$('#heroAccent').textContent=s.hero_accent||'';$('#heroKicker').textContent=s.hero_kicker||'';$('#heroDescription').textContent=s.hero_description||'';picture($('#heroImage'),asset(s.hero_asset_id)?.url||asset((story(s.featured_story_id)||visible()[0])?.cover_id)?.url,s.hero_overlay||{});resetButtons();document.title=s.seo_title||'ADULT Stories';const desc=document.querySelector('meta[name=description]');if(desc)desc.content=s.seo_description||''}
function renderGrid(){
 if(!state.data)return;
 const pool=visible(),cats=['Бүгд',...new Set((state.data.site.categories||[]).filter(Boolean))];if(!cats.includes(state.filter))state.filter='Бүгд';
 $('#filters').innerHTML=cats.map(c=>`<button class="${c===state.filter?'active':''}" aria-pressed="${c===state.filter}" data-filter="${esc(c)}">${esc(c)}</button>`).join('')+`<button class="${state.shortOnly?'active':''}" aria-pressed="${state.shortOnly}" data-short-filter>10 мин хүртэл</button>`;
 $('#activityNote').textContent='';
 let rows=pool.filter(s=>(state.filter==='Бүгд'||s.category===state.filter)&&(!state.shortOnly||(Number(s.read_minutes)>0&&Number(s.read_minutes)<=10))&&normalizeSearch(`${s.title} ${s.excerpt} ${s.category} ${s.tags?.join(' ')||''}`).includes(normalizeSearch(state.search)));
 const activity=s=>storyMetrics.get(s.id)||{reads_30d:0,listens_30d:0};
 if(state.sort==='popular')rows.sort((a,b)=>(Number(activity(b).reads_30d)+Number(activity(b).listens_30d))-(Number(activity(a).reads_30d)+Number(activity(a).listens_30d))||Number(a.sort_order??100)-Number(b.sort_order??100));
 if(state.sort==='listened')rows.sort((a,b)=>Number(activity(b).listens_30d)-Number(activity(a).listens_30d)||Number(a.sort_order??100)-Number(b.sort_order??100));
 if(state.sort==='newest')rows.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||Number(a.sort_order??100)-Number(b.sort_order??100));
 state.audioQueue=rows.map(s=>s.id);
 $('#resetFilters').hidden=!(normalizeSearch(state.search)||state.filter!=='Бүгд'||state.shortOnly||state.sort!=='editor');if(hasCatalog)persistDiscovery();
 $('#storyResultCount').textContent=rows.length+' өгүүллэг';$('#clearSearch').hidden=!state.search;
 $('#storyGrid').innerHTML=rows.length?rows.map(s=>{const category=(state.data.site.categories||[]).includes(s.category)?s.category:'',duration=durationText(s),preview=audioAvailable(s);return `<article class="story-card"><button class="story-cover" data-story="${esc(s.id)}" aria-label="${esc(s.title)} — унших"><div class="cover-overlay"></div><span class="cover-line"><small>${esc(category)}</small><strong role="heading" aria-level="3">${esc(s.title)}</strong></span></button><div class="story-category">${esc(category)}</div><p>${esc(excerptText(s.excerpt,105))}</p><div class="story-actions">${preview||duration?`<div class="story-listen">${preview?`<button class="plain-btn audio" data-audio="${esc(s.id)}" aria-label="${esc(s.title)} — аудио эхлэлийг сонсох">▶ Сонсож үзэх</button>`:''}${duration?`<span class="story-duration">${esc(duration)}</span>`:''}</div>`:''}<button class="plain-btn" data-story="${esc(s.id)}">Унших ↗</button><button class="plain-btn save-action" data-save="${esc(s.id)}" aria-label="${esc(s.title)} — ${state.saved.includes(s.id)?'хадгалснаас хасах':'хадгалах'}" aria-pressed="${state.saved.includes(s.id)}">${state.saved.includes(s.id)?'◆':'◇'}</button></div></article>`}).join(''):`<div class="empty">${pool.length?'Тохирох өгүүллэг олдсонгүй.<button type="button" class="btn outline" data-reset-discovery>Хайлтыг цэвэрлэх</button>':'Шинэ өгүүллэгүүд удахгүй нэмэгдэнэ.'}</div>`;
 rows.forEach((s,index)=>picture($(`.story-cover[data-story="${CSS.escape(s.id)}"]`),asset(s.cover_id)?.url,s.overlay,index<2));const availableSaved=state.saved.filter(id=>story(id)).length;$('#savedCount').textContent=availableSaved;$('#savedCount').classList.toggle('hidden',!availableSaved);syncAudioButtons();
}
async function refreshStoryMetrics(){if(!online||!state.data)return;const revision=++metricsRevision;try{const rows=await loadStoryMetrics(visible().map(s=>s.id));if(revision!==metricsRevision)return;storyMetrics=new Map(rows.map(row=>[row.story_id,row]));if(state.data)renderGrid()}catch{}}
function readerStatus(message='',retry=false){
 $('#readerStatus').hidden=!message;$('#readerStatusText').textContent=message;$('#readerRetry').hidden=!retry;
}
function resetReaderContent(s,checking=false){
 if(!s)return;readerRequest++;readerLoading=checking;readerAudioTarget=null;
 $('#readerText').innerHTML=textParas(s.preview_text).map(p=>`<p>${esc(p)}</p>`).join('')||'<p>Энэ өгүүллэгийн эхлэл удахгүй нэмэгдэнэ.</p>';
 $('#readerText').setAttribute('aria-busy',String(checking));$('#readerAudioFull').hidden=true;$('#readerAudioPreview').hidden=true;$('#paywall').classList.add('hidden');
 readerStatus(checking?'Үргэлжлэлийг ачаалж байна…':'');
}
async function renderReader(){
 const s=story(state.reader);if(!s){goHome();return}resetReaderContent(s,online&&!!memberAuth.user&&!studioMode);const token=readerRequest;readerAudioTarget=null;$('#readerAudioPreview').hidden=true;$('#readerAudioFull').hidden=true;document.body.classList.add('reading');document.body.classList.toggle('reading-light',localStorage.getItem('adult_reader_theme')==='light');$('#readerTheme').textContent=document.body.classList.contains('reading-light')?'Бараан горим':'Цайвар горим';$('#homeMain').classList.add('hidden');$('#readerView').classList.remove('hidden');$('#readerTitle').textContent=s.title;$('#readerCategory').textContent=(state.data.site.categories||[]).includes(s.category)?s.category:'';$('#readerExcerpt').textContent=excerptText(s.excerpt,170);$('#readerMeta').textContent=durationText(s);$('#readerSave').textContent=state.saved.includes(s.id)?'◆ Хадгалсан':'◇ Хадгалах';$('#readerSave').setAttribute('aria-pressed',String(state.saved.includes(s.id)));picture($('#readerCover'),asset(s.cover_id)?.url,s.overlay);
 const seriesTitle=String(s.series_title||'').trim(),seriesRows=seriesTitle?visible().filter(row=>String(row.series_title||'').trim().toLocaleLowerCase()===seriesTitle.toLocaleLowerCase()).sort((a,b)=>(Number(a.series_order)||0)-(Number(b.series_order)||0)||a.title.localeCompare(b.title,'mn')):[];
 const seriesBox=$('#storySeries');seriesBox.hidden=seriesRows.length<2;$('#storySeriesTitle').textContent=seriesTitle;
 if(seriesRows.length>1){const currentIndex=seriesRows.findIndex(row=>row.id===s.id);$('#storySeriesPosition').textContent=`${Math.max(0,currentIndex)+1} / ${seriesRows.length} бүлэг`;$('#storySeriesList').innerHTML=seriesRows.map((row,index)=>`<button type="button" class="series-story${row.id===s.id?' is-current':''}" data-story="${esc(row.id)}" aria-current="${row.id===s.id?'page':'false'}"><span class="series-order">${Number(row.series_order)||index+1}</span><span>${esc(row.title)}</span>${row.id===s.id?'<b>Одоо</b>':''}</button>`).join('')}
 
 let access=!online&&(state.unlocked.includes(s.id)||state.member),body={},bodyReply={},bodyError=null;
 if(access)try{body=await getBody(s.id)}catch(error){access=false;bodyError=error}
 if(online&&memberAuth.user&&!studioMode)try{
  bodyReply=await memberRequest('body',null,{id:s.id});
  if(!bodyReply.body||typeof bodyReply.body!=='object')throw Error('invalid_body_response');
  body=bodyReply.body;access=true;
 }catch(error){if(![401,403].includes(error.status))bodyError=error;if(error.status===401)memberAuth.init()}
 if(token!==readerRequest)return;
 readerLoading=false;$('#readerText').setAttribute('aria-busy','false');
 readerStatus(bodyError?'Үргэлжлэлийг ачаалж чадсангүй. Үнэгүй эхлэлийг уншаад, дахин оролдоно уу.':'',!!bodyError);
 if(!access&&player.snapshot().id===s.id&&player.snapshot().kind==='full')player.stop();
 $('#readerText').innerHTML=[...textParas(s.preview_text),...textParas(body.full_text)].map(p=>`<p>${esc(p)}</p>`).join('')||'<p>Энэ өгүүллэгийн эхлэл удахгүй нэмэгдэнэ.</p>';
 const previewTarget=audioAvailable(s)?{url:s.audio_preview_url,kind:'preview'}:null,fullTarget=adultConfirmed()&&access&&safeUrl(body.full_audio_url)?{url:body.full_audio_url,kind:'full',expiresAt:bodyReply.audio_expires_at?Date.parse(bodyReply.audio_expires_at)-30000:Infinity,renew:async()=>{const result=await memberRequest('body',null,{id:s.id});if(!safeUrl(result.body.full_audio_url))throw Error('audio_unavailable');return{url:result.body.full_audio_url,expiresAt:result.audio_expires_at?Date.parse(result.audio_expires_at)-30000:Infinity}}}:null;
 $('#readerAudioPreview').hidden=!previewTarget;$('#readerAudioPreview').dataset.audioId=s.id;$('#readerAudioPreview').dataset.kind='preview';$('#readerAudioFull').hidden=!adultConfirmed()||!!bodyError||!(audioSeconds(s)||fullTarget);$('#readerAudioFull').dataset.audioId=s.id;$('#readerAudioFull').dataset.kind='full';readerAudioTarget={preview:previewTarget,full:fullTarget,access};syncAudioButtons();
 $('#paywall').classList.toggle('hidden',access||!!bodyError);updateReadingIndicator();if(restoreReading){restoreReading=false;const fraction=library.get(s.id)?.read_fraction||0;if(fraction>0)requestAnimationFrame(()=>{const text=$('#readerText'),top=text.getBoundingClientRect().top+scrollY;window.scrollTo({top:top+Math.max(0,text.offsetHeight-innerHeight*.6)*fraction-100,behavior:'instant'})})}$('#unlockStory').textContent=Number(s.price)<=0?'Үнэгүй үргэлжлүүлэх':`Эрх нээх · ${fmtPrice(s.price||9900)}`;$('#paywallNote').textContent='';
}
// User navigation creates a history entry; rendering a popped route never rewrites it.
let appliedRoute=null;
function writeRoute(hash,{replace=false,fromStory=false}={}){
 if(location.hash===hash)return;
 if(!replace)history.replaceState({...history.state,adultScroll:scrollY},'',location.href);
 history[replace?'replaceState':'pushState']({adultStory:fromStory},'',hash);appliedRoute=hash;
}
function goHome({write=true,replace=false,hash='#home'}={}){saveReading(true);clearInterval(readTimer);readTimer=null;document.body.classList.remove('reading','reading-light');readerRequest++;state.reader=null;readerLoading=false;readerAudioTarget=null;if(write)writeRoute(hash,{replace});$('#homeMain').classList.remove('hidden');$('#readerView').classList.add('hidden')}
async function openReader(id,resume=false,{write=true}={}){if(!story(id))return;if(state.reader&&state.reader!==id)saveReading(true);clearInterval(readTimer);let visibleSeconds=0;readTimer=setInterval(()=>{if(state.reader===id&&!document.hidden&&!studioMode&&++visibleSeconds>=12){clearInterval(readTimer);readTimer=null;recordStoryActivity(id,'read').then(refreshStoryMetrics)}},1000);restoreReading=resume;if(write)writeRoute(`#story-${encodeURIComponent(id)}`,{fromStory:true});state.reader=id;await renderReader();if(!resume&&state.reader===id)window.scrollTo({top:0,behavior:'instant'})}
async function restoreRoute(){
 if(!hasCatalog||!state.data||appliedRoute===location.hash)return;appliedRoute=location.hash;const match=location.hash.match(/^#story-([^/]+)$/);closeModal();closeMenu();
 if(match){let id;try{id=decodeURIComponent(match[1])}catch{}if(story(id)){await openReader(id,false,{write:false});return}goHome({replace:true});return}
 goHome({write:false});requestAnimationFrame(()=>{if(Number.isFinite(history.state?.adultScroll))window.scrollTo({top:history.state.adultScroll,behavior:'instant'});else document.getElementById(location.hash.slice(1)||'homeMain')?.scrollIntoView({behavior:'instant'})});
}
function backFromReader(){if(history.state?.adultStory)history.back();else{goHome({replace:true,hash:'#stories'});$('#stories').scrollIntoView({behavior:'instant'})}}
function syncSavedButtons(){
 const savedIds=new Set(state.saved);$$('[data-save]').forEach(button=>{const active=savedIds.has(button.dataset.save),s=story(button.dataset.save);button.textContent=active?'◆':'◇';button.setAttribute('aria-pressed',String(active));if(s)button.setAttribute('aria-label',`${s.title} — ${active?'хадгалснаас хасах':'хадгалах'}`)});
 const availableSaved=state.saved.filter(id=>story(id)).length;$('#savedCount').textContent=availableSaved;$('#savedCount').classList.toggle('hidden',!availableSaved);
 if(state.reader){const active=savedIds.has(state.reader);$('#readerSave').textContent=active?'◆ Хадгалсан':'◇ Хадгалах';$('#readerSave').setAttribute('aria-pressed',String(active))}
}
function updateSaved(id){
 if(!story(id))return;const previous=state.saved.includes(id),owner=memberAuth.user?.id;
 libraryReady=true;library.patch(id,{saved:!previous});state.saved=library.rows().filter(r=>r.saved).map(r=>r.story_id);syncSavedButtons();renderSavedLibrary();
 feedback(previous?'Өгүүллэгийг сангаас хаслаа.':'Өгүүллэгийг санд хадгаллаа.',()=>{if(memberAuth.user?.id!==owner)return;library.patch(id,{saved:previous});feedback('Өөрчлөлтийг буцаалаа.');renderSavedLibrary()});
}
function modal(title,body){window.dispatchEvent(new CustomEvent('adult-modal-opening'));lastModalFocus=document.activeElement;$('#modalTitle').textContent=title;delete $('#modalBody').dataset.membershipRequest;delete $('#modalBody').dataset.libraryView;$('#modalBody').innerHTML=body;$('#modal').classList.remove('hidden');$('#modalClose').focus()}
function closeModal(){window.dispatchEvent(new CustomEvent('adult-modal-closed'));$('#modal').classList.add('hidden');lastModalFocus?.focus()}
function paywall(kind='story'){
 const s=state.reader?story(state.reader):visible()[0];if(!state.data)return;
 if(kind==='membership'){membershipOptions();return}
 if(online){if(kind==='story'&&Number(s?.price)<=0){if(!memberAuth.user)memberAuth.open();else renderReader();return}checkout.start(kind,s);return}
 // Local preview mode has no real bank transfer; it only simulates unlocking content.
 modal('Эрхийн туршилт',`<p class="muted">Локал туршилт. Бодит төлбөр хийгдэхгүй.</p><div class="panel"><strong>${esc(s?.title||'Өгүүллэг')}</strong><h2>${fmtPrice(s?.price||9900)}</h2><button class="btn primary btn-block" id="paySingle" ${s?'':'disabled'}>Энэ өгүүллэгийг турших</button></div><div class="panel"><strong>7 хоногийн бүх сан</strong><h2>${fmtPrice(state.data.site.membership_week_price||9900)}</h2><button class="btn secondary btn-block" id="payMember">Туршилтын эрх нээх</button></div>`);
 $('#paySingle')?.addEventListener('click',async()=>{if(online||!s)return;if(!state.unlocked.includes(s.id))state.unlocked.push(s.id);localStorage.setItem('adult_v5_unlock_demo',JSON.stringify(state.unlocked));closeModal();renderHero();renderGrid();await openReader(s.id)});$('#payMember')?.addEventListener('click',async()=>{if(online)return;state.member=true;localStorage.setItem('adult_v5_member_demo','yes');closeModal();renderHero();renderGrid();if(s)await openReader(s.id)});
}
let membershipRequestSequence=0;
/** Membership pricing stays visible even when the visitor is not registered. The actual order is bound to a signed-in user. */
function membershipOptions({fromPreview=false,storyId=null}={}){
 if(!state.data)return;
 const requestId=String(++membershipRequestSequence),userId=memberAuth.user?.id||null;
 const week=Number(state.data.site.membership_week_price)||9900,month=Number(state.data.site.membership_price)||29900,
       list=Number(state.data.site.membership_list_price)||34900,first=Number(state.data.site.membership_first_price)||24900;
 const headline=fromPreview?'Үргэлжлэлийг бүтнээр нь сонсох':'Өгүүллэгийн сангийн эрх';
 const storyTitle=fromPreview?story(storyId)?.title||'Энэ өгүүллэг':'';
 modal(headline,'');
 const panel=$('#modalBody');panel.dataset.membershipRequest=requestId;
 const stillActive=()=>!$('#modal').classList.contains('hidden')&&panel.dataset.membershipRequest===requestId&&(memberAuth.user?.id||null)===userId;
 function monthlyMarkup(showOffer){
  const amount=showOffer?first:month,offer=priceOffer(list,amount);
  return `${offer?`<span class="offer-badge">${offer.percent}% ХЯМДРАЛ</span><span class="offer-original">Анхны үнэ <del>${fmtPrice(offer.original)}</del></span>`:''}<span class="membership-intro-price"><strong>${fmtPrice(amount)}</strong></span>${offer?`<span class="offer-saving">Та ${fmtPrice(offer.saved)} хэмнэнэ</span>`:''}<span class="offer-condition">${showOffer?'Анхны худалдан авалтын нэг удаагийн үнэ':'Бүх сангийн 30 хоногийн эрх'}</span>${showOffer?`<small class="offer-next">Дараагийн худалдан авалт ${fmtPrice(month)} · Автоматаар сунгахгүй</small>`:''}<span class="plan-select-label">30 хоногийн эрх сонгох ↗</span>`;
 }
 function renderPlans(showOffer){
  if(!stillActive())return;
  panel.innerHTML=`${fromPreview?`<p class="preview-unlock-title">${esc(storyTitle)}</p><p class="muted">Үнэгүй хэсэг дууслаа. Үргэлжлэлийг нь бүтнээр сонсох эрхээ сонгоорой.</p>`:'<p class="muted">Нэг эрхээр бүх өгүүллэгийг уншиж, аудиог нь сонсоорой. Баталгаажмагц эрх идэвхжинэ.</p>'}<div class="membership-plans"><button type="button" class="membership-plan" data-membership-days="7"><small>7 ХОНОГ · БҮХ САН</small><strong>${fmtPrice(week)}</strong><span>Богино хугацаанд үзэхэд</span><span class="plan-select-label">7 хоногийн эрх сонгох ↗</span></button><button type="button" class="membership-plan featured" data-membership-days="30"><small>30 ХОНОГ · БҮХ САН</small><span data-membership-price>${monthlyMarkup(showOffer)}</span></button></div><ul class="membership-benefits"><li>Бүх өгүүллэг болон аудио нээгдэнэ</li><li>Зогссон газраасаа үргэлжлүүлэн сонсоно</li><li>Автоматаар сунгахгүй</li></ul>${userId?'':`<p class="preview-checkout-note">Эрхийн сонголтоо хийгээд нэвтрэх эсвэл бүртгүүлэх боломжтой. Төлбөрийг таны бүртгэлд холбож баталгаажуулна.</p>`}<p class="small">${!userId&&showOffer?'Анхны худалдан авалтын хямдрал таны бүртгэлийн эрхээс хамаарна. ':''}Захиалгын баталгаат үнийг төлбөрийн дэлгэцэд харуулна.</p>`;
  panel.querySelectorAll('[data-membership-days]').forEach(button=>button.addEventListener('click',async()=>{
   if(!stillActive())return;
   const days=Number(button.dataset.membershipDays);
   if(online){checkout.start('membership',null,days);return}
   state.member=true;localStorage.setItem('adult_v5_member_demo','yes');closeModal();renderHero();renderGrid();if(state.reader)await openReader(state.reader);
  }));
 }
 // Show the choice immediately. Never block the CTA flow on a slow account request.
 renderPlans(!userId);
 if(userId&&online)memberRequest('me').then(account=>{if(!stillActive())return;const price=panel.querySelector('[data-membership-price]');if(price)price.innerHTML=monthlyMarkup(account.first_purchase_offer_available===true)}).catch(()=>{});
}
window.addEventListener('adult-open-membership-options',()=>membershipOptions());
function handleAudioCompletion({track,autoNext}){
 const currentStory=track?story(track.id):null;
 const action=previewCompletionAction({track,story:currentStory,adultConfirmed:adultConfirmed(),studioMode,
  modalOpen:!$('#modal').classList.contains('hidden'),accountOpen:$('#accountDialog').open,
  hasAccess:hasActiveStoryEntitlement(grantedEntitlements,track?.id)||(!online&&(state.member||state.unlocked.includes(track?.id))),autoNext});
 if(action==='next'){playNextAudio();return}
 if(action!=='offer'&&action!=='full')return;
 // Preview includes the CTA in a single MP3. Do not skip forward until the entire file ends.
 player.minimize();
 if(action==='full'){
  modal('Үргэлжлүүлэн сонсох',`<p class="muted">Таны эрх идэвхтэй байна. ${esc(currentStory.title)} өгүүллэгийг бүтнээр нь сонсоорой.</p><button type="button" class="btn primary btn-block" id="openUnlockedAudio">▶ Бүтэн аудио нээх</button>`);
  $('#openUnlockedAudio').addEventListener('click',()=>{closeModal();openReader(track.id)});
  return;
 }
 membershipOptions({fromPreview:true,storyId:track.id});
}

function playAudio(s,options={}){if(!s||!adultConfirmed())return;const kind=options.kind||'preview';if(kind==='preview'&&!audioAvailable(s))return;const row=library.get(s.id),savedKind=row?.audio_kind||(row?.audio_seconds>0?'full':null),start=options.start??(savedKind===kind?row.audio_seconds:0),design=s.overlay?.audio_player||{},artAsset=asset(design.asset_id),artUrl=artAsset?.url||asset(s.cover_id)?.url||'';player.play(s,{art:optimizedImage(artUrl,1200),artwork:{desktop:design.desktop,mobile:design.mobile,shade:design.shade},...options,start})}
function nextAudio(){if(!state.data)return null;const current=player.snapshot().id;let queue=state.audioQueue.length?state.audioQueue:visible().map(s=>s.id),index=queue.indexOf(current);if(index<0){queue=visible().map(s=>s.id);index=queue.indexOf(current)}return queue.slice(Math.max(-1,index)+1).map(story).find(audioAvailable)||null}
function playNextAudio(){const next=nextAudio();if(!next){$('#audioSub').textContent='Энэ жагсаалтад дараагийн аудио алга.';return false}playAudio(next);return true}
function previousAudio(){if(!state.data)return null;const current=player.snapshot().id;let queue=state.audioQueue.length?state.audioQueue:visible().map(s=>s.id),index=queue.indexOf(current);if(index<0){queue=visible().map(s=>s.id);index=queue.indexOf(current)}return index>0?queue.slice(0,index).reverse().map(story).find(audioAvailable)||null:null}
function playPreviousAudio(){const previous=previousAudio();if(!previous){$('#audioSub').textContent='Энэ жагсаалтад өмнөх аудио алга.';return false}playAudio(previous);return true}
function syncAudioButtons(){const active=player?.snapshot?.();$$('[data-audio],#listenFeatured,#readerAudioPreview,#readerAudioFull').forEach(button=>{const id=button.dataset.audio||button.dataset.audioId,kind=button.dataset.kind||'preview',playing=active?.id===id&&active.kind===kind&&['playing','buffering'].includes(active.phase),row=id?library.get(id):null,storedKind=row?.audio_kind||(row?.audio_seconds>0?'full':null),resume=storedKind===kind&&row?.audio_seconds>5;button.classList.toggle('is-playing',playing);button.setAttribute('aria-pressed',String(playing));if(playing)button.textContent='Ⅱ Түр зогсоох';else if(button.id==='listenFeatured')button.textContent='▶ Сонсож эхлэх';else if(button.id==='readerAudioPreview')button.textContent=resume?`▶ Эхлэлийг үргэлжлүүлэх · ${Math.floor(row.audio_seconds/60)}:${String(Math.floor(row.audio_seconds%60)).padStart(2,'0')}`:'▶ Сонсож үзэх';else if(button.id==='readerAudioFull')button.textContent=resume?`▶ Бүтэн сонсох · үргэлжлүүлэх`:'▶ Бүтэн сонсох';else button.textContent='▶ Сонсож үзэх'});$('#audioNext').disabled=!nextAudio();$('#audioPrevious').disabled=!previousAudio()}
async function reload(){
 if(reloading)return reloading;
 $('#retryContent').disabled=true;
 const previousReader=state.reader?JSON.stringify([story(state.reader),state.data?.site.visual_theme,state.data?.assets]):null;
 reloading=(async()=>{
  try{
   const data=await getData();if(!data)return;
   state.data=publicCatalog(data);hasCatalog=true;
   renderHero();renderGrid();renderContinue();$('#storyGrid').setAttribute('aria-busy','false');$('#catalogStatus').hidden=true;refreshStoryMetrics();
   if(state.reader){
    const nextReader=JSON.stringify([story(state.reader),state.data.site.visual_theme,state.data.assets]);
    if(previousReader!==nextReader)await renderReader();
   }else await restoreRoute();
  }catch(error){
   console.error('Content load failed',error);
   if(!state.data){state.data={...defaults(),stories:[],assets:[]};renderHero();renderGrid()}
   $('#catalogStatusText').textContent=hasCatalog?'Шинэ мэдээлэлтэй холбогдсонгүй. Өмнө ачаалсан мэдээллийг харуулж байна.':'Өгүүллэгүүдийг ачаалж чадсангүй. Холболтоо шалгаад дахин оролдоно уу.';
   $('#catalogStatus').hidden=false;
  }finally{$('#storyGrid').setAttribute('aria-busy','false');$('#retryContent').disabled=false;reloading=null}
 })();return reloading;
}
$('#retryContent').addEventListener('click',reload);
function showConnection(){const offline=navigator.onLine===false;$('#connectionNotice').hidden=!offline;if(!offline){memberAuth.init();reload()}}
window.addEventListener('offline',()=>{$('#connectionNotice').hidden=false});window.addEventListener('online',showConnection);$('#connectionNotice').hidden=navigator.onLine!==false;
$('#readerRetry').addEventListener('click',()=>{if(state.reader)renderReader()});
function closeMenu(){const toggle=$('#menuToggle');$('#siteHeader').classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Цэс нээх')}
$('#menuToggle').addEventListener('click',()=>{const open=$('#menuToggle').getAttribute('aria-expanded')!=='true';$('#siteHeader').classList.toggle('menu-open',open);$('#menuToggle').setAttribute('aria-expanded',String(open));$('#menuToggle').setAttribute('aria-label',open?'Цэс хаах':'Цэс нээх')});
document.addEventListener('click',event=>{if(!event.target.closest('#siteHeader'))closeMenu()});
$$('[data-nav]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();goHome({hash:'#'+link.dataset.nav});closeMenu();document.getElementById(link.dataset.nav)?.scrollIntoView({behavior:'smooth'})}));
$('#brandHome').addEventListener('click',event=>{event.preventDefault();goHome();closeMenu();window.scrollTo({top:0,behavior:'smooth'})});$('#headerSearch').addEventListener('click',()=>{goHome();closeMenu();$('#stories').scrollIntoView({behavior:'smooth'});$('#storySearch').focus({preventScroll:true})});
$('#clearSearch').addEventListener('click',()=>{state.search='';$('#storySearch').value='';renderGrid();$('#storySearch').focus()});
$('#storySearch').addEventListener('input',event=>{state.search=event.target.value;persistDiscovery();if(state.data)renderGrid()});$('#storySort').addEventListener('change',event=>{state.sort=event.target.value;persistDiscovery();renderGrid()});$('#filters').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.filter!==undefined)state.filter=button.dataset.filter;else if(button.hasAttribute('data-short-filter'))state.shortOnly=!state.shortOnly;else return;renderGrid()});
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||!state.data)return;if(button.hasAttribute('data-reset-discovery')){resetDiscovery();return}if(button.dataset.libraryRemove){updateSaved(button.dataset.libraryRemove);$('#libraryUndo')?.focus();return}if(button.hasAttribute('data-browse-library')){closeModal();goHome({hash:'#stories'});$('#stories').scrollIntoView({behavior:'smooth'});return}if(button.dataset.continueAudio){const s=story(button.dataset.continueAudio);if(s)playAudio(s);return}if(button.dataset.story){closeModal();openReader(button.dataset.story,button.dataset.resume==='true')}if(button.dataset.audio)playAudio(story(button.dataset.audio));if(button.dataset.save)updateSaved(button.dataset.save)});
$('#readFeatured').addEventListener('click',()=>{if(!state.data)return;const s=story(state.data.site.featured_story_id)||visible()[0];if(s)openReader(s.id)});$('#listenFeatured').addEventListener('click',()=>{if(state.data)playAudio(story(state.data.site.featured_story_id)||visible()[0])});$('#audioName').addEventListener('click',()=>{const id=player.snapshot().id;if(id&&story(id))openReader(id)});$('#audioNext').addEventListener('click',playNextAudio);$('#audioPrevious').addEventListener('click',playPreviousAudio);$('#readerBack').addEventListener('click',backFromReader);$('#readerAudioPreview').addEventListener('click',()=>playAudio(story(state.reader),readerAudioTarget?.preview||{}));$('#readerAudioFull').addEventListener('click',()=>{const s=story(state.reader),target=readerAudioTarget;if(!s||!adultConfirmed())return;if(target?.full){playAudio(s,target.full);return}if(target?.access){modal('Бүтэн аудио',`<p class="muted">${esc(s.title)} өгүүллэгийн бүтэн аудио одоогоор нээгдэхгүй байна. Тусламжтай холбогдоно уу.</p>`);return}membershipOptions()});$('#readerSave').addEventListener('click',()=>updateSaved(state.reader));$('#readerTheme').addEventListener('click',()=>{const light=!document.body.classList.contains('reading-light');document.body.classList.toggle('reading-light',light);localStorage.setItem('adult_reader_theme',light?'light':'dark');$('#readerTheme').textContent=light?'Бараан горим':'Цайвар горим'});$('#unlockStory').addEventListener('click',()=>paywall('story'));$('#membershipButton').addEventListener('click',()=>paywall('membership'));$('#modalClose').addEventListener('click',closeModal);$('#modal').addEventListener('click',event=>{if(event.target===$('#modal'))closeModal()});
$('#savedLink').addEventListener('click',event=>{event.preventDefault();closeMenu();if(state.data)openSavedLibrary()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if($('#siteHeader').classList.contains('menu-open')){closeMenu();$('#menuToggle').focus()}if(!$('#modal').classList.contains('hidden'))closeModal()}if(event.key==='Tab'&&!$('#modal').classList.contains('hidden')){const items=$$('button:not(:disabled),a[href],input', $('#modal')),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
$('#ageAccept').addEventListener('click',()=>{localStorage.setItem('adult_v5_age','yes');$('#ageScreen').classList.add('hidden');if(state.data){renderHero();renderGrid();if(state.reader)renderReader()}});$('#ageReject').addEventListener('click',()=>{localStorage.setItem('adult_v5_age','under18');player.stop();$('#ageBlock').classList.remove('hidden');$$('[data-audio],#listenFeatured,#readerAudioPreview,#readerAudioFull').forEach(button=>button.hidden=true)});if(!studioMode&&localStorage.getItem('adult_v5_age')!=='yes')$('#ageScreen').classList.remove('hidden');if(localStorage.getItem('adult_v5_age')==='under18')$$('[data-audio],#listenFeatured,#readerAudioPreview,#readerAudioFull').forEach(button=>button.hidden=true);
window.addEventListener('popstate',()=>{Object.assign(state,readDiscovery(location.href));$('#storySearch').value=state.search;$('#storySort').value=state.sort;renderGrid();restoreRoute()});window.addEventListener('hashchange',restoreRoute);
mobileViewport.addEventListener('change',()=>{closeMenu();if(!state.data)return;renderHero();renderGrid();if(state.reader)renderReader()});
if(CONFIG.localContentMode)$('#studioLink').href='admin.html?local=1';
if(studioMode){
 document.body.classList.add('studio-mode');let previousPreviewView='';state.data=defaults();renderHero();renderGrid();document.addEventListener('click',event=>{if(event.target.closest('a,button')){event.preventDefault();event.stopImmediatePropagation()}},true);
let studioDragTarget=null;
if(studioMode){
 const targetFor=target=>target?.closest?.('#readerCover,#heroImage');
 document.addEventListener('pointerdown',event=>{if(event.target.closest?.('button,a,input,select,textarea'))return;const target=targetFor(event.target),image=target?.querySelector('img');if(!target||!image?.naturalWidth)return;const scope=target.id==='heroImage'?'home':'story',box=target.getBoundingClientRect();studioDragTarget={scope,id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};try{target.setPointerCapture(event.pointerId)}catch{};event.preventDefault();window.parent.postMessage({type:'adult-studio-crop-drag',phase:'start',scope,x:event.clientX,y:event.clientY,width:box.width,height:box.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight},location.origin)},true);
 document.addEventListener('pointermove',event=>{if(!studioDragTarget||studioDragTarget.id!==event.pointerId)return;if(Math.abs(event.clientX-studioDragTarget.x)+Math.abs(event.clientY-studioDragTarget.y)>2)studioDragTarget.moved=true;window.parent.postMessage({type:'adult-studio-crop-drag',phase:'move',scope:studioDragTarget.scope,x:event.clientX,y:event.clientY},location.origin)},true);
 const endStudioDrag=event=>{if(!studioDragTarget||event.pointerId!==studioDragTarget.id)return;window.parent.postMessage({type:'adult-studio-crop-drag',phase:'end',scope:studioDragTarget.scope,x:event.clientX,y:event.clientY},location.origin);studioDragTarget=null};
 document.addEventListener('pointerup',endStudioDrag,true);document.addEventListener('pointercancel',endStudioDrag,true);document.addEventListener('lostpointercapture',endStudioDrag,true);
}
window.addEventListener('message',async event=>{if(event.origin!==location.origin||event.source!==window.parent)return;if(event.data?.type==='adult-studio-crop-live'){const scope=event.data.scope,target=scope==='home'?$('#heroImage'):$('#readerCover'),image=target?.querySelector('img');if(image&&event.data.crop)applyPhoto(image,event.data.crop);if(scope==='story'&&event.data.storyId){const card=$(`.story-cover[data-story="${CSS.escape(event.data.storyId)}"]`),cardImage=card?.querySelector('img');if(cardImage&&event.data.crop)applyPhoto(cardImage,event.data.crop)}return}if(event.data?.type==='adult-studio-preview'){const next=event.data.data;if(!next?.site||!Array.isArray(next.stories)||!Array.isArray(next.assets))return;state.data=publicCatalog(next);state.member=false;state.unlocked=[];state.reader=null;document.body.classList.remove('reading');const viewKey=event.data.view+':'+event.data.storyId;if(viewKey!==previousPreviewView){window.scrollTo(0,0);previousPreviewView=viewKey}renderHero();renderGrid();if(event.data.view==='reader'&&story(event.data.storyId)){state.reader=event.data.storyId;await renderReader()}else{$('#homeMain').classList.remove('hidden');$('#readerView').classList.add('hidden')}}});window.parent.postMessage({type:'adult-studio-ready'},location.origin);
}else{
 libraryReady=true;await library.setUser(null);memberAuth.init();await reload();await restoreRoute();
 subscribeChanges(()=>reload());setInterval(()=>{if(!document.hidden&&navigator.onLine!==false)reload()},Math.max(15,Number(CONFIG.refreshSeconds)||30)*1000);window.addEventListener('focus',()=>{memberAuth.init();reload()});
}

function renderContinue(){const root=$('#continueStories');if(!root||!state.data)return;const recent=library.rows().filter(r=>r.read_fraction>0||r.audio_seconds>0).map(r=>({row:r,s:visible().find(s=>s.id===r.story_id)})).filter(x=>x.s).slice(0,4);root.hidden=!recent.length;root.querySelector('.continue-grid').innerHTML=recent.map(({s,row})=>{const kind=row.audio_kind||(row.audio_seconds>0?'full':null),label=row.audio_seconds>0?`♫ ${kind==='preview'?'Эхлэл':'Аудио'} · ${Math.floor(row.audio_seconds/60)} мин сонссон`:'Уншсан газраасаа үргэлжлүүлэх',progress=row.audio_seconds>0&&row.audio_duration>0?Math.min(1,row.audio_seconds/row.audio_duration):row.read_fraction;return `<button class="continue-card" ${row.audio_seconds>5&&kind==='preview'?`data-continue-audio="${esc(s.id)}"`:`data-story="${esc(s.id)}" data-resume="true"`}><small>${esc(label)}</small><strong>${esc(s.title)}</strong><span>${row.audio_seconds>5&&kind==='preview'?'▶ Зогссон хэсгээсээ сонсох':row.audio_seconds>0?'Түүхээ нээж сонсох ↗':'Уншиж үргэлжлүүлэх ↗'}</span><progress max="1" value="${progress}" aria-label="${esc(s.title)} явц"></progress></button>`}).join('')}
function readingFraction(){if(!state.reader||!state.data)return 0;const text=$('#readerText'),top=text.getBoundingClientRect().top+scrollY,span=Math.max(1,text.offsetHeight-innerHeight*.6);return Math.min(1,Math.max(0,(scrollY-top+100)/span))}
function updateReadingIndicator(){const value=readingFraction();$('#readingProgress').value=value;$('#readingProgressLabel').textContent=`Уншсан ${Math.round(value*100)}%`}
function saveReading(force=false){if(studioMode||readerLoading||!state.reader||!state.data||(!force&&Date.now()-lastReadSave<10000))return;const text=$('#readerText'),top=text.getBoundingClientRect().top+scrollY;if(scrollY<top-120)return;lastReadSave=Date.now();library.patch(state.reader,{read_fraction:readingFraction()})}
window.addEventListener('scroll',()=>{updateReadingIndicator();saveReading()},{passive:true});window.addEventListener('resize',updateReadingIndicator);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){saveReading(true);library.flush()}});window.addEventListener('pagehide',()=>{saveReading(true);player.flushProgress();library.flush()});

function headerSurface(){$('#siteHeader').classList.toggle('is-scrolled',scrollY>32);$$('[data-nav]').forEach(link=>{const active=!state.reader&&location.hash==='#'+link.dataset.nav;link.classList.toggle('is-active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')})}window.addEventListener('scroll',headerSurface,{passive:true});headerSurface();
let readerSize=readerFontSize(localStorage.getItem('adult_reader_size')||18);function setReaderSize(delta){readerSize=readerFontSize(readerSize+delta);localStorage.setItem('adult_reader_size',readerSize);$('#readerText').style.fontSize=readerSize+'px';$('#readerSizeValue').textContent=readerSize;$('#readerSmaller').disabled=readerSize<=16;$('#readerLarger').disabled=readerSize>=24;updateReadingIndicator()}$('#readerSmaller').onclick=()=>setReaderSize(-1);$('#readerLarger').onclick=()=>setReaderSize(1);setReaderSize(0);
