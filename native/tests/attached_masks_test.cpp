#include "relative_luminance.h"
#include "raster_geometry.h"
#include "document.h"
#include "project_encode.h"
#include "project_import.h"
#include "document_snapshot.h"
#include "layer_compositor.h"
#include <iostream>
#include <stdexcept>
#define CHECK(v) do{if(!(v))throw std::runtime_error(#v);}while(0)
using namespace moon;

void toolChecks(){
 Document d(8,4);CHECK(d.fillSelectionOrCanvas(0xffffffff));const auto celPixels=d.pixels();const auto owner=d.layer().id,frame=d.frame().id;CHECK(d.createAttachedMask(owner,frame));
 const auto empty=d.timeline().state().masks[0].mask.surface.pixels;const auto h=d.historyPosition();CHECK(d.fillPixels({0,0},0x80000000));CHECK(d.historyPosition()==h+1&&d.pixels()==celPixels);for(auto p:d.timeline().state().masks[0].mask.surface.pixels)CHECK(p==0xff7f7f7f);d.undo();CHECK(d.activeMaskId().size()&&d.timeline().state().masks[0].mask.surface.pixels==empty);d.redo();CHECK(d.timeline().state().masks[0].mask.surface.pixels[0]==0xff7f7f7f);
 CHECK(d.fillSelectionOrCanvas(0));PatternFillOptions pattern;pattern.texture=FillTexture::Wood;CHECK(d.fillPatternPixels({0,0},0xff000000,pattern));for(int x=0;x<8;++x)CHECK(d.timeline().state().masks[0].mask.surface.pixels[x]==(fillTextureContains(FillTexture::Wood,x,0)?0xff000000:0));d.undo();CHECK(d.timeline().state().masks[0].mask.surface.pixels[0]==0);
 d.previewSelection(SelectionMask{1,1,3,2,{}});CHECK(d.fillSelectionOrCanvas(0xff000000));CHECK(d.timeline().state().masks[0].mask.surface.pixels[0]==0&&d.timeline().state().masks[0].mask.surface.pixels[9]==0xff000000);d.previewSelection({});CHECK(d.fillSelectionOrCanvas(0));
 GradientSpec gradient;gradient.start={0,0};gradient.end={7,0};gradient.first=0xff000000;gradient.last=0xffffffff;CHECK(d.beginGradient({0,0},{}));CHECK(d.updateGradient(gradient,{}));CHECK(d.maskPreview()&&d.maskDisplayRegion({0,0,8,4})[0]==0xff000000);CHECK(d.timeline().state().masks[0].mask.surface.pixels[0]==0);bool saveBlocked=false;try{project::encodeEditableProject(d);}catch(const project::Error&){saveBlocked=true;}CHECK(saveBlocked);d.cancelGradient();CHECK(!d.maskPreview()&&d.timeline().state().masks[0].mask.surface.pixels[0]==0);const auto archive=project::encodeEditableProject(d);CHECK(project::prepareEditableImport(project::readProjectManifest(archive.bytes)).timeline.masks[0].mask.surface.pixels[0]==0);
 CHECK(d.beginGradient({0,0},{}));CHECK(d.updateGradient(gradient,{}));CHECK(d.commitGradient());CHECK(d.timeline().state().masks[0].mask.surface.pixels[0]==0xff000000&&d.pixels()==celPixels);d.undo();CHECK(d.timeline().state().masks[0].mask.surface.pixels[0]==0);d.redo();CHECK(d.timeline().state().masks[0].mask.surface.pixels[0]==0xff000000);
 CHECK(d.fillSelectionOrCanvas(0));for(auto kind:{ShapeKind::Line,ShapeKind::Rectangle,ShapeKind::RectangleOutline,ShapeKind::Ellipse,ShapeKind::EllipseOutline,ShapeKind::Polygon}){ShapeSpec shape;shape.kind=kind;shape.polygonPath={{1,1},{4,1},{4,2},{1,2}};shape.start={1,1};shape.end={4,2};shape.bounds={1,1,4,2};CHECK(d.beginShapePreview());CHECK(d.updateShapePreview(shape,0x80000000));CHECK(d.maskPreview());CHECK(d.timeline().state().masks[0].mask.surface.pixels[9]==0);d.cancelShapePreview();CHECK(d.timeline().state().masks[0].mask.surface.pixels[9]==0);CHECK(d.beginShapePreview());CHECK(d.updateShapePreview(shape,0x80000000));CHECK(d.commitShapePreview());CHECK(d.pixels()==celPixels);d.undo();CHECK(d.activeMaskId().size());}
 d.addFrame(true);auto second=d.frame().id;CHECK(d.linkAttachedMasks({{owner,frame},{owner,second}}));CHECK(d.selectAttachedMask(owner,second));const auto linkedBefore=timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.pixels;CHECK(d.beginGradient({0,0},{}));CHECK(d.updateGradient(gradient,{}));CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.pixels==linkedBefore);d.cancelGradient();CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.pixels==linkedBefore);CHECK(d.fillPixels({0,0},0xff000000));CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.pixels[0]==0xff000000);d.undo();CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.pixels==linkedBefore);
 CHECK(d.setAttachedMaskFlags(owner,frame,true,true,true,false));CHECK(d.activeMaskId().empty());CHECK(d.selectAttachedMask(owner,frame));CHECK(!d.fillPixels({0,0},0xff000000));CHECK(!d.beginShapePreview());CHECK(!d.beginGradient({0,0},{}));
}

