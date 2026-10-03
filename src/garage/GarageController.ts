import * as THREE from 'three';
import { angleDiff, clamp, lerp } from '../core/math.ts';
import type { PlayerVehicleModel } from '../vehicle/PlayerVehicleModel.ts';
import type { Road } from '../road/Road.ts';

export type GarageTransitionState = 'IDLE' | 'EXITING' | 'WAITING' | 'ENTERING' | 'SETTLING';

export interface GarageStateCallback {
  onStateChange?: (state: GarageTransitionState, currentVehicleId: string) => void;
  onVehicleChanged?: (vehicleId: string) => void;
}

/**
 * Showcase / Vehicle Selection Controller
 * Presents vehicles parked directly on the Aftermile road in the open world.
 * Derives a locked authoritative local road frame for each session.
 * Executes location-independent, path-tangent road-aligned departure and arrival transitions.
 */
export class GarageController {
  state: GarageTransitionState = 'IDLE';
  currentVehicleId: string;
  
  private transitionTimer = 0;
  private transitionDuration = 0;
  private departingModel: PlayerVehicleModel | null = null;
  private incomingModel: PlayerVehicleModel | null = null;
  private targetVehicleId = '';
  
  private road: Road | null = null;
  public presentationS = 160;
  public presentationOffset = 5.1;
  public presentationHeading = 0;
  private isFrameLocked = false;
  
  private exitDir: 1 | -1 = 1;
  private entryDir: 1 | -1 = -1;
  private wheelRotation = 0;
  private getModel: ((id: string) => PlayerVehicleModel | null) | null = null;
  public active = false;

  constructor(
    initialVehicleId: string,
    getModel: (id: string) => PlayerVehicleModel | null,
    private callbacks: GarageStateCallback = {}
  ) {
    this.currentVehicleId = initialVehicleId;
    this.getModel = getModel;
  }

  setRoad(road: Road, carS: number, carOffset: number, carHeading = 0) {
    this.road = road;
    if (!this.isFrameLocked) {
      this.presentationS = Math.max(10, carS);
      // Safe presentation anchor: center within active driving lane
      if (carOffset >= 0) {
        this.presentationOffset = clamp(carOffset, 3.2, 5.2);
      } else {
        this.presentationOffset = clamp(carOffset, -5.2, -3.2);
      }
      this.presentationHeading = Math.abs(carHeading) < 0.35 ? 0 : carHeading;
      this.isFrameLocked = true;
    }
  }

  public getPresentationWorldYaw(): number {
    if (!this.road) return 0;
    const roadHeading = this.road.heading(this.presentationS);
    return -roadHeading - this.presentationHeading;
  }

  public sampleRoadPose(model: PlayerVehicleModel, s: number, offset: number, worldYaw = 0, origin = 0) {
    if (!this.road) {
      return {
        position: new THREE.Vector3(),
        rotationY: 0,
        height: 0,
        surfacePitch: 0,
        surfaceRoll: 0,
        wheelHeights: [0, 0, 0, 0],
        relativeHeading: 0
      };
    }

    const config = model.config;
    const roadHeading = this.road.heading(s);
    const slope = this.road.slope(s);
    const arc = Math.hypot(1, slope);
    const baseGrade = this.road.grade(s);
    const baseBank = this.road.bank(s);

    // Relative heading between road tangent and vehicle world yaw
    const relHeading = angleDiff(-roadHeading, worldYaw);

    const cosH = Math.cos(relHeading), sinH = Math.sin(relHeading);
    const cp = Math.cos(baseGrade), sp = Math.sin(baseGrade);
    const cr = Math.cos(baseBank), sr = Math.sin(baseBank);

    const wheelHeights = [0, 0, 0, 0];
    let totalH = 0;

    for (let i = 0; i < 4; i++) {
      const [wx, , wz] = config.wheelPositions[i];
      const px = wx * cr;
      const pz = wx * sr * sp + wz * cp;
      const wheelS = s + (-pz * cosH - px * sinH) / arc;
      const wheelOffset = offset - pz * sinH + px * cosH;
      const pt = this.road.point(wheelS, wheelOffset);
      const station = this.road.station(wheelS - 50);
      let groundY = pt.y;
      if (!this.road.isBridge(wheelS) && !this.road.isTunnel(wheelS) && !(Math.abs(wheelS - station) < 65 && wheelOffset > 0)) {
        groundY = lerp(pt.y, this.road.terrain(wheelS, wheelOffset), clamp((Math.abs(wheelOffset) - 9) / 3, 0, 1));
      }
      wheelHeights[i] = groundY;
      totalH += groundY;
    }

    const height = totalH / 4;
    const surfacePitch = Math.asin(clamp((wheelHeights[0] + wheelHeights[1] - wheelHeights[2] - wheelHeights[3]) / (2 * config.wheelbase), -0.95, 0.95));
    const surfaceRoll = Math.asin(clamp((wheelHeights[1] + wheelHeights[3] - wheelHeights[0] - wheelHeights[2]) / (2 * config.trackWidth * Math.cos(surfacePitch)), -0.95, 0.95));

    const centerPt = this.road.point(s, offset);
    const position = new THREE.Vector3(centerPt.x, height, centerPt.z + origin);

    return {
      position,
      rotationY: worldYaw,
      height,
      surfacePitch,
      surfaceRoll,
      wheelHeights,
      relativeHeading: relHeading
    };
  }

