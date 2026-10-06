# Aftermile

Aftermile is a cinematic browser driving experience about taking the long way home: open fields, broad highways, rolling hills, changing skies and a coast you travel toward.

Built with TypeScript, Three.js and Vite. The accepted R34/BMW vehicle, handling, camera, audio, Garage and navigation foundations are preserved while the world develops around them.

## Playtest

[Open the private Aftermile test site](https://spider-midnight-drive.kush-09.chatgpt.site) using the owner's normal ChatGPT sign-in.

The current pass is **World Themes + Scenic Road Foundation — First Push**. Start with **Autumn → Evening** in the Weather panel. The opening is inland; the first large crest is around route station 6 km (about 5.8 km from spawn), with the coast gradually becoming closer toward 18 km. Browser visuals and driving feel are ready for personal review.

## Run locally

Use Node.js 24 (the tested runtime) and npm.

```bash
git clone https://github.com/kush-16-web/Aftermile.git
cd Aftermile
npm ci
npm run dev
```

Open **http://localhost:4173** in a desktop browser with WebGL 2 and hardware acceleration. For a production build, run `npm run build` and then `npm run preview`.

The core world works offline. Live Weather needs network access to Open-Meteo; a failed fetch keeps Live selected and clearly labels simulated conditions.

## Environments

| Mode | Time and atmosphere |
| --- | --- |
| Live Weather | Existing city/location weather lookup, selected city's real local clock, continuous dusk/dawn stars and cloud suppression |
| Autumn | Morning, Noon, Evening and Night; warm fields, varied sparse groves, restrained upper-sky evening stars |
| Snowfall | The same four curated times; cold ground, snow on vegetation/rocks/shoulders, readable asphalt and heavy-cloud star suppression |

Fresh settings open in Autumn Evening. Changing the environment changes the atmosphere and surface presentation while preserving the seeded road, terrain, tree clusters, vistas and coast.

## Scenic world

- 1.2 km straight sections, alternating large sweeps, broad S progressions and gentle C2 climbs/descents.
- Inland meadow opening, rolling countryside, open crest panoramas and a gradual ocean approach.
- Sparse groups of 3–8 trees and clear sightlines through large fields.
- Layered grass detail: instanced near clumps, inexpensive mid cards, coherent far terrain color/noise.
- Graded shoulders and terrain material layers through grass, rock, sand, wet beach and water.
- Coast geometry follows one continuous shoreline, with sky reflection and atmospheric haze.
- Bounded streaming, one chunk per frame after startup, shared instanced assets and distance/frustum culling.

This first pass keeps bridge, river, crossing, station and city generation dormant. Those systems await the future geography-driven infrastructure pass.

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Throttle |
| `S` / `↓` | Brake; hold after stopping to reverse |
| `A` / `D` / arrows | Steer |
| `Space` | Handbrake |
| `C` | Cycle cameras |
| `L` | Headlights: auto / on / off |
| `R` | Recover the car |
| `Esc` | Pause/resume |
| `H` | Hide/show instruments |
| `M` | Mute/unmute |
| Right mouse + drag | Look around |

## Validation and performance

```bash
npm test
npm run typecheck
npm run build
```

The first-push checkpoint passes **102 checks**, including the existing vehicle, camera, Garage, audio and VFX regressions. World checks cover 100 km seeded route continuity, bounded grades/curves, corridor clearance, coast alignment, non-folding distant terrain, chunk streaming, grove seams and environment/star transitions.

A CPU-only Node benchmark across eight route locations loaded all five environment assets, measured 149 chunk builds at approximately **4.9 ms median / 5.8 ms p95**, and retained at most **23 chunks** at medium range. These measurements exclude GPU rendering, vehicle/traffic draws and browser frame pacing; they are not a 60 FPS claim.

## Assets and project context

Five selected [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) environment GLBs total 65,828 bytes and are **CC0 1.0**. They are normalized, instanced and use shared seasonal shaders. Sizes, geometry counts, runtime modifications, LOD and the shipped license are documented in [WORLD_ASSETS.md](WORLD_ASSETS.md).

Vehicle models were supplied for this project. Their asset terms are separate from the source license; no independent model redistribution license is asserted here. Existing R34 preparation/audit notes remain in `docs/` and `public/models/r34/`.

Aftermile source uses the MIT terms in [LICENSE](LICENSE). Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) first before making changes, then [HANDOFF.md](HANDOFF.md) for the exact checkpoint and continuation steps.
