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
import type { VehiclePhysics } from '../vehicle/VehiclePhysics.ts';
import type { PlayerVehicleModel } from '../vehicle/PlayerVehicleModel.ts';
import { CameraController, cameraNames } from '../vehicle/CameraController.ts';
import { InputManager } from '../core/InputManager.ts';
import { Settings, GRAPHICS } from '../systems/Settings.ts';
import type { SettingsData } from '../systems/Settings.ts';
import { ENVIRONMENT_TIMES } from '../weather/Environment.ts';
import { Weather } from '../weather/Weather.ts';
import { Particles } from '../weather/Particles.ts';
import { Sky } from '../sky/Sky.ts';
import { Traffic, signalState } from '../traffic/Traffic.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { NavigationVoice } from '../audio/NavigationVoice.ts';
import type { ManeuverEvent } from '../audio/NavigationVoice.ts';
import { Companion } from '../companion/Companion.ts';
import { UI } from '../ui/UI.ts';
import { VehicleEffects } from '../vehicle/VehicleEffects.ts';
import { damp, clamp } from '../core/math.ts';
import { getVehicleConfig, getAllVehicles } from '../vehicle/VehicleRegistry.ts';
import { GarageController } from '../garage/GarageController.ts';

export class Game {
  settings = new Settings();
  scene = new THREE.Scene();
  road = new Road();
  vehicles = new Map<string, VehicleController>();
  vehicle: VehicleController;
  car: VehiclePhysics;
  hero: PlayerVehicleModel;
  input = new InputManager();
  weather = new Weather();
  audio: AudioManager;
  navVoice = new NavigationVoice();
  renderer: THREE.WebGLRenderer;
  camera = new THREE.PerspectiveCamera(60, 1, .08, 5000);
  cameras: CameraController;
  world: World;
  water: Water;
  life: AmbientLife;
  effects: VehicleEffects;
  traffic: Traffic;
  sky: Sky;
  particles: Particles;
  ui: UI;
  companion: Companion;
  garage: GarageController;
  composer: EffectComposer;
  fxaa: ShaderPass;
  screen: 'menu' | 'playing' | 'paused' = 'menu';
  modalOpen = false;
  zen = false;
  hiddenHud = false;
  accumulator = 0;
  lastTime = 0;
  time = 0;
  cinematicTime = 0;
  fps = 60;
  saveTimer = 0;
  lastSavedDistance = 0;
  lastRegion = '';
  lastSense = 0;
  mutedVolume = .5;
  season = { snow: { value: 0 }, autumn: { value: 0 } };
  position = new THREE.Vector3();
  frameNumber = 0;
  lastOrigin = 0;
  wasOffRoad = false;
  routeRecoveredTimer = 0;
  running = true;
  debugCockpitPos = new THREE.Vector3();
  debugCockpitQuat = new THREE.Quaternion();
  debug: { toggle: () => void; update: (fps?: number, dt?: number, cameraMode?: string, accumulatorAlpha?: number, navDebug?: { currentRoad?: string; nextRoad?: string; maneuverType?: string; distance?: number; routeProgress?: number; routeSegment?: string }) => void } | null = null;
  perfOverlay: { update: (dt: number) => void; toggle: (force?: boolean) => void } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    this.world = new World(this.scene, this.road);
    this.sky = new Sky(this.scene);
    this.water = new Water(this.scene,this.road);
    this.life = new AmbientLife(this.scene, this.road, this.world.materials);
    this.effects = new VehicleEffects(this.scene);

    const initialId = this.settings.data.selectedVehicle;
    for (const vConfig of getAllVehicles()) {
      const vc = new VehicleController(this.road, vConfig);
      this.vehicles.set(vConfig.id, vc);
      this.scene.add(vc.model.group);
      vc.model.group.visible = (vConfig.id === initialId);
    }
    this.vehicle = this.vehicles.get(initialId) || this.vehicles.get('r34') || new VehicleController(this.road, getVehicleConfig(initialId));
    this.car = this.vehicle.physics;
    this.hero = this.vehicle.model;
    this.audio = new AudioManager(this.vehicle.config);

