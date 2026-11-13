#pragma once
#include <cstdint>
#include <filesystem>
#include <vector>
namespace moon {
// Shared Windows atomic writer; image, project and recovery use the same
// lower commit protocol while retaining their own validation/backup policy.
// Windows IO failures preserve the native error code as std::system_error and
// identify both temporary/source and final target paths. No replacement retry.
// Empty binary files are allowed; format-specific callers validate their data.
void writeBinaryFileAtomic(const std::filesystem::path&,const std::vector<std::uint8_t>&);
}
