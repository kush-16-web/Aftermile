import fs from 'node:fs';
import path from 'node:path';

const raw = fs.readFileSync('public/models/r34/r34.glb');
const jsonChunkLength = raw.readUInt32LE(12);
const glb = JSON.parse(raw.toString('utf8', 20, 20 + jsonChunkLength));
const binHeaderOffset = 20 + jsonChunkLength;
const binChunkLength = raw.readUInt32LE(binHeaderOffset);
const binary = raw.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binChunkLength);

const DTYPES = {
  5121: (b, o) => b.readUInt8(o),
  5123: (b, o) => b.readUInt16LE(o),
  5125: (b, o) => b.readUInt32LE(o),
  5126: (b, o) => b.readFloatLE(o),
};
const DTYPE_BYTES = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
const WIDTHS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(index) {
  const a = glb.accessors[index];
  const view = glb.bufferViews[a.bufferView];
  const getter = DTYPES[a.componentType];
  const bytes = DTYPE_BYTES[a.componentType];
  const width = WIDTHS[a.type];
  const count = a.count;
  const baseOffset = (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || bytes * width;

  const result = [];
  for (let i = 0; i < count; i++) {
    const rowOffset = baseOffset + i * stride;
    const row = [];
    for (let w = 0; w < width; w++) {
      row.push(getter(binary, rowOffset + w * bytes));
    }
    result.push(row);
  }
  return result;
}

// Extract and save embedded images
fs.mkdirSync('scratch/r34_textures', { recursive: true });
console.log('=== EXTRACTING EMBEDDED IMAGES ===');
glb.images.forEach((img, idx) => {
  const v = glb.bufferViews[img.bufferView];
  const data = binary.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const outPath = `scratch/r34_textures/img_${idx}_${img.name || 'unnamed'}.${ext}`;
  fs.writeFileSync(outPath, data);
  console.log(`Image ${idx} (${img.name}): ${data.length} bytes -> ${outPath}`);
});

// Map textures to images
console.log('\n=== TEXTURES TO IMAGES MAPPING ===');
glb.textures.forEach((tex, idx) => {
  const imgIdx = tex.source;
  const img = glb.images[imgIdx];
  console.log(`Texture ${idx}: sourceImage=${imgIdx} (${img?.name})`);
});

// Analyze Body_23 (InteriorA_Material1), Body_25, Body_26, Body_31, Body_32, Body_34
console.log('\n=== MESH GEOMETRY & BOUNDS AUDIT ===');
const targetMeshNames = [
  'Body_23', // InteriorA_Material1
  'Body_24', // seat
  'Body_25', // InteriorA_Material1.001
  'Body_26', // InteriorTillingA_Material1
  'Body_31', // Paint_Material1
  'Body_32', // TexturedA_Material1 (Mirrors)
  'Body_34', // Window_Material1
];

glb.nodes.forEach(node => {
  if (node.mesh !== undefined) {
    const mesh = glb.meshes[node.mesh];
    const isTarget = targetMeshNames.some(t => node.name.includes(t));
    if (isTarget) {
      console.log(`\nNode "${node.name}" (Mesh ${node.mesh}: "${mesh.name}"):`);
      mesh.primitives.forEach((p, pIdx) => {
        const positions = readAccessor(p.attributes.POSITION);
        const normals = p.attributes.NORMAL !== undefined ? readAccessor(p.attributes.NORMAL) : null;
        const uvs = p.attributes.TEXCOORD_0 !== undefined ? readAccessor(p.attributes.TEXCOORD_0) : null;
        const indices = readAccessor(p.indices);
        
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;

        positions.forEach(pos => {
          if (pos[0] < minX) minX = pos[0];
          if (pos[0] > maxX) maxX = pos[0];
          if (pos[1] < minY) minY = pos[1];
          if (pos[1] > maxY) maxY = pos[1];
          if (pos[2] < minZ) minZ = pos[2];
          if (pos[2] > maxZ) maxZ = pos[2];
        });

        if (uvs) {
          uvs.forEach(uv => {
            if (uv[0] < minU) minU = uv[0];
            if (uv[0] > maxU) maxU = uv[0];
            if (uv[1] < minV) minV = uv[1];
            if (uv[1] > maxV) maxV = uv[1];
          });
        }

        console.log(`  Primitive ${pIdx}: mat=${p.material} ("${glb.materials[p.material]?.name}") tris=${indices.length / 3} verts=${positions.length}`);
        console.log(`    Bounds X: [${minX.toFixed(4)}, ${maxX.toFixed(4)}] width=${(maxX - minX).toFixed(4)}`);
        console.log(`    Bounds Y: [${minY.toFixed(4)}, ${maxY.toFixed(4)}] height=${(maxY - minY).toFixed(4)}`);
        console.log(`    Bounds Z: [${minZ.toFixed(4)}, ${maxZ.toFixed(4)}] depth=${(maxZ - minZ).toFixed(4)}`);
        if (uvs) {
          console.log(`    UV0 Bounds: U=[${minU.toFixed(4)}, ${maxU.toFixed(4)}], V=[${minV.toFixed(4)}, ${maxV.toFixed(4)}]`);
        }
      });
    }
  }
});
