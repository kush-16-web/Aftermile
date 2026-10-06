import * as THREE from 'three';
export class Batch {
  items=new Map<string,{geo:THREE.BufferGeometry,mat:THREE.Material,matrices:THREE.Matrix4[]}>();
  temp=new THREE.Object3D();
  add(key:string,geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1,ry=0,rx=0,rz=0) {
    let row=this.items.get(key);if(!row){row={geo,mat,matrices:[]};this.items.set(key,row);}
    this.temp.position.set(x,y,z);this.temp.scale.set(sx,sy,sz);this.temp.rotation.set(rx,ry,rz);this.temp.updateMatrix();row.matrices.push(this.temp.matrix.clone());
  }
  addMatrix(key:string,geo:THREE.BufferGeometry,mat:THREE.Material,matrix:THREE.Matrix4) {
    let row=this.items.get(key);if(!row){row={geo,mat,matrices:[]};this.items.set(key,row);}
    row.matrices.push(matrix.clone());
  }
  segment(key:string,geo:THREE.BufferGeometry,mat:THREE.Material,a:THREE.Vector3,b:THREE.Vector3,radius:number) {
    let row=this.items.get(key);if(!row){row={geo,mat,matrices:[]};this.items.set(key,row);}
    this.temp.position.copy(a).add(b).multiplyScalar(.5);
    const diff=b.clone().sub(a);this.temp.scale.set(radius,diff.length(),radius);this.temp.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),diff.normalize());this.temp.updateMatrix();row.matrices.push(this.temp.matrix.clone());
  }
  build(group:THREE.Group) {
    for(const {geo,mat,matrices} of this.items.values()) {
      const mesh=new THREE.InstancedMesh(geo,mat,matrices.length);
      matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);
    }
    this.items.clear();
  }
}
