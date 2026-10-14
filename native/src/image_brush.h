// Copyright (c) 2026 MoonSprite contributors; legacy/LICENSE.
// Native adaptation of tools-brush.ts brushMaskOffsets / paintBrush.
#pragma once
#include "pattern_fill.h"
namespace moon {
struct ImageBrushSample {int x,y,coverage;std::optional<std::uint32_t> color;};
struct ImageBrushStamp {int width,height;std::vector<ImageBrushSample> samples;};
inline ImageBrushStamp prepareImageBrushStamp(const PatternBrush& image,int size,double angle){
 const auto count=std::uint64_t(image.width)*image.height;if(image.width<1 || image.height<1 || count>16*1024*1024 || image.coverage.size()!=count || (!image.colors.empty() && image.colors.size()!=count) || (!image.paintColors.empty() && image.paintColors.size()!=count))throw std::invalid_argument("Invalid image brush pixels");if(!image.intrinsicSize)throw std::invalid_argument("Scaled grayscale/procedural image brushes are not migrated");if(!std::isfinite(angle))throw std::invalid_argument("Invalid image brush angle");
 const double radians=std::fmod(angle,360)*3.14159265358979323846/180,c=std::cos(radians),s=std::sin(radians);ImageBrushStamp out{std::max(1,int(std::ceil(image.width*std::abs(c)+image.height*std::abs(s)-1e-9))),std::max(1,int(std::ceil(image.width*std::abs(s)+image.height*std::abs(c)-1e-9))),{}};
 const auto& colors=image.paintColors.empty()?image.colors:image.paintColors;
 for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){const double ox=x-(out.width-1)/2.0,oy=y-(out.height-1)/2.0;const int sx=int(std::floor(c*ox+s*oy+(image.width-1)/2.0+.5)),sy=int(std::floor(-s*ox+c*oy+(image.height-1)/2.0+.5));if(sx<0 || sy<0 || sx>=image.width || sy>=image.height)continue;const auto i=std::size_t(sy)*image.width+sx;const int coverage=colors.empty()?image.coverage[i]:(colors[i]>>24)?255:0;if(coverage)out.samples.push_back({x,y,coverage,colors.empty()?std::optional<std::uint32_t>{}:std::optional<std::uint32_t>{colors[i]}});}return out;
}
inline std::uint32_t imageBrushDirectPixel(std::uint32_t source,int coverage,int opacity){const int scaled=int(std::floor(coverage*std::clamp(opacity,0,100)/100.0+.5));return (source&0xffffff)|(std::uint32_t(std::floor((source>>24)*scaled/255.0+.5))<<24);}
}
