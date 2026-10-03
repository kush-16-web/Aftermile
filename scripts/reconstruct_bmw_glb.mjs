if (typeof globalThis.window === 'undefined') {
  globalThis.window = { URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} } };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS: () => ({ src: '', addEventListener: () => {}, removeEventListener: () => {} }),
    createElement: () => ({ getContext: () => null, width: 0, height: 0 }),
  };
}
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(b => { this.result = b; if (this.onload) this.onload({ target: this }); });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then(b => {
        const base64 = Buffer.from(b).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
        if (this.onload) this.onload({ target: this });
      });
    }
  };
}

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

const possibleSourceDirs = [
  'C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\0dacc5d9-913f-41de-98e5-2ce961ce7f3b\\scratch\\bmw_source_clean\\source',
  'C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\5e6f0b0d-41ad-42c3-8ecf-99273fef31b2\\scratch\\bmw_source\\source'
];

let sourceDir = possibleSourceDirs.find(d => fs.existsSync(path.join(d, 'FINAL_MODEL_GT325.fbx')));
if (!sourceDir) {
  console.error('Source directory with FINAL_MODEL_GT325.fbx not found!');
  process.exit(1);
}

const fbxPath = path.join(sourceDir, 'FINAL_MODEL_GT325.fbx');
const outputGlb = 'd:\\Aftermile\\public\\models\\bmw_m4_gt3_evo\\bmw_m4_gt3_evo.glb';

console.log('Using sourceDir:', sourceDir);
console.log('Loading FBX model from:', fbxPath);
const buffer = fs.readFileSync(fbxPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new FBXLoader();
const fbx = loader.parse(arrayBuffer, sourceDir);

// Crucial: compute world matrices for the entire FBX hierarchy
fbx.updateMatrixWorld(true);

console.log('FBX parsed and world matrices updated successfully.');

// Find exact wheel node transforms in FBX
const rot180 = new THREE.Matrix4().makeRotationY(Math.PI);

let wheelFLPos = new THREE.Vector3(0.808, 0.341, 1.570);
let wheelFRPos = new THREE.Vector3(-0.808, 0.341, 1.570);
let wheelRLPos = new THREE.Vector3(0.795, 0.359, -1.337);
let wheelRRPos = new THREE.Vector3(-0.795, 0.359, -1.337);
let steerPivotPos = new THREE.Vector3(0.311, 0.760, 0.051);

fbx.traverse(obj => {
  const name = obj.name.toLowerCase();
  if (name === '3dwheel_front_l' || name.includes('wheel_front_l')) {
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    console.log('Found FBX Wheel FL Node:', obj.name, 'WorldPos:', worldPos);
    wheelFLPos.copy(worldPos);
  } else if (name === '3dwheel_front_r' || name.includes('wheel_front_r')) {
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    console.log('Found FBX Wheel FR Node:', obj.name, 'WorldPos:', worldPos);
    wheelFRPos.copy(worldPos);
  } else if (name === '3dwheel_rear_l' || name.includes('wheel_rear_l')) {
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    console.log('Found FBX Wheel RL Node:', obj.name, 'WorldPos:', worldPos);
    wheelRLPos.copy(worldPos);
  } else if (name === '3dwheel_rear_r' || name.includes('wheel_rear_r')) {
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    console.log('Found FBX Wheel RR Node:', obj.name, 'WorldPos:', worldPos);
    wheelRRPos.copy(worldPos);
  } else if (name.includes('steeringwheel') || name.includes('anc_steering')) {
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    console.log('Found FBX Steering Node:', obj.name, 'WorldPos:', worldPos);
    steerPivotPos.copy(worldPos);
  }
});

// Apply 180 rotation to positions for vehicle space
const flInGame = wheelFLPos.clone().applyMatrix4(rot180);
const frInGame = wheelFRPos.clone().applyMatrix4(rot180);
const rlInGame = wheelRLPos.clone().applyMatrix4(rot180);
const rrInGame = wheelRRPos.clone().applyMatrix4(rot180);
const steerInGame = steerPivotPos.clone().applyMatrix4(rot180);

console.log('In-Game Wheel Mount Positions:');
console.log('FL:', [flInGame.x, flInGame.y, flInGame.z]);
console.log('FR:', [frInGame.x, frInGame.y, frInGame.z]);
console.log('RL:', [rlInGame.x, rlInGame.y, rlInGame.z]);
console.log('RR:', [rrInGame.x, rrInGame.y, rrInGame.z]);
console.log('Steer:', [steerInGame.x, steerInGame.y, steerInGame.z]);

// Helper to load texture as a Three.js Texture
const textureCache = new Map();

function loadPngTexture(filename, isColor = false) {
  if (!filename) return null;
  const directPath = path.join(sourceDir, filename);
  if (!fs.existsSync(directPath)) {
    console.warn(`Texture not found: ${directPath}`);
    return null;
  }
  if (textureCache.has(filename)) {
    return textureCache.get(filename);
  }

  const fileBuf = fs.readFileSync(directPath);
  const mimeType = 'image/png';
  const base64 = fileBuf.toString('base64');
  const dataUri = `data:${mimeType};base64,${base64}`;

  const img = {
    src: dataUri,
    width: 2048,
    height: 2048,
    data: fileBuf,
  };

  const tex = new THREE.Texture(img);
  tex.name = filename;
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  } else {
    tex.colorSpace = THREE.NoColorSpace;
  }

  textureCache.set(filename, tex);
  return tex;
}

