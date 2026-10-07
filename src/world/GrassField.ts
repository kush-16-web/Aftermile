import * as THREE from 'three';
import { Road } from '../road/Road.ts';
import { Materials } from './Materials.ts';

/**
 * Procedural 3-blade micro-tuft geometry.
 * Ultra-cheap (15 vertices, 9 triangles per instance), zero alpha discard.
 * Tapered blades fan outward 360 degrees and bend slightly at tips.
 */
function createBladeTuftGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const bladeCount = 3;
  let vOffset = 0;

  for (let b = 0; b < bladeCount; b++) {
    // 3 blades fanning outward at 120-degree intervals
    const angle = (b / bladeCount) * Math.PI * 2 + (b === 1 ? 0.15 : b === 2 ? -0.12 : 0.0);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Blade dimensions: ~0.52m height, ~0.064m tuft width
    const h = 0.52 + (b === 1 ? -0.06 : b === 2 ? 0.04 : 0.0);
    const baseW = 0.032;
    const midW = 0.022;
    const tipW = 0.005;
    const midH = h * 0.52;
    const sink = 0.04; // 4cm ground sink to prevent floating

    // Outward curvature along blade radial direction
    const midCurve = 0.045;
    const tipCurve = 0.12;

    // Local vertex coordinates
    // Bottom: 2 vertices (v0, v1)
    const p0x = -baseW * sinA;
    const p0z = baseW * cosA;
    const p1x = baseW * sinA;
    const p1z = -baseW * cosA;

    // Mid: 2 vertices (v2, v3)
    const midCx = midCurve * cosA;
    const midCz = midCurve * sinA;
    const p2x = midCx - midW * sinA;
    const p2z = midCz + midW * cosA;
    const p3x = midCx + midW * sinA;
    const p3z = midCz - midW * cosA;

    // Tip: 1 vertex (v4)
    const tipCx = tipCurve * cosA;
    const tipCz = tipCurve * sinA;

    // Soft hemispherical normal pointing upward and outward
    const nx = cosA * 0.55;
    const ny = 0.82;
    const nz = sinA * 0.55;

    // v0: bottom-left
    positions.push(p0x, -sink, p0z);
    normals.push(nx, ny, nz);
    uvs.push(0, 0);

    // v1: bottom-right
    positions.push(p1x, -sink, p1z);
    normals.push(nx, ny, nz);
    uvs.push(1, 0);

    // v2: mid-left
    positions.push(p2x, midH - sink, p2z);
    normals.push(nx, ny, nz);
    uvs.push(0, 0.52);

    // v3: mid-right
    positions.push(p3x, midH - sink, p3z);
    normals.push(nx, ny, nz);
    uvs.push(1, 0.52);

    // v4: tip
    positions.push(tipCx, h - sink, tipCz);
    normals.push(nx, ny, nz);
    uvs.push(0.5, 1.0);

    // Bottom quad: 2 triangles
    indices.push(vOffset, vOffset + 1, vOffset + 3);
    indices.push(vOffset, vOffset + 3, vOffset + 2);

    // Tip triangle: 1 triangle
    indices.push(vOffset + 2, vOffset + 3, vOffset + 4);

    vOffset += 5;
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  return geo;
}

/**
 * GPU Grass Material.
 * Pure procedural standard material with coherent vertex shader wind,
 * smooth distance height shrink fade, and PBR colors matching TerrainMaterial.
 */
export class GrassMaterial extends THREE.MeshStandardMaterial {
  uniforms = {
    uTime: { value: 0 },
    uWind: { value: 0.5 },
    uAutumn: { value: 0 },
    terrainOrigin: { value: 0 },
  };

