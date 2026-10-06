# World asset manifest

This manifest covers the release-safe runtime assets used by the World Foundation pass. The runtime keeps the procedural road, terrain, and collision authoritative; these files are optional instanced visual detail and fall back to procedural primitives if they fail to load.

## Kenney Nature Kit 2.1

- **Creator:** Kenney (www.kenney.nl)
- **Source:** https://kenney.nl/assets/nature-kit
- **License/reference:** Creative Commons Zero (CC0 1.0), as shipped in `public/world/kenney/License.txt`; reference https://creativecommons.org/publicdomain/zero/1.0/
- **Runtime use:** roadside vegetation and rocks in streamed `WorldChunk` batches. No gameplay collision is derived from these meshes.
- **Optimization:** low-poly GLB meshes are loaded with `GLTFLoader`, normalized to a common ground pivot and mature target height, and reused as `THREE.InstancedMesh` rows. Materials are cloned once, set to high roughness/zero metalness, and shared by instances. No external texture files are required by these selected assets.
- **LOD:** the source meshes are already small stylized low-poly models. Near ground-cover GLBs shrink between 220–510 m and their chunk batches are hidden beyond 560 m. Mid-field cards are only the procedural fallback when the grass GLB is unavailable; terrain color/noise supplies far fields. Tree batches are hidden beyond 2100 m, cast shadows only within 650 m, and retain Three.js frustum culling. Chunk streaming removes out-of-window instances. Distances are measured from the player; chunk-tier boundaries use chunk centers.
- **Modifications:** uniform target-height scale, ground-pivot normalization, neutral material palette, shared seasonal/wet/snow uniforms, restrained foliage wind, mature canopy scale, tree-local autumn emitters and deterministic settled-leaf silhouettes. Broadleaf colors vary per stable world-space anchor; snow accumulates by upward-facing normals. Source geometry is otherwise unchanged.

| Runtime file | Source role | GLB size | Vertices | Triangles | Usage |
| --- | --- | ---: | ---: | ---: | --- |
| `public/world/kenney/tree_detailed.glb` | broadleaf tree | 31,412 B | 2,274 | 402 | deterministic mature roadside tree instances, target 17 m |
| `public/world/kenney/tree_pineTallB_detailed.glb` | tall pine | 12,632 B | 544 | 166 | country/mountain/coastal pine instances, target 23 m |
| `public/world/kenney/rock_largeC.glb` | boulder | 7,004 B | 264 | 72 | coastal and mountain rock instances |
| `public/world/kenney/plant_bushDetailed.glb` | bush | 10,172 B | 232 | 104 | instanced near-road ground cover, target 2.8 m |
| `public/world/kenney/grass_leafs.glb` | grass clump | 4,608 B | 84 | 36 | instanced near-road ground cover, target 1.35 m |

The five selected runtime files total 65,828 bytes. The upstream license text is kept beside them so the attribution and rights statement travel with the build. No asset with unclear provenance, restrictive non-commercial terms, or redistribution limits is included.
