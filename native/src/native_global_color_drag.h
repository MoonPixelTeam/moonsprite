#pragma once
#include "global_color_sampling.h"
#include "skin_assets.h"
#include "gfx/point.h"
#include <array>
#include <functional>
namespace ui {class Message;class Widget;}
namespace moon {
class PixelButton;struct Skin;
struct GlobalColorDragEnvironment {
 const Skin* skin=nullptr;
 bool magnifier=true,line=false,distortion=false;double size=1;
 std::array<SkinPatch,4> masks;std::array<SkinPatch,2> pointers;
 std::function<std::optional<std::uint32_t>(gfx::Point,ui::Widget*)> canvas;
 std::function<void(bool)> cursor;
 std::function<bool()> valid;
 std::function<bool(ui::Widget*)> hideAt;
};
void setGlobalColorDragEnvironment(const void* owner,std::function<GlobalColorDragEnvironment()> provider);
void clearGlobalColorDragEnvironment(const void* owner);
// Bind only actual legacy ColorValueControl triggers, not preset swatches.
void bindGlobalColorDrag(PixelButton&,std::function<void(std::uint32_t)> changed);
void unbindGlobalColorDrag(PixelButton&);
bool globalColorDragActive();
// Formal UI diagnostic uses the same frame/timer path without wall-clock sleeps.
void pollGlobalColorDrag(PixelButton&);
bool processGlobalColorDrag(PixelButton&,ui::Message*);
}