  constructor() {
    super({
      roughness: 0.86,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);

      shader.vertexShader = `
        uniform float uTime, uWind, terrainOrigin;
        varying vec3 vWorldGrass;
        varying vec2 vGrassUv;
        varying float vGrassDist;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vGrassUv = uv;
        vec4 instP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          instP = instanceMatrix * instP;
        #endif
        vec4 wPos = modelMatrix * instP;
        vWorldGrass = wPos.xyz;
        vWorldGrass.z -= terrainOrigin;

        // View space camera distance (camera is always at origin in view space)
        vec4 vPos = modelViewMatrix * instP;
        vGrassDist = length(vPos.xz);

        // Coherent GPU Wind Waves
        float wTime = uTime * 2.2;
        float waveX = sin(wTime + wPos.x * 0.08 + (wPos.z - terrainOrigin) * 0.08);
        float waveZ = cos(wTime * 0.85 + wPos.x * 0.06 + (wPos.z - terrainOrigin) * 0.10);
        float flutter = sin(wTime * 4.8 + wPos.x * 0.28) * 0.25;
        float windDisp = (waveX + flutter) * uWind * uv.y * uv.y * 0.20;

        transformed.x += windDisp;
        transformed.z += windDisp * waveZ * 0.55;

        // Distance height shrink fade (48m to 72m)
        float distFade = 1.0 - smoothstep(48.0, 72.0, vGrassDist);
        transformed.y *= distFade;
        `
      );

      shader.fragmentShader = `
        uniform float uAutumn;
        varying vec3 vWorldGrass;
        varying vec2 vGrassUv;
        varying float vGrassDist;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        // Vertical blade gradient matching TerrainMaterial Autumn tones
        vec3 greenRoot = vec3(0.14, 0.22, 0.08);
        vec3 greenTip  = vec3(0.24, 0.34, 0.11);

        vec3 autumnRoot = vec3(0.15, 0.22, 0.08);
        vec3 autumnTip  = vec3(0.24, 0.32, 0.12);
        vec3 autumnStraw = vec3(0.28, 0.31, 0.13);

        vec3 root = mix(greenRoot, autumnRoot, uAutumn);
        vec3 tip  = mix(greenTip, mix(autumnTip, autumnStraw, 0.45), uAutumn);

        // Blade gradient: dark rich soil/turf at base -> sunlit luminous tips
        vec3 bladeCol = mix(root, tip, clamp(vGrassUv.y * 1.15, 0.0, 1.0));

        // Deterministic position hash for subtle natural patchiness
        float varHash = fract(sin(dot(vWorldGrass.xz, vec2(12.9898, 78.233))) * 43758.5453);
        bladeCol *= 0.90 + varHash * 0.20;

        diffuseColor.rgb = bladeCol;
        `
      );
    };
  }

  customProgramCacheKey() {
    return 'aftermile-grass-field-v5';
  }
}

interface TileSlot {
  mesh: THREE.InstancedMesh;
  side: -1 | 1;
  band: 'near' | 'mid';
  capacity: number;
}

interface SliceSlot {
  sliceK: number;
  tiles: TileSlot[];
}

export class GrassField {
  group = new THREE.Group();
  material: GrassMaterial;
  geometry: THREE.BufferGeometry;

  private slices: SliceSlot[] = [];
  private numSlices = 8;
  private sliceLen = 16.0; // 16m longitudinal slices
  private nearCapacity = 1800; // 1800 tufts in near verge band (~21.5 blades/m²)
  private midCapacity = 1200;  // 1200 tufts in mid meadow band (~8 blades/m²)

  private tempObj = new THREE.Object3D();
  private lastCenterK = -999999;
  private totalGrassCount = 0;

  constructor(
    public scene: THREE.Scene,
    public road: Road,
    public materials: Materials
  ) {
    this.geometry = createBladeTuftGeometry();
    this.material = new GrassMaterial();

    // Pre-allocate 8 slice slots (each has 4 tiles: Left Near, Left Mid, Right Near, Right Mid)
    // 8 slices * (1800 * 2 + 1200 * 2) = 48,000 instances max
    for (let s = 0; s < this.numSlices; s++) {
      const tiles: TileSlot[] = [];

      for (const side of [-1, 1] as const) {
        // Near tile
        const nearMesh = new THREE.InstancedMesh(this.geometry, this.material, this.nearCapacity);
        nearMesh.castShadow = false;
        nearMesh.receiveShadow = true;
        nearMesh.count = 0;
        nearMesh.userData.detailTier = 'near';
        this.group.add(nearMesh);
        tiles.push({ mesh: nearMesh, side, band: 'near', capacity: this.nearCapacity });

        // Mid tile
        const midMesh = new THREE.InstancedMesh(this.geometry, this.material, this.midCapacity);
        midMesh.castShadow = false;
        midMesh.receiveShadow = true;
        midMesh.count = 0;
        midMesh.userData.detailTier = 'mid';
        this.group.add(midMesh);
        tiles.push({ mesh: midMesh, side, band: 'mid', capacity: this.midCapacity });
      }

      this.slices.push({
        sliceK: -999999,
        tiles,
      });
    }

    this.scene.add(this.group);
  }

  update(
    carS: number,
    origin: number,
    time = 0,
    wind = 0.5,
    autumn = 0
  ) {
    // Update shader uniforms
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uWind.value = wind;
    this.material.uniforms.uAutumn.value = autumn;
    this.material.uniforms.terrainOrigin.value = origin;

    // Origin shift: whole grass group moves with origin
    this.group.position.z = origin;

    // Target longitudinal slice window: 2 slices behind car, 5 slices ahead (8 slices = 128m span)
    const centerK = Math.floor(carS / this.sliceLen);
    const minK = centerK - 2;
    const maxK = centerK + 5;

    // If slice window has shifted, recycle slices
    if (centerK !== this.lastCenterK) {
      this.lastCenterK = centerK;

      // Find which target slices need to be populated
      for (let k = minK; k <= maxK; k++) {
        const existing = this.slices.find((sl) => sl.sliceK === k);
        if (existing) continue;

        // Find a recycled slot outside [minK, maxK]
        const slot = this.slices.find((sl) => sl.sliceK < minK || sl.sliceK > maxK);
        if (slot) {
          this.populateSlice(slot, k);
        }
      }

      // Update total active instance count
      let sum = 0;
      for (const sl of this.slices) {
        if (sl.sliceK >= minK && sl.sliceK <= maxK) {
          for (const t of sl.tiles) {
            sum += t.mesh.count;
          }
        }
      }
      this.totalGrassCount = sum;
    }
  }

