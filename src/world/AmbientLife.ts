import * as THREE from 'three';
import { Road } from '../road/Road.ts';
import { Materials } from './Materials.ts';
export class AmbientLife {
  plane=new THREE.Group();train:THREE.Group[]=[];boats:THREE.Group[]=[];birds:THREE.Group[]=[];
  constructor(public scene:THREE.Scene,public road:Road,m:Materials) {
    const box=(group:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material)=>{const mesh=new THREE.Mesh(m.box,material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);group.add(mesh);return mesh;};
    box(this.plane,2.2,2.3,18,0,0,0,m.white);const nose=new THREE.Mesh(new THREE.ConeGeometry(1.1,3,12),m.white);nose.rotation.x=-Math.PI/2;nose.position.z=-10;this.plane.add(nose);
    for(const side of [-1,1]){const wing=box(this.plane,11,.18,3.5,side*5,0,0,m.white);wing.rotation.y=side*.2;box(this.plane,1,1,2.5,side*4,-.8,-.7,m.dark);const tail=box(this.plane,4,.15,1.6,side*2,0,7.5,m.white);tail.rotation.y=side*.2;}
    box(this.plane,.25,3.5,2,0,1.5,7,m.red);scene.add(this.plane);
    for(let i=0;i<5;i++){const car=new THREE.Group();box(car,3,2.5,17,0,1.4,0,m.white);box(car,3.04,.7,14,0,1.8,0,m.glass);box(car,3.06,.17,16,0,.65,0,m.red);this.train.push(car);scene.add(car);}
    for(let i=0;i<3;i++){const boat=new THREE.Group();box(boat,2,.65,5,0,0,0,i===2?m.red:m.white);box(boat,1.4,.8,2,0,.65,.2,m.glass);this.boats.push(boat);scene.add(boat);}
    for(let i=0;i<9;i++){const bird=new THREE.Group();for(const side of [-1,1]){const wing=box(bird,1.6,.06,.25,side*.6,0,0,m.dark);wing.rotation.z=side*.25;}this.birds.push(bird);scene.add(bird);}
  }
  update(time:number,s:number,origin:number) {
    const base=Math.floor(s/1600)*1600;
    this.plane.position.set(this.road.center(s)+320-Math.sin(time*.018)*550,130+Math.sin(time*.008)*55,-s+origin-650-Math.cos(time*.018)*320);this.plane.rotation.y=Math.PI/2+time*.018;this.plane.rotation.z=-.05;
    for(let i=0;i<this.train.length;i++) {
      const at=base+((time*22)%1600)-i*18,region=this.road.region(at);
      const p=this.road.point(at,27,12.5),car=this.train[i];car.visible=region.biome==='city';car.position.set(p.x,p.y,p.z+origin);car.rotation.y=-this.road.heading(at);
    }
    const waterRegion=['coast','bridge'].includes(this.road.region(s).biome);
    for(let i=0;i<this.boats.length;i++) {const boat=this.boats[i];boat.visible=waterRegion;boat.position.set(this.road.center(s)-130-i*150+Math.sin(time*.02+i)*80,8+Math.sin(time+i)*.25,-s+origin-200-i*100+Math.cos(time*.02+i)*140);boat.rotation.y=-time*.02-i;boat.rotation.z=Math.sin(time*1.3+i)*.03;}
    for(let i=0;i<this.birds.length;i++){const b=this.birds[i];b.position.set(this.road.center(s)+Math.sin(time*.01)*220+(i%5)*8,70+Math.sin(time*.5+i)*.5,-s+origin-180-Math.abs(i-4)*4);b.rotation.y=.4;for(let w=0;w<b.children.length;w++)b.children[w].rotation.z=(w===0?-1:1)*Math.sin(time*2+i*.1)*.4;}
  }
}
