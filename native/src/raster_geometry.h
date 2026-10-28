#pragma once
#include "timeline_model.h"
#include <algorithm>
#include <limits>
#include <stdexcept>
namespace moon::raster {
struct Point64{std::int64_t x=0,y=0;};struct Rect64{std::int64_t left=0,top=0,right=0,bottom=0;};
inline int coordinate(std::int64_t v){if(v<std::numeric_limits<int>::min()||v>std::numeric_limits<int>::max())throw std::length_error("Raster coordinate exceeds native integer range");return int(v);}
inline void validate(const timeline::Surface& s){if(s.width<1||s.height<1||std::uint64_t(s.width)*s.height!=s.pixels.size())throw std::invalid_argument("Invalid RGBA surface geometry");}
inline std::optional<std::size_t> localIndex(const timeline::Surface& s,std::int64_t x,std::int64_t y){if(x<0||y<0||x>=s.width||y>=s.height)return {};return std::size_t(y)*std::size_t(s.width)+std::size_t(x);}
inline std::optional<std::size_t> worldIndex(const timeline::Surface& s,std::int64_t x,std::int64_t y){if(x<s.offsetX||y<s.offsetY||x>=std::int64_t(s.offsetX)+s.width||y>=std::int64_t(s.offsetY)+s.height)return {};return localIndex(s,x-s.offsetX,y-s.offsetY);}
inline std::optional<std::size_t> storageIndex(const timeline::Surface& s,std::int64_t x,std::int64_t y){const std::int64_t ox=s.storageOriginX.value_or(0),oy=s.storageOriginY.value_or(0);if(x<ox||y<oy||x>=ox+s.width||y>=oy+s.height)return {};return localIndex(s,x-ox,y-oy);}
inline Point64 storagePoint(const timeline::Surface& s,std::size_t i){validate(s);if(i>=s.pixels.size())throw std::out_of_range("Raster history index is outside surface");return {std::int64_t(i%std::size_t(s.width))+s.storageOriginX.value_or(0),std::int64_t(i/std::size_t(s.width))+s.storageOriginY.value_or(0)};}
inline timeline::Pixel readLocal(const timeline::Surface& s,std::int64_t x,std::int64_t y){auto i=localIndex(s,x,y);if(!i)return 0;if(*i>=s.pixels.size())throw std::invalid_argument("Invalid RGBA surface storage");return s.pixels[*i];}
inline timeline::Pixel readWorld(const timeline::Surface& s,std::int64_t x,std::int64_t y){auto i=worldIndex(s,x,y);if(!i)return 0;if(*i>=s.pixels.size())throw std::invalid_argument("Invalid RGBA surface storage");return s.pixels[*i];}
inline bool fullCanvas(const timeline::Surface& s,int w,int h){return s.width==w&&s.height==h&&s.offsetX==0&&s.offsetY==0&&s.pixels.size()==std::uint64_t(w)*h;}
// Detached candidate only. Installation must pass through owner/history/revision.
inline std::optional<timeline::Surface> expanded(const timeline::Surface& s,Rect64 requested,std::size_t availableBytes=256*1024*1024,std::size_t maxPixels=64*1024*1024){
 validate(s);if(requested.right<=requested.left||requested.bottom<=requested.top)throw std::invalid_argument("Invalid raster expansion rectangle");const bool placeholder=s.width==1&&s.height==1&&(s.pixels[0]>>24)==0;
 Rect64 r=requested;if(!placeholder){r.left=std::min(r.left,std::int64_t(s.offsetX));r.top=std::min(r.top,std::int64_t(s.offsetY));r.right=std::max(r.right,std::int64_t(s.offsetX)+s.width);r.bottom=std::max(r.bottom,std::int64_t(s.offsetY)+s.height);}
 coordinate(r.left);coordinate(r.top);coordinate(r.right);coordinate(r.bottom);const auto w=r.right-r.left,h=r.bottom-r.top;if(w<1||h<1||w>std::numeric_limits<int>::max()||h>std::numeric_limits<int>::max())throw std::length_error("Raster expansion exceeds native dimensions");if(!placeholder&&r.left==s.offsetX&&r.top==s.offsetY&&w==s.width&&h==s.height)return {};
 const std::uint64_t count=std::uint64_t(w)*std::uint64_t(h);if(count>maxPixels||count>availableBytes/sizeof(timeline::Pixel)||count>std::numeric_limits<std::size_t>::max()/sizeof(timeline::Pixel))throw std::length_error("Raster expansion exceeds allocation budget");
 timeline::Surface out;out.width=int(w);out.height=int(h);out.offsetX=int(r.left);out.offsetY=int(r.top);const std::int64_t dx=std::int64_t(s.offsetX)-r.left,dy=std::int64_t(s.offsetY)-r.top;out.storageOriginX=placeholder?0:coordinate(std::int64_t(s.storageOriginX.value_or(0))-dx);out.storageOriginY=placeholder?0:coordinate(std::int64_t(s.storageOriginY.value_or(0))-dy);out.pixels.resize(std::size_t(count));if(!placeholder)for(int y=0;y<s.height;++y)std::copy_n(s.pixels.begin()+std::size_t(y)*s.width,s.width,out.pixels.begin()+std::size_t(std::int64_t(y)+dy)*out.width+std::size_t(dx));return out;
}
}
