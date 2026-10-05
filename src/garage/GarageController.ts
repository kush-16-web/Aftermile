import * as THREE from 'three';
import { angleDiff, clamp, lerp } from '../core/math.ts';
import type { PlayerVehicleModel } from '../vehicle/PlayerVehicleModel.ts';
import type { Road } from '../road/Road.ts';

export type GarageTransitionState = 'IDLE' | 'EXITING' | 'WAITING' | 'ENTERING' | 'SETTLING';

export interface GarageStateCallback {
  onStateChange?: (state: GarageTransitionState, currentVehicleId: string) => void;
  onVehicleChanged?: (vehicleId: string) => void;
}

export interface TransitionTelemetry {
  presentationSlipAngleDeg: number;
  forwardVelocityDot: number;
  wheelRollRadians: number;
  steerAngleDeg: number;
  handoffPositionDiff: number;
  handoffAngularDiffDeg: number;
}

/**
 * Showcase / Vehicle Selection Controller
 * Presents vehicles parked directly on the Aftermile road in the open world.
 * Derives a locked authoritative local road frame for each session.
 * Executes continuous C2 path-tangent road-aligned departure and arrival transitions.
 * - Outgoing path start tangent strictly equals parked forward (0 initial snap).
 * - Incoming path end tangent strictly equals parked forward (0 final snap).
 * - Front wheels steer Ackermann with path curvature and center on straightening.
 * - All wheels roll proportionally to exact 3D distance travelled: dTheta = dDist / R_wheel.
 * - Presentation slip angle is virtually zero (no sideways gliding).
 * - Continuous 4-wheel road grounding on flat, sloped, and banked roads.
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
  
  /** Locked longitudinal heading direction: +1 along +s, -1 along -s */
  private headingDir: 1 | -1 = 1;
  private wheelRotation = 0;
  private prevWorldPosition = new THREE.Vector3();
  private hasPrevPosition = false;
  private getModel: ((id: string) => PlayerVehicleModel | null) | null = null;
  public active = false;

  /** Slow-motion multiplier for visual inspection (e.g. 0.25x) */
  public speedMultiplier = 1.0;

  /** Diagnostic Telemetry */
  public telemetry: TransitionTelemetry = {
    presentationSlipAngleDeg: 0,
    forwardVelocityDot: 1.0,
    wheelRollRadians: 0,
    steerAngleDeg: 0,
    handoffPositionDiff: 0,
    handoffAngularDiffDeg: 0
  };

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
      // Authoritative parking presentation is always road-lane aligned
      this.presentationHeading = 0;
      this.headingDir = 1;
      this.isFrameLocked = true;
    }
  }

  /**
   * Computes the authoritative parked world yaw for the showcase vehicle.
   */
  public getPresentationWorldYaw(): number {
    if (!this.road) return 0;
    const roadHeading = this.road.heading(this.presentationS);
    return -roadHeading;
  }

  /**
   * Ground sampler: Computes accurate road surface contact height, pitch, and roll for all 4 wheels.
   */
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

    // Relative heading between road tangent and vehicle world yaw (-roadHeading - worldYaw)
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
   * Quintic smootherstep polynomial (C2 continuous: S(0)=0, S'(0)=0, S''(0)=0, S(1)=1, S'(1)=0, S''(1)=0)
   */
  private smootherstep(u: number): number {
    const x = clamp(u, 0, 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  /**
   * Evaluates the departure path (s, offset) at normalized progress t [0..1].
   * - Forward Commit Section (t in [0, 0.28]): Strictly straight forward in parking lane (offset === offset0).
   *   Guaranteed 0 initial angular discontinuity (exitPathTangent(0) === parkedForward).
   * - Gradual Steering Section (t in [0.28, 0.85]): Smooth C2 lane shift toward road center.
   * - Exit Section (t in [0.85, 1.0]): Accelerates down the open highway and fades out.
   */
  public evaluateExitPath(t: number): { s: number; offset: number } {
    const s0 = this.presentationS;
    const offset0 = this.presentationOffset;
    // Progressive forward acceleration down the road (42m total)
    const prog = Math.pow(clamp(t, 0, 1), 1.65);
    const s = s0 + prog * 42.0;
    
    // Forward commit distance: strictly 0 lateral shift for the first 28% of travel (straight rollout)
    const latStart = 0.28;
    const latU = t > latStart ? clamp((t - latStart) / (0.85 - latStart), 0, 1) : 0;
    const latProg = this.smootherstep(latU);
    // Smooth lane shift toward the central corridor
    const lateralShift = 2.2 * Math.sign(offset0);
    const offset = offset0 - latProg * lateralShift;
    return { s, offset };
  }

  /**
   * Evaluates the arrival path (s, offset) at normalized progress t [0..1].
   * - Staged 48m back along the highway in the main driving lane.
   * - Approach & Curve Section (t in [0.15, 0.68]): Smooth C2 merge into the presentation parking lane.
   * - Final Straightening Section (t in [0.68, 1.0]): Strictly straight in parking lane (offset === offset0).
   *   Front wheels center, vehicle decelerates progressively, and stops ALREADY facing the parked heading.
   */
  public evaluateEntryPath(t: number): { s: number; offset: number } {
    const s0 = this.presentationS;
    const offset0 = this.presentationOffset;
    // Smooth braking deceleration into the parking slot (48m approach)
    const prog = 1.0 - Math.pow(1.0 - clamp(t, 0, 1), 2.35);
    const s = s0 - 48.0 * (1.0 - prog);
    
    // Staged in the main driving lane, merges into parking lane between t=0.15 and t=0.68
    const latEnd = 0.68;
    const latU = clamp((t - 0.15) / (latEnd - 0.15), 0, 1);
    const latProg = this.smootherstep(latU);
    const entryOffset = offset0 - 2.4 * Math.sign(offset0);
    // Final 32% (t >= 0.68) is 100% straight along offset0 into the parking spot
    const offset = lerp(entryOffset, offset0, latProg);
    return { s, offset };
  }

  /**
   * Derives true path-tangent orientation and front Ackermann steering from trajectory lookahead.
   * Ensures vehicle forward vector (-Z in Three.js) is 100% collinear with path travel direction.
   */
  public derivePathKinematics(
    evaluatePath: (u: number) => { s: number; offset: number },
    t: number,
    wheelbase: number,
    isEntry = false
  ): { s: number; offset: number; worldYaw: number; steer: number; pathTangent: THREE.Vector3 } {
    if (!this.road) {
      return { s: 0, offset: 0, worldYaw: 0, steer: 0, pathTangent: new THREE.Vector3(0, 0, -1) };
    }

    const curr = evaluatePath(t);

    // Lookahead forward sample for instantaneous velocity vector
    const eps = 0.008;
    const u0 = Math.max(0, Math.min(1.0 - eps, t));
    const u1 = u0 + eps;
    const ptA = this.road.point(evaluatePath(u0).s, evaluatePath(u0).offset);
    const ptB = this.road.point(evaluatePath(u1).s, evaluatePath(u1).offset);
    const dx = ptB.x - ptA.x;
    const dz = ptB.z - ptA.z;
    const len = Math.hypot(dx, dz);

    let worldYaw = this.getPresentationWorldYaw();
    const pathTangent = new THREE.Vector3(0, 0, -1);

    if (len > 0.00001) {
      // Vehicle forward is -Z in Three.js, so rotation.y = -atan2(dx, -dz)
      worldYaw = -Math.atan2(dx, -dz);
      pathTangent.set(dx / len, 0, dz / len);
    } else {
      pathTangent.set(-Math.sin(worldYaw), 0, -Math.cos(worldYaw));
    }

    // Curvature calculation for front-wheel Ackermann steering
    let steer = 0;
    const u2 = Math.min(1.0, u1 + eps);
    if (u2 > u1) {
      const ptC = this.road.point(evaluatePath(u2).s, evaluatePath(u2).offset);
      const dx2 = ptC.x - ptB.x;
      const dz2 = ptC.z - ptB.z;
      if (Math.hypot(dx2, dz2) > 0.00001) {
        const yaw2 = -Math.atan2(dx2, -dz2);
        const deltaYaw = angleDiff(yaw2, worldYaw);
        const dist = len + Math.hypot(dx2, dz2);
        const curvature = deltaYaw / (dist * 0.5 + 0.0001);
        steer = clamp(curvature * wheelbase * 1.25, -0.45, 0.45);
      }
    }

    // Straighten steering smoothly during final arrival phase (t >= 0.68)
    if (isEntry && t >= 0.68) {
      const straightenFactor = 1.0 - clamp((t - 0.68) / 0.20, 0, 1);
      steer *= straightenFactor;
    }

    return { s: curr.s, offset: curr.offset, worldYaw, steer, pathTangent };
  }

  private stageModelAtEntry(model: PlayerVehicleModel, origin: number) {
    if (!this.road) return;
    const kinematics = this.derivePathKinematics(u => this.evaluateEntryPath(u), 0, model.config.wheelbase, true);
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
      this.hasPrevPosition = false;
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

    // Minimum-turn exit direction selection (locked for transition)
    const diffPos = Math.abs(angleDiff(this.presentationHeading, 0));
    const diffNeg = Math.abs(angleDiff(this.presentationHeading, Math.PI));
    this.headingDir = (diffPos <= diffNeg) ? 1 : -1;

    // Reset departing model opacity and ensure visibility
    this.departingModel.setOpacity(1.0);
    this.departingModel.group.visible = true;

    // Stage incoming model at the far entry pose while HIDDEN
    this.incomingModel.group.visible = false;
    this.incomingModel.setOpacity(1.0);
    this.stageModelAtEntry(this.incomingModel, 0);

    // Start road exit sequence (1.3s)
    this.state = 'EXITING';
    this.transitionTimer = 0;
    this.transitionDuration = 1.3 / Math.max(0.1, this.speedMultiplier);
    this.wheelRotation = 0;
    this.hasPrevPosition = false;

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

    const effectiveDt = dt * this.speedMultiplier;
    this.transitionTimer += effectiveDt;
    const t = Math.min(1.0, this.transitionTimer / this.transitionDuration);

    if (this.state === 'EXITING' && this.departingModel) {
      // Outgoing vehicle drives forward following the path tangent
      const kinematics = this.derivePathKinematics(u => this.evaluateExitPath(u), t, this.departingModel.config.wheelbase, false);
      const sample = this.sampleRoadPose(this.departingModel, kinematics.s, kinematics.offset, kinematics.worldYaw, origin);

      // Distance-based wheel rotation: dTheta = dDist / R_wheel
      let distanceTravelled = 0;
      if (this.hasPrevPosition) {
        distanceTravelled = sample.position.distanceTo(this.prevWorldPosition);
      }
      this.prevWorldPosition.copy(sample.position);
      this.hasPrevPosition = true;

      const wheelRadius = this.departingModel.config.wheelRadius || 0.34;
      if (distanceTravelled > 0) {
        this.wheelRotation -= distanceTravelled / wheelRadius;
      }
      const speed = effectiveDt > 0 ? (distanceTravelled / effectiveDt) : 0;

      // Diagnostic side-slip check: dot(vehicleForward, pathVelocity)
      const vehForward = new THREE.Vector3(-Math.sin(kinematics.worldYaw), 0, -Math.cos(kinematics.worldYaw));
      const forwardDot = vehForward.dot(kinematics.pathTangent);
      const slipAngleDeg = Math.acos(clamp(Math.abs(forwardDot), 0, 1)) * (180 / Math.PI);
      this.telemetry.presentationSlipAngleDeg = slipAngleDeg;
      this.telemetry.forwardVelocityDot = forwardDot;
      this.telemetry.steerAngleDeg = kinematics.steer * (180 / Math.PI);
      this.telemetry.wheelRollRadians = this.wheelRotation;

      // Distance fade at the far end of the exit (t: 0.75 -> 1.0)
      let opacity = 1.0;
      if (t > 0.75) {
        const fadeT = (t - 0.75) / 0.25;
        opacity = 1.0 - Math.pow(fadeT, 1.8);
      }
      this.departingModel.setOpacity(opacity);

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
        this.transitionDuration = 2.0 / Math.max(0.1, this.speedMultiplier); // 2.0s entrance along road
        this.wheelRotation = 0;
        this.hasPrevPosition = false;
        
        if (this.incomingModel) {
          this.stageModelAtEntry(this.incomingModel, origin);
          this.incomingModel.setOpacity(1.0);
          this.incomingModel.group.visible = true;
        }
        this.callbacks.onStateChange?.(this.state, this.targetVehicleId);
      }
    } else if (this.state === 'ENTERING' && this.incomingModel) {
      // Incoming car drives along trajectory, smoothly straightens, and decelerates
      const kinematics = this.derivePathKinematics(u => this.evaluateEntryPath(u), t, this.incomingModel.config.wheelbase, true);
      const sample = this.sampleRoadPose(this.incomingModel, kinematics.s, kinematics.offset, kinematics.worldYaw, origin);

      // Distance-based wheel rotation: dTheta = dDist / R_wheel
      let distanceTravelled = 0;
      if (this.hasPrevPosition) {
        distanceTravelled = sample.position.distanceTo(this.prevWorldPosition);
      }
      this.prevWorldPosition.copy(sample.position);
      this.hasPrevPosition = true;

      const wheelRadius = this.incomingModel.config.wheelRadius || 0.34;
      if (distanceTravelled > 0) {
        this.wheelRotation -= distanceTravelled / wheelRadius;
      }
      const speed = effectiveDt > 0 ? (distanceTravelled / effectiveDt) : 0;
      const brakeVal = t > 0.60 ? clamp((t - 0.60) / 0.40, 0, 1) : 0;

      // Diagnostic side-slip check
      const vehForward = new THREE.Vector3(-Math.sin(kinematics.worldYaw), 0, -Math.cos(kinematics.worldYaw));
      const forwardDot = vehForward.dot(kinematics.pathTangent);
      const slipAngleDeg = Math.acos(clamp(Math.abs(forwardDot), 0, 1)) * (180 / Math.PI);
      this.telemetry.presentationSlipAngleDeg = slipAngleDeg;
      this.telemetry.forwardVelocityDot = forwardDot;
      this.telemetry.steerAngleDeg = kinematics.steer * (180 / Math.PI);
      this.telemetry.wheelRollRadians = this.wheelRotation;

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
        // Log handoff continuity metrics
        const idleWorldYaw = this.getPresentationWorldYaw();
        const idleSample = this.sampleRoadPose(this.incomingModel, this.presentationS, this.presentationOffset, idleWorldYaw, origin);
        this.telemetry.handoffPositionDiff = sample.position.distanceTo(idleSample.position);
        this.telemetry.handoffAngularDiffDeg = Math.abs(angleDiff(kinematics.worldYaw, idleWorldYaw)) * (180 / Math.PI);

        this.state = 'SETTLING';
        this.transitionTimer = 0;
        this.transitionDuration = 0.30 / Math.max(0.1, this.speedMultiplier); // 0.30s suspension settle
        this.callbacks.onStateChange?.(this.state, this.targetVehicleId);
      }
    } else if (this.state === 'SETTLING' && this.incomingModel) {
      // Suspension settle at the EXACT authoritative presentation pose
      const pitchSettle = Math.sin(t * Math.PI) * 0.005 * (1.0 - t);
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
        this.hasPrevPosition = false;
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
    this.hasPrevPosition = false;
  }
}

