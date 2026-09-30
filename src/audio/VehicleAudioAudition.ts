/** Development-only entry; not imported by the game or production build. */
import { VehicleAudio } from './VehicleAudio.ts';
import type { VehicleAudioState } from './VehicleAudio.ts';
import { createVehicleConfig } from '../vehicle/VehicleConfig.ts';

const output=document.getElementById('result')!;
const scenario=document.getElementById('scenario') as HTMLSelectElement;
const volume=document.getElementById('volume') as HTMLInputElement;
const environment=document.getElementById('environment') as HTMLInputElement;
const tunnel=document.getElementById('tunnel') as HTMLInputElement;
const states: Record<string, VehicleAudioState> = {
  idle:{speed:0,rpm:850,load:0,brake:0,slip:0,refueling:false},
  gentle:{speed:12,rpm:2400,load:.25,brake:0,slip:0,refueling:false},
  hard:{speed:12,rpm:4500,load:1,brake:0,slip:0,refueling:false},
  cruise:{speed:100/3.6,rpm:3200,load:.18,brake:0,slip:0,refueling:false},
  power:{speed:100/3.6,rpm:3200,load:1,brake:0,slip:0,refueling:false},
  high:{speed:160/3.6,rpm:6500,load:1,brake:0,slip:0,refueling:false},
  coast:{speed:100/3.6,rpm:3200,load:0,brake:0,slip:0,refueling:false},
  brake:{speed:100/3.6,rpm:3200,load:0,brake:1,slip:0,refueling:false},
  slip:{speed:15,rpm:3800,load:.5,brake:0,slip:.9,refueling:false},
  reverse:{speed:-4,rpm:1800,load:.4,brake:0,slip:0,refueling:false},
};
let ctx:AudioContext|undefined,vehicle:VehicleAudio|undefined,timer=0;
document.getElementById('start')!.addEventListener('click',async()=>{
  if(ctx){await ctx.resume();return;}
  ctx=new AudioContext();const master=ctx.createGain();master.gain.value=.35;master.connect(ctx.destination);
  vehicle=new VehicleAudio(ctx,master,createVehicleConfig());await ctx.resume();await vehicle.ready;
  timer=window.setInterval(()=>{
    if(!vehicle)return;
    vehicle.update(states[scenario.value],Number(volume.value),Number(environment.value),tunnel.checked);
    output.textContent=JSON.stringify({scenario:scenario.value,status:vehicle.recordingStatus,loadedLoops:vehicle.loadedLoops,
      decodedBytes:vehicle.decodedBytes,noiseBytes:vehicle.noiseBytes,rpm:vehicle.controls.rpm,load:vehicle.controls.load,
      engineGain:vehicle.controls.engineGain,roadGain:vehicle.controls.roadGain,windGain:vehicle.controls.windGain,skidGain:vehicle.controls.skidGain},null,2);
  },1000/60);
});
document.getElementById('stop')!.addEventListener('click',async()=>{
  clearInterval(timer);vehicle?.dispose();await ctx?.close();vehicle=undefined;ctx=undefined;output.textContent='Stopped.';
});

function testTone(rpm:number,on:boolean):string {
  const rate=48000,n=rate*2,bytes=new ArrayBuffer(44+n*2),view=new DataView(bytes);
  const text=(at:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+n*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,n*2,true);
  // Instrumentation witness only. Integral half-Hz frequency makes the 2 s loop seamless.
  const frequency=Math.round(rpm/20*2)/2;
  for(let i=0;i<n;i++){const phase=i/rate*Math.PI*2*frequency;view.setInt16(44+i*2,Math.round((Math.sin(phase)*.5+(on?Math.sin(phase*3)*.2:0))*32767),true);}
  return URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
}
async function measure(load:number) {
  const context=new OfflineAudioContext(1,48000*4,48000),master=context.createGain();master.connect(context.destination);
  let simulatedTime=0;
  const clock={get currentTime(){return simulatedTime;},sampleRate:context.sampleRate,
    createGain:()=>context.createGain(),createBiquadFilter:()=>context.createBiquadFilter(),createDelay:(max:number)=>context.createDelay(max),
    createDynamicsCompressor:()=>context.createDynamicsCompressor(),createBuffer:(n:number,len:number,rate:number)=>context.createBuffer(n,len,rate),
    createBufferSource:()=>context.createBufferSource(),decodeAudioData:(buffer:ArrayBuffer)=>context.decodeAudioData(buffer)};
  const config=createVehicleConfig(),urls:string[]=[];
  config.audio.bands=[850,3200,7000].map(rpm=>{const onLoad=testTone(rpm,true),offLoad=testTone(rpm,false);urls.push(onLoad,offLoad);return {rpm,onLoad,offLoad};});
  const audio=new VehicleAudio(clock as unknown as AudioContext,master,config);
  try {
    await audio.ready;
    for(let i=0;i<240;i++) {simulatedTime=i/60;audio.update({...states.cruise,load: i<120?load:0},1,1,false);}
    const rendered=await context.startRendering(),data=rendered.getChannelData(0);let peak=0,sum=0,step=0;
    for(let i=0;i<data.length;i++){peak=Math.max(peak,Math.abs(data[i]));sum+=data[i]*data[i];if(i)step=Math.max(step,Math.abs(data[i]-data[i-1]));}
    return {testTonesOnly:true,status:audio.recordingStatus,peak,rms:Math.sqrt(sum/data.length),maximumSampleStep:step,
      finite:data.every(Number.isFinite),clippedSamples:data.reduce((n,v)=>n+(Math.abs(v)>=1?1:0),0),decodedBytes:audio.decodedBytes,noiseBytes:audio.noiseBytes};
  } finally {audio.dispose();urls.forEach(url=>URL.revokeObjectURL(url));}
}
document.getElementById('measure')!.addEventListener('click',async()=>{
  output.textContent='Rendering native offline test-tone checks…';
  try {const cruise=await measure(.18),fullThrottle=await measure(1);output.textContent=JSON.stringify({cruise,fullThrottle,
    note:'This verifies WebAudio rendering/headroom using test tones. Licensed recording seams/timbre/listening remain untested.'},null,2);}
  catch(error){output.textContent=String(error);}
});
