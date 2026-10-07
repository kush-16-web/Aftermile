import * as THREE from 'three';
import type { WeatherState } from './Weather.ts';
import type { LeafSource } from '../world/WorldChunk.ts';
import { clamp, hash, lerp } from '../core/math.ts';

const MAX_RAIN = 1800;
const MAX_SNOW = 1200;
const MAX_SPRAY = 200;

interface SprayParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number;
  alpha: number;
  life: number; maxLife: number;
  active: boolean;
}

export class Particles {
  group = new THREE.Group();

  // Rain System
  private rainLines: THREE.LineSegments;
  private rainPositions = new Float32Array(MAX_RAIN * 6);
  private rainAlphas = new Float32Array(MAX_RAIN * 2);
  private rainData: { x: number; y: number; z: number; speed: number; len: number }[] = [];

  // Snow System
  private snowPoints: THREE.Points;
  private snowPositions = new Float32Array(MAX_SNOW * 3);
  private snowData: { x: number; y: number; z: number; speed: number; drift: number; phase: number }[] = [];

  // Autumn Leaves System: Completely disabled per Rule #1 (Zero leaves in runtime)

  // Wet Tire Spray System
  private sprayMesh: THREE.InstancedMesh;
  private sprayData: SprayParticle[] = [];
  private sprayDummy = new THREE.Object3D();
  private sprayTexture: THREE.CanvasTexture;

