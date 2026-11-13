#pragma once
#include "ui/widget.h"
#include <functional>
namespace moon::editor {
class FloatingColumnSurface final : public ui::Widget {

public:

  std::function<void(ui::Graphics&)> paint;

  std::function<bool(ui::Message*)> pointer;
  FloatingColumnSurface();
  void onResize(ui::ResizeEvent& ev)override;
  bool onProcessMessage(ui::Message* msg)override;
  void onPaint(ui::PaintEvent& ev)override;

};
class DockFeedback final : public ui::Widget {

public:

  std::function<void(ui::Graphics&)> paint;
  DockFeedback();
  void onPaint(ui::PaintEvent& ev)override;

};
}
