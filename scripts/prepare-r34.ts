import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SOURCE_PATH = path.resolve(process.cwd(), 'scratch_zip/source/brians_r34_from_2_fast_2_furious.glb');
const OUT_DIR = path.resolve(process.cwd(), 'public/models/r34');
const EXPECTED_SHA = '2fd291ab05364064d1dbcad0ae3aed96a2418625ef445cf00b44389c281db467';

const raw = fs.readFileSync(SOURCE_PATH);
const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
if (sha256 !== EXPECTED_SHA) {
  throw new Error(`SHA mismatch: expected ${EXPECTED_SHA}, got ${sha256}`);
}

const magic = raw.readUInt32LE(0);
const version = raw.readUInt32LE(4);
const length = raw.readUInt32LE(8);
if (magic !== 0x46546c67 || version !== 2 || length !== raw.length) {
  throw new Error('Invalid GLB container');
}

const jsonChunkLength = raw.readUInt32LE(12);
const jsonChunkType = raw.readUInt32LE(16);
if (jsonChunkType !== 0x4e4f534a) {
  throw new Error('First chunk is not JSON');
}

const jsonText = raw.toString('utf8', 20, 20 + jsonChunkLength);
const src = JSON.parse(jsonText);

const binHeaderOffset = 20 + jsonChunkLength;
let binary = Buffer.alloc(0);
if (binHeaderOffset < raw.length) {
  const binChunkLength = raw.readUInt32LE(binHeaderOffset);
  const binChunkType = raw.readUInt32LE(binHeaderOffset + 4);
  if (binChunkType === 0x004e4942) {
    binary = raw.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binChunkLength);
  }
}

const nodes: any[] = src.nodes;
const parent: Record<number, number> = {};
for (let i = 0; i < nodes.length; i++) {
  if (nodes[i].children) {
    for (const child of nodes[i].children) {
      parent[child] = i;
    }
  }
}

const DTYPES: Record<number, { bytes: number; getter: (buf: Buffer, off: number) => number }> = {
  5121: { bytes: 1, getter: (b, o) => b.readUInt8(o) },
  5123: { bytes: 2, getter: (b, o) => b.readUInt16LE(o) },
  5125: { bytes: 4, getter: (b, o) => b.readUInt32LE(o) },
  5126: { bytes: 4, getter: (b, o) => b.readFloatLE(o) },
};
const WIDTHS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(index: number): number[][] {
  const a = src.accessors[index];
  const view = src.bufferViews[a.bufferView];
  const dtype = DTYPES[a.componentType];
  const width = WIDTHS[a.type];
  const count = a.count;
  const baseOffset = (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || dtype.bytes * width;

  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    const rowOffset = baseOffset + i * stride;
    const row: number[] = [];
    for (let w = 0; w < width; w++) {
      row.push(dtype.getter(binary, rowOffset + w * dtype.bytes));
    }
    result.push(row);
  }
  return result;
}

// 4x4 matrix utilities (row-major [16])
function mat4Identity(): number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function mat4Multiply(a: number[], b: number[]): number[] {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[r * 4 + k] * b[k * 4 + c];
      }
      out[r * 4 + c] = sum;
    }
  }
  return out;
}

function mat4FromTRS(t?: number[], r?: number[], s?: number[]): number[] {
  const tx = t ? t[0] : 0, ty = t ? t[1] : 0, tz = t ? t[2] : 0;
  const qx = r ? r[0] : 0, qy = r ? r[1] : 0, qz = r ? r[2] : 0, qw = r ? r[3] : 1;
  const sx = s ? s[0] : 1, sy = s ? s[1] : 1, sz = s ? s[2] : 1;

  const r00 = (1 - 2 * (qy * qy + qz * qz)) * sx;
  const r01 = (2 * (qx * qy - qz * qw)) * sy;
  const r02 = (2 * (qx * qz + qy * qw)) * sz;

  const r10 = (2 * (qx * qy + qz * qw)) * sx;
  const r11 = (1 - 2 * (qx * qx + qz * qz)) * sy;
  const r12 = (2 * (qy * qz - qx * qw)) * sz;

  const r20 = (2 * (qx * qz - qy * qw)) * sx;
  const r21 = (2 * (qy * qz + qx * qw)) * sy;
  const r22 = (1 - 2 * (qx * qx + qy * qy)) * sz;

  return [
    r00, r01, r02, tx,
    r10, r11, r12, ty,
    r20, r21, r22, tz,
    0,   0,   0,   1,
  ];
}

