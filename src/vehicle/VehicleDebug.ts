import type { VehicleController } from './VehicleController.ts';
import type { VehicleConfig } from './VehicleConfig.ts';

/** Imported only inside import.meta.env.DEV; absent from the production bundle. */
export class VehicleDebug {
  private panel=document.createElement('aside');private telemetry=document.createElement('pre');
  private fields:{input:HTMLInputElement;path:string}[]=[];
  private defaults:VehicleConfig;
  constructor(private vehicle:VehicleController,private resetCamera:()=>void) {
    this.defaults=structuredClone(vehicle.config);
    this.panel.hidden=true;this.panel.setAttribute('aria-label','Vehicle development tuning');
    this.panel.style.cssText='position:fixed;z-index:1000;right:12px;top:12px;width:340px;max-height:90vh;overflow:auto;padding:18px;background:#101721f5;border:1px solid #597480;border-radius:12px;color:#ecf5f7;font:13px/1.5 monospace;box-shadow:0 8px 35px #0008';
    const title=document.createElement('strong');title.textContent='VEHICLE DEVELOPMENT · F2';this.panel.append(title,this.telemetry);
    const speedLabel=document.createElement('label');speedLabel.textContent='Test speed (km/h) ';
    const speed=document.createElement('select');speed.setAttribute('aria-label','Vehicle test speed');
    for(const v of [0,10,30,60,100,130,160]){const option=new Option(String(v),String(v));speed.add(option);}speedLabel.append(speed);this.panel.append(speedLabel);
    const setSpeed=document.createElement('button');setSpeed.textContent='Set speed';setSpeed.onclick=()=>{
      const p=this.vehicle.physics;p.reset();p.speed=Number(speed.value)/3.6;
      while(p.gear<this.vehicle.config.engine.gears.length&&p.speed/this.vehicle.config.wheelRadius*this.vehicle.config.engine.gears[p.gear-1]*this.vehicle.config.engine.finalDrive*60/(Math.PI*2)>5500)p.gear++;
      this.resetCamera();
    };this.panel.append(setSpeed);
    const specs:[string,string,number,number,number][]=[
      ['Mass (kg)','mass',1200,2300,25],['CG height (m)','centerOfGravity',.3,.8,.01],
      ['Keyboard ramp /s','steering.inputRate',1,5,.1],['Highway ramp /s','steering.highwayInputRate',1,4,.1],
      ['Steering rack response','steering.response',6,18,.5],['Highway rack response','steering.highwayResponse',6,18,.5],['Input return /s','steering.returnRate',2,8,.1],
      ['Yaw damping','steering.yawDamping',0,2.5,.02],['Dry tire grip','tires.grip',.6,1.25,.01],
      ['Spring (N/m per wheel)','suspension.stiffness',20000,50000,1000],['Damper (Ns/m per wheel)','suspension.damping',2000,5500,100],
      ['Brake force (N)','brakes.force',9000,23000,500],['Engine power (kW)','engine.powerKw',160,400,5],['Engine force cap (N)','engine.maxDriveForce',5000,11000,250],['Drag area (m²)','dragArea',.45,1.1,.01],
    ];
    for(const [name,path,min,max,step] of specs){
      const label=document.createElement('label');label.style.cssText='display:flex;justify-content:space-between;gap:12px;margin-top:9px';label.append(document.createTextNode(name));
      const input=document.createElement('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(this.get(path));input.style.cssText='width:85px;background:#1c2833;color:white;border:1px solid #48606b;padding:4px';
      input.onchange=()=>{const n=input.valueAsNumber;if(Number.isFinite(n)){this.set(path,Math.max(min,Math.min(max,n)));input.value=String(this.get(path));}};
      label.append(input);this.panel.append(label);this.fields.push({input,path});
    }
    const reset=document.createElement('button');reset.textContent='Restore '+vehicle.config.name+' tune';reset.style.marginTop='12px';reset.onclick=()=>{Object.assign(this.vehicle.config,structuredClone(this.defaults));this.vehicle.physics.reset();this.resetCamera();this.fields.forEach(f=>f.input.value=String(this.get(f.path)));};this.panel.append(reset);
    const note=document.createElement('p');note.textContent='Changes last until reload. Test on a clear road. W/A/S/D, Space, L and R keep their usual functions.';this.panel.append(note);document.body.append(this.panel);
  }
  private get(path:string):number{return path.split('.').reduce((o,k)=>o[k],this.vehicle.config as any);}
  private set(path:string,value:number){const parts=path.split('.'),key=parts.pop()!;parts.reduce((o,k)=>o[k],this.vehicle.config as any)[key]=value;}
  toggle(){this.panel.hidden=!this.panel.hidden;this.update();}
  update(){if(this.panel.hidden)return;const p=this.vehicle.physics,deg=180/Math.PI;
    this.telemetry.textContent=[`Speed       ${(p.speed*3.6).toFixed(1)} km/h`,`RPM / gear  ${Math.round(p.rpm)} / ${p.speed<-.1?'R':p.gear}`,`Steer input ${p.input.steering.toFixed(3)}`,`Steer angle ${(p.steering*deg).toFixed(2)}° / ${(p.maxSteeringAngle*deg).toFixed(2)}°`,`Yaw rate    ${(p.yawRate*deg).toFixed(2)}°/s`,`Lateral g   ${(p.lateralAcceleration/9.81).toFixed(2)}`,`Body slip   ${p.bodyLateralVelocity.toFixed(2)} m/s`,`Roll/pitch  ${(p.roll*deg).toFixed(2)}° / ${(p.pitch*deg).toFixed(2)}°`,`Suspension  ${(p.heave*1000).toFixed(1)} mm`,`Brake/load  ${p.brakeAmount.toFixed(2)} / ${p.throttle.toFixed(2)}`,`Headlights  ${this.vehicle.model.lights.mode}`].join('\n');
  }
}
