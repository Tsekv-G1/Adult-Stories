'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,existsSync,readdirSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=f=>readFileSync(path.join(root,f),'utf8');

test('all public module graph references exist in a complete deploy',()=>{
 const publicPath=path.join(root,'public');
 function scan(dir){
  for(const item of readdirSync(dir,{withFileTypes:true})){
   const absolute=path.join(dir,item.name);
   if(item.isDirectory()){scan(absolute);continue}
   if(!item.name.endsWith('.js'))continue;
   const content=readFileSync(absolute,'utf8');
   for(const [,spec] of content.matchAll(/(?:\bfrom\s*|\bimport\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g)){
    const target=path.resolve(path.dirname(absolute),spec.split('?')[0]);
    assert.ok(target.startsWith(publicPath+path.sep),'Imports must remain in public: '+spec);
    assert.ok(existsSync(target),'Missing module: '+path.relative(publicPath,absolute)+' => '+spec);
   }
  }
 }
 scan(publicPath);
});

test('site requires full project for Netlify Functions and content',()=>{
 for(const filename of ['public/index.html','public/admin.html','public/config.js','public/core.js','public/style.css','public/reader-v8.css','public/preview-completion.js','public/loader-resilience.js','netlify/functions/member.js','netlify/functions/adult-admin.js','netlify.toml','package.json']){
  assert.ok(existsSync(path.join(root,filename)),`Incomplete deployment: ${filename}`);
 }
 assert.match(src('netlify.toml'),/publish = "public"/);
 assert.match(src('netlify.toml'),/directory = "netlify\/functions"/);
});

test('no blank admin or infinite public skeleton if module bootstrap stalls',()=>{
 const admin=src('public/admin.html');const home=src('public/index.html');
 assert.match(admin,/Admin ачаалалт удааширсан байна/);
 assert.match(admin,/adult-admin-boot-complete/);
 assert.match(home,/Өгүүллэгүүдийг ачаалж чадсангүй/);
 assert.match(home,/aria-busy/);
 assert.match(src('public/core.js'),/from '@supabase\/supabase-js'/);
 assert.doesNotMatch(src('public/core.js'),/https:\/\/(?:esm\.sh|cdn\.jsdelivr\.net)/);
 assert.match(src('public/core.js'),/importWithTimeout/);
});

test('request timeout rejects stalled work and resolves successful work',async()=>{
 const {importWithTimeout}=await import('../public/loader-resilience.js');
 assert.equal(await importWithTimeout(()=>Promise.resolve('ok'),30),'ok');
 await assert.rejects(importWithTimeout(()=>new Promise(()=>{}),15),/sdk_load_timeout/);
 await assert.rejects(importWithTimeout(()=>Promise.reject(Error('cdn_down')),100),/cdn_down/);
});
