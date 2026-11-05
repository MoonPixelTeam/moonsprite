#pragma once
#include <cstdint>
#include <filesystem>
#include <vector>
namespace moon {
// Existing image/export atomic writer shared with native binary storage.
// Windows IO failures preserve the native error code as std::system_error and
// identify both temporary/source and final target paths. No replacement retry.
// Empty binary files are allowed; format-specific callers validate their data.
void writeBinaryFileAtomic(const std::filesystem::path&,const std::vector<std::uint8_t>&);
}
