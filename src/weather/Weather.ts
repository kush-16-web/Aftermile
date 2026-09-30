import { clamp, damp, mod } from '../core/math.ts';
export type WeatherMode='clear'|'partly'|'overcast'|'fog'|'rain'|'heavy'|'storm'|'snow'|'autumn'|'random'|'live';
export interface WeatherState { wet:number;snow:number;cloud:number;fog:number;wind:number;temperature:number;autumn:number;storm:number }
export interface City { name:string;latitude:number;longitude:number;country?:string;timezone?:string }
export const PRESETS:Record<string,WeatherState>={
  clear:{wet:0,snow:0,cloud:.08,fog:0,wind:8,temperature:25,autumn:0,storm:0},
  partly:{wet:0,snow:0,cloud:.43,fog:.08,wind:14,temperature:23,autumn:0,storm:0},
  overcast:{wet:0,snow:0,cloud:.94,fog:.22,wind:18,temperature:18,autumn:0,storm:0},
  fog:{wet:.08,snow:0,cloud:.65,fog:.95,wind:4,temperature:14,autumn:0,storm:0},
  rain:{wet:.65,snow:0,cloud:.88,fog:.35,wind:22,temperature:17,autumn:0,storm:0},
  heavy:{wet:.95,snow:0,cloud:.97,fog:.57,wind:32,temperature:16,autumn:0,storm:.12},
  storm:{wet:1,snow:0,cloud:1,fog:.61,wind:48,temperature:19,autumn:0,storm:1},
  snow:{wet:0,snow:1,cloud:.83,fog:.45,wind:13,temperature:-3,autumn:0,storm:0},
  autumn:{wet:0,snow:0,cloud:.25,fog:.13,wind:25,temperature:15,autumn:1,storm:0},
};
export function modeFromCode(c:number):WeatherMode {
  if(c>=95)return 'storm';if((c>=71&&c<=77)||c===85||c===86)return 'snow';
  if(c===65||c===67||c===82)return 'heavy';if((c>=51&&c<=67)||(c>=80&&c<=82))return 'rain';
  if(c===45||c===48)return 'fog';if(c===3)return 'overcast';if(c===2)return 'partly';return 'clear';
}
export function lunarPhase(date:Date) {const days=(date.getTime()-Date.UTC(2000,0,6,18,14))/(86400*1000);return mod(days,29.53058867)/29.53058867;}
export function moonLabel(phase:number) {
  if(phase<.025||phase>.975)return 'New moon';if(phase<.23)return 'Waxing crescent';if(phase<.27)return 'First quarter';if(phase<.475)return 'Waxing gibbous';if(phase<.525)return 'Full moon';if(phase<.73)return 'Waning gibbous';if(phase<.77)return 'Last quarter';return 'Waning crescent';
}
export const weatherNames:Record<WeatherMode,string>={clear:'Clear skies',partly:'Partly cloudy',overcast:'Overcast',fog:'Low fog',rain:'Rain',heavy:'Heavy rain',storm:'Thunderstorm',snow:'Snowfall',autumn:'Autumn wind',random:'Changing skies',live:'Live weather'};
export class Weather {
  mode:WeatherMode='clear';condition:WeatherMode='clear';current={...PRESETS.clear};target={...PRESETS.clear};
  city:City|null=null;status='Simulation';lastFetch=0;lastFetchedAt=0;randomTimer=120;generation=0;pending=false;
  onChange:()=>void=()=>{};
  set(mode:WeatherMode) {
    this.mode=mode;
    if(mode!=='live'){this.generation++;this.pending=false;this.status='Simulation';this.condition=mode==='random'?'partly':mode;this.target={...PRESETS[this.condition]};}
    this.onChange();
  }
  update(dt:number) {
    for(const k of Object.keys(this.current) as (keyof WeatherState)[])this.current[k]=damp(this.current[k],this.target[k],.22,dt);
    if(this.mode==='random') {this.randomTimer-=dt;if(this.randomTimer<=0){const options=['clear','partly','rain','fog','autumn'] as const;this.condition=options[Math.floor(Math.random()*options.length)];this.target={...PRESETS[this.condition]};this.randomTimer=150+Math.random()*160;this.onChange();}}
    if(this.mode==='live'&&this.city&&!this.pending&&Date.now()-this.lastFetch>900000)void this.fetchCity(this.city);
  }
  async search(query:string):Promise<City[]> {
    const data=await request(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`);
    return (data.results??[]).filter((r:any)=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)).map((r:any)=>({name:r.name,latitude:r.latitude,longitude:r.longitude,country:r.country,timezone:r.timezone}));
  }
  async locate() {
    if(!navigator.geolocation)throw new Error('Location is unavailable. Search for a city instead.');
    const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:10000,maximumAge:300000}));
    return this.fetchCity({name:'Your location',latitude:position.coords.latitude,longitude:position.coords.longitude});
  }
  async fetchCity(city:City) {
    const token=++this.generation;this.pending=true;this.lastFetch=Date.now();this.status='Updating weather…';this.onChange();
    try {
      const fields='temperature_2m,weather_code,cloud_cover,wind_speed_10m,precipitation';
      const data=await request(`https://api.open-meteo.com/v1/forecast?latitude=${city.latitude.toFixed(3)}&longitude=${city.longitude.toFixed(3)}&current=${fields}&timezone=auto`);
      const c=data.current;if(!c||!Number.isFinite(c.temperature_2m)||!Number.isFinite(c.weather_code))throw new Error('Incomplete weather response');
      if(token!==this.generation)return;
      this.city={...city,timezone:data.timezone||city.timezone};this.mode='live';this.condition=modeFromCode(c.weather_code);
      this.target={...PRESETS[this.condition],temperature:c.temperature_2m,cloud:clamp(c.cloud_cover/100,0,1),wind:c.wind_speed_10m??8};
      if(c.precipitation>0&&this.condition!=='snow')this.target.wet=Math.max(this.target.wet,Math.min(1,c.precipitation/3));
      this.lastFetchedAt=Date.now();this.status='Live · Open-Meteo';
    }catch(error) {
      if(token!==this.generation)return;
      this.status=this.lastFetchedAt?'Weather unavailable · last conditions kept':'Weather unavailable · simulation active';
      if(!this.lastFetchedAt){this.mode='clear';this.condition='clear';this.target={...PRESETS.clear};}
      throw error;
    }finally{if(token===this.generation){this.pending=false;this.onChange();}}
  }
}
async function request(url:string) {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try {const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('Weather service is unavailable');return await response.json();}
  finally{clearTimeout(timeout);}
}
