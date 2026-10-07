# Aftermile — Natural World Quality Pass (Pass 2)
## Tree Population + Grass + Autumn Ecology + Repetition Cleanup

Updated 2026-10-07. Read `PROJECT_CONTEXT.md` first. This local checkpoint delivers the Natural World Quality Pass: dual-stream asymmetric tree population, layered grassland distribution, variegated Autumn meadow ecology, realistic canopy-attached Autumn leaves, square bird removal, and complete asset folder audit.

---

## Branch and Local Checkpoint

- **Branch:** `main`, repository `https://github.com/kush-16-web/Aftermile.git`
- **Mode:** **Local testing & development only (DO NOT PUSH without explicit user request)**.
- **Local checkpoint:** `feat(world): natural world quality pass — asymmetric tree population, rich grassland ecology, canopy leaves and repetition cleanup`

---

## Completed in This Pass

### 1. Preserved Mature Tree Family with Natural Recurrence (`src/world/Composition.ts`)
- Preserved all 4 mature tree models (`tree_oak_mature.glb`, `tree_ash_mature.glb`, `tree_roadside.glb`, `tree_pine_tall.glb`).
- Substantially increased tree presence across the journey without turning the world into a uniform forest wall.
- True majestic mature scale maintained: trees tower over the R34 vehicle (oaks 20.0–25.5 m, ashes 18.5–23.0 m, roadside 14.5–18.0 m, tall pines 23.0–29.5 m).

### 2. Eliminated Mirrored & Repeating Placement Across the Road (`src/world/Composition.ts`, `src/world/WorldChunk.ts`)
- Implemented **independent dual-stream generation** for Left and Right sides:
  - Left stream: step size 260 m, seed offset `104729`.
  - Right stream: step size 310 m, seed offset `224737`.
  - Independent random streams for cluster occurrence, cluster size, species, rotation, scale, and distance from road.
  - Left and right never align or mirror each other across the asphalt.
- Enforced Poisson-like anti-stacking spacing within all groups ($\ge 10.5\text{ m}$ trunk separation) so trunks never overlap and open meadow grass is always visible between trees.

### 3. Authored Landscape Rhythm & Open/Enclosed Composition (`src/world/Composition.ts`)
- Authored dynamic rhythm zones:
  - **Spawn Opening ($s < 1550\text{ m}$):** Vast open meadow basin with panoramic horizon; exactly ONE solitary majestic hero mature oak at $s \approx 1220\text{ m}$ (height 23.5 m, canopy 11.5 m).
  - **Open Meadow Negative Space (~26%):** Pure open countryside where sky and rolling hills take center stage.
  - **Isolated Mature Trees (~18%):** Single towering oaks or ashes standing proud in the fields.
  - **Loose 3–6 Tree Groups (~26%):** Spaced naturally with visible grass between trunks.
  - **Medium 6–10 Tree Groves (~14%):** Rich woodland clusters with undergrowth shrubs.
  - **Roadside Woodland Edges (~10%):** Mature trees closer to the shoulder (offset 22–32 m), canopies overhanging the roadside verge.
  - **Distant Ridge Tree Lines (~6%):** Trees framing distant horizon ridges (offset 180–320 m).
  - **Crest Panorama ($5750–6250\text{ m}$):** Maintained completely clear for panoramic crest vista.

### 4. Layered Grass & Variegated Autumn Ecology (`src/world/WorldChunk.ts`, `src/world/TerrainMaterial.ts`)
- Independent Left and Right streams for ground cover in `WorldChunk.ts`:
  - Near verge (12–38 m): photogrammetric grass tufts (`grass_tuft_near.glb`) and roadside wildflower weeds (`plant_weed.glb`).
  - Mid field (28–120 m): large photogrammetric grass clusters (`grass_field_cluster.glb`) continuing seamlessly into the open meadow.
- Refined procedural grassland shader in `TerrainMaterial.ts`:
  - Multi-tier noise breakup: macro field patches, meadow variegation, clump breakup, and micro-grain.
  - Variegated Autumn ecology: muted olive green, warm golden amber, straw yellow, burnt russet, and dry loam tones.

### 5. Fixed Autumn Leaves System Completely (`src/weather/Particles.ts`, `src/world/Materials.ts`, `src/world/WorldChunk.ts`)
- **Leaf Size:** Downscaled particle geometry from 0.38 m giant panels to realistic 0.10 m (8.5–12 cm true-to-life leaf scale).
- **Atlas Shader:** 4 distinct leaf variants (Sugar Maple, Lobed Oak, Scarlet Maple, Birch) rendered through an instanced UV offset shader.
- **Strict Canopy Emitters:** Leaves strictly originate from nearby active broadleaf canopies ($r < 0.72 \times \text{canopyRadius}$, $y \in [\text{canopyBottom}, \text{canopyTop}]$). No leaves spawn in open fields without nearby trees.
- **Flight Physics:** Gentle fall rate ($1.05\text{ m/s}$), global wind drift, sinusoidal flutter, tumble rotation, and car aerodynamic wake displacement.
- **Ground Settling:** Falling leaves settle onto grass/ground beneath canopies for 6–12 seconds.
- **Clean Highway:** Scaled fallen leaf decals to 0.14 m. Open road without nearby trees remains clean; leaves only appear on asphalt where canopies overhang near the shoulder.

### 6. Removed Square / Primitive Birds (`src/world/AmbientLife.ts`)
- Removed all primitive box bird meshes from the scene.
- Retained spatial audio trigger logic (`onBirdNearby`) for ambient wildlife sound cues.

### 7. Asset Folder Audit & Documentation (`ASSET_CLEANUP.md`, `WORLD_ASSETS.md`)
- Created `ASSET_CLEANUP.md` with audit classifications (Category A–H) and KEEP/VERIFY recommendations.
- Updated `WORLD_ASSETS.md` with full provenance, CC0/MIT licensing, and optimization details.

---

## Validation & Quality Checks

- `npm run typecheck`: **0 errors** (strict TypeScript).
- `npm test`: **Passing** all environment, composition, world foundation, and world asset tests.
- `npm run build`: **0 errors** (clean production bundle generated).
- Frozen subsystems untouched: R34 physics, steering, vehicle audio, cameras, HUD/UI, minimap, and garage intact.

---

## Local Playtest Instructions

```bash
npm run dev
# Open http://localhost:4173/ in browser
```

### Personal Test Scenario: **AUTUMN + EVENING**
1. Select **Autumn** environment and **Evening** time of day.
2. Start driving the R34:
   - Notice the vast, believable open meadow at spawn with golden-amber and olive ecological grass tones.
   - Solitary majestic mature oak standing in the open field at $s \approx 1200\text{ m}$.
   - Asymmetric landscape: left and right sides have completely independent, non-repeating rhythms.
   - Towering mature trees appearing naturally across the countryside (loose groups, roadside canopies, medium groves, and wide open negative space).
   - Tiny realistic falling autumn leaves fluttering near tree canopies and settling into grass.
   - Highway remains clean across open stretches.
   - Zero square box birds in the sky.
