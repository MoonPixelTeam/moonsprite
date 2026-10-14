#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <unordered_set>
#include <vector>
#include <array>
namespace moon {
struct SymmetryPixel {int x,y;};
struct SymmetryAxes {bool horizontal=false,vertical=false,diagonalUp=false,diagonalDown=false,rotational=false;};
struct SymmetryCenter {double x=0,y=0;};
enum class SymmetryAxis {Horizontal,Vertical,DiagonalUp,DiagonalDown,Rotational,Center};
inline SymmetryCenter defaultSymmetryCenter(int width,int height){return {width/2.0,height/2.0};}
inline SymmetryCenter moveSymmetryCenter(SymmetryCenter center,SymmetryAxis axis,SymmetryCenter point,int width,int height){
 if(axis==SymmetryAxis::Center){center=point;}else if(axis==SymmetryAxis::Horizontal)center.y=point.y;else if(axis==SymmetryAxis::Vertical)center.x=point.x;else if(axis==SymmetryAxis::DiagonalDown){const auto d=(point.y-center.y-(point.x-center.x))/2;center.x-=d;center.y+=d;}else{const auto d=(point.x-center.x+point.y-center.y)/2;center.x+=d;center.y+=d;}
 center.x=std::clamp(std::floor(center.x*2+.5)/2,0.0,double(width));center.y=std::clamp(std::floor(center.y*2+.5)/2,0.0,double(height));return center;
}
struct SymmetryMatrix{int xx,xy,yx,yy;};
inline const std::vector<SymmetryMatrix>& symmetryMatrices(SymmetryAxes axes){
 const unsigned key=unsigned(axes.horizontal)|(axes.vertical<<1)|(axes.diagonalDown<<2)|(axes.diagonalUp<<3)|(axes.rotational<<4);static std::array<std::vector<SymmetryMatrix>,32> cache;auto& stored=cache[key];if(!stored.empty())return stored;
 using M=SymmetryMatrix;std::vector<M> generators;if(axes.horizontal)generators.push_back({1,0,0,-1});if(axes.vertical)generators.push_back({-1,0,0,1});if(axes.diagonalDown)generators.push_back({0,1,1,0});if(axes.diagonalUp)generators.push_back({0,-1,-1,0});if(axes.rotational)generators.push_back({0,-1,1,0});std::vector<M> group{{1,0,0,1}};auto same=[](M a,M b){return a.xx==b.xx&&a.xy==b.xy&&a.yx==b.yx&&a.yy==b.yy;};for(size_t i=0;i<group.size();++i)for(auto g:generators){M n{g.xx*group[i].xx+g.xy*group[i].yx,g.xx*group[i].xy+g.xy*group[i].yy,g.yx*group[i].xx+g.yy*group[i].yx,g.yx*group[i].xy+g.yy*group[i].yy};if(std::none_of(group.begin(),group.end(),[&](M x){return same(x,n);}))group.push_back(n);}
 stored=std::move(group);return stored;
}
inline std::vector<SymmetryPixel> symmetryPoints(SymmetryPixel point,int width,int height,SymmetryAxes axes,SymmetryCenter center,bool clip=true){
 const auto& group=symmetryMatrices(axes); std::vector<SymmetryPixel> result;std::unordered_set<std::uint64_t> seen;const double dx=point.x+.5-center.x,dy=point.y+.5-center.y;for(size_t i=0;i<group.size();++i){const auto m=group[i];const int x=i?int(std::floor(center.x+m.xx*dx+m.xy*dy)):point.x,y=i?int(std::floor(center.y+m.yx*dx+m.yy*dy)):point.y;if(clip&&(x<0||y<0||x>=width||y>=height))continue;const auto key=(std::uint64_t(std::uint32_t(x))<<32)|std::uint32_t(y);if(seen.insert(key).second)result.push_back({x,y});}return result;
}
template<class Painter> inline void symmetryPaintSpan(int y,int left,int right,int width,int height,SymmetryAxes axes,SymmetryCenter center,Painter paint){
 if(right<left)return;paint(y,left,right);const auto& matrices=symmetryMatrices(axes);const double dx=left+.5-center.x,dy=y+.5-center.y,endDx=right+.5-center.x;
 for(size_t i=1;i<matrices.size();++i){auto m=matrices[i];const int x=int(std::floor(center.x+m.xx*dx+m.xy*dy)),py=int(std::floor(center.y+m.yx*dx+m.yy*dy));if(m.xx){const int endX=int(std::floor(center.x+m.xx*endDx+m.xy*dy));paint(py,std::min(x,endX),std::max(x,endX));}else if(x>=0&&x<width){const int endY=int(std::floor(center.y+m.yx*endDx+m.yy*dy));for(int row=std::max(0,std::min(py,endY));row<=std::min(height-1,std::max(py,endY));++row)paint(row,x,x);}}
}
inline bool symmetryHas(SymmetryAxes a){return a.horizontal||a.vertical||a.diagonalUp||a.diagonalDown||a.rotational;}
inline bool symmetryAxisDragAllowed(bool locked,bool ctrlHeld){return !locked||ctrlHeld;}
}
