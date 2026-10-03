import fs from 'fs';

const report = JSON.parse(fs.readFileSync('bmw_audit_report.json', 'utf8'));

console.log('=== WHEEL & BRAKE NODES ===');
const wheelNodes = report.allMeshes.filter(m => m.name.toLowerCase().includes('wheel') || m.name.toLowerCase().includes('tire') || m.name.toLowerCase().includes('rim') || m.name.toLowerCase().includes('calliper') || m.name.toLowerCase().includes('disk') || m.name.toLowerCase().includes('brake'));
wheelNodes.slice(0, 30).forEach(w => {
  console.log(`- ${w.name}: pos=[${w.position.join(', ')}], tris=${w.triangles}, mat=${w.materials.join(', ')}`);
});

console.log('\n=== STEERING WHEEL NODES ===');
const steerNodes = report.allMeshes.filter(m => m.name.toLowerCase().includes('steer') || m.name.toLowerCase().includes('anc_steering'));
steerNodes.slice(0, 20).forEach(s => {
  console.log(`- ${s.name}: pos=[${s.position.join(', ')}], tris=${s.triangles}, mat=${s.materials.join(', ')}`);
});

console.log('\n=== INTERIOR NODES ===');
const intNodes = report.allMeshes.filter(m => m.name.toLowerCase().includes('interior') || m.name.toLowerCase().includes('seat') || m.name.toLowerCase().includes('dash') || m.name.toLowerCase().includes('display') || m.name.toLowerCase().includes('cage'));
intNodes.slice(0, 20).forEach(i => {
  console.log(`- ${i.name}: pos=[${i.position.join(', ')}], tris=${i.triangles}, mat=${i.materials.join(', ')}`);
});

console.log('\n=== LIGHT NODES ===');
const lightNodes = report.allMeshes.filter(m => m.name.toLowerCase().includes('light') || m.name.toLowerCase().includes('lamp') || m.name.toLowerCase().includes('emissive') || m.materials.some(mat => mat.toLowerCase().includes('light')));
lightNodes.forEach(l => {
  console.log(`- ${l.name}: pos=[${l.position.join(', ')}], tris=${l.triangles}, mat=${l.materials.join(', ')}`);
});

console.log('\n=== ALL UNIQUE MATERIALS IN FBX ===');
console.log(report.summary.uniqueMaterials);
