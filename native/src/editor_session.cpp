#include "aseprite_save_policy.h"
#include "aseprite_io.h"
#include "editor_implementation.h"
#include "editor.h"
#include "timelapse_session.h"

namespace moon::editor {

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

    auto& slot=*projects_[activeProject_];slot.path=documentPath_;slot.canvas=canvas_;slot.zoom=zoom_;slot.rotation=viewRotation_;saveDocumentView();

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

    recovery_.queue.setIntervalMinutes(recoveryPreferences_.minutes);revealProjectTab_=true;viewRotation_={};fitCanvas();loadDocumentView();refresh();

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

    try{if(recovery_.worker.valid())recovery_.worker.get();if(!recovery_.ownedId.empty())project::removeOwnedRecovery(recoveryDirectory(),recovery_.ownedId);}catch(const std::exception& e){closingWorkspace_=false;showSaveError(e);return;}

    recovery_.snapshot.reset();recovery_.ticket.reset();recovery_.cleanup.reset();recovery_.queue=recovery::Scheduler(recoveryPreferences_.minutes);recovery_.ownedId.clear();recovery_.ownedIdentity=recovery_.identity=0;

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

    auto next=std::move(*openCandidate_);if(candidateRecovery_)next.markRecovered(next.name()+U"（恢复）");const auto path=candidateRecovery_?std::filesystem::path():candidatePath_;candidateRecovery_=false;openCandidate_.reset();addProject(std::move(next),path);

    recordHomeRecent(documentPath_.empty()?document.sourceFilePath():documentPath_);

    paletteScrollPixels_=0;paletteFocused_=false;ink_=document.palette().primary;

    status_=U"工程已打开";fitCanvas();if(recentKeepHome_){recentKeepHome_=false;showHome(true);}refresh();if(importAfterOpen_){importAfterOpen_=false;openSheetImport(false);}

  }

bool Editor::sameProjectPath(const std::filesystem::path& a,const std::filesystem::path& b){return !a.empty() && !b.empty() && _wcsicmp(std::filesystem::absolute(a).lexically_normal().c_str(),std::filesystem::absolute(b).lexically_normal().c_str())==0;}

