#pragma once
#include "palette_library.h"
namespace moon {
bool nativePalettePath(const std::filesystem::path& path);
bool supportedPaletteImportPath(const std::filesystem::path& path);
std::string externalPaletteId(const std::filesystem::path& path);
std::vector<std::uint8_t> readPaletteImportBytes(const std::filesystem::path& path);
StoredPalette decodeImportedPalette(const std::vector<std::uint8_t>& bytes,const std::filesystem::path& path);
}
