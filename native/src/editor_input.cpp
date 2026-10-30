#include "free_tile_selection_target.h"
#include "editor_implementation.h"
#include "editor.h"
#include "free_tile_instances_panel.h"

namespace moon::editor {

void Editor::registerScrollDrag(std::function<gfx::Rect()> bounds,SpaceDragScroll::Target target){scrollDragRegions_.push_back({std::move(bounds),std::move(target)});}

void Editor::observeScrollDragKey(ui::Message* msg){

    if(msg->type()!=ui::kKeyDownMessage && msg->type()!=ui::kKeyUpMessage)return;

    auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()!=ui::kKeySpace)return;

    panelScrollSpace_=msg->type()==ui::kKeyDownMessage && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus());updateNavigationCursor();

  }

bool Editor::processScrollDrag(ui::Message* msg){
    if(advancedActive()&&!panelScrollDrag_.active())return false;

    if(panelScrollDrag_.active()){

      if(msg->type()==ui::kFocusLeaveMessage || !hasCapture() || pending_!=Pending::None || homeOpen_){panelScrollDrag_.finish();panelScrollSpace_=false;if(hasCapture())releaseMouse();updateNavigationCursor();return false;}

      if(msg->type()==ui::kMouseMoveMessage){auto p=static_cast<ui::MouseMessage*>(msg)->position();panelScrollDrag_.move({p.x,p.y});return true;}

      if(msg->type()==ui::kMouseUpMessage){panelScrollDrag_.finish();releaseMouse();updateNavigationCursor();return true;}

    }

    if(msg->type()!=ui::kMouseDownMessage || pending_!=Pending::None || homeOpen_ || hasCapture())return false;

    auto mouse=static_cast<ui::MouseMessage*>(msg);auto p=mouse->position();

    const int floating=topFloatingColumnAt(p);

    for(const auto& region:scrollDragRegions_){if(!region.bounds().contains(p))continue;

      if(floating>=0){const auto r=columnGeometry(uiLogical(bounds())).panel[floating];if(!toDisplay(gfx::Rect(r.x,r.y,r.w,r.h)).contains(region.bounds().center()))continue;}

      if(panelScrollDrag_.begin({p.x,p.y},mouse->middle(),mouse->left(),panelScrollSpace_,region.target)){captureMouse();updateNavigationCursor();return true;}

    }return false;

  }

void Editor::observeModifierRelease(ui::Message* msg){

    if(msg->type()!=ui::kKeyUpMessage)return;
    observeTabletInput(msg);observeDynamicsInput(msg);
    observeShortcutInputs(msg);syncShortcutTools(*msg);

    brushFeedback_.brushPreviewShift_=msg->shiftPressed();if(liquifyTool_)layoutToolOptions();invalidateRect(canvasViewport());

    syncShortcutTools(*msg);

    syncShortcutTools(*msg);

    if(brushFeedback_.modifierBrushSize_ && !brushFeedback_.modifierBrushSize_->pressed && !moveModifierHeld("brushSizeAdjust",*msg))finishModifierBrushSize();

    selectionShift_=msg->shiftPressed();selectionCtrl_=msg->ctrlPressed() || msg->cmdPressed();updateNavigationCursor();

  }

