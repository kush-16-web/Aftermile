// TEMPORARY DIAGNOSTIC — material -> source texture mapping table
import fs from 'fs';
const j = JSON.parse(fs.readFileSync('C:/Users/harsh/AppData/Local/Temp/opencode/fbx_tex.json', 'utf8'));
let raw = fs.readFileSync('C:/Users/harsh/AppData/Local/Temp/opencode/texdump.txt');
if (raw[0] === 0xFF && raw[1] === 0xFE) { var s = raw.toString('utf16le').slice(1); } else { var s = raw.toString('utf8'); }

const vid2f = {};
let id = null;
for (const l of s.split(/\r?\n/)) {
  let m = l.match(/^=== Video: (\d+)/);
  if (m) id = m[1];
  m = l.match(/^\s*\[RelativeFilename\] "(.*)"/);
  if (m && id) vid2f[id] = m[1];
}
const tid2f = {};
for (const l of j.mediaLinks) tid2f[l.textureId] = vid2f[l.videoId] || l.videoName;

const NUL = String.fromCharCode(0);
const clean = n => String(n).split(NUL)[0].trim();
console.error('DBG mediaLinks=' + j.mediaLinks.length + ' vids=' + Object.keys(vid2f).length + ' tid2f=' + Object.keys(tid2f).length + ' sample=' + JSON.stringify(j.mediaLinks[0]) + ' vid2fsample=' + JSON.stringify(vid2f[j.mediaLinks[0].videoId]));
const byMat = {};
for (const c of j.connections) {
  const n = clean(c.material);
  (byMat[n] = byMat[n] || {})[c.property] = tid2f[c.target] || c.target;
}
const vals = {};
for (const m of j.materials) vals[clean(m.name)] = m;

console.log('SOURCE MATERIAL'.padEnd(56), '| DIFFUSE TEXTURE'.padEnd(34), '| NORMAL(BUMP)'.padEnd(34), '| ALPHA');
for (const [m, o] of Object.entries(byMat)) {
  console.log(m.padEnd(56), '|', (o.DiffuseColor || '(none)').padEnd(33), '|', (o.Bump || '(none)').padEnd(33), '|', o.TransparentColor || '-');
}
console.log('');
console.log('SOURCE MATERIAL'.padEnd(56), '| DIFFUSE COLOR'.padEnd(15), '| SPEC'.padEnd(15), '| SHINE', '| OPACITY', '| REFLECT');
for (const [n, m] of Object.entries(vals)) {
  const d = m.diffuse.map(v => v.toFixed(4)).join(',');
  const sp = m.spec.map(v => v.toFixed(3)).join(',');
  console.log(n.padEnd(56), '|', d.padEnd(15), '|', sp.padEnd(15), '|', String(m.shininess).padEnd(5), '|', String(m.opacity).padEnd(7), '|', m.reflectivity);
}
