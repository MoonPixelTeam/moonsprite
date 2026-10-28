#pragma once
#include "tilemap_data.h"
#include "layer_blend.h"
#include <cmath>
#include <map>
#include <set>
#include <string>
#include <optional>
#include <stdexcept>
#include <vector>
#include <tuple>

// Legacy shared/types-tiles.ts and core/free-tile.ts. Instances are ordered
// back-to-front and rotate about pixel edges, then mirror (unlike grid cells).
namespace moon::free_tiles {
constexpr int MaxCoordinate=67108864;
constexpr std::size_t MaxInstances=1048576,MaxSurfacePixels=64*1024*1024;
struct Source {
 std::string id,name,tilesetId,description,blendMode="normal",preservedJson;
 std::optional<std::uint32_t> displayColor;
 bool visible=true,locked=false;double opacity=1;int offsetX=0,offsetY=0;
};
struct LayerData {std::string setId,legacyTilesetId;std::vector<Source> sources;};
struct Instance {
 std::string id,sourceId,tileId,preservedJson;int x=0,y=0,rotation=0;
 bool visible=true,locked=false,flipHorizontal=false,flipVertical=false;
 std::optional<double> opacity;std::optional<std::string> blendMode;
};
struct CelData {std::vector<Instance> instances;std::string preservedJson;};
inline bool operator==(const Source& a,const Source& b){return std::tie(a.id,a.name,a.tilesetId,a.description,a.blendMode,a.preservedJson,a.displayColor,a.visible,a.locked,a.opacity,a.offsetX,a.offsetY)==std::tie(b.id,b.name,b.tilesetId,b.description,b.blendMode,b.preservedJson,b.displayColor,b.visible,b.locked,b.opacity,b.offsetX,b.offsetY);}
inline bool operator==(const LayerData& a,const LayerData& b){return std::tie(a.setId,a.legacyTilesetId,a.sources)==std::tie(b.setId,b.legacyTilesetId,b.sources);}
inline bool operator==(const Instance& a,const Instance& b){return std::tie(a.id,a.sourceId,a.tileId,a.preservedJson,a.x,a.y,a.rotation,a.visible,a.locked,a.flipHorizontal,a.flipVertical,a.opacity,a.blendMode)==std::tie(b.id,b.sourceId,b.tileId,b.preservedJson,b.x,b.y,b.rotation,b.visible,b.locked,b.flipHorizontal,b.flipVertical,b.opacity,b.blendMode);}
inline bool operator==(const CelData& a,const CelData& b){return a.instances==b.instances&&a.preservedJson==b.preservedJson;}
inline bool operator!=(const Source& a,const Source& b){return !(a==b);}
inline bool operator!=(const LayerData& a,const LayerData& b){return !(a==b);}
inline bool operator!=(const Instance& a,const Instance& b){return !(a==b);}
inline bool operator!=(const CelData& a,const CelData& b){return !(a==b);}
inline std::pair<int,int> transform(const Instance& instance,int x,int y){
 int tx=x,ty=y;
 switch(instance.rotation){case 1:tx=-y-1;ty=x;break;case 2:tx=-x-1;ty=-y-1;break;case 3:tx=y;ty=-x-1;break;}
 if(instance.flipHorizontal)tx=-tx-1;if(instance.flipVertical)ty=-ty-1;
 return {tx,ty};
}
inline bool coordinate(int n){return std::abs(std::int64_t(n))<=MaxCoordinate;}
inline void validateSource(const Source& s){
 if(s.id.empty()||s.tilesetId.empty()||!coordinate(s.offsetX)||!coordinate(s.offsetY)||!std::isfinite(s.opacity)||s.opacity<0||s.opacity>1||!parseLayerBlendMode(s.blendMode))throw std::invalid_argument("Invalid free tile source");
}
inline void validate(const LayerData& layer,const CelData& cel,const std::vector<tiles::Tileset>& sets){
 std::map<std::string,const tiles::Tileset*> catalog;for(const auto& set:sets)catalog.emplace(set.id,&set);
 std::set<std::string> sources;for(const auto& source:layer.sources){validateSource(source);if(!sources.insert(source.id).second||!catalog.count(source.tilesetId)||catalog.at(source.tilesetId)->tileIds.empty())throw std::invalid_argument("Invalid free tile source reference");}
 if(layer.sources.empty()&&!layer.legacyTilesetId.empty()&&(!catalog.count(layer.legacyTilesetId)||catalog.at(layer.legacyTilesetId)->tileIds.empty()))throw std::invalid_argument("Missing free tile source collection");
 if(cel.instances.size()>MaxInstances)throw std::length_error("Too many free tile instances");
 std::set<std::string> ids;
 for(const auto& i:cel.instances){
  if(i.id.empty()||!ids.insert(i.id).second||!coordinate(i.x)||!coordinate(i.y)||i.rotation<0||i.rotation>3||
     (i.opacity&&(!std::isfinite(*i.opacity)||*i.opacity<0||*i.opacity>1))||(i.blendMode&&!parseLayerBlendMode(*i.blendMode)))throw std::invalid_argument("Invalid free tile instance");
  if(!layer.sources.empty()){
   const auto id=i.sourceId.empty()?i.tileId:i.sourceId;
   if(std::none_of(layer.sources.begin(),layer.sources.end(),[&](const auto& s){return s.id==id||s.tilesetId==id;}))throw std::invalid_argument("Missing free tile instance source");
  }else{
   if(layer.legacyTilesetId.empty())throw std::invalid_argument("Missing free tile instance source");const auto& set=*catalog.at(layer.legacyTilesetId);const auto id=!i.tileId.empty()?i.tileId:!i.sourceId.empty()?i.sourceId:set.tileIds.front();
   if(!tiles::Index(set).find(id))throw std::invalid_argument("Missing legacy free tile instance tile");
  }
 }
}
inline std::vector<std::uint32_t> render(const LayerData& layer,const CelData& cel,const std::vector<tiles::Tileset>& sets,int width,int height){
 if(width<1||height<1||std::uint64_t(width)*height>MaxSurfacePixels)throw std::length_error("Free tile surface is too large");
 validate(layer,cel,sets);std::vector<std::uint32_t> out(std::size_t(width)*height);
 struct Resolved {const Source* source;const tiles::Tileset* set;std::vector<std::uint32_t> pixels;};
 std::vector<Resolved> decoded;decoded.reserve(layer.sources.size());std::map<std::string,const Resolved*> sources;
 for(const auto& s:layer.sources){const auto& set=*std::find_if(sets.begin(),sets.end(),[&](const auto& t){return t.id==s.tilesetId;});decoded.push_back({&s,&set,tiles::readTile(set,0)});sources.emplace(s.id,&decoded.back());sources.emplace(set.id,&decoded.back());}
 for(const auto& i:cel.instances){
  if(!i.visible)continue;Source legacy;Resolved old{};const Resolved* reference=nullptr;
  if(!layer.sources.empty())reference=sources.at(i.sourceId.empty()?i.tileId:i.sourceId);
  else{const auto& set=*std::find_if(sets.begin(),sets.end(),[&](const auto& s){return s.id==layer.legacyTilesetId;});const auto id=!i.tileId.empty()?i.tileId:!i.sourceId.empty()?i.sourceId:set.tileIds.front();legacy.id=set.id;old={&legacy,&set,tiles::readTile(set,*tiles::Index(set).find(id))};reference=&old;}
  const auto& resolved=*reference;
  const auto& s=*resolved.source;const double opacity=i.opacity.value_or(s.opacity);if(!s.visible||opacity<=0)continue;
  const auto blend=*parseLayerBlendMode(i.blendMode.value_or(s.blendMode));
  for(int y=0;y<resolved.set->tileHeight;++y)for(int x=0;x<resolved.set->tileWidth;++x){
   const auto p=resolved.pixels[std::size_t(y)*resolved.set->tileWidth+x];if(!(p>>24))continue;
   const auto at=transform(i,s.offsetX+x,s.offsetY+y);const auto tx=std::int64_t(i.x)+at.first,ty=std::int64_t(i.y)+at.second;
   if(tx<0||ty<0||tx>=width||ty>=height)continue;auto& dst=out[std::size_t(ty)*width+std::size_t(tx)];dst=blendLayerPixel(dst,p,opacity,blend);
  }
 }
 return out;
}
}
