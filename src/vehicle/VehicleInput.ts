import { damp, lerp, clamp } from '../core/math.ts';
import type { VehicleConfig } from './VehicleConfig.ts';

export interface Controls { throttle: boolean; brake: boolean; left: boolean; right: boolean; handbrake: boolean; refuel: boolean }
export const emptyControls = (): Controls => ({ throttle:false, brake:false, left:false, right:false, handbrake:false, refuel:false });

/** Digital keys request control positions; none of them directly set velocity or yaw. */
export class VehicleInput {
  steering = 0; throttle = 0; brake = 0; handbrake = 0;
  update(dt: number, keys: Controls, speed: number, config: VehicleConfig) {
    const demand = Number(keys.right) - Number(keys.left);
    const highway = clamp(Math.abs(speed) / 35, 0, 1);
    const rise = lerp(config.steering.inputRate, config.steering.highwayInputRate, highway);
    // A continuous filter handles taps, held lock and reversals. Similar highway
    // rise/release time constants keep equal A/D corrections balanced. Snapping
    // across centre or unwinding one side faster introduces a heading bias.
    this.steering = damp(this.steering,demand,demand===0?config.steering.returnRate:rise,dt);
    if(demand===0&&Math.abs(this.steering)<1e-5)this.steering=0;
    this.throttle = damp(this.throttle, Number(keys.throttle), keys.throttle ? config.engine.throttleResponse : config.engine.throttleRelease, dt);
    this.brake = damp(this.brake, Number(keys.brake), 10, dt);
    this.handbrake = damp(this.handbrake, Number(keys.handbrake), 9, dt);
  }
  reset() { this.steering = this.throttle = this.brake = this.handbrake = 0; }
}
