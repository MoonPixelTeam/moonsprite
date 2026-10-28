#include "editor_implementation.h"
#include "editor.h"
#include "free_tile_instances_panel.h"
#include "raster_geometry.h"

namespace moon::editor {

std::vector<std::string> Editor::autoLinkVisibleTargets()const{return TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).ids(true);}

std::vector<std::string> Editor::autoLinkModifierTargets()const{auto ids=document.timelineSelection().layers;ids.erase(std::remove_if(ids.begin(),ids.end(),[this](const auto& id){return std::none_of(document.timeline().state().layers.begin(),document.timeline().state().layers.end(),[&](const auto& layer){return layer.id==id;});}),ids.end());return ids.size()>1?ids:autoLinkVisibleTargets();}

bool Editor::autoLinkValue(const std::string& id)const{const auto& layers=document.timeline().state().layers;const auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& layer){return layer.id==id;});return it!=layers.end() && it->autoLinkAnimationCels;}

void Editor::finishAutoLinkGesture(){if(!autoLinkGesture_)return;autoLinkGesture_.reset();if(autoLinkGestureIdentity_==document.identity())document.commitAutoLinkGesture();if(hasCapture())releaseMouse();refresh();}

void Editor::updateAutoLinkGesture(const std::string& id){if(!autoLinkGesture_ || autoLinkGestureIdentity_!=document.identity())return;auto& gesture=*autoLinkGesture_;const auto ids=autoLinkVisibleTargets();const auto start=std::find(ids.begin(),ids.end(),gesture.start),end=std::find(ids.begin(),ids.end(),id);if(start==ids.end() || end==ids.end())return;const auto first=std::min(start,end),last=std::max(start,end);for(auto at=first;at<=last;++at)gesture.originals.emplace(*at,autoLinkValue(*at));for(const auto& [key,value]:gesture.originals){const auto at=std::find(ids.begin(),ids.end(),key);document.previewAutoLinkGesture(key,at>=first && at<=last?gesture.value:value);}refresh();}

void Editor::beginAutoLinkGesture(const std::string& id,const ui::MouseMessage& mouse){if(attachedMaskRow(id)){if(mouse.right()){showAttachedMaskMenu(attachedMaskOwner(id),document.frame().id);return;}if(mouse.left()){const auto owner=attachedMaskOwner(id);if(!maskLayerControlsAvailable(owner,document.frame().id))return;const auto* slot=timeline::resolvedMask(document.timeline().state(),owner,document.frame().id);if(slot){const auto m=*slot;document.setAttachedMaskFlags(owner,document.frame().id,m.visible,m.locked,m.moveWithOwner,!m.autoLinkAnimationCels);refresh();}}return;}

    if(!mouse.left() || pending_!=Pending::None)return;finishAutoLinkGesture();if(autoLinkGestureIdentity_!=document.identity()){autoLinkSoloTarget_.clear();autoLinkSoloOriginals_.clear();}autoLinkGestureIdentity_=document.identity();const bool value=!autoLinkValue(id);document.beginAutoLinkGesture();

    if(mouse.altPressed()){const auto ids=autoLinkModifierTargets();for(const auto& [key,original]:autoLinkSoloOriginals_)document.previewAutoLinkGesture(key,original);if(autoLinkSoloTarget_==id){autoLinkSoloTarget_.clear();autoLinkSoloOriginals_.clear();}else{autoLinkSoloOriginals_.clear();for(const auto& key:ids)autoLinkSoloOriginals_.emplace(key,autoLinkValue(key));for(const auto& key:ids)document.previewAutoLinkGesture(key,key==id);autoLinkSoloTarget_=id;}document.commitAutoLinkGesture();refresh();return;}

    if(mouse.ctrlPressed()){for(const auto& key:autoLinkModifierTargets())document.previewAutoLinkGesture(key,value);document.commitAutoLinkGesture();refresh();return;}

    autoLinkGesture_=AutoLinkGesture{id,value,{}};updateAutoLinkGesture(id);manager()->setCapture(this,true);requestFocus();

  }

bool Editor::processAutoLinkGesture(ui::Message* msg){
    if(advancedActive()&&msg->type()==ui::kMouseDownMessage)return false;if(!autoLinkGesture_)return false;if(autoLinkGestureIdentity_!=document.identity()){autoLinkGesture_.reset();if(hasCapture())releaseMouse();return false;}if(!hasCapture() || msg->type()==ui::kFocusLeaveMessage){finishAutoLinkGesture();return false;}if(msg->type()==ui::kMouseMoveMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);if(!mouse->left()){finishAutoLinkGesture();return true;}for(std::size_t n=0;n<layerAutoLinks_.size() && n+layerScroll_<TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).size();++n)if(layerAutoLinks_[n]->timelineVisible && layerAutoLinks_[n]->bounds().contains(mouse->position())){updateAutoLinkGesture(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(n)+layerScroll_)->id);break;}return true;}if(msg->type()==ui::kMouseUpMessage){finishAutoLinkGesture();return true;}return false;}

bool Editor::processTimelineSelectionKeyboard(ui::Message* msg){

    if(msg->type()==ui::kFocusLeaveMessage){timelineSpaceFocus_=nullptr;return false;}

    const auto focus=manager()->getFocus();if(timelineSpaceFocus_ && (focus!=timelineSpaceFocus_ || timelineSpaceIdentity_!=document.identity()))timelineSpaceFocus_=nullptr;

    if(msg->type()!=ui::kKeyDownMessage && msg->type()!=ui::kKeyUpMessage)return false;

    const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()!=ui::kKeyEnter && key->scancode()!=ui::kKeySpace)return false;

    if(pending_!=Pending::None || homeOpen_ || !documentOpen_ || !columnShown(2)){timelineSpaceFocus_=nullptr;return false;}

    int header=-1,slot=-1;for(std::size_t i=0;i<frameHeaders_.size();++i)if(frameHeaders_[i]==focus && frameHeaders_[i]->timelineVisible && frameHeaders_[i]->isVisible() && frameHeaders_[i]->isEnabled())header=int(i);

    for(std::size_t i=0;i<frameCells_.size();++i)if(frameCells_[i]==focus && frameCells_[i]->timelineVisible && frameCells_[i]->isVisible() && frameCells_[i]->isEnabled())slot=int(i);

    if(header<0 && slot<0){timelineSpaceFocus_=nullptr;return false;}

    bool activate=key->scancode()==ui::kKeyEnter && msg->type()==ui::kKeyDownMessage;

    if(key->scancode()==ui::kKeySpace){if(msg->type()==ui::kKeyDownMessage){if(!key->repeat()){timelineSpaceFocus_=focus;timelineSpaceIdentity_=document.identity();}}else{activate=timelineSpaceFocus_==focus && timelineSpaceIdentity_==document.identity();timelineSpaceFocus_=nullptr;}}

    if(activate){const int mode=key->shiftPressed()?2:key->ctrlPressed()?1:0;const auto& state=document.timeline().state();if(header>=0){document.selectFrameHeader(state.frames.at(frameScroll_+header).id,mode,playing_);markFrameSelection();}else{const int cols=timelineColumns(columnLayout(uiLogical(clientBounds()),2));selectTimelineSlot(layerScroll_+slot/cols,frameScroll_+slot%cols,mode);frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;playing_=false;loopPlayback_={};}refresh();focus->requestFocus();}return true;

  }

bool Editor::processAutoLinkKeyboard(ui::Message* msg){

    if(msg->type()!=ui::kKeyDownMessage && msg->type()!=ui::kKeyUpMessage)return false;

    if(pending_!=Pending::None || homeOpen_ || !documentOpen_)return false;

    const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()!=ui::kKeyEnter && key->scancode()!=ui::kKeySpace)return false;

    const auto focus=manager()->getFocus();for(auto button:layerAutoLinks_)if(button==focus && button->isVisible() && button->isEnabled()){

      if(msg->type()==ui::kKeyDownMessage){button->Click();button->requestFocus();}return true;

    }return false;

  }

std::vector<std::string> Editor::visibilityVisibleTargets()const{return TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).ids();}

std::vector<std::string> Editor::visibilityModifierTargets()const{auto ids=visibilityVisibleTargets();auto selected=document.timelineSelection().layers;selected.insert(selected.end(),document.selectedGroupIds().begin(),document.selectedGroupIds().end());if(selected.size()>1)ids.erase(std::remove_if(ids.begin(),ids.end(),[&](const auto& id){return std::find(selected.begin(),selected.end(),id)==selected.end();}),ids.end());return ids;}

bool Editor::visibilityValue(const std::string& id)const{if(attachedMaskRow(id)){const auto* m=timeline::resolvedMask(document.timeline().state(),attachedMaskOwner(id),document.frame().id);return m&&m->visible;}if(const auto* g=document.findGroup(id))return g->visible;const auto& layers=document.timeline().state().layers;const auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& layer){return layer.id==id;});return it!=layers.end() && it->visible;}

void Editor::finishVisibilityGesture(){if(!visibilityGesture_)return;visibilityGesture_.reset();if(visibilityGestureIdentity_==document.identity())document.commitVisibilityGesture();if(hasCapture())releaseMouse();refresh();}

void Editor::updateVisibilityGesture(const std::string& id){if(!visibilityGesture_ || visibilityGestureIdentity_!=document.identity())return;auto& gesture=*visibilityGesture_;const auto ids=visibilityVisibleTargets();const auto start=std::find(ids.begin(),ids.end(),gesture.start),end=std::find(ids.begin(),ids.end(),id);if(start==ids.end() || end==ids.end())return;const auto first=std::min(start,end),last=std::max(start,end);for(auto at=first;at<=last;++at)gesture.originals.emplace(*at,visibilityValue(*at));for(const auto& [key,value]:gesture.originals){const auto at=std::find(ids.begin(),ids.end(),key);document.previewVisibilityGesture(key,at>=first && at<=last?gesture.value:value);}refresh();}

void Editor::beginVisibilityGesture(const std::string& id,const ui::MouseMessage& mouse){if(attachedMaskRow(id)){if(mouse.right()){showAttachedMaskMenu(attachedMaskOwner(id),document.frame().id);return;}if(mouse.left()){const auto owner=attachedMaskOwner(id);const auto* slot=timeline::resolvedMask(document.timeline().state(),owner,document.frame().id);if(slot){const auto m=*slot;document.setAttachedMaskFlags(owner,document.frame().id,!m.visible,m.locked,m.moveWithOwner,m.autoLinkAnimationCels);refresh();}}return;}

    if(!mouse.left() || pending_!=Pending::None)return;finishAutoLinkGesture();finishVisibilityGesture();if(visibilityGestureIdentity_!=document.identity()){visibilitySoloTarget_.clear();visibilitySoloOriginals_.clear();}visibilityGestureIdentity_=document.identity();const bool value=!visibilityValue(id);document.beginVisibilityGesture();

    if(mouse.altPressed()){const auto ids=visibilityModifierTargets();for(const auto& [key,original]:visibilitySoloOriginals_)document.previewVisibilityGesture(key,original);if(visibilitySoloTarget_==id){visibilitySoloTarget_.clear();visibilitySoloOriginals_.clear();}else{visibilitySoloOriginals_.clear();for(const auto& key:ids)visibilitySoloOriginals_.emplace(key,visibilityValue(key));for(const auto& key:ids)document.previewVisibilityGesture(key,key==id);visibilitySoloTarget_=id;}document.commitVisibilityGesture();refresh();return;}

    if(mouse.ctrlPressed()){for(const auto& key:visibilityModifierTargets())document.previewVisibilityGesture(key,value);document.commitVisibilityGesture();refresh();return;}

    visibilityGesture_=VisibilityGesture{id,value,{}};updateVisibilityGesture(id);manager()->setCapture(this,true);requestFocus();

  }

bool Editor::processVisibilityGesture(ui::Message* msg){
    if(advancedActive()&&msg->type()==ui::kMouseDownMessage)return false;if(!visibilityGesture_)return false;if(visibilityGestureIdentity_!=document.identity()){visibilityGesture_.reset();if(hasCapture())releaseMouse();return false;}if(!hasCapture() || msg->type()==ui::kFocusLeaveMessage){finishVisibilityGesture();return false;}if(msg->type()==ui::kMouseMoveMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);if(!mouse->left()){finishVisibilityGesture();return true;}for(std::size_t n=0;n<layerEyes_.size() && n+layerScroll_<TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).size();++n)if(layerEyes_[n]->timelineVisible && layerEyes_[n]->bounds().contains(mouse->position())){updateVisibilityGesture(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(n)+layerScroll_)->id);break;}return true;}if(msg->type()==ui::kMouseUpMessage){finishVisibilityGesture();return true;}return false;}

std::vector<std::string> Editor::lockVisibleTargets()const{return visibilityVisibleTargets();}

std::vector<std::string> Editor::lockModifierTargets()const{return visibilityModifierTargets();}

bool Editor::lockValue(const std::string& id)const{if(attachedMaskRow(id)){const auto* m=timeline::resolvedMask(document.timeline().state(),attachedMaskOwner(id),document.frame().id);return m&&m->locked;}if(const auto* g=document.findGroup(id))return g->locked;const auto& layers=document.timeline().state().layers;const auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& layer){return layer.id==id;});return it!=layers.end() && it->locked;}

void Editor::finishLockGesture(){if(!lockGesture_)return;lockGesture_.reset();if(lockGestureIdentity_==document.identity())document.commitLockGesture();if(hasCapture())releaseMouse();refresh();}

void Editor::updateLockGesture(const std::string& id){if(!lockGesture_ || lockGestureIdentity_!=document.identity())return;auto& gesture=*lockGesture_;const auto ids=lockVisibleTargets();const auto start=std::find(ids.begin(),ids.end(),gesture.start),end=std::find(ids.begin(),ids.end(),id);if(start==ids.end() || end==ids.end())return;const auto first=std::min(start,end),last=std::max(start,end);for(auto at=first;at<=last;++at)gesture.originals.emplace(*at,lockValue(*at));for(const auto& [key,value]:gesture.originals){const auto at=std::find(ids.begin(),ids.end(),key);document.previewLockGesture(key,at>=first && at<=last?gesture.value:value);}refresh();}

void Editor::beginLockGesture(const std::string& id,const ui::MouseMessage& mouse){if(attachedMaskRow(id)){if(mouse.right()){showAttachedMaskMenu(attachedMaskOwner(id),document.frame().id);return;}if(mouse.left()){const auto owner=attachedMaskOwner(id);if(!maskLayerControlsAvailable(owner,document.frame().id))return;const auto* slot=timeline::resolvedMask(document.timeline().state(),owner,document.frame().id);if(slot){const auto m=*slot;document.setAttachedMaskFlags(owner,document.frame().id,m.visible,!m.locked,m.moveWithOwner,m.autoLinkAnimationCels,&selectedMaskSlots_);refresh();}}return;}

    if(!mouse.left() || pending_!=Pending::None)return;finishAutoLinkGesture();finishVisibilityGesture();finishLockGesture();if(lockGestureIdentity_!=document.identity()){lockSoloTarget_.clear();lockSoloOriginals_.clear();}lockGestureIdentity_=document.identity();const bool value=!lockValue(id);document.beginLockGesture();

    if(mouse.altPressed()){const auto ids=lockModifierTargets();for(const auto& [key,original]:lockSoloOriginals_)document.previewLockGesture(key,original);if(lockSoloTarget_==id){lockSoloTarget_.clear();lockSoloOriginals_.clear();}else{lockSoloOriginals_.clear();for(const auto& key:ids)lockSoloOriginals_.emplace(key,lockValue(key));for(const auto& key:ids)document.previewLockGesture(key,key==id);lockSoloTarget_=id;}document.commitLockGesture();refresh();return;}

    if(mouse.ctrlPressed()){for(const auto& key:lockModifierTargets())document.previewLockGesture(key,value);document.commitLockGesture();refresh();return;}

    lockGesture_=LockGesture{id,value,{}};updateLockGesture(id);manager()->setCapture(this,true);requestFocus();

  }

bool Editor::processLockGesture(ui::Message* msg){
    if(advancedActive()&&msg->type()==ui::kMouseDownMessage)return false;if(!lockGesture_)return false;if(lockGestureIdentity_!=document.identity()){lockGesture_.reset();if(hasCapture())releaseMouse();return false;}if(!hasCapture() || msg->type()==ui::kFocusLeaveMessage){finishLockGesture();return false;}if(msg->type()==ui::kMouseMoveMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);if(!mouse->left()){finishLockGesture();return true;}for(std::size_t n=0;n<layerLocks_.size() && n+layerScroll_<TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).size();++n)if(layerLocks_[n]->timelineVisible && layerLocks_[n]->bounds().contains(mouse->position())){updateLockGesture(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(n)+layerScroll_)->id);break;}return true;}if(msg->type()==ui::kMouseUpMessage){finishLockGesture();return true;}return false;}

int Editor::timelineLabelWidth()const{

    const auto l=columnLayout(uiLogical(clientBounds()),2);if(timelineHidden_)return std::max(1,l.workW-10);int stored=layerLabelWidth_.logical();

    const auto dock=docking_.groups[docking_.groupOf(2)].dock;

    if(docking_.custom && (dock==panels::Dock::Left || dock==panels::Dock::Right))stored=std::min(stored,std::max(40,l.workW-34));

    // Layout must not depend on child visibility: laf temporarily hides

    // widgets while painting their parent's background (Widget::paintEvent).

    constexpr int toolbarExtent=5+4*14+15+uiGap+2*14+15;

    return std::max(stored,toolbarExtent);

  }

void Editor::setLayerLabelWidth(double physical){layerLabelWidth_.set(physical);if(!smoke_ && layerLabelReadable_)try{const auto path=palettePreferencePath().parent_path()/"layer-label-width.txt";std::filesystem::create_directories(path.parent_path());const auto value=std::to_string(layerLabelWidth_.physical);writeExportBytesAtomic(path,{value.begin(),value.end()});}catch(const std::exception& e){status_=U"图层列宽保存失败："+unicodeText(e.what());}layoutLayers();invalidateTimelineGrid();}

gfx::Rect Editor::layerLabelSeparatorBounds()const{const auto l=columnLayout(uiLogical(clientBounds()),2);const auto row=timelineRowViewport();return toDisplay(gfx::Rect(l.workX+5+timelineLabelWidth()-2,l.layerTop+timelineHeaderOffset(),4,timelineHeaderHeight()+row.h/uiScale)) & toDisplay(gfx::Rect(l.workX+5,l.layerTop+timelineHeaderOffset(),std::max(0,l.workW-10),timelineHeaderHeight()+row.h/uiScale));}

bool Editor::layerLabelHit(gfx::Point at)const{return !document.freeTileInstanceView() && documentOpen_ && !homeOpen_ && pending_==Pending::None && columnShown(2) && (topFloatingColumnAt(at)<0 || topFloatingColumnAt(at)==2) && layerLabelSeparatorBounds().contains(at) && !timelineBorderHit(at);}

bool Editor::processLayerLabelResize(ui::Message* msg){
    if(advancedActive()&&msg->type()==ui::kMouseDownMessage)return false;

    if((msg->type()==ui::kFocusEnterMessage || msg->type()==ui::kFocusLeaveMessage) && layerLabelSeparator_)invalidateTimelineGrid();

    if(layerLabelWidth_.dragging){

      if(!hasCapture() || msg->type()==ui::kFocusLeaveMessage || pending_!=Pending::None){layerLabelWidth_.finish();if(hasCapture())releaseMouse();return false;}

      if(msg->type()==ui::kMouseMoveMessage){setLayerLabelWidth(layerLabelWidth_.at(static_cast<ui::MouseMessage*>(msg)->position().x));return true;}

      if(msg->type()==ui::kMouseUpMessage && static_cast<ui::MouseMessage*>(msg)->left()){layerLabelWidth_.finish();if(hasCapture())releaseMouse();return true;}

    }

    if(msg->type()==ui::kKeyDownMessage && layerLabelSeparator_ && layerLabelSeparator_->hasFocus() && pending_==Pending::None){const auto key=static_cast<ui::KeyMessage*>(msg)->scancode();if(key==ui::kKeyLeft || key==ui::kKeyRight){setLayerLabelWidth(layerLabelWidth_.physical+(key==ui::kKeyLeft?-12:12));return true;}}

    if(msg->type()!=ui::kMouseDownMessage)return false;const auto mouse=static_cast<ui::MouseMessage*>(msg);if(!mouse->left() || !layerLabelHit(mouse->position()))return false;

    layerLabelSeparator_->requestFocus();layerLabelWidth_.begin(mouse->position().x);captureMouse();return true;

  }

void Editor::showCustomGridSettings(int verify){CustomGridDialog popup(font_,skin_,toolIcons_,document.customGrid(),[this](GridSettings settings){document.setCustomGrid(document.showCustomGrid(),settings);refresh();});popup.setDisplay(display(),false);popup.setBounds({bounds().center().x-100*uiScale,bounds().center().y-73*uiScale,200*uiScale,146*uiScale});ui::Timer timer(30,&popup);if(verify){timer.Tick.connect([&]{timer.stop();popup.smoke(verify==2);});timer.start();}popup.openWindowInForeground();requestFocus();}

bool Editor::persistAnimationSettings(){if(smoke_)return true;if(!animationSettingsReadable_){status_=U"动画设置源损坏，保存已禁用";return false;}try{animationprefs::save(palettePreferencePath().parent_path()/"animation-settings.json",{onion_,skipDisabledFrames_});return true;}catch(const std::exception& e){status_=U"动画设置保存失败："+unicodeText(e.what());return false;}}

void Editor::showAnimationSettings(bool verify){animationprefs::Settings settings{onion_,skipDisabledFrames_};std::unique_ptr<AnimationSettingsDialog> popup;popup=std::make_unique<AnimationSettingsDialog>(font_,skin_,toolIcons_,assets_/"color-picker",settings,[&,this]{onion_=settings.onion;skipDisabledFrames_=settings.skipDisabledFrames;const bool saved=persistAnimationSettings();popup->setError(saved?U"":animationSettingsReadable_?U"保存失败，请重试":U"原设置损坏，保存已禁用");refresh();});popup->setDisplay(display(),false);auto r=animationSettingsGeometry_;if(r.isEmpty()){const int w=220*uiScale,h=popup->minimumDialogSize(w).h;r={bounds().center().x-w/2,bounds().center().y-h/2,w,h};}popup->setBounds(r);if(!animationSettingsReadable_)popup->setError(U"原设置损坏，保存已禁用");ui::Timer timer(50,popup.get());if(verify){timer.Tick.connect([&]{timer.stop();popup->smoke();popup->closeWindow(nullptr);});timer.start();}popup->openWindowInForeground();animationSettingsGeometry_=popup->bounds();requestFocus();}

