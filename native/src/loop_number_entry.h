#pragma once
#include "native_widgets.h"
namespace moon::editor {
class LoopNumberEntry final:public PixelEntry {

public:

  double minimum=1,maximum=9999,value=1;

  std::function<void()> committed;

  using PixelEntry::PixelEntry;
  void setValue(double next);
  void updateLiveValue();
  bool commitValue();
  bool onProcessMessage(ui::Message* msg)override;

};
}
