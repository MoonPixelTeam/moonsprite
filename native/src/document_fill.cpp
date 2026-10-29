#include "document.h"
#include "raster_geometry.h"
#include "layer_compositor.h"
#include <algorithm>
#include <stdexcept>
namespace moon {
std::vector<Pixel> Document::sparseFillCanvas(const timeline::Surface& source)const{
 raster::validate(source);raster::coordinate(std::int64_t(source.offsetX)+source.width);raster::coordinate(std::int64_t(source.offsetY)+source.height);
 constexpr std::size_t limit=256*1024*1024;const auto bytes=std::size_t(width_)*height_*sizeof(Pixel);std::size_t used=0;
 for(const auto& c:timeline_.state().cels)if(c.surface){if(c.surface->pixels.size()>(limit-used)/sizeof(Pixel))throw std::length_error("Fill exceeds document pixel budget");used+=c.surface->pixels.size()*sizeof(Pixel);}
 if(bytes>limit-used)throw std::length_error("Fill staging exceeds document pixel budget");std::vector<Pixel> out(std::size_t(width_)*height_);
 const auto left=std::max<std::int64_t>(0,source.offsetX),top=std::max<std::int64_t>(0,source.offsetY),right=std::min<std::int64_t>(width_,std::int64_t(source.offsetX)+source.width),bottom=std::min<std::int64_t>(height_,std::int64_t(source.offsetY)+source.height);
 if(right>left)for(auto y=top;y<bottom;++y)std::copy_n(source.pixels.begin()+*raster::worldIndex(source,left,y),std::size_t(right-left),out.begin()+std::size_t(y)*width_+std::size_t(left));return out;
}
bool Document::commitSparseFill(Edit edit,const std::vector<Pixel>& canvas,SparseFillGeometry geometry){
 const bool changed=!edit.runs.empty()||!edit.pixels.empty()||edit.dense||!edit.children.empty();if(!changed&&!geometry.expanded){change_={};return false;}
 const auto resolution=timeline_.resolveSurface(cel().id);if(resolution.issue!=timeline::LinkIssue::None||!resolution.source||!resolution.surface)throw std::logic_error("Invalid sparse fill owner");const auto& source=*resolution.surface;if(canvas.size()!=std::size_t(width_)*height_)throw std::logic_error("Invalid fill staging");
 std::optional<timeline::Surface> candidate;
 if(geometry.expanded){constexpr std::size_t limit=256*1024*1024;std::size_t used=canvas.size()*sizeof(Pixel);for(const auto& c:timeline_.state().cels)if(c.surface){if(c.surface->pixels.size()>(limit-used)/sizeof(Pixel))throw std::length_error("Fill expansion exceeds pixel budget");used+=c.surface->pixels.size()*sizeof(Pixel);}
  if(source.width==1&&source.height==1){auto placeholderSource=source;placeholderSource.pixels[0]=geometry.discardPlaceholder?0:(source.pixels[0]|0xff000000u);candidate=raster::expanded(placeholderSource,{0,0,width_,height_},limit-used);}else candidate=raster::expanded(source,{0,0,width_,height_},limit-used);
 }
 const auto& target=candidate?*candidate:source;const PixelAddressSpace address{width_,height_,raster::coordinate(std::int64_t(target.storageOriginX.value_or(0))-target.offsetX),raster::coordinate(std::int64_t(target.storageOriginY.value_or(0))-target.offsetY)};
 auto addresses=[&](auto&& self,Edit& e)->void{if(!e.runs.empty()||!e.pixels.empty()||e.dense)e.pixelAddress=address;for(auto& child:e.children)self(self,child);};addresses(addresses,edit);
 auto copyCanvas=[&](timeline::Surface& out){const auto left=std::max<std::int64_t>(0,out.offsetX),top=std::max<std::int64_t>(0,out.offsetY),right=std::min<std::int64_t>(width_,std::int64_t(out.offsetX)+out.width),bottom=std::min<std::int64_t>(height_,std::int64_t(out.offsetY)+out.height);if(right>left)for(auto y=top;y<bottom;++y)std::copy_n(canvas.begin()+std::size_t(y)*width_+std::size_t(left),std::size_t(right-left),out.pixels.begin()+*raster::worldIndex(out,left,y));};
 if(candidate)copyCanvas(*candidate);if(changed)history_.reserve(position_+1);auto* owner=timeline_.mutableOwnedSurface(resolution.source->id);if(!owner)throw std::logic_error("Missing sparse fill owner");if(candidate)std::swap(*owner,*candidate);else if(changed)copyCanvas(*owner);
 if(!changed){change_={};return false;}publishChange();pushEdit(std::move(edit),U"连续填充");return true;
}
void Document::prepareSparseFillGeometry(std::vector<Pixel>& canvas,const timeline::Surface& s,Point seed,WandOptions options,SparseFillGeometry& geometry,bool compactSolid)const{
 geometry.localClosureResolved=false;geometry.localClosure.reset();if(geometry.expanded)return;
 auto current=[&](int x,int y){const std::int64_t wx=std::int64_t(s.offsetX)+x,wy=std::int64_t(s.offsetY)+y;return wx>=0&&wy>=0&&wx<width_&&wy<height_?canvas[std::size_t(wy)*width_+std::size_t(wx)]:s.pixels[std::size_t(y)*s.width+x];};
 auto expand=[&]{geometry.discardPlaceholder=s.width==1&&s.height==1&&(current(0,0)>>24)==0;geometry.expanded=true;if(geometry.discardPlaceholder&&s.offsetX>=0&&s.offsetY>=0&&s.offsetX<width_&&s.offsetY<height_)canvas[std::size_t(s.offsetY)*width_+s.offsetX]=0;};
 if(!raster::worldIndex(s,seed.x,seed.y)){expand();return;}
 const std::int64_t sl=s.offsetX,st=s.offsetY,sr=sl+s.width,sb=st+s.height;
 if(sl<=0&&st<=0&&sr>=width_&&sb>=height_)return;
 if(options.visibleLayers)return;
 const Pixel target=canvas[std::size_t(seed.y)*width_+seed.x];const int tolerance=std::clamp(options.tolerance,0,255);
 auto matchesValue=[&](Pixel value){int difference=0;for(int shift:{0,8,16,24})difference=std::max(difference,std::abs(int((value>>shift)&255)-int((target>>shift)&255)));return difference<=tolerance;};
 const bool matchesZero=matchesValue(0);
 const std::int64_t bl=selection_?std::max(0,selection_->x):0,bt=selection_?std::max(0,selection_->y):0,br=selection_?std::min<std::int64_t>(width_,std::int64_t(selection_->x)+selection_->width):width_,bb=selection_?std::min<std::int64_t>(height_,std::int64_t(selection_->y)+selection_->height):height_;
 const bool beyond=br>bl&&bb>bt&&(bl<sl||bt<st||br>sr||bb>sb);
 if(compactSolid&&options.contiguous&&options.gapClosing&&options.gapThreshold>0&&tolerance==0&&!selection_&&options.connectivity==4&&std::size_t(width_)*height_>=512*512){
  std::int64_t cl=0,ct=0,cr=0,cb=0;bool content=false;
  for(int y=0;y<s.height;++y)for(int x=0;x<s.width;++x)if(current(x,y)>>24){const auto wx=sl+x,wy=st+y;if(!content){cl=wx;ct=wy;cr=wx+1;cb=wy+1;content=true;}else{cl=std::min(cl,wx);ct=std::min(ct,wy);cr=std::max(cr,wx+1);cb=std::max(cb,wy+1);}}
  if(!content){cl=seed.x;ct=seed.y;cr=seed.x+1;cb=seed.y+1;}
  const int padding=std::max(2,options.gapThreshold+2);
  const auto left=std::max(std::max<std::int64_t>(0,sl),std::min<std::int64_t>(seed.x,cl)-padding),top=std::max(std::max<std::int64_t>(0,st),std::min<std::int64_t>(seed.y,ct)-padding),right=std::min(std::min<std::int64_t>(width_,sr),std::max<std::int64_t>(seed.x+1,cr)+padding),bottom=std::min(std::min<std::int64_t>(height_,sb),std::max<std::int64_t>(seed.y+1,cb)+padding);
  if(right<=left||bottom<=top)return;const int w=int(right-left),h=int(bottom-top);std::vector<Pixel> local(std::size_t(w)*h);for(int y=0;y<h;++y)for(int x=0;x<w;++x)local[std::size_t(y)*w+x]=current(int(left-sl)+x,int(top-st)+y);
  auto region=magicWandSelection(local,w,h,int(seed.x-left),int(seed.y-top),options);const bool touches=region&&(region->x==0||region->y==0||region->x+region->width==w||region->y+region->height==h);if(matchesZero&&beyond&&touches){expand();return;}if(!touches){geometry.localClosureResolved=true;if(region){region->x+=int(left);region->y+=int(top);geometry.localClosure=std::move(region);}}return;
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
 const auto seed=std::size_t(point.y)*width_+point.x;const auto target=storage[seed];auto paint=[&](Pixel current){const auto painted=(color>>24)==0?color:brushComposite(current,color,100);return activeMaskId_.empty()?painted:timeline::normalizedMaskPixel(painted);};const auto next=paint(target);if(!options.visibleLayers&&target==next)return false;
 auto run=[&](std::size_t index,std::size_t count,Pixel before,Pixel after){if(before==after)return;if(sparseSource&&geometry&&!geometry->expanded){const auto x=std::int64_t(index%std::size_t(width_)),y=std::int64_t(index/std::size_t(width_)),left=std::max<std::int64_t>(x,sparseSource->offsetX),right=std::min<std::int64_t>(x+std::int64_t(count),std::int64_t(sparseSource->offsetX)+sparseSource->width);if(y<sparseSource->offsetY||y>=std::int64_t(sparseSource->offsetY)+sparseSource->height||right<=left)return;index+=std::size_t(left-x);count=std::size_t(right-left);}edit.runs.push_back({index,count,before,after});std::fill_n(storage.begin()+index,count,after);change_.include(int(index%width_),int(index/width_));change_.include(int((index+count-1)%width_),int((index+count-1)/width_));};
 try{
  const bool compact=storage.size()>=512*512&&!options.visibleLayers&&options.connectivity==4&&options.tolerance==0&&!(options.contiguous&&options.gapClosing);
  if(compact){auto matches=[&](std::size_t i){return storage[i]==target&&allowed(int(i%width_),int(i/width_))&&(!selection_||selectionContains(selection_,int(i%width_),int(i/width_)));};
   if(!options.contiguous){for(int y=0;y<height_;++y){std::size_t i=std::size_t(y)*width_,end=i+width_;while(i<end){while(i<end&&!matches(i))++i;if(i==end)break;const auto left=i++;while(i<end&&matches(i))++i;run(left,i-left,target,next);}}}
   else if(!selection_&&(!sparseSource||geometry->expanded||(sparseSource->offsetX<=0&&sparseSource->offsetY<=0&&std::int64_t(sparseSource->offsetX)+sparseSource->width>=width_&&std::int64_t(sparseSource->offsetY)+sparseSource->height>=height_))&&std::all_of(storage.begin(),storage.end(),[&](Pixel p){return p==target;})){for(int y=0;y<height_;++y)run(std::size_t(y)*width_,width_,target,next);}
   else{std::vector<std::size_t> stack{seed};auto neighbor=[&](std::ptrdiff_t l,std::ptrdiff_t r){if(l<0||r>std::ptrdiff_t(storage.size()))return;while(l<r){while(l<r&&!matches(std::size_t(l)))++l;if(l==r)break;stack.push_back(std::size_t(l++));while(l<r&&matches(std::size_t(l)))++l;}};while(!stack.empty()){auto i=stack.back();stack.pop_back();if(!matches(i))continue;const auto row=i-i%width_;auto l=i,r=i+1;while(l>row&&matches(l-1))--l;while(r<row+width_&&matches(r))++r;run(l,r-l,target,next);neighbor(std::ptrdiff_t(l)-width_,std::ptrdiff_t(r)-width_);neighbor(l+width_,r+width_);}}
  }else{
   std::optional<SelectionMask> fillSelection=selection_;
 if(sparseSource&&geometry&&!geometry->expanded){const int left=int(std::max<std::int64_t>(0,sparseSource->offsetX)),top=int(std::max<std::int64_t>(0,sparseSource->offsetY)),right=int(std::min<std::int64_t>(width_,std::int64_t(sparseSource->offsetX)+sparseSource->width)),bottom=int(std::min<std::int64_t>(height_,std::int64_t(sparseSource->offsetY)+sparseSource->height));if(right<=left||bottom<=top)return false;SelectionMask clip{left,top,right-left,bottom-top,{}};if(selection_){clip.mask.resize(std::size_t(clip.width)*clip.height);for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)clip.mask[std::size_t(y-top)*clip.width+x-left]=selectionContains(selection_,x,y)?1:0;}fillSelection=std::move(clip);}
 const auto root=sparseSource?timeline_.resolveSurface(cel().id).source->id:std::string{};
   const auto composite=options.visibleLayers?compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_},{},sparseSource?&storage:nullptr,sparseSource?width_:0,0,0,false,{},root):std::vector<Pixel>{};
   auto region=(sparseSource&&geometry&&geometry->localClosureResolved)?geometry->localClosure:magicWandSelection(options.visibleLayers?composite:storage,width_,height_,point.x,point.y,options,fillSelection);if(!region)return false;
   for(int y=region->y;y<region->y+region->height;++y){int x=region->x;while(x<region->x+region->width){if(!selectionContains(region,x,y)||!allowed(x,y)){++x;continue;}const auto index=std::size_t(y)*width_+x;const auto current=storage[index],value=paint(current);const int left=x++;while(x<region->x+region->width&&selectionContains(region,x,y)&&allowed(x,y)&&storage[std::size_t(y)*width_+x]==current)++x;run(index,x-left,current,value);}}
  }
 }catch(...){for(auto it=edit.runs.rbegin();it!=edit.runs.rend();++it)std::fill_n(storage.begin()+it->index,it->length,it->before);change_={};throw;}
 return !edit.runs.empty();
}
bool Document::fillPatternCanvasAt(std::vector<Pixel>& storage,Point point,Pixel color,const PatternFillOptions& pattern,WandOptions options,Edit& edit,const timeline::Surface* sparseSource,SparseFillGeometry* geometry){
 if(point.x<0||point.y<0||point.x>=width_||point.y>=height_||(selection_&&!selectionContains(selection_,point.x,point.y)))return false;
 if(sparseSource&&geometry)prepareSparseFillGeometry(storage,*sparseSource,point,options,*geometry,false);
 std::optional<SelectionMask> fillSelection=selection_;
 if(sparseSource&&geometry&&!geometry->expanded){const int left=int(std::max<std::int64_t>(0,sparseSource->offsetX)),top=int(std::max<std::int64_t>(0,sparseSource->offsetY)),right=int(std::min<std::int64_t>(width_,std::int64_t(sparseSource->offsetX)+sparseSource->width)),bottom=int(std::min<std::int64_t>(height_,std::int64_t(sparseSource->offsetY)+sparseSource->height));if(right<=left||bottom<=top)return false;SelectionMask clip{left,top,right-left,bottom-top,{}};if(selection_){clip.mask.resize(std::size_t(clip.width)*clip.height);for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)clip.mask[std::size_t(y-top)*clip.width+x-left]=selectionContains(selection_,x,y)?1:0;}fillSelection=std::move(clip);}
 const auto root=sparseSource?timeline_.resolveSurface(cel().id).source->id:std::string{};
 const auto composite=options.visibleLayers?compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_},{},sparseSource?&storage:nullptr,sparseSource?width_:0,0,0,false,{},root):std::vector<Pixel>{};
 auto region=magicWandSelection(options.visibleLayers?composite:storage,width_,height_,point.x,point.y,options,fillSelection);if(!region)return false;
 const bool deferred=options.contiguous&&!pattern.brushes.empty()&&(pattern.mode!=PatternMode::Default||pattern.brushes.size()>1);auto bounds=deferred?*region:selection_.value_or(SelectionMask{0,0,width_,height_,{}});PatternFillSampler sampler(pattern,color,point.x,point.y,bounds.x,bounds.y,bounds.width,bounds.height);
 for(int y=region->y;y<region->y+region->height;++y)for(int x=region->x;x<region->x+region->width;++x){if(!selectionContains(region,x,y)||(sparseSource&&geometry&&!geometry->expanded&&!raster::worldIndex(*sparseSource,x,y)))continue;auto sample=sampler.sample(x,y);if(sample.coverage<=0)continue;auto source=sample.hasColor?sample.color:color;if(sample.coverage!=255)source=(source&0xffffff)|(std::uint32_t(std::lround((source>>24)*sample.coverage/255.0))<<24);const auto i=std::size_t(y)*width_+x;const auto before=storage[i];const auto painted=(source>>24)==0?source:brushComposite(before,source,100);const auto after=activeMaskId_.empty()?painted:timeline::normalizedMaskPixel(painted);if(before==after)continue;if(!edit.runs.empty()&&edit.runs.back().index+edit.runs.back().length==i&&edit.runs.back().index/width_==i/width_&&edit.runs.back().before==before&&edit.runs.back().after==after)++edit.runs.back().length;else edit.runs.push_back({i,1,before,after});change_.include(x,y);}
 if(edit.runs.empty())return false;for(const auto& run:edit.runs)std::fill_n(storage.begin()+run.index,run.length,run.after);return true;
}
bool Document::fillSparse(Point point,Pixel color,WandOptions options,const PatternFillOptions* pattern){HistoryLabelScope historyLabel(*this,options.contiguous?U"连续填充":U"不连续填充");
 commitFloatingPaste();cancelStroke();if(pattern)cancelGradient();change_={};if(!rasterToolsAvailable())return false;
 std::vector<Point> seeds;if(symmetryHas(symmetryAxes)&&!fillSymmetryDispatch_){for(auto p:symmetryPoints({point.x,point.y},width_,height_,symmetryAxes,symmetryCenter()))seeds.push_back({p.x,p.y});}else seeds={point};
 seeds.erase(std::remove_if(seeds.begin(),seeds.end(),[&](auto p){return p.x<0||p.y<0||p.x>=width_||p.y>=height_||(selection_&&!selectionContains(selection_,p.x,p.y));}),seeds.end());if(seeds.empty())return false;
 const auto resolved=timeline_.resolveSurface(cel().id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source||!resolved.surface)throw std::logic_error("Invalid sparse fill source");const auto& source=*resolved.surface;
 auto canvas=sparseFillCanvas(source);SparseFillGeometry geometry;Edit group{{},state_,nextState_};group.beforeSelection=group.afterSelection=selectedFrames_;
 try{for(auto seed:seeds){Edit child{{},state_,nextState_};child.targetCelId=cel().id;child.beforeSelection=child.afterSelection=selectedFrames_;const bool changed=pattern?fillPatternCanvasAt(canvas,seed,color,*pattern,options,child,&source,&geometry):fillCanvasAt(canvas,seed,color,options,child,&source,&geometry);if(changed)group.children.push_back(std::move(child));}
  if(group.children.size()==1){auto single=std::move(group.children.front());return commitSparseFill(std::move(single),canvas,geometry);}return commitSparseFill(std::move(group),canvas,geometry);
 }catch(...){change_={};throw;}
}
bool Document::fillPixels(Point point,Pixel color,WandOptions options){
 if(!activeMaskId_.empty())return fillAttachedMask(point,color,options,nullptr);
 if(layer().kind=="tilemap")return fillTilemapPixels(point,color,options,nullptr);
 if(layer().kind=="free-tile")return fillFreeTileSourcePixels(point,color,options,nullptr);
 {const auto r=timeline_.resolveSurface(cel().id);if(r.surface&&!raster::fullCanvas(*r.surface,width_,height_))return fillSparse(point,color,options);}
 if(symmetryHas(symmetryAxes)&&!fillSymmetryDispatch_){const auto start=position_;const auto selected=selectedFrames_;const auto axes=symmetryAxes;symmetryAxes={};fillSymmetryDispatch_=true;const auto oldGrouping=groupingHistory_;groupingHistory_=true;try{for(auto p:symmetryPoints({point.x,point.y},width_,height_,axes,symmetryCenter()))fillPixels({p.x,p.y},color,options);}catch(...){groupingHistory_=oldGrouping;fillSymmetryDispatch_=false;symmetryAxes=axes;while(position_>start)undo();throw;}groupingHistory_=oldGrouping;fillSymmetryDispatch_=false;symmetryAxes=axes;groupEdits(start,selected);return position_>start;}
 commitFloatingPaste();cancelStroke();if(!rasterToolsAvailable()||point.x<0||point.y<0||point.x>=width_||point.y>=height_||(selection_&&!selectionContains(selection_,point.x,point.y)))return false;
 auto& storage=pixelStorage();Edit edit{{},state_,nextState_};edit.targetCelId=cel().id;edit.beforeSelection=edit.afterSelection=selectedFrames_;change_={};history_.reserve(position_+1);if(!fillCanvasAt(storage,point,color,options,edit))return false;publishChange();pushEdit(std::move(edit),options.contiguous?U"连续填充":U"不连续填充");return true;
}
bool Document::fillPatternPixels(Point point,Pixel color,const PatternFillOptions& pattern,WandOptions options){
 if(!activeMaskId_.empty())return fillAttachedMask(point,color,options,&pattern);
 if(layer().kind=="tilemap")return fillTilemapPixels(point,color,options,pattern.brushes.empty()&&pattern.texture==FillTexture::Solid?nullptr:&pattern);
 if(layer().kind=="free-tile")return fillFreeTileSourcePixels(point,color,options,&pattern);
 if(pattern.brushes.empty()&&pattern.texture==FillTexture::Solid)return fillPixels(point,color,options);
 {const auto r=timeline_.resolveSurface(cel().id);if(r.surface&&!raster::fullCanvas(*r.surface,width_,height_))return fillSparse(point,color,options,&pattern);}
 if(symmetryHas(symmetryAxes)&&!fillSymmetryDispatch_){const auto start=position_;const auto selected=selectedFrames_;const auto axes=symmetryAxes;symmetryAxes={};fillSymmetryDispatch_=true;const auto oldGrouping=groupingHistory_;groupingHistory_=true;try{for(auto p:symmetryPoints({point.x,point.y},width_,height_,axes,symmetryCenter()))fillPatternPixels({p.x,p.y},color,pattern,options);}catch(...){groupingHistory_=oldGrouping;fillSymmetryDispatch_=false;symmetryAxes=axes;while(position_>start)undo();throw;}groupingHistory_=oldGrouping;fillSymmetryDispatch_=false;symmetryAxes=axes;groupEdits(start,selected);return position_>start;}
 commitFloatingPaste();cancelStroke();cancelGradient();if(!rasterToolsAvailable()||point.x<0||point.y<0||point.x>=width_||point.y>=height_||(selection_&&!selectionContains(selection_,point.x,point.y)))return false;
 auto& storage=pixelStorage();Edit edit{{},state_,nextState_};edit.targetCelId=cel().id;edit.beforeSelection=edit.afterSelection=selectedFrames_;history_.reserve(position_+1);change_={};if(!fillPatternCanvasAt(storage,point,color,pattern,options,edit))return false;publishChange();pushEdit(std::move(edit),options.contiguous?U"连续填充":U"不连续填充");return true;
}
}

