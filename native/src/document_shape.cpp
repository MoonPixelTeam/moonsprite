#include "document.h"
#include "raster_geometry.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <stdexcept>
namespace moon {
namespace {
constexpr std::size_t shapeLimit=256*1024*1024;
void shapeBytes(std::size_t& used,std::size_t n){if(n>shapeLimit-used)throw std::length_error("Shape exceeds document pixel budget");used+=n;}
void shapePixels(std::size_t& used,std::size_t n){if(n>(shapeLimit-used)/sizeof(Pixel))throw std::length_error("Shape exceeds document pixel budget");used+=n*sizeof(Pixel);}
raster::Rect64 shapeUnion(raster::Rect64 a,raster::Rect64 b){return {std::min(a.left,b.left),std::min(a.top,b.top),std::max(a.right,b.right),std::max(a.bottom,b.bottom)};}
bool shapeEmpty(raster::Rect64 r){return r.right<=r.left||r.bottom<=r.top;}
}
bool Document::beginSparseShape(){
 const auto r=timeline_.resolveSurface(cel().id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::logic_error("Invalid shape owner");const auto& s=*r.surface;raster::validate(s);
 std::size_t used=0;for(const auto& c:timeline_.state().cels)if(c.surface)shapePixels(used,c.surface->pixels.size());const auto count=std::size_t(width_)*height_;shapePixels(used,count);shapePixels(used,count);
 if(gradient_){shapePixels(used,gradient_->preview.size());if(gradient_->sparse)shapePixels(used,gradient_->sparse->canvas.size());if(gradient_->shapePaintMask)shapeBytes(used,gradient_->shapePaintMask->mask.size());}
 auto baseline=sparseFillCanvas(s);GradientPreview pending{{},cel().id,layer().id,frame().id,baseline,selection_,{},{},contentRevision_,true};pending.sparse=SparseGradientBaseline{std::move(baseline),r.source->id,s.width,s.height,s.offsetX,s.offsetY,s.storageOriginX,s.storageOriginY};gradient_=std::move(pending);++gradientRevision_;return true;
}
bool Document::updateSparseShape(const ShapeSpec& spec,Pixel color){
 if(!sparseGradientSourceValid()){cancelGradient();return false;}auto& g=*gradient_;const auto& baseline=g.sparse->canvas;const auto resolved=timeline_.resolveSurface(g.celId);const auto& source=*resolved.surface;
 std::size_t used=0;for(const auto& c:timeline_.state().cels)if(c.surface)shapePixels(used,c.surface->pixels.size());shapePixels(used,baseline.size());shapePixels(used,g.preview.size());if(g.shapePaintMask)shapeBytes(used,g.shapePaintMask->mask.size());
 // All new work, including symmetry allocations, precedes the first preview write.
 raster::Rect64 domain{0,0,width_,height_};const bool line=spec.kind==ShapeKind::Line;
 const bool axis=std::abs(std::fmod(spec.bounds.angle,360))<1e-9;
 if(symmetryHas(symmetryAxes)&&(line||axis))for(auto p:std::array<SymmetryPixel,4>{{{0,0},{width_-1,0},{0,height_-1},{width_-1,height_-1}}})for(auto q:symmetryPoints(p,width_,height_,symmetryAxes,symmetryCenter(),false))domain=shapeUnion(domain,{q.x,q.y,std::int64_t(q.x)+1,std::int64_t(q.y)+1});
 const int size=std::clamp(spec.brush.size,1,64),anchor=size/2;
 raster::Rect64 rawLine{};
 if(line){const auto ax=std::int64_t(int(spec.start.x)),ay=std::int64_t(int(spec.start.y)),bx=std::int64_t(int(spec.end.x)),by=std::int64_t(int(spec.end.y));rawLine={std::min(ax,bx)-anchor,std::min(ay,by)-anchor,std::max(ax,bx)-anchor+size,std::max(ay,by)-anchor+size};}
 const auto primitive=(spec.kind==ShapeKind::Polygon||spec.kind==ShapeKind::Freeform)?[&]{const auto& path=spec.polygonFilled?spec.polygonPath:spec.polygonContour;if(path.empty())return raster::Rect64{};raster::Rect64 r{path[0].x,path[0].y,std::int64_t(path[0].x)+1,std::int64_t(path[0].y)+1};for(auto p:path)r=shapeUnion(r,{p.x,p.y,std::int64_t(p.x)+1,std::int64_t(p.y)+1});return r;}():line?rawLine:[&]{const auto b=transformBounds(spec.bounds);return raster::Rect64{b.x,b.y,std::int64_t(b.x)+b.width,std::int64_t(b.y)+b.height};}();
 domain={std::max(domain.left,primitive.left),std::max(domain.top,primitive.top),std::min(domain.right,primitive.right),std::min(domain.bottom,primitive.bottom)};
 auto symmetricRect=[&](raster::Rect64 r){std::optional<raster::Rect64> result;for(auto p:std::array<SymmetryPixel,4>{{{raster::coordinate(r.left),raster::coordinate(r.top)},{raster::coordinate(r.right-1),raster::coordinate(r.top)},{raster::coordinate(r.left),raster::coordinate(r.bottom-1)},{raster::coordinate(r.right-1),raster::coordinate(r.bottom-1)}}})for(auto q:symmetryPoints(p,width_,height_,symmetryAxes,symmetryCenter())){const raster::Rect64 pixel{q.x,q.y,std::int64_t(q.x)+1,std::int64_t(q.y)+1};result=result?shapeUnion(*result,pixel):pixel;}return result.value_or(r);};
 raster::Rect64 geometry{source.offsetX,source.offsetY,std::int64_t(source.offsetX)+source.width,std::int64_t(source.offsetY)+source.height};std::optional<raster::Rect64> requested;bool placeholder=source.width==1&&source.height==1&&(source.pixels[0]>>24)==0;
 auto ensure=[&](raster::Rect64 r){r={std::max<std::int64_t>(0,r.left),std::max<std::int64_t>(0,r.top),std::min<std::int64_t>(width_,r.right),std::min<std::int64_t>(height_,r.bottom)};if(shapeEmpty(r))return false;if(r.left>=geometry.left&&r.top>=geometry.top&&r.right<=geometry.right&&r.bottom<=geometry.bottom)return true;const raster::Rect64 padded{std::max<std::int64_t>(0,r.left-64),std::max<std::int64_t>(0,r.top-64),std::min<std::int64_t>(width_,r.right+64),std::min<std::int64_t>(height_,r.bottom+64)};requested=requested?shapeUnion(*requested,padded):padded;geometry=placeholder?padded:shapeUnion(geometry,padded);placeholder=false;return true;};
 const bool lineAllowed=!line||ensure(symmetricRect(rawLine));
 std::optional<SelectionMask> sourceMask;ShapeSpec local=spec;int dw=0,dh=0;
 if(!shapeEmpty(domain)){
  dw=raster::coordinate(domain.right-domain.left);dh=raster::coordinate(domain.bottom-domain.top);local.start.x-=domain.left;local.start.y-=domain.top;local.end.x-=domain.left;local.end.y-=domain.top;local.bounds.x-=domain.left;local.bounds.y-=domain.top;for(auto& p:local.polygonPath){p.x-=int(domain.left);p.y-=int(domain.top);}for(auto& p:local.polygonContour){p.x-=int(domain.left);p.y-=int(domain.top);}
  if(!line){const auto count=std::size_t(dw)*dh;if(count>(shapeLimit-used)/3)throw std::length_error("Shape raster exceeds document pixel budget");shapeBytes(used,count*3);sourceMask=shapeMask(local,dw,dh);}
 }
 shapeBytes(used,std::size_t(width_)*height_);
 auto eachSource=[&](auto&& emit){
  if(dw<1||dh<1)return;
  if(line){if(!lineAllowed)return;const auto spans=brushSpans(spec.brush);shapeLineCenters(local.start,local.end,dw,dh,size,[&](int x,int y){const auto wx=std::int64_t(x)+domain.left,wy=std::int64_t(y)+domain.top;if(!ensure(symmetricRect({wx-anchor,wy-anchor,wx-anchor+size,wy-anchor+size})))return;for(auto span:spans)for(int px=std::max(0,x-anchor+span.left);px<=std::min(dw-1,x-anchor+span.right);++px){const auto py=std::int64_t(y)-anchor+span.y;if(py>=0&&py<dh)emit(raster::coordinate(std::int64_t(px)+domain.left),raster::coordinate(py+domain.top));}},spec.brush.shape==BrushShape::Line);}
  else if(sourceMask)for(int y=sourceMask->y;y<sourceMask->y+sourceMask->height;++y)for(int x=sourceMask->x;x<sourceMask->x+sourceMask->width;++x)if(selectionContains(sourceMask,x,y))emit(raster::coordinate(std::int64_t(x)+domain.left),raster::coordinate(std::int64_t(y)+domain.top));
 };
 PixelRegion all,touched;
 eachSource([&](int x,int y){for(auto p:symmetryPoints({x,y},width_,height_,symmetryAxes,symmetryCenter())){all.include(p.x,p.y);if(!g.selection||selectionContains(g.selection,p.x,p.y))touched.include(p.x,p.y);}});
 if(!line&&!all.empty())ensure({all.x,all.y,std::int64_t(all.x)+all.w,std::int64_t(all.y)+all.h});
 std::optional<SelectionMask> painted;
 if(!touched.empty()){
  painted=SelectionMask{touched.x,touched.y,touched.w,touched.h,std::vector<unsigned char>(std::size_t(touched.w)*touched.h)};
  eachSource([&](int x,int y){for(auto p:symmetryPoints({x,y},width_,height_,symmetryAxes,symmetryCenter()))if(!g.selection||selectionContains(g.selection,p.x,p.y))painted->mask[std::size_t(p.y-painted->y)*painted->width+p.x-painted->x]=1;});
 }
 std::optional<SelectionMask> expansion;if(requested)expansion=SelectionMask{raster::coordinate(requested->left),raster::coordinate(requested->top),raster::coordinate(requested->right-requested->left),raster::coordinate(requested->bottom-requested->top),{}};
 // No allocation or raster/symmetry work remains after this point.
 if(g.region){const auto& r=*g.region;for(int y=r.y;y<r.y+r.height;++y)std::copy_n(baseline.begin()+std::size_t(y)*width_+r.x,r.width,g.preview.begin()+std::size_t(y)*width_+r.x);}
 if(painted)for(int y=painted->y;y<painted->y+painted->height;++y)for(int x=painted->x;x<painted->x+painted->width;++x)if(selectionContains(painted,x,y)){const auto i=std::size_t(y)*width_+x;g.preview[i]=((((spec.kind==ShapeKind::Polygon||spec.kind==ShapeKind::Freeform)||spec.brush.ink==InkMode::Simple)&&!(color>>24))?color:inkBrushComposite(baseline[i],color,100,(spec.kind==ShapeKind::Polygon||spec.kind==ShapeKind::Freeform)?InkMode::Simple:spec.brush.ink));}
 g.region=touched.empty()?std::optional<SelectionMask>{}:std::optional<SelectionMask>{SelectionMask{touched.x,touched.y,touched.w,touched.h,{}}};g.shapePaintMask=std::move(painted);g.shapeExpansion=std::move(expansion);++gradientRevision_;return true;
}
bool Document::commitSparseShape(){
 if(!sparseGradientSourceValid()){cancelGradient();return false;}const auto& g=*gradient_;const auto resolved=timeline_.resolveSurface(g.celId);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)throw std::logic_error("Invalid shape owner");const auto& source=*resolved.surface;
 std::size_t used=0;for(const auto& c:timeline_.state().cels)if(c.surface)shapePixels(used,c.surface->pixels.size());shapePixels(used,g.sparse->canvas.size());shapePixels(used,g.preview.size());if(g.shapePaintMask)shapeBytes(used,g.shapePaintMask->mask.size());
 std::optional<timeline::Surface> candidate;
 if(g.shapeExpansion){const auto& r=*g.shapeExpansion;candidate=raster::expanded(source,{r.x,r.y,std::int64_t(r.x)+r.width,std::int64_t(r.y)+r.height},shapeLimit-used);if(candidate)shapePixels(used,candidate->pixels.size());}
 const auto& prepared=candidate?*candidate:source;
 auto beforeAt=[&](int x,int y){return raster::readWorld(prepared,x,y);};
 auto afterAt=[&](int x,int y){return selectionContains(g.shapePaintMask,x,y)?g.preview[std::size_t(y)*width_+x]:beforeAt(x,y);};
 PixelRegion dirty;std::size_t changedCount=0;
 if(g.shapePaintMask){const auto& m=*g.shapePaintMask;for(int y=m.y;y<m.y+m.height;++y)for(int x=m.x;x<m.x+m.width;++x)if(selectionContains(g.shapePaintMask,x,y)){if(!raster::worldIndex(prepared,x,y))throw std::logic_error("Shape plan misses paint coverage");if(beforeAt(x,y)!=afterAt(x,y)){dirty.include(x,y);++changedCount;}}}
 const bool changed=!dirty.empty();Edit edit{{},state_,nextState_};
 if(changed){
  edit.targetCelId=g.celId;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.pixelAddress=PixelAddressSpace{width_,height_,raster::coordinate(std::int64_t(prepared.storageOriginX.value_or(0))-prepared.offsetX),raster::coordinate(std::int64_t(prepared.storageOriginY.value_or(0))-prepared.offsetY)};
  if(std::size_t(dirty.w)*dirty.h>=512*512){DensePixels dense{dirty.x,dirty.y,dirty.w,dirty.h,{},{}};const auto count=std::size_t(dirty.w)*dirty.h;shapePixels(used,count);shapePixels(used,count);dense.before.reserve(count);dense.after.reserve(count);for(int y=dirty.y;y<dirty.y+dirty.h;++y)for(int x=dirty.x;x<dirty.x+dirty.w;++x){dense.before.push_back(beforeAt(x,y));dense.after.push_back(afterAt(x,y));}edit.dense=std::move(dense);}
  else{if(changedCount>(shapeLimit-used)/sizeof(Delta))throw std::length_error("Shape history exceeds document pixel budget");shapeBytes(used,changedCount*sizeof(Delta));edit.pixels.reserve(changedCount);const auto& m=*g.shapePaintMask;for(int y=m.y;y<m.y+m.height;++y)for(int x=m.x;x<m.x+m.width;++x)if(selectionContains(g.shapePaintMask,x,y)){const auto before=beforeAt(x,y),after=afterAt(x,y);if(before!=after)edit.pixels.push_back({std::size_t(y)*width_+x,before,after});}}
  history_.reserve(position_+1);
 }
 auto paint=[&](timeline::Surface& out){if(!g.shapePaintMask)return;const auto& m=*g.shapePaintMask;for(int y=m.y;y<m.y+m.height;++y)for(int x=m.x;x<m.x+m.width;++x)if(selectionContains(g.shapePaintMask,x,y))out.pixels[*raster::worldIndex(out,x,y)]=g.preview[std::size_t(y)*width_+x];};
 if(candidate)paint(*candidate);
 if(candidate||changed){auto* owner=timeline_.mutableOwnedSurface(resolved.source->id);if(!owner)throw std::logic_error("Missing shape owner");if(candidate)std::swap(*owner,*candidate);else paint(*owner);}
 cancelGradient();change_={};if(!changed)return false;change_=dirty;publishChange();pushEdit(std::move(edit),U"绘制矩形");return true;
}
}
