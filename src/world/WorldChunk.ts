import * as THREE from 'three';
import { CHUNK, Road } from '../road/Road.ts';
import { rng, smooth } from '../core/math.ts';
import { Materials } from './Materials.ts';
import { Batch } from './Batch.ts';

export class WorldChunk {
  group=new THREE.Group();owned:THREE.BufferGeometry[]=[];textures:THREE.Texture[]=[];ownedMaterials:THREE.Material[]=[];
  start:number;
  constructor(public index:number,public road:Road,public m:Materials,vegetation=1) {
    this.start=index*CHUNK;const random=rng(index*79+road.seed),batch=new Batch();
    const p=(s:number,o:number,l=0)=> {const a=road.point(s,o,l);return new THREE.Vector3(a.x,a.y,a.z+this.start);};
    const at=(key:string,s:number,o:number,y:number,w:number,h:number,d:number,mat:THREE.Material,geo=m.box)=>{
      const v=p(s,o,y);batch.add(key,geo,mat,v.x,v.y,v.z,w,h,d,-road.heading(s),-Math.atan(road.grade(s)),road.bank(s));
    };
    this.surface([-8,8],m.asphalt,.025,true);
    this.surface([-10,-8],m.concrete,0);this.surface([8,10],m.concrete,0);
    this.surface([-.08,.08],m.yellow,.055);
    this.surface([-7.72,-7.59],m.white,.056);this.surface([7.59,7.72],m.white,.056);
    this.terrain();
    for(let s=this.start+5;s<this.start+CHUNK;s+=12) {
      at('lane',s,-4,.058,.13,.016,4.5,m.white);at('lane',s,4,.058,.13,.016,4.5,m.white);
    }
    const station=road.station(this.start-55);
    for(let s=this.start+10;s<this.start+CHUNK;s+=20) {
      const bridge=road.isBridge(s),tunnel=road.isTunnel(s);
      for(const side of [-1,1]) {
        if (Math.abs(station-s)<64 && side===1) continue;
        if (bridge||(!tunnel && (side===-1||index%3!==0))) {
          at('barrier',s,side*9,.75,.13,.25,20,m.metal);
          at('posts',s,side*9,.5,.15,1,.17,m.metal);
        }
        at('reflector',s,side*9.15,.7,.1,.14,.1,side===1?m.red:m.white);
      }
      if(bridge) {
        at('deck',s,0,-.8,19,1.3,20.1,m.concrete);
        for(const side of [-1,1])at('bridge-side',s,side*8.65,.56,.3,1.1,20,m.concrete);
        if(Math.floor(s/20)%4===0)for(const side of [-1,1])at('bridge-pier',s,side*6,-8,2.4,16,3,m.concrete);
        const region=road.region(s);
        if(region.biome==='bridge'&&Math.floor(s/20)%16===0) {
          for(const side of [-1,1]) {
            at('pylon',s,side*10,18,1.35,37,2.6,m.white);
            for(let cable=1;cable<9;cable++)for(const sign of [-1,1])batch.segment('cables',m.cylinder,m.metal,p(s,side*10,34-cable*.5),p(s+sign*cable*15,side*8.6,1.1),.065);
          }
          at('pylon-cross',s,0,30,21,1,1.6,m.white);
        }
      }
      if(tunnel) {
        for(const side of [-1,1])at('tunnel-wall',s,side*9.5,3.6,1,7.2,20.05,m.concrete);
        at('tunnel-roof',s,0,7.2,20,1,20.05,m.concrete);
        for(const side of [-1,1]) {
          at('tunnel-rib',s,side*8.85,3.8,.12,7,.22,m.dark);
          at('tunnel-light',s,side*7,6.55,.16,.08,6,m.light);
        }
      }
    }
    const mid=this.start+80,region=road.region(mid);
    if(region.biome==='city'||region.biome==='bridge'||index%2===0)for(let s=this.start+32;s<this.start+CHUNK;s+=80)for(const side of [-1,1]) {
      if(road.isTunnel(s))continue;
      at('lamp-pole',s,side*10.5,4.1,.12,8.2,.12,m.dark);
      at('lamp-arm',s,side*9,8.15,3.1,.1,.13,m.dark);
      at('lamp',s,side*7.7,8.08,.8,.075,.28,m.light);
    }
    const treeCount=Math.floor((region.biome==='city'?12:70)*vegetation);
    for(let i=0;i<treeCount;i++) {
      const s=this.start+random()*CHUNK,side=random()>.5?1:-1;
      const offset=side*(18+random()**1.55*210),w=road.weights(s);
      if((Math.abs(station-s)<70&&offset>0&&offset<48)||road.isBridge(s)||road.isTunnel(s))continue;
      const pos=p(s,offset);pos.y=road.terrain(s,offset);
      if(pos.y<8||(offset<0&&w.coast>.25)||random()<w.city*.8)continue;
      const height=5+random()*10,scale=.8+random()*.65,pine=random()>.45;
      batch.add('trunk',m.cylinder,m.bark,pos.x,pos.y+height*.4,pos.z,.18*scale,height*.8,.18*scale);
      if(pine)for(let layer=0;layer<3;layer++)batch.add('pine',m.cone,m.pine,pos.x,pos.y+height*(.48+layer*.19),pos.z,(3.4-layer*.7)*scale,height*.61,(3.4-layer*.7)*scale);
      else for(let crown=0;crown<3;crown++)batch.add('leaf',m.leafShape,m.leaf,pos.x+(crown-1)*1.35*scale,pos.y+height*(.7+(crown===1?.13:0)),pos.z+Math.sin(crown*3)*scale,3*scale,height*.26,2.6*scale,random()*6);
    }
    for(let i=0;i<Math.floor(140*vegetation);i++) {
      const s=this.start+random()*CHUNK,o=(random()>.5?1:-1)*(11+random()*17);
      if(road.isBridge(s)||road.isTunnel(s)||(Math.abs(station-s)<70&&o>0))continue;
      const a=p(s,o),h=road.terrain(s,o);
      if(h<8)continue;
      const scale=.3+random()*.65;
      batch.add('grass',m.grassShape,m.grass,a.x,h,a.z,scale,scale,scale,random()*6);
    }
    for(let i=0;i<8;i++) {
      const s=this.start+random()*CHUNK,o=(random()>.5?1:-1)*(35+random()*250),v=p(s,o);
      v.y=road.terrain(s,o);if(v.y<8)continue;const sz=1+random()*4;
      batch.add('rocks',m.sphere,m.rock,v.x,v.y,v.z,sz*1.6,sz*.6,sz,random()*6);
    }
    if(region.biome==='city'||road.weights(mid).city>.05) {
      for(let i=0;i<18;i++) {
        const s=this.start+random()*CHUNK,o=(random()>.5?1:-1)*(28+random()*230),v=p(s,o);
        const w=8+random()*19,d=8+random()*17,h=9+random()**1.6*92;
        v.y=road.terrain(s,o);
        batch.add('buildings',m.box,random()>.65?m.glass:m.concrete,v.x,v.y+h*.5,v.z,w,h,d);
        // Separate keys make facade materials deterministic for each batch.
        batch.add('roof',m.box,m.dark,v.x,v.y+h+.3,v.z,w*.98,.6,d*.98);
        for(let floor=0;floor<Math.min(16,Math.floor(h/4));floor++) {
          if(random()<.2)continue;
          for(const face of [-1,1])batch.add('windows',m.box,m.glass,v.x,v.y+3+floor*4,v.z+face*(d*.5+.02),w*.78,1.3,.04);
        }
      }
      for(let s=this.start+20;s<this.start+CHUNK;s+=40) {
        at('rail-piers',s,27,6,1.3,12,1.6,m.concrete);
        at('rail-deck',s,27,12,5,.65,40.1,m.concrete);
        for(const o of [25.6,28.4])at('rail',s,o,12.5,.09,.15,40.1,m.metal);
      }
      if(index%4===0) {
        const s=this.start+80;
        for(const side of [-1,1])at('gantry',s,side*10,5,.25,10,.25,m.metal);
        at('gantry',s,0,9.6,20,.22,.22,m.metal);
        this.sign(road.region(s+800).name,p(s,0,8.5),8,1.4,-road.heading(s));
      }
      if(index%5===0) {
        const s=this.start+120;
        for(const side of [-1,1])at('signal-pole',s,side*8.5,4.2,.16,8.4,.16,m.dark);
        at('signal-arm',s,0,8.4,17,.18,.18,m.dark);
        for(const lane of [-6,-2,2,6]) {
          at('signal-box',s,lane,7.7,.55,1.55,.45,m.dark);
          [m.signalRed,m.signalAmber,m.signalGreen].forEach((mat,k)=>at('signal-'+k,s-.26,lane,8.15-k*.44,.23,.23,.08,mat));
        }
        at('stop-line',s-8,0,.061,15.5,.015,.4,m.white);
      }
      if(index%7===0) {
        const s=this.start+85;
        for(const side of [-1,1])at('overpass-pier',s,side*18,4.5,3,9,4,m.concrete);
        at('overpass',s,0,9,70,1,11,m.concrete);
      }
    }
    if(station>=this.start&&station<this.start+CHUNK) {
      // A broad, flush pull-off gives enough space to brake, turn and rejoin.
      this.patch(station-65,station+65,8,41,m.asphalt);
      at('station-building',station+28,28,2.7,18,5.4,10,m.concrete);
      at('station-shop-glass',station+22.9,28,2.6,15,3.5,.1,m.glass);
      at('station-canopy',station,22,4.8,18,.45,23,m.white);
      at('station-band',station-11.6,22,4.82,18,.5,.12,m.red);
      for(const s of [station-7,station+7])for(const o of [16,28]) {
        at('station-column',s,o,2.3,.24,4.6,.24,m.metal);
        at('pump',s,o,1,.7,2,.6,m.white);at('pump-screen',s-.32,o,1.4,.45,.43,.02,m.cyan);
      }
      at('station-signpost',station-43,13,4,.3,8,.3,m.white);
      this.sign('NIGHT OWL / FUEL',p(station-43,13,7.5),6,1.5,-road.heading(station),true);
      this.sign('NIGHT OWL',p(station-11.7,22,4.8),7,.48,-road.heading(station),true);
      // A subtle ground border makes the interactive refueling area legible.
      for(const side of [14,30])at('fuel-zone',station,side,.08,.08,.03,35,m.cyan);
    }
    if(index%9===3&&!road.isBridge(mid)&&!road.isTunnel(mid)) {
      const labels=['MOONLIT DINER','CRESCENT MOTEL','NOVA MOTORS','EMBER KITCHEN'];
      at('outpost',mid,32,3,21,6,13,m.concrete);
      at('outpost-glass',mid-6.55,32,2.8,16,3.5,.06,m.glass);
      at('outpost-roof',mid,32,6.2,23,.45,15,m.red);
      this.sign(labels[Math.floor(random()*labels.length)],p(mid-6.65,32,5.2),13,1.3,-road.heading(mid),true);
      this.patch(mid-30,mid+30,10,46,m.asphalt);
    }
    if(index%30===22) {
      const s=mid,o=210;
      at('runway',s,o,-2,40,.15,140,m.dark);
      for(let d=-60;d<=60;d+=15)for(const side of [-1,1])at('runway-lights',s+d,o+side*18,-1.5,.5,.3,.5,m.light);
      at('tower',s-45,o+42,9,5,18,5,m.concrete);at('tower-glass',s-45,o+42,19,9,4,8,m.glass);
      at('hangar',s+40,o+47,4,35,8,28,m.metal);
    }
    batch.build(this.group);
    this.group.traverse(o=>{if(o instanceof THREE.InstancedMesh&&o.geometry===m.grassShape)o.castShadow=false;});
  }
  surface(offsets:number[],material:THREE.Material,lift=0,uv=false) {
    this.grid(this.start,this.start+CHUNK,offsets,material,(_s,o)=>this.road.height(_s)+o*this.road.bank(_s)+lift,false,uv);
  }
  patch(s0:number,s1:number,o0:number,o1:number,material:THREE.Material) {this.grid(s0,s1,[o0,o1],material,(s,o)=>this.road.height(s)+o*this.road.bank(s)-.015);}
  terrain() {
    this.grid(this.start,this.start+CHUNK,[-1000,-600,-350,-220,-140,-90,-50,-30,-16,-10,0,10,16,30,50,90,140,220,350,600,1000],this.m.terrain,(s,o)=>this.road.terrain(s,o),true);
  }
  grid(s0:number,s1:number,offsets:number[],material:THREE.Material,height:(s:number,o:number)=>number,colored=false,uv=false) {
    const positions:number[]=[],colors:number[]=[],uvs:number[]=[],indices:number[]=[],rows=Math.ceil((s1-s0)/10),n=offsets.length;
    const grass=new THREE.Color(0x66715b),sand=new THREE.Color(0xb8aa88),hill=new THREE.Color(0x7b816a),city=new THREE.Color(0x777970);
    for(let j=0;j<=rows;j++)for(let i=0;i<n;i++) {
      const s=s0+(s1-s0)*j/rows,o=offsets[i],p=this.road.point(s,o);positions.push(p.x,height(s,o),p.z+this.start);uvs.push(i/(n-1),j/rows);
      if(colored) {
        const weights=this.road.weights(s),c=grass.clone().lerp(hill,smooth((Math.abs(o)-25)/200));
        c.lerp(sand,Math.max(weights.coast*.78,weights.bridge*.75)).lerp(city,weights.city*.7);
        c.multiplyScalar(.94+.07*Math.sin(s*.045+o*.08));colors.push(c.r,c.g,c.b);
      }
      if(j<rows&&i<n-1){const a=j*n+i,b=a+1,c=a+n,d=c+1;indices.push(a,b,c,b,d,c);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);
    if(colored)geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    if(uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geo.computeVertexNormals();this.owned.push(geo);const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;this.group.add(mesh);
  }
  sign(text:string,pos:THREE.Vector3,width:number,height:number,angle:number,neon=false) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=neon?'#151e25':'#254a46';ctx.fillRect(0,0,512,96);ctx.strokeStyle=neon?'#b77581':'#a9c2ad';ctx.lineWidth=3;ctx.strokeRect(8,8,496,80);
    ctx.font='500 30px sans-serif';ctx.fillStyle=neon?'#f0d4d4':'#e7ede4';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text.toUpperCase(),256,50,480);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.textures.push(texture);
    const material=new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:neon?.45:.12,roughness:.8,side:THREE.DoubleSide});this.ownedMaterials.push(material);
    const geo=new THREE.PlaneGeometry(width,height);this.owned.push(geo);const mesh=new THREE.Mesh(geo,material);mesh.position.copy(pos);mesh.rotation.y=angle;this.group.add(mesh);
  }
  dispose() {
    this.group.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});
    this.owned.forEach(g=>g.dispose());this.textures.forEach(t=>t.dispose());this.ownedMaterials.forEach(m=>m.dispose());this.group.removeFromParent();this.group.clear();
  }
}
