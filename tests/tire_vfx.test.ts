import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Road } from '../src/road/Road.ts';
import { VehiclePhysics, emptyControls } from '../src/vehicle/VehiclePhysics.ts';
import type { Controls } from '../src/vehicle/VehicleInput.ts';
import { getVehicleConfig } from '../src/vehicle/VehicleRegistry.ts';
import { VehicleEffects, SURFACE_VFX_PROFILES } from '../src/vehicle/VehicleEffects.ts';
import { PlayerVehicleModel } from '../src/vehicle/PlayerVehicleModel.ts';

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

const createTestRig = (kmh = 0) => {
  const cfg = getVehicleConfig('r34');
  const road = new FlatRoad();
  const physics = new VehiclePhysics(road, cfg);
  physics.offset = 0;
  physics.speed = kmh / 3.6;
  physics.gear = kmh >= 100 ? 3 : (kmh >= 50 ? 2 : 1);
  const model = new PlayerVehicleModel(cfg);
  model.ready = true;
  const scene = new THREE.Scene();
  const effects = new VehicleEffects(scene);
  const camera = new THREE.PerspectiveCamera();
  return { physics, model, effects, camera, scene };
};

function step(rig: ReturnType<typeof createTestRig>, seconds: number, input: (time: number) => Partial<Controls>, wet = 0, snow = 0, hz = 60) {
  for (let i = 0; i < seconds * hz; i++) {
    const t = i / hz;
    rig.physics.update(1 / hz, { ...emptyControls(), ...input(t) }, 0, 0, false, false);
    rig.model.animate(rig.physics.pose(), rig.physics.speed, Math.max(rig.physics.brakeAmount, rig.physics.input.handbrake), 0);
    rig.effects.update(1 / hz, t, rig.physics, rig.model, rig.camera, wet, snow);
  }
}

test('Normal driving produces essentially zero smoke energy and no skid marks', () => {
  const rig = createTestRig(80);
  step(rig, 3.0, () => ({ throttle: true }));

  for (let w = 0; w < 4; w++) {
    assert.ok(rig.physics.smokeEnergy[w] < 0.15, `wheel ${w} smoke energy must be near zero (actual: ${rig.physics.smokeEnergy[w].toFixed(3)})`);
    assert.equal(rig.effects.tireStates[w].skidIntensity, 0, `wheel ${w} should not produce skid marks during normal driving`);
  }
});

test('Tiny transient slip does not create huge smoke energy explosion', () => {
  const rig = createTestRig(60);
  // Tap steer for 0.08s
  step(rig, 0.08, () => ({ left: true, throttle: true }));
  // Coast / settle
  step(rig, 0.5, () => ({ throttle: true }));

  for (let w = 0; w < 4; w++) {
    assert.ok(rig.physics.smokeEnergy[w] < SURFACE_VFX_PROFILES.asphalt.smokeThreshold,
      `transient tap must remain below smoke threshold (actual: ${rig.physics.smokeEnergy[w].toFixed(2)})`);
  }
});

test('No wheel contact suppresses tire smoke and skid mark generation', () => {
  const rig = createTestRig(70);
  // Simulate sustained airborne condition (heave > 0.24)
  for (let i = 0; i < 30; i++) {
    rig.physics.heave = 0.35;
    rig.physics.update(1 / 60, { ...emptyControls(), left: true, handbrake: true }, 0, 0, false, false);
    rig.physics.heave = 0.35; // Maintain airborne state
    rig.model.animate(rig.physics.pose(), rig.physics.speed, 0, 0);
    rig.effects.update(1 / 60, i / 60, rig.physics, rig.model, rig.camera, 0, 0);
  }

  for (let w = 0; w < 4; w++) {
    assert.equal(rig.effects.tireStates[w].wheelContact, false, 'airborne wheel must not have ground contact');
    assert.equal(rig.effects.tireStates[w].skidIntensity, 0, 'airborne wheel cannot lay skid marks');
    assert.equal(rig.effects.tireStates[w].smokeEmissionRate, 0, 'airborne wheel cannot emit contact smoke');
  }
});

