import { Road } from '../road/Road.ts';
import { createVehicleConfig } from './VehicleConfig.ts';
import type { VehicleConfig } from './VehicleConfig.ts';
import { VehiclePhysics } from './VehiclePhysics.ts';
import { PlayerVehicleModel } from './PlayerVehicleModel.ts';
import type { Controls } from './VehicleInput.ts';

export class VehicleController {
  config:VehicleConfig;physics:VehiclePhysics;model:PlayerVehicleModel;
  private audioSnapshot={speed:0,rpm:0,load:0,brake:0,slip:0,refueling:false};
  constructor(road:Road,definition?:VehicleConfig) {
    this.config=createVehicleConfig(definition);this.physics=new VehiclePhysics(road,this.config);this.model=new PlayerVehicleModel(this.config);
  }
  update(dt:number,input:Controls,fuel:boolean,damage:boolean){this.physics.update(dt,input,0,0,fuel,damage);}
  render(alpha:number,origin:number,night:number) {
    const pose=this.physics.interpolate(alpha),p=this.physics.road.point(pose.s,pose.offset);
    this.model.group.position.set(p.x,pose.height,p.z+origin);
    this.model.group.rotation.set(0,-this.physics.road.heading(pose.s)-pose.heading,0);
    this.model.animate(pose,this.physics.speed,Math.max(this.physics.brakeAmount,this.physics.input.handbrake),night);
    return pose;
  }
  audioState(){const p=this.physics,s=this.audioSnapshot;s.speed=p.speed;s.rpm=p.rpm;s.load=p.engineLoad;s.brake=p.brakeAmount;s.slip=p.slip;s.refueling=p.refueling;return s;}
}
