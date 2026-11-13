#pragma once
#include "raster_geometry.h"
#include <set>
#include <string>
#include <utility>
namespace moon::history_storage {
using Pixel=timeline::Pixel;
inline constexpr std::size_t adjustmentByteLimit=256*1024*1024;
template<class Offset>
inline std::size_t adjustmentStorageBudget(const timeline::Timeline& timeline,std::size_t copies,Offset offset){
 std::size_t bytes=0;std::set<std::string> seen;
 for(const auto& cel:timeline.state().cels)if(cel.surface&&seen.insert(timeline.linkedStorageKey(cel.id)).second){
  const auto& s=*cel.surface;raster::validate(s);
  const auto position=offset(s);raster::coordinate(std::int64_t(position.first)+s.width);raster::coordinate(std::int64_t(position.second)+s.height);
  if(s.pixels.size()>64*1024*1024 || s.pixels.size()>(adjustmentByteLimit-bytes)/sizeof(Pixel))throw std::length_error("Adjustment exceeds pixel budget");
  bytes+=s.pixels.size()*sizeof(Pixel);
 }
 for(const auto& m:timeline.state().masks){const auto& surface=m.mask.surface;raster::validate(surface);if(surface.pixels.size()>(adjustmentByteLimit-bytes)/sizeof(Pixel))throw std::length_error("Adjustment mask snapshots exceed pixel budget");bytes+=surface.pixels.size()*sizeof(Pixel);}
 if(!copies || bytes>adjustmentByteLimit/copies)throw std::length_error("Adjustment snapshots exceed pixel budget");
 return bytes;
}
inline std::size_t adjustmentStorageBudget(const timeline::Timeline& timeline,std::size_t copies){
 return adjustmentStorageBudget(timeline,copies,[](const timeline::Surface& surface){return std::pair<int,int>{surface.offsetX,surface.offsetY};});
}
}
