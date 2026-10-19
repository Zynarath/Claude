'use strict';
const minecraft = require('./minecraft');
const ark = require('./ark');

const games = { minecraft, ark };

function gameFor(server) {
  const g = games[server.game];
  if (!g) throw new Error(`Unknown game type ${server.game}`);
  return g;
}

// Templates offered on the "Create server" page.
const templates = [
  { id: 'ark-asa', game: 'ark', edition: 'asa', title: 'ARK: Survival Ascended', subtitle: 'Modded via CurseForge mod IDs', platforms: ['win32'], image: 'ark' },
  { id: 'mc-curseforge', game: 'minecraft', source: 'curseforge', title: 'Minecraft — CurseForge Modpack', subtitle: 'Install any modpack and update it from the panel', platforms: ['win32', 'linux', 'darwin'], image: 'mc-cf' },
  { id: 'mc-custom', game: 'minecraft', source: 'custom', title: 'Minecraft — Vanilla / Forge / NeoForge / Fabric', subtitle: 'Pick a version and loader, add mods yourself', platforms: ['win32', 'linux', 'darwin'], image: 'mc' },
  { id: 'ark-ase', game: 'ark', edition: 'ase', title: 'ARK: Survival Evolved (legacy)', subtitle: 'Steam Workshop mods', platforms: ['win32', 'linux'], image: 'ark-ase' },
];

module.exports = { games, gameFor, templates };
