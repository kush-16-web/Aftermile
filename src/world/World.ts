import * as THREE from 'three';
import { CHUNK, Road } from '../road/Road.ts';
import { Materials } from './Materials.ts';
import { WorldChunk } from './WorldChunk.ts';
export class World {
  chunks=new Map<number,WorldChunk>();materials=new Materials();origin=0;vegetation=1;range=8;
  constructor(public scene:THREE.Scene,public road:Road) {}
  update(s:number,immediate=false) {
    this.origin=Math.floor(s/3200)*3200;
    const center=Math.floor(s/CHUNK),min=Math.max(-2,center-3),max=center+this.range;
    for(const [id,chunk]of this.chunks)if(id<min||id>max){chunk.dispose();this.chunks.delete(id);}
    let created=0;
    const order=[center,center+1,center-1,...Array.from({length:max-min+1},(_,i)=>min+i)];
    for(const i of order) {
      if(i<min||i>max||this.chunks.has(i))continue;
      if(!immediate&&created>=1)break;
      const chunk=new WorldChunk(i,this.road,this.materials,this.vegetation);this.chunks.set(i,chunk);this.scene.add(chunk.group);created++;
    }
    for(const chunk of this.chunks.values())chunk.group.position.z=this.origin-chunk.start;
  }
  rebuild(s:number) {for(const c of this.chunks.values())c.dispose();this.chunks.clear();this.update(s,true);}
  get objects() {let count=0;for(const c of this.chunks.values())count+=c.group.children.length;return count;}
}
