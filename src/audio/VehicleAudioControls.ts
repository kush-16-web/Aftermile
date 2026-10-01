import type { VehicleAudioProfile } from '../vehicle/VehicleConfig.ts';

export interface VehicleAudioState {
  /** Signed metres/second; RPM and load come from the vehicle drivetrain. */
  speed: number; rpm: number; load: number; brake: number; slip: number; refueling: boolean;
}

export const finiteClamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
const smooth = (a: number, b: number, rate: number, dt: number) => a + (b-a)*(1-Math.exp(-rate*dt));

/** Reusable control frame. No arrays/closures are created in update(). */
export class VehicleAudioControls {
  readonly weights: Float64Array;
  readonly pitches: Float64Array;
  readonly anchors: number[];
  readonly minPitch: number;
  readonly maxPitch: number;
  rpm: number; load = 0; engineGain = 0; roadGain = 0; windGain = 0; skidGain = 0;
  roadCutoff = 650; windCutoff = 900; skidFrequency = 1600;
  constructor(private profile: VehicleAudioProfile, private idleRpm: number, private redlineRpm: number) {
    this.anchors = profile.bands.map(b => b.rpm);
    this.weights = new Float64Array(this.anchors.length*2);
    this.pitches = new Float64Array(this.anchors.length);
    this.minPitch = finiteClamp(profile.minPitch, .75, 1);
    this.maxPitch = finiteClamp(profile.maxPitch, 1, 1.4);
    this.rpm = idleRpm;
  }
  update(state: VehicleAudioState, volume: number, environment: number, dt: number) {
    dt = finiteClamp(dt, 0, .1);
    const speed = finiteClamp(Math.abs(state.speed), 0, 100);
    const rpm = finiteClamp(state.rpm, this.idleRpm, this.redlineRpm);
    this.rpm = smooth(this.rpm, rpm, finiteClamp(this.profile.rpmResponse, 1, 40), dt);
    this.load = smooth(this.load, state.refueling ? 0 : finiteClamp(state.load, 0, 1),
      finiteClamp(this.profile.loadResponse, 1, 30), dt);
    const vol = finiteClamp(volume, 0, 1), env = finiteClamp(environment, 0, 1);
    this.engineGain = vol*finiteClamp(this.profile.gain, 0, 1)*.7*(.38+.62*this.load)*(state.refueling ? 0 : 1);
    this.roadGain = env*.14*Math.pow(finiteClamp(speed/45, 0, 1), .85);
    this.windGain = env*.11*Math.pow(finiteClamp((speed-12)/48, 0, 1), 1.6);
    // Braking alone never fabricates a squeal. Slip is the normalized tire signal.
    const scrub = finiteClamp((state.slip - .12) / .88, 0, 1);
    this.skidGain = vol * .14 * finiteClamp(speed / 4, 0, 1) * Math.pow(scrub, 1.2);
    this.roadCutoff = 650 + Math.min(1300, speed*28);
    this.windCutoff = 900 + Math.min(2600, speed*40);
    this.skidFrequency = 1400 + scrub * 900;

    this.weights.fill(0);
    const n = this.anchors.length;
    if (!n) return;
    let lo = 0;
    while (lo<n-1 && this.rpm>this.anchors[lo+1]) lo++;
    const hi = Math.min(lo+1, n-1);
    const fraction = hi===lo ? 0 : finiteClamp(Math.log(this.rpm/this.anchors[lo])/Math.log(this.anchors[hi]/this.anchors[lo]), 0, 1);
    let low = Math.cos(fraction*Math.PI/2), high = hi===lo ? 0 : Math.sin(fraction*Math.PI/2);
    // Normalize equal-power weights to keep coherent/correlated loops within headroom.
    const bandSum = low+high; low/=bandSum; high/=bandSum;
    let on = Math.sin(this.load*Math.PI/2), off = Math.cos(this.load*Math.PI/2);
    const loadSum = on+off; on/=loadSum; off/=loadSum;
    this.weights[lo*2] = low*on; this.weights[lo*2+1] = low*off;
    if (hi!==lo) { this.weights[hi*2] = high*on; this.weights[hi*2+1] = high*off; }
    for (let i=0; i<n; i++) this.pitches[i] = finiteClamp(this.rpm/this.anchors[i], this.minPitch, this.maxPitch);
  }
}
