// Optional production-ready signature endpoint (deploy via Supabase CLI).
// Set CLOUDINARY_CLOUD_NAME=m3qbt9bk and use API credentials from that cloud.
// Uses only server-side secrets. This function must only serve approved admins.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS'
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
   const authHeader=req.headers.get('Authorization')||'';
   const token=authHeader.replace(/^Bearer\s+/i,'');
   if(!token)return json({error:'Authentication required'},401);
   const url=Deno.env.get('SUPABASE_URL')!;
   const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
   const sb=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
   const {data:{user},error:uerr}=await sb.auth.getUser(token);
   if(uerr||!user)return json({error:'Invalid session'},401);
   const {data:admin,error:aerr}=await sb.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
   if(aerr||!admin)return json({error:'Admin only'},403);
   const secret=Deno.env.get('CLOUDINARY_API_SECRET');
   const key=Deno.env.get('CLOUDINARY_API_KEY');
   const cloud=Deno.env.get('CLOUDINARY_CLOUD_NAME');
   if(!secret||!key||!cloud)return json({error:'Server Cloudinary secrets missing'},500);
   const timestamp=Math.floor(Date.now()/1000);
   const asset_folder='adult-stories';
   const input=`asset_folder=${asset_folder}&timestamp=${timestamp}${secret}`;
   const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(input));
   const signature=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
   return json({cloud_name:cloud,api_key:key,timestamp,asset_folder,signature});
 }catch(e){return json({error:'Failed to sign upload',detail:String(e)},500)}
});
