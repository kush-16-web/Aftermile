import * as THREE from 'three';
import type { VehicleConfig } from './VehicleConfig.ts';

export interface CockpitTelemetry {
  speed: number; // m/s
  rpm: number;   // RPM
  gear: string;  // 'N', '1', '2', etc.
  distance: number; // m
  region: string;
  navCurve?: { x: number; y: number; marker?: string }[];
  navEvent?: string;
  night: number;
}

export class CockpitDisplay {
  group = new THREE.Group();
  private clusterCanvas!: HTMLCanvasElement;
  private clusterCtx!: CanvasRenderingContext2D;
  private clusterTexture!: THREE.CanvasTexture;
  private clusterMaterial!: THREE.MeshBasicMaterial;
  private clusterMesh!: THREE.Mesh;

  private gpsCanvas!: HTMLCanvasElement;
  private gpsCtx!: CanvasRenderingContext2D;
  private gpsTexture!: THREE.CanvasTexture;
  private gpsMaterial!: THREE.MeshBasicMaterial;
  private gpsMesh!: THREE.Mesh;

  // Functional Rear-View and Side Mirrors
  rearRenderTarget: THREE.WebGLRenderTarget | null = null;
  leftRenderTarget: THREE.WebGLRenderTarget | null = null;
  rightRenderTarget: THREE.WebGLRenderTarget | null = null;

  rearCamera = new THREE.PerspectiveCamera(52, 384 / 128, 0.15, 600);
  leftCamera = new THREE.PerspectiveCamera(58, 256 / 128, 0.15, 600);
  rightCamera = new THREE.PerspectiveCamera(58, 256 / 128, 0.15, 600);

  private rearMirrorMesh: THREE.Mesh | null = null;
  private leftMirrorMesh: THREE.Mesh | null = null;
  private rightMirrorMesh: THREE.Mesh | null = null;

  private smoothedSpeedKmh = 0;
  private smoothedRpm = 850;
  private updateTimer = 0;

  constructor(private config?: VehicleConfig) {
    this.group.name = 'CockpitInCarDisplays';
    // Hidden by default for external cameras, only enabled during Cockpit (FPP) camera mode
    this.group.visible = false;

    const isR34 = !config || config.id === 'r34';

    if (typeof document !== 'undefined' && isR34) {
      // 1. Driver Instrument Cluster Display (512x256)
      this.clusterCanvas = document.createElement('canvas');
      this.clusterCanvas.width = 512;
      this.clusterCanvas.height = 256;
      this.clusterCtx = this.clusterCanvas.getContext('2d')!;
      this.clusterTexture = new THREE.CanvasTexture(this.clusterCanvas);
      this.clusterTexture.colorSpace = THREE.SRGBColorSpace;
      this.clusterTexture.anisotropy = 4;


      this.clusterMaterial = new THREE.MeshBasicMaterial({
        map: this.clusterTexture,
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: true,
      });

      const clusterGeo = new THREE.PlaneGeometry(0.26, 0.12);
      this.clusterMesh = new THREE.Mesh(clusterGeo, this.clusterMaterial);
      // Positioned precisely inside the Japanese RHD instrument binnacle behind steering wheel
      this.clusterMesh.position.set(0.33, 0.865, -0.425);
      this.clusterMesh.rotation.set(-0.38, 0, 0); // Tilted ~22 deg upward toward driver eyes
      this.group.add(this.clusterMesh);

      // 2. Center Console MFD / GPS Screen (512x320)
      this.gpsCanvas = document.createElement('canvas');
      this.gpsCanvas.width = 512;
      this.gpsCanvas.height = 320;
      this.gpsCtx = this.gpsCanvas.getContext('2d')!;
      this.gpsTexture = new THREE.CanvasTexture(this.gpsCanvas);
      this.gpsTexture.colorSpace = THREE.SRGBColorSpace;
      this.gpsTexture.anisotropy = 4;

      this.gpsMaterial = new THREE.MeshBasicMaterial({
        map: this.gpsTexture,
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: true,
      });

      const gpsGeo = new THREE.PlaneGeometry(0.122, 0.088);
      this.gpsMesh = new THREE.Mesh(gpsGeo, this.gpsMaterial);
      // Positioned precisely inside the R34 center console dashboard MFD screen housing
      this.gpsMesh.position.set(0.045, 0.812, -0.545);
      this.gpsMesh.rotation.set(-0.35, 0.22, 0); // Tilted back and angled toward RHD driver
      this.group.add(this.gpsMesh);

      // 3. Functional Rear-View & Side Mirrors Setup
      this.rearRenderTarget = new THREE.WebGLRenderTarget(384, 128, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        colorSpace: THREE.SRGBColorSpace,
      });

      this.leftRenderTarget = new THREE.WebGLRenderTarget(256, 128, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        colorSpace: THREE.SRGBColorSpace,
      });