void Editor::showLayerQuickActions(bool verify){

    animationprefs::Settings panelAnimation{onion_,skipDisabledFrames_};
    std::unique_ptr<LayerQuickActionsDialog> popup;

    popup=std::make_unique<LayerQuickActionsDialog>(font_,skin_,toolIcons_,layerQuickActions_,[this](const std::string& id){return menuCommands_.connected(id);},[&,this]{try{if(!smoke_)layerquick::save(palettePreferencePath().parent_path()/"layer-quick-actions.json",layerQuickActions_);popup->setError({});}catch(const std::exception&){popup->setError(U"保存失败，请重试");}refresh();});

    popup->setDensity(timelineDensity_,[this](int value){setTimelineDensity(value);});
    auto saveSide=[this](bool next){if(!smoke_){if(!layerSideDockReadable_)throw std::runtime_error("侧边隐藏设置源损坏，未覆盖");const std::string value=next?"true\n":"false\n";writeExportBytesAtomic(palettePreferencePath().parent_path()/"layer-side-dock-auto-hide.txt",{value.begin(),value.end()});}layerSideDockAutoHide_=next;refresh();};
    popup->setPanelSettings(toolIcons_,timelineHidden_,layerSideDockAutoHide_,[&,this](bool hidden){try{setTimelineHidden(hidden);popup->setError({});}catch(const std::exception& e){popup->setError(unicodeText(e.what()));throw;}},[&,saveSide](bool value){try{saveSide(value);popup->setError({});}catch(const std::exception& e){popup->setError(unicodeText(e.what()));throw;}},panelAnimation,assets_/"color-picker",[&,this]{onion_=panelAnimation.onion;skipDisabledFrames_=panelAnimation.skipDisabledFrames;const bool saved=persistAnimationSettings();popup->setError(saved?U"":U"动画设置保存失败，原文件未覆盖");refresh();},[&,this,saveSide]{try{saveSide(true);setTimelineHidden(false);setTimelineDensity(0);panelAnimation={};onion_={};skipDisabledFrames_=true;if(!persistAnimationSettings())throw std::runtime_error("动画设置无法保存，原文件未覆盖");popup->setError({});refresh();}catch(const std::exception& e){popup->setError(unicodeText(e.what()));throw;}});


    popup->setDisplay(display(),false);popup->setQuickGeometry(layerQuickDialogGeometry_);gfx::Rect r;try{if(!smoke_){std::ifstream in(palettePreferencePath().parent_path()/"layer-settings-layout-v16.txt");int x,y,w,h;if(in>>x>>y>>w>>h)r={x,y,std::clamp(w,280*uiScale,640*uiScale),std::clamp(h,227*uiScale,760*uiScale)};}}catch(const std::exception&){popup->setError(U"图层设置位置读取失败，使用默认位置");}const auto minimum=popup->minimumDialogSize(r.w);if(r.isEmpty())r={bounds().center().x-minimum.w/2,bounds().center().y-minimum.h/2,minimum.w,minimum.h};r.w=std::max(r.w,minimum.w);r.h=std::max(r.h,minimum.h);popup->setBounds(r);

    ui::Timer timer(50,popup.get());if(verify){timer.Tick.connect([&]{popup->smoke();timer.stop();popup->closeWindow(nullptr);});timer.start();}

    popup->openWindowInForeground();layerQuickDialogGeometry_=popup->quickGeometry();if(!smoke_)try{auto saveGeometry=[this](const char* name,gfx::Rect box){if(box.isEmpty())return;const auto text=std::to_string(box.x)+" "+std::to_string(box.y)+" "+std::to_string(box.w)+" "+std::to_string(box.h);writeExportBytesAtomic(palettePreferencePath().parent_path()/name,{text.begin(),text.end()});};saveGeometry("layer-settings-layout-v16.txt",popup->mainGeometry());saveGeometry("layer-quick-actions-layout-v1.txt",layerQuickDialogGeometry_);}catch(const std::exception&){status_=U"图层设置布局保存失败";}requestFocus();

  }

bool Editor::enabledTimelineAction(std::size_t i) const {return pending_==Pending::None && (i<=6 || (i==7 && document.timeline().state().frames.size()>1) || i==8);}

void Editor::toolbarSelectFrame(std::size_t index){document.selectFrameHeader(document.timeline().state().frames.at(index).id,0,playing_);markFrameSelection();if(playing_)retargetTagPlayback();refresh();}

void Editor::toolbarStepFrame(int direction){const auto count=document.timeline().state().frames.size();const auto at=document.activeFrameIndex();toolbarSelectFrame(direction>0?(at+1)%count:(at?at-1:0));}

namespace {
// Canonical mask focus includes empty slots, which have no active mask ID.
std::string navigationMaskOwner(const Document& document,const std::vector<Document::MaskSlotKey>& slots,const std::optional<Document::MaskSlotKey>& anchor){
 if(!slots.empty())return anchor?anchor->first:slots.back().first;
 if(!document.timelineSelection().maskRows.empty())return document.timelineSelection().maskRows.back();
 if(!document.activeMaskId().empty())for(const auto& slot:document.timeline().state().masks)if(slot.mask.id==document.activeMaskId())return slot.ownerId;
 return {};
}
}
void Editor::keyboardStepFrame(int direction){if(timelineHidden_)return;

    if(playing_){playing_=false;refresh();return;}document.commitFloatingPaste();if(document.timeline().state().frames.size()<2)return;
    const auto maskOwner=navigationMaskOwner(document,selectedMaskSlots_,maskSelectionAnchor_);
    const auto target=timeline::stepFrameId(document.timeline().state(),document.frame().id,direction,playbackTagMode_,skipDisabledFrames_);
    if(!maskOwner.empty()){
      // stepAnimationCell snapshots the row before stepAnimationFrame clears
      // explicit selection, then replaces the destination mask-cell selection.
      selectMaskSlot(maskOwner,target.empty()?document.frame().id:target);return;
    }
    if(!target.empty() && target!=document.frame().id){document.clearTimelineSelection();clearTimelineRowSelection();document.selectFrame(target);}const auto* slot=document.timeline().findCel(document.layer().id,document.frame().id);if(slot)document.selectTimelineCel(slot->id);frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;refresh();

  }

bool Editor::celNavigationKey(ui::KeyScancode key){return key==ui::kKeyLeft || key==ui::kKeyRight || key==ui::kKeyUp || key==ui::kKeyDown;}

bool Editor::celNavigationBlocked() const {

    if(!documentOpen_ || homeOpen_ || pending_!=Pending::None || document.selection() || document.active() || timelineGesture_.kind || navigation_.pan_.active || selectionDragging_ || floatingDragging_ || shapeDragging_ || gradientDragging_ || gradientPending_ || fillDragging_ || eyedropperGesture_.active())return true;

    auto manager=ui::Manager::getDefault();auto focus=manager->getFocus();

    if(dynamic_cast<ui::Entry*>(focus))return true;

    if(focus){auto ancestor=focus;while(ancestor && ancestor!=this)ancestor=ancestor->parent();if(!ancestor)return true;}

    for(auto child:menuBar_->children())if(auto item=dynamic_cast<ui::MenuItem*>(child))if(item->hasSubmenuOpened())return true;

    return manager->getForegroundWindow() && manager->getForegroundWindow()!=window();

  }

void Editor::stopCelNavigation(){heldCelNavigation_.clear();celNavigationTimer_.stop();}

void Editor::releaseCelNavigation(ui::KeyScancode key){heldCelNavigation_.erase(std::remove_if(heldCelNavigation_.begin(),heldCelNavigation_.end(),[key](const auto& held){return held.key==key;}),heldCelNavigation_.end());if(heldCelNavigation_.empty())celNavigationTimer_.stop();}

void Editor::navigateCel(ui::KeyScancode key){
 if(celNavigationBlocked())return;if(playing_){playing_=false;refresh();return;}
 if(key==ui::kKeyLeft||key==ui::kKeyRight){if(document.timeline().state().frames.size()>1)keyboardStepFrame(key==ui::kKeyLeft?-1:1);return;}
 TimelineRows owners(document.timeline(),document.collapsedGroupIds(),false),visible(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);
 std::vector<std::string> order;
 // animationLayerPanelSelectionRows puts masks before their owner; native
 // display order differs, so navigation must not use display indices directly.
 for(int r=0;r<owners.size();++r){const auto id=owners.owner(r);if(!timelineHidden_&&visible.index(TimelineRows::maskRowId(id))>=0)order.push_back(TimelineRows::maskRowId(id));order.push_back(id);}
 const auto maskOwner=navigationMaskOwner(document,selectedMaskSlots_,maskSelectionAnchor_);
 std::string focus=!maskOwner.empty()?TimelineRows::maskRowId(maskOwner):virtualAnchor_?virtualAnchor_->rowId:document.selectedGroupId()?*document.selectedGroupId():document.layer().id;
 auto at=std::find(order.begin(),order.end(),focus);if(at==order.end())at=std::find(order.begin(),order.end(),document.layer().id);
 const int direction=key==ui::kKeyUp?-1:1,current=at==order.end()?(direction>0?-1:int(order.size())):int(at-order.begin());
 for(int next=current+direction;next>=0&&next<int(order.size());next+=direction){
  const int row=visible.index(order[next]);if(visible.mask(row)){document.commitFloatingPaste();selectMaskTimelineRow(row,int(document.activeFrameIndex()));return;}
  if(document.findGroup(order[next]))continue;const auto* cel=document.timeline().findCel(order[next],document.frame().id);if(!cel)continue;
  const auto id=cel->id;document.commitFloatingPaste();selectedMaskSlots_.clear();maskSelectionAnchor_.reset();document.exitAttachedMask();document.restoreTimelineRowSelection({},{});document.selectTimelineCel(id);virtualSlots_.clear();virtualAnchor_.reset();clearTimelineRowSelection();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;refresh();return;
 }
}

void Editor::pressCelNavigation(ui::KeyScancode key,std::chrono::steady_clock::time_point now){

    if(std::any_of(heldCelNavigation_.begin(),heldCelNavigation_.end(),[key](const auto& held){return held.key==key;}))return;

    celNavigationIdentity_=document.identity();heldCelNavigation_.push_back({key,now+std::chrono::milliseconds(280)});navigateCel(key);celNavigationTimer_.start();

  }

void Editor::celNavigationTick(std::chrono::steady_clock::time_point now){

    if(celNavigationIdentity_!=document.identity() || celNavigationBlocked()){stopCelNavigation();return;}

    // Legacy Map iteration retains insertion order when several arrow keys are held.

    for(auto& held:heldCelNavigation_)if(now>=held.nextAt){navigateCel(held.key);held.nextAt=now+std::chrono::milliseconds(held.key==ui::kKeyLeft || held.key==ui::kKeyRight?50:120);}

  }

bool Editor::canDeleteWorkspaceContent() const {return document.selection().has_value() || document.floating() || !document.timelineSelection().cels.empty() || !document.selectedFrames().empty() || document.canDeleteLayers();}

void Editor::deleteWorkspaceContent(bool keyboard){

    playing_=false;cancelStroke();

    if(keyboard && paletteFocused_){document.deletePaletteColors(document.palette().selected);refresh();return;}

    // Legacy animation delete selection takes precedence over a stale canvas selection.
    if(!selectedMaskSlots_.empty()||!document.timelineSelection().maskRows.empty()){deleteTimelineItems();return;}

    if(document.selection() || document.floating()){
      const bool paintPixelBlocked=document.tilemapPaintSelectionDeleteBlocked();
      document.deleteSelectedPixels();
      if(paintPixelBlocked)status_=U"请在瓦片集中选择新增、绘制或修改模式；其他像素操作需先栅格化图层。";
    }

    else if(!selectedMaskSlots_.empty()||!document.timelineSelection().maskRows.empty()){deleteTimelineItems();return;}

    else if(!document.timelineSelection().cels.empty()){document.deleteSelectedCels();clearTimelineRowSelection();}

    else if(!document.selectedFrames().empty()){document.deleteSelectedFrames();frameSelectionExplicit_=false;clearTimelineRowSelection();}

    else if(keyboard && (!document.timelineSelection().layers.empty()||document.hasSelectedGroups()))document.deleteSelectedLayers();

    else if(keyboard){const auto* slot=document.timeline().findCel(document.layer().id,document.frame().id);if(slot){document.selectTimelineCel(slot->id);document.deleteSelectedCels();clearTimelineRowSelection();}}

    else document.deleteLayer();

    timelineSelectionIdentity_=document.identity();refresh();

  }

void Editor::seekFrame(std::size_t index) {document.clearTimelineSelection();clearTimelineRowSelection();document.clearFrameSelection();loopPlayback_={};frameSelectionExplicit_=false;playing_=false;document.selectFrame(document.timeline().state().frames.at(index).id);refresh();}

void Editor::createLayer(){playing_=false;document.addLayer();clearTimelineRowSelection();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;refresh();}

void Editor::deleteTimelineItems(){if(!selectedMaskSlots_.empty()||!document.timelineSelection().maskRows.empty()){if(document.deleteAttachedMasks(selectedMaskSlots_))selectedMaskSlots_.clear();else status_=U"未删除蒙版，请检查所属图层或图层组是否锁定";refresh();return;}playing_=false;cancelStroke();try{if(!document.timelineSelection().cels.empty())document.deleteSelectedCels(true);else{const auto count=document.timeline().state().frames.size();document.deleteSelectedFrames(true);if(document.timeline().state().frames.size()!=count){selectionPivot_.reset();selectionPivotMask_.reset();selectionFreeTransform_=false;}}clearTimelineRowSelection();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();refresh();}catch(const std::exception& e){showSaveError(e);}}

void Editor::frameAction(int kind) {playing_=false;try{if(kind==2)document.deleteSelectedFrames();else {document.addFrame(kind==1);selectionPivot_.reset();selectionPivotMask_.reset();selectionFreeTransform_=false;clearTimelineRowSelection();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();}refresh();}catch(const std::exception& e){showSaveError(e);}}

double Editor::normalizedPlaybackRate(double value){for(double rate:{.25,.5,1.,1.5,2.,3.})if(value==rate)return rate;return 1;}

std::chrono::steady_clock::duration Editor::playbackFrameDelay() const {return std::chrono::duration_cast<std::chrono::steady_clock::duration>(std::chrono::duration<double,std::milli>(document.frame().duration/playbackRate_));}

void Editor::readPlaybackPreferences(std::istream& in){double rate=1;int back=0;if(!(in>>rate>>back))throw std::runtime_error("Invalid animation playback preferences");playbackRate_=normalizedPlaybackRate(rate);playbackReturnToStart_=back==1;std::string mode; savedPlaybackMode_.reset();if(in>>mode)if(mode=="once" || mode=="all" || mode=="tag")savedPlaybackMode_=mode;playbackModeIdentity_=0;}

void Editor::writePlaybackPreferences(std::ostream& out)const{out<<playbackRate_<<' '<<playbackReturnToStart_<<' '<<savedPlaybackMode_.value_or("-");}

