#include "document.h"
#include "timelapse_session.h"
#include <set>
namespace moon {
std::shared_ptr<const Document::RollbackPayload> Document::captureRollbackPayload()const{auto p=std::make_shared<RollbackPayload>();p->width=width_;p->height=height_;p->timeline=timeline_.state();p->displayedLayerGeometry=displayedLayerGeometry_;p->palette=palette_;p->brushes=projectBrushes_;p->references=referenceImages_;p->slices=sliceState_;p->slices.selected.clear();p->symmetry=symmetryCenter_;p->loop=animationLoop_;p->pixelGrid=showPixelGrid_;p->customGridVisible=showCustomGrid_;p->grid=customGrid_;p->activeLayer=activeLayerId_;p->activeFrame=activeFrameId_;p->collapsed=collapsedGroupIds_;p->archive=sourceArchive_;p->information=projectInformation_;p->timelapse=timelapseSettings_;return p;}
std::shared_ptr<const Document::RollbackPayload> Document::takeRollbackPayload()&&{
 auto p=std::make_shared<RollbackPayload>();p->width=width_;p->height=height_;p->timeline=std::move(timeline_.state_);p->displayedLayerGeometry=std::move(displayedLayerGeometry_);p->palette=std::move(palette_);p->brushes=std::move(projectBrushes_);p->references=std::move(referenceImages_);p->slices=std::move(sliceState_);p->slices.selected.clear();p->symmetry=std::move(symmetryCenter_);p->loop=animationLoop_;p->pixelGrid=showPixelGrid_;p->customGridVisible=showCustomGrid_;p->grid=customGrid_;p->activeLayer=std::move(activeLayerId_);p->activeFrame=std::move(activeFrameId_);p->collapsed=std::move(collapsedGroupIds_);p->archive=std::move(sourceArchive_);p->information=std::move(projectInformation_);p->timelapse=std::move(timelapseSettings_);return p;
}
void Document::applyRollbackPayload(const RollbackPayload& p,bool preserveRecording,const std::string* viewedFrame){
 // Allocate and validate all replacement state before touching the live document.
 auto prepared=p;timeline::Timeline restored(std::move(prepared.timeline));
 restored.synchronizeLinkedLayers();
 if(viewedFrame&&restored.hasFrame(*viewedFrame))prepared.activeFrame=*viewedFrame;
 if(!preserveRecording){timelapseSettings_=std::move(prepared.timelapse);if(auto session=recordingSession())session->restoreSettings(timelapseSettings_);}
 projectInformation_=std::move(prepared.information);width_=prepared.width;height_=prepared.height;timeline_=std::move(restored);displayedLayerGeometry_=std::move(prepared.displayedLayerGeometry);
 palette_=std::move(prepared.palette);projectBrushes_=std::move(prepared.brushes);referenceImages_=std::move(prepared.references);sliceState_=std::move(prepared.slices);symmetryCenter_=std::move(prepared.symmetry);
 animationLoop_=prepared.loop;showPixelGrid_=prepared.pixelGrid;showCustomGrid_=prepared.customGridVisible;customGrid_=prepared.grid;
 activeLayerId_=std::move(prepared.activeLayer);activeFrameId_=std::move(prepared.activeFrame);collapsedGroupIds_=std::move(prepared.collapsed);sourceArchive_=std::move(prepared.archive);
 selection_.reset();clearTimelineSelection();selectionPivotHistory_.pivot.reset();++selectionPivotHistory_.serial;projectActiveCelOpacities();change_={0,0,width_,height_};
}
bool Document::rollbackProject(const Document& backup){if(active()||backup.active())return false;auto before=captureRollbackPayload(),after=backup.captureRollbackPayload();std::size_t bytes=0;std::set<const void*> seen;auto buffer=[&](const auto& values){if(!values.empty()&&seen.insert(values.data()).second)bytes+=values.size()*sizeof(values[0]);};for(const auto& p:{before,after}){if(p->palette.independentOrder)buffer(*p->palette.independentOrder);for(const auto& f:p->timelapse.snapshots)buffer(f.data);for(const auto& c:p->timeline.cels)if(c.surface){buffer(c.surface->pixels);if(c.text){buffer(c.text->text);buffer(c.text->styleRuns);buffer(c.text->transforms);}}for(const auto& image:p->references)if(image.pixels)buffer(*image.pixels);for(const auto& resource:p->brushes){buffer(resource.brush.coverage);buffer(resource.brush.colors);buffer(resource.brush.paintColors);}}Edit e{{},state_,nextState_};e.beforeRollback=std::move(before);e.afterRollback=std::move(after);e.rollbackBytes=bytes;history_.reserve(position_+1);applyEdit(e,true);publishChange(true);pushEdit(std::move(e),U"回档工程备份");return true;}
}
