#include "Battle.hpp"

#include <algorithm>

namespace {

struct EnemyProto {
    double hp, damage, cash, coins;
    float speed, radius;
};

// Indexed by EnemyType
const EnemyProto PROTOS[] = {
    /* Basic  */ {1.0, 1.0, 1.0, 0.20, 38.f, 9.f},
    /* Fast   */ {0.6, 0.8, 2.0, 0.30, 72.f, 8.f},
    /* Tank   */ {5.0, 2.5, 4.0, 0.80, 22.f, 14.f},
    /* Ranged */ {1.2, 0.8, 3.0, 0.50, 32.f, 9.f},
    /* Boss   */ {30.0, 6.0, 40.0, 10.0, 14.f, 24.f},
};

constexpr float PROJECTILE_SPEED = 460.f;
constexpr float ENEMY_SHOT_SPEED = 190.f;
constexpr float BOUNCE_RANGE = 160.f;
constexpr float MELEE_INTERVAL = 1.0f;
constexpr float RANGED_INTERVAL = 2.5f;
constexpr float PIXELS_PER_METER = 10.f;

}  // namespace

double EnemyHpScale(int wave, int tier) {
    int w = wave - 1;
    return (1.0 + 0.10 * w) * std::pow(1.045, w) * std::pow(3.0, tier - 1);
}
double EnemyDamageScale(int wave, int tier) {
    int w = wave - 1;
    return (1.0 + 0.08 * w) * std::pow(1.038, w) * std::pow(2.5, tier - 1);
}
double CashScale(int wave, int tier) {
    int w = wave - 1;
    return (1.0 + 0.05 * w) * std::pow(1.03, w) * std::pow(1.6, tier - 1);
}
double CoinScale(int wave, int tier) {
    int w = wave - 1;
    return (1.0 + 0.02 * w) * std::pow(2.0, tier - 1);
}

Battle::Battle(const Levels& workshop, int tier_, uint32_t seed) : tier(tier_), workshop_(workshop), rng_(seed) {
    hp = stat(ST_HEALTH);
    startWave();
}

BulkBuy Battle::quote(StatId id, int want) const {
    return ComputeBulk(id, run_[id], workshop_[id], want, cash, false);
}

bool Battle::buy(StatId id, int want) {
    if (gameOver) return false;
    BulkBuy b = quote(id, want);
    if (!b.affordable) return false;
    double oldMax = stat(ST_HEALTH);
    cash -= b.cost;
    run_[id] += b.count;
    // Buying health also heals by the amount gained, like the original game.
    if (id == ST_HEALTH) hp += stat(ST_HEALTH) - oldMax;
    return true;
}

void Battle::startWave() {
    waveTimer = 0;
    spawnTimer_ = 0;
    if (wave % 10 == 0) spawnEnemy(EnemyType::Boss);
}

void Battle::spawnEnemy(EnemyType type) {
    const EnemyProto& p = PROTOS[(int)type];
    Enemy e;
    e.id = nextId_++;
    e.type = type;
    e.radius = p.radius;
    e.speed = p.speed * (0.9f + 0.2f * rand01());
    e.maxHp = e.hp = p.hp * EnemyHpScale(wave, tier);
    e.damage = p.damage * EnemyDamageScale(wave, tier);
    e.cash = p.cash * CashScale(wave, tier);
    e.coins = p.coins * CoinScale(wave, tier);
    e.attackTimer = 0.3f;
    e.stopDist = 110.f + 40.f * rand01();

    // Spawn just outside a random point on the field border.
    float margin = e.radius + 4;
    float t = rand01() * 4.f;
    float f = t - std::floor(t);
    if (t < 1)      e.pos = {f * FIELD_W, -margin};
    else if (t < 2) e.pos = {FIELD_W + margin, f * FIELD_H};
    else if (t < 3) e.pos = {f * FIELD_W, FIELD_H + margin};
    else            e.pos = {-margin, f * FIELD_H};
    enemies.push_back(e);
}

Enemy* Battle::findEnemy(uint32_t id) {
    for (auto& e : enemies)
        if (e.id == id && e.alive) return &e;
    return nullptr;
}

Enemy* Battle::nearestEnemy(Vec2 from, float maxDist, uint32_t exclude) {
    Enemy* best = nullptr;
    float bestD = maxDist;
    for (auto& e : enemies) {
        if (!e.alive || e.id == exclude) continue;
        float d = Dist(from, e.pos) - e.radius;
        if (d <= bestD) {
            bestD = d;
            best = &e;
        }
    }
    return best;
}

