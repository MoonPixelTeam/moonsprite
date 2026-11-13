#pragma once
#include "native_widgets.h"
#include "color_adjustment.h"
namespace moon::editor {
class CurveEditorNative final:public ui::Widget{

 const Skin& skin_;int active_=-1;

public:

 std::vector<CurvePoint>* points=nullptr;const std::array<unsigned,256>* histogram=nullptr;int selected=-1,channel=0;std::function<void()> changed;
  explicit CurveEditorNative(const Skin& skin);
  CurvePoint eventPoint(gfx::Point p)const;
  gfx::Point pointPosition(CurvePoint p)const;
  void notify();
  void resetChannel();
  void deleteSelected();
  void selectChannel();
  void setCoordinate(int axis,double value);
  bool onProcessMessage(ui::Message* msg)override;
  void onPaint(ui::PaintEvent& ev)override;

};
}
