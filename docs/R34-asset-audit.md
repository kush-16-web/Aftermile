# Nissan R34 GLB technical audit

Source: `r34-source/source/brians_r34_from_2_fast_2_furious.glb` (16,250,684 bytes, SHA-256 `2fd291ab05364064d1dbcad0ae3aed96a2418625ef445cf00b44389c281db467`). Analysis reads glTF JSON, embedded buffers, accessors, transforms, indices, and embedded PNG dimensions. Coordinates below are **final glTF scene coordinates after all node transforms**, before any application scale/rotation; rounded to five decimals. The original scene units are arbitrary, not reliable physical metres.

## Inventory and cost

| Item | Measured value |
|---|---:|
| Nodes / mesh nodes / distinct meshes / primitives | 3,566 / 766 / 766 / 766 |
| Indexed triangles / submitted primitive vertices | 266,060 / 216,002 |
| Materials / texture entries / unique embedded images / samplers | 37 / 57 / 28 / 1 |
| Animations / skins / morph targets | 0 / 0 / 0 |
| GLB binary chunk / embedded compressed PNG bytes | 15,200,200 / 2,528,440 bytes |
| Sum of accessor payloads | 12,671,678 bytes |
| Approximate decoded image GPU allocation, all images RGBA8 | 18.94 MiB without mips, 25.26 MiB with full mip chain |

RGBA8 is an **upper-bound-style budgeting assumption**, not a GPU profiler result: RGB and single-channel textures may use smaller formats, loader caching/colorspace may create more than one copy of a source image, and drivers add overhead. Two images are 1024² (4 MiB each RGBA8), eleven are 512² or similar; the rest are smaller. The PNG data is only ~2.53 MB on disk. All 37 materials are referenced. Texture entries repeat image sources heavily: images 0 and 1 are each referenced by 11 texture entries, image 2 by four, images 17, 19, and 21 by three each. The lamp emissive materials 27/28/29 use texture entries 48/49/50 respectively, **all pointing to image 21**, a 512² RGB atlas with two orange/red luminous rings.

Most of the hierarchy is identity wrappers: 3,444 nodes contain no explicit transform; 122 have TRS. 645 of 766 primitives carry POSITION, NORMAL and four UV sets (`TEXCOORD_0` through `_3`), chiefly tiny wheel pieces. There are no scene objects outside the car bounds indicative of a studio floor. Mesh names such as `Object_4184` are neutral; parent group and spatial position matter.

Largest material/group triangle contributions (not expendable merely due to size): interior group 60,791; paint 55,453; engine 44,569; coloured trim 42,531 total; four wheel groups 24,300; lamp group 12,529; base 11,126. Interior and engine are real geometry, apparently under glass/hood. No alternate LOD group is supplied despite the `lodA` names.

## Coordinates, orientation, pivots

Global bounds: minimum **(−0.07770, −0.00160, −0.18680)**, maximum **(+0.07770, +0.10820, +0.19380)**, dimensions **(0.15540, 0.10980, 0.38060)**. +Y is up and **+Z is forward** in the final GLB scene. The top `Sketchfab_model` has −90° X rotation and scale approximately 8.175114. An intervening `FINAL_MODEL_RF.fbx_1` has +90° X and 0.01 scale; additional ±90° X wrappers cancel in the final scene. Preserve/evaluate the complete world matrix rather than using a single root scale. Rotating the normalized car by π about Y makes −Z forward. If fitting the 0.3806-long authored model to an independently chosen 4.6 m body length, the implied multiplier is ~12.09, but that physical length is a project choice.

| Part / node ID | World pivot (x, y, z) | Geometric bounds (x range, y range, z range) | Triangles |
|---|---|---|---:|
| Front L `3DWheel Front L_6` / 1015 | (+0.06041, 0.02549, +0.11404) | +.0474…+.0733, −.0014…+.0524, +.0875…+.1406 | 6,075 |
| Front R `3DWheel Front R_639` / 1933 | (−0.06041, 0.02549, +0.11404) | −.0733…−.0474, −.0014…+.0524, +.0875…+.1406 | 6,075 |
| Rear L `3DWheel Rear L_1272` / 2850 | (+0.06082, 0.02526, −0.10415) | +.0478…+.0737, −.0016…+.0522, −.1307…−.0776 | 6,075 |
| Rear R `3DWheel Rear R_1905` / 3494 | (−0.06082, 0.02526, −0.10415) | −.0737…−.0478, −.0016…+.0522, −.1307…−.0776 | 6,075 |

The four wheels are separate parent subtrees under `Wheel1A_3D_00_5` (node 3495); do not infer membership solely from the hundreds of `polySurface…Wheel` wrapper names. Left wheel group local rotation is +2° Z (`quaternion z=.01745245, w=.99984771`). Right wheel group is mirrored by near-180° Y plus camber. In final scene, the left wheel local spin axis (world local X basis normalized) is approximately **(+0.99939,+0.03490,0)** and right **(−0.99939,+0.03490,0)**: 2° authored camber, no measurable toe. Wheel groups have 58, 285, 284 and 11 mesh primitives respectively due to wrapper fragmentation, yet exactly equal triangle counts. Preserve pivots and mirrored orientation when extracting straight-spin meshes; rotate local wheel geometry around its local X and apply the original camber in a parent wrapper.

Four caliper sibling subtrees are independent from wheels and share their corresponding pivot positions: front 80/161 and rear 242/323. Each has 26 meshes and 250 triangles (materials 0–2), with narrow bounds around the inside rim. Keep them fixed as wheels spin; do not classify all `Wheel…` names as moving parts. Braking disc/rim details live inside each wheel group, while caliper bodies/badges are separate.

## Lamp mesh and lens mapping

