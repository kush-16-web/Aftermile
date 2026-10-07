# Aftermile — Asset Audit & Cleanup Report

**Audit Scope:** Environment, vegetation, and world asset directories (`public/world/assets/`, `public/world/kenney/`).  
**Audit Date:** 2026-10-07  
**Pass:** Natural World Quality Pass (Pass 2)

---

## 1. Active Runtime Assets (`public/world/assets/`)

| File / Path | Size | Category | Referenced By Runtime | Replacement | Reason / Status | Action |
|---|---|---|---|---|---|---|
| `public/world/assets/tree_oak_mature.glb` | 1,101,464 B (~1.1 MB) | C (Optimized Runtime Asset) | Yes (`WorldAssetLibrary.ts`, `Composition.ts`) | None (Current Active Hero) | High-quality mature oak model (22m), AmbientCG CC0 bark, multi-tier canopy. | **KEEP** |
| `public/world/assets/tree_ash_mature.glb` | 1,030,944 B (~1.0 MB) | C (Optimized Runtime Asset) | Yes (`WorldAssetLibrary.ts`, `Composition.ts`) | None (Current Active Hero) | High-quality mature ash model (20m), AmbientCG CC0 bark. | **KEEP** |
| `public/world/assets/tree_roadside.glb` | 855,532 B (~855 KB) | C (Optimized Runtime Asset) | Yes (`WorldAssetLibrary.ts`, `Composition.ts`) | None (Current Active Hero) | High-quality roadside mature tree (15m) with asymmetric overhang. | **KEEP** |
| `public/world/assets/tree_pine_tall.glb` | 830,028 B (~830 KB) | C (Optimized Runtime Asset) | Yes (`WorldAssetLibrary.ts`, `Composition.ts`) | None (Current Active Hero) | High-quality tall mountain pine (26m), AmbientCG CC0 bark. | **KEEP** |
| `public/world/assets/shrub_dense.glb` | 244,508 B (~244 KB) | C (Optimized Runtime Asset) | Yes (`WorldAssetLibrary.ts`, `WorldChunk.ts`) | None | Poly Haven CC0 dense shrub undergrowth model. | **KEEP** |
| `public/world/assets/plant_weed.glb` | 338,468 B (~338 KB) | C (Optimized Runtime Asset) | Yes (`WorldAssetLibrary.ts`, `WorldChunk.ts`) | None | Poly Haven CC0 broadleaf roadside weed model. | **KEEP** |
| `public/world/assets/grass_field_cluster.glb` | 279,400 B (~279 KB) | C (Optimized Runtime Asset) | Yes (`WorldAssetLibrary.ts`, `WorldChunk.ts`) | None | Poly Haven CC0 meadow grass cluster model. | **KEEP** |
| `public/world/assets/grass_tuft_near.glb` | 62,536 B (~62 KB) | C (Optimized Runtime Asset) | Yes (`WorldAssetLibrary.ts`, `WorldChunk.ts`) | None | Poly Haven CC0 near-road grass tuft model. | **KEEP** |
| `public/world/assets/rock_boulder.glb` | 2,940,528 B (~2.9 MB) | C (Optimized Runtime Asset) | Yes (`WorldAssetLibrary.ts`, `WorldChunk.ts`) | None | Poly Haven CC0 weathered granite boulder model. | **KEEP** |
| `public/world/assets/License.txt` | 2,043 B (~2 KB) | Legal Provenance | Yes (`tests/world-assets.test.ts`) | None | Shipped CC0 license and attribution manifest for all world assets. | **KEEP** |

---

## 2. Legacy / Reference Assets (`public/world/kenney/`)

| File / Path | Size | Category | Referenced By Runtime | Replacement | Reason / Status | Action |
|---|---|---|---|---|---|---|
| `public/world/kenney/tree_detailed.glb` | 31,412 B (~31 KB) | F (Replaced Asset) | No (Test fixture only in `tests/world-assets.test.ts`) | `tree_oak_mature.glb` | Legacy low-poly Kenney tree from Pass 0 prototype. Retained as test fixture. | **VERIFY / KEEP (Test Fixture)** |
| `public/world/kenney/tree_pineTallB_detailed.glb` | 12,632 B (~12 KB) | F (Replaced Asset) | No (Test fixture only in `tests/world-assets.test.ts`) | `tree_pine_tall.glb` | Legacy low-poly Kenney pine from Pass 0 prototype. Retained as test fixture. | **VERIFY / KEEP (Test Fixture)** |
| `public/world/kenney/rock_largeC.glb` | 7,004 B (~7 KB) | F (Replaced Asset) | No (Test fixture only in `tests/world-assets.test.ts`) | `rock_boulder.glb` | Legacy low-poly Kenney rock from Pass 0 prototype. Retained as test fixture. | **VERIFY / KEEP (Test Fixture)** |
| `public/world/kenney/plant_bushDetailed.glb` | 10,172 B (~10 KB) | F (Replaced Asset) | No (Test fixture only in `tests/world-assets.test.ts`) | `shrub_dense.glb` | Legacy low-poly Kenney bush from Pass 0 prototype. Retained as test fixture. | **VERIFY / KEEP (Test Fixture)** |
| `public/world/kenney/grass_leafs.glb` | 4,608 B (~4 KB) | F (Replaced Asset) | No (Test fixture only in `tests/world-assets.test.ts`) | `grass_tuft_near.glb` | Legacy low-poly Kenney grass card from Pass 0 prototype. Retained as test fixture. | **VERIFY / KEEP (Test Fixture)** |
| `public/world/kenney/License.txt` | 611 B (~611 B) | Legal Provenance | Yes (`tests/world-assets.test.ts`) | None | Shipped CC0 license for Kenney Nature Kit. | **KEEP** |

---

## 3. Other Non-World Utilities in `public/`

| File / Path | Size | Category | Referenced By Runtime | Replacement | Reason / Status | Action |
|---|---|---|---|---|---|---|
| `public/convert_bmw.html` | 19,606 B (~19 KB) | H (Conversion Utility) | No (Local dev tool) | None | Standalone browser conversion utility for BMW M4 mesh processing. | **VERIFY / KEEP** |

---

## 4. Summary & Recommendation

- **Total active world assets:** 9 GLB files in `public/world/assets/` totaling ~7.7 MB.
- **Unreferenced legacy assets:** 5 small low-poly GLBs in `public/world/kenney/` totaling 65.8 KB (kept because automated regression test `tests/world-assets.test.ts` validates them as baseline check).
- **No unapproved deletions were performed.**
