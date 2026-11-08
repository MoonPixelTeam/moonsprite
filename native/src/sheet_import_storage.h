#pragma once
#include "timeline_model.h"
namespace moon {
// Native allocation admission for the special payloads retained by legacy
// structure snapshots. Pixels/masks are priced separately by the caller.
inline std::uint64_t sheetImportFreeMetadataBytes(const timeline::State& state){
 std::uint64_t bytes=0;
 for(const auto& layer:state.layers)if(layer.freeTiles){bytes+=sizeof(free_tiles::LayerData)+layer.freeTiles->setId.size()+layer.freeTiles->legacyTilesetId.size();for(const auto& source:layer.freeTiles->sources)bytes+=sizeof(source)+source.id.size()+source.name.size()+source.tilesetId.size()+source.description.size()+source.blendMode.size()+source.preservedJson.size();}
 for(const auto& cel:state.cels)if(cel.freeTiles){bytes+=sizeof(free_tiles::CelData)+cel.freeTiles->preservedJson.size();for(const auto& instance:cel.freeTiles->instances)bytes+=sizeof(instance)+instance.id.size()+instance.sourceId.size()+instance.tileId.size()+instance.preservedJson.size()+(instance.blendMode?instance.blendMode->size():0);}
 return bytes;
}
inline std::uint64_t sheetImportResourceBytes(const timeline::State& state){
 std::uint64_t bytes=sheetImportFreeMetadataBytes(state);
 for(const auto& set:state.tilesets){bytes+=sizeof(set)+set.id.size()+set.name.size()*sizeof(char32_t)+set.pixels.size()*sizeof(timeline::Pixel);for(const auto& id:set.tileIds)bytes+=sizeof(id)+id.size();for(const auto& slot:set.tileSlots)bytes+=sizeof(slot)+(slot?slot->size():0);}
 for(const auto& cel:state.cels)if(cel.tilemap){bytes+=sizeof(tiles::CelData);for(const auto& cell:cel.tilemap->cells)bytes+=sizeof(cell)+(cell?cell->tilesetId.size()+cell->tileId.size():0);}
 return bytes;
}
}
