const sorts=new Set(['popular','editor','listened','newest']);
export function normalizeSearch(value){return String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('mn-MN')}
export function readDiscovery(input){
 const url=new URL(input),q=url.searchParams;
 return {search:(q.get('q')||'').slice(0,180),filter:(q.get('category')||'Бүгд').slice(0,80),sort:sorts.has(q.get('sort'))?q.get('sort'):'popular',shortOnly:q.get('short')==='1'};
}
export function discoveryUrl(input,state){
 const url=new URL(input),values={q:String(state.search||'').trim().slice(0,180),category:state.filter==='Бүгд'?'':state.filter,sort:state.sort==='popular'?'':state.sort,short:state.shortOnly?'1':''};
 for(const [key,value] of Object.entries(values)){if(value)url.searchParams.set(key,value);else url.searchParams.delete(key)}
 return url.href;
}
export function readerFontSize(value){const size=Number(value);return Number.isFinite(size)?Math.max(16,Math.min(24,size)):18}
