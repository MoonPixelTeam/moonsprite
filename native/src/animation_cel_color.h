#pragma once
#include "raster_color_context.h"
#include "relative_luminance.h"

namespace moon {
// workspace-animation-cel-conversion.ts::animationCelClipboardSnapshot freezes
// the source palette at copy time (Map semantics: the last duplicate wins).
inline timeline::Cel animationClipboardCel(timeline::Cel cel,const RasterColorContext& colors){
 if(cel.surface&&cel.surface->format==timeline::RasterFormat::Indexed){
  for(auto& value:cel.surface->pixels)value=colors.rgba(cel.surface->format,value);
  cel.surface->format=timeline::RasterFormat::Rgba;
 }
 return cel;
}
inline timeline::RasterFormat animationTargetFormat(color_mode::Mode mode,const std::string& kind){
 return mode==color_mode::Mode::Indexed&&kind!="tilemap"&&kind!="free-tile"?timeline::RasterFormat::Indexed:timeline::RasterFormat::Rgba;
}
// workspace-animation-cel-target.ts. Link rebasing belongs to the surrounding
// clipboard transaction; RGBA precision is deliberately not requantized here.
inline void animationCelForTarget(timeline::Cel& cel,const std::string& kind,color_mode::Mode mode,const RasterColorContext& colors){
 if(cel.surface&&cel.surface->format==timeline::RasterFormat::Rgba){
  if(animationTargetFormat(mode,kind)==timeline::RasterFormat::Indexed){
   for(auto& value:cel.surface->pixels)value=colors.colorId(value);
   cel.surface->format=timeline::RasterFormat::Indexed;
  }else if(mode==color_mode::Mode::Grayscale)for(auto& value:cel.surface->pixels)value=relativeLuminancePixel(value);
 }
 if(kind!="text")cel.text.reset();if(kind!="tilemap")cel.tilemap.reset();if(kind!="free-tile")cel.freeTiles.reset();
}
}
