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

console.log('=== MFD DISPLAY SURFACE ANALYSIS ===');
// Check Mesh 9 (InteriorA_Material1)
const p9 = glb.meshes[9].primitives[0];
const pos9 = readAccessor(p9.attributes.POSITION);
const norm9 = readAccessor(p9.attributes.NORMAL);
const uvs9 = readAccessor(p9.attributes.TEXCOORD_0);
const ind9 = readAccessor(p9.indices);

// Find flat display panel in MFD region: X in [-0.10, 0.05], Y in [0.82, 0.94], Z in [-0.58, -0.48]
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
    mfdScreenTris.push({ i0, i1, i2, cx, cy, cz, p0, p1, p2, nz });
  }
}
console.log(`Found ${mfdScreenTris.length} planar MFD screen triangles in Mesh 9.`);
if (mfdScreenTris.length > 0) {
  const xs = mfdScreenTris.flatMap(t => [t.p0[0], t.p1[0], t.p2[0]]);
  const ys = mfdScreenTris.flatMap(t => [t.p0[1], t.p1[1], t.p2[1]]);
  const zs = mfdScreenTris.flatMap(t => [t.p0[2], t.p1[2], t.p2[2]]);
  console.log(`  Screen X range: [${Math.min(...xs).toFixed(4)}, ${Math.max(...xs).toFixed(4)}] width=${(Math.max(...xs) - Math.min(...xs)).toFixed(4)}`);
  console.log(`  Screen Y range: [${Math.min(...ys).toFixed(4)}, ${Math.max(...ys).toFixed(4)}] height=${(Math.max(...ys) - Math.min(...ys)).toFixed(4)}`);
  console.log(`  Screen Z range: [${Math.min(...zs).toFixed(4)}, ${Math.max(...zs).toFixed(4)}] depth=${(Math.max(...zs) - Math.min(...zs)).toFixed(4)}`);
  console.log(`  Screen Center: (${((Math.min(...xs)+Math.max(...xs))/2).toFixed(4)}, ${((Math.min(...ys)+Math.max(...ys))/2).toFixed(4)}, ${((Math.min(...zs)+Math.max(...zs))/2).toFixed(4)})`);
}

// Check Mirror Glass in Mesh 3 (Coloured_Material1) and Mesh 17 (Paint_Material1)
console.log('\n=== MIRROR GLASS SURFACE ANALYSIS ===');
const p3 = glb.meshes[3].primitives[0];
const pos3 = readAccessor(p3.attributes.POSITION);
const norm3 = readAccessor(p3.attributes.NORMAL);
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
    leftMirrorTris.push({ i0, i1, i2, cx, cy, cz, p0, p1, p2 });
  }
  if (cx >= -0.90 && cx <= -0.70 && cy >= 0.92 && cy <= 1.02 && cz >= -0.47 && cz <= -0.38 && nz > 0.6) {
    rightMirrorTris.push({ i0, i1, i2, cx, cy, cz, p0, p1, p2 });
  }
}
console.log(`Mesh 3 Left Mirror Glass Faces: ${leftMirrorTris.length}, Right Mirror Glass Faces: ${rightMirrorTris.length}`);
if (leftMirrorTris.length > 0) {
  const xs = leftMirrorTris.flatMap(t => [t.p0[0], t.p1[0], t.p2[0]]);
  const ys = leftMirrorTris.flatMap(t => [t.p0[1], t.p1[1], t.p2[1]]);
  const zs = leftMirrorTris.flatMap(t => [t.p0[2], t.p1[2], t.p2[2]]);
  console.log(`  Left Mirror Glass Center: (${((Math.min(...xs)+Math.max(...xs))/2).toFixed(4)}, ${((Math.min(...ys)+Math.max(...ys))/2).toFixed(4)}, ${((Math.min(...zs)+Math.max(...zs))/2).toFixed(4)})`);
  console.log(`  Left Mirror Size: width=${(Math.max(...xs) - Math.min(...xs)).toFixed(4)}, height=${(Math.max(...ys) - Math.min(...ys)).toFixed(4)}`);
}
if (rightMirrorTris.length > 0) {
  const xs = rightMirrorTris.flatMap(t => [t.p0[0], t.p1[0], t.p2[0]]);
  const ys = rightMirrorTris.flatMap(t => [t.p0[1], t.p1[1], t.p2[1]]);
  const zs = rightMirrorTris.flatMap(t => [t.p0[2], t.p1[2], t.p2[2]]);
  console.log(`  Right Mirror Glass Center: (${((Math.min(...xs)+Math.max(...xs))/2).toFixed(4)}, ${((Math.min(...ys)+Math.max(...ys))/2).toFixed(4)}, ${((Math.min(...zs)+Math.max(...zs))/2).toFixed(4)})`);
  console.log(`  Right Mirror Size: width=${(Math.max(...xs) - Math.min(...xs)).toFixed(4)}, height=${(Math.max(...ys) - Math.min(...ys)).toFixed(4)}`);
}
