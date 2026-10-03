import type { Settings, SettingsData } from '../systems/Settings.ts';
import type { City, WeatherMode } from '../weather/Weather.ts';
import { weatherNames, moonLabel, lunarPhase } from '../weather/Weather.ts';
import { cameraNames } from '../vehicle/CameraController.ts';
import { getAllVehicles, getVehicleConfig } from '../vehicle/VehicleRegistry.ts';
import type { VehicleConfig } from '../vehicle/VehicleConfig.ts';


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

export function getNavSvg(iconName: string): string {
  switch (iconName) {
    case 'turn_right':
    case 'right':
    case '↱':
      return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 26V15a5 5 0 0 1 5-5h10"/>
        <polyline points="18 4 25 10 18 16"/>
      </svg>`;
    case 'turn_left':
    case 'left':
    case '↰':
      return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 26V15a5 5 0 0 0-5-5H7"/>
        <polyline points="14 4 7 10 14 16"/>
      </svg>`;
    case 'keep_right':
    case 'fork_right':
    case '↗':
      return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="26" x2="22" y2="8"/>
        <polyline points="13 7 23 7 22 17"/>
      </svg>`;
    case 'keep_left':
    case 'fork_left':
    case '↖':
      return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="20" y1="26" x2="10" y2="8"/>
        <polyline points="19 7 9 7 10 17"/>
      </svg>`;
    case 'bridge':
    case '▰':
      return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 21h24M6 21V14a10 10 0 0 1 20 0v7M11 21v-5M21 21v-5"/>
        <line x1="16" y1="26" x2="16" y2="9"/>
        <polyline points="12 13 16 9 20 13"/>
      </svg>`;
    case 'tunnel':
    case '▱':
      return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 25V14a10 10 0 0 1 20 0v11"/>
        <line x1="16" y1="26" x2="16" y2="10"/>
        <polyline points="12 14 16 10 20 14"/>
      </svg>`;
    case 'straight':
    case 'continue':
    case '↑':
    default:
      return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="16" y1="26" x2="16" y2="7"/>
        <polyline points="9 14 16 6 23 14"/>
      </svg>`;
  }
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
  getVoices?: () => { id: string; name: string; lang: string; isFemale: boolean }[];
  selectVehicle?: (id: string) => Promise<void>;
  getAvailableVehicles?: () => VehicleConfig[];
  onOverlayChanged?: (overlay: string | null) => void;
}


export interface NavigationManeuver {
  icon: string;
  action: string;
  distance: number;
  location: string;
  isFar?: boolean;
}

export interface MinimapSecondaryRoad {
  points: { x: number; y: number }[];
}

export interface MinimapRoadLabel {
  text: string;
  x: number;
  y: number;
  angle?: number;
}

export interface NearbyPoi {
  x: number;
  y: number;
  type: string;
  label: string;
}

export interface HudState {
  speed: number;
  gear: string;
  rpm: number;
  fuel: number;
  distance: number;
  region: string;
  roadName?: string;
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
  secondaryRoads?: MinimapSecondaryRoad[];
  roadLabels?: MinimapRoadLabel[];
  navEvent?: string;
  activeManeuver?: NavigationManeuver;
  nearbyPois?: NearbyPoi[];
}

export class UI {
  root: HTMLElement;
  screen = 'menu';
  activeOverlay: string | null = null;
  previousOverlay: string | null = null;
  settingsTab = 'driving';
  companionCanvas: HTMLCanvasElement | null = null;
  lastToast = '';
  toastTimer = 0;
  cameraToastTimer = 0;
  assistMessageTimer = 0;
  lastAssistMessage = '';
  lastGear = 'N';
  steadyDriveTimer = 0;
  smoothedRpm = 850;
  private lastManeuverKey = '';
  private maneuverSwapTimeout = 0;
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
        <!-- TOP-LEFT INTEGRATED MINI ROUTE / MINIMAP -->
        <div class="hud-minimap-container" id="hud-minimap" aria-label="Navigation Mini Route">
          <div class="minimap-location-tag" id="minimap-region-name">CRESCENT BAY</div>
          <svg class="minimap-field-svg" id="minimap-svg" viewBox="0 0 180 180" preserveAspectRatio="xMidYMid meet">
            <defs>
              <!-- Sleek Radar Dial Background Gradient -->
              <radialGradient id="radarGlassGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#081420" stop-opacity="0.9"/>
                <stop offset="65%" stop-color="#040a12" stop-opacity="0.95"/>
                <stop offset="100%" stop-color="#02060b" stop-opacity="0.98"/>
              </radialGradient>
              <!-- Radar Sweep / Range Glow -->
              <radialGradient id="radarScanCone" cx="90" cy="135" r="95" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.22"/>
                <stop offset="45%" stop-color="#00f0ff" stop-opacity="0.08"/>
                <stop offset="100%" stop-color="#00f0ff" stop-opacity="0"/>
              </radialGradient>
              <!-- Route Gradient -->
              <linearGradient id="miniRoadGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
                <stop offset="30%" stop-color="#00f0ff" stop-opacity="0.95"/>
                <stop offset="75%" stop-color="#00b4d8" stop-opacity="0.8"/>
                <stop offset="100%" stop-color="#0077b6" stop-opacity="0.35"/>
              </linearGradient>
              <filter id="miniGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.4" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <!-- Clip path for circular radar disc -->
              <clipPath id="radarDiscClip">
                <circle cx="90" cy="90" r="76"/>
              </clipPath>
            </defs>

            <!-- Outer Radar Bezel / Compass Ring -->
            <circle cx="90" cy="90" r="82" fill="none" stroke="rgba(136, 190, 196, 0.18)" stroke-width="1.5"/>
            <circle cx="90" cy="90" r="77" fill="none" stroke="rgba(0, 240, 255, 0.35)" stroke-width="1"/>

            <!-- Radar Disc Content Clustered inside Clip -->
            <g clip-path="url(#radarDiscClip)">
              <!-- Disc Background -->
              <circle cx="90" cy="90" r="76" fill="url(#radarGlassGrad)"/>

              <!-- Ambient Geography / Coastal Demarcation underlay -->
              <path d="M 14 90 Q 50 60 90 85 T 166 80 L 166 166 L 14 166 Z" fill="rgba(8, 26, 42, 0.35)"/>

              <!-- Subtle Crosshair & Grid Ticks -->
              <line x1="90" y1="14" x2="90" y2="166" stroke="rgba(136, 190, 196, 0.08)" stroke-width="1" stroke-dasharray="3 4"/>
              <line x1="14" y1="90" x2="166" y2="90" stroke="rgba(136, 190, 196, 0.08)" stroke-width="1" stroke-dasharray="3 4"/>

              <!-- Range Distance Rings (50m, 120m, 200m) -->
              <circle cx="90" cy="135" r="38" fill="none" stroke="rgba(0, 240, 255, 0.12)" stroke-width="1" stroke-dasharray="2 3"/>
              <circle cx="90" cy="135" r="72" fill="none" stroke="rgba(0, 240, 255, 0.08)" stroke-width="1" stroke-dasharray="2 4"/>
              <circle cx="90" cy="135" r="105" fill="none" stroke="rgba(0, 240, 255, 0.05)" stroke-width="1" stroke-dasharray="2 5"/>

              <!-- Forward Radar View Cone -->
              <polygon points="90,135 45,30 135,30" fill="url(#radarScanCone)"/>

              <!-- Dynamic Rotated Road Spline Trajectory (Heading-Up) -->
              <g id="minimap-road-group">
                <!-- Secondary connected / branching roads -->
                <g id="minimap-secondary-roads"></g>
                <!-- Road corridor underlay -->
                <path id="minimap-road-bg" d="M 90 135 L 90 20" stroke="rgba(0, 240, 255, 0.15)" stroke-width="9" stroke-linecap="round" fill="none"/>
                <!-- Active primary route line -->
                <path id="minimap-road-path" d="M 90 135 L 90 20" stroke="url(#miniRoadGrad)" stroke-width="3.2" stroke-linecap="round" fill="none" filter="url(#miniGlow)"/>
                <!-- Road Names / Street Labels -->
                <g id="minimap-road-labels"></g>
                <!-- Real World POIs -->
                <g id="minimap-poi-group"></g>
              </g>

              <!-- Player Directional Chevron (Positioned at lower-center 90, 135) -->
              <g id="minimap-player-marker" transform="translate(90, 135)">
                <!-- Subtle pulse halo -->
                <circle cx="0" cy="0" r="8.5" fill="rgba(0, 240, 255, 0.18)"/>
                <!-- Player Delta Arrow -->
                <polygon points="0,-8.5 -5,4.5 0,1.8 5,4.5" fill="#ffffff" stroke="#040a12" stroke-width="1.4"/>
                <circle cx="0" cy="0" r="1.6" fill="#00f0ff"/>
              </g>
            </g>

            <!-- Outer Compass Cardinal Markers -->
            <text x="90" y="11" font-size="7.5" font-weight="800" fill="rgba(0, 240, 255, 0.85)" text-anchor="middle" font-family="'Avenir Next', sans-serif">N</text>
            <text x="169" y="92.5" font-size="6.5" font-weight="700" fill="rgba(136, 190, 196, 0.55)" text-anchor="middle" font-family="'Avenir Next', sans-serif">E</text>
            <text x="90" y="174" font-size="6.5" font-weight="700" fill="rgba(136, 190, 196, 0.55)" text-anchor="middle" font-family="'Avenir Next', sans-serif">S</text>
            <text x="11" y="92.5" font-size="6.5" font-weight="700" fill="rgba(136, 190, 196, 0.55)" text-anchor="middle" font-family="'Avenir Next', sans-serif">W</text>
          </svg>
        </div>

        <!-- TOP-CENTER VERTICAL NEXT MANEUVER GUIDANCE -->
        <div class="hud-maneuver-hud" id="hud-maneuver-badge" aria-label="Next Navigation Maneuver">
          <div class="maneuver-hud-content" id="maneuver-hud-content">
            <div class="maneuver-arrow-hero" id="maneuver-icon">${getNavSvg('straight')}</div>
            <div class="maneuver-action-text" id="maneuver-action">CONTINUE</div>
            <div class="maneuver-distance-text" id="maneuver-dist">1.2 km</div>
            <div class="maneuver-destination-text" id="maneuver-location">COASTAL HIGHWAY</div>
          </div>
        </div>

        <!-- Bottom-Left Driver HUD Zone (Tachometer & Secondary Telemetry Cluster) -->
        <div class="hud-driver-zone" id="hud-driver-zone">
          <div class="driver-instruments-row">
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

        <!-- Camera Mode Badge (Bottom Center) -->
        <div class="camera-mode-badge hidden" id="camera-mode-badge">
          <span class="camera-mode-text" id="camera-mode-text">CAMERA · CHASE</span>
        </div>

        <!-- Region Entry Notification (Cinematic Upper Left) -->
        <div class="region-entry-banner hidden" id="region-entry-banner">
          <span class="region-entry-sub">ENTERING DISTRICT</span>
          <h2 class="region-entry-title" id="region-entry-title">CRESCENT BAY</h2>
        </div>

        <!-- Road Assist Notification (Originating from Right Edge of Viewport) -->
        <div class="hud-road-assist hidden" id="assist-card" aria-label="Road Assist warning">
          <div class="assist-accent-bar"></div>
          <div class="assist-body">
            <div class="assist-eyebrow">
              <svg class="assist-glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2.2l5.8 10.3H2.2L8 2.2zM8 5.8v3.2M8 11.2v.3"/>
              </svg>
              <span>ROAD ASSIST</span>
            </div>
            <p class="assist-msg" id="suit-message">SLIPPERY ROAD · BRAKE EARLY</p>
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
              <button class="pause-link pause-link-primary" id="pause-resume-btn">${icon('play')} Resume Drive</button>
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

    const ids = [
      'weather-text', 'weather-time', 'speed-kmh-num', 'speed-gear-num', 'gauge-gear-block',
      'tacho-needle-group', 'gauge-active-arc', 'cluster-fuel-fill', 'cluster-fuel-val', 'cluster-trip-val',
      'hud-cluster-panel', 'hud-driver-zone', 'hud-minimap', 'minimap-region-name', 'minimap-road-path', 'minimap-road-bg',
      'minimap-secondary-roads', 'minimap-road-labels', 'minimap-poi-group', 'minimap-player-marker',
      'hud-maneuver-badge', 'maneuver-hud-content', 'maneuver-icon', 'maneuver-action', 'maneuver-dist', 'maneuver-location',
      'camera-name', 'camera-mode-badge', 'camera-mode-text', 'region-entry-banner', 'region-entry-title',
      'suit-message', 'assist-card', 'refuel-prompt', 'refuel-text', 'fuel-warning', 'fps', 'sense',
      'toast', 'drive-help', 'overlay-layer', 'overlay-viewport', 'nav-active-bar', 'top-nav', 'pause-screen', 'pause-trip', 'pause-resume-btn'
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

    click('pause-resume-btn', (e) => { e.stopPropagation(); actions.resume(); });
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
    if (this.screen === 'paused' || this.screen === 'playing') {
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
    if (layer) {
      layer.classList.remove('hidden');
      if (type === 'garage') {
        layer.classList.add('garage-overlay-layer');
      } else {
        layer.classList.remove('garage-overlay-layer');
      }
    }

    // Make top nav visible so user can navigate between tabs
    document.getElementById('top-nav')?.classList.remove('hidden');

    // Hide pause screen underneath overlay to prevent z-index/click capture conflict
    if (this.screen === 'paused') {
      document.getElementById('pause-screen')?.classList.add('hidden');
    }

    this.updateActiveNavIndicator(type);
    this.actions.modal(true);
    this.actions.onOverlayChanged?.(type);
    this.renderActiveOverlay();
  }

  closeOverlay() {
    this.activeOverlay = null;
    this.previousOverlay = null;
    const layer = this.elements['overlay-layer'];
    if (layer) {
      layer.classList.add('hidden');
      layer.classList.remove('garage-overlay-layer');
    }
    this.updateActiveNavIndicator(null);
    this.actions.modal(false);
    this.actions.onOverlayChanged?.(null);

    if (this.screen === 'paused') {
      document.getElementById('pause-screen')?.classList.remove('hidden');
    } else if (this.screen === 'playing') {
      document.getElementById('top-nav')?.classList.add('hidden');
      (document.activeElement as HTMLElement)?.blur();
    }
  }


  public isGarageTransitioning = false;

  renderGarageView(): string {
    const vehicles = this.actions.getAvailableVehicles ? this.actions.getAvailableVehicles() : getAllVehicles();
    const currentId = this.settings.data.selectedVehicle || 'r34';
    const activeCar = vehicles.find(v => v.id === currentId) || vehicles[0];
    const specs = activeCar.displaySpecs;

    const currentIndex = vehicles.findIndex(v => v.id === currentId);
    const prevVehicle = vehicles[(currentIndex - 1 + vehicles.length) % vehicles.length];
    const nextVehicle = vehicles[(currentIndex + 1) % vehicles.length];
    const disabledAttr = this.isGarageTransitioning ? 'disabled' : '';

    return `
      <div class="showcase-view ${this.isGarageTransitioning ? 'is-transitioning' : ''}">
        <!-- TOP-LEFT: Direct Automotive Typography Over Scene -->
        <div class="showcase-header">
          <div class="showcase-brand">AFTERMILE</div>
          <h1 class="showcase-title">${activeCar.name}</h1>
          <div class="showcase-category">${specs.category}</div>
          <div class="showcase-specs-line">
            <span>${specs.power.toUpperCase()}</span>
            <span class="showcase-bullet">•</span>
            <span>${specs.drivetrain.toUpperCase()}</span>
            <span class="showcase-bullet">•</span>
            <span>${specs.transmission.toUpperCase()}</span>
          </div>
        </div>

        <!-- BOTTOM CONTROLS: Minimal Typography Selector & Drive Action -->
        <div class="showcase-footer">
          <div class="showcase-selector-bar">
            <button class="showcase-arrow" id="garage-prev-btn" ${disabledAttr} title="Previous: ${prevVehicle.name}">
              &lsaquo;
            </button>
            <div class="showcase-tabs">
              ${vehicles.map(v => `
                <button class="showcase-tab ${v.id === currentId ? 'active' : ''}" data-car-id="${v.id}" ${disabledAttr}>
                  ${v.name}
                </button>
              `).join('')}
            </div>
            <button class="showcase-arrow" id="garage-next-btn" ${disabledAttr} title="Next: ${nextVehicle.name}">
              &rsaquo;
            </button>
          </div>

          <div class="showcase-actions">
            <button class="showcase-drive-link" id="garage-drive-btn" ${disabledAttr}>
              SELECT &amp; DRIVE &rarr;
            </button>
          </div>
        </div>
      </div>
    `;
  }

  bindGarageEvents() {
    const vehicles = this.actions.getAvailableVehicles ? this.actions.getAvailableVehicles() : getAllVehicles();
    const currentId = this.settings.data.selectedVehicle || 'r34';
    const currentIndex = vehicles.findIndex(v => v.id === currentId);

    // Car selector text buttons
    document.querySelectorAll('.showcase-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (this.isGarageTransitioning) return;
        const carId = (btn as HTMLElement).dataset.carId;
        if (carId && carId !== currentId) {
          if (this.actions.selectVehicle) {
            await this.actions.selectVehicle(carId);
          }
        }
      });
    });

    // Prev / Next arrows
    document.getElementById('garage-prev-btn')?.addEventListener('click', async () => {
      if (this.isGarageTransitioning) return;
      const prevId = vehicles[(currentIndex - 1 + vehicles.length) % vehicles.length].id;
      if (this.actions.selectVehicle) {
        await this.actions.selectVehicle(prevId);
      }
    });

    document.getElementById('garage-next-btn')?.addEventListener('click', async () => {
      if (this.isGarageTransitioning) return;
      const nextId = vehicles[(currentIndex + 1) % vehicles.length].id;
      if (this.actions.selectVehicle) {
        await this.actions.selectVehicle(nextId);
      }
    });

    // Drive button
    document.getElementById('garage-drive-btn')?.addEventListener('click', () => {
      if (this.isGarageTransitioning) return;
      this.closeOverlay();
      this.actions.start(false);
    });
  }

  updateGarageView() {
    if (this.activeOverlay === 'garage') {
      this.renderActiveOverlay();
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
      viewport.innerHTML = this.renderGarageView();
      this.bindGarageEvents();
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
      const voices = this.actions.getVoices ? this.actions.getVoices() : [];
      const voiceOptions = voices.map(v => `
        <option value="${v.id}" ${data.navVoiceId === v.id ? 'selected' : ''}>
          ${v.name} (${v.lang})${v.isFemale ? ' · Female' : ''}
        </option>
      `).join('');

      return `
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Master Volume</span><small>Overall audio level</small></div>
          <div class="setting-control slider-control">
            <input type="range" min="0" max="1" step="0.05" value="${data.master}" data-slider="master">
            <span class="slider-val">${Math.round(data.master * 100)}%</span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Navigation Voice</span><small>Spoken turn & landmark directions (Web Speech API)</small></div>
          <div class="setting-control">
            <button class="toggle-pill ${data.navVoice ? 'active' : ''}" data-toggle="navVoice">${data.navVoice ? 'Active' : 'Muted'}</button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Navigation Voice Volume</span><small>Speech guidance loudness</small></div>
          <div class="setting-control slider-control">
            <input type="range" min="0" max="1" step="0.05" value="${data.navVoiceVolume}" data-slider="navVoiceVolume">
            <span class="slider-val">${Math.round(data.navVoiceVolume * 100)}%</span>
          </div>
        </div>
        ${voices.length > 0 ? `
        <div class="setting-row">
          <div class="setting-meta"><span class="setting-name">Voice Profile</span><small>System & browser English speech profile</small></div>
          <div class="setting-control">
            <select class="setting-select" data-select="navVoiceId">
              <option value="" ${data.navVoiceId === '' ? 'selected' : ''}>Default (Auto Natural Female)</option>
              ${voiceOptions}
            </select>
          </div>
        </div>
        ` : ''}
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
          btn.textContent = next ? 'Active' : (key === 'navVoice' ? 'Muted' : 'Off');
        }
      });
    });

    viewport.querySelectorAll<HTMLSelectElement>('[data-select]').forEach(select => {
      select.addEventListener('change', () => {
        const key = select.dataset.select as keyof SettingsData;
        if (key) {
          this.actions.setting(key, select.value);
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

  private regionBannerTimer = 0;

  showCameraBadge(name: string) {
    const badge = this.elements['camera-mode-badge'];
    const text = this.elements['camera-mode-text'];
    if (badge && text) {
      text.textContent = `CAMERA · ${name.toUpperCase()}`;
      badge.classList.remove('hidden');
      this.cameraToastTimer = 0.9;
    }
  }

  showRegionBanner(regionName: string, subName = 'PACIFIC COAST EXPRESSWAY') {
    const banner = this.elements['region-entry-banner'];
    const title = this.elements['region-entry-title'];
    if (banner && title) {
      title.textContent = regionName.toUpperCase();
      const sub = banner.querySelector('.region-entry-sub');
      if (sub) sub.textContent = subName.toUpperCase();
      banner.classList.remove('hidden');
      this.regionBannerTimer = 3.5;
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
    if (e['hud-minimap']) e['hud-minimap'].classList.toggle('hidden', isCockpit);
    if (e['hud-driver-zone']) e['hud-driver-zone'].classList.toggle('hidden', isCockpit);
    if (e['hud-cluster-panel']) e['hud-cluster-panel'].classList.toggle('hidden', isCockpit);
    if (e['drive-help']) e['drive-help'].classList.toggle('hidden', isCockpit);
    if (e['assist-card']) e['assist-card'].classList.toggle('hidden', isCockpit);

    // Top-Center Maneuver HUD (Dedicated exclusively to navigation)
    const maneuverBadge = e['hud-maneuver-badge'];
    const maneuverContent = e['maneuver-hud-content'];
    if (maneuverBadge) {
      if (state.activeManeuver) {
        maneuverBadge.classList.remove('hidden');
        maneuverBadge.classList.toggle('restrained', Boolean(state.activeManeuver.isFar));

        const targetIcon = state.activeManeuver.icon || 'straight';
        const targetAction = state.activeManeuver.action || 'CONTINUE';
        const targetLocation = (state.activeManeuver.location || state.roadName || state.region).toUpperCase();
        const newManeuverKey = `${targetIcon}_${targetAction}_${targetLocation}`;

        if (newManeuverKey !== this.lastManeuverKey && maneuverContent) {
          this.lastManeuverKey = newManeuverKey;
          maneuverContent.classList.add('maneuver-transition-out');
          maneuverContent.classList.remove('maneuver-transition-in');
          if (this.maneuverSwapTimeout) clearTimeout(this.maneuverSwapTimeout);
          this.maneuverSwapTimeout = window.setTimeout(() => {
            if (e['maneuver-icon']) e['maneuver-icon'].innerHTML = getNavSvg(targetIcon);
            if (e['maneuver-action']) e['maneuver-action'].textContent = targetAction;
            if (e['maneuver-location']) e['maneuver-location'].textContent = targetLocation;
            maneuverContent.classList.remove('maneuver-transition-out');
            maneuverContent.classList.add('maneuver-transition-in');
          }, 120);
        } else if (!maneuverContent?.classList.contains('maneuver-transition-out')) {
          if (e['maneuver-icon'] && !e['maneuver-icon'].innerHTML) e['maneuver-icon'].innerHTML = getNavSvg(targetIcon);
          if (e['maneuver-action']) e['maneuver-action'].textContent = targetAction;
          if (e['maneuver-location']) e['maneuver-location'].textContent = targetLocation;
        }

        if (e['maneuver-dist']) {
          const distM = state.activeManeuver.distance;
          const distFormatted = distM >= 1000 ? `${(distM / 1000).toFixed(1)} ${unit}` : `${Math.round(distM)} m`;
          e['maneuver-dist'].textContent = distFormatted;
        }
      } else {
        maneuverBadge.classList.add('hidden');
      }
    }

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

    // 5. Topbar Weather & Atmosphere Header
    if (e['weather-text']) e['weather-text'].textContent = `${weatherNames[state.condition]} · ${Math.round(state.temperature)}°`;
    const hour = Math.floor(state.hour);
    const minutes = Math.floor((state.hour - hour) * 60);
    if (e['weather-time']) e['weather-time'].textContent = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')} · ${state.city || 'SIMULATION'}`;

    // 6. Top-Left Integrated Mini Route / Minimap Rendering
    if (e['minimap-road-path'] && state.navCurve && state.navCurve.length >= 3) {
      const pts = state.navCurve;
      // Heading-up transformation with player chevron at lower-center (90, 135)
      // Range: 350m ahead mapped to 115px (scale approx 0.33), lateral scaled by 1.8
      let dStr = `M 90 135`;
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const svgX = Math.max(12, Math.min(168, 90 + pt.x * 1.8));
        const svgY = 135 - (pt.y / 350) * 115;

        if (i === 0) {
          dStr += ` L ${svgX.toFixed(1)} ${svgY.toFixed(1)}`;
        } else {
          const prev = pts[i - 1];
          const prevX = Math.max(12, Math.min(168, 90 + prev.x * 1.8));
          const prevY = 135 - (prev.y / 350) * 115;
          const midX = (prevX + svgX) / 2;
          const midY = (prevY + svgY) / 2;
          dStr += ` Q ${prevX.toFixed(1)} ${prevY.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
        }
      }

      e['minimap-road-path'].setAttribute('d', dStr);
      if (e['minimap-road-bg']) e['minimap-road-bg'].setAttribute('d', dStr);
      if (e['minimap-region-name']) e['minimap-region-name'].textContent = (state.roadName || state.region).toUpperCase();

      // Render Secondary Connected / Branching Roads
      if (e['minimap-secondary-roads']) {
        let secMarkup = '';
        if (state.secondaryRoads && state.secondaryRoads.length > 0) {
          for (const sec of state.secondaryRoads) {
            if (sec.points.length >= 2) {
              let dSec = '';
              for (let j = 0; j < sec.points.length; j++) {
                const sx = Math.max(10, Math.min(170, 90 + sec.points[j].x * 1.8));
                const sy = 135 - (sec.points[j].y / 350) * 115;
                if (j === 0) dSec += `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
                else dSec += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
              }
              secMarkup += `<path d="${dSec}" stroke="rgba(145, 195, 215, 0.28)" stroke-width="1.8" stroke-linecap="round" fill="none"/>`;
            }
          }
        }
        e['minimap-secondary-roads'].innerHTML = secMarkup;
      }

      // Render Road Names & Street Labels on Minimap
      if (e['minimap-road-labels']) {
        let lblMarkup = '';
        if (state.roadLabels && state.roadLabels.length > 0) {
          for (const lbl of state.roadLabels) {
            const lx = Math.max(20, Math.min(160, 90 + lbl.x * 1.8));
            const ly = 135 - (lbl.y / 350) * 115;
            if (ly > 25 && ly < 155) {
              const rot = lbl.angle ? `transform="rotate(${lbl.angle.toFixed(0)}, ${lx.toFixed(1)}, ${ly.toFixed(1)})"` : '';
              lblMarkup += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="6.8" font-weight="700" letter-spacing="0.14em" fill="rgba(215, 238, 248, 0.65)" text-anchor="middle" font-family="'Avenir Next', sans-serif" ${rot}>${lbl.text}</text>`;
            }
          }
        }
        e['minimap-road-labels'].innerHTML = lblMarkup;
      }

      // Real World POI Icons on Minimap (Original Vector Glyphs, NO EMOJI)
      if (e['minimap-poi-group']) {
        let poiMarkup = '';
        if (state.nearbyPois && state.nearbyPois.length > 0) {
          for (const poi of state.nearbyPois) {
            const px = Math.max(16, Math.min(164, 90 + poi.x * 1.8));
            const py = 135 - (poi.y / 350) * 115;
            if (py > 15 && py < 165) {
              if (poi.type === 'fuel') {
                poiMarkup += `
                  <g transform="translate(${px.toFixed(1)}, ${py.toFixed(1)})">
                    <circle cx="0" cy="0" r="6" fill="rgba(4, 9, 16, 0.85)" stroke="#00f0ff" stroke-width="0.9" stroke-opacity="0.75"/>
                    <path d="M-2 -3h3a1 1 0 0 1 1 1v5h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zm0 2h3m1 1h1v2" fill="none" stroke="#e0f8ff" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </g>
                `;
              }
            }
          }
        }
        e['minimap-poi-group'].innerHTML = poiMarkup;
      }
    }

    // 7. Road Assist Alerts (Originates from Right Viewport Edge)
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
      message = 'SLIPPERY ROAD · BRAKE EARLY';
      isUrgent = true;
    } else if (state.condition === 'snow') {
      message = 'ICY SURFACE · EASY ON STEERING';
      isUrgent = true;
    } else if (state.nextStation < 280 && state.nextStation > 40) {
      message = 'HORIZON FUEL & REST · APPROACHING ON RIGHT';
      isUrgent = false;
    }

    const assistCard = e['assist-card'];
    if (assistCard) {
      if (d.assistant && message) {
        if (message !== this.lastAssistMessage) {
          this.lastAssistMessage = message;
          this.assistMessageTimer = isUrgent ? 7.0 : 4.5;
        }
        if (e['suit-message']) e['suit-message'].textContent = message;
        assistCard.classList.remove('hidden');
        assistCard.classList.remove('faded');
      } else {
        this.assistMessageTimer -= dt;
        if (this.assistMessageTimer <= 0) {
          assistCard.classList.add('faded');
          assistCard.classList.add('hidden');
        }
      }
    }

    if (e['camera-name']) e['camera-name'].textContent = cameraNames[state.camera];

    this.cameraToastTimer -= dt;
    if (this.cameraToastTimer <= 0 && e['camera-mode-badge']) {
      e['camera-mode-badge'].classList.add('hidden');
    }

    this.regionBannerTimer -= dt;
    if (this.regionBannerTimer <= 0 && e['region-entry-banner']) {
      e['region-entry-banner'].classList.add('hidden');
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
