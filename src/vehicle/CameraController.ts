import * as THREE from 'three';
import { clamp, damp } from '../core/math.ts';
import type { VehiclePhysics, VehiclePose } from './VehiclePhysics.ts';
import type { VehicleConfig } from './VehicleConfig.ts';
export const cameraNames=['Chase','Close chase','Hood','Roof','Scenic'];

export class CameraController {
  mode=0;target=new THREE.Vector3();look=new THREE.Vector3();initialized=false;orbit=0;drag=false;lastX=0;
  private velocity=new THREE.Vector3();private lookVelocity=new THREE.Vector3();private previousPosition=new THREE.Vector3();
  private heading=0;private desiredLook=new THREE.Vector3();private position=new THREE.Vector3();
  private forward=new THREE.Vector3();private right=new THREE.Vector3();private rayPoint=new THREE.Vector3();
  constructor(public camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement,private config:VehicleConfig) {
    canvas.addEventListener('pointerdown',e=>{if(e.button===2){this.drag=true;this.lastX=e.clientX;canvas.setPointerCapture(e.pointerId);}});
    canvas.addEventListener('pointermove',e=>{if(this.drag){this.orbit+=(e.clientX-this.lastX)*.006;this.lastX=e.clientX;}});
    const release=()=>this.drag=false;
    canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);window.addEventListener('blur',release);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
  }
  shiftOrigin(delta:number){this.camera.position.z+=delta;this.target.z+=delta;this.look.z+=delta;this.desiredLook.z+=delta;this.previousPosition.z+=delta;}
  private spring(value:THREE.Vector3,velocity:THREE.Vector3,target:THREE.Vector3,rate:number,dt:number) {
    const e=Math.exp(-rate*dt);
    for(const key of ['x','y','z'] as const){const delta=value[key]-target[key],term=(velocity[key]+rate*delta)*dt;value[key]=target[key]+(delta+term)*e;velocity[key]=(velocity[key]-rate*term)*e;}
  }
  private surface(car:VehiclePhysics,x:number,z:number,origin:number) {
    let s=origin-z,offset=0;
    for(let i=0;i<3;i++){const h=car.road.heading(s);offset=(x-car.road.center(s))/Math.cos(h);s=origin-z+Math.sin(h)*offset;}
    return {height:car.ground(s,offset),s,offset};
  }
  update(dt:number,time:number,car:VehiclePhysics,pose:VehiclePose,origin:number,menu:boolean,fov:number,smoothing:number,reduced:boolean) {
    dt=Math.min(.05,dt);const c=this.config.camera,p=car.road.point(pose.s,pose.offset);
    this.position.set(p.x,pose.height,p.z+origin);
    const wantedHeading=car.road.heading(pose.s)+pose.heading;
    if(!this.initialized)this.heading=wantedHeading;
    const error=Math.atan2(Math.sin(wantedHeading-this.heading),Math.cos(wantedHeading-this.heading));
    this.heading+=error*(1-Math.exp(-dt*(this.mode<2?4.5:9)));
    this.forward.set(Math.sin(this.heading),0,-Math.cos(this.heading));this.right.set(Math.cos(this.heading),0,Math.sin(this.heading));
    const speed=Math.abs(car.speed);
    let distance=c.distance+Math.min(1.8,speed*.035)+(reduced?0:clamp(car.acceleration*.075,-.3,.35)),height=c.height,lookAhead=c.lookAhead;
    if(this.mode===1){distance=c.closeDistance+Math.min(.8,speed*.018);height=c.closeHeight;lookAhead=9;}
    if(this.mode===2){distance=c.hood[2];height=c.hood[1];lookAhead=25;}
    if(this.mode===3){distance=.15;height=1.8;lookAhead=22;}
    if(this.mode===4){distance=13;height=5.4;lookAhead=4;}
    if(menu){
      const angle=.72+Math.sin(time*.035)*.15;
      this.target.copy(this.position).addScaledVector(this.forward,-10*Math.cos(angle)).addScaledVector(this.right,10*Math.sin(angle));this.target.y+=2.6;
      this.desiredLook.copy(this.position).addScaledVector(this.right,-3.2);this.desiredLook.y+=1;
    }else{
      if(!this.drag)this.orbit=damp(this.orbit,0,3,dt);
      const orbit=this.orbit+(this.mode===4?.7:0);
      this.target.copy(this.position).addScaledVector(this.forward,-distance*Math.cos(orbit)).addScaledVector(this.right,distance*Math.sin(orbit));
      this.target.y+=height-Math.sin(pose.surfacePitch)*distance;
      this.desiredLook.copy(this.position).addScaledVector(this.forward,lookAhead);this.desiredLook.y+=.85+Math.sin(pose.surfacePitch)*lookAhead;
    }
    // Sample the camera path against the existing driving surface and tunnel shell.
    if(this.mode!==2&&this.mode!==3){
      const anchor=this.position.clone();anchor.y+=1.6;
      for(let i=1;i<=12;i++){
        this.rayPoint.lerpVectors(anchor,this.target,i/12);
        const hit=this.surface(car,this.rayPoint.x,this.rayPoint.z,origin);
        const tunnel=car.road.isTunnel(hit.s);
        if(this.rayPoint.y<hit.height+.4||(tunnel&&(Math.abs(hit.offset)>8.55||this.rayPoint.y>car.road.height(hit.s)+6.2))){
          this.target.lerpVectors(anchor,this.target,Math.max(.3,(i-1)/12));break;
        }
      }
    }
    if(!this.initialized||this.camera.position.distanceTo(this.target)>300){
      this.camera.position.copy(this.target);this.look.copy(this.desiredLook);this.velocity.set(0,0,0);this.lookVelocity.set(0,0,0);this.initialized=true;
    }else{
      // Translation feed-forward avoids a large speed-dependent lag; the springs
      // still absorb steering, elevation, acceleration and camera-distance changes.
      const dx=this.position.x-this.previousPosition.x,dy=this.position.y-this.previousPosition.y,dz=this.position.z-this.previousPosition.z;
      this.camera.position.x+=dx*.92;this.camera.position.z+=dz*.92;this.camera.position.y+=dy*.65;
      this.look.x+=dx;this.look.z+=dz;this.look.y+=dy*.8;
      this.spring(this.camera.position,this.velocity,this.target,this.mode===2||this.mode===3?25:16-smoothing*7,dt);
      this.spring(this.look,this.lookVelocity,this.desiredLook,12,dt);
    }
    const surface=this.surface(car,this.camera.position.x,this.camera.position.z,origin),floor=surface.height+.35;
    if(this.camera.position.y<floor){this.camera.position.y=floor;this.velocity.y=Math.max(0,this.velocity.y);}
    if(car.road.isTunnel(surface.s)){
      this.camera.position.y=Math.min(this.camera.position.y,car.road.height(surface.s)+6.2);
      if(Math.abs(surface.offset)>8.55){const p=car.road.point(surface.s,clamp(surface.offset,-8.55,8.55));this.camera.position.x=p.x;this.camera.position.z=p.z+origin;this.velocity.x=this.velocity.z=0;}
    }
    this.previousPosition.copy(this.position);this.camera.lookAt(this.look);
    this.camera.fov=damp(this.camera.fov,fov+(menu||reduced?0:Math.min(4,speed*.065)),3,dt);this.camera.updateProjectionMatrix();
  }
}