    this.traffic = new Traffic(this.scene, this.road);
    this.particles = new Particles(this.scene);
    this.cameras = new CameraController(this.camera, canvas, this.vehicle.config);
    const environment = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(environment, .04).texture;
    this.scene.environmentIntensity = .5;
    environment.dispose();
    pmrem.dispose();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
    // Terrain owns its material layers; existing weather updates provide season uniforms.
    this.navVoice.setSettings(this.settings.data.navVoice, this.settings.data.navVoiceVolume, this.settings.data.navVoiceId);

    this.garage = new GarageController(
      this.settings.data.selectedVehicle,
      (id) => this.vehicles.get(id)?.model || null,
      {
        onStateChange: (state, currentVehicleId) => {
          const transitioning = state !== 'IDLE';
          this.ui.isGarageTransitioning = transitioning;
          this.cameras.isGarageTransitioning = transitioning;
          if (!transitioning) {
            for (const [id, vc] of this.vehicles) {
              vc.model.group.visible = (id === currentVehicleId);
            }
          }
          this.ui.updateGarageView();
        },
        onVehicleChanged: (vehicleId) => {
          this.switchVehicle(vehicleId);
        }
      }
    );

    this.ui = new UI(this.settings, {
      start: zen => this.start(zen), resume: () => this.resume(), pause: () => this.pause(), restart: () => this.restart(), menu: () => this.menu(), camera: () => this.cycleCamera(), reset: () => this.recover(),
      setting: (key, value) => this.setSetting(key, value), modal: open => { this.modalOpen = open; this.input.clear(); this.input.enabled = !open && this.screen === 'playing'; },
      search: q => this.weather.search(q), city: async c => { await this.weather.fetchCity(c); this.settings.data.weather = 'live'; this.settings.data.timeMode = 'real'; this.settings.save(); }, locate: async () => { await this.weather.locate(); this.settings.data.weather = 'live'; this.settings.data.timeMode = 'real'; this.settings.save(); },
      getVoices: () => this.navVoice.getAvailableEnglishVoices(),
      selectVehicle: async id => {
        if (this.ui.activeOverlay === 'garage') {
          const vehicles = getAllVehicles();
          const currIdx = vehicles.findIndex(v => v.id === this.settings.data.selectedVehicle);
          const targetIdx = vehicles.findIndex(v => v.id === id);
          const dir = targetIdx >= currIdx ? 'next' : 'prev';
          this.garage.setRoad(this.road, this.car.s, this.car.offset, this.car.heading);
          const started = this.garage.requestTransition(id, dir);
          if (started) {
            this.ui.isGarageTransitioning = true;
            this.cameras.isGarageTransitioning = true;
            this.ui.updateGarageView();
          }
        } else {
          this.switchVehicle(id);
        }
      },
      getAvailableVehicles: () => getAllVehicles(),
      onOverlayChanged: overlay => {
        const inGarage = overlay === 'garage';
        const wasInGarage = this.garage.active;
        this.cameras.setGarageMode(inGarage, this.road, this.car.s, this.car.offset);
        this.garage.setActive(inGarage);
        if (inGarage) {
          this.garage.setRoad(this.road, this.car.s, this.car.offset, this.car.heading);
          for (const [id, vc] of this.vehicles) {
            vc.model.group.visible = (id === this.settings.data.selectedVehicle);
          }
          this.ui.updateGarageView();
        } else if (wasInGarage) {
          this.car.syncPose(this.garage.presentationS, this.garage.presentationOffset, this.garage.presentationHeading);
          for (const [id, vc] of this.vehicles) {
            vc.model.group.visible = (id === this.settings.data.selectedVehicle);
          }
        }
      },
    });
    this.companion = new Companion(this.ui.companionCanvas);
    this.weather.onChange = () => { this.settings.data.weather = this.weather.mode; };
    const weather = this.settings.data.weather;
    this.weather.set(weather);
    if (weather === 'live') this.ui.toast('Choose a city to reconnect live weather.');
    this.cameras.mode = this.settings.data.camera;
    this.applyGraphics();
    this.world.update(this.car.s, true);
    // Explicitly synchronize initial vehicle visual transform and camera pose on road surface
    const initialPose = this.vehicle.render(1, this.world.origin, this.sky.night);
    this.position.copy(this.hero.group.position);
    this.hero.setCameraMode(this.cameras.mode);
    this.cameras.update(0.016, 0, this.car, initialPose, this.world.origin, this.screen === 'menu', this.settings.data.fov, this.settings.data.smoothing, this.settings.data.reducedMotion, this.hero.driverEye);

