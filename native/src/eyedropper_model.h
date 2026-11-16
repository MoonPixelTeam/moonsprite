#pragma once
#include "layer_compositor.h"
#include "raster_geometry.h"
#include "document.h"
#include <optional>
#include <stdexcept>

namespace moon {
enum class EyedropperSource {Composite,CurrentLayer};
// eyedropper-source.ts: document bounds precede either sampling source;
// current layer is raw, including hidden/locked layers and unmodified alpha.
inline timeline::Pixel sampleEyedropper(const timeline::Timeline& timeline,
 const std::string& frame,const std::string& layer,int width,int height,int x,int y,
 EyedropperSource source=EyedropperSource::Composite,const RasterColorContext* colors=nullptr) {
 if(x<0 || y<0 || x>=width || y>=height)return 0;
 if(source==EyedropperSource::Composite){
  // useCanvasRenderEngine: cursor samples omit backgrounds unless the active
  // layer is itself a background. The lens uses the unfiltered region below.
  const auto& layers=timeline.state().layers;
  const auto active=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==layer;});
  const RasterColorContext fallback;auto sampling=compileCompositeSamplingBounds(timeline,frame,colors?*colors:fallback,active==layers.end()||!active->background);sampling.clipStylesToCanvas=true;
  return compositeNormalRegion(timeline,frame,{x,y,1,1},{},nullptr,0,0,0,false,{},{},nullptr,nullptr,colors,&sampling).at(0);
 }
 const auto* cel=timeline.findCel(layer,frame);
 if(!cel)return 0;
 const auto resolved=timeline.resolveSurface(cel->id);
 if(resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Eyedropper cannot resolve active cel");
 if(!resolved.surface)return 0;
 const auto& surface=*resolved.surface;
 raster::validate(surface);
 const auto index=raster::worldIndex(surface,x,y);if(!index)return 0;
 if(surface.format==timeline::RasterFormat::Indexed&&!colors)throw std::invalid_argument("Indexed eyedropper requires palette context");
 return colors?colors->toolColor(surface.format,surface.pixels[*index]):surface.pixels[*index];
}
// Legacy lens current-layer reads share the point sampler's raw color rules;
// compositeRegion deliberately retains its region-composition fast paths.
inline std::vector<timeline::Pixel> renderEyedropperRegion(const timeline::Timeline& timeline,
 const std::string& frame,const std::string& layer,int width,int height,CompositeRegion region,
 EyedropperSource source=EyedropperSource::Composite,const RasterColorContext* colors=nullptr){
 if(region.width<0||region.height<0||std::uint64_t(region.width)*region.height>64*1024*1024)throw std::length_error("Eyedropper region exceeds pixel budget");
 if(source==EyedropperSource::Composite){
  const auto& state=timeline.state();
  const bool styled=std::any_of(state.layers.begin(),state.layers.end(),[](const auto& l){return timeline::styleVisible(l.layerStyles);})||std::any_of(state.groups.begin(),state.groups.end(),[](const auto& g){return timeline::styleVisible(g.layerStyles);});
  const RasterColorContext fallback;
  std::optional<CompositeSamplingBounds> sampling;if(styled){sampling=compileCompositeSamplingBounds(timeline,frame,colors?*colors:fallback);sampling->clipStylesToCanvas=true;}
  auto out=compositeNormalRegion(timeline,frame,region,{},nullptr,0,0,0,false,{},{},nullptr,nullptr,colors,sampling?&*sampling:nullptr);
  return out;
 }
 std::vector<timeline::Pixel> out(std::size_t(region.width)*region.height);
 for(int y=0;y<region.height;++y)for(int x=0;x<region.width;++x)out[std::size_t(y)*region.width+x]=sampleEyedropper(timeline,frame,layer,width,height,raster::coordinate(std::int64_t(region.x)+x),raster::coordinate(std::int64_t(region.y)+y),source,colors);
 return out;
}
inline timeline::Pixel sampleEyedropper(const Document& document,int x,int y,EyedropperSource source=EyedropperSource::Composite){
 if(x<0||y<0||x>=document.width()||y>=document.height())return 0;
 if(!document.activeMaskId().empty())return document.maskDisplayRegion({x,y,1,1}).at(0);
 const auto& palette=document.displayPalette();const RasterColorContext colors(palette.entries,palette.order(),document.colorMode(),document.pixelFormat());
 return sampleEyedropper(document.displayTimeline(),document.frame().id,document.layer().id,document.width(),document.height(),x,y,source,&colors);
}
inline std::vector<timeline::Pixel> renderEyedropperRegion(const Document& document,CompositeRegion region,EyedropperSource source=EyedropperSource::Composite){
 if(region.width<0||region.height<0||std::uint64_t(region.width)*region.height>64*1024*1024)throw std::length_error("Eyedropper region exceeds pixel budget");
 if(!document.activeMaskId().empty())return document.maskDisplayRegion({region.x,region.y,region.width,region.height});
 const auto& palette=document.displayPalette();const RasterColorContext colors(palette.entries,palette.order(),document.colorMode(),document.pixelFormat());
 return renderEyedropperRegion(document.displayTimeline(),document.frame().id,document.layer().id,document.width(),document.height(),region,source,&colors);
}
// Fixed target for a pointer gesture, mirroring sampleSecondary on sample-color.
// Alt is an overlay, so release restores the selected tool without rewriting it.
class EyedropperGesture {
 bool active_=false,secondary_=false,temporary_=false;
 std::optional<timeline::Pixel> sampled_;
public:
 bool active()const{return active_;}
 bool secondary()const{return secondary_;}
 bool temporary()const{return temporary_;}
 void begin(bool right,bool temporary,bool deviceTemporary=false){active_=true;secondary_=right && !deviceTemporary;temporary_=temporary;sampled_.reset();}
 void sample(timeline::Pixel color){if(active_)sampled_=color;}
 std::optional<timeline::Pixel> finish(bool paletteSamplingHeld=false){
  auto add=active_ && !secondary_ && paletteSamplingHeld?sampled_:std::nullopt;
  active_=false;sampled_.reset();return add;
 }
};
}
