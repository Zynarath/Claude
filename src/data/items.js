// Item database. Recipes, weights and stats follow ARK's 2015 Early Access values
// where they are documented; the remainder are close approximations.

export const ITEMS = {};

function def(id, o) {
  ITEMS[id] = {
    id,
    weight: 0.1,
    stack: 1,
    cat: 'misc',
    desc: '',
    ...o,
  };
}

// ----- Resources -----
const res = (id, name, weight, stack, icon, desc, extra = {}) =>
  def(id, { name, weight, stack, cat: 'resource', icon, desc, ...extra });

res('wood', 'Wood', 0.5, 100, { shape: 'log', c: '#8a5a2b', c2: '#c48a4a' }, 'A sturdy material gathered from trees. Hatchets yield more wood than picks.', { fuel: 30 });
res('thatch', 'Thatch', 0.02, 200, { shape: 'thatch', c: '#b59a4a', c2: '#e2c97a' }, 'Sticks torn from trees. Picks yield more thatch than hatchets.', { fuel: 7 });
res('stone', 'Stone', 0.5, 100, { shape: 'stone', c: '#8b8b86', c2: '#b9b9b2' }, 'A hefty block of rock. Pick up small stones or break rocks with a hatchet.');
res('flint', 'Flint', 0.05, 100, { shape: 'flint', c: '#5d6670', c2: '#9aa6b2' }, 'Sharp flint, best gathered from rocks with a pick.');
res('fiber', 'Fiber', 0.01, 300, { shape: 'fiber', c: '#5f8f2a', c2: '#a6d15a' }, 'Plant fibers gathered by hand from bushes.');
res('hide', 'Hide', 0.01, 200, { shape: 'hide', c: '#9a6a44', c2: '#c99a6c' }, 'Thick skin carved from a dead creature.');
res('metal', 'Metal', 1.0, 200, { shape: 'ore', c: '#6d6a66', c2: '#d8c27a' }, 'Unrefined metal ore. Refine it in a Refining Forge.');
res('metal_ingot', 'Metal Ingot', 1.0, 200, { shape: 'ingot', c: '#9aa3ad', c2: '#e6ecf2' }, 'Refined metal, used in advanced tools and structures.');
res('obsidian', 'Obsidian', 1.0, 100, { shape: 'crystal', c: '#1c1a22', c2: '#6a5a8a' }, 'Volcanic glass found near the volcano.');
res('crystal', 'Crystal', 1.0, 100, { shape: 'crystal', c: '#9fd8ff', c2: '#ffffff' }, 'Crystal found on high mountain slopes.');
res('oil', 'Oil', 1.0, 100, { shape: 'drop', c: '#141414', c2: '#5a5a5a' }, 'Thick black oil. Found in dark rocks along the north coast and in Trilobites.', { fuel: 60 });
res('silica_pearls', 'Silica Pearls', 0.02, 100, { shape: 'pearl', c: '#e8e4dc', c2: '#ffffff' }, 'Pearls found on the sea floor and inside Trilobites.');
res('chitin', 'Chitin', 0.1, 100, { shape: 'shell', c: '#3b4a3a', c2: '#8aa07a' }, 'A tough shell harvested from arthropods.');
res('keratin', 'Keratin', 0.1, 100, { shape: 'shell', c: '#b9a27a', c2: '#e6d3a6' }, 'Horn and plate material from armoured herbivores.');
res('charcoal', 'Charcoal', 0.1, 100, { shape: 'stone', c: '#1e1e1e', c2: '#4a4a4a' }, 'Created by burning wood. Used for gunpowder.');
res('sparkpowder', 'Sparkpowder', 0.1, 100, { shape: 'powder', c: '#d9b23a', c2: '#fff2a0' }, 'Highly flammable powder made from flint and stone.',
  { recipe: { flint: 2, stone: 1 }, craftTime: 1, station: 'mortar' });
res('gunpowder', 'Gunpowder', 0.1, 100, { shape: 'powder', c: '#2b2b2b', c2: '#6e6e6e' }, 'Explosive powder for firearm ammunition.',
  { recipe: { sparkpowder: 1, charcoal: 1 }, craftTime: 1, station: 'mortar' });
