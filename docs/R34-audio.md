# R34 vehicle audio foundation

The engine source gate is **not complete**. No engine recording is included and no recording URL is configured. The former six engine oscillators have been removed. The R34 engine is deliberately silent until usable legal recordings are supplied; road, wind and actual-slip noise remain functional. Do not describe this as a convincing finished RB26 sound. No listening claim is made.

## Runtime contract

`new VehicleAudio(context, master, config)` and `update(state, engineVolume, environmentVolume, inTunnel)` are unchanged. `state.speed` is signed m/s; `rpm` and smoothed `load` come from the existing drivetrain. No physics approximation is substituted. Braking alone produces no squeal. Idle has no wind or road noise. Reverse uses absolute speed for these layers. Refueling smoothly mutes engine output.

The existing `config.audio.bands[].onLoad/offLoad` URLs drive continuously running mono loops. Log-RPM interpolation selects adjacent bands, with separate equal-power on/off-load blends; their amplitude sums are normalized to preserve headroom even for coherent sources. RPM/load controls smooth at their configured response rates. Pitch and gain AudioParams smooth at 30 Hz maximum. Pitch is limited to the configured range inside a hard 0.75–1.4x envelope. The filter opens with load. A one-tap tunnel reflection follows the engine gain, without feedback. One procedural noise buffer feeds separate road/wind/slip filters. AudioManager now uses this sole speed-driven wind layer.

Engine loops are decoded sequentially, DC-removed, and normalized to a 0.45 peak. Download limit: 1 MiB per file; decoded mono duration: 0.75–6 s; total retained engine PCM: 12 MiB; maximum 8 RPM bands. Duplicate URLs decode once. A compressor protects the conservative vehicle bus; it is not a guarantee that unrelated weather/music channels cannot overload the global mix. Fetch/decode failures are isolated and reported in `recordingErrors`. Missing URLs trigger no network request. `ready`, `recordingStatus`, `decodedBytes`, `downloadedBytes`, `noiseBytes`, and `loadedLoops` support diagnostics. `recorded` means all configured on/off slots loaded; it does **not** certify quality, pitch coverage or licensing. `dispose()` aborts loads, stops sources, disconnects the graph and releases PCM. Pause should suspend/mute, not dispose.

## Recordings needed

Supply one consistent inline-six/twin-turbo performance-car microphone mix, preferably RB26, with actual separate steady on-load and off-load takes. Idle can reuse one file for both URLs. Do not manufacture the band set by pitch-shifting the same idle recording.

| Nominal RPM | Exports | Purpose |
|---|---|---|
| 850 | `r34-idle-0850.ogg` (both URL slots) | Stable warm idle |
| 1250 | `r34-on-1250.ogg`, `r34-off-1250.ogg` | Idle/low transition |
| 1800 | `r34-on-1800.ogg`, `r34-off-1800.ogg` | Low-load driving |
| 2600 | `r34-on-2600.ogg`, `r34-off-2600.ogg` | Low/mid transition |
| 3700 | `r34-on-3700.ogg`, `r34-off-3700.ogg` | Midrange cruise/acceleration |
| 5200 | `r34-on-5200.ogg`, `r34-off-5200.ogg` | Upper range |
| 7000 | `r34-on-7000.ogg`, `r34-off-7000.ogg` | High load/redline |

These are 13 unique files/14 continuously running voices. Update the R34 profile anchors to the actual measured source RPMs and set URLs only after obtaining/preparing recordings. The current five anchors (850,1800,3200,5000,7000) have an overly wide idle/low gap: 850→1800 cannot be covered accurately with the pitch bounds. The new anchors reduce stretching; use 0.75–1.4x only as a safety boundary, and aim for source playback near unity throughout blends.

