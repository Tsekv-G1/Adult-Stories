/* Browser mirrors migrate into the launcher's disk store. Supabase stays authoritative online. */
export function createLocalRepository({legacy,defaults,mirror,changed=()=>{}}){
 let connection,info={mode:'browser',ready:false};
 const request=async(path,options={})=>{
  const response=await fetch(path,{cache:'no-store',...options});let result;
  try{result=await response.json()}catch{throw Error('Хадгалах серверийн хариу буруу байна.')}
  if(!response.ok){const error=Error(result.error||'Хадгалах сервертэй холбогдсонгүй.');error.status=response.status;throw error}
  return result;
 };
 const post=(path,content,token)=>request(path,{method:'POST',headers:{'Content-Type':'application/json','X-CMS-Token':token},body:JSON.stringify(content)});
 async function connect(){
  if(!connection)connection=(async()=>{
   let response;try{response=await fetch('/__cms/status',{cache:'no-store'})}catch{if(info.mode==='disk')throw Error('Локал сервер зогссон байна. start.py-аар дахин асаана уу.');return null}
   if(response.status===404){if(info.mode==='disk')throw Error('Файл хадгалдаг сервер биш байна. start.py-аар асаана уу.');return null}
   if(!response.ok)throw Error('Хадгалах серверийн төлөв уншигдсангүй.');
   if(!(response.headers.get('Content-Type')||'').includes('application/json'))return null;
   const status=await response.json();if(status.project!=='adult-stories-cms'||status.protocol!==1)return null;
   info={mode:'disk',ready:false};const prior=legacy();const migrated=await post('/__cms/bootstrap',{content:prior||defaults(),merge:Boolean(prior)},status.token);mirror(migrated.data);info={mode:'disk',ready:true,revision:migrated.revision};return status;
  })();
  try{return await connection}catch(error){connection=null;throw error}
 }
 async function use(operation){const server=await connect();if(!server)return null;try{return await operation(server)}catch(error){connection=null;if(error.status===403){const fresh=await connect();if(fresh)return operation(fresh)}throw error}}
 return {
  info:()=>({...info}),
  async read({admin=false}={}){const result=await use(server=>request('/__cms/content'+(admin?'?private=1':''),{headers:admin?{'X-CMS-Token':server.token}:{}}));if(!result){info={mode:'browser',ready:true};return legacy()||defaults()}if(admin)mirror(result.data);info.revision=result.revision;return result.data},
  async mutate(action,args){const result=await use(server=>post('/__cms/mutate',{action,args},server.token));if(!result)return null;mirror(result.data);info.revision=result.revision;changed();return {handled:true,...result}}
 };
}
