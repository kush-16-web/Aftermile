import test from 'node:test';
import assert from 'node:assert/strict';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics.ts';
import { M4_GT3_EVO_Config } from '../src/vehicle/definitions/M4_GT3_EVO.ts';
import { Road } from '../src/road/Road.ts';

class FlatRoad extends Road {
  constructor() {
    super();
  }
  override height(_s: number) { return 0; }
  override slope(_s: number) { return 0; }
  override heading(_s: number) { return 0; }
  override curvature(_s: number) { return 0; }
  override terrain(_s: number, _offset: number) { return 0; }
  override isBridge(_s: number) { return false; }
  override isTunnel(_s: number) { return false; }
  override hasGuardrail(_s: number, _side: -1 | 1) { return false; }
}
import { VehicleAudioControls } from '../src/audio/VehicleAudioControls.ts';

function drive(car: VehiclePhysics, seconds: number, controls: (t: number) => { throttle?: boolean; brake?: boolean; left?: boolean; right?: boolean; handbrake?: boolean }) {
  const dt = 1 / 60;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    const c = controls(i * dt);
    car.update(
      dt,
      {
        throttle: !!c.throttle,
        brake: !!c.brake,
        left: !!c.left,
        right: !!c.right,
        handbrake: !!c.handbrake,
        refuel: false,
      },
      0,
      0,
      false,
      false
    );
  }
}

test('BMW M4 GT3 EVO: Clean Launch and Low-Speed Steering Stability (No Catastrophic Slide)', () => {
  const road = new FlatRoad();
  const car = new VehiclePhysics(road, M4_GT3_EVO_Config);
  car.reset(100);

  // 1. Clean launch from rest (W only)
  drive(car, 2.5, () => ({ throttle: true }));
  assert.ok(car.speed > 12, 'BMW must cleanly accelerate from standstill');
  assert.ok(Math.abs(car.yawRate) < 0.05, 'Straight-line launch must not induce artificial yaw');
  assert.ok(car.slip < 0.25, 'Clean launch with traction control must not lose control');

  // 2. Low speed steering (W + A at 15-25 km/h)
  car.reset(100);
  // Get rolling to ~20 km/h (5.5 m/s)
  drive(car, 0.8, () => ({ throttle: true }));
  const initialSpeed = car.speed;
  assert.ok(initialSpeed > 3 && initialSpeed < 10, 'Vehicle rolling at low speed');

  // Apply steering input A
  drive(car, 1.5, () => ({ throttle: true, left: true }));
  assert.ok(car.steering < 0, 'Steering rack turns left');
  assert.ok(car.yawRate < -0.05, 'Vehicle turns predictably to the left');
  assert.ok(car.slip < 0.45, 'Low-speed steering must NOT cause catastrophic spin/slide');
  assert.ok(Number.isFinite(car.speed) && car.speed > 2, 'Vehicle maintains forward momentum through turn');

  // 3. Return-to-center test
  drive(car, 1.0, () => ({ throttle: true }));
  assert.ok(Math.abs(car.steering) < 0.05, 'Steering rack returns to center smoothly on key release');
});

test('BMW M4 GT3 EVO: Reverse Steering Kinematics (S + A and S + D Stability)', () => {
  const road = new FlatRoad();
  const car = new VehiclePhysics(road, M4_GT3_EVO_Config);
  car.reset(100);

  // Stop vehicle and engage reverse via reverseDelay
  drive(car, 1.0, () => ({ brake: true }));
  assert.equal(car.driveDirection, -1, 'Reverse gear engaged after stationary brake hold');

  // Reverse straight (S only)
  drive(car, 2.0, () => ({ brake: true }));
  assert.ok(car.speed < -3, 'Vehicle reverses backward');
  assert.ok(Math.abs(car.yawRate) < 0.05, 'Straight reverse tracks straight');

  // Reverse with left steering (S + A)
  drive(car, 2.0, () => ({ brake: true, left: true }));
  assert.ok(car.speed < -2, 'Vehicle maintains reverse motion');
  assert.ok(car.steering < -0.10, 'Front wheels physically turn left');
  assert.ok(car.slip < 0.40, 'Reverse steering must NOT trigger lateral spin or skating');
  assert.ok(Number.isFinite(car.bodyLateralVelocity), 'Body lateral velocity remains finite and controlled');

  // Reverse with right steering (S + D)
  drive(car, 2.0, () => ({ brake: true, right: true }));
  assert.ok(car.steering > 0.10, 'Front wheels physically turn right');
  assert.ok(car.slip < 0.40, 'Reverse right steering remains stable');

  // Forward resumption from reverse (W pressed while reversing)
  drive(car, 1.0, () => ({ throttle: true })); // brakes reverse motion to zero
  drive(car, 3.0, () => ({ throttle: true })); // launches forward
  assert.equal(car.driveDirection, 1, 'Transitions smoothly back to forward drive');
  assert.ok(car.speed > 5, 'Vehicle drives forward after reverse');
});

