import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math.ts';
import { lunarPhase } from '../weather/Weather.ts';
import type { WeatherState } from '../weather/Weather.ts';

export class Sky {
  mesh: THREE.Mesh;
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  moon: THREE.Mesh;
  hour = 17.4;
  night = 0;
  flash = 0;
  stormTimer = 8;
  onThunder: () => void = () => {};
  skyMaterial: THREE.ShaderMaterial;

  constructor(public scene: THREE.Scene) {
    // 3D Multi-Layer Atmospheric Sky & Volumetric Thunderstorm Cloud Shader
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color('#1e3a8a') },
        uMid: { value: new THREE.Color('#7e22ce') },
        uHorizon: { value: new THREE.Color('#f59e0b') },
        uSun: { value: new THREE.Vector3(-0.7, 0.25, -1).normalize() },
        uSunColor: { value: new THREE.Color('#ffedd5') },
        uTime: { value: 0 },
        uCloud: { value: 0.1 },
        uStorm: { value: 0.0 },
        uNight: { value: 0 },
        uFlash: { value: 0 },
        uFog: { value: 0 },
        uRain: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uWindVec: { value: new THREE.Vector2(0.5, 0.2) },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldDir;
        uniform vec3 uTop, uMid, uHorizon, uSun, uSunColor, uCamPos;
        uniform vec2 uWindVec;
        uniform float uTime, uCloud, uStorm, uNight, uFlash, uFog, uRain;

