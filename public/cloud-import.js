/* Additive, retryable migration. Existing stories are never overwritten by matching slugs. */
import {supa,isAdmin,safeUrl,getData,saveSite,slugify} from './core.js?v=8.0.0';
export async function importCloudBackup(backup,{homepage=false,onProgress=()=>{}}={}){
 if(!backup?.site||!Array.isArray(backup.assets)||!Array.isArray(backup.stories))throw Error('Backup JSON формат буруу.');
 if(!await isAdmin())throw Error('Зөвхөн админ импорт хийх эрхтэй.');
 const sb=await supa(),current=await getData({admin:true}),assetMap=new Map(),storyMap=new Map(),result={assets:0,stories:0,skipped:0};
 // Validate before the first remote mutation.
 for(const source of backup.assets)if(!safeUrl(source.url)||!source.url.startsWith('https://'))throw Error('Онлайн зураг бүр HTTPS хаягтай байх шаардлагатай.');
 const slugs=backup.stories.map(s=>String(s.slug||slugify(s.title)));if(new Set(slugs).size!==slugs.length)throw Error('Backup дотор өгүүллэгийн холбоос давхардсан байна.');
 for(const [index,source] of backup.assets.entries()){
  onProgress(`Зураг ${index+1}/${backup.assets.length}`);
  let target=current.assets.find(a=>a.url===source.url||(source.asset_id&&a.asset_id===source.asset_id));
  if(!target){const values={url:source.url,public_id:String(source.public_id||''),asset_id:String(source.asset_id||''),filename:String(source.filename||'Image'),alt_text:String(source.alt_text||''),width:Math.max(0,Math.floor(Number(source.width)||0)),height:Math.max(0,Math.floor(Number(source.height)||0)),bytes:Math.max(0,Math.floor(Number(source.bytes)||0)),format:String(source.format||'')};const response=await sb.from('media_assets').insert(values).select().single();if(response.error)throw response.error;target=response.data;current.assets.push(target);result.assets++}
  assetMap.set(source.id,target.id);
 }
 for(const [index,source] of backup.stories.entries()){
  onProgress(`Өгүүллэг ${index+1}/${backup.stories.length}`);
  const slug=slugs[index],marker='local-backup:'+String(source.id||slug),existing=current.stories.find(s=>s.slug===slug);
  if(existing&&(existing.overlay?.cms_import_source!==marker||existing.overlay?.cms_import_complete===true)){storyMap.set(source.id,existing.id);result.skipped++;continue}
  const privateBody=(backup.bodies||[]).find(b=>b.story_id===source.id);
  if(!privateBody)throw Error(`${source.title}: бүтэн текстийн backup алга. Эхлээд локал админаас бүтэн JSON BACKUP авна уу.`);
  const status=['draft','published','archived'].includes(source.status)?source.status:'draft';
  const values={slug,title:String(source.title||slug),category:String(source.category||'Нууцлаг'),excerpt:String(source.excerpt||''),preview_text:String(source.preview_text||''),status:'draft',price:Math.max(0,Math.floor(Number(source.price)||0)),read_minutes:Math.max(1,Math.ceil(Number(source.read_minutes)||1)),sort_order:Math.max(0,Math.floor(Number(source.sort_order)||100)),tags:Array.isArray(source.tags)?source.tags.map(String):[],cover_id:assetMap.get(source.cover_id)||null,overlay:{...(source.overlay||{}),cms_import_source:marker,cms_import_complete:false},audio_preview_url:safeUrl(source.audio_preview_url)||'',publish_at:source.publish_at&&Number.isFinite(Date.parse(source.publish_at))?source.publish_at:null};
  let target=existing;
  if(!target){const response=await sb.from('stories').insert(values).select().single();if(response.error)throw response.error;target=response.data;current.stories.push(target)}
  // A failed private write leaves an identifiable draft; a retry finishes that draft.
  if(privateBody){const response=await sb.from('story_private').upsert({story_id:target.id,full_text:String(privateBody.full_text||''),full_audio_url:safeUrl(privateBody.full_audio_url)||''});if(response.error)throw response.error}
  const finished=await sb.from('stories').update({...values,status,overlay:{...values.overlay,cms_import_complete:true}}).eq('id',target.id);if(finished.error)throw finished.error;
  storyMap.set(source.id,target.id);result.stories++;
 }
 if(homepage){const content={...backup.site,id:'main',hero_asset_id:assetMap.get(backup.site.hero_asset_id)||null,featured_story_id:storyMap.get(backup.site.featured_story_id)||null};await saveSite(content)}
 window.dispatchEvent(new CustomEvent('adult-data-changed'));return result;
}
