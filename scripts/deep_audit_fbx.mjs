if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
  };
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
      blob.arrayBuffer().then(b => {
        this.result = b;
        if (this.onload) this.onload({ target: this });
      });
    }
  };
}

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import fs from 'fs';
import path from 'path';

const fbxPath = 'C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\0dacc5d9-913f-41de-98e5-2ce961ce7f3b\\scratch\\bmw_source_clean\\source\\FINAL_MODEL_GT325.fbx';

console.log('Reading FBX binary...');
const buf = fs.readFileSync(fbxPath);
const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const loader = new FBXLoader();
const fbx = loader.parse(arrayBuf, path.dirname(fbxPath));

console.log('\n=== FBX LOADED SUCCESSFULLY ===');

const materialsMap = new Map();
const meshMaterialUsage = [];

fbx.traverse(obj => {
  if (obj.isMesh) {
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const matNames = mats.map(m => m ? m.name : 'null');
    meshMaterialUsage.push({
      meshName: obj.name,
      parent: obj.parent ? obj.parent.name : null,
      materials: matNames,
      vertCount: obj.geometry ? obj.geometry.attributes.position.count : 0,
      hasUV: obj.geometry ? Boolean(obj.geometry.attributes.uv) : false,
      hasUV2: obj.geometry ? Boolean(obj.geometry.attributes.uv2) : false,
    });

    for (const m of mats) {
      if (m && !materialsMap.has(m.name)) {
        materialsMap.set(m.name, m);
      }
    }
  }
});

console.log(`\nFound ${materialsMap.size} unique materials in FBX across ${meshMaterialUsage.length} meshes.\n`);

console.log('--- ALL UNIQUE MATERIALS IN FBX ---');
for (const [name, mat] of materialsMap.entries()) {
  console.log(`Material: "${name}" (${mat.type})`);
  console.log(`  color: [${mat.color ? mat.color.toArray().map(v=>v.toFixed(3)).join(', ') : 'none'}]`);
  if (mat.specular) console.log(`  specular: [${mat.specular.toArray().map(v=>v.toFixed(3)).join(', ')}]`);
  if (mat.shininess !== undefined) console.log(`  shininess: ${mat.shininess}`);
  if (mat.roughness !== undefined) console.log(`  roughness: ${mat.roughness}`);
  if (mat.metalness !== undefined) console.log(`  metalness: ${mat.metalness}`);
  if (mat.opacity !== undefined) console.log(`  opacity: ${mat.opacity}`);
  if (mat.transparent) console.log(`  transparent: true`);
  if (mat.map) console.log(`  map: ${mat.map.name || mat.map.sourceFile || 'texture'}`);
  if (mat.normalMap) console.log(`  normalMap: ${mat.normalMap.name || mat.normalMap.sourceFile || 'texture'}`);
  if (mat.bumpMap) console.log(`  bumpMap: ${mat.bumpMap.name || mat.bumpMap.sourceFile || 'texture'}`);
  if (mat.specularMap) console.log(`  specularMap: ${mat.specularMap.name || mat.specularMap.sourceFile || 'texture'}`);
  if (mat.roughnessMap) console.log(`  roughnessMap: ${mat.roughnessMap.name || 'texture'}`);
  if (mat.metalnessMap) console.log(`  metalnessMap: ${mat.metalnessMap.name || 'texture'}`);
  if (mat.emissive && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) {
    console.log(`  emissive: [${mat.emissive.toArray().map(v=>v.toFixed(3)).join(', ')}]`);
  }
  if (mat.userData) console.log(`  userData:`, JSON.stringify(mat.userData));
  console.log('');
}

console.log('--- SAMPLE MESHES & THEIR ASSIGNED MATERIALS ---');
const mainMeshes = meshMaterialUsage.filter(m => 
  m.meshName.toLowerCase().includes('body') || 
  m.meshName.toLowerCase().includes('hood') || 
  m.meshName.toLowerCase().includes('door') || 
  m.meshName.toLowerCase().includes('bumper') || 
  m.meshName.toLowerCase().includes('wing') || 
  m.meshName.toLowerCase().includes('glass') || 
  m.meshName.toLowerCase().includes('wheel') || 
  m.meshName.toLowerCase().includes('interior') || 
  m.meshName.toLowerCase().includes('engine')
);

console.log(`Found ${mainMeshes.length} key body/component meshes:`);
mainMeshes.slice(0, 40).forEach(m => {
  console.log(`Mesh: "${m.meshName}" -> parent: "${m.parent}" -> mats: [${m.materials.join(', ')}] (verts: ${m.vertCount}, UV: ${m.hasUV})`);
});
