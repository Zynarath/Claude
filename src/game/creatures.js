// Creature simulation: spawning, AI, combat, torpor/knock-out, taming, tamed behaviour and riding.
import * as THREE from 'three';
import { CREATURES, CREATURE_LIST, MAX_WILD_LEVEL, TAME_FOOD_VALUE } from '../data/creatures.js';
import { ITEMS } from '../data/items.js';
import { buildCreatureModel, animateRig, flashRig } from './creatureModels.js';
import { Inventory } from './inventory.js';
import { BIOME, HALF, HERBIVORE_ISLAND, LAKES } from '../world/terrain.js';
import { clamp, lerp, rand, randInt, wrapAngle, approachAngle, weightedPick, uid, pick } from '../core/util.js';
import { raySphere } from '../world/resources.js';

const ACTIVE_RADIUS = 520;
const SPIT_GEO = new THREE.SphereGeometry(0.12, 6, 4);
const SPIT_MAT = new THREE.MeshBasicMaterial({ color: '#8adf3a' });
const SADDLE_GEO = { seat: new THREE.BoxGeometry(0.7, 0.18, 0.9), back: new THREE.BoxGeometry(0.6, 0.35, 0.12) };
const SADDLE_MAT = new THREE.MeshLambertMaterial({ color: '#5a3a22', flatShading: true });
const VISIBLE_RADIUS = 420;
const WILD_POINT_STATS = ['health', 'stamina', 'weight', 'melee', 'food', 'oxygen'];
const LIE_ANGLE = (Math.PI / 2) * 0.92; // roll applied to unconscious/dead creatures
const LIE_SIN = Math.sin(LIE_ANGLE), LIE_COS = Math.cos(LIE_ANGLE);

// What tamed creatures gather when they attack resource nodes.
const TAME_HARVEST = {
  trike: { bush: { mejoberry: 3, amarberry: 2, azulberry: 2, tintoberry: 2 } },
  stego: { bush: { mejoberry: 3, amarberry: 2, tintoberry: 2, fiber: 2 }, tree: { thatch: 6, wood: 1 } },
  parasaur: { bush: { mejoberry: 2, amarberry: 2, narcoberry: 1, stimberry: 1, fiber: 2 } },
  phiomia: { bush: { amarberry: 2, azulberry: 2, fiber: 1 } },
  bronto: { bush: { mejoberry: 6, amarberry: 4, azulberry: 4, tintoberry: 4, fiber: 4 }, tree: { thatch: 10 } },
  mammoth: { tree: { wood: 10, thatch: 1 } },
  ankylo: { rock: { stone: 2, flint: 6 }, metal: { metal: 6, stone: 2 }, obsidian: { obsidian: 3 }, crystal: { crystal: 3 }, oil: { oil: 2 } },
  carbonemys: { bush: { amarberry: 2, fiber: 1 } },
};

export class Creature {
  constructor(def, level, pos, opts = {}) {
    this.def = def;
    this.id = opts.id || uid();
    this.level = level;
    this.baseLevel = level;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? rand(-Math.PI, Math.PI);
    this.speed = 0;
    this.points = opts.points || Creature.rollPoints(level);
    this.tamedPoints = opts.tamedPoints || Object.fromEntries([...WILD_POINT_STATS, 'speed'].map((k) => [k, 0]));
    this.recalc();
    this.hp = opts.hp ?? this.hpMax;
    this.stamina = this.staminaMax;
    this.torpor = opts.torpor ?? 0;
    this.food = opts.food ?? this.foodMax;
    this.state = 'wander';
    this.stateTimer = rand(1, 6);
    this.decisionTimer = rand(0, 0.5);
    this.target = null;
    this.goal = null;
    this.attackCd = 0;
    this.attackAnim = 0;
    this.flash = 0;
    this.tamed = !!opts.tamed;
    this.name = opts.name || '';
    this.owned = !!opts.owned;
    this.follow = opts.follow ?? false;
    this.aggression = opts.aggression || 'neutral';
    this.xp = opts.xp || 0;
    this.inventory = new Inventory(def.habitat === 'land' || def.habitat === 'amphibious' || def.habitat === 'air' || def.habitat === 'water' ? 300 : 300);
    if (opts.inventory) this.inventory.restore(opts.inventory);
    this.saddle = opts.saddle || null;
    this.taming = null;
    this.corpse = null;
    this.dead = false;
    this.ko = false;
    this.flying = def.habitat === 'air' && !this.tamed;
    this.altitude = rand(18, 45);
    this.swimDepth = rand(2, 8);
    this.rider = null;
    this.lastAggressor = null;
    this.harvestAcc = {};
    this.rig = null;
    this.visible = false;
    this.home = opts.home ? opts.home.clone() : this.pos.clone();
    this.noiseT = Math.random() * 100;
    this.dotTorpor = 0; // pending torpor applied over time (tranq)
    this.levelUpsAvailable = opts.levelUpsAvailable || 0;
  }

  static rollPoints(level) {
    const p = Object.fromEntries(WILD_POINT_STATS.map((k) => [k, 0]));
    for (let i = 1; i < level; i++) p[pick(WILD_POINT_STATS)]++;
    return p;
  }

  recalc() {
    const d = this.def, p = this.points, t = this.tamedPoints;
    const hpFrac = this.hpMax ? this.hp / this.hpMax : 1;
    this.hpMax = d.hp * (1 + 0.2 * p.health + 0.1 * t.health);
    this.staminaMax = d.stamina * (1 + 0.1 * p.stamina + 0.1 * t.stamina);
    this.weightMax = d.weight * (1 + 0.04 * p.weight + 0.04 * t.weight);
    this.damageMult = 1 + 0.05 * p.melee + 0.03 * t.melee;
    this.speedMult = 1 + 0.01 * (t.speed || 0);
    this.foodMax = 1000 * (1 + 0.1 * p.food + 0.1 * t.food);
    this.torporMax = d.torpor * (1 + 0.06 * (this.baseLevel - 1));
    if (this.hp !== undefined) this.hp = this.hpMax * hpFrac;
  }

