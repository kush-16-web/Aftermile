import { clamp, hash } from '../core/math.ts';

export const ROUTE_SECTION = 4000;
export const STRAIGHT_LENGTH = 1200;
export const REGION_SPAN = 9600;

/** C2 continuous, stateless route samples. No accumulated integration error or
 * finite route buffer; the same station and seed work after any teleport. */
export function routeProfile(s: number, seed: number, vertical = false, derivative = 0) {
  const span = vertical ? 6000 : ROUTE_SECTION;
  const hold = vertical ? 0 : STRAIGHT_LENGTH;
  const section = Math.floor(s / span), local = s - section * span;
  const t = clamp((local - hold) / (span - hold), 0, 1);
  const key = seed + (vertical ? 8173 : 193);
  const a = hash(section, key), b = hash(section + 1, key);
  // Keep the road in the same roughly 8–28 m elevation envelope as the
  // vehicle foundation while allowing a slow multi-kilometre rise/fall.
  const amplitude = vertical ? 20 : 900;
  if(derivative>0 && (t===0||t===1))return 0;
  if (derivative === 1) return (b-a)*amplitude*30*t*t*(t-1)*(t-1)/(span-hold);
  if (derivative === 2) return (b-a)*amplitude*60*t*(2*t*t-3*t+1)/((span-hold)*(span-hold));
  const blend = t*t*t*(t*(t*6-15)+10);
  return (vertical ? 8 : -450) + (a+(b-a)*blend)*amplitude;
}
