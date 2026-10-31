#pragma once
#include "ui/clipboard_delegate.h"
#include "ui/system.h"
#include "clip/clip.h"
#include <functional>
#include <exception>
#include <utility>

namespace moon {
// Legacy DOM inputs use the browser clipboard. Bridge MIT UI's existing
// delegate to the same clip backend already used by native palette actions.
class NativeTextClipboard final : public ui::ClipboardDelegate {
public:
 using Writer=std::function<bool(const std::string&)>;
 using Reader=std::function<bool(std::string&)>;
 using Available=std::function<bool()>;
 NativeTextClipboard(ui::UISystem& system,Writer write=clip::set_text,
                     Reader read=clip::get_text,
                     Available available=[] {return clip::has(clip::text_format());})
  :system_(system),previous_(system.clipboardDelegate()),write_(std::move(write)),
   read_(std::move(read)),available_(std::move(available)){system_.setClipboardDelegate(this);}
 ~NativeTextClipboard() override {system_.setClipboardDelegate(previous_);}
 NativeTextClipboard(const NativeTextClipboard&)=delete;
 NativeTextClipboard& operator=(const NativeTextClipboard&)=delete;
 bool trySetClipboardText(const std::string& text){
  // Windows/browser plain text uses CRLF; do not double existing CRLF.
  std::string normalized;normalized.reserve(text.size());
  for(std::size_t i=0;i<text.size();++i){
   if(text[i]=='\r'||text[i]=='\n'){
    normalized+="\r\n";if(text[i]=='\r'&&i+1<text.size()&&text[i+1]=='\n')++i;
   }else normalized+=text[i];
  }
  try {return write_(normalized);}catch(const std::exception&){return false;}
 }
 void setClipboardText(const std::string& text) override {trySetClipboardText(text);}
 bool getClipboardText(std::string& text) override {try {return read_(text);}catch(const std::exception&){return false;}}
 bool hasClipboardText() override {try {return available_();}catch(const std::exception&){return false;}}
private:
 ui::UISystem& system_;ui::ClipboardDelegate* previous_;
 Writer write_;Reader read_;Available available_;
};

inline bool trySetInputClipboardText(const std::string& text){
 auto delegate=ui::UISystem::instance()->clipboardDelegate();
 if(auto native=dynamic_cast<NativeTextClipboard*>(delegate))return native->trySetClipboardText(text);
 if(!delegate)return false;
 delegate->setClipboardText(text);return true;
}
}
