import type { VehicleAudioProfile } from '../vehicle/VehicleConfig.ts';

export interface WheelAudioTelemetry {
  slipVelocity: number;
  slipAngle: number;
  slipRatio: number;
  normalLoad: number;
  surfaceType: string;
}

export interface VehicleAudioState {
  /** Signed metres/second; RPM and load come from the vehicle drivetrain. */
  speed: number;
  rpm: number;
  load: number;
  brake: number;
  slip: number;
  refueling: boolean;
  throttle?: number;
  gear?: number;
  shiftTimer?: number;
  isReversing?: boolean;
  cameraMode?: number;
  wheels?: WheelAudioTelemetry[];
}

export interface AudioDebugLayerState {
  name: string;
  gain: number;
  frequency?: number;
  pitch?: number;
  muted: boolean;
  solo: boolean;
}

export const finiteClamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
const smooth = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));

/** Reusable control frame. No arrays/closures are created in update(). */
export class VehicleAudioControls {
  readonly weights: Float64Array;
  readonly pitches: Float64Array;
  readonly anchors: number[];
  readonly minPitch: number;
  readonly maxPitch: number;

  rpm: number;
  load = 0;
  throttle = 0;
  boost = 0;
  blowOff = 0;
  shiftTimer = 0;
  shiftCut = 1;
  shiftBang = 0;
  overrun = 0;

  engineGain = 0;
  engineCutoff = 5500;
  turboWhineGain = 0;
  turboFrequency = 2200;
  blowOffGain = 0;
  gearWhineGain = 0;
  gearWhineFrequency = 800;

  roadGain = 0;
  windGain = 0;
  skidGain = 0;
  tireScrubGain = 0;
  roadCutoff = 1800;
  windCutoff = 900;
  skidFrequency = 1600;

  // Multi-surface per-wheel gains
  surfaceAsphaltGain = 0;
  surfaceWetGain = 0;
  surfaceGravelGain = 0;
  surfaceDirtGain = 0;
  surfaceGrassGain = 0;
  surfaceSnowGain = 0;

  // Cockpit & Camera transfer functions
  cockpitFilterCutoff = 6000;
  cabinResonanceGain = 0;
  cameraMode = 0;

  // Layer Solo & Mute Debug Masks (dev instrumentation)
  mutedLayers = new Set<string>();
  soloLayers = new Set<string>();

  private prevThrottle = 0;
  private prevBoost = 0;
  private prevGear = 1;

  constructor(public profile: VehicleAudioProfile, private idleRpm: number, private redlineRpm: number) {
    this.anchors = profile.bands.map(b => b.rpm);
    this.weights = new Float64Array(this.anchors.length * 2);
    this.pitches = new Float64Array(this.anchors.length);
    this.minPitch = finiteClamp(profile.minPitch, 0.75, 1);
    this.maxPitch = finiteClamp(profile.maxPitch, 1, 1.45);
    this.rpm = idleRpm;
  }

  isLayerActive(name: string): boolean {
    if (this.mutedLayers.has(name)) return false;
    if (this.soloLayers.size > 0 && !this.soloLayers.has(name)) return false;
    return true;
  }

  update(state: VehicleAudioState, volume: number, environment: number, dt: number) {
    dt = finiteClamp(dt, 0, 0.1);
    const speed = finiteClamp(Math.abs(state.speed), 0, 100);
    const rpm = finiteClamp(state.rpm, this.idleRpm, this.redlineRpm);
    const currentGear = Math.round(finiteClamp(state.gear ?? 1, -1, 7));
    const isCockpit = state.cameraMode === 3;
    this.cameraMode = state.cameraMode ?? 0;

    // 1. Smooth RPM and Load with responsive tracking
    this.rpm = smooth(this.rpm, rpm, finiteClamp(this.profile.rpmResponse, 1, 40), dt);
    const targetLoad = state.refueling ? 0 : finiteClamp(state.load, 0, 1);
    this.load = smooth(this.load, targetLoad, finiteClamp(this.profile.loadResponse, 1, 30), dt);

    const targetThrottle = state.refueling ? 0 : finiteClamp(state.throttle ?? state.load, 0, 1);
    this.throttle = smooth(this.throttle, targetThrottle, 22, dt);

    // 2. Shift Transient & Torque Cut Management
    const shiftTime = finiteClamp(state.shiftTimer ?? 0, 0, 1);
    const isShifting = shiftTime > 0.01 || (currentGear !== this.prevGear && currentGear > 0 && this.prevGear > 0);
    const isBmw = this.profile.vehicleType === 'bmw_m4_gt3';

    if (isShifting) {
      this.shiftTimer = Math.max(this.shiftTimer, isBmw ? 0.09 : 0.14);
      if (this.prevGear !== currentGear && isBmw && this.profile.exhaust?.shiftPop) {
        this.shiftBang = 1.0;
      }
    }
    this.prevGear = currentGear;

    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      const cutDepth = isBmw ? 0.15 : 0.55;
      this.shiftCut = smooth(this.shiftCut, cutDepth, 45, dt);
    } else {
      this.shiftCut = smooth(this.shiftCut, 1.0, isBmw ? 35 : 18, dt);
    }
    this.shiftBang = Math.max(0, this.shiftBang - dt * (isBmw ? 12 : 8));

