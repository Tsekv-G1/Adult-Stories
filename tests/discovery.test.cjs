'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

test('search ignores outer spaces, repeated spaces and case',async()=>{
 const {normalizeSearch}=await import('../public/discovery.js');
 assert.equal(normalizeSearch('  ШӨНИЙН \t ӨГҮҮЛЛЭГ  '),'шөнийн өгүүллэг');
 assert.equal(normalizeSearch(null),'');
});
test('discovery state round-trips without losing local mode or reader links',async()=>{
 const {readDiscovery,discoveryUrl}=await import('../public/discovery.js');
 const state={search:'Шөнийн түүх',filter:'Нууцлаг',sort:'newest',shortOnly:true};
 const url=discoveryUrl('https://example.com/?local=1#story-abc',state);
 assert.deepEqual(readDiscovery(url),state);assert.equal(new URL(url).searchParams.get('local'),'1');assert.equal(new URL(url).hash,'#story-abc');
 const cleared=new URL(discoveryUrl(url,{search:'',filter:'Бүгд',sort:'editor',shortOnly:false}));
 assert.equal(readDiscovery(discoveryUrl(url,{...state,sort:'popular'})).sort,'popular');
 assert.equal(cleared.search,'?local=1');assert.equal(cleared.hash,'#story-abc');
 assert.equal(readDiscovery('https://example.com/?sort=invalid').sort,'editor');
});
test('reader font size recovers from corrupted preferences and stays in range',async()=>{
 const {readerFontSize}=await import('../public/discovery.js');
 assert.equal(readerFontSize('broken'),18);assert.equal(readerFontSize(undefined),18);
 assert.equal(readerFontSize(99),24);assert.equal(readerFontSize(-10),16);assert.equal(readerFontSize(20),20);
});
