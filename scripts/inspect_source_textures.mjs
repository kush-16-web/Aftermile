import fs from 'fs';
import path from 'path';

const texDir = 'C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\0dacc5d9-913f-41de-98e5-2ce961ce7f3b\\scratch\\bmw_source_clean\\source';

const files = fs.readdirSync(texDir).filter(f => f.endsWith('.png'));

console.log(`Found ${files.length} PNG textures in source:`);
files.forEach(f => {
  const stat = fs.statSync(path.join(texDir, f));
  console.log(`- ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
});
