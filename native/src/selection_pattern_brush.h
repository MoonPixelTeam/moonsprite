#pragma once
#include "pattern_fill.h"
#include "selection_model.h"
#include "raster_geometry.h"
namespace moon {
// Actual legacy brushes.ts createSelectionBrush: active layer only, selected
// transparent cells retained, outside-mask cells zero, origin is clamped mask box.
template<class Sample>inline std::optional<PatternBrush> createSelectionPatternBrushSampled(Sample sample,int canvasWidth,int canvasHeight,const SelectionMask& selection){
 if(canvasWidth<1||canvasHeight<1)throw std::invalid_argument("Invalid source raster");
 const int x=std::clamp(selection.x,0,canvasWidth),y=std::clamp(selection.y,0,canvasHeight);
 const int right=int(std::clamp<std::int64_t>(std::int64_t(selection.x)+selection.width,x,canvasWidth)),bottom=int(std::clamp<std::int64_t>(std::int64_t(selection.y)+selection.height,y,canvasHeight));
 const int width=right-x,height=bottom-y;if(width<1||height<1)return {};
 if(width>64||height>64)throw std::invalid_argument("Image brushes must be 1..64 pixels");
 if(!selection.mask.empty()&&selection.mask.size()!=std::size_t(selection.width)*selection.height)throw std::invalid_argument("Invalid selection mask");
 PatternBrush brush;brush.width=width;brush.height=height;brush.sourceX=x;brush.sourceY=y;brush.coverage.resize(std::size_t(width)*height);brush.colors.resize(brush.coverage.size());bool any=false;
 for(int row=0;row<height;++row)for(int column=0;column<width;++column){if(!selectionContains(selection,x+column,y+row))continue;auto color=sample(x+column,y+row);auto i=std::size_t(row)*width+column;brush.colors[i]=color;brush.coverage[i]=color>>24;any|=brush.coverage[i]>0;}
 return any?std::optional<PatternBrush>{std::move(brush)}:std::optional<PatternBrush>{};
}
inline std::optional<PatternBrush> createSelectionPatternBrush(const std::vector<std::uint32_t>& pixels,int canvasWidth,int canvasHeight,const SelectionMask& selection){
 if(canvasWidth<1||canvasHeight<1||pixels.size()!=std::size_t(canvasWidth)*canvasHeight)throw std::invalid_argument("Invalid source raster");
 return createSelectionPatternBrushSampled([&](int x,int y){return pixels[std::size_t(y)*canvasWidth+x];},canvasWidth,canvasHeight,selection);
}
inline std::optional<PatternBrush> createSelectionPatternBrush(const timeline::Surface& surface,int canvasWidth,int canvasHeight,const SelectionMask& selection){
 raster::validate(surface);const bool dense=raster::fullCanvas(surface,canvasWidth,canvasHeight);
 return createSelectionPatternBrushSampled([&](int x,int y){return dense?surface.pixels[std::size_t(y)*canvasWidth+x]:raster::readWorld(surface,x,y);},canvasWidth,canvasHeight,selection);
}
}
