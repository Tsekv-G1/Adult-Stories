'use strict';
// Check the source tree and HTML assets before generating the production bundles.
const {spawnSync}=require('node:child_process');
const {readdirSync,readFileSync,existsSync}=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
let checked=0;
function walk(dir){
 for(const entry of readdirSync(path.join(root,dir),{withFileTypes:true})){
  const rel=path.join(dir,entry.name);
  if(entry.isDirectory())walk(rel);
  else if(/\.(?:js|cjs)$/.test(entry.name)){
   const result=spawnSync(process.execPath,['--check',path.join(root,rel)],{encoding:'utf8'});
   assert.equal(result.status,0,`Syntax error: ${rel}\n${result.stderr}`);
   checked++;
  }
 }
}
for(const dir of ['public','server','netlify/functions','functions','scripts','tests'])walk(dir);
for(const page of ['admin.html','index.html']){
 const html=readFileSync(path.join(root,'public',page),'utf8');
 for(const [,url] of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"#]*)?"/g)){
  if(/^(?:https?:|data:|mailto:|#|\/)/i.test(url))continue;
  if(!/\.(?:js|css|svg|png|jpg|webp|ico)$/i.test(url))continue;
  assert.ok(existsSync(path.join(root,'public',url)),`Missing ${url} referenced by ${page}`);
 }
}
// Unbundled ESM imports must all exist in the Netlify publish directory.
function checkModuleGraph(dir){
 for(const item of readdirSync(path.join(root,dir),{withFileTypes:true})){
  const rel=path.join(dir,item.name);
  if(item.isDirectory()){checkModuleGraph(rel);continue}
  if(!item.name.endsWith('.js'))continue;
  const js=readFileSync(path.join(root,rel),'utf8');
  for(const [,spec] of js.matchAll(/(?:\bfrom\s*|\bimport\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g)){
   const target=path.resolve(root,dir,spec.split('?')[0]);
   assert.ok(target.startsWith(path.join(root,'public')+path.sep),`Non-public module import: ${rel} => ${spec}`);
   assert.ok(existsSync(target),`Missing imported module: ${rel} => ${spec}`);
  }
 }
}
checkModuleGraph('public');
const admin=readFileSync(path.join(root,'public/admin.html'),'utf8');
for(const id of ['storyCtaAudio','storyCtaGap','ctaAudioPlayer','audioCombinedPreview'])assert.ok(admin.includes(`id="${id}"`),`Missing CTA UI: ${id}`);
console.log(`Static production build verified: ${checked} JS files and HTML asset references.`);
