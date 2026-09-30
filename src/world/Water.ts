import * as THREE from 'three';
export class Water {
  mesh:THREE.Mesh;material:THREE.ShaderMaterial;
  constructor(scene:THREE.Scene) {
    this.material=new THREE.ShaderMaterial({transparent:false,uniforms:{time:{value:0},night:{value:0},cloud:{value:0},fogColor:{value:new THREE.Color()},fogDensity:{value:.001}},vertexShader:`varying vec3 vPosition;varying float vDistance;uniform float time;void main(){vec3 p=position;p.z+=sin(p.x*.08+time*.8)*.15+cos(p.y*.07+time*.7)*.12;vec4 w=modelMatrix*vec4(p,1.);vPosition=w.xyz;vec4 mv=viewMatrix*w;vDistance=-mv.z;gl_Position=projectionMatrix*mv;}`,fragmentShader:`varying vec3 vPosition;varying float vDistance;uniform float time,night,cloud,fogDensity;uniform vec3 fogColor;void main(){float wave=sin(vPosition.x*.14+vPosition.z*.28+time)*sin(vPosition.z*.44-time*.7);vec3 c=mix(vec3(.22,.42,.48),vec3(.025,.09,.15),night);c+=max(0.,pow(abs(wave),18.))*(1.-night*.7)*(1.-cloud*.6)*.27;float f=1.-exp(-fogDensity*fogDensity*vDistance*vDistance);gl_FragColor=vec4(mix(c,fogColor,f),1.);#include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
    // Shader chunks must start on a new line.
    this.material.fragmentShader=this.material.fragmentShader.replace(';#include',';\n#include');
    this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000,70,70),this.material);this.mesh.rotation.x=-Math.PI/2;this.mesh.position.y=7.5;scene.add(this.mesh);
  }
  update(time:number,z:number,night:number,cloud:number,fog:THREE.FogExp2) {this.mesh.position.z=z;this.material.uniforms.time.value=time;this.material.uniforms.night.value=night;this.material.uniforms.cloud.value=cloud;this.material.uniforms.fogColor.value.copy(fog.color);this.material.uniforms.fogDensity.value=fog.density;}
}
