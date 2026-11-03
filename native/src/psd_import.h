#pragma once
#include "document.h"
#include <filesystem>
namespace moon {
// legacy core/psd.ts::decodePsd; PSD is an imported origin, never a ZIP source.
Document decodePsd(const std::vector<std::uint8_t>&,std::u32string name);
Document openPsd(const std::filesystem::path&);
}
