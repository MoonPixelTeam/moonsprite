#pragma once
#include "document.h"
#include <filesystem>
#include <optional>
namespace moon {
struct StoredPalette {
 std::string id,name;std::filesystem::path path;bool builtIn=false;
 std::vector<Pixel> colors;std::optional<std::vector<std::string>> names;
 int columns=0;std::vector<std::optional<std::size_t>> slots;
};
StoredPalette decodeStoredPalette(const std::string& text);
std::string encodeStoredPalette(const StoredPalette& palette);
class PaletteLibrary {
 std::filesystem::path directory_,builtins_;
public:
 PaletteLibrary(std::filesystem::path directory,std::filesystem::path builtins={}):directory_(std::move(directory)),builtins_(std::move(builtins)){}
 std::vector<StoredPalette> list()const;
 StoredPalette save(StoredPalette palette,const std::string& currentId={})const;
 StoredPalette importFile(const std::filesystem::path& path)const;
 void remove(const std::string& id)const;
};
}
