/* One real audio source, shared by hero/cards/reader. No synthetic voice substitution. */
import {$,safeUrl} from './core.js?v=6.2.0';
import {clockDuration} from './studio.js?v=6.2.0';
export function createAudioPlayer({onChange=()=>{}}={}) {
 const audio=$('#audioFile'),root=$('#audioPlayer'),seek=$('#audioSeek');
 let track=null,phase='idle',request=0,rate=1;
 const snapshot=()=>({id:track?.id,phase,kind:track?.kind});
 function status(next,text){phase=next;$('#audioSub').textContent=text;const playing=next==='playing'||next==='buffering';$('#audioToggle').textContent=playing?'Ⅱ':'▶';$('#audioToggle').setAttribute('aria-label',playing?'Түр зогсоох':next==='ended'?'Дахин сонсох':'Тоглуулах');$('#audioToggle').disabled=next==='loading';onChange(snapshot());if('mediaSession' in navigator)navigator.mediaSession.playbackState=playing?'playing':'paused';}
 function timeline(){const duration=Number.isFinite(audio.duration)?audio.duration:0,current=audio.currentTime||0;$('#audioElapsed').textContent=clockDuration(current);$('#audioDuration').textContent=clockDuration(duration);seek.disabled=!duration;seek.max=duration||100;seek.value=current;seek.setAttribute('aria-valuetext',`${clockDuration(current)} / ${clockDuration(duration)}`);seek.style.setProperty('--progress',duration?`${current/duration*100}%`:'0%');if('mediaSession' in navigator&&duration&&navigator.mediaSession.setPositionState)try{navigator.mediaSession.setPositionState({duration,playbackRate:audio.playbackRate,position:Math.min(current,duration)})}catch{}}
 async function resume(){if(!track)return;const token=request;if(phase==='error'){audio.load()}if(audio.ended)audio.currentTime=0;status('loading','Аудио ачаалж байна…');try{await audio.play();if(token===request)status('playing',track.kind==='full'?'Бүтэн аудио':'Аудио эхлэл')}catch(error){if(token!==request||error.name==='AbortError')return;status('error',error.name==='NotAllowedError'?'▶ товчийг дарж эхлүүлнэ үү.':'Аудио нээгдсэнгүй. ▶ дарж дахин оролдоно уу.')}}
 function pause(){audio.pause();status('paused','Түр зогссон')}
 function jump(delta){if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,Math.max(0,audio.currentTime+delta));timeline()}
 function stop(){request++;audio.pause();audio.removeAttribute('src');audio.load();track=null;status('idle','');root.classList.add('hidden');document.body.classList.remove('has-audio');if('mediaSession' in navigator){navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none'}}
 function play(story,{url=story?.audio_preview_url,art='',kind='preview'}={}){
  const source=safeUrl(url);if(!story||!source)return false;
  if(track?.id===story.id&&track.url===source){if(phase==='playing')pause();else resume();return true}
  request++;audio.pause();track={id:story.id,title:story.title,url:source,kind};$('#audioName').textContent=story.title;$('#audioName').title=story.title;
  const image=$('#audioArt');image.onerror=()=>{image.hidden=true};image.hidden=!safeUrl(art);if(!image.hidden)image.src=safeUrl(art);else image.removeAttribute('src');
  root.classList.remove('hidden');document.body.classList.add('has-audio');audio.src=source;audio.playbackRate=rate;timeline();
  if('mediaSession' in navigator&&typeof MediaMetadata!=='undefined')navigator.mediaSession.metadata=new MediaMetadata({title:story.title,artist:'ADULT Stories',album:kind==='full'?'Бүтэн аудио':'Аудио эхлэл'});
  resume();return true;
 }
 audio.addEventListener('loadedmetadata',timeline);audio.addEventListener('durationchange',timeline);audio.addEventListener('timeupdate',timeline);
 audio.addEventListener('playing',()=>{if(track)status('playing',track.kind==='full'?'Бүтэн аудио':'Аудио эхлэл')});
 audio.addEventListener('waiting',()=>{if(track&&!audio.paused)status('buffering','Аудио ачаалж байна…')});
 audio.addEventListener('pause',()=>{if(track&&!audio.ended&&phase!=='error'&&phase!=='loading')status('paused','Түр зогссон')});
 audio.addEventListener('ended',()=>{status('ended','Дууслаа · Дахин сонсох ▶');timeline()});
 audio.addEventListener('error',()=>{if(track)status('error','Аудио нээгдсэнгүй. ▶ дарж дахин оролдоно уу.')});
 $('#audioToggle').addEventListener('click',()=>{if(audio.paused||phase==='error')resume();else pause()});
 $('#audioStop').addEventListener('click',stop);$('#audioBack').addEventListener('click',()=>jump(-10));$('#audioForward').addEventListener('click',()=>jump(10));
 seek.addEventListener('input',()=>{if(Number.isFinite(audio.duration)){audio.currentTime=Math.min(audio.duration,Math.max(0,Number(seek.value)));timeline()}});
 $('#audioSpeed').addEventListener('click',()=>{const rates=[1,1.25,1.5,1.75,2,.75];rate=rates[(rates.indexOf(rate)+1)%rates.length];audio.playbackRate=rate;$('#audioSpeed').textContent=rate+'×';$('#audioSpeed').setAttribute('aria-label',`Тоглуулах хурд ${rate} дахин`);timeline()});
 if('mediaSession' in navigator){for(const [name,handler] of Object.entries({play:resume,pause,stop,seekbackward:()=>jump(-10),seekforward:()=>jump(10),seekto:e=>{if(Number.isFinite(audio.duration)){audio.currentTime=Math.max(0,Math.min(audio.duration,e.seekTime));timeline()}}}))try{navigator.mediaSession.setActionHandler(name,handler)}catch{}}
 return {play,stop,snapshot};
}