void Battle::fireProjectile(const Enemy& target, double damage, bool crit) {
    Projectile p;
    p.pos = center();
    p.vel = (target.pos - p.pos).norm() * PROJECTILE_SPEED;
    p.targetId = target.id;
    p.damage = damage;
    p.crit = crit;
    if (rand01() < stat(ST_BOUNCE_CHANCE)) p.bouncesLeft = (int)stat(ST_BOUNCE_TARGETS);
    projectiles.push_back(p);
}

void Battle::fireAt(const Enemy& target) {
    auto shot = [&](const Enemy& t) {
        bool crit = rand01() < stat(ST_CRIT_CHANCE);
        double dmg = stat(ST_DAMAGE) * (crit ? stat(ST_CRIT_FACTOR) : 1.0);
        fireProjectile(t, dmg, crit);
    };
    shot(target);

    if (rand01() < stat(ST_MULTISHOT_CHANCE)) {
        // Extra shots go to the next-closest distinct enemies in range.
        float range = (float)stat(ST_RANGE);
        std::vector<const Enemy*> cands;
        for (auto& e : enemies)
            if (e.alive && e.id != target.id && Dist(center(), e.pos) - e.radius <= range) cands.push_back(&e);
        std::sort(cands.begin(), cands.end(), [&](const Enemy* a, const Enemy* b) {
            return Dist(center(), a->pos) < Dist(center(), b->pos);
        });
        int extra = (int)stat(ST_MULTISHOT_TARGETS) - 1;
        for (int i = 0; i < extra && i < (int)cands.size(); i++) shot(*cands[i]);
    }
}

void Battle::damageTower(double raw) {
    double d = raw * (1.0 - stat(ST_DEF_PERCENT)) - stat(ST_DEF_ABS);
    if (d <= 0) return;
    hp -= d;
    towerFlash = 0.15f;
    if (hp <= 0) {
        hp = 0;
        gameOver = true;
    }
}

void Battle::damageEnemy(Enemy& e, double dmg) {
    if (!e.alive) return;
    double dealt = std::min(dmg, e.hp);
    e.hp -= dmg;
    e.flash = 0.08f;
    damageDealt += dealt;
    hp = std::min(stat(ST_HEALTH), hp + dealt * stat(ST_LIFESTEAL));
    if (e.hp <= 0) killEnemy(e);
}

void Battle::killEnemy(Enemy& e) {
    e.alive = false;
    kills++;
    double c = e.cash * stat(ST_CASH_BONUS);
    cash += c;
    cashEarned += c;
    coinsEarned += e.coins * stat(ST_COINS_BONUS);

    int n = e.type == EnemyType::Boss ? 30 : 8;
    for (int i = 0; i < n; i++) {
        float a = rand01() * 6.2832f;
        float s = 30.f + rand01() * 110.f;
        float life = 0.35f + rand01() * 0.4f;
        particles.push_back({e.pos, {std::cos(a) * s, std::sin(a) * s}, life, life, 2.f + rand01() * 3.f, e.type});
    }
}

void Battle::hitEnemy(Enemy& e, Projectile& p) {
    double bonus = 1.0 + stat(ST_DMG_PER_METER) * (p.traveled / PIXELS_PER_METER);
    damageEnemy(e, p.damage * bonus);

    if (e.alive && rand01() < stat(ST_KNOCKBACK_CHANCE)) {
        float force = (float)stat(ST_KNOCKBACK_FORCE);
        if (e.type == EnemyType::Boss) force *= 0.2f;
        else if (e.type == EnemyType::Tank) force *= 0.5f;
        e.pos += (e.pos - center()).norm() * force;
    }

    p.lastHitId = e.id;
    if (p.bouncesLeft > 0) {
        if (Enemy* next = nearestEnemy(e.pos, BOUNCE_RANGE, e.id)) {
            p.bouncesLeft--;
            p.targetId = next->id;
            p.vel = (next->pos - p.pos).norm() * PROJECTILE_SPEED;
            return;
        }
    }
    p.alive = false;
}

