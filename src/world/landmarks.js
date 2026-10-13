// The three Obelisks and orbital supply drops (beacons).
import * as THREE from 'three';
import { fromLatLon } from './terrain.js';
import { Inventory } from '../game/inventory.js';
import { rand, randInt, pick, uid } from '../core/util.js';

export const OBELISKS = [
  { name: 'Red Obelisk', color: '#ff3a2a', lat: 70, lon: 22 },
  { name: 'Green Obelisk', color: '#3aff6a', lat: 55, lon: 72 },
  { name: 'Blue Obelisk', color: '#3a9aff', lat: 27, lon: 58 },
];

// Supply crate tiers with the survivor level needed to open them.
export const DROP_TIERS = [
  { name: 'White', color: '#f0f0f0', level: 3, weight: 5, loot: [
    ['cloth_shirt', 1], ['cloth_pants', 1], ['cloth_hat', 1], ['cloth_boots', 1], ['cloth_gloves', 1], ['stone_pick', 1],
    ['stone_hatchet', 1], ['spear', 1], ['torch', 1], ['waterskin', 1], ['stone_arrow', 15], ['cooked_meat', 5], ['sparkpowder', 10]] },
  { name: 'Green', color: '#5aff5a', level: 15, weight: 4, loot: [
    ['hide_shirt', 1], ['hide_pants', 1], ['hide_hat', 1], ['hide_boots', 1], ['hide_gloves', 1], ['bow', 1], ['slingshot', 1],
    ['stone_arrow', 25], ['narcotic', 10], ['parasaur_saddle', 1], ['phiomia_saddle', 1], ['wooden_club', 1], ['spyglass', 1]] },
  { name: 'Blue', color: '#4aa0ff', level: 30, weight: 3, loot: [
    ['chitin_helmet', 1], ['chitin_chest', 1], ['chitin_legs', 1], ['metal_pick', 1], ['metal_hatchet', 1], ['raptor_saddle', 1],
    ['trike_saddle', 1], ['simple_pistol', 1], ['simple_bullet', 20], ['tranq_arrow', 15], ['metal_ingot', 25], ['gps', 1]] },
  { name: 'Purple', color: '#c060ff', level: 45, weight: 2, loot: [
    ['flak_helmet', 1], ['flak_chest', 1], ['flak_legs', 1], ['longneck_rifle', 1], ['tranq_dart', 15], ['simple_rifle_ammo', 15],
    ['stego_saddle', 1], ['ptera_saddle', 1], ['metal_sword', 1], ['metal_ingot', 50]] },
  { name: 'Yellow', color: '#ffd23a', level: 60, weight: 1, loot: [
    ['flak_chest', 1], ['flak_legs', 1], ['flak_gauntlets', 1], ['flak_boots', 1], ['rex_saddle', 1], ['carno_saddle', 1],
    ['argentavis_saddle', 1], ['longneck_rifle', 1], ['tranq_dart', 30], ['metal_ingot', 100], ['polymer', 20]] },
];

