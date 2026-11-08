#include "recovery_commit.h"
#include "image_sequence_dialog.h"
#include "aseprite_save_policy.h"
#include "aseprite_io.h"
#include "psd_import.h"
#include "psd_export.h"
#include "editor_implementation.h"
#include "editor.h"
#include "image_save.h"
#include "document_save_policy.h"
#include "image_file_signature.h"
#include "save_format_dialog.h"
#include "timelapse_session.h"
#include "project_restore_report.h"
#include "runtime_diagnostics.h"

namespace moon::editor {
namespace {
std::u32string timelapseRestoreWarning(const project::TimelapseRestoreReport& report){
 std::string reasons;for(const auto& reason:report.dropReasons){if(!reasons.empty())reasons+=",";reasons+=reason;}
 diagnostics::recordGlobal("error","project.timelapse.restore",{{"declaredFrames",std::int64_t(report.droppedTimelapseFrames+report.timelapseFrames)},{"droppedFrames",std::int64_t(report.droppedTimelapseFrames)},{"restoredFrames",std::int64_t(report.timelapseFrames)},{"reasons",reasons}});
 return U"该工程的缩时记录有 "+unicodeText(std::to_string(report.droppedTimelapseFrames))+U" 帧无法恢复，已保留 "+unicodeText(std::to_string(report.timelapseFrames))+U" 帧。";
}
}


void Editor::ensureProjects(){if(documentOpen_ && projects_.empty()){projects_.push_back(std::make_unique<ProjectSession>());activeProject_=0;}}

const Document& Editor::projectDocument(std::size_t index)const{return index==activeProject_?document:*projects_[index]->stored;}

int Editor::projectWidth(const Document& value)const{return std::min(180,font_.inkBounds(value.name()).w+2*Layout::inset+11+uiGap+(value.dirty()?3+uiGap:0));}

int Editor::documentTabWidth(const Layout&)const{return projectWidth(document);}

void Editor::swapRecovery(ProjectSession& slot){

    using std::swap;swap(recovery_,slot.recovery);

  }

void Editor::settleProjectGesture(){

    for(auto& picker:pickerColumns_)if(picker.picker)picker.picker->finishInteraction();

    if(timelineGesture_.kind)finishTimelineGesture(true);

    finishAutoLinkGesture();finishVisibilityGesture();finishLockGesture();

    if(selectionDragging_ || floatingDragging_)endSelectionGesture(true);

    if(drawingAnchorDragging_){drawingAnchor_=drawingAnchorDragBefore_;drawingAnchorDragging_=false;if(hasCapture())releaseMouse();}
    auto capture=temporaryBrushCapture_;temporaryBrushCapture_.reset();
    document.cancelFilterPreview();document.cancelGradient();document.commitFloatingPaste();cancelStroke();++wandGeneration_;wandRequest_.reset();
    temporaryBrushCapture_=capture;

    heldCelNavigation_.clear();spaceHeld_=false;

  }

void Editor::storeActiveProject(){

    auto& slot=*projects_[activeProject_];slot.path=documentPath_;slot.canvas=canvas_;slot.zoom=zoom_;slot.rotation=viewRotation_;saveLayerPanelState();saveDocumentView();

    slot.layers=layerScroll_;slot.frames=frameScroll_;slot.layerRemainder=layerScrollRemainder_;slot.frameRemainder=frameScrollRemainder_;slot.paletteScroll=paletteScrollPixels_;

    slot.frameSelection=frameSelectionExplicit_;slot.guides=timelineSelectionGuidesVisible_;slot.recent=std::move(recentColors_);slot.pivot=selectionPivot_;slot.drawingAnchor=drawingAnchor_;slot.drawingAnchorVisible=drawingAnchorVisible_;slot.drawFromCanvasCenter=drawFromCanvasCenter_;

    slot.brushCapture=temporaryBrushCapture_;slot.brushReturnProfile=temporaryBrushReturnProfile_;slot.temporaryBrushActive=temporaryBrushActive_;
    if(temporaryBrushCapture_||temporaryBrushActive_){slot.temporaryBrush=pencilImageBrush_;slot.temporaryBrushId=pencilImageBrushId_;slot.temporaryBrushAngle=pencilImageBrushAngle_;}
    swapRecovery(slot);slot.stored.emplace(std::move(document));

  }

void Editor::restoreProject(std::size_t index){

    if(temporaryBrushCapture_||temporaryBrushActive_)exitTemporaryBrushCapture();
    activeProject_=index;auto& slot=*projects_[index];document=std::move(*slot.stored);applyDocumentPreferences(document);slot.stored.reset();documentPath_=slot.path;

    canvas_=slot.canvas;zoom_=slot.zoom;viewRotation_=slot.rotation;layerScroll_=slot.layers;frameScroll_=slot.frames;layerScrollRemainder_=slot.layerRemainder;frameScrollRemainder_=slot.frameRemainder;paletteScrollPixels_=slot.paletteScroll;

    frameSelectionExplicit_=slot.frameSelection;timelineSelectionGuidesVisible_=slot.guides;timelineSelectionIdentity_=document.identity();timelineLastActiveFrame_=document.frame().id;

    recentColors_=std::move(slot.recent);recentColorsIdentity_=document.identity();selectionPivot_=slot.pivot;drawingAnchor_=slot.drawingAnchor;drawingAnchorVisible_=slot.drawingAnchorVisible;drawFromCanvasCenter_=slot.drawFromCanvasCenter;selectionPivotMask_=document.selection();selectionPivotIdentity_=document.identity();trimPivotIdentity_=document.identity();trimPivotSerial_=document.selectionPivotHistory().serial;

    symmetryIdentity_=document.identity();ink_=document.palette().primary;paletteFocused_=false;swapRecovery(slot);

    temporaryBrushCapture_=slot.brushCapture;temporaryBrushReturnProfile_=slot.brushReturnProfile;temporaryBrushActive_=slot.temporaryBrushActive;
    if(temporaryBrushCapture_||temporaryBrushActive_){pencilImageBrush_=slot.temporaryBrush;pencilImageBrushId_=slot.temporaryBrushId;pencilImageBrushAngle_=slot.temporaryBrushAngle;selectionTool_=bool(temporaryBrushCapture_);shapeTool_=eyedropperTool_=navigation_.zoomTool_=gradientTool_=fillTool_=handTool_=eraser_=false;if(temporaryBrushCapture_){selectionKind_=0;selectionMode_=0;selectionRounded_=false;}}
    documentOpen_=true;homeOpen_=false;revealProjectTab_=true;constrainCanvas();refresh();

  }

void Editor::activateProject(std::size_t index){

    if(pending_!=Pending::None || index>=projects_.size())return;

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

    if(temporaryBrushCapture_||temporaryBrushActive_)exitTemporaryBrushCapture();
    projects_.push_back(std::make_unique<ProjectSession>());activeProject_=projects_.size()-1;

    drawingAnchor_=drawingAnchorDefaults_;drawingAnchorVisible_=drawingAnchorDefaultVisible_;drawFromCanvasCenter_=drawingAnchorDefaultEnabled_;document=std::move(next);applyDocumentPreferences(document,true);documentPath_=std::move(path);documentOpen_=true;homeOpen_=false;closingWorkspace_=false;

    layerScroll_=frameScroll_=layerScrollRemainder_=frameScrollRemainder_=paletteScrollPixels_=0;

    frameSelectionExplicit_=false;timelineSelectionGuidesVisible_=true;ink_=document.palette().primary;

    recovery_.queue.setIntervalMinutes(recoveryPreferences_.minutes);revealProjectTab_=true;viewRotation_={};fitCanvas();loadDocumentView();loadLayerPanelState();refresh();

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

    try{if(recovery_.worker.valid())recovery_.worker.get();if(recovery_.originId.empty()&&!recovery_.ownedId.empty())project::removeOwnedRecovery(recoveryDirectory(),recovery_.ownedId);}catch(const std::exception& e){closingWorkspace_=false;showSaveError(e);return;}

    recovery_.snapshot.reset();recovery_.ticket.reset();recovery_.cleanup.reset();recovery_.queue=recovery::Scheduler(recoveryPreferences_.minutes);recovery_.ownedId.clear();recovery_.originId.clear();recovery_.suppressed=false;recovery_.ownedIdentity=recovery_.identity=0;

    projects_.erase(projects_.begin()+activeProject_);

    if(!projects_.empty()){restoreProject(projects_.size()-1);}

    else{closedControlStates_.clear();for(auto child:children())closedControlStates_.push_back({child,child->isEnabled()});document=Document::withBuiltinPalette();documentPath_.clear();documentOpen_=false;showHome(true);layoutDocumentTab();}

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

std::filesystem::path Editor::projectFolderSource()const{return documentPath_.empty()?document.sourceFilePath():documentPath_;}

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

    auto next=std::move(*openCandidate_);if(candidateRecovery_)next.markRecovered(next.name()+U"（恢复）");const auto origin=candidateRecovery_?candidateRecoveryId_:std::string{};const auto path=candidateRecovery_?std::filesystem::path():candidatePath_;candidateRecovery_=false;candidateRecoveryId_.clear();openCandidate_.reset();addProject(std::move(next),path);
    if(!origin.empty()){recovery_.originId=origin;recovery_.ownedId=origin;recovery_.ownedIdentity=document.identity();}

    recordHomeRecent(documentPath_.empty()?document.sourceFilePath():documentPath_);

    paletteScrollPixels_=0;paletteFocused_=false;ink_=document.palette().primary;

    status_=U"工程已打开";fitCanvas();if(recentKeepHome_){recentKeepHome_=false;showHome(true);}refresh();if(importAfterOpen_){importAfterOpen_=false;openSheetImport(false);}

  }

bool Editor::sameProjectPath(const std::filesystem::path& a,const std::filesystem::path& b){return !a.empty() && !b.empty() && _wcsicmp(std::filesystem::absolute(a).lexically_normal().c_str(),std::filesystem::absolute(b).lexically_normal().c_str())==0;}

void Editor::openPath(const std::filesystem::path& path) {

    try {
      for(const auto& job:backgroundSaves_)if(sameProjectPath(path,job.path)){if(const auto owner=saveProjectIndex(job.identity))activateProject(*owner);return;}

      ensureProjects();for(std::size_t i=0;i<projects_.size();++i){const auto& saved=i==activeProject_?documentPath_:projects_[i]->path;if(sameProjectPath(path,saved) || sameProjectPath(path,projectDocument(i).sourceFilePath())){activateProject(i);recordHomeRecent(path);return;}}

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
      auto loaded=loading.run([this]{return pending_==Pending::None&&!document.strokeActive()&&!ui::Manager::getDefault()->getCapture();});
      // Another open may finish while this progress overlay is dismissed.
      ensureProjects();for(std::size_t i=0;i<projects_.size();++i){const auto& saved=i==activeProject_?documentPath_:projects_[i]->path;if(sameProjectPath(path,saved)||sameProjectPath(path,projectDocument(i).sourceFilePath())){activateProject(i);recordHomeRecent(path);return;}}
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
 for(std::size_t i=0;i<projects_.size();++i)if((i==activeProject_?document.identity():projects_[i]->stored?projects_[i]->stored->identity():0)==identity)return i;
 return {};
}

bool Editor::backgroundSaveBusy(std::uint64_t identity)const{
 return std::any_of(backgroundSaves_.begin(),backgroundSaves_.end(),[&](const auto& job){return job.identity==identity;});
}

void Editor::dismissSaveProgress(){
 if(pending_!=Pending::Saving)return;
 saveDismissRequested_=true;
 // Snapshot capture reads live storage in bounded ticks. Release editing only
 // after ownership has moved to the encoder; never race capture with a stroke.
 if(!saveWorker_.valid())return;
 BackgroundSave job;job.worker=std::move(saveWorker_);job.path=savingPath_;job.identity=savingIdentity_;job.revision=savingRevision_;job.contentRevision=savingContentRevision_;job.symmetry=savingSymmetryCenter_;job.panel=savingLayerPanelState_;job.ase=savingAseprite_;job.sourceOnly=savingSourceOnly_;job.resume=saveResume_;job.close=closeAfterSave_;backgroundSaves_.push_back(std::move(job));
 closeAfterSave_=false;saveResume_=Pending::None;pending_=Pending::None;restoreSaveControls();
 // A save started from the unsaved-changes prompt captured disabled controls.
 menuBar_->setEnabled(true);paletteActions_->setEnabled(true);for(auto b:commands_)b->setEnabled(true);for(auto b:swatches_)b->setEnabled(true);for(auto b:panelTabs_)b->setEnabled(true);
 discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);dialogClose_->setVisible(false);saveBeforeClose_->setVisible(false);discard_->setVisible(false);keep_->setVisible(false);requestFocus();refresh();
}

void Editor::backgroundSaveTick(){
 // Modal previews and gestures may own live state. Publish at a safe UI boundary.
 if(pending_!=Pending::None||document.active()||document.strokeActive()||ui::Manager::getDefault()->getCapture())return;
 for(std::size_t i=0;i<backgroundSaves_.size();){
  if(backgroundSaves_[i].worker.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready){++i;continue;}
  auto job=std::move(backgroundSaves_[i]);backgroundSaves_.erase(backgroundSaves_.begin()+i);
  try{
   auto result=job.worker.get();const auto owner=saveProjectIndex(job.identity);if(!owner)throw std::runtime_error("Saving project no longer exists");
   auto& value=*owner==activeProject_?document:*projects_[*owner]->stored;
   auto& path=*owner==activeProject_?documentPath_:projects_[*owner]->path;
   auto& recovery=*owner==activeProject_?recovery_:projects_[*owner]->recovery;
   const auto center=value.symmetryCenter();const bool exact=value.revision()==job.revision&&value.contentRevision()==job.contentRevision&&center.x==job.symmetry.x&&center.y==job.symmetry.y&&value.layerPanelState()==job.panel&&!value.active();
   if(job.ase){acceptAsepriteSaved(value,job.path,job.sourceOnly,exact);if(!job.sourceOnly)path=job.path;}
   else{value.acceptSaved(std::move(result.projectId),std::move(result.bytes),exact);path=job.path;}
   status_=value.name()+(exact?U"：工程已保存":U"：已保存先前版本；当前修改尚未保存");recordHomeRecent(job.path);usageStatistics_.recordEvent("save");
   if(!smoke_)try{auto bytes=job.path.parent_path().u8string();if(!bytes.empty())writeExportBytesAtomic(palettePreferencePath().parent_path()/"last-save-directory.txt",{bytes.begin(),bytes.end()});}catch(const std::exception& e){status_+=U"；保存位置偏好记录失败："+unicodeText(e.what());}
   if(exact){
    queuedSaves_.erase(std::remove_if(queuedSaves_.begin(),queuedSaves_.end(),[&](const auto& q){return q.identity==job.identity&&!q.saveAs;}),queuedSaves_.end());
    if(recovery.ownedIdentity==job.identity&&!recovery.ownedId.empty()){
     const auto directory=recoveryDirectory();const auto id=recovery.ownedId;
     recovery.worker=std::async(std::launch::async,[previous=std::move(recovery.worker),directory,id]()mutable{if(previous.valid())previous.get();project::removeOwnedRecovery(directory,id);});recovery.snapshot.reset();recovery.cleanup=std::make_pair(job.identity,id);
    }
   }
   if(job.resume!=Pending::None)deferredSaveCloses_.push_back({job.identity,job.resume,true});
   if(job.close)closeAfterBackgroundSaves_=true;
   refresh();
  }catch(const std::exception& error){
   closeAfterBackgroundSaves_=false;closingWorkspace_=false;deferredSaveCloses_.erase(std::remove_if(deferredSaveCloses_.begin(),deferredSaveCloses_.end(),[&](const auto& c){return c.identity==job.identity;}),deferredSaveCloses_.end());
   const auto context=job.path.u8string()+": "+error.what();showSaveError(std::runtime_error(context));return;
  }
 }
 for(auto it=deferredSaveCloses_.begin();it!=deferredSaveCloses_.end();){
  const auto owner=saveProjectIndex(it->identity);if(!owner){it=deferredSaveCloses_.erase(it);continue;}
  if(backgroundSaveBusy(it->identity)||std::any_of(queuedSaves_.begin(),queuedSaves_.end(),[&](const auto& q){return q.identity==it->identity;})){++it;continue;}
  auto& recovery=*owner==activeProject_?recovery_:projects_[*owner]->recovery;
  if(recovery.worker.valid()&&recovery.worker.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready){++it;continue;}
  const auto intent=*it;deferredSaveCloses_.erase(it);
  if(*owner!=activeProject_&&!projectDocument(*owner).dirty()&&intent.action==Pending::CloseDocument){
   try{if(recovery.worker.valid())recovery.worker.get();if(recovery.originId.empty()&&!recovery.ownedId.empty())project::removeOwnedRecovery(recoveryDirectory(),recovery.ownedId);}catch(const std::exception& e){showSaveError(e);return;}
   projects_.erase(projects_.begin()+*owner);if(*owner<activeProject_)--activeProject_;refresh();return;
  }
  activateProject(*owner);
  if(intent.saveChanges&&document.dirty()){pending_=intent.action;saveProject(false);}
  else ask(intent.action);
  return;
 }
 if(closeAfterBackgroundSaves_&&backgroundSaves_.empty()&&queuedSaves_.empty()&&deferredSaveCloses_.empty()){closeAfterBackgroundSaves_=false;requestClose();}
}

void Editor::saveTick(){
 if(gradientIoDialogOpen_)return;
 backgroundSaveTick();
 if(pending_!=Pending::Saving){
  if(pending_!=Pending::None)return;
  if(document.active()||document.strokeActive()||ui::Manager::getDefault()->getCapture())return;
  // One bounded pass: a deferred owner must not spin by re-enqueuing itself.
  const auto count=queuedSaves_.size();
  for(std::size_t n=0;n<count&&!queuedSaves_.empty();++n){auto next=queuedSaves_.front();queuedSaves_.erase(queuedSaves_.begin());const auto owner=saveProjectIndex(next.identity);if(!owner)continue;if(backgroundSaveBusy(next.identity)||projectDocument(*owner).active()||projectDocument(*owner).strokeActive()){queuedSaves_.push_back(next);continue;}if(*owner!=activeProject_){if(auto recording=projects_[*owner]->stored->recordingSession()){try{recording->beginFlush(*projects_[*owner]->stored);if(!recording->flushReady(*projects_[*owner]->stored)){queuedSaves_.push_back(next);continue;}}catch(const std::exception& error){queuedSaves_.insert(queuedSaves_.begin(),next);closeAfterBackgroundSaves_=false;showSaveError(error);return;}}}saveProject(next.saveAs,next.identity);if(pending_!=Pending::None)return;}
  if(!queuedSaves_.empty()||!backgroundSaves_.empty())return;
  if(queuedSaveResume_!=Pending::None||queuedSaveClose_){auto resume=queuedSaveResume_;bool close=queuedSaveClose_;queuedSaveResume_=Pending::None;queuedSaveClose_=false;pending_=resume;if(pending_!=Pending::None)resolve(true);if(close)requestClose();}
  return;
 }
 try{
  const auto owner=saveProjectIndex(savingIdentity_);if(!owner)throw std::runtime_error("Saving project no longer exists");
  auto& document=*owner==activeProject_?this->document:*projects_[*owner]->stored;
  auto& documentPath_=*owner==activeProject_?this->documentPath_:projects_[*owner]->path;
  auto& recovery_=*owner==activeProject_?this->recovery_:projects_[*owner]->recovery;
  if(saveSnapshot_){
   if(!saveSnapshot_->advance(document,std::chrono::steady_clock::now()+std::chrono::milliseconds(2)))return;
   auto snapshot=std::move(*saveSnapshot_);saveSnapshot_.reset();const auto path=savingPath_;const auto backup=projectBackupPolicy();const bool ase=savingAseprite_;const bool portable=savingPortableTimelapse_;const auto recordingReader=document.recordingSession()?document.recordingSession()->reader():timelapse::Reader{};
   saveWorker_=std::async(std::launch::async,[snapshot=std::move(snapshot),path,backup,ase,portable,recordingReader]()mutable{auto copy=snapshot.finish();if(portable){auto settings=copy.timelapseSettings();for(auto& frame:settings.snapshots){if(recordingReader){frame.data=recordingReader(frame);frame.historyDataBacking.reset();}else if(frame.data.empty())throw std::runtime_error("Cannot carry unavailable recording frames");frame.local.reset();}copy.setImportedTimelapse(std::move(settings));}if(ase){auto bytes=encodeSaveImage(copy,saveImageFormat(path));writeExportBytesAtomic(path,bytes);return project::EncodedProject{};}project::saveDocumentAtomic(copy,path,backup);return project::EncodedProject{copy.sourceArchive(),copy.projectId()};});if(saveDismissRequested_)dismissSaveProgress();return;
  }
  if(!saveWorker_.valid()||saveWorker_.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready)return;
  if(!saveDismissRequested_&&std::chrono::steady_clock::now()-saveStarted_<std::chrono::milliseconds(100))return;
  auto result=saveWorker_.get();if(document.identity()!=savingIdentity_)throw std::runtime_error("Document changed during save");
  const auto center=document.symmetryCenter();
  const bool exact=document.revision()==savingRevision_&&document.contentRevision()==savingContentRevision_&&center.x==savingSymmetryCenter_.x&&center.y==savingSymmetryCenter_.y&&savingLayerPanelState_==document.layerPanelState()&&!document.active();
  if(savingAseprite_){acceptAsepriteSaved(document,savingPath_,savingSourceOnly_,exact);if(!savingSourceOnly_)documentPath_=savingPath_;}
  else{document.acceptSaved(std::move(result.projectId),std::move(result.bytes),exact);documentPath_=savingPath_;}
  status_=exact?U"工程已保存":U"已保存先前版本；当前修改尚未保存";recordHomeRecent(savingPath_);usageStatistics_.recordEvent("save");
  if(!smoke_)try{auto bytes=savingPath_.parent_path().u8string();if(!bytes.empty())writeExportBytesAtomic(palettePreferencePath().parent_path()/"last-save-directory.txt",{bytes.begin(),bytes.end()});}catch(const std::exception& e){status_+=U"；保存位置偏好记录失败："+unicodeText(e.what());}
  if(exact)queuedSaves_.erase(std::remove_if(queuedSaves_.begin(),queuedSaves_.end(),[&](const auto& q){return q.identity==document.identity()&&!q.saveAs;}),queuedSaves_.end());
  if(exact&&recovery_.ownedIdentity==document.identity()&&!recovery_.ownedId.empty()){
   const auto directory=recoveryDirectory();const auto id=recovery_.ownedId;
   recovery_.worker=std::async(std::launch::async,[previous=std::move(recovery_.worker),directory,id]()mutable{if(previous.valid())previous.get();project::removeOwnedRecovery(directory,id);});recovery_.snapshot.reset();recovery_.cleanup=std::make_pair(document.identity(),id);
  }
  const auto resume=saveResume_;const bool close=closeAfterSave_;saveResume_=Pending::None;closeAfterSave_=false;
  pending_=Pending::None;restoreSaveControls();discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);
  if(resume!=Pending::None){menuBar_->setEnabled(true);paletteActions_->setEnabled(true);for(auto b:commands_)b->setEnabled(true);for(auto b:swatches_)b->setEnabled(true);for(auto b:panelTabs_)b->setEnabled(true);deferredSaveCloses_.push_back({document.identity(),resume,true});}
  if(!exact&&(resume!=Pending::None||close))queuedSaves_.push_back({document.identity(),false});
  if(close)closeAfterBackgroundSaves_=true;
  refresh();
 }catch(const std::exception& e){saveSnapshot_.reset();closeAfterSave_=false;closeAfterBackgroundSaves_=false;closingWorkspace_=false;deferredSaveCloses_.erase(std::remove_if(deferredSaveCloses_.begin(),deferredSaveCloses_.end(),[&](const auto& c){return c.identity==savingIdentity_;}),deferredSaveCloses_.end());restoreSaveControls();discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);showSaveError(e);}
}

