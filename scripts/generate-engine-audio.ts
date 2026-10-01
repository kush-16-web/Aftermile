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

function synthesizeBand(rpm: number, isOnLoad: boolean, sampleRate = 48000, duration = 2.0): Float32Array {
  const numSamples = Math.floor(sampleRate * duration);
  const data = new Float32Array(numSamples);
  // Fundamental firing frequency for inline-6: RPM / 60 * 3 = RPM / 20
  const f0 = rpm / 20;

  // Pre-generate periodic noise for smooth turbulence
  const noise = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    noise[i] = Math.random() * 2 - 1;
  }
  // Smooth circular wrap for noise
  const noiseSeam = 1024;
  for (let i = 0; i < noiseSeam; i++) {
    const frac = 0.5 * (1 - Math.cos((i / noiseSeam) * Math.PI));
    noise[i] = noise[numSamples - noiseSeam + i] * (1 - frac) + noise[i] * frac;
    noise[numSamples - noiseSeam + i] = noise[i];
  }

  // Harmonically rich inline-6 synthesis with exact integer periods across 2.0s
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let s = 0;

    if (isOnLoad) {
      // On-load: strong 1st, 2nd, 3rd, 4th, 6th harmonics, intake growl, sharp combustion pulses
      s += 0.35 * Math.sin(2 * Math.PI * f0 * t);
      s += 0.28 * Math.sin(2 * Math.PI * 2 * f0 * t + 0.3);
      s += 0.32 * Math.sin(2 * Math.PI * 3 * f0 * t + 0.7); // inline-6 signature rasp
      s += 0.18 * Math.sin(2 * Math.PI * 4 * f0 * t + 1.1);
      s += 0.15 * Math.sin(2 * Math.PI * 6 * f0 * t + 0.5); // valve train & twin turbo
      s += 0.08 * Math.sin(2 * Math.PI * 8 * f0 * t + 1.8);
      // Asymmetric combustion pressure wave
      s += 0.12 * Math.pow(Math.max(0, Math.sin(2 * Math.PI * f0 * t)), 3);
      // Subtle intake turbulence noise
      s += noise[i] * 0.035;
    } else {
      // Off-load / coasting: deeper fundamental, mellow 2nd/3rd harmonics, soft exhaust overrun
      s += 0.45 * Math.sin(2 * Math.PI * f0 * t);
      s += 0.25 * Math.sin(2 * Math.PI * 2 * f0 * t + 0.2);
      s += 0.14 * Math.sin(2 * Math.PI * 3 * f0 * t + 0.4);
      s += 0.06 * Math.sin(2 * Math.PI * 4 * f0 * t + 0.8);
      s += noise[i] * 0.015;
    }

    data[i] = s;
  }

  // Remove DC offset
  let dc = 0;
  for (let i = 0; i < numSamples; i++) dc += data[i];
  dc /= numSamples;
  for (let i = 0; i < numSamples; i++) data[i] -= dc;

  // Normalize peak to 0.45
  let peak = 0;
  for (let i = 0; i < numSamples; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) {
    const scale = 0.45 / peak;
    for (let i = 0; i < numSamples; i++) data[i] *= scale;
  }

  return data;
}

const bands = [
  { rpm: 850, name: 'idle' },
  { rpm: 1250, name: 'low' },
  { rpm: 1800, name: 'mid_low' },
  { rpm: 2600, name: 'mid' },
  { rpm: 3700, name: 'mid_high' },
  { rpm: 5200, name: 'high' },
  { rpm: 7000, name: 'redline' },
];

const outDir = join(process.cwd(), 'public', 'audio', 'r34');
mkdirSync(outDir, { recursive: true });

console.log('Generating 7-band RB26 audio loops in', outDir);

for (const band of bands) {
  const onData = synthesizeBand(band.rpm, true);
  const offData = synthesizeBand(band.rpm, false);

  const onWav = encodeWav(onData);
  const offWav = encodeWav(offData);

  writeFileSync(join(outDir, `${band.name}_on.wav`), onWav);
  writeFileSync(join(outDir, `${band.name}_off.wav`), offWav);

  console.log(`Generated ${band.name}_on.wav (${band.rpm} RPM On-Load) and ${band.name}_off.wav (${band.rpm} RPM Off-Load)`);
}

console.log('Done!');
