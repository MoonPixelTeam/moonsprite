#include "editor_implementation.h"
#include "editor.h"
#include "free_tile_instances_panel.h"

namespace moon::editor {

panels::Geometry Editor::columnGeometry(gfx::Rect rc)const{InteractionScope interactionScope(0,"geometry");

    if(docking_.custom)return docking_.layout(dockArea(rc),columnVisibility(),Layout::gap,floatingArea(rc));

    const Layout l(rc,layersPanelOpen_,dockWidth_,paletteShare_,timelineHeight_,toolRailSide_,int(toolRail_.size()));panels::Geometry g;g.shown=columnVisibility();

    g.panel[0]={l.rightX,l.tabY,l.right,l.paletteBottom(colorPickerOpen_)-l.tabY};auto c=l.pickerPanel();g.panel[1]={c.x,c.y,c.w,c.h};g.panel[2]={l.workX,l.layerTop,l.workW,l.bottom-l.layerTop};

    if(previewPanel_){auto r=uiLogical(previewPanel_->bounds());g.panel[3]={r.x-rc.x,r.y-rc.y,r.w,r.h};}return g;

  }

bool Editor::columnShown(int id)const{if(advancedActive())return false;return docking_.custom?docking_.shown(id,columnVisibility()):columnVisibility()[id];}

Editor::Layout Editor::workspaceLayout(gfx::Rect rc)const{

    Layout l(rc,layersPanelOpen_,dockWidth_,paletteShare_,timelineHeight_,toolRailSide_,int(toolRail_.size()));

    if(advancedActive()){l.workX=0;l.workW=rc.w;l.top=advancedMode_==1?Layout::optionsHeight+Layout::gap:0;l.bottom=rc.h;l.layerTop=rc.h+Layout::gap;return l;}

    if(docking_.custom){auto r=columnGeometry(rc).canvas;l.workX=r.x;l.workW=r.w;l.top=r.y+Layout::optionsHeight+Layout::gap;l.layerTop=r.y+r.h+Layout::gap;}

    return l;

  }

Editor::Layout Editor::columnLayout(gfx::Rect rc,int id)const{

    Layout l(rc,layersPanelOpen_,dockWidth_,paletteShare_,timelineHeight_,toolRailSide_,int(toolRail_.size()));if(!docking_.custom)return l;

    auto r=columnGeometry(rc).panel[id];

    if(id==2){l.workX=r.x;l.workW=r.w;l.layerTop=columnFloating(id)?FloatingColumnChrome::bodyTop(columnFrame(id))-37:columnBodyTop(id)-19;l.bottom=r.y+r.h;}

    else{l.rightX=r.x;l.right=r.w;l.tabY=r.y;l.top=r.y+Layout::tabHeight;l.split=panels::isPicker(id)?r.y:r.y+r.h+Layout::gap;l.bottom=r.y+r.h;if(panels::isPicker(id))l.pickerTop=columnChrome(id).content.y-PanelChromeLayout::actionHeight-uiGap;}

    return l;

  }

PanelChromeLayout Editor::columnChrome(int id)const{auto chrome=PanelChromeLayout(columnFrame(id),columnFrameTop(id)==0,id==3?0:PanelChromeLayout::actionHeight);if(columnFloating(id)){const int top=FloatingColumnChrome::bodyTop(columnFrame(id));chrome.actions.y=columnFrame(id).y+FloatingColumnChrome::actionTop;chrome.actions.h=15;chrome.content.h=std::max(0,chrome.content.y2()-top);chrome.content.y=top;}return chrome;}

int Editor::columnBodyTop(int id)const{return columnChrome(id).actions.y;}

void Editor::initializeDocking(){

    if(docking_.custom)return;const auto rc=uiLogical(bounds());if(rc.w<=0||rc.h<=0||dockArea(rc).h<=0)return;const auto geometry=columnGeometry(rc);docking_.leftWidth=geometry.panel[0].w;

    docking_.bottomHeight=timelineHeight_;docking_.bottomShare=std::clamp(double(timelineHeight_)/std::max(1,dockArea(rc).h),0.0,1.0);

    for(int i=0;i<panels::columnCount;++i){if(i>=8)continue;auto& group=docking_.groups[docking_.groupOf(i)];group.weight=std::max(1,geometry.panel[i].h);if(geometry.panel[i].w>0&&geometry.panel[i].h>0){group.floating=geometry.panel[i];group.floatingArea=floatingArea(rc);}group.width=std::max(140,geometry.panel[i].w);}

  }

void Editor::restorePickerSquare(int id) {

    if(pending_!=Pending::None || !columnShown(id))return;

    pickerColumns_[id].picker->finishInteraction();const auto rc=uiLogical(bounds());

    // Restore against uncompressed 12px hue/alpha strips, even when the current
    // viewport is too short to expose a usable field.
    auto fieldSlot=[&]{auto box=columnLayout(rc,id).pickerGradient(runtimePreferences_.flag("colorLayers.recentColorsVisible")&&!recentColors_.values().empty());box.shrink(1);return PickerBox{0,0,box.w,box.h-24};};

    auto field=fieldSlot();int delta=field.w-field.h;if(std::abs(delta)<=1)return;

    if(!docking_.custom){const Layout l(rc,layersPanelOpen_,dockWidth_,paletteShare_,timelineHeight_,toolRailSide_,int(toolRail_.size()));paletteShare_=double(std::clamp(l.split-l.top-delta,70,std::max(70,l.bottom-l.top-100)))/std::max(1,l.bottom-l.top);}

    else {

      auto geometry=columnGeometry(rc);int group=docking_.groupOf(id);auto dock=docking_.groups[group].dock;auto r=geometry.panel[id];

      if(dock==panels::Dock::Floating && r.y>=rc.h*.55 && r.y+r.h>=rc.h-72){docking_.placeGroup(id,panels::Dock::Bottom,-1,true,false,r);group=docking_.groupOf(id);dock=panels::Dock::Bottom;refresh();geometry=columnGeometry(rc);r=geometry.panel[id];field=fieldSlot();delta=field.w-field.h;}

      if(dock==panels::Dock::Bottom && r.w-delta<116){const auto area=dockArea(rc);docking_.bottomShare=double(std::clamp(r.h+116-(r.w-delta),70,std::max(70,area.h-100)))/std::max(1,area.h);refresh();geometry=columnGeometry(rc);r=geometry.panel[id];field=fieldSlot();delta=field.w-field.h;}

      if(dock==panels::Dock::Floating){auto& g=docking_.groups[group];g.floating=r;g.floating.h=std::clamp(r.h+delta,80,4096);g.floatingArea=floatingArea(rc);}

      else {

        std::vector<int> siblings;for(int i=0;i<int(docking_.groups.size());++i)if(docking_.groups[i].dock==dock){bool visible=false;for(int id:docking_.groups[i].tabs)visible|=columnVisibility()[id];if(visible)siblings.push_back(i);}

        auto size=[&](int i){auto b=geometry.panel[docking_.groups[i].active];return dock==panels::Dock::Bottom?b.w:b.h;};

        if(dock==panels::Dock::Bottom){int main=-1;for(int i:siblings)if(std::find(docking_.groups[i].tabs.begin(),docking_.groups[i].tabs.end(),2)!=docking_.groups[i].tabs.end())main=i;if(main<0)main=siblings.front();

          if(group!=main)docking_.groups[group].width=std::clamp(r.w-delta,116,std::max(116,r.w+size(main)-180));

          else if(siblings.size()>1){const int desired=std::clamp(r.w-delta,116,std::max(116,r.w));int remaining=r.w-desired;for(int i:siblings)if(i!=group){docking_.groups[i].width=size(i)+remaining;remaining=0;}}

          else docking_.groups[group].fixedExtent=std::clamp(r.w-delta,116,4096);

        }else if(siblings.size()>1){int available=0;for(int i:siblings)available+=size(i);const int desired=std::clamp(r.h+delta,80,std::max(80,available-70*int(siblings.size()-1)));int remaining=available-desired;int others=available-r.h;for(int i:siblings)docking_.groups[i].weight=i==group?desired:std::max(1,int(std::round(double(size(i))*remaining/std::max(1,others))));}

        else docking_.groups[group].fixedExtent=std::clamp(r.h+delta,80,4096);

      }

    }

    refresh();saveWorkspaceSizes();

  }

void Editor::dockColumn(int id,panels::Dock dock){initializeDocking();const auto rc=uiLogical(bounds());auto r=columnGeometry(rc).panel[id];docking_.place(id,dock,-1,true,false,r);docking_.groups[docking_.groupOf(id)].floatingArea=floatingArea(rc);refresh();saveWorkspaceSizes();}

void Editor::clipColumn(ui::Graphics& g,int id,bool physical)const {

    if(advancedActive())return;

    if(!docking_.custom)return;const auto geometry=columnGeometry(uiLogical(bounds()));gfx::Region clip(g.getClipBounds());const int own=id<0?-1:docking_.groupOf(id);

    for(int other=0;other<panels::columnCount;++other){if(!geometry.shown[other] || other==id)continue;const int group=docking_.groupOf(other);if(docking_.groups[group].dock!=panels::Dock::Floating)continue;

      if(group==own)continue;

      if(own>=0 && docking_.groups[own].dock==panels::Dock::Floating && (groupFocus(other)<groupFocus(id) || (groupFocus(other)==groupFocus(id) && group<own)))continue;

      auto r=geometry.panel[other];gfx::Rect box(r.x,r.y,r.w,r.h);clip-=gfx::Region(uiPhysical(box));}

    g.clipRegion(clip);

  }

bool Editor::columnFloating(int id)const{return (docking_.custom || id==3) && docking_.groups[docking_.groupOf(id)].dock==panels::Dock::Floating;}

int Editor::columnFrameTop(int id)const{if(columnFloating(id))return 0;int count=0;for(int tab:docking_.groups[docking_.groupOf(id)].tabs)count+=columnVisibility()[tab];return count>1?Layout::tabHeight-Layout::frame:0;}

gfx::Rect Editor::columnFrame(int id)const{auto r=columnGeometry(uiLogical(bounds())).panel[id];const int top=columnFrameTop(id);return {r.x,r.y+top,r.w,r.h-top};}

int Editor::topFloatingColumnAt(gfx::Point point)const{
    if(advancedActive())return -1;

    if(!docking_.custom)return previewPanel_ && columnShown(3) && previewPanel_->bounds().contains(point)?3:-1;const auto geometry=columnGeometry(uiLogical(bounds()));

    int top=-1;std::uint64_t rank=0;

    for(const auto& group:docking_.groups){if(group.dock!=panels::Dock::Floating)continue;for(int id:group.tabs)if(geometry.shown[id]){const auto r=geometry.panel[id];const auto focus=groupFocus(id);if(toDisplay(gfx::Rect(r.x,r.y,r.w,r.h)).contains(point) && (top<0 || focus>=rank)){top=id;rank=focus;}}}

    return top;

  }

std::uint64_t Editor::groupFocus(int id)const{std::uint64_t rank=0;for(int tab:docking_.groups[docking_.groupOf(id)].tabs)rank=std::max(rank,floatingFocus_[tab]);return rank;}

void Editor::focusOverlayAt(gfx::Point point){

    const int id=topFloatingColumnAt(point);const bool dialog=pending_!=Pending::None && dialogDisplayBounds().contains(point);

    if(dialog){dialogFocus_=++overlayClock_;raiseDockWidgets();invalidate();return;}

    if(pending_==Pending::None && id>=0){for(int tab:docking_.groups[docking_.groupOf(id)].tabs)floatingFocus_[tab]=++overlayClock_;raiseFloatingAt(point);raiseDockWidgets();invalidate();}

  }

int Editor::widgetColumn(ui::Widget* w)const{

    for(int id=0;id<panels::columnCount;++id)if(w==dockingTabs_[id] || w==columnClose_[id] || w==floatingSurfaces_[id])return id;

    // Focus notifications are queued; a temporary popup may already be gone.

    // Identify only registered column widgets without dereferencing the target.

    if(w==timelineHorizontal_ || w==timelineVertical_)return 2;

    if(w==freeTileInstanceSettings_||(freeTileInstancesPanel_&&freeTileInstancesPanel_->owns(w)))return freeTileInstancesSeparate_?13:2;
    if(w==previewPanel_)return 3;
    if(referencePanel_&&referencePanel_->owns(w))return 9;
    if(tilesetPanel_&&(tilesetPanel_->owns(w)||w==tilesetDelete_))return 11;
    if(brushLibraryPanel_&&(brushLibraryPanel_->owns(w)||std::find(brushLibraryActions_.begin(),brushLibraryActions_.end(),w)!=brushLibraryActions_.end()))return 12;
    if(tabletPanel_&&tabletPanel_->owns(w))return 10;
    if(historyList_&&(w==historyList_||w==historyList_->scrollBar()||w==historySettings_))return 8;

    for(int id=4;id<8;++id){const auto& p=pickerColumns_[id];if(w==p.picker || w==p.settings || w==p.restore || w==p.primary || w==p.secondary || w==p.add || std::find(p.recent.begin(),p.recent.end(),w)!=p.recent.end())return id;}
    if(w==colorPicker_ || w==pickerScheme_ || w==pickerRestore_ || w==pickerPrimary_ || w==pickerSecondary_ || w==pickerAdd_)return 1;

    for(auto b:recentButtons_)if(w==b)return 1;

    if(w==paletteHorizontalBar_ || w==paletteGrowthHandle_ || w==paletteScrollBar_ || w==paletteSelectionOverlay_ || w==paletteActions_ || w==paletteLibrary_ || w==paletteLock_ || w==primaryRole_ || w==secondaryRole_)return 0;

    for(auto b:swatches_)if(w==b)return 0;

    for(const auto* list:{&layerRows_,&layerEyes_,&layerLocks_,&layerAutoLinks_,&frameHeaders_,&frameCells_,&timelineInactive_})for(auto b:*list)if(w==b)return 2;

    if(w==layerProperties_ || w==layerQuickSettings_ || std::find(layerQuickButtons_.begin(),layerQuickButtons_.end(),w)!=layerQuickButtons_.end())return 2;if(w==layerLabelSeparator_)return 2;return -1;

  }

bool Editor::floatingChrome(ui::Widget* w)const{for(int id=0;id<panels::columnCount;++id)if(columnFloating(id) && (w==dockingTabs_[id] || w==columnClose_[id] || (id==3 && w==previewPanel_)))return true;return false;}

void Editor::raiseFloatingAt(gfx::Point point){

    if(!docking_.custom)return;const auto geometry=columnGeometry(uiLogical(bounds()));

    for(int i=int(docking_.groups.size())-1;i>=0;--i){auto& group=docking_.groups[i];if(group.dock!=panels::Dock::Floating)continue;int active=-1;for(int tab:group.tabs)if(geometry.shown[tab])active=tab;if(active<0)continue;auto r=geometry.panel[active];if(!uiPhysical(gfx::Rect(r.x,r.y,r.w,r.h)).offset(bounds().origin()).contains(point))continue;

      if(i!=int(docking_.groups.size())-1){auto moved=group;docking_.groups.erase(docking_.groups.begin()+i);docking_.groups.push_back(std::move(moved));refresh();}break;

    }

  }

void Editor::raiseDockWidgets() {
    layoutFloatingColumnActions();

    const auto geometry=columnGeometry(uiLogical(bounds()));

    for(int id=0;id<panels::columnCount;++id)if(auto surface=floatingSurfaces_[id]){const bool show=(columnFloating(id) || (docking_.custom && columnFrameTop(id)>0))&&columnShown(id)&&id!=3;surface->setVisible(show);if(show){const auto r=geometry.panel[id];auto frame=columnFrame(id);frame.h=Layout::frame;const auto next=toDisplay(columnFloating(id)?gfx::Rect(r.x,r.y,r.w,r.h):frame);if(surface->bounds()!=next)surface->setBounds(next);}}

    if(stackedPending_!=pending_){stackedPending_=pending_;if(pending_!=Pending::None)dialogFocus_=++overlayClock_;}

    if(modalSurface_){modalSurface_->setVisible(pending_!=Pending::None);if(pending_!=Pending::None && modalSurface_->bounds()!=dialogDisplayBounds())modalSurface_->setBounds(dialogDisplayBounds());}

    auto raise=[this](ui::Widget* w){if(w && w->parent()==this)moveChildTo(w,children().back());};

    auto column=[&](int id){

      for(int tab:docking_.groups[docking_.groupOf(id)].tabs)if(tab!=id)raise(dockingTabs_[tab]);

      raise(floatingSurfaces_[id]);

      if(id==0){for(auto w:swatches_)if(!w->active)raise(w);for(auto w:swatches_)if(w->active)raise(w);raise(paletteSelectionOverlay_);raise(paletteGrowthHandle_);raise(paletteScrollBar_);raise(paletteHorizontalBar_);for(auto w:{paletteActions_,paletteLibrary_,paletteLock_,primaryRole_,secondaryRole_})raise(w);}

      if(id>=4&&id<=7){const auto& p=pickerColumns_[id];raise(p.picker);for(auto w:{p.primary,p.secondary,p.add,p.settings,p.restore})raise(w);for(auto w:p.recent)raise(w);}
      if(id==1){raise(colorPicker_);for(auto w:{pickerPrimary_,pickerSecondary_,pickerAdd_,pickerScheme_,pickerRestore_})raise(w);for(auto w:recentButtons_)raise(w);}

      if(id==2){for(const auto* list:{&layerRows_,&layerEyes_,&layerLocks_,&layerAutoLinks_,&frameHeaders_,&frameCells_,&timelineInactive_})for(auto w:*list)raise(w);raise(layerProperties_);raise(layerQuickSettings_);raise(layerLabelSeparator_);for(auto w:layerQuickButtons_)raise(w);raise(timelineHorizontal_);raise(timelineVertical_);}

      if(id==(freeTileInstancesSeparate_?13:2)){raise(freeTileInstancesPanel_);raise(freeTileInstanceSettings_);}
      if(id==3)raise(previewPanel_);
      if(id==9)raise(referencePanel_);
      if(id==10)raise(tabletPanel_);if(id==11){raise(tilesetPanel_);raise(tilesetDelete_);}if(id==12){raise(brushLibraryPanel_);for(auto b:brushLibraryActions_)raise(b);}
      if(id==8){raise(historyList_);raise(historySettings_);}

      raise(dockingTabs_[id]);if(columnFloating(id))raise(columnClose_[id]);

    };

    const auto visibility=columnVisibility();std::vector<int> overlays;

    for(const auto& group:docking_.groups)for(int id:group.tabs)if(docking_.shown(id,visibility)){if(group.dock==panels::Dock::Floating && (docking_.custom || id==3))overlays.push_back(id);else column(id);}

    if(pending_!=Pending::None)overlays.push_back(-1);

    std::stable_sort(overlays.begin(),overlays.end(),[this](int a,int b){if(a<0)return false;if(b<0)return true;return groupFocus(a)<groupFocus(b);});

    for(int id:overlays){if(id>=0)column(id);else{raise(modalSurface_);const auto controls=children();for(auto child:controls)if(modalControl(child))raise(child);}}

    // Legacy rail180, floating220+, rail with an open flyout240.
    if(toolRailFlyoutOpen_ && pending_==Pending::None){for(auto button:toolRail_)raise(button);raise(railScrollBar_);}
    if(dockFeedback_ && !dockFeedback_->hasFlags(ui::HIDDEN))raise(dockFeedback_);

  }

void Editor::beginPanelGesture(int id,const ui::MouseMessage& mouse,int edges,bool wholeGroup) {

    if(pending_!=Pending::None || (pending_==Pending::None && document.active()) || timelineGesture_.kind || panelGesture_.id>=0)return;

    if(mouse.right()){showColumnContextMenu(Column(id));return;}if(!mouse.left())return;

    pendingPanelPointer_.reset();auto& d=panelGesture_;d={};d.id=id;d.edges=edges;d.wholeGroup=wholeGroup || edges || columnFloating(id);d.origin=d.pointer=mouse.position();d.before=docking_;d.tabStart=dockingTabs_[id]->bounds();d.start=columnGeometry(uiLogical(bounds())).panel[id];

    manager()->setCapture(this,true);requestFocus();panelDockTimer_.start();

  }

void Editor::finishPanelGesture(bool cancel) {

    if(panelGesture_.id<0)return;if(!cancel)flushDockPointer();else pendingPanelPointer_.reset();const auto d=panelGesture_;panelGesture_={};panelDockTimer_.stop();if(hasCapture())releaseMouse();

    if(cancel)docking_=d.before;

    else if(!d.moved)docking_.select(d.id);

    else if(!d.edges && d.before.groups[d.before.groupOf(d.id)].dock!=panels::Dock::Floating && (d.confirmed.group>=0 || d.confirmed.dock!=panels::Dock::Floating)){

      initializeDocking();if(d.wholeGroup)docking_.placeGroup(d.id,d.confirmed.dock,d.confirmed.group,d.confirmed.after,d.confirmed.merge,d.start,d.confirmed.tabIndex);else docking_.place(d.id,d.confirmed.dock,d.confirmed.group,d.confirmed.after,d.confirmed.merge,d.start,d.confirmed.tabIndex);

    }else if(d.moved && !d.edges && (d.before.groups[d.before.groupOf(d.id)].dock!=panels::Dock::Floating || (!d.wholeGroup && d.before.groups[d.before.groupOf(d.id)].tabs.size()>1))){docking_=d.before;}

    if(!cancel && d.moved && docking_.groups[docking_.groupOf(d.id)].dock==panels::Dock::Floating)docking_.groups[docking_.groupOf(d.id)].floatingArea=floatingArea(uiLogical(bounds()));

    if(dockFeedback_)dockFeedback_->setVisible(false);

    const bool geometryOnly=d.moved && (d.edges || d.before.groups[d.before.groupOf(d.id)].dock==panels::Dock::Floating);

    if(cancel || !geometryOnly)refresh();if(!cancel)saveWorkspaceSizes();updateNavigationCursor();

  }

void Editor::tickPanelGesture() {

    flushDockPointer();

    auto& d=panelGesture_;if(d.id<0)return;if(!hasCapture()){finishPanelGesture(true);return;}

    if(!d.moved)return;

    if(!d.edges && !(d.confirmed==d.candidate) && (d.candidate.group>=0 || d.candidate.dock!=panels::Dock::Floating) && std::chrono::steady_clock::now()>=d.due){const auto previous=dockFeedbackBounds();d.confirmed=d.candidate;if(dockFeedback_)dockFeedback_->invalidateRect(previous|dockFeedbackBounds());}

  }

gfx::Rect Editor::dockGhostRect()const{

    const auto& d=panelGesture_;if(d.id<0)return {};

    const auto pointer=uiLocalPoint(d.pointer,bounds().origin());

    const int width=font_.inkBounds(dockingTabs_[d.id]->caption).w+10;

    return {pointer.x-width/2,pointer.y+uiGap,width,Layout::tabHeight};

  }

gfx::Rect Editor::dockFeedbackBounds()const{

    const auto& d=panelGesture_;if(d.id<0 || !d.moved)return {};

    auto ghost=toDisplay(dockGhostRect());

    if(d.confirmed.group>=0 || d.confirmed.dock!=panels::Dock::Floating){auto r=d.confirmed.preview;ghost|=toDisplay(gfx::Rect(r.x,r.y,r.w,r.h));}

    return ghost;

  }

void Editor::flushDockPointer(){if(!pendingPanelPointer_)return;const auto pointer=*pendingPanelPointer_;pendingPanelPointer_.reset();if(panelGesture_.id>=0 && hasCapture())updatePanelGesture(pointer);}

void Editor::moveFloatingWidgets(int id,gfx::Point delta){

    if(delta==gfx::Point())return;

    std::vector<ui::Widget*> widgets;gfx::Region oldDrawable;bool clean=true;

    const int group=docking_.groupOf(id);

    auto add=[&](ui::Widget* child){if(child && child->parent()==this && !child->hasFlags(ui::HIDDEN))widgets.push_back(child);};

    for(int column:docking_.groups[group].tabs){

      add(dockingTabs_[column]);add(floatingSurfaces_[column]);add(columnClose_[column]);

      if(column==0){add(paletteHorizontalBar_);add(paletteGrowthHandle_);add(paletteSelectionOverlay_);add(paletteScrollBar_);for(auto w:swatches_)add(w);for(auto w:{paletteActions_,paletteLibrary_,paletteLock_,primaryRole_,secondaryRole_})add(w);}

      if(column>=4&&column<=7){const auto& p=pickerColumns_[column];add(p.picker);for(auto w:{p.primary,p.secondary,p.add,p.settings,p.restore})add(w);for(auto w:p.recent)add(w);}
      if(column==1){add(colorPicker_);for(auto w:{pickerPrimary_,pickerSecondary_,pickerAdd_,pickerScheme_,pickerRestore_})add(w);for(auto w:recentButtons_)add(w);}

      if(column==2){for(const auto* list:{&layerRows_,&layerEyes_,&layerLocks_,&layerAutoLinks_,&frameHeaders_,&frameCells_,&timelineInactive_})for(auto w:*list)add(w);add(layerProperties_);add(layerQuickSettings_);add(layerLabelSeparator_);for(auto w:layerQuickButtons_)add(w);}

      if(column==2){add(timelineHorizontal_);add(timelineVertical_);}

      if(column==3)add(previewPanel_);
      if(column==9)add(referencePanel_);
      if(column==10)add(tabletPanel_);if(column==11){add(tilesetPanel_);add(tilesetDelete_);}if(column==12){add(brushLibraryPanel_);for(auto b:brushLibraryActions_)add(b);}
      if(column==8){add(historyList_);add(historySettings_);}

    }

    auto visibleRegion=[&]{gfx::Region result;

      for(auto child:widgets){gfx::Region drawable;child->getDrawableRegion(drawable,ui::Widget::kCutTopWindowsAndUseChildArea);result|=drawable;}

      // Window::getDrawableRegion cuts windows above it. Our columns are

      // sibling widgets inside one Window, so apply the same occlusion here.

      const auto geometry=columnGeometry(uiLogical(clientBounds()));

      for(int other=0;other<panels::columnCount;++other){if(!geometry.shown[other] || !columnFloating(other))continue;

        const int front=docking_.groupOf(other);if(front==group)continue;

        if(groupFocus(other)<groupFocus(id) || (groupFocus(other)==groupFocus(id) && front<group))continue;

        const auto r=geometry.panel[other];result-=gfx::Region(toDisplay(gfx::Rect(r.x,r.y,r.w,r.h)));

      }

      if(pending_!=Pending::None)result-=gfx::Region(dialogDisplayBounds());

      return result;

    };

    oldDrawable=visibleRegion();for(auto child:widgets)clean&=child->getUpdateRegion().isEmpty();

    if(std::find(widgets.begin(),widgets.end(),previewPanel_)!=widgets.end())clean&=previewPanel_->closeButton()->getUpdateRegion().isEmpty();

    gfx::Region dirty;dirty.createIntersection(oldDrawable,getUpdateRegion());clean&=dirty.isEmpty();

    if(display()){dirty.createIntersection(oldDrawable,display()->getInvalidRegion());clean&=dirty.isEmpty();}

    if(std::find(widgets.begin(),widgets.end(),paletteSelectionOverlay_)!=widgets.end()){paletteSelectionBorder_.offset(delta);for(auto& edge:paletteSelectionEdges_){edge.border.offset(delta);edge.clip.offset(delta);for(auto& piece:edge.pieces)piece.offset(delta);}}

    for(auto child:widgets)child->offsetWidgets(delta.x,delta.y);

    const auto newDrawable=visibleRegion();

    gfx::Region exposed;exposed.createSubtraction(oldDrawable,newDrawable);invalidateRegion(exposed);

    // Aseprite Window::moveWindow: copy only pixels visible at both positions.

    // GPU readback is avoided; dirty/occluded pixels take the repaint path.

    if(clean && display() && !display()->nativeWindow()->gpuAcceleration()){

      auto source=newDrawable;source.offset(-delta.x,-delta.y);gfx::Region reusable;reusable.createIntersection(oldDrawable,source);

      if(!reusable.isEmpty()){ui::move_region(display(),reusable,delta.x,delta.y);++panelBlitMoves_;}

      gfx::Region uncovered;uncovered.createSubtraction(source,reusable);uncovered.offset(delta.x,delta.y);invalidateRegion(uncovered);

    }else invalidateRegion(newDrawable);

    ++panelGeometryUpdates_;

  }

void Editor::layoutGestureColumns(int id,bool all){

    layoutPanelTabs(all?-1:id);if(all || id==0 || panels::isPicker(id))layoutPalette(all?-1:id);if(all || id==2)layoutLayers();if(all || id==13)layoutFreeTileInstancePanel();

    if(all){layoutDocumentTab();layoutToolOptions();constrainCanvas();}

    raiseDockWidgets();const auto after=columnGeometry(uiLogical(clientBounds()));

    if(all)invalidateRect(toDisplay(gfx::Rect(dockArea(uiLogical(clientBounds())).x,Layout::documentY,dockArea(uiLogical(clientBounds())).w,clientBounds().h/uiScale-Layout::documentY)));

    else {auto r=after.panel[id];invalidateRect(toDisplay(gfx::Rect(r.x,r.y,r.w,r.h)));}

    ++panelGeometryUpdates_;

  }

void Editor::updatePanelGesture(gfx::Point pointer) {

    auto& d=panelGesture_;if(d.id<0)return;const auto previousFeedback=dockFeedbackBounds();d.pointer=pointer;const auto delta=pointer-d.origin;

    if(!d.moved && std::hypot(double(delta.x),double(delta.y))<(d.edges?1:8))return;

    d.moved=true;initializeDocking();const auto rc=uiLogical(bounds());

    if(d.edges>=16){const auto resizedDock=docking_.groups[docking_.groupOf(d.id)].dock;for(auto& group:docking_.groups)if(group.dock==resizedDock)group.fixedExtent=0;const int dx=delta.x/uiScale,dy=delta.y/uiScale;

      if(d.edges==16)docking_.leftWidth=std::clamp(d.before.leftWidth+dx,96,4096);

      else if(d.edges==32)docking_.rightWidth=std::clamp(d.before.rightWidth-dx,96,4096);

      else if(d.edges==64)docking_.bottomShare=std::clamp(double(d.start.h-dy)/std::max(1,dockArea(rc).h),.1,.8);

      else if(d.neighbor>=0){const int own=docking_.groupOf(d.id);const auto geometry=d.before.layout(dockArea(rc),columnVisibility());const auto next=geometry.panel[d.before.groups[d.neighbor].active];

        if(d.edges==128){double total=0;int count=0;for(const auto& group:d.before.groups)if(group.dock==d.before.groups[own].dock){bool visible=false;for(int tab:group.tabs)visible|=columnVisibility()[tab];if(visible){total+=group.weight;++count;}}

          const double change=std::clamp(dy,std::min(0,70-d.start.h),std::max(0,next.h-70))*total/std::max(1,dockArea(rc).h-2*(count-1));docking_.groups[own].weight=d.before.groups[own].weight+change;docking_.groups[d.neighbor].weight=d.before.groups[d.neighbor].weight-change;

        }else{const int change=std::clamp(dx,std::min(0,96-d.start.w),std::max(0,next.w-96));bool ownMain=std::find(d.before.groups[own].tabs.begin(),d.before.groups[own].tabs.end(),2)!=d.before.groups[own].tabs.end();if(ownMain)docking_.groups[d.neighbor].width=std::max(96,next.w-change);else docking_.groups[own].width=std::max(96,d.start.w+change);}

      }

      layoutGestureColumns(d.id,true);return;

    }

    if(d.edges){const auto area=floatingArea(rc);const auto adjusted=resizedPanel(gfx::Rect(d.start.x,d.start.y,d.start.w,d.start.h),gfx::Point(delta.x/uiScale,delta.y/uiScale),d.edges,gfx::Rect(area.x,area.y,area.w,area.h),gfx::Size(96,70));auto& group=docking_.groups[docking_.groupOf(d.id)];const panels::Rect next{adjusted.x,adjusted.y,adjusted.w,adjusted.h};const auto previous=columnGeometry(uiLogical(clientBounds())).panel[d.id];if(previous==next)return;group.floating=next;group.floatingArea=floatingArea(rc);docking_.custom=true;layoutGestureColumns(d.id,false);invalidateRect(toDisplay(gfx::Rect(previous.x,previous.y,previous.w,previous.h)));return;}

    // Floating columns only move. Docking is an explicit context-menu action.

    if(d.before.groups[d.before.groupOf(d.id)].dock==panels::Dock::Floating){

      d.candidate={};d.confirmed={};auto& group=docking_.groups[docking_.groupOf(d.id)];

      const auto previous=columnGeometry(uiLogical(clientBounds())).panel[d.id];

      const panels::Rect next{d.start.x+delta.x/uiScale,d.start.y+delta.y/uiScale,d.start.w,d.start.h};group.floating=next;group.floatingArea=floatingArea(rc);docking_.custom=true;

      const auto positioned=columnGeometry(uiLogical(clientBounds())).panel[d.id];group.floating=positioned;

      const gfx::Point movement((positioned.x-previous.x)*uiScale,(positioned.y-previous.y)*uiScale);

      if(dockFeedback_)dockFeedback_->setVisible(false);moveFloatingWidgets(d.id,movement);return;

    }

    // Preview is evaluated against the unchanged dock layout, never the dragged one.

    auto reference=d.before;if(!reference.custom){reference=docking_;reference.custom=true;}

    auto geometry=d.before.custom?reference.layout(dockArea(rc),columnVisibility(),Layout::gap,floatingArea(rc)):columnGeometry(rc);const auto local=uiLocalPoint(pointer,bounds().origin());const int px=local.x,py=local.y;

    auto next=reference.targetAt(px,py,d.id,geometry,dockArea(rc),(d.candidate.group>=0 || d.candidate.dock!=panels::Dock::Floating)?&d.candidate:nullptr);

    if(d.wholeGroup && next.group==reference.groupOf(d.id) && !next.merge)next={};

    if(next.merge && next.group>=0){

      const auto& tabs=reference.groups[next.group].tabs;next.tabIndex=int(tabs.size());

      const auto target=geometry.panel[tabs.front()];int edge=target.x+(tabs.size()==1?5:0);

      for(int index=0;index<int(tabs.size());++index){int tab=tabs[index];if(!columnVisibility()[tab])continue;const int width=font_.inkBounds(dockingTabs_[tab]->caption).w+10;if(px<edge+width/2){next.tabIndex=index;break;}edge+=width-1;}

      next.preview={edge,target.y,std::max(14,font_.inkBounds(dockingTabs_[d.id]->caption).w+10),14};

    }

    if(!(next==d.candidate)){d.candidate=next;d.confirmed={};d.due=std::chrono::steady_clock::now()+std::chrono::milliseconds(100);}

    if(dockFeedback_){dockingTabs_[d.id]->setVisible(false);if(dockFeedback_->bounds()!=bounds())dockFeedback_->setBounds(bounds());dockFeedback_->setVisible(true);if(children().back()!=dockFeedback_)moveChildTo(dockFeedback_,children().back());dockFeedback_->invalidateRect(previousFeedback|dockFeedbackBounds());}

  }

bool Editor::dispatchPanelGesture(ui::Message* msg){if(advancedActive()&&pending_==Pending::None&&panelGesture_.id<0&&sizeDrag_==SizeDrag::None)return false;return manager()->isWidgetClickable(this) && (processLayerLabelResize(msg) || processSizeDrag(msg) || processLoopTrack(msg) || processPanelGesture(msg));}

Editor::PanelResizeHit Editor::panelResizeAt(gfx::Point point)const{
    if(advancedActive())return {};

    if(!docking_.custom || homeOpen_ || pending_!=Pending::None || document.active())return {};

    for(auto close:columnClose_)if(close && close->isVisible() && close->bounds().contains(point))return {};

    const auto geometry=columnGeometry(uiLogical(clientBounds()));

    const int floating=topFloatingColumnAt(point);

    if(floating>=0){const auto r=geometry.panel[floating];return {floating,panelResizeEdges(toDisplay(gfx::Rect(r.x,r.y,r.w,r.h)),point),-1};}

    for(int id=0;id<panels::columnCount;++id){if(!geometry.shown[id])continue;

      const auto r=geometry.panel[id];const int own=docking_.groupOf(id);const auto dock=docking_.groups[own].dock;

      auto contains=[&](gfx::Rect box){return toDisplay(box).contains(point);};

      if(dock==panels::Dock::Left && contains({r.x+r.w-1,r.y,4,r.h}))return {id,16,-1};

      if(dock==panels::Dock::Right && contains({r.x-3,r.y,4,r.h}))return {id,32,-1};

      if(dock==panels::Dock::Bottom && contains({r.x,r.y-3,r.w,4}))return {id,64,-1};

      for(int other=0;other<panels::columnCount;++other){if(!geometry.shown[other])continue;

        const int neighbor=docking_.groupOf(other);if(own==neighbor || docking_.groups[neighbor].dock!=dock)continue;

        const auto n=geometry.panel[other];const bool vertical=dock==panels::Dock::Left || dock==panels::Dock::Right;

        const bool adjacent=vertical?n.y==r.y+r.h+Layout::gap:n.x==r.x+r.w+Layout::gap;

        const auto band=vertical?gfx::Rect(r.x,r.y+r.h-1,r.w,4):gfx::Rect(r.x+r.w-1,r.y,4,r.h);

        if(dock!=panels::Dock::Floating && adjacent && contains(band))return {id,vertical?128:256,neighbor};

      }

    }

    return {};

  }

const char* Editor::panelResizeHitCursor(int edges){return edges>=16?(edges==16 || edges==32 || edges==256?"ew-resize":"ns-resize"):panelResizeCursor(edges);}

bool Editor::processPanelGesture(ui::Message* msg) {
    if(advancedActive()&&pending_==Pending::None&&panelGesture_.id<0&&sizeDrag_==SizeDrag::None)return false;

    if(panelGesture_.id>=0){

      if(msg->type()==ui::kKeyDownMessage){if(static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)finishPanelGesture(true);return true;}

      if(msg->type()==ui::kFocusLeaveMessage && !hasCapture()){finishPanelGesture(true);return false;}

      if(msg->type()==ui::kMouseMoveMessage){pendingPanelPointer_=static_cast<ui::MouseMessage*>(msg)->position();return true;}

      if(msg->type()==ui::kMouseUpMessage){updatePanelGesture(static_cast<ui::MouseMessage*>(msg)->position());tickPanelGesture();

        finishPanelGesture();return true;}

    }

    if(msg->type()!=ui::kMouseDownMessage || homeOpen_)return false;

    const auto mouse=static_cast<ui::MouseMessage*>(msg);focusOverlayAt(mouse->position());

    if(pending_!=Pending::None)return false;

    // A shared dock divider can overlap the next column's title bounds.

    // Preserve its resize route before starting a tab/title move.

    if(!docking_.custom && sizeHandleAt(mouse->position())!=SizeDrag::None)return false;

    raiseFloatingAt(mouse->position());const auto rc=uiLogical(bounds());const auto geometry=columnGeometry(rc);const int floatingHit=topFloatingColumnAt(mouse->position());

    if(mouse->left()){const auto resize=panelResizeAt(mouse->position());if(resize.edges){beginPanelGesture(resize.id,*mouse,resize.edges);panelGesture_.neighbor=resize.neighbor;return true;}}

    for(auto child:children())if(auto button=dynamic_cast<PixelButton*>(child))if(button->columnHeaderAction && button->isVisible() && button->bounds().contains(mouse->position()) && (floatingHit<0 || widgetColumn(button)==floatingHit))return false;

    for(int id=0;id<panels::columnCount;++id){auto tab=dockingTabs_[id];if(tab && !tab->hasFlags(ui::HIDDEN) && tab->isEnabled() && tab->bounds().contains(mouse->position()) && (floatingHit<0 || docking_.groupOf(id)==docking_.groupOf(floatingHit))){beginPanelGesture(id,*mouse);return true;}}

    for(int id=0;id<panels::columnCount;++id)if(columnClose_[id] && !columnClose_[id]->hasFlags(ui::HIDDEN) && columnShown(id) && (floatingHit<0 || floatingHit==id) && columnClose_[id]->bounds().contains(mouse->position()))return false;

    // The legacy independent preview owns its capture/coalesced move path.

    // Managed docked previews use the shared tab dispatcher above.

    if(!docking_.custom && previewPanel_ && columnShown(3) && previewPanel_->bounds().contains(mouse->position()))return false;

    for(int id=3;id>=0;--id){if(!geometry.shown[id] || (floatingHit>=0 && id!=floatingHit))continue;auto r=geometry.panel[id];const auto physical=toDisplay(gfx::Rect(r.x,r.y,r.w,r.h));

      if(toDisplay(gfx::Rect(r.x,r.y,r.w,16)).contains(mouse->position())){beginPanelGesture(id,*mouse,0,true);return true;}

    }

    return false;

  }

void Editor::buildColumnContextMenu(PixelMenu& menu,Column column) {

    const char32_t* names[]{U"颜色板",pickerColumnName(1),U"图层",U"预览",pickerColumnName(4),pickerColumnName(5),pickerColumnName(6),pickerColumnName(7),U"历史",U"参考图",U"数位板辅助",U"瓦片集",U"图案笔刷",U"实例图层"};

    const char* commands[]{"togglePalettePanel","toggleColorPanel","toggleLayersPanel","togglePreviewPanel"};

    auto add=[&](std::u32string title,const char* icon,std::function<void()> action={}) {

      auto item=new PixelMenuItem(font_,skin_,std::move(title));item->iconSkin=&toolIcons_;item->menuMarks=&toolIcons_;item->icon=icon;

      item->setEnabled(pending_==Pending::None && bool(action));

      if(action)item->Click.connect(action);

      menu.addChild(item);return item;

    };

    if(int(column)==2||int(column)==13){auto child=new PixelMenu(skin_);auto entry=new PixelMenuItem(font_,skin_,U"显示密度");entry->setSubmenu(child);menu.addChild(entry);const char32_t* labels[]{U"紧凑",U"常规",U"详细",U"扩展",U"大",U"超大"};for(int i=0;i<6;++i){auto item=new PixelMenuItem(font_,skin_,labels[i]);item->menuMarks=&toolIcons_;item->checked=[this,i]{return timelineDensity_==i;};item->Click.connect([this,i]{setTimelineDensity(i);});child->addChild(item);}}

    if(int(column)==13){add(U"实例图层设置","properties",[this]{showFreeTileInstancePanelSettings();});menu.addChild(new PixelMenuSeparator(skin_));}
    if(int(column)==11){auto item=add(U"清空未使用瓦片","delete",[this]{tilesetPanel_->clearUnused();});item->setEnabled(pending_==Pending::None&&tilesetPanel_&&tilesetPanel_->canManage());menu.addChild(new PixelMenuSeparator(skin_));}
    add(U"隐藏 "+std::u32string(names[int(column)])+U" 栏目","eyeOff",[this,column]{cancelStroke();if(int(column)==13){freeTileInstancesOpen_=false;refresh();}else if(int(column)==12)menuCommands_.invoke("toggleBrushLibraryPanel");else if(int(column)==11)menuCommands_.invoke("toggleTilesetPanel");else if(int(column)==10)menuCommands_.invoke("panelTabletAssist");else if(int(column)==9)menuCommands_.invoke("panelReference");else if(int(column)==8)menuCommands_.invoke("panelHistory");else if(panels::isPicker(int(column)))togglePickerColumn(int(column));else {const char* commands[]{"togglePalettePanel","toggleColorPanel","toggleLayersPanel","togglePreviewPanel"};menuCommands_.invoke(commands[int(column)]);}});

    menu.addChild(new PixelMenuSeparator(skin_));

    const char32_t* docks[]{U"停靠到左侧",U"停靠到右侧",U"停靠到底部",U"设为悬浮栏目"};

    const int current=int(docking_.groups[docking_.groupOf(int(column))].dock);

    for(int i=0;i<4;++i)add(docks[i],i==current?"check":"move",[this,column,i]{dockColumn(int(column),panels::Dock(i));});

    if(int(column)==9){menu.addChild(new PixelMenuSeparator(skin_));auto item=add(U"查看相对明暗","",[this]{referenceSession().relativeLuminance=!referenceSession().relativeLuminance;syncReferencePanels();});item->checked=[this]{return referenceSession().relativeLuminance;};}
    if(column==Column::Preview){menu.addChild(new PixelMenuSeparator(skin_));auto item=add(U"查看相对明暗","",[this]{previewPanel_->toggleRelativeLuminance();});item->checked=[this]{return previewPanel_->relativeLuminance();};}

  }

gfx::Point Editor::pointerMenuPosition(gfx::Point screenPosition) const {

    // Menu::showPopup/fit_bounds take coordinates relative to parentDisplay.

    return display()->nativeWindow()->pointFromScreen(screenPosition);

  }

void Editor::showColumnContextMenu(Column column) {

    if(pending_!=Pending::None)return;

    PixelMenu menu(skin_);buildColumnContextMenu(menu,column);menu.showPopup(pointerMenuPosition(ui::get_mouse_position()),display());

  }

PixelButton* Editor::button(std::u32string label,std::function<void()> action) {

    auto b=new DialogBackground<PixelButton>(font_,skin_,std::move(label),[this,action=std::move(action)] {

      for(auto& picker:pickerColumns_)if(picker.picker)picker.picker->finishInteraction();

      if(brushRange_) brushRange_->setVisible(false);paletteFocused_=false;action();

      if(pending_==Pending::None) requestFocus();

    }); configureDialogBackground(b);addChild(b); return b;

  }

PixelSwitch* Editor::switchButton(std::u32string label,bool checked,std::function<void(bool)> changed) {

    auto b=new DialogBackground<PixelSwitch>(font_,skin_,std::move(label),checked,[this,changed=std::move(changed)](bool value){

      for(auto& picker:pickerColumns_)if(picker.picker)picker.picker->finishInteraction();

      if(brushRange_)brushRange_->setVisible(false);paletteFocused_=false;changed(value);

      if(pending_==Pending::None)requestFocus();

    });configureDialogBackground(b);addChild(b);return b;

  }

Point Editor::canvasPoint(gfx::Point p) const {

    const auto at=canvasDocumentPoint(p);return {int(std::floor(at.x)),int(std::floor(at.y))};

  }

gfx::Rect Editor::canvasFullViewport() const {

    const auto rc=uiLogical(clientBounds()); const auto l=workspaceLayout(rc);

    if(advancedActive()){const int top=advancedMode_==1?Layout::optionsHeight+Layout::gap:0;return toDisplay(gfx::Rect(0,top,rc.w,std::max(1,rc.h-top)));}

    const auto content=l.workspaceContent();

    // Keep artwork and pan invalidation inside the inner content frame.

    return toDisplay(gfx::Rect(content.x+1,content.y+1,content.w-1,content.h-2));

  }

gfx::Rect Editor::canvasViewport() const {

    auto r=canvasFullViewport();if(!runtimePreferences_.flag("editing.canvasViewScrollbarsEnabled"))return r;

    const double a=viewRotation_.degrees*3.14159265358979323846/180;const gfx::Size b(int(std::ceil(std::abs(std::cos(a))*canvas_.w+std::abs(std::sin(a))*canvas_.h)),int(std::ceil(std::abs(std::sin(a))*canvas_.w+std::abs(std::cos(a))*canvas_.h)));const bool horizontal=b.w>r.w,vertical=b.h>r.h;

    if(vertical || b.h>r.h-(horizontal?6*uiScale:0))r.w-=6*uiScale;

    if(horizontal || b.w>r.w)r.h-=6*uiScale;

    r.w=std::max(1,r.w);r.h=std::max(1,r.h);return r;

  }

void Editor::layoutCanvasScrollBars() {

    if(!canvasHorizontal_)return;const auto r=canvasViewport(),full=canvasFullViewport();

    const auto b=canvasDisplayBounds();auto setup=[&](PixelScrollBar* bar,bool vertical){const int size=vertical?b.h:b.w,start=vertical?r.y:r.x,page=vertical?r.h:r.w,origin=vertical?b.y:b.x;

      const int upper=clampCanvasAxis(INT_MAX,start,page,size),lower=clampCanvasAxis(INT_MIN,start,page,size);

      const auto track=PixelScrollBar::gridBounds(r,vertical);if(bar->bounds()!=track)bar->setDockBounds(track);bar->configure(upper-lower+page,page,upper-origin);bar->wheelStep=24*uiScale;

      bar->setVisible(documentOpen_ && !homeOpen_ && (vertical?r.w<full.w:r.y2()<full.y2()));bar->setEnabled(pending_==Pending::None && !document.active());};

    setup(canvasHorizontal_,false);setup(canvasVertical_,true);

  }

gfx::Rect Editor::changedCanvasPixels() const {

    const auto region=document.lastContentChange();if(region.empty()) return {};if(viewRotation_.active())return canvasViewport();

    const double scale=canvasScale();

    const int left=int(std::floor(canvas_.x+region.x*scale))-1,top=int(std::floor(canvas_.y+region.y*scale))-1;

    const int right=int(std::ceil(canvas_.x+(region.x+region.w)*scale))+1,bottom=int(std::ceil(canvas_.y+(region.y+region.h)*scale))+1;

    return gfx::Rect(left,top,right-left,bottom-top)&canvasViewport();

  }

void Editor::invalidateStrokePixels(std::uint64_t before) {

    if(document.contentRevision()==before) return;

    renderer_.noteChange(document);

    if(timelineThumbnailSize()){layoutLayers();invalidateTimelineGrid();}

    if(recentDrag_.observe(recentColors_,RecentPaintKind::Draw,eraser_,strokeColor_,true)) {

      layoutPalette();const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,0);auto dock=l.pickerPanel();dock.offset(rc.x,rc.y);invalidateRect(uiPhysical(dock));

    }

