#pragma once
#include "lua_script_runtime.h"
namespace moon::script {
// useAppScriptRuntime.tsx lifecycle adapted to the native message pump. The
// host supplies its current active Document and real MSE snapshot per request.
// Runtime must outlive Client; no native windows or fabricated workspace model.
class Client {
 Runtime& runtime_;PendingInvocation pending_;
 std::optional<ClientSession> session_;
 std::optional<RunSummary> report_;
 std::string error_;
 std::future<std::string> listing_;
 std::string scriptsJson_="[]";
 bool loading_=true,loadFailed_=false;
 bool dispatching_=false;
 void closeSession(){if(session_){auto id=session_->sessionId;session_.reset();try{(void)runtime_.close(std::move(id));}catch(...){}}}
 static std::string exceptionText(){try{throw;}catch(const winrt::hresult_error& e){return winrt::to_string(e.message());}catch(const std::exception& e){return e.what();}catch(...){return "Lua script failed";}}
 void fail(){error_=exceptionText();report_.reset();}
public:
 enum class Message {None,Running,DialogReady,Completed,CompletedNoChanges,Failed};
 Message message=Message::None;
 explicit Client(Runtime& runtime):runtime_(runtime),pending_(runtime){}
 Client(const Client&)=delete;Client& operator=(const Client&)=delete;
 ~Client(){closeSession();}
 bool running()const{return pending_.busy();}
 bool busy()const{return running()||session_.has_value();}
 const std::optional<ClientSession>& session()const{return session_;}
 const std::optional<RunSummary>& report()const{return report_;}
 const std::string& error()const{return error_;}
 const std::string& scriptsJson()const{return scriptsJson_;}
 bool loading()const{return loading_;}bool loadFailed()const{return loadFailed_;}
 void dismissReport(){report_.reset();error_.clear();}
 void refresh(){
  if(listing_.valid())return;
  loading_=true;loadFailed_=false;
  try{listing_=runtime_.list();}catch(...){scriptsJson_="[]";loading_=false;loadFailed_=true;}
 }
 // Same no-op exclusion as legacy: an open modeless session owns the runner.
 bool run(const Document* active,std::string id,std::string mse,std::function<void(Document&&)> adopt={}){
  if(busy())return false;
  dismissReport();message=Message::Running;dispatching_=false;
  try{if(!active)throw std::logic_error("Lua script document required");pending_.start(*active,std::move(id),std::move(mse),std::move(adopt));}
  catch(...){fail();message=Message::Failed;}
  return true;
 }
 bool dispatch(const Document* active,std::string action,std::string mse,std::function<void(Document&&)> adopt={}){
  if(!session_||running())return false;
  if(!active||!session_->target.matches(*active,false)){closeSession();return false;}
  dismissReport();dispatching_=true;
  try{pending_.dispatch(*active,*session_,std::move(action),std::move(mse),std::move(adopt));}
  catch(...){closeSession();fail();message=Message::Failed;}
  return true;
 }
 // Call for workspace changes and each pump tick. An in-flight callback keeps
 // its own target and will be rejected by result reception if the tab changed.
 void observe(const Document* active){if(session_&&(!active||!session_->target.matches(*active,false)))closeSession();}
 void tick(Document* active,std::chrono::steady_clock::time_point deadline,std::size_t maxPixels=RasterSnapshot::tickPixels){
  if(listing_.valid()&&listing_.wait_for(std::chrono::seconds(0))==std::future_status::ready){
   try{auto list=winrt::Windows::Data::Json::JsonObject::Parse(winrt::to_hstring(listing_.get()));scriptsJson_=winrt::to_string(list.GetNamedArray(L"scripts").Stringify());}
   catch(...){scriptsJson_="[]";loadFailed_=true;}
   loading_=false;
  }
  observe(active);if(!running())return;
  // Cache eligibility before reception: an adopter can destroy active.
  const bool suppress=dispatching_&&!session_;
  try{auto outcome=pending_.tick(active,deadline,maxPixels);if(!outcome)return;
   session_=std::move(outcome->session);auto& summary=outcome->summary;
   message=session_&&summary.changedPixelCount==0?Message::DialogReady:summary.changedPixelCount>0?Message::Completed:Message::CompletedNoChanges;
   if(!summary.output.empty())report_=std::move(summary);
   dispatching_=false;
  }catch(...){closeSession();if(!suppress){fail();message=Message::Failed;}dispatching_=false;}
 }
 // Escape closes the report first, then dispatches the last dialog's current
 // values exactly like legacy closeTopDialog. Busy dialogs still consume Escape.
 bool closeTopDialog(const Document* active,std::string mse,std::function<void(Document&&)> adopt={}){
  if(report_||!error_.empty()){dismissReport();return true;}
  if(!session_)return false;
  using namespace winrt::Windows::Data::Json;
  auto dialogs=JsonArray::Parse(winrt::to_hstring(session_->dialogsJson));if(!dialogs.Size())return false;
  auto dialog=dialogs.GetObjectAt(dialogs.Size()-1);JsonObject values;
  for(const auto& value:dialog.GetNamedArray(L"controls")){auto control=value.GetObject();if(control.HasKey(L"dataKey")&&control.GetNamedValue(L"dataKey").ValueType()==JsonValueType::String){const auto key=control.GetNamedString(L"dataKey");if(!key.empty())values.Insert(key,control.GetNamedValue(L"value"));}}
  JsonObject action;action.Insert(L"dialogId",dialog.GetNamedValue(L"id"));action.Insert(L"controlId",JsonValue::CreateNullValue());action.Insert(L"event",JsonValue::CreateStringValue(L"close"));action.Insert(L"values",values);
  (void)dispatch(active,winrt::to_string(action.Stringify()),std::move(mse),std::move(adopt));return true;
 }
};
}
