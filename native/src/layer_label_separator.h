#pragma once
#include "ui/widget.h"
#include <functional>
namespace moon::editor {
class LayerLabelSeparator final : public ui::Widget {

public:

  std::function<bool(ui::Message*)> process;
  LayerLabelSeparator();
  bool onProcessMessage(ui::Message* msg) override;

};
}