    const auto area=changedCanvasPixels();if(!area.isEmpty()) invalidateRect(area);

    if(previewPanel_ && previewPanel_->isVisible()){previewPanel_->noteContentChange();previewPanel_->invalidate();}

  }

void Editor::fitCanvas() {

    const auto rc=uiLogical(bounds()); const auto l=workspaceLayout(rc);

    zoom_=std::max(1,std::min(8,std::min((l.workW-24)/document.width(),(l.workspaceContent().h-24)/document.height())));

    canvas_=uiPhysical(gfx::Rect(rc.x+l.workX+(l.workW-document.width()*zoom_)/2,

                     rc.y+l.top+(l.workspacePanel().h-document.height()*zoom_)/2,

                     document.width()*zoom_,document.height()*zoom_));

    layoutCanvasScrollBars();invalidate();

  }

void Editor::zoomCanvas(gfx::Point anchor,int direction) {

    const double next=runtimePreferences_.index("editing.wheelZoomMode.Select")==0?std::clamp(zoom_*std::pow(2.,direction/4.),.0625,64.):nextCanvasScale(zoom_,direction);

    setCanvasZoom(anchor,next);

  }

gfx::Rect Editor::statusBounds() const {const auto rc=uiLogical(clientBounds());return toDisplay(gfx::Rect(0,rc.h-Layout::statusHeight,rc.w,Layout::statusHeight));}

