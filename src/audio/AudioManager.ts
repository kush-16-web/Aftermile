import type { SettingsData } from '../systems/Settings.ts';
import { VehicleAudio } from './VehicleAudio.ts';
import type { VehicleAudioState } from './VehicleAudio.ts';
import { R34Config } from '../vehicle/VehicleConfig.ts';
import type { VehicleConfig } from '../vehicle/VehicleConfig.ts';
import { buffer } from 'three/tsl';

export class AudioManager {
  context: AudioContext | null = null;
  master!: GainNode;
  wind!: GainNode;
  rain!: GainNode;
  waterGain!: GainNode;
  pad!: GainNode;
  thunderGain!: GainNode;
  vehicle!: VehicleAudio;
  available = true;

  constructor(private vehicleConfig: VehicleConfig = R34Config) {}

  async start() {
    try {
      if (this.context) {
        await this.context.resume();
        return;
      }
      const ctx = (this.context = new AudioContext());
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);

      const channel = (level = 0) => {
        const gain = ctx.createGain();
        gain.gain.value = level;
        gain.connect(this.master);
        return gain;
      };

      this.rain = channel();
      this.waterGain = channel();
      this.pad = channel();
      this.thunderGain = channel();
      this.vehicle = new VehicleAudio(ctx, this.master, this.vehicleConfig);
      this.wind = this.vehicle.wind;



    // Noise source for rain
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        brown = (brown + (Math.random() * 2 - 1) * 0.02) / 1.02;
        data[i] = brown * 3.5;
      }
      const seam = Math.min(2048, Math.floor(data.length / 8));
      for (let i = 0; i < seam; i++) {
        const f = 0.5 * (1 - Math.cos((i / seam) * Math.PI));
        const blended = data[data.length - seam + i] * (1 - f) + data[i] * f;
        data[data.length - seam + i] = blended;
        data[i] = blended;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'highpass';
      rainFilter.frequency.value = 450;
      noise.connect(rainFilter).connect(this.rain);
      noise.start();

      // Spatial Water & Ocean Ambience Synthesis (Airy shore/wave texture)
      const waterBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const wData = waterBuffer.getChannelData(0);
      let wAcc = 0;
      for (let i = 0; i < wData.length; i++) {
        wAcc = (wAcc + (Math.random() * 2 - 1) * 0.035) / 1.025;
        wData[i] = wAcc * 3.2;
      }
      const wNoise = ctx.createBufferSource();
      wNoise.buffer = waterBuffer;
      wNoise.loop = true;
      const waterFilter = ctx.createBiquadFilter();
      waterFilter.type = 'bandpass';
      waterFilter.frequency.value = 1100;
      waterFilter.Q.value = 0.8;
      wNoise.connect(waterFilter).connect(this.waterGain);
      wNoise.start();

      // Ambient Pad channel (silent unless explicit audio buffer is attached)
      await ctx.resume();
    } catch {
      this.available = false;
      this.context = null;
    }
  }

  setVehicle(config: VehicleConfig) {
    this.vehicleConfig = config;
    if (this.context && this.master) {
      if (this.vehicle) {
        this.vehicle.dispose();
      }
      this.vehicle = new VehicleAudio(this.context, this.master, this.vehicleConfig);
      this.wind = this.vehicle.wind;
    }
  }


  update(
    state: VehicleAudioState,
    wet: number,
    tunnel: boolean,
    paused: boolean,
    settings: SettingsData,
    cockpit = false,
    waterProximity = 0
  ) {
    const ctx = this.context;
    if (!ctx) return;
    const t = ctx.currentTime;
    const set = (p: AudioParam, value: number) => p.setTargetAtTime(value, t, 0.1);

    set(this.master.gain, paused ? 0 : settings.master * 0.7);
    if (state.cameraMode === undefined) {
      state.cameraMode = cockpit ? 3 : 0;
    }
    this.vehicle.update(state, settings.engine, settings.environment, tunnel);
    set(this.rain.gain, settings.environment * wet * (tunnel ? 0.03 : cockpit ? 0.35 : 0.65));
    set(this.waterGain.gain, paused ? 0 : settings.environment * waterProximity * (tunnel ? 0.02 : cockpit ? 0.28 : 0.65));
    set(this.pad.gain, settings.music);
  }

  pause() {
    const ctx = this.context;
    if (!ctx) return;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(0, ctx.currentTime);
    void ctx.suspend().catch(() => {});
  }

  thunder() {
    const ctx = this.context;
    if (!ctx) return;
    const t = ctx.currentTime + 1.3;
    this.thunderGain.gain.cancelScheduledValues(t);
    this.thunderGain.gain.setValueAtTime(0, t);
    this.thunderGain.gain.linearRampToValueAtTime(0.9, t + 0.5);
    this.thunderGain.gain.exponentialRampToValueAtTime(0.001, t + 4);
  }

  chime(warning = false) {
    const ctx = this.context;
    if (!ctx) return;
    const osc = ctx.createOscillator(),
      g = ctx.createGain(),
      t = ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(warning ? 280 : 620, t);
    osc.frequency.exponentialRampToValueAtTime(warning ? 220 : 820, t + 0.13);
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(t + 0.35);
  }

  birdCall(volume = 0.04, pan = 0) {
    const ctx = this.context;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    osc.type = 'sine';
    const baseFreq = 2200 + Math.random() * 800;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, t + 0.16);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.2, t + 0.24);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    if (panner) {
      panner.pan.setValueAtTime(Math.max(-0.8, Math.min(0.8, pan)), t);
      osc.connect(g).connect(panner).connect(this.master);
    } else {
      osc.connect(g).connect(this.master);
    }
    osc.start(t);
    osc.stop(t + 0.35);
  }
}
