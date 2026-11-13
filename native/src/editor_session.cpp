#include "editor.h"
#include "selection_pattern_brush.h"
#include "recovery_store.h"
#include "project_import.h"
#include "project_file.h"
#include "webp_export.h"
#include "new_document_dialog.h"
#include <winrt/Windows.Data.Json.h>
#include "recovery_commit.h"
#include "image_sequence_dialog.h"
#include "aseprite_save_policy.h"
#include "aseprite_io.h"
#include "psd_import.h"
#include "psd_export.h"
#include "preview_panel.h"
#include "ui_frame_capture.h"
#include "free_tile_instances_panel.h"
#include "extension_install_dialog.h"
#include "lua_script_service.h"
#include "image_save.h"
#include "document_save_policy.h"
#include "save_decision.h"
#include "captured_save.h"
#include "image_file_signature.h"
#include "save_format_dialog.h"
#include "timelapse_session.h"
#include "project_restore_report.h"
#include "runtime_diagnostics.h"
#include <utility>

namespace moon::editor {
namespace {
// Observe settled selection state only; this helper never mutates Document.
template<class View> void projectOrdinarySelectionPivot(View& view,const Document& source){
 const bool transient=source.floating()||source.paintCellMoving()||source.layerMoveActive();
 if(view.pivotIdentity!=source.identity()||(!transient&&view.pivotObservedRevision!=source.selectionRevision()&&!selectionEqual(view.pivotMask,source.selection()))){view.pivot.reset();view.pivotIdentity=source.identity();view.pivotMask=source.selection();}
 if(!transient)view.pivotObservedRevision=source.selectionRevision();
}
template<class Windows,class Sessions>
void releaseProjectReferenceViews(std::uint64_t identity,Windows& windows,Sessions& sessions){
 for(auto& entry:windows)if(entry.identity==identity){entry.window->panel().releaseDisplayCaches();entry.window->closeWindow(nullptr);}
 windows.erase(std::remove_if(windows.begin(),windows.end(),[identity](const auto& entry){return entry.identity==identity;}),windows.end());
 sessions.erase(identity);
}
std::u32string timelapseRestoreWarning(const project::TimelapseRestoreReport& report){
 std::string reasons;for(const auto& reason:report.dropReasons){if(!reasons.empty())reasons+=",";reasons+=reason;}
 diagnostics::recordGlobal("error","project.timelapse.restore",{{"declaredFrames",std::int64_t(report.droppedTimelapseFrames+report.timelapseFrames)},{"droppedFrames",std::int64_t(report.droppedTimelapseFrames)},{"restoredFrames",std::int64_t(report.timelapseFrames)},{"reasons",reasons}});
 return U"该工程的缩时记录有 "+unicodeText(std::to_string(report.droppedTimelapseFrames))+U" 帧无法恢复，已保留 "+unicodeText(std::to_string(report.timelapseFrames))+U" 帧。";
}
}


void Editor::bindProjectDocument(std::shared_ptr<Document> value){
 if(!value)throw std::logic_error("Missing session document");
 // Keep the old owner alive until all persistent active-document views detach.
 const auto previous=activeDocument_;activeDocument_=std::move(value);activeSession_->value=activeDocument_;
 // Bind display policy before a gesture can start, independently of refresh/paint.
 auto& view=currentView();
 if(view.displayIdentity!=currentDocument().identity()){
  view.relativeLuminance=false;view.showSelectionOutline=true;view.isoViewEnabled=false;view.displayIdentity=currentDocument().identity();
 }
 auto& playback=currentPlayback();
 if(playback.modeIdentity!=currentDocument().identity()){
  playback={};playback.rate=savedPlaybackRate_;playback.returnToStart=savedPlaybackReturnToStart_;
  workspace::initializePlaybackMode(playback,currentDocument(),savedPlaybackMode_);
 }else if(previous!=activeDocument_ && playback.playing){
  // The native UI timer drives only the active document. Do not catch up time
  // spent in another tab; keep its loop stack and playhead exactly as paused.
  playback.due=std::chrono::steady_clock::now()+playbackFrameDelay();
 }
 bindSessionAnimationObservation();bindTimelineSelection();
 setRelativeLuminance(view.relativeLuminance);
 if(!view.showSelectionOutline)antsTimer_.stop();
 if(previewPanel_)previewPanel_->bindDocument(*activeDocument_);
 if(referencePanel_)referencePanel_->bindDocument(*activeDocument_);
 if(freeTileInstancesPanel_)freeTileInstancesPanel_->bindDocument(*activeDocument_);
 if(tilesetPanel_)tilesetPanel_->bindDocument(*activeDocument_);
}
void Editor::projectMaskSelectionHistory(ProjectViewState& view,const Document& document){
 if(view.maskIdentity!=document.identity())return;
 const auto& history=document.maskSelectionHistory();
 if(view.maskSerial==history.serial)return;
 view.maskSerial=history.serial;view.maskSlots=history.slots;
 view.maskAnchor=history.anchor?*history.anchor:(view.maskSlots.empty()?std::nullopt:std::optional<Document::MaskSlotKey>(view.maskSlots.back()));
}
void Editor::projectSelectionPivotHistory(ProjectViewState& view,const Document& document){
 if(view.pivotHistoryIdentity!=document.identity())return;
 const auto& history=document.selectionPivotHistory();
 if(view.pivotHistorySerial==history.serial)return;
 view.pivotHistorySerial=history.serial;view.pivot=history.pivot;
 view.pivotMask=document.selection();view.pivotIdentity=document.identity();
}
void Editor::bindTimelineSelection(){
 auto& view=currentView();
 if(view.maskIdentity!=currentDocument().identity()){
  view.maskSlots.clear();view.maskAnchor.reset();
  view.virtualSlots.clear();view.virtualAnchor.reset();
  view.recent={};recentDrag_.reset();
  view.maskIdentity=currentDocument().identity();
  view.maskSerial=currentDocument().maskSelectionHistory().serial;
 }
 projectMaskSelectionHistory(view,currentDocument());
 if(view.pivotHistoryIdentity!=currentDocument().identity()){
  view.freeTransform=false;
  view.pivotHistoryIdentity=currentDocument().identity();view.pivotHistorySerial=0;
  view.pivot.reset();view.pivotMask=currentDocument().selection();
  view.pivotIdentity=currentDocument().identity();view.pivotObservedRevision=0;
 }
 projectSelectionPivotHistory(view,currentDocument());
 projectOrdinarySelectionPivot(view,currentDocument());
 if(!currentDocument().floating())view.freeTransform=false;
}
void Editor::bindSessionAnimationObservation(){
 if(currentPlayback().modeIdentity!=currentDocument().identity())
  workspace::initializePlaybackMode(currentPlayback(),currentDocument(),savedPlaybackMode_);
 workspace::observePlaybackChange(currentPlayback(),currentDocument(),{AnimationChange::Kind::LoopChanged});
 currentDocument().setAnimationSelectionAccess({
  [owner=std::weak_ptr<ProjectSession>(activeSession_)](const Document& source)->std::optional<AnimationSessionSelection>{
   const auto session=owner.lock();if(!session||session->value.get()!=&source||session->view.maskIdentity!=source.identity())return {};
   const auto& view=session->view;AnimationSessionSelection value{view.maskSlots,view.maskAnchor,view.virtualSlots,view.virtualAnchor,view.frameSelection};
   const auto& journal=source.maskSelectionHistory();if(view.maskSerial!=journal.serial){value.masks=journal.slots;value.maskAnchor=journal.anchor?*journal.anchor:(value.masks.empty()?std::nullopt:std::optional<Document::MaskSlotKey>(value.masks.back()));}
   return value;
  },
  [owner=std::weak_ptr<ProjectSession>(activeSession_)](const Document& source,AnimationSessionSelection value){
   const auto session=owner.lock();if(!session||session->value.get()!=&source||session->view.maskIdentity!=source.identity())return;
   auto& view=session->view;view.maskSlots.swap(value.masks);view.maskAnchor.swap(value.maskAnchor);view.virtualSlots.swap(value.groups);view.virtualAnchor.swap(value.groupAnchor);view.frameSelection=value.frameSelection;
   // A complete selection history snapshot supersedes the narrower mask
   // journal for this replay; the final observer must not overwrite it again.
   view.maskSerial=source.maskSelectionHistory().serial;
  }
 });
 currentDocument().setAnimationChangeListener([owner=std::weak_ptr<ProjectSession>(activeSession_)](const Document& source,const AnimationChange& change){
  if(auto session=owner.lock();session&&session->value.get()==&source){
   // Script adapters can temporarily detach floating content while publishing
   // ordinary history pushes. Only completed operations describe final state.
   const bool finalFloating=change.kind==AnimationChange::Kind::FloatingSettled ||change.kind==AnimationChange::Kind::SelectionPreviewChanged ||
    (change.kind==AnimationChange::Kind::HistoryChanged &&
     (change.historyKind==HistoryStackChange::Kind::Undo||change.historyKind==HistoryStackChange::Kind::Redo));
   if(finalFloating&&!change.selectionProjectionDeferred&&!source.floating())session->view.freeTransform=false;
   workspace::observePlaybackChange(session->playback,source,change);
   projectMaskSelectionHistory(session->view,source);
   if(!change.selectionProjectionDeferred)projectSelectionPivotHistory(session->view,source);
   if(!change.selectionProjectionDeferred&&
      (change.kind==AnimationChange::Kind::SelectionPreviewChanged||finalFloating||
       (change.kind==AnimationChange::Kind::HistoryChanged&&change.historyKind==HistoryStackChange::Kind::Push)))projectOrdinarySelectionPivot(session->view,source);
  }
 });
}
void Editor::replaceDocumentForSmoke(Document&& next){
 // Preserve stable addresses and the existing heap allocation of large fixtures.
 currentDocument()=std::move(next);bindSessionAnimationObservation();bindTimelineSelection();
}
void Editor::replaceDocumentForSmoke(const Document& next){
 currentDocument()=next;bindSessionAnimationObservation();bindTimelineSelection();
}
void Editor::ensureProjects(){if(documentOpen_ && projects_.empty()){
 activeSession_->value=activeDocument_;projects_.push_back(activeSession_);activeProject_=0;
}}

const Document& Editor::projectDocument(std::size_t index)const{return *projects_.at(index)->value;}
Document& Editor::projectDocument(std::size_t index){return const_cast<Document&>(std::as_const(*this).projectDocument(index));}
std::filesystem::path& Editor::projectPath(std::size_t index){return projects_.at(index)->path;}
RecoverySession& Editor::projectRecovery(std::size_t index){return projects_.at(index)->recovery;}
std::optional<Editor::ResolvedSession> Editor::resolveSession(std::uint64_t identity){
 ensureProjects();const auto index=saveProjectIndex(identity);if(!index)return {};
 return ResolvedSession{*index,projectDocument(*index),projectPath(*index),projectRecovery(*index)};
}


int Editor::projectWidth(const Document& value)const{return std::min(180,font_.inkBounds(value.name()).w+2*Layout::inset+11+uiGap+(value.dirty()?3+uiGap:0));}

int Editor::documentTabWidth(const Layout&)const{return projectWidth(currentDocument());}

void Editor::settleProjectGesture(){

    const bool resumePlayback=currentPlayback().playing;
    const auto playbackDocument=currentDocument().identity(),playbackRevision=currentDocument().revision();

    for(auto& picker:pickerColumns_)if(picker.picker)picker.picker->finishInteraction();

    if(timelineGesture_.kind)finishTimelineGesture(true);

    finishAutoLinkGesture();finishVisibilityGesture();finishLockGesture();

    if(selectionDragging_ || floatingDragging_)endSelectionGesture(true);

    if(drawingAnchorDragging_){currentView().drawingAnchor=drawingAnchorDragBefore_;drawingAnchorDragging_=false;if(hasCapture())releaseMouse();}
    auto capture=currentTools().temporaryBrushCapture;currentTools().temporaryBrushCapture.reset();
    currentDocument().cancelFilterPreview();currentDocument().cancelGradient();currentDocument().commitFloatingPaste();cancelStroke();wand_.cancel();
    currentTools().temporaryBrushCapture=capture;
    // Legacy setActive settles transactions without pausing a valid session.
    // cancelStroke is also used by edit commands and normally stops playback.
    // Restore only an unchanged document; committing a floating edit must keep
    // the existing revision stop guard rather than revive stale playback.
    if(resumePlayback&&currentDocument().identity()==playbackDocument&&currentDocument().revision()==playbackRevision)currentPlayback().playing=true;

    heldCelNavigation_.clear();spaceHeld_=false;

  }

void Editor::storeActiveProject(){

    saveLayerPanelState();saveDocumentView();


  }

void Editor::restoreProject(std::size_t index){

    activeProject_=index;activeSession_=projects_.at(index);auto& slot=*activeSession_;bindProjectDocument(slot.value);applyDocumentPreferences(currentDocument());
    if(!currentTools().temporaryBrushCapture&&!currentTools().temporaryBrushActive)remapSelectionPatternBrush(currentTools().pencilImageBrush,currentDocument().palette().primary,currentDocument().palette().secondary);

    bindTileRepeat(slot.view.tileRepeat);

    timelineSelectionIdentity_=currentDocument().identity();timelineLastActiveFrame_=currentDocument().frame().id;


    symmetryIdentity_=currentDocument().identity();ink_=currentDocument().palette().primary;paletteFocused_=false;

    documentOpen_=true;homeOpen_=false;revealProjectTab_=true;constrainCanvas();refresh();

  }

void Editor::activateProject(std::size_t index){

    if(scriptSaving_||pending_!=Pending::None || index>=projects_.size())return;

    if(colorEditorPopup_&&colorEditorPopup_->isVisible())colorEditorPopup_->closeWindow(nullptr);

    if(index==activeProject_){showHome(false);return;}

    settleProjectGesture();storeActiveProject();restoreProject(index);requestFocus();

  }

void Editor::showAbout(){
    if(pending_!=Pending::None)return;
    if(!aboutGeometryLoaded_){aboutGeometryLoaded_=true;if(!smoke_)try{const auto path=palettePreferencePath().parent_path()/"about-v2-layout.txt";if(std::filesystem::exists(path)){std::ifstream in(path);int x,y,w,h;if(!(in>>x>>y>>w>>h)||w<1||h<1||w>32768||h>32768)throw std::runtime_error("Invalid About geometry");aboutDialogGeometry_={x,y,w,h};}}catch(const std::exception& e){aboutGeometryReadable_=false;status_=U"关于窗口布局读取失败："+unicodeText(e.what());}}
    AboutDialog popup(font_,skin_,toolIcons_,homeLogo_,[this]{try{aboutRepositoryLauncher_();}catch(const std::exception& error){status_=unicodeText(error.what());invalidate();}catch(...){status_=U"无法打开链接。";invalidate();}});
    struct AboutFocusScope {AboutDialog*& slot;AboutFocusScope(AboutDialog*& value,AboutDialog* popup):slot(value){slot=popup;}~AboutFocusScope(){slot=nullptr;}} focusScope(aboutDialogForFocus_,&popup);
    popup.setDisplay(display(),false);auto geometry=aboutDialogGeometry_;
    if(geometry.isEmpty()){const int w=std::max(280*uiScale,popup.minimumDialogSize(280*uiScale).w);const int h=popup.minimumDialogSize(w).h;geometry={bounds().center().x-w/2,bounds().center().y-h/2,w,h};}
    const auto floor=popup.minimumDialogSize(geometry.w);geometry.w=std::max(geometry.w,floor.w);geometry.h=std::max(geometry.h,floor.h);
    geometry.x=std::clamp(geometry.x,bounds().x,std::max(bounds().x,bounds().x2()-geometry.w));geometry.y=std::clamp(geometry.y,bounds().y,std::max(bounds().y,bounds().y2()-geometry.h));popup.setBounds(geometry);
    ui::Timer check(40,&popup);if(smoke_&&aboutDialogCheckForSmoke_){check.Tick.connect([&]{check.stop();aboutDialogCheckForSmoke_(popup);});check.start();}
    popup.openWindowInForeground();aboutDialogGeometry_=popup.bounds();
    if(!smoke_&&aboutGeometryReadable_)try{auto path=palettePreferencePath().parent_path()/"about-v2-layout.txt";std::ofstream out(path);out.exceptions(std::ios::failbit|std::ios::badbit);const auto r=aboutDialogGeometry_;out<<r.x<<' '<<r.y<<' '<<r.w<<' '<<r.h<<'\n';}catch(const std::exception& e){status_=U"关于窗口布局保存失败："+unicodeText(e.what());}
    requestFocus();refresh();
  }

bool Editor::pasteAsNewDocument(){
    if(pending_!=Pending::None)return false;
    try{
      const auto payload=smoke_&&newDocumentClipboardReaderForSmoke_?newDocumentClipboardReaderForSmoke_():pixelClipboard_.readForNewDocument();
      if(!payload){status_=U"剪贴板中没有可粘贴的图片。";refresh();return false;}
      auto candidate=Document::fromClipboardRaster(*payload);
      addProject(std::move(candidate));status_=U"已将剪贴板图片粘贴为新项目。";refresh();return true;
    }catch(const std::exception& error){status_=U"粘贴为新项目失败："+unicodeText(error.what());refresh();return false;}
  }

void Editor::addProject(Document next,std::filesystem::path path){

    if(colorEditorPopup_&&colorEditorPopup_->isVisible())colorEditorPopup_->closeWindow(nullptr);

    ensureProjects();settleProjectGesture();if(documentOpen_)storeActiveProject();

    projects_.push_back(std::make_shared<ProjectSession>());activeProject_=projects_.size()-1;activeSession_=projects_.back();

    currentView().drawingAnchor=drawingAnchorDefaults_;currentView().drawingAnchorVisible=drawingAnchorDefaultVisible_;currentView().drawFromCanvasCenter=drawingAnchorDefaultEnabled_;bindProjectDocument(std::make_shared<Document>(std::move(next)));if(colorRolesReady_){currentDocument().setPaletteRole(sharedPrimary_,false,true);currentDocument().setPaletteRole(sharedSecondary_,true,true);}applyDocumentPreferences(currentDocument(),true);currentPath()=std::move(path);documentOpen_=true;homeOpen_=false;closingWorkspace_=false;
    // createSession starts at pencil; switching an existing tab restores its
    // own tool instead of inheriting the previously active document's flags.
    currentTools().selectionTool=currentTools().shapeTool=currentTools().eyedropperTool=currentTools().zoomTool=currentTools().gradientTool=currentTools().fillTool=currentTools().handTool=currentTools().eraser=currentTools().moveTool=currentTools().textTool=currentTools().rotateTool=currentTools().smoothTool=currentTools().airbrushTool=currentTools().liquifyTool=currentTools().magicEraserTool=currentTools().sliceMode=false;
    loadSessionToolPreferences(true);

    currentView().layers=currentView().frames=currentView().layerRemainder=currentView().frameRemainder=currentView().paletteScroll=0;

    currentView().frameSelection=false;currentView().guides=true;ink_=currentDocument().palette().primary;

    currentRecovery().queue.setIntervalMinutes(recoveryPreferences_.minutes);revealProjectTab_=true;bindTileRepeat(repeat::Mode::Off);currentView().rotation={};fitCanvas();loadDocumentView();loadLayerPanelState();refresh();

  }

void Editor::layoutDocumentTab() {
    struct AdvancedVisibility{Editor& e;~AdvancedVisibility(){e.applyAdvancedVisibility();}} advancedVisibility{*this};

    if(!documentTabNew_)return;ensureProjects();

    const auto rc=uiLogical(bounds());const int available=std::max(1,rc.w-17);int total=0;

    for(std::size_t i=0;i<projects_.size();++i){const int w=projectWidth(projectDocument(i));if(i==activeProject_ && revealProjectTab_){if(total<projectTabScroll_)projectTabScroll_=total;else if(total+w>projectTabScroll_+available)projectTabScroll_=total+w-available;}total+=w-1;}

    revealProjectTab_=false;projectTabScroll_=std::clamp(projectTabScroll_,0,std::max(0,total-available));

    while(projectCloseButtons_.size()<projects_.size()){

      const auto index=projectCloseButtons_.size();auto close=index==0?documentTabClose_:button(U"",[this,index]{activateProject(index);ask(Pending::CloseDocument);});

      close->iconSkin=&toolIcons_;close->icon="close";close->bareTabIcon=true;projectCloseButtons_.push_back(close);

    }

    projectTabRects_.clear();int x=rc.x-projectTabScroll_;

    for(std::size_t i=0;i<projects_.size();++i){const int w=projectWidth(projectDocument(i));const gfx::Rect tab(x,rc.y+Layout::documentY,w,Layout::projectTabHeight);projectTabRects_.push_back(uiPhysical(tab));auto close=projectCloseButtons_[i];close->setBounds(uiPhysical(gfx::Rect(tab.x2()-Layout::inset-11,tab.y+2,11,11)));close->setVisible(tab.x>=rc.x && tab.x2()<=rc.x+available);close->setEnabled(pending_==Pending::None);x+=w-1;}

    for(std::size_t i=projects_.size();i<projectCloseButtons_.size();++i)projectCloseButtons_[i]->setVisible(false);

    documentTabNew_->setBounds(uiPhysical(gfx::Rect(std::min(rc.x+available,x),rc.y+Layout::documentY,17,Layout::projectTabHeight)));documentTabNew_->setEnabled(pending_==Pending::None);documentTabNew_->setVisible(true);

  }

void Editor::closeDocumentTab() {

    ensureProjects();if(!documentOpen_)return;

    // Complete only this session's recovery before removing its owned record.

    try{if(currentRecovery().worker.valid())currentRecovery().worker.get();if(currentRecovery().originId.empty()&&!currentRecovery().ownedId.empty())project::removeOwnedRecovery(recoveryDirectory(),currentRecovery().ownedId);}catch(const std::exception& e){closingWorkspace_=false;showSaveError(e);return;}

    currentRecovery().snapshot.reset();currentRecovery().ticket.reset();currentRecovery().cleanup.reset();currentRecovery().cleanupError.reset();currentRecovery().queue=recovery::Scheduler(recoveryPreferences_.minutes);currentRecovery().ownedId.clear();currentRecovery().originId.clear();currentRecovery().suppressed=false;currentRecovery().ownedIdentity=currentRecovery().identity=0;

    releaseProjectReferenceViews(currentDocument().identity(),referenceWindows_,referenceSessions_);
    projects_.erase(projects_.begin()+activeProject_);

    if(!projects_.empty()){restoreProject(projects_.size()-1);}

    else{closedControlStates_.clear();for(auto child:children())closedControlStates_.push_back({child,child->isEnabled()});activeSession_=std::make_shared<ProjectSession>();bindProjectDocument(std::make_shared<Document>(Document::withBuiltinPalette()));currentPath().clear();documentOpen_=false;showHome(true);layoutDocumentTab();}

  }

bool Editor::processProjectTabs(ui::Message* msg){

    if(pending_!=Pending::None)return false;

    if(projectTabDragging_){

      if(!hasCapture() || msg->type()==ui::kFocusLeaveMessage){projectTabDragging_=false;return false;}

      if(msg->type()==ui::kMouseUpMessage){projectTabDragging_=false;releaseMouse();return true;}

      if(msg->type()==ui::kMouseMoveMessage){const auto point=static_cast<ui::MouseMessage*>(msg)->position();if(std::abs(point.x-projectTabPress_.x)<5*uiScale)return true;

        for(std::size_t i=0;i<projectTabRects_.size();++i)if(i!=activeProject_ && projectTabRects_[i].contains(point)){auto current=std::move(projects_[activeProject_]);projects_.erase(projects_.begin()+activeProject_);projects_.insert(projects_.begin()+i,std::move(current));activeProject_=i;projectTabPress_=point;layoutDocumentTab();invalidate();break;}return true;}

    }

    if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->ctrlPressed() && key->scancode()==ui::kKeyTab && projects_.size()>1){activateProject((activeProject_+projects_.size()+(key->shiftPressed()?-1:1))%projects_.size());return true;}}

    if(msg->type()!=ui::kMouseDownMessage && msg->type()!=ui::kMouseWheelMessage)return false;

    const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());if(!uiPhysical(gfx::Rect(rc.x,rc.y+Layout::documentY,std::max(1,rc.w-17),Layout::projectTabHeight)).contains(mouse->position()))return false;

    if(msg->type()==ui::kMouseWheelMessage){projectTabScroll_+=mouse->wheelDelta().y*30;layoutDocumentTab();invalidate();return true;}

    for(std::size_t i=0;i<projectTabRects_.size();++i)if(projectTabRects_[i].contains(mouse->position())){if(mouse->left() || mouse->middle()){activateProject(i);if(mouse->middle())ask(Pending::CloseDocument);else{projectTabDragging_=true;projectTabPress_=mouse->position();captureMouse();}return true;}}return false;

  }

