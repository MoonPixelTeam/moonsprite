#pragma once
#include "native_widgets.h"
#include "ui/message.h"
namespace moon {
// Legacy PreferencesDialog pointer drag: preview reorder survives pointercancel;
// cancelling the preferences dialog still discards its entire draft.
class QuickCommandDragHandle : public PixelButton {
 ui::Timer scroll_{16,this};bool dragging_=false;gfx::Point pointer_;
public:
 std::function<void(gfx::Point,bool)> move;
 std::function<gfx::Rect()> viewport;
 QuickCommandDragHandle(const PixelFont& f,const Skin& s,const Skin& icons):PixelButton(f,s,U"",[]{}){
  icon="move";iconSkin=&icons;skinStyle="icon_button";setFocusStop(false);
  scroll_.Tick.connect([this]{if(!dragging_||!hasCapture()){finish();return;}if(move)move(pointer_,true);});
 }
 void finish(){scroll_.stop();dragging_=false;setSelected(false);if(hasCapture())releaseMouse();invalidate();}
 bool onProcessMessage(ui::Message* msg)override{
  if(dragging_&&!hasCapture())finish();
  if(msg->type()==ui::kFocusLeaveMessage){finish();return PixelButton::onProcessMessage(msg);}
  if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc&&dragging_){finish();return true;}
  if(msg->type()==ui::kMouseDownMessage&&isEnabled()){auto m=static_cast<ui::MouseMessage*>(msg);if(!m->left()||!viewport||!viewport().contains(m->position()))return false;pointer_=m->position();dragging_=true;setSelected(true);captureMouse();scroll_.start();invalidate();return true;}
  if(dragging_&&msg->type()==ui::kMouseMoveMessage){pointer_=static_cast<ui::MouseMessage*>(msg)->position();if(move)move(pointer_,false);return true;}
  if(dragging_&&msg->type()==ui::kMouseUpMessage){finish();return true;}
  return PixelButton::onProcessMessage(msg);
 }
};
}
