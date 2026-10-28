#include "layer_compositor.h"
#include "layer_style_sampler.h"
#include "layer_group_compositor.h"
#include "cel_properties.h"
#include "layer_blend.h"
#include "raster_geometry.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
namespace moon {
namespace {
using Pixel=timeline::Pixel;
Pixel over(Pixel bottom,Pixel top,double opacity) {
 const unsigned sa=top>>24,ba=bottom>>24;if(!sa || opacity<=0)return bottom;
 if(opacity==1 && (!ba || sa==255))return top;
 const double a=sa/255.0*opacity,b=ba/255.0,total=a+b*(1-a);if(total<=0)return bottom;
 Pixel result=Pixel(std::floor(total*255+0.5))<<24;
 for(int shift:{0,8,16})result|=Pixel(std::floor((((top>>shift)&255)*a+((bottom>>shift)&255)*b*(1-a))/total+0.5))<<shift;
 return result;
}
}
void compositeOpaqueRgbaRow(Pixel* output,const Pixel* source,std::size_t count) {
 for(std::size_t p=0;p<count;) {
  const auto alpha=source[p]>>24;
  if(!alpha){++p;continue;}
  if(alpha==255){const auto first=p++;while(p<count && (source[p]>>24)==255)++p;std::copy(source+first,source+p,output+first);continue;}
  // Match legacy's opaque destination fast path (round once per channel).
  if((output[p]>>24)==255){const auto a=alpha/255.0;Pixel result=0xff000000;for(int shift:{0,8,16})result|=Pixel(std::floor(((source[p]>>shift)&255)*a+((output[p]>>shift)&255)*(1-a)+0.5))<<shift;output[p]=result;}
  else output[p]=over(output[p],source[p],1);
  ++p;
 }
}
std::vector<Pixel> compositeNormalRegion(const timeline::Timeline& timeline,const std::string& frameId,CompositeRegion r,const std::string& previewLayer,const std::vector<Pixel>* preview,int previewWidth,int previewX,int previewY,bool cacheContent,const std::string& targetLayerId,const std::string& previewOwnerCelId,const timeline::AttachedMask* maskPreview) {
 const auto& state=timeline.state();
 const auto* linkedPreviewSlot=previewLayer.empty()?nullptr:timeline.findCel(previewLayer,frameId);
 const auto linkedPreviewRoot=linkedPreviewSlot?timeline.resolveSurface(linkedPreviewSlot->id):timeline::Resolution{};

 if(!timeline.hasFrame(frameId))throw std::invalid_argument("Unknown composite frame");
 if(r.width<0 || r.height<0 || std::int64_t(r.x)+r.width>std::numeric_limits<int>::max() || std::int64_t(r.y)+r.height>std::numeric_limits<int>::max() || std::uint64_t(r.width)*r.height>64*1024*1024)throw std::invalid_argument("Invalid composite region");
 // Storage origins identify stable history coordinates; world rendering uses
 // surface offsets only, including after an owner expands without cropping.
 auto renderLayer=[&](std::size_t index,CompositeRegion r,std::vector<Pixel>& out,bool raw=false){
  const auto* mask=timeline::resolvedMask(state,state.layers[index].id,frameId);if(maskPreview&&mask&&maskPreview->id==mask->id)mask=maskPreview;
  CompositeRegion styleGeometry;
  auto masked=[&](Pixel p,int x,int y){if(mask&&mask->visible){const auto n=timeline::maskCoverage(raster::readWorld(mask->surface,x,y));p=(p&0xffffff)|(Pixel(std::floor((p>>24)*n/255.+.5))<<24);}p=timeline::applyColorOverlay(p,state.layers[index].layerStyles);return timeline::applyGradientOverlay(p,state.layers[index].layerStyles,x,y,styleGeometry.x,styleGeometry.y,styleGeometry.width,styleGeometry.height);};
  const auto& layer=state.layers[index];const double opacity=raw?1:frameCelOpacity(timeline,layer,frameId);const auto mode=raw?LayerBlendMode::Normal:*parseLayerBlendMode(layer.blendMode);if(!targetLayerId.empty()&&layer.id!=targetLayerId)return;if(!layer.visible || opacity<=0)return;
  if(layer.kind=="adjustment"){
   if(!layer.adjustment||!layer.adjustment->enabled)return;GradientMapSampler sample(layer.adjustment->gradientMap);const double amountBase=frameCelOpacity(timeline,layer,frameId);const auto blend=*parseLayerBlendMode(layer.blendMode);
   for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x){const int wx=r.x+x,wy=r.y+y;if(wx<0||wy<0||(state.canvasWidth>0&&wx>=state.canvasWidth)||(state.canvasHeight>0&&wy>=state.canvasHeight))continue;auto& pixel=out[std::size_t(y)*r.width+x];if(!(pixel>>24))continue;const double amount=amountBase*(mask&&mask->visible?timeline::maskCoverage(raster::readWorld(mask->surface,wx,wy))/255.:1.);if(amount<=0)continue;const auto mapped=sample(pixel,wx,wy);const auto alpha=pixel&0xff000000;if(blend==LayerBlendMode::Normal){Pixel result=alpha;for(int shift:{0,8,16})result|=Pixel(std::floor(((pixel>>shift)&255)*(1-amount)+((mapped>>shift)&255)*amount+.5))<<shift;pixel=result;}else pixel=(blendLayerPixel(pixel|0xff000000,mapped|0xff000000,amount,blend)&0xffffff)|alpha;
   }return;
  }
  const auto* cel=timeline.findCel(layer.id,frameId);if(!cel)return;const auto resolved=timeline.resolveSurface(cel->id);if(resolved.issue!=timeline::LinkIssue::None)throw std::invalid_argument("Invalid composite cel link");if(!resolved.surface)return;
  const auto& s=*resolved.surface;styleGeometry={s.offsetX,s.offsetY,s.width,s.height};
  const bool linkedPreview=linkedPreviewRoot.surface&&s.pixels.identity()==linkedPreviewRoot.surface->pixels.identity();
  const std::int64_t linkedDx=linkedPreview?std::int64_t(s.offsetX)-linkedPreviewRoot.surface->offsetX:0,linkedDy=linkedPreview?std::int64_t(s.offsetY)-linkedPreviewRoot.surface->offsetY:0;
  if(layerStyleNeedsSampling(layer.layerStyles)){
   const bool staged=preview&&(layer.id==previewLayer||(!previewOwnerCelId.empty()&&resolved.source->id==previewOwnerCelId)||linkedPreview);
   auto read=[&](int x,int y){Pixel p=0;if(staged){const auto px=std::int64_t(x)-previewX-linkedDx,py=std::int64_t(y)-previewY-linkedDy;if(px>=0&&py>=0&&px<previewWidth&&std::uint64_t(py)*previewWidth+px<preview->size())p=(*preview)[std::size_t(py)*previewWidth+std::size_t(px)];}else p=raster::readWorld(s,x,y);if(mask&&mask->visible){const auto n=timeline::maskCoverage(raster::readWorld(mask->surface,x,y));p=(p&0xffffff)|(Pixel(std::floor((p>>24)*n/255.+.5))<<24);}return p;};
   LayerStyleSampler sampler(layer.layerStyles);for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x){const int wx=r.x+x,wy=r.y+y;const auto p=sampler.sample(read(wx,wy),wx,wy,s.offsetX,s.offsetY,s.width,s.height,read);auto& d=out[std::size_t(y)*r.width+x];d=mode==LayerBlendMode::Normal?over(d,p,opacity):blendLayerPixel(d,p,opacity,mode);}return;
  }
  if(preview && (layer.id==previewLayer || (!previewOwnerCelId.empty() && resolved.source->id==previewOwnerCelId)||linkedPreview)){for(int y=0;y<r.height;++y)for(int x=0;x<r.width;++x){const auto px=std::int64_t(r.x)+x-previewX-linkedDx,py=std::int64_t(r.y)+y-previewY-linkedDy;if(px>=0 && py>=0 && px<previewWidth && std::uint64_t(py)*previewWidth+px<preview->size())out[std::size_t(y)*r.width+x]=mode==LayerBlendMode::Normal?over(out[std::size_t(y)*r.width+x],masked((*preview)[std::size_t(py)*previewWidth+std::size_t(px)],r.x+x,r.y+y),opacity):blendLayerPixel(out[std::size_t(y)*r.width+x],masked((*preview)[std::size_t(py)*previewWidth+std::size_t(px)],r.x+x,r.y+y),opacity,mode);}return;}
  // Legacy opacityGroupCompositeStack excludes empty owners. Reuse only
  // committed summaries while callers may hold live mutable pixel storage.
  if(cacheContent?!timeline.hasVisiblePixels(cel->id):timeline.isKnownEmpty(cel->id))return;
  const auto left=std::max<std::int64_t>(r.x,s.offsetX),top=std::max<std::int64_t>(r.y,s.offsetY);
  const auto right=std::min<std::int64_t>(std::int64_t(r.x)+r.width,std::int64_t(s.offsetX)+s.width),bottom=std::min<std::int64_t>(std::int64_t(r.y)+r.height,std::int64_t(s.offsetY)+s.height);
  for(auto y=top;y<bottom;++y){
   if(right<=left)continue;
   const auto src=raster::worldIndex(s,left,y).value(),dst=std::size_t(y-r.y)*r.width+std::size_t(left-r.x);
   if((mask&&mask->visible)||timeline::styleVisible(layer.layerStyles)){for(auto x=left;x<right;++x){auto& dstPixel=out[dst+std::size_t(x-left)];const auto p=masked(s.pixels[src+std::size_t(x-left)],int(x),int(y));dstPixel=mode==LayerBlendMode::Normal?over(dstPixel,p,opacity):blendLayerPixel(dstPixel,p,opacity,mode);}continue;}
   if(mode!=LayerBlendMode::Normal)blendLayerRow(out.data()+dst,s.pixels.data()+src,std::size_t(right-left),opacity,mode);
   else if(opacity==1)compositeOpaqueRgbaRow(out.data()+dst,s.pixels.data()+src,std::size_t(right-left));
   else for(auto x=left;x<right;++x)out[dst+std::size_t(x-left)]=over(out[dst+std::size_t(x-left)],s.pixels[src+std::size_t(x-left)],opacity);
  }
 };
 if(std::any_of(state.layers.begin(),state.layers.end(),[](const auto& l){return layerStyleNeedsSampling(l.layerStyles);})||std::any_of(state.groups.begin(),state.groups.end(),[](const auto& g){return layerStyleNeedsSampling(g.layerStyles);})||std::any_of(state.layers.begin(),state.layers.end(),[](const auto& l){return l.clippingMask;})||std::any_of(state.groups.begin(),state.groups.end(),[](const auto& g){return g.clippingMask;}))return compositeClippingRegion(timeline,frameId,r,[&](auto i,auto tile,auto& pixels){renderLayer(i,tile,pixels,true);},maskPreview);
 if(!state.groups.empty())return compositeGroupedRegion(timeline,frameId,r,renderLayer,maskPreview);
 std::vector<Pixel> out(std::size_t(r.width)*r.height,0);for(const auto index:frameCompositeLayerOrder(timeline,frameId))renderLayer(index,r,out);
 return out;
}
Pixel tintOnionPixel(Pixel source,Pixel tint,double opacity,int distance){if(!(source>>24))return 0;const double brightness=.25+(((source&255)*.2126+((source>>8)&255)*.7152+((source>>16)&255)*.0722)/255)*.75;Pixel result=Pixel(std::floor((source>>24)*(std::clamp(opacity,0.,100.)/100.0)/std::max(1,distance)*(tint>>24)/255+.5))<<24;for(int shift:{0,8,16})result|=Pixel(std::floor(((tint>>shift)&255)*brightness+.5))<<shift;return result;}
namespace {
// Legacy onion-skin.ts creates display-only layers below a clipping chain's
// base, then runs the ordinary composite plan. Never mutate artwork/history.
std::vector<Pixel> compositeClippingOnionRegion(const timeline::Timeline& timeline,const std::string& frameId,const std::string& layerId,CompositeRegion region,const OnionSkinSettings& settings,const std::string& previewLayer,const std::vector<Pixel>* preview,int previewWidth,const timeline::AttachedMask* maskPreview){
 const auto& original=timeline.state();
 if(region.width<0||region.height<0||std::int64_t(region.x)+region.width>std::numeric_limits<int>::max()||std::int64_t(region.y)+region.height>std::numeric_limits<int>::max()||std::uint64_t(region.width)*region.height>64*1024*1024)throw std::invalid_argument("Invalid onion region");
 timeline::State display;display.canvasWidth=original.canvasWidth;display.canvasHeight=original.canvasHeight;display.layers=original.layers;display.frames=original.frames;display.groups=original.groups;display.loopSections=original.loopSections;
 // Keep committed raster storage shared in this transient shell. Ordinary
 // Timeline/LinkedPixelStorage copy semantics remain deep value copies.
 auto sharedSurface=[](const timeline::Surface& s){timeline::Surface out;out.width=s.width;out.height=s.height;out.offsetX=s.offsetX;out.offsetY=s.offsetY;out.storageOriginX=s.storageOriginX;out.storageOriginY=s.storageOriginY;out.pixels.share(s.pixels);return out;};
 for(const auto& c:original.cels){timeline::Cel copy;copy.id=c.id;copy.layerId=c.layerId;copy.frameId=c.frameId;copy.linkedCelId=c.linkedCelId;copy.runtimeSharedCelId=c.runtimeSharedCelId;copy.opacity=c.opacity;copy.zIndex=c.zIndex;copy.text=c.text;if(c.surface)copy.surface=sharedSurface(*c.surface);display.cels.push_back(std::move(copy));}
 for(const auto& m:original.masks){timeline::MaskSlot copy;copy.ownerId=m.ownerId;copy.frameId=m.frameId;copy.group=m.group;copy.mask.id=m.mask.id;copy.mask.linkedMaskId=m.mask.linkedMaskId;copy.mask.visible=m.mask.visible;copy.mask.locked=m.mask.locked;copy.mask.autoLinkAnimationCels=m.mask.autoLinkAnimationCels;copy.mask.moveWithOwner=m.mask.moveWithOwner;copy.mask.surface=sharedSurface(m.mask.surface);display.masks.push_back(std::move(copy));}
 const auto& frames=original.frames;const int active=int(timeline.frameIndex(frameId));const auto* section=timeline::loopAtFrame(original,frameId);const auto range=section?timeline::loopRange(original,*section):timeline::LoopRange{0,int(frames.size())-1};const int length=range.end-range.start+1;
 struct Ref{std::string frame;int distance;Pixel tint;double opacity;};std::vector<Ref> refs;
 auto appendRefs=[&](bool previous){const int limit=std::min(int(std::floor(std::clamp(previous?settings.previousFrames:settings.nextFrames,0.,8.)+.5)),section?length-1:8);for(int d=limit;d>=1;--d){int n=active+(previous?-d:d);if(section)n=range.start+(n-range.start+length)%length;if(n>=0&&n<int(frames.size()))refs.push_back({frames[n].id,d,previous?settings.previousColor:settings.nextColor,previous?settings.previousOpacity:settings.nextOpacity});}};
 appendRefs(true);appendRefs(false);std::vector<std::vector<timeline::Layer>> ghosts(original.layers.size());std::size_t serial=0;
 // Native stores top-first, legacy bottom-first: reverse both requested
 // owners and generated insertions to preserve the legacy render order.
 for(std::size_t cursor=original.layers.size();cursor>0;--cursor){const auto i=cursor-1;const auto& layer=original.layers[i];if((settings.allLayers?bool(layer.background):layer.id!=layerId)||!timeline::isLayerEffectivelyVisible(original,layer))continue;
  auto anchor=i;while(anchor+1<original.layers.size()&&original.layers[anchor].clippingMask&&original.layers[anchor+1].groupId==layer.groupId)++anchor;int z=0;if(const auto* c=timeline.findCel(original.layers[anchor].id,frameId)){const auto r=timeline.resolveSurface(c->id);if(r.source)z=r.source->zIndex;}
  for(const auto& ref:refs){if(ref.opacity<=0||!(ref.tint>>24))continue;const auto* c=timeline.findCel(layer.id,ref.frame);if(!c)continue;const auto resolved=timeline.resolveSurface(c->id);if(resolved.issue!=timeline::LinkIssue::None)throw std::invalid_argument("Invalid onion link");if(!resolved.surface)continue;
   const auto& s=*resolved.surface;const auto* mask=timeline::resolvedMask(original,layer.id,ref.frame);std::vector<Pixel> pixels(std::size_t(region.width)*region.height);bool visible=false;
   auto read=[&](int x,int y){auto p=raster::readWorld(s,x,y);if(mask&&mask->visible){const auto n=timeline::maskCoverage(raster::readWorld(mask->surface,x,y));p=(p&0xffffff)|(Pixel(std::floor((p>>24)*n/255.+.5))<<24);}return p;};LayerStyleSampler sampler(layer.layerStyles);
   for(int y=0;y<region.height;++y)for(int x=0;x<region.width;++x){auto source=sampler.sample(read(region.x+x,region.y+y),region.x+x,region.y+y,s.offsetX,s.offsetY,s.width,s.height,read);auto& p=pixels[std::size_t(y)*region.width+x];p=tintOnionPixel(over(0,source,frameCelOpacity(timeline,layer,ref.frame)),ref.tint,ref.opacity,ref.distance);visible=visible||bool(p>>24);}
   if(!visible)continue;std::string id;do{id="__moon_onion_display_"+std::to_string(++serial);}while(timeline.hasLayer(id)||timeline.findCelById(id));timeline::Layer ghost;ghost.id=id;ghost.name=U"Onion skin";ghost.locked=true;ghost.groupId=layer.groupId;ghosts[anchor].push_back(std::move(ghost));timeline::Cel cel;cel.id=id;cel.layerId=id;cel.frameId=frameId;cel.zIndex=z;cel.surface=timeline::Surface{region.width,region.height,region.x,region.y,{},{},timeline::LinkedPixelStorage(std::move(pixels))};display.cels.push_back(std::move(cel));
  }
 }
 display.layers.clear();for(std::size_t i=0;i<original.layers.size();++i){display.layers.push_back(original.layers[i]);for(auto g=ghosts[i].rbegin();g!=ghosts[i].rend();++g)display.layers.push_back(std::move(*g));}
 // Render-only projection: tile authority remains on the source Timeline.
 // This transient shell borrows committed raster caches and cannot edit/save.
 for(auto& layer:display.layers)if(layer.kind=="tilemap"){layer.kind.clear();layer.tilemapTilesetId.clear();}
 return compositeNormalRegion(timeline::Timeline(std::move(display)),frameId,region,previewLayer,preview,previewWidth,0,0,false,{},{},maskPreview);
}
}
std::vector<Pixel> compositeOnionRegion(const timeline::Timeline& timeline,const std::string& frameId,const std::string& layerId,CompositeRegion region,const OnionSkinSettings& settings,const std::string& previewLayer,const std::vector<Pixel>* preview,int previewWidth,const timeline::AttachedMask* maskPreview){
 if(!settings.enabled || timeline.state().frames.size()<2)return compositeNormalRegion(timeline,frameId,region,previewLayer,preview,previewWidth,0,0,false,{},{},maskPreview);
 if(std::any_of(timeline.state().layers.begin(),timeline.state().layers.end(),[](const auto& l){return l.clippingMask||l.kind=="adjustment"||layerStyleNeedsSampling(l.layerStyles);})||std::any_of(timeline.state().groups.begin(),timeline.state().groups.end(),[](const auto& g){return g.clippingMask||layerStyleNeedsSampling(g.layerStyles);}))return compositeClippingOnionRegion(timeline,frameId,layerId,region,settings,previewLayer,preview,previewWidth,maskPreview);
 const auto* linkedPreviewSlot=previewLayer.empty()?nullptr:timeline.findCel(previewLayer,frameId);
 const auto linkedPreviewRoot=linkedPreviewSlot?timeline.resolveSurface(linkedPreviewSlot->id):timeline::Resolution{};

 const auto& frames=timeline.state().frames;const auto active=std::find_if(frames.begin(),frames.end(),[&](const auto& f){return f.id==frameId;});if(active==frames.end())throw std::invalid_argument("Unknown onion frame");const int index=int(active-frames.begin());
 const auto* section=timeline::loopAtFrame(timeline.state(),frameId);const auto range=section?timeline::loopRange(timeline.state(),*section):timeline::LoopRange{0,int(frames.size())-1};const int length=range.end-range.start+1;auto neighbor=[&](int offset){const int target=index+offset;return section?range.start+(target-range.start+length)%length:target;};
 auto renderLayer=[&](std::size_t index,CompositeRegion region,std::vector<Pixel>& out){const auto& layer=timeline.state().layers[index];const auto mode=*parseLayerBlendMode(layer.blendMode);if(!layer.visible)return;
  auto blend=[&](const std::string& id,bool ghost,Pixel tint,double opacity,int distance){const auto* slot=timeline.findCel(layer.id,id);if(!slot)return;const auto resolved=timeline.resolveSurface(slot->id);if(resolved.issue!=timeline::LinkIssue::None)throw std::invalid_argument("Invalid onion link");if(!resolved.surface)return;const auto& s=*resolved.surface;const double celOpacity=frameCelOpacity(timeline,layer,id);
   const bool linkedPreview=linkedPreviewRoot.surface&&s.pixels.identity()==linkedPreviewRoot.surface->pixels.identity();const auto dx=linkedPreview?std::int64_t(s.offsetX)-linkedPreviewRoot.surface->offsetX:0,dy=linkedPreview?std::int64_t(s.offsetY)-linkedPreviewRoot.surface->offsetY:0;
   for(int y=0;y<region.height;++y)for(int x=0;x<region.width;++x){const auto sx=std::int64_t(region.x)+x-s.offsetX,sy=std::int64_t(region.y)+y-s.offsetY;if(sx<0||sy<0||sx>=s.width||sy>=s.height)continue;Pixel source=s.pixels[std::size_t(sy)*s.width+std::size_t(sx)];if(preview&&!ghost&&id==frameId&&(layer.id==previewLayer||linkedPreview)){const auto px=std::int64_t(region.x)+x-dx,py=std::int64_t(region.y)+y-dy;source=px>=0&&py>=0&&px<previewWidth&&std::uint64_t(py)*previewWidth+px<preview->size()?(*preview)[std::size_t(py)*previewWidth+std::size_t(px)]:0;}const auto* mask=timeline::resolvedMask(timeline.state(),layer.id,id);if(maskPreview&&mask&&maskPreview->id==mask->id)mask=maskPreview;if(mask&&mask->visible){const auto n=timeline::maskCoverage(raster::readWorld(mask->surface,region.x+x,region.y+y));source=(source&0xffffff)|(Pixel(std::floor((source>>24)*n/255.+.5))<<24);}source=timeline::applyColorOverlay(source,layer.layerStyles);source=timeline::applyGradientOverlay(source,layer.layerStyles,region.x+x,region.y+y,s.offsetX,s.offsetY,s.width,s.height);const auto offset=std::size_t(y)*region.width+x;if(ghost){const auto isolated=over(0,source,celOpacity);out[offset]=over(out[offset],tintOnionPixel(isolated,tint,opacity,distance),1);}else out[offset]=mode==LayerBlendMode::Normal?over(out[offset],source,celOpacity):blendLayerPixel(out[offset],source,celOpacity,mode);}
  };
  if(settings.allLayers || layer.id==layerId){for(int distance=std::min(int(std::floor(std::clamp(settings.previousFrames,0.,8.)+.5)),section?length-1:8);distance>=1;--distance){const int n=neighbor(-distance);if(n>=0)blend(frames[n].id,true,settings.previousColor,settings.previousOpacity,distance);}for(int distance=1;distance<=std::min(int(std::floor(std::clamp(settings.nextFrames,0.,8.)+.5)),section?length-1:8);++distance){const int n=neighbor(distance);if(n<int(frames.size()))blend(frames[n].id,true,settings.nextColor,settings.nextOpacity,distance);}}
  blend(frameId,false,0,0,0);
 };
 if(!timeline.state().groups.empty())return compositeGroupedRegion(timeline,frameId,region,renderLayer,maskPreview);
 std::vector<Pixel> out(std::size_t(region.width)*region.height,0);for(const auto index:frameCompositeLayerOrder(timeline,frameId))renderLayer(index,region,out);
 return out;
}

}
