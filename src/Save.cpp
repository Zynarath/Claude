#include "Save.hpp"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>

bool LoadSave(const std::string& path, SaveData& out) {
    std::ifstream in(path);
    if (!in) return false;
    std::string line;
    while (std::getline(in, line)) {
        auto eq = line.find('=');
        if (eq == std::string::npos) continue;
        std::string key = line.substr(0, eq);
        std::string val = line.substr(eq + 1);
        const char* v = val.c_str();

        if (key == "coins") out.coins = std::max(0.0, std::atof(v));
        else if (key == "selected_tier") out.selectedTier = std::atoi(v);
        else if (key == "max_tier") out.maxTier = std::atoi(v);
        else if (key == "total_kills") out.totalKills = std::atoll(v);
        else if (key == "runs") out.runs = std::atoi(v);
        else if (key.rfind("best_", 0) == 0) {
            int t = std::atoi(key.c_str() + 5);
            if (t >= 1 && t <= MAX_TIER) out.bestWave[t] = std::atoi(v);
        } else if (key.rfind("ws_", 0) == 0) {
            std::string k = key.substr(3);
            for (int i = 0; i < ST_COUNT; i++)
                if (k == STATS[i].key) out.workshop[i] = std::clamp(std::atoi(v), 0, STATS[i].maxLevel);
        }
    }
    out.maxTier = std::clamp(out.maxTier, 1, MAX_TIER);
    out.selectedTier = std::clamp(out.selectedTier, 1, out.maxTier);
    return true;
}

bool WriteSave(const std::string& path, const SaveData& d) {
    std::string tmp = path + ".tmp";
    {
        std::ofstream o(tmp, std::ios::trunc);
        if (!o) return false;
        o.precision(17);
        o << "coins=" << d.coins << "\n";
        o << "selected_tier=" << d.selectedTier << "\n";
        o << "max_tier=" << d.maxTier << "\n";
        o << "total_kills=" << d.totalKills << "\n";
        o << "runs=" << d.runs << "\n";
        for (int t = 1; t <= MAX_TIER; t++)
            if (d.bestWave[t] > 0) o << "best_" << t << "=" << d.bestWave[t] << "\n";
        for (int i = 0; i < ST_COUNT; i++) o << "ws_" << STATS[i].key << "=" << d.workshop[i] << "\n";
        if (!o) return false;
    }
    std::remove(path.c_str());
    return std::rename(tmp.c_str(), path.c_str()) == 0;
}
