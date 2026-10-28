#pragma once
#include "document.h"
#include "canvas_view.h"
#include "gfx/point.h"
#include "ui/message.h"
#include <chrono>

namespace moon::editor {
struct BrushFeedbackState {
  BrushOptions brushProfiles_[2];
  bool brushPreviewBatch_=true;
  struct BrushOutlinePixel {int x,y;unsigned edges;};
  std::vector<BrushOutlinePixel> eraserOutline_;
  int eraserOutlineSize_=0;BrushShape eraserOutlineShape_=BrushShape::Round;
  struct BrushLineAnchor {Point point;std::uint64_t identity,revision;std::string layer,frame;mutable std::unordered_map<std::size_t,Pixel> baseline;bool mergeWithNext=true;mutable std::vector<std::pair<std::size_t,Pixel>> baselinePoints;};
  std::optional<BrushLineAnchor> brushLineAnchors_[2];
  Point brushStrokeLast_{};gfx::Point brushStrokePointer_{};
  struct ModifierBrushSize {gfx::Point start;int size;bool pressed=false;};
  std::optional<ModifierBrushSize> modifierBrushSize_;
  bool brushPreferencesPending_=false;
  std::chrono::steady_clock::time_point brushPreferencesDue_{};
  unsigned brushPreferenceWrites_=0,toolOptionsLayouts_=0;
  bool modifierCtrl_=false,modifierAlt_=false;
  bool brushPreviewShift_=false;
};
struct CanvasNavigationState {
  CanvasPan pan_;
  ui::MouseButton panButton_=ui::kButtonNone;
  bool panBlit_=true;
  unsigned canvasBlitMoves_=0;
  std::uint64_t canvasPanRepaintPixels_=0;
  bool zoomTool_=false,zoomDragging_=false,zoomSmooth_=false;
  gfx::Point zoomStartPointer_;double zoomStartScale_=8;ui::MouseButton zoomButton_=ui::kButtonLeft;
};
}
