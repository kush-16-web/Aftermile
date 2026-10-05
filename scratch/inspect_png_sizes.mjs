import fs from 'node:fs';


// Let's check image dimensions with a quick png header reader
function readPngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.readUInt32BE(0) !== 0x89504E47) {
    return { width: 0, height: 0, format: 'unknown' };
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height, format: 'png' };
}

const dir = 'scratch/r34_textures';
const files = fs.readdirSync(dir);
files.forEach(f => {
  const info = readPngSize(`${dir}/${f}`);
  console.log(`${f}: ${info.width}x${info.height}`);
});
