import {supa} from './core.js?v=9.1.0';
import {mountOrders} from './admin-orders-ui.js?v=8.12.0';
const root=document.getElementById('adultBusiness');
const ui=mountOrders(root,async payload=>{const sb=await supa(),{data}=await sb.auth.getSession();if(!data.session)throw Error('unauthorized');const response=await fetch('/api/adult-admin',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok||!result.ok){const error=Error(result.error||'service_unavailable');error.code=error.message;throw error}return result});
document.querySelector('[data-tab="payments"]').addEventListener('click',()=>ui.load());
