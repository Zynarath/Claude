// Harvestable resource nodes: trees, bushes, boulders, ore deposits and pick-ups.
// Rendered with instancing in 512 m blocks; queried through a 32 m spatial hash.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/three/BufferGeometryUtils.js';
import { mulberry32, clamp, smoothstep } from '../core/util.js';
import { BIOME, HALF, WORLD_SIZE, VOLCANO, HERBIVORE_ISLAND } from './terrain.js';

const HASH_CELL = 32;
const HASH_N = WORLD_SIZE / HASH_CELL;
const BLOCK = 256;
const BLOCK_N = WORLD_SIZE / BLOCK;

// ---------- geometry helpers ----------
function colorize(geo, hex, jitter = 0, rand = Math.random) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const base = new THREE.Color(hex);
  for (let i = 0; i < n; i += 3) {
    const f = 1 + (rand() - 0.5) * jitter;
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = base.r * f; col[(i + k) * 3 + 1] = base.g * f; col[(i + k) * 3 + 2] = base.b * f;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}
function xf(geo, { s = [1, 1, 1], r = [0, 0, 0], p = [0, 0, 0] }) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  geo.applyMatrix4(m);
  return geo;
}
function displace(geo, amount, seed) {
  const r = mulberry32(seed);
  const pos = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, 1 + (r() - 0.5) * amount);
    const f = map.get(key);
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f);
  }
  return geo;
}
const merge = (list) => {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
};

