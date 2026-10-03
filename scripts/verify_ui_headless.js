import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';

const edgePaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

const browserExe = edgePaths.find(p => fs.existsSync(p));
if (!browserExe) {
  console.error('No Chrome/Edge executable found on system.');
  process.exit(1);
}

const port = 9555;
const browserProcess = spawn(browserExe, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--disable-gpu-sandbox',
  '--use-gl=angle',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1280,720',
  'http://127.0.0.1:4173/index.html',
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

async function runTest() {
  try {
    const pageWs = await getPageWs();
    console.log('Connected to page CDP:', pageWs);

    const ws = new WebSocket(pageWs);
    let msgId = 1;
    const pending = new Map();

    ws.onerror = (e) => console.error('WS error:', e);
    ws.onclose = () => console.log('WS closed');

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
        const id = msgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await new Promise(r => { ws.onopen = r; });
    await cmd('Page.enable');
    await cmd('Runtime.enable');
    await cmd('DOM.enable');

    console.log('Waiting for initial page load and 3D scene (3.5s)...');
    await new Promise(r => setTimeout(r, 3500));

    // 1. Screenshot Main Menu
    let snap = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('menu_initial.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved menu_initial.png');

    // 2. Click Garage Tab
    console.log('Opening GARAGE tab...');
    await cmd('Runtime.evaluate', {
      expression: `document.getElementById('nav-garage').click();`
    });
    await new Promise(r => setTimeout(r, 1200));

    snap = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('garage_r34.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved garage_r34.png (R34 in Garage)');

    // 3. Switch to BMW M4 GT3 EVO
    console.log('Switching to BMW M4 GT3 EVO...');
    await cmd('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('[data-car-id="m4_gt3_evo"]');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 2200));

    snap = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('garage_bmw_m4_gt3.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved garage_bmw_m4_gt3.png (BMW M4 GT3 in Garage)');

    // 4. Test 360 degree drag orbit
    console.log('Orbiting camera 360 degrees in Garage...');
    await cmd('Runtime.evaluate', {
      expression: `
        const canvas = document.querySelector('canvas');
        const rect = canvas.getBoundingClientRect();
        const startX = rect.left + rect.width * 0.5;
        const startY = rect.top + rect.height * 0.5;
        
        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, button: 0, pointerId: 1 }));
        canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: startX - 280, clientY: startY - 40, pointerId: 1 }));
        canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
      `
    });
    await new Promise(r => setTimeout(r, 1200));

    snap = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('garage_bmw_orbit.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved garage_bmw_orbit.png (Rotated 360 Orbit Inspection)');

    // 5. Click DRIVE to start gameplay with BMW
    console.log('Starting DRIVE with BMW M4 GT3 EVO...');
    await cmd('Runtime.evaluate', {
      expression: `document.getElementById('garage-drive-now-btn').click();`
    });
    await new Promise(r => setTimeout(r, 2000));

    // Drive forward with W
    await cmd('Runtime.evaluate', {
      expression: `
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      `
    });
    await new Promise(r => setTimeout(r, 2000));

    snap = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('bmw_driving_exterior.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved bmw_driving_exterior.png (BMW Exterior Driving)');

    // 6. Switch to Cockpit (FPP) Camera
    console.log('Switching to Cockpit / FPP Camera (Press C x3)...');
    await cmd('Runtime.evaluate', {
      expression: `
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
        setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' })), 300);
        setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' })), 600);
      `
    });
    await new Promise(r => setTimeout(r, 1500));

    snap = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('bmw_cockpit_fpp.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved bmw_cockpit_fpp.png (BMW GT3 Cockpit Camera)');

    console.log('All automated browser verification completed successfully!');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    browserProcess.kill();
  }
}

runTest();
