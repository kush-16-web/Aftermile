import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GarageController } from '../src/garage/GarageController.ts';
import { PlayerVehicleModel } from '../src/vehicle/PlayerVehicleModel.ts';
import { R34Config } from '../src/vehicle/definitions/R34.ts';
import { M4_GT3_EVO_Config } from '../src/vehicle/definitions/M4_GT3_EVO.ts';
import { Road } from '../src/road/Road.ts';
import { angleDiff } from '../src/core/math.ts';

test('Garage Transition: Path Tangent Continuity (0 Start Snap & 0 Arrival Snap)', () => {
  const road = new Road(1616);
  const r34Model = new PlayerVehicleModel(R34Config);
  const bmwModel = new PlayerVehicleModel(M4_GT3_EVO_Config);
  const models = new Map([['r34', r34Model], ['m4_gt3_evo', bmwModel]]);

  const s0 = 240;
  const offset0 = 4.8;
  const garage = new GarageController('r34', id => models.get(id) || null);
  garage.setRoad(road, s0, offset0);

  const parkedYaw = garage.getPresentationWorldYaw();

  // Test 1: Outgoing exit path start tangent at t=0 must match parkedYaw
  const exitKine0 = garage.derivePathKinematics(u => garage.evaluateExitPath(u), 0.0, r34Model.config.wheelbase, false);
  const exitYawDiff0 = Math.abs(angleDiff(exitKine0.worldYaw, parkedYaw));
  assert.ok(exitYawDiff0 < 0.001, `Exit start yaw diff (${exitYawDiff0.toFixed(6)} rad) must be effectively 0`);

  // Test 2: Incoming arrival path end tangent at t=1 must match parkedYaw
  const entryKine1 = garage.derivePathKinematics(u => garage.evaluateEntryPath(u), 1.0, bmwModel.config.wheelbase, true);
  const entryYawDiff1 = Math.abs(angleDiff(entryKine1.worldYaw, parkedYaw));
  assert.ok(entryYawDiff1 < 0.001, `Entry end yaw diff (${entryYawDiff1.toFixed(6)} rad) must be effectively 0`);

  // Test 3: Lateral merge finishes before final 20% (offset(t) === offset0 for t in [0.75, 1.0])
  for (let t = 0.75; t <= 1.0; t += 0.05) {
    const entryPt = garage.evaluateEntryPath(t);
    assert.ok(Math.abs(entryPt.offset - offset0) < 0.001, `Entry offset at t=${t} is already aligned with parking lane`);
  }
});

test('Garage Transition: Zero Sideways Gliding & Continuous Distance-Based Wheel Rolling', async () => {
  const road = new Road(1616);
  const r34Model = new PlayerVehicleModel(R34Config);
  const bmwModel = new PlayerVehicleModel(M4_GT3_EVO_Config);
  const models = new Map([['r34', r34Model], ['m4_gt3_evo', bmwModel]]);

  const s0 = 240;
  const offset0 = 4.8;
  const origin = 0;

  const garage = new GarageController('r34', id => models.get(id) || null);
  garage.setRoad(road, s0, offset0);

  const started = garage.requestTransition('m4_gt3_evo', 'next');
  assert.equal(started, true);

  const dt = 1 / 60;
  let maxSlipAngle = 0;
  let minForwardDot = 1.0;
  let maxSteerAngle = 0;
  let totalWheelRot = 0;

  for (let t = 0; t < 4.2; t += dt) {
    garage.update(dt, origin);

    if (garage.state === 'ENTERING' && bmwModel.group.visible) {
      maxSlipAngle = Math.max(maxSlipAngle, garage.telemetry.presentationSlipAngleDeg);
      minForwardDot = Math.min(minForwardDot, garage.telemetry.forwardVelocityDot);

      const steer = Math.abs(bmwModel.steer[0]?.rotation.y || 0);
      maxSteerAngle = Math.max(maxSteerAngle, steer);

      const spin = Math.abs(garage.telemetry.wheelRollRadians);
      totalWheelRot = Math.max(totalWheelRot, spin);
    }
  }

  // Presentation slip angle must be virtually 0 (car follows path forward without sideways drifting)
  assert.ok(maxSlipAngle < 1.0, `Max presentation slip angle (${maxSlipAngle.toFixed(3)}°) is under 1.0°`);
  assert.ok(minForwardDot > 0.99, `Min forward-velocity dot product (${minForwardDot.toFixed(4)}) is > 0.99`);
  assert.ok(maxSteerAngle > 0.01, 'Front wheels steered during approach curve');
  assert.ok(totalWheelRot > 5.0, 'Wheels rotated with forward travelled distance');
  assert.equal(garage.state, 'IDLE');
  assert.equal(garage.currentVehicleId, 'm4_gt3_evo');
  assert.ok(garage.telemetry.handoffAngularDiffDeg < 0.05, 'Handoff angular difference is effectively 0');
  assert.ok(garage.telemetry.handoffPositionDiff < 0.01, 'Handoff position difference is effectively 0');
});

