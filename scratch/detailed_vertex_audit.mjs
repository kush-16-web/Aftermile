import fs from 'node:fs';

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

const p9 = glb.meshes[9].primitives[0];
const pos9 = readAccessor(p9.attributes.POSITION);
const norm9 = readAccessor(p9.attributes.NORMAL);
const uvs9 = readAccessor(p9.attributes.TEXCOORD_0);
const ind9 = readAccessor(p9.indices);

console.log('=== MFD SCREEN DETAILED VERTEX & UV AUDIT ===');
const mfdScreenTris = [];
for (let i = 0; i < ind9.length; i += 3) {
  const i0 = ind9[i][0], i1 = ind9[i+1][0], i2 = ind9[i+2][0];
  const p0 = pos9[i0], p1 = pos9[i1], p2 = pos9[i2];
  const n0 = norm9[i0], n1 = norm9[i1], n2 = norm9[i2];
  const cx = (p0[0] + p1[0] + p2[0]) / 3;
  const cy = (p0[1] + p1[1] + p2[1]) / 3;
  const cz = (p0[2] + p1[2] + p2[2]) / 3;
  const nz = (n0[2] + n1[2] + n2[2]) / 3;

  if (cx >= -0.08 && cx <= 0.06 && cy >= 0.84 && cy <= 0.94 && cz >= -0.56 && cz <= -0.50 && nz > 0.8) {
    mfdScreenTris.push({
      triIdx: i / 3,
      i0, i1, i2,
      p0, p1, p2,
      n0, n1, n2,
      u0: uvs9[i0], u1: uvs9[i1], u2: uvs9[i2]
    });
  }
}

console.log(`Total MFD Screen Tris: ${mfdScreenTris.length}`);
mfdScreenTris.forEach((t, idx) => {
  if (idx < 5 || idx >= mfdScreenTris.length - 2) {
    console.log(`  Tri ${idx} (Mesh9 Tri ${t.triIdx}):`);
    console.log(`    P0: [${t.p0.map(v=>v.toFixed(4)).join(', ')}] UV0: [${t.u0.map(v=>v.toFixed(4)).join(', ')}]`);
    console.log(`    P1: [${t.p1.map(v=>v.toFixed(4)).join(', ')}] UV1: [${t.u1.map(v=>v.toFixed(4)).join(', ')}]`);
    console.log(`    P2: [${t.p2.map(v=>v.toFixed(4)).join(', ')}] UV2: [${t.u2.map(v=>v.toFixed(4)).join(', ')}]`);
  }
});

// Check Mirror Glass in Mesh 3
console.log('\n=== MIRROR GLASS DETAILED VERTEX & UV AUDIT ===');
const p3 = glb.meshes[3].primitives[0];
const pos3 = readAccessor(p3.attributes.POSITION);
const norm3 = readAccessor(p3.attributes.NORMAL);
const uvs3 = readAccessor(p3.attributes.TEXCOORD_0);
const ind3 = readAccessor(p3.indices);

const leftMirrorTris = [];
const rightMirrorTris = [];
for (let i = 0; i < ind3.length; i += 3) {
  const i0 = ind3[i][0], i1 = ind3[i+1][0], i2 = ind3[i+2][0];
  const p0 = pos3[i0], p1 = pos3[i1], p2 = pos3[i2];
  const n0 = norm3[i0], n1 = norm3[i1], n2 = norm3[i2];
  const cx = (p0[0] + p1[0] + p2[0]) / 3;
  const cy = (p0[1] + p1[1] + p2[1]) / 3;
  const cz = (p0[2] + p1[2] + p2[2]) / 3;
  const nz = (n0[2] + n1[2] + n2[2]) / 3;

  if (cx >= 0.70 && cx <= 0.90 && cy >= 0.92 && cy <= 1.02 && cz >= -0.47 && cz <= -0.38 && nz > 0.6) {
    leftMirrorTris.push({ triIdx: i/3, i0, i1, i2, p0, p1, p2, u0: uvs3[i0], u1: uvs3[i1], u2: uvs3[i2] });
  }
  if (cx >= -0.90 && cx <= -0.70 && cy >= 0.92 && cy <= 1.02 && cz >= -0.47 && cz <= -0.38 && nz > 0.6) {
    rightMirrorTris.push({ triIdx: i/3, i0, i1, i2, p0, p1, p2, u0: uvs3[i0], u1: uvs3[i1], u2: uvs3[i2] });
  }
}
console.log(`Left Mirror Tris: ${leftMirrorTris.length}, Right Mirror Tris: ${rightMirrorTris.length}`);
console.log(`Left Mirror sample P0: [${leftMirrorTris[0].p0.map(v=>v.toFixed(4)).join(', ')}] UV0: [${leftMirrorTris[0].u0.map(v=>v.toFixed(4)).join(', ')}]`);
console.log(`Right Mirror sample P0: [${rightMirrorTris[0].p0.map(v=>v.toFixed(4)).join(', ')}] UV0: [${rightMirrorTris[0].u0.map(v=>v.toFixed(4)).join(', ')}]`);
