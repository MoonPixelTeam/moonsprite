#pragma once
#include "color_picker_model.h"
#include <array>
#include <string>
#include <vector>

namespace moon {
// Numerical port of legacy/core/color-values.ts. Native pixels store red low.
enum class ColorValueMode {Hsv,Rgb,Lab,Gray,Palette,Hsl,Cmyk};
struct ColorValueField {const char* label;int minimum,maximum;bool percentage=false;};
inline std::vector<ColorValueField> colorValueFields(ColorValueMode mode){
  switch(mode){
    case ColorValueMode::Rgb:return {{"R",0,255},{"G",0,255},{"B",0,255},{"A",0,255}};
    case ColorValueMode::Hsv:return {{"H",0,360},{"S",0,100,true},{"V",0,100,true},{"A",0,255}};
    case ColorValueMode::Hsl:return {{"H",0,360},{"S",0,100,true},{"L",0,100,true},{"A",0,255}};
    case ColorValueMode::Lab:return {{"L",0,100,true},{"a",-128,127},{"b",-128,127},{"A",0,255}};
    case ColorValueMode::Cmyk:return {{"C",0,100,true},{"M",0,100,true},{"Y",0,100,true},{"K",0,100,true},{"A",0,255}};
    case ColorValueMode::Gray:return {{"Gray",0,255},{"A",0,255}};
    default:return {};
  }
}
using ColorValues=std::array<double,5>;
inline std::uint32_t colorValueRgba(double r,double g,double b,double a){return pickerByte(r)|(pickerByte(g)<<8)|(pickerByte(b)<<16)|(std::uint32_t(pickerByte(a))<<24);}
inline ColorValues colorToValues(std::uint32_t color,ColorValueMode mode){
  const double r=(color&255),g=(color>>8)&255,b=(color>>16)&255,a=color>>24;
  if(mode==ColorValueMode::Rgb)return {r,g,b,a};
  if(mode==ColorValueMode::Gray)return {std::floor(r*.2126+g*.7152+b*.0722+.5),a};
  const auto hsv=pickerRgbToHsv(color);
  if(mode==ColorValueMode::Hsv)return {hsv.h,hsv.s*100,hsv.v*100,a};
  if(mode==ColorValueMode::Hsl){const double hi=std::max({r,g,b})/255,lo=std::min({r,g,b})/255,d=hi-lo,l=(hi+lo)/2;return {hsv.h,d==0?0:d/(1-std::abs(2*l-1))*100,l*100,a};}
  if(mode==ColorValueMode::Cmyk){const double k=1-std::max({r,g,b})/255;if(k>=1-2.220446049250313e-16)return {0,0,0,100,a};return {(1-r/255-k)/(1-k)*100,(1-g/255-k)/(1-k)*100,(1-b/255-k)/(1-k)*100,k*100,a};}
  if(mode==ColorValueMode::Lab){
    auto linear=[](double c){c/=255;return c<=.04045?c/12.92:std::pow((c+.055)/1.055,2.4);};
    auto curve=[](double v){return v>216./24389?std::cbrt(v):(24389./27*v+16)/116;};
    const double rr=linear(r),gg=linear(g),bb=linear(b);
    const double fx=curve((rr*.4124564+gg*.3575761+bb*.1804375)/.95047),fy=curve(rr*.2126729+gg*.7151522+bb*.072175),fz=curve((rr*.0193339+gg*.119192+bb*.9503041)/1.08883);
    return {116*fy-16,500*(fx-fy),200*(fy-fz),a};
  }
  return {};
}
inline std::uint32_t colorFromValues(ColorValueMode mode,const ColorValues& v,std::uint32_t fallback){
  if(mode==ColorValueMode::Palette)return fallback;
  const auto fields=colorValueFields(mode);const double a=v[fields.size()-1];
  if(mode==ColorValueMode::Rgb)return colorValueRgba(v[0],v[1],v[2],a);
  if(mode==ColorValueMode::Gray)return colorValueRgba(v[0],v[0],v[0],a);
  if(mode==ColorValueMode::Hsv)return pickerHsvToRgb({v[0],pickerUnit(v[1]/100),pickerUnit(v[2]/100)},pickerByte(a));
  if(mode==ColorValueMode::Cmyk)return colorValueRgba(255*(1-pickerUnit(v[0]/100))*(1-pickerUnit(v[3]/100)),255*(1-pickerUnit(v[1]/100))*(1-pickerUnit(v[3]/100)),255*(1-pickerUnit(v[2]/100))*(1-pickerUnit(v[3]/100)),a);
  if(mode==ColorValueMode::Hsl){
    const double h=pickerHue(v[0])/360,s=pickerUnit(v[1]/100),l=pickerUnit(v[2]/100),q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
    auto channel=[&](double offset){double x=std::fmod(h+offset+1,1.);return (x<1./6?p+(q-p)*6*x:x<.5?q:x<2./3?p+(q-p)*(2./3-x)*6:p)*255;};
    return colorValueRgba(channel(1./3),channel(0),channel(-1./3),a);
  }
  auto inverse=[](double n){return n*n*n>216./24389?n*n*n:27./24389*(116*n-16);};
  auto srgb=[](double n){n=pickerUnit(n);return 255*(n<=.0031308?n*12.92:1.055*std::pow(n,1/2.4)-.055);};
  const double fy=(std::clamp(v[0],0.,100.)+16)/116,x=.95047*inverse(fy+std::clamp(v[1],-128.,127.)/500),y=inverse(fy),z=1.08883*inverse(fy-std::clamp(v[2],-128.,127.)/200);
  return colorValueRgba(srgb(x*3.2404542-y*1.5371385-z*.4985314),srgb(-x*.969266+y*1.8760108+z*.041556),srgb(x*.0556434-y*.2040259+z*1.0572252),a);
}
inline std::string colorValueHex(std::uint32_t color){const char* digits="0123456789ABCDEF";std::string text="#";for(int i=0;i<((color>>24)==255?3:4);++i){auto c=(color>>(8*i))&255;text+=digits[c>>4];text+=digits[c&15];}return text;}
}
