import fs from 'fs';

async function check() {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const list = await res.json();
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  
  await new Promise(r => ws.onopen = r);

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[Browser Console]:', ...msg.params.args.map(a => a.value || a.description || ''));
    }
  };

  let id = 1;
  function cmd(method, params = {}) {
    return new Promise((resolve) => {
      const curId = id++;
      const handler = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  await cmd('Runtime.enable');
  await cmd('Page.enable');

  const evalRes = await cmd('Runtime.evaluate', {
    expression: `
      (async () => {
        const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        try {
          const gltf = await loader.loadAsync('/models/bmw_m4_gt3_evo/bmw_m4_gt3_evo.glb');
          return { success: true, children: gltf.scene.children.map(c => c.name) };
        } catch (err) {
          return { success: false, error: err.message, stack: err.stack };
        }
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Loader Result:', evalRes.result.value);
  process.exit(0);
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});
