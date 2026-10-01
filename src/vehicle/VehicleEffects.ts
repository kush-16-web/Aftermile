import * as THREE from 'three';
import type { VehiclePhysics } from './VehiclePhysics.ts';
import type { PlayerVehicleModel } from './PlayerVehicleModel.ts';

const MAX_SKID_QUADS = 800;
const TIRE_WIDTH = 0.24;
const MAX_SMOKE_PARTICLES = 120;

interface SkidNode {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  alpha: number;
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
}

export class VehicleEffects {
  readonly group = new THREE.Group();
  
  // Skid Mark Mesh & Geometry
  private skidGeom = new THREE.BufferGeometry();
  private skidPositions = new Float32Array(MAX_SKID_QUADS * 4 * 3);
  private skidUvs = new Float32Array(MAX_SKID_QUADS * 4 * 2);
  private skidColors = new Float32Array(MAX_SKID_QUADS * 4 * 4);
  private skidIndices = new Uint16Array(MAX_SKID_QUADS * 6);
  private skidMesh: THREE.Mesh;
  private skidTexture: THREE.CanvasTexture;
  private skidNodes: SkidNode[][] = [[], [], [], []]; // 4 wheels
  private lastTireWorld: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private lastContact = [false, false, false, false];

  // Tyre Smoke Particle System
  private smokeParticles: SmokeParticle[] = [];
  private smokeMesh: THREE.InstancedMesh;
  private smokeTexture: THREE.CanvasTexture;
  private smokeDummy = new THREE.Object3D();
  private smokeRotQuat = new THREE.Quaternion();
  private smokeCamQuat = new THREE.Quaternion();

  constructor(private scene: THREE.Scene) {
    this.group.name = 'VehicleEffects';
    this.scene.add(this.group);

    // 1. Procedural Realistic Tire Tread Rubber Texture
    const skidCanvas = document.createElement('canvas');
    skidCanvas.width = 64;
    skidCanvas.height = 256;
    const sCtx = skidCanvas.getContext('2d')!;
    // Dual-shoulder tire contact profile with feathered outer edges
    const sGrad = sCtx.createLinearGradient(0, 0, 64, 0);
    sGrad.addColorStop(0, 'rgba(15, 15, 18, 0)');
    sGrad.addColorStop(0.12, 'rgba(15, 15, 18, 0.9)');
    sGrad.addColorStop(0.35, 'rgba(25, 25, 30, 0.75)');
    sGrad.addColorStop(0.50, 'rgba(18, 18, 22, 0.65)');
    sGrad.addColorStop(0.65, 'rgba(25, 25, 30, 0.75)');
    sGrad.addColorStop(0.88, 'rgba(15, 15, 18, 0.9)');
    sGrad.addColorStop(1, 'rgba(15, 15, 18, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 64, 256);
    
    // Add subtle procedural asphalt/tread micro-grain
    const imgData = sCtx.getImageData(0, 0, 64, 256);
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 0) {
        const noise = (Math.random() * 2 - 1) * 18;
        imgData.data[i] = Math.max(8, Math.min(40, imgData.data[i] + noise));
        imgData.data[i + 1] = Math.max(8, Math.min(40, imgData.data[i + 1] + noise));
        imgData.data[i + 2] = Math.max(10, Math.min(45, imgData.data[i + 2] + noise));
      }
    }
    sCtx.putImageData(imgData, 0, 0);
    this.skidTexture = new THREE.CanvasTexture(skidCanvas);
    this.skidTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.skidTexture.wrapT = THREE.RepeatWrapping;

    // Build Skid Mesh Indexing
    for (let i = 0; i < MAX_SKID_QUADS; i++) {
      const base = i * 4;
      const idx = i * 6;
      this.skidIndices[idx] = base;
      this.skidIndices[idx + 1] = base + 1;
      this.skidIndices[idx + 2] = base + 2;
      this.skidIndices[idx + 3] = base + 2;
      this.skidIndices[idx + 4] = base + 1;
      this.skidIndices[idx + 5] = base + 3;
    }
    this.skidGeom.setIndex(new THREE.BufferAttribute(this.skidIndices, 1));
    this.skidGeom.setAttribute('position', new THREE.BufferAttribute(this.skidPositions, 3));
    this.skidGeom.setAttribute('uv', new THREE.BufferAttribute(this.skidUvs, 2));
    this.skidGeom.setAttribute('color', new THREE.BufferAttribute(this.skidColors, 4));