function mat4FromColumnMajor(m: number[]): number[] {
  return [
    m[0], m[4], m[8],  m[12],
    m[1], m[5], m[9],  m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
  ];
}

const worlds: Record<number, number[]> = {};
function worldMatrix(index: number): number[] {
  if (worlds[index]) return worlds[index];
  const node = nodes[index];
  let local: number[];
  if (node.matrix) {
    local = mat4FromColumnMajor(node.matrix);
  } else {
    local = mat4FromTRS(node.translation, node.rotation, node.scale);
  }
  const parentIdx = parent[index];
  const res = parentIdx !== undefined ? mat4Multiply(worldMatrix(parentIdx), local) : local;
  worlds[index] = res;
  return res;
}

function* descendants(index: number): Generator<number> {
  yield index;
  if (nodes[index].children) {
    for (const child of nodes[index].children) {
      yield* descendants(child);
    }
  }
}

function* getPoints(index: number): Generator<number[]> {
  for (const child of descendants(index)) {
    if (nodes[child].mesh !== undefined) {
      const mesh = src.meshes[nodes[child].mesh];
      const wm = worldMatrix(child);
      for (const primitive of mesh.primitives) {
        const positions = readAccessor(primitive.attributes.POSITION);
        for (const p of positions) {
          const x = wm[0] * p[0] + wm[1] * p[1] + wm[2] * p[2] + wm[3];
          const y = wm[4] * p[0] + wm[5] * p[1] + wm[6] * p[2] + wm[7];
          const z = wm[8] * p[0] + wm[9] * p[1] + wm[10] * p[2] + wm[11];
          yield [x, y, z];
        }
      }
    }
  }
}

const wheel_nodes = [1015, 1933, 2850, 3494];
const caliper_nodes = [80, 161, 242, 323];

const pivots: number[][] = wheel_nodes.map(i => {
  const wm = worldMatrix(i);
  return [wm[3], wm[7], wm[11]];
});

const scale = 2.665 / (pivots[0][2] - pivots[2][2]);
let source_floor = Infinity;
for (const i of wheel_nodes) {
  for (const p of getPoints(i)) {
    if (p[1] < source_floor) source_floor = p[1];
  }
}

const center = [0.0, source_floor, (pivots[0][2] + pivots[2][2]) / 2];

// axis_change is diag(-1, 1, -1)
// wheel_positions = (pivots - center) @ axis_change.T * scale
const wheel_positions = pivots.map(p => [
  -(p[0] - center[0]) * scale,
   (p[1] - center[1]) * scale,
  -(p[2] - center[2]) * scale,
]);

const mount_rotations: number[][][] = []; // 3x3 matrices
const wheel_radii: number[] = [];

