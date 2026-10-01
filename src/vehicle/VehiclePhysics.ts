import { clamp, damp, lerp } from '../core/math.ts';
import { ROAD_HALF, Road } from '../road/Road.ts';
import { createVehicleConfig } from './VehicleConfig.ts';
import type { VehicleConfig } from './VehicleConfig.ts';
import { VehicleInput } from './VehicleInput.ts';
import type { Controls } from './VehicleInput.ts';
import { wheelSteeringAngle } from './WheelKinematics.ts';
export { emptyControls } from './VehicleInput.ts';
export type { Controls } from './VehicleInput.ts';

export interface VehiclePose {
  s: number; offset: number; heading: number; height: number; steering: number;
  surfacePitch: number; surfaceRoll: number; roll: number; pitch: number; heave: number;
  wheelHeights: number[]; wheelSpins: number[]; wheelSpin: number;
}
const angleLerp = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b-a), Math.cos(b-a))*t;

/** Grounded dynamic bicycle: separate tire forces and body velocity.
 * Road coordinates provide a surface and position; they never steer the car.
 * Suspension is a damped visual sprung mass over four sampled contact points.
 */
export class VehiclePhysics {
  s = 160; offset = 5.1; speed = 0; heading = 0; steering = 0;
  lateralVelocity = 0; bodyLateralVelocity = 0; yawRate = 0; roll = 0; pitch = 0;
  private fuelLevelLitres = 0;
  get fuel() { return clamp(this.fuelLevelLitres / this.config.fuel.tankLitres * 100, 0, 100); }
  set fuel(percent: number) { this.fuelLevelLitres = clamp(percent, 0, 100) * this.config.fuel.tankLitres / 100; }
  get fuelLitres() { return this.fuelLevelLitres; }
  distance = 0; damage = 0; cleanDistance = 0;
  collisionTimer = 0; reverseDelay = 0; refueling = false; throttle = 0; engineLoad = 0;
  acceleration = 0; lateralAcceleration = 0; grip = 1; previousS = 160; previousOffset = 5.1;
  input = new VehicleInput(); maxSteeringAngle = .55; rpm = 800; gear = 1; shiftTimer = 0;
  brakeAmount = 0; slip = 0; height = 0; surfacePitch = 0; surfaceRoll = 0;
  /** Selected drive direction is independent of rollback on an incline. */
  driveDirection: 1 | -1 = 1;
  heave = 0; heaveVelocity = 0; rollVelocity = 0; pitchVelocity = 0; wheelSpin = 0;
  wheelHeights = [0,0,0,0]; wheelSpins = [0,0,0,0];
  previousPose:VehiclePose={s:0,offset:0,heading:0,height:0,steering:0,surfacePitch:0,surfaceRoll:0,roll:0,pitch:0,heave:0,wheelHeights:[0,0,0,0],wheelSpins:[0,0,0,0],wheelSpin:0};
  private currentPose:VehiclePose={...this.previousPose,wheelHeights:[0,0,0,0],wheelSpins:[0,0,0,0]};
  private interpolatedPose:VehiclePose={...this.previousPose,wheelHeights:[0,0,0,0],wheelSpins:[0,0,0,0]};
  private sprungHeight = 0;
  constructor(public road: Road, public config: VehicleConfig = createVehicleConfig()) {
    this.fuel = 100; this.sampleSurface(); this.sampleSurface(); this.sprungHeight = this.height; this.writePose(this.previousPose);
  }
  reset(s = this.s) {
    this.s = Math.max(0, s); this.offset = 5.1; this.speed = this.heading = this.steering = 0;
    this.lateralVelocity = this.bodyLateralVelocity = this.yawRate = this.roll = this.pitch = 0;
    this.rollVelocity = this.pitchVelocity = this.heaveVelocity = this.heave = 0;
    this.acceleration = this.lateralAcceleration = this.throttle = this.engineLoad = this.brakeAmount = this.slip = 0;
    this.reverseDelay = this.shiftTimer = 0; this.gear = 1; this.rpm = this.config.engine.idleRpm;
    this.driveDirection = 1; this.wheelSpin = 0; this.wheelSpins.fill(0);
    this.refueling = false; this.input.reset(); this.collisionTimer = 1;
    this.previousS = this.s; this.previousOffset = this.offset;
    this.sampleSurface(); this.sampleSurface(); this.sprungHeight = this.height; this.writePose(this.previousPose);
  }
  /** Weather arguments remain for compatibility; Pass 1 uses a dry-road tire tune. */
  update(dt: number, keys: Controls, _wet: number, _snow: number, fuelEnabled: boolean, damageEnabled: boolean) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.writePose(this.previousPose); this.previousS = this.s; this.previousOffset = this.offset;
    const steps = Math.ceil(Math.min(dt, .05) * 120), h = Math.min(dt, .05) / steps;
    for (let i=0; i<steps; i++) this.step(h, keys, fuelEnabled, damageEnabled);
    if (![this.s,this.speed,this.offset,this.heading,this.yawRate,this.bodyLateralVelocity,this.height].every(Number.isFinite)) this.reset(Number.isFinite(this.previousS)?this.previousS:160);
  }
  private step(dt: number, keys: Controls, fuelEnabled: boolean, damageEnabled: boolean) {
    const c = this.config, g = 9.81, mass = c.mass;
    const speed = Math.abs(this.speed);
    this.collisionTimer = Math.max(0, this.collisionTimer-dt);
    this.shiftTimer = Math.max(0, this.shiftTimer-dt);
    this.input.update(dt, keys, this.speed, c);
    this.grip = c.tires.grip;
    // One inspectable road-wheel angle curve replaces the compounded authority
    // multiplier / lateral-acceleration / v² limits of the previous tune.
    this.maxSteeringAngle = this.steeringLimit(speed);
    const rackRate = lerp(c.steering.response, c.steering.highwayResponse, clamp(speed/35, 0, 1));
    const u = this.input.steering;
    const linW = c.steering.linearWeight ?? 0.90;
    const powW = c.steering.powerWeight ?? 0.10;
    const powExp = c.steering.powerExponent ?? 1.6;
    const precisionInput = Math.sign(u) * (linW * Math.abs(u) + powW * Math.pow(Math.abs(u), powExp));
    this.steering = damp(this.steering, precisionInput * this.maxSteeringAngle, rackRate, dt);
    const station = this.road.station(this.s-50);
    this.refueling = keys.refuel && Math.abs(this.s-station)<28 && this.offset>13 && this.offset<33 && speed<.6;
    if (this.refueling) this.fuelLevelLitres = Math.min(this.config.fuel.tankLitres, this.fuelLevelLitres+dt*this.config.fuel.refuelLitresPerSecond);

    if (this.driveDirection===-1 && keys.throttle && speed<.15) {
      this.driveDirection=1; this.gear=1; this.reverseDelay=0;
    }
    if (this.driveDirection===1 && keys.brake && speed<.15 && !keys.throttle && !keys.handbrake) this.reverseDelay += dt;
    else this.reverseDelay = 0;
    if (this.reverseDelay >= c.brakes.reverseDelay) { this.driveDirection=-1; this.reverseDelay=0; }
    const reversing = this.driveDirection===-1;
    const powerAvailable = this.fuel>0 || !fuelEnabled;
    this.throttle = powerAvailable && !this.refueling ? (reversing&&!keys.throttle?this.input.brake:reversing?0:this.input.throttle) : 0;
    this.brakeAmount = this.refueling ? 1 : (reversing?this.input.throttle:this.input.brake);
    const ratio = (reversing?c.engine.reverseRatio:c.engine.gears[this.gear-1])*c.engine.finalDrive;
    let coupledRpm = speed/c.wheelRadius*ratio*60/(Math.PI*2);
    if (!reversing && this.shiftTimer===0) {
      if (coupledRpm>c.engine.shiftRpm && this.gear<c.engine.gears.length) { this.gear++; this.shiftTimer=.22; }
      else if (coupledRpm<1800 && this.gear>1) { this.gear--; this.shiftTimer=.18; }
    }
    const actualRatio = (reversing?c.engine.reverseRatio:c.engine.gears[this.gear-1])*c.engine.finalDrive;
    coupledRpm = speed/c.wheelRadius*actualRatio*60/(Math.PI*2);
    this.rpm = damp(this.rpm, clamp(Math.max(coupledRpm, c.engine.idleRpm+this.throttle*1400), c.engine.idleRpm, c.engine.redlineRpm), 12, dt);
    const torqueShape = .72 + .28*Math.sin(Math.PI*clamp(this.rpm/c.engine.redlineRpm,0,1));
    const powerForce = c.engine.powerKw*1000*c.engine.efficiency/Math.max(6,speed);
    const torqueForce = c.engine.torque*torqueShape*actualRatio*c.engine.efficiency/c.wheelRadius;
    // Parking-brake clutch interlock: W+Space revs at standstill without powering wheels.
    // Sustained handbrake brings vehicle to rest; brief handbrake taps initiate slides.
    this.engineLoad = this.throttle * (this.shiftTimer>0?.35:1) * (1-this.input.handbrake);
    const driveForce = Math.min(c.engine.maxDriveForce, powerForce, torqueForce)*this.engineLoad*(reversing?-1:1);
    const normalLoad = mass*g*Math.max(.2,Math.cos(this.surfacePitch)*Math.cos(this.surfaceRoll));
    const frontLoad = clamp(normalLoad*c.frontWeight-mass*this.acceleration*c.centerOfGravity/c.wheelbase,normalLoad*.25,normalLoad*.75);
    const rearLoad = normalLoad-frontLoad;
    // Bound each driven axle by its available normal force on the grade.
    const frontDrive = clamp(driveForce*c.engine.frontDriveShare,-frontLoad*this.grip,frontLoad*this.grip);
    const rearDrive = clamp(driveForce*(1-c.engine.frontDriveShare),-rearLoad*this.grip,rearLoad*this.grip);
    const drive = frontDrive+rearDrive;
    const brakeDemand = this.brakeAmount*Math.min(c.brakes.force,normalLoad*this.grip);
    // Electronic brake distribution protects the unloaded rear axle. Reserve
    // lateral capacity for steering instead of hiding a spin by cutting lock.
    const frontBrake = Math.min(brakeDemand*c.brakes.frontBias,frontLoad*this.grip*.90);
    const rearBrake = Math.min(brakeDemand*(1-c.brakes.frontBias),rearLoad*this.grip*.80);
    const brake = frontBrake+rearBrake;
    // Handbrake acts solely on rear wheels. At rest, it firmly holds the vehicle on slopes.
    // In motion, dynamic rear braking allows the rear to slip and preserve momentum.
    const isStationary = speed < .5;
    const handbrake = this.input.handbrake * (isStationary ? Math.min(c.brakes.handbrakeForce, normalLoad*this.grip) : Math.min(c.brakes.handbrakeForce*0.40, rearLoad*this.grip*0.70));
    const offRoad = Math.abs(this.offset)>ROAD_HALF+1.5 && !(Math.abs(this.s-station)<65 && this.offset>0);
    const drag = .5*1.225*c.dragArea*speed*speed;
    const resistance = normalLoad*(c.rollingResistance+(offRoad?.11:0));
    const gravity = mass*g*Math.sin(this.surfacePitch);
    const engineBrake = c.engine.engineBraking*(1-this.throttle)*clamp(speed/4,0,1);
    const resistanceForce = brake+handbrake+drag+resistance+engineBrake;
    const appliedForce = drive-gravity;
    const oldSpeed = this.speed;
    // Friction may hold the car at rest against gravity; it must never launch
    // it in the opposite direction. Forward torque still works during rollback.
    if (speed<.05 && Math.abs(appliedForce)<=resistanceForce) this.speed=0;
    else {
      const direction=Math.sign(oldSpeed)||Math.sign(appliedForce);
      this.speed=clamp(oldSpeed+(appliedForce-direction*resistanceForce)/mass*dt,-9,c.engine.maxSpeed);
      if (oldSpeed*this.speed<0 && Math.abs(appliedForce)<=resistanceForce) this.speed=0;
    }
    if (this.refueling) this.speed = 0;
    this.acceleration = damp(this.acceleration,(this.speed-oldSpeed)/dt,12,dt);

    const lf = c.wheelbase*(1-c.frontWeight), lr = c.wheelbase*c.frontWeight;
    const travelSign = this.speed<0?-1:1;
    const denominator = Math.max(4.5,Math.abs(this.speed));
    const frontSlip = this.steering*travelSign-Math.atan2(this.bodyLateralVelocity+lf*this.yawRate,denominator);
    const rearSlip = -Math.atan2(this.bodyLateralVelocity-lr*this.yawRate,denominator);
    const frontLong = Math.abs(frontDrive)+frontBrake;
    const rearLong = Math.abs(rearDrive)+rearBrake+handbrake;
    const frontCapacity = Math.max(.12,Math.sqrt(Math.max(0,1-Math.pow(frontLong/(frontLoad*this.grip),2))))*frontLoad*this.grip;
    const rearCapacity = Math.max(.12,Math.sqrt(Math.max(0,1-Math.pow(rearLong/(rearLoad*this.grip),2))))*rearLoad*this.grip*lerp(1,c.tires.handbrakeGrip,this.input.handbrake);
    const frontForce = frontCapacity*Math.tanh(c.tires.frontStiffness*frontSlip/frontCapacity);
    const rearForce = rearCapacity*Math.tanh(c.tires.rearStiffness*rearSlip/rearCapacity);
    const blend = clamp((Math.abs(this.speed)-1)/3,0,1);
    const yawAcceleration = (lf*frontForce-lr*rearForce)/c.yawInertia-c.steering.yawDamping*this.yawRate;
    const kinematicYaw = this.speed/c.wheelbase*Math.tan(this.steering);
    this.yawRate = lerp(damp(this.yawRate,kinematicYaw,9,dt),this.yawRate+yawAcceleration*dt,blend);
    const lateralAfterForces=this.bodyLateralVelocity+(frontForce+rearForce)/mass*dt;
    // Rotate BOTH body-velocity components into the new heading. The former
    // v -= yaw*u step omitted the matching u += yaw*v term and created energy
    // indefinitely with W+Space. An exact rotation preserves kinetic energy.
    const turn=this.yawRate*dt,ct=Math.cos(turn),st=Math.sin(turn);
    const dynamicForward=this.speed*ct+lateralAfterForces*st;
    const dynamicSide=lateralAfterForces*ct-this.speed*st;
    this.bodyLateralVelocity=lerp(damp(this.bodyLateralVelocity,kinematicYaw*lr,9,dt),dynamicSide,blend);
    this.speed=lerp(this.speed,dynamicForward,blend);
    if (Math.abs(this.speed)<.05) { this.yawRate=damp(this.yawRate,0,20,dt); this.bodyLateralVelocity=damp(this.bodyLateralVelocity,0,20,dt); }
    this.lateralAcceleration = damp(this.lateralAcceleration,(frontForce+rearForce)/mass,10,dt);
    this.slip = damp(this.slip, clamp(Math.max(Math.abs(frontSlip),Math.abs(rearSlip))/.22,0,1),8,dt);
    const oldRoadHeading = this.road.heading(this.s);
    this.heading += this.yawRate*dt;
    const forwardTravel=this.speed*Math.cos(this.surfacePitch)-this.bodyLateralVelocity*Math.sin(this.surfaceRoll)*Math.sin(this.surfacePitch);
    const sideTravel=this.bodyLateralVelocity*Math.cos(this.surfaceRoll);
    this.lateralVelocity = forwardTravel*Math.sin(this.heading)+sideTravel*Math.cos(this.heading);
    this.offset += this.lateralVelocity*dt;
    this.s = Math.max(0,this.s+(forwardTravel*Math.cos(this.heading)-sideTravel*Math.sin(this.heading))*dt/Math.hypot(1,this.road.slope(this.s)));
    this.heading -= this.road.heading(this.s)-oldRoadHeading;
    this.heading = Math.atan2(Math.sin(this.heading),Math.cos(this.heading));
    const limit = (this.road.isBridge(this.s)||this.road.isTunnel(this.s)) ? ROAD_HALF-this.collisionExtents().halfWidth : 75;
    if (Math.abs(this.offset)>limit) {
      this.offset = Math.sign(this.offset)*limit;
      this.bodyLateralVelocity *= .15; this.yawRate *= .25;
      if (this.collisionTimer===0 && Math.abs(this.speed)>2) this.collide(damageEnabled,.35);
    }
    const previousHeight=this.height;
    this.sampleSurface(); this.suspension(dt,(this.height-previousHeight)/dt);
    this.wheelSpin -= this.speed*dt/c.wheelRadius;
    this.wheelSpin = Math.atan2(Math.sin(this.wheelSpin),Math.cos(this.wheelSpin));
    for(let i=0;i<4;i++) {
      const [x,,z]=c.wheelPositions[i],angle=wheelSteeringAngle(c,this.steering,i);
      const wheelSpeed=(this.speed-this.yawRate*x)*Math.cos(angle)+(this.bodyLateralVelocity-this.yawRate*z)*Math.sin(angle);
      this.wheelSpins[i]-=wheelSpeed*dt/c.wheelRadius;
      this.wheelSpins[i]=Math.atan2(Math.sin(this.wheelSpins[i]),Math.cos(this.wheelSpins[i]));
    }
    const traveled = Math.hypot(this.speed,this.bodyLateralVelocity)*dt;
    this.distance += traveled; this.cleanDistance += traveled;
    if (fuelEnabled&&!this.refueling) {
      const kmh=Math.abs(this.speed)*3.6;
      const base=this.config.fuel.baselineLitresPer100Km/100000;
      const load=1+this.throttle*this.config.fuel.loadMultiplier;
      const highSpeed=1+Math.pow(Math.max(0,kmh-this.config.fuel.referenceSpeedKmh)/Math.max(1,this.config.fuel.referenceSpeedKmh),2)*this.config.fuel.highSpeedMultiplier;
      const idle=kmh<1?this.config.fuel.idleLitresPerHour/3600*dt:0;
      this.fuelLevelLitres=Math.max(0,this.fuelLevelLitres-traveled*base*load*highSpeed-idle);
    }
  }
  private steeringLimit(speed: number) {
    const points=this.config.steering.maxAngleBySpeed;
    if(speed<=points[0][0])return points[0][1];
    for(let i=1;i<points.length;i++){
      const [a,va]=points[i-1],[b,vb]=points[i];
      if(speed<=b)return lerp(va,vb,(speed-a)/Math.max(.0001,b-a));
    }
    return points[points.length-1][1];
  }
  ground(s: number, offset: number) {
    const p = this.road.point(s,offset), station = this.road.station(s-50);
    if (this.road.isBridge(s)||this.road.isTunnel(s)||(Math.abs(s-station)<65&&offset>0)) return p.y;
    return lerp(p.y,this.road.terrain(s,offset),clamp((Math.abs(offset)-9)/3,0,1));
  }
  private sampleSurface() {
    const cos=Math.cos(this.heading),sin=Math.sin(this.heading), arc=Math.hypot(1,this.road.slope(this.s));
    const cp=Math.cos(this.surfacePitch),sp=Math.sin(this.surfacePitch),cr=Math.cos(this.surfaceRoll),sr=Math.sin(this.surfaceRoll);
    let height=0;
    for(let i=0;i<4;i++){
      const [x,,z]=this.config.wheelPositions[i];
      const px=x*cr,pz=x*sr*sp+z*cp;
      const y=this.ground(this.s+(-pz*cos-px*sin)/arc,this.offset-pz*sin+px*cos);
      this.wheelHeights[i]=y;height+=y;
    }
    this.height=height/4;
    this.surfacePitch=Math.asin(clamp((this.wheelHeights[0]+this.wheelHeights[1]-this.wheelHeights[2]-this.wheelHeights[3])/(2*this.config.wheelbase),-.95,.95));
    this.surfaceRoll=Math.asin(clamp((this.wheelHeights[1]+this.wheelHeights[3]-this.wheelHeights[0]-this.wheelHeights[2])/(2*this.config.trackWidth*Math.cos(this.surfacePitch)),-.95,.95));
  }
  private suspension(dt: number, groundVelocity: number) {
    const c=this.config,s=c.suspension;
    const rollTarget=clamp(this.lateralAcceleration*c.mass*c.centerOfGravity/s.rollStiffness,-.09,.09);
    const pitchTarget=clamp(this.acceleration*c.mass*c.centerOfGravity/s.pitchStiffness,-.055,.045);
    this.rollVelocity+=((rollTarget-this.roll)*s.rollStiffness-this.rollVelocity*s.damping*3)/1000*dt;
    this.pitchVelocity+=((pitchTarget-this.pitch)*s.pitchStiffness-this.pitchVelocity*s.damping*4)/2100*dt;
    this.roll+=this.rollVelocity*dt;this.pitch+=this.pitchVelocity*dt;
    this.roll=clamp(this.roll,-.09,.09);this.pitch=clamp(this.pitch,-.055,.055);
    // A damper acts between the chassis and moving wheel contacts. Damping the
    // absolute vertical speed pins the body at full compression on every hill.
    this.heaveVelocity+=((this.height-this.sprungHeight)*s.stiffness*4-(this.heaveVelocity-groundVelocity)*s.damping*4)/c.mass*dt;
    this.sprungHeight+=this.heaveVelocity*dt;
    this.heave=clamp(this.sprungHeight-this.height,-s.travel,s.travel);
    if(Math.abs(this.heave)>=s.travel && Math.sign(this.heaveVelocity-groundVelocity)===Math.sign(this.heave))this.heaveVelocity=groundVelocity;
    this.sprungHeight=this.height+this.heave;
  }
  collisionExtents() {
    const c=this.config.collider,cos=Math.abs(Math.cos(this.heading)),sin=Math.abs(Math.sin(this.heading));
    return {halfLength:(c.length*cos+c.width*sin)/2,halfWidth:(c.width*cos+c.length*sin)/2};
  }
  collide(damageEnabled: boolean, intensity=1) {
    if (this.collisionTimer>0) return;
    this.speed*=Math.max(.12,1-clamp(intensity,0,2)*.65);
    this.bodyLateralVelocity*=.3; this.yawRate*=.3;
    if (damageEnabled) this.damage=Math.min(100,this.damage+10*intensity);
    this.collisionTimer=.9; this.cleanDistance=0;
  }
  private writePose(target: VehiclePose) {
    target.s=this.s;target.offset=this.offset;target.heading=this.heading;target.height=this.height;target.steering=this.steering;
    target.surfacePitch=this.surfacePitch;target.surfaceRoll=this.surfaceRoll;target.roll=this.roll;target.pitch=this.pitch;target.heave=this.heave;target.wheelSpin=this.wheelSpin;
    for(let i=0;i<4;i++){target.wheelHeights[i]=this.wheelHeights[i];target.wheelSpins[i]=this.wheelSpins[i];}
  }
  pose(): VehiclePose {
    const p={...this.currentPose,wheelHeights:[0,0,0,0],wheelSpins:[0,0,0,0]};this.writePose(p);return p;
  }
  interpolate(alpha: number): VehiclePose {
    const a=this.previousPose,b=this.currentPose,t=clamp(alpha,0,1),v=this.interpolatedPose;this.writePose(b);
    for (const key of ['s','offset','height','steering','surfacePitch','surfaceRoll','roll','pitch','heave'] as const) v[key]=lerp(a[key],b[key],t);
    v.heading=angleLerp(a.heading,b.heading,t); v.wheelSpin=angleLerp(a.wheelSpin,b.wheelSpin,t);
    for(let i=0;i<4;i++){v.wheelHeights[i]=lerp(a.wheelHeights[i],b.wheelHeights[i],t);v.wheelSpins[i]=angleLerp(a.wheelSpins[i],b.wheelSpins[i],t);}
    return v;
  }
}
