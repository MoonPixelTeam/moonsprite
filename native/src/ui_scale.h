#pragma once
#include "ui/graphics.h"
#include "gfx/matrix.h"

namespace moon {
// Legacy separates interface scale from the canvas device-pixel backing store.
// Keep widget bounds/input physical; only pixel skin/font painting uses 2x.
constexpr int uiScale=2;
// User spacing contract: 2 base pixels, 4 device pixels at the default 2x.
constexpr int uiGap=2;
inline gfx::Rect uiLogical(gfx::Rect r) {return {r.x/uiScale,r.y/uiScale,r.w/uiScale,r.h/uiScale};}
inline gfx::Rect uiPhysical(gfx::Rect r) {return {r.x*uiScale,r.y*uiScale,r.w*uiScale,r.h*uiScale};}
// Always subtract the physical origin before scaling input. Odd client origins
// must not be rounded into the logical layout or applied twice.
inline gfx::Point uiLocalPoint(gfx::Point display,gfx::Point origin){return {(display.x-origin.x)/uiScale,(display.y-origin.y)/uiScale};}
inline gfx::Rect uiDisplayRect(gfx::Rect local,gfx::Point origin){return uiPhysical(local).offset(origin);}
class UiPaintScale {
  ui::Graphics& graphics_;
  gfx::Rect dirty_;
public:
  explicit UiPaintScale(ui::Graphics& g,gfx::Point offset={}):graphics_(g),dirty_(g.getClipBounds()) {
    g.save();
    g.concat(gfx::Matrix::MakeAll(uiScale,0,offset.x+(1-uiScale)*g.getInternalDeltaX(),
                                0,uiScale,offset.y+(1-uiScale)*g.getInternalDeltaY(),0,0,1));
  }
  ~UiPaintScale() {graphics_.restore();graphics_.invalidate(dirty_);}
  UiPaintScale(const UiPaintScale&)=delete;
  UiPaintScale& operator=(const UiPaintScale&)=delete;
};
}
