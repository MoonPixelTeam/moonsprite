#pragma once
#include "document.h"
#include "preview_task.h"

namespace moon::workspace {
struct FilterPreviewUpdate {
 enum State { None, Changed, Close } state=None;
 enum Problem { NoProblem, TargetChanged, NoContent, Stale, Failed } problem=NoProblem;
 std::string error;
};

class AntiAliasPreviewController {
 PreviewTask<Document::AntiAliasSurfaceTask> task_;
 std::uint64_t document_=0;
 std::vector<Document::MaskSlotKey> masks_;
 AntiAliasOptions requestedOptions_;
 void captureOptions(){requestedOptions_=options;requestedOptions_.color=automatic?std::optional<Pixel>{}:std::optional<Pixel>{custom};}
public:
 AntiAliasOptions options;
 bool automatic=true,live=true;
 Pixel custom=0;
 explicit AntiAliasPreviewController(PreviewExecutor executor=backgroundPreviewExecutor()):task_(std::move(executor)){}
 bool begin(Document& document,const std::vector<Document::MaskSlotKey>& masks={}){
  end();if(!document.beginAntiAliasPreview(masks))return false;
  document_=document.identity();masks_=masks;options={};automatic=live=true;custom=document.palette().primary;return true;
 }
 void end(){task_.cancel();document_=0;masks_.clear();}
 bool busy()const{return task_.busy();}
 bool running()const{return task_.running();}
 std::size_t pendingCount()const{return task_.pendingCount();}
 bool committing()const{return task_.committing();}
 void change(Document& document,PreviewClock::time_point now=PreviewClock::now()){
  if(task_.committing())return;
  task_.cancel();if(document.identity()!=document_)return;
  if(document.restoreConvolutionBaseline()&&live){captureOptions();task_.request(document_,PreviewIntent::Preview,now+std::chrono::milliseconds(16));}
 }
 void apply(PreviewClock::time_point now=PreviewClock::now()){
  captureOptions();task_.request(document_,PreviewIntent::ApplyAndClose,now);
 }
 FilterPreviewUpdate poll(Document& document,PreviewClock::time_point now=PreviewClock::now()){
  auto result=task_.poll(document.identity(),[&]{return document.captureAntiAliasSurfaceTask(requestedOptions_);},Document::runAntiAliasSurfaceTask,now);
  if(!result)return {};
  task_.acknowledge();
  if(result->cancelled)return {FilterPreviewUpdate::Changed};
  if(!result->error.empty())return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::Failed,result->error};
  if(!result->task)return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::TargetChanged};
  if(std::none_of(result->task->surfaces.produced.begin(),result->task->surfaces.produced.end(),[](auto b){return b!=0;}))return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::NoContent};
  if(!document.publishAntiAliasSurfaceTask(std::move(*result->task)))return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::Stale};
  if(result->request.intent!=PreviewIntent::Preview){
   if(document.commitAntiAliasAdjustment()){end();return {FilterPreviewUpdate::Close};}
   if(!document.colorAdjustmentActive())document.beginAntiAliasPreview(masks_);
   return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::NoContent};
  }
  return {FilterPreviewUpdate::Changed};
 }
};

class ConvolutionPreviewController {
 PreviewTask<Document::ConvolutionSurfaceTask> task_;
 std::uint64_t document_=0,revision_=0;
 std::vector<std::string> layers_;
 ConvolutionOptions requestedOptions_;
public:
 ConvolutionOptions options;
 bool live=true;
 std::optional<std::uint64_t> applied;
 explicit ConvolutionPreviewController(PreviewExecutor executor=backgroundPreviewExecutor()):task_(std::move(executor)){}
 bool begin(Document& document,const std::vector<std::string>& layers={}){
  end();if(!document.beginColorAdjustment(layers))return false;
  document_=document.identity();layers_=layers;options={};live=true;applied.reset();return true;
 }
 void end(){task_.cancel();document_=0;layers_.clear();}
 bool busy()const{return task_.busy();}
 bool running()const{return task_.running();}
 std::size_t pendingCount()const{return task_.pendingCount();}
 bool committing()const{return task_.committing();}
 void change(Document& document,bool optionsChanged=true,PreviewClock::time_point now=PreviewClock::now()){
  if(task_.committing())return;
  task_.cancel();if(optionsChanged)++revision_;
  if(document.identity()!=document_)return;
  if(document.restoreConvolutionBaseline()&&live){requestedOptions_=options;task_.request(document_,PreviewIntent::Preview,now+std::chrono::milliseconds(40),revision_);}
 }
 bool apply(bool close,PreviewClock::time_point now=PreviewClock::now()){
  if(close&&applied&&*applied==revision_)return true;
  requestedOptions_=options;task_.request(document_,close?PreviewIntent::ApplyAndClose:PreviewIntent::Apply,now,revision_);return false;
 }
 FilterPreviewUpdate poll(Document& document,PreviewClock::time_point now=PreviewClock::now()){
  auto result=task_.poll(document.identity(),[&]{return document.captureConvolutionSurfaceTask(requestedOptions_);},Document::runConvolutionSurfaceTask,now);
  if(!result)return {};
  task_.acknowledge();
  if(result->cancelled)return {FilterPreviewUpdate::Changed};
  if(!result->error.empty())return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::Failed,result->error};
  if(!result->task)return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::TargetChanged};
  if(std::none_of(result->task->produced.begin(),result->task->produced.end(),[](auto b){return b!=0;}))return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::NoContent};
  if(!document.publishConvolutionSurfaceTask(std::move(*result->task)))return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::Stale};
  if(result->request.intent!=PreviewIntent::Preview){
   if(document.commitConvolutionAdjustment()){
    applied=result->request.revision;
    if(result->request.intent==PreviewIntent::ApplyAndClose){end();return {FilterPreviewUpdate::Close};}
    document.beginColorAdjustment(layers_);
   }else{
    if(!document.colorAdjustmentActive())document.beginColorAdjustment(layers_);
    return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::NoContent};
   }
  }
  return {FilterPreviewUpdate::Changed};
 }
};

