# ARK: Survival Evolved — June 2015 Early Access, recreated in the browser

This is a playable fan recreation of **ARK: Survival Evolved as it shipped on Steam Early Access on June 2, 2015**. It runs in any modern desktop browser. There is no install step and no build step, and every model, texture, icon and sound is generated in code. Rendering uses three.js (vendored, MIT).

You wake up naked on a southern beach of The Island with only the Specimen Implant in your arm. From there you punch trees, pick up stones, craft a Stone Pick and level up into engrams. Then you build a thatch hut, knock out and tame dinosaurs, saddle and ride them, and try not to get eaten by Raptors.

> Unofficial fan project. Not affiliated with or endorsed by Studio Wildcard. ARK: Survival Evolved is a trademark of its respective owners.

## Running it

```bash
npm start          # or: node server.js
# open http://localhost:8080
```

Any static file server works, for example `python3 -m http.server 8080`. ES modules don't load over `file://`, so you can't open `index.html` directly. Click into the game to capture the mouse.

## Controls (2015 defaults)

| Key | Action |
| --- | --- |
| W A S D, Shift, Space | Move, sprint, jump |
| C / X | Crouch / prone (crouching cuts how far away predators notice you) |
| Left mouse | Punch, swing tool, harvest, attack, place structure, draw bow (release to fire) |
| Right mouse | Throw spear, aim, spyglass zoom |
| E | Use: pick up stones, harvest bushes, drink, open doors and boxes, feed KO'd creatures, ride. Rotates a structure while you're placing it |
| Hold E | Orders for tamed creatures; demolish, light or open structures |
| F | Open the inventory of whatever you're looking at |
| I | Inventory, crafting, engrams, levelling |
| 1–0 / mouse wheel | Hotbar. Pressing a food slot eats one |
| Q | Holster your item / rotate a structure |
| R | Switch ammo (stone ↔ tranq arrows, rifle ammo ↔ darts) |
| K | Third person |
| H | Show exact stat values, time of day and temperature |
| M | Map. Your own position only appears if you carry a GPS, as in 2015 |
| T / Y / U / J / N | Whistle: follow / stop / aggressive / passive / neutral |
| O | Drop the held item |
| Esc | Pause, save, options |

In the inventory, hover an item and press **1–0** to put it on the hotbar, **T** to transfer it or **E** to use it. You can also drag and drop.

## What's in it

### The Island
- A 4 km procedural island laid out like The Island. Easy spawn beaches are in the south (South Zones 1–3), with medium East and West zones and a hard North zone in the mountains.
- Biomes: beaches, grasslands, jungle, a central volcano with obsidian and lava glow, northern mountain ranges with metal and crystal, two inland lakes, oil rocks on the north coast, silica pearls on the sea floor, and **Herbivore Island** off the east coast.
- **Red, Green and Blue Obelisks** float over their platforms, with sky beams visible across the map. In 2015 they were landmarks only; boss arenas came later.
- A full day/night cycle (about 45 minutes of day and 15 of night), stars and moon, rain, morning fog, an ocean with swimming and oxygen, and underwater fog.
- About 28,000 harvestable nodes (palm, jungle and broadleaf trees, pines, berry bushes, ferns, boulders, metal, obsidian, crystal, oil, small stones and pearls). Depleted nodes respawn, but not inside your base.

### Survival
- Stats: Health, Stamina, Oxygen, Food, Water, Weight, Melee Damage, Movement Speed, Fortitude and Torpor.
- Hunger, thirst, starvation and dehydration. Raw, cooked and spoiled meat, plus narcoberries that can knock *you* out.
- **Temperature**: altitude, night, rain, water, the volcano, campfires and shelter all change it. Clothing insulation and Fortitude change how much heat or cold you can take. Too far out of your comfort zone causes hypothermia or hyperthermia.
- Food spoils stack by stack the way ARK does it, one unit at a time. The Preserving Bin slows spoiling down.
- Encumbrance, fall damage, swimming, drowning, and dilophosaur spit that blinds you.
- Death leaves your body with everything you carried, marked on the map. You respawn in a region or at a Sleeping Bag (single use) or Simple Bed, and keep your level and engrams.

### Levelling and engrams
- XP from harvesting, crafting, kills and tames. ARK-style manual levelling: you choose a stat to raise each level.
- **Max level 64**, the cap documented for the June 2015 builds (v174.0). Engram points per level rise with level.
- About 90 engrams, from the Stone Pick (known from the start) up to Rex and Bronto saddles, Flak armor and the Longneck Rifle.

### Crafting and building
- Inventory crafting with a queue, plus station crafting: **Mortar and Pestle** (Narcotics, Stimulants, Sparkpowder, Gunpowder, Cementing Paste), **Smithy** (metal tools, firearms, saddles, Flak), **Refining Forge** (Metal → Ingots) and **Campfire** (meat → cooked meat, Wood → Charcoal). Stations craft from their own inventory, as in ARK.
- Tools and weapons: Stone and Metal Picks and Hatchets, Spear (throwable and recoverable), Torch, Wooden Club, Slingshot, Bow with Stone and Tranquilizer Arrows, Sword, Simple Pistol and Longneck Rifle with Tranq Darts, plus Spyglass, Compass, GPS and Waterskin.
- Armor sets: Cloth, Hide, Chitin and Flak, each with armor and insulation values. Tools wear out and can be repaired.
- **Building**: Thatch, Wood, Stone and Metal foundations, walls, doorframes, doors and ceilings/roofs, plus wooden ramps. Pieces snap to each other, doors open and close, you can walk on floors and ceilings, and structures are solid. Deployables: Campfire, Standing Torch, Storage Box, Large Storage Box, Preserving Bin, Sleeping Bag, Simple Bed, Mortar and Pestle, Refining Forge and Smithy. Demolishing refunds half the materials.

