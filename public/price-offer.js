export function priceOffer(listPrice,amount){
 const original=Number(listPrice),current=Number(amount);
 if(!Number.isFinite(original)||!Number.isFinite(current)||original<=0||current<0||current>=original)return null;
 const saved=original-current;
 return {original,current,saved,percent:Math.round(saved/original*100)};
}
