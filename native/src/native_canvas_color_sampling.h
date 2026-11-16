#pragma once
#include <cstdint>
#include <functional>
#include <optional>
#include "gfx/point.h"
namespace ui{class Widget;}
namespace moon {
void registerNativeCanvasColorSurface(ui::Widget&,std::function<std::optional<std::uint32_t>(gfx::Point)>,std::function<void(bool)>,std::function<bool(gfx::Point)> contains={});
void unregisterNativeCanvasColorSurface(ui::Widget&);
std::optional<std::uint32_t> sampleNativeCanvasColor(gfx::Point screen);
void beginNativeCanvasColorSampling(ui::Widget&,std::function<void(std::uint32_t,gfx::Point)>);
void endNativeCanvasColorSampling(ui::Widget&);
void syncNativeCanvasColorIntent(ui::Widget&,bool,std::function<void(std::uint32_t,gfx::Point,bool)>);
bool routeNativeCanvasColorSampling(gfx::Point screen);
bool routeNativeCanvasColorIntent(gfx::Point screen,bool secondary);
bool nativeCanvasColorCursor(const ui::Widget&);
}
