import * as THREE from 'three';

/** World-space metre-scaled surface breakup on the shared slope/biome palette.
 * Two coherent detail scales, no extra render passes or large texture set. */
export class TerrainMaterial extends THREE.MeshStandardMaterial {
  uniforms={terrainOrigin:{value:0},terrainAutumn:{value:0},terrainSnow:{value:0},terrainWet:{value:0}};
  constructor(){
    super({vertexColors:true,roughness:1});
    this.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader='uniform float terrainOrigin; varying vec3 vTerrainWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vTerrainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
        vTerrainWorld.z-=terrainOrigin;`);
      shader.fragmentShader=`varying vec3 vTerrainWorld;
        uniform float terrainAutumn,terrainSnow,terrainWet;
        float terrainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float terrainNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(terrainHash(i),terrainHash(i+vec2(1.,0.)),f.x),mix(terrainHash(i+vec2(0.,1.)),terrainHash(i+vec2(1.)),f.x),f.y);}
        `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float patches=terrainNoise(vTerrainWorld.xz*.045);
        float grain=terrainNoise(vTerrainWorld.xz*3.4);
        grain=mix(grain,.5,clamp(length(fwidth(vTerrainWorld.xz))*2.0,0.0,1.0));
        diffuseColor.rgb*=.80+patches*.30+grain*.16;
        diffuseColor.rgb*=mix(vec3(1.0),vec3(1.12,.94,.73),terrainAutumn);
        diffuseColor.rgb*=1.0-terrainWet*.20;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.75,.80,.82),terrainSnow*.88);`);
    };
  }
  customProgramCacheKey(){return 'aftermile-terrain-v1';}
}