void Editor::openPath(const std::filesystem::path& path) {

    try {

      ensureProjects();for(std::size_t i=0;i<projects_.size();++i){const auto& saved=i==activeProject_?documentPath_:projects_[i]->path;if(sameProjectPath(path,saved) || sameProjectPath(path,projectDocument(i).sourceFilePath())){activateProject(i);recordHomeRecent(path);return;}}

      auto ext=path.extension().wstring();std::transform(ext.begin(),ext.end(),ext.begin(),[](wchar_t c){return ::towlower(c);});

      if(ext==L".ase"||ext==L".aseprite"){openCandidate_=openAseprite(path);openCandidate_->setSourceFilePath(path);candidatePath_.clear();candidateRecovery_=false;ask(Pending::Open);status_=U"已打开 ASE；沿用原格式保存时将保存回源文件。";return;}
      if(ext==L".gif" || ext==L".png" || ext==L".jpg" || ext==L".jpeg" || ext==L".bmp" || ext==L".webp"){

        auto image=ext==L".gif"?openGifAnimation(path):openRasterImage(path);image.setSourceFilePath(path);openCandidate_=std::move(image);candidatePath_.clear();candidateRecovery_=false;ask(Pending::Open);return;

      }

      const project::Limits limits;

      std::ifstream file(path,std::ios::binary|std::ios::ate);

      if(!file) throw std::runtime_error("Cannot read project file");

      const auto size=file.tellg();

      if(size<0 || std::uint64_t(size)>limits.archiveBytes) throw project::Error(project::ErrorKind::Limit,"Project exceeds read budget");

      auto bytes=std::make_shared<project::Bytes>(std::size_t(size));file.seekg(0);

      if(!file.read(reinterpret_cast<char*>(bytes->data()),std::streamsize(bytes->size()))) throw std::runtime_error("Incomplete project read");

      auto imported=project::prepareEditableImport(project::readProjectManifest(bytes,limits));

      PaletteState palette;palette.entries.clear();palette.slots=std::move(imported.palette.slots);palette.nextId=imported.palette.nextId;palette.columns=imported.palette.columns;

      for(auto& e:imported.palette.entries) palette.entries.push_back({e.id,std::move(e.name),e.color});

      openCandidate_=Document::fromImported(imported.width,imported.height,std::move(imported.timeline),std::move(palette),std::move(imported.id),std::move(imported.name),std::move(imported.sourceArchive));openCandidate_->setImportedProjectInformation(imported.information);openCandidate_->setImportedReferenceImages(std::move(imported.referenceImages));openCandidate_->setImportedSlices(std::move(imported.slices));openCandidate_->setImportedTimelapse(std::move(imported.timelapse));openCandidate_->setImportedProjectBrushes(std::move(imported.customBrushes));openCandidate_->selectLayer(imported.activeLayerId);openCandidate_->selectFrame(imported.activeFrameId);openCandidate_->setImportedLoop(imported.loop);openCandidate_->setPixelGrid(imported.showPixelGrid,false);openCandidate_->setCustomGrid(imported.showCustomGrid,imported.customGrid,false);if(imported.symmetryCenter)openCandidate_->setSymmetryCenter({imported.symmetryCenter->first,imported.symmetryCenter->second},false);

      openCandidate_->setSourceFilePath(path);candidatePath_=path;candidateRecovery_=false;ask(Pending::Open);

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

void Editor::saveTick(){
 if(pending_!=Pending::Saving){
  if(pending_!=Pending::None)return;
  while(!queuedSaves_.empty()){auto next=queuedSaves_.front();queuedSaves_.erase(queuedSaves_.begin());if(next.identity!=document.identity())continue;saveProject(next.saveAs);if(pending_!=Pending::None)return;}
  if(queuedSaveResume_!=Pending::None||queuedSaveClose_){auto resume=queuedSaveResume_;bool close=queuedSaveClose_;queuedSaveResume_=Pending::None;queuedSaveClose_=false;pending_=resume;if(pending_!=Pending::None)resolve(true);if(close)requestClose();}
  return;
 }
 try{
  if(saveSnapshot_){
   if(!saveSnapshot_->advance(document,std::chrono::steady_clock::now()+std::chrono::milliseconds(2)))return;
   auto snapshot=std::move(*saveSnapshot_);saveSnapshot_.reset();const auto path=savingPath_;const auto backup=projectBackupPolicy();const bool ase=savingAseprite_;const bool portable=savingPortableTimelapse_;const auto recordingReader=document.recordingSession()?document.recordingSession()->reader():timelapse::Reader{};
   saveWorker_=std::async(std::launch::async,[snapshot=std::move(snapshot),path,backup,ase,portable,recordingReader]()mutable{auto copy=snapshot.finish();if(portable){auto settings=copy.timelapseSettings();for(auto& frame:settings.snapshots){if(recordingReader)frame.data=recordingReader(frame);else if(frame.data.empty())throw std::runtime_error("Cannot carry unavailable recording frames");frame.local.reset();}copy.setImportedTimelapse(std::move(settings));}if(ase){auto bytes=encodeAseprite(copy,100);writeExportBytesAtomic(path,bytes);return project::EncodedProject{};}project::saveDocumentAtomic(copy,path,backup);return project::EncodedProject{copy.sourceArchive(),copy.projectId()};});return;
  }
  if(!saveWorker_.valid()||saveWorker_.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready)return;
  auto result=saveWorker_.get();if(document.identity()!=savingIdentity_)throw std::runtime_error("Document changed during save");
  const bool exact=document.revision()==savingRevision_&&document.contentRevision()==savingContentRevision_&&!document.active();
  if(savingAseprite_){acceptAsepriteSaved(document,savingPath_,savingSourceOnly_,exact);if(!savingSourceOnly_)documentPath_=savingPath_;}
  else{if(!exact)throw std::runtime_error("Document changed during save");document.acceptSaved(std::move(result.projectId),std::move(result.bytes));documentPath_=savingPath_;}
  status_=exact?U"工程已保存":U"已保存先前版本；当前修改尚未保存";recordHomeRecent(savingPath_);usageStatistics_.recordEvent("save");
  if(!smoke_)try{auto bytes=savingPath_.parent_path().u8string();if(!bytes.empty())writeExportBytesAtomic(palettePreferencePath().parent_path()/"last-save-directory.txt",{bytes.begin(),bytes.end()});}catch(const std::exception& e){status_+=U"；保存位置偏好记录失败："+unicodeText(e.what());}
  if(exact)queuedSaves_.erase(std::remove_if(queuedSaves_.begin(),queuedSaves_.end(),[&](const auto& q){return q.identity==document.identity()&&!q.saveAs;}),queuedSaves_.end());
  if(exact&&recovery_.ownedIdentity==document.identity()&&!recovery_.ownedId.empty()){
   const auto directory=recoveryDirectory();const auto id=recovery_.ownedId;
   recovery_.worker=std::async(std::launch::async,[previous=std::move(recovery_.worker),directory,id]()mutable{if(previous.valid())previous.get();project::removeOwnedRecovery(directory,id);});recovery_.snapshot.reset();recovery_.cleanup=std::make_pair(document.identity(),id);
  }
  pending_=saveResume_;restoreSaveControls();discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);const bool close=closeAfterSave_;closeAfterSave_=false;
  if(!exact&&(pending_!=Pending::None||close)){queuedSaveClose_=queuedSaveClose_||close;queuedSaveResume_=pending_;pending_=Pending::None;queuedSaves_.push_back({document.identity(),false});}
  if(!queuedSaves_.empty()){if(pending_!=Pending::None)queuedSaveResume_=pending_;queuedSaveClose_=queuedSaveClose_||close;pending_=Pending::None;refresh();return;}
  if(pending_!=Pending::None)resolve(true);else refresh();if(close)requestClose();
 }catch(const std::exception& e){saveSnapshot_.reset();closeAfterSave_=false;restoreSaveControls();discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);showSaveError(e);}
}

