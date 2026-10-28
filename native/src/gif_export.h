#pragma once
#include "document.h"
#include "export_protection.h"
namespace moon {
enum class GifDirection {Forward,Reverse,ForwardPingPong,ReversePingPong};
struct GifExportOptions {int scalePercent=100,frameStart=1,frameEnd=10000;std::string loopSectionId,layerId;GifDirection direction=GifDirection::Forward;bool trim=false,trimCommon=false;ExportProtection protection=ExportProtection::Off;bool selection=false;std::string sliceId;};
struct GifExport {int width=0,height=0;std::vector<std::string> frameIds;std::vector<std::uint8_t> bytes;};
// Adapted from legacy/core/gif.ts and animation-loop-sections.ts under
// MoonSprite Source-Available License 1.0 (legacy/LICENSE), not historical MIT.
std::vector<std::string> gifExportFrameIds(const timeline::State&,const GifExportOptions&);
struct PreparedAnimationExport {int width=0,height=0;bool loop=false;std::vector<std::string> frameIds;std::vector<std::vector<Pixel>> frames;std::vector<int> durations;};
PreparedAnimationExport prepareAnimationExport(const Document&,GifExportOptions={});
GifExport encodeAnimationGif(const Document&,GifExportOptions={});
}