void Editor::setCanvasZoom(gfx::Point anchor,double next) {

    if(next==zoom_) return;

    const auto before=canvasDocumentPoint(anchor);const auto origin=zoomedCanvasOrigin({canvas_.x,canvas_.y},{anchor.x,anchor.y},canvasScale(),next*uiScale);

    zoom_=next;canvas_=gfx::Rect(origin.x,origin.y,int(std::lround(document.width()*canvasScale())),int(std::lround(document.height()*canvasScale())));

    const auto after=canvasDocumentToDisplay(before);const auto delta=viewRotation_.inverse({double(anchor.x-after.x),double(anchor.y-after.y)},{0,0});if(runtimePreferences_.index("editing.rotationIndicatorPosition.Select")==1){canvas_.x+=anchor.x-after.x;canvas_.y+=anchor.y-after.y;}else{canvas_.x+=int(std::lround(delta.x));canvas_.y+=int(std::lround(delta.y));}constrainCanvas();saveDocumentView();

    // Legacy scheduleZoomPreview reuses the content draw scheduler. Zoom is

    // view-only: repaint its viewport, scrollbar strips and percentage label.

    if(zoomFullRedraw_)invalidate();

    else{auto damage=canvasFullViewport();damage.enlarge(uiScale);invalidateRect(damage);invalidateRect(statusBounds());}

  }