export class Landmarks {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.obelisks = [];
    this.drops = [];
    this.dropTimer = 90;
    this.time = 0;
    this.buildObelisks();
  }

  buildObelisks() {
    const T = this.game.terrain;
    for (const o of OBELISKS) {
      let { x, z } = fromLatLon(o.lat, o.lon);
      // nudge onto land if needed
      for (let i = 0; i < 40 && T.getHeight(x, z) < 6; i++) { x *= 0.97; z *= 0.97; }
      const ground = T.getHeight(x, z);
      const group = new THREE.Group();
      const dark = new THREE.MeshStandardMaterial({ color: '#2a2e36', metalness: 0.7, roughness: 0.35 });
      const glow = new THREE.MeshBasicMaterial({ color: o.color });
      // base platform
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 3, 8), dark);
      ring.position.y = ground - 1.0;
      ring.receiveShadow = true;
      group.add(ring);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.3, 8), glow);
      pad.position.y = ground + 0.55;
      group.add(pad);
      // floating monolith
      const h = 120;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 7, h, 4), dark);
      shaft.rotation.y = Math.PI / 4;
      shaft.position.y = ground + 30 + h / 2;
      shaft.castShadow = true;
      group.add(shaft);
      for (let k = 0; k < 4; k++) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.6, h * 0.9, 0.6), glow);
        const a = (k / 4) * Math.PI * 2;
        line.position.set(Math.cos(a) * 5.6, ground + 30 + h / 2, Math.sin(a) * 5.6);
        line.rotation.z = Math.cos(a) * 0.009;
        line.rotation.x = -Math.sin(a) * 0.009;
        group.add(line);
      }
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(5, 0), glow);
      tip.position.y = ground + 30 + h + 6;
      group.add(tip);
      // light beam into the sky (visible from across the island)
      const beamMat = new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 1200, 8, 1, true), beamMat);
      beam.position.y = ground + 30 + h + 600;
      group.add(beam);
      group.position.set(x, 0, z);
      this.scene.add(group);
      this.obelisks.push({ ...o, x, z, y: ground, group, tip, shaft });
    }
  }

  blocksBuilding(x, z) {
    return this.obelisks.some((o) => Math.hypot(o.x - x, o.z - z) < 60);
  }

  // The obelisk base platform is a low, walkable step.
  groundAt(x, z, footY = Infinity) {
    for (const o of this.obelisks) {
      if (Math.hypot(x - o.x, z - o.z) < 14 && o.y + 0.5 <= footY + 0.6) return o.y + 0.5;
    }
    return -Infinity;
  }

  spawnDrop(near) {
    const g = this.game;
    const T = g.terrain;
    for (let i = 0; i < 20; i++) {
      const a = rand(0, Math.PI * 2), r = rand(60, 280);
      const x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
      const h = T.getHeight(x, z);
      if (h < 1 || T.isWater(x, z, 0.2)) continue;
      const total = DROP_TIERS.reduce((s, t) => s + t.weight, 0);
      let roll = Math.random() * total, tier = DROP_TIERS[0];
      for (const t of DROP_TIERS) { roll -= t.weight; if (roll <= 0) { tier = t; break; } }
      const group = new THREE.Group();
      const beamMat = new THREE.MeshBasicMaterial({ color: tier.color, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 400, 10, 1, true), beamMat);
      beam.position.y = 200;
      group.add(beam);
      const crateMat = new THREE.MeshLambertMaterial({ color: '#3a3e44' });
      const crate = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), crateMat);
      body.castShadow = true;
      crate.add(body);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 1.7), new THREE.MeshBasicMaterial({ color: tier.color }));
      trim.position.y = 0.5;
      crate.add(trim);
      const trim2 = trim.clone();
      trim2.position.y = -0.5;
      crate.add(trim2);
      crate.position.y = 250;
      group.add(crate);
      group.position.set(x, h, z);
      this.scene.add(group);
      const inv = new Inventory(20);
      const n = randInt(3, 6);
      for (let k = 0; k < n; k++) {
        const [id, qty] = pick(tier.loot);
        inv.add(id, qty);
      }
      const drop = { id: uid(), tier, x, y: h, z, group, crate, inventory: inv, landed: false, life: 900, falling: 250 };
      this.drops.push(drop);
      return drop;
    }
    return null;
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    for (const o of this.obelisks) {
      o.tip.rotation.y += dt * 0.5;
      o.tip.position.y = o.y + 156 + Math.sin(this.time * 0.8) * 1.5;
    }
    this.dropTimer -= dt;
    if (this.dropTimer <= 0) {
      this.dropTimer = rand(180, 360);
      if (this.drops.length < 4 && !g.player.dead) this.spawnDrop(g.player.pos);
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      if (!d.landed) {
        d.falling = Math.max(0.7, d.falling - dt * 18);
        d.crate.position.y = d.falling;
        d.crate.rotation.y += dt * 0.3;
        if (d.falling <= 0.7) { d.landed = true; if (Math.hypot(d.x - g.player.pos.x, d.z - g.player.pos.z) < 150) g.audio.play('drop'); }
      }
      if (d.life <= 0 || (d.opened && d.inventory.stacks.length === 0)) {
        this.scene.remove(d.group);
        this.drops.splice(i, 1);
      }
    }
  }

  raycastDrop(origin, dir, maxDist) {
    let best = null;
    for (const d of this.drops) {
      if (!d.landed) continue;
      const c = new THREE.Vector3(d.x, d.y + 0.7, d.z);
      const oc = c.clone().sub(origin);
      const t = oc.dot(dir);
      if (t < 0 || t > maxDist) continue;
      const closest = origin.clone().addScaledVector(dir, t);
      if (closest.distanceTo(c) < 1.2 && (!best || t < best.dist)) best = { drop: d, dist: t };
    }
    return best;
  }
}
