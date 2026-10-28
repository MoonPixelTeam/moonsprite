#include "editor.h"
#include "editor_implementation.h"

namespace moon::editor {

Editor::~Editor() {closeParameterRange();if(dynamicsPopup_){dynamicsPopup_->closeWindow(nullptr);dynamicsPopup_.reset();}workspacePresetTimer_.stop();flushWorkspacePresetSave();diagnosticTimer_.stop();if(diagnostics_){diagnostics_->record("session","native.stopped");diagnostics_->flush();diagnostics_.reset();}saveDocumentView();usageStatistics_.flush();persistUsageStatistics();advancedNoticeTimer_.stop();thumbnailQueue_.reset();thumbnailTimer_.stop();if(colorEditorPopup_){colorEditorPopup_->closeWindow(nullptr);colorEditorPopup_.reset();}flushBrushSizePreferences();if(framePngJob_)framePngJob_->cancel=true;floatingViewportSaveTimer_.stop();cancelGradientMapJob();stopAntiAlias();stopConvolution();if(propertyRangePopup_){propertyRangePopup_->closeWindow(nullptr);propertyRangePopup_.reset();}celNavigationTimer_.stop();if(toolFlyout_){toolFlyout_->closeWindow(nullptr);toolFlyout_.reset();}antsTimer_.stop();sizeTimer_.stop();if(recoveryTimer_){recoveryTimer_->stop();delete recoveryTimer_;}if(recovery_.worker.valid())recovery_.worker.wait();}

Editor::Editor(const PixelFont& font,Skin& skin,std::filesystem::path assets,std::function<void()> refreshCursor,std::filesystem::path recoveryRoot,bool skipWorkspaceRestore)

    : ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),assets_(std::move(assets)),refreshCursor_(std::move(refreshCursor)),skipWorkspaceRestore_(skipWorkspaceRestore) {

    openSheetOutput_=[this](const auto& path){openPath(path);for(std::size_t i=0;i<projects_.size();++i)if(sameProjectPath(path,projectDocument(i).sourceFilePath())||sameProjectPath(path,i==activeProject_?documentPath_:projects_[i]->path))return;throw std::runtime_error(utf8Text(status_));};
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

      if(!showSelectionOutline_ || !document.selection() || !documentOpen_ || homeOpen_ || !isVisible()){antsTimer_.stop();return;}

      antsOffset_=(antsOffset_+1)&7;

      const auto& s=*document.selection();const double scale=canvasScale();

      auto dirty=gfx::Rect(int(std::floor(canvas_.x+s.x*scale))-2,int(std::floor(canvas_.y+s.y*scale))-2,

        int(std::ceil(s.width*scale))+5,int(std::ceil(s.height*scale))+5);

      dirty&=canvasViewport();invalidateRect(dirty);

    });

    celNavigationTimer_.Tick.connect([this]{celNavigationTick(std::chrono::steady_clock::now());});

    auto scroll=[this](bool vertical){auto bar=new DialogBackground<PixelScrollBar>(skin_,vertical);configureDialogBackground(bar);addChild(bar);return bar;};

    railScrollBar_=scroll(true);railScrollBar_->changed=[this](int value){railScrollPixels_=value;layoutToolRail();invalidate();};railVerticalScrollBar_=railScrollBar_;railHorizontalScrollBar_=scroll(false);railHorizontalScrollBar_->changed=[this](int value){railScrollPixels_=value;layoutToolRail();invalidate();};railHorizontalScrollBar_->setVisible(false);

    timelineHorizontal_=scroll(false);timelineVertical_=scroll(true);timelineHorizontal_->setMaterialOpacity(96,204);timelineVertical_->setMaterialOpacity(96,204);canvasHorizontal_=scroll(false);canvasVertical_=scroll(true);canvasHorizontal_->setTransparent(false);canvasVertical_->setTransparent(false);homeScrollBar_=scroll(true);errorScrollBar_=scroll(true);preferenceNavBar_=scroll(true);preferenceContentBar_=scroll(true);

    preferenceNavBar_->changed=[this](int value){preferenceNavPixels_=value;layoutModal();invalidateRect(dialogDisplayBounds());};

    preferenceContentBar_->changed=[this](int value){preferenceContentPixels_=value;layoutModal();invalidateRect(dialogDisplayBounds());};

    timelineHorizontal_->changed=[this](int value){frameScroll_=value/(timelineFrameWidth()*uiScale);frameScrollRemainder_=value%(timelineFrameWidth()*uiScale);layoutLayers();invalidateTimelineGrid();};

    timelineVertical_->changed=[this](int value){layerScroll_=value/(timelineRowHeight()*uiScale);layerScrollRemainder_=value%(timelineRowHeight()*uiScale);layoutLayers();invalidateTimelineGrid();};

    homeScrollBar_->changed=[this](int value){homeScrollPixels_=value;layoutHome();invalidate();};

    errorScrollBar_->changed=[this](int value){errorScrollPixels_=value;modalErrorScroll_=value/(12*uiScale);layoutModal();invalidateRect(dialogDisplayBounds());};

    canvasHorizontal_->changed=[this](int value){const auto v=canvasViewport(),b=canvasDisplayBounds();const int upper=clampCanvasAxis(INT_MAX,v.x,v.w,b.w);panCanvasDisplay(upper-value-b.x,0);constrainCanvas();saveDocumentView();invalidateRect(canvasViewport());};

    canvasVertical_->changed=[this](int value){const auto v=canvasViewport(),b=canvasDisplayBounds();const int upper=clampCanvasAxis(INT_MAX,v.y,v.h,b.h);panCanvasDisplay(0,upper-value-b.y);constrainCanvas();saveDocumentView();invalidateRect(canvasViewport());};

    paletteGrowthHandle_=button(U"Ⅱ",[]{});paletteGrowthHandle_->centerCaption=true;paletteGrowthHandle_->skinStyle="button";paletteGrowthHandle_->pointerPress=[this](const ui::MouseMessage& mouse){beginPaletteGrowth(mouse);};paletteGrowthHandle_->paletteViewport=[this]{return paletteViewportBounds();};

    paletteHorizontalBar_=scroll(false);paletteHorizontalBar_->changed=[this](int value){paletteScrollXPixels_=value;layoutPalette(0);invalidateRect(paletteContentBounds());};

    paletteScrollBar_=scroll(true);paletteScrollBar_->changed=[this](int value){paletteScrollPixels_=value;layoutPalette(0);invalidateRect(paletteContentBounds());};

    registerScrollDrag([this]{return columnShown(0)?paletteViewportBounds():gfx::Rect();},{

      [this]{return SpaceDragScroll::Position{0,paletteScrollPixels_};},

      [this]{const int step=swatchPixels_[swatchSize_]/uiScale-1,padding=1+uiGap;const int height=(2*padding+((int(swatches_.size())+1+paletteColumns_-1)/paletteColumns_)*step+1)*uiScale;return SpaceDragScroll::Position{0,std::max(0,height-paletteViewportBounds().h)};},

      [this](SpaceDragScroll::Position p){if(paletteScrollPixels_==p.y)return;paletteScrollPixels_=p.y;layoutPalette(0);invalidateRect(paletteContentBounds());}});

    registerScrollDrag([this]{return columnShown(2)?timelineRowViewport():gfx::Rect();},{

      [this]{return SpaceDragScroll::Position{frameScroll_*timelineFrameWidth()*uiScale+frameScrollRemainder_,layerScroll_*timelineRowHeight()*uiScale+layerScrollRemainder_};},

      [this]{const auto m=timelineScrollMetrics(columnLayout(uiLogical(clientBounds()),2));return SpaceDragScroll::Position{std::max(0,m.contentWidth-m.width),std::max(0,m.contentHeight-m.height)};},

      [this](SpaceDragScroll::Position p){frameScroll_=p.x/(timelineFrameWidth()*uiScale);frameScrollRemainder_=p.x%(timelineFrameWidth()*uiScale);layerScroll_=p.y/(timelineRowHeight()*uiScale);layerScrollRemainder_=p.y%(timelineRowHeight()*uiScale);layoutLayers();invalidateTimelineGrid();}});

    paletteSelectionOverlay_=new FloatingColumnSurface;paletteSelectionOverlay_->setTransparent(true);addChild(paletteSelectionOverlay_);

    paletteSelectionOverlay_->paint=[this](ui::Graphics& g){UiPaintScale scale(g);const auto offset=-paletteSelectionOverlay_->bounds().origin();const bool hover=paletteMousePosition_ && paletteOutlineContains(*paletteMousePosition_);for(auto edge:paletteSelectionEdges_){edge.border.offset(offset);for(auto piece:edge.pieces){piece.offset(offset);g.saveClip();g.clipRect(uiLogical(piece));skin_.drawSelectionBorder(g,edge.border,hover);g.restoreClip();}}};

    paletteSelectionOverlay_->pointer=[this](ui::Message* msg){if(pending_!=Pending::None)return false;if(msg->type()==ui::kMouseDownMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);beginPalettePointer(paletteManual_?paletteSlotAt(mouse->position()):std::min(paletteSlotAt(mouse->position()),paletteButtonIds_.size()-1),*mouse);return true;}return false;};

    recoveryTimer_=new ui::Timer(16,this);recoveryTimer_->Tick.connect([this]{timelapseTick();liquifyTick();if(brushFeedback_.brushPreferencesPending_ && !brushFeedback_.modifierBrushSize_ && std::chrono::steady_clock::now()>=brushFeedback_.brushPreferencesDue_)flushBrushSizePreferences();saveTick();framePngTick();if(paletteGesture_ && !paletteGesture_->active && !paletteGesture_->moving && !paletteGesture_->secondary && std::chrono::steady_clock::now()-paletteGesture_->began>=std::chrono::milliseconds(360))updatePalettePointer(paletteGesture_->origin);playbackTick();recoveryTick();usageStatisticsTick();convolutionTick();antiAliasTick();gradientMapTick();wandTick();gradientTick();shapeTick();});recoveryTimer_->start();

    commands_.push_back(button(U"新建",[this]{ask(Pending::New);}));

    documentTabNew_=button(U"",[this]{ask(Pending::New);});documentTabNew_->iconSkin=&toolIcons_;documentTabNew_->icon="plus";documentTabNew_->tabAdd=true;

    documentTabClose_=button(U"",[this]{activateProject(0);ask(Pending::CloseDocument);});documentTabClose_->iconSkin=&toolIcons_;documentTabClose_->icon="close";documentTabClose_->bareTabIcon=true;

    commands_.push_back(button(U"画笔",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;cancelStroke();liquifyTool_=false;liquifyResetPosition_.reset();smoothTool_=false;airbrushTool_=false;rotateTool_=false;textTool_=false;moveTool_=false;selectionTool_=false;shapeTool_=false;eyedropperTool_=false;navigation_.zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=false;eraser_=false;updateNavigationCursor();refresh();}));

    commands_.push_back(button(U"橡皮",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;cancelStroke();liquifyTool_=false;liquifyResetPosition_.reset();smoothTool_=false;airbrushTool_=false;rotateTool_=false;textTool_=false;moveTool_=false;selectionTool_=false;shapeTool_=false;eyedropperTool_=false;navigation_.zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=false;eraser_=true;updateNavigationCursor();refresh();}));

    commands_.push_back(button(U"撤销",[this]{cancelStroke();document.undo();refresh();}));

    commands_.push_back(button(U"重做",[this]{cancelStroke();document.redo();refresh();}));

    commands_.push_back(button(U"手",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;cancelStroke();liquifyTool_=false;liquifyResetPosition_.reset();smoothTool_=false;airbrushTool_=false;rotateTool_=false;textTool_=false;moveTool_=false;shapeTool_=false;eyedropperTool_=false;navigation_.zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=true;updateNavigationCursor();refresh();}));

    createToolRail();

    loadPaletteSize();

    try{const auto path=palettePreferencePath().parent_path()/"animation-playback.txt";if(std::filesystem::exists(path)){std::ifstream in(path);readPlaybackPreferences(in);}}catch(const std::exception& e){playbackRate_=1;playbackReturnToStart_=false;savedPlaybackMode_.reset();status_=U"播放偏好读取失败："+unicodeText(e.what());}

    layerLabelSeparator_=new LayerLabelSeparator;layerLabelSeparator_->process=[this](ui::Message* msg){return processLayerLabelResize(msg);};addChild(layerLabelSeparator_);

    try{const auto path=palettePreferencePath().parent_path()/"layer-label-width.txt";if(std::filesystem::exists(path)){std::ifstream in(path);std::string value;if(!in || !std::getline(in,value))throw std::runtime_error("Cannot read layer label width");layerLabelWidth_.physical=layerlabel::load(value);}}catch(const std::exception& e){layerLabelReadable_=false;status_=U"图层列宽读取失败，保存已禁用："+unicodeText(e.what());}

    try{auto settings=animationprefs::load(palettePreferencePath().parent_path()/"animation-settings.json",palettePreferencePath().parent_path()/"onion-skin.txt");onion_=settings.onion;skipDisabledFrames_=settings.skipDisabledFrames;}catch(const std::exception& e){animationSettingsReadable_=false;status_=U"动画设置读取失败，保存已禁用："+unicodeText(e.what());}

    // Recent colors belong to this project session; do not import prior runs.

    for(const auto icon:{"up","down","restore","paletteCenter","moreLines","paletteLocal","extractColors","autoSlice","rotateClockwise90","selectionFlipHorizontal","selectionFlipVertical","properties","workspace","aspectLink","selectionOutline","lock","unlock","undo","redo","dither","image","checkboxUnchecked","checkboxChecked","more","brush-round","brush-square","brush-line","liquify-mode-push","liquify-mode-inflate","liquify-mode-deflate","liquify-mode-twist-clockwise","liquify-mode-twist-counter-clockwise","ink-simple","ink-copy-alpha-color","ink-lock-alpha","pressure-dynamics","symmetry-horizontal","symmetry-vertical","symmetry-diagonal-up","symmetry-diagonal-down","symmetry-rotational","close","plus","minus","follow","canvasTopLeft","canvasTop","canvasTopRight","canvasLeft","canvasAnchorCenter","canvasRight","canvasBottomLeft","canvasBottom","canvasBottomRight","eye","eyeOff","delete","playback-first","playback-previous","playback-play","playback-pause","playback-next","playback-last","left","right","check","copy","link","onion","animation-auto-link-off","animation-auto-link-on","newFolder","ungroupFolder","gradientMap","tileModeEdit","tileModeCreate","tileModeHybrid","tilemap","freeTile","linkedLayer","convertTo","mergeDown","mergeVisible","clippingMask","layerMask","layerStyle","paste","clearRecords","info","swap","move","home","folder","folderOpen","save","import","refresh","selection-pivot","draw-with-anchor","anchor-preset-nw","anchor-preset-n","anchor-preset-ne","anchor-preset-w","anchor-preset-center","anchor-preset-e","anchor-preset-sw","anchor-preset-s","anchor-preset-se","gradient-linear","gradient-radial","gradient-stop","about-git-fork","about-external-link","pin","project-pencil","project-drawing-time","project-layer-count"}) for(const auto suffix:{"","-disabled"}) {

      const auto name=std::string(icon)+suffix;const auto atlas=skin_.assets.patches.find("icon."+name);toolIcons_.assets.patches[name]=atlas==skin_.assets.patches.end()?importSkinPng(assets_/"utility-icons"/(name+".png"),32):atlas->second;

    }

    for(const auto icon:{"selection-replace","selection-add","selection-subtract","selection-intersect","selection-shrink","selection-pivot-preset-0","selection-pivot-preset-1","selection-pivot-preset-2","selection-pivot-preset-3","selection-pivot-preset-4","selection-pivot-preset-5","selection-pivot-preset-6","selection-pivot-preset-7","selection-pivot-preset-8"})for(const auto suffix:{"","-disabled"}){const auto name=std::string(icon)+suffix;toolIcons_.assets.patches[name]=importSkinPng(assets_/"utility-icons"/(name+".png"),32);}

    for(const auto icon:{"playback-first","playback-previous","playback-play","playback-next","playback-last","onion","plus","delete","plus","newFolder","lock","link"}){const auto index=timelineInactive_.size();auto b=timelineButton(U"",[this,index]{switch(index){case 0:toolbarSelectFrame(0);break;case 1:toolbarStepFrame(-1);break;case 2:togglePlayback();break;case 3:toolbarStepFrame(1);break;case 4:toolbarSelectFrame(document.timeline().state().frames.size()-1);break;case 5:toggleOnion();break;case 6:frameAction(1);break;case 7:deleteTimelineItems();break;case 8:createLayer();break;}});b->iconSkin=&toolIcons_;b->icon=icon;b->skinStyle=index<10?"icon_button":"timeline-row";if(index<10){b->iconGroupIndex=int(index<5?index:index<8?index-5:index-8);b->iconGroupCount=index<5?5:3;}timelineInactive_.push_back(b);if(index==5)b->context=[this]{showOnionMenu();};if(index==2)b->context=[this]{showPlaybackMenu();};}

    layerEye_=timelineButton(U"",[this]{const auto& layer=document.timeline().state().layers.at(layerScroll_);document.beginVisibilityGesture();document.previewVisibilityGesture(layer.id,!layer.visible);document.commitVisibilityGesture();refresh();});layerEye_->iconSkin=&toolIcons_;layerEye_->skinStyle="timeline-row";

    layerRow_=timelineButton(document.layer().name,[]{});

    layerRow_->skinStyle="timeline-row";

    layerRow_->doubleClick=[this]{showLayerOpacity();};

    try{const auto path=palettePreferencePath().parent_path()/"layer-side-dock-auto-hide.txt";if(std::filesystem::exists(path)){if(std::filesystem::file_size(path)>16)throw std::runtime_error("Invalid side dock preference");std::ifstream in(path);std::string value;if(!(in>>value)||(value!="true"&&value!="false")||!(in>>std::ws).eof())throw std::runtime_error("Invalid side dock preference");layerSideDockAutoHide_=value=="true";}}catch(const std::exception& e){layerSideDockReadable_=false;status_=U"图层侧边隐藏设置读取失败，保存已禁用："+unicodeText(e.what());}
    {std::ifstream in(palettePreferencePath().parent_path()/"layer-display-density.txt");std::string value;in>>value;for(int i=0;i<6;++i)if(value==timelineDensityKeys_[i])timelineDensity_=i;}

    try{layerQuickActions_=layerquick::load(palettePreferencePath().parent_path()/"layer-quick-actions.json");auto path=palettePreferencePath().parent_path()/"layer-quick-actions-layout-v1.txt";std::ifstream in(path);int x,y,w,h;if(in>>x>>y>>w>>h)layerQuickDialogGeometry_={x,y,std::clamp(w,340,640),std::clamp(h,360,760)};}catch(const std::exception& e){status_=U"快捷操作偏好读取失败："+unicodeText(e.what());}

    layerQuickSettings_=button(U"",[this]{showLayerQuickActions();});layerQuickSettings_->iconSkin=&toolIcons_;layerQuickSettings_->icon="properties";layerQuickSettings_->skinStyle="icon_button";layerQuickSettings_->hover=[this]{status_=U"图层设置";invalidate();};

    for(int i=0;i<layerquick::limit;++i){auto b=button(U"",[this,i]{const auto quick=layerquick::visible(layerQuickActions_,[this](const std::string& id){return menuCommands_.connected(id);});if(i<int(quick.size()))menuCommands_.invoke(quick[i].id);});b->iconSkin=&toolIcons_;b->skinStyle="icon_button";b->hover=[this,i]{const auto quick=layerquick::visible(layerQuickActions_,[this](const std::string& id){return menuCommands_.connected(id);});if(i<int(quick.size()))status_=layerquick::find(quick[i].id)->label;invalidate();};layerQuickButtons_.push_back(b);}

    layerProperties_=button(U"",[this]{openSelectedLayerProperties();});layerProperties_->iconSkin=&toolIcons_;layerProperties_->icon="properties";layerProperties_->skinStyle="icon_button";layerProperties_->iconGroupIndex=2;layerProperties_->iconGroupCount=3;

    layerHeaderOpacity_=new PixelSlider(font_,skin_);addChild(layerHeaderOpacity_);

    layerHeaderOpacity_->interactionBegin=[this]{document.beginLayerOpacity();};

    layerHeaderOpacity_->changed=[this](int value){document.previewLayerOpacity(value/100.0);invalidate();};

    layerHeaderOpacity_->interactionCommit=[this]{document.commitLayerOpacity();refresh();};

    layerHeaderOpacity_->interactionCancel=[this]{document.cancelLayerOpacity();refresh();};

    createToolOptions();createGradientOptions();connectLegacyPropertyRanges();createShapeOptions();createEyedropperOptions();createMoveOptions();createSliceOptions();initializePropertyEntryWidths();

    try{std::ifstream in(palettePreferencePath().parent_path()/"symmetry.txt");if(in){for(int i=0;i<5;++i)in>>symmetryFlag(i);in>>symmetryLocked_>>symmetryThickness_>>symmetryColor_;symmetryThickness_=std::clamp(symmetryThickness_,1,8);persistedSymmetryAxes_=document.symmetryAxes;symmetryInitialized_=symmetryHas(document.symmetryAxes);}}catch(const std::exception& e){status_=U"对称偏好读取失败："+unicodeText(e.what());}createFillPatternOptions();migratePropertyDropdowns();

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

    paletteInput_=new FrameDurationPaletteEntry(font_,skin_);static_cast<FrameDurationPaletteEntry*>(paletteInput_)->durationCommit=[this]{commitFrameDurationDraft();};static_cast<FrameDurationPaletteEntry*>(paletteInput_)->durationWheel=[this](int delta){if(pending_!=Pending::FrameDuration)return;const int duration=std::clamp(document.frame().duration+delta*10,1,60000);document.previewFrameDuration(duration);paletteInput_->setText(std::to_string(duration));refresh();};addChild(paletteInput_);paletteInput_->setVisible(false);

    for(int i=0;i<4;++i){auto& input=loopInputs_[i];input=i==0?new PixelEntry(font_,skin_):new LoopNumberEntry(font_,skin_);input->numeric=i!=0;addChild(input);input->setVisible(false);input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};if(i){auto number=static_cast<LoopNumberEntry*>(input);number->committed=[this]{invalidate();};input->Change.connect([number]{number->updateLiveValue();});}else input->Change.connect([this]{invalidate();});}

    loopRepeat_=button(U"重复次数",[this]{toggleLoopRepeat();});loopRepeat_->iconSkin=&toolIcons_;loopRepeat_->bareIconWithCaption=true;loopRepeat_->setVisible(false);

    auto loopDropdown=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(loopDropdown);addChild(loopDropdown);loopDirection_=loopDropdown;

    loopDropdown->setOptions({U"\u6b63\u5411",U"\u53cd\u5411",U"\u6b63\u5411\u5f80\u8fd4",U"\u53cd\u5411\u5f80\u8fd4"});

    loopDropdown->changed=[this](int index){if(!loopDraft_)return;const char* directions[]{"forward","reverse","ping-pong","ping-pong-reverse"};loopDraft_->direction=directions[index];updateLoopDirection();invalidate();};loopDirection_->setVisible(false);

    createStoredPaletteControls();

    for(int i=0;i<24;++i){auto b=button(U"",[]{});b->paletteCell=true;b->recentColorSwatch=true;b->setVisible(false);paletteSavePreview_.push_back(b);}

    paletteInput_->accept=[this]{resolve(pending_==Pending::PaletteSave || pending_==Pending::BrushFolderName || pending_==Pending::PaletteName || pending_==Pending::PaletteExtract || pending_==Pending::LayerOpacity);};

    paletteInput_->Change.connect([this]{if(pending_==Pending::PaletteSave)paletteSaveName_=unicodeText(paletteInput_->text());if(pending_==Pending::LayerOpacity){document.previewLayerName(unicodeText(paletteInput_->text()));refresh();}if(pending_==Pending::OnionValue)previewOnionValue();});

    paletteInput_->cancel=[this]{resolve(false);};

    paletteInput_->blur=[this]{if(pending_==Pending::ColorRole) commitPaletteHex();else if(pending_==Pending::FrameDuration&&static_cast<FrameDurationPaletteEntry*>(paletteInput_)->durationMode)commitFrameDurationDraft();};

    panelTabs_.push_back(button(U"颜色板",[this]{cancelStroke();refresh();}));

    panelTabs_[0]->context=[this]{showColumnContextMenu(Column::Palette);};

    dockingTabs_[0]=panelTabs_[0];const char32_t* dockNames[]{U"颜色板",pickerColumnName(1),U"图层",U"预览",pickerColumnName(4),pickerColumnName(5),pickerColumnName(6),pickerColumnName(7),U"历史",U"参考图",U"数位板辅助",U"瓦片集",U"图案笔刷"};

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

    colorPicker_->changed=[this](Pixel color,bool secondary){document.setPaletteRole(color,secondary,paletteLocked_);refresh();};

    pickerPrimary_=button(U"",[this]{showRoleColorEditor(false);});pickerPrimary_->colorRole=true;

    pickerSecondary_=button(U"",[this]{showRoleColorEditor(true);});pickerSecondary_->colorRole=true;

    pickerAdd_=button(U"",[this]{document.addPaletteColor(document.palette().primary,paletteLocked_);refresh();});

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

    layerDescription_=new PixelTextArea(font_,skin_);addChild(layerDescription_);layerDescription_->setVisible(false);layerDescription_->changed=[this](const std::u32string& text){document.previewLayerDescription(text);refresh();};layerDescription_->cancel=[this]{resolve(false);};

    layerDisplayColor_=button(U"",[this]{if(pending_!=Pending::LayerOpacity)return;if(!colorEditorPopup_)colorEditorPopup_=std::make_unique<ColorEditorPopup>(font_,skin_,toolIcons_,smoke_?assets_.parent_path()/"color-editor-smoke-size.txt":palettePreferencePath().parent_path()/"color-editor-role-size.txt");std::vector<Pixel> colors;for(const auto& c:document.palette().entries)if(c.id)colors.push_back(c.color);colorEditorPopup_->open(layerDisplayColor_->bounds(),bounds(),layerDisplayColor_->swatch,U"图层显示颜色",colors,[this](Pixel color){if(pending_==Pending::LayerOpacity){document.previewLayerDisplayColor(color);layerDisplayColor_->swatch=color;refresh();}},{});});layerDisplayColor_->colorRole=true;layerDisplayColor_->setVisible(false);

    layerNoColor_=button(U"无色",[this]{document.previewLayerDisplayColor({});layerDisplayColor_->swatch=0;refresh();});layerNoColor_->setVisible(false);

    layerBlendMode_=new PixelDropdown(font_,skin_);addChild(layerBlendMode_);layerBlendMode_->setOptions({U"正常",U"变暗",U"正片叠底",U"颜色加深",U"线性加深",U"变亮",U"滤色",U"颜色减淡",U"线性减淡（添加）",U"叠加",U"柔光",U"强光",U"亮光",U"线性光",U"点光",U"实色混合",U"差值",U"排除",U"减去",U"划分",U"色相",U"饱和度",U"颜色",U"明度"});layerBlendMode_->setVisible(false);layerBlendMode_->changed=[this](int index){document.previewLayerBlendMode(std::string(layerBlendModeName(LayerBlendMode(index))));refresh();};

    layerOpacityRange_=new PixelSlider(font_,skin_);addChild(layerOpacityRange_);layerOpacityRange_->setVisible(false);

    layerOpacityRange_->changed=[this](int value){document.previewLayerOpacity(value/100.0);invalidate();};

    brushRange_=new PixelSlider(font_,skin_);addChild(brushRange_);brushRange_->setVisible(false);

    brushRange_->changed=[this](int value){

      auto& profile=brushFeedback_.brushProfiles_[eraser_?1:0];(brushRangeOpacity_?profile.opacity:profile.size)=value;

      updatingBrushFields_=true;(brushRangeOpacity_?brushOpacityInput_:brushSizeInput_)->setText(std::to_string(value));updatingBrushFields_=false;

      saveBrushPreferences();invalidate();

    };

    menuBar_=new ui::MenuBar(ui::MenuBar::ProcessTopLevelShortcuts::kNo);

    auto root=new PixelMenu(skin_);root->setBorder(gfx::Border(0));

    menuBar_->setMenu(root);addChild(menuBar_);

    homeButton_=new PixelMenuItem(font_,skin_,U"首页");

    homeButton_->available=[this]{return pending_==Pending::None && !document.active();};

    homeButton_->Click.connect([this]{showHome(true);});root->addChild(homeButton_);

    auto group=[&](std::u32string title,bool enabled=true) {

      auto item=new PixelMenuItem(font_,skin_,std::move(title));auto menu=new PixelMenu(skin_);

      item->setSubmenu(menu);item->setEnabled(enabled);root->addChild(item);return menu;

    };

    auto item=[&](PixelMenu* menu,const std::string& id,std::u32string title,std::u32string shortcut,

                  std::function<void()> action,std::function<bool()> enabled={},std::function<bool()> checked={}) {

      auto entry=new PixelMenuItem(font_,skin_,std::move(title),std::move(shortcut));

      entry->menuMarks=&toolIcons_;

      entry->available=[this,enabled,id]{return pending_==Pending::None && (documentOpen_ && !homeOpen_ || id=="diagnostics" || id=="userGuide" || id=="tips" || id=="usageStatistics" || id=="openShortcutSettings" || id=="newDocument" || id=="openDocument" || id=="pasteAsNewDocument" || id=="openAbout" || id=="openLatestRelease" || id=="closeWindow" || id.find("toggle")==0) && (!enabled || enabled());};

      entry->checked=std::move(checked);

      entry->Click.connect([this,entry,action,id]{if(entry->available()) {if(id!="pasteAsNewDocument"&&id!="openAbout"&&id!="openLatestRelease"&&id!="userGuide"&&id!="tips")cancelStroke();const auto started=std::chrono::steady_clock::now();diagnostics::recordGlobal("operation-start","menu."+id);try{action();}catch(const std::exception& e){diagnostics::recordGlobal("error","menu."+id,{{"message",std::string(e.what())}});throw;}catch(...){diagnostics::recordGlobal("error","menu."+id,{{"message",std::string("non-standard exception")}});throw;}const double duration=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-started).count();diagnostics::recordGlobal("operation-end","menu."+id,{{"outcome",std::string("ok")},{"durationMs",duration}});if(duration>=5000)diagnostics::recordGlobal("operation-slow","menu."+id,{{"durationMs",duration}});refresh();}});

      menu->addChild(entry);menuItems_[id]=entry;

    };

