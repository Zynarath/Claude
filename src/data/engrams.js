// Engrams: blueprints learned with Engram Points (EP) earned by levelling up.
// Max survivor level is 64, the cap documented for the June 2015 Early Access builds.
import { ITEMS } from './items.js';

export const MAX_LEVEL = 64;

// [itemId, requiredLevel, engramPoints]
const LIST = [
  ['stone_pick', 1, 0],
  ['stone_hatchet', 2, 3], ['torch', 2, 3], ['campfire', 2, 3], ['spear', 2, 3], ['cloth_pants', 2, 3], ['cloth_shirt', 2, 3],
  ['cloth_hat', 3, 3], ['cloth_gloves', 3, 3], ['cloth_boots', 3, 3], ['waterskin', 3, 3], ['thatch_foundation', 3, 3], ['thatch_wall', 3, 3],
  ['thatch_doorframe', 4, 3], ['thatch_door', 4, 3], ['thatch_roof', 4, 3], ['storage_box', 4, 6],
  ['wooden_club', 5, 6], ['slingshot', 5, 6], ['sleeping_bag', 5, 6],
  ['mortar_and_pestle', 6, 6], ['narcotic', 6, 6], ['stimulant', 6, 6], ['spyglass', 6, 3], ['compass', 6, 3],
  ['sparkpowder', 7, 6], ['standing_torch', 7, 6],
  ['hide_hat', 8, 6], ['hide_shirt', 8, 6], ['hide_pants', 8, 6],
  ['hide_gloves', 9, 6], ['hide_boots', 9, 6], ['preserving_bin', 9, 9],
  ['parasaur_saddle', 10, 9], ['phiomia_saddle', 10, 9], ['wood_foundation', 10, 6],
  ['wood_wall', 11, 6], ['wood_doorframe', 11, 6], ['wood_door', 11, 6],
  ['wood_ceiling', 12, 6], ['wood_ramp', 12, 6],
  ['bow', 13, 12],
  ['stone_arrow', 14, 6], ['simple_bed', 14, 9], ['large_storage_box', 14, 9],
  ['tranq_arrow', 16, 12],
  ['raptor_saddle', 18, 12],
  ['refining_forge', 20, 12], ['metal_pick', 20, 12], ['metal_hatchet', 20, 12], ['smithy', 20, 18],
  ['trike_saddle', 22, 15], ['gunpowder', 22, 9],
  ['stone_foundation', 24, 9], ['stone_wall', 24, 9], ['stone_doorframe', 24, 9], ['reinforced_door', 24, 9],
  ['simple_pistol', 25, 18], ['simple_bullet', 25, 9], ['metal_sword', 25, 15], ['stone_ceiling', 25, 9], ['gps', 25, 12],
  ['carbonemys_saddle', 26, 15],
  ['sarco_saddle', 28, 15], ['saber_saddle', 28, 15],
  ['cementing_paste', 30, 9], ['chitin_helmet', 30, 12], ['chitin_chest', 30, 12], ['chitin_legs', 30, 12], ['chitin_gauntlets', 30, 12], ['chitin_boots', 30, 12],
  ['stego_saddle', 32, 18], ['ptera_saddle', 32, 18],
  ['ankylo_saddle', 36, 18],
  ['argentavis_saddle', 40, 20], ['polymer', 40, 15],
  ['carno_saddle', 42, 20],
  ['flak_helmet', 45, 20], ['flak_chest', 45, 20], ['flak_legs', 45, 20], ['flak_gauntlets', 45, 20], ['flak_boots', 45, 20],
  ['longneck_rifle', 45, 24], ['simple_rifle_ammo', 45, 9], ['tranq_dart', 45, 12],
  ['mammoth_saddle', 47, 21],
  ['megalodon_saddle', 50, 21], ['metal_foundation', 50, 18], ['metal_wall', 50, 18],
  ['rex_saddle', 54, 30], ['bronto_saddle', 54, 30],
  ['cooked_meat', 1, 0], ['cooked_prime_meat', 1, 0], ['metal_ingot', 1, 0],
];

export const ENGRAMS = LIST.map(([id, level, points]) => ({ id, level, points, item: ITEMS[id] }))
  .filter((e) => {
    if (!e.item) throw new Error(`Engram references unknown item ${e.id}`);
    return true;
  });

export const ENGRAM_BY_ID = Object.fromEntries(ENGRAMS.map((e) => [e.id, e]));

// Station-only recipes (cooking/smelting) are always known and never shown as engrams.
export const HIDDEN_ENGRAMS = new Set(['cooked_meat', 'cooked_prime_meat', 'metal_ingot']);
export const DEFAULT_KNOWN = ['stone_pick', 'cooked_meat', 'cooked_prime_meat', 'metal_ingot'];

// Engram points awarded on reaching a level.
export function engramPointsForLevel(level) {
  if (level <= 1) return 0;
  if (level < 10) return 6;
  if (level < 20) return 8;
  if (level < 30) return 12;
  if (level < 40) return 16;
  if (level < 50) return 20;
  if (level <= 60) return 24;
  return 30; // levels 61-64 (v174.0 added 120 EP across these four levels)
}

// Total experience needed to reach a level.
export function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.round(5 * Math.pow(level - 1, 2.25));
}

export function levelForXp(xp) {
  let lvl = 1;
  while (lvl < MAX_LEVEL && xp >= xpForLevel(lvl + 1)) lvl++;
  return lvl;
}
