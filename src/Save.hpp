#pragma once
#include <array>
#include <string>

#include "Battle.hpp"
#include "Stats.hpp"

// Persistent progress, stored as a simple key=value text file.
struct SaveData {
    double coins = 0;
    Levels workshop{};
    int selectedTier = 1;
    int maxTier = 1;
    std::array<int, MAX_TIER + 1> bestWave{};  // index = tier
    long long totalKills = 0;
    int runs = 0;
};

bool LoadSave(const std::string& path, SaveData& out);
bool WriteSave(const std::string& path, const SaveData& data);