        // Optimized procedural hashing & fractal noise
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float hash3(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x),
            f.y
          );
        }

        float fbm(vec2 p) {
          float v = 0.50 * noise(p);
          v += 0.25 * noise(p * 2.02);
          v += 0.15 * noise(p * 4.05);
          v += 0.08 * noise(p * 8.1);
          return v;
        }

        void main() {
          vec3 d = normalize(vWorldDir);
          float h = max(0.0, d.y);

          // 1. Atmospheric Sky Dome Base Gradient
          vec3 skyBase;
          if (h < 0.28) {
            skyBase = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
          } else {
            skyBase = mix(uMid, uTop, smoothstep(0.28, 0.88, h));
          }

          // 2. World-Space 3D Multi-Layer Cloud System
          float altLow = 1200.0;
          float altHigh = 3200.0;
          float rayDistLow = altLow / max(0.065, d.y);
          float rayDistHigh = altHigh / max(0.065, d.y);

          vec2 worldLow = (uCamPos.xz + d.xz * rayDistLow) * 0.00042 + uWindVec * (uTime * 0.014);
          vec2 worldHigh = (uCamPos.xz + d.xz * rayDistHigh) * 0.00022 + uWindVec * (uTime * 0.007);

          // Low Cumulus / Heavy Storm Cloud Masses
          float nLow = fbm(worldLow * 1.6);
          float stormDensityBoost = uStorm * 0.38 + uRain * 0.22;
          float cloudBaseDensity = smoothstep(1.12 - uCloud * 0.95 - stormDensityBoost, 0.88 - uCloud * 0.45, nLow);

          // High Cirrus Deck
          float nHigh = fbm(worldHigh * 2.4);
          float highCirrus = smoothstep(0.68 - uCloud * 0.4, 0.96, nHigh) * 0.42;

          float totalCloud = clamp(cloudBaseDensity + highCirrus, 0.0, 1.0);
          totalCloud *= smoothstep(0.0, 0.14, d.y); // Fade out smoothly at true horizon

          // 3. Dynamic Sun Occlusion (Dense Clouds Completely Obscure Sun Disc)
          float sunDot = max(0.0, dot(d, uSun));
          float sunCloudAbsorption = clamp(uCloud * 1.1 + uStorm * 0.9 + uRain * 0.8, 0.0, 1.0);
          float sunDirectOcclusion = clamp((1.0 - totalCloud * 1.4) * (1.0 - sunCloudAbsorption * 0.88), 0.0, 1.0);
          
          float sunCorona = pow(sunDot, 24.0) * 0.55 * (1.0 - uNight) * (1.0 - sunCloudAbsorption * 0.75);
          float sunDisk = smoothstep(0.9993, 0.9998, sunDot) * 2.6 * sunDirectOcclusion * (1.0 - uNight);
          
          // Add Sun Disc & Corona to sky
          skyBase += uSunColor * (sunCorona + sunDisk);

          // 4. Cloud Lighting, Self-Shadowing & Heavy Thunderhead Dark Undersides
          vec2 toSun = uSun.xz * 0.08;
          float sunLightSample = fbm(worldLow * 1.6 + toSun);
          float selfShadow = clamp((nLow - sunLightSample) * 2.8, 0.0, 1.0);

          // Forward scattering golden/crimson rim lining on thin cloud edges
          float forwardScatter = pow(sunDot, 10.0) * (1.0 - uNight) * 1.4;
          vec3 rimColor = mix(uSunColor * 1.3, vec3(1.0, 0.92, 0.80), 0.35);

          vec3 cloudLit = mix(vec3(0.88, 0.86, 0.84), rimColor, forwardScatter * (1.0 - uStorm * 0.7));
          
          // Storm cloud palette: Deep neutral slate / dark indigo-grey undersides
          vec3 standardShade = mix(vec3(0.12, 0.14, 0.20), vec3(0.32, 0.36, 0.45), (1.0 - uNight) * (1.0 - uCloud * 0.4));
          vec3 heavyStormShade = mix(vec3(0.04, 0.06, 0.09), vec3(0.10, 0.13, 0.18), (1.0 - uNight) * 0.8);
          vec3 cloudShade = mix(standardShade, heavyStormShade, clamp(uStorm * 1.2 + uRain * 0.6, 0.0, 1.0));

          vec3 finalCloudCol = mix(cloudShade, cloudLit, clamp(0.25 + 0.75 * dot(d, uSun) - selfShadow * 0.5, 0.0, 1.0) * (1.0 - uStorm * 0.65));
          finalCloudCol = mix(finalCloudCol, vec3(0.04, 0.05, 0.09), uNight * 0.9);

          // Composite Clouds into Sky Dome
          skyBase = mix(skyBase, finalCloudCol, totalCloud * (0.88 + uCloud * 0.10 + uStorm * 0.08));

          // 5. Rich Evening & Night Starfield (Excludes Cloud Masses & Storm Haze)
          vec3 starCoord = floor(d * 420.0);
          float starHash = hash3(starCoord);
          float starMag = step(0.9972, starHash);
          vec3 starTone = mix(vec3(0.75, 0.88, 1.0), vec3(1.0, 0.92, 0.80), fract(starHash * 17.3));
          float starTwinkle = 0.80 + 0.20 * sin(uTime * 3.5 + starHash * 30.0);
          float horizonScattering = smoothstep(0.06, 0.35, d.y);
          float sunGlowExclusion = 1.0 - smoothstep(0.20, 0.85, sunDot);
          
          float twilightFactor = clamp(uNight + smoothstep(0.12, -0.15, uSun.y) * 0.9, 0.0, 1.0);
          float starVisibility = twilightFactor * (1.0 - totalCloud * 1.2) * (1.0 - uFog * 0.9) * (1.0 - uRain * 0.95) * horizonScattering * sunGlowExclusion;
          skyBase += starTone * starMag * starTwinkle * starVisibility * 1.35;

          // 6. Thunderstorm Lightning Illuminating Cloud Lobes & Ambient Sky
          float cloudLightningLobe = smoothstep(0.25, 0.80, fbm(worldLow * 2.8 + vec2(19.2, 34.7)));
          vec3 lightningGlow = vec3(0.78, 0.88, 1.0) * uFlash * (0.2 + 0.8 * totalCloud * (0.4 + 0.6 * cloudLightningLobe));
          skyBase += lightningGlow;

          // 7. Atmospheric Fog & Rain Haze Convergence
          skyBase = mix(skyBase, uHorizon, uFog * 0.48 + uRain * 0.22);

          gl_FragColor = vec4(skyBase, 1.0);

          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), this.skyMaterial);
    this.mesh.renderOrder = -10;
    this.scene.add(this.mesh);

    // Directional Sun Light
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -75;
    this.sun.shadow.camera.right = 75;
    this.sun.shadow.camera.top = 75;
    this.sun.shadow.camera.bottom = -75;
    this.sun.shadow.camera.far = 380;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.bias = -0.00018;

    // Ambient Hemisphere Light
    this.ambient = new THREE.HemisphereLight(0xbfe0f0, 0x606550, 1.2);
    scene.add(this.sun, this.sun.target, this.ambient);

    // Moon Quad with Astronomical Phase Shader & Halo
    const moonMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        phase: { value: lunarPhase(new Date()) },
        opacity: { value: 1 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float phase, opacity;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = dot(p, p);
          if (r > 1.0) discard;
          vec3 n = vec3(p, sqrt(1.0 - r));
          float a = phase * 6.2831853;
          vec3 l = vec3(sin(a), 0.0, -cos(a));
          float lit = max(0.0, dot(n, l));
          float crater = 0.94 + 0.06 * sin(p.x * 32.0) * sin(p.y * 38.0);
          vec3 col = vec3(0.88, 0.92, 0.98) * (0.04 + lit * 0.96) * crater;
          
          // Soft atmospheric halo
          float halo = (1.0 - smoothstep(0.85, 1.0, r)) * opacity;
          gl_FragColor = vec4(col, halo);
        }
      `,
    });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(62, 62), moonMat);
    scene.add(this.moon);

    scene.fog = new THREE.FogExp2(0xceb8a3, 0.00075);
  }

  update(
    dt: number,
    time: number,
    camera: THREE.Camera,
    position: THREE.Vector3,
    weather: WeatherState,
    mode: string,
    manualHour: number,
    timezone?: string,
    reduced = false
  ) {
    // 1. Time Mode Evaluation
    if (mode === 'real') {
      try {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
        }).format(new Date()).split(':').map(Number);
        this.hour = parts[0] + parts[1] / 60 + parts[2] / 3600;
      } catch {
        const d = new Date();
        this.hour = d.getHours() + d.getMinutes() / 60;
      }
    } else if (mode === 'accelerated') {
      this.hour = (this.hour + dt / 60) % 24;
    } else {
      this.hour = manualHour;
    }

    // 2. Continuous 3D Celestial Solar Arc
    const solarAngle = ((this.hour - 6) / 24) * Math.PI * 2;
    const sunElevation = Math.sin(solarAngle);
    const sunAzimuthX = -Math.cos(solarAngle);
    const sunAzimuthZ = -Math.sin(solarAngle * 0.5) * 0.4 - 0.7;

    const sunDir = new THREE.Vector3(sunAzimuthX, Math.max(-0.2, sunElevation), sunAzimuthZ).normalize();

    // 3. Time Phase Determination
    this.night = clamp((-sunElevation + 0.08) * 3.5, 0, 1);

    // 4. Atmospheric Sky Color Gradients
    let skyZenith = new THREE.Color(0x0284c7);
    let skyMid = new THREE.Color(0x38bdf8);
    let skyHorizon = new THREE.Color(0xe0f2fe);
    let sunLightColor = new THREE.Color(0xfff4e0);

    if (this.hour >= 4.5 && this.hour < 7.0) {
      // DAWN
      const t = (this.hour - 4.5) / 2.5;
      skyZenith = new THREE.Color(0x141838).lerp(new THREE.Color(0x1e3a8a), t);
      skyMid = new THREE.Color(0x4a1d68).lerp(new THREE.Color(0x701a75), t);
      skyHorizon = new THREE.Color(0xd946ef).lerp(new THREE.Color(0xfb923c), t);
      sunLightColor = new THREE.Color(0xffb780);
    } else if (this.hour >= 7.0 && this.hour < 11.5) {
      // MORNING
      const t = (this.hour - 7.0) / 4.5;
      skyZenith = new THREE.Color(0x1e3a8a).lerp(new THREE.Color(0x0284c7), t);
      skyMid = new THREE.Color(0x38bdf8).lerp(new THREE.Color(0x7dd3fc), t);
      skyHorizon = new THREE.Color(0xbae6fd).lerp(new THREE.Color(0xe0f2fe), t);
      sunLightColor = new THREE.Color(0xfff0db);
    } else if (this.hour >= 11.5 && this.hour < 16.0) {
      // NOON
      skyZenith = new THREE.Color(0x0369a1);
      skyMid = new THREE.Color(0x38bdf8);
      skyHorizon = new THREE.Color(0xe0f2fe);
      sunLightColor = new THREE.Color(0xfff8ee);
    } else if (this.hour >= 16.0 && this.hour < 18.0) {
      // AFTERNOON / GOLDEN HOUR
      const t = (this.hour - 16.0) / 2.0;
      skyZenith = new THREE.Color(0x0369a1).lerp(new THREE.Color(0x2e1065), t);
      skyMid = new THREE.Color(0x38bdf8).lerp(new THREE.Color(0x86198f), t);
      skyHorizon = new THREE.Color(0xe0f2fe).lerp(new THREE.Color(0xf59e0b), t);
      sunLightColor = new THREE.Color(0xffa726);
    } else if (this.hour >= 18.0 && this.hour < 19.8) {
      // AUTUMN EVENING & SUNSET
      const t = (this.hour - 18.0) / 1.8;
      skyZenith = new THREE.Color(0x241442).lerp(new THREE.Color(0x130e2b), t);
      skyMid = new THREE.Color(0x831843).lerp(new THREE.Color(0x581c87), t);
      skyHorizon = new THREE.Color(0xf97316).lerp(new THREE.Color(0xec4899), t);
      sunLightColor = new THREE.Color(0xff8c42);
    } else if (this.hour >= 19.8 && this.hour < 21.2) {
      // BLUE HOUR / DUSK
      const t = (this.hour - 19.8) / 1.4;
      skyZenith = new THREE.Color(0x0f172a).lerp(new THREE.Color(0x030712), t);
      skyMid = new THREE.Color(0x312e81).lerp(new THREE.Color(0x1e1b4b), t);
      skyHorizon = new THREE.Color(0x4338ca).lerp(new THREE.Color(0x111827), t);
      sunLightColor = new THREE.Color(0x818cf8);
    } else {
      // NIGHT
      skyZenith = new THREE.Color(0x040711);
      skyMid = new THREE.Color(0x0a1020);
      skyHorizon = new THREE.Color(0x101726);
      sunLightColor = new THREE.Color(0x94a3b8);
    }

    // 5. Heavy Thunderstorm & Overcast Modifications (Dark, moody, high-contrast storm system)
    if (weather.cloud > 0.3 || weather.storm > 0.1 || weather.wet > 0.3) {
      const stormIntensity = clamp(weather.cloud * 0.7 + weather.storm * 0.8 + weather.wet * 0.4, 0, 1);
      
      const darkStormZenith = new THREE.Color(0x080e1a).lerp(new THREE.Color(0x0e1726), 1 - this.night);
      const darkStormMid = new THREE.Color(0x182232).lerp(new THREE.Color(0x233144), 1 - this.night);
      const stormHorizon = new THREE.Color(0x28384a).lerp(new THREE.Color(0x3a4c5e), 1 - this.night);

      skyZenith.lerp(darkStormZenith, stormIntensity);
      skyMid.lerp(darkStormMid, stormIntensity);
      skyHorizon.lerp(stormHorizon, stormIntensity);
      sunLightColor.lerp(new THREE.Color(0x788899), stormIntensity * 0.85);
    }

    if (weather.snow > 0.1) {
      const snowZenith = new THREE.Color(0x0f172a).lerp(new THREE.Color(0x334155), 1 - this.night);
      const snowHorizon = new THREE.Color(0x475569).lerp(new THREE.Color(0x64748b), 1 - this.night);
      skyZenith.lerp(snowZenith, weather.snow * 0.8);
      skyMid.lerp(snowHorizon, weather.snow * 0.8);
      skyHorizon.lerp(snowHorizon, weather.snow * 0.8);
    }

    if (weather.autumn > 0.1 && this.night < 0.7 && weather.storm < 0.3) {
      skyMid.lerp(new THREE.Color(0x831843), weather.autumn * 0.4);
      skyHorizon.lerp(new THREE.Color(0xd97706), weather.autumn * 0.45);
    }

    if (weather.fog > 0.2) {
      const fogTone = new THREE.Color(0x94a3b8).lerp(new THREE.Color(0x1e293b), this.night);
      skyMid.lerp(fogTone, weather.fog * 0.5);
      skyHorizon.lerp(fogTone, weather.fog * 0.6);
    }

    // 6. Update Sky Shader Uniforms with World Coordinates & Wind Drift
    this.skyMaterial.uniforms.uTop.value.copy(skyZenith);
    this.skyMaterial.uniforms.uMid.value.copy(skyMid);
    this.skyMaterial.uniforms.uHorizon.value.copy(skyHorizon);
    this.skyMaterial.uniforms.uSun.value.copy(sunDir);
    this.skyMaterial.uniforms.uSunColor.value.copy(sunLightColor);
    this.skyMaterial.uniforms.uTime.value = time;
    this.skyMaterial.uniforms.uCloud.value = weather.cloud;
    this.skyMaterial.uniforms.uStorm.value = weather.storm;
    this.skyMaterial.uniforms.uNight.value = this.night;
    this.skyMaterial.uniforms.uFog.value = weather.fog;
    this.skyMaterial.uniforms.uRain.value = weather.wet;
    this.skyMaterial.uniforms.uCamPos.value.copy(camera.position);
    this.skyMaterial.uniforms.uWindVec.value.set(Math.sin(time * 0.05) * 0.6 + 0.4, Math.cos(time * 0.04) * 0.3);

    this.mesh.position.copy(camera.position);

    // 7. Dynamic Sun Directional Light (Attenuated by Cloud Cover & Storms)
    const lightDir = this.night > 0.6
      ? new THREE.Vector3(0.5, 0.75, 0.25).normalize()
      : sunDir;

    this.sun.position.copy(position).addScaledVector(lightDir, 130);
    this.sun.target.position.copy(position);

    // In thunderstorms and heavy cloud cover, direct sun is strongly occluded while preserving ambient visibility
    const cloudAtten = clamp(1.0 - weather.cloud * 0.72 - weather.storm * 0.45 - weather.wet * 0.3, 0.05, 1.0);
    const baseSunIntensity = (1.0 - this.night) * 2.8 * cloudAtten * (1.0 - weather.fog * 0.5);
    const moonlightIntensity = this.night * 0.22 * (1.0 - weather.cloud * 0.7);
    this.sun.intensity = baseSunIntensity + moonlightIntensity;
    this.sun.color.copy(this.night > 0.6 ? new THREE.Color(0x93c5fd) : sunLightColor);

    // 8. Ambient Hemisphere Light (Preserves comfortable world visibility during daytime storms)
    const skyHemi = skyZenith.clone().lerp(new THREE.Color(0xffffff), 0.25);
    const groundHemi = new THREE.Color(0x282a32).lerp(new THREE.Color(0x06080d), this.night);
    this.ambient.color.copy(skyHemi);
    this.ambient.groundColor.copy(groundHemi);
    this.ambient.intensity = 1.15 * (1.0 - this.night * 0.7) * (1.0 - weather.cloud * 0.3) + this.night * 0.35 + (weather.storm > 0.3 ? 0.25 : 0);

    // 9. Atmospheric Fog Density & Color
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(skyHorizon);
    fog.density = 0.00065 + weather.fog * 0.0055 + weather.wet * 0.0016 + weather.storm * 0.0018 + weather.snow * 0.0015;

    // 10. Moon Position & Material
    const moonAngle = solarAngle + Math.PI;
    const moonElevation = Math.sin(moonAngle);
    const moonX = -Math.cos(moonAngle) * 500;
    const moonY = Math.max(120, moonElevation * 550 + 200);
    const moonZ = -Math.sin(moonAngle * 0.5) * 400 - 1500;

    this.moon.position.copy(camera.position).add(new THREE.Vector3(moonX, moonY, moonZ));
    this.moon.quaternion.copy(camera.quaternion);
    this.moon.visible = this.night > 0.01;
    (this.moon.material as THREE.ShaderMaterial).uniforms.opacity.value = clamp(this.night * (1.0 - weather.cloud * 0.85), 0, 1);

    // 11. Thunderstorm Lightning & Cloud Illumination
    this.stormTimer -= dt;
    if (this.stormTimer <= 0 && weather.storm > 0.35) {
      this.flash = reduced ? 0 : 1.0;
      this.stormTimer = 6.0 + Math.random() * 10.0;
      // Realistic thunder sound delay based on simulated distance
      setTimeout(() => {
        this.onThunder();
      }, 350 + Math.random() * 950);
    }
    this.flash = damp(this.flash, 0, 8, dt);
    this.skyMaterial.uniforms.uFlash.value = this.flash;
    this.sun.intensity += this.flash * 3.8;
  }
}