void maskSelectionChecks(){
 Document d(4,2);CHECK(d.fillSelectionOrCanvas(0xff112233));const auto owner=d.layer().id,first=d.frame().id;const auto cel=d.pixels();CHECK(d.createAttachedMask(owner,first));d.clearTimelineSelection();d.previewSelection(SelectionMask{0,0,1,1,{}});
 auto copied=d.copyPixels();CHECK(copied&&copied->pixels[0]==0xff112233);
 SelectionClipboard input;input.width=2;input.height=1;input.pixels={0x800000ff,0xff000000};input.mask={1,1};const auto baseline=timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels;auto h=d.historyPosition();
 CHECK(d.beginFloatingPaste(input,1,0));CHECK(d.active()&&d.pixels()==cel&&d.historyPosition()==h);bool rejected=false;try{project::encodeEditableProject(d);}catch(const project::Error&){rejected=true;}CHECK(rejected);d.cancelFloatingPaste();CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels==baseline&&d.historyPosition()==h);
 CHECK(d.beginFloatingPaste(input,1,0));CHECK(d.commitFloatingPaste());const auto gray=timeline::normalizedMaskPixel(relativeLuminancePixel(input.pixels[0]));CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels[1]==gray&&d.pixels()==cel);d.undo();CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels==baseline);d.redo();
 d.clearTimelineSelection();d.previewSelection(SelectionMask{1,0,2,1,{}});CHECK(d.beginSelectionContentMove(false,false,0,1));CHECK(d.pixels()==cel);d.cancelFloatingPaste();CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels[1]==gray);CHECK(d.beginSelectionContentMove(false,false,0,1));CHECK(d.flipContent(true));auto floating=d.copyPixels();CHECK(floating&&floating->pixels[0]==0xff000000);CHECK(d.commitFloatingPaste());CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels[5]==0xff000000&&d.pixels()==cel);d.undo();CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels[1]==gray);d.redo();
 d.previewSelection(SelectionMask{0,0,1,1,{}});d.setPaletteRole(0xff000000,true,false);std::optional<SelectionClipboard> cut;CHECK(d.cutPixels(cut));CHECK(cut&&cut->pixels[0]==0xff112233&&!d.selection());CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels[0]==0xff000000&&d.pixels()==cel);
 d.clearTimelineSelection();d.previewSelection(SelectionMask{0,0,2,1,{}});CHECK(d.rotateContent(180));CHECK(d.pixels()==cel);d.undo();CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels[0]==0xff000000);d.previewSelection({});CHECK(!d.flipContent(true));CHECK(d.beginLayerTransform());CHECK(d.selection());
 d.addFrame(true);const auto second=d.frame().id;CHECK(d.linkAttachedMasks({{owner,first},{owner,second}}));CHECK(d.selectAttachedMask(owner,second));d.clearTimelineSelection();const auto linked=timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels;CHECK(d.beginFloatingPaste(input,0,0));d.cancelFloatingPaste();CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels==linked);
 CHECK(d.beginFloatingPaste(input,0,0));CHECK(d.commitFloatingPaste());const auto linkedAfter=timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels;CHECK(linkedAfter!=linked);d.undo();CHECK(timeline::resolvedMask(d.timeline().state(),owner,second)->surface.pixels==linked);d.redo();CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels==linkedAfter);
 d.previewSelection(SelectionMask{0,0,1,1,{}});d.restoreTimelineSelection({}, {second});CHECK(!d.beginSelectionContentMove(false));d.clearTimelineSelection();CHECK(d.setAttachedMaskFlags(owner,first,true,true,true,false));CHECK(d.activeMaskId().empty());CHECK(d.selectAttachedMask(owner,first));CHECK(!d.beginFloatingPaste(input,0,0));CHECK(d.pixels()==cel);
}

