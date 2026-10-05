import { clamp, hash, lerp, smooth } from '../core/math.ts';
import type { Road } from './Road.ts';

export const SEA_LEVEL=7.4;
export const CORRIDOR_HALF=12;
const fade=(t:number)=>t*t*t*(t*(t*6-15)+10);

/** Seeded coherent 2D value noise: no sinusoidal repeating hills or chunk seeds. */
export function landscapeNoise(x:number,y:number,seed:number){
  const ix=Math.floor(x),iy=Math.floor(y),u=fade(x-ix),v=fade(y-iy);
  const a=hash(Math.imul(ix,73856093)^Math.imul(iy,19349663),seed);
  const b=hash(Math.imul(ix+1,73856093)^Math.imul(iy,19349663),seed);
  const c=hash(Math.imul(ix,73856093)^Math.imul(iy+1,19349663),seed);
  const d=hash(Math.imul(ix+1,73856093)^Math.imul(iy+1,19349663),seed);
  return lerp(lerp(a,b,u),lerp(c,d,u),v);
}

export function shoreDistance(s:number,seed:number){
  return 145+95*landscapeNoise(s/950,3.7,seed+451)+32*landscapeNoise(s/280,8.1,seed+713);
}
export function beachWidth(s:number,seed:number){return 22+26*landscapeNoise(s/360,1.9,seed+617);}

export function landscapeHeight(road:Road,s:number,offset:number){
  const distance=Math.abs(offset),level=road.height(s)+offset*road.bank(s),seed=road.seed;
  if(distance<=CORRIDOR_HALF)return level-.055;
  const w=road.weights(s),clearance=distance-CORRIDOR_HALF;
  const macro=landscapeNoise(s/1700,offset/1300,seed+31);
  const ridge=1-Math.abs(landscapeNoise(s/2400,offset/900,seed+127)*2-1);
  const middle=landscapeNoise(s/330,offset/280,seed+53)-.5;
  const small=(landscapeNoise(s/57,offset/63,seed+97)-.5)*3.5;
  const far=smooth((distance-90)/650);
  const natural=18+macro*92+ridge*ridge*125*far+middle*24+small*(1-far);
  // A graded cut/fill corridor constrains near-road relief, with a zero-slope
  // shoulder transition. Distant macro shape is independent of chunk borders.
  const delta=clamp(natural-level,-clearance*.42,clearance*.58);
  let ground=level-.055+delta*smooth(clearance/70);
  ground=lerp(ground,level-.055,w.city*smooth(clearance/100)*.85);

  if(offset<0&&w.coast>0){
    const shore=shoreDistance(s,seed),width=beachWidth(s,seed),inland=shore-distance;
    const sand=SEA_LEVEL+inland*.055;
    const upland=smooth((inland-width)/Math.max(20,shore-width-CORRIDOR_HALF));
    const coastal=inland<0?SEA_LEVEL+Math.max(-45,inland*.10):lerp(sand,level-.055,upland);
    ground=lerp(ground,coastal,w.coast);
  }
  // Existing bridge regions keep water beneath their outer deck. Roads still
  // use Road.point() while terrain uses this same deterministic sampler.
  if(w.bridge>0)ground=lerp(ground,SEA_LEVEL-4,w.bridge*smooth(clearance/40));
  const station=road.station(s-100);
  if(offset>8&&offset<65&&Math.abs(s-station)<100){
    const apron=(1-smooth((Math.abs(s-station)-65)/35))*(1-smooth((offset-44)/21));
    ground=lerp(ground,level-.08,apron);
  }
  return ground;
}

/** Continuous material weights; soil is the remaining channel. */
export function terrainLayers(road:Road,s:number,o:number,height:number,slope:number){
  const w=road.weights(s),shore=shoreDistance(s,road.seed);
  const beach=o<0?w.coast*(1-smooth((shore-Math.abs(o)-beachWidth(s,road.seed))/28)):0;
  const wet=beach*(1-smooth((height-SEA_LEVEL-.15)/1.4));
  const sand=beach*(1-wet);
  const rock=smooth((slope-.22)/.62)*(1-beach);
  const verge=1-smooth((Math.abs(o)-12)/15);
  const grass=(1-beach)*(1-rock)*(1-verge*.65);
  return {grass,rock,sand,wet};
}
