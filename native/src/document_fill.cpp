#include "document.h"
#include "raster_geometry.h"
#include "layer_compositor.h"
#include "raster_pixel_edit.h"
#include <algorithm>
#include <stdexcept>
namespace moon {
namespace {
// tools-fill matches raw IDs at zero tolerance, palette colors otherwise.
// Feed the established region/closure engine an opaque binary match surface;
// its RGBA transparent-exterior shortcut must never interpret IDs as alpha.
bool indexedFill(const Document& d){return d.activeMaskId().empty()&&d.layer().kind.empty()&&(d.activeSurfaceIfPresent()?d.activeSurfaceIfPresent()->format==timeline::RasterFormat::Indexed:d.colorMode()==color_mode::Mode::Indexed);}
RasterColorContext fillColors(const Document& d){return {d.palette().entries,d.palette().order(),d.colorMode(),d.pixelFormat()};}
std::optional<SelectionMask> fillRegion(const std::vector<Pixel>& storage,int w,int h,int x,int y,WandOptions options,const std::optional<SelectionMask>& selection,const RasterColorContext* colors){
 if(!colors)return magicWandSelection(storage,w,h,x,y,options,selection);
 const auto target=storage[std::size_t(y)*w+x];const auto targetColor=colors->toolColor(timeline::RasterFormat::Indexed,target);const int tolerance=std::clamp(options.tolerance,0,255);
 std::vector<Pixel> matching;matching.reserve(storage.size());for(auto value:storage){bool match=value==target;if(tolerance){const auto color=colors->toolColor(timeline::RasterFormat::Indexed,value);int difference=0;for(int shift:{0,8,16,24})difference=std::max(difference,std::abs(int((color>>shift)&255)-int((targetColor>>shift)&255)));match=difference<=tolerance;}matching.push_back(match?0xffffffffu:0xff000000u);}
 options.tolerance=0;return magicWandSelection(matching,w,h,x,y,options,selection);
}
// One compiled point sampler per symmetric transaction; only its bounds are
// fixed. Preview colors below follow every write, including shared owners.
class FillSamplingScope {
 const CompositeSamplingBounds*& slot_;const CompositeSamplingBounds* previous_;
 std::optional<CompositeSamplingBounds> bounds_;
public:
 FillSamplingScope(const Document& d,WandOptions options,const CompositeSamplingBounds*& slot):slot_(slot),previous_(slot){if(!slot&&options.visibleLayers&&indexedFill(d)){bounds_=compileCompositeSamplingBounds(d.timeline(),d.frame().id,fillColors(d));slot_=&*bounds_;}}
 ~FillSamplingScope(){slot_=previous_;}
};
class FillCompositeSource {
 const Document& d_;RasterColorContext compositeColors_;const RasterColorContext* colors_;const CompositeSamplingBounds* bounds_;
 bool staged_;std::string root_;std::vector<Pixel> preview_;const std::vector<Pixel>& storage_;
public:
 FillCompositeSource(const Document& d,const std::vector<Pixel>& storage,const timeline::Surface* sparse,const RasterColorContext* colors,const CompositeSamplingBounds* bounds):d_(d),compositeColors_(fillColors(d)),colors_(colors),bounds_(bounds),staged_(sparse||!d.timeline().findCel(d.layer().id,d.frame().id)),storage_(storage){
  if(staged_&&colors_){preview_.reserve(storage.size());for(auto p:storage)preview_.push_back(colors_->rgba(timeline::RasterFormat::Indexed,p));}
  if(sparse)root_=d.timeline().resolveSurface(d.cel().id).source->id;
 }
 void changed(std::size_t index,std::size_t count,Pixel value){if(staged_&&colors_)std::fill_n(preview_.begin()+index,count,colors_->rgba(timeline::RasterFormat::Indexed,value));}
 std::vector<Pixel> read(CompositeRegion region)const{return compositeNormalRegion(d_.timeline(),d_.frame().id,region,staged_?d_.layer().id:std::string{},staged_?(colors_?&preview_:&storage_):nullptr,staged_?d_.width():0,0,0,false,{},root_,nullptr,nullptr,&compositeColors_,bounds_);}
 Pixel point(int x,int y)const{return read({x,y,1,1}).front();}
};
// tools-fill enqueueIfMatching paints the popped pixel before testing its
// neighbours. Styles and shared references therefore observe current pixels.
template<class Allowed,class Paint>
void visitLiveFill(int w,int h,Point seed,WandOptions options,const std::optional<SelectionMask>& selection,const Allowed& allowed,const FillCompositeSource& source,const Paint& paint){
 const auto target=source.point(seed.x,seed.y);const int tolerance=std::clamp(options.tolerance,0,255);
 auto matches=[&](int x,int y){if(!allowed(x,y)||(selection&&!selectionContains(selection,x,y)))return false;const auto color=source.point(x,y);int difference=0;for(int shift:{0,8,16,24})difference=std::max(difference,std::abs(int((color>>shift)&255)-int((target>>shift)&255)));return difference<=tolerance;};
 if(!options.contiguous){for(int y=0;y<h;++y)for(int x=0;x<w;++x)if(matches(x,y))paint(x,y);return;}
 std::vector<unsigned char> visited(std::size_t(w)*h);std::vector<std::size_t> stack;
 auto enqueue=[&](int x,int y){if(x<0||y<0||x>=w||y>=h)return;const auto i=std::size_t(y)*w+x;if(visited[i]||!matches(x,y))return;visited[i]=1;stack.push_back(i);};
 enqueue(seed.x,seed.y);while(!stack.empty()){const auto i=stack.back();stack.pop_back();const int x=int(i%w),y=int(i/w);paint(x,y);enqueue(x-1,y);enqueue(x+1,y);enqueue(x,y-1);enqueue(x,y+1);if(options.connectivity==8){enqueue(x-1,y-1);enqueue(x+1,y-1);enqueue(x-1,y+1);enqueue(x+1,y+1);}}
}
}
std::vector<Pixel> Document::sparseFillCanvas(const timeline::Surface& source)const{
 raster::validate(source);raster::coordinate(std::int64_t(source.offsetX)+source.width);raster::coordinate(std::int64_t(source.offsetY)+source.height);
 constexpr std::size_t limit=256*1024*1024;const auto bytes=std::size_t(width_)*height_*sizeof(Pixel);std::size_t used=0;
 for(const auto& c:timeline_.state().cels)if(c.surface){if(c.surface->pixels.size()>(limit-used)/sizeof(Pixel))throw std::length_error("Fill exceeds document pixel budget");used+=c.surface->pixels.size()*sizeof(Pixel);}
 if(bytes>limit-used)throw std::length_error("Fill staging exceeds document pixel budget");std::vector<Pixel> out(std::size_t(width_)*height_);
 const auto left=std::max<std::int64_t>(0,source.offsetX),top=std::max<std::int64_t>(0,source.offsetY),right=std::min<std::int64_t>(width_,std::int64_t(source.offsetX)+source.width),bottom=std::min<std::int64_t>(height_,std::int64_t(source.offsetY)+source.height);
 if(right>left)for(auto y=top;y<bottom;++y)std::copy_n(source.pixels.begin()+*raster::worldIndex(source,left,y),std::size_t(right-left),out.begin()+std::size_t(y)*width_+std::size_t(left));return out;
}
bool Document::commitSparseFill(Edit edit,const std::vector<Pixel>& canvas,SparseFillGeometry geometry){
 const bool changed=!edit.contentHistory.runs.empty()||!edit.pixels.empty()||edit.contentHistory.dense||!edit.children.empty();if(!changed&&!geometry.expanded){change_={};return false;}
 const auto resolution=timeline_.resolveSurface(cel().id);if(resolution.issue!=timeline::LinkIssue::None||!resolution.source||!resolution.surface)throw std::logic_error("Invalid sparse fill owner");const auto& source=*resolution.surface;if(canvas.size()!=std::size_t(width_)*height_)throw std::logic_error("Invalid fill staging");
 std::optional<timeline::Surface> candidate;
 if(geometry.expanded){constexpr std::size_t limit=256*1024*1024;std::size_t used=canvas.size()*sizeof(Pixel);for(const auto& c:timeline_.state().cels)if(c.surface){if(c.surface->pixels.size()>(limit-used)/sizeof(Pixel))throw std::length_error("Fill expansion exceeds pixel budget");used+=c.surface->pixels.size()*sizeof(Pixel);}
  if(source.width==1&&source.height==1){auto placeholderSource=source;placeholderSource.pixels[0]=geometry.discardPlaceholder?0:source.format==timeline::RasterFormat::Indexed?source.pixels[0]:(source.pixels[0]|0xff000000u);candidate=raster::expanded(placeholderSource,{0,0,width_,height_},limit-used);}else candidate=raster::expanded(source,{0,0,width_,height_},limit-used);
 }
 const auto& target=candidate?*candidate:source;const PixelAddressSpace address{width_,height_,raster::coordinate(std::int64_t(target.storageOriginX.value_or(0))-target.offsetX),raster::coordinate(std::int64_t(target.storageOriginY.value_or(0))-target.offsetY)};
 auto addresses=[&](auto&& self,Edit& e)->void{if(!e.contentHistory.runs.empty()||!e.pixels.empty()||e.contentHistory.dense)e.contentHistory.pixelAddress=address;for(auto& child:e.children)self(self,child);};addresses(addresses,edit);
 auto copyCanvas=[&](timeline::Surface& out){const auto left=std::max<std::int64_t>(0,out.offsetX),top=std::max<std::int64_t>(0,out.offsetY),right=std::min<std::int64_t>(width_,std::int64_t(out.offsetX)+out.width),bottom=std::min<std::int64_t>(height_,std::int64_t(out.offsetY)+out.height);if(right>left)for(auto y=top;y<bottom;++y)std::copy_n(canvas.begin()+std::size_t(y)*width_+std::size_t(left),std::size_t(right-left),out.pixels.begin()+*raster::worldIndex(out,left,y));};
 if(candidate)copyCanvas(*candidate);if(changed)reserveHistoryEntries();auto* owner=timeline_.mutableOwnedSurface(resolution.source->id);if(!owner)throw std::logic_error("Missing sparse fill owner");if(candidate)std::swap(*owner,*candidate);else if(changed)copyCanvas(*owner);
 if(!changed){change_={};return false;}publishChange();pushEdit(std::move(edit),U"连续填充");return true;
}
void Document::prepareSparseFillGeometry(std::vector<Pixel>& canvas,const timeline::Surface& s,Point seed,WandOptions options,SparseFillGeometry& geometry,bool compactSolid)const{
 geometry.localClosureResolved=false;geometry.localClosure.reset();if(geometry.expanded)return;
 const auto colors=s.format==timeline::RasterFormat::Indexed?std::optional<RasterColorContext>{fillColors(*this)}:std::nullopt;
 auto current=[&](int x,int y){const std::int64_t wx=std::int64_t(s.offsetX)+x,wy=std::int64_t(s.offsetY)+y;return wx>=0&&wy>=0&&wx<width_&&wy<height_?canvas[std::size_t(wy)*width_+std::size_t(wx)]:s.pixels[std::size_t(y)*s.width+x];};
 auto expand=[&]{geometry.discardPlaceholder=s.width==1&&s.height==1&&(colors?current(0,0)==0:(current(0,0)>>24)==0);geometry.expanded=true;if(geometry.discardPlaceholder&&s.offsetX>=0&&s.offsetY>=0&&s.offsetX<width_&&s.offsetY<height_)canvas[std::size_t(s.offsetY)*width_+s.offsetX]=0;};
 if(!raster::worldIndex(s,seed.x,seed.y)){expand();return;}
 const std::int64_t sl=s.offsetX,st=s.offsetY,sr=sl+s.width,sb=st+s.height;
 if(sl<=0&&st<=0&&sr>=width_&&sb>=height_)return;
 if(options.visibleLayers)return;
 const Pixel target=canvas[std::size_t(seed.y)*width_+seed.x];const int tolerance=std::clamp(options.tolerance,0,255);
 auto matchesValue=[&](Pixel value){if(colors&&!tolerance)return value==target;const auto a=colors?colors->toolColor(s.format,value):value,b=colors?colors->toolColor(s.format,target):target;int difference=0;for(int shift:{0,8,16,24})difference=std::max(difference,std::abs(int((a>>shift)&255)-int((b>>shift)&255)));return difference<=tolerance;};
 const bool matchesZero=matchesValue(0);
 const std::int64_t bl=selection_?std::max(0,selection_->x):0,bt=selection_?std::max(0,selection_->y):0,br=selection_?std::min<std::int64_t>(width_,std::int64_t(selection_->x)+selection_->width):width_,bb=selection_?std::min<std::int64_t>(height_,std::int64_t(selection_->y)+selection_->height):height_;
 const bool beyond=br>bl&&bb>bt&&(bl<sl||bt<st||br>sr||bb>sb);
 if(compactSolid&&options.contiguous&&options.gapClosing&&options.gapThreshold>0&&tolerance==0&&!selection_&&options.connectivity==4&&std::size_t(width_)*height_>=512*512){
  std::int64_t cl=0,ct=0,cr=0,cb=0;bool content=false;
  for(int y=0;y<s.height;++y)for(int x=0;x<s.width;++x)if(colors?colors->visible(s.format,current(x,y)):bool(current(x,y)>>24)){const auto wx=sl+x,wy=st+y;if(!content){cl=wx;ct=wy;cr=wx+1;cb=wy+1;content=true;}else{cl=std::min(cl,wx);ct=std::min(ct,wy);cr=std::max(cr,wx+1);cb=std::max(cb,wy+1);}}
  if(!content){cl=seed.x;ct=seed.y;cr=seed.x+1;cb=seed.y+1;}
  const int padding=std::max(2,options.gapThreshold+2);
  const auto left=std::max(std::max<std::int64_t>(0,sl),std::min<std::int64_t>(seed.x,cl)-padding),top=std::max(std::max<std::int64_t>(0,st),std::min<std::int64_t>(seed.y,ct)-padding),right=std::min(std::min<std::int64_t>(width_,sr),std::max<std::int64_t>(seed.x+1,cr)+padding),bottom=std::min(std::min<std::int64_t>(height_,sb),std::max<std::int64_t>(seed.y+1,cb)+padding);
  if(right<=left||bottom<=top)return;const int w=int(right-left),h=int(bottom-top);std::vector<Pixel> local(std::size_t(w)*h);for(int y=0;y<h;++y)for(int x=0;x<w;++x)local[std::size_t(y)*w+x]=current(int(left-sl)+x,int(top-st)+y);
  auto region=fillRegion(local,w,h,int(seed.x-left),int(seed.y-top),options,{},colors?&*colors:nullptr);const bool touches=region&&(region->x==0||region->y==0||region->x+region->width==w||region->y+region->height==h);if(matchesZero&&beyond&&touches){expand();return;}if(!touches){geometry.localClosureResolved=true;if(region){region->x+=int(left);region->y+=int(top);geometry.localClosure=std::move(region);}}return;
 }
 if(!matchesZero||!beyond)return;if(!options.contiguous){expand();return;}
 // Legacy geometry escape is four-connected even for an eight-connected fill.
 std::vector<unsigned char> visited(s.pixels.size());std::vector<std::size_t> stack;stack.reserve(std::min<std::size_t>(s.pixels.size(),1024));
 auto matches=[&](int x,int y){return x>=0&&y>=0&&x<s.width&&y<s.height&&!visited[std::size_t(y)*s.width+x]&&(!selection_||selectionContains(selection_,int(sl+x),int(st+y)))&&matchesValue(current(x,y));};
 auto push=[&](int x,int y){if(matches(x,y)){const auto index=std::size_t(y)*s.width+x;visited[index]=1;stack.push_back(index);}};
 auto outside=[&](std::int64_t x,std::int64_t y){return x>=0&&y>=0&&x<width_&&y<height_&&(!selection_||selectionContains(selection_,int(x),int(y)));};
 auto scan=[&](int left,int right,int y){if(y<0||y>=s.height)return;int x=left;while(x<=right){while(x<=right&&!matches(x,y))++x;if(x>right)break;push(x++,y);while(x<=right&&matches(x,y))++x;}};
 push(int(seed.x-sl),int(seed.y-st));while(!stack.empty()){const auto index=stack.back();stack.pop_back();const int x=int(index%std::size_t(s.width)),y=int(index/std::size_t(s.width));int left=x,right=x;while(matches(left-1,y))--left;while(matches(right+1,y))++right;std::fill(visited.begin()+std::size_t(y)*s.width+left,visited.begin()+std::size_t(y)*s.width+right+1,1);
  if((left==0&&outside(sl-1,st+y))||(right==s.width-1&&outside(sr,st+y))){expand();return;}
  if(y==0||y==s.height-1){const auto outsideY=y==0?st-1:sb;for(int px=left;px<=right;++px)if(outside(sl+px,outsideY)){expand();return;}}
  scan(left,right,y-1);scan(left,right,y+1);
 }
}
bool Document::fillCanvasAt(std::vector<Pixel>& storage,Point point,Pixel color,WandOptions options,Edit& edit,const timeline::Surface* sparseSource,SparseFillGeometry* geometry){
 if(point.x<0||point.y<0||point.x>=width_||point.y>=height_||(selection_&&!selectionContains(selection_,point.x,point.y)))return false;
 if(sparseSource&&geometry)prepareSparseFillGeometry(storage,*sparseSource,point,options,*geometry,true);
 auto allowed=[&](int x,int y){return !sparseSource||!geometry||geometry->expanded||bool(raster::worldIndex(*sparseSource,x,y));};
 const auto colors=indexedFill(*this)?std::optional<RasterColorContext>{fillColors(*this)}:std::nullopt;
 const auto seed=std::size_t(point.y)*width_+point.x;const auto target=storage[seed];auto paint=[&](Pixel current){if(colors)return colors->packedValue(timeline::RasterFormat::Indexed,raster::paintValue(timeline::RasterFormat::Indexed,current,{},color,*colors));const auto painted=(color>>24)==0?color:brushComposite(current,color,100);return normalizeCanvasPacked(painted,!activeMaskId_.empty());};const auto next=paint(target);if(!options.visibleLayers&&target==next)return false;
 std::optional<FillCompositeSource> reference;if(fillSamplingBounds_&&options.visibleLayers)reference.emplace(*this,storage,sparseSource,colors?&*colors:nullptr,fillSamplingBounds_);
 auto run=[&](std::size_t index,std::size_t count,Pixel before,Pixel after){if(before==after)return;if(sparseSource&&geometry&&!geometry->expanded){const auto x=std::int64_t(index%std::size_t(width_)),y=std::int64_t(index/std::size_t(width_)),left=std::max<std::int64_t>(x,sparseSource->offsetX),right=std::min<std::int64_t>(x+std::int64_t(count),std::int64_t(sparseSource->offsetX)+sparseSource->width);if(y<sparseSource->offsetY||y>=std::int64_t(sparseSource->offsetY)+sparseSource->height||right<=left)return;index+=std::size_t(left-x);count=std::size_t(right-left);}edit.contentHistory.runs.push_back({index,count,before,after});std::fill_n(storage.begin()+index,count,after);if(reference)reference->changed(index,count,after);change_.include(int(index%width_),int(index/width_));change_.include(int((index+count-1)%width_),int((index+count-1)/width_));};
 try{
  const bool compact=storage.size()>=512*512&&!options.visibleLayers&&options.connectivity==4&&options.tolerance==0&&!(options.contiguous&&options.gapClosing);
  if(reference&&(!options.contiguous||!options.gapClosing)){visitLiveFill(width_,height_,point,options,selection_,allowed,*reference,[&](int x,int y){const auto i=std::size_t(y)*width_+x;const auto before=storage[i];run(i,1,before,paint(before));});}
  else if(compact){auto matches=[&](std::size_t i){return storage[i]==target&&allowed(int(i%width_),int(i/width_))&&(!selection_||selectionContains(selection_,int(i%width_),int(i/width_)));};
   if(!options.contiguous){for(int y=0;y<height_;++y){std::size_t i=std::size_t(y)*width_,end=i+width_;while(i<end){while(i<end&&!matches(i))++i;if(i==end)break;const auto left=i++;while(i<end&&matches(i))++i;run(left,i-left,target,next);}}}
   else if(!selection_&&(!sparseSource||geometry->expanded||(sparseSource->offsetX<=0&&sparseSource->offsetY<=0&&std::int64_t(sparseSource->offsetX)+sparseSource->width>=width_&&std::int64_t(sparseSource->offsetY)+sparseSource->height>=height_))&&std::all_of(storage.begin(),storage.end(),[&](Pixel p){return p==target;})){for(int y=0;y<height_;++y)run(std::size_t(y)*width_,width_,target,next);}
   else{std::vector<std::size_t> stack{seed};auto neighbor=[&](std::ptrdiff_t l,std::ptrdiff_t r){if(l<0||r>std::ptrdiff_t(storage.size()))return;while(l<r){while(l<r&&!matches(std::size_t(l)))++l;if(l==r)break;stack.push_back(std::size_t(l++));while(l<r&&matches(std::size_t(l)))++l;}};while(!stack.empty()){auto i=stack.back();stack.pop_back();if(!matches(i))continue;const auto row=i-i%width_;auto l=i,r=i+1;while(l>row&&matches(l-1))--l;while(r<row+width_&&matches(r))++r;run(l,r-l,target,next);neighbor(std::ptrdiff_t(l)-width_,std::ptrdiff_t(r)-width_);neighbor(l+width_,r+width_);}}
  }else{
   std::optional<SelectionMask> fillSelection=selection_;
 if(sparseSource&&geometry&&!geometry->expanded){const int left=int(std::max<std::int64_t>(0,sparseSource->offsetX)),top=int(std::max<std::int64_t>(0,sparseSource->offsetY)),right=int(std::min<std::int64_t>(width_,std::int64_t(sparseSource->offsetX)+sparseSource->width)),bottom=int(std::min<std::int64_t>(height_,std::int64_t(sparseSource->offsetY)+sparseSource->height));if(right<=left||bottom<=top)return false;SelectionMask clip{left,top,right-left,bottom-top,{}};if(selection_){clip.mask.resize(std::size_t(clip.width)*clip.height);for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)clip.mask[std::size_t(y-top)*clip.width+x-left]=selectionContains(selection_,x,y)?1:0;}fillSelection=std::move(clip);}
   const auto composite=options.visibleLayers?FillCompositeSource(*this,storage,sparseSource,colors?&*colors:nullptr,fillSamplingBounds_).read({0,0,width_,height_}):std::vector<Pixel>{};
   auto region=(sparseSource&&geometry&&geometry->localClosureResolved)?geometry->localClosure:fillRegion(options.visibleLayers?composite:storage,width_,height_,point.x,point.y,options,fillSelection,colors&&!options.visibleLayers?&*colors:nullptr);if(!region)return false;
   for(int y=region->y;y<region->y+region->height;++y){int x=region->x;while(x<region->x+region->width){if(!selectionContains(region,x,y)||!allowed(x,y)){++x;continue;}const auto index=std::size_t(y)*width_+x;const auto current=storage[index],value=paint(current);const int left=x++;while(x<region->x+region->width&&selectionContains(region,x,y)&&allowed(x,y)&&storage[std::size_t(y)*width_+x]==current)++x;run(index,x-left,current,value);}}
  }
 }catch(...){for(auto it=edit.contentHistory.runs.rbegin();it!=edit.contentHistory.runs.rend();++it)std::fill_n(storage.begin()+it->index,it->length,it->before);change_={};throw;}
 return !edit.contentHistory.runs.empty();
}
bool Document::fillPatternCanvasAt(std::vector<Pixel>& storage,Point point,Pixel color,const PatternFillOptions& pattern,WandOptions options,Edit& edit,const timeline::Surface* sparseSource,SparseFillGeometry* geometry){
 if(point.x<0||point.y<0||point.x>=width_||point.y>=height_||(selection_&&!selectionContains(selection_,point.x,point.y)))return false;
 if(sparseSource&&geometry)prepareSparseFillGeometry(storage,*sparseSource,point,options,*geometry,false);
 std::optional<SelectionMask> fillSelection=selection_;
 if(sparseSource&&geometry&&!geometry->expanded){const int left=int(std::max<std::int64_t>(0,sparseSource->offsetX)),top=int(std::max<std::int64_t>(0,sparseSource->offsetY)),right=int(std::min<std::int64_t>(width_,std::int64_t(sparseSource->offsetX)+sparseSource->width)),bottom=int(std::min<std::int64_t>(height_,std::int64_t(sparseSource->offsetY)+sparseSource->height));if(right<=left||bottom<=top)return false;SelectionMask clip{left,top,right-left,bottom-top,{}};if(selection_){clip.mask.resize(std::size_t(clip.width)*clip.height);for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)clip.mask[std::size_t(y-top)*clip.width+x-left]=selectionContains(selection_,x,y)?1:0;}fillSelection=std::move(clip);}
 const auto colors=indexedFill(*this)?std::optional<RasterColorContext>{fillColors(*this)}:std::nullopt;
 const bool deferred=options.contiguous&&!pattern.brushes.empty()&&(pattern.mode!=PatternMode::Default||pattern.brushes.size()>1);
 std::optional<FillCompositeSource> reference;if(fillSamplingBounds_&&options.visibleLayers)reference.emplace(*this,storage,sparseSource,colors?&*colors:nullptr,fillSamplingBounds_);
 const bool live=reference&&!deferred&&(!options.contiguous||!options.gapClosing);
 std::optional<SelectionMask> region;
 if(!live){const auto composite=options.visibleLayers?FillCompositeSource(*this,storage,sparseSource,colors?&*colors:nullptr,fillSamplingBounds_).read({0,0,width_,height_}):std::vector<Pixel>{};region=fillRegion(options.visibleLayers?composite:storage,width_,height_,point.x,point.y,options,fillSelection,colors&&!options.visibleLayers?&*colors:nullptr);if(!region)return false;}
 auto bounds=deferred?*region:selection_.value_or(SelectionMask{0,0,width_,height_,{}});PatternFillSampler sampler(pattern,color,point.x,point.y,bounds.x,bounds.y,bounds.width,bounds.height);
 auto allowed=[&](int x,int y){return !sparseSource||!geometry||geometry->expanded||bool(raster::worldIndex(*sparseSource,x,y));};
 auto paint=[&](int x,int y){auto sample=sampler.sample(x,y);if(sample.coverage<=0)return;auto source=sample.hasColor?sample.color:color;if(sample.coverage!=255)source=(source&0xffffff)|(std::uint32_t(std::lround((source>>24)*sample.coverage/255.0))<<24);const auto i=std::size_t(y)*width_+x;const auto before=storage[i];const auto after=colors?colors->packedValue(timeline::RasterFormat::Indexed,raster::paintValue(timeline::RasterFormat::Indexed,before,{},source,*colors)):normalizeCanvasPacked((source>>24)==0?source:brushComposite(before,source,100),!activeMaskId_.empty());if(before==after)return;
  if(!edit.contentHistory.runs.empty()&&edit.contentHistory.runs.back().index+edit.contentHistory.runs.back().length==i&&edit.contentHistory.runs.back().index/width_==i/width_&&edit.contentHistory.runs.back().before==before&&edit.contentHistory.runs.back().after==after)++edit.contentHistory.runs.back().length;else edit.contentHistory.runs.push_back({i,1,before,after});change_.include(x,y);if(live){storage[i]=after;reference->changed(i,1,after);}
 };
 try{if(live)visitLiveFill(width_,height_,point,options,selection_,allowed,*reference,paint);else for(int y=region->y;y<region->y+region->height;++y)for(int x=region->x;x<region->x+region->width;++x)if(selectionContains(region,x,y)&&allowed(x,y))paint(x,y);}
 catch(...){if(live)for(auto it=edit.contentHistory.runs.rbegin();it!=edit.contentHistory.runs.rend();++it)std::fill_n(storage.begin()+it->index,it->length,it->before);change_={};throw;}
 if(edit.contentHistory.runs.empty())return false;if(!live)for(const auto& run:edit.contentHistory.runs)std::fill_n(storage.begin()+run.index,run.length,run.after);return true;
}

