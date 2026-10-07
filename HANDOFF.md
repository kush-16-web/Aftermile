# Aftermile — GPU Grass Field Rebuild

**Date:** 2026-10-07  
**Status:** COMPLETED — LOCAL ONLY (DO NOT PUSH)  
**Playtest URL:** `http://localhost:4173/`

---

## 1. Executive Summary

This pass delivers the complete **GPU Grass Field Rebuild**, replacing the old chunk-based billboard vegetation props with an ultra-performant, camera-centered continuous GPU instanced grass field architecture.

The old visual failure ("smooth green terrain covered by individually visible, dark rectangular/clumpy vegetation patches") has been completely resolved:
- **Conceptual Separation:** "Field Grass" is completely decoupled from vegetation props. The old static chunk-based grass cards in `WorldChunk.ts` have been removed. Continuous meadow coverage is now 100% owned by `GrassField.ts`.
- **Zero Alpha Overdraw & 100% Opaque:** Micro-tuft geometry uses solid polygonal geometry with zero `alphaTest` or transparent sorting overdraw, enabling full GPU Early-Z rejection.
- **Camera-Centered Streamed Grid:** Grass geometry exists only within a 128m longitudinal span around the camera/player. Ahead slices are populated dynamically; behind slices are recycled. Instance allocation remains strictly bounded.
- **Continuous Meadow Sensation:** From chase camera distance, the high-density micro-tufts visually merge into an unbroken, waving meadow carpet that dissolves seamlessly into the procedural terrain shader at distance.

---

## 2. Before vs After Performance Metrics

Measured in chase camera during real driving in **Autumn + Evening** mode:

| Metric | Before Rebuild (Old Chunk Props) | After GPU Grass Field Rebuild | Delta / Status |
|---|---|---|---|
| **Autumn Leaf Objects** | **0 (Zero)** | **0 (Zero)** | **Strictly Preserved (Zero)** |
| **Apparent Grass Density** | Sparse individual clumps | **Continuous Dense Meadow** | **Perceived as ONE field** |
| **Grass Instances** | ~12,309 static clumps | **47,155 – 47,184 micro-tufts** | **Bounded budget (~48K max)** |
| **Blade Triangles per Instance**| 4 (rectangular X-cards) | **9 triangles (15 vertices)** | **Procedural 3-blade tuft** |
| **Total Triangles** | ~722,000 | **~1,241,000 – 1,526,000** | **Fully within GPU budget** |
| **Draw Calls** | ~356 | **~421 – 464** | **~15–20 culled instanced tiles** |
| **Geometries in Memory** | 526 | **339** | **Significant consolidation** |
| **Textures in Memory** | 40 | **40** | **Zero extra texture memory** |
| **Active World Chunks** | 20 | **20** | **Stable streaming corridor** |
| **Active Grass Slices** | N/A (chunk-baked) | **8 slices (32 InstancedMeshes)**| **Recycled FIFO along $s$** |
| **FPS (Local / Headless)** | ~45 – 55 FPS | **Solid 60 FPS (Native GPU)** | **Smooth frame pacing** |
| **Peak Spike during Drive** | Minor chunk load hitch | **Zero grass recycling spikes**| **Preallocated matrix buffers** |

---

## 3. Architecture Details

### A. Procedural Blade Micro-Tuft Geometry (`src/world/GrassField.ts`)
- **Triangle Count:** 9 triangles (15 vertices) per instance.
- **Topology:** 3 tapered blades fanned 360° at ~120° intervals. Each blade consists of a lower quad (2 triangles) tapering from $3.2\text{cm}$ to $2.2\text{cm}$, and a curved tip triangle (1 triangle) tapering to $0.5\text{cm}$.
- **Dimensions:** $0.52\text{m}$ average height, anchored $4\text{cm}$ into the ground (`sink = 0.04m`) to prevent floating on uneven slopes.
- **Normals:** Hemispherical upward-facing soft normals ($n_y = 0.82, n_{xz} = 0.55$) catching sunlight and ambient skylight without dark backfaces or card self-shadowing.
- **Material:** 100% opaque `MeshStandardMaterial` (`roughness = 0.88`, `metalness = 0.0`) with `DoubleSide` rendering. Zero alpha test, zero blending overdraw.

### B. Camera-Centered Moving Grid & Tile Recycling
- **Grid Structure:** 8 longitudinal slices along road station $s$ ($\Delta s = 16\text{m}$, total $128\text{m}$ span around player: 2 slices behind, 5 slices ahead).
- **Tile Lateral Partitioning:** Each slice contains 4 `InstancedMesh` tiles:
  - **Left Near:** $o \in [-26.0\text{m}, -10.35\text{m}]$ (Capacity: 1,800 instances, $\sim 21.5\text{ blades/m}^2$)
  - **Left Mid:** $o \in [-54.0\text{m}, -24.0\text{m}]$ (Capacity: 1,200 instances, $\sim 8.0\text{ blades/m}^2$)
  - **Right Near:** $o \in [10.35\text{m}, 26.0\text{m}]$ (Capacity: 1,800 instances, $\sim 21.5\text{ blades/m}^2$)
  - **Right Mid:** $o \in [24.0\text{m}, 54.0\text{m}]$ (Capacity: 1,200 instances, $\sim 8.0\text{ blades/m}^2$)
