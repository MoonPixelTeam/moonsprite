#pragma once
#include "document.h"
#include <filesystem>
namespace moon {
struct AsepriteImport {int width=0,height=0;timeline::State timeline;PaletteState palette;std::u32string name;std::string activeLayer,activeFrame;};
AsepriteImport decodeAseprite(const std::vector<std::uint8_t>&,std::u32string fallbackName=U"导入的 Aseprite");
Document documentFromAseprite(AsepriteImport);
Document openAseprite(const std::filesystem::path&);
std::vector<std::uint8_t> encodeAseprite(const Document&,int scalePercent=100);
std::u32string asepriteExportNotice(const Document&);
void acceptAsepriteSaved(Document&,const std::filesystem::path&,bool sourceOnly,bool exactGeneration=true);
}