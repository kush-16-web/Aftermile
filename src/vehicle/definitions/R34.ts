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
  /** =========================================================================
   * KEYBOARD STEERING FEEL & SENSITIVITY CONFIGURATION
   * =========================================================================
   * Single source of truth for tuning keyboard steering response, ramp-in,
   * return-to-center, and speed-sensitive steering angles.
   */
  steering: {
    /** Max road wheel angle by speed [m/s, radians].
     * 0 km/h: 34.4°, 10 km/h: 32.1°, 30 km/h: 19.5°, 60 km/h: 9.2°, 100 km/h: 3.72°, 130 km/h: 2.52°, 160 km/h: 1.83°
     */
   maxAngleBySpeed: [
      [0,       0.60],  // 0 km/h
      [2.7778,  0.56],  // 10
      [8.3333,  0.38],  // 30
      [16.6667, 0.22],  // 60
      [27.7778, 0.11],  // 100
      [36.1111, 0.070], // 130
      [44.4444, 0.055], // 160
      [55.5556, 0.038], // 200
      [73,      0.028], // 263
    ],
    /** Ramp-in speed (1/s): how quickly the digital key input rises to full demand. */
    inputRate: 7.0,
    /** Highway ramp-in speed (1/s): ramp-in rate at highway speeds for smooth transitions. */
    highwayInputRate: 7.0,
    /** Return-to-center speed (1/s): how quickly the rack snaps back to center on key release. */
    returnRate: 13.5,
    /** Steering rack mechanical response (1/s): low-speed and highway rack tracking speed. */
    response: 26,
    highwayResponse: 24,
    /** High-speed yaw damping: stabilizes the chassis against high-speed fishtailing. */
    yawDamping: 1.8,
    /** Response curve shaping:
     * linearWeight (0.0-1.0): immediate direct steering bite on initial key touch.
     * powerWeight (0.0-1.0): progressive buildup on sustained key press.
     * powerExponent: curve exponent for smooth progressive hold.
     */
    linearWeight: 0.92,
    powerWeight: 0.08,
    powerExponent: 1.5,
  },
  tires: { grip: 1.02, frontStiffness: 98000, rearStiffness: 112000, handbrakeGrip: .52 },
  brakes: { force: 15600, frontBias: .65, handbrakeForce: 10500, reverseDelay: .65 },
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
    name: 'RB26 inline-six recording profile',
    vehicleType: 'r34',
    status: 'recorded',
    bands: [
      { rpm: 850, onLoad: '/audio/r34/idle_on.wav', offLoad: '/audio/r34/idle_off.wav' },
      { rpm: 1250, onLoad: '/audio/r34/low_on.wav', offLoad: '/audio/r34/low_off.wav' },
      { rpm: 1800, onLoad: '/audio/r34/mid_low_on.wav', offLoad: '/audio/r34/mid_low_off.wav' },
      { rpm: 2600, onLoad: '/audio/r34/mid_on.wav', offLoad: '/audio/r34/mid_off.wav' },
      { rpm: 3700, onLoad: '/audio/r34/mid_high_on.wav', offLoad: '/audio/r34/mid_high_off.wav' },
      { rpm: 5200, onLoad: '/audio/r34/high_on.wav', offLoad: '/audio/r34/high_off.wav' },
      { rpm: 7000, onLoad: '/audio/r34/redline_on.wav', offLoad: '/audio/r34/redline_off.wav' },
    ],
    gain: .82, minPitch: .75, maxPitch: 1.4, rpmResponse: 14, loadResponse: 9,
    turbo: {
      enabled: true,
      spoolRate: 3.2,
      blowOffThreshold: 0.32,
      maxWhineGain: 0.16,
    },
    transmission: {
      enabled: false,
      pitchMultiplier: 1.0,
      gearWhineGain: 0.02,
    },
    exhaust: {
      overrunBurble: true,
      shiftPop: false,
    },
  },
  displaySpecs: {
    category: '1999 · LEGENDARY GT',
    engineName: 'NISSAN RB26DETT',
    power: '280 PS (276 hp) / Tuned',
    displacement: '2,568 cm³',
    dimensions: '4,600 × 1,785 × 1,360 mm',
    wheelbase: '2,665 mm',
    wheels: '18" FORGED ALLOY',
    drivetrain: 'ATTESA E-TS All-Wheel Drive',
    transmission: '6-Speed Manual (Getrag 233)',
    highlights: [
      'ATTESA E-TS PRO AWD SYSTEM',
      'SUPER HICAS 4-WHEEL STEERING',
      'TWIN CERAMIC TURBOCHARGERS',
      'MULTIFUNCTION COCKPIT MFD',
    ],
    gameplayCharacteristics: {
      archetype: 'ROAD / TUNED GT',
      handling: 'Rear-biased progressive chassis movement with high feedback',
      braking: 'Balanced road/track Brembo deceleration with stable weight transfer',
      aero: 'Classic GT aerodynamic balance with adjustable rear wing',
      suspension: 'Road-compliant multi-link setup with controlled body pitch and roll',
    },
  },
};

