#pragma once
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>
namespace moon {
enum class LayerBlendMode {Normal,Darken,Multiply,ColorBurn,LinearBurn,Lighten,Screen,ColorDodge,LinearDodge,Overlay,SoftLight,HardLight,VividLight,LinearLight,PinLight,HardMix,Difference,Exclusion,Subtract,Divide,Hue,Saturation,Color,Luminosity};
std::optional<LayerBlendMode> parseLayerBlendMode(std::string_view);
std::string_view layerBlendModeName(LayerBlendMode);
std::uint32_t blendLayerPixel(std::uint32_t bottom,std::uint32_t top,double opacity,LayerBlendMode);
void blendLayerRow(std::uint32_t* output,const std::uint32_t* source,std::size_t count,double opacity,LayerBlendMode);
}