bool Editor::savePath(const std::filesystem::path& path,bool background,bool sourceOnly,std::uint64_t identity) {
 ensureProjects();const auto owner=saveProjectIndex(identity?identity:document.identity());if(!owner)return false;
 auto& document=*owner==activeProject_?this->document:*projects_[*owner]->stored;
 auto& documentPath_=*owner==activeProject_?this->documentPath_:projects_[*owner]->path;
 auto& recovery_=*owner==activeProject_?this->recovery_:projects_[*owner]->recovery;
 if(document.gradientActive()&&(*owner!=activeProject_||!resolveGradientForIo()))return false;
 const bool ase=saveImageFormat(path)!=SaveImageFormat::Native;

    for(std::size_t i=0;i<projects_.size();++i)if(i!=*owner && (sameProjectPath(path,i==activeProject_?this->documentPath_:projects_[i]->path)||sameProjectPath(path,projectDocument(i).sourceFilePath()))){showSaveError(std::runtime_error("该路径已由另一个打开的工程使用，请选择其它名称"));return false;}

    for(const auto& job:backgroundSaves_)if(job.identity!=document.identity()&&sameProjectPath(path,job.path)){showSaveError(std::runtime_error("该路径正在由另一个工程保存，请选择其它名称"));return false;}

    if(!smoke_ || background || ase || portableTimelapseSave_ || asyncSaveForSmoke_){

      if(pending_==Pending::Saving)return false;

      try{

        document.commitFloatingPaste();if(*owner==activeProject_){if(!flushTimelapse())return false;}else if(auto session=document.recordingSession())session->flush(document);savingPortableTimelapse_=portableTimelapseSave_;portableTimelapseSave_=false;saveResume_=pending_;savingPath_=path;savingAseprite_=ase;savingSourceOnly_=ase&&sourceOnly;savingIdentity_=document.identity();savingRevision_=document.revision();savingContentRevision_=document.contentRevision();

        saveStarted_=std::chrono::steady_clock::now();saveDismissRequested_=*owner!=activeProject_;savingSymmetryCenter_=document.symmetryCenter();savingLayerPanelState_=document.layerPanelState();saveSnapshot_.emplace(document);savingControlStates_.clear();for(auto child:children())savingControlStates_.push_back({child,child->isEnabled()});pending_=Pending::Saving;refresh();

        for(auto child:children())child->setEnabled(false);

        for(auto child:{discard_,keep_,saveBeforeClose_})child->setVisible(false);dialogClose_->setEnabled(true);dialogClose_->setVisible(true);

        invalidate();saveTick();

      }catch(const std::exception& e){saveSnapshot_.reset();restoreSaveControls();showSaveError(e);}

      return false; // Completion owns the pending close/new/open continuation.

    }

    try {document.commitFloatingPaste();if(!flushTimelapse())return false;project::saveDocumentAtomic(document,path);documentPath_=path;status_=U"工程已保存";recordHomeRecent(path);

      if(recovery_.ownedIdentity==document.identity() && !recovery_.ownedId.empty()) {

        try {if(recovery_.worker.valid()){recovery_.worker.get();if(recovery_.ticket)recovery_.queue.complete(*recovery_.ticket,true);recovery_.ticket.reset();}

          project::removeOwnedRecovery(recoveryDirectory(),recovery_.ownedId);if(recovery_.originId==recovery_.ownedId)recovery_.originId.clear();recovery_.ownedId.clear();

        } catch(const std::exception&e){status_=U"工程已保存；恢复清理失败："+unicodeText(e.what());}

      }

      refresh();return true;}

    catch(const std::exception& e) {showSaveError(e);return false;}

  }

