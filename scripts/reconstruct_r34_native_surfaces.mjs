import fs from 'node:fs';
import path from 'node:path';

const GLB_PATH = 'public/models/r34/r34.glb';
const BACKUP_PATH = 'public/models/r34/r34.glb.bak';

if (!fs.existsSync(BACKUP_PATH)) {
  fs.copyFileSync(GLB_PATH, BACKUP_PATH);
  console.log(`Created backup at ${BACKUP_PATH}`);
}

const raw = fs.readFileSync(GLB_PATH);
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

// Build new GLB
const outGlb = {
  asset: glb.asset,
  scene: 0,
  scenes: [{ nodes: [] }],
  nodes: [],
  meshes: [],
  materials: JSON.parse(JSON.stringify(glb.materials)),
  textures: JSON.parse(JSON.stringify(glb.textures || [])),
  samplers: JSON.parse(JSON.stringify(glb.samplers || [])),
  images: [],
  buffers: [],
  bufferViews: [],
  accessors: [],
  extensionsUsed: glb.extensionsUsed || [],
};

const bufferChunks = [];
let bufferLength = 0;

function addView(data, target) {
  while (bufferLength % 4) {
    bufferChunks.push(Buffer.alloc(1));
    bufferLength++;
  }
  const info = { buffer: 0, byteOffset: bufferLength, byteLength: data.length };
  if (target) info.target = target;
  outGlb.bufferViews.push(info);
  bufferChunks.push(data);
  bufferLength += data.length;
  return outGlb.bufferViews.length - 1;
}

function addAccessor(values, isIndex) {
  let buf;
  let compType;
  let type;
  let min;
  let max;

  if (isIndex) {
    compType = 5125; // UNSIGNED_INT
    type = 'SCALAR';
    buf = Buffer.alloc(values.length * 4);
    for (let i = 0; i < values.length; i++) {
      buf.writeUInt32LE(values[i][0], i * 4);
    }
  } else {
    compType = 5126; // FLOAT
    const width = values[0].length;
    type = width === 1 ? 'SCALAR' : 'VEC' + width;
    buf = Buffer.alloc(values.length * width * 4);
    min = new Array(width).fill(Infinity);
    max = new Array(width).fill(-Infinity);

    for (let i = 0; i < values.length; i++) {
      for (let w = 0; w < width; w++) {
        const v = values[i][w];
        buf.writeFloatLE(v, (i * width + w) * 4);
        if (v < min[w]) min[w] = v;
        if (v > max[w]) max[w] = v;
      }
    }
  }

  const viewIdx = addView(buf, isIndex ? 34963 : 34962);
  const info = {
    bufferView: viewIdx,
    componentType: compType,
    count: values.length,
    type,
  };
  if (!isIndex) {
    info.min = min;
    info.max = max;
  }
  outGlb.accessors.push(info);
  return outGlb.accessors.length - 1;
}

// Copy original images
for (const img of glb.images) {
  const v = glb.bufferViews[img.bufferView];
  const imgData = binary.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const viewIdx = addView(imgData);
  outGlb.images.push({ ...img, bufferView: viewIdx });
}

// Add custom materials for MFD and Mirrors
const matMfdIdx = outGlb.materials.length;
outGlb.materials.push({
  name: 'Cockpit_MFD_Material',
  pbrMetallicRoughness: {
    baseColorFactor: [1, 1, 1, 1],
    roughnessFactor: 0.1,
    metallicFactor: 0.0,
  },
});

const matLeftMirrorIdx = outGlb.materials.length;
outGlb.materials.push({
  name: 'Cockpit_Mirror_Left_Material',
  pbrMetallicRoughness: {
    baseColorFactor: [1, 1, 1, 1],
    roughnessFactor: 0.0,
    metallicFactor: 0.0,
  },
});

const matRightMirrorIdx = outGlb.materials.length;
outGlb.materials.push({
  name: 'Cockpit_Mirror_Right_Material',
  pbrMetallicRoughness: {
    baseColorFactor: [1, 1, 1, 1],
    roughnessFactor: 0.0,
    metallicFactor: 0.0,
  },
});

// Process meshes
const bodyNodeIdx = 0; // will be parent node for body meshes
const rootNodes = [];

function buildMeshPrimitive(posArr, normArr, uvArr, uv1Arr, indicesArr, materialIdx, name) {
  const attributes = {
    POSITION: addAccessor(posArr, false),
    NORMAL: addAccessor(normArr, false),
  };
  if (uvArr && uvArr.length > 0) {
    attributes.TEXCOORD_0 = addAccessor(uvArr, false);
  }
  if (uv1Arr && uv1Arr.length > 0) {
    attributes.TEXCOORD_1 = addAccessor(uv1Arr, false);
  }
  const indicesAcc = addAccessor(indicesArr.map(idx => [idx]), true);
  const meshIdx = outGlb.meshes.length;
  outGlb.meshes.push({
    name,
    primitives: [{ attributes, indices: indicesAcc, material: materialIdx }],
  });
  return meshIdx;
}

