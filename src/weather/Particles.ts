import * as THREE from 'three';
import type { WeatherState } from './Weather.ts';
export class Particles {
  rain:THREE.LineSegments;snow:THREE.Points;leaves:THREE.Points;
  count=1200;positions=new Float32Array(1200*6);snowPositions=new Float32Array(900*3);leafPositions=new Float32Array(180*3);
  constructor(scene:THREE.Scene) {
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.rain=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0xb4ceda,transparent:true,opacity:0,depthWrite:false}));this.rain.frustumCulled=false;scene.add(this.rain);
    const make=(data:Float32Array,color:number,size:number)=>{for(let i=0;i<data.length;i+=3){data[i]=(Math.random()-.5)*100;data[i+1]=Math.random()*50;data[i+2]=(Math.random()-.5)*100;}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(data,3).setUsage(THREE.DynamicDrawUsage));const obj=new THREE.Points(g,new THREE.PointsMaterial({color,size,transparent:true,opacity:0,depthWrite:false}));obj.frustumCulled=false;scene.add(obj);return obj;};
    this.snow=make(this.snowPositions,0xe6ecef,.16);this.leaves=make(this.leafPositions,0xcb7c36,.24);
    for(let i=0;i<this.count;i++){this.positions[i*6]=(Math.random()-.5)*110;this.positions[i*6+1]=Math.random()*55;this.positions[i*6+2]=(Math.random()-.5)*110;}
  }
  update(dt:number,time:number,center:THREE.Vector3,w:WeatherState,quality:number,inTunnel:boolean) {
    this.rain.position.copy(center);this.snow.position.copy(center);this.leaves.position.copy(center);
    this.rain.visible=!inTunnel&&w.wet>.15&&quality>0;this.snow.visible=!inTunnel&&w.snow>.05&&quality>0;this.leaves.visible=!inTunnel&&w.autumn>.1&&quality>0;
    (this.rain.material as THREE.LineBasicMaterial).opacity=w.wet*.38;
    this.rain.geometry.setDrawRange(0,Math.floor(this.count*quality)*2);
    if(this.rain.visible)for(let i=0;i<this.count*quality;i++) {
      const a=i*6;this.positions[a]+=dt*w.wind*.07;this.positions[a+1]-=dt*33;
      if(this.positions[a+1]<-6){this.positions[a+1]=48;this.positions[a]=(Math.random()-.5)*110;this.positions[a+2]=(Math.random()-.5)*110;}
      this.positions[a+3]=this.positions[a]-.1;this.positions[a+4]=this.positions[a+1]+1.6;this.positions[a+5]=this.positions[a+2];
    }
    this.rain.geometry.attributes.position.needsUpdate=true;
    for(const [obj,data,amount,speed]of [[this.snow,this.snowPositions,w.snow,2.6],[this.leaves,this.leafPositions,w.autumn,1.8]] as const) {
      (obj.material as THREE.PointsMaterial).opacity=amount*.75;obj.geometry.setDrawRange(0,Math.floor(data.length/3*quality));
      if(obj.visible)for(let i=0;i<data.length*quality;i+=3){data[i]+=Math.sin(time*.6+i)*dt*.4+dt*w.wind*.035;data[i+1]-=speed*dt;if(data[i+1]<-5){data[i]=(Math.random()-.5)*100;data[i+1]=48;data[i+2]=(Math.random()-.5)*100;}}
      obj.geometry.attributes.position.needsUpdate=true;
    }
  }
}
