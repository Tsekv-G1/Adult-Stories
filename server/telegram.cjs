'use strict';

const allowedKinds={membership:order=>`${[7,30].includes(Number(order.membership_days))?Number(order.membership_days):30} хоногийн эрх`,story:()=> 'Өгүүллэг'};

/* Optional admin notification. Message contents deliberately exclude member data and bank references. */
async function notifyPayment({event,order}){
 const token=process.env.TELEGRAM_BOT_TOKEN,chatId=process.env.TELEGRAM_CHAT_ID;
 if(!token||!chatId||!order)return false;
 const labels={reported:'Шинэ төлбөрийн мэдүүлэг',approved:'Төлбөр батлагдлаа',rejected:'Төлбөр татгалзлаа'};
 if(!labels[event])return false;
 const id=String(order.id||'').slice(0,8),amount=Number(order.amount),kind=(allowedKinds[order.kind]||(()=> 'Захиалга'))(order);
 if(!id||!Number.isFinite(amount))return false;
 const text=`Adult Stories · ${labels[event]}\nЗахиалга: ${id}\nТөрөл: ${kind}\nДүн: ${Math.round(amount).toLocaleString('en-US')}₮\nШалгах: DropDashboard → Admin → Adult Stories`;
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
 const name=String(member.name||'Нэр оруулаагүй').replace(/[<>]/g,'').slice(0,80);
 const phone=String(member.phone||'').replace(/\D/g,'').replace(/^976/,'').slice(-8);
 if(!phone)return false;
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
