#include "editor.h"
#include "interaction_profile.h"
#include "task_poll_schedule.h"
#include "animation_settings.h"
#include "color_picker_scheme_ui.h"
#include "pixel_text_area.h"
#include "project_import.h"
#include "project_file.h"
#include "image_sequence_dialog.h"
#include "aseprite_io.h"
#include "psd_import.h"
#include "image_resize_task.h"
#include "lua_script_service.h"
#include "tool_property_popup.h"
#include "loop_number_entry.h"
#include "frame_duration_palette_entry.h"
#include "layer_label_separator.h"
#include "preview_panel.h"
#include "floating_column_surface.h"
#include "dialog_background.h"
#include "lua_script_window_host.h"
#include "lua_mse_snapshot.h"
#include "extension_menu_adapter.h"

namespace moon::editor {
namespace {
// ui::Menu::OpenPopup fires for showPopup(), while a menu-bar submenu opens
// through kOpenMessage. Adapt only script discovery to that native lifecycle.
class ScriptDiscoveryMenu final:public PixelMenu {
public:
 using PixelMenu::PixelMenu;
 bool onProcessMessage(ui::Message* message)override{if(message->type()==ui::kOpenMessage)OpenPopup();return PixelMenu::onProcessMessage(message);}
};
}

Editor::~Editor() {panelStateTimer_.stop();flushColorRoles();colorRolesTimer_.stop();stopScripts();imageResizeTimer_.stop();imageResizeTask_.reset();importSheetTimer_.stop();importSheetTask_.reset();saveLayerPanelState(true);closeParameterRange();if(dynamicsPopup_){dynamicsPopup_->closeWindow(nullptr);dynamicsPopup_.reset();}workspacePresetTimer_.stop();flushWorkspacePresetSave();diagnosticTimer_.stop();if(diagnostics_){diagnostics_->record("session","native.stopped");diagnostics_->flush();diagnostics_.reset();}saveDocumentView();usageStatistics_.flush();persistUsageStatistics();advancedNoticeTimer_.stop();thumbnailQueue_.reset();thumbnailTimer_.stop();if(colorEditorPopup_){colorEditorPopup_->closeWindow(nullptr);colorEditorPopup_.reset();}flushBrushSizePreferences();if(framePngProgress_)framePngProgress_.cancel();floatingViewportSaveTimer_.stop();cancelGradientMapJob();stopAntiAlias();stopConvolution();if(propertyRangePopup_){propertyRangePopup_->closeWindow(nullptr);propertyRangePopup_.reset();}celNavigationTimer_.stop();if(toolFlyout_){toolFlyout_->closeWindow(nullptr);toolFlyout_.reset();}antsTimer_.stop();sizeTimer_.stop();if(recoveryTimer_){recoveryTimer_->stop();delete recoveryTimer_;}if(currentRecovery().worker.valid())currentRecovery().worker.wait();}

Editor::Editor(const PixelFont& font,Skin& skin,std::filesystem::path assets,std::function<void()> refreshCursor,std::filesystem::path recoveryRoot,bool skipWorkspaceRestore)

    : ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),assets_(std::move(assets)),refreshCursor_(std::move(refreshCursor)),skipWorkspaceRestore_(skipWorkspaceRestore) {

    bindProjectDocument(activeDocument_);

    openSheetOutput_=[this](const auto& path){openPath(path);for(std::size_t i=0;i<projects_.size();++i)if(sameProjectPath(path,projectDocument(i).sourceFilePath())||sameProjectPath(path,i==activeProject_?currentPath():projects_[i]->path))return;throw std::runtime_error(utf8Text(status_));};
      projectFolderLauncher_=[](const std::filesystem::path& directory){

    // Structured Windows Shell API: the directory is never parsed as a command.

    SHELLEXECUTEINFOW action{};action.cbSize=sizeof(action);action.fMask=SEE_MASK_FLAG_NO_UI;

    action.lpVerb=L"open";action.lpFile=directory.c_str();action.nShow=SW_SHOWNORMAL;

    if(!ShellExecuteExW(&action))throw std::runtime_error("无法打开工程文件夹 (Windows "+std::to_string(GetLastError())+")");

  };

    CelThumbnailScheduler scheduler;

    scheduler.postDeferred=[this](std::function<void()> callback){const auto handle=++thumbnailHandle_;thumbnailDeferred_.emplace(handle,std::move(callback));thumbnailTimer_.start();return handle;};

    scheduler.cancelDeferred=[this](std::uint64_t handle){thumbnailDeferred_.erase(handle);if(thumbnailDeferred_.empty())thumbnailTimer_.stop();};

    scheduler.nowMs=[]{return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count();};

    thumbnailQueue_=std::make_unique<CelThumbnailQueue>(std::move(scheduler));

    thumbnailTimer_.Tick.connect([this]{thumbnailTimer_.stop();if(thumbnailDeferred_.empty())return;auto first=thumbnailDeferred_.begin();auto callback=std::move(first->second);thumbnailDeferred_.erase(first);try{callback();}catch(const std::exception& e){status_=U"缩略图失败："+unicodeText(e.what());}if(!thumbnailDeferred_.empty())thumbnailTimer_.start();});

    floatingViewportSaveTimer_.Tick.connect([this]{floatingViewportSaveTimer_.stop();saveWorkspaceSizes();});
    advancedNoticeTimer_.Tick.connect([this]{advancedNoticeTimer_.stop();advancedNotice_=false;invalidate();});

    recoveryDirectory_=std::move(recoveryRoot);

    setFocusStop(true); setExpansive(true);

    loopTrackTimer_.Tick.connect([this]{if(loopTrackDrag_){if(!hasCapture())finishLoopTrackResize(true);else updateLoopTrackResize(loopTrackDrag_->pointer,true);}});

    timelineScrollTimer_.Tick.connect([this]{if(timelineGesture_.kind){if(!hasCapture())finishTimelineGesture(true);else updateTimelineGesture(timelineGesture_.pointer,timelineGesture_.copy,true);}});

    antsTimer_.Tick.connect([this]{

      if(!currentView().showSelectionOutline || !currentDocument().selection() || !documentOpen_ || homeOpen_ || !isVisible()){antsTimer_.stop();return;}

      antsOffset_=(antsOffset_+1)&7;
      if(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off){invalidateRect(canvasViewport());return;}

      const auto& s=*currentDocument().selection();const double scale=canvasScale();

      auto dirty=gfx::Rect(int(std::floor(currentView().canvas.x+s.x*scale))-2,int(std::floor(currentView().canvas.y+s.y*scale))-2,

        int(std::ceil(s.width*scale))+5,int(std::ceil(s.height*scale))+5);

      dirty&=canvasViewport();invalidateRect(dirty);

    });

    celNavigationTimer_.Tick.connect([this]{celNavigationTick(std::chrono::steady_clock::now());});

    auto scroll=[this](bool vertical){auto bar=new DialogBackground<PixelScrollBar>(skin_,vertical);configureDialogBackground(bar);addChild(bar);return bar;};

    railScrollBar_=scroll(true);railScrollBar_->changed=[this](int value){railScrollPixels_=value;layoutToolRail();invalidate();};railVerticalScrollBar_=railScrollBar_;railHorizontalScrollBar_=scroll(false);railHorizontalScrollBar_->changed=[this](int value){railScrollPixels_=value;layoutToolRail();invalidate();};railHorizontalScrollBar_->setVisible(false);

    timelineHorizontal_=scroll(false);timelineVertical_=scroll(true);timelineHorizontal_->setMaterialOpacity(96,204);timelineVertical_->setMaterialOpacity(96,204);canvasHorizontal_=scroll(false);canvasVertical_=scroll(true);canvasHorizontal_->setTransparent(false);canvasVertical_->setTransparent(false);homeScrollBar_=scroll(true);errorScrollBar_=scroll(true);preferenceNavBar_=scroll(true);preferenceContentBar_=scroll(true);

    preferenceNavBar_->changed=[this](int value){preferenceNavPixels_=value;layoutModal();invalidateRect(dialogDisplayBounds());};

    preferenceContentBar_->changed=[this](int value){preferenceContentPixels_=value;layoutModal();invalidateRect(dialogDisplayBounds());};

    timelineHorizontal_->changed=[this](int value){currentView().frames=value/(timelineFrameWidth()*uiScale);currentView().frameRemainder=value%(timelineFrameWidth()*uiScale);layoutLayers();invalidateTimelineGrid();};

    timelineVertical_->changed=[this](int value){currentView().layers=value/(timelineRowHeight()*uiScale);currentView().layerRemainder=value%(timelineRowHeight()*uiScale);layoutLayers();invalidateTimelineGrid();};

    homeScrollBar_->changed=[this](int value){homeScrollPixels_=value;layoutHome();invalidate();};

    errorScrollBar_->changed=[this](int value){errorScrollPixels_=value;modalErrorScroll_=value/(12*uiScale);layoutModal();invalidateRect(dialogDisplayBounds());};

    canvasHorizontal_->changed=[this](int value){const auto v=canvasViewport(),b=canvasDisplayBounds();const int upper=clampCanvasAxis(INT_MAX,v.x,v.w,b.w);panCanvasDisplay(upper-value-b.x,0);constrainCanvas();saveDocumentView();invalidateRect(canvasViewport());};

    canvasVertical_->changed=[this](int value){const auto v=canvasViewport(),b=canvasDisplayBounds();const int upper=clampCanvasAxis(INT_MAX,v.y,v.h,b.h);panCanvasDisplay(0,upper-value-b.y);constrainCanvas();saveDocumentView();invalidateRect(canvasViewport());};

    paletteGrowthHandle_=button(U"Ⅱ",[]{});paletteGrowthHandle_->centerCaption=true;paletteGrowthHandle_->skinStyle="button";paletteGrowthHandle_->pointerPress=[this](const ui::MouseMessage& mouse){beginPaletteGrowth(mouse);};paletteGrowthHandle_->paletteViewport=[this]{return paletteViewportBounds();};

    paletteHorizontalBar_=scroll(false);paletteHorizontalBar_->changed=[this](int value){currentView().paletteScrollX=value;layoutPalette(0);invalidateRect(paletteContentBounds());};

    paletteScrollBar_=scroll(true);paletteScrollBar_->changed=[this](int value){currentView().paletteScroll=value;layoutPalette(0);invalidateRect(paletteContentBounds());};

    registerScrollDrag([this]{return columnShown(0)?paletteViewportBounds():gfx::Rect();},{

      [this]{return SpaceDragScroll::Position{currentView().paletteScrollX,currentView().paletteScroll};},

      [this]{const auto viewport=paletteViewportBounds();return SpaceDragScroll::Position{paletteHorizontalBar_&&paletteHorizontalBar_->isVisible()?std::max(0,paletteHorizontalBar_->size()-viewport.w):0,paletteScrollBar_&&paletteScrollBar_->isVisible()?std::max(0,paletteScrollBar_->size()-viewport.h):0};},

      [this](SpaceDragScroll::Position p){if(currentView().paletteScrollX==p.x&&currentView().paletteScroll==p.y)return;currentView().paletteScrollX=p.x;currentView().paletteScroll=p.y;layoutPalette(0);invalidateRect(paletteContentBounds());}});

    registerScrollDrag([this]{return columnShown(2)?timelineRowViewport():gfx::Rect();},{

      [this]{return SpaceDragScroll::Position{currentView().frames*timelineFrameWidth()*uiScale+currentView().frameRemainder,currentView().layers*timelineRowHeight()*uiScale+currentView().layerRemainder};},

      [this]{const auto m=timelineScrollMetrics(columnLayout(uiLogical(clientBounds()),2));return SpaceDragScroll::Position{std::max(0,m.contentWidth-m.width),std::max(0,m.contentHeight-m.height)};},

      [this](SpaceDragScroll::Position p){currentView().frames=p.x/(timelineFrameWidth()*uiScale);currentView().frameRemainder=p.x%(timelineFrameWidth()*uiScale);currentView().layers=p.y/(timelineRowHeight()*uiScale);currentView().layerRemainder=p.y%(timelineRowHeight()*uiScale);layoutLayers();invalidateTimelineGrid();}});

    paletteSelectionOverlay_=new FloatingColumnSurface;paletteSelectionOverlay_->setTransparent(true);addChild(paletteSelectionOverlay_);

    paletteSelectionOverlay_->paint=[this](ui::Graphics& g){UiPaintScale scale(g);const auto offset=-paletteSelectionOverlay_->bounds().origin();const bool hover=paletteMousePosition_ && paletteOutlineContains(*paletteMousePosition_);for(auto edge:paletteSelectionEdges_){edge.border.offset(offset);for(auto piece:edge.pieces){piece.offset(offset);g.saveClip();g.clipRect(uiLogical(piece));skin_.drawSelectionBorder(g,edge.border,hover);g.restoreClip();}}};

    paletteSelectionOverlay_->pointer=[this](ui::Message* msg){if(pending_!=Pending::None)return false;if(msg->type()==ui::kMouseDownMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);beginPalettePointer(paletteManual_?paletteSlotAt(mouse->position()):std::min(paletteSlotAt(mouse->position()),paletteButtonIds_.size()-1),*mouse);return true;}return false;};

    auto pollSchedule=std::make_shared<const workspace::TaskPollSchedule>(
      workspace::TaskPollSchedule::Catalog{{[this]{galleryTick();}},
       {[this]{homeFolderTick();}},
       {[this]{homeRecoveryTick();},[this]{return std::size_t(recoveryCatalogWorker_.valid())+std::size_t(recoveryDiscardWorker_.valid());}}},
      workspace::TaskPollSchedule::Capture{{[this]{timelapseTick();}},
       {[this]{liquifyTick();}},
       {[this]{if(brushFeedback_.brushPreferencesPending_ && !brushFeedback_.modifierBrushSize_ && std::chrono::steady_clock::now()>=brushFeedback_.brushPreferencesDue_)flushBrushSizePreferences();},[this]{return std::size_t(brushFeedback_.brushPreferencesPending_);}}},
      workspace::TaskPollSchedule::Persistence{{[this]{saveTick();},[this]{return backgroundSaves_.size()+std::size_t(saveJob_.snapshot.has_value()||saveJob_.worker.valid());}},
       {[this]{framePngTick();},[this]{return std::size_t(framePngTask_.busy());}}},
      workspace::TaskPollSchedule::Interaction{{[this]{if(paletteGesture_ && !paletteGesture_->active && !paletteGesture_->moving && !paletteGesture_->secondary && std::chrono::steady_clock::now()-paletteGesture_->began>=std::chrono::milliseconds(360))updatePalettePointer(paletteGesture_->origin);}},
       {[this]{playbackTick();}}},
      workspace::TaskPollSchedule::Maintenance{{[this]{recoveryTick();}},
       {[this]{usageStatisticsTick();}}},
      workspace::TaskPollSchedule::Preview{{[this]{convolutionTick();},[this]{return convolution_.controller.pendingCount();}},
       {[this]{antiAliasTick();},[this]{return antiAlias_.controller.pendingCount();}},
       {[this]{gradientMapTick();},[this]{return gradientMap_.controller.pendingCount();}},
       {[this]{wandTick();},[this]{return wand_.pendingCount();}},
       {[this]{gradientTick();},[this]{return std::size_t(gradientRequest_);}},
       {[this]{shapeTick();},[this]{return std::size_t(shapeRequest_);}}});
    recoveryTimer_=new ui::Timer(16,this);recoveryTimer_->Tick.connect([pollSchedule]{
      pollSchedule->poll(InteractionProfile::get().tasks);
    });recoveryTimer_->start();

    commands_.push_back(button(U"新建",[this]{ask(Pending::New);}));

    documentTabNew_=button(U"",[this]{ask(Pending::New);});documentTabNew_->iconSkin=&toolIcons_;documentTabNew_->icon="plus";documentTabNew_->tabAdd=true;

    documentTabClose_=button(U"",[this]{activateProject(0);ask(Pending::CloseDocument);});documentTabClose_->iconSkin=&toolIcons_;documentTabClose_->icon="close";documentTabClose_->bareTabIcon=true;

    commands_.push_back(button(U"画笔",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;currentDocument().commitFloatingPaste();cancelStroke();currentTools().liquifyTool=false;liquifyResetPosition_.reset();currentTools().smoothTool=false;currentTools().airbrushTool=false;currentTools().rotateTool=false;currentTools().textTool=false;currentTools().moveTool=false;currentTools().selectionTool=false;currentTools().shapeTool=false;currentTools().eyedropperTool=false;currentTools().zoomTool=false;currentTools().gradientTool=false;currentTools().fillTool=false;currentTools().handTool=false;currentTools().eraser=false;updateNavigationCursor();refresh();}));

    commands_.push_back(button(U"橡皮",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;currentDocument().commitFloatingPaste();cancelStroke();currentTools().liquifyTool=false;liquifyResetPosition_.reset();currentTools().smoothTool=false;currentTools().airbrushTool=false;currentTools().rotateTool=false;currentTools().textTool=false;currentTools().moveTool=false;currentTools().selectionTool=false;currentTools().shapeTool=false;currentTools().eyedropperTool=false;currentTools().zoomTool=false;currentTools().gradientTool=false;currentTools().fillTool=false;currentTools().handTool=false;currentTools().eraser=true;updateNavigationCursor();refresh();}));

    commands_.push_back(button(U"撤销",[this]{requestHistoryAction(workspace::HistoryAction::Undo);}));

    commands_.push_back(button(U"重做",[this]{requestHistoryAction(workspace::HistoryAction::Redo);}));

    commands_.push_back(button(U"手",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;currentDocument().commitFloatingPaste();cancelStroke();currentTools().liquifyTool=false;liquifyResetPosition_.reset();currentTools().smoothTool=false;currentTools().airbrushTool=false;currentTools().rotateTool=false;currentTools().textTool=false;currentTools().moveTool=false;currentTools().shapeTool=false;currentTools().eyedropperTool=false;currentTools().zoomTool=false;currentTools().gradientTool=false;currentTools().fillTool=false;currentTools().handTool=true;updateNavigationCursor();refresh();}));

    createToolRail();

    loadPaletteSize();

    try{const auto path=palettePreferencePath().parent_path()/"animation-playback.txt";if(std::filesystem::exists(path)){std::ifstream in(path);readPlaybackPreferences(in);}}catch(const std::exception& e){savedPlaybackRate_=currentPlayback().rate=1;savedPlaybackReturnToStart_=currentPlayback().returnToStart=false;savedPlaybackMode_.reset();status_=U"播放偏好读取失败："+unicodeText(e.what());}

    layerLabelSeparator_=new LayerLabelSeparator;layerLabelSeparator_->process=[this](ui::Message* msg){return processLayerLabelResize(msg);};addChild(layerLabelSeparator_);

    try{const auto path=palettePreferencePath().parent_path()/"layer-label-width.txt";if(std::filesystem::exists(path)){std::ifstream in(path);std::string value;if(!in || !std::getline(in,value))throw std::runtime_error("Cannot read layer label width");layerLabelWidth_.physical=layerlabel::load(value);}}catch(const std::exception& e){layerLabelReadable_=false;status_=U"图层列宽读取失败，保存已禁用："+unicodeText(e.what());}

    try{auto settings=animationprefs::load(palettePreferencePath().parent_path()/"animation-settings.json",palettePreferencePath().parent_path()/"onion-skin.txt");onion_=settings.onion;skipDisabledFrames_=settings.skipDisabledFrames;}catch(const std::exception& e){animationSettingsReadable_=false;status_=U"动画设置读取失败，保存已禁用："+unicodeText(e.what());}

    // Recent colors belong to this project session; do not import prior runs.

    for(const auto icon:{"up","down","restore","paletteCenter","moreLines","paletteLocal","extractColors","autoSlice","rotateClockwise90","selectionFlipHorizontal","selectionFlipVertical","properties","workspace","aspectLink","selectionOutline","lock","unlock","undo","redo","dither","image","checkboxUnchecked","checkboxChecked","more","brush-round","brush-square","brush-line","liquify-mode-push","liquify-mode-inflate","liquify-mode-deflate","liquify-mode-twist-clockwise","liquify-mode-twist-counter-clockwise","ink-simple","ink-copy-alpha-color","ink-lock-alpha","pressure-dynamics","symmetry-horizontal","symmetry-vertical","symmetry-diagonal-up","symmetry-diagonal-down","symmetry-rotational","close","plus","minus","follow","canvasTopLeft","canvasTop","canvasTopRight","canvasLeft","canvasAnchorCenter","canvasRight","canvasBottomLeft","canvasBottom","canvasBottomRight","eye","eyeOff","delete","playback-first","playback-previous","playback-play","playback-pause","playback-next","playback-last","left","right","check","copy","link","onion","animation-auto-link-off","animation-auto-link-on","newFolder","ungroupFolder","gradientMap","tileModeEdit","tileModeCreate","tileModeHybrid","tilemap","freeTile","linkedLayer","convertTo","mergeDown","mergeVisible","clippingMask","layerMask","layerStyle","paste","clearRecords","info","swap","move","home","folder","folderOpen","save","import","refresh","selection-pivot","draw-with-anchor","anchor-preset-nw","anchor-preset-n","anchor-preset-ne","anchor-preset-w","anchor-preset-center","anchor-preset-e","anchor-preset-sw","anchor-preset-s","anchor-preset-se","gradient-linear","gradient-radial","gradient-stop","about-git-fork","about-external-link","pin","project-pencil","project-drawing-time","project-layer-count"}) for(const auto suffix:{"","-disabled"}) {

      const auto name=std::string(icon)+suffix;const auto atlas=skin_.assets.patches.find("icon."+name);toolIcons_.assets.patches[name]=atlas==skin_.assets.patches.end()?importSkinPng(assets_/"utility-icons"/(name+".png"),32):atlas->second;

    }

    for(const auto icon:{"selection-replace","selection-add","selection-subtract","selection-intersect","selection-shrink","selection-pivot-preset-0","selection-pivot-preset-1","selection-pivot-preset-2","selection-pivot-preset-3","selection-pivot-preset-4","selection-pivot-preset-5","selection-pivot-preset-6","selection-pivot-preset-7","selection-pivot-preset-8"})for(const auto suffix:{"","-disabled"}){const auto name=std::string(icon)+suffix;toolIcons_.assets.patches[name]=importSkinPng(assets_/"utility-icons"/(name+".png"),32);}

    for(const auto icon:{"playback-first","playback-previous","playback-play","playback-next","playback-last","onion","plus","delete","plus","newFolder","lock","link"}){const auto index=timelineInactive_.size();auto b=timelineButton(U"",[this,index]{switch(index){case 0:toolbarSelectFrame(0);break;case 1:toolbarStepFrame(-1);break;case 2:togglePlayback();break;case 3:toolbarStepFrame(1);break;case 4:toolbarSelectFrame(currentDocument().timeline().state().frames.size()-1);break;case 5:toggleOnion();break;case 6:frameAction(1);break;case 7:deleteTimelineItems();break;case 8:createLayer();break;}});b->iconSkin=&toolIcons_;b->icon=icon;b->skinStyle=index<10?"icon_button":"timeline-row";if(index<10){b->iconGroupIndex=int(index<5?index:index<8?index-5:index-8);b->iconGroupCount=index<5?5:3;}timelineInactive_.push_back(b);if(index==5)b->context=[this]{showOnionMenu();};if(index==2)b->context=[this]{showPlaybackMenu();};}

    layerEye_=timelineButton(U"",[this]{const auto& layer=currentDocument().timeline().state().layers.at(currentView().layers);currentDocument().beginVisibilityGesture();currentDocument().previewVisibilityGesture(layer.id,!layer.visible);currentDocument().commitVisibilityGesture();refresh();});layerEye_->iconSkin=&toolIcons_;layerEye_->skinStyle="timeline-row";

    layerRow_=timelineButton(currentDocument().layer().name,[]{});

    layerRow_->skinStyle="timeline-row";

    layerRow_->doubleClick=[this]{showLayerOpacity();};

    try{const auto path=palettePreferencePath().parent_path()/"layer-side-dock-auto-hide.txt";if(std::filesystem::exists(path)){if(std::filesystem::file_size(path)>16)throw std::runtime_error("Invalid side dock preference");std::ifstream in(path);std::string value;if(!(in>>value)||(value!="true"&&value!="false")||!(in>>std::ws).eof())throw std::runtime_error("Invalid side dock preference");layerSideDockAutoHide_=value=="true";}}catch(const std::exception& e){layerSideDockReadable_=false;status_=U"图层侧边隐藏设置读取失败，保存已禁用："+unicodeText(e.what());}
    {std::ifstream in(palettePreferencePath().parent_path()/"layer-display-density.txt");std::string value;in>>value;for(int i=0;i<6;++i)if(value==timelineDensityKeys_[i])timelineDensity_=i;}

    try{layerQuickActions_=layerquick::load(palettePreferencePath().parent_path()/"layer-quick-actions.json");auto path=palettePreferencePath().parent_path()/"layer-quick-actions-layout-v1.txt";std::ifstream in(path);int x,y,w,h;if(in>>x>>y>>w>>h)layerQuickDialogGeometry_={x,y,std::clamp(w,340,640),std::clamp(h,360,760)};}catch(const std::exception& e){status_=U"快捷操作偏好读取失败："+unicodeText(e.what());}

    layerQuickSettings_=button(U"",[this]{showLayerQuickActions();});layerQuickSettings_->iconSkin=&toolIcons_;layerQuickSettings_->icon="properties";layerQuickSettings_->skinStyle="icon_button";layerQuickSettings_->hover=[this]{status_=U"图层设置";invalidate();};

    for(int i=0;i<layerquick::limit;++i){auto b=button(U"",[this,i]{const auto quick=layerquick::visible(layerQuickActions_,[this](const std::string& id){return menuCommands_.connected(id);});if(i<int(quick.size()))menuCommands_.invoke(quick[i].id);});b->iconSkin=&toolIcons_;b->skinStyle="icon_button";b->hover=[this,i]{const auto quick=layerquick::visible(layerQuickActions_,[this](const std::string& id){return menuCommands_.connected(id);});if(i<int(quick.size()))status_=layerquick::find(quick[i].id)->label;invalidate();};layerQuickButtons_.push_back(b);}

    layerProperties_=button(U"",[this]{openSelectedLayerProperties();});layerProperties_->iconSkin=&toolIcons_;layerProperties_->icon="properties";layerProperties_->skinStyle="icon_button";layerProperties_->iconGroupIndex=2;layerProperties_->iconGroupCount=3;

    layerHeaderOpacity_=new PixelSlider(font_,skin_);addChild(layerHeaderOpacity_);

    layerHeaderOpacity_->interactionBegin=[this]{currentDocument().beginLayerOpacity();};

    layerHeaderOpacity_->changed=[this](int value){currentDocument().previewLayerOpacity(value/100.0);invalidate();};

    layerHeaderOpacity_->interactionCommit=[this]{currentDocument().commitLayerOpacity();refresh();};

    layerHeaderOpacity_->interactionCancel=[this]{currentDocument().cancelLayerOpacity();refresh();};

    createToolOptions();createGradientOptions();connectLegacyPropertyRanges();createShapeOptions();createEyedropperOptions();createMoveOptions();createSliceOptions();initializePropertyEntryWidths();

    try{std::ifstream in(palettePreferencePath().parent_path()/"symmetry.txt");if(in){for(int i=0;i<5;++i)in>>symmetryFlag(i);in>>symmetryLocked_>>symmetryThickness_>>symmetryColor_;symmetryThickness_=std::clamp(symmetryThickness_,1,8);persistedSymmetryAxes_=currentDocument().symmetryAxes;symmetryInitialized_=symmetryHas(currentDocument().symmetryAxes);}}catch(const std::exception& e){status_=U"对称偏好读取失败："+unicodeText(e.what());}createFillPatternOptions();migratePropertyDropdowns();

    paletteActions_=button(U"",[this]{showPaletteActions();});

    paletteActions_->iconSkin=&toolIcons_;paletteActions_->icon="properties";

    paletteActions_->iconGroupCount=2;paletteActions_->iconGroupIndex=1;

    paletteLibrary_=button(U"",[this]{openStoredPaletteLibrary();});paletteLibrary_->iconSkin=&toolIcons_;paletteLibrary_->icon="paletteLocal";

    paletteLibrary_->iconGroupCount=2;paletteLibrary_->iconGroupIndex=0;paletteLibrary_->setEnabled(true);

    paletteLibrary_->hover=[this]{status_=U"选择本地色板";invalidate();};

    paletteActions_->hover=[this]{status_=U"颜色尺寸 · Ctrl + 滚轮调整";invalidate();};

    paletteLock_=button(U"",[this]{togglePaletteLock();});paletteLock_->iconSkin=&toolIcons_;

    paletteLock_->hover=[this]{status_=paletteLocked_?U"锁定：改变角色颜色不修改色卡":U"解锁：改变已绑定的角色颜色会修改色卡";invalidate();};

    primaryRole_=button(U"",[this]{showRoleColorEditor(false);});

    secondaryRole_=button(U"",[this]{showRoleColorEditor(true);});

    primaryRole_->hover=[this]{status_=U"前景色 · 点击编辑 HEX";invalidate();};

    secondaryRole_->hover=[this]{status_=U"背景色 · 点击编辑 HEX";invalidate();};

    extractNameInput_=new PixelEntry(font_,skin_);addChild(extractNameInput_);extractNameInput_->setVisible(false);extractNameInput_->accept=[this]{resolve(true);};extractNameInput_->cancel=[this]{resolve(false);};

    extractModeButton_=button(U"新建",[this]{PixelMenu menu(skin_);const char32_t* labels[]{U"新建",U"替换",U"追加"};for(int i=0;i<3;++i){auto item=new PixelMenuItem(font_,skin_,labels[i]);item->checked=[this,i]{return extractMode_==i;};item->Click.connect([this,i]{extractMode_=i;layoutModal();invalidate();});menu.addChild(item);}const auto at=extractModeButton_->bounds();menu.showPopup({at.x,at.y2()},display());});extractModeButton_->setVisible(false);

    createAdjustmentControls();

    createGradientMapControls();createAntiAliasControls();createConvolutionControls();createPreferencesControls();createReplaceControls();createResizeControls();createStaticExportControls();createSpriteSheetControls();createGifExportControls();createExportFormatControl();createExportScalePresets();createExportComponents();createSheetImportControls();

    paletteInput_=new FrameDurationPaletteEntry(font_,skin_);static_cast<FrameDurationPaletteEntry*>(paletteInput_)->durationCommit=[this]{commitFrameDurationDraft();};static_cast<FrameDurationPaletteEntry*>(paletteInput_)->durationWheel=[this](int delta){if(pending_!=Pending::FrameDuration)return;const int duration=std::clamp(currentDocument().frame().duration+delta*10,1,60000);currentDocument().previewFrameDuration(duration);paletteInput_->setText(std::to_string(duration));refresh();};addChild(paletteInput_);paletteInput_->setVisible(false);

    for(int i=0;i<4;++i){auto& input=loopInputs_[i];input=i==0?new PixelEntry(font_,skin_):new LoopNumberEntry(font_,skin_);input->numeric=i!=0;addChild(input);input->setVisible(false);input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};if(i){auto number=static_cast<LoopNumberEntry*>(input);number->committed=[this]{invalidate();};input->Change.connect([number]{number->updateLiveValue();});}else input->Change.connect([this]{invalidate();});}

    loopRepeat_=button(U"重复次数",[this]{toggleLoopRepeat();});loopRepeat_->iconSkin=&toolIcons_;loopRepeat_->bareIconWithCaption=true;loopRepeat_->setVisible(false);

    auto loopDropdown=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(loopDropdown);addChild(loopDropdown);loopDirection_=loopDropdown;

    loopDropdown->setOptions({U"\u6b63\u5411",U"\u53cd\u5411",U"\u6b63\u5411\u5f80\u8fd4",U"\u53cd\u5411\u5f80\u8fd4"});

    loopDropdown->changed=[this](int index){if(!loopDraft_)return;const char* directions[]{"forward","reverse","ping-pong","ping-pong-reverse"};loopDraft_->direction=directions[index];updateLoopDirection();invalidate();};loopDirection_->setVisible(false);

    createStoredPaletteControls();

    for(int i=0;i<24;++i){auto b=button(U"",[]{});b->paletteCell=true;b->recentColorSwatch=true;b->setVisible(false);paletteSavePreview_.push_back(b);}

    paletteInput_->accept=[this]{resolve(pending_==Pending::PaletteSave || pending_==Pending::BrushFolderName || pending_==Pending::PaletteName || pending_==Pending::PaletteExtract || pending_==Pending::LayerOpacity);};

    paletteInput_->Change.connect([this]{if(pending_==Pending::PaletteSave)paletteSaveName_=unicodeText(paletteInput_->text());if(pending_==Pending::LayerOpacity){currentDocument().previewLayerName(unicodeText(paletteInput_->text()));refresh();}if(pending_==Pending::OnionValue)previewOnionValue();});

    paletteInput_->cancel=[this]{resolve(false);};

    paletteInput_->blur=[this]{if(pending_==Pending::ColorRole) commitPaletteHex();else if(pending_==Pending::FrameDuration&&static_cast<FrameDurationPaletteEntry*>(paletteInput_)->durationMode)commitFrameDurationDraft();};

    panelTabs_.push_back(button(U"颜色板",[this]{cancelStroke();refresh();}));

    panelTabs_[0]->context=[this]{showColumnContextMenu(Column::Palette);};

    dockingTabs_[0]=panelTabs_[0];const char32_t* dockNames[]{U"颜色板",pickerColumnName(1),U"图层",U"预览",pickerColumnName(4),pickerColumnName(5),pickerColumnName(6),pickerColumnName(7),U"历史",U"参考图",U"数位板辅助",U"瓦片集",U"图案笔刷",U"实例图层"};

    for(int id=1;id<panels::columnCount;++id)dockingTabs_[id]=button(dockNames[id],[this,id]{docking_.select(id);refresh();saveWorkspaceSizes();});

    for(int id=0;id<panels::columnCount;++id){dockingTabs_[id]->pointerPress=[this,id](const ui::MouseMessage& m){beginPanelGesture(id,m);};dockingTabs_[id]->context=[this,id]{showColumnContextMenu(Column(id));};}

    const char* closeCommands[]{"togglePalettePanel","toggleColorPanel","toggleLayersPanel"};

    for(int id=0;id<3;++id){columnClose_[id]=button(U"",[this,command=std::string(closeCommands[id])]{cancelStroke();menuCommands_.invoke(command);saveWorkspaceSizes();});columnClose_[id]->iconSkin=&toolIcons_;columnClose_[id]->icon="close";columnClose_[id]->skinStyle="icon_button";columnClose_[id]->setVisible(false);}

    panelDockTimer_.Tick.connect([this]{tickPanelGesture();});

    modalSurface_=new FloatingColumnSurface;addChild(modalSurface_);

    modalSurface_->paint=[this](ui::Graphics& child){const auto clip=child.getClipBounds().offset(modalSurface_->bounds().origin()-bounds().origin());ui::Graphics g(child.display(),base::AddRef(child.getInternalSurface()),bounds().x,bounds().y);g.saveClip();g.clipRect(clip);paintDialog(g);g.restoreClip();};

    modalSurface_->pointer=[this](ui::Message* msg){return processSizeDrag(msg);};

    dockFeedback_=new DockFeedback;dockFeedback_->paint=[this](ui::Graphics& g){paintDockFeedback(g);};addChild(dockFeedback_);

    for(int id=0;id<panels::columnCount;++id){auto surface=new FloatingColumnSurface;floatingSurfaces_[id]=surface;addChild(surface);surface->paint=[this,surface,id](ui::Graphics& child){const auto clip=child.getClipBounds().offset(surface->bounds().origin()-bounds().origin());ui::Graphics g(child.display(),base::AddRef(child.getInternalSurface()),bounds().x,bounds().y);g.saveClip();g.clipRect(clip);clipColumn(g,id,true);paintChrome(g,true);paintTimelineGrid(g);g.restoreClip();

      // Floating surfaces also clear the header. Restore only the exposed

      // portion of inactive labels; the frame remains above their lower edge.

      if(columnFloating(id)){const auto physicalClip=child.getClipBounds().offset(surface->bounds().origin());for(int tabId:docking_.groups[docking_.groupOf(id)].tabs){auto tab=dockingTabs_[tabId];if(!tab || !tab->isVisible() || tab->active)continue;auto visible=tab->bounds();visible.h=std::max(0,toDisplay(columnFrame(id)).y-visible.y);ui::Graphics label(child.display(),base::AddRef(child.getInternalSurface()),tab->bounds().x,tab->bounds().y);label.saveClip();label.clipRect((visible&physicalClip).offset(-tab->bounds().origin()));ui::PaintEvent ev(tab,&label);tab->onPaint(ev);label.restoreClip();}}

    };}

    const char* topIcons[]{"plus","folderOpen","save","copy","image"};

    for(int i=0;i<5;++i){topActions_[i]=button(i==4?U"导出":U"",[this,i]{switch(i){case 0:ask(Pending::New);break;case 1:chooseProject();break;case 2:menuCommands_.invoke("save");break;case 3:menuCommands_.invoke("saveAs");break;case 4:openDocumentExport();break;}});topActions_[i]->iconSkin=&toolIcons_;topActions_[i]->icon=topIcons[i];topActions_[i]->iconWithCaption=i==4;topActions_[i]->iconGroupCount=i<4?4:0;topActions_[i]->iconGroupIndex=i;}

    auto picker=new DialogBackground<NativeColorPicker>(font_,skin_,assets_/"color-picker");configureDialogBackground(picker);colorPicker_=picker;addChild(colorPicker_);colorPicker_->setVisible(false);

    if(!smoke_)try{colorPicker_->setScheme(loadColorPickerScheme(palettePreferencePath().parent_path()/"color-picker-scheme-v1.txt"));}catch(const std::exception& e){pickerSchemeReadable_=false;status_=U"调色盘方案读取失败："+unicodeText(e.what());}

    pickerRestore_=button(U"",[this]{restorePickerSquare();});pickerRestore_->iconSkin=&toolIcons_;pickerRestore_->icon="paletteCenter";

    if(!smoke_)try{colorPicker_->setMoonField(loadColorPickerMoonField(palettePreferencePath().parent_path()/"color-picker-moon-field-v1.txt"));}catch(const std::exception& e){pickerMoonFieldReadable_=false;status_=unicodeText(e.what());}

    if(!smoke_)try{colorPicker_->setQuantization(loadColorPickerQuantization(palettePreferencePath().parent_path()/"color-picker-quantization-v1.txt"));}catch(const std::exception& e){pickerQuantizationReadable_=false;status_=unicodeText(e.what());}

    pickerScheme_=button(U"",[this]{colorPicker_->finishInteraction();auto at=pickerScheme_->bounds();showColorPickerSchemeMenu(font_,skin_,toolIcons_,colorPicker_->scheme(),{at.x,at.y2()},display(),[this](ColorPickerScheme scheme){colorPicker_->setScheme(scheme);if(!smoke_&&pickerSchemeReadable_)try{saveColorPickerScheme(palettePreferencePath().parent_path()/"color-picker-scheme-v1.txt",scheme);}catch(const std::exception& e){status_=U"调色盘方案保存失败："+unicodeText(e.what());}refresh();},colorPicker_->moonField(),[this](PickerMoonField field){colorPicker_->setMoonField(field);if(!smoke_&&pickerMoonFieldReadable_)try{saveColorPickerMoonField(palettePreferencePath().parent_path()/"color-picker-moon-field-v1.txt",field);}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();},colorPicker_->quantization(),[this](PickerQuantization config){colorPicker_->setQuantization(config);if(!smoke_&&pickerQuantizationReadable_)try{saveColorPickerQuantization(palettePreferencePath().parent_path()/"color-picker-quantization-v1.txt",config);}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();},false);requestFocus();});pickerScheme_->iconSkin=&toolIcons_;pickerScheme_->icon="moreLines";

    colorPicker_->changed=[this](Pixel color,bool secondary){setSharedColor(color,secondary);refresh();};

    pickerPrimary_=button(U"",[this]{showRoleColorEditor(false);});pickerPrimary_->colorRole=true;

    pickerSecondary_=button(U"",[this]{showRoleColorEditor(true);});pickerSecondary_->colorRole=true;

    pickerAdd_=button(U"",[this]{try{currentDocument().addPaletteColor(currentDocument().palette().primary,paletteLocked_);}catch(const std::length_error&){status_=U"颜色编号超出当前支持范围";}refresh();});

    pickerAdd_->iconSkin=&toolIcons_;pickerAdd_->icon="plus";

    colorPicker_->interactionBegin=[this]{if(!gradientPending_)cancelStroke();paletteFocused_=false;};

    pickerColumns_[1]={colorPicker_,pickerRestore_,pickerScheme_,pickerPrimary_,pickerSecondary_,pickerAdd_,{}};
    colorPicker_->setScheme(ColorPickerScheme::SvSquare);createExtraPickerColumns();

    for(auto b:panelTabs_) b->tab=true;

    panelTabs_[0]->firstTab=true;

    dialogClose_=button(U"",[this]{closePaletteModal();});dialogClose_->iconSkin=&toolIcons_;dialogClose_->icon="close";

    discard_=button(U"丢弃",[this]{resolve(true);}); keep_=button(U"取消",[this]{closePaletteModal();});

    saveBeforeClose_=button(U"保存",[this]{if(saveProject(false))resolve(true);});

    dialogClose_->setVisible(false);saveBeforeClose_->setVisible(false);

    discard_->setVisible(false); keep_->setVisible(false); refresh();

    layerTooltips_=new ui::TooltipManager;addChild(layerTooltips_);

    layerDescription_=new PixelTextArea(font_,skin_);addChild(layerDescription_);layerDescription_->setVisible(false);layerDescription_->changed=[this](const std::u32string& text){currentDocument().previewLayerDescription(text);refresh();};layerDescription_->cancel=[this]{resolve(false);};

    layerDisplayColor_=button(U"",[this]{if(pending_!=Pending::LayerOpacity)return;if(!colorEditorPopup_)colorEditorPopup_=std::make_unique<ColorEditorPopup>(font_,skin_,toolIcons_,smoke_?assets_.parent_path()/"color-editor-smoke-size.txt":palettePreferencePath().parent_path()/"color-editor-role-size.txt");std::vector<Pixel> colors;for(const auto& c:currentDocument().palette().entries)if(c.id)colors.push_back(c.color);colorEditorPopup_->open(layerDisplayColor_->bounds(),bounds(),layerDisplayColor_->swatch,U"图层显示颜色",colors,[this](Pixel color){if(pending_==Pending::LayerOpacity){currentDocument().previewLayerDisplayColor(color);layerDisplayColor_->swatch=color;refresh();}},{});});layerDisplayColor_->colorRole=true;layerDisplayColor_->setVisible(false);

    layerNoColor_=button(U"无色",[this]{currentDocument().previewLayerDisplayColor({});layerDisplayColor_->swatch=0;refresh();});layerNoColor_->setVisible(false);

    layerBlendMode_=new PixelDropdown(font_,skin_);addChild(layerBlendMode_);layerBlendMode_->setOptions({U"正常",U"变暗",U"正片叠底",U"颜色加深",U"线性加深",U"变亮",U"滤色",U"颜色减淡",U"线性减淡（添加）",U"叠加",U"柔光",U"强光",U"亮光",U"线性光",U"点光",U"实色混合",U"差值",U"排除",U"减去",U"划分",U"色相",U"饱和度",U"颜色",U"明度"});layerBlendMode_->setVisible(false);layerBlendMode_->changed=[this](int index){currentDocument().previewLayerBlendMode(std::string(layerBlendModeName(LayerBlendMode(index))));refresh();};

    layerOpacityRange_=new PixelSlider(font_,skin_);addChild(layerOpacityRange_);layerOpacityRange_->setVisible(false);

    layerOpacityRange_->changed=[this](int value){currentDocument().previewLayerOpacity(value/100.0);invalidate();};

    brushRange_=new PixelSlider(font_,skin_);addChild(brushRange_);brushRange_->setVisible(false);

    brushRange_->changed=[this](int value){

      auto& profile=currentTools().brushProfiles[currentTools().eraser?1:0];(brushRangeOpacity_?profile.opacity:profile.size)=value;

      updatingBrushFields_=true;(brushRangeOpacity_?brushOpacityInput_:brushSizeInput_)->setText(std::to_string(value));updatingBrushFields_=false;

      saveBrushPreferences();invalidate();

    };

    menuBar_=new ui::MenuBar(ui::MenuBar::ProcessTopLevelShortcuts::kNo);

    auto root=new PixelMenu(skin_);root->setBorder(gfx::Border(0));

    menuBar_->setMenu(root);addChild(menuBar_);

    homeButton_=new PixelMenuItem(font_,skin_,U"首页");

    homeButton_->available=[this]{return pending_==Pending::None && !currentDocument().active();};

    homeButton_->Click.connect([this]{showHome(true);});root->addChild(homeButton_);

    auto group=[&](std::u32string title,bool enabled=true) {

      auto item=new PixelMenuItem(font_,skin_,std::move(title));auto menu=new PixelMenu(skin_);

      item->setSubmenu(menu);item->setEnabled(enabled);root->addChild(item);return menu;

    };

    auto item=[&](PixelMenu* menu,const std::string& id,std::u32string title,std::u32string shortcut,

                  std::function<void()> action,std::function<bool()> enabled={},std::function<bool()> checked={}) {

      auto entry=new PixelMenuItem(font_,skin_,std::move(title),std::move(shortcut));

      entry->menuMarks=&toolIcons_;

      entry->available=[this,enabled,id]{return pending_==Pending::None && (documentOpen_ && !homeOpen_ || id=="openScriptFolder" || id=="diagnostics" || id=="userGuide" || id=="tips" || id=="usageStatistics" || id=="openShortcutSettings" || id=="newDocument" || id=="openDocument" || id=="pasteAsNewDocument" || id=="openAbout" || id=="openLatestRelease" || id=="closeWindow" || id.find("toggle")==0) && (!enabled || enabled());};

      entry->checked=std::move(checked);

      entry->Click.connect([this,entry,action,id]{if(entry->available()) {if(id!="undo"&&id!="redo"&&id!="pasteAsNewDocument"&&id!="openAbout"&&id!="openLatestRelease"&&id!="userGuide"&&id!="tips"&&!gradientIoCommand(id))cancelStroke();const auto started=std::chrono::steady_clock::now();diagnostics::recordGlobal("operation-start","menu."+id);try{action();}catch(const std::exception& e){diagnostics::recordGlobal("error","menu."+id,{{"message",std::string(e.what())}});throw;}catch(...){diagnostics::recordGlobal("error","menu."+id,{{"message",std::string("non-standard exception")}});throw;}const double duration=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-started).count();diagnostics::recordGlobal("operation-end","menu."+id,{{"outcome",std::string("ok")},{"durationMs",duration}});if(duration>=5000)diagnostics::recordGlobal("operation-slow","menu."+id,{{"durationMs",duration}});refresh();}});

      menu->addChild(entry);menuItems_[id]=entry;

    };

