'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
let r2;
try{r2=require('../server/r2.cjs')}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error}

test('trimmed public preview can be signed without enabling a private audio bucket',{skip:!r2?'AWS SDK dependencies are not installed in this local workspace':false},async()=>{
 const names=['R2_ACCOUNT_ID','R2_ENDPOINT','R2_MEDIA_BUCKET','R2_AUDIO_BUCKET','R2_PUBLIC_BASE_URL','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'];
 const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 Object.assign(process.env,{R2_ACCOUNT_ID:'a'.repeat(32),R2_MEDIA_BUCKET:'adultstories',R2_AUDIO_BUCKET:'',R2_PUBLIC_BASE_URL:'https://media.example.com',R2_ACCESS_KEY_ID:'test-access-key',R2_SECRET_ACCESS_KEY:'test-secret-access-key'});
 delete process.env.R2_ENDPOINT;
 try{
  const target=await r2.audioPreviewTarget('123e4567-e89b-12d3-a456-426614174000');
  assert.match(target.url,/^https:\/\/media\.example\.com\/audio-preview\/123e4567-e89b-12d3-a456-426614174000\/[a-f0-9-]+\.mp3$/);
  assert.match(target.put_url,/X-Amz-Signature=/);
 }finally{
  for(const name of names){if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name]}
 }
});
