#pragma once
#include "timeline_model.h"
#include "raster_geometry.h"
#include <limits>
#include <algorithm>
#include <array>
#include <cmath>
#include <functional>
#include <stdexcept>
#include <string_view>
namespace moon {
enum class FilterPreset{CrtSubtle,CrtMedium,CrtStrong,VhsColorFringe,Vignette,PhosphorGlow};
struct FilterPresetDefinition{FilterPreset preset;std::string_view id;std::u32string_view name,description;std::string_view blendMode;double opacity;};
inline const std::array<FilterPresetDefinition,6>& filterPresetDefinitions(){static const std::array<FilterPresetDefinition,6> values{{
 {FilterPreset::CrtSubtle,"crt-scanlines-subtle",U"CRT 扫描线（经典隔行）",U"传统隔行扫描：每隔一行压暗，形成最干净的 CRT 线条。","soft-light",1},
 {FilterPreset::CrtMedium,"crt-scanlines-medium",U"CRT 扫描线（RGB 荧光栅）",U"水平扫描线叠加红绿蓝荧光点阵，模拟彩色显像管。","soft-light",.72},
 {FilterPreset::CrtStrong,"crt-scanlines-strong",U"CRT 扫描线（交错栅格）",U"三行交错的粗细栅格，带有老式显示器的干扰纹理。","soft-light",1},
 {FilterPreset::VhsColorFringe,"vhs-color-fringe",U"VHS 色彩偏移",U"交替的青红条纹，模拟录像带色彩串扰。","screen",.35},
 {FilterPreset::Vignette,"vignette",U"暗角",U"压低边缘亮度，让视觉集中在画布中心。","multiply",1},
 {FilterPreset::PhosphorGlow,"phosphor-glow",U"荧光绿辉光",U"叠加柔和的绿色荧光显示器色调。","screen",.24}
 }};return values;}
inline const FilterPresetDefinition& filterPresetDefinition(FilterPreset p){const auto& values=filterPresetDefinitions();const auto n=static_cast<unsigned>(p);if(n>=values.size())throw std::invalid_argument("Unknown filter preset");return values[n];}
inline const FilterPresetDefinition* filterPresetById(std::string_view id){const auto& values=filterPresetDefinitions();const auto it=std::find_if(values.begin(),values.end(),[&](const auto& p){return p.id==id;});return it==values.end()?nullptr:&*it;}
inline bool renderFilterPreset(FilterPreset preset,int width,int height,std::vector<timeline::Pixel>& output,const std::function<bool()>& cancelled={},std::size_t maxPixels=1024*1024){
 (void)filterPresetDefinition(preset);if(width<1||height<1||std::uint64_t(width)*height>maxPixels)throw std::length_error("Filter overlay exceeds pixel budget");auto stop=[&]{return cancelled&&cancelled();};if(stop())return false;std::vector<timeline::Pixel> pixels(std::size_t(width)*height);auto pack=[](unsigned r,unsigned g,unsigned b,unsigned a){return timeline::Pixel(r|(g<<8)|(b<<16)|(a<<24));};
 for(int y=0;y<height;++y){if(stop())return false;for(int x=0;x<width;++x){timeline::Pixel c=0;
  if(preset==FilterPreset::CrtSubtle&&y%2==1)c=pack(0,0,0,64);
  else if(preset==FilterPreset::CrtMedium){if(y%2==1)c=pack(0,0,0,48);else c=x%3==0?pack(255,64,48,28):x%3==1?pack(64,255,96,28):pack(64,128,255,28);}
  else if(preset==FilterPreset::CrtStrong){const int phase=y%3;if(phase==1)c=pack(0,0,0,96);else if(phase==2&&x%2==0)c=pack(0,0,18,48);}
  else if(preset==FilterPreset::VhsColorFringe)c=x%3==0?pack(255,24,92,70):x%3==1?pack(24,220,255,52):0;
  else if(preset==FilterPreset::Vignette){const double dx=(x+.5)/std::max(1,width)-.5,dy=(y+.5)/std::max(1,height)-.5,distance=std::min(1.,std::sqrt(dx*dx+dy*dy)/.7072);c=pack(0,0,0,unsigned(std::clamp(std::floor(std::max(0.,distance-.35)*210+.5),0.,255.)));}
  else if(preset==FilterPreset::PhosphorGlow)c=pack(72,255,144,72);pixels[std::size_t(y)*width+x]=c;
 }}if(stop())return false;output.swap(pixels);return true;
}
struct LcdScreenFilterOptions {int width=1,height=1;};
inline LcdScreenFilterOptions normalizeLcdScreenFilterOptions(double width=1,double height=1){auto n=[](double v){if(!std::isfinite(v))return 1;return int(std::max(1.,std::min(double(std::numeric_limits<int>::max()),std::floor(v+.5))));};return {n(width),n(height)};}
inline timeline::Pixel lcdChannelColorAt(timeline::Pixel c,unsigned channel){if((c>>24)==0)return 0;if(channel>2)throw std::invalid_argument("Invalid LCD channel");return (c&0xff000000u)|(c&(0xffu<<(channel*8)));}
inline std::pair<int,int> lcdChannelOffset(unsigned channel,const LcdScreenFilterOptions& o){if(channel>2)throw std::invalid_argument("Invalid LCD channel");const int direction=channel==0?-1:channel==2?1:0;return {direction*o.width,direction*o.height};}
inline timeline::Pixel lcdScanlineColorAt(int x,int y){return timeline::Pixel(x%4==0?112:y%4==0?36:0)<<24;}
inline bool renderLcdScreen(const timeline::Surface& source,LcdScreenFilterOptions o,std::array<timeline::Surface,4>& output,const std::function<bool()>& cancelled={},std::size_t maxPixels=64*1024*1024){
 raster::validate(source);if(std::uint64_t(source.width)*source.height>maxPixels)throw std::length_error("LCD source exceeds pixel budget");o=normalizeLcdScreenFilterOptions(o.width,o.height);auto stop=[&]{return cancelled&&cancelled();};if(stop())return false;std::array<timeline::Surface,4> candidate;
 for(unsigned channel=0;channel<4;++channel){auto& result=candidate[channel];result.width=source.width;result.height=source.height;result.offsetX=source.offsetX;result.offsetY=source.offsetY;result.storageOriginX=source.storageOriginX;result.storageOriginY=source.storageOriginY;result.pixels.resize(source.pixels.size());const auto offset=channel<3?lcdChannelOffset(channel,o):std::pair<int,int>{0,0};for(int y=0;y<source.height;++y){if(stop())return false;for(int x=0;x<source.width;++x)result.pixels[std::size_t(y)*source.width+x]=channel==3?lcdScanlineColorAt(x,y):lcdChannelColorAt(raster::readLocal(source,std::int64_t(x)-offset.first,std::int64_t(y)-offset.second),channel);}}
 if(stop())return false;output=std::move(candidate);return true;
}

}
