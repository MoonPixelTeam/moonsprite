#include "document.h"
#include <algorithm>
#include <stdexcept>
#include <type_traits>

namespace moon {
void Document::finishHistorySources(const Edit& edit,bool forward,bool freePaintBefore,bool sourceEdit,const std::string& sourceEditLayer,const std::string& sourceEditFrame){
if(sourceEdit){if(timeline_.hasLayer(sourceEditLayer))activeLayerId_=sourceEditLayer;if(timeline_.hasFrame(sourceEditFrame))activeFrameId_=sourceEditFrame;}if(edit.tileHistory.freeTileSourceDeletion||edit.tileHistory.freeTileSourceReorder)tileSelection_.freePaint=freePaintBefore;if(edit.tileHistory.freeTileSourceAddition||(edit.tileHistory.freeTileSourceDeletion&&forward)){freeInstanceSelected_.clear();freeInstancePrimary_.clear();freeInstanceAnchor_.clear();freeInstanceSelectionFrame_=activeFrameId_;}if(edit.snapshotHistory.beforeScriptGeometry)displayedLayerGeometry_=forward?*edit.snapshotHistory.afterScriptGeometry:*edit.snapshotHistory.beforeScriptGeometry;projectActiveCelOpacities();
}
Document::HistoryResourceReplay::HistoryResourceReplay(const Edit& edit,bool forward){
 if(!std::holds_alternative<std::monostate>(edit.terminalHistory))return;
 const auto& tiles=edit.tileHistory;const auto& mask=edit.maskHistory;
 if(tiles.beforeTilesetSlots)tileSlots=forward?tiles.afterTilesetSlots:tiles.beforeTilesetSlots;
 if(tiles.beforeTileSelection&&!edit.layerHistory.beforeLayerStructure)tileSelection=forward?tiles.afterTileSelection:tiles.beforeTileSelection;
 if(mask.beforeMasks){
  masks=forward?mask.afterMasks:mask.beforeMasks;
  if(forward&&mask.maskToActivateOnRedo){activeMask=*mask.maskToActivateOnRedo;explicitMask=true;}
  if(!forward&&mask.maskEditingOnUndo){activeMask=mask.maskEditingOnUndo->first;isolated=mask.maskEditingOnUndo->second;explicitMask=true;}
  focus=bool(mask.beforeMaskSelection)||bool(mask.maskEditingOnUndo);
  if(focus){activeLayer=forward?edit.afterActive:edit.beforeActive;activeFrame=forward?edit.afterFrame:edit.beforeFrame;}
 }
 if(mask.beforeMaskSelection){
  maskSelection.emplace();
  if(forward){if(mask.afterMaskSelection)maskSelection->slots=*mask.afterMaskSelection;maskSelection->anchor=mask.afterMaskSelectionAnchor;}
  else{maskSelection->slots=*mask.beforeMaskSelection;maskSelection->anchor=mask.beforeMaskSelectionAnchor;}
 }
}
void Document::applyTileHistoryResources(const Edit& edit,HistoryResourceReplay& prepared){
 // Resolve every throwing tile target before the first resource is published.
 if(prepared.tileSlots){auto target=std::find_if(timeline_.state_.tilesets.begin(),timeline_.state_.tilesets.end(),[&](const auto& value){return value.id==edit.tileHistory.tilesetSlotsId;});if(target==timeline_.state_.tilesets.end())throw std::logic_error("Missing tileset during slot history");target->tileSlots.swap(*prepared.tileSlots);}
 static_assert(std::is_nothrow_swappable_v<TilemapSelection>);
 if(prepared.tileSelection)std::swap(tileSelection_,*prepared.tileSelection);
}
void Document::applyFreeTileSelectionHistory(const TileResourceHistory& tiles,bool forward){
if(tiles.beforeFreeTileSelection){const auto& ui=forward?*tiles.afterFreeTileSelection:*tiles.beforeFreeTileSelection;freeInstanceSelected_=ui.selected;freeInstancePrimary_=ui.primary;freeInstanceAnchor_=ui.anchor;freeInstanceSelectionFrame_=ui.frame;freeInstanceViewLayer_=ui.viewLayer;}
}
std::optional<std::size_t> Document::TileResourceHistory::exclusiveBytes(const SourcePropertiesHistory* source)const{
 if(source){if(!source->before||!source->after)throw std::logic_error("Incomplete source properties history");std::size_t bytes=256;for(const auto* value:{source->before.get(),source->after.get()})bytes+=value->source.name.size()+value->source.description.size()+value->source.preservedJson.size()+value->tilesetName.size()*sizeof(char32_t);return bytes;}
 return {};
}
std::size_t Document::TileResourceHistory::pixelBytes(const TilemapPixelHistory* tilemapPixels)const{
 return (tilemapPixels?tilemapPixels->bytes():0);
}
std::size_t Document::TileResourceHistory::slotBytes()const{
 std::size_t size=0;
for(const auto* slots:{&beforeTilesetSlots,&afterTilesetSlots})if(*slots)for(const auto& id:**slots)size+=sizeof(id)+(id?id->size():0);size+=tilesetSlotsId.size();
 return size;
}
}
