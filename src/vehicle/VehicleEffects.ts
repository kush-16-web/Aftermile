import * as THREE from 'three';
import type { VehiclePhysics } from './VehiclePhysics.ts';
import type { PlayerVehicleModel } from './PlayerVehicleModel.ts';
import type { WeatherState } from '../weather/Weather.ts';
import { clamp, lerp } from '../core/math.ts';

export type SurfaceType = 'asphalt' | 'wet_asphalt' | 'dirt' | 'gravel' | 'grass' | 'snow';

export interface SurfaceTireVfxProfile {
  smokeEnabled: boolean;
  smokeThreshold: number; // minimum friction energy to start smoke
  smokeMultiplier: number;
  dustEnabled: boolean;
  dustMultiplier: number;
  sprayEnabled: boolean;
  sprayMultiplier: number;
  trackEnabled: boolean;
  trackColor: [number, number, number]; // RGB 0..1
  trackBaseAlpha: number;
  trackThreshold: number; // minimum slip / energy for skid mark
}

export const SURFACE_VFX_PROFILES: Record<SurfaceType, SurfaceTireVfxProfile> = {
  asphalt: {
    smokeEnabled: true,
    smokeThreshold: 0.55,
    smokeMultiplier: 1.0,
    dustEnabled: false,
    dustMultiplier: 0,
    sprayEnabled: false,
    sprayMultiplier: 0,
    trackEnabled: true,
    trackColor: [0.05, 0.05, 0.06], // Dark carbonized rubber
    trackBaseAlpha: 0.85,
    trackThreshold: 0.08,
  },
  wet_asphalt: {
    smokeEnabled: false,
    smokeThreshold: 1.6,
    smokeMultiplier: 0.12,
    dustEnabled: false,
    dustMultiplier: 0,
    sprayEnabled: true,
    sprayMultiplier: 1.2,
    trackEnabled: true,
    trackColor: [0.12, 0.14, 0.16], // Faint wet tire sheen track
    trackBaseAlpha: 0.35,
    trackThreshold: 0.16,
  },
  dirt: {
    smokeEnabled: false,
    smokeThreshold: 0,
    smokeMultiplier: 0,
    dustEnabled: true,
    dustMultiplier: 1.4,
    sprayEnabled: false,
    sprayMultiplier: 0,
    trackEnabled: true,
    trackColor: [0.26, 0.19, 0.13], // Brown earth
    trackBaseAlpha: 0.70,
    trackThreshold: 0.15,
  },
  gravel: {
    smokeEnabled: false,
    smokeThreshold: 0,
    smokeMultiplier: 0,
    dustEnabled: true,
    dustMultiplier: 1.2,
    sprayEnabled: false,
    sprayMultiplier: 0,
    trackEnabled: true,
    trackColor: [0.28, 0.26, 0.24], // Grey dust
    trackBaseAlpha: 0.55,
    trackThreshold: 0.16,
  },
  grass: {
    smokeEnabled: false,
    smokeThreshold: 0,
    smokeMultiplier: 0,
    dustEnabled: true,
    dustMultiplier: 0.8,
    sprayEnabled: false,
    sprayMultiplier: 0,
    trackEnabled: true,
    trackColor: [0.18, 0.22, 0.12], // Green-brown turf
    trackBaseAlpha: 0.60,
    trackThreshold: 0.15,
  },
  snow: {
    smokeEnabled: false,
    smokeThreshold: 0,
    smokeMultiplier: 0,
    dustEnabled: false,
    dustMultiplier: 0,
    sprayEnabled: true, // Snow powder plume
    sprayMultiplier: 1.5,
    trackEnabled: true,
    trackColor: [0.72, 0.78, 0.85], // Compressed snow rut
    trackBaseAlpha: 0.50,
    trackThreshold: 0.12,
  },
};

export interface TireEffectState {
  wheelIndex: number; // 0..3 (FL, FR, RL, RR)
  wheelContact: boolean;
  surfaceType: SurfaceType;
  slipRatio: number;
  slipAngle: number;
  normalLoad: number;
  slidingVelocity: number;
  frictionMagnitude: number;
  frictionPower: number;
  frictionEnergy: number;
  smokeEmissionRate: number;
  skidIntensity: number;
  contactPosition: THREE.Vector3;
}

const MAX_SKID_QUADS = 1200;
const TIRE_WIDTH = 0.23;
const MAX_SMOKE_PARTICLES = 360;

interface TrackNode {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  alpha: number;
  r: number; g: number; b: number;
  time: number;
}

interface SmokeParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rot: number; rotSpeed: number;
  size: number; maxSize: number;
  alpha: number; maxAlpha: number;
  life: number; maxLife: number;
  active: boolean;
  kind: 'smoke' | 'dust' | 'spray';
  r: number; g: number; b: number;
  seed: number;
  stretchRatio: number;
  isBurnout: boolean;
}

export class VehicleEffects {
  readonly group = new THREE.Group();
  
