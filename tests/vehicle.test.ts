import test from 'node:test';
import assert from 'node:assert/strict';
import { Road } from '../src/road/Road.ts';
import { VehiclePhysics, emptyControls } from '../src/vehicle/VehiclePhysics.ts';
import type { Controls } from '../src/vehicle/VehicleInput.ts';
import { createVehicleConfig } from '../src/vehicle/VehicleConfig.ts';

class FlatRoad extends Road {
  center(){return 0;} slope(){return 0;} height(){return 0;} grade(){return 0;} bank(){return 0;}
  terrain(){return 0;} isBridge(){return false;} isTunnel(){return false;}
}
const carAt=(kmh=0)=>{const p=new VehiclePhysics(new FlatRoad());p.offset=0;p.speed=kmh/3.6;p.gear=kmh>=100?3:1;return p;};
function drive(car:VehiclePhysics,seconds:number,input:(time:number)=>Partial<Controls>,hz=120){
  for(let i=0;i<seconds*hz;i++)car.update(1/hz,{...emptyControls(),...input(i/hz)},0,0,false,false);
}

test('steering taps and sustained inputs remain progressive from 10 to 160 km/h',()=>{
  let previousAngle=Infinity;
  for(const kmh of [10,30,60,100,130,160]){
    const tap=carAt(kmh);
    drive(tap,.15,()=>({right:true}));
    assert.ok(tap.maxSteeringAngle<previousAngle||kmh===10);previousAngle=tap.maxSteeringAngle;
    assert.ok(tap.input.steering<.6,'digital input must ramp instead of immediately reaching full lock');
    assert.ok(tap.offset<.15,'a tap cannot instantly cross a lane');
    drive(tap,3.85,()=>({}));
    assert.ok(Math.abs(tap.yawRate)<.001,'yaw should settle after release');
    if(kmh>=100){assert.ok(Math.abs(tap.heading)<.045);assert.ok(Math.abs(tap.offset)<3.0);}
    const sustained=carAt(kmh);drive(sustained,1.5,()=>({right:true}));
    assert.ok(sustained.offset>tap.offset*.3,'sustained input must retain useful steering authority');
    assert.ok(Math.abs(sustained.roll)<.095&&Math.abs(sustained.pitch)<.06);
    assert.ok(Math.abs(sustained.yawRate)<1.3);
  }
});

test('100 km/h lane change stays within one lane and settles with countersteer',()=>{
  const car=carAt(100);let peakYaw=0;
  drive(car,4,t=>{peakYaw=Math.max(peakYaw,Math.abs(car.yawRate));return {right:t<.8,left:t>=.8&&t<1.6};});
  assert.ok(car.offset>2&&car.offset<4.5,`lane-change displacement ${car.offset.toFixed(2)} m`);
  // 0.95 g bounds the transient lateral acceleration during rapid aggressive lane change
  assert.ok(peakYaw*(100/3.6)<.95*9.81&&Math.abs(car.yawRate)<.001);
  assert.ok(Math.abs(car.heading)<.045&&Math.abs(car.bodyLateralVelocity)<.01);
  // Under full throttle, the car accelerates from 100 to 144 km/h, so speed-sensitive
  // steering authority decreases. Settling the accelerated lane change requires a
  // slightly longer countersteer window (0.95 s) to achieve parallel alignment.
  const loaded=carAt(100);drive(loaded,4,t=>({throttle:true,right:t<.8,left:t>=.8&&t<1.75}));
  assert.ok(loaded.offset>2&&loaded.offset<5.5&&Math.abs(loaded.heading)<.045);
});

test('engine force launches progressively, slows against drag, and brakes without immediate reverse',()=>{
  const car=carAt();drive(car,.1,()=>({throttle:true}));assert.ok(car.speed<.3);
  let elapsed=.1;while(car.speed<100/3.6&&elapsed<15){drive(car,1/120,()=>({throttle:true}));elapsed+=1/120;}
  assert.ok(elapsed>4.5&&elapsed<8,`0–100 km/h ${elapsed}s`);
  const brakeStart=car.s;let brakeTime=0;
  while(car.speed>.05&&brakeTime<6){drive(car,1/120,()=>({brake:true}));brakeTime+=1/120;}
  assert.ok(brakeTime>2.4&&brakeTime<3.5);assert.ok(car.s-brakeStart>32&&car.s-brakeStart<48);
  drive(car,.3,()=>({brake:true}));assert.equal(car.speed,0,'must pause at rest before reverse');
  drive(car,1,()=>({brake:true}));assert.ok(car.speed<-.5&&car.speed>-9.01);
  drive(car,2,()=>({throttle:true}));assert.ok(car.speed>0,'W brakes reverse motion before driving forward');
  const coast=carAt(160);drive(coast,5,()=>({}));assert.ok(coast.speed<160/3.6&&coast.speed>35);
});

