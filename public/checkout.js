import {$,esc,fmtPrice} from './core.js?v=8.3.0';
import {memberRequest,apiMessage} from './customer-api.js?v=8.3.0';
export function createCheckout({memberAuth,modal,closeModal=()=>{}}){
 let busy=false,pending=null,generation=0,owner=null,rendering=false;
 function invalidate(){generation++;busy=false;owner=null;pending=null}
 function render(title,content){rendering=true;try{modal(title,content)}finally{rendering=false}}
 document.getElementById('accountDialog').addEventListener('close',()=>{pending=null});
 window.addEventListener('adult-modal-closed',invalidate);
 window.addEventListener('adult-modal-opening',()=>{if(!rendering)invalidate()});
 window.addEventListener('adult-member-changed',event=>{const intent=event.detail?pending:null,wasOpen=!!owner;invalidate();if(wasOpen)closeModal();if(intent)start(intent.kind,intent.story)});
 async function start(kind,story){
  if(!memberAuth.user){pending={kind,story};memberAuth.open();return}
  if(busy)return;busy=true;const token=++generation,userId=memberAuth.user.id;owner=userId;
  const valid=()=>token===generation&&memberAuth.user?.id===userId;
  render('Төлбөр','<div class="checkout-loading" role="status"><span class="loading-ring" aria-hidden="true"></span><p>Төлбөрийн мэдээллийг бэлдэж байна…</p></div>');
  try{
   const key='adult_checkout_'+userId+'_'+kind+'_'+(story?.id||'all');let clientId;try{clientId=sessionStorage.getItem(key)}catch{}if(!clientId){clientId=crypto.randomUUID();try{sessionStorage.setItem(key,clientId)}catch{}}
   const result=await memberRequest('order',{kind,story_id:story?.id,client_id:clientId});if(!valid())return;const o=result.order,p=result.payment;
   if(o.status!=='pending'){try{sessionStorage.removeItem(key)}catch{}render('Захиалгын төлөв',`<p>${o.status==='approved'?'Эрх нээгдсэн байна. Өгүүллэгээ дахин нээгээрэй.':'Өмнөх захиалгын төлөв өөрчлөгдсөн. Дахин оролдоно уу.'}</p>`);return}
   render('Дансаар төлөх',`<div class="checkout-total"><span>${kind==='membership'?'30 хоног · Бүх өгүүллэг':esc(story?.title||'Өгүүллэг')}</span><strong>${fmtPrice(o.amount)}</strong></div><div class="bank-details"><div><span>Банк</span><strong>${esc(p.bank)}</strong></div><div><span>Данс</span><button class="bank-copy" id="copyBank">${esc(p.account)} ⧉</button></div><div><span>Хүлээн авагч</span><strong>${esc(p.name)}</strong></div><div><span>Гүйлгээний утга</span><button class="bank-copy" id="copyMemo">${esc(o.memo)} ⧉</button></div></div><p class="muted">Дүн болон гүйлгээний утгыг яг тааруулж шилжүүлнэ үү. Админ шилжүүлгийг шалгасны дараа эрх нээгдэнэ.</p><form id="reportPayment"><label for="paymentReceipt">Шилжүүлгийн лавлагаа / баримтын дугаар</label><input id="paymentReceipt" minlength="4" maxlength="120" required><button class="btn primary btn-block" type="submit">Шилжүүлсэн · Шалгуулах</button><p id="paymentStatus" role="status"></p></form><p class="small">Тусламж: ${esc(p.support)}</p>`);
   const account=$('#copyBank'),memo=$('#copyMemo'),form=$('#reportPayment'),receipt=$('#paymentReceipt'),notice=$('#paymentStatus');
   const copy=async(text,button)=>{try{await navigator.clipboard.writeText(text);if(valid()&&button.isConnected)button.textContent='Хуулсан ✓'}catch{if(valid()&&button.isConnected)button.textContent=text+' · сонгож хуулна уу'}};
   account.onclick=()=>copy(p.account,account);memo.onclick=()=>copy(o.memo,memo);
   form.onsubmit=async event=>{event.preventDefault();if(!valid())return;const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;try{await memberRequest('report',{id:o.id,receipt:receipt.value});if(!valid()||!form.isConnected)return;notice.textContent='Төлбөр шалгагдаж байна. Давхар шилжүүлэг хийх шаардлагагүй.';button.textContent='Шалгуулахаар илгээсэн ✓'}catch(error){if(!valid()||!form.isConnected)return;notice.textContent=apiMessage(error.code);button.disabled=false}};
  }catch(error){if(valid())render('Төлбөр',`<p>${esc(apiMessage(error.code))}</p>`)}finally{if(token===generation)busy=false}
 }
 return{start};
}
