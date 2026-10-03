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

export interface WheelTelemetry {
  speed: number;
  groundSpeed: number;
  slipRatio: number;
  slipAngle: number;
  normalLoad: number;
  fx: number;
  fy: number;
  combinedForce: number;
  capacity: number;
}

export type DynamicState = 'GRIP' | 'SCRUB' | 'UNDERSTEER' | 'OVERSTEER' | 'DRIFT' | 'SPIN' | 'BURNOUT';
export type DriftPhase = 'NORMAL' | 'INITIATING' | 'SLIDING' | 'RECOVERING';

/** Grounded dynamic vehicle: Pacejka/Dugoff progressive tire forces, combined-slip friction circle,
 * direction-aware reverse kinematics, motorsport TC, and energy-driven thermal slip metrics.
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

  // Dynamic Telemetry & State Classification
  dynamicState: DynamicState = 'GRIP';
  driftPhase: DriftPhase = 'NORMAL';
  driftIntensity = 0;
  driftAngle = 0;
  frontAverageSlip = 0;
  rearAverageSlip = 0;
  drivenWheelSlip = 0;
  drivetrainTorque = 0;
  tcActive = false;
  tcCut = 0;
  absActive = false;
  slipPower = [0, 0, 0, 0];
  smokeEnergy = [0, 0, 0, 0];
  wheelsTelemetry: [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry] = [
    { speed: 0, groundSpeed: 0, slipRatio: 0, slipAngle: 0, normalLoad: 0, fx: 0, fy: 0, combinedForce: 0, capacity: 0 },
    { speed: 0, groundSpeed: 0, slipRatio: 0, slipAngle: 0, normalLoad: 0, fx: 0, fy: 0, combinedForce: 0, capacity: 0 },
    { speed: 0, groundSpeed: 0, slipRatio: 0, slipAngle: 0, normalLoad: 0, fx: 0, fy: 0, combinedForce: 0, capacity: 0 },
    { speed: 0, groundSpeed: 0, slipRatio: 0, slipAngle: 0, normalLoad: 0, fx: 0, fy: 0, combinedForce: 0, capacity: 0 }
  ];

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
    this.slipPower.fill(0); this.smokeEnergy.fill(0); this.tcActive = false; this.tcCut = 0; this.absActive = false;
    this.dynamicState = 'GRIP';
    this.driftPhase = 'NORMAL';
    this.driftIntensity = 0;
    this.driftAngle = 0;
    this.frontAverageSlip = 0;
    this.rearAverageSlip = 0;
    this.drivenWheelSlip = 0;
    this.drivetrainTorque = 0;
    this.refueling = false; this.input.reset(); this.collisionTimer = 1;
    this.previousS = this.s; this.previousOffset = this.offset;
    this.sampleSurface(); this.sampleSurface(); this.sprungHeight = this.height; this.writePose(this.previousPose);
  }
  syncPose(s = this.s, offset = this.offset, heading = this.heading) {
    this.s = Math.max(0, s);
    this.offset = offset;
    this.heading = heading;
    this.speed = 0;
    this.lateralVelocity = 0;
    this.bodyLateralVelocity = 0;
    this.yawRate = 0;
    this.roll = 0;
    this.pitch = 0;
    this.heave = 0;
    this.heaveVelocity = 0;
    this.rollVelocity = 0;
    this.pitchVelocity = 0;
    this.steering = 0;
    this.previousS = this.s;
    this.previousOffset = this.offset;
    this.sampleSurface();
    this.sampleSurface();
    this.sprungHeight = this.height;
    this.writePose(this.previousPose);
    this.writePose(this.currentPose);
    this.writePose(this.interpolatedPose);
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
    
    const lf = c.wheelbase * (1 - c.frontWeight), lr = c.wheelbase * c.frontWeight;
    const isReversingMotion = this.speed < -0.10;
    const bodySlipAngle = Math.atan2(this.bodyLateralVelocity, Math.max(1.0, speed));
    const u = this.input.steering;

    // Normal load calculation with dynamic longitudinal weight transfer
    const normalLoad = mass * g * Math.max(0.2, Math.cos(this.surfacePitch) * Math.cos(this.surfaceRoll));
    const frontLoad = clamp(normalLoad * c.frontWeight - mass * this.acceleration * c.centerOfGravity / c.wheelbase, normalLoad * 0.20, normalLoad * 0.80);
    const rearLoad = normalLoad - frontLoad;

    // Estimated front & rear slip for physical countersteer authority detection
    const estFrontLatVel = this.bodyLateralVelocity + lf * this.yawRate;
    const estFrontSlip = this.steering - Math.atan2(estFrontLatVel, Math.max(2.0, speed));
    const estRearLatVel = this.bodyLateralVelocity - lr * this.yawRate;
    const estRearSlip = -Math.atan2(estRearLatVel, Math.max(2.0, speed));
    this.driftAngle = bodySlipAngle;

    // Continuous Physical Drift State Machine & Hysteresis
    const physicalOversteerMag = Math.max(
      (Math.abs(estRearSlip) - 0.035) / 0.12,
      (Math.abs(bodySlipAngle) - 0.030) / 0.10,
      (Math.abs(this.yawRate) * lr / Math.max(2.0, speed) - 0.03) / 0.10
    );
    const isHandbrakeInitiating = speed > 2.5 && this.input.handbrake > 0.1;
    const isPowerOversteering = speed > 3.5 && this.throttle > 0.5 && Math.abs(u) > 0.15 && Math.abs(estRearSlip) > 0.05;
    const isPhysicallySliding = speed > 2.5 && physicalOversteerMag > 0.05 && (Math.abs(estRearSlip) > Math.abs(estFrontSlip) * 0.65 || Math.abs(bodySlipAngle) > 0.035);

    if (isHandbrakeInitiating) {
      this.driftPhase = 'INITIATING';
      this.driftIntensity = damp(this.driftIntensity, Math.max(0.70, clamp(physicalOversteerMag, 0, 1)), 16, dt);
    } else if (isPhysicallySliding && (this.driftPhase === 'INITIATING' || this.driftPhase === 'SLIDING' || isPowerOversteering || physicalOversteerMag > 0.25)) {
      this.driftPhase = 'SLIDING';
      const throttleSustain = this.throttle > 0.2 ? 0.30 * this.throttle : 0;
      const targetIntensity = clamp(physicalOversteerMag + throttleSustain, 0, 1);
      this.driftIntensity = damp(this.driftIntensity, targetIntensity, 10, dt);
    } else if (this.driftIntensity > 0.04) {
      this.driftPhase = 'RECOVERING';
      const recoveryRate = this.throttle < 0.15 ? 5.8 : lerp(3.8, 1.8, clamp(this.throttle, 0, 1));
      this.driftIntensity = damp(this.driftIntensity, 0, recoveryRate, dt);
    } else {
      this.driftPhase = 'NORMAL';
      this.driftIntensity = 0;
    }

    const isOversteering = (Math.abs(estRearSlip) > 0.04 || Math.abs(bodySlipAngle) > 0.035 || this.driftPhase === 'SLIDING' || this.driftPhase === 'INITIATING' || this.dynamicState === 'DRIFT' || this.dynamicState === 'OVERSTEER') && 
      (Math.abs(estRearSlip) > Math.abs(estFrontSlip) * 0.70 || Math.abs(bodySlipAngle) > 0.035 || this.driftPhase === 'SLIDING' || this.driftPhase === 'INITIATING');
    const isSliding = !isReversingMotion && isOversteering && speed > 2.0;
    
    // Dynamic countersteering detection: driver steers in opposition to current yaw rotation / sideslip
    const isCountersteering = isSliding && (
      (u * this.yawRate < -0.005) ||
      (u * bodySlipAngle > 0.005) ||
      (u * estRearLatVel > 0.005)
    );

    // Front steering authority: normal speed-sensitive curve for highway driving,
    // smoothly expanding up to full physical lock during genuine rear slip/drifting
    const baseLimit = this.steeringLimit(speed);
    const maxPhysicalLock = Math.min(0.60, c.steering.maxAngleBySpeed[0][1]);
    const slideSeverity = Math.max(clamp((Math.abs(estRearSlip) - 0.035) / 0.09, 0, 1), this.driftIntensity);
    const countersteerAuthority = lerp(Math.max(0.50, baseLimit), maxPhysicalLock, Math.max(0.80, slideSeverity));
    this.maxSteeringAngle = isCountersteering ? countersteerAuthority : baseLimit;

    const rackRate = isCountersteering 
      ? Math.max(c.steering.response * 2.0, c.steering.returnRate * 1.8)
      : lerp(c.steering.response, c.steering.highwayResponse, clamp(speed / 30, 0, 1));
    const linW = c.steering.linearWeight ?? 0.90;
    const powW = c.steering.powerWeight ?? 0.10;
    const powExp = c.steering.powerExponent ?? 1.6;
    const precisionInput = Math.sign(u) * (linW * Math.abs(u) + powW * Math.pow(Math.abs(u), powExp));
    this.steering = damp(this.steering, precisionInput * this.maxSteeringAngle, rackRate, dt);
    const station = this.road.station(this.s - 50);
    this.refueling = keys.refuel && Math.abs(this.s - station) < 28 && this.offset > 13 && this.offset < 33 && speed < 0.6;
    if (this.refueling) this.fuelLevelLitres = Math.min(this.config.fuel.tankLitres, this.fuelLevelLitres + dt * this.config.fuel.refuelLitresPerSecond);

    // Forward <-> Reverse Direction Transitions (require intentional stationary hold)
    if (this.driveDirection === -1 && keys.throttle && speed < 0.25) {
      this.driveDirection = 1; this.gear = 1; this.reverseDelay = 0;
    }
    if (this.driveDirection === 1 && keys.brake && speed < 0.25 && !keys.throttle && !keys.handbrake) {
      this.reverseDelay += dt;
    } else if (this.driveDirection === 1) {
      this.reverseDelay = 0;
    }
    if (this.reverseDelay >= c.brakes.reverseDelay) {
      this.driveDirection = -1; this.reverseDelay = 0;
    }

    const reversing = this.driveDirection === -1;
    const powerAvailable = this.fuel > 0 || !fuelEnabled;
    this.throttle = powerAvailable && !this.refueling ? (reversing && !keys.throttle ? this.input.brake : reversing ? 0 : this.input.throttle) : 0;
    this.brakeAmount = this.refueling ? 1 : (reversing ? this.input.throttle : this.input.brake);
    const ratio = (reversing ? c.engine.reverseRatio : c.engine.gears[this.gear - 1]) * c.engine.finalDrive;
    let coupledRpm = speed / c.wheelRadius * ratio * 60 / (Math.PI * 2);
    if (!reversing && this.shiftTimer === 0) {
      if (coupledRpm > c.engine.shiftRpm && this.gear < c.engine.gears.length) { this.gear++; this.shiftTimer = 0.20; }
      else if (coupledRpm < 1800 && this.gear > 1) { this.gear--; this.shiftTimer = 0.16; }
    }
    const actualRatio = (reversing ? c.engine.reverseRatio : c.engine.gears[this.gear - 1]) * c.engine.finalDrive;
    coupledRpm = speed / c.wheelRadius * actualRatio * 60 / (Math.PI * 2);
    
    // Engine RPM & Rev-Limiter Behavior
    const targetRpm = clamp(Math.max(coupledRpm, c.engine.idleRpm + this.throttle * 1400), c.engine.idleRpm, c.engine.redlineRpm + 100);
    this.rpm = damp(this.rpm, targetRpm, 14, dt);
    
    // Rev limiter cut factor: power falls off naturally above redline ceiling
    const overRev = Math.max(0, this.rpm - c.engine.redlineRpm);
    const revCut = clamp(1.0 - overRev / 60, 0, 1);
    
    const torqueShape = (0.72 + 0.28 * Math.sin(Math.PI * clamp(this.rpm / c.engine.redlineRpm, 0, 1))) * revCut;
    const powerForce = c.engine.powerKw * 1000 * c.engine.efficiency / Math.max(6, speed) * revCut;
    const torqueForce = c.engine.torque * torqueShape * actualRatio * c.engine.efficiency / c.wheelRadius;

    // Progressive launch modulation (electro-hydraulic clutch curve)
    const clutch = clamp(0.65 + (speed / 2.5) * 0.35, 0.65, 1.0);

    // Motorsport Traction Control (TC): monitors driven rear-wheel slip and cuts torque during straight wheelspin,
    // but DOES NOT cut torque during intentional drift / powerslides
    const isDrifting = this.driftPhase === 'SLIDING' || this.driftPhase === 'INITIATING' || this.driftIntensity > 0.15 || this.input.handbrake > 0.1;
    const steerActivity = Math.abs(this.steering) / (this.maxSteeringAngle || 0.5);
    const tcThreshold = lerp(0.24, 0.14, clamp(steerActivity * 1.3, 0, 1));
    if (!reversing && this.throttle > 0.1 && !isDrifting && (this.slip > tcThreshold || Math.abs(estRearSlip) > tcThreshold)) {
      this.tcCut = damp(this.tcCut, clamp((Math.max(this.slip, Math.abs(estRearSlip)) - tcThreshold) / 0.25, 0, 0.65), 14, dt);
      this.tcActive = this.tcCut > 0.05;
    } else {
      this.tcCut = damp(this.tcCut, 0, 12, dt);
      this.tcActive = false;
    }

    this.engineLoad = this.throttle * clutch * (1.0 - this.tcCut) * (this.shiftTimer > 0 ? 0.35 : 1) * (1 - this.input.handbrake);
    const rawDriveForce = Math.min(c.engine.maxDriveForce, powerForce, torqueForce) * this.engineLoad * (reversing ? -1 : 1);

    const frontDrive = clamp(rawDriveForce * c.engine.frontDriveShare, -frontLoad * this.grip, frontLoad * this.grip);
    const rearDrive = clamp(rawDriveForce * (1 - c.engine.frontDriveShare), -rearLoad * this.grip * 0.96, rearLoad * this.grip * 0.96);
    const drive = frontDrive + rearDrive;

    // Motorsport ABS: modulates maximum axle braking to prevent complete wheel lockup
    const brakeDemand = this.brakeAmount * Math.min(c.brakes.force, normalLoad * this.grip);
    const maxFrontBrake = frontLoad * this.grip * 0.92;
    const maxRearBrake = rearLoad * this.grip * 0.88;
    const requestedFrontBrake = brakeDemand * c.brakes.frontBias;
    const requestedRearBrake = brakeDemand * (1 - c.brakes.frontBias);
    
    this.absActive = this.brakeAmount > 0.4 && (requestedFrontBrake > maxFrontBrake || requestedRearBrake > maxRearBrake);
    const frontBrake = Math.min(requestedFrontBrake, maxFrontBrake);
    const rearBrake = Math.min(requestedRearBrake, maxRearBrake);
    const brake = frontBrake + rearBrake;

    // Handbrake acts solely on rear wheels
    const totalSpeed = Math.hypot(this.speed, this.bodyLateralVelocity);
    const isStationary = totalSpeed < 0.5;
    const handbrake = this.input.handbrake * (isStationary ? Math.min(c.brakes.handbrakeForce, rearLoad * this.grip) : Math.min(c.brakes.handbrakeForce, rearLoad * this.grip * 0.92));
    const offRoad = Math.abs(this.offset) > ROAD_HALF + 1.5 && !(Math.abs(this.s - station) < 65 && this.offset > 0);
    const drag = 0.5 * 1.225 * c.dragArea * speed * speed;
    const resistance = normalLoad * (c.rollingResistance + (offRoad ? 0.11 : 0));
    const gravity = mass * g * Math.sin(this.surfacePitch);
    const engineBrake = c.engine.engineBraking * (1 - this.throttle) * clamp(speed / 4, 0, 1);
    const resistanceForce = brake + handbrake + drag + resistance + engineBrake;
    const appliedForce = drive - gravity;
    const oldSpeed = this.speed;

    // Natural speed integration (NO arbitrary speed cap)
    if (speed < 0.05 && Math.abs(appliedForce) <= resistanceForce) this.speed = 0;
    else {
      const direction = Math.sign(oldSpeed) || Math.sign(appliedForce);
      this.speed = oldSpeed + (appliedForce - direction * resistanceForce) / mass * dt;
      if (oldSpeed * this.speed < 0 && Math.abs(appliedForce) <= resistanceForce) this.speed = 0;
    }
    if (this.refueling) this.speed = 0;
    this.acceleration = damp(this.acceleration, (this.speed - oldSpeed) / dt, 12, dt);

    // =========================================================================
    // PHYSICAL TIRE FORCES & COMBINED-SLIP MODEL
    // =========================================================================
    // Front steered axle velocity in wheel-local space
    const vFrontChassisLat = this.bodyLateralVelocity + lf * this.yawRate;
    const vFrontWheelLong = this.speed * Math.cos(this.steering) + vFrontChassisLat * Math.sin(this.steering);
    const vFrontWheelLat = -this.speed * Math.sin(this.steering) + vFrontChassisLat * Math.cos(this.steering);
    
    // Relaxation denominator prevents low-speed division singularity
    const vRef = Math.max(2.0, Math.abs(this.speed));
    const frontSlip = -Math.atan2(vFrontWheelLat, vRef);

    // Rear unsteered axle velocity in wheel-local space
    const vRearChassisLat = this.bodyLateralVelocity - lr * this.yawRate;
    const rearSlip = -Math.atan2(vRearChassisLat, vRef);

    // Combined friction ellipse: shares capacity between Fx and Fy
    const frontLongDemand = Math.abs(frontDrive) + frontBrake;
    const rearLongDemand = Math.abs(rearDrive) + rearBrake + handbrake;
    const frontMaxCapacity = frontLoad * this.grip;
    const rearMaxCapacity = rearLoad * this.grip;

    const rhoXFront = clamp(frontLongDemand / Math.max(1, frontMaxCapacity), 0, 1);
    const rhoXRear = clamp(rearLongDemand / Math.max(1, rearMaxCapacity), 0, 1);

    // Under high longitudinal slip / handbrake, retain a usable sliding lateral friction fraction (38%)
    const frontAvailableCapacity = frontMaxCapacity * Math.max(0.40, Math.sqrt(Math.max(0, 1 - rhoXFront * rhoXFront)));
    const ellipseCapacity = rearMaxCapacity * Math.max(0.38, Math.sqrt(Math.max(0, 1 - rhoXRear * rhoXRear)));

    // Progressive slip-state-dependent rear grip recovery:
    // When Space is released during an established slide, rear grip returns continuously based on physical drift intensity
    // rather than snapping instantly to 100% capacity.
    const progressiveDriftCapacity = rearMaxCapacity * lerp(1.0, 0.54, this.driftIntensity);
    const rearAvailableCapacity = Math.min(ellipseCapacity, progressiveDriftCapacity);

    // Progressive Pacejka/Magic Formula Lateral Force Curve with controlled sliding plateau
    const tireCurve = (slip: number, stiffness: number, capacity: number): number => {
      const alpha = Math.abs(slip);
      const alphaPeak = capacity / Math.max(1000, stiffness);
      const normAlpha = alpha / Math.max(0.001, alphaPeak);

      if (normAlpha <= 1.0) {
        // Pre-peak progressive buildup
        const f = normAlpha * (2.0 - normAlpha);
        return Math.sign(slip) * capacity * f;
      } else {
        // Post-peak controlled sliding plateau (retains ~85% grip for catchable drifting)
        const muSlide = 0.85;
        const f = muSlide + (1.0 - muSlide) * Math.exp(-0.65 * (normAlpha - 1.0));
        return Math.sign(slip) * capacity * f;
      }
    };

    const frontWheelLateralForce = tireCurve(frontSlip, c.tires.frontStiffness, frontAvailableCapacity);
    const rearWheelLateralForce = tireCurve(rearSlip, c.tires.rearStiffness, rearAvailableCapacity);

    // Transform front wheel lateral force from steered wheel space into chassis space:
    // F_chassis_lat = F_wheel_lat * cos(steering)
    const frontForce = frontWheelLateralForce * Math.cos(this.steering);
    const rearForce = rearWheelLateralForce;

    // =========================================================================
    // LOW-SPEED KINEMATIC REGULARIZATION & DYNAMIC INTEGRATION
    // =========================================================================
    // Kinematic Ackermann reference values
    const kinematicYaw = this.speed / c.wheelbase * Math.tan(this.steering);
    const kinematicSideVel = kinematicYaw * lr;

    const aeroYawStabilization = 1.0 + Math.pow(clamp(speed / 24, 0, 3.0), 2) * 0.70;
    const driftYawFactor = lerp(1.0, 0.78, this.driftIntensity);
    const yawAcceleration = (lf * frontForce - lr * rearForce) / c.yawInertia - (c.steering.yawDamping * aeroYawStabilization * driftYawFactor) * this.yawRate;
    const isReversingNow = this.speed < -0.05;
    
    // Smooth transition from low-speed kinematic turning to high-speed dynamic slip physics
    const baseDynamicBlend = isReversingNow 
      ? clamp((totalSpeed - 0.3) / 3.5, 0, 0.30)
      : clamp((totalSpeed - 0.8) / 3.4, 0, 1.0);
    const smoothBlend = baseDynamicBlend * baseDynamicBlend * (3 - 2 * baseDynamicBlend);
    
    // If handbrake or high power slip is applied, allow immediate dynamic breakaway
    const slipTrigger = clamp(Math.max(this.input.handbrake * 0.92, (rhoXRear - 0.85) / 0.15), 0, 1);
    const dynamicBlend = Math.max(smoothBlend, slipTrigger);

    // Update yaw rate
    const dynamicYawRate = this.yawRate + yawAcceleration * dt;
    this.yawRate = lerp(damp(this.yawRate, kinematicYaw, isReversingNow ? 16 : 14, dt), dynamicYawRate, dynamicBlend);

    // Update chassis velocity in rotating body reference frame
    const lateralAfterForces = this.bodyLateralVelocity + (frontForce + rearForce) / mass * dt;
    const turn = this.yawRate * dt, ct = Math.cos(turn), st = Math.sin(turn);
    const dynamicForward = this.speed * ct + lateralAfterForces * st;
    const dynamicSide = lateralAfterForces * ct - this.speed * st;

    this.bodyLateralVelocity = lerp(damp(this.bodyLateralVelocity, kinematicSideVel, isReversingNow ? 16 : 14, dt), dynamicSide, dynamicBlend);
    this.speed = lerp(this.speed, dynamicForward, dynamicBlend);

    if (totalSpeed < 0.20 && this.input.handbrake < 0.1 && Math.abs(this.throttle) < 0.1) { 
      this.yawRate = damp(this.yawRate, 0, 16, dt); 
      this.bodyLateralVelocity = damp(this.bodyLateralVelocity, 0, 16, dt); 
    }
    this.lateralAcceleration = damp(this.lateralAcceleration, (frontForce + rearForce) / mass, 10, dt);
    
    // Overall vehicle slip index
    const totalSlipAngle = Math.hypot(frontSlip, rearSlip);
    this.slip = damp(this.slip, clamp(totalSlipAngle / 1.5, 0, 1), 8, dt);
    this.frontAverageSlip = frontSlip;
    this.rearAverageSlip = rearSlip;
    this.driftAngle = bodySlipAngle;
    this.drivetrainTorque = rawDriveForce * c.wheelRadius;

    // =========================================================================
    // PER-WHEEL TELEMETRY & EMISSIONS (SLIP POWER & SMOKE ENERGY)
    // =========================================================================
    const wSpeeds = [speed, speed, speed + (this.engineLoad > 0.4 ? speed * 0.15 + 0.5 : 0), speed + (this.engineLoad > 0.4 ? speed * 0.15 + 0.5 : 0)];
    const wNormals = [frontLoad * 0.5, frontLoad * 0.5, rearLoad * 0.5, rearLoad * 0.5];
    const wCapacities = [frontMaxCapacity * 0.5, frontMaxCapacity * 0.5, rearMaxCapacity * 0.5, rearMaxCapacity * 0.5];
    const wFx = [frontDrive * 0.5 - frontBrake * 0.5, frontDrive * 0.5 - frontBrake * 0.5, rearDrive * 0.5 - (rearBrake + handbrake) * 0.5, rearDrive * 0.5 - (rearBrake + handbrake) * 0.5];
    const wFy = [frontWheelLateralForce * 0.5, frontWheelLateralForce * 0.5, rearWheelLateralForce * 0.5, rearWheelLateralForce * 0.5];
    const wAlphas = [frontSlip, frontSlip, rearSlip, rearSlip];
    const wSlips = [
      Math.abs(vFrontWheelLat),
      Math.abs(vFrontWheelLat),
      Math.abs(vRearChassisLat),
      Math.abs(vRearChassisLat)
    ];

    for (let w = 0; w < 4; w++) {
      const slidingVelocity = wSlips[w];
      const frictionMagnitude = Math.hypot(wFx[w], wFy[w]);
      this.slipPower[w] = frictionMagnitude * slidingVelocity;
      
      // Thermal smoke energy accumulator: accumulates during slip, decays when gripped
      if (this.slip > 0.24 || Math.abs(wAlphas[w]) > 0.14) {
        this.smokeEnergy[w] = Math.min(4.0, this.smokeEnergy[w] + this.slipPower[w] * dt * 0.0004);
      } else {
        this.smokeEnergy[w] = Math.max(0, this.smokeEnergy[w] - 2.5 * dt);
      }

      this.wheelsTelemetry[w] = {
        speed: wSpeeds[w],
        groundSpeed: speed,
        slipRatio: (wSpeeds[w] - speed) / Math.max(1.0, speed),
        slipAngle: wAlphas[w],
        normalLoad: wNormals[w],
        fx: wFx[w],
        fy: wFy[w],
        combinedForce: frictionMagnitude,
        capacity: wCapacities[w]
      };
    }
    this.drivenWheelSlip = Math.max(Math.abs(this.wheelsTelemetry[2].slipRatio), Math.abs(this.wheelsTelemetry[3].slipRatio));

    // Dynamic State Classification
    if (speed < 1.0 && this.throttle > 0.7 && this.rpm > 4500) {
      this.dynamicState = 'BURNOUT';
    } else if (Math.abs(bodySlipAngle) > 0.65 || Math.abs(this.yawRate) > 1.8) {
      this.dynamicState = 'SPIN';
    } else if (isCountersteering || (speed > 3.0 && (Math.abs(bodySlipAngle) > 0.04 || Math.abs(rearSlip) > 0.08) && (this.slip > 0.08 || Math.abs(rearSlip) > 0.10))) {
      this.dynamicState = 'DRIFT';
    } else if (Math.abs(rearSlip) > Math.abs(frontSlip) + 0.03 && this.slip > 0.06) {
      this.dynamicState = 'OVERSTEER';
    } else if (Math.abs(frontSlip) > Math.abs(rearSlip) + 0.03 && this.slip > 0.06 && u * this.yawRate >= 0) {
      this.dynamicState = 'UNDERSTEER';
    } else if (this.slip > 0.03 || Math.abs(frontSlip) > 0.04 || Math.abs(rearSlip) > 0.04) {
      this.dynamicState = 'SCRUB';
    } else {
      this.dynamicState = 'GRIP';
    }

    const oldRoadHeading = this.road.heading(this.s);
    this.heading += this.yawRate*dt;
    const forwardTravel=this.speed*Math.cos(this.surfacePitch)-this.bodyLateralVelocity*Math.sin(this.surfaceRoll)*Math.sin(this.surfacePitch);
    const sideTravel=this.bodyLateralVelocity*Math.cos(this.surfaceRoll);
    this.lateralVelocity = forwardTravel*Math.sin(this.heading)+sideTravel*Math.cos(this.heading);
    this.offset += this.lateralVelocity*dt;
    this.s = Math.max(0,this.s+(forwardTravel*Math.cos(this.heading)-sideTravel*Math.sin(this.heading))*dt/Math.hypot(1,this.road.slope(this.s)));
    this.heading -= this.road.heading(this.s)-oldRoadHeading;
    this.heading = Math.atan2(Math.sin(this.heading),Math.cos(this.heading));
    const halfW = this.collisionExtents().halfWidth;
    const side = (this.offset >= 0 ? 1 : -1) as -1 | 1;
    const hasBarrier = this.road.hasGuardrail(this.s, side);
    const railBoundary = 8.85 - halfW;
    const maxOffset = hasBarrier ? railBoundary : 75;

    if (Math.abs(this.offset) > maxOffset) {
      const vLat = this.lateralVelocity;
      const vImpact = side * vLat;

      if (hasBarrier) {
        // Strict physical barrier constraint - no tunneling
        this.offset = side * railBoundary;

        if (vImpact > 0) {
          if (vImpact < 2.2 && Math.abs(this.heading) < 0.22) {
            // Shallow scrape: slides smoothly along barrier with drag and rail alignment
            this.speed *= Math.max(0.82, 1.0 - 0.40 * dt);
            this.lateralVelocity = 0;
            this.bodyLateralVelocity = damp(this.bodyLateralVelocity, 0, 18, dt);
            this.heading = damp(this.heading, 0, 14, dt);
            if (this.collisionTimer === 0 && Math.abs(this.speed) > 3) this.collide(damageEnabled, 0.12);
          } else {
            // Angled collision: inelastic rebound, energy dissipation, yaw deflection
            this.speed = this.speed * Math.max(0.35, 1.0 - vImpact * 0.07);
            const yawDeflect = -side * Math.sign(this.speed || 1) * clamp(vImpact * 0.42, 0.4, 2.8);
            this.yawRate = damp(this.yawRate + yawDeflect, 0, 7, dt);
            this.heading += -side * 0.04;
            if (this.collisionTimer === 0 && Math.abs(this.speed) > 2) {
              this.collide(damageEnabled, clamp(vImpact / 5, 0.25, 1.8));
            }
          }
        }
      } else {
        this.offset = side * 75;
        this.bodyLateralVelocity *= .15; this.yawRate *= .25;
        if (this.collisionTimer === 0 && Math.abs(this.speed) > 2) this.collide(damageEnabled, .35);
      }
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
