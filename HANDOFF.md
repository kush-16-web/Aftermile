# Aftermile — Emergency Performance + Autumn Leaf Correction Pass

Updated 2026-10-07. Read `PROJECT_CONTEXT.md` first. This local checkpoint delivers the Emergency Performance + Autumn Leaf Correction Pass: eliminated the "white paper" leaf defect, overhauled runtime performance with zero-allocation loops and shadow culling, optimized batch instancing, and maintained the mature tree assets and open landscape.

---

## Branch and Local Checkpoint

- **Branch:** `main`, repository `https://github.com/kush-16-web/Aftermile.git`
- **Mode:** **Local testing & development only (DO NOT PUSH without explicit user request)**.
- **Local commit:** `perf(world): emergency performance and autumn leaf correction pass`

---

## Bottlenecks Identified & Fixed

### 1. Root Cause of "White Paper" Autumn Leaf Defect
- **Defect Analysis:**
  1. `WorldChunk.ts` was scattering thousands of flat polygon ground decals (`m.leafGroundShape`) across the terrain and road shoulder/asphalt, which appeared as uniform debris.
  2. `Particles.ts` was using `MeshStandardMaterial` with `depthWrite: true` and `alphaTest: 0.15`. Under sunlight and specular reflection, the cards rendered as opaque pale/white rectangular cards.
- **Resolution:**
  - **Completely removed flat ground polygon decals** from `WorldChunk.ts`.
  - **Rebuilt leaf renderer in `Particles.ts`**:
    - Converted material to `MeshBasicMaterial` with `transparent: true, depthWrite: false, alphaTest: 0.1` and custom `onBeforeCompile` UV atlas shader.
    - True organic autumn palette: Sugar maple gold (`#f59e0b`), Oak burnt orange (`#ea580c`), Scarlet fan (`#dc2626`), Birch amber brown (`#b45309`).
    - Tiny physically believable scale: $0.055\text{m} \times 0.055\text{m}$ base quad (~5.5 cm delicate leaves).
    - Reduced particle pool to 40 max particles with active budgeting based on nearby canopy load.
    - Strict canopy origin: Falling leaves ONLY originate from broadleaf deciduous tree canopies within 45m of the player camera. Treeless highway stretches have 0 airborne leaves.

### 2. Shadow Pass Overdraw Spikes
- **Defect Analysis:** In `World.ts`, `castShadow = distance < 750` was active across all 8 world chunks (~3.2 km corridor). Hundreds of mature tree models (10k–30k vertices each) were being submitted to the directional shadow map renderer every frame, well beyond the shadow camera frustum.
- **Resolution:** Restricted tree shadow casting to `distance < 160m`. Distant and mid-range trees render with direct lighting and receive shadows without redundant shadow map draw calls.

### 3. Per-Frame Garbage Collection (GC) Stuttering
- **Defect Analysis:**
  - `Materials.update()` was allocating 14 `new THREE.Color()` objects per frame during driving.
  - `World.get leafSources()` was creating new arrays and cloning dozens of emitter objects 60 times per second.
  - `Particles.update()` was calling `.filter()`, `.sort()`, and `.slice()` allocating multiple arrays every frame.
- **Resolution:**
  - Pre-allocated static color objects in `Materials.ts`.
  - Added object pool for `_cachedLeafSources` in `World.ts`.
  - Pre-allocated `activeLeafSources` in `Particles.ts` using squared-distance bounding checks with 0 per-frame allocations.

### 4. Batch Matrix Allocation in Chunk Streaming
- **Defect Analysis:** `Batch.ts` was cloning hundreds of `THREE.Matrix4` instances per chunk during streaming, adding allocation spikes during high-speed travel.
- **Resolution:** Replaced `Matrix4[]` arrays with flat float arrays in `Batch.ts`, streaming directly into `InstancedMesh.instanceMatrix.array` with a single native TypedArray copy.

---

## Summary of Changes by File

- `src/weather/Particles.ts`:
  - 5.5 cm quad size, 4-variant organic autumn leaf canvas texture atlas.
  - `MeshBasicMaterial` with `transparent: true, depthWrite: false, alphaTest: 0.1`.
  - Strict 45m canopy emitter attachment; 0 airborne leaves in open fields.
  - Capped particle pool at 40; zero per-frame allocations in `update()`.
- `src/world/World.ts`:
  - Restricted tree shadow casting to `distance < 160m`.
  - Added object pooling for `leafSources` to eliminate per-frame GC allocations.
- `src/world/Batch.ts`:
  - Flat float instance buffer and native TypedArray copy into `InstancedMesh`.
- `src/world/Materials.ts`:
  - Pre-allocated static color objects to eliminate per-frame allocations in `update()`.
- `src/world/WorldChunk.ts`:
  - Removed flat ground leaf decals.
  - Dual-stream asymmetric grassland (58 near tufts, 52 field clusters per side/chunk).

---

## Strict Constraints Maintained

- **NO PUSH**: All work is local only.
- **ZERO VEHICLE CHANGES**: R34 physics, steering, `maxAngleBySpeed`, braking, drift, audio, cameras, and UI/HUD are 100% untouched. User's manual tuning in `src/vehicle/definitions/R34.ts` preserved.
- **MATURE TREE ASSETS PRESERVED**: `tree_oak_mature.glb`, `tree_ash_mature.glb`, `tree_roadside.glb`, and `tree_pine_tall.glb` remain active with rich natural scaling.

---

## Quality & Regression Checks

- `npm run typecheck`: **0 errors** (strict TypeScript).
- `npm test`: **103/103 tests passing**.
- `npm run build`: **0 errors** (production build generated in `dist/`).

---

## Local Playtest Instructions

```bash
npm run dev
# Open http://localhost:4173/ in browser
```

### Verification Checklist:
1. Select **Autumn + Evening** mode.
2. Drive the R34 at high speed across multiple chunks:
   - Verify smooth 60+ FPS frame pacing with no stuttering at chunk boundaries.
   - Verify zero white paper cards on the highway or in open fields.
   - Verify small (~5.5 cm) fluttering autumn leaves appear subtly only near mature tree canopies.
   - Verify open highway stretches remain clean.