res('cementing_paste', 'Cementing Paste', 0.01, 100, { shape: 'paste', c: '#9a9a8a', c2: '#d6d6c6' }, 'Binding agent for advanced construction.',
  { recipe: { chitin: 4, stone: 8 }, craftTime: 1, station: 'mortar', altRecipe: { keratin: 4, stone: 8 } });
res('polymer', 'Polymer', 0.25, 100, { shape: 'ingot', c: '#3a3a5a', c2: '#9a9ad8' }, 'A strong yet light composite.',
  { recipe: { obsidian: 2, cementing_paste: 2 }, craftTime: 2, station: 'smithy' });

// ----- Food & consumables -----
const food = (id, name, icon, o) => def(id, { name, cat: 'consumable', icon, stack: 100, weight: 0.1, ...o });

food('amarberry', 'Amarberry', { shape: 'berry', c: '#d2382e', c2: '#ff8a7a' }, { food: 1.5, water: 0.5, spoil: 600, spoilsTo: null, berry: true, desc: 'A tart red berry.' });
food('azulberry', 'Azulberry', { shape: 'berry', c: '#2e5ad2', c2: '#7aa0ff' }, { food: 1.5, water: 0.5, spoil: 600, berry: true, desc: 'A sweet blue berry.' });
food('tintoberry', 'Tintoberry', { shape: 'berry', c: '#c8b02a', c2: '#fff07a' }, { food: 1.5, water: 0.5, spoil: 600, berry: true, desc: 'A bitter yellow berry.' });
food('mejoberry', 'Mejoberry', { shape: 'berry', c: '#7a2ed2', c2: '#c27aff' }, { food: 1.5, water: 0.5, spoil: 600, berry: true, desc: 'A purple berry favoured by many herbivores.' });
food('narcoberry', 'Narcoberry', { shape: 'berry', c: '#2a2a2a', c2: '#7a7a7a' }, { food: 0.5, torpor: 7.5, spoil: 600, berry: true, desc: 'Black berries with a strong narcotic effect. Feed to unconscious creatures to keep them asleep.' });
food('stimberry', 'Stimberry', { shape: 'berry', c: '#e8e8e8', c2: '#ffffff' }, { food: 0.5, water: -3, torpor: -7.5, stamina: 7.5, spoil: 600, berry: true, desc: 'A white berry that wakes you up. Dehydrating.' });
food('raw_meat', 'Raw Meat', { shape: 'meat', c: '#b8323a', c2: '#ff8a8a' }, { food: 10, health: 0, stack: 40, spoil: 600, spoilsTo: 'spoiled_meat', meat: true, desc: 'Uncooked meat. Cook it on a campfire.' });
food('raw_prime_meat', 'Raw Prime Meat', { shape: 'meat', c: '#c8204a', c2: '#ff6aa0' }, { food: 25, health: 0, stack: 40, spoil: 400, spoilsTo: 'spoiled_meat', meat: true, desc: 'Exceptional cut of meat from large creatures.' });
food('cooked_meat', 'Cooked Meat', { shape: 'meat', c: '#7a4a24', c2: '#c48a4a' }, { food: 20, health: 15, stack: 40, spoil: 1200, spoilsTo: 'spoiled_meat', desc: 'Cooked meat. Restores food and some health.', recipe: { raw_meat: 1 }, craftTime: 20, station: 'campfire' });
food('cooked_prime_meat', 'Cooked Prime Meat', { shape: 'meat', c: '#8a3a2a', c2: '#e08a6a' }, { food: 50, health: 35, stack: 40, spoil: 1200, spoilsTo: 'spoiled_meat', desc: 'A delicious, healthy meal.', recipe: { raw_prime_meat: 1 }, craftTime: 20, station: 'campfire' });
food('spoiled_meat', 'Spoiled Meat', { shape: 'meat', c: '#4a5a2a', c2: '#8a9a5a' }, { food: 5, health: -10, stack: 100, spoil: 3600, spoilsTo: null, desc: 'Rotten meat. Edible in a pinch. Needed for Narcotics.' });
food('narcotic', 'Narcotic', { shape: 'vial', c: '#3a2a5a', c2: '#9a7ad8' }, { torpor: 40, health: -20, stack: 100, desc: 'A powerful sedative. Force-feed to unconscious creatures.', recipe: { narcoberry: 5, spoiled_meat: 1 }, craftTime: 1, station: 'mortar' });
food('stimulant', 'Stimulant', { shape: 'vial', c: '#d8c83a', c2: '#fffaa0' }, { torpor: -40, water: -10, stamina: 25, stack: 100, desc: 'Keeps you awake and energetic.', recipe: { stimberry: 5, sparkpowder: 2 }, craftTime: 1, station: 'mortar' });

