#pragma once
#include "layer_compositor.h"
#include <optional>
#include <stdexcept>

namespace moon {
enum class EyedropperSource {Composite,CurrentLayer};
// eyedropper-source.ts: document bounds precede either sampling source;
// current layer is raw, including hidden/locked layers and unmodified alpha.
inline timeline::Pixel sampleEyedropper(const timeline::Timeline& timeline,
 const std::string& frame,const std::string& layer,int width,int height,int x,int y,
 EyedropperSource source=EyedropperSource::Composite) {
 if(x<0 || y<0 || x>=width || y>=height)return 0;
 if(source==EyedropperSource::Composite)return compositeNormalRegion(timeline,frame,{x,y,1,1}).at(0);
 const auto* cel=timeline.findCel(layer,frame);
 if(!cel)return 0;
 const auto resolved=timeline.resolveSurface(cel->id);
 if(resolved.issue!=timeline::LinkIssue::None)throw std::runtime_error("Eyedropper cannot resolve active cel");
 if(!resolved.surface)return 0;
 const auto& surface=*resolved.surface;
 if(surface.storageOriginX || surface.storageOriginY)throw std::runtime_error("Eyedropper sparse storage is not migrated");
 x-=surface.offsetX;y-=surface.offsetY;
 if(x<0 || y<0 || x>=surface.width || y>=surface.height)return 0;
 return surface.pixels.at(std::size_t(y)*surface.width+x);
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
