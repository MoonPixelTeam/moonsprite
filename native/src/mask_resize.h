#pragma once
#include "canvas_resize.h"
#include "image_resize.h"
namespace moon {
// Transform direct slots, not resolved aliases: each stored mask bitmap moves
// once, linkedMaskId remains intact, and later detach retains the legacy bitmap.
inline std::vector<timeline::MaskSlot> resizedCanvasMasks(const timeline::State& state,int width,int height,int dx,int dy,bool trim,std::size_t& remaining){
 for(const auto& slot:state.masks){const auto& source=slot.mask.surface;const auto p=planCanvasResizeSurface(source,width,height,dx,dy,trim);const auto bytes=3ull*source.pixels.size()*sizeof(timeline::Pixel)+(p.clipped?2ull*p.bytes:0);if(bytes>remaining)throw std::length_error("Mask canvas resize exceeds working pixel budget");remaining-=std::size_t(bytes);}
 auto out=state.masks;for(auto& slot:out){auto& s=slot.mask.surface;const auto p=planCanvasResizeSurface(s,width,height,dx,dy,trim);if(p.clipped){auto bytes=p.bytes;s=canvasResizeCroppedSurface(s,p,bytes);}else{s.offsetX=p.offsetX;s.offsetY=p.offsetY;}}return out;
}
inline std::vector<timeline::MaskSlot> resizedImageMasks(const timeline::State& state,int sw,int sh,int width,int height,ImageInterpolation method,std::size_t& remaining){
 for(const auto& slot:state.masks){const auto& s=slot.mask.surface;const auto p=planImageResizeSurface(s,sw,sh,width,height);const auto bytes=3ull*s.pixels.size()*sizeof(timeline::Pixel)+2ull*p.bytes;if(bytes>remaining)throw std::length_error("Mask image resize exceeds working pixel budget");remaining-=std::size_t(bytes);}
 auto out=state.masks;for(std::size_t i=0;i<out.size();++i){const auto& source=state.masks[i].mask.surface;out[i].mask.surface=imageResizedSurface(source,planImageResizeSurface(source,sw,sh,width,height),method,true);}return out;
}
}