void linkChecks(){
 Document d(2,1);CHECK(d.fillSelectionOrCanvas(0xff123456));const auto owner=d.layer().id,first=d.frame().id;
 CHECK(d.createAttachedMask(owner,first));d.beginStroke({0,0},0xff000000);CHECK(d.commitStroke());const auto root=d.activeMaskId();d.exitAttachedMask();
 d.addFrame(false);const auto gap=d.frame().id;d.addFrame(false);const auto last=d.frame().id;CHECK(d.fillSelectionOrCanvas(0xff654321));CHECK(d.createAttachedMask(owner,last));const auto oldActive=d.activeMaskId();
 const auto h=d.historyPosition();CHECK(d.linkAttachedMasks({{owner,last},{owner,first}}));CHECK(d.historyPosition()==h+1);
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,gap)->id==root&&d.activeMaskId()==root);
 d.undo();CHECK(!timeline::directMask(d.timeline().state(),owner,gap)&&d.activeMaskId()==oldActive);d.redo();CHECK(d.activeMaskId()==root);
 const auto unchanged=d.historyPosition();CHECK(!d.linkAttachedMasks({{owner,last},{owner,first}}));CHECK(d.historyPosition()==unchanged);
 CHECK(d.linkAttachedMasks({{owner,last}},true));CHECK(d.activeMaskId()==oldActive);CHECK(timeline::directMask(d.timeline().state(),owner,gap)->mask.linkedMaskId.empty());
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,last)->surface.pixels[0]==0xff000000);
 d.undo();CHECK(d.activeMaskId()==root);d.redo();CHECK(d.activeMaskId()==oldActive);CHECK(!d.linkAttachedMasks({{owner,first}},true));
 d.beginStroke({0,0},0xffffffff);CHECK(d.commitStroke());CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels[0]==0xff000000);
 // Existing unselected intermediate masks must remain independent.
 const auto gapId=timeline::directMask(d.timeline().state(),owner,gap)->mask.id;
 CHECK(d.linkAttachedMasks({{owner,last},{owner,first}}));CHECK(timeline::resolvedMask(d.timeline().state(),owner,gap)->id==gapId);
 CHECK(d.linkAttachedMasks({{owner,last}},true));d.exitAttachedMask();d.addLayer();CHECK(d.fillSelectionOrCanvas(0xff112233));const auto other=d.layer().id;CHECK(d.createAttachedMask(other,last));const auto otherRoot=d.activeMaskId();d.exitAttachedMask();
 d.setLayerLocked(true);const auto locked=d.historyPosition();CHECK(!d.linkAttachedMasks({{owner,first},{owner,last},{other,first},{other,last}}));CHECK(d.historyPosition()==locked);CHECK(timeline::directMask(d.timeline().state(),owner,last)->mask.linkedMaskId.empty());
 d.setLayerLocked(false);CHECK(d.linkAttachedMasks({{owner,last},{owner,first},{other,last},{other,first}}));
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,last)->id==root);CHECK(timeline::resolvedMask(d.timeline().state(),other,first)->id==otherRoot);CHECK(root!=otherRoot);CHECK(d.activeMaskId().empty());
 CHECK(d.createLayerGroup());const auto group=*d.selectedGroupId();CHECK(d.createAttachedMask(group,first,true));CHECK(d.createAttachedMask(group,last,true));d.exitAttachedMask();
 CHECK(d.linkAttachedMasks({{group,last},{group,first}}));const auto groupRoot=timeline::resolvedMask(d.timeline().state(),group,first)->id;
 d.setGroupLocked(group,true);const auto groupLocked=d.historyPosition();CHECK(!d.linkAttachedMasks({{group,first}},true));CHECK(d.historyPosition()==groupLocked);d.setGroupLocked(group,false);
 auto loaded=project::prepareEditableImport(project::readProjectManifest(project::encodeEditableProject(d).bytes));CHECK(timeline::resolvedMask(loaded.timeline,group,last)->id==groupRoot);
 CHECK(d.linkAttachedMasks({{group,first}},true));CHECK(timeline::directMask(d.timeline().state(),group,last)->mask.linkedMaskId.empty());
}

