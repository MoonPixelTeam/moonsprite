#include "document.h"
#include <algorithm>
#include <unordered_map>
#include <unordered_set>

namespace moon {
namespace {
bool contains(const std::vector<std::string>& ids,const std::string& id){return std::find(ids.begin(),ids.end(),id)!=ids.end();}
void toggle(std::vector<std::string>& ids,const std::string& id){auto it=std::find(ids.begin(),ids.end(),id);if(it==ids.end())ids.push_back(id);else ids.erase(it);}
template<class T> int indexOf(const std::vector<T>& items,const std::string& id){auto it=std::find_if(items.begin(),items.end(),[&](const T& item){return item.id==id;});return it==items.end()?-1:int(it-items.begin());}
}
// Ports workspace-commands-layer-selection's replace/toggle/range semantics.
void Document::selectTimelineLayer(const std::string& id,int mode){
 if(!timeline_.state().groups.empty()){selectTimelineRow({LayerPanelKind::Layer,id,0},mode);return;}
 selectedGroupIds_.clear();selectedGroupId_.reset();
 const auto& layers=timeline_.state().layers;if(!timeline_.hasLayer(id))return;const int end=int(timeline_.layerIndex(id));
 commitFloatingPaste();clearFrameSelection();timelineSelection_.maskRows.clear();timelineSelection_.cels.clear();timelineSelection_.celAnchor.clear();
 if(mode==2){int start=timeline_.hasLayer(timelineSelection_.layerAnchor)?int(timeline_.layerIndex(timelineSelection_.layerAnchor)):-1;if(start<0)start=int(activeLayerIndex());timelineSelection_.layers.clear();for(int i=std::min(start,end);i<=std::max(start,end);++i)timelineSelection_.layers.push_back(layers[i].id);}
 else{if(mode==1)toggle(timelineSelection_.layers,id);else timelineSelection_.layers={id};timelineSelection_.layerAnchor=id;}
 if(freeTileInstanceView())setFreeTileInstanceView(false);selectLayer(id);
}
// Cel range is additive; its anchor follows the last selected focus, as in legacy.
void Document::selectTimelineCel(const std::string& id,int mode,const std::vector<std::string>& replacement){
 const auto* target=timeline_.findCelById(id);if(!target)return;if(freeTileInstanceView())setFreeTileInstanceView(false);selectedGroupIds_.clear();selectedGroupId_.reset();const auto layerId=target->layerId,frameId=target->frameId;
 const auto implicit=cel().id;commitFloatingPaste();clearFrameSelection();timelineSelection_.maskRows.clear();
 auto& selected=timelineSelection_.cels;
 if(mode && selected.empty())selected.push_back(implicit);
 if(mode==1)toggle(selected,id);
 else if(mode==2){const auto* anchor=timeline_.findCelById(timelineSelection_.celAnchor.empty()?selected.back():timelineSelection_.celAnchor);
  if(anchor){const auto& s=timeline_.state();const int r=int(timeline_.layerIndex(anchor->layerId)),t=int(timeline_.layerIndex(layerId)),c=int(timeline_.frameIndex(anchor->frameId)),d=int(timeline_.frameIndex(frameId));
   std::unordered_set<std::string> unique(selected.begin(),selected.end());
   for(int row=std::min(r,t);row<=std::max(r,t);++row)for(int col=std::min(c,d);col<=std::max(c,d);++col){const auto key=timeline_.findCel(s.layers[row].id,s.frames[col].id)->id;if(unique.insert(key).second)selected.push_back(key);}}}
 else{timelineSelection_.layers.clear();timelineSelection_.layerAnchor.clear();selected.clear();std::unordered_set<std::string> unique;for(const auto& key:replacement)if(timeline_.findCelById(key) && unique.insert(key).second)selected.push_back(key);if(unique.insert(id).second)selected.push_back(id);}
 timelineSelection_.celAnchor=contains(selected,id)?id:selected.empty()?std::string{}:selected.back();
 const auto* focus=timeline_.findCelById(timelineSelection_.celAnchor);selectLayer(focus?focus->layerId:layerId);selectFrame(frameId);
}
void Document::moveTimelineCels(const std::string& anchorId,const std::string& targetId,bool copy){
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 const auto* anchor=timeline_.findCelById(anchorId);const auto* target=timeline_.findCelById(targetId);if(!anchor || !target || timelineSelection_.cels.empty())return;
 const auto& s=timeline_.state();int dr=indexOf(s.layers,target->layerId)-int(timeline_.layerIndex(anchor->layerId)),dc=indexOf(s.frames,target->frameId)-int(timeline_.frameIndex(anchor->frameId));if(!dr && !dc)return;
 struct Placement {DocumentCel source;std::string target;};std::vector<Placement> placements;
 for(const auto& id:timelineSelection_.cels){const auto* source=timeline_.findCelById(id);if(!source)return;const int row=indexOf(s.layers,source->layerId)+dr,col=indexOf(s.frames,source->frameId)+dc;if(row<0 || row>=int(s.layers.size()) || col<0 || col>=int(s.frames.size()))return;
  auto value=*source;const auto resolved=timeline_.resolveSurface(id);value.surface=resolved.surface?std::optional<timeline::Surface>{*resolved.surface}:std::nullopt;placements.push_back({std::move(value),timeline_.findCel(s.layers[row].id,s.frames[col].id)->id});}
 Edit e{{},state_,nextState_};e.beforeTimelineSelection=timelineSelection_;e.beforeActive=activeLayerId_;e.beforeFrame=activeFrameId_;
 std::unordered_set<std::string> affected,mutated;for(const auto& p:placements){affected.insert(p.source.id);affected.insert(p.target);mutated.insert(p.target);if(!copy)mutated.insert(p.source.id);}
 // Shared surface objects in legacy outlive overwritten canonical slots. Keep
 // surviving linked siblings on an owned source before replacing any slot.
 for(const auto& c:s.cels)if(!affected.count(c.id)){const auto resolved=timeline_.resolveSurface(c.id);if(resolved.source && mutated.count(resolved.source->id))affected.insert(c.id);}
 for(const auto& c:s.cels)if(affected.count(c.id))e.beforeCels.push_back(c);
 auto after=e.beforeCels;
 auto mutableCel=[&](const std::string& id)->DocumentCel&{return *std::find_if(after.begin(),after.end(),[&](const auto& c){return c.id==id;});};
 std::unordered_map<std::string,std::string> survivors;
 for(auto& c:after){const bool slot=std::any_of(placements.begin(),placements.end(),[&](const auto& p){return p.target==c.id || (!copy && p.source.id==c.id);});if(slot)continue;const auto resolved=timeline_.resolveSurface(c.id);if(!resolved.source || !mutated.count(resolved.source->id))continue;
  const auto canonical=resolved.source->id;auto found=survivors.find(canonical);c.linkedCelId.reset();c.runtimeSharedCelId.reset();
  if(found==survivors.end()){c.surface=*resolved.surface;survivors[canonical]=c.id;}else{c.surface.reset();c.runtimeSharedCelId=found->second;}}
 if(!copy)for(const auto& p:placements){auto& original=mutableCel(p.source.id);original.surface=p.source.surface;if(original.surface)std::fill(original.surface->pixels.begin(),original.surface->pixels.end(),0);original.linkedCelId.reset();original.runtimeSharedCelId.reset();original.zIndex=0;}
 timelineSelection_.cels.clear();
 for(const auto& p:placements){auto& destination=mutableCel(p.target);destination.linkedCelId.reset();destination.runtimeSharedCelId.reset();destination.surface=p.source.surface;destination.opacity=p.source.opacity;destination.zIndex=p.source.zIndex;timelineSelection_.cels.push_back(destination.id);if(p.source.id==anchorId)timelineSelection_.celAnchor=destination.id;}
 e.afterCels=std::move(after);e.afterTimelineSelection=timelineSelection_;e.afterActive=target->layerId;e.afterFrame=target->frameId;applyCelEdit(e,true);activeLayerId_=e.afterActive;change_={0,0,width_,height_};publishChange();pushEdit(std::move(e));
}

void Document::copyTimelineFrames(const std::string& target,bool after){
 const auto clipboard=frameClipboard_;const auto beforeActive=activeFrameId_;const auto beforeLayer=activeLayerId_;const auto beforeSelection=selectedFrames_;const auto anchor=frameAnchor_;const auto formal=timelineSelection_;const auto pos=position_;
 if(!copySelectedFrames())return;const auto oldGrouping=groupingHistory_;groupingHistory_=true;
 selectFrame(target);if(!after && activeFrameIndex()>0)selectFrame(timeline_.state().frames[activeFrameIndex()-1].id);
 if(pasteCopiedFrames(true)){moveSelectedFrames(target,after);groupingHistory_=oldGrouping;groupEdits(pos,beforeSelection);auto& edit=history_[position_-1];edit.beforeFrame=beforeActive;edit.beforeActive=beforeLayer;edit.afterFrame=activeFrameId_;edit.afterActive=activeLayerId_;edit.beforeFrameAnchor=anchor;edit.afterFrameAnchor=frameAnchor_;edit.beforeTimelineSelection=formal;edit.afterTimelineSelection=timelineSelection_;}
 else{groupingHistory_=oldGrouping;selectFrame(beforeActive);}
 frameClipboard_=clipboard;
}
}
