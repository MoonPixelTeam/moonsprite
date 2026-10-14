#pragma once
#include "pattern_fill.h"
#include <filesystem>
namespace moon {
PatternBrush decodeWebpPatternBrush(const std::filesystem::path& path);
}
