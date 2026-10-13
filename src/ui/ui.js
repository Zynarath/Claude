// Menus and full-screen interfaces: main menu, Host/Local settings, character creation,
// spawn selection, inventory/crafting/engrams, remote inventories, taming, map, death, pause, options.
import { ITEMS } from '../data/items.js';
import { ENGRAMS, HIDDEN_ENGRAMS, MAX_LEVEL, xpForLevel } from '../data/engrams.js';
import { STAT_DEFS, LEVELABLE } from '../game/player.js';
import { TAMED_LEVEL_STATS } from '../game/creatures.js';
import { iconURL } from './icons.js';
import { toLatLon, WORLD_SIZE, HALF } from '../world/terrain.js';
import { OBELISKS } from '../world/landmarks.js';
import { formatTime } from '../core/util.js';

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const SPAWN_ZONES = [
  { name: 'South Zone 1', diff: 'Easy', angle: 112 },
  { name: 'South Zone 2', diff: 'Easy', angle: 90 },
  { name: 'South Zone 3', diff: 'Easy', angle: 68 },
  { name: 'East Zone 1', diff: 'Medium', angle: 12 },
  { name: 'West Zone 1', diff: 'Medium', angle: 192 },
  { name: 'North Zone 1', diff: 'Hard', angle: 285 },
];

