import type { VehicleController } from './VehicleController.ts';
import type { VehicleConfig } from './VehicleConfig.ts';
import type { AudioManager } from '../audio/AudioManager.ts';

/** Imported only inside import.meta.env.DEV; absent from the production bundle. */
export class VehicleDebug {
  private panel = document.createElement('aside');
  private telemetry = document.createElement('pre');
  private audioTelemetry = document.createElement('pre');
  private audioControlsContainer = document.createElement('div');
  private fields: { input: HTMLInputElement; path: string }[] = [];
  private defaults: VehicleConfig;

  private navTelemetry = document.createElement('pre');

  constructor(
    private vehicle: VehicleController,
    private resetCamera: () => void,
    private getAudio?: () => AudioManager
  ) {
    this.defaults = structuredClone(vehicle.config);
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Vehicle development tuning');
    this.panel.style.cssText =
      'position:fixed;z-index:1000;right:12px;top:12px;width:380px;max-height:92vh;overflow:auto;padding:18px;background:#0d141ef7;border:1px solid #4a6878;border-radius:12px;color:#ecf5f7;font:12px/1.45 monospace;box-shadow:0 8px 35px #000b';

    const title = document.createElement('strong');
    title.style.cssText = 'color:#50e3c2;font-size:13px;display:block;margin-bottom:8px';
    title.textContent = 'VEHICLE, AUDIO & NAV DEV INSPECTOR · F2';

    // Global dev window hook for testing
    if (typeof window !== 'undefined') {
      (window as any).__AFTERMILE_AUDIO__ = {
        getAudio: () => this.getAudio?.(),
        getLayerStates: () => this.getAudio?.()?.vehicle?.getDebugLayerStates() || [],
        mute: (layer: string, val = true) => this.getAudio?.()?.vehicle?.setLayerMute(layer, val),
        solo: (layer: string, val = true) => this.getAudio?.()?.vehicle?.setLayerSolo(layer, val),
        resetMutes: () => {
          const v = this.getAudio?.()?.vehicle;
          if (v) {
            v.controls.mutedLayers.clear();
            v.controls.soloLayers.clear();
          }
        },
      };
    }

    this.audioControlsContainer.style.cssText = 'margin:10px 0;padding:8px;background:#151e29;border-radius:6px;border:1px solid #283a4c';
    this.buildAudioButtons();

    this.panel.append(title, this.telemetry, this.navTelemetry, this.audioTelemetry, this.audioControlsContainer);

    const speedLabel = document.createElement('label');
    speedLabel.textContent = 'Test speed (km/h) ';
    const speed = document.createElement('select');
    speed.setAttribute('aria-label', 'Vehicle test speed');
    for (const v of [0, 10, 30, 60, 100, 130, 160]) {
      const option = new Option(String(v), String(v));
      speed.add(option);
    }
    speedLabel.append(speed);
    this.panel.append(speedLabel);

    const setSpeed = document.createElement('button');
    setSpeed.textContent = 'Set speed';
    setSpeed.style.cssText = 'margin-left:8px;background:#243b4d;color:#fff;border:1px solid #486577;padding:3px 8px;border-radius:4px;cursor:pointer';
    setSpeed.onclick = () => {
      const p = this.vehicle.physics;
      p.reset();
      p.speed = Number(speed.value) / 3.6;
      while (
        p.gear < this.vehicle.config.engine.gears.length &&
        ((p.speed / this.vehicle.config.wheelRadius) * this.vehicle.config.engine.gears[p.gear - 1] * this.vehicle.config.engine.finalDrive * 60) /
          (Math.PI * 2) >
          5500
      )
        p.gear++;
      this.resetCamera();
    };
    this.panel.append(setSpeed);

    const specs: [string, string, number, number, number][] = [
      ['Mass (kg)', 'mass', 1200, 2300, 25],
      ['CG height (m)', 'centerOfGravity', 0.3, 0.8, 0.01],
      ['Keyboard ramp /s', 'steering.inputRate', 1, 5, 0.1],
      ['Highway ramp /s', 'steering.highwayInputRate', 1, 4, 0.1],
      ['Steering rack response', 'steering.response', 6, 18, 0.5],
      ['Highway rack response', 'steering.highwayResponse', 6, 18, 0.5],
      ['Input return /s', 'steering.returnRate', 2, 8, 0.1],
      ['Yaw damping', 'steering.yawDamping', 0, 2.5, 0.02],
      ['Dry tire grip', 'tires.grip', 0.6, 1.25, 0.01],
      ['Spring (N/m per wheel)', 'suspension.stiffness', 20000, 50000, 1000],
      ['Damper (Ns/m per wheel)', 'suspension.damping', 2000, 5500, 100],
      ['Brake force (N)', 'brakes.force', 9000, 23000, 500],
      ['Engine power (kW)', 'engine.powerKw', 160, 400, 5],
      ['Engine force cap (N)', 'engine.maxDriveForce', 5000, 11000, 250],
      ['Drag area (m²)', 'dragArea', 0.45, 1.1, 0.01],
    ];

    for (const [name, path, min, max, step] of specs) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;justify-content:space-between;gap:12px;margin-top:7px';
      label.append(document.createTextNode(name));
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(this.get(path));
      input.style.cssText = 'width:85px;background:#1c2833;color:white;border:1px solid #48606b;padding:3px 5px;border-radius:3px';
      input.onchange = () => {
        const n = input.valueAsNumber;
        if (Number.isFinite(n)) {
          this.set(path, Math.max(min, Math.min(max, n)));
          input.value = String(this.get(path));
        }
      };
      label.append(input);
      this.panel.append(label);
      this.fields.push({ input, path });
    }

