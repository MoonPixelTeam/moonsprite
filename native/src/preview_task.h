#pragma once
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstddef>
#include <exception>
#include <functional>
#include <future>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>

namespace moon::workspace {
enum class PreviewIntent { Preview, Apply, ApplyAndClose };
using PreviewExecutor=std::function<void(std::function<void()>)>;
using PreviewClock=std::chrono::steady_clock;
inline PreviewExecutor backgroundPreviewExecutor(){return [](std::function<void()> work){std::thread(std::move(work)).detach();};}

// One running snapshot and one replaceable pending preview, following legacy
// latest-task-queue. Apply is a barrier: later previews cannot replace it.
// No worker retains this object, a live document, or a UI callback.
template<class Task> class PreviewTask {
public:
 using Clock=PreviewClock;
 struct Request {
  std::uint64_t document=0,generation=0,revision=0;
  PreviewIntent intent=PreviewIntent::Preview;
  Clock::time_point due;
 };
 struct Completion {
  Request request;
  std::optional<Task> task;
  bool cancelled=false;
  std::string error;
 };
 using Capture=std::function<std::optional<Task>()>;
 using Run=std::function<bool(Task&,const std::function<bool()>&)>;

 explicit PreviewTask(PreviewExecutor executor=backgroundPreviewExecutor()):executor_(std::move(executor)){}
 ~PreviewTask(){cancel();}
 PreviewTask(const PreviewTask&)=delete;
 PreviewTask& operator=(const PreviewTask&)=delete;

 bool request(std::uint64_t document,PreviewIntent intent,Clock::time_point due,std::uint64_t revision=0){
  if(!document)return false;
  if(committing_&&intent==PreviewIntent::Preview)return false;
  cancel();
  owner_=document;committing_=intent!=PreviewIntent::Preview;
  pending_=Request{document,generation_,revision,intent,due};
  return true;
 }
 void cancel(){
  if(cancel_)cancel_->store(true);
  ++generation_;owner_=0;pending_.reset();committing_=false;
 }
 bool busy()const{return pending_.has_value()||worker_.valid();}
 bool running()const{return worker_.valid();}
 std::size_t pendingCount()const{return std::size_t(worker_.valid())+std::size_t(pending_.has_value());}
 bool committing()const{return committing_;}
 void acknowledge(){committing_=false;}

 std::optional<Completion> poll(std::uint64_t document,const Capture& capture,const Run& run,Clock::time_point now=Clock::now()){
  if(owner_&&owner_!=document)cancel();
  std::optional<Completion> completed;
  if(worker_.valid()&&worker_.wait_for(std::chrono::seconds(0))==std::future_status::ready){
   Completion result;
   try{result=worker_.get();}
   catch(const std::exception& e){result.request=running_;result.error=e.what();}
   catch(...){result.request=running_;result.error="Unknown preview worker failure";}
   if(result.request.document==document&&owner_==document&&result.request.generation==generation_){
    completed=std::move(result);
   }
  }
  if(!worker_.valid()&&pending_&&pending_->due<=now){
   const auto request=*pending_;pending_.reset();
   try{
    auto task=capture();
    if(!task){completed=Completion{request};return completed;}
    auto token=std::make_shared<std::atomic<bool>>(false);
    cancel_=token;running_=request;
    auto work=std::make_shared<std::packaged_task<Completion()>>([task=std::move(task),request,token,run]()mutable{
     Completion result{request,std::move(task)};
     try{result.cancelled=!run(*result.task,[token]{return token->load();});}
     catch(const std::exception& e){result.error=e.what();}
     catch(...){result.error="Unknown preview worker failure";}
     return result;
    });
    worker_=work->get_future();
    executor_([work]{(*work)();});
   }catch(const std::exception& e){
    if(cancel_)cancel_->store(true);
    worker_={};completed=Completion{request,{},false,e.what()};
   }catch(...){
    if(cancel_)cancel_->store(true);
    worker_={};completed=Completion{request,{},false,"Unknown preview scheduling failure"};
   }
  }
  return completed;
 }
private:
 PreviewExecutor executor_;
 std::uint64_t owner_=0,generation_=0;
 std::optional<Request> pending_;
 Request running_;
 std::future<Completion> worker_;
 std::shared_ptr<std::atomic<bool>> cancel_;
 bool committing_=false;
};
}
