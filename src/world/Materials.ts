import * as THREE from 'three';
import { TerrainMaterial } from './TerrainMaterial.ts';

export class Materials {
  asphalt = new THREE.MeshStandardMaterial({ color: 0x404a50, roughness: 0.86, metalness: 0.04 });
  terrain = new TerrainMaterial();
  concrete = new THREE.MeshStandardMaterial({ color: 0x979c96, roughness: 0.94 });
  dark = new THREE.MeshStandardMaterial({ color: 0x252e35, roughness: 0.7 });
  metal = new THREE.MeshStandardMaterial({ color: 0x97a4a5, metalness: 0.55, roughness: 0.4 });
  white = new THREE.MeshStandardMaterial({ color: 0xd6d8c9, roughness: 0.7 });
  yellow = new THREE.MeshStandardMaterial({ color: 0xd7bc78, roughness: 0.7 });
  bark = new THREE.MeshStandardMaterial({ color: 0x534636, roughness: 1.0 });
  leaf = new THREE.MeshStandardMaterial({ color: 0x496452, roughness: 1.0 });
  pine = new THREE.MeshStandardMaterial({ color: 0x284b43, roughness: 1.0 });
  grass = new THREE.MeshStandardMaterial({ color: 0x8e9870, side: THREE.DoubleSide, roughness: 1.0 });
  rock = new THREE.MeshStandardMaterial({ color: 0x80796b, roughness: 1.0 });
  sand = new THREE.MeshStandardMaterial({ color: 0xb7ac8a, roughness: 1.0 });
  red = new THREE.MeshStandardMaterial({ color: 0x854453, metalness: 0.1, roughness: 0.6 });
  glass = new THREE.MeshStandardMaterial({ color: 0x47727b, metalness: 0.65, roughness: 0.22, emissive: 0x254d53, emissiveIntensity: 0.12 });
  light = new THREE.MeshStandardMaterial({ color: 0xffe6b2, emissive: 0xffd299, emissiveIntensity: 1.0 });
  cyan = new THREE.MeshStandardMaterial({ color: 0x82bdb6, emissive: 0x3ea7a0, emissiveIntensity: 0.6 });
  signalRed = new THREE.MeshStandardMaterial({ color: 0xa62135, emissive: 0xff2040, emissiveIntensity: 1.0 });
  signalAmber = new THREE.MeshStandardMaterial({ color: 0xae7722, emissive: 0xffa721, emissiveIntensity: 0.0 });
  signalGreen = new THREE.MeshStandardMaterial({ color: 0x2b866d, emissive: 0x63ffb3, emissiveIntensity: 0.0 });

  box = new THREE.BoxGeometry(1, 1, 1);
  cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
  cone = new THREE.ConeGeometry(1, 1, 9);
  sphere = new THREE.IcosahedronGeometry(1, 1);
  leafShape = new THREE.IcosahedronGeometry(1, 2);
  grassShape: THREE.BufferGeometry;

