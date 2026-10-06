# Aftermile — Natural World Composition + Vegetation Quality Pass

Updated 2026-10-06. Read `PROJECT_CONTEXT.md` first. This checkpoint follows the scenic first push; the future infrastructure pass remains paused.

## Branch and checkpoint

- Branch: `main`, repository https://github.com/kush-16-web/Aftermile.git.
- Pushed implementation before this pass: `014e08ea489b019c56d78e1103bd3a355f6f035c`.
- Local vegetation checkpoint: `5b67f91` (`fix(world): reset hidden leaf emitters`, on top of `4799ec3`). The GitHub write connector temporarily rejected the push at its automatic usage limit; retry `git push origin main` or the connector tree/commit flow when it is available.
- Earlier pushed checkpoints: `9550bbbbc87cf7b4570b65fe885e08575273556f` (CC0 asset pipeline), `8bfa6ca37853ce4a93a202ca4a0adfabace410b6` (environment/time/sky).
- Site source checkpoint: `05be567e5b9910917181d28b4e1092f674aa1cfd`.
- Private Site deployment for this pass succeeded as version `appgprj_6ab7a4ca14e881918ebf5e7aece99939~appgver_cdb9081f819c8191a738f19a4b4e586c`, deployment `appgdep_6ac4bcc4f2548191a1dffca8e0d7a19a`.

## Completed and architecture

- **Themes/time:** `weather/Environment.ts` exposes Live, Autumn and Snowfall. `Settings.ts` stores the curated time selection and migrates legacy weather/time preferences. Fresh settings are Autumn Evening. Morning/Noon/Evening/Night map to 08:30/12:00/17:39/23:00.
- **Live:** underlying Open-Meteo condition mapping remains. City-local real time drives sky/stars; fetch failures stay in Live and report simulated conditions. Only Live stars transition continuously with real dusk/dawn. Autumn evening/night stars are curated; Snowfall cloud/fog/snow suppress stars.
- **Sky/lighting:** `Sky.ts` uses smooth 24-hour palette keyframes, warm horizon/magenta/violet dusk, subdued upper stars, and lower sun/ambient light at sunset/night. Water receives the actual sky colors.
- **Road:** `RouteProfile.ts` provides 4 km seeded horizontal sections, 1.2 km straights, alternating broad sweeps, independent 3 km C2 elevation sections and <4.5% tested grades. A finite opening climbs toward a ~6 km crest and descends; subsequent hills are seeded rather than a repeated short track. `Road` keeps the physical driving API intact.
- **Terrain/coast:** `Landscape.ts` provides coherent world-space hills, cuts/fill, a clear 12 m corridor and material layers. `terrainPoint/terrainSurface` keep near ground in the road frame and flatten distant cross-sections into world X/Z to prevent bend folds. `point/terrain` retain the car's physical frame. `coastPoint` is monotonic in world Z; terrain coastal samples and water share this boundary.
- **Coast journey:** shoreline is >8 km offshore at spawn, roughly 2 km distant around the first crest, and a few hundred metres away by route station 18 km. No camera-centered water plane under the inland opening. Beach/wet sand/shallow/deep sea and sky/haze reflection remain connected.
- **Composition:** `world/Composition.ts` now uses wider deterministic chapters, a 1.5 km open spawn, clean crest sightlines and layered shoulder/field-edge groves. Mature trees are 14–26 m with explicit canopy radius and leaf load; slope/height/road exclusions remain active. Weather does not regenerate geography.
- **Vegetation:** `WorldAssetLibrary.ts` keeps the five shipped Kenney CC0 GLBs but raises broadleaf/pine targets to mature scale and uses the textured grass asset for near cover. Settled leaf silhouettes are instanced beneath broadleaf canopies, while `Particles.ts` emits autumn leaves only from nearby tree-local sources and recycles them through wind, vehicle wake, gravity and settling.
- **Terrain:** `Landscape.ts` moves macro landforms farther from the highway, lengthens the noise scales and suppresses high-frequency relief in the inland opening. Near, middle and far tiers now read as meadow, rolling field and broad asymmetric ridge.
- **Performance:** `World.ts` prioritizes the drive corridor, builds four startup chunks then one per frame, recycles outside the stream window and upgrades asset fallbacks one at a time. Medium range stays <=23 chunks (~2.6 km ahead, 960 m behind). Near cover fades at 220–510 m; mid cards cover 300–1100 m; trees cull beyond 2100 m and cast shadows only within 650 m. Shared geometry/materials, instancing and frustum culling remain active.
- **Scope:** vehicle physics/steering/drift/braking/suspension/wheels, vehicle audio, tire VFX, cameras, Garage and HUD/navigation layout were not edited. `Game.ts` has only environment/time, coast and grove-particle wiring; `UI.ts` only changes Weather choices/presets. Infrastructure APIs/code remain dormant.

