globalThis.self = globalThis;
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} } };
}
if (typeof globalThis.createImageBitmap === 'undefined') {
  globalThis.createImageBitmap = async () => ({ width: 1024, height: 1024, close: () => {} });
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS: () => ({ src: '', addEventListener: () => {}, removeEventListener: () => {} }),
    createElement: () => ({ getContext: () => null, width: 0, height: 0 }),
  };
}
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(b => { this.result = b; if (this.onload) this.onload({ target: this }); });
    }
  };
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

const glbPath = 'd:\\Aftermile\\public\\models\\bmw_m4_gt3_evo\\bmw_m4_gt3_evo.glb';
console.log('Validating GLB file at:', glbPath);

const buf = fs.readFileSync(glbPath);
const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuf, '', (gltf) => {
  const scene = gltf.scene;
  console.log('GLB Scene Name:', scene.name);
  
  const body = scene.getObjectByName('Body');
  const wheelMount0 = scene.getObjectByName('WheelMount0');
  const wheelMount1 = scene.getObjectByName('WheelMount1');
  const wheelMount2 = scene.getObjectByName('WheelMount2');
  const wheelMount3 = scene.getObjectByName('WheelMount3');
  const steeringWheel = scene.getObjectByName('SteeringWheel');

  console.log('Body exists:', !!body);
  console.log('WheelMount0 (FL) exists:', !!wheelMount0, 'Pos:', wheelMount0?.position);
  console.log('WheelMount1 (FR) exists:', !!wheelMount1, 'Pos:', wheelMount1?.position);
  console.log('WheelMount2 (RL) exists:', !!wheelMount2, 'Pos:', wheelMount2?.position);
  console.log('WheelMount3 (RR) exists:', !!wheelMount3, 'Pos:', wheelMount3?.position);
  console.log('SteeringWheel exists:', !!steeringWheel, 'Pos:', steeringWheel?.position);

  // Calculate overall bounding box
  const bbox = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const center = new THREE.Vector3();
  bbox.getCenter(center);

  console.log('\n=== MODEL BOUNDING BOX ===');
  console.log('Min:', bbox.min);
  console.log('Max:', bbox.max);
  console.log('Size (W x H x L):', size);
  console.log('Center:', center);

  let meshCount = 0;
  let triCount = 0;
  const outlierMeshes = [];

  scene.traverse(obj => {
    if (obj.isMesh) {
      meshCount++;
      const geom = obj.geometry;
      if (geom.index) triCount += geom.index.count / 3;
      else if (geom.attributes.position) triCount += geom.attributes.position.count / 3;

      const objBox = new THREE.Box3().setFromObject(obj);
      if (objBox.min.x < -3 || objBox.max.x > 3 || objBox.min.y < -1 || objBox.max.y > 4 || objBox.min.z < -5 || objBox.max.z > 5) {
        outlierMeshes.push({ name: obj.name, box: objBox });
      }
    }
  });

  console.log(`\nTotal Meshes: ${meshCount}, Total Triangles: ${triCount}`);
  console.log('Outlier / floating meshes count:', outlierMeshes.length);
  if (outlierMeshes.length > 0) {
    console.log('Outlier details:', outlierMeshes);
  } else {
    console.log('ALL MESHES ARE PERFECTLY WITHIN VEHICLE BOUNDS!');
  }
}, (err) => {
  console.error('Validation error:', err);
});
