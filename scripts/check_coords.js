if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    URL: {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {},
    },
  };
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS: (ns, name) => {
      if (name === 'img') {
        return {
          src: '',
          addEventListener: () => {},
          removeEventListener: () => {},
        };
      }
      return {};
    },
    createElement: (name) => {
      if (name === 'canvas') {
        return {
          getContext: () => null,
          width: 0,
          height: 0,
        };
      }
      return {};
    },
  };
}

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import fs from 'fs';

const fbxPath = "C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\0dacc5d9-913f-41de-98e5-2ce961ce7f3b\\scratch\\bmw_extract\\model\\FINAL_MODEL_GT325.fbx";
const buffer = fs.readFileSync(fbxPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new FBXLoader();
const fbx = loader.parse(arrayBuffer, '');

fbx.traverse(obj => {
  if (obj.isMesh) {
    obj.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const name = obj.name.toLowerCase();
    if (name.includes('wheel') || name.includes('wing') || name.includes('hood') || name.includes('bonnet') || name.includes('trunk') || name.includes('exhaust') || name.includes('steer') || name.includes('seat')) {
      console.log(`${obj.name.padEnd(50)} | center: X=${center.x.toFixed(3)}, Y=${center.y.toFixed(3)}, Z=${center.z.toFixed(3)} | size: X=${(box.max.x - box.min.x).toFixed(3)}, Y=${(box.max.y - box.min.y).toFixed(3)}, Z=${(box.max.z - box.min.z).toFixed(3)}`);
    }
  }
});
