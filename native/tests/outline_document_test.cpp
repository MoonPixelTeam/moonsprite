#include "document.h"
#include "outline_samples.h"
#include <iostream>
#include "project_encode.h"
#include "project_import.h"
#include "document_snapshot.h"
#include "outline_settings_json.h"
#include <winrt/base.h>
namespace moon {struct RasterHistoryFixture {static void empty(Document& d){auto state=d.timeline_.state();state.cels.clear();d.timeline_=timeline::Timeline(std::move(state));}};}
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

}
static void maskTargets(){
 Document d(5,5);CHECK(d.fillSelectionOrCanvas(0xff112233));const auto owner=d.layer().id,frame=d.frame().id;
 CHECK(d.createAttachedMask(owner,frame));d.beginStroke({2,2},0xff000000);CHECK(d.commitStroke());
 const auto root=d.activeMaskId();const auto before=timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.pixels;
 OutlineSampling settings;const auto history=d.historySize();
 CHECK(d.outlinePixels(settings,0xff0000ff));CHECK(d.historySize()==history+1);
 const auto gray=timeline::normalizedMaskPixel(0xff0000ff);
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.pixels[7]==gray);
 CHECK(d.pixels()[7]==0xff112233);d.undo();CHECK(d.activeMaskId()==root);
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.pixels==before);d.redo();
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,frame)->surface.pixels[7]==gray);d.undo();
 d.exitAttachedMask();d.addFrame(false);const auto second=d.frame().id;
 CHECK(d.fillSelectionOrCanvas(0xff112233));CHECK(d.createAttachedMask(owner,second));
 CHECK(d.linkAttachedMasks({{owner,frame},{owner,second}}));d.exitAttachedMask();
 const auto linkedHistory=d.historySize();
 CHECK(d.outlinePixels(settings,0xff0000ff,false,45,false,false,{{owner,frame},{owner,second}}));
 CHECK(d.historySize()==linkedHistory+1);
 CHECK(timeline::resolvedMask(d.timeline().state(),owner,second)->surface.pixels[7]==gray);
 d.undo();CHECK(timeline::resolvedMask(d.timeline().state(),owner,second)->surface.pixels==before);
 CHECK(d.setAttachedMaskFlags(owner,frame,true,true,true,false));const auto lockedHistory=d.historySize();
 CHECK(!d.outlinePixels(settings,0xff0000ff,false,45,false,false,{{owner,frame},{owner,second}}));CHECK(d.historySize()==lockedHistory);
}
static void missingAndSparse(){
 Document seed(5,5);Document d(5,5);const auto owner=d.layer().id,frame=d.frame().id;
 RasterHistoryFixture::empty(d);
 d.previewSelection(SelectionMask{1,1,2,2,{}});OutlineSampling settings;const auto h=d.historySize();
 CHECK(d.outlinePixels(settings,0xff00ff00,false,45,false,true));CHECK(d.historySize()==h+1);
 CHECK(d.timeline().findCel(owner,frame));CHECK(d.canvasPixels()[6]==0xff00ff00);d.undo();CHECK(d.timeline().findCel(owner,frame)&&d.canvasPixels()==std::vector<Pixel>(25));d.redo();CHECK(d.canvasPixels()[6]==0xff00ff00);
 auto sparse=seed.timeline().state();auto& surface=*sparse.cels.front().surface;
 surface.width=surface.height=4;surface.offsetX=surface.offsetY=-1;surface.pixels.assign(16,0);surface.pixels[0]=0x00123456;surface.pixels[15]=0xff0000ff;
 auto off=Document::fromImported(5,5,std::move(sparse),seed.palette(),"outline-sparse",U"sparse",std::make_shared<const std::vector<std::uint8_t>>());
 CHECK(off.outlinePixels(settings,0xff00ff00));const auto* out=off.timeline().resolveSurface(off.cel().id).surface;
 CHECK(raster::readWorld(*out,-1,-1)==0x00123456);CHECK(raster::readWorld(*out,3,2)==0xff00ff00);
 off.undo();out=off.timeline().resolveSurface(off.cel().id).surface;CHECK(out->width==4&&out->height==4&&out->offsetX==-1);
}
static void settingsRoundtrip(){
 Document d(5,5);d.beginStroke({2,2},0xff123456);d.commitStroke();OutlineSettings settings;
 settings.color=0x80345678;settings.sampling.thickness=2;settings.sampling.position=2;settings.sampling.kernel=1;settings.sampling.directions=255;settings.sampling.background=0x00123456;settings.smartHue=true;settings.darkness=63;settings.followOpacity=true;settings.previewEnabled=false;
 CHECK(d.applyOutline(settings));CHECK(d.outlineSettings());const auto expected=encodeOutlineSettings(settings).Stringify();
 auto check=[&](const Document& value){CHECK(value.outlineSettings());CHECK(encodeOutlineSettings(*value.outlineSettings()).Stringify()==expected);};
 d.undo();check(d);d.redo();check(d);
 auto archive=project::encodeEditableProject(d);auto imported=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(archive.bytes)));check(imported);
 DocumentSnapshot snapshot(d);while(!snapshot.advance(d,std::chrono::steady_clock::now()+std::chrono::seconds(1))){}check(snapshot.finish());
 Document other(5,5);CHECK(other.rollbackProject(d));check(other);other.undo();CHECK(!other.outlineSettings());other.redo();check(other);
 auto bad=winrt::Windows::Data::Json::JsonObject::Parse(L"{\"thickness\":1000,\"position\":\"bad\",\"directions\":{\"nw\":true},\"color\":{\"r\":-3,\"g\":300,\"b\":3.5,\"a\":0},\"smartHueDarkness\":-7}");
 auto normalized=*decodeOutlineSettings(bad);CHECK(normalized.sampling.thickness==64&&normalized.sampling.position==1&&normalized.sampling.directions==91&&normalized.color==0x0004ff00&&normalized.darkness==0);
}
static void taskChecks(){
 Document d(5,5);d.beginStroke({2,2},0xff123456);d.commitStroke();const auto original=d.pixels();const auto history=d.historySize();OutlineSettings settings;settings.color=0xff00ff00;
 auto task=d.captureOutlineTask(settings);CHECK(Document::runOutlineTask(task,[]{return false;}));CHECK(d.pixels()==original&&d.historySize()==history);CHECK(d.publishOutlineTask(task));CHECK(d.displayPixels()!=original&&d.pixels()==original);d.cancelColorAdjustment();CHECK(d.displayPixels()==original);CHECK(d.commitOutlineTask(std::move(task)));CHECK(d.historySize()==history+1);d.undo();CHECK(d.pixels()==original);d.redo();CHECK(d.pixels()!=original);d.undo();
 auto stale=d.captureOutlineTask(settings);CHECK(Document::runOutlineTask(stale,[]{return false;}));d.beginStroke({0,0},0xffabcdef);d.commitStroke();CHECK(!d.publishOutlineTask(stale));CHECK(!d.commitOutlineTask(std::move(stale)));
 auto cancelled=d.captureOutlineTask(settings);CHECK(!Document::runOutlineTask(cancelled,[]{return true;}));CHECK(!cancelled.changed);
}
int main(){try{winrt::init_apartment();settingsRoundtrip();taskChecks();batchTargets();noOpAndColor();maskTargets();missingAndSparse();Document d(5,5);d.beginStroke({2,2},0xff0000ff);d.commitStroke();const auto original=d.pixels();const auto layer=d.layer().id;d.addLinkedFrame();const auto linked=d.cel().id;d.restoreTimelineSelection({}, {d.timeline().state().frames[0].id,d.frame().id});OutlineSampling settings;const auto history=d.historySize();CHECK(d.outlinePixels(settings,0xff00ff00));CHECK(d.historySize()==history+1);CHECK(d.pixels()[7]==0xff00ff00&&d.pixels()[11]==0xff00ff00&&d.pixels()[6]==0);CHECK(d.timeline().findCelById(linked)->linkedCelId);d.undo();CHECK(d.pixels()==original);d.redo();CHECK(d.pixels()[7]==0xff00ff00);d.undo();d.clearTimelineSelection();d.previewSelection(SelectionMask{0,0,2,2,{}});CHECK(d.outlinePixels(settings,0xff112233,false,45,false,true));CHECK(d.pixels()[0]==0xff112233);d.undo();CHECK(d.pixels()==original);d.setLayerLocked(true);const auto h=d.historySize();CHECK(!d.outlinePixels(settings,0xff112233)&&d.historySize()==h);std::cout<<"Outline transaction, linked targets, boundary, locks and undo passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}