  get displayName() {
    if (this.tamed && this.name) return this.name;
    return this.def.short || this.def.name;
  }

  get alive() { return !this.dead; }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  // World-space hit spheres for ray tests and melee range
  hitSpheres() {
    const out = [];
    const s = this.rig ? this.rig.scale : this.def.model.scale || 1;
    const spheres = this.rig ? this.rig.hitSpheres : [{ z: 0, y: this.def.height * 0.5 / s, r: this.def.radius / s }];
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const lying = this.ko || this.dead;
    for (const h of spheres) {
      let lx = 0, ly = h.y * s;
      const lz = h.z * s;
      if (lying) {
        // match the render: the model is rolled onto its side about its forward axis
        lx = -ly * LIE_SIN;
        ly = ly * LIE_COS + this.def.radius * 0.35;
      }
      out.push({ x: this.pos.x + lx * cos + lz * sin, y: this.pos.y + ly, z: this.pos.z - lx * sin + lz * cos, r: h.r * s });
    }
    return out;
  }

  raycast(origin, dir, maxDist) {
    let best = null;
    for (const h of this.hitSpheres()) {
      const t = raySphere(origin, dir, h.x, h.y, h.z, h.r);
      if (t !== null && t <= maxDist && (best === null || t < best)) best = t;
    }
    return best;
  }

  headPos(out = new THREE.Vector3()) {
    const hs = this.hitSpheres();
    const h = hs.length > 1 ? hs[1] : hs[0];
    return out.set(h.x, h.y, h.z);
  }

  distTo(p) {
    let best = Infinity;
    for (const h of this.hitSpheres()) best = Math.min(best, Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z) - h.r);
    return Math.max(0, best);
  }

  serialize() {
    return {
      id: this.id, type: this.def.id, level: this.level, baseLevel: this.baseLevel, pos: [this.pos.x, this.pos.y, this.pos.z], yaw: this.yaw,
      points: this.points, tamedPoints: this.tamedPoints, hp: this.hp, food: this.food, name: this.name,
      follow: this.follow, aggression: this.aggression, xp: this.xp, inventory: this.inventory.serialize(), saddle: this.saddle,
      levelUpsAvailable: this.levelUpsAvailable,
    };
  }
}

