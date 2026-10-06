import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Batch } from './Batch.ts';
import type { Materials } from './Materials.ts';

export type WorldAssetKind='tree'|'pine'|'rock'|'bush'|'grass';
interface Part { geometry:THREE.BufferGeometry; material:THREE.Material; matrix:THREE.Matrix4; }

export class WorldAssetLibrary {
  readonly parts=new Map<WorldAssetKind,Part[]>();
  readonly ready:Promise<void>;
  loaded=false;
  private placement=new THREE.Matrix4();private combined=new THREE.Matrix4();
  private position=new THREE.Vector3();private rotation=new THREE.Quaternion();private scale=new THREE.Vector3();private axis=new THREE.Vector3(0,1,0);
  constructor(private materials:Materials){
    const loader=new GLTFLoader();
    this.ready=Promise.all([
      this.load(loader,'tree','/world/kenney/tree_detailed.glb',8),
      this.load(loader,'pine','/world/kenney/tree_pineTallB_detailed.glb',12),
      this.load(loader,'rock','/world/kenney/rock_largeC.glb',2.8),
      this.load(loader,'bush','/world/kenney/plant_bushDetailed.glb',2.2),
      this.load(loader,'grass','/world/kenney/grass_leafs.glb',1.2),
    ]).then(()=>{this.loaded=this.parts.size>0;}).catch(()=>{this.loaded=false;});
  }
  has(kind:WorldAssetKind){return (this.parts.get(kind)?.length??0)>0;}
  add(batch:Batch,kind:WorldAssetKind,key:string,x:number,y:number,z:number,scale=1,rotation=0){
    const parts=this.parts.get(kind);if(!parts?.length)return false;
    this.placement.compose(this.position.set(x,y,z),this.rotation.setFromAxisAngle(this.axis,rotation),this.scale.setScalar(scale));
    parts.forEach((part,index)=>batch.addMatrix(`${key}-${kind}-${index}`,part.geometry,part.material,this.combined.multiplyMatrices(this.placement,part.matrix)));
    return true;
  }
  private surface(material:THREE.MeshStandardMaterial,kind:WorldAssetKind){
    const foliage=/leaf|grass/i.test(material.name)&&kind!=='rock';
    const evergreen=kind==='pine',cover=kind==='grass'||kind==='bush';
    material.color.set(kind==='rock'?0x858579:foliage?(evergreen?0x405b4f:cover?0x83936b:0x617b53):0x685746);
    material.roughness=.95;material.metalness=0;
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.materials.terrain.uniforms);
      shader.uniforms.uWindTime=this.materials.timeUniform;shader.uniforms.uWindStrength=this.materials.windUniform;
      shader.vertexShader=`uniform float terrainOrigin,uWindTime,uWindStrength,terrainSnow;
        varying float vWorldUp,vSeasonChoice;\n`+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec4 anchor=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        vSeasonChoice=fract(sin(dot(vec2(anchor.x,anchor.z-terrainOrigin),vec2(.071,.043)))*43758.5453);
        vWorldUp=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal).y;
        ${foliage?'transformed.x+=sin(uWindTime*1.5+anchor.x*.04+(anchor.z-terrainOrigin)*.025)*uWindStrength*.08*clamp(position.y*.3,0.,1.);':''}
        ${cover?'float coverFade=1.0-smoothstep(220.,510.,distance(cameraPosition.xz,anchor.xz));transformed.y*=coverFade*mix(1.,.22,terrainSnow);':''}
      `);
      shader.fragmentShader=`uniform float terrainAutumn,terrainSnow,terrainWet;varying float vWorldUp,vSeasonChoice;\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        ${foliage&&!evergreen&&!cover?`vec3 warm=mix(vec3(.42,.31,.12),vec3(.52,.17,.07),vSeasonChoice);
          warm=mix(warm,vec3(.26,.34,.17),smoothstep(.75,.95,vSeasonChoice));
          diffuseColor.rgb=mix(diffuseColor.rgb,warm,terrainAutumn);`:foliage?'diffuseColor.rgb*=mix(vec3(1.),vec3(1.07,.96,.78),terrainAutumn);':''}
        diffuseColor.rgb*=1.0-terrainWet*.16;
        float snowCap=terrainSnow*smoothstep(-.15,.65,vWorldUp);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.76,.82,.85),snowCap*.93);
      `);
    };
    material.customProgramCacheKey=()=>`world-asset-season-${kind}-${foliage}`;
  }
  private async load(loader:GLTFLoader,kind:WorldAssetKind,url:string,targetHeight:number){
    try{
      const gltf=await loader.loadAsync(url),root=gltf.scene;root.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
      if(!Number.isFinite(size.y)||size.y<=0)return;
      root.scale.setScalar(targetHeight/size.y);root.updateMatrixWorld(true);
      const scaledBox=new THREE.Box3().setFromObject(root),lift=new THREE.Matrix4().makeTranslation(0,-scaledBox.min.y,0),parts:Part[]=[];
      root.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        const source=Array.isArray(object.material)?object.material[0]:object.material;
        const material=source.clone() as THREE.MeshStandardMaterial;this.surface(material,kind);
        parts.push({geometry:object.geometry,material,matrix:new THREE.Matrix4().multiplyMatrices(lift,object.matrixWorld)});
      });
      if(parts.length)this.parts.set(kind,parts);
    }catch{}
  }
  dispose(){for(const parts of this.parts.values())for(const p of parts){p.material.dispose();p.geometry.dispose();}this.parts.clear();}
}
