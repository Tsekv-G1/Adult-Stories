/* Phone + password use Supabase Auth directly. Passwords never enter CMS/local JSON. */
import {$,esc,supa,authConfigured,CONFIG} from './core.js?v=6.2.0';
export function normalizePhone(value){
 let raw=String(value||'').trim();if(!/^[+\d\s().-]+$/.test(raw))throw Error('Утасны дугаараа зөв оруулна уу.');
 raw=raw.replace(/[\s().-]/g,'');if(raw.startsWith('00'))raw='+'+raw.slice(2);
 if(/^\d{8}$/.test(raw))raw='+976'+raw;else if(/^976\d{8}$/.test(raw))raw='+'+raw;
 if(!/^\+[1-9]\d{7,14}$/.test(raw))throw Error('Монгол дугаараа 8 оронтой, бусад улсын дугаарыг +улсын кодтой оруулна уу.');return raw;
}
export async function assertPasswordSignupReady(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(CONFIG.supabaseUrl.replace(/\/$/,'')+'/auth/v1/settings',{headers:{apikey:CONFIG.supabaseAnonKey},cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('Auth settings unavailable');
  const settings=await response.json();
  if(settings.external?.phone!==true||settings.phone_autoconfirm!==true||settings.disable_signup===true){const error=Error('Phone/password signup is not configured');error.code='password_signup_not_ready';throw error}
 }catch(error){if(error.code==='password_signup_not_ready')throw error;const unavailable=Error('Auth settings unavailable');unavailable.code='auth_settings_unavailable';throw unavailable}finally{clearTimeout(timer)}
}
function authMessage(error){
 const code=error?.code||'',message=String(error?.message||'');
 if(code==='password_signup_not_ready')return 'Дугаараар бүртгүүлэх үйлчилгээ хараахан бэлэн болоогүй байна. Сайтын админтай холбогдоно уу.';
 if(code==='auth_settings_unavailable')return 'Бүртгэлийн үйлчилгээтэй холбогдсонгүй. Түр хүлээгээд дахин оролдоно уу.';
 if(code==='invalid_credentials'||/invalid login credentials/i.test(message))return 'Дугаар эсвэл нууц үг буруу байна.';
 if(code==='user_already_exists'||code==='phone_exists'||/already registered/i.test(message))return 'Энэ дугаар бүртгэлтэй байна. Нэвтрэх хэсгийг сонгоно уу.';
 if(code==='phone_not_confirmed')return 'Энэ бүртгэлийн дугаар баталгаажаагүй байна. Сайтын админтай холбогдоно уу.';
 if(code==='signup_disabled')return 'Шинэ бүртгэл түр хаалттай байна.';
 if(/rate|too many|over_.*limit/i.test(code+' '+message)||error?.status===429)return 'Олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.';
 if(code==='weak_password'||/password.*least/i.test(message))return 'Илүү урт, үсэг болон тоо хосолсон нууц үг сонгоно уу.';
 if(/phone_provider_disabled|sms_provider|provider.*disabled/i.test(code+' '+message))return 'Дугаараар бүртгүүлэх үйлчилгээ одоогоор идэвхгүй байна.';
 if(/fetch|network|failed to fetch/i.test(message))return 'Холболт тасарлаа. Интернэтээ шалгаад дахин оролдоно уу.';
 return 'Хүсэлтийг гүйцэтгэж чадсангүй. Дахин оролдоно уу.';
}
export function createMemberAuth({onUser=()=>{}}={}){
 const dialog=$('#accountDialog'),body=$('#accountBody');let current=null,mode='signin',busy=false,client=null,subscription=null,previousFocus=null;
 function setUser(user){current=user||null;$('#accountLabel').textContent=current?'Миний эрх':'Нэвтрэх';$('#accountButton').classList.toggle('signed-in',!!current);onUser(current);if(dialog.open)render()}
 function close(){dialog.close();previousFocus?.focus()}
 function render(){
  if(current){
   const identity=current.phone?('+'+current.phone.replace(/^\+/,'')):current.email||'Хэрэглэгч';
   body.innerHTML=`<div class="account-heading"><div class="account-avatar" aria-hidden="true">✓</div><h2 id="accountTitle">Миний бүртгэл</h2><p>${esc(identity)}</p></div><div class="account-summary"><span>Бүртгэл</span><strong>Нэвтэрсэн</strong></div><p class="small">Өгүүллэг унших, аудио сонсох эрх нь тусдаа идэвхжинэ.</p><p class="auth-message hidden" id="authMessage" role="alert"></p><button class="btn outline btn-block" id="memberSignOut">Бүртгэлээс гарах</button>`;
   $('#memberSignOut').addEventListener('click',async()=>{if(busy)return;busy=true;const button=$('#memberSignOut');button.disabled=true;try{const {error}=await client.auth.signOut();if(error)throw error;setUser(null);close()}catch(error){const box=$('#authMessage');if(box){box.textContent=authMessage(error);box.classList.remove('hidden')}}finally{busy=false;if(button.isConnected)button.disabled=false}});return;
  }
  const signup=mode==='signup';
  body.innerHTML=`<div class="account-heading"><div class="caps">ТАНЫ ТҮҮХ ЭНДЭЭС ЭХЭЛНЭ</div><h2 id="accountTitle">${signup?'Бүртгэл үүсгэх':'Тавтай морил.'}</h2><p>${signup?'Дугаар болон нууц үгээ оруулаад эхлээрэй.':'Дуртай түүхүүд рүүгээ буцаад ороорой.'}</p></div><div class="auth-tabs" aria-label="Бүртгэлийн сонголт"><button type="button" data-auth-mode="signin" aria-pressed="${!signup}">Нэвтрэх</button><button type="button" data-auth-mode="signup" aria-pressed="${signup}">Бүртгүүлэх</button></div><form id="memberForm"><div class="field"><label for="memberPhone">Утасны дугаар</label><input id="memberPhone" name="phone" type="tel" inputmode="tel" autocomplete="username" placeholder="9911 2233" required maxlength="24" aria-describedby="phoneHint"><small id="phoneHint">Монгол дугаарт +976 автоматаар нэмэгдэнэ.</small></div><div class="field"><label for="memberPassword">Нууц үг</label><div class="password-field"><input id="memberPassword" name="password" type="password" autocomplete="${signup?'new-password':'current-password'}" ${signup?'minlength="8"':''} maxlength="128" required ${signup?'aria-describedby="passwordHint"':''}><button type="button" class="password-toggle" aria-label="Нууц үг харуулах" aria-pressed="false">Харах</button></div>${signup?'<small id="passwordHint">8-аас доошгүй тэмдэгт.</small>':''}</div>${signup?'<div class="field"><label for="memberConfirm">Нууц үг давтах</label><input id="memberConfirm" name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>':''}<p class="auth-message hidden" id="authMessage" role="alert"></p><button class="btn primary btn-block" id="memberSubmit" type="submit" ${authConfigured?'':'disabled'}>${signup?'Бүртгэл үүсгэх':'Нэвтрэх'} <span aria-hidden="true">↗</span></button><p class="auth-caption">SMS код шаардахгүй.</p>${authConfigured?'':'<p class="auth-message">Бүртгэлийн үйлчилгээ холбогдоогүй байна.</p>'}</form>`;
  $$local('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>{if(busy)return;const phone=$('#memberPhone').value;mode=button.dataset.authMode;render();$('#memberPhone').value=phone;$('#memberPhone').focus()}));
  body.querySelector('.password-toggle').addEventListener('click',event=>{const field=$('#memberPassword'),show=field.type==='password';field.type=show?'text':'password';event.currentTarget.textContent=show?'Нуух':'Харах';event.currentTarget.setAttribute('aria-pressed',String(show));event.currentTarget.setAttribute('aria-label',show?'Нууц үг нуух':'Нууц үг харуулах')});
  $('#memberForm').addEventListener('submit',async event=>{
   event.preventDefault();if(busy)return;const form=event.currentTarget,notice=form.querySelector('#authMessage'),submit=form.querySelector('#memberSubmit');notice.classList.add('hidden');
   let phone,password;try{phone=normalizePhone(form.elements.phone.value);password=form.elements.password.value;if(signup&&password!==form.elements.confirm.value)throw Error('Давтсан нууц үг таарахгүй байна.')}catch(error){notice.textContent=error.message;notice.classList.remove('hidden');return}
   busy=true;submit.disabled=true;submit.textContent=signup?'Бүртгэл үүсгэж байна…':'Нэвтэрч байна…';$$local('[data-auth-mode]').forEach(b=>b.disabled=true);
   try{
    client=await supa();if(!client)throw Error('Not configured');
    if(signup)await assertPasswordSignupReady();
    const {data,error}=signup?await client.auth.signUp({phone,password}):await client.auth.signInWithPassword({phone,password});
    if(error)throw error;
    // A user record without a session is not a completed sign-in.
    if(!data.session){notice.textContent='Бүртгэл шууд нэвтэрсэнгүй. Сайтын админтай холбогдоно уу.';notice.classList.remove('hidden');return}
    form.reset();setUser(data.session.user);close();
   }catch(error){if(notice.isConnected){notice.textContent=authMessage(error);notice.classList.remove('hidden')}}
   finally{password=null;busy=false;if(submit.isConnected){submit.disabled=false;submit.textContent=signup?'Бүртгэл үүсгэх ↗':'Нэвтрэх ↗';$$local('[data-auth-mode]').forEach(b=>b.disabled=false)}}
  });
 }
 function $$local(selector){return [...body.querySelectorAll(selector)]}
 function open(){previousFocus=document.activeElement;render();dialog.showModal();const input=$('#memberPhone');if(input)input.focus()}
 $('#accountButton').addEventListener('click',open);$('#accountClose').addEventListener('click',close);dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close()}});
 dialog.addEventListener('close',()=>{body.querySelectorAll('input[type=password],input[name=password]').forEach(input=>input.value='')});
 async function init(){if(!authConfigured)return;try{client=await supa();const {data,error}=await client.auth.getSession();if(error)throw error;setUser(data.session?.user);const {data:observer}=client.auth.onAuthStateChange((_event,session)=>setUser(session?.user));subscription=observer.subscription}catch{ /* The public catalogue remains usable when Auth is unavailable. */ }}
 return {init,open,get user(){return current},destroy(){subscription?.unsubscribe()}};
}
