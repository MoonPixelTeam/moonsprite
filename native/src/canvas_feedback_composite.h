#pragma once
#include "document.h"
#include "layer_compositor.h"
namespace moon {
// Legacy selection feedback samples the displayed document, including floats.
inline std::vector<Pixel> selectionFeedbackComposite(const Document& doc,PixelRegion region){
 const RasterColorContext colors(doc.palette().entries,doc.palette().order(),doc.colorMode(),doc.pixelFormat());
 const auto overlay=doc.floatingDeferred()?doc.floatingOverlayRegion(region):std::vector<Pixel>{};
 return compositeNormalRegion(doc.displayTimeline(),doc.frame().id,{region.x,region.y,region.w,region.h},doc.layer().id,doc.floatingDeferred()?&overlay:nullptr,region.w,region.x,region.y,false,{},{},nullptr,nullptr,&colors);
}
// brushPreview returns layer storage words; compositor replacements are RGBA.
inline std::vector<Pixel> brushFeedbackComposite(const Document& doc,PixelRegion region,const std::unordered_map<std::size_t,Pixel>& replacements){
 const RasterColorContext colors(doc.palette().entries,doc.palette().order(),doc.colorMode(),doc.pixelFormat());
 const auto* mask=doc.activeMask();const auto* source=mask?&mask->surface:doc.activeSurfaceIfPresent();if(source)raster::validate(*source);
 std::vector<Pixel> pixels(std::size_t(region.w)*region.h);
 const bool dense=source&&raster::fullCanvas(*source,doc.width(),doc.height());
 if(source)for(int y=0;y<region.h;++y){auto row=pixels.begin()+std::size_t(y)*region.w;
  if(dense&&(mask||source->format==timeline::RasterFormat::Rgba))std::copy_n(source->pixels.begin()+std::size_t(region.y+y)*doc.width()+region.x,region.w,row);
  else for(int x=0;x<region.w;++x){const auto index=raster::worldIndex(*source,region.x+x,region.y+y);if(index)row[x]=mask?source->pixels[*index]:colors.toolColor(source->format,source->pixels[*index]);}
 }
 const auto format=source?source->format:doc.colorMode()==color_mode::Mode::Indexed?timeline::RasterFormat::Indexed:timeline::RasterFormat::Rgba;
 for(auto [i,value]:replacements)pixels[(i/doc.width()-region.y)*region.w+i%doc.width()-region.x]=mask?value:colors.toolColor(format,value);
 if(mask){
  if(doc.maskIsolated()){for(auto& p:pixels){const auto gray=timeline::maskCoverage(p);p=0xff000000u|gray|(gray<<8)|(gray<<16);}return pixels;}
  timeline::Surface patch;patch.width=region.w;patch.height=region.h;patch.offsetX=region.x;patch.offsetY=region.y;patch.pixels=std::move(pixels);
  return compositeNormalRegion(doc.displayTimeline(),doc.frame().id,{region.x,region.y,region.w,region.h},{},nullptr,0,0,0,false,{},{},mask,&patch,&colors);
 }
 return compositeNormalRegion(doc.displayTimeline(),doc.frame().id,{region.x,region.y,region.w,region.h},doc.layer().id,&pixels,region.w,region.x,region.y,false,{},{},nullptr,nullptr,&colors);
}
}
