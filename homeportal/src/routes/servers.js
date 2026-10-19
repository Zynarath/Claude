'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const auth = require('../auth');
const manager = require('../manager/manager');
const backups = require('../manager/backups');
const scheduler = require('../manager/scheduler');
const { games, templates } = require('../games');
const cf = require('../services/curseforge');
const { HttpError, randomId } = require('../util/misc');
const { parseCpuList, PRIORITIES, CORES } = require('../util/procstats');

const router = express.Router();
router.use(auth.requireAuth);

function load(req, perm = 'view') {
  const inst = manager.get(req.params.id);
  if (!auth.can(req.user, inst.server, 'view')) throw new HttpError(404, 'Server not found');
  if (perm !== 'view' && !auth.can(req.user, inst.server, perm)) throw new HttpError(403, `You don't have the "${auth.PERM_LABELS[perm] || perm}" permission on this server`);
  return inst;
}

function publicHost() {
  return db.data.settings.publicAddress || '';
}

function view(inst, user, full = false) {
  const s = inst.server;
  const game = games[s.game];
  const perms = auth.permsFor(user, s);
  const out = {
    id: s.id,
    name: s.name,
    game: s.game,
    template: s.template,
    installed: !!s.installed,
    createdAt: s.createdAt,
    autoStart: !!s.autoStart,
    autoRestart: !!s.autoRestart,
    lastInstallError: s.lastInstallError || null,
    perms,
    runtime: inst.toJSON(),
    ports: game.ports(s),
    connect: publicHost() ? game.connectAddress(s, publicHost()) : null,
  };
  if (s.mc) {
    out.mc = {
      source: s.mc.source,
      mcVersion: s.mc.mcVersion,
      loader: s.mc.loader,
      loaderVersion: s.mc.loaderVersion,
      memoryMb: s.mc.memoryMb,
      port: s.mc.port,
      javaMajor: s.mc.javaMajor,
      curseforge: s.mc.curseforge,
    };
  }
  if (s.ark) {
    out.ark = { edition: s.ark.edition, editionLabel: games.ark.EDITIONS[s.ark.edition].label, map: s.ark.map, maxPlayers: s.ark.maxPlayers, port: s.ark.port, mods: s.ark.mods, clusterId: s.ark.clusterId, hasPassword: !!s.ark.settings.ServerPassword };
    if (perms.includes('settings') || perms.includes('admin')) out.ark.joinPassword = s.ark.settings.ServerPassword || '';
  }
  if (full) {
    Object.assign(out, {
      dir: user.role === 'admin' ? s.dir : undefined,
      tuning: s.tuning || { affinity: '', priority: 'normal' },
      backupKeep: s.backupKeep,
      backupBeforeUpdate: s.backupBeforeUpdate !== false,
      statsHistory: inst.statsHistory,
      cores: CORES,
    });
    if (user.role === 'admin') {
      out.access = Object.entries(s.access || {}).map(([userId, p]) => ({ userId, perms: p }));
    }
  }
  return out;
}

router.get('/templates', (_req, res) => {
  res.json({ templates: templates.map((t) => ({ ...t, supported: t.platforms.includes(process.platform) })), curseforgeKey: cf.hasKey(), platform: process.platform });
});

router.get('/servers', (req, res) => {
  const list = [...manager.instances.values()].filter((i) => auth.can(req.user, i.server, 'view')).map((i) => view(i, req.user));
  res.json({ servers: list });
});

router.get('/servers/suggest-ports', auth.requireAdmin, async (req, res) => {
  res.json(await manager.suggestPorts(req.query.game === 'ark' ? 'ark' : 'minecraft'));
});

router.post('/servers', auth.requireAdmin, async (req, res) => {
  const inst = await manager.create(req.body || {}, req.user);
  res.json({ server: view(inst, req.user) });
});

router.get('/servers/:id', (req, res) => {
  res.json({ server: view(load(req), req.user, true) });
});