void Editor::savePlaybackPreferences(){if(smoke_)return;try{const auto path=palettePreferencePath().parent_path()/"animation-playback.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);writePlaybackPreferences(out);out.close();if(!out)throw std::runtime_error("Cannot save animation playback preferences");}catch(const std::exception& e){status_=U"播放偏好保存失败："+unicodeText(e.what());}}

void Editor::setPlaybackRate(double rate){playbackRate_=normalizedPlaybackRate(rate);if(playing_)playbackDue_=std::chrono::steady_clock::now()+playbackFrameDelay();savePlaybackPreferences();refresh();}

void Editor::completePlayback(bool once){playing_=false;loopPlayback_={};playbackTagCycle_.clear();if(playbackReturnToStart_&&!playbackStartFrame_.empty()){const auto& frames=document.timeline().state().frames;if(std::any_of(frames.begin(),frames.end(),[this](const auto& f){return f.id==playbackStartFrame_;}))document.selectFrame(playbackStartFrame_);}else if(once){const auto& frames=document.timeline().state().frames;const auto first=std::find_if(frames.begin(),frames.end(),[](const auto& f){return !f.disabled;});if(first!=frames.end())document.selectFrame(first->id);}playbackStartFrame_.clear();}

void Editor::setPlaybackLoopMode(bool loop){playbackSessionMode_=loop?"all":"once";savedPlaybackMode_=playbackSessionMode_;savePlaybackPreferences();playbackTagMode_=false;playbackTagCycle_.clear();loopPlayback_={};document.setAnimationLoop(loop);if(playing_){playbackIdentity_=document.identity();playbackRevision_=document.revision();}refresh();}

void Editor::playOnceMode(){setPlaybackLoopMode(false);}

void Editor::showPlaybackMenu(){PixelMenu menu(skin_);auto toggle=new PixelMenuItem(font_,skin_,playing_?U"暂停":U"播放");toggle->iconSkin=&toolIcons_;toggle->icon=playing_?"playback-pause":"playback-play";toggle->Click.connect([this]{togglePlayback();});menu.addChild(toggle);menu.addChild(new PixelMenuSeparator(skin_));const double rates[]{.25,.5,1,1.5,2,3};const char32_t* labels[]{U"0.25×",U"0.5×",U"1×",U"1.5×",U"2×",U"3×"};for(int i=0;i<6;++i){auto item=new PixelMenuItem(font_,skin_,labels[i]);item->checked=[this,rate=rates[i]]{return playbackRate_==rate;};item->Click.connect([this,rate=rates[i]]{setPlaybackRate(rate);});menu.addChild(item);}menu.addChild(new PixelMenuSeparator(skin_));{auto item=new PixelMenuItem(font_,skin_,U"播放一次");item->checked=[this]{return playbackSessionMode_=="once";};item->Click.connect([this]{playOnceMode();});menu.addChild(item);}{auto item=new PixelMenuItem(font_,skin_,U"循环全部");item->checked=[this]{return playbackSessionMode_=="all";};item->Click.connect([this]{setPlaybackLoopMode(true);});menu.addChild(item);}{auto item=new PixelMenuItem(font_,skin_,U"循环当前段");item->checked=[this]{return playbackTagMode_;};item->Click.connect([this]{setPlaybackTagMode();});menu.addChild(item);}auto back=new PixelMenuItem(font_,skin_,U"播放完成后返回起点");back->checked=[this]{return playbackReturnToStart_;};back->Click.connect([this]{playbackReturnToStart_=!playbackReturnToStart_;savePlaybackPreferences();refresh();});menu.addChild(back);const auto at=timelineInactive_[2]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}

const timeline::LoopSection* Editor::playbackSection(const std::string& id)const{for(const auto& section:document.timeline().state().loopSections)if(section.id==id)return &section;return nullptr;}

bool Editor::playbackSectionContains(const timeline::LoopSection& section,const std::string& frame)const{const auto& state=document.timeline().state();const auto range=timeline::loopRange(state,section);for(int i=range.start;i>=0 && i<=range.end;++i)if(state.frames[i].id==frame)return true;return false;}

bool Editor::installPlaybackSection(const timeline::LoopSection& section,bool seek){const auto sequence=timeline::loopPlaybackFrames(document.timeline().state(),section);if(sequence.empty())return false;loopPlayback_={{section.id,0,{}},{},!section.repeatCount};if(seek)document.selectFrame(sequence.front());playbackObservedFrame_=document.frame().id;return true;}

std::string Editor::nextTagFrame(const std::string& frame)const{const auto& frames=document.timeline().state().frames;int at=-1;for(int i=0;i<int(frames.size());++i)if(frames[i].id==frame)at=i;for(int n=1;n<=int(frames.size());++n){const auto& next=frames[(at+n)%frames.size()];if(!next.disabled)return next.id;}return {};}

void Editor::setPlaybackTagMode(){savedPlaybackMode_="tag";savePlaybackPreferences();playbackSessionMode_="tag";if(playbackTagMode_ && (!playing_ || loopPlayback_.repeatIndefinitely))return;playbackTagMode_=true;if(playing_){loopPlayback_={};playbackTagCycle_.clear();const auto* section=timeline::loopAtFrame(document.timeline().state(),document.frame().id);if(!section || !installPlaybackSection(*section,true))playing_=false;else if(section->repeatCount)playbackTagCycle_=section->id;}playbackObservedFrame_=document.frame().id;refresh();}

void Editor::retargetTagPlayback(){if(!playing_ || !playbackTagMode_)return;loopPlayback_={};playbackTagCycle_.clear();const auto* section=timeline::loopAtFrame(document.timeline().state(),document.frame().id);if(section)installPlaybackSection(*section,false);playbackObservedFrame_=document.frame().id;}

bool Editor::continueTagPlayback(const std::string& next){if(next.empty())return false;const auto* cycle=playbackSection(playbackTagCycle_);if(!playbackTagCycle_.empty() && !cycle)return false;if(cycle && playbackSectionContains(*cycle,next))return installPlaybackSection(*cycle,true);if(cycle){const auto* section=timeline::loopAtFrame(document.timeline().state(),next);if(section && section->repeatCount)return installPlaybackSection(*section,true);loopPlayback_={};}document.selectFrame(next);return true;}

void Editor::startLoopPlayback(const std::string& id){document.commitFloatingPaste();cancelStroke();playbackStartFrame_=document.frame().id;const auto& state=document.timeline().state();const auto it=std::find_if(state.loopSections.begin(),state.loopSections.end(),[&](const auto& section){return section.id==id;});if(it==state.loopSections.end())return;const auto sequence=timeline::loopPlaybackFrames(state,*it);if(sequence.empty())return;loopPlayback_={{id,0,{}},{},!it->repeatCount};playbackTagCycle_=playbackTagMode_ && it->repeatCount?id:std::string{};document.clearTimelineSelection();clearTimelineRowSelection();document.clearFrameSelection();frameSelectionExplicit_=false;document.selectFrame(sequence.front());playbackObservedFrame_=document.frame().id;playing_=true;playbackIdentity_=document.identity();playbackRevision_=document.revision();playbackDue_=std::chrono::steady_clock::now()+playbackFrameDelay();refresh();}

void Editor::updateFramesDisabled(bool disabled,bool toggle){

    if(!document.setSelectedFramesDisabled(disabled,toggle)){refresh();return;}

    if(playing_){playbackRevision_=document.revision();if(nextTagFrame(document.frame().id).empty()){playing_=false;loopPlayback_={};playbackTagCycle_.clear();}else if(document.frame().disabled){playbackDue_=std::chrono::steady_clock::now();playbackTick();}}

    refresh();

  }

void Editor::togglePlayback(){if(timelineHidden_)return;const bool next=!playing_;if(next)document.commitFloatingPaste();cancelStroke();playing_=next;if(playing_ && nextTagFrame(document.frame().id).empty()){playing_=false;loopPlayback_={};playbackTagCycle_.clear();}if(playing_){const bool paused=!loopPlayback_.current.sectionId.empty() && playbackIdentity_==document.identity() && playbackRevision_==document.revision() && playbackSection(loopPlayback_.current.sectionId) && playbackSectionContains(*playbackSection(loopPlayback_.current.sectionId),document.frame().id);if(!paused){playbackStartFrame_=document.frame().id;loopPlayback_={};playbackTagCycle_.clear();if(playbackTagMode_){const auto* section=timeline::loopAtFrame(document.timeline().state(),document.frame().id);if(section){if(!installPlaybackSection(*section,true))playing_=false;else if(section->repeatCount)playbackTagCycle_=section->id;}else if(document.frame().disabled){const auto nextFrame=nextTagFrame(document.frame().id);if(nextFrame.empty())playing_=false;else document.selectFrame(nextFrame);}}else{const auto& frames=document.timeline().state().frames;auto first=std::find_if(frames.begin(),frames.end(),[](const auto& f){return !f.disabled;});if(first==frames.end())playing_=false;else if(playbackSessionMode_=="once")document.selectFrame(first->id);else if(document.frame().disabled)document.selectFrame(nextTagFrame(document.frame().id));}}document.clearTimelineSelection();clearTimelineRowSelection();document.clearFrameSelection();frameSelectionExplicit_=false;playbackIdentity_=document.identity();playbackRevision_=document.revision();playbackDue_=std::chrono::steady_clock::now()+playbackFrameDelay();}playbackObservedFrame_=document.frame().id;refresh();}

void Editor::playbackTick(){if(!playing_)return;if(pending_!=Pending::None || document.active() || playbackIdentity_!=document.identity() || playbackRevision_!=document.revision()){playing_=false;loopPlayback_={};playbackTagCycle_.clear();refresh();return;}const auto now=std::chrono::steady_clock::now();bool moved=false;int count=0;while(now>=playbackDue_ && playing_ && ++count<=10000){if(!loopPlayback_.current.sectionId.empty()){const auto* section=playbackSection(loopPlayback_.current.sectionId);const auto end=section?section->endFrameId:std::string{};const bool finite=section && section->repeatCount && !loopPlayback_.repeatIndefinitely;const auto step=timeline::advanceLoopPlayback(document.timeline().state(),loopPlayback_,document.frame().id);if(step.completed){if(!section){playing_=false;break;}if(playbackTagMode_ && finite){if(!continueTagPlayback(nextTagFrame(end))){playing_=false;break;}}else{completePlayback(false);moved=true;break;}}else document.selectFrame(step.frameId);}else if(playbackTagMode_){if(!continueTagPlayback(nextTagFrame(document.frame().id))){playing_=false;break;}}else{const auto& frames=document.timeline().state().frames;auto index=document.activeFrameIndex()+1;while(index<frames.size() && frames[index].disabled)++index;if(index==frames.size()){if(playbackSessionMode_=="once"){completePlayback(true);moved=true;break;}index=0;while(index<frames.size() && frames[index].disabled)++index;}if(index==frames.size()){playing_=false;break;}document.selectFrame(frames[index].id);}playbackObservedFrame_=document.frame().id;playbackDue_+=playbackFrameDelay();moved=true;}if(moved)refresh(static_cast<RefreshScope>(unsigned(RefreshScope::Canvas)|unsigned(RefreshScope::Timeline)|unsigned(RefreshScope::Tools)|unsigned(RefreshScope::Commands)));}

void Editor::openLoopEditor(const std::string& id){playing_=false;cancelStroke();timeline::LoopSection draft;const auto& state=document.timeline().state();if(!id.empty()){const auto it=std::find_if(state.loopSections.begin(),state.loopSections.end(),[&](const auto& section){return section.id==id;});if(it==state.loopSections.end())return;draft=*it;}else{int n=1;for(;;++n){draft.name=U"循环节 "+unicodeText(std::to_string(n));if(std::none_of(state.loopSections.begin(),state.loopSections.end(),[&](const auto& section){return section.name==draft.name;}))break;}auto selected=document.selectedFrames();if(selected.empty())selected={document.frame().id};int left=int(state.frames.size()),right=0;for(int i=0;i<int(state.frames.size());++i)if(std::find(selected.begin(),selected.end(),state.frames[i].id)!=selected.end()){left=std::min(left,i);right=i;}draft.startFrameId=state.frames[left].id;draft.endFrameId=state.frames[right].id;}loopDraft_=draft;const auto range=timeline::loopRange(state,draft);loopInputs_[0]->setText(utf8Text(draft.name));loopInputs_[1]->setText(std::to_string(range.start+1));loopInputs_[2]->setText(std::to_string(range.end+1));loopFinite_=bool(draft.repeatCount);for(int i=1;i<4;++i){auto input=static_cast<LoopNumberEntry*>(loopInputs_[i]);input->maximum=i==3?9999:int(state.frames.size());input->setValue(i==1?range.start+1:i==2?range.end+1:draft.repeatCount.value_or(1));}updateLoopRepeat();updateLoopDirection();pending_=Pending::LoopSection;for(auto input:loopInputs_)input->setVisible(true);loopDirection_->setVisible(true);loopRepeat_->setVisible(true);menuBar_->setEnabled(false);discard_->caption=U"保存";discard_->setVisible(true);keep_->caption=U"取消";keep_->setVisible(true);dialogClose_->setVisible(true);refresh();loopInputs_[0]->requestFocus();loopInputs_[0]->selectAllText();}

void Editor::updateLoopDirection(){const char* directions[]{"forward","reverse","ping-pong","ping-pong-reverse"};for(int i=0;i<4;++i)if(loopDraft_->direction==directions[i])static_cast<PixelDropdown*>(loopDirection_)->setSelectedIndex(i);}

void Editor::updateLoopRepeat(){if(!loopRepeat_)return;loopRepeat_->active=loopFinite_;loopRepeat_->icon=loopFinite_?"checkboxChecked":"checkboxUnchecked";loopInputs_[3]->setEnabled(loopFinite_);if(!loopFinite_)loopInputs_[3]->setText("无限");invalidate();}

void Editor::toggleLoopRepeat(){loopFinite_=!loopFinite_;static_cast<LoopNumberEntry*>(loopInputs_[3])->setValue(1);updateLoopRepeat();}

std::u32string Editor::loopDisplayName()const{const auto raw=unicodeText(loopInputs_[0]->text());const auto name=javascriptTrim(raw);return name.empty()?U"循环节 1":std::u32string(name.substr(0,64));}

std::pair<int,int> Editor::loopDisplayRange()const{const int count=int(document.timeline().state().frames.size());const int a=int(std::trunc(std::clamp(static_cast<LoopNumberEntry*>(loopInputs_[1])->value,1.0,double(count)))),b=int(std::trunc(std::clamp(static_cast<LoopNumberEntry*>(loopInputs_[2])->value,1.0,double(count))));return {std::min(a,b),std::max(a,b)};}

bool Editor::commitLoopEditor(){try{for(int i=1;i<4;++i)if(i!=3 || loopFinite_)static_cast<LoopNumberEntry*>(loopInputs_[i])->commitValue();auto draft=*loopDraft_;auto integer=[&](int index,int limit){const auto text=loopInputs_[index]->text();std::size_t used=0;const double raw=std::stod(text,&used);if(used!=text.size() || !std::isfinite(raw))throw std::invalid_argument("Loop field");return int(std::trunc(std::clamp(raw,1.0,double(limit))));};const int count=int(document.timeline().state().frames.size());int start=integer(1,count)-1,end=integer(2,count)-1;if(start>end)std::swap(start,end);draft.startFrameId=document.timeline().state().frames[start].id;draft.endFrameId=document.timeline().state().frames[end].id;draft.name=loopDisplayName();draft.repeatCount=loopFinite_?std::optional<int>{integer(3,9999)}:std::optional<int>{};if(!draft.id.empty()){const auto* existing=playbackSection(draft.id);if(existing && existing->name==draft.name && existing->startFrameId==draft.startFrameId && existing->endFrameId==draft.endFrameId && existing->direction==draft.direction && existing->repeatCount==draft.repeatCount)return true;}if(draft.id.empty())document.createLoopSection(draft);else document.updateLoopSection(draft);loopPlayback_={};return true;}catch(const std::exception&){status_=U"循环节帧范围或重复次数无效";invalidate();return false;}}

void Editor::openFramePropertiesFor(std::size_t index){if(pending_!=Pending::None || index>=document.timeline().state().frames.size())return;const auto id=document.timeline().state().frames[index].id;if(timelineGesture_.kind)finishTimelineGesture();document.selectFrame(id);showFrameDuration();}

bool Editor::commitFrameDurationDraft(){

    if(pending_!=Pending::FrameDuration)return false;const auto current=document.frame().duration;const auto raw=paletteInput_->text();

    static const std::regex token(R"((\s+|[+*/()\-]|(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+\-]?[0-9]+)?))");std::size_t offset=0;std::smatch match;

    while(offset<raw.size()){const auto tail=raw.substr(offset);if(!std::regex_search(tail,match,token,std::regex_constants::match_continuous))break;offset+=match.length();}

    bool valid=!raw.empty()&&offset==raw.size();paletteInput_->numeric=true;if(valid)valid=paletteInput_->commitExpression();paletteInput_->numeric=false;

    if(valid)try{std::size_t used=0;const double value=std::stod(paletteInput_->text(),&used);if(used!=paletteInput_->text().size()||!std::isfinite(value))throw std::invalid_argument("Duration");const int duration=int(std::trunc(std::clamp(value,1.0,60000.0)));document.previewFrameDuration(duration);paletteInput_->setText(std::to_string(duration));refresh();return true;}catch(...){}

    paletteInput_->setText(std::to_string(current));invalidate();return false;

  }

void Editor::closePaletteModal(){if(pending_==Pending::FrameDuration)commitFrameDurationDraft();resolve(false);}

void Editor::showFrameDuration() {playing_=false;cancelStroke();document.beginFrameDuration();pending_=Pending::FrameDuration;static_cast<FrameDurationPaletteEntry*>(paletteInput_)->durationMode=true;paletteInput_->numeric=false;paletteInput_->setText(std::to_string(document.frame().duration));paletteInput_->suffix=U"ms";menuBar_->setEnabled(false);discard_->setVisible(false);keep_->caption=U"关闭";keep_->setVisible(true);dialogClose_->setVisible(true);paletteInput_->setVisible(true);refresh();paletteInput_->requestFocus();paletteInput_->selectAllText();}

void Editor::saveOnionSettings(){persistAnimationSettings();refresh();}

void Editor::toggleOnion(){onion_.enabled=!onion_.enabled;saveOnionSettings();refresh();}

void Editor::openOnionValue(int field){onionField_=field;pending_=Pending::OnionValue;const bool color=field>=4;double values[]{onion_.previousFrames,onion_.nextFrames,onion_.previousOpacity,onion_.nextOpacity};paletteInput_->setText(color?paletteHex(field==4?onion_.previousColor:onion_.nextColor):std::to_string(values[field]));paletteInput_->suffix=field<2?U"帧":field<4?U"%":U"";keep_->caption=U"关闭";keep_->setVisible(true);dialogClose_->setVisible(true);discard_->setVisible(false);paletteInput_->setVisible(true);menuBar_->setEnabled(false);refresh();paletteInput_->requestFocus();paletteInput_->selectAllText();}

void Editor::previewOnionValue(){try{auto value=paletteInput_->text();if(onionField_<4){std::size_t used=0;int next=std::stoi(value,&used);if(used!=value.size())return;double* target=onionField_==0?&onion_.previousFrames:onionField_==1?&onion_.nextFrames:onionField_==2?&onion_.previousOpacity:&onion_.nextOpacity;*target=std::clamp(double(next),0.,onionField_<2?8.:100.);}else{if(value.size() && value[0]=='#')value.erase(0,1);if(value.size()!=6 && value.size()!=8)return;Pixel next=0xff000000;for(std::size_t i=0;i<value.size()/2;++i){std::size_t used=0;auto byte=std::stoul(value.substr(i*2,2),&used,16);if(used!=2)return;next=(next&~(255u<<(i*8)))|Pixel(byte)<<(i*8);} (onionField_==4?onion_.previousColor:onion_.nextColor)=next;}invalidate();}catch(const std::exception&){} }

void Editor::showOnionMenu(){PixelMenu menu(skin_);auto item=[&](const char32_t* caption,std::function<void()> action,std::function<bool()> checked={}){auto b=new PixelMenuItem(font_,skin_,caption);b->Click.connect(action);b->checked=checked;menu.addChild(b);};item(U"显示洋葱皮",[this]{toggleOnion();},[this]{return onion_.enabled;});item(U"当前图层",[this]{onion_.allLayers=false;saveOnionSettings();},[this]{return !onion_.allLayers;});item(U"所有图层",[this]{onion_.allLayers=true;saveOnionSettings();},[this]{return onion_.allLayers;});item(U"播放时显示",[this]{onion_.showDuringPlayback=!onion_.showDuringPlayback;saveOnionSettings();},[this]{return onion_.showDuringPlayback;});menu.addChild(new PixelMenuSeparator(skin_));auto settings=new PixelMenuItem(font_,skin_,U"动画设置");settings->iconSkin=&toolIcons_;settings->icon="properties";settings->Click.connect([this]{showAnimationSettings();});menu.addChild(settings);const char32_t* names[]{U"前面帧数",U"后面帧数",U"前面不透明度",U"后面不透明度",U"前面颜色",U"后面颜色"};for(int i=0;i<6;++i)item(names[i],[this,i]{openOnionValue(i);});menu.showPopup(pointerMenuPosition(ui::get_mouse_position()),display());}

void Editor::buildLayerContextMenu(PixelMenu* menu,int kind) {

    auto add=[this,kind](PixelMenu* parent,const char32_t* title,const char* icon,const char32_t* shortcut,std::function<void()> action={},bool enabled=true){

      auto entry=new PixelMenuItem(font_,skin_,title,shortcut);entry->iconSkin=&toolIcons_;entry->icon=icon;entry->menuMarks=&toolIcons_;

      entry->setEnabled(pending_==Pending::None && bool(action) && enabled);

      if(action)entry->Click.connect([this,action,kind,target=contextFrameId_]{playing_=false;cancelStroke();try{if(kind==2 && !target.empty())document.selectFrame(target);action();refresh();}catch(const std::exception& e){showSaveError(e);}});

      parent->addChild(entry);

    };

    auto separator=[this](PixelMenu* parent){parent->addChild(new PixelMenuSeparator(skin_));};

    auto branch=[this](PixelMenu* parent,const char32_t* title,const char* icon){auto child=new PixelMenu(skin_);auto entry=new PixelMenuItem(font_,skin_,title);entry->iconSkin=&toolIcons_;entry->icon=icon;entry->menuMarks=&toolIcons_;entry->setSubmenu(child);parent->addChild(entry);return child;};

    auto create=[&](PixelMenu* menu){

    add(menu,U"新建图层","plus",U"Shift+N",[this]{createLayer();},true);

    add(menu,U"新建图层组","newFolder",U"Ctrl+G",[this]{document.createLayerGroup();refresh();},true);

    separator(menu);

    add(menu,U"渐变映射调整图层","gradientMap",U"",[this]{openGradientMapLayer(true);});

    add(menu,U"新建瓦片图层","tilemap",U"",[this]{showTilemapLayerDialog(false);},!document.active());

    add(menu,U"新建自由瓦片图层","freeTile",U"",[this]{menuCommands_.invoke("newFreeTileLayer");},menuCommands_.enabled("newFreeTileLayer"));

    add(menu,U"新建背景图层","image",U"",[this]{menuCommands_.invoke("newBackgroundLayer");},menuCommands_.enabled("newBackgroundLayer"));

    };

    if(kind==0){create(menu);return;}

    if(kind==1){

      create(branch(menu,U"新建","plus"));

    add(menu,U"复制所选对象","copy",U"",[this]{document.duplicateSelectedLayers();},document.canDuplicateSelectedLayers());

    const bool singleLayerContext=contextLayerIdentity_==document.identity()&&contextLayerTargets_.size()==1&&document.timeline().hasLayer(contextLayerTargets_.front());
    const auto contextLayer=singleLayerContext?contextLayerTargets_.front():std::string{};
    const auto* source=singleLayerContext?&document.timeline().state().layers[document.timeline().layerIndex(contextLayer)]:nullptr;
    const auto identity=document.identity();
    if(source&&source->kind=="free-tile")add(menu,U"打开实例图层","freeTile",U"",[this,contextLayer,identity]{if(document.identity()!=identity)return;document.selectLayer(contextLayer);document.setFreeTileInstanceView(true);refresh();},source->freeTiles&&!source->freeTiles->sources.empty()&&document.timeline().findCel(contextLayer,document.frame().id)&&document.timeline().findCel(contextLayer,document.frame().id)->freeTiles&&!document.timeline().findCel(contextLayer,document.frame().id)->freeTiles->instances.empty());
    add(menu,U"创建关联图层","linkedLayer",U"",[this,contextLayer,identity]{if(document.identity()==identity&&document.canCreateLinkedLayer(contextLayer))document.createLinkedLayer(contextLayer);},source&&document.canCreateLinkedLayer(contextLayer));

      {auto submenu=branch(menu,U"转换为","convertTo");

    add(submenu,U"转换为背景图层","image",U"",[this,contextLayer,identity]{if(document.identity()==identity&&document.timeline().hasLayer(contextLayer))document.setLayerBackground(contextLayer,true);},source&&source->kind.empty()&&!source->background);

    add(submenu,U"转换为瓦片图层","tilemap",U"",[this]{showTilemapLayerDialog(true);},document.layer().kind.empty()&&!document.layerEffectivelyLocked(document.layer())&&!document.active());

    add(submenu,U"转换为普通图层","image",U"",[this,contextLayer,identity]{if(document.identity()==identity&&document.canRasterizeLayer(contextLayer))document.rasterizeLayer(contextLayer);},source&&document.canRasterizeLayer(contextLayer));

      }

    separator(menu);

    const auto contextGroup=contextLayerIdentity_==identity&&!contextLayerTargets_.empty()&&document.findGroup(contextLayerTargets_.front())?contextLayerTargets_.front():std::string{};
    const bool singleGroupContext=!contextGroup.empty()&&contextLayerTargets_.size()==1;
    if(!contextGroup.empty()){
      add(menu,U"合并图层组","mergeDown",U"",[this,identity]{if(document.identity()==identity)menuCommands_.invoke("mergeLayerGroup");},singleGroupContext&&menuCommands_.enabled("mergeLayerGroup"));
    }else{
      add(menu,U"向下合并","mergeDown",U"",[this]{document.mergeLayerDown();},document.canMergeLayerDown());
      add(menu,U"合并所选图层","mergeDown",U"",[this]{document.mergeSelectedLayers();},document.canMergeSelectedLayers());
    }
    add(menu,U"合并可见图层","mergeVisible",U"",[this]{try{document.mergeVisibleLayers();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},true);
    if(!contextGroup.empty()){
      add(menu,U"取消图层组","ungroupFolder",U"",[this,identity]{if(document.identity()==identity)menuCommands_.invoke("ungroupLayers");},singleGroupContext);
      const auto& bindings=shortcuts::forId(shortcutBindings_,"toggleSelectedGroupCollapsed");
      const auto hint=unicodeText(bindings.empty()?"":bindings.front());
      add(menu,U"展开／折叠图层组","folderOpen",hint.c_str(),[this,contextGroup,identity]{if(document.identity()==identity){document.toggleGroupCollapsed(contextGroup);refresh();}},singleGroupContext);
    }

    separator(menu);

    add(menu,document.activeClippingMask()?U"关闭剪贴蒙版":U"开启剪贴蒙版","clippingMask",U"Ctrl+Alt+G",[this]{document.toggleClippingMask();refresh();},document.canToggleClippingMask());

    {const auto group=document.selectedGroupId();const std::string command=group?"toggleGroupMask":"toggleLayerMask";
    const bool exists=group&&timeline::directMask(document.timeline().state(),*group,document.frame().id);
    add(menu,group?(exists?U"删除图层组蒙版":U"创建图层组蒙版"):U"创建图层蒙版","layerMask",U"",[this,command]{menuCommands_.invoke(command);refresh();},menuCommands_.enabled(command));}

    separator(menu);

      {auto submenu=branch(menu,U"图层样式","layerStyle");

    const auto styleSource=contextLayerIdentity_==identity&&!contextLayerTargets_.empty()?contextLayerTargets_.front():std::string{};
    const bool styleOwner=!styleSource.empty()&&(document.findGroup(styleSource)||(document.timeline().hasLayer(styleSource)&&document.timeline().state().layers[document.timeline().layerIndex(styleSource)].kind!="adjustment"));
    const auto configured=timeline::styleConfigured;
    const auto sourceStyle=document.layerStyle(styleSource);
    const bool selectionHasStyles=std::any_of(contextLayerTargets_.begin(),contextLayerTargets_.end(),[&](const auto& id){return configured(document.layerStyle(id));});
    add(submenu,U"图层样式","layerStyle",U"",[this,styleSource,identity]{if(document.identity()==identity)showColorOverlay(false,false,false,false,false,0,styleSource);},styleOwner&&!document.active());

    if(styleOwner&&configured(sourceStyle)){
      const bool enabled=timeline::styleVisible(sourceStyle);
      const auto targets=contextLayerTargets_;
      add(submenu,enabled?U"停用图层样式":U"启用图层样式",enabled?"eyeOff":"eye",U"",[this,targets,identity,enabled]{if(document.identity()==identity)document.setLayerStylesEnabled(targets,!enabled);},!document.active());
    }

    add(submenu,U"拆分图层样式","layerStyle",U"",[this,contextLayer,identity]{if(document.identity()==identity)document.splitLayerStyles(contextLayer);},singleLayerContext&&document.canSplitLayerStyles(contextLayer));

    separator(submenu);

    add(submenu,U"复制图层样式","copy",U"",[this,styleSource,identity]{if(document.identity()!=identity)return;copiedLayerStyle_=document.layerStyle(styleSource);layerStyleClipboard_=copiedLayerStyle_.has_value();},styleOwner&&configured(sourceStyle)&&!document.active());

    add(submenu,U"粘贴图层样式","paste",U"",[this,identity]{if(document.identity()==identity)menuCommands_.invoke("pasteLayerStyles");},styleOwner&&menuCommands_.enabled("pasteLayerStyles"));

    add(submenu,U"清除图层样式","clearRecords",U"",[this,identity]{if(document.identity()==identity&&document.beginLayerStyle())document.commitLayerStyle({});},styleOwner&&selectionHasStyles&&!document.active());

      }

    separator(menu);

    add(menu,U"属性","properties",U"",[this,targets=contextLayerTargets_,identity=contextLayerIdentity_]{if(identity==document.identity() && !targets.empty())showLayerOpacity(targets);},contextLayerIdentity_==document.identity() && !contextLayerTargets_.empty());

    add(menu,U"删除","delete",U"Delete",[this]{document.deleteSelectedLayers();},document.canDeleteSelectedLayers());

      return;

    }

    if(kind==2){

    add(menu,U"创建循环节","link",U"",[this]{openLoopEditor();});

    add(menu,U"生成补间帧","plus",U"",[this]{showCrossfadeTween(document.frame().id,document.layer().id);});

    add(menu,U"帧属性","info",U"",[this]{showFrameDuration();},true);

    const bool allDisabled=document.selectedFramesDisabled();

    add(menu,allDisabled?U"启用帧":U"停用帧",allDisabled?"eye":"eyeOff",U"",[this,allDisabled]{updateFramesDisabled(!allDisabled);},true);

    separator(menu);

    add(menu,U"复制帧","copy",U"Ctrl+C",[this]{copyTimelineFrames();},true);

    add(menu,U"粘贴帧","paste",U"Ctrl+V",[this]{pasteTimelineFrames();},hasApplicationFrameClipboard());

    add(menu,U"反转帧顺序","swap",U"",[this]{document.reverseSelectedFrames();refresh();},document.canReverseSelectedFrames());

    separator(menu);

    add(menu,U"新增帧","copy",U"Alt+N",[this]{frameAction(1);},true);

    add(menu,U"新建空白帧","paste",U"Alt+B",[this]{frameAction(0);},true);

    add(menu,U"删除当前帧","delete",U"Alt+C",[this]{deleteTimelineItems();},document.timeline().state().frames.size()>1);

      return;

    }

    add(menu,U"生成补间帧","plus",U"",[this,id=contextCelId_,identity=contextCelIdentity_]{if(identity!=document.identity())return;const auto* c=document.timeline().findCelById(id);if(c)showCrossfadeTween(c->frameId,c->layerId);},contextCelIdentity_==document.identity()&&document.timeline().findCelById(contextCelId_));

    add(menu,U"新建图层蒙版","layerMask",U"",[this]{const auto group=document.selectedGroupId();document.createAttachedMask(group?*group:document.layer().id,document.frame().id,bool(group));refresh();},true);

    separator(menu);

    add(menu,U"粘贴图层蒙版单元格","paste",U"");

    separator(menu);

    add(menu,U"单元格属性","info",U"",[this,id=contextCelId_,identity=contextCelIdentity_]{if(identity==document.identity())showCelProperties(id);},contextCelIdentity_==document.identity() && document.timeline().findCelById(contextCelId_));

    separator(menu);

    add(menu,U"复制单元格","copy",U"Ctrl+C",[this]{copyTimelineCels();},!document.hasTilemapContent()||(!document.active()&&!document.selection()&&document.activeMaskId().empty()));

    add(menu,U"粘贴单元格","paste",U"Ctrl+V",[this]{pasteTimelineCels();},hasApplicationCelClipboard() && (document.hasTilemapContent()? !document.active()&&!document.selection()&&document.activeMaskId().empty()&&!applicationCelSelectionOnly():(applicationCelSelectionOnly() || !document.selection())));

    add(menu,U"反转单元格顺序","swap",U"",[this]{document.reverseSelectedCels();refresh();},document.canReverseSelectedCels());

    add(menu,U"连接单元格","link",U"",[this]{document.connectSelectedCels();refresh();},document.canConnectSelectedCels());

    add(menu,U"断开单元格连接","link",U"",[this]{document.disconnectSelectedCels();refresh();},document.canDisconnectSelectedCels());

    const auto* contextCel=contextCelIdentity_==document.identity()?document.timeline().findCelById(contextCelId_):nullptr;

    add(menu,U"删除单元格","delete",U"",[this]{deleteTimelineItems();},celHasContent(contextCel?contextCel:&document.cel()));

  }

void Editor::showCrossfadeTween(std::string start,std::string layer,int verify,std::string initialLoop){
 document.commitFloatingPaste();cancelStroke();document.cancelLayerOpacity();document.commitCelProperties();playing_=false;
 const auto identity=document.identity(),revision=document.revision(),history=document.historySize();const bool dirty=document.dirty();const auto selected=document.timelineSelection().layers;const auto duration=document.timeline().state().frames.at(document.timeline().frameIndex(start)).duration;
 const bool loopRequested=!initialLoop.empty();const auto& state=document.timeline().state();std::vector<std::pair<std::string,std::u32string>> loops;for(const auto& section:state.loopSections)loops.push_back({section.id,section.name});if(initialLoop.empty()){if(auto section=timeline::loopAtFrame(state,start))initialLoop=section->id;else if(!state.loopSections.empty())initialLoop=state.loopSections.front().id;}const bool between=!loopRequested&&document.timeline().frameIndex(start)+1<state.frames.size();
 std::optional<CrossfadeTweenSource> source;TweenLayerScope sourceScope=TweenLayerScope::All;TweenBetweenMode sourceMode=TweenBetweenMode::Morph;
 std::optional<TransformTweenSource> transformSource;std::optional<TweenRegion> transformBounds;TransformTweenOptions sourceOptions,boundsOptions;
 std::optional<TransformTweenSource> endpointSource;TransformTweenOptions endpointSourceOptions,endpointShapeOptions;std::optional<timeline::Surface> endpointShape;bool endpointShapeReady=false;
 AnimationCrossfadeDialog popup(font_,skin_,toolIcons_,duration,between,loopRequested,std::move(loops),initialLoop,[&,this](const AnimationTweenDialogOptions& options,int step)->AnimationTweenDialogPreview{
  if(document.identity()!=identity||document.revision()!=revision)throw std::runtime_error("Tween source changed; reopen the dialog");
  AnimationTweenDialogPreview result;
  if(options.between){if(!source||sourceScope!=options.layerScope||sourceMode!=options.betweenMode){source.reset();source=prepareCrossfadeTweenSource(document.timeline(),start,layer,options.layerScope,selected,options.betweenMode);sourceScope=options.layerScope;sourceMode=options.betweenMode;}const auto b=crossfadeTweenPreviewBounds(document.timeline(),*source);result={b.width,b.height,compositeCrossfadeTweenPreview(document.timeline(),document.width(),document.height(),*source,options,step,b),b.x,b.y};}
  else{if(!transformSource||sourceOptions.scope!=options.scope||sourceOptions.layerScope!=options.layerScope||sourceOptions.loopSectionId!=options.loopSectionId){transformSource=prepareTransformTweenSource(document.timeline(),start,layer,options,selected);sourceOptions=options;transformBounds.reset();}
   if(!transformBounds||boundsOptions.frameCount!=options.frameCount||boundsOptions.offsetX!=options.offsetX||boundsOptions.offsetY!=options.offsetY||boundsOptions.rotation!=options.rotation||boundsOptions.scale!=options.scale||boundsOptions.easing!=options.easing||boundsOptions.curve!=options.curve||boundsOptions.path.has_value()!=options.path.has_value()||(boundsOptions.path&&options.path&&!tweenPathEqual(*boundsOptions.path,*options.path))||boundsOptions.pathAnchor.has_value()!=options.pathAnchor.has_value()||(boundsOptions.pathAnchor&&options.pathAnchor&&(boundsOptions.pathAnchor->x!=options.pathAnchor->x||boundsOptions.pathAnchor->y!=options.pathAnchor->y))){transformBounds=transformTweenPreviewBounds(document.timeline(),*transformSource,options);boundsOptions=options;}const auto b=*transformBounds;result={b.width,b.height,compositeTransformTweenPreview(document.timeline(),*transformSource,options,step,b),b.x,b.y};result.pathAnchor=options.pathAnchor.value_or(TweenPathPoint{std::floor(transformSource->pivot.x+transformSource->pivot.width/2.),std::floor(transformSource->pivot.y+transformSource->pivot.height/2.)});
  }
  if(verify&&(document.identity()!=identity||document.revision()!=revision||document.historySize()!=history||document.dirty()!=dirty))throw std::runtime_error("Tween preview modified source");return result;
 },[&,this](const AnimationTweenDialogOptions& options){if(document.identity()!=identity||document.revision()!=revision)throw std::runtime_error("Tween source changed; reopen the dialog");const bool generated=options.between?document.generateCrossfadeTween(start,layer,options,selected,selectionPivot_):document.generateTransformTween(start,layer,options,selected,selectionPivot_);if(generated){frameSelectionExplicit_=true;timelineSelectionIdentity_=identity;timelineSelectionGuidesVisible_=true;refresh();}return generated;});


 const auto presetDirectory=verify>=13?std::filesystem::path("build/path-ui-presets-owned")/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64())):palettePreferencePath().parent_path();
 popup.setPathCallbacks(document.width(),document.height(),[&,this](const AnimationTweenDialogOptions& o){if(document.identity()!=identity||document.revision()!=revision)throw std::runtime_error("Tween source changed; reopen the dialog");TransformTweenOptions raw=o;raw.path.reset();raw.pathAnchor.reset();raw.rotation=0;raw.scale=100;raw.offsetX=raw.offsetY=0;auto source=prepareTransformTweenSource(document.timeline(),start,layer,raw,selected);auto single=source;single.frameIds={transformTweenSourceFrameId(source,raw,0)};single.layerIds={layer};raw.scope=TransformTweenScope::Frame;return std::make_pair(source.pivot,transformTweenEndpointPreview(document.timeline(),single,raw));},[presetDirectory]{return TweenPathPresetStore(presetDirectory).load();},[presetDirectory](std::u32string name,const TweenPath& path){return TweenPathPresetStore(presetDirectory).save(std::move(name),path);});
 popup.setEndpointCallbacks([&,this](const AnimationTweenDialogOptions& o,bool enabled)->std::optional<TweenRegion>{
  auto clear=[&]{tweenEndpointImage_.reset();tweenEndpointIdentity_=tweenEndpointRevision_=0;invalidateRect(canvasViewport());};
  if(!enabled){clear();endpointSource.reset();endpointShape.reset();endpointShapeReady=false;return {};}
  if(document.identity()!=identity||document.revision()!=revision){clear();throw std::runtime_error("Tween source changed; reopen the dialog");}
  if(!endpointSource||endpointSourceOptions.scope!=o.scope||endpointSourceOptions.layerScope!=o.layerScope||endpointSourceOptions.loopSectionId!=o.loopSectionId){endpointSource=prepareTransformTweenSource(document.timeline(),start,layer,o,selected);endpointSourceOptions=o;endpointShapeReady=false;}
  if(!endpointShapeReady||endpointShapeOptions.frameCount!=o.frameCount||endpointShapeOptions.rotation!=o.rotation||endpointShapeOptions.scale!=o.scale){endpointShape=transformTweenEndpointPreview(document.timeline(),*endpointSource,o);endpointShapeOptions=o;endpointShapeReady=true;tweenEndpointImage_.reset();if(endpointShape){auto image=os::instance()->makeRgbaSurface(endpointShape->width,endpointShape->height);if(!image)throw std::runtime_error("Cannot create endpoint preview");uploadRgbaRegion(*image,endpointShape->pixels.data(),endpointShape->width,endpointShape->height,endpointShape->width);tweenEndpointImage_=std::move(image);}}
  if(!endpointShape||!tweenEndpointImage_){clear();return {};}
  const auto translation=tweenTranslation(o,1);tweenEndpointX_=endpointShape->offsetX+std::floor(translation.x+.5);tweenEndpointY_=endpointShape->offsetY+std::floor(translation.y+.5);tweenEndpointIdentity_=identity;tweenEndpointRevision_=revision;invalidateRect(canvasViewport());
  if(verify&&(document.historySize()!=history||document.revision()!=revision||document.dirty()!=dirty))throw std::runtime_error("Endpoint preview modified source");return TweenRegion{int(tweenEndpointX_),int(tweenEndpointY_),tweenEndpointImage_->width(),tweenEndpointImage_->height()};
 },[this](gfx::Point p,bool beginning)->std::optional<TransformPoint>{if(beginning&&(!canvasViewport().contains(p)||topFloatingColumnAt(p)>=0||!selectionTool_||spaceHeld_||handTool_||playing_||selectionDragging_||floatingDragging_||gradientDragging_||shapeDragging_||document.active()))return {};return transformCanvasPoint(p);});
 popup.setCheckerboard(checkerboard_.light,checkerboard_.dark,checkerboard_.size);popup.setDisplay(display(),false);popup.setBounds({bounds().center().x-140*uiScale,bounds().center().y-252*uiScale,280*uiScale,504*uiScale});if(verify==7||verify==8)popup.setBounds({bounds().x+4*uiScale,bounds().y+4*uiScale,280*uiScale,504*uiScale});ui::Timer timer(50,&popup);if(verify){timer.Tick.connect([&]{timer.stop();if(verify==7||verify==8){os::Surface* cached=nullptr;const auto originalPixels=document.pixels();popup.smokeEndpoint(canvas_.origin(),canvasScale(),verify==8,[&,this](int phase){if(document.identity()!=identity||document.revision()!=revision||document.historySize()!=history||document.dirty()!=dirty||document.pixels()!=originalPixels||document.floating()||document.active()||selectionDragging_||floatingDragging_)throw std::runtime_error("Endpoint gesture touched document");if(phase==6){if(tweenEndpointImage_)throw std::runtime_error("Endpoint toggle ghost leak");return;}if(!tweenEndpointImage_)throw std::runtime_error("Endpoint ghost missing");if(phase==0)cached=tweenEndpointImage_.get();if(phase>0&&phase<6&&cached!=tweenEndpointImage_.get())throw std::runtime_error("Endpoint translation/seek rerasterized");if(phase==2){auto image=os::instance()->makeRgbaSurface(bounds().w,bounds().h);image->clear();{ui::Graphics g(image);paintCanvas(g);}const int x=int(std::floor(canvas_.x-bounds().x+(tweenEndpointX_+.5)*canvasScale()+.5)),y=int(std::floor(canvas_.y-bounds().y+(tweenEndpointY_+.5)*canvasScale()+.5));if(x<0||y<0||x>=image->width()||y>=image->height())throw std::runtime_error("Endpoint alpha fixture outside canvas");const auto visible=image->getPixel(x,y);auto saved=tweenEndpointImage_;tweenEndpointImage_.reset();auto base=os::instance()->makeRgbaSurface(bounds().w,bounds().h);base->clear();{ui::Graphics g(base);paintCanvas(g);}tweenEndpointImage_=saved;const auto under=base->getPixel(x,y),source=saved->getPixel(0,0);auto checkChannel=[&](int actual,int color,int below){if(std::abs(actual-int(std::floor(color*.4+below*.6+.5)))>2)throw std::runtime_error("Endpoint render opacity must be .4");};checkChannel(gfx::getr(visible),gfx::getr(source),gfx::getr(under));checkChannel(gfx::getg(visible),gfx::getg(source),gfx::getg(under));checkChannel(gfx::getb(visible),gfx::getb(source),gfx::getb(under));}});}else if(verify>=13)popup.smokePath(verify==14);else if(verify>=9)popup.smokeBetweenCrop(verify%2==0,verify<=10);else if(verify<=2)popup.smoke(verify==2);else popup.smokeTransform(verify==4||verify==6,verify>=5);});timer.start();}popup.openWindowInForeground();requestFocus();refresh();
}

void Editor::showCelProperties(const std::string& id,int verify){

    const auto* slot=document.timeline().findCelById(id);if(!slot)return;const auto source=document.timeline().resolveSurface(id);if(!source.source)return;const double opacity=source.source->opacity.value_or(1);const int z=source.source->zIndex;const auto identity=document.identity();auto targets=document.timelineSelection().cels;if(std::find(targets.begin(),targets.end(),id)==targets.end()){document.selectTimelineCel(id);targets={id};}if(!document.beginCelProperties(id,targets))return;

    try{CelPropertiesDialog popup(font_,skin_,toolIcons_,opacity,z,[this,identity](double opacity,int z){if(document.identity()==identity){document.previewCelProperties(opacity,z);refresh();}});popup.setDisplay(display(),false);popup.setBounds({bounds().center().x-170*uiScale/2,bounds().center().y-130*uiScale/2,170*uiScale,131*uiScale});ui::Timer timer(50,&popup);if(verify){timer.Tick.connect([&]{timer.stop();popup.smoke();ui::KeyMessage key(ui::kKeyDownMessage,verify==1?ui::kKeyEsc:ui::kKeyEnter,ui::kKeyNoneModifier,0,0);popup.onProcessMessage(&key);});timer.start();}popup.openWindowInForeground();if(document.identity()==identity)document.commitCelProperties();}catch(...){if(document.identity()==identity)document.cancelCelProperties();throw;}requestFocus();refresh();

  }

void Editor::prepareLayerContext(const std::string& id){if(attachedMaskRow(id)){maskContextOwner_=attachedMaskOwner(id);maskContextFrame_=document.frame().id;return;}maskContextOwner_.clear();TimelineRows rows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);const auto* node=rows.at(rows.index(id));if(!node)return;const auto& selected=node->kind==LayerPanelKind::Group?document.selectedGroupIds():document.timelineSelection().layers;if(std::find(selected.begin(),selected.end(),id)==selected.end())document.selectTimelineRow(*node);contextLayerTargets_=document.timelineSelection().layers;contextLayerTargets_.insert(contextLayerTargets_.end(),document.selectedGroupIds().begin(),document.selectedGroupIds().end());if(const auto source=std::find(contextLayerTargets_.begin(),contextLayerTargets_.end(),id);source!=contextLayerTargets_.end())std::rotate(contextLayerTargets_.begin(),source,source+1);contextLayerIdentity_=document.identity();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;refresh();}

