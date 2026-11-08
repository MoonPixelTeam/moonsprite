#pragma once
#include <cstdint>
#include <stdexcept>
namespace moon {
// Native coordinate/storage adaptation of legacy document-model/png/gif-import.
// Keep the canvas envelope already used by Document and project admission;
// individual decoders still account for their own frame/channel working sets.
inline constexpr std::uint64_t importedImageMaxSide=32768;
inline constexpr std::uint64_t importedImageMaxPixels=64ull*1024*1024;
inline bool editableImageDimensions(std::uint64_t width,std::uint64_t height){
 return width&&height&&width<=importedImageMaxSide&&height<=importedImageMaxSide&&width<=importedImageMaxPixels/height;
}
inline void validateImportedImageDimensions(std::uint64_t width,std::uint64_t height){
 if(!editableImageDimensions(width,height))throw std::length_error("Image exceeds native coordinate or 256 MiB pixel budget");
}
}