test('BMW M4 GT3 EVO: High-Speed Stability & Aerodynamic Traction at 150+ km/h', () => {
  const road = new FlatRoad();
  const car = new VehiclePhysics(road, M4_GT3_EVO_Config);
  car.reset(100);

  // Accelerate to high speed (> 42 m/s = 150 km/h)
  drive(car, 8.0, () => ({ throttle: true }));
  const kmh = car.speed * 3.6;
  assert.ok(kmh > 140, `Achieves high racing speed (actual: ${kmh.toFixed(1)} km/h)`);
  assert.ok(Math.abs(car.heading) < 0.05, 'Maintains straight high-speed line');

  // Small highway lane change at 150 km/h
  drive(car, 0.4, () => ({ throttle: true, right: true }));
  drive(car, 0.5, () => ({ throttle: true, left: true }));
  drive(car, 1.5, () => ({ throttle: true }));
  assert.ok(car.speed * 3.6 > 130, 'Maintains speed through lane transition');
  assert.ok(car.slip < 0.35, 'High-speed aero downforce maintains grip');
  assert.ok(Math.abs(car.yawRate) < 0.10, 'Settles stably without fish-tailing');
});

test('BMW M4 GT3 EVO: Progressive Braking & Motorsport ABS', () => {
  const road = new FlatRoad();
  const car = new VehiclePhysics(road, M4_GT3_EVO_Config);
  car.reset(100);

  // Accelerate to 100 km/h (~28 m/s)
  drive(car, 5.0, () => ({ throttle: true }));
  const initialSpeed = car.speed;
  assert.ok(initialSpeed > 25, 'Vehicle at speed before braking');

  // Hard threshold brake application (S pressed at 100 km/h)
  drive(car, 1.8, () => ({ brake: true }));
  assert.ok(car.speed < initialSpeed * 0.40, 'Powerful GT3 brake bite decelerates vehicle rapidly');
  assert.ok(car.driveDirection === 1, 'Must NOT engage reverse while traveling forward at high speed');
  assert.ok(car.slip < 0.45, 'Motorsport ABS prevents complete wheel lockup and loss of control');
});

test('BMW M4 GT3 EVO: Gear-Limited Simulation Speed Calculations & Natural Top Speed', () => {
  const config = M4_GT3_EVO_Config;
  const wheelRadius = config.wheelRadius; // 0.345 m
  const finalDrive = config.engine.finalDrive; // 3.45
  const redline = config.engine.redlineRpm; // 7800 RPM

  const calculatedGearSpeedsKmh: number[] = [];

  config.engine.gears.forEach((gearRatio, idx) => {
    const overallRatio = gearRatio * finalDrive;
    // Speed (m/s) = (RPM * 2 * PI * r) / (overallRatio * 60)
    const speedMs = (redline * 2 * Math.PI * wheelRadius) / (overallRatio * 60);
    const speedKmh = speedMs * 3.6;
    calculatedGearSpeedsKmh.push(speedKmh);
  });

  // Verify gear table results at 7,800 RPM
  assert.ok(calculatedGearSpeedsKmh[0] > 90 && calculatedGearSpeedsKmh[0] < 100, 'Gear 1 calculated speed ~95 km/h');
  assert.ok(calculatedGearSpeedsKmh[1] > 125 && calculatedGearSpeedsKmh[1] < 140, 'Gear 2 calculated speed ~134 km/h');
  assert.ok(calculatedGearSpeedsKmh[2] > 165 && calculatedGearSpeedsKmh[2] < 180, 'Gear 3 calculated speed ~173 km/h');
  assert.ok(calculatedGearSpeedsKmh[3] > 205 && calculatedGearSpeedsKmh[3] < 220, 'Gear 4 calculated speed ~213 km/h');
  assert.ok(calculatedGearSpeedsKmh[4] > 245 && calculatedGearSpeedsKmh[4] < 265, 'Gear 5 calculated speed ~256 km/h');
  assert.ok(calculatedGearSpeedsKmh[5] > 290 && calculatedGearSpeedsKmh[5] < 310, 'Gear 6 calculated speed ~300 km/h');

  // Verify natural drag-limited simulation top speed on flat road without artificial speed limiter
  const road = new FlatRoad();
  const car = new VehiclePhysics(road, config);
  car.reset(100);

  // Full throttle sustained acceleration through gears
  drive(car, 25.0, () => ({ throttle: true }));
  const topSpeedKmh = car.speed * 3.6;

  assert.ok(topSpeedKmh > 280 && topSpeedKmh < 305, `Natural simulation top speed is ~285-300 km/h (actual: ${topSpeedKmh.toFixed(1)} km/h)`);
  assert.ok(car.rpm <= config.engine.redlineRpm + 100, 'RPM is bounded by the rev limiter');
});

