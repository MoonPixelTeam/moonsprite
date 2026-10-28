#include "editor_implementation.h"
#include "editor.h"
#include "timelapse_session.h"

namespace moon::editor {
void Editor::applyDocumentPreferences(Document& target,bool initializeSymmetry){
  target.setHistoryEntryLimit(runtimePreferences_.flag("undo.historyLimitEnabled")?std::size_t(runtimePreferences_.index("undo.historyLimit.Number")):std::numeric_limits<std::size_t>::max());
  target.setPaletteColorSynchronization(syncPaletteColors_);
  target.setLayerDisplayColorPresets(runtimePreferences_.layerDisplayColors);
  if(initializeSymmetry){target.symmetryAxes=persistedSymmetryAxes_;symmetryIdentity_=target.identity();symmetryInitialized_=symmetryHas(target.symmetryAxes);}
  auto recording=timelapse::ensureRecordingSession(target,smoke_?assets_.parent_path()/("timelapse-smoke-owned-"+std::to_string(GetCurrentProcessId())):timelapse::executableLibraryRoot(),smoke_?std::filesystem::path{}:timelapse::legacyLibraryRoot());recording->playback=&target==&document&&playing_;
}
void Editor::applyWorkspacePreferences(){
  syncDiagnostics();
  applyDocumentPreferences(document);
  for(auto& project:projects_)if(project->stored)applyDocumentPreferences(*project->stored);
}
void Editor::syncDocumentViewState(){
    syncSelectionOutlineView();
    const auto& maskHistory=document.maskSelectionHistory();
    if(maskSelectionIdentity_!=document.identity()){maskSelectionIdentity_=document.identity();maskSelectionSerial_=maskHistory.serial;maskSelectionAnchor_.reset();}
    else if(maskSelectionSerial_!=maskHistory.serial){maskSelectionSerial_=maskHistory.serial;selectedMaskSlots_=maskHistory.slots;maskSelectionAnchor_=selectedMaskSlots_.empty()?std::nullopt:std::optional<Document::MaskSlotKey>(selectedMaskSlots_.back());}

    if(auto entry=menuItems_.find("toggleGroupMask");entry!=menuItems_.end()){
      const auto owner=selectedMaskPropertyOwner();
      const bool existing=document.findGroup(owner)&&timeline::directMask(document.timeline().state(),owner,document.frame().id);
      entry->second->setCaption(existing?U"删除图层组蒙版":U"创建图层组蒙版");
    }
    if(auto entry=menuItems_.find("maskMoveBinding");entry!=menuItems_.end()){
      const auto* slot=selectedOwnerMask();const auto* mask=slot?timeline::resolvedMask(document.timeline().state(),slot->ownerId,slot->frameId):nullptr;
      entry->second->setCaption(mask&&mask->moveWithOwner?U"停用绑定移动":U"开启绑定移动");
    }

    if(auto entry=menuItems_.find("toggleSelectionOutline");entry!=menuItems_.end())entry->second->setCaption(showSelectionOutline_?U"隐藏蚂蚁线":U"显示蚂蚁线");

    if(playbackModeIdentity_!=document.identity()){playbackSessionMode_=savedPlaybackMode_.value_or(document.animationLoop()?"all":"once");playbackTagMode_=playbackSessionMode_=="tag";playbackTagCycle_.clear();loopPlayback_={};playbackModeIdentity_=document.identity();playbackObservedFrame_=document.frame().id;}else if(playbackModeLoop_!=document.animationLoop()){playbackSessionMode_=document.animationLoop()?"all":"once";playbackTagMode_=false;playbackTagCycle_.clear();loopPlayback_={};}

    playbackModeLoop_=document.animationLoop();if(playing_ && playbackTagMode_ && playbackObservedFrame_!=document.frame().id)retargetTagPlayback();

    if(recentColorsIdentity_!=document.identity()){recentColors_={};recentDrag_.reset();recentColorsIdentity_=document.identity();}

    if(pending_==Pending::SpriteSheet&&sheetPreview_){discard_->caption=sheetOutputFile_?U"导出 PNG":U"新建文档";try{sheetPreview_->setImage(buildSpriteSheetImage(document,sheetOptions_));discard_->setEnabled(true);}catch(const std::exception& e){sheetPreview_->clearImage();status_=U"精灵表预览失败："+unicodeText(e.what());discard_->setEnabled(false);}}

    if(!document.floating())selectionFreeTransform_=false;

    if(trimPivotIdentity_!=document.identity()){trimPivotIdentity_=document.identity();trimPivotSerial_=0;}

    if(trimPivotSerial_!=document.selectionPivotHistory().serial){trimPivotSerial_=document.selectionPivotHistory().serial;selectionPivot_=document.selectionPivotHistory().pivot;selectionPivotMask_=document.selection();selectionPivotIdentity_=document.identity();}

    if(selectionPivotIdentity_!=document.identity() || (!document.floating() && !selectionEqual(selectionPivotMask_,document.selection()))){selectionPivot_.reset();selectionFreeTransform_=false;selectionPivotIdentity_=document.identity();selectionPivotMask_=document.selection();}

}
void Editor::updateCommandStates(){
    commands_[3]->setEnabled(pending_==Pending::None && document.canUndo()); commands_[4]->setEnabled(pending_==Pending::None && document.canRedo());

    for(auto& item:menuItems_) item.second->validateItem();

    const bool railEnabled=documentOpen_ && pending_==Pending::None && !shapeDragging_ && !gradientPending_ && !gradientDragging_;

    for(std::size_t i=0;i<toolRail_.size();++i) {

      const auto& group=legacyToolGroups()[i];

      const auto active=activeRailTool();

      toolRail_[i]->active=std::any_of(group.begin(),group.end(),[&](const auto& tool){return active==tool.id;});

      const bool available=std::any_of(group.begin(),group.end(),[&](const auto& tool){return isToolAvailableForSession(tool.id);});
      toolRail_[i]->setEnabled(railEnabled && available);

    }

}
void Editor::updateControlVisibility(){
    if(!documentOpen_){

      for(auto child:children())if(child!=menuBar_ && child!=documentTabNew_ && child!=homeButton_ && child!=discard_ && child!=keep_ && child!=dialogClose_ && child!=saveBeforeClose_)child->setEnabled(false);

      for(auto child:timelineInactive_)child->setVisible(false);

      for(auto child:layerRows_)child->setVisible(false);

      for(auto child:layerEyes_)child->setVisible(false);

      for(auto child:layerLocks_)child->setVisible(false);

      for(auto child:frameHeaders_)child->setVisible(false);

      for(auto child:frameCells_)child->setVisible(false);

      layerProperties_->setVisible(false);layerQuickSettings_->setVisible(false);layerLabelSeparator_->setVisible(false);for(auto b:layerQuickButtons_)b->setVisible(false);

      previewPanel_->setVisible(false);

    }

    for(int i=0;i<5;++i)if(topActions_[i]){topActions_[i]->setVisible(true);topActions_[i]->setEnabled(pending_==Pending::None && (i<2 || documentOpen_));}

}
void Editor::refresh(RefreshScope scope){
  InteractionScope interactionScope(2,"refresh");document.setDeferredFloatingDisplaySupported(!renderer_.relativeLuminance());
  const auto needs=[scope](RefreshScope part){return (unsigned(scope)&unsigned(part))!=0;};
  if(needs(RefreshScope::Layout)){
    restoreAdvancedVisibility();
    if(advancedActive()&&(homeOpen_||!documentOpen_)){const auto oldView=canvasViewport();advancedMode_=0;canvas_.offset(canvasViewport().center()-oldView.center());layoutToolRail();}
  }
  if(previewPanel_)previewPanel_->syncRelativeLuminance(renderer_.relativeLuminance(),false);
  if(previewPanel_){const double values[]{.5,.75,1,1.5,2};previewPanel_->eyedropper=eyedropperTool_||eyedropperHeld_;previewPanel_->dragSensitivity=values[std::clamp(runtimePreferences_.index("editing.viewDragSensitivity.Select"),0,4)];previewPanel_->timelineAvailable=columnShown(2)&&!timelineHidden_;}
  syncReferencePanels();
  if(historyPanelOpen_&&!docking_.custom){initializeDocking();docking_.custom=true;}
  syncHistoryPanel();
  syncTabletPanel();syncTilesetPanel();syncBrushLibraryPanel();
  syncDocumentViewState();
  if(needs(RefreshScope::Layout)){
    ++panelFullRefreshes_;
    if(!homeOpen_ && !homeVisibility_.empty()){for(auto state:homeVisibility_)state.first->setVisible(state.second);homeVisibility_.clear();}
    if(documentOpen_ && !closedControlStates_.empty()){for(auto state:closedControlStates_)state.first->setEnabled(state.second);closedControlStates_.clear();}
    layoutDocumentTab();layoutModal();
  }
  if(needs(RefreshScope::Palette))syncPaletteButtons();
  if(needs(RefreshScope::Layout))layoutPanelTabs();
  if(needs(RefreshScope::Palette))layoutPalette();
  if(needs(RefreshScope::Tools))layoutToolOptions();
  if(needs(RefreshScope::Timeline))layoutLayers();
  if(needs(RefreshScope::Layout))raiseDockWidgets();
  if(needs(RefreshScope::Commands))updateCommandStates();
  if(needs(RefreshScope::Layout)){
    updateControlVisibility();applyHomeVisibility();applyAdvancedVisibility();
  }
  updateNavigationCursor();
  if(needs(RefreshScope::Layout))invalidate();
  else {
    if(needs(RefreshScope::Canvas)){
      invalidateRect(canvasViewport());
      if(previewPanel_){previewPanel_->syncRelativeLuminance(renderer_.relativeLuminance(),false);if(previewPanel_->isVisible())previewPanel_->invalidate();}
    }
    if(needs(RefreshScope::Timeline))invalidateTimelineGrid();
    if(needs(RefreshScope::Tools))invalidateRect(toDisplay(gfx::Rect(0,optionsTop(),uiLogical(clientBounds()).w,Layout::optionsHeight)));
    if(needs(RefreshScope::Commands)){layoutDocumentTab();invalidateRect(toDisplay(gfx::Rect(0,Layout::documentY,uiLogical(clientBounds()).w,Layout::projectTabHeight+Layout::frame)));}
  }
}
}