menuCommands_.bind("toggleFullscreen",{[this]{toggleFullscreen();},[this]{return display() && display()->nativeWindow();},[this]{return fullscreen();}});

menuCommands_.bind("openProjectFolder",{[this]{openProjectFolder();},[this]{return documentOpen_ && !homeOpen_ && !projectFolderSource().empty();},{}});

menuCommands_.bind("replaceColor",{[this]{openReplaceColor();},{},{}});

menuCommands_.bind("importSpriteSheet",{[this]{chooseSheetSource();},{},{}});

menuCommands_.bind("importSpriteSheetDocument",{[this]{openSheetImport(false);},{},{}});

menuCommands_.bind("importSpriteSheetSelection",{[this]{openSheetImport(true);},[this]{return document.selection().has_value();},{}});

menuCommands_.bind("exportSpriteSheet",{[this]{openSpriteSheet();},{},{}});

menuCommands_.bind("exportAllFrames",{[this]{openFramePngExport();},[this]{return document.timeline().state().frames.size()>1;},{}});

menuCommands_.bind("exportDocument",{[this]{openDocumentExport();},{},{}});

menuCommands_.bind("canvasResize",{[this]{openCanvasResize();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&(!document.active()||document.floating());},{}});
for(const auto& definition:filterPresetDefinitions()){const auto preset=definition.preset;menuCommands_.bind("filter:"+std::string(definition.id),{[this,preset]{openFilterPreset(preset);},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&(!document.active()||document.floating());},{}});}
menuCommands_.bind("lcdScreen",{[this]{openFilterPreset(FilterPreset::CrtSubtle,0,true);},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&(!document.active()||document.floating())&&document.timelineSelection().layers.size()==1;},{}});
menuCommands_.bind("imageResize",{[this]{openImageResize();},{},{}});

