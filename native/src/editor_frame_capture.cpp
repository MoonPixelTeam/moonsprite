#include "editor_implementation.h"
#include "editor_support.h"

namespace moon::editor {
void writeSmokeFrame(os::Surface* surface,const std::filesystem::path& path) {

  // Capture the physical framebuffer without an additional UI-scale expansion.

  const int w=surface->width(),h=surface->height();

  const unsigned stride=(w*3+3)&~3u, bytes=stride*h;

  std::ofstream out(path,std::ios::binary);

  auto u16=[&](unsigned v){out.put(char(v));out.put(char(v>>8));};

  auto u32=[&](unsigned v){u16(v);u16(v>>16);};

  out.write("BM",2);u32(54+bytes);u32(0);u32(54);u32(40);u32(w);u32(h);u16(1);u16(24);

  u32(0);u32(bytes);u32(0);u32(0);u32(0);u32(0);

  os::SurfaceLock lock(surface);

  for(int y=h-1;y>=0;--y) {

    for(int x=0;x<w;++x) {const auto c=surface->getPixel(x,y);out.put(char(gfx::getb(c)));out.put(char(gfx::getg(c)));out.put(char(gfx::getr(c)));}

    for(unsigned n=w*3;n<stride;++n) out.put(0);

  }

  if(!out) throw std::runtime_error("Cannot write smoke framebuffer");

}
}
