#pragma once
#include "raster_color_context.h"
#include "brush.h"
#include <algorithm>
#include <cmath>
#include <optional>
#include <stdexcept>

namespace moon::raster {
using Pixel=timeline::Pixel;
using Format=timeline::RasterFormat;

// legacy raster.ts::blendOver at full opacity. Keep the operation order and
// single byte rounding used by tools-pixel-edit's selection source-over path.
inline Pixel selectionRgbaOver(Pixel destination,Pixel value){
 const auto alpha=value>>24;
 if(!alpha)return destination;
 if(alpha==255||!(destination>>24))return value;
 const double top=alpha/255.,bottom=(destination>>24)/255.,out=top+bottom*(1-top);
 Pixel result=Pixel(std::floor(out*255+.5))<<24;
 for(unsigned shift:{0u,8u,16u})result|=Pixel(std::floor((((value>>shift)&255)*top+((destination>>shift)&255)*bottom*(1-top))/out+.5))<<shift;
 return result;
}

// legacy document-model readLayerPacked/readLayerColor. World lookup remains
// optional so an out-of-surface read cannot become an opaque palette ID zero.
inline Pixel readPacked(const timeline::Surface& surface,std::size_t index){return surface.pixels.at(index);}
inline Pixel readColor(const timeline::Surface& surface,std::size_t index,const RasterColorContext& colors){return colors.toolColor(surface.format,readPacked(surface,index));}
inline std::optional<Pixel> readPackedAt(const timeline::Surface& surface,std::int64_t x,std::int64_t y){const auto index=worldIndex(surface,x,y);return index?std::optional<Pixel>{readPacked(surface,*index)}:std::nullopt;}

// Detached candidates or an already acquired owner borrow only. Live Document
// writes still own the history, dirty state and Timeline cache invalidation.
inline void writeColor(timeline::Surface& surface,std::size_t index,Pixel color,const RasterColorContext& colors,bool mask=false){surface.pixels.at(index)=colors.colorValue(surface.format,color,mask);}
inline void writePacked(timeline::Surface& surface,std::size_t index,Pixel value,const RasterColorContext& colors,bool mask=false){surface.pixels.at(index)=colors.packedValue(surface.format,value,mask);}
inline std::size_t writePackedRun(timeline::Surface& surface,std::size_t start,std::size_t length,Pixel value,const RasterColorContext& colors,bool mask=false){
 if(!length)return 0;
 if(surface.width<1||start>=surface.pixels.size())throw std::out_of_range("Pixel run outside surface");
 const auto count=std::min(length,std::size_t(surface.width)-start%std::size_t(surface.width));
 if(count>surface.pixels.size()-start)throw std::out_of_range("Pixel run exceeds surface storage");
 value=colors.packedValue(surface.format,value,mask);
 std::fill_n(surface.pixels.begin()+start,count,value);return count;
}

// legacy tools-pixel-edit::paintLayerValue. The caller resolves
// brushOriginalValue (including split-tail and inherited baselines); current
// destination is a separate input and wins only when explicitly requested.
inline Pixel paintValue(Format format,Pixel current,std::optional<Pixel> original,Pixel color,const RasterColorContext& colors,bool compositeTransparent=false,bool useCurrentDestination=false){
 const auto alpha=color>>24;
 if(!alpha){
  if(!compositeTransparent)return format==Format::Rgba?color:0;
  return useCurrentDestination?current:original.value_or(current);
 }
 if(alpha==255&&!useCurrentDestination)return format==Format::Rgba?color:colors.colorId(color);
 const auto base=colors.toolColor(format,useCurrentDestination?current:original.value_or(current));
 const auto blended=selectionRgbaOver(base,color);
 return format==Format::Rgba?blended:colors.colorId(blended);
}

// tools-brush::paintBrush resolves RGBA ink against palette colors, then
// recordPixel normalizes the resulting ID. null is a genuine ink no-op.
inline std::optional<Pixel> indexedBrushValue(Pixel current,Pixel before,Pixel source,int coverage,int opacity,InkMode ink,const RasterColorContext& colors,bool erase=false,bool direct=false,bool compositeTransparent=false,bool useCurrentDestination=false,int eraseAlpha=255){
 const int amount=ink==InkMode::CopyAlphaColor?coverage:int(std::floor(coverage*std::clamp(opacity,0,100)/100.0+.5));
 if(!amount)return {};
 const auto store=[&](Pixel color){return colors.packedValue(Format::Indexed,color>>24?colors.colorId(color):0);};
 const auto stamped=resolveInkStampColor(ink,source,coverage,opacity);
 if(ink!=InkMode::Simple){
  const auto destination=colors.toolColor(Format::Indexed,ink==InkMode::LockAlpha?before:current);
  if(ink==InkMode::LockAlpha&&(!(destination>>24)||!(stamped>>24)))return {};
  return store(applyInkColor(ink,destination,stamped));
 }
 if(erase){
  const int erased=int(std::floor(amount*eraseAlpha/255.0+.5));if(!erased)return {};
  if(erased==255)return Pixel(0);
  const auto base=colors.toolColor(Format::Indexed,before);
  return store((base&0xffffff)|(Pixel(std::floor((base>>24)*(1-erased/255.0)+.5))<<24));
 }
 if(direct)return store(stamped);
 return colors.packedValue(Format::Indexed,paintValue(Format::Indexed,current,before,stamped,colors,compositeTransparent,useCurrentDestination));
}

// legacy tools-pixel-edit::compositeSelectionPixelOver/ForEdit. Masks copy the
// scalar word directly; indexed source-over resolves IDs before blending.
inline Pixel selectionOver(Format format,Pixel destination,Pixel value,const RasterColorContext& colors,bool mask=false){
 if(mask)return value;
 if(format==Format::Rgba)return selectionRgbaOver(destination,value);
 const auto top=colors.toolColor(format,value);
 if(!(top>>24))return destination;
 return colors.colorId(selectionRgbaOver(colors.toolColor(format,destination),top));
}
inline Pixel selectionForEdit(Format format,Pixel current,std::optional<Pixel> before,Pixel value,const RasterColorContext& colors,bool mask=false){return selectionOver(format,before.value_or(current),value,colors,mask);}
}
