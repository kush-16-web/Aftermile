import fs from 'node:fs';

const raw = fs.readFileSync('public/models/r34/r34.glb');
const jsonChunkLength = raw.readUInt32LE(12);
const glb = JSON.parse(raw.toString('utf8', 20, 20 + jsonChunkLength));
const binHeaderOffset = 20 + jsonChunkLength;
const binChunkLength = raw.readUInt32LE(binHeaderOffset);
const binary = raw.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binChunkLength);

const DTYPES = {
  5121: { bytes: 1, getter: (b, o) => b.readUInt8(o) },
  5123: { bytes: 2, getter: (b, o) => b.readUInt16LE(o) },
  5125: { bytes: 4, getter: (b, o) => b.readUInt32LE(o) },
  5126: { bytes: 4, getter: (b, o) => b.readFloatLE(o) },
};
const WIDTHS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(index) {
  const a = glb.accessors[index];
  const view = glb.bufferViews[a.bufferView];
  const dtype = DTYPES[a.componentType];
  const width = WIDTHS[a.type];
  const count = a.count;
  const baseOffset = (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || dtype.bytes * width;

  const result = [];
  for (let i = 0; i < count; i++) {
    const rowOffset = baseOffset + i * stride;
    const row = [];
    for (let w = 0; w < width; w++) {
      row.push(dtype.getter(binary, rowOffset + w * dtype.bytes));
    }
    result.push(row);
  }
  return result;
}

// Extract all triangles from all meshes
const triangles = [];
glb.meshes.forEach((m, mIdx) => {
  m.primitives.forEach((p, pIdx) => {
    const pos = readAccessor(p.attributes.POSITION);
    const ind = readAccessor(p.indices);
    const matName = glb.materials[p.material]?.name || 'unknown';

    for (let i = 0; i < ind.length; i += 3) {
      const i0 = ind[i][0], i1 = ind[i+1][0], i2 = ind[i+2][0];
      triangles.push({
        meshName: m.name,
        matName,
        p0: pos[i0],
        p1: pos[i1],
        p2: pos[i2]
      });
    }
  });
});

console.log(`Loaded ${triangles.length} triangles for raycasting.`);

// Möller–Trumbore ray-triangle intersection
function rayTriangleIntersect(orig, dir, p0, p1, p2) {
  const EPSILON = 1e-7;
  const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
  const e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];

  const hx = dir[1] * e2z - dir[2] * e2y;
  const hy = dir[2] * e2x - dir[0] * e2z;
  const hz = dir[0] * e2y - dir[1] * e2x;

  const a = e1x * hx + e1y * hy + e1z * hz;
  if (a > -EPSILON && a < EPSILON) return null; // Ray parallel to triangle

  const f = 1.0 / a;
  const sx = orig[0] - p0[0], sy = orig[1] - p0[1], sz = orig[2] - p0[2];
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0.0 || u > 1.0) return null;

  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = f * (dir[0] * qx + dir[1] * qy + dir[2] * qz);
  if (v < 0.0 || u + v > 1.0) return null;

  const t = f * (e2x * qx + e2y * qy + e2z * qz);
  if (t > EPSILON) return t;
  return null;
}

function castRay(orig, dir, maxDist = 10.0) {
  let closestDist = maxDist;
  let hitTri = null;

  for (const tri of triangles) {
    const dist = rayTriangleIntersect(orig, dir, tri.p0, tri.p1, tri.p2);
    if (dist !== null && dist < closestDist) {
      closestDist = dist;
      hitTri = tri;
    }
  }
  return hitTri ? { dist: closestDist, ...hitTri } : null;
}

// Test multiple eye positions around [0.355, 1.050, -0.140]
const testPoints = [
  { name: 'Current baseEye', pos: [0.355, 1.050, -0.140] },
  { name: 'Forward 10cm', pos: [0.355, 1.050, -0.240] },
  { name: 'Forward 15cm', pos: [0.355, 1.050, -0.290] },
  { name: 'Forward 20cm', pos: [0.355, 1.050, -0.340] },
  { name: 'Lower 5cm, Forward 15cm', pos: [0.355, 1.000, -0.290] },
];

const dirs = [
  { name: 'FORWARD (-Z)', dir: [0, 0, -1] },
  { name: 'BACK (+Z)', dir: [0, 0, 1] },
  { name: 'UP (+Y)', dir: [0, 1, 0] },
  { name: 'DOWN (-Y)', dir: [0, -1, 0] },
  { name: 'LEFT (-X)', dir: [-1, 0, 0] },
  { name: 'RIGHT (+X)', dir: [1, 0, 0] },
];

testPoints.forEach(tp => {
  console.log(`\n==================================================`);
  console.log(`TESTING CAMERA POSITION: ${tp.name} (${tp.pos.join(', ')})`);
  console.log(`==================================================`);
  dirs.forEach(d => {
    const hit = castRay(tp.pos, d.dir);
    if (hit) {
      console.log(`  ${d.name}: Hit at ${hit.dist.toFixed(4)}m -> Mesh: "${hit.meshName}", Mat: "${hit.matName}"`);
    } else {
      console.log(`  ${d.name}: No hit within 10m`);
    }
  });
});