// ----- Misc gear -----
def('specimen_implant', { name: 'Specimen Implant', cat: 'misc', weight: 0, stack: 1, noDrop: true, icon: { shape: 'implant', c: '#5a5a5a', c2: '#3ad8ff' }, desc: 'A strange device embedded in your arm. Its purpose is unknown.' });
def('waterskin', { name: 'Waterskin', cat: 'misc', weight: 0.5, icon: { shape: 'waterskin', c: '#8a6a44', c2: '#4ab0ff' }, desc: 'Holds water. Fill it in any water source or in the rain, then use it to drink.', capacity: 100, recipe: { hide: 4, fiber: 12 }, craftTime: 5 });
def('spyglass', { name: 'Spyglass', cat: 'tool', weight: 0.5, icon: { shape: 'spyglass', c: '#8a6a44', c2: '#d8c27a' }, equip: 'spyglass', desc: 'Right-click to zoom. Look at a creature to see its level.', recipe: { wood: 5, hide: 10, fiber: 10, crystal: 2 }, craftTime: 5 });
def('compass', { name: 'Compass', cat: 'tool', weight: 0.5, icon: { shape: 'compass', c: '#b0b0a0', c2: '#d83a3a' }, desc: 'Shows your heading while in your inventory.', recipe: { flint: 5, fiber: 10, hide: 5 }, craftTime: 5 });
def('gps', { name: 'GPS', cat: 'tool', weight: 0.5, icon: { shape: 'gps', c: '#3a3a3a', c2: '#3ad8ff' }, desc: 'Shows your coordinates and position on the map while in your inventory.', recipe: { metal_ingot: 10, crystal: 10, hide: 15, oil: 5 }, craftTime: 10, station: 'smithy' });

// ----- Tools & weapons -----
const tool = (id, name, icon, o) => def(id, { name, cat: 'weapon', icon, weight: 1, stack: 1, ...o });

