#include "timeline_model.h"
#include <cmath>
#include <algorithm>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif
#include <cmath>
#include <algorithm>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif
#include <limits>
#include <stdexcept>
#include <unordered_set>
#include <array>
#include <list>
#include <mutex>

namespace moon::timeline {
struct SelectionCacheEntry {std::array<int,6> key;std::optional<SelectionMask> local;std::size_t bytes=0;};
namespace {
constexpr std::size_t selectionBudget=4*1024*1024;
std::list<std::shared_ptr<SelectionCacheEntry>> selectionLru;
SelectionCacheStats selectionStats;
std::mutex selectionMutex;
}
SelectionCacheStats celSelectionCacheStats(){std::lock_guard<std::mutex> lock(selectionMutex);auto result=selectionStats;result.entries=selectionLru.size();return result;}

namespace {
void requireId(const std::string& id) {if(id.empty()) throw std::invalid_argument("Timeline ID must not be empty");}
void checkLayer(const Layer& layer) {
  requireId(layer.id);
  if(!std::isfinite(layer.opacity) || layer.opacity<0 || layer.opacity>1) throw std::invalid_argument("Invalid layer opacity");
}
void checkFrame(const Frame& frame) {
  requireId(frame.id);if(frame.duration<1) throw std::invalid_argument("Frame duration must be positive");
}
constexpr std::size_t missing=std::numeric_limits<std::size_t>::max();
}
Timeline::Timeline(State state):state_(std::move(state)) {buildIndex();}
Timeline::Timeline(const Timeline& other):visibleContent_(other.visibleContent_),contentScans_(other.contentScans_),state_(other.state_),layers_(other.layers_),frames_(other.frames_),cels_(other.cels_),slots_(other.slots_),resolved_(other.resolved_) {}
Timeline& Timeline::operator=(const Timeline& other){if(this!=&other){Timeline copy(other);*this=std::move(copy);}return *this;}

void Timeline::buildIndex() {
  selectionContent_.clear();
  visibleContent_.clear();
  layers_.clear();frames_.clear();cels_.clear();slots_.clear();resolved_.clear();
  for(std::size_t i=0;i<state_.layers.size();++i) {
    const auto& layer=state_.layers[i];checkLayer(layer);
    if(!layers_.emplace(layer.id,i).second) throw std::invalid_argument("Duplicate layer ID: "+layer.id);
  }
  for(std::size_t i=0;i<state_.frames.size();++i) {
    const auto& frame=state_.frames[i];checkFrame(frame);
    if(!frames_.emplace(frame.id,i).second) throw std::invalid_argument("Duplicate frame ID: "+frame.id);
  }
  for(std::size_t i=0;i<state_.cels.size();++i) {
    const auto& cel=state_.cels[i];checkCel(cel);
    if(!cels_.emplace(cel.id,i).second) throw std::invalid_argument("Duplicate cel ID: "+cel.id);
    if(!slots_.emplace(std::make_pair(cel.layerId,cel.frameId),i).second) throw std::invalid_argument("Duplicate layer/frame cel slot");
  }
}
void Timeline::checkCel(const Cel& cel) const {
  requireId(cel.id);
  if(!layers_.count(cel.layerId)) throw std::invalid_argument("Unknown cel layer: "+cel.layerId);
  if(!frames_.count(cel.frameId)) throw std::invalid_argument("Unknown cel frame: "+cel.frameId);
  if(cel.opacity && (!std::isfinite(*cel.opacity) || *cel.opacity<0 || *cel.opacity>1)) throw std::invalid_argument("Invalid cel opacity");
  if(cel.surface) {
    const auto& surface=*cel.surface;
    if(surface.width<1 || surface.height<1) throw std::invalid_argument("Invalid cel surface dimensions");
    const auto width=std::size_t(surface.width),height=std::size_t(surface.height);
    if(width>std::numeric_limits<std::size_t>::max()/height || width*height!=surface.pixels.size())
      throw std::invalid_argument("Cel surface pixel count does not match dimensions");
  }
}
const Cel* Timeline::findCel(const std::string& layerId,const std::string& frameId) const {
  const auto found=slots_.find({layerId,frameId});return found==slots_.end()?nullptr:&state_.cels[found->second];
}
const Cel* Timeline::findCelById(const std::string& celId) const {
  const auto found=cels_.find(celId);return found==cels_.end()?nullptr:&state_.cels[found->second];
}
Timeline::CachedResolution Timeline::resolveIndex(const std::string& celId) const {
  const auto origin=cels_.find(celId);
  if(origin==cels_.end()) return {missing,LinkIssue::UnknownCel,celId};
  const auto cached=resolved_.find(celId);if(cached!=resolved_.end()) return cached->second;
  std::size_t current=origin->second;
  std::unordered_set<std::size_t> visited;
  std::vector<std::size_t> path;
  auto fallback=[&](LinkIssue issue,const std::string& offending) {
    CachedResolution result{origin->second,issue,offending};resolved_.emplace(celId,result);return result;
  };
  while((state_.cels[current].linkedCelId && !state_.cels[current].linkedCelId->empty()) || state_.cels[current].runtimeSharedCelId) {
    const auto& cel=state_.cels[current];
    // Only valid roots are reusable for a different starting cel. Invalid
    // chains must fall back to the original requesting cel, not an intermediate.
    const auto known=resolved_.find(cel.id);
    if(known!=resolved_.end() && known->second.issue==LinkIssue::None) {current=known->second.index;break;}
    if(!visited.insert(current).second) return fallback(LinkIssue::Cycle,cel.id);
    path.push_back(current);
    const auto& targetId=cel.runtimeSharedCelId?*cel.runtimeSharedCelId:*cel.linkedCelId;
    const auto target=cels_.find(targetId);
    if(target==cels_.end()) return fallback(LinkIssue::MissingTarget,targetId);
    if(state_.cels[target->second].layerId!=state_.cels[origin->second].layerId) return fallback(LinkIssue::CrossLayer,targetId);
    current=target->second;
  }
  const CachedResolution result{current,LinkIssue::None,{}};
  resolved_[state_.cels[current].id]=result;
  for(auto index:path) resolved_[state_.cels[index].id]=result;
  return result;
}
Resolution Timeline::resolveSurface(const std::string& celId) const {
  const auto resolved=resolveIndex(celId);
  if(resolved.index==missing) return {nullptr,nullptr,resolved.issue,resolved.offendingId};
  const auto& source=state_.cels[resolved.index];
  return {&source,source.surface?&*source.surface:nullptr,resolved.issue,resolved.offendingId};
}
bool Timeline::hasVisiblePixels(const std::string& celId,bool cache) const {
  const auto resolved=resolveSurface(celId);
  if(!resolved.source || !resolved.surface)return false;
  const auto& id=resolved.source->id;
  if(cache){const auto found=visibleContent_.find(id);if(found!=visibleContent_.end())return found->second;}
  ++contentScans_;
  const auto& pixels=resolved.surface->pixels;
  const bool value=std::any_of(pixels.begin(),pixels.end(),[](Pixel p){return (p>>24)!=0;});
  if(cache)visibleContent_[id]=value;
  return value;
}
// legacy animation-cel-content-cache.ts: local masks, private copies and global bounded LRU.
// Native owned value storage uses the existing write barriers in place of JS storage revisions.
std::optional<SelectionMask> Timeline::contentSelection(const std::string& celId,int canvasWidth,int canvasHeight,bool cache) const {
 const auto resolved=resolveSurface(celId);if(!resolved.source || !resolved.surface)return {};
 const auto& surface=*resolved.surface;const int left=std::max(0,-surface.offsetX),top=std::max(0,-surface.offsetY),right=std::min(surface.width,canvasWidth-surface.offsetX),bottom=std::min(surface.height,canvasHeight-surface.offsetY);if(right<=left || bottom<=top)return {};
 const std::array<int,6> key{surface.width,surface.height,left,top,right,bottom};
 auto placed=[&](std::optional<SelectionMask> local){if(local){local->x+=surface.offsetX;local->y+=surface.offsetY;}return local;};
 std::lock_guard<std::mutex> lock(selectionMutex);
 auto previous=selectionContent_.find(resolved.source->id);
 auto entry=previous==selectionContent_.end()?std::shared_ptr<SelectionCacheEntry>{}:previous->second.lock();
 if(cache && entry && entry->key==key){const auto found=std::find(selectionLru.begin(),selectionLru.end(),entry);if(found!=selectionLru.end()){++selectionStats.hits;selectionLru.splice(selectionLru.end(),selectionLru,found);return placed(entry->local);}}
 if(cache && entry){const auto found=std::find(selectionLru.begin(),selectionLru.end(),entry);if(found!=selectionLru.end()){selectionStats.bytes-=entry->bytes;selectionLru.erase(found);}selectionContent_.erase(resolved.source->id);}
 ++selectionStats.builds;
 int minX=right,minY=bottom,maxX=-1,maxY=-1;
 for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)if(surface.pixels[std::size_t(y)*surface.width+x]>>24){minX=std::min(minX,x);minY=std::min(minY,y);maxX=std::max(maxX,x);maxY=std::max(maxY,y);}
 std::optional<SelectionMask> local;
 if(maxX>=minX && maxY>=minY){SelectionMask mask{minX,minY,maxX-minX+1,maxY-minY+1,{}};mask.mask.resize(std::size_t(mask.width)*mask.height);std::size_t count=0;for(int y=minY;y<=maxY;++y)for(int x=minX;x<=maxX;++x){const bool opaque=(surface.pixels[std::size_t(y)*surface.width+x]>>24)!=0;mask.mask[std::size_t(y-minY)*mask.width+x-minX]=opaque;count+=opaque;}if(count==mask.mask.size())std::vector<unsigned char>{}.swap(mask.mask);local=std::move(mask);}
 const auto bytes=local?local->mask.size():0;
 if(cache && bytes<=selectionBudget){while(selectionStats.bytes+bytes>selectionBudget || selectionLru.size()>=256){selectionStats.bytes-=selectionLru.front()->bytes;selectionLru.pop_front();++selectionStats.evictions;}auto next=std::make_shared<SelectionCacheEntry>(SelectionCacheEntry{key,std::move(local),bytes});selectionContent_[resolved.source->id]=next;selectionLru.push_back(next);selectionStats.bytes+=bytes;return placed(next->local);}
 return placed(std::move(local));
}
std::vector<LinkDiagnostic> Timeline::diagnoseLinks() const {
  std::vector<LinkDiagnostic> diagnostics;
  for(const auto& cel:state_.cels) {
    const auto result=resolveIndex(cel.id);
    if(result.issue!=LinkIssue::None) diagnostics.push_back({cel.id,result.issue,result.offendingId});
  }
  return diagnostics;
}
bool Timeline::isKnownEmpty(const std::string& celId) const {
  const auto resolved=resolveSurface(celId);if(!resolved.source || !resolved.surface)return false;
  const auto found=visibleContent_.find(resolved.source->id);
  return found!=visibleContent_.end() && !found->second;
}
void Timeline::addLayer(Layer layer) {
  checkLayer(layer);if(layers_.count(layer.id)) throw std::invalid_argument("Duplicate layer ID: "+layer.id);
  state_.layers.push_back(std::move(layer));
  try {layers_.emplace(state_.layers.back().id,state_.layers.size()-1);}
  catch(...) {state_.layers.pop_back();throw;}
}
void Timeline::addFrame(Frame frame) {
  checkFrame(frame);if(frames_.count(frame.id)) throw std::invalid_argument("Duplicate frame ID: "+frame.id);
  state_.frames.push_back(std::move(frame));
  try {frames_.emplace(state_.frames.back().id,state_.frames.size()-1);}
  catch(...) {state_.frames.pop_back();throw;}
}
void Timeline::addCel(Cel cel) {
  checkCel(cel);if(cels_.count(cel.id)) throw std::invalid_argument("Duplicate cel ID: "+cel.id);
  const auto key=std::make_pair(cel.layerId,cel.frameId);
  if(slots_.count(key)) throw std::invalid_argument("Duplicate layer/frame cel slot");
  state_.cels.push_back(std::move(cel));
  try {
    cels_.emplace(state_.cels.back().id,state_.cels.size()-1);
    slots_.emplace(key,state_.cels.size()-1);
  } catch(...) {cels_.erase(state_.cels.back().id);slots_.erase(key);state_.cels.pop_back();throw;}
  // A previously dangling link may now resolve to this newly inserted cel.
  resolved_.clear();
}
Surface* Timeline::mutableOwnedSurface(const std::string& ownerCelId) {
  selectionContent_.erase(ownerCelId);
  visibleContent_.erase(ownerCelId);
  const auto found=cels_.find(ownerCelId);
  if(found==cels_.end()) return nullptr;
  auto& source=state_.cels[found->second];return source.surface?&*source.surface:nullptr;
}
PixelChange Timeline::setPixel(const std::string& celId,std::size_t localIndex,Pixel color) {
  const auto result=resolveIndex(celId);
  if(result.index==missing) throw std::invalid_argument("Unknown pixel target cel: "+celId);
  auto& owner=state_.cels[result.index];
  if(!owner.surface) throw std::logic_error("Cannot paint an unmaterialized cel surface");
  if(localIndex>=owner.surface->pixels.size()) throw std::out_of_range("Pixel outside cel surface");
  PixelChange change{owner.id,localIndex,owner.surface->pixels[localIndex],color,result.issue};
  if(change.changed()){selectionContent_.erase(owner.id);visibleContent_.erase(owner.id);}
  owner.surface->pixels[localIndex]=color;
  return change;
}
// Native counterpart of JS localeCompare for equal-range labels.
static bool loopNameLess(const std::u32string& left,const std::u32string& right){
#ifdef _WIN32
 auto wide=[](const std::u32string& text){std::wstring out;for(auto c:text){if(c<=0xffff)out.push_back(wchar_t(c));else{c-=0x10000;out.push_back(wchar_t(0xd800+(c>>10)));out.push_back(wchar_t(0xdc00+(c&1023)));}}return out;};const auto a=wide(left),b=wide(right);const int order=CompareStringEx(LOCALE_NAME_USER_DEFAULT,0,a.data(),int(a.size()),b.data(),int(b.size()),nullptr,nullptr,0);if(order)return order==CSTR_LESS_THAN;
#endif
 return left<right;
}
// legacy components/panels/layer-timeline-layout.ts: nested lanes and leaf placement.
LoopSectionLayout layoutLoopSections(const State& state,const std::optional<LoopSectionPreview>& preview){
 struct Candidate{const LoopSection* section;int start,end,span,parent=-1,lane=0;};std::vector<Candidate> candidates;
 for(const auto& section:state.loopSections){auto range=loopRange(state,section);if(preview && preview->id==section.id && preview->startIndex>=0 && preview->endIndex<int(state.frames.size()))range={preview->startIndex,preview->endIndex};if(range.start>=0 && range.end>=range.start)candidates.push_back({&section,range.start,range.end,range.end-range.start+1});}
 std::stable_sort(candidates.begin(),candidates.end(),[](const auto& a,const auto& b){return a.start!=b.start?a.start<b.start:a.span!=b.span?a.span>b.span:loopNameLess(a.section->name,b.section->name);});
 auto overlaps=[&](int a,int b){return candidates[a].start<=candidates[b].end && candidates[b].start<=candidates[a].end;};
 std::vector<std::vector<int>> lanes;LoopSectionLayout result;
 for(int n=0;n<int(candidates.size());++n){auto& c=candidates[n];for(int p=0;p<n;++p){const auto& parent=candidates[p];if(parent.start<=c.start && parent.end>=c.end && (parent.start<c.start || parent.end>c.end) && (c.parent<0 || parent.span<candidates[c.parent].span))c.parent=p;}int lane=c.parent>=0?candidates[c.parent].lane+1:0;for(;;++lane){if(lane>=int(lanes.size())){lanes.resize(lane+1);break;}if(std::none_of(lanes[lane].begin(),lanes[lane].end(),[&](int other){return overlaps(other,n);}))break;}c.lane=lane;lanes[lane].push_back(n);result.items.push_back({c.section->id,c.start,c.span,lane,1});result.laneCount=std::max(result.laneCount,lane+1);}
 std::vector<bool> parent(candidates.size(),false),placed(candidates.size(),false);for(const auto& c:candidates)if(c.parent>=0)parent[c.parent]=true;
 for(int n=0;n<int(candidates.size());++n)if(!parent[n]){const int parentLane=candidates[n].parent>=0?result.items[candidates[n].parent].lane:-1;for(int lane=result.laneCount-1;lane>parentLane;--lane){bool blocked=false;for(int other=0;other<int(candidates.size());++other)if(other!=n && (parent[other] || placed[other]) && result.items[other].lane==lane && overlaps(other,n)){blocked=true;break;}if(!blocked){result.items[n].lane=lane;break;}}placed[n]=true;}
 for(int n=0;n<int(candidates.size());++n){int p=candidates[n].parent;while(p>=0){result.items[p].laneSpan=std::max(result.items[p].laneSpan,result.items[n].lane-result.items[p].lane+1);p=candidates[p].parent;}}
 for(auto& item:result.items)item.laneSpan=std::max(item.laneSpan,result.laneCount-item.lane);return result;
}
// legacy animation-gesture-helpers.ts: boundary Math.round; end is boundary-1.
int loopResizeFrameIndex(double pointer,double firstFrame,double frameWidth,int frameCount,bool startEdge){if(frameCount<1 || frameWidth<=0)return -1;const double boundary=std::floor((pointer-firstFrame)/frameWidth+0.5);return int(std::clamp(boundary-(startEdge?0.0:1.0),0.0,double(frameCount-1)));}
LoopRange loopRange(const State& state,const LoopSection& section){LoopRange r;for(int i=0;i<int(state.frames.size());++i){if(state.frames[i].id==section.startFrameId)r.start=i;if(state.frames[i].id==section.endFrameId)r.end=i;}if(r.start>=0 && r.end>=0 && r.start>r.end)std::swap(r.start,r.end);return r;}
const LoopSection* loopAtFrame(const State& state,const std::string& frameId){int index=-1;for(int i=0;i<int(state.frames.size());++i)if(state.frames[i].id==frameId)index=i;const LoopSection* match=nullptr;int span=100000;for(const auto& s:state.loopSections){const auto r=loopRange(state,s);if(r.start>=0 && index>=r.start && index<=r.end && r.end-r.start<span){match=&s;span=r.end-r.start;}}return match;}
// animation.ts stepAnimationFrameId / loop-sections stepAnimationLoopSectionFrameId.
std::string stepFrameId(const State& state,const std::string& frameId,int direction,bool tagMode,bool skipDisabled){
 if(!direction || state.frames.empty())return {};direction=direction>0?1:-1;const auto* section=tagMode?loopAtFrame(state,frameId):nullptr;if(!section){const auto& frames=state.frames;const auto found=std::find_if(frames.begin(),frames.end(),[&](const auto& f){return f.id==frameId;});const int start=found==frames.end()?(direction>0?-1:0):int(found-frames.begin());for(int offset=1;offset<=int(frames.size());++offset){const auto& f=frames[(start+direction*offset+int(frames.size())*2)%int(frames.size())];if(!skipDisabled || !f.disabled)return f.id;}return {};}const auto range=section?loopRange(state,*section):LoopRange{0,int(state.frames.size())-1};std::vector<std::string> ids;for(int n=range.start;n<=range.end;++n)if(!skipDisabled || !state.frames[n].disabled)ids.push_back(state.frames[n].id);if(ids.empty())return {};const auto found=std::find(ids.begin(),ids.end(),frameId);const int start=found==ids.end()?(direction>0?-1:0):int(found-ids.begin());return ids[(start+direction+int(ids.size()))%int(ids.size())];
}
std::vector<std::string> loopPlaybackFrames(const State& state,const LoopSection& section){const auto r=loopRange(state,section);std::vector<std::string> ids;if(r.start<0 || r.end<0)return ids;for(int i=r.start;i<=r.end;++i)if(!state.frames[i].disabled)ids.push_back(state.frames[i].id);if(section.direction=="reverse" || section.direction=="ping-pong-reverse")std::reverse(ids.begin(),ids.end());if(section.direction=="ping-pong" || section.direction=="ping-pong-reverse"){const auto count=ids.size();if(count>2)for(int i=int(count)-2;i>=1;--i)ids.push_back(ids[i]);}return ids;}
std::vector<LoopSection> reconcileLoopsReorder(const State& previous,const std::vector<Frame>& remaining,const std::vector<Frame>& reordered,const std::vector<std::string>& moving,int insertion,int dropSide){
 auto has=[&](const std::string& id){return std::find(moving.begin(),moving.end(),id)!=moving.end();};bool unchanged=previous.frames.size()==reordered.size();for(std::size_t i=0;i<previous.frames.size() && unchanged;++i)unchanged=previous.frames[i].id==reordered[i].id;int movingStart=100000,movingEnd=-1;for(int i=0;i<int(previous.frames.size());++i)if(has(previous.frames[i].id)){movingStart=std::min(movingStart,i);movingEnd=i;}
 std::vector<LoopSection> out;for(auto section:previous.loopSections){const auto r=loopRange(previous,section);if(r.start<0 || r.end<0)continue;std::vector<std::string> members,kept,selected;for(int i=r.start;i<=r.end;++i){members.push_back(previous.frames[i].id);(has(previous.frames[i].id)?selected:kept).push_back(previous.frames[i].id);}int left=100000,right=-1;for(int i=0;i<int(remaining.size());++i)if(std::find(members.begin(),members.end(),remaining[i].id)!=members.end()){left=std::min(left,i);right=i;}const bool include=unchanged && dropSide?(dropSide<0?r.end+1==movingStart:r.start==movingEnd+1):(right>=0 && insertion>=left && insertion<=right+1);
 if(unchanged){if(include)members.insert(members.end(),moving.begin(),moving.end());}else{members=kept.empty()?selected:kept;if(!kept.empty() && include)members.insert(members.end(),moving.begin(),moving.end());}left=100000;right=-1;for(int i=0;i<int(reordered.size());++i)if(std::find(members.begin(),members.end(),reordered[i].id)!=members.end()){left=std::min(left,i);right=i;}if(right<0)continue;section.startFrameId=reordered[left].id;section.endFrameId=reordered[right].id;out.push_back(std::move(section));}return out;
}

