#pragma once
#include "symmetry_model.h"
#include "selection_transform.h"
namespace moon {
// tools-selection-transform-apply.ts: pressed-region first-write order differs
// from the representative-source branch, which permits repeated destinations.
template<class Write> void symmetryContentTranslation(const SelectionClipboard& source,const SelectionMask& selection,SymmetryPixel start,SymmetryPixel delta,int width,int height,SymmetryAxes axes,SymmetryCenter center,Write write){
 const bool pressed=symmetryUsesPressedRegion(axes,center)&&selectionContains(selection,start.x,start.y);const int sector=symmetryPressedSector(start,axes,center);std::unordered_set<std::size_t> written;
 for(int y=selection.y;y<selection.y+selection.height;++y)for(int x=selection.x;x<selection.x+selection.width;++x){
  if(!selectionContains(selection,x,y))continue;
  if(pressed){if(symmetryPressedSector({x,y},axes,center)!=sector)continue;}
  else{if(x+delta.x<0||y+delta.y<0||x+delta.x>=width||y+delta.y>=height)continue;bool representative=true;for(auto p:symmetryPoints({x,y},width,height,axes,center))if(selectionContains(selection,p.x,p.y)&&p.y*width+p.x<y*width+x){representative=false;break;}if(!representative)continue;}
  const auto value=source.pixels[std::size_t(y-selection.y)*source.width+x-selection.x];if(!(value>>24))continue;
  for(auto p:symmetryPoints({x+delta.x,y+delta.y},width,height,axes,center)){const auto index=std::size_t(p.y)*width+p.x;if(pressed&&!written.insert(index).second)continue;write(p.x,p.y,value);}
 }
}
// tools-selection-transform-apply.ts generic inverse-sampled branch: row-major
// destinations, source-index representatives, ordered repeated orbit writes.
inline bool symmetryScaleRepresentative(SymmetryPixel p,const SelectionMask& selection,int width,int height,SymmetryAxes axes,SymmetryCenter center,bool clip){
 for(auto q:symmetryPoints(p,width,height,axes,center,clip))if(selectionContains(selection,q.x,q.y)&&std::int64_t(q.y)*width+q.x<std::int64_t(p.y)*width+p.x)return false;return true;
}
// Axis scaling must retain selection.ts arithmetic order: the generic native
// matrix inverse introduces a rounding step that changes a flipped texel at
// exact rational boundaries (7.5/9, flipped and multiplied by six).
inline std::optional<std::size_t> symmetryScaleSourceOffset(const SelectionClipboard& source,const SelectionTransform& t,int x,int y){
 double u=(x+.5-t.x)/t.width,v=(y+.5-t.y)/t.height;if(u<-1e-9||u>1+1e-9||v<-1e-9||v>1+1e-9)return {};if(t.flipHorizontal&&(!t.flipOriginX||*t.flipOriginX>t.x+1e-9))u=1-u;if(t.flipVertical&&(!t.flipOriginY||*t.flipOriginY>t.y+1e-9))v=1-v;const int sx=std::clamp(int(std::floor(u*source.width)),0,source.width-1),sy=std::clamp(int(std::floor(v*source.height)),0,source.height-1);const auto offset=std::size_t(sy)*source.width+sx;return source.mask[offset]==1?std::optional<std::size_t>{offset}:std::nullopt;
}
template<class Write> void symmetryContentScale(const SelectionClipboard& source,const SelectionMask& selection,const SelectionTransform& target,int width,int height,SymmetryAxes axes,SymmetryCenter center,Write write,bool geometry=false,const SelectionMask* region=nullptr){
 const auto b=transformBounds(target);const int left=geometry?b.x:std::max(0,b.x),top=geometry?b.y:std::max(0,b.y),right=geometry?b.x+b.width:std::min(width,b.x+b.width),bottom=geometry?b.y+b.height:std::min(height,b.y+b.height);
 // Deferred display only visits inverse-orbit rectangles of the requested tile.
 // The two-pixel halo covers integer floor asymmetry at mixed half-pixel centers.
 std::vector<SelectionMask> visits;if(region){const auto& matrices=symmetryMatrices(axes);for(auto m:matrices){int l=right,t=bottom,r=left,b=top;for(auto corner:std::array<SymmetryPixel,4>{{{region->x,region->y},{region->x+region->width-1,region->y},{region->x,region->y+region->height-1},{region->x+region->width-1,region->y+region->height-1}}}){const double dx=corner.x+.5-center.x,dy=corner.y+.5-center.y;const int px=int(std::floor(center.x+m.xx*dx+m.yx*dy)),py=int(std::floor(center.y+m.xy*dx+m.yy*dy));l=std::min(l,px-2);t=std::min(t,py-2);r=std::max(r,px+3);b=std::max(b,py+3);}l=std::max(l,left);t=std::max(t,top);r=std::min(r,right);b=std::min(b,bottom);if(r>l&&b>t)visits.push_back({l,t,r-l,b-t,{}});}}else visits.push_back({left,top,right-left,bottom-top,{}});
 int first=bottom,last=top;for(const auto& v:visits){first=std::min(first,v.y);last=std::max(last,v.y+v.height);}for(int y=first;y<last;++y){std::vector<std::pair<int,int>> spans;for(const auto& v:visits)if(y>=v.y&&y<v.y+v.height)spans.push_back({v.x,v.x+v.width});std::sort(spans.begin(),spans.end());int scanned=left;for(auto span:spans){const int begin=std::max(scanned,span.first);scanned=std::max(scanned,span.second);for(int x=begin;x<span.second;++x){const auto offset=symmetryScaleSourceOffset(source,target,x,y);if(!offset)continue;SymmetryPixel p{selection.x+int(*offset%source.width),selection.y+int(*offset/source.width)};if(!geometry){const auto index=std::int64_t(p.y)*width+p.x;p={int(index%width),int(std::floor(double(index)/width))};}if(!symmetryScaleRepresentative(p,selection,width,height,axes,center,!geometry))continue;const auto value=source.pixels[*offset];if(!geometry&&!(value>>24))continue;for(auto q:symmetryPoints({x,y},width,height,axes,center,!geometry)){if(region&&(q.x<region->x||q.y<region->y||q.x>=region->x+region->width||q.y>=region->y+region->height))continue;write(q.x,q.y,value);}}}}
}
inline std::optional<SelectionMask> symmetryScaleSelection(const SelectionClipboard& source,const SelectionMask& selection,const SelectionTransform& target,int width,int height,SymmetryAxes axes,SymmetryCenter center){
 std::vector<SymmetryPixel> points;symmetryContentScale(source,selection,target,width,height,axes,center,[&](int x,int y,std::uint32_t){points.push_back({x,y});},true);if(points.empty())return {};int left=points.front().x,top=points.front().y,right=left,bottom=top;for(auto p:points){left=std::min(left,p.x);top=std::min(top,p.y);right=std::max(right,p.x);bottom=std::max(bottom,p.y);}SelectionMask out{left,top,right-left+1,bottom-top+1,{}};out.mask.resize(std::size_t(out.width)*out.height);for(auto p:points)out.mask[std::size_t(p.y-top)*out.width+p.x-left]=1;return out;
}
struct SymmetryRotationWrite{int x,y;std::uint32_t value;};
// Immutable transform raster: preserve each destination's legacy write order,
// while tile bins let deferred display read only its requested region. Fast
// contour hole filling is computed once over the full clipped raster.
struct SymmetryRotationRaster {
 SelectionTransform target;bool optimized=false;int width=0,height=0,columns=0;std::map<std::size_t,std::vector<SymmetryRotationWrite>> tiles;
 bool matches(const SelectionTransform& t,bool opt)const{return opt==optimized&&target.x==t.x&&target.y==t.y&&target.width==t.width&&target.height==t.height&&target.angle==t.angle&&target.flipHorizontal==t.flipHorizontal&&target.flipVertical==t.flipVertical&&target.flipOriginX==t.flipOriginX&&target.flipOriginY==t.flipOriginY&&target.shearX==t.shearX&&target.shearY==t.shearY&&((!target.legacyShear&&!t.legacyShear)||(target.legacyShear&&t.legacyShear&&*target.legacyShear==*t.legacyShear));}
 std::size_t bytes()const{std::size_t out=sizeof(*this)+tiles.size()*96;for(const auto& entry:tiles)out+=entry.second.capacity()*sizeof(SymmetryRotationWrite);return out;}
 template<class Write>void each(Write write)const{for(const auto& entry:tiles)for(const auto& p:entry.second)write(p.x,p.y,p.value);}
 template<class Write>void region(int x,int y,int w,int h,Write write)const{const int left=std::max(0,x),top=std::max(0,y),right=std::min(width,x+w),bottom=std::min(height,y+h);if(right<=left||bottom<=top)return;for(int ty=top/64;ty<=(bottom-1)/64;++ty)for(int tx=left/64;tx<=(right-1)/64;++tx){const auto found=tiles.find(std::size_t(ty)*columns+tx);if(found==tiles.end())continue;for(const auto& p:found->second)if(p.x>=left&&p.x<right&&p.y>=top&&p.y<bottom)write(p.x,p.y,p.value);}}
};
inline std::shared_ptr<const SymmetryRotationRaster> symmetryContentRotation(const SelectionClipboard& source,const SelectionMask& selection,const SelectionTransform& target,int width,int height,SymmetryAxes axes,SymmetryCenter center,bool optimized,SelectionRotSpriteSource* sampler){
 auto raster=std::make_shared<SymmetryRotationRaster>();raster->target=target;raster->optimized=optimized;raster->width=width;raster->height=height;raster->columns=(width+63)/64;
 const auto cells=optimized?rotSpriteSelectionCells(source,target,width,height,*sampler,true):fastSelectionTransformCells(source,target,width,height,false,true,true);
 for(const auto& cell:cells){if(cell.sourceOffset==std::size_t(-1))throw std::logic_error("Rotation source metadata missing");const int sx=selection.x+int(cell.sourceOffset%source.width),sy=selection.y+int(cell.sourceOffset/source.width);const auto index=std::int64_t(sy)*width+sx;const SymmetryPixel point{int(index%width),int(std::floor(double(index)/width))};if(!symmetryScaleRepresentative(point,selection,width,height,axes,center,true))continue;for(auto p:symmetryPoints({cell.x,cell.y},width,height,axes,center))raster->tiles[std::size_t(p.y/64)*raster->columns+p.x/64].push_back({p.x,p.y,cell.value});}
 return raster;
}
inline std::optional<SelectionMask> symmetryRotationSelection(const SelectionClipboard& source,const SelectionMask& selection,const SelectionTransform& target,int width,int height,SymmetryAxes axes,SymmetryCenter center){
 const auto bounds=legacySymmetryTransformBounds(target);std::vector<SymmetryPixel> points;for(int y=bounds.y;y<bounds.y+bounds.height;++y)for(int x=bounds.x;x<bounds.x+bounds.width;++x){const auto offset=legacyRotationSourceOffset(source,target,x,y);if(!offset)continue;const SymmetryPixel p{selection.x+int(*offset%source.width),selection.y+int(*offset/source.width)};if(!symmetryScaleRepresentative(p,selection,width,height,axes,center,false))continue;for(auto q:symmetryPoints({x,y},width,height,axes,center,false))points.push_back(q);}if(points.empty())return {};int left=points.front().x,top=points.front().y,right=left,bottom=top;for(auto p:points){left=std::min(left,p.x);top=std::min(top,p.y);right=std::max(right,p.x);bottom=std::max(bottom,p.y);}SelectionMask out{left,top,right-left+1,bottom-top+1,{}};out.mask.resize(std::size_t(out.width)*out.height);for(auto p:points)out.mask[std::size_t(p.y-top)*out.width+p.x-left]=1;return out;
}

}
