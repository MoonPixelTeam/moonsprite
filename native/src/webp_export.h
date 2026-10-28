#pragma once
#include "gif_export.h"
namespace moon {
// Legacy webp-animation.ts: full-frame replacement with exact millisecond timing.
GifExport encodeAnimationWebp(const Document&,GifExportOptions={});
}
