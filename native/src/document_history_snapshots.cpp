#include "document.h"
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
  const auto dims=prepared.dimensions?*(forward?edit.snapshotHistory.afterDimensions:edit.snapshotHistory.beforeDimensions):std::pair<int,int>{width_,height_};
  prepared.width=dims.first;prepared.height=dims.second;
  prepared.damage=(prepared.colorMode||(prepared.dimensions&&prepared.timeline))?PixelRegion{0,0,dims.first,dims.second}:change_;
  plan.snapshot.emplace(std::move(prepared));
 }
 exchangeSnapshotStructure(*plan.snapshot);
}
void Document::exchangeSnapshotStructure(HistoryReplayPlan::Snapshot& prepared)noexcept{
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
