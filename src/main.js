// ARK: Survival Evolved (June 2015 Early Access) — browser recreation.
// Game controller: boot, main loop, input → actions, interaction, combat, building, riding, save/load.
import * as THREE from 'three';
import { Terrain, HALF, BIOME, VOLCANO } from './world/terrain.js';
import { Sky } from './world/sky.js';
import { Water } from './world/water.js';
import { Resources, YIELDS, NODE_KINDS } from './world/resources.js';
import { Landmarks } from './world/landmarks.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { clamp, lerp, rand, smoothstep, approachAngle } from './core/util.js';
import { Player } from './game/player.js';
import { CreatureManager } from './game/creatures.js';
import { Building } from './game/building.js';
import { ViewModel, SurvivorBody } from './game/playerModel.js';
import { SaveSystem } from './game/save.js';
import { Inventory } from './game/inventory.js';
import { ITEMS } from './data/items.js';
import { ENGRAM_BY_ID, MAX_LEVEL } from './data/engrams.js';
import { MAX_WILD_LEVEL } from './data/creatures.js';
import { HUD } from './ui/hud.js';
import { UI, SPAWN_ZONES } from './ui/ui.js';

const DEFAULT_SETTINGS = { difficulty: 0.2, dayCycle: 1, tamingSpeed: 1, harvestAmount: 1, xpMult: 1, resourceRespawn: 1, playerDamage: 1, dinoDamage: 1 };
const DEFAULT_OPTIONS = { sensitivity: 1, fov: 80, viewDistance: 1, volume: 0.6, resolution: 1, shadows: true, invertY: false, showFps: false };

// Shared geometries/materials for short-lived objects (avoids leaking GPU buffers)
const SHARED = {
  arrow: new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4).rotateX(Math.PI / 2),
  spear: new THREE.CylinderGeometry(0.025, 0.025, 1.9, 5).rotateX(Math.PI / 2),
  stone: new THREE.SphereGeometry(0.05, 5, 4),
  bullet: new THREE.SphereGeometry(0.03, 4, 3),
  bag: new THREE.DodecahedronGeometry(0.22, 0),
  arrowMat: new THREE.MeshLambertMaterial({ color: '#8a6a3a' }),
  tranqMat: new THREE.MeshLambertMaterial({ color: '#9a7ad8' }),
  stoneMat: new THREE.MeshLambertMaterial({ color: '#888' }),
  bulletMat: new THREE.MeshBasicMaterial({ color: '#ffe0a0' }),
  bagMat: new THREE.MeshLambertMaterial({ color: '#c8a050' }),
};

