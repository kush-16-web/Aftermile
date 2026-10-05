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

console.log('=== R34 MESH AND SEAT HIERARCHY AUDIT ===');
glb.nodes.forEach((n, idx) => {
  if (n.mesh !== undefined) {
    const m = glb.meshes[n.mesh];
    console.log(`Node ${idx} "${n.name}" -> Mesh ${n.mesh} "${m.name}"`);
  }
});

// Deep inspect Node Body_24 (seat)
const seatNode = glb.nodes.find(n => n.name === 'Body_24');
if (seatNode) {
  const mesh = glb.meshes[seatNode.mesh];
  const prim = mesh.primitives[0];
  const pos = readAccessor(prim.attributes.POSITION);
  const ind = readAccessor(prim.indices);

  console.log(`\nSeat Mesh (${mesh.name}): ${pos.length} vertices, ${ind.length / 3} triangles.`);

  // Analyze spatial split: Driver Seat is +X (RHD, X in [0.10, 0.65]), Passenger Seat is -X (X in [-0.65, -0.10]), Rear Seat is Z > 0.40
  let driverSeatTris = [];
  let passengerSeatTris = [];
  let rearSeatTris = [];

  for (let i = 0; i < ind.length; i += 3) {
    const i0 = ind[i][0], i1 = ind[i+1][0], i2 = ind[i+2][0];
    const p0 = pos[i0], p1 = pos[i1], p2 = pos[i2];
    const cx = (p0[0] + p1[0] + p2[0]) / 3;
    const cy = (p0[1] + p1[1] + p2[1]) / 3;
    const cz = (p0[2] + p1[2] + p2[2]) / 3;

    if (cz > 0.40) {
      rearSeatTris.push({ i0, i1, i2, cx, cy, cz });
    } else if (cx > 0.05) {
      driverSeatTris.push({ i0, i1, i2, cx, cy, cz });
    } else {
      passengerSeatTris.push({ i0, i1, i2, cx, cy, cz });
    }
  }

  console.log(`Driver Seat (Front Right): ${driverSeatTris.length} triangles`);
  console.log(`Passenger Seat (Front Left): ${passengerSeatTris.length} triangles`);
  console.log(`Rear Seat: ${rearSeatTris.length} triangles`);

  if (driverSeatTris.length > 0) {
    const xs = driverSeatTris.map(t => t.cx);
    const ys = driverSeatTris.map(t => t.cy);
    const zs = driverSeatTris.map(t => t.cz);
    console.log(`Driver Seat Bounds: X=[${Math.min(...xs).toFixed(4)}, ${Math.max(...xs).toFixed(4)}], Y=[${Math.min(...ys).toFixed(4)}, ${Math.max(...ys).toFixed(4)}], Z=[${Math.min(...zs).toFixed(4)}, ${Math.max(...zs).toFixed(4)}]`);
    
    // Headrest of driver seat is Y > 0.95
    const headrestTris = driverSeatTris.filter(t => t.cy > 0.95);
    console.log(`Driver Headrest (Y > 0.95): ${headrestTris.length} triangles, Y range: [${Math.min(...headrestTris.map(t=>t.cy)).toFixed(4)}, ${Math.max(...headrestTris.map(t=>t.cy)).toFixed(4)}], Z range: [${Math.min(...headrestTris.map(t=>t.cz)).toFixed(4)}, ${Math.max(...headrestTris.map(t=>t.cz)).toFixed(4)}]`);
  }
}
