import {supa,online,CONFIG} from './core.js?v=8.4.0';
// Drafts are scoped to the owner and story captured at inspection time.
export function createDrafts({capture,restore,key,ready,onError=()=>{}}){
 const bar=document.createElement('div');bar.className='draft-bar';bar.innerHTML='<p role="status">Ноорог автоматаар хадгална.</p><button type="button" data-restore hidden>Ноорог сэргээх</button><button type="button" data-discard hidden>Ноорог хаях</button>';document.getElementById('storyEditorTitle').closest('.panel')?.prepend(bar);
 if(!bar.isConnected)document.getElementById('saveStory').parentElement.before(bar);
 const status=bar.querySelector('p'),recover=bar.querySelector('[data-restore]'),discard=bar.querySelector('[data-discard]'),contexts=new Map();let current=null,writing=Promise.resolve();
 const storageKey=ctx=>'adult_draft_v8_'+new URL(CONFIG.supabaseUrl||location.href).host+'_'+ctx.owner+'_'+ctx.key;
 const snapshot=()=>JSON.parse(JSON.stringify(capture()));
 function buttons(ctx=current){if(ctx!==current)return;recover.hidden=!ctx?.candidate;discard.hidden=!ctx?.candidate}
 function saveLocal(ctx,payload){try{localStorage.setItem(storageKey(ctx),JSON.stringify({payload,updated_at:new Date().toISOString()}));ctx.localSaved=true;return true}catch{ctx.localSaved=false;if(ctx===current)status.textContent='Ноорог төхөөрөмжид хадгалагдсангүй. Гараар хадгална уу.';return false}}
 function persist(ctx,payload){if(ctx.owner)return saveLocal(ctx,payload);ctx.identity.then(()=>{if(ctx.latest===payload)saveLocal(ctx,payload)}).catch(()=>{});return false}
 function inspect(){
  if(current)clearTimeout(current.timer);const priorWriting=writing,ctx={key:key(),owner:online?null:'local',revision:0,candidate:null,edits:0,latest:null,conflict:false,clearing:false};current=ctx;contexts.set(ctx.key,ctx);buttons();
  ctx.identity=(async()=>{if(online){const{data}=await(await supa()).auth.getSession();ctx.owner=data.session?.user?.id||'signed-out'}return ctx.owner})();
  ctx.loading=(async()=>{await ctx.identity;await priorWriting;if(ctx!==current)return;let candidate=null,offline=false;try{candidate=JSON.parse(localStorage.getItem(storageKey(ctx))||'null')}catch{}
   if(online&&ctx.owner!=='signed-out')try{const{data,error}=await(await supa()).from('adult_editor_drafts').select('*').eq('owner_id',ctx.owner).eq('draft_key',ctx.key).maybeSingle();if(error)throw error;if(ctx!==current)return;ctx.revision=data?.revision||0;if(data&&(!candidate||Date.parse(data.updated_at)>Date.parse(candidate.updated_at)))candidate=data}catch{offline=true}
   if(ctx!==current)return;ctx.candidate=ctx.edits?null:candidate;buttons(ctx);if(!ctx.edits)status.textContent=ctx.candidate?'Хадгалаагүй ноорог байна · '+new Date(ctx.candidate.updated_at).toLocaleString('mn-MN'):offline?'Серверийн ноорог холбогдсонгүй · Төхөөрөмжийн хуулбарыг ашиглана.':'Ноорог автоматаар хадгална.';
  })().catch(()=>{if(ctx===current)status.textContent='Ноорог холбогдсонгүй. Гараар хадгална уу.'});return ctx.loading;
 }
 function schedule(){
  if(!ready())return;if(!current||current.key!==key())inspect();const ctx=current,payload=snapshot();ctx.edits++;ctx.latest=payload;ctx.candidate=null;buttons(ctx);const localResult=persist(ctx,payload);if(localResult!==false)status.textContent=online?'Төхөөрөмжид хадгалж байна · Сервер рүү синк хийнэ…':'Ноорог төхөөрөмжид хадгалсан';clearTimeout(ctx.timer);
  ctx.timer=setTimeout(()=>{writing=writing.then(async()=>{await ctx.loading;if(ctx!==current||ctx.clearing)return;if(!online){status.textContent=ctx.localSaved?'Ноорог төхөөрөмжид хадгалсан':'Ноорог төхөөрөмжид хадгалагдсангүй. Гараар хадгална уу.';return}if(ctx.conflict||ctx.owner==='signed-out'){status.textContent='Төхөөрөмжийн ноорог хадгалсан · Серверийн нооргийг дахин шалгана уу.';return}
   const client=await supa();let query;if(ctx.revision===0)query=client.from('adult_editor_drafts').insert({owner_id:ctx.owner,draft_key:ctx.key,payload,revision:1});else query=client.from('adult_editor_drafts').update({payload,revision:ctx.revision+1,updated_at:new Date().toISOString()}).eq('owner_id',ctx.owner).eq('draft_key',ctx.key).eq('revision',ctx.revision);
   const{data,error}=await query.select('revision');if(error){if(error.code==='23505')ctx.conflict=true;throw error}if(!data?.length){ctx.conflict=true;throw Error('draft_conflict')}ctx.revision=data[0].revision;if(ctx===current&&!ctx.clearing)status.textContent='Ноорог хадгалсан · '+new Date().toLocaleTimeString('mn-MN');
  }).catch(()=>{if(ctx===current&&!ctx.clearing)status.textContent=ctx.conflict?'Төхөөрөмжид хадгалсан · Серверийн ноорогтой зөрсөн. Гараар хадгална уу.':'Төхөөрөмжид хадгалсан · Серверт хараахан хадгалаагүй.'})},1400);
 }
 async function clear(k=key(),message='Өгүүллэг хадгалагдсан'){
  const ctx=contexts.get(k);if(!ctx)return;ctx.clearing=true;clearTimeout(ctx.timer);await ctx.loading;await writing;
  try{localStorage.removeItem(storageKey(ctx))}catch{onError('Өгүүллэг хадгалагдсан. Төхөөрөмжийн хуучин нооргийг арилгаж чадсангүй.')}
  if(online&&ctx.owner!=='signed-out'&&ctx.revision>0)try{const{error}=await(await supa()).from('adult_editor_drafts').delete().eq('owner_id',ctx.owner).eq('draft_key',ctx.key).eq('revision',ctx.revision);if(error)throw error}catch{onError('Өгүүллэг хадгалагдсан. Серверийн нооргийг арилгаж амжаагүй.')}
  ctx.candidate=null;ctx.latest=null;ctx.revision=0;ctx.edits=0;ctx.clearing=false;buttons(ctx);if(ctx===current)status.textContent=message;
 }
 recover.onclick=()=>{const ctx=current;if(ctx?.candidate){restore(ctx.candidate.payload);ctx.candidate=null;buttons(ctx);schedule()}};
 discard.onclick=()=>{if(confirm('Хадгалаагүй нооргийг хаях уу?'))clear(key(),'Ноорог хаясан').catch(()=>onError('Ноорог хаяж чадсангүй.'))};
 return{inspect,schedule,clear,flushLocal(){if(ready()&&current){const payload=snapshot();current.latest=payload;persist(current,payload)}}};
}
