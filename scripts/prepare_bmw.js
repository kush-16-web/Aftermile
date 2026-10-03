if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    URL: {
      createObjectURL: (blob) => 'blob:mock',
      revokeObjectURL: () => {},
    },
  };
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS: (ns, name) => {
      if (name === 'img') {
        return {
          src: '',
          addEventListener: () => {},
          removeEventListener: () => {},
        };
      }
      return {};
    },
    createElement: (name) => {
      if (name === 'canvas') {
        return {
          getContext: () => null,
          width: 0,
          height: 0,
        };
      }
      return {};
    },
  };
}

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(buffer => {
        this.result = buffer;
        if (this.onload) this.onload({ target: this });
        if (this.onloadend) this.onloadend({ target: this });
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then(buffer => {
        const base64 = Buffer.from(buffer).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
        if (this.onload) this.onload({ target: this });
        if (this.onloadend) this.onloadend({ target: this });
      });
    }
  };
}

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

const basePath = "C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\0dacc5d9-913f-41de-98e5-2ce961ce7f3b\\scratch\\bmw_extract\\model";
const fbxPath = path.join(basePath, "FINAL_MODEL_GT325.fbx");
const outputDir = "c:\\Users\\harsh\\OneDrive\\Desktop\\Aftermile\\public\\models\\bmw_m4_gt3_evo";

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('Loading FBX model from:', fbxPath);
const buffer = fs.readFileSync(fbxPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new FBXLoader();
const fbx = loader.parse(arrayBuffer, '');

console.log('FBX parsed successfully. Structuring rig hierarchy with 180° rotation for Aftermile standard (-Z forward)...');

// Rotate entire FBX 180 degrees around Y axis so Forward is -Z, Left is -X, Right is +X
const rot180 = new THREE.Matrix4().makeRotationY(Math.PI);

// Create target root structure
const rootScene = new THREE.Group();
rootScene.name = 'BMW_M4_GT3_EVO';

const bodyGroup = new THREE.Group();
bodyGroup.name = 'Body';
rootScene.add(bodyGroup);

// Wheel mount positions in Aftermile coordinate system:
// -Z is forward, +Z is rear, -X is left, +X is right
// Index 0: Front Left  [-0.808, 0.341, -1.570]
// Index 1: Front Right [+0.808, 0.341, -1.570]
// Index 2: Rear Left   [-0.795, 0.359,  1.337]
// Index 3: Rear Right  [+0.795, 0.359,  1.337]
const wheelDefs = [
  { index: 0, name: 'FL', pos: [-0.808, 0.341, -1.570] },
  { index: 1, name: 'FR', pos: [ 0.808, 0.341, -1.570] },
  { index: 2, name: 'RL', pos: [-0.795, 0.359,  1.337] },
  { index: 3, name: 'RR', pos: [ 0.795, 0.359,  1.337] },
];

const wheelMounts = [];
const wheelObjects = [];

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
}

// Steering wheel assembly group (LHD German GT3 race car: driver on left, X = -0.355, Y = 0.815, Z = -0.051)
const steeringWheelGroup = new THREE.Group();
steeringWheelGroup.name = 'SteeringWheel';
const steerPivot = [-0.311, 0.760, -0.051];
steeringWheelGroup.position.set(steerPivot[0], steerPivot[1], steerPivot[2]);
bodyGroup.add(steeringWheelGroup);

// Helper to check if a node belongs to a wheel
// Note: In raw FBX, Front_L was at +X,+Z. When rotated 180° around Y:
// Front_L -> FL (Index 0)
// Front_R -> FR (Index 1)
// Rear_L  -> RL (Index 2)
// Rear_R  -> RR (Index 3)
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

// Helper to check if a node is a caliper
function getCaliperIndex(node) {
  const name = node.name.toLowerCase();
  if (name.includes('brake_fl') || name.includes('calliper') && name.includes('fl')) return 0;
  if (name.includes('brake_fr') || name.includes('calliper') && name.includes('fr')) return 1;
  if (name.includes('brake_rl') || name.includes('calliper') && name.includes('rl')) return 2;
  if (name.includes('brake_rr') || name.includes('calliper') && name.includes('rr')) return 3;
  return -1;
}

// Helper to check if node is part of steering wheel
function isSteeringWheelNode(node) {
  let curr = node;
  while (curr) {
    if (curr.name.toLowerCase().includes('steeringwheel') || curr.name.toLowerCase().includes('anc_steering')) return true;
    curr = curr.parent;
  }
  return false;
}

// Detach and categorize all meshes from FBX
const meshesToProcess = [];
fbx.traverse(obj => {
  if (obj.isMesh) {
    meshesToProcess.push(obj);
  }
});

console.log(`Processing ${meshesToProcess.length} meshes...`);

// Create curated PBR materials for BMW M4 GT3 EVO
const pbrMaterials = new Map();