std::filesystem::path Editor::projectFolderSource()const{return currentPath().empty()?currentDocument().sourceFilePath():currentPath();}

bool Editor::fullscreen()const{return display() && display()->nativeWindow() && display()->nativeWindow()->isFullscreen();}

void Editor::toggleFullscreen(){

    if(fullscreenTransition_ || !display() || !display()->nativeWindow())return;

    fullscreenTransition_=true;struct Reset {bool& flag;~Reset(){flag=false;}} reset{fullscreenTransition_};

    auto window=display()->nativeWindow();bool entering=!window->isFullscreen(),maximized=window->isMaximized();

    try{

      if(entering){if(maximized)window->maximize();try{setNativeFullscreen_(window,true);}catch(...){if(maximized && !window->isMaximized())window->maximize();throw;}restoreMaximizedAfterFullscreen_=maximized;}

      else{setNativeFullscreen_(window,false);if(restoreMaximizedAfterFullscreen_ && !window->isMaximized())window->maximize();restoreMaximizedAfterFullscreen_=false;}

      invalidate();

    }catch(const std::exception& error){status_=unicodeText(error.what());invalidate();}

  }

bool Editor::fullscreenShortcut(ui::Message* msg){

    if(msg->type()!=ui::kKeyDownMessage || pending_!=Pending::None)return false;

    auto key=static_cast<ui::KeyMessage*>(msg);

    if(key->scancode()!=ui::kKeyF11 || key->ctrlPressed() || key->cmdPressed() || key->altPressed() || key->shiftPressed() || dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()))return false;

    if(!key->repeat())toggleFullscreen();return true;

  }

