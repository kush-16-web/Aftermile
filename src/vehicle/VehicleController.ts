import { Road } from '../road/Road.ts';
import { createVehicleConfig } from './VehicleConfig.ts';
import type { VehicleConfig } from './VehicleConfig.ts';
import { VehiclePhysics } from './VehiclePhysics.ts';
import { PlayerVehicleModel } from './PlayerVehicleModel.ts';
import type { Controls } from './VehicleInput.ts';
import type { VehicleAudioState, WheelAudioTelemetry } from '../audio/VehicleAudioControls.ts';

export class VehicleController {
  config: VehicleConfig;
  physics: VehiclePhysics;
  model: PlayerVehicleModel;

  private wheelsTelemetry: WheelAudioTelemetry[] = [
    { slipVelocity: 0, slipAngle: 0, slipRatio: 0, normalLoad: 0, surfaceType: 'asphalt' },
    { slipVelocity: 0, slipAngle: 0, slipRatio: 0, normalLoad: 0, surfaceType: 'asphalt' },
    { slipVelocity: 0, slipAngle: 0, slipRatio: 0, normalLoad: 0, surfaceType: 'asphalt' },
    { slipVelocity: 0, slipAngle: 0, slipRatio: 0, normalLoad: 0, surfaceType: 'asphalt' },
  ];

  private audioSnapshot: VehicleAudioState = {
    speed: 0,
    rpm: 0,
    load: 0,
    throttle: 0,
    brake: 0,
    gear: 1,
    shiftTimer: 0,
    isReversing: false,
    slip: 0,
    refueling: false,
    cameraMode: 0,
    wheels: this.wheelsTelemetry,
  };

  constructor(road: Road, definition?: VehicleConfig) {
    this.config = createVehicleConfig(definition);
    this.physics = new VehiclePhysics(road, this.config);
    this.model = new PlayerVehicleModel(this.config);
  }

  update(dt: number, input: Controls, fuel: boolean, damage: boolean) {
    this.physics.update(dt, input, 0, 0, fuel, damage);
  }

  render(alpha: number, origin: number, night: number) {
    const pose = this.physics.interpolate(alpha), p = this.physics.road.point(pose.s, pose.offset);
    this.model.group.position.set(p.x, pose.height, p.z + origin);
    this.model.group.rotation.set(0, -this.physics.road.heading(pose.s) - pose.heading, 0);
    this.model.animate(pose, this.physics.speed, Math.max(this.physics.brakeAmount, this.physics.input.handbrake), night);
    return pose;
  }

  audioState(cameraMode = 0, wet = 0, snow = 0): VehicleAudioState {
    const p = this.physics;
    const s = this.audioSnapshot;
    s.speed = p.speed;
    s.rpm = p.rpm;
    s.load = p.engineLoad;
    s.throttle = p.throttle;
    s.brake = p.brakeAmount;
    s.gear = p.gear;
    s.shiftTimer = p.shiftTimer;
    s.isReversing = p.isReversing;
    s.slip = p.slip;
    s.refueling = p.refueling;
    s.cameraMode = cameraMode;

    const station = p.road.station(p.s - 50);
    const isGasStation = Math.abs(p.s - station) < 65 && p.offset > 0;
    const region = p.road.region(p.s);

    for (let i = 0; i < 4; i++) {
      const wt = p.wheelsTelemetry[i];
      const target = this.wheelsTelemetry[i];
      target.slipVelocity = wt?.slipVelocity || 0;
      target.slipAngle = wt?.slipAngle || 0;
      target.slipRatio = wt?.slipRatio || 0;
      target.normalLoad = wt?.normalLoad || (this.config.mass * 9.81 * 0.25);

      const wheelLat = p.offset + (this.config.wheelPositions[i]?.[0] || 0);
      const isOffRoad = Math.abs(wheelLat) > 9.2 && !isGasStation;

      if (snow > 0.15) {
        target.surfaceType = 'snow';
      } else if (wet > 0.30) {
        target.surfaceType = 'wet_asphalt';
      } else if (isOffRoad) {
        if (region.biome === 'coast') target.surfaceType = 'gravel';
        else if (region.biome === 'country') target.surfaceType = 'dirt';
        else target.surfaceType = 'grass';
      } else {
        target.surfaceType = 'asphalt';
      }
    }

    return s;
  }
}

