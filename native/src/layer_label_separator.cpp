#include "layer_label_separator.h"
namespace moon::editor {
LayerLabelSeparator::LayerLabelSeparator():ui::Widget(ui::kGenericWidget) {setFocusStop(true);setTransparent(true);}

bool LayerLabelSeparator::onProcessMessage(ui::Message* msg) {return (process && process(msg)) || ui::Widget::onProcessMessage(msg);}
}