void Editor::openProjectFolder(){

    const auto source=projectFolderSource();if(source.empty()){status_=U"工程尚未保存";return;}

    try{

      std::error_code error;if(!std::filesystem::is_regular_file(source,error))throw std::runtime_error("工程文件不存在，无法打开所在文件夹。");

      const auto directory=source.parent_path();if(directory.empty())throw std::runtime_error("无法确定工程文件所在文件夹。");

      projectFolderLauncher_(directory);status_=U"已打开工程所在文件夹";

    }catch(const std::exception& e){status_=unicodeText(e.what());}invalidate();

  }

void Editor::acceptOpen() {

    if(!openCandidate_) return;

    if(!candidateRecovery_ && !openCandidate_->projectId().empty()){for(std::size_t i=0;i<projects_.size();++i)if(projectDocument(i).projectId()==openCandidate_->projectId()){openCandidate_.reset();activateProject(i);return;}}

    auto next=std::make_unique<Document>(std::move(*openCandidate_));if(candidateRecovery_)next->markRecovered(next->name()+U"（恢复）");const auto origin=candidateRecovery_?candidateRecoveryId_:std::string{};const auto path=candidateRecovery_?std::filesystem::path():candidatePath_;candidateRecovery_=false;candidateRecoveryId_.clear();openCandidate_.reset();addProject(std::move(*next),path);
    if(!origin.empty()){currentRecovery().originId=origin;currentRecovery().ownedId=origin;currentRecovery().ownedIdentity=currentDocument().identity();}

    recordHomeRecent(currentPath().empty()?currentDocument().sourceFilePath():currentPath());

    currentView().paletteScroll=0;paletteFocused_=false;ink_=currentDocument().palette().primary;

    status_=U"工程已打开";fitCanvas();if(recentKeepHome_){recentKeepHome_=false;showHome(true);}refresh();if(importAfterOpen_){importAfterOpen_=false;openSheetImport(false);}

  }

bool Editor::sameProjectPath(const std::filesystem::path& a,const std::filesystem::path& b){return !a.empty() && !b.empty() && _wcsicmp(std::filesystem::absolute(a).lexically_normal().c_str(),std::filesystem::absolute(b).lexically_normal().c_str())==0;}

void Editor::openPath(const std::filesystem::path& path) {
    if(scriptSaving_)return;

    try {
      auto packageExtension=path.extension().wstring();std::transform(packageExtension.begin(),packageExtension.end(),packageExtension.begin(),[](wchar_t c){return ::towlower(c);});
      if(packageExtension==L".msext"){if(installExtensionPackage(font_,skin_,toolIcons_,display(),bounds(),path,script::executableDirectory()/"extensions",[this]{updateScriptsMenu();}))status_=U"扩展已安装";requestFocus();refresh();return;}
      for(const auto& job:backgroundSaves_)if(sameProjectPath(path,job.save.path)){if(const auto owner=saveProjectIndex(job.save.version.identity))activateProject(*owner);return;}

      ensureProjects();for(std::size_t i=0;i<projects_.size();++i){const auto& saved=projectPath(i);if(sameProjectPath(path,saved) || sameProjectPath(path,projectDocument(i).sourceFilePath())){activateProject(i);recordHomeRecent(path);return;}}

      auto ext=path.extension().wstring();std::transform(ext.begin(),ext.end(),ext.begin(),[](wchar_t c){return ::towlower(c);});

      const bool backup=isMoonSpriteBackupPath(path);
      const bool ase=ext==L".ase"||ext==L".aseprite";
      const bool raster=ext==L".gif"||ext==L".png"||ext==L".jpg"||ext==L".jpeg"||ext==L".bmp"||ext==L".webp";
      auto restoreReport=std::make_shared<project::TimelapseRestoreReport>();
      auto detectedGif=std::make_shared<bool>(false);
      DocumentLoadingDialog loading(font_,skin_,[path,ext,backup,ase,raster,restoreReport,detectedGif]() -> Document {
        if(!raster&&hasGifFileSignature(path)){*detectedGif=true;auto candidate=openGifAnimation(path,backup?path.stem().u32string():path.filename().u32string());if(backup)candidate.setSourceFilePath({});return candidate;}
        if(ext==L".psd")return openPsd(path);
        if(ase){auto candidate=openAseprite(path);candidate.setSourceFilePath(path);return candidate;}
        if(raster){auto candidate=ext==L".gif"?openGifAnimation(path):openRasterImage(path);candidate.setSourceFilePath(path);return candidate;}
        const project::Limits limits;

        std::ifstream file(path,std::ios::binary|std::ios::ate);

        if(!file) throw std::runtime_error("Cannot read project file");

        const auto size=file.tellg();

        if(size<0 || std::uint64_t(size)>limits.archiveBytes) throw project::Error(project::ErrorKind::Limit,"Project exceeds read budget");

        auto bytes=std::make_shared<project::Bytes>(std::size_t(size));file.seekg(0);

        if(!file.read(reinterpret_cast<char*>(bytes->data()),std::streamsize(bytes->size()))) throw std::runtime_error("Incomplete project read");

        auto imported=project::prepareEditableImport(project::readProjectManifest(bytes,limits,restoreReport.get()));

        if(backup)imported.name=path.stem().u32string();
        auto candidate=project::createEditableDocument(std::move(imported));

        if(!backup)candidate.setSourceFilePath(path);return candidate;
      },U"打开文件",&toolIcons_);
      loading.setDisplay(display(),false);const auto size=loading.minimumDialogSize(bounds().w);
      loading.setBounds({bounds().center().x-size.w/2,bounds().center().y-size.h/2,size.w,size.h});
      auto loaded=loading.run([this]{return pending_==Pending::None&&!currentDocument().strokeActive()&&!ui::Manager::getDefault()->getCapture();});
      // Another open may finish while this progress overlay is dismissed.
      ensureProjects();for(std::size_t i=0;i<projects_.size();++i){const auto& saved=projectPath(i);if(sameProjectPath(path,saved)||sameProjectPath(path,projectDocument(i).sourceFilePath())){activateProject(i);recordHomeRecent(path);return;}}
      openCandidate_=std::move(loaded);candidatePath_=backup||ase||raster||ext==L".psd"||(*detectedGif&&ext!=L".moonsprite"&&ext!=L".bak")?std::filesystem::path{}:path;
      candidateRecovery_=false;ask(Pending::Open);
      if(backup&&pending_==Pending::None)recordHomeRecent(path);
      if(ase&&!*detectedGif)status_=U"已打开 ASE；沿用原格式保存时将保存回源文件。";
      if(restoreReport->droppedTimelapseFrames){status_=timelapseRestoreWarning(*restoreReport);refresh();}

    } catch(const std::exception& e) {

      recentErrors_[path.u8string()]=e.what();recentKeepHome_=false;errorTitle_=U"无法打开工程";openCandidate_.reset();openError_=unicodeText(e.what());

      pending_=Pending::OpenError;menuBar_->setEnabled(false);

      for(auto b:commands_) b->setEnabled(false);for(auto b:swatches_) b->setEnabled(false);for(auto b:panelTabs_) b->setEnabled(false);

      refresh();

      dialogClose_->setVisible(true);discard_->setVisible(false);keep_->caption=U"确定";keep_->setVisible(true);keep_->requestFocus();invalidate();

    }

  }

