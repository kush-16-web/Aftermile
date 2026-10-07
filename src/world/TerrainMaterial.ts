import * as THREE from 'three';

/** World-space multi-tier procedural grassland surface shader.
 * Delivers rich, organic meadow breakup, stratified soil/rock tones,
 * vibrant autumn grassland color transitions, and soft atmospheric horizon integration.
 * Now includes field region variation and terrain depth layering. */
export class TerrainMaterial extends THREE.MeshStandardMaterial {
  uniforms = {
    terrainOrigin: { value: 0 },
    terrainAutumn: { value: 0 },
    terrainSnow: { value: 0 },
    terrainWet: { value: 0 },
    uFieldWeights: { value: new THREE.Vector4(0.25, 0.25, 0.25, 0.25) }
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
        // Field region weights - passed from CPU for current camera region
        // These would ideally be computed in shader but we pass as uniforms for now
        uniform vec4 uFieldWeights; // fresh, dry, wild, pasture
        uniform float uAutumn;
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
        vec2 pos = vTerrainWorld.xz;
        float grainFade = clamp(1.0 - vCamDist * 0.006, 0.0, 1.0);

        // Realistic pasture-scale noise wavelengths (visible across 50m - 300m fields)
        float macroFields = terrainNoise(pos * 0.018);
        float meadowDrift = terrainFbm(pos * 0.045 + vec2(1.7, 3.2));
        float turfClumps = terrainNoise(pos * 0.22);
        float fineClumpTexture = terrainNoise(pos * 0.75);

        // FIELD REGION BIOMES (blended via uFieldWeights)
        // 1. Fresh Meadow (fertile lowlands) - richer green
        vec3 freshMeadow = vec3(0.18, 0.28, 0.10);
        // 2. Dry Meadow (sun-cured) - olive/golden
        vec3 dryMeadow = vec3(0.24, 0.30, 0.11);
        // 3. Wild Meadow (mixed grasses) - sage-olive
        vec3 wildMeadow = vec3(0.20, 0.26, 0.11);
        // 4. Open Pasture (grazed) - shorter, warmer
        vec3 pastureMeadow = vec3(0.22, 0.30, 0.12);
        // Rich damp turf undertone
        vec3 loamFloor = vec3(0.14, 0.20, 0.08);

        // Blend field regions
        vec3 fieldColor = mix(freshMeadow, dryMeadow, uFieldWeights.y);
        fieldColor = mix(fieldColor, wildMeadow, uFieldWeights.z);
        fieldColor = mix(fieldColor, pastureMeadow, uFieldWeights.w);
        fieldColor = mix(fieldColor, loamFloor, (1.0 - turfClumps) * 0.25);

        // Multi-scale natural meadow structure:
        // 1. Pastoral mowing / swathing waves (25m scale)
        float pastureSwath = sin(pos.x * 0.05 + sin(pos.y * 0.035) * 1.8) * 0.08;
        // 2. Natural turf clumping & uneven growth (4-10m scale)
        float clumping = (terrainNoise(pos * 0.18) - 0.5) * 0.14 + (terrainNoise(pos * 0.45) - 0.5) * 0.09;
        // 3. Fine grass blade grain (fades smoothly with distance to prevent aliasing)
        float bladeGrain = (terrainNoise(pos * 1.8) - 0.5) * 0.12 * grainFade;
        float turfStructure = pastureSwath + clumping + bladeGrain;

        vec3 meadowBase = fieldColor * (1.0 + turfStructure);

        // Precise grassland detection: green dominant over red (rocks are neutral gray, sand is red-dominant)
        float isGrassland = smoothstep(0.005, 0.030, diffuseColor.g - diffuseColor.r);

        // Autumn mode: authentic countryside grassland (muted green, olive, golden green, straw)
        // Strictly green-dominant (G > R) to avoid orange/peach ground while preserving autumn separation
        vec3 autumnFresh = vec3(0.18, 0.28, 0.10);   // Fresh autumn - muted green
        vec3 autumnDry = vec3(0.25, 0.30, 0.12);    // Dry autumn - olive/gold
        vec3 autumnWild = vec3(0.21, 0.27, 0.11);   // Wild autumn - sage
        vec3 autumnPasture = vec3(0.23, 0.29, 0.12); // Pasture autumn - straw-green
        vec3 autumnDeep = vec3(0.16, 0.26, 0.10);   // Deep turf
        vec3 autumnFloor = vec3(0.14, 0.21, 0.08);  // Floor

        vec3 autumnTone = mix(autumnFresh, autumnDry, uFieldWeights.y);
        autumnTone = mix(autumnTone, autumnWild, uFieldWeights.z);
        autumnTone = mix(autumnTone, autumnPasture, uFieldWeights.w);
        autumnTone = mix(autumnTone, autumnDeep, (1.0 - turfClumps) * 0.25);
        autumnTone = mix(autumnTone, autumnFloor, (1.0 - fineClumpTexture) * 0.18);

        vec3 autumnMeadow = autumnTone * (1.0 + turfStructure);

        vec3 targetMeadow = terrainAutumn > 0.01 ? autumnMeadow : meadowBase;
        diffuseColor.rgb = mix(diffuseColor.rgb, targetMeadow, isGrassland);

        // Rain wetness darkening
        diffuseColor.rgb *= 1.0 - terrainWet * 0.22;

        // Winter snow accumulation
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.88), terrainSnow * 0.92);

        // TERRAIN DEPTH LAYERING: foreground/midground/distant separation
        // Without atmospheric fog (next pass), use subtle color/value shifts
        float depthNear = smoothstep(0.0, 400.0, vCamDist);
        float depthMid = smoothstep(400.0, 2000.0, vCamDist);
        float depthFar = smoothstep(2000.0, 8000.0, vCamDist);

        // Foreground (0-400m): full color fidelity, slightly warmer
        vec3 fgTint = vec3(1.02, 1.0, 0.98);
        // Midground (400m-2km): slight desaturation, cooler
        vec3 mgTint = vec3(0.98, 0.99, 1.01);
        // Distant (2km-8km): more desaturated, bluer, lighter (atmospheric perspective preview)
        vec3 bgTint = vec3(0.94, 0.96, 1.04);
        // Very distant (8km+): strong atmospheric preview
        vec3 vdTint = vec3(0.90, 0.93, 1.06);

        vec3 depthTint = mix(fgTint, mgTint, depthMid);
        depthTint = mix(depthTint, bgTint, depthFar);
        depthTint = mix(depthTint, vdTint, smoothstep(8000.0, 16000.0, vCamDist));

        // Apply depth tint only to grassland areas
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * depthTint, isGrassland * 0.5);

        // Additional distant value compression (distant terrain lighter)
        float valueCompress = smoothstep(1500.0, 6000.0, vCamDist) * 0.15;
        float luminance = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(luminance * 1.2), isGrassland * valueCompress);
      `);
    };
  }

  customProgramCacheKey() {
    return 'aftermile-terrain-v9';
  }
}