import { clamp, hash, lerp, smooth } from '../core/math.ts';
import type { Road } from './Road.ts';

export const SEA_LEVEL = 7.4;
export const CORRIDOR_HALF = 12;
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Seeded coherent 2D value noise: no sinusoidal repeating hills or chunk seeds. */
export function landscapeNoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y), u = fade(x - ix), v = fade(y - iy);
  const a = hash(Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663), seed);
  const b = hash(Math.imul(ix + 1, 73856093) ^ Math.imul(iy, 19349663), seed);
  const c = hash(Math.imul(ix, 73856093) ^ Math.imul(iy + 1, 19349663), seed);
  const d = hash(Math.imul(ix + 1, 73856093) ^ Math.imul(iy + 1, 19349663), seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** FBM for multi-scale terrain */
function fbm(x: number, y: number, seed: number, octaves = 4, lacunarity = 2.1, gain = 0.5) {
  let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * landscapeNoise(x * frequency, y * frequency, seed);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / maxValue;
}

/** Ridge noise for mountain ridges */
function ridgeNoise(x: number, y: number, seed: number, octaves = 4) {
  let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    const n = Math.abs(landscapeNoise(x * frequency, y * frequency, seed) * 2 - 1);
    value += amplitude * (1 - n);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value / maxValue;
}

export function shoreDistance(s: number, seed: number) {
  const reveal = smooth((s - 3000) / 3500);
  const approach = smooth((s - 6500) / 11500);
  const undulation = landscapeNoise(s / 1500, 3.7, seed + 451) - .5;
  return lerp(9000, 1800, reveal) - 1580 * approach + undulation * 180 * reveal;
}
export function beachWidth(s: number, seed: number) { return 22 + 26 * landscapeNoise(s / 360, 1.9, seed + 617); }

/** Keep the near corridor in the driving frame, then flatten the distant
 * cross-sections into world X/Z. Kilometre-wide rotated road normals otherwise
 * fold over one another on bends. This does not change Road.point(). */
export function landscapePoint(road: Road, s: number, offset: number) {
  const h = road.heading(s), far = smooth((Math.abs(offset) - 80) / 240);
  return { x: road.center(s) + offset * lerp(Math.cos(h), 1, far), z: -s + Math.sin(h) * offset * (1 - far) };
}
export function coastPoint(road: Road, s: number) { return { x: road.center(s) - shoreDistance(s, road.seed), z: -s }; }
function coastalSample(road: Road, s: number, offset: number, landscapeFrame: boolean) {
  const p = landscapeFrame ? landscapePoint(road, s, offset) : road.point(s, offset), worldS = -p.z;
  return { worldS, x: p.x, inland: p.x - coastPoint(road, worldS).x };
}

/** Regional field character zones for meadow variation */
export function fieldRegion(road: Road, s: number, offset: number): number {
  const sample = coastalSample(road, s, offset, true);
  // Large-scale field region mask: 300m-1500m scale patches
  const regionNoise = fbm(sample.worldS / 1200, sample.x / 900, road.seed + 888, 3, 2.0, 0.55);
  // 0: fresh meadow, 1: dry meadow, 2: wild meadow, 3: open pasture
  return Math.floor(regionNoise * 4);
}

/** Field region blend weights for smooth transitions */
export function fieldRegionWeights(road: Road, s: number, offset: number): { fresh: number; dry: number; wild: number; pasture: number } {
  const sample = coastalSample(road, s, offset, true);
  const n1 = fbm(sample.worldS / 1200, sample.x / 900, road.seed + 888, 3, 2.0, 0.55);
  const n2 = fbm(sample.worldS / 800, sample.x / 600, road.seed + 777, 2, 2.2, 0.5);
  
  // Four-region smooth blending
  const fresh = smooth(1 - n1 * 1.2 + n2 * 0.3);
  const dry = smooth(n1 * 0.8 - 0.2 + n2 * 0.2);
  const wild = smooth(n1 * 0.5 - 0.3 + n2 * 0.4);
  const pasture = smooth(1 - fresh * 0.7 - dry * 0.5 - wild * 0.4);
  
  const sum = fresh + dry + wild + pasture;
  return { fresh: fresh / sum, dry: dry / sum, wild: wild / sum, pasture: pasture / sum };
}

/** Distant mountain backdrop system - kilometre-scale silhouettes */
function mountainBackdrop(road: Road, s: number, offset: number): number {
  const sample = coastalSample(road, s, offset, true);
  const worldS = sample.worldS;
  const worldX = sample.x;
  
  // Mountains only appear in certain longitudinal bands (not everywhere)
  // Mountain ranges centered around specific worldS positions
  const rangeCenters = [8000, 18000, 32000, 50000, 70000, 95000];
  let mountainHeight = 0;
  let mountainMask = 0;
  
  for (const center of rangeCenters) {
    const distFromCenter = Math.abs(worldS - center);
    // Mountain range influence: 4-8km wide bands
    const rangeInfluence = smooth(1 - distFromCenter / 6000);
    if (rangeInfluence < 0.01) continue;
    
    // Lateral positioning - mountains on one or both sides
    const sideSeed = hash(center + 1111, road.seed);
    const mountainSide = sideSeed > 0.5 ? 1 : -1; // Which side of road
    const lateralOffset = worldX * mountainSide;
    
    // Only show mountains on the designated side (with some bleed)
    const sideMask = smooth((lateralOffset * mountainSide + 200) / 1500);
    if (sideMask < 0.01) continue;
    
    // Mountain silhouette: broad base, asymmetric peaks, secondary peaks
    const ridge1 = ridgeNoise(worldS / 4500 + center * 0.001, lateralOffset / 3000, road.seed + center + 100, 5);
    const ridge2 = ridgeNoise(worldS / 3800 + center * 0.0013, lateralOffset / 2500, road.seed + center + 200, 4);
    const ridge3 = ridgeNoise(worldS / 6000 + center * 0.0008, lateralOffset / 4000, road.seed + center + 300, 3);
    
    // Combine ridges for complex silhouette
    const silhouette = ridge1 * 0.55 + ridge2 * 0.3 + ridge3 * 0.15;
    
    // Mountain height: 150-400m above terrain
    const baseHeight = 180 + hash(center + 555, road.seed) * 220;
    const heightVariation = silhouette * baseHeight;
    
    // Fade with lateral distance from road
    const lateralFade = smooth(1 - Math.abs(lateralOffset) / 8000);
    
    // Longitudinal fade at range edges
    const longitudinalFade = smooth(1 - distFromCenter / 8000);
    
    mountainMask = Math.max(mountainMask, rangeInfluence * sideMask * lateralFade * longitudinalFade);
    mountainHeight = Math.max(mountainHeight, heightVariation * rangeInfluence * sideMask * lateralFade * longitudinalFade);
  }
  
  return mountainHeight * mountainMask;
}

/** Major valley system - creates one significant valley experience */
function majorValley(road: Road, s: number, offset: number): { height: number; basinMask: number } {
  // Primary valley centered around s=12000-18000 (after first major crest at ~6000)
  // This creates: long climb -> broad crest -> valley reveal -> long descent
  const valleyCenter = 15000;
  const valleyWidth = 5000; // 5km wide valley
  const valleyDepth = 120;  // 120m deep
  
  const sample = coastalSample(road, s, offset, true);
  const worldS = sample.worldS;
  const worldX = sample.x;
  
  // Longitudinal position in valley
  const valleyProgress = (worldS - (valleyCenter - valleyWidth)) / (valleyWidth * 2);
  
  // Valley only active in its longitudinal range
  let valleyMask = 0;
  if (worldS > valleyCenter - valleyWidth && worldS < valleyCenter + valleyWidth) {
    valleyMask = smooth(1 - Math.abs(worldS - valleyCenter) / valleyWidth);
  }
  
  // Lateral valley shape - broad U-shape
  const lateralDist = Math.abs(worldX);
  const valleyFloorWidth = 1200; // 1.2km wide valley floor
  const valleySlopeWidth = 2000; // 2km slopes on each side
  
  let lateralMask = 0;
  if (lateralDist < valleyFloorWidth) {
    lateralMask = 1; // Valley floor
  } else if (lateralDist < valleyFloorWidth + valleySlopeWidth) {
    lateralMask = smooth(1 - (lateralDist - valleyFloorWidth) / valleySlopeWidth); // Valley slopes
  }
  
  const combinedMask = valleyMask * lateralMask;
  
  // Valley floor: flat basin (reserved for future water)
  // Valley slopes: smooth descent
  let valleyHeight = 0;
  if (lateralDist < valleyFloorWidth) {
    // Flat basin floor
    valleyHeight = -valleyDepth * combinedMask;
  } else if (lateralDist < valleyFloorWidth + valleySlopeWidth) {
    // Sloping valley walls
    const slopeProgress = (lateralDist - valleyFloorWidth) / valleySlopeWidth;
    valleyHeight = -valleyDepth * (1 - slopeProgress) * combinedMask;
  }
  
  // Basin mask for future water placement (only the flat floor area)
  const basinMask = (lateralDist < valleyFloorWidth * 0.8 && valleyMask > 0.3) ? valleyMask : 0;
  
  return { height: valleyHeight, basinMask };
}

/** Regional terrain - large hills, broad valleys, long ridges (400m-2km scale) */
function regionalTerrain(road: Road, s: number, offset: number): number {
  const sample = coastalSample(road, s, offset, true);
  const worldS = sample.worldS;
  const worldX = sample.x;
  
  // Regional landforms at 1.5-3km scales
  const macroHills = fbm(worldS / 3200, worldX / 2400, road.seed + 100, 3, 2.2, 0.5);
  const broadRidges = ridgeNoise(worldS / 2800, worldX / 2000, road.seed + 200, 4);
  const valleys = 1 - ridgeNoise(worldS / 2200, worldX / 1800, road.seed + 300, 3);
  
  // Inland opening bias - first 3.5km is open basin
  const opening = 1 - smooth((worldS - 1600) / 3800);
  
  // Combine regional features
  const regional = macroHills * 40 + broadRidges * broadRidges * 80 + valleys * valleys * 30;
  
  // Reduce regional terrain in the opening
  return regional * lerp(0.15, 1, opening);
}

/** Local terrain - gentle slopes, meadows, small elevation differences (0-400m scale) */
function localTerrain(road: Road, s: number, offset: number): number {
  const sample = coastalSample(road, s, offset, true);
  const worldS = sample.worldS;
  const worldX = sample.x;
  
  // Local variation at 200-800m scales
  const gentle = fbm(worldS / 800, worldX / 600, road.seed + 400, 3, 2.0, 0.5);
  const micro = fbm(worldS / 300, worldX / 250, road.seed + 500, 2, 2.2, 0.4);
  
  return gentle * 10 + micro * 3;
}

export function landscapeHeight(road: Road, s: number, offset: number, landscapeFrame = false) {
  const distance = Math.abs(offset), level = road.height(s) + offset * road.bank(s), seed = road.seed;
  if (distance <= CORRIDOR_HALF) return level - .055;
  
  const sample = coastalSample(road, s, offset, landscapeFrame);
  const w = road.weights(s), clearance = distance - CORRIDOR_HALF;
  
  // THREE-SCALE GEOGRAPHY HIERARCHY
  
  // A. LOCAL TERRAIN (0-400m): gentle slopes, meadows, restrained
  const local = localTerrain(road, s, offset);
  
  // B. REGIONAL TERRAIN (400m-2km): large hills, broad valleys, long ridges
  const regional = regionalTerrain(road, s, offset);
  
  // C. DISTANT LANDSCAPE (2km-8km+): mountain silhouettes, far ridges
  const mountain = mountainBackdrop(road, s, offset);
  
  // MAJOR VALLEY SYSTEM
  const valley = majorValley(road, s, offset);
  
  // Distance-based blending
  const mid = smooth((distance - 70) / 220);
  const far = smooth((distance - 280) / 750);
  const distant = smooth((distance - 1200) / 2000);
  
  // Inland opening for first 3.5km
  const opening = 1 - smooth((sample.worldS - 1600) / 3800);
  
  // Base natural terrain (without mountains/valley)
  const naturalBase = 12 + local * (1 - far) * 0.7 + regional * far * lerp(0.2, 1, 1 - opening);
  
  // Apply valley modification (valley carves into base terrain)
  const naturalWithValley = naturalBase + valley.height;
  
  // Add distant mountains on top (they rise above regional terrain)
  const natural = naturalWithValley + mountain * distant;
  
  // Smooth shoulder transition
  const delta = clamp(natural - level, -clearance * .18 - mid * 18, clearance * .28 + mid * 35);
  let ground = level - .055 + delta * smooth(clearance / 90);
  ground = lerp(ground, level - .055, w.city * smooth(clearance / 120) * .85);

  if (offset < 0) {
    const width = beachWidth(sample.worldS, seed), inland = sample.inland;
    const sand = SEA_LEVEL + inland * .065;
    const coastal = inland < 0 ? SEA_LEVEL + Math.max(-55, inland * .10) : sand;
    const coastBlend = 1 - smooth((inland - width) / 220);
    ground = lerp(ground, coastal, coastBlend);
  }
  
  // Expose basin mask for water reservation (store in a global or return via side channel)
  // We'll use a simple approach: check if we're in the basin area
  (landscapeHeight as any).lastBasinMask = valley.basinMask;
  (landscapeHeight as any).lastValleyInfo = {
    center: 15000,
    floorWidth: 1200,
    depth: 120,
    basinMask: valley.basinMask
  };
  
  return ground;
}

/** Get the last computed basin mask for water reservation */
export function getBasinMask(): number {
  return (landscapeHeight as any).lastBasinMask || 0;
}

export function getValleyInfo(): { center: number; floorWidth: number; depth: number; basinMask: number } {
  return (landscapeHeight as any).lastValleyInfo || { center: 15000, floorWidth: 1200, depth: 120, basinMask: 0 };
}

/** Continuous material weights; soil is the remaining channel. */
export function terrainLayers(road: Road, s: number, o: number, height: number, slope: number, landscapeFrame = false) {
  const sample = coastalSample(road, s, o, landscapeFrame);
  const beach = o < 0 ? (1 - smooth((sample.inland - beachWidth(sample.worldS, road.seed)) / 28)) : 0;
  const wet = beach * (1 - smooth((height - SEA_LEVEL - .15) / 1.4));
  const sand = beach * (1 - wet);
  const rock = smooth((slope - .22) / .62) * (1 - beach);
  const verge = 1 - smooth((Math.abs(o) - 9.8) / 1.6);
  const grass = (1 - beach) * (1 - rock) * (1 - verge * .75);
  return { grass, rock, sand, wet };
}