import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function encodeWav(samples: Float32Array, sampleRate = 48000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size
  buffer.writeUInt16LE(1, 20);  // PCM format (1 = uncompressed PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.floor(val), offset);
    offset += 2;
  }

  return buffer;
}

interface CombustionConfig {
  cylinders: number;
  firingOrderOffsets: number[]; // degrees 0-720
  wiebeA: number;
  wiebeB: number;
  pulseWidthDeg: number;
  exhaustPipeDelaySec: number;
  exhaustReflection: number;
  intakeWeight: number;
  mechanicalWeight: number;
  turbulenceWeight: number;
  raspHarmonic: number;
  raspWeight: number;
  saturation: number;
  filterCutoffHz: number;
}

function synthesizePhysicalCombustionLoop(
  rpm: number,
  isOnLoad: boolean,
  config: CombustionConfig,
  sampleRate = 48000,
  targetDuration = 2.0
): Float32Array {
  const cycleFreq = rpm / 120; // 720 deg cycles per second for 4-stroke
  const numCycles = Math.max(1, Math.round(targetDuration * cycleFreq));
  const exactDuration = numCycles / cycleFreq;
  const numSamples = Math.round(exactDuration * sampleRate);

  const seamSamples = 1024;
  const pipeDelaySamples = Math.max(1, Math.round(config.exhaustPipeDelaySec * sampleRate));
  const delayBuffer = new Float32Array(pipeDelaySamples);
  let delayIdx = 0;

  // Run warm-up pass so delay lines and IIR filters reach steady-state periodic equilibrium
  const warmUpSamples = numSamples;
  const totalSamples = warmUpSamples + numSamples + seamSamples;
  const rawBuffer = new Float32Array(numSamples + seamSamples);

  let lpState = 0;
  const rc = 1 / (2 * Math.PI * config.filterCutoffHz);
  const alpha = (1 / sampleRate) / (rc + 1 / sampleRate);

  // Pseudo-random noise with smooth periodic wrap for stationary turbulence
  const noisePeriod = Math.min(numSamples, 24000);
  const noiseTable = new Float32Array(noisePeriod);
  for (let j = 0; j < noisePeriod; j++) {
    noiseTable[j] = Math.random() * 2 - 1;
  }
  const seamN = 256;
  for (let j = 0; j < seamN; j++) {
    const f = 0.5 * (1 - Math.cos((j / seamN) * Math.PI));
    noiseTable[j] = noiseTable[noisePeriod - seamN + j] * (1 - f) + noiseTable[j] * f;
    noiseTable[noisePeriod - seamN + j] = noiseTable[j];
  }

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const cyclePhase = (t * cycleFreq) % 1;
    const crankAngleDeg = cyclePhase * 720;

    let cylinderPressure = 0;
    let intakeSuction = 0;
    let valveNoise = 0;

    for (let c = 0; c < config.cylinders; c++) {
      const offset = config.firingOrderOffsets[c];
      const deg = (crankAngleDeg - offset + 720) % 720;

      // Exhaust stroke combustion pressure wave
      if (deg < config.pulseWidthDeg) {
        const norm = deg / config.pulseWidthDeg;
        // Asymmetric Wiebe curve: fast explosive rise, exponential expansion decay
        const p = Math.pow(norm, config.wiebeA) * Math.exp(-config.wiebeB * norm);
        cylinderPressure += p;
      }

      // Intake suction stroke (360 deg out of phase with exhaust)
      const intakeDeg = (deg + 360) % 720;
      if (intakeDeg < config.pulseWidthDeg * 1.4) {
        const norm = intakeDeg / (config.pulseWidthDeg * 1.4);
        intakeSuction += Math.sin(norm * Math.PI) * (1 - norm * 0.4);
      }

      // Mechanical valve closing impact
      if (Math.abs(deg - config.pulseWidthDeg) < 3.5) {
        valveNoise += (noiseTable[i % noisePeriod]) * 0.4;
      }
    }

    // Exhaust header delay-line comb filtering (physical acoustic reflection)
    const delayed = delayBuffer[delayIdx];
    const exhaustWave = cylinderPressure + delayed * config.exhaustReflection;
    delayBuffer[delayIdx] = cylinderPressure + delayed * (config.exhaustReflection * 0.65);
    delayIdx = (delayIdx + 1) % pipeDelaySamples;

    // Gas flow turbulence
    const flowNoise = noiseTable[i % noisePeriod];
    const flowScale = isOnLoad ? (cylinderPressure * 0.7 + 0.3) : 0.25;
    const turbulence = flowNoise * flowScale * config.turbulenceWeight;

    // Cylinder rasp / high harmonic acoustic resonance
    const f0 = (rpm / 60) * 3; // inline-6 cylinder event rate
    const rasp = Math.sin(2 * Math.PI * f0 * config.raspHarmonic * t) * cylinderPressure * config.raspWeight;

    // Combined physical acoustic wave
    let wave = exhaustWave + intakeSuction * config.intakeWeight + valveNoise * config.mechanicalWeight + turbulence + rasp;

    // Non-linear manifold & pipe saturation
    wave = Math.tanh(wave * config.saturation);

    // Acoustic lowpass damping
    lpState = lpState + alpha * (wave - lpState);

    if (i >= warmUpSamples) {
      rawBuffer[i - warmUpSamples] = lpState;
    }
  }

  // Crossfade the boundary over seamSamples so loop wrap is 100% continuous with 0 jump
  const output = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    if (i < seamSamples) {
      const f = 0.5 * (1 - Math.cos((i / seamSamples) * Math.PI));
      output[i] = rawBuffer[numSamples + i] * (1 - f) + rawBuffer[i] * f;
    } else {
      output[i] = rawBuffer[i];
    }
  }

  // Exact DC Offset Removal
  let dc = 0;
  for (let i = 0; i < numSamples; i++) dc += output[i];
  dc /= numSamples;
  for (let i = 0; i < numSamples; i++) output[i] -= dc;

  // Peak normalization to 0.450
  let peak = 0;
  for (let i = 0; i < numSamples; i++) peak = Math.max(peak, Math.abs(output[i]));
  if (peak > 0) {
    const scale = 0.45 / peak;
    for (let i = 0; i < numSamples; i++) output[i] *= scale;
  }

  return output;
}

