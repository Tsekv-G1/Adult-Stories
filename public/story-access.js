export function hasActiveStoryEntitlement(entitlements, storyId, now=Date.now()){
 if(!storyId||!Array.isArray(entitlements))return false;
 return entitlements.some(row=>row&&!row.revoked_at&&(!row.expires_at||Date.parse(row.expires_at)>now)&&(!row.story_id||row.story_id===storyId));
}

export function activeEntitlements(entitlements, now=Date.now()){
 return Array.isArray(entitlements)?entitlements.filter(row=>row&&!row.revoked_at&&(!row.expires_at||Date.parse(row.expires_at)>now)):[];
}