menuCommands_.bind("invertColors",{[this]{try{if(document.beginColorAdjustment()){ColorAdjustment a;a.kind=ColorAdjustmentKind::Invert;document.updateColorAdjustment(a);{Document::HistoryLabelScope historyLabel(document,U"反相");document.commitColorAdjustment();}refresh();}}catch(const std::exception& e){document.cancelColorAdjustment();status_=U"颜色调整失败："+unicodeText(e.what());refresh();}},{},{}});

menuCommands_.bind("gradientMap",{[this]{openGradientMap();},{},{}});

menuCommands_.bind("quickAntiAlias",{[this]{openAntiAlias();},{},{}});

menuCommands_.bind("cropCanvas",{[this]{cropCanvas();},[this]{return document.selection().has_value();},{}});

menuCommands_.bind("trimCurrentFrame",{[this]{trimCanvas(false);},{},{}});

menuCommands_.bind("trimCanvas",{[this]{trimCanvas(true);},{},{}});

menuCommands_.bind("convolution",{[this]{openConvolution();},{},{}});

menuCommands_.bind("adjustmentCurves",{[this]{openColorAdjustment(ColorAdjustmentKind::Curves);},{},{}});

menuCommands_.bind("adjustmentColorBalance",{[this]{openColorAdjustment(ColorAdjustmentKind::ColorBalance);},{},{}});

