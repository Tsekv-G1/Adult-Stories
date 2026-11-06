export const sharedCtaGap=site=>{const gap=Number(site?.shared_cta_gap_seconds);return Number.isFinite(gap)&&gap>=1&&gap<=2?gap:1.5};
export function mergeSiteAudio(current,content,sharedKey){
 const urls=['shared_preview_url','shared_cta_url'],keys=[...urls,'shared_cta_gap_seconds'];
 if(sharedKey&&!urls.includes(sharedKey))throw Error('invalid_audio_setting');
 if(sharedKey){
  const next={...current,[sharedKey]:content[sharedKey]};
  if(sharedKey==='shared_cta_url'){
   if(content[sharedKey])next.shared_cta_gap_seconds=sharedCtaGap(content);
   else delete next.shared_cta_gap_seconds;
  }
  return next;
 }
 const next={...content};for(const key of keys){if(current[key]!==undefined)next[key]=current[key];else delete next[key]}
 return next;
}
