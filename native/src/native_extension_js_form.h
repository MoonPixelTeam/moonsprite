#pragma once
#include "extension_js_forms.h"
#include "extension_form_window.h"
#include "modal_geometry_preferences.h"
namespace moon {
class NativeJsForm final:public extension::JsFormPresentation {
 Skin icons_;std::unique_ptr<extension::FormWindow> window_;
 ModalGeometryPreferences geometry_;gfx::Rect observed_,area_;bool closed_=false;
 void remember(){if(closed_||!window_->display())return;const auto box=window_->bounds();if(box.size()!=observed_.size())geometry_.resized();observed_=box;area_=window_->display()->bounds();geometry_.remember(box,area_);}
public:
 NativeJsForm(const PixelFont& font,const Skin& skin,const std::filesystem::path& assets,ui::Display* display,const std::filesystem::path& storage,const std::string& extensionId,const extension::WindowDefinition& definition,extension::JsFormCallbacks callbacks):geometry_(storage/"extension-dialog-geometry.json","extension-dialog:"+extensionId+":"+winrt::to_string(definition.id)){
  for(const auto suffix:{"","-disabled"})icons_.assets.patches[std::string("close")+suffix]=importSkinPng(assets/"utility-icons"/(std::string("close")+suffix+".png"),32);
  icons_.assets.patches["check"]=importSkinPng(assets/"utility-icons"/"check.png",32);
  window_=std::make_unique<extension::FormWindow>(font,skin,icons_,unicodeText(winrt::to_string(definition.title)),std::move(callbacks.send),std::move(callbacks.close),std::move(callbacks.restart));
  window_->configurePromptGeometry(storage/"extension-form-prompts.json",winrt::to_hstring(extensionId).c_str());window_->setDisplay(display,false);area_=display->bounds();
  const int w=std::min(560*uiScale,std::max(1,area_.w-24*uiScale)),h=std::min(600*uiScale,std::max(1,area_.h-24*uiScale));
  auto box=geometry_.restore({area_.x+(area_.w-w)/2,area_.y+(area_.h-h)/2,w,h},area_,{360*uiScale,300*uiScale},{area_.w,area_.h});
  // This root form is a fixed-height ModalShell; all later resizes persist.
  geometry_.resized();window_->setBounds(box);observed_=window_->bounds();window_->openWindow();
 }
 ~NativeJsForm()override{close();}
 void receive(const extension::WindowValue& view)override{window_->receive(view,window_->sessionGeneration());}
 void failure(const std::string& error)override{window_->loadFailed(winrt::to_hstring(error).c_str());}
 void pump()override{
  if(closed_)return;const auto next=window_->display()->bounds();if(area_!=next){const auto box=window_->bounds();auto remap=panels::resizeFloatingPosition({box.x,box.y,box.w,box.h},{area_.x,area_.y,area_.w,area_.h},{next.x,next.y,next.w,next.h});window_->setBounds({remap.x,remap.y,std::min(remap.w,std::max(1,next.w-24*uiScale)),std::min(remap.h,std::max(1,next.h-24*uiScale))});area_=next;}
  window_->pump();if(!ui::Manager::getDefault()->getCapture())remember();geometry_.pump();
 }
 void close()override{if(closed_)return;remember();geometry_.flush();window_->closeFromHost();closed_=true;}
};
}