class GradientMapPreviewController {
 PreviewTask<Document::GradientMapTask> task_;
 std::uint64_t document_=0;
 GradientMapSettings options_;
 std::u32string label_;
public:
 explicit GradientMapPreviewController(PreviewExecutor executor=backgroundPreviewExecutor()):task_(std::move(executor)){}
 void end(){task_.cancel();document_=0;}
 bool busy()const{return task_.busy();}
 bool running()const{return task_.running();}
 std::size_t pendingCount()const{return task_.pendingCount();}
 bool committing()const{return task_.committing();}
 void request(Document& document,const GradientMapSettings& options,bool preview,bool apply,std::u32string label){
  if(task_.committing()&&!apply)return;
  task_.cancel();if(document_&&document.identity()!=document_)return;
  document_=document.identity();options_=options;label_=std::move(label);
  if(document.restoreGradientMapBaseline()&&(apply||preview))task_.request(document_,apply?PreviewIntent::ApplyAndClose:PreviewIntent::Preview,PreviewClock::now());
 }
 FilterPreviewUpdate poll(Document& document,PreviewClock::time_point now=PreviewClock::now()){
  const auto options=options_;
  auto result=task_.poll(document.identity(),[&]{return document.captureGradientMapTask();},[options](auto& task,const auto& cancelled){return Document::runGradientMapTask(task,options,cancelled);},now);
  if(!result)return {};
  task_.acknowledge();
  if(result->cancelled)return {FilterPreviewUpdate::Changed};
  if(!result->error.empty())return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::Failed,result->error};
  if(!result->task)return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::Stale};
  if(!document.publishGradientMapTask(std::move(*result->task)))return {FilterPreviewUpdate::Changed,FilterPreviewUpdate::Stale};
  if(result->request.intent!=PreviewIntent::Preview){Document::HistoryLabelScope label(document,label_);document.commitColorAdjustment();end();return {FilterPreviewUpdate::Close};}
  return {FilterPreviewUpdate::Changed};
 }
};

// The modal owns its typed payload and its original document independently of
// the UI's Pending routing enum. Workers still own detached snapshots only.
template<class Controller> class ColorPreviewSession {
 std::weak_ptr<Document> owner_;
 std::uint64_t identity_=0,preview_=0;
public:
 Controller controller;
 ColorPreviewSession()=default;
 explicit ColorPreviewSession(PreviewExecutor executor):controller(std::move(executor)){}
 ~ColorPreviewSession(){end();}
 ColorPreviewSession(const ColorPreviewSession&)=delete;
 ColorPreviewSession& operator=(const ColorPreviewSession&)=delete;
 void bind(const std::shared_ptr<Document>& owner){
  if(!owner)throw std::invalid_argument("Missing preview session document");
  end();owner_=owner;identity_=owner->identity();
 }
 template<class... Args> bool begin(const std::shared_ptr<Document>& owner,Args&&... args){
  bind(owner);
  try{if(controller.begin(*owner,std::forward<Args>(args)...)){adoptPreview();return true;}}
  catch(...){adoptPreview();end();throw;}
  end();return false;
 }
 void adoptPreview(){if(auto owner=owner_.lock();owner&&owner->identity()==identity_)preview_=owner->colorAdjustmentSession();}
 bool active()const{return identity_!=0;}
 void end(){
  controller.end();
  const auto identity=std::exchange(identity_,0);
  const auto preview=std::exchange(preview_,0);
  if(auto owner=owner_.lock();identity&&owner&&owner->identity()==identity&&preview&&owner->colorAdjustmentSession()==preview)owner->cancelColorAdjustment();
  owner_.reset();
 }
 FilterPreviewUpdate poll(Document& active,PreviewClock::time_point now=PreviewClock::now()){
  const auto owner=owner_.lock();
  if(identity_&&(!owner||owner.get()!=&active||identity_!=active.identity()||preview_!=active.colorAdjustmentSession())){end();return {FilterPreviewUpdate::Close,FilterPreviewUpdate::TargetChanged};}
  const auto result=controller.poll(active,now);
  // An explicit convolution Apply can reopen a fresh baseline in this call.
  if(identity_)adoptPreview();
  return result;
 }
};

