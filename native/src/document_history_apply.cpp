#include "document.h"
#include "timeline_index_validation.h"
#include "document_history_target_validation.h"
#include <map>
#include <unordered_map>
#include <algorithm>
#include <stdexcept>
#include <utility>
#include <type_traits>

namespace moon {
namespace {
template<class Before,class After> void requireHistoryAfter(const Before& before,const After& after){
 if(before&&!after)throw std::logic_error("Incomplete paired history payload");
}
// Presence only; runtime owners may be created by preceding structural phases.
// One traversal at the replay boundary, never one traversal per nested child.
template<class Edit> void validateHistoryShape(const Edit& e){
 requireHistoryAfter(e.beforeAnimationSelection,e.afterAnimationSelection);
 if(!std::holds_alternative<std::monostate>(e.terminalHistory)){
  if(const auto* local=e.localSnapshot()){
   if(!local->beforeRollback||!local->afterRollback)throw std::logic_error("Incomplete local snapshot history");
  }else if(const auto* source=e.sourceProperties()){
   if(!source->before||!source->after)throw std::logic_error("Incomplete source properties history");
  }else if(!e.maskRaster()&&!e.localPixels()&&!e.tilemapPixels())throw std::logic_error("Missing terminal history payload");
  return; // Terminal replay deliberately ignores ordinary fields and children.
 }
 const auto& s=e.snapshotHistory;const auto& t=e.tileHistory;const auto& m=e.maskHistory;
 requireHistoryAfter(s.beforeRollback,s.afterRollback);
 requireHistoryAfter(s.beforeTimeline,s.afterTimeline);
 requireHistoryAfter(s.beforeColorMode,s.afterColorMode);
 if(s.beforeColorMode&&(*s.beforeColorMode==color_mode::Mode::Indexed||*s.afterColorMode==color_mode::Mode::Indexed))throw std::logic_error("Unsupported color mode history");
 if(s.colorModeResources&&(!s.beforeColorMode||s.beforeTimeline))throw std::logic_error("Invalid color mode resource history");
 requireHistoryAfter(s.beforeDimensions,s.afterDimensions);
 requireHistoryAfter(s.beforeScriptGeometry,s.afterScriptGeometry);
 requireHistoryAfter(t.beforeTilesetSlots,t.afterTilesetSlots);
 requireHistoryAfter(t.beforeTileSelection,t.afterTileSelection);
 requireHistoryAfter(t.beforeFreeTileSelection,t.afterFreeTileSelection);
 requireHistoryAfter(m.beforeMasks,m.afterMasks);
 requireHistoryAfter(e.sliceHistory.beforeSlices,e.sliceHistory.afterSlices);
 requireHistoryAfter(e.layerHistory.beforeLayerStructure,e.layerHistory.afterLayerStructure);
 if(e.layerHistory.copiedRowSelection&&(!e.layerHistory.beforeLayerStructure||!e.layerHistory.afterLayerStructure||!e.beforeTimelineSelection||!e.afterTimelineSelection||!e.layerHistory.beforeGroupUi||!e.layerHistory.afterGroupUi))throw std::logic_error("Incomplete copied row history");
 if(e.layerHistory.deletedRows!=decltype(e.layerHistory.deletedRows)::None&&(!e.layerHistory.beforeLayerStructure||!e.layerHistory.afterLayerStructure||!e.beforeTimelineSelection||!e.afterTimelineSelection||!e.layerHistory.beforeGroupUi||!e.layerHistory.afterGroupUi))throw std::logic_error("Incomplete deleted row history");
 if(e.layerHistory.groupRows!=decltype(e.layerHistory.groupRows)::None&&(!e.layerHistory.beforeLayerStructure||!e.layerHistory.afterLayerStructure||!e.beforeTimelineSelection||!e.afterTimelineSelection||!e.layerHistory.beforeGroupUi||!e.layerHistory.afterGroupUi))throw std::logic_error("Incomplete group structure history");
 requireHistoryAfter(e.pixelSelectionHistory.beforeTrimPivot,e.pixelSelectionHistory.afterTrimPivot);
 requireHistoryAfter(e.frameHistory.beforeAnimationLoop,e.frameHistory.afterAnimationLoop);
 if(e.children.empty()){
  requireHistoryAfter(e.paletteHistory.beforePalette,e.paletteHistory.afterPalette);
  requireHistoryAfter(e.frameHistory.beforeScriptDurations,e.frameHistory.afterScriptDurations);
  if(!e.frameHistory.targetFrameId.empty()&&(!e.frameHistory.beforeDuration||!e.frameHistory.afterDuration))throw std::logic_error("Incomplete frame duration history");
 }else for(const auto& child:e.children)validateHistoryShape(child);
}
// Whole-state snapshots can be checked independently of live owners. Validate
// their canonical indices before any parent resource or sibling writes, without
// copying surface buffers or running linked-layer synchronization on live state.
template<class Edit> void validateHistorySnapshots(const Edit& e,bool forward){
 if(!std::holds_alternative<std::monostate>(e.terminalHistory))return;
 if(e.snapshotHistory.beforeTimeline){
  const auto& state=*(forward?e.snapshotHistory.afterTimeline:e.snapshotHistory.beforeTimeline);
  std::unordered_map<std::string,std::size_t> layers,frames,cels;
  std::map<std::pair<std::string,std::string>,std::size_t> slots;
  timeline::index_detail::buildIndices(state,layers,frames,cels,slots);
 }
 for(const auto& child:e.children)validateHistorySnapshots(child,forward);
}
}
// Ordered domain phases; Document remains the only replay/transaction owner.
Document::HistoryReplayPlan::HistoryReplayPlan(const Edit& edit,bool forward):rollback(std::holds_alternative<std::monostate>(edit.terminalHistory)?edit.children.size():0),resources(edit,forward){
 if(!std::holds_alternative<std::monostate>(edit.terminalHistory))return;
 if(edit.pixelSelectionHistory.pixelSelectionEdit)pixelsSelection.emplace(forward?edit.pixelSelectionHistory.afterPixelsSelection:edit.pixelSelectionHistory.beforePixelsSelection);
 if(edit.sliceHistory.beforeSlices)slices=forward?edit.sliceHistory.afterSlices:edit.sliceHistory.beforeSlices;
 if(edit.pixelSelectionHistory.beforeTrimPivot)pivot=SelectionPivotHistory{0,forward?*edit.pixelSelectionHistory.afterTrimPivot:*edit.pixelSelectionHistory.beforeTrimPivot};
 if(edit.frameHistory.beforeAnimationLoop)loop=forward?edit.frameHistory.afterAnimationLoop:edit.frameHistory.beforeAnimationLoop;
 children.reserve(edit.children.size());
 for(const auto& child:edit.children)children.emplace_back(child,forward);
}
void Document::applyEdit(const Edit& edit,bool forward){
 validateHistoryShape(edit);validateHistorySnapshots(edit,forward);
 if(!edit.children.empty()&&history_targets::hasStableTargets(edit))history_targets::validateStableTargets(timeline_,edit,forward);
 HistoryReplayPlan plan(edit,forward);
 // Selection/focus is session metadata, separate from domain pixel ownership.
 // Capture it once for the entire replay, not once per child or per pixel.
 auto focus=captureAnimationSelection();auto collapsed=collapsedGroupIds_;
 auto freeSelection=FreeTileSelectionSnapshot{freeInstanceSelected_,freeInstancePrimary_,freeInstanceAnchor_,freeInstanceSelectionFrame_,freeInstanceViewLayer_};
 auto geometry=displayedLayerGeometry_;auto maskSelection=maskSelectionHistory_;
 const auto pivot=selectionPivotHistory_;const auto selectionRevision=selectionRevision_;
 const auto revision=revision_,content=contentRevision_,mutation=contentMutationRevision_;
 const auto damage=change_,recordingDamage=recordingDirty_;
 const auto recordingFrom=recordingDirtyFrom_,recordingTo=recordingDirtyTo_;const bool recordingValid=recordingDirtyValid_;
 std::vector<std::pair<std::string,double>> opacities;opacities.reserve(timeline_.state_.layers.size());
 for(const auto& layer:timeline_.state_.layers)opacities.emplace_back(layer.id,layer.opacity);
 try{applyValidatedEdit(edit,forward,plan);}catch(...){
  // Domain compensation has finished (or reported its own error). Restore the
  // original context without allocation or activation callbacks; compensation
  // must not retarget playback or expose intermediate selections to the UI.
  std::swap(timelineSelection_,focus.selection);selectedFrames_.swap(focus.frames);selectedGroupIds_.swap(focus.groups);
  selectedGroupId_.swap(focus.groupFocus);activeLayerId_.swap(focus.activeLayer);activeFrameId_.swap(focus.activeFrame);
  frameAnchor_.swap(focus.frameAnchor);activeMaskId_.swap(focus.activeMask);maskIsolated_=focus.maskIsolated;
  collapsedGroupIds_.swap(collapsed);freeInstanceSelected_.swap(freeSelection.selected);freeInstancePrimary_.swap(freeSelection.primary);
  freeInstanceAnchor_.swap(freeSelection.anchor);freeInstanceSelectionFrame_.swap(freeSelection.frame);freeInstanceViewLayer_.swap(freeSelection.viewLayer);
  displayedLayerGeometry_.swap(geometry);std::swap(maskSelectionHistory_,maskSelection);selectionPivotHistory_=pivot;
  selectionRevision_=selectionRevision;revision_=revision;contentRevision_=content;contentMutationRevision_=mutation;
  change_=damage;recordingDirty_=recordingDamage;recordingDirtyFrom_=recordingFrom;recordingDirtyTo_=recordingTo;recordingDirtyValid_=recordingValid;
  for(auto& layer:timeline_.state_.layers)for(const auto& old:opacities)if(layer.id==old.first){layer.opacity=old.second;break;}
  if(focus.sessionSelection)animationChangeBinding_.restoreSessionSelection(*this,std::move(*focus.sessionSelection));
  throw;
 }
}
void Document::applyValidatedEdit(const Edit& edit,bool forward,HistoryReplayPlan& plan){
auto animationReplay=animationChangeBinding_.replayHistory();if(applyTerminalHistory(edit,forward)){
 if(edit.beforeAnimationSelection&&edit.afterAnimationSelection){
  try{if(!restoreAnimationSelection(forward?*edit.afterAnimationSelection:*edit.beforeAnimationSelection))throw std::logic_error("Missing terminal selection history context");}
  catch(...){const auto failure=std::current_exception();try{applyTerminalHistory(edit,!forward);}catch(...){throw HistoryReplayError({failure,std::current_exception()});}std::rethrow_exception(failure);}
 }
 return;
}const bool freePaintBefore=tileSelection_.freePaint;const bool sourceEdit=edit.tileHistory.freeTileSourceAddition||edit.tileHistory.freeTileSourceDeletion||edit.tileHistory.freeTileSourceReorder;const auto sourceEditLayer=sourceEdit?activeLayerId_:std::string{},sourceEditFrame=sourceEdit?activeFrameId_:std::string{};
 const bool snapshotBefore=plan.snapshot&&plan.snapshot->applied,layerBefore=plan.layers&&plan.layers->applied,rollbackBefore=plan.rollbackPayload&&plan.rollbackPayload->applied;
 const bool slicesBefore=plan.slicesApplied,pivotBefore=plan.pivotApplied,loopBefore=plan.loopApplied,selectionBefore=plan.pixelsSelectionApplied;
 const bool paletteBefore=plan.palette&&plan.palette->applied;
 const bool leafBefore=plan.leaf&&plan.leaf->applied;
 const bool contentBefore=plan.contentApplied;
 applyHistoryResources(edit,plan.resources);
 bool contentCompleted=false;
 try{
 // Retained compensation unwinds content before its containing structure.
 // A structure installed by this very entry must remain present while its
 // content is restored; otherwise leaf metadata would reinstall that structure.
 if(!contentBefore)applyHistoryStructure(edit,forward,plan);
 applyHistoryContent(edit,forward,plan);
 contentCompleted=true;
 if(contentBefore)applyHistoryStructure(edit,forward,plan);
 applyHistorySelection(edit,forward,plan);
 applyHistoryProjection(edit,forward);
 finishHistorySources(edit,forward,freePaintBefore,sourceEdit,sourceEditLayer,sourceEditFrame);
 if(edit.beforeAnimationSelection&&edit.afterAnimationSelection){const auto& selection=forward?*edit.afterAnimationSelection:*edit.beforeAnimationSelection;if(!restoreAnimationSelection(selection))throw std::logic_error("Missing animation selection history context");}

 }catch(...){
  auto failure=std::current_exception();
  if(plan.pixelsSelectionApplied!=selectionBefore)applyPixelSelectionHistory(plan);
  if(contentCompleted&&!edit.children.empty()){
   try{plan.rollback.restore(edit.children,forward,failure,[&](const auto& child,bool direction){applyValidatedEdit(child,direction,plan.children[std::size_t(&child-edit.children.data())]);});}
   catch(...){const auto restoredFailure=std::current_exception();if(restoredFailure==failure)plan.contentApplied=contentBefore;failure=restoredFailure;}
  }
  if(plan.leaf&&plan.leaf->ready&&plan.leaf->applied!=leafBefore)exchangeHistoryLeaf(plan);
  if(plan.palette&&plan.palette->applied!=paletteBefore)exchangePaletteEdit(*plan.palette);
  if(plan.snapshot&&plan.snapshot->applied!=snapshotBefore)exchangeSnapshotStructure(*plan.snapshot);
  if(plan.loopApplied!=loopBefore){std::swap(animationLoop_,*plan.loop);plan.loopApplied=loopBefore;}
  if(plan.pivotApplied!=pivotBefore)applyTrimPivotHistory(plan);
  if(plan.layers&&plan.layers->applied!=layerBefore)exchangeLayerStructure(edit,*plan.layers);
  if(plan.slicesApplied!=slicesBefore)applySliceHistory(plan);
  if(plan.rollbackPayload&&plan.rollbackPayload->applied!=rollbackBefore){
   try{applyPreparedRollback(*plan.rollbackPayload);}catch(...){failure=std::make_exception_ptr(HistoryReplayError({failure,std::current_exception()}));}
  }
  // Resource values were fully allocated before replay and retain the exact
  // displaced values. Restore them without copying masks or selection arrays.
  try{applyHistoryResources(edit,plan.resources);}catch(...){throw HistoryReplayError({failure,std::current_exception()});}
  std::rethrow_exception(failure);
 }
}

bool Document::applyTerminalHistory(const Edit& edit,bool forward){
 return std::visit([&](const auto& payload)->bool{
  using T=std::decay_t<decltype(payload)>;
  if constexpr(std::is_same_v<T,std::monostate>)return false;
  else if constexpr(std::is_same_v<T,LocalSnapshotHistory>){
   if(!payload.beforeRollback||!payload.afterRollback)throw std::logic_error("Incomplete local snapshot history");
   applyLocalSnapshotHistory(payload,forward);return true;
  }else if constexpr(std::is_same_v<T,SourcePropertiesHistory>){
   if(!payload.before||!payload.after)throw std::logic_error("Incomplete source properties history");
   applyFreeTileSourceSnapshot(*(forward?payload.after:payload.before));change_={0,0,width_,height_};return true;
  }else{
   if(!payload)throw std::logic_error("Missing terminal history payload");
   if constexpr(std::is_same_v<T,MaskRasterReplay>)applyMaskRasterHistory(*payload,forward);
   else if constexpr(std::is_same_v<T,LocalPixelsReplay>)applyLocalHistoryPixels(*payload,forward);
   else if constexpr(std::is_same_v<T,TilemapPixelsReplay>)applyTilemapPixelHistory(edit,forward);
   else static_assert(!sizeof(T),"Unhandled terminal history category");
   return true;
  }
 },edit.terminalHistory);
}

void Document::applyHistoryResources(const Edit& edit,HistoryResourceReplay& prepared){
applyTileHistoryResources(edit,prepared);applyMaskHistoryResources(prepared);prepared.applied=!prepared.applied;
}

void Document::applyHistoryStructure(const Edit& edit,bool forward,HistoryReplayPlan& plan){
applyRollbackHistory(edit.snapshotHistory,forward,plan);applySliceHistory(plan);if(edit.layerHistory.beforeLayerStructure){if(!plan.layers)plan.layers.emplace();applyLayerStructure(edit,forward,&*plan.layers);}applyTrimPivotHistory(plan);if(plan.loop){std::swap(animationLoop_,*plan.loop);plan.loopApplied=!plan.loopApplied;}applySnapshotStructure(edit,forward,plan);
}

// applyHistoryContent: definition in its content history domain unit.

void Document::applyHistorySelection(const Edit& edit,bool forward,HistoryReplayPlan& plan){
// Create changes group context only; ungroup replays structure only.
if(edit.layerHistory.groupRows!=LayerHistory::GroupRows::None)return;
if(edit.layerHistory.deletedRows!=LayerHistory::DeletedRows::None){
 // deleteActiveLayer only restores the active layer. Selected-row deletion
 // additionally owns layer/group rows; neither entry owns frames or items.
 if(edit.layerHistory.deletedRows==LayerHistory::DeletedRows::SelectedRows)timelineSelection_.layers=(forward?edit.afterTimelineSelection:edit.beforeTimelineSelection)->layers;
 return;
}
if(edit.layerHistory.copiedRowSelection){
 // duplicateSelectedLayerRows records only row identities. The Alt-drag move
 // adds a complete selection pair separately, after the copy cleared masks.
 timelineSelection_.layers=(forward?edit.afterTimelineSelection:edit.beforeTimelineSelection)->layers;
 return;
}
if(!edit.children.empty() && !edit.beforeActive.empty()){selectLayer(forward?edit.afterActive:edit.beforeActive);selectFrame(forward?edit.afterFrame:edit.beforeFrame);}applyPixelSelectionHistory(plan);const auto& selection=forward?edit.afterSelection:edit.beforeSelection;if(selection)selectedFrames_=*selection;const auto& timelineSelection=forward?edit.afterTimelineSelection:edit.beforeTimelineSelection;if(timelineSelection)timelineSelection_=*timelineSelection;const auto& anchor=forward?edit.afterFrameAnchor:edit.beforeFrameAnchor;if(anchor)frameAnchor_=*anchor;if(forward&&edit.snapshotHistory.beforeTimeline&&edit.maskHistory.maskToActivateOnRedo){activeMaskId_=*edit.maskHistory.maskToActivateOnRedo;maskIsolated_=false;}if(edit.beforeTimelineSelection && !edit.beforeActive.empty()){activeLayerId_=forward?edit.afterActive:edit.beforeActive;activeFrameId_=forward?edit.afterFrame:edit.beforeFrame;}
}

void Document::applyHistoryProjection(const Edit& edit,bool forward){
for(const auto& value:forward?edit.layerHistory.afterLayerOpacityProjection:edit.layerHistory.beforeLayerOpacityProjection){auto it=std::find_if(timeline_.state_.layers.begin(),timeline_.state_.layers.end(),[&](const auto& l){return l.id==value.first;});if(it!=timeline_.state_.layers.end())it->opacity=value.second;}applyMaskHistoryContext(edit.maskHistory,forward);applyGroupUi(edit,forward);applyFreeTileSelectionHistory(edit.tileHistory,forward);
 if(forward&&edit.frameHistory.clearItemSelectionOnRedo)clearAnimationItemSelection();
 if(edit.layerHistory.groupRows!=LayerHistory::GroupRows::None)normalizeAnimationSelection();
 if(edit.layerHistory.copiedRowSelection||edit.layerHistory.deletedRows!=LayerHistory::DeletedRows::None){
  if(forward&&edit.layerHistory.copiedRowSelection){
   timelineSelection_.maskRows.clear();activeMaskId_.clear();maskIsolated_=false;
   if(auto session=animationChangeBinding_.captureSessionSelection(*this)){session->masks.clear();session->maskAnchor.reset();animationChangeBinding_.restoreSessionSelection(*this,std::move(*session));}
   freeInstanceViewLayer_.clear();freeInstanceSelected_.clear();freeInstancePrimary_.clear();freeInstanceAnchor_.clear();
  }
  // applyLayerRowSelection chooses the owned resource on Redo. Undo only
  // runs ensureTileSelection: retain a compatible surviving selection first.
  const auto& active=layer();const auto owned=active.kind=="tilemap"?active.tilemapTilesetId:active.freeTiles&&!active.freeTiles->sources.empty()?active.freeTiles->sources.front().tilesetId:std::string{};
  const auto& sets=timeline_.state().tilesets;const auto found=std::find_if(sets.begin(),sets.end(),[&](const auto& set){return set.id==owned;});
  if(forward&&edit.layerHistory.copiedRowSelection&&found!=sets.end())tileSelection_.tilesetId=owned;
  auto compatible=[&](const auto& set){if(active.freeTiles)return std::any_of(active.freeTiles->sources.begin(),active.freeTiles->sources.end(),[&](const auto& source){return source.tilesetId==set.id;});if(active.kind=="tilemap")return std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[&](const auto& l){return l.kind=="tilemap"&&l.tilemapTilesetId==set.id;});return true;};
  auto selected=std::find_if(sets.begin(),sets.end(),[&](const auto& set){return compatible(set)&&set.id==tileSelection_.tilesetId;});if(selected==sets.end())selected=std::find_if(sets.begin(),sets.end(),compatible);
  tileSelection_.tilesetId=selected==sets.end()?std::string{}:selected->id;
  auto ensure=[&](std::string& id){if(selected==sets.end())id.clear();else if(std::find(selected->tileIds.begin(),selected->tileIds.end(),id)==selected->tileIds.end())id=selected->tileIds.empty()?std::string{}:selected->tileIds.front();};ensure(tileSelection_.primary);ensure(tileSelection_.secondary);
  normalizeAnimationSelection();
 }
}

// finishHistorySources: definition in its history domain unit.

}
