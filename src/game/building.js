// Structures: snapping foundations/walls/ceilings/doors, deployables (campfire, boxes, beds,
// crafting stations), their colliders, fuel/cooking/smelting, and lights.
import * as THREE from 'three';
import { ITEMS, FUEL, FORGE_FUEL } from '../data/items.js';
import { Inventory } from './inventory.js';
import { clamp, uid } from '../core/util.js';

const SNAP = 3; // foundation size (m)
const WALL_H = 3;
const FOUND_T = 0.5;
const HASH = 16;

const SHAPE_OF = (id) => ITEMS[id].icon.shape;
const tierOf = (id) => id.startsWith('thatch') ? 'thatch' : id.startsWith('wood') ? 'wood' : id.startsWith('stone') || id === 'reinforced_door' ? 'stone' : id.startsWith('metal') ? 'metal' : 'wood';
const HP = { thatch: 400, wood: 2500, stone: 8000, metal: 20000 };

export const STATION_OF = {
  campfire: 'campfire', refining_forge: 'forge', mortar_and_pestle: 'mortar', smithy: 'smithy',
};
const CONTAINER_SLOTS = {
  storage_box: 25, large_storage_box: 60, campfire: 10, refining_forge: 20, mortar_and_pestle: 50, smithy: 100, preserving_bin: 20,
};

// ---------- procedural textures ----------
function canvasTex(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeMaterials() {
  const thatch = canvasTex((ctx, s) => {
    ctx.fillStyle = '#a88a42'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i++) {
      ctx.strokeStyle = ['#c8a85a', '#8a6c30', '#d8c070', '#7a5c28'][i % 4];
      ctx.lineWidth = 1 + Math.random();
      const x = Math.random() * s, y = Math.random() * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 6, y + 14 + Math.random() * 10); ctx.stroke();
    }
    for (let y = 0; y < s; y += 32) { ctx.fillStyle = 'rgba(60,40,10,0.35)'; ctx.fillRect(0, y, s, 3); }
  });
  const wood = canvasTex((ctx, s) => {
    ctx.fillStyle = '#7a5432'; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = `hsl(28, 40%, ${26 + Math.random() * 10}%)`;
      ctx.fillRect(x + 1, 0, 14, s);
      for (let k = 0; k < 6; k++) { ctx.fillStyle = 'rgba(40,20,5,0.25)'; ctx.fillRect(x + 2 + Math.random() * 12, Math.random() * s, 1, 20 + Math.random() * 30); }
      ctx.fillStyle = '#3a2412'; ctx.fillRect(x, 0, 1.5, s);
    }
  });
  const stone = canvasTex((ctx, s) => {
    ctx.fillStyle = '#5a5a56'; ctx.fillRect(0, 0, s, s);
    const rows = 6, h = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 16 : 0;
      for (let x = -32 + off; x < s; x += 32) {
        ctx.fillStyle = `hsl(40, 5%, ${50 + Math.random() * 14}%)`;
        ctx.fillRect(x + 2, r * h + 2, 28, h - 4);
      }
    }
  });
  const metal = canvasTex((ctx, s) => {
    ctx.fillStyle = '#7a8088'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#4a5058'; ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.fillStyle = '#9aa0a8';
    for (const [x, y] of [[10, 10], [s - 10, 10], [10, s - 10], [s - 10, s - 10]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
  });
  const M = (map, color = '#ffffff') => new THREE.MeshLambertMaterial({ map, color });
  return {
    thatch: M(thatch), wood: M(wood), stone: M(stone), metal: M(metal),
    plainWood: new THREE.MeshLambertMaterial({ color: '#6a4a2a' }),
    darkWood: new THREE.MeshLambertMaterial({ color: '#3a2a1a' }),
    rock: new THREE.MeshLambertMaterial({ color: '#6a6a66', flatShading: true }),
    cloth: new THREE.MeshLambertMaterial({ color: '#4a7a3a' }),
    hide: new THREE.MeshLambertMaterial({ color: '#9a6a44' }),
    iron: new THREE.MeshLambertMaterial({ color: '#4a4e54' }),
    fire: new THREE.MeshBasicMaterial({ color: '#ffaa33', transparent: true, opacity: 0.85 }),
    ember: new THREE.MeshBasicMaterial({ color: '#ff5a1a' }),
    ghostOk: new THREE.MeshBasicMaterial({ color: '#3aff7a', transparent: true, opacity: 0.35, depthWrite: false }),
    ghostBad: new THREE.MeshBasicMaterial({ color: '#ff3a3a', transparent: true, opacity: 0.35, depthWrite: false }),
  };
}

function boxMesh(w, h, d, mat, x = 0, y = 0, z = 0, uvScale = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  // world-scaled UVs so textures don't stretch
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const sx = ax > 0.5 ? d : w;
    const sy = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * sx / (3 * uvScale), uv.getY(i) * sy / (3 * uvScale));
  }
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Local-space collision boxes per shape: [cx, cy, cz, hx, hy, hz] with y measured from structure origin.
function collidersFor(s) {
  switch (s.shape) {
    case 'foundation': return [[0, -FOUND_T / 2 - 1, 0, SNAP / 2, FOUND_T / 2 + 1, SNAP / 2]];
    case 'wall': return [[0, WALL_H / 2, 0, SNAP / 2, WALL_H / 2, 0.15]];
    case 'doorframe': return [[-1.05, WALL_H / 2, 0, 0.45, WALL_H / 2, 0.15], [1.05, WALL_H / 2, 0, 0.45, WALL_H / 2, 0.15], [0, 2.65, 0, 0.6, 0.35, 0.15]];
    case 'door': return s.open ? [] : [[0, 1.15, 0, 0.6, 1.15, 0.08]];
    case 'ceiling': return [[0, -0.1, 0, SNAP / 2, 0.1, SNAP / 2]];
    case 'ramp': return [];
    case 'box': return [[0, 0.35, 0, 0.5, 0.35, 0.35]];
    case 'forge': return [[0, 0.7, 0, 0.75, 0.7, 0.75]];
    case 'smithy': return [[0, 0.5, 0, 1.0, 0.5, 0.6]];
    case 'mortar': return [[0, 0.3, 0, 0.35, 0.3, 0.35]];
    case 'bed': return [[0, 0.25, 0, 0.6, 0.25, 1.1]];
    default: return [];
  }
}

