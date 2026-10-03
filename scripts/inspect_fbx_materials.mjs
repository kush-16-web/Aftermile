// TEMPORARY DIAGNOSTIC — inspect ORIGINAL FBX material definitions (source of truth).
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import fs from 'fs';
import path from 'path';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = { URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} } };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS: (ns, name) => (name === 'img' ? { src: '', addEventListener: () => {}, removeEventListener: () => {} } : {}),
    createElement: (name) => (name === 'canvas' ? { getContext: () => null, width: 0, height: 0 } : {}),
  };
}
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(b => { this.result = b; this.onload?.({ target: this }); this.onloadend?.({ target: this }); }); }
    readAsDataURL(blob) { blob.arrayBuffer().then(b => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`; this.onload?.({ target: this }); this.onloadend?.({ target: this }); }); }
  };
}

const fbxPath = process.argv[2];
const outPath = process.argv[3];

const buf = fs.readFileSync(fbxPath);
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const loader = new FBXLoader();
const fbx = loader.parse(arrayBuffer, path.dirname(fbxPath) + path.sep);

const textures = new Map();
for (const [key, t] of Object.entries(fbx.userData?.textures || {})) textures.set(key, t);

function texInfo(t) {
  if (!t) return null;
  return {
    name: t.name,
    source: t.sourceFile || t.image?.src || null,
    colorSpace: t.colorSpace,
    flipY: t.flipY,
    wrapS: t.wrapS, wrapT: t.wrapT,
    repeat: [t.repeat?.x, t.repeat?.y],
    offset: [t.offset?.x, t.offset?.y],
    rotation: t.rotation,
    center: [t.center?.x, t.center?.y],
    matrix: t.matrix ? Array.from(t.matrix.elements ?? []) : null,
  };
}

function matInfo(m) {
  if (!m) return null;
  const o = {
    type: m.type,
    name: m.name,
    uuid: m.uuid,
    color: m.color ? '#' + m.color.getHexString() : null,
    emissive: m.emissive ? '#' + m.emissive.getHexString() : null,
    emissiveIntensity: m.emissiveIntensity,
    emissiveMap: texInfo(m.emissiveMap),
    map: texInfo(m.map),
    normalMap: texInfo(m.normalMap),
    normalScale: m.normalScale ? [m.normalScale.x, m.normalScale.y] : null,
    roughnessMap: texInfo(m.roughnessMap),
    metalnessMap: texInfo(m.metalnessMap),
    aoMap: texInfo(m.aoMap),
    alphaMap: texInfo(m.alphaMap),
    lightMap: texInfo(m.lightMap),
    bumpMap: texInfo(m.bumpMap),
    displacementMap: texInfo(m.displacementMap),
    envMap: texInfo(m.envMap),
    roughness: m.roughness,
    metalness: m.metalness,
    opacity: m.opacity,
    transparent: m.transparent,
    alphaTest: m.alphaTest,
    side: m.side,
    depthWrite: m.depthWrite,
    vertexColors: m.vertexColors,
    flatShading: m.flatShading,
    defines: m.defines || null,
    userData: m.userData,
    skinning: !!m.isSkinnedMesh,
  };
  // FBXLoader leaves extras in userData / on the object
  return o;
}

// Gather materials from meshes
const meshMaterials = new Map(); // matName -> {meshes:Set, sampleMat}
const allMats = new Map();
fbx.traverse(o => {
  if (o.isMesh && o.material) {
    const arr = Array.isArray(o.material) ? o.material : [o.material];
    arr.forEach((m, i) => {
      if (!m) return;
      if (!allMats.has(m.uuid)) allMats.set(m.uuid, m);
      const e = meshMaterials.get(m.name) || { meshes: new Set(), count: 0 };
      e.meshes.add(o.name);
      e.count++;
      meshMaterials.set(m.name, e);
    });
  }
});

const result = {
  fbxPath,
  materialCount: allMats.size,
  materials: [...allMats.values()].map(matInfo),
  meshAssignments: [...meshMaterials.entries()].map(([name, e]) => ({
    material: name,
    meshCount: e.count,
    meshes: [...e.meshes].slice(0, 25),
  })),
  fbxUserDataKeys: Object.keys(fbx.userData || {}),
};

fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`materials: ${allMats.size}`);
console.log([...allMats.values()].map(m => `  - ${m.name} [${m.type}] color=${m.color ? '#' + m.color.getHexString() : 'n/a'} map=${!!m.map} rough=${m.roughness} metal=${m.metalness} opacity=${m.opacity}`).join('\n'));
