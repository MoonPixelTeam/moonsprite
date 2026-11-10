#pragma once
#include "layer_compositor.h"
#include <unordered_set>

namespace moon {
// legacy palette.ts extractPaletteColors: exact nontransparent RGBA in scanline
// order. Native regional compositing avoids the full-canvas temporary bitmap.
// Reader injection keeps the allocation/early-stop contract directly testable.
template<class Read> std::vector<timeline::Pixel> extractCompositePalette(int width,int height,std::size_t limit,Read&& read,std::size_t chunkPixels=65536){
 if(width<1||height<1||!chunkPixels)throw std::invalid_argument("Invalid palette extraction dimensions");
 limit=std::clamp<std::size_t>(limit,1,4096);chunkPixels=std::min<std::size_t>(chunkPixels,std::numeric_limits<int>::max());
 std::unordered_set<timeline::Pixel> seen;seen.reserve(limit);std::vector<timeline::Pixel> colors;colors.reserve(limit);
 for(int y=0;y<height;){const int rows=width<=chunkPixels?std::min(height-y,int(chunkPixels/std::size_t(width))):1;
  for(int x=0;x<width;){const int columns=std::min<std::size_t>(width-x,chunkPixels);auto pixels=read(CompositeRegion{x,y,columns,rows});
   if(pixels.size()!=std::size_t(columns)*rows)throw std::logic_error("Invalid palette composite region");
   for(auto color:pixels)if((color>>24)&&seen.insert(color).second){colors.push_back(color);if(colors.size()==limit)return colors;}
   x+=columns;
  }y+=rows;
 }return colors;
}
inline std::vector<timeline::Pixel> extractTimelinePalette(const timeline::Timeline& timeline,const std::string& frame,int width,int height,std::size_t limit,const std::string& previewLayer={},const std::vector<timeline::Pixel>* preview=nullptr,int previewWidth=0,int previewX=0,int previewY=0,const std::string& previewOwner={}){
 return extractCompositePalette(width,height,limit,[&](CompositeRegion r){return compositeNormalRegion(timeline,frame,r,previewLayer,preview,previewWidth,previewX,previewY,false,{},previewOwner);});
}
}
