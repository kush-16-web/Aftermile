import { R34Config } from './definitions/R34.ts';
export { R34Config } from './definitions/R34.ts';
export type Vec3 = [number, number, number];

export interface EngineAudioBand {
  rpm: number;
  /** Seamless recordings at this RPM. Omitted URLs never trigger a request. */
  onLoad?: string; offLoad?: string;
}
export interface TurboAudioConfig {
  enabled: boolean;
  spoolRate: number;
  blowOffThreshold: number;
  maxWhineGain: number;
}
export interface TransmissionAudioConfig {
  enabled: boolean;
  pitchMultiplier: number;
  gearWhineGain: number;
}
export interface ExhaustAudioConfig {
  overrunBurble: boolean;
  shiftPop: boolean;
}

export interface VehicleAudioProfile {
  name: string;
  vehicleType?: 'r34' | 'bmw_m4_gt3' | 'standard';
  status: 'needs-recordings' | 'recorded';
  bands: EngineAudioBand[];
  gain: number;
  minPitch: number;
  maxPitch: number;
  rpmResponse: number;
  loadResponse: number;
  releaseSample?: string;
  turbo?: TurboAudioConfig;
  transmission?: TransmissionAudioConfig;
  exhaust?: ExhaustAudioConfig;
}
export interface FuelConfig {
  tankLitres: number; baselineLitresPer100Km: number; referenceSpeedKmh: number;
  loadMultiplier: number; highSpeedMultiplier: number; idleLitresPerHour: number;
  refuelLitresPerSecond: number;
}

export interface SteeringConfig {
  /** Direct front-axle steering limit: [speed in m/s, radians]. */
  maxAngleBySpeed: [number, number][];
  /** Digital-input ramp-in speed in inverse seconds (low speed and highway speed). */
  inputRate: number;
  highwayInputRate: number;
  /** Steering return-to-center rate on key release in inverse seconds. */
  returnRate: number;
  /** Steering rack response in inverse seconds; never rotates the heading directly. */
  response: number;
  highwayResponse: number;
  /** Yaw damping factor to stabilize high-speed highway tracking. */
  yawDamping: number;
  /** Keyboard sensitivity & curve shaping:
   * linearWeight: initial direct response factor (0.0–1.0)
   * powerWeight: progressive buildup factor (0.0–1.0)
   * powerExponent: curve exponent for sustained hold (e.g. 1.5–2.0)
   */
  linearWeight: number;
  powerWeight: number;
  powerExponent: number;
}

export interface VehicleDisplaySpecs {
  category: string;
  engineName: string;
  power: string;
  displacement: string;
  dimensions: string;
  wheelbase: string;
  wheels: string;
  drivetrain: string;
  transmission: string;
  highlights: string[];
  gameplayCharacteristics: {
    archetype: string;
    handling: string;
    braking: string;
    aero: string;
    suspension: string;
  };
}

export interface CockpitCameraConfig {
  driverEye: Vec3;
  lookTarget: Vec3;
  fov: number;
  near: number;
  headInertia?: { accel: number; brake: number; lateral: number; roll: number };
}

export interface CameraConfig {
  distance: number;
  height: number;
  lookAhead: number;
  closeDistance: number;
  closeHeight: number;
  hood: Vec3;
  driver: Vec3;
  cockpit?: CockpitCameraConfig;
}

/** Metres, kilograms, seconds, newtons and radians unless a field names its unit.
 * Model contract: Body; WheelMount0..3 containing Wheel0..3 and Caliper0..3.
 * Vehicle origin is the axle midpoint at road height; model forward is -Z.
 */
export interface VehicleConfig {
  id: string; name: string; modelUrl: string;
  mass: number; centerOfGravity: number; wheelbase: number; trackWidth: number;
  frontWeight: number; yawInertia: number; wheelRadius: number; wheelPositions: Vec3[];
  collider: { width: number; length: number; height: number; center: Vec3 };
  engine: {
    powerKw: number; torque: number; maxDriveForce: number; efficiency: number;
    idleRpm: number; redlineRpm: number; shiftRpm: number; gears: number[];
    finalDrive: number; reverseRatio: number; maxSpeed: number; frontDriveShare: number;
    throttleResponse: number; throttleRelease: number; engineBraking: number;
  };
  steering: SteeringConfig;
  tires: { grip: number; frontStiffness: number; rearStiffness: number; handbrakeGrip: number };
  brakes: { force: number; frontBias: number; handbrakeForce: number; reverseDelay: number };
  suspension: { stiffness: number; damping: number; rollStiffness: number; pitchStiffness: number; travel: number };
  dragArea: number; rollingResistance: number;
  camera: CameraConfig;
  lights: {
    headlights: Vec3[]; intensity: number; range: number;
    materials: { head: string[]; tail: string[]; brake: string[]; reverse: string[] };
  };
  fuel: FuelConfig;
  audio: VehicleAudioProfile;
  displaySpecs: VehicleDisplaySpecs;
}

export function createVehicleConfig(base: VehicleConfig = R34Config): VehicleConfig {
  return structuredClone(base);
}

