import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAllVehicles, getVehicleConfig, VEHICLE_REGISTRY } from '../src/vehicle/VehicleRegistry.ts';
import { R34Config } from '../src/vehicle/definitions/R34.ts';
import { M4_GT3_EVO_Config } from '../src/vehicle/definitions/M4_GT3_EVO.ts';
import { Road } from '../src/road/Road.ts';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics.ts';

test('Vehicle Registry: contains both R34 and BMW M4 GT3 EVO with independent configs', () => {
  const all = getAllVehicles();
  assert.equal(all.length, 2);

  const r34 = getVehicleConfig('r34');
  const bmw = getVehicleConfig('m4_gt3_evo');

  assert.equal(r34.id, 'r34');
  assert.equal(bmw.id, 'm4_gt3_evo');
  assert.equal(bmw.name, 'BMW M4 GT3 EVO');

  // Verify real-world display specs exist and are verified without placeholder metrics
  assert.equal(bmw.displaySpecs.engineName, 'BMW P58 3.0L TWIN-TURBO I6');
  assert.equal(bmw.displaySpecs.power, 'Up to 590 hp');
  assert.equal(bmw.displaySpecs.displacement, '2,993 cm³');
  assert.equal(bmw.displaySpecs.wheelbase, '2,917 mm');
  assert.equal(bmw.displaySpecs.dimensions, '5,020 × 2,040 × 1,308 mm');
  assert.equal(bmw.displaySpecs.drivetrain, 'Rear-Wheel Drive (RWD)');

  // Verify R34 specs are intact
  assert.equal(r34.displaySpecs.engineName, 'NISSAN RB26DETT');
  assert.equal(r34.displaySpecs.drivetrain, 'ATTESA E-TS All-Wheel Drive');
});

test('Vehicle Physics Differentiation: BMW GT3 is lighter, firmer, higher grip, and purely RWD', () => {
  const road = new Road();
  const physR34 = new VehiclePhysics(road, R34Config);
  const physBMW = new VehiclePhysics(road, M4_GT3_EVO_Config);

  // Mass & Drivetrain
  assert.ok(physBMW.config.mass < physR34.config.mass, 'BMW GT3 is lighter than road GT');
  assert.equal(physBMW.config.engine.frontDriveShare, 0, 'BMW GT3 is pure RWD');
  assert.ok(physR34.config.engine.frontDriveShare > 0, 'R34 has front drive share');

  // Grip & Roll Stiffness
  assert.ok(physBMW.config.tires.grip > physR34.config.tires.grip, 'BMW GT3 has racing slick grip');
  assert.ok(physBMW.config.suspension.rollStiffness > physR34.config.suspension.rollStiffness, 'BMW GT3 has higher roll stiffness');
  assert.ok(physBMW.config.brakes.force > physR34.config.brakes.force, 'BMW GT3 has higher brake force');
});

