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
  buffer.writeUInt16LE(1, 20);  // PCM format
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
  highMetallicHarmonic: number;
  highMetallicWeight: number;
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
        // High compression racing flame front: steep explosive rise, fast expansion
        const p = Math.pow(norm, config.wiebeA) * Math.exp(-config.wiebeB * norm);
        cylinderPressure += p;
      }

      // Intake suction stroke (360 deg out of phase with exhaust)
      const intakeDeg = (deg + 360) % 720;
      if (intakeDeg < config.pulseWidthDeg * 1.3) {
        const norm = intakeDeg / (config.pulseWidthDeg * 1.3);
        intakeSuction += Math.sin(norm * Math.PI) * (1 - norm * 0.3);
      }

      // High-RPM racing solid-lifter valvetrain click
      if (Math.abs(deg - config.pulseWidthDeg) < 3.0) {
        valveNoise += (noiseTable[i % noisePeriod]) * 0.6;
      }
    }

    // Racing open header delay-line comb filtering (acoustic pipe resonance)
    const delayed = delayBuffer[delayIdx];
    const exhaustWave = cylinderPressure + delayed * config.exhaustReflection;
    delayBuffer[delayIdx] = cylinderPressure + delayed * (config.exhaustReflection * 0.72);
    delayIdx = (delayIdx + 1) % pipeDelaySamples;

    // Gas flow turbulence (racing exhaust velocity)
    const flowNoise = noiseTable[i % noisePeriod];
    const flowScale = isOnLoad ? (cylinderPressure * 0.75 + 0.35) : 0.28;
    const turbulence = flowNoise * flowScale * config.turbulenceWeight;

    // GT3 signature aggressive 3rd and 5th harmonic rasp
    const f0 = (rpm / 60) * 3; // inline-6 cylinder event rate
    const rasp = Math.sin(2 * Math.PI * f0 * config.raspHarmonic * t) * cylinderPressure * config.raspWeight;
    const metallicRing = Math.sin(2 * Math.PI * f0 * config.highMetallicHarmonic * t + 0.8) * cylinderPressure * config.highMetallicWeight;

    // Combined physical acoustic wave
    let wave = exhaustWave + intakeSuction * config.intakeWeight + valveNoise * config.mechanicalWeight + turbulence + rasp + metallicRing;

    // Non-linear racing header saturation (harder clip / dry metallic edge)
    wave = Math.tanh(wave * config.saturation);

    // Acoustic lowpass damping
    lpState = lpState + alpha * (wave - lpState);

    if (i >= warmUpSamples) {
      rawBuffer[i - warmUpSamples] = lpState;
    }
  }

  // Crossfade boundary over seamSamples
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
// BMW M4 GT3 EVO (BMW P58 3.0L Twin-Turbo Inline-6 GT3 Engine)
// Dedicated GT3 Race Car Profile:
// - Sharp, explosive combustion flame front (10.5:1 compression)
// - Open 3-into-1 racing header pipe resonance (4.2 ms delay)
// - Aggressive 3rd and 5th harmonic dry metallic cylinder rasp
// - Raw unbaffled exhaust crackle & crisp overrun deceleration
// -------------------------------------------------------------
function synthesizeP58Band(rpm: number, isOnLoad: boolean): Float32Array {
  const config: CombustionConfig = {
    cylinders: 6,
    firingOrderOffsets: [0, 120, 240, 360, 480, 600], // 1-5-3-6-2-4 standard I6
    wiebeA: isOnLoad ? 1.85 : 1.45,
    wiebeB: isOnLoad ? 3.6 : 2.9,
    pulseWidthDeg: isOnLoad ? 86 : 98,
    exhaustPipeDelaySec: 0.0042, // 4.2 ms short open racing pipe
    exhaustReflection: isOnLoad ? 0.74 : 0.56,
    intakeWeight: isOnLoad ? 0.32 : 0.18,
    mechanicalWeight: isOnLoad ? 0.22 : 0.14,
    turbulenceWeight: isOnLoad ? 0.28 : 0.18,
    raspHarmonic: 3.0,
    raspWeight: isOnLoad ? 0.42 : 0.22,
    highMetallicHarmonic: 5.0,
    highMetallicWeight: isOnLoad ? 0.28 : 0.12,
    saturation: isOnLoad ? 1.75 : 1.35,
    filterCutoffHz: isOnLoad ? 6400 : 4500,
  };

  return synthesizePhysicalCombustionLoop(rpm, isOnLoad, config);
}

const bmwBands = [
  { rpm: 900,  name: 'idle' },
  { rpm: 1400, name: 'low' },
  { rpm: 2200, name: 'mid_low' },
  { rpm: 3200, name: 'mid' },
  { rpm: 4400, name: 'mid_high' },
  { rpm: 5800, name: 'high' },
  { rpm: 7500, name: 'redline' },
];

const bmwOutDir = join(process.cwd(), 'public', 'audio', 'bmw_m4_gt3');
mkdirSync(bmwOutDir, { recursive: true });

console.log('Generating Physical 4-Stroke BMW P58 GT3 Combustion Audio Loops in', bmwOutDir);

for (const band of bmwBands) {
  const onData = synthesizeP58Band(band.rpm, true);
  const offData = synthesizeP58Band(band.rpm, false);

  const onWav = encodeWav(onData);
  const offWav = encodeWav(offData);

  writeFileSync(join(bmwOutDir, `${band.name}_on.wav`), onWav);
  writeFileSync(join(bmwOutDir, `${band.name}_off.wav`), offWav);

  console.log(`Generated ${band.name}_on.wav (${band.rpm} RPM On-Load) and ${band.name}_off.wav (${band.rpm} RPM Off-Load)`);
}

console.log('BMW audio generation complete!');
