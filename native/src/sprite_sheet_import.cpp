#include "sprite_sheet_import.h"
#include "layer_compositor.h"
namespace moon {
SheetImportPlan planSpriteSheetImport(int sw,int sh,const SheetImportOptions& o){
 if(sw<1||sh<1||o.layout<0||o.layout>3||o.width<1||o.height<1||o.width>1024||o.height>1024||std::abs(std::int64_t(o.x))>262144||std::abs(std::int64_t(o.y))>262144||o.paddingX<0||o.paddingY<0||o.paddingX>262144||o.paddingY>262144)throw std::invalid_argument("Invalid native sprite sheet import parameters");
 auto spans=[&](int available,int tile,int gap){return std::max(0,int(std::floor(double(std::int64_t(available)+gap+(o.partialTiles?tile-1:0))/(tile+gap))));};SheetImportPlan p;p.columns=o.layout==1?1:spans(sw-o.x,o.width,o.paddingX);p.rows=o.layout==0?1:spans(sh-o.y,o.height,o.paddingY);const auto n=std::int64_t(p.columns)*p.rows;if(n>10000)throw std::runtime_error("Sprite sheet exceeds 10000 frames");if(n*o.width*o.height>64*1024*1024)throw std::runtime_error("Sprite sheet import exceeds native pixel budget");
 for(int i=0;i<n;++i){const int col=o.layout==3?i/p.rows:i%p.columns,row=o.layout==3?i%p.rows:i/p.columns;p.tiles.push_back({o.x+col*(o.width+o.paddingX),o.y+row*(o.height+o.paddingY)});}return p;
}
timeline::State buildSpriteSheetImport(const Document& d,const SheetImportOptions& o){
 if(d.active())throw std::runtime_error("Commit or cancel active operation before importing");if(o.selection&&!d.selection())throw std::runtime_error("Pixel selection missing");const auto selection=o.selection?d.selection():std::optional<SelectionMask>{};const int sw=selection?selection->width:d.width(),sh=selection?selection->height:d.height();auto plan=planSpriteSheetImport(sw,sh,o);if(plan.tiles.empty())throw std::runtime_error("No complete sprite sheet tiles");
 timeline::State out;out.layers.push_back({"sheet-layer-"+std::to_string(d.revision()+1),U"精灵表"});const auto layer=out.layers.front().id;const auto& frames=d.timeline().state().frames;
 for(std::size_t i=0;i<plan.tiles.size();++i){const auto tile=plan.tiles[i];auto id="sheet-frame-"+std::to_string(d.revision()+1)+"-"+std::to_string(i);out.frames.push_back({id,frames[std::min(i,frames.size()-1)].duration});timeline::Surface s;s.width=o.width;s.height=o.height;s.pixels.resize(std::size_t(o.width)*o.height,0);const int left=std::max(0,tile.x),top=std::max(0,tile.y),right=std::min(sw,tile.x+o.width),bottom=std::min(sh,tile.y+o.height);
  if(right>left&&bottom>top){const int originX=selection?selection->x:0,originY=selection?selection->y:0;auto pixels=compositeNormalRegion(d.timeline(),d.frame().id,{left+originX,top+originY,right-left,bottom-top});for(int y=0;y<bottom-top;++y)for(int x=0;x<right-left;++x){const auto color=selection&&!selectionContains(selection,left+originX+x,top+originY+y)?0:pixels[std::size_t(y)*(right-left)+x];s.pixels[std::size_t(top-tile.y+y)*o.width+left-tile.x+x]=color;}}
  out.cels.push_back({"sheet-cel-"+std::to_string(d.revision()+1)+"-"+std::to_string(i),layer,id,{},{},{},0,std::move(s)});
 }return out;
}
}