void Editor::useZoomTool() {liquifyTool_=false;liquifyResetPosition_.reset();smoothTool_=false;airbrushTool_=false;rotateTool_=false;

    if(document.active() && !document.floating())return;

    if(selectionDragging_ || floatingDragging_ || shapeDragging_ || gradientDragging_ || gradientPending_ || fillDragging_ || eyedropperGesture_.active() || navigation_.zoomDragging_)return;

    textTool_=false;moveTool_=false;selectionTool_=shapeTool_=gradientTool_=fillTool_=handTool_=eraser_=eyedropperTool_=false;navigation_.zoomTool_=true;toolRowScroll_=0;refresh();updateNavigationCursor();

  }

void Editor::finishZoomTool() {navigation_.zoomDragging_=false;if(hasCapture())releaseMouse();updateNavigationCursor();}

void Editor::layoutPanelTabs(int only) {
    struct ReferenceLayout {Editor& e;~ReferenceLayout(){e.layoutReferencePanel();e.layoutHistoryPanel();e.layoutTabletPanel();e.layoutTilesetPanel();e.layoutBrushLibraryPanel();e.layoutFreeTileInstancePanel();}} referenceLayout{*this};
    struct AdvancedVisibility{Editor& e;~AdvancedVisibility(){e.applyAdvancedVisibility();}} advancedVisibility{*this};

    if(panelTabs_.empty())return;const auto rc=uiLogical(clientBounds());const auto geometry=columnGeometry(rc);

    for(int id=0;id<panels::columnCount;++id){if(only>=0 && docking_.groupOf(id)!=docking_.groupOf(only))continue;auto tab=dockingTabs_[id];if(!tab)continue;const int groupIndex=docking_.groupOf(id);const auto& group=docking_.groups[groupIndex];

      std::vector<int> tabs;for(int item:group.tabs)if(columnVisibility()[item])tabs.push_back(item);

      const bool visible=columnVisibility()[id] && (id!=3 || docking_.custom);tab->setVisible(visible && !(panelGesture_.id==id && panelGesture_.moved && !panelGesture_.edges && !columnFloating(id)));tab->setEnabled(pending_==Pending::None || columnFloating(id));if(!visible)continue;

      const auto r=geometry.panel[id];const bool single=tabs.size()==1;tab->labelOnly=single;tab->transparentLabel=columnFloating(id);tab->tab=!single;tab->active=geometry.shown[id];

      int x=r.x+(single?5:0);for(int item:tabs){if(item==id)break;x+=font_.inkBounds(dockingTabs_[item]->caption).w+9;}tab->firstTab=!tabs.empty()&&tabs.front()==id;

      const auto ink=font_.inkBounds(tab->caption);tab->setBounds(toDisplay(gfx::Rect(rc.x+x,rc.y+r.y+(single?(columnFloating(id)?(FloatingColumnChrome::headerHeight-ink.h)/2-ink.y:5-ink.y):0),single?ink.w:ink.w+10,single?10:Layout::tabHeight)));

    }

    if(previewPanel_ && (only<0 || docking_.groupOf(only)==docking_.groupOf(3))){previewPanel_->managed=docking_.custom;previewPanel_->floatingChrome=columnFloating(3);previewPanel_->frameTop=docking_.custom?columnFrameTop(3):0;if(!docking_.custom)previewPanel_->constrain(toDisplay(rc));

      if(docking_.custom){auto r=geometry.panel[3];previewPanel_->setBounds(toDisplay(gfx::Rect(rc.x+r.x,rc.y+r.y,r.w,r.h)));}

      previewPanel_->setVisible(columnShown(3));if(columnShown(3))previewPanel_->invalidate();}

    for(int id=0;id<panels::columnCount;++id)if(auto close=columnClose_[id]){

      if(only>=0 && docking_.groupOf(id)!=docking_.groupOf(only))continue;

      const bool floating=columnFloating(id) || (id==3 && !docking_.custom);

      close->setVisible(false);close->setEnabled(pending_==Pending::None || floating);

      if(id!=3){const auto r=geometry.panel[id];close->setBounds(toDisplay(FloatingColumnChrome::closeBounds({rc.x+r.x,rc.y+r.y,r.w,r.h})));}

    }

  }

