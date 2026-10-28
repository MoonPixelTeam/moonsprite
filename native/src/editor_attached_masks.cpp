#include "editor_implementation.h"
#include "editor.h"
namespace moon::editor {
std::string Editor::selectedMaskPropertyOwner()const{
 if(!selectedMaskSlots_.empty()||!document.timelineSelection().maskRows.empty()||!document.activeMaskId().empty())return {};
 auto groups=document.selectedGroupIds();if(groups.empty()&&document.selectedGroupId())groups.push_back(*document.selectedGroupId());
 auto layers=document.selectedGroupId()&&groups.size()==1?std::vector<std::string>{}:document.timelineSelection().layers;
 if(groups.size()+layers.size()!=1)return {};
 return groups.empty()?layers.front():groups.front();
}
const timeline::MaskSlot* Editor::selectedOwnerMask()const{
 const auto owner=selectedMaskPropertyOwner();
 return owner.empty()?nullptr:timeline::directMask(document.timeline().state(),owner,document.frame().id);
}
bool Editor::attachedMaskRow(const std::string& id)const{for(const auto& m:document.timeline().state().masks)if(TimelineRows::maskRowId(m.ownerId)==id)return true;return false;}
bool Editor::selectMaskPanelRow(int row,int mode){
 if(timelineHidden_)return false;
 TimelineRows rows(document.timeline(),document.collapsedGroupIds(),true);const auto* target=rows.at(row);if(!target)return false;
 const bool mask=rows.mask(row);auto previous=document.timelineSelection();
 if(!mask&&(mode==0||previous.maskRows.empty()))return false;
 const auto owner=rows.owner(row);auto masks=mode?previous.maskRows:std::vector<std::string>{};
 auto layers=mode?previous.layers:std::vector<std::string>{};auto groups=mode?document.selectedGroupIds():std::vector<std::string>{};
 if(mode==2){
  // Selection order follows animationLayerPanelSelectionRows: mask before owner,
  // independently of the native display order (owner before mask).
  std::vector<std::string> order;TimelineRows owners(document.timeline(),document.collapsedGroupIds(),false);
  for(int r=0;r<owners.size();++r){const auto id=owners.owner(r);if(rows.index(TimelineRows::maskRowId(id))>=0)order.push_back(TimelineRows::maskRowId(id));order.push_back(id);}
  const auto anchor=masks.empty()?previous.layerAnchor:TimelineRows::maskRowId(masks.back());
  const auto start=std::find(order.begin(),order.end(),anchor),end=std::find(order.begin(),order.end(),target->id);
  masks.clear();layers.clear();groups.clear();
  auto add=[&](const std::string& id){const int r=rows.index(id);if(rows.mask(r))masks.push_back(rows.owner(r));else if(document.findGroup(id))groups.push_back(id);else layers.push_back(id);};
  if(start==order.end()||end==order.end())add(target->id);else for(auto it=std::min(start,end);it<=std::max(start,end);++it)add(*it);
  if(!mask){
   auto descendant=[&](const std::string& id,const std::string& group){if(group.empty()||!document.findGroup(group))return false;std::optional<std::string> parent;if(const auto* g=document.findGroup(id))parent=g->parentGroupId;else if(document.timeline().hasLayer(id))parent=document.timeline().state().layers[document.timeline().layerIndex(id)].groupId;std::set<std::string> seen;while(parent&&seen.insert(*parent).second){if(*parent==group)return true;const auto* g=document.findGroup(*parent);parent=g?g->parentGroupId:std::nullopt;}return false;};
   const auto anchorOwner=previous.layerAnchor;const auto subtree=descendant(owner,anchorOwner)?anchorOwner:descendant(anchorOwner,owner)?owner:std::string{};
   if(!subtree.empty()){layers.clear();groups.clear();for(int r=0;r<owners.size();++r){const auto id=owners.owner(r);if(id==subtree||descendant(id,subtree)){if(document.findGroup(id))groups.push_back(id);else layers.push_back(id);}}}
  }
 }else{
  auto toggle=[&](auto& ids,const std::string& id){auto it=std::find(ids.begin(),ids.end(),id);if(mode==1&&it!=ids.end())ids.erase(it);else if(it==ids.end())ids.push_back(id);};
  if(mask)toggle(masks,owner);else if(target->kind==LayerPanelKind::Group)toggle(groups,target->id);else toggle(layers,target->id);
 }
 document.commitFloatingPaste();document.exitAttachedMask();
 if(document.timeline().hasLayer(owner))document.selectLayer(owner);
 document.clearTimelineSelection();document.clearFrameSelection();
 document.restoreTimelineRowSelection(std::move(layers),std::move(groups),owner);
 auto selection=document.timelineSelection();selection.maskRows=std::move(masks);document.restoreTimelineSelection(std::move(selection),{});
 selectedMaskSlots_.clear();maskSelectionAnchor_.reset();virtualSlots_.clear();virtualAnchor_.reset();frameSelectionExplicit_=false;
 timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;refresh();return true;
}
std::string Editor::attachedMaskOwner(const std::string& id)const{return attachedMaskRow(id)?id.substr(10):std::string{};}
bool Editor::selectMaskTimelineRow(int row,int column,int mode,const std::vector<std::pair<std::string,std::string>>* replacement){
 TimelineRows rows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);const auto& frames=document.timeline().state().frames;
 if(!rows.mask(row)||column<0||column>=int(frames.size()))return false;
 const auto owner=rows.owner(row),frame=frames[column].id;return selectMaskSlot(owner,frame,mode,replacement);
}
bool Editor::maskLayerControlsAvailable(const std::string& owner,const std::string& frame)const{
 if(!document.timeline().hasLayer(owner)||!document.timeline().findCel(owner,frame))return false;const auto* mask=timeline::resolvedMask(document.timeline().state(),owner,frame);if(!mask)return false;
 const auto& masks=document.timeline().state().masks;return std::any_of(masks.begin(),masks.end(),[&](const auto& slot){return slot.mask.id==mask->id&&!slot.group;});
}
void Editor::toggleMaskIsolation(const std::string& owner,const std::string& frame,bool additive){
 const auto* mask=timeline::resolvedMask(document.timeline().state(),owner,frame);if(!mask)return;
 if(!additive&&document.maskIsolated()&&document.activeMaskId()==mask->id){selectMaskSlot(owner,frame);return;}
 auto keys=additive?selectedMaskSlots_:std::vector<Document::MaskSlotKey>{};const auto key=std::make_pair(owner,frame);if(std::find(keys.begin(),keys.end(),key)==keys.end())keys.push_back(key);
 selectMaskSlot(owner,frame,0,&keys,true);
}
bool Editor::selectMaskSlot(const std::string& owner,const std::string& frame,int mode,const std::vector<Document::MaskSlotKey>* replacement,bool isolated){
 if(!document.timeline().hasFrame(frame)||(!document.timeline().hasLayer(owner)&&!document.findGroup(owner)))return false;
 const auto& frames=document.timeline().state().frames;const int column=int(document.timeline().frameIndex(frame));const auto key=std::make_pair(owner,frame);
 if(replacement)selectedMaskSlots_=*replacement;
 else if(mode==1){auto it=std::find(selectedMaskSlots_.begin(),selectedMaskSlots_.end(),key);if(it==selectedMaskSlots_.end())selectedMaskSlots_.push_back(key);else selectedMaskSlots_.erase(it);}
 else if(mode==2){
  const auto anchor=maskSelectionAnchor_.value_or(selectedMaskSlots_.empty()?key:selectedMaskSlots_.back());
  // Legacy ranges use the full owner tree, including collapsed descendants.
  TimelineRows all(document.timeline(),{},true);const int first=all.index(TimelineRows::maskRowId(anchor.first)),last=all.index(TimelineRows::maskRowId(owner));const int anchorColumn=all.frameIndex(anchor.second);
  if(first>=0&&last>=0&&anchorColumn>=0){for(int r=std::min(first,last);r<=std::max(first,last);++r)if(all.mask(r))for(int c=std::min(anchorColumn,column);c<=std::max(anchorColumn,column);++c){auto next=std::make_pair(all.owner(r),frames[c].id);if(std::find(selectedMaskSlots_.begin(),selectedMaskSlots_.end(),next)==selectedMaskSlots_.end())selectedMaskSlots_.push_back(next);}}
  else selectedMaskSlots_={key};
 }else selectedMaskSlots_={key};
 maskSelectionAnchor_=key;document.exitAttachedMask();document.clearTimelineSelection();document.selectFrame(frame);
 if(isolated&&document.findGroup(owner)){TimelineRows all(document.timeline(),{},false);if(const auto* row=all.at(all.index(owner)))document.selectTimelineRow(*row);}
 if(std::find(selectedMaskSlots_.begin(),selectedMaskSlots_.end(),key)!=selectedMaskSlots_.end())document.selectAttachedMask(owner,frame,isolated);
 virtualSlots_.clear();virtualAnchor_.reset();frameSelectionExplicit_=false;timelineSelectionGuidesVisible_=true;paletteFocused_=false;moveTool_=selectionTool_=shapeTool_=gradientTool_=fillTool_=textTool_=false;refresh();return true;
}
void Editor::reportMaskTransfer(Document::MaskTransferResult result){
 using R=Document::MaskTransferResult;
 if(result==R::LinkedSelection)status_=U"来源单元格与目标单元格必须使用相同的图层类型。";
 else if(result==R::EmptyCel)status_=U"图层单元格没有可见内容，无法创建或粘贴图层蒙版。";
 else if(result==R::Locked)status_=U"图层或图层组已锁定，无法修改结构。";
 else if(result==R::Done)status_.clear();
}
void Editor::copyMaskTimeline(bool cut){
 try{if(document.copyAttachedMasks(selectedMaskSlots_,GetClipboardSequenceNumber())){layerClipboardSnapshot_.reset();celClipboardSnapshot_={};frameClipboardSnapshot_={};pixelClipboard_.clear();if(cut)deleteTimelineItems();}refresh();}catch(const std::exception& e){showSaveError(e);}
}
void Editor::pasteMaskTimeline(const std::string& owner,const std::string& frame){
 try{reportMaskTransfer(document.pasteAttachedMasks(selectedMaskSlots_,{owner,frame}));refresh();}catch(const std::exception& e){showSaveError(e);}
}
std::vector<Document::MaskSlotKey> Editor::maskTimelineVisualSlots()const{
 const auto& d=timelineGesture_;if(d.kind==4&&d.canMove&&d.moved&&!d.maskPlacements.empty()){std::vector<Document::MaskSlotKey> keys;for(const auto& p:d.maskPlacements)keys.push_back(p.target);return keys;}return selectedMaskSlots_;
}
void Editor::buildAttachedMaskMenu(PixelMenu& menu,const std::string& owner,const std::string& frame){const auto* slot=timeline::directMask(document.timeline().state(),owner,frame);const auto* resolved=timeline::resolvedMask(document.timeline().state(),owner,frame);const bool group=document.findGroup(owner)!=nullptr;const auto* cel=document.timeline().findCel(owner,frame);const bool hasContent=group||(cel&&document.timeline().hasVisiblePixels(cel->id));auto add=[&](const char32_t* text,const char* icon,std::function<void()> action,bool enabled=true){auto item=new PixelMenuItem(font_,skin_,text);item->iconSkin=&toolIcons_;item->icon=icon;item->setEnabled(enabled);item->Click.connect([this,action]{action();refresh();});menu.addChild(item);};
 add(U"复制蒙版单元格","copy",[this]{copyMaskTimeline();},resolved!=nullptr);
 add(U"粘贴蒙版单元格","paste",[this,owner,frame]{pasteMaskTimeline(owner,frame);},document.hasMaskClipboard()&&hasContent);
 add(U"编辑蒙版","layerMask",[this,owner,frame]{selectMaskSlot(owner,frame,0,nullptr,true);},slot);if(slot){const auto m=*timeline::resolvedMask(document.timeline().state(),owner,frame);add(m.visible?U"隐藏蒙版":U"显示蒙版",m.visible?"eye":"eyeOff",[this,owner,frame,m]{document.setAttachedMaskFlags(owner,frame,!m.visible,m.locked,m.moveWithOwner,m.autoLinkAnimationCels);});add(m.locked?U"解锁蒙版":U"锁定蒙版",m.locked?"lock":"unlock",[this,owner,frame,m]{document.setAttachedMaskFlags(owner,frame,m.visible,!m.locked,m.moveWithOwner,m.autoLinkAnimationCels,&selectedMaskSlots_);},maskLayerControlsAvailable(owner,frame));const auto* bound=timeline::resolvedMask(document.timeline().state(),owner,frame);add(bound&&bound->moveWithOwner?U"停用绑定移动":U"开启绑定移动","linkedLayer",[this,owner,frame]{if(const auto* mask=timeline::resolvedMask(document.timeline().state(),owner,frame))document.setMaskMoveWithOwner(owner,frame,!mask->moveWithOwner);});add(U"删除蒙版","delete",[this,owner,frame,group]{if(group){if(document.deleteAttachedMask(owner,frame))selectedMaskSlots_.clear();else status_=U"所属图层或图层组已锁定，无法删除蒙版";}else deleteTimelineItems();});}else add(U"新建蒙版","layerMask",[this,owner,frame]{document.createAttachedMask(owner,frame,document.findGroup(owner)!=nullptr);},hasContent);auto keys=selectedMaskSlots_;if(std::find(keys.begin(),keys.end(),std::make_pair(owner,frame))==keys.end())keys={{owner,frame}};
 std::map<std::string,std::set<std::string>> owners;for(const auto& key:keys)owners[key.first].insert(key.second);bool canLink=false;for(const auto& item:owners)if(item.second.size()>1){for(const auto& f:document.timeline().state().frames)if(item.second.count(f.id)&&timeline::resolvedMask(document.timeline().state(),item.first,f.id)){canLink=true;break;}}
 bool canUnlink=false;std::set<std::string> roots;for(const auto& key:keys)if(const auto* root=timeline::resolvedMask(document.timeline().state(),key.first,key.second))roots.insert(root->id);
 for(const auto& item:document.timeline().state().masks)if(!item.mask.linkedMaskId.empty())if(const auto* root=timeline::resolvedMask(document.timeline().state(),item.ownerId,item.frameId))canUnlink=canUnlink||roots.count(root->id);
 add(U"连接所选蒙版","animation-auto-link-on",[this,keys]{document.linkAttachedMasks(keys);},canLink);add(U"断开蒙版链接","animation-auto-link-off",[this,keys]{document.linkAttachedMasks(keys,true);},canUnlink);add(U"退出蒙版编辑","image",[this]{document.exitAttachedMask();selectedMaskSlots_.clear();});}
