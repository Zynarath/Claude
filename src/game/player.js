// The survivor: stats, levelling, temperature, and first-person movement physics.
import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';
import { Inventory } from './inventory.js';
import { ITEMS } from '../data/items.js';
import { MAX_LEVEL, xpForLevel, engramPointsForLevel, DEFAULT_KNOWN } from '../data/engrams.js';

export const STAT_DEFS = {
  health: { name: 'Health', base: 100, per: 10 },
  stamina: { name: 'Stamina', base: 100, per: 10 },
  oxygen: { name: 'Oxygen', base: 100, per: 20 },
  food: { name: 'Food', base: 100, per: 10 },
  water: { name: 'Water', base: 100, per: 10 },
  weight: { name: 'Weight', base: 100, per: 10 },
  melee: { name: 'Melee Damage', base: 100, per: 5, pct: true },
  speed: { name: 'Movement Speed', base: 100, per: 2, pct: true },
  fortitude: { name: 'Fortitude', base: 0, per: 2 },
};
export const LEVELABLE = Object.keys(STAT_DEFS);

const GRAVITY = 19;
const WALK = 3.9;
const SPRINT_MULT = 1.75;
const RADIUS = 0.38;

export class Player {
  constructor() {
    this.name = 'Survivor';
    this.gender = 'male';
    this.skin = 0.5;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.swimming = false;
    this.headUnder = false;
    this.stance = 'stand'; // stand | crouch | prone
    this.sprinting = false;
    this.eyeHeight = 1.7;
    this.radius = RADIUS;

    this.inventory = new Inventory(300);
    this.equipment = { head: null, chest: null, legs: null, hands: null, feet: null };
    this.hotbar = new Array(10).fill(null); // { uid } or { id }
    this.activeSlot = -1;

    this.points = Object.fromEntries(LEVELABLE.map((k) => [k, 0]));
    this.level = 1;
    this.xp = 0;
    this.engramPoints = 0;
    this.known = new Set(DEFAULT_KNOWN);

    this.health = 100;
    this.stamina = 100;
    this.oxygen = 100;
    this.food = 100;
    this.water = 100;
    this.torpor = 0;
    this.maxTorpor = 200;
    this.unconscious = false;
    this.temperature = 25;
    this.statusFlags = new Set();
    this.dead = false;
    this.fallStartY = null;
    this.lastHurt = 0;
    this.riding = null;
    this.blind = 0;
    this.craftQueue = [];
    this.stepTimer = 0;
  }

  max(stat) {
    const d = STAT_DEFS[stat];
    return d.base + d.per * this.points[stat];
  }
  get maxHealth() { return this.max('health'); }
  get maxStamina() { return this.max('stamina'); }
  get maxOxygen() { return this.max('oxygen'); }
  get maxFood() { return this.max('food'); }
  get maxWater() { return this.max('water'); }
  get maxWeight() { return this.max('weight'); }
  get meleeMult() { return this.max('melee') / 100; }
  get speedMult() { return this.max('speed') / 100; }
  get fortitude() { return this.max('fortitude'); }

  get carried() {
    let w = this.inventory.weight();
    for (const s of Object.values(this.equipment)) if (s) w += ITEMS[s.id].weight;
    return w;
  }
  get encumbered() { return this.carried > this.maxWeight; }

  get armor() {
    let a = 0;
    for (const s of Object.values(this.equipment)) if (s && s.dur > 0) a += ITEMS[s.id].armor || 0;
    return a;
  }
  insulation() {
    let cold = 0, heat = 0;
    for (const s of Object.values(this.equipment)) {
      if (!s) continue;
      cold += ITEMS[s.id].cold || 0;
      heat += ITEMS[s.id].heat || 0;
    }
    return { cold, heat };
  }

  // --- levelling ---
  get canLevel() {
    return this.level < MAX_LEVEL && this.xp >= xpForLevel(this.level + 1);
  }
  addXP(amount, mult = 1) {
    if (this.level >= MAX_LEVEL) return false;
    const before = this.canLevel;
    this.xp = Math.min(this.xp + amount * mult, xpForLevel(MAX_LEVEL));
    return !before && this.canLevel;
  }
  levelUp(stat) {
    if (!this.canLevel || !STAT_DEFS[stat]) return false;
    this.points[stat]++;
    this.level++;
    this.engramPoints += engramPointsForLevel(this.level);
    // levelling a pool stat also raises its current value
    const d = STAT_DEFS[stat];
    if (stat in this && typeof this[stat] === 'number' && ['health', 'stamina', 'oxygen', 'food', 'water'].includes(stat)) this[stat] += d.per;
    return true;
  }

