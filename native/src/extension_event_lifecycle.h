#pragma once
#include "extension_runtime.h"
namespace moon::extension {
// ExtensionRuntimeHost send/sendAuthorized and onLoad, without HTML transport.
class EventLifecycle {
 std::vector<std::string> permissions_;std::function<void(const RuntimeEvent&)> deliver_;std::function<void()> full_;std::vector<RuntimeEvent> pending_;bool loaded_=false,failed_=false,active_=true;std::string locale_;
 bool has(const char* permission)const{return std::find(permissions_.begin(),permissions_.end(),permission)!=permissions_.end();}
 bool allowed(const std::string& type)const{
  if(type=="activate"||type=="deactivate")return true;
  if(type=="locale-changed")return has("runtime");if(type=="project")return has("workspace.read");if(type=="command")return has("commands");if(type=="settings-changed")return has("storage");if(type=="window-message")return has("windows");if(type=="files-dropped")return has("io");
  return (type=="editor-event"||type=="interaction"||type=="clock"||type=="document-saved"||type=="export-complete")&&has("events");
 }
 void send(const RuntimeEvent& event){
  if(!active_)return;if(loaded_){deliver_(event);return;}if(failed_)return;
  if(event.type=="settings-changed")pending_.erase(std::remove_if(pending_.begin(),pending_.end(),[](const auto& e){return e.type=="settings-changed";}),pending_.end());
  if(pending_.size()>=256){if(full_)full_();return;}
  if(event.type=="command"||event.type=="settings-changed")pending_.push_back(event);
 }
public:
 EventLifecycle(std::vector<std::string> permissions,std::string initialLocale,std::function<void(const RuntimeEvent&)> deliver,std::function<void()> full={}):permissions_(std::move(permissions)),deliver_(std::move(deliver)),full_(std::move(full)),locale_(std::move(initialLocale)){}
 void event(const RuntimeEvent& value){if(allowed(value.type))send(value);}
 void loadFailed(){failed_=true;pending_.clear();}
 void loaded(const std::string& extensionId,const std::string& locale,const RuntimeEvent& project){
  if(!active_)return;loaded_=true;RuntimeEvent language;language.type="locale-changed";language.locale=locale;event(language);
  RuntimeEvent activate;activate.type="activate";activate.extensionId=extensionId;activate.apiVersion="1.0.0";send(activate);event(project);
  auto pending=std::move(pending_);pending_.clear();for(const auto& value:pending)event(value);
 }
 void localeChanged(const std::string& locale){if(locale==locale_)return;locale_=locale;RuntimeEvent value;value.type="locale-changed";value.locale=locale;event(value);}
 void deactivate(){if(!active_)return;const bool deliver=loaded_;active_=false;loaded_=false;pending_.clear();if(deliver){RuntimeEvent value;value.type="deactivate";deliver_(value);}}
 std::size_t pendingCount()const{return pending_.size();}
};
}