router.patch('/servers/:id', (req, res) => {
  const inst = load(req, 'settings');
  const s = inst.server;
  const b = req.body || {};
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name || name.length > 48) throw new HttpError(400, 'Name must be 1–48 characters');
    if (s.name !== name) {
      s.name = name;
      manager.emit('renamed', s.id);
    }
  }
  if (b.autoStart !== undefined) s.autoStart = !!b.autoStart;
  if (b.autoRestart !== undefined) s.autoRestart = !!b.autoRestart;
  if (b.backupKeep !== undefined) s.backupKeep = Math.max(1, Math.min(200, Number(b.backupKeep) || 10));
  if (b.backupBeforeUpdate !== undefined) s.backupBeforeUpdate = !!b.backupBeforeUpdate;
  if (b.tuning) {
    const affinity = String(b.tuning.affinity || '').trim();
    if (affinity && !parseCpuList(affinity).length) throw new HttpError(400, `CPU list "${affinity}" doesn't match any of this PC's ${CORES} logical CPUs`);
    const priority = PRIORITIES[b.tuning.priority] ? b.tuning.priority : 'normal';
    s.tuning = { affinity, priority };
  }
  db.save();
  res.json({ server: view(inst, req.user, true) });
});

router.delete('/servers/:id', auth.requireAdmin, async (req, res) => {
  load(req);
  await manager.remove(req.params.id, { deleteFiles: req.query.keepFiles !== '1' });
  res.json({ ok: true });
});

// ---- power & console ----
router.post('/servers/:id/power', async (req, res) => {
  const inst = load(req, 'control');
  const action = req.body && req.body.action;
  if (action === 'start') await inst.start();
  else if (action === 'stop') inst.stop().catch(() => {});
  else if (action === 'restart') inst.restart().catch((e) => inst.appendConsole(`[panel] Restart failed: ${e.message}`));
  else if (action === 'kill') inst.kill();
  else throw new HttpError(400, 'Unknown action');
  res.json({ ok: true, status: inst.status });
});

router.get('/servers/:id/console', (req, res) => {
  const inst = load(req, 'console');
  res.json({ lines: inst.console.slice(-1000) });
});

router.post('/servers/:id/command', async (req, res) => {
  const inst = load(req, 'console');
  const command = String((req.body && req.body.command) || '').trim();
  if (!command) throw new HttpError(400, 'Empty command');
  if (command.length > 2000) throw new HttpError(400, 'Command is too long');
  const out = await inst.sendCommand(command);
  res.json({ ok: true, output: typeof out === 'string' ? out : null });
});

// ---- game settings ----
router.get('/servers/:id/settings', (req, res) => {
  const inst = load(req, 'settings');
  res.json({ schema: inst.game.settingsSchema(inst.server), values: inst.game.readSettings(inst.server) });
});

router.put('/servers/:id/settings', (req, res) => {
  const inst = load(req, 'settings');
  const before = JSON.stringify(inst.server.mc || inst.server.ark);
  const result = inst.game.writeSettings(inst.server, (req.body && req.body.values) || {});
  try {
    manager.checkPortConflicts(inst.server);
  } catch (err) {
    const restored = JSON.parse(before);
    if (inst.server.mc) inst.server.mc = restored;
    else inst.server.ark = restored;
    throw err;
  }
  db.save();
  res.json({ ok: true, restartRequired: !!(result.restartRequired && inst.child), values: inst.game.readSettings(inst.server) });
});

// ---- install / update ----
router.post('/servers/:id/reinstall', auth.requireAdmin, async (req, res) => {
  const inst = load(req);
  manager.install(inst.server.id, { validate: true }).catch(() => {});
  res.json({ ok: true });
});

router.post('/servers/:id/update', async (req, res) => {
  const inst = load(req, 'mods');
  const r = await manager.update(inst.server.id, req.body || {});
  res.json({ ok: true, upToDate: !!r.upToDate });
});

router.get('/servers/:id/modpack/versions', async (req, res) => {
  const inst = load(req, 'mods');
  const mc = inst.server.mc;
  if (!mc || mc.source !== 'curseforge') throw new HttpError(400, 'Not a CurseForge modpack server');
  const files = await cf.getFiles(mc.curseforge.modId, { pageSize: 50 });
  res.json({ current: mc.curseforge.fileId, files: files.filter((f) => !f.isServerPack).map(cf.slimFile) });
});

// ---- Minecraft mods folder ----
function modFile(inst, name) {
  if (!/^[^/\\]+\.jar(\.disabled)?$/i.test(name)) throw new HttpError(400, 'Invalid mod file');
  const p = path.join(inst.server.dir, 'mods', name);
  if (!fs.existsSync(p)) throw new HttpError(404, 'Mod not found');
  return p;
}

router.get('/servers/:id/mods', (req, res) => {
  const inst = load(req, 'mods');
  if (inst.server.game === 'minecraft') return res.json({ mods: inst.game.listMods(inst.server) });
  res.json({ mods: inst.server.ark.mods.map((id) => ({ id })) });
});

