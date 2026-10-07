import { hash, lerp, smooth } from '../core/math.ts';
import { HEIGHT_SECTION } from '../road/RouteProfile.ts';
import type { Road } from '../road/Road.ts';
import { fieldRegion, fieldRegionWeights } from '../road/Landscape.ts';

export type TreeKind = 'oak_mature' | 'ash_mature' | 'roadside' | 'pine_tall';

export function vistaWeight(road: Road, s: number) {
  const knot = Math.round(s / HEIGHT_SECTION) * HEIGHT_SECTION;
  const crest = road.height(knot) > road.height(knot - 700) && road.height(knot) > road.height(knot + 700);
  return Math.max(1 - smooth((s - 700) / 650), crest ? 1 - smooth(Math.abs(s - knot) / 650) : 0);
}

export function meadowWeight(road: Road, s: number) {
  const section = Math.floor(s / 1600),
    t = s / 1600 - section;
  return Math.max(vistaWeight(road, s), lerp(hash(section, road.seed + 410), hash(section + 1, road.seed + 410), smooth(t)));
}

/** Get field region character at a position for grass/terrain variation */
export function getFieldRegion(road: Road, s: number, offset: number): { region: number; weights: { fresh: number; dry: number; wild: number; pasture: number } } {
  const weights = fieldRegionWeights(road, s, offset);
  const region = fieldRegion(road, s, offset);
  return { region, weights };
}

/** Field region parameters for grass rendering */
export function getFieldRegionParams(road: Road, s: number, offset: number): {
  colorTint: { r: number; g: number; b: number };
  heightScale: number;
  densityScale: number;
} {
  const { weights } = getFieldRegion(road, s, offset);
  
  // Fresh Meadow: richer green, dense, moderate height
  const freshColor = { r: 0.18, g: 0.28, b: 0.10 };
  const freshHeight = 1.05;
  const freshDensity = 1.0;
  
  // Dry Meadow: olive/straw, thinner, shorter
  const dryColor = { r: 0.24, g: 0.28, b: 0.11 };
  const dryHeight = 0.85;
  const dryDensity = 0.75;
  
  // Wild Meadow: mixed heights, irregular density, weeds
  const wildColor = { r: 0.20, g: 0.26, b: 0.11 };
  const wildHeight = 1.15;
  const wildDensity = 0.9;
  
  // Open Pasture: shorter, lower density, smoother
  const pastureColor = { r: 0.22, g: 0.30, b: 0.12 };
  const pastureHeight = 0.75;
  const pastureDensity = 0.65;
  
  const colorTint = {
    r: weights.fresh * freshColor.r + weights.dry * dryColor.r + weights.wild * wildColor.r + weights.pasture * pastureColor.r,
    g: weights.fresh * freshColor.g + weights.dry * dryColor.g + weights.wild * wildColor.g + weights.pasture * pastureColor.g,
    b: weights.fresh * freshColor.b + weights.dry * dryColor.b + weights.wild * wildColor.b + weights.pasture * pastureColor.b,
  };
  
  const heightScale = weights.fresh * freshHeight + weights.dry * dryHeight + weights.wild * wildHeight + weights.pasture * pastureHeight;
  const densityScale = weights.fresh * freshDensity + weights.dry * dryDensity + weights.wild * wildDensity + weights.pasture * pastureDensity;
  
  return { colorTint, heightScale, densityScale };
}

export interface TreePlacement {
  s: number;
  offset: number;
  height: number;
  kind: TreeKind;
  pine: boolean;
  rotation: number;
  canopyRadius: number;
  leafLoad: number;
  clusterId: number;
  hasUndergrowth: boolean;
}

/** Composes an asymmetric, rhythmic driving landscape.
 * Left and right sides are generated through independent random streams with
 * macro-scale composition zones to eliminate mirroring and repetitive placement.
 * Generates isolated landmark trees, loose 3-6 tree groups, 7-15 tree clusters,
 * 15-30 tree groves, distant tree lines, and short tree-rich/forest-edge sections,
 * interspersed with intentional open meadow negative space.
 * Fully deterministic: same results whether queried per-chunk or full-range. */