bool Document::fillSparse(Point point,Pixel color,WandOptions options,const PatternFillOptions* pattern){HistoryLabelScope historyLabel(*this,options.contiguous?U"连续填充":U"不连续填充");
 commitFloatingPaste();cancelStroke();if(pattern)cancelGradient();change_={};if(!rasterToolsAvailable())return false;
 std::vector<Point> seeds;if(symmetryHas(symmetryAxes)&&!fillSymmetryDispatch_){for(auto p:symmetryPoints({point.x,point.y},width_,height_,symmetryAxes,symmetryCenter()))seeds.push_back({p.x,p.y});}else seeds={point};
 seeds.erase(std::remove_if(seeds.begin(),seeds.end(),[&](auto p){return p.x<0||p.y<0||p.x>=width_||p.y>=height_||(selection_&&!selectionContains(selection_,p.x,p.y));}),seeds.end());if(seeds.empty())return false;
 if(!timeline_.findCel(layer().id,frame().id)){

  timeline::Surface empty;empty.format=colorMode_==color_mode::Mode::Indexed?timeline::RasterFormat::Indexed:timeline::RasterFormat::Rgba;empty.width=empty.height=1;empty.pixels={0};auto canvas=sparseFillCanvas(empty);Edit edit{{},state_,nextState_};
  try{
   for(auto seed:seeds){Edit child{{},state_,nextState_};const bool changed=pattern?fillPatternCanvasAt(canvas,seed,color,*pattern,options,child):fillCanvasAt(canvas,seed,color,options,child);if(changed)edit.children.push_back(std::move(child));}
   if(edit.children.empty()){change_={};return false;}
   if(edit.children.size()==1){auto single=std::move(edit.children.front());edit=std::move(single);}
   auto candidate=timeline_.state();timeline::Cel created;created.id="cel-"+layer().id+"-"+frame().id;for(std::size_t suffix=1;timeline_.findCelById(created.id);++suffix)created.id="cel-"+layer().id+"-"+frame().id+"-"+std::to_string(suffix);created.layerId=layer().id;created.frameId=frame().id;created.opacity=layer().opacity;created.surface=timeline::Surface{width_,height_,0,0,{},{},timeline::LinkedPixelStorage(std::move(canvas))};created.surface->format=empty.format;
   auto address=[&](auto&& self,Edit& e)->void{e.contentHistory.targetCelId=created.id;e.contentHistory.pixelAddress=PixelAddressSpace{width_,height_,0,0};e.beforeSelection=e.afterSelection=selectedFrames_;for(auto& child:e.children)self(self,child);};address(address,edit);
   const auto preferredOwner=created.id;candidate.cels.push_back(std::move(created));timeline::Timeline prepared(std::move(candidate),preferredOwner);reserveHistoryEntries();auto previous=std::move(timeline_);timeline_=std::move(prepared);
   try{pushEdit(std::move(edit),options.contiguous?U"连续填充":U"不连续填充");}catch(...){timeline_=std::move(previous);throw;}publishChange();return true;
  }catch(...){change_={};throw;}
 }
 const auto resolved=timeline_.resolveSurface(cel().id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)throw std::logic_error("Invalid sparse fill source");const auto& source=*resolved.surface;
 auto canvas=sparseFillCanvas(source);SparseFillGeometry geometry;Edit group{{},state_,nextState_};group.beforeSelection=group.afterSelection=selectedFrames_;
 try{for(auto seed:seeds){Edit child{{},state_,nextState_};child.contentHistory.targetCelId=cel().id;child.beforeSelection=child.afterSelection=selectedFrames_;const bool changed=pattern?fillPatternCanvasAt(canvas,seed,color,*pattern,options,child,&source,&geometry):fillCanvasAt(canvas,seed,color,options,child,&source,&geometry);if(changed)group.children.push_back(std::move(child));}
  if(group.children.size()==1){auto single=std::move(group.children.front());return commitSparseFill(std::move(single),canvas,geometry);}return commitSparseFill(std::move(group),canvas,geometry);
 }catch(...){change_={};throw;}
}
bool Document::fillPixels(Point point,Pixel color,WandOptions options){
 if(!activeMaskId_.empty())return fillAttachedMask(point,color,options,nullptr);
 if(layer().kind=="tilemap")return fillTilemapPixels(point,color,options,nullptr);
 if(layer().kind=="free-tile")return fillFreeTileSourcePixels(point,color,options,nullptr);
 const FillSamplingScope sampling(*this,options,fillSamplingBounds_);
 {if(!timeline_.findCel(layer().id,frame().id))return fillSparse(point,color,options);const auto r=timeline_.resolveSurface(cel().id);if(r.surface&&!raster::fullCanvas(*r.surface,width_,height_))return fillSparse(point,color,options);}
 if(symmetryHas(symmetryAxes)&&!fillSymmetryDispatch_){const auto start=history_.position();const auto selected=selectedFrames_;const auto axes=symmetryAxes;symmetryAxes={};fillSymmetryDispatch_=true;const auto oldGrouping=groupingHistory_;groupingHistory_=true;try{for(auto p:symmetryPoints({point.x,point.y},width_,height_,axes,symmetryCenter()))fillPixels({p.x,p.y},color,options);}catch(...){groupingHistory_=oldGrouping;fillSymmetryDispatch_=false;symmetryAxes=axes;while(history_.position()>start)undo();throw;}groupingHistory_=oldGrouping;fillSymmetryDispatch_=false;symmetryAxes=axes;groupEdits(start,selected);return history_.position()>start;}
 commitFloatingPaste();cancelStroke();if(!rasterToolsAvailable()||point.x<0||point.y<0||point.x>=width_||point.y>=height_||(selection_&&!selectionContains(selection_,point.x,point.y)))return false;
 auto& storage=pixelStorage();Edit edit{{},state_,nextState_};edit.contentHistory.targetCelId=cel().id;edit.contentHistory.pixelAddress=PixelAddressSpace{width_,height_,activeSurface().storageOriginX.value_or(0),activeSurface().storageOriginY.value_or(0)};edit.beforeSelection=edit.afterSelection=selectedFrames_;change_={};reserveHistoryEntries();if(!fillCanvasAt(storage,point,color,options,edit))return false;publishChange();pushEdit(std::move(edit),options.contiguous?U"连续填充":U"不连续填充");return true;
}
bool Document::fillPatternPixels(Point point,Pixel color,const PatternFillOptions& pattern,WandOptions options){
 if(!activeMaskId_.empty())return fillAttachedMask(point,color,options,&pattern);
 if(layer().kind=="tilemap")return fillTilemapPixels(point,color,options,pattern.brushes.empty()&&pattern.texture==FillTexture::Solid?nullptr:&pattern);
 if(layer().kind=="free-tile")return fillFreeTileSourcePixels(point,color,options,&pattern);
 if(pattern.brushes.empty()&&pattern.texture==FillTexture::Solid)return fillPixels(point,color,options);
 const FillSamplingScope sampling(*this,options,fillSamplingBounds_);
 {if(!timeline_.findCel(layer().id,frame().id))return fillSparse(point,color,options,&pattern);const auto r=timeline_.resolveSurface(cel().id);if(r.surface&&!raster::fullCanvas(*r.surface,width_,height_))return fillSparse(point,color,options,&pattern);}
 if(symmetryHas(symmetryAxes)&&!fillSymmetryDispatch_){const auto start=history_.position();const auto selected=selectedFrames_;const auto axes=symmetryAxes;symmetryAxes={};fillSymmetryDispatch_=true;const auto oldGrouping=groupingHistory_;groupingHistory_=true;try{for(auto p:symmetryPoints({point.x,point.y},width_,height_,axes,symmetryCenter()))fillPatternPixels({p.x,p.y},color,pattern,options);}catch(...){groupingHistory_=oldGrouping;fillSymmetryDispatch_=false;symmetryAxes=axes;while(history_.position()>start)undo();throw;}groupingHistory_=oldGrouping;fillSymmetryDispatch_=false;symmetryAxes=axes;groupEdits(start,selected);return history_.position()>start;}
 commitFloatingPaste();cancelStroke();cancelGradient();if(!rasterToolsAvailable()||point.x<0||point.y<0||point.x>=width_||point.y>=height_||(selection_&&!selectionContains(selection_,point.x,point.y)))return false;
 auto& storage=pixelStorage();Edit edit{{},state_,nextState_};edit.contentHistory.targetCelId=cel().id;edit.contentHistory.pixelAddress=PixelAddressSpace{width_,height_,activeSurface().storageOriginX.value_or(0),activeSurface().storageOriginY.value_or(0)};edit.beforeSelection=edit.afterSelection=selectedFrames_;reserveHistoryEntries();change_={};if(!fillPatternCanvasAt(storage,point,color,pattern,options,edit))return false;publishChange();pushEdit(std::move(edit),options.contiguous?U"连续填充":U"不连续填充");return true;
}
}