namespace moon {
bool Document::eraseMatchingColor(Point point,WandOptions options,bool preview){
 commitFloatingPaste();const bool mask=!activeMaskId_.empty();if(active()||!layer().kind.empty()||(mask?!maskBrushAvailable():!rasterToolsAvailable()))return false;
 if(point.x<0||point.y<0||point.x>=width_||point.y>=height_||(selection_&&!selectionContains(selection_,point.x,point.y)))return false;
 const auto resolved=timeline_.resolveSurface(cel().id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.surface||!resolved.source)return false;
 const auto& targetSurface=mask?mutableActiveMask()->surface:*resolved.surface;
 const auto source=!mask&&options.visibleLayers?compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_}):mask?attachedMaskCanvas(targetSurface):canvasPixels();
 // Legacy matches the full source first, then intersects the existing selection.
 // A selection must not become an artificial connectivity barrier.
 const auto matched=magicWandSelection(source,width_,height_,point.x,point.y,options);if(!matched)return false;
 std::vector<Delta> deltas;
 for(int y=matched->y;y<matched->y+matched->height;++y)for(int x=matched->x;x<matched->x+matched->width;++x){
  if(!selectionContains(matched,x,y)||(selection_&&!selectionContains(selection_,x,y)))continue;
  const auto before=raster::readWorld(targetSurface,x,y);if(before)deltas.push_back({std::size_t(y)*width_+x,before,0});
 }
 if(deltas.empty())return false;
 // Clear existing storage only; unlike a brush, erasing cannot expand a sparse Cel.
 auto* owner=mask?&mutableActiveMask()->surface:timeline_.mutableOwnedSurface(resolved.source->id);if(!owner)return false;
 if(pendingLookup_.size()!=std::size_t(width_)*height_)pendingLookup_.assign(std::size_t(width_)*height_,-1);
 if(mask)maskStrokeBefore_=timeline_.state().masks;
 strokePixels_=&static_cast<std::vector<Pixel>&>(owner->pixels);strokeCanvasStorage_=raster::fullCanvas(*owner,width_,height_);strokeStride_=owner->width;strokeOffsetX_=owner->offsetX;strokeOffsetY_=owner->offsetY;
 strokeAddress_={width_,height_,raster::coordinate(std::int64_t(owner->storageOriginX.value_or(0))-owner->offsetX),raster::coordinate(std::int64_t(owner->storageOriginY.value_or(0))-owner->offsetY)};
 clearPendingStroke();imageStamp_.reset();inheritedStrokeBaseline_.clear();imageEraseCoverage_.clear();inkStampCoverage_.clear();brush_={};active_=true;projectStrokeStarted_=std::chrono::steady_clock::now();change_={};pending_=std::move(deltas);
 for(std::size_t i=0;i<pending_.size();++i){const auto& d=pending_[i];pendingLookup_[d.index]=int(i);strokePixel(d.index)=0;change_.include(int(d.index%width_),int(d.index/width_));}publishChange();
 if(preview)return true;HistoryLabelScope label(*this,U"魔术橡皮擦");return commitStroke();
}
// Reuse the established fill algorithms, then legacy convertTilemapPixelEdit.
// Raster values below are transaction staging; cells/tilesets remain authority.
bool Document::fillTilemapPixels(Point point,Pixel color,WandOptions options,const PatternFillOptions* pattern){
 if(active()||!activeMaskId_.empty()||layer().kind!="tilemap"||tileSelection_.mode==tiles::Mode::Paint||hasSelectedGroups()||layerEffectivelyLocked(layer())||!layerEffectivelyVisible(layer())||!cel().tilemap)return false;
 if(std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.kind=="free-tile";}))return false;
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
 const bool result=commitTilemapPixelCanvas(baseline,canvas,options.contiguous?U"连续填充":U"不连续填充");restore.committed=result;return result;
}
}
