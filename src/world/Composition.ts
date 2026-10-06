import { hash, lerp, smooth } from '../core/math.ts';
import { HEIGHT_SECTION } from '../road/RouteProfile.ts';
import type { Road } from '../road/Road.ts';

export function vistaWeight(road:Road,s:number) {
  const knot=Math.round(s/HEIGHT_SECTION)*HEIGHT_SECTION;
  const crest=road.height(knot)>road.height(knot-700)&&road.height(knot)>road.height(knot+700);
  return Math.max(1-smooth((s-700)/650),crest?1-smooth(Math.abs(s-knot)/650):0);
}
export function meadowWeight(road:Road,s:number) {
  const section=Math.floor(s/1600),t=s/1600-section;
  return Math.max(vistaWeight(road,s),lerp(hash(section,road.seed+410),hash(section+1,road.seed+410),smooth(t)));
}
export interface TreePlacement {s:number;offset:number;height:number;pine:boolean;rotation:number;}
/** Global cluster anchors cross chunk borders unchanged. Independent of themes,
 * quality or chunk arrival order; no even-grid singleton decoration. */
export function treePlacements(road:Road,start:number,end:number) {
  const out:TreePlacement[]=[];
  for(let id=Math.floor((start-100)/650);id<=Math.floor((end+100)/650);id++) {
    const key=id*31+road.seed;
    const centre=id*650+150+hash(key,71)*300;
    if(centre<900||meadowWeight(road,centre)>.68||vistaWeight(road,centre)>.35)continue;
    const side=hash(key,72)>.5?1:-1;
    const offset=side*(70+hash(key,73)*360);
    const count=3+Math.floor(hash(key,74)*6);
    for(let tree=0;tree<count;tree++){
      const q=key+tree*797,s=centre+(hash(q,75)-.5)*95;
      const o=offset+(hash(q,76)-.5)*64;
      if(s<start||s>=end||Math.abs(o)<32||road.terrainSurface(s,o)<9)continue;
      const along=(road.terrainSurface(s+2,o)-road.terrainSurface(s-2,o))/4;
      const across=(road.terrainSurface(s,o+2)-road.terrainSurface(s,o-2))/4;
      if(Math.hypot(along,across)>.65)continue;
      out.push({s,offset:o,height:7+hash(q,77)*8,pine:hash(q,78)>.7,rotation:hash(q,79)*Math.PI*2});
    }
  }
  return out;
}
