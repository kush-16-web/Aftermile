import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Batch } from './Batch.ts';

export type WorldAssetKind='tree'|'pine'|'rock'|'bush'|'grass';
interface Part { geometry:THREE.BufferGeometry; material:THREE.Material; matrix:THREE.Matrix4; }

/** Small, self-contained CC0 models are optional detail. The procedural
 * primitives remain the immediate fallback while these files decode. */
export class WorldAssetLibrary {
  readonly parts=new Map<WorldAssetKind,Part[]>();
  readonly ready:Promise<void>;
  loaded=false;
  constructor(){
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
    const placement=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rotation),new THREE.Vector3(scale,scale,scale));
    // Each GLB can contain several meshes/materials. Keep each part in its
    // own instanced row so a mesh never renders with another part's geometry.
    parts.forEach((part,index)=>batch.addMatrix(`${key}-${kind}-${index}`,part.geometry,part.material,new THREE.Matrix4().multiplyMatrices(placement,part.matrix)));
    return true;
  }
  private async load(loader:GLTFLoader,kind:WorldAssetKind,url:string,targetHeight:number){
    try{
      const gltf=await loader.loadAsync(url),root=gltf.scene;root.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
      if(!Number.isFinite(size.y)||size.y<=0)return;
      const factor=targetHeight/size.y;root.scale.setScalar(factor);root.updateMatrixWorld(true);
      const scaledBox=new THREE.Box3().setFromObject(root),lift=new THREE.Matrix4().makeTranslation(0,-scaledBox.min.y,0),parts:Part[]=[];
      root.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        const material=Array.isArray(object.material)?object.material[0]:object.material;
        const clone=material.clone();clone.roughness=.92;clone.metalness=0;
        parts.push({geometry:object.geometry,material:clone,matrix:new THREE.Matrix4().multiplyMatrices(lift,object.matrixWorld)});
      });
      if(parts.length)this.parts.set(kind,parts);
    }catch{}
  }
  dispose(){for(const parts of this.parts.values())for(const p of parts)p.material.dispose();this.parts.clear();}
}