bool Editor::onProcessMessage(ui::Message* msg) {
    if(msg->fromFilter()&&parameterRangeFilters_)return processParameterRangeMessage(msg);
    observeDynamicsInput(msg);

    // Aseprite menus are separate UI windows, often sharing the native display.

    // Desktop broadcasts must not start a background panel/timeline gesture.

    if(auto mouse=dynamic_cast<ui::MouseMessage*>(msg);mouse && msg->display() && !hasCapture()){

      const auto picked=ui::Manager::getDefault()->pickFromScreenPos(mouse->screenPosition());

      if(picked && picked->window()!=window())return false;

    }

    observeShortcutInputs(msg);syncShortcutTools(*msg);
    struct ShortcutAfterMessage {std::function<void()> action;~ShortcutAfterMessage(){action();}} shortcutAfter{[this,msg]{syncShortcutTools(*msg);}};
    // The source toolbar is a sibling for column chrome layout, but belongs
    // to the legacy tileset command scope. Delete must never reach layer delete.
    if(tilesetPanel_&&msg->type()==ui::kKeyDownMessage&&document.layer().kind=="free-tile"){
      auto key=static_cast<ui::KeyMessage*>(msg);auto focus=ui::Manager::getDefault()->getFocus();
      if((focus==tilesetAdd_||focus==tilesetDelete_)&&(key->scancode()==ui::kKeyDel||key->scancode()==ui::kKeyBackspace)){if(pending_==Pending::None)tilesetPanel_->deleteSelection();return true;}
    }
    if(tilesetPanel_&&tilesetPanel_->handleCommand(msg))return true;
    if(brushLibraryPanel_&&brushLibraryPanel_->handleCommand(msg))return true;
    if(freeTileInstancesPanel_&&freeTileInstancesPanel_->handleCommand(msg))return true;
    if(routePointerShortcut(msg))return true;
    if(document.freeTilePlacementActive()&&processFreeTileInput(msg))return true;
    if(processViewRotation(msg))return true;
    if(processTextInput(msg))return true;
    if(processSliceInput(msg))return true;
    if(processMoveInput(msg))return true;
    const int shortcutResult=routeShortcutMessage(msg);
    if(shortcutResult==1)return true;
    if(shortcutResult==2)return ui::Widget::onProcessMessage(msg);
    if(msg->type()==ui::kKeyDownMessage){
      const auto key=static_cast<ui::KeyMessage*>(msg);
      if((key->ctrlPressed()||key->cmdPressed())&&!key->shiftPressed()&&!key->altPressed()&&key->scancode()==ui::kKeyF){
        if(!dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())&&!key->repeat()&&documentOpen_&&!homeOpen_&&pending_==Pending::None)menuCommands_.invoke("advancedMode");
        return true;
      }
    }
    if((!advancedActive()||!dynamic_cast<ui::MouseMessage*>(msg))&&processProjectTabs(msg))return true;

    if(processTimelineSelectionKeyboard(msg))return true;

    if(processAutoLinkKeyboard(msg))return true;

    observeScrollDragKey(msg);if(processScrollDrag(msg))return true;

    if(fullscreenShortcut(msg))return true;

    if(msg->type()==ui::kDragLeaveMessage){clearTimelineGifDrop();if(brushLibraryPanel_)brushLibraryPanel_->setExternalDrop(false);return true;}

    if(pending_==Pending::Saving && (dynamic_cast<ui::MouseMessage*>(msg) || dynamic_cast<ui::KeyMessage*>(msg) || dynamic_cast<ui::DndMessage*>(msg)))return true;

    if(msg->type()==ui::kDragEnterMessage || msg->type()==ui::kDragMessage || msg->type()==ui::kDropMessage){auto& event=static_cast<ui::DndMessage*>(msg)->event();if(handleBrushLibraryDrop(event,msg->type()==ui::kDropMessage)||handleTimelineGifDrag(event,msg->type()==ui::kDropMessage)){if(msg->type()==ui::kDragEnterMessage)static_cast<ui::DragEnterMessage*>(msg)->widget(this);if(msg->type()==ui::kDragMessage)static_cast<ui::DragMessage*>(msg)->widget(this);return true;}}

    if(msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage){

      brushFeedback_.brushPreviewShift_=msg->shiftPressed();if(liquifyTool_)layoutToolOptions();if(!homeOpen_ && documentOpen_)invalidateRect(canvasViewport());

      brushFeedback_.modifierCtrl_=msg->ctrlPressed() || msg->cmdPressed();brushFeedback_.modifierAlt_=msg->altPressed();

      if(!moveModifierHeld("brushSizeAdjust",*msg)){if(brushFeedback_.modifierBrushSize_ && !brushFeedback_.modifierBrushSize_->pressed)finishModifierBrushSize();}

      syncShortcutTools(*msg);

      syncShortcutTools(*msg);

      updateNavigationCursor();

    }

    if(msg->type()==ui::kFocusLeaveMessage){if(drawingAnchorDragging_&&!static_cast<ui::FocusMessage*>(msg)->newFocus()){drawingAnchor_=drawingAnchorDragBefore_;drawingAnchorDragging_=false;if(hasCapture())releaseMouse();}if((magicEraserDragging_||airbrushDragging_||smoothDragging_)&&!static_cast<ui::FocusMessage*>(msg)->newFocus())cancelStroke();if(!static_cast<ui::FocusMessage*>(msg)->newFocus()){usageStatistics_.flush();persistUsageStatistics();}panelScrollSpace_=false;finishModifierBrushSize();flushBrushSizePreferences();brushFeedback_.brushPreviewShift_=false;brushFeedback_.modifierCtrl_=brushFeedback_.modifierAlt_=selectionShift_=selectionCtrl_=false;eyedropperHeld_=paletteSamplingHeld_=spaceHeld_=false;}

    if(processPaletteInput(msg))return true;

    if(pending_==Pending::PaletteLibrary&&msg->type()==ui::kMouseWheelMessage){auto mouse=static_cast<ui::MouseMessage*>(msg);if(dialogDisplayBounds().contains(mouse->position())){storedPaletteScrollPixels_+=mouse->wheelDelta().y*40*uiScale;layoutModal();invalidateRect(dialogDisplayBounds());return true;}}

    if((pending_==Pending::StaticExport||pending_==Pending::GifExport)&&msg->type()==ui::kMouseWheelMessage&&exportScaleViewport_.contains(static_cast<ui::MouseMessage*>(msg)->position())){exportScaleScroll_+=static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*40*uiScale;layoutModal();invalidateRect(dialogDisplayBounds());return true;}

    if(processTimelineInput(msg))return true;
    if(processLiquifyInput(msg))return true;

    if(replaceSampling_>=0){

      if(eyedropperGesture_.active() && !hasCapture()){finishReplaceSampling();}

      if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){finishReplaceSampling();return true;}

      if(msg->type()==ui::kFocusLeaveMessage){finishReplaceSampling();return true;}

      if(msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage){auto mouse=static_cast<ui::MouseMessage*>(msg);const bool canvas=canvasViewport().contains(mouse->position()) && !dialogDisplayBounds().contains(mouse->position());

        if(eyedropperGesture_.active()){if(msg->type()==ui::kMouseMoveMessage && canvas)sampleEyedropperAt(canvasPoint(mouse->position()));if(msg->type()==ui::kMouseUpMessage && (mouse->button()==strokeButton_ || mouse->button()==ui::kButtonNone))finishEyedropper();return true;}

        if(msg->type()==ui::kMouseDownMessage && canvas && (mouse->left() || mouse->right())){cancelReplacePreview();strokeButton_=mouse->button();eyedropperGesture_.begin(mouse->right(),false);captureMouse();sampleEyedropperAt(canvasPoint(mouse->position()));updateNavigationCursor();return true;}

      }

    }

    if(processModalInput(msg))return true;

    if((homeOpen_ || !documentOpen_) && pending_==Pending::None){

      if(homeOpen_ && documentOpen_ && msg->type()==ui::kMouseDownMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);

        if(mouse->left() && uiPhysical(gfx::Rect(rc.x+Layout::edge,rc.y+Layout::documentY,documentTabWidth(l)-Layout::inset-11,Layout::projectTabHeight)).contains(mouse->position())){showHome(false);return true;}}

      if(homeOpen_ && msg->type()==ui::kMouseWheelMessage && homeAnnouncements_ && homeAnnouncements_->bounds().contains(static_cast<ui::MouseMessage*>(msg)->position())){homeAnnouncements_->scrollWheel(static_cast<ui::MouseMessage*>(msg)->wheelDelta().y);return true;}
      if(homeOpen_&&homeSection_==0&&msg->type()==ui::kMouseWheelMessage&&recentPane_&&recentPane_->bounds().contains(static_cast<ui::MouseMessage*>(msg)->position()))return recentPane_->onProcessMessage(msg);
      if(homeOpen_ && msg->type()==ui::kMouseWheelMessage){homeScrollPixels_+=static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*28*uiScale;layoutHome();invalidate();return true;}

      if(homeOpen_ && msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc && documentOpen_){showHome(false);return true;}

      if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->ctrlPressed() && key->scancode()==ui::kKeyN){ask(Pending::New);return true;}if(key->ctrlPressed() && key->scancode()==ui::kKeyO){chooseProject();return true;}}

      return ui::Widget::onProcessMessage(msg);

    }

    if(previewPanel_ && previewPanel_->hasCapture() && (msg->type()==ui::kFocusLeaveMessage ||

       (msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc))) {

      previewPanel_->finishPointer();if(msg->type()==ui::kKeyDownMessage)return true;

    }

    if(msg->type()==ui::kKeyUpMessage)syncShortcutTools(*msg);

    

    if(navigation_.zoomDragging_ && !hasCapture())navigation_.zoomDragging_=false;

    if(navigation_.zoomDragging_ && (msg->type()==ui::kFocusLeaveMessage || (msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc))){finishZoomTool();if(msg->type()==ui::kKeyDownMessage)return true;}

    if((navigation_.zoomDragging_ || gradientDragging_) && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)){

      const auto key=static_cast<ui::KeyMessage*>(msg);const auto code=key->scancode();

      if(code>=ui::kKeyLShift && code<=ui::kKeyCommand){ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,navigation_.zoomDragging_?navigation_.zoomButton_:strokeButton_,key->modifiers(),selectionPointerPosition_);onProcessMessage(&move);return true;}

    }

    if(navigation_.zoomDragging_ && msg->type()==ui::kKeyDownMessage)return true;

    if(symmetryDragging_ && !hasCapture())finishSymmetryDrag(true);

    if(eyedropperGesture_.active() && !hasCapture()){eyedropperGesture_.finish();eyedropperLensSurface_.reset();invalidateRect(canvasViewport());}

    if(selectionTool_ && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)){selectionShift_=msg->shiftPressed();selectionCtrl_=msg->ctrlPressed() || msg->cmdPressed();layoutToolOptions();invalidateRect(canvasViewport());updateNavigationCursor();}

    if((selectionDragging_ || floatingDragging_) && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()>=ui::kKeyLShift && key->scancode()<=ui::kKeyCommand){ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,selectionRight_?ui::kButtonRight:ui::kButtonLeft,key->modifiers(),selectionPointerPosition_);selectionSyntheticMove_=true;onProcessMessage(&move);selectionSyntheticMove_=false;return true;}}

    if(msg->type()==ui::kMouseLeaveMessage){selectionBrushPointer_.reset();invalidateRect(canvasViewport());}

    if(processSizeDrag(msg))return true;

    auto aboutFocusTarget=msg->type()==ui::kFocusLeaveMessage?static_cast<ui::FocusMessage*>(msg)->newFocus():nullptr;
    // LAF queues editor -> null before focusing the new popup; real loss leaves current focus null.
    if(msg->type()==ui::kFocusLeaveMessage && !aboutFocusTarget && aboutDialogForFocus_)aboutFocusTarget=ui::Manager::getDefault()->getFocus();
    const bool enteringAbout=aboutDialogForFocus_ && aboutFocusTarget && (aboutFocusTarget==aboutDialogForFocus_ || aboutFocusTarget->hasAncestor(aboutDialogForFocus_));
    auto stopsFocus=msg->type()==ui::kFocusLeaveMessage?static_cast<ui::FocusMessage*>(msg)->newFocus():nullptr;
    if(msg->type()==ui::kFocusLeaveMessage && !stopsFocus && gradientStopsFocusOwner_)stopsFocus=ui::Manager::getDefault()->getFocus();
    const auto inOwner=[&](ui::Widget* owner){return owner&&stopsFocus&&(stopsFocus==owner||stopsFocus->hasAncestor(owner));};
    // Owned native color windows preserve the pending gradient during focus transfer.
    const bool enteringGradientStops=gradientStopsFocusOwner_&&(inOwner(gradientStopsFocusOwner_)||inOwner(gradientStopsColorFocusOwner_)||inOwner(this));
    if(msg->type()==ui::kFocusLeaveMessage && !enteringAbout && !enteringGradientStops) {

      if(symmetryDragging_)finishSymmetryDrag(true);eyedropperHeld_=false;paletteSamplingHeld_=false;if(eyedropperGesture_.active())finishEyedropper();spaceHeld_=false;if(drawingAnchorDragging_){drawingAnchor_=drawingAnchorDragBefore_;drawingAnchorDragging_=false;if(hasCapture())releaseMouse();}if(selectionPivotDragging_){selectionPivot_=selectionPivotStart_;selectionPivotDragging_=false;if(hasCapture())releaseMouse();}if(selectionDragging_ || floatingDragging_)endSelectionGesture(true);// Owned free-tile property dialogs keep previews until their normal close.
      if(!document.freeTileInstancePropertiesActive()&&!document.freeTileSourcePropertiesActive())cancelStroke();updateNavigationCursor();

    }

    if(drawingAnchorDragging_&&!hasCapture()){drawingAnchor_=drawingAnchorDragBefore_;drawingAnchorDragging_=false;invalidateRect(canvasViewport());}
    if(gradientDragging_ && !hasCapture()){if(gradientPending_ && gradientHandle_>=0){gradientSpec_=gradientHandleBefore_;gradientDragging_=false;gradientHandle_=-1;gradientRequest_=true;gradientTick();refresh();}else cancelStroke();}if((magicEraserDragging_ || fillDragging_ || (shapeDragging_&&shapeSpec_.kind!=ShapeKind::Polygon&&!(shapeSpec_.kind==ShapeKind::Curve&&!curveEndpoint_))) && !hasCapture())cancelStroke();

    if(navigation_.pan_.active && !hasCapture()) finishPan(true);

    if(msg->type()==ui::kSetCursorMessage) {updateNavigationCursor();return true;}

    if(msg->type()==ui::kKeyUpMessage && !spaceHeld_ && marqueeSpaceTarget_) {

      if(marqueeSpaceTarget_){const auto last=*marqueeTarget_,first=*marqueeSpaceTarget_;selectionStart_.x+=int(std::round(last.x-first.x));selectionStart_.y+=int(std::round(last.y-first.y));if(marqueeSpaceHadResize_){marqueeResizeStart_=last;marqueePointerStart_={double(selectionLast_.x),double(selectionLast_.y)};}marqueeSpaceTarget_.reset();invalidateRect(canvasViewport());}spaceHeld_=false;updateNavigationCursor();return true;

    }

    if(drawingAnchorDragging_&&msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){drawingAnchor_=drawingAnchorDragBefore_;drawingAnchorDragging_=false;if(hasCapture())releaseMouse();invalidateRect(canvasViewport());return true;}
    if(selectionPivotDragging_ && msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){selectionPivot_=selectionPivotStart_;selectionPivotDragging_=false;if(hasCapture())releaseMouse();invalidateRect(canvasViewport());return true;}

    if(shapeDragging_ && shapeSpec_.kind!=ShapeKind::Polygon && shapeSpec_.kind!=ShapeKind::Freeform && shapeSpec_.kind!=ShapeKind::Curve && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)){const auto key=static_cast<ui::KeyMessage*>(msg);const auto code=key->scancode();if(code>=ui::kKeyLShift && code<=ui::kKeyCommand){if(shapeSpec_.kind==ShapeKind::Line){const auto raw=key->shiftPressed()?constrainShapeLine(shapeSpec_.start,shapePointer_,runtimePreferences_.index("tools.lineDirectionStep.Number")):shapePointer_;const auto end=gridSnapPoint({int(raw.x),int(raw.y)});shapeSpec_.end={double(end.x),double(end.y)};}else shapeGeometry_.update(shapeSpec_,shapePointer_,key->shiftPressed(),bool(shapeDrawingAnchor_)||key->ctrlPressed() || key->cmdPressed(),key->altPressed(),shapeRatio_?shapeRatioWidth_/shapeRatioHeight_:0);shapeRequest_=true;shapeTick();return true;}}

    if(msg->type()==ui::kKeyDownMessage) {

      auto key=static_cast<ui::KeyMessage*>(msg);

      if(brushFeedback_.modifierBrushSize_ && key->scancode()==ui::kKeyEsc){finishModifierBrushSize();return true;}

      if(symmetryDragging_){if(key->scancode()==ui::kKeyEsc)finishSymmetryDrag(true);return true;}

      if(pending_!=Pending::None) { if(key->scancode()==ui::kKeyEsc) resolve(false); return false; }

      if(paletteSamplingHeld_)return true;

      if(eyedropperGesture_.active()){if(key->scancode()==ui::kKeyEsc)finishEyedropper();return true;}

      if(eyedropperHeld_)return true;

      if(moveModifierHeld("tool.hand.quick",*key) && !marqueeDrawingAnchor_ && selectionDragging_ && !selectionBoxDragging_ && selectionKind_<=1 && marqueeTarget_){if(!marqueeSpaceTarget_){marqueeSpaceTarget_=marqueeTarget_;marqueeSpacePointer_={double(selectionLast_.x),double(selectionLast_.y)};marqueeSpaceHadResize_=bool(marqueeResizeStart_);}return true;}

      if(spaceHeld_ && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())) {updateNavigationCursor();return true;}

      if(navigation_.pan_.active) {

        if(key->scancode()==ui::kKeyEsc) finishPan(true);

        return true;

      }

      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyH && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){if(!key->repeat()){toggleSelectionOutline();refresh();}return true;}

      if(!key->ctrlPressed() && !key->cmdPressed() && !key->altPressed() && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()) && columnShown(2) && document.timeline().state().frames.size()>1){const auto code=key->scancode();if(code==ui::kKeyComma || code==ui::kKeyStop){keyboardStepFrame(code==ui::kKeyComma?-1:1);return true;}}

      if(paletteFocused_ && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()) && (key->scancode()==ui::kKeyDel || key->scancode()==ui::kKeyBackspace)) {

        const auto ids=document.palette().selected;document.deletePaletteColors(ids);refresh();return true;

      }

      if(shapeDragging_){if(key->scancode()==ui::kKeyEsc)cancelStroke();else if(shapeSpec_.kind==ShapeKind::Polygon&&key->scancode()==ui::kKeyEnter)finishPolygonShape();else if(shapeSpec_.kind==ShapeKind::Curve&&key->scancode()==ui::kKeyEnter)finishCurveShape();return true;}

      if(gradientDragging_ || gradientPending_){if(key->scancode()==ui::kKeyEsc){if(gradientDragging_ && gradientPending_ && gradientHandle_>=0){gradientSpec_=gradientHandleBefore_;gradientDragging_=false;gradientHandle_=-1;gradientRequest_=true;if(hasCapture())releaseMouse();gradientTick();refresh();}else cancelGradientGesture();}else if(key->scancode()==ui::kKeyEnter)applyGradientGesture();return true;}

      if(magicEraserDragging_){if(key->scancode()==ui::kKeyEsc)cancelStroke();return true;}
      if(fillDragging_){if(key->scancode()==ui::kKeyEsc)cancelStroke();return true;}

      if(key->scancode()==ui::kKeyEsc && (temporaryBrushCapture_ || temporaryBrushActive_)){if(selectionDragging_)endSelectionGesture(true);exitTemporaryBrushCapture();refresh();return true;}
      if(selectionDragging_ || floatingDragging_){if(key->scancode()==ui::kKeyEsc || ((key->ctrlPressed() || key->cmdPressed()) && key->scancode()==ui::kKeyD))endSelectionGesture(true);else if(polygonPending_ && (key->ctrlPressed() || key->cmdPressed()) && (key->scancode()==ui::kKeyZ || key->scancode()==ui::kKeyY))polygonStep(key->scancode()==ui::kKeyY || key->shiftPressed());else if(key->scancode()==ui::kKeyEnter && polygonPending_)endSelectionGesture(false);else if(key->scancode()==ui::kKeyEnter && selectionKind_==4){wandReleased_=true;if(hasCapture())releaseMouse();if(wandPreviewReady_)endSelectionGesture(false);else wandTick();}return true;}

      if((ordinaryBrushTool() || (selectionTool_ && selectionKind_==5) || shapeTool_) && !paletteFocused_ && !key->altPressed() && !key->shiftPressed() && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){

        if((key->ctrlPressed() || key->cmdPressed()) && key->scancode()>=ui::kKey1 && key->scancode()<=ui::kKey3){if(!key->repeat()){brushFeedback_.brushProfiles_[eraser_?1:0].shape=BrushShape(key->scancode()-ui::kKey1);if(pencilImageBrush_){pencilImageBrushId_.clear();pencilImageBrush_.reset();}saveBrushPreferences();refresh();}return true;}

        if(!key->ctrlPressed() && !key->cmdPressed() && (key->scancode()==ui::kKeyOpenbrace || key->scancode()==ui::kKeyClosebrace)){if(!pencilImageBrush_ || !pencilImageBrush_->intrinsicSize){setModifierBrushSize((liquifyTool_?liquifyOptions_.radius:airbrushTool_?airbrushSettings_.scatterRadius:smoothTool_?smoothBrush_.size:brushFeedback_.brushProfiles_[eraser_?1:0].size)+(key->scancode()==ui::kKeyClosebrace?1:-1));}return true;}

      }

      // Legacy text-tool arrows take priority even when the layer list has focus.
      if(textTool_ && document.layer().kind=="text" && !document.hasSelectedGroups() && !shortcutInputBlocked() && !hasCapture() && !historyGestureBusy() && !key->ctrlPressed() && !key->cmdPressed() && !key->altPressed()){
        int dx=0,dy=0;if(key->scancode()==ui::kKeyLeft)dx=-1;else if(key->scancode()==ui::kKeyRight)dx=1;else if(key->scancode()==ui::kKeyUp)dy=-1;else if(key->scancode()==ui::kKeyDown)dy=1;
        if(dx||dy){if(document.nudgeTextLayer(dx,dy)){playing_=false;refresh();}return true;}
      }

      if(document.selection() && !paletteFocused_ && !key->ctrlPressed() && !key->cmdPressed() && !key->altPressed()){

        int dx=0,dy=0;if(key->scancode()==ui::kKeyLeft)dx=-1;else if(key->scancode()==ui::kKeyRight)dx=1;else if(key->scancode()==ui::kKeyUp)dy=-1;else if(key->scancode()==ui::kKeyDown)dy=1;

        if(dx || dy){
          const bool paintCells=document.layer().kind=="tilemap"&&document.activeMaskId().empty()&&document.tilemapMode()==tiles::Mode::Paint;
          if(selectionFreeTransform_&&paintCells)return true;
          if(paintCells){const auto resolved=document.timeline().resolveSurface(document.cel().id);if(!resolved.source||!resolved.source->tilemap)return true;dx*=resolved.source->tilemap->tileWidth;dy*=resolved.source->tilemap->tileHeight;}
          if(document.nudgeSelectionContent(dx,dy,frameSelectionExplicit_)){playing_=false;hideTimelineSelectionGuides();refresh();}return true;}

      }

      if(celNavigationKey(key->scancode()) && !key->ctrlPressed() && !key->cmdPressed() && !key->shiftPressed() && !key->altPressed() && !celNavigationBlocked()){pressCelNavigation(key->scancode(),std::chrono::steady_clock::now());return true;}

      if(key->scancode()==ui::kKeyEnter && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){

        if(document.selection()){document.commitFloatingPaste();if(document.selection())document.commitSelection(document.selection(),{});refresh();return true;}

        auto focus=ui::Manager::getDefault()->getFocus();if(!key->repeat() && !key->ctrlPressed() && !key->cmdPressed() && !key->shiftPressed() && !key->altPressed() && columnShown(2) && document.timeline().state().frames.size()>1 && !dynamic_cast<ui::Button*>(focus) && !celNavigationBlocked()){togglePlayback();return true;}

      }

      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyI){chooseSheetSource();return true;}

      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyQuote && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(!key->repeat())menuCommands_.invoke("toggleCustomGrid");return true;}

      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyE){openDocumentExport();return true;}

      if(key->shiftPressed() && !key->ctrlPressed() && !key->cmdPressed() && !key->altPressed() && key->scancode()==ui::kKeyR && !paletteFocused_){openReplaceColor();return true;}

      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyM && !paletteFocused_){openColorAdjustment(ColorAdjustmentKind::Curves);return true;}

      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyU && !paletteFocused_){openColorAdjustment(ColorAdjustmentKind::HueSaturation);return true;}

      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyT && !paletteFocused_){beginLayerTransform();return true;}

      if(key->shiftPressed() && !key->ctrlPressed() && !key->cmdPressed() && !key->altPressed() && (key->scancode()==ui::kKeyH || key->scancode()==ui::kKeyV) && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){if(!key->repeat())menuCommands_.invoke(key->scancode()==ui::kKeyH?"flipHorizontal":"flipVertical");return true;}

      // Legacy Ctrl+D resolves pixel deselect first, then explicit Cel copy.

      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyD && !paletteFocused_ && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(document.selection()){if(!key->repeat()){document.deselectPixels();selectionPropertiesActive_=false;selectionFreeTransform_=false;selectionPivot_.reset();selectionPivotMask_.reset();refresh();}return true;}if(!document.timelineSelection().cels.empty()){if(!key->repeat())copyTimelineCels();return true;}}

      if((key->ctrlPressed()||key->cmdPressed())&&!key->altPressed()&&!dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(key->scancode()==ui::kKeyC){if(key->shiftPressed())copyMergedPixels();else copyEditorClipboard();return true;}if(key->scancode()==ui::kKeyX&&!key->shiftPressed()){copyEditorClipboard(true);return true;}if(key->scancode()==ui::kKeyV&&!key->shiftPressed()){pasteEditorClipboard();return true;}if(!paletteFocused_&&!frameSelectionExplicit_){if(key->scancode()==ui::kKeyA&&!key->shiftPressed()){selectAllPixels();return true;}if(key->shiftPressed()&&key->scancode()==ui::kKeyI){document.invertPixels();refresh();return true;}}}

      if(!key->altPressed() && !key->ctrlPressed() && !key->cmdPressed() && !paletteFocused_ && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(key->scancode()==ui::kKeyZ && !key->shiftPressed() && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){useZoomTool();return true;}if(key->scancode()==ui::kKeyI && !key->shiftPressed() && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){useEyedropperTool();return true;}if(key->scancode()==ui::kKeyU && !key->shiftPressed()){useShapeTool(shapeSpec_.kind==ShapeKind::Line?ShapeKind::Rectangle:shapeSpec_.kind);return true;}if(key->scancode()==ui::kKeyG){if(key->shiftPressed())useGradientTool();else useFillTool();return true;}if(key->scancode()==ui::kKeyM){useSelectionTool(key->shiftPressed()?1:0);return true;}if(key->scancode()==ui::kKeyQ){useSelectionTool(key->shiftPressed()?3:2);return true;}if(key->scancode()==ui::kKeyW && !key->shiftPressed()){useSelectionTool(4);return true;}}

      if(key->altPressed() && !key->ctrlPressed() && !key->cmdPressed() && !key->shiftPressed() && key->scancode()==ui::kKeyC && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(!key->repeat() && columnShown(2))deleteTimelineItems();return true;}

      if(key->altPressed() && !key->ctrlPressed() && !key->cmdPressed() && !key->shiftPressed() && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){const auto code=key->scancode();if(code==ui::kKeyM || code==ui::kKeyN || code==ui::kKeyB){if(!key->repeat() && columnShown(2)){if(code==ui::kKeyM){playing_=false;document.addLinkedFrame(frameSelectionExplicit_);refresh();}else frameAction(code==ui::kKeyN?1:0);}return true;}}

      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){

        if(key->scancode()==ui::kKeyI && key->altPressed()){if(!key->repeat())openImageResize();return true;}

        if(!key->altPressed() && key->scancode()==ui::kKeyB){if(!key->repeat()){if(document.selection())menuCommands_.invoke("createBrushFromSelection");else beginTemporaryBrushCapture();}return true;}

        if(!key->altPressed() && key->scancode()==ui::kKeyW){if(!key->repeat())ask(Pending::CloseDocument);return true;}

      }

      switch(key->scancode()) {

        case ui::kKeyC: if(!key->ctrlPressed()&&!key->cmdPressed()&&!key->altPressed()&&!key->shiftPressed()&&!dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(!key->repeat())menuCommands_.invoke("canvasResize");return true;}break;

        case ui::kKeyH: if(key->ctrlPressed() || key->cmdPressed() || key->altPressed() || key->shiftPressed() || dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()))break;cancelStroke();textTool_=false;moveTool_=false;shapeTool_=false;eyedropperTool_=false;navigation_.zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=true;updateNavigationCursor();refresh();return true;

        case ui::kKeyTab: if(!key->ctrlPressed()){layersPanelOpen_=!layersPanelOpen_;if(layersPanelOpen_)docking_.select(2);refresh();saveWorkspaceSizes();return true;}break;

        case ui::kKeyF: if(!key->ctrlPressed() && !key->cmdPressed() && !key->shiftPressed() && !key->altPressed() && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){if(!key->repeat())menuCommands_.invoke("fillForeground");return true;}break;

        case ui::kKeyEsc: playing_=false;if(document.floating())document.cancelFloatingPaste();cancelStroke();refresh();return true;

        case ui::kKeyB: if(key->ctrlPressed() || key->cmdPressed() || key->altPressed() || key->shiftPressed() || dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()))break;document.commitFloatingPaste();cancelStroke();textTool_=false;moveTool_=false; selectionTool_=false;shapeTool_=false;eyedropperTool_=false;navigation_.zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=false; eraser_=false; updateNavigationCursor();refresh(); return true;

        case ui::kKeyE: if(key->ctrlPressed() || key->cmdPressed() || key->altPressed() || key->shiftPressed() || dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()))break;document.commitFloatingPaste();cancelStroke();textTool_=false;moveTool_=false; selectionTool_=false;shapeTool_=false;eyedropperTool_=false;navigation_.zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=false; eraser_=true; updateNavigationCursor();refresh(); return true;

        case ui::kKeyZ: if((key->ctrlPressed() || key->cmdPressed()) && !key->altPressed()) { cancelStroke(); if(key->shiftPressed()) document.redo(); else document.undo(); refresh(); return true; } break;

        case ui::kKeyY: if((key->ctrlPressed() || key->cmdPressed()) && !key->altPressed() && !key->shiftPressed()) {cancelStroke();document.redo();refresh();return true;} break;

        case ui::kKeyS: if((key->ctrlPressed() || key->cmdPressed()) && !key->altPressed()) {saveProject(key->shiftPressed());return true;} break;

        case ui::kKeyO: if((key->ctrlPressed() || key->cmdPressed()) && !key->altPressed() && !key->shiftPressed()) {cancelStroke();chooseProject();return true;} break;

        case ui::kKeyDel: case ui::kKeyBackspace:

          if(!dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){deleteWorkspaceContent(true);return true;}break;

        case ui::kKeyN: if(!key->altPressed() && !key->cmdPressed() && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(key->shiftPressed() && !key->ctrlPressed()){cancelStroke();createLayer();return true;}if(key->ctrlPressed() && !key->shiftPressed()){ask(Pending::New);return true;}}break;

        default: break;

      }

    }

    if(shapeDragging_&&shapeSpec_.kind==ShapeKind::Polygon&&msg->type()==ui::kDoubleClickMessage&&static_cast<ui::MouseMessage*>(msg)->left()&&shapeSpec_.polygonPath.size()>=3){finishPolygonShape();return true;}
    if(polygonPending_ && msg->type()==ui::kDoubleClickMessage){if(static_cast<ui::MouseMessage*>(msg)->left() && selectionPath_.size()>=3)endSelectionGesture(false);return true;}

    if(pending_==Pending::None && msg->type()==ui::kDoubleClickMessage &&

      columnShown(0) && paletteViewportBounds().contains(static_cast<ui::MouseMessage*>(msg)->position())&&(!paletteManual_||static_cast<ui::MouseMessage*>(msg)->left())) {

      cancelStroke();if(paletteManual_)addManualPaletteColor(paletteSlotAt(static_cast<ui::MouseMessage*>(msg)->position()));else document.addPaletteColor(ink_,paletteLocked_);paletteFocused_=true;refresh();return true;

    }

    if(pending_==Pending::None && msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->right()) {

      const auto point=static_cast<ui::MouseMessage*>(msg)->position();const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);

      if(columnShown(0) && uiPhysical(gfx::Rect(rc.x+l.rightX,rc.y+l.tabY,l.right,Layout::tabHeight)).contains(point)){showColumnContextMenu(Column::Palette);return true;}

      if(columnShown(1) && uiPhysical(gfx::Rect(rc.x+l.rightX,rc.y+l.split,l.right,Layout::tabHeight)).contains(point)){showColumnContextMenu(Column::Color);return true;}

      if(columnShown(2) && toDisplay(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop,l.workW,16)).contains(point)){showColumnContextMenu(Column::Layers);return true;}

    }

    if(pending_==Pending::None && msg->type()==ui::kMouseDownMessage && !document.active()) {

      const auto mouse=static_cast<ui::MouseMessage*>(msg);

      if(brushRange_) brushRange_->setVisible(false);

      if(columnShown(0) && paletteViewportBounds().contains(mouse->position())) {document.clearPaletteSelection();paletteFocused_=true;paletteFocusedSlot_=paletteSlotAt(mouse->position());refresh();}

      else {paletteFocused_=false;paletteFocusedSlot_.reset();document.clearPaletteSelection();refresh();}

    }

    if(pending_==Pending::None && columnShown(2) && msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->right()) {

      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,2);

      if(uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop,l.workW,l.bottom-l.layerTop)).contains(mouse->position())){

        const auto point=mouse->position();const int row=(point.y/uiScale-rc.y-l.layerTop-timelineRowsOffset())/timelineRowHeight()+layerScroll_;

        if(point.y/uiScale>=rc.y+l.layerTop+timelineRowsOffset() && point.x/uiScale>=rc.x+l.workX+5 && point.x/uiScale<rc.x+l.workX+5+timelineLabelWidth() && row>=0 && row<int(document.timeline().state().layers.size())){prepareLayerContext(document.timeline().state().layers[row].id);showLayerContextMenu(1);}else showLayerContextMenu(0);

        return true;

      }

    }

    if(pending_==Pending::None&&msg->type()==ui::kDoubleClickMessage&&selectionTool_&&selectionKind_==0&&!selectionFreeTransform_&&!spaceHeld_&&!handTool_&&!eyedropperTool_&&!eyedropperHeld_){auto mouse=static_cast<ui::MouseMessage*>(msg);if(mouse->left()&&canvasOwnsPointer(mouse->position())&&canvasViewport().contains(mouse->position())){if(selectionDragging_||floatingDragging_)return true;ui::MouseMessage down(ui::kMouseDownMessage,mouse->pointerType(),mouse->button(),mouse->modifiers(),mouse->position());quickSelectionExplicitDouble_=true;const bool handled=onProcessMessage(&down);quickSelectionExplicitDouble_=false;return handled;}}

    if(pending_==Pending::None && columnShown(2) && msg->type()==ui::kMouseWheelMessage) {

      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,2);

      const auto delta=mouse->wheelDelta();

      if((mouse->ctrlPressed() || mouse->cmdPressed()) && toDisplay(gfx::Rect(l.workX,l.layerTop,l.workW,l.bottom-l.layerTop)).contains(mouse->position())){const int primary=std::abs(delta.x)>std::abs(delta.y)?delta.x:delta.y;if(primary)setTimelineDensity(timelineDensity_+(primary<0?1:-1)*(mouse->altPressed()?3:1));return true;}

      if(toDisplay(gfx::Rect(l.workX,l.layerTop+timelineHeaderOffset(),l.workW,l.bottom-l.layerTop-timelineHeaderOffset())).contains(mouse->position())){

        const auto m=timelineScrollMetrics(l);const int step=(mouse->shiftPressed() || delta.x?timelineFrameWidth():timelineRowHeight())*uiScale;

        if(mouse->shiftPressed() || delta.x){const int direction=delta.x?delta.x:delta.y;const int offset=std::clamp(frameScroll_*step+frameScrollRemainder_+(direction>0?-step:direction<0?step:0)*(mouse->altPressed()?5:1),0,std::max(0,m.contentWidth-m.width));frameScroll_=offset/step;frameScrollRemainder_=offset%step;}

        else {const int offset=std::clamp(layerScroll_*step+layerScrollRemainder_+(delta.y>0?step:delta.y<0?-step:0)*(mouse->altPressed()?5:1),0,std::max(0,m.contentHeight-m.height));layerScroll_=offset/step;layerScrollRemainder_=offset%step;}

        layoutLayers();invalidateTimelineGrid();return true;

      }

    }

    if(pending_==Pending::None && msg->type()==ui::kMouseWheelMessage) {

      const auto mouse=static_cast<ui::MouseMessage*>(msg);

      const auto logical=uiLogical(bounds());

      // A number field owns the wheel gesture even inside the tool row. This

      // keeps focus/selection visible while changing the value.

      for(auto child:children())if(auto entry=dynamic_cast<PixelEntry*>(child))

        if(entry->isVisible() && entry->isEnabled() && !entry->isReadOnly() && (entry->numeric || entry->wheel) &&

           !mouse->ctrlPressed() && !mouse->cmdPressed() && mouse->wheelDelta().y &&

           entry->bounds().contains(mouse->position()) &&

           (!scrollViewports_.count(entry) || scrollViewports_.at(entry).contains(mouse->position())) &&

           entry->onProcessMessage(msg))return true;

      if(advancedMode_!=2 && mouse->position().x>=bounds().x+workspaceLayout(uiLogical(bounds())).workX*uiScale && mouse->position().y>=bounds().y+optionsTop()*uiScale && mouse->position().y<bounds().y+(optionsTop()+Layout::optionsHeight)*uiScale && !mouse->ctrlPressed() && !mouse->cmdPressed()) {

        const auto delta=mouse->wheelDelta();toolRowScroll_+=(delta.x?delta.x:delta.y)*24*uiScale;layoutToolOptions();invalidate();return true;

      }

      if(columnShown(0) && paletteViewportBounds().contains(mouse->position())) {

        paletteWheel(*mouse);

        return true;

      }

      if(canvasViewport().contains(mouse->position())) {

        if(moveModifierHeld("brushSizeWheelAdjust",*mouse) && modifierBrushSupported() && !document.active() && !selectionDragging_ && !floatingDragging_ && !shapeDragging_ && mouse->wheelDelta().y){

          setModifierBrushSize((liquifyTool_?liquifyOptions_.radius:airbrushTool_?airbrushSettings_.scatterRadius:smoothTool_?smoothBrush_.size:brushFeedback_.brushProfiles_[eraser_?1:0].size)+(mouse->wheelDelta().y<0?1:-1)*(runtimePreferences_.flag("editing.brushSizeWheelReversed")?-1:1));return true;

        }

        // Keep the coordinate mapping stable until the current stroke ends.

        if(!smoothDragging_ && (!document.active() || (document.floating() && !floatingDragging_ && !selectionDragging_)) && !navigation_.pan_.active && !navigation_.zoomDragging_ && runtimePreferences_.flag("editing.wheelZoomEnabled") && mouse->wheelDelta().y!=0)

          zoomCanvas(mouse->position(),mouse->wheelDelta().y<0?1:-1);

        return true;

      }

    }

    if(!advancedActive() && docking_.custom && pending_==Pending::None && msg->type()==ui::kMouseDownMessage){const auto m=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());const auto geometry=columnGeometry(rc);for(int id=0;id<panels::columnCount;++id)if(geometry.shown[id] && docking_.groups[docking_.groupOf(id)].dock==panels::Dock::Floating){auto r=geometry.panel[id];if(uiPhysical(gfx::Rect(rc.x+r.x,rc.y+r.y,r.w,r.h)).contains(m->position()))return true;}}

    if(pending_==Pending::None && (msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage)) {

      auto mouse=static_cast<ui::MouseMessage*>(msg);

      const bool canvasGesture=drawingAnchorDragging_||selectionDragging_||floatingDragging_||selectionPivotDragging_||navigation_.pan_.active||navigation_.zoomDragging_||symmetryDragging_||eyedropperGesture_.active()||shapeDragging_||gradientDragging_||fillDragging_||brushFeedback_.modifierBrushSize_||document.active();

      if(!canvasOwnsPointer(mouse->position()) && !(canvasGesture && hasCapture()))return ui::Widget::onProcessMessage(msg);

      if(msg->type()==ui::kMouseMoveMessage && !selectionSyntheticMove_)selectionAutoPan(mouse->position());selectionPointerPosition_=mouse->position();brushFeedback_.brushPreviewShift_=mouse->shiftPressed();brushFeedback_.modifierCtrl_=mouse->ctrlPressed() || mouse->cmdPressed(); const auto p=canvasPoint(mouse->position());

      if(brushFeedback_.modifierBrushSize_ && brushFeedback_.modifierBrushSize_->pressed){

        if(msg->type()==ui::kMouseMoveMessage)setModifierBrushSize(brushFeedback_.modifierBrushSize_->size+int(std::floor(double(mouse->position().x-brushFeedback_.modifierBrushSize_->start.x)/(4*uiScale)+.5)));

        if(msg->type()==ui::kMouseUpMessage && mouse->left())finishModifierBrushSize();return true;

      }

      if(!document.active() && !shapeDragging_ && !selectionDragging_ && !floatingDragging_ && !gradientDragging_ && !spaceHeld_ && modifierBrushSupported() && moveModifierHeld("brushSizeAdjust",*mouse) && canvasViewport().contains(mouse->position())){

        if(msg->type()==ui::kMouseMoveMessage || (msg->type()==ui::kMouseDownMessage && mouse->left())){

          if(!brushFeedback_.modifierBrushSize_)brushFeedback_.modifierBrushSize_=ModifierBrushSize{mouse->position(),(liquifyTool_?liquifyOptions_.radius:airbrushTool_?airbrushSettings_.scatterRadius:smoothTool_?smoothBrush_.size:brushFeedback_.brushProfiles_[eraser_?1:0].size)};

          if(msg->type()==ui::kMouseDownMessage){brushFeedback_.modifierBrushSize_->start=mouse->position();brushFeedback_.modifierBrushSize_->size=(liquifyTool_?liquifyOptions_.radius:airbrushTool_?airbrushSettings_.scatterRadius:smoothTool_?smoothBrush_.size:brushFeedback_.brushProfiles_[eraser_?1:0].size);brushFeedback_.modifierBrushSize_->pressed=true;requestFocus();captureMouse();}

          else setModifierBrushSize(brushFeedback_.modifierBrushSize_->size+int(std::floor(double(mouse->position().x-brushFeedback_.modifierBrushSize_->start.x)/(4*uiScale)+.5)));

          eyedropperHeld_=false;updateNavigationCursor();return true;

        }

      }else if(brushFeedback_.modifierBrushSize_)finishModifierBrushSize();

      if(navigation_.zoomDragging_){

        if(msg->type()==ui::kMouseMoveMessage)setCanvasZoom(navigation_.zoomStartPointer_,canvasZoomDragTarget(navigation_.zoomStartScale_,double(mouse->position().x-navigation_.zoomStartPointer_.x)/uiScale,navigation_.zoomSmooth_,mouse->shiftPressed()));

        if(msg->type()==ui::kMouseUpMessage && (mouse->button()==navigation_.zoomButton_ || mouse->button()==ui::kButtonNone)){

          if(mouse->button()!=ui::kButtonNone && std::abs(mouse->position().x-navigation_.zoomStartPointer_.x)<=3*uiScale && std::abs(mouse->position().y-navigation_.zoomStartPointer_.y)<=3*uiScale)zoomCanvas(mouse->position(),navigation_.zoomButton_==ui::kButtonRight?-1:1);

          finishZoomTool();

        }

        return true;

      }

      if(navigation_.zoomTool_ && msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && !mouse->altPressed() && !spaceHeld_ && canvasViewport().contains(mouse->position()) && (!document.active() || document.floating()) && !selectionDragging_ && !floatingDragging_){requestFocus();navigation_.zoomDragging_=true;navigation_.zoomStartPointer_=mouse->position();navigation_.zoomStartScale_=zoom_;navigation_.zoomButton_=mouse->button();captureMouse();updateNavigationCursor();return true;}

      if(symmetryDragging_){if(msg->type()==ui::kMouseMoveMessage){if(!symmetryAxisDragAllowed(symmetryLocked_,mouse->ctrlPressed())){finishSymmetryDrag();return true;}document.setSymmetryCenter(moveSymmetryCenter(document.symmetryCenter(),symmetryDragAxis_,{canvasDocumentPoint(mouse->position()).x,canvasDocumentPoint(mouse->position()).y},document.width(),document.height()),false);invalidateRect(canvasViewport());}if(msg->type()==ui::kMouseUpMessage)finishSymmetryDrag();return true;}

      if(msg->type()==ui::kMouseDownMessage && mouse->left() && !document.active() && !selectionDragging_ && !floatingDragging_ && !spaceHeld_ && !handTool_ && !navigation_.zoomTool_ && !eyedropperTool_ && !eyedropperHeld_){if(auto hit=symmetryHit(mouse->position(),mouse->ctrlPressed())){symmetryDragging_=true;symmetryDragAxis_=*hit;symmetryDragBefore_=document.symmetryCenter();captureMouse();return true;}}

      if(eyedropperGesture_.active()){if(msg->type()==ui::kMouseMoveMessage && canvasViewport().contains(mouse->position())){updateEyedropperLens(mouse->position(),sampleEyedropper(document.timeline(),document.frame().id,document.layer().id,document.width(),document.height(),p.x,p.y,eyedropperSource_));sampleEyedropperAt(p);}if(msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_)finishEyedropper();return true;}

      if(msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && (eyedropperTool_ || eyedropperHeld_ || paletteSamplingHeld_) && !spaceHeld_ && !document.active() && !selectionDragging_ && !floatingDragging_ && canvasViewport().contains(mouse->position())){paletteFocused_=false;requestFocus();playing_=false;strokeButton_=mouse->button();eyedropperGesture_.begin(mouse->right(),!eyedropperTool_ || eyedropperHeld_ || paletteSamplingHeld_);captureMouse();updateEyedropperLens(mouse->position(),sampleEyedropper(document.timeline(),document.frame().id,document.layer().id,document.width(),document.height(),p.x,p.y,eyedropperSource_));sampleEyedropperAt(p);updateNavigationCursor();return true;}

      if(drawingAnchorDragging_){if(msg->type()==ui::kMouseMoveMessage){auto at=transformCanvasPoint(mouse->position());const auto before=TransformPoint{std::floor(drawingAnchorDragBefore_.x*document.width()*2+.5)/2,std::floor(drawingAnchorDragBefore_.y*document.height()*2+.5)/2};auto round=[](double v){return std::copysign(std::floor(std::abs(v)+.5),v);};drawingAnchor_={(before.x+round(at.x-drawingAnchorPointerStart_.x))/document.width(),(before.y+round(at.y-drawingAnchorPointerStart_.y))/document.height()};invalidateRect(canvasViewport());}if(msg->type()==ui::kMouseUpMessage){if(mouse->button()==ui::kButtonNone)drawingAnchor_=drawingAnchorDragBefore_;else saveBrushPreferences();drawingAnchorDragging_=false;if(hasCapture())releaseMouse();refresh();}return true;}
      if(msg->type()==ui::kMouseDownMessage&&mouse->left()&&drawingAnchorActive()&&drawingAnchorVisible_&&!document.active()&&!shapeDragging_&&!selectionDragging_&&!spaceHeld_&&!handTool_&&!eyedropperHeld_&&!mouse->shiftPressed()&&!mouse->ctrlPressed()&&!mouse->cmdPressed()&&!mouse->altPressed()&&canvasViewport().contains(mouse->position())){const auto anchor=canvasDocumentToDisplay(drawingAnchorPoint());if(std::abs(mouse->position().x-anchor.x)<=10&&std::abs(mouse->position().y-anchor.y)<=10){drawingAnchorDragging_=true;drawingAnchorDragBefore_=drawingAnchor_;drawingAnchorPointerStart_=transformCanvasPoint(mouse->position());captureMouse();return true;}}
      if(msg->type()==ui::kMouseDownMessage && mouse->left() && !spaceHeld_ && !handTool_ && !document.active() && !mouse->shiftPressed() && !mouse->ctrlPressed() && !mouse->cmdPressed() && !mouse->altPressed() && canvasViewport().contains(mouse->position()) && selectionPivotHit(mouse->position())){selectionPivotDragging_=true;selectionPivotStart_=selectionPivotPoint();selectionPivotPointerStart_=transformCanvasPoint(mouse->position());captureMouse();return true;}

      if(selectionPivotDragging_){if(msg->type()==ui::kMouseMoveMessage || (msg->type()==ui::kMouseUpMessage && mouse->left())){auto at=transformCanvasPoint(mouse->position());auto round=[](double v){return std::copysign(std::floor(std::abs(v)+.5),v);};selectionPivot_=TransformPoint{selectionPivotStart_.x+round(at.x-selectionPivotPointerStart_.x),selectionPivotStart_.y+round(at.y-selectionPivotPointerStart_.y)};invalidateRect(canvasViewport());}if(msg->type()==ui::kMouseUpMessage){if(mouse->button()==ui::kButtonNone)selectionPivot_=selectionPivotStart_;selectionPivotDragging_=false;if(hasCapture())releaseMouse();updateNavigationCursor();}return true;}

      if(selectionTool_){selectionShift_=mouse->shiftPressed();selectionCtrl_=mouse->ctrlPressed() || mouse->cmdPressed();selectionRight_=mouse->right();layoutToolOptions();invalidateRect(canvasViewport());}

      if(selectionTool_ && selectionKind_==5){selectionBrushPointer_=canvasViewport().contains(mouse->position()) || selectionDragging_?std::optional<gfx::Point>{mouse->position()}:std::optional<gfx::Point>{};invalidateRect(canvasViewport());if(selectionDragging_ && !selectionBoxDragging_ && selectionBrushIdentity_!=document.identity()){selectionDragging_=false;selectionBrushStroke_={};if(hasCapture())releaseMouse();return true;}}

      if(msg->type()==ui::kMouseUpMessage && mouse->button()==ui::kButtonNone) {

        eyedropperHeld_=false;paletteSamplingHeld_=false;if(eyedropperGesture_.active())finishEyedropper();spaceHeld_=false;if(drawingAnchorDragging_){drawingAnchor_=drawingAnchorDragBefore_;drawingAnchorDragging_=false;if(hasCapture())releaseMouse();}if(selectionPivotDragging_){selectionPivot_=selectionPivotStart_;selectionPivotDragging_=false;if(hasCapture())releaseMouse();}if(selectionDragging_ || floatingDragging_)endSelectionGesture(true);cancelStroke();updateNavigationCursor();return true;

      }

      if(navigation_.pan_.active) {

        if(msg->type()==ui::kMouseMoveMessage || (msg->type()==ui::kMouseUpMessage && mouse->button()==navigation_.panButton_)) {

          const double sensitivity[]{.5,.75,1,1.5,2};const double factor=sensitivity[runtimePreferences_.index("editing.viewDragSensitivity.Select")];

          const auto origin=navigation_.pan_.move({navigation_.pan_.pointer.x+int(std::lround((mouse->position().x-navigation_.pan_.pointer.x)*factor)),navigation_.pan_.pointer.y+int(std::lround((mouse->position().y-navigation_.pan_.pointer.y)*factor))});

          const auto previous=canvas_;

          if(runtimePreferences_.index("editing.rotationIndicatorPosition.Select")!=1){const auto d=viewRotation_.inverse({double(origin.x-navigation_.pan_.origin.x),double(origin.y-navigation_.pan_.origin.y)},{0,0});canvas_.x=navigation_.pan_.origin.x+int(std::lround(d.x));canvas_.y=navigation_.pan_.origin.y+int(std::lround(d.y));}else{canvas_.x=origin.x;canvas_.y=origin.y;}constrainCanvas();if(msg->type()==ui::kMouseUpMessage)saveDocumentView();

          if(canvas_!=previous) invalidatePanMovement(canvas_.origin()-previous.origin());

          if(msg->type()==ui::kMouseUpMessage) finishPan(false);

        }

        return true;

      }

      const auto drawPoint=gridSnapPoint(p);

      if(shapeDragging_&&shapeSpec_.kind==ShapeKind::Curve){
        try{
          if(msg->type()==ui::kMouseMoveMessage){if(curveEndpoint_)shapeSpec_.end={double(drawPoint.x),double(drawPoint.y)};else for(std::size_t i=curveAnchorIndex_;i<curveControls_.size();++i)curveControls_[i]={double(drawPoint.x),double(drawPoint.y)};shapeRequest_=true;shapeTick();}
          else if(msg->type()==ui::kMouseUpMessage&&(mouse->left()||mouse->right())){
            if(curveEndpoint_){curveControls_.assign(curveAnchorCount_,shapeSpec_.end);curveAnchorIndex_=0;curveEndpoint_=false;if(hasCapture())releaseMouse();shapeRequest_=true;shapeTick();refresh();}
            else if(++curveAnchorIndex_>=int(curveControls_.size()))finishCurveShape();
          }
        }catch(const std::exception& e){cancelStroke();status_=U"曲线失败："+unicodeText(e.what());refresh();}return true;
      }
      if(shapeDragging_&&shapeSpec_.kind==ShapeKind::Freeform){
        if(msg->type()==ui::kMouseMoveMessage){
          auto& path=shapeSpec_.polygonPath;const SelectionPoint next{drawPoint.x,drawPoint.y};
          if(path.empty()||path.back().x!=next.x||path.back().y!=next.y){path.push_back(next);polygonShapeRedo_.clear();}
          shapePointer_={double(drawPoint.x),double(drawPoint.y)};polygonShapePreview();
        }else if(msg->type()==ui::kMouseUpMessage&&mouse->button()==strokeButton_)finishPolygonShape();
        return true;
      }
      if(shapeDragging_&&shapeSpec_.kind==ShapeKind::Polygon){
        shapePointer_={double(drawPoint.x),double(drawPoint.y)};
        if(msg->type()==ui::kMouseDownMessage){if(mouse->right())polygonShapeStep(false);else if(mouse->left()){auto& path=shapeSpec_.polygonPath;if(path.empty()||path.back().x!=drawPoint.x||path.back().y!=drawPoint.y){path.push_back({drawPoint.x,drawPoint.y});polygonShapeRedo_.clear();}polygonShapePreview();}}
        else if(msg->type()==ui::kMouseMoveMessage)polygonShapePreview();
        else if(msg->type()==ui::kMouseUpMessage&&hasCapture())releaseMouse();
        return true;
      }
      if(shapeDragging_){shapePointer_=shapeSpec_.kind==ShapeKind::Line?TransformPoint{double(p.x),double(p.y)}:TransformPoint{double(drawPoint.x),double(drawPoint.y)};if(msg->type()==ui::kMouseMoveMessage || (msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_)){if(shapeSpec_.kind==ShapeKind::Line){const auto raw=mouse->shiftPressed()?constrainShapeLine(shapeSpec_.start,{double(p.x),double(p.y)},runtimePreferences_.index("tools.lineDirectionStep.Number")):TransformPoint{double(p.x),double(p.y)};const auto end=gridSnapPoint({int(raw.x),int(raw.y)});shapeSpec_.end={double(end.x),double(end.y)};}else shapeGeometry_.update(shapeSpec_,{double(drawPoint.x),double(drawPoint.y)},mouse->shiftPressed(),bool(shapeDrawingAnchor_)||mouse->ctrlPressed() || mouse->cmdPressed(),mouse->altPressed(),shapeRatio_?shapeRatioWidth_/shapeRatioHeight_:0);shapeRequest_=true;if(msg->type()==ui::kMouseUpMessage){shapeTick();try{if(document.shapeActive())([&]{Document::HistoryLabelScope historyLabel(document,shapeSpec_.kind==ShapeKind::Line?U"绘制直线":(shapeSpec_.kind==ShapeKind::Ellipse||shapeSpec_.kind==ShapeKind::EllipseOutline)?U"绘制椭圆":U"绘制矩形");return document.commitShapePreview();})();}catch(const std::exception& e){document.cancelShapePreview();status_=U"形状失败："+unicodeText(e.what());}shapeDragging_=shapeRequest_=false;if(hasCapture())releaseMouse();refresh();}else invalidateRect(canvasViewport());}return true;}

      if(shapeTool_ && msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && !spaceHeld_ && !handTool_ && canvasViewport().contains(mouse->position()) && canvasDocumentContains(mouse->position())){hideTimelineSelectionGuides();paletteFocused_=false;document.clearPaletteSelection();requestFocus();playing_=false;strokeButton_=mouse->button();try{if(document.beginShapePreview(drawPoint)){shapePointer_=shapeSpec_.start=shapeSpec_.end={double(drawPoint.x),double(drawPoint.y)};shapeSpec_.bounds={double(drawPoint.x),double(drawPoint.y),1,1};shapeGeometry_={};shapeGeometry_.viewAngle=shapeViewAlignedAngle(viewRotation_.degrees,viewRotation_.mirrorX,viewRotation_.mirrorY);shapeSpec_.bounds.angle=shapeGeometry_.viewAngle;shapeDrawingAnchor_.reset();if(drawingAnchorActive()){shapeDrawingAnchor_=drawingAnchorPoint();shapeSpec_.start={shapeDrawingAnchor_->x-.5,shapeDrawingAnchor_->y-.5};shapeGeometry_.update(shapeSpec_,shapePointer_,mouse->shiftPressed(),true,false,shapeRatio_?shapeRatioWidth_/shapeRatioHeight_:0);shapeSpec_.bounds=centerDrawingBounds(shapeSpec_.bounds,*shapeDrawingAnchor_);}shapeColor_=(shapeSpec_.kind==ShapeKind::Line||shapeSpec_.kind==ShapeKind::Polygon||shapeSpec_.kind==ShapeKind::Freeform||shapeSpec_.kind==ShapeKind::Curve) && mouse->right()?document.palette().secondary:ink_;shapeIdentity_=document.identity();shapeDragging_=shapeRequest_=true;curveEndpoint_=true;curveAnchorIndex_=0;curveControls_.clear();captureMouse();if(shapeSpec_.kind==ShapeKind::Polygon||shapeSpec_.kind==ShapeKind::Freeform){shapeSpec_.polygonPath={{drawPoint.x,drawPoint.y}};polygonShapeRedo_.clear();polygonShapeCachePath_.clear();polygonShapeCache_.clear();polygonShapePreview();}else shapeTick();refresh();}}catch(const std::exception& e){document.cancelShapePreview();shapeDragging_=shapeRequest_=false;if(hasCapture())releaseMouse();status_=U"形状失败："+unicodeText(e.what());refresh();}return true;}

      if(gradientDragging_){if(msg->type()==ui::kMouseMoveMessage || (msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_)){const TransformPoint at{double(drawPoint.x),double(drawPoint.y)};if(gradientHandle_>=0){const TransformPoint delta{at.x-gradientHandlePress_.x,at.y-gradientHandlePress_.y};gradientSpec_=gradientHandleBefore_;if(gradientHandle_==0){gradientSpec_.start={gradientHandleBefore_.start.x+delta.x,gradientHandleBefore_.start.y+delta.y};gradientSpec_.geometry.reset();}else if(gradientHandle_==1){gradientGeometry_.update(gradientSpec_,at,mouse->shiftPressed(),mouse->ctrlPressed() || mouse->cmdPressed(),mouse->altPressed());}else{gradientSpec_.start={gradientHandleBefore_.start.x+delta.x,gradientHandleBefore_.start.y+delta.y};gradientSpec_.end={gradientHandleBefore_.end.x+delta.x,gradientHandleBefore_.end.y+delta.y};if(gradientSpec_.geometry){gradientSpec_.geometry->center.x+=delta.x;gradientSpec_.geometry->center.y+=delta.y;}}}else gradientGeometry_.update(gradientSpec_,at,mouse->shiftPressed(),mouse->ctrlPressed() || mouse->cmdPressed(),mouse->altPressed());gradientRequest_=true;if(msg->type()==ui::kMouseUpMessage){gradientTick();gradientDragging_=false;if(hasCapture())releaseMouse();if(gradientConfirm_){if(gradientSpec_.start.x==gradientSpec_.end.x && gradientSpec_.start.y==gradientSpec_.end.y)cancelGradientGesture();else{gradientPending_=true;refresh();}}else applyGradientGesture();}else invalidateRect(canvasViewport());}return true;}

      if(gradientPending_ && msg->type()==ui::kMouseDownMessage && mouse->left() && !mouse->ctrlPressed() && !mouse->cmdPressed() && !spaceHeld_ && canvasViewport().contains(mouse->position())){const auto at=TransformPoint{double(drawPoint.x),double(drawPoint.y)};gradientHandle_=gradientEditHandle(gradientSpec_,at,canvasScale());if(gradientHandle_<0)return true;gradientHandlePress_=at;gradientHandleBefore_=gradientSpec_;gradientGeometry_={};gradientDragging_=true;strokeButton_=mouse->button();captureMouse();return true;}

      if(gradientTool_ && !gradientPending_ && msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && !spaceHeld_ && !handTool_ && canvasViewport().contains(mouse->position()) && canvasDocumentContains(mouse->position())){hideTimelineSelectionGuides();paletteFocused_=false;document.clearPaletteSelection();requestFocus();playing_=false;strokeButton_=mouse->button();gradientRight_=mouse->right();if(document.beginGradient(drawPoint,gradientOptions_)){gradientSpec_.start=gradientSpec_.end={double(drawPoint.x),double(drawPoint.y)};gradientSpec_.angle=0;gradientSpec_.geometry.reset();gradientGeometry_={};gradientDragging_=true;gradientIdentity_=document.identity();gradientContent_=document.contentRevision();gradientLayer_=document.layer().id;gradientFrame_=document.frame().id;gradientRequest_=true;captureMouse();gradientTick();refresh();}return true;}

      if(processMagicEraserInput(msg))return true;
      if(fillDragging_){if(msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_){fillDragging_=false;fillCommitted_=false;if(hasCapture())releaseMouse();refresh();}return true;}

      if(fillTool_ && msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && !spaceHeld_ && !handTool_ && canvasViewport().contains(mouse->position()) && canvasDocumentContains(mouse->position())){hideTimelineSelectionGuides();paletteFocused_=false;document.clearPaletteSelection();requestFocus();playing_=false;strokeButton_=mouse->button();try{fillCommitted_=document.fillPatternPixels(drawPoint,mouse->right()?document.palette().secondary:ink_,fillPattern_,fillOptions_);fillDragging_=fillCommitted_;if(fillDragging_)captureMouse();}catch(const std::exception& e){status_=U"填充失败："+unicodeText(e.what());}refresh();return true;}

      if(msg->type()==ui::kMouseDownMessage && !document.active() && canvasViewport().contains(mouse->position()) &&

         (mouse->middle() || (mouse->left() && (spaceHeld_ || handTool_)))) {

        requestFocus();captureMouse();

        navigation_.pan_.begin({mouse->position().x,mouse->position().y},{canvas_.x,canvas_.y});

        invalidateRect(canvasViewport()); // Remove the old brush preview before reuse.

        navigation_.panButton_=mouse->button();updateNavigationCursor();return true;

      }

      if((selectionDragging_ || floatingDragging_) && msg->type()==ui::kMouseMoveMessage){selectionMoved_|=std::abs(mouse->position().x-selectionPress_.x)>3 || std::abs(mouse->position().y-selectionPress_.y)>3;if(floatingDragging_ && !transformHandle_.empty()){const auto current=transformCanvasPoint(mouse->position());auto target=transformGestureStart_;if(selectionFreeTransform_ && target.quad){const int index=transformHandle_=="nw"?0:transformHandle_=="ne"?1:transformHandle_=="se"?2:3;auto quad=*target.quad;quad[index]={std::floor(current.x+.5),std::floor(current.y+.5)};if(selectionQuadConvex(quad)){target.quad=quad;const auto box=transformBounds(target);target.x=box.x;target.y=box.y;target.width=box.width;target.height=box.height;target.angle=0;target.shearX=target.shearY=0;}}

          else if(transformHandle_.rfind("shear-",0)==0)target=shearSelectionTransform(transformGestureStart_,{current.x-transformPointerStart_.x,current.y-transformPointerStart_.y},transformHandle_.back(),selectionPivotStart_,symmetryHas(document.symmetryAxes)&&document.activeMaskId().empty()&&document.layer().kind!="tilemap");

          else if(transformHandle_.rfind("rotate-",0)==0){const double cx=selectionPivotStart_.x,cy=selectionPivotStart_.y;const double delta=(std::atan2(current.y-cy,current.x-cx)-std::atan2(transformPointerStart_.y-cy,transformPointerStart_.x-cx))*180/3.141592653589793;target.angle=transformGestureStart_.angle+delta;if(mouse->shiftPressed()||tabletAssist_.modifier(document.identity(),0))target.angle=std::floor(target.angle/45+.5)*45;const double radians=(target.angle-transformGestureStart_.angle)*3.141592653589793/180,dx=transformGestureStart_.x+target.width/2-cx,dy=transformGestureStart_.y+target.height/2-cy;target.x=cx+dx*std::cos(radians)-dy*std::sin(radians)-target.width/2;target.y=cy+dx*std::sin(radians)+dy*std::cos(radians)-target.height/2;}else {target=resizeSelectionTransform(transformGestureStart_,{double(p.x-selectionStart_.x),double(p.y-selectionStart_.y)},transformHandle_,mouse->shiftPressed()||tabletAssist_.modifier(document.identity(),0),mouse->ctrlPressed() || mouse->cmdPressed(),mouse->altPressed()||tabletAssist_.modifier(document.identity(),1),selectionPivotStart_);if(selectionPivot_ && !mouse->altPressed()&&!tabletAssist_.modifier(document.identity(),1)){const auto local=transformLocalPoint(transformGestureStart_,selectionPivotStart_);selectionPivot_=transformPoint(target,(local.x-transformGestureStart_.x)/transformGestureStart_.width,(local.y-transformGestureStart_.y)/transformGestureStart_.height);}}document.transformFloatingPaste(target,selectionRotSprite_);}else if(floatingDragging_&&document.paintCellMoving()){const auto distance=constrainedSelectionDelta({p.x-selectionStart_.x,p.y-selectionStart_.y},mouse->shiftPressed()||tabletAssist_.modifier(document.identity(),0));document.updatePaintCellMove(distance.x,distance.y);if(selectionPivot_&&document.selection())selectionPivot_=TransformPoint{selectionPivotStart_.x+document.selection()->x-transformGestureStart_.x,selectionPivotStart_.y+document.selection()->y-transformGestureStart_.y};}else if(floatingDragging_){int dx=p.x-selectionStart_.x,dy=p.y-selectionStart_.y;const auto mappedDistance=document.symmetryContentDragDelta({dx,dy});const auto rawDistance=constrainedSelectionDelta({mappedDistance.x,mappedDistance.y},mouse->shiftPressed()||tabletAssist_.modifier(document.identity(),0));const auto box=transformBounds(transformGestureStart_);const auto distance=gridSnapMove(rawDistance,{double(box.x),double(box.y),double(box.width),double(box.height)});dx=distance.x;dy=distance.y;auto target=transformGestureStart_;target.x+=dx;target.y+=dy;if(target.quad)for(auto& point:*target.quad){point.x+=dx;point.y+=dy;}if(selectionPivot_)selectionPivot_=TransformPoint{selectionPivotStart_.x+dx,selectionPivotStart_.y+dy};if(target.flipOriginX)*target.flipOriginX+=dx;if(target.flipOriginY)*target.flipOriginY+=dy;document.transformFloatingPaste(target,selectionRotSprite_);}else if(selectionBoxDragging_){int dx=p.x-selectionStart_.x,dy=p.y-selectionStart_.y;const bool symmetric=document.layer().kind!="tilemap"&&symmetryHas(document.symmetryAxes);if(symmetric){const auto mapped=symmetrySelectionDragDelta(*selectionBefore_,{selectionStart_.x,selectionStart_.y},{dx,dy},document.width(),document.height(),document.symmetryAxes,document.symmetryCenter());dx=mapped.x;dy=mapped.y;}const auto distance=gridSnapMove(constrainedSelectionDelta({dx,dy},mouse->shiftPressed()||tabletAssist_.modifier(document.identity(),0)),{double(selectionBefore_->x),double(selectionBefore_->y),double(selectionBefore_->width),double(selectionBefore_->height)});dx=distance.x;dy=distance.y;auto moved=selectionBefore_;if(symmetric)moved=translateSymmetrySelection(*selectionBefore_,{selectionStart_.x,selectionStart_.y},{dx,dy},document.width(),document.height(),document.symmetryAxes,document.symmetryCenter(),false);else{moved->x+=dx;moved->y+=dy;}document.previewSelection(std::move(moved));}else updateSelectionCreation(p,tabletAssist_.modifier(document.identity(),0)||(mouse->shiftPressed() && !(selectionBefore_ && gestureSelectionMode_==1)),tabletAssist_.modifier(document.identity(),1)||mouse->ctrlPressed() || mouse->cmdPressed(),tabletAssist_.modifier(document.identity(),2)||mouse->altPressed());invalidateRect(canvasViewport());return true;}

      if((selectionDragging_ || floatingDragging_) && msg->type()==ui::kMouseUpMessage){if(polygonPending_){if(hasCapture())releaseMouse();return true;}if(selectionDragging_ && !selectionBoxDragging_ && selectionKind_==4){wandReleased_=true;if(hasCapture())releaseMouse();if(wandPreviewReady_)endSelectionGesture(false);else wandTick();return true;}endSelectionGesture(false);return true;}

      if(msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && !spaceHeld_ && !handTool_ && canvasViewport().contains(mouse->position()) && (selectionTool_ || document.floating())){

        const bool freeSelection=document.activeMaskId().empty()&&document.layer().kind=="free-tile";
        const auto freeSelectionBounds=freeSelection?freeTileSelectionTargetBounds(document):std::optional<PixelRegion>{};
        if(freeSelection&&!freeSelectionBounds){status_=U"请在编辑模式选择可见且未锁定的自由瓦片实例";refresh();return true;}
        if(freeSelection&&selectionKind_==4&&(p.x<freeSelectionBounds->x||p.y<freeSelectionBounds->y||p.x>=freeSelectionBounds->x+freeSelectionBounds->w||p.y>=freeSelectionBounds->y+freeSelectionBounds->h))return true;

        if(polygonPending_){if(mouse->right())polygonStep(false);else{if(selectionPath_.empty() || selectionPath_.back().x!=p.x || selectionPath_.back().y!=p.y){selectionPath_.push_back({p.x,p.y});selectionPathRedo_.clear();}updateSelectionCreation(p);}return true;}

        bool quickPress=false;

        if(selectionTool_&&!selectionFreeTransform_&&selectionKind_==0&&mouse->left()){const auto now=std::chrono::steady_clock::now();const auto at=mouse->position();const QuickSelectionPress press{double(at.x)/uiScale,double(at.y)/uiScale,0,std::chrono::duration<double,std::milli>(now.time_since_epoch()).count()};quickPress=!eyedropperHeld_&&isQuickSelectionSecondPress(quickSelectionPress_,press,quickSelectionExplicitDouble_?2:1);quickSelectionPress_=quickPress?std::nullopt:std::optional<QuickSelectionPress>{press};}

        if(quickPress){const auto cell=quickSelectionCellAt(p);if(cell){document.commitFloatingPaste();quickSelection_=true;quickSelectionCell_=*cell;}else quickPress=false;}

        if(!quickPress && mouse->left() && !mouse->shiftPressed() && !mouse->ctrlPressed() && !mouse->cmdPressed() && !mouse->altPressed() && selectionPivotHit(mouse->position())){selectionPivotDragging_=true;selectionPivotStart_=selectionPivotPoint();selectionPivotPointerStart_=transformCanvasPoint(mouse->position());captureMouse();return true;}

        gridMoveEnabled_=runtimePreferences_.flag("tools.gridAlignmentEnabled");

        hideTimelineSelectionGuides();paletteFocused_=false;requestFocus();const bool copy=mouse->ctrlPressed() || mouse->cmdPressed();int hit=mouse->left() && (selectionFreeTransform_ || !mouse->shiftPressed()) && !quickPress?selectionHit(mouse->position()):0;if(hit==2 && !copy && selectionMode_>=2 && !selectionFreeTransform_)hit=0;if(hit && !selectionFreeTransform_ && tabletAssist_.owner==document.identity() && tabletAssist_.explicitMove)hit=tabletAssist_.boxMove?1:2;

        const auto handle=mouse->left() && (selectionFreeTransform_ || !mouse->shiftPressed()) && !quickPress?transformHit(mouse->position()):std::string{};if(selectionFreeTransform_ && !(mouse->left() && (hit==2 || !handle.empty())))return true;if(document.selection() && (hit || !handle.empty()))selectionPropertiesActive_=true;

        // Source content transforms need their own shared-source transaction.
        // Do not let the ordinary raster path consume the derived free-tile cache.
        beginAlignmentMove(hit==2 || (copy && hit==1) || !handle.empty());
        if(!handle.empty()){if(document.layer().kind=="tilemap"&&document.tilemapMode()==tiles::Mode::Paint){status_=U"瓦片绘制模式的变换尚未迁移";refresh();return true;}if(!document.beginSelectionContentMove(copy,frameSelectionExplicit_,0,0,p,false,!selectionFreeTransform_&&handle.rfind("rotate-",0)!=0&&handle.rfind("shear-",0)!=0,!selectionFreeTransform_&&handle.rfind("rotate-",0)==0,!selectionFreeTransform_&&handle.rfind("shear-",0)==0)){status_=U"目标图层隐藏或锁定";refresh();return true;}floatingDragging_=true;transformHandle_=handle;transformGestureStart_=*document.floatingTransform();transformPointerStart_=transformCanvasPoint(mouse->position());selectionPivotBeforeGesture_=selectionPivot_;selectionPivotStart_=selectionPivotPoint();selectionMoved_=false;selectionStart_=p;selectionPress_=mouse->position();playing_=false;captureMouse();invalidateRect(canvasViewport());return true;}

        if(hit==2 || (copy && hit==1)){const bool paintCells=document.layer().kind=="tilemap"&&document.tilemapMode()==tiles::Mode::Paint;if(paintCells&&(selectionFreeTransform_||frameSelectionExplicit_)){status_=U"瓦片绘制模式的多目标或自由变换尚未迁移";refresh();return true;}selectionCopyDrag_=copy && !document.floating();if(!(paintCells?document.beginPaintCellMove(copy):document.beginSelectionContentMove(copy,frameSelectionExplicit_,0,0,p,true))){status_=U"目标图层隐藏或锁定";refresh();return true;}floatingDragging_=true;if(document.paintCellMoving()){const auto& selected=*document.selection();transformGestureStart_={double(selected.x),double(selected.y),double(selected.width),double(selected.height)};}else transformGestureStart_=*document.floatingTransform();selectionPivotBeforeGesture_=selectionPivot_;selectionPivotStart_=selectionPivotPoint();floatingStart_={int(std::floor(transformGestureStart_.x)),int(std::floor(transformGestureStart_.y))};playing_=false;}

        else if(hit==1){document.prepareSelectionBoxMove();selectionBefore_=document.selection();selectionDragging_=selectionBoxDragging_=true;}

        else{selectionPropertiesActive_=false;document.commitFloatingPaste();selectionBefore_=document.selection();selectionStatusBefore_=status_;selectionPreview_.reset();gestureSelectionMode_=mouse->right()?2:mouse->shiftPressed()?1:selectionMode_;selectionDragging_=true;selectionBoxDragging_=false;polygonPending_=selectionKind_==3;selectionPath_={{p.x,p.y}};selectionPathRedo_.clear();if(selectionKind_==5){selectionBrushStroke_={};selectionBrushLast_={p.x,p.y};selectionBrushIdentity_=document.identity();}if(selectionKind_==4){++wandGeneration_;wandReleased_=false;wandPreviewReady_=false;wandLastPoint_.reset();wandIdentity_=document.identity();wandContentRevision_=document.contentRevision();wandLayer_=document.layer().id;wandFrame_=document.frame().id;wandSource_=std::make_shared<const std::vector<Pixel>>(freeSelection?std::vector<Pixel>{}:wandOptions_.visibleLayers?compositeNormalRegion(document.timeline(),document.frame().id,{0,0,document.width(),document.height()}):document.canvasPixels());}}

        selectionMoved_=false;selectionStart_=selectionLast_=p;selectionPress_=mouse->position();

        marqueeDrawingAnchor_.reset();if(selectionDragging_&&!selectionBoxDragging_&&!quickSelection_&&selectionKind_<=1)marqueeViewAngle_=shapeViewAlignedAngle(viewRotation_.degrees,viewRotation_.mirrorX,viewRotation_.mirrorY);if(selectionDragging_&&!selectionBoxDragging_&&!quickSelection_&&drawingAnchorActive()){marqueeDrawingAnchor_=drawingAnchorPoint();anchoredMarqueeGeometry_={};anchoredMarqueeGeometry_.viewAngle=marqueeViewAngle_;anchoredMarqueeSpec_={};anchoredMarqueeSpec_.start={marqueeDrawingAnchor_->x-.5,marqueeDrawingAnchor_->y-.5};}if(selectionDragging_ && !selectionBoxDragging_)updateSelectionCreation(p);captureMouse();return true;

      }

      if(processFreeTileInput(msg))return true;
      if(processSmoothInput(msg))return true;
      if(processAirbrushInput(msg))return true;
      const bool freeTileSourceEdit=ordinaryBrushTool()&&document.layer().kind=="free-tile"&&!document.freeTilePaintMode()&&document.activeMaskId().empty()&&document.layer().freeTiles&&!document.layer().freeTiles->sources.empty();
      if(msg->type()==ui::kMouseDownMessage && !document.active() && (mouse->left() || mouse->right()) && !spaceHeld_ && !handTool_ && canvasViewport().contains(mouse->position()) && canvasDocumentContains(mouse->position()) && (document.rasterToolsAvailable()||freeTileSourceEdit)) {

        hideTimelineSelectionGuides();paletteFocused_=false;const bool hadSelection=!document.palette().selected.empty();document.clearPaletteSelection();requestFocus(); captureMouse(); strokeButton_=mouse->button();

        const auto revision=document.contentRevision();const bool wasDirty=document.dirty();

        recentDrag_.reset();strokeColor_=mouse->right()?document.palette().secondary:eraser_?0:ink_;

        playing_=false;resolvePencilImageBrush();const auto anchor=mouse->left() && mouse->shiftPressed() && ordinaryBrushTool()?brushLineAnchor():nullptr;

        Point target=p;if(anchor && (mouse->ctrlPressed() || mouse->cmdPressed())){const auto end=constrainShapeLine({double(anchor->point.x),double(anchor->point.y)},{double(p.x),double(p.y)},runtimePreferences_.index("tools.lineDirectionStep.Number"));target={int(end.x),int(end.y)};}

        target=anchor?gridSnapPoint(target):gridSnapBrush(target);const auto lineStart=anchor?gridSnapPoint(anchor->point):target;

        if(anchor&&document.layer().kind=="free-tile"){
          const auto b=activeStrokeBrush();const auto v=resolveDynamics(true);const auto started=usage::now();
          try{Document::HistoryLabelScope historyLabel(document,eraser_?U"橡皮擦连线":U"笔刷连线");
            const bool changed=document.paintFreeTileSourceLine(lineStart,target,eraser_?0:ink_,b,pencilImageBrush_?&*pencilImageBrush_:nullptr,pencilImageBrushAngle_,BrushPathPoint{target.x,target.y,v.size,dynamics::rounded(b.opacity*v.opacity),dynamics::wrapAngle(pencilImageBrushAngle_+v.angle),eraser_?std::nullopt:v.gradient},document.palette().secondary,brushDynamics_.gradientDither,runtimePreferences_.flag("tools.balancedShiftLineEnabled"));
            if(changed)usageStatistics_.recordDrawing(true,std::max<usage::Milliseconds>(1,usage::now()-started));
            brushFeedback_.brushLineAnchors_[eraser_?1:0]=BrushLineAnchor{target,document.identity(),document.revision(),document.layer().id,document.frame().id,{},false};
          }catch(...){if(hasCapture())releaseMouse();throw;}
          if(hasCapture())releaseMouse();usageStrokeStarted_=0;syncTilesetPanel();refresh();return true;
        }

        usageStrokeStarted_=usage::now();beginDynamicBrush(mouse,lineStart,brushLineBaseline(anchor));
        if(document.layer().kind=="free-tile"&&!document.strokeActive()){if(hasCapture())releaseMouse();usageStrokeStarted_=0;refresh();return true;}

        if(anchor){

          updateDynamicBrush(mouse,target);auto baseline=document.strokeBaseline();const bool merge=anchor->mergeWithNext && anchor->revision==document.revision();

          if(([&]{Document::HistoryLabelScope historyLabel(document,eraser_?U"橡皮擦":U"绘制");return document.commitStroke();})()){usageStatistics_.recordDrawing(true,std::max<usage::Milliseconds>(1,usage::now()-usageStrokeStarted_));if(merge)document.mergeLastStrokeEdits();brushFeedback_.brushLineAnchors_[eraser_?1:0]=BrushLineAnchor{target,document.identity(),document.revision(),document.layer().id,document.frame().id,std::move(baseline),false};}

          usageStrokeStarted_=usage::now();beginDynamicBrush(mouse,target,nullptr,false);

        }brushFeedback_.brushStrokeLast_=target;brushFeedback_.brushStrokePointer_=mouse->position();invalidateStrokePixels(revision);

        if(hadSelection) invalidateRect(paletteContentBounds());

        if(wasDirty!=document.dirty()) {layoutDocumentTab();const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);invalidateRect(uiPhysical(gfx::Rect(rc.x+Layout::edge,rc.y+Layout::documentY,rc.w-2*Layout::edge,Layout::projectTabHeight+Layout::frame)));}

        return true;

      }

      if(document.active() && msg->type()==ui::kMouseMoveMessage) {const auto revision=document.contentRevision();updateDynamicBrush(mouse,gridSnapBrush(p));brushFeedback_.brushStrokeLast_=gridSnapBrush(p);brushFeedback_.brushStrokePointer_=mouse->position();invalidateStrokePixels(revision);return true;}

      if(document.active() && msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_) {const auto revision=document.contentRevision();if(mouse->position()!=brushFeedback_.brushStrokePointer_){updateDynamicBrush(mouse,gridSnapBrush(p));brushFeedback_.brushStrokeLast_=gridSnapBrush(p);}

        auto baseline=document.strokeBaselinePoints();invalidateStrokePixels(revision);const bool changed=([&]{Document::HistoryLabelScope historyLabel(document,eraser_?U"橡皮擦":U"绘制");return document.commitStroke();})();

        if(changed)usageStatistics_.recordDrawing(true,std::max<usage::Milliseconds>(1,usage::now()-usageStrokeStarted_));usageStrokeStarted_=0;

        if(ordinaryBrushTool() && (changed || !brushLineAnchor()))brushFeedback_.brushLineAnchors_[eraser_?1:0]=BrushLineAnchor{brushFeedback_.brushStrokeLast_,document.identity(),document.revision(),document.layer().id,document.frame().id,{},true,std::move(baseline)};

        releaseMouse();layoutCanvasScrollBars();

        if(changed){layoutLayers();invalidateTimelineGrid();}
        if(document.layer().kind=="free-tile")syncTilesetPanel();

        commands_[3]->setEnabled(document.canUndo());commands_[4]->setEnabled(document.canRedo());

        if(previewPanel_ && previewPanel_->isVisible())previewPanel_->invalidate();

        layoutDocumentTab();invalidateRect(toDisplay(gfx::Rect(0,Layout::documentY,uiLogical(clientBounds()).w,Layout::projectTabHeight+Layout::frame)));

        const auto damage=brushPreviewDamage(paletteMousePosition_);if(!damage.isEmpty())invalidateRect(damage);

        return true;}

    }

    return ui::Widget::onProcessMessage(msg);

  }

}
