import {originalImageUrl} from './image-upscale.js?v=8.5.0';
// Original media URLs stay intact in storage/CMS. Delivery variants are width limited and cached by the CDN.
export function optimizedImage(raw,width=720){
 try{const u=new URL(raw);if(/\/cms-images\/[a-f\d-]{36}\.(jpg|png|webp|avif)\.screen\.webp$/i.test(u.pathname))return width<=800?raw.replace(/\.screen\.webp(?=$|[?#])/i,'.thumb.webp'):raw;if(u.protocol!=='https:'||u.hostname!=='res.cloudinary.com')return raw;const match=u.pathname.match(/^(\/[^/]+\/image\/upload\/)(.+)$/);if(!match||/^s--/.test(match[2])||/\.svg$/i.test(u.pathname))return raw;
 const size=Math.max(160,Math.min(2000,Math.round(width)));const enhanced=match[2].startsWith('e_upscale/'),tail=enhanced?match[2].slice(10):match[2];u.pathname=match[1]+(enhanced?'e_upscale/':'')+`c_limit,w_${size}/q_auto/f_auto/`+tail;return u.href}catch{return raw}
}
export const excerptText=(raw,limit=110)=>{const clean=String(raw||'').replace(/\s+/g,' ').replace(/[.\u2026\s]+$/,'').trim();if(clean.length<=limit)return clean;const slice=clean.slice(0,limit),cut=slice.lastIndexOf(' ');return slice.slice(0,cut>limit*.6?cut:limit).replace(/[.,;:!?\s]+$/,'')+'…'};
export function deliverImage(image,url,{kind='card',priority=false,alt=''}={}){
 const widths=kind==='card'?[320,480,720,960]:[480,800,1200,1600,2000];image.alt=alt;image.decoding='async';image.loading=priority?'eager':'lazy';image.fetchPriority=priority?'high':'auto';const optimized=optimizedImage(url,kind==='card'?480:1200);
 if(optimized!==url&&!/\/cms-images\/[a-f\d-]{36}\.(jpg|png|webp|avif)\.screen\.webp(?:$|[?#])/i.test(url)){image.srcset=widths.map(w=>optimizedImage(url,w)+' '+w+'w').join(', ');image.sizes=kind==='card'?'(max-width: 690px) calc((100vw - 44px)/2), (max-width: 1000px) calc((100vw - 72px)/2), 380px':'(max-width: 690px) 100vw, 1200px'}
 image.onerror=()=>{if(image.dataset.fallback)return;image.dataset.fallback='true';image.removeAttribute('srcset');image.src=originalImageUrl(url)};image.src=optimized;
}
