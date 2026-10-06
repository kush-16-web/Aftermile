import test from 'node:test';
import assert from 'node:assert/strict';
import { Road } from '../src/road/Road.ts';
import { treePlacements, vistaWeight } from '../src/world/Composition.ts';

test('groves keep deterministic chunk seams, open vistas and road exclusion',()=>{
  const road=new Road();
  const all=treePlacements(road,0,24000);
  const streamed=[];
  for(let s=0;s<24000;s+=160)streamed.push(...treePlacements(road,s,s+160));
  assert.deepEqual([...streamed].sort((a,b)=>a.s-b.s),[...all].sort((a,b)=>a.s-b.s));
  assert.ok(all.length>40&&all.length<250,'sparse landscape rather than object noise');
  assert.ok(Math.min(...all.map(t=>t.height))>=14,'trees read at mature scale');
  assert.ok(Math.max(...all.map(t=>t.height))>=22,'pine landmarks reach the far horizon');
  assert.ok(all.some(t=>Math.abs(t.offset)<130)&&all.some(t=>Math.abs(t.offset)>140),'groves layer from shoulder to field edge');
  assert.equal(treePlacements(road,0,800).length,0,'open meadow spawn');
  assert.equal(treePlacements(road,5800,6200).length,0,'crest panorama stays clear');
  assert.ok(vistaWeight(road,6000)>.99);
  assert.ok(all.every(t=>Math.abs(t.offset)>32&&road.terrainSurface(t.s,t.offset)>9));
  assert.deepEqual(treePlacements(new Road(1616),0,24000),all,'theme-independent seeded geography');
  assert.notDeepEqual(treePlacements(new Road(42),0,24000),all);
  let empty=0;for(let s=0;s<24000;s+=160)if(!treePlacements(road,s,s+160).length)empty++;
  assert.ok(empty>90,'most chunks retain open space');
});
