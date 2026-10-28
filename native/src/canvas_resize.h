#pragma once
#include "raster_geometry.h"
#include <optional>
namespace moon {
enum class CanvasAnchor{NorthWest,North,NorthEast,West,Center,East,SouthWest,South,SouthEast};
struct CanvasResizeOffset{int x=0,y=0;};
inline CanvasResizeOffset canvasResizeOffset(int oldW,int oldH,int width,int height,CanvasAnchor anchor=CanvasAnchor::Center,std::optional<int> x={},std::optional<int> y={}){
 if(oldW<1||oldH<1||width<1||height<1||static_cast<unsigned>(anchor)>8)throw std::invalid_argument("Invalid canvas resize geometry");const auto dx=std::int64_t(width)-oldW,dy=std::int64_t(height)-oldH;auto half=[](std::int64_t v){return v>=0?v/2:-((-v+1)/2);};const int column=int(anchor)%3,row=int(anchor)/3;return {x.value_or(raster::coordinate(column==0?0:column==2?dx:half(dx))),y.value_or(raster::coordinate(row==0?0:row==2?dy:half(dy)))};
}
struct CanvasResizeSurfacePlan{int offsetX=0,offsetY=0,width=1,height=1;std::int64_t sourceX=0,sourceY=0;std::optional<int> storageOriginX,storageOriginY;bool clipped=false,empty=false;std::size_t bytes=0;};
inline CanvasResizeSurfacePlan planCanvasResizeSurface(const timeline::Surface& source,int width,int height,int dx,int dy,bool trimOutside){
 raster::validate(source);if(width<1||height<1)throw std::invalid_argument("Invalid canvas size");CanvasResizeSurfacePlan p;p.offsetX=raster::coordinate(std::int64_t(source.offsetX)+dx);p.offsetY=raster::coordinate(std::int64_t(source.offsetY)+dy);p.width=source.width;p.height=source.height;p.storageOriginX=source.storageOriginX;p.storageOriginY=source.storageOriginY;
 const auto right=std::int64_t(p.offsetX)+source.width,bottom=std::int64_t(p.offsetY)+source.height;raster::coordinate(right);raster::coordinate(bottom);if(!trimOutside)return p;
 const auto left=std::max<std::int64_t>(0,p.offsetX),top=std::max<std::int64_t>(0,p.offsetY),r=std::min<std::int64_t>(width,right),b=std::min<std::int64_t>(height,bottom);p.sourceX=left-p.offsetX;p.sourceY=top-p.offsetY;
 p.empty=r<=left||b<=top;p.clipped=p.empty||left!=p.offsetX||top!=p.offsetY||r-left!=source.width||b-top!=source.height;if(!p.clipped)return p;
 p.storageOriginX=raster::coordinate(std::int64_t(source.storageOriginX.value_or(0))+p.sourceX);p.storageOriginY=raster::coordinate(std::int64_t(source.storageOriginY.value_or(0))+p.sourceY);
 if(p.empty){p.offsetX=p.offsetY=0;p.width=p.height=1;}else{p.offsetX=int(left);p.offsetY=int(top);p.width=raster::coordinate(r-left);p.height=raster::coordinate(b-top);}p.bytes=std::size_t(p.width)*p.height*sizeof(timeline::Pixel);return p;
}
inline timeline::Surface canvasResizeCroppedSurface(const timeline::Surface& source,const CanvasResizeSurfacePlan& p,std::size_t& remaining){
 raster::validate(source);if(!p.clipped||p.width<1||p.height<1||std::uint64_t(p.width)*p.height>64*1024*1024||std::uint64_t(p.width)*p.height*sizeof(timeline::Pixel)!=p.bytes)throw std::invalid_argument("Invalid canvas crop plan");if(p.bytes>remaining)throw std::length_error("Canvas resize exceeds allocation budget");
 if(!p.empty&&(p.sourceX<0||p.sourceY<0||p.sourceX+p.width>source.width||p.sourceY+p.height>source.height))throw std::invalid_argument("Canvas crop is outside source storage");remaining-=p.bytes;timeline::Surface out;out.width=p.width;out.height=p.height;out.offsetX=p.offsetX;out.offsetY=p.offsetY;out.storageOriginX=p.storageOriginX;out.storageOriginY=p.storageOriginY;out.pixels.resize(std::size_t(p.width)*p.height);
 if(!p.empty)for(int y=0;y<p.height;++y)std::copy_n(source.pixels.begin()+std::size_t(p.sourceY+y)*source.width+std::size_t(p.sourceX),p.width,out.pixels.begin()+std::size_t(y)*p.width);return out;
}
}
