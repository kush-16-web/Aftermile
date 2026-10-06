import { hash, lerp, mod, smooth } from '../core/math.ts';
import { REGION_SPAN, routeProfile } from './RouteProfile.ts';
import { coastPoint, landscapeHeight, landscapePoint, shoreDistance } from './Landscape.ts';

export type Biome = 'coast' | 'country' | 'bridge' | 'city' | 'tunnel' | 'plains';
export const CHUNK = 160;
export const ROAD_HALF = 8;
export const REGION_LENGTH = REGION_SPAN;
// Natural landscapes lead the journey. Existing bridge/tunnel/city APIs remain
// available to traffic and navigation; no new city systems are introduced.
const sequence: Biome[] = ['plains', 'country', 'plains', 'country', 'coast', 'country', 'coast'];
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
    const shift = cycle === 0 ? 0 : Math.floor(hash(cycle, this.seed) * sequence.length);
    const biome = sequence[(n + shift) % sequence.length];
    return { index, biome, name: names[biome][Math.floor(hash(index + 4, this.seed) * 3)], progress: mod(s, REGION_LENGTH) / REGION_LENGTH };
  }
  weights(s: number) {
    const r = this.region(s), next = this.region(s + 1200);
    const blend = smooth((r.progress * REGION_LENGTH - (REGION_LENGTH - 1200)) / 1200);
    const out = { coast: 0, country: 0, bridge: 0, city: 0, tunnel: 0, plains: 0 };
    out[r.biome] += 1 - blend; out[next.biome] += blend;
    return out;
  }
  center(s: number) { return routeProfile(s, this.seed); }
  slope(s: number) { return routeProfile(s, this.seed, false, 1); }
  heading(s: number) { return Math.atan(this.slope(s)); }
  height(s: number) { return routeProfile(s, this.seed, true); }
  grade(s: number) { return routeProfile(s, this.seed, true, 1); }
  bank(s: number) { return (this.heading(s + 4) - this.heading(s - 4)) * 9; }
  point(s: number, offset = 0, lift = 0) {
    const h = this.heading(s);
    return { x: this.center(s) + Math.cos(h) * offset, y: this.height(s) + lift + offset * this.bank(s), z: -s + Math.sin(h) * offset };
  }
  // Infrastructure is deliberately dormant for the scenic first push.
  // Keep the APIs for the frozen consumers and future geography-driven pass.
  isBridge(_s: number) { return false; }
  isTunnel(_s: number) { return false; }
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
    return curve > 0.018 || grade > 0.018;
  }
  terrain(s: number, offset: number) {
    return landscapeHeight(this,s,offset);
  }
  terrainPoint(s:number,offset:number){return landscapePoint(this,s,offset);}
  terrainSurface(s:number,offset:number){return landscapeHeight(this,s,offset,true);}
  coastPoint(s:number){return coastPoint(this,s);}
  shoreline(s:number){return shoreDistance(s,this.seed);}
  station(_s: number) { return Number.POSITIVE_INFINITY; }
}
