#include "tool_property_popup.h"
#include "ui/graphics.h"
#include "ui/paint_event.h"
#include "ui/resize_event.h"
#include "ui_scale.h"
#include <algorithm>
namespace moon::editor {
ToolPropertyPopup::ToolPropertyPopup(const Skin& skin,const PixelFont& font,std::u32string title)

    :PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),skin_(skin),font_(font),title_(std::move(title)) {setAutoRemap(false);setWantFocus(false);}

void ToolPropertyPopup::place(ui::Widget* widget,gfx::Rect rect) {addChild(widget);controls_.push_back({widget,rect});widget->setBounds(uiPhysical(rect).offset(bounds().origin()));}

void ToolPropertyPopup::onResize(ui::ResizeEvent& ev) {setBoundsQuietly(ev.bounds());for(auto& item:controls_)item.first->setBounds(uiPhysical(item.second).offset(bounds().origin()));}

gfx::Size ToolPropertyPopup::minimumDialogSize(int)const {int w=font_.measure(title_)+12,h=title_.empty()?12:DialogLayout::bodyTop+6;for(const auto& item:controls_){w=std::max(w,item.second.x2()+6);h=std::max(h,item.second.y2()+6);}return {w*uiScale,h*uiScale};}

void ToolPropertyPopup::paintDialogContents(ui::PaintEvent& ev) {auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());if(!title_.empty())drawDialogTitle(font_,g,r,title_);}
}
