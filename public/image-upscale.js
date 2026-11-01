// Cloudinary keeps the original asset. The saved delivery URL marks an AI-derived version.
export function originalImageUrl(raw){return String(raw||'').replace('/image/upload/e_upscale/','/image/upload/')}
export function upscaleUrl(raw,width,height){
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='res.cloudinary.com'||!/^\/[^/]+\/image\/upload\/(v\d+\/)?[^,]+$/.test(u.pathname)||/\.(svg|gif|pdf)$/i.test(u.pathname)||/\/upload\/s--/.test(u.pathname))return null;
 if(!(width>0&&height>0)||width*height>=4200000||Math.max(width,height)>=2000)return null;
 u.pathname=u.pathname.replace('/image/upload/','/image/upload/e_upscale/');return u.href}catch{return null}
}
export async function prepareUpscale(raw,width,height,{enabled=true,signal,onStatus=()=>{}}={}){
 const candidate=enabled?upscaleUrl(raw,width,height):null;if(!candidate)return{url:raw,message:enabled?'Эх хэмжээ хангалттай · Эх зураг хадгалсан':'Эх зураг хадгалсан'};
 const probe=candidate.replace('/e_upscale/','/e_upscale/c_limit,w_1600/q_auto/f_auto/');onStatus('AI upscale боловсруулж байна…');
 try{for(let attempt=0;attempt<5;attempt++){
  const response=await fetch(probe,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
  if(response.ok&&response.headers.get('content-type')?.startsWith('image/')){await response.arrayBuffer();return{url:candidate,message:'AI upscale 4× · Эх файл хадгалагдсан'}}
  if(![420,423].includes(response.status))break;
  if(attempt<4)await new Promise((resolve,reject)=>{if(signal?.aborted){reject(signal.reason);return}const timer=setTimeout(done,1200);function done(){signal?.removeEventListener('abort',aborted);resolve()}function aborted(){clearTimeout(timer);signal?.removeEventListener('abort',aborted);reject(signal.reason)}signal?.addEventListener('abort',aborted,{once:true})});
 }}catch(error){if(signal?.aborted)throw error}
 return{url:raw,message:'Эх зураг хадгалсан · AI upscale одоогоор боломжгүй'};
}
