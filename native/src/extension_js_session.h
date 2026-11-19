#pragma once
#include "extension_js_engine.h"
#include "extension_js_forms.h"
#include "extension_session_host.h"
#include "extension_event_json.h"
#include "extension_runtime_directory.h"
#include <deque>
namespace moon::extension {
// Connects one real VM to the existing authenticated native SessionHost.
// Delivery callbacks queue JSON or owned file bytes; JS never reenters a native call.
class JsSession final {
 struct Inbox{using Delivery=std::variant<std::string,RuntimeEvent>;std::deque<Delivery> messages;std::size_t fileBytes=0;bool active=true;};
 std::shared_ptr<SessionHost> host_;SessionHost::Token token_;
 std::shared_ptr<Inbox> inbox_=std::make_shared<Inbox>();std::unique_ptr<JsEngine> engine_;
 std::unique_ptr<JsForms> forms_;std::string error_;std::function<void(const std::string&)> log_;bool stopped_=false;
 void drain(std::chrono::steady_clock::time_point deadline){while(!inbox_->messages.empty()&&std::chrono::steady_clock::now()<deadline){auto& message=inbox_->messages.front();if(auto text=std::get_if<std::string>(&message))engine_->deliver(*text);else{const auto& files=std::get<RuntimeEvent>(message);if(!engine_->deliverFiles(files,deadline))return;for(const auto& file:files.files)inbox_->fileBytes-=file.bytes.size();}inbox_->messages.pop_front();}}

public:
 JsSession(std::shared_ptr<SessionHost> host,const RuntimeCandidate& candidate,std::string locale,WorkspaceServices workspace,HostServices services,DiagnosticServices diagnostics,std::function<void(const std::string&)> log={},JsFormFactory forms={}):host_(std::move(host)),log_(std::move(log)){
  engine_=std::make_unique<JsEngine>();std::vector<RuntimeCommand> commands;for(const auto& command:candidate.commands)commands.push_back(command.runtime);
  token_=host_->open(candidate.extension,candidate.permissions,std::move(locale),[weak=std::weak_ptr<Inbox>(inbox_)](const RuntimeEvent& event){if(auto inbox=weak.lock();inbox&&inbox->active){if(inbox->messages.size()>=512)throw std::runtime_error("Extension inbound queue is full");if(event.type=="files-dropped"){std::size_t total=0;for(const auto& file:event.files){if(file.bytes.size()>64u*1024u*1024u-inbox->fileBytes-total)throw std::length_error("Extension file delivery queue is full");total+=file.bytes.size();}inbox->messages.push_back(event);inbox->fileBytes+=total;}else inbox->messages.push_back(javascriptJsonUtf8(eventEnvelope(event).Stringify().c_str()));}},{},std::move(commands));
  try{host_->setWorkspaceServices(token_,std::move(workspace));host_->setServices(token_,std::move(services));host_->setDiagnosticServices(token_,diagnostics);forms_=std::make_unique<JsForms>(host_,token_,candidate,std::move(diagnostics),std::move(forms));std::vector<std::string> menus;for(const auto& menu:candidate.metadata.topMenus)menus.push_back(menu.id);host_->setDeclaredMenus(token_,std::move(menus));
   std::vector<std::string> resources;if(candidate.manifest.HasKey(L"runtime")){auto runtime=candidate.manifest.GetNamedObject(L"runtime");if(runtime.HasKey(L"resources"))for(const auto& item:runtime.GetNamedObject(L"resources"))resources.push_back(winrt::to_string(item.Key()));}auto catalog=candidate.resources;host_->setResourceReader(token_,[catalog](const std::string& id){if(!catalog)throw std::runtime_error("Extension resource catalog missing");return catalog->read(id);},std::move(resources));
  }catch(...){host_->close(token_);throw;}
 }
 ~JsSession(){try{stop();}catch(...){}}
 JsSession(const JsSession&)=delete;JsSession& operator=(const JsSession&)=delete;
 const auto& token()const{return token_;}const auto& error()const{return error_;}
 bool active()const{return !stopped_;}
 bool awaitingFile()const{return inbox_->fileBytes!=0;}
 void start(const std::string& html,const RuntimeEvent& project){
  try{for(const auto& script:runtimeScripts(html))engine_->evaluate(script.source,token_.extensionId+"/runtime",script.module);host_->loaded(token_,project);}
  catch(const std::exception& error){error_=error.what();host_->loadFailed(token_);stop();throw;}
 }
 void pump(std::chrono::steady_clock::time_point deadline){
  if(stopped_)return;try{
   for(const auto& response:host_->pollResponses(token_))inbox_->messages.push_back(winrt::to_string(response.Stringify()));
   forms_->pump(deadline);drain(deadline);engine_->pump(deadline);
   for(auto& message:engine_->takeMessages()){
    using namespace winrt::Windows::Data::Json;auto wire=JsonObject::Parse(winrt::to_hstring(message.json));
    if(wire.HasKey(L"type")&&wire.GetNamedString(L"type")==L"native-console"){if(log_)log_(winrt::to_string(wire.GetNamedString(L"message")));continue;}
    auto request=wire.GetNamedObject(L"message");std::optional<std::string> encoded;if(wire.HasKey(L"encoded")&&wire.GetNamedValue(L"encoded").ValueType()==JsonValueType::String)encoded=winrt::to_string(wire.GetNamedString(L"encoded"));
    if(request.HasKey(L"type")&&request.GetNamedString(L"type")==L"moonsprite-extension-command-state"){host_->reportCommandState(token_,request);continue;}
    auto response=host_->request(token_,request,std::move(encoded));if(response)inbox_->messages.push_back(winrt::to_string(response->Stringify()));
   }
  }catch(const std::exception& error){error_=error.what();stop();throw;}catch(const winrt::hresult_error& error){error_=winrt::to_string(error.message());stop();throw std::runtime_error(error_);}
 }
 void stop(){if(stopped_)return;stopped_=true;if(forms_)forms_->stop();host_->close(token_);try{drain(std::chrono::steady_clock::now()+std::chrono::milliseconds(5));engine_->pump(std::chrono::steady_clock::now()+std::chrono::milliseconds(5));}catch(...){}inbox_->active=false;inbox_->messages.clear();inbox_->fileBytes=0;engine_.reset();}
};
}
