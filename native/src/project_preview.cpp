#include "project_preview.h"
#include "document.h"
#include "layer_compositor.h"
#include "cel_properties.h"
#include <zlib.h>
#include <algorithm>
#include <cmath>
namespace moon::project {
namespace {
void be(Bytes& out,std::uint32_t n){for(int i=3;i>=0;--i)out.push_back(std::uint8_t(n>>(i*8)));}
void chunk(Bytes& out,const char* type,const Bytes& data){be(out,std::uint32_t(data.size()));const auto begin=out.size();out.insert(out.end(),type,type+4);out.insert(out.end(),data.begin(),data.end());be(out,std::uint32_t(crc32(0,out.data()+begin,uInt(data.size()+4))));}
}
Bytes encodeProjectPreview(const Document& d) {
  // legacy project-format-manifest.ts encodeProjectPreview: max 512, nearest
  // centre sample, straight RGBA on transparency, no UI checkerboard.
  const auto scale=std::min(1.0,std::min(512.0/d.width(),512.0/d.height()));
  const int w=std::max(1,int(std::lround(d.width()*scale))),h=std::max(1,int(std::lround(d.height()*scale)));
  const auto* surface=d.timeline().resolveSurface(d.cel().id).surface;
  const bool direct=surface && surface->width==d.width() && surface->height==d.height() && !surface->offsetX && !surface->offsetY && d.timeline().state().groups.empty() && d.timeline().state().layers.size()==1 && !timeline::styleVisible(d.layer().layerStyles) && d.layer().visible && d.layer().blendMode=="normal" && frameCelOpacity(d.timeline(),d.layer(),d.frame().id)==1;
  const auto composed=direct?std::vector<Pixel>{}:compositeNormalRegion(d.timeline(),d.frame().id,{0,0,d.width(),d.height()});
  Bytes scan;scan.reserve((w*4+1)*h);
  for(int y=0;y<h;++y){scan.push_back(0);for(int x=0;x<w;++x){
    const int sx=std::min(d.width()-1,int(std::floor((x+0.5)*d.width()/w))),sy=std::min(d.height()-1,int(std::floor((y+0.5)*d.height()/h)));
    auto pixel=direct?d.pixels()[sy*d.width()+sx]:composed[sy*d.width()+sx];
    if(scale<1 && (pixel>>24)==0)pixel=0; // legacy point sampler skips fully transparent source.
    for(int channel=0;channel<4;++channel)scan.push_back(std::uint8_t(pixel>>(channel*8)));
  }}
  uLongf size=compressBound(uLong(scan.size()));Bytes compressed(size);
  if(compress2(compressed.data(),&size,scan.data(),uLong(scan.size()),6)!=Z_OK)throw Error(ErrorKind::Limit,"Cannot encode project preview");
  compressed.resize(size);Bytes out{137,80,78,71,13,10,26,10},header;be(header,w);be(header,h);header.insert(header.end(),{8,6,0,0,0});
  chunk(out,"IHDR",header);chunk(out,"IDAT",compressed);chunk(out,"IEND",{});return out;
}
}
