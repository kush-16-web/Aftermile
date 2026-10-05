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

// Let's find connected components in Mesh 9, Mesh 3, Mesh 17 for:
// 1. Center MFD display surface (screen)
// 2. Gauge cluster (speedometer, tachometer)
// 3. Mirror glass surfaces (left and right)

const p9 = glb.meshes[9].primitives[0];
const pos9 = readAccessor(p9.attributes.POSITION);
const norm9 = readAccessor(p9.attributes.NORMAL);
const uvs9 = readAccessor(p9.attributes.TEXCOORD_0);
const ind9 = readAccessor(p9.indices);

// Let's find all triangles in Mesh 9 near dashboard center X in [-0.15, 0.10], Y in [0.75, 1.00], Z in [-0.60, -0.40]
const centerDashboardTris = [];
for (let i = 0; i < ind9.length; i += 3) {
  const i0 = ind9[i][0], i1 = ind9[i+1][0], i2 = ind9[i+2][0];
  const p0 = pos9[i0], p1 = pos9[i1], p2 = pos9[i2];
  const n0 = norm9[i0], n1 = norm9[i1], n2 = norm9[i2];
  const cx = (p0[0] + p1[0] + p2[0]) / 3;
  const cy = (p0[1] + p1[1] + p2[1]) / 3;
  const cz = (p0[2] + p1[2] + p2[2]) / 3;
  const nz = (n0[2] + n1[2] + n2[2]) / 3;

  if (cx >= -0.15 && cx <= 0.10 && cy >= 0.78 && cy <= 0.95 && cz >= -0.60 && cz <= -0.45) {
    centerDashboardTris.push({
      i: i/3, i0, i1, i2,
      cx, cy, cz, nz,
      p0, p1, p2,
      u0: uvs9[i0], u1: uvs9[i1], u2: uvs9[i2],
      n0, n1, n2
    });
  }
}

console.log(`Center Dashboard Triangles: ${centerDashboardTris.length}`);

// Group by UV coordinates to identify distinct mapped sub-surfaces on the dashboard
const uvGroups = {};
centerDashboardTris.forEach(t => {
  const uAvg = ((t.u0[0] + t.u1[0] + t.u2[0]) / 3).toFixed(3);
  const vAvg = ((t.u0[1] + t.u1[1] + t.u2[1]) / 3).toFixed(3);
  const key = `${uAvg},${vAvg}`;
  uvGroups[key] = (uvGroups[key] || 0) + 1;
});
console.log('UV groups in center dashboard:');
Object.entries(uvGroups).sort((a,b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => {
  console.log(`  UV (${k}): ${v} triangles`);
});

// Let's also check Gauge Cluster region: X in [0.20, 0.50], Y in [0.75, 0.95], Z in [-0.60, -0.40]
const gaugeTris = [];
for (let i = 0; i < ind9.length; i += 3) {
  const i0 = ind9[i][0], i1 = ind9[i+1][0], i2 = ind9[i+2][0];
  const p0 = pos9[i0], p1 = pos9[i1], p2 = pos9[i2];
  const cx = (p0[0] + p1[0] + p2[0]) / 3;
  const cy = (p0[1] + p1[1] + p2[1]) / 3;
  const cz = (p0[2] + p1[2] + p2[2]) / 3;

  if (cx >= 0.20 && cx <= 0.50 && cy >= 0.78 && cy <= 0.95 && cz >= -0.60 && cz <= -0.40) {
    gaugeTris.push({
      i: i/3, i0, i1, i2,
      cx, cy, cz,
      p0, p1, p2,
      u0: uvs9[i0], u1: uvs9[i1], u2: uvs9[i2]
    });
  }
}
console.log(`\nGauge Cluster Triangles in Mesh 9: ${gaugeTris.length}`);
const gaugeUvGroups = {};
gaugeTris.forEach(t => {
  const uAvg = ((t.u0[0] + t.u1[0] + t.u2[0]) / 3).toFixed(3);
  const vAvg = ((t.u0[1] + t.u1[1] + t.u2[1]) / 3).toFixed(3);
  const key = `${uAvg},${vAvg}`;
  gaugeUvGroups[key] = (gaugeUvGroups[key] || 0) + 1;
});
console.log('UV groups in gauge cluster:');
Object.entries(gaugeUvGroups).sort((a,b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => {
  console.log(`  UV (${k}): ${v} triangles`);
});