    // 3. Overrun Burble (Off-throttle high-RPM exhaust acoustics)
    if (this.profile.exhaust?.overrunBurble && this.rpm > 3400 && this.throttle < 0.12 && !state.refueling) {
      const overrunIntensity = Math.min(1, (this.rpm - 3400) / 2800) * (1 - this.throttle / 0.12);
      this.overrun = smooth(this.overrun, overrunIntensity, 8, dt);
    } else {
      this.overrun = smooth(this.overrun, 0, 14, dt);
    }

    // 4. Turbo Boost Simulation & Compressor Blow-Off Flutter (R34)
    const turboCfg = this.profile.turbo;
    if (turboCfg?.enabled) {
      const spoolThresh = isBmw ? 2400 : 2100;
      const rpmFactor = finiteClamp((this.rpm - spoolThresh) / (this.redlineRpm - spoolThresh), 0, 1);
      // Boost builds smoothly under load & throttle above spool threshold
      const targetBoost = Math.pow(rpmFactor, 1.05) * Math.pow(this.throttle, 1.05) * finiteClamp(this.load * 1.1, 0, 1);
      this.boost = smooth(this.boost, targetBoost, turboCfg.spoolRate, dt);

      // Blow-off detection: rapid throttle drop while boost was built up
      const throttleDrop = Math.max(0, this.prevThrottle - targetThrottle);
      if (throttleDrop > 0.35 && this.prevBoost > turboCfg.blowOffThreshold) {
        this.blowOff = Math.min(1.0, this.prevBoost * 1.3);
      }
      this.blowOff = Math.max(0, this.blowOff - dt * (isBmw ? 7.0 : 4.5));

      const turboActive = this.isLayerActive('turbo');
      const blowOffActive = this.isLayerActive('blowOff');
      this.turboWhineGain = turboActive ? volume * turboCfg.maxWhineGain * Math.pow(this.boost, 1.3) * (isCockpit ? 1.15 : 1.0) : 0;
      this.turboFrequency = 1800 + this.boost * 2400;
      this.blowOffGain = blowOffActive ? volume * (isBmw ? 0.04 : 0.16) * this.blowOff * (isCockpit ? 0.7 : 1.0) : 0;
    } else {
      this.boost = 0;
      this.blowOff = 0;
      this.turboWhineGain = 0;
      this.blowOffGain = 0;
    }
    this.prevThrottle = targetThrottle;
    this.prevBoost = this.boost;

    // 5. Straight-Cut Sequential Racing Gearbox Whine (BMW GT3)
    const transCfg = this.profile.transmission;
    const transActive = this.isLayerActive('gearWhine');
    if (transCfg?.enabled && currentGear > 0 && transActive) {
      const gearRatioMultiplier = Math.max(0.75, 2.2 - currentGear * 0.22);
      const meshFreq = finiteClamp(speed * transCfg.pitchMultiplier * gearRatioMultiplier + 220, 250, 3800);
      this.gearWhineFrequency = meshFreq;

      const speedFactor = finiteClamp(speed / 4.0, 0, 1);
      // Whine drops cleanly off-throttle; screams under acceleration load
      const loadMod = 0.08 + 0.92 * Math.pow(this.load, 1.2);
      const cockpitBoost = isCockpit ? 1.5 : 0.85;
      this.gearWhineGain = volume * transCfg.gearWhineGain * speedFactor * loadMod * cockpitBoost;
    } else {
      this.gearWhineGain = 0;
    }

