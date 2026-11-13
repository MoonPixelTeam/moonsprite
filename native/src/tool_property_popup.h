#pragma once
#include "native_widgets.h"
namespace moon::editor {
class ToolPropertyPopup final : public PixelDialog {

  const Skin& skin_;const PixelFont& font_;std::u32string title_;

  std::vector<std::pair<ui::Widget*,gfx::Rect>> controls_;

public:
  ToolPropertyPopup(const Skin& skin,const PixelFont& font,std::u32string title);
  void place(ui::Widget* widget,gfx::Rect rect);
  void onResize(ui::ResizeEvent& ev)override;
  gfx::Size minimumDialogSize(int)const override;
  void paintDialogContents(ui::PaintEvent& ev)override;

};
}
