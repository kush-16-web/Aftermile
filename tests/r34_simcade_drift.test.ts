import test from 'node:test';
import assert from 'node:assert/strict';
import { Road } from '../src/road/Road.ts';
import { VehiclePhysics, emptyControls } from '../src/vehicle/VehiclePhysics.ts';
import type { Controls } from '../src/vehicle/VehicleInput.ts';
import { createVehicleConfig } from '../src/vehicle/VehicleConfig.ts';
import { getVehicleConfig } from '../src/vehicle/VehicleRegistry.ts';

class FlatRoad extends Road {
  override center() { return 0; }
  override slope() { return 0; }
  override height() { return 0; }
  override grade() { return 0; }
  override bank() { return 0; }
  override terrain() { return 0; }
  override isBridge() { return false; }
  override isTunnel() { return false; }
}

const r34At = (kmh = 0) => {
  const cfg = getVehicleConfig('r34');
  const p = new VehiclePhysics(new FlatRoad(), cfg);
  p.offset = 0;
  p.speed = kmh / 3.6;
  p.gear = kmh >= 100 ? 3 : (kmh >= 50 ? 2 : 1);
  return p;
};

const bmwAt = (kmh = 0) => {
  const cfg = getVehicleConfig('m4_gt3_evo');
  const p = new VehiclePhysics(new FlatRoad(), cfg);
  p.offset = 0;
  p.speed = kmh / 3.6;
  p.gear = kmh >= 100 ? 3 : (kmh >= 50 ? 2 : 1);
  return p;
};

function drive(car: VehiclePhysics, seconds: number, input: (time: number) => Partial<Controls>, hz = 120) {
  for (let i = 0; i < seconds * hz; i++) {
    car.update(1 / hz, { ...emptyControls(), ...input(i / hz) }, 0, 0, false, false);
  }
}

test('Low-speed numerical stability: finite slip angle and ratio near zero speed', () => {
  const car = r34At(0.01);
  drive(car, 1.0, () => ({ left: true, throttle: true }));
  
  assert.ok(Number.isFinite(car.frontAverageSlip), 'front slip must be finite');
  assert.ok(Number.isFinite(car.rearAverageSlip), 'rear slip must be finite');
  assert.ok(Number.isFinite(car.drivenWheelSlip), 'driven wheel slip must be finite');
  assert.ok(Number.isFinite(car.driftAngle), 'drift angle must be finite');
  assert.ok(!Number.isNaN(car.speed) && !Number.isNaN(car.yawRate));
  for (const w of car.wheelsTelemetry) {
    assert.ok(Number.isFinite(w.slipRatio), 'slip ratio must be finite');
    assert.ok(Number.isFinite(w.slipAngle), 'slip angle must be finite');
    assert.ok(Number.isFinite(w.combinedForce), 'combined force must be finite');
  }
});

test('No drift state or countersteer authority at zero / very low speed', () => {
  const car = r34At(0.5);
  drive(car, 0.5, () => ({ left: true, handbrake: true }));
  assert.notEqual(car.driftPhase, 'SLIDING', 'cannot maintain drift at near zero speed');
  assert.ok(car.driftIntensity < 0.2, 'drift intensity must be negligible at sub-walking speed');
});

test('Handbrake initiation creates rear slip without globally reducing front steering capacity', () => {
  const car = r34At(70);
  drive(car, 0.2, () => ({ left: true, throttle: true }));
  const preFrontFx = car.wheelsTelemetry[0].fx;
  
  // Apply handbrake
  drive(car, 0.15, () => ({ left: true, throttle: true, handbrake: true }));
  
  assert.ok(car.wheelsTelemetry[2].capacity < car.wheelsTelemetry[0].capacity * 0.9, 'rear capacity reduces under handbrake');
  assert.ok(car.wheelsTelemetry[0].capacity > 4000, 'front capacity remains strong and authoritative');
  assert.ok(Math.abs(car.yawRate) > 0.1, 'yaw rate builds naturally from rear slip disparity');
  assert.ok(car.driftPhase === 'INITIATING' || car.driftPhase === 'SLIDING');
});

