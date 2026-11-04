'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(readFileSync(path.join(__dirname,'../public/price-offer.js'),'utf8')).toString('base64'));
test('discount uses the displayed price and never invents savings for invalid or higher prices',async()=>{
 const {priceOffer}=await load();
 assert.deepEqual(priceOffer(34900,24900),{original:34900,current:24900,saved:10000,percent:29});
 assert.deepEqual(priceOffer(34900,29900),{original:34900,current:29900,saved:5000,percent:14});
 for(const args of [[24900,24900],[24900,29900],[0,9900],[34900,-1],[NaN,24900],[34900,Infinity]])assert.equal(priceOffer(...args),null);
});
