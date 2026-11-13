#pragma once
#include "selection_tools.h"
#include "preview_task.h"

namespace moon::workspace {
// Port of Legacy MagicWandGesture. The editor already owns the displayed value;
// this state machine returns the action instead of retaining a second mask.
class WandGesture {
public:
 enum class Action { Discard, Preview, Commit };
 void begin(){++sequence_;released_=ended_=ready_=false;}
 std::uint64_t request(){ready_=false;return ++sequence_;}
 Action accept(std::uint64_t sequence){
  if(ended_||sequence!=sequence_)return Action::Discard;
  ready_=true;if(released_){ended_=true;return Action::Commit;}return Action::Preview;
 }
 bool release(){if(ended_)return false;released_=true;if(!ready_)return false;ended_=true;return true;}
 void cancel(){ended_=true;}
private:
 std::uint64_t sequence_=0;
 bool released_=false,ended_=true,ready_=false;
};

class WandPreviewController {
public:
 struct Context {
  std::uint64_t document=0,contentRevision=0;
  std::string layer,frame;
  bool operator==(const Context& other)const{return document==other.document&&contentRevision==other.contentRevision&&layer==other.layer&&frame==other.frame;}
 };
 struct Update {
  enum Kind { None, Preview, Commit, Failed } kind=None;
  std::optional<SelectionMask> selection;
  std::string error;
 };
 using Work=std::function<std::optional<SelectionMask>()>;
 using Capture=std::function<Work(SelectionPoint)>;
 explicit WandPreviewController(PreviewExecutor executor=backgroundPreviewExecutor()):executor_(std::move(executor)){}
 WandPreviewController(const WandPreviewController&)=delete;
 WandPreviewController& operator=(const WandPreviewController&)=delete;
 void begin(Context context,std::shared_ptr<const std::vector<std::uint32_t>> source){
  cancel();context_=std::move(context);source_=std::move(source);lastPoint_.reset();gesture_.begin();
 }
 void cancel(){++generation_;pending_.reset();gesture_.cancel();source_.reset();}
 bool hasSource()const{return bool(source_);}
 std::size_t pendingCount()const{return std::size_t(worker_.valid())+std::size_t(pending_.has_value());}
 bool matches(const Context& context)const{return context_==context;}
 bool matches(std::uint64_t document,std::uint64_t revision,const std::string& layer,const std::string& frame)const{return context_.document==document&&context_.contentRevision==revision&&context_.layer==layer&&context_.frame==frame;}
 std::uint64_t document()const{return context_.document;}
 const std::shared_ptr<const std::vector<std::uint32_t>>& source()const{return source_;}
 bool request(SelectionPoint point){
  if(lastPoint_&&lastPoint_->x==point.x&&lastPoint_->y==point.y)return false;
  lastPoint_=point;pending_=point;pendingSequence_=gesture_.request();return true;
 }
 bool release(){return gesture_.release();}
 // Used only by existing synchronous GUI diagnostics, never the event loop.
 void waitForSmoke()const{if(worker_.valid())worker_.wait();}
 Update poll(bool accepting,const Capture& capture){
  Update update;
  if(worker_.valid()&&worker_.wait_for(std::chrono::seconds(0))==std::future_status::ready){
   std::optional<SelectionMask> selection;
   try{selection=worker_.get();}
   catch(const std::exception& error){
    if(accepting&&workerGeneration_==generation_){cancel();return {Update::Failed,{},error.what()};}
    return {};
   }
   if(accepting&&workerGeneration_==generation_&&!pending_){
    const auto action=gesture_.accept(workerSequence_);
    if(action!=WandGesture::Action::Discard)update={action==WandGesture::Action::Commit?Update::Commit:Update::Preview,std::move(selection),{}};
   }
  }
  if(pending_&&!worker_.valid()){
   const auto point=*pending_;pending_.reset();workerGeneration_=generation_;workerSequence_=pendingSequence_;
   try{
    auto task=std::make_shared<std::packaged_task<std::optional<SelectionMask>()>>(capture(point));
    auto future=task->get_future();executor_([task]{(*task)();});worker_=std::move(future);
   }catch(const std::exception& error){cancel();return {Update::Failed,{},error.what()};}
  }
  return update;
 }
private:
 PreviewExecutor executor_;
 WandGesture gesture_;
 Context context_;
 std::shared_ptr<const std::vector<std::uint32_t>> source_;
 std::future<std::optional<SelectionMask>> worker_;
 std::optional<SelectionPoint> pending_,lastPoint_;
 std::uint64_t generation_=0,workerGeneration_=0,pendingSequence_=0,workerSequence_=0;
};
}
