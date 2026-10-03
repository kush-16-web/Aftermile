import fs from 'fs';
import path from 'path';

const port = 9333;

async function getPageWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(t => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Timeout waiting for page target in CDP');
}

async function run() {
  const pageWs = await getPageWs();
  console.log('Connected to CDP:', pageWs);

  const ws = new WebSocket(pageWs);
  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = msg.params.args.map(a => a.value || a.description || '');
      console.log('[Browser Console]:', ...args);
    }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(msg.error);
      else p.resolve(msg.result);
    }
  };

  function cmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise(r => ws.onopen = r);

  await cmd('Runtime.enable');
  await cmd('Page.enable');

  console.log('Navigating to http://127.0.0.1:4173/convert_bmw.html...');
  await cmd('Page.navigate', { url: 'http://127.0.0.1:4173/convert_bmw.html' });

  console.log('Waiting for conversion to complete...');
  for (let i = 0; i < 90; i++) {
    const res = await cmd('Runtime.evaluate', {
      expression: `({ done: window.conversionDone, err: window.conversionError, status: document.getElementById('status')?.textContent })`,
      returnByValue: true
    });

    const val = res.result.value || {};
    console.log(`[${i}s] Status:`, val.status);

    if (val.err) {
      throw new Error(`Conversion failed: ${val.err}`);
    }

    if (val.done) {
      console.log('Conversion finished! Fetching GLB binary from browser...');
      
      const lenRes = await cmd('Runtime.evaluate', {
        expression: `window.glbResult.length`,
        returnByValue: true
      });
      const totalLen = lenRes.result.value;
      console.log(`GLB size: ${(totalLen / 1024 / 1024).toFixed(2)} MB`);

      const chunkSize = 1024 * 1024 * 2; // 2MB chunk
      const chunks = [];

      for (let offset = 0; offset < totalLen; offset += chunkSize) {
        const chunkRes = await cmd('Runtime.evaluate', {
          expression: `
            (() => {
              const slice = window.glbResult.slice(${offset}, ${offset + chunkSize});
              return Array.from(slice);
            })()
          `,
          returnByValue: true
        });
        chunks.push(Buffer.from(chunkRes.result.value));
        process.stdout.write(`Downloaded ${(Math.min(totalLen, offset + chunkSize) / 1024 / 1024).toFixed(1)} / ${(totalLen / 1024 / 1024).toFixed(1)} MB...\r`);
      }
      console.log('\nAll chunks downloaded.');

      const finalBuf = Buffer.concat(chunks);
      const outPath = 'c:\\Users\\harsh\\OneDrive\\Desktop\\Aftermile\\public\\models\\bmw_m4_gt3_evo\\bmw_m4_gt3_evo.glb';
      fs.writeFileSync(outPath, finalBuf);
      console.log(`Saved reconstructed GLB to ${outPath} (${(finalBuf.length / 1024 / 1024).toFixed(2)} MB)`);

      // Clean up conversion page and raw sources
      if (fs.existsSync('c:\\Users\\harsh\\OneDrive\\Desktop\\Aftermile\\convert_bmw.html')) {
        fs.unlinkSync('c:\\Users\\harsh\\OneDrive\\Desktop\\Aftermile\\convert_bmw.html');
      }
      console.log('Conversion complete!');
      process.exit(0);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  throw new Error('Timeout waiting for GLB conversion in browser');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
