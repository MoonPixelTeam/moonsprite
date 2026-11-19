#pragma once
#include "extension_js_session.h"
namespace moon::extension {
// Reconciles discovery snapshots; no directory scan runs on idle UI ticks.
class JsRuntimeHost final {
 struct Entry{std::string signature;std::unique_ptr<JsSession> session;};
 Storage storage_;FileDropRouter drops_;RuntimeRegistry registry_;
 std::shared_ptr<SessionHost> host_;std::filesystem::path directory_;
 WorkspaceServices workspace_;HostServices services_;
 std::function<DiagnosticServices(const std::string&)> diagnostics_;
 std::function<void(std::shared_ptr<SessionHost>,const SessionHost::Token&)> bind_;
 std::function<void(const std::string&)> unbind_,report_;std::function<bool()> home_;
 std::map<std::string,Entry> entries_;
public:
 JsRuntimeHost(std::filesystem::path directory,std::filesystem::path storage,WorkspaceServices workspace,HostServices services,std::function<DiagnosticServices(const std::string&)> diagnostics,std::function<void(std::shared_ptr<SessionHost>,const SessionHost::Token&)> bind,std::function<void(const std::string&)> unbind,std::function<void(const std::string&)> report,std::function<bool()> home={}):storage_(std::move(storage)),host_(std::make_shared<SessionHost>(storage_,drops_,registry_)),directory_(std::move(directory)),workspace_(std::move(workspace)),services_(std::move(services)),diagnostics_(std::move(diagnostics)),bind_(std::move(bind)),unbind_(std::move(unbind)),report_(std::move(report)),home_(std::move(home)){}
 ~JsRuntimeHost(){for(auto& entry:entries_){if(unbind_)unbind_(entry.first);entry.second.session.reset();}}
 void reconcile(const std::string& snapshot){
  using namespace winrt::Windows::Data::Json;std::set<std::string> present;
  for(const auto& value:JsonArray::Parse(winrt::to_hstring(snapshot))){const auto item=value.GetObject(),manifest=item.GetNamedObject(L"manifest");if(!item.GetNamedBoolean(L"enabled")||!manifest.HasKey(L"runtime"))continue;const auto id=winrt::to_string(manifest.GetNamedString(L"id"));present.insert(id);
   const auto entry=winrt::to_string(manifest.GetNamedObject(L"runtime").GetNamedString(L"entry"));const auto path=directory_/ResourceCatalog::packagePath(id)/ResourceCatalog::packagePath(entry);std::error_code error;const auto changed=std::filesystem::last_write_time(path,error);const auto signature=winrt::to_string(manifest.Stringify())+":"+(error?error.message():std::to_string(changed.time_since_epoch().count()));auto& live=entries_[id];if(live.signature==signature)continue;
   if(unbind_)unbind_(id);live.session.reset();live.signature=signature;
   try{auto candidate=RuntimeDirectory::inspect(directory_,id);auto session=std::make_unique<JsSession>(host_,candidate,"zh-CN",workspace_,services_,diagnostics_?diagnostics_(id):DiagnosticServices{},[report=report_,id](const std::string& message){if(report)report(id+": "+message);});
    if(bind_)bind_(host_,session->token());RuntimeEvent project;project.type="project";const auto active=workspace_.active?workspace_.active():std::optional<ProjectSummary>{};project.homeOpen=home_?home_():!active;project.payload=active?winrt::to_string(projectSnapshot(*active).Stringify()):"null";session->start(RuntimeDirectory::readRuntimeEntry(directory_,id),project);live.session=std::move(session);
   }catch(const std::exception& failure){if(unbind_)unbind_(id);if(report_)report_(id+": "+failure.what());}catch(const winrt::hresult_error& failure){if(unbind_)unbind_(id);if(report_)report_(id+": "+winrt::to_string(failure.message()));}
  }
  for(auto it=entries_.begin();it!=entries_.end();)if(!present.count(it->first)){if(unbind_)unbind_(it->first);it=entries_.erase(it);}else ++it;
 }
 void pump(){const auto project=workspace_.active?workspace_.active():std::optional<ProjectSummary>{};for(auto& item:entries_)if(item.second.session&&item.second.session->active())try{host_->projectChanged(item.second.session->token(),project,home_?home_():!project);host_->clockTick(item.second.session->token());item.second.session->pump(std::chrono::steady_clock::now()+std::chrono::milliseconds(3));}catch(const std::exception& failure){if(unbind_)unbind_(item.first);if(report_)report_(item.first+": "+failure.what());}}
};
}