test('braking and a brief handbrake input are bounded across the requested speed range',()=>{
  for(const kmh of [10,30,60,100,130,160]){
    const brake=carAt(kmh);drive(brake,.15,()=>({right:true}));
    drive(brake,2,t=>({brake:brake.speed>.1,right:t<.05}));
    assert.ok(brake.speed<kmh/3.6&&Math.abs(brake.heading)<.3&&Math.abs(brake.roll)<.095);
    const hand=carAt(kmh);drive(hand,3,t=>({right:t<.5,handbrake:t>.25&&t<.75}));
    assert.ok(Math.abs(hand.heading)<1.6&&Math.abs(hand.yawRate)<.01,'handbrake must not trigger a scripted spin');
    assert.ok(Math.abs(hand.bodyLateralVelocity)<.05);
  }
});

test('six minutes of repeated acceleration, steering, braking and recovery stays finite and bounded',()=>{
  const car=new VehiclePhysics(new Road());let peakRoll=0,peakPitch=0;
  for(let i=0;i<360*120;i++){
    const cycle=(i/120)%30;
    if(i>0&&i%(30*120)===0){car.reset();car.collisionTimer=0;car.collide(true,.8);}
    car.update(1/120,{...emptyControls(),throttle:cycle<19,left:cycle>6&&cycle<6.6,right:cycle>6.6&&cycle<7.2,brake:cycle>=19&&cycle<23,handbrake:cycle>14&&cycle<14.4},0,0,false,true);
    peakRoll=Math.max(peakRoll,Math.abs(car.roll));peakPitch=Math.max(peakPitch,Math.abs(car.pitch));
    assert.ok([car.s,car.offset,car.speed,car.heading,car.height,car.yawRate,car.heave,...car.wheelHeights].every(Number.isFinite));
    assert.ok(Math.abs(car.heave)<=car.config.suspension.travel&&Math.abs(car.speed)<=car.config.engine.maxSpeed);
    assert.equal(car.wheelHeights.length,4);
  }
  assert.ok(peakRoll<.1&&peakPitch<.065);
});

test('standalone 60 Hz and 120 Hz integrations agree and vehicle definitions are isolated',()=>{
  const a=carAt(100),b=carAt(100);const input=(t:number)=>({right:t<.5,left:t>=.5&&t<1});
  drive(a,3,input,60);drive(b,3,input,120);
  assert.ok(Math.abs(a.s-b.s)<.04&&Math.abs(a.offset-b.offset)<.03);
  const config=createVehicleConfig();config.mass=2000;assert.equal(createVehicleConfig().mass,1560);
  const next=new VehiclePhysics(new FlatRoad(),config);assert.equal(next.config.mass,2000);
});

test('fuel consumption uses the vehicle profile, distance, load and speed',()=>{
  const economy=createVehicleConfig(), thirsty=createVehicleConfig();
  thirsty.fuel.baselineLitresPer100Km=16;thirsty.fuel.loadMultiplier=2.2;
  const calm=new VehiclePhysics(new FlatRoad(),economy),loaded=new VehiclePhysics(new FlatRoad(),thirsty);
  for(let i=0;i<45*120;i++) {
    const keys={...emptyControls(),throttle:true};
    calm.update(1/120,keys,0,0,true,false);loaded.update(1/120,keys,0,0,true,false);
  }
  assert.ok(calm.distance>loaded.distance*.95&&calm.fuel<100&&loaded.fuel<100);
  assert.ok(loaded.fuelLitres<calm.fuelLitres,'a thirsty definition must consume more fuel');
  assert.equal(economy.fuel.tankLitres,65);
});

