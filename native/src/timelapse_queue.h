#pragma once
#include "timelapse_pixels.h"
#include "timelapse_library.h"
#include <deque>
#include <future>
#include <functional>
namespace moon::timelapse {
class CaptureQueue {
 struct Item {Prepared prepared;std::string id;std::size_t bytes=0;std::optional<Frame> durable;};
 struct Result {std::optional<Frame> frame;std::string error;};
 std::filesystem::path root_;std::string store_;std::deque<Item> queue_;std::future<Result> task_;std::size_t pendingBytes_=0;bool blocked_=false;
 void start(){if(task_.valid()||blocked_||queue_.empty()||queue_.front().durable)return;const auto p=queue_.front().prepared;const auto id=queue_.front().id;const auto root=root_;const auto store=store_;task_=std::async(std::launch::async,[p,id,root,store]{Result result;try{Frame frame;frame.id=id;frame.capturedAt=p.capturedAt;frame.width=p.pixels->width;frame.height=p.pixels->height;frame.changeScore=p.changeScore;auto bytes=encodePreparedPng(p);frame.local=appendLibraryFrame(root,store,bytes);result.frame=std::move(frame);}catch(const std::exception& e){result.error=e.what();}catch(...){result.error="Unknown recording worker failure";}return result;});}
public:
 using Valid=std::function<bool(const Prepared&)>;
 using Commit=std::function<void(Frame,Mode)>;
 CaptureQueue(std::filesystem::path root,std::string store):root_(std::move(root)),store_(std::move(store)){if(!safeId(store_))throw std::invalid_argument("Invalid recording store");}
 CaptureQueue(const CaptureQueue&)=delete;
 std::size_t pendingBytes()const{return pendingBytes_;}
 std::size_t pendingCount()const{return queue_.size();}
 bool failed()const{return blocked_;}
 bool empty()const{return queue_.empty()&&!task_.valid();}
 std::string error;
 bool enqueue(Prepared p,std::string id){if(!p.pixels)throw std::invalid_argument("Missing prepared recording pixels");if(!safeId(id))throw std::invalid_argument("Invalid recording frame ID");const auto size=std::uint64_t(p.pixels->width)*p.pixels->height*4;if(size>64ULL*1024*1024||pendingBytes_>64ULL*1024*1024-size){error="Recording backlog reached 64 MiB; pause recording and preserve existing frames";return false;}pendingBytes_+=std::size_t(size);queue_.push_back({std::move(p),std::move(id),std::size_t(size)});start();return true;}
 // Errors retain queue front and its immutable pixels. No later frame overtakes.
 // Valid is evaluated on UI thread for separate capture/undo generations.
 void poll(const Valid& valid,const Commit& commit){
  if(queue_.empty())return;
  if(!task_.valid()&&!valid(queue_.front().prepared)){pendingBytes_-=queue_.front().bytes;queue_.pop_front();blocked_=false;error.clear();start();return;}
  if(task_.valid()){
   if(task_.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready)return;
   auto result=task_.get();
   if(!valid(queue_.front().prepared)){pendingBytes_-=queue_.front().bytes;queue_.pop_front();blocked_=false;error.clear();start();return;}
   if(!result.error.empty()){blocked_=true;error="Cannot write recording library "+root_.u8string()+": "+result.error;return;}
   queue_.front().durable=std::move(result.frame);
  }
  if(blocked_)return;
  if(!queue_.front().durable){start();return;}
  if(!valid(queue_.front().prepared)){pendingBytes_-=queue_.front().bytes;queue_.pop_front();start();return;}
  try{commit(*queue_.front().durable,queue_.front().prepared.mode);}
  catch(const std::exception& e){blocked_=true;error=e.what();return;}
  pendingBytes_-=queue_.front().bytes;queue_.pop_front();error.clear();start();
 }
 // Exactly one retry pass when user requests save/flush. No retry timer.
 void retry(){if(blocked_){blocked_=false;error.clear();start();}}
 void flush(const Valid& valid,const Commit& commit,const std::function<void()>& pump={}){retry();while(!empty()){if(task_.valid())task_.wait_for(std::chrono::milliseconds(1));poll(valid,commit);if(blocked_)throw std::runtime_error(error);if(pump)pump();}}
};
}