const materialDict = new Map();

function createPbrMaterials() {
  const bodyPaint = new THREE.MeshStandardMaterial({
    name: 'BMW_Car_Paint',
    color: new THREE.Color(0.002, 0.003, 0.004),
    roughness: 0.18,
    metalness: 0.12,
  });
  materialDict.set('BMW:MAT_GT3_EVO_car_paint1', bodyPaint);

  const carbonDiff = loadPngTexture('common_carbon05_black_diff.png', true);
  const carbonNorm = loadPngTexture('common_carbon05_norm.png', false);
  const carbonMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Carbon_Fiber',
    color: new THREE.Color(0.85, 0.85, 0.85),
    map: carbonDiff,
    normalMap: carbonNorm,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.32,
    metalness: 0.15,
  });
  materialDict.set('carbon_1:BMW_M4_GT3_EVO_Carbon1', carbonMat);

  const extDiff = loadPngTexture('TEX_Details_EXT_D.png', true);
  const extNorm = loadPngTexture('TEX_Details_EXT_N.png', false);
  const extArm = loadPngTexture('TEX_Details_EXT_ARM.png', false);
  const extMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Details_EXT',
    color: new THREE.Color(1, 1, 1),
    map: extDiff,
    normalMap: extNorm,
    roughnessMap: extArm,
    metalnessMap: extArm,
    aoMap: extArm,
    roughness: 0.5,
    metalness: 0.2,
  });
  materialDict.set('BMW:MAT_Details_EXT1', extMat);

  const intDiff = loadPngTexture('TEX_Details_INT_D.png', true);
  const intNorm = loadPngTexture('TEX_Details_INT_N.png', false);
  const intArm = loadPngTexture('TEX_Details_INT_ARM.png', false);
  const intMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Details_INT',
    color: new THREE.Color(1, 1, 1),
    map: intDiff,
    normalMap: intNorm,
    roughnessMap: intArm,
    metalnessMap: intArm,
    aoMap: intArm,
    roughness: 0.65,
    metalness: 0.15,
  });
  materialDict.set('BMW:MAT_Details_INT1', intMat);

  const matDiff = loadPngTexture('TEX_Details_MAT_D.png', true);
  const matArm = loadPngTexture('TEX_Details_MAT_ARM.png', false);
  const matMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Details_MAT',
    color: new THREE.Color(1, 1, 1),
    map: matDiff,
    roughnessMap: matArm,
    metalnessMap: matArm,
    roughness: 0.55,
    metalness: 0.2,
  });
  materialDict.set('BMW:MAT_Details_MAT1', matMat);

  const chassisDiff = loadPngTexture('TEX_Details_Chassis_0001_D.png', true);
  const chassisNorm = loadPngTexture('TEX_Details_Chassis_0001_N.png', false);
  const chassisArm = loadPngTexture('TEX_Details_Chassis_0001_ARM.png', false);
  const chassisMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Details_Chassis',
    color: new THREE.Color(1, 1, 1),
    map: chassisDiff,
    normalMap: chassisNorm,
    roughnessMap: chassisArm,
    metalnessMap: chassisArm,
    roughness: 0.6,
    metalness: 0.3,
  });
  materialDict.set('BMW:MAT_Details_Chassis1', chassisMat);

  const engDiff = loadPngTexture('TEX_Details_Engine_D.png', true);
  const engNorm = loadPngTexture('TEX_Details_Engine_N.png', false);
  const engArm = loadPngTexture('TEX_Details_Engine_ARM.png', false);
  const engMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Details_Engine',
    color: new THREE.Color(1, 1, 1),
    map: engDiff,
    normalMap: engNorm,
    roughnessMap: engArm,
    metalnessMap: engArm,
    roughness: 0.5,
    metalness: 0.4,
  });
  materialDict.set('BMW:MAT_Details_Engine1', engMat);

  const gridDiff = loadPngTexture('TEX_Details_Grid_01_D.png', true);
  const gridNorm = loadPngTexture('TEX_Details_Grid_01_N.png', false);
  const gridArm = loadPngTexture('TEX_Details_Grid_01_ARM.png', false);
  const gridMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Details_Grid',
    color: new THREE.Color(1, 1, 1),
    map: gridDiff,
    normalMap: gridNorm,
    roughnessMap: gridArm,
    metalnessMap: gridArm,
    roughness: 0.4,
    metalness: 0.5,
  });
  materialDict.set('BMW:MAT_Details_Grid_01_002', gridMat);

  const add1Diff = loadPngTexture('TEX_Details_Add_01_D.png', true);
  const add1Norm = loadPngTexture('TEX_Details_Add_01_N.png', false);
  const add1Arm = loadPngTexture('TEX_Details_Add_01_ARM.png', false);
  const add1Mat = new THREE.MeshStandardMaterial({
    name: 'BMW_Details_Add_01',
    color: new THREE.Color(1, 1, 1),
    map: add1Diff,
    normalMap: add1Norm,
    roughnessMap: add1Arm,
    metalnessMap: add1Arm,
    roughness: 0.5,
    metalness: 0.2,
  });
  materialDict.set('BMW:MAT_Details_Add_02', add1Mat);

  const add3Diff = loadPngTexture('TEX_Details_Add_03_D.png', true);
  const add3Norm = loadPngTexture('TEX_Details_Add_03_N.png', false);
  const add3Arm = loadPngTexture('TEX_Details_Add_03_ARM.png', false);
  const add3Mat = new THREE.MeshStandardMaterial({
    name: 'BMW_Details_Add_03',
    color: new THREE.Color(1, 1, 1),
    map: add3Diff,
    normalMap: add3Norm,
    roughnessMap: add3Arm,
    metalnessMap: add3Arm,
    roughness: 0.5,
    metalness: 0.2,
  });
  materialDict.set('BMW:MAT_Details_Add_04', add3Mat);

  const add4Diff = loadPngTexture('TEX_Details_Add_04_D.png', true);
  const add4Arm = loadPngTexture('TEX_Details_Add_04_ARM.png', false);
  const add4Mat = new THREE.MeshStandardMaterial({
    name: 'BMW_Details_Add_04',
    color: new THREE.Color(1, 1, 1),
    map: add4Diff,
    roughnessMap: add4Arm,
    metalnessMap: add4Arm,
    roughness: 0.5,
    metalness: 0.2,
  });
  materialDict.set('BMW:MAT_Details_Add_06', add4Mat);

  const lightDiff = loadPngTexture('TEX_Light_D.png', true);
  const lightNorm = loadPngTexture('TEX_Light_N.png', false);
  const lightArm = loadPngTexture('TEX_Light_ARM.png', false);
  const lightMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Lights',
    color: new THREE.Color(1, 1, 1),
    map: lightDiff,
    normalMap: lightNorm,
    roughnessMap: lightArm,
    metalnessMap: lightArm,
    roughness: 0.2,
    metalness: 0.5,
  });
  materialDict.set('BMW:MAT_Lights1', lightMat);

  const alphaDiff = loadPngTexture('TEX_Alpha_01_D.png', true);
  const alphaMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Alpha_Decal',
    color: new THREE.Color(1, 1, 1),
    map: alphaDiff,
    transparent: true,
    alphaTest: 0.15,
    roughness: 0.4,
    metalness: 0.1,
  });
  materialDict.set('BMW:MAT_Alpha_01_002', alphaMat);

  const glassTex = loadPngTexture('Glass.png', true);
  const windGlass = new THREE.MeshStandardMaterial({
    name: 'BMW_Windshield_Glass',
    color: new THREE.Color(0.04, 0.08, 0.12),
    map: glassTex,
    transparent: true,
    opacity: 0.38,
    roughness: 0.05,
    metalness: 0.9,
    depthWrite: false,
  });
  materialDict.set('glass:MAT_Glass1', windGlass);
  materialDict.set('BMW:MAT_Glass_004', windGlass);

  const aeroGlass = new THREE.MeshStandardMaterial({
    name: 'BMW_Aero_Glass_Dark',
    color: new THREE.Color(0.01, 0.02, 0.03),
    transparent: true,
    opacity: 0.45,
    roughness: 0.08,
    metalness: 0.85,
    depthWrite: false,
  });
  materialDict.set('BMW:MAT_Glass_002', aeroGlass);

  const wheelDiff = loadPngTexture('BMW_M4GT3_2022_Wheel1A_DiffuseAOSO.png', true) || loadPngTexture('Wheel1A_DiffuseAOSO.png', true);
  const wheelNorm = loadPngTexture('BMW_M4GT3_2022_Wheel1A_Normal.png', false);
  const wheelArm = loadPngTexture('BMW_M4GT3_2022_Wheel1A_Material.png', false);
  const wheelMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Wheel_Tire',
    color: new THREE.Color(1, 1, 1),
    map: wheelDiff,
    normalMap: wheelNorm,
    roughnessMap: wheelArm,
    metalnessMap: wheelArm,
    roughness: 0.65,
    metalness: 0.25,
  });
  materialDict.set('Tire:BMW_M4GT3_2022_Wheel1A_3D_3DWheel1A_Material1', wheelMat);
  materialDict.set('__DEFAULT', wheelMat);

  const brakeDiff = loadPngTexture('TEX_Tire_Brake_D.png', true);
  const brakeNorm = loadPngTexture('TEX_Tire_Brake_N.png', false);
  const brakeArm = loadPngTexture('TEX_Tire_Brake_ARM.png', false);
  const brakeMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Brake_Caliper',
    color: new THREE.Color(1, 1, 1),
    map: brakeDiff,
    normalMap: brakeNorm,
    roughnessMap: brakeArm,
    metalnessMap: brakeArm,
    roughness: 0.35,
    metalness: 0.6,
  });
  materialDict.set('BMW:MAT_Tire_Brake1', brakeMat);

  const diskDiff = loadPngTexture('TEX_Tire_Disk_D.png', true);
  const diskNorm = loadPngTexture('TEX_Tire_Disk_N.png', false);
  const diskArm = loadPngTexture('TEX_Tire_Disk_ARM.png', false);
  const diskMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Brake_Disk',
    color: new THREE.Color(1, 1, 1),
    map: diskDiff,
    normalMap: diskNorm,
    roughnessMap: diskArm,
    metalnessMap: diskArm,
    roughness: 0.45,
    metalness: 0.7,
  });
  materialDict.set('BMW:MAT_Tire_Disk1', diskMat);

  const hubDiff = loadPngTexture('TEX_Tire_Hub_D.png', true);
  const hubNorm = loadPngTexture('TEX_Tire_Hub_N.png', false);
  const hubArm = loadPngTexture('TEX_Tire_Hub_ARM.png', false);
  const hubMat = new THREE.MeshStandardMaterial({
    name: 'BMW_Wheel_Hub',
    color: new THREE.Color(1, 1, 1),
    map: hubDiff,
    normalMap: hubNorm,
    roughnessMap: hubArm,
    metalnessMap: hubArm,
    roughness: 0.4,
    metalness: 0.6,
  });
  materialDict.set('BMW:MAT_Tire_Hub1', hubMat);
}

