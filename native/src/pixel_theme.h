#pragma once
#include "ui/theme.h"
#include "theme_atlas.h"
#include "text/font.h"
#include <string>
namespace moon {struct Skin;}
namespace moon::editor {
class PixelTheme : public ui::Theme {

  text::FontRef font_;

public:
  explicit PixelTheme(const std::string& path);

  const Skin* skin=nullptr;
  int getScrollbarSize() override;
  gfx::Size getCaretSize(ui::Widget*) override;
  text::FontRef getDefaultFont() const override;
  void paintScrollBar(ui::Graphics* g,const ui::Widget* widget,const ui::Style*,const ui::Style*,const gfx::Rect& track,const gfx::Rect& thumb) override;
  void getWindowMask(ui::Widget* widget,gfx::Region& region) override;

};
}
