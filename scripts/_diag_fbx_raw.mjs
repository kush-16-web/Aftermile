// TEMPORARY DIAGNOSTIC — minimal binary FBX node reader to dump raw material Properties70.
import fs from 'fs';
import zlib from 'zlib';

const path = process.argv[2];
const filter = process.argv[3] || 'Material';
const buf = fs.readFileSync(path);
const magic = buf.toString('ascii', 0, 23);
if (!magic.startsWith('Kaydara FBX Binary')) { console.error('not binary fbx'); process.exit(1); }

let ver = buf.readUInt32LE(23);
const is7500 = ver >= 7500;
let P = 27;

function readStr(off, len) { return buf.toString('utf8', off, off + len); }

function readProp() {
  const t = String.fromCharCode(buf[P++]);
  switch (t) {
    case 'Y': { const v = buf.readInt16LE(P); P += 2; return v; }
    case 'C': { const v = buf[P++]; return v; }
    case 'I': { const v = buf.readInt32LE(P); P += 4; return v; }
    case 'F': { const v = buf.readFloatLE(P); P += 4; return v; }
    case 'D': { const v = buf.readDoubleLE(P); P += 8; return v; }
    case 'L': { const v = buf.readBigInt64LE(P); P += 8; return Number(v); }
    case 'f': case 'd': case 'l': case 'i': case 'b': {
      const len = buf.readUInt32LE(P); P += 4;
      const enc = buf.readUInt32LE(P); P += 4;
      const clen = buf.readUInt32LE(P); P += 4;
      const arr = [];
      const dataStart = P;
      if (enc === 0) {
        if (t === 'f') { for (let k = 0; k < len; k++) { arr.push(buf.readFloatLE(P)); P += 4; } }
        else if (t === 'd') { for (let k = 0; k < len; k++) { arr.push(buf.readDoubleLE(P)); P += 8; } }
        else if (t === 'i') { for (let k = 0; k < len; k++) { arr.push(buf.readInt32LE(P)); P += 4; } }
        else if (t === 'l') { for (let k = 0; k < len; k++) { arr.push(Number(buf.readBigInt64LE(P))); P += 8; } }
        else if (t === 'b') { for (let k = 0; k < len; k++) { arr.push(buf[P++]); } }
      } else {
        const raw = buf.slice(P, P + clen);
        const out = zlib.inflateSync(raw);
        P += clen;
        let o = 0;
        for (let k = 0; k < len; k++) {
          if (t === 'f') { arr.push(out.readFloatLE(o)); o += 4; }
          else if (t === 'd') { arr.push(out.readDoubleLE(o)); o += 8; }
          else if (t === 'i') { arr.push(out.readInt32LE(o)); o += 4; }
          else if (t === 'l') { arr.push(Number(out.readBigInt64LE(o))); o += 8; }
          else if (t === 'b') { arr.push(out[o++]); }
        }
      }
      return arr;
    }
    case 'S': { const len = buf.readUInt32LE(P); P += 4; const s = readStr(P, len); P += len; return s; }
    case 'R': { const len = buf.readUInt32LE(P); P += 4; P += len; return `<raw ${len}>`; }
    default: throw new Error('unknown prop type ' + t + ' at ' + (P - 1));
  }
}

function readNode(depth) {
  const endOffset = is7500 ? Number(buf.readBigUInt64LE(P)) : buf.readUInt32LE(P); P += is7500 ? 8 : 4;
  const numProps = is7500 ? Number(buf.readBigUInt64LE(P)) : buf.readUInt32LE(P); P += is7500 ? 8 : 4;
  const propListLen = is7500 ? Number(buf.readBigUInt64LE(P)) : buf.readUInt32LE(P); P += is7500 ? 8 : 4;
  let nameLen = buf[P++];
  if (is7500) { /* already read */ }
  const name = readStr(P, nameLen); P += nameLen;
  if (endOffset === 0) return null; // sentinel
  const props = [];
  for (let i = 0; i < numProps; i++) props.push(readProp());
  const children = [];
  const propEnd = P + propListLen;
  while (P < endOffset) {
    const child = readNode(depth + 1);
    if (!child) break;
    children.push(child);
  }
  P = endOffset;
  return { name, props, children };
}

const roots = [];
while (P < buf.length) {
  try {
    const n = readNode(0);
    if (!n) break;
    roots.push(n);
  } catch (e) { break; }
}

function walk(n, cb) { cb(n); n.children.forEach(c => walk(c, cb)); }

function fmt(v) {
  if (Array.isArray(v)) return v.length > 12 ? `[${v.slice(0, 12).map(x => typeof x === 'number' ? +x.toFixed(5) : x).join(', ')} ... len=${v.length}]` : `[${v.map(x => typeof x === 'number' ? +x.toFixed(6) : JSON.stringify(x)).join(', ')}]`;
  if (typeof v === 'number') return String(+v.toFixed(6));
  return JSON.stringify(v);
}

const out = [];
for (const r of roots) {
  walk(r, n => {
    if (!n.name) return;
    if (n.name === 'Material' && n.props.some(p => typeof p === 'string' && p.includes(filter))) {
      out.push('=== Material: ' + n.props[0] + ' ===');
      for (const c of n.children) {
        if (c.name === 'Properties70') {
          for (const p of c.children) {
            out.push('   ' + p.props.map(fmt).join('  '));
          }
        } else {
          out.push('  [' + c.name + '] ' + c.props.map(fmt).join(' '));
        }
      }
    }
    if ((n.name === 'Texture' || n.name === 'Video') && (filter === 'all' || JSON.stringify(n.props).toLowerCase().includes(filter.toLowerCase()))) {
      out.push('=== ' + n.name + ': ' + n.props.map(fmt).join(' ') + ' ===');
      for (const c of n.children) {
        if (c.name === 'Properties70') for (const p of c.children) out.push('   ' + p.props.map(fmt).join('  '));
        else out.push('  [' + c.name + '] ' + c.props.map(fmt).join(' '));
      }
    }
  });
}
console.log(out.join('\n') || '(no match for ' + filter + ')');
