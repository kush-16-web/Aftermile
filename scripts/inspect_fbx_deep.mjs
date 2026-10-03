if (typeof globalThis.window === 'undefined') {
  globalThis.window = { URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} } };
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
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import fs from 'fs';
import path from 'path';

const fbxPath = 'C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\0dacc5d9-913f-41de-98e5-2ce961ce7f3b\\scratch\\bmw_source_clean\\source\\FINAL_MODEL_GT325.fbx';
const sourceDir = path.dirname(fbxPath);

const buf = fs.readFileSync(fbxPath);
const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const loader = new FBXLoader();
// Let's hook into loader internal texture map or inspect the parsed scene
const fbx = loader.parse(arrayBuf, sourceDir);

console.log('=== ALL TEXTURES REGISTERED DURING FBX PARSE ===');
// Let's traverse all materials and their textures
const mats = new Map();
const textureRefs = new Map();

fbx.traverse(child => {
  if (child.isMesh && child.material) {
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of list) {
      if (!mats.has(m.name)) {
        mats.set(m.name, m);
      }
    }
  }
});

for (const [name, mat] of mats.entries()) {
  console.log(`\nMaterial: "${name}" (${mat.type})`);
  console.log(`  Color:`, mat.color ? mat.color.toArray() : 'none');
  console.log(`  Specular:`, mat.specular ? mat.specular.toArray() : 'none');
  console.log(`  Shininess:`, mat.shininess);
  console.log(`  Opacity:`, mat.opacity, `Transparent:`, mat.transparent);
  
  const mapProps = ['map', 'normalMap', 'bumpMap', 'specularMap', 'alphaMap', 'envMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'];
  for (const p of mapProps) {
    if (mat[p]) {
      const tex = mat[p];
      console.log(`  ${p}:`, {
        name: tex.name,
        sourceFile: tex.sourceFile || (tex.image ? tex.image.src : 'unknown'),
        mapping: tex.mapping,
        wrapS: tex.wrapS,
        wrapT: tex.wrapT,
      });
    }
  }
}

// Check which meshes use which materials
console.log('\n=== MESH MATERIAL DISTRIBUTION ===');
const matUsage = {};
fbx.traverse(child => {
  if (child.isMesh) {
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of list) {
      const mName = m ? m.name : 'null';
      if (!matUsage[mName]) matUsage[mName] = [];
      matUsage[mName].push(child.name);
    }
  }
});

for (const [mName, meshNames] of Object.entries(matUsage)) {
  console.log(`\nMaterial "${mName}" is used by ${meshNames.length} meshes:`);
  console.log(`  Examples:`, meshNames.slice(0, 8).join(', '));
}