  /**
   * Evaluates the departure path (s, offset) at normalized progress t [0..1]
   */
  private evaluateExitPath(t: number): { s: number; offset: number } {
    const s0 = this.presentationS;
    const offset0 = this.presentationOffset;
    const prog = Math.pow(clamp(t, 0, 1), 1.5);
    const s = s0 + this.exitDir * (prog * 36.0);
    const offset = offset0 - (prog * 0.8 * Math.sign(offset0));
    return { s, offset };
  }

  /**
   * Evaluates the arrival path (s, offset) at normalized progress t [0..1]
   */
  private evaluateEntryPath(t: number): { s: number; offset: number } {
    const s0 = this.presentationS;
    const offset0 = this.presentationOffset;
    const prog = 1.0 - Math.pow(1.0 - clamp(t, 0, 1), 1.8);
    const s = s0 + this.entryDir * (32.0 * (1.0 - prog));
    const lateralProg = prog * prog * (3 - 2 * prog); // smoothstep
    const entryOffset = offset0 - 1.2 * Math.sign(offset0);
    const offset = lerp(entryOffset, offset0, lateralProg);
    return { s, offset };
  }

  /**
   * Derives true path-tangent orientation and visual front steering from trajectory lookahead
   */
  private derivePathKinematics(
    evaluatePath: (u: number) => { s: number; offset: number },
    t: number,
    wheelbase: number
  ): { s: number; offset: number; worldYaw: number; steer: number } {
    if (!this.road) {
      return { s: 0, offset: 0, worldYaw: 0, steer: 0 };
    }

    const curr = evaluatePath(t);
    const p0 = this.road.point(curr.s, curr.offset);

    // Lookahead sample for instantaneous velocity vector
    const tAhead1 = Math.min(1.0, t + 0.015);
    let worldYaw = this.getPresentationWorldYaw();
    let steer = 0;

    if (tAhead1 > t || t > 0) {
      const u1 = tAhead1 > t ? tAhead1 : t;
      const u0 = tAhead1 > t ? t : Math.max(0, t - 0.015);
      const ptA = this.road.point(evaluatePath(u0).s, evaluatePath(u0).offset);
      const ptB = this.road.point(evaluatePath(u1).s, evaluatePath(u1).offset);
      const dx = ptB.x - ptA.x;
      const dz = ptB.z - ptA.z;
      if (Math.hypot(dx, dz) > 0.0001) {
        worldYaw = Math.atan2(dx, -dz);
      }

      // Second lookahead sample for path curvature and front-wheel Ackermann steering
      const tAhead2 = Math.min(1.0, u1 + 0.030);
      if (tAhead2 > u1) {
        const ptC = this.road.point(evaluatePath(tAhead2).s, evaluatePath(tAhead2).offset);
        const dx2 = ptC.x - ptB.x;
        const dz2 = ptC.z - ptB.z;
        if (Math.hypot(dx2, dz2) > 0.0001) {
          const yaw2 = Math.atan2(dx2, -dz2);
          const deltaYaw = angleDiff(worldYaw, yaw2);
          const dist = Math.hypot(dx, dz) + Math.hypot(dx2, dz2);
          const curvature = deltaYaw / (dist * 0.5 + 0.001);
          steer = clamp(-curvature * wheelbase * 1.3, -0.42, 0.42);
        }
      }
    }

    return { s: curr.s, offset: curr.offset, worldYaw, steer };
  }

  private stageModelAtEntry(model: PlayerVehicleModel, origin: number) {
    if (!this.road) return;
    const kinematics = this.derivePathKinematics(u => this.evaluateEntryPath(u), 0, model.config.wheelbase);
    const sample = this.sampleRoadPose(model, kinematics.s, kinematics.offset, kinematics.worldYaw, origin);
    
    model.group.position.copy(sample.position);
    model.group.rotation.set(0, sample.rotationY, 0);

    const pose = {
      s: kinematics.s, offset: kinematics.offset, heading: sample.relativeHeading, height: sample.height, steering: kinematics.steer,
      surfacePitch: sample.surfacePitch, surfaceRoll: sample.surfaceRoll, roll: 0, pitch: 0, heave: 0,
      wheelHeights: sample.wheelHeights,
      wheelSpins: [0, 0, 0, 0],
      wheelSpin: 0
    };
    model.animate(pose, 18.0, 0, 0);
  }