// -------------------------------------------------------------
// Nissan Skyline GT-R R34 (RB26DETT 2.6L Twin-Turbo Inline-6)
// Road/Track Performance Profile:
// - Smooth velvety 6-cylinder combustion wavefront
// - Equal-length dual-turbo exhaust manifold (8.2 ms delay)
// - Strong individual throttle body (ITB) induction growl
// - Balanced street muffler resonance with rich low-mid growl
// -------------------------------------------------------------
function synthesizeR34Band(rpm: number, isOnLoad: boolean): Float32Array {
  const config: CombustionConfig = {
    cylinders: 6,
    firingOrderOffsets: [0, 120, 240, 360, 480, 600], // 1-5-3-6-2-4 standard I6
    wiebeA: isOnLoad ? 1.35 : 1.15,
    wiebeB: isOnLoad ? 2.5 : 2.1,
    pulseWidthDeg: isOnLoad ? 98 : 110,
    exhaustPipeDelaySec: 0.0082, // 8.2 ms manifold roundtrip
    exhaustReflection: isOnLoad ? 0.62 : 0.48,
    intakeWeight: isOnLoad ? 0.42 : 0.22,
    mechanicalWeight: isOnLoad ? 0.14 : 0.08,
    turbulenceWeight: isOnLoad ? 0.22 : 0.14,
    raspHarmonic: 3.0,
    raspWeight: isOnLoad ? 0.28 : 0.12,
    saturation: isOnLoad ? 1.45 : 1.15,
    filterCutoffHz: isOnLoad ? 4800 : 3600,
  };

  return synthesizePhysicalCombustionLoop(rpm, isOnLoad, config);
}

const r34Bands = [
  { rpm: 850, name: 'idle' },
  { rpm: 1250, name: 'low' },
  { rpm: 1800, name: 'mid_low' },
  { rpm: 2600, name: 'mid' },
  { rpm: 3700, name: 'mid_high' },
  { rpm: 5200, name: 'high' },
  { rpm: 7000, name: 'redline' },
];

const r34OutDir = join(process.cwd(), 'public', 'audio', 'r34');
mkdirSync(r34OutDir, { recursive: true });

console.log('Generating Physical 4-Stroke RB26DETT Combustion Audio Loops in', r34OutDir);

for (const band of r34Bands) {
  const onData = synthesizeR34Band(band.rpm, true);
  const offData = synthesizeR34Band(band.rpm, false);

  const onWav = encodeWav(onData);
  const offWav = encodeWav(offData);

  writeFileSync(join(r34OutDir, `${band.name}_on.wav`), onWav);
  writeFileSync(join(r34OutDir, `${band.name}_off.wav`), offWav);

  console.log(`Generated ${band.name}_on.wav (${band.rpm} RPM On-Load) and ${band.name}_off.wav (${band.rpm} RPM Off-Load)`);
}

console.log('R34 audio generation complete!');