void Editor::prepareCelContext(const std::string& id){

    const auto& selected=document.timelineSelection().cels;

    if(std::find(selected.begin(),selected.end(),id)==selected.end())document.selectTimelineCel(id);

    contextCelId_=id;contextCelIdentity_=document.identity();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;refresh();

  }

void Editor::showLayerContextMenu(int kind){if(!maskContextOwner_.empty()){const auto owner=maskContextOwner_,frame=maskContextFrame_;maskContextOwner_.clear();showAttachedMaskMenu(owner,frame);return;}PixelMenu menu(skin_);buildLayerContextMenu(&menu,kind);menu.showPopup(pointerMenuPosition(ui::get_mouse_position()),display());}

bool Editor::celHasContent(const timeline::Cel* cel) {

    if(!cel)return false;bool cache=true;if(document.active()){const auto active=document.timeline().resolveSurface(document.cel().id),target=document.timeline().resolveSurface(cel->id);cache=!active.source||!target.source||active.source->id!=target.source->id;}return document.timeline().hasVisiblePixels(cel->id,cache);

  }

void Editor::clearTimelineRowSelection() {

    virtualSlots_.clear();virtualAnchor_.reset();selectedTimelineLayer_.clear();selectedTimelineCelLayer_.clear();selectedTimelineCelFrame_.clear();

  }

void Editor::markFrameSelection() {

    // Legacy selectAnimationFrame promotes selected mask cells to owner rows,
    // retaining the original active mask even when the new frame has no mask.
    if(!selectedMaskSlots_.empty()){
      auto selection=document.timelineSelection();
      for(const auto& key:selectedMaskSlots_)if(std::find(selection.maskRows.begin(),selection.maskRows.end(),key.first)==selection.maskRows.end())selection.maskRows.push_back(key.first);
      document.restoreTimelineRowSelection({}, {}, {});auto restored=document.timelineSelection();restored.maskRows=std::move(selection.maskRows);document.restoreTimelineSelection(std::move(restored),document.selectedFrames());
      selectedMaskSlots_.clear();maskSelectionAnchor_.reset();
    }

    virtualSlots_.clear();virtualAnchor_.reset();selectedTimelineLayer_.clear();selectedTimelineCelLayer_.clear();selectedTimelineCelFrame_.clear();timelineSelectionGuidesVisible_=true;frameSelectionExplicit_=true;

  }

void Editor::selectTimelineLayer(std::size_t index){if(selectMaskPanelRow(int(index)))return;selectedMaskSlots_.clear();document.exitAttachedMask();TimelineRows rows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);if(const auto* n=rows.at(int(index)))document.selectTimelineRow(*n);virtualSlots_.clear();virtualAnchor_.reset();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;refresh();}

void Editor::selectTimelineCel(std::size_t row,std::size_t column){if(selectMaskTimelineRow(int(row),int(column)))return;selectedMaskSlots_.clear();document.exitAttachedMask();selectTimelineSlot(int(row),int(column));refresh();}

void Editor::hideTimelineSelectionGuides() {

    timelineSelectionGuidesVisible_=false;layoutLayers();

    const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,2);

    invalidateRect(uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop,l.workW,l.bottom-l.layerTop)));

  }

bool Editor::clearTimelineSelectionFromBlank(const ui::MouseMessage& mouse) {

    if(document.freeTileInstanceView() || pending_!=Pending::None || !columnShown(2) || !documentOpen_ || homeOpen_ || timelineGesture_.kind || (!mouse.left() && !mouse.right()))return false;

    const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,2);const auto point=mouse.position();

    if(!uiPhysical(gfx::Rect(rc.x+l.workX+2,rc.y+l.layerTop+timelineHeaderOffset(),l.workW-4,l.bottom-l.layerTop-timelineHeaderOffset()-2)).contains(point))return false;

    for(auto bar:{timelineHorizontal_,timelineVertical_})if(bar && bar->isVisible() && bar->bounds().contains(point))return false;

    // Legacy useLayerSelectionGuides: only list blank space dismisses selection;

    // row controls, frame headers and cels retain their own gesture handlers.

    for(const auto& buttons:{layerRows_,layerEyes_,layerLocks_,layerAutoLinks_,frameHeaders_,frameCells_})for(auto button:buttons)

      if(button->timelineVisible && button->bounds().contains(point) && (!button->paletteViewport || button->paletteViewport().contains(point)))return false;

    document.clearTimelineSelection();clearTimelineRowSelection();selectedMaskSlots_.clear();maskSelectionAnchor_.reset();document.exitAttachedMask();frameSelectionExplicit_=false;

    timelineSelectionGuidesVisible_=true;refresh();

    return mouse.left(); // Right click continues to the create-area menu.

  }

timeline::LoopSectionLayout Editor::loopTrackLayout() const {return timeline::layoutLoopSections(document.timeline().state(),loopTrackDrag_?std::optional<timeline::LoopSectionPreview>{{loopTrackDrag_->id,loopTrackDrag_->previewStart,loopTrackDrag_->previewEnd}}:std::nullopt);}

int Editor::loopTrackHeight() const {return timelineHidden_?0:loopTrackLayout().laneCount*20;}

int Editor::timelineHeaderOffset() const {return 37+loopTrackHeight();}

int Editor::timelineRowHeight() const {return timelineHidden_?44:std::array<int,6>{12,21,27,36,48,64}[timelineDensity_];}

int Editor::timelineFrameWidth() const {return std::array<int,6>{12,17,27,36,48,64}[timelineDensity_];}

int Editor::timelineHeaderHeight() const {return timelineHidden_?0:timelineDensity_?17:12;}

int Editor::timelineThumbnailSize() const {return std::array<int,6>{0,0,23,32,44,60}[timelineDensity_];}

void Editor::setTimelineDensity(int density){density=std::clamp(density,0,5);if(density==timelineDensity_)return;timelineDensity_=density;frameScrollRemainder_=layerScrollRemainder_=0;if(!smoke_)try{const auto path=palettePreferencePath().parent_path()/"layer-display-density.txt";std::filesystem::create_directories(path.parent_path());const std::string value=timelineDensityKeys_[density];writeExportBytesAtomic(path,{value.begin(),value.end()});}catch(const std::exception&){status_=U"图层密度保存失败";}layoutLayers();invalidateTimelineGrid();}

int Editor::timelineRowsOffset() const {return timelineHidden_?37:timelineHeaderOffset()+timelineHeaderHeight();}

gfx::Rect Editor::loopTrackViewport() const {const auto l=columnLayout(uiLogical(clientBounds()),2);return toDisplay(gfx::Rect(l.workX+5+timelineLabelWidth(),l.layerTop+37,timelineScrollMetrics(l).width/uiScale,loopTrackHeight()));}

gfx::Rect Editor::loopTrackItemBounds(const timeline::LoopSectionLayoutItem& item) const {const auto l=columnLayout(uiLogical(clientBounds()),2);return toDisplay(gfx::Rect(l.workX+5+timelineLabelWidth()+(item.startIndex-frameScroll_)*timelineFrameWidth(),l.layerTop+37+item.lane*20,item.span*timelineFrameWidth(),item.laneSpan*20)).offset(-frameScrollRemainder_,0);}

Editor::LoopTrackHit Editor::loopTrackHit(gfx::Point point) const {if(!documentOpen_ || !columnShown(2) || pending_!=Pending::None || (topFloatingColumnAt(point)>=0 && topFloatingColumnAt(point)!=2) || !loopTrackViewport().contains(point))return {};const auto layout=loopTrackLayout();for(auto it=layout.items.rbegin();it!=layout.items.rend();++it){const auto box=loopTrackItemBounds(*it);if(point.y<box.y || point.y>=box.y2()+uiScale)continue;const int top=box.y+8*uiScale;if(point.y>=top){if(gfx::Rect(box.x-3*uiScale,top,9*uiScale,box.y2()+uiScale-top).contains(point))return {it->id,1};if(gfx::Rect(box.x2()-6*uiScale,top,9*uiScale,box.y2()+uiScale-top).contains(point))return {it->id,2};}if(box.contains(point))return {it->id,0};}return {};}

