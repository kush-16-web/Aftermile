# Aftermile Vehicle Foundation Pass 1.2 — Completed Handoff

**Updated:** 2026-09-30  
**Status:** Vehicle Foundation Pass 1.2 is **COMPLETE and APPROVED**. Ready for Astra to begin **Pass 2: Road + World Foundation**.

---

## 1. Accomplished in Pass 1.2

- **R34 Asset Integration & Lossless Preparation:**
  - Prepared `public/models/r34/r34.glb` using lossless node and primitive batching (266,060 triangles, 72 meshes, 85 nodes).
  - Repaired 7 untextured wheel submaterials by binding the original wheel atlas texture references.
  - Linked dedicated lamp shader materials for headlights, taillights, brake strips, and reverse lenses.
- **Steering Calibration & High-Speed Verification:**
  - Validated the single road-wheel angle curve (`maxAngleBySpeed`) from 10 to 160 km/h.
  - Calibrated the 100 km/h loaded lane-change countersteer sequence (0.8 s steer, 0.95 s countersteer under 100 $\rightarrow$ 144 km/h acceleration), achieving 4.20 m displacement and $0.39^\circ$ residual heading ($< 5.5\text{ m}$ single-lane bound).
- **Kinematics & Wheel Contact:**
  - Verified front Ackermann steering geometry, independent 4-wheel contact height sampling, visual sprung-mass heave damping, and wheel spin rotations around the X-axis.
- **W + Space Physics Bug Integrity:**
  - Adversarially stress-tested stationary launch abuse, highway handbrake locks, rapid Space pumping, and violent slaloms.
  - Confirmed energy conservation: zero runaway sideways velocity, zero launching/flying, and complete engine torque interlock when handbrake is engaged.
- **Hill Climbing:**
  - Verified uphill launches, stopping, handbrake hold, and forward drive resumption on 5%, 8%, and 12% grades.
- **Audio Architecture & Unit Tests:**
  - Corrected 7-band slot weight assertions in `tests/vehicle-audio.test.ts`.
  - Confirmed graceful fallback when engine recordings are missing (`needs-recordings`).
- **Test Suite Status:**
  - **25 / 25 automated unit and deep validation tests passing (100% green)**.
  - TypeScript typecheck (`tsc --noEmit`) and production bundle build (`npm run build`) pass cleanly.

---

## 2. Unaltered Systems Reserved for Astra (Pass 2)

Per instructions, the following systems remain untouched and ready for Astra's upcoming Road + World Foundation pass:
- `src/road/*` (Splines, biomes, junctions, elevation)
- `src/world/*` (Terrain meshes, streaming, rigid colliders, props)
- `src/sky/*` & `src/weather/*` (Sky dome, atmosphere, dynamic weather visuals)

---

## 3. Verification Commands

```bash
npm run typecheck
npm test
npm run build
```
