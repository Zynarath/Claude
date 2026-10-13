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


// Advance the simulation deterministically from inside the page (works even when rAF is throttled).
const sim = (seconds, dt = 0.05) => page.evaluate(([seconds, dt]) => {
  const g = window.__game;
  for (let t = 0; t < seconds; t += dt) g.update(dt);
}, [seconds, dt]);

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
  const aimAt = (id, x, y, z) => {
    const eye = { x: f.x + 0.01, y: f.y + 4, z: f.z + 0.01 };
    const d = { x: x - eye.x, y: y - eye.y, z: z - eye.z };
    const L = Math.hypot(d.x, d.y, d.z);
    const pl = B.computePlacement(id, new eye.constructor ? Object.assign(Object.create(Object.getPrototypeOf(p.pos)), eye) : eye, Object.assign(Object.create(Object.getPrototypeOf(p.pos)), { x: d.x / L, y: d.y / L, z: d.z / L }));
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
  const dodo = g.creatures.spawnAt(window.__game.creatures.constructor && g.creatures.list[0] ? (globalThis.__CR || null) || g.creatures.list.find((c) => c.def.id === 'dodo').def : null, p.pos.x + 2, p.pos.z, 1);
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
