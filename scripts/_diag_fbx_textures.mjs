// TEMPORARY DIAGNOSTIC — dump FBX Texture/Video nodes + Material connections.
import fs from 'fs';
import zlib from 'zlib';

const buf = fs.readFileSync(process.argv[2]);
if (!buf.toString('ascii', 0, 23).startsWith('Kaydara FBX Binary')) { console.error('not binary'); process.exit(1); }
const ver = buf.readUInt32LE(23);
const is7500 = ver >= 7500;
let P = 27;

function readProp() {
  const t = String.fromCharCode(buf[P++]);
  switch (t) {
    case 'Y': { const v = buf.readInt16LE(P); P += 2; return v; }
    case 'C': return buf[P++];
    case 'I': { const v = buf.readInt32LE(P); P += 4; return v; }
    case 'F': { const v = buf.readFloatLE(P); P += 4; return v; }
    case 'D': { const v = buf.readDoubleLE(P); P += 8; return v; }
    case 'L': { const v = buf.readBigInt64LE(P); P += 8; return Number(v); }
    case 'f': case 'd': case 'l': case 'i': case 'b': {
      const len = buf.readUInt32LE(P); P += 4;
      const enc = buf.readUInt32LE(P); P += 4;
      const clen = buf.readUInt32LE(P); P += 4;
      const arr = [];
      if (enc === 0) {
        for (let k = 0; k < len; k++) {
          if (t === 'f') { arr.push(buf.readFloatLE(P)); P += 4; }
          else if (t === 'd') { arr.push(buf.readDoubleLE(P)); P += 8; }
          else if (t === 'i') { arr.push(buf.readInt32LE(P)); P += 4; }
          else if (t === 'l') { arr.push(Number(buf.readBigInt64LE(P))); P += 8; }
          else { arr.push(buf[P++]); }
        }
      } else {
        const out = zlib.inflateSync(buf.slice(P, P + clen)); P += clen;
        let o = 0;
        for (let k = 0; k < len; k++) {
          if (t === 'f') { arr.push(out.readFloatLE(o)); o += 4; }
          else if (t === 'd') { arr.push(out.readDoubleLE(o)); o += 8; }
          else if (t === 'i') { arr.push(out.readInt32LE(o)); o += 4; }
          else if (t === 'l') { arr.push(Number(out.readBigInt64LE(o))); o += 8; }
          else { arr.push(out[o++]); }
        }
      }
      return arr;
    }
    case 'S': { const len = buf.readUInt32LE(P); P += 4; const s = buf.toString('utf8', P, P + len); P += len; return s; }
    case 'R': { const len = buf.readUInt32LE(P); P += 4; P += len; return '<raw>'; }
    default: throw new Error('bad type ' + t);
  }
}
function readNode() {
  const endOffset = is7500 ? Number(buf.readBigUInt64LE(P)) : buf.readUInt32LE(P); P += is7500 ? 8 : 4;
  const numProps = is7500 ? Number(buf.readBigUInt64LE(P)) : buf.readUInt32LE(P); P += is7500 ? 8 : 4;
  const propListLen = is7500 ? Number(buf.readBigUInt64LE(P)) : buf.readUInt32LE(P); P += is7500 ? 8 : 4;
  const nameLen = buf[P++];
  const name = buf.toString('utf8', P, P + nameLen); P += nameLen;
  if (endOffset === 0) return null;
  const props = [];
  for (let i = 0; i < numProps; i++) props.push(readProp());
  const children = [];
  while (P < endOffset) { const c = readNode(); if (!c) break; children.push(c); }
  P = endOffset;
  return { name, props, children };
}
const roots = [];
try { while (P < buf.length) { const n = readNode(); if (!n) break; roots.push(n); } } catch (e) { }

