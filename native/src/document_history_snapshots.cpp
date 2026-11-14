#include "document.h"
#include <algorithm>
#include <utility>
#include "sheet_import_storage.h"

namespace moon {
void Document::applyLocalSnapshotHistory(const LocalSnapshotHistory& snapshot,bool forward){
auto name=forward?snapshot.afterHistoryName:snapshot.beforeHistoryName;applyRollbackPayload(*(forward?snapshot.afterRollback:snapshot.beforeRollback));name_=std::move(name);modified_=forward?snapshot.afterHistoryDirty:snapshot.beforeHistoryDirty;return;
}
void Document::applyRollbackHistory(const SnapshotHistory& snapshot,bool forward,HistoryReplayPlan& plan){
if(snapshot.beforeRollback)applyRollbackPayload(*(forward?snapshot.afterRollback:snapshot.beforeRollback),false,nullptr,&plan.rollbackPayload);
}
void Document::applySnapshotStructure(const Edit& edit,bool forward,HistoryReplayPlan& plan){
 if(!edit.snapshotHistory.beforeTimeline&&!edit.snapshotHistory.beforeDimensions&&!edit.snapshotHistory.beforeColorMode)return;
 if(!plan.snapshot){
  HistoryReplayPlan::Snapshot prepared;
  if(edit.snapshotHistory.beforeTimeline){auto restored=forward?*edit.snapshotHistory.afterTimeline:*edit.snapshotHistory.beforeTimeline;if(edit.layerHistory.layerTilesets)restored.tilesets=tilesetsForLayerEdit(edit,forward);prepared.timeline.emplace(std::move(restored));prepared.layer=forward?edit.afterActive:edit.beforeActive;prepared.frame=forward?edit.afterFrame:edit.beforeFrame;}
  prepared.dimensions=bool(edit.snapshotHistory.beforeDimensions);
  if(edit.snapshotHistory.beforeColorMode)prepared.colorMode=forward?edit.snapshotHistory.afterColorMode:edit.snapshotHistory.beforeColorMode;
  if(edit.snapshotHistory.colorModeResources){
   prepared.colorModeResources=*edit.snapshotHistory.colorModeResources;
   auto& resources=*prepared.colorModeResources;
   // Resolve every target before the first mode/resource swap. Only captured
   // fields are restored; names, flags, IDs and unrelated resources stay live.
   for(auto& cel:resources.cels){const auto found=timeline_.cels_.find(cel.id);if(found==timeline_.cels_.end()||!timeline_.state_.cels[found->second].freeTiles)throw std::logic_error("Missing color mode instance owner");cel.index=found->second;}
   for(auto& set:resources.sets){const auto& sets=timeline_.state_.tilesets;const auto found=std::find_if(sets.begin(),sets.end(),[&](const auto& value){return value.id==set.id;});if(found==sets.end())throw std::logic_error("Missing color mode tileset");set.index=std::size_t(found-sets.begin());}
   for(auto& source:resources.sources){const auto found=timeline_.layers_.find(source.layerId);if(found==timeline_.layers_.end()||!timeline_.state_.layers[found->second].freeTiles)throw std::logic_error("Missing color mode source owner");source.layerIndex=found->second;const auto& sources=timeline_.state_.layers[source.layerIndex].freeTiles->sources;const auto target=std::find_if(sources.begin(),sources.end(),[&](const auto& value){return value.id==source.id;});if(target==sources.end())throw std::logic_error("Missing color mode source");source.sourceIndex=std::size_t(target-sources.begin());}
  }
  const auto dims=prepared.dimensions?*(forward?edit.snapshotHistory.afterDimensions:edit.snapshotHistory.beforeDimensions):std::pair<int,int>{width_,height_};
  prepared.width=dims.first;prepared.height=dims.second;
  prepared.damage=(prepared.colorMode||(prepared.dimensions&&prepared.timeline))?PixelRegion{0,0,dims.first,dims.second}:change_;
  plan.snapshot.emplace(std::move(prepared));
 }
 exchangeSnapshotStructure(*plan.snapshot);
}
void Document::exchangeSnapshotStructure(HistoryReplayPlan::Snapshot& prepared)noexcept{
 if(prepared.colorModeResources){
  auto& resources=*prepared.colorModeResources;
  for(auto& cel:resources.cels)timeline_.state_.cels[cel.index].freeTiles->instances.swap(cel.instances);
  for(auto& set:resources.sets){auto& target=timeline_.state_.tilesets[set.index];std::swap(target.tileWidth,set.tileWidth);std::swap(target.tileHeight,set.tileHeight);std::swap(target.columns,set.columns);std::swap(target.rows,set.rows);target.pixels.swap(set.pixels);}
  for(auto& source:resources.sources){auto& target=timeline_.state_.layers[source.layerIndex].freeTiles->sources[source.sourceIndex];std::swap(target.offsetX,source.x);std::swap(target.offsetY,source.y);}
 }
 if(prepared.colorMode)std::swap(colorMode_,*prepared.colorMode);
 if(prepared.timeline){std::swap(timeline_,*prepared.timeline);activeLayerId_.swap(prepared.layer);activeFrameId_.swap(prepared.frame);}
 if(prepared.dimensions){std::swap(width_,prepared.width);std::swap(height_,prepared.height);}
 std::swap(change_,prepared.damage);prepared.applied=!prepared.applied;
}
std::optional<std::size_t> Document::SnapshotHistory::exclusiveBytes()const{
 if(beforeRollback)return rollbackBytes;
 return {};
}
std::size_t Document::SnapshotHistory::timelineBytes()const{
 std::size_t size=0;
 if(colorModeResources){
  const auto& resources=*colorModeResources;size+=sizeof(resources);
  for(const auto& cel:resources.cels){size+=sizeof(cel)+cel.id.size();for(const auto& instance:cel.instances)size+=sizeof(instance)+instance.id.size()+instance.sourceId.size()+instance.tileId.size()+instance.preservedJson.size()+(instance.blendMode?instance.blendMode->size():0);}
  for(const auto& set:resources.sets)size+=sizeof(set)+set.id.size()+set.pixels.size()*sizeof(Pixel);
  for(const auto& source:resources.sources)size+=sizeof(source)+source.layerId.size()+source.id.size();
 }
  for(const auto* t:{&beforeTimeline,&afterTimeline})if(*t)for(const auto& m:(*t)->masks)size+=sizeof(m)+m.mask.surface.pixels.size()*4;
  for(const auto* t:{&beforeTimeline,&afterTimeline})if(*t){size+=sheetImportFreeMetadataBytes(**t);for(const auto& c:(*t)->cels){size+=128+(c.surface?c.surface->pixels.size()*sizeof(Pixel):0);if(c.tilemap)for(const auto& v:c.tilemap->cells)size+=sizeof(v)+(v?v->tilesetId.size()+v->tileId.size():0);}for(const auto& set:(*t)->tilesets){size+=sizeof(set)+set.pixels.size()*sizeof(Pixel);for(const auto& id:set.tileIds)size+=sizeof(id)+id.size();for(const auto& slot:set.tileSlots)size+=sizeof(slot)+(slot?slot->size():0);}}

 return size;
}
std::size_t Document::SnapshotHistory::geometryBytes()const{
 std::size_t size=0;
  for(const auto* geometry:{&beforeScriptGeometry,&afterScriptGeometry})if(*geometry)for(const auto& [id,g]:**geometry)size+=sizeof(g)+sizeof(std::string)+id.size();

 return size;
}
}
