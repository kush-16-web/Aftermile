import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleAudioControls } from '../src/audio/VehicleAudioControls.ts';
import type { VehicleAudioState } from '../src/audio/VehicleAudioControls.ts';
import { VehicleAudio } from '../src/audio/VehicleAudio.ts';
import { createVehicleConfig } from '../src/vehicle/VehicleConfig.ts';

const frame = (load = 0, rpm = 3200): VehicleAudioState => ({speed:100/3.6,rpm,load,brake:0,slip:0,refueling:false});
function settled(load: number, speed=100/3.6) {
  const config=createVehicleConfig(), controls=new VehicleAudioControls(config.audio,850,7800);
  for(let i=0;i<300;i++)controls.update({...frame(load),speed},1,1,1/60);
  return controls;
}

test('100 km/h cruise/full throttle select genuinely different recording layers at identical RPM',()=>{
  const coast=settled(0),cruise=settled(.18),power=settled(1);
  const sumOn=(c:any)=>c.weights.reduce((s:number,w:number,i:number)=>i%2===0?s+w:s,0);
  const sumOff=(c:any)=>c.weights.reduce((s:number,w:number,i:number)=>i%2===1?s+w:s,0);
  assert.ok(Math.abs(cruise.rpm-power.rpm)<.001);
  assert.ok(sumOff(cruise)>sumOn(cruise),'cruise favors the off-load recording layers');
  assert.ok(sumOn(power)>.99&&sumOff(power)<.001,'full load favors the on-load recording');
  assert.ok(power.engineGain>cruise.engineGain*1.7);
  assert.ok(sumOff(coast)>.99);
});

test('RPM/load changes, release and refueling stay smooth, finite, bounded and allocation-free in the controls',()=>{
  const c=settled(1),weights=c.weights,pitches=c.pitches;
  c.update(frame(0,7000),1,1,1/60);
  assert.ok(c.rpm>3200&&c.rpm<4100,'pitch input cannot jump directly to a new RPM');
  assert.ok(c.load>.8&&c.load<1,'throttle release crossfades instead of switching instantly');
  for(let rpm=0;rpm<=10000;rpm+=37) {
    for(const load of [0,.25,.5,.75,1]) {
      c.update(frame(load,rpm),1,1,.1);
      const sum=c.weights.reduce((a,b)=>a+b,0);
      assert.ok(Math.abs(sum-1)<1e-12);
      assert.ok(c.pitches.every(p=>p>=.75&&p<=1.4));
      assert.ok(c.weights.every(w=>Number.isFinite(w)&&w>=0&&w<=1));
    }
  }
  c.update({...frame(),speed:NaN,rpm:Infinity,load:NaN,slip:NaN},Infinity,NaN,.1);
  assert.ok([c.rpm,c.load,c.engineGain,c.roadGain,c.windGain,c.skidGain].every(Number.isFinite));
  assert.equal(c.weights,weights); assert.equal(c.pitches,pitches);
  c.update({...frame(1),refueling:true},1,1,.1);assert.equal(c.engineGain,0);
});

test('road/wind track absolute speed; braking cannot invent tire squeal; volume zero mutes its channels',()=>{
  const parked=settled(0,0),low=settled(0,10/3.6),high=settled(0,160/3.6),reverse=settled(0,-10/3.6);
  assert.equal(parked.roadGain,0);assert.equal(parked.windGain,0);assert.equal(low.windGain,0);
  assert.ok(high.roadGain>low.roadGain&&high.windGain>0);assert.equal(low.roadGain,reverse.roadGain);
  high.update({...frame(),brake:1},1,1,.1);assert.equal(high.skidGain,0);
  high.update({...frame(),slip:.9},1,1,.1);assert.ok(high.skidGain>.05);
  high.update({...frame(),speed:0,slip:1},1,1,.1);assert.equal(high.skidGain,0);
  high.update({...frame(1),slip:1},0,0,.1);
  assert.equal(high.engineGain+high.roadGain+high.windGain+high.skidGain,0);
});

