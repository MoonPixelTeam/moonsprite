#include "editor_implementation.h"
#include "editor.h"

namespace moon::editor {

void Editor::syncPaletteButtons() {

    auto ids=paletteGrowth_?paletteGrowth_->preview.slots:paletteGesture_ && paletteGesture_->moving && paletteGesture_->active?Document::movedPaletteSlots(paletteGesture_->slots,paletteGesture_->ids,int(paletteGesture_->last),paletteGesture_->anchor,paletteGesture_->columns):paletteViewSlots();if(paletteManual_){auto count=ids.size();while(count>std::size_t(paletteColumns_)&&!ids[count-1])--count;ids.resize(count);}

    while(swatches_.size()<ids.size()) {

      const auto index=swatches_.size();auto b=button(U"",[this,index]{selectSwatch(index,false,false,false);});

      b->paletteCell=true;

      b->paletteRepaint=[this]{invalidateRect(paletteContentBounds());};

      // Shared edges may route mouse messages to the neighboring color cell.

      // Selection hover follows the full surrounding frame, not widget focus.

      b->paletteSelectionHover=[this,b]{return paletteMousePosition_ && b->paletteSelectionContains(*paletteMousePosition_);};

      b->palettePress=[this,index](const ui::MouseMessage& mouse){beginPalettePointer(index,mouse);};

      b->doubleClickLeftOnly=true;

      b->doubleClick=[this,index]{

        const int id=paletteButtonIds_[index];cancelStroke();

        if(!id) {if(paletteManual_)addManualPaletteColor(index);else {document.addPaletteColor(ink_,paletteLocked_,index<document.palette().slots.size()?std::optional<std::size_t>(index):std::nullopt);refresh();}}

        else openPaletteEditor(id,false);

      };

      b->hover=[this,index]{const auto entry=document.paletteEntry(paletteButtonIds_[index]);status_=entry?entry->name:U"双击空槽添加前景色";invalidate();};

      swatches_.push_back(b);

    }

    while(swatches_.size()>ids.size()) {delete swatches_.back();swatches_.pop_back();}

    paletteButtonIds_=std::move(ids);

    const auto& palette=document.palette();

    auto roleId=[&](int preferred,Pixel color) {

      const auto chosen=document.paletteEntry(preferred);

      if(chosen && chosen->color==color && std::find(palette.slots.begin(),palette.slots.end(),preferred)!=palette.slots.end()) return preferred;

      for(const int id:palette.slots) if(const auto entry=document.paletteEntry(id)) if(entry->color==color) return id;

      return 0;

    };

    const int foregroundId=roleId(palette.primaryId,palette.primary),backgroundId=roleId(palette.secondaryId,palette.secondary);

    for(std::size_t i=0;i<swatches_.size();++i) {

      const auto entry=document.displayPaletteEntry(paletteButtonIds_[i]);swatches_[i]->swatch=paletteButtonIds_[i]<0?0xff000000:entry?entry->color:0;

      swatches_[i]->paletteDisplayName=showPaletteNames_ && entry && std::any_of(entry->name.begin(),entry->name.end(),[](char32_t c){return !javascriptWhitespace(c);})?entry->name:U"";

      swatches_[i]->foregroundMarker=entry && entry->id==foregroundId;

      swatches_[i]->backgroundMarker=entry && entry->id==backgroundId;

      const auto& selected=document.palette().selected;

      swatches_[i]->active=std::find(selected.begin(),selected.end(),paletteButtonIds_[i])!=selected.end();

    }

    if(document.palette().primary!=lastPaletteInk_) {lastPaletteInk_=document.palette().primary;ink_=lastPaletteInk_;}

  }

bool Editor::paletteOutlineContains(gfx::Point point)const {

    if(!paletteViewportBounds().contains(point))return false;

    for(const auto& edge:paletteSelectionEdges_)if(std::any_of(edge.pieces.begin(),edge.pieces.end(),[&](auto r){return r.contains(point);}) && skin_.selectionContains(skin_.selectionMaterialBounds(edge.border),point))return true;

    return false;

  }

std::size_t Editor::paletteSlotAt(gfx::Point point) const {

    const auto first=swatches_.empty()?paletteGrowthHandle_->bounds():swatches_.front()->paletteColorBounds();const auto origin=first.origin();const int step=(swatchPixels_[swatchSize_]/uiScale-1)*uiScale;

    const int x=std::clamp((point.x-origin.x)/step,0,paletteColumns_-1),y=std::max(0,int(std::floor(double(point.y-origin.y)/step)));

    return std::size_t(y*paletteColumns_+x);

  }

void Editor::beginPaletteGrowth(const ui::MouseMessage& mouse){

    if(paletteManual_||!mouse.left()||pending_!=Pending::None||eyedropperTool_||eyedropperHeld_||mouse.altPressed()||paletteGesture_||paletteGrowth_)return;

    paletteFocused_=true;requestFocus();document.clearPaletteSelection();paletteBoxRange_.reset();paletteFocusedSlot_.reset();const auto base=document.palette().order();paletteGrowth_=PaletteGrowthGesture{document.identity(),base,paletteGrowthPreview(base,paletteColumns_,base.size())};captureMouse();updateNavigationCursor();refresh();

  }

void Editor::updatePaletteGrowth(gfx::Point point){if(!paletteGrowth_)return;auto& g=*paletteGrowth_;g.preview=paletteGrowthPreview(g.base,g.preview.columns,paletteSlotAt(point));refresh();updateNavigationCursor();}

void Editor::finishPaletteGrowth(bool cancel){if(!paletteGrowth_)return;const auto g=std::move(*paletteGrowth_);paletteGrowth_.reset();if(hasCapture())releaseMouse();if(!cancel&&g.identity==document.identity()){if(!g.preview.removedIds.empty())document.deletePaletteColors(g.preview.removedIds);else if(g.preview.added){std::vector<std::size_t> indices;for(std::size_t i=g.base.size();i<g.preview.handleSlot;++i)indices.push_back(i);document.pastePaletteColors(std::vector<Pixel>(g.preview.added,0xff000000),indices,false,&g.base);}}updateNavigationCursor();refresh();}

void Editor::beginPalettePointer(std::size_t index,const ui::MouseMessage& mouse) {

    if(!mouse.left() && !mouse.right())return;

    const auto beforeView=capturePaletteView();paletteFocusedSlot_=index;

    bool outline=paletteSelectionOverlay_ && paletteSelectionOverlay_->isVisible() && paletteOutlineContains(mouse.position());

    int anchor=0;

    if(outline){double nearest=1e30;for(std::size_t i=0;i<swatches_.size();++i)if(swatches_[i]->active){const auto c=swatches_[i]->paletteColorBounds().center();double distance=double(c.x-mouse.position().x)*(c.x-mouse.position().x)+double(c.y-mouse.position().y)*(c.y-mouse.position().y);if(distance<nearest){nearest=distance;anchor=paletteButtonIds_[i];}}}

    for(std::size_t i=0;i<swatches_.size();++i)if(swatches_[i]->isVisible() && swatches_[i]->active && swatches_[i]->paletteSelectionContains(mouse.position())){outline=true;anchor=paletteButtonIds_[i];break;}

    const auto selected=document.palette().selected;const int id=index<paletteButtonIds_.size()?paletteButtonIds_[index]:0;

    const bool moving=!mouse.shiftPressed() && !mouse.ctrlPressed() && !mouse.cmdPressed() &&

      (mouse.right()?std::find(selected.begin(),selected.end(),id)!=selected.end():outline);

    if(moving){paletteFocused_=true;requestFocus();}

    else selectSwatch(index,mouse.ctrlPressed()||mouse.cmdPressed(),mouse.shiftPressed(),mouse.right());

    if(mouse.shiftPressed() || mouse.ctrlPressed() || mouse.cmdPressed())return;

    paletteGesture_=PaletteGesture{index,index,moving?(mouse.right()?id:(anchor?anchor:id)):id,paletteColumns_,mouse.right(),moving,false,mouse.position(),paletteViewSlots(),selected,std::chrono::steady_clock::now(),beforeView};

    captureMouse();

  }

void Editor::updatePalettePointer(gfx::Point point) {

    if(!paletteGesture_)return;auto& g=*paletteGesture_;if(paletteManual_){if(g.moving&&!paletteViewportBounds().contains(point))return;if(!g.moving)point.y=std::min(point.y,paletteViewportBounds().y2()-1);}g.last=paletteSlotAt(point);

    const int dx=point.x-g.origin.x,dy=point.y-g.origin.y;

    if(!g.active && (dx*dx+dy*dy>=4 || (!g.secondary && !g.moving && std::chrono::steady_clock::now()-g.began>=std::chrono::milliseconds(360))))g.active=true;

    if(g.moving){if(g.beforeView.box){const auto range=paletteSlotRange(g.columns,g.beforeView.box->first,g.beforeView.box->second);const auto anchor=std::find(g.slots.begin(),g.slots.end(),g.anchor);if(anchor!=g.slots.end()){const int slot=int(anchor-g.slots.begin()),dx=std::clamp(int(g.last)%g.columns-slot%g.columns,-int(range.left),g.columns-1-int(range.right)),dy=std::max(-int(range.top),int(g.last)/g.columns-slot/g.columns),delta=dy*g.columns+dx;g.last=std::size_t(slot+delta);paletteBoxRange_=PaletteBoxRange{document.identity(),std::size_t(int(g.beforeView.box->first)+delta),std::size_t(int(g.beforeView.box->second)+delta),g.ids};}}refresh();return;} // Preview only; commit one transaction on release.

    if(g.secondary){if(g.last<g.slots.size())document.selectSecondaryPalette(g.slots[g.last]);}

    else if(g.active){document.selectPaletteBox(g.start,g.last,g.columns,&g.slots);if(paletteManual_)paletteBoxRange_=PaletteBoxRange{document.identity(),g.start,g.last,document.palette().selected};}

    refresh();

  }

void Editor::finishPalettePointer(bool cancel) {

    if(!paletteGesture_)return;const auto gesture=*paletteGesture_;paletteGesture_.reset();if(hasCapture())releaseMouse();

    if(cancel&&gesture.beforeView.box)paletteBoxRange_=PaletteBoxRange{document.identity(),gesture.beforeView.box->first,gesture.beforeView.box->second,document.palette().selected};

    if(!cancel && !gesture.moving && !gesture.secondary && gesture.active)paletteBoxRange_=PaletteBoxRange{document.identity(),gesture.start,gesture.last,document.palette().selected};

    if(!cancel && gesture.moving){if(gesture.active){const auto history=document.revision();document.repositionPaletteColors(gesture.slots,gesture.ids,int(gesture.last),gesture.anchor,gesture.columns,paletteManual_);if(paletteManual_&&document.revision()!=history)document.annotatePaletteView(gesture.beforeView,capturePaletteView());}else if(gesture.secondary)document.selectSecondaryPalette(gesture.anchor);}

    refresh();

  }

void Editor::copyPaletteColors() {

    PaletteClipboardData data;const auto slots=paletteViewSlots();std::vector<int> ids;for(int id:slots)if(id&&std::find(document.palette().selected.begin(),document.palette().selected.end(),id)!=document.palette().selected.end())if(const auto entry=document.paletteEntry(id)){ids.push_back(id);data.colors.push_back(entry->color);}if(data.colors.empty())return;

    if(paletteManual_){std::optional<PaletteSlotRange> range;if(paletteBoxRange_&&paletteBoxRange_->identity==document.identity())range=paletteSlotRange(paletteColumns_,paletteBoxRange_->start,paletteBoxRange_->end);else for(std::size_t i=0;i<slots.size();++i)if(std::find(ids.begin(),ids.end(),slots[i])!=ids.end()){if(!range)range=PaletteSlotRange{i%paletteColumns_,i/paletteColumns_,i%paletteColumns_,i/paletteColumns_};else{range->left=std::min(range->left,i%paletteColumns_);range->right=std::max(range->right,i%paletteColumns_);range->top=std::min(range->top,i/paletteColumns_);range->bottom=std::max(range->bottom,i/paletteColumns_);}}if(range){data.columns=int(range->right-range->left+1);for(auto y=range->top;y<=range->bottom;++y)for(auto x=range->left;x<=range->right;++x){const auto i=y*paletteColumns_+x;const auto found=i<slots.size()?std::find(ids.begin(),ids.end(),slots[i]):ids.end();data.slots.push_back(found==ids.end()?std::nullopt:std::optional<std::size_t>(found-ids.begin()));}}}

    paletteClipboard_=data.colors;paletteClipboardLayout_=data;if(!clip::set_text(encodePaletteClipboard(data)))status_=U"颜色已复制到内部剪贴板，系统剪贴板不可用";refresh();

  }

void Editor::pastePaletteColors() {

    PaletteClipboardData data=paletteClipboardLayout_;if(data.colors!=paletteClipboard_){data={};data.colors=paletteClipboard_;}std::string text;if(clip::get_text(text)&&text.size()<=4*1024*1024)if(auto parsed=parsePaletteClipboard(text))data=std::move(*parsed);if(data.colors.empty())return;

    auto slots=paletteViewSlots();int columns=paletteColumns_;const auto before=capturePaletteView();auto after=before;std::vector<std::size_t> targets;const auto& selected=document.palette().selected;const bool bounded=paletteManual_&&paletteBoxRange_&&paletteBoxRange_->identity==document.identity();if(bounded)targets=paletteGradientSlots();else for(std::size_t i=0;i<slots.size();++i)if(slots[i]&&std::find(selected.begin(),selected.end(),slots[i])!=selected.end())targets.push_back(i);if(targets.empty()&&paletteFocusedSlot_)targets.push_back(*paletteFocusedSlot_);

    auto colors=data.colors;if(targets.size()==1&&!bounded){const auto start=targets.front();targets.clear();for(std::size_t i=0;i<colors.size();++i)targets.push_back(start+i);}

    if(paletteManual_&&data.columns>0&&!data.slots.empty()){const auto empty=std::find(slots.begin(),slots.end(),0);const auto start=targets.empty()?std::size_t(empty-slots.begin()):targets.front();const auto x=start%columns,y=start/columns,height=data.slots.size()/data.columns;auto fit=fitPaletteSlotsToGrid(slots,columns,std::max(columns,int(x)+data.columns),int(y+height));slots=std::move(fit.slots);columns=fit.columns;targets.clear();colors.clear();for(std::size_t i=0;i<data.slots.size();++i)if(data.slots[i]&&x+i%data.columns<std::size_t(columns)){targets.push_back((y+i/data.columns)*columns+x+i%data.columns);colors.push_back(data.colors[*data.slots[i]]);}after.columns=columns;after.focused=y*columns+x;after.box=std::make_pair(y*columns+x,(y+height-1)*columns+std::min(std::size_t(columns-1),x+data.columns-1));}

    const auto revision=document.revision();document.pastePaletteColors(colors,targets,true,&slots,paletteManual_?columns:0);if(document.revision()!=revision&&paletteManual_)document.annotatePaletteView(before,after);if(!paletteManual_)paletteBoxRange_.reset();refresh();

  }

void Editor::selectSwatch(std::size_t index,bool ctrl,bool shift,bool secondary) {

    paletteBoxRange_.reset();

    const int id=index<paletteButtonIds_.size()?paletteButtonIds_[index]:0;if(!gradientPending_)cancelStroke();paletteFocused_=true;

    if(secondary) document.selectSecondaryPalette(id);

    else if(shift) {const auto slots=paletteViewSlots();document.selectPaletteSlotRange(index,paletteColumns_,&slots);}

    else if(id) document.selectPalette(id,ctrl);else document.clearPaletteSelection();

    ink_=document.palette().primary;lastPaletteInk_=ink_;if(gradientPending_){gradientRequest_=true;gradientTick();}requestFocus();refresh();

  }

bool Editor::readPaletteNamesPreference(std::istream& in){const std::string value((std::istreambuf_iterator<char>(in)),std::istreambuf_iterator<char>());return value=="true";}

void Editor::loadPaletteSize() {

    {std::ifstream in(palettePreferencePath().parent_path()/"palette-layout-mode.txt");std::string mode;std::getline(in,mode);paletteManual_=mode=="manual";}

    try {

      const auto path=palettePreferencePath();

      {std::ifstream sync(path.parent_path()/"palette-sync-colors.txt");syncPaletteColors_=readPaletteNamesPreference(sync);}

      {std::ifstream names(path.parent_path()/"palette-show-names.txt");showPaletteNames_=readPaletteNamesPreference(names);}

      {std::ifstream sort(path.parent_path()/"palette-sort-direction.txt");std::string direction;sort>>direction;paletteSortDescending_=direction=="descending";}

      std::ifstream lock(path.parent_path()/"palette-edit-locked.txt");std::string value;

      if(lock>>value) paletteLocked_=value!="false";

      if(!std::filesystem::exists(path)) return;

      std::ifstream in(path);std::string key;

      if(!(in>>key)) throw std::runtime_error("Cannot read palette preference");

      for(int i=0;i<5;++i) if(key==swatchKeys_[i]) {swatchSize_=i;return;}

      // Same fallback as legacy for unknown stored preferences.

    } catch(const std::exception&) {status_=U"色卡尺寸偏好读取失败，使用小尺寸";}

  }

void Editor::choosePaletteSynchronization(bool enabled){syncPaletteColors_=enabled;applyWorkspacePreferences();if(!smoke_)try{const auto path=palettePreferencePath().parent_path();std::filesystem::create_directories(path);std::ofstream out(path/"palette-sync-colors.txt");out<<(enabled?"true":"false");out.close();if(!out)throw std::runtime_error("Palette synchronization preference write failed");}catch(...){status_=U"同步颜色偏好保存失败";}refresh();}

void Editor::choosePaletteNames(bool show){showPaletteNames_=show;if(!smoke_)try{const auto path=palettePreferencePath().parent_path();std::filesystem::create_directories(path);std::ofstream out(path/"palette-show-names.txt");out<<(show?"true":"false");out.close();if(!out)throw std::runtime_error("Palette show names write failed");}catch(...){status_=U"颜色名称显示偏好保存失败";}refresh();}

void Editor::choosePaletteSortDirection(bool descending){paletteSortDescending_=descending;if(!smoke_)try{const auto path=palettePreferencePath().parent_path();std::filesystem::create_directories(path);std::ofstream out(path/"palette-sort-direction.txt");out<<(descending?"descending":"ascending");out.close();if(!out)throw std::runtime_error("Palette sort direction write failed");}catch(...){status_=U"排序方向偏好保存失败";}refresh();}

void Editor::chooseSwatchSize(int size,bool persist) {

    swatchSize_=std::clamp(size,0,4);

    if(persist) {

      try {

        const auto path=palettePreferencePath();std::filesystem::create_directories(path.parent_path());

        std::ofstream out(path);out<<swatchKeys_[swatchSize_];out.close();

        if(!out) throw std::runtime_error("Cannot save palette preference");

      } catch(const std::exception&) {status_=U"色卡尺寸已调整，但偏好保存失败";}

    }

    layoutPalette();invalidate();

  }

void Editor::togglePaletteLock() {

    paletteLocked_=!paletteLocked_;

    try {const auto path=palettePreferencePath().parent_path();std::filesystem::create_directories(path);

      std::ofstream out(path/"palette-edit-locked.txt");out<<(paletteLocked_?"true":"false");out.close();if(!out) throw std::runtime_error("Palette lock write failed");

    } catch(const std::exception&) {status_=U"锁定偏好保存失败";}

    refresh();

  }

void Editor::paletteWheel(const ui::MouseMessage& mouse,bool persist) {

    if(mouse.ctrlPressed() || mouse.cmdPressed()) {

      const auto delta=mouse.wheelDelta();

      const int dominant=std::abs(delta.y)>=std::abs(delta.x)?delta.y:delta.x;

      if(dominant) chooseSwatchSize(swatchSize_+(dominant<0?1:-1),persist);

    } else {paletteScrollPixels_+=(mouse.wheelDelta().y>0?1:mouse.wheelDelta().y<0?-1:0)*(swatchPixels_[swatchSize_]-uiScale);layoutPalette();invalidate();}

  }

bool Editor::parsePaletteHex(const std::string& value,Pixel& next){return pickerParseRgbaHex(unicodeText(value),next);}

std::string Editor::paletteHex(Pixel color) {

    const char* digits="0123456789ABCDEF";std::string value="#";

    for(int i=0;i<((color>>24)==255?3:4);++i) {const int byte=(color>>(i*8))&255;value+=digits[byte>>4];value+=digits[byte&15];}

    return value;

  }

void Editor::commitPaletteHex() {

    Pixel color=editingSecondary_?document.palette().secondary:document.palette().primary,next=color;

    if(pickerParseRgbaHex(unicodeText(paletteInput_->text()),next,int(color>>24))){document.setPaletteRole(next,editingSecondary_,paletteLocked_);color=next;}else status_=U"无效 HEX，已恢复当前颜色";

    paletteInput_->setText(paletteHex(color));refresh();

  }

void Editor::setColorEditorSampling(bool active,ColorEditorPopup* target){
    if(active==colorEditorSampling_)return;
    if(active){
      colorEditorSamplingTarget_=target?target:colorEditorPopup_.get();
      colorEditorSamplingIdentity_=document.identity();
      colorEditorReturnTools_={selectionTool_,shapeTool_,gradientTool_,fillTool_,handTool_,eraser_,eyedropperTool_,eyedropperHeld_,navigation_.zoomTool_};
      if(!gradientPending_)cancelStroke();
      selectionTool_=shapeTool_=gradientTool_=fillTool_=handTool_=eraser_=eyedropperHeld_=navigation_.zoomTool_=false;
      eyedropperTool_=true;playing_=false;
    }else{
      if(eyedropperGesture_.active())eyedropperGesture_.finish();
      eyedropperLensSurface_.reset();
      if(colorEditorSamplingTarget_&&colorEditorSamplingTarget_->hasCapture())colorEditorSamplingTarget_->releaseMouse();
      if(hasCapture())releaseMouse();
      if(eyedropperTool_&&colorEditorSamplingIdentity_==document.identity()){
        selectionTool_=colorEditorReturnTools_[0];shapeTool_=colorEditorReturnTools_[1];gradientTool_=colorEditorReturnTools_[2];fillTool_=colorEditorReturnTools_[3];handTool_=colorEditorReturnTools_[4];eraser_=colorEditorReturnTools_[5];eyedropperTool_=colorEditorReturnTools_[6];eyedropperHeld_=colorEditorReturnTools_[7];navigation_.zoomTool_=colorEditorReturnTools_[8];
      }
      colorEditorSamplingTarget_=nullptr;colorEditorSamplingIdentity_=0;
    }
    colorEditorSampling_=active;layoutToolOptions();refresh();updateNavigationCursor();
  }

void Editor::showRoleColorEditor(bool secondary,PixelButton* trigger){

    if(pending_!=Pending::None||!documentOpen_)return;

    if(colorEditorPopup_&&colorEditorPopup_->isVisible()){colorEditorPopup_->closeWindow(nullptr);if(colorEditorSecondary_==secondary)return;}

    colorEditorSecondary_=secondary;

    if(!colorEditorPopup_)colorEditorPopup_=std::make_unique<ColorEditorPopup>(font_,skin_,toolIcons_,smoke_?assets_.parent_path()/"color-editor-smoke-size.txt":palettePreferencePath().parent_path()/"color-editor-role-size.txt");

    for(auto& picker:pickerColumns_)if(picker.picker)picker.picker->finishInteraction();if(!gradientPending_)cancelStroke();

    std::vector<Pixel> colors;for(const auto& entry:document.palette().entries)if(entry.id)colors.push_back(entry.color);

    colorEditorPopup_->open((trigger?trigger:secondary?secondaryRole_:primaryRole_)->bounds(),bounds(),secondary?document.palette().secondary:document.palette().primary,secondary?U"背景色":U"前景色",colors,[this,secondary](Pixel color){document.setPaletteRole(color,secondary,paletteLocked_);refresh();},[this](bool sampling){setColorEditorSampling(sampling);});

  }

void Editor::openPaletteEditor(int id,bool secondary) {

    paletteInput_->numeric=false;

    for(auto& picker:pickerColumns_)if(picker.picker)picker.picker->finishInteraction();

    if(!gradientPending_)cancelStroke();renameId_=id;editingSecondary_=secondary;

    pending_=id?Pending::PaletteName:Pending::ColorRole;layoutPalette();

    paletteInput_->setText(id?utf8Text(document.paletteEntry(id)->name):paletteHex(secondary?document.palette().secondary:document.palette().primary));

    menuBar_->setEnabled(false);for(auto b:commands_) b->setEnabled(false);for(auto b:swatches_) b->setEnabled(false);for(auto b:panelTabs_) b->setEnabled(false);

    discard_->caption=U"确定";keep_->caption=id?U"取消":U"关闭";

    discard_->setVisible(id!=0);keep_->setVisible(true);dialogClose_->setVisible(true);paletteInput_->setVisible(true);paletteInput_->requestFocus();paletteInput_->selectAllText();refresh();

  }

void Editor::saveReplacePreferences(){if(smoke_)return;try{auto path=palettePreferencePath().parent_path()/"color-replacement.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out<<replaceScope_<<' '<<replacePreview_<<' '<<replaceRemember_<<' '<<replaceSource_<<' '<<replaceDestination_;}catch(...) {status_=U"替换颜色偏好保存失败";}}

std::u32string Editor::extractionDefaultName()const{return document.name()+U" 色板";}

std::u32string Editor::extractionName()const{const auto input=unicodeText(extractNameInput_->text());const auto name=javascriptTrim(input);return name.empty()?extractionDefaultName():std::u32string(name);}

std::vector<Pixel> Editor::paletteSaveColors()const{std::vector<Pixel> colors;for(const auto id:document.palette().order())if(const auto entry=document.paletteEntry(id))colors.push_back(entry->color);return colors;}

void Editor::openPaletteSave(){

    if(pending_!=Pending::None)return;

    refreshStoredPalettes();if(paletteSaveName_.empty())paletteSaveName_=extractionDefaultName();

    openPaletteEditor(0,false);pending_=Pending::PaletteSave;paletteInput_->numeric=false;paletteInput_->suffix.clear();paletteInput_->setText(utf8Text(paletteSaveName_));discard_->caption=U"保存为 PNG";keep_->caption=U"关闭";discard_->setVisible(true);refresh();paletteInput_->requestFocus();paletteInput_->selectAllText();

  }

bool Editor::savePalettePng(){

    paletteSaveName_=unicodeText(paletteInput_->text());const auto colors=paletteSaveColors();if(colors.empty()){status_=U"没有可保存的颜色";invalidate();return false;}

    const auto trimmed=javascriptTrim(paletteSaveName_);std::u32string safe=trimmed.empty()?extractionDefaultName():std::u32string(trimmed);for(auto& c:safe)if(std::u32string_view(U"<>:\"/\\|?*").find(c)!=std::u32string_view::npos)c=U'_';

    const auto name=std::filesystem::path(safe+U".png").wstring(),directory=preferredExportDirectory().wstring();wchar_t filename[32768]{};std::copy_n(name.c_str(),std::min<std::size_t>(name.size(),32767),filename);

    OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=L"PNG 色板\0*.png\0\0";dialog.lpstrDefExt=L"png";dialog.lpstrInitialDir=directory.empty()?nullptr:directory.c_str();dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;

    if(!chooseExportFile_(&dialog))return false;

    try{writeStaticImagePngAtomic(filename,encodePaletteImagePng(colors));rememberExportDirectory(filename);recordRecentExportPath(filename);playExportSuccessSound();status_=U"色板 PNG 已保存";return true;}catch(const std::exception& e){status_=U"色板保存失败："+unicodeText(e.what());invalidate();return false;}

  }

void Editor::openPaletteExtraction(){

    if(pending_!=Pending::None || document.active())return;

    openPaletteEditor(0,false);pending_=Pending::PaletteExtract;extractMode_=0;paletteInput_->numeric=true;paletteInput_->setText(std::to_string(extractLimit_));extractNameInput_->setText(utf8Text(extractionDefaultName()));discard_->caption=U"提取";keep_->caption=U"取消";discard_->setVisible(true);layoutModal();paletteInput_->requestFocus();paletteInput_->selectAllText();invalidate();

  }

bool Editor::applyPaletteExtraction(){

    try{std::size_t used=0;const double value=std::stod(paletteInput_->text(),&used);if(used!=paletteInput_->text().size() || !std::isfinite(value))throw std::runtime_error("数量需要1–4096");extractLimit_=int(std::clamp(std::floor(value+.5),1.0,4096.0));

      const auto composite=compositeNormalRegion(document.timeline(),document.frame().id,{0,0,document.width(),document.height()});const auto colors=extractPaletteScanline(composite,extractLimit_);if(colors.empty())throw std::runtime_error("当前图像没有非透明颜色");

      if(extractMode_==0)paletteSaveName_=extractionName();const auto beforeVisible=document.palette().order().size();document.applyExtractedPalette(colors,extractMode_==2,paletteColumns_);paletteScrollPixels_=0;status_=extractMode_==0?U"已创建临时调色板："+extractionName():extractMode_==1?U"已替换调色板":U"已追加提取颜色："+unicodeText(std::to_string(document.palette().order().size()-beforeVisible));return true;

    }catch(const std::exception& e){status_=U"提取失败："+unicodeText(e.what());invalidate();return false;}

  }

std::vector<std::size_t> Editor::paletteGradientSlots()const{

    const auto slots=paletteViewSlots();const int columns=paletteColumns_;if(columns<1)return {};std::vector<std::size_t> selected;for(std::size_t i=0;i<slots.size();++i)if(slots[i] && std::find(document.palette().selected.begin(),document.palette().selected.end(),slots[i])!=document.palette().selected.end())selected.push_back(i);

    std::size_t left=columns,right=0,top=65536,bottom=0;auto include=[&](std::size_t i){left=std::min(left,i%columns);right=std::max(right,i%columns);top=std::min(top,i/columns);bottom=std::max(bottom,i/columns);};if(paletteBoxRange_ && paletteBoxRange_->identity==document.identity() && paletteBoxRange_->selected==document.palette().selected){include(paletteBoxRange_->start);include(paletteBoxRange_->end);}else{if(selected.size()<2)return {};for(auto i:selected)include(i);}std::vector<std::size_t> result;for(auto y=top;y<=bottom;++y)for(auto x=left;x<=right;++x){const auto i=y*columns+x;if(paletteManual_||i<slots.size())result.push_back(i);}return result;

  }

void Editor::applyPaletteGradient(bool hue){const auto slots=paletteViewSlots();document.gradientPaletteSlots(paletteGradientSlots(),paletteColumns_,hue,&slots);refresh();}

void Editor::showPaletteActions() {

    if(pending_!=Pending::None) return;

    PixelMenu popup(skin_);

    auto add=[&](PixelMenu& menu,const char32_t* text,const char* icon="",std::function<void()> action={},std::function<bool()> checked={}) {

      auto item=new PixelMenuItem(font_,skin_,text);item->iconSkin=&toolIcons_;item->menuMarks=&toolIcons_;item->icon=icon;item->checked=std::move(checked);item->setEnabled(bool(action));if(action)item->Click.connect(std::move(action));menu.addChild(item);return item;

    };

    auto separator=[&](PixelMenu& menu){menu.addChild(new PixelMenuSeparator(skin_));};

    add(popup,U"自适应布局","",[this]{choosePaletteLayout(false);},[this]{return !paletteManual_;});

    add(popup,U"自定义布局","",[this]{choosePaletteLayout(true);},[this]{return paletteManual_;});separator(popup);

    add(popup,U"提取颜色","extractColors",document.active()?std::function<void()>{}:std::function<void()>{[this]{openPaletteExtraction();}});

    add(popup,U"显示颜色名称","",[this]{choosePaletteNames(!showPaletteNames_);},[this]{return showPaletteNames_;});

    add(popup,U"同步颜色","",[this]{choosePaletteSynchronization(!syncPaletteColors_);},[this]{return syncPaletteColors_;});separator(popup);

    auto sort=new PixelMenu(skin_);auto trigger=add(popup,U"排序与渐变","moreLines",[]{});trigger->setSubmenu(sort);

    add(*sort,U"反向颜色","redo",[this]{document.reversePaletteColors();refresh();});add(*sort,U"渐变","",paletteGradientSlots().size()>=2?std::function<void()>{[this]{applyPaletteGradient(false);}}:std::function<void()>{});add(*sort,U"色调渐变","",paletteGradientSlots().size()>=2?std::function<void()>{[this]{applyPaletteGradient(true);}}:std::function<void()>{});separator(*sort);

    const char32_t* sortNames[]{U"色调排序",U"饱和度排序",U"明度排序",U"亮度排序",U"Red 排序",U"Green 排序",U"Blue 排序",U"Alpha 排序"};for(int i=0;i<8;++i)add(*sort,sortNames[i],"",[this,i]{document.sortPaletteColors(Document::PaletteSortMode(i),paletteSortDescending_);refresh();});

    separator(*sort);add(*sort,U"升序","",[this]{choosePaletteSortDirection(false);},[this]{return !paletteSortDescending_;});add(*sort,U"降序","",[this]{choosePaletteSortDirection(true);},[this]{return paletteSortDescending_;});separator(popup);

    const char32_t* names[]={U"较小尺寸",U"小尺寸",U"中尺寸",U"大尺寸",U"较大尺寸"};

    for(int i=0;i<5;++i) {

      const auto px=std::to_string(swatchPixels_[i]);

      auto item=new PixelMenuItem(font_,skin_,names[i],std::u32string(px.begin(),px.end())+U" px");item->menuMarks=&toolIcons_;

      item->checked=[this,i]{return swatchSize_==i;};

      item->Click.connect([this,i]{chooseSwatchSize(i);});popup.addChild(item);

    }

    separator(popup);add(popup,U"保存色板","save",[this]{openPaletteSave();});

    const auto anchor=paletteActions_->bounds();

    popup.showPopup(gfx::Point(anchor.x,anchor.y2()+uiGap*uiScale),display());requestFocus();

  }


bool Editor::processPaletteInput(ui::Message* msg){
    if(paletteGrowth_){

      if(!hasCapture()){finishPaletteGrowth(true);}

      else if(msg->type()==ui::kFocusLeaveMessage || (msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)){finishPaletteGrowth(true);return true;}

      else if(msg->type()==ui::kMouseMoveMessage){updatePaletteGrowth(static_cast<ui::MouseMessage*>(msg)->position());return true;}

      else if(msg->type()==ui::kMouseUpMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);finishPaletteGrowth(mouse->button()!=ui::kButtonLeft);return true;}

    }

    if(paletteGesture_){

      if(!hasCapture()){finishPalettePointer(true);}

      else if(msg->type()==ui::kFocusLeaveMessage || (msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)){finishPalettePointer(true);return true;}

      if(msg->type()==ui::kMouseMoveMessage){updatePalettePointer(static_cast<ui::MouseMessage*>(msg)->position());return true;}

      if(msg->type()==ui::kMouseUpMessage){auto mouse=static_cast<ui::MouseMessage*>(msg);if(mouse->button()==ui::kButtonNone){finishPalettePointer(!paletteGesture_->moving);return true;}updatePalettePointer(mouse->position());finishPalettePointer();return true;}

    }

    if(columnShown(0)&&paletteManual_&&pending_==Pending::None&&msg->type()==ui::kMouseDownMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);if(paletteViewportBounds().contains(mouse->position())){beginPalettePointer(paletteSlotAt(mouse->position()),*mouse);return true;}}

    return false;
}

std::u32string Editor::storedPaletteError(const std::exception& error)const{if(auto file=dynamic_cast<const std::filesystem::filesystem_error*>(&error))return U"文件系统错误 "+unicodeText(std::to_string(file->code().value()))+U"："+file->path1().u32string();try{return unicodeText(error.what());}catch(const std::range_error&){return U"色板库操作失败（系统错误信息编码无效）";}}

std::filesystem::path Editor::paletteLibraryDirectory()const{return paletteLibraryOverride_.empty()?assets_.parent_path()/"palettes":paletteLibraryOverride_;}

PaletteLibrary Editor::paletteLibraryStore()const{return PaletteLibrary(paletteLibraryDirectory(),assets_/"palettes");}

void Editor::persistStoredPalettePreferences(){if(smoke_)return;std::string value=activeStoredPalette_+"\n";for(auto& id:hiddenStoredPalettes_)value+=id+"\n";auto path=palettePreferencePath().parent_path()/"palette-library.txt";std::filesystem::create_directories(path.parent_path());writeExportBytesAtomic(path,{value.begin(),value.end()});}

void Editor::applyStoredPalette(const StoredPalette& p){try{std::vector<std::u32string> names;if(p.names)for(auto& name:*p.names)names.push_back(unicodeText(name));document.applyStoredPalette(p.colors,p.columns,p.slots,p.names?&names:nullptr);choosePaletteLayout(p.columns!=0);activeStoredPalette_=p.id;paletteSaveName_=unicodeText(p.name);persistStoredPalettePreferences();refresh();}catch(const std::exception& e){status_=U"色板应用失败："+storedPaletteError(e);refresh();}}

void Editor::deleteStoredPalette(const std::string& id){try{auto found=std::find_if(storedPalettes_.begin(),storedPalettes_.end(),[&](auto& p){return p.id==id;});if(found==storedPalettes_.end())return;if(found->builtIn)hiddenStoredPalettes_.push_back(id);else paletteLibraryStore().remove(id);if(activeStoredPalette_==id)activeStoredPalette_.clear();persistStoredPalettePreferences();refreshStoredPalettes();}catch(const std::exception& e){status_=U"色板删除失败："+storedPaletteError(e);refresh();}}

void Editor::storedPaletteContext(std::string id){PixelMenu menu(skin_);auto remove=new PixelMenuItem(font_,skin_,U"删除色板");remove->Click.connect([this,id]{deleteStoredPalette(id);});menu.addChild(remove);auto at=storedPaletteRows_.empty()?paletteLibrary_->bounds():storedPaletteRows_.front()->bounds();menu.showPopup({at.x,at.y2()},display());}

void Editor::refreshStoredPalettes(){try{auto palettes=paletteLibraryStore().list();palettes.erase(std::remove_if(palettes.begin(),palettes.end(),[&](auto& p){return std::find(hiddenStoredPalettes_.begin(),hiddenStoredPalettes_.end(),p.id)!=hiddenStoredPalettes_.end();}),palettes.end());for(auto row:storedPaletteRows_)delete row;for(auto& row:storedPaletteSwatches_)for(auto cell:row)delete cell;storedPaletteRows_.clear();storedPaletteSwatches_.clear();storedPalettes_=std::move(palettes);if(std::none_of(storedPalettes_.begin(),storedPalettes_.end(),[&](auto& p){return p.id==activeStoredPalette_;})){activeStoredPalette_.clear();for(auto& p:storedPalettes_)if(p.colors==paletteSaveColors()){activeStoredPalette_=p.id;break;}}
 for(std::size_t i=0;i<storedPalettes_.size();++i){auto& p=storedPalettes_[i];auto row=button(unicodeText(p.name),[this,i]{applyStoredPalette(storedPalettes_[i]);});row->context=[this,id=p.id]{storedPaletteContext(id);};row->setVisible(false);storedPaletteRows_.push_back(row);std::vector<PixelButton*> cells;std::vector<Pixel> preview;if(p.columns){for(auto cell:p.slots)if(cell)preview.push_back(p.colors[*cell]);}else preview=p.colors;for(auto color:preview){auto cell=button(U"",[this,i]{applyStoredPalette(storedPalettes_[i]);});cell->paletteCell=true;cell->recentColorSwatch=true;cell->swatch=color;cell->context=row->context;cell->setVisible(false);cells.push_back(cell);}storedPaletteSwatches_.push_back(std::move(cells));}persistStoredPalettePreferences();refresh();}catch(const std::exception& e){status_=U"色板库读取失败："+storedPaletteError(e);refresh();}}

void Editor::importStoredPalette(){wchar_t filename[32768]{};OPENFILENAMEW picker{};picker.lStructSize=sizeof(picker);picker.hwndOwner=GetActiveWindow();picker.lpstrFile=filename;picker.nMaxFile=32768;picker.lpstrFilter=L"支持的色板\0*.json;*.gpl;*.txt;*.hex;*.csv;*.act;*.pal;*.ase;*.aco;*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif;*.ico\0MoonSprite JSON\0*.palette.json\0\0";picker.Flags=OFN_EXPLORER|OFN_FILEMUSTEXIST|OFN_NOCHANGEDIR;if(!choosePaletteImportFile_(&picker))return;try{auto saved=paletteLibraryStore().importFile(filename);activeStoredPalette_=saved.id;refreshStoredPalettes();applyStoredPalette(saved);}catch(const std::exception& e){status_=U"色板导入失败："+storedPaletteError(e);refresh();}}

bool Editor::saveStoredPalette(bool current){try{StoredPalette p;const auto name=javascriptTrim(unicodeText(paletteInput_->text()));p.name=utf8Text(name.empty()?extractionDefaultName():std::u32string(name));const auto& state=document.palette();p.columns=state.columns;p.names.emplace();auto ids=state.order();for(int id:ids){auto e=document.paletteEntry(id);p.colors.push_back(e->color);p.names->push_back(utf8Text(e->name));}for(int id:state.slots){auto it=std::find(ids.begin(),ids.end(),id);p.slots.push_back(id&&it!=ids.end()?std::optional<std::size_t>(std::size_t(it-ids.begin())):std::nullopt);}auto saved=paletteLibraryStore().save(std::move(p),current?activeStoredPalette_:std::string());activeStoredPalette_=saved.id;paletteSaveName_=unicodeText(saved.name);persistStoredPalettePreferences();status_=U"色板已保存："+unicodeText(saved.name);return true;}catch(const std::exception& e){status_=U"色板保存失败："+storedPaletteError(e);invalidate();return false;}}

void Editor::openStoredPaletteLibrary(){if(pending_!=Pending::None)return;pending_=Pending::PaletteLibrary;menuBar_->setEnabled(false);discard_->setVisible(false);keep_->caption=U"关闭";keep_->setVisible(true);dialogClose_->setVisible(true);refreshStoredPalettes();}

bool Editor::storedPaletteModalControl(ui::Widget* w)const{if(w==storedPaletteScroll_||w==paletteSaveNew_||w==paletteSaveCurrent_)return true;if(std::find(storedPaletteActions_.begin(),storedPaletteActions_.end(),w)!=storedPaletteActions_.end()||std::find(storedPaletteRows_.begin(),storedPaletteRows_.end(),w)!=storedPaletteRows_.end())return true;for(auto& row:storedPaletteSwatches_)if(std::find(row.begin(),row.end(),w)!=row.end())return true;return false;}

void Editor::createStoredPaletteControls(){try{std::ifstream in(palettePreferencePath().parent_path()/"palette-library.txt");std::getline(in,activeStoredPalette_);std::string id;while(std::getline(in,id))if(!id.empty())hiddenStoredPalettes_.push_back(id);}catch(const std::exception& e){status_=U"色板库偏好读取失败："+storedPaletteError(e);}
 auto scroll=new DialogBackground<PixelScrollBar>(skin_,true);configureDialogBackground(scroll);addChild(scroll);storedPaletteScroll_=scroll;scroll->changed=[this](int value){storedPaletteScrollPixels_=value;layoutModal();invalidateRect(dialogDisplayBounds());};scroll->setVisible(false);
 auto action=[this](const std::u32string& label,const std::string& icon,std::function<void()> fn){auto b=button(label,std::move(fn));b->iconSkin=&toolIcons_;b->icon=icon;b->iconWithCaption=true;b->setVisible(false);storedPaletteActions_.push_back(b);};
 action(U"打开目录","folderOpen",[this]{try{std::filesystem::create_directories(paletteLibraryDirectory());auto path=paletteLibraryDirectory().wstring();if(reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr,L"open",path.c_str(),nullptr,nullptr,SW_SHOWNORMAL))<=32)throw std::runtime_error("Cannot open palette folder");resolve(false);}catch(const std::exception& e){status_=storedPaletteError(e);refresh();}});
 action(U"导入","import",[this]{importStoredPalette();});action(U"刷新","refresh",[this]{refreshStoredPalettes();});
 paletteSaveNew_=button(U"另存新建",[this]{if(saveStoredPalette(false))resolve(false);});paletteSaveCurrent_=button(U"保存当前",[this]{if(saveStoredPalette(true))resolve(false);});for(auto b:{paletteSaveNew_,paletteSaveCurrent_}){b->iconSkin=&toolIcons_;b->iconWithCaption=true;b->setVisible(false);}paletteSaveNew_->icon="plus";paletteSaveCurrent_->icon="save";
}