void deletionChecks(){
 Document d(2,1);CHECK(d.fillSelectionOrCanvas(0xff123456));const auto owner=d.layer().id,first=d.frame().id;
 CHECK(d.createAttachedMask(owner,first));d.beginStroke({0,0},0xff000000);CHECK(d.commitStroke());d.exitAttachedMask();
 d.addFrame(true);const auto second=d.frame().id;d.addFrame(true);const auto third=d.frame().id;
 CHECK(d.linkAttachedMasks({{owner,first},{owner,second},{owner,third}}));
 CHECK(d.selectAttachedMask(owner,first,true));const auto active=d.activeMaskId();const auto maskPixels=timeline::resolvedMask(d.timeline().state(),owner,first)->surface.pixels;
 CHECK(d.setAttachedMaskFlags(owner,first,true,true,true,false));CHECK(d.activeMaskId().empty());CHECK(d.selectAttachedMask(owner,first,true));const auto h=d.historyPosition();
 CHECK(d.deleteAttachedMasks({{owner,first},{owner,second},{owner,first},{"missing","missing"}}));
 CHECK(d.historyPosition()==h+1&&d.timeline().state().masks.size()==1&&d.activeMaskId().empty());
 CHECK(timeline::directMask(d.timeline().state(),owner,third)->mask.linkedMaskId.empty());
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,third)->surface.pixels==maskPixels);
 auto reopened=project::prepareEditableImport(project::readProjectManifest(project::encodeEditableProject(d).bytes));CHECK(reopened.timeline.masks.size()==1&&timeline::resolvedMask(reopened.timeline,owner,third)->surface.pixels==maskPixels);
 d.selectFrame(third);d.undo();CHECK(d.timeline().state().masks.size()==3&&d.activeMaskId()==active&&d.maskIsolated()&&d.frame().id==first);CHECK(d.maskSelectionHistory().slots.size()==2);
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,third)->id==active);d.redo();CHECK(d.timeline().state().masks.size()==1&&d.maskSelectionHistory().slots.empty());d.undo();
 d.exitAttachedMask();d.addLayer();CHECK(d.fillSelectionOrCanvas(0xff654321));const auto other=d.layer().id;CHECK(d.createAttachedMask(other,d.frame().id));d.exitAttachedMask();d.setLayerLocked(true);
 const auto lockedHistory=d.historyPosition();const auto maskCount=d.timeline().state().masks.size();
 CHECK(!d.deleteAttachedMasks({{owner,first},{other,d.frame().id}}));CHECK(d.historyPosition()==lockedHistory&&d.timeline().state().masks.size()==maskCount);CHECK(!d.deleteAttachedMask(other,d.frame().id));
 d.selectTimelineLayer(owner);CHECK(d.createLayerGroup());const auto group=*d.selectedGroupId();CHECK(d.createAttachedMask(group,d.frame().id,true));
 d.setGroupLocked(group,true);const auto groupHistory=d.historyPosition();CHECK(!d.deleteAttachedMask(group,d.frame().id));CHECK(!d.deleteAttachedMask(owner,first));CHECK(d.historyPosition()==groupHistory);
 d.setGroupLocked(group,false);const auto groupMask=d.activeMaskId();CHECK(d.deleteAttachedMask(group,d.frame().id));CHECK(d.activeMaskId().empty());d.undo();CHECK(d.activeMaskId()==groupMask);d.redo();CHECK(!timeline::directMask(d.timeline().state(),group,d.frame().id));
 const auto noOp=d.historyPosition();CHECK(!d.deleteAttachedMasks({{"missing","missing"}}));CHECK(d.historyPosition()==noOp);
}

void bulkCreationChecks(){
 Document d(3,2);CHECK(d.fillSelectionOrCanvas(0xff123456));const auto owner=d.layer().id,first=d.frame().id;
 CHECK(d.createAttachedMask(owner,first));d.beginStroke({0,0},0xff000000);CHECK(d.commitStroke());d.exitAttachedMask();
 const auto preserved=timeline::directMask(d.timeline().state(),owner,first)->mask;
 d.addFrame(false);const auto blank=d.frame().id;
 d.addFrame(false);const auto second=d.frame().id;CHECK(d.fillSelectionOrCanvas(0xff987654));
 d.selectFrame(second);d.addLinkedFrame();const auto linked=d.frame().id;
 if(timeline::directMask(d.timeline().state(),owner,linked))CHECK(d.deleteAttachedMask(owner,linked));
 d.exitAttachedMask();d.selectFrame(blank);const auto h=d.historyPosition();
 CHECK(d.canCreateLayerMasksForLayer(owner));CHECK(d.createLayerMasksForLayer(owner));
 CHECK(d.historyPosition()==h+1&&d.timeline().state().masks.size()==3);CHECK(d.frame().id==blank&&d.activeMaskId().empty());
 CHECK(!timeline::directMask(d.timeline().state(),owner,blank));
 CHECK(timeline::directMask(d.timeline().state(),owner,first)->mask.id==preserved.id);
 CHECK(timeline::directMask(d.timeline().state(),owner,first)->mask.surface.pixels==preserved.surface.pixels);
 CHECK(timeline::directMask(d.timeline().state(),owner,second)->mask.id!=timeline::directMask(d.timeline().state(),owner,linked)->mask.id);
 CHECK(!d.canCreateLayerMasksForLayer(owner));CHECK(!d.createLayerMasksForLayer(owner));CHECK(d.historyPosition()==h+1);
 auto loaded=project::prepareEditableImport(project::readProjectManifest(project::encodeEditableProject(d).bytes));CHECK(loaded.timeline.masks.size()==3);
 d.undo();CHECK(d.timeline().state().masks.size()==1);d.redo();CHECK(d.timeline().state().masks.size()==3);
 d.undo();d.setLayerLocked(true);CHECK(!d.createLayerMasksForLayer(owner));CHECK(d.timeline().state().masks.size()==1);d.setLayerLocked(false);
 d.selectFrame(second);CHECK(d.createLayerMasksForLayer(owner));const auto active=d.activeMaskId();CHECK(!active.empty());
 d.undo();CHECK(d.activeMaskId().empty());d.redo();CHECK(d.activeMaskId()==active&&!d.maskIsolated());
 Document adjustment(2,2);adjustment.createGradientMapLayer();const auto adjustmentOwner=adjustment.layer().id;
 adjustment.addFrame(false);CHECK(adjustment.createLayerMasksForLayer(adjustmentOwner));CHECK(adjustment.timeline().state().masks.size()==2);
}

