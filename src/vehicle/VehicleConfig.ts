import { R34Config } from './definitions/R34.ts';
export { R34Config } from './definitions/R34.ts';
export type Vec3 = [number, number, number];

export interface EngineAudioBand {
  rpm: number;
  /** Seamless recordings at this RPM. Omitted URLs never trigger a request. */
  onLoad?: string; offLoad?: string;
}
export interface VehicleAudioProfile {
  name: string; status: 'needs-recordings' | 'recorded';
  bands: EngineAudioBand[]; gain: number; minPitch: number; maxPitch: number;
  rpmResponse: number; loadResponse: number; releaseSample?: string;
}
export interface FuelConfig {
  tankLitres: number; baselineLitresPer100Km: number; referenceSpeedKmh: number;
  loadMultiplier: number; highSpeedMultiplier: number; idleLitresPerHour: number;
  refuelLitresPerSecond: number;
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
  steering: {
    /** Direct front-axle steering limit: [speed in m/s, radians]. */
    maxAngleBySpeed: [number, number][];
    /** Digital-input filter response in inverse seconds, independent of wheel angle. */
    inputRate: number; highwayInputRate: number; returnRate: number;
    /** Steering rack response in inverse seconds; never rotates the heading directly. */
    response: number; highwayResponse: number; yawDamping: number;
  };
  tires: { grip: number; frontStiffness: number; rearStiffness: number; handbrakeGrip: number };
  brakes: { force: number; frontBias: number; handbrakeForce: number; reverseDelay: number };
  suspension: { stiffness: number; damping: number; rollStiffness: number; pitchStiffness: number; travel: number };
  dragArea: number; rollingResistance: number;
  camera: { distance: number; height: number; lookAhead: number; closeDistance: number; closeHeight: number; hood: Vec3; driver: Vec3 };
  lights: {
    headlights: Vec3[]; intensity: number; range: number;
    materials: { head: string[]; tail: string[]; brake: string[]; reverse: string[] };
  };
  fuel: FuelConfig;
  audio: VehicleAudioProfile;
}

export function createVehicleConfig(base: VehicleConfig = R34Config): VehicleConfig {
  return structuredClone(base);
}
