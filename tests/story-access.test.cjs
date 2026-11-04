'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

test('full duration is available only for a story with an active entitlement',async()=>{
 const {activeEntitlements,hasActiveStoryEntitlement}=await import('../public/story-access.js');
 const now=Date.parse('2026-11-03T10:00:00Z');
 const rows=[
  {story_id:'story-a',expires_at:'2026-11-04T10:00:00Z'},
  {story_id:'story-b',expires_at:'2026-11-02T10:00:00Z'},
  {story_id:null,expires_at:'2026-11-04T10:00:00Z',revoked_at:'2026-11-03T09:00:00Z'}
 ];
 assert.equal(hasActiveStoryEntitlement(rows,'story-a',now),true);
 assert.equal(hasActiveStoryEntitlement(rows,'story-b',now),false);
 assert.equal(hasActiveStoryEntitlement(rows,'story-c',now),false);
 assert.equal(hasActiveStoryEntitlement([], 'story-a',now),false);
 assert.equal(activeEntitlements(rows,now).length,1);
 assert.equal(hasActiveStoryEntitlement([{story_id:null,expires_at:null}],'story-c',now),true);
 assert.equal(hasActiveStoryEntitlement([{story_id:'story-a',expires_at:'2026-11-03T10:00:00Z'}],'story-a',now),false);
});
