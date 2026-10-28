#pragma once
#include "selection_tools.h"
#include <array>
#include <set>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <functional>
#include <optional>
#include <unordered_map>
#include <unordered_set>
#include <vector>
namespace moon {
struct SmoothBrushArea {
 std::vector<std::size_t> visited;std::unordered_set<std::size_t> membership;std::set<std::pair<int,int>> outsidePreview;
 void collect(int width,int height,SelectionPoint from,SelectionPoint to,BrushOptions brush,int angle,const std::optional<SelectionMask>& selection,bool outside=false){
  brush.size=std::clamp(brush.size,1,64);const auto footprint=selectionBrushFootprint(brush,angle);const int ax=footprint.width/2,ay=footprint.height/2;
  auto stamp=[&](SelectionPoint c){for(auto row:footprint.spans){const int y=c.y-ay+row.y;if(!outside&&(y<0||y>=height))continue;const int left=c.x-ax+row.left,right=c.x-ax+row.right;for(int x=outside?left:std::max(0,left);x<=(outside?right:std::min(width-1,right));++x){if(x<0||y<0||x>=width||y>=height){outsidePreview.insert({x,y});continue;}const auto key=std::size_t(y)*width+x;if((!selection||selectionContains(selection,x,y))&&membership.insert(key).second)visited.push_back(key);}}};
  if(brush.shape==BrushShape::Line&&brush.size>1&&std::abs(angle%180)>=.0001){for(auto p:selectionContinuousLine(from,to,true))stamp(p);return;}
  const double radius=std::max(.5,std::min(64.0,brush.size/2.0)),step=brush.shape==BrushShape::Line?1:std::max(1.0,radius/4);const int n=std::max(1,int(std::ceil(std::hypot(double(to.x)-from.x,double(to.y)-from.y)/step)));for(int i=0;i<=n;++i)stamp({int(std::floor(from.x+(double(to.x)-from.x)*i/n+.5)),int(std::floor(from.y+(double(to.y)-from.y)*i/n+.5))});
 }
};
// Direct port of legacy core/smooth-brush.ts applySmoothBrush. Read is the immutable
// stroke-start RGBA source in world coordinates. Keep insertion order for JS Map/Set ties.
template<class Read> std::unordered_map<std::size_t,std::uint32_t> smoothBrushPixels(int width,int height,const std::vector<std::size_t>& visited,const std::optional<SelectionMask>& selection,int strength,Read read,std::function<bool(int,int)> stored={}){
 using Color=std::uint32_t;const double amount=std::clamp(strength,0,100);std::unordered_map<std::size_t,Color> working;if(amount==0)return working;
 static constexpr int dx[8]={0,1,1,1,0,-1,-1,-1},dy[8]={-1,-1,0,1,1,1,0,-1};
 const int passes=1+int(std::ceil(std::max(0.0,amount-50)/8));const double radius=1+3*std::max(0.0,amount-50)/50;struct Kernel{int x,y;double weight;};std::vector<Kernel> kernel;const int reach=int(std::ceil(radius));for(int y=-reach;y<=reach;++y)for(int x=-reach;x<=reach;++x){const double distance=(x*x+y*y)/((radius+.5)*(radius+.5));if(distance<1)kernel.push_back({x,y,(1-distance)*(1-distance)});}
 const std::unordered_set<std::size_t> included(visited.begin(),visited.end());auto allowed=[&](int x,int y){return x>=0&&y>=0&&x<width&&y<height;};auto writable=[&](int x,int y){return allowed(x,y)&&(!stored||stored(x,y));};
 auto source=[&](int x,int y)->Color{if(!allowed(x,y))return 0;const Color p=read(x,y);return (p>>24)==0?0:p;};
 auto original=[&](int x,int y)->Color{if(!allowed(x,y))return 0;auto it=working.find(std::size_t(y)*width+x);return it==working.end()?source(x,y):it->second;};
 auto touchesBody=[&](int x,int y){for(int sx:{-1,1})for(int sy:{-1,1})if(source(x+sx,y)&&source(x,y+sy)&&source(x+sx,y+sy))return true;return false;};
 std::unordered_set<std::size_t> spur;const int maxSpur=1+int(std::floor(amount/50));
 for(auto seed:visited){int x=int(seed%width),y=int(seed/width);if(!source(x,y))continue;int adjacent=0;for(int i=0;i<8;++i)if(source(x+dx[i],y+dy[i]))++adjacent;if(adjacent!=1)continue;std::vector<std::size_t> tail;std::int64_t previous=-1;
  for(int step=0;step<=maxSpur;++step){const auto key=std::size_t(y)*width+x;if(step>0&&touchesBody(x,y)){spur.insert(tail.begin(),tail.end());break;}if(step==maxSpur||!included.count(key)||(selection&&!selectionContains(selection,x,y)))break;tail.push_back(key);std::vector<SelectionPoint> forward;for(int i=0;i<8;++i){const int nx=x+dx[i],ny=y+dy[i];if(source(nx,ny)&&std::int64_t(ny)*width+nx!=previous)forward.push_back({nx,ny});}if(forward.size()>1&&std::all_of(forward.begin(),forward.end(),[&](auto p){return touchesBody(p.x,p.y);})){spur.insert(tail.begin(),tail.end());break;}if(forward.size()!=1)break;previous=std::int64_t(key);x=forward[0].x;y=forward[0].y;}
 }
 struct Candidate{Color next;double priority;};
 auto contour=[&](int x,int y)->std::optional<Candidate>{const auto current=original(x,y);if(spur.count(std::size_t(y)*width+x))return current?std::optional<Candidate>{{0,8}}:std::nullopt;std::array<Color,8> ring;int own=0,cardinals=0;for(int i=0;i<8;++i){ring[i]=original(x+dx[i],y+dy[i]);if(ring[i]==current){++own;if(i%2==0)++cardinals;}}if(own==8||own==1)return {};bool continuous=false;for(int i=0;i<4;++i)continuous=continuous||(ring[i]==current&&ring[i+4]==current);if(continuous&&cardinals<=2)return {};std::unordered_map<Color,double> support;for(auto k:kernel)support[original(x+k.x,y+k.y)]+=k.weight;Color next=current;double best=support[current];std::unordered_set<Color> seen;for(auto c:ring)if(seen.insert(c).second){const double score=support[c];if(score>best+1e-6){next=c;best=score;}}if(next==current)return {};return Candidate{next,best-support[current]};};
 struct Pending{std::size_t index;int x,y;Color next;double priority;};
 for(int pass=0;pass<passes;++pass){std::vector<Pending> pending;for(auto key:visited){const int x=int(key%width),y=int(key/width);if(!writable(x,y)||(selection&&!selectionContains(selection,x,y)))continue;if(pass==0&&spur.count(key)){pending.push_back({key,x,y,0,8});continue;}if(pass>0){if(auto c=contour(x,y))pending.push_back({key,x,y,c->next,c->priority});continue;}
   const auto current=original(x,y);std::array<Color,8> ring;std::vector<std::pair<Color,int>> counts;int cardinals=0;for(int i=0;i<8;++i){ring[i]=original(x+dx[i],y+dy[i]);if(i%2==0&&ring[i]==current)++cardinals;auto it=std::find_if(counts.begin(),counts.end(),[&](auto p){return p.first==ring[i];});if(it==counts.end())counts.push_back({ring[i],1});else ++it->second;}auto count=[&](Color c){for(auto entry:counts)if(entry.first==c)return entry.second;return 0;};bool continuous=false;for(int i=0;i<4;++i)continuous=continuous||(ring[i]==current&&ring[i+4]==current);Color next=current;
   for(auto entry:counts){const auto color=entry.first;const int n=entry.second;if(color==current)continue;const bool isolated=count(current)==0,nub=cardinals<=1&&count(current)>=2&&!continuous;if(n>=5&&(isolated||nub)){next=color;break;}bool bridge=false;for(int i=0;i<4;++i)if(ring[i]==color&&ring[i+4]==color&&original(x+2*dx[i],y+2*dy[i])==color&&original(x-2*dx[i],y-2*dy[i])==color)bridge=true;if(current==0&&color!=0&&bridge&&n<=3){next=color;break;}}
   if(next!=current)pending.push_back({key,x,y,next,double(count(next)-count(current))});
  }
  if(pending.empty()){if(pass==0&&passes>1)continue;break;}auto higher=[](const Pending& a,const Pending& b){return a.priority!=b.priority?a.priority>b.priority:a.index<b.index;};
  if(pass>0){std::sort(pending.begin(),pending.end(),higher);int applied=0;for(auto p:pending)if(auto c=contour(p.x,p.y)){working[p.index]=c->next;++applied;}if(!applied)break;continue;}
  const auto count=std::size_t(std::ceil(pending.size()*std::min(1.0,amount/50)));if(count<pending.size())std::sort(pending.begin(),pending.end(),higher);for(std::size_t i=0;i<count;++i)working[pending[i].index]=pending[i].next;
 }
 const int maxArea=1+int(std::floor(11*(amount/100)*(amount/100))),maxSpan=1+int(std::floor(3*amount/100));std::unordered_set<std::size_t> inspected;
 for(auto seed:visited){if(inspected.count(seed))continue;const int sx=int(seed%width),sy=int(seed/width);const bool filled=source(sx,sy)!=0;std::vector<std::size_t> region{seed},queue{seed};std::unordered_set<std::size_t> regionSet{seed};std::vector<std::pair<Color,int>> boundary;bool valid=true;int left=sx,right=sx,top=sy,bottom=sy;
  while(!queue.empty()&&valid){const auto key=queue.back();queue.pop_back();const int x=int(key%width),y=int(key/width);if(!included.count(key)||(selection&&!selectionContains(selection,x,y))||!writable(x,y)){valid=false;break;}left=std::min(left,x);right=std::max(right,x);top=std::min(top,y);bottom=std::max(bottom,y);if(right-left+1>maxSpan||bottom-top+1>maxSpan){valid=false;break;}
   for(int i=0;i<8;++i){const int nx=x+dx[i],ny=y+dy[i];if(!allowed(nx,ny)){valid=false;break;}const auto value=source(nx,ny);if((value!=0)!=filled){auto it=std::find_if(boundary.begin(),boundary.end(),[&](auto p){return p.first==value;});if(it==boundary.end())boundary.push_back({value,1});else ++it->second;continue;}const auto neighbor=std::size_t(ny)*width+nx;if(regionSet.count(neighbor))continue;if(inspected.count(neighbor)){valid=false;break;}regionSet.insert(neighbor);region.push_back(neighbor);if(int(region.size())>maxArea){valid=false;break;}queue.push_back(neighbor);}
  }
  inspected.insert(region.begin(),region.end());if(!valid||boundary.empty()||(region.size()==1&&amount<50))continue;Color next=0;if(!filled){std::sort(boundary.begin(),boundary.end(),[](auto a,auto b){return a.second!=b.second?a.second>b.second:a.first<b.first;});int total=0;for(auto p:boundary)total+=p.second;if(boundary[0].second<total*.75)continue;next=boundary[0].first;}for(auto key:region)working[key]=next;
 }
 return working;
}
}
