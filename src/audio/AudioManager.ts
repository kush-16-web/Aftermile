import type { SettingsData } from '../systems/Settings.ts';
import { VehicleAudio } from './VehicleAudio.ts';
import type { VehicleAudioState } from './VehicleAudio.ts';
import { R34Config } from '../vehicle/VehicleConfig.ts';
import type { VehicleConfig } from '../vehicle/VehicleConfig.ts';
export class AudioManager {
  context:AudioContext|null=null;master!:GainNode;wind!:GainNode;rain!:GainNode;pad!:GainNode;thunderGain!:GainNode;
  vehicle!:VehicleAudio;available=true;
  constructor(private vehicleConfig:VehicleConfig=R34Config) {}
  async start() {
    try {
      if(this.context){await this.context.resume();return;}
      const ctx=this.context=new AudioContext();this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);
      const channel=(level=0)=>{const gain=ctx.createGain();gain.gain.value=level;gain.connect(this.master);return gain;};
      this.rain=channel();this.pad=channel();this.thunderGain=channel();this.vehicle=new VehicleAudio(ctx,this.master,this.vehicleConfig);this.wind=this.vehicle.wind;
      const buffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),data=buffer.getChannelData(0);let brown=0;
      for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.02)/1.02;data[i]=brown*3.5;}
      const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;
      const rainFilter=ctx.createBiquadFilter();rainFilter.type='highpass';rainFilter.frequency.value=450;noise.connect(rainFilter).connect(this.rain);
      const thunderFilter=ctx.createBiquadFilter();thunderFilter.type='lowpass';thunderFilter.frequency.value=140;noise.connect(thunderFilter).connect(this.thunderGain);noise.start();
      for(const [i,f] of [110,164.81,220,261.63].entries()){const osc=ctx.createOscillator();osc.type='sine';osc.frequency.value=f;const g=ctx.createGain();g.gain.value=.035;osc.connect(g).connect(this.pad);const lfo=ctx.createOscillator();lfo.frequency.value=.055+i*.008;const lfoGain=ctx.createGain();lfoGain.gain.value=.018;lfo.connect(lfoGain).connect(g.gain);lfo.start();osc.start();}
      await ctx.resume();
    }catch{this.available=false;this.context=null;}
  }
  update(state:VehicleAudioState,wet:number,tunnel:boolean,paused:boolean,settings:SettingsData) {
    const ctx=this.context;if(!ctx)return;const t=ctx.currentTime;
    const set=(p:AudioParam,value:number)=>p.setTargetAtTime(value,t,.1);
    set(this.master.gain,paused?0:settings.master*.7);
    this.vehicle.update(state,settings.engine,settings.environment,tunnel);
    set(this.rain.gain,settings.environment*wet*(tunnel?.03:.65));set(this.pad.gain,settings.music);
  }
  /** Visibility can stop RAF before update() runs: mute immediately. */
  pause() {
    const ctx=this.context;if(!ctx)return;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(0,ctx.currentTime);
    void ctx.suspend().catch(()=>{});
  }
  thunder() {const ctx=this.context;if(!ctx)return;const t=ctx.currentTime+1.3;this.thunderGain.gain.cancelScheduledValues(t);this.thunderGain.gain.setValueAtTime(0,t);this.thunderGain.gain.linearRampToValueAtTime(.9,t+.5);this.thunderGain.gain.exponentialRampToValueAtTime(.001,t+4);}
  chime(warning=false) {
    const ctx=this.context;if(!ctx)return;const osc=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime;osc.type='sine';osc.frequency.setValueAtTime(warning?280:620,t);osc.frequency.exponentialRampToValueAtTime(warning?220:820,t+.13);g.gain.setValueAtTime(.07,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);osc.connect(g).connect(this.master);osc.start();osc.stop(t+.35);
  }
}
