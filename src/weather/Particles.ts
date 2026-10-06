import * as THREE from 'three';
import type { WeatherState } from './Weather.ts';
import { clamp, lerp } from '../core/math.ts';

const MAX_LEAVES = 320;
const MAX_RAIN = 1800;
const MAX_SNOW = 1200;
const MAX_SPRAY = 200;

interface LeafParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotX: number; rotY: number; rotZ: number;
  rotSpeedX: number; rotSpeedY: number; rotSpeedZ: number;
  scale: number;
  type: number; // 0..3
  phase: number;
}

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

  // Autumn Leaves System (Instanced Quads with 3D Tumbling and Car Wake Displacement)
  private leafMesh: THREE.InstancedMesh;
  private leafData: LeafParticle[] = [];
  private leafDummy = new THREE.Object3D();
  private leafTexture: THREE.CanvasTexture;

  // Wet Tire Spray System
  private sprayMesh: THREE.InstancedMesh;
  private sprayData: SprayParticle[] = [];
  private sprayDummy = new THREE.Object3D();
  private sprayTexture: THREE.CanvasTexture;

  constructor(scene: THREE.Scene) {
    this.group.name = 'WeatherParticles';
    scene.add(this.group);

    // ==========================================
    // 1. PROCEDURAL ORGANIC AUTUMN LEAF TEXTURE
    // ==========================================
    const leafCanvas = document.createElement('canvas');
    leafCanvas.width = 256;
    leafCanvas.height = 256;
    const lCtx = leafCanvas.getContext('2d')!;

    // Draw 4 distinct leaf variants in a 2x2 grid
    const leafConfigs = [
      { cx: 64, cy: 64, col: '#f59e0b', type: 'maple' },
      { cx: 192, cy: 64, col: '#ea580c', type: 'oak' },
      { cx: 64, cy: 192, col: '#dc2626', type: 'scarlet' },
      { cx: 192, cy: 192, col: '#b45309', type: 'birch' },
    ];

    for (const conf of leafConfigs) {
      lCtx.save();
      lCtx.translate(conf.cx, conf.cy);

      // Organic Leaf Silhouette
      lCtx.beginPath();
      lCtx.fillStyle = conf.col;
      lCtx.strokeStyle = 'rgba(60, 20, 5, 0.4)';
      lCtx.lineWidth = 1.5;

      if (conf.type === 'maple') {
        // Multi-lobed Sugar Maple shape
        lCtx.moveTo(0, -42);
        lCtx.bezierCurveTo(15, -30, 36, -24, 38, -10);
        lCtx.bezierCurveTo(24, -4, 32, 14, 30, 26);
        lCtx.bezierCurveTo(16, 22, 6, 36, 0, 42);
        lCtx.bezierCurveTo(-6, 36, -16, 22, -30, 26);
        lCtx.bezierCurveTo(-32, 14, -24, -4, -38, -10);
        lCtx.bezierCurveTo(-36, -24, -15, -30, 0, -42);
      } else if (conf.type === 'oak') {
        // Rounded Lobed Oak
        lCtx.moveTo(0, -44);
        lCtx.bezierCurveTo(18, -32, 28, -20, 22, -8);
        lCtx.bezierCurveTo(34, 4, 28, 18, 22, 28);
        lCtx.bezierCurveTo(12, 34, 4, 38, 0, 42);
        lCtx.bezierCurveTo(-4, 38, -12, 34, -22, 28);
        lCtx.bezierCurveTo(-28, 18, -34, 4, -22, -8);
        lCtx.bezierCurveTo(-28, -20, -18, -32, 0, -44);
      } else if (conf.type === 'scarlet') {
        // Japanese Maple Star/Fan
        lCtx.moveTo(0, -46);
        lCtx.lineTo(12, -22); lCtx.lineTo(38, -20); lCtx.lineTo(18, -4);
        lCtx.lineTo(32, 18); lCtx.lineTo(10, 14); lCtx.lineTo(0, 40);
        lCtx.lineTo(-10, 14); lCtx.lineTo(-32, 18); lCtx.lineTo(-18, -4);
        lCtx.lineTo(-38, -20); lCtx.lineTo(-12, -22);
      } else {
        // Birch teardrop / ovate
        lCtx.moveTo(0, -45);
        lCtx.bezierCurveTo(24, -25, 32, 8, 18, 30);
        lCtx.bezierCurveTo(10, 38, 2, 42, 0, 45);
        lCtx.bezierCurveTo(-2, 42, -10, 38, -18, 30);
        lCtx.bezierCurveTo(-32, 8, -24, -25, 0, -45);
      }

      lCtx.closePath();
      lCtx.fill();
      lCtx.stroke();

      // Veins
      lCtx.beginPath();
      lCtx.strokeStyle = 'rgba(255, 230, 180, 0.45)';
      lCtx.lineWidth = 1.2;
      lCtx.moveTo(0, 42);
      lCtx.lineTo(0, -36);
      lCtx.moveTo(0, 15); lCtx.lineTo(18, 0);
      lCtx.moveTo(0, 15); lCtx.lineTo(-18, 0);
      lCtx.moveTo(0, -8); lCtx.lineTo(16, -20);
      lCtx.moveTo(0, -8); lCtx.lineTo(-16, -20);
      lCtx.stroke();

      lCtx.restore();
    }

    this.leafTexture = new THREE.CanvasTexture(leafCanvas);
    this.leafTexture.colorSpace = THREE.SRGBColorSpace;

    // Leaf Instanced Mesh (Double-sided plane)
    const leafGeom = new THREE.PlaneGeometry(0.38, 0.38);
    const leafMat = new THREE.MeshStandardMaterial({
      map: this.leafTexture,
      transparent: true,
      alphaTest: 0.15,
      roughness: 0.8,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    this.leafMesh = new THREE.InstancedMesh(leafGeom, leafMat, MAX_LEAVES);
    this.leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.leafMesh.frustumCulled = false;
    this.group.add(this.leafMesh);

    // Initialize Leaves Pool in a cylinder around the player
    for (let i = 0; i < MAX_LEAVES; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 4 + Math.random() * 45;
      this.leafData.push({
        x: Math.cos(ang) * rad,
        y: 1.5 + Math.random() * 26,
        z: Math.sin(ang) * rad,
        vx: 0, vy: 0, vz: 0,
        rotX: Math.random() * Math.PI * 2,
        rotY: Math.random() * Math.PI * 2,
        rotZ: Math.random() * Math.PI * 2,
        rotSpeedX: (Math.random() - 0.5) * 3.5,
        rotSpeedY: (Math.random() - 0.5) * 3.5,
        rotSpeedZ: (Math.random() - 0.5) * 3.5,
        scale: 0.75 + Math.random() * 0.7,
        type: Math.floor(Math.random() * 4),
        phase: Math.random() * Math.PI * 2,
      });
    }

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
    leafDensity = 1
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
    // 3. UPDATE AUTUMN LEAVES (3D Flutter, Tumbling & Car Wake)
    // ----------------------------------------------------
    this.leafMesh.visible = !inTunnel && w.autumn > 0.08 && quality > 0 && leafDensity > .01;
    if (this.leafMesh.visible) {
      const activeLeaves = Math.floor(MAX_LEAVES * quality * w.autumn * leafDensity);

      for (let i = 0; i < MAX_LEAVES; i++) {
        if (i >= activeLeaves) {
          this.leafDummy.position.set(0, -9999, 0);
          this.leafDummy.updateMatrix();
          this.leafMesh.setMatrixAt(i, this.leafDummy.matrix);
          continue;
        }

        const l = this.leafData[i];
        l.phase += dt * (1.8 + l.scale);

        // Natural flutter and wind acceleration
        const flutterX = Math.sin(l.phase * 1.5) * 1.8 + windX * 1.4;
        const flutterZ = Math.cos(l.phase * 1.2) * 1.5 + windZ * 1.2;
        const fallRate = 1.4 * (0.8 + l.scale * 0.4);

        // Vehicle Wake Displacement: If car passes near this leaf, push it outward and lift it!
        const distToCar = Math.hypot(l.x, l.z);
        if (distToCar < 6.8 && Math.abs(carSpeed) > 3.0) {
          const wakeFactor = (1.0 - distToCar / 6.8) * Math.min(Math.abs(carSpeed) * 0.35, 12);
          const pushAngle = Math.atan2(l.x, l.z);
          l.vx += Math.sin(pushAngle) * wakeFactor * 1.8;
          l.vz += (Math.cos(pushAngle) * wakeFactor - Math.sign(carSpeed) * wakeFactor * 0.6);
          l.vy += wakeFactor * 0.8; // Lift into wake
          l.rotSpeedX += (Math.random() - 0.5) * wakeFactor * 3.0;
          l.rotSpeedY += (Math.random() - 0.5) * wakeFactor * 3.0;
        }

        // Apply velocities and air damping
        l.x += (flutterX + l.vx) * dt;
        l.y += (-fallRate + l.vy) * dt;
        l.z += (flutterZ + l.vz - carSpeed * 0.4) * dt;

        l.vx *= (1.0 - 2.5 * dt);
        l.vy *= (1.0 - 2.8 * dt);
        l.vz *= (1.0 - 2.5 * dt);

        // Tumbling rotation
        l.rotX += (l.rotSpeedX + Math.sin(l.phase) * 1.8) * dt;
        l.rotY += (l.rotSpeedY + Math.cos(l.phase * 0.8) * 1.5) * dt;
        l.rotZ += l.rotSpeedZ * dt;

        // Ground settling and recycling
        if (l.y < 0.15) {
          // Leaf reaches ground: linger briefly, then cycle back to canopy
          if (Math.random() < 0.04) {
            l.y = 18 + Math.random() * 12;
            const ang = Math.random() * Math.PI * 2;
            const r = 6 + Math.random() * 38;
            l.x = Math.cos(ang) * r;
            l.z = Math.sin(ang) * r;
            l.vx = l.vy = l.vz = 0;
          } else {
            l.y = 0.15; // resting near ground
          }
        }

        // Wrap around player radius
        if (l.x < -40) l.x += 80; if (l.x > 40) l.x -= 80;
        if (l.z < -40) l.z += 80; if (l.z > 40) l.z -= 80;

        // Set Instanced Transformation
        this.leafDummy.position.set(l.x, l.y, l.z);
        this.leafDummy.rotation.set(l.rotX, l.rotY, l.rotZ);
        this.leafDummy.scale.set(l.scale, l.scale, l.scale);
        this.leafDummy.updateMatrix();
        this.leafMesh.setMatrixAt(i, this.leafDummy.matrix);
      }

      this.leafMesh.instanceMatrix.needsUpdate = true;
    }

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
    this.leafMesh.geometry.dispose();
    (this.leafMesh.material as THREE.Material).dispose();
    this.leafTexture.dispose();
    this.sprayMesh.geometry.dispose();
    (this.sprayMesh.material as THREE.Material).dispose();
    this.sprayTexture.dispose();
    this.group.removeFromParent();
  }
}
