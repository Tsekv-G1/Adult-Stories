import {$,esc,fmtPrice} from './core.js?v=8.8.0';
import {memberRequest,apiMessage} from './customer-api.js?v=9.0.0';
export function createCheckout({memberAuth,modal,closeModal=()=>{},getSite=()=>({})}){
 let busy=false,pending=null,generation=0,owner=null,rendering=false,pollTimer=null,statusBusy=false;
 function invalidate(){generation++;busy=false;owner=null;pending=null;statusBusy=false;clearTimeout(pollTimer);pollTimer=null}
 function render(title,content){rendering=true;try{modal(title,content)}finally{rendering=false}}
 window.addEventListener('adult-modal-closed',invalidate);
 window.addEventListener('adult-modal-opening',()=>{if(!rendering)invalidate()});
 window.addEventListener('adult-member-changed',event=>{const intent=event.detail?pending:null,wasOpen=!!owner;invalidate();if(wasOpen)closeModal();if(intent)start(intent.kind,intent.story,intent.membershipDays)});
 function paymentCelebration(order,kind,story,valid){
  clearTimeout(pollTimer);pollTimer=null;
  memberAuth.refresh().then(account=>{if(valid())window.dispatchEvent(new CustomEvent('adult-entitlements-refreshed',{detail:{user:memberAuth.user,account}}))}).catch(()=>{});
  window.dispatchEvent(new CustomEvent('adult-payment-approved',{detail:{order:{...order,kind,membership_days:order.membership_days||30,story_id:order.story_id||story?.id}}}));
  closeModal();
 }
 async function start(kind,story,membershipDays=30){
  membershipDays=kind==='membership'?(Number(membershipDays)===7?7:30):null;
  if(!memberAuth.user){pending={kind,story,membershipDays};memberAuth.open();return}
  if(busy)return;busy=true;const token=++generation,userId=memberAuth.user.id;owner=userId;
  const valid=()=>token===generation&&memberAuth.user?.id===userId;
  render('Төлбөр','<div class="checkout-loading" role="status"><span class="loading-ring" aria-hidden="true"></span><p>Төлбөрийн мэдээллийг бэлдэж байна…</p></div>');
  try{
   const key='adult_checkout_'+userId+'_'+kind+'_'+(story?.id||'all')+(membershipDays?'_'+membershipDays:'');let clientId;try{clientId=sessionStorage.getItem(key)}catch{}if(!clientId){clientId=crypto.randomUUID();try{sessionStorage.setItem(key,clientId)}catch{}}
   const result=await memberRequest('order',{kind,story_id:story?.id,client_id:clientId,membership_days:membershipDays});if(!valid())return;const o=result.order,p=result.payment;
   if(o.status==='approved'){paymentCelebration(o,kind,story,valid);return}
   if(o.status!=='pending'){try{sessionStorage.removeItem(key)}catch{}render('Захиалгын төлөв','<p>Өмнөх захиалгын төлөв өөрчлөгдсөн байна. Шинэ захиалга үүсгэнэ үү.</p>');return}
   const account=String(p.account||'').trim(),iban=String(p.iban||'').trim(),memo=String(o.memo||'').trim(),support=String(p.support||'').replace(/\D/g,'').replace(/^976/,'').slice(-8);
   if(!account||!p.bank||!p.name||!memo)throw Error('payment_not_configured');
   const waitingCopy='Төлбөрийн мэдэгдлийг хүлээн авлаа. Баталгаажуулалт дуусмагц эрх таны бүртгэлд идэвхжинэ.';
   const returnLabel=kind==='story'?'Өгүүллэгээ үргэлжлүүлэх':'Өөр эрх сонгох';
   render('Дансаар төлөх',`<div class="checkout-total"><span>${kind==='membership'?`${Number(o.membership_days)||membershipDays} хоног · Бүх өгүүллэг`:esc(story?.title||'Өгүүллэг')}${o.first_purchase_offer?`<small>Анхны худалдан авалтын нэг удаагийн үнэ · Автоматаар сунгахгүй</small>`:''}</span><strong>${o.first_purchase_offer?`<del>${fmtPrice(Number(o.list_price)||Number(getSite()?.membership_list_price)||34900)}</del> `:''}${fmtPrice(o.amount)}</strong></div><div class="bank-details"><div><span>Банк</span><strong>${esc(p.bank)}</strong></div><div><span>Данс</span><button class="bank-copy" id="copyBank" data-copy-value="${esc(account)}">${esc(account)} <span>Хуулах ⧉</span></button></div><div><span>Хүлээн авагч</span><strong>${esc(p.name)}</strong></div>${iban?`<div><span>IBAN</span><button class="bank-copy" id="copyIban" data-copy-value="${esc(iban)}">${esc(iban)} <span>Хуулах ⧉</span></button></div>`:''}<div class="bank-memo"><span>ГҮЙЛГЭЭНИЙ УТГА · ЗААВАЛ</span><button class="bank-copy" id="copyMemo" data-copy-value="${esc(memo)}">${esc(memo)} <span>Хуулах ⧉</span></button></div></div><p class="checkout-memo-note">Шилжүүлэхдээ гүйлгээний утгыг яг хэвээр нь оруулна уу. Ингэснээр таны төлбөрийг танихад хялбар болно.</p><p class="muted">Шилжүүлсний дараа мэдэгдээд хүлээнэ үү. Баталгаажмагц эрх идэвхжинэ.</p><form id="reportPayment"><button class="btn primary btn-block" type="submit">ШИЛЖҮҮЛСЭН · МЭДЭГДЭХ</button><p id="paymentStatus" role="status" aria-live="polite"></p></form><button type="button" class="btn secondary btn-block" id="checkoutReturn">${returnLabel}</button><p class="small">Тусламж: ${esc(support)}</p>`);
   const form=$('#reportPayment'),notice=$('#paymentStatus'),returnButton=$('#checkoutReturn');
   returnButton.onclick=()=>{closeModal();if(kind==='membership')window.dispatchEvent(new CustomEvent('adult-open-membership-options'))};
   if(o.payment_reported_at){const reportButton=form.querySelector('button');reportButton.disabled=true;reportButton.textContent='МЭДЭГДЭЛ ИЛГЭЭГДЛЭЭ ✓';notice.textContent=waitingCopy;}
   const copy=async(button)=>{try{await navigator.clipboard.writeText(button.dataset.copyValue);if(valid()&&button.isConnected)button.innerHTML=esc(button.dataset.copyValue)+' <span>Хуулсан ✓</span>'}catch{if(valid()&&button.isConnected)button.innerHTML=esc(button.dataset.copyValue)+' <span>Сонгоод хуулна уу</span>'}};
   ['copyBank','copyIban','copyMemo'].forEach(id=>{const button=$('#'+id);if(button)button.onclick=event=>copy(event.currentTarget)});
   const checkStatus=async({schedule=true}={})=>{
    if(!valid()||statusBusy)return;clearTimeout(pollTimer);pollTimer=null;statusBusy=true;let terminal=false;
    try{const accountState=await memberRequest('me');if(!valid())return;const current=accountState.orders?.find(item=>item.id===o.id);
     if(current?.status==='approved'){paymentCelebration(current,kind,story,valid);return}
     if(current?.status==='rejected'){terminal=true;notice.textContent='Төлбөр баталгаажаагүй байна. Дэлгэрэнгүйг тусламжаас лавлана уу.';return}
     notice.textContent=current?.payment_reported_at?waitingCopy:'Шилжүүлсний дараа мэдэгдээрэй. Төлбөр баталгаажих хүртэл энд хүлээх эсвэл буцаж болно.';
    }catch(error){if(valid())notice.textContent=apiMessage(error.code)}finally{statusBusy=false;if(schedule&&!terminal&&valid()&&form.isConnected)pollTimer=setTimeout(()=>checkStatus({schedule:true}),12000)}
   };
   form.onsubmit=async event=>{event.preventDefault();if(!valid())return;const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;try{await memberRequest('report',{id:o.id});if(!valid()||!form.isConnected)return;notice.textContent=waitingCopy;button.textContent='МЭДЭГДЭЛ ИЛГЭЭГДЛЭЭ ✓';checkStatus({schedule:true})}catch(error){if(!valid()||!form.isConnected)return;notice.textContent=apiMessage(error.code);button.disabled=false}};
   if(o.payment_reported_at)checkStatus({schedule:true});
  }catch(error){if(valid())render('Төлбөр',`<p>${esc(error.message==='payment_not_configured'?'Төлбөрийн мэдээлэл бүрэн тохируулагдаагүй байна. Сайтын админтай холбогдоно уу.':apiMessage(error.code))}</p><button type="button" id="checkoutTryAgain" class="btn secondary btn-block">Дахин оролдох</button>`);if(valid()){const retry=$('#checkoutTryAgain');if(retry)retry.onclick=()=>{invalidate();start(kind,story,membershipDays)}}}finally{if(token===generation)busy=false}
 }
 return{start};
}
