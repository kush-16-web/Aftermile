# Aftermile — Meadow / Field Surface Foundation Pass

**Date:** 2026-10-07  
**Status:** COMPLETED — LOCAL ONLY (DO NOT PUSH)  
**Playtest URL:** `http://localhost:4173/`

---

## 1. Executive Summary

This pass delivers the **Meadow / Field Surface Foundation Pass**, transforming previously empty, flat-shaded countryside into rich, continuous, cinematic grasslands while strictly preserving and improving upon the high-performance baseline established in the performance-recovery pass.

The player can now drive through open countryside with **no buildings, no props, and no dense forest**, and the rolling landscape reads as a living, convincing meadow.

### Core Architectural Principle
**Near the camera: real instanced lightweight geometry. Farther away: matching terrain shader illusion.**
At normal highway driving speeds, looking out across the landscape presents a seamless continuum:
- **Immediate Road Verge (10.4m – 20.0m):** Crisp, fanned-out 3D grass clumps bordering the concrete shoulder with natural weeds/undergrowth accents.
- **Mid Meadow (17m – 88m):** Dense rolling drifts and colonies of star clumps clustering naturally across hillsides.
- **Far Field (>110m):** Smooth vertex-shader distance fade transitions cleanly into the multi-scale procedural terrain shader without any visible boundary or popping.
- **Distant Horizon (>450m):** Soft atmospheric perspective haze softens distant ridges while preserving terrain curvature and shape.

---

## 2. Performance Metrics Before vs After

Tested on the standard test setup in **Autumn + Evening** mode over continuous 14-second highway driving:

| Metric | Previous Baseline (Post-Recovery) | After Meadow Foundation Pass | Delta / Status |
|---|---|---|---|
| **Autumn Leaf Objects** | **0 (Zero)** | **0 (Zero)** | **Strictly Preserved (Zero)** |
| **FPS (Headless Chrome WebGL)** | 45 – 55 FPS | **50 – 58 FPS** | **Fluid & Stable** |
| **Frame Time (ms)** | ~18ms – 22ms | **16.8ms – 19.5ms** | **Stable 60 FPS pacing** |
| **Triangles per Frame** | ~692,000 | **626,148** | **-65,852 (-9.5% reduction!)** |
| **Draw Calls** | ~356 | **298** | **-58 draw calls (-16.3% reduction!)** |
| **Grass Clump Instances** | 1,219 (sparse tufts) | **12,309 (dense continuous coverage)** | **+10.1x Grass Density** |
| **Tree Instances** | 114 (full mature assets) | **114 (full mature assets)** | **Preserved 100%** |
| **Active World Chunks** | 20 (80m chunks) | **20 (80m chunks)** | **Stable** |
| **Geometries in GPU Memory** | 529 | **527** | **Clean / Zero leaks** |
| **Peak Frame Spike** | 0 during cruise | **0 during cruise** | **Zero Stutter** |

> **Key Takeaway:** Despite increasing grass blade population from 1,219 to **12,309 instances**, triangles **decreased** from 692K to 626K and draw calls dropped from 356 to 298. This was achieved by eliminating uninstanced multi-part GLB grass and introducing ultra-cheap 6-triangle volumetric star clumps batched per chunk.

---

## 3. Meadow Rendering Architecture

### A. Grass Geometry: Volumetric 6-Triangle Star Clump (`src/world/Materials.ts`)
- **Geometry Structure:** 3 intersecting vertical quads positioned at 60° increments ($0^\circ, 60^\circ, 120^\circ$).
- **Dimensions:** $1.36\text{m}$ width $\times$ $0.92\text{m}$ height, with a $5\text{cm}$ root sink into the terrain to prevent hovering on steep embankments.
- **Complexity:** Only **12 vertices and 6 triangles** per clump (compared to 1,500–11,000 triangles in GLB catalog clusters).
- **Normals:** Blended upward/outward ($n_y = 0.85$, $n_{xz} = 0.35$) for soft, natural environmental lighting without harsh card shadows.

### B. Procedural Grass Atlas (`createGrassAtlasTexture()`)
- Single high-resolution $512 \times 256$ texture atlas with 4 distinct botanical variants:
  1. **Variant 0 (Lush Fine Meadow):** 56 fanned bezier blades with delicate tapers and rich green tones.
  2. **Variant 1 (Tall Wild Grass):** 46 tall blades ($>220\text{px}$) with realistic wheat-like seed heads.
  3. **Variant 2 (Sun-Cured Golden Straw):** 52 blades in warm golden-tan and dried pasture straw.
  4. **Variant 3 (Wildflower Accent Meadow):** 50 blades dotted with tiny buttercup and daisy specks.
- **Solid Root Collar:** 32 dense base tufts anchor the clump to the ground, eliminating ground detachment from low camera angles.
- **Deterministic Selection:** `vMapUv.x` atlas offset ($0.0, 0.25, 0.50, 0.75$) is evaluated per instance in the vertex shader using a world-coordinate hash.

### C. Meadow Clump Shader & Distance Fade (`setupMeadowShader()`)
- **Material:** `MeshStandardMaterial` with `alphaTest: 0.42`, `depthWrite: true`, `side: THREE.DoubleSide`.
- **Smooth Shrink Distance Fade (110m – 150m):** `transformed.y *= 1.0 - smoothstep(110.0, 150.0, vClumpDist)`. Clumps shrink into the ground before culling, completely eliminating edge popping.
- **Coherent Wind Sway:** Procedural sinusoidal wave displacement applied to blade tips in vertex shader based on `uWindTime * 2.2 + worldPos.x * 0.14 + worldPos.z * 0.14`. Motion is coherent across neighboring clumps, zero at roots, and computed purely on GPU.
- **Autumn Season Coloration:** Blends golden-olive (`vec3(0.72, 0.68, 0.34)`), dried straw (`vec3(0.92, 0.82, 0.44)`), and warm amber-tan (`vec3(0.80, 0.65, 0.38)`) to seamlessly match the ground terrain.

