#include "raster_snapshot.h"
#include <algorithm>
#include <stdexcept>
namespace moon {
RasterSnapshot::RasterSnapshot(const timeline::State& source){
  state_.layers=source.layers;state_.frames=source.frames;state_.loopSections=source.loopSections;
  state_.cels.reserve(source.cels.size());
  for(const auto& c:source.cels){
    timeline::Cel copy;copy.id=c.id;copy.layerId=c.layerId;copy.frameId=c.frameId;
    copy.linkedCelId=c.linkedCelId;copy.runtimeSharedCelId=c.runtimeSharedCelId;copy.opacity=c.opacity;copy.zIndex=c.zIndex;
    if(c.surface){timeline::Surface s;s.width=c.surface->width;s.height=c.surface->height;s.offsetX=c.surface->offsetX;s.offsetY=c.surface->offsetY;s.storageOriginX=c.surface->storageOriginX;s.storageOriginY=c.surface->storageOriginY;copy.surface=std::move(s);}
    state_.cels.push_back(std::move(copy));
  }
}
bool RasterSnapshot::advance(const timeline::State& source,std::chrono::steady_clock::time_point deadline,std::size_t maxPixels){
  if(source.cels.size()!=state_.cels.size())throw std::logic_error("Snapshot source changed");
  std::size_t copied=0;
  while(cel_<state_.cels.size()){
    auto& target=state_.cels[cel_];const auto& original=source.cels[cel_];
    if(target.id!=original.id || bool(target.surface)!=bool(original.surface))throw std::logic_error("Snapshot source changed");
    if(!target.surface){++cel_;continue;}
    if(copied>=maxPixels || std::chrono::steady_clock::now()>=deadline)return false;
    const auto& pixels=original.surface->pixels;auto& dest=target.surface->pixels;
    if(offset_>pixels.size())throw std::logic_error("Snapshot source changed");
    if(!offset_)dest.reserve(pixels.size()); // One surface allocation at a time.
    const auto count=std::min({chunkPixels,pixels.size()-offset_,maxPixels-copied});
    dest.insert(dest.end(),pixels.begin()+offset_,pixels.begin()+offset_+count);
    offset_+=count;copied+=count;copiedPixels_+=count;
    if(offset_==pixels.size()){offset_=0;++cel_;}
  }
  return true;
}
timeline::State RasterSnapshot::take(){if(cel_!=state_.cels.size())throw std::logic_error("Snapshot is incomplete");return std::move(state_);}
}
