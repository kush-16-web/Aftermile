import http from 'http';
import fs from 'fs';
import path from 'path';

const rootDir = 'd:\\Aftermile';
const port = 5199;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.fbx': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save-glb') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const targetPath = path.join(rootDir, 'public', 'models', 'bmw_m4_gt3_evo', 'bmw_m4_gt3_evo.glb');
      fs.writeFileSync(targetPath, buffer);
      console.log(`Successfully saved reconstructed BMW GLB: ${targetPath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, bytes: buffer.length }));
    });
    return;
  }

  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/convert_bmw.html';
  if (reqPath === '/convert_bmw.html') reqPath = '/public/convert_bmw.html';

  let filePath = path.join(rootDir, reqPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(rootDir, 'public', reqPath);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + req.url);
  }
});

server.listen(port, () => {
  console.log(`Conversion server running on http://localhost:${port}`);
});
