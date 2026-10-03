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

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import fs from 'fs';
import path from 'path';

const fbxPath = "C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\0dacc5d9-913f-41de-98e5-2ce961ce7f3b\\scratch\\bmw_extract\\model\\FINAL_MODEL_GT325.fbx";

const buffer = fs.readFileSync(fbxPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new FBXLoader();
const fbx = loader.parse(arrayBuffer, '');

let meshCount = 0;
let totalTriangles = 0;
let totalVertices = 0;
const materialNames = new Set();
const allMeshes = [];
const namedGroups = {
  wheels: [],
  brakes: [],
  steeringWheel: [],
  interior: [],
  engine: [],
  lights: [],
  glass: [],
  body: [],
  doors: [],
  carbon: [],
};

function traverseNode(node, depth = 0, path = '') {
  const currentPath = path ? `${path}/${node.name}` : node.name;
  
  if (node.isMesh) {
    meshCount++;
    const geom = node.geometry;
    let tris = 0;
    let verts = 0;
    if (geom.index) {
      tris = geom.index.count / 3;
    } else if (geom.attributes.position) {
      tris = geom.attributes.position.count / 3;
    }
    verts = geom.attributes.position ? geom.attributes.position.count : 0;
    totalTriangles += tris;
    totalVertices += verts;

    const meshInfo = {
      name: node.name,
      path: currentPath,
      triangles: tris,
      vertices: verts,
      position: [node.position.x, node.position.y, node.position.z],
      rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
      scale: [node.scale.x, node.scale.y, node.scale.z],
      materials: Array.isArray(node.material) ? node.material.map(m => m.name) : (node.material ? [node.material.name] : []),
    };

    if (Array.isArray(node.material)) {
      node.material.forEach(m => materialNames.add(m.name || 'unnamed'));
    } else if (node.material) {
      materialNames.add(node.material.name || 'unnamed');
    }

    allMeshes.push(meshInfo);

    const lowerName = node.name.toLowerCase();
    if (lowerName.includes('wheel') || lowerName.includes('tire') || lowerName.includes('rim')) {
      namedGroups.wheels.push(meshInfo);
    }
    if (lowerName.includes('brake') || lowerName.includes('calliper') || lowerName.includes('disk') || lowerName.includes('caliper')) {
      namedGroups.brakes.push(meshInfo);
    }
    if (lowerName.includes('steer') || lowerName.includes('anc_steering')) {
      namedGroups.steeringWheel.push(meshInfo);
    }
    if (lowerName.includes('interior') || lowerName.includes('seat') || lowerName.includes('dash') || lowerName.includes('console') || lowerName.includes('_int_')) {
      namedGroups.interior.push(meshInfo);
    }
    if (lowerName.includes('engine')) {
      namedGroups.engine.push(meshInfo);
    }
    if (lowerName.includes('light') || lowerName.includes('lamp') || lowerName.includes('headlight') || lowerName.includes('taillight')) {
      namedGroups.lights.push(meshInfo);
    }
    if (lowerName.includes('glass') || lowerName.includes('windshield') || lowerName.includes('window')) {
      namedGroups.glass.push(meshInfo);
    }
    if (lowerName.includes('door')) {
      namedGroups.doors.push(meshInfo);
    }
    if (lowerName.includes('carbon')) {
      namedGroups.carbon.push(meshInfo);
    }
  }

  if (node.children) {
    for (const child of node.children) {
      traverseNode(child, depth + 1, currentPath);
    }
  }
}

traverseNode(fbx);

const box = new THREE.Box3().setFromObject(fbx);
const size = new THREE.Vector3();
box.getSize(size);
const center = new THREE.Vector3();
box.getCenter(center);

const report = {
  summary: {
    totalMeshes: meshCount,
    totalTriangles: Math.round(totalTriangles),
    totalVertices: totalVertices,
    uniqueMaterialsCount: materialNames.size,
    uniqueMaterials: Array.from(materialNames),
    boundingBox: {
      size: { x: size.x, y: size.y, z: size.z },
      center: { x: center.x, y: center.y, z: center.z },
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    },
  },
  namedGroupsSummary: {
    wheelsCount: namedGroups.wheels.length,
    brakesCount: namedGroups.brakes.length,
    steeringWheelCount: namedGroups.steeringWheel.length,
    interiorCount: namedGroups.interior.length,
    engineCount: namedGroups.engine.length,
    lightsCount: namedGroups.lights.length,
    glassCount: namedGroups.glass.length,
    doorsCount: namedGroups.doors.length,
    carbonCount: namedGroups.carbon.length,
  },
  namedGroups,
  allMeshes,
};

fs.writeFileSync('bmw_audit_report.json', JSON.stringify(report, null, 2));

console.log('=== BMW M4 GT3 EVO AUDIT SUMMARY ===');
console.log('Total Meshes:', meshCount);
console.log('Total Triangles:', Math.round(totalTriangles));
console.log('Total Vertices:', totalVertices);
console.log('Unique Materials:', materialNames.size);
console.log('Dimensions (Units):', `Width(X): ${size.x.toFixed(2)}, Height(Y): ${size.y.toFixed(2)}, Length(Z): ${size.z.toFixed(2)}`);
console.log('Center:', `[${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}]`);
console.log('\nSubsystem Mesh Counts:');
console.log('- Wheels / Tires:', namedGroups.wheels.length);
console.log('- Brakes / Calipers:', namedGroups.brakes.length);
console.log('- Steering Wheel:', namedGroups.steeringWheel.length);
console.log('- Interior Components:', namedGroups.interior.length);
console.log('- Engine Components:', namedGroups.engine.length);
console.log('- Lights Components:', namedGroups.lights.length);
console.log('- Glass / Windshield:', namedGroups.glass.length);
console.log('- Doors Components:', namedGroups.doors.length);
console.log('- Carbon Aero / Body:', namedGroups.carbon.length);