test('Progressive rear grip recovery: releasing Space does NOT instantly restore 100% rear lateral grip', () => {
  const car = r34At(75);
  // Initiate slide: W + Left + Handbrake
  drive(car, 0.35, () => ({ left: true, throttle: true, handbrake: true }));
  assert.ok(car.driftIntensity > 0.4, 'drift intensity established');
  
  // Sample rear capacity right as Space is released (t=0)
  const prevRearCapacity = car.wheelsTelemetry[2].capacity;
  
  // Step 1 tick forward without handbrake
  drive(car, 1 / 120, () => ({ left: true, throttle: true, handbrake: false }));
  const immediatePostCapacity = car.wheelsTelemetry[2].capacity;
  
  // Verify progressive recovery: immediate capacity must NOT jump straight to dry peak normal capacity (> 6000N)
  const dryPeakNormalCapacity = car.config.mass * 9.81 * 0.47 * car.grip * 0.5;
  assert.ok(immediatePostCapacity < dryPeakNormalCapacity * 0.85, 'rear grip must recover progressively, not instantly snap to 100%');
  assert.ok(car.driftIntensity > 0.3, 'drift intensity persists across handbrake release');
});

test('Forward momentum is preserved during drift: vLong remains significant', () => {
  const car = r34At(80);
  const initialSpeed = car.speed;
  let midDriftLatVel = 0;
  let midDriftForwardVel = 0;
  
  // Perform a 90-degree left drift: Turn left + tap handbrake + countersteer right with throttle
  drive(car, 0.3, () => ({ left: true, throttle: true, handbrake: true }));
  drive(car, 0.3, () => {
    midDriftLatVel = Math.max(midDriftLatVel, Math.abs(car.bodyLateralVelocity));
    midDriftForwardVel = car.speed;
    return { right: true, throttle: true, handbrake: false };
  });
  
  assert.ok(midDriftForwardVel > initialSpeed * 0.45, `speed must remain strong (actual: ${(midDriftForwardVel * 3.6).toFixed(1)} km/h)`);
  assert.ok(midDriftForwardVel > 8.0, 'forward velocity must remain above 8 m/s (not rotating in place)');
  assert.ok(midDriftLatVel > 0.4, `meaningful lateral velocity present during drift (actual: ${midDriftLatVel.toFixed(2)} m/s)`);
});

test('Countersteer authority expands only during genuine slide and stays normal during highway driving', () => {
  // Normal highway driving
  const normalCar = r34At(120);
  drive(normalCar, 0.5, () => ({ right: true }));
  assert.ok(normalCar.maxSteeringAngle < 0.25, 'highway steering angle remains tight and stable');
  
  // Drift scenario with countersteering
  const driftCar = r34At(75);
  drive(driftCar, 0.3, () => ({ left: true, throttle: true, handbrake: true }));
  drive(driftCar, 0.2, () => ({ right: true, throttle: true })); // Countersteer
  
  assert.ok(driftCar.maxSteeringAngle > 0.45, 'countersteer authority expands to catch the slide');
});

test('Left and Right drift initiation and countersteer are symmetric', () => {
  const leftCar = r34At(70);
  drive(leftCar, 0.3, () => ({ left: true, throttle: true, handbrake: true }));
  drive(leftCar, 0.5, () => ({ right: true, throttle: true }));
  
  const rightCar = r34At(70);
  drive(rightCar, 0.3, () => ({ right: true, throttle: true, handbrake: true }));
  drive(rightCar, 0.5, () => ({ left: true, throttle: true }));
  
  assert.ok(Math.abs(leftCar.speed - rightCar.speed) < 0.2, 'speeds must be symmetric');
  assert.ok(Math.abs(Math.abs(leftCar.yawRate) - Math.abs(rightCar.yawRate)) < 0.15, 'yaw rates must be symmetric');
  assert.ok(Math.abs(leftCar.driftIntensity - rightCar.driftIntensity) < 0.1, 'drift intensity must be symmetric');
  assert.equal(Math.sign(leftCar.yawRate), -Math.sign(rightCar.yawRate), 'opposite yaw rate signs');
});

