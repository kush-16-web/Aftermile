import * as THREE from 'three';
import { clamp, damp } from '../core/math.ts';
import type { VehiclePhysics, VehiclePose } from './VehiclePhysics.ts';
import type { VehicleConfig } from './VehicleConfig.ts';
import type { Road } from '../road/Road.ts';
export const cameraNames = ['Chase', 'Close Chase', 'Hood', 'Cockpit'];

export class CameraController {
  mode=0;target=new THREE.Vector3();look=new THREE.Vector3();initialized=false;orbit=0;drag=false;lastX=0;lastY=0;
  isGarageMode=false;
  isGarageTransitioning=false;
  garageYaw=0.65;
  garagePitch=0.18;
  garageDistance=6.6;
  targetGarageYaw=0.65;
  targetGaragePitch=0.18;
  targetGarageDistance=6.6;

  private velocity=new THREE.Vector3();private lookVelocity=new THREE.Vector3();private previousPosition=new THREE.Vector3();
  private heading=0;private desiredLook=new THREE.Vector3();private position=new THREE.Vector3();
  private forward=new THREE.Vector3();private right=new THREE.Vector3();private rayPoint=new THREE.Vector3();

  // 3D Chassis Orientation & Driver Eye Math Buffers
  private qGroup=new THREE.Quaternion();
  private qSurface=new THREE.Quaternion();
  private qBody=new THREE.Quaternion();
  private qChassis=new THREE.Quaternion();
  private eulerTemp=new THREE.Euler();
  private driverEyeLocal=new THREE.Vector3();
  private driverEyeWorld=new THREE.Vector3();
  private forwardDir=new THREE.Vector3();
  private readonly yAxis=new THREE.Vector3(0,1,0);

