import {memberRequest} from './customer-api.js?v=8.8.0';

const VIEWER_KEY='adult_story_visitor_v1';
function viewerId(){
 try{
  const saved=localStorage.getItem(VIEWER_KEY);
  if(saved&&/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(saved))return saved;
  const value=crypto.randomUUID();localStorage.setItem(VIEWER_KEY,value);return value;
 }catch{return crypto.randomUUID()}
}
export async function recordStoryActivity(storyId,event){
 if(!storyId||!['read','listen'].includes(event))return false;
 try{const result=await memberRequest('track',{story_id:storyId,event,viewer_id:viewerId()});return result.recorded===true}catch{return false}
}
export async function loadStoryMetrics(storyIds){
 const ids=[...new Set((storyIds||[]).filter(v=>/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(v)))];
 if(!ids.length)return[];
 const metrics=[];for(let i=0;i<ids.length;i+=40){const result=await memberRequest('stats',null,{ids:ids.slice(i,i+40).join(',')});if(Array.isArray(result.metrics))metrics.push(...result.metrics)}return metrics;
}
