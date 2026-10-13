#pragma once
#include <array>
#include <cmath>

// Every upgradeable tower stat. Order inside a category is the order shown in the UI.
enum StatId {
    // Attack
    ST_DAMAGE, ST_ATTACK_SPEED, ST_CRIT_CHANCE, ST_CRIT_FACTOR, ST_RANGE, ST_DMG_PER_METER,
    ST_MULTISHOT_CHANCE, ST_MULTISHOT_TARGETS, ST_BOUNCE_CHANCE, ST_BOUNCE_TARGETS,
    // Defense
    ST_HEALTH, ST_REGEN, ST_DEF_PERCENT, ST_DEF_ABS, ST_THORNS, ST_LIFESTEAL,
    ST_KNOCKBACK_CHANCE, ST_KNOCKBACK_FORCE,
    // Utility
    ST_CASH_BONUS, ST_CASH_PER_WAVE, ST_COINS_BONUS, ST_COINS_PER_WAVE, ST_INTEREST,
    ST_COUNT
};

enum class Category { Attack, Defense, Utility };

enum class Fmt { Number, Decimal, PerSecond, Percent, Percent2, Multiplier };

struct StatDef {
    const char* key;   // identifier used in the save file
    const char* name;  // label shown in the UI
    Category cat;
    double base, inc, growth;  // value(L) = (base + inc*L) * growth^L
    int maxLevel;              // cap on workshop level + in-run level
    double cashBase, cashGrowth;  // in-run cost of the next level
    double coinBase, coinGrowth;  // workshop cost of the next level
    Fmt fmt;

    double value(int level) const { return (base + inc * level) * std::pow(growth, level); }
    double cashCost(int runLevel) const { return std::floor(cashBase * std::pow(cashGrowth, runLevel)); }
    double coinCost(int wsLevel) const { return std::floor(coinBase * std::pow(coinGrowth, wsLevel)); }
};

extern const std::array<StatDef, ST_COUNT> STATS;

using Levels = std::array<int, ST_COUNT>;

// Cost of buying `want` levels (want < 0 means "as many as the budget allows").
struct BulkBuy {
    int count = 0;
    double cost = 0;
    bool affordable = false;
};
// curLevel: the level being bought (run level or workshop level); otherLevel: the
// other contribution toward the shared max-level cap.
BulkBuy ComputeBulk(StatId id, int curLevel, int otherLevel, int want, double budget, bool useCoins);
