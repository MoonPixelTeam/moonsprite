#include "image_resize_task.h"
#include <thread>
#include "image_import_limits.h"
#include "sheet_import_storage.h"
#include "image_scale_detection.h"
namespace moon {
ImageResizeTask::ImageResizeTask(const Document& d,int w,int h,ImageInterpolation method,Executor executor,bool detectOnly)
 :identity_(d.identity()),revision_(d.revision()),content_(d.contentRevision()),layer_(d.layer().id),frame_(d.frame().id),sw_(d.width()),sh_(d.height()),width_(w),height_(h),method_(method),detection_(detectOnly),executor_(std::move(executor)){
 if(d.active())throw std::runtime_error("Finish active edit before image resize");validateImportedImageDimensions(w,h);
 std::uint64_t bytes=sheetImportResourceBytes(d.timeline().state());for(const auto& c:d.timeline().state().cels)if(c.surface)bytes+=c.surface->pixels.size()*sizeof(Pixel);for(const auto& m:d.timeline().state().masks)bytes+=m.mask.surface.pixels.size()*sizeof(Pixel);if(d.selection()){const auto& s=*d.selection();bytes+=s.mask.size();selection_=SelectionMask{s.x,s.y,s.width,s.height,{}};selectionData_=s.mask.data();selectionSize_=s.mask.size();}if(bytes>256ull*1024*1024)throw std::length_error("Image resize snapshot exceeds working pixel budget");
 capture_=std::make_unique<RasterSnapshot>(d.timeline().state());
 if(!executor_)executor_=[](std::function<void()> fn){std::thread(std::move(fn)).detach();};
}
ImageResizeTask::~ImageResizeTask(){if(work_)work_->cancelled=true;}
bool ImageResizeTask::matches(const Document& d)const{return !d.active()&&d.identity()==identity_&&d.revision()==revision_&&d.contentRevision()==content_&&d.width()==sw_&&d.height()==sh_&&d.layer().id==layer_&&d.frame().id==frame_&&bool(d.selection())==bool(selection_)&&(!selection_||(d.selection()->x==selection_->x&&d.selection()->y==selection_->y&&d.selection()->width==selection_->width&&d.selection()->height==selection_->height&&d.selection()->mask.size()==selectionSize_&&d.selection()->mask.data()==selectionData_));}
void ImageResizeTask::cancel(){if(work_)work_->cancelled=true;capture_.reset();phase_=Phase::Cancelled;}
void ImageResizeTask::tick(const Document& d){
 if(!busy())return;if(!matches(d)){cancel();error_="Document changed during image resize";phase_=Phase::Failed;return;}
 try{
  if(phase_==Phase::Capturing){if(selectionCopied_<selectionSize_){auto& target=selection_->mask;if(!selectionCopied_)target.reserve(selectionSize_);const auto count=std::min(selectionSize_-selectionCopied_,RasterSnapshot::tickPixels*sizeof(Pixel));target.insert(target.end(),selectionData_+selectionCopied_,selectionData_+selectionCopied_+count);selectionCopied_+=count;return;}if(!capture_->advance(d.timeline().state(),std::chrono::steady_clock::now()+std::chrono::milliseconds(2)))return;
   auto state=capture_->take();capture_.reset();auto work=std::make_shared<Work>();work_=work;const auto layer=layer_,frame=frame_;const auto sw=sw_,sh=sh_,w=width_,h=height_;const auto method=method_;const bool detection=detection_;auto selection=selection_;phase_=Phase::Working;
   executor_([work,state=std::move(state),selection=std::move(selection),layer,frame,sw,sh,w,h,method,detection]()mutable{
    try{if(work->cancelled)throw ImageResizeCancelled{};auto source=std::make_unique<Document>(1,1);source->width_=sw;source->height_=sh;source->timeline_=timeline::Timeline(std::move(state));source->activeLayerId_=layer;source->activeFrameId_=frame;source->setSelectionValue(std::move(selection));
     ImageResizeCancellationScope cancellation(&work->cancelled);if(detection)work->detectedScale=detectDocumentPixelScale(source->timeline_,frame,sw,sh,[work]{return work->cancelled.load();});else source->resizeImage(w,h,method);if(work->cancelled)throw ImageResizeCancelled{};work->result=std::move(source);
    }catch(const ImageResizeCancelled&){}catch(const std::exception& error){work->error=error.what();}work->ready=true;
   });return;
  }
  if(work_&&work_->ready.load()){if(work_->cancelled){phase_=Phase::Cancelled;return;}if(!work_->error.empty()){error_=work_->error;phase_=Phase::Failed;}else if(work_->result)phase_=Phase::Ready;else{error_="Image resize produced no result";phase_=Phase::Failed;}}
 }catch(const std::exception& error){if(work_)work_->cancelled=true;capture_.reset();error_=error.what();phase_=Phase::Failed;}
}
bool ImageResizeTask::commit(Document& d){
 if(phase_!=Phase::Ready||detection_)return false;if(!matches(d)){error_="Document changed during image resize";phase_=Phase::Failed;return false;}
 try{
  auto& source=*work_->result;if(source.history_.empty()){phase_=Phase::Applied;return true;}
  auto edit=source.history_.takeLatest();edit.beforeState=d.state_;edit.afterState=d.nextState_;
  // Preserve live editing context rather than the worker's minimal context.
  if(edit.snapshotHistory.beforeTimeline){edit.beforeActive=edit.afterActive=d.activeLayerId_;edit.beforeFrame=edit.afterFrame=d.activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=d.timelineSelection_;edit.beforeSelection=edit.afterSelection=d.selectedFrames_;}
  d.reserveHistoryEntries();d.applyEdit(edit,true);d.change_={0,0,d.width_,d.height_};d.publishChange();d.pushEdit(std::move(edit),U"图像大小");phase_=Phase::Applied;work_->result.reset();return true;
 }catch(const std::exception& error){error_=error.what();phase_=Phase::Failed;return false;}
}
}