      this.rightRenderTarget = new THREE.WebGLRenderTarget(256, 128, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        colorSpace: THREE.SRGBColorSpace,
      });

      // Mirror Optical Flip (Mirror inversion: flip X on projection matrix)
      const flipMirrorProjection = (cam: THREE.PerspectiveCamera) => {
        cam.updateProjectionMatrix();
        cam.projectionMatrix.elements[0] *= -1;
      };
      flipMirrorProjection(this.rearCamera);
      flipMirrorProjection(this.leftCamera);
      flipMirrorProjection(this.rightCamera);

      // Rear-View Mirror Mesh (Mounted inside windshield header)
      const rearMirrorGeo = new THREE.PlaneGeometry(0.18, 0.052);
      const rearMirrorMat = new THREE.MeshBasicMaterial({
        map: this.rearRenderTarget.texture,
        side: THREE.FrontSide,
        depthWrite: true,
      });
      this.rearMirrorMesh = new THREE.Mesh(rearMirrorGeo, rearMirrorMat);
      this.rearMirrorMesh.position.set(0.04, 1.18, -0.375);
      this.rearMirrorMesh.rotation.set(-0.08, 0.24, 0); // Angled slightly down & toward RHD driver
      this.group.add(this.rearMirrorMesh);

      // Left Side Mirror Mesh (Passenger outer door mirror, -X side)
      const leftMirrorGeo = new THREE.PlaneGeometry(0.125, 0.072);
      const leftMirrorMat = new THREE.MeshBasicMaterial({
        map: this.leftRenderTarget.texture,
        side: THREE.FrontSide,
        depthWrite: true,
      });
      this.leftMirrorMesh = new THREE.Mesh(leftMirrorGeo, leftMirrorMat);
      this.leftMirrorMesh.position.set(-0.86, 0.81, -0.38);
      this.leftMirrorMesh.rotation.set(-0.04, -0.36, 0); // Angled inward to driver
      this.group.add(this.leftMirrorMesh);

      // Right Side Mirror Mesh (Driver outer door mirror, +X side)
      const rightMirrorGeo = new THREE.PlaneGeometry(0.125, 0.072);
      const rightMirrorMat = new THREE.MeshBasicMaterial({
        map: this.rightRenderTarget.texture,
        side: THREE.FrontSide,
        depthWrite: true,
      });
      this.rightMirrorMesh = new THREE.Mesh(rightMirrorGeo, rightMirrorMat);
      this.rightMirrorMesh.position.set(0.86, 0.81, -0.38);
      this.rightMirrorMesh.rotation.set(-0.04, 0.36, 0); // Angled inward to driver
      this.group.add(this.rightMirrorMesh);
    }
  }

  public setCockpitActive(active: boolean) {
    this.group.visible = active;
  }

  update(telemetry: CockpitTelemetry, dt: number) {
    if (!this.clusterCtx || !this.gpsCtx) return;
    this.updateTimer += dt;
    // Update canvas textures smoothly (30 Hz render loop is optimal for cockpit displays)
    const targetSpeedKmh = Math.abs(telemetry.speed) * 3.6;
    this.smoothedSpeedKmh += (targetSpeedKmh - this.smoothedSpeedKmh) * Math.min(1.0, dt * 20);
    this.smoothedRpm += (telemetry.rpm - this.smoothedRpm) * Math.min(1.0, dt * 22);

    if (this.updateTimer >= 0.033) {
      this.updateTimer = 0;
      this.drawCluster(telemetry);
      this.drawGps(telemetry);
      this.clusterTexture.needsUpdate = true;
      this.gpsTexture.needsUpdate = true;
    }
  }

  renderMirrors(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    vehicleGroup: THREE.Group,
    vehiclePosition: THREE.Vector3,
    vehicleQuaternion: THREE.Quaternion,
    frameNumber: number
  ) {
    if (!this.rearRenderTarget || !this.leftRenderTarget || !this.rightRenderTarget) return;

    // Hide entire vehicle group during mirror rendering so cabin/body geometry never clips or recurses
    vehicleGroup.visible = false;
    this.group.visible = false;

    // Update Mirror Cameras in World Space
    // 1. Rear-View Camera (Placed at rear window looking backward down the highway)
    const rearCamOffset = new THREE.Vector3(0.0, 1.18, 0.65).applyQuaternion(vehicleQuaternion);
    this.rearCamera.position.copy(vehiclePosition).add(rearCamOffset);
    const rearDir = new THREE.Vector3(0.0, -0.02, 1.0).applyQuaternion(vehicleQuaternion);
    this.rearCamera.lookAt(this.rearCamera.position.clone().add(rearDir));

    // 2. Left Side Mirror Camera (Passenger side, looking rear-left)
    const leftCamOffset = new THREE.Vector3(-0.90, 0.81, -0.38).applyQuaternion(vehicleQuaternion);
    this.leftCamera.position.copy(vehiclePosition).add(leftCamOffset);
    const leftDir = new THREE.Vector3(-0.20, -0.02, 1.0).applyQuaternion(vehicleQuaternion);
    this.leftCamera.lookAt(this.leftCamera.position.clone().add(leftDir));

    // 3. Right Side Mirror Camera (Driver side, looking rear-right)
    const rightCamOffset = new THREE.Vector3(0.90, 0.81, -0.38).applyQuaternion(vehicleQuaternion);
    this.rightCamera.position.copy(vehiclePosition).add(rightCamOffset);
    const rightDir = new THREE.Vector3(0.20, -0.02, 1.0).applyQuaternion(vehicleQuaternion);
    this.rightCamera.lookAt(this.rightCamera.position.clone().add(rightDir));

    // Time-sliced mirror rendering for peak browser performance:
    // Frame % 2 === 0: Render Rearview + Left Side Mirror
    // Frame % 2 === 1: Render Rearview + Right Side Mirror
    if (frameNumber % 2 === 0) {
      renderer.setRenderTarget(this.rearRenderTarget);
      renderer.render(scene, this.rearCamera);

      renderer.setRenderTarget(this.leftRenderTarget);
      renderer.render(scene, this.leftCamera);
    } else {
      renderer.setRenderTarget(this.rearRenderTarget);
      renderer.render(scene, this.rearCamera);

      renderer.setRenderTarget(this.rightRenderTarget);
      renderer.render(scene, this.rightCamera);
    }

    // Reset render target and restore vehicle visibility
    renderer.setRenderTarget(null);
    vehicleGroup.visible = true;
    this.group.visible = true;
  }

  private drawCluster(t: CockpitTelemetry) {
    const ctx = this.clusterCtx;
    const w = 512, h = 256;
    const night = t.night;

    ctx.clearRect(0, 0, w, h);

    // Instrument Housing Background
    ctx.fillStyle = night > 0.3 ? '#080d12' : '#0c141c';
    ctx.fillRect(0, 0, w, h);

    // =========================================================================
    // LEFT DIAL: Analog Speedometer (0 - 320 KM/H, 260 deg sweep)
    // =========================================================================
    const spdCx = 135, spdCy = 128, spdRadius = 90;
    const speedRatio = Math.max(0, Math.min(1.0, this.smoothedSpeedKmh / 320));
    const speedAngle = (140 + speedRatio * 260) * (Math.PI / 180);

    // Outer Speedo Ring
    ctx.strokeStyle = night > 0.3 ? 'rgba(136, 190, 196, 0.25)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(spdCx, spdCy, spdRadius, 140 * Math.PI / 180, 400 * Math.PI / 180);
    ctx.stroke();

    // Speedo Tick marks & numbers
    for (let k = 0; k <= 16; k++) {
      const val = k * 20;
      const deg = 140 + (k / 16) * 260;
      const rad = deg * (Math.PI / 180);
      const isMajor = k % 2 === 0;
      const rIn = isMajor ? spdRadius - 14 : spdRadius - 8;

      const x1 = spdCx + Math.cos(rad) * spdRadius;
      const y1 = spdCy + Math.sin(rad) * spdRadius;
      const x2 = spdCx + Math.cos(rad) * rIn;
      const y2 = spdCy + Math.sin(rad) * rIn;

      ctx.strokeStyle = isMajor ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (isMajor) {
        const xNum = spdCx + Math.cos(rad) * (spdRadius - 26);
        const yNum = spdCy + Math.sin(rad) * (spdRadius - 26) + 4;
        ctx.fillStyle = 'rgba(235, 245, 250, 0.9)';
        ctx.font = '600 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(val), xNum, yNum);
      }
    }

    // Speedo Units
    ctx.fillStyle = '#88bec4';
    ctx.font = '600 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KM/H', spdCx, spdCy + 44);

    // Speedo Rotating Needle
    ctx.strokeStyle = '#a5e6ee';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#88bec4';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(spdCx, spdCy);
    ctx.lineTo(spdCx + Math.cos(speedAngle) * (spdRadius - 8), spdCy + Math.sin(speedAngle) * (spdRadius - 8));
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Needle Center Cap
    ctx.fillStyle = '#08111a';
    ctx.beginPath();
    ctx.arc(spdCx, spdCy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#88bec4';
    ctx.lineWidth = 2;
    ctx.stroke();

    // =========================================================================
    // RIGHT DIAL: Analog Tachometer (0 - 8000 RPM, 260 deg sweep)
    // =========================================================================
    const tachoCx = 377, tachoCy = 128, tachoRadius = 90;
    const rpmRatio = Math.max(0, Math.min(1.0, this.smoothedRpm / 8000));
    const rpmAngle = (140 + rpmRatio * 260) * (Math.PI / 180);

    // Outer Tacho Ring
    ctx.strokeStyle = night > 0.3 ? 'rgba(136, 190, 196, 0.25)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tachoCx, tachoCy, tachoRadius, 140 * Math.PI / 180, 400 * Math.PI / 180);
    ctx.stroke();

    // Redline Zone Arc (7k - 8k)
    const redlineStartAngle = (140 + (7000 / 8000) * 260) * (Math.PI / 180);
    const redlineEndAngle = 400 * (Math.PI / 180);
    ctx.strokeStyle = '#d75c70';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(tachoCx, tachoCy, tachoRadius - 2, redlineStartAngle, redlineEndAngle);
    ctx.stroke();

    // Tacho Tick marks & numbers
    for (let k = 0; k <= 16; k++) {
      const rpmVal = k * 500;
      const deg = 140 + (k / 16) * 260;
      const rad = deg * (Math.PI / 180);
      const isMajor = k % 2 === 0;
      const isRed = rpmVal >= 7000;
      const rIn = isMajor ? tachoRadius - 14 : tachoRadius - 8;

      const x1 = tachoCx + Math.cos(rad) * tachoRadius;
      const y1 = tachoCy + Math.sin(rad) * tachoRadius;
      const x2 = tachoCx + Math.cos(rad) * rIn;
      const y2 = tachoCy + Math.sin(rad) * rIn;

      ctx.strokeStyle = isRed ? '#d75c70' : isMajor ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (isMajor) {
        const num = rpmVal / 1000;
        const xNum = tachoCx + Math.cos(rad) * (tachoRadius - 26);
        const yNum = tachoCy + Math.sin(rad) * (tachoRadius - 26) + 4;
        ctx.fillStyle = isRed ? '#d75c70' : 'rgba(235, 245, 250, 0.9)';
        ctx.font = '600 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(num), xNum, yNum);
      }
    }

    // Tacho Units
    ctx.fillStyle = 'rgba(143, 162, 175, 0.85)';
    ctx.font = '600 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('x1000 RPM', tachoCx, tachoCy + 44);

    // Tacho Rotating Needle
    ctx.strokeStyle = rpmValToRed(this.smoothedRpm);
    ctx.lineWidth = 3;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(tachoCx, tachoCy);
    ctx.lineTo(tachoCx + Math.cos(rpmAngle) * (tachoRadius - 8), tachoCy + Math.sin(rpmAngle) * (tachoRadius - 8));
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Tacho Needle Center Cap
    ctx.fillStyle = '#08111a';
    ctx.beginPath();
    ctx.arc(tachoCx, tachoCy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#88bec4';
    ctx.lineWidth = 2;
    ctx.stroke();

    function rpmValToRed(val: number) {
      return val >= 7000 ? '#d75c70' : '#a5e6ee';
    }

    // =========================================================================
    // CENTER DISPLAY: Digital Gear & Odometer Readouts
    // =========================================================================
    const midX = 256;
    // Gear Display Box
    ctx.fillStyle = 'rgba(10, 22, 34, 0.85)';
    ctx.strokeStyle = 'rgba(136, 190, 196, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(midX - 28, 64, 56, 68, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.gear, midX, 112);

    ctx.fillStyle = 'rgba(143, 162, 175, 0.8)';
    ctx.font = '600 9px sans-serif';
    ctx.fillText('GEAR', midX, 126);

    // Digital Speed & Trip Readouts below gear box
    ctx.fillStyle = '#88bec4';
    ctx.font = '700 18px sans-serif';
    ctx.fillText(`${Math.round(this.smoothedSpeedKmh)}`, midX, 158);
    ctx.fillStyle = 'rgba(143, 162, 175, 0.75)';
    ctx.font = '600 8.5px sans-serif';
    ctx.fillText('KM/H', midX, 168);

    ctx.fillStyle = '#e2ecf0';
    ctx.font = '500 11px sans-serif';
    ctx.fillText(`${(t.distance / 1000).toFixed(1)} km`, midX, 186);
  }

  private drawGps(t: CockpitTelemetry) {
    const ctx = this.gpsCtx;
    const w = 512, h = 320;
    const night = t.night;

    // Safe Margin Inset to stay strictly inside the physical R34 MFD bezel
    const padX = 44;
    const padTop = 22;
    const padBottom = 22;
    const innerW = w - padX * 2;
    const innerH = h - padTop - padBottom;

    ctx.clearRect(0, 0, w, h);

    // MFD Screen Background
    ctx.fillStyle = night > 0.3 ? '#070f17' : '#0b1622';
    ctx.fillRect(0, 0, w, h);

    // Safe Content Area Clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(padX, padTop, innerW, innerH);
    ctx.clip();

    // Top Navigation Header (Inside Safe Area)
    const headerH = 48;
    ctx.fillStyle = night > 0.3 ? '#0c1a27' : '#102234';
    ctx.fillRect(padX, padTop, innerW, headerH);
    ctx.strokeStyle = 'rgba(136, 190, 196, 0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padX, padTop + headerH);
    ctx.lineTo(padX + innerW, padTop + headerH);
    ctx.stroke();

    // Region Title (Top Line)
    ctx.fillStyle = 'rgba(143, 162, 175, 0.9)';
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t.region.toUpperCase(), padX + 16, padTop + 18);

    // Landmark / Upcoming Event (Second Line)
    const eventText = t.navEvent ? t.navEvent : 'HIGHWAY AHEAD';
    ctx.fillStyle = '#88bec4';
    ctx.font = '700 14px sans-serif';
    ctx.fillText(eventText, padX + 16, padTop + 38);

    // Live Route Trajectory Spline
    if (t.navCurve && t.navCurve.length >= 3) {
      const pts = t.navCurve;
      ctx.save();
      const originX = w / 2;
      const originY = padTop + innerH - 40;
      ctx.translate(originX, originY);

      // Route Corridor Background Track
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 20;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const screenX = THREE.MathUtils.clamp(pt.x * 3.4, -135, 135);
        const screenY = -(pt.y / 350) * 135;
        if (i === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      }
      ctx.stroke();

      // Active Glowing Trajectory Path (Cyan)
      ctx.strokeStyle = '#88bec4';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#88bec4';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const screenX = THREE.MathUtils.clamp(pt.x * 3.4, -135, 135);
        const screenY = -(pt.y / 350) * 135;
        if (i === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Event Markers along path
      for (const pt of pts) {
        if (pt.marker) {
          const screenX = THREE.MathUtils.clamp(pt.x * 3.4, -135, 135);
          const screenY = -(pt.y / 350) * 135;
          ctx.fillStyle = '#dfb271';
          ctx.beginPath();
          ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      // Player Vehicle Chevron Indicator
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(-7, 4);
      ctx.lineTo(7, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#08111a';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();
    }

    // Bottom Navigation Footer (Inside Safe Area)
    const footerH = 30;
    const footerY = padTop + innerH - footerH;
    ctx.fillStyle = 'rgba(10, 20, 30, 0.85)';
    ctx.fillRect(padX, footerY, innerW, footerH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, footerY);
    ctx.lineTo(padX + innerW, footerY);
    ctx.stroke();

    ctx.fillStyle = '#88bec4';
    ctx.font = '700 10.5px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('GPS LIVE', padX + 16, footerY + 19);

    ctx.fillStyle = 'rgba(143, 162, 175, 0.85)';
    ctx.font = '600 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('350m AHEAD', padX + innerW - 16, footerY + 19);

    ctx.restore();
  }

  dispose() {
    this.clusterTexture?.dispose();
    this.clusterMaterial?.dispose();
    this.gpsTexture?.dispose();
    this.gpsMaterial?.dispose();
    this.rearRenderTarget?.dispose();
    this.leftRenderTarget?.dispose();
    this.rightRenderTarget?.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}
