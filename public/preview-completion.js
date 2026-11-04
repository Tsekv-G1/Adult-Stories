/** Pure decision for what to show when a track ends. No auth is required to see an offer. */
export function previewCompletionAction({track,story,adultConfirmed=false,studioMode=false,modalOpen=false,accountOpen=false,hasAccess=false,autoNext=false}={}){
 if(!track)return 'none';
 if(track.kind!=='preview')return autoNext?'next':'none';
 if(studioMode||!adultConfirmed||!story||track.id!==story.id||modalOpen||accountOpen)return 'none';
 return hasAccess?'full':'offer';
}
