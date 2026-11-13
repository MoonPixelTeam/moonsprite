#pragma once
#include <filesystem>

namespace os { class Surface; }
namespace moon {
// Shared diagnostic capture of the physical framebuffer; no Editor state.
void writeSmokeFrame(os::Surface* surface,const std::filesystem::path& path);
}
