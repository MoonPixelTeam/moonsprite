#pragma once
#include "timeline_model.h"
#include <unordered_set>

namespace moon {
// Legacy workspace-commands-color document replacement, extended by the user's
// approved resource fix: unlocked references select resources; every reference
// observes the resulting resource, including references on locked layers.
inline bool synchronizePaletteResources(timeline::State& state,timeline::Pixel before,timeline::Pixel after){
 if(state.tilesets.empty()||before==after)return false;
 std::unordered_map<std::string,const timeline::Layer*> layers;
 std::unordered_map<std::string,bool> locked;
 layers.reserve(state.layers.size());locked.reserve(state.layers.size());
 for(const auto& l:state.layers){layers.emplace(l.id,&l);locked.emplace(l.id,timeline::isLayerEffectivelyLocked(state,l));}
 timeline::Timeline resolver(state);
 std::unordered_map<std::string,std::unordered_set<std::string>> selected;
 for(const auto& slot:state.cels){
  const auto& l=*layers.at(slot.layerId);if(locked.at(l.id))continue;
  auto resolved=resolver.resolveSurface(slot.id);if(!resolved.source)continue;const auto& c=*resolved.source;
  if(c.tilemap)for(const auto& cell:c.tilemap->cells)if(cell)selected[cell->tilesetId].insert(cell->tileId);
  if(c.freeTiles&&l.freeTiles){const auto& data=*l.freeTiles;
   for(const auto& i:c.freeTiles->instances){
    if(data.sources.empty()){auto set=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& s){return s.id==data.legacyTilesetId;});if(set!=state.tilesets.end()&&!set->tileIds.empty())selected[set->id].insert(!i.tileId.empty()?i.tileId:!i.sourceId.empty()?i.sourceId:set->tileIds.front());}
    else{const auto id=i.sourceId.empty()?i.tileId:i.sourceId;for(const auto& source:data.sources)if(source.id==id||source.tilesetId==id){auto set=std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& s){return s.id==source.tilesetId;});if(set!=state.tilesets.end()&&!set->tileIds.empty())selected[set->id].insert(set->tileIds.front());break;}}
   }
  }
 }
 std::unordered_map<std::string,std::unordered_set<std::string>> changed;
 for(auto& set:state.tilesets){auto found=selected.find(set.id);if(found==selected.end())continue;const tiles::Index index(set);
  // Edit atlas rows directly: no per-tile allocation, readback or full-tile copy.
  for(const auto& id:found->second)if(auto at=index.find(id)){bool dirty=false;
   for(int y=0;y<set.tileHeight;++y){const auto offset=(*at/set.columns*set.tileHeight+y)*set.columns*set.tileWidth+*at%set.columns*set.tileWidth;
    for(int x=0;x<set.tileWidth;++x){auto& pixel=set.pixels[offset+x];if(pixel==before){pixel=after;dirty=true;}}
   }
   if(dirty)changed[set.id].insert(id);
  }
 }
 if(changed.empty())return false;
 const tiles::Catalog catalog(state.tilesets);
 for(auto& c:state.cels){if(c.linkedCelId||c.runtimeSharedCelId||!c.surface)continue;
  if(c.tilemap){const auto& grid=*c.tilemap;auto& surface=*c.surface;
   for(std::size_t i=0;i<grid.cells.size();++i){const auto& cell=grid.cells[i];if(!cell)continue;auto set=changed.find(cell->tilesetId);if(set==changed.end()||!set->second.count(cell->tileId))continue;
    const auto tile=tiles::cellPixels(cell,grid.tileWidth,grid.tileHeight,catalog);const int x=int(i%grid.columns)*grid.tileWidth,y=int(i/grid.columns)*grid.tileHeight;
    auto& pixels=static_cast<std::vector<timeline::Pixel>&>(surface.pixels);
    for(int dy=0;dy<grid.tileHeight&&y+dy<surface.height;++dy)if(x<surface.width)std::copy_n(tile.begin()+std::size_t(dy)*grid.tileWidth,std::min(grid.tileWidth,surface.width-x),pixels.begin()+std::size_t(y+dy)*surface.width+x);
   }
  }
  if(c.freeTiles){const auto& l=*layers.at(c.layerId);if(!l.freeTiles)continue;const auto& data=*l.freeTiles;bool affected=changed.count(data.legacyTilesetId)>0;for(const auto& s:data.sources)affected|=changed.count(s.tilesetId)>0;
   if(affected)c.surface->pixels=free_tiles::render(data,*c.freeTiles,state.tilesets,c.surface->width,c.surface->height);
  }
 }
 return true;
}
}
