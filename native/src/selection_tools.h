#pragma once
/* Smart gap closure adapted from legacy contiguous-region.ts.
OpenToonz

All contributions by DWANGO:
Copyright (c) 2016 - 2026, DWANGO Co., Ltd.
All rights reserved.

All other contributions:
Copyright (c) 2016 - 2026, the respective contributors.
All rights reserved.

Each contributor holds copyright over their respective contributions.
The project versioning (Git) records all such contribution source information.

BSD 3-Clause "New" or "Revised" License

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
*/
#include "selection_model.h"
#include <map>
#include <set>
#include <functional>
#include <limits>
#include <unordered_set>
namespace moon {
struct SelectionPoint {int x=0,y=0;};
struct SelectionBrushFootprint {int width=1,height=1;std::vector<BrushSpan> spans;};
// Legacy continuousLinePoints and its line-brush intermediate bridge variant.
inline std::vector<SelectionPoint> selectionContinuousLine(SelectionPoint from,SelectionPoint to,bool bridge=false){std::vector<SelectionPoint> points;const int dx=std::abs(to.x-from.x),sx=from.x<to.x?1:-1,dy=-std::abs(to.y-from.y),sy=from.y<to.y?1:-1;int error=dx+dy;for(;;){bool changed=false;points.push_back(from);const int doubled=2*error;if(doubled>=dy){if(from.x==to.x)break;error+=dy;from.x+=sx;changed=true;}if(doubled<=dx){if(from.y==to.y)break;error+=dx;if(bridge && changed)points.push_back(from);from.y+=sy;}}return points;}
inline SelectionBrushFootprint selectionBrushFootprint(BrushOptions brush,int angle=0){
 brush.size=std::clamp(brush.size,1,64);if(brush.size==1 || brush.shape==BrushShape::Round)angle=0;
 // Same 16-key row-span cache used by legacy solidBrushPreviewRowSpans.
 struct Cached{int size,angle;BrushShape shape;SelectionBrushFootprint footprint;};static thread_local std::vector<Cached> cache;
 for(const auto& c:cache)if(c.size==brush.size && c.angle==angle && c.shape==brush.shape)return c.footprint;
 SelectionBrushFootprint out{brush.size,brush.size,{}};const double radians=angle*3.141592653589793/180,cosine=std::cos(radians),sine=std::sin(radians);
 if(!angle)out.spans=brushSpans(brush);
 else if(brush.shape==BrushShape::Square){out.width=out.height=std::max(1,int(std::ceil(brush.size*(std::abs(cosine)+std::abs(sine))-1e-9)));const double center=(out.width-1)/2.0,sourceCenter=(brush.size-1)/2.0;for(int y=0;y<out.height;++y){BrushSpan span{y,out.width,-1};for(int x=0;x<out.width;++x){const int sx=int(std::floor(cosine*(x-center)+sine*(y-center)+sourceCenter+.5)),sy=int(std::floor(-sine*(x-center)+cosine*(y-center)+sourceCenter+.5));if(sx>=0 && sy>=0 && sx<brush.size && sy<brush.size){span.left=std::min(span.left,x);span.right=x;}}out.spans.push_back(span);}}
 else {const int center=brush.size/2,dx=int(std::trunc(brush.size/2.0*cosine)),dy=int(std::trunc(-brush.size/2.0*sine));auto line=selectionContinuousLine({center-dx,center-dy},{center,center});auto second=selectionContinuousLine({center,center},{center+dx,center+dy});line.insert(line.end(),second.begin(),second.end());out.spans.resize(brush.size);for(int y=0;y<brush.size;++y)out.spans[y]={y,brush.size,-1};for(auto p:line)if(p.x>=0 && p.y>=0 && p.x<brush.size && p.y<brush.size){out.spans[p.y].left=std::min(out.spans[p.y].left,p.x);out.spans[p.y].right=std::max(out.spans[p.y].right,p.x);}}
 if(cache.size()>=16)cache.erase(cache.begin());cache.push_back({brush.size,angle,brush.shape,out});return out;
}
struct SelectionBrushStroke {
 std::unordered_set<std::size_t> visited;
 std::set<std::pair<int,int>> outsidePreview;
 // Direct collectSmoothBrushArea port: no selection clipping or opacity.
 void collect(int width,int height,SelectionPoint from,SelectionPoint to,BrushOptions brush,int angle=0){
  brush.size=std::clamp(brush.size,1,64);const auto footprint=selectionBrushFootprint(brush,angle);const int ax=footprint.width/2,ay=footprint.height/2;
  auto stamp=[&](SelectionPoint center){for(auto span:footprint.spans)for(int x=center.x-ax+span.left;x<=center.x-ax+span.right;++x){const int y=center.y-ay+span.y;if(x<0 || y<0 || x>=width || y>=height)outsidePreview.emplace(x,y);else visited.insert(std::size_t(y)*width+x);}};
  if(brush.shape==BrushShape::Line && brush.size>1 && std::abs(angle%180)>=.0001){for(auto p:selectionContinuousLine(from,to,true))stamp(p);return;}
  const double radius=std::max(.5,std::min(64.0,brush.size/2.0)),maxStep=brush.shape==BrushShape::Line?1:std::max(1.0,radius/4);const int steps=std::max(1,int(std::ceil(std::hypot(double(to.x)-from.x,double(to.y)-from.y)/maxStep)));for(int step=0;step<=steps;++step)stamp({int(std::floor(from.x+(double(to.x)-from.x)*step/steps+.5)),int(std::floor(from.y+(double(to.y)-from.y)*step/steps+.5))});
 }
 std::optional<SelectionMask> mask(int width) const {if(visited.empty())return {};int left=std::numeric_limits<int>::max(),top=left,right=-1,bottom=-1;for(auto key:visited){const int x=int(key%width),y=int(key/width);left=std::min(left,x);right=std::max(right,x);top=std::min(top,y);bottom=std::max(bottom,y);}SelectionMask out{left,top,right-left+1,bottom-top+1,{}};out.mask.resize(std::size_t(out.width)*out.height);for(auto key:visited)out.mask[(key/width-top)*out.width+key%width-left]=1;return out;}
};
// Integer line tie rules and balanced stairs from legacy selection.ts/pixel-line.ts.
inline std::vector<SelectionPoint> selectionLine(SelectionPoint a,SelectionPoint b,bool balanced=false){
 std::vector<SelectionPoint> out;const int dx=std::abs(b.x-a.x),dy=std::abs(b.y-a.y);
 if(balanced){const bool major=dx>=dy,reverse=major?a.x>b.x:a.y>b.y;const auto start=reverse?b:a,end=reverse?a:b;const int length=(major?dx:dy)+1,stairs=(major?dy:dx)+1,direction=(major?end.y>=start.y:end.x>=start.x)?1:-1;int offset=0;for(int step=0;step<stairs;++step)while(offset<(step+1)*length/stairs){out.push_back(major?SelectionPoint{start.x+offset,start.y+step*direction}:SelectionPoint{start.x+step*direction,start.y+offset});++offset;}if(reverse)std::reverse(out.begin(),out.end());return out;}
 const int sx=a.x<b.x?1:-1,sy=a.y<b.y?1:-1;int error=dx-dy;for(;;){out.push_back(a);if(a.x==b.x && a.y==b.y)break;const int doubled=error*2;if(doubled>-dy){error-=dy;a.x+=sx;}if(doubled<dx){error+=dx;a.y+=sy;}}return out;
}
inline std::optional<SelectionMask> ellipseSelection(int x,int y,int w,int h,int cw,int ch){
 w=std::max(1,w);h=std::max(1,h);auto result=rectangleSelection(x,y,w,h,cw,ch);if(!result)return {};auto& s=*result;s.mask.resize(std::size_t(s.width)*s.height);const double cx=(w-1)/2.0,cy=(h-1)/2.0,rx=std::max(.5,w/2.0),ry=std::max(.5,h/2.0);for(int row=0;row<s.height;++row)for(int col=0;col<s.width;++col){const double dx=(s.x+col-x-cx)/rx,dy=(s.y+row-y-cy)/ry;s.mask[row*s.width+col]=dx*dx+dy*dy<=1;}return trimSelection(std::move(s));
}
// Active-edge scanline preserves closed integer edges; polygon adds raster boundary.
inline std::optional<SelectionMask> lassoSelection(const std::vector<SelectionPoint>& path,int cw,int ch,bool polygon=false,bool balanced=false){
 if(path.empty())return {};int left=path[0].x,right=left,top=path[0].y,bottom=top;for(auto p:path){left=std::min(left,p.x);right=std::max(right,p.x);top=std::min(top,p.y);bottom=std::max(bottom,p.y);}auto result=rectangleSelection(left,top,right-left+1,bottom-top+1,cw,ch);if(!result)return {};auto& s=*result;s.mask.resize(std::size_t(s.width)*s.height);
 auto select=[&](int x,int y){if(x>=s.x && y>=s.y && x<s.x+s.width && y<s.y+s.height)s.mask[(y-s.y)*s.width+x-s.x]=1;};
 if(path.size()<3){for(auto p:selectionLine(path.front(),path.back()))select(p.x,p.y);return trimSelection(std::move(s));}
 struct Edge{int low,high;double x,slope;};std::map<int,std::vector<Edge>> starts;std::vector<Edge> active;
 for(std::size_t i=0;i<path.size();++i){auto a=path[i],b=path[(i+1)%path.size()];select(a.x,a.y);if(polygon)for(auto p:selectionLine(a,b,balanced))select(p.x,p.y);if(a.y==b.y){for(int x=std::max(s.x,std::min(a.x,b.x));x<=std::min(s.x+s.width-1,std::max(a.x,b.x));++x)select(x,a.y);continue;}if(a.y>b.y)std::swap(a,b);Edge e{a.y,b.y,double(a.x),double(b.x-a.x)/(b.y-a.y)};if(e.low<s.y && e.high>s.y)active.push_back(e);else starts[e.low].push_back(e);}
 std::vector<double> intersections;for(int y=s.y;y<s.y+s.height;++y){const auto it=starts.find(y);if(it!=starts.end())active.insert(active.end(),it->second.begin(),it->second.end());active.erase(std::remove_if(active.begin(),active.end(),[&](auto e){return e.high<=y;}),active.end());intersections.clear();for(auto e:active){const double x=e.x+(y-e.low)*e.slope;intersections.push_back(x);const int rounded=int(std::floor(x+.5));if(std::abs(x-rounded)<1e-9)select(rounded,y);}std::sort(intersections.begin(),intersections.end());for(std::size_t i=0;i+1<intersections.size();i+=2)for(int x=std::max(s.x,int(std::floor(intersections[i]))+1);x<=std::min(s.x+s.width-1,int(std::ceil(intersections[i+1]))-1);++x)select(x,y);}
 return trimSelection(std::move(s));
}
namespace selection_detail {
using Mask=std::vector<unsigned char>;
template<class F> void neighbors8(int index,int w,int h,F f){const int x=index%w,y=index/w;for(int dy=-1;dy<=1;++dy)for(int dx=-1;dx<=1;++dx)if((dx || dy) && x+dx>=0 && y+dy>=0 && x+dx<w && y+dy<h)f((y+dy)*w+x+dx);}
inline int transitions(int i,int w,const Mask& m){const int v[]{i-w,i-w+1,i+1,i+w+1,i+w,i+w-1,i-1,i-w-1};int count=0;for(int n=0;n<8;++n)count+=m[v[n]]==0 && m[v[(n+1)%8]]==1;return count;}
// Legacy topology preserving queued thinning (OpenToonz BSD-3-Clause adaptation).
inline Mask thinBarrier(const Mask& barrier,int w,int h){const int pw=w+2;Mask s(std::size_t(pw)*(h+2)),queued(s.size());for(int y=0;y<h;++y)std::copy_n(barrier.begin()+y*w,w,s.begin()+(y+1)*pw+1);std::vector<int> candidates,removals;
 auto enqueue=[&](int i){if(s[i] && !queued[i]){queued[i]=1;candidates.push_back(i);}};auto all=[&]{for(int y=1;y<=h;++y)for(int x=1;x<=w;++x)enqueue(y*pw+x);};all();
 auto pass=[&](bool second,bool scanAll){if(scanAll)all();removals.clear();while(!candidates.empty()){const int i=candidates.back();candidates.pop_back();queued[i]=0;if(!s[i])continue;const int n=s[i-pw],ne=s[i-pw+1],e=s[i+1],se=s[i+pw+1],so=s[i+pw],sw=s[i+pw-1],we=s[i-1],nw=s[i-pw-1],count=n+ne+e+se+so+sw+we+nw;if(count<2 || count>6 || count==2 || transitions(i,pw,s)!=1)continue;if(second?(n*e*we || n*so*we):(n*e*so || e*so*we))continue;removals.push_back(i);}for(int i:removals)s[i]=0;for(int i:removals)neighbors8(i,pw,h+2,enqueue);return !removals.empty();};bool first=true;for(;;){const bool a=pass(false,false),b=pass(true,first);first=false;if(!a && !b)break;}Mask result(barrier.size());for(int y=0;y<h;++y)std::copy_n(s.begin()+(y+1)*pw+1,w,result.begin()+y*w);return result;}
struct Direction{double x=0,y=0;};
inline std::optional<Direction> endpointDirection(int seed,const Mask& s,int w,int h,int depth){std::vector<int> queue{seed},dist{0};std::set<int> visited{seed};double dx=0,dy=0;for(std::size_t i=0;i<queue.size();++i){const int index=queue[i];dx+=index%w-seed%w;dy+=index/w-seed/w;if(dist[i]>=depth)continue;neighbors8(index,w,h,[&](int n){if(s[n] && visited.insert(n).second){queue.push_back(n);dist.push_back(dist[i]+1);}});}if(queue.size()<2)return {};Direction d{-dx/queue.size(),-dy/queue.size()};return std::hypot(d.x,d.y)>=.5?std::optional<Direction>{d}:std::optional<Direction>{};}
inline double cosine(Direction d,double x,double y){const double a=std::hypot(d.x,d.y),b=std::hypot(x,y);return a>0 && b>0?(d.x*x+d.y*y)/(a*b):-1;}
inline bool matchesDirection(Direction d,double x,double y){return cosine(d,x,y)>=std::cos(3.141592653589793/6);}
inline std::vector<SelectionPoint> bridgePair(SelectionPoint a,SelectionPoint b,const Mask& barrier,int w,int threshold){std::vector<SelectionPoint> out;auto line=selectionLine(a,b);bool left=false,reached=false;for(std::size_t i=1;i<line.size();++i){auto p=line[i];const bool blocked=barrier[p.y*w+p.x];if(!left){if(blocked)continue;left=true;out.push_back(p);continue;}if(!blocked){if(reached)return {};out.push_back(p);if(int(out.size())>threshold)return {};}else reached=true;}return reached && !out.empty() && int(out.size())<=threshold?out:std::vector<SelectionPoint>{};}
inline Mask gapBarrier(const Mask& matching,int w,int h,int threshold){Mask barrier(matching.size());for(std::size_t i=0;i<barrier.size();++i)barrier[i]=!matching[i];auto skeleton=thinBarrier(barrier,w,h);struct Endpoint{SelectionPoint p;int index;bool isolated;std::optional<Direction> direction;};std::vector<Endpoint> endpoints;std::vector<int> endpointAt(barrier.size(),-1);
 for(int i=0;i<int(skeleton.size());++i)if(skeleton[i]){SelectionPoint p{i%w,i/w};if(!p.x || !p.y || p.x==w-1 || p.y==h-1)continue;int count=0;neighbors8(i,w,h,[&](int n){count+=skeleton[n];});const bool isolated=count==0;if(!isolated && (count>3 || transitions(i,w,skeleton)!=1))continue;endpointAt[i]=int(endpoints.size());endpoints.push_back({p,i,isolated,isolated?std::optional<Direction>{}:endpointDirection(i,skeleton,w,h,std::max(1,std::min(threshold-1,8)))});}
 struct Candidate{int a,b;double alignment,distance;std::vector<SelectionPoint> path;};std::vector<Candidate> candidates;
 for(int a=0;a<int(endpoints.size());++a)for(int b=a+1;b<int(endpoints.size());++b){const auto& from=endpoints[a];const auto& to=endpoints[b];const int dx=to.p.x-from.p.x,dy=to.p.y-from.p.y;if(std::max(std::abs(dx),std::abs(dy))>threshold+2 || (from.direction && !matchesDirection(*from.direction,dx,dy)) || (to.direction && !matchesDirection(*to.direction,-dx,-dy)))continue;auto path=bridgePair(from.p,to.p,barrier,w,threshold);if(!path.empty())candidates.push_back({a,b,std::min(from.direction?cosine(*from.direction,dx,dy):1,to.direction?cosine(*to.direction,-dx,-dy):1),std::hypot(dx,dy),std::move(path)});}
 std::stable_sort(candidates.begin(),candidates.end(),[](const auto& a,const auto& b){if(a.path.size()!=b.path.size())return a.path.size()<b.path.size();if(a.alignment!=b.alignment)return a.alignment>b.alignment;return a.distance<b.distance;});Mask uses(endpoints.size()),virtualBarrier(matching.size());std::vector<std::optional<Direction>> inferred(endpoints.size());
 auto available=[&](int i,Direction d){if(!endpoints[i].isolated)return uses[i]==0;return !uses[i] || (uses[i]==1 && inferred[i] && matchesDirection(*inferred[i],-d.x,-d.y));};auto use=[&](int i,Direction d){if(endpoints[i].isolated){if(!inferred[i])inferred[i]=d;++uses[i];}else uses[i]=1;};auto overlaps=[&](const auto& path){return std::any_of(path.begin(),path.end(),[&](auto p){return virtualBarrier[p.y*w+p.x]!=0;});};
 for(auto& c:candidates){auto a=endpoints[c.a].p,b=endpoints[c.b].p;Direction d{double(b.x-a.x),double(b.y-a.y)},reverse{-d.x,-d.y};if(!available(c.a,d) || !available(c.b,reverse) || overlaps(c.path))continue;use(c.a,d);use(c.b,reverse);for(auto p:c.path)virtualBarrier[p.y*w+p.x]=1;}
 struct Ray{int endpoint,hit;double angle;std::vector<SelectionPoint> path;};std::vector<Ray> rays;const double half=3.141592653589793/3,step=std::max(3.141592653589793/180,std::atan2(1,threshold+1));
 for(int i=0;i<int(endpoints.size());++i){auto e=endpoints[i];if(uses[i] || e.isolated || !e.direction)continue;std::optional<Ray> best;std::set<int> seen;for(int ai=0;ai<=int(std::ceil(half/step));++ai)for(int sign:{1,-1}){if(ai==0 && sign<0)continue;const double angle=ai*step*sign;if(std::abs(angle)>half+std::numeric_limits<double>::epsilon())continue;Direction d{e.direction->x*std::cos(angle)-e.direction->y*std::sin(angle),e.direction->x*std::sin(angle)+e.direction->y*std::cos(angle)};const double largest=std::max(std::abs(d.x),std::abs(d.y));if(!largest)continue;const double sx=d.x/largest,sy=d.y/largest;double steps=threshold+1;if(sx>0)steps=std::min(steps,(w-1-e.p.x)/sx);else if(sx<0)steps=std::min(steps,e.p.x/-sx);if(sy>0)steps=std::min(steps,(h-1-e.p.y)/sy);else if(sy<0)steps=std::min(steps,e.p.y/-sy);SelectionPoint target{int(std::floor(e.p.x+sx*steps+.5)),int(std::floor(e.p.y+sy*steps+.5))};const int targetIndex=target.y*w+target.x;if(targetIndex==e.index || !seen.insert(targetIndex).second)continue;auto line=selectionLine(e.p,target);std::vector<SelectionPoint> path;bool left=false;int hit=-1;for(std::size_t n=1;n<line.size();++n){auto p=line[n];const int index=p.y*w+p.x;const bool blocked=barrier[index] || virtualBarrier[index];if(!left){if(blocked)continue;left=true;path.push_back(p);continue;}if(blocked){if(!path.empty() && int(path.size())<=threshold)hit=index;break;}path.push_back(p);if(int(path.size())>threshold)break;}if(hit>=0 && (!best || path.size()<best->path.size() || (path.size()==best->path.size() && std::abs(angle)<std::abs(best->angle))))best=Ray{i,hit,angle,std::move(path)};}
 if(best)rays.push_back(std::move(*best));}
 std::stable_sort(rays.begin(),rays.end(),[](const auto& a,const auto& b){return a.path.size()!=b.path.size()?a.path.size()<b.path.size():std::abs(a.angle)<std::abs(b.angle);});for(auto& ray:rays){if(uses[ray.endpoint] || overlaps(ray.path))continue;uses[ray.endpoint]=1;const int hit=endpointAt[ray.hit];if(hit>=0 && !endpoints[hit].isolated)uses[hit]=1;for(auto p:ray.path)virtualBarrier[p.y*w+p.x]=1;}return virtualBarrier;
}
inline Mask flood(const Mask& matching,const Mask& barrier,int w,int h,int seed,int connectivity){Mask out(matching.size());if(!matching[seed] || (!barrier.empty() && barrier[seed]))return out;std::vector<int> stack{seed};auto allowed=[&](int i){return !out[i] && matching[i] && (barrier.empty() || !barrier[i]);};auto push=[&](int i){if(allowed(i))stack.push_back(i);};while(!stack.empty()){const int i=stack.back();stack.pop_back();if(!allowed(i))continue;if(connectivity==8){out[i]=1;neighbors8(i,w,h,push);continue;}const int row=i-i%w;int left=i,right=i+1;while(left>row && allowed(left-1))--left;while(right<row+w && allowed(right))++right;std::fill(out.begin()+left,out.begin()+right,1);for(int delta:{-w,w}){if(left+delta<0 || right+delta>int(out.size()))continue;bool run=false;for(int n=left+delta;n<right+delta;++n){if(!allowed(n)){run=false;continue;}if(!run)push(n);run=true;}}}return out;}
inline void includeClosure(Mask& selected,const Mask& barrier,const Mask& matching,int w,int h,int threshold){Mask active(barrier.size()),visited(barrier.size());std::vector<int> queue;
 auto activate=[&](int seed){if(!barrier[seed] || active[seed])return;queue={seed};active[seed]=1;for(std::size_t i=0;i<queue.size();++i){selected[queue[i]]=1;neighbors8(queue[i],w,h,[&](int n){if(barrier[n] && !active[n]){active[n]=1;queue.push_back(n);}});}};
 for(int i=0;i<int(barrier.size());++i)if(barrier[i]){bool touches=false;neighbors8(i,w,h,[&](int n){touches|=selected[n]!=0;});if(touches)activate(i);}
 auto pocket=[&](int seed){if(!matching[seed] || selected[seed] || active[seed] || visited[seed])return;std::vector<int> q{seed};visited[seed]=1;int left=seed%w,right=left,top=seed/w,bottom=top;bool edge=false,filled=false,closure=false,contains=false;auto push=[&](int i){if(matching[i] && !selected[i] && !active[i] && !visited[i]){visited[i]=1;q.push_back(i);}};for(std::size_t i=0;i<q.size();++i){const int n=q[i],x=n%w,y=n/w;left=std::min(left,x);right=std::max(right,x);top=std::min(top,y);bottom=std::max(bottom,y);edge|=!x || !y || x==w-1 || y==h-1;contains|=barrier[n]!=0;neighbors8(n,w,h,[&](int t){if(selected[t]){filled=true;closure|=active[t]!=0;}});if(x)push(n-1);if(x+1<w)push(n+1);if(y)push(n-w);if(y+1<h)push(n+w);}if(!filled || (!contains && !closure) || edge || int(q.size())>std::max(8,threshold*4) || right-left+1>threshold+2 || bottom-top+1>threshold+2)return;for(int n:q){selected[n]=1;if(barrier[n])activate(n);}};
 for(int i=0;i<int(barrier.size());++i)if(barrier[i] && !active[i])pocket(i);for(int i=0;i<int(active.size());++i)if(active[i])neighbors8(i,w,h,[&](int n){if(matching[n])pocket(n);});
}
}
// Compact row/span flood from legacy magic-wand-selection-engine.ts.
template<class Match> inline std::optional<SelectionMask> compactWandFlood(int w,int h,int sx,int sy,Match matches){
 std::vector<selection_detail::Mask> visited(h);struct Span{int y,left,right;};std::vector<Span> queue{{sy,sx,sx+1}},spans;int left=sx,right=sx,top=sy,bottom=sy,count=0;
 auto allowed=[&](int x,int y){return x>=0 && y>=0 && x<w && y<h && (visited[y].empty() || !visited[y][x]) && matches(x,y);};if(!allowed(sx,sy))return {};
 auto enqueue=[&](int y,int from,int to){if(y<0 || y>=h)return;int x=std::max(0,from),end=std::min(w,to);while(x<end){if(!allowed(x,y)){++x;continue;}const int start=x;while(x<end && allowed(x,y))++x;queue.push_back({y,start,x});}};
 while(!queue.empty()){auto seed=queue.back();queue.pop_back();if(!allowed(seed.left,seed.y))continue;int l=seed.left,r=seed.right;while(l>0 && allowed(l-1,seed.y))--l;while(r<w && allowed(r,seed.y))++r;if(visited[seed.y].empty())visited[seed.y].resize(w);std::fill(visited[seed.y].begin()+l,visited[seed.y].begin()+r,1);spans.push_back({seed.y,l,r});count+=r-l;left=std::min(left,l);right=std::max(right,r-1);top=std::min(top,seed.y);bottom=std::max(bottom,seed.y);enqueue(seed.y-1,l,r);enqueue(seed.y+1,l,r);}
 SelectionMask out{left,top,right-left+1,bottom-top+1,{}};if(count==out.width*out.height)return out;out.mask.resize(std::size_t(out.width)*out.height);for(auto span:spans)std::fill(out.mask.begin()+(span.y-top)*out.width+span.left-left,out.mask.begin()+(span.y-top)*out.width+span.right-left,1);return out;
}
struct WandOptions {int tolerance=0,connectivity=4,gapThreshold=2;bool contiguous=true,gapClosing=false,visibleLayers=false;};
inline std::optional<SelectionMask> magicWandSelection(const std::vector<std::uint32_t>& pixels,int w,int h,int x,int y,WandOptions options={},const std::optional<SelectionMask>& selection={}){
 if(w<1 || h<1 || x<0 || y<0 || x>=w || y>=h || pixels.size()!=std::size_t(w)*h)return {};const auto target=pixels[y*w+x];const int tolerance=std::clamp(options.tolerance,0,255);
 auto matches=[&](int px,int py){if(selection && !selectionContains(selection,px,py))return false;const auto color=pixels[std::size_t(py)*w+px];int difference=0;for(int shift:{0,8,16,24})difference=std::max(difference,std::abs(int((color>>shift)&255)-int((target>>shift)&255)));return difference<=tolerance;};
 if(options.contiguous && !options.gapClosing && options.connectivity==4){
  // Preserve the legacy sparse transparent-exterior fast path.
  if(!selection && target==0){int left=w,top=h,right=0,bottom=0;for(int i=0;i<int(pixels.size());++i)if(pixels[i]>>24){left=std::min(left,i%w);top=std::min(top,i/w);right=std::max(right,i%w+1);bottom=std::max(bottom,i/w+1);}if(right==0)return SelectionMask{0,0,w,h,{}};left=std::max(0,left-1);top=std::max(0,top-1);right=std::min(w,right+1);bottom=std::min(h,bottom+1);const int lw=right-left,lh=bottom-top;
   if(left>0 && top>0 && right<w && bottom<h && std::size_t(lw)*lh<pixels.size()/2){auto local=compactWandFlood(lw,lh,std::clamp(x,left,right-1)-left,std::clamp(y,top,bottom-1)-top,[&](int px,int py){return matches(px+left,py+top);});if(!local)return {};const bool exterior=local->x==0 || local->y==0 || local->x+local->width==lw || local->y+local->height==lh;if(!exterior){local->x+=left;local->y+=top;return local;}SelectionMask out{0,0,w,h,selection_detail::Mask(pixels.size(),1)};for(int row=top;row<bottom;++row){std::fill(out.mask.begin()+row*w+left,out.mask.begin()+row*w+right,0);for(int col=left;col<right;++col)if(selectionContains(local,col-left,row-top))out.mask[row*w+col]=1;}return out;}
  }
  return compactWandFlood(w,h,x,y,matches);
 }
 selection_detail::Mask matching(pixels.size());for(int row=0;row<h;++row)for(int col=0;col<w;++col)matching[row*w+col]=matches(col,row);
 auto region=matching;if(options.contiguous){selection_detail::Mask barrier;if(options.gapClosing){const int threshold=std::clamp(options.gapThreshold,1,16);int left=w,top=h,right=0,bottom=0;for(int i=0;i<int(matching.size());++i)if(!matching[i]){left=std::min(left,i%w);top=std::min(top,i/w);right=std::max(right,i%w+1);bottom=std::max(bottom,i/w+1);}if(right>left && bottom>top){const int padding=threshold+2;left=std::max(0,left-padding);top=std::max(0,top-padding);right=std::min(w,right+padding);bottom=std::min(h,bottom+padding);const int lw=right-left,lh=bottom-top;selection_detail::Mask local(std::size_t(lw)*lh);for(int row=0;row<lh;++row)std::copy_n(matching.begin()+(top+row)*w+left,lw,local.begin()+row*lw);auto small=selection_detail::gapBarrier(local,lw,lh,threshold);barrier.resize(matching.size());for(int row=0;row<lh;++row)std::copy_n(small.begin()+row*lw,lw,barrier.begin()+(top+row)*w+left);}}
 region=selection_detail::flood(matching,barrier,w,h,y*w+x,options.connectivity);if(!barrier.empty()){if(!region[y*w+x])region=selection_detail::flood(matching,{},w,h,y*w+x,options.connectivity);selection_detail::includeClosure(region,barrier,matching,w,h,std::clamp(options.gapThreshold,1,16));}}
 return trimSelection(SelectionMask{0,0,w,h,std::move(region)});
}
}
