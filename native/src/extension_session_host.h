#pragma once
#include "extension_event_lifecycle.h"
#include "extension_editor_events.h"
#include "extension_request_host.h"
#include "extension_project_events.h"
#include "extension_interaction_events.h"
#include "extension_network.h"
#include <map>
#include <exception>
namespace moon::extension {
// Own one event-thread session per extension. Stop the previous session before
// publishing its replacement so its cleanup cannot erase new file-drop types.
class SessionHost {
 struct Session {
  std::string id,locale;std::uint64_t generation;bool active=true;
  bool editorEventsAllowed=false;std::shared_ptr<EditorEventSubscription> editorSubscription;
  std::shared_ptr<InteractionEvents> interactions;
  std::shared_ptr<ProjectEventSubscription> projectSubscription;
  std::vector<NetworkTask> network;
  EventLifecycle events;RequestHost requests;RuntimeRegistry::Stop unregister;
  Session(std::string identity,std::uint64_t value,RuntimeExtension extension,const std::vector<std::string>& permissions,std::string language,Storage& storage,FileDropRouter& drops,RuntimeRegistry& registry,std::function<void(const RuntimeEvent&)> deliver,CommandHandlers handlers,std::vector<RuntimeCommand> commands):id(std::move(identity)),locale(std::move(language)),generation(value),editorEventsAllowed(std::find(permissions.begin(),permissions.end(),"events")!=permissions.end()),events(permissions,locale,std::move(deliver)),requests(std::move(extension),permissions,storage,drops,registry,std::move(handlers),std::move(commands)){}
  void stop(){if(!active)return;active=false;for(auto& task:network)task.cancel();network.clear();editorSubscription.reset();projectSubscription.reset();interactions.reset();std::exception_ptr failure;auto cleanup=[&](auto&& action){try{action();}catch(...){if(!failure)failure=std::current_exception();}};cleanup([&]{unregister();});cleanup([&]{requests.deactivate();});cleanup([&]{events.deactivate();});if(failure)std::rethrow_exception(failure);}
 };
 Storage& storage_;FileDropRouter& drops_;RuntimeRegistry& registry_;std::map<std::string,std::shared_ptr<Session>> sessions_;std::uint64_t next_=0;
 std::shared_ptr<Session> find(const std::string& id,std::uint64_t generation)const{auto it=sessions_.find(id);return it!=sessions_.end()&&it->second->generation==generation&&it->second->active?it->second:nullptr;}
public:
 struct Token {std::string extensionId;std::uint64_t generation=0;};
 SessionHost(Storage& storage,FileDropRouter& drops,RuntimeRegistry& registry):storage_(storage),drops_(drops),registry_(registry){}
 SessionHost(const SessionHost&)=delete;SessionHost& operator=(const SessionHost&)=delete;
 ~SessionHost(){auto sessions=std::move(sessions_);for(auto& p:sessions)try{p.second->stop();}catch(...){} }
 Token open(RuntimeExtension extension,std::vector<std::string> permissions,std::string locale,std::function<void(const RuntimeEvent&)> deliver,CommandHandlers handlers={},std::vector<RuntimeCommand> commands={}){
  if(!extension.enabled)throw std::invalid_argument("Disabled extension session");const auto id=extension.id;
  close(id);auto session=std::make_shared<Session>(id,++next_,std::move(extension),permissions,std::move(locale),storage_,drops_,registry_,std::move(deliver),std::move(handlers),std::move(commands));
  session->unregister=registry_.registerRuntime(id,[weak=std::weak_ptr<Session>(session)](const auto& event){if(auto live=weak.lock();live&&live->active)live->events.event(event);});session->projectSubscription=std::make_shared<ProjectEventSubscription>([weak=std::weak_ptr<Session>(session)](const auto& event){if(auto live=weak.lock();live&&live->active)live->events.event(event);});if(session->editorEventsAllowed)session->interactions=std::make_shared<InteractionEvents>([weak=std::weak_ptr<Session>(session)](const auto& event){if(auto live=weak.lock();live&&live->active)live->events.event(event);});sessions_[id]=session;return {id,session->generation};
 }
 // The application captures the initial scalar snapshot at subscription time.
 bool subscribeEditor(const Token& token,EditorSnapshot baseline){auto s=find(token.extensionId,token.generation);if(!s||!s->editorEventsAllowed)return false;s->editorSubscription=std::make_shared<EditorEventSubscription>(std::move(baseline),[weak=std::weak_ptr<Session>(s)](const auto& event){if(auto live=weak.lock();live&&live->active)live->events.event(event);});return true;}
 void editorChanged(const Token& token,EditorSnapshot next,const std::function<std::int64_t()>& now=editorEventTime){if(auto s=find(token.extensionId,token.generation)){auto subscription=s->editorSubscription;if(subscription)subscription->changed(std::move(next),now);}}
 void colorSampled(const Token& token,std::optional<std::string> projectId={},std::int64_t timestamp=editorEventTime()){if(auto s=find(token.extensionId,token.generation);s&&s->editorEventsAllowed)s->events.event(editorEvent("color.sampled",std::move(projectId),{},timestamp));}
 void projectChanged(const Token& token,std::optional<ProjectSummary> project,bool homeOpen){if(auto s=find(token.extensionId,token.generation)){auto subscription=s->projectSubscription;if(subscription)subscription->changed(std::move(project),homeOpen);}}
 void pointerInteraction(const Token& token,std::int64_t now=editorEventTime()){if(auto s=find(token.extensionId,token.generation)){auto source=s->interactions;if(source)source->pointer(now);}}
 void keyboardInteraction(const Token& token){if(auto s=find(token.extensionId,token.generation)){auto source=s->interactions;if(source)source->keyboard();}}
 void clockTick(const Token& token,std::int64_t now=editorEventTime()){if(auto s=find(token.extensionId,token.generation)){auto source=s->interactions;if(source)source->clock(now);}}
 void setDeclaredMenus(const Token& token,std::vector<std::string> ids){if(auto s=find(token.extensionId,token.generation))s->requests.setDeclaredMenus(std::move(ids));}
 MenuState::Stop subscribePresentation(const Token& token,std::function<void()> callback){if(auto s=find(token.extensionId,token.generation))return s->requests.subscribePresentation(std::move(callback));return []{};}
 std::optional<MenuState> menus(const Token& token)const{if(auto s=find(token.extensionId,token.generation))return s->requests.menus();return {};}
 bool reportCommandState(const Token& token,const winrt::Windows::Data::Json::JsonObject& params){if(auto s=find(token.extensionId,token.generation))return s->requests.reportCommandState(params,true);return false;}
 void setWorkspaceServices(const Token& token,WorkspaceServices services){if(auto s=find(token.extensionId,token.generation))s->requests.setWorkspaceServices(std::move(services));}
 void setDiagnosticServices(const Token& token,DiagnosticServices services){if(auto s=find(token.extensionId,token.generation))s->requests.setDiagnosticServices(std::move(services));}
 void setServices(const Token& token,HostServices services){if(auto s=find(token.extensionId,token.generation))s->requests.setServices(std::move(services));}
 void setResourceReader(const Token& token,std::function<FileDropRouter::Bytes(const std::string&)> reader){if(auto s=find(token.extensionId,token.generation))s->requests.setResourceReader(std::move(reader));}
 void close(const std::string& id){auto it=sessions_.find(id);if(it==sessions_.end())return;auto session=it->second;sessions_.erase(it);session->stop();}
 void close(const Token& token){if(find(token.extensionId,token.generation))close(token.extensionId);}
 void loaded(const Token& token,const RuntimeEvent& project){if(auto s=find(token.extensionId,token.generation))s->events.loaded(s->id,s->locale,project);}
 void loadFailed(const Token& token){if(auto s=find(token.extensionId,token.generation))s->events.loadFailed();}
 void localeChanged(const std::string& locale){std::vector<std::shared_ptr<Session>> snapshot;for(const auto& p:sessions_)snapshot.push_back(p.second);for(const auto& s:snapshot)if(s->active){s->locale=locale;s->events.localeChanged(locale);}}
 std::optional<winrt::Windows::Data::Json::JsonObject> request(const Token& token,const winrt::Windows::Data::Json::IJsonValue& request,std::optional<std::string> encoded={}){if(auto s=find(token.extensionId,token.generation))return s->requests.handle(request,true,s->locale,std::move(encoded),[s](std::wstring id,std::wstring params){s->network.push_back(startNetworkRequest(std::move(id),std::move(params)));});return {};}
 // Call on the event thread; stale generations and disabled sessions never publish.
 std::vector<winrt::Windows::Data::Json::JsonObject> pollResponses(const Token& token){
  std::vector<winrt::Windows::Data::Json::JsonObject> responses;if(auto s=find(token.extensionId,token.generation)){
   for(auto it=s->network.begin();it!=s->network.end();){if(it->response.wait_for(std::chrono::seconds(0))!=std::future_status::ready){++it;continue;}
    responses.push_back(winrt::Windows::Data::Json::JsonObject::Parse(it->response.get()));it=s->network.erase(it);
   }
  }return responses;
 }
 std::vector<std::string> routeFiles(const std::vector<std::string>& paths,const std::function<FileDropRouter::Bytes(const std::string&)>& read,const std::function<void(const std::string&)>& report){return drops_.route(paths,read,[&](const auto& id,const auto& name,const auto& bytes){return registry_.filesDropped(id,name,bytes);},report);}
};
}