// Preset/LCD retains its existing immediate-capture, latest-pending protocol.
// The worker owns only a detached task; it never retains a Document or UI.
class PresetFilterPreviewController {
public:
 struct Result {Document::FilterPreviewTask task;std::uint64_t generation=0;bool apply=false,completed=false;std::string error;};
 using Launch=std::function<std::future<Result>(std::function<Result()>)>;
 struct Update {std::optional<bool> applied;bool changed=false;};
 explicit PresetFilterPreviewController(std::uint64_t identity,Launch launch=[](auto work){return std::async(std::launch::async,std::move(work));}):identity_(identity),launch_(std::move(launch)){}
 ~PresetFilterPreviewController(){if(token_)token_->store(true);}
 PresetFilterPreviewController(const PresetFilterPreviewController&)=delete;
 PresetFilterPreviewController& operator=(const PresetFilterPreviewController&)=delete;
 bool valid(const Document& document)const{return document.identity()==identity_;}
 bool busy()const{return worker_.valid()||queued_.has_value();}
 bool published()const{return published_;}
 bool finished()const{return finished_;}
 void preview(Document& document,std::optional<PresetFilterOptions> options){
  if(finished_)return;invalidate(document);if(valid(document)&&options){queued_=*options;queuedApply_=false;startPending(document);}
 }
 void apply(Document& document,PresetFilterOptions options){if(finished_)return;invalidate(document);if(!valid(document))return;queued_=options;queuedApply_=true;startPending(document);}
 Update poll(Document& document){
  Update update;
  // Visiting another owner invalidates both running and queued requests. A
  // later return to the original tab must not revive an old transaction.
  if(!valid(document))invalidate(document);
  if(worker_.valid()&&worker_.wait_for(std::chrono::seconds(0))==std::future_status::ready){
   std::optional<Result> completed;
   try{completed=worker_.get();}catch(...){if(!finished_&&valid(document)&&runningGeneration_==generation_)throw;}
   if(completed&&!finished_&&valid(document)&&completed->generation==generation_){
    auto& result=*completed;
    if(!result.error.empty())throw std::runtime_error(result.error);
    if(result.completed){
     if(result.apply){const bool ok=document.commitFilterPreviewTask(std::move(result.task));finished_=ok;update.applied=ok;}
     else published_=document.publishFilterPreviewTask(std::move(result.task));
     update.changed=true;
    }else if(result.apply)update.applied=false;
   }
  }
  startPending(document);return update;
 }
 void end(Document& document){
  std::exception_ptr failure;
  try{end();}catch(...){failure=std::current_exception();}
  if(valid(document))document.cancelFilterPreview();
  if(failure)std::rethrow_exception(failure);
 }
 void end(){
  finished_=true;if(token_)token_->store(true);++generation_;queued_.reset();published_=false;
  if(worker_.valid())worker_.get();
 }
private:
 void invalidate(Document& document){if(token_)token_->store(true);++generation_;queued_.reset();published_=false;if(valid(document))document.restoreFilterPreview();}
 void startPending(Document& document){
  if(!queued_||worker_.valid()||!valid(document))return;
  const auto options=*queued_;const bool apply=queuedApply_;queued_.reset();
  auto task=document.captureFilterPreviewTask(options.preset,options.opacity,options.lcd,options.lcdWidth,options.lcdHeight);if(!task)throw std::runtime_error("Filter target changed");
  token_=std::make_shared<std::atomic<bool>>(false);auto cancel=token_;const auto current=generation_;
  runningGeneration_=current;
  worker_=launch_([task=std::move(*task),cancel,current,apply]()mutable{
   Result result{std::move(task),current,apply};
   try{result.completed=Document::runFilterPreviewTask(result.task,[cancel]{return cancel->load();});}catch(const std::exception& e){result.error=e.what();}
   return result;
  });
 }
 const std::uint64_t identity_;Launch launch_;
 std::future<Result> worker_;std::shared_ptr<std::atomic<bool>> token_;
 std::optional<PresetFilterOptions> queued_;bool queuedApply_=false,published_=false,finished_=false;std::uint64_t generation_=0,runningGeneration_=0;
};

}
