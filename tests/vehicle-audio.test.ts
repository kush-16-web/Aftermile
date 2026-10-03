import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleAudioControls } from '../src/audio/VehicleAudioControls.ts';
import type { VehicleAudioState } from '../src/audio/VehicleAudioControls.ts';
import { VehicleAudio } from '../src/audio/VehicleAudio.ts';
import { createVehicleConfig } from '../src/vehicle/VehicleConfig.ts';
import { M4_GT3_EVO_Config } from '../src/vehicle/definitions/M4_GT3_EVO.ts';

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

test('R34 vs BMW M4 GT3 distinct acoustic identity: turbo spool/blowoff vs straight-cut sequential gear whine', () => {
  const r34Config = createVehicleConfig();
  const bmwConfig = structuredClone(M4_GT3_EVO_Config);

  const r34Controls = new VehicleAudioControls(r34Config.audio, r34Config.engine.idleRpm, r34Config.engine.redlineRpm);
  const bmwControls = new VehicleAudioControls(bmwConfig.audio, bmwConfig.engine.idleRpm, bmwConfig.engine.redlineRpm);

  // 1. High-load acceleration at 5500 RPM (in 3rd gear at 110 km/h)
  const accelState: VehicleAudioState = {
    speed: 110 / 3.6,
    rpm: 5500,
    load: 1.0,
    throttle: 1.0,
    brake: 0,
    slip: 0,
    gear: 3,
    shiftTimer: 0,
    isReversing: false,
    refueling: false,
  };

  for (let i = 0; i < 60; i++) {
    r34Controls.update(accelState, 1, 1, 1 / 60);
    bmwControls.update(accelState, 1, 1, 1 / 60);
  }

  // R34 must have prominent turbo boost and turbo whine; BMW has prominent straight-cut gear whine
  assert.ok(r34Controls.boost > 0.5, 'R34 builds boost under high load');
  assert.ok(r34Controls.turboWhineGain > 0.05, 'R34 turbo spool whine is clearly audible');
  assert.equal(r34Controls.gearWhineGain, 0, 'R34 road car does not have straight-cut racing gear whine');

  assert.ok(bmwControls.gearWhineGain > 0.12, 'BMW GT3 sequential racing gearbox whine is prominently active');
  assert.ok(bmwControls.gearWhineFrequency > 600, 'BMW gear mesh frequency tracks speed and ratio');

  // 2. Throttle lift off: R34 compressor blow-off flutter
  const liftState: VehicleAudioState = {
    ...accelState,
    load: 0,
    throttle: 0,
  };
  r34Controls.update(liftState, 1, 1, 1 / 60);
  assert.ok(r34Controls.blowOffGain > 0.05, 'R34 throttle lift releases compressor bypass blow-off flutter');

  // 3. Gear shift event: BMW GT3 aggressive ignition cut & pop
  const shiftState: VehicleAudioState = {
    ...accelState,
    gear: 4,
    shiftTimer: 0.08,
  };
  bmwControls.update(shiftState, 1, 1, 1 / 60);
  assert.ok(bmwControls.shiftCut < 0.6, 'BMW GT3 cuts engine power sharply during sequential shift');
  assert.ok(bmwControls.shiftBang > 0.5, 'BMW GT3 produces sharp shift exhaust transient pop');
});

test('Physics-driven per-wheel tire audio: scrub on loaded cornering, squeal ONLY on substantial relative slip, zero squeal during rolling braking', () => {
  const config = createVehicleConfig();
  const controls = new VehicleAudioControls(config.audio, 850, 7800);

  // Case A: Straight rolling cruising at 100 km/h (zero slip angle, zero slip velocity)
  const rollingState: VehicleAudioState = {
    speed: 100 / 3.6,
    rpm: 3200,
    load: 0.2,
    brake: 0,
    slip: 0,
    refueling: false,
    wheels: [
      { slipVelocity: 0.05, slipAngle: 0.005, slipRatio: 0.01, normalLoad: 3800, surfaceType: 'asphalt' },
      { slipVelocity: 0.05, slipAngle: 0.005, slipRatio: 0.01, normalLoad: 3800, surfaceType: 'asphalt' },
      { slipVelocity: 0.02, slipAngle: 0.002, slipRatio: 0.005, normalLoad: 3800, surfaceType: 'asphalt' },
      { slipVelocity: 0.02, slipAngle: 0.002, slipRatio: 0.005, normalLoad: 3800, surfaceType: 'asphalt' },
    ],
  };
  controls.update(rollingState, 1, 1, 1 / 60);
  assert.equal(controls.skidGain, 0, 'Normal straight rolling produces zero tire squeal');
  assert.equal(controls.tireScrubGain, 0, 'Normal straight rolling produces zero tire scrub');

  // Case B: Heavy normal straight braking from 100 km/h with rolling tires (ABS active, slipVelocity < 0.8 m/s)
  const absBrakingState: VehicleAudioState = {
    ...rollingState,
    brake: 0.9,
    wheels: [
      { slipVelocity: 0.65, slipAngle: 0.005, slipRatio: 0.12, normalLoad: 4900, surfaceType: 'asphalt' },
      { slipVelocity: 0.65, slipAngle: 0.005, slipRatio: 0.12, normalLoad: 4900, surfaceType: 'asphalt' },
      { slipVelocity: 0.40, slipAngle: 0.002, slipRatio: 0.08, normalLoad: 2700, surfaceType: 'asphalt' },
      { slipVelocity: 0.40, slipAngle: 0.002, slipRatio: 0.08, normalLoad: 2700, surfaceType: 'asphalt' },
    ],
  };
  controls.update(absBrakingState, 1, 1, 1 / 60);
  assert.equal(controls.skidGain, 0, 'Braking with rolling tires MUST NOT produce tire squeal');

  // Case C: Loaded cornering below grip limit (slipAngle = 0.08 rad, slipVelocity = 0.5 m/s)
  const corneringState: VehicleAudioState = {
    ...rollingState,
    wheels: [
      { slipVelocity: 0.5, slipAngle: 0.08, slipRatio: 0.04, normalLoad: 5200, surfaceType: 'asphalt' },
      { slipVelocity: 0.3, slipAngle: 0.06, slipRatio: 0.03, normalLoad: 2400, surfaceType: 'asphalt' },
      { slipVelocity: 0.4, slipAngle: 0.07, slipRatio: 0.03, normalLoad: 4800, surfaceType: 'asphalt' },
      { slipVelocity: 0.2, slipAngle: 0.05, slipRatio: 0.02, normalLoad: 2800, surfaceType: 'asphalt' },
    ],
  };
  controls.update(corneringState, 1, 1, 1 / 60);
  assert.ok(controls.tireScrubGain > 0.02, 'Loaded cornering produces audible tire scrub texture');
  assert.equal(controls.skidGain, 0, 'Cornering below sliding threshold produces zero screaming squeal');

  // Case D: Full controlled drift (rear wheels slipVelocity = 4.2 m/s, front slipAngle = 0.22 rad)
  const driftState: VehicleAudioState = {
    ...rollingState,
    speed: 75 / 3.6,
    wheels: [
      { slipVelocity: 0.8, slipAngle: 0.22, slipRatio: 0.08, normalLoad: 4200, surfaceType: 'asphalt' },
      { slipVelocity: 0.6, slipAngle: 0.20, slipRatio: 0.06, normalLoad: 3100, surfaceType: 'asphalt' },
      { slipVelocity: 4.2, slipAngle: 0.35, slipRatio: 0.45, normalLoad: 3900, surfaceType: 'asphalt' },
      { slipVelocity: 3.8, slipAngle: 0.32, slipRatio: 0.42, normalLoad: 3600, surfaceType: 'asphalt' },
    ],
  };
  controls.update(driftState, 1, 1, 1 / 60);
  assert.ok(controls.skidGain > 0.06, 'Drifting produces sustained sliding tire squeal');
  assert.ok(controls.tireScrubGain > 0.03, 'Drifting produces tire scrub texture');
});