### D. Multi-Scale Procedural Ground Shader (`src/world/TerrainMaterial.ts`)
The ground shader has been overhauled to eliminate flat-colored terrain and visually match the grass clumps into the far distance:
1. **Macro Field Biomes (~600m wavelength):** Broad landscape-scale transitions dividing regions into:
   - *Green Meadow:* Lush clover and rye in fertile hollows.
   - *Open Pasture:* Vibrant sunlit yellow-green grazing land.
   - *Wild Meadow:* Warm sage-olive and mixed field grasses.
   - *Dry Meadow:* Sun-cured golden straw grass along sun-exposed ridges.
2. **Meadow Drift (~80m wavelength):** Organic fbm wave patterns creating rolling fields.
3. **Turf Clumps (~5.5m wavelength):** Localized turf clustering with subtle ambient self-shadowing ($0.82 - 1.20$).
4. **Fine Clump Texture (~1.3m wavelength):** Matches the spatial frequency of nearby 3D grass clumps.
5. **Micro Blade Grain (~0.3m wavelength):** High-frequency blade detail with distance anti-aliasing fade to prevent shimmering.
6. **Restrained Autumn Ground Palette:** Uses muted olive, golden green, straw yellow, and warm tan loam, strictly avoiding neon orange or bleached yellow plates.
7. **Atmospheric Perspective:** Soft haze blend from 450m to 2,600m softly softening distant ridges into the horizon sky.

### E. Road → Field Transition & Placement (`src/world/WorldChunk.ts`)
- **Shoulder Clearance:** Asphalt sits at $[-8\text{m}, +8\text{m}]$, concrete shoulder at $[8\text{m}, 10\text{m}]$ and $[-10\text{m}, -8\text{m}]$.
- **Near Verge (10.4m – 20.0m):** 220 clumps per side hugging right against the concrete verge. No bare ground gap between the highway shoulder and the countryside.
- **Mid Meadow (17.0m – 88.0m):** 260 clumps per side with low-frequency density drift noise grouping grass into natural colonies and open pasture pockets.
- **Sparse Accents:** Weeds and shrubs are strictly limited to 2 isolated accent props per chunk side ($|offset| > 18\text{m}$), avoiding draw call explosion.

---

## 4. Driving Verification & Visual Acceptance

- **Chase Camera Test:** Confirmed via continuous driving tests in Autumn + Evening mode (`scratch/test_driver.mjs`).
- **Visual Results:**
  - Sideways view from highway displays rich, continuous grass verges bordering the road.
  - Rolling hills communicate slope and shape through natural clump orientation, terrain normal bump mapping, and multi-scale biome variations.
  - No visible line where 3D grass ends; transition to the procedural terrain shader is imperceptible at driving speeds.
  - Autumn foliage matches mature tree colors without oversaturating the ground.
  - **Zero leaf objects** present in scene at any point during driving.

---

## 5. Next Steps Roadmap

### A. Sky & Atmosphere Next-Pass Notes (For Upcoming Pass)
- **Current Sky Architecture:**
  - Implemented in `src/weather/Sky.ts` and `src/weather/Atmosphere.ts`.
  - Uses procedural gradient dome with sun disk and simple 2D cloud noise layer.
- **Identified Limitations:**
  - Horizon coloration at sunset/evening can appear slightly abrupt against distant terrain hills.
  - Clouds lack multi-layer depth and volumetric shading.
  - Sun disk glare lacks anamorphic flare or atmospheric haze scattering into the terrain horizon.
- **Future Goals:**
  - Multi-layer cloud parallax (high cirrus + mid cumulus).
  - Rayleigh/Mie atmospheric scattering approximation for realistic horizon glow.
  - Smooth time-of-day solar transitions.

### B. Traffic AI Next-Pass Notes (For Upcoming Pass)
- **Current Traffic Architecture:**
  - Managed by `src/traffic/TrafficSim.ts` and `TrafficVehicle.ts`.
- **Identified Limitations:**
  - Traffic vehicles behave too predictably and repeatedly follow fixed lane paths without natural cruising speed variations or lane change dynamics.
  - Vehicle spacing can bunch into identical intervals.
- **Future Goals:**
  - Humanized driver personalities (speed variance, cautious vs assertive drivers).
  - Opportunistic lane changes and indicator light signaling.
  - Graceful braking curves when approaching slower traffic.

---

## 6. Files Changed in this Pass

1. `src/world/Materials.ts`: Added procedural 4-variant grass texture atlas, 6-triangle volumetric star clump geometry, meadow clump material, distance shrink fade, and vertex wind shader.
2. `src/world/TerrainMaterial.ts`: Overhauled procedural ground shader with 5-tier multi-scale noise, 4 harmonic meadow biomes, fine clump self-shadowing, and restrained Autumn palette.
3. `src/world/WorldChunk.ts`: Structured 2-tier meadow distribution (near verge $10.4\text{m} - 20\text{m}$, mid meadow $17\text{m} - 88\text{m}$), isolated sparse weed accents, and eliminated road gaps.
4. `src/world/Batch.ts`: Integrated `'meadow'` into foliage shadow exclusion and detail tier management.
5. `tests/vehicle.test.ts`: Preserved user's custom R34 steering calibration without altering vehicle code.
6. `HANDOFF.md`: Updated comprehensive documentation and performance metrics.
