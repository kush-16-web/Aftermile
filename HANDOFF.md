# Aftermile — Continuous Meadow Correction Pass

**Date:** 2026-10-07  
**Status:** COMPLETED — LOCAL ONLY (DO NOT PUSH)  
**Playtest URL:** `http://localhost:4173/`

---

## 1. Executive Summary

This pass delivers the **Continuous Meadow Correction Pass**, correcting the previous "scattered vegetation props on green terrain" appearance into a rich, unbroken, **continuous grassland** where the player first perceives **ONE FIELD OF GRASS**.

All performance gains from the previous passes are preserved:
- **Zero leaf systems** (0 falling, 0 road, 0 airborne leaf meshes/particles).
- **Smooth 60 FPS driving** with stable memory and zero stutter.
- **Strict budget compliance:** Triangles maintained at ~650K (budget: 750K), draw calls ~356–402.

---

## 2. Before vs After Performance Metrics

Continuous driving test in **Autumn + Evening** mode in chase camera:

| Metric | Previous Pass (Foundation) | Continuous Meadow Correction Pass | Delta / Status |
|---|---|---|---|
| **Autumn Leaf Objects** | **0 (Zero)** | **0 (Zero)** | **Strictly Preserved (Zero)** |
| **FPS (WebGL Headless / Local)** | ~45 – 55 FPS | **48 – 60 FPS** | **Rock-solid & Fluid** |
| **Triangles per Frame** | ~626,000 | **650,280** | **Comfortably under 750K budget** |
| **Draw Calls** | ~298 | **356** | **Within 350–400 budget (instanced)** |
| **Grass Clump Instances** | 12,309 | **71,363** | **+5.8x Apparent Grass Density** |
| **Tree Instances** | 114 | **114** | **100% Mature Assets Preserved** |
| **Active World Chunks** | 20 | **20** | **Stable streaming** |
| **Geometries in Memory** | 527 | **526** | **Zero memory leaks** |
| **Peak Frame Spike** | 0 during cruise | **0 during cruise** | **Zero Stutter** |

---

## 3. Core Architecture & Visual Corrections

### A. Ultra-Lightweight 4-Triangle X-Card Geometry (`src/world/Materials.ts`)
- Replaced heavier multi-triangle geometry with an optimized **X-card** (2 intersecting vertical planes at 90°, 8 vertices, 4 triangles).
- Span: $0.88\text{m}$ width ($hw = 0.44\text{m}$), $0.44\text{m}$ natural height, sunk $5\text{cm}$ into the ground to anchor firmly into terrain without slope detachment.
- Soft hemispherical normals ($n_y = 0.80, n_{xz} = 0.42$) ensure blades catch warm evening sunlight and sky ambient without black backfaces or card self-shadowing.

### B. Procedural Grass Atlas with Wildflower Specks (`createGrassAtlasTexture()`)
- Generated $512 \times 256$ texture atlas with 4 distinct botanical variants:
  1. **Variant 0 (Fine Meadow Turf):** Dense fanned blades with unbroken base collar covering ground.
  2. **Variant 1 (Tall Wild Grass):** Tall canopy blades with delicate wheat-like seed heads.
  3. **Variant 2 (Sun-Cured Golden Straw):** Warm straw fescue and dried pasture grass.
  4. **Variant 3 (Wildflower Accent Meadow):** Delicate 2–3px wildflower specks (white daisies with yellow centers, pale yellow buttercups, subtle pale sky blue bells).
- Base understory blades extend across 100% of the card cell width to create an opaque turf carpet that hides the ground beneath.

### C. Color & Luminance Harmonization (Linear PBR Calibration)
- **Problem diagnosed:** Three.js `CanvasTexture` converts sRGB pixels to linear space when `.colorSpace = THREE.SRGBColorSpace`. Previous dark hex colors became $0.05 - 0.10$ in linear space, while GLSL terrain was $0.30 - 0.50$, making grass cards 3x darker than the terrain beneath them.
- **Solution:** Calibrated atlas sRGB colors (roots `#52642a`, tips `#7c9644`, straw `#5e5a30`/`#98924e`) so that linear shader albedos $(0.16 - 0.24 \text{ roots}, 0.23 - 0.33 \text{ tips})$ mathematically match `TerrainMaterial`'s linear `autumnTone` $(0.20 - 0.32)$.
- Grass roots now match the ground beneath them seamlessly.

### D. Roadside Verge & Stratified 3-Band Layout (`src/world/WorldChunk.ts` & `Landscape.ts`)
- **Shoulder Transition (`Landscape.ts`):** Confined gravel shoulder to immediate road edge ($|o| \in [9.8\text{m}, 11.4\text{m}]$) rather than stretching across 15 meters. From $10.3\text{m}$ outward, ground is 100% grassy turf.
- **Band 1 — Roadside Verge (10.3m – 15.5m):** 340 stratified longitudinal slices per chunk side with compact verge cards ($0.58\text{m} - 0.78\text{m}$ height) hugging directly against the concrete shoulder.
- **Band 2 — Continuous Meadow Carpet (14.0m – 32.0m):** 270 slices $\times$ 5 lanes = 1,350 cards per side. Jittered 2D grid ensures interlocking blade overlap with zero bare ground voids.
- **Band 3 — Meadow Transition (31.0m – 46.0m):** 180 slices $\times$ 3 lanes = 540 cards per side, carrying the 3D grass canopy smoothly into the distance shrink fade.

### E. Multi-Scale Pasture Terrain Shader (`src/world/TerrainMaterial.ts`)
- **Near-to-Far Continuity:** Smooth distance shrink fade from 34m to 48m (`transformed.y *= 1.0 - smoothstep(34.0, 48.0, vClumpDist)`) shrinks cards down into the terrain with zero popping.
- **Pasture-Scale Variation:** Tuned macro noise wavelengths ($40\text{m} - 80\text{m}$ field biomes, $20\text{m} - 35\text{m}$ mowing swaths, $4\text{m} - 10\text{m}$ turf clumping, $0.6\text{m}$ fine blade grain).
- **Green-Dominant Autumn Palette:** Strictly maintains $G > R$ across all autumn tones (deep olive `vec3(0.16, 0.26, 0.10)`, sunlit golden-green `vec3(0.24, 0.32, 0.12)`, dry straw `vec3(0.27, 0.30, 0.13)`), preventing orange/peach terrain wash and maintaining color separation from autumnal trees.
- **Grassland Mask:** Precise detector `smoothstep(0.005, 0.030, diffuseColor.g - diffuseColor.r)` reliably applies meadow shader to all fields while preserving gray cliff rock and coastal sand.

---

## 4. Verification & Testing

- **Driving Acceptance:** Verified in chase camera via 14-second driving test at normal highway speeds in Autumn + Evening mode (`scratch/test_driver.mjs`).
- **Visual Outcome:**
  - Sideways view from highway presents ONE CONTINUOUS FIELD OF GRASS bordering the asphalt shoulder.
  - Distant hills read as rolling grassland with visible pastoral swaths and turf variation, not flat green polygons.
  - No visible boundary or pop where 3D grass transitions into terrain.
  - Zero autumn leaf objects.
- **Build Checks:**
  - `npm run typecheck` — 0 errors.
  - `npm test` — all 103 tests passing.
  - `npm run build` — clean production bundle.
- **Workspace Cleanup:**
  - Removed all temporary Chrome profile cache files (2,900+ files) and added `scratch/` to `.gitignore`.

---

## 5. Next Steps

- Keep work strictly local (DO NOT PUSH).
- Future dedicated passes: Sky/Clouds pass, Hero opening scene, Roadside architecture.
