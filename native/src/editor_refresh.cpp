#include "editor.h"
#include "legacy_tools.h"
#include "layer_label_separator.h"
#include "preview_panel.h"
#include "interaction_profile.h"
#include "timelapse_session.h"

namespace moon::editor {
void Editor::applyDocumentPreferences(Document& target,bool initializeSymmetry){
  target.setHistoryEntryLimit(runtimePreferences_.flag("undo.historyLimitEnabled")?std::size_t(runtimePreferences_.index("undo.historyLimit.Number")):std::numeric_limits<std::size_t>::max());
  target.setPaletteColorSynchronization(syncPaletteColors_);
  target.setLayerDisplayColorPresets(runtimePreferences_.layerDisplayColors);
  if(initializeSymmetry){target.symmetryAxes=persistedSymmetryAxes_;symmetryIdentity_=target.identity();symmetryInitialized_=symmetryHas(target.symmetryAxes);}
  auto recording=timelapse::ensureRecordingSession(target,smoke_?assets_.parent_path()/("timelapse-smoke-owned-"+std::to_string(GetCurrentProcessId())):timelapse::executableLibraryRoot(),smoke_?std::filesystem::path{}:timelapse::legacyLibraryRoot());recording->playback=&target==&currentDocument()&&currentPlayback().playing;
}
void Editor::applyWorkspacePreferences(){
  syncDiagnostics();
  applyDocumentPreferences(currentDocument());
  for(auto& project:projects_)if(project->value&&project->value!=activeDocument_)applyDocumentPreferences(*project->value);
}
void Editor::syncDocumentViewState(){

    if(auto entry=menuItems_.find("toggleGroupMask");entry!=menuItems_.end()){
      const auto owner=selectedMaskPropertyOwner();
      const bool existing=currentDocument().findGroup(owner)&&timeline::directMask(currentDocument().timeline().state(),owner,currentDocument().frame().id);
      entry->second->setCaption(existing?U"删除图层组蒙版":U"创建图层组蒙版");
    }
    if(auto entry=menuItems_.find("maskMoveBinding");entry!=menuItems_.end()){
      const auto* slot=selectedOwnerMask();const auto* mask=slot?timeline::resolvedMask(currentDocument().timeline().state(),slot->ownerId,slot->frameId):nullptr;
      entry->second->setCaption(mask&&mask->moveWithOwner?U"停用绑定移动":U"开启绑定移动");
    }

    if(auto entry=menuItems_.find("toggleSelectionOutline");entry!=menuItems_.end())entry->second->setCaption(currentView().showSelectionOutline?U"隐藏蚂蚁线":U"显示蚂蚁线");





}
void Editor::updateCommandStates(){
    commands_[3]->setEnabled(historyActionAvailable(workspace::HistoryAction::Undo)); commands_[4]->setEnabled(historyActionAvailable(workspace::HistoryAction::Redo));

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
  InteractionScope interactionScope(2,"refresh");
  const auto needs=[scope](RefreshScope part){return (unsigned(scope)&unsigned(part))!=0;};
  if(needs(RefreshScope::Layout)){
    restoreAdvancedVisibility();
    if(advancedActive()&&(homeOpen_||!documentOpen_)){const auto oldView=canvasViewport();advancedMode_=0;currentView().canvas.offset(canvasViewport().center()-oldView.center());layoutToolRail();}
  }
  if(previewPanel_)previewPanel_->syncRelativeLuminance(currentView().relativeLuminance,false);
  if(previewPanel_){const double values[]{.5,.75,1,1.5,2};previewPanel_->eyedropper=currentTools().eyedropperTool||eyedropperHeld_;previewPanel_->dragSensitivity=values[std::clamp(runtimePreferences_.index("editing.viewDragSensitivity.Select"),0,4)];previewPanel_->timelineAvailable=columnShown(2)&&!timelineHidden_;}
  // Canvas damage does not rebuild panel models or launch resource scans.
  const bool structure=needs(RefreshScope::Timeline)||needs(RefreshScope::Layout);
  const bool controls=structure||needs(RefreshScope::Tools)||needs(RefreshScope::Commands);
  if(structure){++refreshWorkCounts_[0];syncFreeTileInstancePanel();}
  if(needs(RefreshScope::Reference)||needs(RefreshScope::Tools)||needs(RefreshScope::Palette)||needs(RefreshScope::Layout)){++refreshWorkCounts_[1];syncReferencePanels();}
  if(structure||needs(RefreshScope::Commands)){++refreshWorkCounts_[2];syncHistoryPanel();}
  if(controls){++refreshWorkCounts_[3];syncTabletPanel();}
  if(structure||needs(RefreshScope::Commands)){++refreshWorkCounts_[4];syncTilesetPanel();}
  if(needs(RefreshScope::Resources)||needs(RefreshScope::Palette)||needs(RefreshScope::Layout)){++refreshWorkCounts_[5];syncBrushLibraryPanel();}
  if(scope!=RefreshScope::None&&scope!=RefreshScope::Canvas)syncDocumentViewState();
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
  if(controls){++refreshWorkCounts_[6];syncQuickCommands();}
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
      if(previewPanel_){previewPanel_->syncRelativeLuminance(currentView().relativeLuminance,false);if(previewPanel_->isVisible())previewPanel_->invalidate();}
    }
    if(needs(RefreshScope::Timeline))invalidateTimelineGrid();
    if(needs(RefreshScope::Tools))invalidateRect(toDisplay(gfx::Rect(0,optionsTop(),uiLogical(clientBounds()).w,Layout::optionsHeight)));
    if(needs(RefreshScope::Commands)){layoutDocumentTab();invalidateRect(toDisplay(gfx::Rect(0,Layout::documentY,uiLogical(clientBounds()).w,Layout::projectTabHeight+Layout::frame)));}
  }
}
}