bool Editor::savePath(const std::filesystem::path& path,bool background,bool sourceOnly) {
 const bool ase=isAsepriteSavePath(path);

    for(std::size_t i=0;i<projects_.size();++i)if(i!=activeProject_ && (sameProjectPath(path,projects_[i]->path)||sameProjectPath(path,projectDocument(i).sourceFilePath()))){showSaveError(std::runtime_error("该路径已由另一个打开的工程使用，请选择其它名称"));return false;}

    if(!smoke_ || background || ase || portableTimelapseSave_){

      if(pending_==Pending::Saving)return false;

      try{

        document.commitFloatingPaste();if(!flushTimelapse())return false;savingPortableTimelapse_=portableTimelapseSave_;portableTimelapseSave_=false;saveResume_=pending_;savingPath_=path;savingAseprite_=ase;savingSourceOnly_=ase&&sourceOnly;savingIdentity_=document.identity();savingRevision_=document.revision();savingContentRevision_=document.contentRevision();

        saveSnapshot_.emplace(document);savingControlStates_.clear();for(auto child:children())savingControlStates_.push_back({child,child->isEnabled()});pending_=Pending::Saving;refresh();

        for(auto child:children())child->setEnabled(false);

        for(auto child:{discard_,keep_,dialogClose_,saveBeforeClose_})child->setVisible(false);

        invalidate();saveTick();

      }catch(const std::exception& e){saveSnapshot_.reset();restoreSaveControls();showSaveError(e);}

      return false; // Completion owns the pending close/new/open continuation.

    }

    try {document.commitFloatingPaste();if(!flushTimelapse())return false;project::saveDocumentAtomic(document,path);documentPath_=path;status_=U"工程已保存";recordHomeRecent(path);

      if(recovery_.ownedIdentity==document.identity() && !recovery_.ownedId.empty()) {

        try {if(recovery_.worker.valid()){recovery_.worker.get();if(recovery_.ticket)recovery_.queue.complete(*recovery_.ticket,true);recovery_.ticket.reset();}

          project::removeOwnedRecovery(recoveryDirectory(),recovery_.ownedId);recovery_.ownedId.clear();

        } catch(const std::exception&e){status_=U"工程已保存；恢复清理失败："+unicodeText(e.what());}

      }

      refresh();return true;}

    catch(const std::exception& e) {showSaveError(e);return false;}

  }