for (let i = 0; i < wheel_nodes.length; i++) {
  const wm = worldMatrix(wheel_nodes[i]);
  // axle = axis_change @ wm[:3, 0] = [-wm[0], wm[4], -wm[8]]
  let axle = [-wm[0], wm[4], -wm[8]];
  const norm = Math.hypot(axle[0], axle[1], axle[2]);
  axle = [axle[0] / norm, axle[1] / norm, axle[2] / norm];
  if (axle[0] < 0) {
    axle = [-axle[0], -axle[1], -axle[2]];
  }
  const camber = Math.atan2(axle[1], axle[0]);
  const c = Math.cos(camber), s = Math.sin(camber);
  // [[c, -s, 0], [s, c, 0], [0, 0, 1]]
  const rot = [
    [c, -s, 0],
    [s,  c, 0],
    [0,  0, 1],
  ];
  mount_rotations.push(rot);

  let maxRadius = 0;
  const pivot = pivots[i];
  for (const p of getPoints(wheel_nodes[i])) {
    const d0 = -(p[0] - pivot[0]) * scale;
    const d1 =  (p[1] - pivot[1]) * scale;
    const d2 = -(p[2] - pivot[2]) * scale;

    const locY = d0 * rot[1][0] + d1 * rot[1][1] + d2 * rot[1][2];
    const locZ = d0 * rot[2][0] + d1 * rot[2][1] + d2 * rot[2][2];
    const r = Math.hypot(locY, locZ);
    if (r > maxRadius) maxRadius = r;
  }
  wheel_radii.push(maxRadius);
}

const roles: Record<number, [string, number | null]> = {};
for (let i = 0; i < 4; i++) {
  for (const idx of descendants(wheel_nodes[i])) {
    roles[idx] = ['Wheel' + i, i];
  }
  for (const idx of descendants(caliper_nodes[i])) {
    roles[idx] = ['Caliper' + i, i];
  }
}

const materials: any[] = JSON.parse(JSON.stringify(src.materials));
const textures: any[] = [];
const texture_map: Record<number, number> = {};
for (let i = 0; i < src.textures.length; i++) {
  const tex = src.textures[i];
  const idx = textures.findIndex(t => JSON.stringify(t) === JSON.stringify(tex));
  if (idx === -1) {
    textures.push(JSON.parse(JSON.stringify(tex)));
    texture_map[i] = textures.length - 1;
  } else {
    texture_map[i] = idx;
  }
}

function remapTextures(obj: any) {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      for (const item of obj) remapTextures(item);
    } else {
      for (const [k, v] of Object.entries(obj)) {
        if (k.endsWith('Texture') && v && typeof v === 'object' && 'index' in v) {
          (v as any).index = texture_map[(v as any).index];
        } else {
          remapTextures(v);
        }
      }
    }
  }
}
remapTextures(materials);

const wheel_material_repairs: any[] = [];
const wheel_atlas = JSON.parse(JSON.stringify(materials[6].pbrMetallicRoughness.baseColorTexture));
for (let material_index = 3; material_index <= 13; material_index++) {
  const pbr = materials[material_index].pbrMetallicRoughness;
  if (!pbr.baseColorTexture) {
    wheel_material_repairs.push({
      material: material_index,
      name: materials[material_index].name,
      originalBaseColorFactor: pbr.baseColorFactor,
    });
    pbr.baseColorTexture = JSON.parse(JSON.stringify(wheel_atlas));
    pbr.baseColorFactor = [1, 1, 1, 1];
  }
}

function lampMaterial(source: number, name: string, color?: number[], textured = true): number {
  const mat = JSON.parse(JSON.stringify(materials[source]));
  mat.name = name;
  mat.emissiveFactor = color || [1, 1, 1];
  if (mat.extensions) {
    delete mat.extensions.KHR_materials_transmission;
    delete mat.extensions.KHR_materials_emissive_strength;
  }
  if (!textured) {
    delete mat.emissiveTexture;
  }
  materials.push(mat);
  return materials.length - 1;
}

