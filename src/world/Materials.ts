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
  meadowClumpShape: THREE.BufferGeometry;
  meadowClump: THREE.MeshStandardMaterial;

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

    // 6-triangle 3-plane star clump geometry for volumetric 360-degree grass coverage
    this.meadowClumpShape = this.createStarClumpGeometry();

    // High-performance procedural grass texture atlas (4 variants: fine, tall, straw, wildflower)
    const grassAtlas = this.createGrassAtlasTexture();
    this.meadowClump = new THREE.MeshStandardMaterial({
      map: grassAtlas,
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.88,
      metalness: 0.0,
    });
    this.setupMeadowShader(this.meadowClump);

    // Attach vertex shader swaying to foliage materials
    this.setupWindShader(this.leaf, 0.05);
    this.setupWindShader(this.pine, 0.03);
    this.setupWindShader(this.grass, 0.08);
  }

  private createStarClumpGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // 2 intersecting vertical quads forming an ultra-efficient X-card (4 triangles, 8 vertices)
    // Diagonals at 45 degrees provide full 360-degree volumetric profile from any camera angle
    const hw = 0.44; // ~0.88m card width (1.25m diagonal span) for full interlocking ground coverage
    const h = 0.44;  // ~0.44m natural meadow grass height
    const baseSink = 0.05; // 5cm sink to anchor firmly into terrain without hovering on slopes

    const quads = [
      { x0: -hw, z0: -hw, x1: hw, z1: hw, nx: -0.707, nz: 0.707 },
      { x0: -hw, z0: hw, x1: hw, z1: -hw, nx: 0.707, nz: 0.707 },
    ];

    let vIdx = 0;
    for (const q of quads) {
      // Soft hemispherical normal for natural sky/sun lighting and warm grazing sunlight
      const ny = 0.80;
      const nx = q.nx * 0.42;
      const nz = q.nz * 0.42;

      // 0: bottom-left
      positions.push(q.x0, -baseSink, q.z0);
      normals.push(nx, ny, nz);
      uvs.push(0, 0);

      // 1: bottom-right
      positions.push(q.x1, -baseSink, q.z1);
      normals.push(nx, ny, nz);
      uvs.push(1, 0);

      // 2: top-right
      positions.push(q.x1, h, q.z1);
      normals.push(nx, ny, nz);
      uvs.push(1, 1);

      // 3: top-left
      positions.push(q.x0, h, q.z0);
      normals.push(nx, ny, nz);
      uvs.push(0, 1);

      indices.push(vIdx, vIdx + 1, vIdx + 2);
      indices.push(vIdx, vIdx + 2, vIdx + 3);
      vIdx += 4;
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  private createGrassAtlasTexture(): THREE.CanvasTexture {
    const width = 512;
    const height = 256;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);

    const cellWidth = 128;
    const drawBlade = (
      rootX: number,
      rootY: number,
      tipX: number,
      tipY: number,
      curveX: number,
      baseW: number,
      colorRoot: string,
      colorTip: string
    ) => {
      const midY = (rootY + tipY) * 0.5;
      const grad = ctx.createLinearGradient(rootX, rootY, tipX, tipY);
      grad.addColorStop(0, colorRoot);
      grad.addColorStop(0.35, colorRoot);
      grad.addColorStop(1, colorTip);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(rootX - baseW * 0.5, rootY);
      ctx.quadraticCurveTo(curveX - baseW * 0.25, midY, tipX, tipY);
      ctx.quadraticCurveTo(curveX + baseW * 0.25, midY, rootX + baseW * 0.5, rootY);
      ctx.closePath();
      ctx.fill();
    };

    const drawVariant = (cellIdx: number, style: 'fine' | 'tall' | 'straw' | 'flower') => {
      const startX = cellIdx * cellWidth;
      let seed = (cellIdx + 1) * 49297;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      // 1. Base turf understory: dense, interlocking blades across the entire card width
      // Forms an opaque base carpet that anchors the grass and covers the ground underneath
      const baseBladeCount = 54;
      for (let j = 0; j < baseBladeCount; j++) {
        const rootX = startX + 2 + (j / (baseBladeCount - 1)) * 124 + (rnd() - 0.5) * 4;
        const rootY = 256;
        const bladeH = 45 + rnd() * 65;
        const tipY = 256 - bladeH;
        const spread = (rnd() - 0.5) * 1.6;
        const tipX = rootX + spread * 20;
        const curveX = (rootX + tipX) * 0.5;
        const baseW = 4.5 + rnd() * 2.5;

        const colorRoot = style === 'straw' ? '#5a5830' : '#465626';
        const colorTip = style === 'straw' ? '#78723c' : '#5c7030';
        drawBlade(rootX, rootY, tipX, tipY, curveX, baseW, colorRoot, colorTip);
      }

      // 2. Main blade canopy: continuous swath of blades extending across the full 128px cell
      const bladeCount = style === 'fine' ? 70 : style === 'tall' ? 62 : style === 'straw' ? 66 : 64;
      for (let i = 0; i < bladeCount; i++) {
        // Uniform distribution across entire 128px card width with subtle jitter
        const rootX = startX + 3 + (i / (bladeCount - 1)) * 122 + (rnd() - 0.5) * 3;
        const rootY = 256;

        // Level, slightly undulating top canopy (no triangular drop at edges)
        const wave = Math.sin((i / bladeCount) * Math.PI * 3) * 18;
        const maxH = style === 'tall' ? 220 : 185;
        const bladeH = Math.max(90, Math.min(240, maxH + wave + (rnd() - 0.5) * 45));
        const tipY = 256 - bladeH;

        // Natural outward curve
        const curveDir = (rnd() - 0.5) * 2.0;
        const arch = curveDir * (style === 'tall' ? 32 : 24);
        const tipX = rootX + arch;
        const curveX = (rootX + tipX) * 0.5 + curveDir * 8;
        const baseW = 4.0 + rnd() * 2.5;

        // Exact sRGB colors yielding linear albedo matching TerrainMaterial autumnTone
        let colorRoot = '#52642a';
        let colorTip = '#7c9644';

        if (style === 'straw') {
          colorRoot = '#5e5a30';
          colorTip = rnd() > 0.4 ? '#98924e' : '#888242';
        } else if (style === 'tall') {
          colorRoot = '#4c5e26';
          colorTip = '#86a24a';
        } else if (style === 'flower') {
          colorRoot = '#506228';
          colorTip = '#7a9442';
        }

        drawBlade(rootX, rootY, tipX, tipY, curveX, baseW, colorRoot, colorTip);

        // Seed heads on tall wild grass
        if (style === 'tall' && i % 7 === 0 && tipY < 130) {
          ctx.strokeStyle = '#b8cc72';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX + (rnd() - 0.5) * 5, tipY - 12);
          ctx.stroke();
        }

        // Tiny restrained meadow flowers on flower variant
        if (style === 'flower' && i % 6 === 0 && tipY < 160) {
          const fx = tipX + (rnd() - 0.5) * 4;
          const fy = tipY + 4 + rnd() * 12;

          // Subtle palette: delicate white daisies, pale buttercup yellows, and pale sky blue forget-me-nots
          const flowerType = (i / 6) % 3;
          if (flowerType === 0) {
            // White daisy with tiny yellow eye
            ctx.fillStyle = '#faf8ee';
            ctx.beginPath();
            ctx.arc(fx, fy, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#e2bc3b';
            ctx.beginPath();
            ctx.arc(fx, fy, 1.0, 0, Math.PI * 2);
            ctx.fill();
          } else if (flowerType === 1) {
            // Pale buttercup yellow
            ctx.fillStyle = '#fde76c';
            ctx.beginPath();
            ctx.arc(fx, fy, 2.0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Subtle pale sky blue
            ctx.fillStyle = '#92c4ea';
            ctx.beginPath();
            ctx.arc(fx, fy, 1.9, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    };

    drawVariant(0, 'fine');
    drawVariant(1, 'tall');
    drawVariant(2, 'straw');
    drawVariant(3, 'flower');

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private setupMeadowShader(mat: THREE.MeshStandardMaterial) {
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.terrain.uniforms);
      shader.uniforms.uWindTime = this.timeUniform;
      shader.uniforms.uWindStrength = this.windUniform;

      shader.vertexShader = `
        uniform float terrainOrigin, uWindTime, uWindStrength;
        varying vec3 vWorldClumpPos;
        varying float vClumpDist;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vec4 instancePos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          instancePos = instanceMatrix * instancePos;
        #endif
        vec4 worldPos = modelMatrix * instancePos;
        vWorldClumpPos = worldPos.xyz;
        vWorldClumpPos.z -= terrainOrigin;
        vClumpDist = distance(cameraPosition.xz, worldPos.xz);

        // Smooth distance shrink fade from 34m to 48m (seamlessly transferring into matching terrain)
        float distFade = 1.0 - smoothstep(34.0, 48.0, vClumpDist);
        transformed.y *= distFade;

        // Select atlas variant (0, 1, 2, 3) deterministically from instance position
        #ifdef USE_MAP
          float clumpHash = fract(sin(dot(worldPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
          float varIdx = floor(clumpHash * 4.0);
          vMapUv.x = (uv.x + varIdx) * 0.25;
        #endif

        // Coherent, directional wind swaying (stronger at tips, zero at roots)
        float swayFreq = uWindTime * 2.2 + worldPos.x * 0.14 + (worldPos.z - terrainOrigin) * 0.14;
        float swayAmp = sin(swayFreq) * uWindStrength * 0.14 * uv.y * uv.y;
        transformed.x += swayAmp;
        transformed.z += cos(swayFreq * 0.8) * swayAmp * 0.55;
        `
      );

      shader.fragmentShader = `
        uniform float terrainAutumn, terrainSnow, terrainWet;
        varying vec3 vWorldClumpPos;
        varying float vClumpDist;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        // Position-based subtle grass tint variation matching terrain meadow drifts
        float posHash = fract(sin(dot(vWorldClumpPos.xz, vec2(0.0713, 0.0437))) * 43758.5453);
        vec3 lushTint = vec3(1.00, 1.02, 0.98);
        vec3 sunlitTint = vec3(1.06, 1.05, 0.94);
        vec3 dryTint = vec3(1.08, 1.02, 0.88);
        vec3 naturalVar = mix(lushTint, sunlitTint, posHash);
        naturalVar = mix(naturalVar, dryTint, smoothstep(0.60, 1.0, posHash));
        diffuseColor.rgb *= naturalVar;

        // Autumn color grading matching TerrainMaterial exactly without artificial darkening
        if (terrainAutumn > 0.01) {
          vec3 autumnShift = mix(vec3(0.98, 1.01, 0.92), vec3(1.15, 1.10, 0.82), posHash);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * autumnShift, terrainAutumn * 0.90);
        }

        // Snow and rain integration
        diffuseColor.rgb *= 1.0 - terrainWet * 0.22;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.88), terrainSnow * 0.88);
        `
      );
    };
    mat.customProgramCacheKey = () => 'aftermile-meadow-clump-v8';
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