void Editor::showAttachedMaskMenu(const std::string& owner,const std::string& frame){const auto key=std::make_pair(owner,frame);if(std::find(selectedMaskSlots_.begin(),selectedMaskSlots_.end(),key)==selectedMaskSlots_.end())selectMaskSlot(owner,frame);PixelMenu menu(skin_);buildAttachedMaskMenu(menu,owner,frame);menu.showPopup(pointerMenuPosition(ui::get_mouse_position()),display());}
void Editor::smokeAttachedMasks(){smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;
 for(bool group:{false,true}){
  selectedMaskSlots_.clear();maskSelectionAnchor_.reset();document=Document(2,1);document.fillSelectionOrCanvas(0xff123456);timelineHidden_=false;frameScroll_=layerScroll_=0;frameScrollRemainder_=layerScrollRemainder_=0;
  std::string owner=document.layer().id;if(group){if(!document.createLayerGroup()||!document.selectedGroupId())throw std::runtime_error("Mask selection group setup failed");owner=*document.selectedGroupId();}
  for(int i=0;i<4;++i)document.addFrame(true);
  const auto frames=document.timeline().state().frames;if(!document.createAttachedMask(owner,frames[1].id,group))throw std::runtime_error("Mask selection fixture creation failed");document.exitAttachedMask();refresh();
  TimelineRows visual(document.timeline(),document.collapsedGroupIds(),true);const int row=visual.index(TimelineRows::maskRowId(owner));if(row<0)throw std::runtime_error("Mask selection row missing");
  auto point=[&](int col){const auto l=columnLayout(uiLogical(bounds()),2);const int index=(row-layerScroll_)*timelineColumns(l)+col-frameScroll_;if(index<0||index>=int(frameCells_.size())||!frameCells_[index]->timelineVisible)throw std::runtime_error("Mask selection cell outside viewport");return frameCells_[index]->bounds().center();};
  auto down=[&](int col,decltype(ui::kKeyNoneModifier) mods=ui::kKeyNoneModifier){ui::MouseMessage m(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,mods,point(col));const auto l=columnLayout(uiLogical(bounds()),2);frameCells_[(row-layerScroll_)*timelineColumns(l)+col-frameScroll_]->pointerPress(m);};
  auto move=[&](int col){ui::MouseMessage m(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point(col));onProcessMessage(&m);};
  auto up=[&](int col){ui::MouseMessage m(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point(col));onProcessMessage(&m);};
  const auto history=document.historyPosition();down(0);
  if(selectedMaskSlots_.size()!=1||!document.activeMaskId().empty()||document.frame().id!=frames[0].id||!hasCapture())throw std::runtime_error("Empty mask press/capture failed: group="+std::to_string(group)+" keys="+std::to_string(selectedMaskSlots_.size())+" active="+document.activeMaskId()+" frame="+std::to_string(document.frame().id==frames[0].id)+" capture="+std::to_string(hasCapture())+" gesture="+std::to_string(timelineGesture_.kind));
  for(int end:{1,2,3,4,3,2}){move(end);if(selectedMaskSlots_.size()!=std::size_t(end+1)||document.frame().id!=frames[end].id)throw std::runtime_error("Mask drag range did not grow/shrink with pointer");}
  up(2);
  auto verifySelectionOutline=[&]{
  for(const auto& outline:timelineOutlines()){
   auto material=skin_.selectionMaterialBounds(uiPhysical(outline.border).offset(outline.offset));material.offset(bounds().origin());
   auto image=os::instance()->makeRgbaSurface(std::max(bounds().x2(),material.x2()+2),std::max(bounds().y2(),material.y2()+2));image->clear();
   {ui::Graphics g(image);UiPaintScale scale(g);auto box=uiPhysical(outline.border).offset(outline.offset);box.offset(bounds().origin());skin_.drawSelectionBorder(g,box,false);}
   os::SurfaceLock lock(image.get());for(int y=std::max(0,material.y-1);y<=material.y2();++y)for(int x=std::max(0,material.x-1);x<=material.x2();++x){const gfx::Point at(x,y);const bool painted=gfx::geta(image->getPixel(x,y))!=0;if(skin_.selectionContains(material,at)!=painted)throw std::runtime_error("Mask range outline alpha/hit mismatch");if(outline.clip.contains(at)&&timelineBorderHit(at)!=painted)throw std::runtime_error("Mask range display hit mismatch");}
  }
  };verifySelectionOutline();
  if(hasCapture()||document.historyPosition()!=history||document.maskIsolated())throw std::runtime_error("Mask selection changed history or retained capture/isolation");
  down(2,ui::kKeyCtrlModifier);up(2);if(selectedMaskSlots_.size()!=2||document.frame().id!=frames[2].id)throw std::runtime_error("Mask Ctrl toggle failed");
  down(4,ui::kKeyShiftModifier);up(4);if(selectedMaskSlots_.size()!=5||document.frame().id!=frames[4].id)throw std::runtime_error("Mask Shift range failed");
  down(1);up(1);const auto prior=selectedMaskSlots_;const auto active=document.activeMaskId();down(0);move(4);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);
  if(selectedMaskSlots_!=prior||document.activeMaskId()!=active||document.frame().id!=frames[1].id||hasCapture())throw std::runtime_error("Mask drag cancellation failed");
  down(0);move(2);up(2);PixelMenu menu(skin_);buildAttachedMaskMenu(menu,owner,frames[2].id);bool linked=false;
  for(auto child:menu.children())if(auto item=dynamic_cast<PixelMenuItem*>(child);item&&item->icon=="animation-auto-link-on"){if(!item->isEnabled())throw std::runtime_error("Empty mask endpoint cannot link range");item->Click();linked=true;break;}
  if(!linked||!timeline::directMask(document.timeline().state(),owner,frames[0].id)||!timeline::directMask(document.timeline().state(),owner,frames[2].id))throw std::runtime_error("Empty mask endpoint link did not fill range");
  document.undo();refresh();if(timeline::directMask(document.timeline().state(),owner,frames[0].id)||timeline::directMask(document.timeline().state(),owner,frames[2].id))throw std::runtime_error("Mask range link undo failed");
  down(3);up(3);down(4,ui::kKeyCtrlModifier);up(4);PixelMenu empty(skin_);buildAttachedMaskMenu(empty,owner,frames[4].id);
  for(auto child:empty.children())if(auto item=dynamic_cast<PixelMenuItem*>(child);item&&item->icon=="animation-auto-link-on"&&item->isEnabled())throw std::runtime_error("All-empty mask range must not link");
  down(1);up(1);document.beginStroke({0,0},0xff0c0c0c);if(!document.commitStroke())throw std::runtime_error("Mask move pixel fixture failed");const auto root=timeline::directMask(document.timeline().state(),owner,frames[1].id)->mask;refresh();
  auto borderDown=[&]{const auto outlines=timelineOutlines();if(outlines.empty())throw std::runtime_error("Mask move outline missing");const auto& o=outlines.front();auto material=skin_.selectionMaterialBounds(uiPhysical(o.border).offset(o.offset));material.offset(bounds().origin());for(int y=material.y;y<material.y2();++y)for(int x=material.x;x<material.x2();++x)if(o.clip.contains(gfx::Point(x,y))&&skin_.selectionContains(material,{x,y})){ui::MouseMessage m(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,{x,y});onProcessMessage(&m);if(timelineGesture_.kind!=4||!timelineGesture_.canMove)throw std::runtime_error("Mask outline failed to start move");return;}throw std::runtime_error("Mask outline has no hittable material");};
  const auto moveHistory=document.historyPosition();borderDown();move(3);if(document.historyPosition()!=moveHistory||timeline::directMask(document.timeline().state(),owner,frames[1].id)->mask.id!=root.id)throw std::runtime_error("Mask move preview changed document");ui::KeyMessage cancelMove(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&cancelMove);
  borderDown();move(2);up(2);if(document.historyPosition()!=moveHistory+1||timeline::directMask(document.timeline().state(),owner,frames[2].id)->mask.id!=root.id||timeline::directMask(document.timeline().state(),owner,frames[1].id)->mask.surface.pixels[0]!=0xffffffff)throw std::runtime_error("Mask outline move did not transfer content/white source");document.undo();refresh();if(selectedMaskSlots_!=std::vector<Document::MaskSlotKey>({{owner,frames[1].id}}))throw std::runtime_error("Mask move undo selection failed");document.redo();refresh();
  if(!menuCommands_.invoke("copy")||!document.hasMaskClipboard())throw std::runtime_error("Mask cell copy menu dispatch failed");down(4);up(4);const auto pasteHistory=document.historyPosition();if(!menuCommands_.invoke("paste")||document.historyPosition()!=pasteHistory+1)throw std::runtime_error("Mask cell paste menu dispatch failed");const auto* pasted=timeline::directMask(document.timeline().state(),owner,frames[4].id);if(!pasted||pasted->mask.id==root.id||pasted->mask.surface.pixels!=root.surface.pixels)throw std::runtime_error("Mask cell paste independent content failed");
  if(!menuCommands_.invoke("cut")||timeline::directMask(document.timeline().state(),owner,frames[4].id))throw std::runtime_error("Mask cut dispatch failed");down(3);up(3);if(!menuCommands_.invoke("paste")||!timeline::directMask(document.timeline().state(),owner,frames[3].id))throw std::runtime_error("Mask cut clipboard paste failed");
  const auto shortcutHistory=document.historyPosition();
  down(3,ui::kKeyAltModifier);up(3);if(!document.maskIsolated()||selectedMaskSlots_!=std::vector<Document::MaskSlotKey>({{owner,frames[3].id}})||hasCapture())throw std::runtime_error("Alt mask isolation did not select target independently of dragging");
  down(3,ui::kKeyAltModifier);up(3);if(document.maskIsolated()||document.activeMaskId().empty())throw std::runtime_error("Repeated Alt mask click must return to composite edit");
  down(2,static_cast<decltype(ui::kKeyNoneModifier)>(ui::kKeyAltModifier|ui::kKeyShiftModifier));up(2);if(!document.maskIsolated()||selectedMaskSlots_.size()!=2||document.frame().id!=frames[2].id)throw std::runtime_error("Alt Shift mask selection failed");
  const auto isolatedId=document.activeMaskId();const auto isolatedKeys=selectedMaskSlots_;down(4,ui::kKeyAltModifier);up(4);if(document.activeMaskId()!=isolatedId||selectedMaskSlots_!=isolatedKeys||document.frame().id!=frames[2].id)throw std::runtime_error("Alt empty mask slot changed edit target");
  {ui::MouseMessage m(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyAltModifier,layerRows_[row-layerScroll_]->bounds().center());layerRows_[row-layerScroll_]->pointerPress(m);if(document.maskIsolated())throw std::runtime_error("Mask row Alt shortcut differs from cell");}
  timelineHidden_=true;refresh();{const TimelineRows compact(document.timeline(),document.collapsedGroupIds(),false);const int index=compact.index(owner)-layerScroll_;if(index<0||index>=int(hiddenMaskThumbnails_.size())||!hiddenMaskThumbnails_[index]->isVisible())throw std::runtime_error("Compact mask shortcut thumbnail missing");auto button=hiddenMaskThumbnails_[index];auto click=[&](bool alt){ui::MouseMessage m(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,alt?ui::kKeyAltModifier:ui::kKeyNoneModifier,button->bounds().center());button->onProcessMessage(&m);};
   click(true);if(!document.maskIsolated()||!selectedMaskSlots_.empty())throw std::runtime_error("Compact mask isolation failed to preserve context and clear timeline selection");click(true);if(document.maskIsolated())throw std::runtime_error("Compact repeated Alt did not exit isolation");click(true);click(false);if(document.maskIsolated()||document.activeMaskId().empty()||!selectedMaskSlots_.empty())throw std::runtime_error("Compact ordinary mask click changed legacy semantics");}
  timelineHidden_=false;refresh();if(document.historyPosition()!=shortcutHistory)throw std::runtime_error("Mask isolation changed document history");
  // An alias must display and edit its resolved root flags, never local defaults.
  if(!document.linkAttachedMasks({{owner,frames[2].id},{owner,frames[4].id}}))throw std::runtime_error("Mask shared flag fixture failed");document.selectFrame(frames[4].id);refresh();const int controlRow=TimelineRows(document.timeline(),document.collapsedGroupIds(),true).index(TimelineRows::maskRowId(owner))-layerScroll_;
  auto press=[&](TimelineButton* button){ui::MouseMessage m(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,button->bounds().center());button->onProcessMessage(&m);};
  if(!layerEyes_[controlRow]->isEnabled()||layerLocks_[controlRow]->isEnabled()==group||layerAutoLinks_[controlRow]->isEnabled()==group)throw std::runtime_error("Mask control availability differs from legacy");
  const auto flagHistory=document.historyPosition();press(layerEyes_[controlRow]);if(timeline::resolvedMask(document.timeline().state(),owner,frames[4].id)->visible||!timeline::directMask(document.timeline().state(),owner,frames[4].id)->mask.visible||layerEyes_[controlRow]->icon!="eyeOff"||document.historyPosition()!=flagHistory+1)throw std::runtime_error("Linked mask visibility edited local slot instead of resolved root");document.undo();refresh();
  if(!group){selectMaskSlot(owner,frames[4].id,0,nullptr,true);press(layerLocks_[controlRow]);if(!document.activeMaskId().empty()||document.maskIsolated()||!timeline::resolvedMask(document.timeline().state(),owner,frames[2].id)->locked)throw std::runtime_error("Mask lock did not exit canonical editing target");document.undo();refresh();if(!document.maskIsolated()||document.activeMaskId()!=isolatedId)throw std::runtime_error("Mask lock undo failed to restore isolated edit");document.redo();refresh();press(layerLocks_[controlRow]);press(layerAutoLinks_[controlRow]);if(!timeline::resolvedMask(document.timeline().state(),owner,frames[2].id)->autoLinkAnimationCels||timeline::directMask(document.timeline().state(),owner,frames[4].id)->mask.autoLinkAnimationCels||layerAutoLinks_[controlRow]->icon!="animation-auto-link-on")throw std::runtime_error("Mask auto-link toggle did not resolve root");}
  document.exitAttachedMask();document.selectFrame(frames[0].id);refresh();if(layerEyes_[controlRow]->isEnabled()||layerLocks_[controlRow]->isEnabled()||layerAutoLinks_[controlRow]->isEnabled())throw std::runtime_error("Empty mask frame exposed unavailable controls");
  // Actual name presses must select rows without entering an empty/filled mask.
  auto rowPress=[&](int index,ui::KeyModifiers mods=ui::kKeyNoneModifier){ui::MouseMessage m(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,mods,layerRows_[index-layerScroll_]->bounds().center());layerRows_[index-layerScroll_]->pointerPress(m);};
  TimelineRows panel(document.timeline(),document.collapsedGroupIds(),true);const int maskRow=panel.index(TimelineRows::maskRowId(owner)),ownerRow=panel.index(owner);
  const auto rowHistory=document.historyPosition(),frameCount=document.timeline().state().frames.size();rowPress(maskRow);
  if(document.timelineSelection().maskRows!=std::vector<std::string>{owner}||!selectedMaskSlots_.empty()||!document.activeMaskId().empty()||document.maskIsolated()||hasCapture()||document.historyPosition()!=rowHistory||!layerRows_[maskRow-layerScroll_]->timelineSelected)throw std::runtime_error("Mask row press entered cell editing or failed to select full row");
  rowPress(ownerRow,ui::kKeyCtrlModifier);if(document.timelineSelection().maskRows.size()!=1||(group?document.selectedGroupIds().size():document.timelineSelection().layers.size())!=1)throw std::runtime_error("Normal row Ctrl did not preserve mask row selection");
  rowPress(maskRow,ui::kKeyCtrlModifier);if(!document.timelineSelection().maskRows.empty()||(group?document.selectedGroupIds().size():document.timelineSelection().layers.size())!=1)throw std::runtime_error("Mask row Ctrl did not preserve normal rows");
  rowPress(maskRow,ui::kKeyShiftModifier);if(document.timelineSelection().maskRows.size()!=1||(group?document.selectedGroupIds().size():document.timelineSelection().layers.size())!=1)throw std::runtime_error("Normal-to-mask row Shift range failed");
  rowPress(maskRow);rowPress(ownerRow,ui::kKeyShiftModifier);if(document.timelineSelection().maskRows.size()!=1||(group?document.selectedGroupIds().size():document.timelineSelection().layers.size())!=1)throw std::runtime_error("Mask-to-normal row Shift range failed");verifySelectionOutline();
  rowPress(maskRow);if(group)document.setGroupLocked(owner,false);else document.setLayerLocked(false);const auto deleteHistory=document.historyPosition();if(!document.deleteAttachedMasks({}))throw std::runtime_error("Mask row delete transaction was rejected");selectedMaskSlots_.clear();refresh();
  if(!document.timeline().state().masks.empty()||document.timeline().state().frames.size()!=frameCount||document.historyPosition()!=deleteHistory+1||!document.timelineSelection().maskRows.empty())throw std::runtime_error("Mask row Delete did not atomically remove all frames without deleting frames: masks="+std::to_string(document.timeline().state().masks.size())+" frames="+std::to_string(document.timeline().state().frames.size())+" history="+std::to_string(document.historyPosition()-deleteHistory)+" rows="+std::to_string(document.timelineSelection().maskRows.size()));
  document.undo();refresh();if(document.timelineSelection().maskRows!=std::vector<std::string>{owner}||document.timeline().state().masks.empty()||!selectedMaskSlots_.empty())throw std::runtime_error("Mask row undo did not restore row selection");document.redo();refresh();if(!document.timeline().state().masks.empty()||!document.timelineSelection().maskRows.empty())throw std::runtime_error("Mask row redo did not clear rows");document.undo();refresh();
  down(1);up(1);if(!document.timelineSelection().maskRows.empty())throw std::runtime_error("Mask cell selection retained row selection");
  down(2,ui::kKeyAltModifier);up(2);const auto frameMask=document.activeMaskId();const auto frameHistory=document.historyPosition();
  auto header=frameHeaders_[0];ui::MouseMessage headerDown(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,header->bounds().center());header->pointerPress(headerDown);ui::MouseMessage headerUp(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,header->bounds().center());onProcessMessage(&headerUp);
  if(document.frame().id!=frames[0].id||document.selectedFrames()!=std::vector<std::string>{frames[0].id}||document.timelineSelection().maskRows!=std::vector<std::string>{owner}||!selectedMaskSlots_.empty()||document.activeMaskId()!=frameMask||!document.maskIsolated()||document.historyPosition()!=frameHistory||hasCapture())throw std::runtime_error("Frame header did not preserve mask edit and promote cells to owner row");
  rowPress(ownerRow);ui::MouseMessage ownerUp(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,layerRows_[ownerRow-layerScroll_]->bounds().center());onProcessMessage(&ownerUp);if(!document.timelineSelection().maskRows.empty()||!document.activeMaskId().empty()||document.maskIsolated())throw std::runtime_error("Normal row replace retained frame mask context");
  document.previewSelection({});paletteFocused_=false;requestFocus();const auto navigationHistory=document.historyPosition();
  navigateCel(ui::kKeyUp);
  if(selectedMaskSlots_!=std::vector<Document::MaskSlotKey>{{owner,frames[0].id}}||!document.activeMaskId().empty())throw std::runtime_error("Up navigation skipped empty layer/group mask row");
  navigateCel(ui::kKeyRight);if(selectedMaskSlots_!=std::vector<Document::MaskSlotKey>{{owner,frames[1].id}}||document.activeMaskId().empty()||document.maskIsolated())throw std::runtime_error("Right navigation lost mask row focus");
  navigateCel(ui::kKeyLeft);if(selectedMaskSlots_!=std::vector<Document::MaskSlotKey>{{owner,frames[0].id}}||!document.activeMaskId().empty())throw std::runtime_error("Left navigation did not retain empty mask target");
  navigateCel(ui::kKeyRight);navigateCel(ui::kKeyDown);if(!selectedMaskSlots_.empty()||!document.activeMaskId().empty()||document.timelineSelection().cels.empty())throw std::runtime_error("Down navigation did not exit mask to editable ordinary cel");
  if(document.historyPosition()!=navigationHistory)throw std::runtime_error("Mask keyboard navigation wrote history");stopCelNavigation();





 }
 {
  document=Document(2,1);document.fillSelectionOrCanvas(0xff123456);const auto owner=document.layer().id,first=document.frame().id;document.createAttachedMask(owner,first);document.exitAttachedMask();document.addFrame(false);const auto empty=document.frame().id;document.addFrame(false);document.fillSelectionOrCanvas(0xffabcdef);const auto third=document.frame().id;document.createAttachedMask(owner,third);document.exitAttachedMask();selectedMaskSlots_={{owner,first},{owner,third}};refresh();
  auto findItem=[&](PixelMenu& menu,const std::string& icon){for(auto child:menu.children())if(auto item=dynamic_cast<PixelMenuItem*>(child);item&&item->icon==icon)return item;throw std::runtime_error("Mask menu action missing");};
  copyMaskTimeline();PixelMenu emptyMenu(skin_);buildAttachedMaskMenu(emptyMenu,owner,empty);
  if(findItem(emptyMenu,"copy")->isEnabled()||findItem(emptyMenu,"paste")->isEnabled()||findItem(emptyMenu,"layerMask")->isEnabled())throw std::runtime_error("Empty mask/cel context menu must disable copy, paste and create");
  const auto before=document.historyPosition();PixelMenu menu(skin_);buildAttachedMaskMenu(menu,owner,first);auto remove=findItem(menu,"delete");if(!remove->isEnabled())throw std::runtime_error("Selected mask delete disabled");remove->Click();
  if(!document.timeline().state().masks.empty()||document.historyPosition()!=before+1||!selectedMaskSlots_.empty())throw std::runtime_error("Layer mask context delete must delete full selected set once");document.undo();refresh();if(document.timeline().state().masks.size()!=2||selectedMaskSlots_.size()!=2)throw std::runtime_error("Mask context batch delete undo lost selection");
  if(!document.createLayerGroup())throw std::runtime_error("Group mask menu setup");const auto group=*document.selectedGroupId();document.createAttachedMask(group,first,true);document.createAttachedMask(group,third,true);document.exitAttachedMask();selectedMaskSlots_={{group,first},{group,third}};refresh();
  PixelMenu groupMenu(skin_);buildAttachedMaskMenu(groupMenu,group,first);findItem(groupMenu,"delete")->Click();if(timeline::directMask(document.timeline().state(),group,first)||!timeline::directMask(document.timeline().state(),group,third))throw std::runtime_error("Group mask context delete must affect only clicked slot");document.undo();
 }
 selectedMaskSlots_.clear();maskSelectionAnchor_.reset();
