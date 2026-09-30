# Aftermile

Aftermile is a cinematic browser driving game about taking the long way home. It streams a procedural road through coast, countryside, bridges, tunnels, city districts, and open plains while the player manages speed, fuel, weather, traffic, and a small road companion.

The project is a standalone Three.js game. It grew from the mood and feature ideas in the original Spider Midnight extension, but it has its own runtime, world generation, physics, and assets.

## Run it

```bash
git clone https://github.com/kush-16-web/Aftermile.git
cd Aftermile
npm install
npm run dev
```

Open the Vite URL in a desktop browser with WebGL 2 and hardware acceleration enabled. Use `npm run build` followed by `npm run preview` for a production build. The core drive works without network access; live weather is optional and only runs after the player chooses a city or grants location access.

The public source checkpoint excludes the supplied R34 binary while redistribution permission is unresolved. Restore the authorized prepared model at `public/models/r34/r34.glb` to drive and run the model tests. The existing private test Site retains that model; see [`HANDOFF.md`](HANDOFF.md).

## Vehicle foundation

Pass 1.2 is an unfinished vehicle checkpoint; see [`HANDOFF.md`](HANDOFF.md) for exact status and continuation steps. The supplied Nissan Skyline R34 remains the hero vehicle. The original GLB is preserved outside the repository. A lossless runtime preparation step bakes the source transforms into the generic vehicle coordinate system, keeps all 266,060 triangles and embedded image data, and batches compatible static primitives so the runtime copy has 72 meshes and 85 nodes instead of 766 mesh primitives and 3,566 source nodes. No decimation or texture resampling was used.

The measured source asset contains separate front and rear wheel groups, separate calipers, exterior windows, a partial interior, real lamp surfaces, 37 source materials, 57 texture references, and 28 embedded images. The runtime copy retains the visible geometry and creates named material roles for the actual headlight surfaces, tail rings, brake strip, and clear reverse lens. The R34 asset audit is in [`docs/R34-asset-audit.md`](docs/R34-asset-audit.md); the generated runtime measurements are in [`public/models/r34/preparation.json`](public/models/r34/preparation.json).

The vehicle system stays reusable:

```text
VehicleController
├── VehicleConfig       reusable per-car definition and R34 tune
├── VehicleInput        progressive keyboard filtering
├── VehiclePhysics      dynamic bicycle handling and simplified collider
├── PlayerVehicleModel  GLB loading, body suspension and wheel pivots
├── VehicleLights       actual model materials plus two road-light spots
├── VehicleAudio        layered RPM/load audio foundation
└── CameraController    smooth chase and exterior camera modes
```

The R34 configuration includes mass, wheelbase, track, center of gravity, power, gearbox, AWD drive share, speed-dependent steering authority, tire grip, braking, suspension, camera offsets, vehicle-specific fuel consumption, and an audio profile. Fuel is calculated from distance, throttle load, speed, idle consumption, and the configured tank size rather than a timer constant.

The audio graph supports seven recording bands with separate RPM/load crossfades, road noise, slip feedback, wind, tunnel reflection, and smooth release behavior. No usable legal engine recording set is supplied, so the engine is intentionally silent and marked `needs-recordings`; synthetic engine buzzing has been removed. Road, wind and slip noise remain. The exact recording requirements and verification limits are in [`docs/R34-audio.md`](docs/R34-audio.md).

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Progressive throttle |
| `S` / `↓` | Brake; hold after stopping to reverse |
| `A` / `D` / arrows | Progressive speed-sensitive steering |
| `Space` | Rear-biased handbrake |
| `C` | Chase, close chase, hood, roof, scenic cameras |
| `L` | Headlights: auto / on / off |
| `R` | Recover the car and reset damage |
| `E` | Hold inside the cyan Night Owl bay to refuel |
| `Esc` | Pause/resume |
| `H` | Hide/show instruments |
| `M` | Mute/unmute |
| Right mouse + drag | Look around |
| `F2` | Development-only vehicle tuning panel |

Numerical tests at 100 km/h produce a 3.81 m coasting lane change using 0.8 s D then 0.8 s A. Full-throttle correction and actual driving feel are still under review; this is not a completed acceptance claim. The world can still expose the previously known terrain, mountain, and water collision problems; those belong to the next Road + World Foundation pass.

## World systems

| System | Current behavior |
| --- | --- |
| Road | Seeded coast, countryside, bridge, city, tunnel, and plains regions |
| Traffic | Pooled lane traffic with signals, queues, passing, and collision awareness; density remains configurable |
| Fuel | Night Owl station interaction plus vehicle-specific tank and consumption model |
| Weather | Clear, rain, storm, snow, autumn, and optional live city weather |
| Sky | Manual or real-time sun, moon, clouds, fog, and lightning |
| Assistant | Existing road/crash/situation warnings and region announcements remain in place |
| Companion | HUD companion reacts to danger, fuel, weather, and clean driving |

The vehicle pass intentionally does not redesign roads, terrain, cities, water, stations, NPCs, navigation, loading screens, or branding.

## Performance

The hero model is allowed a larger budget than traffic. The runtime R34 keeps its measured source triangles and textures while reducing hierarchy and draw-call overhead through lossless batching. The collider is a simple oriented box aligned with the authored wheelbase and body dimensions. The vehicle loop uses a fixed 120 Hz step, bounded substeps, pooled traffic, and no detailed render mesh for dynamic collisions. The renderer does not recreate lamp meshes every frame.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

The tests cover deterministic road continuity, long-drive finite physics, progressive steering from 10–160 km/h, the 100 km/h lane-change acceptance case, braking and reverse transitions, handbrake bounds, six minutes of repeated driving, 60/120 Hz agreement, vehicle-specific configuration isolation, the actual prepared R34 GLB, wheel contact and steering, lamp responses, triangle and draw-call cost, and chase-camera stability through an origin shift.

The managed preview environment used during development may have WebGL disabled. In that case it shows a clear WebGL requirement screen rather than a fake 2D drive. A normal desktop browser with WebGL 2 and hardware acceleration uses the full renderer.

## Asset and source notes

The R34 GLB was supplied for this project as a user attachment. Its original SHA-256 is recorded in the audit and preparation report. The source archive is not committed. The private Site checkout includes the prepared runtime copy; the public GitHub export excludes that binary. The attachment did not include a license statement for the model or its textures, so this repository does not claim a separate redistribution license for that asset.

Aftermile source code is provided under the MIT terms in [`LICENSE`](LICENSE). The source and model asset terms are separate.

## Deferred

The next requested pass is Road + World Foundation: terrain and road intersections, mountain and water collision, curved highways, junctions, believable region spacing, world streaming, navigation data, and directional road signs. Full cockpit animation, controller rumble, authored music, advanced damage deformation, multiplayer, and additional cars remain later work.