void Editor::showSaveError(const std::exception& error) {

    errorTitle_=U"无法保存工程";openError_=unicodeText(error.what());pending_=Pending::OpenError;

    saveBeforeClose_->setVisible(false);discard_->setVisible(false);keep_->caption=U"确定";keep_->setVisible(true);dialogClose_->setVisible(true);

    menuBar_->setEnabled(false);for(auto b:commands_)b->setEnabled(false);for(auto b:swatches_)b->setEnabled(false);for(auto b:panelTabs_)b->setEnabled(false);

    refresh();keep_->requestFocus();

  }

std::optional<std::size_t> Editor::saveProjectIndex(std::uint64_t identity)const{
 for(std::size_t i=0;i<projects_.size();++i)if(projectDocument(i).identity()==identity)return i;
 return {};
}

bool Editor::backgroundSaveBusy(std::uint64_t identity)const{
 return std::any_of(backgroundSaves_.begin(),backgroundSaves_.end(),[&](const auto& job){return job.save.version.identity==identity;});
}

void Editor::dismissSaveProgress(){
 if(scriptSaving_)return;
 if(pending_!=Pending::Saving)return;
 saveDismissRequested_=true;
 // Snapshot capture reads live storage in bounded ticks. Release editing only
 // after ownership has moved to the encoder; never race capture with a stroke.
 if(!saveJob_.worker.valid())return;
 backgroundSaves_.reserve(backgroundSaves_.size()+1);
 BackgroundSave job;job.save=std::move(saveJob_);job.resume=saveResume_;job.close=closeAfterSave_;backgroundSaves_.push_back(std::move(job));
 closeAfterSave_=false;saveResume_=Pending::None;pending_=Pending::None;restoreSaveControls();
 // A save started from the unsaved-changes prompt captured disabled controls.
 menuBar_->setEnabled(true);paletteActions_->setEnabled(true);for(auto b:commands_)b->setEnabled(true);for(auto b:swatches_)b->setEnabled(true);for(auto b:panelTabs_)b->setEnabled(true);
 discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);dialogClose_->setVisible(false);saveBeforeClose_->setVisible(false);discard_->setVisible(false);keep_->setVisible(false);requestFocus();refresh();
}

bool Editor::completeSaveJob(const SaveJob& job,project::EncodedProject result,bool background){
 const auto owner=resolveSession(job.version.identity);
 if(!owner)throw std::runtime_error("Saving project no longer exists");
 auto savedStatus=background?(job.image?job.path.filename().u32string():owner->value.name())+U"：":std::u32string{};
 savedStatus.reserve(savedStatus.size()+32);
 const bool exact=workspace::acceptSaveResult(owner->value,owner->path,job,std::move(result),acceptAsepriteSaved);
 savedStatus+=exact?U"工程已保存":U"已保存先前版本；当前修改尚未保存";status_.swap(savedStatus);
 if(exact){
  queuedSaves_.erase(std::remove_if(queuedSaves_.begin(),queuedSaves_.end(),[&](const auto& q){return q.identity==job.version.identity&&!q.saveAs&&!q.optionsJson;}),queuedSaves_.end());
  const auto cleanup=owner->recovery.scheduleSavedCleanup(recoveryDirectory(),job.version.identity);
  if(cleanup.cleanupFailure)status_+=U"；恢复清理失败："+unicodeText(cleanup.error);
 }
 // The file and its save point are already accepted. Ancillary persistence
 // must not skip recovery cleanup or masquerade as an encoding/write failure.
 try{recordHomeRecent(job.path);usageStatistics_.recordEvent("save");}catch(const std::exception& error){status_+=U"；保存后记录失败："+unicodeText(error.what());}
 if(!smoke_)try{auto bytes=job.path.parent_path().u8string();if(!bytes.empty())writeExportBytesAtomic(palettePreferencePath().parent_path()/"last-save-directory.txt",{bytes.begin(),bytes.end()});}catch(const std::exception& e){status_+=U"；保存位置偏好记录失败："+unicodeText(e.what());}
 return exact;
}

void Editor::backgroundSaveTick(){
 // Modal previews and gestures may own live state. Publish at a safe UI boundary.
 if(pending_!=Pending::None||currentDocument().active()||currentDocument().strokeActive()||ui::Manager::getDefault()->getCapture())return;
 for(std::size_t i=0;i<backgroundSaves_.size();){
  if(!backgroundSaves_[i].save.ready()){++i;continue;}
  auto job=std::move(backgroundSaves_[i]);backgroundSaves_.erase(backgroundSaves_.begin()+i);
  try{
   completeSaveJob(job.save,job.save.worker.get(),true);
   if(job.resume!=Pending::None)deferredSaveCloses_.push_back({job.save.version.identity,job.resume,true});
   if(job.close)closeAfterBackgroundSaves_=true;
   refresh();
  }catch(const std::exception& error){
   closeAfterBackgroundSaves_=false;closingWorkspace_=false;deferredSaveCloses_.erase(std::remove_if(deferredSaveCloses_.begin(),deferredSaveCloses_.end(),[&](const auto& c){return c.identity==job.save.version.identity;}),deferredSaveCloses_.end());
   const auto context=job.save.path.u8string()+": "+error.what();showSaveError(std::runtime_error(context));return;
  }
 }
 for(auto it=deferredSaveCloses_.begin();it!=deferredSaveCloses_.end();){
  const auto owner=saveProjectIndex(it->identity);if(!owner){it=deferredSaveCloses_.erase(it);continue;}
  if(backgroundSaveBusy(it->identity)||std::any_of(queuedSaves_.begin(),queuedSaves_.end(),[&](const auto& q){return q.identity==it->identity;})){++it;continue;}
  auto& recovery=projectRecovery(*owner);
  if(recovery.cleanupError&&recovery.cleanupError->first==it->identity){
   const auto identity=it->identity;const auto error=recovery.cleanupError->second;
   deferredSaveCloses_.erase(std::remove_if(deferredSaveCloses_.begin(),deferredSaveCloses_.end(),[&](const auto& c){return c.identity==identity;}),deferredSaveCloses_.end());
   closeAfterBackgroundSaves_=false;closingWorkspace_=false;
   showSaveError(std::runtime_error(error));errorTitle_=U"工程已保存；恢复清理失败";return;
  }
  if(recovery.worker.valid()&&recovery.worker.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready){++it;continue;}
  const auto intent=*it;deferredSaveCloses_.erase(it);
  if(*owner!=activeProject_&&!projectDocument(*owner).dirty()&&intent.action==Pending::CloseDocument){
   try{if(recovery.worker.valid())recovery.worker.get();if(recovery.originId.empty()&&!recovery.ownedId.empty())project::removeOwnedRecovery(recoveryDirectory(),recovery.ownedId);}catch(const std::exception& e){showSaveError(e);return;}
   releaseProjectReferenceViews(intent.identity,referenceWindows_,referenceSessions_);
   projects_.erase(projects_.begin()+*owner);if(*owner<activeProject_)--activeProject_;refresh();return;
  }
  activateProject(*owner);
  if(intent.saveChanges&&currentDocument().dirty()){pending_=intent.action;saveProject(false);}
  else ask(intent.action);
  return;
 }
 if(closeAfterBackgroundSaves_&&backgroundSaves_.empty()&&queuedSaves_.empty()&&deferredSaveCloses_.empty()){
  for(std::size_t i=0;i<projects_.size();++i){
   auto& recovery=projectRecovery(i);
   if(recovery.cleanupError&&recovery.cleanupError->first==projectDocument(i).identity()){
    const auto error=recovery.cleanupError->second;closeAfterBackgroundSaves_=false;closingWorkspace_=false;
    showSaveError(std::runtime_error(error));errorTitle_=U"工程已保存；恢复清理失败";return;
   }
   if(recovery.worker.valid()&&recovery.worker.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready)return;
  }
  closeAfterBackgroundSaves_=false;requestClose();
 }
}

void Editor::saveTick(){
 if(gradientIoDialogOpen_)return;
 backgroundSaveTick();
 if(pending_!=Pending::Saving){
  if(pending_!=Pending::None)return;
  if(currentDocument().active()||currentDocument().strokeActive()||ui::Manager::getDefault()->getCapture())return;
  // One bounded pass: a deferred owner must not spin by re-enqueuing itself.
  const auto count=queuedSaves_.size();
  for(std::size_t n=0;n<count&&!queuedSaves_.empty();++n){auto next=queuedSaves_.front();queuedSaves_.erase(queuedSaves_.begin());const auto owner=saveProjectIndex(next.identity);if(!owner)continue;if(backgroundSaveBusy(next.identity)||projectDocument(*owner).active()||projectDocument(*owner).strokeActive()){queuedSaves_.push_back(next);continue;}if(*owner!=activeProject_){if(auto recording=projectDocument(*owner).recordingSession()){try{recording->beginFlush(projectDocument(*owner));if(!recording->flushReady(projectDocument(*owner))){queuedSaves_.push_back(next);continue;}}catch(const std::exception& error){queuedSaves_.insert(queuedSaves_.begin(),next);closeAfterBackgroundSaves_=false;showSaveError(error);return;}}}saveProject(next.saveAs,next.identity,next.optionsJson);if(pending_!=Pending::None)return;}
  if(!queuedSaves_.empty()||!backgroundSaves_.empty())return;
  if(queuedSaveResume_!=Pending::None||queuedSaveClose_){auto resume=queuedSaveResume_;bool close=queuedSaveClose_;queuedSaveResume_=Pending::None;queuedSaveClose_=false;pending_=resume;if(pending_!=Pending::None)resolve(true);if(close)requestClose();}
  return;
 }
 try{
  const auto owner=saveProjectIndex(saveJob_.version.identity);if(!owner)throw std::runtime_error("Saving project no longer exists");
  auto& value=projectDocument(*owner);
  if(saveJob_.snapshot){
   if(!saveJob_.snapshot->advance(value,std::chrono::steady_clock::now()+std::chrono::milliseconds(2)))return;
   auto snapshot=std::move(*saveJob_.snapshot);saveJob_.snapshot.reset();
   const workspace::CapturedSaveRequest request{saveJob_.path,saveJob_.image?saveImageFormat(saveJob_.path):SaveImageFormat::Native,saveJob_.portableTimelapse,saveJob_.scale,projectBackupPolicy()};
   const auto recordingReader=value.recordingSession()?value.recordingSession()->reader():timelapse::Reader{};
   saveJob_.worker=std::async(std::launch::async,[snapshot=std::move(snapshot),request,recordingReader]()mutable{return workspace::runCapturedSave(std::move(snapshot),request,recordingReader);});if(saveDismissRequested_)dismissSaveProgress();return;
  }
  if(!saveJob_.worker.valid()||saveJob_.worker.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready)return;
  if(!saveDismissRequested_&&std::chrono::steady_clock::now()-saveJob_.started<std::chrono::milliseconds(100))return;
  const bool exact=completeSaveJob(saveJob_,saveJob_.worker.get(),false);
  const auto resume=saveResume_;const bool close=closeAfterSave_;saveResume_=Pending::None;closeAfterSave_=false;
  pending_=Pending::None;restoreSaveControls();discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);
  if(resume!=Pending::None){menuBar_->setEnabled(true);paletteActions_->setEnabled(true);for(auto b:commands_)b->setEnabled(true);for(auto b:swatches_)b->setEnabled(true);for(auto b:panelTabs_)b->setEnabled(true);deferredSaveCloses_.push_back({value.identity(),resume,true});}
  if(!exact&&(resume!=Pending::None||close))queuedSaves_.push_back({value.identity(),false});
  if(close)closeAfterBackgroundSaves_=true;
  refresh();
 }catch(const std::exception& e){saveJob_.snapshot.reset();closeAfterSave_=false;closeAfterBackgroundSaves_=false;closingWorkspace_=false;deferredSaveCloses_.erase(std::remove_if(deferredSaveCloses_.begin(),deferredSaveCloses_.end(),[&](const auto& c){return c.identity==saveJob_.version.identity;}),deferredSaveCloses_.end());restoreSaveControls();discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);showSaveError(e);}
}

