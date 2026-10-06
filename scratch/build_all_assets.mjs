import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import fs from 'fs/promises';
import path from 'path';

if (typeof FileReader === 'undefined') {
  global.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (this.onloadend) this.onloadend();
        if (this.onload) this.onload();
      });
    }
  };
}

if (typeof ProgressEvent === 'undefined') {
  global.ProgressEvent = class ProgressEvent {
    constructor(type, params = {}) {
      this.type = type;
      this.lengthComputable = params.lengthComputable ?? false;
      this.loaded = params.loaded ?? 0;
      this.total = params.total ?? 0;
    }
  };
}

// Ensure output directories exist
await fs.mkdir('public/world/assets', { recursive: true });
await fs.mkdir('scratch/textures/leaves', { recursive: true });
await fs.mkdir('scratch/textures/bark', { recursive: true });

console.log('--- Step 1: Downloading textures for tree generation ---');

async function downloadFile(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.statusText}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(dest, buf);
}

// Download leaf textures
for (const leaf of ['oak.png', 'ash.png', 'pine.png', 'aspen.png']) {
  const dest = `scratch/textures/leaves/${leaf}`;
  try {
    await fs.access(dest);
  } catch {
    console.log(`Downloading leaf texture: ${leaf}`);
    await downloadFile(`https://raw.githubusercontent.com/dgreenheck/ez-tree/main/src/app/public/textures/leaves/${leaf}`, dest);
  }
}

// Download AmbientCG CC0 bark textures
const barks = [
  { name: 'Bark001', id: 'Bark001_1K-JPG' },
  { name: 'Bark007', id: 'Bark007_1K-JPG' },
  { name: 'Bark014', id: 'Bark014_1K-JPG' }
];

for (const b of barks) {
  const dir = `scratch/textures/bark/${b.name}`;
  await fs.mkdir(dir, { recursive: true });
  const colorDest = `${dir}/color.jpg`;
  const normalDest = `${dir}/normal.jpg`;
  try {
    await fs.access(colorDest);
  } catch {
    console.log(`Downloading bark texture for ${b.name}...`);
    await downloadFile(`https://raw.githubusercontent.com/dgreenheck/ez-tree/main/src/app/public/textures/bark/${b.id}/${b.id}_Color.jpg`, colorDest);
    await downloadFile(`https://raw.githubusercontent.com/dgreenheck/ez-tree/main/src/app/public/textures/bark/${b.id}/${b.id}_NormalGL.jpg`, normalDest);
  }
}

console.log('--- Step 2: Generating 4 Realistic Tree Models ---');

const { Tree } = await import('./eztree/tree.js');

function createTextureFromBuffer(buf, isPng = false) {
  const blob = new Blob([buf], { type: isPng ? 'image/png' : 'image/jpeg' });
  // In node environment, we can construct data URL
  const dataUri = `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${buf.toString('base64')}`;
  // We can create a simple Canvas / Image or Three texture with image placeholder
  const tex = new THREE.Texture();
  // For GLTFExporter, we can attach the raw image buffer / dataUri
  tex.image = {
    src: dataUri,
    width: 512,
    height: 512,
    data: buf
  };
  tex.needsUpdate = true;
  return tex;
}

const treeConfigs = [
  {
    name: 'tree_oak_mature.glb',
    presetPath: './scratch/eztree/presets/oak_large.json',
    leafTex: 'scratch/textures/leaves/oak.png',
    barkDir: 'scratch/textures/bark/Bark001',
    leafTint: 0x4a6b47,
    scale: 1.0,
    targetHeight: 22.0
  },
  {
    name: 'tree_ash_mature.glb',
    presetPath: './scratch/eztree/presets/ash_large.json',
    leafTex: 'scratch/textures/leaves/ash.png',
    barkDir: 'scratch/textures/bark/Bark007',
    leafTint: 0x55734e,
    scale: 1.0,
    targetHeight: 20.0
  },
  {
    name: 'tree_roadside.glb',
    presetPath: './scratch/eztree/presets/oak_medium.json',
    leafTex: 'scratch/textures/leaves/oak.png',
    barkDir: 'scratch/textures/bark/Bark001',
    leafTint: 0x5a764d,
    scale: 1.0,
    targetHeight: 15.0
  },
  {
    name: 'tree_pine_tall.glb',
    presetPath: './scratch/eztree/presets/pine_large.json',
    leafTex: 'scratch/textures/leaves/pine.png',
    barkDir: 'scratch/textures/bark/Bark014',
    leafTint: 0x2e4f44,
    scale: 1.0,
    targetHeight: 26.0
  }
];

const exporter = new GLTFExporter();

