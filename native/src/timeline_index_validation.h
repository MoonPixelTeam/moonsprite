#pragma once
#include "timeline_model.h"
#include "layer_blend.h"
#include <cmath>
#include <limits>
#include <stdexcept>
#include <unordered_set>

namespace moon::timeline::index_detail {
inline void requireId(const std::string& id) {if(id.empty()) throw std::invalid_argument("Timeline ID must not be empty");}
inline void checkLayer(const Layer& layer) {
  requireId(layer.id);if(!layer.linkedContentId.empty()&&(!layer.kind.empty()||layer.background))throw std::invalid_argument("Special/background layers cannot share linked raster content");
  if(!parseLayerBlendMode(layer.blendMode))throw std::invalid_argument("Invalid layer blend mode");
  if(!std::isfinite(layer.opacity) || layer.opacity<0 || layer.opacity>1) throw std::invalid_argument("Invalid layer opacity");
}
inline void checkFrame(const Frame& frame) {
  requireId(frame.id);if(frame.duration<1) throw std::invalid_argument("Frame duration must be positive");
}
template<class Layers,class Frames> void checkCel(const Cel& cel,const Layers& layers,const Frames& frames) {
  requireId(cel.id);
  if(!layers.count(cel.layerId)) throw std::invalid_argument("Unknown cel layer: "+cel.layerId);
  if(!frames.count(cel.frameId)) throw std::invalid_argument("Unknown cel frame: "+cel.frameId);
  if(cel.opacity && (!std::isfinite(*cel.opacity) || *cel.opacity<0 || *cel.opacity>1)) throw std::invalid_argument("Invalid cel opacity");
  if(cel.surface) {
    const auto& surface=*cel.surface;
    if(surface.width<1 || surface.height<1) throw std::invalid_argument("Invalid cel surface dimensions");
    const auto width=std::size_t(surface.width),height=std::size_t(surface.height);
    if(width>std::numeric_limits<std::size_t>::max()/height || width*height!=surface.pixels.size())
      throw std::invalid_argument("Cel surface pixel count does not match dimensions");
  }
}
// One canonical cel validation sequence; callers choose owned indices or a
// temporary metadata view. Surface buffers are only observed, never copied.
template<class Get,class Layers,class Frames,class InsertCel,class InsertSlot>
void validateCels(std::size_t count,Get get,const Layers& layers,const Frames& frames,InsertCel insertCel,InsertSlot insertSlot){
 for(std::size_t i=0;i<count;++i){const auto& cel=get(i);checkCel(cel,layers,frames);
  if(!insertCel(cel.id,i))throw std::invalid_argument("Duplicate cel ID: "+cel.id);
  if(!insertSlot(cel.layerId,cel.frameId,i))throw std::invalid_argument("Duplicate layer/frame cel slot");
 }
}
template<class StateView,class Layers,class Frames,class Cels,class Slots>
void buildIndices(const StateView& state,Layers& layers,Frames& frames,Cels& cels,Slots& slots){
  for(std::size_t i=0;i<state.layers.size();++i) {
    const auto& layer=state.layers[i];checkLayer(layer);
    if(!layers.emplace(layer.id,i).second) throw std::invalid_argument("Duplicate layer ID: "+layer.id);
  }
  std::unordered_map<std::string,const Group*> groups;
  for(const auto& group:state.groups){requireId(group.id);if(layers.count(group.id)||!groups.emplace(group.id,&group).second)throw std::invalid_argument("Duplicate group/layer ID: "+group.id);if(!std::isfinite(group.opacity)||group.opacity<0||group.opacity>1||!parseLayerBlendMode(group.blendMode)||(group.panelOrder&&!std::isfinite(*group.panelOrder)))throw std::invalid_argument("Invalid group metadata");}
  std::unordered_set<std::string> verified;
  for(const auto& group:state.groups){std::unordered_set<std::string> path;const Group* current=&group;while(current&&!verified.count(current->id)){if(!path.insert(current->id).second)throw std::invalid_argument("Cyclic group parent");if(!current->parentGroupId)break;const auto parent=groups.find(*current->parentGroupId);if(parent==groups.end())throw std::invalid_argument("Unknown group parent");current=parent->second;}verified.insert(path.begin(),path.end());}
  for(const auto& layer:state.layers)if(layer.groupId&&!groups.count(*layer.groupId))throw std::invalid_argument("Unknown layer group");
  for(std::size_t i=0;i<state.frames.size();++i) {
    const auto& frame=state.frames[i];checkFrame(frame);
    if(!frames.emplace(frame.id,i).second) throw std::invalid_argument("Duplicate frame ID: "+frame.id);
  }
 validateCels(state.cels.size(),[&](std::size_t i)->const Cel&{return state.cels[i];},layers,frames,
  [&](const auto& id,std::size_t i){return cels.emplace(id,i).second;},
  [&](const auto& layer,const auto& frame,std::size_t i){return slots.emplace(std::make_pair(layer,frame),i).second;});
}
}