    this.input.onAction = key => {
      if (key === 'F2' && import.meta.env.DEV) { this.debug?.toggle(); return; }
      if (key === 'Escape') { if (this.ui.activeOverlay) return; if (this.screen === 'playing') this.pause(); else if (this.screen === 'paused') this.resume(); return; }
      if (this.screen !== 'playing' || this.modalOpen) return;
      if (key === 'KeyC') this.cycleCamera(); if (key === 'KeyR') this.recover();
      if (key === 'KeyL') this.ui.toast('Headlights · ' + this.hero.lights.toggle());
      if (key === 'KeyH') { this.hiddenHud = !this.hiddenHud; this.setHud(); }
      if (key === 'KeyM') { if (this.settings.data.master > 0) { this.mutedVolume = this.settings.data.master; this.setSetting('master', 0); } else this.setSetting('master', this.mutedVolume || .5); this.ui.toast(this.settings.data.master === 0 ? 'Audio muted' : 'Audio on'); }
    };
    this.sky.onThunder = () => this.audio.thunder();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => { if (this.screen === 'playing') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.persist(); if (this.screen === 'playing') this.pause(); } this.lastTime = 0; this.accumulator = 0; });
    window.addEventListener('pagehide', () => this.persist());
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.running = false; this.pause(); this.ui.toast('Graphics paused. Waiting for your browser to restore the display.'); });
    canvas.addEventListener('webglcontextrestored', () => { this.running = true; this.lastTime = 0; this.ui.toast('Graphics restored. Resume when you are ready.'); });
    this.resize(); void this.loadVehicles();
    if (import.meta.env.DEV) {
      void import('../vehicle/VehicleDebug.ts').then(({ VehicleDebug }) => { this.debug = new VehicleDebug(this.vehicle, () => this.cameras.initialized = false, () => this.audio); });
      void import('../dev/PerformanceOverlay.ts').then(({ PerformanceOverlay }) => { this.perfOverlay = new PerformanceOverlay(this.renderer, this.world); });
      if (typeof window !== 'undefined') (window as any).__AFTERMILE_GAME__ = this;
    }
    requestAnimationFrame(t => this.frame(t));
  }

  switchVehicle(vehicleId: string) {
    const targetController = this.vehicles.get(vehicleId);
    if (!targetController || vehicleId === this.settings.data.selectedVehicle) return;
    this.settings.data.selectedVehicle = vehicleId;
    this.settings.save();

    const previousS = this.car.s, previousOffset = this.car.offset, previousHeading = this.car.heading;
    this.vehicle = targetController;
    this.car = this.vehicle.physics;
    this.hero = this.vehicle.model;

    this.car.syncPose(previousS, previousOffset, previousHeading);

    for (const [id, vc] of this.vehicles) {
      vc.model.group.visible = (id === vehicleId);
    }

    this.cameras.setConfig(this.vehicle.config);
    this.audio.setVehicle(this.vehicle.config);
    this.ui.updateGarageView();
  }

  async loadVehicles() {
    for (const [, vc] of this.vehicles) {
      if (!vc.model.ready && !vc.model.error) {
        void vc.model.load().catch(() => {});
      }
    }
  }

  start(zen: boolean) {
    this.garage.setActive(false);
    for (const [id, vc] of this.vehicles) {
      vc.model.group.visible = (id === this.settings.data.selectedVehicle);
    }
    if (!this.hero.ready) {
      if (this.hero.error) void this.loadVehicles();
      else this.ui.toast(`The ${this.vehicle.config.name} is still loading…`);
      return;
    }
    this.zen = zen;
    this.hiddenHud = zen && this.settings.data.zenHideHud;
    this.screen = 'playing';
    this.input.clear();
    this.input.enabled = true;
    this.cameras.initialized = false; // Reset camera initialization to snap cleanly to road/driver pose
    this.hero.setCameraMode(this.cameras.mode);
    const pose = this.vehicle.render(1, this.world.origin, this.sky.night);
    this.position.copy(this.hero.group.position);
    this.cameras.update(0.016, 0, this.car, pose, this.world.origin, false, this.settings.data.fov, this.settings.data.smoothing, this.settings.data.reducedMotion, this.hero.driverEye);
    this.ui.setScreen('playing');
    this.setHud();
    void this.audio.start();
    this.ui.toast(zen ? 'Zen drive · no fuel, no hurry' : 'W to accelerate · A / D to steer · C for camera');
  }

  resume() {
    this.screen = 'playing';
    this.input.enabled = !this.modalOpen;
    this.input.clear();
    this.lastTime = 0;
    this.accumulator = 0;
    this.ui.setScreen('playing');
    void this.audio.start();
  }
  pause(){this.screen='paused';this.input.enabled=false;this.input.clear();this.audio.pause();this.navVoice.cancel();this.ui.setScreen('paused');this.persist();}
  menu(){this.persist();this.screen='menu';this.input.enabled=false;this.input.clear();this.audio.pause();this.navVoice.cancel();this.ui.setScreen('menu');document.body.classList.remove('zen-hidden');}
  restart(){this.persist();this.car.reset(160);this.car.fuel=100;this.car.distance=0;this.car.cleanDistance=0;this.car.damage=0;this.lastSavedDistance=0;this.traffic.reset();this.effects.reset();this.navVoice.cancel();this.world.rebuild(this.car.s);this.cameras.initialized=false;this.start(this.zen);}
  recover(){this.car.reset();if(this.car.fuel<5)this.car.fuel=8;this.car.damage=0;this.cameras.initialized=false;this.effects.reset();this.audio.chime();this.routeRecoveredTimer=2.5;}
  cycleCamera(){const prev = this.cameras.mode; this.cameras.mode=(this.cameras.mode+1)%cameraNames.length;this.settings.data.camera=this.cameras.mode;this.settings.save();this.cameras.onModeChanged(prev);this.hero.setCameraMode(this.cameras.mode);this.ui.showCameraBadge(cameraNames[this.cameras.mode]);}
  setHud(){document.body.classList.toggle('zen-hidden',this.hiddenHud);}
  setSetting(key:keyof SettingsData,value:unknown) {
    // Only controls with known types can mutate preferences.
    if(!(key in this.settings.data)||typeof value!==typeof this.settings.data[key])return;
    (this.settings.data as any)[key]=value;
    if(key==='quality')Object.assign(this.settings.data,GRAPHICS[this.settings.data.quality]);
    if(key==='environmentTime'){this.settings.data.timeMode='manual';this.settings.data.hour=ENVIRONMENT_TIMES[this.settings.data.environmentTime];}
    if(key==='weather'){this.settings.data.timeMode=value==='live'?'real':'manual';if(value!=='live')this.settings.data.hour=ENVIRONMENT_TIMES[this.settings.data.environmentTime];this.weather.set(this.settings.data.weather);if(value==='live'&&!this.weather.city)this.ui.toast('Choose a city or use your location.');}
    if(key==='camera'){const prev = this.cameras.mode; this.cameras.mode=this.settings.data.camera;this.cameras.onModeChanged(prev);this.hero.setCameraMode(this.cameras.mode);}
    if(['navVoice','navVoiceVolume','navVoiceId'].includes(key)){
      this.navVoice.setSettings(this.settings.data.navVoice, this.settings.data.navVoiceVolume, this.settings.data.navVoiceId);
    }
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
    const inGarage = this.ui.activeOverlay === 'garage';
    const pose = inGarage ? this.car.pose() : this.vehicle.render(moving ? this.accumulator * 120 : 1, origin, this.sky.night);
    if (inGarage) {
      this.garage.update(dt, origin);
    }
    this.position.copy(this.hero.group.position);
    this.effects.update(dt, this.time, this.car, this.hero, this.camera, w, this.sky.night);
    this.cameras.update(dt, this.cinematicTime, this.car, pose, origin, this.screen === 'menu', s.fov, s.smoothing, s.reducedMotion, this.hero.driverEye);
    if (import.meta.env.DEV && this.cameras.mode === 3) {
      this.debugCockpitPos.copy(this.camera.position);
      this.debugCockpitQuat.copy(this.camera.quaternion);
    }
    const inTunnel=this.road.isTunnel(this.car.s);
    this.sky.update(moving?dt:0,this.cinematicTime,this.camera,this.position,w,s.timeMode,s.hour,this.weather.mode==='live'?this.weather.city?.timezone:undefined,s.reducedFlashes,this.weather.mode,s.environmentTime);
    const sunDir = this.sky.sun.position.clone().sub(this.position).normalize();
    this.water.update(this.cinematicTime,this.position.z,this.sky.night,w.cloud,this.scene.fog as THREE.FogExp2,w.storm,this.sky.hour,sunDir,this.car.s,origin,this.sky.skyMaterial.uniforms.uTop.value,this.sky.skyMaterial.uniforms.uHorizon.value);
    this.life.update(this.time,this.car.s,origin,this.sky.night < 0.6,w.storm > 0.4 || w.wet > 0.7);
    this.life.onBirdNearby = (pan: number) => {
      if (this.screen === 'playing') this.audio.birdCall(0.04, pan);
    };
    this.particles.update(dt,this.cinematicTime,this.position,w,s.particles,inTunnel,this.car.speed,this.car.lateralVelocity,this.car.slip,this.world.leafDensity,this.world.leafSources);
    this.world.materials.update(w.wet,w.snow,w.autumn,this.sky.night,s.reflections,signalState(this.time),this.cinematicTime,w.wind);this.season.snow.value=w.snow;this.season.autumn.value=w.autumn;
    const wWeights=this.road.weights(this.car.s);
    const waterProximity=Math.max(0,Math.min(1,Math.max(wWeights.bridge*1.0,wWeights.coast*0.92,this.road.isBridge(this.car.s)?1.0:0)));
    this.audio.update(this.vehicle.audioState(this.cameras.mode, w.wet, w.snow), w.wet, inTunnel, !moving, s, this.cameras.mode === 3, waterProximity);
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

      const roadNameMap: Record<string, string> = {
        coast: 'COASTAL HIGHWAY',
        country: 'VALLEY ROAD',
        bridge: 'ASTER CROSSING SPAN',
        city: 'METROPOLIS EXPRESSWAY',
        tunnel: 'OBSIDIAN PASS',
        plains: 'BASIN HIGHWAY',
      };
      const currentRoadName = roadNameMap[region.biome] || `${region.name.toUpperCase()} ROAD`;

      let navEvent: string | undefined;
      const upcomingManeuvers: ManeuverEvent[] = [];

      for (let ds = 0; ds <= 450; ds += 25) {
        const sampleS = this.car.s + ds;
        const pSample = this.road.point(sampleS, 0);
        const deltaX = pSample.x - p0.x;
        const deltaZ = pSample.z - p0.z;
        // Transform world delta into vehicle forward/lateral navigation coordinates
        const localForward = -deltaZ * cosH + deltaX * sinH;
        const localLateral = deltaX * cosH - (-deltaZ) * sinH;

        let marker: string | undefined;
        if (!navEvent && ds > 40 && ds <= 350) {
          if (this.road.isBridge(sampleS)) {
            marker = 'bridge';
            navEvent = `BRIDGE · ${Math.round(ds)}m`;
          } else if (this.road.isTunnel(sampleS)) {
            marker = 'tunnel';
            navEvent = `TUNNEL · ${Math.round(ds)}m`;
          } else if (Math.abs(this.road.bank(sampleS)) > 0.035) {
            marker = this.road.bank(sampleS) > 0 ? 'turn_right' : 'turn_left';
            navEvent = `CURVE · ${Math.round(ds)}m`;
          }
        }

        // Collect upcoming distinct maneuvers (curves, bridges, tunnels)
        if (ds > 15) {
          if (this.road.isBridge(sampleS) && !this.road.isBridge(sampleS - 25)) {
            upcomingManeuvers.push({
              id: `bridge_${Math.round(sampleS / 50) * 50}`,
              type: 'bridge',
              stationS: sampleS,
            });
          }
          if (this.road.isTunnel(sampleS) && !this.road.isTunnel(sampleS - 25)) {
            upcomingManeuvers.push({
              id: `tunnel_${Math.round(sampleS / 50) * 50}`,
              type: 'tunnel',
              stationS: sampleS,
            });
          }
          if (Math.abs(this.road.bank(sampleS)) > 0.045 && Math.abs(this.road.bank(sampleS - 25)) <= 0.045) {
            upcomingManeuvers.push({
              id: `curve_${Math.round(sampleS / 50) * 50}`,
              type: 'curve',
              stationS: sampleS,
            });
          }
        }

        if (ds <= 350) {
          navCurve.push({ x: localLateral, y: ds, marker });
        }
      }

      this.navVoice.updateNavigation(this.car.s, this.car.speed, region.name, upcomingManeuvers, moving);

      // Determine active primary maneuver for Top-Center HUD (Pure Road & Navigation Hierarchy)
      let activeManeuver: {
        icon: string;
        action: string;
        distance: number;
        location: string;
        isFar?: boolean;
      } | undefined;

      let nearestDist = 999999;
      let nearestEvent: ManeuverEvent | null = null;
      for (const m of upcomingManeuvers) {
        const d = m.stationS - this.car.s;
        if (d > 0 && d < nearestDist) {
          nearestDist = d;
          nearestEvent = m;
        }
      }

      if (nearestEvent && nearestDist <= 450) {
        let icon = 'straight';
        let action = 'CONTINUE';
        let loc = currentRoadName;

        if (nearestEvent.type === 'bridge') {
          icon = 'bridge';
          action = nearestDist < 45 ? 'CROSSING BRIDGE' : 'BRIDGE AHEAD';
          loc = 'ASTER SPAN';
        } else if (nearestEvent.type === 'tunnel') {
          icon = 'tunnel';
          action = nearestDist < 45 ? 'ENTERING TUNNEL' : 'TUNNEL AHEAD';
          loc = 'OBSIDIAN PASS';
        } else if (nearestEvent.type === 'curve') {
          const bankVal = this.road.bank(nearestEvent.stationS);
          if (Math.abs(bankVal) > 0.07) {
            icon = bankVal > 0 ? 'turn_right' : 'turn_left';
            action = bankVal > 0 ? (nearestDist < 45 ? 'SHARP RIGHT' : 'TURN RIGHT') : (nearestDist < 45 ? 'SHARP LEFT' : 'TURN LEFT');
          } else {
            icon = bankVal > 0 ? 'slight_right' : 'slight_left';
            action = bankVal > 0 ? (nearestDist < 45 ? 'BEAR RIGHT' : 'CURVE RIGHT') : (nearestDist < 45 ? 'BEAR LEFT' : 'CURVE LEFT');
          }
          loc = currentRoadName;
        }

        activeManeuver = {
          icon,
          action,
          distance: Math.round(nearestDist),
          location: loc,
          isFar: nearestDist > 300
        };
      } else {
        // Highway straight cruising guidance (Restrained state)
        activeManeuver = {
          icon: 'straight',
          action: 'CONTINUE',
          distance: nearestDist < 999999 ? Math.round(nearestDist) : 1200,
          location: currentRoadName,
          isFar: true
        };
      }

      // Secondary connected roads geometry for Minimap
      const secondaryRoads: { points: { x: number; y: number }[] }[] = [];
      const roadLabels: { text: string; x: number; y: number; angle?: number }[] = [];

      // 1. Service station loop ramp
      if (station > this.car.s - 80 && station < this.car.s + 350) {
        const sStart = station - 65;
        const sEnd = station + 65;
        const secPts: { x: number; y: number }[] = [];
        for (let ss = sStart; ss <= sEnd; ss += 30) {
          const ds = ss - this.car.s;
          const rampOffset = Math.sin(((ss - sStart) / 130) * Math.PI) * 18;
          const pRamp = this.road.point(ss, rampOffset);
          const dx = pRamp.x - p0.x;
          const dz = pRamp.z - p0.z;
          const lx = dx * cosH - (-dz) * sinH;
          if (ds >= 0 && ds <= 350) {
            secPts.push({ x: lx, y: ds });
          }
        }
        if (secPts.length >= 2) {
          secondaryRoads.push({ points: secPts });
          roadLabels.push({ text: 'SERVICE RD', x: 22, y: Math.max(25, station - this.car.s) });
        }
      }

      // 2. Scenic turnout / secondary branch road every 800m
      const branchInterval = 800;
      const branchS = Math.floor((this.car.s + 150) / branchInterval) * branchInterval + 400;
      if (branchS > this.car.s - 20 && branchS < this.car.s + 320) {
        const branchSide = Math.floor(branchS / branchInterval) % 2 === 0 ? 1 : -1;
        const secPts: { x: number; y: number }[] = [];
        for (let off = 0; off <= 75; off += 25) {
          const ss = branchS + off * 0.5;
          const ds = ss - this.car.s;
          const lateralOff = branchSide * (off * 0.35);
          const pBranch = this.road.point(ss, lateralOff);
          const dx = pBranch.x - p0.x;
          const dz = pBranch.z - p0.z;
          const lx = dx * cosH - (-dz) * sinH;
          if (ds >= 0 && ds <= 350) {
            secPts.push({ x: lx, y: ds });
          }
        }
        if (secPts.length >= 2) {
          secondaryRoads.push({ points: secPts });
        }
      }

      // 3. Current Road label on Minimap
      roadLabels.push({ text: currentRoadName, x: 0, y: 75 });

      // Nearby POIs for Top-Left Minimap
      const nearbyPois: { x: number; y: number; type: string; label: string }[] = [];
      if (station > this.car.s - 40 && station < this.car.s + 350) {
        const ds = station - this.car.s;
        const pSample = this.road.point(station, 18); // Fuel station offset
        const deltaX = pSample.x - p0.x;
        const deltaZ = pSample.z - p0.z;
        const localLateral = deltaX * cosH - (-deltaZ) * sinH;
        nearbyPois.push({
          x: localLateral,
          y: ds,
          type: 'fuel',
          label: 'Horizon Fuel'
        });
      }

      this.hero.setCameraMode(this.cameras.mode);
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

      if (this.routeRecoveredTimer > 0) {
        this.routeRecoveredTimer -= dt;
      }
      const isOffRoad = Math.abs(this.car.offset) > 7.2;
      if (this.wasOffRoad && !isOffRoad) {
        this.routeRecoveredTimer = 2.5;
      }
      this.wasOffRoad = isOffRoad;

      const isWrongWay = Math.abs(this.car.speed) > 1.5 && (Math.abs(this.car.heading) > Math.PI * 0.65);
      const sharpBend = Boolean(
        nearestEvent &&
        nearestEvent.type === 'curve' &&
        nearestDist <= 110 &&
        Math.abs(this.road.bank(nearestEvent.stationS)) > 0.065
      );

      this.ui.update({
        speed: this.car.speed,
        gear: this.car.speed < -.3 ? 'R' : this.car.speed > .3 ? String(this.car.gear) : 'N',
        rpm: this.car.rpm,
        fuel: this.car.fuel,
        distance: this.car.distance,
        region: region.name,
        roadName: currentRoadName,
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
        secondaryRoads,
        roadLabels,
        navEvent,
        activeManeuver,
        nearbyPois,
        isOffRoad,
        isWrongWay,
        sharpBend,
        routeRecovered: this.routeRecoveredTimer > 0,
      }, dt * 4);
      this.debug?.update(this.fps, dt, cameraNames[this.cameras.mode], moving ? this.accumulator * 120 : 0, {
        currentRoad: currentRoadName,
        nextRoad: activeManeuver?.location || currentRoadName,
        maneuverType: activeManeuver?.action || 'CONTINUE',
        distance: activeManeuver?.distance ?? 0,
        routeProgress: region.progress,
        routeSegment: region.name,
      });
      if (this.lastRegion && this.lastRegion !== region.name && moving) {
        this.ui.showRegionBanner(region.name, 'PACIFIC COAST EXPRESSWAY');
      }
      this.lastRegion = region.name;
    }
    // Render live mirrors only in Cockpit mode (time-sliced for browser performance)
    if (this.cameras.mode === 3) {
      this.hero.renderMirrors(this.renderer, this.scene, this.frameNumber);
    }
    if (import.meta.env.DEV && this.cameras.mode === 3) {
      if (
        this.camera.position.distanceToSquared(this.debugCockpitPos) > 1e-6 ||
        Math.abs(this.camera.quaternion.dot(this.debugCockpitQuat)) < 0.99999
      ) {
        console.warn('[COCKPIT] Single camera owner assertion failed: camera transform was modified after DriverEye!');
      }
    }
    this.renderer.info.reset();this.composer.render();this.perfOverlay?.update(dt);this.saveTimer+=dt;if(this.saveTimer>15){this.persist();this.saveTimer=0;}
  }
}
