#pragma once
#include "document_snapshot.h"
#include <chrono>
#include <filesystem>
#include <functional>
#include <future>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace moon::workspace {
// One required ASE/PSD encoding invocation. No worker owns a live document,
// dialog or file-writing callback; completion carries the original request.
class LayeredExportTask {
public:
 using Bytes=std::vector<std::uint8_t>;
 struct Request {std::filesystem::path path;int scale=100;bool psd=false;};
 struct Result {enum Kind {Succeeded,Cancelled,Failed} kind=Succeeded;Request request;Bytes bytes;std::string error;};
 using Encode=std::function<Bytes(const Document&,const Request&)>;
 using Launch=std::function<std::future<Bytes>(std::function<Bytes()>)>;
 explicit LayeredExportTask(Encode encode,Launch launch=[](auto work){return std::async(std::launch::async,std::move(work));}):encode_(std::move(encode)),launch_(std::move(launch)){}
 LayeredExportTask(const LayeredExportTask&)=delete;
 LayeredExportTask& operator=(const LayeredExportTask&)=delete;
 bool busy()const{return busy_;}
 bool capturing()const{return bool(snapshot_);}
 bool running()const{return worker_.valid();}
 bool cancelling()const{return cancelling_;}
 bool begin(const Document& document,Request request){
  if(busy_)return false;
  auto snapshot=std::make_unique<DocumentSnapshot>(document);
  request_=std::move(request);snapshot_=std::move(snapshot);busy_=true;cancelling_=false;return true;
 }
 // Capture can stop immediately. Existing encoders are not interrupted: drain
 // them and suppress their bytes, including failures, before closing the view.
 bool cancel(){
  if(!busy_)return true;cancelling_=true;
  if(snapshot_){snapshot_.reset();busy_=false;return true;}return false;
 }
 std::optional<Result> poll(const Document& document,std::chrono::steady_clock::time_point deadline){
  try{
   if(snapshot_){
    if(!snapshot_->advance(document,deadline))return {};
    auto captured=std::shared_ptr<DocumentSnapshot>(std::move(snapshot_));
    const auto request=request_;const auto encode=encode_;
    worker_=launch_([captured=std::move(captured),request,encode]()mutable{auto copy=captured->finish();return encode(copy,request);});
   }
   if(!worker_.valid()||worker_.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready)return {};
   auto bytes=worker_.get();busy_=false;
   if(cancelling_)return Result{Result::Cancelled,request_,{}, {}};
   return Result{Result::Succeeded,request_,std::move(bytes),{}};
  }catch(const std::exception& error){
   snapshot_.reset();busy_=false;
   return Result{cancelling_?Result::Cancelled:Result::Failed,request_,{},cancelling_?std::string{}:std::string(error.what())};
  }
 }
private:
 Encode encode_;Launch launch_;Request request_;
 std::unique_ptr<DocumentSnapshot> snapshot_;
 std::future<Bytes> worker_;bool busy_=false,cancelling_=false;
};
}
