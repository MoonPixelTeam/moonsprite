#pragma once
#include "timeline_model.h"
#include <optional>
#include <string>
#include <vector>
namespace moon {
struct PaletteClipboardData {std::vector<timeline::Pixel> colors;int columns=0;std::vector<std::optional<std::size_t>> slots;};
// legacy components/palette-clipboard.ts: strict V1/V2 decode and JS channel rounding.
std::optional<PaletteClipboardData> parsePaletteClipboard(const std::string& text);
std::string encodePaletteClipboard(const PaletteClipboardData& data);
}