// We will recreate node hierarchy
const nodeMapping = new Map();
glb.nodes.forEach((n, idx) => {
  const newNode = {
    name: n.name,
    children: [],
  };
  if (n.translation) newNode.translation = n.translation;
  if (n.rotation) newNode.rotation = n.rotation;
  if (n.scale) newNode.scale = n.scale;
  outGlb.nodes.push(newNode);
  nodeMapping.set(idx, outGlb.nodes.length - 1);
});

// Link parent-children
glb.nodes.forEach((n, idx) => {
  if (n.children) {
    outGlb.nodes[nodeMapping.get(idx)].children = n.children.map(c => nodeMapping.get(c));
  }
});
glb.scenes[0].nodes.forEach(rn => {
  outGlb.scenes[0].nodes.push(nodeMapping.get(rn));
});

// Now handle each mesh
glb.meshes.forEach((m, mIdx) => {
  // Find which node uses this mesh
  const nodeIdx = glb.nodes.findIndex(n => n.mesh === mIdx);
  const p = m.primitives[0];
  const pos = readAccessor(p.attributes.POSITION);
  const norm = readAccessor(p.attributes.NORMAL);
  const uvs = p.attributes.TEXCOORD_0 !== undefined ? readAccessor(p.attributes.TEXCOORD_0) : null;
  const uv1s = p.attributes.TEXCOORD_1 !== undefined ? readAccessor(p.attributes.TEXCOORD_1) : null;
  const ind = readAccessor(p.indices);

  if (mIdx === 9) {
    // Mesh 9 contains InteriorA_Material1. We split out the 60 MFD screen triangles!
    const mainFaces = [];
    const mfdFaces = [];

    for (let i = 0; i < ind.length; i += 3) {
      const i0 = ind[i][0], i1 = ind[i+1][0], i2 = ind[i+2][0];
      const p0 = pos[i0], p1 = pos[i1], p2 = pos[i2];
      const n0 = norm[i0], n1 = norm[i1], n2 = norm[i2];
      const cx = (p0[0] + p1[0] + p2[0]) / 3;
      const cy = (p0[1] + p1[1] + p2[1]) / 3;
      const cz = (p0[2] + p1[2] + p2[2]) / 3;
      const nz = (n0[2] + n1[2] + n2[2]) / 3;

      if (cx >= -0.08 && cx <= 0.06 && cy >= 0.84 && cy <= 0.94 && cz >= -0.56 && cz <= -0.50 && nz > 0.8) {
        mfdFaces.push([i0, i1, i2]);
      } else {
        mainFaces.push([i0, i1, i2]);
      }
    }

    console.log(`Mesh 9 split: ${mainFaces.length} main tris, ${mfdFaces.length} MFD screen tris.`);

    // 1. Rebuild main Interior mesh without MFD screen
    const usedMain = new Set();
    mainFaces.forEach(f => { usedMain.add(f[0]); usedMain.add(f[1]); usedMain.add(f[2]); });
    const sortedMain = Array.from(usedMain).sort((a, b) => a - b);
    const mainMap = new Map();
    sortedMain.forEach((oldIdx, newIdx) => mainMap.set(oldIdx, newIdx));

    const newPosMain = sortedMain.map(i => pos[i]);
    const newNormMain = sortedMain.map(i => norm[i]);
    const newUvMain = uvs ? sortedMain.map(i => uvs[i]) : null;
    const newIndMain = mainFaces.flatMap(f => [mainMap.get(f[0]), mainMap.get(f[1]), mainMap.get(f[2])]);

    const newMeshIdx9 = buildMeshPrimitive(newPosMain, newNormMain, newUvMain, null, newIndMain, p.material, m.name);
    outGlb.nodes[nodeMapping.get(nodeIdx)].mesh = newMeshIdx9;

    // 2. Build dedicated Cockpit_MFD_Screen mesh with clean normalized [0..1] UVs
    const usedMfd = new Set();
    mfdFaces.forEach(f => { usedMfd.add(f[0]); usedMfd.add(f[1]); usedMfd.add(f[2]); });
    const sortedMfd = Array.from(usedMfd).sort((a, b) => a - b);
    const mfdMap = new Map();
    sortedMfd.forEach((oldIdx, newIdx) => mfdMap.set(oldIdx, newIdx));

    const newPosMfd = sortedMfd.map(i => pos[i]);
    const newNormMfd = sortedMfd.map(i => norm[i]);
    
    // Normalize UVs for MFD screen: X is [-0.0926..0.0896], Y is [0.8501..0.9450]
    let minX = Math.min(...newPosMfd.map(p => p[0]));
    let maxX = Math.max(...newPosMfd.map(p => p[0]));
    let minY = Math.min(...newPosMfd.map(p => p[1]));
    let maxY = Math.max(...newPosMfd.map(p => p[1]));

    const newUvMfd = newPosMfd.map(p => {
      // In Three.js texture coordinate system: U from left (maxX) to right (minX) or vice-versa
      // Car -X is driver right/left in car coordinates (+X is left side of car, -X is right side).
      // Screen faces rear (+Z). Left of screen in car is +X, right is -X.
      // So U = (maxX - p[0]) / (maxX - minX)
      // V = (p[1] - minY) / (maxY - minY)
      const u = (maxX - p[0]) / (maxX - minX);
      const v = (p[1] - minY) / (maxY - minY);
      return [u, v];
    });

    const newIndMfd = mfdFaces.flatMap(f => [mfdMap.get(f[0]), mfdMap.get(f[1]), mfdMap.get(f[2])]);
    const mfdMeshIdx = buildMeshPrimitive(newPosMfd, newNormMfd, newUvMfd, null, newIndMfd, matMfdIdx, 'Cockpit_MFD_Screen');

    // Add dedicated node under Body
    const mfdNodeIdx = outGlb.nodes.length;
    outGlb.nodes.push({ name: 'Cockpit_MFD_Screen', mesh: mfdMeshIdx, children: [] });
    outGlb.nodes[nodeMapping.get(nodeIdx)].children.push(mfdNodeIdx);

  } else if (mIdx === 3) {
    // Mesh 3 contains Coloured_Material1. We split out Left Mirror Glass and Right Mirror Glass!
    const mainFaces = [];
    const leftFaces = [];
    const rightFaces = [];

    for (let i = 0; i < ind.length; i += 3) {
      const i0 = ind[i][0], i1 = ind[i+1][0], i2 = ind[i+2][0];
      const p0 = pos[i0], p1 = pos[i1], p2 = pos[i2];
      const n0 = norm[i0], n1 = norm[i1], n2 = norm[i2];
      const cx = (p0[0] + p1[0] + p2[0]) / 3;
      const cy = (p0[1] + p1[1] + p2[1]) / 3;
      const cz = (p0[2] + p1[2] + p2[2]) / 3;
      const nz = (n0[2] + n1[2] + n2[2]) / 3;

      if (cx >= 0.70 && cx <= 0.90 && cy >= 0.92 && cy <= 1.02 && cz >= -0.47 && cz <= -0.38 && nz > 0.6) {
        leftFaces.push([i0, i1, i2]);
      } else if (cx >= -0.90 && cx <= -0.70 && cy >= 0.92 && cy <= 1.02 && cz >= -0.47 && cz <= -0.38 && nz > 0.6) {
        rightFaces.push([i0, i1, i2]);
      } else {
        mainFaces.push([i0, i1, i2]);
      }
    }

    console.log(`Mesh 3 split: ${mainFaces.length} main tris, ${leftFaces.length} left mirror tris, ${rightFaces.length} right mirror tris.`);

    // 1. Main mesh
    const usedMain = new Set();
    mainFaces.forEach(f => { usedMain.add(f[0]); usedMain.add(f[1]); usedMain.add(f[2]); });
    const sortedMain = Array.from(usedMain).sort((a, b) => a - b);
    const mainMap = new Map();
    sortedMain.forEach((oldIdx, newIdx) => mainMap.set(oldIdx, newIdx));

    const newPosMain = sortedMain.map(i => pos[i]);
    const newNormMain = sortedMain.map(i => norm[i]);
    const newUvMain = uvs ? sortedMain.map(i => uvs[i]) : null;
    const newIndMain = mainFaces.flatMap(f => [mainMap.get(f[0]), mainMap.get(f[1]), mainMap.get(f[2])]);

    const newMeshIdx3 = buildMeshPrimitive(newPosMain, newNormMain, newUvMain, null, newIndMain, p.material, m.name);
    outGlb.nodes[nodeMapping.get(nodeIdx)].mesh = newMeshIdx3;

    // 2. Left Mirror Glass
    const usedLeft = new Set();
    leftFaces.forEach(f => { usedLeft.add(f[0]); usedLeft.add(f[1]); usedLeft.add(f[2]); });
    const sortedLeft = Array.from(usedLeft).sort((a, b) => a - b);
    const leftMap = new Map();
    sortedLeft.forEach((oldIdx, newIdx) => leftMap.set(oldIdx, newIdx));

    const newPosLeft = sortedLeft.map(i => pos[i]);
    const newNormLeft = sortedLeft.map(i => norm[i]);

    let minLX = Math.min(...newPosLeft.map(p => p[0]));
    let maxLX = Math.max(...newPosLeft.map(p => p[0]));
    let minLY = Math.min(...newPosLeft.map(p => p[1]));
    let maxLY = Math.max(...newPosLeft.map(p => p[1]));

    const newUvLeft = newPosLeft.map(p => [
      (p[0] - minLX) / (maxLX - minLX),
      (p[1] - minLY) / (maxLY - minLY)
    ]);

    const newIndLeft = leftFaces.flatMap(f => [leftMap.get(f[0]), leftMap.get(f[1]), leftMap.get(f[2])]);
    const leftMeshIdx = buildMeshPrimitive(newPosLeft, newNormLeft, newUvLeft, null, newIndLeft, matLeftMirrorIdx, 'Cockpit_Mirror_Left');

    const leftNodeIdx = outGlb.nodes.length;
    outGlb.nodes.push({ name: 'Cockpit_Mirror_Left', mesh: leftMeshIdx, children: [] });
    outGlb.nodes[nodeMapping.get(nodeIdx)].children.push(leftNodeIdx);

    // 3. Right Mirror Glass
    const usedRight = new Set();
    rightFaces.forEach(f => { usedRight.add(f[0]); usedRight.add(f[1]); usedRight.add(f[2]); });
    const sortedRight = Array.from(usedRight).sort((a, b) => a - b);
    const rightMap = new Map();
    sortedRight.forEach((oldIdx, newIdx) => rightMap.set(oldIdx, newIdx));

    const newPosRight = sortedRight.map(i => pos[i]);
    const newNormRight = sortedRight.map(i => norm[i]);

    let minRX = Math.min(...newPosRight.map(p => p[0]));
    let maxRX = Math.max(...newPosRight.map(p => p[0]));
    let minRY = Math.min(...newPosRight.map(p => p[1]));
    let maxRY = Math.max(...newPosRight.map(p => p[1]));

    const newUvRight = newPosRight.map(p => [
      (p[0] - minRX) / (maxRX - minRX),
      (p[1] - minRY) / (maxRY - minRY)
    ]);

    const newIndRight = rightFaces.flatMap(f => [rightMap.get(f[0]), rightMap.get(f[1]), rightMap.get(f[2])]);
    const rightMeshIdx = buildMeshPrimitive(newPosRight, newNormRight, newUvRight, null, newIndRight, matRightMirrorIdx, 'Cockpit_Mirror_Right');

    const rightNodeIdx = outGlb.nodes.length;
    outGlb.nodes.push({ name: 'Cockpit_Mirror_Right', mesh: rightMeshIdx, children: [] });
    outGlb.nodes[nodeMapping.get(nodeIdx)].children.push(rightNodeIdx);

  } else {
    // Unaltered mesh
    const newMeshIdx = buildMeshPrimitive(pos, norm, uvs, uv1s, ind.map(i => i[0]), p.material, m.name);
    if (nodeIdx !== -1) {
      outGlb.nodes[nodeMapping.get(nodeIdx)].mesh = newMeshIdx;
    }
  }
});

// Final buffer collation
while (bufferLength % 4) {
  bufferChunks.push(Buffer.alloc(1));
  bufferLength++;
}
outGlb.buffers = [{ byteLength: bufferLength }];

const finalBinBuffer = Buffer.concat(bufferChunks, bufferLength);
let jsonBuf = Buffer.from(JSON.stringify(outGlb), 'utf8');
const pad = (-jsonBuf.length) & 3;
if (pad > 0) {
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)]);
}

const totalGlbLength = 12 + 8 + jsonBuf.length + 8 + finalBinBuffer.length;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(totalGlbLength, 8);

const jsonChunkHeader = Buffer.alloc(8);
jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);

const binChunkHeader = Buffer.alloc(8);
binChunkHeader.writeUInt32LE(finalBinBuffer.length, 0);
binChunkHeader.writeUInt32LE(0x004e4942, 4);

const finalGlb = Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, finalBinBuffer]);

fs.writeFileSync(GLB_PATH, finalGlb);
console.log(`Successfully generated ${GLB_PATH} (${finalGlb.length} bytes) with native Cockpit_MFD_Screen, Cockpit_Mirror_Left, Cockpit_Mirror_Right!`);
