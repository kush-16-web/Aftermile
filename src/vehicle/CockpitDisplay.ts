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

  // 1. Physical 3D Instrument Cluster
  private clusterGroup = new THREE.Group();
  private dialCanvas!: HTMLCanvasElement;
  private dialCtx!: CanvasRenderingContext2D;
  private dialTexture!: THREE.CanvasTexture;
  private dialMaterial!: THREE.MeshStandardMaterial;
  private dialBackplateMesh!: THREE.Mesh;

  // 3D Needles
  private speedoPivot = new THREE.Group();
  private speedoNeedleMaterial!: THREE.MeshStandardMaterial;
  private tachoPivot = new THREE.Group();
  private tachoNeedleMaterial!: THREE.MeshStandardMaterial;

  // Inset Center Digital LCD (Gear & Odo only)
  private lcdCanvas!: HTMLCanvasElement;
  private lcdCtx!: CanvasRenderingContext2D;
  private lcdTexture!: THREE.CanvasTexture;
  private lcdMaterial!: THREE.MeshBasicMaterial;
  private lcdMesh!: THREE.Mesh;

  // Protective Cluster Glass Lens
  private clusterLensMesh!: THREE.Mesh;

  // 2. Center Console MFD / GPS Screen
  private gpsCanvas!: HTMLCanvasElement;
  private gpsCtx!: CanvasRenderingContext2D;
  private gpsTexture!: THREE.CanvasTexture;
  private gpsMaterial!: THREE.MeshBasicMaterial;

  // 3. Functional Rear-View and Side Mirrors
  rearRenderTarget: THREE.WebGLRenderTarget | null = null;
  leftRenderTarget: THREE.WebGLRenderTarget | null = null;
  rightRenderTarget: THREE.WebGLRenderTarget | null = null;

  rearCamera = new THREE.PerspectiveCamera(52, 384 / 128, 0.15, 600);
  leftCamera = new THREE.PerspectiveCamera(56, 256 / 128, 0.15, 600);
  rightCamera = new THREE.PerspectiveCamera(56, 256 / 128, 0.15, 600);

  // Physical 3D Rear-View Mirror Assembly (Mount stalk + Beveled Housing + Inset Glass)
  private rearMirrorGroup = new THREE.Group();
  private rearMirrorGlassMesh!: THREE.Mesh;

  // Native Side Mirror Glass Meshes
  private leftMirrorMesh: THREE.Mesh | null = null;
  private rightMirrorMesh: THREE.Mesh | null = null;

  // Reusable Math Buffers for Zero-Allocation Loop
  private scratchRearOffset = new THREE.Vector3();
  private scratchRearReflect = new THREE.Vector3();
  private scratchLeftOffset = new THREE.Vector3();
  private scratchLeftReflect = new THREE.Vector3();
  private scratchRightOffset = new THREE.Vector3();
  private scratchRightReflect = new THREE.Vector3();
  private scratchVehicleUp = new THREE.Vector3();
  private scratchLookTarget = new THREE.Vector3();

  private smoothedSpeedKmh = 0;
  private smoothedRpm = 850;
  private updateTimer = 0;
  private lastDrawnGear = '';
  private lastDrawnSpeed = -1;
  private lastDrawnNight = -1;

  constructor(private config?: VehicleConfig) {
    this.group.name = 'CockpitInCarDisplays';
    // Hidden by default for external cameras, only enabled during Cockpit (FPP) camera mode
    this.group.visible = false;

    const isR34 = !config || config.id === 'r34';

    if (typeof document !== 'undefined' && isR34) {
      // =======================================================================
      // 1. PHYSICAL 3D INSTRUMENT CLUSTER SETUP
      // =======================================================================
      this.clusterGroup.name = 'R34_PhysicalCluster';
      // Placed inside the Japanese RHD instrument binnacle behind steering wheel
      this.clusterGroup.position.set(0.335, 0.865, -0.435);
      this.clusterGroup.rotation.set(-0.38, 0, 0); // Tilted ~22 deg upward toward driver eyes
      this.group.add(this.clusterGroup);

      // (a) Static Dial Face Backplate (1024x512 for crisp, authentic JDM typography)
      this.dialCanvas = document.createElement('canvas');
      this.dialCanvas.width = 1024;
      this.dialCanvas.height = 512;
      this.dialCtx = this.dialCanvas.getContext('2d')!;
      this.renderStaticDialFaces(this.dialCtx, 1024, 512, 0);

      this.dialTexture = new THREE.CanvasTexture(this.dialCanvas);
      this.dialTexture.colorSpace = THREE.SRGBColorSpace;
      this.dialTexture.anisotropy = 8;

      this.dialMaterial = new THREE.MeshStandardMaterial({
        map: this.dialTexture,
        roughness: 0.82,
        metalness: 0.05,
        side: THREE.FrontSide,
        depthWrite: true,
      });

      const dialGeo = new THREE.PlaneGeometry(0.255, 0.115);
      this.dialBackplateMesh = new THREE.Mesh(dialGeo, this.dialMaterial);
      this.dialBackplateMesh.position.set(0, 0, 0);
      this.clusterGroup.add(this.dialBackplateMesh);

      // (b) 3D Speedometer Needle (Left Dial: centered at local X = -0.056, Y = 0.002, Z = 0.004)
      this.speedoPivot.position.set(-0.056, 0.002, 0.004);
      this.speedoNeedleMaterial = new THREE.MeshStandardMaterial({
        color: 0xff3b20,
        emissive: 0xff2200,
        emissiveIntensity: 0.45,
        roughness: 0.3,
        metalness: 0.2,
      });

      // Needle pointer blade (tapered 3D blade)
      const needleBladeGeo = new THREE.BoxGeometry(0.0024, 0.038, 0.0016);
      needleBladeGeo.translate(0, 0.016, 0);
      const speedoBlade = new THREE.Mesh(needleBladeGeo, this.speedoNeedleMaterial);

      // Center pivot cap
      const capGeo = new THREE.CylinderGeometry(0.0055, 0.006, 0.003, 16);
      capGeo.rotateX(Math.PI / 2);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x11161b, roughness: 0.5, metalness: 0.6 });
      const speedoCap = new THREE.Mesh(capGeo, capMat);
      speedoCap.position.set(0, 0, 0.001);

      this.speedoPivot.add(speedoBlade, speedoCap);
      this.clusterGroup.add(this.speedoPivot);

      // (c) 3D Tachometer Needle (Right Dial: centered at local X = +0.056, Y = 0.002, Z = 0.004)
      this.tachoPivot.position.set(0.056, 0.002, 0.004);
      this.tachoNeedleMaterial = new THREE.MeshStandardMaterial({
        color: 0xff3b20,
        emissive: 0xff2200,
        emissiveIntensity: 0.45,
        roughness: 0.3,
        metalness: 0.2,
      });

      const tachoBlade = new THREE.Mesh(needleBladeGeo, this.tachoNeedleMaterial);
      const tachoCap = new THREE.Mesh(capGeo, capMat);
      tachoCap.position.set(0, 0, 0.001);

      this.tachoPivot.add(tachoBlade, tachoCap);
      this.clusterGroup.add(this.tachoPivot);

      // (d) Recessed Central Inset Digital LCD (Between dials: 128x128)
      this.lcdCanvas = document.createElement('canvas');
      this.lcdCanvas.width = 128;
      this.lcdCanvas.height = 128;
      this.lcdCtx = this.lcdCanvas.getContext('2d')!;
      this.lcdTexture = new THREE.CanvasTexture(this.lcdCanvas);
      this.lcdTexture.colorSpace = THREE.SRGBColorSpace;
      this.lcdTexture.anisotropy = 4;

      this.lcdMaterial = new THREE.MeshBasicMaterial({
        map: this.lcdTexture,
        toneMapped: true,
        side: THREE.FrontSide,
        depthWrite: true,
      });

      const lcdGeo = new THREE.PlaneGeometry(0.038, 0.038);
      this.lcdMesh = new THREE.Mesh(lcdGeo, this.lcdMaterial);
      this.lcdMesh.position.set(0, -0.012, 0.002);
      this.clusterGroup.add(this.lcdMesh);

      // (e) Protective Polycarbonate Cluster Lens
      const lensGeo = new THREE.PlaneGeometry(0.258, 0.118);
      const lensMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        opacity: 0.10,
        transparent: true,
        roughness: 0.12,
        metalness: 0.25,
        side: THREE.FrontSide,
        depthWrite: false,
      });
      this.clusterLensMesh = new THREE.Mesh(lensGeo, lensMat);
      this.clusterLensMesh.position.set(0, 0, 0.008);
      this.clusterGroup.add(this.clusterLensMesh);

      // =======================================================================
      // 2. CENTER CONSOLE MFD SCREEN (512x320)
      // =======================================================================
      this.gpsCanvas = document.createElement('canvas');
      this.gpsCanvas.width = 512;
      this.gpsCanvas.height = 320;
      this.gpsCtx = this.gpsCanvas.getContext('2d')!;
      this.gpsTexture = new THREE.CanvasTexture(this.gpsCanvas);
      this.gpsTexture.colorSpace = THREE.SRGBColorSpace;
      this.gpsTexture.anisotropy = 4;

      this.gpsMaterial = new THREE.MeshBasicMaterial({
        map: this.gpsTexture,
        toneMapped: true,
        side: THREE.DoubleSide,
      });

      // =======================================================================
      // 3. FUNCTIONAL REAR-VIEW & SIDE MIRRORS
      // =======================================================================
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

      // Build Physical 3D Rear-View Mirror Assembly (Windshield Header Mount)
      this.rearMirrorGroup.name = 'R34_PhysicalRearMirror';
      this.rearMirrorGroup.position.set(0.04, 1.18, -0.375);
      this.rearMirrorGroup.rotation.set(-0.08, 0.24, 0); // Angled down and toward RHD driver

      // 3D Mirror Casing (Beveled housing in dark matte automotive trim)
      const casingGeo = new THREE.BoxGeometry(0.185, 0.054, 0.014);
      const casingMat = new THREE.MeshStandardMaterial({
        color: 0x161b20,
        roughness: 0.72,
        metalness: 0.15,
      });
      const casingMesh = new THREE.Mesh(casingGeo, casingMat);
      casingMesh.position.set(0, 0, -0.007);

      // 3D Mounting Stalk (Attaches to windshield header)
      const stalkGeo = new THREE.CylinderGeometry(0.004, 0.005, 0.045, 12);
      stalkGeo.rotateX(0.5);
      const stalkMesh = new THREE.Mesh(stalkGeo, casingMat);
      stalkMesh.position.set(0, 0.024, 0.012);

      // Inset Reflective Glass
      const rearMirrorGeo = new THREE.PlaneGeometry(0.178, 0.048);
      // Flip UVs horizontally for optical mirror reflection
      const uvRear = rearMirrorGeo.attributes.uv;
      for (let i = 0; i < uvRear.count; i++) {
        uvRear.setX(i, 1.0 - uvRear.getX(i));
      }
      uvRear.needsUpdate = true;

      const rearMirrorMat = new THREE.MeshStandardMaterial({
        map: this.rearRenderTarget.texture,
        roughness: 0.04,
        metalness: 0.1,
        toneMapped: true,
        side: THREE.FrontSide,
        depthWrite: true,
      });
      this.rearMirrorGlassMesh = new THREE.Mesh(rearMirrorGeo, rearMirrorMat);
      this.rearMirrorGlassMesh.position.set(0, 0, 0.001);

      this.rearMirrorGroup.add(casingMesh, stalkMesh, this.rearMirrorGlassMesh);
      this.group.add(this.rearMirrorGroup);
    }
  }

  /**
   * Binds live GPS and Mirror render targets directly to native vehicle model geometry.
   * Completely eliminates artificial overlay planes.
   */
  public bindVehicleScene(scene: THREE.Object3D) {
    // 1. Native MFD Screen (Center console GPS display)
    const nativeMfd = scene.getObjectByName('Cockpit_MFD_Screen');
    if (nativeMfd && nativeMfd instanceof THREE.Mesh) {
      nativeMfd.material = this.gpsMaterial;
    }

    // 2. Native Right Mirror Glass (Driver side at +X = 0.812m, node named 'Cockpit_Mirror_Left' in GLB)
    const nativeRightMirror = scene.getObjectByName('Cockpit_Mirror_Left');
    if (nativeRightMirror && nativeRightMirror instanceof THREE.Mesh && this.rightRenderTarget) {
      nativeRightMirror.material = new THREE.MeshStandardMaterial({
        map: this.rightRenderTarget.texture,
        roughness: 0.04,
        metalness: 0.1,
        toneMapped: true,
        side: THREE.DoubleSide,
      });
      this.rightMirrorMesh = nativeRightMirror;
    }

    // 3. Native Left Mirror Glass (Passenger side at -X = -0.812m, node named 'Cockpit_Mirror_Right' in GLB)
    const nativeLeftMirror = scene.getObjectByName('Cockpit_Mirror_Right');
    if (nativeLeftMirror && nativeLeftMirror instanceof THREE.Mesh && this.leftRenderTarget) {
      nativeLeftMirror.material = new THREE.MeshStandardMaterial({
        map: this.leftRenderTarget.texture,
        roughness: 0.04,
        metalness: 0.1,
        toneMapped: true,
        side: THREE.DoubleSide,
      });
      this.leftMirrorMesh = nativeLeftMirror;
    }
  }

  public setCockpitActive(active: boolean) {
    this.group.visible = active;
  }

  update(telemetry: CockpitTelemetry, dt: number) {
    if (!this.dialCtx || !this.lcdCtx || !this.gpsCtx) return;

    const targetSpeedKmh = Math.abs(telemetry.speed) * 3.6;
    this.smoothedSpeedKmh += (targetSpeedKmh - this.smoothedSpeedKmh) * Math.min(1.0, dt * 24);
    this.smoothedRpm += (telemetry.rpm - this.smoothedRpm) * Math.min(1.0, dt * 26);

    // =========================================================================
    // 1. ROTATE PHYSICAL 3D NEEDLES
    // =========================================================================
    // Speedometer: 0 - 320 KM/H (260 deg sweep, 140 deg start to 400 deg)
    const speedRatio = Math.max(0, Math.min(1.0, this.smoothedSpeedKmh / 320));
    const speedAngle = -((140 + speedRatio * 260) * (Math.PI / 180));
    this.speedoPivot.rotation.z = speedAngle + Math.PI / 2;

    // Tachometer: 0 - 8000 RPM (260 deg sweep, 140 deg start to 400 deg)
    const rpmRatio = Math.max(0, Math.min(1.0, this.smoothedRpm / 8000));
    const rpmAngle = -((140 + rpmRatio * 260) * (Math.PI / 180));
    this.tachoPivot.rotation.z = rpmAngle + Math.PI / 2;

    // Needle Illumination at night
    const night = telemetry.night;
    const needleEmissive = 0.35 + night * 0.65;
    this.speedoNeedleMaterial.emissiveIntensity = needleEmissive;
    this.tachoNeedleMaterial.emissiveIntensity = needleEmissive;

    // Redraw static dial backlight if night level changed noticeably
    if (Math.abs(night - this.lastDrawnNight) > 0.08) {
      this.lastDrawnNight = night;
      this.renderStaticDialFaces(this.dialCtx, 1024, 512, night);
      this.dialTexture.needsUpdate = true;
    }

    // =========================================================================
    // 2. REFRESH INSET LCD & GPS DISPLAYS AT 30 HZ
    // =========================================================================
    this.updateTimer += dt;
    if (this.updateTimer >= 0.033) {
      this.updateTimer = 0;

      // Update Inset LCD only when values change
      const roundedSpeed = Math.round(this.smoothedSpeedKmh);
      if (roundedSpeed !== this.lastDrawnSpeed || telemetry.gear !== this.lastDrawnGear) {
        this.lastDrawnSpeed = roundedSpeed;
        this.lastDrawnGear = telemetry.gear;
        this.drawCentralLcd(telemetry, roundedSpeed);
        this.lcdTexture.needsUpdate = true;
      }

      // Update Center GPS screen
      this.drawGps(telemetry);
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

    // Derive stable vehicle up vector for natural mirror horizon on slopes, crests, and banked curves
    this.scratchVehicleUp.set(0, 1, 0).applyQuaternion(vehicleQuaternion);

    // 1. Rear-View Camera (Header center looking rearward down the road)
    this.scratchRearOffset.set(0.04, 1.18, -0.375).applyQuaternion(vehicleQuaternion);
    this.rearCamera.position.copy(vehiclePosition).add(this.scratchRearOffset);
    this.scratchRearReflect.set(0.02, -0.035, 0.999).applyQuaternion(vehicleQuaternion);
    this.rearCamera.up.copy(this.scratchVehicleUp);
    this.scratchLookTarget.copy(this.rearCamera.position).add(this.scratchRearReflect);
    this.rearCamera.lookAt(this.scratchLookTarget);

    // 2. Left Side Mirror Camera (Passenger side at -X = -0.865m, reflected toward left-rear lane)
    this.scratchLeftOffset.set(-0.865, 0.86, -0.38).applyQuaternion(vehicleQuaternion);
    this.leftCamera.position.copy(vehiclePosition).add(this.scratchLeftOffset);
    this.scratchLeftReflect.set(-0.32, -0.045, 0.946).applyQuaternion(vehicleQuaternion);
    this.leftCamera.up.copy(this.scratchVehicleUp);
    this.scratchLookTarget.copy(this.leftCamera.position).add(this.scratchLeftReflect);
    this.leftCamera.lookAt(this.scratchLookTarget);

    // 3. Right Side Mirror Camera (Driver side at +X = 0.865m, reflected toward right-rear lane)
    this.scratchRightOffset.set(0.865, 0.86, -0.38).applyQuaternion(vehicleQuaternion);
    this.rightCamera.position.copy(vehiclePosition).add(this.scratchRightOffset);
    this.scratchRightReflect.set(0.26, -0.045, 0.965).applyQuaternion(vehicleQuaternion);
    this.rightCamera.up.copy(this.scratchVehicleUp);
    this.scratchLookTarget.copy(this.rightCamera.position).add(this.scratchRightReflect);
    this.rightCamera.lookAt(this.scratchLookTarget);

    // Time-sliced mirror rendering for rock-solid 60-120 FPS performance:
    // 1 mirror render pass per frame in round-robin sequence
    const mirrorSlot = frameNumber % 3;
    if (mirrorSlot === 0) {
      renderer.setRenderTarget(this.rearRenderTarget);
      renderer.render(scene, this.rearCamera);
    } else if (mirrorSlot === 1) {
      renderer.setRenderTarget(this.leftRenderTarget);
      renderer.render(scene, this.leftCamera);
    } else {
      renderer.setRenderTarget(this.rightRenderTarget);
      renderer.render(scene, this.rightCamera);
    }

    // Reset render target and restore vehicle visibility
    renderer.setRenderTarget(null);
    vehicleGroup.visible = true;
    this.group.visible = true;
  }

  /**
   * Renders the authentic high-resolution JDM Nissan Skyline R34 gauge dial faces.
   */
  private renderStaticDialFaces(ctx: CanvasRenderingContext2D, w: number, h: number, night: number) {
    ctx.clearRect(0, 0, w, h);

    // Deep automotive textured gauge cluster backing
    ctx.fillStyle = night > 0.3 ? '#070b0e' : '#0c1015';
    ctx.fillRect(0, 0, w, h);

    // Subtle brushed carbon/dial plate texture
    ctx.fillStyle = night > 0.3 ? 'rgba(18, 26, 32, 0.4)' : 'rgba(28, 36, 44, 0.35)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 2);
    }

    // Dial Backlight glow color (warm amber/white automotive illumination at night)
    const numColor = night > 0.3 ? 'rgba(255, 235, 205, 0.95)' : 'rgba(240, 245, 250, 0.92)';
    const ringColor = night > 0.3 ? 'rgba(255, 185, 120, 0.35)' : 'rgba(255, 255, 255, 0.18)';

    // =========================================================================
    // LEFT DIAL: Analog Speedometer Face (0 - 320 KM/H, 260 deg sweep)
    // =========================================================================
    const spdCx = 270, spdCy = 256, spdRadius = 180;

    // Outer Speedo Ring
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(spdCx, spdCy, spdRadius, 140 * Math.PI / 180, 400 * Math.PI / 180);
    ctx.stroke();

    // Speedo Ticks & Numbers
    for (let k = 0; k <= 16; k++) {
      const val = k * 20;
      const deg = 140 + (k / 16) * 260;
      const rad = deg * (Math.PI / 180);
      const isMajor = k % 2 === 0;
      const rIn = isMajor ? spdRadius - 26 : spdRadius - 14;

      const x1 = spdCx + Math.cos(rad) * spdRadius;
      const y1 = spdCy + Math.sin(rad) * spdRadius;
      const x2 = spdCx + Math.cos(rad) * rIn;
      const y2 = spdCy + Math.sin(rad) * rIn;

      ctx.strokeStyle = isMajor ? numColor : 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = isMajor ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (isMajor) {
        const xNum = spdCx + Math.cos(rad) * (spdRadius - 48);
        const yNum = spdCy + Math.sin(rad) * (spdRadius - 48) + 6;
        ctx.fillStyle = numColor;
        ctx.font = '700 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(val), xNum, yNum);
      }
    }

    // Speedo Subtitle
    ctx.fillStyle = night > 0.3 ? '#dfb271' : '#88bec4';
    ctx.font = '700 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KM/H', spdCx, spdCy + 82);

    // =========================================================================
    // RIGHT DIAL: Analog Tachometer Face (0 - 8000 RPM, 260 deg sweep)
    // =========================================================================
    const tachoCx = 754, tachoCy = 256, tachoRadius = 180;

    // Outer Tacho Ring
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tachoCx, tachoCy, tachoRadius, 140 * Math.PI / 180, 400 * Math.PI / 180);
    ctx.stroke();

    // Redline Zone Arc (7000 - 8000 RPM)
    const redlineStart = (140 + (7000 / 8000) * 260) * (Math.PI / 180);
    const redlineEnd = 400 * (Math.PI / 180);
    ctx.strokeStyle = '#d74452';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(tachoCx, tachoCy, tachoRadius - 4, redlineStart, redlineEnd);
    ctx.stroke();

    // Tacho Ticks & Numbers
    for (let k = 0; k <= 16; k++) {
      const rpmVal = k * 500;
      const deg = 140 + (k / 16) * 260;
      const rad = deg * (Math.PI / 180);
      const isMajor = k % 2 === 0;
      const isRed = rpmVal >= 7000;
      const rIn = isMajor ? tachoRadius - 26 : tachoRadius - 14;

      const x1 = tachoCx + Math.cos(rad) * tachoRadius;
      const y1 = tachoCy + Math.sin(rad) * tachoRadius;
      const x2 = tachoCx + Math.cos(rad) * rIn;
      const y2 = tachoCy + Math.sin(rad) * rIn;

      ctx.strokeStyle = isRed ? '#d74452' : isMajor ? numColor : 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = isMajor ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (isMajor) {
        const num = rpmVal / 1000;
        const xNum = tachoCx + Math.cos(rad) * (tachoRadius - 48);
        const yNum = tachoCy + Math.sin(rad) * (tachoRadius - 48) + 6;
        ctx.fillStyle = isRed ? '#d74452' : numColor;
        ctx.font = '700 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(num), xNum, yNum);
      }
    }

    // Tacho Subtitle
    ctx.fillStyle = night > 0.3 ? 'rgba(223, 178, 113, 0.85)' : 'rgba(143, 162, 175, 0.85)';
    ctx.font = '700 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('x1000 r/min', tachoCx, tachoCy + 82);
  }

  /**
   * Renders the small recessed central LCD screen between the dials.
   */
  private drawCentralLcd(t: CockpitTelemetry, speedKmh: number) {
    const ctx = this.lcdCtx;
    const w = 128, h = 128;
    const night = t.night;

    ctx.clearRect(0, 0, w, h);

    // Inset LCD Matrix Background
    ctx.fillStyle = night > 0.3 ? '#050c12' : '#08141d';
    ctx.fillRect(0, 0, w, h);

    // Recessed Bezel Border
    ctx.strokeStyle = night > 0.3 ? '#dfb271' : '#4a6878';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Gear Indicator Box
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(t.gear, w / 2, 44);

    ctx.fillStyle = 'rgba(143, 162, 175, 0.85)';
    ctx.font = '700 10px sans-serif';
    ctx.fillText('GEAR', w / 2, 58);

    // Digital Speed (km/h)
    ctx.fillStyle = night > 0.3 ? '#dfb271' : '#7fe2dc';
    ctx.font = '700 20px monospace';
    ctx.fillText(`${speedKmh}`, w / 2, 86);

    ctx.fillStyle = 'rgba(143, 162, 175, 0.75)';
    ctx.font = '600 8.5px sans-serif';
    ctx.fillText('KM/H', w / 2, 98);

    // Odometer (km)
    ctx.fillStyle = '#d2dde3';
    ctx.font = '600 11px monospace';
    ctx.fillText(`${(t.distance / 1000).toFixed(1)} km`, w / 2, 118);
  }

  /**
   * Renders the authentic late-90s/early-2000s in-car MFD navigation screen.
   */
  private drawGps(t: CockpitTelemetry) {
    const ctx = this.gpsCtx;
    const w = 512, h = 320;
    const night = t.night;

    // Safe Inset Margin to stay strictly inside the physical R34 MFD bezel
    const padX = 26;
    const padTop = 18;
    const padBottom = 18;
    const innerW = w - padX * 2;
    const innerH = h - padTop - padBottom;

    ctx.clearRect(0, 0, w, h);

    // MFD Screen Background: deep high-contrast graphite/navy matrix
    ctx.fillStyle = night > 0.3 ? '#040b12' : '#081420';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(padX, padTop, innerW, innerH, 8);
    ctx.clip();

    // Top Navigation Maneuver Header
    const headerH = 68;
    ctx.fillStyle = night > 0.3 ? '#071828' : '#0c2238';
    ctx.fillRect(padX, padTop, innerW, headerH);
    ctx.strokeStyle = '#27e0d6';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(padX, padTop + headerH);
    ctx.lineTo(padX + innerW, padTop + headerH);
    ctx.stroke();

    const eventText = t.navEvent ? t.navEvent : 'HIGHWAY ROUTE';
    let maneuverSymbol = '↑';
    if (eventText.includes('RIGHT')) maneuverSymbol = '↱';
    else if (eventText.includes('LEFT')) maneuverSymbol = '↰';
    else if (eventText.includes('BRIDGE')) maneuverSymbol = '⚡';
    else if (eventText.includes('TUNNEL')) maneuverSymbol = '⏵';

    // Maneuver Icon Box
    ctx.fillStyle = '#0f324c';
    ctx.strokeStyle = '#27e0d6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(padX + 12, padTop + 8, 52, 52, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#27e0d6';
    ctx.font = '800 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(maneuverSymbol, padX + 38, padTop + 46);

    // Maneuver Action Text & Distance
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 20px sans-serif';
    ctx.fillText(eventText.toUpperCase(), padX + 74, padTop + 32);

    ctx.fillStyle = '#dfb271';
    ctx.font = '700 15px sans-serif';
    ctx.fillText(t.region.toUpperCase(), padX + 74, padTop + 54);

    // Live Route Trajectory Spline (Center Radar Minimap)
    if (t.navCurve && t.navCurve.length >= 3) {
      const pts = t.navCurve;
      ctx.save();
      const originX = w / 2;
      const originY = padTop + innerH - 46;
      ctx.translate(originX, originY);

      // Route Corridor Background Track
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 26;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const screenX = THREE.MathUtils.clamp(pt.x * 3.6, -145, 145);
        const screenY = -(pt.y / 350) * 145;
        if (i === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      }
      ctx.stroke();

      // Active Glowing Trajectory Path (High-Luminance Neon Cyan)
      ctx.strokeStyle = '#27e0d6';
      ctx.lineWidth = 8;
      ctx.shadowColor = '#27e0d6';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const screenX = THREE.MathUtils.clamp(pt.x * 3.6, -145, 145);
        const screenY = -(pt.y / 350) * 145;
        if (i === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Event Markers along path
      for (const pt of pts) {
        if (pt.marker) {
          const screenX = THREE.MathUtils.clamp(pt.x * 3.6, -145, 145);
          const screenY = -(pt.y / 350) * 145;
          ctx.fillStyle = '#dfb271';
          ctx.beginPath();
          ctx.arc(screenX, screenY, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.0;
          ctx.stroke();
        }
      }

      // Player Vehicle Chevron Indicator
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(-10, 6);
      ctx.lineTo(0, 1);
      ctx.lineTo(10, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#05121c';
      ctx.lineWidth = 2.0;
      ctx.stroke();

      ctx.restore();
    }

    // Bottom Navigation Footer (Inside Safe Area)
    const footerH = 34;
    const footerY = padTop + innerH - footerH;
    ctx.fillStyle = 'rgba(6, 18, 30, 0.95)';
    ctx.fillRect(padX, footerY, innerW, footerH);
    ctx.strokeStyle = 'rgba(39, 224, 214, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, footerY);
    ctx.lineTo(padX + innerW, footerY);
    ctx.stroke();

    ctx.fillStyle = '#27e0d6';
    ctx.font = '800 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LIVE GPS NAVIGATION', padX + 16, footerY + 22);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${(t.distance / 1000).toFixed(1)} KM`, padX + innerW - 16, footerY + 22);

    ctx.restore();
  }

  dispose() {
    this.dialTexture?.dispose();
    this.dialMaterial?.dispose();
    this.speedoNeedleMaterial?.dispose();
    this.tachoNeedleMaterial?.dispose();
    this.lcdTexture?.dispose();
    this.lcdMaterial?.dispose();
    this.gpsTexture?.dispose();
    this.gpsMaterial?.dispose();
    this.rearRenderTarget?.dispose();
    this.leftRenderTarget?.dispose();
    this.rightRenderTarget?.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}
