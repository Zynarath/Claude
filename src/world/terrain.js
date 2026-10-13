// Procedural "The Island": a large jungle island with southern spawn beaches,
// a central volcano, a northern mountain range, inland lakes and the small
// Herbivore Island off the east coast. Coordinates: x = west->east, z = north->south.
// Latitude/longitude follow ARK's convention (lat 0 = north edge, lon 0 = west edge).
import * as THREE from 'three';
import { Simplex2 } from '../core/noise.js';
import { clamp, smoothstep, lerp, mulberry32 } from '../core/util.js';

export const WORLD_SIZE = 4096;
export const HALF = WORLD_SIZE / 2;
export const GRID = 512; // cells per side
export const CELL = WORLD_SIZE / GRID; // 8 m
export const VERTS = GRID + 1;
export const CHUNK_CELLS = 32;
export const CHUNKS = GRID / CHUNK_CELLS; // 16
export const SEA_LEVEL = 0;

export const BIOME = {
  OCEAN: 0,
  BEACH: 1,
  GRASS: 2,
  JUNGLE: 3,
  MOUNTAIN: 4,
  VOLCANO: 5,
  LAKESHORE: 6,
};
export const BIOME_NAMES = ['Ocean', 'Beach', 'Grasslands', 'Jungle', 'Mountains', 'Volcano', 'Lakeshore'];

export const VOLCANO = { x: 260, z: -180, r: 640 };
export const LAKES = [
  { name: 'Hidden Lake', x: -620, z: 120, r: 150, level: 0 },
  { name: 'Eastern Lake', x: 720, z: 520, r: 115, level: 0 },
];
export const HERBIVORE_ISLAND = { x: 1600, z: 260, r: 230 };

export function toLatLon(x, z) {
  return {
    lat: clamp(((z + HALF) / WORLD_SIZE) * 100, 0, 100),
    lon: clamp(((x + HALF) / WORLD_SIZE) * 100, 0, 100),
  };
}
export function fromLatLon(lat, lon) {
  return { x: (lon / 100) * WORLD_SIZE - HALF, z: (lat / 100) * WORLD_SIZE - HALF };
}

export class Terrain {
  constructor(seed = 2015) {
    this.seed = seed;
    this.noise = new Simplex2(seed);
    this.noise2 = new Simplex2(seed * 7 + 3);
    this.noise3 = new Simplex2(seed * 13 + 11);
    this.heights = new Float32Array(VERTS * VERTS);
    this.biomes = new Uint8Array(VERTS * VERTS);
    this.landness = new Float32Array(VERTS * VERTS);
    this.chunks = [];
    this.group = new THREE.Group();
    this.generate();
  }

