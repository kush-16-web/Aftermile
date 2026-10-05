import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

test('Calculate Physical Mirror Reflection Vectors for R34', () => {
  const eyeLocal = new THREE.Vector3(0.355, 1.050, -0.030);

  // 1. Right Mirror (Driver side at +X = 0.812m, Y = 0.987m, Z = -0.404m)
  const rightMirrorPos = new THREE.Vector3(0.812, 0.987, -0.404);
  const vRight = new THREE.Vector3().subVectors(rightMirrorPos, eyeLocal).normalize();
  // Desired right-rearward lane coverage: +X (outward), slightly -Y (road horizon), +Z (rearward)
  const rRightTarget = new THREE.Vector3(0.26, -0.045, 0.965).normalize();
  const nRight = new THREE.Vector3().subVectors(rRightTarget, vRight).normalize();
  const rRight = vRight.clone().sub(nRight.clone().multiplyScalar(2 * vRight.dot(nRight))).normalize();

  console.log('\nRight Mirror (Driver Side):');
  console.log('  Incident Ray:', vRight);
  console.log('  Mirror Normal:', nRight);
  console.log('  Reflected Look Direction:', rRight);

  // 2. Left Mirror (Passenger side at -X = -0.812m, Y = 0.987m, Z = -0.404m)
  const leftMirrorPos = new THREE.Vector3(-0.812, 0.987, -0.404);
  const vLeft = new THREE.Vector3().subVectors(leftMirrorPos, eyeLocal).normalize();
  // Desired left-rearward lane coverage: -X (outward), slightly -Y (road horizon), +Z (rearward)
  const rLeftTarget = new THREE.Vector3(-0.32, -0.045, 0.946).normalize();
  const nLeft = new THREE.Vector3().subVectors(rLeftTarget, vLeft).normalize();
  const rLeft = vLeft.clone().sub(nLeft.clone().multiplyScalar(2 * vLeft.dot(nLeft))).normalize();

  console.log('\nLeft Mirror (Passenger Side):');
  console.log('  Incident Ray:', vLeft);
  console.log('  Mirror Normal:', nLeft);
  console.log('  Reflected Look Direction:', rLeft);

  // 3. Center Rear-View Mirror (at +X = 0.04m, Y = 1.18m, Z = -0.375m)
  const rearMirrorPos = new THREE.Vector3(0.04, 1.18, -0.375);
  const vRear = new THREE.Vector3().subVectors(rearMirrorPos, eyeLocal).normalize();
  const rRearTarget = new THREE.Vector3(0.02, -0.035, 0.999).normalize();
  const nRear = new THREE.Vector3().subVectors(rRearTarget, vRear).normalize();
  const rRear = vRear.clone().sub(nRear.clone().multiplyScalar(2 * vRear.dot(nRear))).normalize();

  console.log('\nCenter Rear Mirror:');
  console.log('  Reflected Look Direction:', rRear);

  // Validations
  assert.ok(rRight.z > 0.9, 'Right reflected ray must point rearward (+Z)');
  assert.ok(rRight.x > 0.2, 'Right reflected ray must point rightward (+X) to show right lane');
  assert.ok(rLeft.z > 0.9, 'Left reflected ray must point rearward (+Z)');
  assert.ok(rLeft.x < -0.2, 'Left reflected ray must point leftward (-X) to show left lane');
  assert.ok(rRear.z > 0.98, 'Center reflected ray must point straight rearward (+Z)');
});