    const reset = document.createElement('button');
    reset.textContent = 'Restore ' + vehicle.config.name + ' tune';
    reset.style.cssText = 'margin-top:12px;display:block;width:100%;padding:6px;background:#1a3142;color:#7ee;border:1px solid #366;border-radius:4px;cursor:pointer';
    reset.onclick = () => {
      Object.assign(this.vehicle.config, structuredClone(this.defaults));
      this.vehicle.physics.reset();
      this.resetCamera();
      this.fields.forEach(f => (f.input.value = String(this.get(f.path))));
    };
    this.panel.append(reset);

    const note = document.createElement('p');
    note.style.cssText = 'font-size:11px;color:#8a9fa8;margin-top:8px';
    note.textContent = 'Press F2 to toggle inspector. SOLO / MUTE buttons allow live listening to individual audio layers.';
    this.panel.append(note);
    document.body.append(this.panel);
  }

  private buildAudioButtons() {
    this.audioControlsContainer.innerHTML = '<div style="font-weight:bold;margin-bottom:6px;color:#f0a050">RUNTIME AUDIO ISOLATION (F2)</div>';

    const macros = document.createElement('div');
    macros.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px';

    const addMacro = (label: string, action: () => void) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = 'font-size:10px;padding:3px 6px;background:#203545;color:#8df;border:1px solid #3d607a;border-radius:3px;cursor:pointer';
      btn.onclick = () => { action(); this.buildAudioButtons(); };
      macros.append(btn);
    };

    addMacro('ENGINE ONLY', () => {
      const a = this.getAudio?.()?.vehicle;
      if (!a) return;
      a.controls.soloLayers.clear();
      a.controls.mutedLayers.clear();
      a.setLayerSolo('engine', true);
    });

    addMacro('ROAD ONLY', () => {
      const a = this.getAudio?.()?.vehicle;
      if (!a) return;
      a.controls.soloLayers.clear();
      a.controls.mutedLayers.clear();
      a.setLayerSolo('road', true);
    });

    addMacro('WIND ONLY', () => {
      const a = this.getAudio?.()?.vehicle;
      if (!a) return;
      a.controls.soloLayers.clear();
      a.controls.mutedLayers.clear();
      a.setLayerSolo('wind', true);
    });

    addMacro('ALL MUTED', () => {
      const a = this.getAudio?.()?.vehicle;
      if (!a) return;
      a.controls.soloLayers.clear();
      a.controls.mutedLayers.clear();
      ['engine', 'road', 'wind', 'turbo', 'blowOff', 'gearWhine', 'shiftPop', 'overrun', 'tireScrub', 'tireSqueal', 'surface', 'tunnel'].forEach(l => a.setLayerMute(l, true));
    });

    addMacro('RESET ALL', () => {
      const a = this.getAudio?.()?.vehicle;
      if (!a) return;
      a.controls.soloLayers.clear();
      a.controls.mutedLayers.clear();
    });

    this.audioControlsContainer.append(macros);

    const layers = [
      'engine',
      'idle_on', 'idle_off',
      'low_on', 'low_off',
      'mid_low_on', 'mid_low_off',
      'mid_on', 'mid_off',
      'mid_high_on', 'mid_high_off',
      'high_on', 'high_off',
      'redline_on', 'redline_off',
      'turbo', 'blowOff', 'gearWhine', 'shiftPop', 'overrun',
      'tireScrub', 'tireSqueal', 'road', 'surface', 'wind', 'tunnel'
    ];

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:110px 1fr 1fr;gap:3px;align-items:center;max-height:220px;overflow-y:auto;padding-right:4px';

    const audio = this.getAudio?.();
    const ctrl = audio?.vehicle?.controls;

    for (const layer of layers) {
      const nameLbl = document.createElement('span');
      nameLbl.style.cssText = 'font-size:10px;color:#cde;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      nameLbl.textContent = layer;

      const isMuted = ctrl?.mutedLayers.has(layer) || false;
      const isSolo = ctrl?.soloLayers.has(layer) || false;

      const muteBtn = document.createElement('button');
      muteBtn.textContent = 'MUTE';
      muteBtn.style.cssText = `font-size:9px;padding:1px 4px;background:${isMuted ? '#822' : '#321c1c'};color:${isMuted ? '#fff' : '#f88'};border:1px solid #633;border-radius:2px;cursor:pointer`;
      muteBtn.onclick = () => {
        const a = this.getAudio?.();
        if (!a?.vehicle) return;
        const nowMuted = a.vehicle.controls.mutedLayers.has(layer);
        a.vehicle.setLayerMute(layer, !nowMuted);
        this.buildAudioButtons();
      };

      const soloBtn = document.createElement('button');
      soloBtn.textContent = 'SOLO';
      soloBtn.style.cssText = `font-size:9px;padding:1px 4px;background:${isSolo ? '#286' : '#1c3228'};color:${isSolo ? '#fff' : '#8f8'};border:1px solid #364;border-radius:2px;cursor:pointer`;
      soloBtn.onclick = () => {
        const a = this.getAudio?.();
        if (!a?.vehicle) return;
        const nowSolo = a.vehicle.controls.soloLayers.has(layer);
        a.vehicle.setLayerSolo(layer, !nowSolo);
        this.buildAudioButtons();
      };

      grid.append(nameLbl, muteBtn, soloBtn);
    }

    this.audioControlsContainer.append(grid);
  }

  private get(path: string): number {
    return path.split('.').reduce((o, k) => o[k], this.vehicle.config as any);
  }
  private set(path: string, value: number) {
    const parts = path.split('.'),
      key = parts.pop()!;
    parts.reduce((o, k) => o[k], this.vehicle.config as any)[key] = value;
  }
  toggle() {
    this.panel.hidden = !this.panel.hidden;
  }

  update(fps = 60, dt = 0.016, cameraMode = 'Chase', accumulatorAlpha = 0, navDebug?: { currentRoad?: string; nextRoad?: string; maneuverType?: string; distance?: number; routeProgress?: number; routeSegment?: string }) {
    if (this.panel.hidden) return;
    const p = this.vehicle.physics,
      deg = 180 / Math.PI;

    this.telemetry.textContent = [
      `=== TIMING & PERFORMANCE ===`,
      `FPS / Frame ${(fps).toFixed(1)} FPS | ${(dt * 1000).toFixed(1)} ms`,
      `Camera Mode ${cameraMode}`,
      `Render Alpha ${(accumulatorAlpha * 100).toFixed(1)}%`,
      `\n=== DYNAMICS: [ ${p.dynamicState} ] ===`,
      `Vehicle     ${this.vehicle.config.name}`,
      `Speed       ${(p.speed * 3.6).toFixed(1)} km/h (${p.speed.toFixed(2)} m/s)`,
      `RPM / gear  ${Math.round(p.rpm)} / ${p.speed < -0.1 ? 'R' : p.gear}`,
      `Throttle/Ld ${(p.throttle * 100).toFixed(0)}% / ${(p.engineLoad * 100).toFixed(0)}%`,
      `TC Cut/ABS  ${(p.tcCut * 100).toFixed(0)}% / ${p.absActive ? 'ACTIVE' : 'OFF'}`,
      `Slip / Angle ${(p.slip * 100).toFixed(1)}% / ${(p.wheelsTelemetry[2]?.slipAngle * deg || 0).toFixed(1)}°`,
    ].join('\n');

    if (navDebug) {
      this.navTelemetry.textContent = [
        `\n=== NAVIGATION ROUTE TRUTH ===`,
        `Current Road:   ${navDebug.currentRoad || 'NONE'}`,
        `Next Road:      ${navDebug.nextRoad || 'NONE'}`,
        `Maneuver:       ${navDebug.maneuverType || 'CONTINUE'} (${navDebug.distance ?? 0} m)`,
        `Route Progress: ${((navDebug.routeProgress ?? 0) * 100).toFixed(1)}% [${navDebug.routeSegment || 'Active'}]`,
      ].join('\n');
    } else {
      this.navTelemetry.textContent = '';
    }

    const audio = this.getAudio?.();
    if (audio?.vehicle) {
      const c = audio.vehicle.controls;
      const layers = audio.vehicle.getDebugLayerStates();
      const audibleEngineCount = c.getAudibleEngineLayersCount(0.02);

      const layerLines = layers.filter(l => !l.name.includes('_') || l.gain > 0.001 || l.muted || l.solo).map(l => {
        const state = l.muted ? '[MUTED]' : l.solo ? '[SOLO]' : '  [ON]';
        const freq = l.frequency ? ` @ ${Math.round(l.frequency)}Hz` : '';
        return `${state} ${(l.name + ':').padEnd(14)} gain: ${l.gain.toFixed(3)}${freq}`;
      });

      this.audioTelemetry.textContent = [
        `\n=== REALTIME AUDIO LAYERS ===`,
        `Profile     ${c.profile.name}`,
        `Audible Engine Sources: ${audibleEngineCount} / 14`,
        `Boost       ${(c.boost * 1.5).toFixed(2)} bar | Whine Freq: ${Math.round(c.gearWhineFrequency)} Hz`,
        `Shift Cut   ${(c.shiftCut * 100).toFixed(0)}% | Engine Freq: ${Math.round(c.engineCutoff)} Hz`,
        `-----------------------------`,
        ...layerLines,
      ].join('\n');
    }
  }
}

