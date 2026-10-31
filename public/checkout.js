import {$,esc,fmtPrice} from './core.js?v=8.2.0';
import {memberRequest,apiMessage} from './customer-api.js?v=8.2.0';
export function createCheckout({memberAuth,modal}){
 let busy=false,pending=null;
 document.getElementById('accountDialog').addEventListener('close',()=>{pending=null});
 window.addEventListener('adult-member-changed',event=>{if(event.detail&&pending){const intent=pending;pending=null;start(intent.kind,intent.story)}});
 async function start(kind,story){
  if(!memberAuth.user){pending={kind,story};memberAuth.open();return}
  if(busy)return;busy=true;
  try{
   const key='adult_checkout_'+kind+'_'+(story?.id||'all');let clientId=sessionStorage.getItem(key);if(!clientId){clientId=crypto.randomUUID();sessionStorage.setItem(key,clientId)}
   const result=await memberRequest('order',{kind,story_id:story?.id,client_id:clientId}),o=result.order,p=result.payment;
   if(o.status!=='pending'){sessionStorage.removeItem(key);modal('Захиалгын төлөв',`<p>${o.status==='approved'?'Эрх нээгдсэн байна. Өгүүллэгээ дахин нээгээрэй.':'Өмнөх захиалгын төлөв өөрчлөгдсөн. Дахин оролдоно уу.'}</p>`);return}
   modal('Дансаар төлөх',`<div class="checkout-total"><span>${kind==='membership'?'30 хоног · Бүх өгүүллэг':esc(story?.title||'Өгүүллэг')}</span><strong>${fmtPrice(o.amount)}</strong></div><div class="bank-details"><div><span>Банк</span><strong>${esc(p.bank)}</strong></div><div><span>Данс</span><button class="bank-copy" id="copyBank">${esc(p.account)} ⧉</button></div><div><span>Хүлээн авагч</span><strong>${esc(p.name)}</strong></div><div><span>Гүйлгээний утга</span><button class="bank-copy" id="copyMemo">${esc(o.memo)} ⧉</button></div></div><p class="muted">Дүн болон гүйлгээний утгыг яг тааруулж шилжүүлнэ үү. Админ шилжүүлгийг шалгасны дараа эрх нээгдэнэ.</p><form id="reportPayment"><label for="paymentReceipt">Шилжүүлгийн лавлагаа / баримтын дугаар</label><input id="paymentReceipt" minlength="4" maxlength="120" required><button class="btn primary btn-block" type="submit">Шилжүүлсэн · Шалгуулах</button><p id="paymentStatus" role="status"></p></form><p class="small">Тусламж: ${esc(p.support)}</p>`);
   const copy=async(text,button)=>{try{await navigator.clipboard.writeText(text);button.textContent='Хуулагдлаа ✓'}catch{button.textContent=text+' · сонгож хуулна уу'}};
   $('#copyBank').onclick=event=>copy(p.account,event.currentTarget);$('#copyMemo').onclick=event=>copy(o.memo,event.currentTarget);
   $('#reportPayment').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;try{await memberRequest('report',{id:o.id,receipt:$('#paymentReceipt').value});$('#paymentStatus').textContent='Төлбөр шалгагдаж байна. Давхар шилжүүлэг хийх шаардлагагүй.';button.textContent='Шалгуулахаар илгээсэн ✓'}catch(error){$('#paymentStatus').textContent=apiMessage(error.code);button.disabled=false}};
  }catch(error){modal('Төлбөр',`<p>${esc(apiMessage(error.code))}</p>`)}finally{busy=false}
 }
 return{start};
}
