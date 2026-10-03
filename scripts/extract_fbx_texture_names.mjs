import fs from 'fs';
import path from 'path';

const fbxPath = 'C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\0dacc5d9-913f-41de-98e5-2ce961ce7f3b\\scratch\\bmw_source_clean\\source\\FINAL_MODEL_GT325.fbx';

const buf = fs.readFileSync(fbxPath);

// Let's search in the binary buffer for strings ending with .png, .tga, .dds, .jpg
const str = buf.toString('latin1');

const pngRegex = /([a-zA-Z0-9_\-\\\/:]+\.(?:png|tga|dds|jpg|jpeg))/gi;
const foundFiles = new Set();
let m;
while ((m = pngRegex.exec(str)) !== null) {
  foundFiles.add(m[1]);
}

console.log('--- TEXTURE FILE PATHS EMBEDDED IN FBX BINARY ---');
for (const f of foundFiles) {
  console.log(f);
}
