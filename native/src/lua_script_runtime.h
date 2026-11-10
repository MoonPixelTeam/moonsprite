#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include "lua_script_service.h"
#include "lua_runtime_ffi.h"
#include "lua_script_invocation.h"
#include "lua_script_result.h"
#include <condition_variable>
#include <deque>
#include <future>
#include <mutex>
#include <thread>
namespace moon::script {
// platform_scripts.rs RuntimeRequest/runtime_loop: one VM owner thread,
// FIFO requests, independent replies, sessions surviving modeless callbacks.
class Runtime {
 using Task=std::packaged_task<std::string(MoonLuaHandle*,Service&)>;
 std::mutex mutex_;std::condition_variable ready_;std::deque<Task> tasks_;bool stopping_=false;std::thread worker_;
 static std::string invoke(MoonLuaHandle* handle,const winrt::Windows::Data::Json::JsonObject& request){
  const auto bytes=winrt::to_string(request.Stringify());
  std::unique_ptr<char,decltype(&moon_lua_free)> response(moon_lua_request(handle,reinterpret_cast<const unsigned char*>(bytes.data()),bytes.size()),moon_lua_free);
  if(!response)throw std::runtime_error("Lua runtime returned no response");
  auto envelope=winrt::Windows::Data::Json::JsonObject::Parse(winrt::to_hstring(response.get()));
  if(!envelope.GetNamedBoolean(L"ok"))throw std::runtime_error(winrt::to_string(envelope.GetNamedString(L"error")));
  return winrt::to_string(envelope.GetNamedValue(L"value").Stringify());
 }
 static winrt::Windows::Data::Json::JsonObject request(const wchar_t* type){using namespace winrt::Windows::Data::Json;JsonObject result;result.Insert(L"type",JsonValue::CreateStringValue(type));return result;}
 template<class Work>std::future<std::string> enqueue(Work work){Task task(std::move(work));auto result=task.get_future();{std::lock_guard lock(mutex_);if(stopping_)throw std::runtime_error("Lua runtime is stopping");tasks_.push_back(std::move(task));}ready_.notify_one();return result;}
public:
 explicit Runtime(std::filesystem::path root=executableDirectory()){
  std::promise<void> initialized;auto complete=initialized.get_future();
  worker_=std::thread([this,root=std::move(root),initialized=std::move(initialized)]()mutable{
   bool apartmentReady=false;
   struct Apartment{bool& ready;~Apartment(){if(ready)winrt::uninit_apartment();}} apartment{apartmentReady};
   std::unique_ptr<MoonLuaHandle,decltype(&moon_lua_destroy)> handle(nullptr,moon_lua_destroy);std::optional<Service> service;
   try{winrt::init_apartment(winrt::apartment_type::multi_threaded);apartmentReady=true;handle.reset(moon_lua_create());if(!handle)throw std::runtime_error("Lua runtime initialization failed");service.emplace(root);}
   catch(...){initialized.set_exception(std::current_exception());return;}
   initialized.set_value();
   for(;;){Task task;{std::unique_lock lock(mutex_);ready_.wait(lock,[this]{return stopping_||!tasks_.empty();});if(tasks_.empty())return;task=std::move(tasks_.front());tasks_.pop_front();}task(handle.get(),*service);}
  });
  try{complete.get();}catch(...){worker_.join();throw;}
 }
 Runtime(const Runtime&)=delete;Runtime& operator=(const Runtime&)=delete;
 ~Runtime(){shutdown();}
 // Drains accepted requests before destroying sessions on their owner thread.
 void shutdown(){ {std::lock_guard lock(mutex_);stopping_=true;}ready_.notify_one();if(worker_.joinable())worker_.join();}
 // Menu/preferences source discovery and mutations share the worker queue with
 // execution, avoiding directory scans and first-run seed writes on the UI.
 std::future<std::string> list(){return enqueue([](auto*,Service& service){return winrt::to_string(service.list().Stringify());});}
 std::future<std::string> remove(std::string id){return enqueue([id=std::move(id)](auto*,Service& service){service.remove(id);return std::string("null");});}
 std::future<std::string> start(std::string id,std::string context){return enqueue([id=std::move(id),context=std::move(context)](auto* handle,Service& service){
  using namespace winrt::Windows::Data::Json;const auto source=service.load(id);auto next=request(L"start");next.Insert(L"source",JsonValue::CreateStringValue(winrt::to_hstring(source.text)));next.Insert(L"filePath",JsonValue::CreateStringValue(source.path.wstring()));next.Insert(L"fileName",JsonValue::CreateStringValue(winrt::to_hstring(source.name)));next.Insert(L"context",JsonObject::Parse(winrt::to_hstring(context)));return invoke(handle,next);
 });}
 std::future<std::string> dispatch(std::string session,std::string action,std::string context){return enqueue([session=std::move(session),action=std::move(action),context=std::move(context)](auto* handle,Service&){using namespace winrt::Windows::Data::Json;auto next=request(L"dispatch");next.Insert(L"sessionId",JsonValue::CreateStringValue(winrt::to_hstring(session)));next.Insert(L"action",JsonObject::Parse(winrt::to_hstring(action)));next.Insert(L"context",JsonObject::Parse(winrt::to_hstring(context)));return invoke(handle,next);});}
 std::future<std::string> close(std::string session){return enqueue([session=std::move(session)](auto* handle,Service&){using namespace winrt::Windows::Data::Json;auto next=request(L"close");next.Insert(L"sessionId",JsonValue::CreateStringValue(winrt::to_hstring(session)));return invoke(handle,next);});}
 // Abandoned requests still run in FIFO order. Dispose their returned session
 // on the VM owner thread without waiting or retaining any Document pointer.
 void discardResult(std::future<std::string> result,std::string fallback={}){
  (void)enqueue([result=std::move(result),fallback=std::move(fallback)](auto* handle,Service&)mutable{
   using namespace winrt::Windows::Data::Json;std::string id=std::move(fallback);
   try{const auto wire=JsonObject::Parse(winrt::to_hstring(result.get()));if(wire.HasKey(L"sessionId")&&wire.GetNamedValue(L"sessionId").ValueType()==JsonValueType::String)id=winrt::to_string(wire.GetNamedString(L"sessionId"));}catch(...){}
   if(!id.empty()){auto next=request(L"close");next.Insert(L"sessionId",JsonValue::CreateStringValue(winrt::to_hstring(id)));try{(void)invoke(handle,next);}catch(...){}}
   return std::string("null");
  });
 }
 // A completed detached capture may cross threads. JSON encoding stays here,
 // not in the UI's bounded capture tick. The caller retains/checks its Target.
 std::future<std::string> startInvocation(std::string id,Invocation captured){return enqueue([id=std::move(id),captured=std::move(captured)](auto* handle,Service& service){
  using namespace winrt::Windows::Data::Json;const auto source=service.load(id);auto next=request(L"start");next.Insert(L"source",JsonValue::CreateStringValue(winrt::to_hstring(source.text)));next.Insert(L"filePath",JsonValue::CreateStringValue(source.path.wstring()));next.Insert(L"fileName",JsonValue::CreateStringValue(winrt::to_hstring(source.name)));next.Insert(L"context",JsonObject::Parse(winrt::to_hstring(captured.contextJson())));return invoke(handle,next);
 });}
 std::future<std::string> dispatchInvocation(std::string session,std::string action,Invocation captured){return enqueue([session=std::move(session),action=std::move(action),captured=std::move(captured)](auto* handle,Service&){using namespace winrt::Windows::Data::Json;auto next=request(L"dispatch");next.Insert(L"sessionId",JsonValue::CreateStringValue(winrt::to_hstring(session)));next.Insert(L"action",JsonObject::Parse(winrt::to_hstring(action)));next.Insert(L"context",JsonObject::Parse(winrt::to_hstring(captured.contextJson())));return invoke(handle,next);});}
};
// UI-thread state machine for one invocation. Runtime must outlive this object;
// tick is called by the host's existing message/timer pump. No wait/get occurs
// until ready; capture uses the caller's deadline and pixel allowance.
class PendingInvocation {
 Runtime& runtime_;std::optional<InvocationCapture> capture_;
 std::future<std::string> response_;Target target_;
 std::string scriptId_,sessionId_,action_;
 std::function<void(Document&&)> adopt_;
 bool receiving_=false;
 bool selectCreatedPaletteColor_=true;PlaybackHost playback_;PanelHost panels_;NotificationHost notify_;StyleClipboardHost styles_;BrushHost brushes_;
public:
 explicit PendingInvocation(Runtime& runtime):runtime_(runtime){}
 PendingInvocation(const PendingInvocation&)=delete;
 PendingInvocation& operator=(const PendingInvocation&)=delete;
 ~PendingInvocation(){try{cancel();}catch(...){}}
 void setPlaybackHost(PlaybackHost host){if(busy())throw std::logic_error("Cannot replace playback host during invocation");playback_=std::move(host);}
 void setStyleClipboardHost(StyleClipboardHost host){if(busy())throw std::logic_error("Cannot replace style clipboard during invocation");styles_=std::move(host);}
 void setNotificationHost(NotificationHost host){if(busy())throw std::logic_error("Cannot replace notification host during invocation");notify_=std::move(host);}
 void setBrushHost(BrushHost host){if(busy())throw std::logic_error("Cannot replace brush host during invocation");brushes_=std::move(host);}
 void setPanelHost(PanelHost host){if(busy())throw std::logic_error("Cannot replace panel host during invocation");panels_=std::move(host);}
 void setSelectCreatedPaletteColor(bool value){selectCreatedPaletteColor_=value;}
 bool busy()const{return receiving_||capture_.has_value()||response_.valid();}
 void start(const Document& d,std::string scriptId,std::string mseSnapshot,std::function<void(Document&&)> adopt={},std::optional<std::filesystem::path> savePath={}){
  if(busy())throw std::logic_error("Lua invocation is already pending");
  capture_.emplace(d,std::move(mseSnapshot),std::move(savePath));scriptId_=std::move(scriptId);sessionId_.clear();action_.clear();adopt_=std::move(adopt);
 }
 void dispatch(const Document& d,const ClientSession& session,std::string action,std::string mseSnapshot,std::function<void(Document&&)> adopt={}){
  if(busy())throw std::logic_error("Lua invocation is already pending");
  if(!session.target.matches(d,false))throw std::logic_error("Lua script target changed");
  capture_.emplace(d,std::move(mseSnapshot),std::nullopt,true);scriptId_.clear();sessionId_=session.sessionId;action_=std::move(action);adopt_=std::move(adopt);
 }
 void cancel(){
  capture_.reset();
  if(response_.valid())runtime_.discardResult(std::move(response_),sessionId_);
  sessionId_.clear();scriptId_.clear();action_.clear();adopt_={};
 }
 std::optional<RunOutcome> tick(Document* active,std::chrono::steady_clock::time_point deadline,std::size_t maxPixels=RasterSnapshot::tickPixels){
  if(!busy())return {};
  if(receiving_)throw std::logic_error("Lua result reception is already active");
  try{
   if(capture_){
    if(!active)throw std::logic_error("Lua script target changed");
    if(!capture_->advance(*active,deadline,maxPixels))return {};
    auto invocation=capture_->take();target_=invocation.target;capture_.reset();
    response_=sessionId_.empty()?runtime_.startInvocation(scriptId_,std::move(invocation)):runtime_.dispatchInvocation(sessionId_,action_,std::move(invocation));
   }
   if(response_.wait_for(std::chrono::seconds(0))!=std::future_status::ready)return {};
   if(!active){cancel();throw std::logic_error("Lua script target changed");}
   std::string result;
   try{result=response_.get();}catch(...){
    // Invalid action/context JSON can fail before Rust dispatch sees it, so
    // the VM has not necessarily removed the original modeless session.
    if(!sessionId_.empty())try{(void)runtime_.close(sessionId_);}catch(...){}
    throw;
   }
   // Adoption can synchronously pump host callbacks. Keep this coordinator
   // busy until reception finishes so a nested request cannot replace target_.
   auto adopt=std::move(adopt_);auto session=std::move(sessionId_);scriptId_.clear();action_.clear();
   receiving_=true;
   auto outcome=receiveWorkspaceResult(*active,target_,result,adopt,[this](const std::string& id){(void)runtime_.close(id);},session,selectCreatedPaletteColor_,playback_,panels_,styles_,notify_,brushes_);
   receiving_=false;return outcome;
  }catch(...){receiving_=false;capture_.reset();adopt_={};scriptId_.clear();action_.clear();sessionId_.clear();throw;}
 }
};
}
