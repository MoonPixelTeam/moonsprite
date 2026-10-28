#pragma once
#include "project_reader.h"
#include "recent_projects.h"
#include <filesystem>
#include <functional>
namespace moon::recent {
struct Preview {
 project::Bytes png;
 std::vector<std::uint32_t> pixels;
 int width=0,height=0,previewWidth=0,previewHeight=0;
 std::string colorMode="rgba",error;
};
// Reads metadata/thumbnail only where embedded. Never admits a live document.
Preview readPreview(const Project&,const std::filesystem::path& cacheDirectory,const std::function<bool()>& canceled);
}
