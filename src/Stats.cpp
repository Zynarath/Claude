#include "Stats.hpp"

#include <algorithm>

using C = Category;

// clang-format off
const std::array<StatDef, ST_COUNT> STATS = {{
    // key                name                 cat         base   inc     growth max   cash  cashG  coin  coinG  format
    {"damage",            "Damage",            C::Attack,  3.0,   0.6,    1.012, 5000, 5,    1.065, 12,   1.085, Fmt::Number},
    {"attack_speed",      "Attack Speed",      C::Attack,  1.0,   0.04,   1.0,   100,  8,    1.09,  20,   1.12,  Fmt::PerSecond},
    {"crit_chance",       "Critical Chance",   C::Attack,  0.0,   0.005,  1.0,   160,  10,   1.08,  25,   1.10,  Fmt::Percent},
    {"crit_factor",       "Critical Factor",   C::Attack,  1.2,   0.08,   1.0,   300,  10,   1.07,  25,   1.09,  Fmt::Multiplier},
    {"range",             "Range",             C::Attack,  150.0, 2.0,    1.0,   90,   10,   1.10,  25,   1.13,  Fmt::Number},
    {"dmg_per_meter",     "Damage / Meter",    C::Attack,  0.0,   0.0002, 1.0,   300,  15,   1.08,  40,   1.10,  Fmt::Percent2},
    {"multishot_chance",  "Multishot Chance",  C::Attack,  0.0,   0.005,  1.0,   100,  20,   1.09,  40,   1.12,  Fmt::Percent},
    {"multishot_targets", "Multishot Targets", C::Attack,  2.0,   1.0,    1.0,   5,    500,  4.0,   300,  3.0,   Fmt::Number},
    {"bounce_chance",     "Bounce Chance",     C::Attack,  0.0,   0.005,  1.0,   100,  20,   1.09,  40,   1.12,  Fmt::Percent},
    {"bounce_targets",    "Bounce Targets",    C::Attack,  1.0,   1.0,    1.0,   6,    600,  4.0,   350,  3.0,   Fmt::Number},

    {"health",            "Health",            C::Defense, 5.0,   1.5,    1.012, 5000, 5,    1.065, 12,   1.085, Fmt::Number},
    {"regen",             "Health Regen",      C::Defense, 0.0,   0.05,   1.012, 5000, 8,    1.07,  15,   1.085, Fmt::PerSecond},
    {"def_percent",       "Defense %",         C::Defense, 0.0,   0.005,  1.0,   150,  15,   1.08,  30,   1.10,  Fmt::Percent},
    {"def_abs",           "Defense Absolute",  C::Defense, 0.0,   0.3,    1.012, 5000, 15,   1.07,  30,   1.085, Fmt::Decimal},
    {"thorns",            "Thorn Damage",      C::Defense, 0.0,   0.01,   1.0,   100,  20,   1.09,  40,   1.12,  Fmt::Percent},
    {"lifesteal",         "Lifesteal",         C::Defense, 0.0,   0.001,  1.0,   100,  30,   1.10,  50,   1.13,  Fmt::Percent2},
    {"knockback_chance",  "Knockback Chance",  C::Defense, 0.0,   0.01,   1.0,   50,   20,   1.10,  40,   1.12,  Fmt::Percent},
    {"knockback_force",   "Knockback Force",   C::Defense, 10.0,  1.5,    1.0,   40,   25,   1.12,  40,   1.13,  Fmt::Number},

    {"cash_bonus",        "Cash Bonus",        C::Utility, 1.0,   0.02,   1.0,   200,  15,   1.07,  25,   1.08,  Fmt::Multiplier},
    {"cash_per_wave",     "Cash / Wave",       C::Utility, 0.0,   5.0,    1.01,  2000, 20,   1.07,  30,   1.08,  Fmt::Number},
    {"coins_bonus",       "Coins / Kill Bonus",C::Utility, 1.0,   0.02,   1.0,   200,  30,   1.08,  40,   1.08,  Fmt::Multiplier},
    {"coins_per_wave",    "Coins / Wave",      C::Utility, 0.0,   0.5,    1.0,   200,  30,   1.09,  40,   1.10,  Fmt::Decimal},
    {"interest",          "Interest / Wave",   C::Utility, 0.0,   0.002,  1.0,   50,   40,   1.12,  60,   1.13,  Fmt::Percent2},
}};
// clang-format on

BulkBuy ComputeBulk(StatId id, int curLevel, int otherLevel, int want, double budget, bool useCoins) {
    const StatDef& s = STATS[id];
    BulkBuy r;
    int room = std::max(0, s.maxLevel - curLevel - otherLevel);
    auto costAt = [&](int lvl) { return useCoins ? s.coinCost(lvl) : s.cashCost(lvl); };

    if (want < 0) {  // buy max
        while (r.count < room) {
            double c = costAt(curLevel + r.count);
            if (r.cost + c > budget) break;
            r.cost += c;
            r.count++;
        }
        if (r.count == 0 && room > 0) {
            r.count = 1;
            r.cost = costAt(curLevel);
            r.affordable = false;
        } else {
            r.affordable = r.count > 0;
        }
        return r;
    }

    r.count = std::min(want, room);
    for (int i = 0; i < r.count; i++) r.cost += costAt(curLevel + i);
    r.affordable = r.count > 0 && r.cost <= budget;
    return r;
}
