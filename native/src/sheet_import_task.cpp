#include "sheet_import_task.h"
#include <thread>
#include <cmath>
namespace moon {
SheetImportTask::SheetImportTask(const Document& d,SheetImportOptions options,Executor executor)
 :options_(std::move(options)),identity_(d.identity()),content_(d.contentRevision()),revision_(d.revision()),layer_(d.layer().id),frame_(d.frame().id),width_(d.width()),height_(d.height()),executor_(std::move(executor)){
 if(d.active())throw std::runtime_error("Commit or cancel active operation before importing");
 if(options_.selection&&!options_.selectionSnapshot){if(!d.selection())throw std::runtime_error("Pixel selection missing");options_.selectionSnapshot=std::make_shared<const SelectionMask>(*d.selection());}
 validateSpriteSheetImportAllocation(d,options_);const auto* selection=sheetImportSelection(d,options_);total_=planSpriteSheetImport(selection?selection->width:width_,selection?selection->height:height_,options_).tiles.size();
 capture_=std::make_unique<RasterSnapshot>(d.timeline().state());
 if(!executor_)executor_=[](std::function<void()> fn){std::thread(std::move(fn)).detach();};
}
SheetImportTask::~SheetImportTask(){if(work_)work_->cancelled=true;}
bool SheetImportTask::matches(const Document& d)const{return !d.active()&&d.identity()==identity_&&d.contentRevision()==content_&&d.frame().id==frame_&&d.width()==width_&&d.height()==height_;}
void SheetImportTask::cancel(){if(work_)work_->cancelled=true;capture_.reset();phase_=Phase::Cancelled;}
void SheetImportTask::tick(const Document& d){
 if(!busy())return;
 if(!matches(d)){if(work_)work_->cancelled=true;capture_.reset();error_="Document changed during sprite sheet import";phase_=Phase::Failed;return;}
 try{
  if(phase_==Phase::Capturing){if(!capture_->advance(d.timeline().state(),std::chrono::steady_clock::now()+std::chrono::milliseconds(2)))return;auto state=capture_->take();capture_.reset();auto work=std::make_shared<Work>();work_=work;const auto options=options_;const auto layer=layer_,frame=frame_;const auto width=width_,height=height_;const auto revision=revision_;phase_=Phase::Working;
   executor_([work,state=std::move(state),options,layer,frame,width,height,revision]()mutable{
    try{if(work->cancelled)throw SheetImportCancelled{};Document source(1,1);source.width_=width;source.height_=height;source.timeline_=timeline::Timeline(std::move(state));source.activeLayerId_=layer;source.activeFrameId_=frame;source.revision_=revision;
     work->after=buildSpriteSheetImport(source,options,[work]{return work->cancelled.load();},[work](std::size_t n){work->frames=n;});
     if(work->cancelled)throw SheetImportCancelled{};work->before=std::move(source.timeline_).takeState();
    }catch(const SheetImportCancelled&){}catch(const std::exception& error){work->error=error.what();}work->ready=true;
   });return;
  }
  if(work_&&work_->ready.load()){if(work_->cancelled){phase_=Phase::Cancelled;return;}if(!work_->error.empty()){error_=work_->error;phase_=Phase::Failed;}else if(work_->before&&work_->after)phase_=Phase::Ready;else{error_="Sprite sheet import produced no result";phase_=Phase::Failed;}}
 }catch(const std::exception& error){if(work_)work_->cancelled=true;capture_.reset();error_=error.what();phase_=Phase::Failed;}
}
bool SheetImportTask::commit(Document& d,std::optional<TransformPoint> pivot){
 if(phase_!=Phase::Ready)return false;
 if(!matches(d)){error_="Document changed during sprite sheet import";phase_=Phase::Failed;return false;}
 try{if(pivot&&(!std::isfinite(pivot->x)||!std::isfinite(pivot->y)))throw std::invalid_argument("Invalid sprite sheet selection pivot");validateSpriteSheetImportAllocation(d,options_);install(d,options_,std::move(*work_->before),std::move(*work_->after),pivot);phase_=Phase::Applied;return true;}
 catch(const std::exception& error){error_=error.what();phase_=Phase::Failed;return false;}
}
bool SheetImportTask::install(Document& d,const SheetImportOptions& options,timeline::State before,timeline::State next,std::optional<TransformPoint> pivot){
Document::Edit e{{},d.state_,d.nextState_};e.beforeDimensions={{d.width_,d.height_}};e.afterDimensions={{options.width,options.height}};e.beforeTimeline=std::move(before);e.afterTimeline=std::move(next);e.beforeActive=d.activeLayerId_;e.beforeFrame=d.activeFrameId_;e.afterActive=e.afterTimeline->layers.front().id;e.afterFrame=e.afterTimeline->frames.front().id;e.pixelSelectionEdit=true;e.beforePixelsSelection=d.selection_;e.beforeTrimPivot.emplace(pivot);e.afterTrimPivot.emplace(std::nullopt);e.beforeSelection=d.selectedFrames_;e.afterSelection=std::vector<std::string>{};
 // Legacy mutateDocumentSession normalizes resource/timeline editing context
 // after flattening; preserve native structural Undo's original context.
 e.beforeTimelineSelection=d.timelineSelection_;Document::TimelineSelection target;target.layers={e.afterActive};target.layerAnchor=e.afterActive;e.afterTimelineSelection=target;e.beforeFrameAnchor=d.frameAnchor_;e.afterFrameAnchor=std::string{};
 e.maskContext=std::make_shared<Document::Edit::MaskContextHistory>(Document::Edit::MaskContextHistory{d.activeMaskId_,{},d.maskIsolated_,false});e.beforeGroupUi=Document::GroupUiSnapshot{d.selectedGroupIds_,d.collapsedGroupIds_,d.selectedGroupId_};e.afterGroupUi=Document::GroupUiSnapshot{};
 e.beforeTileSelection=d.tileSelection_;auto nextTiles=d.tileSelection_;nextTiles.tilesetId.clear();nextTiles.primary.clear();nextTiles.secondary.clear();e.afterTileSelection=nextTiles;
 e.beforeFreeTileSelection=Document::FreeTileSelectionSnapshot{d.freeInstanceSelected_,d.freeInstancePrimary_,d.freeInstanceAnchor_,d.freeInstanceSelectionFrame_,d.freeInstanceViewLayer_};e.afterFreeTileSelection=Document::FreeTileSelectionSnapshot{};
 d.reserveHistoryEntries();d.applyEdit(e,true);d.publishChange();d.pushEdit(std::move(e),U"导入精灵表");return true;
}
}
