#include "document.h"
#include "outline_samples.h"
#include <iostream>
using namespace moon;
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
static void batchTargets(){
 Document d(5,5);d.beginStroke({2,2},0xff0000ff);d.commitStroke();
 const auto first=d.layer().id;d.addLayer();const auto second=d.layer().id;
 d.beginStroke({2,2},0xffff0000);d.commitStroke();OutlineSampling settings;
 Document::TimelineSelection both;both.layers={first,second};
 d.restoreTimelineSelection(both,{});const auto history=d.historySize();
 CHECK(d.outlinePixels(settings,0xff00ff00));CHECK(d.historySize()==history+1);
 for(const auto& id:{first,second}){d.selectLayer(id);CHECK(d.pixels()[7]==0xff00ff00);}
 d.undo();for(const auto& id:{first,second}){d.selectLayer(id);CHECK(d.pixels()[7]==0);}
 d.redo();for(const auto& id:{first,second}){d.selectLayer(id);CHECK(d.pixels()[7]==0xff00ff00);}
 d.undo();d.selectLayer(second);d.setLayerLocked(true);
 d.restoreTimelineSelection(both,{});const auto lockedHistory=d.historySize();
 CHECK(!d.outlinePixels(settings,0xff00ff00));CHECK(d.historySize()==lockedHistory);
 for(const auto& id:{first,second}){d.selectLayer(id);CHECK(d.pixels()[7]==0);}
 d.selectLayer(second);d.setLayerLocked(false);d.setLayerVisible(false);
 // Explicit hidden targets are valid; frame-only selection skips hidden layers.
 d.restoreTimelineSelection(both,{});CHECK(d.outlinePixels(settings,0xff00ff00));d.undo();
 d.restoreTimelineSelection({}, {d.frame().id});CHECK(d.outlinePixels(settings,0xff00ff00));
 d.selectLayer(first);CHECK(d.pixels()[7]==0xff00ff00);
 d.selectLayer(second);CHECK(d.pixels()[7]==0);d.undo();
 d.setLayerVisible(true);d.restoreTimelineSelection({}, {d.frame().id});
 CHECK(d.outlinePixels(settings,0xff00ff00));
 for(const auto& id:{first,second}){d.selectLayer(id);CHECK(d.pixels()[7]==0xff00ff00);}
}
static void noOpAndColor(){
 Document blank(5,5);OutlineSampling settings;const auto emptyHistory=blank.historySize();
 CHECK(!blank.outlinePixels(settings,0xff00ff00));CHECK(blank.historySize()==emptyHistory);
 blank.beginStroke({2,2},0xff0000ff);blank.commitStroke();const auto original=blank.pixels();
 CHECK(blank.outlinePixels(settings,0x80123456));CHECK(blank.pixels()[7]==0x80123456);
 blank.undo();CHECK(blank.pixels()==original);
 CHECK(blank.outlinePixels(settings,0x00123456));CHECK(blank.pixels()[7]==0x00123456);
 blank.undo();CHECK(blank.pixels()==original);
 Document::TimelineSelection masks;masks.maskRows={blank.layer().id};
 blank.restoreTimelineSelection(masks,{});const auto history=blank.historySize();
 CHECK(!blank.outlinePixels(settings,0xff00ff00));CHECK(blank.historySize()==history);
}
int main(){try{batchTargets();noOpAndColor();Document d(5,5);d.beginStroke({2,2},0xff0000ff);d.commitStroke();const auto original=d.pixels();const auto layer=d.layer().id;d.addLinkedFrame();const auto linked=d.cel().id;d.restoreTimelineSelection({}, {d.timeline().state().frames[0].id,d.frame().id});OutlineSampling settings;const auto history=d.historySize();CHECK(d.outlinePixels(settings,0xff00ff00));CHECK(d.historySize()==history+1);CHECK(d.pixels()[7]==0xff00ff00&&d.pixels()[11]==0xff00ff00&&d.pixels()[6]==0);CHECK(d.timeline().findCelById(linked)->linkedCelId);d.undo();CHECK(d.pixels()==original);d.redo();CHECK(d.pixels()[7]==0xff00ff00);d.undo();d.clearTimelineSelection();d.previewSelection(SelectionMask{0,0,2,2,{}});CHECK(d.outlinePixels(settings,0xff112233,false,45,false,true));CHECK(d.pixels()[0]==0xff112233);d.undo();CHECK(d.pixels()==original);d.setLayerLocked(true);const auto h=d.historySize();CHECK(!d.outlinePixels(settings,0xff112233)&&d.historySize()==h);std::cout<<"Outline transaction, linked targets, boundary, locks and undo passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}

