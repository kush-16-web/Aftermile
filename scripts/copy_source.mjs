import fs from 'fs';
import path from 'path';

const srcDir = 'C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\0dacc5d9-913f-41de-98e5-2ce961ce7f3b\\scratch\\bmw_source_clean\\source';
const dstDir = 'd:\\Aftermile\\public\\models\\bmw_source_raw';

if (fs.existsSync(dstDir)) {
  fs.rmSync(dstDir, { recursive: true, force: true });
}
fs.mkdirSync(dstDir, { recursive: true });

for (const file of fs.readdirSync(srcDir)) {
  const s = path.join(srcDir, file);
  const d = path.join(dstDir, file);
  if (fs.statSync(s).isFile()) {
    fs.copyFileSync(s, d);
  }
}

console.log('Copied source files to public/models/bmw_source_raw:', fs.readdirSync(dstDir).length);
