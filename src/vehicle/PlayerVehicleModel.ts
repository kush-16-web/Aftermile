import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { VehicleConfig } from './VehicleConfig.ts';
import type { VehiclePose } from './VehiclePhysics.ts';
import { VehicleLights } from './VehicleLights.ts';
import { wheelSteeringAngle } from './WheelKinematics.ts';
import { CockpitDisplay } from './CockpitDisplay.ts';
import type { CockpitTelemetry } from './CockpitDisplay.ts';

/** Parent-pivot rig: body suspension, wheel steer, authored camber, then axle spin. */
export class PlayerVehicleModel {
  group = new THREE.Group();
  surface = new THREE.Group();
  body = new THREE.Group();
  steer: THREE.Group[] = [];
  wheels: THREE.Object3D[] = [];
  mounts: THREE.Object3D[] = [];
  calipers: THREE.Object3D[] = [];
  lights: VehicleLights;
  cockpit: CockpitDisplay;
  ready = false;
  error = '';
  private pending: Promise<void> | null = null;
  private bodyAsset: THREE.Object3D | null = null;
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();

  constructor(public config: VehicleConfig) {
    this.group.name = config.name;
    this.surface.name = 'SurfaceAlignmentPivot';
    this.body.name = 'BodySuspensionPivot';
    this.group.add(this.surface);
    this.surface.add(this.body);
    this.lights = new VehicleLights(config);
    this.cockpit = new CockpitDisplay();

    for (const position of config.wheelPositions) {
      const pivot = new THREE.Group();
      pivot.position.fromArray(position);
      this.surface.add(pivot);
      this.steer.push(pivot);
    }
  }

  load(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.pending) return this.pending;
    this.error = '';
    this.pending = new GLTFLoader()
      .loadAsync(this.config.modelUrl)
      .then(asset => this.attach(asset.scene))
      .catch(error => {
        this.error = error instanceof Error ? error.message : `${this.config.name} could not load`;
        throw error;
      })
      .finally(() => (this.pending = null));
    return this.pending;
  }

  /** Parsing/image decode is separate from rigging for real-asset tests. */
  attach(scene: THREE.Group) {
    const body = scene.getObjectByName('Body');
    const mounts = [0, 1, 2, 3].map(i => scene.getObjectByName('WheelMount' + i));
    const wheels = [0, 1, 2, 3].map(i => scene.getObjectByName('Wheel' + i));
    if (!body || mounts.some(m => !m) || wheels.some(w => !w)) {
      throw new Error('Vehicle asset is missing its body or wheel rig.');
    }
    this.lights.bind(scene, this.config);
    scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true;
      o.receiveShadow = true;
      this.geometries.add(o.geometry);
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        this.materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) this.textures.add(value);
        }
        if (material.transparent) {
          material.depthWrite = false;
          o.castShadow = false;
        }
      }
    });

    this.bodyAsset = body;
    body.position.set(0, -this.config.centerOfGravity, 0);
    body.add(this.lights.group);
    body.add(this.cockpit.group);
    this.body.add(body);

    for (let i = 0; i < 4; i++) {
      const mount = mounts[i]!;
      mount.position.set(0, 0, 0);
      this.steer[i].add(mount);
      this.mounts[i] = mount;
      this.wheels[i] = wheels[i]!;
      const caliper = mount.getObjectByName('Caliper' + i);
      if (caliper) this.calipers[i] = caliper;
    }
    this.body.position.y = this.config.centerOfGravity;
    this.ready = true;
  }

  animate(pose: VehiclePose, speed: number, brake: number, night: number) {
    const cg = this.config.centerOfGravity;
    this.body.position.y = cg + pose.heave;
    if (this.bodyAsset) this.bodyAsset.position.y = -cg;

    this.surface.rotation.set(pose.surfacePitch, 0, pose.surfaceRoll, 'YXZ');
    this.body.rotation.set(pose.pitch, 0, pose.roll, 'YXZ');
    const cp = Math.cos(pose.surfacePitch),
      sp = Math.sin(pose.surfacePitch),
      sr = Math.sin(pose.surfaceRoll);
    const normalY = Math.max(0.2, cp * Math.cos(pose.surfaceRoll));

    for (let i = 0; i < 4; i++) {
      const [x, y, z] = this.config.wheelPositions[i];
      const planeHeight = x * sr * cp - z * sp;
      const travel = (pose.wheelHeights[i] - pose.height - planeHeight) / normalY;
      this.steer[i].position.y = y + THREE.MathUtils.clamp(travel, -this.config.suspension.travel, this.config.suspension.travel);
      this.steer[i].rotation.set(0, i < 2 ? -wheelSteeringAngle(this.config, pose.steering, i) : 0, 0);
      if (this.wheels[i]) this.wheels[i].rotation.x = pose.wheelSpins[i];
    }
    this.lights.update(night, brake, speed, this.config);
  }

  updateCockpit(telemetry: CockpitTelemetry, dt: number) {
    if (this.ready) {
      this.cockpit.update(telemetry, dt);
    }
  }

  renderMirrors(renderer: THREE.WebGLRenderer, scene: THREE.Scene, frameNumber: number) {
    if (this.ready) {
      this.cockpit.renderMirrors(renderer, scene, this.group, this.group.position, this.group.quaternion, frameNumber);
    }
  }

  dispose() {
    this.geometries.forEach(g => g.dispose());
    this.materials.forEach(m => m.dispose());
    this.textures.forEach(t => t.dispose());
    this.lights.dispose();
    this.cockpit.dispose();
    this.group.removeFromParent();
  }
}
