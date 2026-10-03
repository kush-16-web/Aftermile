import fs from 'fs';
import { spawn } from 'child_process';

const port = 9444;
const candidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chromePath = candidates.find(c => fs.existsSync(c));

console.log('Launching browser on port', port);
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  'http://127.0.0.1:4173/',
], { stdio: 'ignore' });

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
  const ws = new WebSocket(pageWs);
  let id = 1;
  const pending = new Map();

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[Browser Console]:', ...msg.params.args.map(a => a.value || a.description || ''));
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
      const curId = id++;
      pending.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  await new Promise(r => ws.onopen = r);
  await cmd('Runtime.enable');
  await cmd('Page.enable');

  await new Promise(r => setTimeout(r, 2000));

  console.log('Testing GLTFLoader in game context...');
  const res = await cmd('Runtime.evaluate', {
    expression: `
      (async () => {
        const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        try {
          const gltf = await loader.loadAsync('/models/bmw_m4_gt3_evo/bmw_m4_gt3_evo.glb');
          const body = gltf.scene.getObjectByName('Body');
          const mounts = [0,1,2,3].map(i => gltf.scene.getObjectByName('WheelMount' + i));
          const wheels = [0,1,2,3].map(i => gltf.scene.getObjectByName('Wheel' + i));
          return {
            success: true,
            body: Boolean(body),
            mounts: mounts.map(m => Boolean(m)),
            wheels: wheels.map(w => Boolean(w)),
            meshesCount: gltf.scene.children.length
          };
        } catch (err) {
          return {
            success: false,
            message: err.message,
            stack: err.stack
          };
        }
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Result:', JSON.stringify(res.result.value, null, 2));

  try { chrome.kill(); } catch {}
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  try { chrome.kill(); } catch {}
  process.exit(1);
});