menuCommands_.bind("adjustmentBrightnessContrast",{[this]{openColorAdjustment(ColorAdjustmentKind::BrightnessContrast);},{},{}});

menuCommands_.bind("adjustmentHueSaturation",{[this]{openColorAdjustment(ColorAdjustmentKind::HueSaturation);},{},{}});

menuCommands_.bind("transform",{[this]{beginLayerTransform();},{},{}});

menuCommands_.bind("newBackgroundLayer",{[this]{showBackgroundLayer();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy();},{}});
auto backgroundTarget=[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy()&&!document.hasSelectedGroups()&&document.timelineSelection().layers.size()<=1;};
menuCommands_.bind("createLinkedLayer",{[this]{document.createLinkedLayer(document.layer().id);refresh();},[this,backgroundTarget]{return backgroundTarget()&&document.canCreateLinkedLayer(document.layer().id);},{}});
menuCommands_.bind("convertLayerToBackground",{[this]{document.setLayerBackground(document.layer().id,true);refresh();},[this,backgroundTarget]{return backgroundTarget()&&document.layer().kind.empty()&&!document.layer().background;},{}});
menuCommands_.bind("convertLayerToRaster",{[this]{document.rasterizeLayer(document.layer().id);refresh();},[this,backgroundTarget]{return backgroundTarget()&&document.canRasterizeLayer(document.layer().id);},{}});
menuCommands_.bind("newLayer",{[this]{createLayer();},{},{}});

