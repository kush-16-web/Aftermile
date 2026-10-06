# World Foundation Pass 1 — handoff

Updated 2026-10-05. Read `PROJECT_CONTEXT.md` first. The protected vehicle, cockpit, audio, VFX, navigation, and Garage systems remain unchanged except for world compatibility wiring.

## Completed

- `src/road/RouteProfile.ts` now provides deterministic 4 km horizontal sections with 1.2 km straights, broad C2-ish transitions, and a bounded 6 km grade profile. `Road` keeps the existing public route API and 160 m chunk size.
- `src/world/Streaming.ts` and `src/world/World.ts` keep a bounded forward/reverse window, prioritize the current corridor, generate four startup chunks and one distant chunk per frame, dispose out-of-window chunks, and expose build/coverage stats.
- `src/road/Landscape.ts` provides deterministic multi-scale terrain, graded shoulders, road cuts/fill, corridor clearance, variable shoreline/beach/sand/wet/deep-water samples, and station/bridge handling.
- `src/world/TerrainMaterial.ts` adds world-space terrain grain and grass/soil/rock/sand/wet seasonal variation. `Water.ts` retains the existing multi-scale wave/Fresnel surface at the shared sea level.
- `src/world/WorldAssetLibrary.ts` loads five small Kenney Nature Kit CC0 GLBs, normalizes their ground pivot/height, and places their separate mesh parts through instanced batches with procedural fallback. `WORLD_ASSETS.md` and `public/world/kenney/License.txt` record provenance, license, sizes, geometry counts, optimization, and LOD status.
- Vegetation, bushes/grass cover, and rocks use deterministic seeded placement outside the road corridor. No giant static road mesh or random unbounded decoration was added.

## Verification

From `/workspace/aftermile-world`:

```text
npm run typecheck  # pass
npm test           # 94 pass, 0 fail
npm run build      # pass; Vite emits only the existing >500 kB chunk advisory
```

World/asset tests include 100 km seeded route and grade continuity, streaming bounds/reverse/teleports, terrain/coast/layer invariants, and CC0 GLB header/size/license checks.

## Checkpoints

- Public GitHub remote `main` currently ends at `3070cf7b25579b79a53931a19450718066223c9f`.
- The complete local world checkpoint is `9814e20` (`feat(world): add CC0 instanced roadside asset pipeline`).
- Private Site source was synchronized, tested, and pushed at `59e91c8a810c17f613c518381a8602cb8f0d7054`.
- Private production deployment succeeded as Site version `appgprj_6ab7a4ca14e881918ebf5e7aece99939~appgver_94c1b72abb508191914fb831cd0912c5`, deployment `appgdep_6ac36e823af48191859efc9b391961e8`.

## Playtest

Owner-private URL (requires the owner’s normal ChatGPT sign-in):

`https://spider-midnight-drive.kush-09.chatgpt.site`

## Remaining

- GPU appearance and frame-time profiling still need a daylight/autumn/evening pass in a real browser session. Streaming is bounded but deliberately builds one distant chunk per frame rather than using a worker.
- The GitHub write connector and direct `git push` are currently blocked by the automatic approval reviewer’s usage limit. The exact retry from the world checkout is:

```text
git push origin main
```

After the reviewer limit clears, push `9814e20` (or the subsequent handoff commit) to `kush-16-web/Aftermile` and verify `main` advances beyond `3070cf7`.

## Continue

```text
npm ci
npm run dev     # http://localhost:4173
npm test
npm run build
```
