// Pure helpers for audio progress and wall-clock sleep timers.
export const sleepOptions=[0,5,10,15,30,45,60];
export function resumeSeconds(raw,duration=Infinity){
 const position=Number(raw);
 if(!Number.isFinite(position)||position<=5)return 0;
 if(Number.isFinite(duration)&&duration>0){if(position>=duration-8)return 0;return Math.min(position,Math.max(0,duration-.25))}
 return Math.max(0,position);
}
export function remainingSleepMinutes(deadline,now=Date.now()){
 return Number.isFinite(deadline)&&deadline>now?Math.ceil((deadline-now)/60000):0;
}
export const sleepExpired=(deadline,now=Date.now())=>Number.isFinite(deadline)&&deadline>0&&now>=deadline;
