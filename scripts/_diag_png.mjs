// TEMPORARY DIAGNOSTIC — PNG header/alpha survey + FBX texture UV transforms.
import fs from 'fs';
import path from 'path';

const dir = 'C:/Users/harsh/AppData/Local/Temp/opencode/bmw_src/model';
console.log('--- PNG HEADERS (model dir) ---');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort()) {
  const b = fs.readFileSync(path.join(dir, f));
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const depth = b[24], type = b[25], interlace = b[28];
  const t = { 0: 'gray', 2: 'rgb', 3: 'palette', 4: 'gray+A', 6: 'rgba' }[type] || type;
  console.log(f.padEnd(38), `${w}x${h}`.padEnd(11), 'depth=' + depth, 'type=' + t, interlace ? 'INTERLACED' : '');
}

console.log('\n--- FBX TEXTURE UV TRANSFORMS (raw) ---');
const raw = fs.readFileSync('C:/Users/harsh/AppData/Local/Temp/opencode/texdump.txt');
const txt = (raw[0] === 0xFF && raw[1] === 0xFE) ? raw.toString('utf16le').slice(1) : raw.toString('utf8');
const blocks = txt.split(/(?==== )/);
for (const b of blocks) {
  if (!b.startsWith('=== Texture')) continue;
  const head = b.split('\n')[0];
  const grab = k => { const m = b.match(new RegExp('^\\s*"' + k + '".*$','m')); return m ? m[0].trim() : null; };
  console.log(head.slice(0, 90));
  for (const k of ['Translation', 'Scaling', 'Rotation', 'WrapModeU', 'WrapModeV', 'UV', 'Alpha', 'FileName', 'RelativeFilename', 'UseMipMap']) {
    const g = grab(k); if (g) console.log('    ', g);
  }
}
