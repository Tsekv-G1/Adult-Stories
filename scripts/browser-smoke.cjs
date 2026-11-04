'use strict';
// Read-only, deterministic browser checks. All backend traffic is mocked.
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../public');
const row={id:'123e4567-e89b-12d3-a456-426614174000',title:'Шалгах өгүүллэг',slug:'qa-story',status:'published',category:'Нууцлаг',excerpt:'Тестийн танилцуулга',preview_text:'Үнэгүй эхлэл.',overlay:{},price:9900,sort_order:1,read_minutes:8,tags:[]};
const server=http.createServer(async(req,res)=>{
 try{
  let name=new URL(req.url,'http://localhost').pathname;
  if(name==='/admin/'){res.writeHead(301,{Location:'/admin'});res.end();return}
  if(name==='/')name='/index.html';if(name==='/admin')name='/admin.html';
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('invalid_path');
  const bytes=await readFile(file),type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff':'font/woff'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found')}
});
let browser,checks=0;
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...((process.env.PLAYWRIGHT_CHANNEL||process.argv.includes('--chrome'))?{channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'}:{})});
 async function setup(options={}){
  const context=await browser.newContext({viewport:options.mobile?{width:390,height:844}:{width:1440,height:900}});
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>requests.push(r.url()));
  await page.route('**/*.supabase.co/**',route=>{
   const url=new URL(route.request().url());
   if(options.broken&&url.pathname.startsWith('/rest/'))return route.fulfill({status:503,json:{message:'test_unavailable'}});
   if(url.pathname.includes('/auth/'))return route.fulfill({status:400,json:{error:'invalid_grant',error_description:'Invalid login credentials'}});
   return route.fulfill({json:url.pathname.endsWith('/stories')?(options.rows||[row]):url.pathname.endsWith('/site_settings')&&options.site?[{id:'main',content:options.site}]:[]});
  });
  await page.route('**/api/member**',route=>{
   const request=route.request(),action=new URL(request.url()).searchParams.get('action')||(request.postData()?request.postDataJSON().action:null);
   if(action==='logout')options.user=null;
   if(action==='body'&&options.bodyHandler)return options.bodyHandler(route);
   return route.fulfill({status:200,json:{ok:true,user:options.user||null,metrics:[],rows:[],entitlements:[],orders:[]}});
  });
  await context.addInitScript(()=>localStorage.setItem('adult_v5_age','yes'));
  return {page,context,errors,requests};
 }
 // Deleting the former missing source modules and blocking external JS CDNs
 // must not affect the bundled deployment.
 for(const mobile of [false,true]){
  const {page,context,errors,requests}=await setup({mobile});
  await page.route(/(?:audio-preview-state|preview-completion|core)\.js|https:\/\/(?:esm\.sh|cdn\.jsdelivr\.net)/,route=>route.abort());
  await page.goto(base+'/');await page.waitForFunction(()=>document.querySelector('#storyGrid').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('.story-card').count(),1);
  assert.equal(await page.locator('#catalogStatus').isHidden(),true);
  await page.locator('#readFeatured').click();await page.locator('#readerTitle').waitFor({state:'visible'});
  assert.equal(await page.locator('#readerTitle').innerText(),row.title);
  assert.equal(await page.locator('#paywall').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(errors,[]);
  assert.equal(requests.some(url=>url.includes('esm.sh')||url.includes('cdn.jsdelivr.net')),false);
  checks++;await context.close();
 }
 {
  const {page,context,errors}=await setup();
  await page.goto(base+'/admin/');await page.locator('#loginWrap:not(.hidden)').waitFor();
  assert.equal(await page.locator('#adminBootLoading').isHidden(),true);
  await page.locator('#loginEmail').fill('qa@example.com');await page.locator('#loginPassword').fill('invalid-test-password');
  await page.locator('#loginBtn').click();await page.locator('#loginError:not(.hidden)').waitFor();
  assert.equal(await page.locator('#loginBtn').isEnabled(),true);assert.deepEqual(errors,[]);
  checks++;await context.close();
 }
 {
  const options={broken:true};const {page,context,errors}=await setup(options);
  await page.goto(base+'/');await page.locator('#catalogStatus').waitFor({state:'visible'});
  assert.equal(await page.locator('#storyGrid').getAttribute('aria-busy'),'false');
  await page.locator('#retryContent').click();await page.waitForFunction(()=>!document.querySelector('#retryContent').disabled);
  assert.equal(await page.locator('#catalogStatus').isVisible(),true);
  options.broken=false;await page.locator('#retryContent').click();await page.locator('#catalogStatus').waitFor({state:'hidden'});
  assert.equal(await page.locator('.story-card').count(),1);assert.deepEqual(errors,[]);
  checks++;await context.close();
 }
 for(const entry of ['admin','app']){
  const {page,context}=await setup();await page.route('**/dist/**',route=>route.fulfill({status:404,body:'Missing bundle'}));
  await page.goto(base+(entry==='admin'?'/admin':'/'));
  const target=entry==='admin'?page.locator('#openHelp'):page.locator('#storyGrid .empty');
  await target.waitFor({state:'visible'});assert.equal(await target.getByRole('button',{name:'Дахин ачаалах ↻'}).isVisible(),true);
  if(entry==='admin')assert.equal(await page.locator('#adminBootLoading').isHidden(),true);
  checks++;await context.close();
 }
 {
  const {page,context,errors}=await setup();await page.goto(base+'/admin?local=1');await page.locator('#appRoot:not(.hidden)').waitFor();
  await page.locator('[data-tab="stories"]').click();assert.equal(await page.locator('#storyTitle').isVisible(),true);
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const options={broken:true};const {page,context,errors}=await setup(options),hash='#story-'+row.id;
  await page.goto(base+'/'+hash);await page.locator('#catalogStatus').waitFor({state:'visible'});
  assert.equal(new URL(page.url()).hash,hash);
  options.broken=false;await page.locator('#retryContent').click();await page.locator('#readerTitle').waitFor({state:'visible'});
  assert.equal(await page.locator('#readerTitle').innerText(),row.title);assert.equal(new URL(page.url()).hash,hash);
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const draft={...row,id:'223e4567-e89b-12d3-a456-426614174000',title:'Private draft',status:'draft'},future={...row,id:'323e4567-e89b-12d3-a456-426614174000',publish_at:'2999-01-01T00:00:00Z'};
  const {page,context,errors}=await setup({rows:[row,draft,future],site:{featured_story_id:draft.id}});
  await page.goto(base+'/');await page.waitForFunction(()=>document.querySelector('#storyGrid').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('.story-card').count(),1);assert.equal(await page.locator('#heroTitle').innerText(),row.title);
  await page.evaluate(id=>location.hash='#story-'+id,draft.id);await page.waitForFunction(()=>location.hash==='#home');
  assert.equal(await page.locator('#readerView').isHidden(),true);assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const second={...row,id:'423e4567-e89b-12d3-a456-426614174000',title:'Дараагийн өгүүллэг',preview_text:'Хоёр дахь үнэгүй эхлэл.'};
  let release,bodyFail=true;
  const options={rows:[row,second],user:{id:'523e4567-e89b-12d3-a456-426614174000',name:'QA',phone:'+97699112233'},bodyHandler:async route=>{
   const id=new URL(route.request().url()).searchParams.get('id');
   if(id===second.id&&bodyFail){await new Promise(resolve=>release=resolve);return route.fulfill({status:503,json:{ok:false,error:'database_unavailable'}})}
   return route.fulfill({json:{ok:true,body:{full_text:id===row.id?'PRIVATE-FIRST':'PRIVATE-SECOND',full_audio_url:''}}});
  }};
  const {page,context,errors}=await setup(options);await page.goto(base+'/#story-'+row.id);
  await page.waitForFunction(()=>document.querySelector('#readerText').textContent.includes('PRIVATE-FIRST'));
  await page.evaluate(id=>location.hash='#story-'+id,second.id);await page.waitForFunction(()=>document.querySelector('#readerTitle').textContent==='Дараагийн өгүүллэг');
  assert.equal((await page.locator('#readerText').innerText()).includes('PRIVATE-FIRST'),false);
  assert.equal((await page.locator('#readerText').innerText()).includes(second.preview_text),true);
  while(!release)await new Promise(resolve=>setTimeout(resolve,10));release();
  await page.locator('#readerRetry').waitFor({state:'visible'});assert.equal(await page.locator('#paywall').isHidden(),true);
  bodyFail=false;await page.locator('#readerRetry').click();await page.waitForFunction(()=>document.querySelector('#readerText').textContent.includes('PRIVATE-SECOND'));
  assert.equal(await page.locator('#readerStatus').isHidden(),true);
  await page.locator('#accountButton').click();await page.locator('#memberSignOut').click();await page.waitForFunction(()=>document.querySelector('#accountLabel').textContent==='Нэвтрэх');
  assert.equal((await page.locator('#readerText').innerText()).includes('PRIVATE-SECOND'),false);
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const {page,context,errors}=await setup();await page.goto(base+'/');await page.waitForFunction(()=>document.querySelector('#storyGrid').getAttribute('aria-busy')==='false');
  await context.setOffline(true);await page.locator('#connectionNotice').waitFor({state:'visible'});
  await context.setOffline(false);await page.locator('#connectionNotice').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const {page,context,errors}=await setup();await page.goto(base+'/');await page.locator('#accountButton').click();
  await page.locator('#memberPhone').fill('99112233');await page.locator('#memberPassword').fill('invalid-test-password');await page.locator('#memberSubmit').click();
  await page.locator('#authMessage:not(.hidden)').waitFor();assert.equal(await page.locator('#accountDialog').isVisible(),true);
  assert.equal(await page.locator('#accountLabel').innerText(),'Нэвтрэх');assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const other={...row,id:'623e4567-e89b-12d3-a456-426614174000',title:'Өөр түүх',read_minutes:15};
  const {page,context,errors}=await setup({rows:[row,other]});
  await context.addInitScript(()=>localStorage.setItem('adult_reader_size','broken'));
  const query='?q='+encodeURIComponent('  ШАЛГАХ   ӨГҮҮЛЛЭГ  ')+'&sort=newest&short=1';
  await page.goto(base+'/'+query);await page.waitForFunction(()=>document.querySelector('#storyGrid').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('.story-card').count(),1);await page.reload();await page.waitForFunction(()=>document.querySelector('#storyGrid').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#storySort').inputValue(),'newest');assert.equal(await page.locator('.story-card').count(),1);
  await page.locator('#resetFilters').click();assert.equal(await page.locator('.story-card').count(),2);assert.equal(new URL(page.url()).searchParams.has('q'),false);
  await page.locator('.story-cover[data-story="'+row.id+'"]').click();assert.equal(await page.locator('#readerSizeValue').innerText(),'18');
  assert.equal(await page.locator('#readerShare, #readerShareFallback').count(),0);
  for(let i=0;i<6;i++)await page.locator('#readerLarger').click();assert.equal(await page.locator('#readerLarger').isDisabled(),true);assert.equal(await page.locator('#readerSizeValue').innerText(),'24');
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const {page,context,errors}=await setup({mobile:true});await page.goto(base+'/');await page.waitForFunction(()=>document.querySelector('#storyGrid').getAttribute('aria-busy')==='false');
  const save=page.locator('[data-save="'+row.id+'"]');await save.click();assert.equal(await save.getAttribute('aria-pressed'),'true');
  await page.locator('#feedbackUndo').click();assert.equal(await save.getAttribute('aria-pressed'),'false');
  await save.click();if(!await page.locator('#savedLink').isVisible())await page.locator('#menuToggle').click();await page.locator('#savedLink').click();await page.locator('#librarySearch').fill('байхгүй');
  assert.equal(await page.locator('#libraryResults .saved-library-row').count(),0);await page.locator('#librarySearch').fill('');
  await page.locator('[data-library-remove]').click();assert.equal(await page.locator('#libraryResults .saved-library-row').count(),0);
  assert.equal(await page.locator('#libraryUndo').isVisible(),true);await page.keyboard.press('Enter');assert.equal(await page.locator('#libraryResults .saved-library-row').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.locator('#modalClose').click();await page.reload();await page.waitForFunction(()=>document.querySelector('#storyGrid').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('[data-save="'+row.id+'"]').getAttribute('aria-pressed'),'true');assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const other={...row,id:'323e4567-e89b-12d3-a456-426614174000',sort_order:0};
  const {page,context,errors}=await setup({rows:[row,other]});
  await page.route('**/api/member?*action=stats*',r=>r.fulfill({json:{ok:true,metrics:[{story_id:row.id,reads_30d:99,listens_30d:0}]}}));
  await page.goto(base+'/');
  const first=page.locator('.story-cover').first();
  await first.waitFor();assert.equal(await first.getAttribute('data-story'),other.id);
  await page.locator('#storySort').selectOption('popular');
  await page.waitForFunction(id=>document.querySelector('.story-cover')?.dataset.story===id,row.id);
  await page.locator('#resetFilters').click();assert.equal(await first.getAttribute('data-story'),other.id);
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const {page,context,errors}=await setup();
  const origin='https://pub-7f988d691c09402594e0ee4ed4ff617e.r2.dev',shared=origin+'/intro.mp3';
  await context.addInitScript(()=>{
   if(!localStorage.getItem('adult_cms_v5_content')){
    const stories=['Анхны өгүүллэг','Дараагийн өгүүллэг'].map((title,i)=>({id:'sample-'+i,title,cover_id:'cover',category:'Нууцлаг',status:'published',sort_order:i+1,overlay:{},audio_preview_url:i?'':'https://media.example.com/original.mp3'}));
    localStorage.setItem('adult_cms_v5_content',JSON.stringify({stories,bodies:[],assets:[{id:'cover',url:location.origin+'/assets/hero-default.svg',filename:'Cover'}],site:{categories:['Нууцлаг']}}));
   }
   const session={access_token:'test-session',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'test'}};
   localStorage.setItem('sb-dgkyuijpviidrmqenclb-auth-token',JSON.stringify(session));
  });
  const actions=[];
  await context.route(origin+'/**',r=>r.fulfill({status:200,contentType:'audio/mpeg',body:''}));
  await page.route('**/api/adult-admin',r=>{
   const b=r.request().postDataJSON();actions.push(b.action);
   const audio={key:'intro.mp3',filename:'intro.mp3',bytes:1024,reference:shared};
   return r.fulfill({json:{ok:true,items:b.cursor?[audio]:[],next_cursor:b.cursor?null:'more'}});
  });
  await page.goto(base+'/admin?local=1');await page.locator('[data-tab="stories"]').click();
  await page.locator('[data-story-view="cards"]').click();
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:840});
   const card=page.locator('.cards-view .story-row').first();await card.waitFor();
   const size=await card.locator('.story-list-copy').boundingBox();assert.ok(size.width>=100);assert.ok(await card.locator('.story-list-cover').isVisible());
   assert.ok(await card.locator('[data-direction="down"]').isVisible());
  }
  await page.locator('#tabAudio').click();
  for(const [kind,input] of [['preview','storyAudioPreview'],['cta','storyCtaAudio']]){
   await page.locator('[data-r2-kind="'+kind+'"]').click();
   await page.locator('#r2AudioMore').click();await page.locator('#r2AudioList button').first().click();
   assert.equal(await page.locator('#'+input).inputValue(),shared);
   await page.locator('[data-share-audio="'+kind+'"]').click();await page.locator('[data-unshare-audio="'+kind+'"]').waitFor();
  }
  assert.deepEqual(actions.filter(a=>a==='preview-list'),Array(4).fill('preview-list'));
  assert.equal(await page.locator('#storyAudioFull').inputValue(),'');
  const home=await context.newPage();
  await home.goto(base+'/?local=1');
  await home.locator('.story-card [data-audio]').first().waitFor();
  assert.equal(await home.locator('.story-card [data-audio]').count(),await home.locator('.story-card').count());
  const audioRequest=home.waitForRequest(shared);await home.locator('.story-card [data-audio]').first().click();await audioRequest;
  await page.locator('[data-unshare-audio="preview"]').click();
  await page.locator('[data-unshare-audio="preview"]').waitFor({state:'hidden'});
  await home.reload();await home.locator('.story-card').first().waitFor();
  assert.equal(await home.locator('.story-card [data-audio]').count(),1);
  assert.equal(await home.locator('.story-card [data-audio]').getAttribute('data-audio'),'sample-0');
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const {page,context,errors}=await setup({mobile:true});
  await page.goto(base+'/admin?local=1');await page.locator('[data-tab="stories"]').click();
  await page.locator('#saveStory').click();await page.locator('#storyFormIssue').waitFor();
  assert.ok(await page.locator('#storyTitle').evaluate(el=>el===document.activeElement));
  await page.locator('#storyTitle').fill('Шинэ тест');await page.locator('#storyExcerpt').fill('Товч мэдээлэл');
  await page.locator('[data-write="storyPreview"]').click();await page.locator('#writingDialog #storyPreview').fill('Эхний хоёр үг.');
  assert.equal(await page.locator('#writingCount').innerText(),'3 үг');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#paneContent #storyPreview').inputValue(),'Эхний хоёр үг.');
  await page.locator('[data-write="storyFull"]').click();await page.locator('#writingDialog #storyFull').fill('Зөвхөн уншигчийн үргэлжлэл.');
  await page.keyboard.press('Control+s');await page.locator('.list-button.active').filter({hasText:'Шинэ тест'}).waitFor();
  assert.equal(await page.locator('#paneContent #storyFull').inputValue(),'Зөвхөн уншигчийн үргэлжлэл.');
  await page.locator('#storyListSearch').fill('  ШИНЭ   ТЕСТ  ');assert.equal(await page.locator('.story-row').count(),1);
  await page.locator('#storyListStatus').selectOption('published');assert.equal(await page.locator('.story-row').count(),0);
  await page.locator('#clearStoryFilters').click();assert.ok(await page.locator('.story-row').count()>1);
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const {page,context,errors}=await setup();
  await context.addInitScript(()=>localStorage.setItem('sb-dgkyuijpviidrmqenclb-auth-token',JSON.stringify({access_token:'test-session',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'test'}})));
  const saved=[];let failList=false,failBody=true;
  await page.route('**/*.supabase.co/rest/v1/**',async r=>{
   const name=new URL(r.request().url()).pathname.split('/').pop();
   if(name==='is_admin')return r.fulfill({json:true});
   if(name==='adult_save_story'){
    const payload=r.request().postDataJSON().p_story;saved.push(payload);
    failList=saved.length===1;
    return r.fulfill({json:{...payload,id:row.id,updated_at:'2026-01-01T00:00:00Z'}});
   }
   if(name==='story_private')return failBody?r.fulfill({status:503,json:{message:'offline'}}):r.fulfill({json:[{story_id:row.id,full_text:'Сэргэсэн текст'}]});
   if(name==='stories'&&failList)return r.fulfill({status:403,json:{message:'refresh failed'}});
   return r.fulfill({json:name==='stories'?[{...row,series_title:'Нууц цуврал',tags:['зуны аялал']}]:[]});
  });
  await page.route('**/api/adult-admin',r=>r.fulfill({json:{ok:true,orders:[],members:[],recoveries:[],report:{}}}));
  await page.goto(base+'/admin');await page.locator('[data-tab="stories"]').click();
  await page.locator('#storyListSearch').fill('  ЗУНЫ    АЯЛАЛ  ');await page.locator('.list-button').first().click();
  await page.locator('#bodyLoadIssue').waitFor();await page.locator('#storyTitle').fill('Өөрчилсөн гарчиг');
  failBody=false;await page.locator('#retryStoryBody').click();await page.locator('#bodyLoadIssue').waitFor({state:'hidden'});
  assert.equal(await page.locator('#storyTitle').inputValue(),'Өөрчилсөн гарчиг');assert.equal(await page.locator('#storyFull').inputValue(),'Сэргэсэн текст');
  page.once('dialog',d=>d.accept());await page.locator('#newStory').click();
  await page.locator('#storyTitle').fill('Шинэ гарчиг');await page.locator('#storyExcerpt').fill('Товч');await page.locator('#storyPreview').fill('Эхлэл');
  await page.locator('#saveStory').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Жагсаалтыг шинэчлэх'));
  await page.locator('#saveStory').click();await page.waitForFunction(()=>!document.querySelector('#appRoot').inert);
  assert.equal(saved.length,2);assert.ok(!saved[0].id);assert.equal(saved[1].id,row.id);
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const {page,context,errors}=await setup();
  const rows=['Эхний','Хоёр дахь','Гурав дахь'].map((title,i)=>({...row,id:'queue-'+i,title,sort_order:i,excerpt:'',cover_id:i===2?'cover':null,
   updated_at:'2026-01-0'+(i+1)+'T12:00:00Z',tags:i<2?['цуврал']:[]}));
  await context.addInitScript(stories=>{
   if(!localStorage.getItem('adult_cms_v5_content'))localStorage.setItem('adult_cms_v5_content',JSON.stringify({
    stories,site:{categories:['Нууцлаг'],shared_preview_url:'https://media.example.com/global.mp3'},
    assets:[{id:'cover',url:location.origin+'/assets/hero-default.svg',filename:'Cover'}],bodies:[]
   }));
  },rows);
  await page.goto(base+'/admin?local=1');
  const recent=page.locator('#recentStories button').first();
  assert.equal(await recent.getAttribute('data-recent-id'),'queue-2');
  await recent.click();await page.waitForFunction(()=>document.querySelector('#storyTitle').value==='Гурав дахь');
  await page.locator('#workFilter').selectOption('audio');assert.equal(await page.locator('.story-row').count(),0);
  await page.locator('#workFilter').selectOption('cover');assert.equal(await page.locator('.story-row').count(),2);
  await page.locator('#workFilter').selectOption('text');
  await page.locator('#storyListSearch').fill('цуврал');await page.locator('#storyListSearch').press('Enter');
  await page.waitForFunction(()=>document.activeElement.id==='storyTitle');
  await page.locator('#storyTitle').fill('');
  await page.locator('#queueNext').click();await page.locator('#storyFormIssue').waitFor();
  assert.equal(await page.locator('#storyTitle').inputValue(),'');
  assert.equal(await page.locator('.list-button.active').getAttribute('data-edit'),'queue-0');
  await page.locator('#storyTitle').fill('Зассан');await page.locator('#storyExcerpt').fill('Товч танилцуулга');
  await page.locator('#storyExcerpt').press('Control+Enter');
  await page.waitForFunction(()=>document.querySelector('#storyTitle').value==='Хоёр дахь'&&!document.querySelector('#appRoot').inert);
  assert.equal(await page.locator('.story-row').count(),1);assert.ok(await page.locator('#queueNext').isDisabled());
  const firstSaved=await page.evaluate(()=>JSON.parse(localStorage.getItem('adult_cms_v5_content')).stories.find(s=>s.id==='queue-0'));
  assert.equal(firstSaved.title,'Зассан');assert.equal(firstSaved.excerpt,'Товч танилцуулга');
  await page.locator('#storyExcerpt').fill('Дараагийн танилцуулга');await page.locator('#queueNext').click();
  await page.waitForFunction(()=>!document.querySelector('#appRoot').inert&&document.querySelectorAll('.story-row').length===0);
  await page.locator('#clearStoryFilters').click();assert.equal(await page.locator('.story-row').count(),3);
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 {
  const {page,context,errors}=await setup({mobile:true});
  await page.goto(base+'/admin?local=1');await page.locator('[data-tab="stories"]').click();
  assert.ok(await page.locator('[data-copy-field="storyFull"]').isDisabled());
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.qaClipboard=text}}}));
  const fields={storyTitle:'Засаж буй гарчиг',storyExcerpt:'  Товч танилцуулга  ',storyPreview:'Үнэгүй эхлэл\n\nДараагийн мөр',storyFull:'Хувийн үргэлжлэл'};
  for(const [id,value] of Object.entries(fields)){
   await page.locator('#'+id).fill(value);await page.locator('[data-copy-field="'+id+'"]').click();
   assert.equal(await page.evaluate(()=>window.qaClipboard),value);
  }
  await page.locator('[data-write="storyFull"]').click();await page.locator('#writingDialog #storyFull').fill('Том цонхны текст');
  await page.locator('#copyWriting').click();assert.equal(await page.evaluate(()=>window.qaClipboard),'Том цонхны текст');
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied')};document.execCommand=()=>false});
  await page.locator('#copyWriting').click();
  assert.equal(await page.locator('#storyFull').evaluate(f=>f.value.slice(f.selectionStart,f.selectionEnd)),'Том цонхны текст');
  assert.ok((await page.locator('#writingCopyStatus').innerText()).includes('Ctrl+C'));
  await page.keyboard.press('Escape');assert.equal(await page.locator('#paneContent #storyFull').inputValue(),'Том цонхны текст');
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 console.log(`Browser checks passed: ${checks} (catalog, reader, admin, retry, missing bundles, direct links, publication, logout, offline recovery, invalid login, discovery and saved-library actions).`);
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve))});