  // --- equipped item ---
  activeStack() {
    if (this.activeSlot < 0) return null;
    const h = this.hotbar[this.activeSlot];
    if (!h) return null;
    if (h.uid) return this.inventory.byUid(h.uid);
    return this.inventory.find(h.id);
  }
  activeDef() {
    const s = this.activeStack();
    return s ? ITEMS[s.id] : null;
  }
  cleanHotbar() {
    for (let i = 0; i < 10; i++) {
      const h = this.hotbar[i];
      if (!h) continue;
      if (h.uid && !this.inventory.byUid(h.uid)) this.hotbar[i] = null;
      else if (h.id && !this.inventory.find(h.id)) this.hotbar[i] = null;
    }
    if (this.activeSlot >= 0 && !this.hotbar[this.activeSlot]) this.activeSlot = -1;
  }
  autoHotbar(stack) {
    const def = ITEMS[stack.id];
    const unique = !!def.durability || def.stack === 1;
    for (const h of this.hotbar) {
      if (!h) continue;
      if (unique ? h.uid === stack.uid : h.id === stack.id) return;
    }
    const i = this.hotbar.indexOf(null);
    if (i >= 0) this.hotbar[i] = unique ? { uid: stack.uid } : { id: stack.id };
  }

  // --- damage ---
  damage(amount, opts = {}) {
    if (this.dead) return 0;
    const reduction = opts.ignoreArmor ? 0 : this.armor / (this.armor + 100);
    const dmg = amount * (1 - reduction);
    this.health -= dmg;
    this.lastHurt = performance.now();
    if (!opts.ignoreArmor) {
      for (const s of Object.values(this.equipment)) if (s && s.dur > 0) s.dur = Math.max(0, s.dur - amount * 0.02);
    }
    if (opts.torpor) this.torpor = Math.min(this.maxTorpor * 1.2, this.torpor + opts.torpor * (1 - this.fortitude / 200));
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
    return dmg;
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // Survival stat simulation. env: { temp, sky, inWater }
  updateStats(dt, env) {
    if (this.dead) return [];
    const events = [];
    const flags = this.statusFlags;
    flags.clear();

    // Temperature comfort
    const ins = this.insulation();
    const fort = this.fortitude;
    const coldLimit = 12 - ins.cold * 0.25 - fort * 0.25;
    const hotLimit = 34 + ins.heat * 0.25 + fort * 0.25;
    const T = env.temp;
    this.temperature = T;
    let foodMult = 1, waterMult = 1;
    if (T < coldLimit) {
      flags.add('cold');
      foodMult += (coldLimit - T) * 0.08;
      if (T < coldLimit - 12) { flags.add('hypothermia'); this.health -= dt * 0.6; }
    } else if (T > hotLimit) {
      flags.add('hot');
      waterMult += (T - hotLimit) * 0.1;
      if (T > hotLimit + 10) { flags.add('hyperthermia'); this.health -= dt * 0.6; }
    }
    if (this.sprinting) { foodMult *= 1.6; waterMult *= 2; }

    // Food & water drain (≈42 min of food, ≈28 min of water at base stats)
    this.food = Math.max(0, this.food - dt * 0.04 * foodMult);
    this.water = Math.max(0, this.water - dt * 0.06 * waterMult);
    if (this.food <= 0) { flags.add('starving'); this.health -= dt * 0.8; }
    if (this.water <= 0) { flags.add('dehydrated'); this.health -= dt * 1.0; }
    if (this.food < this.maxFood * 0.12) flags.add('hungry');
    if (this.water < this.maxWater * 0.12) flags.add('thirsty');

    // Health regen when fed and watered
    if (this.food > 0 && this.water > 0 && this.health < this.maxHealth && performance.now() - this.lastHurt > 3000) {
      const regen = dt * this.maxHealth * 0.0025;
      this.health = Math.min(this.maxHealth, this.health + regen);
      this.food = Math.max(0, this.food - regen * 0.08);
    }

    // Stamina
    const regenStam = !this.sprinting && this.food > 0 && this.water > 0;
    if (regenStam) this.stamina = Math.min(this.maxStamina, this.stamina + dt * 6.5 * (this.unconscious ? 2 : 1));
    if (this.stamina <= 1) flags.add('exhausted');

    // Oxygen
    if (this.headUnder) {
      this.oxygen = Math.max(0, this.oxygen - dt * 3.3);
      if (this.oxygen <= 0) { flags.add('drowning'); this.health -= dt * 8; this.lastHurt = performance.now(); }
    } else {
      this.oxygen = Math.min(this.maxOxygen, this.oxygen + dt * 20);
    }

    // Torpor
    if (this.torpor > 0) {
      this.torpor = Math.max(0, this.torpor - dt * (this.unconscious ? 4 : 2.5));
      if (!this.unconscious && this.torpor >= this.maxTorpor) { this.unconscious = true; events.push('knocked_out'); }
      if (this.unconscious && this.torpor <= this.maxTorpor * 0.1) { this.unconscious = false; events.push('woke'); }
    }
    if (this.encumbered) flags.add('encumbered');
    if (this.blind > 0) this.blind = Math.max(0, this.blind - dt);

    if (this.health <= 0 && !this.dead) {
      this.health = 0;
      this.dead = true;
      events.push('died');
    }
    // clamp pools
    this.health = clamp(this.health, 0, this.maxHealth);
    this.food = clamp(this.food, 0, this.maxFood);
    this.water = clamp(this.water, 0, this.maxWater);
    this.stamina = clamp(this.stamina, 0, this.maxStamina);
    return events;
  }

  // Movement physics. world provides groundAt(x,z,footY), collide(x,z,r,y), waterAt(x,z).
  move(dt, input, world, settings) {
    if (this.dead || this.riding) return;
    const ko = this.unconscious;
    // stance
    if (!ko) {
      if (input.hit('KeyC')) this.stance = this.stance === 'crouch' ? 'stand' : 'crouch';
      if (input.hit('KeyX')) this.stance = this.stance === 'prone' ? 'stand' : 'prone';
    }
    const targetEye = ko ? 0.3 : this.stance === 'crouch' ? 1.1 : this.stance === 'prone' ? 0.45 : 1.7;
    this.eyeHeight = lerp(this.eyeHeight, targetEye, Math.min(1, dt * 10));

    // input direction
    let fx = 0, fz = 0;
    if (!ko) {
      if (input.down('KeyW')) fz += 1;
      if (input.down('KeyS')) fz -= 1;
      if (input.down('KeyA')) fx -= 1;
      if (input.down('KeyD')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward = (-sin, -cos); right = (cos, -sin)
    let dx = -sin * fz + cos * fx;
    let dz = -cos * fz - sin * fx;

    const enc = this.encumbered;
    const wantSprint = !ko && input.down('ShiftLeft') && fz > 0 && this.stamina > 1 && !enc && this.stance === 'stand';
    let speed = WALK * this.speedMult;
    if (this.stance === 'crouch') speed *= 0.45;
    if (this.stance === 'prone') speed *= 0.22;
    if (wantSprint) speed *= SPRINT_MULT;
    if (enc) speed = 0.5;
    if (this.flags_slow) speed *= 0.5;

    const waterLevel = world.waterAt(this.pos.x, this.pos.z);
    const ground = world.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const depth = waterLevel - ground;
    const wasSwimming = this.swimming;
    this.swimming = depth > 1.35 && this.pos.y < waterLevel - 0.9;
    if (this.swimming && !wasSwimming) {
      this.stance = 'stand';
      this.fallStartY = null;
      if (this.vel.y < -6) world.splash?.();
    }

    this.sprinting = false;
    if (this.swimming) {
      const swimSpeed = (wantSprint ? 5.2 : 3.0) * this.speedMult * (enc ? 0.3 : 1);
      // swim toward camera direction when moving forward
      const look = this.lookDir(new THREE.Vector3());
      let vy = 0;
      if (fz !== 0) vy = look.y * fz * swimSpeed;
      if (!ko && input.down('Space')) vy = swimSpeed * 0.8;
      if (!ko && (input.down('KeyC') || input.down('ControlLeft'))) vy = -swimSpeed * 0.8;
      this.vel.x = lerp(this.vel.x, dx * swimSpeed, Math.min(1, dt * 4));
      this.vel.z = lerp(this.vel.z, dz * swimSpeed, Math.min(1, dt * 4));
      this.vel.y = lerp(this.vel.y, vy, Math.min(1, dt * 4));
      // float at the surface
      const surfaceY = waterLevel - 1.45;
      if (this.pos.y > surfaceY && this.vel.y > -0.1) { this.vel.y = Math.min(this.vel.y, (surfaceY - this.pos.y) * 4); }
      if (this.pos.y < surfaceY - 0.05 && fz === 0 && !input.down('KeyC') && !input.down('ControlLeft')) this.vel.y += dt * 2.5; // buoyancy
      if (wantSprint && (dx || dz)) { this.sprinting = true; this.stamina -= dt * 6; }
      this.onGround = false;
    } else {
      const accel = this.onGround ? 14 : 2.5;
      this.vel.x = lerp(this.vel.x, dx * speed, Math.min(1, dt * accel));
      this.vel.z = lerp(this.vel.z, dz * speed, Math.min(1, dt * accel));
      if (wantSprint && len > 0 && this.onGround) {
        this.sprinting = true;
        this.stamina = Math.max(0, this.stamina - dt * 7.5);
      }
      if (!ko && input.hit('Space') && this.onGround && this.stamina >= 6 && !enc) {
        if (this.stance !== 'stand') this.stance = 'stand';
        else {
          this.vel.y = 6.2;
          this.stamina -= 6;
          this.onGround = false;
        }
      }
      this.vel.y -= GRAVITY * dt;
    }

    // integrate horizontal with collision
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    // slope limit: block walking up very steep terrain
    if (!this.swimming && this.onGround) {
      const gNew = world.groundAt(nx, nz, this.pos.y);
      const rise = gNew - this.pos.y;
      const run = Math.hypot(nx - this.pos.x, nz - this.pos.z) + 1e-5;
      if (rise > 0.45 && rise / run > 1.6) { nx = this.pos.x; nz = this.pos.z; this.vel.x *= 0.2; this.vel.z *= 0.2; }
    }
    const c = world.collide(nx, nz, this.radius, this.pos.y);
    nx = c.x; nz = c.z;
    this.pos.x = clamp(nx, -2040, 2040);
    this.pos.z = clamp(nz, -2040, 2040);

    // vertical
    this.pos.y += this.vel.y * dt;
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const ceiling = world.ceilingAt ? world.ceilingAt(this.pos.x, this.pos.z, this.pos.y + 0.2) : Infinity;
    if (this.pos.y + this.eyeHeight + 0.15 > ceiling && this.vel.y > 0) { this.vel.y = 0; this.pos.y = ceiling - this.eyeHeight - 0.15; }
    if (this.pos.y <= g + 0.001) {
      if (!this.onGround && !this.swimming && this.fallStartY !== null) {
        const impact = -this.vel.y;
        if (impact > 13) {
          const dmg = (impact - 13) * 9;
          this.damage(dmg, { ignoreArmor: true });
          world.onFallDamage?.(dmg);
        }
      }
      this.pos.y = g;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
      this.fallStartY = null;
    } else if (!this.swimming) {
      // stay glued to slopes when walking downhill
      if (this.onGround && this.pos.y - g < 0.6 && this.vel.y <= 0) {
        this.pos.y = g;
      } else {
        if (this.onGround) this.fallStartY = this.pos.y;
        if (this.fallStartY === null) this.fallStartY = this.pos.y;
        this.onGround = false;
      }
    }
    if (this.swimming && this.pos.y < g) this.pos.y = g;

    const eyeY = this.pos.y + this.eyeHeight;
    this.headUnder = eyeY < world.waterAt(this.pos.x, this.pos.z) - 0.05;

    // footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 1) {
      this.stepTimer -= dt * hs;
      if (this.stepTimer <= 0) { this.stepTimer = 2.2; world.footstep?.(); }
    }
  }

  serialize() {
    return {
      name: this.name, gender: this.gender, skin: this.skin,
      pos: [this.pos.x, this.pos.y, this.pos.z], yaw: this.yaw, pitch: this.pitch,
      points: this.points, level: this.level, xp: this.xp, engramPoints: this.engramPoints,
      known: [...this.known], health: this.health, stamina: this.stamina, oxygen: this.oxygen,
      food: this.food, water: this.water, torpor: this.torpor,
      inventory: this.inventory.serialize(),
      equipment: this.equipment,
      hotbar: this.hotbar, activeSlot: this.activeSlot,
    };
  }

  restore(d) {
    Object.assign(this, {
      name: d.name, gender: d.gender, skin: d.skin, yaw: d.yaw, pitch: d.pitch,
      level: d.level, xp: d.xp, engramPoints: d.engramPoints,
      health: d.health, stamina: d.stamina, oxygen: d.oxygen, food: d.food, water: d.water, torpor: d.torpor || 0,
      activeSlot: d.activeSlot ?? -1,
    });
    this.points = { ...this.points, ...d.points };
    this.known = new Set([...DEFAULT_KNOWN, ...(d.known || [])]);
    this.pos.set(...d.pos);
    this.inventory.restore(d.inventory);
    this.equipment = { head: null, chest: null, legs: null, hands: null, feet: null, ...(d.equipment || {}) };
    this.hotbar = Array.isArray(d.hotbar) ? d.hotbar.slice(0, 10) : new Array(10).fill(null);
    while (this.hotbar.length < 10) this.hotbar.push(null);
    this.cleanHotbar();
  }
}