    // 6. Master Engine Gain and Dynamic Induction Filter
    const vol = finiteClamp(volume, 0, 1);
    const env = finiteClamp(environment, 0, 1);
    const engineActive = this.isLayerActive('engine');

    // Dynamic range: off-load coast has clear mechanical texture without heavy bass mud (floor = 0.22)
    const rawEngineGain = engineActive ? vol * finiteClamp(this.profile.gain, 0, 1) * 0.78 * (0.22 + 0.78 * Math.pow(this.load, 0.95)) * (state.refueling ? 0 : 1) : 0;
    this.engineGain = rawEngineGain * this.shiftCut;

    // Dynamic Engine Filter: opens up crisply under throttle load and high RPM
    const baseCutoff = 2800 + this.load * 3400 + (this.rpm / this.redlineRpm) * 1600;
    this.engineCutoff = isCockpit ? Math.min(2600, baseCutoff * 0.7) : baseCutoff;
    this.cockpitFilterCutoff = isCockpit ? 2400 : 7500;
    this.cabinResonanceGain = isCockpit ? vol * 0.08 * (0.3 + 0.7 * this.load) : 0;

    // 7. Ambient Road and Wind — Non-Tonal, Subtle Broadband Surface Texture
    const roadActive = this.isLayerActive('road');
    const windActive = this.isLayerActive('wind');
    // Road noise is a subtle broadband texture (1.5 kHz - 3 kHz), NOT a low-frequency hum
    this.roadGain = roadActive ? env * 0.06 * Math.pow(finiteClamp(speed / 50, 0, 1), 0.9) * (isCockpit ? 0.45 : 1.0) : 0;
    this.windGain = windActive ? env * 0.09 * Math.pow(finiteClamp((speed - 14) / 46, 0, 1), 1.6) * (isCockpit ? 0.4 : 1.0) : 0;
    this.roadCutoff = 1400 + Math.min(2200, speed * 35);
    this.windCutoff = 900 + Math.min(2600, speed * 40);

    // 8. Physics-Driven Per-Wheel Tire Audio & Multi-Surface Mixing
    let totalScrub = 0;
    let totalSqueal = 0;
    let surfaceAsphalt = 0;
    let surfaceWet = 0;
    let surfaceGravel = 0;
    let surfaceDirt = 0;
    let surfaceGrass = 0;
    let surfaceSnow = 0;

    if (state.wheels && state.wheels.length === 4) {
      for (let i = 0; i < 4; i++) {
        const w = state.wheels[i];
        const normalLoad = finiteClamp(w.normalLoad, 0, 15000);
        const loadWeight = Math.sqrt(normalLoad / 3500);

        // Cornering Scrub: proportional to slip angle exceeding grip threshold
        const slipAng = Math.abs(w.slipAngle);
        if (slipAng > 0.035) {
          const scrubFactor = finiteClamp((slipAng - 0.035) / 0.15, 0, 1);
          totalScrub += scrubFactor * loadWeight;
        }

        // Contact patch relative sliding squeal: strictly requires slipVelocity >= 1.15 m/s
        const slipVel = finiteClamp(w.slipVelocity, 0, 40);
        if (slipVel >= 1.15 && normalLoad > 200) {
          const squealFactor = Math.pow(finiteClamp((slipVel - 1.15) / 3.8, 0, 1), 1.2);
          totalSqueal += squealFactor * loadWeight;
        }

        // Multi-Surface distribution per wheel
        const st = w.surfaceType;
        if (st === 'gravel') surfaceGravel += 0.25;
        else if (st === 'dirt') surfaceDirt += 0.25;
        else if (st === 'grass') surfaceGrass += 0.25;
        else if (st === 'snow') surfaceSnow += 0.25;
        else if (st === 'wet_asphalt') surfaceWet += 0.25;
        else surfaceAsphalt += 0.25;
      }
      totalScrub /= 4;
      totalSqueal /= 4;
    } else {
      const scrub = finiteClamp((state.slip - 0.20) / 0.80, 0, 1);
      const slipIntensity = Math.pow(scrub, 1.3);
      totalScrub = scrub * 0.6;
      totalSqueal = slipIntensity * (speed > 1.0 ? 1 : 0);
      surfaceAsphalt = 1.0;
    }