This mapping uses connected components after welding coincident POSITION values across UV seams (rounding world positions to 1e−7). These are measured geometric regions, **not** neutral node-name guesses. Image 21 itself visibly contains red/orange rings and no obvious white reverse lamp patch. Some material 27 components have UVs outside [0,1] and wrap; retain UVs and textures unchanged if repacking.

| Region | Node/material | Position in original +Z-forward scene | Triangle component |
|---|---|---|---:|
| Rear outer red circular lights, left/right | `Object_4184` 3532 / emissive 27 | x ±.05373, y .06756, z −.17066; x half-width .00805 | 756 per side |
| Rear inner circular lights, left/right | 3532 / emissive 27 | x ±.03784, y .06593, z −.17489; x half-width .00599 | 648 per side |
| Front large headlamp assembly, left/right | 3532 / emissive 27 | x ±.04704, y .05165, z +.17169; bounds x .03096… .06312 by sign | 1,041 L / 815 R |
| Front secondary lamp surfaces | `Object_4184.001` 3533 / emissive 28 | x ±.03935 near z +.17534, ±.05024 near z +.17056, ±.05845 near z +.16454 | 1,759 total in 6 components |
| Front small bulbs | `Object_4184.002` 3534 / emissive 29 | x ±.05006, ±.05874, ±.03906; z +.164…+.173 | 1,074 total in 12 components |
| Rear red clear lens over rings | `Object_4175` 3553 / `red_glass` 35 | outer x ±.05373, inner x ±.03785, z about −.171/−.175 | 972 outer + 480 inner tris **per side** |
| Rear amber/clear inner lens | `Object_4171` 3549 / `ambar_glass` 33 | x ±.03782, y .06590, z −.17499 | 360 per side |
| White/clear bumper reverse lens, **+X side** | `Object_4173` 3551 / regular transparent window material 34 | bounds x **+.01406…+.02766**, y .04236… .04723, z **−.18286…−.17760**; center (+.02086,.04480,−.18023) | 98 |
| Red bumper fog lens, **−X side** | `Object_4175` 3553 / `red_glass` 35 | mirrored x **−.02766…−.01406**, same y/z; center (−.02086,.04480,−.18023) | 98 |
| Underlying bumper lamp patches | 3532 / emissive 27 | centers x ±.02101, y .04480, z −.18003 | 18 each |

The **reverse/fog conclusion** follows the symmetric lamp geometry but asymmetric covering materials: the +X bumper light has clear window material 34, while the −X mirrored light has red glass 35. Do not treat material 27 or 35 as uniformly brake/red: 27 also contains front headlights, side details, rear plate region and bumper patches; 35 includes four rear circular lenses and the −X fog lens. For brake lights, spatially split the two **outer** red rings (and possibly inner rings if desired by art direction) and animate emissive intensity on those subsets. For reverse, isolate the +X clear bumper region and matching underlying +X material-27 patch, keeping the −X red fog lens separate. A broad x-only or z-only threshold will accidentally catch multiple roles; classify by connected component/bounding box and material.

Other shared emissive components include front marker x ±.05107,y .03660,z +.17940; a rear center high lamp near (0,.07693,−.17417); and thin side/underbody strips. The clear regular window mesh 3551 also contains windscreen, side/rear glazing, front headlamp covers, and the +X reverse lens, so changing that entire material changes the cabin and headlamps.

## Glass and interior

Interior `r:Interior_Geo_lodA…` node 3527 has three primitive children, 60,791 tris (including 56,769 main interior and 2,226 seat); an additional interior tilling node 3530 adds 1,400. Exterior glass/lamps are split across material 33 `ambar_glass` 954 tris, material 34 transparent window 2,160 tris, material 35 red rear lens 3,110 tris, and material 36 inner window 900 tris. Material 34 is alpha BLEND at base alpha ~0.401 and green tint; 35 is alpha BLEND red at alpha 0.25 and `KHR_materials_transmission` factor 1. These transparent layers can incur sorting/overdraw, especially rear lights. Do not discard them blindly because material 34 also supplies the reverse lens and headlamp covers.

## Measured, conservative optimization guidance

1. Merge coplanar/small wheel fragments by **wheel role and material** after baking each leaf transform relative to its wheel pivot. Material 3 alone spans 596 primitives and 15,879 triangles, so this is chiefly a draw-call saving; preserve normals, UVs, indices and front/back sidedness. Keep each wheel independently animated, calipers fixed. A global merge would lose wheel motion.
2. Collapse identity wrappers and deduplicate texture entries that share image/sampler/colorspace, where the runtime permits. There are 3,444 identity nodes and 57 entries to 28 images. Preserve sRGB versus linear usage when deduplicating.
3. Retain the UV attributes actually referenced by each material/texture. Many tiny wheel parts carry four UV sets, but verify each material's `texCoord` before stripping; all observed glTF texture slots default to UV0 unless explicit `texCoord` is found. This can reduce vertex traffic without modifying appearance.
4. Treat engine (44,569 triangles) and interior (~62k triangles) as **possible distance LOD candidates**, because they are visually occluded from common exterior views, but measure camera views before hiding. Their geometry is within the car bounds, not proven redundant/duplicate. Likewise paint and coloured trim are dense but visible. No evidence supports deleting a studio floor or duplicate full car mesh from this GLB.
5. Region-specific lamp emissive controls should operate on duplicated/split material or geometry subsets, not the entire source emissive atlas. Preserve the original atlas and UVs; add light glow as a separate effect if needed.

Companion machine-readable [`mesh_rows.json`](mesh_rows.json) lists every transformed primitive and bounds; `analysis.txt` and `components.txt` contain grouped measurements. All analysis files were created separately from the source and application project.