tool('stone_pick', 'Stone Pick', { shape: 'pick', c: '#7a5a3a', c2: '#9a9a96' }, { equip: 'pick', damage: 15, durability: 40, toolTier: 1, recipe: { wood: 1, thatch: 1, stone: 1 }, craftTime: 3, desc: 'A crude pick. Good for flint, thatch and meat.' });
tool('stone_hatchet', 'Stone Hatchet', { shape: 'hatchet', c: '#7a5a3a', c2: '#9a9a96' }, { equip: 'hatchet', damage: 10, durability: 40, toolTier: 1, recipe: { wood: 1, thatch: 1, flint: 1 }, craftTime: 3, desc: 'A crude hatchet. Good for wood, stone and hide.' });
tool('spear', 'Spear', { shape: 'spear', c: '#8a6a3a', c2: '#5d6670' }, { equip: 'spear', damage: 14, durability: 10, recipe: { wood: 8, flint: 2, fiber: 12 }, craftTime: 5, throwable: true, desc: 'A sharpened stick. Right-click to throw.' });
tool('torch', 'Torch', { shape: 'torch', c: '#7a5a3a', c2: '#ffb03a' }, { equip: 'torch', damage: 6, durability: 200, burnRate: 1, recipe: { flint: 1, stone: 1, wood: 1 }, craftTime: 3, warmth: 6, desc: 'Lights the darkness and keeps you warm. Burns down while equipped.' });
tool('wooden_club', 'Wooden Club', { shape: 'club', c: '#8a5a2b', c2: '#c48a4a' }, { equip: 'club', damage: 5, torporDamage: 14, durability: 40, recipe: { wood: 10 }, craftTime: 3, desc: 'A heavy club that knocks creatures unconscious.' });
tool('slingshot', 'Slingshot', { shape: 'sling', c: '#8a5a2b', c2: '#c99a6c' }, { equip: 'slingshot', damage: 14, torporDamage: 18, durability: 50, ammo: 'stone', recipe: { hide: 1, fiber: 2, wood: 5 }, craftTime: 5, desc: 'Fires stones that daze creatures. Uses Stone as ammo.' });
tool('bow', 'Bow', { shape: 'bow', c: '#8a5a2b', c2: '#d8d0b0' }, { equip: 'bow', damage: 20, durability: 50, ammo: ['stone_arrow', 'tranq_arrow'], recipe: { wood: 15, fiber: 50 }, craftTime: 8, desc: 'Fires Stone or Tranquilizer Arrows. Hold to draw.' });
tool('metal_pick', 'Metal Pick', { shape: 'pick', c: '#5a3a2a', c2: '#c8d0d8' }, { equip: 'pick', damage: 20, durability: 200, toolTier: 2, recipe: { metal_ingot: 1, wood: 1, hide: 10 }, craftTime: 8, station: 'smithy', desc: 'A metal pick. Gathers far more than stone tools.' });
tool('metal_hatchet', 'Metal Hatchet', { shape: 'hatchet', c: '#5a3a2a', c2: '#c8d0d8' }, { equip: 'hatchet', damage: 20, durability: 200, toolTier: 2, recipe: { metal_ingot: 8, wood: 1, hide: 10 }, craftTime: 8, station: 'smithy', desc: 'A metal hatchet. Gathers far more than stone tools.' });
tool('metal_sword', 'Sword', { shape: 'sword', c: '#5a3a2a', c2: '#e0e6ec' }, { equip: 'sword', damage: 40, durability: 120, recipe: { metal_ingot: 15, hide: 10 }, craftTime: 10, station: 'smithy', desc: 'A metal sword. Strong melee weapon.' });
tool('simple_pistol', 'Simple Pistol', { shape: 'pistol', c: '#5a3a2a', c2: '#8a8a8a' }, { equip: 'pistol', damage: 55, durability: 70, ammo: 'simple_bullet', recipe: { metal_ingot: 60, wood: 5, hide: 15 }, craftTime: 10, station: 'smithy', desc: 'A single-shot flintlock pistol.' });
tool('longneck_rifle', 'Longneck Rifle', { shape: 'rifle', c: '#5a3a2a', c2: '#8a8a8a' }, { equip: 'rifle', damage: 180, durability: 80, ammo: ['simple_rifle_ammo', 'tranq_dart'], recipe: { metal_ingot: 95, wood: 20, hide: 25 }, craftTime: 15, station: 'smithy', desc: 'A long-range rifle. Fires Simple Rifle Ammunition or Tranquilizer Darts.' });

// ----- Ammo -----
const ammo = (id, name, icon, o) => def(id, { name, cat: 'ammo', icon, weight: 0.05, stack: 100, ...o });
ammo('stone_arrow', 'Stone Arrow', { shape: 'arrow', c: '#8a6a3a', c2: '#9aa6b2' }, { damage: 20, recipe: { thatch: 2, flint: 1, fiber: 2 }, craftTime: 1, desc: 'Arrows for the bow.' });
ammo('tranq_arrow', 'Tranquilizer Arrow', { shape: 'arrow', c: '#8a6a3a', c2: '#9a7ad8' }, { damage: 26, torporDamage: 90, recipe: { stone_arrow: 1, narcotic: 2 }, craftTime: 1, desc: 'Arrows laced with narcotics. Knocks creatures out over time.' });
ammo('simple_bullet', 'Simple Bullet', { shape: 'bullet', c: '#8a8a8a', c2: '#d8c27a' }, { damage: 55, yields: 2, recipe: { metal_ingot: 1, gunpowder: 6 }, craftTime: 1, station: 'smithy', desc: 'Ammunition for the Simple Pistol.' });
ammo('simple_rifle_ammo', 'Simple Rifle Ammunition', { shape: 'bullet', c: '#6a6a6a', c2: '#d8c27a' }, { damage: 180, recipe: { metal_ingot: 1, gunpowder: 9 }, craftTime: 1, station: 'smithy', desc: 'Ammunition for the Longneck Rifle.' });
ammo('tranq_dart', 'Tranquilizer Dart', { shape: 'bullet', c: '#6a6a6a', c2: '#9a7ad8' }, { damage: 26, torporDamage: 220, recipe: { narcotic: 3, metal_ingot: 1 }, craftTime: 1, station: 'smithy', desc: 'Powerful tranquilizer ammunition for the Longneck Rifle.' });

