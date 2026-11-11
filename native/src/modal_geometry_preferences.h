#pragma once
#include "extension_form_files.h"
#include "panel_docking.h"
#include "native_widgets.h"
namespace moon {
// ModalShell/useFloatingPanel persistence. Geometry is logical/display-relative;
// an omitted height retains fit-content across reopen and content changes.
class ModalGeometryPreferences {
 using Object=winrt::Windows::Data::Json::JsonObject;
 using Json=winrt::Windows::Data::Json::JsonValue;
 struct Pending {std::string encoded;std::shared_future<void> task;};
 static std::map<std::filesystem::path,Pending>& pending(){static std::map<std::filesystem::path,Pending> snapshots;return snapshots;}
 std::filesystem::path path_;std::wstring key_;Object values_;std::shared_future<void> write_;
 bool dirty_=false,explicitHeight_=false;std::string error_;
 std::optional<gfx::Rect> remembered_;gfx::Rect rememberedArea_;bool rememberedExplicit_=false;
public:
 ModalGeometryPreferences(std::filesystem::path path,std::string key):path_(std::move(path)),key_(winrt::to_hstring("moonsprite.modal."+key).c_str()){
  // A modal may reopen before the accepted final FIFO write reaches disk.
  // Reuse its exact pending snapshot without waiting for the worker.
  if(auto found=pending().find(path_);found!=pending().end()){if(found->second.task.wait_for(std::chrono::seconds(0))!=std::future_status::ready){values_=Object::Parse(winrt::to_hstring(found->second.encoded));return;}pending().erase(found);}
  try{std::ifstream input(path_,std::ios::binary|std::ios::ate);if(!input)return;const auto size=input.tellg();if(size<0||size>1024*1024)return;std::string bytes(std::size_t(size),'\0');input.seekg(0);if(input.read(bytes.data(),bytes.size()))values_=Object::Parse(winrt::to_hstring(bytes));}catch(...){values_=Object{};}
 }
 ~ModalGeometryPreferences(){flush();}
 bool explicitHeight()const{return explicitHeight_;}
 void resized(){explicitHeight_=true;}
 const std::string& error()const{return error_;}
 bool writing()const{return dirty_||write_.valid();}
 gfx::Rect restore(gfx::Rect fallback,gfx::Rect area,gfx::Size minimum,gfx::Size maximum){
  explicitHeight_=false;if(!values_.HasKey(key_))return fallback;
  try{const auto saved=values_.GetNamedObject(key_);auto number=[&](const wchar_t* name,double defaultValue){const auto value=saved.GetNamedNumber(name,defaultValue);if(!std::isfinite(value)||std::abs(value)>1000000)throw std::runtime_error("Invalid modal geometry");return int(value);};
   const int vw=std::max(1,area.w/uiScale),vh=std::max(1,area.h/uiScale);
   const auto bounded=[](int value,int low,int high){return std::min(std::max(1,high),std::max(low,value));};
   int w=number(L"width",fallback.w/uiScale),h=number(L"height",fallback.h/uiScale);explicitHeight_=saved.HasKey(L"height");
   if(w>vw*1.25)w=fallback.w/uiScale;if(h>vh*1.25)h=fallback.h/uiScale;
   w=bounded(w,minimum.w/uiScale,std::min(vw-24,maximum.w/uiScale));h=bounded(h,minimum.h/uiScale,std::min(vh-24,maximum.h/uiScale));
   auto remapped=panels::resizeFloatingPosition({number(L"x",double(fallback.x-area.x)/uiScale),number(L"y",double(fallback.y-area.y)/uiScale),w,h},{0,0,std::max(1,number(L"viewportWidth",vw)),std::max(1,number(L"viewportHeight",vh))},{0,0,vw,vh});
   return {area.x+remapped.x*uiScale,area.y+remapped.y*uiScale,w*uiScale,h*uiScale};
  }catch(...){explicitHeight_=false;return fallback;}
 }
 void remember(gfx::Rect box,gfx::Rect area){if(path_.empty()||box.isEmpty()||area.isEmpty())return;if(remembered_&&*remembered_==box&&rememberedArea_==area&&rememberedExplicit_==explicitHeight_)return;remembered_=box;rememberedArea_=area;rememberedExplicit_=explicitHeight_;Object value;auto number=[&](const wchar_t* name,int n){value.Insert(name,Json::CreateNumberValue(double(n)/uiScale));};number(L"x",box.x-area.x);number(L"y",box.y-area.y);number(L"width",box.w);if(explicitHeight_)number(L"height",box.h);number(L"viewportWidth",area.w);number(L"viewportHeight",area.h);if(!values_.HasKey(key_)||values_.GetNamedValue(key_).Stringify()!=value.Stringify()){values_.Insert(key_,value);dirty_=true;}}
 void flush(){if(!dirty_||path_.empty())return;try{auto text=winrt::to_string(values_.Stringify());write_=extension::startFormFileWrite(path_,{text.begin(),text.end()}).share();pending()[path_]={std::move(text),write_};dirty_=false;}catch(const std::exception& e){dirty_=false;error_=e.what();}catch(...){dirty_=false;error_="Modal geometry save failed";}}
 void pump(){if(write_.valid()){if(write_.wait_for(std::chrono::seconds(0))!=std::future_status::ready)return;try{write_.get();error_.clear();}catch(const std::exception& e){error_=e.what();}catch(...){error_="Modal geometry save failed";}write_={};}flush();}
};
}