document=Document(2,1);document.fillSelectionOrCanvas(0xff123456);const auto linkOwner=document.layer().id,linkFirst=document.frame().id;document.createAttachedMask(linkOwner,linkFirst);document.exitAttachedMask();document.addFrame(true);const auto linkLast=document.frame().id;selectedMaskSlots_={{linkOwner,linkLast},{linkOwner,linkFirst}};refresh();
 auto clickMaskAction=[&](const char* icon){PixelMenu menu(skin_);buildAttachedMaskMenu(menu,linkOwner,linkFirst);for(auto child:menu.children())if(auto item=dynamic_cast<PixelMenuItem*>(child);item&&item->icon==icon){if(!item->isEnabled())throw std::runtime_error("Mask link context action disabled");item->Click();return;}throw std::runtime_error("Mask link context action missing");};
 clickMaskAction("animation-auto-link-on");if(timeline::resolvedMask(document.timeline().state(),linkOwner,linkFirst)!=timeline::resolvedMask(document.timeline().state(),linkOwner,linkLast))throw std::runtime_error("Mask context link did not share earliest source");
 clickMaskAction("animation-auto-link-off");if(!timeline::directMask(document.timeline().state(),linkOwner,linkLast)->mask.linkedMaskId.empty())throw std::runtime_error("Root context unlink did not detach dependents");document.undo();refresh();if(timeline::directMask(document.timeline().state(),linkOwner,linkLast)->mask.linkedMaskId.empty()||selectedMaskSlots_.size()!=2)throw std::runtime_error("Mask link selection undo mismatch");selectedMaskSlots_.clear();document=Document(4,4);document.fillSelectionOrCanvas(0xff112233);const auto menuOwner=document.layer().id;document.addFrame(false);document.fillSelectionOrCanvas(0xff445566);document.selectTimelineLayer(menuOwner);refresh();
 if(!menuCommands_.enabled("toggleLayerMask")||!menuCommands_.invoke("toggleLayerMask")||document.timeline().state().masks.size()!=2||document.activeMaskId().empty())throw std::runtime_error("Layer menu must create all content-frame masks");
 const auto createdMask=document.activeMaskId();document.undo();if(!document.timeline().state().masks.empty())throw std::runtime_error("Bulk mask creation must undo once");document.redo();if(document.timeline().state().masks.size()!=2||document.activeMaskId()!=createdMask)throw std::runtime_error("Bulk mask creation redo/edit target failed");
 selectedMaskSlots_.clear();for(const auto& f:document.timeline().state().frames)selectedMaskSlots_.push_back({menuOwner,f.id});
 const auto beforeDeleteSelection=selectedMaskSlots_;document.setLayerLocked(true);const auto beforeBlockedDelete=document.historyPosition();deleteTimelineItems();
 if(document.timeline().state().masks.size()!=2||selectedMaskSlots_!=beforeDeleteSelection||document.historyPosition()!=beforeBlockedDelete)throw std::runtime_error("Locked mask deletion changed data or selection");
 document.setLayerLocked(false);const auto beforeDelete=document.historyPosition();deleteTimelineItems();if(!document.timeline().state().masks.empty()||!selectedMaskSlots_.empty()||document.historyPosition()!=beforeDelete+1)throw std::runtime_error("Selected mask deletion must be one transaction");
 document.undo();refresh();if(document.timeline().state().masks.size()!=2||selectedMaskSlots_!=beforeDeleteSelection||document.activeMaskId()!=createdMask)throw std::runtime_error("Mask delete undo did not restore selection/edit target");
 document.redo();refresh();if(!document.timeline().state().masks.empty()||!selectedMaskSlots_.empty())throw std::runtime_error("Mask delete redo did not clear selection");document.undo();refresh();
 document.exitAttachedMask();selectedMaskSlots_.clear();document.selectTimelineLayer(menuOwner);refresh();if(menuCommands_.enabled("toggleLayerMask"))throw std::runtime_error("Fully masked layer creation must be disabled");
 document.createLayerGroup();const auto menuGroup=*document.selectedGroupId();refresh();
 if(!menuCommands_.enabled("toggleGroupMask")||!menuCommands_.invoke("toggleGroupMask")||!timeline::directMask(document.timeline().state(),menuGroup,document.frame().id))throw std::runtime_error("Group menu creation failed");
 document.exitAttachedMask();selectedMaskSlots_.clear();refresh();if(!menuCommands_.invoke("toggleGroupMask")||timeline::directMask(document.timeline().state(),menuGroup,document.frame().id))throw std::runtime_error("Group menu deletion failed");document.undo();if(!timeline::directMask(document.timeline().state(),menuGroup,document.frame().id))throw std::runtime_error("Group mask deletion undo failed");
 selectedMaskSlots_.clear();document=Document(8,8);document.beginStroke({1,1},0xff0000ff);document.commitStroke();const auto owner=document.layer().id,frame=document.frame().id;document.createAttachedMask(owner,frame);document.exitAttachedMask();document.selectTimelineLayer(owner);refresh();
 if(!menuCommands_.enabled("maskMoveBinding")||!menuCommands_.invoke("maskMoveBinding")||timeline::resolvedMask(document.timeline().state(),owner,frame)->moveWithOwner)throw std::runtime_error("Layer menu mask binding route failed");
 document.undo();if(!timeline::resolvedMask(document.timeline().state(),owner,frame)->moveWithOwner)throw std::runtime_error("Layer menu mask binding undo failed");
 document.redo();menuCommands_.invoke("maskMoveBinding");
 if(!document.createLayerGroup())throw std::runtime_error("Mask binding group fixture failed");
 const auto group=*document.selectedGroupId();document.createAttachedMask(group,frame,true);document.exitAttachedMask();refresh();
 if(!menuCommands_.enabled("maskMoveBinding")||!menuCommands_.invoke("maskMoveBinding")||timeline::resolvedMask(document.timeline().state(),group,frame)->moveWithOwner)throw std::runtime_error("Group menu mask binding route failed");
 document.deleteAttachedMask(group,frame);document.selectTimelineLayer(owner);document.selectAttachedMask(owner,frame);refresh();
 if(menuCommands_.enabled("maskMoveBinding"))throw std::runtime_error("Mask surface must not be a layer property target");
 TimelineRows rows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);const auto row=rows.index(TimelineRows::maskRowId(owner));if(row<0||!selectMaskTimelineRow(row,0))throw std::runtime_error("Attached mask timeline row target unavailable");const auto before=document.pixels();document.beginStroke({1,1},0xff000000);if(!document.commitStroke()||document.pixels()!=before)throw std::runtime_error("Mask brush wrote ordinary cel");document.undo();document.redo();if(!document.selectAttachedMask(owner,frame))throw std::runtime_error("Mask reselection failed");const auto masked=document.timeline().state().masks;document.beginStroke({1,1},0xffffffff);document.cancelStroke();if(document.timeline().state().masks[0].mask.surface.pixels!=masked[0].mask.surface.pixels)throw std::runtime_error("Mask cancel changed raster");const auto archive=project::encodeEditableProject(document);auto imported=project::prepareEditableImport(project::readProjectManifest(archive.bytes));if(imported.timeline.masks.size()!=1||imported.timeline.masks[0].mask.surface.pixels!=masked[0].mask.surface.pixels)throw std::runtime_error("Mask save round trip mismatch");useFillTool();if(!document.fillPixels({0,0},0xff000000)||document.pixels()!=before)throw std::runtime_error("Mask fill route failed");document.undo();useGradientTool();GradientSpec g;g.start={0,0};g.end={7,0};if(!document.beginGradient({0,0},{})||!document.updateGradient(g,{}))throw std::runtime_error("Mask gradient route failed");const auto originalMask=document.timeline().state().masks[0].mask.surface.pixels;document.cancelGradient();if(document.timeline().state().masks[0].mask.surface.pixels!=originalMask)throw std::runtime_error("Mask gradient cancel changed owner");useShapeTool(ShapeKind::Rectangle);ShapeSpec shape;shape.bounds={2,2,3,3};if(!document.beginShapePreview()||!document.updateShapePreview(shape,0xff000000)||!document.commitShapePreview()||document.pixels()!=before)throw std::runtime_error("Mask shape route failed");document.undo();document.redo();document.exitAttachedMask();document=Document();refresh();}
