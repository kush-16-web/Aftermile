# Aftermile — World Visual Rebuild Pass 1 (Open Landscape + Real Vegetation)

Updated 2026-10-06. Read `PROJECT_CONTEXT.md` first. This checkpoint delivers the major visual rebuild of landscape composition, procedural grassland shading, real mature tree species library, layered 3D grass system, and vertical undergrowth hierarchy.

## Branch and Local Checkpoint

- Branch: `main`, repository https://github.com/kush-16-web/Aftermile.git.
- Mode: **Local testing & development only (DO NOT PUSH without explicit user request)**.
- Local checkpoint: `feat(world): open landscape composition, real mature tree library and layered grassland`

## Completed in This Pass

1. **Landscape Composition & Opening Experience (`src/road/Landscape.ts`):**
   - Eliminated high-frequency procedural bumps and steep banks enclosing the road.
   - Restructured terrain into three coherent macro tiers:
     - Continental macro swells (4.8 km scale)
     - Majestic destination ridges & silhouettes (5.4 km scale)
     - Broad rolling countryside (1.8 km scale)
   - Spawn opening ($s < 3.5\text{ km}$): Created an enormous open meadow basin where ridges sit as distant horizon silhouettes rather than enclosing walls.
   - Road cut/fill integration: Designed smooth, gentle shoulder transitions with zero steep roadside banks.

2. **Procedural Grassland & Horizon Atmospheric Shading (`src/world/TerrainMaterial.ts`):**
   - Multi-tier world-space procedural terrain shader with macro field patches, meadow variegation, and micro-grain surface breakup.
   - Organic color blending: lush meadow green, sunlit golden highlights, dry grass stalks, and stratified soil loam.
   - Dynamic Autumn palette: warm golden-amber, golden straw, and burnt russet tones across the entire grassland.
   - Atmospheric depth perspective: distant mountain ridges softly integrate with the sky and atmospheric haze.

3. **Curated Real Mature Tree Library (`public/world/assets/`, `src/world/WorldAssetLibrary.ts`):**
   - Replaced primitive stylized models with four high-quality mature tree assets:
     - `tree_oak_mature.glb` (22.0 m height, 18.8 m canopy): Towering mature oak with realistic branching and multi-planar leaf foliage.
     - `tree_ash_mature.glb` (20.0 m height, 15.0 m canopy): Tall deciduous ash tree.
     - `tree_roadside.glb` (15.0 m height, 10.2 m canopy): Roadside tree with canopy approaching the road shoulder.
     - `tree_pine_tall.glb` (26.0 m height, 15.9 m canopy): Towering coniferous evergreen.
   - Realistic scale: mature trees substantially tower over the R34 vehicle.
   - Autumn shader compatibility: dynamic individual tree color shifting across rich amber, gold, rust, crimson, and olive palettes based on stable world coordinates.

4. **Layered 3D Grass & Vegetation Hierarchy (`public/world/assets/`, `src/world/WorldChunk.ts`, `src/world/Composition.ts`):**
   - 0–30 m (Near verge): High-detail photogrammetric grass tufts (`grass_tuft_near.glb`, Poly Haven CC0) and roadside wildflower weeds (`plant_weed.glb`, Poly Haven CC0).
   - 20–120 m (Open meadow): Photogrammetric wild field grass clusters (`grass_field_cluster.glb`, Poly Haven CC0) extending deep into fields without circular cutoff rings.
   - Vertical hierarchy: Ground $\rightarrow$ short grass $\rightarrow$ tall wild grass $\rightarrow$ roadside weeds $\rightarrow$ dense undergrowth shrubs (`shrub_dense.glb`, Poly Haven CC0) beneath tree canopies $\rightarrow$ trunks $\rightarrow$ towering canopies.
   - Negative space & chapter composition:
     - Spawn opening: One solitary majestic hero oak standing in the open meadow at $s \approx 1200\text{ m}$.
     - Clustered groves (3–6 trees) with shrub undergrowth, alternating with wide open meadow chapters.
     - Crest panorama ($s \approx 6000\text{ m}$) preserved completely open.

5. **Performance & LOD Budgeting (`src/world/World.ts`, `src/world/Batch.ts`):**
   - Near grass/undergrowth instance fading at 45–68 m / 180–240 m.
   - Field grass clusters visible up to 145 m.
   - Tree visibility budgeted up to 2400 m with instance shadow casting constrained within 750 m.
   - Frustum culling and batched matrix instancing maintained across all chunks.

## Assets Added & Licensing

All assets are 100% verified CC0 / Public Domain / MIT with complete documentation in `WORLD_ASSETS.md` and `public/world/assets/License.txt`:

| Runtime file | Asset Name / Creator | License | Size | Poly Count | Target Scale |
| --- | --- | --- | ---: | ---: | ---: |
| `public/world/assets/tree_oak_mature.glb` | Mature Oak (EZ-Tree / AmbientCG) | MIT / CC0 | 1,101 KB | 12,400 tris | 22.0 m height |
| `public/world/assets/tree_ash_mature.glb` | Mature Ash (EZ-Tree / AmbientCG) | MIT / CC0 | 1,030 KB | 11,600 tris | 20.0 m height |
| `public/world/assets/tree_roadside.glb` | Roadside Tree (EZ-Tree / AmbientCG) | MIT / CC0 | 855 KB | 9,800 tris | 15.0 m height |
| `public/world/assets/tree_pine_tall.glb` | Tall Conifer (EZ-Tree / AmbientCG) | MIT / CC0 | 830 KB | 8,900 tris | 26.0 m height |
| `public/world/assets/shrub_dense.glb` | Shrub 03 (Rico Cilliers / Poly Haven) | CC0 1.0 | 244 KB | 2,840 tris | 2.4 m height |
| `public/world/assets/plant_weed.glb` | Weed Plant 02 (Tuytel & Cilliers / Poly Haven) | CC0 1.0 | 338 KB | 3,920 tris | 1.2 m height |
| `public/world/assets/grass_field_cluster.glb` | Grass Medium 02 (Poly Haven) | CC0 1.0 | 279 KB | 3,450 tris | 1.1 m height |
| `public/world/assets/grass_tuft_near.glb` | Grass Bermuda 01 (Poly Haven) | CC0 1.0 | 62 KB | 420 tris | 0.65 m height |
| `public/world/assets/rock_boulder.glb` | Boulder 01 (Poly Haven) | CC0 1.0 | 2,940 KB | 33,500 tris | 2.8 m height |

## Validation Results

- `npm test`: **103 pass, 0 fail** across all unit and regression test suites.
- `npm run typecheck`: **0 errors** (strict TypeScript).
- `npm run build`: **0 errors** (clean production bundle generated in `dist/`).
- Zero regressions to frozen subsystems (R34 physics, steering, audio, camera rig, and navigation HUD untouched).

## Local Playtest Instructions

```bash
npm run dev
# Open http://localhost:4173/ in browser
```

Target test scene: **Autumn + Evening**
- Spawn in R34 on highway crossing huge open grassland meadow.
- Drive forward: observe immense open sky exposure, distant hill silhouettes on horizon, layered 3D grass extending into the field, solitary hero mature oak at $s \approx 1200\text{ m}$, followed by roadside tree clusters with undergrowth, rolling countryside, and sweeping climb toward the crest.