function getPbrMaterial(matName, meshName = '') {
  const key = `${matName}_${meshName}`;
  if (pbrMaterials.has(key)) return pbrMaterials.get(key);

  const lower = (matName || '').toLowerCase();
  const lowerMesh = (meshName || '').toLowerCase();

  const mat = new THREE.MeshStandardMaterial({
    name: matName || 'BMW_PBR_Material',
    roughness: 0.45,
    metalness: 0.1,
  });

  // M Motorsport buttons on steering wheel
  if (lowerMesh.includes('steeringwheel')) {
    if (lowerMesh.endsWith('_00') || lowerMesh.endsWith('_18') || lowerMesh.endsWith('_33')) {
      mat.name = 'BMWM_Button_Red';
      mat.color = new THREE.Color(0xd61f26); // M Red Pit Limiter / Flash
      mat.roughness = 0.30;
      mat.metalness = 0.20;
    } else if (lowerMesh.endsWith('_08') || lowerMesh.endsWith('_10') || lowerMesh.endsWith('_34')) {
      mat.name = 'BMWM_Button_Blue';
      mat.color = new THREE.Color(0x0055b8); // M Blue Radio / TC
      mat.roughness = 0.30;
      mat.metalness = 0.20;
    } else if (lowerMesh.endsWith('_24') || lowerMesh.endsWith('_25') || lowerMesh.endsWith('_39')) {
      mat.name = 'BMWM_Rotary_Yellow';
      mat.color = new THREE.Color(0xf5b800); // Rotary Map Selector
      mat.roughness = 0.30;
      mat.metalness = 0.20;
    } else if (lowerMesh.endsWith('_07') || lowerMesh.endsWith('_11') || lowerMesh.endsWith('_20')) {
      mat.name = 'BMWSteer_Grips';
      mat.color = new THREE.Color(0x111315); // Alcantara hand grips
      mat.roughness = 0.90;
      mat.metalness = 0.05;
    } else {
      mat.name = 'BMWSteer_Frame';
      mat.color = new THREE.Color(0x181a1d); // Carbon / satin black steering wheel body
      mat.roughness = 0.45;
      mat.metalness = 0.35;
    }
  } else if (lower.includes('car_paint') || lower.includes('body')) {
    mat.name = 'BMWPaint_M4GT3';
    mat.color = new THREE.Color(0xedf2f7); // Alpine White with M Motorsport high-gloss clearcoat
    mat.roughness = 0.18;
    mat.metalness = 0.12;
  } else if (lower.includes('carbon')) {
    mat.name = 'BMWCarbon_Aero';
    mat.color = new THREE.Color(0x141618); // Authentic dark weave carbon
    mat.roughness = 0.32;
    mat.metalness = 0.15;
  } else if (lower.includes('glass')) {
    mat.name = 'BMWGlass_Screen';
    mat.color = new THREE.Color(0x060c14); // Tinted racing polycarbonate
    mat.roughness = 0.04;
    mat.metalness = 0.92;
    mat.transparent = true;
    mat.opacity = 0.32;
    mat.depthWrite = false;
  } else if (lower.includes('light') || lower.includes('lamp')) {
    mat.name = 'BMWLights_Main';
    mat.color = new THREE.Color(0xffffff);
    mat.roughness = 0.10;
    mat.metalness = 0.40;
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 0;
  } else if (lower.includes('tire_hub') || lower.includes('wheel1a')) {
    mat.name = 'BMWRacingWheel_Rim';
    mat.color = new THREE.Color(0x141619); // Satin matte black GT3 BBS centerlock rims & slicks
    mat.roughness = 0.45;
    mat.metalness = 0.70;
  } else if (lower.includes('tire_disk') || lower.includes('disk')) {
    mat.name = 'BMWBrake_Rotor';
    mat.color = new THREE.Color(0x5a6066); // Slotted racing steel disc
    mat.roughness = 0.25;
    mat.metalness = 0.95;
  } else if (lower.includes('tire_brake') || lower.includes('calliper') || lower.includes('caliper')) {
    mat.name = 'BMWBrake_Caliper';
    mat.color = new THREE.Color(0x0044aa); // BMW Motorsport M Blue Calipers
    mat.roughness = 0.28;
    mat.metalness = 0.85;
  } else if (lower.includes('details_int') || lower.includes('interior')) {
    mat.name = 'BMWInterior_GT3';
    mat.color = new THREE.Color(0x131518); // Dark Alcantara & racing bucket seat
    mat.roughness = 0.85;
    mat.metalness = 0.08;
  } else if (lower.includes('details_mat')) {
    mat.name = 'BMWDetails_MAT';
    mat.color = new THREE.Color(0x1a1d20); // Matte dark cockpit frame & roll cage
    mat.roughness = 0.65;
    mat.metalness = 0.25;
  } else if (lower.includes('details_add')) {
    mat.name = 'BMWDetails_Add';
    mat.color = new THREE.Color(0x181a1d);
    mat.roughness = 0.50;
    mat.metalness = 0.35;
  } else if (lower.includes('details_ext') || lower.includes('ext')) {
    mat.name = 'BMWDetails_EXT';
    mat.color = new THREE.Color(0x16181b); // Dark aero diffusers, mirrors, vents
    mat.roughness = 0.40;
    mat.metalness = 0.25;
  } else if (lower.includes('engine')) {
    mat.name = 'BMWEngine_P58';
    mat.color = new THREE.Color(0x2e333a);
    mat.roughness = 0.35;
    mat.metalness = 0.80;
  } else if (lower.includes('grid') || lower.includes('alpha')) {
    mat.name = 'BMWGrid_Mesh';
    mat.color = new THREE.Color(0x111315);
    mat.roughness = 0.70;
    mat.metalness = 0.60;
  } else if (lower.includes('chassis')) {
    mat.name = 'BMWChassis_Frame';
    mat.color = new THREE.Color(0x202428);
    mat.roughness = 0.60;
    mat.metalness = 0.45;
  }

  pbrMaterials.set(key, mat);
  return mat;
}