test('collision response dissipates motion and reset clears residual inputs and suspension velocity',()=>{
  const car=carAt(130);car.yawRate=.3;car.bodyLateralVelocity=2;car.collide(true,1);
  assert.ok(car.speed<50/3.6&&car.yawRate<.1&&car.bodyLateralVelocity<1);assert.ok(car.damage>0);
  car.input.steering=1;car.heaveVelocity=3;car.pitchVelocity=4;car.reset();
  assert.equal(car.input.steering,0);assert.equal(car.heaveVelocity,0);assert.equal(car.pitchVelocity,0);assert.equal(car.speed,0);
  const bounds=car.collisionExtents();assert.ok(bounds.halfLength>2.3&&bounds.halfWidth>1);
});

test('left/right taps mirror, release keeps heading, and highway authority remains useful',()=>{
  for(const kmh of [10,30,60,100,130,160]){
    const left=carAt(kmh),right=carAt(kmh);
    drive(left,.15,()=>({left:true}));drive(right,.15,()=>({right:true}));
    const startingAngle=right.steering;let last=startingAngle;
    for(let i=0;i<240;i++){
      const heading=right.heading;
      right.update(1/120,emptyControls(),0,0,false,false);
      // The rack can lag the just-released input for its first few milliseconds.
      if(i>12)assert.ok(right.steering<=last+1e-8,'release unwinds without an oscillating rack');
      assert.ok(Math.abs(right.heading-heading)<.025,'release cannot reset the heading');
      last=right.steering;
    }
    drive(left,2,()=>({}));
    assert.ok(Math.abs(left.offset+right.offset)<1e-7,'mirrored keys give mirrored corrections');
    assert.ok(Math.abs(right.steering)<startingAngle*.002);
    if(kmh>=100){
      const lane=carAt(kmh);drive(lane,4,t=>({right:t<.8,left:t>=.8&&t<1.6}));
      assert.ok(lane.offset>2.0&&lane.offset<4.5,`${kmh} km/h lane change ${lane.offset}m`);
      assert.ok(Math.abs(lane.heading)<.045&&Math.abs(lane.yawRate)<.002);
    }
  }
});

class GradeRoad extends FlatRoad {
  constructor(public incline:number){super();}
  height(s:number){return s*this.incline;}
  grade(){return this.incline;}
  terrain(s:number){return this.height(s);}
}

test('launch, stop, hold and resume on road grades without power boosts or permanent suspension compression',()=>{
  for(const grade of [0,.08,.12,.18]){
    const car=new VehiclePhysics(new GradeRoad(grade));car.offset=0;
    drive(car,5,()=>({throttle:true}));
    assert.ok(car.s>195&&car.speed>15,`${grade*100}% grade must climb from rest`);
    assert.ok(Math.abs(car.heave)<.035,'constant grade must not pin the suspension at full travel');
    assert.ok(Math.abs(car.surfacePitch-Math.atan(grade))<.002);
    drive(car,6,()=>({brake:true,handbrake:true}));assert.equal(car.speed,0);
    const stop=car.s;drive(car,2,()=>({handbrake:true}));assert.ok(Math.abs(car.s-stop)<.005);
    drive(car,4,()=>({throttle:true}));assert.ok(car.s>stop+20&&car.speed>12);
    // Rollback must not select reverse or disable forward wheel torque.
    car.reset();car.offset=0;car.speed=-.5;drive(car,3,()=>({throttle:true}));
    assert.equal(car.driveDirection,1);assert.ok(car.speed>5);
  }
});

test('holding W+Space with taps or held lock cannot create energy or launch a stopped vehicle',()=>{
  for(const kmh of [0,60,100,160])for(const turn of ['straight','tap','held']){
    const car=carAt(kmh);let maxSpeed=0;
    drive(car,20,t=>{
      maxSpeed=Math.max(maxSpeed,Math.hypot(car.speed,car.bodyLateralVelocity));
      assert.ok(Number.isFinite(car.yawRate)&&Math.abs(car.heave)<.001);
      return {throttle:true,handbrake:true,right:turn==='held'||turn==='tap'&&t<.2};
    });
    assert.ok(maxSpeed<=kmh/3.6+.1,'parking brake cannot inject sideways kinetic energy');
    assert.ok(Math.hypot(car.speed,car.bodyLateralVelocity)<.05&&Math.abs(car.yawRate)<.001);
    assert.ok(car.engineLoad<.001,'parking brake disengages wheel torque');
    drive(car,2,()=>({throttle:true}));assert.ok(car.speed>4,'releasing Space restores the drivetrain');
  }
});
