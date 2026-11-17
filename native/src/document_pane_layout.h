#pragma once
#include <algorithm>
#include <cmath>
#include <functional>
#include <memory>
#include <limits>
#include <optional>
#include <string>
#include <vector>

// Port of legacy/core/document-pane-layout.ts. Immutable nodes retain unchanged
// siblings and pane identities during tab selection, movement and replacement.
namespace moon::workspace::panes {
enum class Direction { Left, Right, Top, Bottom };
enum class Orientation { Horizontal, Vertical };
struct Node;
using Layout=std::shared_ptr<const Node>;
struct Node {
 bool leaf=true;
 std::string id,document;
 Orientation orientation=Orientation::Horizontal;
 double ratio=.5;
 Layout first,second;
};
using IdFactory=std::function<std::string()>;
inline double clampRatio(double value){return std::max(.1,std::min(.9,std::isfinite(value)?value:.5));}
inline Layout create(const std::string& document){Node n;n.id=n.document=document;return std::make_shared<const Node>(std::move(n));}
inline bool contains(const Layout& n,const std::string& document){return n&&(n->leaf?n->document==document:contains(n->first,document)||contains(n->second,document));}
inline std::vector<std::string> leafIds(const Layout& n){if(!n)return {};if(n->leaf)return {n->document};auto ids=leafIds(n->first),tail=leafIds(n->second);ids.insert(ids.end(),tail.begin(),tail.end());return ids;}
inline std::string directionName(Direction d){switch(d){case Direction::Left:return "left";case Direction::Right:return "right";case Direction::Top:return "top";default:return "bottom";}}
inline Layout children(const Layout& n,Layout a,Layout b){if(a==n->first&&b==n->second)return n;auto copy=*n;copy.first=std::move(a);copy.second=std::move(b);return std::make_shared<const Node>(std::move(copy));}
inline Layout insert(const Layout& n,const std::string& target,const std::string& document,Direction direction,const IdFactory& nextId){
 if(!n||contains(n,document))return n;
 if(n->leaf){
  if(n->document!=target)return n;
  auto pane=*create(document);pane.id="pane:"+nextId();auto added=std::make_shared<const Node>(std::move(pane));
  const bool horizontal=direction==Direction::Left||direction==Direction::Right,first=direction==Direction::Left||direction==Direction::Top;
  Node split;split.leaf=false;split.id="split:"+n->id+":"+document+":"+directionName(direction);split.orientation=horizontal?Orientation::Horizontal:Orientation::Vertical;split.ratio=first?1./3:1-1./3;split.first=first?added:n;split.second=first?n:added;
  return std::make_shared<const Node>(std::move(split));
 }
 auto first=insert(n->first,target,document,direction,nextId);if(first!=n->first)return children(n,first,n->second);
 auto second=insert(n->second,target,document,direction,nextId);return children(n,n->first,second);
}
inline Layout resize(const Layout& n,const std::string& id,double ratio){
 if(!n||n->leaf)return n;
 if(n->id==id){auto copy=*n;copy.ratio=clampRatio(ratio);return std::make_shared<const Node>(std::move(copy));}
 return children(n,resize(n->first,id,ratio),resize(n->second,id,ratio));
}
inline Layout remove(const Layout& n,const std::string& document){
 if(!n)return n;if(n->leaf)return n->document==document?Layout{}:n;
 auto a=remove(n->first,document),b=remove(n->second,document);if(!a)return b;if(!b)return a;return children(n,a,b);
}
inline Layout move(const Layout& n,const std::string& document,const std::string& target,Direction direction,const IdFactory& nextId){
 if(document==target||!contains(n,document)||!contains(n,target))return n;auto remaining=remove(n,document);return remaining?insert(remaining,target,document,direction,nextId):n;
}
inline Layout replace(const Layout& n,const std::string& document,const std::string& replacement){
 if(!n)return n;if(n->leaf){if(n->document!=document)return n;auto copy=*n;copy.document=replacement;return std::make_shared<const Node>(std::move(copy));}
 return children(n,replace(n->first,document,replacement),replace(n->second,document,replacement));
}
struct Placement {std::string document,target;Direction direction=Direction::Right;std::string preview;};
inline Layout committed(const Layout& n,const std::string& active){return n&&!n->leaf&&contains(n,active)?n:Layout{};}
inline Layout splitFromTab(const Layout& n,const std::string& active,const Placement& p,const IdFactory& nextId){
 auto base=committed(n,active);if(!base)base=create(active);
 if(!contains(base,p.document))return insert(base,p.target,p.document,p.direction,nextId);
 if(contains(base,p.target))return move(base,p.document,p.target,p.direction,nextId);
 if(p.preview.empty()||!contains(base,p.preview))return base;
 return insert(replace(base,p.preview,p.target),p.target,p.document,p.direction,nextId);
}
inline Layout preview(const Layout& n,const std::string& active,const std::optional<Placement>& placement,const IdFactory& nextId){return placement?splitFromTab(n,active,*placement,nextId):committed(n,active);}
inline bool has(const std::vector<std::string>& ids,const std::string& id){return std::find(ids.begin(),ids.end(),id)!=ids.end();}
inline Layout selectMain(const Layout& n,const std::string& document,const std::vector<std::string>& paneOnly){
 if(!n||document.empty()||contains(n,document))return n;
 for(const auto& id:leafIds(n))if(!has(paneOnly,id))return replace(n,id,document);
 return n;
}
struct Detached {Layout layout;std::vector<std::string> paneOnly;std::string workspace;};
inline Detached detach(const Layout& n,const std::string& document,const std::string& workspace,const std::vector<std::string>& paneOnly,const std::vector<std::string>& available){
 const bool was=contains(n,document);auto remaining=was?remove(n,document):n;
 Detached result;result.layout=remaining&&!remaining->leaf?remaining:Layout{};
 for(const auto& id:paneOnly)if(id!=document&&has(available,id)&&!(was&&remaining&&remaining->leaf&&remaining->document==id))result.paneOnly.push_back(id);
 if(!workspace.empty()&&has(available,workspace))result.workspace=workspace;
 if(result.workspace.empty()&&was&&remaining){
  std::string promoted;if(remaining->leaf)promoted=remaining->document;else for(const auto& id:leafIds(remaining))if(has(available,id)){promoted=id;break;}
  if(!promoted.empty()){result.workspace=promoted;auto& ids=result.paneOnly;ids.erase(std::remove(ids.begin(),ids.end(),promoted),ids.end());}
 }
 if(result.workspace.empty())for(const auto& id:available)if(!has(result.paneOnly,id)){result.workspace=id;break;}
 return result;
}
struct Point {double x=0,y=0;};
struct Rect {double left=0,top=0,right=0,bottom=0,width=0,height=0;};
inline bool inside(Point p,const Rect& r){return p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom;}
inline Direction dropDirection(const Rect& r,Point p){
 const auto x=(p.x-r.left)/std::max(1.,r.width),y=(p.y-r.top)/std::max(1.,r.height);
 if(x<=.25)return Direction::Left;if(x>=.75)return Direction::Right;if(y<=.25)return Direction::Top;if(y>=.75)return Direction::Bottom;
 const auto hw=std::max(1.,r.width/2),hh=std::max(1.,r.height/2),h=(p.x-(r.left+hw))/hw,v=(p.y-(r.top+hh))/hh;
 if(std::abs(h)>=std::abs(v))return h<0?Direction::Left:Direction::Right;return v<0?Direction::Top:Direction::Bottom;
}
inline std::optional<Direction> dockDirection(const Rect& r,Point p){
 if(!inside(p,r))return {};
 const auto x=(p.x-r.left-r.width/2)/std::max(1.,r.width/2),y=(p.y-r.top-r.height/2)/std::max(1.,r.height/2);
 if(std::abs(x)>std::abs(y))return x<0?Direction::Left:Direction::Right;return y<=0?Direction::Top:Direction::Bottom;
}
inline std::optional<Direction> dockAlongPath(const Rect& r,Point from,Point to){
 if(auto endpoint=dockDirection(r,to))return endpoint;
 const auto dx=to.x-from.x,dy=to.y-from.y;double entry=0,exit=1;
 const double axes[][2]={{-dx,from.x-r.left},{dx,r.right-from.x},{-dy,from.y-r.top},{dy,r.bottom-from.y}};
 for(const auto& axis:axes){if(axis[0]==0){if(axis[1]<0)return {};continue;}const auto t=axis[1]/axis[0];if(axis[0]>0)exit=std::min(exit,t);else entry=std::max(entry,t);if(entry>exit)return {};}
 if(entry<0||entry>1)return {};const auto t=std::min(1.,entry+.000001);return dockDirection(r,{from.x+dx*t,from.y+dy*t});
}
inline Rect dropRect(Rect r,Direction direction){switch(direction){case Direction::Left:r.right=r.left+r.width/2;r.width/=2;break;case Direction::Right:r.left+=r.width/2;r.width/=2;break;case Direction::Top:r.bottom=r.top+r.height/2;r.height/=2;break;case Direction::Bottom:r.top+=r.height/2;r.height/=2;break;}return r;}
inline double previewBand(double span){return std::max(18.,std::min(56.,std::isfinite(span)?span*.05:18.));}
inline Rect previewRect(const Rect& r,Direction direction){
 auto result=r;if(direction==Direction::Left||direction==Direction::Right){result.width=previewBand(r.width);if(direction==Direction::Right)result.left=r.left+r.width-result.width;result.right=result.left+result.width;}
 else{result.height=previewBand(r.height);if(direction==Direction::Bottom)result.top=r.top+r.height-result.height;result.bottom=result.top+result.height;}return result;
}
// EditorCanvasHost.tsx grid tracks: the divider occupies six logical
// pixels and the ratio divides only the remaining space. Physical conversion
// is performed at the host boundary so nested panes share identical edges.
struct Region {Layout node;Rect bounds;};
struct Regions {std::vector<Region> leaves,dividers;};
inline Rect rectangle(double x,double y,double width,double height){width=std::max(0.,width);height=std::max(0.,height);return {x,y,x+width,y+height,width,height};}
inline void collectRegions(const Layout& node,const Rect& bounds,double divider,Regions& out){
 if(!node)return;if(node->leaf){out.leaves.push_back({node,bounds});return;}
 const bool horizontal=node->orientation==Orientation::Horizontal;
 const double span=horizontal?bounds.width:bounds.height,bar=std::min(std::max(0.,divider),span),usable=std::max(0.,span-bar),first=usable*node->ratio,second=usable-first;
 const auto a=horizontal?rectangle(bounds.left,bounds.top,first,bounds.height):rectangle(bounds.left,bounds.top,bounds.width,first);
 const auto b=horizontal?rectangle(a.right+bar,bounds.top,second,bounds.height):rectangle(bounds.left,a.bottom+bar,bounds.width,second);
 const auto gap=horizontal?rectangle(a.right,bounds.top,bar,bounds.height):rectangle(bounds.left,a.bottom,bounds.width,bar);
 out.dividers.push_back({node,gap});collectRegions(node->first,a,divider,out);collectRegions(node->second,b,divider,out);
}
inline Regions regions(const Layout& node,const Rect& bounds,double divider=6){Regions out;collectRegions(node,bounds,divider,out);return out;}
// DOM hit testing uses closed edges; the host traverses leaves in layout order.
inline const Region* regionAt(const std::vector<Region>& entries,Point point){for(const auto& entry:entries)if(entry.bounds.width>0&&entry.bounds.height>0&&inside(point,entry.bounds))return &entry;return nullptr;}
// document-pane-hit-test.ts. Native widget picking supplies the direct pane;
// cached drag targets intentionally bypass proximity and path fallback.
struct DockTarget {std::string pane;Rect bounds;};
struct DockHit {std::optional<DockTarget> target;std::optional<Direction> direction;};
struct DockOptions {
 std::string exclude,direct;
 double outerSlop=18;
 bool strict=false;
 std::optional<DockTarget> current;
 std::optional<Point> previous;
 std::optional<std::vector<DockTarget>> captured;
};
inline double paneDistance(const Rect& r,Point p){return std::max(std::max({r.left-p.x,0.,p.x-r.right}),std::max({r.top-p.y,0.,p.y-r.bottom}));}
inline DockHit dockTargetAt(const std::vector<DockTarget>& targets,Point p,const DockOptions& options={}){
 auto hit=[&](const DockTarget& target,bool path){auto d=dockDirection(target.bounds,p);if(!d&&path&&options.previous)d=dockAlongPath(target.bounds,*options.previous,p);return DockHit{target,d};};
 if(options.captured){
  if(options.current&&inside(p,options.current->bounds))return hit(*options.current,false);
  for(const auto& target:*options.captured)if((!options.current||target.pane!=options.current->pane)&&inside(p,target.bounds))return hit(target,false);
  return {};
 }
 if(options.current&&inside(p,options.current->bounds))return hit(*options.current,false);
 std::optional<DockTarget> candidate;
 for(const auto& target:targets)if(target.pane!=options.exclude&&target.pane==options.direct&&inside(p,target.bounds)){candidate=target;break;}
 if(!candidate&&options.strict){for(const auto& target:targets)if(target.pane!=options.exclude&&inside(p,target.bounds)){candidate=target;break;}}
 if(!candidate&&!options.strict){double distance=options.outerSlop;for(const auto& target:targets)if(target.pane!=options.exclude){const auto next=paneDistance(target.bounds,p);if(next<=distance){candidate=target;distance=next;}}}
 if(!candidate&&!options.strict&&options.previous){double distance=std::numeric_limits<double>::infinity();for(const auto& target:targets)if(target.pane!=options.exclude&&dockAlongPath(target.bounds,*options.previous,p)){const auto next=paneDistance(target.bounds,p);if(next<distance){candidate=target;distance=next;}}}
 return candidate?hit(*candidate,!options.strict):DockHit{};
}
// document-pane-dock-resize.ts: keep the far track at its captured size
// during outer dock movement. The UI supplies measured logical track sizes
// at finish; the original immutable layout remains authoritative until then.
struct TrackMeasurement {std::string split;double first=0,second=0;};
inline Layout applyDockMeasurements(const Layout& node,const std::vector<TrackMeasurement>& measurements){
 if(!node||node->leaf)return node;
 const auto first=applyDockMeasurements(node->first,measurements),second=applyDockMeasurements(node->second,measurements);
 double ratio=node->ratio;
 for(const auto& measured:measurements)if(measured.split==node->id&&measured.first+measured.second>0){ratio=clampRatio(measured.first/(measured.first+measured.second));break;}
 if(first==node->first&&second==node->second&&std::abs(ratio-node->ratio)<1e-9)return node;
 auto copy=*node;copy.first=first;copy.second=second;copy.ratio=ratio;return std::make_shared<const Node>(std::move(copy));
}
struct DockResizeGesture {
 Layout before;Direction edge;bool finished=false;
 DockResizeGesture(Layout initial,Direction side):before(std::move(initial)),edge(side){}
 bool matches(Orientation orientation)const{return orientation==(edge==Direction::Bottom?Orientation::Vertical:Orientation::Horizontal);}
 double fixedTrack(double captured,double span,double divider=6)const{
  // CSS clamp(10%, captured, calc(90% - 6px)) gives the minimum
  // precedence when the viewport is smaller than the divider budget.
  return std::max(span*.1,std::min(captured,span*.9-divider));
 }
 Layout finish(bool cancelled,const std::vector<TrackMeasurement>& measured){
  if(finished)return before;finished=true;if(cancelled||!before||before->leaf)return before;
  std::vector<TrackMeasurement> relevant;
  const auto visit=[&](const auto& self,const Layout& node)->void{if(!node||node->leaf)return;if(matches(node->orientation))for(const auto& value:measured)if(value.split==node->id){relevant.push_back(value);break;}self(self,node->first);self(self,node->second);};
  visit(visit,before);return applyDockMeasurements(before,relevant);
 }
};
// beginDocumentPaneResize: coalescing is owned by the UI frame scheduler.
// This value object holds preview state; cancellation never publishes layout.
struct ResizeGesture {
 double startRatio=.5,span=0;Point start;Orientation orientation=Orientation::Horizontal;
 double ratio=.5;bool finished=false;
 ResizeGesture(Orientation axis,double initial,Point point,double available):startRatio(initial),span(available),start(point),orientation(axis),ratio(initial){}
 void move(Point point){if(finished||span<=0)return;ratio=clampRatio(startRatio+(orientation==Orientation::Horizontal?point.x-start.x:point.y-start.y)/span);}
 std::optional<double> finish(bool cancelled){if(finished)return {};finished=true;return cancelled||ratio==startRatio?std::optional<double>{}:ratio;}
};
}
