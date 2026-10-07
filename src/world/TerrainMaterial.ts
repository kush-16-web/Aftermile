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

      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        vec2 posR = vTerrainWorld.xz;
        float meadowRough = terrainNoise(posR * 0.018);
        float microRough = terrainNoise(posR * 0.45);
        roughnessFactor = mix(0.82, 0.98, meadowRough * 0.7 + microRough * 0.3);
        if (terrainWet > 0.08) roughnessFactor *= (1.0 - terrainWet * 0.55);
      `);

      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // High-fidelity procedural turf micro-relief: captures grazing evening sunlight
        float grainFadeN = clamp(1.0 - vCamDist * 0.008, 0.0, 1.0);
        if (grainFadeN > 0.01) {
          vec2 posN = vTerrainWorld.xz;
          float dStep = 0.16;
          float hL = terrainNoise((posN - vec2(dStep, 0.0)) * 0.35) + terrainNoise((posN - vec2(dStep, 0.0)) * 2.2) * 0.30;
          float hR = terrainNoise((posN + vec2(dStep, 0.0)) * 0.35) + terrainNoise((posN + vec2(dStep, 0.0)) * 2.2) * 0.30;
          float hD = terrainNoise((posN - vec2(0.0, dStep)) * 0.35) + terrainNoise((posN - vec2(0.0, dStep)) * 2.2) * 0.30;
          float hU = terrainNoise((posN + vec2(0.0, dStep)) * 0.35) + terrainNoise((posN + vec2(0.0, dStep)) * 2.2) * 0.30;
          vec3 grassNormOffset = normalize(vec3((hL - hR) * 0.48, 1.0, (hD - hU) * 0.48));
          vec3 viewGrassNorm = normalize(mat3(viewMatrix) * grassNormOffset);
          normal = normalize(mix(normal, viewGrassNorm, grainFadeN * 0.36));
        }
      `);

      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        // Multi-tier natural grassland composition matching near 3D grass clumps
        vec2 pos = vTerrainWorld.xz;
        float macroFields = terrainNoise(pos * 0.0016);
        float meadowDrift = terrainFbm(pos * 0.011 + vec2(2.1, 4.7));
        float turfClumps = terrainNoise(pos * 0.18);
        float fineClumpTexture = terrainNoise(pos * 0.72);
        float microBladeGrain = terrainNoise(pos * 3.4);

        // Anti-aliased micro grain falloff with distance
        float grainFade = clamp(1.0 - vCamDist * 0.006, 0.0, 1.0);
        microBladeGrain = mix(0.5, microBladeGrain, grainFade);

        // 4 Harmonic Meadow Field Biomes matching 3D grass clumps:
        // 1. Green Meadow (lush clover & rye in fertile hollows)
        vec3 greenMeadow = vec3(0.38, 0.48, 0.22);
        // 2. Open Pasture (vibrant sunlit yellow-green)
        vec3 sunlitPasture = vec3(0.52, 0.60, 0.28);
        // 3. Wild Meadow (warm sage-olive & mixed field grasses)
        vec3 wildMeadow = vec3(0.46, 0.52, 0.25);
        // 4. Dry Meadow (sun-cured golden straw grass on ridges)
        vec3 dryMeadow = vec3(0.64, 0.58, 0.32);
        // Moist loam soil in low tufts
        vec3 loamSoil = vec3(0.36, 0.30, 0.20);

        vec3 fieldColor = mix(greenMeadow, sunlitPasture, meadowDrift);
        fieldColor = mix(fieldColor, wildMeadow, smoothstep(0.35, 0.65, macroFields));
        fieldColor = mix(fieldColor, dryMeadow, smoothstep(0.65, 0.95, macroFields) * 0.65);
        fieldColor = mix(fieldColor, loamSoil, (1.0 - turfClumps) * 0.22);

        // Clump lighting breakup: mimics the self-shadowing of dense grass clumps into the distance
        float clumpShadow = 0.82 + turfClumps * 0.24 + fineClumpTexture * 0.14 + microBladeGrain * 0.06;
        diffuseColor.rgb *= clumpShadow;
        diffuseColor.rgb = mix(diffuseColor.rgb, fieldColor * diffuseColor.rgb * 1.85, 0.58);

        // Autumn mode: restrained, authentic countryside ecology (olive, golden green, straw yellow, dry tan)
        // Strictly avoids neon orange or bleached yellow plates
        if (terrainAutumn > 0.01) {
          vec3 autumnOlive = vec3(0.48, 0.54, 0.24);
          vec3 autumnGold = vec3(0.62, 0.56, 0.28);
          vec3 autumnStraw = vec3(0.70, 0.62, 0.32);
          vec3 autumnTan = vec3(0.54, 0.46, 0.28);
          vec3 autumnEarth = vec3(0.38, 0.32, 0.22);

          vec3 autumnTone = mix(autumnOlive, autumnGold, meadowDrift);
          autumnTone = mix(autumnTone, autumnStraw, smoothstep(0.4, 0.8, macroFields) * 0.70);
          autumnTone = mix(autumnTone, autumnTan, (1.0 - turfClumps) * 0.35);
          autumnTone = mix(autumnTone, autumnEarth, (1.0 - fineClumpTexture) * 0.20);

          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * autumnTone * 1.62, terrainAutumn * 0.90);
        }

        // Rain wetness darkening
        diffuseColor.rgb *= 1.0 - terrainWet * 0.22;

        // Winter snow accumulation
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.88), terrainSnow * 0.92);

        // Atmospheric perspective: softly soften contrast and saturate distant horizon hills
        float haze = smoothstep(450.0, 2600.0, vCamDist);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.94 + vec3(0.04, 0.06, 0.08), haze * 0.32);
      `);
    };
  }

  customProgramCacheKey() {
    return 'aftermile-terrain-v3';
  }
}
