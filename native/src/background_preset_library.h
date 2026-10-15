#pragma once
#include "image_export.h"
namespace moon {
struct StoredBackgroundPreset {std::string id,name,filePath;bool builtIn=false;};
class BackgroundPresetLibrary {
 std::filesystem::path directory_;
 void seedBuiltins() const;
public:
 explicit BackgroundPresetLibrary(std::filesystem::path directory);
 static std::u32string cleanName(std::u32string name);
 static void validatePng(const std::vector<std::uint8_t>& bytes);
 StoredBackgroundPreset save(std::u32string name,const std::vector<std::uint8_t>& bytes) const;
 const std::filesystem::path& directory() const {return directory_;}
};
// Final current-frame composite, canvas-clipped box, actual selection mask.
std::optional<StaticImageExport> encodeSelectionBackgroundPreset(const Document& document,const SelectionMask& selection);
}
