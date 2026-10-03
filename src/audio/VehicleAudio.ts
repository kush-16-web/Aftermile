import type { VehicleConfig } from '../vehicle/VehicleConfig.ts';
import { VehicleAudioControls, finiteClamp } from './VehicleAudioControls.ts';
import type { VehicleAudioState } from './VehicleAudioControls.ts';
export type { VehicleAudioState } from './VehicleAudioControls.ts';

const MAX_DOWNLOAD_BYTES = 1024 * 1024;
const MAX_DECODED_BYTES = 12 * 1024 * 1024;
type RecordingStatus = 'needs-recordings' | 'loading' | 'partial' | 'recorded' | 'disposed';
interface LoopVoice { source: AudioBufferSourceNode; gain: GainNode; slot: number; }

const target = (param: AudioParam, value: number, time: number, seconds = 0.065) => {
  if (Number.isFinite(value) && typeof param?.setTargetAtTime === 'function') {
    param.setTargetAtTime(value, time, seconds);
  }
};

/**
 * Reusable vehicle audio architecture.
 * Features:
 * - Real engine recordings loop crossfading (equal power)
 * - Load-dependent dynamic induction & exhaust filtering
 * - Authentic RB26DETT twin-turbo spool & blowoff flutter
 * - GT3 straight-cut sequential racing gearbox whine
 * - Shift transients & ignition-cut torque dips
 * - Physics-driven per-wheel tire scrub & sliding squeal
 * - Multi-surface per-wheel audio (asphalt, wet, gravel, dirt, grass, snow)
 * - Cockpit interior cabin resonance & acoustic transfer function
 */
export class VehicleAudio {
  // Main Audio Buses & Channels
  readonly engine: GainNode;
  readonly road: GainNode;
  readonly wind: GainNode;
  readonly skid: GainNode;
  readonly tireScrub: GainNode;
  readonly tunnel: GainNode;
  readonly turboWhine: GainNode;
  readonly blowOff: GainNode;
  readonly gearWhine: GainNode;
  readonly shiftPop: GainNode;
  readonly overrun: GainNode;

  // Multi-Surface Channels
  readonly surfaceWet: GainNode;
  readonly surfaceGravel: GainNode;
  readonly surfaceDirt: GainNode;
  readonly surfaceGrass: GainNode;
  readonly surfaceSnow: GainNode;

  // Filters
  readonly engineFilter: BiquadFilterNode;
  readonly roadFilter: BiquadFilterNode;
  readonly skidFilter: BiquadFilterNode;
  readonly tireScrubFilter: BiquadFilterNode;
  readonly turboFilter: BiquadFilterNode;
  readonly blowOffFilter: BiquadFilterNode;
  readonly gearWhineFilter: BiquadFilterNode;
  readonly shiftPopFilter: BiquadFilterNode;
  readonly overrunFilter: BiquadFilterNode;
  readonly cockpitFilter: BiquadFilterNode;

  // Surface Filters
  readonly surfaceWetFilter: BiquadFilterNode;
  readonly surfaceGravelFilter: BiquadFilterNode;
  readonly surfaceDirtFilter: BiquadFilterNode;
  readonly surfaceGrassFilter: BiquadFilterNode;
  readonly surfaceSnowFilter: BiquadFilterNode;

  readonly controls: VehicleAudioControls;
  readonly ready: Promise<void>;
  recordingStatus: RecordingStatus = 'needs-recordings';
  readonly recordingErrors: string[] = [];
  decodedBytes = 0;
  downloadedBytes = 0;
  loadedLoops = 0;
  readonly noiseBytes: number;