const head = lampMaterial(27, 'LightHead');
const tail = lampMaterial(27, 'LightTail', [1, 0.02, 0.008]);
const stop = lampMaterial(27, 'LightStop', [1, 0.02, 0.008]);
const reverse = lampMaterial(27, 'LightReverse', [0.8, 0.88, 1], false);
const reverse_lens = lampMaterial(34, 'LightReverseLens', [0.8, 0.88, 1], false);
materials[reverse_lens].pbrMetallicRoughness.baseColorFactor = [0.8, 0.86, 0.92, 0.5];
const tail_lens = lampMaterial(35, 'LightTailLens', [1, 0.012, 0.003], false);
const stop_lens = lampMaterial(35, 'LightStopLens', [1, 0.012, 0.003], false);
materials[27].name = 'LampDetail';
materials[27].emissiveFactor = [0, 0, 0];
materials[28].name = 'LightHeadReflector';
materials[29].name = 'LightHeadBulb';
if (materials[35].extensions) {
  delete materials[35].extensions.KHR_materials_transmission;
}

function usedUvs(obj: any): Set<string> {
  const set = new Set<string>();
  function scan(v: any) {
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (k.endsWith('Texture') && val && typeof val === 'object') {
          set.add('TEXCOORD_' + ((val as any).texCoord || 0));
        } else {
          scan(val);
        }
      }
    }
  }
  scan(obj);
  return set;
}

function materialSelections(material: number, positions: number[][], indices: number[][]): Array<{ material: number; faces: number[][] }> {
  if (material !== 27 && material !== 34 && material !== 35) {
    return [{ material, faces: indices }];
  }
  const byMat: Record<number, number[][]> = {};
  for (const tri of indices) {
    const p0 = positions[tri[0]], p1 = positions[tri[1]], p2 = positions[tri[2]];
    const cx = (p0[0] + p1[0] + p2[0]) / 3;
    const cy = (p0[1] + p1[1] + p2[1]) / 3;
    const cz = (p0[2] + p1[2] + p2[2]) / 3;

    // source coords: (centroid / scale) @ axis_change + center
    const sx = -cx / scale + center[0];
    const sy =  cy / scale + center[1];
    const sz = -cz / scale + center[2];

    let m = material;
    if (material === 27) {
      if (sz > 0.155 && sy > 0.043) m = head;
      else if (sz < -0.16 && sy > 0.055 && !(sz < -0.16 && sy > 0.075 && Math.abs(sx) < 0.008) && !(sz < -0.175 && sy > 0.041 && sy < 0.049 && sx > 0.013 && sx < 0.029)) m = tail;
      else if (sz < -0.16 && sy > 0.075 && Math.abs(sx) < 0.008) m = stop;
      else if (sz < -0.175 && sy > 0.041 && sy < 0.049 && sx > 0.013 && sx < 0.029) m = reverse;
    } else if (material === 34) {
      if (sz < -0.175 && sy > 0.041 && sy < 0.049 && sx > 0.013 && sx < 0.029) m = reverse_lens;
    } else if (material === 35) {
      if (sz < -0.16 && sy > 0.075 && Math.abs(sx) < 0.008) m = stop_lens;
      else if (sz < -0.16 && sy > 0.055) m = tail_lens;
    }
    byMat[m] = byMat[m] || [];
    byMat[m].push(tri);
  }
  return Object.entries(byMat).map(([m, faces]) => ({ material: Number(m), faces }));
}

interface Piece {
  data: Record<string, number[][]>;
  faces: number[][];
}
const batches: Record<string, { part: string; material: number; keys: string[]; pieces: Piece[] }> = {};

let source_triangles = 0;

