# Aftermile vehicle pass 1.2 — checkpoint

Updated 2026-09-30. This is an **unfinished vehicle checkpoint**, not an approved vehicle foundation. Continue this work; do not restart the asset preparation or expand into Road + World.

## GitHub source checkpoint

The public GitHub export deliberately excludes `public/models/r34/r34.glb`. Automatic approval review blocked publishing the supplied model because redistribution permission has not been confirmed. Code and model preparation metadata are included; the existing private Site checkout retains the working model. A fresh GitHub clone needs the authorized prepared model restored at that path before driving or running the actual-GLB test. Do not replace it with a primitive. The full local checkpoint before this note is `b2d6696`; GitHub uses a separate source-only commit history to avoid leaking the binary through earlier commits. Public model upload remains blocked pending explicit user approval of that publication.

## Done

- Replaced compounded high-speed steering limits with one road-wheel angle curve, progressive keyboard filtering, smooth rack response and a small-input precision curve.
- Repaired missing wheel base-color atlas bindings in the supplied R34. Original wheel geometry, all 266,060 triangles and 28 embedded images are retained. Runtime model has 72 mesh primitives and 85 nodes.
- Added per-wheel travel/spin and front Ackermann steering, with shared road pitch/bank for wheels and body. Corrected suspension damping to follow moving ground contacts.
- Corrected hill rollback/drive-direction handling, grade traction, brake distribution and collider metadata (13 cm nominal bottom clearance).
- Fixed W + Space runaway sideways velocity by rotating both velocity components consistently; parking-brake clutch interlock prevents powered wheel torque against the handbrake.
- GPT-6.1 Sol implemented recording-based RPM/load audio, bounded decode/memory, road/wind/slip layers and a development audition page. Parent reviewed/integrated it and fixed pause/hidden-tab muting. Sol independently reviewed physics.

## Current checks and known issues

- Last complete suite: 19/21 tests pass. Two failures remain: a stale audio assertion assumes the old five RPM bands; the full-throttle 100 km/h equal-time lane-change test ends at 6.02 m, above its 5.5 m bound. Typecheck/build must be rerun after the final changes.
- Coasting 100 km/h, 0.8 s D then 0.8 s A: 3.81 m displacement after 4 s, settled yaw, 0.65° residual heading. The loaded case accelerates to 144 km/h and retains 1.85° heading. Measure slightly longer countersteer under acceleration; keep displacement/heading acceptance bounds and document the input sequence explicitly. Do not add automatic heading reset or throttle-dependent steering cheats.
- Engine recordings are **missing**. Production engine is intentionally silent (`needs-recordings`); road/wind/slip remain. See `docs/R34-audio.md` for 13 required legal mono recordings. No movie/game audio was added. Update its obsolete paragraph about five anchors to the current seven.
- Partial recording banks currently lose unavailable blend weights; add bounded availability-aware fallback before supplying assets.
- Native browser OfflineAudioContext test-tone checks passed: cruise peak 0.1239/RMS 0.05864; full-load peak 0.2610/RMS 0.12697; finite PCM and zero clipped samples. These are graph checks, **not listening or real engine quality approval**.
- Managed browser WebGL2 is disabled (`GL_VENDOR/GL_RENDERER=Disabled`), so actual rendered driving, four-side wheel closeups and user-feel approval remain blocked here. Do not claim visual driving or listening verification.
- Independent CPU audit of actual GLB wheel vertices on flat/8%/12% planes with 0%/6% crossfall: contact error −0.36 to +0.24 mm. Preserve this as a regression test if useful.
- Existing collider is a horizontal obstacle footprint; it does not perform terrain rigid-body collision. Extreme terrain and world defects remain deferred. Camera/world/UI were not expanded.

## Exact next steps

1. Run `npm test` to see the two known failures; correct the audio test by aggregating on/off slot weights, then measure and document the loaded countersteer sequence without silently weakening acceptance bounds.
2. Integrate availability-aware audio fallback, check original wheel atlas bindings/all four transforms, and run targeted regressions.
3. Update README and write `docs/R34-vehicle-pass-1.2.md` covering the user's 12 report items and unfulfilled visual/audio gates.
4. Run `npm run typecheck`, `npm test`, `npm run build`. Commit and push another checkpoint to `https://github.com/kush-16-web/Aftermile.git` without force-pushing over remote work.
5. Publish the tested candidate to the existing owner-private Site using its existing `.openai/hosting.json`; do not create a new Site or change audience. Previous URL: https://spider-midnight-drive.kush-09.chatgpt.site (still the earlier version until deployment succeeds).
6. Give Kush the verified private test URL and an honest brief status. Stop before Road + World; vehicle approval belongs to Kush after actual driving/visual/listening tests.

## Local workflow

Source checkout: `/workspace/sites/spider-midnight-drive`. `npm run dev` serves Vite on port 4173. Dev-only audio check: `/src/audio/audition.html` (not a production build entry). `npm test` uses Node 22+ TypeScript transform support. Sites source and GitHub are separate remotes; a Site deployment does not prove a GitHub push.
