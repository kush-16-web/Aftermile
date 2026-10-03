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

function synthesizeP58Band(rpm: number, isOnLoad: boolean, sampleRate = 48000, duration = 2.0): Float32Array {
  const numSamples = Math.floor(sampleRate * duration);
  const data = new Float32Array(numSamples);
  // Fundamental firing frequency for inline-6: RPM / 60 * 3 = RPM / 20
  const f0 = rpm / 20;
  // Racing dog-ring straight-cut gearbox whine
  const fGear = (rpm / 60) * 18;
  // Turbocharger compressor spool
  const fTurbo = 2600 + rpm * 0.45;

  // Pre-generate periodic noise for racing intake/exhaust turbulence
  const noise = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    noise[i] = Math.random() * 2 - 1;
  }
  // Smooth circular wrap for seamless loop
  const noiseSeam = 1024;
  for (let i = 0; i < noiseSeam; i++) {
    const frac = 0.5 * (1 - Math.cos((i / noiseSeam) * Math.PI));
    noise[i] = noise[numSamples - noiseSeam + i] * (1 - frac) + noise[i] * frac;
    noise[numSamples - noiseSeam + i] = noise[i];
  }

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let s = 0;

    if (isOnLoad) {
      // BMW P58 3.0L Twin-Turbo Inline-6 GT3 Racing Engine Character:
      // Crisp, dry, raspy, metallic bark with strong upper harmonics and sequential gearbox whine
      s += 0.32 * Math.sin(2 * Math.PI * f0 * t);
      s += 0.34 * Math.sin(2 * Math.PI * 2 * f0 * t + 0.4);
      s += 0.38 * Math.sin(2 * Math.PI * 3 * f0 * t + 0.9); // GT3 signature aggressive 3rd harmonic
      s += 0.22 * Math.sin(2 * Math.PI * 4 * f0 * t + 1.2);
      s += 0.26 * Math.sin(2 * Math.PI * 5 * f0 * t + 0.3); // Sharp racing timbre
      s += 0.20 * Math.sin(2 * Math.PI * 6 * f0 * t + 0.8);
      s += 0.12 * Math.sin(2 * Math.PI * 8 * f0 * t + 1.5);
      s += 0.08 * Math.sin(2 * Math.PI * 9 * f0 * t + 2.1); // High metallic scream

      // Sharp asymmetric race combustion pulse
      const pulse = Math.sin(2 * Math.PI * f0 * t);
      s += 0.16 * (pulse > 0 ? Math.pow(pulse, 4) : -Math.pow(-pulse, 2));

      // Sequential straight-cut racing gearbox whine
      s += 0.05 * Math.sin(2 * Math.PI * fGear * t + 0.5);
      // Twin-turbo compressor hiss
      s += 0.03 * Math.sin(2 * Math.PI * fTurbo * t) * (1 + 0.3 * Math.sin(2 * Math.PI * f0 * t));

      // Open racing exhaust intake air turbulence
      s += noise[i] * 0.04;
    } else {
      // Off-load / deceleration: dry race overrun, engine braking, raspy pulse decay
      s += 0.40 * Math.sin(2 * Math.PI * f0 * t);
      s += 0.28 * Math.sin(2 * Math.PI * 2 * f0 * t + 0.2);
      s += 0.18 * Math.sin(2 * Math.PI * 3 * f0 * t + 0.5);
      s += 0.09 * Math.sin(2 * Math.PI * 4 * f0 * t + 0.7);
      s += 0.06 * Math.sin(2 * Math.PI * 6 * f0 * t + 1.1);

      // Decel gearbox whine
      s += 0.04 * Math.sin(2 * Math.PI * fGear * t + 0.2);

      // Burble and overrun exhaust turbulence
      s += noise[i] * 0.022;
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
  { rpm: 900, name: 'idle' },
  { rpm: 1400, name: 'low' },
  { rpm: 2200, name: 'mid_low' },
  { rpm: 3200, name: 'mid' },
  { rpm: 4400, name: 'mid_high' },
  { rpm: 5800, name: 'high' },
  { rpm: 7500, name: 'redline' },
];

const outDir = join(process.cwd(), 'public', 'audio', 'bmw_m4_gt3');
mkdirSync(outDir, { recursive: true });

console.log('Generating 7-band BMW P58 GT3 audio loops in', outDir);

for (const band of bands) {
  const onData = synthesizeP58Band(band.rpm, true);
  const offData = synthesizeP58Band(band.rpm, false);

  const onWav = encodeWav(onData);
  const offWav = encodeWav(offData);

  writeFileSync(join(outDir, `${band.name}_on.wav`), onWav);
  writeFileSync(join(outDir, `${band.name}_off.wav`), offWav);

  console.log(`Generated ${band.name}_on.wav (${band.rpm} RPM On-Load) and ${band.name}_off.wav (${band.rpm} RPM Off-Load)`);
}

console.log('BMW P58 Audio generation completed!');
