import * as THREE from 'three';
import type { World } from '../world/World.ts';

export class PerformanceOverlay {
  private container = document.createElement('div');
  private textElement = document.createElement('pre');
  private visible = false;
  private frameTimes: number[] = [];
  private lastTime = performance.now();
  private maxFrameMs = 0;
  private maxFrameTimer = 0;
  private spikeHistory: { time: string; ms: number }[] = [];
  private updateThrottle = 0;

  constructor(private renderer: THREE.WebGLRenderer, private world: World) {
    this.container.id = 'dev-perf-overlay';
    this.container.style.cssText = `
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 99999;
      background: rgba(10, 15, 22, 0.88);
      border: 1px solid rgba(80, 227, 194, 0.35);
      border-radius: 8px;
      padding: 10px 14px;
      color: #e0f2fe;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      line-height: 1.45;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
      pointer-events: none;
      user-select: none;
      display: none;
    `;

    this.textElement.style.margin = '0';
    this.container.appendChild(this.textElement);
    document.body.appendChild(this.container);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        this.toggle();
      }
    });
  }

  toggle(force?: boolean) {
    this.visible = force ?? !this.visible;
    this.container.style.display = this.visible ? 'block' : 'none';
  }

  update(dt: number) {
    const now = performance.now();
    const frameMs = now - this.lastTime;
    this.lastTime = now;

    if (frameMs > this.maxFrameMs) {
      this.maxFrameMs = frameMs;
    }
    this.maxFrameTimer += dt;
    if (this.maxFrameTimer > 2.0) {
      this.maxFrameTimer = 0;
      this.maxFrameMs = frameMs;
    }

    if (frameMs > 45) {
      const d = new Date();
      const timeStr = `${d.getMinutes()}:${d.getSeconds().toString().padStart(2, '0')}.${Math.floor(d.getMilliseconds() / 100)}`;
      this.spikeHistory.unshift({ time: timeStr, ms: Math.round(frameMs * 10) / 10 });
      if (this.spikeHistory.length > 5) this.spikeHistory.pop();
    }

    if (!this.visible) return;

    this.frameTimes.push(frameMs);
    if (this.frameTimes.length > 60) this.frameTimes.shift();

    this.updateThrottle += dt;
    if (this.updateThrottle < 0.1) return; // update text every 100ms
    this.updateThrottle = 0;

    const avgMs = this.frameTimes.reduce((a, b) => a + b, 0) / (this.frameTimes.length || 1);
    const fps = Math.round(1000 / (avgMs || 16.6));

    const render = this.renderer.info.render;
    const memory = this.renderer.info.memory;
    const { trees, grass } = this.world.statsCounts;

    const spikeColor = this.maxFrameMs > 50 ? '#ef4444' : this.maxFrameMs > 30 ? '#f59e0b' : '#10b981';

    let spikeText = 'None';
    if (this.spikeHistory.length > 0) {
      spikeText = this.spikeHistory.map((s) => `${s.time}: ${s.ms}ms`).join('\n  ');
    }

    this.textElement.innerHTML = `
<span style="color:#50e3c2;font-weight:bold;">AFTERMILE ENGINE PROFILER [F3]</span>
FPS:              <b>${fps}</b> (${avgMs.toFixed(1)} ms)
Peak Frame (2s):  <span style="color:${spikeColor};font-weight:bold;">${this.maxFrameMs.toFixed(1)} ms</span>
Draw Calls:       <b>${render.calls}</b>
Triangles:        <b>${render.triangles.toLocaleString()}</b>
Geometries:       <b>${memory.geometries}</b>
Textures:         <b>${memory.textures}</b>
Active Chunks:    <b>${this.world.chunks.size}</b>
Tree Instances:   <b>${trees.toLocaleString()}</b>
Grass Instances:  <b>${grass.toLocaleString()}</b>
Recent Spikes (&gt;45ms):
  ${spikeText}
`.trim();
  }

  dispose() {
    this.container.remove();
  }
}
