// Tower — an idle tower-defense game inspired by "The Tower" (Google Play).
// Built with raylib. Logic lives in Battle.cpp; this file handles screens, input and drawing.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <memory>
#include <string>

#include "Battle.hpp"
#include "Save.hpp"
#include "Stats.hpp"
#include "Ui.hpp"
#include "raylib.h"

namespace {

enum class Screen { Menu, Workshop, Battle };

constexpr float PANEL_X = FIELD_W;  // battle field occupies the left 720x720
constexpr int BUY_MODES[] = {1, 5, 10, -1};
constexpr const char* BUY_LABELS[] = {"x1", "x5", "x10", "MAX"};
constexpr float SPEEDS[] = {1.f, 2.f, 3.f, 5.f};

struct App {
    Screen screen = Screen::Menu;
    SaveData save;
    std::string savePath;
    std::unique_ptr<Battle> battle;
    Category tab = Category::Attack;
    Category wsTab = Category::Attack;
    int buyMode = 0;
    int wsBuyMode = 0;
    int speedIdx = 0;
    bool paused = false;
    bool runBanked = false;
    bool newBest = false;
    bool quit = false;
    float menuTime = 0;
};

Color EnemyColor(EnemyType t) {
    switch (t) {
        case EnemyType::Basic: return {255, 80, 90, 255};
        case EnemyType::Fast: return {255, 220, 70, 255};
        case EnemyType::Tank: return {180, 90, 255, 255};
        case EnemyType::Ranged: return {80, 235, 140, 255};
        default: return {255, 140, 40, 255};
    }
}

Vector2 V(Vec2 v) { return {v.x, v.y}; }

void Persist(App& app) {
    if (!WriteSave(app.savePath, app.save)) TraceLog(LOG_WARNING, "Could not write save file %s", app.savePath.c_str());
}

// Moves the run's rewards into the save. Safe to call more than once per run.
void BankRun(App& app) {
    if (!app.battle || app.runBanked) return;
    Battle& b = *app.battle;
    app.runBanked = true;
    app.save.coins += std::floor(b.coinsEarned);
    app.save.totalKills += b.kills;
    app.save.runs++;
    int& best = app.save.bestWave[b.tier];
    app.newBest = b.wave > best;
    best = std::max(best, b.wave);
    if (b.tier == app.save.maxTier && b.wave >= TIER_UNLOCK_WAVE && app.save.maxTier < MAX_TIER) app.save.maxTier++;
    Persist(app);
}

void StartBattle(App& app) {
    app.battle = std::make_unique<Battle>(app.save.workshop, app.save.selectedTier);
    app.runBanked = false;
    app.newBest = false;
    app.paused = false;
    app.screen = Screen::Battle;
}

// ---------------------------------------------------------------- drawing: battle field

void DrawEnemy(const Enemy& e) {
    Color c = e.flash > 0 ? WHITE : EnemyColor(e.type);
    Vector2 p = V(e.pos);
    float r = e.radius;
    switch (e.type) {
        case EnemyType::Basic:
            DrawRectanglePro({p.x, p.y, r * 2, r * 2}, {r, r}, e.spin, c);
            break;
        case EnemyType::Fast:
            DrawPoly(p, 3, r * 1.3f, e.spin, c);
            break;
        case EnemyType::Tank:
            DrawRectanglePro({p.x, p.y, r * 2, r * 2}, {r, r}, e.spin * 0.5f, c);
            DrawRectanglePro({p.x, p.y, r * 1.1f, r * 1.1f}, {r * 0.55f, r * 0.55f}, e.spin * 0.5f, Fade(BLACK, 0.35f));
            break;
        case EnemyType::Ranged:
            DrawPoly(p, 4, r * 1.3f, e.spin, c);
            DrawCircleV(p, r * 0.35f, Fade(BLACK, 0.5f));
            break;
        default:
            DrawPoly(p, 6, r, e.spin, c);
            DrawPolyLinesEx(p, 6, r + 5, -e.spin, 2.f, Fade(c, 0.6f));
            break;
    }
    if (e.hp < e.maxHp && (e.type == EnemyType::Tank || e.type == EnemyType::Boss)) {
        float w = r * 2.4f;
        DrawRectangle((int)(p.x - w / 2), (int)(p.y - r - 10), (int)w, 4, Fade(BLACK, 0.6f));
        DrawRectangle((int)(p.x - w / 2), (int)(p.y - r - 10), (int)(w * (float)(e.hp / e.maxHp)), 4, pal::Danger);
    }
}

void DrawField(const Battle& b) {
    DrawRectangle(0, 0, (int)FIELD_W, (int)FIELD_H, pal::Bg);
    for (int i = 0; i <= (int)FIELD_W; i += 40) {
        DrawLine(i, 0, i, (int)FIELD_H, Fade(pal::Accent, 0.04f));
        DrawLine(0, i, (int)FIELD_W, i, Fade(pal::Accent, 0.04f));
    }

    Vector2 c = V(b.center());
    float range = (float)b.stat(ST_RANGE);
    DrawCircleV(c, range, Fade(pal::Accent, 0.04f));
    DrawCircleLinesV(c, range, Fade(pal::Accent, 0.35f));

    for (const auto& pt : b.particles) {
        Color col = Fade(EnemyColor(pt.type), pt.life / pt.maxLife);
        DrawRectangleV({pt.pos.x - pt.size / 2, pt.pos.y - pt.size / 2}, {pt.size, pt.size}, col);
    }
    for (const auto& e : b.enemies) DrawEnemy(e);
    for (const auto& p : b.projectiles) {
        if (p.hostile) {
            DrawCircleV(V(p.pos), 4.f, pal::Danger);
        } else {
            Vec2 tail = p.pos - p.vel.norm() * 10.f;
            Color col = p.crit ? Color{255, 170, 60, 255} : pal::Accent;
            DrawLineEx(V(tail), V(p.pos), p.crit ? 4.f : 2.5f, Fade(col, 0.5f));
            DrawCircleV(V(p.pos), p.crit ? 4.5f : 3.f, col);
        }
    }

    // Tower
    Color tc = b.towerFlash > 0 ? pal::Danger : pal::Accent;
    DrawCircleV(c, TOWER_RADIUS + 6, Fade(tc, 0.15f));
    DrawCircleV(c, TOWER_RADIUS, {20, 30, 50, 255});
    DrawCircleLinesV(c, TOWER_RADIUS, tc);
    DrawPoly(c, 4, TOWER_RADIUS * 0.75f, b.towerSpin, tc);
    DrawPoly(c, 4, TOWER_RADIUS * 0.45f, -b.towerSpin * 1.5f, {20, 30, 50, 255});

    // Health bar under the tower
    float w = 120;
    float frac = (float)std::clamp(b.hp / b.stat(ST_HEALTH), 0.0, 1.0);
    Rectangle bar = {c.x - w / 2, c.y + TOWER_RADIUS + 14, w, 12};
    DrawRectangleRec(bar, Fade(BLACK, 0.6f));
    DrawRectangleRec({bar.x, bar.y, bar.width * frac, bar.height}, frac > 0.3f ? pal::Cash : pal::Danger);
    std::string hpText = FormatStatValue(ST_HEALTH, b.hp) + " / " + FormatStatValue(ST_HEALTH, b.stat(ST_HEALTH));
    DrawTextCentered(hpText.c_str(), c.x, bar.y + 15, 14, pal::Text);
}

// ---------------------------------------------------------------- battle screen

void DrawRunOverlay(App& app) {
    Battle& b = *app.battle;
    DrawRectangle(0, 0, SCREEN_W, SCREEN_H, Fade(BLACK, 0.65f));
    Rectangle box = {SCREEN_W / 2.f - 230, 140, 460, 420};
    DrawRectangleRounded(box, 0.08f, 8, pal::Panel);
    DrawRectangleRoundedLinesEx(box, 0.08f, 8, 2.f, b.gameOver ? pal::Danger : pal::Accent);

    float cx = box.x + box.width / 2;
    if (b.gameOver) {
        DrawTextCentered("TOWER DESTROYED", cx, box.y + 26, 36, pal::Danger);
    } else {
        DrawTextCentered("PAUSED", cx, box.y + 26, 40, pal::Accent);
    }

    char line[128];
    float y = box.y + 90;
    auto row = [&](const char* label, const std::string& value, Color col) {
        DrawText(label, (int)box.x + 50, (int)y, 22, pal::Dim);
        DrawTextRight(value.c_str(), box.x + box.width - 50, y, 22, col);
        y += 34;
    };
    std::snprintf(line, sizeof line, "%d", b.wave);
    row("Wave reached", line, pal::Text);
    std::snprintf(line, sizeof line, "%d", b.kills);
    row("Enemies killed", line, pal::Text);
    row("Damage dealt", FormatNum(b.damageDealt), pal::Text);
    row("Cash earned", "$" + FormatNum(b.cashEarned), pal::Cash);
    row("Coins earned", FormatNum(std::floor(b.coinsEarned)), pal::Coin);
    int mins = (int)b.elapsed / 60, secs = (int)b.elapsed % 60;
    std::snprintf(line, sizeof line, "%d:%02d", mins, secs);
    row("Game time", line, pal::Text);
    if (b.gameOver && app.newBest) DrawTextCentered("NEW BEST WAVE!", cx, y + 4, 22, pal::Coin);

    float by = box.y + box.height - 70;
    if (b.gameOver) {
        if (Button({box.x + 40, by, 180, 48}, "Retry")) StartBattle(app);
        if (Button({box.x + box.width - 220, by, 180, 48}, "Menu")) {
            app.battle.reset();
            app.screen = Screen::Menu;
        }
    } else {
        if (Button({box.x + 40, by, 180, 48}, "Resume")) app.paused = false;
        if (Button({box.x + box.width - 220, by, 180, 48}, "End Run", true, 20, pal::Danger)) {
            BankRun(app);
            app.battle.reset();
            app.screen = Screen::Menu;
        }
    }
}

void UpdateDrawBattle(App& app) {
    Battle& b = *app.battle;

    if (IsKeyPressed(KEY_ESCAPE) || IsKeyPressed(KEY_P)) app.paused = !app.paused;
    if (IsKeyPressed(KEY_SPACE)) app.speedIdx = (app.speedIdx + 1) % 4;
    if (IsKeyPressed(KEY_ONE)) app.tab = Category::Attack;
    if (IsKeyPressed(KEY_TWO)) app.tab = Category::Defense;
    if (IsKeyPressed(KEY_THREE)) app.tab = Category::Utility;
    if (IsKeyPressed(KEY_TAB)) app.buyMode = (app.buyMode + 1) % 4;

    if (!app.paused && !b.gameOver) {
        // Fixed-size sub-steps keep collisions stable at high game speed.
        float total = std::min(GetFrameTime(), 0.1f) * SPEEDS[app.speedIdx];
        int steps = std::max(1, (int)std::ceil(total / (1.f / 120.f)));
        for (int i = 0; i < steps && !b.gameOver; i++) b.update(total / steps);
    }
    if (b.gameOver) BankRun(app);

    DrawField(b);

    // ---- right panel
    DrawRectangle((int)PANEL_X, 0, SCREEN_W - (int)PANEL_X, SCREEN_H, pal::Panel);
    float px = PANEL_X + 16, pw = SCREEN_W - PANEL_X - 32;
    char buf[128];

    std::snprintf(buf, sizeof buf, "Tier %d  -  Wave %d", b.tier, b.wave);
    DrawText(buf, (int)px, 14, 26, pal::Text);
    float wf = b.waveTimer / WAVE_TIME;
    DrawRectangle((int)px, 46, (int)pw, 6, Fade(BLACK, 0.5f));
    DrawRectangle((int)px, 46, (int)(pw * wf), 6, pal::Accent);

    DrawText(("$" + FormatNum(b.cash)).c_str(), (int)px, 64, 30, pal::Cash);
    std::string coins = FormatNum(std::floor(b.coinsEarned));
    DrawCircle((int)(px + pw - MeasureText(coins.c_str(), 24) - 14), 76, 8, pal::Coin);
    DrawTextRight(coins.c_str(), px + pw, 65, 24, pal::Coin);

    std::snprintf(buf, sizeof buf, "DMG %s   SPD %s   RNG %s", FormatNum(b.stat(ST_DAMAGE), 1).c_str(),
                  FormatStatValue(ST_ATTACK_SPEED, b.stat(ST_ATTACK_SPEED)).c_str(),
                  FormatNum(b.stat(ST_RANGE)).c_str());
    DrawText(buf, (int)px, 104, 16, pal::Dim);
    std::snprintf(buf, sizeof buf, "Kills %d   Enemies %d", b.kills, (int)b.enemies.size());
    DrawText(buf, (int)px, 124, 16, pal::Dim);

    // speed / pause buttons
    std::snprintf(buf, sizeof buf, "%gx", SPEEDS[app.speedIdx]);
    if (Button({px + pw - 150, 104, 70, 34}, buf, true, 18)) app.speedIdx = (app.speedIdx + 1) % 4;
    if (Button({px + pw - 70, 104, 70, 34}, "II", true, 18)) app.paused = true;

    // tabs
    const Category cats[] = {Category::Attack, Category::Defense, Category::Utility};
    float tabW = (pw - 90) / 3;
    for (int i = 0; i < 3; i++) {
        Rectangle r = {px + i * (tabW + 6), 152, tabW - 6, 38};
        bool active = app.tab == cats[i];
        DrawRectangleRounded(r, 0.25f, 6, active ? Fade(CategoryColor(cats[i]), 0.3f) : pal::Card);
        DrawTextCentered(CategoryName(cats[i]), r.x + r.width / 2, r.y + 10, 18,
                         active ? CategoryColor(cats[i]) : pal::Dim);
        if (Clicked(r)) app.tab = cats[i];
    }
    if (Button({px + pw - 84, 152, 84, 38}, BUY_LABELS[app.buyMode], true, 18, pal::Cash))
        app.buyMode = (app.buyMode + 1) % 4;

    // upgrade cards (2 columns)
    float cardW = (pw - 10) / 2, cardH = 66;
    int n = 0;
    for (int i = 0; i < ST_COUNT; i++) {
        if (STATS[i].cat != app.tab) continue;
        StatId id = (StatId)i;
        Rectangle r = {px + (n % 2) * (cardW + 10), 204 + (n / 2) * (cardH + 8), cardW, cardH};
        BulkBuy q = b.quote(id, BUY_MODES[app.buyMode]);
        if (UpgradeCard(r, id, b.stat(id), b.totalLevel(id), q, false) && !app.paused) b.buy(id, BUY_MODES[app.buyMode]);
        n++;
    }

    DrawText("[Space] speed  [Esc] pause  [1-3] tabs  [Tab] buy amount", (int)px, SCREEN_H - 24, 14, Fade(pal::Dim, 0.8f));

    if (app.paused || b.gameOver) DrawRunOverlay(app);
}

// ---------------------------------------------------------------- menu & workshop

void UpdateDrawMenu(App& app) {
    app.menuTime += GetFrameTime();
    ClearBackground(pal::Bg);
    for (int i = 0; i <= SCREEN_W; i += 40) DrawLine(i, 0, i, SCREEN_H, Fade(pal::Accent, 0.04f));
    for (int i = 0; i <= SCREEN_H; i += 40) DrawLine(0, i, SCREEN_W, i, Fade(pal::Accent, 0.04f));

    // decorative tower
    Vector2 c = {SCREEN_W / 2.f, 190};
    float t = app.menuTime;
    DrawCircleLinesV(c, 90 + 6 * std::sin(t * 2), Fade(pal::Accent, 0.3f));
    for (int i = 0; i < 6; i++) {
        float a = t * 0.6f + i * 1.047f;
        DrawPoly({c.x + std::cos(a) * 125, c.y + std::sin(a) * 105}, 4, 9, t * 90, EnemyColor((EnemyType)(i % 5)));
    }
    DrawCircleV(c, 40, {20, 30, 50, 255});
    DrawCircleLinesV(c, 40, pal::Accent);
    DrawPoly(c, 4, 30, t * 60, pal::Accent);
    DrawPoly(c, 4, 18, -t * 90, {20, 30, 50, 255});

    DrawTextCentered("THE TOWER", SCREEN_W / 2.f, 310, 64, pal::Text);
    DrawTextCentered("idle tower defense", SCREEN_W / 2.f, 378, 20, pal::Dim);

    std::string coins = FormatNum(app.save.coins);
    DrawCircle(SCREEN_W - 40 - MeasureText(coins.c_str(), 28) - 16, 36, 10, pal::Coin);
    DrawTextRight(coins.c_str(), SCREEN_W - 30, 22, 28, pal::Coin);

    // tier selector
    float cx = SCREEN_W / 2.f;
    char buf[96];
    std::snprintf(buf, sizeof buf, "Tier %d", app.save.selectedTier);
    DrawTextCentered(buf, cx, 422, 30, pal::Accent);
    if (Button({cx - 150, 418, 44, 40}, "<", app.save.selectedTier > 1)) app.save.selectedTier--;
    if (Button({cx + 106, 418, 44, 40}, ">", app.save.selectedTier < app.save.maxTier)) app.save.selectedTier++;
    int best = app.save.bestWave[app.save.selectedTier];
    if (app.save.selectedTier == app.save.maxTier && app.save.maxTier < MAX_TIER)
        std::snprintf(buf, sizeof buf, "Best wave: %d   (reach wave %d to unlock Tier %d)", best, TIER_UNLOCK_WAVE,
                      app.save.maxTier + 1);
    else
        std::snprintf(buf, sizeof buf, "Best wave: %d", best);
    DrawTextCentered(buf, cx, 464, 18, pal::Dim);

    if (Button({cx - 150, 500, 300, 56}, "BATTLE", true, 28) || IsKeyPressed(KEY_ENTER)) StartBattle(app);
    if (Button({cx - 150, 568, 300, 48}, "Workshop", true, 22, pal::Coin)) app.screen = Screen::Workshop;
    if (Button({cx - 150, 628, 300, 44}, "Quit", true, 20, pal::Danger)) app.quit = true;

    std::snprintf(buf, sizeof buf, "Runs: %d   Total kills: %lld", app.save.runs, app.save.totalKills);
    DrawText(buf, 20, SCREEN_H - 28, 16, pal::Dim);
}

void UpdateDrawWorkshop(App& app) {
    ClearBackground(pal::Bg);
    if (IsKeyPressed(KEY_ESCAPE)) app.screen = Screen::Menu;
    if (IsKeyPressed(KEY_ONE)) app.wsTab = Category::Attack;
    if (IsKeyPressed(KEY_TWO)) app.wsTab = Category::Defense;
    if (IsKeyPressed(KEY_THREE)) app.wsTab = Category::Utility;
    if (IsKeyPressed(KEY_TAB)) app.wsBuyMode = (app.wsBuyMode + 1) % 4;

    DrawText("WORKSHOP", 30, 22, 40, pal::Text);
    DrawText("Permanent upgrades bought with coins. They raise your starting stats every run.", 30, 68, 18, pal::Dim);
    std::string coins = FormatNum(app.save.coins);
    DrawCircle(SCREEN_W - 40 - MeasureText(coins.c_str(), 30) - 16, 38, 11, pal::Coin);
    DrawTextRight(coins.c_str(), SCREEN_W - 30, 24, 30, pal::Coin);

    const Category cats[] = {Category::Attack, Category::Defense, Category::Utility};
    for (int i = 0; i < 3; i++) {
        Rectangle r = {30.f + i * 190, 104, 180, 40};
        bool active = app.wsTab == cats[i];
        DrawRectangleRounded(r, 0.25f, 6, active ? Fade(CategoryColor(cats[i]), 0.3f) : pal::Card);
        DrawTextCentered(CategoryName(cats[i]), r.x + r.width / 2, r.y + 11, 18,
                         active ? CategoryColor(cats[i]) : pal::Dim);
        if (Clicked(r)) app.wsTab = cats[i];
    }
    if (Button({610, 104, 90, 40}, BUY_LABELS[app.wsBuyMode], true, 18, pal::Coin))
        app.wsBuyMode = (app.wsBuyMode + 1) % 4;

    float cardW = 296, cardH = 70;
    int n = 0;
    for (int i = 0; i < ST_COUNT; i++) {
        if (STATS[i].cat != app.wsTab) continue;
        StatId id = (StatId)i;
        Rectangle r = {30 + (n % 4) * (cardW + 10), 164 + (n / 4) * (cardH + 10), cardW, cardH};
        int lvl = app.save.workshop[id];
        BulkBuy q = ComputeBulk(id, lvl, 0, BUY_MODES[app.wsBuyMode], app.save.coins, true);
        if (UpgradeCard(r, id, STATS[id].value(lvl), lvl, q, true)) {
            app.save.coins -= q.cost;
            app.save.workshop[id] += q.count;
            Persist(app);
        }
        n++;
    }

    if (Button({30, SCREEN_H - 76, 200, 50}, "Back")) app.screen = Screen::Menu;
    if (Button({SCREEN_W - 230, SCREEN_H - 76, 200, 50}, "BATTLE", true, 24)) StartBattle(app);
}

}  // namespace

