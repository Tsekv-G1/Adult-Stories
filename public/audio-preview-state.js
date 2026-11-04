// Keeps the R2 crop result tied to the exact editor settings used to render it.
// Without this, changing the CTA while a background job runs could publish stale audio.
const str=value=>String(value||'').trim();
const seconds=value=>Number(value);
export function cropConfiguration({reference='',start=0,end=0,ctaUrl='',ctaGap=1.5}={}){
 return {reference:str(reference),start:seconds(start),end:seconds(end),ctaUrl:str(ctaUrl),ctaGap:str(ctaUrl)?seconds(ctaGap):1.5};
}
export function cropConfigurationMatches(expected,current){
 if(!expected||!current)return false;
 const a=cropConfiguration(expected),b=cropConfiguration(current);
 return a.reference===b.reference&&a.start===b.start&&a.end===b.end&&a.ctaUrl===b.ctaUrl&&a.ctaGap===b.ctaGap;
}
export function decodeCropJob(raw){
 if(!raw)return null;
 try{
  const parsed=JSON.parse(raw);
  if(parsed&&typeof parsed==='object'&&/^[a-f0-9-]{36}$/i.test(parsed.id||''))return parsed;
 }catch{}
 // Older editor versions stored only a job UUID.
 return /^[a-f0-9-]{36}$/i.test(raw)?{id:raw}:null;
}
export function audioPreviewIsStale({preview='',current,rendered={}}={}){
 if(!str(preview))return false;
 if(str(current?.ctaUrl)!==str(rendered.ctaUrl))return true;
 if(str(current?.ctaUrl)&&seconds(current.ctaGap)!==seconds(rendered.ctaGap))return true;
 // A URL generated outside the new audited flow should not be shown as proven CTA audio.
 if(str(current?.ctaUrl)&&!str(rendered.previewUrl))return true;
 if(str(rendered.previewUrl)&&str(rendered.previewUrl)!==str(preview))return true;
 if(str(rendered.previewUrl)&&!cropConfigurationMatches(rendered,current))return true;
 return false;
}
