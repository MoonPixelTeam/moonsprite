#pragma once
#include "extension_diagnostics.h"
#include <map>
#include <set>
#include <optional>
#include <cmath>
#include <climits>
#include <algorithm>
#include <exception>
namespace moon::extension {
using WindowObject=winrt::Windows::Data::Json::JsonObject;
using WindowValue=winrt::Windows::Data::Json::IJsonValue;
struct WindowDefinition {
 std::wstring id,resource,presentation,title;double x=32,y=72,width=256,height=256;
 bool transparent=true,focusable=false,visible=true,form=false;
};
// All callbacks belong to the event thread. open must either succeed or leave
// the previous presentation intact; the state is published only after success.
struct WindowServices {
 std::function<void(const WindowDefinition&)> open;
 std::function<void(const WindowDefinition&)> close;
 std::function<void(const WindowDefinition&,bool)> visible;
 std::function<void(const WindowDefinition&,const WindowValue&)> message;
};
class WindowRouter {
 WindowServices services_;std::map<std::wstring,WindowDefinition> overlays_,native_;std::optional<WindowDefinition> dialog_;std::set<std::wstring> embedded_;
 std::set<std::wstring> resources_;std::wstring name_;bool active_=true;
 static std::wstring string(const WindowObject& p,const wchar_t* key){using namespace winrt::Windows::Data::Json;if(!p.HasKey(key)||p.GetNamedValue(key).ValueType()!=JsonValueType::String)throw std::invalid_argument("窗口参数必须是字符串。");return std::wstring(p.GetNamedString(key));}
 static bool truthy(const WindowValue& v){using namespace winrt::Windows::Data::Json;if(!v||v.ValueType()==JsonValueType::Null)return false;if(v.ValueType()==JsonValueType::Boolean)return v.GetBoolean();if(v.ValueType()==JsonValueType::Number)return v.GetNumber()!=0;if(v.ValueType()==JsonValueType::String)return !v.GetString().empty();return true;}
 static double number(const WindowObject& p,const wchar_t* key,double fallback,bool overlay){using namespace winrt::Windows::Data::Json;if(!p.HasKey(key)||p.GetNamedValue(key).ValueType()==JsonValueType::Null)return fallback;const auto value=p.GetNamedValue(key);if(value.ValueType()!=JsonValueType::Number){if(overlay)throw std::invalid_argument("覆盖层边界无效。");return fallback;}const auto n=value.GetNumber();if(!std::isfinite(n))throw std::invalid_argument("窗口边界无效。");return overlay?n:std::floor(n+.5);}
 void connected()const{if(!active_)throw std::runtime_error("Extension windows are inactive");if(!services_.open||!services_.close||!services_.visible||!services_.message)throw std::runtime_error("Native extension window presentation is not connected");}
public:
 WindowRouter(std::wstring name,std::set<std::wstring> resources,WindowServices services):services_(std::move(services)),resources_(std::move(resources)),name_(std::move(name)){}
 ~WindowRouter(){try{deactivate();}catch(...){}}
 WindowRouter(const WindowRouter&)=delete;WindowRouter& operator=(const WindowRouter&)=delete;
 bool handles(const std::string& method)const{return method=="windows.open"||method=="windows.close"||method=="windows.setVisible"||method=="windows.postMessage";}
 void request(const std::string& method,const WindowObject& params){
  using namespace winrt::Windows::Data::Json;connected();
  const auto rawId=params.HasKey(L"windowId")?params.GetNamedValue(L"windowId"):WindowValue{nullptr};
  const auto id=rawId&&rawId.ValueType()==JsonValueType::String?std::wstring(rawId.GetString()):std::wstring{};
  if(method=="windows.open"){
   WindowDefinition next;next.id=string(params,L"windowId");next.resource=string(params,L"resourceId");
   if(!resources_.count(next.resource))throw std::invalid_argument("扩展窗口资源不存在。");
   WindowObject options;if(params.HasKey(L"options")&&params.GetNamedValue(L"options").ValueType()==JsonValueType::Object)options=params.GetNamedObject(L"options");
   next.presentation=options.HasKey(L"presentation")&&options.GetNamedValue(L"presentation").ValueType()==JsonValueType::String?std::wstring(options.GetNamedString(L"presentation")):L"native";
   if(next.presentation==L"overlay"){
    if(dialog_&&dialog_->id==next.id)throw std::invalid_argument("窗口 ID 已用于弹窗。");
    if(!overlays_.count(next.id)&&overlays_.size()>=16)throw std::length_error("覆盖层数量已达上限。");
    next.x=number(options,L"x",32,true);next.y=number(options,L"y",72,true);next.width=number(options,L"width",256,true);next.height=number(options,L"height",256,true);
    if(std::abs(next.x)>32768||std::abs(next.y)>32768||next.width<1||next.height<1||next.width>8192||next.height>8192)throw std::invalid_argument("覆盖层边界无效。");
    services_.open(next);overlays_[next.id]=next;embedded_.insert(next.id);return;
   }
   if(overlays_.count(next.id))throw std::invalid_argument("窗口 ID 已用于覆盖层。");
   if(next.presentation==L"dialog"){
    const auto title=options.HasKey(L"title")?options.GetNamedValue(L"title"):WindowValue{nullptr};next.title=truthy(title)?diagnosticString(title):name_;next.form=options.HasKey(L"component")&&options.GetNamedValue(L"component").ValueType()==JsonValueType::String&&options.GetNamedString(L"component")==L"form";
    services_.open(next);dialog_=next;embedded_.insert(next.id);return;
   }
   next.presentation=L"native";
   if(next.id.empty()||next.id.size()>80||!std::all_of(next.id.begin(),next.id.end(),[](wchar_t c){return (c>=L'a'&&c<=L'z')||(c>=L'A'&&c<=L'Z')||(c>=L'0'&&c<=L'9')||c==L'.'||c==L'-'||c==L'_';}))throw std::invalid_argument("扩展窗口 ID 无效。");
   next.x=number(options,L"x",32,false);next.y=number(options,L"y",72,false);next.width=number(options,L"width",256,false);next.height=number(options,L"height",256,false);
   if(next.x<INT_MIN||next.x>INT_MAX||next.y<INT_MIN||next.y>INT_MAX||next.width<32||next.width>2048||next.height<32||next.height>2048)throw std::invalid_argument("扩展窗口尺寸必须在 32 至 2048 像素之间。");
   next.transparent=!options.HasKey(L"transparent")||options.GetNamedValue(L"transparent").ValueType()!=JsonValueType::Boolean||options.GetNamedBoolean(L"transparent");next.focusable=options.HasKey(L"focusable")&&options.GetNamedValue(L"focusable").ValueType()==JsonValueType::Boolean&&options.GetNamedBoolean(L"focusable");
   // Legacy reuses an existing native window's resource and creation flags.
   if(auto found=native_.find(next.id);found!=native_.end()){next.resource=found->second.resource;next.transparent=found->second.transparent;next.focusable=found->second.focusable;}
   services_.open(next);native_[next.id]=next;return;
  }
  auto overlay=overlays_.find(id);
  if(method=="windows.postMessage"){
   const auto message=params.HasKey(L"message")?params.GetNamedValue(L"message"):WindowValue{nullptr};
   if(overlay!=overlays_.end()||(dialog_&&dialog_->id==id)){services_.message(overlay!=overlays_.end()?overlay->second:*dialog_,message);return;}
   if(embedded_.count(diagnosticString(rawId)))return;
   const auto target=string(params,L"windowId");if(!native_.count(target))throw std::invalid_argument("扩展窗口不存在。");services_.message(native_.at(target),message);return;
  }
  if(method=="windows.setVisible"){
   if(!params.HasKey(L"visible")||params.GetNamedValue(L"visible").ValueType()!=JsonValueType::Boolean)throw std::invalid_argument("窗口显示状态无效。");
   const auto target=string(params,L"windowId");const bool visible=params.GetNamedBoolean(L"visible");if(overlay==overlays_.end()&&!native_.count(target))throw std::invalid_argument("扩展窗口不存在。");services_.visible(overlay!=overlays_.end()?overlay->second:native_.at(target),visible);if(overlay!=overlays_.end())overlay->second.visible=visible;else native_.at(target).visible=visible;return;
  }
  if(method=="windows.close"){
   if(overlay!=overlays_.end()){services_.close(overlay->second);overlays_.erase(overlay);return;}
   if(!truthy(rawId)){for(auto it=overlays_.begin();it!=overlays_.end();){services_.close(it->second);it=overlays_.erase(it);}}
   if(dialog_&&(!truthy(rawId)||dialog_->id==id)){services_.close(*dialog_);dialog_.reset();if(truthy(rawId))return;}
   if(rawId&&rawId.ValueType()==JsonValueType::String){if(auto found=native_.find(id);found!=native_.end()){services_.close(found->second);native_.erase(found);}}else{for(auto it=native_.begin();it!=native_.end();){services_.close(it->second);it=native_.erase(it);}}return;
  }
  throw std::invalid_argument("Unknown extension window method");
 }
 void deactivate(){if(!active_)return;active_=false;std::exception_ptr failure;auto close=[&](const auto& id){try{if(services_.close)services_.close(id);}catch(...){if(!failure)failure=std::current_exception();}};for(const auto& p:overlays_)close(p.second);if(dialog_)close(*dialog_);for(const auto& p:native_)close(p.second);overlays_.clear();dialog_.reset();native_.clear();embedded_.clear();if(failure)std::rethrow_exception(failure);}
 const auto& overlays()const{return overlays_;}const auto& dialog()const{return dialog_;}const auto& native()const{return native_;}
};
}