  // Continuous 4-Wheel Surface Tyre Track Ribbons
  private trackGeom = new THREE.BufferGeometry();
  private trackPositions = new Float32Array(MAX_SKID_QUADS * 4 * 3);
  private trackUvs = new Float32Array(MAX_SKID_QUADS * 4 * 2);
  private trackColors = new Float32Array(MAX_SKID_QUADS * 4 * 4);
  private trackIndices = new Uint16Array(MAX_SKID_QUADS * 6);
  private trackMesh: THREE.Mesh;
  private trackTexture: THREE.CanvasTexture;
  private trackNodes: TrackNode[][] = [[], [], [], []]; // 4 wheels: FL, FR, RL, RR
  private lastTireWorld: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private lastContact = [false, false, false, false];

  // Tyre Smoke, Dust & Spray Particle System
  private smokeParticles: SmokeParticle[] = [];
  private smokeMesh: THREE.InstancedMesh;
  private smokeTexture: THREE.CanvasTexture;
  private instanceAlphaArray = new Float32Array(MAX_SMOKE_PARTICLES);
  private smokeDummy = new THREE.Object3D();
  private smokeRotQuat = new THREE.Quaternion();
  private smokeCamQuat = new THREE.Quaternion();
  private smokeHead = 0; // FIFO particle recycling pointer

  // Distance-accumulated sub-step emission tracking per wheel
  private lastContactPos: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private emitAccumTimer = [0, 0, 0, 0];

  // Temporary vectors for camera-relative velocity stretching
  private camRight = new THREE.Vector3();
  private camUp = new THREE.Vector3();
  private relVel = new THREE.Vector3();
  private interpPos = new THREE.Vector3();

  // Per-wheel live effect state cache for debugging and telemetry
  public tireStates: TireEffectState[] = [];

  constructor(private scene: THREE.Scene) {
    this.group.name = 'VehicleEffects';
    this.scene.add(this.group);

    for (let w = 0; w < 4; w++) {
      this.tireStates.push({
        wheelIndex: w,
        wheelContact: false,
        surfaceType: 'asphalt',
        slipRatio: 0,
        slipAngle: 0,
        normalLoad: 0,
        slidingVelocity: 0,
        frictionMagnitude: 0,
        frictionPower: 0,
        frictionEnergy: 0,
        smokeEmissionRate: 0,
        skidIntensity: 0,
        contactPosition: new THREE.Vector3(),
      });
    }

    // 1. Procedural Surface Track Tread Profile (Dual-shoulder tire contact profile)
    if (typeof document !== 'undefined') {
      const trackCanvas = document.createElement('canvas');
      trackCanvas.width = 64;
      trackCanvas.height = 256;
      const sCtx = trackCanvas.getContext('2d')!;
      const sGrad = sCtx.createLinearGradient(0, 0, 64, 0);
      sGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      sGrad.addColorStop(0.12, 'rgba(255, 255, 255, 0.95)');
      sGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.75)');
      sGrad.addColorStop(0.50, 'rgba(255, 255, 255, 0.65)');
      sGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.75)');
      sGrad.addColorStop(0.88, 'rgba(255, 255, 255, 0.95)');
      sGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      sCtx.fillStyle = sGrad;
      sCtx.fillRect(0, 0, 64, 256);
      
