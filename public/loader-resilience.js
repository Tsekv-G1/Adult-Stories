// Pure timeout helper for external ESM CDNs (reused by frontend and tests).
export function importWithTimeout(load,ms=7000){
 let timer;
 return Promise.race([
  Promise.resolve().then(load),
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('sdk_load_timeout')),ms)})
 ]).finally(()=>clearTimeout(timer));
}