  // Global Wind Uniform for shader-based vegetation animation
  windUniform = { value: 0.5 };
  timeUniform = { value: 0.0 };

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!, data = ctx.createImageData(256, 256);
    let r = 17;
    for (let i = 0; i < data.data.length; i += 4) {
      r = (r * 1664525 + 1013904223) >>> 0;
      // High-frequency asphalt micro-grain with subtle aggregate contrast
      const grain = (r % 64);
      const macro = ((r >> 8) % 40);
      const n = 145 + grain + macro;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = n;
      data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(12, 120);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.asphalt.map = texture;

    this.grassShape = new THREE.BufferGeometry();
    this.grassShape.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.5, 0, 0,   0.08, 1, 0,   0.5, 0, 0,
      0, 0, -0.5,   0, 1, 0.08,   0, 0, 0.5
    ], 3));
    this.grassShape.computeVertexNormals();

    // Attach vertex shader swaying to foliage materials
    this.setupWindShader(this.leaf, 0.05);
    this.setupWindShader(this.pine, 0.03);
    this.setupWindShader(this.grass, 0.08);
  }

  private setupWindShader(mat: THREE.MeshStandardMaterial, strength: number) {
    mat.onBeforeCompile = shader => {
      shader.uniforms.uWindTime = this.timeUniform;
      shader.uniforms.uWindStrength = this.windUniform;
      shader.vertexShader = `
        uniform float uWindTime;
        uniform float uWindStrength;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // High-performance coherent wind wave displacement on canopy/blades
        vec4 instancePosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          instancePosition=instanceMatrix*instancePosition;
        #endif
        vec4 worldInstancePos = modelMatrix * instancePosition;
        float sway = sin(uWindTime * 2.2 + worldInstancePos.x * 0.12 + worldInstancePos.z * 0.12);
        float swayGust = cos(uWindTime * 1.4 + worldInstancePos.x * 0.06);
        float totalSway = (sway * 0.7 + swayGust * 0.3) * uWindStrength * ${strength.toFixed(3)};
        float rootMask=clamp(position.y*.22,0.0,1.0);
        transformed.x += totalSway*rootMask;
        transformed.z += totalSway*rootMask * 0.6;
        `
      );
    };
  }

  // Cached static colors for zero-allocation per-frame update
  private static readonly C_BASE_ASPHALT = new THREE.Color(0x404a50);
  private static readonly C_WET_ASPHALT = new THREE.Color(0x181d22);
  private static readonly C_SNOW_ASPHALT = new THREE.Color(0xbac4c8);
  private static readonly C_LEAF_BASE = new THREE.Color(0x496452);
  private static readonly C_LEAF_AUTUMN = new THREE.Color(0xc96f2a);
  private static readonly C_LEAF_SNOW = new THREE.Color(0xc7d1d1);
  private static readonly C_PINE_BASE = new THREE.Color(0x284b43);
  private static readonly C_PINE_AUTUMN = new THREE.Color(0x756b3e);
  private static readonly C_PINE_SNOW = new THREE.Color(0xa5b9b9);
  private static readonly C_GRASS_BASE = new THREE.Color(0x8e9870);
  private static readonly C_GRASS_AUTUMN = new THREE.Color(0xa79c65);
  private static readonly C_GRASS_SNOW = new THREE.Color(0xe0e6e3);
  private static readonly C_ROCK_BASE = new THREE.Color(0x80796b);
  private static readonly C_ROCK_SNOW = new THREE.Color(0xd5dcdf);
  private static readonly C_CONCRETE_BASE = new THREE.Color(0x979c96);
  private static readonly C_CONCRETE_SNOW = new THREE.Color(0xd6dcdf);
  private tempColor = new THREE.Color();

  update(
    wet: number,
    snow: number,
    autumn: number,
    night: number,
    reflections: boolean,
    signal: number,
    time = 0,
    wind = 12
  ) {
    this.timeUniform.value = time;
    this.windUniform.value = wind * 0.05;
    this.terrain.uniforms.terrainAutumn.value = autumn;
    this.terrain.uniforms.terrainSnow.value = snow;
    this.terrain.uniforms.terrainWet.value = wet;

    this.asphalt.roughness = reflections ? Math.max(0.22, 0.86 - wet * 0.64) : 0.86;
    this.asphalt.metalness = reflections ? Math.min(0.32, 0.04 + wet * 0.26) : 0.04;
    this.tempColor.copy(Materials.C_BASE_ASPHALT).lerp(Materials.C_WET_ASPHALT, wet * 0.58);
    this.asphalt.color.copy(this.tempColor).lerp(Materials.C_SNOW_ASPHALT, snow * 0.23);

    // Autumn leaves color gradient: rich burnt amber and russet gold
    this.leaf.color.copy(Materials.C_LEAF_BASE).lerp(Materials.C_LEAF_AUTUMN, autumn).lerp(Materials.C_LEAF_SNOW, snow);
    this.pine.color.copy(Materials.C_PINE_BASE).lerp(Materials.C_PINE_AUTUMN, autumn * 0.4).lerp(Materials.C_PINE_SNOW, snow * 0.8);
    this.grass.color.copy(Materials.C_GRASS_BASE).lerp(Materials.C_GRASS_AUTUMN, autumn * 0.35).lerp(Materials.C_GRASS_SNOW, snow);

    this.rock.color.copy(Materials.C_ROCK_BASE).lerp(Materials.C_ROCK_SNOW, snow * 0.78);
    this.concrete.color.copy(Materials.C_CONCRETE_BASE).lerp(Materials.C_CONCRETE_SNOW, snow * 0.55);
    this.light.emissiveIntensity = 0.12 + night * 2.7;
    this.glass.emissiveIntensity = 0.08 + night * 0.9;
    this.signalGreen.emissiveIntensity = signal === 0 ? 3.0 : 0.05;
    this.signalAmber.emissiveIntensity = signal === 1 ? 3.0 : 0.05;
    this.signalRed.emissiveIntensity = signal === 2 ? 3.0 : 0.05;
  }
}
