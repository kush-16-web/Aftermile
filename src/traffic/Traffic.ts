import * as THREE from 'three';
import { hash, damp, clamp } from '../core/math.ts';
import { Road } from '../road/Road.ts';
import { TrafficModel } from '../vehicle/TrafficModel.ts';
import type { VehiclePhysics } from '../vehicle/VehiclePhysics.ts';
type Car={model:TrafficModel;s:number;offset:number;lane:number;speed:number;base:number;direction:number;cooldown:number;active:boolean;id:number;braking:boolean};
export function signalState(time:number) {const cycle=time%34;return cycle<22?0:cycle<25?1:2;}
export function upcomingSignal(s:number,road:Road,direction=1) {
  const index=Math.floor(s/160);
  for(let k=0;k<8;k++){const i=index+k*direction,at=i*160+120;if(i%5===0&&road.region(at).biome==='city'&&(at-s)*direction>0)return at;}
  return Infinity*direction;
}
export class Traffic {
  pool:Car[]=[];sense=0;nearMisses=0;spawnSerial=0;
  constructor(public scene:THREE.Scene,public road:Road) {
    const types=['compact','sedan','taxi','suv','pickup','truck'];const colors=[0x739294,0xddd8bd,0xdba747,0x314853,0x9c584b,0x7c8792];
    for(let i=0;i<22;i++){const type=types[i%6],model=new TrafficModel(colors[i%6],type);scene.add(model.group);model.group.visible=false;this.pool.push({model,s:0,offset:0,lane:0,speed:0,base:type==='truck'?17:22+hash(i)*12,direction:1,cooldown:0,active:false,id:i,braking:false});}
  }
  update(dt:number,time:number,player:VehiclePhysics,origin:number,density:number,night:number,wet:number,damage:boolean,move=true) {
    const biome=this.road.region(player.s).biome;
    const count=Math.floor(clamp(density,0,1)*(biome==='city'?22:14)*(1-night*.25));
    this.sense=damp(this.sense,0,5,dt);
    for(let i=0;i<this.pool.length;i++) {
      const car=this.pool[i];
      if(i>=count){car.active=false;car.model.group.visible=false;continue;}
      if(!car.active||Math.abs(car.s-player.s)>850) {
        car.active=true;car.direction=i%3===0?-1:1;car.lane=car.direction*(i%2===0?2:6);car.offset=car.lane;
        const serial=this.spawnSerial++;car.s=player.s+120+hash(serial+1,this.road.seed)*600;
        if(car.direction===1&&i%5===2)car.s=Math.max(0,player.s-180-hash(serial+2)*160);
        for(let retries=0;retries<10&&this.pool.some(other=>other!==car&&other.active&&Math.abs(other.s-car.s)<22&&Math.abs(other.offset-car.offset)<3);retries++)car.s+=28;
        car.speed=car.base;car.cooldown=3+hash(serial)*8;car.model.group.visible=true;
      }
      let desired=car.base*(1-wet*.22),gap=Infinity,leadSpeed=desired;
      for(const other of this.pool) {
        if(other===car||!other.active||other.direction!==car.direction||Math.abs(other.offset-car.offset)>2.6)continue;
        const d=(other.s-car.s)*car.direction-6.5;
        if(d>0&&d<gap){gap=d;leadSpeed=other.speed;}
      }
      const playerGap=(player.s-car.s)*car.direction-6.5;
      if(Math.abs(player.offset-car.offset)<2.7&&playerGap>0&&playerGap<gap){gap=playerGap;leadSpeed=Math.max(0,player.speed*car.direction);}
      if(gap<10+car.speed*1.7)desired=Math.min(desired,Math.max(0,leadSpeed+(gap-8-car.speed)*.42));
      const signal=upcomingSignal(car.s,this.road,car.direction),signalGap=(signal-car.s)*car.direction-11;
      if(signalState(time)!==0&&signalGap>0&&signalGap<110)desired=Math.min(desired,Math.sqrt(Math.max(0,signalGap-3)*4.5));
      if(move) {
        car.cooldown-=dt;
        if(gap<45&&car.cooldown<=0&&!this.road.isTunnel(car.s)) {
          const newLane=car.direction*(Math.abs(car.lane)===2?6:2);
          const clear=this.pool.every(o=>o===car||!o.active||Math.abs(o.offset-newLane)>2.8||Math.abs(o.s-car.s)>42);
          if(clear&&!(Math.abs(player.offset-newLane)<2.8&&Math.abs(player.s-car.s)<40)){car.lane=newLane;car.cooldown=8;}
        }
        car.braking=desired<car.speed-1;car.speed=damp(car.speed,desired,desired<car.speed?2.2:.5,dt);
        // Physical cap keeps a queue from creeping through a stopped lead car or red signal.
        let movement=car.speed*dt;
        if(gap<movement+2)movement=Math.max(0,gap-2);
        if(signalState(time)!==0&&signalGap>0&&signalGap<movement+2)movement=Math.max(0,signalGap-2);
        car.s+=movement*car.direction;car.offset=damp(car.offset,car.lane,1.6,dt);
      }
      const pos=this.road.point(car.s,car.offset);
      car.model.group.position.set(pos.x,pos.y,pos.z+origin);car.model.group.rotation.set(-Math.atan(this.road.grade(car.s))*car.direction,-this.road.heading(car.s)+(car.direction<0?Math.PI:0),this.road.bank(car.s));
      car.model.animate(move?dt:0,car.speed,0,car.braking,night);
      if(move) {
        const delta=car.s-player.s,closing=player.speed-car.speed*car.direction;
        if(delta>0&&delta<Math.max(12,closing*2.2)&&Math.abs(car.offset-player.offset)<2.8&&closing>2)this.sense=Math.max(this.sense,clamp(1-delta/(closing*2.6),0,1));
        const bounds=player.collisionExtents(),halfLength=bounds.halfLength+(car.id%6===5?4.5:2.15);
        const swept=Math.min(player.previousS,player.s)-halfLength<car.s&&Math.max(player.previousS,player.s)+halfLength>car.s;
        if(swept&&Math.abs(car.offset-player.offset)<bounds.halfWidth+.94&&player.collisionTimer===0) {
          player.collide(damage,.8);player.offset+=player.offset>=car.offset?.4:-.4;
          car.speed*=.75;this.sense=1;
        }
      }
    }
  }
  reset(){this.pool.forEach(c=>{c.active=false;c.model.group.visible=false;});}
}
