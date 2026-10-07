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
 * Left and right sides are generated through independent random streams to eliminate
 * mirroring and repeating patterns across the road.
 * Rich landscape rhythms alternate vast open meadow negative space with isolated
 * mature trees, loose 3–6 tree groups, medium groves, roadside canopies, and distant tree lines. */
export function treePlacements(road: Road, start: number, end: number): TreePlacement[] {
  const out: TreePlacement[] = [];

  // 1. OPENING EXPERIENCE (s < 1600m):
  // Preserve vast open grassland at spawn (0..900m).
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
    { side: -1, step: 260, seedOffset: 104729 },
    { side: 1, step: 310, seedOffset: 224737 },
  ];

  for (const { side, step, seedOffset } of sides) {
    const minId = Math.floor((start - 180) / step);
    const maxId = Math.floor((end + 180) / step);

    for (let id = minId; id <= maxId; id++) {
      const key = id * 53 + road.seed + seedOffset;
      const centre = id * step + 40 + hash(key, 101) * (step - 60);

      // Skip early opening (0..1500m) where open grassland is preserved
      if (centre < 1550) continue;

      // Crest panorama (5750..6250m) stays completely clear for sweeping vista
      if (Math.abs(centre - 6000) < 480) continue;

      const isHighVista = vistaWeight(road, centre) > 0.38;
      const w = road.weights(centre);
      const isCoast = w.coast > 0.18;
      // Prevent tree spawning into ocean on coastal beach side
      if (isCoast && side === -1) continue;

      // Landscape composition chapter styles:
      // - Open Meadow (Negative space): 26%
      // - Isolated Hero Tree: 18%
      // - Loose 3–6 Tree Group: 26%
      // - Medium 6–10 Tree Grove: 14%
      // - Roadside Woodland Edge: 10%
      // - Distant Ridge Tree Line: 6%
      const styleRoll = hash(key, 102);

      if (styleRoll < 0.26 || meadowWeight(road, centre) > 0.78) {
        // Open meadow negative space
        continue;
      }

      type ClusterStyle = 'isolated' | 'loose_group' | 'medium_grove' | 'roadside_edge' | 'distant_line';
      let clusterStyle: ClusterStyle;

      if (isHighVista) {
        // In high vista areas, only place distant tree lines to frame the horizon
        clusterStyle = 'distant_line';
      } else if (styleRoll < 0.44) {
        clusterStyle = 'isolated';
      } else if (styleRoll < 0.70) {
        clusterStyle = 'loose_group';
      } else if (styleRoll < 0.84) {
        clusterStyle = 'medium_grove';
      } else if (styleRoll < 0.94) {
        clusterStyle = 'roadside_edge';
      } else {
        clusterStyle = 'distant_line';
      }

      let count = 1;
      let baseOffset = 0;
      let spreadS = 20;
      let spreadO = 15;

      switch (clusterStyle) {
        case 'isolated':
          count = 1;
          baseOffset = side * (42 + hash(key, 103) * 68);
          break;
        case 'loose_group':
          count = 3 + Math.floor(hash(key, 104) * 4); // 3 to 6 trees
          baseOffset = side * (48 + hash(key, 103) * 75);
          spreadS = 65 + count * 8;
          spreadO = 35 + count * 6;
          break;
        case 'medium_grove':
          count = 6 + Math.floor(hash(key, 104) * 5); // 6 to 10 trees
          baseOffset = side * (65 + hash(key, 103) * 85);
          spreadS = 90 + count * 8;
          spreadO = 45 + count * 7;
          break;
        case 'roadside_edge':
          count = 2 + Math.floor(hash(key, 104) * 3); // 2 to 4 trees
          baseOffset = side * (22 + hash(key, 103) * 12);
          spreadS = 45 + count * 6;
          spreadO = 10;
          break;
        case 'distant_line':
          count = 3 + Math.floor(hash(key, 104) * 5); // 3 to 7 trees
          baseOffset = side * (180 + hash(key, 103) * 140);
          spreadS = 120 + count * 15;
          spreadO = 40;
          break;
      }

      const placedInCluster: { s: number; o: number }[] = [];

      for (let t = 0; t < count; t++) {
        const q = key + t * 811;
        let s = centre;
        let o = baseOffset;

        if (count > 1) {
          // Poisson-like distribution with minimum spacing between trunks
          let attempts = 0;
          let valid = false;
          while (attempts < 6 && !valid) {
            const tryS = centre + (hash(q + attempts * 17, 105) - 0.5) * spreadS;
            const tryO = baseOffset + (hash(q + attempts * 17, 106) - 0.5) * spreadO;
            valid = true;
            for (const prev of placedInCluster) {
              if (Math.hypot(tryS - prev.s, tryO - prev.o) < 10.5) {
                valid = false;
                break;
              }
            }
            if (valid || attempts === 5) {
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
          // Tall Pine in mountain/countryside terrain
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
          // Majestic Mature Oak
          kind = 'oak_mature';
          height = 20.0 + hash(q, 108) * 5.5;
          canopyRadius = 9.2 + hash(q, 109) * 3.5;
          leafLoad = 0.95;
        } else {
          // Elegant Mature Ash
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
            hasUndergrowth: (clusterStyle === 'medium_grove' || clusterStyle === 'loose_group') && (t === 0 || t === 1),
          });
        }
      }
    }
  }

  return out;
}