menuCommands_.bind("toggleFullscreen",{[this]{toggleFullscreen();},[this]{return display() && display()->nativeWindow();},[this]{return fullscreen();}});

menuCommands_.bind("openProjectFolder",{[this]{openProjectFolder();},[this]{return documentOpen_ && !homeOpen_ && !projectFolderSource().empty();},{}});

menuCommands_.bind("replaceColor",{[this]{openReplaceColor();},{},{}});

menuCommands_.bind("importSpriteSheet",{[this]{chooseSheetSource();},{},{}});

menuCommands_.bind("importSpriteSheetDocument",{[this]{openSheetImport(false);},{},{}});

menuCommands_.bind("importSpriteSheetSelection",{[this]{openSheetImport(true);},[this]{return currentDocument().selection().has_value();},{}});

menuCommands_.bind("exportSpriteSheet",{[this]{openSpriteSheet();},{},{}});

menuCommands_.bind("exportAllFrames",{[this]{openFramePngExport();},[this]{return currentDocument().timeline().state().frames.size()>1;},{}});

menuCommands_.bind("exportDocument",{[this]{openDocumentExport();},{},{}});

for(const auto& choice:std::vector<std::pair<std::string,color_mode::Mode>>{{"convertColorModeRgba",color_mode::Mode::Rgba},{"convertColorModeGrayscale",color_mode::Mode::Grayscale}}){const auto mode=choice.second;menuCommands_.bind(choice.first,{[this,mode]{try{if(currentDocument().convertColorMode(mode))refresh();}catch(const std::exception& e){status_=U"颜色模式转换失败："+unicodeText(e.what());refresh();}},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy()&&!currentDocument().active();},[this,mode]{return currentDocument().colorMode()==mode;}});}
menuCommands_.bind("canvasResize",{[this]{openCanvasResize();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&(!currentDocument().active()||currentDocument().floating());},{}});
for(const auto& definition:filterPresetDefinitions()){const auto preset=definition.preset;menuCommands_.bind("filter:"+std::string(definition.id),{[this,preset]{openFilterPreset(preset);},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&(!currentDocument().active()||currentDocument().floating());},{}});}
menuCommands_.bind("lcdScreen",{[this]{openFilterPreset(FilterPreset::CrtSubtle,0,true);},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&(!currentDocument().active()||currentDocument().floating())&&currentDocument().timelineSelection().layers.size()==1;},{}});
menuCommands_.bind("imageResize",{[this]{openImageResize();},{},{}});

menuCommands_.bind("invertColors",{[this]{try{if(currentDocument().beginColorAdjustment()){ColorAdjustment a;a.kind=ColorAdjustmentKind::Invert;currentDocument().updateColorAdjustment(a);{Document::HistoryLabelScope historyLabel(currentDocument(),U"反相");currentDocument().commitColorAdjustment();}refresh();}}catch(const std::exception& e){currentDocument().cancelColorAdjustment();status_=U"颜色调整失败："+unicodeText(e.what());refresh();}},{},{}});

menuCommands_.bind("gradientMap",{[this]{openGradientMap();},{},{}});

menuCommands_.bind("outline",{[this]{openOutline();},{},{}});
menuCommands_.bind("quickOutline",{[this]{quickOutline();},{},{}});
menuCommands_.bind("outlineSelectionInside",{[this]{quickOutline(true);},[this]{return bool(currentDocument().selection());},{}});
menuCommands_.bind("quickAntiAlias",{[this]{openAntiAlias();},{},{}});

menuCommands_.bind("cropCanvas",{[this]{cropCanvas();},[this]{return currentDocument().selection().has_value();},{}});

menuCommands_.bind("trimCurrentFrame",{[this]{trimCanvas(false);},{},{}});

menuCommands_.bind("trimCanvas",{[this]{trimCanvas(true);},{},{}});

menuCommands_.bind("convolution",{[this]{openConvolution();},{},{}});

menuCommands_.bind("adjustmentCurves",{[this]{openColorAdjustment(ColorAdjustmentKind::Curves);},{},{}});

menuCommands_.bind("adjustmentColorBalance",{[this]{openColorAdjustment(ColorAdjustmentKind::ColorBalance);},{},{}});

menuCommands_.bind("adjustmentBrightnessContrast",{[this]{openColorAdjustment(ColorAdjustmentKind::BrightnessContrast);},{},{}});

menuCommands_.bind("adjustmentHueSaturation",{[this]{openColorAdjustment(ColorAdjustmentKind::HueSaturation);},{},{}});

menuCommands_.bind("transform",{[this]{beginLayerTransform();},{},{}});

menuCommands_.bind("newBackgroundLayer",{[this]{showBackgroundLayer();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy();},{}});
auto backgroundTarget=[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy()&&!currentDocument().hasSelectedGroups()&&currentDocument().timelineSelection().layers.size()<=1;};
menuCommands_.bind("createLinkedLayer",{[this]{currentDocument().createLinkedLayer(currentDocument().layer().id);refresh();},[this,backgroundTarget]{return backgroundTarget()&&currentDocument().canCreateLinkedLayer(currentDocument().layer().id);},{}});
menuCommands_.bind("convertLayerToBackground",{[this]{currentDocument().setLayerBackground(currentDocument().layer().id,true);refresh();},[this,backgroundTarget]{return backgroundTarget()&&currentDocument().layer().kind.empty()&&!currentDocument().layer().background;},{}});
menuCommands_.bind("convertLayerToRaster",{[this]{currentDocument().rasterizeLayer(currentDocument().layer().id);refresh();},[this,backgroundTarget]{return backgroundTarget()&&currentDocument().canRasterizeLayer(currentDocument().layer().id);},{}});
menuCommands_.bind("newLayer",{[this]{createLayer();},{},{}});