function find(root, name) { let r = null; const st = [root]; while (st.length) { const n = st.pop(); if (n.name === name) { r = n; } n.children.forEach(c => st.push(c)); } return r; }
function all(root, name) { const out = []; const st = [root]; while (st.length) { const n = st.pop(); if (n.name === name) out.push(n); n.children.forEach(c => st.push(c)); } return out; }
function props70(n) { const o = {}; const p = n.children.find(c => c.name === 'Properties70'); if (!p) return o; for (const c of p.children) { o[c.props[0]] = c.props.slice(4); } return o; }

const objects = find(roots.find(r => r.name === 'Objects') ? roots.find(r => r.name === 'Objects') : roots[0], 'Objects') || roots.find(r => r.name === 'Objects');
const Objects = roots.find(r => r.name === 'Objects');
if (!Objects) { console.error('no Objects'); process.exit(1); }

const byId = new Map();
function index(n) { for (const c of n.children) { if (c.props[0] !== undefined && typeof c.props[0] === 'number') { if (!byId.has(c.props[0])) byId.set(c.props[0], c); } } }
for (const r of roots) if (r.name === 'Objects') index(r);

const textures = new Map();
const videos = new Map();
const materials = new Map();
for (const [id, n] of byId) {
  if (n.name === 'Texture') {
    const p = props70(n);
    textures.set(id, { id, name: n.props[0], type: n.props[1], fileName: p.FileName?.[0], relative: p.RelativeFilename?.[0], media: p.Media?.[0], uv: p.UV?.[0], uvSwap: p.UVSwap?.[0], wrapU: p.WrapModeU?.[0], wrapV: p.WrapModeV?.[0], translation: p.Translation?.[0], scaling: p.Scaling?.[0], rotation: p.Rotation?.[0], alpha: p.Alpha?.[0], clip: p.Clipping?.[0] });
  } else if (n.name === 'Video') {
    const p = props70(n);
    videos.set(id, { id, name: n.props[0], fileName: p.FileName?.[0], relative: p.RelativeFilename?.[0], path: p.Path?.[0], contentLen: p.Content?.[0] === '<raw>' ? 'raw' : undefined });
  } else if (n.name === 'Material') {
    const p = props70(n);
    materials.set(id, { id, name: n.props[1] ?? n.props[0], allProps: n.props, shading: p.ShadingModel?.[0], diffuse: p.DiffuseColor?.slice(0, 3), diffuseVec: p.Diffuse?.slice(0, 3), diffuseFactor: p.DiffuseFactor?.[0], spec: p.SpecularColor?.slice(0, 3), specFactor: p.SpecularFactor?.[0], shininess: p.ShininessExponent?.[0], opacity: p.Opacity?.[0], transparency: p.TransparencyFactor?.[0], reflectivity: p.ReflectionFactor?.[0], emissive: p.EmissiveColor?.slice(0, 3), bump: p.BumpFactor?.[0], ambient: p.AmbientColor?.slice(0, 3) });
  }
}

const conns = [];
for (const r of roots) if (r.name === 'Connections') for (const c of r.children) if (c.name === 'C') conns.push(c.props);

const out = { materials: [...materials.values()], textures: [...textures.values()], videos: [...videos.values()], connections: [], mediaLinks: [] };
for (const [type, id, parent, prop] of conns) {
  if (type === 'OP' && materials.has(parent)) {
    out.connections.push({ material: materials.get(parent).name, materialId: parent, target: id, targetName: textures.get(id)?.name || videos.get(id)?.name || byId.get(id)?.name || '?', property: prop });
  }
  if (type === 'OO' && ((videos.has(id) && textures.has(parent)) || (textures.has(id) && videos.has(parent)))) {
    const tId = textures.has(id) ? id : parent;
    const vId = videos.has(id) ? id : parent;
    out.mediaLinks.push({ textureId: tId, textureName: textures.get(tId)?.fileName || textures.get(tId)?.name, videoId: vId, videoName: videos.get(vId)?.fileName || videos.get(vId)?.name, rel: videos.get(vId)?.relative });
  }
}
console.log(JSON.stringify(out, null, 1));
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
