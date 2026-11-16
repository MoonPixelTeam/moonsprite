#pragma once
#include "native_widgets.h"

namespace moon {
// A pointer-transparent status layer. Each intersecting control paints the same
// layer after its own content, so no overlay widget steals focus or mouse input.
class PixelStatusToast {
  const PixelFont& font_;const Skin& skin_;
public:
  std::u32string text;
  gfx::Rect bounds;
  PixelStatusToast(const PixelFont& font,const Skin& skin):font_(font),skin_(skin){}
  void place(gfx::Rect anchor,gfx::Rect frame){
    const int width=(font_.measure(text)+2*UiSpacing::padding)*uiScale;
    const int height=(UiSpacing::labelHeight+2*UiSpacing::related)*uiScale;
    bounds={std::clamp(anchor.x2()-width,frame.x,std::max(frame.x,frame.x2()-width)),
            anchor.y2()+UiSpacing::related*uiScale,std::min(width,frame.w),height};
  }
  void paint(ui::Graphics& g,gfx::Point origin)const{
    if(text.empty()||bounds.isEmpty())return;
    const auto physical=gfx::Rect(bounds).offset(-origin);
    PhysicalViewportClip clip(g,physical);
    UiPaintScale scale(g,physical.origin());const auto r=uiLogical(gfx::Rect(physical.size()));
    g.fillRect(skin_["panel"],r);g.drawRect(skin_["accent"],r);
    font_.draw(g,text,UiSpacing::padding,UiSpacing::related,skin_["text"]);
  }
};
template<class Control> class StatusToastControl:public Control {
  const PixelStatusToast& toast_;
protected:
  const PixelStatusToast& toast()const{return toast_;}
public:
  template<class... Args> StatusToastControl(const PixelStatusToast& toast,Args&&... args)
    :Control(std::forward<Args>(args)...),toast_(toast){}
  void onPaint(ui::PaintEvent& ev)override{
    Control::onPaint(ev);toast_.paint(*ev.graphics(),this->bounds().origin());
  }
};
}