void Editor::layoutStoredPaletteControls(const gfx::Rect& modal){if(!storedPaletteScroll_)return;bool show=pending_==Pending::PaletteLibrary;const auto viewport=toDisplay(gfx::Rect(modal.x+6,modal.y+DialogLayout::bodyTop,std::max(40,modal.w-20),std::max(20,modal.h-85)));int total=0;std::vector<int> heights;for(auto& row:storedPaletteSwatches_){int size=row.size()>128?5:row.size()>64?7:row.size()>32?9:12;int columns=std::max(1,viewport.w/uiScale/(size+1));int height=18+(int(row.size())+columns-1)/columns*(size+1)+5;heights.push_back(height);total+=height*uiScale;}storedPaletteScrollPixels_=std::clamp(storedPaletteScrollPixels_,0,std::max(0,total-viewport.h));storedPaletteScroll_->setVisible(show);storedPaletteScroll_->setDockBounds(gfx::Rect(viewport.x2()+uiScale,viewport.y,7*uiScale,viewport.h));storedPaletteScroll_->configure(total,viewport.h,storedPaletteScrollPixels_);storedPaletteScroll_->wheelStep=48*uiScale;int y=viewport.y-storedPaletteScrollPixels_;
 for(std::size_t i=0;i<storedPaletteRows_.size();++i){auto row=storedPaletteRows_[i];row->setBounds(gfx::Rect(viewport.x,y,viewport.w,18*uiScale));row->paletteViewport=[viewport]{return viewport;};row->active=storedPalettes_[i].id==activeStoredPalette_;row->setVisible(show&&viewport.intersects(row->bounds()));auto& cells=storedPaletteSwatches_[i];int size=cells.size()>128?5:cells.size()>64?7:cells.size()>32?9:12;int columns=std::max(1,viewport.w/uiScale/(size+1));for(std::size_t j=0;j<cells.size();++j){auto b=cells[j];b->setBounds(gfx::Rect(viewport.x+int(j%columns)*(size+1)*uiScale,y+(19+int(j/columns)*(size+1))*uiScale,size*uiScale,size*uiScale));b->paletteViewport=[viewport]{return viewport;};b->setVisible(show&&viewport.intersects(b->bounds()));}y+=heights[i]*uiScale;}
 for(std::size_t i=0;i<storedPaletteActions_.size();++i){auto b=storedPaletteActions_[i];b->setVisible(show);b->setBounds(toDisplay(gfx::Rect(modal.x+6+int(i)*84,modal.y2()-52,82,textControlHeight)));}
 bool save=pending_==Pending::PaletteSave;paletteSaveNew_->setVisible(save);paletteSaveNew_->setEnabled(!paletteSaveColors().empty());auto current=std::find_if(storedPalettes_.begin(),storedPalettes_.end(),[this](auto& p){return p.id==activeStoredPalette_;});bool writable=current!=storedPalettes_.end()&&!current->builtIn;paletteSaveCurrent_->setVisible(save&&writable);paletteSaveCurrent_->setEnabled(!paletteSaveColors().empty());if(save){const int y=modalActionY(modal);discard_->setBounds(toDisplay(gfx::Rect(modal.x+6,y,70,textControlHeight)));paletteSaveNew_->setBounds(toDisplay(gfx::Rect(modal.x+78,y,78,textControlHeight)));paletteSaveCurrent_->setBounds(toDisplay(gfx::Rect(modal.x+158,y,78,textControlHeight)));keep_->setBounds(toDisplay(gfx::Rect(modal.x2()-60,y,54,textControlHeight)));}
}
}