menuCommands_.bind("mergeVisibleLayers",{[this]{try{document.mergeVisibleLayers();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},[this]{int count=0;for(const auto& l:document.timeline().state().layers)if(l.visible){if(l.locked)return false;++count;}return count>=2;},{}});

menuCommands_.bind("duplicateLayer",{[this]{document.duplicateSelectedLayers();refresh();},[this]{return document.canDuplicateSelectedLayers();},{}});

menuCommands_.bind("mergeLayerDown",{[this]{try{document.mergeLayerDown();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},{[this]{return document.canMergeLayerDown();}},{}});

menuCommands_.bind("mergeSelectedLayers",{[this]{try{document.mergeSelectedLayers();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},[this]{return document.canMergeSelectedLayers();},{}});

menuCommands_.bind("deleteLayer",{[this]{document.deleteSelectedLayers();},[this]{return document.canDeleteSelectedLayers();},{}});

menuCommands_.bind("editDelete",{[this]{deleteWorkspaceContent(false);},[this]{return canDeleteWorkspaceContent();},{}});

menuCommands_.bind("newDocument",{[this]{ask(Pending::New);},{},{}});

menuCommands_.bind("openDocument",{[this]{chooseProject();},{},{}});

menuCommands_.bind("openTimelapse",{[this]{showTimelapse();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None;},{}});
menuCommands_.bind("save",{[this]{saveProject(false);},{},{}});

menuCommands_.bind("saveAs",{[this]{saveProject(true);},{},{}});

menuCommands_.bind("undo",{[this]{document.undo();},[this]{return document.canUndo();},{}});

menuCommands_.bind("redo",{[this]{document.redo();},[this]{return document.canRedo();},{}});

// Preferences and layer properties are partial migrations: title/description in

// the destination dialog must state recovery-only and opacity-only coverage.

menuCommands_.bind("openPreferences",{[this]{showPreferences();},{},{}});

menuCommands_.bind("createLayerGroup",{[this]{document.createLayerGroup();virtualSlots_.clear();virtualAnchor_.reset();refresh();},[this]{return pending_==Pending::None;},{}});
menuCommands_.bind("ungroupLayers",{[this]{document.ungroupSelected();refresh();},[this]{return document.hasSelectedGroups();},{}});
menuCommands_.bind("mergeLayerGroup",{[this]{document.mergeSelectedGroup();refresh();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy()&&document.canMergeSelectedGroup();},{}});
menuCommands_.bind("toggleSelectedGroupCollapsed",{[this]{auto groups=document.selectedGroupIds();for(const auto& id:groups)document.toggleGroupCollapsed(id);refresh();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!document.selectedGroupIds().empty();},{}});
menuCommands_.bind("toggleClippingMask",{[this]{document.toggleClippingMask();refresh();},[this]{return document.canToggleClippingMask();},[this]{return document.activeClippingMask();}});
menuCommands_.bind("toggleLayerMask",{[this]{const auto owner=selectedMaskPropertyOwner();if(owner.empty())return;if(document.layerEffectivelyLocked(document.timeline().state().layers[document.timeline().layerIndex(owner)])){status_=U"图层已锁定，无法创建蒙版";return;}if(document.createLayerMasksForLayer(owner)){selectedMaskSlots_.clear();if(!document.activeMaskId().empty())selectedMaskSlots_.push_back({owner,document.frame().id});virtualSlots_.clear();virtualAnchor_.reset();frameSelectionExplicit_=false;}refresh();},[this]{const auto owner=selectedMaskPropertyOwner();return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!owner.empty()&&!document.findGroup(owner)&&document.canCreateLayerMasksForLayer(owner);},{}});
menuCommands_.bind("toggleGroupMask",{[this]{const auto owner=selectedMaskPropertyOwner();const auto* group=document.findGroup(owner);if(!group)return;if(timeline::isGroupEffectivelyLocked(document.timeline().state(),*group)){status_=U"图层组已锁定，无法修改蒙版";return;}const auto frame=document.frame().id;if(timeline::directMask(document.timeline().state(),owner,frame))document.deleteAttachedMask(owner,frame);else document.createAttachedMask(owner,frame,true);selectedMaskSlots_.clear();if(!document.activeMaskId().empty())selectedMaskSlots_.push_back({owner,frame});virtualSlots_.clear();virtualAnchor_.reset();frameSelectionExplicit_=false;refresh();},[this]{const auto owner=selectedMaskPropertyOwner();return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!owner.empty()&&document.findGroup(owner);},{}});
menuCommands_.bind("maskMoveBinding",{[this]{if(const auto* slot=selectedOwnerMask()){const auto* mask=timeline::resolvedMask(document.timeline().state(),slot->ownerId,slot->frameId);if(mask)document.setMaskMoveWithOwner(slot->ownerId,slot->frameId,!mask->moveWithOwner);}refresh();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&selectedOwnerMask();},{}});
menuCommands_.bind("openLayerStyles",{[this]{showColorOverlay();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!document.active()&&!document.layerStyleTargets().empty();},{}});
menuCommands_.bind("toggleLayerStyles",{[this]{auto ids=document.layerStyleTargets();if(ids.empty())return;document.setLayerStylesEnabled(ids,!timeline::styleVisible(document.layerStyle(ids.front())));refresh();},[this]{auto ids=document.layerStyleTargets();return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!document.active()&&!ids.empty()&&timeline::styleConfigured(document.layerStyle(ids.front()));},[this]{auto ids=document.layerStyleTargets();return !ids.empty()&&timeline::styleVisible(document.layerStyle(ids.front()));}});
menuCommands_.bind("copyLayerStyles",{[this]{auto ids=document.layerStyleTargets();if(!ids.empty()){copiedLayerStyle_=document.layerStyle(ids.front());layerStyleClipboard_=copiedLayerStyle_.has_value();}},[this]{auto ids=document.layerStyleTargets();return !document.active()&&!ids.empty()&&document.layerStyle(ids.front()).has_value();},{}});
menuCommands_.bind("pasteLayerStyles",{[this]{if(layerStyleClipboard_&&document.beginLayerStyle())document.commitLayerStyle(copiedLayerStyle_);refresh();},[this]{return layerStyleClipboard_&&!document.active()&&!document.layerStyleTargets().empty();},{}});
menuCommands_.bind("splitLayerStyles",{[this]{try{document.splitLayerStyles();refresh();}catch(const std::exception& e){showSaveError(e);}},[this]{return pending_==Pending::None&&document.canSplitLayerStyles();},{}});
menuCommands_.bind("clearLayerStyles",{[this]{if(document.beginLayerStyle())document.commitLayerStyle({});refresh();},[this]{auto ids=document.layerStyleTargets();return !document.active()&&!ids.empty()&&document.layerStyle(ids.front()).has_value();},{}});
menuCommands_.bind("newGradientMapLayer",{[this]{openGradientMapLayer(true);},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!document.active();},{}});
menuCommands_.bind("openLayerProperties",{[this]{openSelectedLayerProperties();},[this]{return !document.timelineSelection().layers.empty()||document.hasSelectedGroups();},{}});

menuCommands_.bind("advancedMode",{[this]{cycleAdvancedMode();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None;},[this]{return advancedActive();}});
menuCommands_.bind("resetView",{[this]{

 zoom_=16; const auto viewport=canvasViewport();

 const int width=int(std::lround(document.width()*canvasScale()));

 const int height=int(std::lround(document.height()*canvasScale()));

 canvas_=gfx::Rect(viewport.x+(viewport.w-width)/2,viewport.y+(viewport.h-height)/2,width,height);

 invalidate();

},{},{}});

menuCommands_.bind("gridAlignment",{[this]{try{auto next=runtimePreferences_;next.set("tools.gridAlignmentEnabled",next.flag("tools.gridAlignmentEnabled")?"false":"true");if(!smoke_){if(!runtimePreferencesReadable_)throw std::runtime_error("editor-preferences.txt unreadable");const auto text=next.encode();writeExportBytesAtomic(palettePreferencePath().parent_path()/"editor-preferences.txt",std::vector<std::uint8_t>(text.begin(),text.end()));}runtimePreferences_=std::move(next);refresh();}catch(const std::exception& e){status_=U"网格对齐保存失败："+unicodeText(e.what());refresh();}},[this]{return documentOpen_&&pending_==Pending::None;},[this]{return runtimePreferences_.flag("tools.gridAlignmentEnabled");}});
menuCommands_.bind("smartAlignment",{[this]{try{auto next=runtimePreferences_;next.set("tools.smartAlignmentEnabled",next.flag("tools.smartAlignmentEnabled")?"false":"true");if(!smoke_){if(!runtimePreferencesReadable_)throw std::runtime_error("editor-preferences.txt unreadable");const auto text=next.encode();writeExportBytesAtomic(palettePreferencePath().parent_path()/"editor-preferences.txt",std::vector<std::uint8_t>(text.begin(),text.end()));}runtimePreferences_=std::move(next);refresh();}catch(const std::exception& e){status_=U"智能对齐保存失败："+unicodeText(e.what());refresh();}},[this]{return documentOpen_&&pending_==Pending::None;},[this]{return runtimePreferences_.flag("tools.smartAlignmentEnabled");}});
menuCommands_.bind("alignmentGuides",{[this]{try{auto next=runtimePreferences_;next.set("tools.alignmentGuidesVisible",next.flag("tools.alignmentGuidesVisible")?"false":"true");if(!smoke_){if(!runtimePreferencesReadable_)throw std::runtime_error("editor-preferences.txt unreadable");const auto text=next.encode();writeExportBytesAtomic(palettePreferencePath().parent_path()/"editor-preferences.txt",std::vector<std::uint8_t>(text.begin(),text.end()));}runtimePreferences_=std::move(next);refresh();}catch(const std::exception& e){status_=U"对齐辅助线保存失败："+unicodeText(e.what());refresh();}},[this]{return documentOpen_&&pending_==Pending::None;},[this]{return runtimePreferences_.flag("tools.alignmentGuidesVisible");}});

menuCommands_.bind("toggleCustomGrid",{[this]{document.setCustomGrid(!document.showCustomGrid(),document.customGrid());refresh();},[this]{return documentOpen_&&pending_==Pending::None;},[this]{return document.showCustomGrid();}});

menuCommands_.bind("openGridSettings",{[this]{showCustomGridSettings();},[this]{return documentOpen_&&pending_==Pending::None;}});

menuCommands_.bind("toggleGrid",{[this]{document.setPixelGrid(!document.showPixelGrid());refresh();},[this]{return documentOpen_&&pending_==Pending::None;},[this]{return document.showPixelGrid();}});

    menuCommands_.bind("toggleColorPanel",{[this]{togglePickerColumn(1);},{},[this]{return colorPickerOpen_;}});
    const char* pickerCommands[]{"toggleMoonRingPanel","toggleHsPanel","toggleWheelPanel","toggleNormalMapPanel"};
    for(int id=4;id<8;++id)menuCommands_.bind(pickerCommands[id-4],{[this,id]{togglePickerColumn(id);},{},[this,id]{return pickerOpen_[id];}});

menuCommands_.bind("toggleLayersPanel",{[this]{layersPanelOpen_=!layersPanelOpen_;refresh();},{},[this]{return columnShown(2);}});

menuCommands_.bind("togglePalettePanel",{[this]{palettePanelOpen_=!palettePanelOpen_;if(palettePanelOpen_)docking_.select(0);refresh();saveWorkspaceSizes();},{},[this]{return palettePanelOpen_;}});

menuCommands_.bind("togglePreviewPanel",{[this]{previewPanelOpen_=!previewPanelOpen_;if(previewPanelOpen_)docking_.select(3);refresh();saveWorkspaceSizes();},{},[this]{return previewPanelOpen_;}});

menuCommands_.bind("relativeLuminance",{[this]{renderer_.setRelativeLuminance(!renderer_.relativeLuminance());document.setDeferredFloatingDisplaySupported(!renderer_.relativeLuminance());invalidateRect(canvasViewport());},{},[this]{return renderer_.relativeLuminance();}});

menuCommands_.bind("toggleSelectionOutline",{[this]{toggleSelectionOutline();refresh();},[this]{return bool(document.selection());},[this]{return !showSelectionOutline_;}});

menuCommands_.bind("flipHorizontal",{[this]{document.flipContent(true);refresh();},{},{}});

menuCommands_.bind("flipVertical",{[this]{document.flipContent(false);refresh();},{},{}});

menuCommands_.bind("rotateContentClockwise",{[this]{if(document.rotateContent(90)){selectionPivot_.reset();playing_=false;}refresh();},{},{}});

menuCommands_.bind("rotateContentCounterClockwise",{[this]{if(document.rotateContent(-90)){selectionPivot_.reset();playing_=false;}refresh();},{},{}});

menuCommands_.bind("rotateContent180",{[this]{if(document.rotateContent180()){selectionPivot_.reset();playing_=false;}refresh();},{},{}});

menuCommands_.bind("centerContentBoth",{[this]{centerContent(true,true);},{},{}});

menuCommands_.bind("centerContentHorizontal",{[this]{centerContent(true,false);},{},{}});

menuCommands_.bind("centerContentVertical",{[this]{centerContent(false,true);},{},{}});

menuCommands_.bind("copyMerged",{[this]{copyMergedPixels();},[this]{return !document.active() || document.floating();},{}});

menuCommands_.bind("fillForeground",{[this]{playing_=false;document.fillSelectionOrCanvas(document.palette().primary);refresh();},[this]{return !document.active() || document.floating();},{}});

menuCommands_.bind("freeTransform",{[this]{startFreeSelectionTransform();},[this]{return bool(document.selection());},{}});

menuCommands_.bind("createBackgroundPresetFromSelection",{[this]{createSelectionBackgroundPreset();},[this]{return bool(document.selection());},{}});

menuCommands_.bind("createBrushFromSelection",{[this]{createBrushFromSelection();},[this]{return bool(document.selection()) && !document.active();},{}});

menuCommands_.bind("selectAll",{[this]{selectAllPixels();},{}, {}});

menuCommands_.bind("deselect",{[this]{document.deselectPixels();selectionPropertiesActive_=false;selectionFreeTransform_=false;selectionPivot_.reset();selectionPivotMask_.reset();refresh();},[this]{return bool(document.selection());},{}});

menuCommands_.bind("invertSelection",{[this]{document.invertPixels();refresh();},[this]{return bool(document.selection());},{}});

menuCommands_.bind("copy",{[this]{copyEditorClipboard();},[this]{if(!paletteFocused_&&!document.selection()&&!selectedMaskSlots_.empty())return true;if(!paletteFocused_&&document.freeTileInstanceView()&&!document.selectedFreeTileInstances().empty())return true;return paletteFocused_?!document.palette().selected.empty():mixedPixelCopyContext()||!document.hasTilemapContent()||(!document.active()&&!document.selection()&&document.activeMaskId().empty());},{}});

menuCommands_.bind("cut",{[this]{copyEditorClipboard(true);},[this]{if(!paletteFocused_&&!document.selection()&&!selectedMaskSlots_.empty())return true;if(!paletteFocused_&&document.freeTileInstanceView()&&!document.selectedFreeTileInstances().empty())return true;if(mixedPixelCopyContext(true))return true;if(document.hasTilemapContent())return !paletteFocused_&&!document.selection()&&document.activeMaskId().empty()&&(!celClipboardContext()||!document.active())&&(celClipboardContext()||frameSelectionExplicit_||document.canDeleteSelectedLayers());return !paletteFocused_&&(document.selection()||celClipboardContext()||frameSelectionExplicit_||document.canDeleteSelectedLayers());},{}});

menuCommands_.bind("userGuide",{[this]{showHelp(false,helpVerify_);},[this]{return pending_==Pending::None;},{}});
menuCommands_.bind("tips",{[this]{showHelp(true,helpVerify_);},[this]{return pending_==Pending::None;},{}});
menuCommands_.bind("openProjectInfo",{[this]{showProjectInformation(projectInformationVerify_);},[this]{return pending_==Pending::None&&documentOpen_&&!homeOpen_;},{}});
menuCommands_.bind("openLatestRelease",{[this]{showLatestRelease(0,releaseNotesVerify_);},[this]{return pending_==Pending::None;},{}});
menuCommands_.bind("openAbout",{[this]{showAbout();},[this]{return pending_==Pending::None;},{}});
menuCommands_.bind("pasteAsNewDocument",{[this]{pasteAsNewDocument();},[this]{return pending_==Pending::None;},{}});
menuCommands_.bind("paste",{[this]{pasteEditorClipboard();},[this]{if(!paletteFocused_&&!document.selection()&&document.hasMaskClipboard()&&(!selectedMaskSlots_.empty()||celClipboardContext()))return true;if(mixedPixelPasteContext())return true;if(!paletteFocused_&&freeTileInstanceClipboard_&&document.freeTileInstanceView())return true;if(document.hasTilemapContent()&&!paletteFocused_)return document.activeMaskId().empty()&&(layerClipboardSnapshot_||(celClipboardContext()?!document.active()&&!document.selection()&&hasApplicationCelClipboard()&&!applicationCelSelectionOnly():frameSelectionExplicit_&&hasApplicationFrameClipboard()));return bool(layerClipboardSnapshot_)||paletteFocused_||(celClipboardContext()?hasApplicationCelClipboard()&&(applicationCelSelectionOnly()||!document.selection()):frameSelectionExplicit_?hasApplicationFrameClipboard():pixelClipboardContext());},{}});

// Existing item(...) helper owns pending/dialog checks and cancelStroke.

// Do NOT recreate skin/editor entries. Keep external theme runtime loading.

std::function<void(PixelMenu*,const std::string&)> appendChildren=[&](PixelMenu* parent,const std::string& id){

 if(id=="recent"){recentMenu_=parent;updateRecentMenu();}else if(id=="scripts"){auto empty=new PixelMenuItem(font_,skin_,U"没有可用脚本");empty->setEnabled(false);parent->addChild(empty);}

 for(const auto& e:menus::catalog())if(id==e.parent){

  if(e.separatorBefore && !parent->children().empty())parent->addChild(new PixelMenuSeparator(skin_));

  if(e.group){auto branch=new PixelMenu(skin_);

   auto trigger=new PixelMenuItem(font_,skin_,e.title);trigger->menuMarks=&toolIcons_;trigger->setSubmenu(branch);parent->addChild(trigger);appendChildren(branch,e.id);

  }else{

   const std::string command=e.id;

   item(parent,command,e.title,unicodeText(e.shortcut),[this,command]{menuCommands_.invoke(command);},[this,command]{return menuCommands_.enabled(command);},[this,command]{return menuCommands_.checked(command);});

  }

 }

};

PixelMenu* fileMenu=nullptr;

for(const auto& e:menus::catalog())if(!*e.parent){if(std::string(e.id)=="help"){auto pet=new PixelMenuItem(font_,skin_,U"宠物");pet->setEnabled(false);root->addChild(pet);}auto branch=group(e.title);if(std::string(e.id)=="file")fileMenu=branch;appendChildren(branch,e.id);}

    item(fileMenu,"recovery",U"恢复工程",U"",[this]{chooseRecovery();});

    menuItems_["new"]=menuItems_.at("newDocument");menuItems_["open"]=menuItems_.at("openDocument");

    sizeTimer_.Tick.connect([this]{flushSizeGeometry();});

    auto preview=new DialogBackground<PreviewPanel>(font_,skin_,toolIcons_,document);configureDialogBackground(preview);configureDialogBackground(preview->closeButton());previewPanel_=preview;columnClose_[3]=preview->closeButton();addChild(previewPanel_);

    initializeReferencePanel();initializeProjectRollback();
    createHistoryPanel();
    createTabletPanel();createTilesetPanel();createBrushLibraryPanel();initializeViewRotation();
    previewPanel_->configurePreviewSource([this]{const auto middle=canvasViewport().center();const auto at=canvasDocumentPoint(middle);return preview::Point{at.x,at.y};});
    previewPanel_->sampled=[this](timeline::Pixel color,bool secondary){document.setPaletteRole(color,secondary,paletteLocked_);refresh();};
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

    try {recoveryPreferences_=recovery::loadPreferences(recoveryDirectory().parent_path()/"recovery-preferences.txt");recovery_.queue.setIntervalMinutes(recoveryPreferences_.minutes);recovery_.due=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(recoveryPreferences_.minutes*60000));}catch(const std::exception&e){status_=U"恢复设置读取失败："+unicodeText(e.what());}loadRecoveries(true);createHome();applyWorkspacePreferences();refresh();

  }

}
