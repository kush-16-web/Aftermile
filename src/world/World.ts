import * as THREE from 'three';
import { CHUNK, Road } from '../road/Road.ts';
import { Materials } from './Materials.ts';
import { WorldChunk } from './WorldChunk.ts';
import { nextChunk, streamWindow } from './Streaming.ts';
import { WorldAssetLibrary } from './WorldAssetLibrary.ts';
export class World {
  chunks=new Map<number,WorldChunk>();materials=new Materials();origin=0;vegetation=1;range=8;
  stats={generated:0,disposed:0,lastBuildMs:0,maxBuildMs:0,aheadMetres:0,behindMetres:0};
  assets=new WorldAssetLibrary();
  private lastS=0;
  private hasChunk=(id:number)=>this.chunks.has(id);
  constructor(public scene:THREE.Scene,public road:Road) {
    this.assets.ready.then(()=>{if(this.assets.loaded)this.rebuild(this.lastS);});
  }
  update(s:number,immediate=false) {
    this.lastS=s;
    this.origin=Math.floor(s/3200)*3200;
    this.materials.terrain.uniforms.terrainOrigin.value=this.origin;
    const {center,min,max}=streamWindow(s,this.range);
    for(const [id,chunk]of this.chunks)if(id<min||id>max){chunk.dispose();this.chunks.delete(id);this.stats.disposed++;}
    // Startup builds only the immediate drive corridor; fill the distant horizon
    // one chunk/frame. Driving retains ~2.6 km ahead at medium, 960 m behind.
    let remaining=immediate?4:1;
    while(remaining-->0){
      const i=nextChunk(center,min,max,this.hasChunk);if(i===null)break;
      const began=performance.now();
      const chunk=new WorldChunk(i,this.road,this.materials,this.vegetation,this.assets);this.chunks.set(i,chunk);this.scene.add(chunk.group);
      this.stats.lastBuildMs=performance.now()-began;this.stats.maxBuildMs=Math.max(this.stats.maxBuildMs,this.stats.lastBuildMs);this.stats.generated++;
    }
    let front=center;while(this.chunks.has(front))front++;
    let back=center;while(this.chunks.has(back))back--;
    this.stats.aheadMetres=Math.max(0,front*CHUNK-s);this.stats.behindMetres=Math.max(0,s-(back+1)*CHUNK);
    for(const chunk of this.chunks.values())chunk.group.position.z=this.origin-chunk.start;
  }
  rebuild(s:number) {for(const c of this.chunks.values())c.dispose();this.chunks.clear();this.update(s,true);}
  get objects() {let count=0;for(const c of this.chunks.values())count+=c.group.children.length;return count;}
}