void bindingChecks(){
 Document d(4,2);CHECK(d.fillSelectionOrCanvas(0xff123456));const auto owner=d.layer().id,first=d.frame().id;
 CHECK(!d.setMaskMoveWithOwner(owner,first,false));CHECK(d.createAttachedMask(owner,first));
 d.exitAttachedMask();d.addFrame(true);const auto second=d.frame().id;
 CHECK(d.linkAttachedMasks({{owner,first},{owner,second}}));
 const auto pixels=d.pixels();const auto h=d.historyPosition();
 CHECK(d.setMaskMoveWithOwner(owner,second,false));CHECK(d.historyPosition()==h+1);
 CHECK(!d.setMaskMoveWithOwner(owner,second,false));CHECK(d.historyPosition()==h+1);
 CHECK(!timeline::resolvedMask(d.timeline().state(),owner,first)->moveWithOwner);
 // The linked slot retains its own unused flag; behavior follows the root.
 CHECK(timeline::directMask(d.timeline().state(),owner,second)->mask.moveWithOwner);
 d.undo();CHECK(timeline::resolvedMask(d.timeline().state(),owner,second)->moveWithOwner);d.redo();
 CHECK(d.beginLayerMove({d.cel().id}));CHECK(d.previewLayerMove(1,0));CHECK(d.commitLayerMove());
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,second)->surface.offsetX==0);d.undo();
 CHECK(d.setMaskMoveWithOwner(owner,second,true));
 CHECK(d.beginLayerMove({d.cel().id}));CHECK(d.previewLayerMove(2,1));d.cancelLayerMove();
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.offsetX==0);
 CHECK(d.beginLayerMove({d.cel().id}));CHECK(d.previewLayerMove(1,0));CHECK(d.commitLayerMove());
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,first)->surface.offsetX==1);d.undo();
 CHECK(d.setMaskMoveWithOwner(owner,second,false));
 auto imported=project::prepareEditableImport(project::readProjectManifest(project::encodeEditableProject(d).bytes));
 // Legacy encodeMask omits this transient flag: reopening uses the default true.
 CHECK(timeline::resolvedMask(imported.timeline,owner,second)->moveWithOwner);CHECK(!timeline::resolvedMask(d.timeline().state(),owner,second)->moveWithOwner);CHECK(d.pixels()==pixels);
 CHECK(d.createLayerGroup());const auto group=*d.selectedGroupId();CHECK(d.createAttachedMask(group,second,true));d.exitAttachedMask();
 CHECK(d.setMaskMoveWithOwner(group,second,false));CHECK(!timeline::resolvedMask(d.timeline().state(),group,second)->moveWithOwner);
 d.undo();CHECK(timeline::resolvedMask(d.timeline().state(),group,second)->moveWithOwner);d.redo();
 CHECK(d.setAttachedMaskFlags(group,second,true,true,false,false));
 CHECK(d.setMaskMoveWithOwner(group,second,true));CHECK(timeline::directMask(d.timeline().state(),group,second)->mask.locked);
}

