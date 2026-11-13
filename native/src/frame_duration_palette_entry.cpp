#include "frame_duration_palette_entry.h"
#include "ui/message.h"
namespace moon::editor {
bool FrameDurationPaletteEntry::onProcessMessage(ui::Message* msg) {

    if(!durationMode)return PixelEntry::onProcessMessage(msg);

    if(msg->type()==ui::kKeyDownMessage){const auto code=static_cast<ui::KeyMessage*>(msg)->scancode();

      if(code==ui::kKeyEnter){const auto draft=text();const bool expression=draft.size()>1&&draft.find_first_of("+-*/()",1)!=std::string::npos;if(durationCommit)durationCommit();if(!expression){durationMode=false;if(accept)accept();}return true;}

      if(code==ui::kKeyEsc){durationMode=false;if(cancel)cancel();return true;}

      if(code==ui::kKeyUp||code==ui::kKeyDown)return ui::Entry::onProcessMessage(msg);

    }

    if(msg->type()==ui::kFocusLeaveMessage){if(durationCommit)durationCommit();invalidate();return ui::Entry::onProcessMessage(msg);}

    if(msg->type()==ui::kMouseWheelMessage&&isEnabled()&&!isReadOnly()){auto mouse=static_cast<ui::MouseMessage*>(msg);if(!mouse->ctrlPressed()&&!mouse->cmdPressed()&&mouse->wheelDelta().y){if(durationWheel)durationWheel(mouse->wheelDelta().y<0?1:-1);return true;}}

    return PixelEntry::onProcessMessage(msg);

  }
}
