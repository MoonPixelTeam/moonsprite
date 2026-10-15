#pragma once
#include "layer_compositor.h"
#include <filesystem>
#include <string>
namespace moon::animationprefs {
struct Settings {OnionSkinSettings onion;bool skipDisabledFrames=true;};
Settings parse(const std::string& json);
std::string serialize(const Settings& settings);
Settings load(const std::filesystem::path& path,const std::filesystem::path& oldOnionPath);
void save(const std::filesystem::path& path,const Settings& settings);
}
