#include "document.h"
#include "raster_geometry.h"
#include "raster_pixel_edit.h"
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
void indexedShapeGeometry(std::size_t& used,int width,int height){
 if(width<1||height<1)return;
 const auto count=std::uint64_t(width)*height;
 if(count>(shapeLimit-used)/4)throw std::length_error("Shape raster exceeds document pixel budget");
 shapeBytes(used,std::size_t(count)*4);
}
std::optional<SelectionMask> indexedShapeMask(const ShapeSpec& spec,int cw,int ch,std::size_t& used){
 const double angle=std::fmod(std::fmod(spec.bounds.angle,360)+360,360);
 if(spec.kind==ShapeKind::Polygon||spec.kind==ShapeKind::Freeform||angle>1e-9){indexedShapeGeometry(used,cw,ch);return shapeMask(spec,cw,ch);}
 // rotatedShapePixelPoints delegates to shapePixelPoints at zero rotation:
 // its source points are unbounded and symmetry clips the destinations.
 const auto bounds=transformBounds(spec.bounds);auto local=spec;
 indexedShapeGeometry(used,bounds.width,bounds.height);
 local.bounds.x-=bounds.x;local.bounds.y-=bounds.y;
 auto mask=shapeMask(local,bounds.width,bounds.height);if(mask){mask->x+=bounds.x;mask->y+=bounds.y;}return mask;
}
// unboundedShapePreview: rasterize in a translated domain with two spare
// pixels, so the canvas edge cannot manufacture a contour through the fill.
std::optional<SelectionMask> indexedShapeContour(const ShapeSpec& spec,std::size_t& used){
 if(spec.kind==ShapeKind::Polygon||spec.kind==ShapeKind::Freeform)return {};
 const auto bounds=transformBounds(spec.bounds);auto local=spec;
 const int x=bounds.x-2,y=bounds.y-2,w=bounds.width+4,h=bounds.height+4;
 indexedShapeGeometry(used,w,h);
 local.bounds.x-=x;local.bounds.y-=y;
 local.kind=(spec.kind==ShapeKind::Ellipse||spec.kind==ShapeKind::EllipseOutline)?ShapeKind::EllipseOutline:ShapeKind::RectangleOutline;
 if(spec.kind==ShapeKind::Rectangle||spec.kind==ShapeKind::Ellipse)local.strokeWidth=1;
 auto mask=shapeMask(local,w,h);if(mask){mask->x+=x;mask->y+=y;}return mask;
}
}
bool Document::beginIndexedShape(){
 const auto* source=activeSurfaceIfPresent();std::size_t used=0;
 for(const auto& c:timeline_.state().cels)if(c.surface)shapePixels(used,c.surface->pixels.size());
 for(int i=0;i<(gradient_?8:4);++i)shapePixels(used,std::size_t(width_)*height_);
 auto baseline=source?sparseFillCanvas(*source):std::vector<Pixel>(std::size_t(width_)*height_);
 GradientPreview pending{{},source?cel().id:std::string{},layer().id,frame().id,baseline,selection_,{},{},contentRevision_,true};
 pending.indexedDisplay=std::vector<Pixel>(baseline.size());
 const RasterColorContext colors(palette_.entries,palette_.order(),colorMode_,pixelFormat_);
 if(source){
  for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(const auto i=raster::worldIndex(*source,x,y))(*pending.indexedDisplay)[std::size_t(y)*width_+x]=colors.rgba(source->format,source->pixels[*i]);
  const auto r=timeline_.resolveSurface(cel().id);if(r.issue!=timeline::LinkIssue::None||!r.source)throw std::logic_error("Invalid indexed shape owner");
  pending.sparse=SparseGradientBaseline{std::move(baseline),r.source->id,source->width,source->height,source->offsetX,source->offsetY,source->storageOriginX,source->storageOriginY};
 }else{pending.absentRaster=true;pending.absentRasterBaseline=std::move(baseline);}
 gradient_=std::move(pending);++gradientRevision_;return true;
}
bool Document::updateIndexedShape(const ShapeSpec& input,Pixel color){
 auto spec=input;
 const double angle=std::fmod(std::fmod(spec.bounds.angle,360)+360,360);
 // User-approved correction: zero-rotation fractional coordinates must not
 // become fractional typed-array indices (legacy records destructive undo).
 if(spec.kind!=ShapeKind::Line&&spec.kind!=ShapeKind::Curve&&spec.kind!=ShapeKind::Polygon&&spec.kind!=ShapeKind::Freeform&&angle<1e-9){spec.bounds.x=std::floor(spec.bounds.x+.5);spec.bounds.y=std::floor(spec.bounds.y+.5);}
 if(spec.kind==ShapeKind::Line){auto points=selectionLine({int(spec.start.x),int(spec.start.y)},{int(spec.end.x),int(spec.end.y)},spec.polygonBalanced);if(spec.brush.perfectPixels){const auto perfect=perfectPixelPathPoints(points);points.clear();for(auto p:perfect)points.push_back({p.x,p.y});}return updateIndexedBrushPath(points,color,spec.brush,nullptr,0,false);}
 if(spec.kind==ShapeKind::Curve)return false;
 if(gradient_->sparse&&!sparseGradientSourceValid()){cancelGradient();return false;}
 auto& g=*gradient_;const auto* source=activeSurfaceIfPresent();const auto& baseline=g.sparse?g.sparse->canvas:previewBaseline();
 std::size_t used=0;for(const auto& c:timeline_.state().cels)if(c.surface)shapePixels(used,c.surface->pixels.size());
 // Retained candidates, replacement candidates, geometry and point history.
 for(int i=0;i<9;++i)shapePixels(used,baseline.size());
 const RasterColorContext colors(palette_.entries,palette_.order(),colorMode_,pixelFormat_);
 auto packed=baseline;std::vector<Pixel> display(baseline.size());
 if(source)for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(const auto i=raster::worldIndex(*source,x,y))display[std::size_t(y)*width_+x]=colors.rgba(source->format,source->pixels[*i]);
 auto mask=indexedShapeMask(spec,width_,height_,used);PixelRegion all,touched,visible;
 auto each=[&](const std::optional<SelectionMask>& m,bool clip,auto&& emit){if(m)for(int y=m->y;y<m->y+m->height;++y)for(int x=m->x;x<m->x+m->width;++x)if(selectionContains(m,x,y))for(auto p:symmetryPoints({x,y},width_,height_,symmetryAxes,symmetryCenter(),clip))if(p.x>=0&&p.y>=0&&p.x<width_&&p.y<height_)emit(p.x,p.y);};
 each(mask,true,[&](int x,int y){all.include(x,y);if(g.selection&&!selectionContains(g.selection,x,y))return;const auto i=std::size_t(y)*width_+x;packed[i]=colors.packedValue(timeline::RasterFormat::Indexed,raster::paintValue(timeline::RasterFormat::Indexed,baseline[i],baseline[i],color,colors));touched.include(x,y);});
 std::optional<SelectionMask> painted;if(!touched.empty()){painted=SelectionMask{touched.x,touched.y,touched.w,touched.h,std::vector<unsigned char>(std::size_t(touched.w)*touched.h)};each(mask,true,[&](int x,int y){if(!g.selection||selectionContains(g.selection,x,y))painted->mask[std::size_t(y-painted->y)*painted->width+x-painted->x]=1;});}
 // canvas-render-preview-pixels uses simple ink for these tools and the
 // session brush opacity. Commit paintShape does not use either setting.
 auto contour=(spec.kind==ShapeKind::Polygon||spec.kind==ShapeKind::Freeform)?mask:indexedShapeContour(spec,used);
 const int coverage=int(std::floor(255*std::clamp(spec.brush.opacity,0,100)/100.0+.5));
 each(contour,false,[&](int x,int y){if(g.selection&&!selectionContains(g.selection,x,y))return;const auto i=std::size_t(y)*width_+x;const auto local=source?raster::worldIndex(*source,x,y):std::nullopt;const auto current=local?colors.toolColor(source->format,source->pixels[*local]):g.absentRaster?colors.toolColor(timeline::RasterFormat::Indexed,0):0;const auto stamp=resolveInkStampColor(InkMode::Simple,color,coverage,100);const auto replacement=(coverage<255||((color>>24)>0&&(color>>24)<255))?raster::selectionRgbaOver(current,stamp):color;display[i]=colors.toolColor(timeline::RasterFormat::Indexed,colors.colorId(replacement));visible.include(x,y);});
 std::optional<SelectionMask> expansion;
 if(source&&!all.empty()&&(all.x<source->offsetX||all.y<source->offsetY||all.x+all.w>source->offsetX+source->width||all.y+all.h>source->offsetY+source->height)){
  const int l=std::max(0,all.x-64),t=std::max(0,all.y-64),r=std::min(width_,all.x+all.w+64),b=std::min(height_,all.y+all.h+64);expansion=SelectionMask{l,t,r-l,b-t,{}};
 }
 g.preview=std::move(packed);g.indexedDisplay=std::move(display);g.shapePaintMask=std::move(painted);g.shapeExpansion=std::move(expansion);
 g.region=visible.empty()?std::optional<SelectionMask>{}:std::optional<SelectionMask>{SelectionMask{visible.x,visible.y,visible.w,visible.h,{}}};++gradientRevision_;return true;
}
// canvas-input-shape/useCanvasShapeCommit: Line and Curve share brush centers,
// but their display preview and committed ink deliberately differ.
bool Document::updateIndexedBrushPath(const std::vector<SelectionPoint>& points,Pixel color,BrushOptions brush,const PatternBrush* image,double angle,bool curve,repeat::Mode repeatMode){
 if(!shapeActive()||!gradient_->indexedDisplay||!rasterToolsAvailable())return false;
 if(gradient_->sparse&&!sparseGradientSourceValid()){cancelGradient();return false;}
 if(!std::isfinite(angle))throw std::invalid_argument("Invalid geometric brush angle");
 auto& g=*gradient_;const auto* source=activeSurfaceIfPresent();
 std::size_t used=0;for(const auto& c:timeline_.state().cels)if(c.surface)shapePixels(used,c.surface->pixels.size());
 const auto count=std::size_t(width_)*height_;for(int i=0;i<10;++i)shapePixels(used,count);
 if(points.size()>(shapeLimit-used)/sizeof(SelectionPoint))throw std::length_error("Geometric path exceeds document pixel budget");shapeBytes(used,points.size()*sizeof(SelectionPoint));
 brush.size=std::clamp(brush.size,1,64);brush.opacity=std::clamp(brush.opacity,0,100);
 const auto imageStamp=image?std::optional<ImageBrushStamp>{prepareImageBrushStamp(*image,brush.size,angle)}:std::nullopt;
 auto footprint=selectionBrushFootprint(brush,int(std::fmod(angle,360)));
 if(!image&&angle!=std::trunc(angle)&&brush.size>1&&brush.shape!=BrushShape::Round){
  const double rad=angle*3.14159265358979323846/180,c=std::cos(rad),sn=std::sin(rad);
  footprint.width=footprint.height=brush.shape==BrushShape::Line?brush.size:std::max(1,int(std::ceil(brush.size*(std::abs(c)+std::abs(sn))-1e-9)));footprint.spans.clear();
  if(brush.shape==BrushShape::Line){const int center=brush.size/2,dx=int(std::trunc(brush.size/2.0*c)),dy=int(std::trunc(-brush.size/2.0*sn));auto path=selectionContinuousLine({center-dx,center-dy},{center,center});const auto tail=selectionContinuousLine({center,center},{center+dx,center+dy});path.insert(path.end(),tail.begin(),tail.end());for(int y=0;y<brush.size;++y){BrushSpan row{y,brush.size,-1};for(auto q:path)if(q.y==y&&q.x>=0&&q.x<brush.size){row.left=std::min(row.left,q.x);row.right=std::max(row.right,q.x);}footprint.spans.push_back(row);}}
  else{const double center=(footprint.width-1)/2.0,sc=(brush.size-1)/2.0;for(int y=0;y<footprint.height;++y){BrushSpan row{y,footprint.width,-1};for(int x=0;x<footprint.width;++x){const int sx=int(std::floor(c*(x-center)+sn*(y-center)+sc+.5)),sy=int(std::floor(-sn*(x-center)+c*(y-center)+sc+.5));if(sx>=0&&sy>=0&&sx<brush.size&&sy<brush.size){row.left=std::min(row.left,x);row.right=x;}}footprint.spans.push_back(row);}}
 }
 const int sw=imageStamp?imageStamp->width:footprint.width,sh=imageStamp?imageStamp->height:footprint.height;
 const double rad=angle*3.14159265358979323846/180;const int spacingDimension=imageStamp?std::max(sw,sh):std::max(1,int(std::ceil(brush.size*(std::abs(std::cos(rad))+std::abs(std::sin(rad)))-1e-9)));
 const int spacing=brush.shape==BrushShape::Line?1:std::max(1,spacingDimension/16);std::vector<SelectionPoint> centers;centers.reserve(points.size());int since=0;
 for(std::size_t i=0;i<points.size();++i){if(i)++since;if(i&&i+1<points.size()&&since<spacing)continue;centers.push_back(points[i]);since=0;}
 auto stampRect=[&](SelectionPoint p){return raster::Rect64{std::int64_t(p.x)-sw/2,std::int64_t(p.y)-sh/2,std::int64_t(p.x)-sw/2+sw,std::int64_t(p.y)-sh/2+sh};};
 auto symmetric=[&](raster::Rect64 r){std::optional<raster::Rect64> result;for(auto p:std::array<SymmetryPixel,4>{{{raster::coordinate(r.left),raster::coordinate(r.top)},{raster::coordinate(r.right-1),raster::coordinate(r.top)},{raster::coordinate(r.left),raster::coordinate(r.bottom-1)},{raster::coordinate(r.right-1),raster::coordinate(r.bottom-1)}}})for(auto q:symmetryPoints(p,width_,height_,symmetryAxes,symmetryCenter(),repeatMode==repeat::Mode::Off)){const raster::Rect64 pixel{q.x,q.y,std::int64_t(q.x)+1,std::int64_t(q.y)+1};result=result?shapeUnion(*result,pixel):pixel;}auto out=result.value_or(r);if(repeatMode!=repeat::Mode::Off){const auto xs=repeat::axis(raster::coordinate(out.left),raster::coordinate(out.right-out.left),width_,repeat::includesX(repeatMode)),ys=repeat::axis(raster::coordinate(out.top),raster::coordinate(out.bottom-out.top),height_,repeat::includesY(repeatMode));std::optional<raster::Rect64> wrapped;for(auto x:xs)for(auto y:ys){raster::Rect64 part{x.start,y.start,std::int64_t(x.start)+x.length,std::int64_t(y.start)+y.length};wrapped=wrapped?shapeUnion(*wrapped,part):part;}if(wrapped)return *wrapped;}return out;};
 raster::Rect64 geometry=source?raster::Rect64{source->offsetX,source->offsetY,std::int64_t(source->offsetX)+source->width,std::int64_t(source->offsetY)+source->height}:raster::Rect64{0,0,width_,height_};
 std::optional<raster::Rect64> requested;bool placeholder=source&&source->width==1&&source->height==1&&source->pixels[0]==0;
 auto ensure=[&](raster::Rect64 r){r={std::max<std::int64_t>(0,r.left),std::max<std::int64_t>(0,r.top),std::min<std::int64_t>(width_,r.right),std::min<std::int64_t>(height_,r.bottom)};if(shapeEmpty(r))return false;if(r.left>=geometry.left&&r.top>=geometry.top&&r.right<=geometry.right&&r.bottom<=geometry.bottom)return true;const raster::Rect64 padded{std::max<std::int64_t>(0,r.left-64),std::max<std::int64_t>(0,r.top-64),std::min<std::int64_t>(width_,r.right+64),std::min<std::int64_t>(height_,r.bottom+64)};requested=requested?shapeUnion(*requested,padded):padded;geometry=placeholder?padded:shapeUnion(geometry,padded);placeholder=false;return true;};
 bool allowed=false;if(!centers.empty()){auto bounds=stampRect(centers.front());for(auto p:centers)bounds=shapeUnion(bounds,stampRect(p));allowed=ensure(symmetric(bounds));}
 std::vector<unsigned char> enabled(centers.size());if(allowed)for(std::size_t i=0;i<centers.size();++i)enabled[i]=ensure(symmetric(stampRect(centers[i])));
 std::optional<timeline::Surface> expanded;if(source&&requested){expanded=raster::expanded(*source,*requested,shapeLimit-used);if(expanded)shapePixels(used,expanded->pixels.size());}
 const auto* prepared=expanded?&*expanded:source;
 const RasterColorContext colors(palette_.entries,palette_.order(),colorMode_,pixelFormat_);
 auto packed=prepared?sparseFillCanvas(*prepared):std::vector<Pixel>(count);const auto baseline=packed;std::vector<Pixel> display(count);
 for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(source)if(const auto i=raster::worldIndex(*source,x,y))display[std::size_t(y)*width_+x]=colors.rgba(source->format,source->pixels[*i]);
 std::optional<ImageBrushPatternSampler> pattern;if(image&&brush.imagePaintMode!=PatternPaintMode::Paint&&!points.empty())pattern.emplace(*image,brush.imagePaintMode,points.front().x,points.front().y,brush.size);
 auto activeImageStamp=[&](SelectionPoint p)->const ImageBrushStamp&{return pattern?pattern->at(p.x,p.y,brush.size,angle):*imageStamp;};
 const int previewWidth=imageStamp?sw:brush.shape==BrushShape::Line?brush.size:spacingDimension,previewHeight=imageStamp?sh:brush.shape==BrushShape::Line?brush.size:spacingDimension;
 auto samples=[&](SelectionPoint p,bool preview,auto&& emit){if(imageStamp){const auto& stamp=activeImageStamp(p);for(const auto& sample:stamp.samples)emit(raster::coordinate(std::int64_t(p.x)-stamp.width/2+sample.x),raster::coordinate(std::int64_t(p.y)-stamp.height/2+sample.y),sample.coverage,sample.color);}else for(auto row:footprint.spans)for(int x=row.left;x<=row.right;++x){const int px=raster::coordinate(std::int64_t(p.x)-(preview?previewWidth:sw)/2+x),py=raster::coordinate(std::int64_t(p.y)-(preview?previewHeight:sh)/2+row.y);if(brushDitherContains(brush,px,py))emit(px,py,255,std::optional<Pixel>{});}};
 std::vector<unsigned char> touched(count),seen(count);std::unordered_map<std::uint64_t,int> coverage;PixelRegion dirty,visible;
 for(std::size_t c=0;c<centers.size();++c)if(enabled[c])samples(centers[c],false,[&](int x,int y,int amount,std::optional<Pixel> sample){for(auto q:symmetryPoints({x,y},width_,height_,symmetryAxes,symmetryCenter(),repeatMode==repeat::Mode::Off)){const auto local=repeat::wrap({double(q.x),double(q.y)},width_,height_,repeatMode);q={int(local.x),int(local.y)};if(q.x<0||q.y<0||q.x>=width_||q.y>=height_)continue;if((g.selection&&!selectionContains(g.selection,q.x,q.y))||(prepared&&!raster::worldIndex(*prepared,q.x,q.y)))continue;const auto i=std::size_t(q.y)*width_+q.x;const Pixel paint=sample.value_or(color);const bool erase=brush.ink==InkMode::Simple&&!(color>>24),direct=imageStamp&&imageStamp->intrinsicSize&&!pattern&&brush.ink==InkMode::Simple&&!erase;
   if(!direct){const auto key=(std::uint64_t(i)<<32)|((color>>24)?paint:0u);auto previous=coverage.find(key);if(previous!=coverage.end()&&(previous->second>amount||(previous->second==amount&&brush.ink!=InkMode::LockAlpha)))continue;if(previous==coverage.end())shapeBytes(used,48);coverage[key]=amount;}
   const auto value=raster::indexedBrushValue(packed[i],baseline[i],paint,amount,100,brush.ink,colors,erase,direct,false,false,sample?*sample>>24:255);if(!value)continue;packed[i]=*value;touched[i]=1;dirty.include(q.x,q.y);
  }});
 // drawBrushPathPreview: intrinsic image stamps are visited in reverse order,
 // each visible destination is drawn once, erase=false even for alpha zero.
 const bool overwrite=imageStamp&&imageStamp->intrinsicSize&&!pattern;const InkMode previewInk=curve?InkMode::Simple:brush.ink;
 for(std::size_t c=0;c<centers.size();++c)samples(centers[overwrite?centers.size()-1-c:c],true,[&](int x,int y,int amount,std::optional<Pixel> sample){for(auto q:symmetryPoints({x,y},width_,height_,symmetryAxes,symmetryCenter())){if(g.selection&&!selectionContains(g.selection,q.x,q.y))continue;const auto i=std::size_t(q.y)*width_+q.x;if(seen[i])continue;seen[i]=1;
   const auto local=source?raster::worldIndex(*source,q.x,q.y):std::nullopt;const auto base=local?colors.toolColor(source->format,source->pixels[*local]):g.absentRaster?colors.toolColor(timeline::RasterFormat::Indexed,0):0;const Pixel paint=sample.value_or(color);const int effective=int(std::floor(amount*brush.opacity/100.0+.5));const auto stamp=resolveInkStampColor(previewInk,paint,effective,100);
   const Pixel replacement=previewInk!=InkMode::Simple?applyInkColor(previewInk,base,stamp):overwrite?stamp:effective<255||((paint>>24)>0&&(paint>>24)<255)?raster::selectionRgbaOver(base,stamp):paint;display[i]=colors.toolColor(timeline::RasterFormat::Indexed,colors.colorId(replacement));visible.include(q.x,q.y);
  }});
 std::optional<SelectionMask> painted;if(!dirty.empty()){painted=SelectionMask{dirty.x,dirty.y,dirty.w,dirty.h,std::vector<unsigned char>(std::size_t(dirty.w)*dirty.h)};for(int y=dirty.y;y<dirty.y+dirty.h;++y)for(int x=dirty.x;x<dirty.x+dirty.w;++x)painted->mask[std::size_t(y-dirty.y)*dirty.w+x-dirty.x]=touched[std::size_t(y)*width_+x];}
 std::optional<SelectionMask> expansion;if(requested)expansion=SelectionMask{raster::coordinate(requested->left),raster::coordinate(requested->top),raster::coordinate(requested->right-requested->left),raster::coordinate(requested->bottom-requested->top),{}};
 g.preview=std::move(packed);g.indexedDisplay=std::move(display);g.shapePaintMask=std::move(painted);g.shapeExpansion=std::move(expansion);g.region=visible.empty()?std::optional<SelectionMask>{}:std::optional<SelectionMask>{SelectionMask{visible.x,visible.y,visible.w,visible.h,{}}};++gradientRevision_;return true;
}
bool Document::beginSparseShape(){
 const auto r=timeline_.resolveSurface(cel().id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::logic_error("Invalid shape owner");const auto& s=*r.surface;raster::validate(s);
 std::size_t used=0;for(const auto& c:timeline_.state().cels)if(c.surface)shapePixels(used,c.surface->pixels.size());const auto count=std::size_t(width_)*height_;shapePixels(used,count);shapePixels(used,count);
 if(gradient_){shapePixels(used,gradient_->preview.size());if(gradient_->sparse)shapePixels(used,gradient_->sparse->canvas.size());if(gradient_->shapePaintMask)shapeBytes(used,gradient_->shapePaintMask->mask.size());}
 auto baseline=sparseFillCanvas(s);GradientPreview pending{{},cel().id,layer().id,frame().id,baseline,selection_,{},{},contentRevision_,true};pending.sparse=SparseGradientBaseline{std::move(baseline),r.source->id,s.width,s.height,s.offsetX,s.offsetY,s.storageOriginX,s.storageOriginY};gradient_=std::move(pending);++gradientRevision_;return true;
}
bool Document::updateSparseShape(const ShapeSpec& spec,Pixel color){
 if(!sparseGradientSourceValid()){cancelGradient();return false;}auto& g=*gradient_;const auto& baseline=g.sparse->canvas;const auto resolved=timeline_.resolveSurface(g.celId);const auto& source=*resolved.surface;
 std::size_t used=0;for(const auto& c:timeline_.state().cels)if(c.surface)shapePixels(used,c.surface->pixels.size());shapePixels(used,baseline.size());shapePixels(used,g.preview.size());if(g.indexedDisplay)shapePixels(used,g.indexedDisplay->size());if(g.shapePaintMask)shapeBytes(used,g.shapePaintMask->mask.size());
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
 if(painted)for(int y=painted->y;y<painted->y+painted->height;++y)for(int x=painted->x;x<painted->x+painted->width;++x)if(selectionContains(painted,x,y)){const auto i=std::size_t(y)*width_+x;g.preview[i]=normalizeCanvasPacked(((((spec.kind==ShapeKind::Polygon||spec.kind==ShapeKind::Freeform)||spec.brush.ink==InkMode::Simple)&&!(color>>24))?color:inkBrushComposite(baseline[i],color,100,(spec.kind==ShapeKind::Polygon||spec.kind==ShapeKind::Freeform)?InkMode::Simple:spec.brush.ink)));}
 g.region=touched.empty()?std::optional<SelectionMask>{}:std::optional<SelectionMask>{SelectionMask{touched.x,touched.y,touched.w,touched.h,{}}};g.shapePaintMask=std::move(painted);g.shapeExpansion=std::move(expansion);++gradientRevision_;return true;
}
bool Document::commitSparseShape(){
 if(!sparseGradientSourceValid()){cancelGradient();return false;}const auto& g=*gradient_;const auto resolved=timeline_.resolveSurface(g.celId);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)throw std::logic_error("Invalid shape owner");const auto& source=*resolved.surface;
 std::size_t used=0;for(const auto& c:timeline_.state().cels)if(c.surface)shapePixels(used,c.surface->pixels.size());shapePixels(used,g.sparse->canvas.size());shapePixels(used,g.preview.size());if(g.indexedDisplay)shapePixels(used,g.indexedDisplay->size());if(g.shapePaintMask)shapeBytes(used,g.shapePaintMask->mask.size());
 std::optional<timeline::Surface> candidate;
 if(g.shapeExpansion){const auto& r=*g.shapeExpansion;candidate=raster::expanded(source,{r.x,r.y,std::int64_t(r.x)+r.width,std::int64_t(r.y)+r.height},shapeLimit-used);if(candidate)shapePixels(used,candidate->pixels.size());}
 const auto& prepared=candidate?*candidate:source;
 auto beforeAt=[&](int x,int y){return raster::readWorld(prepared,x,y);};
 auto afterAt=[&](int x,int y){return selectionContains(g.shapePaintMask,x,y)?g.preview[std::size_t(y)*width_+x]:beforeAt(x,y);};
 PixelRegion dirty;std::size_t changedCount=0;
 if(g.shapePaintMask){const auto& m=*g.shapePaintMask;for(int y=m.y;y<m.y+m.height;++y)for(int x=m.x;x<m.x+m.width;++x)if(selectionContains(g.shapePaintMask,x,y)){if(!raster::worldIndex(prepared,x,y))throw std::logic_error("Shape plan misses paint coverage");if(beforeAt(x,y)!=afterAt(x,y)){dirty.include(x,y);++changedCount;}}}
 const bool changed=!dirty.empty();Edit edit{{},state_,nextState_};
 if(changed){
  edit.contentHistory.targetCelId=g.celId;edit.beforeSelection=edit.afterSelection=selectedFrames_;edit.contentHistory.pixelAddress=PixelAddressSpace{width_,height_,raster::coordinate(std::int64_t(prepared.storageOriginX.value_or(0))-prepared.offsetX),raster::coordinate(std::int64_t(prepared.storageOriginY.value_or(0))-prepared.offsetY)};
  if(g.indexedDisplay?(changedCount>=256&&std::size_t(dirty.w)*dirty.h<=changedCount*3):std::size_t(dirty.w)*dirty.h>=512*512){DensePixels dense{dirty.x,dirty.y,dirty.w,dirty.h,{},{}};const auto count=std::size_t(dirty.w)*dirty.h;shapePixels(used,count);shapePixels(used,count);dense.before.reserve(count);dense.after.reserve(count);for(int y=dirty.y;y<dirty.y+dirty.h;++y)for(int x=dirty.x;x<dirty.x+dirty.w;++x){dense.before.push_back(beforeAt(x,y));dense.after.push_back(afterAt(x,y));}edit.contentHistory.dense=std::move(dense);}
  else{if(changedCount>(shapeLimit-used)/sizeof(Delta))throw std::length_error("Shape history exceeds document pixel budget");shapeBytes(used,changedCount*sizeof(Delta));edit.pixels.reserve(changedCount);const auto& m=*g.shapePaintMask;for(int y=m.y;y<m.y+m.height;++y)for(int x=m.x;x<m.x+m.width;++x)if(selectionContains(g.shapePaintMask,x,y)){const auto before=beforeAt(x,y),after=afterAt(x,y);if(before!=after)edit.pixels.push_back({std::size_t(y)*width_+x,before,after});}}
  reserveHistoryEntries();
 }
 auto paint=[&](timeline::Surface& out){if(!g.shapePaintMask)return;const auto& m=*g.shapePaintMask;for(int y=m.y;y<m.y+m.height;++y)for(int x=m.x;x<m.x+m.width;++x)if(selectionContains(g.shapePaintMask,x,y))out.pixels[*raster::worldIndex(out,x,y)]=g.preview[std::size_t(y)*width_+x];};
 if(candidate)paint(*candidate);
 if(candidate||changed){auto* owner=timeline_.mutableOwnedSurface(resolved.source->id);if(!owner)throw std::logic_error("Missing shape owner");if(candidate)std::swap(*owner,*candidate);else paint(*owner);}
 cancelGradient();change_={};if(!changed)return false;change_=dirty;publishChange();pushEdit(std::move(edit),U"绘制矩形");return true;
}
}
