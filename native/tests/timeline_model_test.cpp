#include "timeline_model.h"
#include <iostream>
#include <stdexcept>
using namespace moon::timeline;
static void require(bool condition,const char* message) {if(!condition) throw std::runtime_error(message);}
template<class Action> static void rejects(Action action) {
  bool rejected=false;try {action();}catch(const std::exception&) {rejected=true;}
  require(rejected,"Expected explicit validation error");
}
static Cel cel(std::string id,std::string layer,std::string frame,Pixel color=0) {
  Cel result;result.id=std::move(id);result.layerId=std::move(layer);result.frameId=std::move(frame);
  result.surface=Surface{2,2,-3,5,7,9,std::vector<Pixel>(4,color)};return result;
}
static State fixture() {
  State state;state.layers={{"A",U"A"},{"B",U"B"}};state.frames={{"F1",100},{"F2",150}};
  state.cels={cel("A1","A","F1",0xff123456),cel("A2","A","F2",0xff654321),
              cel("B1","B","F1",0xffabcdef),cel("B2","B","F2",0xfffedcba)};
  return state;
}
int main() {
  Timeline timeline(fixture());
  require(timeline.findCel("A","F1")->id=="A1","Stable slot identity");
  require(timeline.findCel("B","F2")->id=="B2","Second layer/frame identity");
  auto edit=timeline.setPixel("A1",2,0xff112233);
  require(edit.sourceCelId=="A1" && edit.before==0xff123456 && edit.changed(),"Write records original owner and value");
  require(timeline.resolveSurface("B2").surface->pixels[2]==0xfffedcba,"Other frame/layer untouched");
  timeline.setPixel(edit.sourceCelId,edit.index,edit.before);
  require(timeline.resolveSurface("A1").surface->pixels[2]==0xff123456,"Owner-addressed rollback after switching selection");
  timeline.setPixel(edit.sourceCelId,edit.index,edit.after);
  require(timeline.resolveSurface("A1").surface->pixels[2]==0xff112233,"Owner-addressed redo value");
  const auto surface=timeline.resolveSurface("A1").surface;
  require(surface->offsetX==-3 && surface->offsetY==5 && surface->storageOriginX==7 && surface->storageOriginY==9,"Local geometry retained");

  auto linked=fixture();linked.cels[1].linkedCelId="A1";
  Timeline shared(linked);
  require(shared.resolveSurface("A2").surface==shared.resolveSurface("A1").surface,"Linked cels resolve one source surface");
  auto linkedEdit=shared.setPixel("A2",0,0xffabcdef);
  require(linkedEdit.sourceCelId=="A1" && shared.resolveSurface("A1").surface->pixels[0]==0xffabcdef,"Linked write targets source ID");
  require(shared.findCelById("A2")->surface->pixels[0]==0xff654321,"Alias retained input surface for fallback, no duplicate write");
  for(int i=0;i<100;++i) require(shared.resolveSurface("A2").source->id=="A1","Repeated indexed resolution stable");
  Timeline copy=shared;
  require(copy.resolveSurface("A2").surface==copy.resolveSurface("A1").surface,"Copy retains internal aliases");
  require(copy.resolveSurface("A1").surface!=shared.resolveSurface("A1").surface,"Copy owns independent storage");
  copy.setPixel("A2",0,0xff000000);
  require(shared.resolveSurface("A1").surface->pixels[0]==0xffabcdef,"No implicit sharing between copies");
  shared.setPixel(linkedEdit.sourceCelId,linkedEdit.index,linkedEdit.before);
  require(shared.resolveSurface("A2").surface->pixels[0]==linkedEdit.before,"Linked rollback visible through alias");

  // Exact fallback categories from animation-single-cel-sync.test.ts.
  for(const auto target:{"missing","B1","A1"}) {
    auto state=fixture();state.cels[1].linkedCelId=target;
    const auto expected=std::string(target)=="missing"?LinkIssue::MissingTarget:std::string(target)=="B1"?LinkIssue::CrossLayer:LinkIssue::Cycle;
    if(expected==LinkIssue::Cycle) state.cels[0].linkedCelId="A2";
    Timeline invalid(std::move(state));
    const auto result=invalid.resolveSurface("A2");
    require(result.issue==expected && result.source->id=="A2","Invalid link returns requesting cel with diagnosis");
    require(result.surface->pixels[0]==0xff654321,"Fallback preserves original content");
    require(!invalid.diagnoseLinks().empty(),"Invalid links observable");
    auto fallbackEdit=invalid.setPixel("A2",0,123);
    require(fallbackEdit.sourceCelId=="A2" && fallbackEdit.linkIssue==expected,"Fallback writes report issue");
    if(expected==LinkIssue::Cycle) require(invalid.resolveSurface("A1").source->id=="A1","Cycle cache retains per-origin fallback");
  }
  auto missing=fixture();missing.frames.push_back({"F3",100});missing.cels[1].linkedCelId="A3";
  Timeline repaired(missing);require(repaired.resolveSurface("A2").issue==LinkIssue::MissingTarget,"Initial missing link");
  repaired.addCel(cel("A3","A","F3",77));
  require(repaired.resolveSurface("A2").source->id=="A3" && repaired.resolveSurface("A2").issue==LinkIssue::None,"New source invalidates negative cache");
  require(repaired.resolveSurface("unknown").issue==LinkIssue::UnknownCel,"Unknown source explicit");

  Timeline ids;ids.addLayer({"a:b",U"one"});ids.addLayer({"a",U"two"});
  ids.addFrame({"c",100});ids.addFrame({"b:c",100});
  ids.addCel(cel("1|x","a:b","c"));ids.addCel(cel("2:x","a","b:c"));
  require(ids.findCel("a:b","c")->id=="1|x" && ids.findCel("a","b:c")->id=="2:x","Arbitrary IDs cannot collide through delimiters");
  require(ids.findCel("a","c")==nullptr,"Lookup does not materialize empty slots");
  Cel sparse;sparse.id="sparse";sparse.layerId="a";sparse.frameId="c";ids.addCel(sparse);
  require(ids.resolveSurface("sparse").source && !ids.resolveSurface("sparse").surface,"Sparse cel is not synthesized");
  rejects([&]{ids.setPixel("sparse",0,1);});
  const auto count=ids.state().cels.size();
  rejects([&]{ids.addCel(cel("other","a","c"));});
  rejects([&]{ids.addCel(cel("1|x","a:b","b:c"));});
  rejects([&]{ids.addCel(cel("new","missing","c"));});
  rejects([&]{ids.addLayer({"a",U"duplicate"});});
  rejects([&]{ids.addFrame({"bad",0});});
  auto malformed=cel("bad-surface","a:b","b:c");malformed.surface->pixels.pop_back();
  rejects([&]{ids.addCel(malformed);});
  rejects([&]{ids.setPixel("1|x",4,0);});
  require(ids.state().cels.size()==count,"Rejected mutations preserve structure");
  std::cout<<"Timeline model: 2 layers x 2 frames, source-owned writes, linked fallback/cache, deep copies, IDs, sparse slots and validation passed.\n";
}