router.post('/servers/:id/mods', async (req, res) => {
  const inst = load(req, 'mods');
  if (inst.server.game !== 'minecraft') throw new HttpError(400, 'Use the ARK mod list instead');
  const r = await inst.game.addCurseForgeMod(inst.server, Number(req.body.modId), req.body.fileId ? Number(req.body.fileId) : null);
  inst.appendConsole(`[mods] ${req.user.username} added ${r.file}`);
  res.json({ ok: true, ...r });
});

router.patch('/servers/:id/mods/:file', (req, res) => {
  const inst = load(req, 'mods');
  const p = modFile(inst, req.params.file);
  const enabled = !!req.body.enabled;
  const target = enabled ? p.replace(/\.disabled$/i, '') : p.endsWith('.disabled') ? p : p + '.disabled';
  if (target !== p) fs.renameSync(p, target);
  res.json({ ok: true });
});

router.delete('/servers/:id/mods/:file', (req, res) => {
  const inst = load(req, 'mods');
  fs.rmSync(modFile(inst, req.params.file), { force: true });
  inst.appendConsole(`[mods] ${req.user.username} removed ${req.params.file}`);
  res.json({ ok: true });
});

// ---- ARK mod list ----
router.get('/servers/:id/ark-mods', async (req, res) => {
  const inst = load(req, 'mods');
  const ids = inst.server.ark.mods;
  let details = [];
  if (cf.hasKey() && ids.length && inst.server.ark.edition === 'asa') {
    try {
      details = (await cf.getMods(ids)).map(cf.slimMod);
    } catch {}
  }
  res.json({ mods: ids.map((id) => details.find((d) => String(d.id) === id) || { id: Number(id), name: null }) });
});

router.put('/servers/:id/ark-mods', (req, res) => {
  const inst = load(req, 'mods');
  const list = (Array.isArray(req.body.mods) ? req.body.mods : []).map((x) => String(x).trim()).filter((x) => /^\d+$/.test(x));
  inst.server.ark.mods = [...new Set(list)];
  db.save();
  inst.appendConsole(`[mods] ${req.user.username} set the mod list: ${inst.server.ark.mods.join(', ') || '(none)'}`);
  res.json({ ok: true, mods: inst.server.ark.mods, restartRequired: !!inst.child });
});

// ---- backups ----
router.get('/servers/:id/backups', (req, res) => {
  const inst = load(req, 'backups');
  res.json({ backups: backups.list(inst.server), keep: inst.server.backupKeep || 10 });
});

router.post('/servers/:id/backups', async (req, res) => {
  const inst = load(req, 'backups');
  manager.backup(inst.server.id, { reason: (req.body && req.body.note) || 'manual' }).catch(() => {});
  res.json({ ok: true });
});

router.post('/servers/:id/backups/:name/restore', async (req, res) => {
  const inst = load(req, 'backups');
  backups.resolveBackup(inst.server, req.params.name);
  if (inst.child) throw new HttpError(409, 'Stop the server before restoring a backup');
  manager.restore(inst.server.id, req.params.name).catch(() => {});
  res.json({ ok: true });
});

router.get('/servers/:id/backups/:name/download', (req, res) => {
  const inst = load(req, 'backups');
  res.download(backups.resolveBackup(inst.server, req.params.name));
});

router.delete('/servers/:id/backups/:name', (req, res) => {
  const inst = load(req, 'backups');
  backups.remove(inst.server, req.params.name);
  res.json({ ok: true });
});

// ---- schedules ----
const ACTIONS = ['restart', 'start', 'stop', 'backup', 'command', 'update'];
function cleanSchedule(b, existing = {}) {
  const s = { ...existing };
  s.name = String(b.name ?? s.name ?? '').slice(0, 60);
  s.enabled = b.enabled !== undefined ? !!b.enabled : s.enabled ?? true;
  s.action = ACTIONS.includes(b.action) ? b.action : s.action;
  if (!s.action) throw new HttpError(400, 'Pick an action');
  s.type = b.type === 'interval' ? 'interval' : 'daily';
  if (s.type === 'interval') s.everyMinutes = Math.max(5, Number(b.everyMinutes) || 60);
  else {
    if (!/^\d{1,2}:\d{2}$/.test(b.time || '')) throw new HttpError(400, 'Time must look like 04:30');
    s.time = b.time;
    s.days = Array.isArray(b.days) ? b.days.map(Number).filter((d) => d >= 0 && d <= 6) : [];
  }
  s.payload = s.action === 'command' ? String(b.payload || '').slice(0, 500) : '';
  s.warnMinutes = Math.max(0, Math.min(60, Number(b.warnMinutes) || 0));
  return s;
}
const withNext = (s) => ({ ...s, nextRun: s.enabled ? scheduler.nextRun(s) : null });

