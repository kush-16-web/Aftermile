import test from 'node:test';
import assert from 'node:assert/strict';
import { Road, REGION_LENGTH } from '../src/road/Road.ts';
import { VehiclePhysics, emptyControls } from '../src/vehicle/VehiclePhysics.ts';

test('road regions stay continuous and repeat with a deterministic seed', () => {
  const a = new Road(1616), b = new Road(1616);
  for (let s = 0; s < REGION_LENGTH * 3; s += 37) {
    assert.equal(a.region(s).biome, b.region(s).biome);
    assert.ok(Number.isFinite(a.center(s)) && Number.isFinite(a.height(s)));
    assert.ok(Math.abs(a.center(s + 1) - a.center(s)) < 2);
  }
});

test('vehicle simulation remains finite over a long relaxed drive', () => {
  const car = new VehiclePhysics(new Road(1616));
  const controls = emptyControls(); controls.throttle = true;
  for (let i = 0; i < 60 * 180; i++) {
    car.update(1 / 60, controls, 0, 0, true, false);
    assert.ok([car.s, car.offset, car.speed, car.heading, car.fuel].every(Number.isFinite));
    assert.ok(car.s >= 0 && car.fuel >= 0 && car.fuel <= 100);
  }
  assert.ok(car.s > 1000, `expected meaningful travel distance, got ${car.s}`);
});

test('weather and road geometry do not create invalid chunk positions', () => {
  const road = new Road(42);
  for (let s = 0; s < 10000; s += 83) for (const offset of [-40, -8, 0, 8, 40]) {
    const p = road.point(s, offset); assert.ok(Object.values(p).every(Number.isFinite));
    assert.ok(Number.isFinite(road.terrain(s, offset)));
  }
});
