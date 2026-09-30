import * as THREE from 'three';

function shell(rings: number[][]) {
  const positions: number[] = [], indices: number[] = [];
  for (const [z, width, bottom, top] of rings) {
    const pts = [[-width*.7,bottom],[-width,bottom+.12],[-width,top-.13],[-width*.77,top],[width*.77,top],[width,top-.13],[width,bottom+.12],[width*.7,bottom]];
    for(const [x,y] of pts) positions.push(x,y,z);
  }
  for(let i=0;i<rings.length-1;i++) for(let j=0;j<8;j++) {
    const a=i*8+j,b=i*8+(j+1)%8,c=(i+1)*8+j,d=(i+1)*8+(j+1)%8;
    indices.push(a,c,b,b,c,d);
  }
  for(let j=1;j<7;j++) { indices.push(0,j+1,j); const end=(rings.length-1)*8;indices.push(end,end+j,end+j+1); }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export class TrafficModel {
  group = new THREE.Group(); body = new THREE.Group(); wheels: THREE.Group[] = []; pivots:THREE.Group[]=[];
  brakeMaterial = new THREE.MeshStandardMaterial({color:0x9f1526,emissive:0xff1839,emissiveIntensity:.8});
  headMaterial = new THREE.MeshStandardMaterial({color:0xecf8fa,emissive:0xc9eaff,emissiveIntensity:2});
  reverseMaterial = new THREE.MeshStandardMaterial({color:0x667a7e,emissive:0xe0faff,emissiveIntensity:0});
  owned = new Set<THREE.BufferGeometry>();
  materials = new Set<THREE.Material>();
  headlights: THREE.SpotLight[] = [];
  constructor(color=0x9c1531, type='sedan') {
    const red=new THREE.MeshStandardMaterial({color,metalness:.6,roughness:.29});
    const black=new THREE.MeshStandardMaterial({color:0x11171d,metalness:.42,roughness:.38});
    const glass=new THREE.MeshStandardMaterial({color:0x172c36,metalness:.7,roughness:.13});
    const silver=new THREE.MeshStandardMaterial({color:0x778c96,metalness:.9,roughness:.25});
    const rubber=new THREE.MeshStandardMaterial({color:0x111216,roughness:.93});
    const cyan=new THREE.MeshStandardMaterial({color:0x498994,emissive:0x298594,emissiveIntensity:.5,metalness:.5,roughness:.4});
    [red,black,glass,silver,rubber,cyan,this.brakeMaterial,this.headMaterial,this.reverseMaterial].forEach(m=>this.materials.add(m));
    this.group.add(this.body);
    const mesh=(g:THREE.BufferGeometry,m:THREE.Material,parent=this.body) => {this.owned.add(g);const obj=new THREE.Mesh(g,m);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;};
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material,parent=this.body)=>{const obj=mesh(new THREE.BoxGeometry(w,h,d),m,parent);obj.position.set(x,y,z);return obj;};

    {
      const tall=type==='suv'||type==='pickup'||type==='truck';
      mesh(shell([[-2.15,.85,.28,.8],[-1.5,.92,.3,.97],[1.6,.92,.3,.98],[2.1,.8,.35,.87]]),red);
      const cabin=box(0,tall?1.3:1.15,.1,1.55,tall?.8:.55,2.2,glass);
      box(0,tall?1.72:1.45,.2,1.5,.075,2.05,red);
      if(type==='truck') {box(0,1.7,2,2.1,2.6,4.8,red);this.group.scale.setScalar(1.08);}
      if(type==='pickup') cabin.scale.z=.68;
      if(type==='taxi') box(0,1.58,.15,.5,.18,.22,this.headMaterial);
      for(const side of [-1,1]) {box(side*.64,.7,-2.14,.38,.13,.035,this.headMaterial);box(side*.7,.75,type==='truck'?4.43:2.12,.3,.13,.04,this.brakeMaterial);}
    }
    for(const z of [-1.46,1.5]) for(const side of [-1,1]) {
      const pivot=new THREE.Group();pivot.position.set(side*1.025,.43,z);this.group.add(pivot);this.pivots.push(pivot);
      const wheel=new THREE.Group();pivot.add(wheel);this.wheels.push(wheel);
      const tire=mesh(new THREE.CylinderGeometry(.42,.42,.3,12),rubber,wheel);tire.rotation.z=Math.PI/2;
      const rim=mesh(new THREE.CylinderGeometry(.29,.29,.31,8),black,wheel);rim.rotation.z=Math.PI/2;
      for(let j=0;j<5;j++) {
        const a=j*Math.PI*2/5;
        const spoke=box(side*.164,Math.sin(a)*.13,Math.cos(a)*.13,.025,.045,.26,silver,wheel);spoke.rotation.x=-a;
      }
      const center=mesh(new THREE.CylinderGeometry(.07,.07,.345,10),silver,wheel);center.rotation.z=Math.PI/2;
    }
  }
  animate(dt:number,speed:number,steering:number,braking:boolean,night:number,roll=0,pitch=0) {
    for(let i=0;i<this.wheels.length;i++){this.wheels[i].rotation.x-=speed*dt/.42;if(i<2)this.pivots[i].rotation.y=-steering;}
    this.body.rotation.z=roll;this.body.rotation.x=pitch;
    this.brakeMaterial.emissiveIntensity=braking?4: .45+night*1.5;
    this.reverseMaterial.emissiveIntensity=speed<-.2?2:0;
    this.headMaterial.emissiveIntensity=1+night*3;
    this.headlights.forEach(l=>l.intensity=night*85);
  }
  dispose() {this.owned.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.group.removeFromParent();}
}
