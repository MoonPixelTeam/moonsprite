#pragma once
#include <cstdint>
#include <optional>
#include <vector>
namespace moon {
// Physical screen pixels. LAF has already applied native origin and DPI scale.
std::optional<std::uint32_t> sampleScreenColor(int x,int y);
std::vector<std::uint32_t> sampleScreenColorRegion(int x,int y,int radius);
}
