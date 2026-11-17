#include "document_pane_layout.h"
#include "document_pane_workspace.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <stdexcept>
using namespace moon::workspace::panes;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
std::string encode(const Layout& n){if(!n)return "#";if(n->leaf)return "L("+n->id+","+n->document+")";std::ostringstream s;s<<std::setprecision(17)<<n->ratio;return "S("+n->id+","+(n->orientation==Orientation::Horizontal?"horizontal":"vertical")+","+s.str()+","+encode(n->first)+","+encode(n->second)+")";}
Direction direction(const std::string& s){return s=="left"?Direction::Left:s=="right"?Direction::Right:s=="top"?Direction::Top:Direction::Bottom;}
void oracle(const char* path){
 std::ifstream in(path);check(bool(in),"Missing actual legacy layout oracle");Layout n;std::string line;int seq=0,count=0;IdFactory ids=[&]{return std::to_string(++seq);};
 while(std::getline(in,line)){
  const auto split=line.find('|');std::istringstream row(line.substr(0,split));char op;std::string a,b,d;row>>op>>a;
  if(op=='C')n=create(a);else if(op=='I'||op=='M'){row>>b>>d;n=op=='I'?insert(n,a,b,direction(d),ids):move(n,a,b,direction(d),ids);}
  else if(op=='R'){row>>b;n=replace(n,a,b);}else if(op=='D')n=remove(n,a);else if(op=='Z'){double ratio;row>>ratio;n=resize(n,a,ratio);}
  // JavaScript toPrecision keeps trailing fractional zeros. Normalize only
  // those zeros; retain every structural identifier and binary-double digit.
  auto expected=line.substr(split+1);for(std::size_t pos=0;(pos=expected.find(",0.",pos))!=std::string::npos;++pos){auto end=expected.find(',',pos+1);if(end!=std::string::npos){while(end>pos+3&&expected[end-1]=='0'){expected.erase(--end,1);}}}
  if(encode(n)!=expected)throw std::runtime_error("Legacy layout transition "+std::to_string(count)+" differs: "+encode(n)+" expected "+expected);++count;
 }check(count>300,"Legacy layout oracle coverage");std::cout<<count<<" actual legacy layout transitions passed\n";
}
int main(int argc,char** argv){try{
 int sequence=0;IdFactory ids=[&]{return std::to_string(++sequence);};
 auto a=create("a"),ab=insert(a,"a","b",Direction::Right,ids),abc=insert(ab,"b","c",Direction::Bottom,ids);
 check(ab->ratio==1-1./3&&ab->first==a&&ab->second->id=="pane:1","Legacy initial one-third split and retained main pane");
 auto replacement=replace(abc,"a","d");check(replacement->second==abc->second&&replacement->first->id=="a"&&contains(replacement,"d"),"Closed main replacement preserves embedded siblings and pane identity");
 check(insert(abc,"a","c",Direction::Left,ids)==abc&&insert(abc,"missing","x",Direction::Top,ids)==abc,"Duplicate and missing target are no-ops");
 auto reordered=move(abc,"a","c",Direction::Top,ids);check(leafIds(reordered)==std::vector<std::string>({"b","a","c"}),"Move removes and reinserts without duplicate documents");
 check(remove(abc,"a")==abc->second&&remove(a,"a")==nullptr,"Removal collapses only empty parent");
 auto selected=selectMain(abc,"d",{"b","c"});check(selected->second==abc->second&&contains(selected,"d"),"Tab changes main view while retaining embedded panes");
 check(selectMain(abc,"c",{"b","c"})==abc&&selectMain(abc,"x",{"a","b","c"})==abc,"Existing pane and all-embedded selection no-op");
 auto detached=detach(abc,"a","a",{"b","c"},{"c","b"});check(detached.layout==abc->second&&detached.workspace=="b"&&detached.paneOnly==std::vector<std::string>{"c"},"Detach promotes first available embedded view");
 auto lone=detach(ab,"a","a",{"b"},{"b"});check(!lone.layout&&lone.workspace=="b"&&lone.paneOnly.empty(),"Detach last split returns remaining view to tabs");
 auto external=splitFromTab(abc,"a",{"x","b",Direction::Left,""},ids);check(leafIds(external)==std::vector<std::string>({"a","x","b","c"}),"External tab inserts into existing split");
 auto swapped=splitFromTab(ab,"a",{"a","x",Direction::Right,"a"},ids);check(leafIds(swapped)==std::vector<std::string>({"x","a","b"}),"Dragging main tab uses preview replacement target");
 check(!preview(ab,"x",{},ids)&&preview(ab,"a",{},ids)==ab,"Preview exposes only committed layout containing active workspace");
 check(resize(abc,"missing",.7)==abc&&resize(abc,abc->id,5)->ratio==.9&&resize(abc,abc->id,-5)->ratio==.1&&clampRatio(std::nan(""))==.5,"Ratio clamp and missing split identity");
 ResizeGesture gesture(Orientation::Horizontal,.5,{100,0},500);gesture.move({200,0});check(gesture.finish(false)==.7&&!gesture.finish(false),"Resize commits once");
 ResizeGesture cancel(Orientation::Vertical,.5,{0,100},500);cancel.move({0,250});check(!cancel.finish(true),"Cancelled resize publishes nothing");
 Rect rect{100,200,500,500,400,300};check(dockDirection(rect,{300,350})==Direction::Top&&dockDirection(rect,{500,350})==Direction::Right&&!dockDirection(rect,{501,350}),"Dock inclusive edges and center tie");
 check(dockAlongPath(rect,{0,350},{600,350})==Direction::Left&&!dockAlongPath(rect,{0,0},{600,0}),"Dock traversed path and no-hit path");
 check(dropDirection(rect,{190,480})==Direction::Left,"Drop quarter-edge priority");
 check(previewBand(0)==18&&previewBand(500)==25&&previewBand(5000)==56,"Preview band limits");
 const auto band=previewRect(rect,Direction::Right);check(band.left==480&&band.width==20&&band.right==500,"Preview band stays inside original pane");

 Workspace w;w.reconcile({"a","b","c","d"},"a");w.split({"b","a",Direction::Right,""},ids);w.split({"d","b",Direction::Bottom,""},ids);
 const auto side=w.layout->second;w.layout=resize(w.layout,w.layout->id,.42);w.activateTab("c");check(w.layout->ratio==.42&&w.layout->second==side&&w.main=="c"&&w.paneOnly==std::vector<std::string>({"b","d"}),"Legacy nested views retained on main tab switch");
 w.activate("b");check(w.main=="c"&&w.active=="b","Embedded activation does not replace main view");
 w.reconcile({"a","b","c","d","new"},"new");check(contains(w.layout,"new")&&w.layout->second==side,"New project preserves secondary panes");
 w.reconcile({"a","c","d","new"},"new");check(!contains(w.layout,"b")&&contains(w.layout,"d")&&w.paneOnly==std::vector<std::string>{"d"},"Closed side pane does not import unrelated tab");
 w.reconcile({"a","c","d"},"a");check(w.main=="a"&&contains(w.layout,"a")&&contains(w.layout,"d"),"Closed main uses available tab and retains side pane");
 w.floatDocument("d",{});check(!w.visible()&&w.main=="a"&&w.active=="d"&&w.floating.size()==1,"Floating secondary keeps main workspace");w.returnFloating("d",0);check(w.main=="a"&&w.active=="a"&&w.open.front()=="d","Return floating to tabs preserves main and visible order");
 w.floatDocument("c",{});w.pin("c",true);w.returnFloating("c");check(w.main=="c"&&w.active=="c"&&w.floating.empty(),"Return without tab index activates returned document");

 const auto geometry=regions(abc,rectangle(101,203,906,606));
 check(geometry.leaves.size()==3&&geometry.dividers.size()==2,"Nested production regions preserve all leaves and dividers");
 const auto& firstRegion=geometry.leaves[0].bounds;const auto& rootDivider=geometry.dividers[0].bounds;
 check(firstRegion.left==101&&std::abs(firstRegion.width-600)<1e-9&&std::abs(rootDivider.left-701)<1e-9&&rootDivider.width==6&&std::abs(geometry.leaves[1].bounds.left-707)<1e-9,"Split ratio excludes divider and retains nonzero physical origin");
 check(regionAt(geometry.leaves,{102,204})->node->document=="a"&&regionAt(geometry.dividers,{704,250})->node==abc,"Drawing and pointer routing share region geometry");
 const auto tiny=regions(abc,rectangle(0,0,2,1));for(const auto& leaf:tiny.leaves)check(leaf.bounds.width>=0&&leaf.bounds.height>=0,"Tiny nested panes retain nonnegative content extents");

 DockResizeGesture outer(abc,Direction::Left);const auto anchored=outer.finish(false,{{abc->id,400,500},{abc->second->id,30,70}});
 check(std::abs(anchored->ratio-400./900)<1e-12&&anchored->second==abc->second,"Outer horizontal resize preserves perpendicular nested split");
 check(outer.finish(false,{})==abc,"Dock resize finishes once");
 DockResizeGesture unchanged(abc,Direction::Right);check(unchanged.finish(false,{{abc->id,200,100}})==abc,"Equal measured ratio retains immutable identity");
 DockResizeGesture cancelled(abc,Direction::Bottom);check(cancelled.finish(true,{{abc->second->id,10,90}})==abc,"Cancelled outer dock resize restores original tree");
 DockResizeGesture bottom(abc,Direction::Bottom);const auto vertical=bottom.finish(false,{{abc->second->id,500,400}});check(vertical->ratio==abc->ratio&&std::abs(vertical->second->ratio-500./900)<1e-12,"Bottom resize updates only vertical split");
 check(bottom.fixedTrack(500,906)==500&&bottom.fixedTrack(500,100)==84&&bottom.fixedTrack(1,10)==1,"Captured far track follows legacy CSS clamp including minimum precedence");

 std::vector<DockTarget> targets{{"left",rectangle(0,0,100,100)},{"right",rectangle(110,0,100,100)}};
 DockOptions options;check(dockTargetAt(targets,{105,50},options).target->pane=="right","Proximity ties follow last legacy candidate");
 options.strict=true;check(!dockTargetAt(targets,{105,50},options).target,"Strict hit excludes outer slop");
 options.strict=false;options.direct="left";check(dockTargetAt(targets,{100,50},options).target->pane=="left","Direct native widget hit has precedence");
 options.exclude="left";check(dockTargetAt(targets,{100,50},options).target->pane=="right","Dragged pane excluded from live candidates");
 options={};options.previous=Point{-50,50};check(dockTargetAt(targets,{300,50},options).target->pane=="right","Traversed path chooses nearest endpoint candidate");
 options.captured=targets;check(!dockTargetAt(targets,{300,50},options).target,"Captured drag targets bypass path fallback");
 options.current=DockTarget{"retained",rectangle(0,0,100,100)};check(dockTargetAt(targets,{50,50},options).target->pane=="retained","Captured current target retains precedence");
 if(argc>1)oracle(argv[1]);
 std::cout<<"document-pane layout checks passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