namespace moon {
bool Document::eraseMatchingColor(Point point,WandOptions options,bool preview){
 commitFloatingPaste();const bool mask=!activeMaskId_.empty();if(active()||!layer().kind.empty()||(mask?!maskBrushAvailable():!rasterToolsAvailable()))return false;
 if(point.x<0||point.y<0||point.x>=width_||point.y>=height_||(selection_&&!selectionContains(selection_,point.x,point.y)))return false;
 const auto* slot=timeline_.findCel(layer().id,frame().id);if(!slot&&!mask)return false;
 const auto resolved=slot?timeline_.resolveSurface(slot->id):timeline::Resolution{};if(!mask&&(resolved.issue!=timeline::LinkIssue::None||!resolved.surface||!resolved.source))return false;
 const auto& targetSurface=mask?mutableActiveMask()->surface:*resolved.surface;
 raster::validate(targetSurface);
 const auto colors=std::make_shared<const RasterColorContext>(fillColors(*this));
 std::vector<Pixel> source;
 if(!mask&&options.visibleLayers){const auto sampling=compileCompositeSamplingBounds(timeline_,frame().id,*colors);source=compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_},{},nullptr,0,0,0,false,{},{},nullptr,nullptr,colors.get(),&sampling);}
 else if(mask)source=attachedMaskCanvas(targetSurface);
 else{source.resize(std::size_t(width_)*height_);for(int y=0;y<height_;++y)for(int x=0;x<width_;++x){const auto index=raster::worldIndex(targetSurface,x,y);if(index)source[std::size_t(y)*width_+x]=colors->toolColor(targetSurface.format,targetSurface.pixels[*index]);}}
 // Legacy matches the full source first, then intersects the existing selection.
 // A selection must not become an artificial connectivity barrier.
 const auto matched=magicWandSelection(source,width_,height_,point.x,point.y,options);if(!matched)return false;
 // Legacy clearSelection clips to the original visible content bounds. Hidden
 // or unknown words inside those bounds are cleared too; outside words stay.
 int left=targetSurface.width,top=targetSurface.height,right=0,bottom=0;
 for(int y=0;y<targetSurface.height;++y)for(int x=0;x<targetSurface.width;++x)if(colors->contentVisible(targetSurface.format,targetSurface.pixels[std::size_t(y)*targetSurface.width+x])){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);}
 if(right<=left||bottom<=top)return false;
 const auto contentLeft=std::int64_t(targetSurface.offsetX)+left,contentTop=std::int64_t(targetSurface.offsetY)+top,contentRight=std::int64_t(targetSurface.offsetX)+right,contentBottom=std::int64_t(targetSurface.offsetY)+bottom;
 std::vector<Delta> deltas;
 for(int y=matched->y;y<matched->y+matched->height;++y)for(int x=matched->x;x<matched->x+matched->width;++x){
  if(x<contentLeft||y<contentTop||x>=contentRight||y>=contentBottom)continue;
  if(!selectionContains(matched,x,y)||(selection_&&!selectionContains(selection_,x,y)))continue;
  const auto before=raster::readWorld(targetSurface,x,y);if(before)deltas.push_back({std::size_t(y)*width_+x,before,0});
 }
 if(deltas.empty())return false;
 // Clear existing storage only; unlike a brush, erasing cannot expand a sparse Cel.
 auto* owner=mask?&mutableActiveMask()->surface:timeline_.mutableOwnedSurface(resolved.source->id);if(!owner)return false;
 const PixelAddressSpace address{width_,height_,raster::coordinate(std::int64_t(owner->storageOriginX.value_or(0))-owner->offsetX),raster::coordinate(std::int64_t(owner->storageOriginY.value_or(0))-owner->offsetY)};
 clearPendingStroke();pendingLookup_.reset(width_,height_);
 if(mask)prepareMaskStroke(false);
 strokePixels_=&static_cast<std::vector<Pixel>&>(owner->pixels);strokeCanvasStorage_=raster::fullCanvas(*owner,width_,height_);strokeStride_=owner->width;strokeOffsetX_=owner->offsetX;strokeOffsetY_=owner->offsetY;
 strokeAddress_=address;strokeColors_=!mask&&owner->format==timeline::RasterFormat::Indexed?colors:nullptr;
 imageStamp_.reset();inheritedStrokeBaseline_.clear();imageEraseCoverage_.clear();inkStampCoverage_.clear();brush_={};active_=true;projectStrokeStarted_=std::chrono::steady_clock::now();change_={};pending_=std::move(deltas);
 for(std::size_t i=0;i<pending_.size();++i){const auto& d=pending_[i];pendingLookup_.set(d.index,int(i));strokePixel(d.index)=0;change_.include(int(d.index%width_),int(d.index/width_));}publishChange();
 if(preview)return true;HistoryLabelScope label(*this,U"魔术橡皮擦");return commitStroke();
}
// Reuse the established fill algorithms, then legacy convertTilemapPixelEdit.
// Raster values below are transaction staging; cells/tilesets remain authority.
bool Document::fillTilemapPixels(Point point,Pixel color,WandOptions options,const PatternFillOptions* pattern){
 if(active()||!activeMaskId_.empty()||layer().kind!="tilemap"||tileSelection_.mode==tiles::Mode::Paint||hasSelectedGroups()||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer())||!tilemapCellOwnerSupported(cel().id,true,true)||(tileSelection_.mode!=tiles::Mode::Create&&!tilemapPixelReferenceOwnersSupported(layer().tilemapTilesetId)))return false;
 if(point.x<0||point.y<0||point.x>=width_||point.y>=height_||(selection_&&!selectionContains(selection_,point.x,point.y)))return false;
 const auto& state=timeline_.state();const auto setId=layer().tilemapTilesetId;auto originalSet=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==setId;});if(originalSet==state.tilesets.end())return false;
 const auto resolved=timeline_.resolveSurface(cel().id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)return false;
 auto canvas=sparseFillCanvas(*resolved.surface);const auto baseline=canvas;
 const auto previousChange=change_;struct RestoreChange{PixelRegion& change;PixelRegion before;bool committed=false;~RestoreChange(){if(!committed)change=before;}} restore{change_,previousChange};change_={};
 std::vector<Point> seeds;if(symmetryHas(symmetryAxes)&&!fillSymmetryDispatch_){for(auto p:symmetryPoints({point.x,point.y},width_,height_,symmetryAxes,symmetryCenter()))seeds.push_back({p.x,p.y});}else seeds.push_back(point);
 // An expanded staging geometry makes visible-layer sampling use this staged
 // owner, including prior symmetry seeds, without mutating a live cache.
 SparseFillGeometry geometry;geometry.expanded=true;
 for(auto seed:seeds){Edit ignored{{},state_,nextState_};if(pattern)fillPatternCanvasAt(canvas,seed,color,*pattern,options,ignored,resolved.surface,&geometry);else fillCanvasAt(canvas,seed,color,options,ignored,resolved.surface,&geometry);}
 const bool result=commitTilemapPixelCanvas(baseline,canvas,options.contiguous?U"连续填充":U"不连续填充",{},false,nullptr,nullptr,tileSelection_.mode==tiles::Mode::Create,tileSelection_.mode==tiles::Mode::Edit,tileSelection_.mode==tiles::Mode::Hybrid);restore.committed=result;return result;
}
}