void transferChecks(){
 using R=Document::MaskTransferResult;using K=Document::MaskSlotKey;
 Document d(2,1);CHECK(d.fillSelectionOrCanvas(0xff123456));const auto owner=d.layer().id,first=d.frame().id;
 CHECK(d.createAttachedMask(owner,first));d.beginStroke({0,0},0xff0c0c0c);CHECK(d.commitStroke());const auto original=*timeline::directMask(d.timeline().state(),owner,first);d.exitAttachedMask();
 d.addFrame(false);const auto second=d.frame().id;d.addFrame(false);const auto third=d.frame().id;
 const std::vector<K> selected{{owner,first},{owner,second}};
 auto h=d.historyPosition();CHECK(d.moveAttachedMasks(selected,{owner,first},{owner,first})==R::NoChange);CHECK(d.historyPosition()==h);
 CHECK(d.selectAttachedMask(owner,first,false));CHECK(d.moveAttachedMasks(selected,{owner,first},{owner,second})==R::Done);CHECK(d.historyPosition()==h+1);
 const auto* moved=timeline::directMask(d.timeline().state(),owner,second);CHECK(moved&&moved->mask.id==original.mask.id&&moved->mask.surface.pixels==original.mask.surface.pixels);
 const auto* white=timeline::directMask(d.timeline().state(),owner,first);CHECK(white&&white->mask.id!=original.mask.id&&white->mask.surface.pixels[0]==0xffffffff);CHECK(d.activeMaskId()==original.mask.id&&d.frame().id==second);
 CHECK(d.maskSelectionHistory().slots==std::vector<K>({{owner,second}}));d.undo();CHECK(d.maskSelectionHistory().slots==selected&&d.frame().id==first);CHECK(!timeline::directMask(d.timeline().state(),owner,second));d.redo();CHECK(d.frame().id==second);
 CHECK(d.copyAttachedMasks({{owner,second}},123));CHECK(d.maskClipboardSequence()==123);d.beginStroke({0,0},0xff000000);CHECK(d.commitStroke());h=d.historyPosition();
 CHECK(d.pasteAttachedMasks({{owner,third}},{owner,third})==R::EmptyCel);CHECK(d.historyPosition()==h&&!timeline::directMask(d.timeline().state(),owner,third));
 d.exitAttachedMask();d.selectFrame(third);CHECK(d.fillSelectionOrCanvas(0xffabcdef));h=d.historyPosition();CHECK(d.pasteAttachedMasks({{owner,third}},{owner,third})==R::Done);CHECK(d.historyPosition()==h+1&&d.activeMaskId().empty());
 const auto copy=*timeline::directMask(d.timeline().state(),owner,third);CHECK(copy.mask.id!=original.mask.id&&copy.mask.linkedMaskId.empty()&&copy.mask.surface.pixels==original.mask.surface.pixels);d.undo();CHECK(!timeline::directMask(d.timeline().state(),owner,third));d.redo();CHECK(timeline::directMask(d.timeline().state(),owner,third)->mask.id==copy.mask.id);
 // Target lock is checked before replacing any source, and a linked member
 // refuses the whole move and retains only independent selected slots.
 d.setLayerLocked(true);h=d.historyPosition();CHECK(d.moveAttachedMasks({{owner,second}},{owner,second},{owner,third})==R::Locked);CHECK(d.historyPosition()==h);d.setLayerLocked(false);
 CHECK(d.linkAttachedMasks({{owner,second},{owner,third}}));h=d.historyPosition();CHECK(d.moveAttachedMasks({{owner,first},{owner,third}},{owner,third},{owner,second})==R::LinkedSelection);CHECK(d.historyPosition()==h);CHECK(d.maskSelectionHistory().slots==std::vector<K>({{owner,first}}));
 CHECK(d.copyAttachedMasks({{owner,third},{owner,second}}));CHECK(d.linkAttachedMasks({{owner,second},{owner,third}},true));
 // Whole-block bounds are strict: never partly move/paste an overflowing block.
 h=d.historyPosition();CHECK(d.pasteAttachedMasks({},{owner,third})==R::Invalid);CHECK(d.historyPosition()==h);
 CHECK(d.moveAttachedMasks({{owner,second},{owner,third}},{owner,second},{owner,third})==R::Invalid);CHECK(d.historyPosition()==h);
 // Overlapping moves read all sources before writing white source placeholders.
 const auto a=*timeline::directMask(d.timeline().state(),owner,first),b=*timeline::directMask(d.timeline().state(),owner,second);
 CHECK(d.moveAttachedMasks({{owner,first},{owner,second}},{owner,first},{owner,second})==R::Done);
 CHECK(timeline::directMask(d.timeline().state(),owner,second)->mask.id==a.mask.id&&timeline::directMask(d.timeline().state(),owner,third)->mask.id==b.mask.id);
 d.undo();CHECK(timeline::directMask(d.timeline().state(),owner,first)->mask.id==a.mask.id);d.redo();
 auto reopened=project::prepareEditableImport(project::readProjectManifest(project::encodeEditableProject(d).bytes));CHECK(reopened.timeline.masks.size()==d.timeline().state().masks.size());
 // Cross-owner moves retain source ID at destination and leave a new white ID.
 d.exitAttachedMask();d.addLayer();const auto target=d.layer().id;d.selectFrame(third);CHECK(d.fillSelectionOrCanvas(0xffabcdef));CHECK(d.createAttachedMask(target,third));const auto overwritten=d.activeMaskId();d.exitAttachedMask();
 const auto source=*timeline::directMask(d.timeline().state(),owner,third);CHECK(d.moveAttachedMasks({{owner,third}},{owner,third},{target,third})==R::Done);CHECK(d.layer().id==target);CHECK(timeline::directMask(d.timeline().state(),target,third)->mask.id==source.mask.id);CHECK(timeline::directMask(d.timeline().state(),target,third)->mask.id!=overwritten);CHECK(timeline::directMask(d.timeline().state(),owner,third)->mask.surface.pixels[0]==0xffffffff);
 d.undo();CHECK(timeline::directMask(d.timeline().state(),target,third)->mask.id==overwritten);
 CHECK(d.createLayerGroup());const auto group=*d.selectedGroupId();CHECK(d.createAttachedMask(group,third,true));d.exitAttachedMask();CHECK(d.moveAttachedMasks({{owner,third}},{owner,third},{group,third})==R::Done);CHECK(timeline::directMask(d.timeline().state(),group,third)->group);d.undo();
}