for (let index = 0; index < nodes.length; index++) {
  const node = nodes[index];
  if (node.mesh === undefined) continue;
  const [part, wheel] = roles[index] || ['Body', null];
  const wm = worldMatrix(index);

  // 3x3 normal matrix = inv(wm[:3, :3])^T
  const m00 = wm[0], m01 = wm[1], m02 = wm[2];
  const m10 = wm[4], m11 = wm[5], m12 = wm[6];
  const m20 = wm[8], m21 = wm[9], m22 = wm[10];

  const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
  const invDet = 1 / det;
  const n00 = (m11 * m22 - m12 * m21) * invDet;
  const n01 = (m12 * m20 - m10 * m22) * invDet;
  const n02 = (m10 * m21 - m11 * m20) * invDet;
  const n10 = (m02 * m21 - m01 * m22) * invDet;
  const n11 = (m00 * m22 - m02 * m20) * invDet;
  const n12 = (m01 * m20 - m00 * m21) * invDet;
  const n20 = (m01 * m12 - m02 * m11) * invDet;
  const n21 = (m02 * m10 - m00 * m12) * invDet;
  const n22 = (m00 * m11 - m01 * m10) * invDet;

  const mesh = src.meshes[node.mesh];
  for (const primitive of mesh.primitives) {
    const rawAttrs: Record<string, number[][]> = {};
    for (const [k, aIdx] of Object.entries(primitive.attributes)) {
      rawAttrs[k] = readAccessor(aIdx as number);
    }
    const pos = rawAttrs.POSITION;
    const norm = rawAttrs.NORMAL;

    // Transform positions: (pos @ wm[:3,:3]^T + wm[:3, 3] - center) @ axis_change^T * scale
    const tx = wm[3], ty = wm[7], tz = wm[11];
    const worldPos: number[][] = [];
    for (let i = 0; i < pos.length; i++) {
      const p = pos[i];
      const wx = m00 * p[0] + m01 * p[1] + m02 * p[2] + tx;
      const wy = m10 * p[0] + m11 * p[1] + m12 * p[2] + ty;
      const wz = m20 * p[0] + m21 * p[1] + m22 * p[2] + tz;

      let rx = -(wx - center[0]) * scale;
      let ry =  (wy - center[1]) * scale;
      let rz = -(wz - center[2]) * scale;

      if (wheel !== null) {
        const wp = wheel_positions[wheel];
        const dx = rx - wp[0], dy = ry - wp[1], dz = rz - wp[2];
        const rot = mount_rotations[wheel];
        rx = dx * rot[0][0] + dy * rot[1][0] + dz * rot[2][0];
        ry = dx * rot[0][1] + dy * rot[1][1] + dz * rot[2][1];
        rz = dx * rot[0][2] + dy * rot[1][2] + dz * rot[2][2];
      }
      worldPos.push([rx, ry, rz]);
    }

    // Transform normals: norm @ normal_matrix^T @ axis_change^T
    const worldNorm: number[][] = [];
    for (let i = 0; i < norm.length; i++) {
      const n = norm[i];
      // normal_matrix^T has rows [n00, n10, n20], etc.
      // n @ normal_matrix^T = [n[0]*n00 + n[1]*n10 + n[2]*n20, ...]
      const nx = n[0] * n00 + n[1] * n10 + n[2] * n20;
      const ny = n[0] * n01 + n[1] * n11 + n[2] * n21;
      const nz = n[0] * n02 + n[1] * n12 + n[2] * n22;

      let rnx = -nx;
      let rny =  ny;
      let rnz = -nz;

      if (wheel !== null) {
        const rot = mount_rotations[wheel];
        const tx = rnx, ty = rny, tz = rnz;
        rnx = tx * rot[0][0] + ty * rot[1][0] + tz * rot[2][0];
        rny = tx * rot[0][1] + ty * rot[1][1] + tz * rot[2][1];
        rnz = tx * rot[0][2] + ty * rot[1][2] + tz * rot[2][2];
      }
      const l = Math.max(1e-20, Math.hypot(rnx, rny, rnz));
      worldNorm.push([rnx / l, rny / l, rnz / l]);
    }

    rawAttrs.POSITION = worldPos;
    rawAttrs.NORMAL = worldNorm;

    const rawIndices = readAccessor(primitive.indices);
    const triangles: number[][] = [];
    for (let i = 0; i < rawIndices.length; i += 3) {
      if (det < 0) {
        triangles.push([rawIndices[i][0], rawIndices[i + 2][0], rawIndices[i + 1][0]]);
      } else {
        triangles.push([rawIndices[i][0], rawIndices[i + 1][0], rawIndices[i + 2][0]]);
      }
    }
    source_triangles += triangles.length;

    const selections = materialSelections(primitive.material, worldPos, triangles);
    for (const { material, faces } of selections) {
      if (faces.length === 0) continue;

      const usedIndices = new Set<number>();
      for (const f of faces) {
        usedIndices.add(f[0]);
        usedIndices.add(f[1]);
        usedIndices.add(f[2]);
      }
      const sortedUsed = Array.from(usedIndices).sort((a, b) => a - b);
      const reindexMap = new Map<number, number>();
      sortedUsed.forEach((oldIdx, newIdx) => reindexMap.set(oldIdx, newIdx));

      const reindexedFaces = faces.map(f => [reindexMap.get(f[0])!, reindexMap.get(f[1])!, reindexMap.get(f[2])!]);

      const retainedKeys = new Set<string>(['POSITION', 'NORMAL']);
      for (const uv of usedUvs(materials[material])) retainedKeys.add(uv);

      const pieceData: Record<string, number[][]> = {};
      for (const key of retainedKeys) {
        if (!rawAttrs[key]) throw new Error(`Missing attribute ${key}`);
        pieceData[key] = sortedUsed.map(idx => rawAttrs[key][idx]);
      }

      const sortedKeys = Array.from(retainedKeys).sort();
      const batchKey = `${part}|${material}|${sortedKeys.join(',')}`;
      if (!batches[batchKey]) {
        batches[batchKey] = { part, material, keys: sortedKeys, pieces: [] };
      }
      batches[batchKey].pieces.push({ data: pieceData, faces: reindexedFaces });
    }
  }
}

