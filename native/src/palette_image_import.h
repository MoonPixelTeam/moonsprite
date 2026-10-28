#pragma once
#include "document.h"
#include <filesystem>
namespace moon {
std::vector<Pixel> decodeImagePaletteColors(const std::vector<std::uint8_t>& bytes,const std::filesystem::path& path);
}
