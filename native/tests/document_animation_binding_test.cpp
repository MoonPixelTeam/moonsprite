#include "animation_change.h"
#include "document.h"
#include <iostream>
#include <memory>
#include <stdexcept>
#include <vector>

using namespace moon;
static void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
struct Event {
  AnimationChange change;
  std::string frame;
  bool loop;
  std::uint64_t revision;
  std::size_t position;
};
namespace {
struct SelectionOwner {
 std::shared_ptr<Document> document=std::make_shared<Document>(2,2);
 AnimationSessionSelection value;
 unsigned restored=0;
};
void bindSelectionOwner(const std::shared_ptr<SelectionOwner>& owner){
 owner->document->setAnimationSelectionAccess({
  [weak=std::weak_ptr<SelectionOwner>(owner)](const Document& document)->std::optional<AnimationSessionSelection>{const auto session=weak.lock();if(!session||session->document.get()!=&document)return {};return session->value;},
  [weak=std::weak_ptr<SelectionOwner>(owner)](const Document& document,AnimationSessionSelection value){const auto session=weak.lock();if(!session||session->document.get()!=&document)return;std::swap(session->value,value);++session->restored;}
 });
}
void verifyCompleteSessionSelectionHistory(){
 auto first=std::make_shared<SelectionOwner>(),second=std::make_shared<SelectionOwner>();auto& document=*first->document;
 document.addLayer();check(document.createLayerGroup(),"Group selection history fixture");
 const auto group=document.timeline().state().groups.front().id,frame=document.frame().id;
 bindSelectionOwner(first);bindSelectionOwner(second);
 first->value.groups={{group,frame}};first->value.groupAnchor=first->value.groups.front();
 second->value.groups={{"unrelated-session-group","unrelated-session-frame"}};const auto unrelated=second->value.groups;
 const auto saved=document.captureAnimationSelection();check(saved.sessionSelection&&saved.sessionSelection->groups==first->value.groups,"Complete snapshot omitted session group cells");
 first->value.groups.clear();first->value.groupAnchor.reset();check(document.restoreAnimationSelection(saved)&&first->value.groups==saved.sessionSelection->groups&&first->value.groupAnchor==saved.sessionSelection->groupAnchor,"Complete snapshot did not restore original session");
 // Reorder ownership records without rebinding: a background structure change
 // and its undo/redo must target the original weak owner, with no activation.
 std::vector<std::shared_ptr<SelectionOwner>> sessions{first,second};std::swap(sessions[0],sessions[1]);
 check(document.ungroupSelected(),"Group removal fixture");check(first->value.groups.empty()&&!first->value.groupAnchor,"Background structure retained invalid group slots");
 const auto afterBytes=document.historyBytes();document.undo();
 check(document.timeline().state().groups.size()==1&&first->value.groups==saved.sessionSelection->groups&&first->value.groupAnchor==saved.sessionSelection->groupAnchor,"Undo did not restore removed group selection");
 document.redo();check(document.timeline().state().groups.empty()&&first->value.groups.empty()&&!first->value.groupAnchor&&document.historyBytes()==afterBytes,"Redo did not restore normalized after selection and budget");
 check(second->value.groups==unrelated&&second->restored==0,"Background selection history touched another owner");
 auto copy=std::make_unique<Document>(document);check(!copy->captureAnimationSelection().sessionSelection,"Document copy retained live session access");
 auto retained=first->document;std::weak_ptr<SelectionOwner> weak=first;sessions.clear();first.reset();check(weak.expired()&&!retained->captureAnimationSelection().sessionSelection,"Selection binding kept closed owner alive");
}
void verifyMaskSessionSelectionHistory(){
 auto owner=std::make_shared<SelectionOwner>();auto& document=*owner->document;
 check(document.fillSelectionOrCanvas(0xff123456),"Mask selection history pixels");const auto layer=document.layer().id,frame=document.frame().id;
 check(document.createAttachedMask(layer,frame),"Mask selection history fixture");document.exitAttachedMask();bindSelectionOwner(owner);
 const AnimationSessionSelection::MaskSlot slot{layer,frame};owner->value.masks={slot};owner->value.maskAnchor=slot;
 check(document.deleteAttachedMasks({slot})&&owner->value.masks.empty()&&!owner->value.maskAnchor,"Deleted mask selection was not normalized");
 document.undo();check(owner->value.masks==std::vector<AnimationSessionSelection::MaskSlot>{slot}&&owner->value.maskAnchor==slot&&document.timeline().state().masks.size()==1,"Mask undo lost full selection snapshot");
 document.redo();check(owner->value.masks.empty()&&!owner->value.maskAnchor&&document.timeline().state().masks.empty(),"Mask redo lost normalized selection");document.undo();
 owner->value.masks={slot,slot,{"missing-owner",frame}};owner->value.maskAnchor=AnimationSessionSelection::MaskSlot{"missing-owner",frame};
 const auto revision=document.revision(),content=document.contentRevision(),history=document.historyRevision(),position=document.historyPosition();const bool dirty=document.dirty();
 document.normalizeAnimationSelection();
 check(owner->value.masks==std::vector<AnimationSessionSelection::MaskSlot>{slot}&&owner->value.maskAnchor==slot,"Explicit normalization did not deduplicate/repair mask anchor");
 check(document.revision()==revision&&document.contentRevision()==content&&document.historyRevision()==history&&document.historyPosition()==position&&document.dirty()==dirty,"Selection normalization published document content/history");
 {auto noChange=document.trackAnimationSelectionHistory(true);}
 check(document.historyRevision()==history&&document.historyPosition()==position,"No-op selection scope annotated an unrelated history entry");
}
}
void verifyTrimDoesNotCreateSelectionHistory(){
 auto owner=std::make_shared<SelectionOwner>();auto& document=*owner->document;bindSelectionOwner(owner);
 document.commitSelection({},SelectionMask{0,0,2,2,{}});document.deselectPixels();
 check(document.historySize()==2,"Selection-only trim fixture");
 std::uint64_t revision=0;std::size_t bytes=0;
 {
  auto scope=document.trackAnimationSelectionHistory(true);
  document.setHistoryEntryLimit(1);
  revision=document.historyRevision();bytes=document.historyBytes();
 }
 check(document.historyRevision()==revision&&document.historyBytes()==bytes&&owner->restored==0,
       "Trim-only scope annotated or normalized a pre-existing selection entry");
 document.undo();check(owner->restored==0,"Trim attached session selection to an old entry");
}
void verifyCelCutSelectionContract(){
 auto owner=std::make_shared<SelectionOwner>();auto& document=*owner->document;
 check(document.fillSelectionOrCanvas(0xff123456),"Cel cut visible fixture");bindSelectionOwner(owner);
 document.selectTimelineCel(document.cel().id);check(document.cutSelectedCels(),"Cel cut command");
 check(document.timelineSelection().cels.empty()&&document.pixels()[0]==0,"Cel cut did not clear selected content");
 document.undo();check(document.pixels()[0]==0xff123456&&document.timelineSelection().cels.empty(),"Cel cut undo revived cleared Cel selection");
 document.redo();check(document.pixels()[0]==0&&document.timelineSelection().cels.empty()&&owner->restored==0,"Cel cut redo restored unrelated session selection");
}
void verifyFramePasteSelectionContract(){
 auto owner=std::make_shared<SelectionOwner>();auto& document=*owner->document;
 check(document.fillSelectionOrCanvas(0xff123456),"Frame paste visible fixture");
 const auto layer=document.layer().id,frame=document.frame().id;
 check(document.createAttachedMask(layer,frame),"Frame paste mask fixture");document.exitAttachedMask();
 document.selectFrameHeader(frame);check(document.copySelectedFrames(),"Frame paste clipboard fixture");const auto clipboard=document.exportFrameClipboard();
 bindSelectionOwner(owner);owner->value.masks={{layer,frame}};owner->value.maskAnchor=owner->value.masks.front();
 document.selectAttachedMask(layer,frame,true);
 check(document.pasteFrameClipboard(clipboard),"Frame paste command");
 // Editor clears these UI cells after successful local paste. Legacy undo/redo
 // keep that cleared state rather than reviving the pre-paste mask selection.
 owner->value.masks.clear();owner->value.maskAnchor.reset();
 for(int direction=0;direction<2;++direction){if(direction==0)document.undo();else document.redo();
  check(owner->value.masks.empty()&&!owner->value.maskAnchor&&document.activeMaskId().empty()&&!document.maskIsolated(),"Frame paste history revived a cleared mask context");
 }
}
void verifyFrameCreationSelectionContract(){
 for(int command=0;command<3;++command)for(int mode=0;mode<5;++mode){
  auto owner=std::make_shared<SelectionOwner>(),other=std::make_shared<SelectionOwner>();auto& d=*owner->document;
  d.fillSelectionOrCanvas(0xff123456);const auto layer=d.layer().id;
  d.addLayer();check(d.createLayerGroup(),"Frame creation group fixture");const auto group=d.timeline().state().groups.front().id;
  d.selectLayer(layer);const auto frame=d.frame().id,cel=d.cel().id;
  check(d.createAttachedMask(layer,frame),"Frame creation mask fixture");d.exitAttachedMask();
  d.selectTimelineLayer(layer);bindSelectionOwner(owner);bindSelectionOwner(other);
  other->value.groups={{"other-group","other-frame"}};const auto unrelated=other->value.groups;
  if(mode==0){d.selectFrameHeader(frame);owner->value.frameSelection=true;}
  if(mode==1)d.selectTimelineCel(cel);
  if(mode==2){owner->value.groups={{group,frame}};owner->value.groupAnchor=owner->value.groups.front();}
  if(mode==3){owner->value.masks={{layer,frame}};owner->value.maskAnchor=owner->value.masks.front();d.selectAttachedMask(layer,frame,true);}
  if(mode==4){auto rows=d.timelineSelection();rows.maskRows={layer};d.restoreTimelineSelection(rows,{});d.selectAttachedMask(layer,frame,true);}
  d.previewSelection(SelectionMask{0,0,1,1,{}});const auto rows=d.timelineSelection().layers,groups=d.selectedGroupIds();
  const auto history=d.historyPosition();if(command==2)d.addLinkedFrame();else d.addFrame(command==1);
  const auto inserted=d.frame().id;
  auto cleared=[&]{return d.selectedFrames().empty()&&d.frameSelectionAnchor().empty()&&d.timelineSelection().cels.empty()&&d.timelineSelection().celAnchor.empty()&&d.timelineSelection().maskRows.empty()&&d.activeMaskId().empty()&&!d.maskIsolated()&&owner->value.masks.empty()&&!owner->value.maskAnchor&&owner->value.groups.empty()&&!owner->value.groupAnchor&&!owner->value.frameSelection;};
  check(d.historyPosition()==history+1&&!d.selection()&&cleared(),"Frame creation missed initial item/mask clearing");
  check(d.timelineSelection().layers==rows&&d.selectedGroupIds()==groups,"Frame creation lost selected rows");
  if(command==1)check(d.canvasPixels()[0]==0xff123456,"Duplicate frame lost source content");
  if(command==2)check(d.cel().linkedCelId.has_value(),"Linked creation lost link");
  d.undo();check(d.frame().id==frame&&!d.selection()&&cleared(),"Frame creation undo revived cleared items/mask/selection");
  // Selection changes after Undo are current session state. Redo clears items,
  // keeps the newly chosen rows and pixel selection, and exits mask editing.
  d.selectTimelineRow({LayerPanelKind::Group,group,0});const auto currentRows=d.timelineSelection().layers,currentGroups=d.selectedGroupIds();
  owner->value.groups={{group,frame}};owner->value.groupAnchor=owner->value.groups.front();
  d.selectAttachedMask(layer,frame,true);d.previewSelection(SelectionMask{1,1,1,1,{}});
  d.redo();check(d.frame().id==inserted&&cleared()&&d.selection()&&d.selection()->x==1,"Frame creation redo did not clear current items or kept stale pixel history");
  check(d.timelineSelection().layers==currentRows&&d.selectedGroupIds()==currentGroups,"Frame creation redo restored stale row selection");
  // Undo also preserves newly selected surviving frame items and row focus.
  d.selectFrameHeader(frame,1,true);owner->value.frameSelection=true;d.undo();
  check(d.frame().id==frame&&d.selectedFrames()==std::vector<std::string>{frame}&&owner->value.frameSelection&&d.selectedGroupIds()==currentGroups,"Frame creation undo replaced current surviving selection");
  check(other->value.groups==unrelated&&other->restored==0,"Frame creation changed another session");
 }
}
void verifyExistingRightFrameLinkSelectionContract(){
 for(int mode=0;mode<4;++mode){
  auto owner=std::make_shared<SelectionOwner>();auto& d=*owner->document;d.fillSelectionOrCanvas(0xff123456);
  const auto first=d.frame().id,layer=d.layer().id;d.addFrame();const auto right=d.frame().id;d.selectFrame(first);
  d.addLayer();check(d.createLayerGroup(),"Existing link group fixture");const auto group=d.timeline().state().groups.front().id;d.selectLayer(layer);
  check(d.createAttachedMask(layer,first),"Existing link mask fixture");d.exitAttachedMask();bindSelectionOwner(owner);
  if(mode==0){d.selectFrameHeader(first);owner->value.frameSelection=true;}
  if(mode==1)d.selectTimelineCel(d.cel().id);
  if(mode==2){owner->value.groups={{group,first}};owner->value.groupAnchor=owner->value.groups.front();}
  if(mode==3){owner->value.masks={{layer,first}};owner->value.maskAnchor=owner->value.masks.front();d.selectAttachedMask(layer,first,true);}
  const auto before=d.captureAnimationSelection();const auto history=d.historyPosition();d.addLinkedFrame();
  check(d.frame().id==right&&d.timeline().state().frames.size()==2&&d.historyPosition()==history+1&&d.cel().linkedCelId.has_value(),"Existing right link inserted a frame or lost link");
  check(owner->value.masks.empty()&&owner->value.groups.empty()&&!owner->value.frameSelection&&d.activeMaskId().empty(),"Existing right link did not clear items");
  d.undo();const auto restored=d.captureAnimationSelection();
  check(restored.frames==before.frames&&restored.selection.cels==before.selection.cels&&restored.selection.layers==before.selection.layers&&restored.activeFrame==before.activeFrame&&restored.activeMask==before.activeMask&&restored.maskIsolated==before.maskIsolated,"Existing right link undo lost document context");
  check(owner->value.groups==before.sessionSelection->groups&&owner->value.groupAnchor==before.sessionSelection->groupAnchor&&owner->value.masks==before.sessionSelection->masks&&owner->value.maskAnchor==before.sessionSelection->maskAnchor&&owner->value.frameSelection==before.sessionSelection->frameSelection,"Existing right link undo lost session context");
  d.redo();check(d.frame().id==right&&owner->value.masks.empty()&&owner->value.groups.empty()&&!owner->value.frameSelection&&d.activeMaskId().empty(),"Existing right link redo lost after selection");
 }
}
void verifyNormalizedSlotOrder(){
 auto owner=std::make_shared<SelectionOwner>();auto& document=*owner->document;const auto first=document.frame().id;document.addFrame();const auto second=document.frame().id;
 document.addLayer();check(document.createLayerGroup(),"Ordered slot normalization group fixture");const auto group=document.timeline().state().groups.front().id;bindSelectionOwner(owner);
 const std::vector<AnimationCellSlot> expected{{group,second},{group,first}};
 owner->value.groups={expected[0],expected[1],expected[0],{"missing-group",first}};owner->value.groupAnchor=expected[1];
 const auto revision=document.revision(),content=document.contentRevision(),history=document.historyRevision();
 document.normalizeAnimationSelection();
 check(owner->value.groups==expected&&owner->value.groupAnchor==expected[1],"Normalization changed first-occurrence slot order or valid anchor");
 check(document.revision()==revision&&document.contentRevision()==content&&document.historyRevision()==history,"Slot normalization published content/history");
}
void verifyImplicitLayerSelectionNormalization(){
 auto owned=std::make_unique<Document>(2,2);auto& document=*owned;
 document.addLayer();const auto created=document.layer().id;
 check(document.timelineSelection().layers.empty(),"New layer created an explicit row selection");
 document.normalizeAnimationSelection();check(document.timelineSelection().layers.empty()&&document.layer().id==created,"Normalization promoted implicit layer focus");
 const auto target=document.timeline().state().layers.back().id;document.selectLayer(target);
 timeline::ColorOverlayStyle style;style.enabled=true;style.shadow.enabled=true;style.shadow.offsetX=-3;
 check(document.beginLayerStyle()&&document.commitLayerStyle(style),"Implicit target style commit failed");
 check(document.layer().layerStyles&&document.layer().layerStyles->shadow.offsetX==-3&&!document.layerStyle(created),"Implicit style applied to a stale explicit layer");
 document.undo();check(!document.layer().layerStyles,"Implicit style undo failed");document.redo();check(document.layer().layerStyles&&document.timelineSelection().layers.empty(),"Implicit style redo changed selection mode");
 document.selectTimelineLayer(created);document.normalizeAnimationSelection();check(document.timelineSelection().layers==std::vector<std::string>{created},"Normalization lost explicit layer selection");
}
void verifyLayerCreationSelectionContract(){
 for(int path=0;path<3;++path)for(int mode=0;mode<6;++mode){
  auto owner=std::make_shared<SelectionOwner>(),other=std::make_shared<SelectionOwner>();auto& d=*owner->document;
  d.fillSelectionOrCanvas(0xff123456);const auto original=d.layer().id,first=d.frame().id;d.addFrame();const auto second=d.frame().id;d.selectFrame(first);
  std::string group;if(path==1){d.selectTimelineLayer(original);check(d.createLayerGroup(),"Layer creation parent fixture");group=*d.selectedGroupId();d.selectTimelineLayer(original);}
  check(d.createAttachedMask(original,first),"Layer creation mask fixture");d.exitAttachedMask();bindSelectionOwner(owner);bindSelectionOwner(other);
  other->value.groups={{"other-group","other-frame"}};const auto unrelated=other->value.groups;
  if(mode==0)d.selectTimelineLayer(original);
  if(mode==1){d.selectFrameHeader(first);owner->value.frameSelection=true;}
  if(mode==2)d.selectTimelineCel(d.cel().id);
  if(mode==3){owner->value.masks={{original,first}};owner->value.maskAnchor=owner->value.masks.front();d.selectAttachedMask(original,first,true);}
  if(mode==4){auto rows=d.timelineSelection();rows.maskRows={original};d.restoreTimelineSelection(rows,{});d.selectAttachedMask(original,first,true);}
  if(mode==5&&!group.empty()){d.selectTimelineRow({LayerPanelKind::Group,group,0});owner->value.groups={{group,first}};owner->value.groupAnchor=owner->value.groups.front();}
  const auto expectedParent=path==1&&(mode==0||mode==3||mode==4)?std::optional<std::string>(group):std::nullopt;
  d.previewSelection(SelectionMask{0,0,1,1,{}});const auto history=d.historyPosition();
  if(path==2)d.createGradientMapLayer();else d.addLayer();const auto created=d.layer().id;
  auto cleared=[&]{return d.timelineSelection().layers.empty()&&d.selectedGroupIds().empty()&&!d.selectedGroupId()&&d.selectedFrames().empty()&&d.frameSelectionAnchor().empty()&&d.timelineSelection().cels.empty()&&d.timelineSelection().celAnchor.empty()&&d.timelineSelection().maskRows.empty()&&d.activeMaskId().empty()&&!d.maskIsolated()&&owner->value.groups.empty()&&!owner->value.groupAnchor&&owner->value.masks.empty()&&!owner->value.maskAnchor&&!owner->value.frameSelection;};
  check(created!=original&&d.historyPosition()==history+1&&d.frame().id==first&&cleared()&&d.selection()&&d.selection()->x==0,"Layer creation clearing/history/pixel selection");
  check(d.layer().groupId==expectedParent,"Layer creation parent placement");
  check(path!=2||(d.layer().kind=="adjustment"&&d.layer().adjustment&&d.layer().adjustment->enabled),"Gradient-map creation properties");
  d.undo();check(d.layer().id==original&&d.frame().id==first&&cleared()&&d.selection(),"Layer creation Undo revived old selection");
  d.redo();check(d.layer().id==created&&cleared()&&d.selection(),"Layer creation Redo revived old selection");
  // A later frame/row/Cel choice belongs to the current session, not this edit.
  d.selectFrame(second);d.selectTimelineLayer(original);d.selectTimelineCel(d.timeline().findCel(original,second)->id);
  d.previewSelection(SelectionMask{1,1,1,1,{}});const auto current=d.captureAnimationSelection();
  d.undo();check(d.frame().id==second&&d.layer().id==original&&d.timelineSelection().layers==current.selection.layers&&d.timelineSelection().cels==current.selection.cels&&d.selection()&&d.selection()->x==1,"Layer Undo replaced current frame/items/pixel selection");
  d.redo();check(d.frame().id==second&&d.layer().id==created&&d.timelineSelection().layers==current.selection.layers&&d.timelineSelection().cels==current.selection.cels&&d.selection()&&d.selection()->x==1,"Layer Redo replaced current frame/items/pixel selection");
  check(other->value.groups==unrelated&&other->restored==0,"Layer history changed another session");
 }
}
void verifyLayerCopySelectionContract(){
 for(bool drag:{false,true})for(int mode=0;mode<6;++mode){
  auto owner=std::make_shared<SelectionOwner>(),other=std::make_shared<SelectionOwner>();auto& d=*owner->document;
  d.fillSelectionOrCanvas(0xff123456);const auto original=d.layer().id,first=d.frame().id;d.addFrame();const auto second=d.frame().id;d.selectFrame(first);
  d.selectTimelineLayer(original);check(d.createLayerGroup(),"Copy group fixture");const auto group=*d.selectedGroupId();d.selectLayer(original);
  check(d.createAttachedMask(original,first),"Copy mask fixture");d.exitAttachedMask();bindSelectionOwner(owner);bindSelectionOwner(other);
  d.selectTimelineLayer(original);auto before=d.captureAnimationSelection();
  if(mode==1){before.frames={first};before.frameAnchor=first;before.sessionSelection->frameSelection=true;}
  if(mode==2){before.selection.cels={d.cel().id};before.selection.celAnchor=d.cel().id;}
  if(mode==3){before.sessionSelection->groups={{group,first}};before.sessionSelection->groupAnchor=before.sessionSelection->groups.front();}
  if(mode==4||mode==5){d.selectAttachedMask(original,first,true);before=d.captureAnimationSelection();if(mode==4){before.sessionSelection->masks={{original,first}};before.sessionSelection->maskAnchor=before.sessionSelection->masks.front();}else before.selection.maskRows={original};}
  check(d.restoreAnimationSelection(before),"Copy before selection fixture");d.previewSelection(SelectionMask{0,0,1,1,{}});
  other->value.groups={{"other","frame"}};const auto unrelated=other->value.groups;const auto h=d.historyPosition();
  if(drag)check(d.moveLayerPanelRows({LayerPanelDropTarget::Kind::Bottom,LayerPanelKind::Layer,{}},true),"Copy drag failed");else d.duplicateSelectedLayers();
  const auto copy=d.layer().id;const auto after=d.captureAnimationSelection();
  auto noMask=[&]{return d.activeMaskId().empty()&&!d.maskIsolated()&&d.timelineSelection().maskRows.empty()&&owner->value.masks.empty()&&!owner->value.maskAnchor;};
  check(copy!=original&&d.historyPosition()==h+1&&noMask()&&d.selection(),"Copy creation history/mask/pixel selection");
  check(after.frames==before.frames&&after.selection.cels==before.selection.cels&&owner->value.groups==before.sessionSelection->groups,"Copy cleared unrelated animation items");
  check(d.timelineSelection().layers==std::vector<std::string>{copy},"Copy did not select copied rows");
  d.undo();check(d.layer().id==original&&d.frame().id==first&&d.timelineSelection().layers==before.selection.layers&&noMask()&&d.selection(),"Copy Undo restored stale mask or lost rows");
  d.redo();check(d.layer().id==copy&&noMask(),"Copy Redo restored stale mask");
  d.selectFrame(second);d.selectTimelineCel(d.timeline().findCel(original,second)->id);owner->value={};const auto current=d.captureAnimationSelection();
  d.undo();check(d.layer().id==original&&d.frame().id==(drag?first:second),"Copy Undo current frame contract");
  check(d.timelineSelection().cels==(drag?before.selection.cels:current.selection.cels)&&owner->value.groups==(drag?before.sessionSelection->groups:current.sessionSelection->groups),"Copy Undo current item contract");
  d.redo();check(d.layer().id==copy&&d.frame().id==(drag?first:second)&&d.timelineSelection().cels==(drag?after.selection.cels:current.selection.cels)&&noMask(),"Copy Redo current item contract");
  check(other->value.groups==unrelated&&other->restored==0,"Copy touched another session");
 }
 {Document d(2,2);d.addLayer();check(d.timelineSelection().layers.empty()&&d.canDuplicateSelectedLayers(),"Implicit target copy disabled");const auto id=d.layer().id;d.duplicateSelectedLayers();check(d.layer().id!=id,"Implicit target copy missing");d.undo();check(d.layer().id==id&&d.timelineSelection().layers.empty(),"Implicit copy Undo changed selection mode");d.selectFrameHeader(d.frame().id);check(!d.canDuplicateSelectedLayers(),"Frame-only selection copied implicit layer");}
}
void verifyLayerCopyResources(){
 for(bool free:{false,true}){
  auto document=std::make_unique<Document>(2,2);auto& d=*document;d.fillSelectionOrCanvas(0xff123456);
  check(free?d.createFreeTileLayer(U"Copy free"):d.convertLayerToTilemap(1,1,U"Copy tiles"),"Copy resource fixture");
  const auto original=d.layer().id,source=d.tileSelection().tilesetId;d.addFrame(true);d.selectTimelineLayer(original);const auto before=d.timeline().state().tilesets.size();d.duplicateSelectedLayers();const auto copy=d.layer().id,set=d.tileSelection().tilesetId;
  check(copy!=original&&set!=source&&d.timeline().state().tilesets.size()==before+1,"Copy owned resource selection/remapping");
  d.undo();check(d.tileSelection().tilesetId==source&&d.timeline().state().tilesets.size()==before,"Copy resource Undo");
  d.redo();check(d.tileSelection().tilesetId==set&&d.timeline().state().tilesets.size()==before+1,"Copy resource Redo");
 }
}
void verifyLayerCreationRasterReplay(){
 for(bool grouped:{false,true}){
  auto document=std::make_unique<Document>(16,16);auto& d=*document;
  d.beginStroke({5,5},0xff123456);d.commitStroke();const auto original=d.layer().id;
  if(grouped){d.selectTimelineLayer(original);check(d.createLayerGroup(),"Layer raster replay group fixture");d.selectTimelineLayer(original);}
  const auto before=d.historyPosition();d.addLayer();const auto created=d.layer().id;
  d.beginStroke({12,11},0xffabcdef);d.commitStroke();const auto after=d.historyPosition();
  for(int cycle=0;cycle<3;++cycle){
   check(d.setHistoryPosition(before)&&!d.timeline().hasLayer(created),"Layer creation Undo did not detach layer");
   check(d.setHistoryPosition(after)&&d.layer().id==created&&d.canvasPixels()[11*16+12]==0xffabcdef,"Layer creation Redo lost expanded raster history");
   d.selectLayer(original);check(d.canvasPixels()[5*16+5]==0xff123456,"Layer replay changed another layer pixels");
  }
 }
}
int main(){try{verifyLayerCopySelectionContract();verifyLayerCopyResources();verifyLayerCreationSelectionContract();verifyLayerCreationRasterReplay();verifyImplicitLayerSelectionNormalization();verifyCompleteSessionSelectionHistory();verifyMaskSessionSelectionHistory();verifyTrimDoesNotCreateSelectionHistory();verifyNormalizedSlotOrder();verifyFramePasteSelectionContract();verifyCelCutSelectionContract();verifyFrameCreationSelectionContract();verifyExistingRightFrameLinkSelectionContract();
  Document document(3,1);
  const auto first=document.frame().id;
  document.addFrame();const auto second=document.frame().id;
  std::vector<Event> events;
  document.setAnimationChangeListener([&](const Document& source,const AnimationChange& change){
    check(&source==&document,"Notification changed document owner");
    if(change.kind==AnimationChange::Kind::SelectionPreviewChanged)return;
    events.push_back({change,source.frame().id,source.animationLoop(),source.revision(),source.historyPosition()});
  });
  const auto history=document.historySize(),revision=document.revision();
  document.selectFrame(first);
  check(events.size()==1&&events.back().change.kind==AnimationChange::Kind::FrameSelected&&events.back().change.origin==AnimationFrameOrigin::Manual&&events.back().frame==first,"Manual frame event");
  document.selectFrame(second,AnimationFrameOrigin::Playback);
  check(events.size()==2&&events.back().change.origin==AnimationFrameOrigin::Playback&&events.back().frame==second,"Playback frame event");
  document.selectFrame(second);document.selectFrame("missing");
  check(events.size()==2&&document.historySize()==history&&document.revision()==revision,"No-op/view change edited history or emitted an event");
  document.setImportedLoop(false);document.setImportedLoop(false);
  check(events.size()==3&&events.back().change.kind==AnimationChange::Kind::LoopChanged&&!events.back().loop&&document.revision()==revision,"Imported loop event changed metadata/history");
  document.setAnimationLoop(true);
  check(events.size()==4&&events.back().change.kind==AnimationChange::Kind::HistoryChanged&&events.back().loop&&events.back().revision==document.revision()&&events.back().position==document.historyPosition(),"Loop history notification was not final");
  document.undo();check(events.size()==5&&!events.back().loop&&events.back().change.historyKind==HistoryStackChange::Kind::Undo&&events.back().revision==document.revision(),"Undo loop notification");
  document.redo();check(events.size()==6&&events.back().loop&&events.back().change.historyKind==HistoryStackChange::Kind::Redo,"Redo loop notification");

  // Undo must select the edited cel, but publish only the final history state.
  document.selectFrame(first);document.beginStroke({0,0},0xff123456);document.commitStroke();
  document.selectFrame(second,AnimationFrameOrigin::Playback);events.clear();
  document.undo();
  check(events.size()==1&&events[0].change.kind==AnimationChange::Kind::HistoryChanged&&events[0].frame==first&&events[0].position==document.historyPosition()&&events[0].revision==document.revision(),"Intermediate replay frame leaked as manual navigation");
  document.redo();check(events.size()==2&&events.back().change.historyKind==HistoryStackChange::Kind::Redo,"Redo final notification");

  const auto count=events.size();
  Document copied(document);copied.selectFrame(second);copied.setImportedLoop(false);
  Document assigned(1,1);assigned.setAnimationChangeListener([](const auto&,const auto&){throw std::runtime_error("Destination observer survived replacement");});assigned=document;assigned.selectFrame(second);
  check(events.size()==count,"Clone/checkpoint inherited live observation");
  Document other(1,1);other.addFrame();other.setImportedLoop(false);
  check(events.size()==count,"Inactive unrelated document reached active observer");
  document.setAnimationChangeListener({});document.selectFrame(second);check(events.size()==count,"Unsubscribe retained observer");
  auto owner=std::make_shared<int>(1);std::weak_ptr<int> weak=owner;
  document.setAnimationChangeListener([&,owner](const auto&,const auto&){document.setAnimationChangeListener({});check(!weak.expired(),"Self-unsubscribe destroyed running callback");});owner.reset();document.selectFrame(first);check(weak.expired(),"Detached callback retained owner");

  // Replay suppression is nestable and restored on exceptions.
  AnimationChangeBinding binding;unsigned notifications=0;
  binding.set([&](const auto&,const auto&){++notifications;});
  try{auto outer=binding.replayHistory();{auto inner=binding.replayHistory();binding.publish(document,{AnimationChange::Kind::FrameSelected});}throw std::runtime_error("replay failure");}catch(const std::runtime_error&){}
  binding.publish(document,{AnimationChange::Kind::LoopChanged});check(notifications==1,"Replay exception left notification suppression active");
  notifications=0;
  try{
    auto outer=binding.deferSelectionPreview();
    {auto inner=binding.deferSelectionPreview();binding.publish(document,{AnimationChange::Kind::SelectionPreviewChanged});}
    binding.publish(document,{AnimationChange::Kind::SelectionPreviewChanged});
    binding.publish(document,{AnimationChange::Kind::HistoryChanged});
    binding.publish(document,{AnimationChange::Kind::FloatingSettled});
    check(notifications==2,"Temporary floating scope suppressed history/settlement or leaked selection");
    AnimationChangeBinding copied(binding);unsigned detached=0;
    copied.set([&](const auto&,const auto&){++detached;});
    copied.publish(document,{AnimationChange::Kind::SelectionPreviewChanged});
    check(detached==1,"Copied binding inherited temporary selection suppression");
    throw std::runtime_error("temporary floating failure");
  }catch(const std::runtime_error& error){check(std::string(error.what())=="temporary floating failure",error.what());}
  binding.publish(document,{AnimationChange::Kind::SelectionPreviewChanged});
  check(notifications==3,"Temporary floating exception left selection suppression active");
  {auto disabled=binding.deferSelectionPreview(false);binding.publish(document,{AnimationChange::Kind::SelectionPreviewChanged});}
  check(notifications==4,"Nonfloating script suppressed ordinary selection projection");
  {
    AnimationChangeBinding operations;std::uint64_t selectedRevision=0;std::vector<AnimationChange> delivered;
    operations.set([&](const auto&,const auto& event){delivered.push_back(event);});
    {
      auto outer=operations.selectionOperation(document,selectedRevision);
      ++selectedRevision;
      {auto inner=operations.selectionOperation(document,selectedRevision);++selectedRevision;operations.publish(document,{AnimationChange::Kind::HistoryChanged});}
      operations.publish(document,{AnimationChange::Kind::FloatingSettled});
      check(delivered.size()==2,"Nested operation exposed intermediate selection projection");
    }
    check(delivered.size()==3&&delivered[0].selectionProjectionDeferred&&delivered[1].selectionProjectionDeferred&&
      delivered[2].kind==AnimationChange::Kind::SelectionPreviewChanged&&!delivered[2].selectionProjectionDeferred,"Operation final ordering/deferral contract");
    try{auto failed=operations.selectionOperation(document,selectedRevision);++selectedRevision;throw std::runtime_error("original operation failure");}
    catch(const std::runtime_error& error){check(std::string(error.what())=="original operation failure","Projection replaced original failure");}
    check(delivered.size()==4&&!delivered.back().selectionProjectionDeferred,"Failed operation did not restore final observation");
    {auto deferred=operations.deferSelectionPreview();{auto inner=operations.selectionOperation(document,selectedRevision);++selectedRevision;}}
    check(delivered.size()==4,"Temporary script scope replayed its intermediate selection");
    {auto unchanged=operations.selectionOperation(document,selectedRevision);}
    check(delivered.size()==4,"Unchanged operation inherited temporary pending projection");
  }
  unsigned movedEvents=0;document.setAnimationChangeListener([&](const auto&,const auto&){++movedEvents;});
  Document moved(std::move(document));moved.setImportedLoop(false);check(movedEvents==1,"Move lost live binding");
  Document moveAssigned(1,1);moveAssigned=std::move(moved);moveAssigned.setImportedLoop(true);check(movedEvents==2,"Move assignment lost live binding");
  // Rejecting movement of linked masks changes selection without a history edit.
  auto maskDocument=std::make_unique<Document>(2,1);auto& masks=*maskDocument;
  const auto maskOwner=masks.layer().id,maskFirst=masks.frame().id;
  masks.fillSelectionOrCanvas(0xff123456);check(masks.createAttachedMask(maskOwner,maskFirst),"Mask notification setup");
  masks.exitAttachedMask();masks.addFrame(true);const auto maskSecond=masks.frame().id;
  const std::vector<Document::MaskSlotKey> maskKeys{{maskOwner,maskFirst},{maskOwner,maskSecond}};
  check(masks.linkAttachedMasks(maskKeys),"Mask notification link setup");
  const auto maskRevision=masks.revision(),maskHistory=masks.historySize();
  unsigned selectionEvents=0;
  masks.setAnimationChangeListener([&](const Document& source,const AnimationChange& change){
    check(&source==&masks&&change.kind==AnimationChange::Kind::MaskSelectionChanged,"Linked rejection must have a typed owning-document notification");
    check(source.maskSelectionHistory().slots==std::vector<Document::MaskSlotKey>{maskKeys.front()},"Notification preceded final independent selection");
    check(source.revision()==maskRevision&&source.historySize()==maskHistory,"Selection-only notification changed history/revision");
    ++selectionEvents;
  });
  check(masks.moveAttachedMasks(maskKeys,maskKeys.front(),maskKeys.back())==Document::MaskTransferResult::LinkedSelection&&selectionEvents==1,"Selection-only rejection did not notify synchronously");
  auto floatingDocument=std::make_unique<Document>(3,2);auto& floating=*floatingDocument;
  floating.beginStroke({0,0},0xff123456);floating.commitStroke();
  floating.previewSelection(SelectionMask{0,0,1,1,{}});floating.markSaved();
  const auto floatingPixels=floating.canvasPixels();const auto floatingHistory=floating.historySize(),floatingRevision=floating.revision();
  unsigned settled=0;
  floating.setAnimationChangeListener([&](const Document& source,const AnimationChange& change){
    if(change.kind!=AnimationChange::Kind::FloatingSettled)return;
    check(&source==&floating&&!source.floating(),"Floating settlement was not final or changed owner");++settled;
  });
  check(floating.beginSelectionContentMove(),"Floating settlement setup");
  floating.commitFloatingPaste();
  check(settled==1&&!floating.floating()&&floating.historySize()==floatingHistory&&floating.revision()==floatingRevision&&!floating.dirty(),"Unchanged floating commit did not settle independently of history");
  check(floating.beginSelectionContentMove(),"Floating cancellation setup");floating.moveFloatingPaste(1,0);floating.cancelFloatingPaste();
  check(settled==2&&!floating.floating()&&floating.canvasPixels()==floatingPixels&&floating.historySize()==floatingHistory&&floating.revision()==floatingRevision&&!floating.dirty(),"Floating cancellation failed final notification or changed artwork/history");
  floating.commitFloatingPaste();floating.cancelFloatingPaste();check(settled==2,"Absent floating no-op emitted a settlement");
  // Undo of clipboard deselection restores a transient preview. Ending that
  // preview must notify even if all replay history was explicitly cleared.
  for(int action=0;action<4;++action){
    auto restoredDocument=std::make_unique<Document>(4,1);auto& restored=*restoredDocument;
    SelectionClipboard payload{3,1,0,0,{0x80112233,0x80abcdef,0xff445566},{1,1,1}};
    check(restored.beginFloatingPaste(payload,-1,0),"Restored clipboard setup");
    restored.deselectPixels();const auto committed=restored.canvasPixels();restored.undo();
    check(restored.floating(),"Clipboard deselection undo did not restore preview");
    if(action>=2)restored.clearHistory();
    unsigned restoredSettled=0;
    restored.setAnimationChangeListener([&](const Document& source,const AnimationChange& change){
      if(change.kind==AnimationChange::Kind::FloatingSettled){check(&source==&restored&&!source.floating(),"Restored clipboard settled before reset");++restoredSettled;}
    });
    if(action%2==0)restored.undo();else restored.deselectPixels();
    check(restoredSettled==1&&!restored.floating(),"Restored clipboard terminal path missed settlement");
    check(restored.canvasPixels()==(action==0?std::vector<Pixel>(4):committed),"Restored clipboard terminal path stamped pixels twice");
  }
  {
   Document preview(4,3);const auto revision=preview.revision(),history=preview.historyPosition(),content=preview.contentRevision();
   unsigned count=0;preview.setAnimationChangeListener([&](const Document& source,const AnimationChange& event){
    check(&source==&preview&&event.kind==AnimationChange::Kind::SelectionPreviewChanged,"Preview event owner/type");
    check(source.selectionRevision()==count+1,"Preview event preceded selection assignment");++count;
   });
   preview.previewSelection(SelectionMask{1,1,2,1,{1,0}});check(count==1&&preview.selection()->x==1,"Preview notification missing");
   preview.previewSelection(preview.selection());check(count==2,"Equal preview event missing");
   preview.previewSelection({});check(count==3&&!preview.selection(),"Clear preview notification missing");
   check(preview.revision()==revision&&preview.historyPosition()==history&&preview.contentRevision()==content&&!preview.dirty(),"Preview event changed business state");
   Document copy(preview);copy.previewSelection({});check(count==3,"Copied preview retained observer");
  }
  {
   auto owned=std::make_unique<Document>(4,3);auto& selected=*owned;const auto content=selected.contentRevision();const auto pixels=selected.canvasPixels();
   unsigned projected=0;std::size_t expectedPosition=0;
   selected.setAnimationChangeListener([&](const Document& source,const AnimationChange& event){
    if(event.kind!=AnimationChange::Kind::SelectionPreviewChanged)return;
    check(&source==&selected&&source.historyPosition()==expectedPosition,"Selection projection preceded committed history");++projected;
   });
   selected.selectAllPixels();check(projected==1&&selected.selection()->width==4&&selected.selection()->height==3,"Select-all projection missing");
   const auto before=selected.selection();expectedPosition=1;selected.commitSelection(before,SelectionMask{1,1,2,1,{1,0}});
   check(projected==2&&selected.historyPosition()==1,"Selection commit projection missing");
   selected.commitSelection(selected.selection(),selected.selection());check(projected==3&&selected.historyPosition()==1,"Equal commit changed history or missed projection");
   expectedPosition=2;selected.deselectPixels();check(projected==4&&!selected.selection(),"Deselection projection missing");
   check(selected.canvasPixels()==pixels&&selected.contentRevision()==content&&!selected.dirty(),"Selection projection changed artwork");
   selected.deselectPixels();check(projected==4,"Empty deselection emitted an event");
  }
  {
   auto owned=std::make_unique<Document>(4,3);auto& selected=*owned;
   selected.beginStroke({0,0},0xff123456);selected.commitStroke();
   const std::optional<SelectionMask> original=SelectionMask{0,0,1,1,{}};
   selected.previewSelection(original);check(selected.beginSelectionContentMove(),"Composite selection setup");selected.moveFloatingPaste(1,0);
   const auto historyBefore=selected.historyPosition();unsigned projections=0,historyEvents=0;
   selected.setAnimationChangeListener([&](const Document& source,const AnimationChange& event){
    if(event.kind==AnimationChange::Kind::HistoryChanged){check(event.selectionProjectionDeferred,"Composite history exposed intermediate pivot state");++historyEvents;}
    if(event.kind==AnimationChange::Kind::FloatingSettled)check(event.selectionProjectionDeferred,"Composite floating settlement exposed intermediate pivot state");
    if(event.kind==AnimationChange::Kind::SelectionPreviewChanged){
     check(!event.selectionProjectionDeferred&&!source.floating()&&selectionEqual(source.selection(),original),"Composite projection preceded final selection");
     check(source.historyPosition()==historyBefore+1,"Composite projection preceded committed floating history");++projections;
    }
   });
   selected.commitSelection(original,original);
   check(projections==1&&historyEvents==1,"Composite selection did not coalesce final projection while preserving history");
   selected.setAnimationChangeListener({});selected.previewSelection(original);selected.fillSelectionOrCanvas(0xffabcdef);unsigned cleared=0;
   selected.setAnimationChangeListener([&](const Document& source,const AnimationChange& event){
    if(event.kind==AnimationChange::Kind::SelectionPreviewChanged){check(!source.selection()&&!event.selectionProjectionDeferred,"Cut published its intermediate selection");++cleared;}
   });
   std::optional<SelectionClipboard> clipboard;check(selected.cutPixels(clipboard)&&clipboard&&cleared==1,"Cut final projection missing/duplicated");
   selected.setAnimationChangeListener({});selected.previewSelection(original);unsigned frameProjection=0;
   selected.setAnimationChangeListener([&](const Document& source,const AnimationChange& event){
    if(event.kind==AnimationChange::Kind::SelectionPreviewChanged){check(!source.selection(),"Frame projection preceded selection clearing");++frameProjection;}
   });
   selected.addFrame();check(frameProjection==1,"Structural frame change did not settle selection");
  }
  std::cout<<"Animation origins, final selection operations, mask selection, floating settlement, replay suppression, owner isolation, copy/move and detach passed without Editor/UI\n";
  return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