bool Editor::savePath(const std::filesystem::path& path,bool background,bool sourceOnly,std::uint64_t identity) {
 ensureProjects();const auto owner=saveProjectIndex(identity?identity:currentDocument().identity());if(!owner)return false;
 auto& value=projectDocument(*owner);
 auto& saveOwnerPath=projectPath(*owner);
 auto& saveOwnerRecovery=projectRecovery(*owner);
 if(value.gradientActive()&&(*owner!=activeProject_||!resolveGradientForIo()))return false;
 const bool ase=saveImageFormat(path)!=SaveImageFormat::Native;

    for(std::size_t i=0;i<projects_.size();++i)if(i!=*owner && (sameProjectPath(path,projectPath(i))||sameProjectPath(path,projectDocument(i).sourceFilePath()))){showSaveError(std::runtime_error("该路径已由另一个打开的工程使用，请选择其它名称"));return false;}

    for(const auto& job:backgroundSaves_)if(job.save.version.identity!=value.identity()&&sameProjectPath(path,job.save.path)){showSaveError(std::runtime_error("该路径正在由另一个工程保存，请选择其它名称"));return false;}

    if(!smoke_ || background || ase || portableTimelapseSave_ || asyncSaveForSmoke_){

      if(pending_==Pending::Saving)return false;

      try{

        value.commitFloatingPaste();if(*owner==activeProject_){if(!flushTimelapse())return false;}else if(auto session=value.recordingSession())session->flush(value);saveJob_.begin(value,path,ase,sourceOnly,portableTimelapseSave_,requestedSaveScale_);portableTimelapseSave_=false;saveResume_=pending_;
        saveDismissRequested_=*owner!=activeProject_;savingControlStates_.clear();for(auto child:children())savingControlStates_.push_back({child,child->isEnabled()});pending_=Pending::Saving;refresh();

        for(auto child:children())child->setEnabled(false);

        for(auto child:{discard_,keep_,saveBeforeClose_})child->setVisible(false);dialogClose_->setEnabled(true);dialogClose_->setVisible(true);

        invalidate();saveTick();

      }catch(const std::exception& e){saveJob_.snapshot.reset();restoreSaveControls();showSaveError(e);}

      return false; // Completion owns the pending close/new/open continuation.

    }

    try {value.commitFloatingPaste();if(!flushTimelapse())return false;project::saveDocumentAtomic(value,path);saveOwnerPath=path;status_=U"工程已保存";recordHomeRecent(path);

      if(saveOwnerRecovery.ownedIdentity==value.identity() && !saveOwnerRecovery.ownedId.empty()) {

        try {if(saveOwnerRecovery.worker.valid()){saveOwnerRecovery.worker.get();if(saveOwnerRecovery.ticket)saveOwnerRecovery.queue.complete(*saveOwnerRecovery.ticket,true);saveOwnerRecovery.ticket.reset();}

          project::removeOwnedRecovery(recoveryDirectory(),saveOwnerRecovery.ownedId);if(saveOwnerRecovery.originId==saveOwnerRecovery.ownedId)saveOwnerRecovery.originId.clear();saveOwnerRecovery.ownedId.clear();

        } catch(const std::exception&e){status_=U"工程已保存；恢复清理失败："+unicodeText(e.what());}

      }

      refresh();return true;}

    catch(const std::exception& e) {showSaveError(e);return false;}

  }

bool Editor::saveProject(bool saveAs,std::uint64_t identity,std::optional<std::string> optionsJson) {
 if(!documentOpen_)return false;ensureProjects();const auto owner=saveProjectIndex(identity?identity:currentDocument().identity());if(!owner)return false;
 // Nested native dialogs can dispatch tab close/replacement. Keep both owners
 // alive, then re-resolve membership before using their results.
 const auto saveSession=projects_.at(*owner);const auto saveDocument=saveSession->value;
 auto& value=*saveDocument;
 auto& saveOwnerPath=saveSession->path;
 if(*owner==activeProject_&&!resolveGradientForIo())return false;
 if(pending_==Pending::Saving||backgroundSaveBusy(value.identity())){queuedSaves_.push_back({value.identity(),saveAs,optionsJson});return false;}
 if(value.active()||value.strokeActive()){if(*owner!=activeProject_){queuedSaves_.push_back({value.identity(),saveAs,optionsJson});return false;}}
 if(*owner==activeProject_){for(auto& picker:pickerColumns_)if(picker.picker)picker.picker->finishInteraction();cancelStroke();}
 value.commitFloatingPaste();if(*owner==activeProject_){if(!flushTimelapse())return false;}else if(auto session=value.recordingSession())session->flush(value);portableTimelapseSave_=false;
 using namespace winrt::Windows::Data::Json;
 JsonObject scriptOptions;if(optionsJson)scriptOptions=JsonObject::Parse(winrt::to_hstring(*optionsJson));
 const auto oldScale=requestedSaveScale_;struct RestoreScale{int& value;int old;~RestoreScale(){value=old;}} restoreScale{requestedSaveScale_,oldScale};requestedSaveScale_=100;
 if(scriptOptions.HasKey(L"scalePercent")){const auto value=scriptOptions.GetNamedValue(L"scalePercent");if(value.ValueType()==JsonValueType::Number&&std::isfinite(value.GetNumber()))requestedSaveScale_=int(std::clamp(std::floor(value.GetNumber()+.5),1.,6400.));}
 const auto targetPolicy=documentSaveTarget(saveOwnerPath,value.sourceFilePath());
 auto target=targetPolicy?targetPolicy->path:std::filesystem::path{};
 auto format=targetPolicy?targetPolicy->format:SaveImageFormat::Native;const bool sourceImage=format!=SaveImageFormat::Native;
 const bool original=runtimePreferences_.flag("files.saveOriginalFormat");
 if(!optionsJson&&!saveAs&&!value.dirty()&&!target.empty()&&(sourceImage?original:!saveOwnerPath.empty())){status_=U"工程已保存";refresh();return true;}
 const auto requestContext=workspace::SaveDecisionContext::capture(value,saveOwnerPath,format);
 auto validateOwner=[&]{
  const auto present=std::find(projects_.begin(),projects_.end(),saveSession);
  if(present==projects_.end()||saveSession->value!=saveDocument||!requestContext.matchesOwnerTarget(value,saveOwnerPath))
   throw std::runtime_error("保存所属工程或目标在确认期间发生变化，请重试。");
 };
 auto persist=[&](const std::filesystem::path& destination,bool sourceOnly){validateOwner();return savePath(destination,false,sourceOnly,requestContext.identity);};
 auto decide=[&](bool preferred,const std::vector<std::string>& issues){
  if(format==SaveImageFormat::Psd||format==SaveImageFormat::Ase||format==SaveImageFormat::Aseprite){const int choice=confirmAsepriteSave(preferred,issues,format==SaveImageFormat::Psd);if(choice)validateOwner();return choice;}
  SaveFormatDecisionDialog popup(font_,skin_,toolIcons_,preferred,issues,saveImageLabel(format));popup.setDisplay(display(),false);auto size=popup.initialSize();auto center=bounds().center();popup.setBounds({center.x-size.w/2,center.y-size.h/2,size.w,size.h});ui::Timer check(40,&popup);
  if(smoke_&&asepriteSaveDecisionForSmoke_){check.Tick.connect([&]{check.stop();popup.smokeChoose(asepriteSaveDecisionForSmoke_(preferred,issues));});check.start();}
  popup.openWindowInForeground();requestFocus();refresh();const int choice=popup.result();if(choice)validateOwner();return choice;
 };
 bool forceProject=!optionsJson&&!original&&(sourceImage||target.empty());
 std::optional<workspace::SaveDecisionContext> approval;
 auto confirm=[&]()->int{
  validateOwner();const auto context=workspace::SaveDecisionContext::capture(value,saveOwnerPath,format,imageSaveIssues(value,format));approval=context;
  if(context.approvedIssues.empty())return 2;
  const int choice=decide(false,context.approvedIssues);if(!choice)return 0;
  if(!context.covers(format,imageSaveIssues(value,format)))throw std::runtime_error("工程在格式确认期间发生变化，请重新保存。");return choice;
 };
 try{
  if(forceProject&&targetPolicy&&!saveAs){if(decide(true,{})!=1)return false;}
  if(!optionsJson&&!saveAs&&sourceImage&&!forceProject){int choice=confirm();if(!choice)return false;if(choice==2){if(const auto current=documentSaveTarget(saveOwnerPath,value.sourceFilePath());!current||current->path!=target||current->format!=format)throw std::runtime_error("保存目标在确认期间发生变化，请重试。");return persist(target,saveOwnerPath.empty());}forceProject=true;}
  if(!optionsJson&&!saveAs&&!forceProject&&targetPolicy&&!saveOwnerPath.empty())return persist(target,false);
  if(forceProject)format=SaveImageFormat::Native;
  else if(target.empty())format=preferredSaveImageFormat(runtimePreferences_.index("files.saveFormat.Select"));
  if(optionsJson&&!forceProject&&scriptOptions.HasKey(L"format")&&scriptOptions.GetNamedValue(L"format").ValueType()==JsonValueType::String){auto name=winrt::to_string(scriptOptions.GetNamedString(L"format"));if(name=="moonsprite")format=SaveImageFormat::Native;else{auto selected=saveImageFormat(std::filesystem::u8path("file."+name));if(selected!=SaveImageFormat::Native)format=selected;}}
  std::filesystem::path initial=target.empty()?std::filesystem::path(value.name()):target;
  if(optionsJson&&scriptOptions.HasKey(L"name")&&scriptOptions.GetNamedValue(L"name").ValueType()==JsonValueType::String){auto name=scriptOptions.GetNamedString(L"name");std::wstring stem(name.c_str(),name.size());auto extension=std::filesystem::path(stem).extension().wstring();auto lower=extension;for(auto& c:lower)c=std::towlower(c);if(lower==L".moonsprite"||saveImageFormat(std::filesystem::path(L"file"+lower))!=SaveImageFormat::Native)stem.resize(stem.size()-extension.size());for(auto& c:stem)if(std::wstring(L"\\/:*?\"<>|").find(c)!=std::wstring::npos)c=L'_';auto first=stem.find_first_not_of(L" \t\r\n"),last=stem.find_last_not_of(L" \t\r\n");if(first!=std::wstring::npos)initial=stem.substr(first,last-first+1);}
  if(initial.filename().empty())initial=L"未命名";
  if(format!=SaveImageFormat::Native)initial=normalizedImageSavePath(initial,format);else initial.replace_extension(L".moonsprite");
  if(format!=SaveImageFormat::Native){int choice=confirm();if(!choice)return false;if(choice==1){format=SaveImageFormat::Native;initial.replace_extension(L".moonsprite");}}
  const bool portable=optionsJson&&scriptOptions.HasKey(L"includeTimelapse")&&scriptOptions.GetNamedValue(L"includeTimelapse").ValueType()==JsonValueType::Boolean&&scriptOptions.GetNamedBoolean(L"includeTimelapse");
  if(optionsJson&&(!target.empty()&&!saveAs&&!forceProject)){portableTimelapseSave_=portable;return persist(target,false);}
  if(optionsJson&&scriptOptions.HasKey(L"directory")&&scriptOptions.GetNamedValue(L"directory").ValueType()==JsonValueType::String){auto directory=winrt::to_string(scriptOptions.GetNamedString(L"directory"));auto first=directory.find_first_not_of(" \t\r\n"),last=directory.find_last_not_of(" \t\r\n");if(first!=std::string::npos){portableTimelapseSave_=portable;return persist(std::filesystem::u8path(directory.substr(first,last-first+1))/initial.filename(),false);}}
  static constexpr SaveImageFormat filterFormats[]={SaveImageFormat::Native,SaveImageFormat::Aseprite,SaveImageFormat::Psd,SaveImageFormat::Png,SaveImageFormat::Jpeg,SaveImageFormat::Webp,SaveImageFormat::Svg,SaveImageFormat::Ico,SaveImageFormat::Bmp,SaveImageFormat::Gif};
  for(;;){
   wchar_t filename[32768]{};wcsncpy_s(filename,initial.c_str(),_TRUNCATE);
   OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;
   dialog.lpstrFilter=L"MoonSprite 工程\0*.moonsprite\0ASE / ASEPRITE 工程\0*.ase;*.aseprite\0PSD 工程\0*.psd\0PNG 图片\0*.png\0JPEG 图片\0*.jpg;*.jpeg\0WebP 图片\0*.webp\0SVG 图片\0*.svg\0ICO 图标\0*.ico\0BMP 图片\0*.bmp\0GIF 动画\0*.gif\0\0";
   dialog.nFilterIndex=1;for(unsigned i=0;i<10;++i)if(filterFormats[i]==format)dialog.nFilterIndex=i+1;if(format==SaveImageFormat::Ase)dialog.nFilterIndex=2;
   dialog.lpstrDefExt=saveImageExtension(format)+1;
   auto preferred=std::filesystem::u8path(runtimePreferences_.get("files.saveDirectory.Text"));
   if(runtimePreferences_.index("files.saveLocationMode.Select")!=1){std::ifstream in(palettePreferencePath().parent_path()/"last-save-directory.txt",std::ios::binary);std::string value((std::istreambuf_iterator<char>(in)),{});if(!value.empty())preferred=std::filesystem::u8path(value);else preferred=target.parent_path();}
   if(optionsJson&&scriptOptions.HasKey(L"directory")&&scriptOptions.GetNamedValue(L"directory").ValueType()==JsonValueType::String){auto value=winrt::to_string(scriptOptions.GetNamedString(L"directory"));if(!value.empty())preferred=std::filesystem::u8path(value);}
   if(!preferred.empty())dialog.lpstrInitialDir=preferred.c_str();dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;
   validateOwner();
   if(!chooseSaveFile_(&dialog)){if(CommDlgExtendedError())showSaveError(std::runtime_error("Cannot open save dialog"));return false;}
   validateOwner();
   if(dialog.nFilterIndex<1||dialog.nFilterIndex>10)throw std::runtime_error("保存格式无效。");
   auto selected=filterFormats[dialog.nFilterIndex-1];
   if(dialog.nFilterIndex==2&&format==SaveImageFormat::Ase)selected=SaveImageFormat::Ase;
   std::filesystem::path path=filename;const auto requested=path;
   if(selected!=SaveImageFormat::Native)path=normalizedImageSavePath(path,selected);
   else {auto lower=path.extension().wstring();for(auto& c:lower)c=std::towlower(c);if(lower!=L".moonsprite")path.replace_extension(L".moonsprite");}
   if(path!=requested&&std::filesystem::exists(path)){showSaveError(std::runtime_error("请选择完整文件名以确认覆盖目标。"));return false;}
   if(selected!=SaveImageFormat::Native){bool changedFormat=format!=selected;format=selected;if(changedFormat||(!approval||!approval->covers(format,imageSaveIssues(value,format)))){int choice=confirm();if(!choice)return false;if(choice==1){format=SaveImageFormat::Native;initial=path;initial.replace_extension(L".moonsprite");continue;}}return persist(path,false);}
   if(optionsJson)portableTimelapseSave_=portable;
   if(!optionsJson&&saveAs&&!value.timelapseSettings().snapshots.empty()){const int choice=chooseTimelapsePortability();if(!choice)return false;validateOwner();portableTimelapseSave_=choice==2;}
   return persist(path,false);
  }
 }catch(const std::exception& e){showSaveError(e);return false;}
}