menuCommands_.bind("mergeVisibleLayers",{[this]{try{currentDocument().mergeVisibleLayers();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},[this]{int count=0;for(const auto& l:currentDocument().timeline().state().layers)if(currentDocument().layerEffectivelyVisible(l)){if(currentDocument().layerEffectivelyLocked(l))return false;++count;}return count>=2;},{}});

menuCommands_.bind("duplicateLayer",{[this]{currentDocument().duplicateSelectedLayers();refresh();},[this]{return currentDocument().canDuplicateSelectedLayers();},{}});

menuCommands_.bind("mergeLayerDown",{[this]{try{currentDocument().mergeLayerDown();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},{[this]{return currentDocument().canMergeLayerDown();}},{}});

menuCommands_.bind("mergeSelectedLayers",{[this]{try{currentDocument().mergeSelectedLayers();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},[this]{return currentDocument().canMergeSelectedLayers();},{}});

menuCommands_.bind("deleteLayer",{[this]{currentDocument().deleteSelectedLayers();},[this]{return currentDocument().canDeleteSelectedLayers();},{}});

menuCommands_.bind("editDelete",{[this]{deleteWorkspaceContent(false);},[this]{return canDeleteWorkspaceContent();},{}});

menuCommands_.bind("newDocument",{[this]{ask(Pending::New);},{},{}});

menuCommands_.bind("openDocument",{[this]{chooseProject();},{},{}});

menuCommands_.bind("openTimelapse",{[this]{showTimelapse();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None;},{}});
menuCommands_.bind("closeDocument",{[this]{ask(Pending::CloseDocument);},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None;},{}});
menuCommands_.bind("save",{[this]{saveProject(false);},{},{}});

menuCommands_.bind("saveAs",{[this]{saveProject(true);},{},{}});

menuCommands_.bind("undo",{[this]{requestHistoryAction(workspace::HistoryAction::Undo);},[this]{return historyActionAvailable(workspace::HistoryAction::Undo);},{}});

menuCommands_.bind("redo",{[this]{requestHistoryAction(workspace::HistoryAction::Redo);},[this]{return historyActionAvailable(workspace::HistoryAction::Redo);},{}});

// Preferences and layer properties are partial migrations: title/description in

// the destination dialog must state recovery-only and opacity-only coverage.

menuCommands_.bind("openPreferences",{[this]{showPreferences();},{},{}});

menuCommands_.bind("createLayerGroup",{[this]{currentDocument().createLayerGroup();refresh();},[this]{return pending_==Pending::None;},{}});
menuCommands_.bind("ungroupLayers",{[this]{currentDocument().ungroupSelected();refresh();},[this]{return currentDocument().hasSelectedGroups();},{}});
menuCommands_.bind("mergeLayerGroup",{[this]{currentDocument().mergeSelectedGroup();refresh();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy()&&currentDocument().canMergeSelectedGroup();},{}});
menuCommands_.bind("toggleSelectedGroupCollapsed",{[this]{auto groups=currentDocument().selectedGroupIds();for(const auto& id:groups)currentDocument().toggleGroupCollapsed(id);refresh();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!currentDocument().selectedGroupIds().empty();},{}});
menuCommands_.bind("toggleClippingMask",{[this]{currentDocument().toggleClippingMask();refresh();},[this]{return currentDocument().canToggleClippingMask();},[this]{return currentDocument().activeClippingMask();}});
menuCommands_.bind("toggleLayerMask",{[this]{const auto owner=selectedMaskPropertyOwner();if(owner.empty())return;if(currentDocument().layerEffectivelyLocked(currentDocument().timeline().state().layers[currentDocument().timeline().layerIndex(owner)])){status_=U"图层已锁定，无法创建蒙版";return;}if(currentDocument().createLayerMasksForLayer(owner)){currentView().maskSlots.clear();if(!currentDocument().activeMaskId().empty())currentView().maskSlots.push_back({owner,currentDocument().frame().id});currentView().virtualSlots.clear();currentView().virtualAnchor.reset();currentView().frameSelection=false;}refresh();},[this]{const auto owner=selectedMaskPropertyOwner();return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!owner.empty()&&!currentDocument().findGroup(owner)&&currentDocument().canCreateLayerMasksForLayer(owner);},{}});
menuCommands_.bind("toggleGroupMask",{[this]{const auto owner=selectedMaskPropertyOwner();const auto* group=currentDocument().findGroup(owner);if(!group)return;if(timeline::isGroupEffectivelyLocked(currentDocument().timeline().state(),*group)){status_=U"图层组已锁定，无法修改蒙版";return;}const auto frame=currentDocument().frame().id;if(timeline::directMask(currentDocument().timeline().state(),owner,frame))currentDocument().deleteAttachedMask(owner,frame);else currentDocument().createAttachedMask(owner,frame,true);currentView().maskSlots.clear();if(!currentDocument().activeMaskId().empty())currentView().maskSlots.push_back({owner,frame});currentView().virtualSlots.clear();currentView().virtualAnchor.reset();currentView().frameSelection=false;refresh();},[this]{const auto owner=selectedMaskPropertyOwner();return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!owner.empty()&&currentDocument().findGroup(owner);},{}});
menuCommands_.bind("maskMoveBinding",{[this]{if(const auto* slot=selectedOwnerMask()){const auto* mask=timeline::resolvedMask(currentDocument().timeline().state(),slot->ownerId,slot->frameId);if(mask)currentDocument().setMaskMoveWithOwner(slot->ownerId,slot->frameId,!mask->moveWithOwner);}refresh();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&selectedOwnerMask();},{}});
menuCommands_.bind("openLayerStyles",{[this]{showColorOverlay();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!currentDocument().active()&&!currentDocument().layerStyleTargets().empty();},{}});
menuCommands_.bind("toggleLayerStyles",{[this]{auto ids=currentDocument().layerStyleTargets();if(ids.empty())return;currentDocument().setLayerStylesEnabled(ids,!timeline::styleVisible(currentDocument().layerStyle(ids.front())));refresh();},[this]{auto ids=currentDocument().layerStyleTargets();return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!currentDocument().active()&&!ids.empty()&&timeline::styleConfigured(currentDocument().layerStyle(ids.front()));},[this]{auto ids=currentDocument().layerStyleTargets();return !ids.empty()&&timeline::styleVisible(currentDocument().layerStyle(ids.front()));}});
menuCommands_.bind("copyLayerStyles",{[this]{auto ids=currentDocument().layerStyleTargets();if(!ids.empty()){copiedLayerStyle_=currentDocument().layerStyle(ids.front());layerStyleClipboard_=copiedLayerStyle_.has_value();}},[this]{auto ids=currentDocument().layerStyleTargets();return !currentDocument().active()&&!ids.empty()&&currentDocument().layerStyle(ids.front()).has_value();},{}});
menuCommands_.bind("pasteLayerStyles",{[this]{if(layerStyleClipboard_&&currentDocument().beginLayerStyle())currentDocument().commitLayerStyle(copiedLayerStyle_);refresh();},[this]{return layerStyleClipboard_&&!currentDocument().active()&&!currentDocument().layerStyleTargets().empty();},{}});
menuCommands_.bind("splitLayerStyles",{[this]{try{currentDocument().splitLayerStyles();refresh();}catch(const std::exception& e){showSaveError(e);}},[this]{return pending_==Pending::None&&currentDocument().canSplitLayerStyles();},{}});
menuCommands_.bind("clearLayerStyles",{[this]{if(currentDocument().beginLayerStyle())currentDocument().commitLayerStyle({});refresh();},[this]{auto ids=currentDocument().layerStyleTargets();return !currentDocument().active()&&!ids.empty()&&currentDocument().layerStyle(ids.front()).has_value();},{}});
menuCommands_.bind("newGradientMapLayer",{[this]{openGradientMapLayer(true);},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!currentDocument().active();},{}});
menuCommands_.bind("openLayerProperties",{[this]{openSelectedLayerProperties();},[this]{return !currentDocument().timelineSelection().layers.empty()||currentDocument().hasSelectedGroups();},{}});

menuCommands_.bind("advancedMode",{[this]{cycleAdvancedMode();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None;},[this]{return advancedActive();}});
menuCommands_.bind("resetView",{[this]{

 currentView().zoom=16; const auto viewport=canvasViewport();

 const int width=int(std::lround(currentDocument().width()*canvasScale()));

 const int height=int(std::lround(currentDocument().height()*canvasScale()));

 currentView().canvas=gfx::Rect(viewport.x+(viewport.w-width)/2,viewport.y+(viewport.h-height)/2,width,height);

 invalidate();

},{},{}});

menuCommands_.bind("gridAlignment",{[this]{try{auto next=runtimePreferences_;next.set("tools.gridAlignmentEnabled",next.flag("tools.gridAlignmentEnabled")?"false":"true");if(!smoke_){if(!runtimePreferencesReadable_)throw std::runtime_error("editor-preferences.txt unreadable");const auto text=next.encode();writeExportBytesAtomic(palettePreferencePath().parent_path()/"editor-preferences.txt",std::vector<std::uint8_t>(text.begin(),text.end()));}runtimePreferences_=std::move(next);refresh();}catch(const std::exception& e){status_=U"网格对齐保存失败："+unicodeText(e.what());refresh();}},[this]{return documentOpen_&&pending_==Pending::None;},[this]{return runtimePreferences_.flag("tools.gridAlignmentEnabled");}});
menuCommands_.bind("smartAlignment",{[this]{try{auto next=runtimePreferences_;next.set("tools.smartAlignmentEnabled",next.flag("tools.smartAlignmentEnabled")?"false":"true");if(!smoke_){if(!runtimePreferencesReadable_)throw std::runtime_error("editor-preferences.txt unreadable");const auto text=next.encode();writeExportBytesAtomic(palettePreferencePath().parent_path()/"editor-preferences.txt",std::vector<std::uint8_t>(text.begin(),text.end()));}runtimePreferences_=std::move(next);refresh();}catch(const std::exception& e){status_=U"智能对齐保存失败："+unicodeText(e.what());refresh();}},[this]{return documentOpen_&&pending_==Pending::None;},[this]{return runtimePreferences_.flag("tools.smartAlignmentEnabled");}});
menuCommands_.bind("alignmentGuides",{[this]{try{auto next=runtimePreferences_;next.set("tools.alignmentGuidesVisible",next.flag("tools.alignmentGuidesVisible")?"false":"true");if(!smoke_){if(!runtimePreferencesReadable_)throw std::runtime_error("editor-preferences.txt unreadable");const auto text=next.encode();writeExportBytesAtomic(palettePreferencePath().parent_path()/"editor-preferences.txt",std::vector<std::uint8_t>(text.begin(),text.end()));}runtimePreferences_=std::move(next);refresh();}catch(const std::exception& e){status_=U"对齐辅助线保存失败："+unicodeText(e.what());refresh();}},[this]{return documentOpen_&&pending_==Pending::None;},[this]{return runtimePreferences_.flag("tools.alignmentGuidesVisible");}});

menuCommands_.bind("toggleCustomGrid",{[this]{currentDocument().setCustomGrid(!currentDocument().showCustomGrid(),currentDocument().customGrid());refresh();},[this]{return documentOpen_&&pending_==Pending::None;},[this]{return currentDocument().showCustomGrid();}});

menuCommands_.bind("openGridSettings",{[this]{showCustomGridSettings();},[this]{return documentOpen_&&pending_==Pending::None;}});

menuCommands_.bind("toggleGrid",{[this]{currentDocument().setPixelGrid(!currentDocument().showPixelGrid());refresh();},[this]{return documentOpen_&&pending_==Pending::None;},[this]{return currentDocument().showPixelGrid();}});

    menuCommands_.bind("toggleColorPanel",{[this]{togglePickerColumn(1);},{},[this]{return colorPickerOpen_;}});
    const char* pickerCommands[]{"toggleMoonRingPanel","toggleHsPanel","toggleWheelPanel","toggleNormalMapPanel"};
    for(int id=4;id<8;++id)menuCommands_.bind(pickerCommands[id-4],{[this,id]{togglePickerColumn(id);},{},[this,id]{return pickerOpen_[id];}});

menuCommands_.bind("toggleLayersPanel",{[this]{layersPanelOpen_=!layersPanelOpen_;refresh();},{},[this]{return columnShown(2);}});

menuCommands_.bind("togglePalettePanel",{[this]{palettePanelOpen_=!palettePanelOpen_;if(palettePanelOpen_)docking_.select(0);refresh();saveWorkspaceSizes();},{},[this]{return palettePanelOpen_;}});

menuCommands_.bind("togglePreviewPanel",{[this]{previewPanelOpen_=!previewPanelOpen_;if(previewPanelOpen_)docking_.select(3);refresh();saveWorkspaceSizes();},{},[this]{return previewPanelOpen_;}});

menuCommands_.bind("relativeLuminance",{[this]{setRelativeLuminance(!currentView().relativeLuminance);invalidateRect(canvasViewport());},{},[this]{return currentView().relativeLuminance;}});

menuCommands_.bind("toggleSelectionOutline",{[this]{toggleSelectionOutline();refresh();},[this]{return bool(currentDocument().selection());},[this]{return !currentView().showSelectionOutline;}});

menuCommands_.bind("flipHorizontal",{[this]{currentDocument().flipContent(true);refresh();},{},{}});

menuCommands_.bind("flipVertical",{[this]{currentDocument().flipContent(false);refresh();},{},{}});

menuCommands_.bind("rotateContentClockwise",{[this]{if(currentDocument().rotateContent(90)){currentView().pivot.reset();currentPlayback().playing=false;}refresh();},{},{}});

menuCommands_.bind("rotateContentCounterClockwise",{[this]{if(currentDocument().rotateContent(-90)){currentView().pivot.reset();currentPlayback().playing=false;}refresh();},{},{}});

menuCommands_.bind("rotateContent180",{[this]{if(currentDocument().rotateContent180()){currentView().pivot.reset();currentPlayback().playing=false;}refresh();},{},{}});

menuCommands_.bind("centerContentBoth",{[this]{centerContent(true,true);},{},{}});

menuCommands_.bind("centerContentHorizontal",{[this]{centerContent(true,false);},{},{}});

menuCommands_.bind("centerContentVertical",{[this]{centerContent(false,true);},{},{}});

menuCommands_.bind("copyMerged",{[this]{copyMergedPixels();},[this]{return !currentDocument().active() || currentDocument().floating();},{}});

menuCommands_.bind("fillForeground",{[this]{currentPlayback().playing=false;currentDocument().fillSelectionOrCanvas(currentDocument().palette().primary);refresh();},[this]{return !currentDocument().active() || currentDocument().floating();},{}});

menuCommands_.bind("freeTransform",{[this]{startFreeSelectionTransform();},[this]{return bool(currentDocument().selection());},{}});

menuCommands_.bind("createBackgroundPresetFromSelection",{[this]{createSelectionBackgroundPreset();},[this]{return bool(currentDocument().selection());},{}});

menuCommands_.bind("createBrushFromSelection",{[this]{createBrushFromSelection();},[this]{return bool(currentDocument().selection()) && !currentDocument().active();},{}});

menuCommands_.bind("selectAll",{[this]{selectAllPixels();},{}, {}});

menuCommands_.bind("deselect",{[this]{currentDocument().deselectPixels();selectionPropertiesActive_=false;currentView().freeTransform=false;currentView().pivot.reset();currentView().pivotMask.reset();refresh();},[this]{return bool(currentDocument().selection());},{}});

menuCommands_.bind("invertSelection",{[this]{currentDocument().invertPixels();refresh();},[this]{return bool(currentDocument().selection());},{}});

menuCommands_.bind("copy",{[this]{copyEditorClipboard();},[this]{if(!paletteFocused_&&currentDocument().selection()&&currentDocument().layer().kind=="free-tile"&&currentDocument().activeMaskId().empty())return pixelClipboardContext();if(!paletteFocused_&&!currentDocument().selection()&&!currentView().maskSlots.empty())return true;if(!paletteFocused_&&currentDocument().freeTileInstanceView()&&!currentDocument().selectedFreeTileInstances().empty())return true;return paletteFocused_?!currentDocument().palette().selected.empty():mixedPixelCopyContext()||!currentDocument().hasTilemapContent()||(!currentDocument().active()&&!currentDocument().selection()&&currentDocument().activeMaskId().empty());},{}});

menuCommands_.bind("cut",{[this]{copyEditorClipboard(true);},[this]{if(!paletteFocused_&&currentDocument().selection()&&currentDocument().layer().kind=="free-tile"&&currentDocument().activeMaskId().empty())return pixelClipboardContext();if(!paletteFocused_&&!currentDocument().selection()&&!currentView().maskSlots.empty())return true;if(!paletteFocused_&&currentDocument().freeTileInstanceView()&&!currentDocument().selectedFreeTileInstances().empty())return true;if(mixedPixelCopyContext(true))return true;if(currentDocument().hasTilemapContent())return !paletteFocused_&&!currentDocument().selection()&&currentDocument().activeMaskId().empty()&&(!celClipboardContext()||!currentDocument().active())&&(celClipboardContext()||currentView().frameSelection||currentDocument().canDeleteSelectedLayers());return !paletteFocused_&&(currentDocument().selection()||celClipboardContext()||currentView().frameSelection||currentDocument().canDeleteSelectedLayers());},{}});

openScriptFolder_=[] {script::Service().openFolder();};
menuCommands_.bind("openScriptFolder",{[this]{try{openScriptFolder_();}catch(const std::exception& e){status_=U"打开脚本文件夹失败："+unicodeText(e.what());invalidate();}},{},{}});
menuCommands_.bind("userGuide",{[this]{showHelp(false,helpVerify_);},[this]{return pending_==Pending::None;},{}});
menuCommands_.bind("tips",{[this]{showHelp(true,helpVerify_);},[this]{return pending_==Pending::None;},{}});
menuCommands_.bind("openProjectInfo",{[this]{showProjectInformation(projectInformationVerify_);},[this]{return pending_==Pending::None&&documentOpen_&&!homeOpen_;},{}});
menuCommands_.bind("openLatestRelease",{[this]{showLatestRelease(0,releaseNotesVerify_);},[this]{return pending_==Pending::None;},{}});
menuCommands_.bind("openAbout",{[this]{showAbout();},[this]{return pending_==Pending::None;},{}});
menuCommands_.bind("pasteAsNewDocument",{[this]{pasteAsNewDocument();},[this]{return pending_==Pending::None;},{}});
// Explicit paste targets bypass palette/frame routing while preserving the
// clipboard service's external-image versus structured-layer precedence.
menuCommands_.bind("pasteToCurrentCell",{[this]{
 const bool palette=paletteFocused_,frames=currentView().frameSelection;paletteFocused_=false;currentView().frameSelection=false;
 try{const auto payload=pixelClipboard_.read();if(!payload&&layerClipboardSnapshot_)currentDocument().pasteLayerClipboard(*layerClipboardSnapshot_);else pasteSelectionPixels();}catch(...){paletteFocused_=palette;currentView().frameSelection=frames;throw;}
 paletteFocused_=palette;currentView().frameSelection=frames;refresh();
},[this]{return !historyGestureBusy()&&(currentDocument().layer().kind.empty()||currentDocument().layer().kind=="free-tile"||!currentDocument().activeMaskId().empty());},{}});
menuCommands_.bind("pasteAsNewLayer",{[this]{
 const auto system=pixelClipboard_.readSystemSelection();
 if(layerClipboardSnapshot_&&pixelClipboard_.preferStructuredCopy(system)){currentDocument().pasteLayerClipboard(*layerClipboardSnapshot_);currentView().virtualSlots.clear();currentView().virtualAnchor.reset();refresh();return;}
 const auto payload=pixelClipboard_.read();if(!payload){if(layerClipboardSnapshot_)currentDocument().pasteLayerClipboard(*layerClipboardSnapshot_);else status_=U"剪贴板没有可粘贴内容";refresh();return;}
 const auto viewport=canvasViewport();const double scale=canvasScale();
 const auto placement=PixelClipboard::resolvePlacement(*payload,currentDocument().width(),currentDocument().height(),int(std::floor((viewport.x-currentView().canvas.x)/scale)),int(std::floor((viewport.y-currentView().canvas.y)/scale)),int(std::ceil((viewport.x2()-currentView().canvas.x)/scale)),int(std::ceil((viewport.y2()-currentView().canvas.y)/scale)));
 if(currentDocument().pastePixelsAsNewLayer(*payload,placement,currentView().pivot)){currentPlayback().playing=false;currentTools().liquifyTool=currentTools().smoothTool=currentTools().airbrushTool=currentTools().textTool=currentTools().moveTool=currentTools().shapeTool=currentTools().gradientTool=currentTools().fillTool=currentTools().eraser=currentTools().eyedropperTool=currentTools().handTool=false;currentTools().zoomTool=false;currentTools().selectionTool=true;currentTools().selectionKind=currentTools().selectionMode=0;selectionPropertiesActive_=currentView().freeTransform=false;currentView().pivot.reset();currentView().pivotMask.reset();currentView().maskSlots.clear();currentView().virtualSlots.clear();currentView().virtualAnchor.reset();currentView().frameSelection=false;paletteFocused_=false;status_=U"已粘贴为新图层。";}refresh();
},[this]{return !historyGestureBusy();},{}});
menuCommands_.bind("paste",{[this]{pasteEditorClipboard();},[this]{if(!paletteFocused_&&!currentDocument().selection()&&currentDocument().hasMaskClipboard()&&(!currentView().maskSlots.empty()||celClipboardContext()))return true;if(mixedPixelPasteContext())return true;if(!paletteFocused_&&currentDocument().layer().kind=="free-tile"&&currentDocument().layer().freeTiles&&currentDocument().freeTileCel().freeTiles&&currentDocument().activeMaskId().empty()&&!currentDocument().layerEffectivelyLocked(currentDocument().layer())&&!currentDocument().active()&&!currentView().frameSelection)return true;if(currentDocument().hasTilemapContent()&&!paletteFocused_)return currentDocument().activeMaskId().empty()&&(layerClipboardSnapshot_||(celClipboardContext()?!currentDocument().active()&&!currentDocument().selection()&&hasApplicationCelClipboard()&&!applicationCelSelectionOnly():currentView().frameSelection&&hasApplicationFrameClipboard()));return bool(layerClipboardSnapshot_)||paletteFocused_||(celClipboardContext()?hasApplicationCelClipboard()&&(applicationCelSelectionOnly()||!currentDocument().selection()):currentView().frameSelection?hasApplicationFrameClipboard():pixelClipboardContext());},{}});

// Existing item(...) helper owns pending/dialog checks and cancelStroke.

// Do NOT recreate skin/editor entries. Keep external theme runtime loading.

std::function<void(PixelMenu*,const std::string&)> appendChildren=[&](PixelMenu* parent,const std::string& id){

 if(id=="recent"){recentMenu_=parent;updateRecentMenu();}else if(id=="scripts"){scriptsMenu_=parent;parent->OpenPopup.connect([this]{if(scripts_){updateScriptsMenu();}});auto empty=new PixelMenuItem(font_,skin_,U"没有可用脚本");empty->setEnabled(false);parent->addChild(empty);}

 for(const auto& e:menus::catalog())if(id==e.parent){

  if(e.separatorBefore && !parent->children().empty())parent->addChild(new PixelMenuSeparator(skin_));

  if(e.group){PixelMenu* branch=std::string(e.id)=="scripts"?new ScriptDiscoveryMenu(skin_):new PixelMenu(skin_);

   auto trigger=new PixelMenuItem(font_,skin_,e.title);trigger->setId(e.id);trigger->menuMarks=&toolIcons_;trigger->setSubmenu(branch);parent->addChild(trigger);appendChildren(branch,e.id);

  }else{

   const std::string command=e.id;

   item(parent,command,e.title,unicodeText(e.shortcut),[this,command]{menuCommands_.invoke(command);},[this,command]{return menuCommands_.enabled(command);},[this,command]{return menuCommands_.checked(command);});

  }

 }

};

PixelMenu* fileMenu=nullptr;

for(const auto& e:menus::catalog())if(!*e.parent){if(std::string(e.id)=="help"){auto pet=new PixelMenuItem(font_,skin_,U"宠物");pet->setEnabled(false);root->addChild(pet);}auto branch=group(e.title);branch->getOwnerMenuItem()->setId(e.id);if(std::string(e.id)=="file")fileMenu=branch;appendChildren(branch,e.id);}

    item(fileMenu,"recovery",U"恢复工程",U"",[this]{chooseRecovery();});

    menuItems_["new"]=menuItems_.at("newDocument");menuItems_["open"]=menuItems_.at("openDocument");

    sizeTimer_.Tick.connect([this]{flushSizeGeometry();});

    auto preview=new DialogBackground<PreviewPanel>(font_,skin_,toolIcons_,currentDocument());configureDialogBackground(preview);configureDialogBackground(preview->closeButton());previewPanel_=preview;columnClose_[3]=preview->closeButton();addChild(previewPanel_);

    initializeReferencePanel();initializeProjectRollback();
    createHistoryPanel();
    createTabletPanel();createTilesetPanel();createBrushLibraryPanel();initializeViewRotation();initializeQuickCommands();
    previewPanel_->configurePreviewSource([this]{const auto middle=canvasViewport().center();const auto at=canvasDocumentPoint(middle);return preview::Point{at.x,at.y};});
    previewPanel_->sampled=[this](timeline::Pixel color,bool secondary){setSharedColor(color,secondary);refresh();};
    previewPanel_->context=[this]{showColumnContextMenu(Column::Preview);};

    previewPanel_->paintTabs=[this](ui::Graphics& source){

      const auto clip=source.getClipBounds().offset(previewPanel_->bounds().origin());

      const auto& group=docking_.groups[docking_.groupOf(3)];

      auto paint=[&](int id){auto tab=dockingTabs_[id];if(!tab || !tab->isVisible())return;

        ui::Graphics g(source.display(),base::AddRef(source.getInternalSurface()),tab->bounds().x,tab->bounds().y);

        auto visible=tab->bounds();if(!tab->active)visible.h=std::max(0,toDisplay(columnFrame(3)).y-visible.y);

        g.saveClip();g.clipRect(tab->clientBounds());g.clipRect((visible&clip).offset(-tab->bounds().origin()));ui::PaintEvent ev(tab,&g);tab->onPaint(ev);g.restoreClip();};

      for(int id:group.tabs)if(!columnShown(id))paint(id);

      for(int id:group.tabs)if(columnShown(id))paint(id);

    };

    previewPanel_->closed=[this]{previewPanelOpen_=false;refresh();saveWorkspaceSizes();};

    previewPanel_->geometryChanged=[this]{saveWorkspaceSizes();updateNavigationCursor();};

    loadWorkspaceSizes();
    initializeWorkspacePresets();
    initializeShortcuts();

    try {recoveryPreferences_=recovery::loadPreferences(recoveryDirectory().parent_path()/"recovery-preferences.txt");currentRecovery().queue.setIntervalMinutes(recoveryPreferences_.minutes);currentRecovery().due=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(recoveryPreferences_.minutes*60000));}catch(const std::exception&e){status_=U"恢复设置读取失败："+unicodeText(e.what());}loadRecoveries(true);createHome();applyWorkspacePreferences();initializeColorRoles();refresh();

  }