createPbrMaterials();

const rootScene = new THREE.Group();
rootScene.name = 'BMW_M4_GT3_EVO';

const bodyGroup = new THREE.Group();
bodyGroup.name = 'Body';
rootScene.add(bodyGroup);

// Wheel Mounts in Aftermile standard
const wheelDefs = [
  { index: 0, name: 'FL', pos: [flInGame.x, flInGame.y, flInGame.z] },
  { index: 1, name: 'FR', pos: [frInGame.x, frInGame.y, frInGame.z] },
  { index: 2, name: 'RL', pos: [rlInGame.x, rlInGame.y, rlInGame.z] },
  { index: 3, name: 'RR', pos: [rrInGame.x, rrInGame.y, rrInGame.z] },
];

const wheelMounts = [];
const wheelObjects = [];
const caliperObjects = [];

for (const def of wheelDefs) {
  const mount = new THREE.Group();
  mount.name = `WheelMount${def.index}`;
  mount.position.set(def.pos[0], def.pos[1], def.pos[2]);

  const wheel = new THREE.Group();
  wheel.name = `Wheel${def.index}`;
  mount.add(wheel);

  const caliper = new THREE.Group();
  caliper.name = `Caliper${def.index}`;
  mount.add(caliper);

  rootScene.add(mount);
  wheelMounts.push(mount);
  wheelObjects.push(wheel);
  caliperObjects.push(caliper);
}