bool Editor::saveProject(bool saveAs,std::uint64_t identity) {
 if(!documentOpen_)return false;ensureProjects();const auto owner=saveProjectIndex(identity?identity:document.identity());if(!owner)return false;
 auto& document=*owner==activeProject_?this->document:*projects_[*owner]->stored;
 auto& documentPath_=*owner==activeProject_?this->documentPath_:projects_[*owner]->path;
 if(*owner==activeProject_&&!resolveGradientForIo())return false;
 if(pending_==Pending::Saving||backgroundSaveBusy(document.identity())){queuedSaves_.push_back({document.identity(),saveAs});return false;}
 if(document.active()||document.strokeActive()){if(*owner!=activeProject_){queuedSaves_.push_back({document.identity(),saveAs});return false;}}
 if(*owner==activeProject_){for(auto& picker:pickerColumns_)if(picker.picker)picker.picker->finishInteraction();cancelStroke();}
 document.commitFloatingPaste();if(*owner==activeProject_){if(!flushTimelapse())return false;}else if(auto session=document.recordingSession())session->flush(document);portableTimelapseSave_=false;
 const auto targetPolicy=documentSaveTarget(documentPath_,document.sourceFilePath());
 auto target=targetPolicy?targetPolicy->path:std::filesystem::path{};
 auto format=targetPolicy?targetPolicy->format:SaveImageFormat::Native;const bool sourceImage=format!=SaveImageFormat::Native;
 const bool original=runtimePreferences_.flag("files.saveOriginalFormat");
 if(!saveAs&&!document.dirty()&&!target.empty()&&(sourceImage?original:!documentPath_.empty())){status_=U"工程已保存";refresh();return true;}
 auto decide=[&](bool preferred,const std::vector<std::string>& issues){
  if(format==SaveImageFormat::Psd||format==SaveImageFormat::Ase||format==SaveImageFormat::Aseprite)return confirmAsepriteSave(preferred,issues,format==SaveImageFormat::Psd);
  SaveFormatDecisionDialog popup(font_,skin_,toolIcons_,preferred,issues,saveImageLabel(format));popup.setDisplay(display(),false);auto size=popup.initialSize();auto center=bounds().center();popup.setBounds({center.x-size.w/2,center.y-size.h/2,size.w,size.h});ui::Timer check(40,&popup);
  if(smoke_&&asepriteSaveDecisionForSmoke_){check.Tick.connect([&]{check.stop();popup.smokeChoose(asepriteSaveDecisionForSmoke_(preferred,issues));});check.start();}
  popup.openWindowInForeground();requestFocus();refresh();return popup.result();
 };
 bool forceProject=!original&&(sourceImage||target.empty());
 if(forceProject&&targetPolicy&&!saveAs){if(decide(true,{})!=1)return false;}
 std::vector<std::string> approved;
 auto confirm=[&]()->int{approved=imageSaveIssues(document,format);if(approved.empty())return 2;auto identity=document.identity();int choice=decide(false,approved);if(document.identity()!=identity||!asepriteApprovalCovers(approved,imageSaveIssues(document,format)))throw std::runtime_error("工程在格式确认期间发生变化，请重新保存。");return choice;};
 try{
  if(!saveAs&&sourceImage&&!forceProject){int choice=confirm();if(!choice)return false;if(choice==2){if(const auto current=documentSaveTarget(documentPath_,document.sourceFilePath());!current||current->path!=target||current->format!=format)throw std::runtime_error("保存目标在确认期间发生变化，请重试。");return savePath(target,false,documentPath_.empty(),document.identity());}forceProject=true;}
  if(!saveAs&&!forceProject&&targetPolicy&&!documentPath_.empty())return savePath(target,false,false,document.identity());
  if(forceProject)format=SaveImageFormat::Native;
  else if(target.empty())format=preferredSaveImageFormat(runtimePreferences_.index("files.saveFormat.Select"));
  std::filesystem::path initial=target.empty()?std::filesystem::path(document.name()):target;
  if(initial.filename().empty())initial=L"未命名";
  if(format!=SaveImageFormat::Native)initial=normalizedImageSavePath(initial,format);else initial.replace_extension(L".moonsprite");
  if(format!=SaveImageFormat::Native){int choice=confirm();if(!choice)return false;if(choice==1){format=SaveImageFormat::Native;initial.replace_extension(L".moonsprite");}}
  static constexpr SaveImageFormat filterFormats[]={SaveImageFormat::Native,SaveImageFormat::Aseprite,SaveImageFormat::Psd,SaveImageFormat::Png,SaveImageFormat::Jpeg,SaveImageFormat::Webp,SaveImageFormat::Svg,SaveImageFormat::Ico,SaveImageFormat::Bmp,SaveImageFormat::Gif};
  for(;;){
   wchar_t filename[32768]{};wcsncpy_s(filename,initial.c_str(),_TRUNCATE);
   OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;
   dialog.lpstrFilter=L"MoonSprite 工程\0*.moonsprite\0ASE / ASEPRITE 工程\0*.ase;*.aseprite\0PSD 工程\0*.psd\0PNG 图片\0*.png\0JPEG 图片\0*.jpg;*.jpeg\0WebP 图片\0*.webp\0SVG 图片\0*.svg\0ICO 图标\0*.ico\0BMP 图片\0*.bmp\0GIF 动画\0*.gif\0\0";
   dialog.nFilterIndex=1;for(unsigned i=0;i<10;++i)if(filterFormats[i]==format)dialog.nFilterIndex=i+1;if(format==SaveImageFormat::Ase)dialog.nFilterIndex=2;
   dialog.lpstrDefExt=saveImageExtension(format)+1;
   auto preferred=std::filesystem::u8path(runtimePreferences_.get("files.saveDirectory.Text"));
   if(runtimePreferences_.index("files.saveLocationMode.Select")!=1){std::ifstream in(palettePreferencePath().parent_path()/"last-save-directory.txt",std::ios::binary);std::string value((std::istreambuf_iterator<char>(in)),{});if(!value.empty())preferred=std::filesystem::u8path(value);else preferred=target.parent_path();}
   if(!preferred.empty())dialog.lpstrInitialDir=preferred.c_str();dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;
   if(!chooseSaveFile_(&dialog)){if(CommDlgExtendedError())showSaveError(std::runtime_error("Cannot open save dialog"));return false;}
   if(dialog.nFilterIndex<1||dialog.nFilterIndex>10)throw std::runtime_error("保存格式无效。");
   auto selected=filterFormats[dialog.nFilterIndex-1];
   if(dialog.nFilterIndex==2&&format==SaveImageFormat::Ase)selected=SaveImageFormat::Ase;
   std::filesystem::path path=filename;const auto requested=path;
   if(selected!=SaveImageFormat::Native)path=normalizedImageSavePath(path,selected);
   else {auto lower=path.extension().wstring();for(auto& c:lower)c=std::towlower(c);if(lower!=L".moonsprite")path.replace_extension(L".moonsprite");}
   if(path!=requested&&std::filesystem::exists(path)){showSaveError(std::runtime_error("请选择完整文件名以确认覆盖目标。"));return false;}
   if(selected!=SaveImageFormat::Native){bool changedFormat=format!=selected;format=selected;if(changedFormat||!asepriteApprovalCovers(approved,imageSaveIssues(document,format))){int choice=confirm();if(!choice)return false;if(choice==1){format=SaveImageFormat::Native;initial=path;initial.replace_extension(L".moonsprite");continue;}}return savePath(path,false,false,document.identity());}
   if(saveAs&&!document.timelapseSettings().snapshots.empty()){const int choice=chooseTimelapsePortability();if(!choice)return false;portableTimelapseSave_=choice==2;}
   return savePath(path,false,false,document.identity());
  }
 }catch(const std::exception& e){showSaveError(e);return false;}
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
      const auto result=slot.recovery.tick(*slot.stored,recoveryPreferences_,recoveryDirectory(),force);
      if(!result.error.empty()){status_=(result.cleanupFailure?U"工程已保存；恢复清理失败：":U"自动恢复保存失败：")+unicodeText(result.error);invalidate();}
    }
}
void Editor::activeRecoveryTick(bool force) {
    if((pending_==Pending::Saving || smoke_) && !force)return;
    const auto result=recovery_.tick(document,recoveryPreferences_,recoveryDirectory(),force);
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
      openCandidate_=loading.run([this]{return pending_==Pending::None&&!document.strokeActive()&&!ui::Manager::getDefault()->getCapture();});candidateRecovery_=true;candidateRecoveryId_=id;ask(Pending::Open);
      if(report->droppedTimelapseFrames){status_=timelapseRestoreWarning(*report);refresh();}
    }catch(const std::exception& e){showSaveError(e);errorTitle_=U"无法恢复工程";}
}

