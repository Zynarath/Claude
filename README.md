# The Tower (PC fan remake)

An idle tower-defense game for PC, written in C++17 with [raylib](https://www.raylib.com/) and inspired by
*The Tower – Idle Tower Defense* on Google Play.

Your tower sits in the middle of the field and shoots automatically at enemies that close in from every side. Kill
enemies to earn **cash**, which you spend on upgrades during the run. When the tower falls, the **coins** you
earned stay with you. Spend them in the **Workshop** on permanent upgrades so every new run starts stronger.

## Features

- Endless waves of 5 enemy types: basic, fast, tank, ranged (shoots back), and a boss every 10 waves
- 23 upgrades across Attack, Defense and Utility: damage, attack speed, crits, range, damage per meter,
  multishot, bouncing shots, health, regen, defense % and absolute, thorns, lifesteal, knockback,
  cash and coin bonuses, interest
- In-run cash upgrades plus permanent coin upgrades in the Workshop
- Tiers: reach wave 30 to unlock the next tier, which has tougher enemies and bigger rewards
- Game speed 1x, 2x, 3x and 5x; buy x1, x5, x10 or MAX at a time
- Progress autosaves to `tower_save.txt` next to the executable
- Resizable window (F11 for borderless fullscreen)

## Controls

| Key            | Action                                     |
|----------------|--------------------------------------------|
| Mouse          | Everything: click cards to buy upgrades     |
| Space          | Cycle game speed                           |
| Esc / P        | Pause (Esc in the Workshop goes back)       |
| 1 / 2 / 3      | Attack / Defense / Utility tab             |
| Tab            | Cycle buy amount (x1, x5, x10, MAX)        |
| Enter          | Start a battle from the main menu          |
| F11            | Toggle borderless fullscreen               |

## Building on Windows

You need [CMake](https://cmake.org/download/) 3.16 or newer, plus either Visual Studio 2022 (with the
"Desktop development with C++" workload) or MinGW-w64. CMake downloads raylib with git the first time you
configure, so git must be installed and on your PATH.

**Visual Studio:**

```bat
cmake -S . -B build
cmake --build build --config Release
build\Release\TheTower.exe
```

**MinGW-w64 (e.g. from MSYS2):**

```bat
cmake -S . -B build -G "MinGW Makefiles"
cmake --build build
build\TheTower.exe
```

Either way you get a single self-contained `TheTower.exe` with no DLLs to ship.

You can also open the folder directly in Visual Studio ("Open a local folder"); it picks up `CMakeLists.txt`
automatically.

GitHub Actions builds the Windows exe on every push. Download it from the run's **Artifacts**
(`TheTower-windows`).

## Building on Linux

```sh
sudo apt install build-essential cmake git libx11-dev libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev libgl1-mesa-dev
cmake -S . -B build && cmake --build build -j
./build/TheTower
```

## Project layout

```
src/Stats.*     upgrade definitions: values, costs, caps (most balance numbers live here)
src/Battle.*    game simulation: waves, enemies, projectiles, damage (no graphics)
src/Ui.*        buttons, upgrade cards, number formatting
src/Save.*      save file
src/main.cpp    window, screens (menu, workshop, battle), rendering
tools/balance_sim.cpp   headless bot that plays repeated runs to check balance
```

## Tweaking balance

Most numbers are in the table in `src/Stats.cpp`. Each stat's value is `(base + inc*level) * growth^level`.
Enemy scaling per wave is set by `EnemyHpScale`, `EnemyDamageScale`, `CashScale` and `CoinScale` in
`src/Battle.cpp`.

To see how a change plays out, build the simulator and run it:

```sh
cmake -S . -B build -DTOWER_BUILD_SIM=ON && cmake --build build
./build/tower_sim 20      # 20 consecutive runs, spending coins in the workshop between runs
```
