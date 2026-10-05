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

// Find all meshes in the model
console.log('=== SEARCHING FOR INTERIOR/DISPLAY AND MIRROR GEOMETRY IN ALL MESHES ===');

glb.meshes.forEach((m, mIdx) => {
  m.primitives.forEach((p, pIdx) => {
    const pos = readAccessor(p.attributes.POSITION);
    const uvs = p.attributes.TEXCOORD_0 !== undefined ? readAccessor(p.attributes.TEXCOORD_0) : null;
    const normals = p.attributes.NORMAL !== undefined ? readAccessor(p.attributes.NORMAL) : null;
    const indices = readAccessor(p.indices);
    const mat = glb.materials[p.material];

    // Let's search triangles in specific spatial regions:
    // 1. Center MFD display region: X in [-0.20, 0.10], Y in [0.75, 1.05], Z in [-0.70, -0.35]
    // 2. Gauge cluster region: X in [0.15, 0.55], Y in [0.75, 1.05], Z in [-0.70, -0.35]
    // 3. Left mirror region: X in [0.70, 1.05], Y in [0.80, 1.15], Z in [-0.60, 0.00]
    // 4. Right mirror region: X in [-1.05, -0.70], Y in [0.80, 1.15], Z in [-0.60, 0.00]

    let mfdTris = [];
    let gaugeTris = [];
    let leftMirrorTris = [];
    let rightMirrorTris = [];

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i][0], i1 = indices[i+1][0], i2 = indices[i+2][0];
      const p0 = pos[i0], p1 = pos[i1], p2 = pos[i2];
      const cx = (p0[0] + p1[0] + p2[0]) / 3;
      const cy = (p0[1] + p1[1] + p2[1]) / 3;
      const cz = (p0[2] + p1[2] + p2[2]) / 3;

      if (cx >= -0.20 && cx <= 0.10 && cy >= 0.75 && cy <= 1.05 && cz >= -0.70 && cz <= -0.35) {
        mfdTris.push({ i0, i1, i2, cx, cy, cz, p0, p1, p2 });
      }
      if (cx >= 0.15 && cx <= 0.55 && cy >= 0.75 && cy <= 1.05 && cz >= -0.70 && cz <= -0.35) {
        gaugeTris.push({ i0, i1, i2, cx, cy, cz, p0, p1, p2 });
      }
      if (cx >= 0.70 && cx <= 1.05 && cy >= 0.80 && cy <= 1.15 && cz >= -0.60 && cz <= 0.00) {
        leftMirrorTris.push({ i0, i1, i2, cx, cy, cz, p0, p1, p2 });
      }
      if (cx >= -1.05 && cx <= -0.70 && cy >= 0.80 && cy <= 1.15 && cz >= -0.60 && cz <= 0.00) {
        rightMirrorTris.push({ i0, i1, i2, cx, cy, cz, p0, p1, p2 });
      }
    }

    if (mfdTris.length > 0) {
      console.log(`\nMesh ${mIdx} ("${m.name}"), Mat ${p.material} ("${mat?.name}"): MFD region tris=${mfdTris.length}`);
      // Find planar surface in MFD region
      const xs = mfdTris.map(t => t.cx);
      const ys = mfdTris.map(t => t.cy);
      const zs = mfdTris.map(t => t.cz);
      console.log(`  MFD Tri Bounds X: [${Math.min(...xs).toFixed(4)}, ${Math.max(...xs).toFixed(4)}]`);
      console.log(`  MFD Tri Bounds Y: [${Math.min(...ys).toFixed(4)}, ${Math.max(...ys).toFixed(4)}]`);
      console.log(`  MFD Tri Bounds Z: [${Math.min(...zs).toFixed(4)}, ${Math.max(...zs).toFixed(4)}]`);
      if (uvs) {
        const uList = mfdTris.flatMap(t => [uvs[t.i0][0], uvs[t.i1][0], uvs[t.i2][0]]);
        const vList = mfdTris.flatMap(t => [uvs[t.i0][1], uvs[t.i1][1], uvs[t.i2][1]]);
        console.log(`  MFD UV Bounds: U=[${Math.min(...uList).toFixed(4)}, ${Math.max(...uList).toFixed(4)}], V=[${Math.min(...vList).toFixed(4)}, ${Math.max(...vList).toFixed(4)}]`);
      }
    }

    if (leftMirrorTris.length > 0) {
      console.log(`\nMesh ${mIdx} ("${m.name}"), Mat ${p.material} ("${mat?.name}"): Left Mirror region tris=${leftMirrorTris.length}`);
      const xs = leftMirrorTris.map(t => t.cx);
      const ys = leftMirrorTris.map(t => t.cy);
      const zs = leftMirrorTris.map(t => t.cz);
      console.log(`  Left Mirror Tri Bounds X: [${Math.min(...xs).toFixed(4)}, ${Math.max(...xs).toFixed(4)}]`);
      console.log(`  Left Mirror Tri Bounds Y: [${Math.min(...ys).toFixed(4)}, ${Math.max(...ys).toFixed(4)}]`);
      console.log(`  Left Mirror Tri Bounds Z: [${Math.min(...zs).toFixed(4)}, ${Math.max(...zs).toFixed(4)}]`);
      if (uvs) {
        const uList = leftMirrorTris.flatMap(t => [uvs[t.i0][0], uvs[t.i1][0], uvs[t.i2][0]]);
        const vList = leftMirrorTris.flatMap(t => [uvs[t.i0][1], uvs[t.i1][1], uvs[t.i2][1]]);
        console.log(`  Left Mirror UV Bounds: U=[${Math.min(...uList).toFixed(4)}, ${Math.max(...uList).toFixed(4)}], V=[${Math.min(...vList).toFixed(4)}, ${Math.max(...vList).toFixed(4)}]`);
      }
    }

    if (rightMirrorTris.length > 0) {
      console.log(`\nMesh ${mIdx} ("${m.name}"), Mat ${p.material} ("${mat?.name}"): Right Mirror region tris=${rightMirrorTris.length}`);
      const xs = rightMirrorTris.map(t => t.cx);
      const ys = rightMirrorTris.map(t => t.cy);
      const zs = rightMirrorTris.map(t => t.cz);
      console.log(`  Right Mirror Tri Bounds X: [${Math.min(...xs).toFixed(4)}, ${Math.max(...xs).toFixed(4)}]`);
      console.log(`  Right Mirror Tri Bounds Y: [${Math.min(...ys).toFixed(4)}, ${Math.max(...ys).toFixed(4)}]`);
      console.log(`  Right Mirror Tri Bounds Z: [${Math.min(...zs).toFixed(4)}, ${Math.max(...zs).toFixed(4)}]`);
      if (uvs) {
        const uList = rightMirrorTris.flatMap(t => [uvs[t.i0][0], uvs[t.i1][0], uvs[t.i2][0]]);
        const vList = rightMirrorTris.flatMap(t => [uvs[t.i0][1], uvs[t.i1][1], uvs[t.i2][1]]);
        console.log(`  Right Mirror UV Bounds: U=[${Math.min(...uList).toFixed(4)}, ${Math.max(...uList).toFixed(4)}], V=[${Math.min(...vList).toFixed(4)}, ${Math.max(...vList).toFixed(4)}]`);
      }
    }
  });
});
