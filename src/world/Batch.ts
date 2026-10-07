import * as THREE from 'three';

export class Batch {
  items = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; data: number[]; count: number }>();
  private temp = new THREE.Object3D();
  private diff = new THREE.Vector3();
  private unitY = new THREE.Vector3(0, 1, 0);

  private getRow(key: string, geo: THREE.BufferGeometry, mat: THREE.Material) {
    let row = this.items.get(key);
    if (!row) {
      row = { geo, mat, data: [], count: 0 };
      this.items.set(key, row);
    }
    return row;
  }

  add(key: string, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
    const row = this.getRow(key, geo, mat);
    this.temp.position.set(x, y, z);
    this.temp.scale.set(sx, sy, sz);
    this.temp.rotation.set(rx, ry, rz);
    this.temp.updateMatrix();
    const e = this.temp.matrix.elements;
    for (let i = 0; i < 16; i++) row.data.push(e[i]);
    row.count++;
  }

  addMatrix(key: string, geo: THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4) {
    const row = this.getRow(key, geo, mat);
    const e = matrix.elements;
    for (let i = 0; i < 16; i++) row.data.push(e[i]);
    row.count++;
  }

  segment(key: string, geo: THREE.BufferGeometry, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const row = this.getRow(key, geo, mat);
    this.temp.position.copy(a).add(b).multiplyScalar(0.5);
    this.diff.copy(b).sub(a);
    const len = this.diff.length();
    this.temp.scale.set(radius, len, radius);
    this.temp.quaternion.setFromUnitVectors(this.unitY, this.diff.normalize());
    this.temp.updateMatrix();
    const e = this.temp.matrix.elements;
    for (let i = 0; i < 16; i++) row.data.push(e[i]);
    row.count++;
  }

  build(group: THREE.Group) {
    for (const [key, { geo, mat, data, count }] of this.items) {
      if (count === 0) continue;
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      (mesh.instanceMatrix.array as Float32Array).set(data);
      mesh.instanceMatrix.needsUpdate = true;
      const isFoliageOrCover = key.includes('grass') || key.includes('cover') || key.includes('undergrowth');
      mesh.castShadow = !isFoliageOrCover;
      mesh.receiveShadow = true;
      mesh.userData.detailTier =
        key.includes('grass-near') || key.includes('undergrowth') || key.includes('ground-cover')
          ? 'near'
          : key.includes('grass-field') || key.includes('mid')
          ? 'mid'
          : key.includes('vegetation') || key.includes('tree')
          ? 'trees'
          : 'world';
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    this.items.clear();
  }
}

