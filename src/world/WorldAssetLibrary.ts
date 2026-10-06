import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Batch } from './Batch.ts';
import type { Materials } from './Materials.ts';

export type WorldAssetKind =
  | 'oak_mature'
  | 'ash_mature'
  | 'roadside'
  | 'pine_tall'
  | 'shrub'
  | 'weed'
  | 'grass_field'
  | 'grass_near'
  | 'rock';

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
}

export class WorldAssetLibrary {
  readonly parts = new Map<WorldAssetKind, Part[]>();
  readonly ready: Promise<void>;
  loaded = false;
  private placement = new THREE.Matrix4();
  private combined = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private axis = new THREE.Vector3(0, 1, 0);

  constructor(private materials: Materials) {
    const loader = new GLTFLoader();
    this.ready = Promise.all([
      // Mature tree library towering over the vehicle with expansive canopies
      this.load(loader, 'oak_mature', '/world/assets/tree_oak_mature.glb', 22.0),
      this.load(loader, 'ash_mature', '/world/assets/tree_ash_mature.glb', 20.0),
      this.load(loader, 'roadside', '/world/assets/tree_roadside.glb', 15.0),
      this.load(loader, 'pine_tall', '/world/assets/tree_pine_tall.glb', 26.0),
      // Photogrammetric undergrowth & ground cover
      this.load(loader, 'shrub', '/world/assets/shrub_dense.glb', 2.4),
      this.load(loader, 'weed', '/world/assets/plant_weed.glb', 1.2),
      this.load(loader, 'grass_field', '/world/assets/grass_field_cluster.glb', 1.1),
      this.load(loader, 'grass_near', '/world/assets/grass_tuft_near.glb', 0.65),
      // Geological formations
      this.load(loader, 'rock', '/world/assets/rock_boulder.glb', 2.8),
    ])
      .then(() => {
        this.loaded = this.parts.size > 0;
      })
      .catch(() => {
        this.loaded = false;
      });
  }

  has(kind: WorldAssetKind) {
    return (this.parts.get(kind)?.length ?? 0) > 0;
  }

  add(batch: Batch, kind: WorldAssetKind, key: string, x: number, y: number, z: number, scale = 1, rotation = 0) {
    const parts = this.parts.get(kind);
    if (!parts?.length) return false;
    this.placement.compose(this.position.set(x, y, z), this.rotation.setFromAxisAngle(this.axis, rotation), this.scale.setScalar(scale));
    parts.forEach((part, index) =>
      batch.addMatrix(`${key}-${kind}-${index}`, part.geometry, part.material, this.combined.multiplyMatrices(this.placement, part.matrix))
    );
    return true;
  }

  private surface(material: THREE.MeshStandardMaterial, kind: WorldAssetKind) {
    const foliage = /leaf|foliage|leaves|grass|shrub|weed|plant/i.test(material.name) && kind !== 'rock';
    const isBark = /bark|trunk/i.test(material.name);
    const evergreen = kind === 'pine_tall';
    const isGrass = kind === 'grass_field' || kind === 'grass_near';
    const isShrubOrWeed = kind === 'shrub' || kind === 'weed';
    const isTree = kind === 'oak_mature' || kind === 'ash_mature' || kind === 'roadside' || kind === 'pine_tall';

    if (kind === 'rock') {
      material.color.set(0x7e7d75);
    } else if (isBark) {
      material.color.set(0x564739);
    } else if (evergreen) {
      material.color.set(0x2d483c);
    } else if (isGrass) {
      material.color.set(kind === 'grass_near' ? 0x7a8e52 : 0x6e844a);
    } else if (isShrubOrWeed) {
      material.color.set(0x526e43);
    } else {
      material.color.set(0x4a6a42);
    }

    material.roughness = 0.95;
    material.metalness = 0.0;
    material.side = foliage ? THREE.DoubleSide : THREE.FrontSide;

    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.materials.terrain.uniforms);
      shader.uniforms.uWindTime = this.materials.timeUniform;
      shader.uniforms.uWindStrength = this.materials.windUniform;