const output: any = {
  asset: { version: '2.0', generator: 'Aftermile lossless R34 rig adapter' },
  scene: 0,
  scenes: [{ nodes: [] }],
  nodes: [],
  meshes: [],
  materials,
  textures,
  samplers: JSON.parse(JSON.stringify(src.samplers || [])),
  images: [],
  buffers: [],
  bufferViews: [],
  accessors: [],
  extensionsUsed: src.extensionsUsed || [],
};

const bufferChunks: Buffer[] = [];
let bufferLength = 0;

function addView(data: Buffer, target?: number): number {
  while (bufferLength % 4) {
    bufferChunks.push(Buffer.alloc(1));
    bufferLength++;
  }
  const info: any = { buffer: 0, byteOffset: bufferLength, byteLength: data.length };
  if (target) info.target = target;
  output.bufferViews.push(info);
  bufferChunks.push(data);
  bufferLength += data.length;
  return output.bufferViews.length - 1;
}

function addAccessor(values: number[][], isIndex: boolean): number {
  let buf: Buffer;
  let compType: number;
  let type: string;
  let min: number[] | undefined;
  let max: number[] | undefined;

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
  const info: any = {
    bufferView: viewIdx,
    componentType: compType,
    count: values.length,
    type,
  };
  if (!isIndex) {
    info.min = min;
    info.max = max;
  }
  output.accessors.push(info);
  return output.accessors.length - 1;
}

function addNode(name: string, parentIndex?: number, extra: any = {}): number {
  const index = output.nodes.length;
  output.nodes.push({ name, children: [], ...extra });
  if (parentIndex === undefined) {
    output.scenes[0].nodes.push(index);
  } else {
    output.nodes[parentIndex].children.push(index);
  }
  return index;
}

const part_nodes: Record<string, number> = { Body: addNode('Body') };
for (let i = 0; i < 4; i++) {
  const angle = Math.atan2(mount_rotations[i][1][0], mount_rotations[i][0][0]);
  let contact = Infinity;
  for (const p of getPoints(wheel_nodes[i])) {
    if (p[1] < contact) contact = p[1];
  }
  wheel_positions[i][1] -= (contact - source_floor) * scale;
  const mount = addNode(`WheelMount${i}`, undefined, {
    translation: wheel_positions[i],
    rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)],
  });
  part_nodes[`Wheel${i}`] = addNode(`Wheel${i}`, mount);
  part_nodes[`Caliper${i}`] = addNode(`Caliper${i}`, mount);
}

