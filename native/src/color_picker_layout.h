#pragma once
#include "color_picker_model.h"

namespace moon {
struct PickerBox {int x=0,y=0,w=0,h=0;};
struct PickerLayout {PickerBox field,hue,alpha;};
inline PickerLayout pickerLayout(int width,int height,int markerWidth=4,int markerHeight=4) {
  if(width<markerWidth || height<3*markerHeight) return {};
  const int strip=std::min(std::max(12,markerHeight),(height-markerHeight)/2);
  const int fieldHeight=height-2*strip;
  return {{0,0,width,fieldHeight},{0,fieldHeight,width,strip},{0,fieldHeight+strip,width,strip}};
}
inline double pickerCoordinate(double position,int start,int length) {
  return pickerUnit((position-start)/std::max(1,length-1));
}
inline PickerBox pickerMarkerBox(PickerBox area,double x,double y,int width=4,int height=4) {
  if(area.w<width || area.h<height) return {};
  const int left=area.x+int(std::round(pickerUnit(x)*std::max(0,area.w-1)))-width/2;
  const int top=area.y+int(std::round(pickerUnit(y)*std::max(0,area.h-1)))-height/2;
  return {std::clamp(left,area.x,area.x+area.w-width),std::clamp(top,area.y,area.y+area.h-height),width,height};
}
// Same center-luminance threshold as legacy ColorValueControl's sample pointer.
inline bool pickerLightMarker(int r,int g,int b) {return r*0.2126+g*0.7152+b*0.0722<145;}
inline std::uint32_t pickerComposite(std::uint32_t rgb,double alpha,std::uint32_t checker) {
  const auto component=[&](int shift) {return pickerByte(((rgb>>shift)&255)*alpha+((checker>>shift)&255)*(1-alpha));};
  return std::uint32_t(component(0))|(std::uint32_t(component(8))<<8)|(std::uint32_t(component(16))<<16)|0xff000000;
}
}