### Creatures: the launch roster
Dodo, Dilophosaur, Parasaur, Raptor, Triceratops, Tyrannosaurus, Brontosaurus, Stegosaurus, Ankylosaurus, Carnotaurus, Sarcosuchus, Pteranodon, Argentavis, Mammoth, Sabertooth, Phiomia, Titanoboa, Pulmonoscorpius, Araneo, Carbonemys, Megalodon, Coelacanth and Trilobite.

Creatures added in later 2015 patches are deliberately absent: Spinosaurus (v173), Ichthyosaurus and Plesiosaurus (v181), Dimorphodon, Titanomyrma and Meganeura.

- Wild levels run from 1 to 30, weighted toward low levels. Spawns depend on biome; Herbivore Island spawns only herbivores.
- Temperaments: passive and fleeing (Dodo, Parasaur, Phiomia), skittish flyers (Pteranodon), territorial animals that retaliate (Trike, Stego, Ankylo, Bronto, Mammoth) and aggressive predators. Raptors and Dilos hunt in packs, Rexes roar, Dilos spit, and Scorpions and Titanoboas poison you with torpor. Spiders and Scorpions get bolder at night. Predators also hunt other creatures.
- **Knockout taming**: build up Torpor with fists, a Wooden Club, the Slingshot or Tranquilizer Arrows and Darts. Then put the creature's preferred food in its inventory (Mejoberries for herbivores, Raw Prime Meat for carnivores, Spoiled Meat for Araneos). Keep it asleep with Narcoberries or Narcotics. Hitting it lowers taming effectiveness, which lowers its bonus levels. The HUD shows affinity, torpor and an estimated time remaining.
- Tames follow, stay, and can be set aggressive, neutral or passive. They gain XP from kills, level up, eat from their own inventory, and carry loads limited by their weight stat.
- **Riding** needs a saddle. Ground mounts sprint and jump, Pteranodon and Argentavis fly, and Megalodon swims. Mounted Trikes, Stegos, Ankylos, Mammoths and Brontos gather berries, thatch, wood, flint and metal.
- **Supply drops**: White, Green, Blue, Purple and Yellow beacons fall from orbit. Each needs a minimum level (3, 15, 30, 45 and 60) and holds tier-appropriate loot.

### Host / Local settings
The single-player settings page has Difficulty, Day Cycle Speed, Taming Speed, Harvest Amount, XP, Resource Respawn, Player Damage and Dino Damage. The defaults (1.0) are the official 2015 pacing, so a high-level Rex tame takes about an hour. Turn the multipliers up if you want a shorter grind.

The game autosaves to `localStorage` every two minutes, when you exit to the menu, and when you close the tab.

## Accuracy notes

Patch notes from the first weeks of Early Access are sparse, so I sourced the content as follows:

- **Documented and followed**: the launch date, the launch creature roster and which creatures came later, the v174.0 player level cap of 64, Studio Wildcard's spawn region names, the 2015 control scheme, knockout taming, stat names and per-level increases, the item, structure and saddle line-up, and long-standing recipes (Stone Pick: 1 Wood, 1 Thatch, 1 Stone; Campfire: 12 Thatch, 16 Stone, 1 Flint, 2 Wood; Narcotic: 5 Narcoberries, 1 Spoiled Meat, and so on).
- **Approximated**: exact engram levels and point costs, XP curves, creature base stats, taming affinity values, and drain and spoil timers. I tuned these to feel like the launch build rather than copying numbers from it, because the numbers from that exact week aren't recorded anywhere I could verify.
- **Recreated, not copied**: the island is procedural, not Studio Wildcard's terrain, and every model and sound is original.

## Project layout

```
index.html, css/style.css     page shell and ARK-style UI theme
server.js                     zero-dependency static server
src/main.js                   game controller: loop, input, interaction, combat, building, riding, death, saving
src/world/                    terrain and biomes, sky, day/night and weather, water, resource nodes, obelisks and supply drops
src/game/                     survivor stats and physics, inventory, creatures (AI, taming, riding), creature models,
                              structures, first- and third-person survivor models, save system
src/data/                     items and recipes, engrams and levelling, the creature roster
src/ui/                       HUD, menus and screens, procedural item icons
tools/smoke-test.mjs          headless end-to-end test
vendor/three/                 three.js r160 (MIT)
```

## Testing

`npm test` runs `tools/smoke-test.mjs` against a running server (`npm start` first). It needs Playwright with Chromium available (`npm i -D playwright` if you don't have it). The test boots the game and asserts the full gameplay loop:

- starting a survivor
- punching trees, picking up stones and harvesting bushes
- crafting and using a Stone Pick
- levelling up and learning engrams
- a campfire that cooks meat and makes charcoal
- a snapped thatch hut with a working door
- Mortar and Pestle, Refining Forge and Smithy crafting chains
- spoilage and the Preserving Bin
- temperature (cold mountains, warm fires, a hot volcano)
- knocking out and taming a Dodo
- taming, saddling and riding a Parasaur
- flying a Pteranodon and swimming a Megalodon
- tranquilizer arrows
- throwing and recovering a spear
- follow/stay whistles
- fleeing herbivores and Dilophosaur spit
- supply drop level gates
- sleeping bags and demolishing
- death by Raptor, respawning, and saving and reloading
- opening every screen
- two minutes of simulated world

It fails on any page error or failed check. Pass a directory as the second argument (`node tools/smoke-test.mjs http://localhost:8080/ shots/`) to also save screenshots of each interface.

`tools/creature-gallery.html` renders every creature model side by side; open it through the server.

## License

The game code is MIT. three.js is MIT (see `vendor/three/LICENSE`).
