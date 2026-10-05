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

console.log('=== GAUGE CLUSTER DEEP AUDIT ===');
const p9 = glb.meshes[9].primitives[0];
const pos9 = readAccessor(p9.attributes.POSITION);
const norm9 = readAccessor(p9.attributes.NORMAL);
const uvs9 = readAccessor(p9.attributes.TEXCOORD_0);
const ind9 = readAccessor(p9.indices);

const gaugeTris = [];
for (let i = 0; i < ind9.length; i += 3) {
  const i0 = ind9[i][0], i1 = ind9[i+1][0], i2 = ind9[i+2][0];
  const p0 = pos9[i0], p1 = pos9[i1], p2 = pos9[i2];
  const n0 = norm9[i0], n1 = norm9[i1], n2 = norm9[i2];
  const cx = (p0[0] + p1[0] + p2[0]) / 3;
  const cy = (p0[1] + p1[1] + p2[1]) / 3;
  const cz = (p0[2] + p1[2] + p2[2]) / 3;
  const nz = (n0[2] + n1[2] + n2[2]) / 3;

  if (cx >= 0.20 && cx <= 0.45 && cy >= 0.80 && cy <= 0.95 && cz >= -0.55 && cz <= -0.42 && nz > 0.7) {
    gaugeTris.push({ triIdx: i/3, cx, cy, cz, nz, u0: uvs9[i0], p0 });
  }
}
console.log(`Found ${gaugeTris.length} rear-facing instrument cluster / gauge faces in Mesh 9.`);
const xs = gaugeTris.map(t => t.cx);
const ys = gaugeTris.map(t => t.cy);
const zs = gaugeTris.map(t => t.cz);
console.log(`  Gauge Cluster Bounds: X=[${Math.min(...xs).toFixed(4)}, ${Math.max(...xs).toFixed(4)}], Y=[${Math.min(...ys).toFixed(4)}, ${Math.max(...ys).toFixed(4)}], Z=[${Math.min(...zs).toFixed(4)}, ${Math.max(...zs).toFixed(4)}]`);
console.log(`  Gauge Cluster Center: (${((Math.min(...xs)+Math.max(...xs))/2).toFixed(4)}, ${((Math.min(...ys)+Math.max(...ys))/2).toFixed(4)}, ${((Math.min(...zs)+Math.max(...zs))/2).toFixed(4)})`);