bool Editor::saveProject(bool saveAs) {
 if(pending_==Pending::Saving){queuedSaves_.push_back({document.identity(),saveAs});return false;}
 if(!documentOpen_)return false;
 for(auto& picker:pickerColumns_)if(picker.picker)picker.picker->finishInteraction();cancelStroke();document.commitFloatingPaste();if(!flushTimelapse())return false;portableTimelapseSave_=false;
 auto target=documentPath_.empty()?document.sourceFilePath():documentPath_;
 const bool original=runtimePreferences_.flag("files.saveOriginalFormat");
 const bool sourceAse=isAsepriteSavePath(target);
 if(!saveAs&&!document.dirty()&&!target.empty()&&(sourceAse?original:!documentPath_.empty())){status_=U"工程已保存";refresh();return true;}
 bool forceProject=!original&&(sourceAse||target.empty());
 if(forceProject&&!saveAs){if(confirmAsepriteSave(true,{})!=1)return false;}
 std::vector<std::string> approved;
 auto confirm=[&]()->int{approved=asepriteSaveIssues(document);if(approved.empty())return 2;auto identity=document.identity();int choice=confirmAsepriteSave(false,approved);if(document.identity()!=identity||!asepriteApprovalCovers(approved,asepriteSaveIssues(document)))throw std::runtime_error("工程在格式确认期间发生变化，请重新保存。");return choice;};
 try{
  if(!saveAs&&sourceAse&&!forceProject){int choice=confirm();if(!choice)return false;if(choice==2){if(target!=(documentPath_.empty()?document.sourceFilePath():documentPath_))throw std::runtime_error("保存目标在确认期间发生变化，请重试。");return savePath(target,false,documentPath_.empty());}forceProject=true;}
  if(!saveAs&&!forceProject&&!documentPath_.empty())return savePath(documentPath_);
  bool ase=!forceProject&&(sourceAse||(target.empty()&&(runtimePreferences_.index("files.saveFormat.Select")==7||runtimePreferences_.index("files.saveFormat.Select")==8)));
  std::filesystem::path initial=target.empty()?std::filesystem::path(document.name()):target;
  if(initial.filename().empty())initial=L"未命名";
  if(ase)initial=normalizedAsepriteSavePath(initial,runtimePreferences_.index("files.saveFormat.Select")==7?L".ase":L".aseprite");else initial.replace_extension(L".moonsprite");
  if(ase){int choice=confirm();if(!choice)return false;if(choice==1){ase=false;initial.replace_extension(L".moonsprite");}}
  for(;;){
   wchar_t filename[32768]{};wcsncpy_s(filename,initial.c_str(),_TRUNCATE);
   OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;
   dialog.lpstrFilter=L"MoonSprite 工程\0*.moonsprite\0ASE / ASEPRITE 工程\0*.ase;*.aseprite\0\0";dialog.nFilterIndex=ase?2:1;dialog.lpstrDefExt=ase?L"aseprite":L"moonsprite";
   auto preferred=std::filesystem::u8path(runtimePreferences_.get("files.saveDirectory.Text"));
   if(runtimePreferences_.index("files.saveLocationMode.Select")!=1){std::ifstream in(palettePreferencePath().parent_path()/"last-save-directory.txt",std::ios::binary);std::string value((std::istreambuf_iterator<char>(in)),{});if(!value.empty())preferred=std::filesystem::u8path(value);else preferred=target.parent_path();}
   if(!preferred.empty())dialog.lpstrInitialDir=preferred.c_str();dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;
   if(!chooseSaveFile_(&dialog)){if(CommDlgExtendedError())showSaveError(std::runtime_error("Cannot open save dialog"));return false;}
   std::filesystem::path path=filename;
   bool selectedAse=dialog.nFilterIndex==2;
   auto requested=path;
   if(selectedAse)path=normalizedAsepriteSavePath(path,ase&&isAsepriteSavePath(initial)?initial.extension().c_str():L".aseprite");else if(path.extension()!=L".moonsprite"){auto lower=path.extension().wstring();std::transform(lower.begin(),lower.end(),lower.begin(),[](wchar_t c){return std::towlower(c);});if(lower!=L".moonsprite")path.replace_extension(L".moonsprite");}
   if(path!=requested&&std::filesystem::exists(path)){showSaveError(std::runtime_error("请选择完整文件名以确认覆盖目标。"));return false;}
   if(selectedAse){if(!ase||!asepriteApprovalCovers(approved,asepriteSaveIssues(document))){int choice=confirm();if(!choice)return false;if(choice==1){ase=false;initial=path;initial.replace_extension(L".moonsprite");continue;}}return savePath(path,false,false);}
   if(saveAs&&!document.timelapseSettings().snapshots.empty()){const int choice=chooseTimelapsePortability();if(!choice)return false;portableTimelapseSave_=choice==2;}
   return savePath(path);
  }
 }catch(const std::exception& e){showSaveError(e);return false;}
}

std::filesystem::path Editor::recoveryDirectory() {

    if(!recoveryDirectory_.empty())return recoveryDirectory_;

    wchar_t local[32768]{};GetEnvironmentVariableW(L"LOCALAPPDATA",local,32768);

    return std::filesystem::path(local)/L"MoonSprite"/L"Native"/L"recovery";

  }

