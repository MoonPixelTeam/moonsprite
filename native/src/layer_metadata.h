#pragma once
#include "timeline_model.h"
#include <array>
namespace moon {
struct LayerMetadataSnapshot {std::string layerId;std::optional<std::uint32_t> displayColor;std::u32string description;};
std::vector<LayerMetadataSnapshot> captureLayerMetadata(const timeline::State&,const std::vector<std::string>&);
void applyLayerMetadata(timeline::State&,const std::vector<LayerMetadataSnapshot>&);
std::u32string trimLayerDescription(const std::u32string&);
std::optional<std::uint32_t> normalizeLayerDisplayColor(double,double,double,double);
std::size_t layerMetadataHistoryBytes(const LayerMetadataSnapshot&,const LayerMetadataSnapshot&,const std::u32string&,const std::u32string&);
}
