import type { VehicleConfig } from './VehicleConfig.ts';

/** Signed road-wheel angle. The inner front wheel follows the tighter arc. */
export function wheelSteeringAngle(config: VehicleConfig, steering: number, index: number) {
  if (index >= 2 || Math.abs(steering) < 1e-7) return 0;
  const radius = config.wheelbase / Math.abs(Math.tan(steering));
  const inside = (steering > 0) === (index === 1);
  return Math.sign(steering) * Math.atan(config.wheelbase / (radius + (inside ? -1 : 1) * config.trackWidth / 2));
}