      this.trackTexture = new THREE.CanvasTexture(trackCanvas);
      this.trackTexture.wrapS = THREE.ClampToEdgeWrapping;
      this.trackTexture.wrapT = THREE.RepeatWrapping;
    } else {
      this.trackTexture = new THREE.DataTexture(new Uint8Array(16 * 16 * 4).fill(255), 16, 16) as any;
    }

    // Build Track Mesh Indexing
    for (let i = 0; i < MAX_SKID_QUADS; i++) {
      const base = i * 4;
      const idx = i * 6;
      this.trackIndices[idx] = base;
      this.trackIndices[idx + 1] = base + 1;
      this.trackIndices[idx + 2] = base + 2;
      this.trackIndices[idx + 3] = base + 2;
      this.trackIndices[idx + 4] = base + 1;
      this.trackIndices[idx + 5] = base + 3;
    }
    this.trackGeom.setIndex(new THREE.BufferAttribute(this.trackIndices, 1));
    this.trackGeom.setAttribute('position', new THREE.BufferAttribute(this.trackPositions, 3));
    this.trackGeom.setAttribute('uv', new THREE.BufferAttribute(this.trackUvs, 2));
    this.trackGeom.setAttribute('color', new THREE.BufferAttribute(this.trackColors, 4));

    const trackMat = new THREE.MeshBasicMaterial({
      map: this.trackTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      side: THREE.DoubleSide,
    });
    this.trackMesh = new THREE.Mesh(this.trackGeom, trackMat);
    this.trackMesh.frustumCulled = false;
    this.group.add(this.trackMesh);

    // 2. Procedural Organic Fibrous Wispy Smoke Texture (Zero Dark Borders / Zero Cotton-Balls)
    if (typeof document !== 'undefined') {
      const smokeCanvas = document.createElement('canvas');
      smokeCanvas.width = 128;
      smokeCanvas.height = 128;
      const smCtx = smokeCanvas.getContext('2d')!;
      const imgData = smCtx.createImageData(128, 128);
      const data = imgData.data;

      // Pre-fill entire texture with clean light smoke RGB to eliminate bilinear dark border artifacts
      for (let i = 0; i < 128 * 128 * 4; i += 4) {
        data[i] = 250;     // R
        data[i + 1] = 252; // G
        data[i + 2] = 255; // B
        data[i + 3] = 0;   // A (default zero)
      }

      // Multi-octave sinusoidal & fibrous procedural wisp generator
      for (let py = 0; py < 128; py++) {
        for (let px = 0; px < 128; px++) {
          const nx = (px - 64) / 60;
          const ny = (py - 64) / 54;
          const distSq = nx * nx + ny * ny;
          if (distSq >= 1.0) continue;

          // Asymmetric organic envelope
          const env = Math.pow(Math.max(0, 1.0 - distSq), 1.35);

          // Multi-frequency harmonic filaments
          const u = px * 0.09;
          const v = py * 0.09;
          const wisp1 = Math.sin(u * 1.5 + Math.cos(v * 1.8)) * 0.5 + 0.5;
          const wisp2 = Math.sin(u * 2.8 - v * 2.4 + Math.sin(u * 1.2)) * 0.5 + 0.5;
          const wisp3 = Math.cos(u * 4.2 + v * 3.6) * 0.5 + 0.5;
          const swirl = (wisp1 * 0.55 + wisp2 * 0.32 + wisp3 * 0.13);

          // Feathered density
          const alphaVal = clamp(env * (0.35 + 0.65 * swirl), 0, 1);
          const i = (py * 128 + px) * 4;
          data[i] = 250;     // R
          data[i + 1] = 252; // G
          data[i + 2] = 255; // B
          data[i + 3] = Math.round(alphaVal * 255);
        }
      }
      smCtx.putImageData(imgData, 0, 0);

      this.smokeTexture = new THREE.CanvasTexture(smokeCanvas);
      this.smokeTexture.generateMipmaps = false;
      this.smokeTexture.minFilter = THREE.LinearFilter;
      this.smokeTexture.magFilter = THREE.LinearFilter;
      this.smokeTexture.wrapS = THREE.ClampToEdgeWrapping;
      this.smokeTexture.wrapT = THREE.ClampToEdgeWrapping;
      this.smokeTexture.premultiplyAlpha = false;
    } else {
      this.smokeTexture = new THREE.DataTexture(new Uint8Array(16 * 16 * 4).fill(255), 16, 16) as any;
    }

    // Smoke/Dust Instanced Mesh with Dynamic Color, Alpha & Transform Buffers
    const smokeGeom = new THREE.PlaneGeometry(1, 1);
    const instanceAlphaAttr = new THREE.InstancedBufferAttribute(this.instanceAlphaArray, 1);
    instanceAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    smokeGeom.setAttribute('instanceAlpha', instanceAlphaAttr);

    const smokeMat = new THREE.MeshBasicMaterial({
      map: this.smokeTexture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      premultipliedAlpha: false,
      side: THREE.DoubleSide,
      toneMapped: true,
    });

    // Custom shader injection: per-instance alpha modulation without dark RGB attenuation
    smokeMat.onBeforeCompile = (shader) => {
      shader.vertexShader = `
        attribute float instanceAlpha;
        varying float vInstanceAlpha;
      ` + shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vInstanceAlpha = instanceAlpha;`
      );

      shader.fragmentShader = `
        varying float vInstanceAlpha;
      ` + shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.a *= vInstanceAlpha;`
      );
    };

    this.smokeMesh = new THREE.InstancedMesh(smokeGeom, smokeMat, MAX_SMOKE_PARTICLES);
    this.smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.smokeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SMOKE_PARTICLES * 3), 3);
    this.smokeMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.renderOrder = 10;
    this.group.add(this.smokeMesh);

    for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) {
      this.smokeParticles.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        rot: 0, rotSpeed: 0,
        size: 0.16, maxSize: 1.8,
        alpha: 0, maxAlpha: 0.10,
        life: 0, maxLife: 1.2,
        active: false,
        kind: 'smoke',
        r: 0.88, g: 0.89, b: 0.90,
        seed: i * 0.37,
        stretchRatio: 1.8,
        isBurnout: false,
      });
      this.instanceAlphaArray[i] = 0;
      this.smokeDummy.position.set(0, -9999, 0);
      this.smokeDummy.scale.set(0, 0, 0);
      this.smokeDummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, this.smokeDummy.matrix);
      this.smokeMesh.setColorAt(i, new THREE.Color(0.88, 0.89, 0.90));
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
    if (this.smokeMesh.instanceColor) this.smokeMesh.instanceColor.needsUpdate = true;
    instanceAlphaAttr.needsUpdate = true;
  }

  update(
    dt: number,
    time: number,
    physics: VehiclePhysics,
    model: PlayerVehicleModel,
    camera: THREE.Camera,
    weatherOrWet: WeatherState | number = 0,
    nightOrSnow = 0
  ) {
    const isWeatherObj = typeof weatherOrWet === 'object' && weatherOrWet !== null;
    const wet = isWeatherObj ? (weatherOrWet as WeatherState).wet : (weatherOrWet as number);
    const snow = isWeatherObj ? (weatherOrWet as WeatherState).snow : (typeof nightOrSnow === 'number' && nightOrSnow <= 1 && nightOrSnow > 0 ? nightOrSnow : 0);
    const windSpeed = isWeatherObj ? (weatherOrWet as WeatherState).wind : 12;
    const night = typeof nightOrSnow === 'number' && !isWeatherObj ? 0 : (typeof (weatherOrWet as any)?.night === 'number' ? (weatherOrWet as any).night : 0);

    const totalSpeed = Math.hypot(physics.speed, physics.bodyLateralVelocity);
    const isMoving = totalSpeed > 0.4;
    const isAirborne = Math.abs(physics.heave) > 0.24;

    const station = physics.road.station(physics.s - 50);
    const isGasStation = Math.abs(physics.s - station) < 65 && physics.offset > 0;
    const isOffRoad = Math.abs(physics.offset) > 9.2 && !isGasStation;

    // Determine environmental surface type
    let surfaceType: SurfaceType = 'asphalt';
    if (snow > 0.15) {
      surfaceType = 'snow';
    } else if (wet > 0.30) {
      surfaceType = 'wet_asphalt';
    } else if (isOffRoad) {
      const region = physics.road.region(physics.s);
      if (region.biome === 'coast') surfaceType = 'gravel';
      else if (region.biome === 'country') surfaceType = 'dirt';
      else surfaceType = 'grass';
    }

    const profile = SURFACE_VFX_PROFILES[surfaceType];

    // World wind vector from weather
    const windX = Math.sin(time * 0.4) * (windSpeed * 0.14);
    const windZ = Math.cos(time * 0.35) * (windSpeed * 0.12);

    // Car forward / lateral velocity vectors in world space for wake calculations
    const roadHeading = -physics.road.heading(physics.s) - physics.heading;
    const carCos = Math.cos(roadHeading);
    const carSin = Math.sin(roadHeading);
    const carVelX = physics.speed * carSin + physics.bodyLateralVelocity * carCos;
    const carVelZ = physics.speed * carCos - physics.bodyLateralVelocity * carSin;
    const carWorldPos = model.group.position;

    // 1. Process 4-Wheel Surface Tracks & Contact-Patch Tire Emissions
    let quadWriteIndex = 0;

    for (let w = 0; w < 4; w++) {
      const isRear = w >= 2;
      const pivot = model.steer[w];
      const telemetry = physics.wheelsTelemetry[w];
      const normalLoad = telemetry?.normalLoad || (physics.config.mass * 9.81 * 0.25);
      const wheelContact = !isAirborne && normalLoad > 150 && model.ready;

      const frictionMag = telemetry?.combinedForce || 0;
      const slipAngle = Math.abs(telemetry?.slipAngle || 0);
      const slipRatio = Math.abs(telemetry?.slipRatio || 0);
      const slidingVelocity = telemetry?.slipVelocity !== undefined 
        ? telemetry.slipVelocity 
        : Math.max(Math.abs(physics.bodyLateralVelocity), slipAngle * totalSpeed);
      const frictionPower = telemetry?.slidingPower !== undefined 
        ? telemetry.slidingPower 
        : (frictionMag * slidingVelocity);
      const frictionEnergy = physics.smokeEnergy[w] || 0;

      // Update public telemetry state for debug inspection
      const state = this.tireStates[w];
      state.wheelContact = wheelContact;
      state.surfaceType = surfaceType;
      state.slipRatio = slipRatio;
      state.slipAngle = slipAngle;
      state.normalLoad = normalLoad;
      state.slidingVelocity = slidingVelocity;
      state.frictionMagnitude = frictionMag;
      state.frictionPower = frictionPower;
      state.frictionEnergy = frictionEnergy;

      if (pivot && wheelContact) {
        const worldPos = new THREE.Vector3();
        pivot.getWorldPosition(worldPos);
        worldPos.y = (physics.wheelHeights[w] || worldPos.y) + 0.025; // Contact patch
        state.contactPosition.copy(worldPos);

        const isBurnout = !physics.isReversing && totalSpeed < 2.5 && (physics.dynamicState === 'BURNOUT' || (slipRatio > 0.45 && physics.throttle > 0.6));

        // -------------------------------------------------------------
        // A. SKID MARKS: Follows individual wheel contact & physical slip
        // -------------------------------------------------------------
        let shouldTrack = false;
        let trackAlpha = 0;
        const totalSlip = Math.hypot(slipRatio, slipAngle);
        const minTrackSlipVel = 0.40; // m/s relative contact patch slide

        if (profile.trackEnabled && isMoving && totalSlip > profile.trackThreshold && (slidingVelocity > minTrackSlipVel || isBurnout)) {
          const loadRatio = clamp(normalLoad / (physics.config.mass * 9.81 * 0.35), 0.3, 1.4);
          const slipFactor = clamp((totalSlip - profile.trackThreshold) / 0.30, 0, 1);
          trackAlpha = clamp(profile.trackBaseAlpha * slipFactor * loadRatio, 0.08, 0.92);
          shouldTrack = true;
        }
        state.skidIntensity = shouldTrack ? trackAlpha : 0;

        if (shouldTrack) {
          const dist = worldPos.distanceTo(this.lastTireWorld[w]);
          if (dist > 0.20 || !this.lastContact[w]) {
            const perpX = Math.cos(roadHeading);
            const perpZ = -Math.sin(roadHeading);

            this.trackNodes[w].push({
              x: worldPos.x,
              y: worldPos.y,
              z: worldPos.z,
              nx: perpX,
              ny: 1,
              nz: perpZ,
              alpha: trackAlpha,
              r: profile.trackColor[0],
              g: profile.trackColor[1],
              b: profile.trackColor[2],
              time,
            });

            this.lastTireWorld[w].copy(worldPos);
            this.lastContact[w] = true;
          }
        } else {
          this.lastContact[w] = false;
        }

        // -------------------------------------------------------------
        // B. TIRE SMOKE & SURFACE PARTICLES: Purely physics-driven V2
        // Two-Gate Emission: 1) Minimum Physical Slip Speed, 2) Friction Energy
        // -------------------------------------------------------------
        const minPhysicalSlip = 1.15; // m/s (~4.1 km/h relative slide velocity)
        const hasPhysicalSlip = isBurnout || slidingVelocity >= minPhysicalSlip;
        let emitRate = 0;

        if (isBurnout) {
          emitRate = 1.0;
        } else if (hasPhysicalSlip && frictionEnergy > profile.smokeThreshold) {
          const energySeverity = clamp((frictionEnergy - profile.smokeThreshold) / 1.6, 0, 1);
          const slipFactor = clamp((slidingVelocity - minPhysicalSlip) / 2.2, 0.35, 1.0);
          emitRate = energySeverity * slipFactor * (isRear ? 1.0 : 0.60);
        }
        state.smokeEmissionRate = emitRate;

        // Sub-Step Distance-Based Spawning (Frame-rate independent continuous trail)
        if (emitRate > 0.04) {
          const kind = profile.smokeEnabled ? 'smoke' : (profile.sprayEnabled ? 'spray' : 'dust');
          const hasLastPos = this.lastContactPos[w].lengthSq() > 0.01;
          const distMoved = hasLastPos ? worldPos.distanceTo(this.lastContactPos[w]) : 0;
          
          if (isBurnout || !isMoving) {
            // Stationary / Low-speed burnout: timer-based steady billowing
            this.emitAccumTimer[w] += dt;
            const burnoutInterval = 0.038;
            while (this.emitAccumTimer[w] >= burnoutInterval) {
              this.spawnParticle(worldPos, physics, w, kind, frictionEnergy, isBurnout, windX, windZ, night, carSin, carCos);
              this.emitAccumTimer[w] -= burnoutInterval;
            }
          } else {
            // High-speed drift / slide: distance-interpolated continuous ribbon
            this.emitAccumTimer[w] = 0;
            const targetSpacing = lerp(0.26, 0.10, emitRate);
            const numSteps = hasLastPos ? clamp(Math.floor(distMoved / targetSpacing), 1, 4) : 1;

            for (let s = 1; s <= numSteps; s++) {
              const alphaStep = s / numSteps;
              if (hasLastPos) {
                this.interpPos.lerpVectors(this.lastContactPos[w], worldPos, alphaStep);
              } else {
                this.interpPos.copy(worldPos);
              }
              this.spawnParticle(this.interpPos, physics, w, kind, frictionEnergy, false, windX, windZ, night, carSin, carCos);
            }
          }
          this.lastContactPos[w].copy(worldPos);
        } else {
          this.emitAccumTimer[w] = 0;
          this.lastContactPos[w].copy(worldPos);
        }
      } else {
        this.lastContact[w] = false;
        this.emitAccumTimer[w] = 0;
        state.skidIntensity = 0;
        state.smokeEmissionRate = 0;
      }

      // Age and trim track nodes (fade over 18 seconds)
      const nodes = this.trackNodes[w];
      while (nodes.length > 0 && (time - nodes[0].time > 18 || nodes.length > MAX_SKID_QUADS / 4)) {
        nodes.shift();
      }

      // Construct smooth connected quad ribbons for this wheel track
      for (let p = 0; p < nodes.length - 1 && quadWriteIndex < MAX_SKID_QUADS; p++) {
        const n0 = nodes[p];
        const n1 = nodes[p + 1];
        const age0 = (time - n0.time) / 18;
        const age1 = (time - n1.time) / 18;
        const a0 = Math.max(0, n0.alpha * (1 - age0));
        const a1 = Math.max(0, n1.alpha * (1 - age1));

        if (a0 <= 0.01 && a1 <= 0.01) continue;

        const hw = TIRE_WIDTH * 0.5;
        const posIdx = quadWriteIndex * 12;
        const uvIdx = quadWriteIndex * 8;
        const colIdx = quadWriteIndex * 16;

        // V0 (n0 left)
        this.trackPositions[posIdx] = n0.x - n0.nx * hw;
        this.trackPositions[posIdx + 1] = n0.y;
        this.trackPositions[posIdx + 2] = n0.z - n0.nz * hw;

        // V1 (n0 right)
        this.trackPositions[posIdx + 3] = n0.x + n0.nx * hw;
        this.trackPositions[posIdx + 4] = n0.y;
        this.trackPositions[posIdx + 5] = n0.z + n0.nz * hw;

        // V2 (n1 left)
        this.trackPositions[posIdx + 6] = n1.x - n1.nx * hw;
        this.trackPositions[posIdx + 7] = n1.y;
        this.trackPositions[posIdx + 8] = n1.z - n1.nz * hw;

        // V3 (n1 right)
        this.trackPositions[posIdx + 9] = n1.x + n1.nx * hw;
        this.trackPositions[posIdx + 10] = n1.y;
        this.trackPositions[posIdx + 11] = n1.z + n1.nz * hw;

        // UVs
        this.trackUvs[uvIdx] = 0; this.trackUvs[uvIdx + 1] = 0;
        this.trackUvs[uvIdx + 2] = 1; this.trackUvs[uvIdx + 3] = 0;
        this.trackUvs[uvIdx + 4] = 0; this.trackUvs[uvIdx + 5] = 1;
        this.trackUvs[uvIdx + 6] = 1; this.trackUvs[uvIdx + 7] = 1;

        // Surface Colors with alpha
        for (let v = 0; v < 2; v++) {
          const c = colIdx + v * 4;
          this.trackColors[c] = n0.r;
          this.trackColors[c + 1] = n0.g;
          this.trackColors[c + 2] = n0.b;
          this.trackColors[c + 3] = a0;
        }
        for (let v = 2; v < 4; v++) {
          const c = colIdx + v * 4;
          this.trackColors[c] = n1.r;
          this.trackColors[c + 1] = n1.g;
          this.trackColors[c + 2] = n1.b;
          this.trackColors[c + 3] = a1;
        }

        quadWriteIndex++;
      }
    }

    // Zero remaining quads
    for (let q = quadWriteIndex; q < MAX_SKID_QUADS; q++) {
      const posIdx = q * 12;
      for (let k = 0; k < 12; k++) this.trackPositions[posIdx + k] = 0;
      const colIdx = q * 16;
      for (let k = 0; k < 16; k++) this.trackColors[colIdx + k] = 0;
    }

    this.trackGeom.attributes.position.needsUpdate = true;
    this.trackGeom.attributes.uv.needsUpdate = true;
    this.trackGeom.attributes.color.needsUpdate = true;
    this.trackGeom.setDrawRange(0, quadWriteIndex * 6);

    // 2. Update World-Space Particles (Smoke, Spray, Dust) V2
    this.smokeCamQuat.copy(camera.quaternion);
    this.camRight.set(1, 0, 0).applyQuaternion(this.smokeCamQuat);
    this.camUp.set(0, 1, 0).applyQuaternion(this.smokeCamQuat);

    for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) {
      const p = this.smokeParticles[i];
      if (!p.active) {
        this.instanceAlphaArray[i] = 0;
        this.smokeDummy.position.set(0, -9999, 0);
        this.smokeDummy.scale.set(0, 0, 0);
        this.smokeDummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, this.smokeDummy.matrix);
        continue;
      }

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.instanceAlphaArray[i] = 0;
        this.smokeDummy.position.set(0, -9999, 0);
        this.smokeDummy.scale.set(0, 0, 0);
        this.smokeDummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, this.smokeDummy.matrix);
        continue;
      }

      const prog = p.life / p.maxLife;

      // Harmonic 3D curl turbulence simulation (earlier organic vortex breakup)
      const freq = 0.48;
      const tSeed = time * 1.8 + p.seed;
      const turbX = Math.sin(p.z * freq + p.y * 0.8 + tSeed) * 0.52 + Math.cos(p.y * 1.3 + tSeed * 0.9) * 0.22;
      const turbY = Math.cos(p.x * freq + p.z * 0.6 + tSeed * 0.9) * 0.26 + (p.kind === 'dust' ? 0.16 : p.kind === 'spray' ? -0.32 : 0.38);
      const turbZ = Math.cos(p.x * freq + p.y * 0.8 + tSeed) * 0.52 + Math.sin(p.y * 1.3 + tSeed * 0.9) * 0.22;

      // Vehicle wake deflection (strictly near vehicle and fresh smoke only)
      const distToCar = Math.hypot(p.x - carWorldPos.x, p.z - carWorldPos.z);
      if (distToCar < 3.2 && prog < 0.18) {
        const wakeDecay = (1.0 - distToCar / 3.2) * (1.0 - prog / 0.18);
        p.vx += carVelX * wakeDecay * 0.08 * dt;
        p.vz += carVelZ * wakeDecay * 0.08 * dt;
      }

      // Aerodynamic air drag & separation from vehicle (ambient wind progressively dominates with age)
      const drag = Math.max(0, 1.0 - 2.5 * dt);
      const windAgeMult = 1.0 + prog * 1.9;
      p.vx = (p.vx * drag) + (windX * windAgeMult + turbX) * dt;
      p.vy = (p.vy * Math.max(0, 1.0 - 1.2 * dt)) + turbY * dt;
      p.vz = (p.vz * drag) + (windZ * windAgeMult + turbZ) * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.rotSpeed * dt;

      // Multi-Scale Lifecycle: Core Wisps -> Broken Plume -> Rapid Dissipation
      const sizeProg = 1.0 - Math.pow(1.0 - prog, 2.2);
      const size = lerp(p.size, p.maxSize, sizeProg);

      // Nonlinear Alpha Envelope:
      // Fast fade in for fresh wisp (0-10% age), main visible peak (10-25% age),
      // steep aggressive non-linear drop (25-65% age), very faint residual (65-80%), gone (80-100%)
      const fadeIn = Math.min(1.0, prog / 0.10);
      const fadeProg = Math.max(0, (prog - 0.12) / 0.88);
      const fadeOut = Math.pow(Math.max(0, 1.0 - fadeProg), 2.8);
      const alphaEnv = fadeIn * fadeOut;
      const alpha = p.maxAlpha * alphaEnv;

      // Assign per-instance true alpha buffer
      this.instanceAlphaArray[i] = alpha;

      // Camera view plane projection for restrained, fast-decaying motion stretching
      this.relVel.set(p.vx, p.vy, p.vz);
      const scrVx = this.relVel.dot(this.camRight);
      const scrVy = this.relVel.dot(this.camUp);
      const scrSpeed = Math.hypot(scrVx, scrVy);

      // Rapid stretch decay: by 20% age, stretch decays to 1.0 (isotropic)
      const stretchFade = Math.pow(Math.max(0, 1.0 - prog / 0.20), 2.0);
      let scaleX = size;
      let scaleY = size;
      let rotAngle = p.rot;

      if (scrSpeed > 0.40 && !p.isBurnout && stretchFade > 0.01) {
        // Fresh smoke subtle velocity stretch (capped, rapidly breaking orientation alignment)
        const velAngle = Math.atan2(scrVy, scrVx);
        const stretch = 1.0 + clamp(p.stretchRatio * (scrSpeed / 3.8), 0, 0.85) * stretchFade;
        rotAngle = lerp(velAngle, p.rot, 1.0 - stretchFade);
        scaleX = size * stretch;
        scaleY = size * lerp(0.85, 1.0, 1.0 - stretchFade);
      }

      // Instance transform assembly
      this.smokeRotQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotAngle);
      this.smokeDummy.position.set(p.x, p.y, p.z);
      this.smokeDummy.quaternion.copy(this.smokeCamQuat).multiply(this.smokeRotQuat);
      this.smokeDummy.scale.set(scaleX, scaleY, 1);
      this.smokeDummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, this.smokeDummy.matrix);

      // Environmental lighting tint & night modulation (pure albedo, no alpha darkening)
      const ambientLight = lerp(1.0, 0.28, clamp(night || 0, 0, 1));
      this.smokeMesh.setColorAt(
        i,
        new THREE.Color(
          p.r * ambientLight,
          p.g * ambientLight,
          p.b * ambientLight
        )
      );
    }

    this.smokeMesh.instanceMatrix.needsUpdate = true;
    if (this.smokeMesh.instanceColor) this.smokeMesh.instanceColor.needsUpdate = true;
    const alphaAttr = this.smokeMesh.geometry.getAttribute('instanceAlpha') as THREE.BufferAttribute;
    if (alphaAttr) alphaAttr.needsUpdate = true;
  }

  private spawnParticle(
    pos: THREE.Vector3,
    physics: VehiclePhysics,
    wheelIndex: number,
    kind: 'smoke' | 'dust' | 'spray',
    energy: number,
    isBurnout: boolean,
    windX: number,
    windZ: number,
    night: number,
    carSin: number,
    carCos: number
  ) {
    // FIFO Ring-buffer allocation for deterministic O(1) recycling
    const idx = this.smokeHead;
    this.smokeHead = (this.smokeHead + 1) % MAX_SMOKE_PARTICLES;
    const p = this.smokeParticles[idx];

    p.active = true;
    p.kind = kind;
    p.isBurnout = isBurnout;
    p.seed = Math.random() * 25.0;

    // Contact patch origin with randomized micro-jitter to prevent geometric ribbon alignment
    p.x = pos.x + (Math.random() * 2 - 1) * (isBurnout ? 0.18 : 0.12);
    p.y = pos.y + 0.025;
    p.z = pos.z + (Math.random() * 2 - 1) * (isBurnout ? 0.18 : 0.12);

    const energyFactor = clamp(energy / 2.2, 0.2, 1.0);
    // Break correlation: add random lateral & longitudinal ejection variance
    const latJitter = (Math.random() * 2 - 1) * (isBurnout ? 0.35 : 0.55);
    const longJitter = (Math.random() * 2 - 1) * 0.35;
    const slipVelLat = (-physics.bodyLateralVelocity * 0.20 + latJitter);
    const slipVelLong = ((isBurnout ? 0 : -physics.speed * 0.18) + longJitter);

    // Contact patch ejection velocity in world coordinates
    const ejectWorldX = slipVelLong * carSin + slipVelLat * carCos;
    const ejectWorldZ = slipVelLong * carCos - slipVelLat * carSin;

    p.vx = ejectWorldX + windX * 0.35;
    p.vy = (kind === 'dust' ? 0.28 : isBurnout ? 0.55 : 0.32) + Math.random() * 0.35;
    p.vz = ejectWorldZ + windZ * 0.35;
    p.rot = Math.random() * Math.PI * 2;
    p.rotSpeed = (Math.random() * 2 - 1) * (isBurnout ? 1.4 : 0.95);

    // 1. Initial Scale: fresh wisp (0.14-0.20m) expanding to moderate volume (1.65-1.95m)
    p.size = (kind === 'dust' ? 0.18 : isBurnout ? 0.22 : 0.14) + Math.random() * 0.06;
    p.maxSize = (kind === 'dust' ? 1.35 : isBurnout ? 2.10 : 1.75) + Math.random() * 0.25;
    p.stretchRatio = isBurnout ? 0.12 : clamp(0.65 + Math.abs(physics.speed) * 0.04, 0.6, 1.75);

    // 2. Translucent peak alpha: soft layer accumulation without dark halos
    if (kind === 'dust') {
      p.maxAlpha = 0.12 + energyFactor * 0.06;
      p.r = 0.50; p.g = 0.42; p.b = 0.32; // Earth-tone dust
    } else if (kind === 'spray') {
      p.maxAlpha = 0.09 + energyFactor * 0.05;
      p.r = 0.80; p.g = 0.86; p.b = 0.94; // Water / snow mist
    } else {
      // Dry asphalt tire smoke: subtle non-pure-white warm-gray
      p.maxAlpha = (0.065 + energyFactor * 0.055) * (isBurnout ? 1.35 : 1.0);
      p.r = 0.88;
      p.g = 0.89;
      p.b = 0.90;
    }

    p.life = 0;
    // Bounded lifetime: drift smoke disperses quickly without lingering fog banks
    p.maxLife = (kind === 'dust' ? 0.75 : kind === 'spray' ? 0.85 : isBurnout ? 1.45 : 1.10) + Math.random() * 0.30;
  }

  shiftOrigin(deltaZ: number) {
    for (let w = 0; w < 4; w++) {
      this.lastTireWorld[w].z += deltaZ;
      this.lastContactPos[w].z += deltaZ;
      for (const node of this.trackNodes[w]) {
        node.z += deltaZ;
      }
    }
    for (const sm of this.smokeParticles) {
      if (sm.active) sm.z += deltaZ;
    }
  }

  reset() {
    for (let w = 0; w < 4; w++) {
      this.trackNodes[w].length = 0;
      this.lastContact[w] = false;
      this.emitAccumTimer[w] = 0;
    }
    for (const sm of this.smokeParticles) {
      sm.active = false;
    }
    this.smokeHead = 0;
    this.instanceAlphaArray.fill(0);
    const alphaAttr = this.smokeMesh?.geometry?.getAttribute('instanceAlpha') as THREE.BufferAttribute;
    if (alphaAttr) alphaAttr.needsUpdate = true;
    this.trackPositions.fill(0);
    this.trackColors.fill(0);
    this.trackGeom.attributes.position.needsUpdate = true;
    this.trackGeom.attributes.color.needsUpdate = true;
    this.trackGeom.setDrawRange(0, 0);
  }

  dispose() {
    this.trackGeom.dispose();
    (this.trackMesh.material as THREE.Material).dispose();
    this.trackTexture.dispose();
    this.smokeMesh.geometry.dispose();
    (this.smokeMesh.material as THREE.Material).dispose();
    this.smokeTexture.dispose();
    this.group.removeFromParent();
  }
}