LoopStep advanceLoopPlayback(const State& state,LoopPlayback& playback,const std::string& frameId){
 auto lookup=[&](const std::string& id)->const LoopSection*{for(const auto& section:state.loopSections)if(section.id==id)return &section;return nullptr;};
 const auto* section=lookup(playback.current.sectionId);if(!section)return {frameId,true};auto ids=loopPlaybackFrames(state,*section);if(ids.empty())return {frameId,true};
 int current=-1;for(int i=0;i<int(ids.size());++i)if(ids[i]==frameId && (!playback.current.position || i>=*playback.current.position)){current=i;break;}if(current<0)for(int i=0;i<int(ids.size());++i)if(ids[i]==frameId){current=i;break;}
 int next=current+1;bool completed=false;int iteration=playback.current.iteration;if(next>=int(ids.size())){++iteration;const auto repeats=playback.repeatIndefinitely?(playback.stack.empty()?std::optional<int>{}:std::optional<int>{1}):section->repeatCount;completed=repeats && iteration>=*repeats;next=completed?int(ids.size())-1:0;}
 const bool ping=section->direction=="ping-pong" || section->direction=="ping-pong-reverse";const auto nextPosition=ping?std::optional<int>{next}:std::optional<int>{};
 if(completed && !playback.stack.empty()){const auto parentContext=playback.stack.back();const auto* parent=lookup(parentContext.sectionId);if(!parent)return {frameId,true};const auto range=loopRange(state,*section),parentRange=loopRange(state,*parent);int parentLength=0;for(int i=parentRange.start;i<=parentRange.end;++i)if(!state.frames[i].disabled)++parentLength;const bool returning=parentContext.position.value_or(0)>=parentLength;const bool reverse=(parent->direction=="reverse" || parent->direction=="ping-pong-reverse")!=returning;playback.current=parentContext;playback.repeatIndefinitely=!parent->repeatCount;playback.stack.pop_back();return {state.frames[reverse?range.start:range.end].id,false};}
 if(completed)return {ids[next],true};
 const auto parentRange=loopRange(state,*section);const LoopSection* nested=nullptr;int span=parentRange.end-parentRange.start;for(const auto& candidate:state.loopSections){const auto range=loopRange(state,candidate);const auto at=std::find_if(state.frames.begin(),state.frames.end(),[&](const auto& f){return f.id==ids[next];})-state.frames.begin();if(candidate.id!=section->id && range.start>=parentRange.start && range.end<=parentRange.end && range.end-range.start<span && int(at)>=range.start && int(at)<=range.end){nested=&candidate;span=range.end-range.start;}}
 if(nested){auto first=loopPlaybackFrames(state,*nested);if(first.empty())return {frameId,false};playback.stack.push_back({section->id,iteration,nextPosition});playback.current={nested->id,0,{}};playback.repeatIndefinitely=!nested->repeatCount;return {first.front(),false};}
 playback.current.iteration=iteration;playback.current.position=nextPosition;return {ids[next],false};
}

}
