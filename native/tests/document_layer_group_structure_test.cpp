#include "document.h"
#include <iostream>
#include <stdexcept>
using namespace moon;
#define CHECK(...) do{if(!(__VA_ARGS__))throw std::runtime_error(#__VA_ARGS__);}while(false)
Document structureFixture(){timeline::State s;s.layers={{"a",U"A"},{"b",U"B"},{"outside",U"Outside"}};s.layers[0].groupId="child";s.layers[1].groupId="g";timeline::Group g;g.id="g";g.name=U"G";timeline::Group child;child.id="child";child.name=U"Child";child.parentGroupId="g";s.groups={g,child};s.frames={{"f0",100},{"f1",150}};
 for(const auto& l:s.layers)for(const auto& f:s.frames){timeline::Cel c;c.id=l.id+f.id;c.layerId=l.id;c.frameId=f.id;c.opacity=f.id=="f0"?.7:.3;c.zIndex=9;if(l.id=="a"&&f.id=="f1")c.linkedCelId="af0";else c.surface=timeline::Surface{2,1,-2,4,91,-73,{0xff112233,0x00030201}};s.cels.push_back(c);}Document base(8,8);auto d=Document::fromImported(8,8,std::move(s),base.palette(),"structure",U"Structure",std::make_shared<const std::vector<std::uint8_t>>());d.clearSourceArchiveForNewSnapshot();return d;}
void verifyUngroupStructure(){
 for(int mode=0;mode<3;++mode){
  auto d=structureFixture();const auto* pixels=d.timeline().resolveSurface("af0").surface->pixels.data();
  if(mode==0)d.selectTimelineRow({LayerPanelKind::Group,"g",0});
  else if(mode==1)d.selectTimelineRow({LayerPanelKind::Group,"child",1});
  else d.restoreTimelineRowSelection({"a","b"},{});
  const auto history=d.historyPosition();CHECK(d.ungroupSelected()&&d.historyPosition()==history+1);
  if(mode==0)CHECK(!d.findGroup("g")&&d.findGroup("child")&&!d.findGroup("child")->parentGroupId&&d.timelineSelection().layers==std::vector<std::string>{"b"});
  if(mode==1)CHECK(d.findGroup("g")&&!d.findGroup("child")&&d.timeline().state().layers[d.timeline().layerIndex("a")].groupId==std::optional<std::string>("g"));
  if(mode==2)CHECK(d.timeline().state().groups.empty()&&!d.timeline().state().layers[0].groupId&&!d.timeline().state().layers[1].groupId);
  CHECK(d.timeline().resolveSurface("af0").surface->pixels.data()==pixels&&d.timeline().resolveSurface("af1").source->id=="af0");
  d.undo();CHECK(d.findGroup("g")&&d.findGroup("child")&&d.findGroup("child")->parentGroupId==std::optional<std::string>("g"));d.redo();
  CHECK(d.timeline().resolveSurface("af0").surface->pixels.data()==pixels&&d.timeline().resolveSurface("af1").source->id=="af0");
 }
 for(int mode=0;mode<4;++mode){
  auto d=structureFixture();if(mode==0)d.setGroupLocked("g",true);if(mode==1)d.setGroupLocked("child",true);if(mode==2){d.selectLayer("a");d.setLayerLocked(true);}if(mode==3){d.selectLayer("outside");d.setLayerLocked(true);}
  d.selectTimelineRow({LayerPanelKind::Group,"g",0});const auto history=d.historyPosition(),revision=d.revision();CHECK(d.ungroupSelected()==(mode==3));if(mode!=3)CHECK(d.historyPosition()==history&&d.revision()==revision&&d.findGroup("g"));
 }
}
int main(){try{verifyUngroupStructure();
 {auto d=structureFixture();const auto* pixels=d.timeline().resolveSurface("af0").surface->pixels.data();d.selectTimelineRow({LayerPanelKind::Group,"g",0});const auto h=d.historySize();d.duplicateSelectedLayers();CHECK(d.historySize()==h+1&&d.timeline().state().layers.size()==5&&d.timeline().state().groups.size()==4);CHECK(d.timeline().resolveSurface("af0").surface->pixels.data()==pixels);for(const auto& l:d.timeline().state().layers)if(l.id!="a"&&l.id!="b"&&l.id!="outside"){const auto* a=d.timeline().findCel(l.id,"f0");const auto* b=d.timeline().findCel(l.id,"f1");CHECK(a&&b&&!a->linkedCelId&&!b->linkedCelId&&!a->runtimeSharedCelId&&!b->runtimeSharedCelId&&a->zIndex==0&&b->zIndex==0);CHECK(a->surface&&b->surface&&a->surface->pixels.data()!=b->surface->pixels.data()&&b->opacity==.3&&b->surface->offsetX==-2&&b->surface->storageOriginX==91);}d.undo();CHECK(d.timeline().state().layers.size()==3&&d.timeline().state().groups.size()==2&&d.timeline().resolveSurface("af1").source->id=="af0"&&d.timeline().resolveSurface("af0").surface->pixels.data()==pixels);d.redo();d.undo();
 d.selectTimelineRow({LayerPanelKind::Group,"g",0});d.toggleGroupCollapsed("g");d.deleteLayer();CHECK(d.timeline().state().layers.size()==1&&d.timeline().state().groups.empty());d.undo();CHECK(d.findGroup("child")&&d.selectedGroupId()==std::optional<std::string>("g")&&d.collapsedGroupIds()==std::vector<std::string>{"g"}&&d.timeline().resolveSurface("af0").surface->pixels.data()==pixels);d.setGroupLocked("g",true);const auto locked=d.historySize();d.deleteLayer();CHECK(d.historySize()==locked&&d.timeline().state().layers.size()==3);}
 {auto d=structureFixture();d.restoreTimelineRowSelection({"outside"},{"child"});CHECK(d.moveLayerPanelRows({LayerPanelDropTarget::Kind::Inside,LayerPanelKind::Group,"g"}));CHECK(d.timeline().state().layers[d.timeline().layerIndex("outside")].groupId==std::optional<std::string>("g"));d.undo();CHECK(!d.timeline().state().layers[d.timeline().layerIndex("outside")].groupId);d.selectTimelineRow({LayerPanelKind::Group,"g",0});const auto h=d.historySize(),r=d.revision();CHECK(!d.moveLayerPanelRows({LayerPanelDropTarget::Kind::Inside,LayerPanelKind::Group,"child"}));CHECK(d.historySize()==h&&d.revision()==r);d.addLayer();CHECK(!d.layer().groupId&&d.activeSurface().width==1&&d.activeSurface().height==1);d.undo();d.selectTimelineLayer("a");d.addLayer();CHECK(d.layer().groupId==std::optional<std::string>("child"));d.undo();
 d.setGroupVisible("g",false);d.selectLayer("a");d.setLayerVisible(false);const auto before=d.historySize();d.beginVisibilityGesture();d.previewVisibilityGesture("a",true);CHECK(d.commitVisibilityGesture());CHECK(d.findGroup("g")->visible&&d.historySize()==before+1);d.undo();CHECK(!d.findGroup("g")->visible&&!d.layer().visible);d.setGroupLocked("g",true);d.beginLockGesture();d.previewLockGesture("a",false);CHECK(d.commitLockGesture());CHECK(!d.findGroup("g")->locked);d.undo();CHECK(d.findGroup("g")->locked);}
 std::cout<<"Internal group copy/delete/mixed move/add/sweep ownership and rejection passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