      shader.vertexShader =
        `uniform float terrainOrigin, uWindTime, uWindStrength, terrainSnow;
        varying float vWorldUp, vSeasonChoice, vAnchorDist;\n` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 anchor = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vSeasonChoice = fract(sin(dot(vec2(anchor.x, anchor.z - terrainOrigin), vec2(0.0713, 0.0437))) * 43758.5453);
        vWorldUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal).y;
        vAnchorDist = distance(cameraPosition.xz, anchor.xz);

        ${
          foliage
            ? `
          float swayFreq = uWindTime * 2.0 + anchor.x * 0.05 + (anchor.z - terrainOrigin) * 0.03;
          float swayAmp = sin(swayFreq) * uWindStrength * 0.12 * clamp(position.y * 0.25, 0.0, 1.2);
          transformed.x += swayAmp;
          transformed.z += cos(swayFreq * 0.8) * swayAmp * 0.6;
        `
            : ''
        }

        ${
          kind === 'grass_near'
            ? `float nearFade = 1.0 - smoothstep(45.0, 68.0, vAnchorDist);
               transformed.y *= nearFade * mix(1.0, 0.15, terrainSnow);`
            : ''
        }
        ${
          kind === 'grass_field'
            ? `float fieldFade = 1.0 - smoothstep(95.0, 145.0, vAnchorDist);
               transformed.y *= fieldFade * mix(1.0, 0.20, terrainSnow);`
            : ''
        }
        ${
          isShrubOrWeed
            ? `float shrubFade = 1.0 - smoothstep(180.0, 240.0, vAnchorDist);
               transformed.y *= shrubFade * mix(1.0, 0.25, terrainSnow);`
            : ''
        }
      `
      );

      shader.fragmentShader =
        `uniform float terrainAutumn, terrainSnow, terrainWet;
        varying float vWorldUp, vSeasonChoice, vAnchorDist;\n` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${
          foliage && isTree && !evergreen
            ? `
          // Rich autumn foliage variation: amber gold, burnt orange, russet red, and olive ochre
          vec3 autumnAmber = vec3(0.86, 0.48, 0.12);
          vec3 autumnGold = vec3(0.92, 0.68, 0.16);
          vec3 autumnRust = vec3(0.78, 0.26, 0.09);
          vec3 autumnCrimson = vec3(0.64, 0.18, 0.10);
          vec3 autumnOlive = vec3(0.58, 0.64, 0.22);

          vec3 warmTree = mix(autumnAmber, autumnGold, smoothstep(0.0, 0.35, vSeasonChoice));
          warmTree = mix(warmTree, autumnRust, smoothstep(0.35, 0.65, vSeasonChoice));
          warmTree = mix(warmTree, autumnCrimson, smoothstep(0.65, 0.85, vSeasonChoice));
          warmTree = mix(warmTree, autumnOlive, smoothstep(0.85, 1.0, vSeasonChoice));

          diffuseColor.rgb = mix(diffuseColor.rgb, warmTree, terrainAutumn * 0.94);
        `
            : ''
        }
        ${
          foliage && isGrass
            ? `
          vec3 autumnGrass = vec3(0.78, 0.62, 0.32);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * autumnGrass * 1.6, terrainAutumn * 0.85);
        `
            : ''
        }
        ${
          foliage && isShrubOrWeed
            ? `
          vec3 autumnShrub = mix(vec3(0.72, 0.46, 0.18), vec3(0.84, 0.62, 0.22), vSeasonChoice);
          diffuseColor.rgb = mix(diffuseColor.rgb, autumnShrub, terrainAutumn * 0.88);
        `
            : ''
        }

        diffuseColor.rgb *= 1.0 - terrainWet * 0.18;
        float snowCap = terrainSnow * smoothstep(-0.1, 0.6, vWorldUp);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.84, 0.87), snowCap * 0.94);
      `
      );
    };

    material.customProgramCacheKey = () => `world-asset-season-${kind}-${foliage}-${isBark}`;
  }

  private async load(loader: GLTFLoader, kind: WorldAssetKind, url: string, targetHeight: number) {
    try {
      const gltf = await loader.loadAsync(url);
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= 0) return;

      root.scale.setScalar(targetHeight / size.y);
      root.updateMatrixWorld(true);
      const scaledBox = new THREE.Box3().setFromObject(root);
      const lift = new THREE.Matrix4().makeTranslation(0, -scaledBox.min.y, 0);
      const parts: Part[] = [];

      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const source = Array.isArray(object.material) ? object.material[0] : object.material;
        const material = source.clone() as THREE.MeshStandardMaterial;
        this.surface(material, kind);
        parts.push({
          geometry: object.geometry,
          material,
          matrix: new THREE.Matrix4().multiplyMatrices(lift, object.matrixWorld),
        });
      });

      if (parts.length) this.parts.set(kind, parts);
    } catch {}
  }

  dispose() {
    for (const parts of this.parts.values()) {
      for (const p of parts) {
        p.material.dispose();
        p.geometry.dispose();
      }
    }
    this.parts.clear();
  }
}
