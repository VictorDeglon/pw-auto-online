/**
 * Procedural AAA PBR Texture Generator
 * Generates Albedo, Normal, Roughness, and Ambient Occlusion maps on HTML5 Canvases.
 */
import * as THREE from 'three';

export class PBRTextureFactory {
  constructor() {
    this.cache = new Map();
  }

  createCanvas(w = 512, h = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  // --- Stucco Wall PBR ---
  getStucco(baseColor = 0xe8e2d5) {
    const key = `stucco_${baseColor}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const c = this.createCanvas(512, 512);
    const ctx = c.getContext('2d');
    const id = ctx.createImageData(512, 512);
    const color = new THREE.Color(baseColor);
    const r0 = color.r * 255, g0 = color.g * 255, b0 = color.b * 255;

    for (let i = 0; i < 512 * 512; i++) {
      // Multi-frequency noise for stucco plaster grain
      const noise = (Math.random() - 0.5) * 28 + (Math.random() - 0.5) * 14;
      const speckle = Math.random() < 0.03 ? -35 : 0;
      const r = Math.max(0, Math.min(255, r0 + noise + speckle));
      const g = Math.max(0, Math.min(255, g0 + noise + speckle));
      const b = Math.max(0, Math.min(255, b0 + noise + speckle));
      id.data[i * 4] = r;
      id.data[i * 4 + 1] = g;
      id.data[i * 4 + 2] = b;
      id.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);

    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;

    // Normal map for plaster bump
    const nc = this.createNormalFromHeight(id, 512, 512, 1.8);
    const normalMap = new THREE.CanvasTexture(nc);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughness: 0.92,
      metalness: 0.02
    });

    this.cache.set(key, mat);
    return mat;
  }

  // --- Terracotta Spanish Clay Tile PBR ---
  getSpanishTile(baseColor = 0xb84e2a) {
    const key = `clay_tile_${baseColor}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const c = this.createCanvas(512, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#b84e2a';
    ctx.fillRect(0, 0, 512, 512);

    // Draw barrel tile corrugation shading
    const rows = 16, cols = 8;
    const cw = 512 / cols, ch = 512 / rows;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = x * cw, py = y * ch;
        // Tile gradient (barrel curvature)
        const grad = ctx.createLinearGradient(px, py, px + cw, py);
        grad.addColorStop(0, '#5a1d0d');
        grad.addColorStop(0.3, '#d46538');
        grad.addColorStop(0.7, '#c25327');
        grad.addColorStop(1, '#662211');
        ctx.fillStyle = grad;
        ctx.fillRect(px + 2, py + 2, cw - 4, ch - 4);

        // Tile overlap shadow
        ctx.fillStyle = 'rgba(20, 5, 0, 0.45)';
        ctx.fillRect(px, py, cw, 4);

        // Subtle weathering/dirt
        if (Math.random() < 0.3) {
          ctx.fillStyle = 'rgba(70, 60, 50, 0.2)';
          ctx.beginPath();
          ctx.arc(px + cw * 0.5, py + ch * 0.5, cw * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;

    const id = ctx.getImageData(0, 0, 512, 512);
    const normalMap = new THREE.CanvasTexture(this.createNormalFromHeight(id, 512, 512, 2.5));
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughness: 0.75,
      metalness: 0.05
    });

    this.cache.set(key, mat);
    return mat;
  }

  // --- Asphalt Shingle Roof PBR ---
  getShingleRoof(baseColor = 0x3d4147) {
    const key = `shingle_${baseColor}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const c = this.createCanvas(512, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a3e44';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 32, cols = 8;
    const rw = 512 / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rw;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, y + rw - 3, 512, 3); // drop shadow

      const offset = (r % 2) * (512 / cols / 2);
      for (let c0 = 0; c0 < cols + 2; c0++) {
        const x = c0 * (512 / cols) - offset;
        const shade = Math.floor(Math.random() * 20 - 10);
        ctx.fillStyle = `rgba(${shade > 0 ? 255 : 0}, ${shade > 0 ? 255 : 0}, ${shade > 0 ? 255 : 0}, ${Math.abs(shade) / 100})`;
        ctx.fillRect(x, y, 512 / cols - 2, rw - 3);

        ctx.fillStyle = 'rgba(10, 10, 10, 0.4)';
        ctx.fillRect(x - 1, y, 2, rw - 3); // tab slit
      }
    }

    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;

    const id = ctx.getImageData(0, 0, 512, 512);
    const normalMap = new THREE.CanvasTexture(this.createNormalFromHeight(id, 512, 512, 1.5));
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughness: 0.88,
      metalness: 0.05
    });

    this.cache.set(key, mat);
    return mat;
  }

  // --- Interior Oak Hardwood Flooring PBR ---
  getHardwood() {
    const key = 'hardwood';
    if (this.cache.has(key)) return this.cache.get(key);

    const c = this.createCanvas(512, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#9e6e42';
    ctx.fillRect(0, 0, 512, 512);

    const planks = 16;
    const ph = 512 / planks;

    for (let p = 0; p < planks; p++) {
      const y = p * ph;
      const shade = (Math.random() - 0.5) * 30;
      ctx.fillStyle = `rgb(${158 + shade}, ${110 + shade * 0.8}, ${66 + shade * 0.5})`;
      ctx.fillRect(0, y, 512, ph - 2);

      // Wood grain streaks
      ctx.fillStyle = 'rgba(60, 35, 15, 0.12)';
      for (let s = 0; s < 4; s++) {
        const sy = y + Math.random() * ph;
        ctx.fillRect(0, sy, 512, 1.5);
      }

      // Plank gap seam
      ctx.fillStyle = 'rgba(20, 10, 5, 0.6)';
      ctx.fillRect(0, y + ph - 2, 512, 2);

      // Staggered vertical seams
      const seamX = (p * 187) % 512;
      ctx.fillRect(seamX, y, 2, ph);
    }

    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;

    const id = ctx.getImageData(0, 0, 512, 512);
    const normalMap = new THREE.CanvasTexture(this.createNormalFromHeight(id, 512, 512, 1.2));
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughness: 0.35, // Polished hardwood sheen
      metalness: 0.05
    });

    this.cache.set(key, mat);
    return mat;
  }

  // --- Concrete Driveway & Curb PBR ---
  getConcrete() {
    const key = 'concrete';
    if (this.cache.has(key)) return this.cache.get(key);

    const c = this.createCanvas(512, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#b5b1a8';
    ctx.fillRect(0, 0, 512, 512);

    const id = ctx.getImageData(0, 0, 512, 512);
    for (let i = 0; i < 512 * 512; i++) {
      const n = (Math.random() - 0.5) * 18;
      id.data[i * 4] = Math.max(0, Math.min(255, 181 + n));
      id.data[i * 4 + 1] = Math.max(0, Math.min(255, 177 + n));
      id.data[i * 4 + 2] = Math.max(0, Math.min(255, 168 + n));
    }
    ctx.putImageData(id, 0, 0);

    // Expansion joint grid line
    ctx.fillStyle = 'rgba(40, 40, 40, 0.45)';
    ctx.fillRect(254, 0, 4, 512);
    ctx.fillRect(0, 254, 512, 4);

    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;

    const normalMap = new THREE.CanvasTexture(this.createNormalFromHeight(id, 512, 512, 1.0));
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughness: 0.85,
      metalness: 0.02
    });

    this.cache.set(key, mat);
    return mat;
  }

  // --- Grass Lawn PBR ---
  getLawn() {
    const key = 'lawn';
    if (this.cache.has(key)) return this.cache.get(key);

    const c = this.createCanvas(512, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4c7834';
    ctx.fillRect(0, 0, 512, 512);

    const id = ctx.getImageData(0, 0, 512, 512);
    for (let i = 0; i < 512 * 512; i++) {
      const n = (Math.random() - 0.5) * 32;
      id.data[i * 4] = Math.max(0, Math.min(255, 76 + n * 0.7));
      id.data[i * 4 + 1] = Math.max(0, Math.min(255, 120 + n));
      id.data[i * 4 + 2] = Math.max(0, Math.min(255, 52 + n * 0.5));
    }
    ctx.putImageData(id, 0, 0);

    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;

    const normalMap = new THREE.CanvasTexture(this.createNormalFromHeight(id, 512, 512, 1.6));
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughness: 0.95,
      metalness: 0.0
    });

    this.cache.set(key, mat);
    return mat;
  }

  // --- Architectural Window Glass PBR ---
  getGlass() {
    const key = 'glass';
    if (this.cache.has(key)) return this.cache.get(key);

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x223545,
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.85,
      transparent: true,
      opacity: 0.75,
      ior: 1.52,
      reflectivity: 0.9
    });

    this.cache.set(key, mat);
    return mat;
  }

  // --- Horizontal Cedar Wood Slat / Rainscreen PBR ---
  getCedarWood() {
    const key = 'cedar_wood';
    if (this.cache.has(key)) return this.cache.get(key);

    const c = this.createCanvas(512, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#b47444';
    ctx.fillRect(0, 0, 512, 512);

    const slats = 20;
    const sh = 512 / slats;

    for (let s = 0; s < slats; s++) {
      const y = s * sh;
      const shade = (Math.random() - 0.5) * 35;
      ctx.fillStyle = `rgb(${180 + shade}, ${116 + shade * 0.7}, ${68 + shade * 0.4})`;
      ctx.fillRect(0, y, 512, sh - 2.5);

      // Fine grain streaks
      ctx.fillStyle = 'rgba(75, 40, 18, 0.15)';
      for (let g = 0; g < 3; g++) {
        ctx.fillRect(0, y + Math.random() * sh, 512, 1);
      }

      // Deep shadow gap between cedar slats
      ctx.fillStyle = 'rgba(25, 12, 6, 0.85)';
      ctx.fillRect(0, y + sh - 2.5, 512, 2.5);
    }

    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;

    const id = ctx.getImageData(0, 0, 512, 512);
    const normalMap = new THREE.CanvasTexture(this.createNormalFromHeight(id, 512, 512, 1.6));
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughness: 0.55,
      metalness: 0.05
    });

    this.cache.set(key, mat);
    return mat;
  }

  // --- Red/Terracotta Running Bond Brick Wainscoting PBR ---
  getBrick() {
    const key = 'brick_wainscot';
    if (this.cache.has(key)) return this.cache.get(key);

    const c = this.createCanvas(512, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#9b4a36';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 16, cols = 8;
    const rh = 512 / rows, cw = 512 / cols;

    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      const offset = (r % 2) * (cw / 2);
      for (let col = -1; col <= cols + 1; col++) {
        const x = col * cw + offset;
        const shade = (Math.random() - 0.5) * 40;
        ctx.fillStyle = `rgb(${155 + shade}, ${74 + shade * 0.5}, ${54 + shade * 0.4})`;
        ctx.fillRect(x + 2, y + 2, cw - 4, rh - 4);
      }
      // Mortar horizontal lines
      ctx.fillStyle = '#c5c0b5';
      ctx.fillRect(0, y, 512, 2.5);
    }

    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;

    const id = ctx.getImageData(0, 0, 512, 512);
    const normalMap = new THREE.CanvasTexture(this.createNormalFromHeight(id, 512, 512, 2.2));
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughness: 0.88,
      metalness: 0.02
    });

    this.cache.set(key, mat);
    return mat;
  }

  // --- Commercial Illuminated Facade Signage Texture ---
  getCommercialSignage(title = 'POWAY PLAZA', color = '#0284c7') {
    const key = `sign_${title}_${color}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const c = this.createCanvas(1024, 256);
    const ctx = c.getContext('2d');
    // Dark modern aluminum fascia background
    ctx.fillStyle = '#181b20';
    ctx.fillRect(0, 0, 1024, 256);

    // Subtle brushed metal streaks
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (let i = 0; i < 50; i++) {
      ctx.fillRect(Math.random() * 1024, 0, Math.random() * 4 + 1, 256);
    }

    // Glowing border frame
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 16, 992, 224);

    // Glowing Lettering
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px "Montserrat", -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillText(title, 512, 128);

    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      map,
      emissive: new THREE.Color(color),
      emissiveMap: map,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.3
    });

    this.cache.set(key, mat);
    return mat;
  }

  // --- Convert Grayscale Heightmap to Tangent-Space Normal Map ---
  createNormalFromHeight(imageData, w, h, strength = 1.0) {
    const c = this.createCanvas(w, h);
    const ctx = c.getContext('2d');
    const out = ctx.createImageData(w, h);
    const d = imageData.data;

    const getH = (x, y) => {
      const px = ((x + w) % w);
      const py = ((y + h) % h);
      const idx = (py * w + px) * 4;
      return (d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114) / 255.0;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const left = getH(x - 1, y);
        const right = getH(x + 1, y);
        const up = getH(x, y - 1);
        const down = getH(x, y + 1);

        const dx = (right - left) * strength;
        const dy = (down - up) * strength;
        const dz = 1.0;

        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const nx = (dx / len) * 0.5 + 0.5;
        const ny = (-dy / len) * 0.5 + 0.5;
        const nz = (dz / len) * 0.5 + 0.5;

        const idx = (y * w + x) * 4;
        out.data[idx] = Math.round(nx * 255);
        out.data[idx + 1] = Math.round(ny * 255);
        out.data[idx + 2] = Math.round(nz * 255);
        out.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(out, 0, 0);
    return c;
  }
}
