import * as THREE from 'three';
import { CHUNK, Road } from '../road/Road.ts';
import { Materials } from './Materials.ts';
import { WorldChunk, type LeafSource } from './WorldChunk.ts';
import { nextChunk, streamWindow } from './Streaming.ts';
import { WorldAssetLibrary } from './WorldAssetLibrary.ts';
export class World {
  chunks=new Map<number,WorldChunk>();materials=new Materials();origin=0;vegetation=1;range=8;leafDensity=0;
  stats={generated:0,disposed:0,lastBuildMs:0,maxBuildMs:0,aheadMetres:0,behindMetres:0};
  assets=new WorldAssetLibrary(this.materials);
  private lastS=0;
  private hasChunk=(id:number)=>this.chunks.has(id);
  constructor(public scene:THREE.Scene,public road:Road) {
    this.assets.ready.then(()=>{
      if(this.assets.loaded){
        this.rebuild(this.lastS);
      }
    });
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
      let i=nextChunk(center,min,max,this.hasChunk);
      if(i===null&&this.assets.loaded){
        let nearest=Infinity;
        for(const [id,chunk]of this.chunks)if(!chunk.assetReady&&Math.abs(id-center)<nearest){i=id;nearest=Math.abs(id-center);}
        if(i!==null){this.chunks.get(i)!.dispose();this.chunks.delete(i);this.stats.disposed++;}
      }
      if(i===null)break;
      const began=performance.now();
      const chunk=new WorldChunk(i,this.road,this.materials,this.vegetation,this.assets);this.chunks.set(i,chunk);this.scene.add(chunk.group);
      this.stats.lastBuildMs=performance.now()-began;this.stats.maxBuildMs=Math.max(this.stats.maxBuildMs,this.stats.lastBuildMs);this.stats.generated++;
    }
    this.leafDensity=this.chunks.get(center)?.leafDensity??0;
    let front=center;while(this.chunks.has(front))front++;
    let back=center;while(this.chunks.has(back))back--;
    this.stats.aheadMetres=Math.max(0,front*CHUNK-s);this.stats.behindMetres=Math.max(0,s-(back+1)*CHUNK);
    for(const chunk of this.chunks.values()){
      chunk.group.position.z=this.origin-chunk.start;
      const distance=Math.abs(chunk.start+CHUNK*.5-s);
      for(const object of chunk.group.children){
        const tier=object.userData.detailTier;
        if(tier==='near')object.visible=distance<650;
        if(tier==='mid')object.visible=distance<1250;
        if(tier==='trees')object.visible=distance<2400;
        if(object instanceof THREE.InstancedMesh&&tier==='trees')object.castShadow=distance<160;
      }
    }
    this.updateLeafSources();
  }
  rebuild(s:number) {for(const c of this.chunks.values())c.dispose();this.chunks.clear();this.update(s,true);}
  get objects() {let count=0;for(const c of this.chunks.values())count+=c.group.children.length;return count;}

  private _cachedLeafSources:LeafSource[]=[];
  private _leafSourcePool:LeafSource[]=[];

  private updateLeafSources() {
    this._cachedLeafSources.length=0;
    let poolIdx=0;
    for(const chunk of this.chunks.values()){
      const zShift=this.origin-chunk.start;
      for(let i=0;i<chunk.leafSources.length;i++){
        const s=chunk.leafSources[i];
        if(poolIdx>=this._leafSourcePool.length){
          this._leafSourcePool.push({x:0,y:0,z:0,radius:0,load:0,key:0});
        }
        const item=this._leafSourcePool[poolIdx++];
        item.x=s.x;
        item.y=s.y;
        item.z=s.z+zShift;
        item.radius=s.radius;
        item.load=s.load;
        item.key=s.key;
        this._cachedLeafSources.push(item);
      }
    }
  }

  /** Leaf emitters in the same origin-shifted frame as the hero and particles. */
  get leafSources():LeafSource[]{
    return this._cachedLeafSources;
  }
}

