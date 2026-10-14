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
  {State state;state.frames={{"a",100},{"b",100,true},{"c",100},{"d",100}};state.loopSections={{"outer",U"","a","d","reverse",{}},{"inner",U"","b","c","reverse",{}}};require(stepFrameId(state,"a",-1,false)=="d","Manual previous wraps");require(stepFrameId(state,"a",1,false)=="c","Manual skips disabled");require(stepFrameId(state,"b",-1,false)=="a","Disabled current previous global");require(stepFrameId(state,"b",1,false)=="c","Disabled current next global");require(stepFrameId(state,"c",1,true)=="c","Innermost tag one playable");require(stepFrameId(state,"c",1,true,false)=="b","Manual tag uses time order ignoring direction");require(stepFrameId(state,"b",-1,true)=="c","Disabled current previous tag");require(stepFrameId(state,"missing",1,false)=="a" && stepFrameId(state,"missing",-1,false)=="d","Missing active boundary");for(auto& f:state.frames)f.disabled=true;require(stepFrameId(state,"a",1,false).empty(),"No playable manual candidate");require(stepFrameId(state,"a",0,false).empty(),"No direction no-op");}

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

  {State state;state.frames={{"a",100},{"b",100},{"c",100},{"d",100}};state.loopSections={{"outer",U"Outer","a","d","forward",{}},{"inner",U"Inner","b","c","reverse",2}};LoopPlayback playback{{"outer",0,{}},{},true};std::string frame="a";for(const auto& expected:{"c","b","c","b","c","d","a"}){auto step=advanceLoopPlayback(state,playback,frame);require(!step.completed && step.frameId==expected,"Infinite parent honors finite nested repeat count");frame=step.frameId;}}
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
  State loops;for(int n=0;n<8;++n)loops.frames.push_back({"f"+std::to_string(n),100});loops.loopSections={{"outer",U"Outer","f0","f7"},{"child",U"Child","f1","f4"},{"leaf",U"Leaf","f2","f3"},{"sibling",U"Sibling","f5","f6"}};auto layout=layoutLoopSections(loops);require(layout.laneCount==3 && layout.items[0].id=="outer" && layout.items[0].laneSpan==3,"Loop parent spans all nested lanes");require(layout.items[1].lane==1 && layout.items[2].lane==2 && layout.items[3].lane==2,"Loop leaves shift to deepest available lane");auto preview=layoutLoopSections(loops,LoopSectionPreview{"leaf",5,7});require(preview.items.size()==4 && loops.loopSections[2].startFrameId=="f2","Loop preview does not mutate source");State same; same.frames=loops.frames;same.loopSections={{"b",U"B","f1","f3"},{"a",U"A","f1","f3"},{"next",U"Next","f4","f5"}};auto tied=layoutLoopSections(same);require(tied.laneCount==2 && tied.items[0].id=="a" && tied.items[1].id=="b" && tied.items[2].lane==1,"Equal ranges retain name tie order and nonoverlap leaf placement");require(loopResizeFrameIndex(112,100,24,8,true)==1 && loopResizeFrameIndex(112,100,24,8,false)==0 && loopResizeFrameIndex(-100,100,24,8,true)==0 && loopResizeFrameIndex(999,100,24,8,false)==7,"Loop resize rounds boundaries and clamps both edges");
  std::cout<<"Timeline model: 2 layers x 2 frames, source-owned writes, linked fallback/cache, deep copies, IDs, sparse slots and validation passed.\n";
}
