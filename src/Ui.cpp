#include "Ui.hpp"

#include <cmath>
#include <cstdio>

std::string FormatNum(double v, int smallDecimals) {
    static const char* SUFFIX[] = {"", "K", "M", "B", "T", "q", "Q", "s", "S", "O", "N", "D"};
    char buf[64];
    double a = std::fabs(v);
    if (a < 1000.0) {
        std::snprintf(buf, sizeof buf, "%.*f", smallDecimals, v);
        return buf;
    }
    int idx = 0;
    while (a >= 1000.0 && idx < 11) {
        a /= 1000.0;
        v /= 1000.0;
        idx++;
    }
    if (a >= 1000.0) {
        std::snprintf(buf, sizeof buf, "%.2e", v * std::pow(1000.0, idx));
        return buf;
    }
    std::snprintf(buf, sizeof buf, a < 100 ? "%.2f%s" : "%.1f%s", v, SUFFIX[idx]);
    return buf;
}

std::string FormatStatValue(StatId id, double v) {
    char buf[64];
    switch (STATS[id].fmt) {
        case Fmt::Number: return FormatNum(v, v < 100 && v != std::floor(v) ? 1 : 0);
        case Fmt::Decimal: return FormatNum(v, 2);
        case Fmt::PerSecond: return FormatNum(v, 2) + "/s";
        case Fmt::Percent: std::snprintf(buf, sizeof buf, "%.1f%%", v * 100.0); return buf;
        case Fmt::Percent2: std::snprintf(buf, sizeof buf, "%.2f%%", v * 100.0); return buf;
        case Fmt::Multiplier: std::snprintf(buf, sizeof buf, "x%.2f", v); return buf;
    }
    return "?";
}

Color CategoryColor(Category c) {
    switch (c) {
        case Category::Attack: return pal::Attack;
        case Category::Defense: return pal::Defense;
        default: return pal::Utility;
    }
}

const char* CategoryName(Category c) {
    switch (c) {
        case Category::Attack: return "ATTACK";
        case Category::Defense: return "DEFENSE";
        default: return "UTILITY";
    }
}

void DrawTextCentered(const char* text, float cx, float y, int size, Color c) {
    DrawText(text, (int)(cx - MeasureText(text, size) / 2.f), (int)y, size, c);
}

void DrawTextRight(const char* text, float rx, float y, int size, Color c) {
    DrawText(text, (int)(rx - MeasureText(text, size)), (int)y, size, c);
}

bool Hovered(Rectangle r) { return CheckCollisionPointRec(GetMousePosition(), r); }

bool Clicked(Rectangle r) { return Hovered(r) && IsMouseButtonPressed(MOUSE_BUTTON_LEFT); }

bool Button(Rectangle r, const char* label, bool enabled, int fontSize, Color accent) {
    bool hover = enabled && Hovered(r);
    Color fill = hover ? pal::CardHover : pal::Card;
    DrawRectangleRounded(r, 0.25f, 6, fill);
    DrawRectangleRoundedLinesEx(r, 0.25f, 6, 2.f, enabled ? accent : Fade(pal::Dim, 0.4f));
    DrawTextCentered(label, r.x + r.width / 2, r.y + (r.height - fontSize) / 2, fontSize, enabled ? pal::Text : pal::Dim);
    return hover && IsMouseButtonPressed(MOUSE_BUTTON_LEFT);
}

bool UpgradeCard(Rectangle r, StatId id, double currentValue, int level, const BulkBuy& q, bool coins) {
    const StatDef& s = STATS[id];
    bool maxed = q.count == 0;
    bool canBuy = !maxed && q.affordable;
    bool hover = Hovered(r);
    Color accent = CategoryColor(s.cat);

    DrawRectangleRounded(r, 0.18f, 6, hover && canBuy ? pal::CardHover : pal::Card);
    DrawRectangle((int)r.x, (int)(r.y + 8), 4, (int)(r.height - 16), accent);

    int nameSize = 18;
    while (nameSize > 12 && MeasureText(s.name, nameSize) > r.width - 130) nameSize--;
    DrawText(s.name, (int)r.x + 14, (int)r.y + 9 + (18 - nameSize) / 2, nameSize, pal::Text);
    DrawText(FormatStatValue(id, currentValue).c_str(), (int)r.x + 14, (int)(r.y + r.height - 30), 22, accent);
    char lv[32];
    std::snprintf(lv, sizeof lv, "Lv %d", level);
    DrawTextRight(lv, r.x + r.width - 116, r.y + r.height - 26, 14, pal::Dim);

    Rectangle cost = {r.x + r.width - 108, r.y + 8, 100, r.height - 16};
    Color costCol = coins ? pal::Coin : pal::Cash;
    DrawRectangleRounded(cost, 0.25f, 6, canBuy ? Fade(costCol, 0.18f) : Fade(BLACK, 0.25f));
    if (maxed) {
        DrawTextCentered("MAX", cost.x + cost.width / 2, cost.y + cost.height / 2 - 10, 20, pal::Dim);
    } else {
        std::string price = (coins ? "" : "$") + FormatNum(q.cost);
        int fs = MeasureText(price.c_str(), 20) > (int)cost.width - 8 ? 16 : 20;
        float cy = cost.y + cost.height / 2;
        if (q.count > 1) {
            char cnt[16];
            std::snprintf(cnt, sizeof cnt, "x%d", q.count);
            DrawTextCentered(cnt, cost.x + cost.width / 2, cy - 18, 14, pal::Dim);
            DrawTextCentered(price.c_str(), cost.x + cost.width / 2, cy - 2, fs, canBuy ? costCol : pal::Dim);
        } else {
            DrawTextCentered(price.c_str(), cost.x + cost.width / 2, cy - fs / 2.f, fs, canBuy ? costCol : pal::Dim);
        }
        if (coins) DrawCircle((int)(cost.x + 10), (int)(cost.y + 10), 4, canBuy ? pal::Coin : pal::Dim);
    }
    return canBuy && hover && IsMouseButtonPressed(MOUSE_BUTTON_LEFT);
}
