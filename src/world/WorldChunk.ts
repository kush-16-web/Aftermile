import * as THREE from 'three';
import { CHUNK, Road } from '../road/Road.ts';
import { rng, smooth } from '../core/math.ts';
import { Materials } from './Materials.ts';
import { Batch } from './Batch.ts';

export class WorldChunk {
  group = new THREE.Group();
  owned: THREE.BufferGeometry[] = [];
  textures: THREE.Texture[] = [];
  ownedMaterials: THREE.Material[] = [];
  start: number;

  constructor(public index: number, public road: Road, public m: Materials, vegetation = 1) {
    this.start = index * CHUNK;
    const random = rng(index * 79 + road.seed), batch = new Batch();
    const p = (s: number, o: number, l = 0) => {
      const a = road.point(s, o, l);
      return new THREE.Vector3(a.x, a.y, a.z + this.start);
    };

    const at = (key: string, s: number, o: number, y: number, w: number, h: number, d: number, mat: THREE.Material, geo = m.box) => {
      const v = p(s, o, y);
      batch.add(key, geo, mat, v.x, v.y, v.z, w, h, d, -road.heading(s), -Math.atan(road.grade(s)), road.bank(s));
    };

    const mid = this.start + CHUNK * 0.5;
    const region = road.region(mid);
    const weights = road.weights(mid);
    const isCity = region.biome === 'city' || weights.city > 0.15;
    const isBridge = region.biome === 'bridge' || weights.bridge > 0.15;
    const isCoast = region.biome === 'coast' || weights.coast > 0.15;

    // 1. Road Asphalt Surface
    this.surface([-8, 8], m.asphalt, 0.025, true);

    // 2. Roadside Infrastructure according to Road Category
    if (isCity) {
      // CITY INFRASTRUCTURE: Elevated concrete curbs + wide pedestrian sidewalks
      this.surface([-8.2, -8.0], m.concrete, 0.14);
      this.surface([8.0, 8.2], m.concrete, 0.14);
      this.surface([-11.2, -8.2], m.concrete, 0.12);
      this.surface([8.2, 11.2], m.concrete, 0.12);
      // City lane markings & pedestrian crosswalks
      this.surface([-.08, .08], m.yellow, 0.055);
      this.surface([-7.72, -7.59], m.white, 0.056);
      this.surface([7.59, 7.72], m.white, 0.056);

      for (let s = this.start + 6; s < this.start + CHUNK; s += 12) {
        at('lane', s, -4, 0.058, 0.13, 0.016, 4.5, m.white);
        at('lane', s, 4, 0.058, 0.13, 0.016, 4.5, m.white);
      }
      for (let s = this.start + 36; s < this.start + CHUNK; s += 80) {
        for (let lane = -7.2; lane <= 7.2; lane += 1.2) {
          at('crosswalk', s, lane, 0.058, 0.55, 0.016, 3.2, m.white);
        }
      }
    } else {
      // HIGHWAY / RURAL / COAST / MOUNTAIN / BRIDGE INFRASTRUCTURE
      this.surface([-10, -8], m.concrete, 0);
      this.surface([8, 10], m.concrete, 0);
      this.surface([-.08, .08], m.yellow, 0.055);
      this.surface([-7.72, -7.59], m.white, 0.056);
      this.surface([7.59, 7.72], m.white, 0.056);

      for (let s = this.start + 5; s < this.start + CHUNK; s += 12) {
        at('lane', s, -4, 0.058, 0.13, 0.016, 4.5, m.white);
        at('lane', s, 4, 0.058, 0.13, 0.016, 4.5, m.white);
      }
    }

    // 3. Terrain Grid Mesh
    this.terrain();

    // 4. CONTINUOUS SMOOTH GUARDRAIL & MAJOR-BRIDGE PARAPET SYSTEM
    const guardrailStep = 3.2; // Smooth 3.2m curve interpolation step
    for (let s = this.start; s < this.start + CHUNK; s += guardrailStep) {
      const sNext = s + guardrailStep;
      const sMid = s + guardrailStep * 0.5;
      const tunnel = road.isTunnel(sMid);
      const bridge = road.isBridge(sMid);

      for (const side of [-1, 1] as const) {
        const active = road.hasGuardrail(sMid, side) && !tunnel && !isCity;
        if (!active) continue;

        if (bridge) {
          // =========================================================================
          // BELIEVABLE MAJOR-BRIDGE PARAPET: Low concrete base + dual tubular upper rail
          // =========================================================================
          const p1Concrete = p(s, side * 8.85, 0.28);
          const p2Concrete = p(sNext, side * 8.85, 0.28);
          // Continuous extruded concrete safety parapet base (height ~0.56m)
          batch.segment('bridge-parapet-base', m.cylinder, m.concrete, p1Concrete, p2Concrete, 0.32);

          // Dual tubular metal crash rails
          const p1RailLower = p(s, side * 8.82, 0.78);
          const p2RailLower = p(sNext, side * 8.82, 0.78);
          batch.segment('bridge-rail-lower', m.cylinder, m.metal, p1RailLower, p2RailLower, 0.075);

          const p1RailUpper = p(s, side * 8.82, 1.05);
          const p2RailUpper = p(sNext, side * 8.82, 1.05);
          batch.segment('bridge-rail-upper', m.cylinder, m.metal, p1RailUpper, p2RailUpper, 0.085);

          // Vertical support stanchions every 6.4m
          if (s % 6.4 < guardrailStep) {
            const pPostTop = p(s, side * 8.82, 1.05);
            const pPostBottom = p(s, side * 8.82, 0.0);
            batch.segment('bridge-stanchion', m.cylinder, m.metal, pPostTop, pPostBottom, 0.09);
          }
        } else {
          // =========================================================================
          // HIGHWAY W-BEAM GUARDRAIL: Seamless spline rail & adaptive terrain post
          // =========================================================================
          const p1 = p(s, side * 8.92, 0.68);
          const p2 = p(sNext, side * 8.92, 0.68);
          batch.segment('guardrail-beam', m.cylinder, m.metal, p1, p2, 0.11);

          if (s % 6.4 < guardrailStep) {
            const pPostTop = p(s, side * 9.04, 0.68);
            const terrainY = road.terrain(s, side * 9.04);
            const pPostBottom = p(s, side * 9.04, 0);
            pPostBottom.y = Math.min(pPostBottom.y, terrainY);
            batch.segment('guardrail-post', m.cylinder, m.metal, pPostTop, pPostBottom, 0.08);

            if (s % 12.8 < guardrailStep) {
              at('reflector', s, side * 8.84, 0.68, 0.08, 0.14, 0.08, side === 1 ? m.red : m.white);
            }
          }
        }
      }
    }

    // 5. COASTAL BRIDGE STRUCTURE (Thick Box-Girder Deck, Diamond Pylons & Fan Stay Cables)
    for (let s = this.start + 10; s < this.start + CHUNK; s += 20) {
      const bridge = road.isBridge(s), tunnel = road.isTunnel(s);
      if (bridge) {
        // Continuous Heavy Structural Box-Girder Deck (2.4m thickness, 19.6m width)
        at('bridge-box-deck', s, 0, -1.2, 19.6, 2.4, 20.1, m.concrete);

        // Heavy concrete piers extending into the sea bed (depth -22m)
        if (Math.floor(s / 20) % 4 === 0) {
          for (const side of [-1, 1]) {
            at('bridge-sea-pier', s, side * 6.5, -11.0, 3.2, 22.0, 4.2, m.concrete);
          }
        }

        // Diamond Cable-Stayed Suspension Towers & Ordered Fan Stay Cables (every 160m)
        if (Math.floor(s / 20) % 8 === 0) {
          for (const side of [-1, 1]) {
            // Elegant tapered diamond tower pylon (65m height above deck)
            at('pylon-base', s, side * 10.5, 30.0, 2.2, 62.0, 3.6, m.white);
            at('pylon-cap', s, side * 10.5, 61.5, 2.8, 2.0, 4.0, m.dark);
            at('pylon-beacon', s, side * 10.5, 62.8, 0.4, 0.4, 0.4, m.signalRed);

            // Deterministic stay cables radiating from upper tower saddle to deck gussets
            for (let cable = 1; cable <= 8; cable++) {
              const cableSaddleY = 58 - cable * 1.8;
              const deckDist = cable * 18.0;
              for (const sign of [-1, 1]) {
                const deckAttachment = p(s + sign * deckDist, side * 9.2, 0.4);
                const pylonSaddle = p(s, side * 10.5, cableSaddleY);
                batch.segment('bridge-stay-cables', m.cylinder, m.metal, pylonSaddle, deckAttachment, 0.055);
              }
            }
          }
          // Upper aerodynamic cross-portal strut
          at('pylon-cross-strut', s, 0, 48.0, 22.5, 1.8, 2.4, m.white);
        }
      }

      if (tunnel) {
        for (const side of [-1, 1]) at('tunnel-wall', s, side * 9.5, 3.6, 1, 7.2, 20.05, m.concrete);
        at('tunnel-roof', s, 0, 7.2, 20, 1, 20.05, m.concrete);
        for (const side of [-1, 1]) {
          at('tunnel-rib', s, side * 8.85, 3.8, 0.12, 7, 0.22, m.dark);
          at('tunnel-light', s, side * 7, 6.55, 0.16, 0.08, 6, m.light);
        }
      }
    }

    // 6. Street Lighting (Properly Grounded & Aligned on Bridge and Highway)
    if (isCity || isBridge || index % 2 === 0) {
      for (let s = this.start + 32; s < this.start + CHUNK; s += 80) {
        for (const side of [-1, 1]) {
          if (road.isTunnel(s)) continue;
          const poleOffset = side * (isBridge ? 9.8 : 10.5);
          at('lamp-pole', s, poleOffset, 4.1, 0.12, 8.2, 0.12, m.dark);
          at('lamp-arm', s, side * (isBridge ? 8.4 : 9.0), 8.15, 2.8, 0.1, 0.13, m.dark);
          at('lamp', s, side * (isBridge ? 7.3 : 7.7), 8.08, 0.8, 0.075, 0.28, m.light);
        }
      }
    }

    // 7. DISTANT COASTAL CITY SKYLINE (Visible across the bay ONLY when crossing the Bridge)
    if (isBridge) {
      // Create multi-layer skyline silhouettes across the bay (offset 380m to 850m across water)
      const skylineSide = -1; // Bay / Ocean side across the water
      const skylineSeed = rng(index * 131 + 47);
      const buildingsCount = 14;

      for (let b = 0; b < buildingsCount; b++) {
        const s = this.start + (b / buildingsCount) * CHUNK + skylineSeed() * 8.0;
        const dist = 380 + Math.pow(skylineSeed(), 1.4) * 450;
        const offset = skylineSide * dist;
        const pos = p(s, offset);
        pos.y = 6.8; // Ocean waterline level

        const buildingType = skylineSeed();
        let w = 24 + skylineSeed() * 32;
        let d = 22 + skylineSeed() * 28;
        let h = 35 + skylineSeed() * 65;

        if (buildingType > 0.82) {
          // Landmark Skyscraper (140m - 230m) with stepped crown & spire
          h = 135 + skylineSeed() * 95;
          w = 28 + skylineSeed() * 22;
          d = 26 + skylineSeed() * 20;

          batch.add('skyline-tower', m.box, m.glass, pos.x, pos.y + h * 0.45, pos.z, w, h * 0.9, d);
          // Stepped upper crown
          batch.add('skyline-crown', m.box, m.concrete, pos.x, pos.y + h * 0.94, pos.z, w * 0.65, h * 0.12, d * 0.65);
          // Rooftop spire & beacon
          batch.add('skyline-spire', m.cylinder, m.metal, pos.x, pos.y + h + 12, pos.z, 0.8, 24.0, 0.8);
          batch.add('skyline-beacon', m.box, m.signalRed, pos.x, pos.y + h + 24, pos.z, 1.2, 1.2, 1.2);
        } else if (buildingType > 0.45) {
          // Mid-rise commercial / residential tower (60m - 120m)
          h = 60 + skylineSeed() * 60;
          batch.add('skyline-midrise', m.box, skylineSeed() > 0.5 ? m.concrete : m.glass, pos.x, pos.y + h * 0.5, pos.z, w, h, d);
          batch.add('skyline-roof-hvac', m.box, m.dark, pos.x, pos.y + h + 1.2, pos.z, w * 0.7, 2.4, d * 0.7);
        } else {
          // Low-rise waterfront docks / shipping warehouse (15m - 35m)
          h = 16 + skylineSeed() * 22;
          w = 38 + skylineSeed() * 45;
          d = 30 + skylineSeed() * 35;
          batch.add('skyline-warehouse', m.box, m.dark, pos.x, pos.y + h * 0.5, pos.z, w, h, d);
        }
      }
    }

    // 8. Biome-Specific Vegetation (Asset Slots: Pines, Oaks, Coastal Flora)
    const isMountain = region.biome === 'country' || region.biome === 'tunnel';
    const treeCount = Math.floor((isCity ? 12 : isMountain ? 80 : 65) * vegetation);
    for (let i = 0; i < treeCount; i++) {
      const s = this.start + random() * CHUNK, side = random() > 0.5 ? 1 : -1;
      const offset = side * (18 + Math.pow(random(), 1.55) * 210);
      const w = road.weights(s);
      if (road.isBridge(s) || road.isTunnel(s)) continue;
      const pos = p(s, offset);
      pos.y = road.terrain(s, offset);
      if (pos.y < 8 || (offset < 0 && w.coast > 0.25) || random() < w.city * 0.8) continue;

      const scale = 0.8 + random() * 0.7;
      const isPine = isMountain ? random() > 0.15 : isCoast ? random() > 0.75 : random() > 0.5;
      const height = (isPine ? 7.5 : 5.5) + random() * 8.5;

      batch.add('trunk', m.cylinder, m.bark, pos.x, pos.y + height * 0.38, pos.z, 0.22 * scale, height * 0.76, 0.22 * scale);
      if (isPine) {
        for (let layer = 0; layer < 4; layer++) {
          batch.add('pine', m.cone, m.pine, pos.x, pos.y + height * (0.42 + layer * 0.17), pos.z, (3.6 - layer * 0.75) * scale, height * 0.55, (3.6 - layer * 0.75) * scale);
        }
      } else {
        const leafMat = m.leaf;
        for (let crown = 0; crown < 4; crown++) {
          const cx = pos.x + (crown % 2 === 0 ? -1 : 1) * 1.2 * scale;
          const cy = pos.y + height * (0.65 + crown * 0.11);
          const cz = pos.z + (crown > 1 ? -1 : 1) * 1.1 * scale;
          batch.add('leaf', m.leafShape, leafMat, cx, cy, cz, (3.2 - crown * 0.4) * scale, height * 0.28, (2.9 - crown * 0.3) * scale, random() * 6);
        }
      }
    }

    // 9. Coastal Boulders & Rock Formations
    const rockCount = isCoast ? 24 : isMountain ? 18 : 6;
    for (let i = 0; i < rockCount; i++) {
      const s = this.start + random() * CHUNK, o = (random() > 0.5 ? 1 : -1) * (28 + random() * 240), v = p(s, o);
      v.y = road.terrain(s, o);
      if (v.y < 8) continue;
      const sz = 1.4 + random() * 5.0;
      batch.add('rocks', m.sphere, m.rock, v.x, v.y, v.z, sz * 1.6, sz * 0.65, sz, random() * 6);
    }

    // 10. City Architecture (Close-Range Inner City blocks)
    if (isCity) {
      for (let i = 0; i < 20; i++) {
        const s = this.start + random() * CHUNK, o = (random() > 0.5 ? 1 : -1) * (28 + random() * 210), v = p(s, o);
        const w = 9 + random() * 18, d = 9 + random() * 16, h = 12 + Math.pow(random(), 1.5) * 95;
        v.y = road.terrain(s, o);
        batch.add('buildings', m.box, random() > 0.6 ? m.glass : m.concrete, v.x, v.y + h * 0.5, v.z, w, h, d);
        batch.add('roof', m.box, m.dark, v.x, v.y + h + 0.3, v.z, w * 0.98, 0.6, d * 0.98);
        for (let floor = 0; floor < Math.min(18, Math.floor(h / 4)); floor++) {
          if (random() < 0.2) continue;
          for (const face of [-1, 1]) batch.add('windows', m.box, m.glass, v.x, v.y + 3 + floor * 4, v.z + face * (d * 0.5 + 0.02), w * 0.78, 1.3, 0.04);
        }
      }
    }

    // 11. Meaningful Route Navigation & Distance Signs
    if (index % 4 === 2) {
      const s = this.start + 70;
      const nextRegion = road.region(s + 850);
      for (const side of [-1, 1]) at('gantry-post', s, side * 10, 5, 0.25, 10, 0.25, m.metal);
      at('gantry-beam', s, 0, 9.6, 20, 0.22, 0.22, m.metal);
      const signText = `${nextRegion.name.toUpperCase()}  ${Math.round((s + 850) / 1000)} KM`;
      this.sign(signText, p(s, 0, 8.5), 9, 1.5, -road.heading(s));
    }

    // Curve Warning & Speed Limit Signs
    if (index % 3 === 1) {
      const s = this.start + 45;
      const isCurvy = Math.abs(road.bank(s)) > 0.03;
      const signText = isCurvy ? '◄ SHARP BEND  80 KM/H' : (isCity ? 'SPEED LIMIT 50' : 'SPEED LIMIT 100');
      const offset = 9.2;
      const roadElevation = road.height(s) + offset * road.bank(s);
      const groundElevation = road.terrain(s, offset);
      const baseGround = Math.min(roadElevation, groundElevation);
      const signCenterY = roadElevation + 2.3;
      const postHeight = (signCenterY - baseGround) + 0.8;
      const postCenterY = baseGround + postHeight * 0.5;
      at('sign-post', s, offset, postCenterY - roadElevation, 0.1, postHeight, 0.1, m.metal);
      this.sign(signText, p(s, offset, 2.3), 3.0, 0.9, -road.heading(s), false);
    }

    // 12. AFTERMILE Roadside Service Station Plaza ("HORIZON FUEL & REST")
    const station = road.station(this.start - 55);
    if (station >= this.start && station < this.start + CHUNK) {
      this.patch(station - 70, station + 70, 8, 44, m.asphalt);
      this.patch(station - 60, station + 60, 10, 42, m.concrete);

      at('station-building', station + 28, 30, 3.0, 20, 6.0, 12, m.concrete);
      at('station-shop-glass', station + 21.9, 30, 2.8, 17, 4.2, 0.12, m.glass);
      at('station-store-door', station + 21.85, 25, 1.6, 2.2, 3.2, 0.14, m.dark);
      at('hvac-unit-1', station + 28, 28, 6.4, 2.8, 1.1, 2.4, m.metal);
      at('hvac-unit-2', station + 33, 32, 6.4, 3.2, 1.2, 2.6, m.metal);

      at('station-canopy', station, 22, 5.2, 22, 0.55, 26, m.white);
      at('station-canopy-lights', station, 22, 4.9, 18, 0.05, 22, m.light);
      at('station-band', station - 11.1, 22, 5.2, 22, 0.6, 0.15, m.cyan);

      for (const s of [station - 8, station + 8]) {
        for (const o of [15, 29]) {
          at('station-column', s, o, 2.5, 0.28, 5.0, 0.28, m.metal);
          at('bollard-1', s - 1.2, o, 0.5, 0.15, 1.0, 0.15, m.yellow);
          at('bollard-2', s + 1.2, o, 0.5, 0.15, 1.0, 0.15, m.yellow);
          at('pump-island', s, o, 0.1, 1.4, 0.2, 3.2, m.concrete);
          at('pump', s, o, 1.1, 0.75, 2.0, 0.65, m.white);
          at('pump-screen', s - 0.38, o, 1.45, 0.5, 0.45, 0.02, m.cyan);
        }
      }

      at('air-water-tower', station - 32, 15, 1.1, 0.8, 2.2, 0.8, m.cyan);
      at('trash-bin-1', station - 4, 15, 0.6, 0.6, 1.2, 0.6, m.dark);
      at('trash-bin-2', station + 4, 29, 0.6, 0.6, 1.2, 0.6, m.dark);

      at('station-signpost', station - 45, 12, 4.5, 0.35, 9.0, 0.35, m.metal);
      this.sign('HORIZON / FUEL & REST\nREG 1.48  PREM 1.72', p(station - 45, 12, 8.2), 7.5, 2.2, -road.heading(station), true);
      this.sign('HORIZON REST & CAFE', p(station + 21.8, 30, 5.2), 8.5, 0.65, -road.heading(station), true);

      for (const side of [13.5, 30.5]) at('fuel-zone', station, side, 0.08, 0.08, 0.03, 36, m.cyan);
    }

    batch.build(this.group);
    this.group.traverse(o => {
      if (o instanceof THREE.InstancedMesh && o.geometry === m.grassShape) o.castShadow = false;
    });
  }

