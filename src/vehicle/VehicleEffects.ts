import * as THREE from 'three';
import type { VehiclePhysics } from './VehiclePhysics.ts';
import type { PlayerVehicleModel } from './PlayerVehicleModel.ts';

const MAX_SKID_QUADS = 1000;
const TIRE_WIDTH = 0.22;
const MAX_SMOKE_PARTICLES = 140;

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
  isDust: boolean;
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

  // Tyre Smoke & Surface Dust Particle System
  private smokeParticles: SmokeParticle[] = [];
  private smokeMesh: THREE.InstancedMesh;
  private smokeTexture: THREE.CanvasTexture;
  private smokeDummy = new THREE.Object3D();
  private smokeRotQuat = new THREE.Quaternion();
  private smokeCamQuat = new THREE.Quaternion();

  constructor(private scene: THREE.Scene) {
    this.group.name = 'VehicleEffects';
    this.scene.add(this.group);

    // 1. Procedural Surface Track Tread Profile (Dual-shoulder tire contact profile)
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

    // 2. Procedural Soft Smoke & Dust Texture
    const smokeCanvas = document.createElement('canvas');
    smokeCanvas.width = 128;
    smokeCanvas.height = 128;
    const smCtx = smokeCanvas.getContext('2d')!;
    const smGrad = smCtx.createRadialGradient(64, 64, 4, 64, 64, 60);
    smGrad.addColorStop(0, 'rgba(235, 240, 245, 0.85)');
    smGrad.addColorStop(0.3, 'rgba(215, 222, 230, 0.45)');
    smGrad.addColorStop(0.65, 'rgba(195, 205, 215, 0.18)');
    smGrad.addColorStop(1, 'rgba(180, 190, 200, 0)');
    smCtx.fillStyle = smGrad;
    smCtx.fillRect(0, 0, 128, 128);

    for (let p = 0; p < 8; p++) {
      const px = 64 + (Math.random() * 2 - 1) * 20;
      const py = 64 + (Math.random() * 2 - 1) * 20;
      const pr = 18 + Math.random() * 20;
      const puffGrad = smCtx.createRadialGradient(px, py, 2, px, py, pr);
      puffGrad.addColorStop(0, 'rgba(240, 245, 250, 0.35)');
      puffGrad.addColorStop(1, 'rgba(200, 210, 220, 0)');
      smCtx.fillStyle = puffGrad;
      smCtx.beginPath();
      smCtx.arc(px, py, pr, 0, Math.PI * 2);
      smCtx.fill();
    }
    this.smokeTexture = new THREE.CanvasTexture(smokeCanvas);

    // Smoke/Dust Instanced Mesh
    const smokeGeom = new THREE.PlaneGeometry(1, 1);
    const smokeMat = new THREE.MeshBasicMaterial({
      map: this.smokeTexture,
      transparent: true,
      depthWrite: false,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    this.smokeMesh = new THREE.InstancedMesh(smokeGeom, smokeMat, MAX_SMOKE_PARTICLES);
    this.smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.smokeMesh.frustumCulled = false;
    this.group.add(this.smokeMesh);

    for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) {
      this.smokeParticles.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        rot: 0, rotSpeed: 0,
        size: 0.3, maxSize: 2.2,
        alpha: 0, maxAlpha: 0.35,
        life: 0, maxLife: 1.2,
        active: false,
        isDust: false,
      });
      this.smokeDummy.position.set(0, -9999, 0);
      this.smokeDummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, this.smokeDummy.matrix);
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
  }

  update(
    dt: number,
    time: number,
    physics: VehiclePhysics,
    model: PlayerVehicleModel,
    camera: THREE.Camera,
    wet = 0,
    snow = 0
  ) {
    const totalSpeed = Math.hypot(physics.speed, physics.bodyLateralVelocity);
    const isMoving = totalSpeed > 0.8;
    const isSlipping = physics.slip > 0.18 && totalSpeed > 1.8;
    const isAirborne = Math.abs(physics.heave) > 0.28;

    const station = physics.road.station(physics.s - 50);
    const isGasStation = Math.abs(physics.s - station) < 65 && physics.offset > 0;
    const isOffRoad = Math.abs(physics.offset) > 9.8 && !isGasStation;

    // 1. Process 4-Wheel Surface Tracks
    let quadWriteIndex = 0;

    for (let w = 0; w < 4; w++) {
      const isRear = w >= 2;
      const pivot = model.steer[w];

      if (pivot && model.ready && !isAirborne && isMoving) {
        const worldPos = new THREE.Vector3();
        pivot.getWorldPosition(worldPos);
        worldPos.y += 0.025; // Surface elevation

        let shouldTrack = false;
        let trackR = 0.08, trackG = 0.08, trackB = 0.09; // Rubber black default
        let alpha = 0;

        // Surface tracks strictly require meaningful tire slip (drift, burnout, locked wheel), never ordinary rolling
        if (physics.slip > 0.28 && isMoving) {
          if (snow > 0.15) {
            // SNOW: subtle snow displacement track during wheelspin / slide
            shouldTrack = true;
            trackR = 0.78; trackG = 0.82; trackB = 0.88;
            alpha = THREE.MathUtils.clamp((physics.slip - 0.25) * 0.8, 0.15, 0.60);
          } else if (isOffRoad) {
            // DIRT / GRASS: pressed earth during wheelspin or slide
            shouldTrack = true;
            trackR = 0.28; trackG = 0.22; trackB = 0.16;
            alpha = THREE.MathUtils.clamp((physics.slip - 0.22) * 0.9, 0.20, 0.75);
          } else if (wet < 0.6 && (isRear || physics.slip > 0.42)) {
            // DRY ASPHALT RUBBER SKID MARKS: during real tire slip / burnout / drift
            shouldTrack = true;
            trackR = 0.06; trackG = 0.06; trackB = 0.07;
            alpha = THREE.MathUtils.clamp((physics.slip - 0.25) / 0.50, 0.20, 0.90) * (1.0 - wet * 0.5);
          }
        }

        if (shouldTrack) {
          const dist = worldPos.distanceTo(this.lastTireWorld[w]);
          if (dist > 0.26 || !this.lastContact[w]) {
            const heading = -physics.road.heading(physics.s) - physics.heading;
            const perpX = Math.cos(heading);
            const perpZ = -Math.sin(heading);

            this.trackNodes[w].push({
              x: worldPos.x,
              y: worldPos.y,
              z: worldPos.z,
              nx: perpX,
              ny: 1,
              nz: perpZ,
              alpha,
              r: trackR,
              g: trackG,
              b: trackB,
              time,
            });

            this.lastTireWorld[w].copy(worldPos);
            this.lastContact[w] = true;

            // Spawn smoke on dry asphalt slip
            if (!isOffRoad && snow < 0.1 && physics.slip > 0.28 && (isRear || physics.slip > 0.55) && Math.random() < 0.75 && wet < 0.3) {
              this.spawnSmoke(worldPos, physics, false);
            }
          }
        } else {
          this.lastContact[w] = false;
        }

        // Dust disturbance on dirt/grass
        if (isOffRoad && totalSpeed > 2.5 && (isSlipping || totalSpeed > 8.0) && Math.random() < 0.45) {
          this.spawnSmoke(worldPos, physics, true);
        }
      } else {
        this.lastContact[w] = false;
      }

      // Age and trim track nodes (fade over 16 seconds)
      const nodes = this.trackNodes[w];
      while (nodes.length > 0 && (time - nodes[0].time > 16 || nodes.length > MAX_SKID_QUADS / 4)) {
        nodes.shift();
      }

      // Construct quad ribbons
      for (let p = 0; p < nodes.length - 1 && quadWriteIndex < MAX_SKID_QUADS; p++) {
        const n0 = nodes[p];
        const n1 = nodes[p + 1];
        const age0 = (time - n0.time) / 16;
        const age1 = (time - n1.time) / 16;
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

    // Zero remaining
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

    // 2. Update Tyre Smoke / Dust Particles
    this.smokeCamQuat.copy(camera.quaternion);

    for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) {
      const p = this.smokeParticles[i];
      if (!p.active) {
        this.smokeDummy.position.set(0, -9999, 0);
        this.smokeDummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, this.smokeDummy.matrix);
        continue;
      }

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.smokeDummy.position.set(0, -9999, 0);
        this.smokeDummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, this.smokeDummy.matrix);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.rotSpeed * dt;
      p.vy += (p.isDust ? 0.15 : 0.35) * dt;
      p.vx *= (1 - 0.8 * dt);
      p.vz *= (1 - 0.8 * dt);

      const prog = p.life / p.maxLife;
      const size = THREE.MathUtils.lerp(p.size, p.maxSize, Math.pow(prog, 0.6));
      const alphaEnv = Math.sin(prog * Math.PI) * Math.pow(1 - prog, 0.4);
      const alpha = p.maxAlpha * alphaEnv;

      this.smokeDummy.position.set(p.x, p.y, p.z);
      this.smokeRotQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), p.rot);
      this.smokeDummy.quaternion.copy(this.smokeCamQuat).multiply(this.smokeRotQuat);
      this.smokeDummy.scale.set(size, size, 1);
      this.smokeDummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, this.smokeDummy.matrix);
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
  }

  private spawnSmoke(pos: THREE.Vector3, physics: VehiclePhysics, isDust = false) {
    for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) {
      const p = this.smokeParticles[i];
      if (!p.active) {
        p.active = true;
        p.isDust = isDust;
        p.x = pos.x + (Math.random() * 2 - 1) * 0.2;
        p.y = pos.y + 0.1;
        p.z = pos.z + (Math.random() * 2 - 1) * 0.2;
        
        p.vx = -physics.lateralVelocity * 0.35 + (Math.random() * 2 - 1) * (isDust ? 0.9 : 0.6);
        p.vy = (isDust ? 0.5 : 0.35) + Math.random() * 0.6;
        p.vz = (Math.random() * 2 - 1) * 0.6;
        p.rot = Math.random() * Math.PI * 2;
        p.rotSpeed = (Math.random() * 2 - 1) * 1.5;
        
        p.size = (isDust ? 0.45 : 0.35) + Math.random() * 0.25;
        p.maxSize = (isDust ? 2.4 : 1.6) + Math.random() * 1.0;
        p.maxAlpha = isDust
          ? 0.35 + THREE.MathUtils.clamp(physics.slip * 0.3, 0, 0.3)
          : 0.22 + THREE.MathUtils.clamp(physics.slip * 0.25, 0, 0.25);
        p.life = 0;
        p.maxLife = (isDust ? 0.75 : 0.9) + Math.random() * 0.6;
        break;
      }
    }
  }

  shiftOrigin(deltaZ: number) {
    for (let w = 0; w < 4; w++) {
      this.lastTireWorld[w].z += deltaZ;
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
    }
    for (const sm of this.smokeParticles) {
      sm.active = false;
    }
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
