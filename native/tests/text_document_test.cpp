#include "document.h"
#include "project_encode.h"
#include "project_import.h"
#include "layer_compositor.h"
#include <iostream>
using namespace moon;
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
namespace {
void textPreviewDirtyRegion(){
 Document d(64,64);auto text=newTextToolData(0xff443322);text.text=u"Region";text.boxed=true;text.originX=10;text.originY=12;text.boxWidth=3;text.boxHeight=2;
 timeline::Surface original{3,2,10,12,{},{},{0xff443322,0,0xff443322,0,0xff443322,0}};
 CHECK(d.beginTextDraft(text,original)&&d.commitTextDraft());d.addLinkedFrame();const auto id=d.cel().id,owner=d.timeline().resolveSurface(id).source->id;const auto history=d.historyPosition();
 CHECK(d.beginTextDraft(text,original,id));
 auto cached=compositeNormalRegion(d.displayTimeline(),d.frame().id,{0,0,64,64});
 auto step=[&](int x,int y,int w,int h){
  timeline::Surface next;next.width=w;next.height=h;next.offsetX=x;next.offsetY=y;next.pixels.resize(std::size_t(w)*h,0xff998877);auto value=text;value.originX=x;value.originY=y;value.boxWidth=w;value.boxHeight=h;
  const auto revision=d.contentRevision();CHECK(d.previewTextDraft(value,next));CHECK(d.contentRevision()==revision+1);const auto region=d.lastContentChange();CHECK(!region.empty());
  const auto patch=compositeNormalRegion(d.displayTimeline(),d.frame().id,{region.x,region.y,region.w,region.h});
  for(int row=0;row<region.h;++row)for(int col=0;col<region.w;++col)cached[std::size_t(region.y+row)*64+region.x+col]=patch[std::size_t(row)*region.w+col];
  CHECK(cached==compositeNormalRegion(d.displayTimeline(),d.frame().id,{0,0,64,64}));CHECK(d.timeline().resolveSurface(id).source->id==owner);return region;
 };
 auto region=step(14,15,5,4);CHECK(region.x==10&&region.y==12&&region.w==9&&region.h==7);
 region=step(15,16,1,1);CHECK(region.x==14&&region.y==15&&region.w==5&&region.h==4);
 region=step(-2,-1,4,3);CHECK(region.x==0&&region.y==0&&region.w==16&&region.h==17);
 region=step(70,70,2,2);CHECK(region.x==0&&region.y==0&&region.w==2&&region.h==2);
 region=step(80,80,1,1);CHECK(region.w==64&&region.h==64); // both extents off canvas: conservative revision fallback
 d.cancelTextDraft();CHECK(d.historyPosition()==history&&d.timeline().resolveSurface(id).surface->pixels==original.pixels&&d.timeline().resolveSurface(id).surface->offsetX==10);
 CHECK(d.beginTextDraft(text,original,id));step(14,15,5,4);CHECK(d.commitTextDraft());CHECK(d.historyPosition()==history+1);d.undo();CHECK(d.timeline().resolveSurface(id).surface->offsetX==10);d.redo();CHECK(d.timeline().resolveSurface(id).surface->offsetX==14);
 // Color-only overlays retain the same local dependency region.
 timeline::ColorOverlayStyle style;style.enabled=true;style.overlayEnabled=true;CHECK(d.beginLayerStyle());CHECK(d.commitLayerStyle(style));CHECK(d.beginTextDraft(text,original,id));CHECK(d.lastContentChange().x==10&&d.lastContentChange().y==12&&d.lastContentChange().w==9&&d.lastContentChange().h==7);d.cancelTextDraft();
}
void styledTextPreviewDamage(){
 for(int mode=0;mode<10;++mode){
  Document seed(96,96);auto text=newTextToolData(0xff443322);text.text=u"Style";text.boxed=true;text.originX=32;text.originY=32;text.boxWidth=4;text.boxHeight=4;
  timeline::Surface original;original.width=original.height=4;original.offsetX=original.offsetY=32;original.pixels.resize(16,0xff443322);original.pixels[5]=0;
  CHECK(seed.beginTextDraft(text,original)&&seed.commitTextDraft());auto state=seed.timeline().state();const auto id=seed.cel().id,layerId=seed.layer().id;
  timeline::ColorOverlayStyle style;
  if(mode<=2){style.stroke.enabled=true;style.stroke.size=3;style.stroke.position=mode;}
  if(mode==3||mode==4){style.shadow.enabled=true;style.shadow.offsetX=mode==3?7:-9;style.shadow.offsetY=mode==3?-6:8;style.shadow.blur=2;}
  if(mode==5){style.innerGlow.enabled=true;style.innerGlow.size=3;}
  if(mode>=6){style.stroke.enabled=true;style.stroke.size=2;style.shadow.enabled=true;style.shadow.offsetX=5;style.shadow.offsetY=-3;style.shadow.blur=1;}
  for(auto& layer:state.layers)if(layer.id==layerId)layer.layerStyles=style;
  if(mode>=7){timeline::Group inner;inner.id="inner";inner.name=U"Inner";inner.layerStyles=style;timeline::Group outer;outer.id="outer";outer.name=U"Outer";outer.layerStyles=style;inner.parentGroupId=outer.id;state.groups={outer,inner};for(auto& layer:state.layers)if(layer.id==layerId)layer.groupId=inner.id;}
  if(mode==8)for(auto& group:state.groups)group.layerStyles->gradientEnabled=true;
  if(mode==9){for(auto& layer:state.layers)if(layer.layerStyles)layer.layerStyles->enabled=false;for(auto& group:state.groups)group.layerStyles->enabled=false;}
  auto d=Document::fromImported(96,96,std::move(state),seed.palette(),"text-damage-fixture",U"Style",std::make_shared<const std::vector<std::uint8_t>>());d.selectLayer(layerId);
  CHECK(d.beginTextDraft(text,original,id));auto cached=compositeNormalRegion(d.displayTimeline(),d.frame().id,{0,0,96,96});
  auto update=[&](int x,int y,int size){auto next=original;next.offsetX=x;next.offsetY=y;next.width=next.height=size;next.pixels.resize(std::size_t(size)*size,0xff998877);auto value=text;value.originX=x;value.originY=y;value.boxWidth=value.boxHeight=size;CHECK(d.previewTextDraft(value,next));const auto region=d.lastContentChange();
   if(mode==8)CHECK(region.w==96&&region.h==96);else CHECK(region.w<96&&region.h<96);
   if(mode<=2)CHECK(region.x==std::max(0,std::min(32,x)-3));
   const auto patch=compositeNormalRegion(d.displayTimeline(),d.frame().id,{region.x,region.y,region.w,region.h});for(int row=0;row<region.h;++row)for(int col=0;col<region.w;++col)cached[std::size_t(region.y+row)*96+region.x+col]=patch[std::size_t(row)*region.w+col];CHECK(cached==compositeNormalRegion(d.displayTimeline(),d.frame().id,{0,0,96,96}));};
  update(37,29,6);update(-2,-1,3);d.cancelTextDraft();CHECK(d.timeline().resolveSurface(id).surface->offsetX==32);
 }
}
void textBoxMoveScope(){
 Document d(32,32);auto text=newTextToolData(0xff443322);text.text=u"Linked box";text.boxed=true;text.originX=3;text.originY=4;text.boxWidth=12;text.boxHeight=18;text.transforms={{{3,4,12,18},{5,6,14,20},15,{}}};
 timeline::Surface surface{2,2,3,4,{},{},{0xff443322,0,0,0xff998877}};CHECK(d.beginTextDraft(text,surface)&&d.commitTextDraft());d.addLinkedFrame();const auto target=d.cel().id,owner=d.timeline().resolveSurface(target).source->id,layer=d.layer().id,frame=d.frame().id;
 CHECK(d.createAttachedMask(layer,frame));d.exitAttachedMask();CHECK(timeline::resolvedMask(d.timeline().state(),layer,frame)->moveWithOwner);
 d.previewSelection(SelectionMask{10,11,2,3,{}});const auto history=d.historyPosition();const auto* pixels=d.timeline().resolveSurface(target).surface->pixels.data();
 auto intact=[&]{const auto* mask=timeline::directMask(d.timeline().state(),layer,frame);return d.selection()&&d.selection()->x==10&&d.selection()->y==11&&mask&&mask->mask.surface.offsetX==0&&mask->mask.surface.offsetY==0;};
 auto begin=[&]{return d.beginLayerMove({target},false,{},Document::LayerMoveScope::TextBox);};
 CHECK(begin());CHECK(d.previewLayerMove(5,-2));auto moved=d.timeline().resolveSurface(target);CHECK(moved.source->id==owner&&moved.surface->offsetX==8&&moved.surface->offsetY==2&&moved.surface->pixels.data()==pixels&&moved.source->text->originX==8&&moved.source->text->transforms[0].target.x==10&&intact());CHECK(d.historyPosition()==history);CHECK(d.previewLayerMove(5,-2)&&d.timeline().resolveSurface(target).surface->offsetX==8);d.cancelLayerMove();CHECK(d.timeline().resolveSurface(target).surface->offsetX==3&&d.timeline().resolveSurface(target).source->text->transforms[0].target.x==5&&intact()&&d.historyPosition()==history);
 CHECK(begin());CHECK(d.previewLayerMove(0,0));CHECK(!d.commitLayerMove()&&intact()&&d.historyPosition()==history);
 CHECK(begin()&&d.previewLayerMove(5,-2)&&d.commitLayerMove());CHECK(d.historyPosition()==history+1&&intact()&&d.timeline().resolveSurface(target).surface->pixels.data()==pixels);d.undo();CHECK(d.timeline().resolveSurface(target).surface->offsetX==3&&intact());d.redo();CHECK(d.timeline().resolveSurface(target).source->text->originY==2&&intact());
 auto encoded=project::encodeEditableProject(d);auto imported=project::prepareEditableImport(project::readProjectManifest(encoded.bytes));timeline::Timeline reopened(std::move(imported.timeline));auto restored=reopened.resolveSurface(target);CHECK(restored.source->id==owner&&restored.surface->pixels==surface.pixels&&restored.surface->offsetX==8&&restored.source->text->originX==8);const auto* mask=timeline::directMask(reopened.state(),layer,frame);CHECK(mask&&mask->mask.surface.offsetX==0&&mask->mask.surface.offsetY==0);
 // The ordinary move tool retains its broader scope.
 CHECK(d.beginLayerMove({target})&&d.previewLayerMove(2,1));CHECK(d.selection()->x==12&&timeline::directMask(d.timeline().state(),layer,frame)->mask.surface.offsetX==2);d.cancelLayerMove();CHECK(intact());
 d.setLayerLocked(true);CHECK(!begin());d.setLayerLocked(false);d.setLayerVisible(false);CHECK(!begin());d.setLayerVisible(true);CHECK(!d.beginLayerMove({target},true,{},Document::LayerMoveScope::TextBox));
}
}
int main(){try{styledTextPreviewDamage();textPreviewDirtyRegion();textBoxMoveScope();Document d(32,32);d.beginStroke({1,1},0xff123456);d.commitStroke();d.undo();d.markSaved();CHECK(d.canRedo());const auto layers=d.timeline().state().layers.size();auto data=newTextToolData(0xff443322);data.text=u"A😀中\nB";data.boxed=true;data.originX=-3;data.originY=4;data.boxWidth=12;data.boxHeight=18;data.styleRuns={{1,3,17,{},{},0xff998877}};data.transforms={{{-3,4,12,18},{-2,5,14,20},15,{}}};timeline::Surface s{2,2,-3,4,{},{},{0xff443322,0,0,0xff443322}};CHECK(d.beginTextDraft(data,s));CHECK(d.active()&&!d.dirty());d.cancelTextDraft();CHECK(d.canRedo()&&d.timeline().state().layers.size()==layers&&!d.dirty());CHECK(d.beginTextDraft(data,s));CHECK(d.commitTextDraft());const auto id=d.cel().id;CHECK(d.layer().kind=="text"&&!d.rasterToolsAvailable());const auto count=d.historySize();auto updated=data;updated.text=u"Changed😀";CHECK(d.beginTextDraft(updated,s,id));d.cancelTextDraft();CHECK(d.cel().text->text==data.text&&d.historySize()==count);CHECK(d.beginTextDraft(updated,s,id));CHECK(d.commitTextDraft());d.undo();CHECK(d.cel().text->text==data.text);d.redo();CHECK(d.cel().text->text==updated.text);CHECK(d.beginLayerMove({id}));CHECK(d.previewLayerMove(7,-2));CHECK(d.cel().text->originX==4);CHECK(d.commitLayerMove());d.undo();CHECK(d.cel().text->originX==-3);d.redo();CHECK(d.cel().text->originY==2);auto encoded=project::encodeEditableProject(d);auto manifest=project::readProjectManifest(encoded.bytes);auto imported=project::prepareEditableImport(manifest);auto cel=std::find_if(imported.timeline.cels.begin(),imported.timeline.cels.end(),[&](const auto& c){return c.id==id;});CHECK(cel!=imported.timeline.cels.end()&&cel->text&&cel->text->text==updated.text&&cel->text->originX==4&&cel->text->transforms.size()==1);CHECK(cel->text->styleRuns[0].start==1&&cel->text->styleRuns[0].end==3);std::cout<<"Text draft/cancel/history/move/project roundtrip passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
