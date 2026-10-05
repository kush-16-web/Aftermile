# World Foundation Pass 1 — active handoff

Updated 2026-10-05. Read PROJECT_CONTEXT.md first. Base: `156d893bb3449cf66a48f54874558dbf9db26c65` on `main`. The current user explicitly authorizes checkpoint pushes. Frozen vehicle, audio, cockpit, VFX, navigation and Garage systems are protected.

## Completed checkpoint 1

- Road station/offset API is unchanged. Stateless seeded C2 profiles replace short sine waves: 4 km horizontal sections begin with 1.2 km straights, followed by broad transitions. Elevation uses 6 km profiles; regions last 9.6 km and natural biomes lead the journey.
- 160 m streaming chunks remain. Medium retains up to 23 chunks (16 ahead / 6 behind / current), low 19, ultra 27. Startup generates four immediate chunks; then one chunk/frame fills the horizon. Distant chunks are disposed. World stats expose build duration and contiguous coverage.
- Targeted 100 km / three-seed geometry regression, streaming/reverse/teleport bounds and existing road/drive smoke checks: 5/5 pass. Typecheck passes.

## Current architecture / files

`src/road/RouteProfile.ts`: analytic long route, derivatives and seed.
`src/road/Road.ts`: public route/biome/corridor API used by all consumers.
`src/world/Streaming.ts`: bounded window and creation priority.
`src/world/World.ts`: lifecycle and timing counters.
`src/world/WorldChunk.ts`: existing asphalt, terrain and roadside batches (next implementation area).
`tests/world-foundation.test.ts`: long route / lifecycle regression.

No third-party assets added yet. No frozen subsystem modified.

## Completed checkpoint 2

- Shared deterministic multi-scale landscape sampler, graded 12 m shoulder corridor, seeded variable coastline/beach and station apron integration.
- Terrain grid has 51 columns, denser shoulder sampling and shared analytic finite-difference normals; mesh/collision use Road.terrain.
- Seven targeted route/terrain/coast/streaming regressions pass; typecheck passes.
- Files added/changed: `src/road/Landscape.ts`, `src/road/Road.ts`, `src/world/WorldChunk.ts`, `tests/world-foundation.test.ts`.
- Checkpoint 1 remote commit: `bdf64773cf01b5e73adc027d19e9fb592339e53c`.

## Exact next implementation step

Add terrain material detail and curated CC0 assets + WORLD_ASSETS.md, deterministic instanced vegetation/LOD, water shore-depth integration and distant scenery. Keep mainline asphalt dimensions and the existing road API.

## Known limits / remaining work

Trees and water rendering still need integration. Terrain/coast sampling is now updated but the GPU appearance remains unverified. New stream generation is bounded by one full chunk per frame, not an asynchronous worker; profile actual build cost before claiming hitch-free. No GPU/FPS claim yet. Existing stations/bridges/city assets were retained, not expanded. Final npm test / typecheck / build and personal daylight/autumn-evening validation remain.

## Continue

`npm ci`
`npm run dev` → http://localhost:4173
`node --experimental-transform-types --test tests/world-foundation.test.ts tests/core.test.ts`
`npm run typecheck`
`npm test`
`npm run build`

Push each stable milestone. At the final checkpoint provide the exact accessible playtest URL, or the dev command/local URL if hosting cannot be exposed. Do not deploy the older vehicle checkout over the current GitHub source.
