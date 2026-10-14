#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
namespace moon {
enum class ColorAdjustmentKind {Invert,BrightnessContrast,HueSaturation};
struct ColorAdjustment {ColorAdjustmentKind kind=ColorAdjustmentKind::BrightnessContrast;double brightness=0,contrast=0,hue=0,saturation=0,lightness=0;bool colorize=false;};
inline int adjustmentByte(double n){return int(std::clamp(std::floor(n+.5),0.0,255.0));}
// Exact two-point legacy curves LUT for invert; brightness uses the existing channel LUT path.
class ColorAdjustmentSampler {
 ColorAdjustment a_;std::array<int,256> lut_{};
public:
 explicit ColorAdjustmentSampler(ColorAdjustment a):a_(a){for(int i=0;i<256;++i)lut_[i]=a.kind==ColorAdjustmentKind::Invert?255-i:adjustmentByte((i-128)*(1+a.contrast/100)+128+a.brightness*2.55);}
 std::uint32_t operator()(std::uint32_t value)const{
  if(!(value>>24))return value;const int red=value&255,green=(value>>8)&255,blue=(value>>16)&255;
  if(a_.kind!=ColorAdjustmentKind::HueSaturation)return (value&0xff000000)|lut_[red]|(lut_[green]<<8)|(lut_[blue]<<16);
  const double r=red/255.0,g=green/255.0,b=blue/255.0,hi=std::max({r,g,b}),lo=std::min({r,g,b}),delta=hi-lo,l=(hi+lo)/2;
  const double saturation=delta==0?0:delta/(1-std::abs(2*l-1));
  const double hue=delta==0?0:std::fmod((hi==r?(g-b)/delta:hi==g?(b-r)/delta+2:(r-g)/delta+4)*60+360,360);
  const double ld=a_.lightness/100,nl=std::clamp(ld>=0?l+(1-l)*ld:l*(1+ld),0.0,1.0);
  double h=std::fmod(std::fmod((a_.colorize?0:hue)+a_.hue,360)+360,360)/360;
  const double s=std::clamp(a_.colorize?a_.saturation/100:saturation*(1+a_.saturation/100),0.0,1.0);
  if(s==0){int c=adjustmentByte(nl*255);return (value&0xff000000)|c|(c<<8)|(c<<16);}
  const double q=nl<.5?nl*(1+s):nl+s-nl*s,p=2*nl-q;
  auto component=[&](double shift){double t=std::fmod(h+shift,1);if(t<0)t+=1;return adjustmentByte((p+(q-p)*(t<1.0/6?6*t:t<.5?1:t<2.0/3?(2.0/3-t)*6:0))*255);};
  return (value&0xff000000)|component(1.0/3)|(component(0)<<8)|(component(-1.0/3)<<16);
 }
};
}
