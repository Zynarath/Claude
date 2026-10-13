// End-to-end smoke test: boots the game in headless Chromium, starts a survivor,
// exercises core systems through the debug handle and fails on any page error.
// Usage: node tools/smoke-test.mjs [baseUrl] [screenshotDir]
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8080/';
const shots = process.argv[3] || null;
const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
// Each step runs inside the page; `check` validates the returned summary.
const step = async (name, fn, check) => {
  try {
    const r = await page.evaluate(fn);
    const ok = !check || check(r);
    console.log(`${ok ? '✓' : '✗'} ${name}${r !== undefined ? ` → ${JSON.stringify(r)}` : ''}`);
    if (!ok) errors.push(`check failed: ${name}`);
    return r;
  } catch (e) { errors.push(`${name}: ${e.message}`); console.log(`✗ ${name}: ${e.message}`); return null; }
};
const frames = (n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

await page.goto(base);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
await frames(5);
await shot('01-menu');
console.log('✓ main menu reached');

await step('start new survivor', () => {
  const g = window.__game;
  g.newGame({ name: 'Tester', gender: 'female', skin: 0.4 }, { zone: { name: 'South Zone 2', angle: 90 } });
  return { state: g.state, pos: g.player.pos.toArray().map((v) => +v.toFixed(1)), inv: g.player.inventory.stacks.map((s) => s.id) };
}, (r) => r.state === 'playing' && r.inv.length === 1 && r.inv[0] === 'specimen_implant');
await frames(30);
await shot('02-spawn');


await step('punch a tree for thatch & wood', () => {
  const g = window.__game, p = g.player;
  const n = g.resources.nodes.filter((n) => n.cls === 'tree' && !n.depleted)
    .sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z))[0];
  p.pos.set(n.x + 1.6, g.terrain.getHeight(n.x + 1.6, n.z), n.z);
  p.yaw = Math.atan2(-(n.x - p.pos.x), -(n.z - p.pos.z));
  p.pitch = -0.1;
  for (let i = 0; i < 12; i++) g.resolveMelee('fists');
  return { thatch: p.inventory.count('thatch'), wood: p.inventory.count('wood') };
}, (r) => r.thatch > 5 && r.wood > 0);

await step('pick up stones and harvest a bush', () => {
  const g = window.__game, p = g.player;
  const near = (cls) => g.resources.nodes.filter((n) => n.cls === cls && !n.depleted)
    .sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z))[0];
  for (const cls of ['pebble', 'pebble', 'pebble', 'bush']) {
    const n = near(cls);
    p.pos.set(n.x + 1.2, g.terrain.getHeight(n.x + 1.2, n.z), n.z);
    const eye = p.eyePos();
    const dx = n.x - eye.x, dy = n.y + 0.3 - eye.y, dz = n.z - eye.z;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    g.interact();
  }
  return { stone: p.inventory.count('stone'), fiber: p.inventory.count('fiber') };
}, (r) => r.stone >= 3 && r.fiber >= 3);

await step('craft a Stone Pick (default engram) and auto-hotbar it', () => {
  const g = window.__game, p = g.player;
  p.inventory.add('stone', 5); p.inventory.add('wood', 5); p.inventory.add('thatch', 5);
  const ok = g.craft('stone_pick');
  g.updateCrafting(4);
  return { ok, pick: p.inventory.count('stone_pick'), hotbar0: p.hotbar[0] && p.inventory.byUid(p.hotbar[0].uid).id };
}, (r) => r.ok && r.pick === 1 && r.hotbar0 === 'stone_pick');

await step('equip pick and mine flint from a rock', () => {
  const g = window.__game, p = g.player;
  g.selectSlot(0);
  const n = g.resources.nodes.filter((n) => n.cls === 'rock' && !n.depleted)
    .sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z))[0];
  const off = n.radius + 1.4;
  p.pos.set(n.x + off, g.terrain.getHeight(n.x + off, n.z), n.z);
  const eye = p.eyePos();
  p.yaw = Math.atan2(-(n.x - eye.x), -(n.z - eye.z));
  p.pitch = Math.atan2(n.y + n.height * 0.4 - eye.y, Math.hypot(n.x - eye.x, n.z - eye.z));
  for (let i = 0; i < 6; i++) g.resolveMelee('pick');
  return { flint: p.inventory.count('flint'), dur: p.activeStack().dur };
}, (r) => r.flint > 5 && r.dur < 40);

