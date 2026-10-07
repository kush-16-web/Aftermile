import { clamp, hash } from '../core/math.ts';

export const ROUTE_SECTION = 4000;
export const STRAIGHT_LENGTH = 1200;
export const REGION_SPAN = 9600;
export const HEIGHT_SECTION = 3000;

/** Long-form road elevation knots creating deliberate geography-synchronized trends.
 * Each knot is at HEIGHT_SECTION (3km) intervals.
 * Designed for: long climb -> crest -> long descent -> valley -> climb -> plateau -> mountain approach */
function elevationKnot(index: number, seed: number): number {
  // Major geography anchors (in HEIGHT_SECTION units, 1 section = 3km)
  // index 0: s=0 (spawn) ~24m
  // index 1: s=3km ~35m - beginning of climb
  // index 2: s=6km ~95m - MAJOR CREST (first crest reveal)
  // index 3: s=9km ~35m - descent begins
  // index 4: s=12km ~22m - valley approach
  // index 5: s=15km ~15m - VALLEY FLOOR (basin reserved for water)
  // index 6: s=18km ~25m - valley exit climb begins
  // index 7: s=21km ~55m - mid-valley climb
  // index 8: s=24km ~75m - plateau approach
  // index 9: s=27km ~85m - rolling plateau
  // index 10: s=30km ~70m - plateau variation
  // index 11: s=33km ~80m - plateau
  // index 12: s=36km ~65m - plateau descent
  // index 13: s=39km ~55m - 
  // index 14: s=42km ~60m - 
  // index 15: s=45km ~50m - 
  // index 16: s=48km ~55m - 
  // index 17: s=51km ~45m - 
  // index 18: s=54km ~60m - mountain approach begins
  // index 19: s=57km ~80m - 
  // index 20: s=60km ~100m - distant mountain foothills
  
  const majorKnots: number[] = [
    24,   // 0: spawn
    35,   // 1: early climb
    95,   // 2: MAJOR CREST (6km) - hero crest reveal
    35,   // 3: steep descent begins
    22,   // 4: descending into valley
    15,   // 5: VALLEY FLOOR (15km) - basin for future water
    25,   // 6: valley exit climb
    55,   // 7: climbing out
    75,   // 8: plateau approach
    85,   // 9: rolling plateau
    70,   // 10: plateau dip
    80,   // 11: plateau rise
    65,   // 12: plateau descent
    55,   // 13: 
    60,   // 14: 
    50,   // 15: 
    55,   // 16: 
    45,   // 17: 
    60,   // 18: mountain approach
    80,   // 19: foothills
    100,  // 20: mountain base
  ];
  
  if (index >= 0 && index < majorKnots.length) {
    const base = majorKnots[index];
    // Add small deterministic variation except at key anchors
    const isAnchor = [0, 2, 5, 8, 14, 20].includes(index);
    return base + (isAnchor ? 0 : (hash(index, seed + 812) - 0.5) * 8);
  }
  
  // Beyond 60km: seeded rolling terrain with gradual mountain approach
  const distancePast = index - 20;
  const mountainApproach = Math.min(distancePast * 2.5, 80); // Gradual rise to mountains
  const seededVariation = hash(index, seed + 8173) * 30;
  return 100 + mountainApproach + seededVariation;
}

/** Analytic C2 centreline and grade; zero acceleration at the joins. */
export function routeProfile(s: number, seed: number, vertical = false, derivative = 0) {
  const span = vertical ? HEIGHT_SECTION : ROUTE_SECTION, hold = vertical ? 0 : STRAIGHT_LENGTH;
  const section = Math.floor(s / span), local = s - section * span;
  const t = clamp((local - hold) / (span - hold), 0, 1);
  const lateral = (index: number) => (index % 2 === 0 ? -1 : 1) * (260 + hash(index, seed + 193) * 350);
  const a = vertical ? elevationKnot(section, seed) : lateral(section);
  const b = vertical ? elevationKnot(section + 1, seed) : lateral(section + 1);
  if (derivative > 0 && (t === 0 || t === 1)) return 0;
  if (derivative === 1) return (b - a) * 30 * t * t * (t - 1) * (t - 1) / (span - hold);
  if (derivative === 2) return (b - a) * 60 * t * (2 * t * t - 3 * t + 1) / ((span - hold) * (span - hold));
  return a + (b - a) * t * t * t * (t * (t * 6 - 15) + 10);
}