// ----- Armor -----
const armor = (id, name, slot, set, o) => {
  const shapes = { head: 'hat', chest: 'shirt', legs: 'pants', hands: 'gloves', feet: 'boots' };
  const colors = { cloth: ['#c8b98a', '#e8dcb0'], hide: ['#8a5a34', '#c48a5a'], chitin: ['#2f3a2e', '#7a907a'], flak: ['#5a6066', '#a0a8b0'] };
  def(id, { name, cat: 'armor', slot, set, icon: { shape: shapes[slot], c: colors[set][0], c2: colors[set][1] }, weight: 1, stack: 1, ...o });
};
armor('cloth_hat', 'Cloth Hat', 'head', 'cloth', { armor: 4, cold: 4, heat: 3, durability: 25, recipe: { fiber: 10 }, craftTime: 5 });
armor('cloth_shirt', 'Cloth Shirt', 'chest', 'cloth', { armor: 4, cold: 8, heat: 6, durability: 25, recipe: { fiber: 40 }, craftTime: 5 });
armor('cloth_pants', 'Cloth Pants', 'legs', 'cloth', { armor: 4, cold: 8, heat: 6, durability: 25, recipe: { fiber: 50 }, craftTime: 5 });
armor('cloth_gloves', 'Cloth Gloves', 'hands', 'cloth', { armor: 3, cold: 3, heat: 2, durability: 25, recipe: { fiber: 20 }, craftTime: 5 });
armor('cloth_boots', 'Cloth Boots', 'feet', 'cloth', { armor: 3, cold: 3, heat: 2, durability: 25, recipe: { fiber: 25, hide: 6 }, craftTime: 5 });
armor('hide_hat', 'Hide Hat', 'head', 'hide', { armor: 15, cold: 15, heat: 2, durability: 45, recipe: { hide: 15, fiber: 10 }, craftTime: 7 });
armor('hide_shirt', 'Hide Shirt', 'chest', 'hide', { armor: 20, cold: 20, heat: 3, durability: 45, recipe: { hide: 20, fiber: 12 }, craftTime: 7 });
armor('hide_pants', 'Hide Pants', 'legs', 'hide', { armor: 20, cold: 20, heat: 3, durability: 45, recipe: { hide: 25, fiber: 15 }, craftTime: 7 });
armor('hide_gloves', 'Hide Gloves', 'hands', 'hide', { armor: 12, cold: 10, heat: 1, durability: 45, recipe: { hide: 12, fiber: 8 }, craftTime: 7 });
armor('hide_boots', 'Hide Boots', 'feet', 'hide', { armor: 12, cold: 10, heat: 1, durability: 45, recipe: { hide: 12, fiber: 8 }, craftTime: 7 });
armor('chitin_helmet', 'Chitin Helmet', 'head', 'chitin', { armor: 50, cold: 2, heat: 2, durability: 100, recipe: { chitin: 15, fiber: 7, hide: 5 }, craftTime: 10 });
armor('chitin_chest', 'Chitin Chestpiece', 'chest', 'chitin', { armor: 50, cold: 2, heat: 2, durability: 100, recipe: { chitin: 25, fiber: 12, hide: 10 }, craftTime: 10 });
armor('chitin_legs', 'Chitin Leggings', 'legs', 'chitin', { armor: 50, cold: 2, heat: 2, durability: 100, recipe: { chitin: 20, fiber: 10, hide: 6 }, craftTime: 10 });
armor('chitin_gauntlets', 'Chitin Gauntlets', 'hands', 'chitin', { armor: 40, cold: 1, heat: 1, durability: 100, recipe: { chitin: 12, fiber: 5, hide: 3 }, craftTime: 10 });
armor('chitin_boots', 'Chitin Boots', 'feet', 'chitin', { armor: 40, cold: 1, heat: 1, durability: 100, recipe: { chitin: 12, fiber: 5, hide: 3 }, craftTime: 10 });
armor('flak_helmet', 'Flak Helmet', 'head', 'flak', { armor: 100, cold: 2, heat: 2, durability: 120, recipe: { metal_ingot: 10, hide: 5, fiber: 5 }, craftTime: 15, station: 'smithy' });
armor('flak_chest', 'Flak Chestpiece', 'chest', 'flak', { armor: 100, cold: 2, heat: 2, durability: 120, recipe: { metal_ingot: 40, hide: 10, fiber: 15 }, craftTime: 15, station: 'smithy' });
armor('flak_legs', 'Flak Leggings', 'legs', 'flak', { armor: 100, cold: 2, heat: 2, durability: 120, recipe: { metal_ingot: 20, hide: 8, fiber: 8 }, craftTime: 15, station: 'smithy' });
armor('flak_gauntlets', 'Flak Gauntlets', 'hands', 'flak', { armor: 80, cold: 1, heat: 1, durability: 120, recipe: { metal_ingot: 6, hide: 4, fiber: 4 }, craftTime: 15, station: 'smithy' });
armor('flak_boots', 'Flak Boots', 'feet', 'flak', { armor: 80, cold: 1, heat: 1, durability: 120, recipe: { metal_ingot: 6, hide: 4, fiber: 4 }, craftTime: 15, station: 'smithy' });