export class Building {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.mats = makeMaterials();
    this.list = [];
    this.hash = new Map();
    this.ghost = null;
    this.ghostKey = null;
    this.placeRot = 0;
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xff9a40, 0, 18, 1.6);
      this.scene.add(l);
      this.lights.push(l);
    }
    this.fireTime = 0;
  }

  // ---------- spatial hash ----------
  key(x, z) { return `${Math.floor(x / HASH)},${Math.floor(z / HASH)}`; }
  hashAdd(s) {
    const k = this.key(s.x, s.z);
    if (!this.hash.has(k)) this.hash.set(k, []);
    this.hash.get(k).push(s);
    s._hk = k;
  }
  hashRemove(s) {
    const arr = this.hash.get(s._hk);
    if (arr) { const i = arr.indexOf(s); if (i >= 0) arr.splice(i, 1); }
  }
  near(x, z, r, out = []) {
    out.length = 0;
    const i0 = Math.floor((x - r) / HASH), i1 = Math.floor((x + r) / HASH);
    const j0 = Math.floor((z - r) / HASH), j1 = Math.floor((z + r) / HASH);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const arr = this.hash.get(`${i},${j}`);
      if (arr) for (const s of arr) if (Math.abs(s.x - x) <= r + 2 && Math.abs(s.z - z) <= r + 2) out.push(s);
    }
    return out;
  }
  nearStructure(x, z, r) { return this.near(x, z, r, []).length > 0; }

  // ---------- mesh building ----------
  buildMesh(s) {
    const g = new THREE.Group();
    const tier = tierOf(s.type);
    const tm = this.mats[tier];
    const M = this.mats;
    switch (s.shape) {
      case 'foundation': {
        g.add(boxMesh(SNAP, FOUND_T, SNAP, tm, 0, -FOUND_T / 2, 0));
        // support pillars down into the ground
        for (const [px, pz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) g.add(boxMesh(0.35, 3, 0.35, tier === 'thatch' ? M.wood : tm, px, -FOUND_T - 1.5, pz));
        break;
      }
      case 'wall': g.add(boxMesh(SNAP, WALL_H, 0.3, tm, 0, WALL_H / 2, 0)); break;
      case 'doorframe':
        g.add(boxMesh(0.9, WALL_H, 0.3, tm, -1.05, WALL_H / 2, 0));
        g.add(boxMesh(0.9, WALL_H, 0.3, tm, 1.05, WALL_H / 2, 0));
        g.add(boxMesh(1.2, 0.7, 0.3, tm, 0, 2.65, 0));
        break;
      case 'door': {
        const hinge = new THREE.Group();
        hinge.position.set(-0.6, 0, 0);
        hinge.add(boxMesh(1.18, 2.28, 0.12, tm, 0.59, 1.15, 0));
        const knob = boxMesh(0.08, 0.08, 0.2, M.iron, 1.0, 1.1, 0);
        hinge.add(knob);
        g.add(hinge);
        s._hinge = hinge;
        break;
      }
      case 'ceiling':
        g.add(boxMesh(SNAP, 0.2, SNAP, tm, 0, -0.1, 0));
        if (tier === 'thatch') { const r = boxMesh(SNAP + 0.3, 0.25, SNAP + 0.3, tm, 0, 0.05, 0); r.rotation.z = 0.02; g.add(r); }
        break;
      case 'ramp': {
        const r = boxMesh(SNAP, 0.25, Math.hypot(SNAP, WALL_H), tm, 0, WALL_H / 2, 0);
        r.rotation.x = -Math.atan2(WALL_H, SNAP);
        g.add(r);
        break;
      }
      case 'campfire': {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), M.rock);
          st.position.set(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55);
          st.castShadow = true;
          g.add(st);
        }
        for (let i = 0; i < 4; i++) {
          const log = boxMesh(0.12, 0.12, 0.9, M.plainWood, 0, 0.12, 0);
          log.rotation.y = (i / 4) * Math.PI;
          log.rotation.x = 0.25;
          g.add(log);
        }
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 6), M.fire);
        flame.position.y = 0.5;
        flame.visible = false;
        g.add(flame);
        s._flame = flame;
        break;
      }
      case 'torch': {
        g.add(boxMesh(0.12, 2.2, 0.12, M.plainWood, 0, 1.1, 0));
        g.add(boxMesh(0.25, 0.3, 0.25, M.darkWood, 0, 2.25, 0));
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.45, 6), M.fire);
        flame.position.y = 2.6;
        flame.visible = false;
        g.add(flame);
        s._flame = flame;
        break;
      }
      case 'box': {
        const large = s.type === 'large_storage_box';
        const bin = s.type === 'preserving_bin';
        const sc = large ? 1.35 : 1;
        g.add(boxMesh(1.0 * sc, 0.6 * sc, 0.7 * sc, bin ? M.stone : M.wood, 0, 0.3 * sc, 0));
        g.add(boxMesh(1.04 * sc, 0.1, 0.74 * sc, bin ? M.iron : M.darkWood, 0, 0.62 * sc, 0));
        break;
      }
      case 'bag': {
        const m = boxMesh(0.8, 0.15, 2.0, M.cloth, 0, 0.08, 0);
        g.add(m);
        g.add(boxMesh(0.6, 0.12, 0.35, M.hide, 0, 0.2, -0.75));
        break;
      }
      case 'bed': {
        g.add(boxMesh(1.2, 0.3, 2.2, M.wood, 0, 0.15, 0));
        g.add(boxMesh(1.1, 0.12, 2.0, M.thatch, 0, 0.36, 0));
        g.add(boxMesh(0.8, 0.12, 0.4, M.hide, 0, 0.46, -0.75));
        g.add(boxMesh(1.2, 0.8, 0.12, M.wood, 0, 0.4, -1.1));
        break;
      }
      case 'mortar': {
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.25, 0.45, 8, 1, true), M.rock);
        bowl.position.y = 0.25;
        bowl.material.side = THREE.DoubleSide;
        g.add(bowl);
        g.add(boxMesh(0.5, 0.06, 0.5, M.rock, 0, 0.03, 0));
        const pestle = boxMesh(0.08, 0.6, 0.08, M.hide, 0.1, 0.45, 0);
        pestle.rotation.z = 0.4;
        g.add(pestle);
        break;
      }
      case 'forge': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.4, 8), M.rock);
        body.position.y = 0.7;
        body.castShadow = true;
        g.add(body);
        g.add(boxMesh(0.5, 0.4, 0.2, M.darkWood, 0, 0.4, 0.7));
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 6), M.fire);
        flame.position.set(0, 0.45, 0.72);
        flame.visible = false;
        g.add(flame);
        s._flame = flame;
        break;
      }
      case 'smithy': {
        g.add(boxMesh(2.0, 0.15, 1.2, M.wood, 0, 0.85, 0));
        for (const [x, z] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]]) g.add(boxMesh(0.12, 0.85, 0.12, M.wood, x, 0.42, z));
        g.add(boxMesh(0.6, 0.3, 0.3, M.iron, -0.4, 1.07, 0));
        g.add(boxMesh(0.3, 0.1, 0.2, M.iron, 0.4, 0.97, 0.2));
        break;
      }
      default:
        g.add(boxMesh(1, 1, 1, tm, 0, 0.5, 0));
    }
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.rot;
    g.traverse((o) => { o.userData.structure = s; });
    return g;
  }

  create(type, x, y, z, rot, extra = {}) {
    const s = {
      id: extra.id || uid(), type, shape: SHAPE_OF(type), x, y, z, rot,
      tier: tierOf(type), open: false, lit: false, fuelLeft: 0, cook: {}, ...extra,
    };
    s.maxHp = HP[s.tier] || 1000;
    s.hp = extra.hp ?? s.maxHp;
    const slots = CONTAINER_SLOTS[type];
    if (slots) {
      s.inventory = new Inventory(slots, { spoilMult: type === 'preserving_bin' ? 4 : 1 });
      if (extra.inventory) s.inventory.restore(extra.inventory);
    }
    s.station = STATION_OF[type] || null;
    s.mesh = this.buildMesh(s);
    if (s.shape === 'door' && s.open && s._hinge) s._hinge.rotation.y = -Math.PI / 2;
    this.scene.add(s.mesh);
    this.list.push(s);
    this.hashAdd(s);
    this.updateColliders(s);
    return s;
  }

  remove(s) {
    this.scene.remove(s.mesh);
    s.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.hashRemove(s);
    const i = this.list.indexOf(s);
    if (i >= 0) this.list.splice(i, 1);
    // anything resting on top of a removed foundation/ceiling collapses
    if (['foundation', 'ceiling', 'wall', 'doorframe'].includes(s.shape)) {
      for (const o of [...this.list]) {
        if (o === s) continue;
        if (o.shape === 'door' && Math.hypot(o.x - s.x, o.z - s.z) < 0.3 && Math.abs(o.y - s.y) < 0.2) this.remove(o);
      }
    }
  }

  updateColliders(s) {
    const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
    s.colliders = collidersFor(s).map(([cx, cy, cz, hx, hy, hz]) => ({
      x: s.x + cx * cos + cz * sin, z: s.z - cx * sin + cz * cos,
      y0: s.y + cy - hy, y1: s.y + cy + hy, hx, hz, rot: s.rot,
    }));
  }

  toggleDoor(s) {
    s.open = !s.open;
    if (s._hinge) s._hinge.rotation.y = s.open ? -Math.PI / 2 : 0;
    this.updateColliders(s);
    this.game.audio.play('door');
  }

  // ---------- world queries ----------
  // Highest walkable surface at (x,z) not above footY + step.
  groundAt(x, z, footY, step = 0.6) {
    let top = -Infinity;
    for (const s of this.near(x, z, 4, this._tmp || (this._tmp = []))) {
      if (s.shape === 'foundation' || s.shape === 'ceiling') {
        if (inRect(x, z, s, SNAP / 2 + 0.05, SNAP / 2 + 0.05) && s.y <= footY + step) top = Math.max(top, s.y);
      } else if (s.shape === 'ramp') {
        const l = toLocal(x, z, s);
        if (Math.abs(l.x) <= SNAP / 2 && Math.abs(l.z) <= SNAP / 2) {
          const h = s.y + ((l.z + SNAP / 2) / SNAP) * WALL_H;
          if (h <= footY + step + 0.3) top = Math.max(top, h);
        }
      } else if (s.shape === 'box' || s.shape === 'bed' || s.shape === 'smithy' || s.shape === 'forge' || s.shape === 'mortar') {
        for (const c of s.colliders) if (inOBB(x, z, c, 0) && c.y1 <= footY + step) top = Math.max(top, c.y1);
      }
    }
    return top;
  }

  // Lowest ceiling above headY
  ceilingAt(x, z, headY) {
    let low = Infinity;
    for (const s of this.near(x, z, 4, this._tmp3 || (this._tmp3 = []))) {
      if (s.shape !== 'ceiling' && s.shape !== 'foundation') continue;
      const bottom = s.shape === 'ceiling' ? s.y - 0.2 : s.y - FOUND_T;
      if (bottom >= headY - 0.3 && inRect(x, z, s, SNAP / 2, SNAP / 2)) low = Math.min(low, bottom);
    }
    return low;
  }

  // Push a vertical capsule out of structure colliders.
  collide(x, z, r, y0, y1) {
    for (const s of this.near(x, z, r + 4, this._tmp2 || (this._tmp2 = []))) {
      for (const c of s.colliders) {
        if (c.y1 <= y0 + 0.6 || c.y0 >= y1) continue; // walkable step or above head
        const p = pushOutOBB(x, z, r, c);
        if (p) { x = p.x; z = p.z; }
      }
    }
    return { x, z };
  }

  raycast(origin, dir, maxDist) {
    const mid = { x: origin.x + dir.x * maxDist / 2, z: origin.z + dir.z * maxDist / 2 };
    let best = null;
    for (const s of this.near(mid.x, mid.z, maxDist / 2 + 4, [])) {
      const boxes = s.colliders.length ? s.colliders : this.pickBoxes(s);
      for (const c of boxes) {
        const t = rayOBB(origin, dir, c);
        if (t !== null && t <= maxDist && (!best || t < best.dist)) best = { structure: s, dist: t };
      }
    }
    return best;
  }

  pickBoxes(s) {
    // non-colliding deployables still need to be targetable
    const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
    const local = s.shape === 'ramp' ? [[0, 1.5, 0, 1.5, 1.5, 1.5]] : s.shape === 'door' ? [[0, 1.15, 0, 0.6, 1.15, 0.5]] : [[0, 0.5, 0, 0.6, 0.6, 1.0]];
    return local.map(([cx, cy, cz, hx, hy, hz]) => ({ x: s.x + cx * cos + cz * sin, z: s.z - cx * sin + cz * cos, y0: s.y + cy - hy, y1: s.y + cy + hy, hx, hz, rot: s.rot }));
  }

  // ---------- placement ----------
  // Compute a placement for structure item `type` given the camera ray. Returns { x,y,z,rot, ok, reason }
  computePlacement(type, eye, dir) {
    const shape = SHAPE_OF(type);
    const T = this.game.terrain;
    const reach = 9;
    // find aim point: structures first, then terrain
    const hitS = this.raycast(eye, dir, reach);
    let aim = null;
    const step = 0.25;
    for (let t = 0; t <= reach; t += step) {
      const px = eye.x + dir.x * t, py = eye.y + dir.y * t, pz = eye.z + dir.z * t;
      if (py <= T.getHeight(px, pz)) { aim = new THREE.Vector3(px, T.getHeight(px, pz), pz); break; }
    }
    if (hitS && (!aim || hitS.dist < aim.distanceTo(eye))) aim = eye.clone().addScaledVector(dir, hitS.dist);
    if (!aim) aim = eye.clone().addScaledVector(dir, reach * 0.6);

    const candidates = this.snapCandidates(shape, aim, eye);
    let best = null, bd = Infinity;
    for (const c of candidates) {
      const d = Math.hypot(c.x - aim.x, c.y + (shape === 'wall' || shape === 'doorframe' ? 1 : 0) - aim.y, c.z - aim.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best && bd < 3.5) {
      best.ok = this.validate(type, shape, best);
      best.snapped = true;
      return best;
    }
    if (['wall', 'doorframe', 'ceiling', 'door'].includes(shape)) {
      return { x: aim.x, y: aim.y, z: aim.z, rot: this.placeRot, ok: false, reason: shape === 'door' ? 'Must be placed in a doorframe' : 'Must snap to a foundation or wall' };
    }
    // free placement on the ground or on a floor
    const rot = this.game.player.yaw + this.placeRot;
    let y = aim.y;
    if (shape === 'foundation' || shape === 'ramp') {
      const cos = Math.cos(rot), sin = Math.sin(rot);
      let hMax = -Infinity, hMin = Infinity;
      for (const [cx, cz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5], [0, 0]]) {
        const h = T.getHeight(aim.x + cx * cos + cz * sin, aim.z - cx * sin + cz * cos);
        hMax = Math.max(hMax, h); hMin = Math.min(hMin, h);
      }
      y = shape === 'foundation' ? hMax + 0.2 : hMin;
      const p = { x: aim.x, y, z: aim.z, rot };
      p.ok = this.validate(type, shape, p) && hMax - hMin < 3.2;
      if (hMax - hMin >= 3.2) p.reason = 'Ground is too uneven';
      return p;
    }
    const p = { x: aim.x, y, z: aim.z, rot };
    p.ok = this.validate(type, shape, p);
    return p;
  }

  snapCandidates(shape, aim, eye) {
    const out = [];
    const nearby = this.near(aim.x, aim.z, 8, []);
    for (const s of nearby) {
      const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
      const W = (lx, lz) => ({ x: s.x + lx * cos + lz * sin, z: s.z - lx * sin + lz * cos });
      if (shape === 'foundation' && s.shape === 'foundation') {
        for (const [lx, lz] of [[SNAP, 0], [-SNAP, 0], [0, SNAP], [0, -SNAP]]) {
          const p = W(lx, lz);
          out.push({ x: p.x, y: s.y, z: p.z, rot: s.rot });
        }
      }
      if ((shape === 'wall' || shape === 'doorframe') && (s.shape === 'foundation' || s.shape === 'ceiling')) {
        for (const [lx, lz, r] of [[0, SNAP / 2, 0], [0, -SNAP / 2, 0], [SNAP / 2, 0, Math.PI / 2], [-SNAP / 2, 0, Math.PI / 2]]) {
          const p = W(lx, lz);
          out.push({ x: p.x, y: s.y, z: p.z, rot: s.rot + r });
        }
      }
      if ((shape === 'wall' || shape === 'doorframe') && (s.shape === 'wall' || s.shape === 'doorframe')) {
        out.push({ x: s.x, y: s.y + WALL_H, z: s.z, rot: s.rot });
      }
      if (shape === 'ceiling' && (s.shape === 'wall' || s.shape === 'doorframe')) {
        // ceiling sits on top of the wall, on whichever side the survivor is looking from
        const nx = Math.sin(s.rot), nz = Math.cos(s.rot);
        for (const side of [1, -1]) {
          out.push({ x: s.x + nx * side * SNAP / 2, y: s.y + WALL_H + 0.2, z: s.z + nz * side * SNAP / 2, rot: s.rot });
        }
      }
      if (shape === 'ceiling' && s.shape === 'ceiling') {
        for (const [lx, lz] of [[SNAP, 0], [-SNAP, 0], [0, SNAP], [0, -SNAP]]) {
          const p = W(lx, lz);
          out.push({ x: p.x, y: s.y, z: p.z, rot: s.rot });
        }
      }
      if (shape === 'door' && s.shape === 'doorframe') {
        out.push({ x: s.x, y: s.y, z: s.z, rot: s.rot });
      }
      if (shape === 'ramp' && s.shape === 'foundation') {
        for (const [lx, lz, r] of [[0, SNAP, Math.PI], [0, -SNAP, 0], [SNAP, 0, -Math.PI / 2], [-SNAP, 0, Math.PI / 2]]) {
          const p = W(lx, lz);
          out.push({ x: p.x, y: s.y - WALL_H, z: p.z, rot: s.rot + r });
        }
      }
    }
    // deployables snap onto floors under the aim point
    if (!['foundation', 'wall', 'doorframe', 'ceiling', 'door', 'ramp'].includes(shape)) {
      const top = this.groundAt(aim.x, aim.z, aim.y + 0.3, 0.3);
      if (top > -Infinity && Math.abs(top - aim.y) < 0.5) out.push({ x: aim.x, y: top, z: aim.z, rot: this.game.player.yaw + this.placeRot });
    }
    return out;
  }

  validate(type, shape, p) {
    const T = this.game.terrain;
    // overlap tests
    for (const s of this.near(p.x, p.z, 4, [])) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      const dy = Math.abs(s.y - p.y);
      if (s.shape === shape && d < 0.4 && dy < 0.4) { p.reason = 'Something is already there'; return false; }
      if ((shape === 'foundation' && s.shape === 'foundation') || (shape === 'ceiling' && s.shape === 'ceiling')) {
        if (d < SNAP - 0.2 && dy < 1) { p.reason = 'Overlaps another structure'; return false; }
      }
      if (shape === 'door' && s.shape === 'door' && d < 0.5 && dy < 0.5) { p.reason = 'Doorframe already has a door'; return false; }
    }
    if (shape === 'foundation') {
      const wl = T.waterLevelAt(p.x, p.z);
      if (T.getHeight(p.x, p.z) < wl - 1.5) { p.reason = 'Cannot build in deep water'; return false; }
    }
    if (shape !== 'foundation' && shape !== 'wall' && shape !== 'doorframe' && shape !== 'ceiling' && shape !== 'door' && shape !== 'ramp') {
      if (T.isWater(p.x, p.z, 0.3) && this.groundAt(p.x, p.z, p.y + 0.2) === -Infinity) { p.reason = 'Cannot place in water'; return false; }
      const pd = Math.hypot(p.x - this.game.player.pos.x, p.z - this.game.player.pos.z);
      if (pd < 0.8 && shape !== 'bag') { p.reason = 'Too close'; return false; }
    }
    // keep obelisk areas clear
    if (this.game.landmarks && this.game.landmarks.blocksBuilding(p.x, p.z)) { p.reason = 'Too close to an Obelisk'; return false; }
    return true;
  }

  showGhost(type, placement) {
    const key = type;
    if (this.ghostKey !== key) {
      this.hideGhost();
      const fake = { type, shape: SHAPE_OF(type), x: 0, y: 0, z: 0, rot: 0 };
      this.ghost = this.buildMesh(fake);
      this.ghostKey = key;
      this.scene.add(this.ghost);
    }
    const mat = placement.ok ? this.mats.ghostOk : this.mats.ghostBad;
    this.ghost.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    this.ghost.position.set(placement.x, placement.y, placement.z);
    this.ghost.rotation.y = placement.rot;
    this.ghost.visible = true;
  }

  hideGhost() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.ghost = null;
      this.ghostKey = null;
    }
  }

  // ---------- simulation: fires, forges, lights ----------
  update(dt) {
    this.fireTime += dt;
    const g = this.game;
    const P = g.player.pos;
    const lit = [];
    for (const s of this.list) {
      if (s.inventory) s.inventory.update(dt);
      if (s.type === 'campfire' || s.type === 'standing_torch' || s.type === 'refining_forge') {
        if (s.lit) this.burn(s, dt);
        if (s._flame) {
          s._flame.visible = !!s.lit;
          if (s.lit) {
            const f = 0.85 + Math.sin(this.fireTime * 13 + s.x) * 0.1 + Math.random() * 0.08;
            s._flame.scale.set(f, 0.8 + Math.random() * 0.4, f);
            lit.push(s);
          }
        }
      }
    }
    // point light pool: nearest lit fires (+ the survivor's torch in slot 0 handled by game)
    lit.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const s = lit[i];
      if (s && Math.hypot(s.x - P.x, s.z - P.z) < 120) {
        const h = s.type === 'standing_torch' ? 2.7 : s.type === 'refining_forge' ? 0.8 : 0.7;
        l.position.set(s.x, s.y + h, s.z);
        l.intensity = (s.type === 'refining_forge' ? 1.2 : 2.2) * (0.85 + Math.random() * 0.15) * 6;
        l.distance = s.type === 'standing_torch' ? 16 : 18;
      } else l.intensity = 0;
    }
  }

  fuelFor(s) {
    return s.type === 'refining_forge' ? FORGE_FUEL : FUEL;
  }

  hasFuel(s) {
    const table = this.fuelFor(s);
    return s.fuelLeft > 0 || (s.inventory ? Object.keys(table).some((id) => s.inventory.count(id) > 0) : true);
  }

  setLit(s, on) {
    if (on && !this.hasFuel(s)) { this.game.hud.notify('No fuel! Add Wood or Thatch.', 'bad'); return false; }
    s.lit = on;
    if (on) this.game.audio.play('fire');
    return true;
  }

  burn(s, dt) {
    const inv = s.inventory;
    if (s.type === 'standing_torch') return; // burns until extinguished
    s.fuelLeft -= dt;
    if (s.fuelLeft <= 0) {
      const table = this.fuelFor(s);
      let used = null;
      // burn thatch first, then wood (matches the in-game behaviour of using up cheap fuel first)
      for (const id of ['thatch', 'wood', 'oil']) {
        if (table[id] && inv.count(id) > 0) { used = id; break; }
      }
      if (!used) { s.lit = false; s.fuelLeft = 0; return; }
      inv.remove(used, 1);
      s.fuelLeft += table[used];
      if (used === 'wood') inv.add('charcoal', 1);
    }
    // cooking / smelting
    const recipes = s.type === 'campfire'
      ? [['raw_meat', 'cooked_meat', 1, 20], ['raw_prime_meat', 'cooked_prime_meat', 1, 20]]
      : [['metal', 'metal_ingot', 2, 20]];
    for (const [input, output, n, time] of recipes) {
      if (inv.count(input) >= n) {
        s.cook[input] = (s.cook[input] || 0) + dt;
        if (s.cook[input] >= time) {
          s.cook[input] = 0;
          inv.remove(input, n);
          inv.add(output, 1);
        }
      } else s.cook[input] = 0;
    }
  }

  // Warmth from nearby fires for temperature
  warmthAt(x, y, z) {
    let w = 0;
    for (const s of this.near(x, z, 10, [])) {
      if (!s.lit) continue;
      const d = Math.hypot(s.x - x, s.y - y, s.z - z);
      const r = s.type === 'campfire' ? 7 : s.type === 'refining_forge' ? 5 : 4;
      if (d < r) w += (s.type === 'standing_torch' ? 6 : 16) * (1 - d / r);
    }
    // being indoors (ceiling overhead) is a bit warmer & sheltered
    if (this.ceilingAt(x, z, y + 1.8) < Infinity) w += 4;
    return w;
  }

  spawnPoints() {
    return this.list.filter((s) => s.type === 'simple_bed' || s.type === 'sleeping_bag');
  }

  serialize() {
    return this.list.map((s) => ({
      id: s.id, type: s.type, x: s.x, y: s.y, z: s.z, rot: s.rot, hp: s.hp, open: s.open, lit: s.lit,
      fuelLeft: s.fuelLeft, name: s.name, inventory: s.inventory ? s.inventory.serialize() : undefined,
    }));
  }

  restore(list) {
    for (const s of [...this.list]) this.remove(s);
    if (!Array.isArray(list)) return;
    for (const d of list) {
      if (!ITEMS[d.type]) continue;
      this.create(d.type, d.x, d.y, d.z, d.rot, { id: d.id, hp: d.hp, open: d.open, lit: d.lit, fuelLeft: d.fuelLeft || 0, name: d.name, inventory: d.inventory });
    }
  }
}

