#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <vector>
#include "gradient_map.h"
namespace moon {
enum class ColorAdjustmentKind {Invert,BrightnessContrast,HueSaturation,ColorBalance,Curves,GradientMap};
struct CurvePoint {double x=0,y=0;};
struct ColorAdjustment {GradientMapSettings gradientMap;ColorAdjustmentKind kind=ColorAdjustmentKind::BrightnessContrast;double brightness=0,contrast=0,hue=0,saturation=0,lightness=0;bool colorize=false;std::array<std::array<double,3>,3> balance{};bool preserveLuminosity=true;std::array<std::vector<CurvePoint>,4> curves{{{{0,0},{255,255}},{{0,0},{255,255}},{{0,0},{255,255}},{{0,0},{255,255}}}};};
inline int adjustmentByte(double n){return int(std::clamp(std::floor(n+.5),0.0,255.0));}
inline std::array<int,256> buildCurveLut(std::vector<CurvePoint> points){
 for(auto& p:points){p.x=adjustmentByte(p.x);p.y=adjustmentByte(p.y);}std::stable_sort(points.begin(),points.end(),[](auto a,auto b){return a.x<b.x;});std::vector<CurvePoint> normalized;for(std::size_t i=0;i<points.size();++i)if(i+1==points.size() || points[i].x!=points[i+1].x)normalized.push_back(points[i]);if(normalized.empty() || normalized.front().x!=0)normalized.insert(normalized.begin(),{0,normalized.empty()?0:normalized.front().y});if(normalized.back().x!=255)normalized.push_back({255,normalized.back().y});std::array<int,256> lut{};std::size_t segment=0;auto slope=[&](std::size_t index){auto previous=normalized[index?index-1:0],next=normalized[std::min(index+1,normalized.size()-1)];return (next.y-previous.y)/std::max(1.0,next.x-previous.x);};for(int input=0;input<256;++input){while(segment<normalized.size()-2 && input>normalized[segment+1].x)++segment;auto left=normalized[segment],right=normalized[std::min(segment+1,normalized.size()-1)];const auto distance=std::max(1.0,right.x-left.x),t=std::clamp((input-left.x)/distance,0.0,1.0),inverse=1-t,controlLeft=left.y+slope(segment)*distance/3,controlRight=right.y-slope(std::min(segment+1,normalized.size()-1))*distance/3;lut[input]=adjustmentByte(std::pow(inverse,3)*left.y+3*std::pow(inverse,2)*t*controlLeft+3*inverse*std::pow(t,2)*controlRight+std::pow(t,3)*right.y);}return lut;
}
inline std::array<std::array<unsigned,256>,4> buildCurveHistogram(const std::vector<std::uint32_t>& pixels){std::array<std::array<unsigned,256>,4> h{};for(auto p:pixels){if(!(p>>24))continue;unsigned r=p&255,g=(p>>8)&255,b=(p>>16)&255;++h[0][(r+g+b+1)/3];++h[1][r];++h[2][g];++h[3][b];}return h;}
// Exact two-point legacy curves LUT for invert; brightness uses the existing channel LUT path.
class ColorAdjustmentSampler {
 ColorAdjustment a_;std::optional<GradientMapSampler> gradientMap_;std::array<int,256> lut_{};std::array<std::array<int,256>,4> curveLuts_{};
public:
 explicit ColorAdjustmentSampler(ColorAdjustment a):a_(a){if(a.kind==ColorAdjustmentKind::GradientMap)gradientMap_.emplace(a.gradientMap);if(a.kind==ColorAdjustmentKind::Curves)for(int c=0;c<4;++c)curveLuts_[c]=buildCurveLut(a.curves[c]);for(int i=0;i<256;++i)lut_[i]=a.kind==ColorAdjustmentKind::Invert?255-i:adjustmentByte((i-128)*(1+a.contrast/100)+128+a.brightness*2.55);}
 std::uint32_t operator()(std::uint32_t value,int x=0,int y=0)const{
  if(gradientMap_)return (*gradientMap_)(value,x,y);
  if(!(value>>24))return value;const int red=value&255,green=(value>>8)&255,blue=(value>>16)&255;
  if(a_.kind==ColorAdjustmentKind::Curves)return (value&0xff000000)|curveLuts_[1][curveLuts_[0][red]]|(curveLuts_[2][curveLuts_[0][green]]<<8)|(curveLuts_[3][curveLuts_[0][blue]]<<16);
  if(a_.kind==ColorAdjustmentKind::ColorBalance){const double luminance=(red*.2126+green*.7152+blue*.0722)/255,shadows=std::clamp((.5-luminance)*2,0.0,1.0),highlights=std::clamp((luminance-.5)*2,0.0,1.0),midtones=1-shadows-highlights;auto weighted=[&](int axis){return a_.balance[0][axis]*shadows+a_.balance[1][axis]*midtones+a_.balance[2][axis]*highlights;};const auto cr=weighted(0),mg=weighted(1),yb=weighted(2);double nr=red+cr-mg*.5-yb*.5,ng=green-cr*.5+mg-yb*.5,nb=blue-cr*.5-mg*.5+yb;if(a_.preserveLuminosity){const double correction=red*.2126+green*.7152+blue*.0722-(nr*.2126+ng*.7152+nb*.0722);nr+=correction;ng+=correction;nb+=correction;}return (value&0xff000000)|adjustmentByte(nr)|(adjustmentByte(ng)<<8)|(adjustmentByte(nb)<<16);}
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