void Editor::buildLoopTrackMenu(PixelMenu& menu,const std::string& id){auto add=[&](const char32_t* title,const char* icon,std::function<void()> action){auto item=new PixelMenuItem(font_,skin_,title);item->iconSkin=&toolIcons_;item->icon=icon;item->setEnabled(playbackSection(id)!=nullptr);item->Click.connect(action);menu.addChild(item);};add(U"播放循环节","right",[this,id]{startLoopPlayback(id);});add(U"循环节属性","properties",[this,id]{openLoopEditor(id);});add(U"生成补间帧","plus",[this,id]{if(const auto* section=playbackSection(id)){const auto range=timeline::loopRange(document.timeline().state(),*section);if(range.start>=0)showCrossfadeTween(document.timeline().state().frames.at(range.start).id,document.layer().id,0,id);}});menu.addChild(new PixelMenuSeparator(skin_));add(U"删除循环节","delete",[this,id]{document.deleteLoopSection(id);if(loopPlayback_.current.sectionId==id){playing_=false;loopPlayback_={};}refresh();});}

void Editor::finishLoopTrackResize(bool cancel){if(!loopTrackDrag_)return;const auto drag=*loopTrackDrag_;loopTrackDrag_.reset();loopTrackTimer_.stop();if(hasCapture())releaseMouse();if(!cancel && drag.identity==document.identity() && drag.moved){if(const auto* current=playbackSection(drag.id)){auto section=*current;if(drag.previewStart!=drag.start || drag.previewEnd!=drag.end){section.startFrameId=document.timeline().state().frames.at(drag.previewStart).id;section.endFrameId=document.timeline().state().frames.at(drag.previewEnd).id;document.updateLoopSection(section);}}}refresh();}

void Editor::updateLoopTrackResize(gfx::Point point,bool scrolling){if(!loopTrackDrag_)return;auto& drag=*loopTrackDrag_;if(drag.identity!=document.identity() || !playbackSection(drag.id)){finishLoopTrackResize(true);return;}drag.pointer=point;const auto viewport=loopTrackViewport();if(scrolling){const auto metrics=timelineScrollMetrics(columnLayout(uiLogical(clientBounds()),2));int scroll=frameScroll_*timelineFrameWidth()*uiScale+frameScrollRemainder_;if(point.x>viewport.x2()-30*uiScale)scroll+=18*uiScale;else if(point.x<viewport.x+30*uiScale)scroll-=18*uiScale;scroll=std::clamp(scroll,0,std::max(0,metrics.contentWidth-metrics.width));frameScroll_=scroll/(timelineFrameWidth()*uiScale);frameScrollRemainder_=scroll%(timelineFrameWidth()*uiScale);}

    const double first=viewport.x-frameScroll_*timelineFrameWidth()*uiScale-frameScrollRemainder_;const int index=timeline::loopResizeFrameIndex(point.x,first,timelineFrameWidth()*uiScale,int(document.timeline().state().frames.size()),drag.edge==1);const int start=drag.edge==1?std::min(index,drag.end):drag.start,end=drag.edge==2?std::max(index,drag.start):drag.end;if(start!=drag.previewStart || end!=drag.previewEnd){drag.previewStart=start;drag.previewEnd=end;drag.moved=true;}layoutLayers();invalidateTimelineGrid();}

bool Editor::processLoopTrack(ui::Message* msg){
    if(advancedActive()&&msg->type()==ui::kMouseDownMessage)return false;if(loopTrackDrag_){if(!hasCapture() || msg->type()==ui::kFocusLeaveMessage || (msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)){finishLoopTrackResize(true);return true;}if(msg->type()==ui::kMouseMoveMessage){updateLoopTrackResize(static_cast<ui::MouseMessage*>(msg)->position(),true);return true;}if(msg->type()==ui::kMouseUpMessage && static_cast<ui::MouseMessage*>(msg)->left()){updateLoopTrackResize(static_cast<ui::MouseMessage*>(msg)->position());finishLoopTrackResize();return true;}if(msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)return true;}

    if(msg->type()!=ui::kMouseDownMessage && msg->type()!=ui::kDoubleClickMessage)return false;const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto hit=loopTrackHit(mouse->position());if(hit.id.empty())return false;if(mouse->right()){if(msg->type()==ui::kDoubleClickMessage)return true;PixelMenu menu(skin_);buildLoopTrackMenu(menu,hit.id);menu.showPopup(pointerMenuPosition(mouse->position()),display());return true;}if(!mouse->left())return false;if(hit.edge && msg->type()==ui::kMouseDownMessage){const auto* section=playbackSection(hit.id);const auto range=timeline::loopRange(document.timeline().state(),*section);loopTrackDrag_=LoopTrackDrag{hit.id,hit.edge,range.start,range.end,range.start,range.end,document.identity(),false,mouse->position()};requestFocus();captureMouse();loopTrackTimer_.start();invalidateTimelineGrid();}else openLoopEditor(hit.id);return true;}

void Editor::paintLoopTrack(ui::Graphics& g){if(!loopTrackHeight())return;const auto viewport=loopTrackViewport().offset(-bounds().origin());g.saveClip();g.clipRect(viewport);UiPaintScale scale(g);const auto logical=uiLogical(viewport);skin_.draw(g,"timeline.loop.track",logical);for(const auto& item:loopTrackLayout().items){const auto box=uiLogical(loopTrackItemBounds(item).offset(-bounds().origin()));const auto* section=playbackSection(item.id);if(!section)continue;const bool playing=playing_ && loopPlayback_.current.sectionId==item.id,hover=paletteMousePosition_ && loopTrackHit(*paletteMousePosition_).id==item.id;const char* slot=playing?"timeline.loop.playing":hover?"timeline.loop.hover":"timeline.loop.normal";skin_.draw(g,slot,gfx::Rect(box.x+2,box.y+9,box.w-4,box.h-8));const auto ink=font_.inkBounds(section->name);auto label=gfx::Rect(box.x+4,box.y,std::max(0,box.w-8),12);g.saveClip();g.clipRect(label);const int width=std::min(label.w,ink.w);auto background=gfx::Rect(box.x+(box.w-width)/2-1,box.y,width+2,12);skin_.draw(g,"timeline.loop.track",background);font_.draw(g,section->name,box.x+(box.w-ink.w)/2-ink.x,box.y-ink.y,skin_[playing?"accent":hover?"text":"muted"]);g.restoreClip();}g.restoreClip();}

Editor::TimelineScrollMetrics Editor::timelineScrollMetrics(const Layout& l) const {

    TimelineScrollMetrics m;if(timelineHidden_){m.height=std::max(uiScale,(l.bottom-l.layerTop-timelineRowsOffset()-6)*uiScale);m.contentHeight=TimelineRows(document.timeline(),document.collapsedGroupIds(),false).size()*timelineRowHeight()*uiScale+timelineRowHeight()*uiScale;m.vertical=m.contentHeight>m.height;m.viewportWidth=std::max(uiScale,(l.workW-10-(m.vertical?6:0))*uiScale);m.width=0;m.contentWidth=0;return m;}const int width=std::max(uiScale,(l.workW-10)*uiScale),height=std::max(uiScale,(l.bottom-l.layerTop-timelineRowsOffset()-6)*uiScale);

    const int contentWidth=int(document.timeline().state().frames.size())*timelineFrameWidth()*uiScale,contentHeight=TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).size()*timelineRowHeight()*uiScale;

    for(int i=0;i<3;++i){m.viewportWidth=std::max(uiScale,width-(m.vertical?6*uiScale:0));m.width=std::max(0,m.viewportWidth-timelineLabelWidth()*uiScale);m.height=std::max(uiScale,height-(m.horizontal?6*uiScale:0));m.contentWidth=contentWidth+(contentWidth>m.width?m.width/2:0)+std::max(0,timelineLabelWidth()*uiScale-m.viewportWidth);m.contentHeight=contentHeight+timelineRowHeight()*uiScale;m.horizontal=m.contentWidth>m.width;m.vertical=m.contentHeight>m.height;}

    return m;

  }

int Editor::timelineColumns(const Layout& l) const {const auto m=timelineScrollMetrics(l);return std::max(1,(m.width+(m.vertical?6*uiScale:0)+frameScrollRemainder_+timelineFrameWidth()*uiScale-1)/(timelineFrameWidth()*uiScale));}

int Editor::timelineCapacity(const Layout& l) const {const auto m=timelineScrollMetrics(l);return std::max(1,(m.height+(m.horizontal?6*uiScale:0)+layerScrollRemainder_+timelineRowHeight()*uiScale-1)/(timelineRowHeight()*uiScale));}

gfx::Rect Editor::timelineRowViewport() const {const auto l=columnLayout(uiLogical(clientBounds()),2);const auto m=timelineScrollMetrics(l);return toDisplay(gfx::Rect(l.workX+5,l.layerTop+timelineRowsOffset(),m.viewportWidth/uiScale,m.height/uiScale));}

gfx::Rect Editor::timelineFrameViewport(bool header) const {auto r=timelineRowViewport();if(timelineHidden_)return gfx::Rect(r.x2(),r.y,0,header?0:r.h);r.x+=timelineLabelWidth()*uiScale;r.w=std::max(0,r.w-timelineLabelWidth()*uiScale);if(header){r.y-=timelineHeaderHeight()*uiScale;r.h=timelineHeaderHeight()*uiScale;}return r;}

gfx::Rect Editor::timelineMaterialViewport(gfx::Rect viewport,bool header) const {

    // Keep scrollbar input/range geometry, but paint actual cells below the

    // translucent sheet material instead of a reserved solid-color strip.

    const auto m=timelineScrollMetrics(columnLayout(uiLogical(clientBounds()),2));

    if(m.vertical)viewport.w+=6*uiScale;

    if(m.horizontal && !header)viewport.h+=6*uiScale;

    return viewport;

  }

void Editor::layoutTimelineScrollBars(const Layout& l) {

    if(!timelineHorizontal_)return;const auto m=timelineScrollMetrics(l);const auto row=timelineRowViewport(),frames=timelineFrameViewport();

    int vertical=std::clamp(layerScroll_*timelineRowHeight()*uiScale+layerScrollRemainder_,0,std::max(0,m.contentHeight-m.height));

    int horizontal=std::clamp(frameScroll_*timelineFrameWidth()*uiScale+frameScrollRemainder_,0,std::max(0,m.contentWidth-m.width));

    layerScroll_=vertical/(timelineRowHeight()*uiScale);layerScrollRemainder_=vertical%(timelineRowHeight()*uiScale);frameScroll_=horizontal/(timelineFrameWidth()*uiScale);frameScrollRemainder_=horizontal%(timelineFrameWidth()*uiScale);

    const auto verticalBounds=PixelScrollBar::gridBounds(row,true);if(timelineVertical_->bounds()!=verticalBounds)timelineVertical_->setDockBounds(verticalBounds);timelineVertical_->configure(m.contentHeight,m.height,vertical);

    const auto horizontalBounds=PixelScrollBar::gridBounds(row,false);if(timelineHorizontal_->bounds()!=horizontalBounds)timelineHorizontal_->setDockBounds(horizontalBounds);timelineHorizontal_->configure(m.contentWidth+std::min(timelineLabelWidth()*uiScale,m.viewportWidth),m.viewportWidth,horizontal);

    for(auto bar:{timelineHorizontal_,timelineVertical_}){bar->setEnabled(pending_==Pending::None);bar->wheelStep=(bar==timelineHorizontal_?timelineFrameWidth():timelineRowHeight())*uiScale;}

    timelineHorizontal_->setVisible(documentOpen_ && columnShown(2) && m.horizontal);timelineVertical_->setVisible(documentOpen_ && columnShown(2) && m.vertical);

  }

void Editor::bindTimelineThumbnail(std::size_t slot,const timeline::Cel* cel){

    if(thumbnailBindings_.size()<=slot)thumbnailBindings_.resize(slot+1);

    auto& binding=thumbnailBindings_[slot];

    if(!cel || !timelineThumbnailSize() || !thumbnailQueue_){if(binding.cancel)binding.cancel();binding={};return;}

    const auto stamp=document.timeline().thumbnailStorage(cel->id);const auto resolved=document.timeline().resolveSurface(cel->id);

    if(!resolved.surface || !stamp.owner){if(binding.cancel)binding.cancel();binding={};return;}

    const auto activeOwner=document.timeline().resolveSurface(document.cel().id);const bool live=document.active() && activeOwner.source && resolved.source && activeOwner.source->id==resolved.source->id;const int size=timelineThumbnailSize()*uiScale;

    std::ostringstream key;key<<document.width()<<':'<<document.height()<<':'<<size<<':'<<resolved.surface->width<<':'<<resolved.surface->height<<':'<<resolved.surface->offsetX<<':'<<resolved.surface->offsetY<<':'<<std::setprecision(17)<<cel->opacity.value_or(1)<<":checker:content:rgba";

    const auto revision=live?document.contentRevision():stamp.revision;

    if(binding.cel==cel->id && binding.key==key.str() && binding.identity==document.identity() && binding.owner==stamp.owner && binding.revision==revision && binding.live==live)return;

    if(binding.cancel)binding.cancel();const auto generation=binding.generation+1;

    binding={cel->id,key.str(),document.identity(),revision,generation,live,stamp.owner,{},{}};

    const auto identity=binding.identity;const auto id=cel->id;

    binding.cancel=thumbnailQueue_->schedule([this,slot,generation,identity,id,size]{

      if(slot>=thumbnailBindings_.size() || document.identity()!=identity)return;

      auto& current=thumbnailBindings_[slot];if(current.generation!=generation || current.cel!=id)return;

      const auto* cel=document.timeline().findCelById(id);if(!cel)return;const auto resolved=document.timeline().resolveSurface(id);if(!resolved.surface)return;

      const auto stamp=document.timeline().thumbnailStorage(id);if(stamp.owner!=current.owner)return;

      CelThumbnailOptions options;options.targetSize=size;options.opacity=cel->opacity.value_or(1);

      const auto pixels=thumbnailCache_.get(stamp.owner,current.key,0,stamp.revision,[&]{return renderCelThumbnailPixels(document.width(),document.height(),*resolved.surface,options);},current.live);

      auto image=os::instance()->makeRgbaSurface(size,size);uploadRgbaRegion(*image,pixels->data(),size,size,size);

      if(current.generation!=generation || document.identity()!=identity)return;current.image=std::move(image);invalidateTimelineGrid();

    });

  }


void Editor::bindHiddenTimelineThumbnail(TimelineButton* button,const std::string& owner,bool mask){
 const int size=30*uiScale;std::ostringstream key;key<<document.identity()<<':'<<owner<<':'<<document.frame().id<<':'<<mask<<':'<<document.contentRevision()<<':'<<document.revision()<<':'<<document.gradientRevision()<<':'<<size;if(button->timelineImageKey==key.str())return;if(button->cancelTimelineImage)button->cancelTimelineImage();button->timelineImage.reset();button->timelineImageKey=key.str();const auto expected=button->timelineImageKey;const auto identity=document.identity();
 if(!thumbnailQueue_)return;button->cancelTimelineImage=thumbnailQueue_->schedule([this,button,owner,mask,size,expected,identity]{if(document.identity()!=identity||button->timelineImageKey!=expected||!timelineHidden_)return;std::vector<timeline::Pixel> pixels;
 if(mask){const auto* source=timeline::resolvedMask(document.timeline().state(),owner,document.frame().id);if(!source)return;auto surface=&source->surface;if(document.activeMaskId()==source->id&&document.maskPreview())surface=&document.maskPreview()->surface;pixels.assign(std::size_t(size)*size,0xffffffff);const double scale=std::min(double(size)/std::max(1,document.width()),double(size)/std::max(1,document.height()));const double ox=(size-document.width()*scale)/2,oy=(size-document.height()*scale)/2;for(int y=0;y<size;++y)for(int x=0;x<size;++x){double cx=(x+.5-ox)/scale,cy=(y+.5-oy)/scale;if(cx<0||cy<0||cx>=document.width()||cy>=document.height())continue;int sx=int(std::floor(cx-surface->offsetX)),sy=int(std::floor(cy-surface->offsetY));if(sx<0||sy<0||sx>=surface->width||sy>=surface->height)continue;const auto color=raster::readLocal(*surface,sx,sy);const double alpha=double(color>>24)/255;const int gray=int(std::floor(((color&255)+((color>>8)&255)+((color>>16)&255))/3.+.5));const auto value=std::uint32_t(std::floor(gray*alpha+255*(1-alpha)+.5));pixels[std::size_t(y)*size+x]=0xff000000|value|(value<<8)|(value<<16);}}
 else {if(!document.timeline().hasLayer(owner))return;const auto& layer=document.timeline().state().layers[document.timeline().layerIndex(owner)];if(layer.kind=="adjustment"&&layer.adjustment){GradientMapSampler sampler(layer.adjustment->gradientMap);pixels.resize(std::size_t(size)*size);for(int y=0;y<size;++y)for(int x=0;x<size;++x){const auto c=std::uint32_t((x*255)/std::max(1,size-1));pixels[std::size_t(y)*size+x]=sampler(0xff000000|c|(c<<8)|(c<<16),x,y);if(!layer.adjustment->enabled)pixels[std::size_t(y)*size+x]=(pixels[std::size_t(y)*size+x]&0xffffff)|0x66000000;}}
 else {const auto* cel=document.displayTimeline().findCel(owner,document.frame().id);if(!cel)return;const auto resolved=document.displayTimeline().resolveSurface(cel->id);if(!resolved.surface)return;const auto stamp=document.timeline().thumbnailStorage(cel->id);CelThumbnailOptions options;options.targetSize=size;options.opacity=cel->opacity.value_or(1);options.framing=CelThumbnailFraming::Canvas;const auto shared=thumbnailCache_.get(stamp.owner,expected,0,stamp.revision,[&]{return renderCelThumbnailPixels(document.width(),document.height(),*resolved.surface,options);},document.active());pixels=*shared;}}
 auto image=os::instance()->makeRgbaSurface(size,size);uploadRgbaRegion(*image,pixels.data(),size,size,size);if(button->timelineImageKey!=expected)return;button->timelineImage=std::move(image);invalidateTimelineGrid();});
}

void Editor::layoutHiddenTimelineRows(){
 const TimelineRows rows(document.timeline(),document.collapsedGroupIds(),false);
 auto ensure=[&](std::vector<TimelineButton*>& pool,int kind){while(pool.size()<layerRows_.size()){const auto slot=pool.size();auto b=new TimelineButton(font_,skin_,U"",[this,slot,kind]{const TimelineRows rows(document.timeline(),document.collapsedGroupIds(),false);const auto* n=rows.at(int(slot)+layerScroll_);if(!n||!timelineHidden_)return;const auto owner=n->id,frame=document.frame().id;if(kind==0){document.exitAttachedMask();selectedMaskSlots_.clear();document.selectTimelineLayer(owner);}else if(kind==1){document.selectAttachedMask(owner,frame,false);document.clearTimelineSelection();selectedMaskSlots_.clear();virtualSlots_.clear();virtualAnchor_.reset();}else if(const auto* m=timeline::resolvedMask(document.timeline().state(),owner,frame))document.setMaskMoveWithOwner(owner,frame,!m->moveWithOwner);refresh();});if(kind==1)b->pointerPress=[this,b,slot](const ui::MouseMessage& mouse){const TimelineRows rows(document.timeline(),document.collapsedGroupIds(),false);const auto* n=rows.at(int(slot)+layerScroll_);if(!n||!timelineHidden_)return;if(mouse.right()){showAttachedMaskMenu(n->id,document.frame().id);return;}if(mouse.altPressed()){toggleMaskIsolation(n->id,document.frame().id,mouse.shiftPressed());selectedMaskSlots_.clear();maskSelectionAnchor_.reset();document.clearTimelineSelection();refresh();}else b->Click();};b->skinStyle="timeline-row";b->timelineParentPainted=true;b->iconSkin=&toolIcons_;b->hoverRepaint=[this]{invalidateTimelineGrid();};b->paletteViewport=[this]{return timelineRowViewport();};addChild(b);pool.push_back(b);}};
 ensure(hiddenCelThumbnails_,0);ensure(hiddenMaskThumbnails_,1);ensure(hiddenMaskLinks_,2);
 for(std::size_t i=0;i<layerRows_.size();++i){auto cel=hiddenCelThumbnails_[i],mask=hiddenMaskThumbnails_[i],link=hiddenMaskLinks_[i];for(auto b:{cel,mask,link}){b->timelineVisible=false;b->setVisible(false);b->setEnabled(pending_==Pending::None);if(!timelineHidden_&&b->cancelTimelineImage){b->cancelTimelineImage();b->cancelTimelineImage={};b->timelineImageKey.clear();b->timelineImage.reset();}}if(!timelineHidden_||!layerRows_[i]->timelineVisible)continue;const int index=int(i)+layerScroll_;const auto* node=rows.at(index);if(!node)continue;auto row=layerRows_[i];const auto owner=node->id;const auto frame=document.frame().id;const bool group=node->kind==LayerPanelKind::Group;const auto* attached=timeline::directMask(document.timeline().state(),owner,frame);auto rect=row->bounds();rect.x-=12*uiScale;rect.w+=12*uiScale;row->setBounds(rect);layerAutoLinks_[i]->setVisible(group);layerAutoLinks_[i]->timelineVisible=group;int left=rect.x+(2+node->depth*TimelineButton::timelineIndentWidth+(group?14:0))*uiScale;const int top=rect.y+6*uiScale;
 auto show=[&](TimelineButton* b,gfx::Rect box){b->setBounds(box);b->timelineVisible=true;b->setVisible(true);b->setTransparent(columnFloating(2)||pending_!=Pending::None);};
 if(!group){show(cel,{left,top,32*uiScale,32*uiScale});cel->active=document.activeMaskId().empty()&&document.layer().id==owner;cel->context=[this,owner]{if(const auto* c=document.timeline().findCel(owner,document.frame().id)){prepareCelContext(c->id);showLayerContextMenu(3);}};bindHiddenTimelineThumbnail(cel,owner,false);left+=34*uiScale;}
 if(attached){show(link,{left,top+8*uiScale,12*uiScale,15*uiScale});link->icon="aspectLink";link->active=timeline::resolvedMask(document.timeline().state(),owner,frame)->moveWithOwner;left+=14*uiScale;show(mask,{left,top,32*uiScale,32*uiScale});mask->active=document.activeMaskId()==timeline::resolvedMask(document.timeline().state(),owner,frame)->id;mask->context=[this,owner]{showAttachedMaskMenu(owner,document.frame().id);};bindHiddenTimelineThumbnail(mask,owner,true);left+=34*uiScale;}
 row->timelineCaptionPadding=(left-rect.x)/uiScale+2;}
}

