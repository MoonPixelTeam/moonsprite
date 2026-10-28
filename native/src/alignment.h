#pragma once
#include "grid_snap.h"
#include "timeline_model.h"
#include <algorithm>
#include <vector>
namespace moon {
struct AlignmentGuide {char axis='x';double position=0;bool smart=false;};
struct AlignmentResult {GridPoint offset;std::vector<AlignmentGuide> guides;};
inline bool validAlignmentBounds(GridRect b){return std::isfinite(b.x)&&std::isfinite(b.y)&&std::isfinite(b.width)&&std::isfinite(b.height)&&b.width>0&&b.height>0;}
inline double alignmentThresholdForZoom(double screen,double zoom){return !std::isfinite(screen)||screen<=0||!std::isfinite(zoom)||zoom==0?0:std::max(1.,screen/std::abs(zoom));}
// Legacy rasterContentBounds cache, using native linked-owner revisions instead of JS raster identity.
struct AlignmentBoundsCache {
 struct Entry {std::weak_ptr<const void> owner;std::uint64_t revision;int width,height;std::optional<GridRect> local;};
 std::vector<Entry> entries;
 std::uint64_t scans=0;
 bool cachedBounds(const timeline::Surface& s,const timeline::Timeline::StorageStamp& stamp,std::optional<GridRect>& out)const{const auto found=std::find_if(entries.begin(),entries.end(),[&](const Entry& e){return e.owner.lock()==stamp.owner&&stamp.owner&&e.revision==stamp.revision&&e.width==s.width&&e.height==s.height;});if(found==entries.end())return false;out=found->local;if(out){out->x+=s.offsetX;out->y+=s.offsetY;}return true;}

 std::optional<GridRect> bounds(const timeline::Surface& s,const timeline::Timeline::StorageStamp& stamp){
  entries.erase(std::remove_if(entries.begin(),entries.end(),[](const Entry& e){return e.owner.expired();}),entries.end());
  auto found=std::find_if(entries.begin(),entries.end(),[&](const Entry& e){return e.owner.lock()==stamp.owner&&e.revision==stamp.revision&&e.width==s.width&&e.height==s.height;});
  std::optional<GridRect> local;
  if(found!=entries.end()){local=found->local;auto entry=*found;entries.erase(found);entries.push_back(entry);}
  else {++scans;int left=s.width,top=s.height,right=-1,bottom=-1;for(int y=0;y<s.height;++y)for(int x=0;x<s.width;++x)if(s.pixels[std::size_t(y)*s.width+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right>=left)local=GridRect{double(left),double(top),double(right-left+1),double(bottom-top+1)};if(stamp.owner){if(entries.size()>=256)entries.erase(entries.begin());entries.push_back({stamp.owner,stamp.revision,s.width,s.height,local});}}
  if(local){local->x+=s.offsetX;local->y+=s.offsetY;}return local;
 }
};
// Full stored alpha bounds, including sparse pixels outside the canvas. Capture once per drag.
inline std::vector<GridRect> alignmentLayerTargets(const timeline::Timeline& t,const std::string& frame,const std::vector<std::string>& excluded,AlignmentBoundsCache* cache=nullptr){
 std::vector<GridRect> result;
 for(const auto& layer:t.state().layers){
  if(!timeline::isLayerEffectivelyVisible(t.state(),layer)||std::find(excluded.begin(),excluded.end(),layer.id)!=excluded.end())continue;
  const auto* cel=t.findCel(layer.id,frame);if(!cel)continue;const auto* s=t.resolveSurface(cel->id).surface;if(!s)continue;
  AlignmentBoundsCache temporary;auto bounds=(cache?cache:&temporary)->bounds(*s,t.thumbnailStorage(cel->id));if(bounds)result.push_back(*bounds);
 }return result;
}
inline AlignmentResult resolveAlignment(const std::vector<GridRect>& moving,const std::vector<GridRect>& targets,GridPoint delta,double canvasWidth,double canvasHeight,GridSettings grid,bool gridEnabled,bool smartEnabled,double threshold,char lockedAxis=0){
 AlignmentResult result{delta,{}};std::vector<GridRect> source;
 for(auto b:moving)if(validAlignmentBounds(b))source.push_back(b);
 if(source.empty()||(!gridEnabled&&!smartEnabled))return result;
 auto united=source.front();double right=united.x+united.width,bottom=united.y+united.height;
 for(auto b:source){united.x=std::min(united.x,b.x);united.y=std::min(united.y,b.y);right=std::max(right,b.x+b.width);bottom=std::max(bottom,b.y+b.height);}united.width=right-united.x;united.height=bottom-united.y;
 source.insert(source.begin(),united);std::vector<GridRect> unique;
 for(auto b:source)if(std::none_of(unique.begin(),unique.end(),[&](GridRect q){return q.x==b.x&&q.y==b.y&&q.width==b.width&&q.height==b.height;}))unique.push_back(b);
 std::vector<GridRect> smartTargets;if(canvasWidth>0&&canvasHeight>0)smartTargets.push_back({0,0,canvasWidth,canvasHeight});smartTargets.insert(smartTargets.end(),targets.begin(),targets.end());
 threshold=std::isfinite(threshold)?std::max(0.,threshold):0;
 struct Candidate{double correction,position;bool smart;};
 for(char axis:{'x','y'}){
  if(lockedAxis&&lockedAxis!=axis)continue;std::vector<Candidate> candidates;
  auto add=[&](double correction,double position,bool smart){const double rounded=std::floor(correction+.5);if(std::abs(correction-rounded)<=1e-6&&std::abs(rounded)<=threshold)candidates.push_back({rounded,position,smart});};
  for(auto b:unique){const double start=(axis=='x'?b.x+delta.x:b.y+delta.y),end=start+(axis=='x'?b.width:b.height);
   if(smartEnabled)for(auto target:smartTargets){if(!validAlignmentBounds(target))continue;const double a=axis=='x'?target.x:target.y,z=a+(axis=='x'?target.width:target.height);for(double p:{start,end})for(double q:{a,z})add(q-p,q,true);add((a+z-start-end)/2,(a+z)/2,true);}
   if(gridEnabled&&validGrid(grid)){const double origin=axis=='x'?grid.x:grid.y,size=axis=='x'?grid.width:grid.height;for(double p:{start,end}){const double q=origin+std::floor((p-origin)/size+.5)*size;add(q-p,q,false);}}
  }
  if(candidates.empty())continue;
  std::stable_sort(candidates.begin(),candidates.end(),[](const Candidate& a,const Candidate& b){if(std::abs(a.correction)!=std::abs(b.correction))return std::abs(a.correction)<std::abs(b.correction);if(a.smart!=b.smart)return a.smart;return a.position<b.position;});
  const double correction=candidates.front().correction;(axis=='x'?result.offset.x:result.offset.y)+=correction;
  for(auto c:candidates)if(c.correction==correction){auto found=std::find_if(result.guides.begin(),result.guides.end(),[&](const AlignmentGuide& g){return g.axis==axis&&std::abs(g.position-c.position)<=1e-6;});if(found==result.guides.end())result.guides.push_back({axis,c.position,c.smart});else found->smart|=c.smart;}
 }return result;
}
}
