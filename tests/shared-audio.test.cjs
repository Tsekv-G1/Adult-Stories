'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),path=require('node:path');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(readFileSync(path.join(__dirname,'../public/shared-audio.js'),'utf8')).toString('base64'));
test('a global CTA stores its gap with its URL and preserves other settings',async()=>{
 const {mergeSiteAudio,sharedCtaGap}=await load();
 const saved=mergeSiteAudio({brand:'Adult',shared_preview_url:'preview'}, {shared_cta_url:'cta',shared_cta_gap_seconds:2},'shared_cta_url');
 assert.equal(saved.shared_cta_url,'cta');assert.equal(sharedCtaGap(saved),2);assert.equal(saved.brand,'Adult');assert.equal(saved.shared_preview_url,'preview');
});
test('saving an older editor panel cannot overwrite a newer shared CTA or its gap',async()=>{
 const {mergeSiteAudio}=await load();
 const saved=mergeSiteAudio({shared_cta_url:'new',shared_cta_gap_seconds:2}, {brand:'Updated',shared_cta_url:'old',shared_cta_gap_seconds:1});
 assert.equal(saved.brand,'Updated');assert.equal(saved.shared_cta_url,'new');assert.equal(saved.shared_cta_gap_seconds,2);
});
test('clearing shared CTA clears its gap; old sites default to 1.5 seconds',async()=>{
 const {mergeSiteAudio,sharedCtaGap}=await load();
 const saved=mergeSiteAudio({shared_cta_url:'old',shared_cta_gap_seconds:2}, {shared_cta_url:''},'shared_cta_url');
 assert.equal(saved.shared_cta_gap_seconds,undefined);assert.equal(sharedCtaGap(saved),1.5);assert.equal(sharedCtaGap({shared_cta_gap_seconds:99}),1.5);
 assert.throws(()=>mergeSiteAudio({}, {},'unknown'),/invalid_audio_setting/);
});
