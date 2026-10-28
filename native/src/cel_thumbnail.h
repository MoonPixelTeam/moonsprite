#pragma once
#include "timeline_model.h"
namespace moon {
enum class CelThumbnailFraming { Content,Canvas };
enum class CelThumbnailBackground { Checkerboard,Transparent };
struct CelThumbnailOptions {double targetSize=46,opacity=1;CelThumbnailBackground background=CelThumbnailBackground::Checkerboard;CelThumbnailFraming framing=CelThumbnailFraming::Content;};
// Caller resolves linked owners; renderer never caches or mutates input.
std::vector<timeline::Pixel> renderCelThumbnailPixels(int canvasWidth,int canvasHeight,const timeline::Surface& surface,const CelThumbnailOptions& options={});
}