int Editor::paletteActionsY(const Layout& l) const {

    return columnChrome(0).actions.y;

  }

gfx::Rect Editor::paletteContentBounds() const {

    const auto rc=uiLogical(clientBounds());const auto l=columnLayout(rc,0);

    const int y=columnChrome(0).content.y;

    return toDisplay(gfx::Rect(rc.x+l.rightX+Layout::inset,rc.y+y,l.right-2*Layout::inset,l.paletteBottom(columnShown(1))-Layout::inset-y));

  }

gfx::Rect Editor::paletteViewportBounds() const {auto r=paletteContentBounds();if(paletteScrollBar_ && paletteScrollBar_->isVisible())r.w=std::max(1,r.w-6*uiScale);if(paletteHorizontalBar_&&paletteHorizontalBar_->isVisible())r.h=std::max(1,r.h-6*uiScale);return r;}

void Editor::layoutPalette(int only) {

    const auto rc=uiLogical(clientBounds());const auto l=columnLayout(rc,0);

    if(only<0 || only==0){

    auto area=uiLogical(paletteContentBounds().offset(-bounds().origin()));

    // User correction: connected cells share a single base-pixel black edge.

    // Keep the outer cell size; adjacent bounds overlap only on that edge.

    const int cell=swatchPixels_[swatchSize_]/uiScale,step=cell-1,padding=1+uiGap;

    int rows=std::max(1,(area.h-padding*2-1)/step);

    int count=int(swatches_.size())+(paletteManual_||paletteGesture_&&paletteGesture_->moving?0:1);

    int columns=std::max(1,(area.w-padding*2-1)/step);

    if(paletteManual_){const auto fit=fitPaletteSlotsToGrid(document.palette().slots,document.palette().columns,columns);columns=fit.columns;count=int(fit.slots.size());while(count>columns&&!fit.slots[count-1])--count;if(2*padding+columns*step+1>area.w)rows=std::max(1,(area.h-6-padding*2-1)/step);}

    const bool overflow=(count+columns-1)/columns>rows;

    if(overflow){area.w=std::max(1,area.w-6);columns=std::max(1,(area.w-padding*2-1)/step);}

    if(paletteManual_){const auto fitted=fitPaletteSlotsToGrid(document.palette().slots,document.palette().columns,columns);columns=fitted.columns;if(columns!=paletteColumns_){paletteColumns_=columns;syncPaletteButtons();}}

    if(paletteGrowth_)columns=paletteGrowth_->preview.columns;

    paletteColumns_=columns;

    if(paletteScrollBar_){auto track=PixelScrollBar::edgeBounds(paletteContentBounds(),true);track.y+=uiScale;track.h=std::max(uiScale,track.h-2*uiScale);

      paletteScrollBar_->setDockBounds(track);paletteScrollBar_->wheelStep=step*uiScale;paletteScrollBar_->setVisible(columnShown(0) && overflow);paletteScrollBar_->setEnabled(pending_==Pending::None);}

    const int contentWidth=(2*padding+columns*step+1)*uiScale;const bool horizontal=paletteManual_&&contentWidth>area.w*uiScale;

    if(paletteHorizontalBar_){auto track=PixelScrollBar::edgeBounds(paletteContentBounds(),false);if(overflow)track.w=std::max(uiScale,track.w-6*uiScale);paletteHorizontalBar_->setDockBounds(track);paletteHorizontalBar_->setVisible(columnShown(0)&&horizontal);paletteHorizontalBar_->setEnabled(pending_==Pending::None);paletteHorizontalBar_->wheelStep=step*uiScale;}

    paletteScrollXPixels_=horizontal?std::clamp(paletteScrollXPixels_,0,std::max(0,contentWidth-paletteViewportBounds().w)):0;if(paletteHorizontalBar_)paletteHorizontalBar_->configure(contentWidth,paletteViewportBounds().w,paletteScrollXPixels_);

    const int contentHeight=(2*padding+((count+columns-1)/columns)*step+1)*uiScale;

    paletteScrollPixels_=overflow?std::clamp(paletteScrollPixels_,0,std::max(0,contentHeight-paletteViewportBounds().h)):0;

    if(paletteScrollBar_)paletteScrollBar_->configure(contentHeight,paletteViewportBounds().h,paletteScrollPixels_);

    if(paletteGrowthHandle_){const auto slot=paletteGrowth_?paletteGrowth_->preview.handleSlot:swatches_.size();const auto physical=toDisplay(gfx::Rect(area.x+padding+int(slot%columns)*step,area.y+padding+int(slot/columns)*step,cell,cell)).offset(0,-paletteScrollPixels_);paletteGrowthHandle_->setBounds(physical & paletteViewportBounds());paletteGrowthHandle_->setVisible(!paletteManual_&&columnShown(0)&&!(paletteGesture_&&paletteGesture_->moving)&&physical.intersects(paletteViewportBounds()));paletteGrowthHandle_->setEnabled(pending_==Pending::None);paletteGrowthHandle_->active=paletteGrowth_.has_value();}

    restorePaletteView();

    std::optional<PaletteSlotRange> manualRange;if(paletteManual_){if(paletteBoxRange_&&paletteBoxRange_->identity==document.identity())manualRange=paletteSlotRange(columns,paletteBoxRange_->start,paletteBoxRange_->end);else for(std::size_t i=0;i<paletteButtonIds_.size();++i)if(paletteButtonIds_[i]&&std::find(document.palette().selected.begin(),document.palette().selected.end(),paletteButtonIds_[i])!=document.palette().selected.end()){const auto x=i%columns,y=i/columns;if(!manualRange)manualRange=PaletteSlotRange{x,y,x,y};else{manualRange->left=std::min(manualRange->left,x);manualRange->right=std::max(manualRange->right,x);manualRange->top=std::min(manualRange->top,y);manualRange->bottom=std::max(manualRange->bottom,y);}}}const bool manualBox=manualRange.has_value();

    const bool shared=manualBox||document.palette().selected.size()>1;

    paletteSelectionBorder_={};paletteSelectionEdges_.clear();

    for(std::size_t i=0;i<swatches_.size();++i) {

      swatches_[i]->paletteSharedSelection=shared;

      const int row=int(i)/columns;

      swatches_[i]->paletteMarkerSize=swatchSize_<2?0:swatchSize_<4?1:2;

      auto cellBounds=gfx::Rect(area.x+padding+int(i%columns)*step,area.y+padding+row*step,cell,cell);

      auto physical=toDisplay(cellBounds).offset(-paletteScrollXPixels_,-paletteScrollPixels_);swatches_[i]->paletteViewport=[this]{return paletteViewportBounds();};if(swatches_[i]->active && shared)paletteSelectionBorder_=paletteSelectionBorder_.isEmpty()?physical:(paletteSelectionBorder_|physical);

      if(swatches_[i]->active && !shared)physical=skin_.selectionMaterialBounds(physical);

      const auto clipped=physical & paletteViewportBounds();

      swatches_[i]->paletteMaterialRect=gfx::Rect(physical).offset(-clipped.origin());

      swatches_[i]->setBounds(clipped);

      swatches_[i]->setVisible(columnShown(0) && paletteViewportBounds().intersects(swatches_[i]->bounds()));

    }

    if(shared&&!manualBox){

      // legacy paletteSelectionBoundaryEdges: skip neighbors within the selection,

      // merge contiguous perimeter segments before applying the shared skin.

      auto selected=[&](int i){return i>=0 && i<int(swatches_.size()) && swatches_[i]->active;};

      struct Edge {int side,line,first,last;};std::vector<Edge> edges;

      for(int i=0;i<int(swatches_.size());++i)if(selected(i)){

        const int x=i%columns,y=i/columns;

        if(!selected(i-columns))edges.push_back({0,y,x,x+1});

        if(x==columns-1 || !selected(i+1))edges.push_back({1,x+1,y,y+1});

        if(!selected(i+columns))edges.push_back({2,y+1,x,x+1});

        if(x==0 || !selected(i-1))edges.push_back({3,x,y,y+1});

      }

      std::sort(edges.begin(),edges.end(),[](auto a,auto b){return std::tie(a.side,a.line,a.first)<std::tie(b.side,b.line,b.first);});

      std::vector<Edge> merged;for(auto e:edges){if(!merged.empty() && merged.back().side==e.side && merged.back().line==e.line && merged.back().last==e.first)merged.back().last=e.last;else merged.push_back(e);}

      const auto first=swatches_.front()->paletteColorBounds();const int pitch=step*uiScale;

      for(auto e:merged){

        const bool horizontal=e.side==0 || e.side==2;gfx::Rect b;

        if(horizontal)b={first.x+e.first*pitch,first.y+(e.line-(e.side==2?1:0))*pitch,(e.last-e.first)*pitch+uiScale,cell*uiScale};

        else b={first.x+(e.line-(e.side==1?1:0))*pitch,first.y+e.first*pitch,cell*uiScale,(e.last-e.first)*pitch+uiScale};

        auto clip=skin_.selectionMaterialBounds(b);

        if(e.side==0)clip.h=b.y+uiScale-clip.y;

        if(e.side==2){const int end=clip.y2();clip.y=b.y2()-uiScale;clip.h=end-clip.y;}

        if(e.side==3)clip.w=b.x+uiScale-clip.x;

        if(e.side==1){const int end=clip.x2();clip.x=b.x2()-uiScale;clip.w=end-clip.x;}

        // At a concave endpoint this is a straight strip, not the convex

        // corner of a rectangular nine-slice. Extend its source rectangle;

        // retain the contour's original clip for the miter below.

        const int extension=4*uiScale;

        const int row=horizontal?(e.side==0?e.line:e.line-1):0;

        const int col=!horizontal?(e.side==3?e.line:e.line-1):0;

        auto at=[&](int x,int y){return x>=0 && x<columns && y>=0 && selected(y*columns+x);};

        const bool startConcave=horizontal?at(e.first-1,row):at(col,e.first-1);

        const bool endConcave=horizontal?at(e.last,row):at(col,e.last);

        if(horizontal){if(startConcave){b.x-=extension;b.w+=extension;}if(endConcave)b.w+=extension;}

        else{if(startConcave){b.y-=extension;b.h+=extension;}if(endConcave)b.h+=extension;}

        paletteSelectionEdges_.push_back({b,clip,{},e.side});

      }

      // Assign overlapping strips to the closest boundary. This forms a

      // concave miter and prevents one strip's outer black row covering the

      // other strip's white row. The same pieces drive rendering and input.

      const auto material=skin_.selectionMaterialBounds(paletteSelectionBorder_);

      // Clip strips against the actual union, including shared grid seams.

      // An extended straight strip may cross the selected interior at an

      // inward corner; those pixels belong to the colors, never the outline.

      auto occupied=[&](int px,int py){

        const int dx=px-first.x,dy=py-first.y;if(dx<0 || dy<0)return false;

        const int x=dx/pitch,y=dy/pitch;

        for(int yy=std::max(0,y-1);yy<=y;++yy)for(int xx=std::max(0,x-1);xx<=x;++xx)

          if(xx<columns && selected(yy*columns+xx) && px>=first.x+xx*pitch && px<first.x+xx*pitch+cell*uiScale && py>=first.y+yy*pitch && py<first.y+yy*pitch+cell*uiScale)return true;

        return false;

      };

      auto interior=[&](int x,int y){for(int dy=-uiScale;dy<=uiScale;dy+=uiScale)for(int dx=-uiScale;dx<=uiScale;dx+=uiScale)if(!occupied(x+dx,y+dy))return false;return true;};

      for(int y=material.y;y<material.y2();y+=uiScale){int run=-1,begin=material.x;

        auto flush=[&](int x){if(run>=0)paletteSelectionEdges_[run].pieces.push_back({begin,y,x-begin,uiScale});};

        for(int x=material.x;x<=material.x2();x+=uiScale){int winner=-1,best=100000;

          if(x<material.x2() && !interior(x,y))for(int i=0;i<int(paletteSelectionEdges_.size());++i){const auto& edge=paletteSelectionEdges_[i];if(!edge.clip.contains(gfx::Point(x,y)))continue;

            const auto& b=edge.border;const int distance=edge.side==0?b.y-y:edge.side==1?x-(b.x2()-uiScale):edge.side==2?y-(b.y2()-uiScale):b.x-x;

            if(distance>=0 && distance<best && skin_.selectionContains(skin_.selectionMaterialBounds(b),{x,y})){best=distance;winner=i;}}

          if(winner!=run){flush(x);run=winner;begin=x;}

        }

      }

    }

    if(manualBox){const auto range=*manualRange;const auto origin=toDisplay(gfx::Rect(area.x+padding,area.y+padding,1,1)).origin()-gfx::Point(paletteScrollXPixels_,paletteScrollPixels_);const gfx::Rect border(origin.x+int(range.left)*step*uiScale,origin.y+int(range.top)*step*uiScale,int(range.right-range.left)*step*uiScale+cell*uiScale,int(range.bottom-range.top)*step*uiScale+cell*uiScale);paletteSelectionBorder_=border;paletteSelectionEdges_.clear();const auto material=skin_.selectionMaterialBounds(border);paletteSelectionEdges_.push_back({border,material,{material},0});}

    if(paletteSelectionOverlay_){const bool show=shared && columnShown(0) && !paletteSelectionBorder_.isEmpty();paletteSelectionOverlay_->setVisible(show);if(show)paletteSelectionOverlay_->setBounds(skin_.selectionMaterialBounds(paletteSelectionBorder_)&paletteViewportBounds());paletteSelectionOverlay_->invalidate();}

    // Paint surrounding selection frames after neighboring color cells.

    for(auto swatch:swatches_) if(swatch->active) moveChildTo(swatch,children().back());

    if(paletteLock_) {

      paletteLock_->setBounds(toDisplay(gfx::Rect(rc.x+l.rightX+Layout::inset,rc.y+paletteActionsY(l),15,15)));

      paletteLock_->icon=paletteLocked_?"lock":"unlock";

      primaryRole_->setBounds(toDisplay(gfx::Rect(rc.x+l.rightX+Layout::inset+2*(15+uiGap),rc.y+paletteActionsY(l)+1,22,14)));

      secondaryRole_->setBounds(toDisplay(gfx::Rect(rc.x+l.rightX+Layout::inset+2*(15+uiGap)+22+uiGap,rc.y+paletteActionsY(l)+1,22,14)));

      primaryRole_->swatch=document.displayPalette().primary;secondaryRole_->swatch=document.displayPalette().secondary;

      // Palette chrome stays the same when the picker is hidden or tabbed.

      // Role color controls belong to the picker, not a fallback palette row.

      for(auto b:{paletteLock_,primaryRole_,secondaryRole_}) {b->setVisible(columnShown(0) && b==paletteLock_);b->setEnabled(pending_==Pending::None);}

    }

    if(paletteActions_) {

      const int right=rc.x+l.rightX+l.right-Layout::inset;

      paletteLibrary_->setBounds(toDisplay(gfx::Rect(right-29,rc.y+paletteActionsY(l),15,15)));

      paletteLibrary_->setVisible(columnShown(0));paletteLibrary_->setEnabled(true);

      paletteActions_->setBounds(toDisplay(gfx::Rect(right-15,rc.y+paletteActionsY(l),15,15)));

      paletteActions_->setVisible(columnShown(0));

      paletteActions_->setEnabled(pending_==Pending::None);

    }

    }

    for(int id=4;id<8;++id)if(only<0 || docking_.groupOf(id)==docking_.groupOf(only))layoutPickerColumn(id);

    if(colorPicker_ && (only<0 || only==1)) {

      auto inner=columnLayout(rc,1).pickerGradient((runtimePreferences_.flag("colorLayers.recentColorsVisible") && !recentColors_.values().empty()));inner.offset(rc.x,rc.y);inner.shrink(1);inner=toDisplay(inner);

      colorPicker_->setBounds(inner);

      colorPicker_->syncColors(document.displayPalette().primary,document.displayPalette().secondary);

      colorPicker_->setVisible(columnShown(1));

      colorPicker_->setEnabled(pending_==Pending::None);

      const auto actions=columnChrome(1).actions;pickerScheme_->setBounds(toDisplay(gfx::Rect(rc.x+actions.x2()-15,rc.y+actions.y,15,15)));pickerScheme_->setVisible(columnShown(1));pickerScheme_->setEnabled(pending_==Pending::None);pickerRestore_->setBounds(toDisplay(gfx::Rect(rc.x+actions.x2()-31,rc.y+actions.y,15,15)));pickerRestore_->setVisible(columnShown(1));pickerRestore_->setEnabled(pending_==Pending::None);

    }

    if(pickerPrimary_ && (only<0 || only==1)) {

      const auto box=columnLayout(rc,1).pickerGradient((runtimePreferences_.flag("colorLayers.recentColorsVisible") && !recentColors_.values().empty()));

      const int x=rc.x+box.x,y=rc.y+box.y2()+uiGap;

      const bool shown=columnShown(1);

      bool inPalette=false;for(int id:document.palette().slots) if(const auto entry=document.paletteEntry(id)) if(entry->color==document.palette().primary) inPalette=true;

      pickerPrimary_->setBounds(toDisplay(gfx::Rect(x,y,box.w-(inPalette?0:15+uiGap),20)));

      pickerSecondary_->setBounds(toDisplay(gfx::Rect(x,y+20+uiGap,box.w,20)));

      pickerPrimary_->swatch=document.displayPalette().primary;pickerSecondary_->swatch=document.displayPalette().secondary;

      pickerPrimary_->setVisible(shown);pickerSecondary_->setVisible(shown);

      for(auto b:{pickerPrimary_,pickerSecondary_,pickerAdd_})b->setEnabled(pending_==Pending::None);

      pickerAdd_->setBounds(toDisplay(gfx::Rect(x+box.w-15,y+(20-15)/2,15,15)));

      pickerAdd_->setVisible(shown && !inPalette);

      constexpr int recentSize=12;

      const int capacity=std::max(0,(box.w+uiGap)/(recentSize+uiGap));

      while(recentButtons_.size()<recentColors_.values().size()) {

        const auto index=recentButtons_.size();auto b=button(U"",[]{});b->paletteCell=true;b->recentColorSwatch=true;

        b->palettePress=[this,index](const ui::MouseMessage& mouse) {

          if(!mouse.left() && !mouse.right()) return;

          colorPicker_->finishInteraction();document.setPaletteRole(recentColors_.values().at(index),mouse.right(),paletteLocked_);refresh();

        };recentButtons_.push_back(b);

      }

      for(std::size_t i=0;i<recentButtons_.size();++i) {

        auto b=recentButtons_[i];const bool exists=runtimePreferences_.flag("colorLayers.recentColorsVisible") && i<recentColors_.values().size();

        if(exists) b->swatch=recentColors_.values()[i];

        b->setBounds(toDisplay(gfx::Rect(x+int(i)*(recentSize+uiGap),y+2*(20+uiGap),recentSize,recentSize)));

        b->setVisible(shown && exists && int(i)<capacity);

      }

    }

  }

