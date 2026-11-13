#pragma once
#include "timeline_model.h"
#include <algorithm>
#include <stdexcept>
#include <string_view>
#include <unordered_set>

namespace moon::history_frames {
struct ReplayMembershipChanges {bool singleInsert=false,singleRemove=false,batchInsert=false,batchRemove=false;};
template<class Edit> ReplayMembershipChanges membershipChanges(const timeline::Timeline& timeline,const Edit& e,bool forward){
 ReplayMembershipChanges changes;const auto& h=e.frameHistory;const auto& order=forward?h.afterFrames:h.beforeFrames;if(order.empty())return changes;
 if(h.detachedFrame){const auto& id=h.detachedFrame->id;const bool want=std::find(order.begin(),order.end(),id)!=order.end();const bool exists=std::any_of(timeline.state().frames.begin(),timeline.state().frames.end(),[&](const auto& f){return f.id==id;});changes.singleInsert=want&&!exists;changes.singleRemove=!want&&exists;}
 if(!h.detachedFrames.empty()){changes.batchInsert=std::find(order.begin(),order.end(),h.detachedFrames.front().id)!=order.end();changes.batchRemove=!changes.batchInsert;}
 return changes;
}
// Read-only projection of frame membership; do not retain live pointers across
// pixel activation, which may settle an active gesture before final replay.
template<class Edit> void validateReplay(const timeline::Timeline& timeline,const Edit& e,bool forward){
 const auto& history=e.frameHistory;const auto& frames=timeline.state().frames;
 if(history.beforeScriptDurations){
  if(!history.afterScriptDurations)throw std::logic_error("Incomplete script duration history");
  const auto& values=*(forward?history.afterScriptDurations:history.beforeScriptDurations);
  if(values.size()!=frames.size())throw std::logic_error("Script duration history frame count changed");
  for(std::size_t i=0;i<values.size();++i)if(frames[i].id!=values[i].first)throw std::logic_error("Script duration history frame order changed");
 }
 const auto& order=forward?history.afterFrames:history.beforeFrames;
 const bool target=!history.targetFrameId.empty();
 if(target&&(!history.beforeDuration||!history.afterDuration))throw std::logic_error("Incomplete frame duration history");
 if(order.empty()||(!history.detachedFrame&&history.detachedFrames.empty())){
  if(target&&std::none_of(frames.begin(),frames.end(),[&](const auto& f){return f.id==history.targetFrameId;}))throw std::logic_error("Missing history frame");
  return;
 }
 // Preserve existing single-frame and batch insertion/removal decisions. Only
 // membership is projected: durations, cels and pixel storage are never copied.
 if(history.detachedFrames.empty()&&!target)return;
 std::unordered_set<std::string_view> desired(order.begin(),order.end()),projected;projected.reserve(frames.size()+history.detachedFrames.size()+1);
 for(const auto& f:frames)projected.insert(f.id);
 const auto changes=membershipChanges(timeline,e,forward);
 if(changes.singleInsert)projected.insert(history.detachedFrame->id);else if(changes.singleRemove)projected.erase(history.detachedFrame->id);
 if(!history.detachedFrames.empty()){
  const bool want=changes.batchInsert;
  for(const auto& f:history.detachedFrames){if(want)projected.insert(f.id);else projected.erase(f.id);}
  // The original batch sort uses orderIndex.at for every retained frame.
  if(projected.size()>1)for(const auto& id:projected)if(!desired.count(id))throw std::logic_error("Incomplete history frame order");
 }
 if(target&&!projected.count(history.targetFrameId))throw std::logic_error("Missing history frame");
}
}
