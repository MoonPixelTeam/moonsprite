#include "sprite_sheet_import.h"
#include "layer_compositor.h"
#include "image_import_limits.h"
#include <limits>
#include <set>
#include "sheet_import_storage.h"
#include "raster_geometry.h"
namespace moon {
SheetImportOptions initialSheetImportOptions(GridSettings grid,const std::optional<SheetImportOptions>& remembered,const std::optional<SelectionMask>& selection){
 // Grid metadata uses doubles. Retain representable out-of-plan-range drafts;
 // unrepresentable native integers stay invalid rather than wrapping to valid.
 auto integer=[](double v){return int(std::clamp(v,double(INT32_MIN),double(INT32_MAX)));};
 grid=normalizeGridSettings(grid);SheetImportOptions options;
 if(selection){if(selection->mask.size()>importedImageMaxPixels)throw std::length_error("Sprite sheet selection snapshot exceeds mask budget");options.selection=true;options.selectionSnapshot=std::make_shared<const SelectionMask>(*selection);options.width=integer(std::min(double(selection->width),grid.width));options.height=integer(std::min(double(selection->height),grid.height));}
 else if(remembered){options=*remembered;options.selection=false;options.selectionSnapshot.reset();}
 else{options.x=integer(grid.x);options.y=integer(grid.y);options.width=integer(grid.width);options.height=integer(grid.height);}
 return options;
}
int sheetImportFrameSizeFromCount(int extent,int origin,int padding,int count){
 const auto divisor=std::max(1,count);
 const auto value=std::floor(double(std::int64_t(extent)-origin-std::int64_t(padding)*(divisor-1))/divisor);
 return int(std::clamp(value,1.,double(INT32_MAX)));
}
const SelectionMask* sheetImportSelection(const Document& document,const SheetImportOptions& options){
 if(!options.selection)return nullptr;
 const auto* selection=options.selectionSnapshot?options.selectionSnapshot.get():(document.selection()?&*document.selection():nullptr);
 if(!selection)throw std::runtime_error("Pixel selection missing");
 if(selection->width<1||selection->height<1||std::int64_t(selection->x)+selection->width>INT32_MAX||std::int64_t(selection->y)+selection->height>INT32_MAX)throw std::length_error("Sprite sheet selection exceeds native coordinate range");
 return selection;
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
void validateSpriteSheetImportAllocation(const Document& d,const SheetImportOptions& options){
 const auto* selection=sheetImportSelection(d,options);const auto plan=planSpriteSheetImport(selection?selection->width:d.width(),selection?selection->height:d.height(),options);if(plan.tiles.empty())throw std::runtime_error("No complete sprite sheet tiles");validateImportedImageDimensions(options.width,options.height);
 constexpr std::uint64_t limit=256ull*1024*1024;std::uint64_t used=0;auto reserve=[&](std::uint64_t bytes){if(bytes>limit-used)throw std::length_error("Sprite sheet preview/history exceeds working pixel budget");used+=bytes;};
 std::set<std::string> owners;for(const auto& cel:d.timeline().state().cels)if(cel.surface&&owners.insert(d.timeline().linkedStorageKey(cel.id)).second){const auto& surface=*cel.surface;raster::validate(surface);raster::coordinate(std::int64_t(surface.offsetX)+surface.width);raster::coordinate(std::int64_t(surface.offsetY)+surface.height);reserve(std::uint64_t(surface.pixels.size())*sizeof(Pixel)*2);}
 for(const auto& mask:d.timeline().state().masks){raster::validate(mask.mask.surface);reserve(std::uint64_t(mask.mask.surface.pixels.size())*sizeof(Pixel)*2);}
 reserve(sheetImportResourceBytes(d.timeline().state())*2);if(options.selectionSnapshot)reserve(options.selectionSnapshot->mask.size());if(d.selection())reserve(std::uint64_t(d.selection()->mask.size())*2);
 const auto area=std::uint64_t(options.width)*options.height;reserve(area*sizeof(Pixel)*(std::uint64_t(plan.tiles.size())*3+2));
}
timeline::State buildSpriteSheetImport(const Document& d,const SheetImportOptions& o,const std::function<bool()>& cancelled,const std::function<void(std::size_t)>& progress){
 auto checkCancel=[&]{if(cancelled&&cancelled())throw SheetImportCancelled{};};checkCancel();
 if(d.active())throw std::runtime_error("Commit or cancel active operation before importing");const auto* selection=sheetImportSelection(d,o);const int sw=selection?selection->width:d.width(),sh=selection?selection->height:d.height();auto plan=planSpriteSheetImport(sw,sh,o);if(plan.tiles.empty())throw std::runtime_error("No complete sprite sheet tiles");validateImportedImageDimensions(o.width,o.height);const auto area=std::uint64_t(o.width)*o.height;if(plan.tiles.size()>importedImageMaxPixels/area)throw std::length_error("Sprite sheet import exceeds native pixel budget");
 timeline::State out;out.layers.push_back({"sheet-layer-"+std::to_string(d.revision()+1),U"导入的精灵表"});const auto layer=out.layers.front().id;const auto& frames=d.timeline().state().frames;
 for(std::size_t i=0;i<plan.tiles.size();++i){checkCancel();const auto tile=plan.tiles[i];auto id="sheet-frame-"+std::to_string(d.revision()+1)+"-"+std::to_string(i);out.frames.push_back({id,frames[std::min(i,frames.size()-1)].duration});timeline::Surface s;s.width=o.width;s.height=o.height;s.pixels.resize(std::size_t(o.width)*o.height,0);const int left=std::max(0,tile.x),top=std::max(0,tile.y),right=std::min(sw,tile.x+o.width),bottom=std::min(sh,tile.y+o.height);
  if(right>left&&bottom>top){const int originX=selection?selection->x:0,originY=selection?selection->y:0;const int chunkRows=std::max(1,65536/(right-left));
   for(int first=top;first<bottom;first+=chunkRows){checkCancel();const auto rows=std::min(chunkRows,bottom-first);auto pixels=compositeNormalRegion(d.timeline(),d.frame().id,{left+originX,first+originY,right-left,rows});
    for(int y=0;y<rows;++y)for(int x=0;x<right-left;++x){const auto index=selection?std::size_t(first+y)*selection->width+left+x:0;const bool selected=!selection||selection->mask.empty()||(index<selection->mask.size()&&selection->mask[index]==1);const auto color=selected?pixels[std::size_t(y)*(right-left)+x]:0;// Legacy async source-over clears hidden RGB.
     s.pixels[std::size_t(first-tile.y+y)*o.width+left-tile.x+x]=(color>>24)?color:0;}
   }
  }
  out.cels.push_back({"sheet-cel-"+std::to_string(d.revision()+1)+"-"+std::to_string(i),layer,id,{},{},{},0,std::move(s)});if(progress)progress(i+1);
 }checkCancel();return out;
}
}
