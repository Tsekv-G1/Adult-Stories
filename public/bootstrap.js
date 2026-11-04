/* Deliberately independent of the app module graph, so broken deploys stay usable. */
(() => {
 const script=document.currentScript,entry=script?.dataset.entry,admin=script?.dataset.app==='admin';
 const loading=document.getElementById('adminBootLoading');
 const finish=()=>{if(loading)loading.hidden=true};
 window.addEventListener('adult-admin-boot-complete',finish,{once:true});
 function failed(error){
  finish();console.error('Application startup failed:',error);
  if(admin){
   const help=document.getElementById('openHelp');if(!help)return;
   window.dispatchEvent(new Event('adult-admin-boot-complete'));
   help.style.display='grid';
   const card=help.querySelector('.open-help-card');
   card.replaceChildren();
   const title=document.createElement('h1');title.textContent='Admin студиог ачаалж чадсангүй';
   const text=document.createElement('p');text.textContent='Холболтоо шалгаад дахин оролдоно уу. Алдаа давтагдвал сайтын бүрэн шинэчлэл шаардлагатай.';
   const retry=document.createElement('button');retry.className='btn primary';retry.textContent='Дахин ачаалах ↻';retry.onclick=()=>location.reload();
   const back=document.createElement('a');back.href='/';back.textContent='Үндсэн хуудас руу буцах';back.style.marginLeft='16px';
   card.append(title,text,retry,back);
  }else{
   const grid=document.getElementById('storyGrid');if(!grid)return;
   grid.setAttribute('aria-busy','false');grid.replaceChildren();
   const box=document.createElement('div');box.className='empty';
   const text=document.createElement('p');text.textContent='Өгүүллэгүүдийг ачаалж чадсангүй. Холболтоо шалгаад дахин оролдоно уу.';
   const retry=document.createElement('button');retry.className='btn outline';retry.textContent='Дахин ачаалах ↻';retry.onclick=()=>location.reload();
   box.append(text,retry);grid.append(box);
  }
 }
 if(location.protocol==='file:'){finish();return}
 if(!entry){failed(Error('missing_entry'));return}
 import(new URL(entry,script.src).href).then(finish).catch(failed);
})();
