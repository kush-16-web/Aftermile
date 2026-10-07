# Aftermile — Field + Tree Population + Autumn Leaf Correction Pass

Updated 2026-10-07. Read `PROJECT_CONTEXT.md` first. This local checkpoint delivers the Field + Tree Population + Autumn Leaf Correction Pass: macro-zoned asymmetric tree population, layered 3D grassland meadow coverage, light-responsive procedural terrain micro-relief, subtle canopy-attached small autumn leaves, square bird removal, and asset cataloging.

---

## Branch and Local Checkpoint

- **Branch:** `main`, repository `https://github.com/kush-16-web/Aftermile.git`
- **Mode:** **Local testing & development only (DO NOT PUSH without explicit user request)**.
- **Local checkpoint:** `feat(world): field and tree population pass — macro zones, 3D grassland blanketing, micro-relief terrain, tiny canopy leaves`

---

## Completed in This Pass

### 1. Preserved Mature Tree Family with Macro Composition Zones (`src/world/Composition.ts`)
- Preserved all 4 mature tree models (`tree_oak_mature.glb`, `tree_ash_mature.glb`, `tree_roadside.glb`, `tree_pine_tall.glb`).
- Substantially increased tree recurrence across the journey with natural rhythm:
  - **Zone A (Pure Open Meadow):** Vast rolling fields with 0–1 solitary trees.
  - **Zone B (Scattered Meadow):** Isolated mature trees and loose 3–6 tree groups.
  - **Zone C (Medium Woodland):** 7–14 tree groves and roadside canopy trees.
  - **Zone D (Tree-Rich Section):** Large loose 15–25 tree groves and staggered multi-cluster stretches.
  - **High Vista / Horizon:** Distant tree lines (offset 180–320m) framing mountain ridges.
  - **Crest Panorama ($5750–6250m):** Kept completely clear for uninterrupted horizon vista.
- Maintained majestic mature scale (14.5–29.5m) that substantially towers over the R34.
- Guaranteed Poisson-like breathing room ($\ge 11.5–14.0\text{m}$ min trunk separation) with visible open grass between trunks.

### 2. Zero Left/Right Mirroring (`src/world/Composition.ts`, `src/world/WorldChunk.ts`)
- Left and right sides are driven by independent random streams with different spatial steps ($155\text{m}$ vs $185\text{m}$), distinct prime seeds, and independent chapter rolls.
- Never mirrors objects across the asphalt.

### 3. Layered 3D Grassland Meadow Blanketing (`src/world/WorldChunk.ts`)
- Deeply enriched 3D grass coverage:
  - Near verge (11.5–40m): 58 instances/side/chunk of photogrammetric grass tufts (`grass_tuft_near.glb`) and roadside wildflower weeds (`plant_weed.glb`).
  - Mid field (26–140m): 52 instances/side/chunk of dense photogrammetric wild grass clusters (`grass_field_cluster.glb`) extending deep into open fields.
- Eliminates bare ground patches near the road and prevents artificial circular cutoff rings.

### 4. Light-Responsive Procedural Terrain Micro-Relief (`src/world/TerrainMaterial.ts`)
- Added procedural micro-relief normal perturbation derived from noise gradients in view space: grass blades and soil clumps catch directional sunlight and low evening rays.
- Modulated surface roughness ($0.78–0.98$) across meadow patches, soil loam, and rain wetness.
- Variegated Autumn ecology palette: muted olive green, golden amber, straw yellow, burnt russet, and dry loam.

### 5. Rebuilt Autumn Leaf System (`src/weather/Particles.ts`, `src/world/Materials.ts`, `src/world/WorldChunk.ts`)
- **Tiny Realistic Scale:** 7.5cm base geometry producing delicate 6.5–8.5cm fluttering autumn leaves.
- **Subtle Density:** Reduced pool from 320 to 80 particles; active leaves capped at 25–45 subtle occasional particles.
- **Strict Canopy-Attachment:** Emitters strictly attach to active broadleaf tree canopies ($r < 0.55 \times \text{canopyRadius}$). Treeless open highway sections have zero falling leaves.
- **Natural Flight & Wake:** Flutter with world wind ($0.95\text{ m/s}$ fall rate), tumble spin, settling into grass below, and subtle aerodynamic wake displacement when driving past.
- **Clean Asphalt:** Fallen leaf decals ($0.14\text{m}$) concentrate tightly beneath canopies. Open highways remain clean.

### 6. R34 / Vehicle Integrity
- Zero modifications to R34 physics, steering, `maxAngleBySpeed`, drift, braking, audio, or cameras. User's manual steering tuning in `R34.ts` preserved untouched.

---

## Validation & Quality Checks

- `npm run typecheck`: **0 errors** (strict TypeScript).
- `npm test`: **Passing** all environment, composition, world foundation, and world asset tests.
- `npm run build`: **0 errors** (production bundle generated in `dist/`).

---

## Local Playtest Instructions

```bash
npm run dev
# Open http://localhost:4173/ in browser
```

### Personal Test Scenario: **AUTUMN + EVENING**
1. Launch game in **Autumn + Evening**.
2. Drive the R34:
   - Notice the rich, continuous 3D grass meadow extending from the roadside verge into the distant fields.
   - Solitary mature oak in the meadow basin at $s \approx 1200\text{ m}$.
   - Encounter recurring, varied tree compositions (isolated trees, loose 3–6 groups, medium 7–14 groves, large loose 15–25 groves, and roadside canopies) with natural breathing room between trunks.
   - Distinct, non-repeating left and right sides.
   - Tiny delicate autumn leaves fluttering only near actual tree canopies and settling into grass.
   - Clean open asphalt across treeless field stretches.
   - Clean, serene sky with no box birds.
