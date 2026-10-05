import test from 'node:test';
import assert from 'node:assert/strict';
import { Road, CHUNK, REGION_LENGTH } from '../src/road/Road.ts';
import { ROUTE_SECTION, STRAIGHT_LENGTH } from '../src/road/RouteProfile.ts';
import { nextChunk, streamWindow } from '../src/world/Streaming.ts';
import { SEA_LEVEL, terrainLayers } from '../src/road/Landscape.ts';

test('100 km seeded route has kilometre straights, bounded grade and broad continuous bends',()=>{
  for(const seed of [1616,42,867]){
    const a=new Road(seed),b=new Road(seed);
    for(let s=0;s<100000;s+=41){
      assert.equal(a.center(s),b.center(s));assert.equal(a.terrain(s,40),b.terrain(s,40));
      assert.ok(Math.abs(a.grade(s))<.025,'highway grade stays below 2.5%');
      assert.ok(Math.abs(a.heading(s+1)-a.heading(s-1))/2<1/1100,'curves remain broad');
      assert.ok(Math.abs((a.height(s+.1)-a.height(s-.1))/.2-a.grade(s))<1e-6);
      assert.ok(Math.abs((a.center(s+.1)-a.center(s-.1))/.2-a.slope(s))<1e-6);
      assert.ok(Math.abs(a.grade(s+1)-a.grade(s-1))<.00005,'no launching crests');
    }
    for(let s=0;s<100000;s+=ROUTE_SECTION){
      assert.equal(a.slope(s+50),0);assert.equal(a.slope(s+STRAIGHT_LENGTH-50),0);
      assert.ok(Math.abs(a.center(s-.001)-a.center(s+.001))<.001);
    }
    assert.ok(REGION_LENGTH>=8000);
  }
});

test('streaming stays bounded over 100 km, prioritizes the drive corridor and supports reverse/teleports',()=>{
  const active=new Set<number>();let created=0,removed=0;
  for(const s of [...Array.from({length:626},(_,i)=>i*CHUNK),3200,0,84000]){
    const {center,min,max}=streamWindow(s,8);
    for(const id of active)if(id<min||id>max){active.delete(id);removed++;}
    let id:number|null;while((id=nextChunk(center,min,max,n=>active.has(n)))!==null){active.add(id);created++;}
    assert.ok(active.size<=23);assert.ok(active.has(center)&&active.has(center+16));
    assert.ok([...active].every(id=>id>=min&&id<=max));
  }
  assert.ok(created>600&&removed>580);
});

test('terrain keeps the entire road corridor clear and has identical shared chunk samples',()=>{
  const road=new Road();
  for(let s=0;s<100000;s+=127){
    for(const o of [-12,-10,-8,0,8,10,12]){
      const roadY=road.point(s,o).y,ground=road.terrain(s,o);
      assert.ok(ground<=roadY&&roadY-ground<.081,'terrain stays just below lanes and shoulders');
    }
  }
  for(let chunk=0;chunk<80;chunk++)for(const o of [-1200,-200,-30,0,30,200,1200]){
    const boundary=(chunk+1)*CHUNK;
    const a=road.terrain(chunk*CHUNK+CHUNK,o),b=road.terrain(boundary,o);
    assert.equal(a,b);assert.ok(Number.isFinite(a));
    assert.ok(Math.abs(road.terrain(boundary+.001,o)-road.terrain(boundary-.001,o))<.025);
  }
});

test('coast has a variable-width dry/wet beach into shallow and deep sea',()=>{
  const road=new Road();let min=Infinity,max=-Infinity;
  for(let s=160;s<7000;s+=173){
    const shore=road.shoreline(s);min=Math.min(min,shore);max=Math.max(max,shore);
    assert.ok(Math.abs(road.terrain(s,-shore)-SEA_LEVEL)<.001);
    assert.ok(road.terrain(s,-shore+20)>SEA_LEVEL+.9);
    assert.ok(road.terrain(s,-shore-20)<SEA_LEVEL-1);
    assert.ok(road.terrain(s,-shore-400)<SEA_LEVEL-30);
    assert.ok(terrainLayers(road,s,-shore,SEA_LEVEL,.055).wet>.9);
    assert.ok(terrainLayers(road,s,100,60,.85).rock>.9);
  }
  assert.ok(max-min>20,'shoreline must not be a uniform strip');
});
