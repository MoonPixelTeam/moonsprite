#include "legacy_cursors.h"
#include <fstream>
#include <algorithm>
#include <sstream>
#include <stdexcept>

namespace moon {
LegacyCursors::LegacyCursors(const std::filesystem::path& directory,const SkinAssets* atlas) {
  std::ifstream input(directory/"cursors.txt");
  if(!input) throw std::runtime_error("Cannot load legacy cursor definitions");
  std::map<std::string,os::SurfaceRef> surfaces;
  std::map<std::string,os::CursorRef> handles;
  std::string line;
  while(std::getline(input,line)) {
    if(line.empty() || line[0]=='#') continue;
    std::istringstream row(line);std::string id,filename,extra;int x,y;
    if(!(row>>id>>filename>>x>>y) || row>>extra || cursors_.size()>=64 ||
       std::filesystem::path(filename).filename()!=std::filesystem::path(filename) ||
       std::filesystem::path(filename).extension()!=".png")
      throw std::runtime_error("Invalid legacy cursor definition");
    auto& surface=surfaces[filename];
    if(!surface) {
      auto key=std::filesystem::path(filename).stem().string();std::transform(key.begin(),key.end(),key.begin(),[](unsigned char c){return char(std::tolower(c));});
      const auto patch=atlas && atlas->patches.count("cursor."+key)?atlas->patches.at("cursor."+key):importSkinPng(directory/filename,64);const auto& bitmap=*patch.bitmap;
      if(bitmap.width!=32 || bitmap.height!=32) throw std::runtime_error("Legacy cursor must be 32 by 32 pixels");
      surface=os::instance()->makeRgbaSurface(bitmap.width,bitmap.height);
      if(!surface) throw std::runtime_error("Cannot allocate cursor surface");
      {os::SurfaceLock lock(surface.get());
        for(int py=0;py<bitmap.height;++py) for(int px=0;px<bitmap.width;++px) {
          const auto p=bitmap.pixels[py*bitmap.width+px];
          surface->putPixel(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24),px,py);
        }
      }
      surface->setImmutable();
    }
    if(x<0 || y<0 || x>=surface->width() || y>=surface->height()) throw std::runtime_error("Cursor hotspot outside image");
    const auto key=filename+":"+std::to_string(x)+":"+std::to_string(y);
    auto& handle=handles[key];
    // Legacy's default cursorScale=1 is independent of the interface scale.
    // Use OS cursors directly so laf's 2x UI scale doesn't double them again.
    if(!handle) handle=os::instance()->makeCursor(surface.get(),gfx::Point(x,y),1);
    if(!handle) throw std::runtime_error("Cannot create native legacy cursor");
    if(!cursors_.emplace(id,handle).second) throw std::runtime_error("Duplicate cursor definition");
  }
  if(input.bad()) throw std::runtime_error("Cannot read legacy cursor definitions");
  for(const auto* id:{"default","pencil-black","pencil-white","grab","grabbing"})
    if(!cursors_.count(id)) throw std::runtime_error("Required legacy cursor is missing");
}
}