void sharedFlagChecks(){
 Document d(2,1);CHECK(d.fillSelectionOrCanvas(0xff123456));const auto owner=d.layer().id,first=d.frame().id;CHECK(d.createAttachedMask(owner,first));d.exitAttachedMask();d.addFrame(true);const auto second=d.frame().id;
 CHECK(d.linkAttachedMasks({{owner,first},{owner,second}}));const auto* root=timeline::resolvedMask(d.timeline().state(),owner,second);const auto id=root->id;auto h=d.historyPosition();
 CHECK(d.setAttachedMaskFlags(owner,second,false,false,false,true));CHECK(d.historyPosition()==h+1);
 root=timeline::resolvedMask(d.timeline().state(),owner,first);CHECK(root->id==id&&!root->visible&&!root->moveWithOwner&&root->autoLinkAnimationCels);CHECK(timeline::directMask(d.timeline().state(),owner,second)->mask.visible);
 h=d.historyPosition();CHECK(!d.setAttachedMaskFlags(owner,second,false,false,false,true));CHECK(d.historyPosition()==h);
 const std::vector<Document::MaskSlotKey> chosen{{owner,first},{owner,second}};CHECK(d.selectAttachedMask(owner,second,true));CHECK(d.setAttachedMaskFlags(owner,second,false,true,false,true,&chosen));CHECK(d.activeMaskId().empty()&&!d.maskIsolated());d.selectFrame(first);d.undo();CHECK(d.frame().id==second&&d.maskSelectionHistory().slots==chosen);CHECK(d.activeMaskId()==id&&d.maskIsolated());CHECK(!timeline::resolvedMask(d.timeline().state(),owner,second)->locked);d.redo();CHECK(d.activeMaskId().empty()&&timeline::resolvedMask(d.timeline().state(),owner,second)->locked);
 // Legacy encodeMask persists lock/auto-link, but omits visibility and move binding.
 const auto imported=project::prepareEditableImport(project::readProjectManifest(project::encodeEditableProject(d).bytes));root=timeline::resolvedMask(imported.timeline,owner,second);CHECK(root->visible&&root->moveWithOwner&&root->locked&&root->autoLinkAnimationCels);
}

void maskFrameContextChecks(){
 Document d(2,1);CHECK(d.fillSelectionOrCanvas(0xff123456));const auto owner=d.layer().id,first=d.frame().id;CHECK(d.createAttachedMask(owner,first));const auto mask=d.activeMaskId();d.addFrame(false);const auto second=d.frame().id;CHECK(d.selectAttachedMask(owner,first,true));const auto h=d.historyPosition();d.selectFrameHeader(second);CHECK(d.frame().id==second&&d.activeMaskId()==mask&&d.maskIsolated()&&d.historyPosition()==h);CHECK(!timeline::directMask(d.timeline().state(),owner,second));d.selectFrame(first);CHECK(d.activeMaskId().empty()&&!d.maskIsolated());
}

void rowDeletionChecks(){
 Document d(2,1);CHECK(d.fillSelectionOrCanvas(0xff123456));const auto owner=d.layer().id,first=d.frame().id;CHECK(d.createAttachedMask(owner,first));d.exitAttachedMask();d.addFrame(true);const auto count=d.timeline().state().frames.size();
 auto selection=d.timelineSelection();selection.layers={owner};selection.maskRows={owner};selection.layerAnchor=owner;d.restoreTimelineSelection(selection,{});
 d.setLayerLocked(true);auto h=d.historyPosition();CHECK(!d.deleteAttachedMasks({}));CHECK(d.historyPosition()==h&&d.timelineSelection().maskRows==selection.maskRows);
 d.setLayerLocked(false);h=d.historyPosition();CHECK(d.deleteAttachedMasks({}));CHECK(d.historyPosition()==h+1&&d.timeline().state().masks.empty()&&d.timelineSelection().maskRows.empty()&&d.timelineSelection().layers==selection.layers&&d.timeline().state().frames.size()==count);
 d.undo();CHECK(d.timeline().state().masks.size()==2&&d.timelineSelection().maskRows==selection.maskRows&&d.timelineSelection().layers==selection.layers&&d.maskSelectionHistory().slots.empty());d.redo();CHECK(d.timeline().state().masks.empty()&&d.timelineSelection().maskRows.empty());d.undo();
 d.selectFrameHeader(first);CHECK(d.timelineSelection().maskRows==selection.maskRows&&d.timelineSelection().layers.empty());d.restoreTimelineSelection(selection,{});d.selectTimelineCel(d.cel().id);CHECK(d.timelineSelection().maskRows.empty());
}

