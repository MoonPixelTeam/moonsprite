#include "document.h"
#include "cel_properties.h"
#include "free_tile_source_transfer.h"
#include <algorithm>
#include <unordered_map>
#include <unordered_set>
#include <type_traits>
#include <string_view>

namespace moon {
namespace {
bool contains(const std::vector<std::string>& ids,const std::string& id){return std::find(ids.begin(),ids.end(),id)!=ids.end();}
void toggle(std::vector<std::string>& ids,const std::string& id){auto it=std::find(ids.begin(),ids.end(),id);if(it==ids.end())ids.push_back(id);else ids.erase(it);}
template<class T> int indexOf(const std::vector<T>& items,const std::string& id){auto it=std::find_if(items.begin(),items.end(),[&](const T& item){return item.id==id;});return it==items.end()?-1:int(it-items.begin());}
std::string_view selectionKey(const std::string& value){return value;}
std::pair<std::string_view,std::string_view> selectionKey(const AnimationSessionSelection::MaskSlot& value){return {value.first,value.second};}
std::pair<std::string_view,std::string_view> selectionKey(const AnimationCellSlot& value){return {value.rowId,value.frameId};}
struct SelectionKeyHash {
 std::size_t operator()(std::string_view value)const{return std::hash<std::string_view>{}(value);}
 std::size_t operator()(const std::pair<std::string_view,std::string_view>& value)const{const auto a=operator()(value.first),b=operator()(value.second);return a^(b+std::size_t(0x9e3779b9)+(a<<6)+(a>>2));}
};
}
// Ports workspace-commands-layer-selection's replace/toggle/range semantics.
void Document::clearAnimationItemSelection(){
 // workspace-animation-selection.ts::clearAnimationItemSelection deliberately
 // keeps selected layer/group rows and the current canvas selection.
 clearFrameSelection();timelineSelection_.cels.clear();timelineSelection_.celAnchor.clear();timelineSelection_.maskRows.clear();
 activeMaskId_.clear();maskIsolated_=false;
 if(animationChangeBinding_.captureSessionSelection(*this))animationChangeBinding_.restoreSessionSelection(*this,{});
}
Document::AnimationSelectionSnapshot Document::captureAnimationSelection()const{
 AnimationSelectionSnapshot snapshot;
 snapshot.identity=identity_;snapshot.selection=timelineSelection_;snapshot.frames=selectedFrames_;
 snapshot.groups=selectedGroupIds_;snapshot.groupFocus=selectedGroupId_;
 snapshot.activeLayer=activeLayerId_;snapshot.activeFrame=activeFrameId_;snapshot.frameAnchor=frameAnchor_;
 snapshot.activeMask=activeMaskId_;snapshot.maskIsolated=maskIsolated_;
 snapshot.sessionSelection=animationChangeBinding_.captureSessionSelection(*this);
 if(!activeMaskId_.empty())for(const auto& mask:timeline_.state().masks)if(mask.frameId==activeFrameId_){
  const auto* root=timeline::resolvedMask(timeline_.state(),mask.ownerId,mask.frameId);
  if(root&&root->id==activeMaskId_){snapshot.activeMaskSlot=MaskSlotKey{mask.ownerId,mask.frameId};break;}
 }
 return snapshot;
}
bool Document::restoreAnimationSelection(AnimationSelectionSnapshot snapshot){
 if(snapshot.identity!=identity_||!timeline_.hasLayer(snapshot.activeLayer)||!timeline_.hasFrame(snapshot.activeFrame))return false;
 // Prepare context projection without going through user commands. Restoring
 // selection must not settle a floating edit, publish content, or mark dirty.
 const bool frameChanged=activeFrameId_!=snapshot.activeFrame;
 auto geometry=displayedLayerGeometry_;std::vector<double> opacities;if(frameChanged)opacities.reserve(timeline_.state().layers.size());
 for(const auto& layer:timeline_.state().layers){
  if(const auto* cel=timeline_.findCel(layer.id,snapshot.activeFrame)){const auto resolved=timeline_.resolveSurface(cel->id);if(resolved.surface){const auto& surface=*resolved.surface;geometry[layer.id]={surface.width,surface.height,surface.offsetX,surface.offsetY};}}
  if(frameChanged)opacities.push_back(frameCelOpacity(timeline_,layer,snapshot.activeFrame));
 }
 bool mask=false;if(snapshot.activeMaskSlot){const auto* root=timeline::resolvedMask(timeline_.state(),snapshot.activeMaskSlot->first,snapshot.activeMaskSlot->second);mask=root&&root->id==snapshot.activeMask;}
 auto freeFrame=frameChanged?snapshot.activeFrame:std::string{};
 if(freeInstanceViewLayer_!=snapshot.activeLayer){freeInstanceViewLayer_.clear();freeInstanceSelected_.clear();freeInstancePrimary_.clear();freeInstanceAnchor_.clear();}
 if(frameChanged){freeInstanceSelected_.clear();freeInstancePrimary_.clear();freeInstanceAnchor_.clear();freeInstanceSelectionFrame_.swap(freeFrame);}
 timelineSelection_=std::move(snapshot.selection);selectedFrames_=std::move(snapshot.frames);selectedGroupIds_=std::move(snapshot.groups);selectedGroupId_=std::move(snapshot.groupFocus);
 activeLayerId_=std::move(snapshot.activeLayer);activeFrameId_=std::move(snapshot.activeFrame);frameAnchor_=std::move(snapshot.frameAnchor);
 activeMaskId_=mask?std::move(snapshot.activeMask):std::string{};maskIsolated_=mask&&snapshot.maskIsolated;displayedLayerGeometry_.swap(geometry);
 if(frameChanged){for(std::size_t i=0;i<opacities.size();++i)timeline_.state_.layers[i].opacity=opacities[i];change_={0,0,width_,height_};}
 if(snapshot.sessionSelection)animationChangeBinding_.restoreSessionSelection(*this,std::move(*snapshot.sessionSelection));
 return true;
}
Document::AnimationSelectionHistoryScope::AnimationSelectionHistoryScope(Document& document,bool normalize):document_(document),before_(document.captureAnimationSelection()),state_(document.state_),pushRevision_(document.historyPushRevision_),exceptions_(std::uncaught_exceptions()),normalize_(normalize){}
Document::AnimationSelectionHistoryScope::~AnimationSelectionHistoryScope()noexcept(false){if(std::uncaught_exceptions()==exceptions_)document_.finishAnimationSelectionHistory(*this);}
void Document::finishAnimationSelectionHistory(AnimationSelectionHistoryScope& scope){
 if(scope.before_.identity!=identity_||scope.pushRevision_==historyPushRevision_||!history_.position()||history_.position()!=history_.size()||history_.latest().beforeState!=scope.state_)return;
 if(scope.normalize_)normalizeAnimationSelection();
 auto after=captureAnimationSelection();
 history_.updateLatestApplied([&](Edit& entry){entry.beforeAnimationSelection=std::move(scope.before_);entry.afterAnimationSelection=std::move(after);entry.normalizeAnimationSelection|=scope.normalize_;});
 ++historyRevision_;const auto discarded=groupingHistory_?0:history_.enforceLimits();
 if(discarded)notifyHistoryChange(HistoryStackChange::Kind::Trim,{},discarded);
}
void Document::normalizeAnimationSelection(){
 auto value=captureAnimationSelection();const auto& state=timeline_.state();
 std::unordered_set<std::string_view> groupIds,maskOwners;groupIds.reserve(state.groups.size());maskOwners.reserve(state.masks.size());
 for(const auto& group:state.groups)groupIds.insert(group.id);
 for(const auto& mask:state.masks)maskOwners.insert(mask.ownerId);
 auto layer=[&](const std::string& id){return timeline_.hasLayer(id);};
 auto group=[&](const std::string& id){return groupIds.count(id)!=0;};
 auto frame=[&](const std::string& id){return timeline_.hasFrame(id);};
 auto owner=[&](const std::string& id){return layer(id)||group(id);};
 auto uniqueValid=[](auto& values,auto valid){using Value=typename std::decay_t<decltype(values)>::value_type;using Key=decltype(selectionKey(std::declval<const Value&>()));std::vector<Value> result;result.reserve(values.size());std::unordered_set<Key,SelectionKeyHash> seen;seen.reserve(values.size());for(const auto& item:values)if(valid(item)&&seen.insert(selectionKey(item)).second)result.push_back(item);values.swap(result);};
 uniqueValid(value.selection.layers,layer);uniqueValid(value.groups,group);uniqueValid(value.frames,frame);
 uniqueValid(value.selection.cels,[&](const auto& id){const auto* cel=timeline_.findCelById(id);return cel&&layer(cel->layerId)&&frame(cel->frameId);});
 uniqueValid(value.selection.maskRows,owner);
 if(value.sessionSelection){auto& session=*value.sessionSelection;
  uniqueValid(session.groups,[&](const auto& slot){return group(slot.rowId)&&frame(slot.frameId);});
  uniqueValid(session.masks,[&](const auto& slot){return owner(slot.first)&&frame(slot.second)&&maskOwners.count(slot.first);});
 }
 if(!layer(value.activeLayer))value.activeLayer=!value.selection.layers.empty()?value.selection.layers.back():state.layers.empty()?std::string{}:state.layers.back().id;
 if(!frame(value.activeFrame))value.activeFrame=state.frames.empty()?std::string{}:state.frames.front().id;
 if(!value.frames.empty()){
  value.selection.cels.clear();if(value.sessionSelection){value.sessionSelection->groups.clear();value.sessionSelection->masks.clear();}
 }else if(!value.selection.cels.empty()){
  value.selection.maskRows.clear();if(value.sessionSelection)value.sessionSelection->masks.clear();
 }else if(value.sessionSelection&&!value.sessionSelection->masks.empty()){
  value.selection.maskRows.clear();value.sessionSelection->groups.clear();
 }
 auto anchor=[](const auto& values,const std::string& previous){return std::find(values.begin(),values.end(),previous)!=values.end()?previous:values.empty()?std::string{}:values.back();};
 value.frameAnchor=anchor(value.frames,value.frameAnchor);value.selection.celAnchor=anchor(value.selection.cels,value.selection.celAnchor);
 if(value.sessionSelection){auto& session=*value.sessionSelection;
  if(!session.maskAnchor||std::find(session.masks.begin(),session.masks.end(),*session.maskAnchor)==session.masks.end())session.maskAnchor=session.masks.empty()?std::nullopt:std::optional<AnimationSessionSelection::MaskSlot>(session.masks.back());
  if(!session.groupAnchor||std::find(session.groups.begin(),session.groups.end(),*session.groupAnchor)==session.groups.end())session.groupAnchor=session.groups.empty()?std::nullopt:std::optional<AnimationCellSlot>(session.groups.back());
  session.frameSelection=!value.frames.empty();
 }
 if(value.groups.size()!=1||!value.groupFocus||std::find(value.groups.begin(),value.groups.end(),*value.groupFocus)==value.groups.end())value.groupFocus.reset();
 // Legacy stores the implicit editing target in selectedLayerIds separately
 // from layerSelectionExplicit. Native uses activeLayerId_ plus empty rows for
 // that state; synthesizing a row here would turn implicit focus into selection.
 if(!value.selection.layerAnchor.empty()&&!owner(value.selection.layerAnchor))value.selection.layerAnchor=!value.groups.empty()?value.groups.back():!value.selection.layers.empty()?value.selection.layers.back():value.activeLayer;
 if(!value.activeMask.empty()&&std::none_of(state.masks.begin(),state.masks.end(),[&](const auto& mask){return mask.mask.id==value.activeMask;})){value.activeMask.clear();value.activeMaskSlot.reset();value.maskIsolated=false;}
 // Native ordinary selections are cel identities, so an empty layer/frame slot
 // has no identity to retain. Existing empty group and mask slots remain values.
 restoreAnimationSelection(std::move(value));
}
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
 const auto* implicitSlot=timeline_.findCel(activeLayerId_,activeFrameId_);const auto implicit=implicitSlot?implicitSlot->id:std::string{};commitFloatingPaste();clearFrameSelection();timelineSelection_.maskRows.clear();
 auto& selected=timelineSelection_.cels;
 if(mode && selected.empty()&&!implicit.empty())selected.push_back(implicit);
 if(mode==1)toggle(selected,id);
 else if(mode==2){const auto* anchor=timeline_.findCelById(timelineSelection_.celAnchor.empty()?(selected.empty()?id:selected.back()):timelineSelection_.celAnchor);
  if(anchor){const auto& s=timeline_.state();const int r=int(timeline_.layerIndex(anchor->layerId)),t=int(timeline_.layerIndex(layerId)),c=int(timeline_.frameIndex(anchor->frameId)),d=int(timeline_.frameIndex(frameId));
   std::unordered_set<std::string> unique(selected.begin(),selected.end());
   for(int row=std::min(r,t);row<=std::max(r,t);++row)for(int col=std::min(c,d);col<=std::max(c,d);++col){const auto* slot=timeline_.findCel(s.layers[row].id,s.frames[col].id);if(!slot)continue;const auto& key=slot->id;if(unique.insert(key).second)selected.push_back(key);}}}
 else{timelineSelection_.layers.clear();timelineSelection_.layerAnchor.clear();selected.clear();std::unordered_set<std::string> unique;for(const auto& key:replacement)if(timeline_.findCelById(key) && unique.insert(key).second)selected.push_back(key);if(unique.insert(id).second)selected.push_back(id);}
 timelineSelection_.celAnchor=contains(selected,id)?id:selected.empty()?std::string{}:selected.back();
 const auto* focus=timeline_.findCelById(timelineSelection_.celAnchor);selectLayer(focus?focus->layerId:layerId);selectFrame(frameId);
}
void Document::moveTimelineCels(const std::string& anchorId,const std::string& targetId,bool copy){auto selectionHistory=trackAnimationSelectionHistory(false);
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();
 const auto* anchor=timeline_.findCelById(anchorId);const auto* target=timeline_.findCelById(targetId);if(!anchor || !target || timelineSelection_.cels.empty())return;
 const auto& s=timeline_.state();int dr=indexOf(s.layers,target->layerId)-int(timeline_.layerIndex(anchor->layerId)),dc=indexOf(s.frames,target->frameId)-int(timeline_.frameIndex(anchor->frameId));if(!dr && !dc)return;
 auto stagedLayers=s.layers;auto stagedSets=s.tilesets;FreeSourceTransferMap freeMappings;auto resourceCounter=nextTileId_;auto freshResource=[&](const char* prefix){return std::string(prefix)+std::to_string(identity_)+"-"+std::to_string(++resourceCounter);};
 struct Placement {DocumentCel source;std::string target;};std::vector<Placement> placements;
 for(const auto& id:timelineSelection_.cels){const auto* source=timeline_.findCelById(id);if(!source)return;const int row=indexOf(s.layers,source->layerId)+dr,col=indexOf(s.frames,source->frameId)+dc;if(row<0 || row>=int(s.layers.size()) || col<0 || col>=int(s.frames.size()))return;
  const auto& sourceLayer=s.layers[std::size_t(indexOf(s.layers,source->layerId))];const auto& targetLayer=s.layers[std::size_t(row)];
  if(sourceLayer.kind!=targetLayer.kind)return;
  if(layerEffectivelyLocked(targetLayer)||(!copy&&layerEffectivelyLocked(sourceLayer)))return;
  auto value=*source;const auto resolved=timeline_.resolveSurface(id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source)throw std::runtime_error("Invalid Cel drag source");value.tilemap=resolved.source->tilemap;value.freeTiles=resolved.source->freeTiles;if(value.freeTiles){if(!targetLayer.freeTiles)throw std::invalid_argument("Missing free tile drag target sources");transferFreeCelSources(stagedLayers,stagedSets,targetLayer.id,sourceLayer,s.tilesets,*value.freeTiles,freeMappings,freshResource);}value.text=resolved.source->text;value.opacity=resolved.source->opacity;value.zIndex=resolved.source->zIndex;value.surface=resolved.surface?std::optional<timeline::Surface>{*resolved.surface}:std::nullopt;placements.push_back({std::move(value),timeline_.findCel(s.layers[row].id,s.frames[col].id)->id});}
 Edit e{{},state_,nextState_};e.beforeTimelineSelection=timelineSelection_;e.beforeActive=activeLayerId_;e.beforeFrame=activeFrameId_;
 std::unordered_set<std::string> affected,mutated;for(const auto& p:placements){affected.insert(p.source.id);affected.insert(p.target);mutated.insert(p.target);if(!copy)mutated.insert(p.source.id);}
 // Shared surface objects in legacy outlive overwritten canonical slots. Keep
 // surviving linked siblings on an owned source before replacing any slot.
 for(const auto& c:s.cels)if(!affected.count(c.id)){const auto resolved=timeline_.resolveSurface(c.id);if(resolved.source && mutated.count(resolved.source->id))affected.insert(c.id);}
 for(const auto& c:s.cels)if(affected.count(c.id))e.contentHistory.beforeCels.push_back(c);
 auto after=e.contentHistory.beforeCels;
 auto mutableCel=[&](const std::string& id)->DocumentCel&{return *std::find_if(after.begin(),after.end(),[&](const auto& c){return c.id==id;});};
 std::unordered_map<std::string,std::string> survivors;
 for(auto& c:after){const bool slot=std::any_of(placements.begin(),placements.end(),[&](const auto& p){return p.target==c.id || (!copy && p.source.id==c.id);});if(slot)continue;const auto resolved=timeline_.resolveSurface(c.id);if(!resolved.source || !mutated.count(resolved.source->id))continue;
  c.freeTiles=resolved.source->freeTiles;c.tilemap=resolved.source->tilemap;c.text=resolved.source->text;c.opacity=resolved.source->opacity;c.zIndex=resolved.source->zIndex;
  const auto canonical=resolved.source->id;auto found=survivors.find(canonical);c.linkedCelId.reset();c.runtimeSharedCelId.reset();
  if(found==survivors.end()){c.surface=*resolved.surface;survivors[canonical]=c.id;}else{c.surface.reset();c.runtimeSharedCelId=found->second;}}
 if(!copy)for(const auto& p:placements){auto& original=mutableCel(p.source.id);original.surface=p.source.surface;if(original.surface)std::fill(original.surface->pixels.begin(),original.surface->pixels.end(),0);original.linkedCelId.reset();original.runtimeSharedCelId.reset();original.zIndex=0;original.text.reset();if(p.source.freeTiles)original.freeTiles=free_tiles::CelData{};if(original.tilemap)std::fill(original.tilemap->cells.begin(),original.tilemap->cells.end(),std::nullopt);}
 auto selected=timelineSelection_;selected.cels.clear();selected.celAnchor.clear();
 for(const auto& p:placements){auto& destination=mutableCel(p.target);destination.linkedCelId.reset();destination.runtimeSharedCelId.reset();destination.surface=p.source.surface;destination.opacity=p.source.opacity;destination.zIndex=p.source.zIndex;destination.tilemap=p.source.tilemap;destination.freeTiles=p.source.freeTiles;if(destination.freeTiles&&destination.surface){const auto& owner=stagedLayers[timeline_.layerIndex(destination.layerId)];destination.surface->pixels=free_tiles::render(*owner.freeTiles,*destination.freeTiles,stagedSets,destination.surface->width,destination.surface->height);}destination.text=p.source.text;selected.cels.push_back(destination.id);if(p.source.id==anchorId)selected.celAnchor=destination.id;}
 // A transferred free Cel block retains its internal link groups. Copies are
 // independent of the original group; cross-layer destinations have own roots.
 std::unordered_map<std::string,std::string> freeRoots;
 for(const auto& p:placements)if(p.source.freeTiles){auto& destination=mutableCel(p.target);const auto resolved=timeline_.resolveSurface(p.source.id);const auto key=destination.layerId+"/"+resolved.source->id;auto root=freeRoots.emplace(key,destination.id);if(!root.second){destination.linkedCelId=root.first->second;destination.surface.reset();}}
 // Validate the whole proposed state before publishing content or selection.
 if(std::any_of(placements.begin(),placements.end(),[](const auto& p){return p.source.tilemap.has_value()||p.source.text.has_value()||p.source.freeTiles.has_value();})){auto candidate=s;candidate.layers=stagedLayers;candidate.tilesets=stagedSets;for(const auto& value:after){auto it=std::find_if(candidate.cels.begin(),candidate.cels.end(),[&](const auto& c){return c.id==value.id;});*it=value;}
 timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("Cel drag creates invalid links");}
 const bool transferred=stagedSets.size()!=s.tilesets.size();
 std::optional<timeline::Timeline> transferredTimeline;
 if(transferred){auto candidate=s;candidate.layers=std::move(stagedLayers);candidate.tilesets=std::move(stagedSets);for(const auto& value:after){auto slot=std::find_if(candidate.cels.begin(),candidate.cels.end(),[&](const auto& c){return c.id==value.id;});*slot=value;}std::size_t pixels=0;for(const auto& texture:candidate.tilesets){if(texture.pixels.size()>64*1024*1024-pixels)throw std::length_error("Cel drag resource memory limit");pixels+=texture.pixels.size();}for(const auto& c:candidate.cels)if(c.surface){if(c.surface->pixels.size()>64*1024*1024-pixels)throw std::length_error("Cel drag memory limit");pixels+=c.surface->pixels.size();}transferredTimeline.emplace(std::move(candidate));if(!transferredTimeline->diagnoseLinks().empty())throw std::runtime_error("Cel drag transfer creates invalid links");e.snapshotHistory.beforeTimeline=s;e.snapshotHistory.afterTimeline=transferredTimeline->state();LayerTilesetHistory resources;for(std::size_t i=s.tilesets.size();i<transferredTimeline->state().tilesets.size();++i)resources.after.push_back({i,transferredTimeline->state().tilesets[i]});e.layerHistory.layerTilesets=std::make_shared<const LayerTilesetHistory>(std::move(resources));e.snapshotHistory.beforeTimeline->tilesets.clear();e.snapshotHistory.afterTimeline->tilesets.clear();e.contentHistory.beforeCels.clear();}
 reserveHistoryEntries();if(!transferred)e.contentHistory.afterCels=std::move(after);e.afterTimelineSelection=selected;e.afterActive=target->layerId;e.afterFrame=target->frameId;if(transferred){timeline_=std::move(*transferredTimeline);nextTileId_=resourceCounter;activeFrameId_=e.afterFrame;}else applyCelEdit(e,true);timelineSelection_=std::move(selected);activeLayerId_=e.afterActive;change_={0,0,width_,height_};publishChange();pushEdit(std::move(e));
}

void Document::copyTimelineFrames(const std::string& target,bool after){
 if(!timeline_.hasFrame(target))return;
 // Legacy duplicateAt captures the dragged frames directly, without replacing
 // either clipboard or temporarily moving a pasted block through the timeline.
 const auto clipboard=frameClipboard_;const auto metadata=frameClipboardMetadata_;const auto celClipboard=celClipboard_;
 try{if(copySelectedFrames()){
  auto snapshot=exportFrameClipboard();
  if(!hasFreeTileContent()&&!hasTilemapContent())for(auto& item:snapshot.items){for(auto& c:item.cels)c.linkedCelId.reset();for(auto& mask:item.masks)mask.mask.linkedMaskId.clear();}
  if(pasteTilemapFrames(snapshot,true,int(timeline_.frameIndex(target))+(after?1:0))){activeMaskId_.clear();maskIsolated_=false;}
 }}catch(...){frameClipboard_=clipboard;frameClipboardMetadata_=metadata;celClipboard_=celClipboard;throw;}
 frameClipboard_=clipboard;frameClipboardMetadata_=metadata;celClipboard_=celClipboard;
}
}