// ----- Structures (placeable) -----
const struct = (id, name, shape, colors, o) => def(id, { name, cat: 'structure', structure: id, icon: { shape, c: colors[0], c2: colors[1] }, weight: 2, stack: 100, ...o });
const TH = ['#a08848', '#d8c27a'], WD = ['#7a5432', '#b08050'], ST = ['#7a7a74', '#b0b0a8'], MT = ['#6a7078', '#b8c0c8'];
struct('thatch_foundation', 'Thatch Foundation', 'foundation', TH, { recipe: { wood: 6, thatch: 4, fiber: 4 }, craftTime: 3, desc: 'Required to build structures in an area. A floor for your hut.' });
struct('thatch_wall', 'Thatch Wall', 'wall', TH, { recipe: { wood: 2, thatch: 7, fiber: 4 }, craftTime: 3, desc: 'A simple wall. Snaps to foundations.' });
struct('thatch_doorframe', 'Thatch Doorframe', 'doorframe', TH, { recipe: { wood: 1, thatch: 6, fiber: 3 }, craftTime: 3, desc: 'A wall with a doorway. Place a Thatch Door inside it.' });
struct('thatch_door', 'Thatch Door', 'door', TH, { recipe: { wood: 2, thatch: 7, fiber: 4 }, craftTime: 3, desc: 'Snaps into a doorframe. Press E to open or close.' });
struct('thatch_roof', 'Thatch Roof', 'ceiling', TH, { recipe: { wood: 3, thatch: 6, fiber: 4 }, craftTime: 3, desc: 'A roof that snaps on top of walls.' });
struct('wood_foundation', 'Wooden Foundation', 'foundation', WD, { recipe: { wood: 8, thatch: 4, fiber: 3 }, craftTime: 4, desc: 'A sturdy wooden floor.' });
struct('wood_wall', 'Wooden Wall', 'wall', WD, { recipe: { wood: 4, thatch: 2, fiber: 1 }, craftTime: 4 });
struct('wood_doorframe', 'Wooden Doorframe', 'doorframe', WD, { recipe: { wood: 3, thatch: 2, fiber: 1 }, craftTime: 4 });
struct('wood_door', 'Wooden Door', 'door', WD, { recipe: { wood: 4, thatch: 7, fiber: 3 }, craftTime: 4 });
struct('wood_ceiling', 'Wooden Ceiling', 'ceiling', WD, { recipe: { wood: 4, thatch: 4, fiber: 2 }, craftTime: 4, desc: 'A wooden ceiling. Can be walked on.' });
struct('wood_ramp', 'Wooden Ramp', 'ramp', WD, { recipe: { wood: 6, thatch: 3, fiber: 2 }, craftTime: 4, desc: 'A sloped ramp to reach upper floors.' });
struct('stone_foundation', 'Stone Foundation', 'foundation', ST, { recipe: { stone: 50, wood: 20, thatch: 15 }, craftTime: 6, desc: 'A durable stone floor. Wild creatures cannot break it easily.' });
struct('stone_wall', 'Stone Wall', 'wall', ST, { recipe: { stone: 20, wood: 10, thatch: 7 }, craftTime: 6 });
struct('stone_doorframe', 'Stone Doorframe', 'doorframe', ST, { recipe: { stone: 16, wood: 8, thatch: 6 }, craftTime: 6 });
struct('reinforced_door', 'Reinforced Wooden Door', 'door', ST, { recipe: { stone: 20, wood: 10, thatch: 7 }, craftTime: 6 });
struct('stone_ceiling', 'Stone Ceiling', 'ceiling', ST, { recipe: { stone: 40, wood: 20, thatch: 10 }, craftTime: 6 });
struct('metal_foundation', 'Metal Foundation', 'foundation', MT, { recipe: { metal_ingot: 50, cementing_paste: 20 }, craftTime: 10, station: 'smithy' });
struct('metal_wall', 'Metal Wall', 'wall', MT, { recipe: { metal_ingot: 25, cementing_paste: 10 }, craftTime: 10, station: 'smithy' });