int main(){try{maskFrameContextChecks();rowDeletionChecks();sharedFlagChecks();transferChecks();linkChecks();deletionChecks();bulkCreationChecks();bindingChecks();maskSelectionChecks();toolChecks();CHECK(timeline::maskCoverage(0)==255);CHECK(timeline::maskCoverage(0xff000000)==0);CHECK(timeline::maskCoverage(0xff808080)==128);CHECK(timeline::maskCoverage(0x80000000)==127);Document d(2,1);d.beginStroke({0,0},0xff0000ff);CHECK(d.commitStroke());const auto owner=d.layer().id,frame=d.frame().id;CHECK(d.createAttachedMask(owner,frame));const auto pixels=d.pixels();const auto before=d.historyPosition();d.beginStroke({0,0},0xff000000);CHECK(d.commitStroke());CHECK(d.historyPosition()==before+1&&d.pixels()==pixels);CHECK((compositeNormalRegion(d.timeline(),frame,{0,0,2,1})[0]>>24)==0);d.undo();CHECK((compositeNormalRegion(d.timeline(),frame,{0,0,2,1})[0]>>24)==255);d.redo();CHECK((compositeNormalRegion(d.timeline(),frame,{0,0,2,1})[0]>>24)==0);CHECK(d.selectAttachedMask(owner,frame));{SelectionClipboard blocked;blocked.width=blocked.height=1;blocked.pixels={0xffffffff};CHECK(d.beginFloatingPaste(blocked,0,0));d.cancelFloatingPaste();CHECK(!d.beginSelectionContentMove(false));CHECK(!d.deleteSelectedPixels());CHECK(d.pixels()==pixels);}d.beginStroke({0,0},0xffffffff);d.cancelStroke();CHECK((compositeNormalRegion(d.timeline(),frame,{0,0,2,1})[0]>>24)==0);CHECK(d.setAttachedMaskFlags(owner,frame,false,false,true,false));CHECK((compositeNormalRegion(d.timeline(),frame,{0,0,2,1})[0]>>24)==255);d.undo();CHECK((compositeNormalRegion(d.timeline(),frame,{0,0,2,1})[0]>>24)==0);CHECK(d.deleteAttachedMask(owner,frame));CHECK(d.timeline().state().masks.empty());d.undo();CHECK(d.timeline().state().masks.size()==1);CHECK(d.selectAttachedMask(owner,frame));CHECK(d.beginLayerMove({d.cel().id}));CHECK(d.previewLayerMove(1,0));CHECK(d.commitLayerMove());CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.offsetX==1);d.undo();CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.offsetX==0);d.exitAttachedMask();CHECK(d.beginLayerMove({d.cel().id}));CHECK(d.previewLayerMove(1,0));CHECK(d.commitLayerMove());CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.offsetX==1);d.undo();d.addFrame(true);const auto second=d.frame().id;CHECK(timeline::directMask(d.timeline().state(),owner,second));CHECK(d.linkAttachedMasks({{owner,frame},{owner,second}}));CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)==timeline::resolvedMask(d.timeline().state(),owner,second));d.undo();CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)!=timeline::resolvedMask(d.timeline().state(),owner,second));d.deleteFrame();CHECK(d.timeline().state().masks.size()==1);d.undo();CHECK(d.timeline().state().masks.size()==2);const auto encoded=project::encodeEditableProject(d);const auto imported=project::prepareEditableImport(project::readProjectManifest(encoded.bytes));CHECK(imported.timeline.masks.size()==2);DocumentSnapshot snapshot(d,"mask-snapshot");const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(!snapshot.advance(d,deadline))CHECK(std::chrono::steady_clock::now()<deadline);auto captured=snapshot.finish();CHECK(captured.timeline().state().masks.size()==2&&captured.timeline().state().masks[0].mask.surface.pixels.identity()!=d.timeline().state().masks[0].mask.surface.pixels.identity());auto state=d.timeline().state();state.masks[0].mask.linkedMaskId=state.masks[0].mask.id;bool failed=false;try{timeline::Timeline invalid(state);}catch(const std::invalid_argument&){failed=true;}CHECK(failed);state=d.timeline().state();timeline::Group g;g.id="g";g.name=U"组";state.groups.push_back(g);state.layers[0].groupId=g.id;state.masks[0].group=true;state.masks[0].ownerId=g.id;timeline::Timeline group(std::move(state));CHECK((compositeNormalRegion(group,frame,{0,0,2,1})[0]>>24)==0);std::cout<<"Attached mask foundation checks passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
