import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { CameraController } from '../src/vehicle/CameraController.ts';
import { VehiclePhysics, emptyControls } from '../src/vehicle/VehiclePhysics.ts';
import { Road } from '../src/road/Road.ts';
import { R34Config } from '../src/vehicle/definitions/R34.ts';
import { M4_GT3_EVO_Config } from '../src/vehicle/definitions/M4_GT3_EVO.ts';

globalThis.window ??= { addEventListener() {} } as any;

test('Vehicle-specific cockpit configurations are properly defined for both R34 and BMW', () => {
  // R34: Japanese RHD Sports Coupe
  const r34Cockpit = R34Config.camera.cockpit;
  assert.ok(r34Cockpit, 'R34 must have cockpit camera config');
  assert.deepEqual(r34Cockpit.driverEye, [0.355, 1.050, -0.030], 'R34 driver eye position is RHD seated position');
  assert.equal(r34Cockpit.fov, 68, 'R34 cockpit FOV is 68 degrees');
  assert.equal(r34Cockpit.near, 0.05, 'R34 cockpit near plane is 0.05m');

  // BMW M4 GT3 EVO: FIA GT3 LHD Racing Cockpit
  const bmwCockpit = M4_GT3_EVO_Config.camera.cockpit;
  assert.ok(bmwCockpit, 'BMW must have cockpit camera config');
  assert.deepEqual(bmwCockpit.driverEye, [-0.345, 0.965, 0.165], 'BMW driver eye position is LHD GT3 bucket position');
  assert.equal(bmwCockpit.fov, 72, 'BMW cockpit FOV is 72 degrees');
  assert.equal(bmwCockpit.near, 0.05, 'BMW cockpit near plane is 0.05m');

  // Ensure BMW and R34 do not share the same coordinates
  assert.notEqual(r34Cockpit.driverEye[0], bmwCockpit.driverEye[0], 'R34 and BMW driver positions must be vehicle-specific');
});

test('Cockpit camera positions driver head inside R34 cockpit stably under driving conditions', () => {
  const camera = new PerspectiveCamera(70, 16 / 9, 0.08, 5000);
  const canvasStub = { addEventListener() {} } as any;
  const cameras = new CameraController(camera, canvasStub, R34Config);
  cameras.mode = 3; // Cockpit mode

  const road = new Road();
  const car = new VehiclePhysics(road, R34Config);
  car.speed = 28; // ~100 km/h

  let prevY = 0;
  let maxYDelta = 0;

  for (let i = 0; i < 180; i++) {
    car.update(1 / 60, { ...emptyControls(), throttle: 1.0 }, 0, 0, false, false);
    const pose = car.pose();
    cameras.update(1 / 60, i / 60, car, pose, 0, false, 70, 0.5, false);

    const carWorldPos = road.point(pose.s, pose.offset);
    const camPos = camera.position;

    // Camera must stay within natural driver head bounding box relative to car
    assert.ok(camPos.x > carWorldPos.x + 0.15 && camPos.x < carWorldPos.x + 0.55, 'Camera X is within RHD driver zone');
    assert.ok(camPos.y > car.height + 0.90 && camPos.y < car.height + 1.25, 'Camera Y is at driver eye level');

    if (i > 10) {
      const yDelta = Math.abs(camPos.y - prevY);
      maxYDelta = Math.max(maxYDelta, yDelta);
    }
    prevY = camPos.y;
  }

  // Jitter must be absorbed by damping (no frame-to-frame micro spikes > 2cm)
  assert.ok(maxYDelta < 0.025, `Max frame Y delta in cockpit camera must be smooth, got ${maxYDelta}`);
  assert.equal(camera.near, 0.05, 'Camera near plane is set to 0.05 in cockpit mode');
});

test('Cockpit camera positions driver head inside BMW M4 GT3 EVO cockpit stably', () => {
  const camera = new PerspectiveCamera(72, 16 / 9, 0.08, 5000);
  const canvasStub = { addEventListener() {} } as any;
  const cameras = new CameraController(camera, canvasStub, M4_GT3_EVO_Config);
  cameras.mode = 3; // Cockpit mode

  const road = new Road();
  const car = new VehiclePhysics(road, M4_GT3_EVO_Config);
  car.speed = 35; // ~126 km/h

  for (let i = 0; i < 120; i++) {
    car.update(1 / 60, { ...emptyControls(), throttle: 1.0 }, 0, 0, false, false);
    const pose = car.pose();
    cameras.update(1 / 60, i / 60, car, pose, 0, false, 72, 0.5, false);

    const carWorldPos = road.point(pose.s, pose.offset);
    const camPos = camera.position;

    // BMW driver eye is at X = -0.345 (LHD)
    assert.ok(camPos.x < carWorldPos.x - 0.15 && camPos.x > carWorldPos.x - 0.55, 'Camera X is within LHD driver zone');
    assert.ok(camPos.y > car.height + 0.80 && camPos.y < car.height + 1.15, 'Camera Y is at GT3 eye level');
  }

  assert.equal(camera.near, 0.05, 'Camera near plane is 0.05 for BMW cockpit');
});

