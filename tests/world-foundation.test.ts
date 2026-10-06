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
      assert.ok(Math.abs(a.grade(s))<.045,'scenic highway grade stays below 4.5%');
      assert.ok(Math.abs(a.heading(s+1)-a.heading(s-1))/2<1/1100,'curves remain broad');
      assert.ok(Math.abs((a.height(s+.1)-a.height(s-.1))/.2-a.grade(s))<1e-6);
      assert.ok(Math.abs((a.center(s+.1)-a.center(s-.1))/.2-a.slope(s))<1e-6);
      assert.ok(Math.abs(a.grade(s+1)-a.grade(s-1))<.0001,'crest vertical acceleration stays below .10 m/s² at 160 km/h');
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
  // Coast geography is sampled in world X/Z; convert to the unchanged local
  // driving frame to verify that collision heights agree at the water edge.
  const sample=(worldS:number,inland:number)=>{
    const x=road.coastPoint(worldS).x+inland;
    let lo=worldS-5000,hi=worldS+5000;
    for(let i=0;i<50;i++){const s=(lo+hi)/2;if(-s+Math.tan(road.heading(s))*(x-road.center(s))+worldS>0)lo=s;else hi=s;}
    const s=(lo+hi)/2;
    const o=(x-road.center(s))/Math.cos(road.heading(s));
    assert.ok(Math.abs(road.point(s,o).z+worldS)<1e-5);
    const height=road.terrain(s,o);
    return {height,layers:terrainLayers(road,s,o,height,.055)};
  };
  for(let s=14000;s<21000;s+=173){
    const shore=road.shoreline(s);min=Math.min(min,shore);max=Math.max(max,shore);
    assert.ok(Math.abs(sample(s,0).height-SEA_LEVEL)<.001);
    assert.ok(sample(s,20).height>SEA_LEVEL+.9);
    assert.ok(sample(s,-20).height<SEA_LEVEL-1);
    assert.ok(sample(s,-400).height<SEA_LEVEL-30);
    assert.ok(sample(s,0).layers.wet>.9);
    assert.ok(terrainLayers(road,s,100,60,.85).rock>.9);
  }
  assert.ok(max-min>20,'shoreline must not be a uniform strip');
});

test('distant terrain and coast do not fold over sweeping road bends',()=>{
  const road=new Road();
  for(let s=0;s<100000;s+=127){
    const coast=road.coastPoint(s),next=road.coastPoint(s+8);
    assert.equal(next.z-coast.z,-8);
    for(const o of [-5400,-1200,-432,-256,-122,-30,0,30,122,256,432,1200,5400]){
      const a=road.terrainPoint(s-.5,o),b=road.terrainPoint(s+.5,o),c=road.terrainPoint(s,o-.5),d=road.terrainPoint(s,o+.5);
      assert.ok((d.x-c.x)*(b.z-a.z)-(d.z-c.z)*(b.x-a.x)<-.65,'positive terrain orientation');
      if(Math.abs(o)<=80){const driving=road.point(s,o);assert.equal(a.z,road.point(s-.5,o).z);assert.equal(road.terrainPoint(s,o).x,driving.x);}
    }
  }
});

test('inland opening, crest and gradual coast approach preserve readable geography',()=>{
  for(const seed of [1616,42,867]){
    const road=new Road(seed);
    assert.equal(road.region(160).biome,'plains');
    assert.ok(road.shoreline(160)>8000);
    for(let s=0;s<2800;s+=160)for(const offset of [-1200,-300,-30,30,300,1200])assert.ok(road.terrain(s,offset)>SEA_LEVEL+3);
    assert.ok(road.height(6000)>90&&road.height(6000)>road.height(3000)+50);
    assert.ok(road.grade(4500)>.03&&road.grade(7500)<-.03);
    assert.ok(road.heading(2400)>.3&&road.heading(6400)<-.3,'large left and right sweeps');
    assert.ok(road.shoreline(6000)>1900&&road.shoreline(6000)<2600,'first distant crest reveal');
    assert.ok(road.shoreline(18000)<400&&road.shoreline(18000)>120,'coast is approached after a long journey');
    for(let s=0;s<100000;s+=117){assert.equal(road.isBridge(s),false);assert.equal(road.isTunnel(s),false);assert.equal(road.station(s),Infinity);}
  }
});
