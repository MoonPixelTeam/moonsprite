#pragma once
#include "native_widgets.h"
#include "quick_command_preferences.h"
#include "ui/tooltips.h"
namespace moon {
class QuickCommandBar : public ui::Widget {
 class Control;
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;
 std::vector<Control*> controls_;ui::TooltipManager* tips_;
 quick::Bar bar_;gfx::Rect viewport_;bool translucent_=false,moving_=false;
 quick::Drag drag_{quick::Edge::Top,0};
 void layoutControls();
public:
 std::function<void(const quick::Bar&)> changed;
 std::function<void(const std::string&,bool)> execute;
 std::function<bool(const std::string&)> enabled,checked;
 std::function<void()> settings;
 QuickCommandBar(const PixelFont&,const Skin&,const Skin&);
 void sync(const quick::Bar&,gfx::Rect viewport,bool translucent,bool interactive);
 void onPaint(ui::PaintEvent&) override;
 void smoke();
};
}