  constructor(scene: THREE.Scene) {
    this.group.name = 'WeatherParticles';
    scene.add(this.group);



    // ==========================================
    // 2. PROCEDURAL FEATHERED SNOWFLAKE TEXTURE
    // ==========================================
    const snowCanvas = document.createElement('canvas');
    snowCanvas.width = 64;
    snowCanvas.height = 64;
    const snCtx = snowCanvas.getContext('2d')!;
    const snGrad = snCtx.createRadialGradient(32, 32, 2, 32, 32, 28);
    snGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    snGrad.addColorStop(0.35, 'rgba(240, 246, 255, 0.85)');
    snGrad.addColorStop(0.7, 'rgba(215, 230, 245, 0.35)');
    snGrad.addColorStop(1, 'rgba(200, 220, 240, 0)');
    snCtx.fillStyle = snGrad;
    snCtx.fillRect(0, 0, 64, 64);
    const snowTexture = new THREE.CanvasTexture(snowCanvas);

    const snowGeom = new THREE.BufferGeometry();
    snowGeom.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    const snowMat = new THREE.PointsMaterial({
      map: snowTexture,
      size: 0.35,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.snowPoints = new THREE.Points(snowGeom, snowMat);
    this.snowPoints.frustumCulled = false;
    this.group.add(this.snowPoints);

    for (let i = 0; i < MAX_SNOW; i++) {
      this.snowData.push({
        x: (Math.random() - 0.5) * 90,
        y: Math.random() * 35,
        z: (Math.random() - 0.5) * 90,
        speed: 2.2 + Math.random() * 2.5,
        drift: (Math.random() - 0.5) * 1.5,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // ==========================================
    // 3. VELOCITY-RESPONSIVE RAIN LINE STREAKS
    // ==========================================
    const rainGeom = new THREE.BufferGeometry();
    rainGeom.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3).setUsage(THREE.DynamicDrawUsage));
    const rainMat = new THREE.LineBasicMaterial({
      color: 0xbed4e6,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(rainGeom, rainMat);
    this.rainLines.frustumCulled = false;
    this.group.add(this.rainLines);

    for (let i = 0; i < MAX_RAIN; i++) {
      this.rainData.push({
        x: (Math.random() - 0.5) * 85,
        y: Math.random() * 40,
        z: (Math.random() - 0.5) * 85,
        speed: 38 + Math.random() * 16,
        len: 1.4 + Math.random() * 1.2,
      });
    }

    // ==========================================
    // 4. WET TIRE ROAD SPRAY PARTICLES (Fine Translucent Mist)
    // ==========================================
    const sprayCanvas = document.createElement('canvas');
    sprayCanvas.width = 64;
    sprayCanvas.height = 64;
    const spCtx = sprayCanvas.getContext('2d')!;
    const spGrad = spCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
    spGrad.addColorStop(0, 'rgba(210, 230, 245, 0.45)');
    spGrad.addColorStop(0.35, 'rgba(185, 210, 230, 0.18)');
    spGrad.addColorStop(0.70, 'rgba(175, 200, 220, 0.06)');
    spGrad.addColorStop(1, 'rgba(165, 190, 210, 0)');
    spCtx.fillStyle = spGrad;
    spCtx.fillRect(0, 0, 64, 64);
    this.sprayTexture = new THREE.CanvasTexture(sprayCanvas);

    const sprayGeom = new THREE.PlaneGeometry(1, 1);
    const sprayMat = new THREE.MeshBasicMaterial({
      map: this.sprayTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.32,
      side: THREE.DoubleSide,
    });
    this.sprayMesh = new THREE.InstancedMesh(sprayGeom, sprayMat, MAX_SPRAY);
    this.sprayMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sprayMesh.frustumCulled = false;
    this.group.add(this.sprayMesh);

    for (let i = 0; i < MAX_SPRAY; i++) {
      this.sprayData.push({
        x: 0, y: -9999, z: 0,
        vx: 0, vy: 0, vz: 0,
        size: 0.4,
        alpha: 0,
        life: 0, maxLife: 0.6,
        active: false,
      });
      this.sprayDummy.position.set(0, -9999, 0);
      this.sprayDummy.updateMatrix();
      this.sprayMesh.setMatrixAt(i, this.sprayDummy.matrix);
    }
  }

  update(
    dt: number,
    time: number,
    center: THREE.Vector3,
    w: WeatherState,
    quality: number,
    inTunnel: boolean,
    carSpeed = 0,
    carLateralVel = 0,
    carSlip = 0,
    leafDensity = 1,
    leafSources: LeafSource[] = []
  ) {
    this.group.position.copy(center);

    const windX = Math.sin(time * 0.4) * (w.wind * 0.18);
    const windZ = Math.cos(time * 0.35) * (w.wind * 0.14);

    // ----------------------------------------------------
    // 1. UPDATE RAIN (Relative Velocity & Streak Extension)
    // ----------------------------------------------------
    this.rainLines.visible = !inTunnel && w.wet > 0.12 && quality > 0;
    if (this.rainLines.visible) {
      const activeCount = Math.floor(MAX_RAIN * quality * Math.min(1, w.wet * 1.2));
      const rainMat = this.rainLines.material as THREE.LineBasicMaterial;
      rainMat.opacity = clamp(w.wet * 0.48, 0.15, 0.65);

      // Relative fall vector accounting for vehicle speed + wind
      const relVx = windX - carLateralVel * 0.4;
      const relVz = -carSpeed * 0.85 + windZ;
      const fallSpeed = 38.0;

      for (let i = 0; i < activeCount; i++) {
        const p = this.rainData[i];
        p.y -= fallSpeed * dt;
        p.x += relVx * dt * 0.3;
        p.z += relVz * dt * 0.3;

        // Wrap boundaries around player camera
        if (p.y < -3) { p.y = 35 + Math.random() * 8; p.x = (Math.random() - 0.5) * 80; p.z = (Math.random() - 0.5) * 80; }
        if (p.x < -42) p.x += 84; if (p.x > 42) p.x -= 84;
        if (p.z < -42) p.z += 84; if (p.z > 42) p.z -= 84;

        const baseIdx = i * 6;
        // Top vertex
        this.rainPositions[baseIdx] = p.x;
        this.rainPositions[baseIdx + 1] = p.y;
        this.rainPositions[baseIdx + 2] = p.z;

        // Bottom vertex stretched along relative trajectory
        const lenScale = p.len * (1.0 + Math.abs(carSpeed) * 0.04);
        this.rainPositions[baseIdx + 3] = p.x - relVx * 0.035;
        this.rainPositions[baseIdx + 4] = p.y - lenScale;
        this.rainPositions[baseIdx + 5] = p.z - relVz * 0.035;
      }

      // Zero remaining
      for (let i = activeCount; i < MAX_RAIN; i++) {
        const baseIdx = i * 6;
        for (let k = 0; k < 6; k++) this.rainPositions[baseIdx + k] = 0;
      }

      this.rainLines.geometry.attributes.position.needsUpdate = true;
      this.rainLines.geometry.setDrawRange(0, activeCount * 2);

      // Spawn wet tire spray on road
      if (Math.abs(carSpeed) > 4 && w.wet > 0.25 && !inTunnel) {
        this.spawnWetSpray(carSpeed, carLateralVel, w.wet);
      }
    }

    // ----------------------------------------------------
    // 2. UPDATE SNOW (Feathered, Floating Turbulence)
    // ----------------------------------------------------
    this.snowPoints.visible = !inTunnel && w.snow > 0.05 && quality > 0;
    if (this.snowPoints.visible) {
      const activeSnow = Math.floor(MAX_SNOW * quality * w.snow);
      const snowMat = this.snowPoints.material as THREE.PointsMaterial;
      snowMat.opacity = clamp(w.snow * 0.85, 0.2, 0.9);

      for (let i = 0; i < activeSnow; i++) {
        const p = this.snowData[i];
        p.phase += dt * 2.2;
        p.y -= p.speed * dt;
        p.x += (windX * 0.4 + Math.sin(p.phase) * 0.6) * dt;
        p.z += (windZ * 0.4 + Math.cos(p.phase * 0.8) * 0.5 - carSpeed * 0.35) * dt;

        if (p.y < -2) { p.y = 30 + Math.random() * 6; p.x = (Math.random() - 0.5) * 80; p.z = (Math.random() - 0.5) * 80; }
        if (p.x < -42) p.x += 84; if (p.x > 42) p.x -= 84;
        if (p.z < -42) p.z += 84; if (p.z > 42) p.z -= 84;

        const idx = i * 3;
        this.snowPositions[idx] = p.x;
        this.snowPositions[idx + 1] = p.y;
        this.snowPositions[idx + 2] = p.z;
      }

      this.snowPoints.geometry.attributes.position.needsUpdate = true;
      this.snowPoints.geometry.setDrawRange(0, activeSnow);
    }

    // ----------------------------------------------------
    // 3. AUTUMN LEAVES: ZERO IN RUNTIME (Rule #1)
    // ----------------------------------------------------

    // ----------------------------------------------------
    // 4. UPDATE WET ROAD TYRE SPRAY
    // ----------------------------------------------------
    for (let i = 0; i < MAX_SPRAY; i++) {
      const sp = this.sprayData[i];
      if (!sp.active) continue;

      sp.life += dt;
      if (sp.life >= sp.maxLife) {
        sp.active = false;
        this.sprayDummy.position.set(0, -9999, 0);
        this.sprayDummy.updateMatrix();
        this.sprayMesh.setMatrixAt(i, this.sprayDummy.matrix);
        continue;
      }

      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;
      sp.size += 1.4 * dt;
      sp.vy -= 0.6 * dt; // gravity

      const progress = sp.life / sp.maxLife;
      const alpha = sp.alpha * (1.0 - progress);

      this.sprayDummy.position.set(sp.x, sp.y, sp.z);
      this.sprayDummy.scale.set(sp.size, sp.size, 1);
      this.sprayDummy.updateMatrix();
      this.sprayMesh.setMatrixAt(i, this.sprayDummy.matrix);
    }
    this.sprayMesh.instanceMatrix.needsUpdate = true;
  }

  private spawnWetSpray(carSpeed: number, carLateralVel: number, wetness: number) {
    const rearLeft = { x: -0.84, y: 0.08, z: -1.85 };
    const rearRight = { x: 0.84, y: 0.08, z: -1.85 };
    const speedRatio = Math.min(1.0, Math.abs(carSpeed) / 35.0);

    for (const tire of [rearLeft, rearRight]) {
      if (Math.random() < 0.65) {
        for (let i = 0; i < MAX_SPRAY; i++) {
          const sp = this.sprayData[i];
          if (!sp.active) {
            sp.active = true;
            sp.x = tire.x + (Math.random() - 0.5) * 0.18;
            sp.y = tire.y + Math.random() * 0.10;
            sp.z = tire.z - Math.random() * 0.25;
            sp.vx = -carLateralVel * 0.35 + (Math.random() - 0.5) * 0.4;
            sp.vy = 0.35 + Math.random() * 0.6 * speedRatio;
            sp.vz = -Math.sign(carSpeed || 1) * (2.0 + speedRatio * 8.0);
            sp.size = 0.24 + Math.random() * 0.18;
            sp.alpha = clamp(wetness * 0.35, 0.08, 0.32);
            sp.life = 0;
            sp.maxLife = 0.28 + Math.random() * 0.22;
            break;
          }
        }
      }
    }
  }

  dispose() {
    this.rainLines.geometry.dispose();
    (this.rainLines.material as THREE.Material).dispose();
    this.snowPoints.geometry.dispose();
    (this.snowPoints.material as THREE.Material).dispose();
    this.sprayMesh.geometry.dispose();
    (this.sprayMesh.material as THREE.Material).dispose();
    this.sprayTexture.dispose();
    this.group.removeFromParent();
  }
}