// Steering wheel assembly
const steeringWheelGroup = new THREE.Group();
steeringWheelGroup.name = 'SteeringWheel';
steeringWheelGroup.position.set(steerInGame.x, steerInGame.y, steerInGame.z);
bodyGroup.add(steeringWheelGroup);

function getWheelIndex(node) {
  let curr = node;
  while (curr) {
    const name = curr.name.toLowerCase();
    if (name.includes('brake_fl') || name.includes('brake_fr') || name.includes('brake_rl') || name.includes('brake_rr') || name.includes('calliper')) {
      return -1;
    }
    if (name.includes('wheel_front_l') || name.includes('hub_l_0000_001') && !name.includes('bmwsm_hub_l')) return 0;
    if (name.includes('wheel_front_r') || name.includes('hub_r_0000_001') && !name.includes('bmwsm_hub_r')) return 1;
    if (name.includes('wheel_rear_l') || name.includes('bmwsm_hub_l')) return 2;
    if (name.includes('wheel_rear_r') || name.includes('bmwsm_hub_r')) return 3;
    curr = curr.parent;
  }
  return -1;
}

function getCaliperIndex(node) {
  const name = node.name.toLowerCase();
  if (name.includes('brake_fl') || name.includes('calliper') && name.includes('fl')) return 0;
  if (name.includes('brake_fr') || name.includes('calliper') && name.includes('fr')) return 1;
  if (name.includes('brake_rl') || name.includes('calliper') && name.includes('rl')) return 2;
  if (name.includes('brake_rr') || name.includes('calliper') && name.includes('rr')) return 3;
  return -1;
}

