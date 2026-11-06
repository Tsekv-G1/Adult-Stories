'use strict';

const allowedKinds={membership:order=>`${[7,30].includes(Number(order.membership_days))?Number(order.membership_days):30} хоногийн эрх`,story:()=> 'Өгүүллэг'};

const cleanName=value=>String(value||'').replace(/[<>\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'Нэр оруулаагүй';
function displayPhone(value){
 const digits=String(value||'').replace(/\D/g,'');
 if(/^976\d{8}$/.test(digits))return digits.slice(3);
 if(/^\d{8}$/.test(digits))return digits;
 return /^[1-9]\d{7,14}$/.test(digits)?'+'+digits:'Дугаар олдсонгүй';
}
async function paymentMember(order,member){
 if(member?.phone)return member;
 const core=require('./core.cjs');
 try{
  const id=core.uuid(order.member_id);
  return (await core.db('adult_members?id=eq.'+id+'&select=name,phone&limit=1'))?.[0]||member||{};
 }catch{return member||{}}
}
/* Optional admin notice: identify the payer; never include credentials or bank references. */
async function notifyPayment({event,order,member}){
 const token=process.env.TELEGRAM_BOT_TOKEN,chatId=process.env.TELEGRAM_CHAT_ID;
 if(!token||!chatId||!order)return false;
 const labels={reported:'Шинэ төлбөрийн мэдүүлэг',approved:'Төлбөр батлагдлаа',rejected:'Төлбөр татгалзлаа'};
 if(!labels[event])return false;
 const amount=Number(order.amount),kind=(allowedKinds[order.kind]||(()=> 'Захиалга'))(order);
 if(!order.id||!Number.isFinite(amount))return false;
 const payer=await paymentMember(order,member);
 const text=`Adult Stories · ${labels[event]}\nНэр: ${cleanName(payer.name)}\nУтас: ${displayPhone(payer.phone)}\nТөрөл: ${kind}\nДүн: ${Math.round(amount).toLocaleString('en-US')}₮\nШалгах: DropDashboard → Admin → Adult Stories`;
 try{
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true}),
   signal:AbortSignal.timeout(3500)
  });
  return response.ok;
 }catch{return false}
}

async function notifyRegistration({member}){
 const token=process.env.TELEGRAM_BOT_TOKEN,chatId=process.env.TELEGRAM_CHAT_ID;
 if(!token||!chatId||!member)return false;
 const name=cleanName(member.name);
 const phone=displayPhone(member.phone);
 if(phone==='Дугаар олдсонгүй')return false;
 const text=`Adult Stories · Шинэ хэрэглэгч бүртгүүллээ\nНэр: ${name}\nДугаар: ${phone}`;
 try{
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true}),
   signal:AbortSignal.timeout(3500)
  });
  return response.ok;
 }catch{return false}
}

module.exports={notifyPayment,notifyRegistration};
