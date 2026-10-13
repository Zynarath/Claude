// Creature roster as it shipped at the June 2, 2015 Early Access launch.
// (Spinosaurus, Ichthyosaurus, Plesiosaurus, Dimorphodon, Titanomyrma and Meganeura
// arrived in later 2015 patches and are intentionally absent.)
//
// Stats are level-1 base values; wild creatures spawn between level 1 and 30.

export const MAX_WILD_LEVEL = 30;

// Food each creature accepts while being tamed, best first, with affinity per food unit.
const HERB = [['mejoberry', 1.5], ['amarberry', 1], ['azulberry', 1], ['tintoberry', 1]];
const CARN = [['raw_prime_meat', 3], ['raw_meat', 1], ['cooked_prime_meat', 1.5], ['cooked_meat', 0.6]];

// Food value (units restored to a creature) of each tame food.
export const TAME_FOOD_VALUE = {
  mejoberry: 20, amarberry: 20, azulberry: 20, tintoberry: 20,
  raw_meat: 50, raw_prime_meat: 50, cooked_meat: 25, cooked_prime_meat: 50, spoiled_meat: 50,
};

const C = {};
function creature(id, o) {
  C[id] = {
    id,
    habitat: 'land',
    temper: 'passive',
    diet: 'herbivore',
    tameable: true,
    rideable: false,
    hp: 100,
    stamina: 100,
    torpor: 100,
    damage: 10,
    attackRange: 2,
    attackRate: 1.2,
    walk: 2,
    run: 6,
    turnRate: 3,
    radius: 1,
    height: 1,
    aggroRange: 25,
    weight: 100,
    xp: 5,
    tameAffinity: 300,
    tameDrain: 1,
    drops: { raw_meat: 3, hide: 3 },
    spawn: [],
    ...o,
  };
  C[id].tameFoods = C[id].tameFoods || (C[id].diet === 'carnivore' ? CARN : HERB);
}