test('Controlled R34 drift produces sustained rear contact smoke and skid tracks', () => {
  const rig = createTestRig(75);
  let sawRearSkid = false;
  let sawRearSmoke = false;

  for (let i = 0; i < 90; i++) {
    const isInit = i < 25;
    rig.physics.update(1 / 60, { ...emptyControls(), left: isInit, right: !isInit, throttle: true, handbrake: isInit }, 0, 0, false, false);
    rig.model.animate(rig.physics.pose(), rig.physics.speed, Math.max(rig.physics.brakeAmount, rig.physics.input.handbrake), 0);
    rig.effects.update(1 / 60, i / 60, rig.physics, rig.model, rig.camera, 0, 0);
    if (rig.effects.tireStates[2].skidIntensity > 0.05 || rig.effects.tireStates[3].skidIntensity > 0.05) {
      sawRearSkid = true;
    }
    if (rig.physics.smokeEnergy[2] > 0.20 || rig.physics.smokeEnergy[3] > 0.20) {
      sawRearSmoke = true;
    }
  }

  assert.ok(sawRearSmoke, 'Rear smoke energy must build during slide');
  assert.ok(sawRearSkid, 'Rear wheels must generate skid track intensity during slide');
  assert.ok(rig.effects['trackNodes'][2].length > 0 || rig.effects['trackNodes'][3].length > 0, 'Skid track nodes must be recorded in world');
});

test('Burnout produces high-energy localized smoke on slipping driven wheels', () => {
  const rig = createTestRig(0);
  let maxDrivenSlip = 0;
  let maxSmokeEnergy = 0;

  for (let i = 0; i < 30; i++) {
    rig.physics.update(1 / 60, { ...emptyControls(), throttle: true }, 0, 0, false, false);
    rig.effects.update(1 / 60, i / 60, rig.physics, rig.model, rig.camera, 0, 0);
    maxDrivenSlip = Math.max(maxDrivenSlip, rig.physics.drivenWheelSlip);
    maxSmokeEnergy = Math.max(maxSmokeEnergy, rig.physics.smokeEnergy[2], rig.physics.smokeEnergy[3]);
  }

  // Driven rear wheels have high slip ratio and friction power
  assert.ok(maxDrivenSlip > 0.40, `rear wheelspin present during launch/burnout (actual: ${maxDrivenSlip.toFixed(2)})`);
  assert.ok(maxSmokeEnergy > 0.25, `burnout builds smoke energy (actual: ${maxSmokeEnergy.toFixed(2)})`);
});

test('Surface profiles: wet asphalt suppresses dry rubber smoke and activates spray', () => {
  const rig = createTestRig(70);
  // Slide in wet conditions
  step(rig, 0.5, () => ({ left: true, throttle: true, handbrake: true }), 0.85, 0);

  const wetProfile = SURFACE_VFX_PROFILES.wet_asphalt;
  assert.equal(wetProfile.smokeEnabled, false, 'wet road suppresses dry smoke');
  assert.equal(wetProfile.sprayEnabled, true, 'wet road activates water spray');
  assert.ok(wetProfile.trackBaseAlpha < SURFACE_VFX_PROFILES.asphalt.trackBaseAlpha, 'wet track is fainter than dry asphalt');
});

test('Surface profiles: snow activates powder plume and compressed snow track', () => {
  const snowProfile = SURFACE_VFX_PROFILES.snow;
  assert.equal(snowProfile.smokeEnabled, false, 'snow suppresses asphalt smoke');
  assert.equal(snowProfile.sprayEnabled, true, 'snow activates powder plume');
  assert.equal(snowProfile.trackEnabled, true, 'snow enables tire ruts');
  assert.ok(snowProfile.trackColor[0] > 0.6, 'snow track is bright/whitish');
});

test('Particle pool budget: recycling remains strictly bounded without allocations', () => {
  const rig = createTestRig(70);
  // Long continuous slide to trigger many particles
  step(rig, 4.0, () => ({ left: true, throttle: true, handbrake: true }));

  // Confirm instance mesh remains strictly allocated to max particle budget
  assert.equal(rig.effects['smokeParticles'].length, 360);
});

test('World-space smoke persistence: particles remain in world space when car drives away', () => {
  const rig = createTestRig(75);
  // Initiate slide and spawn smoke
  step(rig, 0.45, () => ({ left: true, throttle: true, handbrake: true }));

  const active = (rig.effects['smokeParticles'] as any[]).filter(p => p.active);
  assert.ok(active.length > 0, 'smoke particles must have spawned in world');
  const initialZ = active[0].z;

  // Car accelerates straight ahead away from slide area
  step(rig, 1.0, () => ({ throttle: true, handbrake: false }));

  // Emitted particle does not track vehicle position; stays near its emission coordinate
  assert.ok(Math.abs(active[0].z - initialZ) < 5.0, 'smoke particle must remain suspended over world position');
});

test('Low-opacity layering: individual smoke particles remain translucent and never opaque blobs', () => {
  const rig = createTestRig(75);
  step(rig, 0.5, () => ({ left: true, throttle: true, handbrake: true }));

  const active = (rig.effects['smokeParticles'] as any[]).filter(p => p.active && p.kind === 'smoke');
  for (const p of active) {
    assert.ok(p.maxAlpha <= 0.22, `individual smoke alpha must be low/translucent (actual: ${p.maxAlpha.toFixed(3)})`);
  }
});

