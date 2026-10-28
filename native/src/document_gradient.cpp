#include "document.h"
#include "raster_geometry.h"
#include "layer_compositor.h"
#include <algorithm>
#include <stdexcept>
namespace moon {
// Preserve literal packed-color barriers without applying the user's paint mask to traversal.
static std::optional<SelectionMask> sparseGradientRegion(const std::vector<Pixel>& pixels,int w,int h,Point seed,WandOptions options){
 std::optional<SelectionMask> domain;
 if(options.contiguous&&!options.gapClosing&&options.connectivity==4&&pixels[std::size_t(seed.y)*w+seed.x]==0&&std::any_of(pixels.begin(),pixels.end(),[](Pixel p){return p!=0&&(p>>24)==0;}))domain=SelectionMask{0,0,w,h,{}};
 return magicWandSelection(pixels,w,h,seed.x,seed.y,options,domain);
}
bool Document::sparseGradientSourceValid()const{
 if(!gradient_||!gradient_->sparse)return false;const auto& g=*gradient_;const auto& b=*g.sparse;
 const auto r=timeline_.resolveSurface(g.celId);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)return false;const auto& s=*r.surface;
 return r.source->id==b.ownerId&&s.width==b.width&&s.height==b.height&&s.offsetX==b.offsetX&&s.offsetY==b.offsetY&&s.storageOriginX==b.originX&&s.storageOriginY==b.originY;
}
bool Document::beginSparseGradient(Point seed,WandOptions options){
 const auto r=timeline_.resolveSurface(cel().id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::logic_error("Invalid gradient owner");const auto& s=*r.surface;raster::validate(s);
 constexpr std::size_t limit=256*1024*1024;std::size_t used=0;
 auto account=[&](std::size_t count){if(count>(limit-used)/sizeof(Pixel))throw std::length_error("Gradient preview exceeds document pixel budget");used+=count*sizeof(Pixel);};
 for(const auto& c:timeline_.state().cels)if(c.surface)account(c.surface->pixels.size());
 const auto count=std::size_t(width_)*height_;account(count);account(count);if(options.visibleLayers)account(count);
 if(gradient_){account(gradient_->preview.size());if(gradient_->sparse)account(gradient_->sparse->canvas.size());}
 auto baseline=sparseFillCanvas(s);options.gapClosing=false;
 const auto reference=options.visibleLayers?compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_}):std::vector<Pixel>{};
 auto region=sparseGradientRegion(options.visibleLayers?reference:baseline,width_,height_,seed,options);if(!region)return false;
 GradientPreview pending{seed,cel().id,layer().id,frame().id,baseline,selection_,std::move(region),options,contentRevision_};
 pending.sparse=SparseGradientBaseline{std::move(baseline),r.source->id,s.width,s.height,s.offsetX,s.offsetY,s.storageOriginX,s.storageOriginY};
 gradient_=std::move(pending);++gradientRevision_;return true;
}
bool Document::updateSparseGradient(const GradientSpec& spec,WandOptions options){
 if(!sparseGradientSourceValid()){cancelGradient();return false;}auto& g=*gradient_;const auto& baseline=g.sparse->canvas;options.gapClosing=false;
 constexpr std::size_t limit=256*1024*1024;std::size_t used=0;auto account=[&](std::size_t count){if(count>(limit-used)/sizeof(Pixel))throw std::length_error("Gradient update exceeds document pixel budget");used+=count*sizeof(Pixel);};for(const auto& c:timeline_.state().cels)if(c.surface)account(c.surface->pixels.size());account(baseline.size());account(g.preview.size());const auto baseUsed=used;
 auto region=g.region;
 if(options.tolerance!=g.options.tolerance||options.contiguous!=g.options.contiguous||options.connectivity!=g.options.connectivity||options.visibleLayers!=g.options.visibleLayers){
  if(options.visibleLayers)account(std::size_t(width_)*height_);const auto reference=options.visibleLayers?compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_}):std::vector<Pixel>{};
  region=sparseGradientRegion(options.visibleLayers?reference:baseline,width_,height_,g.seed,options);
 }
 used=baseUsed;account(region?std::size_t(region->width):0);GradientSampler sample(spec);std::vector<Pixel> row(region?std::size_t(region->width):0);
 if(g.region){const auto& r=*g.region;for(int y=r.y;y<r.y+r.height;++y)std::copy_n(baseline.begin()+std::size_t(y)*width_+r.x,r.width,g.preview.begin()+std::size_t(y)*width_+r.x);}
 if(region){const auto& r=*region;for(int y=r.y;y<r.y+r.height;++y){sample.row(y,r.x,r.x+r.width,row.data());for(int x=r.x;x<r.x+r.width;++x){const auto i=std::size_t(y)*width_+x;const auto current=baseline[i],source=row[x-r.x];g.preview[i]=selectionContains(region,x,y)&&(!g.selection||selectionContains(g.selection,x,y))&&(source>>24)?brushComposite(current,source,100):current;}}}
 g.region=std::move(region);g.options=options;++gradientRevision_;return true;
}
bool Document::commitSparseGradient(){
 if(!sparseGradientSourceValid()){cancelGradient();return false;}const auto& g=*gradient_;
 if(!g.region){cancelGradient();return false;}
 const auto& region=*g.region;
 const int left=int(std::max<std::int64_t>({0,region.x,g.selection?g.selection->x:0}));
 const int top=int(std::max<std::int64_t>({0,region.y,g.selection?g.selection->y:0}));
 const int right=int(std::min<std::int64_t>({width_,std::int64_t(region.x)+region.width,g.selection?std::int64_t(g.selection->x)+g.selection->width:width_}));
 const int bottom=int(std::min<std::int64_t>({height_,std::int64_t(region.y)+region.height,g.selection?std::int64_t(g.selection->y)+g.selection->height:height_}));
 if(right<=left||bottom<=top){cancelGradient();return false;}
 const auto resolved=timeline_.resolveSurface(g.celId);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)throw std::logic_error("Invalid gradient owner");const auto& source=*resolved.surface;
 constexpr std::size_t limit=256*1024*1024;std::size_t used=0;
 auto account=[&](std::size_t count){if(count>(limit-used)/sizeof(Pixel))throw std::length_error("Gradient commit exceeds document pixel budget");used+=count*sizeof(Pixel);};
 for(const auto& c:timeline_.state().cels)if(c.surface)account(c.surface->pixels.size());account(g.sparse->canvas.size());account(g.preview.size());
 auto candidate=raster::expanded(source,{left,top,right,bottom},limit-used);if(candidate)account(candidate->pixels.size());
 const auto& prepared=candidate?*candidate:source;
 const bool placeholder=source.width==1&&source.height==1&&(source.pixels[0]>>24)==0;
 auto afterAt=[&](int x,int y){const auto i=std::size_t(y)*width_+x;const auto after=g.preview[i];return placeholder&&x==source.offsetX&&y==source.offsetY&&after==g.sparse->canvas[i]?Pixel(0):after;};
 auto beforeAt=[&](int x,int y){return raster::readWorld(prepared,x,y);};
 int dirtyLeft=width_,dirtyTop=height_,dirtyRight=0,dirtyBottom=0;
 for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)if(beforeAt(x,y)!=afterAt(x,y)){dirtyLeft=std::min(dirtyLeft,x);dirtyTop=std::min(dirtyTop,y);dirtyRight=std::max(dirtyRight,x+1);dirtyBottom=std::max(dirtyBottom,y+1);}
 const bool changed=dirtyRight>dirtyLeft;
 Edit edit{{},state_,nextState_};
 if(changed){
  edit.targetCelId=g.celId;edit.beforeSelection=edit.afterSelection=selectedFrames_;
  edit.pixelAddress=PixelAddressSpace{width_,height_,raster::coordinate(std::int64_t(prepared.storageOriginX.value_or(0))-prepared.offsetX),raster::coordinate(std::int64_t(prepared.storageOriginY.value_or(0))-prepared.offsetY)};
  if(std::size_t(dirtyRight-dirtyLeft)*(dirtyBottom-dirtyTop)>=512*512){
   DensePixels dense{dirtyLeft,dirtyTop,dirtyRight-dirtyLeft,dirtyBottom-dirtyTop,{},{}};const auto count=std::size_t(dense.width)*dense.height;account(count);account(count);dense.before.reserve(count);dense.after.reserve(count);
   for(int y=dirtyTop;y<dirtyBottom;++y)for(int x=dirtyLeft;x<dirtyRight;++x){dense.before.push_back(beforeAt(x,y));dense.after.push_back(afterAt(x,y));}edit.dense=std::move(dense);
  }else for(int y=dirtyTop;y<dirtyBottom;++y)for(int x=dirtyLeft;x<dirtyRight;++x){const auto before=beforeAt(x,y),after=afterAt(x,y);if(before!=after)edit.pixels.push_back({std::size_t(y)*width_+x,before,after});}
  history_.reserve(position_+1);
 }
 if(candidate){
  if(!changed&&placeholder){timeline::Surface restored=source;restored.pixels[0]=0;restored.storageOriginX=0;restored.storageOriginY=0;candidate=std::move(restored);}
  else for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)candidate->pixels[*raster::worldIndex(*candidate,x,y)]=afterAt(x,y);
 }
 if(candidate||changed){auto* owner=timeline_.mutableOwnedSurface(resolved.source->id);if(!owner)throw std::logic_error("Missing gradient owner");if(candidate)std::swap(*owner,*candidate);else for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)owner->pixels[*raster::worldIndex(*owner,x,y)]=afterAt(x,y);}
 cancelGradient();change_={};if(!changed)return false;
 change_={dirtyLeft,dirtyTop,dirtyRight-dirtyLeft,dirtyBottom-dirtyTop};publishChange();pushEdit(std::move(edit),U"渐变");return true;
}
}