std::filesystem::path Editor::palettePreferencePath() const {

    const auto base=_wgetenv(L"LOCALAPPDATA");

    if(!base) throw std::runtime_error("LOCALAPPDATA unavailable");

    return std::filesystem::path(base)/L"MoonSprite"/L"Native"/L"palette-swatch-size.txt";

  }

const char* Editor::modalSizeKey(Pending action) {

    // Persistent keys must not depend on enum ordinals: new dialogs used to

    // shift existing names and read beyond the old eleven-entry array.

    switch(action){

      case Pending::None:return "none";case Pending::New:return "new";

      case Pending::Open:return "open";case Pending::OpenError:return "error";

      case Pending::Close:return "close";case Pending::CloseDocument:return "close-document";

      case Pending::Preferences:return "preferences";

      case Pending::LayerOpacity:return "layer-opacity";case Pending::FrameDuration:return "frame-duration";

      case Pending::LoopSection:return "loop";case Pending::OnionValue:return "onion";

      case Pending::PaletteName:return "palette-name";case Pending::ColorRole:return "color-role";

      case Pending::AntiAlias:return "anti-alias";case Pending::Convolution:return "convolution";case Pending::PaletteSave:return "palette-save";case Pending::PaletteExtract:return "palette-extract";case Pending::ColorAdjustment:return "color-adjustment";

      case Pending::ReplaceColor:return "replace-color";case Pending::ImageResize:return "image-resize";

      case Pending::BrushFolderName:return "brush-folder-name";case Pending::StaticExport:return "static-export";

      case Pending::SpriteSheet:return "sprite-sheet";case Pending::GifExport:return "gif-export";

      case Pending::SheetImport:return "sheet-import";

    }

    return "none";

  }