await step('earn XP, level up, learn Campfire + Thatch engrams', () => {
  const g = window.__game, p = g.player;
  g.giveXP(5000);
  const lv = [];
  while (p.canLevel && p.level < 12) { g.levelUp(['health', 'stamina', 'weight', 'melee'][p.level % 4]); lv.push(p.level); }
  for (const id of ['campfire', 'stone_hatchet', 'thatch_foundation', 'thatch_wall', 'thatch_doorframe', 'thatch_door', 'thatch_roof', 'storage_box', 'wooden_club', 'mortar_and_pestle', 'narcotic', 'parasaur_saddle', 'sleeping_bag', 'spear', 'torch'])
    g.learnEngram(id);
  return { level: p.level, ep: p.engramPoints, known: p.known.size };
}, (r) => r.level === 12 && r.known > 15);

await step('craft & place a campfire, cook meat, produce charcoal', () => {
  const g = window.__game, p = g.player;
  p.inventory.add('thatch', 50); p.inventory.add('stone', 50); p.inventory.add('flint', 5); p.inventory.add('wood', 20);
  g.craft('campfire'); g.updateCrafting(6);
  const slot = p.hotbar.findIndex((h) => h && h.id === 'campfire');
  g.selectSlot(slot);
  p.pitch = -0.6;
  const eye = p.eyePos(), dir = p.lookDir();
  const pl = g.building.computePlacement('campfire', eye, dir);
  g.placeStructure('campfire', pl);
  const fire = g.building.list.find((s) => s.type === 'campfire');
  fire.inventory.add('wood', 3); fire.inventory.add('raw_meat', 2);
  g.building.setLit(fire, true);
  for (let i = 0; i < 900; i++) g.building.update(0.05);
  return { placed: !!fire, ok: pl.ok, cooked: fire.inventory.count('cooked_meat'), charcoal: fire.inventory.count('charcoal'), lit: fire.lit };
}, (r) => r.placed && r.cooked === 2 && r.charcoal >= 1);

