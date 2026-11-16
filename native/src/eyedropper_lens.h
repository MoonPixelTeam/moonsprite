#pragma once
#include "canvas_rotation.h"
#include "skin_assets.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <vector>

namespace moon::eyedropper_lens {
using Pixel=std::uint32_t;
// Legacy CSS geometry stays in CSS pixels here; the native shell is half size.
inline double pixelScale(double zoom){return std::max(204./17,std::isfinite(zoom)?std::max(0.,zoom)*1.5:0.);}
inline view::Point position(view::Point p,view::Point bounds,double size){
 const double ix=std::min(6.,std::max(0.,(bounds.x-size)/2)),iy=std::min(6.,std::max(0.,(bounds.y-size)/2));
 const double left=std::min(std::max(ix,bounds.x-size-ix),std::max(ix,p.x-size/2));
 const double above=p.y-size-18;
 return {left,above>=iy?above:std::min(std::max(iy,bounds.y-size-iy),std::max(iy,p.y+18))};
}
inline double luminance(Pixel p){return (p&255)*.2126+((p>>8)&255)*.7152+((p>>16)&255)*.0722;}
inline double themeLuminance(Pixel p){
 auto linear=[](unsigned c){const double v=c/255.;return v<=.04045?v/12.92:std::pow((v+.055)/1.055,2.4);};
 return linear(p&255)*.2126+linear((p>>8)&255)*.7152+linear((p>>16)&255)*.0722;
}
inline int clampedByte(double v){ // Uint8ClampedArray uses ties-to-even.
 v=std::clamp(v,0.,255.);const double lo=std::floor(v),fraction=v-lo;
 return int(lo+(fraction>.5||(fraction==.5&&int(lo)%2)?1:0));
}
inline Pixel alpha(Pixel p,double opacity){return (p&0xffffff)|(Pixel(clampedByte((p>>24)*opacity))<<24);}
inline Pixel over(Pixel bottom,Pixel top){
 const double a=(top>>24)/255.,b=(bottom>>24)/255.,out=a+b*(1-a);
 if(out<=0)return 0;
 auto channel=[&](int s){return Pixel(std::floor((((top>>s)&255)*a+((bottom>>s)&255)*b*(1-a))/out+.5));};
 return channel(0)|(channel(8)<<8)|(channel(16)<<16)|(Pixel(std::floor(out*255+.5))<<24);
}
struct Field {
 const std::vector<Pixel>& pixels; // 25x25, composited over the document checker.
 view::Point point;int startX=0,startY=0;double zoom=0;view::Rotation rotation;bool distortion=false;
 Pixel sample(view::Point output)const{
  auto transform=rotation;if(!std::isfinite(transform.degrees))transform.degrees=0;
  const auto p=transform.inverse(output,{102,102});const double scale=pixelScale(zoom);
  const int x=int(std::floor((p.x-(102+(startX-point.x)*scale))/scale));
  const int y=int(std::floor((p.y-(102+(startY-point.y)*scale))/scale));
  return x>=0&&x<25&&y>=0&&y<25?pixels[y*25+x]:0;
 }
 Pixel at(view::Point p)const{
  if(!distortion)return sample(p);
  const double nx=(p.x-102)/100,ny=(p.y-102)/100,raw=std::hypot(nx,ny),radius=std::min(1.,raw);
  if(raw<=.82)return sample(p);
  const double t=std::clamp((radius-.82)/.18,0.,1.),curve=t*t*(3-2*t),factor=1+curve*.14;
  const view::Point mapped{102+(p.x-102)*factor,102+(p.y-102)*factor};
  const auto center=sample(mapped);if(!(center>>24))return 0;
  const double rx=nx/radius,ry=ny/radius,scatter=curve*6;
  const auto red=sample({mapped.x+rx*scatter,mapped.y+ry*scatter});
  const auto blue=sample({mapped.x-rx*scatter,mapped.y-ry*scatter});
  const double shadow=curve*(.028+std::max(0.,(rx+ry)*std::sqrt(.5))*.09+std::max(0.,ry)*.035);
  return Pixel(clampedByte((red>>24?red&255:center&255)*(1-shadow)))|
   (Pixel(clampedByte(((center>>8)&255)*(1-shadow)))<<8)|
   (Pixel(clampedByte((blue>>24?(blue>>16)&255:(center>>16)&255)*(1-shadow)))<<16)|(center&0xff000000);
 }
};
// Original SVG/PNG alpha is retained. Line mode translates legacy CSS circles,
// borders and radial mask; it is geometry, not a replacement icon.
inline std::vector<Pixel> shell(const Field& field,const std::array<const SkinBitmap*,4>& masks,
 const SkinBitmap& pointer,Pixel sampled,Pixel previous,Pixel ink,bool line){
 std::vector<Pixel> output(128*128);
 for(int y=0;y<128;++y)for(int x=0;x<128;++x){
  const int i=(y/2)*64+x/2;const double radius=std::hypot(x+.5-64,y+.5-64);
  Pixel color=0;
  const double clip=line?std::clamp(50.5-radius,0.,1.):(masks[0]->pixels[i]>>24)/255.;
  if(x>=13&&x<115&&y>=13&&y<115&&clip>0){
   color=field.at({(x+.5-13)*2,(y+.5-13)*2});
   if(x>=56&&x<72&&y>=56&&y<72)color=over(color,alpha(pointer.pixels[(y-56)*2*32+(x-56)*2],.5));
   color=alpha(color,clip);
  }
  if(line){
   const double outer=std::clamp(64.5-radius,0.,1.),hole=std::clamp(radius-49.,0.,1.);
   color=over(color,alpha(y<64?sampled:previous,outer*hole));
   // CSS border boxes: shell radius128 / inset28 inner radius100, width2.
   color=over(color,alpha(ink,std::clamp(1.-std::abs(radius-63.5),0.,1.)*hole));
   color=over(color,alpha(ink,std::clamp(1.-std::abs(radius-49.5),0.,1.)));
  }else{
   color=over(color,alpha(sampled,(masks[1]->pixels[i]>>24)/255.));
   color=over(color,alpha(previous,(masks[2]->pixels[i]>>24)/255.));
   color=over(color,alpha(ink,(masks[3]->pixels[i]>>24)/255.));
  }
  output[y*128+x]=color;
 }
 return output;
}
}
