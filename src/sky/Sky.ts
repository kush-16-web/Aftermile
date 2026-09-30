import * as THREE from 'three';
import { clamp, damp } from '../core/math.ts';
import { lunarPhase } from '../weather/Weather.ts';
import type { WeatherState } from '../weather/Weather.ts';

export class Sky {
  mesh:THREE.Mesh;sun:THREE.DirectionalLight;ambient:THREE.HemisphereLight;moon:THREE.Mesh;
  hour=17.4;night=0;flash=0;stormTimer=8;onThunder:()=>void=()=>{};
  skyMaterial:THREE.ShaderMaterial;
  constructor(public scene:THREE.Scene) {
    this.skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{uTop:{value:new THREE.Color('#527b94')},uHorizon:{value:new THREE.Color('#e7bca0')},uSun:{value:new THREE.Vector3(-.7,.18,-1).normalize()},uTime:{value:0},uCloud:{value:.1},uNight:{value:0},uFlash:{value:0}},vertexShader:`varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
      varying vec3 vDir; uniform vec3 uTop,uHorizon,uSun;uniform float uTime,uCloud,uNight,uFlash;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){return .55*noise(p)+.27*noise(p*2.03)+.13*noise(p*4.07)+.05*noise(p*8.);}
      void main(){vec3 d=normalize(vDir);float h=max(0.,d.y);vec3 col=mix(uHorizon,uTop,pow(h,.42));
      float sun=max(0.,dot(d,uSun));col+=vec3(1.,.64,.31)*pow(sun,40.)*.38*(1.-uCloud)* (1.-uNight);col+=vec3(1.,.87,.61)*smoothstep(.9995,.9998,sun)*1.8*(1.-uCloud);
      vec2 p=d.xz/max(.12,d.y)*2.8+vec2(uTime*.002,0.);float cloud=smoothstep(1.-uCloud*.65-.15,1.-uCloud*.35,fbm(p));cloud*=smoothstep(0.,.16,d.y);
      col=mix(col,mix(vec3(.85,.84,.8),vec3(.13,.16,.2),uNight)*(.85-uCloud*.24),cloud*.85);
      vec2 st=floor(d.xz/max(.03,d.y)*320.);float star=step(.9986,hash(st))*uNight*(1.-cloud)*(1.-uCloud)*smoothstep(.03,.25,d.y);col+=vec3(star*.65);
      col+=uFlash*.28;gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
    this.mesh=new THREE.Mesh(new THREE.SphereGeometry(4300,24,12),this.skyMaterial);this.mesh.renderOrder=-10;this.scene.add(this.mesh);
    this.sun=new THREE.DirectionalLight(0xffdeb5,2.5);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.camera.left=-70;this.sun.shadow.camera.right=70;this.sun.shadow.camera.top=70;this.sun.shadow.camera.bottom=-70;this.sun.shadow.camera.far=350;this.sun.shadow.normalBias=.04;this.sun.shadow.bias=-.00018;
    this.ambient=new THREE.HemisphereLight(0xc1d7e0,0x727462,1.3);scene.add(this.sun,this.sun.target,this.ambient);
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{phase:{value:lunarPhase(new Date())},opacity:{value:1}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 vUv;uniform float phase,opacity;void main(){vec2 p=vUv*2.-1.;float r=dot(p,p);if(r>1.)discard;vec3 n=vec3(p,sqrt(1.-r));float a=phase*6.283185;vec3 l=vec3(sin(a),0.,-cos(a));float lit=max(0.,dot(n,l));float crater=.95+.05*sin(p.x*29.)*sin(p.y*35.);gl_FragColor=vec4(vec3(.83,.87,.91)*(.035+lit*.965)*crater,opacity*smoothstep(1.,.94,r));}`});
    this.moon=new THREE.Mesh(new THREE.PlaneGeometry(54,54),mat);scene.add(this.moon);
    scene.fog=new THREE.FogExp2(0xceb8a3,.00075);
  }
  update(dt:number,time:number,camera:THREE.Camera,position:THREE.Vector3,weather:WeatherState,mode:string,manualHour:number,timezone?:string,reduced=false) {
    if(mode==='real') {
      try{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).split(':').map(Number);this.hour=parts[0]+parts[1]/60+parts[2]/3600;}catch{const d=new Date();this.hour=d.getHours()+d.getMinutes()/60;}
    }else if(mode==='accelerated')this.hour=(this.hour+dt/60)%24;
    else this.hour=manualHour;
    const elevation=Math.sin((this.hour-6)/24*Math.PI*2);
    this.night=clamp((.15-elevation)*3.2,0,1);
    const sunset=1-Math.min(1,Math.abs(elevation)*2.7);
    const top=new THREE.Color(0x518bb3).lerp(new THREE.Color(0x527488),sunset).lerp(new THREE.Color(0x080f23),this.night);
    const horizon=new THREE.Color(0xb6d3db).lerp(new THREE.Color(0xedb694),sunset*(1-weather.cloud*.75)).lerp(new THREE.Color(0x243b50),this.night);
    const grey=new THREE.Color(0x89959e).lerp(new THREE.Color(0x202b3a),this.night);
    top.lerp(grey,weather.cloud*.7);horizon.lerp(grey,weather.cloud*.75);
    const direction=new THREE.Vector3(-.7,elevation*.65,-.85).normalize();
    this.skyMaterial.uniforms.uTop.value.copy(top);this.skyMaterial.uniforms.uHorizon.value.copy(horizon);this.skyMaterial.uniforms.uSun.value.copy(direction);this.skyMaterial.uniforms.uTime.value=time*(.3+weather.wind*.04);this.skyMaterial.uniforms.uCloud.value=weather.cloud;this.skyMaterial.uniforms.uNight.value=this.night;
    this.mesh.position.copy(camera.position);
    this.sun.position.copy(position).addScaledVector(this.night>.6?new THREE.Vector3(.5,.7,.2):direction,120);this.sun.target.position.copy(position);
    this.sun.intensity=(1-this.night)*2.7*(1-weather.cloud*.65)+this.night*.5;
    this.sun.color.copy(new THREE.Color(0xfff0d2).lerp(new THREE.Color(0xffb076),sunset*.5).lerp(new THREE.Color(0x9bc3eb),this.night));
    this.ambient.intensity=1.2*(1-this.night)+.52*this.night;this.ambient.color.copy(top).lerp(new THREE.Color(0xffffff),.4);
    const fog=this.scene.fog as THREE.FogExp2;fog.color.copy(horizon);fog.density=.00078+weather.fog*.006;
    this.moon.position.copy(camera.position).add(new THREE.Vector3(430,470,-1800));this.moon.quaternion.copy(camera.quaternion);this.moon.visible=this.night>.02;
    (this.moon.material as THREE.ShaderMaterial).uniforms.opacity.value=this.night*(1-weather.cloud*.8);
    this.stormTimer-=dt;if(this.stormTimer<=0&&weather.storm>.6){this.flash=reduced?0:1;this.stormTimer=8+Math.random()*14;this.onThunder();}
    this.flash=damp(this.flash,0,10,dt);this.skyMaterial.uniforms.uFlash.value=this.flash;this.sun.intensity+=this.flash*4;
  }
}
