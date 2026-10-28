#pragma once
#include <algorithm>
#include <cmath>
#include <vector>
namespace moon {
inline bool shouldRenderPixelGrid(double zoom){return std::isfinite(zoom)&&zoom>=8;}
inline std::vector<int> pixelGridLines(int origin,double physicalScale,int pixels,int clipFrom,int clipTo){
 std::vector<int> result;if(!std::isfinite(physicalScale)||physicalScale<=0||pixels<0||clipTo<clipFrom)return result;
 const int first=std::max(0,int(std::ceil((clipFrom-origin)/physicalScale))),last=std::min(pixels,int(std::floor((clipTo-origin)/physicalScale)));
 for(int i=first;i<=last;++i)result.push_back(int(std::floor(origin+i*physicalScale+.5)));return result;
}
}
