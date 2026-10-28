#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <unordered_set>
#include <vector>
#include <array>
#include "selection_model.h"
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
// legacy core/symmetry.ts symmetrySelection: union unique clipped pixel orbits.
inline std::optional<SelectionMask> symmetrySelection(const std::optional<SelectionMask>& selection,int width,int height,SymmetryAxes axes,SymmetryCenter center){
 if(!selection||!symmetryHas(axes))return selection;
 std::vector<SymmetryPixel> points;std::unordered_set<std::uint64_t> seen;int left=width,top=height,right=-1,bottom=-1;
 for(int y=selection->y;y<selection->y+selection->height;++y)for(int x=selection->x;x<selection->x+selection->width;++x){if(!selectionContains(selection,x,y))continue;for(auto point:symmetryPoints({x,y},width,height,axes,center)){const auto key=(std::uint64_t(std::uint32_t(point.x))<<32)|std::uint32_t(point.y);if(!seen.insert(key).second)continue;points.push_back(point);left=std::min(left,point.x);top=std::min(top,point.y);right=std::max(right,point.x);bottom=std::max(bottom,point.y);}}
 if(points.empty())return {};SelectionMask result{left,top,right-left+1,bottom-top+1,{}};result.mask.resize(std::size_t(result.width)*result.height);for(auto point:points)result.mask[std::size_t(point.y-top)*result.width+point.x-left]=1;return result;
}
// legacy core/symmetry.ts: keep matrix association and first-seen orbit order.
struct SymmetryOrbitPixel {SymmetryPixel point;SymmetryMatrix matrix;};
inline std::vector<SymmetryOrbitPixel> symmetryPixelOrbit(SymmetryPixel point,int width,int height,SymmetryAxes axes,SymmetryCenter center,bool clip){
 std::vector<SymmetryOrbitPixel> out;const auto& matrices=symmetryMatrices(axes);const double dx=point.x+.5-center.x,dy=point.y+.5-center.y;
 for(std::size_t i=0;i<matrices.size();++i){const auto m=matrices[i];const SymmetryPixel p=i?SymmetryPixel{int(std::floor(center.x+m.xx*dx+m.xy*dy)),int(std::floor(center.y+m.yx*dx+m.yy*dy))}:point;if(clip&&(p.x<0||p.y<0||p.x>=width||p.y>=height))continue;if(std::none_of(out.begin(),out.end(),[&](const auto& v){return v.point.x==p.x&&v.point.y==p.y;}))out.push_back({p,m});}return out;
}
inline bool symmetryRotationalOnly(SymmetryAxes a){return a.rotational&&!a.horizontal&&!a.vertical&&!a.diagonalUp&&!a.diagonalDown;}
inline bool symmetryUsesPressedRegion(SymmetryAxes axes,SymmetryCenter center){if(symmetryRotationalOnly(axes))return true;if(!symmetryHas(axes)||std::floor(center.x-center.y)==center.x-center.y)return false;const auto& matrices=symmetryMatrices(axes);return std::any_of(matrices.begin(),matrices.end(),[](auto m){return m.xy!=0;});}
inline int symmetryPressedSector(SymmetryPixel p,SymmetryAxes axes,SymmetryCenter center){
 const double dx=p.x+.5-center.x,dy=p.y+.5-center.y;if(symmetryRotationalOnly(axes)){const double epsilon=1e-9;if(std::abs(dx)<epsilon&&std::abs(dy)<epsilon)return -1;if(std::abs(dx)<epsilon)return dy<0?0:2;if(std::abs(dy)<epsilon)return dx>=0?1:3;return dx>=0?(dy<0?1:2):(dy<0?0:3);}
 double bx=dx,by=dy;int sector=0;const auto& matrices=symmetryMatrices(axes);for(std::size_t i=0;i<matrices.size();++i){const auto m=matrices[i];const double x=m.xx*dx+m.xy*dy,y=m.yx*dx+m.yy*dy;if(y<by||(y==by&&x<bx)){bx=x;by=y;sector=int(i);}}return sector;
}
inline SymmetryPixel symmetrySelectionDragDelta(const SelectionMask& selection,SymmetryPixel start,SymmetryPixel delta,int width,int height,SymmetryAxes axes,SymmetryCenter center){
 if(!symmetryHas(axes)||(symmetryUsesPressedRegion(axes,center)&&selectionContains(selection,start.x,start.y)))return delta;const auto orbit=symmetryPixelOrbit(start,width,height,axes,center,false);const bool selected=std::any_of(orbit.begin(),orbit.end(),[&](auto v){return selectionContains(selection,v.point.x,v.point.y);});const SymmetryOrbitPixel* best=nullptr;for(const auto& v:orbit){if(selected&&!selectionContains(selection,v.point.x,v.point.y))continue;if(!best||v.point.y*width+v.point.x<best->point.y*width+best->point.x)best=&v;}if(!best)return delta;const auto m=best->matrix;return {m.xx*delta.x+m.xy*delta.y,m.yx*delta.x+m.yy*delta.y};
}
// Only the integer translation branch of transformSymmetrySelection, with a pressed region.
inline std::optional<SelectionMask> translateSymmetrySelection(const SelectionMask& selection,SymmetryPixel start,SymmetryPixel delta,int width,int height,SymmetryAxes axes,SymmetryCenter center,bool clipToCanvas=true){
 std::vector<SymmetryPixel> points;std::unordered_set<std::uint64_t> seen;auto append=[&](SymmetryPixel p){const auto key=(std::uint64_t(std::uint32_t(p.x))<<32)|std::uint32_t(p.y);if(seen.insert(key).second)points.push_back(p);};
 const bool pressed=symmetryUsesPressedRegion(axes,center)&&selectionContains(selection,start.x,start.y);const int sector=symmetryPressedSector(start,axes,center);
 auto collect=[&](bool region){for(int y=selection.y;y<selection.y+selection.height;++y)for(int x=selection.x;x<selection.x+selection.width;++x){if(!selectionContains(selection,x,y))continue;if(region){if(symmetryPressedSector({x,y},axes,center)!=sector)continue;}else{const int tx=x+delta.x,ty=y+delta.y;if(clipToCanvas&&(tx<0||ty<0||tx>=width||ty>=height))continue;bool representative=true;for(auto p:symmetryPoints({x,y},width,height,axes,center,clipToCanvas))if(selectionContains(selection,p.x,p.y)&&p.y*width+p.x<y*width+x){representative=false;break;}if(!representative)continue;}for(auto p:symmetryPoints({x+delta.x,y+delta.y},width,height,axes,center,clipToCanvas))append(p);}};
 if(pressed)collect(true);if(points.empty())collect(false);if(points.empty())return {};int left=points.front().x,top=points.front().y,right=left,bottom=top;for(auto p:points){left=std::min(left,p.x);top=std::min(top,p.y);right=std::max(right,p.x);bottom=std::max(bottom,p.y);}SelectionMask out{left,top,right-left+1,bottom-top+1,{}};out.mask.resize(std::size_t(out.width)*out.height);for(auto p:points)out.mask[std::size_t(p.y-top)*out.width+p.x-left]=1;return out;
}
inline bool symmetryAxisDragAllowed(bool locked,bool ctrlHeld){return !locked||ctrlHeld;}
}