    const tireScrubActive = this.isLayerActive('tireScrub');
    const tireSquealActive = this.isLayerActive('tireSqueal');
    const speedGate = finiteClamp(speed / 3.5, 0, 1);
    this.tireScrubGain = tireScrubActive ? vol * 0.12 * speedGate * totalScrub * (isCockpit ? 0.75 : 1.0) : 0;
    this.skidGain = tireSquealActive ? vol * (0.18 * speedGate * totalSqueal) * (isCockpit ? 0.8 : 1.0) : 0;
    this.skidFrequency = 1200 + totalSqueal * 1100 + finiteClamp(speed * 8, 0, 300);

    const surfaceActive = this.isLayerActive('surface');
    const surfaceSpeedFactor = Math.pow(finiteClamp(speed / 35, 0, 1), 0.9);
    this.surfaceAsphaltGain = surfaceActive ? env * 0.08 * surfaceAsphalt * surfaceSpeedFactor : 0;
    this.surfaceWetGain = surfaceActive ? env * 0.12 * surfaceWet * surfaceSpeedFactor : 0;
    this.surfaceGravelGain = surfaceActive ? env * 0.18 * surfaceGravel * surfaceSpeedFactor : 0;
    this.surfaceDirtGain = surfaceActive ? env * 0.15 * surfaceDirt * surfaceSpeedFactor : 0;
    this.surfaceGrassGain = surfaceActive ? env * 0.14 * surfaceGrass * surfaceSpeedFactor : 0;
    this.surfaceSnowGain = surfaceActive ? env * 0.12 * surfaceSnow * surfaceSpeedFactor : 0;

    // 9. Strict RPM Loop Crossfading (Strict Bounded Bands — Zero Low-RPM Drone at Speed)
    this.weights.fill(0);
    const n = this.anchors.length;
    if (!n) return;

    let lo = 0;
    while (lo < n - 1 && this.rpm > this.anchors[lo + 1]) lo++;
    const hi = Math.min(lo + 1, n - 1);
    const fraction =
      hi === lo ? 0 : finiteClamp(Math.log(this.rpm / this.anchors[lo]) / Math.log(this.anchors[hi] / this.anchors[lo]), 0, 1);
    let low = Math.cos((fraction * Math.PI) / 2);
    let high = hi === lo ? 0 : Math.sin((fraction * Math.PI) / 2);
    const bandSum = low + high;
    low /= bandSum;
    high /= bandSum;

    let on = Math.sin((this.load * Math.PI) / 2);
    let off = Math.cos((this.load * Math.PI) / 2);
    const loadSum = on + off;
    on /= loadSum;
    off /= loadSum;

    this.weights[lo * 2] = low * on;
    this.weights[lo * 2 + 1] = low * off;
    if (hi !== lo) {
      this.weights[hi * 2] = high * on;
      this.weights[hi * 2 + 1] = high * off;
    }

    // Apply layer mute/solo debug filters to individual engine voices
    const bandNames = ['idle', 'low', 'mid_low', 'mid', 'mid_high', 'high', 'redline'];
    for (let i = 0; i < n; i++) {
      const bName = bandNames[i] || `band_${i}`;
      const onKey = `${bName}_on`;
      const offKey = `${bName}_off`;

      if (this.mutedLayers.has(onKey) || this.mutedLayers.has('engine')) {
        this.weights[i * 2] = 0;
      }
      if (this.mutedLayers.has(offKey) || this.mutedLayers.has('engine')) {
        this.weights[i * 2 + 1] = 0;
      }

      if (this.soloLayers.size > 0) {
        if (!this.soloLayers.has('engine') && !this.soloLayers.has(onKey) && !this.soloLayers.has(bName)) {
          this.weights[i * 2] = 0;
        }
        if (!this.soloLayers.has('engine') && !this.soloLayers.has(offKey) && !this.soloLayers.has(bName)) {
          this.weights[i * 2 + 1] = 0;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      this.pitches[i] = finiteClamp(this.rpm / this.anchors[i], this.minPitch, this.maxPitch);
    }
  }

  getAudibleEngineLayersCount(threshold = 0.02): number {
    let count = 0;
    for (let i = 0; i < this.weights.length; i++) {
      if (this.weights[i] > threshold) count++;
    }
    return count;
  }
}


