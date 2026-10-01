import { hash, lerp, mod, smooth } from '../core/math.ts';

export type Biome = 'coast' | 'country' | 'bridge' | 'city' | 'tunnel' | 'plains';
export const CHUNK = 160;
export const ROAD_HALF = 8;
export const REGION_LENGTH = 2400;
const sequence: Biome[] = ['coast', 'country', 'bridge', 'city', 'tunnel', 'plains'];
const names: Record<Biome, string[]> = {
  coast: ['Ember Coast', 'Crescent Bay', 'Stillwater Shore'],
  country: ['Cypress Valley', 'Golden Meadows', 'Juniper Hills'],
  bridge: ['Aster Crossing', 'Silver Inlet', 'Horizon Bridge'],
  city: ['Midnight Metropolis', 'Nova District', 'Glass Harbor'],
  tunnel: ['Echo Ridge', 'Obsidian Pass', 'Northlight Tunnel'],
  plains: ['Open Country', 'Sundown Plains', 'Bluebird Basin'],
};
export class Road {
  constructor(public seed = 1616) {}
  region(s: number) {
    const index = Math.floor(Math.max(0, s) / REGION_LENGTH);
    const cycle = Math.floor(index / sequence.length);
    const n = index % sequence.length;
    // The first trip pays tribute to the extension; later trips change order.
    const shift = cycle === 0 ? 0 : Math.floor(hash(cycle, this.seed) * 6);
    const biome = sequence[(n + shift) % sequence.length];
    return { index, biome, name: names[biome][Math.floor(hash(index + 4, this.seed) * 3)], progress: mod(s, REGION_LENGTH) / REGION_LENGTH };
  }
  weights(s: number) {
    const r = this.region(s), next = this.region(s + 350);
    const blend = smooth((r.progress * REGION_LENGTH - (REGION_LENGTH - 350)) / 350);
    const out = { coast: 0, country: 0, bridge: 0, city: 0, tunnel: 0, plains: 0 };
    out[r.biome] += 1 - blend; out[next.biome] += blend;
    return out;
  }
  center(s: number) {
    const p = this.seed * 0.014;
    return 92 * Math.sin(s * 0.00125 + p) + 35 * Math.sin(s * 0.0031 + p * 2) + 16 * Math.sin(s * 0.00037 + p);
  }
  slope(s: number) {
    const p = this.seed * 0.014;
    return 0.115 * Math.cos(s * 0.00125 + p) + 0.1085 * Math.cos(s * 0.0031 + p * 2) + 0.00592 * Math.cos(s * 0.00037 + p);
  }
  heading(s: number) { return Math.atan(this.slope(s)); }
  height(s: number) { return 18 + 7 * Math.sin(s * 0.0011 + 0.9) + 3 * Math.sin(s * 0.0026); }
  grade(s: number) { return 0.0077 * Math.cos(s * 0.0011 + 0.9) + 0.0078 * Math.cos(s * 0.0026); }
  bank(s: number) { return (this.heading(s + 4) - this.heading(s - 4)) * 9; }
  point(s: number, offset = 0, lift = 0) {
    const h = this.heading(s);
    return { x: this.center(s) + Math.cos(h) * offset, y: this.height(s) + lift + offset * this.bank(s), z: -s + Math.sin(h) * offset };
  }
  isBridge(s: number) {
    const r = this.region(s);
    return (r.biome === 'bridge' && r.progress > .12 && r.progress < .82) || (r.biome === 'coast' && r.progress > .68 && r.progress < .78);
  }
  isTunnel(s: number) { const r = this.region(s); return r.biome === 'tunnel' && r.progress > .14 && r.progress < .82; }
  hasGuardrail(s: number, side: -1 | 1): boolean {
    if (this.isBridge(s) || this.isTunnel(s)) return true;
    const station = this.station(s - 50);
    if (Math.abs(station - s) < 65 && side === 1) return false;
    const w = this.weights(s);
    if (side === -1 && w.coast > 0.15) return true; // Coast ocean side
    if (w.city > 0.20 || w.bridge > 0.10) return true;
    // Curves and embankments
    const curve = Math.abs(this.bank(s));
    const grade = Math.abs(this.grade(s));
    const index = Math.floor(s / CHUNK);
    return curve > 0.025 || grade > 0.0075 || (index % 2 === 0);
  }
  terrain(s: number, offset: number) {
    const w = this.weights(s), distance = Math.abs(offset);
    const roadLevel = this.height(s) + offset * this.bank(s);
    const edge = smooth((distance - 9.8) / 35);
    const hill = (Math.sin(s * .006 + offset * .008) * 11 + Math.cos(s * .0017 - offset * .013) * 15 + Math.sin(offset * .005 + s * .003) * 22);
    const naturalTerrain = this.height(s) + (hill + 3) * (1 - w.city * .8);
    const country = lerp(roadLevel, naturalTerrain, edge);
    const waterSide = offset < 0 ? w.coast : 0;
    const depth = Math.max(w.bridge * .95, waterSide);
    let ground = lerp(country, 6.2 + Math.sin(s * .008) * 0.8, depth * smooth((distance - 12) / 28));
    if (this.isBridge(s)) ground = lerp(ground, 2.5, smooth((distance - 9.5) / 5.5));
    return ground;
  }
  station(s: number) {
    const cycle = Math.floor((s - 650) / 1600);
    for(let i=cycle; i<=cycle+2; i++) {
      const at = 650 + i * 1600;
      if (at > s - 55 && at > 0 && !this.isBridge(at) && !this.isTunnel(at)) return at;
    }
    return s + 3000;
  }
}