void Editor::layoutLayers() {InteractionScope interactionScope(1,"timeline-layout");syncHistoryPanel();

    timelinePaintCacheValid_=false;

    const int priorLabelWidth=timelineLabelWidth();

    auto place=[](ui::Widget* widget,const gfx::Rect& box){if(widget->bounds()!=box)widget->setBounds(box);};

    if(timelineSelectionIdentity_!=document.identity()){clearTimelineRowSelection();virtualSlots_.clear();virtualAnchor_.reset();frameSelectionExplicit_=false;timelineSelectionGuidesVisible_=true;timelineSelectionIdentity_=document.identity();}

    frameSelectionExplicit_=!document.selectedFrames().empty();

    const auto& formal=document.timelineSelection();

    selectedTimelineLayer_=formal.layers.empty()?std::string{}:formal.layers.back();

    const auto* selectedCel=formal.cels.empty()?nullptr:document.timeline().findCelById(formal.cels.back());

    selectedTimelineCelLayer_=selectedCel?selectedCel->layerId:std::string{};selectedTimelineCelFrame_=selectedCel?selectedCel->frameId:std::string{};

    if(!layerRow_)return;const auto rc=uiLogical(clientBounds());const auto l=columnLayout(rc,2);const int x=rc.x+l.workX+5,y=rc.y+l.layerTop;

    if(freeTileInstancesPanel_){
      const bool show=documentOpen_&&!homeOpen_&&columnShown(2)&&document.freeTileInstanceView();freeTileInstancesPanel_->setVisible(show);
      if(show){
        for(const auto& controls:{layerRows_,layerEyes_,layerLocks_,layerAutoLinks_,frameHeaders_,frameCells_,hiddenCelThumbnails_,hiddenMaskThumbnails_,hiddenMaskLinks_})for(auto b:controls){b->timelineVisible=false;b->setVisible(false);}
        for(auto b:timelineInactive_)b->setVisible(false);for(auto b:layerQuickButtons_)b->setVisible(false);
        for(ui::Widget* w:{static_cast<ui::Widget*>(layerProperties_),static_cast<ui::Widget*>(layerQuickSettings_),static_cast<ui::Widget*>(layerLabelSeparator_),static_cast<ui::Widget*>(timelineHorizontal_),static_cast<ui::Widget*>(timelineVertical_)})if(w)w->setVisible(false);
        const auto chrome=columnChrome(2);freeTileInstancesPanel_->setBounds(toDisplay(chrome.actions|chrome.content));freeTileInstancesPanel_->sync();freeTileInstancesPanel_->setEnabled(pending_==Pending::None&&freeTileInstancesPanel_->isEnabled());
        return;
      }
    }

    const std::unordered_set<std::string> selectedLayers(formal.layers.begin(),formal.layers.end());

    timelineSelectedCels_.clear();timelineSelectedCels_.insert(formal.cels.begin(),formal.cels.end());

    const std::unordered_set<std::string> selectedFrames(document.selectedFrames().begin(),document.selectedFrames().end());

    const auto& layers=document.timeline().state().layers;const TimelineRows visual(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);

    layoutTimelineScrollBars(l);const int capacity=timelineCapacity(l);

    while(layerRows_.size()<std::size_t(std::min(capacity,visual.size()))) {

      const auto i=layerRows_.size();auto select=[this,i]{selectTimelineLayer(layerScroll_+i);};

      auto row=i==0?layerRow_:timelineButton(U"",select);if(i==0)row->Click.connect(select);row->skinStyle="timeline-row";row->doubleClickLeftOnly=true;row->doubleClick=[this,i]{TimelineRows rows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);if(rows.mask(layerScroll_+int(i)))showAttachedMaskMenu(rows.owner(layerScroll_+int(i)),document.frame().id);else openLayerPropertiesFor(layerScroll_+i);};row->context=[this,i]{prepareLayerContext(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(i)+layerScroll_)->id);showLayerContextMenu(1);};

      row->pointerPress=[this,i](const ui::MouseMessage& mouse){if(processGroupExpandGesture(const_cast<ui::MouseMessage*>(&mouse)))return;beginTimelineGesture(1,layerScroll_+int(i),-1,mouse);};

      auto eye=i==0?layerEye_:timelineButton(U"",[this,i]{const auto id=TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(i)+layerScroll_)->id;document.beginVisibilityGesture();document.previewVisibilityGesture(id,!visibilityValue(id));document.commitVisibilityGesture();refresh();});eye->iconSkin=&toolIcons_;eye->skinStyle="timeline-row";eye->context=[this,i]{prepareLayerContext(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(i)+layerScroll_)->id);showLayerContextMenu(1);};eye->pointerPress=[this,i](const ui::MouseMessage& mouse){if(mouse.right()){prepareLayerContext(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(i)+layerScroll_)->id);showLayerContextMenu(1);return;}beginVisibilityGesture(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(i)+layerScroll_)->id,mouse);};

      auto lock=timelineButton(U"",[this,i]{const auto id=TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(i)+layerScroll_)->id;document.beginLockGesture();document.previewLockGesture(id,!lockValue(id));document.commitLockGesture();refresh();});lock->iconSkin=&toolIcons_;lock->skinStyle="timeline-row";lock->context=[this,i]{prepareLayerContext(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(i)+layerScroll_)->id);showLayerContextMenu(1);};lock->pointerPress=[this,i](const ui::MouseMessage& mouse){if(mouse.right()){prepareLayerContext(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(i)+layerScroll_)->id);showLayerContextMenu(1);return;}beginLockGesture(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(i)+layerScroll_)->id,mouse);};

      auto autoLink=timelineButton(U"",[this,i]{const auto* layer=TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).layer(int(i)+layerScroll_);if(layer)document.setLayerAutoLinkAnimationCels(layer->id,!layer->autoLinkAnimationCels);else document.toggleGroupCollapsed(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(i)+layerScroll_)->id);refresh();});

      autoLink->skinStyle="timeline-row";autoLink->iconSkin=&toolIcons_;autoLink->pointerPress=[this,i](const ui::MouseMessage& mouse){if(processGroupExpandGesture(const_cast<ui::MouseMessage*>(&mouse)))return;beginAutoLinkGesture(TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).at(int(i)+layerScroll_)->id,mouse);};

      layerRows_.push_back(row);layerEyes_.push_back(eye);layerLocks_.push_back(lock);layerAutoLinks_.push_back(autoLink);

    }

    for(std::size_t i=0;i<layerRows_.size();++i) {

      const bool shown=columnShown(2) && int(i)<capacity && int(i)+layerScroll_<visual.size();const int rowY=y+timelineRowsOffset()+int(i)*timelineRowHeight();

      for(auto b:{layerRows_[i],layerEyes_[i],layerLocks_[i],layerAutoLinks_[i]}){b->timelineParentPainted=true;b->timelineVisible=shown;b->setTransparent(columnFloating(2) || pending_!=Pending::None);b->hoverRepaint=[this]{invalidateTimelineGrid();};b->paletteViewport=[this]{return timelineRowViewport();};b->setVisible(shown);b->setEnabled(pending_==Pending::None);}

      if(!shown)continue;const auto* node=visual.at(int(i)+layerScroll_);const auto* layer=visual.layer(int(i)+layerScroll_);const auto* group=visual.group(int(i)+layerScroll_);auto row=layerRows_[i];row->caption=visual.mask(int(i)+layerScroll_)?(group?U"图层组蒙版":U"图层蒙版"):(group?group->name:layer->name);row->icon=visual.mask(int(i)+layerScroll_)?"layerMask":"";row->timelineDisplayColor=group?group->displayColor:layer->displayColor;row->iconSkin=&toolIcons_;row->timelineAncestorColors=visual.ancestorColors(int(i)+layerScroll_);const auto* nextRow=visual.at(int(i)+layerScroll_+1);row->timelineNextRowDepth=nextRow?nextRow->depth:0;row->timelineCaptionPadding=2+int(row->timelineAncestorColors.size())*TimelineButton::timelineIndentWidth;
      if(layerTooltips_){const auto tooltip=utf8Text(trimLayerDescription(group?group->description:layer->description));if(layerTooltips_->getTooltipFor(row)!=tooltip){layerTooltips_->removeTooltipFor(row);if(!tooltip.empty())layerTooltips_->addTooltipFor(row,tooltip);}}
      row->active=group?document.selectedGroupId()==node->id:node->id==document.layer().id;row->timelineSelected=timelineSelectionGuidesVisible_&&document.selectedFrames().empty()&&formal.cels.empty()&&virtualSlots_.empty()&&(group?std::find(document.selectedGroupIds().begin(),document.selectedGroupIds().end(),node->id)!=document.selectedGroupIds().end():selectedLayers.count(node->id)!=0);
      if(visual.mask(int(i)+layerScroll_)){const auto* mask=timeline::resolvedMask(document.timeline().state(),visual.owner(int(i)+layerScroll_),document.frame().id);row->active=mask&&document.activeMaskId()==mask->id;row->timelineSelected=timelineSelectionGuidesVisible_&&std::find(formal.maskRows.begin(),formal.maskRows.end(),visual.owner(int(i)+layerScroll_))!=formal.maskRows.end();}
      for(auto button:{layerEyes_[i],layerLocks_[i],layerAutoLinks_[i]})button->active=row->active;
      layerAutoLinks_[i]->icon=layer?(layer->autoLinkAnimationCels?"animation-auto-link-on":"animation-auto-link-off"):(std::find(document.collapsedGroupIds().begin(),document.collapsedGroupIds().end(),node->id)==document.collapsedGroupIds().end()?"folderOpen":"folder");if(visual.mask(int(i)+layerScroll_)){const auto* m=timeline::resolvedMask(document.timeline().state(),visual.owner(int(i)+layerScroll_),document.frame().id);layerAutoLinks_[i]->icon=m&&m->autoLinkAnimationCels?"animation-auto-link-on":"animation-auto-link-off";}layerAutoLinks_[i]->setEnabled(pending_==Pending::None);place(layerAutoLinks_[i],toDisplay(gfx::Rect(x+24,rowY,12,timelineRowHeight())).offset(0,-layerScrollRemainder_));
      if(visual.mask(int(i)+layerScroll_)){const auto owner=visual.owner(int(i)+layerScroll_);const auto* m=timeline::resolvedMask(document.timeline().state(),owner,document.frame().id);const bool exists=pending_==Pending::None&&m;layerEyes_[i]->setEnabled(exists);layerLocks_[i]->setEnabled(exists&&maskLayerControlsAvailable(owner,document.frame().id));layerAutoLinks_[i]->setEnabled(exists&&maskLayerControlsAvailable(owner,document.frame().id));}
      place(row,toDisplay(gfx::Rect(x+36,rowY,timelineLabelWidth()-36,timelineRowHeight())).offset(0,-layerScrollRemainder_));layerEyes_[i]->icon=visibilityValue(node->id)?"eye":"eyeOff";place(layerEyes_[i],toDisplay(gfx::Rect(x,rowY,12,timelineRowHeight())).offset(0,-layerScrollRemainder_));layerLocks_[i]->icon=lockValue(node->id)?"lock":"unlock";place(layerLocks_[i],toDisplay(gfx::Rect(x+12,rowY,12,timelineRowHeight())).offset(0,-layerScrollRemainder_));

    }

    const auto& frames=document.timeline().state().frames;const int columns=timelineColumns(l);const int active=int(document.activeFrameIndex());if(!timelineGesture_.kind && !loopTrackDrag_ && !layerLabelWidth_.dragging && timelineLastActiveFrame_!=document.frame().id){if(active<frameScroll_){frameScroll_=active;frameScrollRemainder_=0;}else if(active>=frameScroll_+columns){frameScroll_=active-columns+1;frameScrollRemainder_=0;}}timelineLastActiveFrame_=document.frame().id;layoutTimelineScrollBars(l);

    while(frameHeaders_.size()<std::size_t(columns)){const auto col=frameHeaders_.size();auto b=timelineButton(U"",[this,col]{document.selectFrameHeader(document.timeline().state().frames.at(frameScroll_+col).id,0,playing_);markFrameSelection();refresh();});b->skinStyle="timeline-row";

      b->pointerPress=[this,col](const ui::MouseMessage& mouse){beginTimelineGesture(2,-1,frameScroll_+int(col),mouse);};

      b->doubleClickLeftOnly=true;b->doubleClick=[this,col]{openFramePropertiesFor(frameScroll_+col);};

      b->context=[this,col]{const auto id=document.timeline().state().frames.at(frameScroll_+col).id;if(std::find(document.selectedFrames().begin(),document.selectedFrames().end(),id)==document.selectedFrames().end())document.selectFrameHeader(id,0,playing_);markFrameSelection();contextFrameId_=id;refresh();showLayerContextMenu(2);};frameHeaders_.push_back(b);}

    for(std::size_t col=0;col<frameHeaders_.size();++col){auto b=frameHeaders_[col];const int index=frameScroll_+int(col);const bool shown=columnShown(2) && !timelineHidden_ && int(col)<columns && index<int(frames.size());b->timelineParentPainted=true;b->timelineVisible=shown;b->setTransparent(columnFloating(2) || pending_!=Pending::None);b->hoverRepaint=[this]{invalidateTimelineGrid();};b->paletteViewport=[this]{return timelineFrameViewport(true);};b->setVisible(shown);b->setEnabled(pending_==Pending::None);if(shown){const auto n=std::to_string(index+1);b->caption=std::u32string(n.begin(),n.end());b->centerCaption=true;b->active=frames[index].id==document.frame().id || selectedFrames.count(frames[index].id)!=0;b->timelineSelected=timelineSelectionGuidesVisible_ && frameSelectionExplicit_ && selectedFrames.count(frames[index].id)!=0;place(b,toDisplay(gfx::Rect(x+timelineLabelWidth()+int(col)*timelineFrameWidth(),y+timelineHeaderOffset(),timelineFrameWidth(),timelineHeaderHeight())).offset(-frameScrollRemainder_,0));}}

    while(frameCells_.size()<std::size_t(columns*capacity)){const auto slot=frameCells_.size();auto b=timelineButton(U"",[this,slot]{const auto rc=uiLogical(clientBounds());const auto l=columnLayout(rc,2);const int cols=timelineColumns(l);selectTimelineCel(layerScroll_+slot/cols,frameScroll_+slot%cols);});b->skinStyle="timeline-row";b->timelineCel=true;b->context=[this,slot]{const auto rc=uiLogical(clientBounds());const auto l=columnLayout(rc,2);const int cols=timelineColumns(l);if(const auto* cel=TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).cel(layerScroll_+slot/cols,frameScroll_+slot%cols)){prepareCelContext(cel->id);showLayerContextMenu(3);}};frameCells_.push_back(b);}

    const auto maskVisualSlots=maskTimelineVisualSlots();
    for(std::size_t slot=0;slot<frameCells_.size();++slot){auto b=frameCells_[slot];const int row=int(slot)/columns,col=int(slot)%columns,index=frameScroll_+col;const bool shown=columnShown(2) && !timelineHidden_ && row<capacity && row+layerScroll_<visual.size() && index<int(frames.size());b->timelineParentPainted=true;b->timelineVisible=shown;b->setTransparent(columnFloating(2) || pending_!=Pending::None);b->hoverRepaint=[this]{invalidateTimelineGrid();};b->paletteViewport=[this]{return timelineFrameViewport();};b->setVisible(shown);b->setEnabled(pending_==Pending::None);b->pointerPress=[this,row,col](const ui::MouseMessage& mouse){beginTimelineGesture(3,row+layerScroll_,col+frameScroll_,mouse);};if(shown){const auto* cel=visual.cel(row+layerScroll_,index);const bool maskRow=visual.mask(row+layerScroll_);const auto* mask=maskRow?timeline::resolvedMask(document.timeline().state(),visual.owner(row+layerScroll_),frames[index].id):nullptr;b->timelineCel=mask?true:celHasContent(cel);b->iconSkin=&toolIcons_;b->icon="";b->active=(visual.at(row+layerScroll_)->id==document.layer().id || document.selectedGroupId()==visual.at(row+layerScroll_)->id) || frames[index].id==document.frame().id;b->timelineSelected=selectedMaskSlots_.empty() && timelineSelectionGuidesVisible_ && (cel?timelineSelectedCels_.count(cel->id)!=0:std::find(virtualSlots_.begin(),virtualSlots_.end(),*visual.slot(row+layerScroll_,index))!=virtualSlots_.end());if(maskRow){b->icon=mask&&!mask->linkedMaskId.empty()?"animation-auto-link-on":"";b->timelineSelected=std::find(maskVisualSlots.begin(),maskVisualSlots.end(),std::make_pair(visual.owner(row+layerScroll_),frames[index].id))!=maskVisualSlots.end();b->active=mask&&document.activeMaskId()==mask->id;}place(b,toDisplay(gfx::Rect(x+timelineLabelWidth()+col*timelineFrameWidth(),y+timelineRowsOffset()+row*timelineRowHeight(),timelineFrameWidth(),timelineRowHeight())).offset(-frameScrollRemainder_,-layerScrollRemainder_));}}

    for(std::size_t slot=0;slot<frameCells_.size();++slot){const auto b=frameCells_[slot];const int row=int(slot)/columns,col=int(slot)%columns;const timeline::Cel* cel=b->timelineVisible?visual.cel(row+layerScroll_,frameScroll_+col):nullptr;bindTimelineThumbnail(slot,cel);if(b->timelineVisible&&visual.mask(row+layerScroll_)){const auto* m=timeline::resolvedMask(document.timeline().state(),visual.owner(row+layerScroll_),document.timeline().state().frames[frameScroll_+col].id);b->icon=m?"layerMask":"";b->timelineCel=bool(m);}else if(timelineThumbnailSize())b->timelineCel=false;}

    thumbnailCache_.prune();

    const auto propertiesBounds=toDisplay(gfx::Rect(rc.x+l.workX+l.workW-20,y+19,15,16));if(layerProperties_->bounds()!=propertiesBounds)layerProperties_->setBounds(propertiesBounds);

    layerLabelSeparator_->setBounds(layerLabelSeparatorBounds());layerLabelSeparator_->setVisible(columnShown(2)&&!timelineHidden_);layerLabelSeparator_->setEnabled(pending_==Pending::None);

    layerHeaderOpacity_->setVisible(false);

    const auto layerDock=docking_.groups[docking_.groupOf(2)].dock;
    const bool hideSideActions=layerSideDockAutoHide_&&!timelineHidden_&&(layerDock==panels::Dock::Left||layerDock==panels::Dock::Right);
    for(std::size_t i=0;i<timelineInactive_.size();++i){auto b=timelineInactive_[i];gfx::Rect at;

      if(i<5)at={x+int(i)*14,y+19,15,16};

      else if(i<8)at={x+4*14+15+uiGap+int(i-5)*14,y+19,15,16};

      else if(i<10)at={rc.x+l.workX+l.workW-48+int(i-8)*14,y+19,15,16};

      else at={x+12+int(i-10)*12,y+timelineRowsOffset(),12,12};

      b->setBounds(toDisplay(at));b->setVisible(columnShown(2) && !timelineHidden_ && i<8 && !(hideSideActions&&i>=6));b->setEnabled(enabledTimelineAction(i));if(i==5)b->active=onion_.enabled;if(i==2){b->active=playing_;b->icon=playing_?"playback-pause":"playback-play";}

    }

    const auto quick=layerquick::visible(layerQuickActions_,[this](const std::string& id){return menuCommands_.connected(id);});

    const int quickRight=rc.x+l.workX+l.workW-20-uiGap-15;

    for(std::size_t i=0;i<layerQuickButtons_.size();++i){auto b=layerQuickButtons_[i];const int buttonX=quickRight-int(quick.size()-i)*(15+uiGap);const bool shown=columnShown(2)&&!hideSideActions&&i<quick.size() && toDisplay(gfx::Rect(buttonX,y+19,15,16)).x>=(timelineHidden_?toDisplay(gfx::Rect(x,y,1,1)).x:timelineInactive_[7]->bounds().x2()+uiGap*uiScale);b->setVisible(shown);if(shown){const auto id=quick[i].id;b->icon=layerquick::find(id)->icon;place(b,toDisplay(gfx::Rect(buttonX,y+19,15,16)));b->setEnabled(pending_==Pending::None && menuCommands_.enabled(id));}}

    layerQuickSettings_->setBounds(toDisplay(gfx::Rect(quickRight,y+19,15,16)));layerQuickSettings_->setVisible(columnShown(2));layerQuickSettings_->setEnabled(pending_==Pending::None);

    layoutHiddenTimelineRows();
    if(priorLabelWidth!=timelineLabelWidth()){layoutLayers();return;}

    const bool enabled=pending_==Pending::None;

    for(auto b:{layerProperties_}){b->setEnabled(enabled && (!formal.layers.empty()||document.hasSelectedGroups()));b->setVisible(columnShown(2));}



  }

double Editor::canvasScale() const {return zoom_*uiScale;}

bool Editor::modalControl(ui::Widget* w) const {

    if(storedPaletteModalControl(w))return true;

    if(w==gmTrack_||w==gmPicker_||w==gmPreset_||w==gmDither_||w==gmPosition_||w==gmColor_||w==gmName_||w==gmMode_||w==gmReverse_||w==gmPalette_||w==gmSave_||w==gmDelete_||w==gmAdd_||w==gmRemove_||w==gmRestore_||w==gmFlipStops_)return true;

    if(w==aaAutoButton_ || w==aaInterior_ || w==aaLiveButton_ || w==aaSource_ || w==aaOpacity_ || w==aaOpacitySlider_ || w==aaColorEntry_ || w==aaPicker_)return true;

    if(w==convolutionScroll_ || w==convolutionTiled_ || w==convolutionLive_ || w==convolutionApply_ || std::find(convolutionPresets_.begin(),convolutionPresets_.end(),w)!=convolutionPresets_.end() || std::find(convolutionChannels_.begin(),convolutionChannels_.end(),w)!=convolutionChannels_.end())return true;

    if(w==preferenceNavBar_ || w==preferenceContentBar_ || w==errorScrollBar_ || w==dialogClose_ || w==saveBeforeClose_ || w==discard_ || w==keep_ || w==paletteInput_ || w==layerOpacityRange_ || w==layerBlendMode_ || w==layerDescription_ || w==layerDisplayColor_ || w==layerNoColor_ || w==loopDirection_ || w==loopRepeat_ || w==replaceScopeButton_ || w==replacePreviewButton_ || w==replaceRememberButton_ || w==importSheetLayout_ || w==importSheetPartial_ || w==gifRange_ || w==gifDirection_ || w==gifTrim_ || w==exportFormatButton_ || w==exportOpenFolderButton_ || w==sheetValue_ || w==sheetPreview_ || w==exportScaleInput_ || w==exportTrimButton_ || w==exportSelectionButton_ || w==resizeLock_ || w==resizeMethod_ || w==adjustmentPreview_ || w==adjustmentColorize_ || std::find(adjustmentToneButtons_.begin(),adjustmentToneButtons_.end(),w)!=adjustmentToneButtons_.end() || w==curveEditor_ || w==curveChannelButton_ || w==curveResetButton_ || w==curveDeleteButton_ || w==extractNameInput_ || w==extractModeButton_)return true;

    if(std::find(paletteSavePreview_.begin(),paletteSavePreview_.end(),w)!=paletteSavePreview_.end())return true;

    if(w==exportFilename_ || w==exportLocation_)return true;for(auto field:layerPresetColors_)if(w==field)return true;for(auto row:preferenceColorRows_)if(w==row.first||w==row.second)return true;for(auto row:preferenceScaleRows_)if(w==row.first||w==row.second)return true;

    if(w==exportPresets_.choices || w==exportPresets_.name || w==exportPresets_.save || w==exportPresets_.remove)return true;

    if(w==exportScaleBar_||w==exportLayerButton_ || std::find(exportScaleButtons_.begin(),exportScaleButtons_.end(),w)!=exportScaleButtons_.end())return true;

    auto contains=[w](const auto& items){return std::any_of(items.begin(),items.end(),[w](auto item){return item==w;});};

    return w==preferenceApply_ || contains(preferenceTabs_) || contains(preferenceFields_) || contains(checkerboardFields_) || contains(preferenceRows_) || contains(loopInputs_) || contains(replaceInputs_) || contains(replaceSample_) || contains(importSheetInputs_) || contains(gifInputs_) || contains(sheetButtons_) || contains(resizeInputs_) || contains(adjustmentInputs_) || contains(adjustmentSliders_);

  }