for (const cfg of treeConfigs) {
  console.log(`Building tree: ${cfg.name}...`);
  const preset = JSON.parse(await fs.readFile(cfg.presetPath, 'utf8'));
  const tree = new Tree(preset);
  
  // Set leaf texture and colors
  const leafBuf = await fs.readFile(cfg.leafTex);
  const barkColorBuf = await fs.readFile(`${cfg.barkDir}/color.jpg`);
  
  tree.options.leaves.map = createTextureFromBuffer(leafBuf, true);
  tree.options.bark.maps = {
    color: createTextureFromBuffer(barkColorBuf, false)
  };
  tree.options.leaves.tint = cfg.leafTint;
  tree.generate();

  // Normalize group and ground pivot
  const group = new THREE.Group();
  group.name = cfg.name.replace('.glb', '');
  
  const bMesh = tree.branchesMesh.clone();
  bMesh.name = 'trunk';
  bMesh.material = new THREE.MeshStandardMaterial({
    name: 'bark',
    color: 0x5a4a3a,
    roughness: 0.95,
    metalness: 0.0
  });

  const lMesh = tree.leavesMesh.clone();
  lMesh.name = 'foliage';
  lMesh.material = new THREE.MeshStandardMaterial({
    name: 'leaves',
    color: cfg.leafTint,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
    alphaTest: 0.35
  });

  group.add(bMesh);
  group.add(lMesh);

  // Compute bounding box and normalize scale & pivot
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const minY = box.min.y;
  
  // Shift to ground pivot y=0
  bMesh.position.y -= minY;
  lMesh.position.y -= minY;
  
  // Scale to target height
  const scale = cfg.targetHeight / size.y;
  group.scale.setScalar(scale);

  console.log(`  -> Size: x=${(size.x * scale).toFixed(1)}m, y=${(size.y * scale).toFixed(1)}m, z=${(size.z * scale).toFixed(1)}m`);
  console.log(`  -> Vertices: Trunk ${bMesh.geometry.attributes.position.count}, Leaves ${lMesh.geometry.attributes.position.count}`);

  const glbBuffer = await new Promise((resolve, reject) => {
    exporter.parse(
      group,
      (gltf) => resolve(Buffer.from(gltf)),
      (err) => reject(err),
      { binary: true }
    );
  });

  await fs.writeFile(`public/world/assets/${cfg.name}`, glbBuffer);
  console.log(`  -> Wrote public/world/assets/${cfg.name} (${(glbBuffer.length / 1024).toFixed(1)} KB)`);
}

console.log('--- Step 3: Downloading & Optimizing Poly Haven CC0 Foliage ---');

const polyHavenAssets = [
  { id: 'shrub_03', name: 'shrub_dense.glb', scale: 1.0, targetHeight: 2.4 },
  { id: 'weed_plant_02', name: 'plant_weed.glb', scale: 1.0, targetHeight: 1.2 },
  { id: 'grass_medium_02', name: 'grass_field_cluster.glb', scale: 1.0, targetHeight: 1.1 },
  { id: 'grass_bermuda_01', name: 'grass_tuft_near.glb', scale: 1.0, targetHeight: 0.65 },
  { id: 'boulder_01', name: 'rock_boulder.glb', scale: 1.0, targetHeight: 2.8 }
];

for (const asset of polyHavenAssets) {
  console.log(`Downloading Poly Haven asset: ${asset.id}...`);
  const gltfUrl = `https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/${asset.id}/${asset.id}_1k.gltf`;
  const gltfMeta = await (await fetch(gltfUrl)).json();
  
  // Download bin file
  const binKey = Object.keys(gltfMeta.buffers?.[0] ? { [gltfMeta.buffers[0].uri]: true } : {})[0] || `${asset.id}.bin`;
  const binUrl = `https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/${asset.id}/${binKey}`;
  const binBuf = Buffer.from(await (await fetch(binUrl)).arrayBuffer());

  // Package into GLB
  // Parse gltf buffer into Three scene using GLTFLoader or GLTFExporter
  // In gltfMeta, embed the buffer as data URI
  gltfMeta.buffers[0].uri = `data:application/octet-stream;base64,${binBuf.toString('base64')}`;

  // Strip huge textures if present to keep download lightweight and fast (we use procedural seasonal shaders)
  // or embed low-res diffuse
  gltfMeta.images = [];
  gltfMeta.textures = [];
  if (gltfMeta.materials) {
    for (const m of gltfMeta.materials) {
      delete m.pbrMetallicRoughness?.baseColorTexture;
      delete m.pbrMetallicRoughness?.metallicRoughnessTexture;
      delete m.normalTexture;
      delete m.occlusionTexture;
    }
  }

  const gltfString = JSON.stringify(gltfMeta);
  const loader = new GLTFLoader();
  
  const parsed = await new Promise((resolve, reject) => {
    loader.parse(gltfString, '', (res) => resolve(res), (err) => reject(err));
  });

  const root = parsed.scene;
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const minY = box.min.y;

  // Ground pivot normalization
  root.position.y -= minY;
  const scale = asset.targetHeight / (size.y || 1.0);
  root.scale.setScalar(scale);

  let vertCount = 0;
  root.traverse((obj) => {
    if (obj.isMesh) {
      vertCount += obj.geometry.attributes.position.count;
      obj.material = new THREE.MeshStandardMaterial({
        name: asset.id,
        color: asset.id.includes('grass') ? 0x82965c : 0x58784e,
        roughness: 0.95,
        metalness: 0.0,
        side: THREE.DoubleSide
      });
    }
  });

  console.log(`  -> Mesh: ${asset.id}, Vertices: ${vertCount}, Target Height: ${asset.targetHeight}m`);

  const glbBuf = await new Promise((resolve, reject) => {
    exporter.parse(
      root,
      (gltf) => resolve(Buffer.from(gltf)),
      (err) => reject(err),
      { binary: true }
    );
  });

  await fs.writeFile(`public/world/assets/${asset.name}`, glbBuf);
  console.log(`  -> Wrote public/world/assets/${asset.name} (${(glbBuf.length / 1024).toFixed(1)} KB)`);
}

console.log('--- All Assets Built Successfully! ---');