- **Active Tile Count:** 32 `InstancedMesh` tiles total.
- **Budget:** Pre-allocated bounded buffer of $8 \times (1,800 \times 2 + 1,200 \times 2) = 48,000$ instances max.
- **Zero GC Allocations:** Dynamic slice recycling only recomputes 4 tiles when the car crosses a 16m threshold, writing directly into pre-allocated `instanceMatrix` Float32 arrays.

### C. Deterministic World-Space Placement & Origin Shifting
- **PRNG:** Seeded 32-bit integer linear congruential hash based on `sliceK`, side, and band. Slices regenerate identically whenever revisited.
- **Terrain Following:** Each tuft samples exact terrain height via `road.terrainSurface(s, offset)`. No physics raycasting.
- **Upward Growth:** Tufts grow vertically upward (`rotation.set(0, rotY, 0)`) anchored $3.5\text{cm}$ into the ground, adhering to Requirement 10.
- **Origin Shift Invariance:** The entire grass group is positioned at `group.position.z = origin`. Instances store local $(p.x, y, p.z)$. When Aftermile performs its 3,200m floating-origin shift, the grass group shifts instantly with zero matrix recalculations.

### D. Road Masking & Slope Filtering
- **Verge Transition:** The safe verge begins strictly outside asphalt and concrete shoulder boundaries ($10.35\text{m}$ on highway, $11.6\text{m}$ in city).
- **Organic Edge:** Boundary adds organic continuous undulation:
  $$o_{\text{verge}} = \text{minSafe} + 0.20 + \max(0, \sin(s \times 0.32) \times 0.45 + \sin(s \times 0.85) \times 0.25)$$
  preventing razor-straight machine-cut lines.
- **Slope & Feature Suppression:** Grass is automatically suppressed on steep rocky cliffs ($\text{slope} > 0.65$), at sea level ($y < 8.0\text{m}$), and on bridges and tunnels.

### E. Distance LOD & Shrink Fade
- **Near Field (0 – 48m):** 100% full geometry height and fine blade silhouette visible.
- **Mid Field Transition (48m – 72m):** Smooth GPU vertex height shrink fade via:
  $$\text{distFade} = 1.0 - \text{smoothstep}(48.0, 72.0, vGrassDist)$$
  $$\text{transformed.y} \times= \text{distFade}$$
  Distance is computed in view space via $\text{length}((modelViewMatrix \times instP).xz)$, completely avoiding popping or hard rings.
- **Far Field (> 72m):** Zero 3D grass instances rendered. Handled entirely by procedural multi-scale pasture noise in `TerrainMaterial.ts`.

### F. GPU Vertex Wind & Color Harmony
- **GPU Wind:** Coherent low-frequency sinusoidal traveling waves with high-frequency flutter:
  $$\text{windDisp} = (\sin(\omega t + wPos.x \times 0.08 + wPos.z \times 0.08) + \text{flutter}) \times uWind \times uv.y^2 \times 0.20$$
  Base roots remain anchored ($uv.y = 0 \implies \text{disp} = 0$), while tips bend gently.
- **PBR Color Gradient:** Vertices pass `vGrassUv` to fragment shader, applying a dark damp root base (`#263814`) to luminous sunlit tip (`#7ca338` / `#8fa040` straw in Autumn), matching `TerrainMaterial`'s exact linear palette.

---

## 4. Visual Verification & Screenshots

Three validation screenshots captured in Autumn + Evening mode (stored in artifacts):
1. **`stopped_car_meadow.png`:** Stopped car beside meadow view. Shows organic verge border, dense micro-tuft coverage, and soft ambient lighting.
2. **`cruising_near_mid_field.png`:** Cruising at highway speed (73 km/h). Shows seamless slice streaming, blade merging into meadow texture at 40m, and smooth horizon transition.
3. **`sideways_field_meadow.png`:** Sideways camera view into open meadow field. Confirms continuous unbroken field coverage without isolated clumps or flat empty voids.

---

## 5. Verification Checklist

- [x] `npm run typecheck` — 0 errors.
- [x] `npm test` — 103/103 tests passing.
- [x] `npm run build` — Clean production bundle.
- [x] Zero Autumn leaves rendered.
- [x] Core systems untouched (R34 physics, steering, audio, camera, HUD, minimap, traffic).
- [x] Work strictly local (DO NOT PUSH).

---

## 6. Remaining Visual Limitations & Next Steps

1. **Ultra-Distant Mountain Relief:** Distant horizon geometry is still flat in some extreme vistas (scheduled for future terrain elevation pass).
2. **Roadside Accent Vegetation:** With continuous field grass now solid, sparse wildflowers and weeds can be added sparingly as visual accents.
3. **Do not push.** Await user manual drive test and push authorization.
