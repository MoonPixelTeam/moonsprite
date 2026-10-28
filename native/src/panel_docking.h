#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <istream>
#include <ostream>
#include <vector>

namespace moon::panels {
// Legacy panel-layout/floating-panel ports; tab grouping is user-requested.
inline constexpr int columnCount=13;
using Visibility=std::array<bool,columnCount>;
inline bool isPicker(int id){return id==1 || (id>=4&&id<=7);}
enum class Dock { Left,Right,Bottom,Floating };
struct Rect {int x=0,y=0,w=0,h=0;bool contains(int px,int py,int margin=0)const{return px>=x-margin&&py>=y-margin&&px<x+w+margin&&py<y+h+margin;}bool operator==(const Rect& r)const{return x==r.x&&y==r.y&&w==r.w&&h==r.h;}};
// legacy core/panel-preferences.ts remapFloatingCoordinate / resizeFloatingPosition.
// All native columns pass responsiveToViewport=true. Keep explicit dimensions;
// only position changes, including when a panel is larger than the viewport.
inline Rect resizeFloatingPosition(Rect position,Rect previous,Rect viewport){
 auto coordinate=[](int value,int size,int oldOrigin,int oldSize,int origin,int viewportSize){
  const int oldTravel=std::max(0,oldSize-size),travel=std::max(0,viewportSize-size);
  if(!travel)return origin;
  const double offset=oldTravel?std::clamp(double(value-oldOrigin)/oldTravel,0.0,1.0)*travel:std::clamp(value-oldOrigin,0,travel);
  return origin+int(std::floor(offset+.5));
 };
 position.x=coordinate(position.x,position.w,previous.x,previous.w,viewport.x,viewport.w);
 position.y=coordinate(position.y,position.h,previous.y,previous.h,viewport.y,viewport.h);
 return position;
}
struct Group {std::vector<int> tabs;int active=0;Dock dock=Dock::Left;double weight=1;int width=140;Rect floating{200,90,220,180};Rect floatingArea{};int fixedExtent=0;};
struct Geometry {std::array<Rect,columnCount> panel{};Visibility shown{};Rect canvas;};
struct Target {int group=-1;Dock dock=Dock::Floating;bool after=true,merge=false;Rect hit,preview;int tabIndex=-1;bool operator==(const Target& t)const{return group==t.group&&dock==t.dock&&after==t.after&&merge==t.merge&&tabIndex==t.tabIndex;}};
struct Model {
 bool resizeFloating(Rect previous,Rect viewport){
  if(viewport.w<=0 || viewport.h<=0 || previous==viewport)return false;
  bool changed=false;
  for(auto& g:groups)if(g.dock==Dock::Floating){
   auto base=g.floatingArea;if(base.w<=0 || base.h<=0)base=previous;
   if(base.w<=0 || base.h<=0)base=viewport;
   g.floating=resizeFloatingPosition(g.floating,base,viewport);g.floatingArea=viewport;changed=true;
  }return changed;
 }
 bool custom=false;int leftWidth=120,rightWidth=140,bottomHeight=109;double bottomShare=0;
 std::vector<Group> groups{{{0},0,Dock::Left,2,140},{{1},1,Dock::Left,3,140},{{2},2,Dock::Bottom,1,300},{{3},3,Dock::Floating,1,180,{280,90,180,150}},{{4},4,Dock::Left,3,140},{{5},5,Dock::Left,3,140},{{6},6,Dock::Left,3,140},{{7},7,Dock::Left,3,140},{{8},8,Dock::Right,220,160,{280,90,180,210}},{{9},9,Dock::Floating,1,280,{400,80,280,280}},{{10},10,Dock::Floating,1,260,{64,96,260,560}},{{11},11,Dock::Floating,1,220,{440,100,220,280}},{{12},12,Dock::Right,240,220,{360,96,220,280}}};
 int groupOf(int id)const{for(int i=0;i<int(groups.size());++i)if(std::find(groups[i].tabs.begin(),groups[i].tabs.end(),id)!=groups[i].tabs.end())return i;return -1;}
 bool shown(int id,const Visibility& visible)const{const int i=groupOf(id);if(i<0||!visible[id])return false;const auto& g=groups[i];if(visible[g.active])return g.active==id;for(int tab:g.tabs)if(visible[tab])return tab==id;return false;}
 void select(int id){const int i=groupOf(id);if(i>=0)groups[i].active=id;}
 void place(int id,Dock dock,int target=-1,bool after=true,bool merge=false,Rect floating={200,90,220,180},int tabIndex=-1){
  const int source=groupOf(id);if(source<0)return;
  if(target==source && merge){if(tabIndex<0)return;auto& tabs=groups[source].tabs;int old=int(std::find(tabs.begin(),tabs.end(),id)-tabs.begin());tabs.erase(tabs.begin()+old);if(tabIndex>old)--tabIndex;tabs.insert(tabs.begin()+std::clamp(tabIndex,0,int(tabs.size())),id);groups[source].active=id;custom=true;return;}if(target==source && groups[source].tabs.size()==1)return;custom=true;
  Group moving=groups[source];moving.tabs={id};moving.active=id;if(moving.dock!=dock)moving.fixedExtent=0;moving.dock=dock;moving.floating=floating;
  auto& tabs=groups[source].tabs;tabs.erase(std::find(tabs.begin(),tabs.end(),id));if(groups[source].active==id&&!tabs.empty())groups[source].active=tabs.front();
  if(tabs.empty()){groups.erase(groups.begin()+source);if(target>source)--target;}
  if(target>=0&&target<int(groups.size())&&merge){auto& destination=groups[target].tabs;destination.insert(destination.begin()+(tabIndex<0?int(destination.size()):std::clamp(tabIndex,0,int(destination.size()))),id);groups[target].active=id;}
  else{const int index=target>=0&&target<int(groups.size())?target+(after?1:0):int(groups.size());groups.insert(groups.begin()+index,moving);}
 }
 void placeGroup(int id,Dock dock,int target=-1,bool after=true,bool merge=false,Rect floating={200,90,220,180},int tabIndex=-1){
  const int source=groupOf(id);if(source<0||source==target)return;custom=true;auto moving=groups[source];if(moving.dock!=dock)moving.fixedExtent=0;moving.dock=dock;moving.floating=floating;groups.erase(groups.begin()+source);if(target>source)--target;
  if(target>=0&&target<int(groups.size())&&merge){auto& destination=groups[target].tabs;destination.insert(destination.begin()+(tabIndex<0?int(destination.size()):std::clamp(tabIndex,0,int(destination.size()))),moving.tabs.begin(),moving.tabs.end());groups[target].active=moving.active;}
  else{const int index=target>=0&&target<int(groups.size())?target+(after?1:0):int(groups.size());groups.insert(groups.begin()+index,moving);}
 }
 Geometry layout(Rect area,const Visibility& visible,int gap=2,Rect floatingViewport={})const{
  if(floatingViewport.w<=0 || floatingViewport.h<=0)floatingViewport=area;
  Geometry result;std::vector<int> left,right,bottom,floating;
  for(int i=0;i<int(groups.size());++i){bool any=false;for(int tab:groups[i].tabs){result.shown[tab]=shown(tab,visible);any|=visible[tab];}if(!any)continue;(groups[i].dock==Dock::Left?left:groups[i].dock==Dock::Right?right:groups[i].dock==Dock::Bottom?bottom:floating).push_back(i);}
  auto sideMinimum=[&](const std::vector<int>& ids){for(int i:ids)for(int tab:groups[i].tabs)if(tab==2&&result.shown[tab])return 180;return 116;};
  const int lm=sideMinimum(left),rm=sideMinimum(right);
  int lw=left.empty()?0:std::clamp(leftWidth,lm,std::max(lm,(area.w-160)/2)),rw=right.empty()?0:std::clamp(rightWidth,rm,std::max(rm,area.w-lw-160));
  // Minimums are preferences. In a small client, fit side columns without
  // overlapping the canvas or moving the right column outside the viewport.
  const int sideBudget=std::max(0,area.w-std::min(80,area.w)-gap*int(!left.empty())-gap*int(!right.empty()));
  if(lw+rw>sideBudget){const int total=lw+rw;lw=int(double(lw)*sideBudget/std::max(1,total));rw=sideBudget-lw;}
  const int centerX=area.x+(lw?lw+gap:0),centerW=std::max(1,area.w-(lw?lw+gap:0)-(rw?rw+gap:0));
  const int bh=bottom.empty()?0:std::min(std::max(0,area.h-std::min(60,area.h)-gap),std::clamp(bottomShare>0?int(area.h*bottomShare):bottomHeight,70,std::max(70,area.h-100)));
  result.canvas={centerX,area.y,centerW,std::max(1,area.h-(bh?bh+gap:0))};
  auto assign=[&](int group,Rect r){for(int id:groups[group].tabs)result.panel[id]=r;};
  auto vertical=[&](const std::vector<int>& ids,int x,int w){double total=0;for(int i:ids)total+=groups[i].weight;int y=area.y;const int available=area.h-gap*std::max(0,int(ids.size())-1);double cumulative=0;for(int n=0;n<int(ids.size());++n){cumulative+=groups[ids[n]].weight;const int end=area.y+int(std::round(available*cumulative/total))+n*gap;if(ids.size()==1&&groups[ids[n]].fixedExtent>0){int h=std::min(available,groups[ids[n]].fixedExtent);assign(ids[n],{x,area.y+available-h,w,std::max(1,h)});}else assign(ids[n],{x,y,w,std::max(1,end-y)});y=end+gap;}};
  vertical(left,area.x,lw);vertical(right,area.x+area.w-rw,rw);
  int main=-1;for(int i:bottom)if(std::find(groups[i].tabs.begin(),groups[i].tabs.end(),2)!=groups[i].tabs.end())main=i;if(main<0&&!bottom.empty())main=bottom.front();
  int reserved=0;for(int i:bottom)if(i!=main)reserved+=groups[i].width;const int available=centerW-gap*std::max(0,int(bottom.size())-1);const int mainMin=main>=0 && std::find(groups[main].tabs.begin(),groups[main].tabs.end(),2)!=groups[main].tabs.end()?180:116;const double factor=reserved>available-mainMin?double(std::max(0,available-mainMin))/std::max(1,reserved):1;
  int x=centerX;for(int i:bottom){const int w=i==main?std::max(1,available-int(reserved*factor)):std::max(1,int(groups[i].width*factor));if(bottom.size()==1&&groups[i].fixedExtent>0){int extent=std::min(w,groups[i].fixedExtent);assign(i,{x+w-extent,area.y+area.h-bh,extent,bh});}else assign(i,{x,area.y+area.h-bh,w,bh});x+=w+gap;}
  for(int i:floating){auto base=groups[i].floatingArea;if(base.w<=0 || base.h<=0)base=floatingViewport;
   assign(i,resizeFloatingPosition(groups[i].floating,base,floatingViewport));}

  return result;
 }
 Target targetAt(int x,int y,int moving,const Geometry& geometry,Rect area,const Target* current=nullptr)const{
  const int own=groupOf(moving);
  // Header merge is explicit, including floating groups; existing docks use insertion lines.
  for(int i=int(groups.size())-1;i>=0;--i){if(i==own&&groups[i].tabs.size()==1)continue;int active=-1;for(int tab:groups[i].tabs)if(geometry.shown[tab])active=tab;if(active<0)continue;auto r=geometry.panel[active];Rect header{r.x,r.y,std::max(1,r.w),16};if(header.contains(x,y))return {i,groups[i].dock,true,true,header,header};}
  // Visible headers take priority over edge hysteresis.
  if(current&&!current->merge&&current->dock!=Dock::Floating&&current->hit.contains(x,y,8))return *current;
  std::vector<Target> targets;std::array<bool,3> occupied{};
  for(int i=0;i<int(groups.size());++i){if(groups[i].dock==Dock::Floating)continue;int active=-1;for(int tab:groups[i].tabs)if(geometry.shown[tab])active=tab;if(active<0)continue;occupied[int(groups[i].dock)]=true;if(i==own && groups[i].tabs.size()==1)continue;const auto r=geometry.panel[active];const bool horizontal=groups[i].dock==Dock::Bottom;const int reach=std::min(160,int((horizontal?r.w:r.h)*.4));for(bool after:{false,true}){const int edge=horizontal?(after?r.x+r.w:r.x):(after?r.y+r.h:r.y),start=edge-(after?reach:16);Rect hit=horizontal?Rect{start,r.y,reach+16,r.h}:Rect{r.x,start,r.w,reach+16};Rect preview=horizontal?Rect{after?r.x+r.w/2:r.x,r.y,r.w/2,r.h}:Rect{r.x,after?r.y+r.h/2:r.y,r.w,r.h/2};if(hit.contains(x,y))targets.push_back({i,groups[i].dock,after,false,hit,preview});}}
  for(int dock=0;dock<3;++dock)if(!occupied[dock]){Rect r=dock==2?Rect{area.x,area.y+area.h-24,area.w,24}:Rect{dock==0?area.x:area.x+area.w-24,area.y,24,area.h};if(r.contains(x,y))targets.push_back({-1,Dock(dock),true,false,r,r});}
  if(targets.empty())return {};
  auto distance=[&](const Target& t){auto r=t.hit;return r.w<r.h?std::abs(x-(r.x+r.w/2.0))/std::max(1,r.w):std::abs(y-(r.y+r.h/2.0))/std::max(1,r.h);};return *std::min_element(targets.begin(),targets.end(),[&](const auto& a,const auto& b){return distance(a)<distance(b);});
 }
 void write(std::ostream& out)const{out<<"panels-v4 "<<custom<<' '<<leftWidth<<' '<<rightWidth<<' '<<bottomHeight<<' '<<bottomShare<<' '<<groups.size()<<'\n';for(const auto& g:groups){out<<int(g.dock)<<' '<<g.active<<' '<<g.weight<<' '<<g.width<<' '<<g.floating.x<<' '<<g.floating.y<<' '<<g.floating.w<<' '<<g.floating.h<<' '<<g.tabs.size();for(int tab:g.tabs)out<<' '<<tab;out<<' '<<g.floatingArea.x<<' '<<g.floatingArea.y<<' '<<g.floatingArea.w<<' '<<g.floatingArea.h<<' '<<g.fixedExtent;out<<'\n';}}
 bool read(std::istream& in){Model candidate;std::string version;int count;if(!(in>>version>>candidate.custom>>candidate.leftWidth>>candidate.rightWidth>>candidate.bottomHeight>>candidate.bottomShare>>count)||(version!="panels-v1"&&version!="panels-v2"&&version!="panels-v3"&&version!="panels-v4")||count<1||count>columnCount||candidate.leftWidth<96||candidate.leftWidth>4096||candidate.rightWidth<96||candidate.rightWidth>4096||candidate.bottomHeight<65||candidate.bottomHeight>4096||!std::isfinite(candidate.bottomShare)||candidate.bottomShare<0||candidate.bottomShare>1)return false;candidate.groups.clear();Visibility seen{};for(int i=0;i<count;++i){Group g;int dock,n;if(!(in>>dock>>g.active>>g.weight>>g.width>>g.floating.x>>g.floating.y>>g.floating.w>>g.floating.h>>n)||dock<0||dock>3||n<1||n>columnCount||!std::isfinite(g.weight)||g.weight<=0||g.weight>8192||g.width<50||g.width>4096||g.floating.w<1||g.floating.w>4096||g.floating.h<1||g.floating.h>4096||std::abs(double(g.floating.x))>16384||std::abs(double(g.floating.y))>16384)return false;g.dock=Dock(dock);g.tabs.clear();for(int j=0;j<n;++j){int tab;if(!(in>>tab)||tab<0||tab>=columnCount||seen[tab])return false;seen[tab]=true;g.tabs.push_back(tab);}if(std::find(g.tabs.begin(),g.tabs.end(),g.active)==g.tabs.end())return false;if((version=="panels-v2"||version=="panels-v3"||version=="panels-v4") && (!(in>>g.floatingArea.x>>g.floatingArea.y>>g.floatingArea.w>>g.floatingArea.h)||g.floatingArea.w<0||g.floatingArea.w>8192||g.floatingArea.h<0||g.floatingArea.h>8192))return false;if((version=="panels-v3"||version=="panels-v4")&&(!(in>>g.fixedExtent)||g.fixedExtent<0||g.fixedExtent>4096))return false;candidate.groups.push_back(g);}if(version!="panels-v4"){for(int id=0;id<4;++id)if(!seen[id])return false;for(int id=4;id<columnCount;++id){Group g;g.tabs={id};g.active=id;candidate.groups.push_back(g);}}else {for(int id=0;id<8;++id)if(!seen[id])return false;for(int id=8;id<columnCount;++id)if(!seen[id]){Group g;g.tabs={id};g.active=id;g.dock=Dock::Floating;candidate.groups.push_back(g);}}if(!seen[8]){auto& history=candidate.groups[candidate.groupOf(8)];history.dock=Dock::Right;history.weight=220;history.width=160;history.floating={280,90,180,210};}if(!seen[10]){auto& tablet=candidate.groups[candidate.groupOf(10)];tablet.dock=Dock::Floating;tablet.width=260;tablet.floating={64,96,260,560};}if(!seen[11]){auto& tiles=candidate.groups[candidate.groupOf(11)];tiles.dock=Dock::Floating;tiles.width=220;tiles.floating={440,100,220,280};}if(!seen[12]){auto& brushes=candidate.groups[candidate.groupOf(12)];brushes.dock=Dock::Right;brushes.weight=240;brushes.width=220;brushes.floating={360,96,220,280};}*this=std::move(candidate);return true;}
};
}