void Editor::invalidateTimelineGrid() {

    timelinePaintCacheValid_=false;

    const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,2);

    invalidateRect(uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop+35,l.workW,l.bottom-l.layerTop-35)));

  }

bool Editor::timelineBorderHit(gfx::Point point) const {

    for(const auto& outline:timelineOutlines()){auto material=skin_.selectionMaterialBounds(uiPhysical(outline.border).offset(outline.offset));material.offset(bounds().x,bounds().y);if(outline.clip.contains(point) && skin_.selectionContains(material,point))return true;}return false;

  }

void Editor::beginTimelineGesture(int kind,int row,int column,const ui::MouseMessage& mouse,bool outline){
 if(pending_!=Pending::None||!documentOpen_||timelineGesture_.kind)return;
 // Mask row names select rows, whereas mask frame cells select/edit slots.
 // Legacy row clicks prefer Shift range over Ctrl toggle and never start a move.
 if(kind==1&&mouse.left()&&!mouse.altPressed()&&selectMaskPanelRow(row,mouse.shiftPressed()?2:(mouse.ctrlPressed()||mouse.cmdPressed())?1:0))return;
 if(row>=0){TimelineRows maskRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);if(maskRows.mask(row)){
  const int col=column<0?int(document.activeFrameIndex()):column;
  if(mouse.right()){if(col>=0&&col<int(document.timeline().state().frames.size())){const auto key=std::make_pair(maskRows.owner(row),document.timeline().state().frames[col].id);if(std::find(selectedMaskSlots_.begin(),selectedMaskSlots_.end(),key)==selectedMaskSlots_.end())selectMaskTimelineRow(row,col);showAttachedMaskMenu(key.first,key.second);}return;}
  if(!mouse.left())return;if(mouse.altPressed()){if(col>=0&&col<int(document.timeline().state().frames.size()))toggleMaskIsolation(maskRows.owner(row),document.timeline().state().frames[col].id,mouse.shiftPressed());return;}kind=4;column=col;
 }}
 if(pending_!=Pending::None||!documentOpen_||timelineGesture_.kind)return;const auto& state=document.timeline().state();TimelineRows visual(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);if((kind!=2&&!visual.at(row))||(kind!=1&&(column<0||column>=int(state.frames.size()))))return;if(kind==3&&visual.group(row)&&!mouse.left())return;
 auto& d=timelineGesture_;d={};d.kind=kind;d.starting=true;d.row=d.targetRow=row;d.column=d.targetColumn=column;d.origin=d.pointer=mouse.position();d.identity=document.identity();d.right=mouse.right();d.copy=mouse.altPressed()&&!d.right;d.altClick=d.copy;d.addContent=mouse.shiftPressed();d.selection=document.timelineSelection();d.groups=document.selectedGroupIds();d.virtualSlots=virtualSlots_;d.virtualAnchor=virtualAnchor_;d.frames=document.selectedFrames();d.frameAnchor=document.frameSelectionAnchor();d.activeLayer=document.layer().id;d.activeFrame=document.frame().id;d.mode=(mouse.ctrlPressed()||mouse.cmdPressed())?1:mouse.shiftPressed()?2:0;
 d.masks=selectedMaskSlots_;d.maskAnchor=maskSelectionAnchor_;d.maskIsolated=document.maskIsolated();
 if(!document.activeMaskId().empty())for(const auto& m:state.masks)if(m.frameId==d.activeFrame){const auto* root=timeline::resolvedMask(state,m.ownerId,m.frameId);if(root&&root->id==document.activeMaskId()){d.activeMaskSlot=std::make_pair(m.ownerId,m.frameId);break;}}

 if(kind!=4&&kind!=2){selectedMaskSlots_.clear();document.exitAttachedMask();}
 auto has=[](const auto& ids,const auto& id){return std::find(ids.begin(),ids.end(),id)!=ids.end();};
 if(kind==4){d.pointerAnchor=visual.slot(row,column);const auto key=std::make_pair(visual.owner(row),state.frames[column].id);if(d.mode==2&&has(d.masks,key))d.mode=1;d.canMove=!d.mode&&has(d.masks,key)&&(outline||timelineBorderHit(mouse.position()));if(!d.canMove)selectMaskTimelineRow(row,column,d.mode);}
 else if(kind==1){auto node=*visual.at(row);d.anchor=node.id;d.canMove=!d.mode;const auto& selected=node.kind==LayerPanelKind::Group?d.groups:d.selection.layers;if(!has(selected,d.anchor)||d.mode)document.selectTimelineRow(node,d.mode);virtualSlots_.clear();virtualAnchor_.reset();frameSelectionExplicit_=false;}
 else if(kind==2){d.anchor=state.frames[column].id;d.canMove=!d.mode&&has(d.frames,d.anchor)&&(outline||d.copy||(d.right&&d.frames.size()>1)||timelineBorderHit(mouse.position()));if(d.mode)document.selectFrameHeader(d.anchor,d.mode,playing_);else if(!d.canMove)document.selectFrameHeader(d.anchor,0,playing_);virtualSlots_.clear();virtualAnchor_.reset();markFrameSelection();}
 else{d.pointerAnchor=visual.slot(row,column);const auto* cel=visual.cel(row,column);const bool virtualSelected=has(virtualSlots_,*d.pointerAnchor);bool selected=cel?has(d.selection.cels,cel->id):virtualSelected;if(d.mode==2&&selected)d.mode=1;const bool boundary=outline||timelineBorderHit(mouse.position());if(!cel&&virtualSelected&&!d.mode&&boundary)cel=visual.mixedAnchor(*d.pointerAnchor,d.selection.cels);if(cel)d.anchor=cel->id;d.canMove=cel&&(d.copy||(!d.mode&&selected&&(boundary||(d.right&&d.selection.cels.size()>1))));if(!d.canMove&&!d.mode)selectTimelineSlot(row,column);else if(d.copy&&!selected)selectTimelineSlot(row,column);frameSelectionExplicit_=false;}
 d.minRow=int(state.layers.size());d.maxRow=-1;d.minColumn=int(state.frames.size());d.maxColumn=-1;if(d.canMove&&kind==3)for(const auto& id:document.timelineSelection().cels)if(const auto* c=document.timeline().findCelById(id)){int r=int(document.timeline().layerIndex(c->layerId)),col=visual.frameIndex(c->frameId);d.minRow=std::min(d.minRow,r);d.maxRow=std::max(d.maxRow,r);d.minColumn=std::min(d.minColumn,col);d.maxColumn=std::max(d.maxColumn,col);}
 timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;requestFocus();if(manager())manager()->setCapture(this,true);d.starting=false;timelineScrollTimer_.start();refresh();
}

void Editor::updateTimelineGesture(gfx::Point pointer,bool copy,bool scrolling){
 auto& d=timelineGesture_;if(!d.kind)return;if(d.identity!=document.identity()){finishTimelineGesture(true);return;}d.pointer=pointer;d.copy=copy&&!d.right;if(!d.moved&&std::hypot(double(pointer.x-d.origin.x),double(pointer.y-d.origin.y))<4)return;d.moved=true;
 const auto l=columnLayout(uiLogical(bounds()),2);const auto at=uiLogical(gfx::Rect(pointer.x-bounds().x,pointer.y-bounds().y,1,1)).origin();const auto& s=document.timeline().state();TimelineRows visual(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);if(!visual.size()||s.frames.empty())return;const int columns=timelineColumns(l),capacity=timelineCapacity(l);
 if(scrolling){if(d.kind!=1){if(at.x<l.workX+20+timelineLabelWidth())frameScroll_=std::max(0,frameScroll_-1);else if(at.x>=l.workX+5+timelineLabelWidth()+columns*timelineFrameWidth()-15)frameScroll_=std::min(std::max(0,int(s.frames.size())-columns),frameScroll_+1);}if(d.kind!=2){if(at.y<l.layerTop+timelineRowsOffset()+timelineRowHeight())layerScroll_=std::max(0,layerScroll_-1);else if(at.y>=l.layerTop+timelineRowsOffset()+capacity*timelineRowHeight()-timelineRowHeight())layerScroll_=std::min(std::max(0,visual.size()-capacity),layerScroll_+1);}}
 const double rowAt=(double(at.y-l.layerTop-timelineRowsOffset())+double(layerScrollRemainder_)/uiScale)/timelineRowHeight();d.targetRow=std::clamp(layerScroll_+int(std::floor(rowAt)),0,visual.size()-1);d.targetColumn=std::clamp(frameScroll_+int(std::floor((double(at.x-l.workX-5-timelineLabelWidth())+double(frameScrollRemainder_)/uiScale)/timelineFrameWidth())),0,int(s.frames.size())-1);const double fraction=rowAt-std::floor(rowAt);d.after=d.kind==1?fraction>=.5:(pointer.x-timelineFrameViewport().x+frameScrollRemainder_)%(timelineFrameWidth()*uiScale)>=timelineFrameWidth()*uiScale/2;
 d.realTargetCel.clear();d.rowDrop.reset();
 if(d.kind==4&&d.canMove){d.maskDrop.reset();d.maskPlacements.clear();if(visual.mask(d.targetRow)){const auto target=std::make_pair(visual.owner(d.targetRow),s.frames[d.targetColumn].id);std::vector<Document::MaskSlotKey> sources;for(const auto& key:d.masks)if(timeline::directMask(s,key.first,key.second))sources.push_back(key);d.maskPlacements=document.mapAttachedMaskBlock(sources,{visual.owner(d.row),s.frames[d.column].id},target);if(!d.maskPlacements.empty())d.maskDrop=target;}}

 if(d.kind==1&&d.canMove){using K=LayerPanelDropTarget::Kind;const auto* node=visual.at(d.targetRow);auto drop=LayerPanelDropTarget{node->kind==LayerPanelKind::Group?(fraction<=.25?K::Above:fraction>=.75?K::Below:K::Inside):(d.after?K::Below:K::Above),node->kind,node->id};if(rowAt+layerScroll_<0)drop={K::Top,LayerPanelKind::Layer,{}};else if(rowAt+layerScroll_>=visual.size())drop={K::Bottom,LayerPanelKind::Layer,{}};
  if(node->kind==LayerPanelKind::Group){const auto* g=visual.group(d.targetRow);bool followingRoot=false;for(int i=d.targetRow+1;i<visual.size();++i)if(visual.at(i)->depth==0){followingRoot=true;break;}bool fromTarget=false;for(const auto& id:document.timelineSelection().layers){auto it=std::find_if(s.layers.begin(),s.layers.end(),[&](const auto& l){return l.id==id;});if(it!=s.layers.end()&&it->groupId==std::optional<std::string>(node->id))fromTarget=true;}for(const auto& id:document.selectedGroupIds()){const auto* selected=document.findGroup(id);if(id==node->id||(selected&&selected->parentGroupId==std::optional<std::string>(node->id)))fromTarget=true;}if(g&&!g->parentGroupId&&!followingRoot&&!fromTarget&&fraction>=.8)drop={K::Bottom,LayerPanelKind::Layer,{}};}
  bool blocked=false;if(drop.kind!=K::Top&&drop.kind!=K::Bottom){if(node->kind==LayerPanelKind::Layer&&!d.copy&&std::find(document.timelineSelection().layers.begin(),document.timelineSelection().layers.end(),node->id)!=document.timelineSelection().layers.end())blocked=true;std::optional<std::string> parent=node->kind==LayerPanelKind::Group?std::optional<std::string>(node->id):visual.layer(d.targetRow)->groupId;std::set<std::string> seen;while(parent&&seen.insert(*parent).second){if(std::find(document.selectedGroupIds().begin(),document.selectedGroupIds().end(),*parent)!=document.selectedGroupIds().end()){blocked=true;break;}const auto* g=document.findGroup(*parent);parent=g?g->parentGroupId:std::nullopt;}}if(!blocked)d.rowDrop=drop;
 }
 if(d.canMove&&d.kind==3){const auto* anchor=document.timeline().findCelById(d.anchor);const timeline::Cel* candidate=nullptr;if(anchor&&d.pointerAnchor){if(!d.virtualSlots.empty())candidate=visual.mixedTarget(*anchor,*d.pointerAnchor,d.targetRow,d.targetColumn);else candidate=visual.cel(d.targetRow,d.targetColumn);}if(anchor&&candidate&&d.maxRow>=d.minRow){const int ar=int(document.timeline().layerIndex(anchor->layerId)),ac=visual.frameIndex(anchor->frameId);const int dr=std::clamp(int(document.timeline().layerIndex(candidate->layerId))-ar,-d.minRow,int(s.layers.size())-1-d.maxRow),dc=std::clamp(visual.frameIndex(candidate->frameId)-ac,-d.minColumn,int(s.frames.size())-1-d.maxColumn);if(const auto* target=document.timeline().findCel(s.layers[ar+dr].id,s.frames[ac+dc].id))d.realTargetCel=target->id;}}
 if(!d.canMove){if(d.kind==4){
  // Rebuild from the press snapshot so dragging back shrinks the range.
  auto keys=d.mode?d.masks:std::vector<std::pair<std::string,std::string>>{};
  int target=d.targetRow;if(!visual.mask(target)){int best=d.row;for(int r=std::min(d.row,target);r<=std::max(d.row,target);++r)if(visual.mask(r)&&std::abs(r-target)<std::abs(best-target))best=r;target=best;}
  for(int r=std::min(d.row,target);r<=std::max(d.row,target);++r)if(visual.mask(r))for(int c=std::min(d.column,d.targetColumn);c<=std::max(d.column,d.targetColumn);++c){auto key=std::make_pair(visual.owner(r),s.frames[c].id);if(std::find(keys.begin(),keys.end(),key)==keys.end())keys.push_back(key);}
  selectMaskTimelineRow(target,d.targetColumn,0,&keys);
 }else if(d.kind==2){document.selectFrameHeader(d.anchor,0,playing_);document.selectFrameHeader(s.frames[d.targetColumn].id,2,playing_);markFrameSelection();}else if(d.kind==3)selectTimelineSlot(d.targetRow,d.targetColumn,0,visual.rectangle(d.row,d.column,d.targetRow,d.targetColumn));}
 layoutLayers();invalidateTimelineGrid();
}

void Editor::finishTimelineGesture(bool cancel){
 const auto d=timelineGesture_;if(!d.kind)return;timelineScrollTimer_.stop();timelineGesture_={};if(hasCapture())releaseMouse();if(d.identity!=document.identity())return;const auto& s=document.timeline().state();TimelineRows visual(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);
 if(cancel){document.restoreTimelineRowSelection(d.selection.layers,d.groups,d.selection.layerAnchor.empty()?std::nullopt:std::optional<std::string>(d.selection.layerAnchor));document.restoreTimelineSelection(d.selection,d.frames);document.restoreFrameSelectionAnchor(d.frameAnchor);document.selectLayer(d.activeLayer);document.selectFrame(d.activeFrame);virtualSlots_=d.virtualSlots;virtualAnchor_=d.virtualAnchor;selectedMaskSlots_=d.masks;maskSelectionAnchor_=d.maskAnchor;document.exitAttachedMask();if(d.activeMaskSlot)document.selectAttachedMask(d.activeMaskSlot->first,d.activeMaskSlot->second,d.maskIsolated);}
 else if(d.canMove&&d.moved){playing_=false;loopPlayback_={};if(d.kind==4){if(d.maskDrop)try{reportMaskTransfer(document.moveAttachedMasks(d.masks,{visual.owner(d.row),s.frames[d.column].id},*d.maskDrop));}catch(const std::exception& e){showSaveError(e);}}else if(d.kind==1){if(d.rowDrop)document.moveLayerPanelRows(*d.rowDrop,d.copy);}else if(d.kind==2){if(d.copy)document.copyTimelineFrames(s.frames[d.targetColumn].id,d.after);else document.moveSelectedFrames(s.frames[d.targetColumn].id,d.after);}else{const auto* source=document.timeline().findCelById(d.anchor);const auto* target=document.timeline().findCelById(d.realTargetCel);if(source&&target){const auto groups=visual.movedGroups(d.virtualSlots,*source,*target);document.moveTimelineCels(d.anchor,d.realTargetCel,d.copy);virtualSlots_=groups;virtualAnchor_=groups.empty()?std::nullopt:std::optional<TimelineSlot>(groups.back());}}}
 else if(!d.moved){if(d.kind==4&&d.canMove)selectMaskTimelineRow(d.row,d.column,d.mode);else if(d.kind==1&&!d.mode){if(const auto* n=visual.at(visual.index(d.anchor)))document.selectTimelineRow(*n);}else if(d.kind==2&&!d.mode&&!(d.right&&d.canMove)){document.selectFrameHeader(d.anchor,0,playing_);markFrameSelection();}else if(d.kind==3&&!(d.right&&d.canMove)){if(d.altClick&&!d.anchor.empty()&&visual.layer(d.row)){document.selectTimelineCelContent(d.anchor,d.addContent);selectionTool_=true;selectionPropertiesActive_=true;}else selectTimelineSlot(d.row,d.column,d.mode);}}
 timelineSelectionGuidesVisible_=true;frameSelectionExplicit_=!document.selectedFrames().empty();refresh();if(!cancel&&d.right&&!d.moved){if(d.kind==1){prepareLayerContext(d.anchor);showLayerContextMenu(1);}else if(d.kind==3&&!d.anchor.empty()){prepareCelContext(d.anchor);showLayerContextMenu(3);}else if(d.kind==2)showLayerContextMenu(2);}if(playing_&&!cancel){document.restoreTimelineSelection({},{});virtualSlots_.clear();virtualAnchor_.reset();frameSelectionExplicit_=false;refresh();}
}

bool Editor::beginTimelineOutline(const ui::MouseMessage& mouse){
 if(advancedActive())return false;int floating=topFloatingColumnAt(mouse.position());if(floating>=0&&floating!=2)return false;if(!documentOpen_||!columnShown(2)||pending_!=Pending::None||timelineGesture_.kind||(!mouse.left()&&!mouse.right())||!timelineBorderHit(mouse.position()))return false;const auto l=columnLayout(uiLogical(bounds()),2);const auto at=uiLogical(gfx::Rect(mouse.position().x-bounds().x,mouse.position().y-bounds().y,1,1)).origin();const auto& s=document.timeline().state();TimelineRows rows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);if(!rows.size()||s.frames.empty())return false;int row=std::clamp(layerScroll_+int(std::floor((double(at.y-l.layerTop-timelineRowsOffset())+double(layerScrollRemainder_)/uiScale)/timelineRowHeight())),0,rows.size()-1),column=std::clamp(frameScroll_+int(std::floor((double(at.x-l.workX-5-timelineLabelWidth())+double(frameScrollRemainder_)/uiScale)/timelineFrameWidth())),0,int(s.frames.size())-1);
 if(!selectedMaskSlots_.empty()){
  int bestRow=-1,bestColumn=-1,distance=std::numeric_limits<int>::max();for(const auto& slot:selectedMaskSlots_){const int r=rows.index(TimelineRows::maskRowId(slot.first)),c=rows.frameIndex(slot.second);if(r<0||c<0)continue;const int next=std::abs(r-row)+std::abs(c-column);if(next<distance){distance=next;bestRow=r;bestColumn=c;}}
  if(bestRow<0)return false;beginTimelineGesture(4,bestRow,bestColumn,mouse,true);
 }
 else if(!document.timelineSelection().cels.empty()||!virtualSlots_.empty()){int distance=std::numeric_limits<int>::max(),bestRow=-1,bestColumn=-1;auto consider=[&](const TimelineSlot& slot){int r=rows.index(slot.rowId),c=rows.frameIndex(slot.frameId);if(r<0||c<0)return;int next=std::abs(r-row)+std::abs(c-column);if(next<distance){distance=next;bestRow=r;bestColumn=c;}};for(const auto& slot:virtualSlots_)consider(slot);for(const auto& id:document.timelineSelection().cels)if(const auto* c=document.timeline().findCelById(id))consider({c->layerId,c->frameId});if(bestRow<0)return false;beginTimelineGesture(3,bestRow,bestColumn,mouse,true);}
 else if(!document.selectedFrames().empty())beginTimelineGesture(2,-1,column,mouse,true);else if(!document.timelineSelection().layers.empty()||document.hasSelectedGroups())beginTimelineGesture(1,row,-1,mouse,true);else return false;return timelineGesture_.kind!=0;
}

