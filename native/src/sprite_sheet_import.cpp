#include "sprite_sheet_import.h"
#include "layer_compositor.h"
#include "image_import_limits.h"
#include <limits>
namespace moon {
SheetImportOptions initialSheetImportOptions(GridSettings grid,const std::optional<SheetImportOptions>& remembered,const std::optional<SelectionMask>& selection){
 // Grid metadata uses doubles. Retain representable out-of-plan-range drafts;
 // unrepresentable native integers stay invalid rather than wrapping to valid.
 auto integer=[](double v){return int(std::clamp(v,double(INT32_MIN),double(INT32_MAX)));};
 grid=normalizeGridSettings(grid);SheetImportOptions options;
 if(selection){options.selection=true;options.width=integer(std::min(double(selection->width),grid.width));options.height=integer(std::min(double(selection->height),grid.height));}
 else if(remembered){options=*remembered;options.selection=false;}
 else{options.x=integer(grid.x);options.y=integer(grid.y);options.width=integer(grid.width);options.height=integer(grid.height);}
 return options;
}
int sheetImportFrameSizeFromCount(int extent,int origin,int padding,int count){
 const auto divisor=std::max(1,count);
 const auto value=std::floor(double(std::int64_t(extent)-origin-std::int64_t(padding)*(divisor-1))/divisor);
 return int(std::clamp(value,1.,double(INT32_MAX)));
}
SheetImportPlan planSpriteSheetImport(int sw,int sh,const SheetImportOptions& o){
 if(sw<1||sh<1||o.layout<0||o.layout>3||o.width<1||o.height<1||o.width>262144||o.height>262144||std::abs(std::int64_t(o.x))>262144||std::abs(std::int64_t(o.y))>262144||o.paddingX<0||o.paddingY<0||o.paddingX>262144||o.paddingY>262144)throw std::invalid_argument("Invalid native sprite sheet import parameters");
 // Legacy plan is geometric: output allocation admission belongs to build.
 auto spans=[&](std::int64_t available,int tile,int gap){return std::max(std::int64_t(0),std::int64_t(std::floor(double(available+gap+(o.partialTiles?tile-1:0))/(tile+gap))));};
 const auto columns=o.layout==1?1:spans(std::int64_t(sw)-o.x,o.width,o.paddingX),rows=o.layout==0?1:spans(std::int64_t(sh)-o.y,o.height,o.paddingY);
 const auto n=columns*rows;if(n>10000)throw std::runtime_error("Sprite sheet exceeds 10000 frames");
 if(columns>INT32_MAX||rows>INT32_MAX)throw std::length_error("Sprite sheet plan exceeds native coordinate range");
 SheetImportPlan p;p.columns=int(columns);p.rows=int(rows);p.tiles.reserve(std::size_t(n));
 for(int i=0;i<n;++i){const auto col=o.layout==3?i/rows:i%columns,row=o.layout==3?i%rows:i/columns;const auto x=o.x+col*(o.width+o.paddingX),y=o.y+row*(o.height+o.paddingY);if(x<INT32_MIN||x>INT32_MAX||y<INT32_MIN||y>INT32_MAX)throw std::length_error("Sprite sheet tile exceeds native coordinate range");p.tiles.push_back({int(x),int(y)});}return p;
}
timeline::State buildSpriteSheetImport(const Document& d,const SheetImportOptions& o){
 if(d.active())throw std::runtime_error("Commit or cancel active operation before importing");if(o.selection&&!d.selection())throw std::runtime_error("Pixel selection missing");const auto selection=o.selection?d.selection():std::optional<SelectionMask>{};const int sw=selection?selection->width:d.width(),sh=selection?selection->height:d.height();auto plan=planSpriteSheetImport(sw,sh,o);if(plan.tiles.empty())throw std::runtime_error("No complete sprite sheet tiles");validateImportedImageDimensions(o.width,o.height);const auto area=std::uint64_t(o.width)*o.height;if(plan.tiles.size()>importedImageMaxPixels/area)throw std::length_error("Sprite sheet import exceeds native pixel budget");
 timeline::State out;out.layers.push_back({"sheet-layer-"+std::to_string(d.revision()+1),U"导入的精灵表"});const auto layer=out.layers.front().id;const auto& frames=d.timeline().state().frames;
 for(std::size_t i=0;i<plan.tiles.size();++i){const auto tile=plan.tiles[i];auto id="sheet-frame-"+std::to_string(d.revision()+1)+"-"+std::to_string(i);out.frames.push_back({id,frames[std::min(i,frames.size()-1)].duration});timeline::Surface s;s.width=o.width;s.height=o.height;s.pixels.resize(std::size_t(o.width)*o.height,0);const int left=std::max(0,tile.x),top=std::max(0,tile.y),right=std::min(sw,tile.x+o.width),bottom=std::min(sh,tile.y+o.height);
  if(right>left&&bottom>top){const int originX=selection?selection->x:0,originY=selection?selection->y:0;auto pixels=compositeNormalRegion(d.timeline(),d.frame().id,{left+originX,top+originY,right-left,bottom-top});for(int y=0;y<bottom-top;++y)for(int x=0;x<right-left;++x){const auto color=selection&&!selectionContains(selection,left+originX+x,top+originY+y)?0:pixels[std::size_t(y)*(right-left)+x];// Legacy compositeRegionAsync samples source-over, clearing hidden RGB.
   s.pixels[std::size_t(top-tile.y+y)*o.width+left-tile.x+x]=(color>>24)?color:0;}}
  out.cels.push_back({"sheet-cel-"+std::to_string(d.revision()+1)+"-"+std::to_string(i),layer,id,{},{},{},0,std::move(s)});
 }return out;
}
}