const sortedBatchKeys = Object.keys(batches).sort();
for (const key of sortedBatchKeys) {
  const { part, material, keys, pieces } = batches[key];
  const mergedData: Record<string, number[][]> = {};
  for (const k of keys) mergedData[k] = [];

  const mergedIndices: number[][] = [];
  let vertOffset = 0;

  for (const piece of pieces) {
    for (const k of keys) {
      mergedData[k].push(...piece.data[k]);
    }
    for (const face of piece.faces) {
      mergedIndices.push([face[0] + vertOffset, face[1] + vertOffset, face[2] + vertOffset]);
    }
    vertOffset += piece.data[keys[0]].length;
  }

  const attributes: Record<string, number> = {};
  for (const k of keys) {
    attributes[k] = addAccessor(mergedData[k], false);
  }
  const flatIndices: number[][] = [];
  for (const tri of mergedIndices) {
    flatIndices.push([tri[0]], [tri[1]], [tri[2]]);
  }
  const indicesAcc = addAccessor(flatIndices, true);

  const primitive = { attributes, indices: indicesAcc, material };
  const meshIdx = output.meshes.length;
  output.meshes.push({
    name: `${part} / ${materials[material].name}`,
    primitives: [primitive],
  });
  addNode(`${part}_${material}`, part_nodes[part], { mesh: meshIdx });
}

// Images
const image_report: any[] = [];
for (const img of src.images) {
  const v = src.bufferViews[img.bufferView];
  const imgData = binary.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const viewIdx = addView(imgData);
  output.images.push({ ...img, bufferView: viewIdx });
  image_report.push({
    name: img.name,
    bytes: imgData.length,
    sha256: crypto.createHash('sha256').update(imgData).digest('hex'),
  });
}

while (bufferLength % 4) {
  bufferChunks.push(Buffer.alloc(1));
  bufferLength++;
}
output.buffers = [{ byteLength: bufferLength }];

const finalBinBuffer = Buffer.concat(bufferChunks, bufferLength);
let jsonBuf = Buffer.from(JSON.stringify(output), 'utf8');
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

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'r34.glb'), finalGlb);

const runtimeTriangles = Object.values(batches).reduce(
  (sum, b) => sum + b.pieces.reduce((s2, p) => s2 + p.faces.length, 0),
  0
);

const report = {
  sourceFile: path.basename(SOURCE_PATH),
  sourceSha256: EXPECTED_SHA,
  sourceBytes: raw.length,
  sourceNodes: nodes.length,
  sourcePrimitives: src.meshes.reduce((s: number, m: any) => s + m.primitives.length, 0),
  triangles: source_triangles,
  runtimeTriangles,
  runtimeBytes: finalGlb.length,
  runtimePrimitives: output.meshes.length,
  runtimeNodes: output.nodes.length,
  scale,
  wheelPositions: wheel_positions,
  wheelRadii: wheel_radii,
  camberDegrees: mount_rotations.map(r => (Math.atan2(r[1][0], r[0][0]) * 180) / Math.PI),
  sourceTextureReferences: src.textures.length,
  runtimeTextureReferences: textures.length,
  images: image_report,
  materials: materials.length,
  wheelMaterialRepairs: wheel_material_repairs,
};

if (report.triangles !== 266060 || report.runtimeTriangles !== 266060) {
  throw new Error(`Triangle count assertion failed: ${report.triangles} vs 266060`);
}

fs.writeFileSync(path.join(OUT_DIR, 'preparation.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Successfully generated public/models/r34/r34.glb!');
console.log(JSON.stringify({ ...report, images: undefined }, null, 2));
