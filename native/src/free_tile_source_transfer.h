#pragma once
#include "timeline_model.h"
#include <algorithm>
#include <map>
#include <tuple>
#include <set>
#include <utility>

namespace moon {
// User-approved resource transfer, reusing whole-layer clipboard ownership.
using FreeSourceTransferMap=std::map<std::tuple<std::string,std::string,std::string>,std::string>;
template<class Fresh> void transferFreeCelSources(std::vector<timeline::Layer>& layers,std::vector<tiles::Tileset>& sets,const std::string& destination,const timeline::Layer& source,const std::vector<tiles::Tileset>& sourceSets,free_tiles::CelData& cel,FreeSourceTransferMap& mappings,Fresh&& fresh){
 auto owner=std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==destination;});
 if(owner==layers.end()||!owner->freeTiles||!source.freeTiles)throw std::invalid_argument("Missing portable free source authority");
 // Historical free layers refer directly to tiles in one atlas. Convert
 // referenced tiles to the same single-tile source representation used today.
 if(source.freeTiles->sources.empty()&&!source.freeTiles->legacyTilesetId.empty()){
  const auto atlas=std::find_if(sourceSets.begin(),sourceSets.end(),[&](const auto& t){return t.id==source.freeTiles->legacyTilesetId;});if(atlas==sourceSets.end()||atlas->tileIds.empty())throw std::invalid_argument("Missing legacy free clipboard atlas");
  if(owner->freeTiles->sources.empty()&&owner->freeTiles->legacyTilesetId==atlas->id){free_tiles::validate(*owner->freeTiles,cel,sets);return;}
  auto modern=source;modern.freeTiles->sources.clear();modern.freeTiles->legacyTilesetId.clear();std::vector<tiles::Tileset> textures;std::set<std::string> referenced;
  for(auto& i:cel.instances){const auto id=!i.tileId.empty()?i.tileId:!i.sourceId.empty()?i.sourceId:atlas->tileIds.front();const auto index=tiles::Index(*atlas).find(id);if(!index)throw std::invalid_argument("Missing legacy clipboard tile");if(referenced.insert(id).second){auto texture=tiles::blankTileset("legacy-source-"+id,atlas->name,atlas->tileWidth,atlas->tileHeight,id,1);tiles::writeTile(texture,id,tiles::readTile(*atlas,*index));free_tiles::Source item;item.id=id;item.name=id;item.tilesetId=texture.id;modern.freeTiles->sources.push_back(std::move(item));textures.push_back(std::move(texture));}i.sourceId=id;i.tileId.clear();}
  transferFreeCelSources(layers,sets,destination,modern,textures,cel,mappings,std::forward<Fresh>(fresh));return;
 }
 if(owner->freeTiles->sources.empty()&&!owner->freeTiles->legacyTilesetId.empty())throw std::invalid_argument("Convert legacy target atlas before importing free sources");
 auto data=*owner->freeTiles;
 for(auto& instance:cel.instances){const auto old=instance.sourceId.empty()?instance.tileId:instance.sourceId;const auto key=std::make_tuple(data.setId,source.freeTiles->setId,old);auto known=mappings.find(key);
  if(known!=mappings.end()){instance.sourceId=known->second;instance.tileId.clear();continue;}
  auto existing=std::find_if(data.sources.begin(),data.sources.end(),[&](const auto& v){return v.id==old;});
  if(existing!=data.sources.end()){mappings.emplace(key,old);instance.sourceId=old;instance.tileId.clear();continue;}
  const auto original=std::find_if(source.freeTiles->sources.begin(),source.freeTiles->sources.end(),[&](const auto& v){return v.id==old;});if(original==source.freeTiles->sources.end())throw std::invalid_argument("Missing copied free source");
  const auto texture=std::find_if(sourceSets.begin(),sourceSets.end(),[&](const auto& v){return v.id==original->tilesetId;});if(texture==sourceSets.end())throw std::invalid_argument("Missing copied free texture");
  auto equivalent=std::find_if(data.sources.begin(),data.sources.end(),[&](const auto& candidate){auto normalized=candidate;normalized.id=original->id;normalized.tilesetId=original->tilesetId;if(normalized!=*original)return false;const auto pixels=std::find_if(sets.begin(),sets.end(),[&](const auto& v){return v.id==candidate.tilesetId;});return pixels!=sets.end()&&pixels->tileWidth==texture->tileWidth&&pixels->tileHeight==texture->tileHeight&&pixels->pixels==texture->pixels&&pixels->tileIds==texture->tileIds;});
  if(equivalent!=data.sources.end()){mappings.emplace(key,equivalent->id);instance.sourceId=equivalent->id;instance.tileId.clear();continue;}
  auto copy=*texture;do{copy.id=fresh("tileset-free-transfer-");}while(std::any_of(sets.begin(),sets.end(),[&](const auto& v){return v.id==copy.id;}));
  auto added=*original;do{added.id=fresh("source-free-transfer-");}while(std::any_of(data.sources.begin(),data.sources.end(),[&](const auto& v){return v.id==added.id;}));added.tilesetId=copy.id;sets.push_back(std::move(copy));mappings.emplace(key,added.id);instance.sourceId=added.id;instance.tileId.clear();data.sources.push_back(std::move(added));
 }
 free_tiles::validate(data,cel,sets);
 for(auto& layer:layers)if(layer.freeTiles&&layer.freeTiles->setId==data.setId)layer.freeTiles=data;
}
}