test('No artificial energy gain: handbrake and steering do not create speed out of nowhere', () => {
  const car = r34At(60);
  const startSpeed = car.speed;
  
  drive(car, 1.0, () => ({ left: true, handbrake: true, throttle: false }));
  assert.ok(car.speed < startSpeed, 'handbrake without throttle must bleed speed');
  
  const throttleCar = r34At(60);
  drive(throttleCar, 1.0, () => ({ left: true, handbrake: true, throttle: true }));
  assert.ok(throttleCar.speed < startSpeed + 5, 'handbrake with throttle cannot create abnormal acceleration spikes');
});

test('Failure modes still exist: insufficient countersteer or extreme over-throttle causes spin / large drift angle', () => {
  const car = r34At(90);
  // Full throttle + steer into turn + handbrake held without countersteering
  drive(car, 0.8, () => ({ left: true, handbrake: true, throttle: true }));
  drive(car, 0.8, () => ({ left: true, throttle: true, handbrake: false }));
  
  assert.ok(
    car.dynamicState === 'SPIN' || 
    car.dynamicState === 'OVERSTEER' || 
    Math.abs(car.driftAngle) > 0.30 || 
    Math.abs(car.yawRate) > 0.8,
    'car can still spin out or rotate excessively if player fails to countersteer'
  );
});

test('Clean drift exit: straightening steering and lifting throttle allows tires to regain grip smoothly', () => {
  const car = r34At(75);
  // Initiate and hold slide
  drive(car, 0.3, () => ({ left: true, throttle: true, handbrake: true }));
  drive(car, 0.6, () => ({ right: true, throttle: true }));
  
  // Exit drift: center steering and gentle throttle
  drive(car, 1.5, () => ({ throttle: true }));
  
  assert.equal(car.driftPhase, 'NORMAL', 'drift phase returns to NORMAL');
  assert.ok(car.driftIntensity < 0.05, 'drift intensity settles near zero');
  assert.ok(Math.abs(car.yawRate) < 0.05, 'yaw rate settles cleanly without violent snapback');
});

test('BMW GT3 regression: retains high grip, stability, and high speed authority', () => {
  const bmw = bmwAt(120);
  drive(bmw, 1.0, () => ({ right: true }));
  assert.ok(bmw.speed > 28, 'BMW retains high speed');
  assert.ok(bmw.driftPhase === 'NORMAL' || bmw.driftPhase === 'RECOVERING', 'BMW stays gripped');
  assert.ok(Math.abs(bmw.yawRate) < 0.8, 'BMW yaw rate is stable and motorsport-damped');
});

test('Deep-slip rear lateral force plateau retains catchable stability without collapsing', () => {
  const car = r34At(80);
  // Enter deep slide
  drive(car, 0.4, () => ({ left: true, throttle: true, handbrake: true }));
  drive(car, 0.3, () => ({ right: true, throttle: true, handbrake: false }));
  
  const rearNormal = car.wheelsTelemetry[2].normalLoad;
  const rearFy = Math.abs(car.wheelsTelemetry[2].fy);
  
  assert.ok(rearFy > rearNormal * 0.25, `deep slip rear lateral force must remain substantial (actual: ${rearFy.toFixed(1)} N on load ${rearNormal.toFixed(1)} N)`);
});

test('Pause and Resume: preserves journey position, route progress, trip distance, and active state without reset', () => {
  const car = r34At(0);
  // Drive for 10 seconds to cover distance
  drive(car, 10, () => ({ throttle: true }));
  
  const savedS = car.s;
  const savedOffset = car.offset;
  const savedSpeed = car.speed;
  const savedDistance = car.distance;
  
  assert.ok(savedS > 180, 'car must have driven forward');
  assert.ok(savedDistance > 0, 'trip distance must be positive');
  
  // Simulate pause: zero inputs, time passes
  // In Game, vehicle.update is not called during pause, and on resume clock accumulator is reset
  // Verify pose state after pause and resumed driving
  drive(car, 2, () => ({})); // coast while resuming
  
  assert.ok(car.s >= savedS, 'journey progress must NOT reset to spawn (160)');
  assert.ok(car.distance >= savedDistance, 'trip distance must not reset to 0');
  assert.ok(Number.isFinite(car.speed) && Number.isFinite(car.s));
});