function buildTypeGeometries() {
  const rnd = mulberry32(77);
  const G = {};
  // Palm: bent trunk + drooping fronds
  {
    const parts = [];
    let x = 0, y = 0;
    for (let i = 0; i < 6; i++) {
      const seg = colorize(new THREE.CylinderGeometry(0.22 - i * 0.015, 0.28 - i * 0.015, 1.7, 6), i % 2 ? '#7a6248' : '#8a7058', 0.1, rnd);
      xf(seg, { p: [x, y + 0.85, 0], r: [0, 0, -0.06 * i] });
      parts.push(seg);
      x += Math.sin(0.06 * i) * 1.6; y += 1.6;
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const leaf = colorize(new THREE.BoxGeometry(0.5, 0.06, 3.4), i % 2 ? '#3f7a25' : '#4d8a2d', 0.15, rnd);
      leaf.translate(0, 0, 1.6);
      xf(leaf, { r: [0.55, a, 0], p: [x, y, 0] });
      parts.push(leaf);
    }
    parts.push(xf(colorize(new THREE.SphereGeometry(0.4, 6, 4), '#5a4a2a'), { p: [x, y - 0.2, 0] }));
    G.palm = { geo: merge(parts), lod: merge([
      xf(colorize(new THREE.CylinderGeometry(0.2, 0.28, y, 4), '#7a6248'), { p: [x / 2, y / 2, 0], r: [0, 0, -0.15] }),
      xf(colorize(new THREE.ConeGeometry(3, 1.5, 5), '#3f7a25'), { p: [x, y - 0.3, 0] }),
    ]), trunkR: 0.3, height: y + 1 };
  }
  // Broadleaf (oak-like)
  {
    const parts = [colorize(new THREE.CylinderGeometry(0.35, 0.55, 6, 7), '#5a4430', 0.15, rnd).translate(0, 3, 0)];
    parts.push(xf(colorize(new THREE.CylinderGeometry(0.12, 0.22, 2.5, 5), '#5a4430'), { p: [0.8, 5, 0], r: [0, 0, -0.8] }));
    const blobs = [[0, 7.2, 0, 3.0], [1.8, 6.3, 0.8, 2.2], [-1.6, 6.5, -0.6, 2.3], [0.3, 6.4, -1.8, 2.1], [-0.4, 8.6, 0.4, 2.0]];
    for (const [bx, by, bz, br] of blobs) {
      const g = displace(colorize(new THREE.IcosahedronGeometry(br, 0), rnd() > 0.5 ? '#3d6b22' : '#4a7a2a', 0.18, rnd), 0.3, (bx * 100) | 0);
      parts.push(g.translate(bx, by, bz));
    }
    G.oak = { geo: merge(parts), lod: merge([
      colorize(new THREE.CylinderGeometry(0.35, 0.5, 6, 4), '#5a4430').translate(0, 3, 0),
      colorize(new THREE.IcosahedronGeometry(3.6, 0), '#3d6b22').translate(0, 7.3, 0),
    ]), trunkR: 0.5, height: 10 };
  }
  // Jungle tree: tall, buttress roots, wide umbrella canopy
  {
    const parts = [colorize(new THREE.CylinderGeometry(0.45, 0.7, 14, 7), '#4a3a2a', 0.15, rnd).translate(0, 7, 0)];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      parts.push(xf(colorize(new THREE.BoxGeometry(0.25, 2.2, 1.4), '#4a3a2a'), { p: [Math.cos(a) * 0.7, 1.0, Math.sin(a) * 0.7], r: [0, -a, 0] }));
    }
    const blobs = [[0, 14.5, 0, 4.2, 0.55], [3.2, 13.2, 1.5, 3.0, 0.6], [-3.0, 13.4, -1.2, 3.1, 0.6], [1.0, 13.0, -3.2, 2.8, 0.6], [-1.4, 12.8, 3.0, 2.8, 0.6]];
    for (const [bx, by, bz, br, sy] of blobs) {
      const g = displace(colorize(new THREE.IcosahedronGeometry(br, 0), rnd() > 0.5 ? '#2a5a1a' : '#336a22', 0.2, rnd), 0.3, (by * 33) | 0);
      g.scale(1, sy, 1);
      parts.push(g.translate(bx, by, bz));
    }
    // hanging vines
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2;
      parts.push(colorize(new THREE.BoxGeometry(0.06, 3, 0.06), '#2a4a1a').translate(Math.cos(a) * 2.5, 11, Math.sin(a) * 2.5));
    }
    G.jungle = { geo: merge(parts), lod: merge([
      colorize(new THREE.CylinderGeometry(0.45, 0.7, 14, 4), '#4a3a2a').translate(0, 7, 0),
      colorize(new THREE.IcosahedronGeometry(5, 0), '#2a5a1a').scale(1, 0.55, 1).translate(0, 14, 0),
    ]), trunkR: 0.65, height: 17 };
  }
  // Jungle broadleaf: shorter, bushy rounded canopy
  {
    const parts = [colorize(new THREE.CylinderGeometry(0.3, 0.5, 7, 6), '#54402c', 0.15, rnd).translate(0, 3.5, 0)];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = i === 0 ? 0 : 1.9;
      const g = displace(colorize(new THREE.IcosahedronGeometry(i === 0 ? 2.6 : 1.9, 0), i % 2 ? '#3f7a24' : '#4c8a2c', 0.2, rnd), 0.3, 900 + i);
      parts.push(g.translate(Math.cos(a) * r, 7.5 + (i === 0 ? 1.2 : rnd() * 0.8), Math.sin(a) * r));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = colorize(new THREE.BoxGeometry(0.7, 0.05, 2.2), '#3a7a22', 0.2, rnd).translate(0, 0, 1.1);
      parts.push(xf(leaf, { r: [-0.35, a, 0], p: [0, 0.3, 0] }));
    }
    G.bigleaf = { geo: merge(parts), lod: merge([
      colorize(new THREE.CylinderGeometry(0.3, 0.5, 7, 4), '#54402c').translate(0, 3.5, 0),
      colorize(new THREE.IcosahedronGeometry(3.6, 0), '#3f7a24').scale(1, 0.75, 1).translate(0, 8.2, 0),
    ]), trunkR: 0.5, height: 10 };
  }
  // Pine
  {
    const parts = [colorize(new THREE.CylinderGeometry(0.2, 0.42, 10, 6), '#4a3626', 0.1, rnd).translate(0, 5, 0)];
    for (let i = 0; i < 4; i++) {
      parts.push(colorize(new THREE.ConeGeometry(2.6 - i * 0.55, 3.2, 8), i % 2 ? '#24482a' : '#2a5230', 0.15, rnd).translate(0, 4.3 + i * 1.9, 0));
    }
    G.pine = { geo: merge(parts), lod: merge([
      colorize(new THREE.CylinderGeometry(0.2, 0.4, 5, 4), '#4a3626').translate(0, 2.5, 0),
      colorize(new THREE.ConeGeometry(2.6, 8, 5), '#24482a').translate(0, 7, 0),
    ]), trunkR: 0.4, height: 12 };
  }
  // Berry bush
  {
    const parts = [];
    for (const [bx, by, bz, br] of [[0, 0.55, 0, 0.75], [0.5, 0.45, 0.3, 0.55], [-0.45, 0.45, -0.25, 0.6], [0.1, 0.5, -0.5, 0.5]]) {
      parts.push(displace(colorize(new THREE.IcosahedronGeometry(br, 1), '#3a6a24', 0.25, rnd), 0.3, (br * 999) | 0).translate(bx, by, bz));
    }
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, r = 0.55 + rnd() * 0.3;
      parts.push(colorize(new THREE.SphereGeometry(0.07, 4, 3), ['#c02a2a', '#2a4ad0', '#7a2ad0', '#d0c02a'][i % 4]).translate(Math.cos(a) * r, 0.4 + rnd() * 0.6, Math.sin(a) * r));
    }
    G.bush = { geo: merge(parts), trunkR: 0, height: 1.3 };
  }
  // Fern bush
  {
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const leaf = colorize(new THREE.BoxGeometry(0.35, 0.04, 1.4), i % 2 ? '#3a7a2a' : '#4a8a30', 0.2, rnd).translate(0, 0, 0.7);
      parts.push(xf(leaf, { r: [-0.6, a, 0], p: [0, 0.15, 0] }));
    }
    G.fern = { geo: merge(parts), trunkR: 0, height: 1.0 };
  }
  // Boulders
  const boulder = (hex, seed, extra = []) => {
    const g = displace(colorize(new THREE.IcosahedronGeometry(1.6, 1), hex, 0.18, rnd), 0.35, seed);
    g.scale(1.2, 0.85, 1.0);
    g.translate(0, 0.9, 0);
    return merge([g, ...extra]);
  };
  G.rock = { geo: boulder('#8a8780', 11), trunkR: 1.6, height: 2.4 };
  {
    const veins = [];
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      veins.push(colorize(new THREE.OctahedronGeometry(0.3 + rnd() * 0.2, 0), '#d8c27a').translate(Math.cos(a) * 1.55, 0.6 + rnd() * 1.2, Math.sin(a) * 1.3));
    }
    G.metal = { geo: boulder('#5e5a54', 23, veins), trunkR: 1.6, height: 2.4 };
  }
  {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push(xf(colorize(new THREE.OctahedronGeometry(0.8, 0), '#18161e', 0.2, rnd), { s: [0.6, 1.8, 0.6], r: [0.3 * Math.cos(a), 0, 0.3 * Math.sin(a)], p: [Math.cos(a) * 0.6, 1.1, Math.sin(a) * 0.6] }));
    }
    parts.push(colorize(new THREE.IcosahedronGeometry(1.0, 0), '#2a2622').scale(1.3, 0.5, 1.3).translate(0, 0.3, 0));
    G.obsidian = { geo: merge(parts), trunkR: 1.3, height: 2.4 };
  }
  {
    const parts = [colorize(new THREE.IcosahedronGeometry(1.0, 0), '#6a6a72').scale(1.3, 0.5, 1.3).translate(0, 0.3, 0)];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const h = 1 + rnd() * 1.4;
      parts.push(xf(colorize(new THREE.CylinderGeometry(0, 0.25, h, 5), '#a8e0ff', 0.25, rnd), { r: [0.4 * Math.cos(a), 0, 0.4 * Math.sin(a)], p: [Math.cos(a) * 0.5, 0.4 + h / 2, Math.sin(a) * 0.5] }));
    }
    G.crystal = { geo: merge(parts), trunkR: 1.2, height: 2.2 };
  }
  {
    const spots = [];
    for (let i = 0; i < 8; i++) {
      const a = rnd() * Math.PI * 2;
      spots.push(colorize(new THREE.SphereGeometry(0.35, 5, 4), '#050505').scale(1, 0.4, 1).translate(Math.cos(a) * 1.5, 0.7 + rnd(), Math.sin(a) * 1.25));
    }
    G.oil = { geo: boulder('#2a2826', 41, spots), trunkR: 1.6, height: 2.4 };
  }
  G.pebble = { geo: merge([displace(colorize(new THREE.IcosahedronGeometry(0.2, 1), '#9a9890', 0.2, rnd), 0.35, 5).scale(1.1, 0.75, 1).translate(0, 0.1, 0)]), trunkR: 0, height: 0.3 };
  G.pearl = { geo: merge([
    colorize(new THREE.SphereGeometry(0.35, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#8a7a9a').scale(1, 0.5, 1),
    colorize(new THREE.SphereGeometry(0.1, 5, 4), '#f0f0f0').translate(0, 0.12, 0),
  ]), trunkR: 0, height: 0.3 };
  return G;
}

// Node kind metadata
export const NODE_KINDS = {
  palm: { cls: 'tree', hp: 120, respawn: 900, collide: true },
  oak: { cls: 'tree', hp: 160, respawn: 900, collide: true },
  jungle: { cls: 'tree', hp: 200, respawn: 900, collide: true },
  bigleaf: { cls: 'tree', hp: 150, respawn: 900, collide: true },
  pine: { cls: 'tree', hp: 150, respawn: 900, collide: true },
  bush: { cls: 'bush', hp: 3, respawn: 480, collide: false },
  fern: { cls: 'bush', hp: 2, respawn: 480, collide: false },
  rock: { cls: 'rock', hp: 140, respawn: 900, collide: true },
  metal: { cls: 'metal', hp: 140, respawn: 1200, collide: true },
  obsidian: { cls: 'obsidian', hp: 100, respawn: 1200, collide: true },
  crystal: { cls: 'crystal', hp: 90, respawn: 1200, collide: true },
  oil: { cls: 'oil', hp: 110, respawn: 1200, collide: true },
  pebble: { cls: 'pebble', hp: 1, respawn: 300, collide: false },
  pearl: { cls: 'pearl', hp: 1, respawn: 600, collide: false },
};

// Yields per hit by tool family (fractional values accumulate).
export const YIELDS = {
  tree: { fists: { thatch: 1.1, wood: 0.35 }, pick: { thatch: 3.6, wood: 1.0 }, hatchet: { wood: 4.2, thatch: 0.7 } },
  rock: { fists: { stone: 0.25 }, pick: { flint: 2.6, stone: 0.9 }, hatchet: { stone: 3.6, flint: 0.7 } },
  metal: { fists: {}, pick: { metal: 2.2, stone: 0.7 }, hatchet: { stone: 2.8, metal: 0.3 } },
  obsidian: { fists: {}, pick: { obsidian: 1.4, stone: 0.4 }, hatchet: { stone: 2.0, obsidian: 0.25 } },
  crystal: { fists: {}, pick: { crystal: 1.4, stone: 0.3 }, hatchet: { stone: 1.6, crystal: 0.2 } },
  oil: { fists: {}, pick: { oil: 1.5, stone: 0.5 }, hatchet: { stone: 2.4, oil: 0.2 } },
};

export class Resources {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.types = buildTypeGeometries();
    this.nodes = [];
    this.hash = Array.from({ length: HASH_N * HASH_N }, () => []);
    this.blocks = []; // per block: { meshes: {kind: {full, lod}} , cx, cz }
    this.windUniform = { value: 0 };
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.foliageMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.foliageMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = this.windUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
            float sway = max(0.0, position.y - 2.0) * 0.012;
            transformed.x += sin(uWind * 1.3 + ph) * sway;
            transformed.z += cos(uWind * 1.1 + ph) * sway;
          #endif`);
    };
    this.scatter();
    this.buildInstances();
    this.tmpMat = new THREE.Matrix4();
    this.respawnTimer = 0;
    this.clock = 0;
  }

  scatter() {
    const T = this.terrain;
    const rand = mulberry32(T.seed + 1234);
    const add = (kind, x, z, extra = {}) => {
      const y = T.getHeight(x, z);
      const meta = NODE_KINDS[kind];
      const s = extra.scale || (0.75 + rand() * 0.6);
      const typ = this.types[kind];
      const node = {
        id: this.nodes.length, kind, cls: meta.cls, x, y, z,
        rot: rand() * Math.PI * 2, scale: s,
        radius: typ.trunkR * s, height: typ.height * s,
        hp: meta.hp * s, maxHp: meta.hp * s, depleted: false, respawnAt: 0, acc: {},
      };
      this.nodes.push(node);
      const hi = clamp(Math.floor((x + HALF) / HASH_CELL), 0, HASH_N - 1);
      const hj = clamp(Math.floor((z + HALF) / HASH_CELL), 0, HASH_N - 1);
      this.hash[hj * HASH_N + hi].push(node);
      return node;
    };
    const slopeOK = (x, z, max) => {
      const n = T.getNormal(x, z);
      return n.y > max;
    };
    const jitterGrid = (spacing, fn) => {
      for (let gz = -HALF + spacing / 2; gz < HALF; gz += spacing) {
        for (let gx = -HALF + spacing / 2; gx < HALF; gx += spacing) {
          const x = gx + (rand() - 0.5) * spacing;
          const z = gz + (rand() - 0.5) * spacing;
          fn(x, z);
        }
      }
    };
    const clusterNoise = (x, z) => T.noise3.noise(x / 160 + 50, z / 160 + 50) * 0.5 + 0.5;
    const onHerbIsland = (x, z) => Math.hypot(x - HERBIVORE_ISLAND.x, z - HERBIVORE_ISLAND.z) < HERBIVORE_ISLAND.r * 1.5;

    // Trees
    jitterGrid(11, (x, z) => {
      const h = T.getHeight(x, z);
      if (h < 1.2 || T.isWater(x, z, 0)) return;
      const b = T.biomeAt(x, z);
      const cl = clusterNoise(x, z);
      let kind = null, p = 0;
      switch (b) {
        case BIOME.BEACH: kind = 'palm'; p = h > 1.8 ? 0.07 : 0; break;
        case BIOME.JUNGLE: { const r = rand(); kind = r < 0.42 ? 'jungle' : r < 0.85 ? 'bigleaf' : 'palm'; p = 0.34 + cl * 0.25; break; }
        case BIOME.GRASS: kind = h > 110 ? 'pine' : 'oak'; p = cl > 0.62 ? 0.32 : 0.035; break;
        case BIOME.LAKESHORE: kind = 'oak'; p = 0.12; break;
        case BIOME.MOUNTAIN: kind = 'pine'; p = h < 260 ? 0.12 * cl : 0; break;
        default: p = 0;
      }
      if (onHerbIsland(x, z) && kind) { kind = 'oak'; p = Math.min(p, 0.08); }
      if (kind && rand() < p && slopeOK(x, z, 0.75)) add(kind, x, z, { scale: 0.8 + rand() * 0.5 });
    });
    // Bushes & ferns
    jitterGrid(13, (x, z) => {
      const h = T.getHeight(x, z);
      if (h < 1.5 || T.isWater(x, z, 0)) return;
      const b = T.biomeAt(x, z);
      const p = { [BIOME.JUNGLE]: 0.3, [BIOME.GRASS]: 0.12, [BIOME.LAKESHORE]: 0.25, [BIOME.BEACH]: 0.04, [BIOME.MOUNTAIN]: 0.03 }[b] || 0;
      if (rand() < p && slopeOK(x, z, 0.7)) add(b === BIOME.JUNGLE && rand() < 0.45 ? 'fern' : 'bush', x, z, { scale: 0.8 + rand() * 0.5 });
    });
    // Boulders and ore
    jitterGrid(19, (x, z) => {
      const h = T.getHeight(x, z);
      if (h < 0.5 || T.isWater(x, z, 0.5)) return;
      const b = T.biomeAt(x, z);
      const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
      let kind = null, p = 0;
      if (b === BIOME.VOLCANO || (dv < VOLCANO.r * 0.55 && h > 100)) {
        const r = rand();
        kind = r < 0.45 ? 'obsidian' : r < 0.75 ? 'metal' : 'rock';
        p = 0.22;
      } else if (b === BIOME.MOUNTAIN) {
        const r = rand();
        if (h > 250) kind = r < 0.3 ? 'crystal' : r < 0.7 ? 'metal' : 'rock';
        else if (h > 120) kind = r < 0.4 ? 'metal' : 'rock';
        else kind = r < 0.1 ? 'metal' : 'rock';
        p = 0.2;
      } else if (b === BIOME.BEACH) {
        kind = z < -1000 && rand() < 0.5 ? 'oil' : 'rock';
        p = z < -1000 ? 0.06 : 0.025;
      } else if (b === BIOME.GRASS || b === BIOME.LAKESHORE) {
        kind = 'rock'; p = 0.06 + smoothstep(40, 120, h) * 0.08;
      } else if (b === BIOME.JUNGLE) {
        kind = 'rock'; p = 0.03;
      }
      if (kind && rand() < p) add(kind, x, z, { scale: 0.7 + rand() * 0.7 });
    });
    // Small stones (picked up with E) — plentiful on beaches and near boulders
    jitterGrid(9, (x, z) => {
      const h = T.getHeight(x, z);
      if (h < 0.3 || T.isWater(x, z, 0.1)) return;
      const b = T.biomeAt(x, z);
      const p = { [BIOME.BEACH]: 0.07, [BIOME.GRASS]: 0.03, [BIOME.JUNGLE]: 0.02, [BIOME.LAKESHORE]: 0.05, [BIOME.MOUNTAIN]: 0.04, [BIOME.VOLCANO]: 0.02 }[b] || 0;
      if (rand() < p) add('pebble', x, z, { scale: 0.8 + rand() * 0.5 });
    });
    // Silica pearls on shallow sea floor
    jitterGrid(30, (x, z) => {
      const h = T.getHeight(x, z);
      if (h > -3 || h < -22) return;
      if (rand() < 0.06) add('pearl', x, z, { scale: 1 });
    });
  }

  buildInstances() {
    // bucket nodes per block & kind
    const buckets = new Map();
    for (const n of this.nodes) {
      const bi = clamp(Math.floor((n.x + HALF) / BLOCK), 0, BLOCK_N - 1);
      const bj = clamp(Math.floor((n.z + HALF) / BLOCK), 0, BLOCK_N - 1);
      const key = `${bi},${bj},${n.kind}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(n);
    }
    for (let bj = 0; bj < BLOCK_N; bj++) {
      for (let bi = 0; bi < BLOCK_N; bi++) {
        this.blocks.push({ bi, bj, cx: -HALF + (bi + 0.5) * BLOCK, cz: -HALF + (bj + 0.5) * BLOCK, meshes: [] });
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const [key, list] of buckets) {
      const [bi, bj, kind] = key.split(',');
      const block = this.blocks[Number(bj) * BLOCK_N + Number(bi)];
      const typ = this.types[kind];
      const isTree = NODE_KINDS[kind].cls === 'tree';
      const mat = isTree || NODE_KINDS[kind].cls === 'bush' ? this.foliageMaterial : this.material;
      const full = new THREE.InstancedMesh(typ.geo, mat, list.length);
      full.castShadow = isTree || ['rock', 'metal', 'obsidian', 'crystal', 'oil'].includes(kind);
      full.receiveShadow = false;
      const lod = typ.lod ? new THREE.InstancedMesh(typ.lod, this.material, list.length) : null;
      list.forEach((n, i) => {
        e.set(0, n.rot, 0);
        q.setFromEuler(e);
        v.set(n.x, n.y - (isTree ? 0.3 : 0.15), n.z);
        sc.setScalar(n.scale);
        m4.compose(v, q, sc);
        full.setMatrixAt(i, m4);
        if (lod) lod.setMatrixAt(i, m4);
        n.mesh = full; n.lodMesh = lod; n.index = i;
        n.matrix = m4.clone();
      });
      full.computeBoundingSphere();
      this.scene.add(full);
      if (lod) {
        lod.computeBoundingSphere();
        lod.visible = false;
        this.scene.add(lod);
      }
      block.meshes.push({ kind, full, lod, maxDist: isTree ? 1300 : NODE_KINDS[kind].cls === 'bush' ? 380 : kind === 'pebble' || kind === 'pearl' ? 160 : 600 });
    }
  }

  setNodeVisible(n, visible) {
    if (visible) {
      n.mesh.setMatrixAt(n.index, n.matrix);
      if (n.lodMesh) n.lodMesh.setMatrixAt(n.index, n.matrix);
    } else {
      this.tmpMat.makeScale(0, 0, 0);
      n.mesh.setMatrixAt(n.index, this.tmpMat);
      if (n.lodMesh) n.lodMesh.setMatrixAt(n.index, this.tmpMat);
    }
    n.mesh.instanceMatrix.needsUpdate = true;
    if (n.lodMesh) n.lodMesh.instanceMatrix.needsUpdate = true;
  }

  deplete(n, respawnMult = 1) {
    n.depleted = true;
    n.respawnAt = this.clock + NODE_KINDS[n.kind].respawn * respawnMult * (0.8 + Math.random() * 0.4);
    this.setNodeVisible(n, false);
  }

  // Query nodes within radius (2D)
  query(x, z, radius, out = []) {
    out.length = 0;
    const i0 = clamp(Math.floor((x - radius + HALF) / HASH_CELL), 0, HASH_N - 1);
    const i1 = clamp(Math.floor((x + radius + HALF) / HASH_CELL), 0, HASH_N - 1);
    const j0 = clamp(Math.floor((z - radius + HALF) / HASH_CELL), 0, HASH_N - 1);
    const j1 = clamp(Math.floor((z + radius + HALF) / HASH_CELL), 0, HASH_N - 1);
    const r2 = radius * radius;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (const n of this.hash[j * HASH_N + i]) {
          if (n.depleted) continue;
          const dx = n.x - x, dz = n.z - z;
          if (dx * dx + dz * dz <= r2) out.push(n);
        }
      }
    }
    return out;
  }

  // Ray test against node bounds. Returns { node, dist } or null.
  raycast(origin, dir, maxDist) {
    const mid = { x: origin.x + dir.x * maxDist * 0.5, z: origin.z + dir.z * maxDist * 0.5 };
    const list = this.query(mid.x, mid.z, maxDist * 0.5 + 6, []);
    let best = null;
    for (const n of list) {
      let t = null;
      if (NODE_KINDS[n.kind].cls === 'tree') {
        t = rayCylinder(origin, dir, n.x, n.z, n.radius + 0.25, n.y - 1, n.y + n.height * 0.7);
      } else {
        const { cy, r } = nodeSphere(n);
        t = raySphere(origin, dir, n.x, cy, n.z, r);
      }
      if (t !== null && t <= maxDist && (!best || t < best.dist)) best = { node: n, dist: t };
    }
    return best;
  }

  // Push a circle (x,z,r) out of solid nodes. Returns corrected {x,z}.
  collide(x, z, r, y) {
    const list = this.query(x, z, r + 4, this._tmpList || (this._tmpList = []));
    for (const n of list) {
      if (!NODE_KINDS[n.kind].collide) continue;
      if (y !== undefined && y > n.y + n.height * 0.85) continue;
      const nr = NODE_KINDS[n.kind].cls === 'tree' ? n.radius : n.radius * 0.95;
      const dx = x - n.x, dz = z - n.z;
      const d = Math.hypot(dx, dz);
      const min = nr + r;
      if (d < min && d > 1e-4) {
        x = n.x + (dx / d) * min;
        z = n.z + (dz / d) * min;
      }
    }
    return { x, z };
  }

  // Height of the top of solid rocks at a point (lets you stand on boulders).
  surfaceAt(x, z, footY) {
    let top = -Infinity;
    const list = this.query(x, z, 4, this._tmpList2 || (this._tmpList2 = []));
    for (const n of list) {
      const cls = NODE_KINDS[n.kind].cls;
      if (cls === 'tree' || !NODE_KINDS[n.kind].collide) continue;
      const d = Math.hypot(x - n.x, z - n.z);
      if (d < n.radius * 0.7) {
        const h = n.y + n.height * 0.9 * Math.sqrt(1 - (d / (n.radius * 0.7)) ** 2);
        if (h <= footY + 0.6) top = Math.max(top, h);
      }
    }
    return top;
  }

  update(dt, camPos, canRespawn) {
    this.clock += dt;
    this.windUniform.value += dt;
    // LOD / distance culling per block
    for (const b of this.blocks) {
      const d = Math.max(0, Math.hypot(b.cx - camPos.x, b.cz - camPos.z) - BLOCK * 0.6);
      for (const m of b.meshes) {
        if (m.lod) {
          m.full.visible = d < 200;
          m.lod.visible = !m.full.visible && d < m.maxDist;
        } else {
          m.full.visible = d < m.maxDist;
        }
      }
    }
    // respawn
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 5;
      for (const n of this.nodes) {
        if (!n.depleted || n.respawnAt > this.clock) continue;
        if (Math.hypot(n.x - camPos.x, n.z - camPos.z) < 40) continue;
        if (canRespawn && !canRespawn(n)) { n.respawnAt = this.clock + 120; continue; }
        n.depleted = false;
        n.hp = n.maxHp;
        n.acc = {};
        this.setNodeVisible(n, true);
      }
    }
  }

  serialize() {
    return this.nodes.filter((n) => n.depleted).map((n) => [n.id, Math.round(n.respawnAt - this.clock)]);
  }

  restore(list) {
    if (!Array.isArray(list)) return;
    for (const [id, remain] of list) {
      const n = this.nodes[id];
      if (!n) continue;
      n.depleted = true;
      n.respawnAt = this.clock + remain;
      this.setNodeVisible(n, false);
    }
  }
}

export function nodeSphere(n) {
  const cls = NODE_KINDS[n.kind].cls;
  if (cls === 'bush') return { cy: n.y + 0.6 * n.scale, r: 0.95 * n.scale };
  if (cls === 'pebble' || cls === 'pearl') return { cy: n.y + 0.1, r: 0.55 };
  return { cy: n.y + n.height * 0.4, r: n.radius * 1.05 };
}

export function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t >= 0 ? t : null;
}

export function rayCylinder(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return null;
  const b = ox * d.x + oz * d.z;
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = (-b - s) / a;
  if (t < 0) t = (-b + s) / a;
  if (t < 0) return null;
  const y = o.y + d.y * t;
  if (y < y0 || y > y1) return null;
  return t;
}