void Editor::smokeMaskResize(){
 smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;document=Document(2,2);document.fillSelectionOrCanvas(0xffffffff);const auto owner=document.layer().id,frame=document.frame().id;document.createAttachedMask(owner,frame);document.beginStroke({1,1},0xff000000);document.commitStroke();document.markSaved();refresh();const auto before=document.timeline().state().masks[0].mask.surface.pixels;const auto history=document.historyPosition(),revision=document.revision();
 openCanvasResize(1);if(document.width()!=2||document.revision()!=revision||document.historyPosition()!=history||document.dirty()||document.timeline().state().masks[0].mask.surface.pixels!=before)throw std::runtime_error("Mask canvas resize cancel leaked draft");
 openCanvasResize(2);if(document.width()!=4||document.timeline().state().masks[0].mask.surface.offsetX!=1||document.timeline().state().masks[0].mask.surface.pixels!=before)throw std::runtime_error("Mask canvas resize anchor/bitmap mismatch");
 if(!document.resizeImage(8,8,ImageInterpolation::Smooth)||document.timeline().state().masks[0].mask.surface.offsetX!=2)throw std::runtime_error("Mask image resize world geometry");document.previewSelection(SelectionMask{2,2,4,4,{}});if(!document.cropCanvas()||document.timeline().state().masks[0].mask.surface.offsetX!=0)throw std::runtime_error("Mask crop route");
 const auto encoded=project::encodeEditableProject(document);const auto imported=project::prepareEditableImport(project::readProjectManifest(encoded.bytes));if(imported.width!=4||imported.timeline.masks[0].mask.surface.pixels!=document.timeline().state().masks[0].mask.surface.pixels)throw std::runtime_error("Mask resize save reopen");
 document.undo();document.undo();document.undo();if(document.width()!=2||document.timeline().state().masks[0].mask.surface.pixels!=before)throw std::runtime_error("Mask resize/crop undo");document.redo();document.redo();document.redo();refresh();
}

