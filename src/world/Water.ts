import * as THREE from 'three';
import { Road } from '../road/Road.ts';
import { SEA_LEVEL } from '../road/Landscape.ts';

export class Water {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  private section=Number.NaN;

  constructor(scene: THREE.Scene, private road: Road) {
    this.material = new THREE.ShaderMaterial({
      transparent: false,
      uniforms: {
        time: { value: 0 },
        origin: { value: 0 },
        skyTop: { value: new THREE.Color() },
        skyHorizon: { value: new THREE.Color() },
        night: { value: 0 },
        cloud: { value: 0 },
        storm: { value: 0 },
        sunset: { value: 0 },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        fogColor: { value: new THREE.Color() },
        fogDensity: { value: 0.001 },
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vWorldNormal;
        varying float vDistance;
        varying vec3 vViewVec;
        uniform float time, storm, origin;

        // Multi-frequency directional ocean wave spectrum (3 perceived scales: Swell, Wind Chop, Capillaries)
        void main() {
          vec3 p = position;
          vec2 q = p.xz;
          float swell = sin(q.x*.025 + q.y*.018 + time*.65)*.25;
          float chop = cos(q.x*.065 - q.y*.048 - time*1.15)*.12;
          p.y += swell + chop;
          vec4 worldPos = modelMatrix * vec4(p, 1.0);
          vPosition = vec3(worldPos.x,worldPos.y,worldPos.z-origin);
          vViewVec = cameraPosition-worldPos.xyz;
          float dx = cos(q.x*.025+q.y*.018+time*.65)*.00625 - sin(q.x*.065-q.y*.048-time*1.15)*.0078;
          float dz = cos(q.x*.025+q.y*.018+time*.65)*.0045 + sin(q.x*.065-q.y*.048-time*1.15)*.00576;
          vWorldNormal=normalize(vec3(-dx,1.,-dz));

          vec4 mv = viewMatrix * worldPos;
          vDistance = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        varying vec3 vWorldNormal;
        varying float vDistance;
        varying vec3 vViewVec;
        uniform float time, night, cloud, storm, sunset, fogDensity;
        uniform vec3 sunDir, fogColor, skyTop, skyHorizon;

        // Procedural noise for micro-surface ripple perturbation
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          vec3 V = normalize(vViewVec);
          vec3 N = normalize(vWorldNormal);

          // Multi-layer micro-ripples and capillary normal disturbance (Scale 4 & 5)
          float r1 = sin(vPosition.x * 0.35 + vPosition.z * 0.28 + time * 2.6) * 0.07;
          float r2 = cos(vPosition.x * 0.72 - vPosition.z * 0.65 - time * 3.4) * 0.045;
          float r3 = sin(vPosition.x * 1.6 + vPosition.z * 1.4 + time * 4.8) * 0.025;
          N = normalize(N + vec3(r1 + r3, 0.0, r2 - r3 * 0.5));

          // 1. Physically-Grounded Water Body Tones (Deep Coastal Navy -> Shallow Turquoise)
          vec3 deepColor = mix(vec3(0.025, 0.09, 0.16), vec3(0.008, 0.016, 0.035), night);
          vec3 shallowColor = mix(vec3(0.08, 0.24, 0.32), vec3(0.012, 0.03, 0.06), night);

          // Sunset Warm Horizon Shift
          deepColor = mix(deepColor, vec3(0.18, 0.07, 0.06), sunset * (1.0 - night) * 0.85);
          shallowColor = mix(shallowColor, vec3(0.42, 0.18, 0.09), sunset * (1.0 - night) * 0.9);

          // Storm Turbid Darkening
          deepColor = mix(deepColor, vec3(0.015, 0.025, 0.04), storm * 0.8);

          // 2. Physical Schlick Fresnel Approximation (Reflectance at Grazing vs Looking Down)
          float NdotV = max(0.0, dot(N, V));
          float f0 = 0.024; // Water index of refraction
          float fresnel = f0 + (1.0 - f0) * pow(1.0 - NdotV, 5.0);

          vec3 baseWater = mix(deepColor, shallowColor, 0.32);

          // 3. Multi-Stop Atmospheric Sky & Horizon Reflection
          vec3 envReflection = mix(skyTop, skyHorizon, pow(1.0 - NdotV, 2.0));
          vec3 oceanSurface = mix(baseWater, envReflection, fresnel * (0.88 - storm * 0.12));

          // 4. Broken Sunset / Sun Specular Glint Shimmer Path
          vec3 L = normalize(sunDir);
          vec3 H = normalize(L + V);
          float NdotH = max(0.0, dot(N, H));

          // Microfacet specular roughness tailored to wave facets
          float glintRoughness = mix(75.0, 16.0, storm * 0.5 + sunset * 0.6);
          float sunGlint = pow(NdotH, glintRoughness) * (1.0 - cloud * 0.72) * (1.0 - night * 0.95);

          vec3 glintColor = mix(vec3(1.0, 0.96, 0.88), vec3(1.0, 0.62, 0.22), sunset);
          oceanSurface += glintColor * sunGlint * (2.2 + sunset * 1.4);

          // 5. Lunar Shimmer Path across Waves at Night
          if (night > 0.15) {
            vec3 moonDir = normalize(vec3(-0.35, 0.82, -0.45));
            vec3 moonH = normalize(moonDir + V);
            float moonGlint = pow(max(0.0, dot(N, moonH)), 55.0) * (1.0 - cloud * 0.8) * night;
            oceanSurface += vec3(0.65, 0.82, 1.0) * moonGlint * 1.8;
          }

          // 6. Smooth Horizon Fog Atmospheric Convergence (No sharp plane edge)
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vDistance * vDistance);
          gl_FragColor = vec4(mix(oceanSurface, fogColor, fogFactor), 1.0);

          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    this.material.fragmentShader = this.material.fragmentShader.replace(';#include', ';\n#include');
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.position.y = SEA_LEVEL;
    scene.add(this.mesh);
  }

  update(
    time: number,
    z: number,
    night: number,
    cloud: number,
    fog: THREE.FogExp2,
    storm = 0,
    hour = 12,
    sunDir = new THREE.Vector3(0, 1, 0),
    s = 0, origin = 0, skyTop?: THREE.Color, skyHorizon?: THREE.Color
  ) {
    const section=Math.floor(s/960);
    if(section!==this.section){this.section=section;this.rebuild(section*960);}
    this.mesh.position.z=origin;
    this.material.uniforms.origin.value=origin;
    if(skyTop)this.material.uniforms.skyTop.value.copy(skyTop);
    if(skyHorizon)this.material.uniforms.skyHorizon.value.copy(skyHorizon);
    const sunset = (hour >= 16.5 && hour <= 19.8) ? (1.0 - Math.abs(hour - 18.0) / 1.8) : 0;

    this.material.uniforms.time.value = time;
    this.material.uniforms.night.value = night;
    this.material.uniforms.cloud.value = cloud;
    this.material.uniforms.storm.value = storm;
    this.material.uniforms.sunset.value = Math.max(0, sunset);
    this.material.uniforms.sunDir.value.copy(sunDir);
    this.material.uniforms.fogColor.value.copy(fog.color);
    this.material.uniforms.fogDensity.value = fog.density;
  }
  private rebuild(center:number) {
    const positions:number[]=[],indices:number[]=[];
    const offshore=[0,40,160,500,1400,3200,7000];
    // A strip starts at the actual sampled shoreline, never under the road.
    // Stable world coordinates avoid wave swimming during origin shifts.
    const start=Math.max(2800,center-6500),end=Math.max(start+120,center+6500);
    const rows=Math.ceil((end-start)/120),n=offshore.length;
    for(let j=0;j<=rows;j++){
      const s=start+(end-start)*j/rows;
      const edge=this.road.coastPoint(s);
      for(let i=0;i<n;i++){
        positions.push(edge.x-offshore[i],0,edge.z);
        if(j<rows&&i<n-1){const a=j*n+i,b=a+1,c=a+n,d=c+1;indices.push(a,c,b,b,c,d);}
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
    geometry.computeBoundingSphere();this.mesh.geometry.dispose();this.mesh.geometry=geometry;
  }

}