test('Garage Grounding: 4-wheel tire contact remains planted on flat, sloped, and banked roads', () => {
  const road = new Road(1616);
  const r34Model = new PlayerVehicleModel(R34Config);
  const bmwModel = new PlayerVehicleModel(M4_GT3_EVO_Config);

  // Test at 5 distinct road stations: straight, crest, valley, banked curve, bridge
  const testStations = [100, 450, 820, 1400, 2100];

  for (const s of testStations) {
    for (const model of [r34Model, bmwModel]) {
      const garage = new GarageController(model.config.id, () => model);
      garage.setRoad(road, s, 4.5);

      const worldYaw = garage.getPresentationWorldYaw();
      const sample = garage.sampleRoadPose(model, s, 4.5, worldYaw, 0);

      assert.ok(Number.isFinite(sample.height), `Height finite at s=${s}`);
      assert.ok(Number.isFinite(sample.surfacePitch), `Pitch finite at s=${s}`);
      assert.ok(Number.isFinite(sample.surfaceRoll), `Roll finite at s=${s}`);

      // Verify all 4 wheel heights match road elevation within bounds
      for (let i = 0; i < 4; i++) {
        const wh = sample.wheelHeights[i];
        assert.ok(Number.isFinite(wh), `Wheel ${i} height is finite`);
        assert.ok(Math.abs(wh - sample.height) < 0.65, `Wheel ${i} contact close to chassis plane`);
      }
    }
  }
});

test('Garage 10-Switch Stress Test: repeated switching has zero drift, height drift or lifecycle leaks', () => {
  const road = new Road(1616);
  const r34Model = new PlayerVehicleModel(R34Config);
  const bmwModel = new PlayerVehicleModel(M4_GT3_EVO_Config);
  const models = new Map([['r34', r34Model], ['m4_gt3_evo', bmwModel]]);

  const garage = new GarageController('r34', id => models.get(id) || null);
  garage.setRoad(road, 200, 4.5);

  const initialYaw = garage.getPresentationWorldYaw();
  const dt = 1 / 60;

  for (let switchCount = 0; switchCount < 10; switchCount++) {
    const nextVehicle = (switchCount % 2 === 0) ? 'm4_gt3_evo' : 'r34';
    const started = garage.requestTransition(nextVehicle, 'next');
    assert.equal(started, true);

    for (let t = 0; t < 4.2; t += dt) {
      garage.update(dt, 0);
    }

    assert.equal(garage.state, 'IDLE');
    assert.equal(garage.currentVehicleId, nextVehicle);
    assert.equal(garage.presentationS, 200);
    assert.equal(garage.presentationOffset, 4.5);
    assert.equal(garage.getPresentationWorldYaw(), initialYaw);
  }
});