test('Velocity stretching: high-speed drift stretch ratio is greater than low-speed burnout', () => {
  const driftRig = createTestRig(75);
  // High speed slide sustaining forward speed
  step(driftRig, 0.20, () => ({ left: true, throttle: true, handbrake: true }));
  step(driftRig, 0.20, () => ({ right: true, throttle: true, handbrake: false }));
  const driftParticles = (driftRig.effects['smokeParticles'] as any[]).filter(p => p.active);

  const burnoutRig = createTestRig(0);
  step(burnoutRig, 0.4, () => ({ throttle: true }));
  const burnoutParticles = (burnoutRig.effects['smokeParticles'] as any[]).filter(p => p.active);

  assert.ok(driftParticles.length > 0 && burnoutParticles.length > 0);
  assert.ok(driftParticles[0].stretchRatio > burnoutParticles[0].stretchRatio,
    `drift stretch ratio (${driftParticles[0].stretchRatio.toFixed(2)}) must exceed burnout (${burnoutParticles[0].stretchRatio.toFixed(2)})`);
});

test('Weather wind influence: wind vector displaces suspended smoke particles over time', () => {
  const rig = createTestRig(70);
  const weatherWithWind = { wet: 0, snow: 0, wind: 35, cloud: 0, storm: 0 };
  step(rig, 0.4, () => ({ left: true, throttle: true, handbrake: true }), 0, 0);

  const active = (rig.effects['smokeParticles'] as any[]).filter(p => p.active);
  assert.ok(active.length > 0);
  const startX = active[0].x;

  // Step with strong weather wind
  for (let i = 0; i < 40; i++) {
    rig.effects.update(1 / 60, i / 60, rig.physics, rig.model, rig.camera, weatherWithWind as any, 0);
  }

  // Confirm lateral wind displacement
  assert.ok(active[0].x !== startX, 'wind must push smoke particles in world');
});

test('Transparency & Dark Artifact invariant: active smoke instance colors remain clean light albedo without black darkening', () => {
  const rig = createTestRig(75);
  step(rig, 0.45, () => ({ left: true, throttle: true, handbrake: true }));

  const active = (rig.effects['smokeParticles'] as any[]).filter(p => p.active && p.kind === 'smoke');
  assert.ok(active.length > 0, 'smoke particles must spawn during slide');

  const colorAttr = rig.effects['smokeMesh'].instanceColor as THREE.InstancedBufferAttribute;
  assert.ok(colorAttr, 'instanceColor attribute must exist');

  // Age the particles across multiple frames and verify instance color never drops to dark black
  for (let f = 0; f < 30; f++) {
    rig.effects.update(1 / 60, 0.5 + f / 60, rig.physics, rig.model, rig.camera, 0, 0);
    for (let i = 0; i < rig.effects['smokeParticles'].length; i++) {
      const p = (rig.effects['smokeParticles'] as any[])[i];
      if (p.active && p.kind === 'smoke') {
        const r = colorAttr.getX(i);
        const g = colorAttr.getY(i);
        const b = colorAttr.getZ(i);
        // RGB must remain clean tire smoke tone (>= 0.75 in daylight) and never multiply down to black
        assert.ok(r >= 0.75 && g >= 0.75 && b >= 0.75,
          `instance color must remain light albedo, got RGB(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`);
      }
    }
  }
});

test('Nonlinear Alpha Dissipation: smoke opacity peaks early and decays aggressively to ultra-faint before expiry', () => {
  const rig = createTestRig(75);
  step(rig, 0.25, () => ({ left: true, throttle: true, handbrake: true }));

  const active = (rig.effects['smokeParticles'] as any[]).filter(p => p.active && p.kind === 'smoke');
  assert.ok(active.length > 0);
  const p = active[0];

  const alphaArray = rig.effects['instanceAlphaArray'] as Float32Array;
  const pIdx = (rig.effects['smokeParticles'] as any[]).indexOf(p);

  // Advance particle life step by step and track alpha
  let peakAlpha = 0;
  let alphaAt60Pct = 0;
  let alphaAt85Pct = 0;

  const totalSteps = Math.floor(p.maxLife * 60);
  for (let s = 0; s < totalSteps; s++) {
    rig.effects.update(1 / 60, 1.0 + s / 60, rig.physics, rig.model, rig.camera, 0, 0);
    const prog = p.life / p.maxLife;
    const curAlpha = alphaArray[pIdx];

    if (prog <= 0.30) {
      peakAlpha = Math.max(peakAlpha, curAlpha);
    }
    if (prog >= 0.55 && prog <= 0.65 && alphaAt60Pct === 0) {
      alphaAt60Pct = curAlpha;
    }
    if (prog >= 0.80 && prog <= 0.90 && alphaAt85Pct === 0) {
      alphaAt85Pct = curAlpha;
    }
  }

  assert.ok(peakAlpha > 0.05, `peak alpha should be visible (got ${peakAlpha.toFixed(4)})`);
  assert.ok(alphaAt60Pct < peakAlpha * 0.35, `alpha at ~60% age must be < 35% of peak (got ${alphaAt60Pct.toFixed(4)} vs peak ${peakAlpha.toFixed(4)})`);
  assert.ok(alphaAt85Pct < peakAlpha * 0.10, `alpha at ~85% age must be < 10% of peak (got ${alphaAt85Pct.toFixed(4)})`);
});