  surface(offsets: number[], material: THREE.Material, lift = 0, uv = false) {
    this.grid(this.start, this.start + CHUNK, offsets, material, (_s, o) => this.road.height(_s) + o * this.road.bank(_s) + lift, false, uv);
  }

  patch(s0: number, s1: number, o0: number, o1: number, material: THREE.Material) {
    this.grid(s0, s1, [o0, o1], material, (s, o) => this.road.height(s) + o * this.road.bank(s) - 0.015);
  }

  terrain() {
    this.grid(this.start, this.start + CHUNK, [-1200, -800, -500, -320, -200, -130, -85, -55, -35, -22, -15, -10, -8, 0, 8, 10, 15, 22, 35, 55, 85, 130, 200, 320, 500, 800, 1200], this.m.terrain, (s, o) => this.road.terrain(s, o), true);
  }

  grid(s0: number, s1: number, offsets: number[], material: THREE.Material, height: (s: number, o: number) => number, colored = false, uv = false) {
    const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [], rows = Math.ceil((s1 - s0) / 8), n = offsets.length;
    const grass = new THREE.Color(0x627058), sand = new THREE.Color(0xb8aa88), hill = new THREE.Color(0x767d64), city = new THREE.Color(0x72756d);

    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i < n; i++) {
        const s = s0 + (s1 - s0) * j / rows, o = offsets[i], p = this.road.point(s, o);
        positions.push(p.x, height(s, o), p.z + this.start);
        uvs.push(i / (n - 1), j / rows);

        if (colored) {
          const weights = this.road.weights(s), c = grass.clone().lerp(hill, smooth((Math.abs(o) - 25) / 200));
          c.lerp(sand, Math.max(weights.coast * 0.78, weights.bridge * 0.75)).lerp(city, weights.city * 0.7);
          c.multiplyScalar(0.94 + 0.07 * Math.sin(s * 0.045 + o * 0.08));
          colors.push(c.r, c.g, c.b);
        }
        if (j < rows && i < n - 1) {
          const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    if (colored) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    this.owned.push(geo);

    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  sign(text: string, pos: THREE.Vector3, width: number, height: number, angle: number, neon = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = neon ? '#101720' : '#1b3a36';
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = neon ? '#38bdf8' : '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 500, 84);
    ctx.font = '600 32px sans-serif';
    ctx.fillStyle = neon ? '#f0f9ff' : '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), 256, 50, 480);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(texture);

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      emissiveIntensity: neon ? 0.65 : 0.18,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    this.ownedMaterials.push(material);

    const geo = new THREE.PlaneGeometry(width, height);
    this.owned.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(pos);
    mesh.rotation.y = angle;
    this.group.add(mesh);
  }

  dispose() {
    this.group.traverse(o => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.owned.forEach(g => g.dispose());
    this.textures.forEach(t => t.dispose());
    this.ownedMaterials.forEach(m => m.dispose());
    this.group.removeFromParent();
    this.group.clear();
  }
}