  setActive(active: boolean) {
    this.active = active;
    if (!active) {
      this.state = 'IDLE';
      this.isFrameLocked = false;
      if (this.departingModel) {
        this.departingModel.setOpacity(1.0);
        this.departingModel.group.visible = false;
      }
      if (this.incomingModel) {
        this.incomingModel.setOpacity(1.0);
      }
      this.departingModel = null;
      this.incomingModel = null;
    }
  }

  isBusy(): boolean {
    return this.state !== 'IDLE';
  }

  requestTransition(targetId: string, _direction: 'next' | 'prev' = 'next'): boolean {
    if (this.isBusy() || targetId === this.currentVehicleId || !this.getModel) return false;
    
    this.targetVehicleId = targetId;
    this.departingModel = this.getModel(this.currentVehicleId);
    this.incomingModel = this.getModel(targetId);
    
    if (!this.incomingModel || !this.departingModel) return false;

    // Minimum-turn exit direction selection
    const diffPos = Math.abs(angleDiff(this.presentationHeading, 0));
    const diffNeg = Math.abs(angleDiff(this.presentationHeading, Math.PI));
    this.exitDir = (diffPos <= diffNeg) ? 1 : -1;
    this.entryDir = (this.exitDir === 1) ? -1 : 1;

    // Reset departing model opacity
    this.departingModel.setOpacity(1.0);
    this.departingModel.group.visible = true;

    // Stage incoming model at the far entry pose while HIDDEN
    this.incomingModel.group.visible = false;
    this.incomingModel.setOpacity(1.0);
    this.stageModelAtEntry(this.incomingModel, 0);

    // Start road exit sequence (1.3s)
    this.state = 'EXITING';
    this.transitionTimer = 0;
    this.transitionDuration = 1.3;
    this.wheelRotation = 0;

    this.callbacks.onStateChange?.(this.state, this.currentVehicleId);
    return true;
  }

