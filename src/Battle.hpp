#pragma once
// Game simulation for a single run. Has no rendering or windowing dependencies so it
// can also be driven headlessly (see tools/balance_sim.cpp).
#include <cmath>
#include <cstdint>
#include <random>
#include <vector>

#include "Stats.hpp"

struct Vec2 {
    float x = 0, y = 0;
    Vec2() = default;
    Vec2(float x_, float y_) : x(x_), y(y_) {}
    Vec2 operator+(Vec2 o) const { return {x + o.x, y + o.y}; }
    Vec2 operator-(Vec2 o) const { return {x - o.x, y - o.y}; }
    Vec2 operator*(float s) const { return {x * s, y * s}; }
    Vec2& operator+=(Vec2 o) { x += o.x; y += o.y; return *this; }
    float len() const { return std::sqrt(x * x + y * y); }
    Vec2 norm() const { float l = len(); return l > 1e-6f ? Vec2{x / l, y / l} : Vec2{0, 0}; }
};
inline float Dist(Vec2 a, Vec2 b) { return (a - b).len(); }

constexpr float FIELD_W = 720.0f;
constexpr float FIELD_H = 720.0f;
constexpr float TOWER_RADIUS = 22.0f;
constexpr float WAVE_TIME = 26.0f;
constexpr int TIER_UNLOCK_WAVE = 30;  // reach this wave on tier N to unlock tier N+1
constexpr int MAX_TIER = 10;

enum class EnemyType { Basic, Fast, Tank, Ranged, Boss, Count };

struct Enemy {
    uint32_t id;
    EnemyType type;
    Vec2 pos;
    float radius, speed;
    double hp, maxHp, damage;
    double cash, coins;
    float attackTimer = 0;
    float stopDist = 0;  // ranged enemies stop at this distance from the tower
    float flash = 0;     // hit flash timer (visual)
    float spin = 0;      // rotation (visual)
    bool alive = true;
};

struct Projectile {
    Vec2 pos, vel;
    uint32_t targetId = 0;
    uint32_t lastHitId = 0;
    double damage = 0;
    float traveled = 0;
    int bouncesLeft = 0;
    bool crit = false;
    bool hostile = false;  // fired by an enemy at the tower
    bool alive = true;
};

struct Particle {
    Vec2 pos, vel;
    float life, maxLife, size;
    EnemyType type;
};

class Battle {
public:
    Battle(const Levels& workshop, int tier, uint32_t seed = std::random_device{}());

    void update(float dt);

    // Upgrades bought with in-run cash. want < 0 = buy max.
    BulkBuy quote(StatId id, int want) const;
    bool buy(StatId id, int want);

    double stat(StatId id) const { return STATS[id].value(workshop_[id] + run_[id]); }
    int runLevel(StatId id) const { return run_[id]; }
    int workshopLevel(StatId id) const { return workshop_[id]; }
    int totalLevel(StatId id) const { return workshop_[id] + run_[id]; }

    Vec2 center() const { return {FIELD_W / 2, FIELD_H / 2}; }

    // State exposed for rendering / HUD
    std::vector<Enemy> enemies;
    std::vector<Projectile> projectiles;
    std::vector<Particle> particles;
    int tier;
    int wave = 1;
    float waveTimer = 0;
    double cash = 0;
    double hp = 0;
    double coinsEarned = 0;
    double cashEarned = 0;
    double damageDealt = 0;
    int kills = 0;
    float elapsed = 0;
    float towerSpin = 0;
    float towerFlash = 0;
    bool gameOver = false;

private:
    void startWave();
    void spawnEnemy(EnemyType type);
    void fireAt(const Enemy& target);
    void fireProjectile(const Enemy& target, double damage, bool crit);
    void hitEnemy(Enemy& e, Projectile& p);
    void damageEnemy(Enemy& e, double dmg);
    void killEnemy(Enemy& e);
    void damageTower(double raw);
    Enemy* findEnemy(uint32_t id);
    Enemy* nearestEnemy(Vec2 from, float maxDist, uint32_t exclude = 0);

    float rand01() { return std::uniform_real_distribution<float>(0.f, 1.f)(rng_); }

    Levels workshop_;
    Levels run_{};
    std::mt19937 rng_;
    float spawnTimer_ = 0;
    float attackCooldown_ = 0;
    uint32_t nextId_ = 1;
};

// Wave-based scaling shared by the game and the UI.
double EnemyHpScale(int wave, int tier);
double EnemyDamageScale(int wave, int tier);
double CashScale(int wave, int tier);
double CoinScale(int wave, int tier);