std::vector<Editor::TimelineOutline> Editor::timelineOutlines()const{
 std::vector<TimelineOutline> out;if(!documentOpen_||!columnShown(2)||!timelineSelectionGuidesVisible_)return out;const auto& state=document.timeline().state();const TimelineRows visual(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);const auto l=columnLayout(uiLogical(bounds()),2);const int rows=std::max(0,std::min(timelineCapacity(l),visual.size()-layerScroll_)),cols=timelineHidden_?0:std::max(0,std::min(timelineColumns(l),int(state.frames.size())-frameScroll_));const int x=l.workX+5,y=l.layerTop+timelineHeaderOffset();
 auto add=[&](gfx::Rect box,gfx::Point offset,gfx::Rect clip){clip.enlarge(2*uiScale);auto material=skin_.selectionMaterialBounds(uiPhysical(box).offset(offset));material.offset(bounds().x,bounds().y);out.push_back({box,paletteMousePosition_&&clip.contains(*paletteMousePosition_)&&skin_.selectionContains(material,*paletteMousePosition_),offset,clip});};
 for(int r=0;r<rows;){if(r>=int(layerRows_.size())||!layerRows_[r]->timelineSelected){++r;continue;}int first=r;while(r<rows&&r<int(layerRows_.size())&&layerRows_[r]->timelineSelected)++r;add({x+timelineNameOffset(),y+timelineHeaderHeight()+first*timelineRowHeight(),timelineLabelWidth()-timelineNameOffset()+cols*timelineFrameWidth()+1,(r-first)*timelineRowHeight()+1},{0,-layerScrollRemainder_},timelineRowViewport());}
 for(int c=0;c<cols;){if(c>=int(frameHeaders_.size())||!frameHeaders_[c]->timelineSelected){++c;continue;}int first=c;while(c<cols&&c<int(frameHeaders_.size())&&frameHeaders_[c]->timelineSelected)++c;add({x+timelineLabelWidth()+first*timelineFrameWidth(),y,(c-first)*timelineFrameWidth()+1,rows*timelineRowHeight()+timelineHeaderHeight()+1},{-frameScrollRemainder_,0},timelineFrameViewport(true)|timelineFrameViewport());}
 // Mask rows are separated by owner rows. Outline each contiguous selected run
 // through the same material, physical-coordinate and alpha-hit pipeline.
 const auto maskVisualSlots=maskTimelineVisualSlots();
 for(int r=0;r<rows;++r)if(visual.mask(r+layerScroll_)){
  auto selected=[&](int c){return std::find(maskVisualSlots.begin(),maskVisualSlots.end(),std::make_pair(visual.owner(r+layerScroll_),state.frames[c+frameScroll_].id))!=maskVisualSlots.end();};
  for(int c=0;c<cols;){if(!selected(c)){++c;continue;}const int first=c;while(c<cols&&selected(c))++c;add({x+timelineLabelWidth()+first*timelineFrameWidth(),y+timelineHeaderHeight()+r*timelineRowHeight(),(c-first)*timelineFrameWidth()+1,timelineRowHeight()+1},{-frameScrollRemainder_,-layerScrollRemainder_},timelineFrameViewport());}
 }
 std::vector<TimelineSlot> slots=virtualSlots_;const auto& d=timelineGesture_;const bool moving=d.kind==3&&d.canMove&&d.moved;const auto* anchor=moving?document.timeline().findCelById(d.anchor):nullptr;const auto* target=moving?document.timeline().findCelById(d.realTargetCel):nullptr;int dr=0,dc=0;if(anchor&&target){dr=int(document.timeline().layerIndex(target->layerId))-int(document.timeline().layerIndex(anchor->layerId));dc=visual.frameIndex(target->frameId)-visual.frameIndex(anchor->frameId);slots=visual.movedGroups(d.virtualSlots,*anchor,*target);}if(selectedMaskSlots_.empty())for(const auto& id:document.timelineSelection().cels){const auto* cel=document.timeline().findCelById(id);if(!cel)continue;int r=int(document.timeline().layerIndex(cel->layerId))+dr,c=visual.frameIndex(cel->frameId)+dc;if(r>=0&&r<int(state.layers.size())&&c>=0&&c<int(state.frames.size()))slots.push_back({state.layers[r].id,state.frames[c].id});}
 int top=rows,bottom=-1,left=cols,right=-1;for(const auto& slot:slots){int r=visual.index(slot.rowId)-layerScroll_,c=visual.frameIndex(slot.frameId)-frameScroll_;if(r<0||r>=rows||c<0||c>=cols)continue;top=std::min(top,r);bottom=std::max(bottom,r);left=std::min(left,c);right=std::max(right,c);}if(bottom>=0)add({x+timelineLabelWidth()+left*timelineFrameWidth(),y+timelineHeaderHeight()+top*timelineRowHeight(),(right-left+1)*timelineFrameWidth()+1,(bottom-top+1)*timelineRowHeight()+1},{-frameScrollRemainder_,-layerScrollRemainder_},timelineFrameViewport());return out;
}

void Editor::paintTimelineGrid(ui::Graphics& g) {InteractionScope interactionScope(10,"timeline-paint");

    if(!documentOpen_ || !columnShown(2))return;
    if(document.freeTileInstanceView())return;

    g.saveClip();clipColumn(g,2,true);paintLoopTrack(g);{

    auto backgroundHover=[&](TimelineButton* button){

      return paletteMousePosition_ && button->bounds().contains(*paletteMousePosition_);

    };

    // Transparent hit widgets ask their parent to repaint this same composite.

    // Their temporarily hidden flag during laf's background pass is not layout visibility.

    for(const auto& buttons:{layerRows_,layerEyes_,layerLocks_,layerAutoLinks_,frameHeaders_,frameCells_,hiddenCelThumbnails_,hiddenMaskThumbnails_,hiddenMaskLinks_})for(auto b:buttons) {

      if(!b->timelineVisible)continue;

      auto box=b->bounds();box.offset(-bounds().x,-bounds().y);

      auto materialBox=box;materialBox.w+=uiScale;materialBox.h+=uiScale;

      if(!materialBox.intersects(g.getClipBounds()))continue;

      b->timelineBackgroundHover=backgroundHover(b);

      g.saveClip();if(b->paletteViewport)g.clipRect(timelineMaterialViewport(b->paletteViewport(),std::find(frameHeaders_.begin(),frameHeaders_.end(),b)!=frameHeaders_.end()).offset(-bounds().origin()));

      b->paintTimelineContent(g,gfx::Rect(0,0,box.w/uiScale,box.h/uiScale),box.origin());

      if(timelineThumbnailSize()){

        const auto cell=std::find(frameCells_.begin(),frameCells_.end(),b);

        if(cell!=frameCells_.end()){const auto slot=std::size_t(cell-frameCells_.begin());if(slot<thumbnailBindings_.size() && thumbnailBindings_[slot].image){const auto& image=thumbnailBindings_[slot].image;const int size=timelineThumbnailSize()*uiScale;const gfx::Rect target(box.x+(box.w-size)/2,box.y+(box.h-size)/2,size,size);g.drawSurface(image.get(),gfx::Rect(0,0,size,size),target,os::Sampling(),nullptr);}}

      }

      // LayersPanel disabled-frame SVG: rising diagonal, inset 4, currentColor .72.

      const auto header=std::find(frameHeaders_.begin(),frameHeaders_.end(),b);

      if(header!=frameHeaders_.end()){const auto index=frameScroll_+int(header-frameHeaders_.begin());if(index<int(document.timeline().state().frames.size()) && document.timeline().state().frames[index].disabled){UiPaintScale scale(g);const auto rc=uiLogical(box);g.drawLine(gfx::rgba(gfx::getr(skin_["timelineInk"]),gfx::getg(skin_["timelineInk"]),gfx::getb(skin_["timelineInk"]),184),gfx::Point(rc.x+2,rc.y2()-3),gfx::Point(rc.x2()-3,rc.y+2));}}

      g.restoreClip();

    }

    // Adjacent canonical linked slots reuse the user's original ball as a

    // 3/1/3 horizontal nine-slice. Only visible content receives a marker.

    {

      g.saveClip();g.clipRect(timelineMaterialViewport(timelineFrameViewport()).offset(-bounds().origin()));

      {UiPaintScale scale(g,gfx::Point(-frameScrollRemainder_,-layerScrollRemainder_));const auto l=columnLayout(uiLogical(bounds()),2);

      const int columns=timelineColumns(l);

      const int rows=std::min(timelineCapacity(l),TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).size()-layerScroll_);

      const auto& frames=document.timeline().state().frames;

      const int visible=std::min(columns,int(frames.size())-frameScroll_);

      for(int row=0;!timelineHidden_&&row<rows;++row)for(int col=0;col<visible;) {

        const auto* visualLayer=TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).layer(row+layerScroll_);if(!visualLayer){++col;continue;}const auto& layer=*visualLayer;

        const auto* left=document.timeline().findCel(layer.id,frames[frameScroll_+col].id);

        const auto a=document.timeline().resolveSurface(left->id);

        const int first=col++;

        if(!a.source || !celHasContent(left))continue;

        while(col<visible) {

          const auto* next=document.timeline().findCel(layer.id,frames[frameScroll_+col].id);

          const auto b=document.timeline().resolveSurface(next->id);

          if(!b.source || a.source->id!=b.source->id)break;

          ++col;

        }

        // Draw each complete run once: overlapping pairwise rounded caps

        // would leave dark seams inside runs of three or more cels.

        if(!timelineThumbnailSize() && col-first>1)skin_.draw(g,"timeline.linked-dot",gfx::Rect(l.workX+5+timelineLabelWidth()+(timelineFrameWidth()-7)/2+1+first*timelineFrameWidth(),l.layerTop+timelineRowsOffset()+row*timelineRowHeight()+(timelineRowHeight()-7)/2,7+(col-first-1)*timelineFrameWidth(),7));

      }

    }

      }g.restoreClip();

    {UiPaintScale scale(g);

    if(timelineGesture_.kind && timelineGesture_.canMove && timelineGesture_.moved && timelineGesture_.kind!=3){const auto l=columnLayout(uiLogical(bounds()),2);const auto& d=timelineGesture_;if(d.kind==1){const int row=d.targetRow-layerScroll_+(d.after?1:0);skin_.drawSelectionBorder(g,uiPhysical(gfx::Rect(l.workX+41,l.layerTop+timelineRowsOffset()+row*timelineRowHeight(),timelineLabelWidth()-36+std::min(timelineColumns(l),int(document.timeline().state().frames.size())-frameScroll_)*timelineFrameWidth()+1,1)),false);}else{const int col=d.targetColumn-frameScroll_+(d.after?1:0);skin_.drawSelectionBorder(g,uiPhysical(gfx::Rect(l.workX+5+timelineLabelWidth()+col*timelineFrameWidth(),l.layerTop+timelineHeaderOffset(),1,std::min(timelineCapacity(l),TimelineRows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_).size()-layerScroll_)*timelineRowHeight()+timelineHeaderHeight()+1)),false);}}

    }

    if(gifDropTargetIndex_){const auto grid=timelineFrameViewport(true)|timelineFrameViewport();g.saveClip();g.clipRect(gfx::Rect(grid).offset(-bounds().origin()));const int x=grid.x+(*gifDropTargetIndex_-frameScroll_)*timelineFrameWidth()*uiScale-frameScrollRemainder_-uiScale;g.fillRect(skin_["accent"],gfx::Rect(x-bounds().x,grid.y-bounds().y,2*uiScale,grid.h));g.restoreClip();}

    for(const auto& outline:timelineOutlines()) {

      // 3px skin frame: outer black, white, inner black. The inner black

      // coincides with the existing 1px grid border; the other two extend out.

      auto outlineClip=outline.clip;outlineClip.offset(-bounds().origin());g.saveClip();g.clipRect(outlineClip);{UiPaintScale scale(g);skin_.drawSelectionBorder(g,uiPhysical(outline.border).offset(outline.offset),outline.hover);}g.restoreClip();

    }

    }g.restoreClip();

  }

void Editor::paintTimelineCached(ui::Graphics& g,const Layout& ll,gfx::Rect area) {
    // Scrolled edge widgets may extend into the surrounding panel frame.
    // Fill only that overhang, then reuse the single timeline composition.
    if(!area.contains(g.getClipBounds())){
      gfx::Region outside(g.getClipBounds());outside-=gfx::Region(area);
      g.saveClip();g.clipRegion(outside);paintPanelBackdrops(g,true);g.restoreClip();
    }

    if(!timelinePaintCache_ || timelinePaintCacheBounds_!=area){

      timelinePaintCache_=os::instance()->makeRgbaSurface(area.w,area.h);timelinePaintCacheBounds_=area;timelinePaintCacheValid_=false;

    }

    if(!timelinePaintCacheValid_){
      {ui::Graphics backing(timelinePaintCache_);backing.fillRect(skin_["panel"],{0,0,area.w,area.h});}

      ui::Graphics cache(nullptr,timelinePaintCache_,-area.x,-area.y);cache.clipRect(area);

      {UiPaintScale scale(cache);cache.fillRect(skin_["background"],uiLogical(clientBounds()));paintWorkLayer(cache,uiLogical(clientBounds()));paintTimelineBackground(cache,ll);}

      paintTimelineGrid(cache);timelinePaintCacheValid_=true;++timelineCachePaints_;

    }

    g.saveClip();clipColumn(g,2,true);ui::Paint copy;copy.blendMode(os::BlendMode::Src);

    g.drawSurface(timelinePaintCache_.get(),{0,0,area.w,area.h},area,os::Sampling(),&copy);g.restoreClip();

  }

void Editor::paintTimelineBackground(ui::Graphics& g,const Layout& ll) {

      g.saveClip();clipColumn(g,2,true);const gfx::Rect outer=docking_.custom?columnFrame(2):gfx::Rect(ll.workX,ll.layerTop,ll.workW,ll.bottom-ll.layerTop);

      if(columnFloating(2))FloatingColumnChrome::paint(skin_,g,outer);else if(!skin_.draw(g,"timeline.frame",outer)){g.fillRect(skin_["panel"],outer);g.drawRect(skin_["timelineGrid"],outer);

      g.drawRect(skin_["timelineEdge"],gfx::Rect(outer.x+1,outer.y+1,outer.w-2,outer.h-2));g.drawRect(skin_["timelineGrid"],gfx::Rect(outer.x+2,outer.y+2,outer.w-4,outer.h-4));}

      const int x=ll.workX+5,y=ll.layerTop+timelineHeaderOffset(),gx=x+timelineLabelWidth();

      if(!skin_.draw(g,"timeline.grid",gfx::Rect(ll.workX+5,y,ll.workW-9,ll.bottom-y-5))){g.fillRect(skin_["timelineBackground"],gfx::Rect(ll.workX+5,y,ll.workW-9,ll.bottom-y-5));

      g.drawRect(skin_["timelineGrid"],gfx::Rect(ll.workX+5,y,ll.workW-9,ll.bottom-y-5));}

      if(timelineHidden_){g.restoreClip();return;}
      // Complete user-supplied cell frames overlap one base pixel. Actual

      // row/header widgets paint the rest; no independent grid extensions.

      g.saveClip();g.clipRect(gfx::Rect(x,y,timelineScrollMetrics(ll).viewportWidth/uiScale,timelineHeaderHeight()+timelineScrollMetrics(ll).height/uiScale));

      for(int offset:{0,12,24,36}){

        const int width=offset==36?timelineLabelWidth()-36:12;const gfx::Rect header(x+offset,y,width,timelineHeaderHeight());

        skin_.draw(g,"timeline.row",header);

        skin_.draw(g,"timeline.cell",gfx::Rect(header.x,header.y,header.w+1,header.h+1));

      }

      for(int i=0;i<3;++i)toolIcons_.draw(g,std::string(i==0?"eye":i==1?"lock":"animation-auto-link-off")+"-disabled",gfx::Rect(x+i*12+1,y+1,11,11),true);g.restoreClip();

      const auto metrics=timelineScrollMetrics(ll);

      if(metrics.horizontal && metrics.vertical)paintScrollbarCorner(g,timelineRowViewport());

      g.restoreClip();

  }


bool Editor::processTimelineInput(ui::Message* msg){
    if(document.freeTileInstanceView())return processPanelGesture(msg);
    if(processLayerLabelResize(msg))return true;
    if(processGroupExpandGesture(msg))return true;

    // Capture routes a second frame-header click to Editor rather than its button.

    if(pending_==Pending::None && columnShown(2) && msg->type()==ui::kDoubleClickMessage && static_cast<ui::MouseMessage*>(msg)->left()){const auto point=static_cast<ui::MouseMessage*>(msg)->position();for(std::size_t col=0;col<frameHeaders_.size();++col)if(frameHeaders_[col]->timelineVisible && frameHeaders_[col]->bounds().contains(point)){openFramePropertiesFor(frameScroll_+col);return true;}}

    if(pending_==Pending::None && columnShown(2) && msg->type()==ui::kDoubleClickMessage && static_cast<ui::MouseMessage*>(msg)->left()){const auto point=static_cast<ui::MouseMessage*>(msg)->position();for(std::size_t row=0;row<layerRows_.size();++row)if(layerRows_[row]->timelineVisible && layerRows_[row]->bounds().contains(point)){TimelineRows rows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);if(rows.mask(layerScroll_+int(row)))showAttachedMaskMenu(rows.owner(layerScroll_+int(row)),document.frame().id);else openLayerPropertiesFor(layerScroll_+row);return true;}}

    if(msg->type()==ui::kFocusLeaveMessage)stopCelNavigation();

    if(msg->type()==ui::kKeyUpMessage)releaseCelNavigation(static_cast<ui::KeyMessage*>(msg)->scancode());

    if(processLockGesture(msg))return true;

    if(processVisibilityGesture(msg))return true;

    if(processAutoLinkGesture(msg))return true;

    if(processLoopTrack(msg))return true;

    if(processPanelGesture(msg))return true;

    if(timelineGesture_.kind && !timelineGesture_.starting){

      if(msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage){timelineGesture_.copy=static_cast<ui::KeyMessage*>(msg)->altPressed() && !timelineGesture_.right;}

      if(!hasCapture() && (msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage || msg->type()==ui::kKeyDownMessage))finishTimelineGesture(true);

      else if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){finishTimelineGesture(true);return true;}

      else if(msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage){invalidateTimelineGrid();return true;}

      else if(msg->type()==ui::kMouseMoveMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);updateTimelineGesture(mouse->position(),mouse->altPressed());return true;}

      else if(msg->type()==ui::kMouseUpMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);if((timelineGesture_.right && mouse->right()) || (!timelineGesture_.right && mouse->left())){updateTimelineGesture(mouse->position(),mouse->altPressed());finishTimelineGesture();}return true;}

    }

    if(msg->type()==ui::kMouseDownMessage && beginTimelineOutline(*static_cast<ui::MouseMessage*>(msg)))return true;

    if(!advancedActive() && msg->type()==ui::kMouseDownMessage && clearTimelineSelectionFromBlank(*static_cast<ui::MouseMessage*>(msg)))return true;

    return false;
}
}

namespace moon::editor {
void Editor::selectTimelineSlot(int row,int column,int mode,const std::vector<TimelineSlot>& replacement){if(selectMaskTimelineRow(row,column,mode))return;selectedMaskSlots_.clear();document.exitAttachedMask();
 TimelineRows rows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);const auto target=rows.slot(row,column);if(!target)return;
 std::vector<TimelineSlot> slots=virtualSlots_;for(const auto& id:document.timelineSelection().cels)if(const auto* c=document.timeline().findCelById(id))slots.push_back({c->layerId,c->frameId});
 if(!replacement.empty())slots=replacement;else if(mode==2){auto anchor=virtualAnchor_;if(!anchor&&!document.timelineSelection().celAnchor.empty())if(const auto* c=document.timeline().findCelById(document.timelineSelection().celAnchor))anchor=TimelineSlot{c->layerId,c->frameId};const int ar=anchor?rows.index(anchor->rowId):-1,ac=anchor?rows.frameIndex(anchor->frameId):-1;slots=ar<0||ac<0?std::vector<TimelineSlot>{*target}:rows.rectangle(ar,ac,row,column);}else if(mode==1){auto at=std::find(slots.begin(),slots.end(),*target);if(at==slots.end())slots.push_back(*target);else slots.erase(at);}else slots={*target};
 virtualSlots_.clear();std::vector<std::string> real;for(const auto& slot:slots){int r=rows.index(slot.rowId),c=rows.frameIndex(slot.frameId);if(const auto* cel=rows.cel(r,c)){if(std::find(real.begin(),real.end(),cel->id)==real.end())real.push_back(cel->id);}else if(rows.group(r)&&c>=0&&std::find(virtualSlots_.begin(),virtualSlots_.end(),slot)==virtualSlots_.end())virtualSlots_.push_back(slot);}
 if(!real.empty()){const auto* focus=rows.cel(row,column);document.selectTimelineCel(focus&&std::find(real.begin(),real.end(),focus->id)!=real.end()?focus->id:real.back(),0,real);}else document.restoreTimelineSelection({},{});
 if(rows.group(row)){document.selectTimelineRow(*rows.at(row));auto formal=document.timelineSelection();formal.cels=real;formal.celAnchor=real.empty()?std::string{}:real.back();document.restoreTimelineSelection(std::move(formal),{});document.selectFrame(target->frameId);}
 if(mode!=2)virtualAnchor_=target;frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;playing_=false;loopPlayback_={};
}
}
namespace moon::editor {
gfx::Rect Editor::groupExpandBounds(int row)const{TimelineRows rows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);const auto* node=rows.at(row);const int slot=row-layerScroll_;if(!node||node->kind!=LayerPanelKind::Group||slot<0||slot>=int(layerRows_.size())||!layerRows_[slot]->timelineVisible)return {};return layerAutoLinks_[slot]->bounds()&timelineRowViewport();}
bool Editor::processGroupExpandGesture(ui::Message* msg){
 auto finish=[&]{groupExpandGesture_.reset();if(hasCapture())releaseMouse();};if(groupExpandIdentity_!=document.identity()){if(groupExpandGesture_)finish();groupExpandSolo_.clear();groupExpandSoloOriginals_.clear();groupExpandIdentity_=document.identity();}
 if(groupExpandGesture_&&(!hasCapture()||msg->type()==ui::kFocusLeaveMessage)){finish();return false;}if(groupExpandGesture_&&msg->type()==ui::kMouseUpMessage){finish();return true;}
 if(msg->type()!=ui::kMouseDownMessage&&msg->type()!=ui::kMouseMoveMessage)return false;auto m=static_cast<ui::MouseMessage*>(msg);if(groupExpandGesture_&&!m->left()){finish();return true;}if(!m->left()||pending_!=Pending::None||homeOpen_||!documentOpen_||!columnShown(2))return false;if(!groupExpandGesture_){const int floating=topFloatingColumnAt(m->position());if((floating>=0&&floating!=2)||timelineBorderHit(m->position()))return false;}TimelineRows rows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);std::string hit;for(int row=0;row<rows.size();++row)if(!rows.mask(row)&&groupExpandBounds(row).contains(m->position())){hit=rows.at(row)->id;break;}if(hit.empty())return bool(groupExpandGesture_);
 auto expanded=[&](const std::string& id){return std::find(document.collapsedGroupIds().begin(),document.collapsedGroupIds().end(),id)==document.collapsedGroupIds().end();};auto apply=[&](const std::string& id,bool value){if(document.findGroup(id)&&expanded(id)!=value)document.toggleGroupCollapsed(id);};std::vector<std::string> ids;for(int row=0;row<rows.size();++row)if(rows.group(row))ids.push_back(rows.at(row)->id);
 if(msg->type()==ui::kMouseDownMessage){if(groupExpandGesture_)finish();const bool value=!expanded(hit);auto modifiers=ids;const auto selectedCount=document.selectedGroupIds().size()+document.timelineSelection().layers.size();if(selectedCount>1)modifiers.erase(std::remove_if(modifiers.begin(),modifiers.end(),[&](const auto& id){return std::find(document.selectedGroupIds().begin(),document.selectedGroupIds().end(),id)==document.selectedGroupIds().end();}),modifiers.end());if(m->altPressed()){for(const auto& item:groupExpandSoloOriginals_)apply(item.first,item.second);if(groupExpandSolo_==hit){groupExpandSolo_.clear();groupExpandSoloOriginals_.clear();}else{groupExpandSoloOriginals_.clear();for(const auto& id:modifiers)groupExpandSoloOriginals_[id]=expanded(id);for(const auto& id:modifiers)apply(id,id==hit);groupExpandSolo_=hit;}refresh();return true;}if(m->ctrlPressed()){for(const auto& id:modifiers)apply(id,value);refresh();return true;}groupExpandGesture_=GroupExpandGesture{hit,value,{}};requestFocus();manager()->setCapture(this,true);}
 if(groupExpandGesture_){auto& d=*groupExpandGesture_;auto a=std::find(ids.begin(),ids.end(),d.start),b=std::find(ids.begin(),ids.end(),hit);if(a!=ids.end()&&b!=ids.end()){auto first=std::min(a,b),last=std::max(a,b);for(auto it=first;it<=last;++it)d.originals.emplace(*it,expanded(*it));for(const auto& item:d.originals){auto p=std::find(ids.begin(),ids.end(),item.first);apply(item.first,p!=ids.end()&&p>=first&&p<=last?d.value:item.second);}}refresh();return true;}return false;
}
}
