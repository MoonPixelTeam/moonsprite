#pragma once
#include "native_widgets.h"
#include "ui/message.h"
namespace moon {
// Shared adapter for the browser-provided edit popup of legacy input/textarea.
// Keep the MIT menu loop and MoonSprite skin; Escape cancels only this popup.
class PixelInputMenu final : public PixelMenu {
public:
 explicit PixelInputMenu(const Skin& skin):PixelMenu(skin){}
 bool onProcessMessage(ui::Message* msg) override {
  if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){
   if(auto popup=window())popup->closeWindow(nullptr);
   return true;
  }
  return PixelMenu::onProcessMessage(msg);
 }
};
}
