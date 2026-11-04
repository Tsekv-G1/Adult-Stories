'use strict';
const crypto=require('node:crypto'),scrypt=require('node:util').promisify(crypto.scrypt);
class ApiError extends Error{constructor(status,code){super(code);this.status=status}}
const fail=(s,c)=>{throw new ApiError(s,c)},hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const header=(e,n)=>String(Object.entries(e.headers||{}).find(([k])=>k.toLowerCase()===n.toLowerCase())?.[1]||'');
const config=n=>{if(!process.env[n])fail(503,'service_not_configured');return process.env[n]};
const origin=()=>new URL(config('APP_ORIGIN')).origin;
function body(e){if(Buffer.byteLength(e.body||'')>16384)fail(413,'request_too_large');try{const b=JSON.parse(e.body||'{}');if(!b||Array.isArray(b)||typeof b!=='object')throw Error();return b}catch{fail(400,'invalid_request')}}
const reply=(statusCode,data,extra={})=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra},body:JSON.stringify(data)});
const endpoint=(methods,fn,{admin=false}={})=>async e=>{try{if(!methods.includes(e.httpMethod))return reply(405,{ok:false,error:'method_not_allowed'},{Allow:methods.join(', ')});if(e.httpMethod!=='GET'&&!admin&&header(e,'origin')!==origin())fail(403,'invalid_origin');return await fn(e)}catch(error){return reply(error.status||503,{ok:false,error:error instanceof ApiError?error.message:'service_unavailable'})}};
async function db(path,{method='GET',data,prefer}={}){let r;const key=config('SUPABASE_SERVICE_ROLE_KEY');try{r=await fetch(config('SUPABASE_URL').replace(/\/$/,'')+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(12000)})}catch{fail(503,'database_unavailable')}let v;try{const raw=await r.text();v=raw?JSON.parse(raw):null}catch{fail(503,'database_unavailable')}if(!r.ok){const codes={login_required:401,invalid_reset:400,order_not_pending:409,receipt_already_used:409,invalid_order:400,story_unavailable:404,account_inactive:403,rate_limited:429,receipt_required:400,invalid_bank_reference:400,first_purchase_offer_used:409,verification_note_required:400};if(codes[v?.message])fail(codes[v.message],v.message);if(v?.code==='23505')fail(409,'already_exists');fail(503,'database_unavailable')}return v}
const rpc=(n,data)=>db('rpc/'+n,{method:'POST',data});
function phone(raw){let p=String(raw||'').trim();if(!/^[+\d\s().-]+$/.test(p))fail(400,'invalid_phone');p=p.replace(/[\s().-]/g,'');if(/^\d{8}$/.test(p))p='+976'+p;else if(/^976\d{8}$/.test(p))p='+'+p;if(!/^\+[1-9]\d{7,14}$/.test(p))fail(400,'invalid_phone');return p}
function password(p){if(typeof p!=='string'||p.length<8||Buffer.byteLength(p)>512)fail(400,'weak_password');return p}
async function passwordHash(p){password(p);const salt=crypto.randomBytes(16).toString('hex'),digest=await scrypt(p,salt,64);return`scrypt$${salt}$${digest.toString('hex')}`}
async function matches(raw,stored){const [alg,salt,digest]=String(stored||'').split('$'),valid=alg==='scrypt'&&/^[a-f0-9]{32}$/.test(salt)&&/^[a-f0-9]{128}$/.test(digest),p=typeof raw==='string'&&Buffer.byteLength(raw)<=512?raw:'';const actual=await scrypt(p,valid?salt:'0'.repeat(32),64);return valid&&crypto.timingSafeEqual(actual,Buffer.from(digest,'hex'))}
const uuid=v=>{if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v||''))fail(400,'invalid_id');return v};
const cookie=(token,seconds=2592000)=>`adult_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${origin().startsWith('https:')?'; Secure':''}`;
function sessionToken(e){const v=header(e,'cookie').split(';').map(s=>s.trim()).find(s=>s.startsWith('adult_session='))?.slice(14)||'';return /^[a-f0-9]{64}$/.test(v)?v:''}
async function newSession(id,expectedHash){const token=crypto.randomBytes(32).toString('hex');await rpc('adult_new_session',{p_member:id,p_expected_hash:expectedHash,p_token_hash:hash(token),p_expiry:new Date(Date.now()+2592000000).toISOString()});return cookie(token)}
async function auth(e){const token=sessionToken(e);if(!token)fail(401,'login_required');const rows=await db('adult_sessions?token_hash=eq.'+hash(token)+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=member_id,adult_members(id,phone,name,status)&limit=1'),u=rows?.[0]?.adult_members;if(!u||u.status!=='active')fail(401,'login_required');return u}
async function rate(e,bucket,limit=20,seconds=900,subject=''){let ip=header(e,'x-nf-client-connection-ip');if(!ip&&/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin()))ip='local';if(!ip)fail(503,'client_address_unavailable');const key=crypto.createHmac('sha256',config('SUPABASE_SERVICE_ROLE_KEY')).update(bucket+':'+(subject||ip)).digest('hex');if(!await rpc('adult_take_rate',{p_key:key,p_limit:limit,p_seconds:seconds}))fail(429,'rate_limited')}
async function admin(e){
 const token=header(e,'authorization').replace(/^Bearer\s+/i,''),key=process.env.ADULT_ADMIN_KEY||'';
 if(key.length>=32&&token&&crypto.timingSafeEqual(Buffer.from(hash(token)),Buffer.from(hash(key))))return 'hub';
 if(!token)fail(401,'unauthorized');
 // Check configuration outside the network catch. Otherwise a missing env var is
 // misleadingly turned into auth_unavailable and is impossible to diagnose.
 const base=config('SUPABASE_URL').trim().replace(/\/+$/,''),apiKey=config('SUPABASE_SERVICE_ROLE_KEY').trim();
 if(!base||!apiKey)fail(503,'service_not_configured');
 let authUrl;
 try{
  const u=new URL(base);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('invalid_supabase_url');
  authUrl=u.origin+'/auth/v1/user';
 }catch{
  console.error('adult_admin_auth_config_invalid');
  fail(503,'service_not_configured');
 }
 let r;
 try{
  r=await fetch(authUrl,{headers:{apikey:apiKey,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
 }catch(error){
  // Do not log URLs, credentials, tokens or the raw exception message.
  console.error('adult_admin_auth_fetch_failed',{
   error_type:String(error?.name||'Error').slice(0,64),
   network_code:String(error?.cause?.code||error?.code||'UNKNOWN').slice(0,64)
  });
  fail(503,'auth_unavailable');
 }
 if(!r.ok)fail(401,'unauthorized');
 const u=await r.json();if(!u?.id)fail(401,'unauthorized');
 if(!(await db('admin_users?user_id=eq.'+uuid(u.id)+'&select=user_id&limit=1'))?.length)fail(403,'admin_required');
 return u.id;
}
// Never silently direct payments to hard-coded default bank details.
const payment=()=>({bank:(process.env.PAYMENT_BANK||'').trim(),account:(process.env.PAYMENT_ACCOUNT||'').trim(),name:(process.env.PAYMENT_ACCOUNT_NAME||'').trim(),iban:(process.env.PAYMENT_IBAN||'').trim(),support:(process.env.SUPPORT_CONTACT||'').trim()});
async function access(member,id){const rows=await db('adult_entitlements?member_id=eq.'+uuid(member)+'&revoked_at=is.null&or=(expires_at.is.null,expires_at.gt.'+encodeURIComponent(new Date().toISOString())+')&select=story_id');return rows?.some(r=>!r.story_id||r.story_id===id)||false}
module.exports={ApiError,fail,header,config,origin,body,reply,endpoint,db,rpc,phone,password,passwordHash,matches,uuid,cookie,sessionToken,newSession,auth,rate,admin,payment,access,hash};
