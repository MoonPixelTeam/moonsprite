#include "document.h"
#include <set>
namespace moon {
std::shared_ptr<const Document::RollbackPayload> Document::captureRollbackPayload()const{auto p=std::make_shared<RollbackPayload>();p->outline=outlineSettings_;p->width=width_;p->height=height_;p->timeline=timeline_.state();p->displayedLayerGeometry=displayedLayerGeometry_;p->palette=palette_;p->brushes=projectBrushes_;p->references=referenceImages_;p->slices=sliceState_;p->slices.selected.clear();p->symmetry=symmetryCenter_;p->loop=animationLoop_;p->pixelGrid=showPixelGrid_;p->customGridVisible=showCustomGrid_;p->grid=customGrid_;p->activeLayer=activeLayerId_;p->activeFrame=activeFrameId_;p->collapsed=collapsedGroupIds_;p->archive=sourceArchive_;p->information=projectInformation_;p->timelapse=timelapseSettings_;return p;}
std::shared_ptr<const Document::RollbackPayload> Document::takeRollbackPayload()&&{
 auto p=std::make_shared<RollbackPayload>();p->outline=outlineSettings_;p->width=width_;p->height=height_;p->timeline=std::move(timeline_.state_);p->displayedLayerGeometry=std::move(displayedLayerGeometry_);p->palette=std::move(palette_);p->brushes=std::move(projectBrushes_);p->references=std::move(referenceImages_);p->slices=std::move(sliceState_);p->slices.selected.clear();p->symmetry=std::move(symmetryCenter_);p->loop=animationLoop_;p->pixelGrid=showPixelGrid_;p->customGridVisible=showCustomGrid_;p->grid=customGrid_;p->activeLayer=std::move(activeLayerId_);p->activeFrame=std::move(activeFrameId_);p->collapsed=std::move(collapsedGroupIds_);p->archive=std::move(sourceArchive_);p->information=std::move(projectInformation_);p->timelapse=std::move(timelapseSettings_);return p;
}
void Document::exchangeRollbackPayload(RollbackReplay& prepared)noexcept{
 auto& value=prepared.payload;
 std::swap(projectInformation_,value.information);std::swap(width_,value.width);std::swap(height_,value.height);
 std::swap(timeline_,prepared.timeline);displayedLayerGeometry_.swap(value.displayedLayerGeometry);
 outlineSettings_.swap(value.outline);std::swap(palette_,value.palette);projectBrushes_.swap(value.brushes);
 std::swap(projectBrushRevision_,prepared.brushRevision);std::swap(referenceImages_,value.references);
 std::swap(sliceState_,value.slices);symmetryCenter_.swap(value.symmetry);std::swap(animationLoop_,value.loop);
 std::swap(showPixelGrid_,value.pixelGrid);std::swap(showCustomGrid_,value.customGridVisible);std::swap(customGrid_,value.grid);
 activeLayerId_.swap(value.activeLayer);activeFrameId_.swap(value.activeFrame);collapsedGroupIds_.swap(value.collapsed);sourceArchive_.swap(value.archive);
 selection_.swap(prepared.pixelsSelection);std::swap(selectionRevision_,prepared.selectionRevision);
 std::swap(timelineSelection_,prepared.selection);selectedGroupIds_.swap(prepared.groups);selectedGroupId_.swap(prepared.groupFocus);
 selectedFrames_.swap(prepared.frames);frameAnchor_.swap(prepared.frameAnchor);std::swap(selectionPivotHistory_,prepared.pivot);
 std::swap(change_,prepared.damage);prepared.applied=!prepared.applied;
}
void Document::applyPreparedRollback(RollbackReplay& prepared){
 // Recording settings historically restore before content. Keep that order,
 // but retain the displaced settings until both callback and content succeed.
 if(!prepared.preserveRecording){
  std::swap(timelapseSettings_,prepared.payload.timelapse);
  try{if(recordingBinding_.restore)recordingBinding_.restore(timelapseSettings_);}
  catch(...){
   const auto failure=std::current_exception();std::swap(timelapseSettings_,prepared.payload.timelapse);
   try{if(recordingBinding_.restore)recordingBinding_.restore(timelapseSettings_);}catch(...){throw HistoryReplayError({failure,std::current_exception()});}
   std::rethrow_exception(failure);
  }
 }
 exchangeRollbackPayload(prepared);
 try{projectActiveCelOpacities();}catch(...){
  const auto failure=std::current_exception();exchangeRollbackPayload(prepared);
  if(!prepared.preserveRecording){
   std::swap(timelapseSettings_,prepared.payload.timelapse);
   try{if(recordingBinding_.restore)recordingBinding_.restore(timelapseSettings_);}catch(...){throw HistoryReplayError({failure,std::current_exception()});}
  }
  std::rethrow_exception(failure);
 }
}
void Document::applyRollbackPayload(const RollbackPayload& payload,bool preserveRecording,const std::string* viewedFrame,std::unique_ptr<RollbackReplay>* retained){
 if(retained&&*retained){applyPreparedRollback(**retained);return;}
 // The required target snapshot is the only full payload copy. Displaced live
 // resources remain in this prepared node through no-allocation exchanges.
 auto prepared=std::make_unique<RollbackReplay>(payload);prepared->timeline.synchronizeLinkedLayers();
 if(viewedFrame&&prepared->timeline.hasFrame(*viewedFrame))prepared->payload.activeFrame=*viewedFrame;
 prepared->preserveRecording=preserveRecording;prepared->brushRevision=projectBrushRevision_+1;
 prepared->selectionRevision=selectionRevision_+1;prepared->pivot.serial=selectionPivotHistory_.serial+1;
 prepared->damage={0,0,prepared->payload.width,prepared->payload.height};
 if(retained){*retained=std::move(prepared);applyPreparedRollback(**retained);}
 else applyPreparedRollback(*prepared);
}
bool Document::rollbackProject(const Document& backup){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);if(active()||backup.active())return false;auto before=captureRollbackPayload(),after=backup.captureRollbackPayload();std::size_t bytes=0;std::set<const void*> seen;auto buffer=[&](const auto& values){if(!values.empty()&&seen.insert(values.data()).second)bytes+=values.size()*sizeof(values[0]);};for(const auto& p:{before,after}){if(p->palette.independentOrder)buffer(*p->palette.independentOrder);for(const auto& f:p->timelapse.snapshots)buffer(f.data);for(const auto& c:p->timeline.cels)if(c.surface){buffer(c.surface->pixels);if(c.text){buffer(c.text->text);buffer(c.text->styleRuns);buffer(c.text->transforms);}}for(const auto& image:p->references)if(image.pixels)buffer(*image.pixels);for(const auto& resource:p->brushes){buffer(resource.brush.coverage);buffer(resource.brush.colors);buffer(resource.brush.paintColors);}}Edit e{{},state_,nextState_};e.snapshotHistory.beforeRollback=std::move(before);e.snapshotHistory.afterRollback=std::move(after);e.snapshotHistory.rollbackBytes=bytes;reserveHistoryEntries();applyEdit(e,true);publishChange(true);pushEdit(std::move(e),U"回档工程备份");return true;}
}
