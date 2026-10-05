import fs from 'node:fs';

const raw = fs.readFileSync('public/models/r34/r34.glb');
const magic = raw.readUInt32LE(0);
const jsonChunkLength = raw.readUInt32LE(12);
const jsonText = raw.toString('utf8', 20, 20 + jsonChunkLength);
const glb = JSON.parse(jsonText);

console.log('=== R34 RUNTIME GLB AUDIT ===');
console.log('Nodes count:', glb.nodes.length);
console.log('Meshes count:', glb.meshes.length);
console.log('Materials count:', glb.materials.length);
console.log('Textures count:', glb.textures?.length);
console.log('Images count:', glb.images?.length);

console.log('\n--- ALL BODY NODES ---');
glb.nodes.forEach((n, idx) => {
  if (n.name.startsWith('Body') || n.name.startsWith('Wheel')) {
    console.log(`Node ${idx}: "${n.name}" mesh=${n.mesh}`);
  }
});

console.log('\n--- ALL MESHES & MATERIALS ---');
glb.meshes.forEach((m, idx) => {
  m.primitives.forEach((p, pIdx) => {
    const mat = glb.materials[p.material];
    const matName = mat ? mat.name : 'none';
    const baseTex = mat?.pbrMetallicRoughness?.baseColorTexture;
    console.log(`Mesh ${idx} "${m.name}": matIndex=${p.material} ("${matName}") baseColorTex=${JSON.stringify(baseTex)} attrKeys=${Object.keys(p.attributes).join(',')}`);
  });
});

console.log('\n--- ALL MATERIALS & TEXTURE MAPS ---');
glb.materials.forEach((mat, idx) => {
  const pbr = mat.pbrMetallicRoughness || {};
  console.log(`Material ${idx} "${mat.name}": baseColorFactor=${JSON.stringify(pbr.baseColorFactor)} baseTex=${JSON.stringify(pbr.baseColorTexture)} emissiveFactor=${JSON.stringify(mat.emissiveFactor)} emissiveTex=${JSON.stringify(mat.emissiveTexture)}`);
});