// legacy workspace-commands-document-io.ts exportActive / document-file-service.ts.
// UI owns location/conflicts and bounded capture; existing encoders run on a worker.
void Editor::runScriptExport(const std::string& optionsJson){
 using namespace winrt::Windows::Data::Json;
 if(pending_!=Pending::None||framePngBusy())return;
 scriptSaving_=true;
 struct Guard{std::function<void()> done;~Guard(){done();}} guard{[&]{scriptExporting_=false;scriptSaving_=false;framePngProgress_=workspace::ExportProgress{};if(pending_==Pending::StaticExport||pending_==Pending::GifExport)resolve(false);if(scriptSaveClose_){scriptSaveClose_=false;auto message=new ui::CallbackMessage([this]{requestClose();});message->setRecipient(ui::Manager::getDefault());ui::Manager::getDefault()->enqueueMessage(message);}}};
 try{
  const auto spec=JsonObject::Parse(winrt::to_hstring(optionsJson));
  auto string=[&](const wchar_t* key,const std::string& fallback=std::string{}){auto v=spec.GetNamedValue(key,JsonValue::CreateNullValue());return v.ValueType()==JsonValueType::String?winrt::to_string(v.GetString()):fallback;};
  auto number=[&](const wchar_t* key,int fallback){auto v=spec.GetNamedValue(key,JsonValue::CreateNullValue());return v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?int(std::clamp(std::floor(v.GetNumber()+.5),-2147483647.,2147483647.)):fallback;};
  auto format=string(L"format","png-auto"),target=string(L"target","document");if(format=="webp"&&target=="frames")target="document";
  const bool native=format=="moonsprite",project=native||format=="psd"||format=="ase"||format=="aseprite";
  const bool animated=format=="gif"||format=="webp";
  const int staticFormat=format=="png-rgba"?0:format=="png-auto"?4:format=="bmp"?1:format=="ico"?2:format=="svg"?3:format=="jpeg"?5:-1;
  if(!project&&!animated&&staticFormat<0)throw std::invalid_argument("Unsupported export format");
  if(target!="document"&&target!="selection"&&target!="layer"&&target!="slices"&&target!="frames")target="document";
  if(project&&target!="document")throw std::invalid_argument("Project export requires the document target");
  if(target=="frames"&&animated)throw std::invalid_argument("GIF frame sequence export is unsupported");
  if(target=="selection"&&!currentDocument().selection())throw std::invalid_argument("No pixel selection to export");
  const int scale=native?100:std::clamp(number(L"scalePercent",100),1,6400);
  const auto trimMode=string(L"trimMode");const auto trimValue=spec.GetNamedValue(L"trim",JsonValue::CreateNullValue());
  const bool trim=(trimMode.empty()&&trimValue.ValueType()==JsonValueType::Boolean&&trimValue.GetBoolean())||trimMode=="individual",common=trimMode=="common";
  const auto protection=ExportProtection(runtimePreferences_.index("files.exportProtection.Select"));
  StaticImageExportOptions image;image.scalePercent=scale;image.trim=trim;image.trimCommon=common;image.automatic=format=="png-auto";image.selection=target=="selection";image.protection=protection;
  GifExportOptions animation;animation.scalePercent=scale;animation.trim=trim;animation.trimCommon=common;animation.selection=image.selection;animation.protection=protection;animation.frameEnd=int(currentDocument().timeline().state().frames.size());
  const auto range=string(L"gifFrameRange");if(range=="range"){animation.frameStart=std::clamp(number(L"gifFrameStart",1),1,animation.frameEnd);animation.frameEnd=std::clamp(number(L"gifFrameEnd",animation.frameEnd),animation.frameStart,animation.frameEnd);}else if(range=="loop-section")animation.loopSectionId=string(L"gifLoopSectionId");
  const auto direction=string(L"gifDirection");animation.direction=direction=="reverse"?GifDirection::Reverse:direction=="forward-ping-pong"?GifDirection::ForwardPingPong:direction=="reverse-ping-pong"?GifDirection::ReversePingPong:GifDirection::Forward;
  // Reuse the existing modal's layout/cancel controls and export memory fields.
  if(animated||target=="frames")openGifExport();else openStaticExport();
  if(pending_!=Pending::StaticExport&&pending_!=Pending::GifExport)return;
  animationLayerJob_=target=="layer"||target=="slices";gifWebp_=format=="webp";framePngMode_=target=="frames";framePngAutomatic_=image.automatic;frameBmp_=staticBmp_=format=="bmp";frameIco_=staticIco_=format=="ico";frameSvg_=staticSvg_=format=="svg";frameJpeg_=staticJpeg_=format=="jpeg";
  exportProjectFormat_=native?10:format=="psd"?7:format=="ase"?8:format=="aseprite"?9:0;exportPresets_.name->setText(string(L"presetName"));exportOptions_=image;gifOptions_=animation;gifExplicitRange_=range=="range";exportAllLayers_=target=="layer"&&(!currentDocument().timeline().hasLayer(string(L"layerId")));exportSlices_=target=="slices";exportSliceId_=string(L"sliceId");
  if(target=="layer"&&!exportAllLayers_)exportOptions_.layerId=gifOptions_.layerId=string(L"layerId");
  exportScaleInput_->setText(std::to_string(scale));gifInputs_[0]->setText(std::to_string(scale));gifInputs_[1]->setText(std::to_string(animation.frameStart));gifInputs_[2]->setText(std::to_string(animation.frameEnd));
  const auto fallback=framePngExportStem(currentDocument().name());auto stem=framePngExportStem(unicodeText(string(L"name",utf8Text(fallback))),fallback);
  const auto extension=native?L".moonsprite":format=="psd"?L".psd":format=="ase"?L".ase":format=="aseprite"?L".aseprite":animated?(format=="webp"?L".webp":L".gif"):format=="jpeg"?L".jpg":format=="bmp"?L".bmp":format=="ico"?L".ico":format=="svg"?L".svg":L".png";
  std::filesystem::path directory;
  // Trim directory whitespace without altering separators or dots.
  auto rawDirectory=string(L"directory");auto first=rawDirectory.find_first_not_of(" \t\r\n"),last=rawDirectory.find_last_not_of(" \t\r\n");directory=first==std::string::npos?std::filesystem::path{}:std::filesystem::u8path(rawDirectory.substr(first,last-first+1));
  auto requested=directory/std::filesystem::path(stem+std::filesystem::path(extension).u32string());
  if(directory.empty()){
   wchar_t filename[32768]{};auto initial=(preferredExportDirectory()/requested).wstring();if(initial.size()>=32768)throw std::length_error("Export path too long");std::copy(initial.begin(),initial.end(),filename);
   OPENFILENAMEW chooser{};chooser.lStructSize=sizeof(chooser);chooser.hwndOwner=GetActiveWindow();chooser.lpstrFile=filename;chooser.nMaxFile=32768;chooser.lpstrFilter=L"导出文件\0*.*\0\0";chooser.lpstrDefExt=extension+1;chooser.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST;
   if(!chooseExportFile_(&chooser)){status_=U"已取消导出";return;}requested=filename;auto ext=requested.extension().wstring();for(auto& c:ext)c=std::towlower(c);if(ext!=extension)requested+=extension;directory=requested.parent_path();
  }
  if(!std::filesystem::is_directory(directory))throw std::invalid_argument("Export directory does not exist");
  exportDirectory_=directory;exportFilename_->setText(requested.filename().u8string());
  auto conflict=[this](const auto& path,const auto& suggested){return framePngConflict(path,suggested);};
  std::optional<AnimationLayerExportPlan> layers;std::optional<std::vector<std::filesystem::path>> paths;
  FramePngExportOptions frames{animation,image.automatic,format=="bmp",format=="ico",format=="svg",format=="jpeg"};
  if(target=="layer")layers=animated?planAnimationLayerExport(currentDocument(),string(L"layerId"),directory,requested.filename().u32string(),format=="webp",conflict):planStaticLayerExport(currentDocument(),string(L"layerId"),directory,requested.filename().u32string(),staticFormat,conflict);
  else if(target=="slices")layers=planSliceExport(currentDocument(),string(L"sliceId"),directory,std::filesystem::path(extension).u32string(),conflict);
  else if(target=="frames")paths=planFrameSequencePaths(directory,requested.filename().u32string(),framePngExportFrameIds(currentDocument().timeline().state(),frames).size(),conflict,format=="jpeg"?FrameSequenceFormat::Jpeg:format=="bmp"?FrameSequenceFormat::Bmp:format=="ico"?FrameSequenceFormat::Ico:format=="svg"?FrameSequenceFormat::Svg:FrameSequenceFormat::Png);
  else paths=resolveExportDestinations({requested},conflict);
  if((target=="layer"||target=="slices")?!layers:!paths){status_=U"已取消导出";return;}
  if(native&&!flushTimelapse())return;
  framePngProgress_=workspace::ExportProgress(layers?layers->paths.size():paths->size());auto job=framePngProgress_;
  const auto selection=currentDocument().selection();const auto reader=currentDocument().recordingSession()?currentDocument().recordingSession()->reader():timelapse::Reader{};
  DocumentSnapshot snapshot(currentDocument());scriptExporting_=true;refresh();ui::MessageLoop loop(ui::Manager::getDefault());
  while(!snapshot.advance(currentDocument(),std::chrono::steady_clock::now()+std::chrono::milliseconds(2))){loop.pumpMessages();if(job.cancelled()){status_=U"已取消导出";return;}}
  auto work=std::async(std::launch::async,[snapshot=std::move(snapshot),selection,reader,job,native,project,animated,format,scale,image,animation,frames,layers,paths,target]()mutable{
   auto copy=snapshot.finish();copy.previewSelection(selection);auto cancelled=[job]{return job.cancelled();};auto progress=[job](std::size_t n,std::size_t){job.report(n);};
   if(cancelled())return std::size_t(0);
   if(layers){AnimationLayerExportOptions options;options.animation=animation;options.webp=format=="webp";options.staticImage=!animated;options.image=image;options.format=format=="jpeg"?5:format=="svg"?3:format=="ico"?2:format=="bmp"?1:format=="png-auto"?4:0;return writeAnimationLayerExport(copy,options,*layers,cancelled,progress);}
   if(target=="frames")return writeFramePngSequence(copy,frames,*paths,cancelled,progress);
   std::vector<std::uint8_t> bytes;
   if(native){auto settings=copy.timelapseSettings();for(auto& frame:settings.snapshots){if(reader){frame.data=reader(frame);frame.historyDataBacking.reset();}else if(frame.data.empty())throw std::runtime_error("Cannot carry unavailable recording frames");frame.local.reset();}copy.setImportedTimelapse(std::move(settings));bytes=*project::encodeEditableProject(copy).bytes;}
   else if(project)bytes=encodeSaveImage(copy,format=="psd"?SaveImageFormat::Psd:format=="ase"?SaveImageFormat::Ase:SaveImageFormat::Aseprite,scale);
   else if(animated)bytes=(format=="webp"?encodeAnimationWebp(copy,animation):encodeAnimationGif(copy,animation)).bytes;
   else if(format=="jpeg")bytes=encodeStaticImageJpeg(copy,image).bytes;
   else if(format=="svg")bytes=encodeStaticImageSvg(copy,image).bytes;
   else if(format=="ico")bytes=encodeStaticImageIco(copy,image).bytes;
   else if(format=="bmp")bytes=encodeStaticImageBmp(copy,image).bytes;
   else bytes=encodeStaticImagePng(copy,image).png;
   if(cancelled())return std::size_t(0);writeExportBytesAtomic(paths->front(),bytes);job.report(1);return std::size_t(1);
  });
  // Await encoding without consuming a UI core. Keep pumping between bounded
  // waits so progress, cancellation and deferred close remain responsive.
  while(work.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready){loop.pumpMessages();work.wait_for(std::chrono::milliseconds(4));}
  const auto written=work.get();if(job.cancelled()){status_=U"已取消导出，保留已写入的文件";return;}
  if(written){const auto lastPath=layers?layers->paths.back():paths->back();rememberSuccessfulExport(requested);recordRecentExportPath(lastPath);usageStatistics_.recordExport(format);playExportSuccessSound();status_=U"导出完成";}
 }catch(const std::exception& e){status_=U"导出失败："+unicodeText(e.what());}catch(const winrt::hresult_error& e){status_=U"导出失败："+unicodeText(winrt::to_string(e.message()));}
}

