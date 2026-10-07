import * as THREE from 'three';

/** World-space multi-tier procedural grassland surface shader.
 * Delivers rich, organic meadow breakup, stratified soil/rock tones,
 * vibrant autumn grassland color transitions, and soft atmospheric horizon integration. */
export class TerrainMaterial extends THREE.MeshStandardMaterial {
  uniforms = {
    terrainOrigin: { value: 0 },
    terrainAutumn: { value: 0 },
    terrainSnow: { value: 0 },
    terrainWet: { value: 0 }
  };

  constructor() {
    super({ vertexColors: true, roughness: 0.94, metalness: 0.0 });
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = `uniform float terrainOrigin; varying vec3 vTerrainWorld; varying float vCamDist;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorld.z -= terrainOrigin;
        vCamDist = length((modelViewMatrix * vec4(transformed, 1.0)).xyz);
      `);

      shader.fragmentShader = `varying vec3 vTerrainWorld; varying float vCamDist;
        uniform float terrainAutumn, terrainSnow, terrainWet;
        float terrainHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float terrainNoise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), f.x),
            mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        float terrainFbm(vec2 p){
          return terrainNoise(p) * 0.55 + terrainNoise(p * 2.2) * 0.30 + terrainNoise(p * 5.1) * 0.15;
        }
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        // Multi-tier natural grassland composition
        vec2 pos = vTerrainWorld.xz;
        float macroFields = terrainNoise(pos * 0.0025);
        float meadowPatches = terrainFbm(pos * 0.015);
        float grassClumps = terrainNoise(pos * 0.14);
        float microGrain = terrainNoise(pos * 2.8);

        // Anti-aliased micro grain falloff with distance
        float grainFade = clamp(1.0 - vCamDist * 0.003, 0.0, 1.0);
        microGrain = mix(0.5, microGrain, grainFade);

        // Organic grassland tonal variation
        vec3 lushGrass = vec3(0.44, 0.54, 0.28);
        vec3 sunlitMeadow = vec3(0.58, 0.64, 0.34);
        vec3 dryGrass = vec3(0.66, 0.62, 0.40);
        vec3 soilLoam = vec3(0.48, 0.40, 0.30);

        vec3 fieldColor = mix(lushGrass, sunlitMeadow, meadowPatches);
        fieldColor = mix(fieldColor, dryGrass, macroFields * 0.45);
        fieldColor = mix(fieldColor, soilLoam, (1.0 - grassClumps) * 0.22);

        // Blend with vertex base palette (which handles rock slopes, sand, wet coast)
        diffuseColor.rgb *= 0.72 + meadowPatches * 0.36 + grassClumps * 0.16 + microGrain * 0.08;
        diffuseColor.rgb = mix(diffuseColor.rgb, fieldColor * diffuseColor.rgb * 1.85, 0.48);

        // Autumn mode: variegated ecology (muted olive, golden amber, straw yellow, warm russet, and dry loam)
        vec3 autumnOlive = vec3(0.52, 0.58, 0.28);
        vec3 autumnAmber = vec3(0.76, 0.58, 0.24);
        vec3 autumnStraw = vec3(0.82, 0.72, 0.36);
        vec3 autumnRusset = vec3(0.64, 0.40, 0.18);
        vec3 autumnDry = vec3(0.50, 0.44, 0.30);

        vec3 autumnTone = mix(autumnOlive, autumnAmber, meadowPatches);
        autumnTone = mix(autumnTone, autumnStraw, macroFields * 0.6);
        autumnTone = mix(autumnTone, autumnRusset, (1.0 - grassClumps) * 0.4);
        autumnTone = mix(autumnTone, autumnDry, microGrain * 0.25);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * autumnTone * 2.05, terrainAutumn * 0.92);

        // Rain wetness darkening
        diffuseColor.rgb *= 1.0 - terrainWet * 0.22;

        // Winter snow accumulation
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.88), terrainSnow * 0.92);

        // Atmospheric perspective: softly soften contrast and saturate distant mountains
        float haze = smoothstep(400.0, 2800.0, vCamDist);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.92 + vec3(0.04, 0.06, 0.09), haze * 0.35);
      `);
    };
  }

  customProgramCacheKey() {
    return 'aftermile-terrain-v2';
  }
}