struct('campfire', 'Campfire', 'campfire', ['#6a5a4a', '#ff9a3a'], { recipe: { thatch: 12, stone: 16, flint: 1, wood: 2 }, craftTime: 5, desc: 'Cook meat and stay warm. Burns Wood or Thatch.' });
struct('standing_torch', 'Standing Torch', 'torch', ['#7a5a3a', '#ffb03a'], { recipe: { wood: 5, flint: 1, stone: 5, fiber: 10, thatch: 5 }, craftTime: 5, desc: 'A torch mounted on a pole. Burns Thatch or Wood.' });
struct('storage_box', 'Storage Box', 'box', WD, { recipe: { wood: 25, thatch: 20, fiber: 10 }, craftTime: 5, desc: 'A small box to store goods in. 25 slots.' });
struct('large_storage_box', 'Large Storage Box', 'box', ['#5a3a22', '#b08050'], { recipe: { wood: 50, thatch: 35, fiber: 25 }, craftTime: 8, desc: 'A large box to store goods in. 60 slots.' });
struct('sleeping_bag', 'Sleeping Bag', 'bag', ['#8a6a44', '#4a8a3a'], { recipe: { fiber: 25, hide: 15, thatch: 3 }, craftTime: 5, desc: 'A single-use respawn point.' });
struct('simple_bed', 'Simple Bed', 'bed', ['#7a5432', '#d8c27a'], { recipe: { wood: 15, thatch: 80, fiber: 30, hide: 25 }, craftTime: 8, desc: 'A permanent respawn point.' });
struct('mortar_and_pestle', 'Mortar and Pestle', 'mortar', ST, { recipe: { stone: 65, hide: 15 }, craftTime: 8, desc: 'Grind Narcotics, Stimulants, Sparkpowder, Gunpowder and Cementing Paste.' });
struct('preserving_bin', 'Preserving Bin', 'box', ['#6a6a5a', '#a8d8f0'], { recipe: { stone: 30, wood: 30, thatch: 20, fiber: 10 }, craftTime: 6, desc: 'Food spoils four times slower inside.' });
struct('refining_forge', 'Refining Forge', 'forge', ['#5a5a56', '#ff7a2a'], { recipe: { stone: 125, flint: 5, hide: 65, wood: 20, fiber: 40 }, craftTime: 10, desc: 'Smelts Metal into Metal Ingots. Burns Wood or Thatch.' });
struct('smithy', 'Smithy', 'smithy', ['#5a3a22', '#9aa3ad'], { recipe: { stone: 50, wood: 30, hide: 20, metal_ingot: 5 }, craftTime: 10, desc: 'Crafts metal tools, weapons, saddles and armor.' });

