#pragma once
#include "timelapse.h"
#include <filesystem>
namespace moon::timelapse {
std::filesystem::path executableLibraryRoot();
Reference appendLibraryFrame(const std::filesystem::path& root,const std::string& store,const Bytes& png);
Bytes readLibraryFrame(const std::filesystem::path& root,const Reference& reference);
Bytes readLibraryFrameWithLegacy(const std::filesystem::path& root,const std::filesystem::path& legacy,const Reference& reference);
}