test('Cockpit camera maintains chassis heading alignment during drift slide and reverse', () => {
  const camera = new PerspectiveCamera(70, 16 / 9, 0.08, 5000);
  const canvasStub = { addEventListener() {} } as any;
  const cameras = new CameraController(camera, canvasStub, R34Config);
  cameras.mode = 3;

  const road = new Road();
  const car = new VehiclePhysics(road, R34Config);

  // Controlled drift condition: vehicle yaw angle offset from road
  car.speed = 22; // ~80 km/h
  for (let i = 0; i < 90; i++) {
    car.update(1 / 60, { ...emptyControls(), throttle: 0.8, right: true, handbrake: i < 15 }, 0, 0, false, false);
    const pose = car.pose();
    cameras.update(1 / 60, i / 60, car, pose, 0, false, 70, 0.5, false);
  }

  // Verify camera looks forward in vehicle chassis direction
  const camDir = new Vector3();
  camera.getWorldDirection(camDir);
  assert.ok(Number.isFinite(camDir.x) && Number.isFinite(camDir.y) && Number.isFinite(camDir.z));
  assert.ok(camDir.z < -0.5, 'Camera looks along chassis forward vector');

  // Reverse condition: reverse gear does not flip camera backwards
  car.speed = -8;
  for (let i = 0; i < 60; i++) {
    car.update(1 / 60, { ...emptyControls(), brake: 1.0 }, 0, 0, false, false);
    const pose = car.pose();
    cameras.update(1 / 60, i / 60, car, pose, 0, false, 70, 0.5, false);
  }
  camera.getWorldDirection(camDir);
  assert.ok(camDir.z < -0.5, 'Cockpit camera maintains forward view while reversing');
});

test('Camera mode transitions smoothly and updates near plane and FOV correctly', () => {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.08, 5000);
  const canvasStub = { addEventListener() {} } as any;
  const cameras = new CameraController(camera, canvasStub, R34Config);
  const road = new Road();
  const car = new VehiclePhysics(road, R34Config);

  // Mode 0: Chase
  cameras.mode = 0;
  cameras.update(1 / 60, 0, car, car.pose(), 0, false, 60, 0.5, false);
  assert.equal(camera.near, 0.08);

  // Switch to Cockpit (Mode 3)
  cameras.mode = 3;
  cameras.onModeChanged();
  for (let i = 0; i < 30; i++) {
    cameras.update(1 / 60, i / 60, car, car.pose(), 0, false, 60, 0.5, false);
  }
  assert.equal(camera.near, 0.05, 'Near plane switches to 0.05 in cockpit');
  assert.ok(camera.fov >= 66 && camera.fov <= 70, `FOV smoothly dampens to 68 deg, got ${camera.fov}`);

  // Switch back to Chase (Mode 0)
  cameras.mode = 0;
  cameras.onModeChanged();
  for (let i = 0; i < 30; i++) {
    cameras.update(1 / 60, i / 60, car, car.pose(), 0, false, 60, 0.5, false);
  }
  assert.equal(camera.near, 0.08, 'Near plane restores to 0.08 in chase');
});

test('Hood camera positions securely above R34 bonnet and never clips into cabin or rear body geometry', () => {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.08, 5000);
  const canvasStub = { addEventListener() {} } as any;
  const cameras = new CameraController(camera, canvasStub, R34Config);
  cameras.mode = 2; // Hood mode

  const road = new Road();
  const car = new VehiclePhysics(road, R34Config);

  // Test across stationary, high speed, braking, and hill climb
  for (let i = 0; i < 120; i++) {
    const brake = i > 60 && i < 90 ? 1.0 : 0;
    const throttle = i <= 60 ? 1.0 : 0;
    car.update(1 / 60, { ...emptyControls(), throttle, brake }, 0, 0, false, false);
    const pose = car.pose();
    cameras.update(1 / 60, i / 60, car, pose, 0, false, 60, 0.5, false);

    const carWorldPos = road.point(pose.s, pose.offset);
    const camPos = camera.position;

    // In Hood mode, camera must be in FRONT of the vehicle center (Z ahead of car axle position)
    assert.ok(camPos.z < carWorldPos.z, 'Hood camera is forward of the vehicle axle origin');
    // Camera height must be above ground and above the hood surface (0.90m - 1.20m)
    assert.ok(camPos.y > car.height + 0.85 && camPos.y < car.height + 1.20, `Hood camera height is correctly above hood, got ${camPos.y}`);
    // Camera looks forward down the road
    const camDir = new Vector3();
    camera.getWorldDirection(camDir);
    assert.ok(camDir.z < -0.7, 'Hood camera looks straight down the road');
  }
});

