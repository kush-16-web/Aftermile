import * as THREE from 'three';
export class Materials {
  asphalt = new THREE.MeshStandardMaterial({color:0x404a50,roughness:.86,metalness:.04});
  terrain = new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
  concrete = new THREE.MeshStandardMaterial({color:0x979c96,roughness:.94});
  dark = new THREE.MeshStandardMaterial({color:0x252e35,roughness:.7});
  metal = new THREE.MeshStandardMaterial({color:0x97a4a5,metalness:.55,roughness:.4});
  white = new THREE.MeshStandardMaterial({color:0xd6d8c9,roughness:.7});
  yellow = new THREE.MeshStandardMaterial({color:0xd7bc78,roughness:.7});
  bark = new THREE.MeshStandardMaterial({color:0x534636,roughness:1});
  leaf = new THREE.MeshStandardMaterial({color:0x496452,roughness:1});
  pine = new THREE.MeshStandardMaterial({color:0x284b43,roughness:1});
  grass = new THREE.MeshStandardMaterial({color:0x8e9870,side:THREE.DoubleSide,roughness:1});
  rock = new THREE.MeshStandardMaterial({color:0x80796b,roughness:1});
  sand = new THREE.MeshStandardMaterial({color:0xb7ac8a,roughness:1});
  red = new THREE.MeshStandardMaterial({color:0x854453,metalness:.1,roughness:.6});
  glass = new THREE.MeshStandardMaterial({color:0x47727b,metalness:.65,roughness:.22,emissive:0x254d53,emissiveIntensity:.12});
  light = new THREE.MeshStandardMaterial({color:0xffe6b2,emissive:0xffd299,emissiveIntensity:1});
  cyan = new THREE.MeshStandardMaterial({color:0x82bdb6,emissive:0x3ea7a0,emissiveIntensity:.6});
  signalRed = new THREE.MeshStandardMaterial({color:0xa62135,emissive:0xff2040,emissiveIntensity:1});
  signalAmber = new THREE.MeshStandardMaterial({color:0xae7722,emissive:0xffa721,emissiveIntensity:0});
  signalGreen = new THREE.MeshStandardMaterial({color:0x2b866d,emissive:0x63ffb3,emissiveIntensity:0});
  box = new THREE.BoxGeometry(1,1,1);
  cylinder = new THREE.CylinderGeometry(1,1,1,7);
  cone = new THREE.ConeGeometry(1,1,9);
  sphere = new THREE.IcosahedronGeometry(1,1);
  leafShape = new THREE.IcosahedronGeometry(1,2);
  grassShape:THREE.BufferGeometry;
  constructor() {
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext('2d')!,data=ctx.createImageData(128,128);
    let r=17;
    for(let i=0;i<data.data.length;i+=4){r=(r*1664525+1013904223)>>>0;const n=150+(r%80);data.data[i]=data.data[i+1]=data.data[i+2]=n;data.data[i+3]=255;}
    ctx.putImageData(data,0,0);
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(8,60);texture.colorSpace=THREE.SRGBColorSpace;
    this.asphalt.map=texture;
    this.grassShape=new THREE.BufferGeometry();this.grassShape.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0, .08,1,0, .5,0,0, 0,0,-.5, 0,1,.08, 0,0,.5],3));this.grassShape.computeVertexNormals();
  }
  update(wet:number,snow:number,autumn:number,night:number,reflections:boolean,signal:number) {
    this.asphalt.roughness=reflections? .86-wet*.62:.86;this.asphalt.metalness=reflections?.04+wet*.25:.04;
    this.asphalt.color.set(0x404a50).lerp(new THREE.Color(0xbac4c8),snow*.65);
    this.leaf.color.set(0x496452).lerp(new THREE.Color(0xbc773e),autumn).lerp(new THREE.Color(0xc7d1d1),snow);
    this.pine.color.set(0x284b43).lerp(new THREE.Color(0xa5b9b9),snow*.8);
    this.grass.color.set(0x8e9870).lerp(new THREE.Color(0xcfad6d),autumn*.5).lerp(new THREE.Color(0xe0e6e3),snow);
    this.light.emissiveIntensity=.12+night*2.7;
    this.glass.emissiveIntensity=.08+night*.9;
    this.signalGreen.emissiveIntensity=signal===0?3:.05;
    this.signalAmber.emissiveIntensity=signal===1?3:.05;
    this.signalRed.emissiveIntensity=signal===2?3:.05;
  }
}
