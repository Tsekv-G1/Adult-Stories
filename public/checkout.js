import {$,esc,fmtPrice} from './core.js?v=8.8.0';
import {memberRequest,apiMessage} from './customer-api.js?v=8.10.0';
export function createCheckout({memberAuth,modal,closeModal=()=>{}}){
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
   const account=String(p.account||'').replace(/\D/g,''),iban='18000500',support=String(p.support||'').replace(/\D/g,'').replace(/^976/,'').slice(-8);
   const waitingCopy='Төлбөрийн мэдэгдлийг хүлээн авлаа. Баталгаажуулалт дуусмагц эрх таны бүртгэлд идэвхжинэ.';
   const returnLabel=kind==='story'?'Өгүүллэгээ үргэлжлүүлэх':'Нүүр хуудас руу буцах';
   render('Дансаар төлөх',`<div class="checkout-total"><span>${kind==='membership'?`${Number(o.membership_days)||membershipDays} хоног · Бүх өгүүллэг`:esc(story?.title||'Өгүүллэг')}</span><strong>${fmtPrice(o.amount)}</strong></div><div class="bank-details"><div><span>Банк</span><strong>${esc(p.bank)}</strong></div><div><span>Данс</span><button class="bank-copy" id="copyBank" data-copy-value="${esc(account)}">${esc(account)} <span>Хуулах ⧉</span></button></div><div><span>Хүлээн авагч</span><strong>${esc(p.name)}</strong></div><div><span>IBAN</span><button class="bank-copy" id="copyIban" data-copy-value="${iban}">${iban} <span>Хуулах ⧉</span></button></div></div><p class="muted">Шилжүүлсний дараа мэдэгдэнэ үү. Шалгаж дуусмагц эрх тань идэвхжинэ.</p><form id="reportPayment"><button class="btn primary btn-block" type="submit">ШИЛЖҮҮЛСЭН · МЭДЭГДЭХ</button><p id="paymentStatus" role="status" aria-live="polite"></p></form><button type="button" class="btn secondary btn-block" id="checkoutReturn">${returnLabel}</button><p class="small">Тусламж: ${esc(support)}</p>`);
   const form=$('#reportPayment'),notice=$('#paymentStatus'),returnButton=$('#checkoutReturn');
   returnButton.onclick=()=>closeModal();
   if(o.payment_reported_at){const reportButton=form.querySelector('button');reportButton.disabled=true;reportButton.textContent='МЭДЭГДЭЛ ИЛГЭЭГДЛЭЭ ✓';notice.textContent=waitingCopy;}
   const copy=async(button)=>{try{await navigator.clipboard.writeText(button.dataset.copyValue);if(valid()&&button.isConnected)button.innerHTML=esc(button.dataset.copyValue)+' <span>Хуулсан ✓</span>'}catch{if(valid()&&button.isConnected)button.innerHTML=esc(button.dataset.copyValue)+' <span>Сонгоод хуулна уу</span>'}};
   ['copyBank','copyIban'].forEach(id=>$('#'+id).onclick=event=>copy(event.currentTarget));
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
  }catch(error){if(valid())render('Төлбөр',`<p>${esc(apiMessage(error.code))}</p>`)}finally{if(token===generation)busy=false}
 }
 return{start};
}
