import type { Settings, SettingsData } from '../systems/Settings.ts';
import type { City, WeatherMode } from '../weather/Weather.ts';
import { weatherNames, moonLabel, lunarPhase } from '../weather/Weather.ts';
import { cameraNames } from '../vehicle/CameraController.ts';

const icon=(name:string)=>{
  const paths:Record<string,string>={play:'<path d="m9 5 11 7-11 7z"/>',pause:'<path d="M8 5v14M16 5v14"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',moon:'<path d="M20 14A9 9 0 0 1 10 4a9 9 0 1 0 10 10Z"/>',rain:'<path d="M5 14a5 5 0 1 1 5-8 4 4 0 1 1 7 8M7 18l-1 3m7-3-1 3m7-3-1 3"/>',camera:'<path d="M3 7h5l2-3h4l2 3h5v13H3z"/><circle cx="12" cy="13" r="4"/>',fuel:'<path d="M4 21V4h10v17M2 21h14M6 7h6v5H6m8-4 4 4v6a2 2 0 0 0 4 0V8l-4-4"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',volume:'<path d="M4 9h4l5-4v14l-5-4H4zM17 8q5 4 0 8"/>',globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3q-7 9 0 18M12 3q7 9 0 18"/>',reset:'<path d="M4 5v5h5M4 10a8 8 0 1 1 1 8"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.sun}</svg>`;
};
export interface UIActions {
  start:(zen:boolean)=>void;resume:()=>void;pause:()=>void;restart:()=>void;menu:()=>void;camera:()=>void;reset:()=>void;
  setting:(key:keyof SettingsData,value:unknown)=>void;modal:(open:boolean)=>void;
  search:(query:string)=>Promise<City[]>;city:(city:City)=>Promise<void>;locate:()=>Promise<void>;
}
export interface HudState {speed:number;fuel:number;distance:number;region:string;regionProgress:number;nextStation:number;temperature:number;hour:number;condition:WeatherMode;weatherStatus:string;city:string;camera:number;zen:boolean;fps:number;gear:string;refueling:boolean;canRefuel:boolean;danger:number;damage:number;clean:number}
export class UI {
  root:HTMLElement;modal:HTMLDialogElement;tab='world';companionCanvas:HTMLCanvasElement;screen='menu';lastWeather='';lastToast='';toastTimer=0;
  elements:Record<string,HTMLElement>={};onScreenChanged:()=>void=()=>{};
  constructor(public settings:Settings,public actions:UIActions) {
    this.root=document.getElementById('app')!;
    this.root.innerHTML=`
      <div class="vignette" aria-hidden="true"></div><div id="sense" aria-hidden="true"></div>
      <header class="topbar"><a class="wordmark" href="#" aria-label="Spider Midnight main menu"><span class="brand-mark">✳</span><span>SPIDER<span class="wordmark-light">MIDNIGHT</span></span></a>
        <div class="location"><span class="eyebrow">ON THE ROAD</span><span id="region">Ember Coast</span><div class="route-line"><i id="route-progress"></i></div></div>
        <button class="weather-chip" id="weather-open" title="Weather and time">${icon('sun')}<span><strong id="weather-text">Clear skies · 25°</strong><span id="weather-time">17:24 · SIMULATION</span></span></button>
      </header>
      <main id="start-screen" class="start-screen">
        <div class="start-content"><div class="edition"><span></span> AN ENDLESS ROAD TRIP</div>
          <h1>SPIDER<br><span>MIDNIGHT</span><em>DRIVE</em></h1>
          <div class="start-actions"><button id="drive" class="primary">Drive ${icon('arrow')}</button><button id="zen-drive" class="secondary">Zen drive <span>Just you and the road</span></button></div>
          <div class="start-links"><button id="live-world">${icon('globe')} Live world</button><button id="settings-open">${icon('settings')} Settings</button></div>
          <p class="keyboard-note">Made for a keyboard. <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to drive.</p>
        </div>
        <div class="scene-caption"><span class="caption-rule"></span><span><b>CRIMSON / 01</b><small>Ember Coast · Golden hour</small></span></div>
      </main>
      <section id="hud" class="hud hidden" aria-label="Driving instruments">
        <div class="speed-cluster"><div class="drive-label"><span id="drive-mode">FREE DRIVE</span><span id="gear">N</span></div><div class="speed-row"><span id="speed">0</span><span id="speed-unit">KM/H</span></div>
          <div class="speed-track"><i id="speed-progress"></i></div>
          <div class="fuel-row">${icon('fuel')}<span id="fuel">100%</span><span class="fuel-track"><i id="fuel-progress"></i></span><span id="distance">0.0 km</span></div>
        </div>
        <div class="drive-help"><span><kbd>W A S D</kbd> Drive</span><button id="camera-button"><kbd>C</kbd><span id="camera-name">Chase</span></button><button id="pause-button"><kbd>ESC</kbd> Pause</button></div>
        <div class="companion-card"><canvas id="companion" aria-label="Spider digital driving companion"></canvas><div><span class="eyebrow">SUIT AI <i></i></span><p id="suit-message">Easy on the throttle. Enjoy the coast.</p></div></div>
        <div id="refuel-prompt" class="refuel-prompt hidden"><kbd>E</kbd><span id="refuel-text">Hold to refuel</span></div>
        <div id="fuel-warning" class="fuel-warning hidden"></div>
      </section>
      <section id="pause-screen" class="pause-screen hidden"><div class="pause-content"><span class="eyebrow">TAKE A BREATHER</span><h2>Drive paused.</h2><p id="pause-trip">The road will be here.</p><button id="resume" class="primary">Resume ${icon('play')}</button><button id="pause-world" class="menu-row">Weather & time ${icon('sun')}</button><button id="pause-settings" class="menu-row">Settings ${icon('settings')}</button><button id="restart" class="menu-row">Restart drive ${icon('reset')}</button><button id="main-menu" class="text-button">Return to main menu</button></div></section>
      <div id="toast" class="toast hidden" role="status" aria-live="polite"></div>
      <div id="fps" class="fps hidden"></div>
      <footer id="start-footer"><span>SCENIC ROADS. NO FINISH LINE.</span><button id="controls-open">Controls ${icon('arrow')}</button><span id="best-drive">YOUR NEXT ROAD TRIP STARTS HERE</span></footer>
      <dialog id="settings-dialog" aria-labelledby="dialog-title"><div class="dialog-top"><div><span class="eyebrow">MAKE IT YOUR DRIVE</span><h2 id="dialog-title">Settings</h2></div><button id="close-dialog" class="icon-button" aria-label="Close settings">${icon('close')}</button></div><div class="settings-tabs" role="tablist" aria-label="Settings categories">${[['world','World'],['driving','Driving'],['graphics','Graphics'],['audio','Audio'],['controls','Controls']].map(([id,label])=>`<button role="tab" id="tab-${id}" data-tab="${id}" aria-controls="settings-body" aria-selected="${id==='world'}">${label}</button>`).join('')}</div><div id="settings-body" class="settings-body" role="tabpanel"></div><div class="dialog-bottom"><span id="save-status">Preferences saved on this device</span><button id="done-settings" class="small-primary">Done ${icon('arrow')}</button></div></dialog>
    `;
    this.modal=this.root.querySelector('dialog')!;this.companionCanvas=document.getElementById('companion') as HTMLCanvasElement;
    const ids=['region','route-progress','weather-text','weather-time','speed','gear','speed-unit','speed-progress','fuel','fuel-progress','distance','drive-mode','camera-name','suit-message','refuel-prompt','refuel-text','fuel-warning','fps','sense','toast'];ids.forEach(id=>this.elements[id]=document.getElementById(id)!);
    const click=(id:string,fn:()=>void)=>document.getElementById(id)!.addEventListener('click',fn);
    click('drive',()=>actions.start(false));click('zen-drive',()=>actions.start(true));click('resume',actions.resume);click('restart',actions.restart);click('main-menu',actions.menu);click('camera-button',actions.camera);click('pause-button',actions.pause);
    click('settings-open',()=>this.openSettings('graphics'));click('weather-open',()=>this.openSettings('world'));click('live-world',()=>{this.openSettings('world');document.getElementById('city-search')?.focus();});click('controls-open',()=>this.openSettings('controls'));click('pause-world',()=>this.openSettings('world'));click('pause-settings',()=>this.openSettings('graphics'));
    click('close-dialog',()=>this.closeSettings());click('done-settings',()=>this.closeSettings());
    this.modal.addEventListener('cancel',e=>{e.preventDefault();this.closeSettings();});
    this.modal.addEventListener('click',e=>{if(e.target===this.modal){const r=this.modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.closeSettings();}});
    this.root.querySelector('.wordmark')!.addEventListener('click',e=>{e.preventDefault();if(this.screen==='playing')actions.pause();else actions.menu();});
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button=>{button.onclick=()=>{this.tab=button.dataset.tab!;this.renderSettings();};button.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const tabs=['world','driving','graphics','audio','controls'],next=(tabs.indexOf(this.tab)+(e.key==='ArrowRight'?1:4))%5;this.tab=tabs[next];this.renderSettings();document.getElementById('tab-'+this.tab)?.focus();}};});
    this.renderSettings();this.setScreen('menu');
    document.getElementById('best-drive')!.textContent=settings.stats.best>100?`LONGEST DRIVE  ${(settings.stats.best/1000).toFixed(1)} KM`:'YOUR NEXT ROAD TRIP STARTS HERE';
  }
  setScreen(screen:string) {
    this.screen=screen;document.body.dataset.screen=screen;
    for(const [id,visible]of [['start-screen',screen==='menu'],['start-footer',screen==='menu'],['hud',screen==='playing'],['pause-screen',screen==='paused']] as const)document.getElementById(id)!.classList.toggle('hidden',!visible);
    if(screen==='playing')(document.activeElement as HTMLElement)?.blur();
  }
  openSettings(tab=this.tab) {this.tab=tab;this.actions.modal(true);this.renderSettings();if(!this.modal.open)this.modal.showModal();}
  closeSettings(){this.modal.close();this.actions.modal(false);if(this.screen==='playing')(document.activeElement as HTMLElement)?.blur();}
  renderSettings() {
    const data=this.settings.data;
    this.root.querySelectorAll<HTMLElement>('[data-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===this.tab));b.setAttribute('tabindex',b.dataset.tab===this.tab?'0':'-1');});
    document.getElementById('settings-body')!.setAttribute('aria-labelledby','tab-'+this.tab);
    const range=(key:keyof SettingsData,label:string,min=0,max=1,step=.05)=>`<label class="setting-row" for="setting-${key}"><span>${label}</span><span class="range-wrap"><input id="setting-${key}" data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${data[key]}"/><output for="setting-${key}">${max===1?Math.round(Number(data[key])*100)+'%':Number(data[key]).toFixed(step<1?1:0)}</output></span></label>`;
    const toggle=(key:keyof SettingsData,label:string)=>`<label class="setting-row" for="setting-${key}"><span>${label}</span><input class="toggle" id="setting-${key}" data-setting="${key}" type="checkbox" ${data[key]?'checked':''}/></label>`;
    const select=(key:keyof SettingsData,label:string,options:[string,string][])=>`<label class="setting-row" for="setting-${key}"><span>${label}</span><select id="setting-${key}" data-setting="${key}">${options.map(([v,l])=>`<option value="${v}" ${String(data[key])===v?'selected':''}>${l}</option>`).join('')}</select></label>`;
    let html='';
    if(this.tab==='world')html=`<p class="section-label">Choose the atmosphere</p><div class="weather-presets">${[['clear','Summer clear','sun'],['autumn','Autumn wind','sun'],['storm','Monsoon storm','rain'],['snow','Global winter','moon']].map(([v,l,i])=>`<button class="weather-preset ${data.weather===v?'active':''}" data-weather="${v}">${icon(i)}<span>${l}</span></button>`).join('')}</div>
      ${select('weather','Weather',[...Object.entries(weatherNames)])}
      ${select('timeMode','Time',['manual','accelerated','real'].map(x=>[x,x==='real'?'Real time':x==='manual'?'Set a time':'Accelerated']))}
      ${range('hour','Time of day',0,23.9,.1)}<div class="hour-labels"><span>Midnight</span><span>Noon</span><span>Midnight</span></div>
      <div class="live-heading"><span class="section-label">Live world</span><button id="use-location" class="text-button">${icon('globe')} Use my location</button></div><p class="setting-description">Bring a city’s weather to your road. Location is requested only when you choose it.</p>
      <form id="city-form" class="city-form"><input id="city-search" aria-label="Search city" placeholder="Search a city…" minlength="2" maxlength="80" autocomplete="off" required><button class="small-primary" type="submit">Search</button></form><div id="city-results" class="city-results" role="status"></div><p class="weather-credit">Weather by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · ${moonLabel(lunarPhase(new Date()))}</p>`;
    if(this.tab==='driving')html=`${select('units','Speed & distance',[['kmh','km/h & km'],['mph','mph & miles']])}${select('camera','Default camera',cameraNames.map((v,i)=>[String(i),v]))}${range('fov','Field of view',45,90,1)}${range('smoothing','Camera smoothing')}${toggle('fuel','Fuel consumption')}${toggle('damage','Vehicle damage indicator')}${range('sense','Spider-Sense intensity')}${toggle('assistant','Suit AI messages')}${toggle('zenHideHud','Hide instruments in Zen mode')}${toggle('zenLowTraffic','Lighter traffic in Zen mode')}<p class="setting-description">Zen drive always disables fuel and damage. Press H to show or hide instruments. Recovery brings you safely back onto the road.</p>`;
    if(this.tab==='graphics')html=`${select('quality','Quality preset',[['low','Low'],['medium','Medium'],['high','High'],['ultra','Ultra']])}${range('resolution','Resolution scale',.5,1.5,.1)}${select('shadows','Shadow quality',[['0','Off'],['1','Low'],['2','Medium'],['3','High']])}${range('traffic','Traffic density')}${range('vegetation','Vegetation density',.2,1.3,.1)}${range('particles','Weather particles')}${toggle('reflections','Wet-road sheen')}${toggle('antialias','Anti-aliasing')}${select('theme','Visual theme',[['midnight','Spider Midnight'],['superhero','Superhero'],['retro','Retro']])}${toggle('reducedMotion','Reduced motion')}${toggle('reducedFlashes','Reduce lightning flashes')}${toggle('fps','Show performance')}<p class="setting-description">Start with Medium. Lower resolution and shadows if the drive feels uneven. Reflections use a lightweight material effect.</p>`;
    if(this.tab==='audio')html=`${range('master','Master volume')}${range('engine','Engine volume')}${range('environment','Environment volume')}${range('music','Ambient music')}<p class="setting-description">Original synthesized engine, weather and ambient music. Audio begins when you start driving.</p>`;
    if(this.tab==='controls')html=`<div class="controls-list">${[['W / ↑','Accelerate'],['S / ↓','Brake · hold to reverse'],['A D / ← →','Steer'],['Space','Handbrake'],['C','Cycle cameras'],['R','Recover vehicle'],['E','Hold to refuel at a pump'],['Esc','Pause / resume'],['H','Hide / show instruments'],['M','Mute / unmute'],['L','Headlights · auto / on / off'],['Right mouse + drag','Look around']].map(([key,label])=>`<div><span>${label}</span><kbd>${key}</kbd></div>`).join('')}</div><p class="setting-description">To refuel, pull into the cyan-bordered station bay, stop, and hold E. If you run out, use R for roadside recovery and a small emergency fuel reserve.</p><div class="stats-pair"><div><span class="eyebrow">TOTAL DISTANCE</span><strong>${(this.settings.stats.total/1000).toFixed(1)} km</strong></div><div><span class="eyebrow">LONGEST DRIVE</span><strong>${(this.settings.stats.best/1000).toFixed(1)} km</strong></div></div>`;
    document.getElementById('settings-body')!.innerHTML=html;
    document.getElementById('save-status')!.textContent=this.settings.storageAvailable?'Preferences saved on this device':'Browser storage unavailable · preferences last for this visit';
    this.root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-setting]').forEach(el=>el.addEventListener('change',()=>{
      const key=el.dataset.setting as keyof SettingsData;let value:unknown=el.value;
      if(el instanceof HTMLInputElement&&el.type==='checkbox')value=el.checked;
      else if(typeof data[key]==='number')value=Number(el.value);
      this.actions.setting(key,value);if(key==='quality'||key==='weather')this.renderSettings();
    }));
    this.root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(el=>el.addEventListener('input',()=>{const out=el.nextElementSibling;if(out)out.textContent=Number(el.max)===1?Math.round(Number(el.value)*100)+'%':Number(el.value).toFixed(Number(el.step)<1?1:0);}));
    this.root.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach(b=>b.onclick=()=>{this.actions.setting('weather',b.dataset.weather);this.renderSettings();});
    const form=document.getElementById('city-form') as HTMLFormElement|null;
    if(form)form.onsubmit=async e=>{e.preventDefault();const results=document.getElementById('city-results')!,query=(document.getElementById('city-search') as HTMLInputElement).value.trim();results.textContent='Finding cities…';try{const cities=await this.actions.search(query);if(!results.isConnected)return;results.textContent=cities.length?'':'No cities found. Try another spelling.';for(const city of cities){const b=document.createElement('button');b.type='button';b.textContent=`${city.name}${city.country?', '+city.country:''}`;b.onclick=async()=>{results.textContent='Updating the sky…';try{await this.actions.city(city);results.textContent=`Live weather for ${city.name} is ready.`;this.toast('Live world connected.');}catch{results.textContent='Weather is unavailable. Your drive still works in simulation.';}};results.appendChild(b);}}catch{results.textContent='City search is unavailable. Try a weather preset for now.';}};
    const location=document.getElementById('use-location') as HTMLButtonElement|null;
    if(location)location.onclick=async()=>{const results=document.getElementById('city-results')!;location.disabled=true;results.textContent='Waiting for location permission…';try{await this.actions.locate();results.textContent='Live weather for your location is ready.';}catch{results.textContent='Location or weather is unavailable. Search for a city or use a preset.';}finally{location.disabled=false;}};
  }
  update(state:HudState,dt:number) {
    const e=this.elements,d=this.settings.data,miles=d.units==='mph',factor=miles?2.23694:3.6,distFactor=miles?1609.344:1000,unit=miles?'mi':'km';
    e.speed.textContent=String(Math.round(Math.abs(state.speed)*factor));e.gear.textContent=state.gear;e['speed-unit'].textContent=miles?'MPH':'KM/H';
    e['speed-progress'].style.width=Math.min(100,Math.abs(state.speed)/65*100)+'%';e.fuel.textContent=state.zen||!d.fuel?'∞':Math.round(state.fuel)+'%';e['fuel-progress'].style.width=state.zen||!d.fuel?'100%':state.fuel+'%';
    e.distance.textContent=(state.distance/distFactor).toFixed(1)+' '+unit;e.region.textContent=state.region;e['route-progress'].style.width=state.regionProgress*100+'%';
    e['drive-mode'].textContent=state.zen?'ZEN DRIVE':'FREE DRIVE';e['camera-name'].textContent=cameraNames[state.camera];
    e['weather-text'].textContent=`${weatherNames[state.condition]} · ${Math.round(state.temperature)}°`;
    const hour=Math.floor(state.hour),minutes=Math.floor((state.hour-hour)*60);e['weather-time'].textContent=`${String(hour).padStart(2,'0')}:${String(minutes).padStart(2,'0')} · ${state.city||'SIMULATION'}`;
    e['refuel-prompt'].classList.toggle('hidden',!state.canRefuel);e['refuel-text'].textContent=state.refueling?`Refueling · ${Math.round(state.fuel)}%`:'Hold to refuel';
    e['fuel-warning'].classList.toggle('hidden',state.fuel>20||state.zen||!d.fuel);e['fuel-warning'].textContent=state.fuel<=0?'Fuel empty · R for roadside assistance':`Low fuel · Night Owl ${Math.max(0,state.nextStation/distFactor).toFixed(1)} ${unit}`;
    e.fps.classList.toggle('hidden',!d.fps);e.fps.textContent=`${Math.round(state.fps)} FPS`;
    e.sense.style.opacity=String(state.danger*d.sense*.75);
    this.root.querySelector('.companion-card')!.classList.toggle('quiet',!d.assistant);
    let message='Easy on the throttle. Enjoy the coast.';
    if(state.danger>.2)message='Closing fast. Give them some room.';
    else if(state.refueling)message=state.fuel>=99?'All topped up. The road is yours.':'A little pause. A little more road.';
    else if(state.fuel<20&&!state.zen&&d.fuel)message='Running low. Look for Night Owl fuel.';
    else if(state.condition==='storm'||state.condition==='heavy')message='Wet roads ahead. Brake a little earlier.';
    else if(state.condition==='snow')message='Easy on the steering. Grip is lower.';
    else if(state.nextStation<260&&state.nextStation>40)message='Night Owl fuel is coming up on your right.';
    else if(state.clean>1000)message=`${(state.clean/1000).toFixed(1)} km without a bump. Nicely done.`;
    else if(state.hour>20||state.hour<5)message='Headlights on. Settle into the night.';
    else if(state.region.toLowerCase().includes('crossing')||state.region.toLowerCase().includes('bridge'))message='Open water. A good moment to take it in.';
    e['suit-message'].textContent=message;
    this.toastTimer-=dt;if(this.toastTimer<=0)e.toast.classList.add('hidden');
    document.getElementById('pause-trip')!.textContent=`${(state.distance/distFactor).toFixed(1)} ${unit} through ${state.region}.`;
  }
  toast(message:string) {this.elements.toast.textContent=message;this.elements.toast.classList.remove('hidden');this.toastTimer=3.5;}
}