function isSteeringWheelNode(node) {
  let curr = node;
  while (curr) {
    if (curr.name.toLowerCase().includes('steeringwheel') || curr.name.toLowerCase().includes('anc_steering')) return true;
    curr = curr.parent;
  }
  return false;
}

// Process meshes with EXACT WORLD MATRIX TRANSFORMS
const meshesToProcess = [];
fbx.traverse(obj => {
  if (obj.isMesh) meshesToProcess.push(obj);
});

console.log(`Processing ${meshesToProcess.length} meshes with precise hierarchy preservation...`);

for (const mesh of meshesToProcess) {
  const geom = mesh.geometry.clone();
  
  // Full world matrix in rotated vehicle space
  const worldMatrix = new THREE.Matrix4().multiplyMatrices(rot180, mesh.matrixWorld);

  // Find appropriate source material
  const origMatName = mesh.material ? (Array.isArray(mesh.material) ? mesh.material[0]?.name : mesh.material.name) : '';
  let targetMat = materialDict.get(origMatName);

  if (!targetMat) {
    const lower = origMatName.toLowerCase();
    if (lower.includes('paint') || lower.includes('body')) targetMat = materialDict.get('BMW:MAT_GT3_EVO_car_paint1');
    else if (lower.includes('carbon')) targetMat = materialDict.get('carbon_1:BMW_M4_GT3_EVO_Carbon1');
    else if (lower.includes('glass')) targetMat = materialDict.get('glass:MAT_Glass1');
    else if (lower.includes('wheel') || lower.includes('tire')) targetMat = materialDict.get('Tire:BMW_M4GT3_2022_Wheel1A_3D_3DWheel1A_Material1');
    else if (lower.includes('int')) targetMat = materialDict.get('BMW:MAT_Details_INT1');
    else if (lower.includes('ext')) targetMat = materialDict.get('BMW:MAT_Details_EXT1');
    else targetMat = materialDict.get('BMW:MAT_Details_EXT1');
  }

  const newMesh = new THREE.Mesh(geom, targetMat);
  newMesh.name = mesh.name;
  newMesh.castShadow = true;
  newMesh.receiveShadow = true;

  // Categorize mesh into rig hierarchy
  const wheelIdx = getWheelIndex(mesh);
  const caliperIdx = getCaliperIndex(mesh);
  const isSteer = isSteeringWheelNode(mesh);

  if (wheelIdx >= 0) {
    const wMount = wheelMounts[wheelIdx];
    const toMount = new THREE.Matrix4().makeTranslation(-wMount.position.x, -wMount.position.y, -wMount.position.z);
    const m = new THREE.Matrix4().multiplyMatrices(toMount, worldMatrix);
    newMesh.geometry.applyMatrix4(m);
    newMesh.geometry.computeVertexNormals();
    wheelObjects[wheelIdx].add(newMesh);
  } else if (caliperIdx >= 0) {
    const cMount = wheelMounts[caliperIdx];
    const toMount = new THREE.Matrix4().makeTranslation(-cMount.position.x, -cMount.position.y, -cMount.position.z);
    const m = new THREE.Matrix4().multiplyMatrices(toMount, worldMatrix);
    newMesh.geometry.applyMatrix4(m);
    newMesh.geometry.computeVertexNormals();
    caliperObjects[caliperIdx].add(newMesh);
  } else if (isSteer) {
    const toPivot = new THREE.Matrix4().makeTranslation(-steerInGame.x, -steerInGame.y, -steerInGame.z);
    const m = new THREE.Matrix4().multiplyMatrices(toPivot, worldMatrix);
    newMesh.geometry.applyMatrix4(m);
    newMesh.geometry.computeVertexNormals();
    steeringWheelGroup.add(newMesh);
  } else {
    newMesh.geometry.applyMatrix4(worldMatrix);
    newMesh.geometry.computeVertexNormals();
    bodyGroup.add(newMesh);
  }
}

console.log('Exporting reconstructed GLB with hierarchy baked properly...');

const exporter = new GLTFExporter();
exporter.parse(
  rootScene,
  (gltf) => {
    const outBuf = Buffer.from(gltf);
    fs.writeFileSync(outputGlb, outBuf);
    console.log(`Successfully generated source-restored GLB at ${outputGlb} (${(outBuf.length / 1024 / 1024).toFixed(2)} MB)`);
  },
  (err) => {
    console.error('Error during GLTF export:', err);
  },
  {
    binary: true,
    embedImages: true,
  }
);