// ---------- geometry helpers ----------
function toLocal(x, z, s) {
  const dx = x - s.x, dz = z - s.z;
  const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}
function inRect(x, z, s, hx, hz) {
  const l = toLocal(x, z, s);
  return Math.abs(l.x) <= hx && Math.abs(l.z) <= hz;
}
function inOBB(x, z, c, pad) {
  const l = toLocal(x, z, c);
  return Math.abs(l.x) <= c.hx + pad && Math.abs(l.z) <= c.hz + pad;
}
function pushOutOBB(x, z, r, c) {
  const l = toLocal(x, z, c);
  const qx = clamp(l.x, -c.hx, c.hx), qz = clamp(l.z, -c.hz, c.hz);
  let dx = l.x - qx, dz = l.z - qz;
  let d = Math.hypot(dx, dz);
  if (d >= r) return null;
  let nlx, nlz;
  if (d < 1e-5) {
    // centre inside the box: push out along the shallowest axis
    const px = c.hx - Math.abs(l.x), pz = c.hz - Math.abs(l.z);
    if (px < pz) { nlx = (Math.sign(l.x) || 1) * (c.hx + r); nlz = l.z; } else { nlx = l.x; nlz = (Math.sign(l.z) || 1) * (c.hz + r); }
  } else {
    nlx = qx + (dx / d) * r;
    nlz = qz + (dz / d) * r;
  }
  const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
  return { x: c.x + nlx * cos + nlz * sin, z: c.z - nlx * sin + nlz * cos };
}
function rayOBB(o, d, c) {
  // transform ray into the box's local frame (rotation about Y)
  const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
  const ox = (o.x - c.x) * cos - (o.z - c.z) * sin;
  const oz = (o.x - c.x) * sin + (o.z - c.z) * cos;
  const dx = d.x * cos - d.z * sin;
  const dz = d.x * sin + d.z * cos;
  const cy = (c.y0 + c.y1) / 2, hy = (c.y1 - c.y0) / 2;
  const oy = o.y - cy, dy = d.y;
  let tmin = -Infinity, tmax = Infinity;
  for (const [oo, dd, h] of [[ox, dx, c.hx], [oy, dy, hy], [oz, dz, c.hz]]) {
    if (Math.abs(dd) < 1e-8) { if (oo < -h || oo > h) return null; continue; }
    let t1 = (-h - oo) / dd, t2 = (h - oo) / dd;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : 0;
}
