#pragma once
#include <algorithm>
#include <cmath>
#include <vector>
namespace moon {
struct GridSettings { double x=0,y=0,width=16,height=16;bool operator==(const GridSettings& o) const{return x==o.x&&y==o.y&&width==o.width&&height==o.height;}bool operator!=(const GridSettings& o)const{return !(*this==o);} };
inline GridSettings normalizeGridSettings(GridSettings v={}){return {std::isfinite(v.x)?std::trunc(v.x):0,std::isfinite(v.y)?std::trunc(v.y):0,std::isfinite(v.width)?std::max(1.,std::trunc(v.width)):16,std::isfinite(v.height)?std::max(1.,std::trunc(v.height)):16};}
// Legacy core/grid.ts; zoom is logical view zoom, independent of UI/DPI scale.
inline std::vector<double> gridLinePositions(double origin,double cellSize,double from,double to,double zoom,double minimumScreenSpacing=4){
 std::vector<double> result;if(!std::isfinite(origin)||!std::isfinite(cellSize)||cellSize<=0||!std::isfinite(from)||!std::isfinite(to)||to<from)return result;
 const double spacing=std::abs(cellSize*zoom);if(std::isnan(spacing)||std::isnan(minimumScreenSpacing))return result;
 const double stride=spacing<=0?1:std::max(1.,std::ceil(minimumScreenSpacing/spacing));const double first=std::ceil((from-origin)/cellSize),last=std::floor((to-origin)/cellSize),aligned=std::ceil(first/stride)*stride;
 if(!std::isfinite(stride)||!std::isfinite(aligned)||!std::isfinite(last)||aligned>last)return result;
 const double count=std::floor((last-aligned)/stride)+1;if(!std::isfinite(count)||count>1024*1024)return result;
 result.reserve(static_cast<std::size_t>(std::max(0.,count)));
 for(double index=aligned;index<=last;){const double position=origin+index*cellSize;if(!std::isfinite(position))break;result.push_back(position);const double next=index+stride;if(!std::isfinite(next)||next<=index)break;index=next;}return result;
}
}
