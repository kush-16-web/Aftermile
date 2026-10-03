import fs from 'fs';
import { spawn } from 'child_process';

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9333',
  '--disable-gpu',
  'http://127.0.0.1:4173/'
], { stdio: 'ignore' });

async function run() {
  await new Promise(r => setTimeout(r, 2000));
  const listRes = await fetch('http://127.0.0.1:9333/json/list');
  const list = await listRes.json();
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[Browser Console]:', ...msg.params.args.map(a => a.value || a.description || ''));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[Browser Exception]:', JSON.stringify(msg.params.exceptionDetails, null, 2));
    }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(msg.error);
      else p.resolve(msg.result);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/index.html' });
  await new Promise(r => setTimeout(r, 4000));

  console.log('Evaluating game vehicle selection...');
  const res = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        try {
          const game = window.__drive;
          console.log('Window __drive:', Boolean(game));
          if (game) {
            console.log('Switching vehicle to m4_gt3_evo...');
            await game.switchVehicle('m4_gt3_evo');
            return {
              selected: game.vehicle.config.id,
              ready: game.hero.ready,
              error: game.hero.error
            };
          }
          return { noGame: true };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Result:', JSON.stringify(res.result.value, null, 2));
  chrome.kill();
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  try { chrome.kill(); } catch {}
  process.exit(1);
});