void Battle::update(float dt) {
    if (gameOver) return;
    elapsed += dt;
    towerSpin += dt * 60.f;
    towerFlash = std::max(0.f, towerFlash - dt);

    double maxHp = stat(ST_HEALTH);
    hp = std::min(maxHp, hp + stat(ST_REGEN) * dt);

    // --- waves ---
    waveTimer += dt;
    if (waveTimer >= WAVE_TIME) {
        cash += stat(ST_CASH_PER_WAVE);
        coinsEarned += stat(ST_COINS_PER_WAVE);
        double interestCap = 25.0 * wave * CashScale(wave, tier);
        cash += std::min(cash * stat(ST_INTEREST), interestCap);
        wave++;
        startWave();
    }

    // --- spawning ---
    float interval = std::max(0.18f, 1.1f * std::pow(0.985f, (float)(wave - 1)));
    spawnTimer_ -= dt;
    while (spawnTimer_ <= 0) {
        spawnTimer_ += interval;
        float r = rand01();
        float pFast = wave >= 3 ? std::min(0.25f, 0.05f + 0.01f * wave) : 0.f;
        float pTank = wave >= 8 ? std::min(0.15f, 0.02f + 0.004f * wave) : 0.f;
        float pRanged = wave >= 12 ? std::min(0.15f, 0.02f + 0.004f * wave) : 0.f;
        EnemyType t = EnemyType::Basic;
        if (r < pFast) t = EnemyType::Fast;
        else if (r < pFast + pTank) t = EnemyType::Tank;
        else if (r < pFast + pTank + pRanged) t = EnemyType::Ranged;
        spawnEnemy(t);
    }

    // --- enemies ---
    Vec2 c = center();
    for (auto& e : enemies) {
        if (!e.alive) continue;
        e.flash = std::max(0.f, e.flash - dt);
        e.spin += dt * (e.type == EnemyType::Fast ? 240.f : 60.f);
        Vec2 toTower = c - e.pos;
        float d = toTower.len();

        if (e.type == EnemyType::Ranged) {
            if (d > e.stopDist) {
                e.pos += toTower.norm() * (e.speed * dt);
            } else {
                e.attackTimer -= dt;
                if (e.attackTimer <= 0) {
                    e.attackTimer = RANGED_INTERVAL;
                    Projectile p;
                    p.pos = e.pos;
                    p.vel = toTower.norm() * ENEMY_SHOT_SPEED;
                    p.damage = e.damage;
                    p.hostile = true;
                    projectiles.push_back(p);
                }
            }
            continue;
        }

        float contact = TOWER_RADIUS + e.radius;
        if (d > contact) {
            float step = std::min(e.speed * dt, d - contact);
            e.pos += toTower.norm() * step;
        } else {
            e.attackTimer -= dt;
            if (e.attackTimer <= 0) {
                e.attackTimer = MELEE_INTERVAL;
                damageTower(e.damage);
                if (stat(ST_THORNS) > 0) damageEnemy(e, e.maxHp * stat(ST_THORNS));
                if (gameOver) return;
            }
        }
    }

    // --- tower shooting ---
    attackCooldown_ -= dt;
    Enemy* target = nearestEnemy(c, (float)stat(ST_RANGE));
    if (!target) {
        attackCooldown_ = std::max(attackCooldown_, 0.f);
    } else {
        while (attackCooldown_ <= 0) {
            attackCooldown_ += 1.f / (float)stat(ST_ATTACK_SPEED);
            fireAt(*target);
        }
    }

    // --- projectiles ---
    for (size_t i = 0; i < projectiles.size(); i++) {
        Projectile& p = projectiles[i];
        if (!p.alive) continue;
        if (p.hostile) {
            p.pos += p.vel * dt;
            if (Dist(p.pos, c) <= TOWER_RADIUS) {
                p.alive = false;
                damageTower(p.damage);
                if (gameOver) return;
            }
            continue;
        }
        if (Enemy* t = findEnemy(p.targetId)) p.vel = (t->pos - p.pos).norm() * PROJECTILE_SPEED;
        Vec2 step = p.vel * dt;
        p.pos += step;
        p.traveled += step.len();
        for (auto& e : enemies) {
            if (!e.alive || e.id == p.lastHitId) continue;
            if (Dist(p.pos, e.pos) <= e.radius + 4.f) {
                hitEnemy(e, p);
                break;
            }
        }
        if (p.pos.x < -60 || p.pos.y < -60 || p.pos.x > FIELD_W + 60 || p.pos.y > FIELD_H + 60) p.alive = false;
    }

    // --- particles ---
    for (auto& pt : particles) {
        pt.life -= dt;
        pt.pos += pt.vel * dt;
        pt.vel = pt.vel * (1.f - 2.5f * dt);
    }

    // --- cleanup ---
    enemies.erase(std::remove_if(enemies.begin(), enemies.end(), [](const Enemy& e) { return !e.alive; }), enemies.end());
    projectiles.erase(std::remove_if(projectiles.begin(), projectiles.end(), [](const Projectile& p) { return !p.alive; }),
                      projectiles.end());
    particles.erase(std::remove_if(particles.begin(), particles.end(), [](const Particle& p) { return p.life <= 0; }),
                    particles.end());
}