std::filesystem::path Editor::recoveryDirectory() {

    if(!recoveryDirectory_.empty())return recoveryDirectory_;

    wchar_t local[32768]{};GetEnvironmentVariableW(L"LOCALAPPDATA",local,32768);

    return std::filesystem::path(local)/L"MoonSprite"/L"Native"/L"recovery";

  }

void Editor::recoveryTick(bool force) {
    activeRecoveryTick(force);
    if(projects_.size()<2 || pending_==Pending::Saving || (smoke_ && !force))return;
    const auto count=force?projects_.size():std::size_t(1);
    for(std::size_t n=0;n<count;++n){const auto index=recoveryProject_++%projects_.size();if(index==activeProject_)continue;auto& slot=*projects_[index];
      const auto result=slot.recovery.tick(projectDocument(index),recoveryPreferences_,recoveryDirectory(),force);
      if(!result.error.empty()){status_=(result.cleanupFailure?U"工程已保存；恢复清理失败：":U"自动恢复保存失败：")+unicodeText(result.error);invalidate();}
    }
}
void Editor::activeRecoveryTick(bool force) {
    if((pending_==Pending::Saving || smoke_) && !force)return;
    const auto result=currentRecovery().tick(currentDocument(),recoveryPreferences_,recoveryDirectory(),force);
    if(!result.error.empty()){status_=(result.cleanupFailure?U"工程已保存；恢复清理失败：":U"自动恢复保存失败：")+unicodeText(result.error);invalidate();}
}

void Editor::restoreRecovery(const std::filesystem::path& archive,const std::string& id,const std::u32string& name) {

    if(!project::isSafeRecoveryId(id)||recoveryDiscardId_==id)return;
    try {
      auto report=std::make_shared<project::TimelapseRestoreReport>();
      DocumentLoadingDialog loading(font_,skin_,[archive,id,name,report]{
        const auto source=archive.filename()==std::filesystem::u8path(id+".moonsprite")?project::resolveRecoveryPayload(archive.parent_path(),id):archive;
        auto file=std::ifstream(source,std::ios::binary|std::ios::ate);if(!file)throw std::runtime_error("Cannot read recovery");const auto length=file.tellg();if(length<0||std::uint64_t(length)>project::Limits{}.archiveBytes)throw std::runtime_error("Recovery size exceeds budget");
        auto bytes=std::make_shared<project::Bytes>(std::size_t(length));file.seekg(0);if(!file.read(reinterpret_cast<char*>(bytes->data()),std::streamsize(bytes->size())))throw std::runtime_error("Incomplete recovery read");
        auto imported=project::prepareEditableImport(project::readProjectManifest(bytes,{},report.get()));
        // Payload-only discovery uses its safe filename as a display fallback.
        // Keep the archive name when metadata is unavailable, without decoding
        // every archive during startup. A valid name equal to its ID still wins.
        bool fallback=name==std::u32string(id.begin(),id.end());
        if(fallback){try{if(const auto pending=project::readPendingRecoveryRecord(source,id))fallback=pending->name!=id;}catch(const std::exception&) {}}
        if(fallback){try{auto sidecar=archive;sidecar.replace_extension(L".json");std::ifstream meta(sidecar,std::ios::binary|std::ios::ate);if(meta&&meta.tellg()>=0&&meta.tellg()<=1024*1024){std::string text(std::size_t(meta.tellg()),'\0');meta.seekg(0);if(meta.read(text.data(),std::streamsize(text.size()))){const auto record=project::decodeRecoveryRecord(text);fallback=record.id!=id||record.name!=id;}}}catch(const std::exception&) {}}
        if(!fallback||imported.name.empty())imported.name=name;return project::createEditableDocument(std::move(imported));
      },U"恢复工程",&toolIcons_);
      loading.setDisplay(display(),false);const auto size=loading.minimumDialogSize(bounds().w);loading.setBounds({bounds().center().x-size.w/2,bounds().center().y-size.h/2,size.w,size.h});
      openCandidate_=loading.run([this]{return pending_==Pending::None&&!currentDocument().strokeActive()&&!ui::Manager::getDefault()->getCapture();});candidateRecovery_=true;candidateRecoveryId_=id;ask(Pending::Open);
      if(report->droppedTimelapseFrames){status_=timelapseRestoreWarning(*report);refresh();}
    }catch(const std::exception& e){showSaveError(e);errorTitle_=U"无法恢复工程";}
}