// WebAudio graph spy: validates wiring/lifecycle/automation, not perceived sound quality.
class Param { value=0; calls=0; setTargetAtTime(value:number){assert.ok(Number.isFinite(value));this.value=value;this.calls++;} }
class Node {
  gain=new Param(); frequency=new Param(); Q=new Param(); delayTime=new Param(); playbackRate=new Param();
  threshold=new Param(); knee=new Param(); ratio=new Param(); attack=new Param(); release=new Param();
  type=''; buffer:unknown=null; loop=false; loopStart=0; stopped=false; connected:Node[]=[];
  connect(node:Node){this.connected.push(node);return node;} disconnect(){this.connected=[];}
  start(){} stop(){this.stopped=true;}
}
class Buffer {
  numberOfChannels=1; sampleRate=48000; length:number; duration:number; data:Float32Array;
  constructor(seconds=2) {this.length=seconds*this.sampleRate;this.duration=seconds;this.data=new Float32Array(this.length);for(let i=0;i<this.length;i++)this.data[i]=Math.sin(i*.2)*.9+.05;}
  getChannelData(){return this.data;}
}
class Context {
  currentTime=0; sampleRate=48000; nodes:Node[]=[];
  node(){const n=new Node();this.nodes.push(n);return n;}
  createGain(){return this.node();}createBiquadFilter(){return this.node();}
  createDelay(){return this.node();}createDynamicsCompressor(){return this.node();}createBufferSource(){return this.node();}
  createBuffer(_channels:number,length:number,rate:number){return new Buffer(length/rate);}
  async decodeAudioData(){return new Buffer();}
}

test('unconfigured R34 makes no recording requests and has no fake engine oscillators',async()=>{
  const ctx=new Context(),master=ctx.node();
  const unconfigured=createVehicleConfig();unconfigured.audio.bands=[{rpm:850},{rpm:1250},{rpm:1800},{rpm:2600},{rpm:3700},{rpm:5200},{rpm:7000}];
  const vehicle=new VehicleAudio(ctx as unknown as AudioContext,master as unknown as GainNode,unconfigured);
  await vehicle.ready;assert.equal(vehicle.recordingStatus,'needs-recordings');assert.equal(vehicle.loadedLoops,0);
  assert.equal(vehicle.decodedBytes,0);assert.equal(vehicle.noiseBytes,384000);
  assert.equal(ctx.nodes.filter(n=>n.loop).length,1,'only procedural road/wind/slip share a noise source');
  for(let i=0;i<120;i++){ctx.currentTime+=1/120;vehicle.update(frame(),1,1,false);}
  const road=vehicle.road.gain as unknown as Param;assert.ok(road.calls>=20&&road.calls<=31,'automation capped at 30 Hz');
  vehicle.dispose();vehicle.dispose();assert.equal(vehicle.recordingStatus,'disposed');
  assert.ok(ctx.nodes.every(n=>n.connected.length===0));
});

test('recording fetch/decode failures remain isolated; shared assets decode once and release on dispose',async()=>{
  const original=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;return new Response(new Uint8Array(32));};
  try {
    const config=createVehicleConfig();config.audio.bands=[{rpm:850,onLoad:'/idle.wav',offLoad:'/idle.wav'},{rpm:3200,onLoad:'/on.wav',offLoad:'/off.wav'}];
    const ctx=new Context(),vehicle=new VehicleAudio(ctx as unknown as AudioContext,ctx.node() as unknown as GainNode,config);
    await vehicle.ready;assert.equal(vehicle.recordingStatus,'recorded');assert.equal(requests,3);assert.equal(vehicle.loadedLoops,4);
    assert.equal(vehicle.decodedBytes,3*2*48000*4);assert.equal(vehicle.downloadedBytes,96);
    const sources=ctx.nodes.filter(n=>n.loop&&n.buffer);assert.equal(sources.length,5);
    for(const source of sources.slice(1))assert.ok((source.buffer as Buffer).data.every(v=>Math.abs(v)<=.450001));
    for(let i=0;i<90;i++){ctx.currentTime+=1/30;vehicle.update(frame(1),1,1,true);}
    assert.ok(sources.slice(1).every(n=>n.playbackRate.value>=.75&&n.playbackRate.value<=1.4));
    vehicle.dispose();assert.equal(vehicle.decodedBytes,0);assert.ok(sources.every(n=>n.stopped&&n.buffer===null));
    globalThis.fetch=async()=>new Response('',{status:404});
    const failed=new VehicleAudio(ctx as unknown as AudioContext,ctx.node() as unknown as GainNode,config);
    await failed.ready;assert.equal(failed.recordingStatus,'needs-recordings');assert.equal(failed.loadedLoops,0);
    assert.equal(failed.recordingErrors.length,4);failed.dispose();
  } finally {globalThis.fetch=original;}
});