  // Raw, un-carved height function.
  baseHeight(x, z) {
    const n = this.noise;
    // --- main island shape: distorted ellipse ---
    const ang = Math.atan2(z, x + 60);
    const shapeNoise =
      0.12 * n.noise(Math.cos(ang) * 1.3 + 10, Math.sin(ang) * 1.3 + 10) +
      0.06 * n.noise(Math.cos(ang) * 4 + 30, Math.sin(ang) * 4 + 30) +
      0.05 * n.fbm(x / 900 + 40, z / 900 + 40, 3);
    const ex = (x + 60) / 1480;
    const ez = (z - 30) / 1640;
    const r = Math.sqrt(ex * ex + ez * ez);
    let s = 1 - r / (1 + shapeNoise); // >0 inside

    // Herbivore Island (east)
    const hx = (x - HERBIVORE_ISLAND.x) / HERBIVORE_ISLAND.r;
    const hz = (z - HERBIVORE_ISLAND.z) / (HERBIVORE_ISLAND.r * 1.35);
    const hs = 1 - Math.sqrt(hx * hx + hz * hz) / (1 + 0.15 * n.noise(x / 150, z / 150));
    // a few small southern islets
    const islets = [
      [-900, 1840, 110], [520, 1900, 80], [-1720, 900, 95],
    ];
    let isletS = -1;
    for (const [ix, iz, ir] of islets) {
      const d = Math.hypot(x - ix, z - iz) / ir;
      isletS = Math.max(isletS, 1 - d / (1 + 0.2 * n.noise(x / 90, z / 90)));
    }
    const land = Math.max(s, hs * 0.55, isletS * 0.35);

    // Ocean floor -> beach -> land profile
    let h = lerp(-55, 3, smoothstep(-0.32, 0.015, land));
    // deep trenches far out
    h -= 40 * smoothstep(-0.25, -0.6, land);

    const inland = smoothstep(0.015, 0.22, s);
    // gentle rolling hills
    const hills = n.fbm(x / 520, z / 520, 5) * 0.5 + 0.5;
    h += inland * (6 + 38 * hills * hills);
    // small detail
    h += inland * 3.5 * this.noise2.fbm(x / 70, z / 70, 3);

    // Southern beaches are flatter / wider (easy spawn zones)
    const southFlat = smoothstep(500, 1300, z);
    h = lerp(h, Math.min(h, 3 + inland * 18 * hills), southFlat * 0.6);

    // Northern mountain range
    const north = smoothstep(-250, -1100, z) * smoothstep(0.02, 0.18, s);
    const ridge = this.noise3.ridged(x / 700 + 5, z / 520 + 5, 5);
    h += north * (60 + 330 * ridge * ridge * 1.6);

    // Western highlands (moderate)
    const west = smoothstep(-500, -1200, x) * smoothstep(0.05, 0.25, s) * smoothstep(900, 200, z);
    h += west * 120 * Math.pow(this.noise3.ridged(x / 500 + 21, z / 500 + 9, 4), 1.5);

    // Central volcano
    const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    if (dv < VOLCANO.r) {
      const t = 1 - dv / VOLCANO.r;
      h += 360 * Math.pow(t, 1.7) * (1 + 0.06 * this.noise2.noise(x / 60, z / 60));
      // crater
      const crater = Math.max(0, 1 - dv / 115);
      h -= 120 * crater * crater * (3 - 2 * crater);
    }

    // Herbivore island gentle hills
    if (hs > 0) {
      h = Math.max(h, 2 + 22 * smoothstep(0.02, 0.6, hs) * (0.6 + 0.4 * hills));
    }
    return h;
  }

