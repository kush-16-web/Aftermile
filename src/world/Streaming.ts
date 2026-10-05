import { CHUNK } from '../road/Road.ts';
const NEAR_ORDER=[0,1,-1,2,-2,3];

/** Road/terrain have a longer horizon than detailed vegetation. Settings retain
 * their existing 6/8/10 quality range; this converts it to kilometre horizons. */
export function streamWindow(s: number, qualityRange: number) {
  const center = Math.floor(s / CHUNK);
  const ahead = Math.round(Math.max(6, Math.min(10, qualityRange)) * 2);
  return { center, min: Math.max(-2, center-6), max: center+ahead, ahead, behind: 6 };
}

export function nextChunk(center: number, min: number, max: number, has: (id:number)=>boolean) {
  // Collision/visual corridor first. Complete the front horizon before distant
  // rear detail, while retaining enough reverse/mirror coverage.
  for(const delta of NEAR_ORDER) {
    const id=center+delta;if(id>=min&&id<=max&&!has(id))return id;
  }
  for(let id=center+4;id<=max;id++)if(!has(id))return id;
  for(let id=center-3;id>=min;id--)if(!has(id))return id;
  return null;
}
