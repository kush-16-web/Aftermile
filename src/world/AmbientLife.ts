import * as THREE from 'three';
import { Road } from '../road/Road.ts';
import { Materials } from './Materials.ts';

export class AmbientLife {
  plane = new THREE.Group();
  train: THREE.Group[] = [];
  boats: THREE.Group[] = [];
  birds: THREE.Group[] = [];
  birdCallTimer = 0;
  onBirdNearby: (pan: number) => void = () => {};

  constructor(public scene: THREE.Scene, public road: Road, m: Materials) {
    const box = (group: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(m.box, material);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    // Distant passenger jet
    box(this.plane, 2.2, 2.3, 18, 0, 0, 0, m.white);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3, 12), m.white);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -10;
    this.plane.add(nose);
    for (const side of [-1, 1]) {
      const wing = box(this.plane, 11, 0.18, 3.5, side * 5, 0, 0, m.white);
      wing.rotation.y = side * 0.2;
      box(this.plane, 1, 1, 2.5, side * 4, -0.8, -0.7, m.dark);
      const tail = box(this.plane, 4, 0.15, 1.6, side * 2, 0, 7.5, m.white);
      tail.rotation.y = side * 0.2;
    }
    box(this.plane, 0.25, 3.5, 2, 0, 1.5, 7, m.red);
    scene.add(this.plane);

    // City commuter train
    for (let i = 0; i < 5; i++) {
      const car = new THREE.Group();
      box(car, 3, 2.5, 17, 0, 1.4, 0, m.white);
      box(car, 3.04, 0.7, 14, 0, 1.8, 0, m.glass);
      box(car, 3.06, 0.17, 16, 0, 0.65, 0, m.red);
      this.train.push(car);
      scene.add(car);
    }

    // Coastal boats
    for (let i = 0; i < 3; i++) {
      const boat = new THREE.Group();
      box(boat, 2, 0.65, 5, 0, 0, 0, i === 2 ? m.red : m.white);
      box(boat, 1.4, 0.8, 2, 0, 0.65, 0.2, m.glass);
      this.boats.push(boat);
      scene.add(boat);
    }

    // Note: Primitive box birds removed; ambient wildlife audio trigger preserved.
  }

  update(time: number, s: number, origin: number, isDay: boolean = true, isStorm: boolean = false) {
    const base = Math.floor(s / 1600) * 1600;

    // 1. High altitude airplane
    this.plane.position.set(
      this.road.center(s) + 380 - Math.sin(time * 0.015) * 600,
      140 + Math.sin(time * 0.008) * 45,
      -s + origin - 700 - Math.cos(time * 0.015) * 350
    );
    this.plane.rotation.y = Math.PI / 2 + time * 0.015;
    this.plane.rotation.z = -0.05;

    // 2. Commuter Train along city track
    for (let i = 0; i < this.train.length; i++) {
      const at = base + ((time * 22) % 1600) - i * 18;
      const region = this.road.region(at);
      const p = this.road.point(at, 27, 12.5);
      const car = this.train[i];
      car.visible = region.biome === 'city';
      car.position.set(p.x, p.y, p.z + origin);
      car.rotation.y = -this.road.heading(at);
    }

    // 3. Coastal boats on water
    const waterRegion = ['coast', 'bridge'].includes(this.road.region(s).biome);
    for (let i = 0; i < this.boats.length; i++) {
      const boat = this.boats[i];
      boat.visible = waterRegion;
      boat.position.set(
        this.road.center(s) - 130 - i * 150 + Math.sin(time * 0.02 + i) * 80,
        8 + Math.sin(time + i) * 0.25,
        -s + origin - 200 - i * 100 + Math.cos(time * 0.02 + i) * 140
      );
      boat.rotation.y = -time * 0.02 - i;
      boat.rotation.z = Math.sin(time * 1.3 + i) * 0.03;
    }

    // 4. Dynamic Bird Flock Flight Path & V-Formation
    const flockSpeed = 0.035;
    const flockCycle = (time * flockSpeed) % (Math.PI * 2);
    const flockCenterX = this.road.center(s) + Math.sin(flockCycle) * 220 + 30;
    const flockCenterY = 55 + Math.sin(time * 0.2) * 8;
    const flockCenterZ = -s + origin - 140 + Math.cos(flockCycle) * 160;

    const flockHeading = Math.atan2(-Math.sin(flockCycle), Math.cos(flockCycle)) + Math.PI / 2;
    const bankAngle = Math.sin(flockCycle) * 0.25;

    // Check proximity for wildlife audio
    const distToFlock = Math.hypot(flockCenterX - this.road.center(s), flockCenterZ - (-s + origin));
    if (distToFlock < 180 && this.birdCallTimer <= 0 && isDay && !isStorm) {
      const pan = (flockCenterX - this.road.center(s)) / 180;
      this.onBirdNearby(pan);
      this.birdCallTimer = 18.0 + Math.random() * 15.0; // Avoid repetitive chirping
    }
    if (this.birdCallTimer > 0) this.birdCallTimer -= 0.016;
  }
}