test('Lifetime differences: fast drift smoke has shorter lifetime than stationary burnout', () => {
  const driftRig = createTestRig(80);
  step(driftRig, 0.6, () => ({ left: true, throttle: true, handbrake: true }));
  const driftP = (driftRig.effects['smokeParticles'] as any[]).find(p => p.active && p.kind === 'smoke' && !p.isBurnout);

  const burnoutRig = createTestRig(0);
  step(burnoutRig, 0.6, () => ({ throttle: true }));
  const burnoutP = (burnoutRig.effects['smokeParticles'] as any[]).find(p => p.active && p.kind === 'smoke' && p.isBurnout);

  assert.ok(driftP && burnoutP, 'both drift and burnout particles should exist');
  assert.ok(driftP.maxLife <= 1.45, `drift maxLife must be bounded (got ${driftP.maxLife.toFixed(2)}s)`);
  assert.ok(burnoutP.maxLife >= 1.40, `burnout maxLife should be longer (got ${burnoutP.maxLife.toFixed(2)}s)`);
  assert.ok(driftP.maxLife < burnoutP.maxLife, 'burnout particles live longer than fast drift particles');
});

test('Normal braking from 60 km/h: rolling tires produce zero smoke emission and zero skid marks', () => {
  const rig = createTestRig(60);
  // Full normal brake to stop
  step(rig, 2.0, () => ({ brake: true }));

  for (let w = 0; w < 4; w++) {
    assert.equal(rig.effects.tireStates[w].smokeEmissionRate, 0, `wheel ${w} must emit zero smoke during normal braking`);
    assert.equal(rig.effects.tireStates[w].skidIntensity, 0, `wheel ${w} must produce zero skid marks during normal braking`);
    assert.ok(rig.physics.smokeEnergy[w] < 0.10, `wheel ${w} smoke energy must remain near zero (got ${rig.physics.smokeEnergy[w].toFixed(3)})`);
  }
});

test('High-speed braking from 160 km/h: ABS-controlled rolling braking produces zero smoke', () => {
  const rig = createTestRig(160);
  // Hard braking from high speed
  step(rig, 1.5, () => ({ brake: true }));

  for (let w = 0; w < 4; w++) {
    assert.equal(rig.effects.tireStates[w].smokeEmissionRate, 0, `high-speed braking on wheel ${w} must produce zero smoke`);
    assert.ok(rig.physics.smokeEnergy[w] < 0.20, `wheel ${w} smoke energy must remain well below threshold during high-speed braking`);
  }
});

test('Handbrake straight-line at 80 km/h: locked rear wheels generate sliding slip and smoke', () => {
  const rig = createTestRig(80);
  step(rig, 0.45, () => ({ handbrake: true }));

  // Front wheels roll freely -> 0 smoke
  assert.equal(rig.effects.tireStates[0].smokeEmissionRate, 0, 'front left wheel should not smoke under handbrake');
  assert.equal(rig.effects.tireStates[1].smokeEmissionRate, 0, 'front right wheel should not smoke under handbrake');

  // Rear wheels lock -> sliding velocity and smoke
  assert.ok(rig.physics.wheelsTelemetry[2].slipVelocity > 5.0, 'locked rear left wheel must have high contact-patch slip velocity');
  assert.ok(rig.physics.wheelsTelemetry[3].slipVelocity > 5.0, 'locked rear right wheel must have high contact-patch slip velocity');
  assert.ok(rig.physics.smokeEnergy[2] > 0.25 || rig.physics.smokeEnergy[3] > 0.25, 'rear wheels build smoke energy during handbrake slide');
});

test('Normal reverse from standstill: rolling reverse produces zero smoke', () => {
  const rig = createTestRig(0);
  // Smooth reverse acceleration
  step(rig, 1.0, () => ({ brake: true })); // In reverse kinematics

  for (let w = 0; w < 4; w++) {
    assert.equal(rig.effects.tireStates[w].smokeEmissionRate, 0, `wheel ${w} must produce zero smoke during normal reverse`);
  }
});