// Refined in the forge
ITEMS.metal_ingot.recipe = { metal: 2 };
ITEMS.metal_ingot.craftTime = 20;
ITEMS.metal_ingot.station = 'forge';
// Charcoal is not crafted: campfires and forges produce it as they burn Wood.

// ----- Saddles -----
const saddle = (id, name, creature, o) => def(id, { name, cat: 'saddle', saddleFor: creature, icon: { shape: 'saddle', c: '#6a4a2a', c2: '#c48a5a' }, weight: 5, stack: 1, ...o });
saddle('parasaur_saddle', 'Parasaur Saddle', 'parasaur', { armor: 15, recipe: { hide: 140, fiber: 25 }, craftTime: 10 });
saddle('phiomia_saddle', 'Phiomia Saddle', 'phiomia', { armor: 15, recipe: { hide: 120, fiber: 20 }, craftTime: 10 });
saddle('raptor_saddle', 'Raptor Saddle', 'raptor', { armor: 20, recipe: { hide: 120, fiber: 25 }, craftTime: 10 });
saddle('trike_saddle', 'Trike Saddle', 'trike', { armor: 20, recipe: { hide: 200, fiber: 40 }, craftTime: 12 });
saddle('carbonemys_saddle', 'Carbonemys Saddle', 'carbonemys', { armor: 25, recipe: { hide: 250, fiber: 45 }, craftTime: 12 });
saddle('sarco_saddle', 'Sarco Saddle', 'sarco', { armor: 25, recipe: { hide: 220, fiber: 45 }, craftTime: 12 });
saddle('saber_saddle', 'Sabertooth Saddle', 'sabertooth', { armor: 25, recipe: { hide: 250, fiber: 50 }, craftTime: 12 });
saddle('stego_saddle', 'Stego Saddle', 'stego', { armor: 25, recipe: { hide: 270, fiber: 120, metal_ingot: 10 }, craftTime: 15, station: 'smithy' });
saddle('ptera_saddle', 'Pteranodon Saddle', 'pteranodon', { armor: 20, recipe: { hide: 280, fiber: 40, metal_ingot: 20 }, craftTime: 15, station: 'smithy' });
saddle('ankylo_saddle', 'Ankylo Saddle', 'ankylo', { armor: 30, recipe: { hide: 300, fiber: 100, metal_ingot: 25 }, craftTime: 15, station: 'smithy' });
saddle('argentavis_saddle', 'Argentavis Saddle', 'argentavis', { armor: 25, recipe: { hide: 300, fiber: 80, metal_ingot: 30 }, craftTime: 15, station: 'smithy' });
saddle('carno_saddle', 'Carno Saddle', 'carno', { armor: 30, recipe: { hide: 320, fiber: 100, metal_ingot: 30 }, craftTime: 15, station: 'smithy' });
saddle('mammoth_saddle', 'Mammoth Saddle', 'mammoth', { armor: 30, recipe: { hide: 350, fiber: 120, metal_ingot: 40 }, craftTime: 15, station: 'smithy' });
saddle('megalodon_saddle', 'Megalodon Saddle', 'megalodon', { armor: 25, recipe: { hide: 300, fiber: 100, metal_ingot: 40 }, craftTime: 15, station: 'smithy' });
saddle('rex_saddle', 'Rex Saddle', 'rex', { armor: 40, recipe: { hide: 380, fiber: 140, metal_ingot: 80 }, craftTime: 20, station: 'smithy' });
saddle('bronto_saddle', 'Bronto Saddle', 'bronto', { armor: 40, recipe: { hide: 400, fiber: 180, metal_ingot: 80 }, craftTime: 20, station: 'smithy' });

export function itemName(id) {
  return ITEMS[id] ? ITEMS[id].name : id;
}

// Items that a campfire / forge consumes as fuel and how many seconds each burns.
export const FUEL = { wood: 30, thatch: 7 };
export const FORGE_FUEL = { wood: 30, thatch: 7, oil: 60 };
