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
export interface TreePlacement {
  s:number;offset:number;height:number;pine:boolean;rotation:number;
  canopyRadius:number;leafLoad:number;
}
/** Global cluster anchors cross chunk borders unchanged. Independent of themes,
 * quality or chunk arrival order; no even-grid singleton decoration. Chapters
 * deliberately leave long open stretches so trees read as composed landmarks. */
export function treePlacements(road:Road,start:number,end:number) {
  const out:TreePlacement[]=[];
  const chapter=900;
  for(let id=Math.floor((start-140)/chapter);id<=Math.floor((end+140)/chapter);id++) {
    const key=id*31+road.seed;
    const centre=id*chapter+180+hash(key,71)*520;
    // Let the opening establish a huge field, and keep the first crest a clean
    // panorama. Later chapters alternate edge groves and more open meadow.
    const openChapter=(id%5===2)||(id%7===4);
    if(centre<1500||Math.abs(centre-6000)<520||openChapter||meadowWeight(road,centre)>.74||vistaWeight(road,centre)>.35)continue;
    const side=hash(key,72)>.5?1:-1;
    const nearRoad=hash(key,73)>.43;
    const offset=side*(nearRoad?(44+hash(key,74)*82):(150+hash(key,74)*310));
    const count=4+Math.floor(hash(key,75)*5);
    for(let tree=0;tree<count;tree++){
      const q=key+tree*797,s=centre+(hash(q,76)-.5)*120;
      const o=offset+(hash(q,77)-.5)*(nearRoad?42:76);
      if(s<start||s>=end||Math.abs(o)<32||road.terrainSurface(s,o)<9)continue;
      const along=(road.terrainSurface(s+2,o)-road.terrainSurface(s-2,o))/4;
      const across=(road.terrainSurface(s,o+2)-road.terrainSurface(s,o-2))/4;
      if(Math.hypot(along,across)>.65)continue;
      const pine=hash(q,78)>.72;
      out.push({
        s,offset:o,
        height:pine?18+hash(q,79)*8:14+hash(q,79)*9,
        pine,rotation:hash(q,80)*Math.PI*2,
        canopyRadius:pine?4.8+hash(q,81)*2.8:6.5+hash(q,81)*4.2,
        leafLoad:pine?.08:.72+hash(q,82)*.28,
      });
    }
  }
  return out;
}