test('Garage Transition: Authoritative parking transform matches transition arrival transform exactly (R34 -> BMW and BMW -> R34)', async () => {
  const { GarageController } = await import('../src/garage/GarageController.ts');
  const { PlayerVehicleModel } = await import('../src/vehicle/PlayerVehicleModel.ts');
  const { VehicleController } = await import('../src/vehicle/VehicleController.ts');

  const road = new Road();
  const r34Model = new PlayerVehicleModel(R34Config);
  const bmwModel = new PlayerVehicleModel(M4_GT3_EVO_Config);
  const models = new Map([['r34', r34Model], ['m4_gt3_evo', bmwModel]]);

  const s0 = 160;
  const offset0 = 5.1;
  const origin = 0;

  // Authoritative IDLE presentation transform calculation from VehiclePhysics
  const physBMW = new VehiclePhysics(road, M4_GT3_EVO_Config);
  physBMW.reset(s0);
  physBMW.offset = offset0;
  const idleBMWPose = physBMW.pose();

  const physR34 = new VehiclePhysics(road, R34Config);
  physR34.reset(s0);
  physR34.offset = offset0;
  const idleR34Pose = physR34.pose();

  const p0 = road.point(s0, offset0);
  const heading0 = -road.heading(s0);

  // 1. Test R34 -> BMW transition
  let stateLog: string[] = [];
  let switchedTo = '';
  const garage = new GarageController('r34', id => models.get(id) || null, {
    onStateChange: (state) => stateLog.push(state),
    onVehicleChanged: (id) => { switchedTo = id; }
  });
  garage.setRoad(road, s0, offset0);

  const started = garage.requestTransition('m4_gt3_evo', 'next');
  assert.equal(started, true);

  // Step through frame-by-frame and check invariants
  const dt = 1 / 60;
  let bmwFirstVisibleFrame: { x: number; y: number; z: number; state: string } | null = null;
  let maxDepartingFade = 1.0;

  for (let t = 0; t < 3.6; t += dt) {
    garage.update(dt, origin);
    if (bmwModel.group.visible && !bmwFirstVisibleFrame) {
      bmwFirstVisibleFrame = {
        x: bmwModel.group.position.x,
        y: bmwModel.group.position.y,
        z: bmwModel.group.position.z,
        state: garage.state
      };
    }
    if (garage.state === 'IDLE') break;
  }

  assert.equal(garage.state, 'IDLE');
  assert.equal(switchedTo, 'm4_gt3_evo');
  assert.ok(bmwFirstVisibleFrame, 'BMW should have become visible during transition');
  // Crucial invariant: FIRST visible frame of incoming car must be far away (> 20m from hero position), NOT at parked hero position
  const entryDistFromHero = Math.hypot(bmwFirstVisibleFrame!.x - p0.x, bmwFirstVisibleFrame!.z - p0.z);
  assert.ok(entryDistFromHero > 25.0, `BMW first visible frame was ${entryDistFromHero.toFixed(2)}m away (staged far behind), never at hero position`);

  // Verify incoming BMW arrival transform matches authoritative parking transform
  const bmwPos = bmwModel.group.position;
  const bmwRot = bmwModel.group.rotation;

  assert.ok(Math.abs(bmwPos.x - p0.x) < 0.0001, `BMW arrival x ${bmwPos.x} matches idle ${p0.x}`);
  assert.ok(Math.abs(bmwPos.y - idleBMWPose.height) < 0.0001, `BMW arrival y ${bmwPos.y} matches idle ${idleBMWPose.height}`);
  assert.ok(Math.abs(bmwPos.z - (p0.z + origin)) < 0.0001, `BMW arrival z ${bmwPos.z} matches idle ${p0.z}`);
  assert.ok(Math.abs(bmwRot.y - heading0) < 0.0001, `BMW arrival rotY ${bmwRot.y} matches idle ${heading0}`);

  // 2. Test BMW -> R34 reverse transition
  stateLog = [];
  switchedTo = '';
  let r34FirstVisibleFrame: { x: number; y: number; z: number; state: string } | null = null;
  const revStarted = garage.requestTransition('r34', 'prev');
  assert.equal(revStarted, true);

  for (let t = 0; t < 3.6; t += dt) {
    garage.update(dt, origin);
    if (r34Model.group.visible && !r34FirstVisibleFrame) {
      r34FirstVisibleFrame = {
        x: r34Model.group.position.x,
        y: r34Model.group.position.y,
        z: r34Model.group.position.z,
        state: garage.state
      };
    }
    if (garage.state === 'IDLE') break;
  }

  assert.equal(garage.state, 'IDLE');
  assert.equal(switchedTo, 'r34');
  assert.ok(r34FirstVisibleFrame, 'R34 should have become visible during transition');
  const r34EntryDist = Math.hypot(r34FirstVisibleFrame!.x - p0.x, r34FirstVisibleFrame!.z - p0.z);
  assert.ok(r34EntryDist > 25.0, `R34 first visible frame was ${r34EntryDist.toFixed(2)}m away (staged far behind), never at hero position`);

  const r34Pos = r34Model.group.position;
  const r34Rot = r34Model.group.rotation;

  assert.ok(Math.abs(r34Pos.x - p0.x) < 0.0001, `R34 arrival x ${r34Pos.x} matches idle ${p0.x}`);
  assert.ok(Math.abs(r34Pos.y - idleR34Pose.height) < 0.0001, `R34 arrival y ${r34Pos.y} matches idle ${idleR34Pose.height}`);
  assert.ok(Math.abs(r34Pos.z - (p0.z + origin)) < 0.0001, `R34 arrival z ${r34Pos.z} matches idle ${p0.z}`);
  assert.ok(Math.abs(r34Rot.y - heading0) < 0.0001, `R34 arrival rotY ${r34Rot.y} matches idle ${heading0}`);
});