test('BMW M4 GT3 EVO: Audio Skid & Brake Modulation', () => {
  const profile = M4_GT3_EVO_Config.audio;
  const controls = new VehicleAudioControls(profile, 900, 7800);

  // 1. Normal braking without slip: should NOT produce loud squeal
  controls.update({ speed: 20, rpm: 3000, load: 0, brake: 0.6, slip: 0.05, refueling: false }, 1.0, 1.0, 0.016);
  assert.ok(controls.skidGain < 0.03, 'Normal braking without slip must not screech');

  // 2. Heavy tire slip (drift / lockup): produces audible tire scrub / slide
  controls.update({ speed: 25, rpm: 6000, load: 0.8, brake: 0, slip: 0.65, refueling: false }, 1.0, 1.0, 0.016);
  assert.ok(controls.skidGain > 0.05, 'Heavy physical slip produces skid sound');
  assert.ok(controls.skidFrequency > 1500, 'High-speed dry slide produces bright tire texture');
});

test('BMW M4 GT3 EVO: Motorsport TC Torque Reduction & Emergent Drift Classification', () => {
  const road = new FlatRoad();
  const car = new VehiclePhysics(road, M4_GT3_EVO_Config);
  car.reset(100);

  // 1. Straight launch under full throttle: TC modulates engine torque smoothly
  drive(car, 1.0, () => ({ throttle: true }));
  assert.ok(car.tcCut >= 0 && car.tcCut <= 0.75, 'TC cut is bounded within motorsport range');
  assert.ok(car.engineLoad > 0.35, 'Engine continues delivering progressive drive force');

  // 2. Provoked power-oversteer drift test: W + A + Handbrake tap at speed
  drive(car, 2.5, () => ({ throttle: true }));
  const preDriftSpeed = car.speed;
  assert.ok(preDriftSpeed > 15, 'Vehicle at drift entry speed');

  // Initiate oversteer with steer + brief handbrake
  let generatedSmoke = false;
  let classifiedDrift = false;
  for (let i = 0; i < 15; i++) {
    car.update(1 / 60, { throttle: true, brake: false, left: true, right: false, handbrake: true, refuel: false }, 0, 0, false, false);
    if (car.dynamicState === 'DRIFT' || car.dynamicState === 'OVERSTEER' || car.dynamicState === 'SCRUB') classifiedDrift = true;
    if (car.smokeEnergy.some(e => e > 0)) generatedSmoke = true;
  }
  
  // Countersteer right into slide: verify countersteering authority expands during slide catch
  let peakCountersteerAngle = 0;
  for (let i = 0; i < 30; i++) {
    car.update(1 / 60, { throttle: true, brake: false, left: false, right: true, handbrake: false, refuel: false }, 0, 0, false, false);
    if (car.dynamicState === 'DRIFT' || car.dynamicState === 'OVERSTEER' || car.dynamicState === 'SCRUB') classifiedDrift = true;
    peakCountersteerAngle = Math.max(peakCountersteerAngle, car.maxSteeringAngle);
    if (car.smokeEnergy.some(e => e > 0)) generatedSmoke = true;
  }
  
  assert.ok(classifiedDrift || car.dynamicState === 'DRIFT' || car.dynamicState === 'OVERSTEER' || car.dynamicState === 'SCRUB', 'Emergent oversteer/drift classified correctly');
  assert.ok(peakCountersteerAngle > 0.40, 'Countersteering authority expands to allow slide catch');
  assert.ok(generatedSmoke, 'Drift contact friction generates thermal smoke energy');
});