const SETTINGS_DEFS = [
  ['difficulty', 'Difficulty Offset', 0, 1, 0.05],
  ['dayCycle', 'Day Cycle Speed', 0.1, 5, 0.1],
  ['tamingSpeed', 'Taming Speed Multiplier', 0.5, 10, 0.5],
  ['harvestAmount', 'Harvest Amount Multiplier', 0.5, 5, 0.25],
  ['xpMult', 'XP Multiplier', 0.5, 10, 0.5],
  ['resourceRespawn', 'Resource Respawn Period', 0.25, 3, 0.25],
  ['playerDamage', 'Player Damage Multiplier', 0.25, 3, 0.25],
  ['dinoDamage', 'Dino Damage Multiplier', 0.25, 3, 0.25],
];

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('screens');
    this.current = null;
    this.inv = null;
    this.tooltip = h('<div class="tooltip hidden"></div>');
    document.body.appendChild(this.tooltip);
    this.hover = null;
    this.mapCanvas = null;
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('mousemove', (e) => {
      if (!this.tooltip.classList.contains('hidden')) {
        this.tooltip.style.left = `${Math.min(window.innerWidth - 340, e.clientX + 16)}px`;
        this.tooltip.style.top = `${Math.min(window.innerHeight - 200, e.clientY + 12)}px`;
      }
    });
  }

  isOpen() { return this.current !== null; }
  blocksGame() { return this.current !== null && this.current !== 'death'; }

  clear() {
    this.root.innerHTML = '';
    this.tooltip.classList.add('hidden');
    this.hover = null;
  }

  close() {
    const wasInv = this.current === 'inventory';
    this.clear();
    this.current = null;
    if (wasInv && this.inv && this.inv.remote && this.inv.remote.onClose) this.inv.remote.onClose();
    this.inv = null;
    this.game.onUIClosed();
  }

  open(name) {
    this.clear();
    this.current = name;
    this.game.onUIOpened();
  }

  // ---------------- main menu ----------------
  showMain() {
    this.open('main');
    const hasSave = this.game.save.exists();
    const el = h(`<div class="screen menu-bg">
      <div class="menu">
        <div class="logo">ARK</div>
        <div class="logo-sub">SURVIVAL EVOLVED</div>
        ${hasSave ? '<button class="btn primary" data-a="continue">Resume Single Player</button>' : ''}
        <button class="btn" data-a="host">Host / Local</button>
        <button class="btn" data-a="options">Options</button>
        <button class="btn" data-a="controls">Controls</button>
        <div class="logo-tag" style="margin-top:22px">EARLY ACCESS · v174 (JUNE 2015)</div>
      </div>
      <div class="disclaimer">Unofficial fan recreation of ARK: Survival Evolved's June 2015 Early Access launch, built from scratch in the browser. Not affiliated with or endorsed by Studio Wildcard. All gameplay data is recreated from public knowledge of the launch-era game.</div>
    </div>`);
    el.querySelector('[data-a=host]').onclick = () => this.showHost();
    el.querySelector('[data-a=options]').onclick = () => this.showOptions(() => this.showMain());
    el.querySelector('[data-a=controls]').onclick = () => this.showControls(() => this.showMain());
    const c = el.querySelector('[data-a=continue]');
    if (c) c.onclick = () => this.game.continueGame();
    this.root.appendChild(el);
  }

  showHost() {
    this.open('host');
    const s = this.game.settings;
    const rows = SETTINGS_DEFS.map(([k, label, min, max, step]) => `<div class="row"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-k="${k}"><span class="v" data-v="${k}">${s[k]}</span></div>`).join('');
    const el = h(`<div class="screen menu-bg"><div class="panel" style="width:640px">
      <h2>Host / Local — Single Player</h2>
      <div style="color:var(--muted);margin-bottom:10px">Default values match the official 2015 single-player rates. Raise Taming Speed or XP if you want a shorter grind.</div>
      ${rows}
      ${this.game.save.exists() ? '<div style="color:var(--warn);margin-top:10px">Starting a new survivor will overwrite your existing save.</div>' : ''}
      <div class="row" style="margin-top:16px;justify-content:space-between">
        <button class="btn" data-a="back">Back</button>
        <button class="btn primary" data-a="play">Play Single Player</button>
      </div></div></div>`);
    el.querySelectorAll('input[type=range]').forEach((inp) => {
      inp.oninput = () => {
        s[inp.dataset.k] = Number(inp.value);
        el.querySelector(`[data-v=${inp.dataset.k}]`).textContent = inp.value;
      };
    });
    el.querySelector('[data-a=back]').onclick = () => this.showMain();
    el.querySelector('[data-a=play]').onclick = () => { this.game.saveSettings(); this.showCharCreate(); };
    this.root.appendChild(el);
  }

  showCharCreate() {
    this.open('char');
    const st = { name: 'Survivor', gender: 'male', skin: 0.35 };
    const el = h(`<div class="screen menu-bg"><div class="panel" style="width:520px">
      <h2>Create Your Survivor</h2>
      <div class="row"><label>Name</label><input type="text" maxlength="24" value="${st.name}" data-k="name" style="flex:1"></div>
      <div class="row"><label>Body Type</label><div class="seg"><button class="btn small on" data-g="male">Male</button><button class="btn small" data-g="female">Female</button></div></div>
      <div class="row"><label>Skin Tone</label><input type="range" min="0" max="1" step="0.01" value="${st.skin}" data-k="skin"><span class="v" data-swatch style="display:inline-block;width:30px;height:22px;border:1px solid var(--line)"></span></div>
      <div style="color:var(--muted);margin:10px 0">You will awaken on a beach with nothing but the strange implant in your arm.</div>
      <div class="row" style="justify-content:space-between"><button class="btn" data-a="back">Back</button><button class="btn primary" data-a="next">Choose Spawn Region</button></div>
    </div></div>`);
    const sw = el.querySelector('[data-swatch]');
    const updSwatch = () => { const c = 78 - st.skin * 50; sw.style.background = `hsl(25, 45%, ${c}%)`; };
    updSwatch();
    el.querySelector('[data-k=name]').oninput = (e) => { st.name = e.target.value.trim() || 'Survivor'; };
    el.querySelector('[data-k=skin]').oninput = (e) => { st.skin = Number(e.target.value); updSwatch(); };
    el.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => {
      st.gender = b.dataset.g;
      el.querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.querySelector('[data-a=back]').onclick = () => this.showHost();
    el.querySelector('[data-a=next]').onclick = () => this.showSpawn((choice) => this.game.newGame(st, choice), () => this.showCharCreate());
    this.root.appendChild(el);
  }

  mapCanvasClone(size = 520) {
    if (!this.mapCanvas) this.mapCanvas = this.game.terrain.renderMapCanvas(512);
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    c.getContext('2d').drawImage(this.mapCanvas, 0, 0);
    c.style.width = c.style.height = `${size}px`;
    return c;
  }

  worldToMap(x, z, size) {
    return { x: ((x + HALF) / WORLD_SIZE) * size, y: ((z + HALF) / WORLD_SIZE) * size };
  }

  showSpawn(onPick, onBack, title = 'Choose a Spawn Region', beds = []) {
    this.open(this.current === 'death' ? 'death' : 'spawn');
    this.current = 'spawn';
    const el = h(`<div class="screen menu-bg"><div class="panel">
      <h2>${title}</h2>
      <div class="spawn-wrap"><div class="mapbox"></div><div class="list"></div></div>
      ${onBack ? '<div class="row" style="margin-top:12px"><button class="btn" data-a="back">Back</button></div>' : ''}
    </div></div>`);
    const mb = el.querySelector('.mapbox');
    mb.appendChild(this.mapCanvasClone(520));
    const list = el.querySelector('.list');
    const zoneEls = [];
    const pts = SPAWN_ZONES.map((z) => this.game.spawnPointForZone(z, false));
    SPAWN_ZONES.forEach((z, i) => {
      const p = pts[i];
      const m = this.worldToMap(p.x, p.z, 520);
      const ze = h(`<div class="zone" style="left:${m.x - 34}px;top:${m.y - 34}px;width:68px;height:68px;border-radius:50%"></div>`);
      mb.appendChild(ze);
      zoneEls.push(ze);
      const b = h(`<button class="btn">${z.name}<span class="sub">${z.diff}</span></button>`);
      b.onmouseenter = () => zoneEls.forEach((x, j) => x.classList.toggle('sel', j === i));
      b.onclick = () => onPick({ zone: z });
      list.appendChild(b);
    });
    for (const bed of beds) {
      const m = this.worldToMap(bed.x, bed.z, 520);
      const dot = h(`<div class="dot" style="left:${m.x}px;top:${m.y}px;background:#ffd166"></div>`);
      mb.appendChild(dot);
      const ready = bed.cooldown <= 0;
      const b = h(`<button class="btn" ${ready ? '' : 'disabled'}>${esc(bed.label)}<span class="sub">${ready ? 'Ready' : `Cooldown ${formatTime(bed.cooldown)}`}</span></button>`);
      b.onmouseenter = () => { zoneEls.forEach((x) => x.classList.remove('sel')); dot.style.transform = 'translate(-50%,-50%) scale(1.8)'; };
      b.onmouseleave = () => { dot.style.transform = ''; };
      b.onclick = () => onPick({ bed: bed.ref });
      list.appendChild(b);
    }
    if (onBack) el.querySelector('[data-a=back]').onclick = onBack;
    this.root.appendChild(el);
  }

  // ---------------- death ----------------
  showDeath(cause, beds) {
    this.open('death');
    const el = h(`<div class="screen" style="background:rgba(30,0,0,0.55)"><div class="death">
      <h1>YOU DIED</h1><div style="font-size:22px;margin:8px 0 20px">${esc(cause)}</div>
      <button class="btn primary center" data-a="respawn" style="min-width:260px">Respawn</button>
    </div></div>`);
    el.querySelector('[data-a=respawn]').onclick = () => {
      this.showSpawn((choice) => this.game.respawn(choice), null, 'Respawn', beds);
    };
    this.root.appendChild(el);
  }

  // ---------------- pause / options ----------------
  showPause() {
    this.open('pause');
    const el = h(`<div class="screen menu-bg"><div class="menu">
      <div class="logo" style="font-size:64px">PAUSED</div>
      <div class="logo-sub" style="margin-bottom:20px">${esc(this.game.sky.timeString())}</div>
      <button class="btn primary" data-a="resume">Resume</button>
      <button class="btn" data-a="save">Save Game</button>
      <button class="btn" data-a="options">Options</button>
      <button class="btn" data-a="controls">Controls</button>
      <button class="btn" data-a="suicide">Suicide (Respawn)</button>
      <button class="btn" data-a="quit">Save &amp; Exit to Main Menu</button>
    </div></div>`);
    el.querySelector('[data-a=resume]').onclick = () => this.close();
    el.querySelector('[data-a=save]').onclick = () => { this.game.saveGame(); this.game.hud.notify('Game saved', 'good'); this.close(); };
    el.querySelector('[data-a=options]').onclick = () => this.showOptions(() => this.showPause());
    el.querySelector('[data-a=controls]').onclick = () => this.showControls(() => this.showPause());
    el.querySelector('[data-a=suicide]').onclick = () => { this.close(); this.game.killPlayer('You committed suicide'); };
    el.querySelector('[data-a=quit]').onclick = () => this.game.exitToMenu();
    this.root.appendChild(el);
  }

  showOptions(back) {
    this.open('options');
    const o = this.game.options;
    const el = h(`<div class="screen menu-bg"><div class="panel" style="width:600px">
      <h2>Options</h2>
      <div class="row"><label>Mouse Sensitivity</label><input type="range" min="0.2" max="3" step="0.05" value="${o.sensitivity}" data-k="sensitivity"><span class="v">${o.sensitivity}</span></div>
      <div class="row"><label>Field of View</label><input type="range" min="60" max="100" step="1" value="${o.fov}" data-k="fov"><span class="v">${o.fov}</span></div>
      <div class="row"><label>View Distance</label><input type="range" min="0.4" max="1.5" step="0.05" value="${o.viewDistance}" data-k="viewDistance"><span class="v">${o.viewDistance}</span></div>
      <div class="row"><label>Master Volume</label><input type="range" min="0" max="1" step="0.05" value="${o.volume}" data-k="volume"><span class="v">${o.volume}</span></div>
      <div class="row"><label>Resolution Scale</label><input type="range" min="0.5" max="1" step="0.05" value="${o.resolution}" data-k="resolution"><span class="v">${o.resolution}</span></div>
      <div class="row"><label>Shadows</label><div class="seg"><button class="btn small ${o.shadows ? 'on' : ''}" data-b="shadows">${o.shadows ? 'On' : 'Off'}</button></div></div>
      <div class="row"><label>Invert Mouse Y</label><div class="seg"><button class="btn small ${o.invertY ? 'on' : ''}" data-b="invertY">${o.invertY ? 'On' : 'Off'}</button></div></div>
      <div class="row"><label>Show FPS</label><div class="seg"><button class="btn small ${o.showFps ? 'on' : ''}" data-b="showFps">${o.showFps ? 'On' : 'Off'}</button></div></div>
      <div class="row" style="margin-top:14px"><button class="btn" data-a="back">Back</button></div>
    </div></div>`);
    el.querySelectorAll('input[type=range]').forEach((inp) => {
      inp.oninput = () => {
        o[inp.dataset.k] = Number(inp.value);
        inp.nextElementSibling.textContent = inp.value;
        this.game.applyOptions();
      };
    });
    el.querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.b;
      o[k] = !o[k];
      b.classList.toggle('on', o[k]);
      b.textContent = o[k] ? 'On' : 'Off';
      this.game.applyOptions();
    }));
    el.querySelector('[data-a=back]').onclick = () => { this.game.saveOptions(); back(); };
    this.root.appendChild(el);
  }

  showControls(back) {
    this.open('controls');
    const keys = [
      ['W A S D', 'Move'], ['Shift', 'Sprint'], ['Space', 'Jump / Swim up / Fly up'], ['C', 'Crouch / Swim & fly down'], ['X', 'Prone'],
      ['Left Mouse', 'Attack / Harvest / Use tool / Place'], ['Right Mouse', 'Aim / Throw spear / Zoom'], ['E', 'Use, pick up, drink, harvest bushes, ride'],
      ['Hold E', 'Options (demolish, tame orders)'], ['F', 'Access inventory of target'], ['I', 'Inventory, crafting & engrams'], ['1 - 0', 'Hotbar'],
      ['Mouse Wheel', 'Cycle hotbar'], ['Q', 'Unequip / Rotate structure'], ['R', 'Reload'], ['K', 'Toggle third person'], ['H', 'Show stat values & time'],
      ['M', 'Map'], ['T', 'Whistle: Follow'], ['Y', 'Whistle: Stop'], ['U', 'Whistle: Aggressive'], ['J', 'Whistle: Passive'], ['N', 'Whistle: Neutral'],
      ['O', 'Drop held item'], ['Esc', 'Pause'],
    ];
    const el = h(`<div class="screen menu-bg"><div class="panel" style="width:760px">
      <h2>Controls</h2>
      <div class="keys">${keys.map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn" data-a="back">Back</button></div></div></div>`);
    el.querySelector('[data-a=back]').onclick = back;
    this.root.appendChild(el);
  }

  // ---------------- rename / context ----------------
  promptRename(c) {
    if (this.current && this.current !== 'inventory' && this.current !== 'ctx') return;
    this.open('rename');
    const el = h(`<div class="screen"><div class="modal-bg"></div><div class="panel" style="position:relative;width:420px">
      <h2>Name your ${esc(c.def.name)}</h2>
      <input type="text" maxlength="24" value="${esc(c.name || c.def.short || c.def.name)}" style="width:100%">
      <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn primary" data-a="ok">OK</button></div>
    </div></div>`);
    const inp = el.querySelector('input');
    const ok = () => { c.name = inp.value.trim().slice(0, 24) || c.def.name; this.close(); };
    el.querySelector('[data-a=ok]').onclick = ok;
    inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); e.stopPropagation(); };
    this.root.appendChild(el);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  }

  showContext(title, options) {
    this.open('ctx');
    const el = h(`<div class="screen"><div class="modal-bg"></div><div class="ctx panel"><div class="head">${esc(title)}</div></div></div>`);
    const box = el.querySelector('.ctx');
    for (const o of options) {
      const b = h(`<button class="btn" ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</button>`);
      b.onclick = () => { this.close(); o.action(); };
      box.appendChild(b);
    }
    const cancel = h('<button class="btn center">Cancel</button>');
    cancel.onclick = () => this.close();
    box.appendChild(cancel);
    el.querySelector('.modal-bg').onclick = () => this.close();
    this.root.appendChild(el);
  }

  // ---------------- map ----------------
  showMap() {
    this.open('map');
    const g = this.game;
    const size = Math.min(window.innerHeight * 0.82, 720);
    const el = h(`<div class="screen" style="background:rgba(0,0,0,0.6)"><div class="panel">
      <h2 style="display:flex;justify-content:space-between">The Island <small style="font-size:15px;color:var(--muted)">${g.player.inventory.count('gps') ? 'GPS active' : 'Craft a GPS to see your position'}</small></h2>
      <div class="mapbox" style="width:${size}px;height:${size}px"></div></div></div>`);
    const mb = el.querySelector('.mapbox');
    mb.appendChild(this.mapCanvasClone(size));
    const mark = (x, z, html, cls = 'marker') => {
      const m = this.worldToMap(x, z, size);
      const e = h(`<div class="${cls}" style="left:${m.x}px;top:${m.y}px">${html}</div>`);
      mb.appendChild(e);
      return e;
    };
    for (const o of g.landmarks.obelisks) mark(o.x, o.z, `<span style="color:${o.color}">▲ ${o.name}</span>`);
    for (const s of g.building.spawnPoints()) mark(s.x, s.z, `<span style="color:#ffd166">■ ${ITEMS[s.type].name}</span>`);
    for (const c of g.creatures.tamedList()) mark(c.pos.x, c.pos.z, `<span style="color:#9de9ff">● ${esc(c.displayName)}</span>`);
    if (g.deathBag) mark(g.deathBag.x, g.deathBag.z, '<span style="color:#ff6a5a">✝ Your body</span>');
    // grid labels
    for (let i = 1; i < 10; i++) {
      mb.appendChild(h(`<div class="marker" style="left:${(i / 10) * size}px;top:8px;color:var(--muted);font-size:11px">${i * 10}</div>`));
      mb.appendChild(h(`<div class="marker" style="left:10px;top:${(i / 10) * size}px;color:var(--muted);font-size:11px">${i * 10}</div>`));
    }
    if (g.player.inventory.count('gps') > 0) {
      const m = this.worldToMap(g.player.pos.x, g.player.pos.z, size);
      const me = h(`<div class="me" style="left:${m.x - 7}px;top:${m.y - 10}px"></div>`);
      me.style.transform = `rotate(${-g.player.yaw}rad)`;
      mb.appendChild(me);
      const ll = toLatLon(g.player.pos.x, g.player.pos.z);
      el.querySelector('small').textContent = `GPS: LAT ${ll.lat.toFixed(1)}  LON ${ll.lon.toFixed(1)}`;
    }
    el.onclick = (e) => { if (e.target === el) this.close(); };
    this.root.appendChild(el);
  }

  // ---------------- inventory ----------------
  // remote: { kind: 'structure'|'creature'|'corpse'|'drop'|'body', title, inventory, ref, station }
  showInventory(remote = null) {
    this.open('inventory');
    this.inv = { remote, tab: remote ? 'remote' : 'craft', search: '', rsearch: '', sel: null, versions: '' };
    this.renderInventory();
  }

  invVersions() {
    const g = this.game, p = g.player;
    const r = this.inv && this.inv.remote;
    return [p.inventory.version, p.level, p.engramPoints, Math.floor(p.xp), p.craftQueue.length, r ? r.inventory.version : 0,
      r && r.ref && r.ref.lit, r && r.ref && r.ref.taming ? Math.floor(r.ref.taming.affinity) : 0, r && r.ref && r.ref.levelUpsAvailable,
      r && r.ref && r.ref.saddle ? r.ref.saddle.uid : '', JSON.stringify(Object.values(p.equipment).map((s) => s && s.uid)), p.hotbar.map((x) => x && (x.uid || x.id)).join()].join('|');
  }

  tick() {
    if (this.current !== 'inventory' || !this.inv) return;
    const v = this.invVersions();
    if (v !== this.inv.versions) this.renderInventory();
    // live progress widgets
    const p = this.game.player;
    const qEl = this.root.querySelector('[data-queue]');
    if (qEl && p.craftQueue[0]) {
      const bar = qEl.querySelector('.qbar > div');
      if (bar) bar.style.width = `${(1 - p.craftQueue[0].remaining / p.craftQueue[0].total) * 100}%`;
    }
    const tame = this.root.querySelector('[data-tame]');
    const r = this.inv.remote;
    if (tame && r && r.ref && r.ref.taming) tame.innerHTML = this.game.hud.tameHTML(r.ref, this.game.creatures.tameEstimate(r.ref));
    if (r && r.ref && r.kind === 'creature' && (r.ref.dead || (!r.ref.ko && !r.ref.tamed))) this.close();
  }

  renderInventory() {
    const g = this.game, p = g.player, st = this.inv;
    st.versions = this.invVersions();
    const scrollTops = [...this.root.querySelectorAll('.grid')].map((x) => x.scrollTop);
    this.root.innerHTML = '';
    const el = h('<div id="inv"><div class="col" data-col="left"></div><div class="col" data-col="mid"></div><div class="col" data-col="right"></div></div>');
    this.root.appendChild(el);
    this.renderPlayerColumn(el.querySelector('[data-col=left]'));
    this.renderCharColumn(el.querySelector('[data-col=mid]'));
    this.renderRightColumn(el.querySelector('[data-col=right]'));
    [...this.root.querySelectorAll('.grid')].forEach((x, i) => { if (scrollTops[i]) x.scrollTop = scrollTops[i]; });
    const searchInput = this.root.querySelector(`input[data-search=${st.focusSearch || 'none'}]`);
    if (searchInput) { searchInput.focus(); searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length); }
  }

  slotHTML(stack, extra = '') {
    const def = ITEMS[stack.id];
    let bars = '';
    if (stack.spoil !== undefined && def.spoil) bars += `<div class="spoil"><div style="width:${(stack.spoil / def.spoil) * 100}%"></div></div>`;
    if (stack.dur !== undefined) bars += `<div class="dur"><div style="width:${(stack.dur / stack.maxDur) * 100}%;background:${stack.dur / stack.maxDur < 0.25 ? 'var(--bad)' : 'var(--good)'}"></div></div>`;
    const hk = this.game.player.hotbar.findIndex((x) => x && (x.uid === stack.uid || (x.id && x.id === stack.id)));
    const qty = stack.water !== undefined ? `${Math.floor(stack.water)}/${def.capacity}` : stack.qty > 1 ? stack.qty : '';
    return `<div class="slot ${extra}" draggable="true" data-uid="${stack.uid}"><img src="${iconURL(stack.id)}" alt="">${hk >= 0 ? `<span class="hk">${(hk + 1) % 10}</span>` : ''}<span class="q">${qty}</span>${bars}</div>`;
  }

  bindSlots(container, where, inventory) {
    container.querySelectorAll('.slot[data-uid]').forEach((s) => {
      const uid = s.dataset.uid;
      const stack = () => (where === 'equip' ? Object.values(this.game.player.equipment).find((x) => x && x.uid === uid) : inventory.byUid(uid));
      s.onmouseenter = () => { this.hover = { where, uid, inventory }; this.showItemTooltip(stack()); };
      s.onmouseleave = () => { this.hover = null; this.tooltip.classList.add('hidden'); };
      s.onclick = () => { this.inv.sel = { where, uid }; this.renderInventory(); };
      s.ondblclick = () => this.defaultAction(where, uid, inventory);
      s.ondragstart = (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ where, uid })); this.dragging = { where, uid, inventory }; };
      s.ondragend = () => { this.dragging = null; };
    });
  }

  bindDropZone(el, onDrop) {
    el.ondragover = (e) => e.preventDefault();
    el.ondrop = (e) => {
      e.preventDefault();
      if (this.dragging) onDrop(this.dragging);
      this.dragging = null;
    };
  }

  showItemTooltip(stack) {
    if (!stack) return;
    const def = ITEMS[stack.id];
    const lines = [`<div class="name">${def.name}</div>`];
    if (def.desc) lines.push(`<div class="req">${def.desc}</div>`);
    const stats = [];
    if (def.damage) stats.push(`Damage: ${def.damage}`);
    if (def.torporDamage) stats.push(`Torpor: ${def.torporDamage}`);
    if (def.armor) stats.push(`Armor: ${def.armor}`);
    if (def.cold) stats.push(`Insulation: ${def.cold} cold / ${def.heat} heat`);
    if (def.food) stats.push(`Food: ${def.food > 0 ? '+' : ''}${def.food}`);
    if (def.water) stats.push(`Water: ${def.water > 0 ? '+' : ''}${def.water}`);
    if (def.health) stats.push(`Health: ${def.health > 0 ? '+' : ''}${def.health}`);
    if (def.torpor) stats.push(`Torpor: ${def.torpor > 0 ? '+' : ''}${def.torpor}`);
    if (def.saddleFor) stats.push(`Equip on: ${def.saddleFor}`);
    if (stack.dur !== undefined) stats.push(`Durability: ${Math.ceil(stack.dur)} / ${stack.maxDur}`);
    if (stack.spoil !== undefined && def.spoil) stats.push(`Spoils in: ${formatTime(stack.spoil)}`);
    stats.push(`Weight: ${(def.weight * stack.qty).toFixed(1)}`);
    lines.push(`<div>${stats.join('<br>')}</div>`);
    this.tooltip.innerHTML = lines.join('');
    this.tooltip.classList.remove('hidden');
  }

  renderPlayerColumn(col) {
    const g = this.game, p = g.player, st = this.inv;
    const stacks = p.inventory.sorted(st.search);
    col.innerHTML = `<div class="title">Inventory <small>${p.inventory.slotsUsed} / ${p.inventory.maxSlots} slots</small></div>
      <div class="searchrow"><input type="text" placeholder="Search…" value="${esc(st.search)}" data-search="left"></div>
      <div class="grid" data-grid="player">${stacks.map((s) => this.slotHTML(s, st.sel && st.sel.uid === s.uid ? 'sel' : '')).join('')}</div>
      <div class="footer"><span>Weight ${p.carried.toFixed(1)} / ${p.maxWeight}</span>${st.remote ? '<button class="btn small" data-a="xferall">Transfer All ▶</button>' : ''}</div>
      <div class="title" style="margin-top:6px;font-size:16px">Hotbar <small>hover an item + press 1-0</small></div>
      <div class="equip" style="grid-template-columns:repeat(10,1fr)" data-hotbar>${p.hotbar.map((hb, i) => {
        const s = hb ? (hb.uid ? p.inventory.byUid(hb.uid) : p.inventory.find(hb.id)) : null;
        return `<div class="slot" data-hb="${i}">${s ? `<img src="${iconURL(s.id)}" alt="">` : ''}<span class="hk">${(i + 1) % 10}</span></div>`;
      }).join('')}</div>
      ${this.detailsHTML()}`;
    const inp = col.querySelector('input[data-search=left]');
    inp.oninput = () => { st.search = inp.value; st.focusSearch = 'left'; this.renderInventory(); };
    inp.onkeydown = (e) => e.stopPropagation();
    inp.onblur = () => { if (st.focusSearch === 'left') st.focusSearch = null; };
    this.bindSlots(col.querySelector('[data-grid=player]'), 'player', p.inventory);
    this.bindDropZone(col.querySelector('[data-grid=player]'), (d) => {
      if (d.where === 'remote') this.transfer(d.inventory, p.inventory, d.uid);
      else if (d.where === 'equip') this.game.unequip(d.uid);
    });
    col.querySelectorAll('[data-hb]').forEach((slot) => {
      const i = Number(slot.dataset.hb);
      this.bindDropZone(slot, (d) => { if (d.where === 'player') this.assignHotbar(d.uid, i); });
      slot.onclick = () => { p.hotbar[i] = null; if (p.activeSlot === i) g.selectSlot(-1); this.renderInventory(); };
    });
    const xa = col.querySelector('[data-a=xferall]');
    if (xa) xa.onclick = () => { for (const s of [...p.inventory.stacks]) if (!ITEMS[s.id].noDrop) this.transfer(p.inventory, st.remote.inventory, s.uid, true); this.renderInventory(); };
    this.bindDetails(col);
  }

  detailsHTML() {
    const st = this.inv;
    if (!st.sel) return '<div class="details"><div class="desc">Select an item. Double-click to use, equip or transfer. Drag items to move them.</div></div>';
    const stack = this.selStack();
    if (!stack) return '<div class="details"></div>';
    const def = ITEMS[stack.id];
    const acts = [];
    if (st.sel.where === 'player') {
      if (def.cat === 'consumable' || def.id === 'waterskin') acts.push(['use', 'Use']);
      if (def.cat === 'armor') acts.push(['equip', 'Equip']);
      if (def.cat === 'saddle' && st.remote && st.remote.kind === 'creature' && st.remote.ref.tamed) acts.push(['saddle', 'Equip Saddle']);
      if (st.remote) { acts.push(['xfer', 'Transfer ▶']); if (stack.qty > 1) acts.push(['xferhalf', 'Transfer Half']); }
      if (stack.qty > 1) acts.push(['split', 'Split']);
      if (stack.dur !== undefined && stack.dur < stack.maxDur && ITEMS[stack.id].recipe) acts.push(['repair', 'Repair']);
      if (!def.noDrop) acts.push(['drop', 'Drop']);
    } else if (st.sel.where === 'remote') {
      acts.push(['take', '◀ Transfer']);
      if (st.remote.kind === 'creature' && st.remote.ref.ko && ['narcoberry', 'narcotic', 'stimberry', 'stimulant'].includes(stack.id)) acts.push(['remoteuse', 'Remote Use']);
    } else if (st.sel.where === 'equip') acts.push(['unequip', 'Unequip']);
    const recipeTxt = def.recipe ? Object.entries(def.recipe).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(', ') : '';
    return `<div class="details"><div class="name">${def.name}${stack.qty > 1 ? ` ×${stack.qty}` : ''}</div><div class="desc">${def.desc || ''}</div>
      ${stack.dur !== undefined ? `<div>Durability ${Math.ceil(stack.dur)} / ${stack.maxDur}</div>` : ''}
      ${def.armor ? `<div>Armor ${def.armor}</div>` : ''}${def.damage ? `<div>Damage ${def.damage}</div>` : ''}
      ${acts.some((a) => a[0] === 'repair') ? `<div class="desc">Repair cost: ~${Math.round((1 - stack.dur / stack.maxDur) * 100)}% of ${recipeTxt}</div>` : ''}
      <div class="actions">${acts.map(([a, l]) => `<button class="btn small" data-act="${a}">${l}</button>`).join('')}</div></div>`;
  }

  selStack() {
    const st = this.inv, p = this.game.player;
    if (!st.sel) return null;
    if (st.sel.where === 'player') return p.inventory.byUid(st.sel.uid);
    if (st.sel.where === 'remote') return st.remote && st.remote.inventory.byUid(st.sel.uid);
    if (st.sel.where === 'equip') return Object.values(p.equipment).find((x) => x && x.uid === st.sel.uid) || (st.remote && st.remote.ref && st.remote.ref.saddle && st.remote.ref.saddle.uid === st.sel.uid ? st.remote.ref.saddle : null);
    return null;
  }

  bindDetails(col) {
    const g = this.game, p = g.player, st = this.inv;
    col.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
      const stack = this.selStack();
      if (!stack) return;
      switch (b.dataset.act) {
        case 'use': g.useItem(stack); break;
        case 'equip': g.equip(stack.uid); break;
        case 'unequip': g.unequip(stack.uid); break;
        case 'saddle': g.equipSaddle(st.remote.ref, stack.uid); break;
        case 'xfer': this.transfer(p.inventory, st.remote.inventory, stack.uid); break;
        case 'xferhalf': this.transfer(p.inventory, st.remote.inventory, stack.uid, false, Math.ceil(stack.qty / 2)); break;
        case 'take': this.transfer(st.remote.inventory, p.inventory, stack.uid); break;
        case 'split': { const part = p.inventory.removeStack(stack, Math.floor(stack.qty / 2)); if (part) { p.inventory.stacks.push(part); p.inventory.changed(); } break; }
        case 'drop': g.dropStack(stack); st.sel = null; break;
        case 'repair': g.repair(stack); break;
        case 'remoteuse': { const c = st.remote.ref; if (st.remote.inventory.remove(stack.id, 1)) { g.player.inventory.add(stack.id, 1); g.creatures.feed(c, stack.id); } break; }
        default: break;
      }
      this.renderInventory();
    }));
  }

  defaultAction(where, uid, inventory) {
    const g = this.game, p = g.player, st = this.inv;
    if (where === 'equip') { g.unequip(uid); this.renderInventory(); return; }
    if (where === 'remote') { this.transfer(inventory, p.inventory, uid); this.renderInventory(); return; }
    const stack = p.inventory.byUid(uid);
    if (!stack) return;
    const def = ITEMS[stack.id];
    if (st.remote) this.transfer(p.inventory, st.remote.inventory, uid);
    else if (def.cat === 'armor') g.equip(uid);
    else if (def.cat === 'consumable' || def.id === 'waterskin') g.useItem(stack);
    else if (['weapon', 'tool', 'structure'].includes(def.cat) || def.equip) { const i = p.hotbar.indexOf(null); if (i >= 0) this.assignHotbar(uid, i); }
    this.renderInventory();
  }

  assignHotbar(uid, i) {
    const p = this.game.player;
    const stack = p.inventory.byUid(uid);
    if (!stack) return;
    const def = ITEMS[stack.id];
    const unique = !!def.durability || def.stack === 1;
    // remove existing assignment of the same item
    for (let k = 0; k < 10; k++) {
      const hb = p.hotbar[k];
      if (hb && (unique ? hb.uid === uid : hb.id === stack.id)) p.hotbar[k] = null;
    }
    p.hotbar[i] = unique ? { uid } : { id: stack.id };
    if (p.activeSlot === i) this.game.selectSlot(i, true);
    this.renderInventory();
  }

  transfer(from, to, uid, silent = false, qty = null) {
    const stack = from.byUid(uid);
    if (!stack) return;
    if (ITEMS[stack.id].noDrop) { this.game.hud.notify('The implant cannot be removed.', 'bad'); return; }
    const remoteCreature = this.inv.remote && this.inv.remote.kind === 'creature' ? this.inv.remote.ref : null;
    if (remoteCreature && to === remoteCreature.inventory && remoteCreature.tamed) {
      const w = ITEMS[stack.id].weight * (qty || stack.qty);
      if (to.weight() + w > remoteCreature.weightMax) { if (!silent) this.game.hud.notify(`${remoteCreature.displayName} is over-encumbered`, 'bad'); return; }
    }
    const part = from.removeStack(stack, qty || stack.qty);
    if (!part) return;
    if (!to.addStack(part)) {
      from.addStack(part);
      if (!silent) this.game.hud.notify('Inventory is full', 'bad');
    }
    if (part.qty > 0 && from.stacks.indexOf(part) < 0 && to.stacks.indexOf(part) < 0) from.add(part.id, part.qty);
    this.game.player.cleanHotbar();
    if (!silent) this.game.audio.play('ui');
  }

  renderCharColumn(col) {
    const g = this.game, p = g.player;
    const cur = xpForLevel(p.level), next = xpForLevel(Math.min(MAX_LEVEL, p.level + 1));
    const slots = ['head', 'chest', 'hands', 'legs', 'feet'];
    const labels = { head: 'Head', chest: 'Chest', hands: 'Hands', legs: 'Legs', feet: 'Feet' };
    const vals = {
      health: `${Math.floor(p.health)} / ${p.maxHealth}`, stamina: `${Math.floor(p.stamina)} / ${p.maxStamina}`,
      oxygen: `${Math.floor(p.oxygen)} / ${p.maxOxygen}`, food: `${Math.floor(p.food)} / ${p.maxFood}`,
      water: `${Math.floor(p.water)} / ${p.maxWater}`, weight: `${p.carried.toFixed(1)} / ${p.maxWeight}`,
      melee: `${p.max('melee')}%`, speed: `${p.max('speed')}%`, fortitude: `${p.fortitude}`,
    };
    col.innerHTML = `<div class="charpanel">
      <div class="title">${esc(p.name)}</div>
      <div class="lvlbox"><div class="big">LEVEL ${p.level}</div>
        <div class="xp">${p.level >= MAX_LEVEL ? 'Max level' : `${Math.floor(p.xp)} / ${next} XP`}</div>
        ${p.canLevel ? '<div style="color:var(--warn);font-weight:700">Choose a stat to level up!</div>' : ''}
        <div class="xp">Engram Points: <b style="color:var(--accent-2)">${p.engramPoints}</b></div></div>
      <div class="equip">${slots.map((s) => {
        const st = p.equipment[s];
        return st ? this.slotHTML(st, '').replace('class="slot "', `class="slot" data-eq="${s}"`) : `<div class="slot" data-eq="${s}"><span class="lbl">${labels[s]}</span></div>`;
      }).join('')}</div>
      <div class="statlist">${LEVELABLE.map((k) => `<div class="statrow"><span class="n">${STAT_DEFS[k].name}</span><span class="v">${vals[k]}</span>${p.canLevel ? `<button class="btn small plus" data-lvl="${k}">+</button>` : ''}</div>`).join('')}
        <div class="statrow"><span class="n">Torpor</span><span class="v">${Math.floor(p.torpor)} / ${p.maxTorpor}</span></div>
        <div class="statrow"><span class="n">Armor</span><span class="v">${Math.round(p.armor)}</span></div>
        <div class="statrow"><span class="n">Temperature</span><span class="v">${p.temperature.toFixed(0)}°C</span></div>
      </div>
      <div class="title" style="font-size:16px;margin:0">Crafting Queue</div>
      <div class="queue" data-queue>${p.craftQueue.map((q, i) => `<div class="slot" data-q="${i}" title="Click to cancel"><img src="${iconURL(q.id)}" alt="">${i === 0 ? '<div class="spoil qbar"><div></div></div>' : ''}</div>`).join('') || '<span style="color:var(--muted);font-size:14px">Nothing being crafted</span>'}</div>
    </div>`;
    col.querySelectorAll('[data-lvl]').forEach((b) => (b.onclick = () => { g.levelUp(b.dataset.lvl); this.renderInventory(); }));
    this.bindSlots(col.querySelector('.equip'), 'equip', null);
    col.querySelectorAll('[data-eq]').forEach((s) => this.bindDropZone(s, (d) => { if (d.where === 'player') g.equip(d.uid); }));
    col.querySelectorAll('[data-q]').forEach((s) => (s.onclick = () => { g.cancelCraft(Number(s.dataset.q)); this.renderInventory(); }));
  }

  renderRightColumn(col) {
    const st = this.inv;
    const tabs = [];
    if (st.remote) tabs.push(['remote', st.remote.title]);
    if (!st.remote || st.remote.station) tabs.push(['craft', st.remote && st.remote.station ? 'Craft' : 'Crafting']);
    if (!st.remote) tabs.push(['engrams', 'Engrams']);
    if (!tabs.some((t) => t[0] === st.tab)) st.tab = tabs[0][0];
    col.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<button class="btn ${st.tab === k ? 'on' : ''}" data-tab="${k}">${esc(l)}</button>`).join('')}</div><div data-body style="display:flex;flex-direction:column;flex:1;min-height:0"></div>`;
    col.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { st.tab = b.dataset.tab; this.renderInventory(); }));
    const body = col.querySelector('[data-body]');
    if (st.tab === 'remote') this.renderRemote(body);
    else if (st.tab === 'craft') this.renderCrafting(body);
    else this.renderEngrams(body);
  }

  renderCrafting(body) {
    const g = this.game, p = g.player, st = this.inv;
    const station = st.remote && st.remote.station;
    const source = station ? st.remote.inventory : p.inventory;
    const known = ENGRAMS.filter((e) => p.known.has(e.id) && !HIDDEN_ENGRAMS.has(e.id) && (e.item.station || null) === (station || null));
    const list = station === 'campfire' || station === 'forge' ? [] : known;
    body.innerHTML = `<div class="title" style="font-size:18px">${station ? `${st.remote.title} Crafting` : 'Inventory Crafting'} <small>click: craft 1 · shift-click: craft 5</small></div>
      <div class="grid" data-grid="craft">${list.map((e) => {
        const can = source.craftableCount(e.item.recipe);
        return `<div class="slot ${can > 0 ? '' : 'cant'}" data-craft="${e.id}"><img src="${iconURL(e.id)}" alt=""><span class="q">${can > 0 ? can : ''}</span></div>`;
      }).join('') || '<div style="color:var(--muted)">Learn engrams to unlock recipes.</div>'}</div>
      ${station ? '' : '<div class="footer"><span>Recipes marked as Mortar and Pestle, Smithy, Campfire or Refining Forge must be crafted at that station.</span></div>'}`;
    body.querySelectorAll('[data-craft]').forEach((s) => {
      const id = s.dataset.craft;
      s.onmouseenter = () => this.showRecipeTooltip(id, source);
      s.onmouseleave = () => this.tooltip.classList.add('hidden');
      s.onclick = (e) => {
        const n = e.shiftKey ? 5 : 1;
        for (let i = 0; i < n; i++) if (!g.craft(id, station ? st.remote.ref : null)) break;
        this.renderInventory();
        this.showRecipeTooltip(id, source);
      };
    });
  }

  showRecipeTooltip(id, source) {
    const def = ITEMS[id];
    const req = Object.entries(def.recipe || {}).map(([k, v]) => {
      const have = source.count(k);
      return `<div class="${have >= v ? 'have' : 'miss'}">${ITEMS[k].name}: ${have} / ${v}</div>`;
    }).join('');
    const where = def.station ? `<div class="req">Crafted in: ${({ mortar: 'Mortar and Pestle', smithy: 'Smithy', campfire: 'Campfire', forge: 'Refining Forge' })[def.station]}</div>` : '';
    this.tooltip.innerHTML = `<div class="name">${def.name}</div><div class="req">${def.desc || ''}</div>${where}<div style="margin-top:4px">${req}</div><div class="req">Craft time: ${def.craftTime || 1}s${def.yields ? ` · Makes ${def.yields}` : ''}</div>`;
    this.tooltip.classList.remove('hidden');
  }

  renderEngrams(body) {
    const g = this.game, p = g.player;
    const list = ENGRAMS.filter((e) => !HIDDEN_ENGRAMS.has(e.id)).sort((a, b) => a.level - b.level || a.points - b.points);
    body.innerHTML = `<div class="title" style="font-size:18px">Engrams <small>${p.engramPoints} points available</small></div>
      <div class="grid" data-grid="engrams">${list.map((e) => {
        const learned = p.known.has(e.id);
        const locked = p.level < e.level;
        const cls = learned ? 'learned' : locked ? 'locked' : p.engramPoints >= e.points ? '' : 'cant';
        return `<div class="slot ${cls}" data-eng="${e.id}"><img src="${iconURL(e.id)}" alt=""><span class="lv">Lv${e.level}</span>${learned ? '' : `<span class="cost">${e.points}EP</span>`}</div>`;
      }).join('')}</div>
      <div class="footer"><span>Click an engram to learn it. Engram Points are earned by levelling up.</span></div>`;
    body.querySelectorAll('[data-eng]').forEach((s) => {
      const e = list.find((x) => x.id === s.dataset.eng);
      s.onmouseenter = () => {
        const def = e.item;
        const req = Object.entries(def.recipe || {}).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(', ');
        this.tooltip.innerHTML = `<div class="name">${def.name}</div><div class="req">${def.desc || ''}</div><div>Requires Level ${e.level} · ${e.points} Engram Points</div><div class="req">Recipe: ${req}</div>${def.station ? `<div class="req">Station: ${def.station}</div>` : ''}${p.known.has(e.id) ? '<div class="have">Learned</div>' : ''}`;
        this.tooltip.classList.remove('hidden');
      };
      s.onmouseleave = () => this.tooltip.classList.add('hidden');
      s.onclick = () => { g.learnEngram(e.id); this.renderInventory(); };
    });
  }

  renderRemote(body) {
    const g = this.game, st = this.inv, r = st.remote;
    const c = r.kind === 'creature' ? r.ref : null;
    let head = '';
    if (c && c.taming) {
      head = `<div data-tame>${g.hud.tameHTML(c, g.creatures.tameEstimate(c))}</div>
        <div class="row" style="flex-wrap:wrap;gap:4px">
          <button class="btn small" data-feed="narcoberry">Feed Narcoberry (${g.player.inventory.count('narcoberry')})</button>
          <button class="btn small" data-feed="narcotic">Feed Narcotic (${g.player.inventory.count('narcotic')})</button>
          <button class="btn small" data-feed="stimberry">Feed Stimberry (${g.player.inventory.count('stimberry')})</button>
        </div>
        <div style="color:var(--muted);font-size:14px">Prefers: ${c.def.tameFoods.map(([id]) => ITEMS[id].name).join(' › ')}</div>`;
    } else if (c && c.tamed) {
      const rows = [
        ['Health', `${Math.floor(c.hp)} / ${Math.floor(c.hpMax)}`, 'health'], ['Stamina', `${Math.floor(c.stamina)} / ${Math.floor(c.staminaMax)}`, 'stamina'],
        ['Food', `${Math.floor(c.food)} / ${Math.floor(c.foodMax)}`, 'food'], ['Weight', `${c.inventory.weight().toFixed(1)} / ${Math.floor(c.weightMax)}`, 'weight'],
        ['Melee Damage', `${Math.round(c.damageMult * 100)}%`, 'melee'], ['Movement Speed', `${Math.round(c.speedMult * 100)}%`, 'speed'],
      ];
      head = `<div class="lvlbox"><div class="big" style="font-size:22px">${esc(c.displayName)} — Lvl ${c.level}</div>
          ${c.levelUpsAvailable ? `<div style="color:var(--warn)">${c.levelUpsAvailable} level-up point(s) available</div>` : ''}</div>
        <div class="statlist" style="flex:none;max-height:190px">${rows.map(([n, v, k]) => `<div class="statrow"><span class="n">${n}</span><span class="v">${v}</span>${c.levelUpsAvailable && TAMED_LEVEL_STATS.includes(k) ? `<button class="btn small plus" data-clvl="${k}">+</button>` : ''}</div>`).join('')}</div>
        <div class="row"><span style="color:var(--muted)">Saddle:</span><div class="slot" style="width:56px" data-saddle>${c.saddle ? `<img src="${iconURL(c.saddle.id)}" alt="">` : ''}</div>
          <span style="color:var(--muted);font-size:14px">${c.def.saddle ? (c.saddle ? 'Click to remove' : `Needs ${ITEMS[c.def.saddle].name}`) : 'Cannot be ridden'}</span></div>`;
    } else if (r.ref && (r.ref.type === 'campfire' || r.ref.type === 'refining_forge' || r.ref.type === 'standing_torch')) {
      const s = r.ref;
      head = `<div class="row"><button class="btn ${s.lit ? 'primary' : ''}" data-light>${s.lit ? 'Extinguish' : 'Light Fire'}</button>
        <span style="color:var(--muted);font-size:14px">${s.type === 'campfire' ? 'Burns Thatch/Wood. Cooks Raw Meat. Burning Wood makes Charcoal.' : s.type === 'refining_forge' ? 'Burns Thatch/Wood/Oil. Smelts 2 Metal into 1 Metal Ingot.' : 'Burns Thatch/Wood.'}</span></div>`;
    }
    body.innerHTML = `${head}<div class="title" style="font-size:18px;margin-top:6px">${esc(r.title)} <small>${r.inventory.slotsUsed} / ${r.inventory.maxSlots}</small></div>
      <div class="grid" data-grid="remote">${r.inventory.sorted(st.rsearch).map((s) => this.slotHTML(s, st.sel && st.sel.uid === s.uid ? 'sel' : '')).join('')}</div>
      <div class="footer"><button class="btn small" data-a="takeall">◀ Take All</button></div>`;
    this.bindSlots(body.querySelector('[data-grid=remote]'), 'remote', r.inventory);
    this.bindDropZone(body.querySelector('[data-grid=remote]'), (d) => { if (d.where === 'player') this.transfer(g.player.inventory, r.inventory, d.uid); });
    body.querySelector('[data-a=takeall]').onclick = () => { for (const s of [...r.inventory.stacks]) this.transfer(r.inventory, g.player.inventory, s.uid, true); this.renderInventory(); };
    body.querySelectorAll('[data-feed]').forEach((b) => (b.onclick = () => {
      if (!g.creatures.feed(c, b.dataset.feed)) g.hud.notify(`You have no ${ITEMS[b.dataset.feed].name}`, 'bad');
      this.renderInventory();
    }));
    body.querySelectorAll('[data-clvl]').forEach((b) => (b.onclick = () => { g.levelCreature(c, b.dataset.clvl); this.renderInventory(); }));
    const sad = body.querySelector('[data-saddle]');
    if (sad) {
      sad.onclick = () => { if (c.saddle) g.removeSaddle(c); this.renderInventory(); };
      this.bindDropZone(sad, (d) => { if (d.where === 'player') g.equipSaddle(c, d.uid); });
    }
    const light = body.querySelector('[data-light]');
    if (light) light.onclick = () => { g.building.setLit(r.ref, !r.ref.lit); this.renderInventory(); };
  }

  // ---------------- keyboard ----------------
  onKey(e) {
    const g = this.game;
    if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    // keys handled by an open interface must not also trigger gameplay this frame
    if (this.current) g.input.pressed.delete(e.code);
    if (this.current === 'inventory') {
      if (e.code === 'KeyI' || e.code === 'Escape' || e.code === 'KeyF' || e.code === 'Tab') { e.preventDefault(); this.close(); return; }
      const m = e.code.match(/^Digit(\d)$/);
      if (m && this.hover && this.hover.where === 'player') {
        const n = Number(m[1]);
        this.assignHotbar(this.hover.uid, n === 0 ? 9 : n - 1);
        return;
      }
      if (e.code === 'KeyT' && this.hover) {
        const r = this.inv.remote;
        if (r) {
          if (this.hover.where === 'player') this.transfer(g.player.inventory, r.inventory, this.hover.uid);
          else if (this.hover.where === 'remote') this.transfer(r.inventory, g.player.inventory, this.hover.uid);
          this.renderInventory();
        }
      }
      if (e.code === 'KeyE' && this.hover) this.defaultAction(this.hover.where, this.hover.uid, this.hover.inventory);
      if (e.code === 'KeyO' && this.hover && this.hover.where === 'player') {
        const s = g.player.inventory.byUid(this.hover.uid);
        if (s) { g.dropStack(s); this.renderInventory(); }
      }
      return;
    }
    if (this.current === 'map' && (e.code === 'KeyM' || e.code === 'Escape')) { this.close(); return; }
    if (['pause', 'ctx', 'controls', 'options'].includes(this.current) && e.code === 'Escape') {
      if (this.current === 'pause' || this.current === 'ctx') this.close();
      else if (g.state === 'playing') this.showPause();
    }
  }
}