int main() {
    SetConfigFlags(FLAG_WINDOW_RESIZABLE | FLAG_VSYNC_HINT | FLAG_MSAA_4X_HINT);
    InitWindow(SCREEN_W, SCREEN_H, "The Tower");
    SetWindowMinSize(640, 360);
    SetExitKey(KEY_NULL);
    SetTargetFPS(144);

    App app;
    app.savePath = std::string(GetApplicationDirectory()) + "tower_save.txt";
    LoadSave(app.savePath, app.save);

    RenderTexture2D target = LoadRenderTexture(SCREEN_W, SCREEN_H);
    SetTextureFilter(target.texture, TEXTURE_FILTER_BILINEAR);

    while (!WindowShouldClose() && !app.quit) {
        // Letterbox the fixed 1280x720 canvas into the window and map the mouse to it.
        float scale = std::min(GetScreenWidth() / (float)SCREEN_W, GetScreenHeight() / (float)SCREEN_H);
        float ox = (GetScreenWidth() - SCREEN_W * scale) / 2, oy = (GetScreenHeight() - SCREEN_H * scale) / 2;
        SetMouseOffset((int)-ox, (int)-oy);
        SetMouseScale(1 / scale, 1 / scale);

        if (IsKeyPressed(KEY_F11)) ToggleBorderlessWindowed();

        BeginTextureMode(target);
        ClearBackground(pal::Bg);
        switch (app.screen) {
            case Screen::Menu: UpdateDrawMenu(app); break;
            case Screen::Workshop: UpdateDrawWorkshop(app); break;
            case Screen::Battle: UpdateDrawBattle(app); break;
        }
        EndTextureMode();

        BeginDrawing();
        ClearBackground(BLACK);
        DrawTexturePro(target.texture, {0, 0, (float)SCREEN_W, -(float)SCREEN_H},
                       {ox, oy, SCREEN_W * scale, SCREEN_H * scale}, {0, 0}, 0, WHITE);
        EndDrawing();
    }

    // Closing mid-run still keeps the coins earned so far.
    BankRun(app);
    Persist(app);
    UnloadRenderTexture(target);
    CloseWindow();
    return 0;
}