test('Per-wheel multi-surface audio blending: mixed surface (left gravel, right asphalt) blends both textures', () => {
  const config = createVehicleConfig();
  const controls = new VehicleAudioControls(config.audio, 850, 7800);

  // Left 2 wheels on gravel, Right 2 wheels on asphalt
  const mixedSurfaceState: VehicleAudioState = {
    speed: 60 / 3.6,
    rpm: 2800,
    load: 0.3,
    brake: 0,
    slip: 0,
    refueling: false,
    wheels: [
      { slipVelocity: 0.1, slipAngle: 0.01, slipRatio: 0.01, normalLoad: 3800, surfaceType: 'gravel' },
      { slipVelocity: 0.1, slipAngle: 0.01, slipRatio: 0.01, normalLoad: 3800, surfaceType: 'asphalt' },
      { slipVelocity: 0.1, slipAngle: 0.01, slipRatio: 0.01, normalLoad: 3800, surfaceType: 'gravel' },
      { slipVelocity: 0.1, slipAngle: 0.01, slipRatio: 0.01, normalLoad: 3800, surfaceType: 'asphalt' },
    ],
  };

  controls.update(mixedSurfaceState, 1, 1, 1 / 60);

  // Both gravel and asphalt gains must be active in 50:50 proportion
  assert.ok(controls.surfaceGravelGain > 0.04, 'Gravel channel is active for wheels on gravel');
  assert.ok(controls.surfaceAsphaltGain > 0.02, 'Asphalt channel is active for wheels on asphalt');
  assert.equal(controls.surfaceSnowGain, 0, 'Snow channel is zero');
  assert.equal(controls.surfaceGrassGain, 0, 'Grass channel is zero');
});

test('Camera acoustic transfer function: Cockpit mode applies cabin lowpass filter and boosts interior transmission whine', () => {
  const bmwConfig = structuredClone(M4_GT3_EVO_Config);
  const controls = new VehicleAudioControls(bmwConfig.audio, bmwConfig.engine.idleRpm, bmwConfig.engine.redlineRpm);

  const state: VehicleAudioState = {
    speed: 90 / 3.6,
    rpm: 5000,
    load: 0.8,
    brake: 0,
    slip: 0,
    gear: 3,
    shiftTimer: 0,
    isReversing: false,
    refueling: false,
    cameraMode: 0, // Chase mode
  };

  controls.update(state, 1, 1, 1 / 60);
  const chaseCutoff = controls.cockpitFilterCutoff;
  const chaseWhineGain = controls.gearWhineGain;

  // Switch to Cockpit mode (mode 3)
  const cockpitState: VehicleAudioState = {
    ...state,
    cameraMode: 3,
  };
  controls.update(cockpitState, 1, 1, 1 / 60);
  const cockpitCutoff = controls.cockpitFilterCutoff;
  const cockpitWhineGain = controls.gearWhineGain;

  assert.ok(cockpitCutoff < chaseCutoff, 'Cockpit applies cabin acoustic lowpass filter');
  assert.ok(cockpitCutoff <= 2400, 'Cockpit lowpass filter attenuates harsh external frequencies');
  assert.ok(cockpitWhineGain > chaseWhineGain * 1.5, 'Cockpit significantly amplifies mechanical straight-cut transmission whine');
  assert.ok(controls.cabinResonanceGain > 0, 'Cockpit activates internal chassis cabin resonance');
});

