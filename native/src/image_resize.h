#pragma once
#include "selection_model.h"
#include "raster_geometry.h"
#include <cstdint>
#include <stdexcept>
namespace moon {
enum class ImageInterpolation {Nearest,Smooth};
// document-model.ts resizeSurfacePixels: straight RGBA, including hidden RGB.
inline std::vector<std::uint32_t> resizeImagePixels(const std::vector<std::uint32_t>& pixels,int sw,int sh,int tw,int th,ImageInterpolation method,double scaleX=0,double scaleY=0,double originX=0,double originY=0){
 if(sw<1||sh<1||tw<1||th<1||pixels.size()!=std::size_t(sw)*sh)throw std::invalid_argument("Invalid resize surface");
 std::vector<std::uint32_t> out(std::size_t(tw)*th);const double sx=scaleX?scaleX:double(tw)/sw,sy=scaleY?scaleY:double(th)/sh;
 auto at=[&](int x,int y){return pixels[std::size_t(std::clamp(y,0,sh-1))*sw+std::clamp(x,0,sw-1)];};
 for(int y=0;y<th;++y)for(int x=0;x<tw;++x){
  if(method==ImageInterpolation::Nearest){out[std::size_t(y)*tw+x]=at(int(std::floor((x+.5)/sx+originX)),int(std::floor((y+.5)/sy+originY)));continue;}
  const double u=(x+.5)/sx+originX-.5,v=(y+.5)/sy+originY-.5;const int l=int(std::floor(u)),t=int(std::floor(v));const double fx=u-l,fy=v-t;
  const auto a=at(l,t),b=at(l+1,t),c=at(l,t+1),d=at(l+1,t+1);std::uint32_t value=0;
  for(int channel=0;channel<4;++channel){const int shift=channel*8;const double top=((a>>shift)&255)*(1-fx)+((b>>shift)&255)*fx,bottom=((c>>shift)&255)*(1-fx)+((d>>shift)&255)*fx;value|=std::uint32_t(std::floor(top*(1-fy)+bottom*fy+.5))<<shift;}
  out[std::size_t(y)*tw+x]=value;
 }return out;
}
// Legacy document-model.ts resizeDocumentImage: scale local bounds in world
// coordinates, then sample through the document scale (including fractional edges).
struct ImageResizeSurfacePlan {int x,y,width,height;double scaleX,scaleY;std::size_t bytes;};
inline ImageResizeSurfacePlan planImageResizeSurface(const timeline::Surface& source,int sw,int sh,int tw,int th){
 raster::validate(source);if(sw<1||sh<1||tw<1||th<1)throw std::invalid_argument("Invalid image resize geometry");
 const double sx=double(tw)/sw,sy=double(th)/sh;auto coordinate=[](double n){if(!std::isfinite(n)||n<std::numeric_limits<int>::min()||n>std::numeric_limits<int>::max())throw std::length_error("Image resize coordinate exceeds range");return int(n);};
 const int x=coordinate(std::floor(source.offsetX*sx)),y=coordinate(std::floor(source.offsetY*sy));const int right=coordinate(std::ceil((std::int64_t(source.offsetX)+source.width)*sx)),bottom=coordinate(std::ceil((std::int64_t(source.offsetY)+source.height)*sy));
 const int w=std::max(1,raster::coordinate(std::int64_t(right)-x)),h=std::max(1,raster::coordinate(std::int64_t(bottom)-y));const auto count=std::uint64_t(w)*h;if(count>64*1024*1024)throw std::length_error("Image resize surface exceeds pixel limit");return {x,y,w,h,sx,sy,std::size_t(count)*sizeof(timeline::Pixel)};
}
inline timeline::Surface imageResizedSurface(const timeline::Surface& source,const ImageResizeSurfacePlan& p,ImageInterpolation method,bool mask=false){
 timeline::Surface out;out.offsetX=p.x;out.offsetY=p.y;out.width=p.width;out.height=p.height;out.storageOriginX=out.storageOriginY=0;
 out.pixels=resizeImagePixels(source.pixels,source.width,source.height,p.width,p.height,method,p.scaleX,p.scaleY,double(p.x)/p.scaleX-source.offsetX,double(p.y)/p.scaleY-source.offsetY);
 if(mask)for(auto& pixel:out.pixels)pixel=timeline::normalizedMaskPixel(pixel);return out;
}
inline std::optional<SelectionMask> resizeImageSelection(const std::optional<SelectionMask>& source,int sw,int sh,int tw,int th){
 if(!source)return {};const auto& s=*source;const double sx=double(tw)/sw,sy=double(th)/sh;
 SelectionMask out;out.x=int(std::floor(s.x*sx));out.y=int(std::floor(s.y*sy));out.width=std::max(1,int(std::ceil((s.x+s.width)*sx))-out.x);out.height=std::max(1,int(std::ceil((s.y+s.height)*sy))-out.y);
 if(!s.mask.empty()){out.mask.resize(std::size_t(out.width)*out.height);for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){const int px=int(std::floor((out.x+x+.5)/sx))-s.x,py=int(std::floor((out.y+y+.5)/sy))-s.y;if(px>=0&&py>=0&&px<s.width&&py<s.height)out.mask[std::size_t(y)*out.width+x]=s.mask[std::size_t(py)*s.width+px];}}return out;
}
}
