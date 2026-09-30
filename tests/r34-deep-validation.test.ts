import test from 'node:test';
import assert from 'node:assert/strict';
import { Road } from '../src/road/Road.ts';
import { VehiclePhysics, emptyControls } from '../src/vehicle/VehiclePhysics.ts';
import { createVehicleConfig } from '../src/vehicle/VehicleConfig.ts';
import { PlayerVehicleModel } from '../src/vehicle/PlayerVehicleModel.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFileSync } from 'node:fs';

globalThis.self ??= globalThis as any;
globalThis.createImageBitmap ??= (async () => ({ width: 1, height: 1, close() {} })) as any;
globalThis.ProgressEvent ??= class extends Event {} as any;

class InclineRoad extends Road {
  constructor(private gradeValue: number) { super(1616); }
  override grade() { return this.gradeValue; }
  override slope() { return this.gradeValue; }
  override bank() { return 0; }
  override terrain() { return 0; }
  override isBridge() { return false; }
  override isTunnel() { return false; }
}

const makeCar = (kmh = 0, grade = 0) => {
  const p = new VehiclePhysics(new InclineRoad(grade));
  p.offset = 0;
  p.speed = kmh / 3.6;
  p.gear = kmh >= 100 ? 3 : 1;
  return p;
};

function drive(car: VehiclePhysics, seconds: number, input: (t: number) => any, hz = 120) {
  for (let i = 0; i < seconds * hz; i++) {
    car.update(1 / hz, { ...emptyControls(), ...input(i / hz) }, 0, 0, false, false);
  }
}

// 1. A/D Steering Testing Matrix across 10, 30, 60, 100, 130, 160 km/h
test('A/D Steering Matrix: tap, sustained, release-to-center, and A->D flick', () => {
  const speeds = [10, 30, 60, 100, 130, 160];
  for (const kmh of speeds) {
    // A) Short Tap (0.15s)
    const tapCar = makeCar(kmh);
    drive(tapCar, 0.15, () => ({ right: true }));
    assert.ok(tapCar.steering > 0 && Number.isFinite(tapCar.steering));
    drive(tapCar, 2.5, () => ({}));
    assert.ok(Math.abs(tapCar.yawRate) < 0.001, `Yaw must settle after tap at ${kmh} km/h`);
    assert.ok(Math.abs(tapCar.steering) < 0.001, `Steering rack returns to center at ${kmh} km/h`);

    // B) Sustained Steer (1.2s)
    const susCar = makeCar(kmh);
    drive(susCar, 1.2, () => ({ right: true }));
    assert.ok(susCar.offset > 0.15, `Car must achieve lateral displacement under sustained steer at ${kmh} km/h`);
    assert.ok(Math.abs(susCar.roll) <= 0.095, `Roll within suspension bounds at ${kmh} km/h`);

    // C) Quick A -> D Flick (0.5s A then 0.8s D)
    const flickCar = makeCar(kmh);
    drive(flickCar, 0.5, () => ({ left: true }));
    assert.ok(flickCar.heading < 0, `Initial flick must rotate heading left at ${kmh} km/h`);
    drive(flickCar, 0.8, () => ({ right: true }));
    assert.ok(flickCar.yawRate > 0, `Counter flick must redirect yaw rate rightward at ${kmh} km/h`);
    drive(flickCar, 2.5, () => ({}));
    assert.ok(Math.abs(flickCar.yawRate) < 0.005, `Flick must settle cleanly without oscillation at ${kmh} km/h`);
  }
});

