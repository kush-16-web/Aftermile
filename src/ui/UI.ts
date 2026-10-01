import type { Settings, SettingsData } from '../systems/Settings.ts';
import type { City, WeatherMode } from '../weather/Weather.ts';
import { weatherNames, moonLabel, lunarPhase } from '../weather/Weather.ts';
import { cameraNames } from '../vehicle/CameraController.ts';

const icon = (name: string) => {
  const paths: Record<string, string> = {
    drive: '<circle cx="12" cy="12" r="8"/><polygon points="10 8 16 12 10 16" fill="currentColor"/>',
    world: '<path d="M12 2L2 12l10 10 10-10L12 2z"/><circle cx="12" cy="12" r="3"/>',
    weather: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    garage: '<path d="M4 15l2-5.5a2 2 0 0 1 1.9-1.3h8.2a2 2 0 0 1 1.9 1.3L20 15v3a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3zM6 13h12M7.5 10l-1.1 3M16.5 10l1.1 3"/><circle cx="7.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="16.5" cy="15.5" r="1.2" fill="currentColor"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    play: '<path d="m9 5 11 7-11 7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    moon: '<path d="M20 14A9 9 0 0 1 10 4a9 9 0 1 0 10 10Z"/>',
    rain: '<path d="M5 14a5 5 0 1 1 5-8 4 4 0 1 1 7 8M7 18l-1 3m7-3-1 3m7-3-1 3"/>',
    camera: '<path d="M3 7h5l2-3h4l2 3h5v13H3z"/><circle cx="12" cy="13" r="4"/>',
    fuel: '<path d="M4 21V4h10v17M2 21h14M6 7h6v5H6m8-4 4 4v6a2 2 0 0 0 4 0V8l-4-4"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4zM17 8q5 4 0 8"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3q-7 9 0 18M12 3q7 9 0 18"/>',
    reset: '<path d="M4 5v5h5M4 10a8 8 0 1 1 1 8"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sun}</svg>`;
};

const weatherSvg = (mode: string) => {
  const map: Record<string, string> = {
    clear: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11 1.5 1.5M5 19l1.5-1.5m11-11 1.5-1.5"/>',
    partly: '<path d="M12 2v2M4.93 4.93l1.41 1.41M2 12h2"/><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    overcast: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    fog: '<path d="M4 14h16M2 18h20M6 10h12"/>',
    rain: '<path d="M17.5 16H9a6 6 0 1 1 5.75-7.75A4 4 0 1 1 19 16Z"/><path d="m8 19-1 3m5-3-1 3m5-3-1 3"/>',
    heavy: '<path d="M17.5 15H9a6 6 0 1 1 5.75-7.75A4 4 0 1 1 19 15Z"/><path d="m7 18-2 5m6-5-2 5m6-5-2 5m6-5-2 5"/>',
    storm: '<path d="M17.5 16H9a6 6 0 1 1 5.75-7.75A4 4 0 1 1 19 16Z"/><path d="m13 16-3 4h4l-2 4"/>',
    snow: '<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14"/>',
    autumn: '<path d="M12 2a9 9 0 0 1 9 9c0 5-4 9-9 9s-9-4-9-9a9 9 0 0 1 9-9Z"/><path d="M12 2v18M8 6l8 12M16 6 8 18"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${map[mode] || map.clear}</svg>`;
};

const timeSvg = (mode: string) => {
  const map: Record<string, string> = {
    dawn: '<path d="M12 3v6m-9 9h18M5 14a7 7 0 0 1 14 0M4 18l2-2m14 2-2-2"/>',
    morning: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11 1.5 1.5M5 19l1.5-1.5m11-11 1.5-1.5"/>',
    noon: '<circle cx="12" cy="12" r="5"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1m11.4-11.4 2.1-2.1"/>',
    golden: '<path d="M12 9v4m-9 5h18M6 14a6 6 0 0 1 12 0M2 18h20"/>',
    evening: '<path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8A9 9 0 0 0 12 3Z"/><path d="m19 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
    night: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/><circle cx="17" cy="5" r="0.75" fill="currentColor"/><circle cx="19" cy="9" r="0.75" fill="currentColor"/>',
    real: '<circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${map[mode] || map.real}</svg>`;
};

function generateTachometerMarkup(): string {
  const cx = 120;
  const cy = 120;
  const rOuter = 94;
  let ticksSvg = '';

  for (let k = 0; k <= 16; k++) {
    const rpm = k * 500;
    const deg = 135 + k * 16.875;
    const rad = (deg * Math.PI) / 180;
    const isMajor = k % 2 === 0;
    const isRedline = rpm >= 7000;
    const rInner = isMajor ? 80 : 86;

    const x1 = (cx + rOuter * Math.cos(rad)).toFixed(1);
    const y1 = (cy + rOuter * Math.sin(rad)).toFixed(1);
    const x2 = (cx + rInner * Math.cos(rad)).toFixed(1);
    const y2 = (cy + rInner * Math.sin(rad)).toFixed(1);

    const strokeColor = isRedline ? 'var(--red, #d75c70)' : (isMajor ? 'rgba(231, 237, 239, 0.95)' : 'rgba(143, 162, 175, 0.35)');
    const strokeWidth = isMajor ? '2' : '1.1';

    ticksSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;

    if (isMajor) {
      const num = rpm / 1000;
      const xNum = (cx + 66 * Math.cos(rad)).toFixed(1);
      const yNum = (cy + 66 * Math.sin(rad) + 4).toFixed(1);
      ticksSvg += `<text x="${xNum}" y="${yNum}" font-size="11" font-weight="600" fill="${strokeColor}" text-anchor="middle" font-family="'Avenir Next', sans-serif">${num}</text>`;
    }
  }

  return `
    <div class="automotive-gauge-wrap" id="tachometer-cluster">
      <svg class="gauge-svg" viewBox="0 0 240 240" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="needleGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <linearGradient id="rpmArcGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stop-color="#88bec4" stop-opacity="0.3"/>
            <stop offset="70%" stop-color="#88bec4" stop-opacity="0.85"/>
            <stop offset="90%" stop-color="#d75c70" stop-opacity="1"/>
          </linearGradient>
        </defs>

        <!-- Outer Bezel Ring & Background Track -->
        <circle cx="120" cy="120" r="104" fill="rgba(6, 14, 22, 0.72)" stroke="rgba(136, 190, 196, 0.15)" stroke-width="1.2"/>
        <path d="M 53.5 186.5 A 94 94 0 1 1 186.5 186.5" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="3" stroke-linecap="round"/>
        
        <!-- Redline Zone Arc (7k - 8k) -->
        <path d="M 170.8 154.5 A 94 94 0 0 1 186.5 186.5" fill="none" stroke="rgba(215, 92, 112, 0.6)" stroke-width="4.5" stroke-linecap="round"/>

        <!-- Active Illuminated RPM Sweep Arc -->
        <path id="gauge-active-arc" d="M 53.5 186.5 A 94 94 0 1 1 186.5 186.5" fill="none" stroke="url(#rpmArcGrad)" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="443" stroke-dashoffset="443"/>

        <!-- Tick Marks & Numbers -->
        ${ticksSvg}

        <!-- Scale units -->
        <text x="120" y="66" font-size="8.5" font-weight="500" letter-spacing="0.18em" fill="rgba(143, 162, 175, 0.7)" text-anchor="middle">x1000 RPM</text>

        <!-- Dynamic Needle (Pivoted at Center 120, 120 with zero text collision) -->
        <g id="tacho-needle-group" style="transform-origin: 120px 120px; transform: rotate(-135deg); transition: transform 0.04s linear;">
          <!-- Fine Glowing Needle -->
          <polygon points="120,32 118,120 122,120" fill="#a5e6ee" filter="url(#needleGlow)"/>
          <line x1="120" y1="30" x2="120" y2="120" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>
          <circle cx="120" cy="120" r="5" fill="#08111a" stroke="#88bec4" stroke-width="1.5"/>
          <circle cx="120" cy="120" r="2" fill="#a5e6ee"/>
        </g>
      </svg>

      <!-- Center Gear and Digital Speed Overlays (Clean vertical separation) -->
      <div class="gauge-center-readout">
        <div class="center-gear-block" id="gauge-gear-block">
          <span id="speed-gear-num">N</span>
          <span class="center-sub">GEAR</span>
        </div>
        <div class="center-speed-block">
          <span id="speed-kmh-num">0</span>
          <span class="center-sub">KM/H</span>
        </div>
      </div>
    </div>

    <!-- Cluster Secondary Telemetry (Fuel & Trip) -->
    <div class="cluster-telemetry-row">
      <div class="cluster-fuel-item">
        <span class="telemetry-label">FUEL</span>
        <div class="telemetry-track"><div id="cluster-fuel-fill" class="telemetry-fill"></div></div>
        <span id="cluster-fuel-val" class="telemetry-val">100%</span>
      </div>
      <div class="cluster-trip-item">
        <span class="telemetry-label">TRIP</span>
        <span id="cluster-trip-val" class="telemetry-val">0.0 KM</span>
      </div>
    </div>
  `;
}

export interface UIActions {
  start: (zen: boolean) => void;
  resume: () => void;
  pause: () => void;
  restart: () => void;
  menu: () => void;
  camera: () => void;
  reset: () => void;
  setting: (key: keyof SettingsData, value: unknown) => void;
  modal: (open: boolean) => void;
  search: (query: string) => Promise<City[]>;
  city: (city: City) => Promise<void>;
  locate: () => Promise<void>;
}

export interface HudState {
  speed: number;
  gear: string;
  rpm: number;
  fuel: number;
  distance: number;
  region: string;
  regionProgress: number;
  nextStation: number;
  temperature: number;
  hour: number;
  condition: WeatherMode;
  weatherStatus: string;
  city: string;
  camera: number;
  zen: boolean;
  fps: number;
  refueling: boolean;
  canRefuel: boolean;
  danger: number;
  damage: number;
  clean: number;
  navCurve?: { x: number; y: number; marker?: string }[];
  navEvent?: string;
}

export class UI {
  root: HTMLElement;
  screen = 'menu';
  activeOverlay: string | null = null;
  previousOverlay: string | null = null;
  settingsTab = 'driving';
  companionCanvas: HTMLCanvasElement;
  lastToast = '';
  toastTimer = 0;
  cameraToastTimer = 0;
  assistMessageTimer = 0;
  lastAssistMessage = '';
  lastGear = 'N';
  steadyDriveTimer = 0;
  smoothedRpm = 850;
  elements: Record<string, HTMLElement> = {};
  onScreenChanged: () => void = () => {};

  constructor(public settings: Settings, public actions: UIActions) {
    this.root = document.getElementById('app')!;
    this.root.innerHTML = `
      <div class="vignette" aria-hidden="true"></div>
      <div id="sense" aria-hidden="true"></div>

      <!-- Integrated Floating Top Navigation -->
      <header class="top-nav" id="top-nav">
        <a class="nav-brand" href="#" id="brand-home" aria-label="Aftermile Home">
          <span class="brand-icon">◈</span>
          <span class="brand-name">AFTER<span class="brand-light">MILE</span></span>
        </a>

        <nav class="nav-items" aria-label="Main Navigation">
          <button class="nav-btn" id="nav-drive" title="Start Driving">
            ${icon('drive')}<span>DRIVE</span>
          </button>
          <button class="nav-btn" id="nav-world" title="World and Routes">
            ${icon('world')}<span>WORLD</span>
          </button>
          <button class="nav-btn" id="nav-weather" title="Atmosphere and Time">
            ${icon('weather')}<span>WEATHER</span>
          </button>
          <button class="nav-btn" id="nav-garage" title="Vehicle Showcase">
            ${icon('garage')}<span>GARAGE</span>
          </button>
          <button class="nav-btn" id="nav-settings" title="Game Settings">
            ${icon('settings')}<span>SETTINGS</span>
          </button>
          <div class="nav-active-bar" id="nav-active-bar"></div>
        </nav>

        <div class="nav-right">
          <button class="weather-chip" id="weather-chip" title="Atmospheric conditions">
            ${icon('sun')}
            <span>
              <strong id="weather-text">Clear skies · 25°</strong>
              <span id="weather-time">17:24 · SIMULATION</span>
            </span>
          </button>
        </div>
      </header>

      <!-- Full-Viewport Overlay Layer (Live 3D world rendered underneath) -->
      <main class="overlay-layer hidden" id="overlay-layer">
        <div class="overlay-viewport" id="overlay-viewport">
          <!-- Dynamic floating tab contents injected here -->
        </div>
      </main>

      <!-- Minimalist Automotive Driving HUD -->
      <section id="hud" class="hud hidden" aria-label="Driving instruments">
        <!-- Bottom-Left Driver HUD Zone (Route Preview stacked above Tachometer in corner) -->
        <div class="hud-driver-zone" id="hud-driver-zone">
          <div class="driver-instruments-row">
            <!-- Premium Route Preview Card (Compact in Bottom-Left Corner) -->
            <div class="nav-strip" id="nav-strip" aria-label="Route Preview Ahead">
              <div class="nav-header">
                <div class="nav-info-block">
                  <span class="nav-eyebrow" id="nav-region-name">CRESCENT BAY</span>
                  <span id="nav-landmark" class="nav-landmark">HIGHWAY AHEAD</span>
                </div>
              </div>
              <div class="nav-canvas-wrap">
                <svg id="nav-svg" viewBox="0 0 200 60" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="navRoadGlow" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stop-color="#88bec4" stop-opacity="0.95"/>
                      <stop offset="85%" stop-color="#88bec4" stop-opacity="0.4"/>
                      <stop offset="100%" stop-color="#88bec4" stop-opacity="0.1"/>
                    </linearGradient>
                    <filter id="navGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="1.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <!-- Road corridor outline -->
                  <path id="nav-road-bg" d="M 100 50 L 100 8" stroke="rgba(255,255,255,0.06)" stroke-width="10" stroke-linecap="round" fill="none"/>
                  <!-- Active road trajectory -->
                  <path id="nav-road-path" d="M 100 50 L 100 8" stroke="url(#navRoadGlow)" stroke-width="3.2" stroke-linecap="round" fill="none" filter="url(#navGlow)"/>
                  <!-- Event marker icon on path -->
                  <g id="nav-marker-group"></g>
                  <!-- Player vehicle chevron indicator (Safe margins, fully visible above route line) -->
                  <polygon points="100,45 95,52 105,52" fill="#e7edef" stroke="rgba(6,12,18,0.85)" stroke-width="0.8"/>
                </svg>
              </div>
              <div class="nav-footer">
                <span class="nav-sub-label">ROUTE PREVIEW</span>
                <span id="nav-distance-marker">350m AHEAD</span>
              </div>
            </div>

            <!-- Bottom-Left Circular Tachometer & Cluster -->
            <div class="hud-cluster-panel" id="hud-cluster-panel">
              ${generateTachometerMarkup()}
            </div>
          </div>
        </div>

        <!-- Drive controls helper -->
        <div class="drive-help" id="drive-help">
          <span><kbd>W A S D</kbd> Drive</span>
          <button id="camera-button"><kbd>C</kbd><span id="camera-name">Chase</span></button>
          <button id="pause-button"><kbd>ESC</kbd> Pause</button>
        </div>

        <!-- Camera Mode Toast Badge -->
        <div class="camera-mode-badge hidden" id="camera-mode-badge">
          <span class="camera-mode-text" id="camera-mode-text">COCKPIT</span>
        </div>

        <!-- Road Assist Panel (Bottom Right) -->
        <div class="companion-card" id="assist-card">
          <canvas id="companion" aria-label="Road Assist telemetry"></canvas>
          <div class="assist-body">
            <span class="eyebrow">ROAD ASSIST <i></i></span>
            <p id="suit-message">Clear highway ahead.</p>
          </div>
        </div>

        <div id="refuel-prompt" class="refuel-prompt hidden">
          <kbd>E</kbd><span id="refuel-text">Hold to refuel</span>
        </div>
        <div id="fuel-warning" class="fuel-warning hidden"></div>
      </section>

      <!-- Cinematic Full-Screen Pause Overlay (Click anywhere to resume · Clean action links) -->
      <section id="pause-screen" class="pause-screen hidden">
        <div class="pause-surface" id="pause-surface">
          <div class="pause-center-content">
            <span class="pause-eyebrow">AFTERMILE HIGHWAY</span>
            <h2 class="pause-title">PAUSED</h2>
            <p class="pause-hint">Click anywhere to continue · ESC to resume</p>
            <div class="pause-actions">
              <button class="pause-link" id="pause-open-settings">${icon('settings')} Settings</button>
              <button class="pause-link" id="pause-open-weather">${icon('weather')} Atmosphere</button>
              <button class="pause-link" id="pause-restart">${icon('reset')} Restart Drive</button>
            </div>
            <p id="pause-trip" class="pause-trip-info">0.0 km through Ember Coast.</p>
          </div>
        </div>
      </section>

      <div id="toast" class="toast hidden" role="status" aria-live="polite"></div>
      <div id="fps" class="fps hidden"></div>
    `;

    this.companionCanvas = document.getElementById('companion') as HTMLCanvasElement;
    const ids = [
      'weather-text', 'weather-time', 'speed-kmh-num', 'speed-gear-num', 'gauge-gear-block',
      'tacho-needle-group', 'gauge-active-arc', 'cluster-fuel-fill', 'cluster-fuel-val', 'cluster-trip-val',
      'hud-cluster-panel', 'hud-driver-zone', 'nav-strip', 'camera-name', 'camera-mode-badge', 'camera-mode-text',
      'suit-message', 'assist-card', 'refuel-prompt', 'refuel-text', 'fuel-warning', 'fps', 'sense',
      'toast', 'drive-help', 'nav-road-path', 'nav-road-bg', 'nav-region-name', 'nav-landmark', 'nav-distance-marker', 'nav-marker-group',
      'overlay-layer', 'overlay-viewport', 'nav-active-bar', 'top-nav', 'pause-screen', 'pause-trip'
    ];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) this.elements[id] = el;
    });

    const click = (id: string, fn: (e: MouseEvent) => void) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    // Navigation Buttons
    click('nav-drive', () => this.handleDriveClick(false));
    click('nav-world', () => this.switchOverlay('world'));
    click('nav-weather', () => this.switchOverlay('weather'));
    click('nav-garage', () => this.switchOverlay('garage'));
    click('nav-settings', () => this.switchOverlay('settings'));
    click('weather-chip', () => this.switchOverlay('weather'));
    click('brand-home', (e) => {
      e.preventDefault();
      if (this.screen === 'playing') actions.pause();
      else if (this.activeOverlay) this.closeOverlay();
    });

    // In-game HUD controls
    click('camera-button', () => {
      actions.camera();
    });
    click('pause-button', actions.pause);

    // Pause Screen Background Click-to-Resume & Links
    click('pause-surface', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.pause-actions')) return;
      actions.resume();
    });

    click('pause-open-settings', (e) => { e.stopPropagation(); this.switchOverlay('settings'); });
    click('pause-open-weather', (e) => { e.stopPropagation(); this.switchOverlay('weather'); });
    click('pause-restart', (e) => { e.stopPropagation(); actions.restart(); });

    // Keyboard ESC listener
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (this.activeOverlay) {
          e.preventDefault();
          this.closeOverlay();
        }
      }
    });

    this.setScreen('menu');
    this.updateActiveNavIndicator(null);
  }

  handleDriveClick(zen = false) {
    this.closeOverlay();
    if (this.screen === 'paused') {
      this.actions.resume();
    } else {
      this.actions.start(zen);
    }
  }

  setScreen(screen: string) {
    this.screen = screen;
    document.body.dataset.screen = screen;
    const isPlaying = screen === 'playing';
    const isPaused = screen === 'paused';

    document.getElementById('top-nav')?.classList.toggle('hidden', isPlaying);
    document.getElementById('hud')?.classList.toggle('hidden', !isPlaying);
    document.getElementById('pause-screen')?.classList.toggle('hidden', !isPaused);

    if (isPlaying) {
      this.closeOverlay();
      (document.activeElement as HTMLElement)?.blur();
    }
  }

  updateActiveNavIndicator(tabId: string | null) {
    const navBar = this.elements['nav-active-bar'];
    const navBtns = ['drive', 'world', 'weather', 'garage', 'settings'];

    navBtns.forEach(id => {
      const btn = document.getElementById(`nav-${id}`);
      if (btn) btn.classList.toggle('active', tabId === id);
    });

    if (!navBar) return;
    if (!tabId) {
      navBar.style.opacity = '0';
      return;
    }

    const targetBtn = document.getElementById(`nav-${tabId}`);
    if (targetBtn) {
      const rect = targetBtn.getBoundingClientRect();
      const parentRect = targetBtn.parentElement?.getBoundingClientRect();
      if (parentRect) {
        const left = rect.left - parentRect.left;
        const width = rect.width;
        navBar.style.left = `${left}px`;
        navBar.style.width = `${width}px`;
        navBar.style.opacity = '1';
      }
    }
  }

  switchOverlay(type: string) {
    if (this.activeOverlay === type) {
      this.closeOverlay();
      return;
    }

    this.previousOverlay = this.activeOverlay;
    this.activeOverlay = type;
    const layer = this.elements['overlay-layer'];
    if (layer) layer.classList.remove('hidden');

    // Make top nav visible so user can navigate between tabs
    document.getElementById('top-nav')?.classList.remove('hidden');

    // Hide pause screen underneath overlay to prevent z-index/click capture conflict
    if (this.screen === 'paused') {
      document.getElementById('pause-screen')?.classList.add('hidden');
    }

    this.updateActiveNavIndicator(type);
    this.actions.modal(true);
    this.renderActiveOverlay();
  }

  closeOverlay() {
    this.activeOverlay = null;
    this.previousOverlay = null;
    const layer = this.elements['overlay-layer'];
    if (layer) layer.classList.add('hidden');
    this.updateActiveNavIndicator(null);
    this.actions.modal(false);

    if (this.screen === 'paused') {
      document.getElementById('pause-screen')?.classList.remove('hidden');
    } else if (this.screen === 'playing') {
      document.getElementById('top-nav')?.classList.add('hidden');
      (document.activeElement as HTMLElement)?.blur();
    }
  }

  renderSettings() {
    this.renderActiveOverlay();
  }

  renderActiveOverlay() {
    const type = this.activeOverlay;
    const viewport = this.elements['overlay-viewport'];
    if (!viewport || !type) return;

    viewport.classList.remove('entering-view');
    void viewport.offsetWidth;
    viewport.classList.add('entering-view');

    const data = this.settings.data;

    if (type === 'world') {
      viewport.innerHTML = `
        <div class="floating-view world-view">
          <div class="floating-header">
            <span class="floating-eyebrow">PACIFIC COAST EXPRESSWAY · ROUTE 01</span>
            <h1 class="floating-title">WORLD</h1>
            <p class="floating-subtitle">A seamless 12.0 km coastal journey across valleys, ocean straits, and mountain passes.</p>
          </div>

          <div class="world-milestones-row">
            <div class="milestone-card active">
              <span class="milestone-num">01</span>
              <span class="milestone-name">Ember Coast</span>
              <span class="milestone-meta">0.0 – 2.4 KM · COASTAL STRIP</span>
            </div>
            <div class="milestone-card">
              <span class="milestone-num">02</span>
              <span class="milestone-name">Cypress Valley</span>
              <span class="milestone-meta">2.4 – 4.8 KM · CANYON CURVES</span>
            </div>
            <div class="milestone-card">
              <span class="milestone-num">03</span>
              <span class="milestone-name">Aster Crossing</span>
              <span class="milestone-meta">4.8 – 7.2 KM · OCEAN BRIDGE</span>
            </div>
            <div class="milestone-card">
              <span class="milestone-num">04</span>
              <span class="milestone-name">Midnight Metropolis</span>
              <span class="milestone-meta">7.2 – 9.6 KM · ILLUMINATED HIGHWAY</span>
            </div>
            <div class="milestone-card">
              <span class="milestone-num">05</span>
              <span class="milestone-name">Obsidian Pass</span>
              <span class="milestone-meta">9.6 – 12.0 KM · TUNNEL DESCENT</span>
            </div>
          </div>

          <div class="world-secondary-sync">
            <span class="secondary-label">ATMOSPHERE SYNCHRONIZATION</span>
            <div class="sync-controls-row">
              <button id="overlay-use-location" class="sync-btn">${icon('globe')} Sync with My Location</button>
              <form id="overlay-city-form" class="sync-form">
                <input id="overlay-city-search" placeholder="Search a city (e.g. Tokyo, Monaco, Seattle)…" autocomplete="off">
                <button type="submit" class="sync-submit-btn">Search</button>
              </form>
            </div>
            <div id="overlay-city-results" class="city-results-row" role="status"></div>
          </div>
        </div>
      `;
      this.bindWorldEvents();
    } else if (type === 'weather') {
      const weathers: WeatherMode[] = ['clear', 'partly', 'overcast', 'fog', 'rain', 'heavy', 'storm', 'snow', 'autumn'];
      const times = [
        { id: 'dawn', label: 'Dawn', sub: '05:30' },
        { id: 'morning', label: 'Morning', sub: '08:30' },
        { id: 'noon', label: 'Noon', sub: '12:00' },
        { id: 'golden', label: 'Golden Hour', sub: '17:45' },
        { id: 'evening', label: 'Evening', sub: '19:30' },
        { id: 'night', label: 'Night', sub: '23:00' },
        { id: 'real', label: 'Real Time', sub: 'Live Clock' }
      ];

      viewport.innerHTML = `
        <div class="floating-view weather-view">
          <div class="floating-header">
            <span class="floating-eyebrow">ENVIRONMENT & LIGHTING</span>
            <h1 class="floating-title">WEATHER & TIME</h1>
            <p class="floating-subtitle">Shape the sky, precipitation, and lighting conditions across the route.</p>
          </div>

          <div class="weather-dual-section">
            <div class="weather-col">
              <span class="section-label">ATMOSPHERE</span>
              <div class="choice-list">
                ${weathers.map(w => `
                  <button class="choice-item ${data.weather === w ? 'active' : ''}" data-weather="${w}">
                    <span class="item-icon">${weatherSvg(w)}</span>
                    <span class="item-name">${weatherNames[w]}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="weather-col">
              <span class="section-label">TIME OF DAY</span>
              <div class="choice-list">
                ${times.map(t => `
                  <button class="choice-item ${data.timeMode === t.id ? 'active' : ''}" data-time="${t.id}">
                    <span class="item-icon">${timeSvg(t.id)}</span>
                    <span class="item-name">${t.label}</span>
                    <small class="item-sub">${t.sub}</small>
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
      this.bindWeatherEvents();
    } else if (type === 'garage') {
      viewport.innerHTML = `
        <div class="floating-view garage-view">
          <div class="floating-header">
            <span class="floating-eyebrow">HERO SPECIFICATION</span>
            <h1 class="floating-title">NISSAN SKYLINE GT-R</h1>
            <p class="floating-subtitle">1999 BNR34 V-Spec · Bayside Blue (TV2)</p>
          </div>

          <div class="garage-specs-row">
            <div class="spec-stat-item">
              <span class="stat-tag">ENGINE</span>
              <strong class="stat-value">RB26DETT</strong>
              <span class="stat-sub">2.6L Twin-Turbo I6</span>
            </div>
            <div class="spec-stat-item">
              <span class="stat-tag">POWER</span>
              <strong class="stat-value">280 PS</strong>
              <span class="stat-sub">392 Nm @ 4,400 RPM</span>
            </div>
            <div class="spec-stat-item">
              <span class="stat-tag">DRIVETRAIN</span>
              <strong class="stat-value">ATTESA E-TS</strong>
              <span class="stat-sub">All-Wheel Drive</span>
            </div>
            <div class="spec-stat-item">
              <span class="stat-tag">TRANSMISSION</span>
              <strong class="stat-value">6-SPEED</strong>
              <span class="stat-sub">Getrag Manual</span>
            </div>
            <div class="spec-stat-item">
              <span class="stat-tag">REDLINE</span>
              <strong class="stat-value">7,800 RPM</strong>
              <span class="stat-sub">Multi-Layer Audio</span>
            </div>
          </div>

          <div class="garage-footer-hint">
            <span>LIVE 3D MODEL ACTIVE · CAMERAS CALIBRATED FOR CHASE, HOOD & COCKPIT</span>
          </div>
        </div>
      `;
    } else if (type === 'settings') {
      viewport.innerHTML = `
        <div class="floating-view settings-view">
          <div class="floating-header">
            <span class="floating-eyebrow">PREFERENCES & CONTROLS</span>
            <h1 class="floating-title">SETTINGS</h1>
          </div>

          <div class="settings-subtabs">
            <button class="subtab-btn ${this.settingsTab === 'driving' ? 'active' : ''}" data-tab="driving">DRIVING</button>
            <button class="subtab-btn ${this.settingsTab === 'graphics' ? 'active' : ''}" data-tab="graphics">GRAPHICS</button>
            <button class="subtab-btn ${this.settingsTab === 'audio' ? 'active' : ''}" data-tab="audio">AUDIO</button>
            <button class="subtab-btn ${this.settingsTab === 'assist' ? 'active' : ''}" data-tab="assist">ASSIST</button>
          </div>

          <div class="settings-rows-list" id="settings-rows-list">
            ${this.renderSettingsRows()}
          </div>
        </div>
      `;
      this.bindSettingsEvents();
    }
  }

  renderSettingsRows(): string {
    const data = this.settings.data;
    const tab = this.settingsTab;

    if (tab === 'driving') {
      return `
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Speed Units</span><small>Cluster speedometer measurement</small></div>
          <div class="setting-control">
            <button class="toggle-pill ${data.units === 'kmh' ? 'active' : ''}" data-key="units" data-val="kmh">KM/H</button>
            <button class="toggle-pill ${data.units === 'mph' ? 'active' : ''}" data-key="units" data-val="mph">MPH</button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Steering Smoothing</span><small>Input transition filter rate</small></div>
          <div class="setting-control slider-control">
            <input type="range" min="0.1" max="1" step="0.05" value="${data.smoothing}" data-slider="smoothing">
            <span class="slider-val">${Math.round(data.smoothing * 100)}%</span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Camera Field of View</span><small>Perspective FOV angle</small></div>
          <div class="setting-control slider-control">
            <input type="range" min="45" max="90" step="1" value="${data.fov}" data-slider="fov">
            <span class="slider-val">${Math.round(data.fov)}°</span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Fuel Simulation</span><small>Depletion and roadside refuel events</small></div>
          <div class="setting-control">
            <button class="toggle-pill ${data.fuel ? 'active' : ''}" data-toggle="fuel">${data.fuel ? 'Active' : 'Off'}</button>
          </div>
        </div>
      `;
    } else if (tab === 'graphics') {
      return `
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Visual Quality</span><small>Terrain geometry & light resolution</small></div>
          <div class="setting-control">
            <button class="toggle-pill ${data.quality === 'low' ? 'active' : ''}" data-key="quality" data-val="low">Low</button>
            <button class="toggle-pill ${data.quality === 'medium' ? 'active' : ''}" data-key="quality" data-val="medium">Med</button>
            <button class="toggle-pill ${data.quality === 'high' ? 'active' : ''}" data-key="quality" data-val="high">High</button>
            <button class="toggle-pill ${data.quality === 'ultra' ? 'active' : ''}" data-key="quality" data-val="ultra">Ultra</button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Reflections</span><small>Highway puddle & vehicle gloss</small></div>
          <div class="setting-control">
            <button class="toggle-pill ${data.reflections ? 'active' : ''}" data-toggle="reflections">${data.reflections ? 'Enabled' : 'Off'}</button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Precipitation Particles</span><small>Raindrops and falling snowflakes</small></div>
          <div class="setting-control slider-control">
            <input type="range" min="0" max="1" step="0.1" value="${data.particles}" data-slider="particles">
            <span class="slider-val">${Math.round(data.particles * 100)}%</span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">FPS Counter</span><small>Real-time frame rate readout</small></div>
          <div class="setting-control">
            <button class="toggle-pill ${data.fps ? 'active' : ''}" data-toggle="fps">${data.fps ? 'Shown' : 'Hidden'}</button>
          </div>
        </div>
      `;
    } else if (tab === 'audio') {
      return `
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Master Volume</span><small>Overall audio level</small></div>
          <div class="setting-control slider-control">
            <input type="range" min="0" max="1" step="0.05" value="${data.master}" data-slider="master">
            <span class="slider-val">${Math.round(data.master * 100)}%</span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Engine & Drivetrain</span><small>RB26 multi-layer throttle audio</small></div>
          <div class="setting-control slider-control">
            <input type="range" min="0" max="1" step="0.05" value="${data.engine}" data-slider="engine">
            <span class="slider-val">${Math.round(data.engine * 100)}%</span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Atmospheric Wind & Road</span><small>Tyre contact and aero turbulence</small></div>
          <div class="setting-control slider-control">
            <input type="range" min="0" max="1" step="0.05" value="${data.environment}" data-slider="environment">
            <span class="slider-val">${Math.round(data.environment * 100)}%</span>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Road Assist Companion</span><small>Highway telemetry & distance alerts</small></div>
          <div class="setting-control">
            <button class="toggle-pill ${data.assistant ? 'active' : ''}" data-toggle="assistant">${data.assistant ? 'Enabled' : 'Off'}</button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Proximity Sense Glow</span><small>Screen edge hazard illumination</small></div>
          <div class="setting-control">
            <button class="toggle-pill ${data.sense > 0 ? 'active' : ''}" data-toggle="sense">${data.sense > 0 ? 'Active' : 'Off'}</button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Zen Mode HUD Hide</span><small>Automatically hide cluster during Zen drive</small></div>
          <div class="setting-control">
            <button class="toggle-pill ${data.zenHideHud ? 'active' : ''}" data-toggle="zenHideHud">${data.zenHideHud ? 'Enabled' : 'Off'}</button>
          </div>
        </div>
      `;
    }
  }

  bindWorldEvents() {
    const locBtn = document.getElementById('overlay-use-location');
    locBtn?.addEventListener('click', async () => {
      try {
        await this.actions.locate();
        this.toast('Atmosphere synchronized with your location');
      } catch {
        this.toast('Location access unavailable');
      }
    });

    const form = document.getElementById('overlay-city-form') as HTMLFormElement;
    const input = document.getElementById('overlay-city-search') as HTMLInputElement;
    const resEl = document.getElementById('overlay-city-results');

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q || !resEl) return;
      resEl.textContent = 'Searching…';
      try {
        const cities = await this.actions.search(q);
        if (!cities.length) {
          resEl.textContent = 'No locations found.';
          return;
        }
        resEl.innerHTML = cities.map(c => `
          <button class="city-result-chip" data-city="${encodeURIComponent(JSON.stringify(c))}">
            ${c.name}, ${c.country}
          </button>
        `).join('');

        resEl.querySelectorAll('.city-result-chip').forEach(btn => {
          btn.addEventListener('click', async () => {
            const raw = btn.getAttribute('data-city');
            if (raw) {
              const city = JSON.parse(decodeURIComponent(raw));
              await this.actions.city(city);
              this.toast(`Synchronized atmosphere with ${city.name}`);
            }
          });
        });
      } catch {
        resEl.textContent = 'Search failed. Check your network.';
      }
    });
  }

  bindWeatherEvents() {
    const viewport = this.elements['overlay-viewport'];
    if (!viewport) return;

    viewport.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = btn.dataset.weather as WeatherMode;
        this.actions.setting('weather', w);
        viewport.querySelectorAll('[data-weather]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    viewport.querySelectorAll<HTMLButtonElement>('[data-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.time;
        this.actions.setting('timeMode', t);
        viewport.querySelectorAll('[data-time]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
  }

  bindSettingsEvents() {
    const viewport = this.elements['overlay-viewport'];
    if (!viewport) return;

    viewport.querySelectorAll<HTMLButtonElement>('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab) {
          this.settingsTab = tab;
          viewport.querySelectorAll('.subtab-btn').forEach(b => b.classList.toggle('active', b === btn));
          const rowsList = document.getElementById('settings-rows-list');
          if (rowsList) rowsList.innerHTML = this.renderSettingsRows();
          this.bindSettingsEvents();
        }
      });
    });

    viewport.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key as keyof SettingsData;
        const val = btn.dataset.val;
        if (key && val) {
          this.actions.setting(key, val);
          const parent = btn.parentElement;
          parent?.querySelectorAll('[data-key]').forEach(b => b.classList.toggle('active', b === btn));
        }
      });
    });

    viewport.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggle as keyof SettingsData;
        if (key) {
          const current = Boolean(this.settings.data[key]);
          const next = !current;
          this.actions.setting(key, next);
          btn.classList.toggle('active', next);
          btn.textContent = next ? 'Active' : 'Off';
        }
      });
    });

    viewport.querySelectorAll<HTMLInputElement>('[data-slider]').forEach(slider => {
      slider.addEventListener('input', () => {
        const key = slider.dataset.slider as keyof SettingsData;
        const val = parseFloat(slider.value);
        this.actions.setting(key, val);
        const display = slider.nextElementSibling as HTMLElement;
        if (display) display.textContent = key === 'fov' ? `${Math.round(val)}°` : `${Math.round(val * 100)}%`;
      });
    });
  }

  showCameraBadge(name: string) {
    const badge = this.elements['camera-mode-badge'];
    const text = this.elements['camera-mode-text'];
    if (badge && text) {
      text.textContent = name.toUpperCase();
      badge.classList.remove('hidden');
      this.cameraToastTimer = 0.9;
    }
  }

  update(state: HudState, dt = 0.016) {
    this.updateHud(state, dt);
  }

  updateHud(state: HudState, dt: number) {
    const e = this.elements;
    const d = this.settings.data;
    const isMetric = d.units === 'kmh';
    const speedFactor = isMetric ? 3.6 : 2.23694;
    const distFactor = isMetric ? 1000 : 1609.34;
    const unit = isMetric ? 'km' : 'mi';

    // In Cockpit / FPP camera mode (camera index 3), hide external HUD to make the car interior the dashboard!
    const isCockpit = state.camera === 3;
    if (e['hud-driver-zone']) e['hud-driver-zone'].classList.toggle('hidden', isCockpit);
    if (e['hud-cluster-panel']) e['hud-cluster-panel'].classList.toggle('hidden', isCockpit);
    if (e['nav-strip']) e['nav-strip'].classList.toggle('hidden', isCockpit);
    if (e['drive-help']) e['drive-help'].classList.toggle('hidden', isCockpit);
    if (e['assist-card']) e['assist-card'].classList.toggle('hidden', isCockpit);

    // 1. Damped Smooth Tachometer Needle & Sweep Arc
    const targetRpm = Math.max(0, state.rpm);
    this.smoothedRpm += (targetRpm - this.smoothedRpm) * Math.min(1.0, dt * 24);
    const normalizedRpm = Math.max(0, Math.min(1.0, this.smoothedRpm / 8000));

    // Needle Angle: -135deg at 0 RPM to +135deg at 8000 RPM (270deg sweep)
    const needleAngle = -135 + normalizedRpm * 270;
    if (e['tacho-needle-group']) {
      e['tacho-needle-group'].style.transform = `rotate(${needleAngle.toFixed(1)}deg)`;
    }

    // Active RPM Glowing Arc
    if (e['gauge-active-arc']) {
      const offset = (443 - normalizedRpm * 443).toFixed(1);
      e['gauge-active-arc'].setAttribute('stroke-dashoffset', offset);
    }

    // 2. Center Speed Numerals
    const displaySpeed = Math.round(state.speed * speedFactor);
    if (e['speed-kmh-num']) e['speed-kmh-num'].textContent = String(displaySpeed);

    // 3. Gear Indicator with 150ms Shift Animation
    if (e['speed-gear-num']) {
      if (state.gear !== this.lastGear) {
        this.lastGear = state.gear;
        e['speed-gear-num'].textContent = state.gear;
        const gearBlock = e['gauge-gear-block'];
        if (gearBlock) {
          gearBlock.classList.remove('gear-shifting');
          void gearBlock.offsetWidth;
          gearBlock.classList.add('gear-shifting');
        }
      }
    }

    // 4. Cluster Fuel Gauge & Trip
    if (e['cluster-fuel-fill']) {
      e['cluster-fuel-fill'].style.width = `${Math.round(state.fuel)}%`;
      if (state.fuel < 20) e['cluster-fuel-fill'].classList.add('fuel-crit');
      else e['cluster-fuel-fill'].classList.remove('fuel-crit');
    }
    if (e['cluster-fuel-val']) e['cluster-fuel-val'].textContent = `${Math.round(state.fuel)}%`;
    if (e['cluster-trip-val']) e['cluster-trip-val'].textContent = `${(state.distance / distFactor).toFixed(1)} ${unit.toUpperCase()}`;

    // Note: Speedometer & tachometer cluster ALWAYS remains 100% visible (no fading/dimming)

    // 5. Topbar Weather & Atmosphere Header
    if (e['weather-text']) e['weather-text'].textContent = `${weatherNames[state.condition]} · ${Math.round(state.temperature)}°`;
    const hour = Math.floor(state.hour);
    const minutes = Math.floor((state.hour - hour) * 60);
    if (e['weather-time']) e['weather-time'].textContent = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')} · ${state.city || 'SIMULATION'}`;

    // 6. Route Preview Navigation Strip
    if (e['nav-road-path'] && state.navCurve && state.navCurve.length >= 3) {
      const pts = state.navCurve;
      let dStr = `M 100 50`;
      let markerSvg = '';

      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const svgX = Math.max(14, Math.min(186, 100 + pt.x * 2.4));
        const svgY = 50 - (pt.y / 350) * 44;

        if (i === 0) {
          dStr += ` L ${svgX.toFixed(1)} ${svgY.toFixed(1)}`;
        } else {
          const prev = pts[i - 1];
          const prevX = Math.max(14, Math.min(186, 100 + prev.x * 2.4));
          const prevY = 50 - (prev.y / 350) * 44;
          const midX = (prevX + svgX) / 2;
          const midY = (prevY + svgY) / 2;
          dStr += ` Q ${prevX.toFixed(1)} ${prevY.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
        }

        if (pt.marker) {
          markerSvg += `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="3" fill="#dfb271" stroke="#ffffff" stroke-width="1"/>`;
        }
      }

      e['nav-road-path'].setAttribute('d', dStr);
      if (e['nav-road-bg']) e['nav-road-bg'].setAttribute('d', dStr);
      if (e['nav-marker-group']) e['nav-marker-group'].innerHTML = markerSvg;

      if (e['nav-region-name']) e['nav-region-name'].textContent = state.region.toUpperCase();
      if (e['nav-landmark']) {
        e['nav-landmark'].textContent = state.navEvent || 'HIGHWAY AHEAD';
      }
    }

    // 7. Road Assist Alerts
    let message = '';
    let isUrgent = false;

    if (state.danger > 0.25) {
      message = 'PROXIMITY ALERT · VEHICLE NEARBY';
      isUrgent = true;
    } else if (state.refueling) {
      message = state.fuel >= 99 ? 'TANKS FULL · READY TO ROLL' : 'REFUELING IN PROGRESS...';
      isUrgent = true;
    } else if (state.fuel < 20 && !state.zen && d.fuel) {
      message = `LOW FUEL · HORIZON STATION ${Math.max(0, state.nextStation / distFactor).toFixed(1)} ${unit}`;
      isUrgent = true;
    } else if (state.condition === 'storm' || state.condition === 'heavy') {
      message = 'SLIPPERY ROAD · EXTEND BRAKING DISTANCE';
      isUrgent = true;
    } else if (state.condition === 'snow') {
      message = 'ICY SURFACE · EASY ON STEERING INPUTS';
      isUrgent = true;
    } else if (state.nextStation < 280 && state.nextStation > 40) {
      message = 'HORIZON FUEL & REST · APPROACHING ON RIGHT';
      isUrgent = true;
    }

    const assistCard = e['assist-card'];
    if (assistCard) {
      assistCard.classList.toggle('quiet', !d.assistant);
      if (message) {
        if (message !== this.lastAssistMessage) {
          this.lastAssistMessage = message;
          this.assistMessageTimer = isUrgent ? 8.0 : 4.5;
        }
        if (e['suit-message']) e['suit-message'].textContent = message;
        assistCard.classList.remove('faded');
      } else {
        this.assistMessageTimer -= dt;
        if (this.assistMessageTimer <= 0) {
          assistCard.classList.add('faded');
        }
      }
    }

    if (e['camera-name']) e['camera-name'].textContent = cameraNames[state.camera];

    this.cameraToastTimer -= dt;
    if (this.cameraToastTimer <= 0 && e['camera-mode-badge']) {
      e['camera-mode-badge'].classList.add('hidden');
    }

    if (e.fps) {
      e.fps.classList.toggle('hidden', !d.fps);
      e.fps.textContent = `${Math.round(state.fps)} FPS`;
    }
    if (e.sense) e.sense.style.opacity = String(state.danger * d.sense * 0.75);

    this.toastTimer -= dt;
    if (this.toastTimer <= 0 && e.toast) e.toast.classList.add('hidden');
    const pauseTrip = document.getElementById('pause-trip');
    if (pauseTrip) pauseTrip.textContent = `${(state.distance / distFactor).toFixed(1)} ${unit} through ${state.region}.`;
  }

  toast(message: string) {
    if (this.elements.toast) {
      this.elements.toast.textContent = message;
      this.elements.toast.classList.remove('hidden');
      this.toastTimer = 3.5;
    }
  }
}