creature('dodo', {
  name: 'Dodo', temper: 'passive', diet: 'herbivore', hp: 40, stamina: 100, torpor: 30, damage: 3, attackRange: 1,
  walk: 1.4, run: 4.2, radius: 0.45, height: 0.85, weight: 50, xp: 3, tameAffinity: 270, tameDrain: 3,
  drops: { raw_meat: 2, hide: 1 }, fleeOnHit: true,
  spawn: [['BEACH', 10], ['GRASS', 6], ['JUNGLE', 3], ['HERB_ISLAND', 6]], group: [1, 3],
  model: { type: 'dodo', color: '#8a7a6a', color2: '#d8c8a8', scale: 1 },
});
creature('dilophosaur', {
  name: 'Dilophosaur', temper: 'aggressive', diet: 'carnivore', hp: 130, stamina: 150, torpor: 75, damage: 9, attackRange: 2.2,
  walk: 2.2, run: 7.5, radius: 0.6, height: 1.6, weight: 90, xp: 8, aggroRange: 22, tameAffinity: 300, tameDrain: 1.4,
  spit: { damage: 6, range: 18, blind: 3 }, drops: { raw_meat: 3, hide: 3 },
  spawn: [['BEACH', 4], ['JUNGLE', 7], ['LAKESHORE', 5]], group: [1, 2],
  model: { type: 'theropod', color: '#5a7a3a', color2: '#d8b83a', scale: 0.55, frill: true, crest: 'dilo' },
});
creature('parasaur', {
  name: 'Parasaur', temper: 'passive', diet: 'herbivore', rideable: true, hp: 200, stamina: 300, torpor: 150, damage: 12,
  walk: 2.4, run: 9.5, radius: 1.0, height: 3.4, weight: 300, xp: 12, tameAffinity: 540, tameDrain: 1.5, fleeOnHit: true,
  drops: { raw_meat: 6, hide: 6 }, saddle: 'parasaur_saddle', seatHeight: 2.6,
  spawn: [['BEACH', 6], ['GRASS', 8], ['LAKESHORE', 5], ['HERB_ISLAND', 7]], group: [1, 3],
  model: { type: 'theropod', color: '#7a6a3a', color2: '#c84a2a', scale: 1.1, crest: 'para', herbivoreHead: true, upright: 0.25 },
});
creature('raptor', {
  name: 'Raptor', temper: 'aggressive', diet: 'carnivore', rideable: true, hp: 200, stamina: 150, torpor: 180, damage: 15, attackRange: 2.4,
  attackRate: 0.9, walk: 3, run: 11, radius: 0.7, height: 1.9, weight: 140, xp: 15, aggroRange: 30, tameAffinity: 300, tameDrain: 1,
  drops: { raw_meat: 5, hide: 6 }, saddle: 'raptor_saddle', seatHeight: 1.55, pounce: true,
  spawn: [['GRASS', 5], ['JUNGLE', 6], ['BEACH', 1]], group: [1, 3],
  model: { type: 'theropod', color: '#8a5a3a', color2: '#d8a87a', scale: 0.8, feathers: true },
});
creature('trike', {
  name: 'Triceratops', short: 'Trike', temper: 'territorial', diet: 'herbivore', rideable: true, hp: 375, stamina: 150, torpor: 250,
  damage: 32, attackRange: 3.6, attackRate: 1.4, walk: 2.2, run: 8.5, radius: 1.6, height: 2.6, weight: 365, xp: 25,
  tameAffinity: 900, tameDrain: 1.2, drops: { raw_meat: 10, raw_prime_meat: 1, hide: 10, keratin: 5 }, saddle: 'trike_saddle', seatHeight: 2.6,
  spawn: [['GRASS', 9], ['BEACH', 2], ['JUNGLE', 3], ['HERB_ISLAND', 7]], group: [1, 3],
  model: { type: 'ceratopsian', color: '#6a6a4a', color2: '#b8743a', scale: 1 },
});
creature('rex', {
  name: 'Tyrannosaurus', short: 'Rex', temper: 'aggressive', diet: 'carnivore', rideable: true, hp: 1100, stamina: 420, torpor: 1550,
  damage: 62, attackRange: 5.5, attackRate: 1.6, walk: 2.8, run: 10, radius: 2.2, height: 6.2, weight: 500, xp: 90, aggroRange: 55,
  tameAffinity: 960, tameDrain: 0.8, drops: { raw_meat: 25, raw_prime_meat: 6, hide: 30 }, saddle: 'rex_saddle', seatHeight: 5.6,
  roar: true, spawn: [['GRASS', 1.2], ['JUNGLE', 1.0], ['MOUNTAIN', 1.6], ['VOLCANO', 2.5]], group: [1, 1],
  model: { type: 'theropod', color: '#5a5040', color2: '#8a7a5a', scale: 2.7, bigHead: true },
});
creature('bronto', {
  name: 'Brontosaurus', short: 'Bronto', temper: 'territorial', diet: 'herbivore', rideable: true, hp: 2070, stamina: 240, torpor: 1550,
  damage: 60, attackRange: 8, attackRate: 2.4, walk: 2.2, run: 4.5, radius: 3.2, height: 9, weight: 2000, xp: 110,
  tameAffinity: 1600, tameDrain: 0.9, drops: { raw_meat: 40, raw_prime_meat: 10, hide: 40 }, saddle: 'bronto_saddle', seatHeight: 6.4,
  spawn: [['GRASS', 1.4], ['HERB_ISLAND', 3], ['LAKESHORE', 1]], group: [1, 2],
  model: { type: 'sauropod', color: '#6a6a5a', color2: '#9a9a7a', scale: 1 },
});
creature('stego', {
  name: 'Stegosaurus', short: 'Stego', temper: 'territorial', diet: 'herbivore', rideable: true, hp: 570, stamina: 300, torpor: 500,
  damage: 35, attackRange: 5, attackRate: 1.8, walk: 2, run: 6.5, radius: 1.9, height: 4.2, weight: 500, xp: 35,
  tameAffinity: 1100, tameDrain: 1.1, drops: { raw_meat: 12, raw_prime_meat: 2, hide: 12, keratin: 8 }, saddle: 'stego_saddle', seatHeight: 3.6,
  spawn: [['GRASS', 4], ['JUNGLE', 4], ['HERB_ISLAND', 4]], group: [1, 2],
  model: { type: 'stego', color: '#5a6a4a', color2: '#b84a2a', scale: 1 },
});
creature('ankylo', {
  name: 'Ankylosaurus', short: 'Ankylo', temper: 'territorial', diet: 'herbivore', rideable: true, hp: 700, stamina: 175, torpor: 420,
  damage: 28, attackRange: 4, attackRate: 1.6, walk: 1.8, run: 5, radius: 1.7, height: 2.2, weight: 250, xp: 35,
  tameAffinity: 1100, tameDrain: 1.1, drops: { raw_meat: 10, raw_prime_meat: 1, hide: 10, keratin: 10 }, saddle: 'ankylo_saddle', seatHeight: 2.3,
  spawn: [['MOUNTAIN', 4], ['VOLCANO', 4], ['GRASS', 1.5], ['HERB_ISLAND', 2]], group: [1, 2],
  model: { type: 'ankylo', color: '#6a5a4a', color2: '#a89a7a', scale: 1 },
});
creature('carno', {
  name: 'Carnotaurus', short: 'Carno', temper: 'aggressive', diet: 'carnivore', rideable: true, hp: 420, stamina: 300, torpor: 300,
  damage: 35, attackRange: 3.6, attackRate: 1.2, walk: 2.6, run: 10, radius: 1.3, height: 3.6, weight: 300, xp: 40, aggroRange: 40,
  tameAffinity: 600, tameDrain: 0.9, drops: { raw_meat: 12, raw_prime_meat: 2, hide: 12 }, saddle: 'carno_saddle', seatHeight: 3.1,
  spawn: [['GRASS', 2], ['MOUNTAIN', 2.5], ['JUNGLE', 1.5], ['VOLCANO', 2]], group: [1, 1],
  model: { type: 'theropod', color: '#8a3a2a', color2: '#3a2a2a', scale: 1.5, horns: true, smallArms: true },
});
creature('sarco', {
  name: 'Sarcosuchus', short: 'Sarco', temper: 'aggressive', diet: 'carnivore', habitat: 'amphibious', rideable: true, hp: 400, stamina: 300,
  torpor: 300, damage: 30, attackRange: 3.5, walk: 1.6, run: 6.5, swim: 7, radius: 1.3, height: 1.2, weight: 300, xp: 30, aggroRange: 20,
  tameAffinity: 700, tameDrain: 1, drops: { raw_meat: 10, raw_prime_meat: 1, hide: 12 }, saddle: 'sarco_saddle', seatHeight: 1.4,
  spawn: [['LAKESHORE', 6], ['BEACH', 0.8]], group: [1, 1],
  model: { type: 'croc', color: '#4a5a3a', color2: '#9a9a6a', scale: 1 },
});
creature('pteranodon', {
  name: 'Pteranodon', temper: 'skittish', diet: 'carnivore', habitat: 'air', rideable: true, hp: 210, stamina: 150, torpor: 140,
  damage: 20, attackRange: 2.5, walk: 1.5, run: 4, fly: 15, flySprint: 30, radius: 0.9, height: 1.6, weight: 120, xp: 18,
  tameAffinity: 360, tameDrain: 1, drops: { raw_meat: 4, hide: 5 }, saddle: 'ptera_saddle', seatHeight: 1.4,
  spawn: [['BEACH', 3], ['MOUNTAIN', 3], ['GRASS', 1.5]], group: [1, 2], fleeOnHit: true,
  model: { type: 'ptero', color: '#7a5a4a', color2: '#d84a2a', scale: 1 },
});
creature('argentavis', {
  name: 'Argentavis', temper: 'aggressive', diet: 'carnivore', habitat: 'air', rideable: true, hp: 365, stamina: 750, torpor: 400,
  damage: 20, attackRange: 3, walk: 1.5, run: 4.5, fly: 13, flySprint: 22, radius: 1.3, height: 2, weight: 400, xp: 35, aggroRange: 35,
  tameAffinity: 700, tameDrain: 0.9, drops: { raw_meat: 8, hide: 8 }, saddle: 'argentavis_saddle', seatHeight: 1.8,
  spawn: [['MOUNTAIN', 4], ['VOLCANO', 2]], group: [1, 1],
  model: { type: 'bird', color: '#3a2a22', color2: '#d8d0c0', scale: 1.4 },
});
creature('mammoth', {
  name: 'Mammoth', temper: 'territorial', diet: 'herbivore', rideable: true, hp: 850, stamina: 330, torpor: 1000, damage: 32,
  attackRange: 5, attackRate: 1.6, walk: 2.2, run: 7.5, radius: 2.1, height: 4.4, weight: 500, xp: 50,
  tameAffinity: 1300, tameDrain: 1, drops: { raw_meat: 18, raw_prime_meat: 4, hide: 25 }, saddle: 'mammoth_saddle', seatHeight: 4.3,
  spawn: [['MOUNTAIN', 3], ['GRASS', 1]], group: [1, 3],
  model: { type: 'mammoth', color: '#5a3a22', color2: '#e8e0c8', scale: 1 },
});
creature('sabertooth', {
  name: 'Sabertooth', temper: 'aggressive', diet: 'carnivore', rideable: true, hp: 400, stamina: 200, torpor: 350, damage: 25,
  attackRange: 2.6, attackRate: 1, walk: 2.4, run: 11, radius: 0.9, height: 1.5, weight: 250, xp: 30, aggroRange: 35,
  tameAffinity: 600, tameDrain: 0.9, drops: { raw_meat: 8, hide: 10 }, saddle: 'saber_saddle', seatHeight: 1.45,
  spawn: [['MOUNTAIN', 3], ['GRASS', 1.5]], group: [1, 2],
  model: { type: 'cat', color: '#b0884a', color2: '#e8d8b8', scale: 1 },
});
creature('phiomia', {
  name: 'Phiomia', temper: 'passive', diet: 'herbivore', rideable: true, hp: 210, stamina: 150, torpor: 175, damage: 8,
  walk: 1.8, run: 6, radius: 0.9, height: 1.7, weight: 200, xp: 10, tameAffinity: 520, tameDrain: 1.6, fleeOnHit: true,
  drops: { raw_meat: 6, hide: 6 }, saddle: 'phiomia_saddle', seatHeight: 1.7,
  spawn: [['BEACH', 3], ['GRASS', 4], ['JUNGLE', 2], ['HERB_ISLAND', 4]], group: [1, 3],
  model: { type: 'phiomia', color: '#6a5a4a', color2: '#9a8a7a', scale: 1 },
});
creature('titanoboa', {
  name: 'Titanoboa', temper: 'aggressive', diet: 'carnivore', tameable: false, hp: 1000, stamina: 200, torpor: 500, damage: 40,
  attackRange: 3.5, attackRate: 1.4, walk: 1.5, run: 6.5, radius: 1.2, height: 1.2, weight: 300, xp: 60, aggroRange: 18,
  drops: { raw_meat: 15, hide: 15 }, spawn: [['JUNGLE', 0.8]], group: [1, 1], nocturnalBoost: true, poisonTorpor: 30,
  model: { type: 'snake', color: '#3a4a2a', color2: '#b8a85a', scale: 1 },
});
creature('scorpion', {
  name: 'Pulmonoscorpius', short: 'Scorpion', temper: 'aggressive', diet: 'carnivore', hp: 280, stamina: 150, torpor: 250, damage: 20,
  attackRange: 2.4, walk: 1.8, run: 6, radius: 1, height: 1.1, weight: 200, xp: 22, aggroRange: 20, poisonTorpor: 25,
  tameAffinity: 500, tameDrain: 1, drops: { raw_meat: 4, chitin: 10 },
  spawn: [['JUNGLE', 3], ['VOLCANO', 2], ['MOUNTAIN', 1]], group: [1, 1], nocturnalBoost: true,
  model: { type: 'scorpion', color: '#3a2a22', color2: '#8a5a3a', scale: 1 },
});
creature('araneo', {
  name: 'Araneo', temper: 'aggressive', diet: 'carnivore', hp: 225, stamina: 150, torpor: 100, damage: 22, attackRange: 2.2,
  walk: 2, run: 7.5, radius: 1, height: 1, weight: 150, xp: 20, aggroRange: 22, tameAffinity: 400, tameDrain: 1,
  tameFoods: [['spoiled_meat', 1.5], ['raw_meat', 1], ['raw_prime_meat', 2]],
  drops: { raw_meat: 3, chitin: 8 }, spawn: [['JUNGLE', 3]], group: [1, 2], nocturnalBoost: true,
  model: { type: 'spider', color: '#2a2622', color2: '#8a2a2a', scale: 1 },
});
creature('carbonemys', {
  name: 'Carbonemys', temper: 'territorial', diet: 'herbivore', habitat: 'amphibious', rideable: true, hp: 700, stamina: 200, torpor: 500,
  damage: 18, attackRange: 2.5, attackRate: 1.5, walk: 1, run: 2.6, swim: 4, radius: 1.5, height: 1.4, weight: 400, xp: 30,
  tameAffinity: 900, tameDrain: 1, drops: { raw_meat: 8, hide: 6, keratin: 12 }, saddle: 'carbonemys_saddle', seatHeight: 1.6,
  spawn: [['BEACH', 3], ['LAKESHORE', 4]], group: [1, 1],
  model: { type: 'turtle', color: '#4a5a3a', color2: '#7a6a4a', scale: 1 },
});
creature('megalodon', {
  name: 'Megalodon', temper: 'aggressive', diet: 'carnivore', habitat: 'water', rideable: true, hp: 450, stamina: 300, torpor: 600,
  damage: 40, attackRange: 4, attackRate: 1.1, walk: 0, run: 0, swim: 9, swimSprint: 16, radius: 1.8, height: 2, weight: 400, xp: 45,
  aggroRange: 45, tameAffinity: 700, tameDrain: 1, drops: { raw_meat: 15, raw_prime_meat: 2, hide: 12 }, saddle: 'megalodon_saddle', seatHeight: 1.2,
  spawn: [['DEEP', 5]], group: [1, 2],
  model: { type: 'shark', color: '#4a5a6a', color2: '#d8d8d8', scale: 1 },
});
creature('coelacanth', {
  name: 'Coelacanth', temper: 'passive', diet: 'carnivore', habitat: 'water', tameable: false, hp: 50, stamina: 100, torpor: 30, damage: 0,
  walk: 0, run: 0, swim: 3.5, swimSprint: 6, radius: 0.4, height: 0.4, weight: 20, xp: 2, fleeOnHit: true,
  drops: { raw_meat: 1 }, spawn: [['SHALLOW', 6], ['LAKE', 5]], group: [2, 4],
  model: { type: 'fish', color: '#3a4a6a', color2: '#8aa0c8', scale: 1 },
});
creature('trilobite', {
  name: 'Trilobite', temper: 'passive', diet: 'herbivore', habitat: 'amphibious', tameable: false, hp: 300, stamina: 100, torpor: 100,
  damage: 0, walk: 0.6, run: 1, swim: 1.2, radius: 0.5, height: 0.35, weight: 50, xp: 6,
  drops: { chitin: 5, oil: 3, silica_pearls: 4 }, spawn: [['BEACH', 4], ['SHALLOW', 2]], group: [1, 2],
  model: { type: 'trilobite', color: '#6a4a3a', color2: '#b88a5a', scale: 1 },
});

export const CREATURES = C;
export const CREATURE_LIST = Object.values(C);
