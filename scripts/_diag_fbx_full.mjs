// TEMPORARY DIAGNOSTIC — full FBX material dump incl. Phong specular/shininess + texture links.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import fs from 'fs';
import path from 'path';

globalThis.window = { URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} } };
globalThis.document = {
  createElementNS: (ns, name) => (name === 'img' ? { src: '', addEventListener: () => {}, removeEventListener: () => {} } : {}),
  createElement: (name) => (name === 'canvas' ? { getContext: () => null, width: 0, height: 0 } : {}),
};
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(b) { b.arrayBuffer().then(x => { this.result = x; this.onload?.({ target: this }); this.onloadend?.({ target: this }); }); }
  readAsDataURL(b) { b.arrayBuffer().then(x => { this.result = 'data:;base64,' + Buffer.from(x).toString('base64'); this.onload?.({ target: this }); this.onloadend?.({ target: this }); }); }
};

const fbxPath = process.argv[2];
const buf = fs.readFileSync(fbxPath);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const fbx = new FBXLoader().parse(ab, path.dirname(fbxPath) + path.sep);

function t(t) {
  if (!t) return null;
  return {
    name: t.name, image: t.image?.src ?? t.sourceFile ?? null,
    colorSpace: t.colorSpace, flipY: t.flipY, wrap: [t.wrapS, t.wrapT],
    repeat: [t.repeat.x, t.repeat.y], offset: [t.offset.x, t.offset.y],
    rotation: t.rotation, center: [t.center.x, t.center.y],
    uv: t.channel, premultiplyAlpha: t.premultiplyAlpha, generateMipmaps: t.generateMipmaps,
    minFilter: t.minFilter, magFilter: t.magFilter, anisotropy: t.anisotropy,
  };
}

const seen = new Map();
const assign = new Map();
fbx.traverse(o => {
  if (!o.isMesh || !o.material) return;
  const arr = Array.isArray(o.material) ? o.material : [o.material];
  arr.forEach(m => {
    if (!m) return;
    if (!seen.has(m.uuid)) seen.set(m.uuid, m);
    const e = assign.get(m.name) || { count: 0, meshes: new Set() };
    e.count++; e.meshes.add(o.name); assign.set(m.name, e);
  });
});

const out = [...seen.values()].map(m => ({
  name: m.name, type: m.type,
  diffuseColor: m.color ? '#' + m.color.getHexString() : null,
  specular: m.specular ? '#' + m.specular.getHexString() : null,
  shininess: m.shininess ?? null,   // FBX shininess -> roughness proxy
  emissive: m.emissive ? '#' + m.emissive.getHexString() : null,
  reflectivity: m.reflectivity ?? null,
  map: t(m.map),
  normalMap: t(m.normalMap), normalScale: m.normalScale ? [m.normalScale.x, m.normalScale.y] : null,
  bumpMap: t(m.bumpMap), bumpScale: m.bumpScale ?? null,
  specularMap: t(m.specularMap),
  emissiveMap: t(m.emissiveMap),
  aoMap: t(m.aoMap), lightMap: t(m.lightMap), alphaMap: t(m.alphaMap),
  roughnessMap: t(m.roughnessMap), metalnessMap: t(m.metalnessMap),
  opacity: m.opacity, transparent: m.transparent, alphaTest: m.alphaTest,
  side: m.side, depthWrite: m.depthWrite, flatShading: m.flatShading,
  vertexColors: m.vertexColors,
  blending: m.blending, blendingSrcFactor: m.blendingSrcFactor,
  envMapIntensity: m.envMapIntensity,
  wireframe: m.wireframe, visibility: m.visible,
  defines: m.defines ?? null,
  meshCount: assign.get(m.name)?.count ?? 0,
  sampleMeshes: [...(assign.get(m.name)?.meshes ?? [])].slice(0, 20),
}));

console.log(JSON.stringify(out, null, 2));
