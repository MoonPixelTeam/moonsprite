#pragma once
#include "native_widgets.h"
namespace moon {
// View-only timeline state. Shared buttons know neither Cel metadata nor the
// timeline parent paint cache. Input continues through generic pointer hooks.
class TimelineButton : public PixelButton {
public:
  std::optional<std::uint32_t> timelineDisplayColor;
  std::vector<std::optional<std::uint32_t>> timelineAncestorColors;
  inline static constexpr int timelineIndentWidth=12;
  bool timelineCel=false;
  bool timelineSelected=false;
  bool timelineBackgroundHover=false;
  bool timelineParentPainted=false,timelineVisible=false;
  int timelineCaptionPadding=0;
  os::SurfaceRef timelineImage;
  std::string timelineImageKey;
  std::function<void()> cancelTimelineImage;
  ~TimelineButton(){if(cancelTimelineImage)cancelTimelineImage();}
  // Visible next row closes only the colored ancestor bands that end here.
  int timelineNextRowDepth=0;
  using PixelButton::PixelButton;
  void paintTimelineContent(ui::Graphics& g,gfx::Rect rc,gfx::Point physicalOffset={});
  void onPaint(ui::PaintEvent& ev) override;
};
}
