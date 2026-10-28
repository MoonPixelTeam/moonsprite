#pragma once
#include "document.h"
namespace moon {
std::vector<Pixel> decodeAsePaletteColors(const std::vector<std::uint8_t>& bytes);
std::vector<Pixel> decodeAcoPaletteColors(const std::vector<std::uint8_t>& bytes);
}
