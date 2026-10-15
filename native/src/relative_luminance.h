#pragma once
#include "timeline_model.h"
#include <algorithm>
#include <array>
#include <cmath>
namespace moon {
// legacy core/raster.ts relativeLuminanceColor/applyRelativeLuminance.
inline timeline::Pixel relativeLuminancePixel(timeline::Pixel c){
 static const auto table=[]{std::array<double,256> values{};for(unsigned i=0;i<256;++i){double v=i/255.;values[i]=v<=.04045?v/12.92:std::pow((v+.055)/1.055,2.4);}return values;}();
 auto linear=[&](unsigned channel){return table[channel];};
 const double l=.2126*linear(c&255)+.7152*linear((c>>8)&255)+.0722*linear((c>>16)&255);
 const double v=255*(l<=.0031308?l*12.92:1.055*std::pow(l,1/2.4)-.055);
 const auto gray=timeline::Pixel(std::clamp(int(std::floor(v+.5)),0,255));return (c&0xff000000)|gray|(gray<<8)|(gray<<16);
}
}
