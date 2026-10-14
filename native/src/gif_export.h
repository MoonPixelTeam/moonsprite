#pragma once
#include "document.h"
namespace moon {
enum class GifDirection {Forward,Reverse,ForwardPingPong,ReversePingPong};
struct GifExportOptions {int scalePercent=100,frameStart=1,frameEnd=10000;std::string loopSectionId;GifDirection direction=GifDirection::Forward;bool trim=false;};
struct GifExport {int width=0,height=0;std::vector<std::string> frameIds;std::vector<std::uint8_t> bytes;};
// Adapted from legacy/core/gif.ts and animation-loop-sections.ts under
// MoonSprite Source-Available License 1.0 (legacy/LICENSE), not historical MIT.
std::vector<std::string> gifExportFrameIds(const timeline::State&,const GifExportOptions&);
GifExport encodeAnimationGif(const Document&,GifExportOptions={});
}