    const skidMat = new THREE.MeshBasicMaterial({
      map: this.skidTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      side: THREE.DoubleSide,
    });
    this.skidMesh = new THREE.Mesh(this.skidGeom, skidMat);
    this.skidMesh.frustumCulled = false;
    this.group.add(this.skidMesh);

    // 2. Procedural Organic Soft Smoke Particle Texture
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

    // Soft organic puffs
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

    // Smoke Instanced Mesh
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
      });
      this.smokeDummy.position.set(0, -9999, 0);
      this.smokeDummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, this.smokeDummy.matrix);
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, time: number, physics: VehiclePhysics, model: PlayerVehicleModel, camera: THREE.Camera) {
    const totalSpeed = Math.hypot(physics.speed, physics.bodyLateralVelocity);
    const isSlipping = physics.slip > 0.18 && totalSpeed > 1.8;
    const isAirborne = Math.abs(physics.heave) > 0.28;

    // 1. Process Skid Mark Ribbons
    let quadWriteIndex = 0;

    for (let w = 0; w < 4; w++) {
      const isRear = w >= 2;
      const wheelSlipping = isSlipping && (isRear || physics.slip > 0.40);
      const pivot = model.steer[w];

      if (pivot && model.ready) {
        const worldPos = new THREE.Vector3();
        pivot.getWorldPosition(worldPos);
        worldPos.y += 0.025; // Subtle elevation above road surface

        if (wheelSlipping && !isAirborne) {
          const dist = worldPos.distanceTo(this.lastTireWorld[w]);
          if (dist > 0.28 || !this.lastContact[w]) {
            // Perpendicular vector along the vehicle heading
            const heading = -physics.road.heading(physics.s) - physics.heading;
            const perpX = Math.cos(heading);
            const perpZ = -Math.sin(heading);
            
            // Progressive rubber density based on slip intensity
            const alpha = THREE.MathUtils.clamp((physics.slip - 0.16) / 0.55, 0.20, 0.92);

            this.skidNodes[w].push({
              x: worldPos.x,
              y: worldPos.y,
              z: worldPos.z,
              nx: perpX,
              ny: 1,
              nz: perpZ,
              alpha,
              time,
            });

            this.lastTireWorld[w].copy(worldPos);
            this.lastContact[w] = true;

            // Spawn smoke on moderate to heavy slip
            if (physics.slip > 0.28 && (isRear || physics.slip > 0.55) && Math.random() < 0.75) {
              this.spawnSmoke(worldPos, physics);
            }
          }
        } else {
          this.lastContact[w] = false;
        }
      }

      // Age and trim skid nodes (fade over 16 seconds)
      const nodes = this.skidNodes[w];
      while (nodes.length > 0 && (time - nodes[0].time > 16 || nodes.length > MAX_SKID_QUADS / 4)) {
        nodes.shift();
      }

      // Construct seamless quad ribbon
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
        this.skidPositions[posIdx] = n0.x - n0.nx * hw;
        this.skidPositions[posIdx + 1] = n0.y;
        this.skidPositions[posIdx + 2] = n0.z - n0.nz * hw;

        // V1 (n0 right)
        this.skidPositions[posIdx + 3] = n0.x + n0.nx * hw;
        this.skidPositions[posIdx + 4] = n0.y;
        this.skidPositions[posIdx + 5] = n0.z + n0.nz * hw;

        // V2 (n1 left)
        this.skidPositions[posIdx + 6] = n1.x - n1.nx * hw;
        this.skidPositions[posIdx + 7] = n1.y;
        this.skidPositions[posIdx + 8] = n1.z - n1.nz * hw;

        // V3 (n1 right)
        this.skidPositions[posIdx + 9] = n1.x + n1.nx * hw;
        this.skidPositions[posIdx + 10] = n1.y;
        this.skidPositions[posIdx + 11] = n1.z + n1.nz * hw;

        // UVs
        this.skidUvs[uvIdx] = 0; this.skidUvs[uvIdx + 1] = 0;
        this.skidUvs[uvIdx + 2] = 1; this.skidUvs[uvIdx + 3] = 0;
        this.skidUvs[uvIdx + 4] = 0; this.skidUvs[uvIdx + 5] = 1;
        this.skidUvs[uvIdx + 6] = 1; this.skidUvs[uvIdx + 7] = 1;

        // Colors with smooth alpha
        for (let v = 0; v < 2; v++) {
          const c = colIdx + v * 4;
          this.skidColors[c] = 0.95;
          this.skidColors[c + 1] = 0.95;
          this.skidColors[c + 2] = 0.95;
          this.skidColors[c + 3] = a0;
        }
        for (let v = 2; v < 4; v++) {
          const c = colIdx + v * 4;
          this.skidColors[c] = 0.95;
          this.skidColors[c + 1] = 0.95;
          this.skidColors[c + 2] = 0.95;
          this.skidColors[c + 3] = a1;
        }

        quadWriteIndex++;
      }
    }

    // Zero out unused quads in buffer
    for (let q = quadWriteIndex; q < MAX_SKID_QUADS; q++) {
      const posIdx = q * 12;
      for (let k = 0; k < 12; k++) this.skidPositions[posIdx + k] = 0;
      const colIdx = q * 16;
      for (let k = 0; k < 16; k++) this.skidColors[colIdx + k] = 0;
    }

    this.skidGeom.attributes.position.needsUpdate = true;
    this.skidGeom.attributes.uv.needsUpdate = true;
    this.skidGeom.attributes.color.needsUpdate = true;
    this.skidGeom.setDrawRange(0, quadWriteIndex * 6);

    // 2. Update Tyre Smoke Particles
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
      p.vy += 0.35 * dt; // gentle thermal lift
      p.vx *= (1 - 0.8 * dt); // air resistance
      p.vz *= (1 - 0.8 * dt);

      const prog = p.life / p.maxLife;
      const size = THREE.MathUtils.lerp(p.size, p.maxSize, Math.pow(prog, 0.6));
      // Smooth bell curve envelope: quick fade-in, long natural dissipation
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

  private spawnSmoke(pos: THREE.Vector3, physics: VehiclePhysics) {
    for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) {
      const p = this.smokeParticles[i];
      if (!p.active) {
        p.active = true;
        p.x = pos.x + (Math.random() * 2 - 1) * 0.18;
        p.y = pos.y + 0.12;
        p.z = pos.z + (Math.random() * 2 - 1) * 0.18;
        
        // Initial velocity includes vehicle velocity transfer + tire fling
        p.vx = -physics.lateralVelocity * 0.35 + (Math.random() * 2 - 1) * 0.6;
        p.vy = 0.35 + Math.random() * 0.5;
        p.vz = (Math.random() * 2 - 1) * 0.6;
        p.rot = Math.random() * Math.PI * 2;
        p.rotSpeed = (Math.random() * 2 - 1) * 1.5;
        
        p.size = 0.35 + Math.random() * 0.25;
        p.maxSize = 1.6 + Math.random() * 1.0;
        p.maxAlpha = 0.22 + THREE.MathUtils.clamp(physics.slip * 0.25, 0, 0.25);
        p.life = 0;
        p.maxLife = 0.9 + Math.random() * 0.6;
        break;
      }
    }
  }

  shiftOrigin(deltaZ: number) {
    for (let w = 0; w < 4; w++) {
      this.lastTireWorld[w].z += deltaZ;
      for (const node of this.skidNodes[w]) {
        node.z += deltaZ;
      }
    }
    for (const sm of this.smokeParticles) {
      if (sm.active) sm.z += deltaZ;
    }
  }

  reset() {
    for (let w = 0; w < 4; w++) {
      this.skidNodes[w].length = 0;
      this.lastContact[w] = false;
    }
    for (const sm of this.smokeParticles) {
      sm.active = false;
    }
    this.skidPositions.fill(0);
    this.skidColors.fill(0);
    this.skidGeom.attributes.position.needsUpdate = true;
    this.skidGeom.attributes.color.needsUpdate = true;
    this.skidGeom.setDrawRange(0, 0);
  }

  dispose() {
    this.skidGeom.dispose();
    (this.skidMesh.material as THREE.Material).dispose();
    this.skidTexture.dispose();
    this.smokeMesh.geometry.dispose();
    (this.smokeMesh.material as THREE.Material).dispose();
    this.smokeTexture.dispose();
    this.group.removeFromParent();
  }
}