const MELEE = {
  fists: { range: 2.7, cd: 0.55, dmg: 8, torpor: 10, family: 'fists' },
  pick: { range: 3.1, cd: 0.75, family: 'pick' },
  hatchet: { range: 3.1, cd: 0.75, family: 'hatchet' },
  club: { range: 3.0, cd: 0.8, family: 'fists' },
  spear: { range: 3.9, cd: 0.8, family: 'fists' },
  sword: { range: 3.3, cd: 0.65, family: 'fists' },
  torch: { range: 2.8, cd: 0.7, family: 'fists' },
};

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.save = new SaveSystem();
    this.settings = { ...DEFAULT_SETTINGS, ...(this.save.loadSettings() || {}) };
    this.options = { ...DEFAULT_OPTIONS, ...(this.save.loadOptions() || {}) };
    this.state = 'loading';
    this.thirdPerson = false;
    this.dropped = [];
    this.bodies = [];
    this.projectiles = [];
    this.attackCd = 0;
    this.pendingHit = null;
    this.bowDraw = 0;
    this.drawing = false;
    this.reload = 0;
    this.ammoChoice = {};
    this.eHeld = 0;
    this.eConsumed = false;
    this.targetTimer = 0;
    this.envTimer = 0;
    this.temp = 25;
    this.autosaveTimer = 120;
    this.frames = 0;
    this.fpsTime = 0;
    this.fps = 0;
    this.menuT = 0;
    this.cameraUnderwater = false;
    this.zoom = false;
    this.deathBag = null;
  }

  async boot() {
    const setText = (t) => { document.getElementById('loading-text').textContent = t; };
    const tick = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.options.fov, 1, 0.1, 6000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    setText('Generating The Island…'); await tick();
    this.terrain = new Terrain(2015);
    this.scene.add(this.terrain.group);
    setText('Growing jungles and placing resources…'); await tick();
    this.resources = new Resources(this.scene, this.terrain);
    setText('Raising the Obelisks…'); await tick();
    this.sky = new Sky(this.scene);
    this.water = new Water(this.scene, this.sky);
    this.landmarks = new Landmarks(this);
    this.building = new Building(this);
    this.player = new Player();
    this.hud = new HUD(this);
    this.ui = new UI(this);
    this.viewModel = new ViewModel(this.camera);
    this.body = new SurvivorBody(this.scene);
    this.body.group.visible = false;
    setText('Populating creatures…'); await tick();
    this.creatures = new CreatureManager(this);
    this.creatures.populate();
    this.world = this.makeWorld();
    this.applyOptions();
    document.getElementById('loading').classList.add('hidden');
    this.state = 'menu';
    this.ui.showMain();
    this.lastT = performance.now();
    window.addEventListener('beforeunload', () => { if (this.state === 'playing' || this.state === 'dead') this.saveGame(); });
    this.canvas.addEventListener('click', () => {
      this.audio.resume();
      if ((this.state === 'playing') && !this.ui.isOpen()) this.input.lock();
    });
    requestAnimationFrame((t) => this.frame(t));
  }

  makeWorld() {
    const g = this;
    return {
      groundAt(x, z, footY, creature = false) {
        let y = g.terrain.getHeight(x, z);
        if (!creature) y = Math.max(y, g.resources.surfaceAt(x, z, footY));
        y = Math.max(y, g.building.groundAt(x, z, footY), g.landmarks.groundAt(x, z, footY));
        return y;
      },
      collide(x, z, r, y) {
        let p = g.resources.collide(x, z, r, y);
        p = g.building.collide(p.x, p.z, r, y, y + 1.8);
        if (!g.player.riding) {
          const v = { x: p.x, y, z: p.z };
          g.creatures.pushPlayer(v, r);
          p = { x: v.x, z: v.z };
        }
        return p;
      },
      collideStructures(x, z, r, y0, y1) { return g.building.collide(x, z, r, y0, y1); },
      waterAt(x, z) { return g.terrain.waterLevelAt(x, z); },
      ceilingAt(x, z, y) { return g.building.ceilingAt(x, z, y); },
      footstep() { if (Math.random() < 0.5) g.audio.noise({ dur: 0.07, freq: 300, q: 0.7, gain: 0.08 }); },
      splash() { g.audio.play('splash'); },
      onFallDamage(d) { g.hud.damageFlash(0.6); g.audio.play('hurt'); g.hud.notify(`Fall damage: ${Math.round(d)}`, 'bad'); },
    };
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (!this.renderer) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * (this.options ? this.options.resolution : 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applyOptions() {
    const o = this.options;
    this.camera.fov = o.fov;
    this.camera.updateProjectionMatrix();
    this.audio.setVolume(o.volume);
    this.renderer.shadowMap.enabled = o.shadows;
    this.sky.sun.castShadow = o.shadows;
    this.resize();
  }
  saveOptions() { this.save.saveOptions(this.options); }
  saveSettings() { this.save.saveSettings(this.settings); }

  // ------------------------------------------------------------------ game lifecycle
  resetWorld() {
    this.building.restore([]);
    for (const c of [...this.creatures.list]) this.creatures.remove(c);
    for (const d of this.dropped) this.scene.remove(d.mesh);
    for (const b of this.bodies) this.scene.remove(b.mesh);
    this.dropped = []; this.bodies = []; this.deathBag = null;
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    for (const n of this.resources.nodes) if (n.depleted) { n.depleted = false; n.hp = n.maxHp; this.resources.setNodeVisible(n, true); }
    for (const d of this.landmarks.drops) this.scene.remove(d.group);
    this.landmarks.drops = [];
    this.applyDifficulty();
    this.creatures.populate();
  }

  applyDifficulty() {
    const maxLvl = clamp(Math.round(MAX_WILD_LEVEL * (0.5 + this.settings.difficulty * 2.5)), 5, 150);
    this.creatures.rollLevel = () => clamp(1 + Math.floor(maxLvl * Math.pow(Math.random(), 1.6)), 1, maxLvl);
  }

  newGame(look, choice) {
    this.save.wipe();
    this.resetWorld();
    const p = this.player = new Player();
    p.name = look.name; p.gender = look.gender; p.skin = look.skin;
    p.inventory.add('specimen_implant', 1);
    this.sky.time = 7.5;
    this.sky.day = 1;
    this.placeAtSpawn(choice);
    this.startPlaying();
    this.showTips();
    this.saveGame();
  }

  showTips() {
    const tips = [
      'Welcome to the ARK. You have nothing but the implant in your arm.',
      'Left-click to punch trees for Thatch and Wood. Press E to pick up small stones and harvest bushes for Fiber and berries.',
      'Press I to open your inventory and craft a Stone Pick. Hold H to see your exact stats and the time.',
      'Levelling up gives Engram Points — spend them in the Engrams tab to unlock new recipes.',
      'Drink by pressing E while looking at water. Beware of Dilophosaurs and Raptors.',
    ];
    const run = this.tipRun = (this.tipRun || 0) + 1;
    tips.forEach((t, i) => setTimeout(() => {
      if (this.tipRun === run && this.state === 'playing') this.hud.notify(t, 'neutral', 6.5);
    }, 800 + i * 7500));
  }

  continueGame() {
    const data = this.save.load();
    if (!data) { this.ui.showMain(); return; }
    this.resetWorld();
    this.player = new Player();
    try {
      this.player.restore(data.player);
      this.building.restore(data.structures);
      this.creatures.restoreTamed(data.tamed);
      this.resources.restore(data.depleted);
      this.sky.time = data.time ?? 8;
      this.sky.day = data.day ?? 1;
      for (const b of data.bodies || []) this.createBody(b.x, b.y, b.z, b.inventory, b.life);
    } catch (err) {
      console.error('Failed to load save', err);
      this.hud.notify('Save data was corrupt — starting fresh.', 'bad');
    }
    if (this.player.dead || this.player.health <= 0) { this.player.dead = false; this.player.health = this.player.maxHealth; }
    this.startPlaying();
    this.hud.notify(`Welcome back, ${this.player.name}.`, 'neutral');
  }

  startPlaying() {
    this.state = 'playing';
    this.ui.close();
    this.hud.show(true);
    this.thirdPerson = false;
    this.viewModel.setSkin(this.player.skin);
    this.body.setLook(this.player.skin, this.player.gender);
    this.refreshEquipment();
    this.audio.resume();
    this.audio.startAmbient();
    this.input.lock();
  }

  exitToMenu() {
    if (this.player.riding) this.dismount(true);
    this.saveGame();
    this.state = 'menu';
    this.hud.show(false);
    this.building.hideGhost();
    this.input.unlock();
    this.ui.showMain();
  }

  saveGame() {
    if (this.state !== 'playing' && this.state !== 'dead') return;
    const p = this.player;
    const riding = p.riding;
    const data = {
      player: p.serialize(),
      structures: this.building.serialize(),
      tamed: this.creatures.serializeTamed(),
      depleted: this.resources.serialize(),
      time: this.sky.time, day: this.sky.day,
      bodies: this.bodies.map((b) => ({ x: b.x, y: b.y, z: b.z, inventory: b.inventory.serialize(), life: b.life })),
    };
    if (riding) data.player.pos = [riding.pos.x, riding.pos.y + riding.def.seatHeight, riding.pos.z];
    if (!this.save.save(data)) this.hud.notify('Could not save (storage full or disabled)', 'bad');
  }

  spawnPointForZone(zone, jitter = true) {
    const T = this.terrain;
    const ang = ((zone.angle + (jitter ? rand(-9, 9) : 0)) * Math.PI) / 180;
    const cx = -60, cz = 30;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    // walk outward from the island centre to the main coastline (ignores lakes and offshore islets)
    let found = null;
    for (let r = 300; r < 2000; r += 4) {
      const x = cx + dx * r, z = cz + dz * r;
      if (T.getHeight(x, z) < 1.0 && T.waterLevelAt(x, z) === 0) {
        for (let back = 8; back < 80; back += 2) {
          const bx = x - dx * back, bz = z - dz * back;
          if (T.getHeight(bx, bz) > 1.4 && !T.isWater(bx, bz, 0)) { found = { x: bx, z: bz }; break; }
        }
        if (found) break;
      }
    }
    if (!found) found = { x: cx, z: cz };
    return { x: found.x, y: T.getHeight(found.x, found.z), z: found.z };
  }

  placeAtSpawn(choice) {
    const p = this.player;
    if (choice && choice.bed && this.building.list.includes(choice.bed)) {
      const b = choice.bed;
      p.pos.set(b.x + Math.sin(b.rot) * 1.5, b.y + 0.3, b.z + Math.cos(b.rot) * 1.5);
      if (b.type === 'sleeping_bag') { this.building.remove(b); this.hud.notify('Your Sleeping Bag was used up.', 'warn'); }
    } else {
      const sp = this.spawnPointForZone(choice && choice.zone ? choice.zone : SPAWN_ZONES[1]);
      p.pos.set(sp.x, sp.y, sp.z);
      // face inland
      p.yaw = Math.atan2(sp.x + 60, sp.z - 30);
    }
    p.pos.y = this.world.groundAt(p.pos.x, p.pos.z, p.pos.y + 2) + 0.05;
    p.vel.set(0, 0, 0);
    p.pitch = 0;
  }

  // ------------------------------------------------------------------ UI hooks
  onUIOpened() {
    this.input.unlock();
    this.drawing = false;
  }
  onUIClosed() {
    if (this.state === 'playing') this.input.lock();
  }
  onLockChange(locked) {
    if (!locked && this.state === 'playing' && !this.ui.isOpen()) this.ui.showPause();
  }

  // ------------------------------------------------------------------ main loop
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    // simulate in ≤50 ms steps so slow frames don't turn into slow motion or tunnelling
    const total = Math.min(0.2, Math.max(0.001, (t - this.lastT) / 1000 || 0.016));
    this.lastT = t;
    this.frames++;
    this.fpsTime += total;
    if (this.fpsTime >= 0.5) { this.fps = Math.round(this.frames / this.fpsTime); this.frames = 0; this.fpsTime = 0; }
    const steps = Math.ceil(total / 0.05);
    const dt = total / steps;
    try {
      for (let i = 0; i < steps; i++) {
        if (this.state === 'menu') this.updateMenu(dt);
        else if (this.state === 'playing' || this.state === 'dead') this.update(dt);
        if (i < steps - 1) this.input.endFrame(); // one-shot inputs apply to the first step only
      }
    } catch (err) {
      console.error(err);
    }
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  updateMenu(dt) {
    // slow cinematic flight around the island behind the menu
    this.menuT += dt * 0.02;
    const r = 900;
    const x = Math.cos(this.menuT) * r - 60, z = Math.sin(this.menuT) * r + 200;
    const y = Math.max(this.terrain.getHeight(x, z), 0) + 70;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(VOLCANO.x, 120, VOLCANO.z);
    this.viewModel.root.visible = false;
    this.sky.update(dt, this.camera.position, 2, false);
    this.water.update(dt);
    this.resources.update(dt, this.camera.position);
    this.terrain.updateLOD(this.camera.position.x, this.camera.position.z, 700 * this.options.viewDistance);
    this.building.update(dt);
    this.landmarks.update(0);
    this.creatures.update(dt);
  }

  update(dt) {
    const p = this.player;
    const uiBlocking = this.ui.blocksGame();
    const paused = this.ui.current === 'pause' || this.ui.current === 'options' || this.ui.current === 'controls';
    if (paused) {
      this.updateCamera(0);
      return;
    }
    const canAct = this.state === 'playing' && !uiBlocking && !p.dead && !p.unconscious;

    // look
    if (this.input.locked && !uiBlocking) {
      const sens = 0.0022 * this.options.sensitivity * (this.zoom ? 0.35 : 1);
      p.yaw -= this.input.mouse.dx * sens;
      p.pitch -= this.input.mouse.dy * sens * (this.options.invertY ? -1 : 1);
      p.pitch = clamp(p.pitch, -1.5, 1.5);
    }

    if (canAct) this.handleInput(dt);
    else { this.drawing = false; this.building.hideGhost(); }

    // movement
    if (!p.dead) {
      if (p.riding) this.updateRiding(dt, canAct);
      else p.move(dt, uiBlocking ? { hit: () => false, down: () => false } : this.input, this.world, this.settings);
    }

    // stats & environment
    this.envTimer -= dt;
    if (this.envTimer <= 0) { this.envTimer = 0.5; this.temp = this.computeTemperature(); }
    if (!p.dead) {
      const events = p.updateStats(dt, { temp: this.temp });
      for (const ev of events) {
        if (ev === 'died') this.onPlayerDeath(this.lastDamageSource || 'You died');
        if (ev === 'knocked_out') { this.hud.notify('You have been knocked unconscious!', 'bad'); if (p.riding) this.dismount(true); }
        if (ev === 'woke') this.hud.notify('You woke up.', 'neutral');
      }
      p.inventory.update(dt);
      this.updateCrafting(dt);
      this.updateHeldDurability(dt);
      this.fillWaterskins(dt);
    }

    // world
    this.sky.update(dt, this.camera.position, this.settings.dayCycle, this.cameraUnderwater);
    this.water.update(dt);
    this.resources.update(dt, p.pos, (n) => !this.building.nearStructure(n.x, n.z, 6));
    this.terrain.updateLOD(p.pos.x, p.pos.z, 700 * this.options.viewDistance);
    this.creatures.update(dt);
    this.building.update(dt);
    this.landmarks.update(dt);
    this.updateProjectiles(dt);
    this.updateDropped(dt);
    this.updateStations(dt);

    this.updateCamera(dt);
    this.updateTargeting(dt);
    this.hud.update(dt);
    this.ui.tick();
    this.audio.setAmbient(0.5, this.sky.rain);

    // autosave
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) { this.autosaveTimer = 120; this.saveGame(); }
    document.title = this.options.showFps ? `${this.fps} FPS — ARK 2015` : 'ARK: Survival Evolved (2015) — Fan Recreation';
  }

  // ------------------------------------------------------------------ input → actions
  handleInput(dt) {
    const inp = this.input, p = this.player;
    // hotbar
    for (let i = 0; i < 10; i++) {
      if (inp.hit(`Digit${(i + 1) % 10}`)) this.pressHotbar(i);
    }
    if (inp.mouse.wheel && !this.isPlacing()) this.cycleHotbar(inp.mouse.wheel);
    if (inp.hit('Escape')) { this.ui.showPause(); return; }
    if (inp.hit('KeyI')) { this.openInventory(null); return; }
    if (inp.hit('KeyM')) { this.ui.showMap(); return; }
    if (inp.hit('KeyK')) this.thirdPerson = !this.thirdPerson;
    if (inp.hit('KeyO')) { const s = p.activeStack(); if (s && !ITEMS[s.id].noDrop) this.dropStack(s, 1); }
    if (inp.hit('KeyT')) this.whistle('follow');
    if (inp.hit('KeyY')) this.whistle('stay');
    if (inp.hit('KeyU')) this.whistle('aggressive');
    if (inp.hit('KeyJ')) this.whistle('passive');
    if (inp.hit('KeyN')) this.whistle('neutral');
    if (inp.hit('KeyF')) this.accessTarget();

    // E: tap = use, hold = options
    if (inp.hit('KeyE')) { this.eHeld = 0; this.eConsumed = false; }
    if (inp.down('KeyE') && !this.eConsumed) {
      this.eHeld += dt;
      if (this.eHeld > 0.45) { this.eConsumed = true; this.contextAction(); }
    } else if (!inp.down('KeyE') && this.eHeld > 0 && !this.eConsumed) {
      this.eConsumed = true;
      if (this.isPlacing()) this.building.placeRot += Math.PI / 8;
      else this.interact();
      this.eHeld = 0;
    }

    if (p.riding) {
      if (inp.mouseDown(0)) this.creatures.riderAttack(p.riding);
      return;
    }

    // building placement
    const def = p.activeDef();
    if (def && def.cat === 'structure') {
      const eye = p.eyePos(new THREE.Vector3());
      const dir = p.lookDir(new THREE.Vector3());
      if (inp.hit('KeyQ')) this.building.placeRot -= Math.PI / 8;
      if (inp.mouse.wheel) this.building.placeRot += inp.mouse.wheel * Math.PI / 8;
      const pl = this.building.computePlacement(def.id, eye, dir);
      this.building.showGhost(def.id, pl);
      this.placement = pl;
      if (inp.mouseHit(0)) this.placeStructure(def.id, pl);
      return;
    }
    this.building.hideGhost();
    this.placement = null;
    if (inp.hit('KeyQ') && p.activeSlot >= 0) this.selectSlot(-1);

    const equip = def ? def.equip : null;
    this.zoom = false;
    // ranged weapons
    if (equip === 'bow' || equip === 'slingshot') {
      if (inp.mouseDown(0) && this.hasAmmo(def)) {
        this.drawing = true;
        this.bowDraw = Math.min(1, this.bowDraw + dt / 0.9);
      } else if (this.drawing) {
        if (this.bowDraw > 0.15) this.fireRanged(def, this.bowDraw);
        this.drawing = false;
        this.bowDraw = 0;
      }
      if (inp.mouseHit(0) && !this.hasAmmo(def)) this.hud.notify(`No ammo! Craft ${ITEMS[Array.isArray(def.ammo) ? def.ammo[0] : def.ammo].name}`, 'bad');
      this.zoom = inp.mouseDown(2);
      if (inp.hit('KeyR')) this.cycleAmmo(def);
      this.viewModel.draw = this.bowDraw;
    } else if (equip === 'pistol' || equip === 'rifle') {
      this.reload = Math.max(0, this.reload - dt);
      this.zoom = inp.mouseDown(2);
      if (inp.hit('KeyR') && Array.isArray(def.ammo)) this.cycleAmmo(def);
      if (inp.mouseHit(0) && this.reload <= 0) {
        if (this.hasAmmo(def)) this.fireRanged(def, 1);
        else this.hud.notify(`No ammo! Craft ${ITEMS[Array.isArray(def.ammo) ? def.ammo[0] : def.ammo].name}`, 'bad');
      }
    } else if (equip === 'spyglass') {
      this.zoom = inp.mouseDown(2) || inp.mouseDown(0);
    } else {
      if (equip === 'spear' && inp.mouseHit(2)) { this.throwSpear(); return; }
      // melee / harvest
      this.attackCd -= dt;
      if (inp.mouseDown(0) && this.attackCd <= 0) this.startMelee(equip);
    }
    if (this.pendingHit) {
      this.pendingHit.t -= dt;
      if (this.pendingHit.t <= 0) { const h = this.pendingHit; this.pendingHit = null; this.resolveMelee(h.equip); }
    }
  }

  isPlacing() {
    const d = this.player.activeDef();
    return !!(d && d.cat === 'structure' && !this.player.riding);
  }

  pressHotbar(i) {
    const p = this.player;
    const h = p.hotbar[i];
    if (!h) { this.selectSlot(-1); return; }
    const stack = h.uid ? p.inventory.byUid(h.uid) : p.inventory.find(h.id);
    if (!stack) { p.hotbar[i] = null; return; }
    const def = ITEMS[stack.id];
    if (def.cat === 'consumable' || def.id === 'waterskin') { this.useItem(stack); return; }
    if (p.activeSlot === i) this.selectSlot(-1);
    else this.selectSlot(i);
  }

  cycleHotbar(dir) {
    const p = this.player;
    const filled = [];
    for (let i = 0; i < 10; i++) {
      const s = p.hotbar[i] ? (p.hotbar[i].uid ? p.inventory.byUid(p.hotbar[i].uid) : p.inventory.find(p.hotbar[i].id)) : null;
      if (s && ITEMS[s.id].cat !== 'consumable') filled.push(i);
    }
    if (!filled.length) return;
    let idx = filled.indexOf(p.activeSlot);
    idx = idx < 0 ? (dir > 0 ? 0 : filled.length - 1) : (idx + (dir > 0 ? 1 : -1) + filled.length + 1) % (filled.length + 1);
    this.selectSlot(idx === filled.length ? -1 : filled[idx]);
  }

  selectSlot(i, force = false) {
    const p = this.player;
    if (!force && p.activeSlot === i) return;
    p.activeSlot = i;
    this.drawing = false;
    this.bowDraw = 0;
    this.reload = 0;
    this.building.placeRot = 0;
    const s = p.activeStack();
    this.viewModel.setHeld(s ? s.id : null);
    this.body.setHeld(s ? s.id : null);
    if (s && ITEMS[s.id].cat === 'structure') this.hud.notify(`Placing ${ITEMS[s.id].name} — Left-click to place, Q/E or wheel to rotate`, 'neutral', 2.5);
  }

  refreshEquipment() {
    this.viewModel.setEquipment(this.player.equipment);
    this.body.setEquipment(this.player.equipment);
    const s = this.player.activeStack();
    this.viewModel.setHeld(s ? s.id : null);
    this.body.setHeld(s ? s.id : null);
  }

  // ------------------------------------------------------------------ melee & harvesting
  startMelee(equip) {
    const p = this.player;
    const m = MELEE[equip || 'fists'] || MELEE.fists;
    if (p.stamina < 2) { this.attackCd = 0.3; return; }
    const stack = p.activeStack();
    if (stack && stack.dur !== undefined && stack.dur <= 0) { this.hud.notify(`Your ${ITEMS[stack.id].name} is broken!`, 'bad'); this.attackCd = 0.5; return; }
    p.stamina -= 2;
    this.attackCd = m.cd;
    this.viewModel.startSwing();
    this.bodySwing = 1;
    this.pendingHit = { t: m.cd * 0.32, equip: equip || 'fists' };
    this.audio.play('swing');
  }

  resolveMelee(equip) {
    const p = this.player;
    const m = MELEE[equip] || MELEE.fists;
    const eye = p.eyePos(new THREE.Vector3());
    const dir = p.lookDir(new THREE.Vector3());
    const stack = p.activeStack();
    const def = stack ? ITEMS[stack.id] : null;
    const range = m.range;
    const cHit = this.creatures.raycast(eye, dir, range + 0.5);
    const nHit = this.resources.raycast(eye, dir, range);
    const sHit = this.building.raycast(eye, dir, range);
    const cd = cHit ? cHit.dist : Infinity, nd = nHit ? nHit.dist : Infinity, sd = sHit ? sHit.dist : Infinity;
    if (sd < cd && sd < nd) { this.audio.play('wood'); return; }
    const wear = () => { if (stack && stack.dur !== undefined) { stack.dur = Math.max(0, stack.dur - 1); if (stack.dur <= 0) this.hud.notify(`Your ${def.name} broke!`, 'bad'); p.inventory.changed(); } };
    if (cHit && cd <= nd) {
      const c = cHit.creature;
      if (c.dead) { this.harvestCorpse(c, m.family); wear(); return; }
      const base = def && def.damage ? def.damage : MELEE.fists.dmg;
      const dmg = base * p.meleeMult * this.settings.playerDamage;
      let torpor = 0;
      if (!def || !def.equip) torpor = MELEE.fists.torpor * p.meleeMult;
      else if (def.torporDamage) torpor = def.torporDamage * p.meleeMult;
      this.creatures.damage(c, dmg, { torpor, source: this.playerTarget() });
      this.audio.play(def ? 'flesh' : 'punch');
      wear();
      return;
    }
    if (nHit) {
      const n = nHit.node;
      const cls = NODE_KINDS[n.kind].cls;
      const table = YIELDS[cls];
      if (!table) return;
      const family = m.family;
      const tier = def && def.toolTier ? def.toolTier : 1;
      const yields = table[family] || table.fists || {};
      if (!Object.keys(yields).length) { this.hud.notify('You need a pick to mine this.', 'warn', 1.5); this.audio.play('stone'); return; }
      const mult = this.settings.harvestAmount * (tier >= 2 ? 2.4 : 1);
      let gained = 0;
      for (const [item, amt] of Object.entries(yields)) {
        n.acc[item] = (n.acc[item] || 0) + amt * mult * rand(0.75, 1.25);
        const whole = Math.floor(n.acc[item]);
        if (whole > 0) {
          n.acc[item] -= whole;
          const left = p.inventory.add(item, whole);
          if (whole - left > 0) this.hud.itemGain(item, whole - left);
          if (left > 0) this.hud.notify('Inventory full!', 'bad', 1.5);
          gained += whole - left;
        }
      }
      if (gained) this.giveXP(gained * 0.22);
      const dmg = (def && def.damage ? def.damage : 8) * (family === 'fists' ? 1 : 1.2);
      n.hp -= dmg;
      if (n.hp <= 0) this.resources.deplete(n, this.settings.resourceRespawn);
      this.audio.play(cls === 'tree' ? 'wood' : 'stone');
      wear();
      return;
    }
    // hit nothing
  }

  harvestCorpse(c, family, byCreature = null) {
    const drops = c.corpse.drops;
    const fam = byCreature ? 'creature' : family;
    const per = {
      fists: { raw_meat: 0.8, hide: 0.4, raw_prime_meat: 0.05, chitin: 0.3, keratin: 0.3, oil: 0.3, silica_pearls: 0.3 },
      pick: { raw_meat: 2.6, hide: 0.8, raw_prime_meat: 0.35, chitin: 1.6, keratin: 1.6, oil: 1, silica_pearls: 1.2 },
      hatchet: { raw_meat: 1.2, hide: 2.6, raw_prime_meat: 0.2, chitin: 0.6, keratin: 0.6, oil: 0.4, silica_pearls: 0.4 },
      creature: { raw_meat: 5, hide: 3, raw_prime_meat: 0.8, chitin: 2, keratin: 2, oil: 1, silica_pearls: 1 },
    }[fam] || {};
    const inv = byCreature ? byCreature.inventory : this.player.inventory;
    let any = false;
    for (const [item, left] of Object.entries(drops)) {
      if (left < 0.5) continue;
      const take = Math.min(left, (per[item] || 0.3) * this.settings.harvestAmount * rand(0.7, 1.3));
      drops[item] -= take;
      c.harvestAcc[item] = (c.harvestAcc[item] || 0) + take;
      const whole = Math.floor(c.harvestAcc[item]);
      if (whole > 0) {
        c.harvestAcc[item] -= whole;
        inv.add(item, whole);
        this.hud.itemGain(item, whole);
        any = true;
      }
    }
    if (any && !byCreature) this.giveXP(0.5);
    this.audio.play('flesh');
  }

  // ------------------------------------------------------------------ ranged
  ammoTypes(def) { return Array.isArray(def.ammo) ? def.ammo : [def.ammo]; }
  currentAmmo(def) {
    const types = this.ammoTypes(def);
    const pref = this.ammoChoice[def.id];
    if (pref && this.player.inventory.count(pref) > 0) return pref;
    return types.find((t) => this.player.inventory.count(t) > 0) || null;
  }
  hasAmmo(def) { return !!this.currentAmmo(def); }
  cycleAmmo(def) {
    const types = this.ammoTypes(def).filter((t) => this.player.inventory.count(t) > 0);
    if (types.length < 2) return;
    const cur = this.currentAmmo(def);
    const next = types[(types.indexOf(cur) + 1) % types.length];
    this.ammoChoice[def.id] = next;
    this.hud.notify(`Ammo: ${ITEMS[next].name}`, 'neutral', 1.5);
  }

  fireRanged(def, power) {
    const p = this.player;
    const ammo = this.currentAmmo(def);
    if (!ammo) return;
    const stack = p.activeStack();
    if (stack && stack.dur !== undefined && stack.dur <= 0) { this.hud.notify(`Your ${def.name} is broken!`, 'bad'); return; }
    p.inventory.remove(ammo, 1);
    if (stack && stack.dur !== undefined) stack.dur = Math.max(0, stack.dur - 1);
    const ad = ITEMS[ammo];
    const eye = p.eyePos(new THREE.Vector3());
    const dir = p.lookDir(new THREE.Vector3());
    const spread = def.equip === 'pistol' ? 0.012 : 0.004;
    dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread);
    dir.normalize();
    let speed = 70, damage = (ad.damage || def.damage), torpor = ad.torporDamage || 0, gravity = 9.8, mesh;
    if (def.equip === 'bow') {
      speed = 25 + 45 * power; damage *= 0.35 + 0.65 * power; torpor *= 0.35 + 0.65 * power;
      mesh = new THREE.Mesh(SHARED.arrow, ammo === 'tranq_arrow' ? SHARED.tranqMat : SHARED.arrowMat);
      this.audio.play('bow');
    } else if (def.equip === 'slingshot') {
      speed = 20 + 30 * power; damage = def.damage * (0.4 + 0.6 * power); torpor = def.torporDamage * (0.4 + 0.6 * power);
      mesh = new THREE.Mesh(SHARED.stone, SHARED.stoneMat);
      this.audio.play('bow');
    } else {
      speed = def.equip === 'rifle' ? 260 : 160; gravity = 2;
      mesh = new THREE.Mesh(SHARED.bullet, SHARED.bulletMat);
      this.reload = def.equip === 'rifle' ? 2.6 : 1.6;
      this.viewModel.recoil = 1;
      this.audio.play('gun');
    }
    mesh.position.copy(eye).addScaledVector(dir, 0.6);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh, vel: dir.multiplyScalar(speed), gravity, life: 6, damage: damage * p.meleeMult * (def.equip === 'slingshot' ? 1 : 1) * this.settings.playerDamage,
      torpor: torpor * (def.equip === 'slingshot' ? p.meleeMult : 1), overTime: ammo === 'tranq_arrow' || ammo === 'tranq_dart',
      item: def.equip === 'bow' ? ammo : null, owner: 'player',
    });
  }

  throwSpear() {
    const p = this.player;
    const stack = p.activeStack();
    if (!stack) return;
    const eye = p.eyePos(new THREE.Vector3());
    const dir = p.lookDir(new THREE.Vector3());
    p.inventory.removeStack(stack);
    p.cleanHotbar();
    this.selectSlot(-1, true);
    const mesh = new THREE.Mesh(SHARED.spear, SHARED.arrowMat);
    mesh.position.copy(eye).addScaledVector(dir, 0.8);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, vel: dir.multiplyScalar(28), gravity: 9.8, life: 6, damage: 40 * p.meleeMult * this.settings.playerDamage, torpor: 0, stack, owner: 'player' });
    this.audio.play('swing');
  }

  updateProjectiles(dt) {
    const T = this.terrain;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      const from = pr.mesh.position.clone();
      pr.vel.y -= pr.gravity * dt;
      const step = pr.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().normalize();
      let hitDist = Infinity, hitCreature = null;
      const ch = this.creatures.raycast(from, dir, len, this.player.riding);
      if (ch) { hitDist = ch.dist; hitCreature = ch.creature; }
      const nh = this.resources.raycast(from, dir, len);
      if (nh && nh.dist < hitDist) { hitDist = nh.dist; hitCreature = null; }
      const sh = this.building.raycast(from, dir, len);
      if (sh && sh.dist < hitDist) { hitDist = sh.dist; hitCreature = null; }
      let done = false;
      if (hitDist <= len) {
        pr.mesh.position.addScaledVector(dir, hitDist);
        if (hitCreature && !hitCreature.dead) {
          this.creatures.damage(hitCreature, pr.damage, { torpor: pr.torpor, overTime: pr.overTime, source: this.playerTarget() });
          this.hud.notify(`Hit ${hitCreature.displayName}`, 'neutral', 0.8);
          this.audio.play('flesh');
        } else if (hitCreature && hitCreature.dead) {
          this.audio.play('flesh');
        }
        done = true;
      } else {
        pr.mesh.position.add(step);
        if (pr.vel.lengthSq() > 1) pr.mesh.lookAt(pr.mesh.position.clone().add(pr.vel));
        const ground = T.getHeight(pr.mesh.position.x, pr.mesh.position.z);
        if (pr.mesh.position.y <= ground) { pr.mesh.position.y = ground + 0.05; done = true; }
      }
      if (done || pr.life <= 0) {
        this.scene.remove(pr.mesh);
        // spears & (sometimes) arrows can be recovered
        if (pr.stack) this.spawnDropped(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, [pr.stack]);
        else if (pr.item && Math.random() < 0.5 && !hitCreature) {
          const inv = new Inventory(5); inv.add(pr.item, 1);
          this.spawnDropped(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, inv.stacks);
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ interaction
  playerTarget() { return this.playerTargetObj || (this.playerTargetObj = { isPlayer: true }); }

  // What the survivor is looking at
  lookTarget(range = 3.6) {
    const p = this.player;
    const eye = p.riding ? this.camera.position.clone() : p.eyePos(new THREE.Vector3());
    const dir = p.riding ? new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion) : p.lookDir(new THREE.Vector3());
    const extra = p.riding ? this.camDist || 0 : 0;
    const cands = [];
    const c = this.creatures.raycast(eye, dir, range + 1 + extra, p.riding);
    if (c) cands.push({ kind: 'creature', ref: c.creature, dist: c.dist - (c.creature.def.radius > 1.5 ? 1 : 0) });
    const n = this.resources.raycast(eye, dir, range + extra);
    if (n) cands.push({ kind: 'node', ref: n.node, dist: n.dist });
    const s = this.building.raycast(eye, dir, range + extra);
    if (s) cands.push({ kind: 'structure', ref: s.structure, dist: s.dist });
    const d = this.landmarks.raycastDrop(eye, dir, range + extra);
    if (d) cands.push({ kind: 'drop', ref: d.drop, dist: d.dist });
    for (const b of [...this.dropped, ...this.bodies]) {
      const center = new THREE.Vector3(b.x, b.y + 0.3, b.z);
      const t = center.clone().sub(eye).dot(dir);
      if (t > 0 && t < range + extra && eye.clone().addScaledVector(dir, t).distanceTo(center) < 0.6) cands.push({ kind: b.isBody ? 'body' : 'dropped', ref: b, dist: t });
    }
    cands.sort((a, b) => a.dist - b.dist);
    return cands[0] || null;
  }

  canDrink() {
    const p = this.player;
    if (p.riding) return false;
    const wl = this.terrain.waterLevelAt(p.pos.x, p.pos.z);
    if (p.pos.y < wl + 0.2 && wl - this.terrain.getHeight(p.pos.x, p.pos.z) > 0.25) return true;
    const eye = p.eyePos(new THREE.Vector3()), dir = p.lookDir(new THREE.Vector3());
    if (dir.y >= -0.05) return false;
    for (let t = 0.5; t <= 3.2; t += 0.25) {
      const x = eye.x + dir.x * t, y = eye.y + dir.y * t, z = eye.z + dir.z * t;
      const w = this.terrain.waterLevelAt(x, z);
      const g = this.terrain.getHeight(x, z);
      if (y <= g) return false;
      if (y <= w && w - g > 0.2) return true;
    }
    return false;
  }

  interact() {
    const p = this.player;
    if (p.riding) { this.dismount(); return; }
    const t = this.lookTarget();
    if (t) {
      switch (t.kind) {
        case 'dropped': this.pickupDropped(t.ref); return;
        case 'body': this.openInventory({ kind: 'body', title: 'Your Body', inventory: t.ref.inventory, ref: t.ref }); return;
        case 'drop': this.openSupplyDrop(t.ref); return;
        case 'creature': {
          const c = t.ref;
          if (c.dead) {
            if (c.inventory.stacks.length) this.openInventory({ kind: 'corpse', title: `${c.displayName} (Dead)`, inventory: c.inventory, ref: c });
            else this.hud.notify('Use a tool or your fists to harvest the corpse.', 'neutral', 2);
            return;
          }
          if (c.tamed) {
            if (c.saddle && c.def.rideable && !c.ko) { this.mount(c); return; }
            this.creatureMenu(c);
            return;
          }
          if (c.ko && c.taming) { this.openInventory({ kind: 'creature', title: `${c.def.name} - Lvl ${c.level}`, inventory: c.inventory, ref: c }); return; }
          break;
        }
        case 'structure': this.useStructure(t.ref); return;
        case 'node': {
          const n = t.ref;
          const cls = NODE_KINDS[n.kind].cls;
          if (cls === 'bush') { this.harvestBush(n); return; }
          if (cls === 'pebble') {
            const q = Math.max(1, Math.round(rand(1, 2) * this.settings.harvestAmount));
            p.inventory.add('stone', q); this.hud.itemGain('stone', q); this.giveXP(0.2);
            this.resources.deplete(n, this.settings.resourceRespawn); this.audio.play('pickup'); return;
          }
          if (cls === 'pearl') {
            const q = Math.max(1, Math.round(rand(1, 3) * this.settings.harvestAmount));
            p.inventory.add('silica_pearls', q); this.hud.itemGain('silica_pearls', q);
            this.resources.deplete(n, this.settings.resourceRespawn); this.audio.play('pickup'); return;
          }
          break;
        }
        default: break;
      }
    }
    if (this.canDrink()) {
      p.water = Math.min(p.maxWater, p.water + 12);
      this.audio.play('drink');
      // fill waterskins too
      for (const s of p.inventory.stacks) if (s.water !== undefined) s.water = ITEMS[s.id].capacity;
      p.inventory.changed();
    }
  }

  harvestBush(n) {
    const p = this.player;
    const mult = this.settings.harvestAmount;
    const fiber = Math.round(rand(3, 6) * mult);
    p.inventory.add('fiber', fiber);
    this.hud.itemGain('fiber', fiber);
    // berries: a mix by biome — narcoberries & stimberries are rarer
    const pool = n.kind === 'fern' ? [] : ['amarberry', 'azulberry', 'tintoberry', 'mejoberry', 'mejoberry', 'narcoberry', 'stimberry', 'amarberry', 'azulberry'];
    const kinds = Math.floor(rand(1, 3));
    for (let i = 0; i < kinds && pool.length; i++) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      const q = Math.round(rand(2, 6) * mult);
      p.inventory.add(id, q);
      this.hud.itemGain(id, q);
    }
    this.giveXP(0.4);
    n.hp -= 1;
    if (n.hp <= 0) this.resources.deplete(n, this.settings.resourceRespawn);
    this.audio.play('bush');
  }

  accessTarget() {
    const t = this.lookTarget(4.5);
    if (!t) return;
    if (t.kind === 'creature') {
      const c = t.ref;
      if (c.tamed || (c.ko && c.taming)) this.openInventory({ kind: 'creature', title: c.tamed ? `${c.displayName} - Lvl ${c.level}` : `${c.def.name} - Lvl ${c.level}`, inventory: c.inventory, ref: c });
      else if (c.dead && c.inventory.stacks.length) this.openInventory({ kind: 'corpse', title: `${c.displayName} (Dead)`, inventory: c.inventory, ref: c });
    } else if (t.kind === 'structure' && t.ref.inventory) this.useStructure(t.ref);
    else if (t.kind === 'drop') this.openSupplyDrop(t.ref);
    else if (t.kind === 'body') this.openInventory({ kind: 'body', title: 'Your Body', inventory: t.ref.inventory, ref: t.ref });
  }

  contextAction() {
    const t = this.lookTarget(4.5);
    if (!t) return;
    if (t.kind === 'creature' && t.ref.tamed && !t.ref.dead) { this.creatureMenu(t.ref); return; }
    if (t.kind === 'structure') {
      const s = t.ref;
      const opts = [];
      if (s.shape === 'door') opts.push({ label: s.open ? 'Close Door' : 'Open Door', action: () => this.building.toggleDoor(s) });
      if (s.inventory) opts.push({ label: 'Access Inventory', action: () => this.useStructure(s) });
      if (['campfire', 'refining_forge', 'standing_torch'].includes(s.type)) opts.push({ label: s.lit ? 'Extinguish' : 'Light', action: () => this.building.setLit(s, !s.lit) });
      opts.push({ label: 'Demolish', action: () => this.demolish(s) });
      this.ui.showContext(ITEMS[s.type].name, opts);
    }
  }

  useStructure(s) {
    if (s.shape === 'door') { this.building.toggleDoor(s); return; }
    if (s.type === 'standing_torch') { this.building.setLit(s, !s.lit); return; }
    if (s.inventory) {
      this.openInventory({ kind: 'structure', title: ITEMS[s.type].name, inventory: s.inventory, ref: s, station: (s.station === 'mortar' || s.station === 'smithy') ? s.station : null });
      return;
    }
    if (s.type === 'simple_bed' || s.type === 'sleeping_bag') this.hud.notify(`${ITEMS[s.type].name}: you can respawn here after death.`, 'neutral');
  }

  demolish(s) {
    // refund half the materials, like the 2015 demolish behaviour
    const recipe = ITEMS[s.type].recipe || {};
    for (const [id, n] of Object.entries(recipe)) {
      const q = Math.floor(n * 0.5);
      if (q > 0) { this.player.inventory.add(id, q); this.hud.itemGain(id, q); }
    }
    if (s.inventory) for (const st of s.inventory.stacks) this.player.inventory.addStack(st);
    this.building.remove(s);
    this.audio.play('build');
  }

  openInventory(remote) {
    if (this.player.riding && !remote) remote = { kind: 'creature', title: `${this.player.riding.displayName} - Lvl ${this.player.riding.level}`, inventory: this.player.riding.inventory, ref: this.player.riding };
    this.ui.showInventory(remote);
  }

  openSupplyDrop(d) {
    if (this.player.level < d.tier.level) { this.hud.notify(`You must be level ${d.tier.level} to open this ${d.tier.name} supply crate.`, 'bad'); return; }
    d.opened = true;
    this.openInventory({ kind: 'drop', title: `${d.tier.name} Supply Crate`, inventory: d.inventory, ref: d });
  }

  creatureMenu(c) {
    const opts = [];
    if (c.def.rideable && c.saddle && !c.ko) opts.push({ label: 'Ride', action: () => this.mount(c) });
    opts.push({ label: c.follow ? 'Stop Following' : 'Follow Me', action: () => { c.follow = !c.follow; c.target = null; c.state = 'idle'; } });
    for (const mode of ['aggressive', 'neutral', 'passive']) {
      if (c.aggression !== mode) opts.push({ label: `Set ${mode[0].toUpperCase() + mode.slice(1)}`, action: () => { c.aggression = mode; } });
    }
    opts.push({ label: 'Access Inventory', action: () => this.openInventory({ kind: 'creature', title: `${c.displayName} - Lvl ${c.level}`, inventory: c.inventory, ref: c }) });
    opts.push({ label: 'Rename', action: () => this.ui.promptRename(c) });
    this.ui.showContext(`${c.displayName} — Lvl ${c.level}`, opts);
  }

  whistle(cmd) {
    const n = this.creatures.whistle(cmd, this.player.pos);
    this.audio.play('whistle');
    const label = { follow: 'Follow', stay: 'Stop', aggressive: 'Aggressive', passive: 'Passive', neutral: 'Neutral' }[cmd];
    this.hud.notify(n ? `Whistle: ${label} (${n} creature${n > 1 ? 's' : ''})` : `Whistle: ${label}`, 'neutral', 1.5);
  }

  // ------------------------------------------------------------------ items
  useItem(stack) {
    const p = this.player;
    const def = ITEMS[stack.id];
    if (def.id === 'waterskin') {
      if (stack.water <= 0) { this.hud.notify('Your Waterskin is empty. Fill it at a water source.', 'warn'); return; }
      const amt = Math.min(stack.water, 25, p.maxWater - p.water);
      if (amt <= 0) { this.hud.notify('You are not thirsty.', 'neutral', 1.2); return; }
      stack.water -= amt;
      p.water += amt;
      p.inventory.changed();
      this.audio.play('drink');
      return;
    }
    if (def.cat !== 'consumable') return;
    p.inventory.remove(def.id, 1);
    if (def.food) p.food = clamp(p.food + def.food, 0, p.maxFood);
    if (def.water) p.water = clamp(p.water + def.water, 0, p.maxWater);
    if (def.health) {
      if (def.health < 0) { p.damage(-def.health, { ignoreArmor: true }); this.lastDamageSource = `Died from eating ${def.name}`; if (p.dead) this.onPlayerDeath(this.lastDamageSource); }
      else p.health = Math.min(p.maxHealth, p.health + def.health);
    }
    if (def.stamina) p.stamina = clamp(p.stamina + def.stamina, 0, p.maxStamina);
    if (def.torpor) p.torpor = clamp(p.torpor + def.torpor, 0, p.maxTorpor * 1.2);
    p.cleanHotbar();
    this.audio.play('eat');
  }

  equip(uid) {
    const p = this.player;
    const stack = p.inventory.byUid(uid);
    if (!stack) return;
    const def = ITEMS[stack.id];
    if (def.cat !== 'armor') return;
    p.inventory.removeStack(stack);
    const prev = p.equipment[def.slot];
    p.equipment[def.slot] = stack;
    if (prev) p.inventory.addStack(prev);
    p.cleanHotbar();
    this.refreshEquipment();
    this.audio.play('ui');
  }

  unequip(uid) {
    const p = this.player;
    for (const [slot, s] of Object.entries(p.equipment)) {
      if (s && s.uid === uid) {
        if (p.inventory.addStack(s)) p.equipment[slot] = null;
        else this.hud.notify('Inventory full', 'bad');
      }
    }
    this.refreshEquipment();
  }

  equipSaddle(c, uid) {
    const p = this.player;
    const stack = p.inventory.byUid(uid);
    if (!stack) return;
    const def = ITEMS[stack.id];
    if (def.saddleFor !== c.def.id) { this.hud.notify(`That saddle doesn't fit a ${c.def.name}.`, 'bad'); return; }
    if (c.saddle) this.removeSaddle(c);
    p.inventory.removeStack(stack);
    c.saddle = stack;
    this.creatures.attachSaddle(c);
    this.audio.play('ui');
    this.hud.notify(`Saddle equipped. Press E on ${c.displayName} to ride.`, 'good');
  }

  removeSaddle(c) {
    if (!c.saddle) return;
    if (c.rider) this.dismount();
    this.player.inventory.addStack(c.saddle);
    c.saddle = null;
    this.creatures.removeSaddleMesh(c);
  }

  levelCreature(c, stat) {
    if (c.levelUpsAvailable <= 0) return;
    c.levelUpsAvailable--;
    c.tamedPoints[stat] = (c.tamedPoints[stat] || 0) + 1;
    c.recalc();
    this.audio.play('levelup');
  }

  dropStack(stack, qty = stack.qty) {
    const p = this.player;
    if (ITEMS[stack.id].noDrop) return;
    const part = p.inventory.removeStack(stack, qty);
    if (!part) return;
    p.cleanHotbar();
    if (p.activeSlot >= 0 && !p.activeStack()) this.selectSlot(-1, true);
    const f = p.lookDir(new THREE.Vector3()).setY(0).normalize();
    const x = p.pos.x + f.x * 1.2, z = p.pos.z + f.z * 1.2;
    this.spawnDropped(x, this.world.groundAt(x, z, p.pos.y + 1), z, [part]);
  }

  spawnDropped(x, y, z, stacks) {
    const inv = new Inventory(50);
    for (const s of stacks) inv.addStack(s);
    const mesh = new THREE.Mesh(SHARED.bag, SHARED.bagMat);
    mesh.position.set(x, y + 0.2, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.dropped.push({ x, y, z, inventory: inv, mesh, life: 600 });
  }

  pickupDropped(d) {
    const p = this.player;
    for (const s of [...d.inventory.stacks]) {
      d.inventory.removeStack(s);
      if (p.inventory.addStack(s)) { this.hud.itemGain(s.id, s.qty || 1); if (ITEMS[s.id].durability) p.autoHotbar(s); }
      else d.inventory.addStack(s);
    }
    this.audio.play('pickup');
    if (!d.inventory.stacks.length) this.removeDropped(d);
  }

  removeDropped(d) {
    this.scene.remove(d.mesh);
    const i = this.dropped.indexOf(d);
    if (i >= 0) this.dropped.splice(i, 1);
  }

  createBody(x, y, z, stacks, life = 1800) {
    const inv = new Inventory(400);
    if (Array.isArray(stacks)) inv.restore(stacks);
    const mesh = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 1.7), new THREE.MeshLambertMaterial({ color: '#b88a6a' }));
    m.position.y = 0.12;
    mesh.add(m);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), new THREE.MeshBasicMaterial({ color: '#ff5a4a' }));
    marker.position.y = 2.2;
    mesh.add(marker);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const b = { x, y, z, inventory: inv, mesh, life, isBody: true, marker };
    this.bodies.push(b);
    this.deathBag = b;
    return b;
  }

  updateDropped(dt) {
    for (let i = this.dropped.length - 1; i >= 0; i--) {
      const d = this.dropped[i];
      d.life -= dt;
      d.mesh.rotation.y += dt;
      if (d.life <= 0 || !d.inventory.stacks.length) this.removeDropped(d);
    }
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.life -= dt;
      b.marker.rotation.y += dt * 2;
      if (b.life <= 0 || (!b.inventory.stacks.length && this.ui.current !== 'inventory')) {
        this.scene.remove(b.mesh);
        this.bodies.splice(i, 1);
        if (this.deathBag === b) this.deathBag = null;
      }
    }
  }

  repair(stack) {
    const p = this.player;
    const def = ITEMS[stack.id];
    const frac = 1 - stack.dur / stack.maxDur;
    const cost = {};
    for (const [id, n] of Object.entries(def.recipe || {})) cost[id] = Math.max(1, Math.ceil(n * frac * 0.5));
    if (!p.inventory.hasAll(cost)) { this.hud.notify('Not enough resources to repair.', 'bad'); return; }
    p.inventory.consumeAll(cost);
    stack.dur = stack.maxDur;
    p.inventory.changed();
    this.audio.play('craft');
  }

  // ------------------------------------------------------------------ crafting & engrams
  craft(id, station = null) {
    const p = this.player;
    const def = ITEMS[id];
    if (!def || !def.recipe || !p.known.has(id)) return false;
    const src = station ? station.inventory : p.inventory;
    if ((def.station || null) !== (station ? station.station : null)) { this.hud.notify(`${def.name} must be crafted in a ${def.station}.`, 'bad'); return false; }
    let recipe = def.recipe;
    if (!src.hasAll(recipe) && def.altRecipe && src.hasAll(def.altRecipe)) recipe = def.altRecipe;
    if (!src.hasAll(recipe)) { this.audio.play('error'); return false; }
    src.consumeAll(recipe);
    const entry = { id, remaining: def.craftTime || 1, total: def.craftTime || 1, recipe };
    if (station) {
      station.craftQueue = station.craftQueue || [];
      station.craftQueue.push(entry);
    } else p.craftQueue.push(entry);
    this.audio.play('ui');
    return true;
  }

  cancelCraft(i) {
    const p = this.player;
    const e = p.craftQueue[i];
    if (!e) return;
    p.craftQueue.splice(i, 1);
    for (const [id, n] of Object.entries(e.recipe)) p.inventory.add(id, n);
  }

  updateCrafting(dt) {
    const p = this.player;
    const e = p.craftQueue[0];
    if (!e) return;
    e.remaining -= dt;
    if (e.remaining <= 0) {
      p.craftQueue.shift();
      const def = ITEMS[e.id];
      const n = def.yields || 1;
      const left = p.inventory.add(e.id, n);
      if (left > 0) this.spawnDropped(p.pos.x, p.pos.y, p.pos.z, [{ id: e.id, qty: left, uid: `${Date.now()}` }]);
      const stack = [...p.inventory.stacks].reverse().find((s) => s.id === e.id);
      if (stack && (def.cat === 'weapon' || def.cat === 'structure' || def.equip)) p.autoHotbar(stack);
      this.hud.itemGain(e.id, n);
      this.giveXP(Math.max(1, (def.craftTime || 1) * 0.6));
      this.audio.play('craft');
    }
  }

  updateStations(dt) {
    for (const s of this.building.list) {
      if (!s.craftQueue || !s.craftQueue.length) continue;
      const e = s.craftQueue[0];
      e.remaining -= dt;
      if (e.remaining <= 0) {
        s.craftQueue.shift();
        const def = ITEMS[e.id];
        s.inventory.add(e.id, def.yields || 1);
        if (Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z) < 30) this.giveXP(Math.max(1, (def.craftTime || 1) * 0.6));
        this.audio.play('craft');
      }
    }
  }

  learnEngram(id) {
    const p = this.player;
    const e = ENGRAM_BY_ID[id];
    if (!e || p.known.has(id)) return;
    if (p.level < e.level) { this.hud.notify(`Requires level ${e.level}`, 'bad'); return; }
    if (p.engramPoints < e.points) { this.hud.notify('Not enough Engram Points', 'bad'); return; }
    p.engramPoints -= e.points;
    p.known.add(id);
    this.audio.play('craft');
    this.hud.notify(`Learned ${e.item.name}!`, 'good', 2);
  }

  giveXP(amount) {
    const p = this.player;
    if (p.dead) return;
    const nowCan = p.addXP(amount, this.settings.xpMult);
    if (nowCan) { this.hud.notify('Level up available! Press I to choose a stat.', 'warn', 4); this.audio.play('levelup'); }
  }

  levelUp(stat) {
    const p = this.player;
    if (p.levelUp(stat)) {
      this.audio.play('levelup');
      this.hud.notify(`Reached Level ${p.level}!${p.level >= MAX_LEVEL ? ' (Max level)' : ''}`, 'good');
    }
  }

  // ------------------------------------------------------------------ building
  placeStructure(type, pl) {
    const p = this.player;
    if (!pl || !pl.ok) { this.hud.notify(pl && pl.reason ? pl.reason : 'Cannot place here', 'bad', 1.5); this.audio.play('error'); return; }
    if (!p.inventory.remove(type, 1)) return;
    this.building.create(type, pl.x, pl.y, pl.z, pl.rot);
    this.audio.play('build');
    this.giveXP(1);
    p.cleanHotbar();
    if (!p.activeStack()) this.selectSlot(-1, true);
    if (type === 'campfire') this.hud.notify('Put Wood or Thatch in the campfire and light it (E).', 'neutral');
  }

  // ------------------------------------------------------------------ riding
  mount(c) {
    const p = this.player;
    if (!c.tamed || c.dead || c.ko) return;
    if (!c.saddle) { this.hud.notify(`${c.displayName} needs a saddle to be ridden.`, 'bad'); return; }
    if (p.stance !== 'stand') p.stance = 'stand';
    p.riding = c;
    c.rider = p;
    c.follow = false;
    c.state = 'ridden';
    c.goal = null;
    this.selectSlot(-1, true);
    this.building.hideGhost();
    this.hud.notify(`Riding ${c.displayName}. E to dismount, Left-click to attack${c.def.habitat === 'air' ? ', Space/C to fly up/down' : ''}.`, 'neutral', 4);
  }

  dismount(forced = false) {
    const p = this.player;
    const c = p.riding;
    if (!c) return;
    p.riding = null;
    c.rider = null;
    c.state = 'idle';
    c.speed = 0;
    if (c.def.habitat === 'air') c.flying = c.pos.y - this.terrain.getHeight(c.pos.x, c.pos.z) > 3;
    const side = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw)).multiplyScalar(c.def.radius + 1.2);
    let x = c.pos.x + side.x, z = c.pos.z + side.z;
    p.pos.set(x, Math.max(c.pos.y, this.world.groundAt(x, z, c.pos.y + 2)) + 0.1, z);
    p.vel.set(0, 0, 0);
    if (!forced) this.audio.play('ui');
  }

  updateRiding(dt, canAct) {
    const p = this.player, c = p.riding, inp = this.input, T = this.terrain;
    const def = c.def;
    if (c.dead || c.ko) { this.dismount(true); return; }
    let fwd = 0, strafe = 0;
    if (canAct) {
      if (inp.down('KeyW')) fwd += 1;
      if (inp.down('KeyS')) fwd -= 1;
      if (inp.down('KeyA')) strafe -= 1;
      if (inp.down('KeyD')) strafe += 1;
    }
    const sprint = canAct && inp.down('ShiftLeft') && c.stamina > 1;
    const over = c.inventory.weight() > c.weightMax;
    const flyer = def.habitat === 'air';
    const swimmer = def.habitat === 'water';
    const ground = T.getHeight(c.pos.x, c.pos.z);
    const wl = T.waterLevelAt(c.pos.x, c.pos.z);
    // flyers take off with Space
    if (flyer && canAct && inp.down('Space') && !c.flying) c.flying = true;
    const moving = fwd !== 0 || strafe !== 0;
    let speed;
    if (flyer && c.flying) speed = sprint ? def.flySprint : def.fly;
    else if (swimmer) speed = sprint ? def.swimSprint || def.swim * 1.6 : def.swim;
    else speed = sprint ? def.run : Math.max(def.walk * 2.2, def.run * 0.45);
    speed *= c.speedMult;
    if (over) speed = 0.5;
    if (!c.flying && !swimmer && wl - ground > def.height * 0.7) speed = (def.swim || def.walk * 1.5);
    const targetYaw = p.yaw + Math.PI + Math.atan2(strafe, Math.max(0.0001, fwd === 0 && strafe !== 0 ? 0 : fwd)) * (fwd < 0 ? -1 : 1);
    if (moving) c.yaw = approachAngle(c.yaw, fwd < 0 && strafe === 0 ? p.yaw + Math.PI : targetYaw, dt * (flyer ? 2.5 : 3.2));
    const desired = moving ? speed * (fwd < 0 && strafe === 0 ? -0.5 : 1) : 0;
    c.speed = lerp(c.speed, desired, Math.min(1, dt * (flyer ? 1.5 : 3)));
    if (sprint && moving) c.stamina = Math.max(0, c.stamina - dt * (flyer ? 8 : 6));
    else c.stamina = Math.min(c.staminaMax, c.stamina + dt * 5);
    if (flyer && c.flying) c.stamina = Math.max(0, c.stamina - dt * 0.8);

    let nx = c.pos.x + Math.sin(c.yaw) * c.speed * dt;
    let nz = c.pos.z + Math.cos(c.yaw) * c.speed * dt;
    nx = clamp(nx, -HALF + 20, HALF - 20); nz = clamp(nz, -HALF + 20, HALF - 20);
    const gN = this.world.groundAt(nx, nz, c.pos.y + 1, true);
    const wN = T.waterLevelAt(nx, nz);
    if (flyer && c.flying) {
      let vy = 0;
      if (canAct && inp.down('Space')) vy = 8;
      if (canAct && (inp.down('KeyC') || inp.down('ControlLeft'))) vy = -10;
      if (c.stamina <= 0) vy = -6;
      vy += Math.sin(p.pitch) * c.speed * 0.6 * (fwd > 0 ? 1 : 0);
      c.vel.y = lerp(c.vel.y, vy, Math.min(1, dt * 3));
      let ny = c.pos.y + c.vel.y * dt;
      const floor = Math.max(gN, wN);
      if (ny <= floor + 0.2) { ny = floor; if (c.vel.y < 0) { c.flying = false; c.vel.y = 0; } }
      c.pos.set(nx, Math.min(ny, 900), nz);
    } else if (swimmer) {
      if (wN - gN < 2.5) { nx = c.pos.x; nz = c.pos.z; c.speed = 0; }
      let vy = Math.sin(p.pitch) * c.speed * (fwd > 0 ? 1 : 0);
      if (canAct && inp.down('Space')) vy = 4;
      if (canAct && (inp.down('KeyC') || inp.down('ControlLeft'))) vy = -4;
      const ny = clamp(c.pos.y + vy * dt, T.getHeight(nx, nz) + 1, wN - 0.6);
      c.pos.set(nx, ny, nz);
    } else {
      // ground creature: stop at steep slopes, float on deep water
      if (gN - c.pos.y > 1.2 + def.radius * 0.5 && wN - gN < def.height * 0.7) { nx = c.pos.x; nz = c.pos.z; c.speed *= 0.3; }
      const s = this.world.collideStructures(nx, nz, Math.min(def.radius, 2.5), c.pos.y, c.pos.y + def.height);
      nx = s.x; nz = s.z;
      let y = this.world.groundAt(nx, nz, c.pos.y + 0.8, true);
      const wl2 = T.waterLevelAt(nx, nz);
      if (wl2 - y > def.height * 0.7) y = wl2 - def.height * 0.55;
      // jump
      if (canAct && inp.hit('Space') && !c.jumpV && c.stamina > 10) { c.jumpV = 6; c.stamina -= 10; }
      if (c.jumpV !== undefined && c.jumpV !== 0) {
        c.jumpY = (c.jumpY || 0) + c.jumpV * dt;
        c.jumpV -= 19 * dt;
        if (c.jumpY <= 0) { c.jumpY = 0; c.jumpV = 0; }
      }
      c.pos.set(nx, y + (c.jumpY || 0), nz);
    }
    // the survivor sits in the saddle
    p.pos.set(c.pos.x, c.pos.y + def.seatHeight - 1.0, c.pos.z);
    p.vel.set(0, 0, 0);
    p.onGround = true;
    p.swimming = false;
    p.headUnder = p.pos.y + 1.6 < wN;
    // the creature manager still thinks (cooldowns) and renders the ridden creature
  }

  // ------------------------------------------------------------------ damage & death
  hurtPlayer(amount, opts = {}) {
    const p = this.player;
    if (p.dead || this.state !== 'playing') return;
    const dmg = p.damage(amount * this.settings.dinoDamage, { torpor: opts.torpor });
    this.hud.damageFlash(Math.min(1, 0.3 + dmg / 40));
    this.audio.play('hurt');
    if (opts.source) this.lastDamageSource = `You were killed by a Level ${opts.source.level} ${opts.source.def.name}!`;
    if (p.dead) this.onPlayerDeath(this.lastDamageSource);
  }

  killPlayer(cause) {
    const p = this.player;
    p.health = 0;
    p.dead = true;
    this.onPlayerDeath(cause);
  }

  onPlayerDeath(cause) {
    if (this.state === 'dead') return;
    const p = this.player;
    if (p.riding) this.dismount(true);
    p.dead = true;
    this.state = 'dead';
    this.audio.play('death');
    // your body keeps everything you carried
    const stacks = [...p.inventory.stacks.filter((s) => !ITEMS[s.id].noDrop), ...Object.values(p.equipment).filter(Boolean)];
    if (stacks.length) this.createBody(p.pos.x, p.pos.y, p.pos.z, stacks.map((s) => ({ ...s })));
    p.inventory.stacks = p.inventory.stacks.filter((s) => ITEMS[s.id].noDrop);
    p.inventory.changed();
    for (const k of Object.keys(p.equipment)) p.equipment[k] = null;
    p.craftQueue = [];
    p.hotbar.fill(null);
    p.activeSlot = -1;
    this.building.hideGhost();
    this.input.unlock();
    const beds = this.building.spawnPoints().map((b) => ({ ref: b, x: b.x, z: b.z, label: ITEMS[b.type].name, cooldown: 0 }));
    setTimeout(() => this.ui.showDeath(cause || 'You died', beds), 1200);
  }

  respawn(choice) {
    const p = this.player;
    p.dead = false;
    p.unconscious = false;
    p.health = p.maxHealth;
    p.stamina = p.maxStamina;
    p.food = p.maxFood;
    p.water = p.maxWater;
    p.oxygen = p.maxOxygen;
    p.torpor = 0;
    p.blind = 0;
    p.stance = 'stand';
    this.lastDamageSource = null;
    this.placeAtSpawn(choice);
    this.state = 'playing';
    this.ui.close();
    this.refreshEquipment();
    this.input.lock();
    this.saveGame();
  }

  // ------------------------------------------------------------------ environment
  computeTemperature() {
    const p = this.player;
    const pos = p.pos;
    let t = this.sky.baseTemperature();
    const alt = Math.max(0, pos.y - 40);
    t -= alt * 0.06;
    const b = this.terrain.biomeAt(pos.x, pos.z);
    // the volcano radiates heat that outweighs its altitude
    const dv = Math.hypot(pos.x - VOLCANO.x, pos.z - VOLCANO.z);
    if (dv < VOLCANO.r * 0.6) t += 26 * smoothstep(VOLCANO.r * 0.6, 60, dv);
    if (b === BIOME.JUNGLE) t += 3;
    if (b === BIOME.BEACH) t += 1;
    if (p.swimming || p.headUnder) t -= 7;
    t += this.building.warmthAt(pos.x, pos.y, pos.z);
    const held = p.activeDef();
    if (held && held.warmth) t += held.warmth;
    return t;
  }

  updateHeldDurability(dt) {
    const p = this.player;
    const s = p.activeStack();
    if (s && s.id === 'torch' && !p.headUnder) {
      s.dur -= dt;
      if (s.dur <= 0) {
        p.inventory.removeStack(s);
        p.cleanHotbar();
        this.selectSlot(-1, true);
        this.hud.notify('Your torch burned out.', 'warn');
      }
    }
  }

  fillWaterskins(dt) {
    const p = this.player;
    const inWater = p.pos.y < this.terrain.waterLevelAt(p.pos.x, p.pos.z) - 0.3;
    const rain = this.sky.rain > 0.3;
    if (!inWater && !rain) return;
    let changed = false;
    for (const s of p.inventory.stacks) {
      if (s.water === undefined) continue;
      const cap = ITEMS[s.id].capacity;
      if (s.water < cap) { s.water = Math.min(cap, s.water + dt * (inWater ? 30 : 2)); changed = true; }
    }
    if (changed && Math.random() < dt * 2) p.inventory.changed();
  }

  // ------------------------------------------------------------------ camera & targeting
  updateCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    const riding = p.riding;
    const third = this.thirdPerson || riding;
    const eye = p.eyePos(new THREE.Vector3());
    if (p.dead) eye.y = p.pos.y + 0.4;
    if (third) {
      const dist = riding ? 4 + riding.def.radius * 3.2 : 3.2;
      const back = new THREE.Vector3(Math.sin(p.yaw) * Math.cos(p.pitch), -Math.sin(p.pitch), Math.cos(p.yaw) * Math.cos(p.pitch));
      const pivot = riding ? new THREE.Vector3(riding.pos.x, riding.pos.y + riding.def.seatHeight + 1.2, riding.pos.z) : eye.clone().add(new THREE.Vector3(Math.cos(p.yaw) * 0.5, 0.1, -Math.sin(p.yaw) * 0.5));
      let d = dist;
      for (let t = 0.5; t <= dist; t += 0.5) {
        const q = pivot.clone().addScaledVector(back, t);
        if (q.y < this.terrain.getHeight(q.x, q.z) + 0.3) { d = Math.max(0.6, t - 0.5); break; }
      }
      this.camDist = d;
      cam.position.copy(pivot).addScaledVector(back, d);
      cam.rotation.set(p.pitch, p.yaw, 0);
    } else {
      this.camDist = 0;
      cam.position.copy(eye);
      cam.rotation.set(p.pitch, p.yaw, 0);
    }
    const targetFov = this.zoom ? (p.activeDef() && p.activeDef().equip === 'spyglass' ? 18 : 45) : this.options.fov;
    cam.fov = lerp(cam.fov, targetFov, Math.min(1, dt * 12 || 1));
    cam.updateProjectionMatrix();
    this.cameraUnderwater = cam.position.y < this.terrain.waterLevelAt(cam.position.x, cam.position.z) - 0.05;

    // first-person arms / third-person body
    const held = p.activeDef();
    const hs = Math.hypot(p.vel.x, p.vel.z);
    this.viewModel.update(dt, {
      visible: !third && !p.dead && this.state === 'playing',
      moving: hs > 0.5 && p.onGround, sprinting: p.sprinting, heldEquip: held ? held.equip || null : null,
      torchLit: held && held.equip === 'torch' && !p.headUnder,
    });
    this.bodySwing = Math.max(0, (this.bodySwing || 0) - dt * 3);
    this.body.update(dt, {
      visible: (third || riding) && this.state !== 'menu', pos: p.pos, yaw: riding ? riding.yaw + Math.PI : p.yaw, speed: riding ? 0 : hs,
      swimming: p.swimming, stance: p.stance, swing: this.bodySwing > 0 ? 1 - this.bodySwing : 0, dead: p.dead, ko: p.unconscious, riding: !!riding,
    });
    document.getElementById('crosshair').classList.toggle('aim', !!(held && ['bow', 'slingshot', 'pistol', 'rifle'].includes(held.equip) && this.zoom));
  }

  updateTargeting(dt) {
    const p = this.player;
    this.targetTimer -= dt;
    if (this.targetTimer > 0) return;
    this.targetTimer = 0.1;
    if (p.dead || this.state !== 'playing') { this.hud.setPrompt(''); this.hud.setTarget(''); this.hud.setTame(''); return; }
    const key = (k) => `<span class="key">${k}</span>`;
    let prompt = '';
    let target = '';
    let tame = '';
    const spy = p.activeDef() && p.activeDef().equip === 'spyglass' && this.zoom;
    // long-range creature info (spyglass) or close-range
    const eye = p.riding ? this.camera.position.clone() : p.eyePos(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const far = this.creatures.raycast(eye, dir, spy ? 400 : 40 + (this.camDist || 0), p.riding);
    if (far) target = this.hud.creatureTargetHTML(far.creature);
    const t = this.lookTarget();
    if (p.riding) {
      prompt = `${key('E')} Dismount`;
    } else if (this.placement) {
      prompt = this.placement.ok ? `${key('LMB')} Place  ${key('Q')}/${key('E')} Rotate` : `<span style="color:var(--bad)">${this.placement.reason || 'Cannot place here'}</span>`;
    } else if (t) {
      switch (t.kind) {
        case 'dropped': prompt = `${key('E')} Pick up ${t.ref.inventory.stacks.map((s) => ITEMS[s.id].name).slice(0, 2).join(', ')}`; break;
        case 'body': prompt = `${key('E')} Access your body`; break;
        case 'drop': prompt = this.player.level >= t.ref.tier.level ? `${key('E')} Open ${t.ref.tier.name} Supply Crate` : `${t.ref.tier.name} Supply Crate — requires Level ${t.ref.tier.level}`; break;
        case 'creature': {
          const c = t.ref;
          if (c.dead) prompt = 'Harvest the corpse with your fists or a tool';
          else if (c.tamed) prompt = `${c.saddle && c.def.rideable ? `${key('E')} Ride  ` : `${key('E')} Options  `}${key('F')} Inventory  Hold ${key('E')} Orders`;
          else if (c.ko && c.taming) { prompt = `${key('E')} / ${key('F')} Feed & Tame`; tame = this.hud.tameHTML(c, this.creatures.tameEstimate(c)); }
          else if (c.ko) prompt = `${c.def.name} cannot be tamed`;
          break;
        }
        case 'structure': {
          const s = t.ref;
          const name = ITEMS[s.type].name;
          if (s.shape === 'door') prompt = `${key('E')} ${s.open ? 'Close' : 'Open'} ${name}  Hold ${key('E')} Options`;
          else if (s.inventory) prompt = `${key('E')} Access ${name}${s.lit ? ' (Lit)' : ''}  Hold ${key('E')} Options`;
          else if (s.type === 'standing_torch') prompt = `${key('E')} ${s.lit ? 'Extinguish' : 'Light'} ${name}  Hold ${key('E')} Options`;
          else prompt = `${name}  Hold ${key('E')} Options`;
          break;
        }
        case 'node': {
          const cls = NODE_KINDS[t.ref.kind].cls;
          if (cls === 'bush') prompt = `${key('E')} Harvest`;
          else if (cls === 'pebble') prompt = `${key('E')} Pick up Stone`;
          else if (cls === 'pearl') prompt = `${key('E')} Pick up Silica Pearls`;
          else if (cls === 'tree') prompt = 'Tree — punch or use a tool';
          else if (cls === 'rock') prompt = 'Rock — use a pick for Flint, a hatchet for Stone';
          else prompt = `${{ metal: 'Metal', obsidian: 'Obsidian', crystal: 'Crystal', oil: 'Oil' }[cls]} — use a pick`;
          break;
        }
        default: break;
      }
    } else if (this.canDrink()) prompt = `${key('E')} Drink`;
    // taming progress is visible whenever you look at the unconscious creature
    if (!tame && far && far.creature.ko && far.creature.taming) tame = this.hud.tameHTML(far.creature, this.creatures.tameEstimate(far.creature));
    const held = p.activeDef();
    if (!prompt && held && held.ammo && !p.riding) {
      const ammo = this.currentAmmo(held);
      prompt = ammo ? `${ITEMS[ammo].name}: ${p.inventory.count(ammo)}${Array.isArray(held.ammo) ? `  ${key('R')} Switch ammo` : ''}` : '<span style="color:var(--bad)">No ammo</span>';
    }
    this.hud.setPrompt(prompt);
    this.hud.setTarget(target);
    this.hud.setTame(tame);
  }
}

const game = new Game();
window.__game = game;
game.boot().catch((err) => {
  console.error(err);
  document.getElementById('loading-text').textContent = `Failed to start: ${err.message}`;
});
