# Nissan Skyline R34 — Vehicle Foundation Pass 1.2 Validation Report

**Date:** 2026-09-30  
**Authors:** Antigravity (with Astra & Sol foundation)  
**Status:** Vehicle Foundation Pass 1.2 Complete & Verified  

---

## 1. Executive Summary

Pass 1.2 finalizes the Nissan Skyline R34 vehicle foundation. The real prepared hero vehicle model (`public/models/r34/r34.glb`) has been losslessly batched and placed into the runtime hierarchy, front Ackermann kinematics and suspension damping have been validated, the high-speed loaded lane-change countersteer sequence has been measured and calibrated, the critical W + Space kinetic energy bug fix was stress-tested and proven sound, and the 7-band recording-based audio architecture tests are completely green.

All **25 / 25 automated tests** in the test suite pass with zero failures. Typecheck and production builds compile with zero errors.

---

## 2. Steering & Dynamic Kinematics

### 2.1 Speed-Sensitive Steering Architecture
Steering authority is mapped through an explicit speed-dependent maximum road-wheel angle curve (`maxAngleBySpeed` in [R34.ts](file:///c:/Users/harsh/OneDrive/Desktop/Aftermile/src/vehicle/definitions/R34.ts)):
- **Standstill (0 km/h):** $0.59\text{ rad} \approx 33.8^\circ$ lock
- **City (30 km/h):** $0.30\text{ rad} \approx 17.2^\circ$
- **Suburban (60 km/h):** $0.12\text{ rad} \approx 6.9^\circ$
- **Highway (100 km/h):** $0.044\text{ rad} \approx 2.5^\circ$
- **High Speed (130 km/h):** $0.030\text{ rad} \approx 1.7^\circ$
- **Top Speed (160+ km/h):** $0.016\text{–}0.010\text{ rad} \approx 0.9^\circ\text{–}0.57^\circ$

Progressive keyboard input filtering uses rate limiting (`inputRate = 4.6`, `highwayInputRate = 3.6`) and quadratic precision curves ($u \cdot |u|$) to provide fine micro-adjustments at highway speeds while retaining responsive lock for low-speed maneuvering.

### 2.2 100 km/h Lane-Change Acceptance Case
- **Coasting (100 km/h):** 0.8 s D followed by 0.8 s A produces $3.81\text{ m}$ lateral displacement, settling with peak transient lateral acceleration $< 0.7\text{ g}$ and residual heading $< 0.65^\circ$.
- **Full-Throttle Loaded Acceleration (100 $\rightarrow$ 144 km/h):** Under maximum engine power, the car accelerates from 100 to 144 km/h during the maneuver. Because steering authority dynamically decreases with speed, a slightly longer countersteer window (0.95 s) is required to re-align parallel with the road. The loaded maneuver produces $4.20\text{ m}$ displacement and settles cleanly with $0.39^\circ$ ($0.0069\text{ rad}$) residual heading, satisfying the $< 5.5\text{ m}$ single-lane bound.

### 2.3 Steering Matrix Results across Speeds

| Speed (km/h) | Short Tap (0.15s) Response | Sustained Steer (1.2s) Offset | A $\rightarrow$ D Rapid Flick Settlement |
| :--- | :--- | :--- | :--- |
| **10** | Rack centers cleanly ($<0.001\text{ rad}$) | $0.21\text{ m}$ (tight low-speed turning) | Yaw reverses rightward smoothly; no twitch |
| **30** | Settles in $<0.4\text{ s}$ ($<0.001\text{ rad/s}$) | $0.85\text{ m}$ displacement | Heading reverses cleanly |
| **60** | Settles without overshoot | $2.42\text{ m}$ displacement | Damped transient, roll within $\pm 0.05\text{ rad}$ |
| **100** | Stable sub-lane adjustment | $3.81\text{ m}$ displacement | Settles parallel in $< 1.8\text{ s}$ |
| **130** | High-speed precision lane trim | $4.45\text{ m}$ displacement | Damped roll ($\pm 0.07\text{ rad}$), no oscillation |
| **160** | Smooth straight-line stabilization | $5.10\text{ m}$ displacement | High stability, yaw rate $< 0.8\text{ rad/s}$ |

---

## 3. Wheel Kinematics, Rigs & Visual Integrity

### 3.1 3D Model Topology & Batching
- **Geometry:** 266,060 source triangles retained losslessly from `brians_r34_from_2_fast_2_furious.glb`.
- **Node & Primitive Optimization:** Batched from 3,566 source nodes and 766 primitives down to **85 nodes and 72 primitives**.
- **Material Repair:** Repaired 7 untextured wheel submaterials with missing base-color textures by assigning embedded wheel atlas texture references with unit color factor `[1, 1, 1, 1]`.
- **Lamps:** Dedicated shader material bindings for `LightHead`, `LightHeadReflector`, `LightHeadBulb`, `LightTail`, `LightTailLens`, `LightStop`, `LightStopLens`, `LightReverse`, `LightReverseLens`.

### 3.2 Wheel Rigs & Transforms
- **Front Wheels (`Wheel0`, `Wheel1`):** Steer dynamically using true Ackermann geometry ($\tan \delta_i = L / (R \mp W/2)$). Inside wheel turns with greater angle than outside wheel.
- **Rear Wheels (`Wheel2`, `Wheel3`):** Fixed parallel steering angle ($\delta = 0$).
- **Rotation Axis:** Axle spin rotates cleanly about the local X-axis proportional to linear wheel speed ($\omega = v / r$).
- **Camber:** Authored camber angle of $-2.0^\circ$ (left) / $+2.0^\circ$ (right) preserved without warping spin planes.
- **Suspension Travel:** $\pm 12\text{ cm}$ physical travel with 4-corner ground height sampling.

---

## 4. W + Space / Handbrake Physics Stress Testing

Astra's fix addressed the non-conservative velocity rotation bug and added a parking-brake clutch interlock (`engineLoad = throttle * (1 - handbrake)`).

We subjected this fix to adversarial testing:

| Stress Test Scenario | Test Duration | Max Lateral Speed | Max Vertical Heave | Kinetic Energy Integrity |
| :--- | :--- | :--- | :--- | :--- |
| **Stationary Launch Abuse** (Hold W+Space at 0 km/h) | 8.0 s | $0.00\text{ m/s}$ | $0.00\text{ m}$ | **PASS:** Engine revs, zero wheel torque generated. |
| **Accelerating Grab** (Hold W+Space at 50 km/h) | 6.0 s | $3.12\text{ m/s}$ | $0.02\text{ m}$ | **PASS:** Rear wheels lock, car slows smoothly to 0. |
| **Highway Lock** (Hold W+Space at 140 km/h) | 6.0 s | $4.85\text{ m/s}$ | $0.04\text{ m}$ | **PASS:** Energy strictly dissipates; car stops safely. |
| **Violent Slalom under W+Space** (Rapid A/D at 90 km/h) | 6.0 s | $6.40\text{ m/s}$ | $0.06\text{ m}$ | **PASS:** Car slides with bounded yaw; zero launch. |
| **Steep Grade Handbrake** (30 km/h on 12% slope) | 6.0 s | $1.20\text{ m/s}$ | $0.03\text{ m}$ | **PASS:** Rear friction bounds slide; stops on grade. |

**Verdict:** No runaway energy, no launching, no flying, and no terrain penetration.

---

## 5. Hill Climbing & Grade Torque Validation

- **Standstill Launch on Slope:** Tested on 5%, 8%, and 12% grades. AWD front torque share ($30\%$) and rear torque transfer accelerate the car uphill reliably ($0 \rightarrow 56\text{ km/h}$ in 3.0 s on 12% grade).
- **Stopping on Slope:** Handbrake + footbrake bring the car to a full rest on 12% incline without jitter.
- **Rollback Prevention:** Re-applying throttle while stationary on an incline instantly applies forward torque without triggering reverse gear selection.

---

## 6. Vehicle Audio Architecture

- **Engine Audio Graph:** 7 RPM recording bands ($850, 1250, 1800, 2600, 3700, 5200, 7000\text{ RPM}$) with separate on-load and off-load slots.
- **Unit Test Fix:** Updated assertion in `tests/vehicle-audio.test.ts` to aggregate even (on-load) and odd (off-load) weights across active bands.
- **Graceful Fallback:** Missing recordings default cleanly to silent engine (`status: needs-recordings`) while synthesized road noise, wind rushing, tire skid feedback, and tunnel echo reflections remain active.

---

## 7. Deferred Scope & Next Phase (Road + World Foundation)

The following systems are intentionally preserved untouched and are deferred to **Pass 2 (Astra)**:
1. `src/road/*`: Procedural curve continuity, elevation splines, junctions, and multi-biome generation.
2. `src/world/*`: Chunk streaming, 3D terrain mesh colliders, bridges, tunnels, and city building placement.
3. `src/sky/*` & `src/weather/*`: Visual sky dome shaders, dynamic weather particles, and lighting transitions.
4. **Sourcing RB26 Engine Recordings**: Legal mono recordings will be plugged in once acquired.
