#pragma once
#include "document_snapshot.h"
#include "preview_task.h"

namespace moon::workspace {
// Progress belongs to one export invocation. Copies may be held by a worker,
// but contain no editor, window or mutable document reference.
class ExportProgress {
 struct State {
  std::atomic<bool> cancelled{false};
  std::atomic<std::size_t> written{0};
  std::size_t total=0;
 };
 std::shared_ptr<State> state_;
 friend class BatchExportTask;
public:
 ExportProgress()=default;
 explicit ExportProgress(std::size_t total):state_(std::make_shared<State>()){state_->total=total;}
 explicit operator bool()const{return bool(state_);}
 bool cancelled()const{return state_&&state_->cancelled.load();}
 void cancel()const{if(state_)state_->cancelled=true;}
 void report(std::size_t written)const{if(state_)state_->written=written;}
 std::size_t written()const{return state_?state_->written.load():0;}
 std::size_t total()const{return state_?state_->total:0;}
};

class BatchExportTask {
public:
 struct Result {
  enum Kind { Succeeded, Cancelled, Failed } kind=Succeeded;
  std::size_t written=0;
  std::string error;
 };
 struct Capture {
  enum Kind { Idle, Pending, Cancelled, Ready, Failed } kind=Idle;
  std::optional<DocumentSnapshot> snapshot;
  std::string error;
 };
 using Work=std::function<Result(ExportProgress)>;
 explicit BatchExportTask(PreviewExecutor executor=backgroundPreviewExecutor()):executor_(std::move(executor)){}
 ~BatchExportTask(){cancel();}
 BatchExportTask(const BatchExportTask&)=delete;
 BatchExportTask& operator=(const BatchExportTask&)=delete;
 bool busy()const{return reserved_||worker_.valid()||immediate_.has_value();}
 bool capturing()const{return snapshot_.has_value();}
 bool running()const{return worker_.valid();}
 ExportProgress progress()const{return progress_;}
 void cancel(){progress_.cancel();}
 void discardCapture(){
  if(worker_.valid()||immediate_)return;
  progress_.cancel();snapshot_.reset();reserved_=false;
 }
 // A required export is never replaced by a later request.
 bool begin(const Document& document,std::size_t total){
  if(busy())return false;
  DocumentSnapshot snapshot(document);ExportProgress progress(total);
  snapshot_.emplace(std::move(snapshot));progress_=std::move(progress);reserved_=true;return true;
 }
 Capture capture(const Document& document,std::chrono::steady_clock::time_point deadline){
  if(!snapshot_)return {};
  if(progress_.cancelled()){snapshot_.reset();reserved_=false;return {Capture::Cancelled,{},{}};}
  try{
   if(!snapshot_->advance(document,deadline))return {Capture::Pending,{},{}};
   Capture captured{Capture::Ready,std::move(snapshot_),{}};snapshot_.reset();return captured;
  }catch(const std::exception& error){snapshot_.reset();reserved_=false;return {Capture::Failed,{},error.what()};}
 }
 // The caller supplies only a snapshot/format value closure. This same narrow
 // dispatch interface lets tests drive real writers without replacing futures.
 bool launch(Work work){
  if(!reserved_||worker_.valid()||immediate_)return false;
  snapshot_.reset();const auto progress=progress_;
  try{
   auto task=std::make_shared<std::packaged_task<Result()>>([work=std::move(work),progress]()mutable{
    try{return work(progress);}catch(const std::exception& error){return Result{Result::Failed,progress.written(),error.what()};}
   });
   auto future=task->get_future();executor_([task]{(*task)();});worker_=std::move(future);
  }catch(const std::exception& error){immediate_=Result{Result::Failed,progress.written(),error.what()};}
  catch(...){immediate_=Result{Result::Failed,progress.written(),"Unknown export scheduling failure"};}
  return true;
 }
 std::optional<Result> poll(){
  if(immediate_){auto result=std::move(immediate_);immediate_.reset();reserved_=false;return result;}
  if(!worker_.valid()||worker_.wait_for(std::chrono::seconds(0))!=std::future_status::ready)return {};
  reserved_=false;
  try{return worker_.get();}catch(const std::exception& error){return Result{Result::Failed,progress_.written(),error.what()};}
  catch(...){return Result{Result::Failed,progress_.written(),"Unknown export worker failure"};}
 }
private:
 PreviewExecutor executor_;
 std::optional<DocumentSnapshot> snapshot_;
 ExportProgress progress_;
 std::future<Result> worker_;
 std::optional<Result> immediate_;
 bool reserved_=false;
};
}
