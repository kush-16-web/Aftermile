import * as THREE from 'three';
import type { VehicleConfig } from './VehicleConfig.ts';

/** Animates the model's own surfaces. No supplemental lens geometry. */
export class VehicleLights {
  mode: 'auto'|'on'|'off' = 'auto';
  group = new THREE.Group();
  headMaterials: THREE.MeshStandardMaterial[] = [];
  tailMaterials: THREE.MeshStandardMaterial[] = [];
  brakeMaterials: THREE.MeshStandardMaterial[] = [];
  reverseMaterials: THREE.MeshStandardMaterial[] = [];
  spots: THREE.SpotLight[] = [];
  constructor(config: VehicleConfig) {
    this.group.name = 'RoadIllumination';
    for (const position of config.lights.headlights) {
      const spot = new THREE.SpotLight(0xe2eeff,0,config.lights.range,.4,.78,1.5);
      spot.position.fromArray(position);
      spot.target.position.set(position[0]*1.5,.02,-42);
      spot.castShadow = false;
      this.group.add(spot,spot.target); this.spots.push(spot);
    }
  }
  bind(model: THREE.Object3D, config: VehicleConfig) {
    const bindings = config.lights.materials;
    const all = new Set<THREE.MeshStandardMaterial>();
    model.traverse(o=>{
      if(o instanceof THREE.Mesh) for(const m of Array.isArray(o.material)?o.material:[o.material])
        if(m instanceof THREE.MeshStandardMaterial) all.add(m);
    });
    const find = (names:string[])=>[...all].filter(m=>names.includes(m.name));
    this.headMaterials=find(bindings.head); this.tailMaterials=find(bindings.tail);
    this.brakeMaterials=find(bindings.brake); this.reverseMaterials=find(bindings.reverse);
    for(const [role,names] of Object.entries(bindings))
      for(const name of names) if(![...all].some(m=>m.name===name)) throw new Error(`Missing ${role} lamp material: ${name}`);
    this.update(0,0,0,config);
  }
  toggle() {this.mode=this.mode==='auto'?'on':this.mode==='on'?'off':'auto';return this.mode;}
  update(night:number, braking:number, speed:number, config:VehicleConfig) {
    const enabled=this.mode==='on'?1:this.mode==='off'?0:THREE.MathUtils.clamp(night,0,1);
    const brake=THREE.MathUtils.smoothstep(braking,.04,.25);
    for(const m of this.headMaterials)m.emissiveIntensity=enabled*3.2;
    for(const s of this.spots)s.intensity=enabled*config.lights.intensity;
    for(const m of this.tailMaterials)m.emissiveIntensity=enabled*.45+brake*2.4;
    for(const m of this.brakeMaterials)m.emissiveIntensity=brake*2.8;
    for(const m of this.reverseMaterials)m.emissiveIntensity=speed<-.08?2.1:0;
  }
  dispose() {for(const spot of this.spots)spot.dispose();this.group.removeFromParent();}
}
