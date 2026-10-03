import type { VehicleConfig } from '../VehicleConfig.ts';

/**
 * 2025 BMW M4 GT3 EVO (G82) Vehicle Definition
 *
 * Real-world specifications verified from official BMW M Motorsport documentation:
 * - Engine: BMW P58 3.0L M TwinPower Turbo Inline-6 (2,993 cm³)
 * - Maximum Power: Up to 590 hp (regulation-dependent)
 * - Transmission: 6-speed sequential racing gearbox
 * - Drivetrain: Rear-wheel drive
 * - Dimensions: 5,020 mm L × 2,040 mm W × 1,308 mm H
 * - Wheelbase: 2,917 mm
 * - Wheels: 18" racing centerlock rims (12.5" front / 13" rear)
 *
 * Dedicated GT3 Race-Car Physics:
 * - Pure rear-wheel drive with race differential
 * - High aerodynamic downforce and stability at speed
 * - High-grip GT3 racing slicks (1.18 base grip)
 * - Ultra-firm suspension with low body roll and high roll stiffness (220,000 N·m/rad)
 * - Powerful progressive racing brake system (22,500 N force)
 * - Direct, precise steering rack with high-speed countersteer authority
 */
export const M4_GT3_EVO_Config: VehicleConfig = {
  id: 'm4_gt3_evo',
  name: 'BMW M4 GT3 EVO',
  modelUrl: '/models/bmw_m4_gt3_evo/bmw_m4_gt3_evo.glb',
  mass: 1280, // Homologation racing mass (kg)
  centerOfGravity: 0.42, // Lower racing center of mass
  wheelbase: 2.917, // Verified BMW M Motorsport wheelbase (m)
  trackWidth: 1.708, // Wide GT3 racing track width (m)
  frontWeight: 0.50, // 50:50 race weight distribution
  yawInertia: 1950, // Nimble directional response
  wheelRadius: 0.345, // 18" racing wheel with GT3 slick profile (m)
  wheelPositions: [
    [-0.808, 0.341, -1.570], // Front Left
    [ 0.808, 0.341, -1.570], // Front Right
    [-0.795, 0.359,  1.337], // Rear Left
    [ 0.795, 0.359,  1.337], // Rear Right
  ],
  collider: {
    width: 2.04,
    length: 5.02,
    height: 1.31,
    center: [0, 0.655, -0.11],
  },
  engine: {
    powerKw: 434, // Up to 590 hp (BMW P58 3.0L M TwinPower Turbo)
    torque: 650, // High-torque turbocharged racing curve (N·m)
    maxDriveForce: 14500,
    efficiency: 0.92,
    idleRpm: 900,
    redlineRpm: 7800,
    shiftRpm: 7300,
    gears: [3.10, 2.20, 1.70, 1.38, 1.15, 0.98], // 6-speed sequential racing ratios (SIMULATION TUNING)
    finalDrive: 3.45,
    reverseRatio: 2.90,
    maxSpeed: 100, // Natural top speed (~296 km/h) derived from power/drag/gearing
    frontDriveShare: 0, // Pure Rear-Wheel Drive (RWD)
    throttleResponse: 5.5, // Progressive race throttle pickup with electro-hydraulic launch feel
    throttleRelease: 14.0,
    engineBraking: 600,
  },
  steering: {
    /** Speed-sensitive GT3 steering authority [m/s, rad] */
    maxAngleBySpeed: [
      [0,       0.56],  // 0 km/h: 32.1° (parking, garage & tight hairpin maneuverability)
      [2.7778,  0.50],  // 10 km/h: 28.6°
      [8.3333,  0.35],  // 30 km/h: 20.0° (responsive, direct medium-speed turning)
      [16.6667, 0.22],  // 60 km/h: 12.6° (immediate lane positioning & corner entry)
      [27.7778, 0.11],  // 100 km/h: 6.3° (high-speed GT3 precision)
      [36.1111, 0.075], // 130 km/h: 4.3°
      [44.4444, 0.055], // 160 km/h: 3.1°
      [55.5556, 0.038], // 200 km/h: 2.2°
      [73,      0.026], // 263 km/h: 1.5°
    ],
    inputRate: 8.2, // Fast, direct GT3 keyboard attack rate
    highwayInputRate: 7.8, // Crisp highway steering pickup
    returnRate: 18.0, // Rapid, natural race-car self-centering
    response: 28.0, // Razor-sharp mechanical rack tracking speed
    highwayResponse: 28.0, // High-speed precision tracking
    yawDamping: 2.8, // High-speed aerodynamic yaw stability
    linearWeight: 0.94, // Immediate front-axle bite on digital key touch
    powerWeight: 0.06,
    powerExponent: 1.5,
  },
  tires: {
    grip: 1.18, // GT3 Competition Slicks (High mechanical grip)
    frontStiffness: 175000,
    rearStiffness: 195000,
    handbrakeGrip: 0.45,
  },
  brakes: {
    force: 23500, // GT3 Racing Brakes with high deceleration bite
    frontBias: 0.62,
    handbrakeForce: 12000,
    reverseDelay: 0.55,
  },
  suspension: {
    stiffness: 62000, // Firm track-tuned racing springs (N/m)
    damping: 5800, // Race dampers
    rollStiffness: 220000, // EVO anti-roll bar package (N·m/rad)
    pitchStiffness: 280000,
    travel: 0.075, // Low travel track clearance (m)
  },
  dragArea: 0.66, // GT3 Aerodynamic package (m²)
  rollingResistance: 0.012,
  camera: {
    distance: 7.8,
    height: 2.45,
    lookAhead: 7.2,
    closeDistance: 5.4,
    closeHeight: 1.88,
    hood: [0, 0.98, -1.45],
    driver: [-0.355, 0.985, -0.12], // Left-hand drive GT3 race bucket seat position
  },
  lights: {
    headlights: [
      [-0.68, 0.62, -2.25],
      [ 0.68, 0.62, -2.25],
    ],
    intensity: 120,
    range: 95,
    materials: {
      head: ['BMW_Lights'],
      tail: ['BMW_Lights'],
      brake: ['BMW_Lights'],
      reverse: ['BMW_Lights'],
    },
  },
  fuel: {
    tankLitres: 120, // 120L FIA GT3 Endurance fuel cell
    baselineLitresPer100Km: 38.0,
    referenceSpeedKmh: 140,
    loadMultiplier: 1.8,
    highSpeedMultiplier: 0.45,
    idleLitresPerHour: 2.5,
    refuelLitresPerSecond: 6.0,
  },
  audio: {
    name: 'BMW P58 3.0L Twin-Turbo Inline-6 GT3 profile',
    status: 'recorded',
    bands: [
      { rpm: 900,  onLoad: '/audio/bmw_m4_gt3/idle_on.wav',     offLoad: '/audio/bmw_m4_gt3/idle_off.wav' },
      { rpm: 1400, onLoad: '/audio/bmw_m4_gt3/low_on.wav',      offLoad: '/audio/bmw_m4_gt3/low_off.wav' },
      { rpm: 2200, onLoad: '/audio/bmw_m4_gt3/mid_low_on.wav',  offLoad: '/audio/bmw_m4_gt3/mid_low_off.wav' },
      { rpm: 3200, onLoad: '/audio/bmw_m4_gt3/mid_on.wav',      offLoad: '/audio/bmw_m4_gt3/mid_off.wav' },
      { rpm: 4400, onLoad: '/audio/bmw_m4_gt3/mid_high_on.wav', offLoad: '/audio/bmw_m4_gt3/mid_high_off.wav' },
      { rpm: 5800, onLoad: '/audio/bmw_m4_gt3/high_on.wav',     offLoad: '/audio/bmw_m4_gt3/high_off.wav' },
      { rpm: 7500, onLoad: '/audio/bmw_m4_gt3/redline_on.wav',  offLoad: '/audio/bmw_m4_gt3/redline_off.wav' },
    ],
    gain: 0.88,
    minPitch: 0.75,
    maxPitch: 1.42,
    rpmResponse: 16,
    loadResponse: 11,
  },
  displaySpecs: {
    category: '2025 · GT3 RACE CAR',
    engineName: 'BMW P58 3.0L TWIN-TURBO I6',
    power: 'Up to 590 hp',
    displacement: '2,993 cm³',
    dimensions: '5,020 × 2,040 × 1,308 mm',
    wheelbase: '2,917 mm',
    wheels: '18" RACING (12.5" F / 13" R)',
    drivetrain: 'Rear-Wheel Drive (RWD)',
    transmission: '6-Speed Sequential Racing',
    highlights: [
      'GT3 AERODYNAMICS PACKAGE',
      'ADJUSTABLE RACE DIFFERENTIAL',
      'EVO FRONT/REAR ANTI-ROLL BARS',
      'CARBON-METALLIC BRAKE SYSTEM',
    ],
    gameplayCharacteristics: {
      archetype: 'RACE GT3',
      handling: 'High aerodynamic grip and razor-sharp steering response',
      braking: 'Very strong progressive racing braking with minimal pitch',
      aero: 'High aerodynamic stability and usable downforce at high speed',
      suspension: 'Firm track-oriented damping with controlled weight transfer',
    },
  },
};