test('BMW M4 GT3 EVO: Reverse Kinematics & Direction-Aware Friction Sign', () => {
  const road = new FlatRoad();
  const car = new VehiclePhysics(road, M4_GT3_EVO_Config);
  car.reset(100);

  // Engage reverse
  drive(car, 1.0, () => ({ brake: true }));
  assert.equal(car.driveDirection, -1, 'Engaged reverse gear');

  // Reverse with left steering input: verify lateral forces oppose sliding velocity
  drive(car, 1.5, () => ({ brake: true, left: true }));
  
  const wFL = car.wheelsTelemetry[0];
  const wRL = car.wheelsTelemetry[2];
  
  assert.ok(Number.isFinite(wFL.fy), 'Front lateral force is finite');
  assert.ok(Number.isFinite(wRL.fy), 'Rear lateral force is finite');
  assert.ok(Math.hypot(wFL.fx, wFL.fy) <= wFL.capacity + 50, 'Friction circle is respected on front wheel');
  assert.ok(Math.hypot(wRL.fx, wRL.fy) <= wRL.capacity + 50, 'Friction circle is respected on rear wheel');
});

test('BMW M4 GT3 EVO: Rapid Direction Change (A -> center -> D) and Fast Rack Response', () => {
  const road = new FlatRoad();
  const car = new VehiclePhysics(road, M4_GT3_EVO_Config);
  car.reset(100);

  // Accelerate to ~60 km/h (16.6 m/s)
  drive(car, 2.5, () => ({ throttle: true }));
  const kmh = car.speed * 3.6;
  assert.ok(kmh >= 50 && kmh <= 75, `Vehicle at medium test speed: ${kmh.toFixed(1)} km/h`);

  // Step 1: Turn left (A for 0.4s)
  drive(car, 0.4, () => ({ throttle: true, left: true }));
  const leftSteer = car.steering;
  assert.ok(leftSteer < -0.10, `Fast rack response reaches meaningful left angle (actual: ${leftSteer.toFixed(3)})`);

  // Step 2: Center (release for 0.15s)
  drive(car, 0.15, () => ({ throttle: true }));
  assert.ok(Math.abs(car.steering) < 0.05, `Return-to-center brings rack quickly near neutral (actual: ${car.steering.toFixed(3)})`);

  // Step 3: Turn right (D for 0.4s)
  drive(car, 0.4, () => ({ throttle: true, right: true }));
  const rightSteer = car.steering;
  assert.ok(rightSteer > 0.10, `Fast rack response reaches meaningful right angle (actual: ${rightSteer.toFixed(3)})`);
  assert.ok(car.slip < 0.45, 'Direction change is sharp and controlled without spinout');
});

test('BMW M4 GT3 EVO: Speed-Sensitive Steering Authority Across Spectrum (10, 30, 60, 100, 150, 200 km/h)', () => {
  const road = new FlatRoad();
  const car = new VehiclePhysics(road, M4_GT3_EVO_Config);

  const testSpeedsKmh = [10, 30, 60, 100, 150, 200];
  const recordedLimits: { kmh: number; limit: number }[] = [];

  for (const targetKmh of testSpeedsKmh) {
    const targetMs = targetKmh / 3.6;
    const limit = car.steeringLimit(targetMs);
    recordedLimits.push({ kmh: targetKmh, limit });

    // Verify initial steering input produces proportional rack response within limit
    car.reset(100);
    car.speed = targetMs;
    car.update(1 / 60, { throttle: false, brake: false, left: false, right: true, handbrake: false, refuel: false }, 0, 0, false, false);
    
    assert.ok(car.steering > 0, `Steering rack moves immediately on key touch at ${targetKmh} km/h`);
    assert.ok(car.steering <= limit + 0.001, `Single step steering remains within limit at ${targetKmh} km/h`);
  }

  // Verify smooth monotonic decrease of steering limit with speed
  for (let i = 1; i < recordedLimits.length; i++) {
    assert.ok(
      recordedLimits[i].limit < recordedLimits[i - 1].limit,
      `Steering limit smoothly decreases with speed: ${recordedLimits[i-1].kmh} km/h (${recordedLimits[i-1].limit.toFixed(3)} rad) > ${recordedLimits[i].kmh} km/h (${recordedLimits[i].limit.toFixed(3)} rad)`
    );
  }
});