void Editor::setRecoveryPreferences(recovery::Preferences preferences) {

    try {preferences=recovery::normalizePreferences(preferences);if(!smoke_)recovery::savePreferencesAtomic(recoveryDirectory().parent_path()/"recovery-preferences.txt",preferences);recoveryPreferences_=preferences;for(auto& slot:projects_)if(slot!=activeSession_){slot->recovery.queue.setIntervalMinutes(preferences.minutes);slot->recovery.due=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(preferences.minutes*60000));}currentRecovery().queue.setIntervalMinutes(preferences.minutes);currentRecovery().due=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(preferences.minutes*60000));status_=U"恢复设置已保存";refresh();}

    catch(const std::exception&e){showSaveError(e);errorTitle_=U"恢复设置保存失败";}

  }

void Editor::loadRecoveries(bool startup) {

    if(recoveryDiscardWorker_.valid())return;
    if(smoke_&&recoveryCatalogWorker_.valid()){recoveryCatalogWorker_.wait();homeRecoveryTick();}
    if(!recoveryCatalog_.beginLoad(startup))return;

    const auto directory=recoveryDirectory();recoveryCatalogWorker_=std::async(std::launch::async,[directory]{return project::listRecoveryRecords(directory);});
    if(smoke_){recoveryCatalogWorker_.wait();homeRecoveryTick();}

    refresh();

  }

void Editor::chooseRecovery() {

    homeRecoveryTick();if(recoveryCatalog_.status()==recovery::CatalogStatus::Unloaded)loadRecoveries();const auto dir=recoveryDirectory();auto records=recoveryCatalog_.rows();if(records.empty()){status_=recoveryCatalog_.status()==recovery::CatalogStatus::Loading?U"正在读取恢复工程":U"没有可恢复工程";refresh();return;}PixelMenu popup(skin_);for(const auto& r:records){bool stale=false;try{const auto now=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();stale=recovery::retentionStale(std::stoll(r.updatedAt),now,recoveryPreferences_.retentionDays);}catch(const std::exception&){}auto item=new PixelMenuItem(font_,skin_,unicodeText(r.name)+(stale?U" · 超过保留期":U""));item->Click.connect([this,dir,r]{restoreRecovery(dir/std::filesystem::u8path(r.id+".moonsprite"),r.id,unicodeText(r.name));});popup.addChild(item);}popup.showPopup(gfx::Point(bounds().x+8,bounds().y+36),display());

  }

void Editor::runScriptWorkspace(const std::string& path,const std::string& options){
 using namespace winrt::Windows::Data::Json;
 const auto spec=JsonObject::Parse(winrt::to_hstring(options));
 auto text=[&](const wchar_t* key,const std::string& fallback=std::string{}){const auto v=spec.GetNamedValue(key,JsonValue::CreateNullValue());return v.ValueType()==JsonValueType::String?winrt::to_string(v.GetString()):fallback;};
 if(path=="document.create"){
  try{
   auto size=[&](const wchar_t* key){const auto v=spec.GetNamedValue(key,JsonValue::CreateNullValue());const auto n=v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?std::max(1.,std::trunc(v.GetNumber())):64.;if(n>32768)throw std::length_error("Canvas dimension exceeds native limit");return int(n);};
   auto mode=text(L"colorMode","rgba");if(mode=="indexed"||mode=="grayscale")throw std::logic_error("Native non-RGBA document creation is not yet migrated");
   auto name=text(L"name","Sprite");auto created=std::make_unique<Document>(Document::withBuiltinPalette(size(L"width"),size(L"height"),unicodeText(name)));addProject(std::move(*created));usageStatistics_.recordEvent("newProject");refresh();
  }catch(const std::exception& e){status_=U"创建工程失败："+unicodeText(e.what());invalidate();}
 }else{
  const auto value=spec.GetNamedValue(L"path",JsonValue::CreateNullValue());const auto filename=value.ValueType()==JsonValueType::Null?text(L"value"):text(L"path");
  if(filename.empty())chooseProject();else openPath(std::filesystem::u8path(filename));
  // Legacy openPath reports errors in workspace status and returns to MSE.
  if(pending_==Pending::OpenError){auto failure=openError_;resolve(false);status_=std::move(failure);invalidate();}
 }
}

void Editor::chooseProject() {

    std::vector<wchar_t> filename(32768);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);

    dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename.data();dialog.nMaxFile=32768;

    // Legacy platform_dialogs.rs::open_files exposes the existing readers,
    // instead of restricting the chooser to the native project suffix.
    // PSD follows the same candidate-document loading and error protection.
    dialog.lpstrTitle=L"打开文件";
    dialog.lpstrFilter=L"当前支持的文件\0*.moonsprite;*.moonsprite.bak;*.ase;*.aseprite;*.psd;*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif\0Aseprite / PSD 工程\0*.ase;*.aseprite;*.psd\0MoonSprite 工程与备份\0*.moonsprite;*.moonsprite.bak\0图片\0*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif\0\0";
    dialog.nFilterIndex=1;

    dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_FILEMUSTEXIST|OFN_ALLOWMULTISELECT;

    if(chooseOpenFile_(&dialog)){
      const std::filesystem::path first(filename.data());const wchar_t* next=filename.data()+wcslen(filename.data())+1;
      std::vector<std::filesystem::path> paths;if(!*next)paths.push_back(first);else for(;*next;next+=wcslen(next)+1)paths.push_back(first/next);
      // The same batch failure policy as desktop drop: successful siblings
      // remain open, and a corrupt file does not discard later selections.
      std::u32string failures;
      image_sequence::Host host;
      host.open=[this,&failures](const std::string& path){openPath(std::filesystem::u8path(path));if(pending_!=Pending::OpenError)return pending_==Pending::None;if(!failures.empty())failures+=U"\n";failures+=unicodeText(path)+U"："+openError_;resolve(false);return false;};
      host.add=[this](Document value){addProject(std::move(value));};
      host.error=[&failures](const std::string& error){if(!failures.empty())failures+=U"\n";failures+=unicodeText(error);};
      std::vector<std::string> sequencePaths;for(const auto& path:paths)sequencePaths.push_back(path.u8string());
      // A single file never asks for sequence import in legacy. Avoid entering
      // the large assembly stack when called from an in-flight Lua result.
      if(sequencePaths.size()==1)host.open(sequencePaths.front());
      else openImageSequenceDocuments(font_,skin_,toolIcons_,display(),bounds(),palettePreferencePath().parent_path()/"image-sequence-v1.txt",sequencePaths,std::move(host),{},[this]{return pending_==Pending::None&&!currentDocument().strokeActive()&&!ui::Manager::getDefault()->getCapture();});
      if(!failures.empty()){showSaveError(std::runtime_error(utf8Text(failures)));errorTitle_=U"无法打开选择的文件";refresh();}
    }

    else if(CommDlgExtendedError()) {

      openError_=U"无法打开文件选择器";pending_=Pending::OpenError;layoutModal();layoutPalette();

      dialogClose_->setVisible(true);discard_->setVisible(false);keep_->caption=U"确定";keep_->setVisible(true);invalidate();

    }

  }

void Editor::showNewDocument(bool verify) {

    ++newDocumentDialogCount_;

    NewDocumentDialog popup(font_,skin_,toolIcons_,verify?assets_.parent_path()/"new-document-test-owned"/"presets-v1.txt":palettePreferencePath().parent_path()/"new-document-presets-v1.txt",[this](std::u32string name,int width,int height){

      try{auto created=Document::withBuiltinPalette(width,height,std::move(name));addProject(std::move(created));usageStatistics_.recordEvent("newProject");return true;}catch(const std::exception& e){status_=unicodeText(e.what());return false;}

    });

    popup.setRecordingDefault(verify?false:runtimePreferences_.flag("general.timelapseRecordingEnabled"));
    popup.createWithRecording=[this](std::u32string name,int width,int height,bool record){
      try{auto created=Document::withBuiltinPalette(width,height,std::move(name));created.mutableTimelapseSettings().enabled=record;addProject(std::move(created));usageStatistics_.recordEvent("newProject");return true;}catch(const std::exception& e){status_=unicodeText(e.what());return false;}
    };
    popup.setDisplay(display(),false);const auto area=bounds();popup.setBounds({area.center().x-160*uiScale,area.center().y-125*uiScale,320*uiScale,popup.preferredHeight(320)*uiScale});
    popup.probeClipboard(verify?new_document::SizeReader([]{return std::optional<new_document::Size>{{23,17}};}):smoke_?new_document::SizeReader([]{return std::optional<new_document::Size>{};}):pixelClipboard_.newDocumentSizeReader(layerClipboardSnapshot_.has_value()));

    int geometryPhase=0;std::vector<gfx::Color> incremental;

    std::unique_ptr<ui::Timer> timer;if(verify||smoke_){timer=std::make_unique<ui::Timer>(80,&popup);timer->Tick.connect([&]{

      if(!verify){timer->stop();popup.closeWindow(nullptr);return;}

      auto surface=popup.display()->nativeSurface();const int pixels=surface->width()*surface->height();

      if(geometryPhase<18){const int phase=geometryPhase++%3;

        if(phase==0){popup.smokeGeometryStep((geometryPhase-1)/3);return;}

        if(phase==1){incremental.resize(pixels);{os::SurfaceLock lock(surface.get());for(int y=0;y<surface->height();++y)for(int x=0;x<surface->width();++x)incremental[y*surface->width()+x]=surface->getPixel(x,y);}popup.manager()->invalidate();return;}

        {os::SurfaceLock lock(surface.get());for(int y=0;y<surface->height();++y)for(int x=0;x<surface->width();++x)if(incremental[y*surface->width()+x]!=surface->getPixel(x,y))throw std::runtime_error("Popup incremental/full redraw mismatch phase="+std::to_string(geometryPhase/3)+" at "+std::to_string(x)+","+std::to_string(y));}return;

      }

      if(geometryPhase==18){writeSmokeFrame(surface.get(),assets_.parent_path()/"new-document-dialog.bmp");popup.smokeClipboard();popup.smoke(false);popup.smokeLarge(0);++geometryPhase;return;}
      if(geometryPhase==19){writeSmokeFrame(surface.get(),assets_.parent_path()/"new-document-large-invalid.bmp");popup.smokeLarge(1);++geometryPhase;return;}
      if(geometryPhase==20){writeSmokeFrame(surface.get(),assets_.parent_path()/"new-document-large.bmp");popup.smokeLarge(2);++geometryPhase;timer->stop();}

    });timer->start();}

    popup.openWindowInForeground();popup.stopClipboardProbe();requestFocus();refresh();

  }

void Editor::requestClose() {if(scriptSaving_){scriptSaveClose_=true;return;}if(importSheetTask_)return;if(gradientIoDialogOpen_)return;if(DocumentLoadingDialog::deferClose([this]{requestClose();}))return;if(!resolveGradientForIo())return;flushBrushSizePreferences();if(!backgroundSaves_.empty()||!queuedSaves_.empty()){closeAfterBackgroundSaves_=true;return;}if(pending_==Pending::Saving){closeAfterSave_=true;return;}ask(Pending::Close);}

}
