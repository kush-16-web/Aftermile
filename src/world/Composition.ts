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

/** Global cluster anchors cross chunk borders unchanged.
 * Composes a rhythmic driving landscape: massive open meadow opening,
 * occasional hero solitary trees, clustered groves with undergrowth,
 * and clean panoramic crest vistas with intentional negative space. */
export function treePlacements(road: Road, start: number, end: number): TreePlacement[] {
  const out: TreePlacement[] = [];
  const chapter = 880;

  for (let id = Math.floor((start - 160) / chapter); id <= Math.floor((end + 160) / chapter); id++) {
    const key = id * 37 + road.seed;
    const centre = id * chapter + 200 + hash(key, 71) * 460;

    // 1. OPENING EXPERIENCE (s < 1800m):
    // Huge open grassland. Keep spawn (0..800m) completely clear.
    // At s ≈ 1100–1350m, place ONE isolated majestic hero tree in the open field.
    if (centre < 1800) {
      if (id === 1 && centre >= 950 && centre <= 1400 && start <= centre && centre < end) {
        const side = hash(key, 72) > 0.5 ? 1 : -1;
        const heroOffset = side * (85 + hash(key, 74) * 45);
        if (road.terrainSurface(centre, heroOffset) >= 9) {
          out.push({
            s: centre,
            offset: heroOffset,
            height: 22.0 + hash(key, 79) * 3.5,
            kind: 'oak_mature',
            pine: false,
            rotation: hash(key, 80) * Math.PI * 2,
            canopyRadius: 10.5 + hash(key, 81) * 3.0,
            leafLoad: 0.95,
            clusterId: id,
            hasUndergrowth: true,
          });
        }
      }
      continue;
    }

    // 2. CREST PANORAMA (5800..6200m) stays completely clear for sweeping vista
    if (Math.abs(centre - 6000) < 520 || vistaWeight(road, centre) > 0.35) continue;

    // 3. CHAPTER RHYTHM:
    // Alternate open negative space with structured groves
    const openChapter = id % 5 === 2 || id % 7 === 4;
    if (openChapter || meadowWeight(road, centre) > 0.74) continue;

    const side = hash(key, 72) > 0.5 ? 1 : -1;
    const isRoadsideGrove = hash(key, 73) > 0.45;
    const offset = side * (isRoadsideGrove ? 42 + hash(key, 74) * 55 : 125 + hash(key, 74) * 190);
    const count = 3 + Math.floor(hash(key, 75) * 4); // 3 to 6 trees per cluster
    const clusterType = hash(key, 83);
    const isPineGrove = clusterType > 0.78;

    for (let tree = 0; tree < count; tree++) {
      const q = key + tree * 797;
      const s = centre + (hash(q, 76) - 0.5) * (isRoadsideGrove ? 75 : 110);
      const o = offset + (hash(q, 77) - 0.5) * (isRoadsideGrove ? 32 : 65);

      if (s < start || s >= end || Math.abs(o) < 32 || road.terrainSurface(s, o) < 9) continue;

      const along = (road.terrainSurface(s + 2, o) - road.terrainSurface(s - 2, o)) / 4;
      const across = (road.terrainSurface(s, o + 2) - road.terrainSurface(s, o - 2)) / 4;
      if (Math.hypot(along, across) > 0.65) continue;

      let kind: TreeKind;
      let height: number;
      let canopyRadius: number;

      if (isPineGrove || hash(q, 78) > 0.82) {
        kind = 'pine_tall';
        height = 22.0 + hash(q, 79) * 6.0;
        canopyRadius = 5.2 + hash(q, 81) * 2.5;
      } else if (isRoadsideGrove && tree === 0) {
        kind = 'roadside';
        height = 14.5 + hash(q, 79) * 3.5;
        canopyRadius = 6.8 + hash(q, 81) * 2.5;
      } else if (hash(q, 84) > 0.5) {
        kind = 'oak_mature';
        height = 19.5 + hash(q, 79) * 4.5;
        canopyRadius = 9.0 + hash(q, 81) * 3.5;
      } else {
        kind = 'ash_mature';
        height = 18.0 + hash(q, 79) * 4.0;
        canopyRadius = 7.5 + hash(q, 81) * 3.0;
      }

      out.push({
        s,
        offset: o,
        height,
        kind,
        pine: kind === 'pine_tall',
        rotation: hash(q, 80) * Math.PI * 2,
        canopyRadius,
        leafLoad: kind === 'pine_tall' ? 0.08 : 0.72 + hash(q, 82) * 0.28,
        clusterId: id,
        hasUndergrowth: tree === 0 || tree === 1,
      });
    }
  }

  return out;
}
