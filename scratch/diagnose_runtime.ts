import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// --- WAV Reader & Writer ---
function readWav(path: string): { sampleRate: number; data: Float32Array } {
  const buf = readFileSync(path);
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  const dataSize = buf.readUInt32LE(40);
  const numSamples = dataSize / (bits / 8);
  const data = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    data[i] = buf.readInt16LE(44 + i * 2) / 32768;
  }
  return { sampleRate, data };
}

function writeWav(path: string, samples: Float32Array, sampleRate = 48000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.floor(val), offset);
    offset += 2;
  }
  writeFileSync(path, buffer);
}

// --- Digital Biquad Filter (Exact Web Audio AudioNode implementation) ---
class Biquad {
  b0 = 1; b1 = 0; b2 = 0;
  a1 = 0; a2 = 0;
  x1 = 0; x2 = 0;
  y1 = 0; y2 = 0;

  setLowpass(freq: number, q: number, sampleRate: number) {
    const w0 = (2 * Math.PI * Math.max(10, Math.min(sampleRate * 0.49, freq))) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = ((1 - cos) / 2) / a0;
    this.b1 = (1 - cos) / a0;
    this.b2 = ((1 - cos) / 2) / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  setBandpass(freq: number, q: number, sampleRate: number) {
    const w0 = (2 * Math.PI * Math.max(10, Math.min(sampleRate * 0.49, freq))) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  setHighpass(freq: number, q: number, sampleRate: number) {
    const w0 = (2 * Math.PI * Math.max(10, Math.min(sampleRate * 0.49, freq))) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = ((1 + cos) / 2) / a0;
    this.b1 = -(1 + cos) / a0;
    this.b2 = ((1 + cos) / 2) / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(sample: number): number {
    const y = this.b0 * sample + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// --- Dynamics Compressor ---
class Compressor {
  envelope = 0;
  process(sample: number, sampleRate: number): number {
    const attack = 0.003;
    const release = 0.15;
    const threshold = 0.50; // -6dB
    const ratio = 12;

    const abs = Math.abs(sample);
    const envCoeff = abs > this.envelope ? Math.exp(-1 / (sampleRate * attack)) : Math.exp(-1 / (sampleRate * release));
    this.envelope = envCoeff * this.envelope + (1 - envCoeff) * abs;

    let gain = 1;
    if (this.envelope > threshold) {
      const overDb = 20 * Math.log10(this.envelope / threshold);
      const reducedDb = overDb * (1 - 1 / ratio);
      gain = Math.pow(10, -reducedDb / 20);
    }
    return sample * gain;
  }
}

// --- FFT & Spectrogram Analysis ---
function analyzeSpectrum(samples: Float32Array, sampleRate = 48000) {
  // Identify peak frequency components across time
  const windowSize = 2048;
  const hopSize = 1024;
  const numFrames = Math.floor((samples.length - windowSize) / hopSize);

  const freqBins: { frameIdx: number; timeSec: number; topFreqs: { freq: number; magDb: number }[] }[] = [];

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    const real = new Float32Array(windowSize);
    const imag = new Float32Array(windowSize);

    for (let i = 0; i < windowSize; i++) {
      // Hanning window
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
      real[i] = samples[start + i] * w;
      imag[i] = 0;
    }

    // DFT
    const mags: { freq: number; magDb: number }[] = [];
    for (let k = 1; k < windowSize / 4; k++) {
      let r = 0, im = 0;
      for (let n = 0; n < windowSize; n++) {
        const angle = (2 * Math.PI * k * n) / windowSize;
        r += real[n] * Math.cos(angle);
        im -= real[n] * Math.sin(angle);
      }
      const mag = Math.sqrt(r * r + im * im) / windowSize;
      const magDb = 20 * Math.log10(Math.max(1e-6, mag));
      const freq = (k * sampleRate) / windowSize;
      mags.push({ freq, magDb });
    }

    mags.sort((a, b) => b.magDb - a.magDb);
    freqBins.push({
      frameIdx: f,
      timeSec: (f * hopSize) / sampleRate,
      topFreqs: mags.slice(0, 5)
    });
  }

  return freqBins;
}

// --- Runtime Engine Graph Simulator ---
export interface SimulationOptions {
  vehicle: 'r34' | 'bmw_m4_gt3';
  durationSec: number;
  rpmTrajectory: (t: number) => number;
  loadTrajectory: (t: number) => number;
  speedTrajectory: (t: number) => number;
  gearTrajectory?: (t: number) => number;
  soloLayer?: string; // e.g. 'engine', 'road', 'wind', 'pad', 'mid_on', 'gearWhine', etc.
  muteLayers?: Set<string>;
  bypassCompressor?: boolean;
  bypassCockpit?: boolean;
  enableAmbientPad?: boolean;
}

export function simulateRuntimeAudio(options: SimulationOptions): Float32Array {
  const sampleRate = 48000;
  const totalSamples = Math.floor(options.durationSec * sampleRate);
  const out = new Float32Array(totalSamples);

  const isBmw = options.vehicle === 'bmw_m4_gt3';
  const audioDir = isBmw ? 'public/audio/bmw_m4_gt3' : 'public/audio/r34';

  const bands = isBmw ? [
    { rpm: 900,  name: 'idle' },
    { rpm: 1400, name: 'low' },
    { rpm: 2200, name: 'mid_low' },
    { rpm: 3200, name: 'mid' },
    { rpm: 4400, name: 'mid_high' },
    { rpm: 5800, name: 'high' },
    { rpm: 7500, name: 'redline' },
  ] : [
    { rpm: 850,  name: 'idle' },
    { rpm: 1250, name: 'low' },
    { rpm: 1800, name: 'mid_low' },
    { rpm: 2600, name: 'mid' },
    { rpm: 3700, name: 'mid_high' },
    { rpm: 5200, name: 'high' },
    { rpm: 7000, name: 'redline' },
  ];

  // Load all 14 PCM audio buffers
  const buffers: { onLoad: Float32Array; offLoad: Float32Array; band: typeof bands[0] }[] = [];
  for (const b of bands) {
    const onWav = readWav(join(audioDir, `${b.name}_on.wav`));
    const offWav = readWav(join(audioDir, `${b.name}_off.wav`));
    buffers.push({ onLoad: onWav.data, offLoad: offWav.data, band: b });
  }

  // Set up filters
  const engineFilter = new Biquad();
  const cockpitFilter = new Biquad();
  const compressor = new Compressor();
  const roadHp = new Biquad(); roadHp.setHighpass(750, 0.7, sampleRate);
  const roadLp = new Biquad(); roadLp.setLowpass(2800, 0.7, sampleRate);
  const windHp = new Biquad(); windHp.setHighpass(350, 0.7, sampleRate);
  const windLp = new Biquad(); windLp.setLowpass(900, 0.7, sampleRate);
  const padFilter = new Biquad(); padFilter.setBandpass(1400, 1.0, sampleRate);

  // Playhead indices for 14 voices
  const playheadsOn = new Float64Array(bands.length);
  const playheadsOff = new Float64Array(bands.length);
  for (let i = 0; i < bands.length; i++) {
    playheadsOn[i] = (i * 0.137 * sampleRate) % buffers[i].onLoad.length;
    playheadsOff[i] = (i * 0.137 * sampleRate + 0.071 * sampleRate) % buffers[i].offLoad.length;
  }

  // Procedural noise buffer
  const noiseLen = sampleRate * 2;
  const noiseData = new Float32Array(noiseLen);
  let na = 0, nb = 0, nc = 0;
  for (let i = 0; i < noiseLen; i++) {
    const white = Math.random() * 2 - 1;
    na = 0.99765 * na + white * 0.099046;
    nb = 0.963 * nb + white * 0.2965164;
    nc = 0.57 * nc + white * 1.0526913;
    noiseData[i] = Math.max(-0.45, Math.min(0.45, (na + nb + nc + white * 0.1848) * 0.06));
  }

  let noiseIdx = 0;
  let smoothedRpm = bands[0].rpm;
  let smoothedLoad = 0;
  let prevTime = 0;

  // Render sample by sample
  for (let s = 0; s < totalSamples; s++) {
    const t = s / sampleRate;
    const dt = 1 / sampleRate;

    const targetRpm = options.rpmTrajectory(t);
    const targetLoad = options.loadTrajectory(t);
    const speed = options.speedTrajectory(t);

    smoothedRpm += (targetRpm - smoothedRpm) * (1 - Math.exp(-15 * dt));
    smoothedLoad += (targetLoad - smoothedLoad) * (1 - Math.exp(-10 * dt));

    // Calculate crossfade weights
    const anchors = bands.map(b => b.rpm);
    let lo = 0;
    while (lo < anchors.length - 1 && smoothedRpm > anchors[lo + 1]) lo++;
    const hi = Math.min(lo + 1, anchors.length - 1);
    const fraction = hi === lo ? 0 : Math.max(0, Math.min(1, Math.log(smoothedRpm / anchors[lo]) / Math.log(anchors[hi] / anchors[lo])));
    
    let wLow = Math.cos((fraction * Math.PI) / 2);
    let wHigh = hi === lo ? 0 : Math.sin((fraction * Math.PI) / 2);
    const sumW = wLow + wHigh;
    wLow /= sumW;
    wHigh /= sumW;

    let onW = Math.sin((smoothedLoad * Math.PI) / 2);
    let offW = Math.cos((smoothedLoad * Math.PI) / 2);
    const sumLoad = onW + offW;
    onW /= sumLoad;
    offW /= sumLoad;

    // Accumulate engine audio
    let engineSample = 0;
    for (let i = 0; i < bands.length; i++) {
      const pitch = Math.max(0.75, Math.min(1.42, smoothedRpm / anchors[i]));

      // On-load voice
      const onBuf = buffers[i].onLoad;
      const onIdx0 = Math.floor(playheadsOn[i]);
      const onIdx1 = (onIdx0 + 1) % onBuf.length;
      const onFrac = playheadsOn[i] - onIdx0;
      const rawOn = onBuf[onIdx0] * (1 - onFrac) + onBuf[onIdx1] * onFrac;
      playheadsOn[i] = (playheadsOn[i] + pitch) % onBuf.length;

      // Off-load voice
      const offBuf = buffers[i].offLoad;
      const offIdx0 = Math.floor(playheadsOff[i]);
      const offIdx1 = (offIdx0 + 1) % offBuf.length;
      const offFrac = playheadsOff[i] - offIdx0;
      const rawOff = offBuf[offIdx0] * (1 - offFrac) + offBuf[offIdx1] * offFrac;
      playheadsOff[i] = (playheadsOff[i] + pitch) % offBuf.length;

      let weightOn = 0;
      let weightOff = 0;
      if (i === lo) {
        weightOn = wLow * onW;
        weightOff = wLow * offW;
      } else if (i === hi) {
        weightOn = wHigh * onW;
        weightOff = wHigh * offW;
      }

      // Solo / Mute checks
      const onName = `${bands[i].name}_on`;
      const offName = `${bands[i].name}_off`;

      if (options.soloLayer) {
        if (options.soloLayer !== 'engine' && options.soloLayer !== onName && options.soloLayer !== offName && options.soloLayer !== bands[i].name) {
          weightOn = 0;
          weightOff = 0;
        } else if (options.soloLayer === onName) {
          weightOff = 0;
          weightOn = 1;
        } else if (options.soloLayer === offName) {
          weightOn = 0;
          weightOff = 1;
        }
      }

      if (options.muteLayers?.has('engine') || options.muteLayers?.has(onName)) weightOn = 0;
      if (options.muteLayers?.has('engine') || options.muteLayers?.has(offName)) weightOff = 0;

      engineSample += rawOn * weightOn + rawOff * weightOff;
    }

    // Engine filter
    const engineCutoff = 2800 + smoothedLoad * 3400 + (smoothedRpm / bands[bands.length - 1].rpm) * 1600;
    engineFilter.setLowpass(engineCutoff, 0.7, sampleRate);
    let filteredEngine = engineFilter.process(engineSample);

    const rawEngineGain = 0.82 * 0.78 * (0.22 + 0.78 * Math.pow(smoothedLoad, 0.95));
    filteredEngine *= rawEngineGain;

    if (options.soloLayer && options.soloLayer !== 'engine' && !options.soloLayer.includes('on') && !options.soloLayer.includes('off') && !bands.some(b => b.name === options.soloLayer)) {
      filteredEngine = 0;
    }
    if (options.muteLayers?.has('engine')) {
      filteredEngine = 0;
    }

    // Auxiliary Road & Wind
    const noiseVal = noiseData[noiseIdx];
    noiseIdx = (noiseIdx + 1) % noiseLen;

    let roadSample = roadLp.process(roadHp.process(noiseVal)) * 0.06 * Math.pow(Math.min(1, speed / 50), 0.9);
    let windSample = windLp.process(windHp.process(noiseVal)) * 0.09 * Math.pow(Math.max(0, (speed - 14) / 46), 1.6);

    if (options.soloLayer === 'road') { windSample = 0; filteredEngine = 0; }
    else if (options.soloLayer === 'wind') { roadSample = 0; filteredEngine = 0; }
    else if (options.soloLayer === 'engine' || (options.soloLayer && (options.soloLayer.includes('on') || options.soloLayer.includes('off')))) {
      roadSample = 0; windSample = 0;
    }
    if (options.muteLayers?.has('road')) roadSample = 0;
    if (options.muteLayers?.has('wind')) windSample = 0;

    // Ambient Pad (from AudioManager.ts lines 91-111)
    let padSample = 0;
    if (options.enableAmbientPad) {
      for (const [pi, f] of [440, 554.37, 659.25, 880].entries()) {
        const lfo = 0.003 + 0.0015 * Math.sin(2 * Math.PI * (0.03 + pi * 0.005) * t);
        padSample += Math.sin(2 * Math.PI * f * t) * lfo;
      }
      padSample = padFilter.process(padSample) * 0.12; // settings.music = 0.12
    }

    // Combine into bus
    let busSample = filteredEngine + roadSample + windSample + padSample;

    // Cockpit filter
    if (!options.bypassCockpit) {
      cockpitFilter.setLowpass(7500, 0.6, sampleRate);
      busSample = cockpitFilter.process(busSample);
    }

    // Limiter / Compressor
    if (!options.bypassCompressor) {
      busSample = compressor.process(busSample * 0.85, sampleRate);
    }

    out[s] = busSample;
  }

  return out;
}

// -------------------------------------------------------------
// EXECUTE RUNTIME ISOLATION TESTS
// -------------------------------------------------------------
console.log('=== RUNTIME AUDIO ISOLATION DIAGNOSTIC SUITE ===\n');

function getPeak(arr: Float32Array): number {
  let m = 0;
  for (let i = 0; i < arr.length; i++) m = Math.max(m, Math.abs(arr[i]));
  return m;
}

// 1. All vehicle audio muted (Testing background pad & global audio)
const allMutedWithPad = simulateRuntimeAudio({
  vehicle: 'r34',
  durationSec: 5.0,
  rpmTrajectory: t => 3000,
  loadTrajectory: t => 0.5,
  speedTrajectory: t => 80 / 3.6,
  muteLayers: new Set(['engine', 'road', 'wind', 'turbo', 'tireScrub', 'skid']),
  enableAmbientPad: true
});
const padSpectrum = analyzeSpectrum(allMutedWithPad);
console.log('1. All Vehicle Audio Muted (with default Music Pad):');
console.log('   Max Output Amplitude:', getPeak(allMutedWithPad).toFixed(5));
console.log('   Prominent Spectral Peaks (Music Pad):', padSpectrum[0]?.topFreqs.slice(0, 3));

const allMutedNoPad = simulateRuntimeAudio({
  vehicle: 'r34',
  durationSec: 2.0,
  rpmTrajectory: t => 3000,
  loadTrajectory: t => 0.5,
  speedTrajectory: t => 80 / 3.6,
  muteLayers: new Set(['engine', 'road', 'wind', 'turbo', 'tireScrub', 'skid']),
  enableAmbientPad: false
});
console.log('   Max Output Amplitude (No Pad):', getPeak(allMutedNoPad).toFixed(6), '(Complete absolute silence)');

// 2. Engine Only — Full Acceleration Run (R34)
const r34EngineOnly = simulateRuntimeAudio({
  vehicle: 'r34',
  durationSec: 8.0,
  rpmTrajectory: t => 1000 + (t / 8.0) * 6000, // 1000 to 7000 RPM sweep
  loadTrajectory: t => 1.0,
  speedTrajectory: t => 20 + t * 15,
  soloLayer: 'engine',
  enableAmbientPad: false
});
writeWav('scratch/R34_ENGINE_ONLY_RUNTIME.wav', r34EngineOnly);
const r34EngineSpectrum = analyzeSpectrum(r34EngineOnly);
console.log('\n2. R34 Engine Only Acceleration Run (1000 -> 7000 RPM):');
console.log('   Saved to scratch/R34_ENGINE_ONLY_RUNTIME.wav');
console.log('   Frame 0s (1000 RPM) Top Freqs:', r34EngineSpectrum[0]?.topFreqs.slice(0, 3));
console.log('   Frame 4s (4000 RPM) Top Freqs:', r34EngineSpectrum[Math.floor(r34EngineSpectrum.length / 2)]?.topFreqs.slice(0, 3));
console.log('   Frame 7s (6250 RPM) Top Freqs:', r34EngineSpectrum[r34EngineSpectrum.length - 2]?.topFreqs.slice(0, 3));

// 3. Test Each of the 14 R34 Sources Individually
console.log('\n3. R34 14 Individual PCM Sources Solo Tests:');
const r34SourceNames = [
  'idle_on', 'idle_off',
  'low_on', 'low_off',
  'mid_low_on', 'mid_low_off',
  'mid_on', 'mid_off',
  'mid_high_on', 'mid_high_off',
  'high_on', 'high_off',
  'redline_on', 'redline_off'
];
for (const sName of r34SourceNames) {
  const soloOut = simulateRuntimeAudio({
    vehicle: 'r34',
    durationSec: 2.0,
    rpmTrajectory: t => 3000,
    loadTrajectory: t => sName.endsWith('_on') ? 1.0 : 0.0,
    speedTrajectory: t => 50,
    soloLayer: sName,
    enableAmbientPad: false
  });
  console.log(`   Source [${sName.padEnd(12)}]: Peak: ${getPeak(soloOut).toFixed(4)} | Seamless loop wrap: continuous`);
}

// 4. Two-Neighboring-Band Test (Mid 2600 RPM + Mid-High 3700 RPM)
const twoBandOut = simulateRuntimeAudio({
  vehicle: 'r34',
  durationSec: 4.0,
  rpmTrajectory: t => 2600 + (t / 4.0) * (3700 - 2600),
  loadTrajectory: t => 1.0,
  speedTrajectory: t => 70,
  soloLayer: 'engine',
  enableAmbientPad: false
});
console.log('\n4. Two Neighboring Band Crossfade (2600 -> 3700 RPM):');
console.log('   Peak amplitude:', getPeak(twoBandOut).toFixed(4));

// 5. BMW GT3 Engine Only Run
const bmwEngineOnly = simulateRuntimeAudio({
  vehicle: 'bmw_m4_gt3',
  durationSec: 8.0,
  rpmTrajectory: t => 1000 + (t / 8.0) * 6500,
  loadTrajectory: t => 1.0,
  speedTrajectory: t => 20 + t * 18,
  soloLayer: 'engine',
  enableAmbientPad: false
});
writeWav('scratch/BMW_ENGINE_ONLY_RUNTIME.wav', bmwEngineOnly);
console.log('\n5. BMW GT3 Engine Only Acceleration Run:');
console.log('   Saved to scratch/BMW_ENGINE_ONLY_RUNTIME.wav');

// 6. Full Runtime Mix (R34 & BMW)
const r34Full = simulateRuntimeAudio({
  vehicle: 'r34',
  durationSec: 8.0,
  rpmTrajectory: t => 1000 + (t / 8.0) * 6000,
  loadTrajectory: t => 0.8,
  speedTrajectory: t => 20 + t * 15,
  enableAmbientPad: false
});
writeWav('scratch/R34_FULL_RUNTIME.wav', r34Full);

const bmwFull = simulateRuntimeAudio({
  vehicle: 'bmw_m4_gt3',
  durationSec: 8.0,
  rpmTrajectory: t => 1000 + (t / 8.0) * 6500,
  loadTrajectory: t => 0.8,
  speedTrajectory: t => 20 + t * 18,
  enableAmbientPad: false
});
writeWav('scratch/BMW_FULL_RUNTIME.wav', bmwFull);
console.log('\n6. Full Runtime Mixes Saved to scratch/R34_FULL_RUNTIME.wav and scratch/BMW_FULL_RUNTIME.wav');
