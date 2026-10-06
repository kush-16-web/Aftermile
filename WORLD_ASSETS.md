# World asset manifest

This manifest covers the release-safe runtime assets used by the World Foundation & Visual Rebuild pass. The runtime keeps the procedural road, terrain, and collision authoritative; these files provide instanced visual detail and fall back to procedural primitives if they fail to load.

## 1. High-Fidelity Mature Tree & Foliage Library (`public/world/assets/`)

### Tree Models (EZ-Tree + AmbientCG CC0 Bark)
- **Creators:** Daniel Greenheck (EZ-Tree architecture & leaf textures), AmbientCG / Lennart Demes (CC0 Bark PBR maps)
- **Source:** https://github.com/dgreenheck/ez-tree, https://ambientcg.com
- **Licenses:** MIT License (EZ-Tree), Creative Commons CC0 1.0 Universal (AmbientCG bark textures)
- **License References:** `public/world/assets/License.txt`, https://creativecommons.org/publicdomain/zero/1.0/
- **Runtime use:** Instanced mature roadside trees, isolated hero landscape landmarks, clustered groves, and distant field-edge tree lines.
- **Optimization:** Generated using recursive 3D branching with smooth junction capping and multi-planar leaf billboarding. Normalized to ground pivot ($y = 0$). Exported as compact binary `.glb` files with shared material definitions.
- **LOD & Performance:** Trees render up to 2400 m with instance distance culling; shadow casting is budgeted within 750 m. Autumn mode shifts leaves dynamically in shader via stable world-space pseudo-random palettes (amber, gold, russet, crimson, olive).

### Photogrammetric Foliage & Ground Cover (Poly Haven CC0)
- **Creators:** Rico Cilliers, Rob Tuytel, Poly Haven
- **Source:** https://polyhaven.com/models
- **Licenses:** Creative Commons CC0 1.0 Universal (Public Domain Dedication)
- **License Reference:** `public/world/assets/License.txt`, https://creativecommons.org/publicdomain/zero/1.0/
- **Runtime use:** 
  - `grass_tuft_near.glb`: Roadside verge and close-range 3D grass detail (0–30 m).
  - `grass_field_cluster.glb`: Continuous open meadow grassland cover extending into distant fields (20–120 m).
  - `shrub_dense.glb`: Natural vertical undergrowth beneath mature tree groups and field boundaries.
  - `plant_weed.glb`: Roadside wildflower and tall weed clusters.
  - `rock_boulder.glb`: Geological formations on mountains and coastal outcrops.
- **Optimization:** Cleaned and indexed geometries, normalized ground pivots, stripped heavy redundant raw textures in favor of lightweight shared PBR shaders with custom vertex wind displacement, seasonal autumn tinting, and distance-based alpha/geometry fading.

| Runtime file | Asset Name / Creator | License | GLB size | Vertices | Triangles | Target Scale | Usage |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `public/world/assets/tree_oak_mature.glb` | Mature Oak (EZ-Tree / AmbientCG) | MIT / CC0 | 1,101,464 B | 30,104 | 12,400 | 22.0 m height, 18.8 m canopy | Hero solitary meadow tree, clustered groves |
| `public/world/assets/tree_ash_mature.glb` | Mature Ash (EZ-Tree / AmbientCG) | MIT / CC0 | 1,030,944 B | 28,098 | 11,600 | 20.0 m height, 15.0 m canopy | Countryside groves, field edge tree lines |
| `public/world/assets/tree_roadside.glb` | Roadside Tree (EZ-Tree / AmbientCG) | MIT / CC0 | 855,532 B | 24,060 | 9,800 | 15.0 m height, 10.2 m canopy | Roadside canopy overhangs, shoulder clusters |
| `public/world/assets/tree_pine_tall.glb` | Tall Conifer (EZ-Tree / AmbientCG) | MIT / CC0 | 830,028 B | 22,217 | 8,900 | 26.0 m height, 15.9 m canopy | Mountain ridges, coastal pine landmarks |
| `public/world/assets/shrub_dense.glb` | Shrub 03 (Rico Cilliers / Poly Haven) | CC0 1.0 | 244,508 B | 5,905 | 2,840 | 2.4 m height | Tree base undergrowth, woodland edges |
| `public/world/assets/plant_weed.glb` | Weed Plant 02 (Tuytel & Cilliers / Poly Haven) | CC0 1.0 | 338,468 B | 7,956 | 3,920 | 1.2 m height | Roadside wild weeds and verge accents |
| `public/world/assets/grass_field_cluster.glb` | Grass Medium 02 (Poly Haven) | CC0 1.0 | 279,400 B | 7,031 | 3,450 | 1.1 m height | Open field grassland coverage (20–120 m) |
| `public/world/assets/grass_tuft_near.glb` | Grass Bermuda 01 (Poly Haven) | CC0 1.0 | 62,536 B | 841 | 420 | 0.65 m height | Near roadside verge 3D grass (0–30 m) |
| `public/world/assets/rock_boulder.glb` | Boulder 01 (Poly Haven) | CC0 1.0 | 2,940,528 B | 67,042 | 33,500 | 2.8 m height | Mountain cuts and coastal boulder outcrops |

---

## 2. Kenney Nature Kit 2.1 Reference Assets (`public/world/kenney/`)

- **Creator:** Kenney (www.kenney.nl)
- **Source:** https://kenney.nl/assets/nature-kit
- **License/reference:** Creative Commons Zero (CC0 1.0), as shipped in `public/world/kenney/License.txt`
- **Total size:** 65,828 B across 5 reference GLBs.
