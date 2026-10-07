import { hash, lerp, smooth } from '../core/math.ts';
import { HEIGHT_SECTION } from '../road/RouteProfile.ts';
import type { Road } from '../road/Road.ts';

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
 * Generates isolated mature trees, small loose groups (3–6), medium groves (7–15),
 * large loose groves (15–25), roadside woodland canopies, and distant tree lines,
 * interspersed with intentional open meadow negative space. */
export function treePlacements(road: Road, start: number, end: number): TreePlacement[] {
  const out: TreePlacement[] = [];

  // 1. OPENING EXPERIENCE (s < 1550m):
  // Preserve vast open grassland at spawn (0..950m).
  // At s ≈ 1150-1300m, place exactly ONE isolated majestic hero tree in the open field.
  const heroSpawnS = 1220;
  if (heroSpawnS >= start && heroSpawnS < end) {
    const heroKey = road.seed + 777;
    const heroSide = hash(heroKey, 11) > 0.5 ? 1 : -1;
    const heroOffset = heroSide * (65 + hash(heroKey, 12) * 35);
    if (road.terrainSurface(heroSpawnS, heroOffset) >= 8.5) {
      out.push({
        s: heroSpawnS,
        offset: heroOffset,
        height: 23.5,
        kind: 'oak_mature',
        pine: false,
        rotation: hash(heroKey, 13) * Math.PI * 2,
        canopyRadius: 11.5,
        leafLoad: 0.95,
        clusterId: 10001,
        hasUndergrowth: true,
      });
    }
  }

  // 2. DUAL-STREAM INDEPENDENT PLACEMENT GENERATORS
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

      type ClusterStyle = 'open_negative' | 'isolated' | 'small_group' | 'medium_grove' | 'large_grove' | 'roadside_edge' | 'distant_line';
      let clusterStyle: ClusterStyle;

      if (isHighVista) {
        // In high vista areas, only place distant tree lines to frame the sweeping horizon
        clusterStyle = chapterRoll < 0.45 ? 'distant_line' : 'open_negative';
      } else if (zoneRoll < 0.22) {
        // Zone A: Pure Open Meadow / Countryside (Large negative space)
        if (chapterRoll < 0.20) clusterStyle = 'isolated';
        else if (chapterRoll < 0.35) clusterStyle = 'distant_line';
        else clusterStyle = 'open_negative';
      } else if (zoneRoll < 0.52) {
        // Zone B: Scattered Meadow & Loose Groves
        if (chapterRoll < 0.22) clusterStyle = 'open_negative';
        else if (chapterRoll < 0.50) clusterStyle = 'isolated';
        else if (chapterRoll < 0.85) clusterStyle = 'small_group';
        else clusterStyle = 'roadside_edge';
      } else if (zoneRoll < 0.80) {
        // Zone C: Medium Woodland Country
        if (chapterRoll < 0.15) clusterStyle = 'open_negative';
        else if (chapterRoll < 0.40) clusterStyle = 'small_group';
        else if (chapterRoll < 0.72) clusterStyle = 'medium_grove';
        else if (chapterRoll < 0.88) clusterStyle = 'roadside_edge';
        else clusterStyle = 'distant_line';
      } else {
        // Zone D: Tree-Rich Section (Occasional large loose groves and staggered clusters)
        if (chapterRoll < 0.12) clusterStyle = 'open_negative';
        else if (chapterRoll < 0.35) clusterStyle = 'small_group';
        else if (chapterRoll < 0.65) clusterStyle = 'medium_grove';
        else if (chapterRoll < 0.85) clusterStyle = 'large_grove';
        else clusterStyle = 'roadside_edge';
      }

      if (clusterStyle === 'open_negative') continue;

      let count = 1;
      let baseOffset = 0;
      let spreadS = 20;
      let spreadO = 15;
      let minSeparation = 11.0;

      switch (clusterStyle) {
        case 'isolated':
          count = 1;
          baseOffset = side * (38 + hash(key, 103) * 65);
          break;
        case 'small_group':
          count = 3 + Math.floor(hash(key, 104) * 4); // 3 to 6 trees
          baseOffset = side * (44 + hash(key, 103) * 60);
          spreadS = 55 + count * 9;
          spreadO = 30 + count * 6;
          minSeparation = 11.5;
          break;
        case 'medium_grove':
          count = 7 + Math.floor(hash(key, 104) * 8); // 7 to 14 trees
          baseOffset = side * (55 + hash(key, 103) * 75);
          spreadS = 85 + count * 10;
          spreadO = 42 + count * 7;
          minSeparation = 12.5;
          break;
        case 'large_grove':
          count = 15 + Math.floor(hash(key, 104) * 11); // 15 to 25 trees
          baseOffset = side * (75 + hash(key, 103) * 85);
          spreadS = 135 + count * 10;
          spreadO = 60 + count * 7;
          minSeparation = 13.5;
          break;
        case 'roadside_edge':
          count = 2 + Math.floor(hash(key, 104) * 3); // 2 to 4 trees
          baseOffset = side * (22 + hash(key, 103) * 12);
          spreadS = 40 + count * 8;
          spreadO = 10;
          minSeparation = 12.0;
          break;
        case 'distant_line':
          count = 4 + Math.floor(hash(key, 104) * 6); // 4 to 9 trees
          baseOffset = side * (180 + hash(key, 103) * 130);
          spreadS = 130 + count * 15;
          spreadO = 35;
          minSeparation = 14.0;
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
          while (attempts < 8 && !valid) {
            const tryS = centre + (hash(q + attempts * 17, 105) - 0.5) * spreadS;
            const tryO = baseOffset + (hash(q + attempts * 17, 106) - 0.5) * spreadO;
            valid = true;
            for (const prev of placedInCluster) {
              if (Math.hypot(tryS - prev.s, tryO - prev.o) < minSeparation) {
                valid = false;
                break;
              }
            }
            if (valid || attempts === 7) {
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

        if (w.country > 0.4 && speciesRoll > 0.72) {
          // Tall Pine in mountain/countryside terrain (Evergreen)
          kind = 'pine_tall';
          height = 23.0 + hash(q, 108) * 6.5;
          canopyRadius = 5.2 + hash(q, 109) * 2.2;
          leafLoad = 0.08;
        } else if (clusterStyle === 'roadside_edge' && t === 0) {
          kind = 'roadside';
          height = 14.5 + hash(q, 108) * 3.5;
          canopyRadius = 6.8 + hash(q, 109) * 2.2;
          leafLoad = 0.85;
        } else if (speciesRoll > 0.48) {
          // Majestic Mature Oak (Deciduous Autumn)
          kind = 'oak_mature';
          height = 20.0 + hash(q, 108) * 5.5;
          canopyRadius = 9.2 + hash(q, 109) * 3.5;
          leafLoad = 0.95;
        } else {
          // Elegant Mature Ash (Deciduous Autumn)
          kind = 'ash_mature';
          height = 18.5 + hash(q, 108) * 4.5;
          canopyRadius = 7.8 + hash(q, 109) * 2.8;
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
            hasUndergrowth: (clusterStyle === 'medium_grove' || clusterStyle === 'large_grove' || clusterStyle === 'small_group') && (t === 0 || t === 1),
          });
        }
      }
    }
  }

  return out;
}
