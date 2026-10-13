// Headless balance simulator: a simple bot plays repeated runs, spending cash in-run and
// coins in the workshop between runs, and prints how far it gets. Use it to sanity-check
// changes to the numbers in Stats.cpp / Battle.cpp without playing by hand.
//
//   tower_sim [runs=15] [tier=1]
#include <cstdio>
#include <cstdlib>

#include "../src/Battle.hpp"

static const StatId PRIORITY[] = {ST_DAMAGE, ST_ATTACK_SPEED, ST_HEALTH, ST_REGEN, ST_CRIT_CHANCE, ST_CRIT_FACTOR,
                                  ST_DEF_ABS, ST_DEF_PERCENT, ST_CASH_BONUS, ST_RANGE, ST_MULTISHOT_CHANCE,
                                  ST_BOUNCE_CHANCE, ST_COINS_BONUS, ST_COINS_PER_WAVE, ST_KNOCKBACK_CHANCE};

int main(int argc, char** argv) {
    int runs = argc > 1 ? std::atoi(argv[1]) : 15;
    int tier = argc > 2 ? std::atoi(argv[2]) : 1;
    Levels ws{};
    double bank = 0;

    for (int r = 1; r <= runs; r++) {
        Battle b(ws, tier, 1234 + r);
        float buyTimer = 0;
        const float dt = 1.f / 60.f;
        while (!b.gameOver && b.wave <= 300) {
            b.update(dt);
            buyTimer += dt;
            if (buyTimer >= 1.f) {
                buyTimer = 0;
                // Buy the cheapest affordable upgrade from the priority list, repeatedly.
                for (;;) {
                    int best = -1;
                    double bestCost = 0;
                    for (StatId id : PRIORITY) {
                        BulkBuy q = b.quote(id, 1);
                        if (q.affordable && (best < 0 || q.cost < bestCost)) best = id, bestCost = q.cost;
                    }
                    if (best < 0) break;
                    b.buy((StatId)best, 1);
                }
            }
        }
        bank += b.coinsEarned;
        std::printf("run %2d: wave %3d  kills %5d  time %6.0fs  coins +%8.0f  dmg %8.1f hp %8.1f\n", r, b.wave, b.kills,
                    b.elapsed, b.coinsEarned, b.stat(ST_DAMAGE), b.stat(ST_HEALTH));

        for (;;) {
            int best = -1;
            double bestCost = 0;
            for (StatId id : PRIORITY) {
                BulkBuy q = ComputeBulk(id, ws[id], 0, 1, bank, true);
                if (q.affordable && (best < 0 || q.cost < bestCost)) best = id, bestCost = q.cost;
            }
            if (best < 0) break;
            bank -= bestCost;
            ws[best]++;
        }
    }
    return 0;
}
