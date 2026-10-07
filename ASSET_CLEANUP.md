# Aftermile — Asset Audit & Cleanup Report

**Audit Scope:** Environment, vegetation, and world asset directories (`public/world/assets/`, `public/world/kenney/`).  
**Audit Date:** 2026-10-07  
**Pass:** Emergency Performance Recovery & Leaf Removal Pass (Pass 5)

---

## 1. Active Runtime Assets (`public/world/assets/`)

| File / Path | Size | Category | Referenced By Runtime | Reason / Status | Action |
|---|---|---|---|---|---|
| `public/world/assets/tree_oak_mature.glb` | 1,101,464 B (~1.1 MB) | C (Hero Asset) | Yes (`WorldAssetLibrary.ts`, `Composition.ts`) | High-quality mature oak model (22m), dual-mesh (trunk + foliage canopy). Centered base. | **KEEP** |
| `public/world/assets/tree_ash_mature.glb` | 1,030,944 B (~1.0 MB) | C (Hero Asset) | Yes (`WorldAssetLibrary.ts`, `Composition.ts`) | High-quality mature ash model (20m), dual-mesh (trunk + foliage canopy). Centered base. | **KEEP** |
| `public/world/assets/tree_roadside.glb` | 855,532 B (~855 KB) | C (Hero Asset) | Yes (`WorldAssetLibrary.ts`, `Composition.ts`) | High-quality roadside mature tree (15m) with asymmetric overhang. Centered base. | **KEEP** |
| `public/world/assets/tree_pine_tall.glb` | 830,028 B (~830 KB) | C (Hero Asset) | Yes (`WorldAssetLibrary.ts`, `Composition.ts`) | High-quality tall mountain pine (26m), evergreen foliage. Centered base. | **KEEP** |
| `public/world/assets/shrub_dense.glb` | 244,508 B (~244 KB) | C (Ground Cover) | Yes (`WorldAssetLibrary.ts`, `WorldChunk.ts`) | Multi-shrub pack (4 variants). Variant 0 isolated, centered, and scaled to 2.4m height. | **KEEP (Isolated Variant)** |
| `public/world/assets/plant_weed.glb` | 338,468 B (~338 KB) | C (Ground Cover) | Yes (`WorldAssetLibrary.ts`, `WorldChunk.ts`) | Multi-weed pack (5 variants spanning 34m). Variant 2 isolated, centered to (0,0,0) and scaled to 1.2m height. Eliminates the 34m road obstruction defect. | **KEEP (Isolated Variant)** |
| `public/world/assets/grass_field_cluster.glb` | 279,400 B (~279 KB) | C (Ground Cover) | Yes (`WorldAssetLibrary.ts`, `WorldChunk.ts`) | Multi-clump pack (5 variants). Variant 1 isolated, centered, and scaled to 1.1m height. | **KEEP (Isolated Variant)** |
| `public/world/assets/grass_tuft_near.glb` | 62,536 B (~62 KB) | C (Ground Cover) | Yes (`WorldAssetLibrary.ts`, `WorldChunk.ts`) | 21-mesh tuft pack. Variant 10 isolated, centered, and scaled to 0.65m height. Eliminates 21 separate draw calls per tuft. | **KEEP (Isolated Variant)** |
| `public/world/assets/rock_boulder.glb` | 2,940,528 B (~2.9 MB) | F (Unoptimized Asset) | No (Disabled at runtime) | Single boulder model containing 66,122 triangles and 2.9 MB payload. Disabled in `WorldAssetLibrary.ts`. Replaced by procedural low-poly boulder fallback (80 triangles) to protect frame pacing. | **DISABLED (Retain on disk / Do not delete)** |
| `public/world/assets/License.txt` | 2,043 B (~2 KB) | Legal Provenance | Yes (`tests/world-assets.test.ts`) | Shipped CC0 license and attribution manifest for all world assets. | **KEEP** |

---

## 2. Legacy / Reference Assets (`public/world/kenney/`)

| File / Path | Size | Category | Referenced By Runtime | Reason / Status | Action |
|---|---|---|---|---|
| `public/world/kenney/tree_detailed.glb` | 31,412 B (~31 KB) | F (Replaced Asset) | No (Test fixture only in `tests/world-assets.test.ts`) | Legacy low-poly Kenney tree from Pass 0 prototype. Retained as test fixture. | **KEEP (Test Fixture)** |
| `public/world/kenney/tree_pineTallB_detailed.glb` | 12,632 B (~12 KB) | F (Replaced Asset) | No (Test fixture only in `tests/world-assets.test.ts`) | Legacy low-poly Kenney pine from Pass 0 prototype. Retained as test fixture. | **KEEP (Test Fixture)** |
| `public/world/kenney/rock_largeC.glb` | 7,004 B (~7 KB) | F (Replaced Asset) | No (Test fixture only in `tests/world-assets.test.ts`) | Legacy low-poly Kenney rock from Pass 0 prototype. Retained as test fixture. | **KEEP (Test Fixture)** |
| `public/world/kenney/plant_bushDetailed.glb` | 10,172 B (~10 KB) | F (Replaced Asset) | No (Test fixture only in `tests/world-assets.test.ts`) | Legacy low-poly Kenney bush from Pass 0 prototype. Retained as test fixture. | **KEEP (Test Fixture)** |
| `public/world/kenney/grass_leafs.glb` | 4,608 B (~4 KB) | F (Replaced Asset) | No (Test fixture only in `tests/world-assets.test.ts`) | Legacy low-poly Kenney grass card from Pass 0 prototype. Retained as test fixture. | **KEEP (Test Fixture)** |
| `public/world/kenney/License.txt` | 611 B (~611 B) | Legal Provenance | Yes (`tests/world-assets.test.ts`) | Shipped CC0 license for Kenney Nature Kit. | **KEEP** |

---

## 3. Discovered Culprits for Visual and Performance Defects

1. **The "Giant Yellow/Beige Paper Sheets" Defect**:
   - `plant_weed.glb` is a 5-variant artist catalog where meshes are placed in a horizontal line spanning **33.97 meters** across ($x \in [-1.37\text{m}, +32.60\text{m}]$).
   - In previous passes, `WorldAssetLibrary.load()` loaded all 5 meshes simultaneously without horizontal centering ($X, Z$).
   - When placed near the road and assigned a random rotation angle, the 34-meter long arm swung directly across highway lanes.
   - Under autumn tinting, this appeared as giant yellow flat cards floating across the highway.
   - **Resolution**: Isolated a single compact variant (Variant 2), horizontally centered at $(0, 0, 0)$ with base grounded at $y = 0$.

2. **21-Draw-Call Expansion in Near Grass**:
   - `grass_tuft_near.glb` contained 21 separate meshes. Loading all 21 into instanced batches generated 21 separate batches and draw calls per chunk.
   - **Resolution**: Isolated single tuft (Variant 10, 140 triangles), reducing near grass draw calls by 95%.

3. **66k Triangle Boulder**:
   - `rock_boulder.glb` has 66,122 triangles for a single rock. Disabled at runtime in favor of procedural low-poly boulder fallback (80 triangles).
