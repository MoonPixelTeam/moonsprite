#include "document.h"
#include <unordered_set>
#include <unordered_map>
#include "document_history_storage.h"
#include "sheet_import_storage.h"

namespace moon {
bool Document::convertColorMode(color_mode::Mode target){
 if(target==color_mode::Mode::Indexed)throw std::invalid_argument("Indexed storage migration is incomplete");
 if(target==colorMode_||active())return false;
 // Legacy visits displayed layers and cels, excluding masks and independent
 // tileset resources. Native displayed layers use the owning cel storage.
 const auto rasterBytes=history_storage::adjustmentStorageBudget(timeline_,3);
 std::size_t remaining=history_storage::adjustmentByteLimit-rasterBytes*3;
 auto reserve=[&](std::uint64_t bytes){if(bytes>remaining)throw std::length_error("Color mode resource snapshots exceed pixel budget");remaining-=std::size_t(bytes);};
 reserve(2*sheetImportFreeMetadataBytes(timeline_.state()));
 std::unordered_set<std::string> freeSets;
 for(const auto& layer:timeline_.state().layers)if(layer.kind=="free-tile"&&layer.freeTiles){const auto& data=*layer.freeTiles;if(!data.legacyTilesetId.empty())freeSets.insert(data.legacyTilesetId);for(const auto& source:data.sources)freeSets.insert(source.tilesetId);}
 for(const auto& set:timeline_.state().tilesets)if(freeSets.count(set.id))reserve(2ull*set.pixels.size()*sizeof(Pixel));
 auto resources=std::make_shared<ColorModeResources>();
 for(const auto& cel:timeline_.state().cels)if(cel.freeTiles&&timeline_.resolveSurface(cel.id).source->id==cel.id)resources->cels.push_back({cel.id,0,cel.freeTiles->instances});
 for(const auto& set:timeline_.state().tilesets)if(freeSets.count(set.id))resources->sets.push_back({set.id,0,set.tileWidth,set.tileHeight,set.columns,set.rows,set.pixels});
 for(const auto& layer:timeline_.state().layers)if(layer.kind=="free-tile"&&layer.freeTiles)for(const auto& source:layer.freeTiles->sources)resources->sources.push_back({layer.id,source.id,0,0,source.offsetX,source.offsetY});
 Edit edit{{},state_,nextState_};
 edit.snapshotHistory.beforeColorMode=colorMode_;edit.snapshotHistory.afterColorMode=target;
 edit.snapshotHistory.colorModeResources=std::move(resources);
 edit.paletteHistory.paletteKind=13;
 edit.paletteHistory.beforePalette=palette_;edit.paletteHistory.afterPalette=palette_;
 edit.maskHistory.beforeMasks=timeline_.state().masks;edit.maskHistory.afterMasks=timeline_.state().masks;
 std::unordered_map<const void*,timeline::LinkedPixelStorage> converted;
 for(const auto& cel:timeline_.state().cels)if(cel.surface&&timeline_.resolveSurface(cel.id).source->id==cel.id){
  const auto& before=*cel.surface;
  auto found=converted.find(before.pixels.identity());
  if(found==converted.end()){
   timeline::LinkedPixelStorage pixels(before.pixels);
   if(target==color_mode::Mode::Grayscale)for(auto& value:pixels)value=relativeLuminancePixel(value);
   found=converted.emplace(before.pixels.identity(),std::move(pixels)).first;
  }
  auto after=before;after.pixels.share(found->second);
  edit.contentHistory.surfaceChanges.push_back({cel.id,before,std::move(after)});
 }
 // No animation-selection snapshot: replay keeps the current UI context.
 reserveHistoryEntries();applyEdit(edit,true);change_={0,0,width_,height_};publishChange();
 pushEdit(std::move(edit),U"转换颜色模式");return true;
}
bool Document::setPixelFormat(color_mode::PixelFormat format){
 if(colorMode_!=color_mode::Mode::Rgba||format==pixelFormat_)return false;
 // workspace-commands-color.ts::setPixelFormat: visit document layers/cels,
 // deduplicate shared storage, leave masks and independent source resources.
 std::unordered_set<const void*> seen;
 std::vector<timeline::LinkedPixelStorage*> owners;
 owners.reserve(timeline_.state_.cels.size());seen.reserve(timeline_.state_.cels.size());
 for(auto& cel:timeline_.state_.cels)if(cel.surface&&seen.insert(cel.surface->pixels.identity()).second)owners.push_back(&cel.surface->pixels);
 for(auto* storage:owners)for(auto& value:*storage)value=color_mode::quantizePixelColor(value,format);
 pixelFormat_=format;modified_=true;projectInformation_.operation();++revision_;
 change_={0,0,width_,height_};publishChange();notifyRecording();return true;
}
}
