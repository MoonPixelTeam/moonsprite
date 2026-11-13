#pragma once
#include "timeline_model.h"
#include "timeline_index_validation.h"
#include "document_history_frame_validation.h"
#include "cel_properties_targets.h"
#include <algorithm>
#include <stdexcept>
#include <string_view>
#include <unordered_set>
#include <vector>

namespace moon::history_targets {
inline timeline::Resolution requireSurfaceOwner(const timeline::Timeline& timeline,const std::string& id,bool canonical,const char* error){
 const auto r=timeline.resolveSurface(id);
 if(r.issue!=timeline::LinkIssue::None||!r.source||!r.surface||(canonical&&r.source->id!=id))throw std::logic_error(error);
 return r;
}
// Only invariant membership may be inspected against the initial live model.
// Structural siblings can create/remove/relink targets needed later in replay.
template<class Edit> bool hasStableTargets(const Edit& e){
 if(!std::holds_alternative<std::monostate>(e.terminalHistory))return false;
 const auto& s=e.snapshotHistory;const auto& l=e.layerHistory;const auto& f=e.frameHistory;const auto& c=e.contentHistory;const auto& t=e.tileHistory;
 if(s.beforeRollback||s.beforeTimeline||s.beforeDimensions||l.beforeLayerStructure||l.layerTilesets||t.freeTileSourceAddition||t.freeTileSourceDeletion||t.freeTileSourceReorder)return false;
 if(e.children.empty()){
  if(!l.beforeOrder.empty()||!l.afterOrder.empty()||l.detachedLayer||l.beforeAutoLink||l.afterAutoLink||!f.beforeFrames.empty()||!f.afterFrames.empty()||f.detachedFrame||!f.detachedFrames.empty()||c.detachedCel||!c.detachedCels.empty()||!c.beforeCels.empty()||!c.afterCels.empty())return false;
 }else for(const auto& child:e.children)if(!hasStableTargets(child))return false;
 return true;
}
struct LayerMembershipChanges {bool insert=false,remove=false;};
template<class Edit> LayerMembershipChanges layerChanges(const timeline::Timeline& timeline,const Edit& e,bool forward){
 LayerMembershipChanges changes;const auto& h=e.layerHistory;const auto& order=forward?h.afterOrder:h.beforeOrder;
 if(!order.empty()&&h.detachedLayer){const auto& id=h.detachedLayer->id;const bool want=std::find(order.begin(),order.end(),id)!=order.end(),exists=timeline.hasLayer(id);changes.insert=want&&!exists;changes.remove=!want&&exists;}
 return changes;
}
template<class Edit> void validateLayerReplay(const timeline::Timeline& timeline,const Edit& e,bool forward){
 const auto& h=e.layerHistory;if(h.targetLayerId.empty())return;bool exists=timeline.hasLayer(h.targetLayerId);
 if(h.detachedLayer&&h.detachedLayer->id==h.targetLayerId){const auto changes=layerChanges(timeline,e,forward);if(changes.insert)exists=true;else if(changes.remove)exists=false;}
 if(!exists)throw std::logic_error("Missing history layer");
}
template<class Values,class Exists> void requireCelTargets(const Values& values,Exists exists){
 for(const auto& value:values)if(!exists(value.id))throw std::logic_error("Missing history cel");
}
struct CelSlotViewHash {
 std::size_t operator()(const std::pair<std::string_view,std::string_view>& slot)const{
  const auto a=std::hash<std::string_view>{}(slot.first),b=std::hash<std::string_view>{}(slot.second);
  return a^(b+std::size_t(0x9e3779b9)+(a<<6)+(a>>2));
 }
};
template<class Range> std::unordered_set<std::string_view> identitySet(const Range& records){
 std::unordered_set<std::string_view> result;result.reserve(records.size());for(const auto& record:records)result.insert(record.id);return result;
}
template<class Values> void validateReplacementMetadata(std::vector<const timeline::Cel*>& projected,const Values& values,const std::unordered_set<std::string_view>& layers,const std::unordered_set<std::string_view>& frames){
 std::unordered_map<std::string_view,std::size_t> positions;positions.reserve(projected.size());for(std::size_t i=0;i<projected.size();++i)positions.emplace(projected[i]->id,i);
 // Final replacements retain the original ordered last-wins semantics. A
 // transient invalid record may be repaired by a later record for the same ID.
 for(const auto& value:values){const auto target=positions.find(value.id);if(target==positions.end())throw std::logic_error("Missing history cel");projected[target->second]=&value;}
 std::unordered_set<std::string_view> ids;std::unordered_set<std::pair<std::string_view,std::string_view>,CelSlotViewHash> slots;ids.reserve(projected.size());slots.reserve(projected.size());
 timeline::index_detail::validateCels(projected.size(),[&](std::size_t i)->const timeline::Cel&{return *projected[i];},layers,frames,
  [&](const auto& id,std::size_t){return ids.insert(id).second;},
  [&](const auto& layer,const auto& frame,std::size_t){return slots.emplace(layer,frame).second;});
}
template<class Values> void validateCurrentCelTargets(const timeline::Timeline& timeline,const Values& values){
 requireCelTargets(values,[&](const auto& id){return timeline.findCelById(id)!=nullptr;});if(values.empty())return;
 std::vector<const timeline::Cel*> projected;projected.reserve(timeline.state().cels.size());for(const auto& c:timeline.state().cels)projected.push_back(&c);
 validateReplacementMetadata(projected,values,identitySet(timeline.state().layers),identitySet(timeline.state().frames));
}
template<class Edit> void validateProjectedCelTargets(const timeline::Timeline& timeline,const Edit& e,bool forward){
 const auto& values=forward?e.contentHistory.afterCels:e.contentHistory.beforeCels;if(values.empty())return;
 const auto layer=layerChanges(timeline,e,forward);const auto frame=history_frames::membershipChanges(timeline,e,forward);
 if(!layer.insert&&!layer.remove&&!frame.singleInsert&&!frame.singleRemove&&!frame.batchInsert&&!frame.batchRemove){validateCurrentCelTargets(timeline,values);return;}
 // Metadata references exist only during this check. Never copy or retain cel
 // payloads, and never return live targets across activation/structural writes.
 std::vector<const timeline::Cel*> projected;projected.reserve(timeline.state().cels.size());for(const auto& c:timeline.state().cels)projected.push_back(&c);
 auto append=[&]{for(const auto& c:e.contentHistory.detachedCels)projected.push_back(&c);};
 if(layer.insert)append();else if(layer.remove){const auto& id=e.layerHistory.detachedLayer->id;projected.erase(std::remove_if(projected.begin(),projected.end(),[&](const auto* c){return c->layerId==id;}),projected.end());}
 if(frame.singleInsert)append();else if(frame.singleRemove){const auto& id=e.frameHistory.detachedFrame->id;projected.erase(std::remove_if(projected.begin(),projected.end(),[&](const auto* c){return c->frameId==id;}),projected.end());}
 if(frame.batchInsert){std::unordered_set<std::string_view> present;present.reserve(projected.size()+e.contentHistory.detachedCels.size());for(const auto* c:projected)present.insert(c->id);for(const auto& c:e.contentHistory.detachedCels)if(present.insert(c.id).second)projected.push_back(&c);}
 else if(frame.batchRemove){std::unordered_set<std::string_view> removed;for(const auto& f:e.frameHistory.detachedFrames)removed.insert(f.id);projected.erase(std::remove_if(projected.begin(),projected.end(),[&](const auto* c){return removed.count(c->frameId)!=0;}),projected.end());}
 auto layers=identitySet(timeline.state().layers),frames=identitySet(timeline.state().frames);
 if(layer.insert)layers.insert(e.layerHistory.detachedLayer->id);else if(layer.remove)layers.erase(e.layerHistory.detachedLayer->id);
 if(frame.singleInsert)frames.insert(e.frameHistory.detachedFrame->id);else if(frame.singleRemove)frames.erase(e.frameHistory.detachedFrame->id);
 if(frame.batchInsert)for(const auto& f:e.frameHistory.detachedFrames)frames.insert(f.id);else if(frame.batchRemove)for(const auto& f:e.frameHistory.detachedFrames)frames.erase(f.id);
 validateReplacementMetadata(projected,values,layers,frames);
}
template<class Edit> void validateLeafReplay(const timeline::Timeline& timeline,const Edit& e,bool forward){
 if(e.contentHistory.celProperties)cel_properties_detail::validateTargets(*e.contentHistory.celProperties,[&](const auto& id){return timeline.findCelById(id)!=nullptr;});
 validateLayerReplay(timeline,e,forward);validateProjectedCelTargets(timeline,e,forward);
}
template<class Edit> void validateStableTargets(const timeline::Timeline& timeline,const Edit& e,bool forward){
 if(!e.children.empty()){
  if(forward)for(const auto& child:e.children)validateStableTargets(timeline,child,true);
  else for(auto it=e.children.rbegin();it!=e.children.rend();++it)validateStableTargets(timeline,*it,false);
  return; // Parent leaf-only content fields are ignored by actual replay too.
 }
 history_frames::validateReplay(timeline,e,forward);validateLeafReplay(timeline,e,forward);
 if(!e.pixels.empty()||!e.contentHistory.runs.empty()||e.contentHistory.dense)requireSurfaceOwner(timeline,e.contentHistory.targetCelId,false,"Missing pixel history owner");
 for(const auto& c:e.contentHistory.ownerOffsets)requireSurfaceOwner(timeline,c.ownerId,true,"Invalid offset history owner");
 for(const auto& c:e.contentHistory.surfaceChanges)requireSurfaceOwner(timeline,c.ownerId,true,"Invalid convolution history owner");
}
}
