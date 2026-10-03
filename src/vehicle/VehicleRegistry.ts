import type { VehicleConfig } from './VehicleConfig.ts';
import { R34Config } from './definitions/R34.ts';
import { M4_GT3_EVO_Config } from './definitions/M4_GT3_EVO.ts';

export const VEHICLE_REGISTRY: Record<string, VehicleConfig> = {
  r34: R34Config,
  m4_gt3_evo: M4_GT3_EVO_Config,
};

export const DEFAULT_VEHICLE_ID = 'r34';

export function getAllVehicles(): VehicleConfig[] {
  return Object.values(VEHICLE_REGISTRY);
}

export function getVehicleConfig(id?: string): VehicleConfig {
  if (id && VEHICLE_REGISTRY[id]) {
    return VEHICLE_REGISTRY[id];
  }
  return VEHICLE_REGISTRY[DEFAULT_VEHICLE_ID];
}

export { R34Config } from './definitions/R34.ts';
export { M4_GT3_EVO_Config } from './definitions/M4_GT3_EVO.ts';