router.get('/servers/:id/schedules', (req, res) => {
  const inst = load(req, 'schedules');
  res.json({ schedules: (inst.server.schedules || []).map(withNext) });
});

router.post('/servers/:id/schedules', (req, res) => {
  const inst = load(req, 'schedules');
  const s = cleanSchedule(req.body || {}, { id: randomId(4), createdAt: Date.now() });
  inst.server.schedules = [...(inst.server.schedules || []), s];
  db.save();
  res.json({ schedule: withNext(s) });
});

router.put('/servers/:id/schedules/:sid', (req, res) => {
  const inst = load(req, 'schedules');
  const idx = (inst.server.schedules || []).findIndex((x) => x.id === req.params.sid);
  if (idx === -1) throw new HttpError(404, 'Schedule not found');
  inst.server.schedules[idx] = cleanSchedule(req.body || {}, inst.server.schedules[idx]);
  db.save();
  res.json({ schedule: withNext(inst.server.schedules[idx]) });
});

router.delete('/servers/:id/schedules/:sid', (req, res) => {
  const inst = load(req, 'schedules');
  inst.server.schedules = (inst.server.schedules || []).filter((x) => x.id !== req.params.sid);
  db.save();
  res.json({ ok: true });
});

// ---- Minecraft whitelist ----
function mcOnly(inst) {
  if (inst.server.game !== 'minecraft') throw new HttpError(400, 'Only Minecraft servers have a whitelist');
  return inst;
}

router.get('/servers/:id/whitelist', (req, res) => {
  const inst = mcOnly(load(req, 'settings'));
  res.json({ ...inst.game.whitelist(inst.server), running: inst.status === 'running', online: inst.players ? inst.players.players : [] });
});

router.post('/servers/:id/whitelist', (req, res) => {
  const inst = mcOnly(load(req, 'settings'));
  const raw = inst.game.splitNames(req.body && req.body.names);
  const bad = raw.filter((n) => !inst.game.NAME_RE.test(n));
  if (bad.length) throw new HttpError(400, `Not valid Minecraft usernames: ${bad.join(', ')} (3–16 letters, numbers or underscores, separate names with commas)`);
  const names = inst.game.cleanNames(raw);
  if (!names.length) throw new HttpError(400, 'Enter at least one Minecraft username');
  let applied = true;
  for (const n of names) applied = inst.game.whitelistAdd(inst.server, inst, n).applied && applied;
  db.save();
  inst.appendConsole(`[players] ${req.user.username} whitelisted ${names.join(', ')}${applied ? '' : ' (applied on next start)'}`);
  res.json({ ok: true, applied });
});

router.delete('/servers/:id/whitelist/:name', (req, res) => {
  const inst = mcOnly(load(req, 'settings'));
  if (!inst.game.NAME_RE.test(req.params.name)) throw new HttpError(400, 'Invalid name');
  inst.game.whitelistRemove(inst.server, inst, req.params.name);
  db.save();
  inst.appendConsole(`[players] ${req.user.username} removed ${req.params.name} from the whitelist`);
  res.json({ ok: true });
});

router.put('/servers/:id/whitelist/enabled', (req, res) => {
  const inst = mcOnly(load(req, 'settings'));
  inst.game.setWhitelistEnabled(inst.server, inst, !!(req.body && req.body.enabled));
  res.json({ ok: true });
});

// ---- per-server user access (admin) ----
router.put('/servers/:id/access', auth.requireAdmin, (req, res) => {
  const inst = load(req);
  const { userId, perms } = req.body || {};
  const user = db.data.users.find((u) => u.id === userId);
  if (!user) throw new HttpError(404, 'User not found');
  inst.server.access = inst.server.access || {};
  const clean = (Array.isArray(perms) ? perms : []).filter((p) => auth.PERMS.includes(p));
  if (req.body.remove) delete inst.server.access[userId];
  else inst.server.access[userId] = clean;
  db.save();
  res.json({ ok: true });
});

module.exports = router;