void Editor::recoveryTick(bool force) {
    if(homeOpen_ && !homeBanners_.empty() && std::chrono::steady_clock::now()>=homeBannerDue_){homeBanner_=(homeBanner_+1)%int(homeBanners_.size());homeBannerDue_=std::chrono::steady_clock::now()+std::chrono::seconds(8);invalidate();}
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

    try {auto file=std::ifstream(archive,std::ios::binary|std::ios::ate);if(!file)throw std::runtime_error("Cannot read recovery");const auto length=file.tellg();if(length<0 || std::uint64_t(length)>project::Limits{}.archiveBytes)throw std::runtime_error("Recovery size exceeds budget");auto bytes=std::make_shared<project::Bytes>(std::size_t(length));file.seekg(0);file.read(reinterpret_cast<char*>(bytes->data()),std::streamsize(bytes->size()));auto imported=project::prepareEditableImport(project::readProjectManifest(bytes));PaletteState palette;palette.entries.clear();palette.slots=imported.palette.slots;palette.nextId=imported.palette.nextId;palette.columns=imported.palette.columns;for(auto& e:imported.palette.entries)palette.entries.push_back({e.id,std::move(e.name),e.color});openCandidate_=Document::fromImported(imported.width,imported.height,std::move(imported.timeline),std::move(palette),std::move(imported.id),name,imported.sourceArchive);openCandidate_->setImportedProjectInformation(imported.information);openCandidate_->setImportedReferenceImages(std::move(imported.referenceImages));openCandidate_->setImportedSlices(std::move(imported.slices));openCandidate_->setImportedTimelapse(std::move(imported.timelapse));openCandidate_->setImportedProjectBrushes(std::move(imported.customBrushes));openCandidate_->selectLayer(imported.activeLayerId);openCandidate_->selectFrame(imported.activeFrameId);openCandidate_->setImportedLoop(imported.loop);openCandidate_->setPixelGrid(imported.showPixelGrid,false);openCandidate_->setCustomGrid(imported.showCustomGrid,imported.customGrid,false);if(imported.symmetryCenter)openCandidate_->setSymmetryCenter({imported.symmetryCenter->first,imported.symmetryCenter->second},false);candidateRecovery_=true;ask(Pending::Open);}catch(const std::exception&e){showSaveError(e);errorTitle_=U"无法恢复工程";}}

void Editor::setRecoveryPreferences(recovery::Preferences preferences) {

    try {preferences=recovery::normalizePreferences(preferences);if(!smoke_)recovery::savePreferencesAtomic(recoveryDirectory().parent_path()/"recovery-preferences.txt",preferences);recoveryPreferences_=preferences;for(auto& slot:projects_){slot->recovery.queue.setIntervalMinutes(preferences.minutes);slot->recovery.due=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(preferences.minutes*60000));}recovery_.queue.setIntervalMinutes(preferences.minutes);recovery_.due=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(preferences.minutes*60000));status_=U"恢复设置已保存";refresh();}

    catch(const std::exception&e){showSaveError(e);errorTitle_=U"恢复设置保存失败";}

  }

void Editor::loadRecoveries(bool startup) {

    if(!recoveryCatalog_.beginLoad(startup))return;

    try {recoveryCatalog_.loaded(project::listRecoveryRecords(recoveryDirectory()));if(recoveryCatalog_.visible())status_=U"发现可恢复工程 · 文件 → 恢复工程";}

    catch(const std::exception&e){recoveryCatalog_.loadFailed(e.what());status_=U"读取恢复记录失败："+unicodeText(e.what());}

    refresh();

  }

void Editor::chooseRecovery() {

    loadRecoveries();const auto dir=recoveryDirectory();auto records=recoveryCatalog_.rows();if(records.empty()){status_=U"没有可恢复工程";refresh();return;}PixelMenu popup(skin_);for(const auto& r:records){bool stale=false;try{const auto now=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();stale=recovery::retentionStale(std::stoll(r.updatedAt),now,recoveryPreferences_.retentionDays);}catch(const std::exception&){}auto item=new PixelMenuItem(font_,skin_,unicodeText(r.name)+(stale?U" · 超过保留期":U""));item->Click.connect([this,dir,r]{restoreRecovery(dir/std::filesystem::u8path(r.id+".moonsprite"),r.id,unicodeText(r.name));});popup.addChild(item);}popup.showPopup(gfx::Point(bounds().x+8,bounds().y+36),display());

  }

void Editor::chooseProject() {

    wchar_t filename[32768]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);

    dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;

    dialog.lpstrFilter=L"MoonSprite 工程\0*.moonsprite\0\0";

    dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_FILEMUSTEXIST|OFN_ALLOWMULTISELECT;

    if(GetOpenFileNameW(&dialog)){const std::filesystem::path first(filename);const wchar_t* next=filename+wcslen(filename)+1;if(!*next)openPath(first);else for(;*next;next+=wcslen(next)+1){openPath(first/next);if(pending_!=Pending::None)break;}}

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

void Editor::requestClose() {flushBrushSizePreferences();if(pending_==Pending::Saving){closeAfterSave_=true;return;}ask(Pending::Close);}

}
