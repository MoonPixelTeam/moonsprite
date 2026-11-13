#include "pixel_theme.h"
#include "native_widgets.h"
#include "ui/graphics.h"
#include "ui/widget.h"
#include "ui_scale.h"
#include "text/font_mgr.h"
#include <stdexcept>
namespace moon::editor {
PixelTheme::PixelTheme(const std::string& path) {

    font_=fontMgr()->loadSpriteSheetFont(path.c_str(),10);

    if(!font_) throw std::runtime_error("Cannot load Fusion sprite font");

  }

int PixelTheme::getScrollbarSize() {return 7*uiScale;}

gfx::Size PixelTheme::getCaretSize(ui::Widget*) {return {uiScale,10*uiScale};}

text::FontRef PixelTheme::getDefaultFont() const { return font_; }

void PixelTheme::paintScrollBar(ui::Graphics* g,const ui::Widget* widget,const ui::Style*,const ui::Style*,const gfx::Rect& track,const gfx::Rect& thumb) {

    if(!skin)return;const bool vertical=widget->align() & ui::VERTICAL;const std::string id=vertical?"scrollbar.vertical.":"scrollbar.horizontal.";

    {UiPaintScale scale(*g);skin->draw(*g,id+"track",uiLogical(track));}

    UiPaintScale scale(*g,thumb.origin());skin->draw(*g,id+(widget->hasMouse() || widget->isSelected()?"hover":"normal"),uiLogical(gfx::Rect(0,0,thumb.w,thumb.h)));

  }

void PixelTheme::getWindowMask(ui::Widget* widget,gfx::Region& region) {

    // laf subtracts this region when repainting widgets below popup windows.

    // Our native windows are rectangular; an empty mask leaves menus uncovered.

    region=widget->bounds();

  }
}