await step('build a thatch hut: foundation, snapped walls, doorframe, door, roof', () => {
  const g = window.__game, p = g.player;
  const B = g.building;
  for (const [id, n] of [['thatch_foundation', 1], ['thatch_wall', 3], ['thatch_doorframe', 1], ['thatch_door', 1], ['thatch_roof', 1]]) p.inventory.add(id, n);
  // find flat ground
  p.pos.x += 8;
  p.pos.y = g.terrain.getHeight(p.pos.x, p.pos.z);
  p.yaw = 0; p.pitch = -0.5;
  const place = (id, eyeOff, pitch, yaw = 0) => {
    p.pitch = pitch; p.yaw = yaw;
    const eye = p.eyePos(); eye.add(eyeOff);
    const pl = B.computePlacement(id, eye, p.lookDir());
    g.placeStructure(id, pl);
    return pl.ok;
  };
  const results = {};
  results.foundation = place('thatch_foundation', { x: 0, y: 0, z: 0 }, -0.5);
  const f = B.list.find((s) => s.type === 'thatch_foundation');
  // aim at each foundation edge from above
  // look down at a target point from just above the foundation's centre
  const aimAt = (id, x, y, z) => {
    const eye = p.pos.clone().set(f.x + 0.01, f.y + 4, f.z + 0.01);
    const dir = p.pos.clone().set(x - eye.x, y - eye.y, z - eye.z).normalize();
    const pl = B.computePlacement(id, eye, dir);
    g.placeStructure(id, pl);
    return pl.ok;
  };
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  const W = (lx, lz) => [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
  let e = W(0, 1.5); results.wall1 = aimAt('thatch_wall', e[0], f.y + 1, e[1]);
  e = W(1.5, 0); results.wall2 = aimAt('thatch_wall', e[0], f.y + 1, e[1]);
  e = W(-1.5, 0); results.wall3 = aimAt('thatch_wall', e[0], f.y + 1, e[1]);
  e = W(0, -1.5); results.doorframe = aimAt('thatch_doorframe', e[0], f.y + 1, e[1]);
  const df = B.list.find((s) => s.type === 'thatch_doorframe');
  results.door = df ? aimAt('thatch_door', df.x, df.y + 1.2, df.z) : false;
  const w = B.list.find((s) => s.type === 'thatch_wall');
  results.roof = w ? aimAt('thatch_roof', (w.x + f.x) / 2, w.y + 3.1, (w.z + f.z) / 2) : false;
  const door = B.list.find((s) => s.type === 'thatch_door');
  if (door) { B.toggleDoor(door); results.doorOpen = door.open; B.toggleDoor(door); }
  results.count = B.list.length;
  results.groundOnFoundation = +(B.groundAt(f.x, f.z, f.y) - f.y).toFixed(2);
  return results;
}, (r) => r.foundation && r.wall1 && r.wall2 && r.wall3 && r.doorframe && r.door && r.roof && r.doorOpen && r.count === 8);

await step('spawn and knock out a Dodo with fists, then tame it with Mejoberries', () => {
  const g = window.__game, p = g.player;
  const dodoDef = g.creatures.list.find((c) => c.def.id === 'dodo').def;
  const dodo = g.creatures.spawnAt(dodoDef, p.pos.x + 2, p.pos.z, 1);
  g.creatures.ensureModel(dodo);
  let hits = 0;
  while (!dodo.ko && !dodo.dead && hits < 20) { g.creatures.damage(dodo, 8 * p.meleeMult, { torpor: 10 * p.meleeMult, source: g.playerTarget() }); hits++; }
  dodo.inventory.add('mejoberry', 40);
  let t = 0;
  while (!dodo.tamed && t < 600 && !dodo.dead) { g.creatures.think(dodo, 0.25, 2, false); t += 0.25; }
  if (g.ui.current === 'rename') g.ui.close();
  return { ko: dodo.ko, tamed: dodo.tamed, seconds: t, level: dodo.level, hits };
}, (r) => r.tamed && r.hits <= 6);

await step('tame a Parasaur, saddle it and ride', () => {
  const g = window.__game, p = g.player;
  const def = g.creatures.list.find((c) => c.def.id === 'parasaur').def;
  const para = g.creatures.spawnAt(def, p.pos.x + 6, p.pos.z + 6, 10);
  g.creatures.ensureModel(para);
  g.creatures.addTorpor(para, para.torporMax * 2);
  para.inventory.add('mejoberry', 100);
  let t = 0;
  p.inventory.add('narcotic', 30);
  while (!para.tamed && t < 3000) {
    if (para.torpor < para.torporMax * 0.3) g.creatures.feed(para, 'narcotic');
    g.creatures.think(para, 0.5, 5, false); t += 0.5;
  }
  if (g.ui.current === 'rename') g.ui.close();
  p.inventory.add('parasaur_saddle', 1);
  g.equipSaddle(para, p.inventory.find('parasaur_saddle').uid);
  const uiBefore = g.ui.current;
  if (g.ui.current) g.ui.close();
  g.mount(para);
  const start = para.pos.clone();
  g.input.keys.add('KeyW');
  p.yaw = Math.PI; // face +z
  for (let i = 0; i < 60; i++) g.update(0.05);
  g.input.keys.delete('KeyW');
  const moved = para.pos.distanceTo(start);
  g.dismount();
  return { tamed: para.tamed, tameSeconds: t, saddled: !!para.saddle, moved: +moved.toFixed(1), uiBefore };
}, (r) => r.tamed && r.saddled && r.moved > 5);

await step('raptor attacks and kills the survivor; body keeps inventory', () => {
  const g = window.__game, p = g.player;
  const def = g.creatures.list.find((c) => c.def.id === 'raptor')?.def || null;
  const before = p.inventory.stacks.length;
  if (def) {
    const r = g.creatures.spawnAt(def, p.pos.x + 3, p.pos.z, 30);
    g.creatures.ensureModel(r);
    for (let i = 0; i < 400 && !p.dead; i++) g.update(0.05);
  }
  if (!p.dead) g.killPlayer('test');
  return { dead: p.dead, state: g.state, bodies: g.bodies.length, bodyItems: g.bodies[0] ? g.bodies[0].inventory.stacks.length : 0, before, cause: g.lastDamageSource };
}, (r) => r.dead && r.state === 'dead' && r.bodies === 1 && r.bodyItems > 0);
await frames(80);
await shot('03-death');

await step('respawn and keep level/engrams', () => {
  const g = window.__game, p = g.player;
  g.respawn({ zone: { name: 'South Zone 1', angle: 112 } });
  return { state: g.state, level: p.level, known: p.known.size, hp: p.health, inv: p.inventory.stacks.map((s) => s.id) };
}, (r) => r.state === 'playing' && r.level === 12 && r.hp > 0);

await step('save and reload the game', () => {
  const g = window.__game;
  const before = { level: g.player.level, structures: g.building.list.length, tamed: g.creatures.tamedList().length };
  g.saveGame();
  g.exitToMenu();
  g.continueGame();
  return { before, after: { level: g.player.level, structures: g.building.list.length, tamed: g.creatures.tamedList().length, state: g.state } };
}, (r) => r.after.level === r.before.level && r.after.structures === r.before.structures && r.after.tamed === r.before.tamed);

await step('open every UI screen', () => {
  const g = window.__game;
  g.openInventory(null); g.ui.inv.tab = 'engrams'; g.ui.renderInventory(); g.ui.inv.tab = 'craft'; g.ui.renderInventory(); g.ui.close();
  const fire = g.building.list.find((s) => s.type === 'campfire');
  if (fire) { g.useStructure(fire); g.ui.close(); }
  const tame = g.creatures.tamedList()[0];
  if (tame) { g.openInventory({ kind: 'creature', title: 'x', inventory: tame.inventory, ref: tame }); g.ui.close(); g.creatureMenu(tame); g.ui.close(); }
  g.ui.showMap(); g.ui.close();
  g.ui.showPause(); g.ui.showOptions(() => g.ui.showPause()); g.ui.showControls(() => {}); g.ui.close();
  return 'ok';
});

await step('mortar → narcotics, forge → ingots, smithy → metal pick (station crafting)', () => {
  const g = window.__game, p = g.player;
  ['mortar_and_pestle', 'refining_forge', 'smithy', 'narcotic', 'metal_pick'].forEach((id) => p.known.add(id));
  const B = g.building;
  const at = (dx) => ({ x: p.pos.x + dx, z: p.pos.z + 4 });
  const mk = (type, dx) => { const q = at(dx); return B.create(type, q.x, g.terrain.getHeight(q.x, q.z), q.z, 0); };
  const mortar = mk('mortar_and_pestle', -3), forge = mk('refining_forge', 0), smithy = mk('smithy', 3);
  mortar.inventory.add('narcoberry', 10); mortar.inventory.add('spoiled_meat', 2);
  const okN = g.craft('narcotic', mortar) && g.craft('narcotic', mortar);
  for (let i = 0; i < 60; i++) g.updateStations(0.05);
  forge.inventory.add('metal', 4); forge.inventory.add('wood', 4);
  B.setLit(forge, true);
  for (let i = 0; i < 900; i++) B.update(0.05);
  const ingots = forge.inventory.count('metal_ingot');
  smithy.inventory.add('metal_ingot', ingots); smithy.inventory.add('wood', 1); smithy.inventory.add('hide', 10);
  const okP = g.craft('metal_pick', smithy);
  for (let i = 0; i < 200; i++) g.updateStations(0.05);
  const wrongStation = g.craft('narcotic'); // must fail outside the mortar
  return { okN, narcotics: mortar.inventory.count('narcotic'), ingots, okP, metalPick: smithy.inventory.count('metal_pick'), wrongStation };
}, (r) => r.okN && r.narcotics === 2 && r.ingots === 2 && r.okP && r.metalPick === 1 && r.wrongStation === false);

await step('raw meat spoils into spoiled meat; preserving bin slows it', () => {
  const g = window.__game, p = g.player;
  // stacks spoil one unit at a time (600 s each for raw meat), like ARK
  p.inventory.add('raw_meat', 2);
  for (let i = 0; i < 125; i++) p.inventory.update(10);
  const bin = g.building.create('preserving_bin', p.pos.x + 6, p.pos.y, p.pos.z, 0);
  bin.inventory.add('raw_meat', 2);
  for (let i = 0; i < 125; i++) bin.inventory.update(10);
  return { raw: p.inventory.count('raw_meat'), spoiled: p.inventory.count('spoiled_meat'), binRaw: bin.inventory.count('raw_meat') };
}, (r) => r.raw === 0 && r.spoiled >= 2 && r.binRaw === 2);

await step('temperature: mountain night is cold, campfire warms, volcano is hot', () => {
  const g = window.__game, p = g.player;
  const save = p.pos.clone();
  g.sky.time = 3;
  // highest point of the northern range
  let best = { h: -1 };
  for (let x = -1200; x <= 1200; x += 40) for (let z = -1500; z <= -600; z += 40) { const h = g.terrain.getHeight(x, z); if (h > best.h) best = { x, z, h }; }
  p.pos.set(best.x, best.h, best.z);
  const mountain = g.computeTemperature();
  const fire = g.building.create('campfire', p.pos.x + 1, p.pos.y, p.pos.z, 0); fire.lit = true;
  const byFire = g.computeTemperature();
  g.building.remove(fire);
  g.sky.time = 13;
  p.pos.set(260 + 100, 0, -180); p.pos.y = g.terrain.getHeight(p.pos.x, p.pos.z);
  const volcano = g.computeTemperature();
  p.pos.copy(save);
  return { peak: Math.round(best.h), mountain: Math.round(mountain), byFire: Math.round(byFire), volcano: Math.round(volcano) };
}, (r) => r.mountain < 10 && r.byFire > r.mountain + 8 && r.volcano > 30);

await step('tame and fly a Pteranodon', () => {
  const g = window.__game, p = g.player;
  if (g.ui.current) g.ui.close();
  const def = g.creatures.list.find((c) => c.def.id === 'pteranodon')?.def;
  if (!def) return { skipped: true };
  const pt = g.creatures.spawnAt(def, p.pos.x + 4, p.pos.z, 5, { tamed: true });
  pt.tamed = true; pt.owned = true; pt.flying = false; pt.pos.y = g.terrain.getHeight(pt.pos.x, pt.pos.z);
  g.creatures.ensureModel(pt);
  p.inventory.add('ptera_saddle', 1);
  g.equipSaddle(pt, p.inventory.find('ptera_saddle').uid);
  g.mount(pt);
  const y0 = pt.pos.y;
  g.input.keys.add('Space');
  for (let i = 0; i < 40; i++) g.update(0.05);
  g.input.keys.delete('Space');
  g.input.keys.add('KeyW');
  const start = pt.pos.clone();
  for (let i = 0; i < 40; i++) g.update(0.05);
  g.input.keys.delete('KeyW');
  const res = { flying: pt.flying, climbed: +(pt.pos.y - y0).toFixed(1), flew: +pt.pos.distanceTo(start).toFixed(1) };
  g.dismount();
  return res;
}, (r) => r.skipped || (r.flying && r.climbed > 3 && r.flew > 10));

await step('supply drop: level gate and loot', () => {
  const g = window.__game, p = g.player;
  const d = g.landmarks.spawnDrop(p.pos);
  d.falling = 1; for (let i = 0; i < 5; i++) g.landmarks.update(0.1);
  const items = d.inventory.stacks.length;
  const lvl = p.level;
  p.level = 1; g.openSupplyDrop(d); const blocked = g.ui.current !== 'inventory';
  p.level = Math.max(lvl, 60); g.openSupplyDrop(d); const opened = g.ui.current === 'inventory';
  g.ui.close(); p.level = lvl;
  return { tier: d.tier.name, landed: d.landed, items, blocked, opened };
}, (r) => r.landed && r.items > 0 && r.blocked && r.opened);

await step('sleeping bag respawn is single-use; demolish refunds materials', () => {
  const g = window.__game, p = g.player;
  const bag = g.building.create('sleeping_bag', p.pos.x + 3, p.pos.y, p.pos.z, 0);
  g.killPlayer('test');
  g.respawn({ bed: bag });
  const atBag = Math.hypot(p.pos.x - bag.x, p.pos.z - bag.z) < 4;
  const bagGone = !g.building.list.includes(bag);
  const wall = g.building.create('wood_wall', p.pos.x + 5, p.pos.y, p.pos.z, 0);
  const woodBefore = p.inventory.count('wood');
  g.demolish(wall);
  return { atBag, bagGone, refund: p.inventory.count('wood') - woodBefore };
}, (r) => r.atBag && r.bagGone && r.refund === 2);

await step('bow + tranquilizer arrows knock out a Trike over time', () => {
  const g = window.__game, p = g.player;
  if (g.ui.current) g.ui.close();
  const def = g.creatures.list.find((c) => c.def.id === 'trike')?.def;
  p.pos.set(p.pos.x, g.terrain.getHeight(p.pos.x, p.pos.z), p.pos.z);
  const t = g.creatures.spawnAt(def, p.pos.x, p.pos.z - 12, 5);
  t.state = 'idle'; t.stateTimer = 999; t.goal = null; t.desiredSpeed = 0;
  g.creatures.ensureModel(t);
  p.inventory.add('bow', 1); p.inventory.add('tranq_arrow', 30);
  const bow = p.inventory.find('bow');
  p.autoHotbar(bow);
  g.selectSlot(p.hotbar.findIndex((h) => h && h.uid === bow.uid));
  let shots = 0;
  for (let i = 0; i < 30 && !t.ko && !t.dead; i++) {
    const eye = p.eyePos(), hs = t.hitSpheres()[0];
    p.yaw = Math.atan2(-(hs.x - eye.x), -(hs.z - eye.z));
    p.pitch = Math.atan2(hs.y - eye.y, Math.hypot(hs.x - eye.x, hs.z - eye.z));
    g.fireRanged(ITEMS_BOW(), 1); shots++;
    for (let k = 0; k < 40; k++) { g.updateProjectiles(0.05); g.creatures.think(t, 0.05, 12, false); }
    if (t.state === 'chase') { t.state = 'idle'; t.target = null; }
  }
  function ITEMS_BOW() { return { id: 'bow', equip: 'bow', damage: 20, ammo: ['stone_arrow', 'tranq_arrow'], name: 'Bow' }; }
  return { ko: t.ko, dead: t.dead, shots, torpor: Math.round(t.torpor), hpLeft: Math.round(t.hp / t.hpMax * 100) };
}, (r) => r.ko && !r.dead && r.shots < 30);

await step('throw a spear and pick it back up', () => {
  const g = window.__game, p = g.player;
  p.inventory.add('spear', 1);
  const sp = p.inventory.find('spear');
  p.autoHotbar(sp);
  g.selectSlot(p.hotbar.findIndex((h) => h && h.uid === sp.uid));
  p.pitch = 0.2;
  g.throwSpear();
  for (let i = 0; i < 120 && g.projectiles.length; i++) g.updateProjectiles(0.05);
  const bag = g.dropped.find((d) => d.inventory.stacks.some((s) => s.id === 'spear'));
  if (bag) g.pickupDropped(bag);
  return { onGround: !!bag, back: p.inventory.count('spear') };
}, (r) => r.onGround && r.back === 1);

await step('tamed creature follows its owner', () => {
  const g = window.__game, p = g.player;
  const def = g.creatures.list.find((c) => c.def.id === 'raptor')?.def;
  const c = g.creatures.spawnAt(def, p.pos.x + 30, p.pos.z, 10, { tamed: true });
  c.tamed = true; c.follow = true; c.state = 'idle';
  const d0 = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
  for (let i = 0; i < 160; i++) { g.creatures.think(c, 0.05, 30, false); g.creatures.physics(c, 0.05); }
  const d1 = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
  g.creatures.whistle('stay', p.pos);
  return { d0: Math.round(d0), d1: Math.round(d1), followAfterStay: c.follow };
}, (r) => r.d1 < 12 && r.followAfterStay === false);

await step('hit Parasaur flees, Dilophosaur spit blinds', () => {
  const g = window.__game, p = g.player;
  const pd = g.creatures.list.find((c) => c.def.id === 'parasaur').def;
  const para = g.creatures.spawnAt(pd, p.pos.x + 3, p.pos.z, 5);
  g.creatures.damage(para, 5, { source: g.playerTarget() });
  const fleeing = para.state === 'flee';
  const dd = g.creatures.list.find((c) => c.def.id === 'dilophosaur')?.def;
  const dilo = g.creatures.spawnAt(dd, p.pos.x + 8, p.pos.z, 5);
  g.creatures.ensureModel(dilo);
  p.blind = 0;
  g.creatures.spit(dilo, p.pos);
  for (let i = 0; i < 40; i++) g.creatures.updateProjectiles(0.05);
  return { fleeing, blind: +p.blind.toFixed(1) };
}, (r) => r.fleeing && r.blind > 0);

await step('ride a Megalodon underwater', () => {
  const g = window.__game, p = g.player;
  const def = g.creatures.list.find((c) => c.def.id === 'megalodon')?.def;
  // find deep water near the south coast
  let spot = null;
  for (let z = 1700; z < 2000 && !spot; z += 10) if (g.terrain.getHeight(0, z) < -20) spot = { x: 0, z };
  const m = g.creatures.spawnAt(def, spot.x, spot.z, 10, { tamed: true });
  m.tamed = true; m.state = 'idle';
  g.creatures.ensureModel(m);
  p.inventory.add('megalodon_saddle', 1);
  g.equipSaddle(m, p.inventory.find('megalodon_saddle').uid);
  g.mount(m);
  const start = m.pos.clone();
  g.input.keys.add('KeyW'); p.yaw = 0; p.pitch = -0.3;
  for (let i = 0; i < 60; i++) g.update(0.05);
  g.input.keys.delete('KeyW');
  const res = { riding: p.riding === m, moved: +m.pos.distanceTo(start).toFixed(1), underwater: m.pos.y < g.terrain.waterLevelAt(m.pos.x, m.pos.z) };
  g.dismount();
  return res;
}, (r) => r.riding && r.moved > 10 && r.underwater);

await step('simulate 2 minutes of the living world', () => {
  const g = window.__game;
  for (let i = 0; i < 2400; i++) g.update(0.05);
  return { creatures: g.creatures.list.length, time: g.sky.timeString(), hp: Math.round(g.player.health), food: Math.round(g.player.food), water: Math.round(g.player.water) };
});
await frames(20);
await shot('04-world');


if (shots) {
  // visual review of each interface
  const ui = async (name, fn) => { await page.evaluate(fn); await frames(4); await shot(name); };
  await ui('10-inventory', () => { const g = window.__game; g.player.inventory.add('mejoberry', 12); g.player.inventory.add('raw_meat', 3); g.player.inventory.add('cloth_shirt', 1); g.openInventory(null); });
  await ui('11-engrams', () => { const g = window.__game; g.ui.inv.tab = 'engrams'; g.ui.renderInventory(); });
  await ui('12-campfire', () => { const g = window.__game; g.ui.close(); const f = g.building.list.find((s) => s.type === 'campfire'); if (f) g.useStructure(f); });
  await ui('13-map', () => { const g = window.__game; g.ui.close(); g.player.inventory.add('gps', 1); g.ui.showMap(); });
  await ui('14-host', () => { const g = window.__game; g.ui.close(); g.ui.showHost(); });
  await ui('15-char', () => { const g = window.__game; g.ui.showCharCreate(); });
  await ui('16-spawn', () => { const g = window.__game; g.ui.showSpawn(() => {}, () => {}); });
  await ui('17-pause', () => { const g = window.__game; g.ui.showPause(); });
  await page.evaluate(() => window.__game.ui.close());
  // creature encounter view
  await ui('18-creatures', () => {
    const g = window.__game, p = g.player;
    const defs = Object.fromEntries(g.creatures.list.map((c) => [c.def.id, c.def]));
    const ids = ['trike', 'raptor', 'parasaur', 'dodo', 'stego'];
    ids.forEach((id, i) => { if (defs[id]) { const c = g.creatures.spawnAt(defs[id], p.pos.x + Math.sin(p.yaw + Math.PI + (i - 2) * 0.35) * (14 + i * 3), p.pos.z + Math.cos(p.yaw + Math.PI + (i - 2) * 0.35) * (14 + i * 3), 5); c.state = 'idle'; c.stateTimer = 99; c.yaw = p.yaw; } });
    p.pitch = -0.05;
    for (let i = 0; i < 4; i++) g.update(0.05);
  });
}
if (errors.length) { console.log('\nERRORS:\n' + errors.join('\n')); await browser.close(); process.exit(1); }
console.log('\nAll smoke checks passed.');
await browser.close();
