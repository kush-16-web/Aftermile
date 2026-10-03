export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const mod = (a: number, b: number) => ((a % b) + b) % b;
export function hash(n: number, seed = 16): number {
  let x = (n | 0) ^ (seed | 0);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
export function noise(x: number, seed = 16) {
  const i = Math.floor(x); return lerp(hash(i, seed), hash(i + 1, seed), smooth(x - i));
}
export function rng(seed: number) {
  let i = 0; return () => hash(++i, seed);
}
export const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const angleLerp = (a: number, b: number, t: number) => a + angleDiff(a, b) * t;
