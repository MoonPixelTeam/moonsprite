#pragma once
#include "native_widgets.h"
namespace moon::editor {
class FrameDurationPaletteEntry final:public PixelEntry {

public:

  using PixelEntry::PixelEntry;

  bool durationMode=false;

  std::function<void()> durationCommit;

  std::function<void(int)> durationWheel;
  bool onProcessMessage(ui::Message* msg)override;

};
}