Export mono, 44.1 or 48 kHz, preferably Ogg Vorbis ~96 kb/s or decoder-compatible AAC with sample-accurate loop trimming verified after decode. Aim for 3–4 s per loop; 4 s × 13 files at 96 kb/s is approximately 624 kB compressed and 9,984,000 bytes (9.52 MiB) PCM at a 48 kHz context. At a 96 kHz context decoded PCM doubles; the 12 MiB runtime budget intentionally rejects excess assets. Use shorter prepared loops for that output rate or move to a fixed-rate mixing strategy if supporting it becomes necessary. Keep uncompressed editing masters outside the shipped game.

Record/extract steady RPM (within ±2% preferred), remove background traffic/dyno whine and wind contamination, remove DC, maintain a consistent perspective and matched perceived levels across bands. Loop cuts must align engine cycle/phase with continuity of waveform and slope; crossfade offline then listen to **decoded** repeats at min/nominal/max pitch. Runtime looping cannot repair poor seams. Do not use encoder padding as part of a loop. Record intake/exhaust on-load and engine-braking/off-load as separate source material. Keep a little natural texture without obvious repeating revs, gear shifts or passing events. On-load should be materially different in timbre, not only louder. Avoid music, speech and other rights-bearing material.

Optional later asset: 1–2 s engine-start one-shot. Current telemetry has no engine-running/start event, so ignition playback is intentionally deferred. The existing `releaseSample` field is not consumed; smooth off-load crossfade handles throttle release without fake bangs or a one-shot on every frame. Tire squeal is currently filtered procedural noise driven only by actual slip; a licensed loop could improve that texture later.

## Primary-source audit (2026-09-30)

- [OpenGameArt: racing car engine sound loops](https://opengameart.org/content/racing-car-engine-sound-loops), domasx2, labelled CC0. The author's description explicitly says the files differ only in pitch, from a cut/edited startup sample. Rejected for this quality target; none downloaded or shipped.
- [Pole Position Production: Nissan R32 Skyline GTR 1990 Dyno](https://pole.se/product/nissan-r32-skyline-gtr-sound-effects-dyno/): seller documents an RB26DETT inline-six, steady RPM/ramps/idles, engine/exhaust perspectives and startups. This is a plausible source to acquire, not an asset we own. The product lists a royalty-free single-user license; the [linked EULA](https://pole.se/eula/) was not accessible here. Confirm the actual EULA permits game embedding/browser delivery and covers the team before buying/integration; preview audio is not a substitute for a license. No purchase or preview extraction was performed.

No movie/game rips, ringtone downloads, or all-rights-reserved previews were added. Nothing is credited as licensed/shipped when it is only a candidate. Future `public/audio/CREDITS.md` must retain the source URL, creator, exact license/evidence, acquisition date and processing notes for each included asset.

## Verification and limits

`node --experimental-transform-types --test tests/vehicle-audio.test.ts` checks load-specific recording weights at identical 100 km/h/RPM, bounded smooth RPM/load/pitch controls, stable control arrays, speed/wind/reverse behavior, slip-only squeal, refueling/mute, asset deduplication, normalization, failed loads, capped automation and disposal. `npm run typecheck` checks integration. Graph spies are not auditory tests.

Open `/src/audio/audition.html` on the Vite dev server for a WebGL-free real-preview control page and native OfflineAudioContext checks. Offline checks use temporary in-browser generated **test tones**, clearly identified, to measure PCM peak/RMS/finiteness/clipping through the actual graph. They are never added to the game config/assets and do not verify recording quality. Preview buttons cover idle/gentle/hard/100 cruise/100 power/high/release/braking/slip/reverse, but the engine remains silent in production preview until assets exist. Perceived timbre, real loop seams, and cruise-versus-power listening approval remain blocked on source recordings and an actual listening session.

Current added download asset bytes: **0**. Retained VehicleAudio noise: **384,000 bytes** at 48 kHz (375 KiB). Engine PCM: **0**. No engine oscillator nodes. One ambient noise source, thirteen filters/gain/delay/bus/guard nodes plus five gains (18 nodes total); each supplied loop adds one source and one gain. Update reuses controls/arrays, with no project-created per-frame arrays/objects/closures; Web Audio automation implementation may allocate internally.
