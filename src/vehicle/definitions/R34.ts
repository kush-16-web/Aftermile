import type { VehicleConfig } from '../VehicleConfig.ts';

/** Authored road-game tune, not a certified specification of the film car.
 * Visual dimensions and wheel centers come from preparation.json.
 */
export const R34Config: VehicleConfig = {
  id: 'r34', name: 'Nissan Skyline R34', modelUrl: '/models/r34/r34.glb',
  mass: 1560, centerOfGravity: .48, wheelbase: 2.665, trackWidth: 1.48078,
  frontWeight: .54, yawInertia: 2250, wheelRadius: .3243073,
  wheelPositions: [
    [-.7378925,.3266984,-1.3325], [.7378925,.3266984,-1.3325],
    [-.7428850,.3266984,1.3325], [.7428850,.3266984,1.3325],
  ],
  collider: { width: 2.04, length: 4.65, height: 1.21, center: [0,.735,.018] },
  engine: {
    powerKw: 235, torque: 430, maxDriveForce: 9200, efficiency: .88,
    idleRpm: 850, redlineRpm: 7800, shiftRpm: 7000,
    gears: [3.827,2.36,1.685,1.312,1, .793], finalDrive: 3.545,
    reverseRatio: 3.28, maxSpeed: 73, frontDriveShare: .3,
    throttleResponse: 4.5, throttleRelease: 10, engineBraking: 420,
  },
  steering: {
    maxAngleBySpeed: [[0,.59],[2.7778,.56],[8.3333,.30],[16.6667,.12],[27.7778,.044],[36.1111,.030],[44.4444,.022],[55.5556,.016],[73,.010]],
    inputRate: 4.6, highwayInputRate: 3.6, returnRate: 3.6,
    response: 14, highwayResponse: 12, yawDamping: .65,
  },
  tires: { grip: 1.02, frontStiffness: 94000, rearStiffness: 110000, handbrakeGrip: .56 },
  brakes: { force: 15600, frontBias: .65, handbrakeForce: 4100, reverseDelay: .65 },
  suspension: { stiffness: 31000, damping: 3300, rollStiffness: 120000, pitchStiffness: 165000, travel: .12 },
  dragArea: .71, rollingResistance: .014,
  camera: { distance: 7.6, height: 2.65, lookAhead: 6.8, closeDistance: 5.1, closeHeight: 1.95, hood: [0,1.02,-1.45], driver: [.32,1.14,0] },
  lights: {
    headlights: [[-.5746,.649,-2.05],[.5746,.649,-2.05]], intensity: 110, range: 85,
    materials: {
      head: ['LightHead','LightHeadReflector','LightHeadBulb'],
      tail: ['LightTail','LightTailLens'], brake: ['LightStop','LightStopLens'],
      reverse: ['LightReverse','LightReverseLens'],
    },
  },
  fuel: {
    tankLitres: 65, baselineLitresPer100Km: 10.5, referenceSpeedKmh: 80,
    loadMultiplier: 1.5, highSpeedMultiplier: .38, idleLitresPerHour: 1.1,
    refuelLitresPerSecond: 4.5,
  },
  audio: {
    name: 'RB26 inline-six recording profile', status: 'needs-recordings',
    bands: [{rpm:850},{rpm:1250},{rpm:1800},{rpm:2600},{rpm:3700},{rpm:5200},{rpm:7000}],
    gain: .65, minPitch: .7, maxPitch: 1.45, rpmResponse: 14, loadResponse: 9,
  },
};