  private populateSlice(slot: SliceSlot, sliceK: number) {
    slot.sliceK = sliceK;

    const sMin = sliceK * this.sliceLen;
    const sMax = sMin + this.sliceLen;
    const sMid = sMin + this.sliceLen * 0.5;

    // Bridge / Tunnel check: completely disable grass on bridges and in tunnels
    const isBridge = this.road.isBridge(sMid);
    const isTunnel = this.road.isTunnel(sMid);

    if (isBridge || isTunnel) {
      for (const t of slot.tiles) {
        t.mesh.count = 0;
        t.mesh.visible = false;
      }
      return;
    }

    for (const t of slot.tiles) {
      this.populateTile(t, sMin, sMax, sliceK);
    }
  }

  private populateTile(tile: TileSlot, sMin: number, sMax: number, sliceK: number) {
    const isNear = tile.band === 'near';
    const side = tile.side;
    const capacity = tile.capacity;

    // Band lateral offset ranges:
    // Near: 10.3m to 26.0m (immediate roadside verge + near meadow)
    // Mid:  24.0m to 54.0m (rolling meadow extension)
    const oMin = isNear ? 10.3 : 24.0;
    const oMax = isNear ? 26.0 : 54.0;
    const oSpan = oMax - oMin;

    // Deterministic PRNG seeded by slice index, side, and band
    let seed = ((sliceK * 73856093) ^ (side === 1 ? 19349663 : 83492791) ^ (isNear ? 29471 : 94723)) >>> 0;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    let activeCount = 0;

    for (let i = 0; i < capacity; i++) {
      // Stratified longitudinal position with jitter
      const s = sMin + ((i + rnd()) / capacity) * this.sliceLen;

      // Lateral offset with non-linear density (slightly denser near the verge)
      const rOffset = isNear ? Math.pow(rnd(), 1.05) : rnd();
      const rawDist = oMin + rOffset * oSpan;

      // Soft natural roadside edge (avoid a razor-straight cut along asphalt/shoulder)
      if (isNear) {
        const reg = this.road.region(s);
        const minSafe = reg.biome === 'city' ? 11.6 : 10.35;
        const edgeWiggle = minSafe + 0.20 + Math.max(0, Math.sin(s * 0.32) * 0.45 + Math.sin(s * 0.85) * 0.25);
        if (rawDist < edgeWiggle) continue;
      }

      const offset = side * rawDist;

      // Coastal ocean / bay check
      const w = this.road.weights(s);
      if (offset < 0 && w.coast > 0.25) continue;

      const p = this.road.terrainPoint(s, offset);
      const groundY = this.road.terrainSurface(s, offset);

      // Sea level cutoff (8.0m)
      if (groundY < 8.0) continue;

      // Slope check: suppress grass on steep rocky cliffs
      const dhS = this.road.terrainSurface(s + 0.5, offset) - this.road.terrainSurface(s - 0.5, offset);
      const dhO = this.road.terrainSurface(s, offset + 0.5) - this.road.terrainSurface(s, offset - 0.5);
      if (Math.hypot(dhS, dhO) > 0.65) continue;

      // Height variation & natural verge scaling
      // Short manicured rough near the road edge, taller wild grass further out
      const vergeFactor = isNear ? Math.min(1.0, (rawDist - 10.3) / 4.5) : 1.0;
      const baseScale = isNear
        ? THREE.MathUtils.lerp(0.72, 1.05, vergeFactor) + (rnd() - 0.5) * 0.22
        : 1.0 + (rnd() - 0.5) * 0.30;

      // Random yaw rotation
      const rotY = rnd() * Math.PI * 2;

      // 4cm ground sink anchors firmly into slope
      const y = groundY - 0.035;

      this.tempObj.position.set(p.x, y, p.z);
      this.tempObj.scale.set(baseScale, baseScale, baseScale);
      this.tempObj.rotation.set(0, rotY, 0);
      this.tempObj.updateMatrix();

      tile.mesh.setMatrixAt(activeCount, this.tempObj.matrix);
      activeCount++;
    }

    tile.mesh.count = activeCount;
    tile.mesh.instanceMatrix.needsUpdate = true;
    tile.mesh.visible = activeCount > 0;
    if (activeCount > 0) {
      tile.mesh.computeBoundingBox();
      tile.mesh.computeBoundingSphere();
    }
  }

  reset() {
    this.lastCenterK = -999999;
    for (const sl of this.slices) {
      sl.sliceK = -999999;
      for (const t of sl.tiles) {
        t.mesh.count = 0;
        t.mesh.visible = false;
      }
    }
    this.totalGrassCount = 0;
  }

  get totalInstances() {
    return this.totalGrassCount;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    for (const sl of this.slices) {
      for (const t of sl.tiles) {
        t.mesh.dispose();
      }
    }
    this.group.clear();
    this.group.removeFromParent();
  }
}
