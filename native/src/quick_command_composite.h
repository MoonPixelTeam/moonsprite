#pragma once
#include "ui/property.h"
#include <functional>
namespace ui {class Widget;class PaintEvent;}
namespace moon::quick {
// The editor owns sibling-column/modal occlusion; the bar keeps its drawing.
struct Composite final:ui::Property {
 static constexpr const char* key="moonsprite.quick-command-composite";
 using Paint=std::function<void()>;
 std::function<void(ui::Widget&,ui::PaintEvent&,const Paint&)> paint;
 explicit Composite(decltype(paint) callback):ui::Property(key),paint(std::move(callback)){}
};
}
