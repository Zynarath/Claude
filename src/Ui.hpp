#pragma once
#include <string>

#include "Stats.hpp"
#include "raylib.h"

constexpr int SCREEN_W = 1280;
constexpr int SCREEN_H = 720;

namespace pal {
inline const Color Bg = {12, 14, 24, 255};
inline const Color Panel = {22, 26, 42, 255};
inline const Color Card = {32, 38, 60, 255};
inline const Color CardHover = {44, 52, 82, 255};
inline const Color Text = {225, 230, 245, 255};
inline const Color Dim = {130, 140, 170, 255};
inline const Color Accent = {80, 220, 255, 255};
inline const Color Cash = {120, 230, 120, 255};
inline const Color Coin = {255, 205, 70, 255};
inline const Color Danger = {255, 85, 95, 255};
inline const Color Attack = {255, 120, 90, 255};
inline const Color Defense = {90, 170, 255, 255};
inline const Color Utility = {190, 130, 255, 255};
}  // namespace pal

// "1.23K", "45.6M", ... Values below 1000 are shown with `smallDecimals` decimals.
std::string FormatNum(double v, int smallDecimals = 0);
std::string FormatStatValue(StatId id, double v);
Color CategoryColor(Category c);
const char* CategoryName(Category c);

void DrawTextCentered(const char* text, float cx, float y, int size, Color c);
void DrawTextRight(const char* text, float rx, float y, int size, Color c);

bool Hovered(Rectangle r);
bool Clicked(Rectangle r);
bool Button(Rectangle r, const char* label, bool enabled = true, int fontSize = 20, Color accent = pal::Accent);

// Upgrade card used by both the in-run panel and the workshop.
// Returns true when clicked while affordable.
bool UpgradeCard(Rectangle r, StatId id, double currentValue, int level, const BulkBuy& quote, bool coins);