void Editor::writeWorkspaceSizes(std::ostream& out) const {

    out.precision(17);out<<"moonsprite-workspace-sizes-v1\n";

    out<<"dock "<<dockWidth_<<' '<<paletteShare_<<' '<<timelineHeight_<<'\n';

    if(previewPanel_) {const auto r=previewPanel_->bounds();out<<"preview "<<r.x<<' '<<r.y<<' '<<r.w<<' '<<r.h<<'\n';}

    for(const auto& item:modalGeometry_) {const auto r=item.second;out<<"modal "<<modalSizeKey(item.first)<<' '<<r.x<<' '<<r.y<<' '<<r.w<<' '<<r.h<<'\n';}

  }

void Editor::saveWorkspaceSizes() {
    queueWorkspacePresetSave();

    if(smoke_)return;

    try {

      const auto path=palettePreferencePath().parent_path()/"workspace-sizes.txt";std::filesystem::create_directories(path.parent_path());

      std::ofstream out(path);writeWorkspaceSizes(out);

      out.close();if(!out)throw std::runtime_error("Cannot save workspace sizes");

      std::ofstream panelsOut(path.parent_path()/"workspace-panels.txt");docking_.write(panelsOut);panelsOut<<palettePanelOpen_<<' '<<colorPickerOpen_<<' '<<layersPanelOpen_<<' '<<previewPanelOpen_<<'\n';panelsOut<<"picker-columns-v1";for(int id=4;id<8;++id)panelsOut<<' '<<pickerOpen_[id];panelsOut<<'\n';panelsOut.close();if(!panelsOut)throw std::runtime_error("Cannot save panel docking");

    }catch(const std::exception& e){status_=U"栏目尺寸保存失败："+unicodeText(e.what());}

  }

void Editor::onResize(ui::ResizeEvent& ev) {

    restoreAdvancedVisibility();
    const auto oldView=canvasViewport();const bool positioned=!canvas_.isEmpty();const auto previousWindow=floatingArea(uiLogical(bounds()));

    setBoundsQuietly(ev.bounds());const auto rc=uiLogical(bounds());

    const auto nextWindow=floatingArea(rc);const bool viewportChanged=previousWindow.w>0 && previousWindow.h>0 && !(previousWindow==nextWindow);

    if(viewportChanged && !advancedActive())docking_.resizeFloating(previousWindow,nextWindow);

    const auto l=workspaceLayout(rc);

    if(positioned){const auto nextView=canvasViewport();const auto delta=nextView.center()-oldView.center();canvas_.offset(delta);

      if(navigation_.pan_.active){navigation_.pan_.origin.x+=delta.x;navigation_.pan_.origin.y+=delta.y;}}

    const int actionGroupWidth=4*textControlHeight-3;

    const int actionWidth=actionGroupWidth+4+48;

    layoutTopMenu(uiPhysical(gfx::Rect(rc.x+uiGap,rc.y,rc.w-2*uiGap-actionWidth,Layout::menuHeight)));

    for(int i=0;i<5;++i)if(topActions_[i])topActions_[i]->setBounds(uiPhysical(gfx::Rect(rc.x+rc.w-uiGap-actionWidth+(i<4?i*(textControlHeight-1):actionGroupWidth+4),rc.y+(Layout::menuHeight-textControlHeight)/2,i==4?48:textControlHeight,textControlHeight)));

    layoutToolOptions();

    layoutToolRail();

    layoutPanelTabs();

    layoutDocumentTab();

    layoutPalette();layoutLayers();panelScrollDrag_.resized();

    if(canvas_.isEmpty()) fitCanvas();

    layoutCanvasScrollBars();layoutModal();raiseDockWidgets();applyHomeVisibility();if(pending_==Pending::Preferences)layoutPreferences(modalBounds(uiLogical(clientBounds())));

    applyAdvancedVisibility();
    if(viewportChanged && !advancedActive() && !smoke_ && previewPanel_)floatingViewportSaveTimer_.start();

  }

