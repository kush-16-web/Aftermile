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

// Inspect image 18 (Image_5, which is texture 18 for InteriorA_Material1)
// Let's find out where the MFD screen is mapped in Mesh 9 (InteriorA_Material1)
const p9 = glb.meshes[9].primitives[0];
const pos9 = readAccessor(p9.attributes.POSITION);
const norm9 = readAccessor(p9.attributes.NORMAL);
const uvs9 = readAccessor(p9.attributes.TEXCOORD_0);
const ind9 = readAccessor(p9.indices);

console.log('=== DEEP ANALYSIS OF MESH 9 (InteriorA_Material1) TRIANGLES ===');
// Search for triangles facing rear (+Z normal) in the center dashboard area (X in [-0.15, 0.10], Y in [0.78, 0.95], Z in [-0.60, -0.45])
const mfdCandidates = [];
for (let i = 0; i < ind9.length; i += 3) {
  const i0 = ind9[i][0], i1 = ind9[i+1][0], i2 = ind9[i+2][0];
  const p0 = pos9[i0], p1 = pos9[i1], p2 = pos9[i2];
  const n0 = norm9[i0], n1 = norm9[i1], n2 = norm9[i2];
  const cx = (p0[0] + p1[0] + p2[0]) / 3;
  const cy = (p0[1] + p1[1] + p2[1]) / 3;
  const cz = (p0[2] + p1[2] + p2[2]) / 3;
  const nz = (n0[2] + n1[2] + n2[2]) / 3;
  const ny = (n0[1] + n1[1] + n2[1]) / 3;
  const nx = (n0[0] + n1[0] + n2[0]) / 3;

  if (cx >= -0.15 && cx <= 0.05 && cy >= 0.80 && cy <= 0.98 && cz >= -0.65 && cz <= -0.45) {
    mfdCandidates.push({
      i: i/3, i0, i1, i2,
      cx, cy, cz, nx, ny, nz,
      p0, p1, p2,
      u0: uvs9[i0], u1: uvs9[i1], u2: uvs9[i2]
    });
  }
}

console.log(`Found ${mfdCandidates.length} MFD candidate triangles in Mesh 9.`);
// Group candidate triangles by nearly identical normal or spatial clusters
mfdCandidates.sort((a, b) => b.nz - a.nz);
console.log('Top 10 most rear-facing (+Z normal) triangles in center display region:');
mfdCandidates.slice(0, 10).forEach(c => {
  console.log(`  Tri ${c.i}: center=(${c.cx.toFixed(3)}, ${c.cy.toFixed(3)}, ${c.cz.toFixed(3)}) norm=(${c.nx.toFixed(3)}, ${c.ny.toFixed(3)}, ${c.nz.toFixed(3)})`);
  console.log(`    UV0: (${c.u0[0].toFixed(3)}, ${c.u0[1].toFixed(3)}), UV1: (${c.u1[0].toFixed(3)}, ${c.u1[1].toFixed(3)}), UV2: (${c.u2[0].toFixed(3)}, ${c.u2[1].toFixed(3)})`);
});

// Now inspect Mesh 3 (Coloured_Material1) and Mesh 17 (Paint_Material1) in mirror glass area (X around +/-0.85, Y around 0.90..1.00, Z around -0.40..-0.10)
console.log('\n=== DEEP ANALYSIS OF SIDE MIRRORS ===');
[3, 17, 18].forEach(mIdx => {
  const m = glb.meshes[mIdx];
  const p = m.primitives[0];
  const pos = readAccessor(p.attributes.POSITION);
  const norm = readAccessor(p.attributes.NORMAL);
  const uvs = p.attributes.TEXCOORD_0 ? readAccessor(p.attributes.TEXCOORD_0) : null;
  const ind = readAccessor(p.indices);

  const mirrorTris = [];
  for (let i = 0; i < ind.length; i += 3) {
    const i0 = ind[i][0], i1 = ind[i+1][0], i2 = ind[i+2][0];
    const p0 = pos[i0], p1 = pos[i1], p2 = pos[i2];
    const n0 = norm[i0], n1 = norm[i1], n2 = norm[i2];
    const cx = (p0[0] + p1[0] + p2[0]) / 3;
    const cy = (p0[1] + p1[1] + p2[1]) / 3;
    const cz = (p0[2] + p1[2] + p2[2]) / 3;
    const nz = (n0[2] + n1[2] + n2[2]) / 3;
    const ny = (n0[1] + n1[1] + n2[1]) / 3;
    const nx = (n0[0] + n1[0] + n2[0]) / 3;

    // Side mirror glass faces rearwards (+Z) and slightly outwards
    if (Math.abs(cx) >= 0.75 && Math.abs(cx) <= 0.95 && cy >= 0.88 && cy <= 1.02 && cz >= -0.45 && cz <= -0.15) {
      mirrorTris.push({
        i: i/3, i0, i1, i2,
        cx, cy, cz, nx, ny, nz,
        p0, p1, p2,
        u0: uvs ? uvs[i0] : null
      });
    }
  }

  console.log(`Mesh ${mIdx} ("${m.name}"): ${mirrorTris.length} mirror-area triangles.`);
  const rearFacing = mirrorTris.filter(t => t.nz > 0.5);
  console.log(`  Of which ${rearFacing.length} are strongly rear-facing (nz > 0.5):`);
  rearFacing.slice(0, 8).forEach(c => {
    console.log(`    Tri ${c.i}: side=${c.cx > 0 ? 'LEFT' : 'RIGHT'} center=(${c.cx.toFixed(3)}, ${c.cy.toFixed(3)}, ${c.cz.toFixed(3)}) norm=(${c.nx.toFixed(3)}, ${c.ny.toFixed(3)}, ${c.nz.toFixed(3)}) UV0=${c.u0 ? `(${c.u0[0].toFixed(3)}, ${c.u0[1].toFixed(3)})` : 'none'}`);
  });
});