void Editor::setRecoveryPreferences(recovery::Preferences preferences) {

    try {preferences=recovery::normalizePreferences(preferences);if(!smoke_)recovery::savePreferencesAtomic(recoveryDirectory().parent_path()/"recovery-preferences.txt",preferences);recoveryPreferences_=preferences;for(auto& slot:projects_){slot->recovery.queue.setIntervalMinutes(preferences.minutes);slot->recovery.due=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(preferences.minutes*60000));}recovery_.queue.setIntervalMinutes(preferences.minutes);recovery_.due=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(preferences.minutes*60000));status_=U"恢复设置已保存";refresh();}

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

void Editor::chooseProject() {

    wchar_t filename[32768]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);

    dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;

    // Legacy platform_dialogs.rs::open_files exposes the existing readers,
    // instead of restricting the chooser to the native project suffix.
    // PSD follows the same candidate-document loading and error protection.
    dialog.lpstrTitle=L"打开文件";
    dialog.lpstrFilter=L"当前支持的文件\0*.moonsprite;*.moonsprite.bak;*.ase;*.aseprite;*.psd;*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif\0Aseprite / PSD 工程\0*.ase;*.aseprite;*.psd\0MoonSprite 工程与备份\0*.moonsprite;*.moonsprite.bak\0图片\0*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif\0\0";
    dialog.nFilterIndex=1;

    dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_FILEMUSTEXIST|OFN_ALLOWMULTISELECT;

    if(GetOpenFileNameW(&dialog)){
      const std::filesystem::path first(filename);const wchar_t* next=filename+wcslen(filename)+1;
      std::vector<std::filesystem::path> paths;if(!*next)paths.push_back(first);else for(;*next;next+=wcslen(next)+1)paths.push_back(first/next);
      // The same batch failure policy as desktop drop: successful siblings
      // remain open, and a corrupt file does not discard later selections.
      std::u32string failures;
      image_sequence::Host host;
      host.open=[this,&failures](const std::string& path){openPath(std::filesystem::u8path(path));if(pending_!=Pending::OpenError)return pending_==Pending::None;if(!failures.empty())failures+=U"\n";failures+=unicodeText(path)+U"："+openError_;resolve(false);return false;};
      host.add=[this](Document value){addProject(std::move(value));};
      host.error=[&failures](const std::string& error){if(!failures.empty())failures+=U"\n";failures+=unicodeText(error);};
      std::vector<std::string> sequencePaths;for(const auto& path:paths)sequencePaths.push_back(path.u8string());
      openImageSequenceDocuments(font_,skin_,toolIcons_,display(),bounds(),palettePreferencePath().parent_path()/"image-sequence-v1.txt",sequencePaths,std::move(host),{},[this]{return pending_==Pending::None&&!document.strokeActive()&&!ui::Manager::getDefault()->getCapture();});
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

    int geometryPhase=0;std::vector<gfx::Color> incremental;

    std::unique_ptr<ui::Timer> timer;if(verify||smoke_){timer=std::make_unique<ui::Timer>(80,&popup);timer->Tick.connect([&]{

      if(!verify){timer->stop();popup.closeWindow(nullptr);return;}

      auto surface=popup.display()->nativeSurface();const int pixels=surface->width()*surface->height();

      if(geometryPhase<18){const int phase=geometryPhase++%3;

        if(phase==0){popup.smokeGeometryStep((geometryPhase-1)/3);return;}

        if(phase==1){incremental.resize(pixels);{os::SurfaceLock lock(surface.get());for(int y=0;y<surface->height();++y)for(int x=0;x<surface->width();++x)incremental[y*surface->width()+x]=surface->getPixel(x,y);}popup.manager()->invalidate();return;}

        {os::SurfaceLock lock(surface.get());for(int y=0;y<surface->height();++y)for(int x=0;x<surface->width();++x)if(incremental[y*surface->width()+x]!=surface->getPixel(x,y))throw std::runtime_error("Popup incremental/full redraw mismatch phase="+std::to_string(geometryPhase/3)+" at "+std::to_string(x)+","+std::to_string(y));}return;

      }

      timer->stop();writeSmokeFrame(surface.get(),assets_.parent_path()/"new-document-dialog.bmp");popup.smoke();

    });timer->start();}

    popup.openWindowInForeground();requestFocus();refresh();

  }

void Editor::requestClose() {if(gradientIoDialogOpen_)return;if(DocumentLoadingDialog::deferClose([this]{requestClose();}))return;if(!resolveGradientForIo())return;flushBrushSizePreferences();if(!backgroundSaves_.empty()||!queuedSaves_.empty()){closeAfterBackgroundSaves_=true;return;}if(pending_==Pending::Saving){closeAfterSave_=true;return;}ask(Pending::Close);}

}
