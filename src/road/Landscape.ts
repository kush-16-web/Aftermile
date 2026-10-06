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
  const reveal=smooth((s-3000)/3500);
  const approach=smooth((s-6500)/11500);
  const undulation=landscapeNoise(s/1500,3.7,seed+451)-.5;
  return lerp(9000,1800,reveal)-1580*approach + undulation*180*reveal;
}
export function beachWidth(s:number,seed:number){return 22+26*landscapeNoise(s/360,1.9,seed+617);}

/** Keep the near corridor in the driving frame, then flatten the distant
 * cross-sections into world X/Z. Kilometre-wide rotated road normals otherwise
 * fold over one another on bends. This does not change Road.point(). */
export function landscapePoint(road:Road,s:number,offset:number){
  const h=road.heading(s),far=smooth((Math.abs(offset)-80)/240);
  return {x:road.center(s)+offset*lerp(Math.cos(h),1,far),z:-s+Math.sin(h)*offset*(1-far)};
}
export function coastPoint(road:Road,s:number){return {x:road.center(s)-shoreDistance(s,road.seed),z:-s};}
function coastalSample(road:Road,s:number,offset:number,landscapeFrame:boolean){
  const p=landscapeFrame?landscapePoint(road,s,offset):road.point(s,offset),worldS=-p.z;
  return {worldS,x:p.x,inland:p.x-coastPoint(road,worldS).x};
}

export function landscapeHeight(road:Road,s:number,offset:number,landscapeFrame=false){
  const distance=Math.abs(offset),level=road.height(s)+offset*road.bank(s),seed=road.seed;
  if(distance<=CORRIDOR_HALF)return level-.055;
  const sample=coastalSample(road,s,offset,landscapeFrame);
  const w=road.weights(s),clearance=distance-CORRIDOR_HALF;
  const macro=landscapeNoise(sample.worldS/1700,sample.x/1300,seed+31);
  const ridge=1-Math.abs(landscapeNoise(sample.worldS/2400,sample.x/900,seed+127)*2-1);
  const middle=landscapeNoise(sample.worldS/330,sample.x/280,seed+53)-.5;
  const small=(landscapeNoise(sample.worldS/57,sample.x/63,seed+97)-.5)*3.5;
  const far=smooth((distance-90)/650);
  const natural=15+macro*55+ridge*ridge*160*far+middle*18+small*(1-far);
  // A graded cut/fill corridor constrains near-road relief, with a zero-slope
  // shoulder transition. Distant macro shape is independent of chunk borders.
  const delta=clamp(natural-level,-clearance*.42,clearance*.58);
  let ground=level-.055+delta*smooth(clearance/70);
  ground=lerp(ground,level-.055,w.city*smooth(clearance/100)*.85);

  if(offset<0){
    const width=beachWidth(sample.worldS,seed),inland=sample.inland;
    const sand=SEA_LEVEL+inland*.065;
    const coastal=inland<0?SEA_LEVEL+Math.max(-55,inland*.10):sand;
    // The sea exists only beyond a continuous coast. Inland relief remains
    // untouched hundreds of metres before the beach, even during reveal.
    const coastBlend=1-smooth((inland-width)/220);
    ground=lerp(ground,coastal,coastBlend);
  }
  return ground;
}

/** Continuous material weights; soil is the remaining channel. */
export function terrainLayers(road:Road,s:number,o:number,height:number,slope:number,landscapeFrame=false){
  const sample=coastalSample(road,s,o,landscapeFrame);
  const beach=o<0?(1-smooth((sample.inland-beachWidth(sample.worldS,road.seed))/28)):0;
  const wet=beach*(1-smooth((height-SEA_LEVEL-.15)/1.4));
  const sand=beach*(1-wet);
  const rock=smooth((slope-.22)/.62)*(1-beach);
  const verge=1-smooth((Math.abs(o)-12)/15);
  const grass=(1-beach)*(1-rock)*(1-verge*.65);
  return {grass,rock,sand,wet};
}
