#pragma once
#include "timeline_model.h"
#include <unordered_set>
#include <functional>

namespace moon {
// Legacy workspace-commands-color document replacement, extended by the user's
// approved resource fix: unlocked references select resources; every reference
// observes the resulting resource, including references on locked layers.
inline bool synchronizePaletteResources(timeline::State& state,timeline::Pixel before,timeline::Pixel after,bool grayscale=false,const std::vector<std::string>* targets=nullptr,const std::function<bool(std::int64_t,std::int64_t)>& contains={}){
 if(state.tilesets.empty()||before==after)return false;
 std::unordered_map<std::string,const timeline::Layer*> layers;
 std::unordered_map<std::string,bool> locked;
 layers.reserve(state.layers.size());locked.reserve(state.layers.size());
 for(const auto& l:state.layers){layers.emplace(l.id,&l);locked.emplace(l.id,timeline::isLayerEffectivelyLocked(state,l));}
 timeline::Timeline resolver(state);
 std::unordered_map<std::string,std::unordered_set<std::string>> selected;
 std::unordered_map<std::string,std::unordered_set<std::size_t>> selectedPixels;
 auto collect=[&](const tiles::Tileset& set,const std::string& id,const auto& world){const auto at=tiles::Index(set).find(id);if(!at)return;selected[set.id].insert(id);if(!contains)return;for(int y=0;y<set.tileHeight;++y)for(int x=0;x<set.tileWidth;++x){const auto point=world(x,y);if(contains(point.first,point.second))selectedPixels[set.id].insert((*at/set.columns*set.tileHeight+y)*set.columns*set.tileWidth+*at%set.columns*set.tileWidth+x);}};
 for(const auto& slot:state.cels){
  const auto& l=*layers.at(slot.layerId);if(locked.at(l.id))continue;
  auto resolved=resolver.resolveSurface(slot.id);if(!resolved.source||!resolved.surface)continue;const auto& c=*resolved.source;
  if(targets&&std::find(targets->begin(),targets->end(),c.id)==targets->end())continue;
  if(c.tilemap){const auto& grid=*c.tilemap;for(std::size_t n=0;n<grid.cells.size();++n)if(const auto& cell=grid.cells[n]){const auto set=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& s){return s.id==cell->tilesetId;});if(set==state.tilesets.end())continue;selected[set->id].insert(cell->tileId);if(contains){const auto at=tiles::Index(*set).find(cell->tileId);if(!at)continue;for(int y=0;y<grid.tileHeight;++y)for(int x=0;x<grid.tileWidth;++x)if(contains(std::int64_t(resolved.surface->offsetX)+int(n%grid.columns)*grid.tileWidth+x,std::int64_t(resolved.surface->offsetY)+int(n/grid.columns)*grid.tileHeight+y)){const auto point=tiles::sourcePoint(x,y,grid.tileWidth,grid.tileHeight,*cell);if(point.first>=0&&point.second>=0&&point.first<set->tileWidth&&point.second<set->tileHeight)selectedPixels[set->id].insert((*at/set->columns*set->tileHeight+point.second)*set->columns*set->tileWidth+*at%set->columns*set->tileWidth+point.first);}}}}

  if(c.freeTiles&&l.freeTiles){const auto& data=*l.freeTiles;
   for(const auto& i:c.freeTiles->instances){
    if(data.sources.empty()){auto set=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& s){return s.id==data.legacyTilesetId;});if(set!=state.tilesets.end()&&!set->tileIds.empty())collect(*set,!i.tileId.empty()?i.tileId:!i.sourceId.empty()?i.sourceId:set->tileIds.front(),[&](int x,int y){const auto p=free_tiles::transform(i,x,y);return std::make_pair(std::int64_t(resolved.surface->offsetX)+i.x+p.first,std::int64_t(resolved.surface->offsetY)+i.y+p.second);});}
    else{const auto id=i.sourceId.empty()?i.tileId:i.sourceId;for(const auto& source:data.sources)if(source.id==id||source.tilesetId==id){auto set=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& s){return s.id==source.tilesetId;});if(set!=state.tilesets.end()&&!set->tileIds.empty())collect(*set,set->tileIds.front(),[&](int x,int y){const auto p=free_tiles::transform(i,source.offsetX+x,source.offsetY+y);return std::make_pair(std::int64_t(resolved.surface->offsetX)+i.x+p.first,std::int64_t(resolved.surface->offsetY)+i.y+p.second);});break;}}
   }
  }
 }
 std::unordered_map<std::string,std::unordered_set<std::string>> changed;
 for(auto& set:state.tilesets){auto found=selected.find(set.id);if(found==selected.end())continue;const tiles::Index index(set);
  // Edit atlas rows directly: no per-tile allocation, readback or full-tile copy.
  for(const auto& id:found->second)if(auto at=index.find(id)){bool dirty=false;
   for(int y=0;y<set.tileHeight;++y){const auto offset=(*at/set.columns*set.tileHeight+y)*set.columns*set.tileWidth+*at%set.columns*set.tileWidth;
    for(int x=0;x<set.tileWidth;++x){auto& pixel=set.pixels[offset+x];if(pixel==before&&(!contains||selectedPixels[set.id].count(offset+x))){pixel=after;dirty=true;}}
   }
   if(dirty)changed[set.id].insert(id);
  }
 }
 if(changed.empty())return false;
 const tiles::Catalog catalog(state.tilesets);
 for(auto& c:state.cels){if(c.linkedCelId||c.runtimeSharedCelId||!c.surface)continue;
  if(c.tilemap){const auto& grid=*c.tilemap;auto& surface=*c.surface;
   for(std::size_t i=0;i<grid.cells.size();++i){const auto& cell=grid.cells[i];if(!cell)continue;auto set=changed.find(cell->tilesetId);if(set==changed.end()||!set->second.count(cell->tileId))continue;
    const auto tile=tiles::cellPixels(cell,grid.tileWidth,grid.tileHeight,catalog,grayscale);const int x=int(i%grid.columns)*grid.tileWidth,y=int(i/grid.columns)*grid.tileHeight;
    auto& pixels=static_cast<std::vector<timeline::Pixel>&>(surface.pixels);
    for(int dy=0;dy<grid.tileHeight&&y+dy<surface.height;++dy)if(x<surface.width)std::copy_n(tile.begin()+std::size_t(dy)*grid.tileWidth,std::min(grid.tileWidth,surface.width-x),pixels.begin()+std::size_t(y+dy)*surface.width+x);
   }
  }
  if(c.freeTiles){const auto& l=*layers.at(c.layerId);if(!l.freeTiles)continue;const auto& data=*l.freeTiles;bool affected=changed.count(data.legacyTilesetId)>0;for(const auto& s:data.sources)affected|=changed.count(s.tilesetId)>0;
   if(affected)c.surface->pixels=free_tiles::render(data,*c.freeTiles,state.tilesets,c.surface->width,c.surface->height,grayscale);
  }
 }
 return true;
}
}