void Editor::smokeClippingMask(){
 smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;document=Document(2,1);document.beginStroke({0,0},0xff0000ff);document.commitStroke();refresh();const auto position=document.historyPosition();
 if(!menuCommands_.enabled("toggleClippingMask")||!menuCommands_.invoke("toggleClippingMask")||!document.layer().clippingMask||document.historyPosition()!=position+1)throw std::runtime_error("Actual clipping command/history missing");
 document.undo();if(document.layer().clippingMask)throw std::runtime_error("Clipping undo failed");document.redo();
 const auto encoded=project::encodeEditableProject(document);const auto imported=project::prepareEditableImport(project::readProjectManifest(encoded.bytes));if(!imported.timeline.layers[0].clippingMask)throw std::runtime_error("Clipping project reopen/composite mismatch");
 document.setLayerLocked(true);if(menuCommands_.enabled("toggleClippingMask")||document.toggleClippingMask())throw std::runtime_error("Locked clipping target changed");
 // Exercise the actual editor canvas route with a ghost outside the current
 // base alpha. Rendering must leave the source/history untouched.
 const auto savedOnion=onion_;document=Document(2,1);const auto base=document.layer().id;document.addLayer();const auto clip=document.layer().id;document.beginStroke({1,0},0xffffffff);document.commitStroke();document.toggleClippingMask();document.addFrame();document.selectLayer(base);document.beginStroke({0,0},0xff0000ff);document.commitStroke();document.selectLayer(clip);document.beginStroke({0,0},0xff00ff00);document.updateStroke({1,0});document.commitStroke();
 onion_.enabled=true;onion_.allLayers=false;onion_.previousFrames=1;onion_.nextFrames=0;onion_.previousOpacity=100;onion_.previousColor=0xffffffff;const auto history=document.historyPosition(),revision=document.revision();const auto layers=document.timeline().state().layers.size(),cels=document.timeline().state().cels.size();
 const auto expected=compositeOnionRegion(document.timeline(),document.frame().id,clip,{0,0,2,1},onion_);if(expected!=std::vector<timeline::Pixel>{0xff00ff00,0xffffffff})throw std::runtime_error("Clipped onion ghost insertion failed");ensureContentCache();if(document.historyPosition()!=history||document.revision()!=revision||document.timeline().state().layers.size()!=layers||document.timeline().state().cels.size()!=cels)throw std::runtime_error("Onion display mutated artwork");
 onion_=savedOnion;document=Document();refresh();
}

}