  constructor(public camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement,private config:VehicleConfig) {
    canvas.addEventListener('pointerdown',e=>{
      if((this.isGarageMode && !this.isGarageTransitioning) || e.button===2 || e.button===0){
        this.drag=true;
        this.lastX=e.clientX;
        this.lastY=e.clientY;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove',e=>{
      if(this.drag){
        if (this.isGarageMode && this.isGarageTransitioning) return;
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;

        if (this.isGarageMode) {
          this.targetGarageYaw += dx * 0.007;
          this.targetGaragePitch = clamp(this.targetGaragePitch - dy * 0.005, 0.04, 0.68);
        } else {
          this.orbit += dx * 0.006;
        }
      }
    });
    const release=()=>this.drag=false;
    canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
    if (typeof window !== 'undefined') {
      window.addEventListener('blur',release);
      window.addEventListener('wheel', e => {
        if (this.isGarageMode && !this.isGarageTransitioning) {
          this.targetGarageDistance = clamp(this.targetGarageDistance + Math.sign(e.deltaY) * 0.6, 4.6, 11.8);
        }
      }, { passive: true });
    }
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
  }
  setConfig(config: VehicleConfig) {
    this.config = config;
  }
  onModeChanged(previousMode?: number) {
    this.initialized = false;
    this.velocity.set(0, 0, 0);
    this.lookVelocity.set(0, 0, 0);
    // Instant snap when entering or exiting Cockpit (mode 3) to prevent flying through cabin geometry
    if (this.mode === 3 || previousMode === 3 || this.mode === 2 || previousMode === 2) {
      if (this.target.lengthSq() > 0) {
        this.camera.position.copy(this.target);
        this.look.copy(this.desiredLook);
        this.camera.lookAt(this.look);
      }
    }
  }
  setGarageMode(active: boolean, road?: Road, carS?: number, carOffset?: number) {
    this.isGarageMode = active;
    if (active) {
      let initialYaw = 0.65;
      if (road && typeof carS === 'number' && typeof carOffset === 'number') {
        const side: -1 | 1 = carOffset >= 0 ? 1 : -1;
        const hasBarrier = road.hasGuardrail(carS, side);
        // If barrier is on current shoulder side, orient camera from road-centerline side to avoid obstruction
        if (hasBarrier) {
          initialYaw = (side === 1) ? -0.65 : 0.65;
        }
      }
      this.targetGarageYaw = initialYaw;
      this.targetGaragePitch = 0.18;
      this.targetGarageDistance = 6.6;
    }
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
  update(
    dt: number,
    time: number,
    car: VehiclePhysics,
    pose: VehiclePose,
    origin: number,
    menu: boolean,
    fov: number,
    smoothing: number,
    reduced: boolean,
    driverEye?: THREE.Object3D
  ) {
    dt = Math.min(.05, dt);
    const c = this.config.camera;
    const p = car.road.point(pose.s, pose.offset);
    this.position.set(p.x, pose.height, p.z + origin);
    const wantedHeading = car.road.heading(pose.s) + pose.heading;
    if (!this.initialized) this.heading = wantedHeading;
    const error = Math.atan2(Math.sin(wantedHeading - this.heading), Math.cos(wantedHeading - this.heading));
    this.heading += error * (1 - Math.exp(-dt * (this.mode < 2 ? 4.5 : 10)));
    this.forward.set(Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.right.set(Math.cos(this.heading), 0, Math.sin(this.heading));
    const speed = Math.abs(car.speed);
    let distance = c.distance + Math.min(1.8, speed * .035) + (reduced ? 0 : clamp(car.acceleration * .075, -.3, .35)),
      height = c.height,
      lookAhead = c.lookAhead;
    if (this.mode === 1) { distance = c.closeDistance + Math.min(.8, speed * .018); height = c.closeHeight; lookAhead = 9; }
    if (this.mode === 2) { distance = c.hood[2]; height = c.hood[1]; lookAhead = 25; }
    if (this.mode === 4) { distance = 13; height = 5.4; lookAhead = 4; }

    if (this.isGarageMode) {
      // Smoothly damp showcase yaw, pitch and distance for responsive, fluid 360 inspection
      this.garageYaw = damp(this.garageYaw, this.targetGarageYaw, 14, dt);
      this.garagePitch = damp(this.garagePitch, this.targetGaragePitch, 14, dt);
      this.garageDistance = damp(this.garageDistance, this.targetGarageDistance, 12, dt);

      // Target look point centered on vehicle center of mass in the 3D world
      const centerOfMass = this.config.centerOfGravity || 0.45;
      const targetLook = this.position.clone();
      targetLook.y += centerOfMass + 0.20;

      // Orbit angle aligned with road heading + user manual orbit offset
      const roadHeading = car.road.heading(pose.s);
      const orbitAngle = roadHeading + this.garageYaw;

      const horizDist = this.garageDistance * Math.cos(this.garagePitch);
      const orbitX = this.position.x + Math.sin(orbitAngle) * horizDist;
      const orbitZ = this.position.z + Math.cos(orbitAngle) * horizDist;
      
      // Strict ground collision prevention: ensure camera never dips below road or ground
      const surfaceH = this.surface(car, orbitX, orbitZ - origin, origin).height;
      const wantedY = this.position.y + this.garageDistance * Math.sin(this.garagePitch);
      const orbitY = Math.max(surfaceH + 0.38, wantedY);

      this.target.set(orbitX, orbitY, orbitZ);
      this.desiredLook.copy(targetLook);
    } else if (menu) {
      const angle = .72 + Math.sin(time * .035) * .15;
      this.target.copy(this.position).addScaledVector(this.forward, -10 * Math.cos(angle)).addScaledVector(this.right, 10 * Math.sin(angle));
      this.target.y += 2.6;
      this.desiredLook.copy(this.position).addScaledVector(this.right, -3.2);
      this.desiredLook.y += 1;
    } else if (this.mode === 3) {
      // Direct Single-Authority DriverEye Socket Transform
      if (driverEye) {
        driverEye.updateWorldMatrix(true, false);
        driverEye.getWorldPosition(this.camera.position);
        driverEye.getWorldQuaternion(this.camera.quaternion);
        this.target.copy(this.camera.position);
      } else {
        // Direct chassis transform fallback
        const baseEye = this.config.camera.cockpit?.driverEye || (this.config.camera.driver as [number, number, number]) || [0.355, 1.050, -0.030];
        const roadHeading = car.road.heading(pose.s);
        const vehicleYaw = -roadHeading - pose.heading;
        this.qGroup.setFromAxisAngle(this.yAxis, vehicleYaw);
        this.eulerTemp.set(pose.surfacePitch, 0, pose.surfaceRoll, 'YXZ');
        this.qSurface.setFromEuler(this.eulerTemp);
        this.eulerTemp.set(pose.pitch, 0, pose.roll, 'YXZ');
        this.qBody.setFromEuler(this.eulerTemp);
        this.qChassis.copy(this.qGroup).multiply(this.qSurface).multiply(this.qBody);

        this.driverEyeLocal.set(baseEye[0], baseEye[1], baseEye[2]);
        this.driverEyeWorld.copy(this.driverEyeLocal).applyQuaternion(this.qChassis);
        this.camera.position.copy(this.position).add(this.driverEyeWorld);
        this.camera.quaternion.copy(this.qChassis);
        this.target.copy(this.camera.position);
      }
    } else if (this.mode === 2) {
      // Hood Camera: Mounted securely on hood center pointing forward down the road (FROZEN)
      const hoodDistance = Math.abs(c.hood[2]) || 1.45;
      const hoodHeight = c.hood[1] || 0.98;
      const hoodSide = c.hood[0] || 0;
      this.target.copy(this.position)
        .addScaledVector(this.forward, hoodDistance)
        .addScaledVector(this.right, hoodSide);
      this.target.y += hoodHeight;
      this.desiredLook.copy(this.position)
        .addScaledVector(this.forward, hoodDistance + 35)
        .addScaledVector(this.right, hoodSide);
      this.desiredLook.y += hoodHeight - 0.02 + Math.sin(pose.surfacePitch) * 35;
    } else {
      if (!this.drag) this.orbit = damp(this.orbit, 0, 3, dt);
      const orbit = this.orbit + (this.mode === 4 ? .7 : 0);
      this.target.copy(this.position).addScaledVector(this.forward, -distance * Math.cos(orbit)).addScaledVector(this.right, distance * Math.sin(orbit));
      this.target.y += height - Math.sin(pose.surfacePitch) * distance;
      this.desiredLook.copy(this.position).addScaledVector(this.forward, lookAhead);
      this.desiredLook.y += .85 + Math.sin(pose.surfacePitch) * lookAhead;
    }

    // Sample the camera path against the existing driving surface and tunnel shell only for chase cams.
    if (this.mode !== 2 && this.mode !== 3 && !this.isGarageMode) {
      const anchor = this.position.clone();
      anchor.y += 1.6;
      for (let i = 1; i <= 12; i++) {
        this.rayPoint.lerpVectors(anchor, this.target, i / 12);
        const hit = this.surface(car, this.rayPoint.x, this.rayPoint.z, origin);
        const tunnel = car.road.isTunnel(hit.s);
        if (this.rayPoint.y < hit.height + .4 || (tunnel && (Math.abs(hit.offset) > 8.55 || this.rayPoint.y > car.road.height(hit.s) + 6.2))) {
          this.target.lerpVectors(anchor, this.target, Math.max(.3, (i - 1) / 12));
          break;
        }
      }
    }

    if (!this.initialized || this.camera.position.distanceTo(this.target) > 300) {
      if (this.mode !== 3) {
        this.camera.position.copy(this.target);
        this.look.copy(this.desiredLook);
      }
      this.velocity.set(0, 0, 0);
      this.lookVelocity.set(0, 0, 0);
      this.initialized = true;
    } else {
      if (this.isGarageMode) {
        // Smooth cinematic spring into and within Garage presentation
        this.spring(this.camera.position, this.velocity, this.target, 10, dt);
        this.spring(this.look, this.lookVelocity, this.desiredLook, 12, dt);
      } else if (this.mode === 3) {
        // ZERO smoothing in Cockpit mode: rigid DriverEye transform hierarchy
      } else if (this.mode === 2) {
        // Hood Camera: Direct stable mount with exponential damping
        this.camera.position.x = damp(this.camera.position.x, this.target.x, 36, dt);
        this.camera.position.y = damp(this.camera.position.y, this.target.y, 36, dt);
        this.camera.position.z = damp(this.camera.position.z, this.target.z, 36, dt);

        this.look.x = damp(this.look.x, this.desiredLook.x, 30, dt);
        this.look.y = damp(this.look.y, this.desiredLook.y, 30, dt);
        this.look.z = damp(this.look.z, this.desiredLook.z, 30, dt);
      } else {
        // Chase Cameras: Smooth following spring
        const dx = this.position.x - this.previousPosition.x,
          dy = this.position.y - this.previousPosition.y,
          dz = this.position.z - this.previousPosition.z;
        this.camera.position.x += dx * .92;
        this.camera.position.z += dz * .92;
        this.camera.position.y += dy * .65;
        this.look.x += dx;
        this.look.z += dz;
        this.look.y += dy * .8;
        this.spring(this.camera.position, this.velocity, this.target, 16 - smoothing * 7, dt);
        this.spring(this.look, this.lookVelocity, this.desiredLook, 12, dt);
      }
    }

    if (this.mode !== 2 && this.mode !== 3) {
      const surface = this.surface(car, this.camera.position.x, this.camera.position.z, origin),
        floor = surface.height + .35;
      if (this.camera.position.y < floor) {
        this.camera.position.y = floor;
        this.velocity.y = Math.max(0, this.velocity.y);
      }
      if (car.road.isTunnel(surface.s)) {
        this.camera.position.y = Math.min(this.camera.position.y, car.road.height(surface.s) + 6.2);
        if (Math.abs(surface.offset) > 8.55) {
          const p = car.road.point(surface.s, clamp(surface.offset, -8.55, 8.55));
          this.camera.position.x = p.x;
          this.camera.position.z = p.z + origin;
          this.velocity.x = this.velocity.z = 0;
        }
      }
    }

    this.previousPosition.copy(this.position);
    // ONLY call lookAt for external cameras (Chase, Hood, Garage, Menu). ABSOLUTELY NO lookAt in Cockpit mode.
    if (this.mode !== 3) {
      this.camera.lookAt(this.look);
    }

    // Dynamic near plane: 0.05m in cockpit to eliminate dash/seat/wheel clipping; 0.08m in external cameras
    const targetNear = (this.mode === 3 && this.config.camera.cockpit?.near) ? this.config.camera.cockpit.near : 0.08;
    if (Math.abs(this.camera.near - targetNear) > 0.002) {
      this.camera.near = targetNear;
      this.camera.updateProjectionMatrix();
    }

    // Cockpit / FPP: subtle, restrained speed-responsive FOV (+0° to +6° max at 200 km/h) for natural optic flow
    const baseCockpitFov = this.config.camera.cockpit?.fov || 68;
    const speedKmh = speed * 3.6;
    const cockpitSpeedFov = Math.min(6.0, speedKmh * 0.03); // +1.8° at 60 km/h, +3.6° at 120 km/h, +4.8° at 160 km/h
    const targetFov = this.mode === 3 
      ? (baseCockpitFov + (reduced ? 0 : cockpitSpeedFov))
      : fov + (menu || reduced ? 0 : Math.min(3.5, speed * .05));
    this.camera.fov = damp(this.camera.fov, targetFov, 8, dt);
    this.camera.updateProjectionMatrix();
  }
}