  generate() {
    const H = this.heights;
    for (let j = 0; j < VERTS; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < VERTS; i++) {
        const x = -HALF + i * CELL;
        H[j * VERTS + i] = this.baseHeight(x, z);
      }
    }
    // Carve lakes (water level derived from rim so lakes never leak)
    for (const lake of LAKES) {
      let rimMin = Infinity;
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        const px = lake.x + Math.cos(ang) * lake.r * 1.25;
        const pz = lake.z + Math.sin(ang) * lake.r * 1.25;
        rimMin = Math.min(rimMin, this.sampleGrid(px, pz));
      }
      lake.level = Math.max(4, rimMin - 1.0);
      const r = lake.r;
      const i0 = Math.max(0, Math.floor((lake.x - r * 1.3 + HALF) / CELL));
      const i1 = Math.min(GRID, Math.ceil((lake.x + r * 1.3 + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((lake.z - r * 1.3 + HALF) / CELL));
      const j1 = Math.min(GRID, Math.ceil((lake.z + r * 1.3 + HALF) / CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = -HALF + i * CELL, z = -HALF + j * CELL;
          const wob = 1 + 0.12 * this.noise.noise(x / 60, z / 60);
          const d = Math.hypot(x - lake.x, z - lake.z) / wob;
          const idx = j * VERTS + i;
          if (d < r) {
            const t = d / r;
            const depth = 14 * (1 - t * t);
            H[idx] = Math.min(H[idx], lake.level - 0.6 - depth);
          } else if (d < r * 1.25) {
            const t = (d - r) / (r * 0.25);
            H[idx] = Math.max(H[idx], lake.level + 0.25 + t * 1.5);
          }
        }
      }
    }
    // Biomes
    const B = this.biomes;
    for (let j = 0; j < VERTS; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < VERTS; i++) {
        const x = -HALF + i * CELL;
        const idx = j * VERTS + i;
        B[idx] = this.classify(x, z, H[idx], i, j);
      }
    }
    this.buildMeshes();
  }

  sampleGrid(x, z) {
    const i = clamp(Math.round((x + HALF) / CELL), 0, GRID);
    const j = clamp(Math.round((z + HALF) / CELL), 0, GRID);
    return this.heights[j * VERTS + i];
  }

  slopeAt(i, j) {
    const H = this.heights;
    const i0 = Math.max(0, i - 1), i1 = Math.min(GRID, i + 1);
    const j0 = Math.max(0, j - 1), j1 = Math.min(GRID, j + 1);
    const dx = (H[j * VERTS + i1] - H[j * VERTS + i0]) / ((i1 - i0) * CELL);
    const dz = (H[j1 * VERTS + i] - H[j0 * VERTS + i]) / ((j1 - j0) * CELL);
    return Math.sqrt(dx * dx + dz * dz);
  }

  classify(x, z, h, i, j) {
    if (h < -0.8) return BIOME.OCEAN;
    for (const lake of LAKES) {
      if (Math.hypot(x - lake.x, z - lake.z) < lake.r * 1.45 && h < lake.level + 4) return BIOME.LAKESHORE;
    }
    const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    if (dv < VOLCANO.r * 0.5 && h > 150) return BIOME.VOLCANO;
    if (h < 4.5) return BIOME.BEACH;
    const slope = this.slopeAt(i, j);
    if (h > 170 || slope > 0.9) return BIOME.MOUNTAIN;
    // jungle band: thick across the south/centre, patchy elsewhere
    const jn = this.noise2.fbm(x / 650 + 100, z / 650 + 100, 3);
    const southBias = smoothstep(-600, 600, z) * 0.35;
    if (jn + southBias > 0.12 && h < 140) return BIOME.JUNGLE;
    return BIOME.GRASS;
  }

  biomeAt(x, z) {
    const i = clamp(Math.round((x + HALF) / CELL), 0, GRID);
    const j = clamp(Math.round((z + HALF) / CELL), 0, GRID);
    return this.biomes[j * VERTS + i];
  }

  // Exact height matching the rendered triangulation.
  getHeight(x, z) {
    const fx = (x + HALF) / CELL;
    const fz = (z + HALF) / CELL;
    if (fx < 0 || fz < 0 || fx >= GRID || fz >= GRID) return -60;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const H = this.heights;
    const h00 = H[j * VERTS + i];
    const h10 = H[j * VERTS + i + 1];
    const h01 = H[(j + 1) * VERTS + i];
    const h11 = H[(j + 1) * VERTS + i + 1];
    // triangles: (00, 01, 10) and (01, 11, 10)
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  getNormal(x, z, out = new THREE.Vector3()) {
    const e = 1.5;
    const hl = this.getHeight(x - e, z), hr = this.getHeight(x + e, z);
    const hd = this.getHeight(x, z - e), hu = this.getHeight(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  // Water surface height at a point, or -Infinity if there is no water above the ground.
  waterLevelAt(x, z) {
    for (const lake of LAKES) {
      if (Math.hypot(x - lake.x, z - lake.z) < lake.r * 1.3) return lake.level;
    }
    return SEA_LEVEL;
  }

  isWater(x, z, minDepth = 0.2) {
    return this.waterLevelAt(x, z) - this.getHeight(x, z) > minDepth;
  }

  vertexColor(idx, i, j, out) {
    const h = this.heights[idx];
    const b = this.biomes[idx];
    const x = -HALF + i * CELL, z = -HALF + j * CELL;
    const n = this.noise2.noise(x / 40, z / 40) * 0.5 + 0.5;
    const slope = this.slopeAt(i, j);
    let r, g, bl;
    switch (b) {
      case BIOME.OCEAN: {
        const t = smoothstep(-40, -2, h);
        r = lerp(0.36, 0.78, t); g = lerp(0.34, 0.7, t); bl = lerp(0.28, 0.52, t);
        break;
      }
      case BIOME.BEACH:
        r = 0.86 + n * 0.05; g = 0.78 + n * 0.05; bl = 0.58;
        // blend into grass at the top of the beach
        if (h > 2.5) {
          const t = smoothstep(2.5, 4.5, h);
          r = lerp(r, 0.45, t); g = lerp(g, 0.55, t); bl = lerp(bl, 0.25, t);
        }
        break;
      case BIOME.LAKESHORE:
        r = 0.42 + n * 0.08; g = 0.44 + n * 0.06; bl = 0.28;
        break;
      case BIOME.JUNGLE:
        r = 0.2 + n * 0.07; g = 0.33 + n * 0.08; bl = 0.1;
        break;
      case BIOME.GRASS:
        r = 0.31 + n * 0.09; g = 0.47 + n * 0.08; bl = 0.16;
        break;
      case BIOME.MOUNTAIN: {
        r = 0.46 + n * 0.08; g = 0.44 + n * 0.07; bl = 0.4 + n * 0.05;
        if (h > 300) { const t = smoothstep(300, 420, h); r = lerp(r, 0.62, t); g = lerp(g, 0.6, t); bl = lerp(bl, 0.58, t); }
        break;
      }
      case BIOME.VOLCANO: {
        r = 0.26 + n * 0.06; g = 0.22 + n * 0.05; bl = 0.2 + n * 0.04;
        const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
        if (dv < 130) { const t = smoothstep(130, 60, dv); r = lerp(r, 0.55, t); g = lerp(g, 0.18, t); bl = lerp(bl, 0.08, t); }
        break;
      }
      default:
        r = g = bl = 0.5;
    }
    if (b !== BIOME.OCEAN && b !== BIOME.BEACH && b !== BIOME.VOLCANO && slope > 0.55) {
      const t = smoothstep(0.55, 1.0, slope);
      r = lerp(r, 0.43, t); g = lerp(g, 0.41, t); bl = lerp(bl, 0.37, t);
    }
    out[0] = r; out[1] = g; out[2] = bl;
  }

  normalAt(i, j, out) {
    const H = this.heights;
    const i0 = Math.max(0, i - 1), i1 = Math.min(GRID, i + 1);
    const j0 = Math.max(0, j - 1), j1 = Math.min(GRID, j + 1);
    const dx = (H[j * VERTS + i1] - H[j * VERTS + i0]) / ((i1 - i0) * CELL);
    const dz = (H[j1 * VERTS + i] - H[j0 * VERTS + i]) / ((j1 - j0) * CELL);
    const len = Math.sqrt(dx * dx + 1 + dz * dz);
    out[0] = -dx / len; out[1] = 1 / len; out[2] = -dz / len;
  }

  buildChunkGeometry(ci, cj, step) {
    const n = CHUNK_CELLS / step;
    const vertsSide = n + 1;
    const baseCount = vertsSide * vertsSide;
    const skirtCount = n * 4 + 4;
    const total = baseCount + skirtCount;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const c = [0, 0, 0], nn = [0, 0, 0];
    const gi0 = ci * CHUNK_CELLS, gj0 = cj * CHUNK_CELLS;
    const writeVert = (k, gi, gj, yOffset) => {
      const idx = gj * VERTS + gi;
      const x = -HALF + gi * CELL, z = -HALF + gj * CELL;
      pos[k * 3] = x; pos[k * 3 + 1] = this.heights[idx] + yOffset; pos[k * 3 + 2] = z;
      this.normalAt(gi, gj, nn);
      nor[k * 3] = nn[0]; nor[k * 3 + 1] = nn[1]; nor[k * 3 + 2] = nn[2];
      this.vertexColor(idx, gi, gj, c);
      // colours are authored in sRGB; vertex colours are linear
      col[k * 3] = c[0] ** 2.2; col[k * 3 + 1] = c[1] ** 2.2; col[k * 3 + 2] = c[2] ** 2.2;
      uv[k * 2] = x / 12; uv[k * 2 + 1] = z / 12;
    };
    for (let j = 0; j < vertsSide; j++) {
      for (let i = 0; i < vertsSide; i++) {
        writeVert(j * vertsSide + i, gi0 + i * step, gj0 + j * step, 0);
      }
    }
    const indices = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * vertsSide + i;
        const b = a + 1;
        const d = a + vertsSide;
        const e = d + 1;
        // (00, 01, 10) & (01, 11, 10) — must match getHeight()
        indices.push(a, d, b, d, e, b);
      }
    }
    // skirts: duplicate border vertices pushed down, stitched to the border
    let k = baseCount;
    const border = [];
    for (let i = 0; i <= n; i++) border.push([i, 0]);
    for (let j = 1; j <= n; j++) border.push([n, j]);
    for (let i = n - 1; i >= 0; i--) border.push([i, n]);
    for (let j = n - 1; j >= 1; j--) border.push([0, j]);
    const skirtStart = k;
    for (const [i, j] of border) {
      writeVert(k++, gi0 + i * step, gj0 + j * step, -12);
    }
    for (let s = 0; s < border.length; s++) {
      const [i, j] = border[s];
      const [i2, j2] = border[(s + 1) % border.length];
      const top1 = j * vertsSide + i;
      const top2 = j2 * vertsSide + i2;
      const bot1 = skirtStart + s;
      const bot2 = skirtStart + ((s + 1) % border.length);
      indices.push(top1, bot1, top2, top2, bot1, bot2);
      indices.push(top1, top2, bot1, top2, bot2, bot1); // both windings: skirts are seen from outside only
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, k * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, k * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, k * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, k * 2), 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  buildMeshes() {
    const tex = makeDetailTexture(this.seed);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
    for (let cj = 0; cj < CHUNKS; cj++) {
      for (let ci = 0; ci < CHUNKS; ci++) {
        const hi = new THREE.Mesh(this.buildChunkGeometry(ci, cj, 1), this.material);
        const lo = new THREE.Mesh(this.buildChunkGeometry(ci, cj, 4), this.material);
        hi.receiveShadow = true;
        hi.matrixAutoUpdate = false; lo.matrixAutoUpdate = false;
        lo.visible = false;
        this.group.add(hi, lo);
        const cx = -HALF + (ci + 0.5) * CHUNK_CELLS * CELL;
        const cz = -HALF + (cj + 0.5) * CHUNK_CELLS * CELL;
        this.chunks.push({ hi, lo, cx, cz });
      }
    }
  }

  updateLOD(px, pz, hiDist = 700) {
    for (const c of this.chunks) {
      const d = Math.hypot(c.cx - px, c.cz - pz);
      const useHi = d < hiDist;
      c.hi.visible = useHi;
      c.lo.visible = !useHi;
    }
  }

  // Render a small top-down colour map (used by the in-game map and spawn screen).
  renderMapCanvas(size = 512) {
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = size;
    const ctx = cvs.getContext('2d');
    const img = ctx.createImageData(size, size);
    const c = [0, 0, 0];
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const i = Math.round((px / (size - 1)) * GRID);
        const j = Math.round((py / (size - 1)) * GRID);
        const idx = j * VERTS + i;
        const h = this.heights[idx];
        const x = -HALF + i * CELL, z = -HALF + j * CELL;
        const wl = this.waterLevelAt(x, z);
        let r, g, b;
        if (h < wl) {
          const d = clamp((wl - h) / 50, 0, 1);
          r = lerp(70, 18, d); g = lerp(150, 52, d); b = lerp(175, 100, d);
        } else {
          this.vertexColor(idx, i, j, c);
          const nn = [0, 0, 0];
          this.normalAt(i, j, nn);
          const shade = clamp(0.55 + (nn[0] * -0.5 + nn[2] * -0.5) * 1.2 + nn[1] * 0.3, 0.4, 1.3);
          r = c[0] * 255 * shade; g = c[1] * 255 * shade; b = c[2] * 255 * shade;
        }
        const o = (py * size + px) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cvs;
  }

  // Deterministic random land position inside a lat/lon box with filters.
  findSpot(rng, box, filter, tries = 60) {
    for (let t = 0; t < tries; t++) {
      const lat = lerp(box.lat0, box.lat1, rng());
      const lon = lerp(box.lon0, box.lon1, rng());
      const { x, z } = fromLatLon(lat, lon);
      const h = this.getHeight(x, z);
      if (filter(x, z, h)) return { x, y: h, z };
    }
    return null;
  }
}

function makeDetailTexture(seed) {
  const size = 256;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d');
  const img = ctx.createImageData(size, size);
  const r = mulberry32(seed + 5);
  // periodic value noise: lattice values wrap so the texture tiles seamlessly
  const octave = (period) => {
    const lat = new Float32Array(period * period);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    return (x, y) => {
      const fx = (x / size) * period, fy = (y / size) * period;
      const i0 = Math.floor(fx), j0 = Math.floor(fy);
      const u = fx - i0, v = fy - j0;
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const i1 = (i0 + 1) % period, j1 = (j0 + 1) % period;
      const a = lat[j0 * period + i0], b = lat[j0 * period + i1];
      const c = lat[j1 * period + i0], d = lat[j1 * period + i1];
      return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv;
    };
  };
  const o1 = octave(8), o2 = octave(16), o3 = octave(32), o4 = octave(64);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = o1(x, y) * 0.4 + o2(x, y) * 0.3 + o3(x, y) * 0.2 + o4(x, y) * 0.1 + (r() - 0.5) * 0.12;
      const g = clamp(150 + v * 105, 140, 255);
      const o = (y * size + x) * 4;
      img.data[o] = g; img.data[o + 1] = g; img.data[o + 2] = g; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
