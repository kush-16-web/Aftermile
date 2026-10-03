import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const scratchDir = 'C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\0dacc5d9-913f-41de-98e5-2ce961ce7f3b\\scratch\\bmw_source_clean';
if (fs.existsSync(scratchDir)) {
  fs.rmSync(scratchDir, { recursive: true, force: true });
}
fs.mkdirSync(scratchDir, { recursive: true });

const outerZip = 'C:\\Users\\harsh\\Downloads\\2025-bmw-m4-gt3-evo-g82.zip';
console.log('Extracting outer zip...');
execSync(`tar -xf "${outerZip}" -C "${scratchDir}"`);

console.log('Outer contents:');
function list(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) list(full);
    else console.log(path.relative(scratchDir, full));
  }
}
list(scratchDir);

// Find inner zip
const sourceDir = path.join(scratchDir, 'source');
if (fs.existsSync(sourceDir)) {
  for (const f of fs.readdirSync(sourceDir)) {
    if (f.endsWith('.zip')) {
      const innerZip = path.join(sourceDir, f);
      console.log('Extracting inner zip:', f);
      execSync(`tar -xf "${innerZip}" -C "${sourceDir}"`);
    }
  }
}

console.log('Final extracted contents:');
list(scratchDir);