// Reparent meshes into their respective rig nodes
let wheelMeshCount = 0;
let caliperMeshCount = 0;
let steerMeshCount = 0;
let bodyMeshCount = 0;

for (const mesh of meshesToProcess) {
  // Apply world transform and 180° Y rotation to geometry so it is oriented correctly
  mesh.updateWorldMatrix(true, false);
  const matrix = new THREE.Matrix4().multiplyMatrices(rot180, mesh.matrixWorld);

  const geom = mesh.geometry.clone();
  geom.applyMatrix4(matrix);

  const originalMatName = Array.isArray(mesh.material) ? mesh.material[0]?.name : mesh.material?.name;
  const newMat = getPbrMaterial(originalMatName || mesh.name, mesh.name);

  const newMesh = new THREE.Mesh(geom, newMat);
  newMesh.name = mesh.name;
  newMesh.castShadow = true;
  newMesh.receiveShadow = true;

  const wIdx = getWheelIndex(mesh);
  const cIdx = getCaliperIndex(mesh);
  const isSteer = isSteeringWheelNode(mesh);

  if (wIdx >= 0) {
    // Transform geometry relative to wheel center pivot
    const wPos = wheelDefs[wIdx].pos;
    geom.translate(-wPos[0], -wPos[1], -wPos[2]);
    wheelObjects[wIdx].add(newMesh);
    wheelMeshCount++;
  } else if (cIdx >= 0) {
    // Transform geometry relative to wheel mount pivot
    const wPos = wheelDefs[cIdx].pos;
    geom.translate(-wPos[0], -wPos[1], -wPos[2]);
    wheelMounts[cIdx].getObjectByName(`Caliper${cIdx}`).add(newMesh);
    caliperMeshCount++;
  } else if (isSteer) {
    // Transform geometry relative to steering wheel pivot
    geom.translate(-steerPivot[0], -steerPivot[1], -steerPivot[2]);
    steeringWheelGroup.add(newMesh);
    steerMeshCount++;
  } else {
    bodyGroup.add(newMesh);
    bodyMeshCount++;
  }
}

console.log('Rigging Summary (Oriented -Z forward):');
console.log(`- Body Meshes: ${bodyMeshCount}`);
console.log(`- Wheel Meshes: ${wheelMeshCount}`);
console.log(`- Caliper Meshes: ${caliperMeshCount}`);
console.log(`- Steering Wheel Meshes: ${steerMeshCount}`);

// Export to GLB
const exporter = new GLTFExporter();
const glbFilePath = path.join(outputDir, "bmw_m4_gt3_evo.glb");

console.log('Exporting GLB to:', glbFilePath);

try {
  const gltf = await exporter.parseAsync(rootScene, { binary: true });
  const glbBuffer = Buffer.from(gltf);
  fs.writeFileSync(glbFilePath, glbBuffer);
  console.log(`GLB written successfully (${(glbBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);

  const prep = {
    modelId: 'bmw_m4_gt3_evo',
    name: 'BMW M4 GT3 EVO (G82)',
    competitionYear: 2025,
    runtimeBytes: glbBuffer.length,
    bodyMeshes: bodyMeshCount,
    wheelMeshes: wheelMeshCount,
    caliperMeshes: caliperMeshCount,
    steerMeshes: steerMeshCount,
    wheelPositions: wheelDefs.map(w => w.pos),
    wheelRadii: [0.345, 0.345, 0.345, 0.345],
    steeringWheelPivot: steerPivot,
    driverEyePosition: [-0.355, 0.985, -0.12],
    hoodCameraPosition: [0, 0.98, -1.45],
    materialsCount: pbrMaterials.size,
  };

  fs.writeFileSync(path.join(outputDir, "preparation.json"), JSON.stringify(prep, null, 2));
  console.log('Preparation metadata saved.');
} catch (err) {
  console.error('Error in parseAsync:', err);
}