const char32_t* Editor::pickerColumnName(int id){switch(id){case 4:return U"月环";case 5:return U"色相／饱和度平面";case 6:return U"色轮";case 7:return U"切线空间法线球";default:return U"饱和度／明度";}}
ColorPickerScheme Editor::pickerColumnScheme(int id){switch(id){case 4:return ColorPickerScheme::MoonRing;case 5:return ColorPickerScheme::HsSquare;case 6:return ColorPickerScheme::Wheel;case 7:return ColorPickerScheme::NormalMap;default:return ColorPickerScheme::SvSquare;}}
void Editor::togglePickerColumn(int id){
  auto& p=pickerColumns_[id];p.picker->finishInteraction();bool& visible=id==1?colorPickerOpen_:pickerOpen_[id];visible=!visible;
  if(visible){initializeDocking();docking_.custom=true;docking_.select(id);}refresh();saveWorkspaceSizes();
}
void Editor::setupDefaultPickerGroup(){
  initializeDocking();docking_.custom=true;docking_.leftWidth=std::max(docking_.leftWidth,220);
  if(docking_.groups[docking_.groupOf(1)].tabs.size()>1)docking_.place(1,panels::Dock::Left);
  for(int id:{4,5})docking_.place(id,docking_.groups[docking_.groupOf(1)].dock,docking_.groupOf(1),true,true);
  auto& group=docking_.groups[docking_.groupOf(1)];group.tabs={1,4,5};group.active=1;
  pickerOpen_[4]=pickerOpen_[5]=true;pickerOpen_[6]=pickerOpen_[7]=false;colorPickerOpen_=true;
}
void Editor::createExtraPickerColumns(){
  for(int id=4;id<8;++id){auto& p=pickerColumns_[id];
    auto picker=new DialogBackground<NativeColorPicker>(font_,skin_,assets_/"color-picker");configureDialogBackground(picker);p.picker=picker;addChild(picker);picker->setVisible(false);picker->setScheme(pickerColumnScheme(id));picker->setMoonField(colorPicker_->moonField());picker->setQuantization(colorPicker_->quantization());
    picker->changed=[this](Pixel color,bool secondary){document.setPaletteRole(color,secondary,paletteLocked_);refresh();};
    picker->interactionBegin=[this]{if(!gradientPending_)cancelStroke();paletteFocused_=false;};
    p.restore=button(U"",[this,id]{restorePickerSquare(id);});p.restore->iconSkin=&toolIcons_;p.restore->icon="paletteCenter";
    p.settings=button(U"",[this,id]{auto& p=pickerColumns_[id];p.picker->finishInteraction();auto at=p.settings->bounds();showColorPickerSchemeMenu(font_,skin_,toolIcons_,p.picker->scheme(),{at.x,at.y2()},display(),{},p.picker->moonField(),[this,id](PickerMoonField f){pickerColumns_[id].picker->setMoonField(f);if(!smoke_&&pickerMoonFieldReadable_)try{saveColorPickerMoonField(palettePreferencePath().parent_path()/"color-picker-moon-field-v1.txt",f);}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();},p.picker->quantization(),[this,id](PickerQuantization q){for(auto& column:pickerColumns_)if(column.picker)column.picker->setQuantization(q);if(!smoke_&&pickerQuantizationReadable_)try{saveColorPickerQuantization(palettePreferencePath().parent_path()/"color-picker-quantization-v1.txt",q);}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();},false);requestFocus();});p.settings->iconSkin=&toolIcons_;p.settings->icon="moreLines";
    p.primary=button(U"",[this]{showRoleColorEditor(false);});p.primary->colorRole=true;
    p.secondary=button(U"",[this]{showRoleColorEditor(true);});p.secondary->colorRole=true;
    p.add=button(U"",[this]{document.addPaletteColor(document.palette().primary,paletteLocked_);refresh();});p.add->iconSkin=&toolIcons_;p.add->icon="plus";
    columnClose_[id]=button(U"",[this,id]{togglePickerColumn(id);});columnClose_[id]->iconSkin=&toolIcons_;columnClose_[id]->icon="close";columnClose_[id]->skinStyle="icon_button";columnClose_[id]->setVisible(false);
  }
}
void Editor::layoutPickerColumn(int id){
  auto& p=pickerColumns_[id];if(!p.picker)return;const auto rc=uiLogical(clientBounds());const auto box=columnLayout(rc,id).pickerGradient(runtimePreferences_.flag("colorLayers.recentColorsVisible")&&!recentColors_.values().empty());auto inner=box;inner.offset(rc.x,rc.y);inner.shrink(1);p.picker->setBounds(toDisplay(inner));p.picker->syncColors(document.displayPalette().primary,document.displayPalette().secondary);
  const bool shown=columnShown(id);p.picker->setVisible(shown);p.picker->setEnabled(pending_==Pending::None);const auto actions=columnChrome(id).actions;
  p.settings->setBounds(toDisplay({rc.x+actions.x2()-15,rc.y+actions.y,15,15}));p.restore->setBounds(toDisplay({rc.x+actions.x2()-31,rc.y+actions.y,15,15}));
  const int x=rc.x+box.x,y=rc.y+box.y2()+uiGap;bool inPalette=false;for(int slot:document.palette().slots)if(auto entry=document.paletteEntry(slot))inPalette|=entry->color==document.palette().primary;
  p.primary->setBounds(toDisplay({x,y,box.w-(inPalette?0:15+uiGap),20}));p.secondary->setBounds(toDisplay({x,y+22,box.w,20}));p.add->setBounds(toDisplay({x+box.w-15,y+2,15,15}));p.primary->swatch=document.displayPalette().primary;p.secondary->swatch=document.displayPalette().secondary;
  for(auto b:{p.settings,p.restore,p.primary,p.secondary,p.add}){b->setVisible(shown);b->setEnabled(pending_==Pending::None);}p.add->setVisible(shown&&!inPalette);
  while(p.recent.size()<recentColors_.values().size()){auto index=p.recent.size();auto b=button(U"",[]{});b->paletteCell=true;b->recentColorSwatch=true;b->palettePress=[this,id,index](const ui::MouseMessage& m){if(!m.left()&&!m.right())return;pickerColumns_[id].picker->finishInteraction();document.setPaletteRole(recentColors_.values().at(index),m.right(),paletteLocked_);refresh();};p.recent.push_back(b);}
  for(std::size_t i=0;i<p.recent.size();++i){auto b=p.recent[i];bool exists=runtimePreferences_.flag("colorLayers.recentColorsVisible")&&i<recentColors_.values().size();if(exists)b->swatch=recentColors_.values()[i];b->setBounds(toDisplay({x+int(i)*14,y+44,12,12}));b->setVisible(shown&&exists&&int(i)<(box.w+2)/14);b->setEnabled(pending_==Pending::None);}
}


void Editor::compositeControl(ui::Widget& widget,ui::PaintEvent& ev,const std::function<void()>& paint){
      const int id=widgetColumn(&widget);

      auto& g=*ev.graphics();g.saveClip();

      // Sibling columns share a native Window. Apply Window-style occlusion

      // to independent child repaints as well as the column background.

      gfx::Region visible(widget.clientBounds());const auto geometry=columnGeometry(uiLogical(clientBounds()));

      for(int other=0;other<panels::columnCount;++other){if(!geometry.shown[other] || !columnFloating(other))continue;

        if(id>=0 && docking_.groupOf(other)==docking_.groupOf(id))continue;

        if(id>=0 && columnFloating(id) && (groupFocus(other)<groupFocus(id) || (groupFocus(other)==groupFocus(id) && docking_.groupOf(other)<docking_.groupOf(id))))continue;

        if(modalControl(&widget))continue;

        const auto r=geometry.panel[other];visible-=gfx::Region(widget.toClient(toDisplay(gfx::Rect(r.x,r.y,r.w,r.h))));

      }

      g.clipRegion(visible);

      auto paintControl=[&]{

        if((&widget==canvasHorizontal_ || &widget==canvasVertical_) && pending_==Pending::None){

          auto clip=visible;clip&=gfx::Region(g.getClipBounds());clip.offset(widget.bounds().origin()-bounds().origin());

          ui::Graphics background(g.display(),base::AddRef(g.getInternalSurface()),bounds().x,bounds().y);

          background.saveClip();background.clipRegion(clip);paintCanvasBackdrop(background);paintCanvas(background);background.restoreClip();

          paint();return;

        }

        if(auto cell=dynamic_cast<TimelineButton*>(&widget);cell && cell->timelineParentPainted && !widget.isTransparent()){

          auto clip=visible;clip&=gfx::Region(g.getClipBounds());clip.offset(widget.bounds().origin()-bounds().origin());

          ui::Graphics background(g.display(),base::AddRef(g.getInternalSurface()),bounds().x,bounds().y);

          background.saveClip();background.clipRegion(clip);

          const auto ll=columnLayout(uiLogical(clientBounds()),2);

          auto area=toDisplay(gfx::Rect(ll.workX,ll.layerTop+35,ll.workW,ll.bottom-ll.layerTop-35));area.offset(-bounds().origin());

          paintTimelineCached(background,ll,area);background.restoreClip();return;

        }

        if(auto bar=dynamic_cast<PixelScrollBar*>(&widget);bar && bar->translucent()){

          auto clip=visible;clip&=gfx::Region(g.getClipBounds());

          if(pending_!=Pending::None && !modalControl(&widget))clip-=gfx::Region(widget.toClient(dialogDisplayBounds()));

          clip.offset(widget.bounds().origin()-bounds().origin());

          ui::Graphics background(g.display(),base::AddRef(g.getInternalSurface()),bounds().x,bounds().y);

          background.saveClip();background.clipRegion(clip);

          const auto ll=columnLayout(uiLogical(clientBounds()),2);

          auto area=toDisplay(gfx::Rect(ll.workX,ll.layerTop+35,ll.workW,ll.bottom-ll.layerTop-35));area.offset(-bounds().origin());

          if(id==2 && pending_==Pending::None && !columnFloating(2) && area.contains(background.getClipBounds()))paintTimelineCached(background,ll,area);

          else{paintChrome(background,true);paintTimelineGrid(background);}

          background.restoreClip();

        }

        paint();

      };

      if(pending_==Pending::None || modalControl(&widget)){paintControl();g.restoreClip();return;}

      const auto modal=dialogDisplayBounds();

      gfx::Region outside(widget.clientBounds());outside-=gfx::Region(widget.toClient(modal));

      g.saveClip();g.clipRegion(outside);paintControl();g.restoreClip();

      gfx::Region overlap(g.getClipBounds());overlap&=gfx::Region(widget.toClient(modal));

      for(auto child:children())if(child->isVisible() && modalControl(child))overlap-=gfx::Region(widget.toClient(child->bounds()));

      overlap.offset(widget.bounds().origin()-bounds().origin());

      ui::Graphics dialogGraphics(g.display(),base::AddRef(g.getInternalSurface()),bounds().x,bounds().y);

      dialogGraphics.saveClip();dialogGraphics.clipRegion(overlap);paintDialog(dialogGraphics);dialogGraphics.restoreClip();

      g.restoreClip();

}

TimelineButton* Editor::timelineButton(std::u32string label,std::function<void()> action){
  auto control=new DialogBackground<TimelineButton>(font_,skin_,std::move(label),std::move(action));
  configureDialogBackground(control);addChild(control);return control;
}
void Editor::layoutFloatingColumnActions(){
  for(int id=0;id<panels::columnCount;++id){
    std::vector<PixelButton*> actions;
    if(id==0)actions={paletteLock_,paletteLibrary_,paletteActions_};
    else if(panels::isPicker(id)){const auto& p=pickerColumns_[id];actions={p.restore,p.settings};}
    else if((id==13&&freeTileInstancesSeparate_)||(id==2&&integratedFreeTileInstances()))actions={freeTileInstanceSettings_};
    else if(id==8)actions={historySettings_};
    else if(id==11)actions={tilesetDelete_};else if(id==12)actions.assign(brushLibraryActions_.begin(),brushLibraryActions_.end());
    else if(id==2){for(auto b:timelineInactive_)if(b && b->isVisible())actions.push_back(b);for(auto b:layerQuickButtons_)if(b && b->isVisible())actions.push_back(b);if(layerQuickSettings_)actions.push_back(layerQuickSettings_);if(layerProperties_ && layerProperties_->isVisible())actions.push_back(layerProperties_);}
    const bool floating=columnFloating(id);auto frame=columnFrame(id);int right=frame.x2()-5;
    for(auto it=actions.rbegin();it!=actions.rend();++it){auto b=*it;if(!b)continue;b->columnHeaderAction=floating;if(floating){right-=15;b->setBounds(toDisplay({right,frame.y+FloatingColumnChrome::actionTop,15,15}));right-=uiGap;}}
    if(floating && dockingTabs_[id]){auto tab=dockingTabs_[id];auto r=tab->bounds();r.w=std::min(r.w,std::max(0,toDisplay({right,frame.y,1,1}).x-r.x));tab->setBounds(r);}
    if(columnClose_[id])columnClose_[id]->setVisible(false);
  }
}

}
