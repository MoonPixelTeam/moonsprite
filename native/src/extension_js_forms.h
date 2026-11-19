#pragma once
#include "extension_js_engine.h"
#include "extension_assets.h"
#include "extension_session_host.h"
#include "extension_runtime_directory.h"
#include <deque>
namespace moon::extension {
// UI implementation stays outside the extension module. Callbacks only enqueue.
struct JsFormPresentation {
 virtual ~JsFormPresentation()=default;
 virtual void receive(const WindowValue&)=0;
 virtual void failure(const std::string&)=0;
 virtual void pump()=0;
 virtual void close()=0;
};
struct JsFormCallbacks {
 std::function<void(WindowObject)> send;
 std::function<void()> close,restart;
};
using JsFormFactory=std::function<std::unique_ptr<JsFormPresentation>(const std::string&,const WindowDefinition&,JsFormCallbacks)>;
class JsForms final {
 struct Page {
  WindowDefinition definition;std::unique_ptr<JsEngine> engine;
  std::unique_ptr<JsFormPresentation> view;std::deque<std::string> inbox;
  struct PendingAsset{winrt::hstring id;std::future<AssetResult> task;};std::deque<PendingAsset> assets;
  bool close=false,restart=false;std::size_t bytes=0;
  void enqueue(std::string message){if(inbox.size()>=512||message.size()>128u*1024u*1024u-bytes)throw std::length_error("Extension window message queue is full");bytes+=message.size();inbox.push_back(std::move(message));}
 };
 std::shared_ptr<SessionHost> host_;SessionHost::Token token_;RuntimeCandidate candidate_;
 DiagnosticServices diagnostics_;JsFormFactory factory_;std::shared_ptr<WindowRouter> router_;
 std::map<std::wstring,std::shared_ptr<Page>> pages_;bool stopped_=false;
 static std::u16string units(const winrt::hstring& value){return {reinterpret_cast<const char16_t*>(value.data()),value.size()};}
 static std::string envelope(const WindowValue& message){using namespace winrt::Windows::Data::Json;WindowObject result;result.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-window-message"));result.Insert(L"message",message?message:JsonValue::CreateNullValue());return javascriptJsonUtf8(result.Stringify().c_str());}
 void load(Page& page){
  page.inbox.clear();page.assets.clear();page.bytes=0;page.engine=std::make_unique<JsEngine>(winrt::to_string(page.definition.id));
  const auto bytes=candidate_.resources->read(winrt::to_string(page.definition.resource));
  for(const auto& script:runtimeScripts({bytes.begin(),bytes.end()}))page.engine->evaluate(script.source,token_.extensionId+"/"+winrt::to_string(page.definition.resource),script.module);
 }
 void open(const WindowDefinition& definition){
  if(stopped_)throw std::runtime_error("Extension form session is inactive");
  if(definition.presentation!=L"dialog"||!definition.form)throw std::runtime_error("Native extension HTML/overlay presentation is not migrated; use dialog component form");
  if(!factory_)throw std::runtime_error("Native extension form presenter is not connected");
  auto page=std::make_shared<Page>();page->definition=definition;const auto weak=std::weak_ptr<Page>(page);
  page->view=factory_(token_.extensionId,definition,{[weak](WindowObject value){if(auto live=weak.lock();live&&!live->close)live->enqueue(envelope(value));},[weak]{if(auto live=weak.lock())live->close=true;},[weak]{if(auto live=weak.lock())live->restart=true;}});
  if(!page->view)throw std::runtime_error("Native extension form presenter missing");
  try{load(*page);}catch(const std::exception& error){page->engine.reset();page->view->failure(error.what());}catch(const winrt::hresult_error& error){page->engine.reset();page->view->failure(winrt::to_string(error.message()));}
  // Legacy has one dialog per extension; replace only after construction.
  for(auto& prior:pages_)prior.second->view->close();pages_.clear();pages_.emplace(definition.id,std::move(page));
 }
 WindowValue request(Page& page,const std::string& method,const WindowObject& params,const std::optional<std::string>& encoded){
  using namespace winrt::Windows::Data::Json;WindowValue result=JsonValue::CreateNullValue();
  auto field=[&](const wchar_t* name){return params.HasKey(name)?params.GetNamedValue(name):WindowValue{nullptr};};
  auto key=[&]{auto value=field(L"key");if(!value||value.ValueType()!=JsonValueType::String)throw std::invalid_argument("扩展存储键无效。");return units(value.GetString());};
  const auto owner=units(winrt::to_hstring(token_.extensionId));
  // Embedded window storage has its own bridge, not Runtime permissions.
  if(method=="storage.get")result=host_->storage().get(owner,key());
  else if(method=="storage.set"){const auto name=key();if(!encoded)throw std::invalid_argument("扩展存储值超过大小限制。");host_->storage().setEncoded(owner,name,*encoded);}
  else if(method=="storage.remove")host_->storage().remove(owner,key());
  else if(method=="storage.list"){JsonArray keys;for(const auto& name:host_->storage().list(owner))keys.Append(JsonValue::CreateStringValue(winrt::hstring(reinterpret_cast<const wchar_t*>(name.data()),std::uint32_t(name.size()))));result=keys;}
  else if(method=="resources.read"){
   auto value=field(L"resourceId");if(!value||value.ValueType()!=JsonValueType::String)throw std::invalid_argument("资源 ID 无效。");JsonArray bytes;for(auto byte:candidate_.resources->read(winrt::to_string(value.GetString())))bytes.Append(JsonValue::CreateNumberValue(byte));result=bytes;
  }
  else if(method=="window.close")page.close=true;
  else if(method=="window.startDrag"||method=="window.setCursorPolicy"){}
  else if(method=="window.postMessage"){
   const auto value=field(L"message");if(value&&value.ValueType()==JsonValueType::Object&&value.GetObject().GetNamedString(L"type",L"")==L"ui-state")page.view->receive(value);
   else{RuntimeEvent event;event.type="window-message";event.windowId=winrt::to_string(page.definition.id);event.payload=value?winrt::to_string(value.Stringify()):"null";host_->registry().dispatch(token_.extensionId,event);}
  }
  else if(method=="window.setCommandState"){
   auto command=field(L"commandId");if(!command||command.ValueType()!=JsonValueType::String||command.GetString().empty()||command.GetString().size()>80)throw std::invalid_argument("命令 ID 无效。");
   WindowObject state;if(auto value=field(L"state");value&&value.ValueType()==JsonValueType::Object)state=value.GetObject();
   for(const auto* name:{L"checked",L"visible"})if(state.HasKey(name)&&state.GetNamedValue(name).ValueType()!=JsonValueType::Boolean)throw std::invalid_argument(name==std::wstring(L"checked")?"命令勾选状态无效。":"命令可见状态无效。");
   host_->reportCommandState(token_,params);
  }
  else if(method.rfind("window.",0)==0)throw std::runtime_error("弹窗尺寸由宿主管理。");
  else if(method=="diagnostics.log"){
   const auto value=field(L"message"),level=field(L"level");const auto text=value&&value.ValueType()==JsonValueType::String?value.GetString():winrt::hstring{};const auto message=winrt::hstring(text.data(),std::min<std::uint32_t>(2000,text.size()));
   WindowObject detail;detail.Insert(L"type",JsonValue::CreateStringValue(L"diagnostic"));detail.Insert(L"message",JsonValue::CreateStringValue(message));if(level)detail.Insert(L"level",level);RuntimeEvent event;event.type="window-message";event.windowId=winrt::to_string(page.definition.id);event.payload=winrt::to_string(detail.Stringify());host_->registry().dispatch(token_.extensionId,event);if(diagnostics_.console)diagnostics_.console("info",message);
  }
  else throw std::runtime_error("Native extension window method is not migrated: "+method);
  return result;
 }
 void consume(Page& page){
  using namespace winrt::Windows::Data::Json;
  for(auto& message:page.engine->takeMessages()){
   auto wire=JsonObject::Parse(winrt::to_hstring(message.json));if(wire.GetNamedString(L"type",L"")==L"native-console"){if(diagnostics_.console)diagnostics_.console("error",wire.GetNamedString(L"message"));continue;}
   auto call=wire.GetNamedObject(L"message");if(call.GetNamedString(L"type",L"")!=L"moonsprite-extension-request")continue;
   const auto id=call.GetNamedValue(L"requestId"),method=call.GetNamedValue(L"method");if(id.ValueType()!=JsonValueType::String||method.ValueType()!=JsonValueType::String)continue;
   WindowObject response;response.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-response"));response.Insert(L"requestId",id);
   try{WindowObject params;if(call.HasKey(L"params")&&call.GetNamedValue(L"params").ValueType()==JsonValueType::Object)params=call.GetNamedObject(L"params");const auto name=winrt::to_string(method.GetString());if(name=="assets.get"||name=="assets.set"||name=="assets.remove"){
    if(!params.HasKey(L"key")||params.GetNamedValue(L"key").ValueType()!=JsonValueType::String)throw std::invalid_argument("扩展素材键无效。");std::optional<std::u16string> value;if(name=="assets.set"&&params.HasKey(L"value")&&params.GetNamedValue(L"value").ValueType()==JsonValueType::String)value=units(params.GetNamedString(L"value"));
    if(page.assets.size()>=256)throw std::length_error("Extension asset request queue is full");page.assets.push_back({id.GetString(),startAssetRequest(host_->storage().path().parent_path()/"extension-assets.sqlite",token_.extensionId,name,units(params.GetNamedString(L"key")),std::move(value))});continue;
   }std::optional<std::string> encoded;if(wire.HasKey(L"encoded"))encoded=winrt::to_string(wire.GetNamedString(L"encoded"));response.Insert(L"result",request(page,winrt::to_string(method.GetString()),params,encoded));response.Insert(L"ok",JsonValue::CreateBooleanValue(true));}
   catch(const std::exception& error){response.Insert(L"ok",JsonValue::CreateBooleanValue(false));response.Insert(L"error",JsonValue::CreateStringValue(winrt::to_hstring(error.what())));}
   catch(const winrt::hresult_error& error){response.Insert(L"ok",JsonValue::CreateBooleanValue(false));response.Insert(L"error",JsonValue::CreateStringValue(error.message()));}
   page.enqueue(javascriptJsonUtf8(response.Stringify().c_str()));
  }
 }
 void pollAssets(Page& page){using namespace winrt::Windows::Data::Json;while(!page.assets.empty()&&page.assets.front().task.wait_for(std::chrono::seconds(0))==std::future_status::ready){auto pending=std::move(page.assets.front());page.assets.pop_front();WindowObject response;response.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-response"));response.Insert(L"requestId",JsonValue::CreateStringValue(pending.id));try{auto value=pending.task.get();response.Insert(L"result",value?JsonValue::CreateStringValue(winrt::hstring(reinterpret_cast<const wchar_t*>(value->data()),std::uint32_t(value->size()))):JsonValue::CreateNullValue());response.Insert(L"ok",JsonValue::CreateBooleanValue(true));}catch(const std::exception& error){response.Insert(L"ok",JsonValue::CreateBooleanValue(false));response.Insert(L"error",JsonValue::CreateStringValue(winrt::to_hstring(error.what())));}page.enqueue(javascriptJsonUtf8(response.Stringify().c_str()));}}
public:
 JsForms(std::shared_ptr<SessionHost> host,SessionHost::Token token,RuntimeCandidate candidate,DiagnosticServices diagnostics,JsFormFactory factory):host_(std::move(host)),token_(std::move(token)),candidate_(std::move(candidate)),diagnostics_(std::move(diagnostics)),factory_(std::move(factory)){
  std::set<std::wstring> resources;if(candidate_.manifest.HasKey(L"runtime")){auto runtime=candidate_.manifest.GetNamedObject(L"runtime");if(runtime.HasKey(L"resources"))for(const auto& pair:runtime.GetNamedObject(L"resources"))resources.insert(std::wstring(pair.Key()));}
  router_=std::make_shared<WindowRouter>(winrt::to_hstring(candidate_.metadata.name).c_str(),std::move(resources),WindowServices{[this](const auto& next){open(next);},[this](const auto& next){if(auto found=pages_.find(next.id);found!=pages_.end())found->second->close=true;},[](const auto&,bool){throw std::runtime_error("Native extension overlay presentation is not migrated");},[this](const auto& next,const auto& value){if(auto found=pages_.find(next.id);found!=pages_.end()&&!found->second->close)found->second->enqueue(envelope(value));}});
  host_->setWindowRouter(token_,router_);
 }
 ~JsForms(){stop();}
 void stop(){if(stopped_)return;stopped_=true;host_->setWindowRouter(token_,{});for(auto& item:pages_)item.second->view->close();pages_.clear();router_.reset();}
 void pump(std::chrono::steady_clock::time_point deadline){
  if(stopped_)return;for(auto& item:pages_){auto& page=*item.second;if(page.close)continue;
   try{if(page.restart){page.restart=false;load(page);}if(page.engine){pollAssets(page);while(!page.inbox.empty()&&std::chrono::steady_clock::now()<deadline){auto message=std::move(page.inbox.front());page.bytes-=message.size();page.inbox.pop_front();page.engine->deliver(message);}page.engine->pump(deadline);consume(page);}page.view->pump();}
   catch(const std::exception& error){page.engine.reset();page.inbox.clear();page.assets.clear();page.bytes=0;page.view->failure(error.what());page.view->pump();}
   catch(const winrt::hresult_error& error){page.engine.reset();page.inbox.clear();page.assets.clear();page.bytes=0;page.view->failure(winrt::to_string(error.message()));page.view->pump();}
  }
  for(auto it=pages_.begin();it!=pages_.end();)if(it->second->close){WindowObject params;params.Insert(L"windowId",winrt::Windows::Data::Json::JsonValue::CreateStringValue(it->first));router_->request("windows.close",params);it->second->view->close();it=pages_.erase(it);}else ++it;
 }
};
}
