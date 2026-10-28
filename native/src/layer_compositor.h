#pragma once
#include "timeline_model.h"
namespace moon {
struct CompositeRegion {int x=0,y=0,width=0,height=0;};
// Legacy layerStyleOutputBounds unions source, outer stroke and translated
// shadow blur. This is output geometry; source readers still see raw content.
inline CompositeRegion layerStyleOutputBounds(CompositeRegion b,const std::optional<timeline::ColorOverlayStyle>& style){if(b.width<=0||b.height<=0||!style||!style->enabled)return b;std::int64_t left=b.x,top=b.y,right=left+b.width,bottom=top+b.height;auto merge=[&](std::int64_t x,std::int64_t y,std::int64_t w,std::int64_t h){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+w);bottom=std::max(bottom,y+h);};if(style->stroke.enabled&&style->stroke.position!=0){const int n=style->stroke.size;merge(std::int64_t(b.x)-n,std::int64_t(b.y)-n,std::int64_t(b.width)+2*n,std::int64_t(b.height)+2*n);}if(style->shadow.enabled){const auto& sh=style->shadow;merge(std::int64_t(b.x)+sh.offsetX-sh.blur,std::int64_t(b.y)+sh.offsetY-sh.blur,std::int64_t(b.width)+2*sh.blur,std::int64_t(b.height)+2*sh.blur);}if(left<std::numeric_limits<int>::min()||top<std::numeric_limits<int>::min()||right>std::numeric_limits<int>::max()||bottom>std::numeric_limits<int>::max()||right-left>std::numeric_limits<int>::max()||bottom-top>std::numeric_limits<int>::max())throw std::length_error("Layer style bounds overflow");return {int(left),int(top),int(right-left),int(bottom-top)};}
// legacy compileCompositePointSampler: group geometry is the union of visible
// child source content bounds, independent of request tiles and group mask.
inline CompositeRegion groupStyleGeometry(const timeline::Timeline& timeline,const std::string& frame,const std::string& id){
 const auto& s=timeline.state();std::optional<CompositeRegion> result;auto merge=[&](CompositeRegion b){if(b.width<=0||b.height<=0)return;if(!result){result=b;return;}const int x=std::min(result->x,b.x),y=std::min(result->y,b.y);result=CompositeRegion{x,y,std::max(result->x+result->width,b.x+b.width)-x,std::max(result->y+result->height,b.y+b.height)-y};};
 for(const auto& l:s.layers)if(l.groupId&&*l.groupId==id&&l.visible&&l.opacity>0){if(l.kind=="adjustment"){merge({0,0,s.canvasWidth,s.canvasHeight});continue;}const auto* cel=timeline.findCel(l.id,frame);if(!cel)continue;auto resolved=timeline.resolveSurface(cel->id);if(!resolved.surface)continue;const auto& source=*resolved.surface;int left=source.width,top=source.height,right=0,bottom=0;for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x)if(source.pixels[std::size_t(y)*source.width+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);}if(right>left)merge(layerStyleOutputBounds({source.offsetX+left,source.offsetY+top,right-left,bottom-top},l.layerStyles));}
 for(const auto& g:s.groups)if(g.parentGroupId&&*g.parentGroupId==id&&g.visible&&g.opacity>0)merge(layerStyleOutputBounds(groupStyleGeometry(timeline,frame,g.id),g.layerStyles));return result.value_or(CompositeRegion{});
}
// Adapter for legacy ordinary RGBA/normal layer stack, topmost first.
// Output is only the requested rectangle; caller retains unrelated cached pixels.
// Valid links resolve once per layer; stable storage origins do not affect world rendering.
// An optional preview owner replaces every linked instance of a staged owner.
std::vector<timeline::Pixel> compositeNormalRegion(const timeline::Timeline& timeline,
 const std::string& frameId,CompositeRegion region,const std::string& previewLayer={},const std::vector<timeline::Pixel>* preview=nullptr,int previewWidth=0,int previewX=0,int previewY=0,bool cacheContent=false,const std::string& targetLayerId={},const std::string& previewOwnerCelId={},const timeline::AttachedMask* maskPreview=nullptr);
struct OnionSkinSettings {
 bool enabled=false,allLayers=false,showDuringPlayback=true;
 double previousFrames=1,nextFrames=1,previousOpacity=35,nextOpacity=35;
 timeline::Pixel previousColor=0xff5053ef,nextColor=0xffff7929;
};
// Display only: legacy ghost layers are inserted immediately below their owning layer.
std::vector<timeline::Pixel> compositeOnionRegion(const timeline::Timeline& timeline,
 const std::string& frameId,const std::string& layerId,CompositeRegion region,const OnionSkinSettings& settings,const std::string& previewLayer={},const std::vector<timeline::Pixel>* preview=nullptr,int previewWidth=0,const timeline::AttachedMask* maskPreview=nullptr);
timeline::Pixel tintOnionPixel(timeline::Pixel source,timeline::Pixel tint,double opacity,int distance);
// Preserves the existing direct-pixel path for the editor's admitted single layer.
void compositeOpaqueRgbaRow(timeline::Pixel* output,const timeline::Pixel* source,std::size_t count);
}
