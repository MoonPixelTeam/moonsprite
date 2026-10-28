#pragma once
#include "document.h"
#include <algorithm>
#include <array>
namespace moon {
enum class ExportProtection {Off,Blur,BlurNoise};
// Legacy core/export-protection.ts. Prepared export buffers only; source surfaces stay untouched.
inline void protectExportPixels(std::vector<Pixel>& pixels,int width,int height,int scalePercent,ExportProtection mode){
 if(mode==ExportProtection::Off||scalePercent<=100)return;
 const std::array<int,5> narrow{0,1,6,1,0},wide{1,6,18,6,1};const auto& weights=scalePercent<400?narrow:wide;const int first=scalePercent<400?1:0,last=scalePercent<400?4:5,divisor=scalePercent<400?8:32;
 // Uint8ClampedArray assignment uses round-to-nearest with ties to even, not JS Math.round.
 auto byte=[](std::uint64_t numerator,std::uint64_t denominator){const auto q=numerator/denominator,r=numerator%denominator;return unsigned(q+(r*2>denominator||(r*2==denominator&&(q&1))));};
 auto pass=[&](const std::vector<Pixel>& input,bool horizontal){std::vector<Pixel> output(input.size());for(int y=0;y<height;++y)for(int x=0;x<width;++x){std::uint64_t red=0,green=0,blue=0,alpha=0;for(int tap=first;tap<last;++tap){const int sx=horizontal?std::clamp(x+tap-2,0,width-1):x,sy=horizontal?y:std::clamp(y+tap-2,0,height-1);const auto value=input[std::size_t(sy)*width+sx];const auto a=std::uint64_t(value>>24)*weights[tap];red+=(value&255)*a;green+=((value>>8)&255)*a;blue+=((value>>16)&255)*a;alpha+=a;}const auto r=alpha?byte(red,alpha):0,g=alpha?byte(green,alpha):0,b=alpha?byte(blue,alpha):0,a=byte(alpha,divisor);output[std::size_t(y)*width+x]=r|(g<<8)|(b<<16)|(a<<24);}return output;};
 auto horizontal=pass(pixels,true);pixels=pass(horizontal,false);
 for(std::size_t i=0;i<pixels.size();++i){const int noise=mode==ExportProtection::BlurNoise?int(((std::uint32_t(i)^0x45d9f3bu)*0x45d9f3bu>>16)%3)-1:0;const auto value=pixels[i];const auto a=value>>24;Pixel result=a<<24;if(a)for(int c=0;c<3;++c)result|=std::uint32_t(std::clamp(int((value>>(c*8))&255)+noise,0,255))<<(c*8);pixels[i]=result;}
}
}
