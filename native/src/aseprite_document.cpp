#include "aseprite_io.h"
#include <fstream>
#include <stdexcept>
namespace moon {
struct AsepriteDocumentBuilder {
 static void acceptSaved(Document& d,const std::filesystem::path& path,bool sourceOnly,bool exact){if(exact&&d.active())throw std::logic_error("Cannot accept a saved uncommitted preview");d.name_=path.filename().u32string();if(sourceOnly)d.setSourceFilePath(path);if(exact)d.markSaved();}

 static Document build(AsepriteImport value){
  timeline::Timeline checked(std::move(value.timeline));
  if(checked.state().layers.empty()||checked.state().frames.empty()||!checked.hasLayer(value.activeLayer)||!checked.hasFrame(value.activeFrame)||!checked.diagnoseLinks().empty())throw std::invalid_argument("Invalid Aseprite import relationships");
  Document d(value.width,value.height);d.timeline_=std::move(checked);d.palette_=std::move(value.palette);d.name_=std::move(value.name);d.activeLayerId_=std::move(value.activeLayer);d.activeFrameId_=std::move(value.activeFrame);d.projectActiveCelOpacities();d.selectLayer(d.activeLayerId_);d.selectFrame(d.activeFrameId_);d.markSaved();return d;
 }
};
void acceptAsepriteSaved(Document& d,const std::filesystem::path& path,bool sourceOnly,bool exactGeneration){AsepriteDocumentBuilder::acceptSaved(d,path,sourceOnly,exactGeneration);}
Document documentFromAseprite(AsepriteImport value){return AsepriteDocumentBuilder::build(std::move(value));}
Document openAseprite(const std::filesystem::path& path){
 std::ifstream in(path,std::ios::binary|std::ios::ate);if(!in)throw std::runtime_error("无法读取 Aseprite 文件。");auto size=in.tellg();if(size<128||std::uint64_t(size)>256ULL*1024*1024)throw std::length_error("Aseprite 文件大小超出限制。");std::vector<std::uint8_t> bytes(std::size_t(size),0);in.seekg(0);if(!in.read(reinterpret_cast<char*>(bytes.data()),std::streamsize(bytes.size())))throw std::runtime_error("Aseprite 文件读取不完整。");return documentFromAseprite(decodeAseprite(bytes,path.stem().u32string()));
}
}