#include "timeline_model.h"
#include <cmath>
#include <limits>
#include <stdexcept>
#include <unordered_set>

namespace moon::timeline {
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
void Timeline::buildIndex() {
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
    if(state_.cels[target->second].layerId!=state_.cels[origin->second].layerId) return fallback(LinkIssue::CrossLayer,*cel.linkedCelId);
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
std::vector<LinkDiagnostic> Timeline::diagnoseLinks() const {
  std::vector<LinkDiagnostic> diagnostics;
  for(const auto& cel:state_.cels) {
    const auto result=resolveIndex(cel.id);
    if(result.issue!=LinkIssue::None) diagnostics.push_back({cel.id,result.issue,result.offendingId});
  }
  return diagnostics;
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
  owner.surface->pixels[localIndex]=color;
  return change;
}
LoopRange loopRange(const State& state,const LoopSection& section){LoopRange r;for(int i=0;i<int(state.frames.size());++i){if(state.frames[i].id==section.startFrameId)r.start=i;if(state.frames[i].id==section.endFrameId)r.end=i;}if(r.start>=0 && r.end>=0 && r.start>r.end)std::swap(r.start,r.end);return r;}
const LoopSection* loopAtFrame(const State& state,const std::string& frameId){int index=-1;for(int i=0;i<int(state.frames.size());++i)if(state.frames[i].id==frameId)index=i;const LoopSection* match=nullptr;int span=100000;for(const auto& s:state.loopSections){const auto r=loopRange(state,s);if(r.start>=0 && index>=r.start && index<=r.end && r.end-r.start<span){match=&s;span=r.end-r.start;}}return match;}
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
 if(completed && !playback.stack.empty()){const auto parentContext=playback.stack.back();const auto* parent=lookup(parentContext.sectionId);if(!parent)return {frameId,true};const auto range=loopRange(state,*section),parentRange=loopRange(state,*parent);int parentLength=0;for(int i=parentRange.start;i<=parentRange.end;++i)if(!state.frames[i].disabled)++parentLength;const bool returning=parentContext.position.value_or(0)>=parentLength;const bool reverse=(parent->direction=="reverse" || parent->direction=="ping-pong-reverse")!=returning;playback.current=parentContext;playback.stack.pop_back();return {state.frames[reverse?range.start:range.end].id,false};}
 if(completed)return {ids[next],true};
 const auto parentRange=loopRange(state,*section);const LoopSection* nested=nullptr;int span=parentRange.end-parentRange.start;for(const auto& candidate:state.loopSections){const auto range=loopRange(state,candidate);const auto at=std::find_if(state.frames.begin(),state.frames.end(),[&](const auto& f){return f.id==ids[next];})-state.frames.begin();if(candidate.id!=section->id && range.start>=parentRange.start && range.end<=parentRange.end && range.end-range.start<span && int(at)>=range.start && int(at)<=range.end){nested=&candidate;span=range.end-range.start;}}
 if(nested){auto first=loopPlaybackFrames(state,*nested);if(first.empty())return {frameId,false};playback.stack.push_back({section->id,iteration,nextPosition});playback.current={nested->id,0,{}};return {first.front(),false};}
 playback.current.iteration=iteration;playback.current.position=nextPosition;return {ids[next],false};
}

}