## Files changed

Environment checkpoint: `src/weather/Environment.ts`, `Weather.ts`, `src/sky/Sky.ts`, `src/systems/Settings.ts`, `src/ui/UI.ts`, minimal `src/game/Game.ts`, `tests/environment.test.ts`.

World checkpoint: `src/road/{RouteProfile,Road,Landscape}.ts`, `src/world/{Composition,World,WorldChunk,WorldAssetLibrary,Batch,Materials,TerrainMaterial,Water}.ts`, minimal `src/game/Game.ts`, tree-local leaves in `src/weather/Particles.ts`, `tests/{composition,world-foundation}.test.ts`.

Documentation: `README.md`, `WORLD_ASSETS.md`, durable world sections in `PROJECT_CONTEXT.md`, this handoff.

## Assets

The five Kenney Nature Kit 2.1 CC0 GLBs remain the verified runtime assets for trees, pine, boulders, bushes and grass. Total 65,828 bytes; no unverified external binary was added. Source: https://kenney.nl/assets/nature-kit. Shipped license: `public/world/kenney/License.txt`. Target heights, normalized ground pivots, shared seasonal/wind/wet/snow shaders, fallen-leaf geometry and LOD are recorded in `WORLD_ASSETS.md`.

## Validation

- `npm test`: **102 pass, 0 fail**.
- `npm run typecheck`: pass.
- `npm run build`: pass; existing Vite >500 kB shared Three.js chunk advisory remains.
- Relevant invariants: 100 km continuity/grade/curvature and terrain orientation; coast collision/water alignment; open spawn and crest exclusion; deterministic grove seams and layered offsets; bounded forward/reverse/teleport streaming; tree-local leaf source plumbing; Live/curated star/time behavior; accepted vehicle/camera/audio/VFX/Garage regressions.
- CPU-only Node benchmark: all five asset kinds loaded, eight stations, 149 chunk builds; ~4.9 ms median, 5.8 ms p95, 9.5 ms max; <=23 medium-range chunks. Environment-only visible-batch counts were 222–334 before camera frustum rejection. Not a browser/GPU FPS measurement.

## Playtest and remaining verification

Private owner-only URL: **https://spider-midnight-drive.kush-09.chatgpt.site** (normal owner ChatGPT sign-in).

Local alternative:

```bash
npm ci
npm run dev
# http://localhost:4173
```

Browser visual/GPU QA was unavailable in this managed container; no visual or 60 FPS acceptance is claimed. The existing vehicle issues documented in `PROJECT_CONTEXT.md` remain deferred. No failing automated checks remain.

Personally inspect Autumn Evening at spawn, broad bends, the ~6 km crest and long descent; the distant ocean reveal and gradual approach toward 18 km; Snowfall coverage/readable road and stars; Live city weather/local time; grass/tree LOD and frame pacing at 100–160 km/h. Check horizon/stream-window edges from elevated viewpoints and the depth of coast visibility against the intended composition.

## Exact next steps

1. Push local `4799ec3` to `main` once the GitHub write limit clears, then sync the Site source and deploy a new private version.
2. Playtest Autumn Evening at spawn, the first crest and the 18 km coast approach; also sample Snowfall and Live time/weather. Inspect tree scale, grass readability, open/enclosed chapter contrast, canopy leaves and frame pacing.
3. Address only confirmed world/environment defects while preserving the accepted driving foundation. Run `npm test`, `npm run typecheck` and `npm run build` before each checkpoint.
4. Future scope may include rivers/streams, ravines, small/elevated/coastal bridges, rural crossings and junctions that respond to actual geography. None were started in this pass.