export class CreatureManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.terrain = game.terrain;
    this.list = [];
    this.spawnTimer = 10;
    this.targetPopulation = 460;
    this.tmpV = new THREE.Vector3();
    this.projectiles = [];
  }

  // ---------- spawning ----------
  zoneAt(x, z) {
    const T = this.terrain;
    const h = T.getHeight(x, z);
    for (const lake of LAKES) {
      if (Math.hypot(x - lake.x, z - lake.z) < lake.r && h < lake.level - 2) return 'LAKE';
    }
    if (h < -12) return 'DEEP';
    if (h < -1.5) return 'SHALLOW';
    if (Math.hypot(x - HERBIVORE_ISLAND.x, z - HERBIVORE_ISLAND.z) < HERBIVORE_ISLAND.r * 1.4) return 'HERB_ISLAND';
    const b = T.biomeAt(x, z);
    return ({ [BIOME.BEACH]: 'BEACH', [BIOME.GRASS]: 'GRASS', [BIOME.JUNGLE]: 'JUNGLE', [BIOME.MOUNTAIN]: 'MOUNTAIN', [BIOME.VOLCANO]: 'VOLCANO', [BIOME.LAKESHORE]: 'LAKESHORE' })[b] || null;
  }

  rollLevel() {
    return clamp(1 + Math.floor(MAX_WILD_LEVEL * Math.pow(Math.random(), 1.6)), 1, MAX_WILD_LEVEL);
  }

  spawnAt(def, x, z, level = this.rollLevel(), opts = {}) {
    const T = this.terrain;
    let y = T.getHeight(x, z);
    const wl = T.waterLevelAt(x, z);
    if (def.habitat === 'water') y = clamp(wl - rand(2, 8), y + 1, wl - 1.2);
    if (def.habitat === 'air' && !opts.tamed) y = Math.max(y, wl) + rand(18, 45);
    const c = new Creature(def, level, new THREE.Vector3(x, y, z), opts);
    this.list.push(c);
    return c;
  }

  trySpawnGroup(avoid = null, minDist = 0) {
    const T = this.terrain;
    for (let tries = 0; tries < 12; tries++) {
      const x = rand(-HALF + 60, HALF - 60), z = rand(-HALF + 60, HALF - 60);
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < minDist) continue;
      const zone = this.zoneAt(x, z);
      if (!zone) continue;
      const options = [];
      for (const d of CREATURE_LIST) for (const [tag, w] of d.spawn) if (tag === zone) options.push({ d, weight: w });
      if (!options.length) continue;
      const { d } = weightedPick(options);
      // never spawn on top of the player's base
      if (this.game.building && this.game.building.nearStructure(x, z, 40)) continue;
      const n = randInt(d.group ? d.group[0] : 1, d.group ? d.group[1] : 1);
      for (let i = 0; i < n; i++) {
        const gx = x + rand(-8, 8), gz = z + rand(-8, 8);
        if (d.habitat === 'land' && T.isWater(gx, gz, 0.6)) continue;
        if (d.habitat === 'water' && !T.isWater(gx, gz, 3)) continue;
        this.spawnAt(d, gx, gz);
      }
      return true;
    }
    return false;
  }

  populate() {
    let guard = 0;
    while (this.wildCount() < this.targetPopulation && guard++ < 2000) this.trySpawnGroup();
  }

  wildCount() {
    let n = 0;
    for (const c of this.list) if (!c.tamed && !c.dead) n++;
    return n;
  }

  // ---------- model management ----------
  ensureModel(c) {
    if (c.rig) return;
    c.rig = buildCreatureModel(c.def);
    c.rig.root.traverse((o) => { o.frustumCulled = true; });
    this.scene.add(c.rig.root);
    if (c.saddle) this.attachSaddle(c);
  }

  dropModel(c) {
    if (!c.rig) return;
    this.scene.remove(c.rig.root);
    c.rig.root.traverse((o) => { if (o.material && o.material !== SADDLE_MAT && o.material.dispose) o.material.dispose(); });
    c.rig = null;
  }

  attachSaddle(c) {
    if (!c.rig || c.rig.saddleMesh) return;
    const s = c.rig.scale;
    const g = new THREE.Group();
    const seat = new THREE.Mesh(SADDLE_GEO.seat, SADDLE_MAT);
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(SADDLE_GEO.back, SADDLE_MAT);
    back.position.set(0, 0.15, -0.4);
    g.add(back);
    g.position.set(0, (c.def.seatHeight - 0.15) / s, 0);
    g.scale.setScalar(1 / s * Math.max(1, c.def.radius * 0.8));
    c.rig.root.add(g);
    c.rig.saddleMesh = g;
  }

  removeSaddleMesh(c) {
    if (c.rig && c.rig.saddleMesh) {
      c.rig.root.remove(c.rig.saddleMesh);
      c.rig.saddleMesh = null;
    }
  }

  remove(c) {
    this.dropModel(c);
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
  }

  // ---------- damage & combat ----------
  damage(c, amount, opts = {}) {
    if (c.dead) return;
    const g = this.game;
    let dmg = amount;
    if (c.saddle) dmg *= 1 - (ITEMS[c.saddle.id].armor || 0) / ((ITEMS[c.saddle.id].armor || 0) + 100);
    c.hp -= dmg;
    c.flash = 1;
    if (opts.torpor) {
      if (opts.overTime) c.dotTorpor += opts.torpor;
      else this.addTorpor(c, opts.torpor);
    }
    if (c.ko && c.taming && dmg > 0) {
      c.taming.eff = Math.max(0, c.taming.eff - 0.05 - dmg / c.hpMax * 0.5);
    }
    if (opts.source) {
      c.lastAggressor = opts.source;
      this.react(c, opts.source);
    }
    if (dmg > 0 && Math.random() < 0.6) g.audio.creature('hurt', c.def.radius, this.distToPlayer(c));
    if (c.hp <= 0) this.kill(c, opts.source);
  }

  addTorpor(c, amt) {
    if (c.dead) return;
    c.torpor = Math.min(c.torporMax * 1.05, c.torpor + amt);
    if (!c.ko && c.torpor >= c.torporMax) this.knockOut(c);
  }

  knockOut(c) {
    c.ko = true;
    c.state = 'ko';
    c.flying = false;
    c.speed = 0;
    c.target = null;
    if (c.rider) this.game.dismount(true);
    if (!c.tamed && c.def.tameable) {
      const req = c.def.tameAffinity * (1 + 0.08 * (c.level - 1));
      c.taming = { affinity: 0, required: req, eff: 1, hunger: 0, lastFood: null };
      // the creature eats its first item once it has burned off that much food
      c.food = c.foodMax;
    }
    this.game.hud.notify(`${c.displayName} (Lvl ${c.level}) has been knocked out!`, 'good');
  }

  wake(c) {
    c.ko = false;
    c.torpor = 0;
    c.state = c.tamed ? 'idle' : 'wander';
    if (!c.tamed) {
      c.taming = null;
      if (c.def.temper === 'aggressive' || c.def.temper === 'territorial') {
        c.target = this.game.playerTarget();
        c.state = 'chase';
      } else c.state = 'flee';
      if (c.def.habitat === 'air') c.flying = true;
      if (this.distToPlayer(c) < 60) this.game.hud.notify(`${c.displayName} woke up!`, 'bad');
    }
  }

  react(c, source) {
    if (c.tamed || c.ko || c.dead) return;
    const t = c.def.temper;
    if (t === 'aggressive' || t === 'territorial') {
      c.target = source;
      c.state = 'chase';
      c.stateTimer = 20;
      if (c.def.roar) this.game.audio.creature('roar', c.def.radius, this.distToPlayer(c));
      // pack behaviour: nearby same species join in
      if (c.def.id === 'raptor' || c.def.id === 'dilophosaur') {
        for (const o of this.list) {
          if (o !== c && o.def === c.def && !o.tamed && !o.dead && !o.ko && o.pos.distanceTo(c.pos) < 30) {
            o.target = source; o.state = 'chase'; o.stateTimer = 20;
          }
        }
      }
    } else if (c.def.fleeOnHit || t === 'skittish' || t === 'passive') {
      if (c.def.fleeOnHit || t === 'skittish') {
        c.state = 'flee';
        c.stateTimer = rand(6, 10);
        c.target = source;
        if (c.def.habitat === 'air') c.flying = true;
      }
    }
  }

  kill(c, source) {
    c.dead = true;
    c.hp = 0;
    c.state = 'dead';
    c.ko = false;
    c.taming = null;
    c.speed = 0;
    c.flying = false;
    const scale = 1 + c.level * 0.02;
    c.corpse = { drops: Object.fromEntries(Object.entries(c.def.drops).map(([k, v]) => [k, v * scale])), decay: 600 };
    if (c.rider) this.game.dismount(true);
    const g = this.game;
    if (source && source.isPlayer) {
      const xp = c.def.xp * (1 + 0.1 * (c.level - 1));
      g.giveXP(xp);
      g.hud.notify(`Killed ${c.displayName} - Lvl ${c.level}`, 'neutral');
    } else if (source && source.creature && source.creature.tamed) {
      const xp = c.def.xp * (1 + 0.1 * (c.level - 1));
      this.giveTameXP(source.creature, xp);
    }
    if (c.tamed) g.hud.notify(`Your ${c.displayName} - Lvl ${c.level} was killed!`, 'bad');
    if (c.rig) flashRig(c.rig, 0);
  }

  giveTameXP(c, xp) {
    c.xp += xp;
    const need = () => 10 * Math.pow(c.level, 1.5);
    while (c.xp >= need() && c.level < 300) {
      c.xp -= need();
      c.level++;
      c.levelUpsAvailable++;
    }
  }

  distToPlayer(c) {
    const p = this.game.player.pos;
    return Math.hypot(c.pos.x - p.x, c.pos.y - p.y, c.pos.z - p.z);
  }

  // Force-feed an item from the player's inventory (narcotics) or tame food.
  feed(c, itemId) {
    const g = this.game;
    const def = ITEMS[itemId];
    if (!g.player.inventory.remove(itemId, 1)) return false;
    if (itemId === 'narcoberry') this.addTorpor(c, c.torporMax * 0.04 + 7.5);
    else if (itemId === 'narcotic') this.addTorpor(c, c.torporMax * 0.18 + 40);
    else if (itemId === 'stimberry') c.torpor = Math.max(0, c.torpor - c.torporMax * 0.04);
    else if (itemId === 'stimulant') c.torpor = Math.max(0, c.torpor - c.torporMax * 0.2);
    else if (TAME_FOOD_VALUE[itemId]) c.inventory.add(itemId, 1);
    else return false;
    g.audio.play('eat');
    return def;
  }

  // Estimated seconds to finish taming with food in its inventory.
  tameEstimate(c) {
    if (!c.taming) return null;
    const left = c.taming.required - c.taming.affinity;
    const mult = this.game.settings.tamingSpeed;
    for (const [id, ratio] of c.def.tameFoods) {
      if (c.inventory.count(id) > 0) {
        const perItem = TAME_FOOD_VALUE[id] * ratio * mult;
        const items = Math.ceil(left / perItem);
        const time = (items * TAME_FOOD_VALUE[id]) / (c.def.tameDrain * mult);
        return { item: id, items, have: c.inventory.count(id), time };
      }
    }
    return { item: c.def.tameFoods[0][0], items: Math.ceil(left / (TAME_FOOD_VALUE[c.def.tameFoods[0][0]] * c.def.tameFoods[0][1] * mult)), have: 0, time: Infinity };
  }

  updateTaming(c, dt) {
    const t = c.taming;
    const mult = this.game.settings.tamingSpeed;
    c.food = Math.max(0, c.food - dt * c.def.tameDrain * mult);
    // eat when there's room for the next item
    for (const [id, ratio] of c.def.tameFoods) {
      if (c.inventory.count(id) <= 0) continue;
      const val = TAME_FOOD_VALUE[id];
      if (c.foodMax - c.food >= val) {
        c.inventory.remove(id, 1);
        c.food += val;
        t.affinity += val * ratio * mult;
        t.lastFood = id;
        if (this.distToPlayer(c) < 40) this.game.audio.play('eat');
      }
      break; // only the most preferred available food is eaten
    }
    if (t.affinity >= t.required) this.completeTame(c);
  }

  completeTame(c) {
    const g = this.game;
    const bonus = Math.floor(c.level * 0.5 * c.taming.eff);
    const eff = Math.round(c.taming.eff * 100);
    c.tamed = true;
    c.owned = true;
    c.ko = false;
    c.torpor = 0;
    c.taming = null;
    c.state = 'idle';
    c.follow = false;
    c.aggression = 'neutral';
    // bonus levels from taming effectiveness go into random stats
    for (let i = 0; i < bonus; i++) c.points[pick(WILD_POINT_STATS)]++;
    c.level += bonus;
    c.recalc();
    c.hp = c.hpMax * 0.5;
    c.food = c.foodMax * 0.5;
    if (c.def.habitat === 'air') c.flying = false;
    g.giveXP(c.def.xp * 2 * (1 + 0.1 * (c.baseLevel - 1)));
    g.audio.play('tame');
    g.hud.notify(`${c.def.name} tamed! Level ${c.level} (${eff}% Taming Effectiveness, +${bonus} levels)`, 'good', 6);
    g.ui.promptRename(c);
  }

  // ---------- per-frame update ----------
  update(dt) {
    const g = this.game;
    const P = g.player.pos;
    const night = g.sky.isNight;

    // population upkeep
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 8;
      if (this.wildCount() < this.targetPopulation) this.trySpawnGroup(P, 260);
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const dx = c.pos.x - P.x, dz = c.pos.z - P.z;
      const d = Math.hypot(dx, dz);
      const r = c.def.radius;
      const bigView = r > 2.5 ? 900 : r >= 1.5 ? VISIBLE_RADIUS : r >= 0.8 ? 300 : 190;
      const shouldRender = d < bigView || c.tamed;
      const active = d < ACTIVE_RADIUS || c.tamed || c.rider;

      if (c.dead) {
        c.corpse.decay -= dt;
        const empty = Object.values(c.corpse.drops).every((v) => v < 0.5) && c.inventory.stacks.length === 0;
        if (c.corpse.decay <= 0 || empty) { this.remove(c); continue; }
      }

      if (shouldRender) this.ensureModel(c);
      else if (c.rig && d > bigView + 80) this.dropModel(c);

      if (!active) {
        if (!c.tamed && !c.dead && d > 1600 && Math.random() < dt * 0.002) this.remove(c); // slow churn of far wildlife
        continue;
      }

      if (!c.dead) this.think(c, dt, d, night);
      if ((c.tamed || c.ko) && c.inventory.stacks.length) c.inventory.update(dt);
      this.physics(c, dt);
      this.render(c, dt, d);
    }
    this.updateProjectiles(dt);
  }

  think(c, dt, distPlayer, night) {
    const g = this.game;
    const def = c.def;
    c.attackCd -= dt;
    if (c.attackAnim > 0) c.attackAnim = Math.max(0, c.attackAnim - dt * 2.2);
    if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 4);

    // torpor over time (tranquilizers)
    if (c.dotTorpor > 0) {
      const amt = Math.min(c.dotTorpor, dt * Math.max(15, c.dotTorpor * 0.6));
      c.dotTorpor -= amt;
      this.addTorpor(c, amt);
    }

    if (c.ko) {
      // unconscious: torpor slowly wears off
      // how long it stays down scales with how long the tame takes (narcotics needed for long tames)
      const req = c.taming ? c.taming.required : def.tameAffinity * (1 + 0.08 * (c.level - 1));
      const sleep = (req / (Math.max(0.1, def.tameDrain) * 1.5) * 0.45 + 30) / g.settings.tamingSpeed;
      c.torpor -= dt * (c.torporMax / sleep) * (c.tamed ? 4 : 1);
      if (c.taming) this.updateTaming(c, dt);
      if (c.ko && c.torpor <= 0) this.wake(c);
      return;
    }
    if (c.torpor > 0) c.torpor = Math.max(0, c.torpor - dt * c.torporMax * 0.03);

    if (c.tamed) { this.thinkTamed(c, dt, distPlayer); return; }

    c.decisionTimer -= dt;
    c.stateTimer -= dt;
    const player = g.playerTarget();
    const playerAlive = !g.player.dead && g.state === 'playing';
    const stealth = g.player.stance === 'prone' ? 0.4 : g.player.stance === 'crouch' ? 0.65 : 1;
    let aggro = def.aggroRange * stealth * (def.nocturnalBoost && night ? 1.5 : 1);
    if (g.player.riding) aggro *= 1.3;

    if (c.decisionTimer <= 0) {
      c.decisionTimer = rand(0.25, 0.5);
      // aggressive creatures look for prey
      if (def.temper === 'aggressive' && c.state !== 'chase' && c.state !== 'flee') {
        const pTarget = player;
        const pd = pTarget.creature ? pTarget.creature.distTo(c.pos) : distPlayer;
        if (playerAlive && pd < aggro && this.canReach(c, pTarget)) {
          c.target = pTarget;
          c.state = 'chase';
          c.stateTimer = 25;
          if (def.roar && Math.random() < 0.7) g.audio.creature('roar', def.radius, distPlayer);
          if (def.frill) c.aggroFx = 1;
        } else if (distPlayer < 220 && Math.random() < 0.15) {
          // hunt other creatures (smaller ones, or tamed ones) nearby
          let best = null, bd = def.aggroRange * 0.8;
          for (const o of this.list) {
            if (o === c || o.dead || o.def === def) continue;
            if (!o.tamed && (o.def.radius > def.radius * 1.2 || o.def.diet === 'carnivore' || def.habitat !== o.def.habitat)) continue;
            const od = o.pos.distanceTo(c.pos);
            if (od < bd) { bd = od; best = o; }
          }
          if (best) { c.target = { creature: best }; c.state = 'chase'; c.stateTimer = 15; }
        }
      }
      if (def.temper === 'skittish' && c.state !== 'flee' && playerAlive && distPlayer < 14 * stealth) {
        c.state = 'flee'; c.target = player; c.stateTimer = rand(6, 10);
        if (def.habitat === 'air') c.flying = true;
      }
    }

    switch (c.state) {
      case 'chase': {
        const tgt = c.target;
        const tpos = this.targetPos(tgt);
        if (!tpos || c.stateTimer <= 0 || this.targetDead(tgt)) { c.state = 'wander'; c.target = null; break; }
        const d = Math.hypot(tpos.x - c.pos.x, tpos.z - c.pos.z);
        // leash: give up if the target got far away or into water we can't follow
        if (d > Math.max(aggro, def.aggroRange) * 2.5 + 20 || !this.canReach(c, tgt)) { c.state = 'wander'; c.target = null; break; }
        c.goal = tpos;
        c.desiredSpeed = def.run || def.swim || def.fly;
        // stamina: big creatures slow down when exhausted
        c.stamina = Math.max(0, c.stamina - dt * 3);
        if (c.stamina <= 0) c.desiredSpeed = (def.walk || def.swim) * 1.4;
        // ranged spit
        if (def.spit && d > 4 && d < def.spit.range && c.attackCd <= 0 && tgt.isPlayer) {
          c.attackCd = 3.5;
          c.attackAnim = 1;
          this.spit(c, tpos);
        }
        const reach = this.reachTo(c, tgt);
        if (reach <= def.attackRange && c.attackCd <= 0) this.attack(c, tgt);
        break;
      }
      case 'flee': {
        const tpos = this.targetPos(c.target) || this.game.player.pos;
        const ax = c.pos.x - tpos.x, az = c.pos.z - tpos.z;
        const l = Math.hypot(ax, az) || 1;
        c.goal = { x: c.pos.x + (ax / l) * 30, y: c.pos.y, z: c.pos.z + (az / l) * 30 };
        c.desiredSpeed = def.run || def.swim || def.fly;
        if (c.stateTimer <= 0) { c.state = 'wander'; c.target = null; }
        break;
      }
      case 'idle':
        c.desiredSpeed = 0;
        if (c.stateTimer <= 0) { c.state = 'wander'; c.stateTimer = rand(4, 12); c.goal = this.pickWanderGoal(c); }
        break;
      case 'wander':
      default:
        if (!c.goal || c.stateTimer <= 0 || this.reached(c, c.goal)) {
          if (Math.random() < 0.4 && def.habitat !== 'water') { c.state = 'idle'; c.stateTimer = rand(2, 8); c.goal = null; }
          else { c.goal = this.pickWanderGoal(c); c.stateTimer = rand(6, 16); }
        }
        c.desiredSpeed = def.walk || (def.swim ? def.swim * 0.5 : 0) || (def.fly ? def.fly * 0.6 : 0);
        // flyers occasionally land
        if (def.habitat === 'air' && Math.random() < dt * 0.01) c.flying = !c.flying;
        break;
    }
  }

  thinkTamed(c, dt, distPlayer) {
    const g = this.game;
    const def = c.def;
    if (c.rider) return; // controlled by the rider
    // hunger
    c.food = Math.max(0, c.food - dt * 0.15);
    if (c.food < c.foodMax - 60) {
      for (const [id] of def.tameFoods) {
        if (c.inventory.count(id) > 0) { c.inventory.remove(id, 1); c.food = Math.min(c.foodMax, c.food + TAME_FOOD_VALUE[id]); break; }
      }
    }
    if (c.food <= 0) { c.hp -= dt * c.hpMax * 0.002; if (c.hp <= 0) this.kill(c, null); }
    else if (c.hp < c.hpMax) c.hp = Math.min(c.hpMax, c.hp + dt * c.hpMax * 0.004);

    c.decisionTimer -= dt;
    if (c.decisionTimer <= 0) {
      c.decisionTimer = 0.4;
      // defend / attack according to aggression
      if (c.state !== 'chase' && c.aggression !== 'passive') {
        let best = null, bd = c.aggression === 'aggressive' ? 25 : 0;
        for (const o of this.list) {
          if (o === c || o.tamed || o.dead || o.ko) continue;
          const od = o.pos.distanceTo(c.pos);
          const hostile = o.target && (o.target.isPlayer || (o.target.creature && o.target.creature.tamed));
          if ((c.aggression === 'aggressive' && od < bd) || (hostile && od < 25)) { bd = od; best = o; }
        }
        if (best) { c.target = { creature: best }; c.state = 'chase'; c.stateTimer = 20; }
      }
    }
    c.stateTimer -= dt;
    if (c.state === 'chase') {
      const tgt = c.target;
      const tpos = this.targetPos(tgt);
      if (!tpos || this.targetDead(tgt) || c.stateTimer <= 0 || (tgt.creature && tgt.creature.ko)) { c.state = 'idle'; c.target = null; }
      else {
        c.goal = tpos;
        c.desiredSpeed = def.run || def.swim || def.fly;
        if (this.reachTo(c, tgt) <= def.attackRange && c.attackCd <= 0) this.attack(c, tgt);
        return;
      }
    }
    if (c.follow) {
      const p = g.player.pos;
      const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z);
      const followDist = 4 + def.radius * 2;
      if (d > followDist) {
        c.goal = { x: p.x, y: p.y, z: p.z };
        c.desiredSpeed = d > followDist * 3 ? (def.run || def.swim) : (def.walk || def.swim) * 1.6;
        if (def.habitat === 'air') c.desiredSpeed = d > 20 ? def.fly : def.walk * 1.5;
        c.flying = def.habitat === 'air' && d > 25;
      } else {
        c.goal = null;
        c.desiredSpeed = 0;
        if (def.habitat === 'air' && c.flying && d < 12) c.flying = false;
      }
    } else {
      c.goal = null;
      c.desiredSpeed = 0;
      if (def.habitat === 'air') c.flying = false;
    }
  }

  targetPos(t) {
    if (!t) return null;
    if (t.isPlayer) return this.game.player.riding ? this.game.player.riding.pos : this.game.player.pos;
    if (t.creature) return t.creature.pos;
    return null;
  }

  targetDead(t) {
    if (!t) return true;
    if (t.isPlayer) return this.game.player.dead;
    if (t.creature) return t.creature.dead || !this.list.includes(t.creature);
    return true;
  }

  canReach(c, t) {
    const tpos = this.targetPos(t);
    if (!tpos) return false;
    const T = this.terrain;
    const water = T.waterLevelAt(tpos.x, tpos.z);
    const deep = water - T.getHeight(tpos.x, tpos.z) > 2.5;
    const targetUnder = tpos.y < water - 1.5;
    if (c.def.habitat === 'water') return deep && tpos.y < water + 0.5;
    if (c.def.habitat === 'land') return !deep || tpos.y > water - 0.5 || c.def.radius > 1.5;
    if (c.def.habitat === 'air') return !targetUnder;
    return true;
  }

  reachTo(c, t) {
    if (t.isPlayer) {
      if (this.game.player.riding) return this.game.player.riding.distTo(c.headPos(this.tmpV));
      const p = this.game.player.pos;
      const head = c.headPos(this.tmpV);
      // distance from the creature's head to the survivor's body capsule
      const py = clamp(head.y, p.y, p.y + 1.8);
      return Math.max(0, Math.hypot(head.x - p.x, head.y - py, head.z - p.z) - 0.45);
    }
    if (t.creature) return t.creature.distTo(c.headPos(this.tmpV));
    return Infinity;
  }

  reached(c, goal) {
    return Math.hypot(goal.x - c.pos.x, goal.z - c.pos.z) < 3 + c.def.radius;
  }

  pickWanderGoal(c) {
    const T = this.terrain;
    const def = c.def;
    for (let i = 0; i < 8; i++) {
      const a = rand(-Math.PI, Math.PI);
      const r = rand(10, 40) * (def.habitat === 'air' ? 3 : 1);
      // stay loosely near home
      const hx = c.home.x - c.pos.x, hz = c.home.z - c.pos.z;
      const homePull = Math.hypot(hx, hz) > 120 ? 0.7 : 0;
      const x = c.pos.x + Math.cos(a) * r * (1 - homePull) + hx * homePull * 0.3;
      const z = c.pos.z + Math.sin(a) * r * (1 - homePull) + hz * homePull * 0.3;
      if (Math.abs(x) > HALF - 40 || Math.abs(z) > HALF - 40) continue;
      const depth = T.waterLevelAt(x, z) - T.getHeight(x, z);
      if (def.habitat === 'land' && depth > 0.5) continue;
      if (def.habitat === 'water' && depth < 4) continue;
      if (def.habitat === 'amphibious' && depth > 6) continue;
      if (def.habitat === 'land' && T.getNormal(x, z).y < 0.7) continue;
      return { x, y: T.getHeight(x, z), z };
    }
    return { x: c.pos.x + rand(-5, 5), y: c.pos.y, z: c.pos.z + rand(-5, 5) };
  }

  attack(c, tgt) {
    const def = c.def;
    c.attackCd = def.attackRate * rand(0.9, 1.15);
    c.attackAnim = 1;
    const dmg = def.damage * c.damageMult;
    const g = this.game;
    g.audio.creature('bite', def.radius, this.distToPlayer(c));
    if (tgt.isPlayer) {
      if (g.player.riding) {
        this.damage(g.player.riding, dmg, { source: { creature: c } });
      } else {
        g.hurtPlayer(dmg, { torpor: def.poisonTorpor || 0, source: c });
      }
    } else if (tgt.creature) {
      this.damage(tgt.creature, dmg, { source: { creature: c } });
    }
  }

  // Tamed creature attack controlled by its rider: hits creatures, corpses and resource nodes in front.
  riderAttack(c) {
    if (c.attackCd > 0) return;
    const g = this.game;
    const def = c.def;
    c.attackCd = def.attackRate * 0.8;
    c.attackAnim = 1;
    const head = c.headPos(new THREE.Vector3());
    const fwd = c.forward(new THREE.Vector3());
    const reach = def.attackRange + 1;
    let hit = null, hd = Infinity;
    for (const o of this.list) {
      if (o === c) continue;
      const d = o.distTo(head);
      if (d < reach && d < hd) {
        const to = new THREE.Vector3().subVectors(o.pos, c.pos).setY(0).normalize();
        if (to.dot(fwd) > 0.2 || d < 1) { hit = o; hd = d; }
      }
    }
    const dmg = def.damage * c.damageMult;
    g.audio.creature('bite', def.radius, 0);
    if (hit) {
      if (hit.dead) { g.harvestCorpse(hit, 'creature', c); return; }
      this.damage(hit, dmg, { source: { creature: c, riddenBy: g.player } });
      return;
    }
    // gather from resource nodes
    const prof = TAME_HARVEST[def.id];
    if (!prof) return;
    const nodes = g.resources.query(head.x, head.z, reach + 2, []);
    let best = null, bd = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - head.x, n.z - head.z) - n.radius;
      if (d < bd && d < reach + 1) { bd = d; best = n; }
    }
    if (!best || !prof[best.cls]) return;
    const gains = {};
    for (const [item, amt] of Object.entries(prof[best.cls])) {
      const v = amt * g.settings.harvestAmount * rand(0.7, 1.3);
      c.harvestAcc[item] = (c.harvestAcc[item] || 0) + v;
      const whole = Math.floor(c.harvestAcc[item]);
      if (whole > 0) { c.harvestAcc[item] -= whole; c.inventory.add(item, whole); gains[item] = whole; }
    }
    best.hp -= dmg;
    if (best.hp <= 0) g.resources.deplete(best, g.settings.resourceRespawn);
    g.audio.play(best.cls === 'tree' ? 'wood' : best.cls === 'bush' ? 'bush' : 'stone');
    for (const [item, n] of Object.entries(gains)) g.hud.itemGain(item, n);
  }

  spit(c, tpos) {
    const head = c.headPos(new THREE.Vector3());
    const target = new THREE.Vector3(tpos.x, tpos.y + 1.4, tpos.z);
    const dir = target.sub(head).normalize();
    const mesh = new THREE.Mesh(SPIT_GEO, SPIT_MAT);
    mesh.position.copy(head);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, vel: dir.multiplyScalar(20), life: 1.5, from: c });
  }

  updateProjectiles(dt) {
    const g = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vel.y -= 4 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const pp = g.player.pos;
      const hit = !g.player.dead && Math.hypot(p.mesh.position.x - pp.x, p.mesh.position.z - pp.z) < 0.7 && p.mesh.position.y > pp.y && p.mesh.position.y < pp.y + 2;
      if (hit) {
        g.hurtPlayer(p.from.def.spit.damage, { source: p.from });
        g.player.blind = p.from.def.spit.blind;
      }
      if (hit || p.life <= 0 || p.mesh.position.y < this.terrain.getHeight(p.mesh.position.x, p.mesh.position.z)) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // ---------- movement ----------
  physics(c, dt) {
    const T = this.terrain;
    const def = c.def;
    const world = this.game.world;
    if (c.rider) return; // rider code moves it

    let desired = 0;
    if (!c.dead && !c.ko && c.goal) {
      const dx = c.goal.x - c.pos.x, dz = c.goal.z - c.pos.z;
      const targetYaw = Math.atan2(dx, dz);
      const turn = (def.turnRate || 3) * (c.flying ? 0.8 : 1) / Math.max(0.6, Math.sqrt(def.radius));
      c.yaw = approachAngle(c.yaw, targetYaw, turn * dt * 1.5);
      const align = Math.max(0, Math.cos(wrapAngle(targetYaw - c.yaw)));
      desired = (c.desiredSpeed || 0) * c.speedMult * (0.3 + 0.7 * align);
      if (Math.hypot(dx, dz) < 1.5) desired = 0;
    }
    if (c.dead || c.ko) desired = 0;
    c.speed = lerp(c.speed, desired, Math.min(1, dt * 3));

    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    let nx = c.pos.x + fx * c.speed * dt;
    let nz = c.pos.z + fz * c.speed * dt;
    const waterL = T.waterLevelAt(nx, nz);
    const groundN = T.getHeight(nx, nz);
    const depth = waterL - groundN;

    if (def.habitat === 'water') {
      if (depth < 3 && !c.dead) { nx = c.pos.x; nz = c.pos.z; c.goal = this.pickWanderGoal(c); c.yaw += Math.PI * 0.5; }
      let ty = c.dead ? T.getHeight(nx, nz) + 0.5 : clamp(c.goal && c.goal.y !== undefined && c.state === 'chase' ? c.goal.y + 0.8 : waterL - c.swimDepth, T.getHeight(nx, nz) + 1, waterL - 1);
      c.pos.y = lerp(c.pos.y, ty, Math.min(1, dt * 1.5));
    } else if (def.habitat === 'air' && (c.flying || c.state === 'flee') && !c.dead && !c.ko) {
      c.flying = true;
      const base = Math.max(T.getHeight(nx, nz), waterL);
      let ty = base + c.altitude;
      if (c.state === 'chase' && c.goal) ty = c.goal.y + 1.5;
      c.pos.y = lerp(c.pos.y, Math.max(ty, base + 1.5), Math.min(1, dt * 1.2));
      if (c.speed < (def.fly || 10) * 0.5) c.speed = lerp(c.speed, (def.fly || 10) * 0.6, dt);
    } else {
      // ground / swimming at the surface
      const deepForMe = depth > Math.max(1.2, def.height * 0.7);
      if (def.habitat === 'land' && deepForMe && !c.dead && !c.tamed && c.state !== 'chase') {
        nx = c.pos.x; nz = c.pos.z;
        c.goal = this.pickWanderGoal(c);
      }
      const ground = world.groundAt(nx, nz, c.pos.y + 0.5, true);
      let y = ground;
      const deepHere = waterL - ground > Math.max(1.2, def.height * 0.7);
      if (deepHere && !c.dead) y = waterL - def.height * 0.55;
      // steep slopes stop land creatures
      if (!deepHere && ground - c.pos.y > 1.2 + def.radius && !c.dead) { nx = c.pos.x; nz = c.pos.z; c.goal = this.pickWanderGoal(c); y = c.pos.y; }
      c.pos.y = (c.dead || c.ko) && def.habitat === 'air' ? lerp(c.pos.y, y, Math.min(1, dt * 3)) : y;
      if (c.flying && def.habitat === 'air' && (c.dead || c.ko)) c.flying = false;
    }
    // structures block creatures
    if (world.collideStructures) {
      const r = world.collideStructures(nx, nz, Math.min(def.radius, 2.5), c.pos.y, c.pos.y + def.height);
      nx = r.x; nz = r.z;
    }
    c.pos.x = clamp(nx, -HALF + 10, HALF - 10);
    c.pos.z = clamp(nz, -HALF + 10, HALF - 10);
  }

  render(c, dt, dist) {
    if (!c.rig) return;
    const rig = c.rig;
    const shadows = dist < 90;
    if (rig.shadows !== shadows) {
      rig.shadows = shadows;
      rig.root.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
    }
    rig.root.position.copy(c.pos);
    rig.root.rotation.set(0, c.yaw, 0);
    const lying = c.ko || c.dead;
    if (lying) {
      rig.root.rotation.z = LIE_ANGLE;
      rig.root.position.y += c.def.radius * 0.35;
    }
    if (c.flying && c.def.habitat === 'air') {
      rig.root.rotation.x = clamp(-c.vel.y * 0.02, -0.4, 0.4);
    }
    if (dist < 220 || c.rider) {
      c.noiseT += dt;
      animateRig(rig, c.def, {
        time: c.noiseT, speed: c.speed, attack: c.attackAnim, dead: c.dead, ko: c.ko,
        flying: c.flying, aggro: c.state === 'chase',
      }, dt);
    }
    if (c.flash > 0 || rig._flashed) {
      flashRig(rig, c.flash * 0.7);
      rig._flashed = c.flash > 0;
    }
  }

  // ---------- queries ----------
  raycast(origin, dir, maxDist, ignore = null) {
    let best = null;
    for (const c of this.list) {
      if (c === ignore || !c.rig) continue;
      if (Math.hypot(c.pos.x - origin.x, c.pos.z - origin.z) > maxDist + c.def.radius * 4 + 10) continue;
      const t = c.raycast(origin, dir, maxDist);
      if (t !== null && (!best || t < best.dist)) best = { creature: c, dist: t };
    }
    return best;
  }

  // Keep the survivor out of creature bodies.
  pushPlayer(pos, radius) {
    for (const c of this.list) {
      if (c.rider || c.dead) continue;
      if (Math.abs(c.pos.x - pos.x) > 12 || Math.abs(c.pos.z - pos.z) > 12) continue;
      for (const h of c.hitSpheres()) {
        if (pos.y > h.y + h.r || pos.y + 1.7 < h.y - h.r) continue;
        const dx = pos.x - h.x, dz = pos.z - h.z;
        const d = Math.hypot(dx, dz);
        const min = h.r * 0.85 + radius;
        if (d < min && d > 1e-4) {
          pos.x = h.x + (dx / d) * min;
          pos.z = h.z + (dz / d) * min;
        }
      }
    }
  }

  tamedList() {
    return this.list.filter((c) => c.tamed && !c.dead);
  }

  whistle(cmd, nearPos, radius = 60) {
    let n = 0;
    for (const c of this.list) {
      if (!c.tamed || c.dead || c.ko || c.rider) continue;
      if (c.pos.distanceTo(nearPos) > radius) continue;
      if (cmd === 'follow') { c.follow = true; c.state = 'idle'; c.target = null; }
      else if (cmd === 'stay') { c.follow = false; c.state = 'idle'; c.target = null; c.goal = null; }
      else c.aggression = cmd;
      n++;
    }
    return n;
  }

  serializeTamed() {
    return this.list.filter((c) => c.tamed && !c.dead).map((c) => c.serialize());
  }

  restoreTamed(list) {
    if (!Array.isArray(list)) return;
    for (const d of list) {
      const def = CREATURES[d.type];
      if (!def) continue;
      const c = new Creature(def, d.baseLevel || d.level, new THREE.Vector3(...d.pos), {
        id: d.id, yaw: d.yaw, points: d.points, tamedPoints: d.tamedPoints, hp: d.hp, food: d.food,
        tamed: true, owned: true, name: d.name, follow: d.follow, aggression: d.aggression, xp: d.xp,
        inventory: d.inventory, saddle: d.saddle, levelUpsAvailable: d.levelUpsAvailable,
      });
      c.level = d.level;
      c.state = 'idle';
      c.recalc();
      c.hp = d.hp ?? c.hpMax;
      this.list.push(c);
    }
  }
}

export const TAMED_LEVEL_STATS = ['health', 'stamina', 'weight', 'melee', 'food', 'speed'];