struct Editor::ScriptState {
 script::Runtime runtime;script::Client client;std::unique_ptr<ExtensionMenuAdapter> menus;std::unique_ptr<ScriptWindowHost> host;ui::Timer timer;std::future<PatternBrushListing> brushes;std::vector<StoredPatternBrush> localBrushes;std::vector<std::u32string> notifications;std::string queued;std::uint64_t queuedIdentity=0;std::string queuedLayer,queuedFrame;std::uint64_t menuRevision=0;bool pumping=false,publishingMenu=false;
 ScriptState(Editor& editor,const std::filesystem::path& root):runtime(root),client(runtime),timer(30,&editor){}
};
void Editor::initializeScripts(const std::filesystem::path& root){
 if(scripts_)return;try{
  auto state=std::make_shared<ScriptState>(*this,root.empty()?script::executableDirectory():root);scripts_=state;
  state->host=std::make_unique<ScriptWindowHost>(state->client,font_,skin_,toolIcons_,display(),palettePreferencePath().parent_path()/"color-picker-size.txt",[this](const Document& d){
   using namespace winrt::Windows::Data::Json;JsonArray entries;const auto visible=columnVisibility();
   for(const auto& [name,index]:std::initializer_list<std::pair<const wchar_t*,int>>{{L"color",1},{L"palette",0},{L"layers",2},{L"freeTileInstances",13},{L"history",8},{L"preview",3},{L"reference",9},{L"tileset",11},{L"brushes",12},{L"tabletAssist",10}}){JsonObject item;item.Insert(L"id",JsonValue::CreateStringValue(name));item.Insert(L"visible",JsonValue::CreateBooleanValue(visible[index]));const auto group=docking_.groupOf(index);auto dock=group>=0?docking_.groups[group].dock:panels::Dock::Right;if(!docking_.custom){if(index==0||index==1)dock=panels::Dock::Left;else if(index==2)dock=panels::Dock::Bottom;}const wchar_t* docks[]{L"left",L"right",L"bottom",L"floating"};item.Insert(L"dock",JsonValue::CreateStringValue(docks[int(dock)]));entries.Append(item);}
   return script::buildMseSnapshot(d,scripts_->localBrushes,entries);
  },[this](Document&& d){addProject(std::move(d));refresh();});
  state->host->setNotificationHost([weak=std::weak_ptr<ScriptState>(state)](const std::u32string& message){if(auto active=weak.lock())active->notifications.push_back(message);});
  state->host->setStyleClipboardHost({[this]{return layerStyleClipboard_?copiedLayerStyle_:std::optional<timeline::ColorOverlayStyle>{};},[this](const auto& style){copiedLayerStyle_=style;layerStyleClipboard_=true;}});
  state->host->setPanelHost([this](Document& d,const script::PanelRequest& request){
   if(&d!=&currentDocument()||!documentOpen_||homeOpen_)return;
   const std::map<std::string,int> columns{{"color",1},{"palette",0},{"layers",2},{"freeTileInstances",13},{"history",8},{"preview",3},{"reference",9},{"tileset",11},{"brushes",12},{"tabletAssist",10}};const auto id=columns.at(request.id);
   if(request.visible&&columnVisibility()[id]!=*request.visible){
    if(id==13){freeTileInstancesOpen_=*request.visible;if(*request.visible){initializeDocking();docking_.custom=true;docking_.select(id);}refresh();saveWorkspaceSizes();}
    else{const std::map<int,const char*> commands{{0,"togglePalettePanel"},{1,"toggleColorPanel"},{2,"toggleLayersPanel"},{3,"togglePreviewPanel"},{8,"panelHistory"},{9,"panelReference"},{10,"panelTabletAssist"},{11,"toggleTilesetPanel"},{12,"toggleBrushLibraryPanel"}};menuCommands_.invoke(commands.at(id));saveWorkspaceSizes();}
   }
   if(request.dock){const std::map<std::string,panels::Dock> docks{{"left",panels::Dock::Left},{"right",panels::Dock::Right},{"bottom",panels::Dock::Bottom},{"floating",panels::Dock::Floating}};dockColumn(id,docks.at(*request.dock));}
  });
  state->host->setBrushHost([this](Document& d,const script::BrushRequest& request){
   if(&d!=&currentDocument()||!documentOpen_||homeOpen_)throw std::logic_error("Lua brush target changed");
   if(request.kind==script::BrushRequest::Kind::CreateFromSelection){
    if(!request.error.empty()){status_=unicodeText(request.error);invalidate();return;}
    try{if(!request.brush)throw std::logic_error("Missing selection brush");const auto& brush=*request.brush;
     PatternBrushLibrary captureLibrary(fillBrushLibraryDirectory());auto value=captureLibrary.save("笔刷",encodePatternBrushPng(brush),true,brush.sourceX,brush.sourceY);
     if(!currentTools().temporaryBrushReturnProfile)currentTools().temporaryBrushReturnProfile=currentTools().brushProfiles[0];currentTools().temporaryBrushActive=true;currentTools().brushProfiles[0].imagePaintMode=PatternPaintMode::Paint;currentTools().pencilImageBrushAngle=0;currentTools().pencilImageBrushId=value.id;currentTools().pencilImageBrush=brush;currentTools().fillPattern.brushes.clear();currentTools().fillLibrarySelection={};currentTools().fillImageName.clear();d.previewSelection({});currentView().pivot.reset();selectionPropertiesActive_=false;currentView().freeTransform=false;currentTools().selectionTool=currentTools().shapeTool=currentTools().eyedropperTool=currentTools().zoomTool=currentTools().gradientTool=currentTools().fillTool=currentTools().handTool=currentTools().eraser=false;brushLibraryNeedsReload_=true;
     status_=U"选区笔刷已保存到本地库";scripts_->localBrushes=captureLibrary.list().brushes;
    }catch(const std::exception& e){status_=U"创建选区笔刷失败："+unicodeText(e.what());}refresh();return;
   }
   PatternBrushLibrary library(fillBrushLibraryDirectory());
   if(request.kind==script::BrushRequest::Kind::ImportImages){
    wchar_t filename[32768]{};OPENFILENAMEW picker{};picker.lStructSize=sizeof(picker);picker.hwndOwner=GetActiveWindow();picker.lpstrFile=filename;picker.nMaxFile=32768;picker.lpstrFilter=L"图案图像\0*.png;*.jpg;*.jpeg;*.bmp;*.gif;*.webp\0\0";picker.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_FILEMUSTEXIST|OFN_ALLOWMULTISELECT;
    if(!GetOpenFileNameW(&picker))return;
    std::vector<std::filesystem::path> paths;auto first=std::filesystem::path(filename);auto next=filename+std::wcslen(filename)+1;if(!*next)paths.push_back(first);else for(;*next;next+=std::wcslen(next)+1)paths.push_back(first/next);
    // Legacy importBrushPaths retains successful files, reports per-file
    // failures to its caller, and does not activate the imported brush.
    for(const auto& path:paths)try{auto imported=importPatternBrush(path);library.save(utf8Text(imported.name),encodePatternBrushPng(imported.brush));}catch(const std::exception&){}
   }else{
    const auto& id=request.id;const auto project=std::find_if(d.projectBrushes().begin(),d.projectBrushes().end(),[&](const auto& b){return b.metadata.id==id;});
    if(project!=d.projectBrushes().end()){d.deleteProjectBrush(id);currentTools().fillLibrarySelection.removed("project:"+id);if(currentTools().pencilImageBrushId=="project:"+id){currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();}applyFillLibrarySelection();}
    else library.remove(id);
   }
   brushLibraryNeedsReload_=true;scripts_->localBrushes=library.list().brushes;refresh();
  });
  script::WorkspaceHost workspace;
  workspace.current=[this]()->Document*{return documentOpen_&&!homeOpen_?&currentDocument():nullptr;};
  workspace.find=[this](std::uint64_t id)->Document*{const auto owner=resolveSession(id);return owner?&owner->value:nullptr;};
  workspace.focus=[this](std::uint64_t id)->Document*{ensureProjects();for(std::size_t i=0;i<projects_.size();++i)if(projectDocument(i).identity()==id){activateProject(i);return documentOpen_&&currentDocument().identity()==id?&currentDocument():nullptr;}return nullptr;};
  workspace.execute=[this](const std::string& path,const std::string& options){runScriptWorkspace(path,options);};
  state->host->setWorkspaceHost(std::move(workspace));
  state->host->setExportHost([this](Document& d,const std::string& options){if(&d!=&currentDocument()||!documentOpen_||homeOpen_)throw std::logic_error("Lua export target changed");runScriptExport(options);});
  state->host->setSaveHost([this](Document& d,const script::SaveRequest& request){
   if(&d!=&currentDocument()||!documentOpen_||homeOpen_)throw std::logic_error("Lua save target changed");
   scriptSaving_=true;struct SaveGuard{bool& value;~SaveGuard(){value=false;}} savingGuard{scriptSaving_};
   const auto identity=d.identity();saveProject(request.saveAs,identity,request.optionsJson);
   // Pump the established bounded snapshot/worker save until it publishes. The
   // script coordinator remains receiving, so nested timers cannot rerun it.
   ui::MessageLoop loop(ui::Manager::getDefault());
   auto queued=[&]{return std::any_of(queuedSaves_.begin(),queuedSaves_.end(),[&](const auto& q){return q.identity==identity;});};
   while(pending_==Pending::Saving||backgroundSaveBusy(identity)||queued()){if(pending_!=Pending::None&&pending_!=Pending::Saving)break;saveTick();if(pending_==Pending::Saving||backgroundSaveBusy(identity)||queued())loop.pumpMessages();}
   if(scriptSaveClose_){scriptSaveClose_=false;auto callback=new ui::CallbackMessage([this]{requestClose();});callback->setRecipient(ui::Manager::getDefault());ui::Manager::getDefault()->enqueueMessage(callback);}
  });
  state->host->setPlaybackHost([this](Document& d,const script::PlaybackRequest& request){applyScriptPlayback(d,request);});
  state->menus=std::make_unique<ExtensionMenuAdapter>(font_,skin_,toolIcons_,this,menuBar_,palettePreferencePath().parent_path()/"extension-storage.json",[this]{return pending_==Pending::None;},[this]{return documentOpen_&&!homeOpen_;},[this]{return !scripts_||scripts_->client.busy()||!scripts_->queued.empty();},[this](const std::string& id){runScript(id);},[this]{refresh();},[this](const std::u32string& error){status_=error;invalidate();});
  state->timer.Tick.connect([this]{pumpScripts();});state->timer.start();updateScriptsMenu();
 }catch(const std::exception& e){stopScripts();status_=U"脚本初始化失败："+unicodeText(e.what());invalidate();}
}
void Editor::stopScripts(){if(!scripts_)return;scripts_->timer.stop();scripts_->host.reset();scripts_.reset();}
void Editor::runScript(const std::string& id){if(!scripts_||scripts_->client.busy()||!scripts_->queued.empty()||pending_!=Pending::None||!documentOpen_||homeOpen_)return;cancelStroke();if(!scripts_->brushes.valid())scripts_->brushes=std::async(std::launch::async,[path=fillBrushLibraryDirectory()]{return PatternBrushLibrary(path).list();});scripts_->queued=id;scripts_->queuedIdentity=currentDocument().identity();scripts_->queuedLayer=currentDocument().layer().id;scripts_->queuedFrame=currentDocument().frame().id;}
bool Editor::escapeScript(){if(!scripts_||(!scripts_->client.session()&&!scripts_->host->hasReport()))return false;scripts_->host->queueEscape();return true;}
void Editor::pumpScripts(){
 if(!scripts_||scripts_->pumping)return;auto state=scripts_;state->pumping=true;struct Guard{bool& value;~Guard(){value=false;}} guard{state->pumping};
 if(state->brushes.valid()&&state->brushes.wait_for(std::chrono::seconds(0))==std::future_status::ready){try{state->localBrushes=state->brushes.get().brushes;}catch(const std::exception& e){state->queued.clear();state->client.failRequest(e.what());}}
 if(pending_!=Pending::None)return;
 if(state->menus)state->menus->pump();
 auto* active=documentOpen_&&!homeOpen_?&currentDocument():nullptr;
 const auto identity=currentDocument().identity(),content=currentDocument().contentRevision(),history=currentDocument().historyRevision(),overlay=currentDocument().floatingOverlayRevision();const auto frame=currentDocument().frame().id,layer=currentDocument().layer().id;
 if(!state->queued.empty()&&!state->brushes.valid()){auto id=std::move(state->queued);state->queued.clear();if(active&&state->queuedIdentity==currentDocument().identity()&&state->queuedLayer==currentDocument().layer().id&&state->queuedFrame==currentDocument().frame().id)state->host->run(active,std::move(id));}
 state->host->pump(active,std::chrono::steady_clock::now()+std::chrono::milliseconds(3));
 // Publish discovery only after reception; do not enqueue another scan here.
 if(state->menuRevision!=state->client.listingRevision()){struct Publishing{bool& flag;Publishing(bool& f):flag(f){flag=true;}~Publishing(){flag=false;}} publishing(state->publishingMenu);updateScriptsMenu();}
 // Legacy setTimeout(0): deliver after result handling and any tab adoption.
 if(!state->notifications.empty()){status_=std::move(state->notifications.back());state->notifications.clear();invalidate();}
 if(identity!=currentDocument().identity()||content!=currentDocument().contentRevision()||history!=currentDocument().historyRevision()||overlay!=currentDocument().floatingOverlayRevision()||frame!=currentDocument().frame().id||layer!=currentDocument().layer().id)refresh();
}
void Editor::updateScriptsMenu(){
 if(!scriptsMenu_||!scripts_)return;auto& client=scripts_->client;if(!scripts_->publishingMenu)client.refresh();scripts_->menuRevision=client.listingRevision();auto folderItem=menuItems_.at("openScriptFolder");auto children=scriptsMenu_->children();for(auto child:children){scriptsMenu_->removeChild(child);if(child!=folderItem)delete child;}
 if(scripts_->menus)scripts_->menus->request(client.extensionsJson());
 using namespace winrt::Windows::Data::Json;JsonArray list;for(auto value:JsonArray::Parse(winrt::to_hstring(client.scriptsJson())))if(!scripts_->menus||!scripts_->menus->placed(winrt::to_string(value.GetObject().GetNamedString(L"id"))))list.Append(value);
 if(client.loadFailed()||!list.Size()){auto empty=new PixelMenuItem(font_,skin_,client.loading()?U"正在加载脚本…":client.loadFailed()?U"脚本列表读取失败":U"没有可用脚本");empty->setEnabled(false);scriptsMenu_->addChild(empty);}
 else for(const auto& value:list){auto entry=value.GetObject();const auto id=winrt::to_string(entry.GetNamedString(L"id"));auto row=new PixelMenuItem(font_,skin_,unicodeText(winrt::to_string(entry.GetNamedString(L"name"))));row->available=[this]{return scripts_&&!scripts_->client.busy()&&scripts_->queued.empty()&&documentOpen_&&!homeOpen_&&pending_==Pending::None;};row->setId(id.c_str());row->Click.connect([this,id]{runScript(id);});scriptsMenu_->addChild(row);}
 scriptsMenu_->addChild(new PixelMenuSeparator(skin_));scriptsMenu_->addChild(folderItem);
 // The MIT Aseprite MenuBoxWindow owns popup geometry. Reflow its current
 // contents in place after asynchronous publication, retaining its screen anchor.
 if(auto owner=scriptsMenu_->getOwnerMenuItem();owner&&owner->hasSubmenuOpened()){
  auto popup=owner->getSubmenuContainer()->window();const auto previous=popup->bounds();popup->remapWindow();auto next=popup->bounds();const auto area=popup->display()->bounds();next.x=std::clamp(previous.x,area.x,std::max(area.x,area.x2()-next.w));next.y=std::clamp(previous.y,area.y,std::max(area.y,area.y2()-next.h));popup->setBounds(next);popup->invalidate();
 }
}
// Keep archive decoding temporaries off the nested UI/script verification stack.
__declspec(noinline) static std::unique_ptr<Document> readScriptBoundaryProject(const std::filesystem::path& path){
 std::ifstream file(path,std::ios::binary|std::ios::ate);if(!file)throw std::runtime_error("Boundary output missing");auto bytes=std::make_shared<project::Bytes>(std::size_t(file.tellg()));file.seekg(0);if(!file.read(reinterpret_cast<char*>(bytes->data()),std::streamsize(bytes->size())))throw std::runtime_error("Boundary output read failed");
 return std::make_unique<Document>(project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(bytes))));
}
// Keep the large integration fixture off the enclosing entry-check stack.
__declspec(noinline) void Editor::smokeScriptWorkspace(const std::filesystem::path& root){
 // Real workspace boundaries through the asynchronous production host.
 {
  using namespace winrt::Windows::Data::Json;
  auto runBoundary=[&](const std::string& code,bool fail=false){std::ofstream(root/"workspace-check-trace.txt",std::ios::app)<<"\n"<<code<<std::endl;std::ofstream(root/"scripts/workspace-entry.lua")<<code;runScript("workspace-entry.lua");const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(30);do{pumpScripts();std::this_thread::yield();}while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<until);if(scripts_->client.running()||(!scripts_->client.error().empty())!=fail)throw std::runtime_error("Formal workspace boundary failed: "+scripts_->client.error());if(fail){if(!escapeScript())throw std::runtime_error("Boundary report missing");pumpScripts();}};
  std::ofstream(root/"workspace-check-trace.txt")<<"start";
  const auto sourceId=currentDocument().identity();const auto originalCount=projects_.size();const auto originalPalette=currentDocument().palette().entries.size();const std::size_t freshPalette=32; // native builtin palette contract
  runBoundary("app.transaction('create boundary',function() app.activeImage:drawPixel(0,0,0xff123456); mse.document.create{name='Script boundary',width=4,height=2}; mse.palette.create{r=14,g=15,b=16} end)");
  if(currentDocument().identity()==sourceId||currentDocument().name()!=U"Script boundary"||currentDocument().width()!=4||currentDocument().height()!=2||projects_.size()!=originalCount+1||currentDocument().palette().entries.size()!=freshPalette+1)throw std::runtime_error("Formal create did not switch active session");
  const auto createdId=currentDocument().identity();auto source=saveProjectIndex(sourceId);if(!source)throw std::runtime_error("Formal boundary source lost");activateProject(*source);if(currentDocument().pixels()[0]!=0xff123456)throw std::runtime_error("Formal boundary source prefix missing");currentDocument().undo();if(currentDocument().pixels()[0])throw std::runtime_error("Formal boundary source undo failed");currentDocument().redo();
  runBoundary("app.transaction(function() mse.document.create{name='Next batch',width=2,height=1}; mse.palette.create{r=2,g=3,b=4} end); app.transaction(function() mse.palette.create{r=5,g=6,b=7} end)");
  if(currentDocument().identity()!=sourceId||currentDocument().palette().entries.size()!=originalPalette+1)throw std::runtime_error("Formal next batch did not refocus source");
  const auto beforeFail=currentDocument().palette().entries.size(),history=currentDocument().historyPosition();runBoundary("app.transaction(function() mse.palette.create{r=21,g=22,b=23}; mse.document.create{name='Survive failure',width=2,height=1}; mse.palette.create{r=24,g=25,b=26}; mse.workspace.showPanel('invalid-panel') end)",true);
  if(currentDocument().name()!=U"Survive failure"||currentDocument().palette().entries.size()!=freshPalette+1)throw std::runtime_error("Formal failure lost new session effects");source=saveProjectIndex(sourceId);activateProject(*source);if(currentDocument().palette().entries.size()!=beforeFail||currentDocument().historyPosition()!=history)throw std::runtime_error("Formal failure did not rollback background source");
  const auto dir=root/("workspace-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(dir);auto image=std::make_unique<Document>(2,1);image->beginStroke({0,0},0xffabcdef);image->commitStroke();writeExportBytesAtomic(dir/"open.png",encodeStaticImagePng(*image,{}).png);
  const auto imported=std::make_unique<Document>(openRasterImage(dir/"open.png"));const auto importedPalette=imported->palette().entries.size();
  auto quote=[](const std::filesystem::path& p){return winrt::to_string(JsonValue::CreateStringValue(winrt::to_hstring(p.u8string())).Stringify());};
  runBoundary("mse.document.open{path="+quote(dir/"open.png")+"}; mse.palette.create{r=31,g=32,b=33}");if(currentDocument().pixels()[0]!=0xffabcdef||currentDocument().palette().entries.size()!=importedPalette+1)throw std::runtime_error("Formal explicit open boundary failed");
  const auto openedId=currentDocument().identity();runBoundary("mse.io.open{path="+quote(dir/"open.png")+"}; mse.palette.create{r=34,g=35,b=36}");if(currentDocument().identity()!=openedId||currentDocument().palette().entries.size()!=importedPalette+2)throw std::runtime_error("Formal open existing tab alias failed");
  const auto oldChooser=chooseOpenFile_;chooseOpenFile_=[&](OPENFILENAMEW* chooser){const auto path=(dir/L"open.png").wstring();std::copy(path.begin(),path.end(),chooser->lpstrFile);chooser->lpstrFile[path.size()]=0;chooser->lpstrFile[path.size()+1]=0;return true;};runBoundary("mse.io.open(); mse.palette.create{r=46,g=47,b=48}");if(currentDocument().identity()!=openedId||currentDocument().palette().entries.size()!=importedPalette+3)throw std::runtime_error("Formal chooser success did not use open path");
  chooseOpenFile_=[](OPENFILENAMEW*){return false;};runBoundary("mse.io.open(); mse.palette.create{r=37,g=38,b=39}");chooseOpenFile_=oldChooser;if(currentDocument().identity()!=openedId||currentDocument().palette().entries.size()!=importedPalette+4)throw std::runtime_error("Formal chooser cancellation did not continue");
  runBoundary("mse.document.open{path="+quote(dir/"missing.moonsprite")+"}; mse.palette.create{r=40,g=41,b=42}");if(pending_!=Pending::None||currentDocument().identity()!=openedId||currentDocument().palette().entries.size()!=importedPalette+5)throw std::runtime_error("Formal failed open did not continue");
  // Unsupported color modes remain explicit; do not advertise full create.
  runBoundary("mse.document.create{colorMode='indexed'}; mse.palette.create{r=43,g=44,b=45}");if(currentDocument().identity()!=openedId||currentDocument().palette().entries.size()!=importedPalette+6)throw std::runtime_error("Formal create rejection did not continue");
  const auto ioSource=currentDocument().identity();const auto ioSourcePalette=currentDocument().palette().entries.size();
  runBoundary("assert(mse.isSupported('document.open') and mse.isSupported('io.open')); app.transaction(function() mse.document.create{name='Boundary IO',width=2,height=1}; mse.palette.create{r=70,g=71,b=72}; mse.document.save{saveAs=true,options={name='boundary-saved',format='moonsprite',directory="+quote(dir)+"}}; mse.io.export{format='png-rgba',name='boundary-export',directory="+quote(dir)+"}; mse.palette.create{r=73,g=74,b=75} end)");
  const auto ioId=currentDocument().identity();auto saved=readScriptBoundaryProject(dir/"boundary-saved.moonsprite");
  if(ioId==ioSource||saved->name()!=U"Boundary IO"||saved->palette().entries.size()!=freshPalette+1||currentDocument().palette().entries.size()!=freshPalette+2||!currentDocument().dirty()||!std::filesystem::is_regular_file(dir/"boundary-export.png"))throw std::runtime_error("Formal boundary save/export prefix wrong");
  source=saveProjectIndex(ioSource);activateProject(*source);if(currentDocument().palette().entries.size()!=ioSourcePalette)throw std::runtime_error("Formal boundary I/O modified original palette");
  runBoundary("app.transaction(function() mse.palette.create{r=80,g=81,b=82}; mse.document.create{name='Boundary failed IO',width=2,height=1}; mse.palette.create{r=83,g=84,b=85}; mse.io.save{saveAs=true,options={name='boundary-failed-saved',format='moonsprite',directory="+quote(dir)+"}}; mse.io.export{format='png-rgba',name='boundary-failed-export',directory="+quote(dir)+"}; mse.palette.create{r=86,g=87,b=88}; mse.workspace.showPanel('invalid-panel') end)",true);
  auto failedSaved=readScriptBoundaryProject(dir/"boundary-failed-saved.moonsprite");
  if(currentDocument().name()!=U"Boundary failed IO"||currentDocument().palette().entries.size()!=freshPalette+2||failedSaved->palette().entries.size()!=freshPalette+1||!std::filesystem::is_regular_file(dir/"boundary-failed-export.png"))throw std::runtime_error("Formal boundary failed I/O lost external effects");
  source=saveProjectIndex(ioSource);activateProject(*source);if(currentDocument().palette().entries.size()!=ioSourcePalette)throw std::runtime_error("Formal boundary failed I/O did not rollback source");
  auto checkFloatingBoundary=[&]() __declspec(noinline) {
  for(int side:{5,257})for(bool fail:{false,true})for(bool canceled:{false,true}){
   auto candidate=std::make_unique<Document>(side,side);candidate->beginStroke({0,0},0xff123456);candidate->commitStroke();candidate->clearHistory();replaceDocumentForSmoke(std::move(*candidate));currentPath().clear();currentDocument().previewSelection(SelectionMask{0,0,1,1,{}});currentDocument().nudgeSelectionContent(1,0);refresh();
   const auto floatingSource=currentDocument().identity();const auto floatBefore=currentDocument().pixels();const auto floatHistory=currentDocument().historyPosition();const auto chooser=chooseOpenFile_;chooseOpenFile_=[](OPENFILENAMEW*){return false;};
   std::string code="app.transaction(function() app.activeImage:drawPixel(3,0,0xffabcdef); ";code+=canceled?"mse.io.open()":"mse.document.open{path="+quote(dir/"open.png")+"}";code+="; mse.palette.create{r=91,g=92,b=93}";if(fail)code+="; mse.workspace.showPanel('invalid-panel')";code+=" end)";runBoundary(code,fail);chooseOpenFile_=chooser;
   const auto slot=saveProjectIndex(floatingSource);if(!slot)throw std::runtime_error("Formal floating boundary source lost");
   // Inspect background state before tab activation commits a pending preview.
   const auto& state=projectDocument(*slot);
   if(fail){if(!state.floating()||state.pixels()!=floatBefore||state.historyPosition()!=floatHistory)throw std::runtime_error("Formal floating boundary rollback lost preview/history");}
   else if(canceled){if(currentDocument().identity()!=floatingSource||!state.floating()||state.pixels()[3]!=0xffabcdef)throw std::runtime_error("Formal canceled boundary lost preview/outside write");currentDocument().cancelFloatingPaste();if(currentDocument().pixels()[0]!=0xff123456||currentDocument().pixels()[3]!=0xffabcdef)throw std::runtime_error("Formal canceled boundary cancel lost pixels");}
   else if(state.floating()||state.pixels()[1]!=0xff123456||state.pixels()[3]!=0xffabcdef)throw std::runtime_error("Formal open boundary lost committed preview/outside write");
  }
  };checkFloatingBoundary();
  auto checkLayerTail=[&]() __declspec(noinline) {
   for(int scenario=0;scenario<4;++scenario){
    replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,1)));currentPath().clear();refresh();const auto id=currentDocument().identity();const auto layer=currentDocument().layer().id;const auto picker=chooseOpenFile_;chooseOpenFile_=[](OPENFILENAMEW*){return false;};
    std::string code="app.transaction(function() app.activeImage:drawPixel(0,0,0xff123456); ";if(scenario>=2)code+="mse.layers.create{name='Survivor'}; mse.layers.remove('"+layer+"'); ";code+=scenario==1?"mse.io.open()":"mse.document.create{name='Layer tail boundary',width=2,height=1}";code+="; mse.palette.create{r=101,g=102,b=103} end); ";if(scenario!=3)code+="local l=app.activeSprite:newLayer(); l.name='Tail layer'; app.activeLayer=nil; app.activeFrame=nil";else code+="app.transaction(function() mse.palette.create{r=104,g=105,b=106} end)";
    runBoundary(code,scenario>=2);chooseOpenFile_=picker;const auto slot=saveProjectIndex(id);if(!slot)throw std::runtime_error("Formal layer tail source lost");const auto& state=projectDocument(*slot);
    if(scenario>=2){if(state.timeline().hasLayer(layer)||state.timeline().state().layers.size()!=1||state.layer().name!=U"Survivor")throw std::runtime_error("Formal missing source layer tail altered survivor");}
    else{if(currentDocument().identity()!=id||currentDocument().layer().name!=U"Tail layer"||currentDocument().timeline().state().layers.size()!=2||currentDocument().historySize()!=2)throw std::runtime_error("Formal layer tail source/history wrong");currentDocument().undo();if(currentDocument().layer().id!=layer||currentDocument().pixels()[0]!=0xff123456)throw std::runtime_error("Formal layer tail undo failed");currentDocument().undo();if(currentDocument().pixels()[0])throw std::runtime_error("Formal layer tail source undo failed");currentDocument().redo();currentDocument().redo();if(currentDocument().layer().name!=U"Tail layer")throw std::runtime_error("Formal layer tail redo failed");}
   }
  };checkLayerTail();
  if(!saveProjectIndex(createdId))throw std::runtime_error("Earlier created session lost");
 }
}
void Editor::smokeScriptEntry(){
 using namespace winrt::Windows::Data::Json;
 smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;currentPlayback().playing=false;replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,1)));refresh();const auto root=script::executableDirectory()/"script-entry-test-owned";std::filesystem::create_directories(root/"scripts");std::ofstream(root/"test-owned.marker")<<"script entry fixture";std::ofstream(root/"scripts/entry.lua")<<"app.activeImage:drawPixel(1,0,0xff123456); print('entry'); local d=Dialog('Entry'); d:button{id='done',text='Done',onclick=function() app.activeImage:drawPixel(2,0,0xffabcdef); d:close() end}; d:show{wait=false}";
 brushLibraryTestDirectory_=root/"brushes";initializeScripts(root);if(!scripts_)throw std::runtime_error("Script initialization failed");const auto end=std::chrono::steady_clock::now()+std::chrono::seconds(20);while((scripts_->client.loading()||scripts_->brushes.valid())&&std::chrono::steady_clock::now()<end){pumpScripts();std::this_thread::yield();}updateScriptsMenu();bool found=false;for(auto child:scriptsMenu_->children())if(auto row=dynamic_cast<PixelMenuItem*>(child);row&&row->id()=="entry.lua"){row->Click();found=true;break;}if(!found)throw std::runtime_error("Discovered script missing from menu");
 while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<end){pumpScripts();std::this_thread::yield();}if(currentDocument().pixels()[1]!=0xff123456||!scripts_->client.session()||scripts_->host->windowCount()!=1||!scripts_->host->hasReport())throw std::runtime_error("Menu run did not apply/show native dialog");runScript("entry.lua");if(!scripts_->queued.empty())throw std::runtime_error("Modeless session allowed rerun");
 if(auto manager=ui::Manager::getDefault())manager->invalidate();
 auto models=winrt::Windows::Data::Json::JsonArray::Parse(winrt::to_hstring(scripts_->client.session()->dialogsJson));auto id=winrt::to_string(models.GetObjectAt(0).GetNamedString(L"id"));scripts_->host->window(id)->clickForCheck("done");do{pumpScripts();std::this_thread::yield();}while(scripts_->client.running()&&std::chrono::steady_clock::now()<end);if(currentDocument().pixels()[2]!=0xffabcdef||scripts_->client.session())throw std::runtime_error("Native menu dialog callback failed");currentDocument().undo();if(currentDocument().pixels()[2])throw std::runtime_error("Menu script undo failed");currentDocument().redo();if(currentDocument().pixels()[2]!=0xffabcdef)throw std::runtime_error("Menu script redo failed");
 // Production dialog callbacks must repaint deferred overlays without pixel/history changes.
 for(int side:{5,257}){
  replaceDocumentForSmoke(std::move(*std::make_unique<Document>(side,side)));currentDocument().beginStroke({0,0},0xff123456);currentDocument().commitStroke();currentDocument().clearHistory();refresh();
  std::ofstream(root/"scripts/transform-dialog.lua")<<"app.transaction(function() mse.selection.set{x=0,y=0,width=1,height=1}; mse.selection.transform{dx=1} end); local d=Dialog('Transform'); d:button{id='move',text='Move',onclick=function() mse.selection.transform{dx=1} end}; d:button{id='finish',text='Finish',onclick=function() d:close() end}; d:button{id='fail',text='Fail',onclick=function() app.transaction(function() mse.selection.transform{dx=1}; mse.palette.update(999,{name='bad'}) end) end}; d:show{wait=false}";
  auto pumpTransform=[&]{const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(10);do{pumpScripts();std::this_thread::yield();}while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<until);if(scripts_->client.running()||!scripts_->client.error().empty())throw std::runtime_error("Formal transform callback failed");};
  runScript("transform-dialog.lua");pumpTransform();if(!currentDocument().floating()||!currentDocument().selection()||currentDocument().selection()->x!=1||!scripts_->client.session())throw std::runtime_error("Formal transform initial state missing");
  const auto dialog=winrt::to_string(JsonArray::Parse(winrt::to_hstring(scripts_->client.session()->dialogsJson)).GetObjectAt(0).GetNamedString(L"id"));const auto contentBefore=currentDocument().contentRevision(),historyBefore=currentDocument().historyRevision(),refreshBefore=panelFullRefreshes_;
  scripts_->host->window(dialog)->clickForCheck("move");pumpTransform();if(currentDocument().selection()->x!=2||!currentDocument().floating()||panelFullRefreshes_==refreshBefore)throw std::runtime_error("Formal transform callback did not refresh");if(side==257&&(currentDocument().contentRevision()!=contentBefore||currentDocument().historyRevision()!=historyBefore))throw std::runtime_error("Deferred transform callback changed content/history");
  scripts_->host->window(dialog)->clickForCheck("finish");pumpTransform();if(scripts_->client.session()||scripts_->host->windowCount()||!currentDocument().floating())throw std::runtime_error("Formal transform close lost pending selection");currentDocument().commitFloatingPaste();if(currentDocument().pixels()[2]!=0xff123456||currentDocument().pixels()[0])throw std::runtime_error("Formal transform commit wrong");currentDocument().undo();if(currentDocument().pixels()[0]!=0xff123456||currentDocument().pixels()[2])throw std::runtime_error("Formal transform undo wrong");currentDocument().redo();if(currentDocument().pixels()[2]!=0xff123456)throw std::runtime_error("Formal transform redo wrong");
  replaceDocumentForSmoke(std::move(*std::make_unique<Document>(side,side)));currentDocument().beginStroke({0,0},0xff123456);currentDocument().commitStroke();currentDocument().clearHistory();runScript("transform-dialog.lua");pumpTransform();const auto failedDialog=winrt::to_string(JsonArray::Parse(winrt::to_hstring(scripts_->client.session()->dialogsJson)).GetObjectAt(0).GetNamedString(L"id"));const auto failHistory=currentDocument().historyPosition();scripts_->host->window(failedDialog)->clickForCheck("fail");const auto failureUntil=std::chrono::steady_clock::now()+std::chrono::seconds(10);do{pumpScripts();std::this_thread::yield();}while(scripts_->client.running()&&std::chrono::steady_clock::now()<failureUntil);if(scripts_->client.running()||scripts_->client.error().empty()||scripts_->client.session()||scripts_->host->windowCount()||!scripts_->host->hasReport()||!currentDocument().floating()||currentDocument().selection()->x!=1||currentDocument().historyPosition()!=failHistory)throw std::runtime_error("Formal transform failure cleanup/rollback wrong");currentDocument().cancelFloatingPaste();if(currentDocument().pixels()[0]!=0xff123456)throw std::runtime_error("Formal transform failure cancel wrong");if(!escapeScript())throw std::runtime_error("Formal transform failure report Escape refused");pumpScripts();
 }
 // Fresh invocations must retain the existing floating transaction through async discovery.
 std::ofstream(root/"scripts/continue-floating.lua")<<"assert(mse.isSupported('selection.transform')); assert(mse.capabilities.selection.status=='stable'); mse.selection.transform{dx=1}";
 std::ofstream(root/"scripts/fail-floating.lua")<<"app.transaction(function() mse.selection.transform{dx=1}; mse.palette.update(999,{name='bad'}) end)";
 for(int side:{5,257})for(bool fail:{false,true}){
  replaceDocumentForSmoke(std::move(*std::make_unique<Document>(side,side)));currentDocument().beginStroke({0,0},0xff123456);currentDocument().commitStroke();currentDocument().clearHistory();currentDocument().previewSelection(SelectionMask{0,0,1,1,{}});if(!currentDocument().nudgeSelectionContent(1,0)||!currentDocument().floating())throw std::runtime_error("Fresh script floating setup failed");refresh();
  const auto launchHistory=currentDocument().historyRevision(),launchContent=currentDocument().contentRevision(),launchOverlay=currentDocument().floatingOverlayRevision();const auto launchPosition=currentDocument().historyPosition();
  std::promise<PatternBrushListing> wait;scripts_->brushes=wait.get_future();runScript(fail?"fail-floating.lua":"continue-floating.lua");
  if(scripts_->queued.empty()||!currentDocument().floating()||currentDocument().selection()->x!=1||currentDocument().historyRevision()!=launchHistory||currentDocument().contentRevision()!=launchContent||currentDocument().floatingOverlayRevision()!=launchOverlay)throw std::runtime_error("Fresh script launch committed floating state");
  pumpScripts();if(scripts_->queued.empty()||!currentDocument().floating()||currentDocument().historyPosition()!=launchPosition)throw std::runtime_error("Brush wait lost floating state");wait.set_value(PatternBrushListing{});
  const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(10);do{pumpScripts();std::this_thread::yield();}while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<until);
  if(!scripts_->queued.empty()||scripts_->client.running()||!currentDocument().floating()||!currentDocument().selection()||currentDocument().selection()->x!=(fail?1:2)||scripts_->client.session()||scripts_->host->windowCount())throw std::runtime_error("Fresh script floating completion wrong");
  if(fail){if(scripts_->client.error().empty()||!scripts_->host->hasReport()||currentDocument().historyPosition()!=launchPosition)throw std::runtime_error("Fresh script failure changed history or lost report");currentDocument().cancelFloatingPaste();if(currentDocument().pixels()[0]!=0xff123456||currentDocument().pixels()[1]||currentDocument().pixels()[2])throw std::runtime_error("Fresh script failure cancel lost source");if(!escapeScript())throw std::runtime_error("Fresh script failure report Escape refused");pumpScripts();}
  else{if(!scripts_->client.error().empty())throw std::runtime_error("Fresh script transform failed");if(side==257&&(currentDocument().contentRevision()!=launchContent||currentDocument().historyRevision()!=launchHistory))throw std::runtime_error("Fresh deferred script materialized floating state");currentDocument().commitFloatingPaste();if(currentDocument().pixels()[0]||currentDocument().pixels()[2]!=0xff123456)throw std::runtime_error("Fresh script commit lost source");currentDocument().undo();if(currentDocument().pixels()[0]!=0xff123456||currentDocument().pixels()[2])throw std::runtime_error("Fresh script undo split floating transaction");currentDocument().redo();if(currentDocument().pixels()[0]||currentDocument().pixels()[2]!=0xff123456)throw std::runtime_error("Fresh script redo wrong");}
 }
 // Formal save aliases must wait for the existing async save and preserve MSE order.
 {const auto picker=chooseSaveFile_;const auto savedPath=currentPath();const auto preferences=runtimePreferences_;const auto async=asyncSaveForSmoke_;const auto decision=asepriteSaveDecisionForSmoke_;struct Restore{std::function<void()> run;~Restore(){run();}} restore{[&]{chooseSaveFile_=picker;currentPath()=savedPath;runtimePreferences_=preferences;asyncSaveForSmoke_=async;asepriteSaveDecisionForSmoke_=decision;}};asyncSaveForSmoke_=true;runtimePreferences_.set("files.saveOriginalFormat","true");asepriteSaveDecisionForSmoke_=[](bool,const auto&){return 2;};
  auto runSave=[&](const std::string& source){std::ofstream(root/"scripts/save-entry.lua")<<source;runScript("save-entry.lua");const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(20);do{pumpScripts();std::this_thread::yield();}while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<until);if(!scripts_->queued.empty()||scripts_->client.running()||!scripts_->client.error().empty())throw std::runtime_error("Formal script save failed: "+scripts_->client.error());};
  replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,1)));currentPath().clear();refresh();const auto path=root/"script-saved.moonsprite";chooseSaveFile_=[&](OPENFILENAMEW* chooser){auto text=path.wstring();std::copy(text.begin(),text.end(),chooser->lpstrFile);chooser->lpstrFile[text.size()]=0;chooser->nFilterIndex=1;return true;};
  runSave("app.transaction(function() app.activeImage:drawPixel(0,0,0xff123456); mse.document.save(); mse.palette.create{r=3,g=4,b=5} end)");auto read=[&](const auto& path){std::ifstream file(path,std::ios::binary);auto bytes=std::make_shared<project::Bytes>();bytes->assign(std::istreambuf_iterator<char>(file),{});return bytes;};auto opened=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(read(path))));if(opened.pixels()[0]!=0xff123456||opened.palette().entries.size()+1!=currentDocument().palette().entries.size()||!currentDocument().dirty()||pending_!=Pending::None)throw std::runtime_error("Formal save did not wait before next operation");currentDocument().undo();if(currentDocument().pixels()[0]||currentDocument().palette().entries.size()!=opened.palette().entries.size())throw std::runtime_error("Formal saved script undo wrong");currentDocument().redo();
  runSave("mse.io.save()");if(currentDocument().dirty()||project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(read(path)))).palette().entries.size()!=currentDocument().palette().entries.size())throw std::runtime_error("Formal io save alias failed");
  JsonObject options;options.Insert(L"directory",JsonValue::CreateStringValue(root.wstring()));const auto encodedDirectory=winrt::to_string(options.GetNamedValue(L"directory").Stringify());
  runSave("mse.document.save{saveAs=true,options={name='scaled.png',format='png',scalePercent=200,directory="+encodedDirectory+"}}");auto png=openRasterImage(root/"scaled.png");if(png.width()!=6||png.height()!=2||currentDocument().width()!=3||currentDocument().height()!=1)throw std::runtime_error("Formal script save options scaling wrong");
  for(bool image:{false,true}){
   replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,1)));currentPath().clear();currentDocument().markSaved();refresh();const auto failurePath=root/(image?"saved-before-error.png":"saved-before-error.moonsprite");
   chooseSaveFile_=[&](OPENFILENAMEW* chooser){auto text=failurePath.wstring();std::copy(text.begin(),text.end(),chooser->lpstrFile);chooser->lpstrFile[text.size()]=0;chooser->nFilterIndex=image?4:1;return true;};
   std::ofstream(root/"scripts/save-entry.lua")<<"app.transaction(function() app.activeImage:drawPixel(2,0,0xffabcdef); mse.document.save{saveAs=true,options={format='"<<(image?"png":"moonsprite")<<"'}}; mse.palette.update(999,{name='bad'}) end)";
   runScript("save-entry.lua");const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(20);do{pumpScripts();std::this_thread::yield();}while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<until);
   if(scripts_->client.running()||!scripts_->queued.empty()||scripts_->client.error().empty()||currentDocument().pixels()[2]||currentDocument().dirty()||currentDocument().historyPosition()!=0)throw std::runtime_error("Formal save failure did not restore batch baseline");
   if(image){if(currentPath()!=failurePath||currentDocument().name()!=failurePath.filename().u32string()||openRasterImage(failurePath).pixels()[2]!=0xffabcdef)throw std::runtime_error("Formal image save failure lost persisted metadata");}
   else{auto persisted=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(read(failurePath))));if(currentPath()!=failurePath||currentDocument().projectId().empty()||currentDocument().projectId()!=persisted.projectId()||!currentDocument().sourceArchive()||persisted.pixels()[2]!=0xffabcdef)throw std::runtime_error("Formal native save failure lost persisted identity");}
   if(!escapeScript())throw std::runtime_error("Formal save failure report Escape refused");pumpScripts();
   runSave("app.activeImage:drawPixel(1,0,0xff112233); mse.document.save()");if(currentDocument().dirty()||currentDocument().pixels()[1]!=0xff112233)throw std::runtime_error("Formal save failed to recover after rollback");
  }
  chooseSaveFile_=[](OPENFILENAMEW*){return false;};const auto revision=currentDocument().revision();runSave("mse.io.save{saveAs=true}; mse.palette.create{r=7,g=8,b=9}");if(currentDocument().revision()==revision||pending_!=Pending::None)throw std::runtime_error("Formal save cancellation stopped later operation");
 }
 // Full export host uses the production chooser, snapshot, worker and encoders.
 {const auto picker=chooseExportFile_;const auto originalPath=currentPath();const auto previousMemory=exportMemoryPathOverride_;struct Restore{std::function<void()> run;~Restore(){run();}} restore{[&]{chooseExportFile_=picker;currentPath()=originalPath;exportMemoryPathOverride_=previousMemory;}};
  // Unique fixture destinations avoid prompting over earlier test-owned exports.
  const auto directory=root/("exports-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(directory);exportMemoryPathOverride_=directory/"settings.txt";
  JsonObject value;value.Insert(L"directory",JsonValue::CreateStringValue(directory.wstring()));const auto encodedDirectory=winrt::to_string(value.GetNamedValue(L"directory").Stringify());
  auto run=[&](const std::string& source,bool fail=false){std::ofstream(root/"scripts/export-entry.lua")<<source;runScript("export-entry.lua");const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(30);do{pumpScripts();std::this_thread::yield();}while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<until);if(!scripts_->queued.empty()||scripts_->client.running()||scripts_->client.error().empty()==fail)throw std::runtime_error("Formal script export failed: "+scripts_->client.error());if(fail){if(!escapeScript())throw std::runtime_error("Export error report Escape refused");pumpScripts();}};
  auto bytes=[&](const auto& path){std::ifstream input(path,std::ios::binary);return std::vector<std::uint8_t>(std::istreambuf_iterator<char>(input),{});};
  replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,2)));currentPath().clear();refresh();
  for(const std::string format:{"png-rgba","png-auto","bmp","ico","svg","jpeg","gif","webp","psd","ase","aseprite","moonsprite"}){
   const auto extension=format=="png-rgba"||format=="png-auto"?"png":format=="jpeg"?"jpg":format;
   const auto name="format-"+format;const auto output=directory/(name+"."+extension);const auto identity=currentDocument().identity();const auto projectId=currentDocument().projectId();const auto archive=currentDocument().sourceArchive();const auto source=currentDocument().sourceFilePath();const auto savedName=currentDocument().name();
   run("app.transaction(function() app.activeImage:drawPixel(0,0,0xff123456); mse.io.export{format='"+format+"',name='"+name+"',directory="+encodedDirectory+",scalePercent=200}; mse.palette.create{r=1,g=2,b=3} end)");
   if(!std::filesystem::is_regular_file(output)||currentDocument().identity()!=identity||currentDocument().projectId()!=projectId||currentDocument().sourceArchive()!=archive||currentDocument().sourceFilePath()!=source||currentDocument().name()!=savedName||!currentPath().empty()||!currentDocument().dirty()||pending_!=Pending::None)throw std::runtime_error("Export mutated persistence state or omitted file: "+format);
   auto memory=readExportMemory();if(memory.empty()||memory.front().filename!=output.filename().u8string()||std::filesystem::u8path(memory.front().directory)!=directory)throw std::runtime_error("Script export memory missing: "+format);
   openDocumentExport();if(exportDirectory_!=directory||exportFilename_->text()!=output.filename().u8string()||exportExtension()!=output.extension().wstring()||(format=="moonsprite"?exportOptions_.scalePercent!=100:format=="gif"||format=="webp"?gifOptions_.scalePercent!=200:exportOptions_.scalePercent!=200))throw std::runtime_error("Script export memory restoration wrong: "+format);resolve(false);
   if(format=="png-rgba"||format=="png-auto"||format=="bmp"||format=="jpeg"||format=="webp"){auto image=std::make_unique<Document>(openRasterImage(output));if(image->width()!=6||image->height()!=4)throw std::runtime_error("Export format scale wrong: "+format);}
   if(format=="ico"){auto data=bytes(output);if(data.size()<22||data[2]!=1||data[4]!=1||data[6]!=6||data[7]!=4)throw std::runtime_error("Export ICO dimensions wrong");}
   if(format=="gif"){auto image=std::make_unique<Document>(openGifAnimation(output));if(image->width()!=6||image->height()!=4)throw std::runtime_error("Export GIF scale wrong");}
   if(format=="psd"){auto image=std::make_unique<Document>(openPsd(output));if(image->width()!=6||image->height()!=4)throw std::runtime_error("Export PSD scale wrong");}
   if(format=="ase"||format=="aseprite"){auto image=std::make_unique<Document>(openAseprite(output));if(image->width()!=6||image->height()!=4)throw std::runtime_error("Export ASE scale wrong");}
   if(format=="moonsprite"){auto file=std::make_shared<project::Bytes>(bytes(output));auto image=std::make_unique<Document>(project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(file))));if(image->width()!=3||image->height()!=2||image->palette().entries.size()+1!=currentDocument().palette().entries.size())throw std::runtime_error("Native export changed dimensions or operation order");}
  }
  // Production chooser path is used when no directory is supplied.
  const auto chosen=directory/"chosen-output";chooseExportFile_=[&](OPENFILENAMEW* chooser){auto text=chosen.wstring();std::copy(text.begin(),text.end(),chooser->lpstrFile);chooser->lpstrFile[text.size()]=0;return true;};run("mse.io.export{format='png-rgba'}");if(!std::filesystem::is_regular_file(directory/"chosen-output.png"))throw std::runtime_error("Export chooser did not normalize extension");
  // Selection mask and transformed prefix, subsequent failure leaves export on disk.
  replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,1)));refresh();run("app.transaction(function() app.activeImage:drawPixel(0,0,0xffabcdef); mse.selection.set{x=0,y=0,width=2,height=1,mask={1,0}}; mse.selection.transform{dx=1}; mse.io.export{format='png-rgba',target='selection',name='masked-prefix',directory="+encodedDirectory+"}; mse.palette.update(999,{name='bad'}) end)",true);
  auto masked=std::make_unique<Document>(openRasterImage(directory/"masked-prefix.png"));if(masked->width()!=2||masked->height()!=1||masked->pixels()[0]!=0xffabcdef||masked->pixels()[1]||currentDocument().pixels()[0]||currentDocument().historyPosition()!=0||currentDocument().selection())throw std::runtime_error("Export mask/prefix/rollback wrong "+std::to_string(masked->width())+"x"+std::to_string(masked->height())+" p="+std::to_string(masked->pixels()[0])+","+std::to_string(masked->pixels().back())+" live="+std::to_string(currentDocument().pixels()[0])+" history="+std::to_string(currentDocument().historyPosition())+" selection="+std::to_string(bool(currentDocument().selection())));
  // Layers, invalid requested layer fallback, slices and directed frame range.
  replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,2)));currentDocument().beginStroke({0,0},0xff123456);currentDocument().commitStroke();const auto bottom=currentDocument().layer().id;currentDocument().addLayer();currentDocument().beginStroke({2,1},0xffabcdef);currentDocument().commitStroke();currentDocument().createSlices({{0,0,1,1}});refresh();
  run("mse.io.export{format='png-rgba',target='layer',layerId='missing',name='layers',directory="+encodedDirectory+"}");std::size_t layerFiles=0;for(const auto& entry:std::filesystem::directory_iterator(directory))if(entry.path().filename().u8string().rfind("layers-",0)==0)++layerFiles;if(layerFiles!=2)throw std::runtime_error("Export layer fallback omitted layers");
  run("mse.io.export{format='png-rgba',target='slices',directory="+encodedDirectory+"}");bool sliceFile=false;for(const auto& entry:std::filesystem::directory_iterator(directory))if(entry.path().filename().u8string().rfind("layers-",0)!=0&&entry.path().extension()==L".png"){auto image=std::make_unique<Document>(openRasterImage(entry.path()));sliceFile|=image->width()==1&&image->height()==1;}if(!sliceFile)throw std::runtime_error("Export slice output missing");
  openDocumentExport();if(!exportSlices_||exportDirectory_!=directory)throw std::runtime_error("Slice export memory lost target/directory");resolve(false);
  replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,1)));currentDocument().beginStroke({0,0},0xff112233);currentDocument().commitStroke();currentDocument().addFrame(true);currentDocument().beginStroke({0,0},0xff445566);currentDocument().commitStroke();currentDocument().addFrame(true);currentDocument().beginStroke({0,0},0xff778899);currentDocument().commitStroke();refresh();
  run("mse.io.export{format='png-rgba',target='frames',name='sequence',directory="+encodedDirectory+",gifFrameRange='range',gifFrameStart=2,gifFrameEnd=3,gifDirection='reverse'}");if(openRasterImage(directory/"sequence-001.png").pixels()[0]!=0xff778899||openRasterImage(directory/"sequence-002.png").pixels()[0]!=0xff445566)throw std::runtime_error("Export sequence order/range wrong");
  run("mse.io.export{format='webp',target='frames',name='frames-webp',directory="+encodedDirectory+"}");if(!std::filesystem::is_regular_file(directory/"frames-webp.webp"))throw std::runtime_error("WebP frames document fallback missing");
  // Directed GIF range and static crop use the same production option decoding.
  run("mse.io.export{format='gif',name='reverse-range',directory="+encodedDirectory+",gifFrameRange='range',gifFrameStart=2,gifFrameEnd=3,gifDirection='reverse'}");auto directed=std::make_unique<Document>(openGifAnimation(directory/"reverse-range.gif"));if(directed->timeline().state().frames.size()!=2||directed->pixels()[0]!=0xff778899)throw std::runtime_error("Export GIF directed range wrong");
  replaceDocumentForSmoke(std::move(*std::make_unique<Document>(5,4)));currentDocument().beginStroke({2,1},0xff123456);currentDocument().commitStroke();refresh();run("mse.io.export{format='png-rgba',name='trimmed',directory="+encodedDirectory+",trimMode='individual',scalePercent=200}");auto trimmed=std::make_unique<Document>(openRasterImage(directory/"trimmed.png"));if(trimmed->width()!=2||trimmed->height()!=2||trimmed->pixels()[0]!=0xff123456)throw std::runtime_error("Export trim/scale wrong");
  // Cancel while bounded capture/worker is active; later MSE must still run.
  replaceDocumentForSmoke(std::move(*std::make_unique<Document>(257,257)));refresh();bool canceled=false;ui::Timer cancelExport(1,this);cancelExport.Tick.connect([&]{if(scriptExporting_){canceled=true;cancelExport.stop();resolve(false);}});cancelExport.start();run("mse.io.export{format='png-rgba',name='canceled',directory="+encodedDirectory+"}; mse.palette.create{r=22,g=33,b=44}");cancelExport.stop();if(!canceled||pending_!=Pending::None||currentDocument().palette().entries.back().color!=0xff2c2116)throw std::runtime_error("Export active cancellation did not continue");
  chooseExportFile_=[](OPENFILENAMEW*){return false;};auto count=currentDocument().palette().entries.size();run("mse.io.export{}; mse.palette.create{r=9,g=8,b=7}");if(currentDocument().palette().entries.size()!=count+1||pending_!=Pending::None)throw std::runtime_error("Export cancellation stopped script");
  count=currentDocument().palette().entries.size();run("mse.io.export{format='moonsprite',target='selection',directory="+encodedDirectory+"}; mse.palette.create{r=6,g=5,b=4}");if(currentDocument().palette().entries.size()!=count+1)throw std::runtime_error("Export workspace failure aborted script");
 }
 replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,1)));refresh();
 // Production menu receives completed discovery without a second open.
 auto menuHas=[&](const std::string& id){for(auto child:scriptsMenu_->children())if(child->id()==id)return true;return false;};
 auto awaitMenu=[&]{const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(10);while(scripts_->client.loading()&&std::chrono::steady_clock::now()<until){pumpScripts();std::this_thread::yield();}if(scripts_->client.loading())throw std::runtime_error("Menu discovery timeout");};
 awaitMenu();std::ofstream(root/"scripts/live-menu.lua")<<"return 1";updateScriptsMenu();for(int n=0;n<20;++n)scripts_->client.refresh();awaitMenu();if(!menuHas("live-menu.lua"))throw std::runtime_error("Completed scan did not publish menu addition");
 // Keep the real top-menu popup open while the next publication adds an item.
 auto* menuOwner=scriptsMenu_->getOwnerMenuItem();if(!menuOwner)throw std::runtime_error("Script menu owner missing");
 if(auto parentMenu=dynamic_cast<ui::Menu*>(menuOwner->parent());parentMenu&&parentMenu->getOwnerMenuItem()){auto top=parentMenu->getOwnerMenuItem();top->openSubmenu();ui::MessageLoop loop(ui::Manager::getDefault());const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(!top->hasSubmenuOpened()&&std::chrono::steady_clock::now()<until)loop.pumpMessages();}
 menuOwner->openSubmenu();
 {ui::MessageLoop loop(ui::Manager::getDefault());const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(!menuOwner->hasSubmenuOpened()&&std::chrono::steady_clock::now()<until)loop.pumpMessages();}
 if(!menuOwner->hasSubmenuOpened())throw std::runtime_error("Script menu popup did not open");
 std::ofstream(root/"scripts/live-popup.lua")<<"return 2";scriptsMenu_->OpenPopup();awaitMenu();auto* added=scriptsMenu_->findItemById("live-popup.lua");if(!added||added->bounds().isEmpty()||!scriptsMenu_->bounds().contains(added->bounds()))throw std::runtime_error("Open popup did not lay out discovered item");
 menuOwner->getSubmenuContainer()->cancelMenuLoop();{ui::MessageLoop loop(ui::Manager::getDefault());const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(menuOwner->hasSubmenuOpened()&&std::chrono::steady_clock::now()<until)loop.pumpMessages();}if(menuOwner->hasSubmenuOpened())throw std::runtime_error("Script menu popup did not close");
 scripts_->runtime.remove("live-popup.lua").get();
 scripts_->runtime.remove("live-menu.lua").get();updateScriptsMenu();awaitMenu();if(menuHas("live-menu.lua"))throw std::runtime_error("Completed scan did not publish menu deletion");
 const auto stableRevision=scripts_->client.listingRevision();for(int n=0;n<20;++n)pumpScripts();if(scripts_->client.loading()||scripts_->client.listingRevision()!=stableRevision)throw std::runtime_error("Menu publication started a refresh loop");
 std::ofstream(root/"menu-discovery-passed.txt")<<"add/remove/open-popup/coalesced-refresh/idle passed";
 smokeScriptWorkspace(root);
 // A slow brush listing must not prevent list reception or native report pumping.
 std::promise<PatternBrushListing> delayed;auto ready=delayed.get_future();scripts_->brushes=std::move(ready);scripts_->client.refresh();const auto listEnd=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(scripts_->client.loading()&&std::chrono::steady_clock::now()<listEnd){pumpScripts();std::this_thread::yield();}if(scripts_->client.loading())throw std::runtime_error("Brush loading blocked script discovery");
 runScript("entry.lua");if(scripts_->queued.empty())throw std::runtime_error("Delayed run was not queued");auto oldIdentity=currentDocument().identity();replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,1)));delayed.set_value(PatternBrushListing{});while(!scripts_->queued.empty()&&std::chrono::steady_clock::now()<listEnd){pumpScripts();std::this_thread::yield();}if(!scripts_->queued.empty()||scripts_->client.running()||currentDocument().identity()==oldIdentity||currentDocument().pixels()[1])throw std::runtime_error("Queued run changed new document");
 // Layer/frame changes during deferred discovery cancel the queued original target.
 auto cancelAfterSwitch=[&](bool layer){replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,1)));const auto originalLayer=currentDocument().layer().id;currentDocument().addLayer();currentDocument().addFrame();const auto originalFrame=currentDocument().timeline().state().frames.front().id;std::promise<PatternBrushListing> wait;scripts_->brushes=wait.get_future();runScript("entry.lua");if(scripts_->queued.empty())throw std::runtime_error("Target-switch run was not queued");if(layer)currentDocument().selectLayer(originalLayer);else currentDocument().selectFrame(originalFrame);wait.set_value(PatternBrushListing{});pumpScripts();if(!scripts_->queued.empty()||scripts_->client.running())throw std::runtime_error("Queued run followed changed layer/frame");};
 cancelAfterSwitch(true);cancelAfterSwitch(false);
 // Selection alone does not publish a content/history revision; the Editor must still refresh.
 replaceDocumentForSmoke(std::move(*std::make_unique<Document>(3,1)));currentDocument().addLayer();const auto otherLayer=currentDocument().timeline().state().layers.back().id;const auto originalHistory=currentDocument().historyRevision();const auto originalContent=currentDocument().contentRevision();const auto refreshes=panelFullRefreshes_;
 std::ofstream(root/"scripts/select-layer.lua")<<"app.activeLayer=app.activeSprite.layers[1]";runScript("select-layer.lua");const auto selectionEnd=std::chrono::steady_clock::now()+std::chrono::seconds(10);while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<selectionEnd){pumpScripts();std::this_thread::yield();}if(currentDocument().layer().id!=otherLayer||currentDocument().historyRevision()!=originalHistory||currentDocument().contentRevision()!=originalContent||panelFullRefreshes_==refreshes)throw std::runtime_error("Layer-only script selection did not refresh without history");
 auto folder=menuItems_.at("openScriptFolder");for(int pass=0;pass<3;++pass){updateScriptsMenu();const auto rows=scriptsMenu_->children();if(std::count(rows.begin(),rows.end(),folder)!=1||menuItems_.at("openScriptFolder")!=folder)throw std::runtime_error("Script menu lost original folder command");}
 std::ofstream(root/"scripts/broken.lua")<<"error('entry-failure')";runScript("broken.lua");const auto failureEnd=std::chrono::steady_clock::now()+std::chrono::seconds(10);while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<failureEnd){pumpScripts();std::this_thread::yield();}if(scripts_->client.error().empty()||!scripts_->host->hasReport())throw std::runtime_error("Menu script error not shown");if(!escapeScript())throw std::runtime_error("Script report Escape refused");pumpScripts();if(scripts_->host->hasReport())throw std::runtime_error("Script report Escape retained report");
 std::ofstream(root/"scripts/recover.lua")<<"app.activeImage:drawPixel(0,0,0xff112233)";runScript("recover.lua");while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<failureEnd){pumpScripts();std::this_thread::yield();}if(currentDocument().pixels()[0]!=0xff112233||!scripts_->client.error().empty())throw std::runtime_error("Menu script did not recover after failure");
 // Exercise the production host for every panel and all four dock destinations.
 const auto savedDocking=docking_;const auto savedVisible=columnVisibility();const auto panelHistory=currentDocument().historyPosition();const auto panelIdentity=currentDocument().identity();
 auto runPanelCheck=[&](const std::string& source){std::ofstream(root/"scripts/workspace-panels.lua")<<source;runScript("workspace-panels.lua");const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(10);while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<until){pumpScripts();std::this_thread::yield();}if(!scripts_->queued.empty()||scripts_->client.running()||!scripts_->client.error().empty())throw std::runtime_error("Formal workspace panel script failed: "+scripts_->client.error());};
 for(const auto& [name,index]:std::initializer_list<std::pair<const char*,int>>{{"color",1},{"palette",0},{"layers",2},{"history",8},{"preview",3},{"reference",9},{"tileset",11},{"brushes",12},{"tabletAssist",10}}){
  runPanelCheck(std::string("mse.workspace.hidePanel('")+name+"')");if(columnVisibility()[index])throw std::runtime_error("Script hide panel ignored");
  runPanelCheck(std::string("mse.workspace.showPanel('")+name+"')");if(!columnVisibility()[index])throw std::runtime_error("Script show panel ignored");
  for(const auto& [dock,expected]:std::initializer_list<std::pair<const char*,panels::Dock>>{{"left",panels::Dock::Left},{"right",panels::Dock::Right},{"bottom",panels::Dock::Bottom},{"floating",panels::Dock::Floating}}){runPanelCheck(std::string("mse.workspace.setPanel('")+name+"',{dock='"+dock+"',visible=true})");if(docking_.groups[docking_.groupOf(index)].dock!=expected)throw std::runtime_error("Script panel docking ignored");}
 }
 runPanelCheck("mse.workspace.showPanel('freeTileInstances')");if(freeTileInstancesOpen_)throw std::runtime_error("Empty raster instance panel bypassed existing availability");
 if(currentDocument().identity()!=panelIdentity||currentDocument().historyPosition()!=panelHistory||currentDocument().pixels()[0]!=0xff112233)throw std::runtime_error("Panel script edited document");
 palettePanelOpen_=savedVisible[0];colorPickerOpen_=savedVisible[1];layersPanelOpen_=savedVisible[2];previewPanelOpen_=savedVisible[3];historyPanelOpen_=savedVisible[8];referencePanelOpen_=savedVisible[9];tabletVisibility_.visible=savedVisible[10];tilesetPanelOpen_=savedVisible[11];brushLibraryPanelOpen_=savedVisible[12];docking_=savedDocking;
 // Styles share one document transaction and the native menu clipboard.
 const auto savedStyleClipboard=copiedLayerStyle_;const auto savedStyleClipboardValid=layerStyleClipboard_;const auto styleHistory=currentDocument().historyPosition();
 runPanelCheck("app.transaction(function() app.activeImage:drawPixel(1,0,0xff765432); mse.styles.apply{styles={colorOverlay={enabled=true,color={r=17,g=34,b=51,a=255}},shadow={enabled=true,offsetX=-3}}}; mse.styles.copy(); mse.styles.setEnabled{enabled=false} end)");
 if(currentDocument().historyPosition()!=styleHistory+1||!currentDocument().layer().layerStyles||currentDocument().layer().layerStyles->enabled||currentDocument().layer().layerStyles->color!=0xff332211||!layerStyleClipboard_||!copiedLayerStyle_||!copiedLayerStyle_->enabled)throw std::runtime_error("Formal script style transaction/clipboard failed");
 currentDocument().undo();if(currentDocument().layer().layerStyles||currentDocument().pixels()[1])throw std::runtime_error("Formal script style undo failed");currentDocument().redo();
 runPanelCheck("mse.styles.clear()");if(currentDocument().layer().layerStyles)throw std::runtime_error("Formal style clear ignored");
 if(!menuCommands_.invoke("pasteLayerStyles")||!currentDocument().layer().layerStyles||!currentDocument().layer().layerStyles->enabled)throw std::runtime_error("Native paste did not use script clipboard: active="+std::to_string(currentDocument().active())+" targets="+std::to_string(currentDocument().layerStyleTargets().size())+" valid="+std::to_string(layerStyleClipboard_)+" copied="+std::to_string(bool(copiedLayerStyle_))+" enabled="+std::to_string(copiedLayerStyle_&&copiedLayerStyle_->enabled)+" style="+std::to_string(bool(currentDocument().layer().layerStyles))+" group="+currentDocument().selectedGroupId().value_or("none"));
 if(!menuCommands_.invoke("copyLayerStyles"))throw std::runtime_error("Native copy style refused");runPanelCheck("mse.styles.clear(); mse.styles.paste()");if(!currentDocument().layer().layerStyles||currentDocument().layer().layerStyles->shadow.offsetX!=-3)throw std::runtime_error("Script paste did not use native clipboard");
 copiedLayerStyle_=savedStyleClipboard;layerStyleClipboard_=savedStyleClipboardValid;
 const auto propertyHistory=currentDocument().historyPosition();const auto propertyName=currentDocument().layer().name;const auto propertyPixel=currentDocument().pixels()[0];
 runPanelCheck("app.transaction(function() app.activeImage:drawPixel(0,0,0xffaabbcc); mse.layers.update{name='  Script properties  ',description=' raw ',opacity=128,blendMode='multiply',x=4,y=5,displayColor={r=1,g=2,b=3}} end)");
 if(currentDocument().historyPosition()!=propertyHistory+1||currentDocument().layer().name!=U"Script properties"||currentDocument().layer().description!=U" raw "||currentDocument().layer().opacity!=128./255.||currentDocument().activeSurfaceIfPresent()->offsetX!=4||currentDocument().pixels()[0]!=0xffaabbcc)throw std::runtime_error("Formal script layer properties failed");
 currentDocument().undo();if(currentDocument().layer().name!=propertyName||currentDocument().activeSurfaceIfPresent()->offsetX!=0||currentDocument().pixels()[0]!=propertyPixel)throw std::runtime_error("Formal script layer properties undo failed");currentDocument().redo();if(currentDocument().layer().name!=U"Script properties"||currentDocument().activeSurfaceIfPresent()->offsetY!=5)throw std::runtime_error("Formal script layer properties redo failed");currentDocument().undo();

 // Project brush removal uses the real script host and persists without history.
 ProjectBrushResource scriptBrush;scriptBrush.metadata.id="script-owned-brush";scriptBrush.metadata.name="Script brush";scriptBrush.metadata.width=scriptBrush.metadata.height=1;scriptBrush.metadata.dataFile="brushes/script-owned.gray";scriptBrush.brush.width=scriptBrush.brush.height=1;scriptBrush.brush.coverage={255};scriptBrush.brush.colors={0xff123456};currentDocument().setImportedProjectBrushes({scriptBrush});const auto brushHistory=currentDocument().historyPosition();
 runPanelCheck("mse.brushes.remove('script-owned-brush')");if(!currentDocument().projectBrushes().empty()||currentDocument().historyPosition()!=brushHistory||!project::readProjectManifest(project::encodeEditableProject(currentDocument()).bytes).customBrushes.empty())throw std::runtime_error("Formal script project brush removal failed");
 PatternBrushLibrary scriptLibrary(fillBrushLibraryDirectory());const auto localScriptBrush=scriptLibrary.save("script-owned-local",encodePatternBrushPng(scriptBrush.brush));const auto localBrushHistory=currentDocument().historyPosition();runPanelCheck("mse.brushes.remove('"+localScriptBrush.id+"')");if(std::filesystem::exists(std::filesystem::u8path(localScriptBrush.filePath))||currentDocument().historyPosition()!=localBrushHistory)throw std::runtime_error("Formal script local brush deletion failed");
 // Selection brush creation uses the operation-time raster and the formal host.
 currentDocument().previewSelection(SelectionMask{0,0,1,1,{}});const auto captureHistory=currentDocument().historyPosition();
 runPanelCheck("app.transaction(function() app.activeImage:drawPixel(0,0,0xff2468ac); mse.brushes.createFromSelection() end)");
 const auto capturedBrushId=currentTools().pencilImageBrushId;const auto captureListing=scriptLibrary.list();if(std::none_of(captureListing.brushes.begin(),captureListing.brushes.end(),[&](const auto& b){return b.id==capturedBrushId&&b.intrinsicSize&&b.sourceX==0&&b.sourceY==0;}))throw std::runtime_error("Formal captured brush metadata missing");
 if(currentDocument().selection()||!currentTools().pencilImageBrush||currentTools().pencilImageBrush->colors!=std::vector<Pixel>{0xff2468ac}||currentDocument().historyPosition()!=captureHistory+1||currentTools().selectionTool||currentTools().eraser)throw std::runtime_error("Formal selection brush capture failed");
 currentDocument().undo();currentDocument().redo();if(currentDocument().pixels()[0]!=0xff2468ac)throw std::runtime_error("Formal selection brush history failed");currentDocument().undo();scriptLibrary.remove(capturedBrushId);currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();currentDocument().previewSelection({});
 // Free source and instance mutations use the production async script host.
 const auto freeScriptRaster=currentDocument().layer().id,freeScriptFrame=currentDocument().frame().id;const auto freeHistory=currentDocument().historyPosition();
 runPanelCheck("app.transaction(function() mse.freeTiles.createLayer{name='Script free'}; mse.freeTiles.createSource{name='Script source'} end)");
 auto freeLayer=std::find_if(currentDocument().timeline().state().layers.begin(),currentDocument().timeline().state().layers.end(),[](const auto& l){return l.name==U"Script free";});if(freeLayer==currentDocument().timeline().state().layers.end()||freeLayer->freeTiles->sources.size()!=2||currentDocument().historyPosition()!=freeHistory+1)throw std::runtime_error("Formal free source creation failed");
 const auto freeLayerId=freeLayer->id,freeSourceId=freeLayer->freeTiles->sources.back().id;
 runPanelCheck("app.transaction(function() mse.freeTiles.edit{sourceId='"+freeSourceId+"',pixels={4279383126}}; mse.freeTiles.place{layerId='"+freeLayerId+"',sourceId='"+freeSourceId+"',x=1,y=0} end)");currentDocument().selectLayer(freeLayerId);if(currentDocument().pixels()[1]!=0xff123456||currentDocument().cel().freeTiles->instances.size()!=1)throw std::runtime_error("Formal free edit/place failed");const auto freeInstanceId=currentDocument().cel().freeTiles->instances.front().id;currentDocument().undo();currentDocument().selectLayer(freeLayerId);if(!currentDocument().cel().freeTiles->instances.empty())throw std::runtime_error("Formal free undo failed");currentDocument().redo();currentDocument().selectLayer(freeLayerId);if(currentDocument().cel().freeTiles->instances.front().id!=freeInstanceId||currentDocument().pixels()[1]!=0xff123456)throw std::runtime_error("Formal free redo failed");currentDocument().undo();currentDocument().undo();currentDocument().selectLayer(freeScriptRaster);currentDocument().selectFrame(freeScriptFrame);
 // Grid-tile script operations enter the same production host and history.
 const auto tileScriptRaster=currentDocument().layer().id;const auto tileScriptHistory=currentDocument().historyPosition();
 runPanelCheck("app.transaction(function() mse.tiles.createLayer{name='Script tiles',tileWidth=1,tileHeight=1}; mse.tiles.place{x=0,y=0} end)");
 auto scriptTile=std::find_if(currentDocument().timeline().state().layers.begin(),currentDocument().timeline().state().layers.end(),[](const auto& l){return l.name==U"Script tiles";});
 if(scriptTile==currentDocument().timeline().state().layers.end()||currentDocument().historyPosition()!=tileScriptHistory+1||!tilesetPanelOpen_)throw std::runtime_error("Formal grid script create/place failed");
 const auto scriptTileLayer=scriptTile->id,scriptSet=scriptTile->tilemapTilesetId;auto scriptSetIt=std::find_if(currentDocument().timeline().state().tilesets.begin(),currentDocument().timeline().state().tilesets.end(),[&](const auto& t){return t.id==scriptSet;});const auto scriptTileId=scriptSetIt->tileIds.front();
 currentDocument().selectLayer(tileScriptRaster);runPanelCheck("mse.tiles.edit{tilesetId='"+scriptSet+"',tileId='"+scriptTileId+"',pixels={4279383126}}");currentDocument().selectLayer(scriptTileLayer);if(currentDocument().pixels()[0]!=0xff123456)throw std::runtime_error("Formal grid source edit failed");
 currentDocument().undo();currentDocument().selectLayer(scriptTileLayer);if(currentDocument().pixels()[0])throw std::runtime_error("Formal grid source undo failed");currentDocument().redo();currentDocument().selectLayer(scriptTileLayer);if(currentDocument().pixels()[0]!=0xff123456)throw std::runtime_error("Formal grid source redo failed");currentDocument().undo();currentDocument().undo();currentDocument().selectLayer(tileScriptRaster);
 const auto structureCount=currentDocument().timeline().state().layers.size(),structureHistory=currentDocument().historyPosition();
 runPanelCheck("app.transaction(function() mse.layers.create{name='Script created'}; mse.layers.duplicate(); mse.layers.update{name='Script copied'} end)");
 if(currentDocument().timeline().state().layers.size()!=structureCount+2||currentDocument().historyPosition()!=structureHistory+1)throw std::runtime_error("Formal script layer structure failed");
 currentDocument().undo();if(currentDocument().timeline().state().layers.size()!=structureCount)throw std::runtime_error("Formal script structure undo failed");currentDocument().redo();if(currentDocument().timeline().state().layers.size()!=structureCount+2)throw std::runtime_error("Formal script structure redo failed");currentDocument().undo();

 runPanelCheck("mse.ui.notify{message='Native notification 🌙'}");if(status_!=U"Native notification 🌙")throw std::runtime_error("Formal script notification failed");
 runPanelCheck("mse.ui.notify{message=false,text='ignored'}");if(!status_.empty())throw std::runtime_error("Formal script empty notification failed");

 // Panel requests finish on the original tab before created documents are adopted.
 ensureProjects();const auto sourceIdentity=currentDocument().identity();const auto sourceTab=activeProject_,tabs=projects_.size();
 runPanelCheck("mse.workspace.hidePanel('palette'); local s=Sprite(2,2); s.name='Script adopted'; app.activeImage:drawPixel(0,0,0xff556677)");
 if(projects_.size()!=tabs+1||currentDocument().identity()==sourceIdentity||currentDocument().width()!=2||currentDocument().height()!=2||currentDocument().name()!=U"Script adopted"||currentDocument().pixels()[0]!=0xff556677||palettePanelOpen_||projectDocument(sourceTab).identity()!=sourceIdentity||projectDocument(sourceTab).pixels()[0]!=0xff112233)throw std::runtime_error("Script panel/document adoption boundary lost original tab or pixels");
 palettePanelOpen_=savedVisible[0];
 // Verify the production discovery -> contributed menu -> Lua path, including
 // the real shared More overflow layout rather than a separate test menu tree.
 auto checkContributions=[&]() __declspec(noinline) {
  const auto package=root/"extensions"/"menu-entry";std::filesystem::create_directories(package);
  std::ofstream(package/"manifest.json")<<R"({"schemaVersion":2,"id":"menu-entry","name":"Entry menu","version":"1","commands":[{"id":"paint","name":"Paint entry","entry":"paint.lua"}],"topMenus":[{"id":"entry","name":"Entry contribution","position":"before:help","commands":["paint"]}],"menuItems":[{"id":"edit","menu":"edit","position":"end","commands":["paint"]}]})";
  std::ofstream(package/"paint.lua")<<"app.activeImage:drawPixel(1,0,0xff765432)";extension::RuntimeDirectory::setEnabled(root/"extensions","menu-entry",true);
  std::function<PixelMenuItem*(ui::Menu*,const std::string&)> find=[&](ui::Menu* menu,const std::string& id)->PixelMenuItem*{for(auto child:menu->children())if(auto item=dynamic_cast<PixelMenuItem*>(child)){if(item->id()==id)return item;if(auto submenu=item->getSubmenu())if(auto found=find(submenu,id))return found;}return nullptr;};
  const std::string topId="extension-menu:menu-entry:entry";
  auto publish=[&](bool visible){updateScriptsMenu();const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(10);do{pumpScripts();manager()->dispatchMessages();std::this_thread::yield();}while((scripts_->client.loading()||bool(find(menuBar_->getMenu(),topId))!=visible)&&std::chrono::steady_clock::now()<until);if(scripts_->client.loading()||bool(find(menuBar_->getMenu(),topId))!=visible)throw std::runtime_error("Formal contribution discovery/publication timeout");};
  publish(true);for(auto child:scriptsMenu_->children())if(child->id()=="extension:menu-entry:paint")throw std::runtime_error("Placed Lua duplicated in Scripts");
  const auto ordinaryBar=menuBar_->bounds();layoutTopMenu({ordinaryBar.x,ordinaryBar.y,170*uiScale,ordinaryBar.h});auto top=find(menuBar_->getMenu(),topId);if(!top||top->parent()==menuBar_->getMenu())throw std::runtime_error("Contributed top menu not retained in More");
  auto action=find(menuBar_->getMenu(),"menu-entry:menu-item:edit:paint");if(!action)throw std::runtime_error("Formal builtin contribution missing");action->Click();manager()->dispatchMessages();const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(10);do{pumpScripts();std::this_thread::yield();}while((!scripts_->queued.empty()||scripts_->client.running())&&std::chrono::steady_clock::now()<until);if(currentDocument().pixels()[1]!=0xff765432)throw std::runtime_error("Formal contributed Lua did not execute");
  extension::RuntimeDirectory::setEnabled(root/"extensions","menu-entry",false);publish(false);if(find(menuBar_->getMenu(),"menu-entry:menu-item:edit:paint"))throw std::runtime_error("Disabled formal contribution retained builtin command");refresh();std::ofstream(root/"menu-contributions-passed.txt")<<"production discovery, placement, More, Lua execution and disable passed";
 };checkContributions();
 stopScripts();replaceDocumentForSmoke(std::move(*std::make_unique<Document>()));refresh();
}

}
