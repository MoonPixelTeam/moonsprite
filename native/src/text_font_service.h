#pragma once
#include "text_raster.h"
#include <filesystem>
#include <memory>
namespace moon {
struct TextFontOption {std::string family;std::filesystem::path file;bool imported=false,builtIn=false;int faceIndex=0;std::string id;};
class TextFontService {struct Impl;std::shared_ptr<Impl> impl_;public:TextFontService(std::filesystem::path library,std::filesystem::path bundled,std::filesystem::path settings);std::vector<TextFontOption> catalog()const;std::vector<std::string> systemFamilies()const;TextFontOption importFile(const std::filesystem::path&);TextFontOption importSystem(const std::string&);void erase(const std::string& id);int lastSize()const;void recordSize(int);void recordUsage(const std::string&);TextGlyphProvider provider()const;};
}
