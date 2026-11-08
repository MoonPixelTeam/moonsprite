#pragma once
#include "layer_compositor.h"
#include <functional>
namespace moon {
// Adapted from legacy core/image-scale-detection.ts under repository license.
// Scan the visible composite in64-row chunks; no full-canvas output allocation.
int detectRepeatedPixelScale(const std::vector<timeline::Pixel>&,int width,int height);
int detectDocumentPixelScale(const timeline::Timeline&,const std::string& frame,int width,int height,const std::function<bool()>& cancelled={});
}
