#pragma once
#include "project_reader.h"
#include <filesystem>
namespace moon::local_history {
bool safeHistoryId(const std::string& id);
// directory is explicitly supplied by the native session owner. These calls
// never discover or touch the legacy app's data directory automatically.
project::Bytes readHistory(const std::filesystem::path& directory,const std::string& id,std::size_t maximumBytes=256u*1024*1024);
void writeHistory(const std::filesystem::path& directory,const std::string& id,const project::Bytes& bytes,std::size_t maximumBytes=256u*1024*1024);
}
