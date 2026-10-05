import test from 'node:test';
import assert from 'node:assert/strict';
import { Road, CHUNK, REGION_LENGTH } from '../src/road/Road.ts';
import { ROUTE_SECTION, STRAIGHT_LENGTH } from '../src/road/RouteProfile.ts';
import { nextChunk, streamWindow } from '../src/world/Streaming.ts';

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
