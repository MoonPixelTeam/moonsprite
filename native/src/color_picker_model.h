#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>

namespace moon {
// Literal numerical port of legacy/core/raster.ts and ColorPicker.tsx.
struct PickerHsv {double h=0,s=0,v=0;};
inline double pickerUnit(double v) {return std::clamp(v,0.0,1.0);}
inline double pickerHue(double v) {return std::fmod(std::fmod(v,360.0)+360.0,360.0);}
inline int pickerByte(double v) {return int(std::clamp(std::floor(v+0.5),0.0,255.0));}
inline PickerHsv pickerRgbToHsv(std::uint32_t color) {
  const double r=(color&255)/255.0,g=((color>>8)&255)/255.0,b=((color>>16)&255)/255.0;
  const double maximum=std::max({r,g,b}),minimum=std::min({r,g,b}),delta=maximum-minimum;
  double h=0;
  if(delta>0) {
    if(maximum==r) h=60*std::fmod((g-b)/delta,6.0);
    else if(maximum==g) h=60*((b-r)/delta+2);
    else h=60*((r-g)/delta+4);
  }
  if(h<0) h+=360;
  return {h,maximum==0?0:delta/maximum,maximum};
}
inline std::uint32_t pickerHsvToRgb(PickerHsv hsv,int alpha=255) {
  const double h=pickerHue(hsv.h),c=hsv.v*hsv.s,x=c*(1-std::abs(std::fmod(h/60,2.0)-1)),m=hsv.v-c;
  double r=0,g=0,b=0;
  switch(int(std::floor(h/60))) {
    case 0:r=c;g=x;break;case 1:r=x;g=c;break;case 2:g=c;b=x;break;
    case 3:g=x;b=c;break;case 4:r=x;b=c;break;default:r=c;b=x;break;
  }
  return std::uint32_t(pickerByte((r+m)*255))|(std::uint32_t(pickerByte((g+m)*255))<<8)|
    (std::uint32_t(pickerByte((b+m)*255))<<16)|(std::uint32_t(pickerByte(alpha))<<24);
}
inline double pickerShiftStep(double value,double maximum,bool percentage,bool shift) {
  value=std::clamp(value,0.0,maximum);
  if(!shift || value==0 || value==maximum) return value;
  const int step=percentage?10:5;
  return std::clamp(std::floor(value/step+0.5)*step,0.0,maximum);
}
struct PickerRole {
  std::uint32_t color=0xff000000;PickerHsv hsv;
  void sync(std::uint32_t next) {
    if(next==color) return; // Own emitted echo preserves full HSV precision.
    auto incoming=pickerRgbToHsv(next);
    if(incoming.s<=0.01) incoming.h=hsv.h;
    color=next;hsv=incoming;
  }
  void field(double x,double y) {hsv.s=pickerUnit(x);hsv.v=1-pickerUnit(y);emit();}
  void hue(double value) {hsv.h=pickerHue(value);emit();}
  void alpha(double value) {color=(color&0xffffff)|(std::uint32_t(pickerByte(value))<<24);}
  void emit() {color=pickerHsvToRgb(hsv,int(color>>24));}
};
}
