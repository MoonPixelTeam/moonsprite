#include "mask_resize.h"
#include "document.h"
#include "background_layer.h"
#include "canvas_resize.h"
#include "raster_geometry.h"
#include "tile_canvas_resize.h"
#include "sheet_import_storage.h"
#include <set>
namespace moon {
bool Document::resizeResourceImage(int width,int height,ImageInterpolation method){
 const auto& before=timeline_.state();const double sx=double(width)/width_,sy=double(height)/height_;std::size_t remaining=256u*1024*1024;
 auto reserve=[&](std::uint64_t n){if(n>remaining)throw std::length_error("Image resize exceeds working pixel budget");remaining-=std::size_t(n);};
 reserve(4*sheetImportResourceBytes(before));std::set<std::string> freeSets,gridSets;
 auto scaled=[&](int n,double scale){const auto result=roundedImageResizeCoordinate(n*scale);if(!free_tiles::coordinate(result))throw std::length_error("Free tile resize coordinate exceeds range");return result;};
 for(const auto& l:before.layers)if(l.freeTiles){if(!l.freeTiles->legacyTilesetId.empty())freeSets.insert(l.freeTiles->legacyTilesetId);for(const auto& source:l.freeTiles->sources){freeSets.insert(source.tilesetId);scaled(source.offsetX,sx);scaled(source.offsetY,sy);}}
 for(const auto& l:before.layers)if(l.kind=="tilemap")gridSets.insert(l.tilemapTilesetId);for(const auto& c:before.cels)if(c.tilemap)for(const auto& cell:c.tilemap->cells)if(cell)gridSets.insert(cell->tilesetId);for(const auto& id:gridSets)if(freeSets.count(id))throw std::invalid_argument("Mixed grid/free source ownership is not migrated");
 struct SetPlan{std::size_t index;int width,height;};std::vector<SetPlan> sets;
 for(std::size_t i=0;i<before.tilesets.size();++i){const auto& set=before.tilesets[i];if(!freeSets.count(set.id)&&!gridSets.count(set.id))continue;const int w=std::max(1,roundedImageResizeCoordinate(set.tileWidth*sx)),h=std::max(1,roundedImageResizeCoordinate(set.tileHeight*sy));tiles::sizeCheck(w,h,set.columns,set.rows,true);reserve(3ull*set.columns*set.rows*w*h*sizeof(Pixel));reserve(2ull*(std::uint64_t(set.tileWidth)*set.tileHeight+std::uint64_t(w)*h)*sizeof(Pixel));sets.push_back({i,w,h});}
 struct CelPlan{std::size_t index;ImageResizeSurfacePlan surface;bool renderFree;};std::vector<CelPlan> cels;
 for(std::size_t i=0;i<before.cels.size();++i){const auto& c=before.cels[i];if(c.surface)reserve(3ull*c.surface->pixels.size()*sizeof(Pixel));const auto r=timeline_.resolveSurface(c.id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::invalid_argument("Invalid image resize owner");if(r.source->id!=c.id)continue;
  auto p=planImageResizeSurface(*r.surface,width_,height_,width,height);if(c.tilemap){const auto& g=*c.tilemap;const int tw=std::max(1,roundedImageResizeCoordinate(g.tileWidth*sx)),th=std::max(1,roundedImageResizeCoordinate(g.tileHeight*sy));tiles::sizeCheck(tw,th,g.columns,g.rows);p.width=g.columns*tw;p.height=g.rows*th;p.bytes=std::size_t(p.width)*p.height*sizeof(Pixel);}reserve(3ull*p.bytes);const auto& l=before.layers[timeline_.layerIndex(c.layerId)];const bool renderFree=c.freeTiles&&l.freeTiles&&(!l.freeTiles->sources.empty()||!l.freeTiles->legacyTilesetId.empty());
  if(c.freeTiles)for(const auto& instance:c.freeTiles->instances){const auto x=roundedImageResizeCoordinate((double(r.surface->offsetX)+instance.x)*sx),y=roundedImageResizeCoordinate((double(r.surface->offsetY)+instance.y)*sy);const auto lx=raster::coordinate(std::int64_t(x)-p.x),ly=raster::coordinate(std::int64_t(y)-p.y);if(!free_tiles::coordinate(lx)||!free_tiles::coordinate(ly))throw std::length_error("Free tile resize coordinate exceeds range");}
  cels.push_back({i,p,renderFree});
 }
 if(selection_)reserve(3ull*(selection_->mask.size()+std::uint64_t(width)*height));auto masks=resizedImageMasks(before,width_,height_,width,height,method,remaining);
 auto state=before;for(const auto& p:sets)state.tilesets[p.index]=imageResizedTileset(before.tilesets[p.index],p.width,p.height,method,freeSets.count(before.tilesets[p.index].id)!=0);
 for(auto& c:state.cels)if(c.tilemap){c.tilemap->tileWidth=std::max(1,roundedImageResizeCoordinate(c.tilemap->tileWidth*sx));c.tilemap->tileHeight=std::max(1,roundedImageResizeCoordinate(c.tilemap->tileHeight*sy));}
 for(auto& l:state.layers)if(l.freeTiles)for(auto& source:l.freeTiles->sources){source.offsetX=scaled(source.offsetX,sx);source.offsetY=scaled(source.offsetY,sy);}
 for(const auto& p:cels){checkImageResizeCancellation();const auto& old=before.cels[p.index];auto& c=state.cels[p.index];if(c.freeTiles)for(auto& instance:c.freeTiles->instances){instance.x=raster::coordinate(std::int64_t(roundedImageResizeCoordinate((double(old.surface->offsetX)+instance.x)*sx))-p.surface.x);instance.y=raster::coordinate(std::int64_t(roundedImageResizeCoordinate((double(old.surface->offsetY)+instance.y)*sy))-p.surface.y);}
  if(c.tilemap||p.renderFree){const auto& l=state.layers[timeline_.layerIndex(c.layerId)];timeline::Surface out;out.width=p.surface.width;out.height=p.surface.height;out.offsetX=p.surface.x;out.offsetY=p.surface.y;out.storageOriginX=out.storageOriginY=0;out.pixels=c.tilemap?tiles::render(*c.tilemap,state.tilesets):free_tiles::render(*l.freeTiles,*c.freeTiles,state.tilesets,out.width,out.height);c.surface=std::move(out);}
  else c.surface=imageResizedSurface(*old.surface,p.surface,method);
 }
 state.masks=std::move(masks);timeline::Timeline validated(std::move(state));Edit e{{},state_,nextState_};e.beforeDimensions={{width_,height_}};e.afterDimensions={{width,height}};e.beforeActive=e.afterActive=activeLayerId_;e.beforeFrame=e.afterFrame=activeFrameId_;e.beforeTimelineSelection=e.afterTimelineSelection=timelineSelection_;e.beforeSelection=e.afterSelection=selectedFrames_;e.pixelSelectionEdit=true;e.beforePixelsSelection=selection_;e.afterPixelsSelection=resizeImageSelection(selection_,width_,height_,width,height);e.beforeTimeline=before;e.afterTimeline=std::move(validated).takeState();reserveHistoryEntries();applyEdit(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"图像大小");return true;
}
bool Document::resizeBackgroundCanvas(int width,int height,int dx,int dy,bool trim,std::optional<TransformPoint> pivot){
 // Reuse the existing structural transaction for mixed special/background
 // layers. Plan every canonical owner before copying or changing live state.
 constexpr std::uint64_t limit=256ull*1024*1024;std::uint64_t bytes=0;
 auto reserve=[&](std::uint64_t n){if(n>limit-bytes)throw std::length_error("Canvas resize exceeds working pixel budget");bytes+=n;};
 const auto& before=timeline_.state();reserve(4*sheetImportResourceBytes(before));
 for(const auto& c:before.cels)if(c.surface)reserve(3ull*c.surface->pixels.size()*sizeof(Pixel));
 if(selection_)reserve(3ull*(selection_->mask.size()+std::uint64_t(width)*height));
 struct Plan{std::size_t index;CanvasResizeSurfacePlan raster;std::optional<TileCanvasPlan> grid;std::optional<FreeCanvasPlan> free;bool background=false;};std::vector<Plan> plans;
 std::set<std::string> activeOwners;for(const auto& c:before.cels)if(c.frameId==activeFrameId_){const auto r=timeline_.resolveSurface(c.id);if(r.source)activeOwners.insert(r.source->id);}
 for(std::size_t n=0;n<before.cels.size();++n){const auto& c=before.cels[n];const auto r=timeline_.resolveSurface(c.id);if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface)throw std::invalid_argument("Invalid canvas resize owner");if(r.source->id!=c.id)continue;
  const auto& layer=before.layers[timeline_.layerIndex(c.layerId)];const auto& s=*r.surface;Plan p{};p.index=n;
  const int x=raster::coordinate(std::int64_t(s.offsetX)+dx),y=raster::coordinate(std::int64_t(s.offsetY)+dy);
  if(c.tilemap){p.grid=planTileCanvas(*c.tilemap,x,y,width,height,trim);reserve(3ull*std::uint64_t(p.grid->columns)*p.grid->rows*sizeof(std::optional<tiles::Cell>));reserve(3ull*std::uint64_t(p.grid->width)*p.grid->height*sizeof(Pixel));}
  else if(c.freeTiles){if(!layer.freeTiles)throw std::invalid_argument("Missing canvas free tile sources");const auto& sources=*layer.freeTiles;
   if(!sources.sources.empty()||!sources.legacyTilesetId.empty()){p.free=planFreeCanvas(s,width,height,dx,dy,width>width_||height>height_,trim);reserve(3ull*std::uint64_t(p.free->width)*p.free->height*sizeof(Pixel));}
   else p.raster=planCanvasResizeSurface(s,width,height,activeOwners.count(c.id)?dx:0,activeOwners.count(c.id)?dy:0,false);
  }else if(layer.background){p.background=true;const auto& b=*layer.background;const auto repeat=b.mode=="preset"?backgroundPatternSize(b.pattern):std::pair<int,int>{b.repeatWidth?b.repeatWidth:width_,b.repeatHeight?b.repeatHeight:height_};if(repeat.first<1||repeat.second<1)throw std::invalid_argument("Invalid background repeat size");const auto left=-backgroundModulo(-std::int64_t(x),repeat.first),top=-backgroundModulo(-std::int64_t(y),repeat.second);const auto w=std::max<std::int64_t>(repeat.first,std::int64_t(width)-left),h=std::max<std::int64_t>(repeat.second,std::int64_t(height)-top);raster::coordinate(w);raster::coordinate(h);if(std::uint64_t(w)*h>64ull*1024*1024)throw std::length_error("Background pixel budget exceeded");reserve(3ull*std::uint64_t(w)*h*sizeof(Pixel));}
  else{p.raster=planCanvasResizeSurface(s,width,height,dx,dy,trim);if(p.raster.clipped)reserve(3ull*p.raster.bytes);}
  plans.push_back(std::move(p));
 }
 std::size_t maskBudget=std::size_t(limit-bytes);auto masks=resizedCanvasMasks(before,width,height,dx,dy,trim,maskBudget);
 auto state=before;for(auto& l:state.layers)if(l.background&&l.background->mode=="canvas"&&!l.background->repeatWidth){l.background->repeatWidth=width_;l.background->repeatHeight=height_;}
 for(const auto& p:plans){auto& c=state.cels[p.index];auto& s=*c.surface;const auto& layer=state.layers[timeline_.layerIndex(c.layerId)];
  if(p.grid){c.tilemap=canvasResizedGrid(*c.tilemap,*p.grid);s={};s.width=p.grid->width;s.height=p.grid->height;s.offsetX=p.grid->x;s.offsetY=p.grid->y;s.pixels=tiles::render(*c.tilemap,state.tilesets);}
  else if(p.free){c.freeTiles=canvasResizedInstances(*layer.freeTiles,*c.freeTiles,state.tilesets,*p.free,width,height,trim);s={};s.width=p.free->width;s.height=p.free->height;s.offsetX=p.free->x;s.offsetY=p.free->y;s.pixels=free_tiles::render(*layer.freeTiles,*c.freeTiles,state.tilesets,s.width,s.height);}
  else if(p.background)s=tileBackgroundSurface(s,width_,height_,width,height,dx,dy,*layer.background);
  else if(p.raster.clipped){auto available=p.raster.bytes;s=canvasResizeCroppedSurface(s,p.raster,available);}else{s.offsetX=p.raster.offsetX;s.offsetY=p.raster.offsetY;}
 }
 state.masks=std::move(masks);Edit e{{},state_,nextState_};e.beforeDimensions={{width_,height_}};e.afterDimensions={{width,height}};e.beforeActive=e.afterActive=activeLayerId_;e.beforeFrame=e.afterFrame=activeFrameId_;e.beforeTimelineSelection=e.afterTimelineSelection=timelineSelection_;e.beforeSelection=e.afterSelection=selectedFrames_;e.pixelSelectionEdit=true;e.beforePixelsSelection=selection_;
 if(selection_){SelectionMask shifted{0,0,width,height,{}};shifted.mask.resize(std::size_t(width)*height);for(int y=0;y<height;++y)for(int x=0;x<width;++x){const auto sx=std::int64_t(x)-dx,sy=std::int64_t(y)-dy;const bool inside=sx>=INT32_MIN&&sx<=INT32_MAX&&sy>=INT32_MIN&&sy<=INT32_MAX;shifted.mask[std::size_t(y)*width+x]=inside&&selectionContains(selection_,int(sx),int(sy))?1:0;}e.afterPixelsSelection=trimSelection(std::move(shifted));}
 e.beforeTrimPivot.emplace(pivot);if(!e.afterPixelsSelection)pivot.reset();else if(pivot){pivot->x+=dx;pivot->y+=dy;}e.afterTrimPivot.emplace(pivot);e.beforeTimeline=before;e.afterTimeline=std::move(state);reserveHistoryEntries();applyEdit(e,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(e),U"画布大小");return true;
}
}
