'use strict';
const {build}=require('esbuild');
const {readFileSync,writeFileSync,mkdirSync,rmSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
async function main(){
 // Remove old bundles before checking source so old output cannot mask missing files.
 const outdir=path.join(root,'public/dist');rmSync(outdir,{recursive:true,force:true});
 execFileSync(process.execPath,[path.join(__dirname,'build-check.cjs')],{stdio:'inherit'});
 mkdirSync(outdir,{recursive:true});
 const result=await build({
  absWorkingDir:root,entryPoints:{app:'public/app.js',admin:'public/admin.js'},
  outdir:'public/dist',entryNames:'[name]-[hash]',bundle:true,splitting:false,
  format:'esm',platform:'browser',target:['es2022'],minify:true,metafile:true,
  plugins:[{name:'canonical-local-modules',setup(b){
   b.onResolve({filter:/^\..*\?/},args=>({path:path.resolve(args.resolveDir,args.path.split('?')[0])}));
  }}]
 });
 const entries={};
 for(const [file,meta] of Object.entries(result.metafile.outputs)){
  if(meta.imports.length)throw Error('Unexpected unbundled dependency: '+file);
  if(!meta.entryPoint)continue;
  const name=path.basename(meta.entryPoint,'.js'),relative=file.replace(/^public\//,'');entries[name]=relative;
  const page=path.join(root,'public',name==='admin'?'admin.html':'index.html');
  const html=readFileSync(page,'utf8');
  if(!html.includes(`data-app="${name}"`))throw Error('Missing bootstrap for '+name);
  writeFileSync(page,html.replace(new RegExp(`(data-app="${name}" data-entry=")[^"]+`),`$1${relative}`));
 }
 if(!entries.app||!entries.admin)throw Error('Both entry bundles are required');
 writeFileSync(path.join(root,'public/deployment.json'),JSON.stringify({version:'4.4.0',entries},null,2)+'\n');
 console.log('Production bundles verified: '+Object.values(entries).join(', '));
}
main().catch(error=>{console.error(error);process.exitCode=1});
