# AFTERMILE — PROJECT CONTEXT & DEVELOPER GUIDE

> **READ THIS FILE FIRST.**  
> Do not perform a full repository audit before beginning a task.  
> Use this document to understand the current project state, then inspect only the files relevant to the requested subsystem.  
> If a requested task conflicts with a **FROZEN** subsystem listed here, stop and report the conflict before modifying it.

---

## 1. AFTERMILE OVERVIEW

**Aftermile** is a standalone, browser-based cinematic driving experience focused on the romance of the open road: long journeys, shifting atmospheres, vehicle dynamics, changing weather, and roadside tranquility.

- **Technology Stack**:
  - **Core**: Vanilla TypeScript (ES Modules)
  - **Rendering**: [Three.js](https://threejs.org/) (WebGL / WebGPU-ready, custom shader passes, EffectComposer with FXAA)
  - **Bundler / Dev Server**: [Vite](https://vitejs.dev/)
  - **UI**: Lightweight semantic HTML & CSS with hardware-accelerated SVG and minimal DOM footprint
  - **Audio**: Web Audio API with multi-layer synthesized harmonics, road/surface friction, and real mechanical engine audio samples
  - **Testing**: Node.js built-in native test runner with TypeScript type stripping

- **Primary Experience**:
  - Relaxed, atmospheric driving
  - Long open highways and scenic roads
  - Seamless day/sunset/night and dynamic weather transitions
  - Authentic, tactile vehicle physics and driver cockpit immersion
  - Roadside atmosphere and environmental discovery

- **Design Philosophy — DEPTH BEFORE BREADTH**:
  - Aftermile is **NOT** a mission-based action game, GTA clone, combat simulator, or generic arcade racer.
  - The vehicle handling, road geometry, environmental atmosphere, lighting, and ambient world *are* the game.

---

## 2. REPOSITORY STRUCTURE & RUN COMMANDS

### Commands
```bash
# Development server (runs on http://localhost:4173)
npm run dev

# Run automated test suite (102 passing checks at the first-push checkpoint)
npm test

# TypeScript verification (strict type checking)
npm run typecheck

# Production build bundle
npm run build

# Preview production build locally
npm run preview
```

### Directory Map
- `src/`
  - `game/`: Main game loop (`Game.ts`), orchestration, scene lifecycle, time progression
  - `vehicle/`: Vehicle physics simulation (`VehiclePhysics.ts`), models (`PlayerVehicleModel.ts`), cameras (`CameraController.ts`), controllers, and debug inspector (`VehicleDebug.ts`)
  - `vehicle/definitions/`: Vehicle specification presets (`R34.ts`, `M4_GT3_EVO.ts`)
  - `road/`: Mathematical spline curves, road elevation, banks, headings, and region definitions (`Road.ts`)
  - `world/`: World chunk streaming (`WorldChunk.ts`, `World.ts`), materials (`Materials.ts`), water (`Water.ts`), ambient life (`AmbientLife.ts`), and batch instancing (`Batch.ts`)
  - `sky/`: Sky dome, celestial bodies, dynamic sun/moon cycles, and atmospheric scattering (`Sky.ts`)
  - `weather/`: Weather simulation and atmospheric presets (`Weather.ts`)
  - `audio/`: Multi-channel engine acoustics, wind, tire scrub, road textures, and transmission audio (`AudioManager.ts`)
  - `ui/`: Automotive instrumentation, circular minimap, floating maneuver HUD, micro-doodle Road Assist (`UI.ts`, `style.css`)
  - `garage/`: Interactive showroom and vehicle preview presentation (`GarageController.ts`)
  - `traffic/`: Ambient NPC highway traffic simulation (`Traffic.ts`)
  - `systems/`: User preferences, settings storage, and keybindings (`Settings.ts`)
- `public/`: Static runtime assets (vehicle models in `public/models/`, audio samples, fonts)
- `tests/`: Automated unit and system regression test suites

---

## 3. VEHICLES

1. **Nissan Skyline GT-R R34 (Primary Reference Vehicle)**:
   - The primary vehicle for development, physics calibration, camera framing, and interior authenticity.
   - High-fidelity lossless GLB model (`public/models/r34/r34.glb`) featuring authentic interior geometry, native digital MFD housing, analog gauge surfaces, and physical side/rear mirrors.
2. **BMW M4 GT3 EVO (Secondary / Test Vehicle)**:
   - Modern GT3 race machine with high-downforce aerodynamics, sequential dog-box transmission, and racing telemetry cluster (`src/vehicle/definitions/M4_GT3_EVO.ts`).

---

## 4. R34 FOUNDATION STATUS

The R34 vehicle foundation is currently stable, fully verified, and passing all automated test suites:

- **Physics & Kinematics**:
  - Independent 4-wheel raycast suspension with non-linear spring/damper kinematics and pitch/roll chassis heave.
  - Front-wheel Ackermann steering geometry with speed-sensitive steering rack attenuation from 10 to 160+ km/h.
  - Progressive countersteer and simcade slip-angle transition allowing smooth, recoverable slides without snap-oversteer.
  - Strict energy-conservation invariants: zero stationary launch abuse, zero runaway lateral velocity, and full drivetrain interlock under handbrake.
- **Tire VFX & Skid Simulation**:
  - Velocity-stretched, wind-responsive smoke particle system that dissipates cleanly without black/dark artifacts.
  - Ground-projected dynamic skid mark ribbon system tied strictly to wheel sliding slip.
- **Audio Architecture**:
  - Multi-track mechanical acoustic synthesis: intake induction, exhaust note, turbo spool/blowoff, transmission gear whine, and physics-driven per-wheel tire scrub/squeal.
  - Cabin acoustic transfer function: low-pass interior filtering and enhanced mechanical gear whine in first-person mode.
- **Cameras & Cockpit Rig**:
  - **DriverEye Rig**: Single vehicle-local camera hierarchy located at the driver's eye position, eliminating seat/headrest clipping.
  - **Hood Camera**: Low-slung, high-speed optic flow camera mounted on the front bonnet.
  - **Chase Cameras**: Orbiting third-person chase camera with smooth lag and origin-shift compensation.
  - **Mirrors**: Real-time physical mirror cameras rendered with time-sliced browser budgeting.

---

## 5. FROZEN SYSTEMS — DO NOT CASUALLY MODIFY

> **FROZEN does not mean bug-free forever.**  
> It means: **Do NOT refactor, rebalance, or redesign these subsystems while working on unrelated tasks.**

The following systems have been accepted and are currently **FROZEN**:
1. **R34 Steering & Handling Physics**: Steering rack curves, high-speed authority, countersteer kinematics, and tire grip bounds.
2. **Braking & Handbrake Dynamics**: Service brake force distribution, tire grip dissipation, and handbrake slide mechanics.
3. **DriverEye / Cockpit Camera Socket**: The vehicle-local Object3D camera attachment hierarchy.
4. **Hood & Chase Camera Modes**: Tuned offsets, damping factors, and FOV behavior.
5. **Vehicle Audio Engine**: Acoustic synthesis, 7-band crossfades, and per-wheel slip audio.
6. **Tire VFX**: Smoke dissipation curves and skid mark ribbon logic.
7. **Navigation & HUD Hierarchy**:
   - Approved circular minimap ($180 \times 180\,\text{px}$) with adaptive day/evening/night theme.
   - Minimal transparent top-center maneuver HUD (no cards/pills/containers).
   - Top-right contextual micro-doodle Road Assist system.
   - Bottom-left tachometer and cluster telemetry.

---

## 6. KNOWN ISSUES (INTENTIONALLY DEFERRED)

*Do not fix or refactor these during unrelated tasks unless specifically directed by the user:*
- **Cockpit Frame Pacing / Micro-Judder**: Minor pacing variations during high-speed cockpit driving on lower-end devices.
- **Mirror Resolution & Edge Distortion**: Low-overhead render target resolution for side mirrors.
- **Traffic NPC Placement Quirks**: Rare corner-case traffic spawning near sharp spline transitions.
- **Garage Transition Polish**: Occasional sub-frame model pop during rapid showroom cycling.

---

## 7. NAVIGATION & HUD DESIGN

### Screen Composition
- **Top-Left**: Familiar circular navigation minimap with compass bezel, road hierarchy, dynamic route line, and location pill.
- **Top-Center**: Floating, transparent maneuver instruction (direction arrow, action text, distance counter, road name). Center screen remains 100% open for the road.
- **Top-Right**: Compact micro-doodle Road Assist ($24 \times 24\,\text{px}$ vector line icon + short text).
- **Bottom-Left**: Circular tachometer, numerical speed, gear indicator, fuel gauge, and trip telemetry.
- **Bottom-Right**: Subtle drive controls and camera helper keys.
- **Center**: Kept completely clear for the road, car, and world.

### Adaptive Day / Sunset / Night Theme
The HUD palette is continuously modulated by the game's actual world time (`sky.hour`, $0 \dots 24$):
- **Day (08:00 – 16:30)**: Warm off-white/light neutral navigation map ground, dark slate roads, clear dark route line.
- **Evening / Sunset (16:30 – 20:30)**: Smooth cubic smoothstep reduction in luminance, shifting toward cool slate and muted twilight tones without sudden jumps.
- **Night (20:30 – 05:00)**: Charcoal/slate map ground, illuminated road geometry, glowing cyan route line.
- **Dawn (05:00 – 08:00)**: Smooth transition back to daylight illumination.

### Road Assist Micro-Doodles
Road Assist is the single top-right contextual feedback area using lightweight vector line art:
- `VEHICLE CLOSE`: Proximity warning when an NPC car is dangerously near.
- `BACK TO ROAD`: Directional vector when vehicle leaves asphalt boundaries ($> 7.2\,\text{m}$ offset).
- `ROUTE FOUND`: Brief confirmation when returning to the road corridor.
- `WRONG WAY`: Directional U-turn warning if heading opposes the road.
- `SHARP BEND`: Early curve warning for severe upcoming bends.
- `SLIPPERY ROAD` / `ICY SURFACE`: Weather traction notices.
- `LOW FUEL` / `REFUELING`: Station fuel status.

---

## 8. UI / VISUAL DESIGN LANGUAGE

- **Cinematic & Minimal**: Transparent, uncluttered overlays where the vehicle and landscape are the visual heroes.
- **Zero Admin Clutter**: No heavy dashboard containers, CRM cards, dark notification pills, or toast queues.
- **Restrained Typography & Accent**: Modern geometric sans-serif typography, subtle cyan accents (`#00f0ff` / `#9fe2ec`), and muted slate tones.

---

## 9. WORLD — CURRENT STATE

- **First-push scope:** Live Weather, Autumn and Snowfall over the same deterministic scenic world. Rivers, bridges, crossings, junctions, stations and cities are dormant; do not start infrastructure without the user's next instruction.
- **Road (`Road.ts`, `RouteProfile.ts`):** 160 m chunks, 9.6 km regions, 4 km horizontal sections with 1.2 km straights and alternating broad seeded sweeps. Independent 3 km C2 elevation sections create an inland opening, roughly 6 km crest and long descent, followed by non-repeating seeded hills. Grades stay below 4.5% over the tested 100 km seeds. The accepted vehicle API and tuning are preserved.
- **Streaming (`World.ts`, `Streaming.ts`):** Current corridor first; four chunks at startup, then one chunk per frame. Medium quality retains at most 23 chunks, roughly 2.6 km ahead and 960 m behind. Loaded assets replace fallback chunks one at a time in the same generation budget. Build/coverage stats are exposed.
- **Terrain (`Landscape.ts`, `TerrainMaterial.ts`):** Coherent seeded world-space hills, graded road cuts/fill, clear 12 m corridor, grass/soil/rock/sand/wet material layers and restrained meadow variation. Macro landforms now use broad 2.6–3.6 km noise scales, a 260 m near-relief fade and an inland opening bias so the highway is not boxed in by small hills. Wide terrain reaches 5.4 km on either side using coarser lateral samples. `Road.point/terrain` preserve the driving frame; `terrainPoint/terrainSurface` blend distant render cross-sections into world X/Z to avoid folds on bends. Geography and placement do not depend on weather.
- **Composition (`Composition.ts`):** A 1.5 km open spawn, open/mid/enclosed deterministic chapters, shoulder and field-edge layers, slope/height/road exclusion, and a clear crest panorama. Mature placement heights range from 14–26 m with canopy radius and leaf-load metadata. Five Kenney Nature Kit CC0 GLBs are normalized and instanced; textured grass is the near layer and the procedural card is only fallback. Tree-local airborne leaves, settled leaf silhouettes and pooled wind/wake motion live in `Particles.ts`. See `WORLD_ASSETS.md`.
- **Coast (`Landscape.ts`, `Water.ts`):** Coast starts over 8 km west of spawn, approaches about 2 km offshore near the first crest, then approaches a few hundred metres by route station 18 km. Variable dry/wet beach slopes into shallow/deep sea. The water strip begins at the same continuous world-space coast, uses stable origin-shift coordinates, sky reflection and haze; no camera-centered inland ocean plane.
- **Environment/time (`Environment.ts`, `Weather.ts`, `Settings.ts`, `Sky.ts`):** Only Live Weather / Autumn / Snowfall are exposed. Live retains Open-Meteo city conditions and the city-local real clock, with continuous dusk/dawn star visibility and cloud suppression. Failed requests keep Live selected and label simulated conditions. Autumn/Snowfall use Morning 08:30, Noon 12:00, Evening 17:39 and Night 23:00. Fresh settings open in Autumn Evening. Curated sky keyframes, matched sun/ambient lighting, restrained Autumn evening stars and heavy-cloud Snowfall star suppression share the existing weather architecture.

---

## 10. CURRENT PRIORITY — NATURAL WORLD PLAYTEST

The natural-world composition and vegetation quality pass is implemented locally and checked. The next step is the user's visual/driving acceptance, especially Autumn Evening at the inland opening and first crest, mature tree scale, grass readability, canopy leaves, Live city time/weather, Snowfall coverage, field LOD and high-speed frame pacing. Automated checks and CPU-only chunk measurements do not establish browser appearance or 60 FPS.

Use `HANDOFF.md` for the pushed implementation checkpoint, validation, private playtest URL and exact continuation steps. Do not restart or re-audit frozen systems. The future infrastructure pass must respond to geography and requires the user's approval of this first pass.

---

## 11. WORLD DESIGN & TECHNICAL GUIDELINES

### Procedural Foundation + Curated Assets
- **Procedural Terrain = World Foundation**: Generates macro hills, valleys, collision geometry, and road integration.
- **Curated 3D Assets = Visual Identity**: High-quality rocks, trees, foliage, and roadside details placed via deterministic biome rules.

### Long Highway Streaming
- Do **NOT** create a single giant static road mesh.
- Stream road and terrain chunks dynamically ahead of the vehicle, caching active segments and recycling distant chunks behind.
- Provide long straight sections for high-speed cruising, wide sweeping turns, and dramatic coastal vistas.

### Vegetation & Prop Placement Rules
- **Strict Road Exclusion**: Foliage, rocks, and props must never intersect driving lanes, shoulders, or guardrails.
- **Scale & Optic Flow**: Roadside props (posts, lane stripes, signs, rocks) must maintain realistic real-world scale to provide accurate speed perception.
- **Deterministic Seeding**: Generation must be seeded and deterministic so world layout is consistent and reproducible.

### Asset Licensing & Manifest Policy
- Free 3D assets are encouraged (trees, rocks, cliffs, foliage).
- Assets **must** have clear, commercial-compatible licenses (**CC0**, **Public Domain**, **CC-BY**, or MIT).
- All third-party assets must be documented in an asset manifest with source, author, license, triangle counts, and texture details.
- Raw downloaded assets must pass through an optimization pipeline (scale normalization, draw-call batching, texture compression, and LOD generation) before inclusion.

### Performance Budget for Browser
- Target stable 60+ FPS in standard WebGL/browser environments.
- Use `THREE.InstancedMesh`, distance culling, frustum culling, and LOD techniques.
- Keep near-field detail high and far-distance geometry low-overhead.

---

## 12. CHANGE DISCIPLINE & WORKFLOW RULES

1. **Read `PROJECT_CONTEXT.md` first**: Do not waste context performing redundant audits of working subsystems.
2. **Inspect only relevant files**: Focus strictly on the target subsystem requested by the user.
3. **Respect Frozen Systems**: Never alter vehicle physics, cameras, audio, or HUD layouts unless explicitly instructed.
4. **Validation Routine**: Always verify changes before completion:
   ```bash
   npm test
   npm run typecheck
   npm run build
   ```
5. **Visual Evidence**: Provide clear visual verification for any graphical, UI, or environmental changes.
6. **Personal Testing is Final**: Automated tests do not replace the user's personal driving and visual inspection.
7. **Handoff Documentation**: If stopping mid-task, record active progress, open decisions, and next steps in `HANDOFF.md` (keep `PROJECT_CONTEXT.md` clean and durable).
8. **DO NOT PUSH**: Never push commits to remote repositories without explicit user instruction.

---

## 13. IMPORTANT FINAL NOTE FOR FUTURE AGENTS

> **Do not restart Aftermile from first principles.**  
> **Do not re-audit or redesign working systems merely because you would implement them differently.**  
> **Continue from the current foundation.**  
> **For the next major phase, focus on making the WORLD itself worth driving through.**