export function treePlacements(road: Road, start: number, end: number): TreePlacement[] {
  const out: TreePlacement[] = [];

  // DUAL-STREAM INDEPENDENT PLACEMENT GENERATORS
  // Left side (side = -1) and Right side (side = 1) have distinct spatial steps,
  // distinct prime seeds, and uncorrelated composition rhythms.
  const sides = [
    { side: -1, step: 155, seedOffset: 104729 },
    { side: 1, step: 185, seedOffset: 224737 },
  ];

  for (const { side, step, seedOffset } of sides) {
    const minId = Math.floor((start - 240) / step);
    const maxId = Math.floor((end + 240) / step);

    for (let id = minId; id <= maxId; id++) {
      const key = id * 53 + road.seed + seedOffset;
      const centre = id * step + 30 + hash(key, 101) * (step - 50);

      // Skip early opening (0..1500m) where open grassland is preserved
      if (centre < 1520) continue;

      // Crest panorama (5750..6250m) stays completely clear for sweeping vista
      if (Math.abs(centre - 6000) < 480) continue;

      // Valley floor basin (13000..17000m) - keep mostly open for basin view
      if (centre > 13000 && centre < 17000 && Math.abs(side * 1400) < 2000) continue;

      const isHighVista = vistaWeight(road, centre) > 0.38;
      const w = road.weights(centre);
      const isCoast = w.coast > 0.18;
      // Prevent tree spawning into ocean on coastal beach side
      if (isCoast && side === -1) continue;

      // Macro-scale composition zone (600m scale) determines the visual landscape character
      const zoneIdx = Math.floor(centre / 600);
      const zoneRoll = hash(zoneIdx * 43 + seedOffset, 201);

      // Chapter roll within zone
      const chapterRoll = hash(key, 102);

      // Determine if this zone is a special geography zone
      const inValleyApproach = centre > 4000 && centre < 7000; // Approach to crest
      const atCrest = Math.abs(centre - 6000) < 800; // Crest area
      const inValleyRim = centre > 10000 && centre < 20000 && Math.abs(side * 1400) < 3000; // Valley rim
      const inValleyFloor = centre > 13000 && centre < 17000; // Valley floor
      const inMountainZone = centre > 40000; // Distant mountains

      type ClusterStyle = 'open_negative' | 'isolated_landmark' | 'loose_group' | 'cluster' | 'grove' | 'roadside_edge' | 'distant_line' | 'forest_edge' | 'valley_rim' | 'crest_landmark';
      let clusterStyle: ClusterStyle;

      // Special geography zones with deterministic composition
      if (atCrest && Math.abs(centre - 6000) < 300 && hash(key, 999) < 0.15) {
        // Crest landmark trees - deterministic based on zone/key
        clusterStyle = 'crest_landmark';
      } else if (inValleyRim && hash(key, 998) < 0.25) {
        // Valley rim tree lines
        clusterStyle = 'valley_rim';
      } else if (inValleyFloor && hash(key, 997) < 0.1) {
        // Very sparse valley floor edge clusters
        clusterStyle = 'loose_group';
      } else if (isHighVista) {
        // In high vista areas, only place distant tree lines to frame the sweeping horizon
        clusterStyle = chapterRoll < 0.45 ? 'distant_line' : 'open_negative';
      } else if (inMountainZone) {
        // Mountain zones: more pines, forest edges, tree lines
        if (chapterRoll < 0.2) clusterStyle = 'open_negative';
        else if (chapterRoll < 0.45) clusterStyle = 'cluster';
        else if (chapterRoll < 0.7) clusterStyle = 'grove';
        else if (chapterRoll < 0.85) clusterStyle = 'forest_edge';
        else clusterStyle = 'distant_line';
      } else if (zoneRoll < 0.22) {
        // Zone A: Pure Open Meadow / Countryside (Large negative space)
        if (chapterRoll < 0.15) clusterStyle = 'isolated_landmark';
        else if (chapterRoll < 0.3) clusterStyle = 'distant_line';
        else clusterStyle = 'open_negative';
      } else if (zoneRoll < 0.52) {
        // Zone B: Scattered Meadow & Loose Groves
        if (chapterRoll < 0.2) clusterStyle = 'open_negative';
        else if (chapterRoll < 0.45) clusterStyle = 'isolated_landmark';
        else if (chapterRoll < 0.8) clusterStyle = 'loose_group';
        else clusterStyle = 'roadside_edge';
      } else if (zoneRoll < 0.80) {
        // Zone C: Medium Woodland Country
        if (chapterRoll < 0.15) clusterStyle = 'open_negative';
        else if (chapterRoll < 0.35) clusterStyle = 'loose_group';
        else if (chapterRoll < 0.65) clusterStyle = 'cluster';
        else if (chapterRoll < 0.8) clusterStyle = 'roadside_edge';
        else clusterStyle = 'distant_line';
      } else {
        // Zone D: Tree-Rich Section (Occasional large loose groves and staggered clusters)
        if (chapterRoll < 0.1) clusterStyle = 'open_negative';
        else if (chapterRoll < 0.3) clusterStyle = 'loose_group';
        else if (chapterRoll < 0.6) clusterStyle = 'cluster';
        else if (chapterRoll < 0.8) clusterStyle = 'grove';
        else if (chapterRoll < 0.9) clusterStyle = 'forest_edge';
        else clusterStyle = 'roadside_edge';
      }

      if (clusterStyle === 'open_negative') continue;

      let count = 1;
      let baseOffset = 0;
      let spreadS = 20;
      let spreadO = 15;
      let minSeparation = 11.0;

      switch (clusterStyle) {
        case 'crest_landmark':
          // Exactly 1-2 landmark trees at the crest, framing the view
          count = 1 + Math.floor(hash(key, 104) * 2); // 1-2 trees
          baseOffset = side * (75 + hash(key, 103) * 50);
          spreadS = 40;
          spreadO = 25;
          minSeparation = 15.0;
          break;
        case 'valley_rim':
          // Tree line along valley rim
          count = 4 + Math.floor(hash(key, 104) * 8); // 4-11 trees
          baseOffset = side * (1300 + hash(key, 103) * 200);
          spreadS = 200 + count * 20;
          spreadO = 60;
          minSeparation = 16.0;
          break;
        case 'isolated_landmark':
          count = 1;
          baseOffset = side * (45 + hash(key, 103) * 80);
          break;
        case 'loose_group':
          count = 3 + Math.floor(hash(key, 104) * 4); // 3 to 6 trees
          baseOffset = side * (50 + hash(key, 103) * 70);
          spreadS = 60 + count * 10;
          spreadO = 35 + count * 7;
          minSeparation = 12.0;
          break;
        case 'cluster':
          count = 7 + Math.floor(hash(key, 104) * 8); // 7 to 14 trees
          baseOffset = side * (65 + hash(key, 103) * 85);
          spreadS = 95 + count * 12;
          spreadO = 50 + count * 8;
          minSeparation = 13.0;
          break;
        case 'grove':
          count = 15 + Math.floor(hash(key, 104) * 15); // 15 to 29 trees
          baseOffset = side * (90 + hash(key, 103) * 100);
          spreadS = 160 + count * 12;
          spreadO = 75 + count * 8;
          minSeparation = 14.0;
          break;
        case 'roadside_edge':
          count = 2 + Math.floor(hash(key, 104) * 3); // 2 to 4 trees
          baseOffset = side * (24 + hash(key, 103) * 14);
          spreadS = 45 + count * 9;
          spreadO = 12;
          minSeparation = 12.5;
          break;
        case 'distant_line':
          count = 5 + Math.floor(hash(key, 104) * 8); // 5 to 12 trees
          baseOffset = side * (200 + hash(key, 103) * 150);
          spreadS = 150 + count * 18;
          spreadO = 40;
          minSeparation = 15.0;
          break;
        case 'forest_edge':
          count = 10 + Math.floor(hash(key, 104) * 10); // 10 to 19 trees
          baseOffset = side * (120 + hash(key, 103) * 60);
          spreadS = 120 + count * 10;
          spreadO = 55 + count * 6;
          minSeparation = 12.0;
          break;
      }

      const placedInCluster: { s: number; o: number }[] = [];

      for (let t = 0; t < count; t++) {
        const q = key + t * 811;
        let s = centre;
        let o = baseOffset;

        if (count > 1) {
          // Poisson-like distribution with guaranteed minimum spacing between trunks
          let attempts = 0;
          let valid = false;
          while (attempts < 10 && !valid) {
            const tryS = centre + (hash(q + attempts * 17, 105) - 0.5) * spreadS;
            const tryO = baseOffset + (hash(q + attempts * 17, 106) - 0.5) * spreadO;
            valid = true;
            for (const prev of placedInCluster) {
              if (Math.hypot(tryS - prev.s, tryO - prev.o) < minSeparation) {
                valid = false;
                break;
              }
            }
            if (valid || attempts === 9) {
              s = tryS;
              o = tryO;
              break;
            }
            attempts++;
          }
        }

        placedInCluster.push({ s, o });

        if (Math.abs(o) < 19.5) continue; // Keep road shoulder completely clear

        const elevation = road.terrainSurface(s, o);
        if (elevation < 8.5) continue; // Above water level

        // Slope check: prevent spawning on sheer cliffs
        const along = (road.terrainSurface(s + 2, o) - road.terrainSurface(s - 2, o)) / 4;
        const across = (road.terrainSurface(s, o + 2) - road.terrainSurface(s, o - 2)) / 4;
        if (Math.hypot(along, across) > 0.68) continue;

        // Species determination & Scale (towering mature trees)
        const speciesRoll = hash(q, 107);
        let kind: TreeKind;
        let height: number;
        let canopyRadius: number;
        let leafLoad: number;

        // Valley rim areas: more pines
        const isValleyRim = clusterStyle === 'valley_rim';
        // Mountain zones: more pines
        const isMountainZone = centre > 40000;
        // Crest landmarks: always oak
        const isCrestLandmark = clusterStyle === 'crest_landmark';

        if (isCrestLandmark) {
          // Majestic Mature Oak at crest
          kind = 'oak_mature';
          height = 24.0 + hash(q, 108) * 5;
          canopyRadius = 11.0 + hash(q, 109) * 3;
          leafLoad = 0.98;
        } else if ((w.country > 0.4 || isValleyRim || isMountainZone) && speciesRoll > 0.65) {
          // Tall Pine in mountain/countryside/valley rim terrain (Evergreen)
          kind = 'pine_tall';
          height = 23.0 + hash(q, 108) * 8;
          canopyRadius = 5.2 + hash(q, 109) * 2.5;
          leafLoad = 0.08;
        } else if (clusterStyle === 'roadside_edge' && t === 0) {
          kind = 'roadside';
          height = 14.5 + hash(q, 108) * 3.5;
          canopyRadius = 6.8 + hash(q, 109) * 2.2;
          leafLoad = 0.85;
        } else if (speciesRoll > 0.45) {
          // Majestic Mature Oak (Deciduous Autumn)
          kind = 'oak_mature';
          height = 20.0 + hash(q, 108) * 6.5;
          canopyRadius = 9.2 + hash(q, 109) * 4.0;
          leafLoad = 0.95;
        } else {
          // Elegant Mature Ash (Deciduous Autumn)
          kind = 'ash_mature';
          height = 18.5 + hash(q, 108) * 5.0;
          canopyRadius = 7.8 + hash(q, 109) * 3.2;
          leafLoad = 0.88;
        }

        // Only emit trees that fall strictly within [start, end)
        if (s >= start && s < end) {
          out.push({
            s,
            offset: o,
            height,
            kind,
            pine: kind === 'pine_tall',
            rotation: hash(q, 110) * Math.PI * 2,
            canopyRadius,
            leafLoad,
            clusterId: id,
            hasUndergrowth: (clusterStyle === 'cluster' || clusterStyle === 'grove' || clusterStyle === 'forest_edge' || clusterStyle === 'loose_group' || clusterStyle === 'valley_rim') && (t === 0 || t === 1),
          });
        }
      }
    }
  }

  return out;
}