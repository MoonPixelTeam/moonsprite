#pragma once
#include "color_adjustment.h"
#include "document_color_mode.h"
#include "raster_geometry.h"
#include "selection_model.h"
#include <functional>
#include <limits>
#include <unordered_map>

namespace moon::indexed_adjustment {
// adjustments.ts applyColorAdjustmentDirect: last entry by ID, first by RGBA,
// and a fresh source-ID cache per owned layer. In particular hidden colors are
// allocated before normalization; only gradient maps extend the visible order.
template<class Palette> std::size_t paletteBytes(const Palette& p){
 std::size_t bytes=sizeof(Palette)+(p.slots.size()+p.selected.size()+(p.independentOrder?p.independentOrder->size():0))*sizeof(int);
 for(const auto& e:p.entries)bytes+=sizeof(e)+e.name.size()*sizeof(char32_t);return bytes;
}
template<class Palette> bool samePaletteData(const Palette& a,const Palette& b){
 if(a.nextId!=b.nextId||a.order()!=b.order()||a.entries.size()!=b.entries.size())return false;
 for(std::size_t i=0;i<a.entries.size();++i){const auto& x=a.entries[i];const auto& y=b.entries[i];if(x.id!=y.id||x.name!=y.name||x.color!=y.color)return false;}return true;
}
template<class Palette> bool apply(Palette& palette,timeline::Surface& surface,const std::optional<SelectionMask>& selection,const ColorAdjustment& adjustment,color_mode::Mode mode,color_mode::PixelFormat format,const std::function<bool()>& cancelled,std::size_t byteLimit){
 raster::validate(surface);if(surface.format!=timeline::RasterFormat::Indexed)throw std::logic_error("Expected indexed adjustment surface");
 std::size_t used=0;auto charge=[&](std::size_t bytes){if(bytes>byteLimit-used)throw std::length_error("Indexed adjustment exceeds palette budget");used+=bytes;};
 // Bound detached palette storage and hash nodes, including the per-source cache.
 charge(paletteBytes(palette));if(palette.entries.size()>(byteLimit-used)/128)throw std::length_error("Indexed adjustment lookup exceeds budget");charge(palette.entries.size()*128);
 std::unordered_map<int,Pixel> byId;std::unordered_map<Pixel,int> byColor;
 for(const auto& e:palette.entries){byId[e.id]=e.color;byColor.emplace(e.color,e.id);}
 std::unordered_map<std::uint64_t,Pixel> repeated;auto order=palette.order();ColorAdjustmentSampler sampler(adjustment);
 const bool gradient=adjustment.kind==ColorAdjustmentKind::GradientMap,dither=gradient&&adjustment.gradientMap.dither!=0;
 for(int y=0;y<surface.height;++y)for(int x=0;x<surface.width;++x){const auto i=std::size_t(y)*surface.width+x;if((i&1023)==0&&cancelled&&cancelled())return false;
  const int wx=raster::coordinate(std::int64_t(surface.offsetX)+x),wy=raster::coordinate(std::int64_t(surface.offsetY)+y);if(selection&&!selectionContains(selection,wx,wy))continue;
  auto& value=surface.pixels[i];const auto key=(std::uint64_t(value)<<6)|(dither?unsigned((y%8)*8+x%8):0u);
  if(const auto found=repeated.find(key);found!=repeated.end()){value=found->second;continue;}
  const auto found=byId.find(int(value));const auto next=sampler(found==byId.end()?0:found->second,wx,wy);Pixel id=0;
  if(next>>24){if(const auto exact=byColor.find(next);exact!=byColor.end())id=Pixel(exact->second);
   else{if(palette.nextId<1||palette.nextId==std::numeric_limits<int>::max())throw std::length_error("Indexed adjustment palette ID exhausted");
    const auto name=std::to_string(palette.nextId);charge(sizeof(typename decltype(palette.entries)::value_type)+name.size()*sizeof(char32_t)+128);
    id=Pixel(palette.nextId++);palette.entries.push_back({int(id),std::u32string(name.begin(),name.end()),next});byId[int(id)]=next;byColor.emplace(next,int(id));}
   if(gradient&&std::find(order.begin(),order.end(),int(id))==order.end()){charge(sizeof(int));order.push_back(int(id));}
   id=color_mode::normalizeLayerPackedValue(mode,format,true,false,palette.entries,order,id);
  }
  charge(64);repeated.emplace(key,id);value=id;
 }
 palette.setOrder(std::move(order));return !(cancelled&&cancelled());
}
template<class Palette> std::array<std::array<unsigned,256>,4> histogram(const std::vector<Pixel>& pixels,const Palette& palette){
 std::unordered_map<int,Pixel> byId;for(const auto& e:palette.entries)byId[e.id]=e.color;
 std::array<std::array<unsigned,256>,4> h{};for(const auto id:pixels){const auto found=byId.find(int(id));if(found==byId.end()||!(found->second>>24))continue;const auto p=found->second;const unsigned r=p&255,g=(p>>8)&255,b=(p>>16)&255;++h[0][(r+g+b+1)/3];++h[1][r];++h[2][g];++h[3][b];}return h;
}
}
