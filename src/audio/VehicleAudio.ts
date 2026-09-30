import type { VehicleConfig } from '../vehicle/VehicleConfig.ts';
import { VehicleAudioControls, finiteClamp } from './VehicleAudioControls.ts';
import type { VehicleAudioState } from './VehicleAudioControls.ts';
export type { VehicleAudioState } from './VehicleAudioControls.ts';

const MAX_DOWNLOAD_BYTES = 1024*1024;
const MAX_DECODED_BYTES = 12*1024*1024;
type RecordingStatus = 'needs-recordings' | 'loading' | 'partial' | 'recorded' | 'disposed';
interface LoopVoice { source: AudioBufferSourceNode; gain: GainNode; slot: number; }
const target = (param: AudioParam, value: number, time: number, seconds = .065) =>
  param.setTargetAtTime(value, time, seconds);

/** Real recordings only for the engine. Missing URLs are intentionally silent,
 * never substituted with a pretend RB26 oscillator. All loops run continuously
 * so gain/pitch automation can crossfade without restarting playback. */
export class VehicleAudio {
  readonly engine: GainNode; readonly road: GainNode; readonly wind: GainNode;
  readonly skid: GainNode; readonly tunnel: GainNode;
  readonly engineFilter: BiquadFilterNode; readonly roadFilter: BiquadFilterNode;
  readonly skidFilter: BiquadFilterNode;
  readonly controls: VehicleAudioControls;
  readonly ready: Promise<void>;
  recordingStatus: RecordingStatus = 'needs-recordings';
  readonly recordingErrors: string[] = [];
  decodedBytes = 0; downloadedBytes = 0; loadedLoops = 0;
  readonly noiseBytes: number;
  private readonly voices: LoopVoice[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly abort = new AbortController();
  private readonly windFilter: BiquadFilterNode;
  private readonly noise: AudioBufferSourceNode;
  private disposed = false;
  private previousTime: number;
  private previousAutomation = -Infinity;

  constructor(private context: AudioContext, master: GainNode, config: VehicleConfig) {
    // Copy only at construction; live physics config mutation cannot invalidate slots.
    const profile = { ...config.audio, bands: config.audio.bands.map(b => ({...b})).sort((a,b) => a.rpm-b.rpm) };
    profile.bands = profile.bands.filter((b,i,all) => Number.isFinite(b.rpm) && b.rpm>0 && (!i || b.rpm!==all[i-1].rpm)).slice(0,8);
    this.controls = new VehicleAudioControls(profile, config.engine.idleRpm, config.engine.redlineRpm);
    this.previousTime = context.currentTime;
    const gain = () => { const g = context.createGain(); g.gain.value=0; this.nodes.push(g); return g; };
    const filter = (type: BiquadFilterType, frequency: number, q = .7) => {
      const f=context.createBiquadFilter(); f.type=type; f.frequency.value=frequency; f.Q.value=q; this.nodes.push(f); return f;
    };
    // Compression is a guard; conservative source normalization and gain budgets do the mixing.
    const bus=context.createGain(), limiter=context.createDynamicsCompressor();
    bus.gain.value=.85; limiter.threshold.value=-6; limiter.knee.value=3;
    limiter.ratio.value=12; limiter.attack.value=.003; limiter.release.value=.15;
    bus.connect(limiter).connect(master); this.nodes.push(bus,limiter);
    this.engine=gain(); this.road=gain(); this.wind=gain(); this.skid=gain(); this.tunnel=gain();
    this.engine.connect(bus); this.road.connect(bus); this.wind.connect(bus); this.skid.connect(bus); this.tunnel.connect(bus);
    this.engineFilter=filter('lowpass',5500); this.engineFilter.connect(this.engine);
    const delay=context.createDelay(.2); delay.delayTime.value=.105; this.nodes.push(delay);
    // One bounded reflection, no feedback. Reflection follows engine volume/refueling.
    this.engine.connect(delay).connect(this.tunnel);
    this.roadFilter=filter('lowpass',650);
    const roadHighpass=filter('highpass',65); roadHighpass.connect(this.roadFilter).connect(this.road);
    const windHighpass=filter('highpass',350); this.windFilter=filter('lowpass',900);
    windHighpass.connect(this.windFilter).connect(this.wind);
    this.skidFilter=filter('bandpass',1600,4); this.skidFilter.connect(this.skid);
    const buffer=context.createBuffer(1,Math.floor(context.sampleRate*2),context.sampleRate);
    const samples=buffer.getChannelData(0); let a=0,b=0,c=0;
    for(let i=0;i<samples.length;i++) {
      const white=Math.random()*2-1; a=.99765*a+white*.099046; b=.963*b+white*.2965164; c=.57*c+white*1.0526913;
      samples[i]=finiteClamp((a+b+c+white*.1848)*.06,-.45,.45);
    }
    // A short wrap crossfade avoids a click in the procedural ambience loop.
    const seam=Math.min(256,Math.floor(samples.length/4));
    for(let i=0;i<seam;i++){const f=i/seam;samples[samples.length-seam+i]=samples[samples.length-seam+i]*(1-f)+samples[i]*f;}
    this.noiseBytes=samples.byteLength;
    this.noise=context.createBufferSource(); this.noise.buffer=buffer; this.noise.loop=true;
    this.noise.loopStart=seam/context.sampleRate;
    this.noise.connect(roadHighpass); this.noise.connect(windHighpass); this.noise.connect(this.skidFilter); this.noise.start();
    this.nodes.push(this.noise);
    this.ready=this.loadRecordings(profile.bands);
  }

  private async loadRecordings(bands: VehicleConfig['audio']['bands']) {
    if (!bands.some(b=>b.onLoad || b.offLoad)) return;
    this.recordingStatus='loading';
    const cache=new Map<string,AudioBuffer>();
    // Sequential decode bounds transient memory and prevents ten simultaneous decodes.
    for(let i=0;i<bands.length;i++) for(let mode=0;mode<2;mode++) {
      const url=mode===0?bands[i].onLoad:bands[i].offLoad;
      if(!url || this.disposed) continue;
      try {
        let buffer=cache.get(url);
        if(!buffer) {
          const response=await fetch(url,{signal:this.abort.signal});
          if(!response.ok) throw new Error(`HTTP ${response.status}`);
          if(Number(response.headers.get('Content-Length'))>MAX_DOWNLOAD_BYTES) throw new Error('loop download exceeds 1 MiB');
          const bytes=await response.arrayBuffer();
          if(bytes.byteLength>MAX_DOWNLOAD_BYTES) throw new Error('loop download exceeds 1 MiB');
          this.downloadedBytes+=bytes.byteLength;
          buffer=await this.context.decodeAudioData(bytes);
          if(this.disposed) return;
          if(buffer.numberOfChannels!==1 || buffer.duration<.75 || buffer.duration>6) throw new Error('loops must be mono and 0.75–6 seconds');
          const memory=buffer.length*4;
          if(this.decodedBytes+memory>MAX_DECODED_BYTES) throw new Error('decoded engine budget exceeds 12 MiB');
          const data=buffer.getChannelData(0); let dc=0,peak=0;
          for(let j=0;j<data.length;j++){if(!Number.isFinite(data[j]))throw new Error('invalid PCM');dc+=data[j];}
          dc/=data.length;
          for(let j=0;j<data.length;j++)peak=Math.max(peak,Math.abs(data[j]-dc));
          if(peak<.0001) throw new Error('silent engine recording');
          const scale=.45/peak;
          for(let j=0;j<data.length;j++)data[j]=(data[j]-dc)*scale;
          this.decodedBytes+=memory; cache.set(url,buffer);
        }
        const source=this.context.createBufferSource(),gain=this.context.createGain();
        source.buffer=buffer; source.loop=true; source.playbackRate.value=1; gain.gain.value=0;
        source.connect(gain).connect(this.engineFilter);
        // Stable, decorrelated phase offset; never introduce pitch wobble/random looping.
        source.start(this.context.currentTime,(i*.137+mode*.071)%buffer.duration);
        this.voices.push({source,gain,slot:i*2+mode}); this.nodes.push(source,gain); this.loadedLoops++;
      } catch(error) {
        if(this.disposed) return;
        this.recordingErrors.push(`${url}: ${error instanceof Error?error.message:String(error)}`);
      }
    }
    if(!this.disposed) this.recordingStatus=this.loadedLoops===bands.length*2?'recorded':this.loadedLoops?'partial':'needs-recordings';
  }

  update(state: VehicleAudioState, volume: number, environment: number, inTunnel: boolean) {
    if(this.disposed) return;
    const t=this.context.currentTime,dt=t-this.previousTime; this.previousTime=t;
    this.controls.update(state,volume,environment,dt);
    // Automation at <=30 Hz avoids per-render-frame event churn. AudioParams interpolate.
    if(t-this.previousAutomation<1/30) return;
    this.previousAutomation=t; const c=this.controls;
    for(let i=0;i<this.voices.length;i++) {
      const voice=this.voices[i]; target(voice.gain.gain,c.weights[voice.slot],t);
      target(voice.source.playbackRate,c.pitches[voice.slot>>1],t,.045);
    }
    target(this.engine.gain,c.engineGain,t); target(this.engineFilter.frequency,3000+c.load*3000,t);
    target(this.road.gain,c.roadGain,t); target(this.wind.gain,c.windGain*(inTunnel?.45:1),t);
    target(this.skid.gain,c.skidGain,t,.035); target(this.tunnel.gain,inTunnel?.15:0,t,.15);
    target(this.roadFilter.frequency,c.roadCutoff,t); target(this.windFilter.frequency,c.windCutoff,t);
    target(this.skidFilter.frequency,c.skidFrequency,t);
  }

  /** Optional host teardown. Suspended/paused contexts must remain resumable. */
  dispose() {
    if(this.disposed) return;
    this.disposed=true; this.recordingStatus='disposed'; this.abort.abort();
    this.noise.stop(); this.noise.buffer=null;
    for(let i=0;i<this.voices.length;i++){this.voices[i].source.stop();this.voices[i].source.buffer=null;}
    for(let i=0;i<this.nodes.length;i++)this.nodes[i].disconnect();
    this.voices.length=0; this.nodes.length=0; this.decodedBytes=0;
  }
}
