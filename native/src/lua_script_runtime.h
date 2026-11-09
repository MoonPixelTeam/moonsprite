#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include "lua_script_service.h"
#include "lua_runtime_ffi.h"
#include "lua_script_invocation.h"
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
 std::future<std::string> start(std::string id,std::string context){return enqueue([id=std::move(id),context=std::move(context)](auto* handle,Service& service){
  using namespace winrt::Windows::Data::Json;const auto source=service.load(id);auto next=request(L"start");next.Insert(L"source",JsonValue::CreateStringValue(winrt::to_hstring(source.text)));next.Insert(L"filePath",JsonValue::CreateStringValue(source.path.wstring()));next.Insert(L"fileName",JsonValue::CreateStringValue(winrt::to_hstring(source.name)));next.Insert(L"context",JsonObject::Parse(winrt::to_hstring(context)));return invoke(handle,next);
 });}
 std::future<std::string> dispatch(std::string session,std::string action,std::string context){return enqueue([session=std::move(session),action=std::move(action),context=std::move(context)](auto* handle,Service&){using namespace winrt::Windows::Data::Json;auto next=request(L"dispatch");next.Insert(L"sessionId",JsonValue::CreateStringValue(winrt::to_hstring(session)));next.Insert(L"action",JsonObject::Parse(winrt::to_hstring(action)));next.Insert(L"context",JsonObject::Parse(winrt::to_hstring(context)));return invoke(handle,next);});}
 std::future<std::string> close(std::string session){return enqueue([session=std::move(session)](auto* handle,Service&){using namespace winrt::Windows::Data::Json;auto next=request(L"close");next.Insert(L"sessionId",JsonValue::CreateStringValue(winrt::to_hstring(session)));return invoke(handle,next);});}
 // A completed detached capture may cross threads. JSON encoding stays here,
 // not in the UI's bounded capture tick. The caller retains/checks its Target.
 std::future<std::string> startInvocation(std::string id,Invocation captured){return enqueue([id=std::move(id),captured=std::move(captured)](auto* handle,Service& service){
  using namespace winrt::Windows::Data::Json;const auto source=service.load(id);auto next=request(L"start");next.Insert(L"source",JsonValue::CreateStringValue(winrt::to_hstring(source.text)));next.Insert(L"filePath",JsonValue::CreateStringValue(source.path.wstring()));next.Insert(L"fileName",JsonValue::CreateStringValue(winrt::to_hstring(source.name)));next.Insert(L"context",JsonObject::Parse(winrt::to_hstring(captured.contextJson())));return invoke(handle,next);
 });}
 std::future<std::string> dispatchInvocation(std::string session,std::string action,Invocation captured){return enqueue([session=std::move(session),action=std::move(action),captured=std::move(captured)](auto* handle,Service&){using namespace winrt::Windows::Data::Json;auto next=request(L"dispatch");next.Insert(L"sessionId",JsonValue::CreateStringValue(winrt::to_hstring(session)));next.Insert(L"action",JsonObject::Parse(winrt::to_hstring(action)));next.Insert(L"context",JsonObject::Parse(winrt::to_hstring(captured.contextJson())));return invoke(handle,next);});}
};
}
