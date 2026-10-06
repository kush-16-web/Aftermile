import { clamp, hash } from '../core/math.ts';

export const ROUTE_SECTION = 4000;
export const STRAIGHT_LENGTH = 1200;
export const REGION_SPAN = 9600;
export const HEIGHT_SECTION = 3000;

function elevationKnot(index:number,seed:number) {
  // A finite inland opening establishes a crest/reveal. Thereafter heights are
  // stateless seeded samples, rather than a short repeating scenic track.
  const opening=[24,35,95,35,22];
  if(index>=0&&index<opening.length)return opening[index]+(index===0?0:(hash(index,seed+812)-.5)*6);
  return 20+hash(index,seed+8173)*64;
}
/** Analytic C2 centreline and grade; zero acceleration at the joins. */
export function routeProfile(s:number,seed:number,vertical=false,derivative=0) {
  const span=vertical?HEIGHT_SECTION:ROUTE_SECTION,hold=vertical?0:STRAIGHT_LENGTH;
  const section=Math.floor(s/span),local=s-section*span;
  const t=clamp((local-hold)/(span-hold),0,1);
  const lateral=(index:number)=>(index%2===0?-1:1)*(260+hash(index,seed+193)*350);
  const a=vertical?elevationKnot(section,seed):lateral(section);
  const b=vertical?elevationKnot(section+1,seed):lateral(section+1);
  if(derivative>0&&(t===0||t===1))return 0;
  if(derivative===1)return (b-a)*30*t*t*(t-1)*(t-1)/(span-hold);
  if(derivative===2)return (b-a)*60*t*(2*t*t-3*t+1)/((span-hold)*(span-hold));
  return a+(b-a)*t*t*t*(t*(t*6-15)+10);
}
