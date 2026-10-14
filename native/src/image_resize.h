#pragma once
#include "selection_model.h"
#include <cstdint>
#include <stdexcept>
namespace moon {
enum class ImageInterpolation {Nearest,Smooth};
// document-model.ts resizeSurfacePixels: straight RGBA, including hidden RGB.
inline std::vector<std::uint32_t> resizeImagePixels(const std::vector<std::uint32_t>& pixels,int sw,int sh,int tw,int th,ImageInterpolation method){
 if(sw<1||sh<1||tw<1||th<1||pixels.size()!=std::size_t(sw)*sh)throw std::invalid_argument("Invalid resize surface");
 std::vector<std::uint32_t> out(std::size_t(tw)*th);const double sx=double(tw)/sw,sy=double(th)/sh;
 auto at=[&](int x,int y){return pixels[std::size_t(std::clamp(y,0,sh-1))*sw+std::clamp(x,0,sw-1)];};
 for(int y=0;y<th;++y)for(int x=0;x<tw;++x){
  if(method==ImageInterpolation::Nearest){out[std::size_t(y)*tw+x]=at(int(std::floor((x+.5)/sx)),int(std::floor((y+.5)/sy)));continue;}
  const double u=(x+.5)/sx-.5,v=(y+.5)/sy-.5;const int l=int(std::floor(u)),t=int(std::floor(v));const double fx=u-l,fy=v-t;
  const auto a=at(l,t),b=at(l+1,t),c=at(l,t+1),d=at(l+1,t+1);std::uint32_t value=0;
  for(int channel=0;channel<4;++channel){const int shift=channel*8;const double top=((a>>shift)&255)*(1-fx)+((b>>shift)&255)*fx,bottom=((c>>shift)&255)*(1-fx)+((d>>shift)&255)*fx;value|=std::uint32_t(std::floor(top*(1-fy)+bottom*fy+.5))<<shift;}
  out[std::size_t(y)*tw+x]=value;
 }return out;
}
inline std::optional<SelectionMask> resizeImageSelection(const std::optional<SelectionMask>& source,int sw,int sh,int tw,int th){
 if(!source)return {};const auto& s=*source;const double sx=double(tw)/sw,sy=double(th)/sh;
 SelectionMask out;out.x=int(std::floor(s.x*sx));out.y=int(std::floor(s.y*sy));out.width=std::max(1,int(std::ceil((s.x+s.width)*sx))-out.x);out.height=std::max(1,int(std::ceil((s.y+s.height)*sy))-out.y);
 if(!s.mask.empty()){out.mask.resize(std::size_t(out.width)*out.height);for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){const int px=int(std::floor((out.x+x+.5)/sx))-s.x,py=int(std::floor((out.y+y+.5)/sy))-s.y;if(px>=0&&py>=0&&px<s.width&&py<s.height)out.mask[std::size_t(y)*out.width+x]=s.mask[std::size_t(py)*s.width+px];}}return out;
}
}