  private readonly voices: LoopVoice[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly abort = new AbortController();
  private readonly windFilter: BiquadFilterNode;
  private readonly noise: AudioBufferSourceNode;
  private readonly oscillators: OscillatorNode[] = [];
  private disposed = false;
  private previousTime: number;
  private previousAutomation = -Infinity;

  constructor(private context: AudioContext, master: GainNode, config: VehicleConfig) {
    const profile = { ...config.audio, bands: config.audio.bands.map(b => ({ ...b })).sort((a, b) => a.rpm - b.rpm) };
    profile.bands = profile.bands.filter((b, i, all) => Number.isFinite(b.rpm) && b.rpm > 0 && (!i || b.rpm !== all[i - 1].rpm)).slice(0, 8);
    this.controls = new VehicleAudioControls(profile, config.engine.idleRpm, config.engine.redlineRpm);
    this.previousTime = context.currentTime;

    const gain = () => {
      const g = context.createGain();
      g.gain.value = 0;
      this.nodes.push(g);
      return g;
    };
    const filter = (type: BiquadFilterType, frequency: number, q = 0.7) => {
      const f = context.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = q;
      this.nodes.push(f);
      return f;
    };

    // Master Dynamics Limiter & Bus
    const bus = context.createGain();
    const limiter = context.createDynamicsCompressor();
    bus.gain.value = 0.85;
    limiter.threshold.value = -6;
    limiter.knee.value = 3;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    bus.connect(limiter).connect(master);
    this.nodes.push(bus, limiter);

    // Primary Gains
    this.engine = gain();
    this.road = gain();
    this.wind = gain();
    this.skid = gain();
    this.tireScrub = gain();
    this.tunnel = gain();
    this.turboWhine = gain();
    this.blowOff = gain();
    this.gearWhine = gain();
    this.shiftPop = gain();
    this.overrun = gain();

    // Multi-surface Gains
    this.surfaceWet = gain();
    this.surfaceGravel = gain();
    this.surfaceDirt = gain();
    this.surfaceGrass = gain();
    this.surfaceSnow = gain();

    // Cockpit master filter
    this.cockpitFilter = filter('lowpass', 8000, 0.6);
    this.cockpitFilter.connect(bus);

    // Route channels into master bus
    this.engine.connect(this.cockpitFilter);
    this.road.connect(this.cockpitFilter);
    this.wind.connect(bus);
    this.skid.connect(this.cockpitFilter);
    this.tireScrub.connect(this.cockpitFilter);
    this.tunnel.connect(bus);
    this.turboWhine.connect(this.cockpitFilter);
    this.blowOff.connect(this.cockpitFilter);
    this.gearWhine.connect(this.cockpitFilter);
    this.shiftPop.connect(this.cockpitFilter);
    this.overrun.connect(this.cockpitFilter);

    this.surfaceWet.connect(this.cockpitFilter);
    this.surfaceGravel.connect(this.cockpitFilter);
    this.surfaceDirt.connect(this.cockpitFilter);
    this.surfaceGrass.connect(this.cockpitFilter);
    this.surfaceSnow.connect(this.cockpitFilter);

    // Engine Filter & Tunnel Reverb
    this.engineFilter = filter('lowpass', 5500);
    this.engineFilter.connect(this.engine);
    const delay = context.createDelay(0.2);
    delay.delayTime.value = 0.105;
    this.nodes.push(delay);
    this.engine.connect(delay).connect(this.tunnel);

    // Ambient Road & Wind Filters (Broadband textural road noise, zero low-frequency resonant cavity drone)
    this.roadFilter = filter('lowpass', 2800);
    const roadHighpass = filter('highpass', 750);
    roadHighpass.connect(this.roadFilter).connect(this.road);
    const windHighpass = filter('highpass', 350);
    this.windFilter = filter('lowpass', 900);
    windHighpass.connect(this.windFilter).connect(this.wind);

    // Tire Filters: Scrub (low-mid friction) & Squeal (high-slip screech)
    this.skidFilter = filter('bandpass', 1600, 3.5);
    this.skidFilter.connect(this.skid);
    this.tireScrubFilter = filter('bandpass', 850, 2.2);
    this.tireScrubFilter.connect(this.tireScrub);

    // Turbo Spool & Blow-Off Filters
    this.turboFilter = filter('bandpass', 2400, 6.0);
    this.turboFilter.connect(this.turboWhine);
    this.blowOffFilter = filter('bandpass', 1800, 3.0);
    this.blowOffFilter.connect(this.blowOff);

    // Sequential Gear Whine Filter (High-Q Resonator)
    this.gearWhineFilter = filter('bandpass', 900, 8.5);
    this.gearWhineFilter.connect(this.gearWhine);

    // Shift Pop & Overrun Filters
    this.shiftPopFilter = filter('bandpass', 280, 2.0);
    this.shiftPopFilter.connect(this.shiftPop);
    this.overrunFilter = filter('bandpass', 140, 1.8);
    this.overrunFilter.connect(this.overrun);

    // Multi-surface Filters
    this.surfaceWetFilter = filter('bandpass', 2800, 1.5);
    this.surfaceWetFilter.connect(this.surfaceWet);
    this.surfaceGravelFilter = filter('bandpass', 950, 1.8);
    this.surfaceGravelFilter.connect(this.surfaceGravel);
    this.surfaceDirtFilter = filter('lowpass', 750, 1.2);
    this.surfaceDirtFilter.connect(this.surfaceDirt);
    this.surfaceGrassFilter = filter('bandpass', 1100, 1.4);
    this.surfaceGrassFilter.connect(this.surfaceGrass);
    this.surfaceSnowFilter = filter('bandpass', 1400, 1.6);
    this.surfaceSnowFilter.connect(this.surfaceSnow);

    // Shared Noise Buffer (Pink/Brown filtered noise)
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 2), context.sampleRate);
    const samples = buffer.getChannelData(0);
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < samples.length; i++) {
      const white = Math.random() * 2 - 1;
      a = 0.99765 * a + white * 0.099046;
      b = 0.963 * b + white * 0.2965164;
      c = 0.57 * c + white * 1.0526913;
      samples[i] = finiteClamp((a + b + c + white * 0.1848) * 0.06, -0.45, 0.45);
    }
    const seam = 1024;
    for (let i = 0; i < seam; i++) {
      const f = 0.5 * (1 - Math.cos((i / seam) * Math.PI));
      const blended = samples[samples.length - seam + i] * (1 - f) + samples[i] * f;
      samples[samples.length - seam + i] = blended;
      samples[i] = blended;
    }
    this.noiseBytes = samples.byteLength;
    this.noise = context.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;

    // Connect noise into all physical procedural channels
    this.noise.connect(roadHighpass);
    this.noise.connect(windHighpass);
    this.noise.connect(this.skidFilter);
    this.noise.connect(this.tireScrubFilter);
    this.noise.connect(this.turboFilter);
    this.noise.connect(this.blowOffFilter);
    this.noise.connect(this.gearWhineFilter);
    this.noise.connect(this.shiftPopFilter);
    this.noise.connect(this.overrunFilter);
    this.noise.connect(this.surfaceWetFilter);
    this.noise.connect(this.surfaceGravelFilter);
    this.noise.connect(this.surfaceDirtFilter);
    this.noise.connect(this.surfaceGrassFilter);
    this.noise.connect(this.surfaceSnowFilter);

    this.noise.start();
    this.nodes.push(this.noise);

    // Optional Tone Oscillator for GT3 Sequential Gear Whine (if supported)
    if (typeof context.createOscillator === 'function') {
      try {
        const osc = context.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 800;
        const oscGain = gain();
        oscGain.gain.value = 0.08;
        osc.connect(this.gearWhineFilter);
        osc.start();
        this.oscillators.push(osc);
        this.nodes.push(osc);
      } catch {
        // Safe fallback to noise-driven resonator in environments without oscillator support
      }
    }

    this.ready = this.loadRecordings(profile.bands);
  }

  private async loadRecordings(bands: VehicleConfig['audio']['bands']) {
    if (!bands.some(b => b.onLoad || b.offLoad)) return;
    this.recordingStatus = 'loading';
    const cache = new Map<string, AudioBuffer>();

    for (let i = 0; i < bands.length; i++) {
      for (let mode = 0; mode < 2; mode++) {
        const url = mode === 0 ? bands[i].onLoad : bands[i].offLoad;
        if (!url || this.disposed) continue;
        try {
          let buffer = cache.get(url);
          if (!buffer) {
            const response = await fetch(url, { signal: this.abort.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (Number(response.headers.get('Content-Length')) > MAX_DOWNLOAD_BYTES) throw new Error('loop download exceeds 1 MiB');
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('loop download exceeds 1 MiB');
            this.downloadedBytes += bytes.byteLength;
            buffer = await this.context.decodeAudioData(bytes);
            if (this.disposed) return;
            if (buffer.numberOfChannels !== 1 || buffer.duration < 0.75 || buffer.duration > 6) throw new Error('loops must be mono and 0.75–6 seconds');
            const memory = buffer.length * 4;
            if (this.decodedBytes + memory > MAX_DECODED_BYTES) throw new Error('decoded engine budget exceeds 12 MiB');
            const data = buffer.getChannelData(0);
            let dc = 0, peak = 0;
            for (let j = 0; j < data.length; j++) {
              if (!Number.isFinite(data[j])) throw new Error('invalid PCM');
              dc += data[j];
            }
            dc /= data.length;
            for (let j = 0; j < data.length; j++) peak = Math.max(peak, Math.abs(data[j] - dc));
            if (peak < 0.0001) throw new Error('silent engine recording');
            const scale = 0.45 / peak;
            for (let j = 0; j < data.length; j++) data[j] = (data[j] - dc) * scale;
            this.decodedBytes += memory;
            cache.set(url, buffer);
          }
          const source = this.context.createBufferSource();
          const gain = this.context.createGain();
          source.buffer = buffer;
          source.loop = true;
          source.playbackRate.value = 1;
          gain.gain.value = 0;
          source.connect(gain).connect(this.engineFilter);
          source.start(this.context.currentTime, (i * 0.137 + mode * 0.071) % buffer.duration);
          this.voices.push({ source, gain, slot: i * 2 + mode });
          this.nodes.push(source, gain);
          this.loadedLoops++;
        } catch (error) {
          if (this.disposed) return;
          this.recordingErrors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    if (!this.disposed) this.recordingStatus = this.loadedLoops === bands.length * 2 ? 'recorded' : this.loadedLoops ? 'partial' : 'needs-recordings';
  }

  update(state: VehicleAudioState, volume: number, environment: number, inTunnel: boolean) {
    if (this.disposed) return;
    const t = this.context.currentTime;
    const dt = t - this.previousTime;
    this.previousTime = t;

    this.controls.update(state, volume, environment, dt);

    // Automation at <= 30 Hz bounds scheduling churn while AudioParams interpolate smoothly
    if (t - this.previousAutomation < 1 / 30) return;
    this.previousAutomation = t;
    const c = this.controls;

    // Engine loop crossfades & pitch
    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i];
      target(voice.gain.gain, c.weights[voice.slot], t);
      target(voice.source.playbackRate, c.pitches[voice.slot >> 1], t, 0.045);
    }

    target(this.engine.gain, c.engineGain, t);
    target(this.engineFilter.frequency, c.engineCutoff, t);
    target(this.cockpitFilter.frequency, c.cockpitFilterCutoff, t);

    // Road & Wind
    target(this.road.gain, c.roadGain, t);
    target(this.wind.gain, c.windGain * (inTunnel ? 0.45 : 1), t);
    target(this.roadFilter.frequency, c.roadCutoff, t);
    target(this.windFilter.frequency, c.windCutoff, t);

    // Tire Scrub & Sliding Squeal
    target(this.skid.gain, c.skidGain, t, 0.035);
    target(this.skidFilter.frequency, c.skidFrequency, t);
    target(this.tireScrub.gain, c.tireScrubGain, t, 0.045);

    // Turbo Spool & Blow-Off (R34)
    target(this.turboWhine.gain, c.turboWhineGain, t, 0.04);
    target(this.turboFilter.frequency, c.turboFrequency, t, 0.04);
    target(this.blowOff.gain, c.blowOffGain, t, 0.02);

    // Sequential Gearbox Whine (BMW GT3)
    target(this.gearWhine.gain, c.gearWhineGain, t, 0.04);
    target(this.gearWhineFilter.frequency, c.gearWhineFrequency, t, 0.035);
    for (let i = 0; i < this.oscillators.length; i++) {
      target(this.oscillators[i].frequency, c.gearWhineFrequency, t, 0.035);
    }

    // Shift Pop & Overrun
    target(this.shiftPop.gain, c.shiftBang * volume * 0.22, t, 0.015);
    target(this.overrun.gain, c.overrun * volume * 0.12, t, 0.05);

    // Multi-surface Channels
    target(this.surfaceWet.gain, c.surfaceWetGain, t, 0.08);
    target(this.surfaceGravel.gain, c.surfaceGravelGain, t, 0.08);
    target(this.surfaceDirt.gain, c.surfaceDirtGain, t, 0.08);
    target(this.surfaceGrass.gain, c.surfaceGrassGain, t, 0.08);
    target(this.surfaceSnow.gain, c.surfaceSnowGain, t, 0.08);

    target(this.tunnel.gain, inTunnel ? 0.15 : 0, t, 0.15);
  }

  getDebugLayerStates(): { name: string; gain: number; frequency?: number; pitch?: number; muted: boolean; solo: boolean }[] {
    const c = this.controls;
    const bandNames = ['idle', 'low', 'mid_low', 'mid', 'mid_high', 'high', 'redline'];
    const engineVoices: { name: string; gain: number; frequency?: number; pitch?: number; muted: boolean; solo: boolean }[] = [];

    for (let i = 0; i < c.anchors.length; i++) {
      const bName = bandNames[i] || `band_${i}`;
      const onKey = `${bName}_on`;
      const offKey = `${bName}_off`;
      const p = c.pitches[i];

      engineVoices.push({
        name: onKey,
        gain: c.weights[i * 2] * c.engineGain,
        pitch: p,
        frequency: c.anchors[i] * p / 20,
        muted: c.mutedLayers.has(onKey) || c.mutedLayers.has('engine'),
        solo: c.soloLayers.has(onKey)
      });
      engineVoices.push({
        name: offKey,
        gain: c.weights[i * 2 + 1] * c.engineGain,
        pitch: p,
        frequency: c.anchors[i] * p / 20,
        muted: c.mutedLayers.has(offKey) || c.mutedLayers.has('engine'),
        solo: c.soloLayers.has(offKey)
      });
    }

    return [
      { name: 'engine', gain: c.engineGain, frequency: c.engineCutoff, muted: c.mutedLayers.has('engine'), solo: c.soloLayers.has('engine') },
      ...engineVoices,
      { name: 'turbo', gain: c.turboWhineGain, frequency: c.turboFrequency, muted: c.mutedLayers.has('turbo'), solo: c.soloLayers.has('turbo') },
      { name: 'blowOff', gain: c.blowOffGain, muted: c.mutedLayers.has('blowOff'), solo: c.soloLayers.has('blowOff') },
      { name: 'gearWhine', gain: c.gearWhineGain, frequency: c.gearWhineFrequency, muted: c.mutedLayers.has('gearWhine'), solo: c.soloLayers.has('gearWhine') },
      { name: 'shiftPop', gain: c.shiftBang * 0.22, muted: c.mutedLayers.has('shiftPop'), solo: c.soloLayers.has('shiftPop') },
      { name: 'overrun', gain: c.overrun * 0.12, muted: c.mutedLayers.has('overrun'), solo: c.soloLayers.has('overrun') },
      { name: 'tireScrub', gain: c.tireScrubGain, muted: c.mutedLayers.has('tireScrub'), solo: c.soloLayers.has('tireScrub') },
      { name: 'tireSqueal', gain: c.skidGain, frequency: c.skidFrequency, muted: c.mutedLayers.has('tireSqueal'), solo: c.soloLayers.has('tireSqueal') },
      { name: 'road', gain: c.roadGain, frequency: c.roadCutoff, muted: c.mutedLayers.has('road'), solo: c.soloLayers.has('road') },
      { name: 'surface', gain: c.surfaceAsphaltGain + c.surfaceGravelGain + c.surfaceDirtGain + c.surfaceGrassGain + c.surfaceSnowGain + c.surfaceWetGain, muted: c.mutedLayers.has('surface'), solo: c.soloLayers.has('surface') },
      { name: 'wind', gain: c.windGain, frequency: c.windCutoff, muted: c.mutedLayers.has('wind'), solo: c.soloLayers.has('wind') },
      { name: 'tunnel', gain: this.tunnel.gain.value, muted: c.mutedLayers.has('tunnel'), solo: c.soloLayers.has('tunnel') },
    ];
  }

  setLayerMute(layer: string, muted: boolean) {
    if (muted) this.controls.mutedLayers.add(layer);
    else this.controls.mutedLayers.delete(layer);
  }

  setLayerSolo(layer: string, solo: boolean) {
    if (solo) this.controls.soloLayers.add(layer);
    else this.controls.soloLayers.delete(layer);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.recordingStatus = 'disposed';
    this.abort.abort();
    this.noise.stop();
    this.noise.buffer = null;
    for (let i = 0; i < this.oscillators.length; i++) {
      try {
        this.oscillators[i].stop();
      } catch {}
    }
    for (let i = 0; i < this.voices.length; i++) {
      this.voices[i].source.stop();
      this.voices[i].source.buffer = null;
    }
    for (let i = 0; i < this.nodes.length; i++) this.nodes[i].disconnect();
    this.voices.length = 0;
    this.nodes.length = 0;
    this.oscillators.length = 0;
    this.decodedBytes = 0;
  }
}