  update(dt: number, origin: number) {
    if (!this.road) return;

    if (this.state === 'IDLE') {
      // Maintain continuous 4-wheel road grounding for active showcase vehicle
      if (this.getModel) {
        const activeModel = this.getModel(this.currentVehicleId);
        if (activeModel && activeModel.ready) {
          const worldYaw = this.getPresentationWorldYaw();
          const sample = this.sampleRoadPose(activeModel, this.presentationS, this.presentationOffset, worldYaw, origin);
          activeModel.group.position.copy(sample.position);
          activeModel.group.rotation.set(0, sample.rotationY, 0);
          activeModel.group.visible = true;
          activeModel.setOpacity(1.0);

          const pose = {
            s: this.presentationS, offset: this.presentationOffset, heading: sample.relativeHeading,
            height: sample.height, steering: 0, surfacePitch: sample.surfacePitch, surfaceRoll: sample.surfaceRoll,
            roll: 0, pitch: 0, heave: 0, wheelHeights: sample.wheelHeights,
            wheelSpins: [0, 0, 0, 0], wheelSpin: 0
          };
          activeModel.animate(pose, 0, 0, 0);
        }
      }
      return;
    }

    this.transitionTimer += dt;
    const t = Math.min(1.0, this.transitionTimer / this.transitionDuration);

    if (this.state === 'EXITING' && this.departingModel) {
      // Outgoing vehicle drives forward following the path tangent
      const kinematics = this.derivePathKinematics(u => this.evaluateExitPath(u), t, this.departingModel.config.wheelbase);
      const prog = Math.pow(t, 1.5);
      const speed = prog * 18.0;

      const wheelRadius = this.departingModel.config.wheelRadius || 0.34;
      this.wheelRotation += (speed * dt) / wheelRadius;

      // Distance fade at the far end of the exit (t: 0.75 -> 1.0)
      let opacity = 1.0;
      if (t > 0.75) {
        const fadeT = (t - 0.75) / 0.25;
        opacity = 1.0 - Math.pow(fadeT, 1.8);
      }
      this.departingModel.setOpacity(opacity);

      const sample = this.sampleRoadPose(this.departingModel, kinematics.s, kinematics.offset, kinematics.worldYaw, origin);
      this.departingModel.group.position.copy(sample.position);
      this.departingModel.group.rotation.set(0, sample.rotationY, 0);
      this.departingModel.group.visible = true;

      const pose = {
        s: kinematics.s, offset: kinematics.offset, heading: sample.relativeHeading, height: sample.height, steering: kinematics.steer,
        surfacePitch: sample.surfacePitch, surfaceRoll: sample.surfaceRoll, roll: 0, pitch: 0, heave: 0,
        wheelHeights: sample.wheelHeights,
        wheelSpins: [this.wheelRotation, this.wheelRotation, this.wheelRotation, this.wheelRotation],
        wheelSpin: this.wheelRotation
      };
      this.departingModel.animate(pose, speed, 0, 0);

      if (t >= 1.0) {
        this.departingModel.group.visible = false;
        this.departingModel.setOpacity(1.0);
        this.state = 'ENTERING';
        this.transitionTimer = 0;
        this.transitionDuration = 1.6; // 1.6s entrance along road
        this.wheelRotation = 0;
        
        if (this.incomingModel) {
          this.stageModelAtEntry(this.incomingModel, origin);
          this.incomingModel.setOpacity(1.0);
          this.incomingModel.group.visible = true;
        }
        this.callbacks.onStateChange?.(this.state, this.targetVehicleId);
      }
    } else if (this.state === 'ENTERING' && this.incomingModel) {
      // Incoming car drives along the trajectory, smoothly straightens, and decelerates
      const kinematics = this.derivePathKinematics(u => this.evaluateEntryPath(u), t, this.incomingModel.config.wheelbase);
      const prog = 1.0 - Math.pow(1.0 - t, 1.8);
      const speed = lerp(18.0, 0, prog);
      const brakeVal = t > 0.65 ? clamp((t - 0.65) / 0.35, 0, 1) : 0;

      const wheelRadius = this.incomingModel.config.wheelRadius || 0.34;
      this.wheelRotation += (speed * dt) / wheelRadius;

      const sample = this.sampleRoadPose(this.incomingModel, kinematics.s, kinematics.offset, kinematics.worldYaw, origin);
      this.incomingModel.group.position.copy(sample.position);
      this.incomingModel.group.rotation.set(0, sample.rotationY, 0);
      this.incomingModel.setOpacity(1.0);
      this.incomingModel.group.visible = true;

      const pose = {
        s: kinematics.s, offset: kinematics.offset, heading: sample.relativeHeading, height: sample.height, steering: kinematics.steer,
        surfacePitch: sample.surfacePitch, surfaceRoll: sample.surfaceRoll, roll: 0, pitch: 0, heave: 0,
        wheelHeights: sample.wheelHeights,
        wheelSpins: [this.wheelRotation, this.wheelRotation, this.wheelRotation, this.wheelRotation],
        wheelSpin: this.wheelRotation
      };
      this.incomingModel.animate(pose, speed, brakeVal, 0);

      if (t >= 1.0) {
        this.state = 'SETTLING';
        this.transitionTimer = 0;
        this.transitionDuration = 0.35; // 0.35s suspension settle
        this.callbacks.onStateChange?.(this.state, this.targetVehicleId);
      }
    } else if (this.state === 'SETTLING' && this.incomingModel) {
      // Suspension settle at the EXACT authoritative presentation pose
      const pitchSettle = Math.sin(t * Math.PI) * 0.008 * (1.0 - t);
      const worldYaw = this.getPresentationWorldYaw();
      const sample = this.sampleRoadPose(this.incomingModel, this.presentationS, this.presentationOffset, worldYaw, origin);

      this.incomingModel.group.position.copy(sample.position);
      this.incomingModel.group.rotation.set(0, sample.rotationY, 0);
      this.incomingModel.setOpacity(1.0);
      this.incomingModel.group.visible = true;

      const pose = {
        s: this.presentationS, offset: this.presentationOffset, heading: sample.relativeHeading, height: sample.height, steering: 0,
        surfacePitch: sample.surfacePitch, surfaceRoll: sample.surfaceRoll, roll: 0, pitch: pitchSettle, heave: 0,
        wheelHeights: sample.wheelHeights, wheelSpins: [0, 0, 0, 0], wheelSpin: 0
      };
      this.incomingModel.animate(pose, 0, 0, 0);

      if (t >= 1.0) {
        this.currentVehicleId = this.targetVehicleId;
        this.departingModel = null;
        this.incomingModel = null;
        this.state = 'IDLE';
        this.callbacks.onVehicleChanged?.(this.currentVehicleId);
        this.callbacks.onStateChange?.('IDLE', this.currentVehicleId);
      }
    }
  }

  dispose() {
    if (this.departingModel) {
      this.departingModel.setOpacity(1.0);
    }
    if (this.incomingModel) {
      this.incomingModel.setOpacity(1.0);
    }
    this.departingModel = null;
    this.incomingModel = null;
  }
}
