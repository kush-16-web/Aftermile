import { clamp } from '../core/math.ts';
import type { WeatherMode } from '../weather/Weather.ts';
export interface SettingsData {
  quality:'low'|'medium'|'high'|'ultra';resolution:number;shadows:number;traffic:number;vegetation:number;particles:number;reflections:boolean;antialias:boolean;
  fov:number;smoothing:number;master:number;engine:number;environment:number;music:number;sense:number;fuel:boolean;damage:boolean;
  navVoice:boolean;navVoiceVolume:number;navVoiceId:string;
  timeMode:'manual'|'accelerated'|'real';hour:number;weather:WeatherMode;units:'kmh'|'mph';theme:'midnight'|'superhero'|'retro';camera:number;
  selectedVehicle:string;
  reducedMotion:boolean;reducedFlashes:boolean;fps:boolean;assistant:boolean;zenHideHud:boolean;zenLowTraffic:boolean;
}
export const DEFAULTS:SettingsData={quality:'medium',resolution:1,shadows:1,traffic:.65,vegetation:.8,particles:.75,reflections:true,antialias:true,fov:60,smoothing:.6,master:.5,engine:.6,environment:.65,music:.12,sense:.6,fuel:true,damage:false,navVoice:true,navVoiceVolume:.85,navVoiceId:'',timeMode:'manual',hour:17.4,weather:'clear',units:'kmh',theme:'midnight',camera:0,selectedVehicle:'r34',reducedMotion:false,reducedFlashes:false,fps:false,assistant:true,zenHideHud:true,zenLowTraffic:true};
export const GRAPHICS={low:{resolution:.7,shadows:0,vegetation:.35,particles:.3},medium:{resolution:1,shadows:1,vegetation:.8,particles:.75},high:{resolution:1.25,shadows:2,vegetation:1,particles:1},ultra:{resolution:1.5,shadows:3,vegetation:1.3,particles:1}};
export class Settings {
  data:SettingsData={...DEFAULTS};storageAvailable=true;stats={total:0,best:0};
  constructor() {
    try {
      const raw=JSON.parse(localStorage.getItem('spider-midnight.settings.v1')||'{}');
      const ranges:Record<string,[number,number]>={resolution:[.5,1.5],shadows:[0,3],traffic:[0,1],vegetation:[.2,1.3],particles:[0,1],fov:[45,90],smoothing:[0,1],master:[0,1],engine:[0,1],environment:[0,1],music:[0,1],sense:[0,1],navVoiceVolume:[0,1],hour:[0,23.99],camera:[0,4]};
      const choices:Record<string,string[]>={quality:['low','medium','high','ultra'],weather:['clear','partly','overcast','fog','rain','heavy','storm','snow','autumn','random','live'],timeMode:['manual','accelerated','real'],units:['kmh','mph'],theme:['midnight','superhero','retro'],selectedVehicle:['r34','m4_gt3_evo']};

      for(const key of Object.keys(DEFAULTS) as (keyof SettingsData)[]) {
        const val=raw[key],fallback=DEFAULTS[key];
        if(typeof fallback==='boolean'&&typeof val==='boolean')(this.data as any)[key]=val;
        if(typeof fallback==='number'&&typeof val==='number'&&Number.isFinite(val)){const range=ranges[key];(this.data as any)[key]=range?clamp(val,...range):val;}
        if(typeof fallback==='string'){
          if(choices[key]?.includes(val) || key==='navVoiceId')(this.data as any)[key]=val;
        }
      }
      this.data.camera=Math.round(this.data.camera);this.data.shadows=Math.round(this.data.shadows);
      const stats=JSON.parse(localStorage.getItem('spider-midnight.stats.v1')||'{}');
      this.stats.total=Number.isFinite(stats.total)?Math.max(0,stats.total):0;this.stats.best=Number.isFinite(stats.best)?Math.max(0,stats.best):0;
      if(!('reducedMotion' in raw)&&matchMedia('(prefers-reduced-motion: reduce)').matches){this.data.reducedMotion=true;this.data.reducedFlashes=true;}
    }catch{this.storageAvailable=false;}
  }
  save() {try{localStorage.setItem('spider-midnight.settings.v1',JSON.stringify(this.data));localStorage.setItem('spider-midnight.stats.v1',JSON.stringify(this.stats));}catch{this.storageAvailable=false;}}
}
