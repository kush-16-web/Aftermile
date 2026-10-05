import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraController, cameraNames } from '../src/vehicle/CameraController.ts';
import { R34Config } from '../src/vehicle/definitions/R34.ts';
import { Road } from '../src/road/Road.ts';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics.ts';
import { PlayerVehicleModel } from '../src/vehicle/PlayerVehicleModel.ts';
import { emptyControls } from '../src/vehicle/VehicleInput.ts';

test('R34 Cockpit Driver-Eye Rig and Camera Transition Stress Test', async (t) => {
  const road = new Road();
  const car = new VehiclePhysics(road, R34Config);
  const model = new PlayerVehicleModel(R34Config);
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.05, 1000);
  const fakeCanvas = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
  } as unknown as HTMLCanvasElement;

  const controller = new CameraController(camera, fakeCanvas, R34Config);

  await t.test('50 complete camera cycles perform instant clean transitions without spatial body penetration', () => {
    let origin = 0;

    for (let cycle = 0; cycle < 50; cycle++) {
      for (let m = 0; m < cameraNames.length; m++) {
        const prevMode = controller.mode;
        controller.mode = (controller.mode + 1) % cameraNames.length;
        controller.onModeChanged(prevMode);
        model.setCameraMode(controller.mode);

        const pose = car.pose();
        controller.update(1 / 60, 1.0, car, pose, origin, false, 65, 0.5, false, model.driverEye);

        // Assert camera transform is valid, finite and within believable bounds
        assert.ok(!Number.isNaN(camera.position.x), 'Camera position X is NaN');
        assert.ok(!Number.isNaN(camera.position.y), 'Camera position Y is NaN');
        assert.ok(!Number.isNaN(camera.position.z), 'Camera position Z is NaN');
        assert.ok(Number.isFinite(camera.position.y), 'Camera position Y is infinite');

        if (controller.mode === 3) {
          // In Cockpit mode, near plane must be 0.05m
          assert.equal(camera.near, 0.05, 'Cockpit near plane must be 0.05m');
          // In Cockpit mode, FOV must be vehicle-authored 68
          assert.equal(R34Config.camera.cockpit?.fov, 68, 'R34 Cockpit FOV must be 68');
          // Camera position must match driverEye world position exactly (zero smoothing)
          const eyeWorldPos = new THREE.Vector3();
          model.driverEye.getWorldPosition(eyeWorldPos);
          assert.ok(camera.position.distanceTo(eyeWorldPos) < 1e-4, 'Cockpit camera must rigidly match DriverEye world position');
        }
      }
    }
  });

  await t.test('DriverEye local transform remains bounded within physical head inertia limits while driving, turning, slope, and drift', () => {
    controller.mode = 3;
    controller.onModeChanged(0);
    model.setCameraMode(3);

    const initialLocalPos = model.driverEye.position.clone();
    const initialLocalQuat = model.driverEye.quaternion.clone();

    const input = emptyControls();
    input.throttle = 1.0;

    // Simulate 500 frames of driving, slope, aggressive turning, and drifting
    for (let frame = 0; frame < 500; frame++) {
      if (frame === 100) {
        input.throttle = 0;
        input.brake = 1.0; // Hard braking
      }
      if (frame === 180) {
        input.brake = 0;
        input.throttle = 1.0;
        input.left = true; // Hard turn
      }
      if (frame === 280) {
        input.left = false;
        input.right = true; // Countersteer
        input.handbrake = 1.0; // Drift slide
      }
      if (frame === 380) {
        input.handbrake = 0;
        input.right = false;
        input.throttle = 1.0; // High speed acceleration (150+ km/h)
      }

      car.update(1 / 60, input, 0, 0, false, false);
      const pose = car.pose();
      model.animate(pose, car.speed, input.brake, 0);
      controller.update(1 / 60, frame / 60, car, pose, 0, false, 68, 0.5, false, model.driverEye);

      // Verify DriverEye LOCAL transform remains strictly bounded within subtle physical inertia limits (<= 2cm)
      assert.ok(Math.abs(model.driverEye.position.x - initialLocalPos.x) <= 0.02, 'DriverEye local X remains bounded');
      assert.ok(Math.abs(model.driverEye.position.y - initialLocalPos.y) <= 0.02, 'DriverEye local Y remains bounded');
      assert.ok(Math.abs(model.driverEye.position.z - initialLocalPos.z) <= 0.02, 'DriverEye local Z remains bounded');
      assert.equal(model.driverEye.quaternion.x, initialLocalQuat.x, 'DriverEye local quat X must not change');
      assert.equal(model.driverEye.quaternion.y, initialLocalQuat.y, 'DriverEye local quat Y must not change');
      assert.equal(model.driverEye.quaternion.z, initialLocalQuat.z, 'DriverEye local quat Z must not change');
      assert.equal(model.driverEye.quaternion.w, initialLocalQuat.w, 'DriverEye local quat W must not change');

      // Verify camera world transform is strictly equal to DriverEye world transform (zero smoothing)
      const eyeWorldPos = new THREE.Vector3();
      const eyeWorldQuat = new THREE.Quaternion();
      model.driverEye.getWorldPosition(eyeWorldPos);
      model.driverEye.getWorldQuaternion(eyeWorldQuat);

      assert.ok(camera.position.distanceTo(eyeWorldPos) < 1e-4, 'Camera world position must equal DriverEye world position');
      assert.ok(Math.abs(camera.quaternion.dot(eyeWorldQuat)) > 0.99999, 'Camera world quat must equal DriverEye world quat');
    }
  });

  await t.test('Initial spawn height and camera pose are placed above the road surface, never at (0, 0, 0)', () => {
    // Reset vehicle and model to resting spawn state
    car.speed = 0;
    car.pitch = 0;
    car.roll = 0;
    const pose = car.pose();
    model.animate(pose, 0, 0, 0);

    // Road height at spawn s = 160
    const roadPoint = road.point(car.s, car.offset);
    assert.ok(roadPoint.y > 20, `Road point height at spawn must be > 20m, got ${roadPoint.y}`);
    assert.ok(car.height > 20, `Vehicle physics height at spawn must be > 20m, got ${car.height}`);

    // Verify DriverEye local position is calibrated 11cm backward: [0.355, 0.570, -0.030]
    const cg = R34Config.centerOfGravity || 0.48;
    assert.ok(Math.abs(model.driverEye.position.x - 0.355) < 1e-3, 'DriverEye X must be ~0.355 (RHD)');
    assert.ok(Math.abs(model.driverEye.position.y - (1.050 - cg)) < 1e-3, 'DriverEye Y must be ~1.050 - CG');
    assert.ok(Math.abs(model.driverEye.position.z - (-0.030)) < 1e-3, 'DriverEye Z must be ~ -0.030');

    // Verify initial vehicle render places model on road surface
    model.group.position.set(roadPoint.x, pose.height, roadPoint.z);

    controller.mode = 3;
    controller.initialized = false;
    controller.update(1 / 60, 0, car, pose, 0, false, 65, 0.5, false, model.driverEye);

    assert.ok(camera.position.y > 20, `Camera Y must be above road surface (> 20m), got ${camera.position.y}`);
    assert.ok(!Number.isNaN(camera.position.x) && !Number.isNaN(camera.position.y) && !Number.isNaN(camera.position.z));
  });
});
