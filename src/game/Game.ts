import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { Road } from '../road/Road.ts';
import { World } from '../world/World.ts';
import { Water } from '../world/Water.ts';
import { AmbientLife } from '../world/AmbientLife.ts';
import { VehicleController } from '../vehicle/VehicleController.ts';
import { CameraController, cameraNames } from '../vehicle/CameraController.ts';
import { InputManager } from '../core/InputManager.ts';
import { Settings, GRAPHICS } from '../systems/Settings.ts';
import type { SettingsData } from '../systems/Settings.ts';
import { Weather } from '../weather/Weather.ts';
import { Particles } from '../weather/Particles.ts';
import { Sky } from '../sky/Sky.ts';
import { Traffic, signalState } from '../traffic/Traffic.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { Companion } from '../companion/Companion.ts';
import { UI } from '../ui/UI.ts';
import { VehicleEffects } from '../vehicle/VehicleEffects.ts';
import { damp, clamp } from '../core/math.ts';

export class Game {
  settings=new Settings();scene=new THREE.Scene();road=new Road();vehicle=new VehicleController(this.road);car=this.vehicle.physics;input=new InputManager();weather=new Weather();audio=new AudioManager(this.vehicle.config);
  renderer:THREE.WebGLRenderer;camera=new THREE.PerspectiveCamera(60,1,.08,5000);cameras:CameraController;
  world:World;water:Water;life:AmbientLife;hero=this.vehicle.model;effects:VehicleEffects;traffic:Traffic;sky:Sky;particles:Particles;ui:UI;companion:Companion;
  composer:EffectComposer;fxaa:ShaderPass;
  screen:'menu'|'playing'|'paused'='menu';modalOpen=false;zen=false;hiddenHud=false;
  accumulator=0;lastTime=0;time=0;cinematicTime=0;fps=60;saveTimer=0;lastSavedDistance=0;lastRegion='';lastSense=0;mutedVolume=.5;
  season={snow:{value:0},autumn:{value:0}};
  position=new THREE.Vector3();frameNumber=0;lastOrigin=0;running=true;
  debug:{toggle:()=>void;update:()=>void}|null=null;
  constructor(canvas:HTMLCanvasElement) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.03;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.info.autoReset=false;
    this.world=new World(this.scene,this.road);this.sky=new Sky(this.scene);this.water=new Water(this.scene);this.life=new AmbientLife(this.scene,this.road,this.world.materials);
    this.effects=new VehicleEffects(this.scene);
    this.scene.add(this.hero.group);this.traffic=new Traffic(this.scene,this.road);this.particles=new Particles(this.scene);this.cameras=new CameraController(this.camera,canvas,this.vehicle.config);
    const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);this.scene.environment=pmrem.fromScene(environment,.04).texture;this.scene.environmentIntensity=.5;environment.dispose();pmrem.dispose();
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));this.composer.addPass(new OutputPass());this.fxaa=new ShaderPass(FXAAShader);this.composer.addPass(this.fxaa);
    this.world.materials.terrain.onBeforeCompile=shader=>{shader.uniforms.uSnow=this.season.snow;shader.uniforms.uAutumn=this.season.autumn;shader.fragmentShader='uniform float uSnow; uniform float uAutumn;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16,0.97,0.74),uAutumn);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75,0.80,0.82),uSnow*0.9);');};
    this.ui=new UI(this.settings,{
      start:zen=>this.start(zen),resume:()=>this.resume(),pause:()=>this.pause(),restart:()=>this.restart(),menu:()=>this.menu(),camera:()=>this.cycleCamera(),reset:()=>this.recover(),
      setting:(key,value)=>this.setSetting(key,value),modal:open=>{this.modalOpen=open;this.input.clear();this.input.enabled=!open&&this.screen==='playing';},
      search:q=>this.weather.search(q),city:async c=>{await this.weather.fetchCity(c);this.settings.data.weather='live';this.settings.data.timeMode='real';this.settings.save();},locate:async()=>{await this.weather.locate();this.settings.data.weather='live';this.settings.data.timeMode='real';this.settings.save();}
    });
    this.companion=new Companion(this.ui.companionCanvas);
    this.weather.onChange=()=>{this.settings.data.weather=this.weather.mode;};
    const weather=this.settings.data.weather;
    this.weather.set(weather==='live'?'clear':weather);
    if(weather==='live')this.ui.toast('Choose a city to reconnect live weather.');
    this.cameras.mode=this.settings.data.camera;this.applyGraphics();this.world.update(this.car.s,true);
    this.input.onAction=key=>{
      if(key==='F2'&&import.meta.env.DEV){this.debug?.toggle();return;}
      if(key==='Escape'){if(this.ui.activeOverlay)return;if(this.screen==='playing')this.pause();else if(this.screen==='paused')this.resume();return;}
      if(this.screen!=='playing'||this.modalOpen)return;
      if(key==='KeyC')this.cycleCamera();if(key==='KeyR')this.recover();
      if(key==='KeyL')this.ui.toast('Headlights · '+this.hero.lights.toggle());
      if(key==='KeyH'){this.hiddenHud=!this.hiddenHud;this.setHud();}
      if(key==='KeyM'){if(this.settings.data.master>0){this.mutedVolume=this.settings.data.master;this.setSetting('master',0);}else this.setSetting('master',this.mutedVolume||.5);this.ui.toast(this.settings.data.master===0?'Audio muted':'Audio on');}
    };
    this.sky.onThunder=()=>this.audio.thunder();
    window.addEventListener('resize',()=>this.resize());
    window.addEventListener('blur',()=>{if(this.screen==='playing')this.pause();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.persist();if(this.screen==='playing')this.pause();}this.lastTime=0;this.accumulator=0;});
    window.addEventListener('pagehide',()=>this.persist());
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.running=false;this.pause();this.ui.toast('Graphics paused. Waiting for your browser to restore the display.');});
    canvas.addEventListener('webglcontextrestored',()=>{this.running=true;this.lastTime=0;this.ui.toast('Graphics restored. Resume when you are ready.');});
    this.resize();void this.loadVehicle();
    if(import.meta.env.DEV)void import('../vehicle/VehicleDebug.ts').then(({VehicleDebug})=>{this.debug=new VehicleDebug(this.vehicle,()=>this.cameras.initialized=false);});
    requestAnimationFrame(t=>this.frame(t));
  }
  async loadVehicle(){this.ui.toast('Loading Nissan Skyline R34…');try{await this.hero.load();this.ui.toast('Nissan Skyline R34 ready · choose your drive');}catch{this.ui.toast('Nissan Skyline R34 could not load. Check your connection and select Drive to retry.');}}
  start(zen:boolean) {if(!this.hero.ready){if(this.hero.error)void this.loadVehicle();else this.ui.toast('The R34 is still loading…');return;}this.zen=zen;this.hiddenHud=zen&&this.settings.data.zenHideHud;this.screen='playing';this.input.clear();this.input.enabled=true;this.ui.setScreen('playing');this.setHud();void this.audio.start();this.ui.toast(zen?'Zen drive · no fuel, no hurry':'W to accelerate · A / D to steer · C for camera');}
  resume(){this.screen='playing';this.input.enabled=!this.modalOpen;this.input.clear();this.ui.setScreen('playing');void this.audio.start();}
  pause(){this.screen='paused';this.input.enabled=false;this.input.clear();this.audio.pause();this.ui.setScreen('paused');this.persist();}
  menu(){this.persist();this.screen='menu';this.input.enabled=false;this.input.clear();this.audio.pause();this.ui.setScreen('menu');document.body.classList.remove('zen-hidden');}
  restart(){this.persist();this.car.reset(160);this.car.fuel=100;this.car.distance=0;this.car.cleanDistance=0;this.car.damage=0;this.lastSavedDistance=0;this.traffic.reset();this.effects.reset();this.world.rebuild(this.car.s);this.cameras.initialized=false;this.start(this.zen);}
  recover(){this.car.reset();if(this.car.fuel<5)this.car.fuel=8;this.car.damage=0;this.cameras.initialized=false;this.effects.reset();this.audio.chime();this.ui.toast('Back on the road. Take your time.');}
  cycleCamera(){this.cameras.mode=(this.cameras.mode+1)%cameraNames.length;this.settings.data.camera=this.cameras.mode;this.settings.save();this.cameras.initialized=false;this.ui.showCameraBadge(cameraNames[this.cameras.mode]);this.ui.toast(cameraNames[this.cameras.mode]+' camera');}
  setHud(){document.body.classList.toggle('zen-hidden',this.hiddenHud);}
  setSetting(key:keyof SettingsData,value:unknown) {
    // Only controls with known types can mutate preferences.
    if(!(key in this.settings.data)||typeof value!==typeof this.settings.data[key])return;
    (this.settings.data as any)[key]=value;
    if(key==='quality')Object.assign(this.settings.data,GRAPHICS[this.settings.data.quality]);
    if(key==='weather'){this.weather.set(this.settings.data.weather);if(value==='live'&&!this.weather.city)this.ui.toast('Choose a city or use your location.');}
    if(key==='camera'){this.cameras.mode=this.settings.data.camera;this.cameras.initialized=false;}
    if(['quality','resolution','shadows','antialias','vegetation','theme'].includes(key)) {
      const oldVegetation=this.world.vegetation;this.applyGraphics();
      if(oldVegetation!==this.world.vegetation)this.world.rebuild(this.car.s);
    }
    this.settings.save();
  }
  applyGraphics() {
    const s=this.settings.data;
    this.world.vegetation=s.vegetation;this.world.range=s.quality==='low'?6:s.quality==='ultra'?10:8;
    this.renderer.shadowMap.enabled=s.shadows>0;this.sky.sun.castShadow=s.shadows>0;
    const size=[0,1024,2048,4096][s.shadows];
    if(size&&this.sky.sun.shadow.mapSize.x!==size){this.sky.sun.shadow.mapSize.set(size,size);this.sky.sun.shadow.map?.dispose();this.sky.sun.shadow.map=null;}
    this.fxaa.enabled=s.antialias;document.body.dataset.theme=s.theme;this.resize();
  }
  resize() {
    const width=window.innerWidth,height=window.innerHeight,s=this.settings.data;
    const ratio=s.theme==='retro'?.6:Math.min(window.devicePixelRatio||1,1.5)*s.resolution;
    this.renderer.setPixelRatio(ratio);this.renderer.setSize(width,height,false);this.composer.setPixelRatio(ratio);this.composer.setSize(width,height);
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.fxaa.material.uniforms.resolution.value.set(1/(width*ratio),1/(height*ratio));
  }
  persist() {this.settings.stats.total+=Math.max(0,this.car.distance-this.lastSavedDistance);this.lastSavedDistance=this.car.distance;this.settings.stats.best=Math.max(this.settings.stats.best,this.car.distance);this.settings.save();}
  snapshot() {return {screen:this.screen,modal:this.modalOpen,zen:this.zen,vehicle:this.vehicle.config.name,vehicleReady:this.hero.ready,rpm:this.car.rpm,gear:this.car.gear,steering:this.car.steering,yawRate:this.car.yawRate,s:this.car.s,offset:this.car.offset,speed:this.car.speed,fuel:this.car.fuel,fuelLitres:this.car.fuelLitres,fuelTankLitres:this.car.config.fuel.tankLitres,distance:this.car.distance,damage:this.car.damage,weather:this.weather.condition,weatherMode:this.weather.mode,region:this.road.region(this.car.s),camera:cameraNames[this.cameras.mode],fps:Math.round(this.fps),chunks:this.world.chunks.size,objects:this.world.objects,traffic:this.traffic.pool.filter(c=>c.active).length,memory:{...this.renderer.info.memory},drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,origin:this.world.origin};}
  frame(milliseconds:number) {
    requestAnimationFrame(t=>this.frame(t));if(!this.running||document.hidden){this.lastTime=0;return;}
    const raw=this.lastTime?Math.min((milliseconds-this.lastTime)/1000,.25):1/60;this.lastTime=milliseconds;
    const dt=Math.min(raw,.05);this.fps=damp(this.fps,1/Math.max(.001,raw),1.8,dt);this.cinematicTime+=dt;this.frameNumber++;
    const moving=this.screen==='playing'&&!this.modalOpen,s=this.settings.data;
    this.weather.update(dt);const w=this.weather.current;
    if(moving){this.accumulator+=dt;while(this.accumulator>=1/120){this.time+=1/120;this.vehicle.update(1/120,this.input.keys,s.fuel&&!this.zen,s.damage&&!this.zen);this.traffic.update(1/120,this.time,this.car,this.world.origin,s.traffic*(this.zen&&s.zenLowTraffic?.25:1),this.sky.night,w.wet+w.snow*.5,s.damage&&!this.zen);this.accumulator-=1/120;}}
    else this.accumulator=0;
    this.world.update(this.car.s);const origin=this.world.origin;
    if(origin!==this.lastOrigin){this.cameras.shiftOrigin(origin-this.lastOrigin);this.effects.shiftOrigin(origin-this.lastOrigin);this.lastOrigin=origin;}
    // Place the complete bounded traffic pool after origin shifts and while paused.
    this.traffic.update(dt,this.time,this.car,origin,s.traffic*(this.zen&&s.zenLowTraffic?.25:1),this.sky.night,w.wet,false,false);
    const station=this.road.station(this.car.s-50);
    const pose=this.vehicle.render(moving?this.accumulator*120:1,origin,this.sky.night);this.position.copy(this.hero.group.position);
    this.effects.update(dt,this.time,this.car,this.hero,this.camera,w.wet,w.snow);
    this.cameras.update(dt,this.cinematicTime,this.car,pose,origin,this.screen==='menu',s.fov,s.smoothing,s.reducedMotion);
    const inTunnel=this.road.isTunnel(this.car.s);
    this.sky.update(moving?dt:0,this.cinematicTime,this.camera,this.position,w,s.timeMode,s.hour,this.weather.mode==='live'?this.weather.city?.timezone:undefined,s.reducedFlashes);
    const sunDir = this.sky.sun.position.clone().sub(this.position).normalize();
    this.water.update(this.cinematicTime,this.position.z,this.sky.night,w.cloud,this.scene.fog as THREE.FogExp2,w.storm,this.sky.hour,sunDir);
    this.life.update(this.time,this.car.s,origin,this.sky.night < 0.6,w.storm > 0.4 || w.wet > 0.7);
    this.life.onBirdNearby = (pan: number) => {
      if (this.screen === 'playing') this.audio.birdCall(0.04, pan);
    };
    this.particles.update(dt,this.cinematicTime,this.position,w,s.particles,inTunnel,this.car.speed,this.car.lateralVelocity,this.car.slip);
    this.world.materials.update(w.wet,w.snow,w.autumn,this.sky.night,s.reflections,signalState(this.time),this.cinematicTime,w.wind);this.season.snow.value=w.snow;this.season.autumn.value=w.autumn;
    const wWeights=this.road.weights(this.car.s);
    const waterProximity=Math.max(0,Math.min(1,Math.max(wWeights.bridge*1.0,wWeights.coast*0.92,this.road.isBridge(this.car.s)?1.0:0)));
    this.audio.update(this.vehicle.audioState(),w.wet,inTunnel,!moving,s,this.cameras.mode===3,waterProximity);
    const danger=Math.max(this.traffic.sense,this.car.collisionTimer>.6?.65:0);
    if(danger>.5&&this.lastSense<=0&&moving&&s.sense>0){this.audio.chime(true);this.lastSense=5;}this.lastSense-=dt;
    this.companion.update(dt,this.cinematicTime,danger,this.zen?100:this.car.fuel,this.weather.condition,this.car.cleanDistance,s.reducedMotion);
    const region=this.road.region(this.car.s);
    if(this.frameNumber%4===0) {
      const navCurve: { x: number; y: number; marker?: string }[] = [];
      const currentHeading = this.road.heading(this.car.s);
      const cosH = Math.cos(currentHeading);
      const sinH = Math.sin(currentHeading);
      const p0 = this.road.point(this.car.s, 0);

      let navEvent: string | undefined;
      for (let ds = 0; ds <= 350; ds += 25) {
        const sampleS = this.car.s + ds;
        const pSample = this.road.point(sampleS, 0);
        const deltaX = pSample.x - p0.x;
        const deltaZ = pSample.z - p0.z;
        // Transform world delta into vehicle forward/lateral navigation coordinates
        const localForward = -deltaZ * cosH + deltaX * sinH;
        const localLateral = deltaX * cosH - (-deltaZ) * sinH;

        let marker: string | undefined;
        if (!navEvent && ds > 40) {
          if (Math.abs(station - sampleS) < 30) {
            marker = '⛽';
            navEvent = `HORIZON SERVICE · ${Math.round(ds)}m`;
          } else if (this.road.isBridge(sampleS)) {
            marker = '▰';
            navEvent = `BRIDGE · ${Math.round(ds)}m`;
          } else if (this.road.isTunnel(sampleS)) {
            marker = '▱';
            navEvent = `TUNNEL · ${Math.round(ds)}m`;
          } else if (Math.abs(this.road.bank(sampleS)) > 0.03) {
            marker = '↱';
            navEvent = `CURVE · ${Math.round(ds)}m`;
          }
        }
        navCurve.push({ x: localLateral, y: ds, marker });
      }

      this.hero.updateCockpit({
        speed: this.car.speed,
        rpm: this.car.rpm,
        gear: this.car.speed < -.3 ? 'R' : this.car.speed > .3 ? String(this.car.gear) : 'N',
        distance: this.car.distance,
        region: region.name,
        navCurve,
        navEvent,
        night: this.sky.night,
      }, dt * 4);

      this.ui.update({
        speed: this.car.speed,
        gear: this.car.speed < -.3 ? 'R' : this.car.speed > .3 ? String(this.car.gear) : 'N',
        rpm: this.car.rpm,
        fuel: this.car.fuel,
        distance: this.car.distance,
        region: region.name,
        regionProgress: region.progress,
        nextStation: station - this.car.s,
        temperature: w.temperature,
        hour: this.sky.hour,
        condition: this.weather.condition,
        weatherStatus: this.weather.status,
        city: this.weather.mode === 'live' ? this.weather.city?.name || 'LIVE WORLD' : '',
        camera: this.cameras.mode,
        zen: this.zen,
        fps: this.fps,
        refueling: this.car.refueling,
        canRefuel: Math.abs(this.car.s - station) < 28 && this.car.offset > 13 && this.car.offset < 33 && Math.abs(this.car.speed) < .6,
        danger,
        damage: this.car.damage,
        clean: this.car.cleanDistance,
        navCurve,
        navEvent,
      }, dt * 4);
      this.debug?.update();
      if(this.lastRegion&&this.lastRegion!==region.name&&moving)this.ui.toast('Entering '+region.name);this.lastRegion=region.name;
    }
    // Render live mirrors only in Cockpit mode (time-sliced for browser performance)
    if (this.cameras.mode === 3) {
      this.hero.renderMirrors(this.renderer, this.scene, this.frameNumber);
    }
    this.renderer.info.reset();this.composer.render();this.saveTimer+=dt;if(this.saveTimer>15){this.persist();this.saveTimer=0;}
  }
}