// 2. Wheel Kinematics & 4-Wheel Contact Rig Verification
test('R34 Wheel Kinematics: Ackermann geometry, camber, and spin axes', async () => {
  const config = createVehicleConfig();
  const bytes = readFileSync(new URL('../public/models/r34/r34.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = new PlayerVehicleModel(config);
  model.attach(gltf.scene);

  const car = makeCar(60);
  drive(car, 1.0, () => ({ throttle: true, right: true }));
  const pose = car.pose();
  model.animate(pose, car.speed, 0, 0);

  // Front wheels steer, rear wheels do not steer
  const frontLeftSteer = model.steer[0].rotation.y;
  const frontRightSteer = model.steer[1].rotation.y;
  const rearLeftSteer = model.steer[2].rotation.y;
  const rearRightSteer = model.steer[3].rotation.y;

  assert.equal(rearLeftSteer, 0, 'Rear left wheel must not steer');
  assert.equal(rearRightSteer, 0, 'Rear right wheel must not steer');
  assert.ok(Math.abs(frontLeftSteer) > 0, 'Front left wheel must steer');
  assert.ok(Math.abs(frontRightSteer) > 0, 'Front right wheel must steer');
  assert.ok(frontRightSteer < frontLeftSteer, 'Ackermann: inside wheel must turn at sharper angle than outside wheel');

  // Wheel spin rotation around X axis
  for (let i = 0; i < 4; i++) {
    assert.ok(Number.isFinite(model.wheels[i].rotation.x), `Wheel ${i} must spin around X axis`);
  }

  // Suspension travel within physical limits
  for (let i = 0; i < 4; i++) {
    const travel = model.steer[i].position.y - config.wheelPositions[i][1];
    assert.ok(Math.abs(travel) <= config.suspension.travel + 0.001, `Wheel ${i} suspension travel within bounds`);
  }
});

// 3. AGGRESSIVE W + SPACE STRESS TEST
test('Aggressive W + Space / Handbrake Stress Test: energy conservation and zero launch', () => {
  const testConditions = [
    { name: 'Stationary launch abuse', kmh: 0, duration: 8, inputs: () => ({ throttle: true, handbrake: true }) },
    { name: 'Accelerating handbrake grab', kmh: 50, duration: 6, inputs: () => ({ throttle: true, handbrake: true }) },
    { name: 'Highway handbrake lock (140 km/h)', kmh: 140, duration: 6, inputs: () => ({ throttle: true, handbrake: true }) },
    { name: 'W + Space + Violent Slalom (rapid A/D)', kmh: 90, duration: 6, inputs: (t: number) => ({ throttle: true, handbrake: true, right: Math.sin(t * 8) > 0, left: Math.sin(t * 8) <= 0 }) },
    { name: 'W + Space on 12% steep incline', kmh: 30, grade: 0.12, duration: 6, inputs: () => ({ throttle: true, handbrake: true }) },
  ];

  for (const cond of testConditions) {
    const car = makeCar(cond.kmh, cond.grade || 0);
    let maxLateralSpd = 0;
    let maxHeave = 0;

    drive(car, cond.duration, t => {
      maxLateralSpd = Math.max(maxLateralSpd, Math.abs(car.bodyLateralVelocity));
      maxHeave = Math.max(maxHeave, Math.abs(car.heave));
      assert.ok(Number.isFinite(car.speed) && Number.isFinite(car.bodyLateralVelocity), 'Velocities must stay finite');
      assert.ok(Number.isFinite(car.yawRate) && Math.abs(car.yawRate) < 5.0, 'Yaw rate must not spin out of control');
      assert.ok(car.height > -10 && car.height < 50, 'Car must not penetrate terrain or fly into space');
      return cond.inputs(t);
    });

    // Verification: Handbrake must not inject kinetic energy or runaway sideways speed
    assert.ok(maxLateralSpd <= 15.0, `${cond.name}: Sideways velocity is strictly bounded`);
    assert.ok(maxHeave <= 0.13, `${cond.name}: Suspension heave stays within spring bounds`);
    assert.ok(car.engineLoad <= 0.001, `${cond.name}: Engine load is completely interlocked while handbrake is held`);
  }
});

// 4. Hill Climbing & Slope Torque Handling
test('Hill Climbing: launch on 8% and 12% grade, stop, hold, and resume', () => {
  for (const grade of [0.05, 0.08, 0.12]) {
    const car = makeCar(0, grade);

    // Launch from standstill on slope
    drive(car, 3.0, () => ({ throttle: true }));
    assert.ok(car.speed > 5.0, `Car must accelerate uphill on ${(grade * 100).toFixed(0)}% grade`);
    assert.equal(car.driveDirection, 1, 'Drive direction stays forward');

    // Brake to a stop and hold with handbrake
    const stopS = car.s;
    drive(car, 3.0, () => ({ brake: true, handbrake: true }));
    assert.ok(Math.abs(car.speed) < 0.01, `Car comes to complete stop on slope`);

    // Release handbrake and re-apply throttle
    drive(car, 3.0, () => ({ throttle: true }));
    assert.ok(car.s > stopS + 5, `Car resumes forward climbing without rolling backwards into reverse`);
  }
});
