#include "document.h"
#include "outline_samples.h"
#include <unordered_set>
namespace moon {
Document::OutlineTask Document::captureOutlineTask(const OutlineSettings& settings,const std::vector<MaskSlotKey>& masks,bool boundary){
 commitFloatingPaste();cancelStroke();cancelColorAdjustment();
 std::uint64_t bytes=0;for(const auto& c:timeline_.state().cels)if(c.surface)bytes+=std::uint64_t(c.surface->pixels.size())*sizeof(Pixel);for(const auto& m:timeline_.state().masks)bytes+=std::uint64_t(m.mask.surface.pixels.size())*sizeof(Pixel);for(const auto& set:timeline_.state().tilesets)bytes+=std::uint64_t(set.pixels.size())*sizeof(Pixel);
 if(bytes>256ull*1024*1024/5)throw std::length_error("Outline preview exceeds working memory limit");
 auto draft=std::make_shared<Document>(1,1);draft->pixelFormat_=pixelFormat_;draft->width_=width_;draft->height_=height_;draft->timeline_=timeline_;draft->activeLayerId_=activeLayerId_;draft->activeFrameId_=activeFrameId_;draft->setSelectionValue(selection_);draft->timelineSelection_=timelineSelection_;draft->selectedFrames_=selectedFrames_;draft->selectedGroupIds_=selectedGroupIds_;draft->selectedGroupId_=selectedGroupId_;draft->activeMaskId_=activeMaskId_;draft->maskIsolated_=maskIsolated_;
 return {std::move(draft),identity_,revision_,settings,masks,boundary,false};
}
bool Document::runOutlineTask(OutlineTask& task,const std::function<bool()>& cancelled){
 if(!task.draft||(cancelled&&cancelled()))return false;
 task.changed=task.draft->outlinePixels(task.settings.sampling,task.settings.color,task.settings.smartHue,task.settings.darkness,task.settings.followOpacity,task.boundary,task.masks,cancelled);
 return !(cancelled&&cancelled());
}
bool Document::publishOutlineTask(const OutlineTask& task){
 if(!task.draft||task.identity!=identity_||task.revision!=revision_||task.draft->activeLayerId_!=activeLayerId_||task.draft->activeFrameId_!=activeFrameId_||task.draft->activeMaskId_!=activeMaskId_||!selectionEqual(task.draft->selection_,selection_))return false;
 AdjustmentPreview preview{timeline_,task.draft->timeline_,{},selection_,activeLayerId_,activeFrameId_,contentRevision_};preview.maskContext=activeMaskId_;adjustment_=std::move(preview);++gradientRevision_;return true;
}
bool Document::commitOutlineTask(OutlineTask&& task){
 if(!task.draft||!task.changed||task.identity!=identity_||task.revision!=revision_||task.draft->history_.empty()||task.draft->activeLayerId_!=activeLayerId_||task.draft->activeFrameId_!=activeFrameId_||task.draft->activeMaskId_!=activeMaskId_||!selectionEqual(task.draft->selection_,selection_))return false;
 auto edit=task.draft->history_.takeLatest();edit.beforeState=state_;edit.afterState=nextState_;reserveHistoryEntries();cancelColorAdjustment();change_={};applyEdit(edit,true);change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),task.boundary||task.settings.sampling.position==0?U"内部描边":task.settings.sampling.position==2?U"两侧描边":U"外部描边");if(!task.boundary)outlineSettings_=task.settings;return true;
}
bool Document::applyOutline(const OutlineSettings& settings,const std::vector<MaskSlotKey>& masks,bool boundary){
 if(!outlinePixels(settings.sampling,settings.color,settings.smartHue,settings.darkness,settings.followOpacity,boundary,masks))return false;
 if(!boundary)outlineSettings_=settings;
 return true;
}
bool Document::outlinePixels(const OutlineSampling& settings,Pixel color,bool smartHue,double darkness,bool followOpacity,bool boundary,const std::vector<MaskSlotKey>& maskSlots,const std::function<bool()>& cancelled){
 commitFloatingPaste();cancelStroke();if(boundary&&!selection_)return false;
 if(!std::isfinite(settings.thickness))throw std::invalid_argument("Invalid outline thickness");
 struct Target {std::string id;const timeline::Surface* surface;bool mask=false;};
 std::vector<Target> prepared;
 std::unordered_set<std::string> maskIds;
 auto collectMask=[&](const timeline::AttachedMask* mask){
  if(!mask)return true;
  const auto& state=timeline_.state();
  const auto slot=std::find_if(state.masks.begin(),state.masks.end(),[&](const auto& m){return m.mask.id==mask->id;});
  if(slot==state.masks.end()||mask->locked)return false;
  if(slot->group){const auto* group=findGroup(slot->ownerId);if(!group||timeline::isGroupEffectivelyLocked(state,*group))return false;}
  else if(!timeline_.hasLayer(slot->ownerId)||layerEffectivelyLocked(state.layers[timeline_.layerIndex(slot->ownerId)]))return false;
  if(maskIds.insert(mask->id).second)prepared.push_back({mask->id,&mask->surface,true});
  return true;
 };
 const bool masks=!maskSlots.empty()||!activeMaskId_.empty()||!timelineSelection_.maskRows.empty();
 if(!maskSlots.empty()){for(const auto& key:maskSlots)if(!collectMask(timeline::resolvedMask(timeline_.state(),key.first,key.second)))return false;}
 else if(!activeMaskId_.empty()){if(!collectMask(mutableActiveMask()))return false;}
 else if(!timelineSelection_.maskRows.empty()){
  for(const auto& slot:timeline_.state().masks)if(std::find(timelineSelection_.maskRows.begin(),timelineSelection_.maskRows.end(),slot.ownerId)!=timelineSelection_.maskRows.end()&&(selectedFrames_.empty()?slot.frameId==activeFrameId_:std::find(selectedFrames_.begin(),selectedFrames_.end(),slot.frameId)!=selectedFrames_.end()))
   if(!collectMask(timeline::resolvedMask(timeline_.state(),slot.ownerId,slot.frameId)))return false;
 }
 std::vector<const DocumentCel*> targets;const auto layers=selectedLayerIdsWithGroups();
 if(!masks&&!timelineSelection_.cels.empty()){for(const auto& id:timelineSelection_.cels)if(const auto* c=timeline_.findCelById(id))targets.push_back(c);}
 else if(!masks){const auto frames=selectedFrames_.empty()?std::vector<std::string>{activeFrameId_}:selectedFrames_;for(const auto& f:frames)for(const auto& l:timeline_.state().layers){
  if(!layers.empty()){if(std::find(layers.begin(),layers.end(),l.id)==layers.end())continue;}
  else if(selectedFrames_.empty()){if(l.id!=activeLayerId_)continue;}
  else if(layerEffectivelyLocked(l)||!layerEffectivelyVisible(l))continue;
  if(l.kind.empty())if(const auto* c=timeline_.findCel(l.id,f))targets.push_back(c);
 }}
 // Legacy collect excludes tile layers before checking the locks of the batch.
 targets.erase(std::remove_if(targets.begin(),targets.end(),[&](const auto* c){return !timeline_.state().layers[timeline_.layerIndex(c->layerId)].kind.empty();}),targets.end());
 for(const auto* c:targets){const auto& l=timeline_.state().layers[timeline_.layerIndex(c->layerId)];if(layerEffectivelyLocked(l))return false;}
 std::unordered_set<std::string> sources;
 for(const auto* target:targets){const auto resolved=timeline_.resolveSurface(target->id);if(resolved.issue!=timeline::LinkIssue::None)throw std::invalid_argument("Invalid outline target link");if(resolved.source&&resolved.surface&&sources.insert(timeline_.linkedStorageKey(resolved.source->id)).second)prepared.push_back({resolved.source->id,resolved.surface,false});}
 // Legacy single active boundary operation materializes a missing Cel; batch
 // frame proxies intentionally skip missing cells, as other effects do.
 std::optional<DocumentCel> created;
 if(!masks&&targets.empty()&&timelineSelection_.cels.empty()&&selectedFrames_.empty()&&layers.size()<=1&&!hasSelectedGroups()&&!timeline_.findCel(activeLayerId_,activeFrameId_)&&layer().kind.empty()&&!layerEffectivelyLocked(layer())){
  created.emplace();created->id="cel-"+activeLayerId_+"-"+activeFrameId_;for(std::size_t suffix=1;timeline_.findCelById(created->id);++suffix)created->id="cel-"+activeLayerId_+"-"+activeFrameId_+"-"+std::to_string(suffix);
  created->layerId=activeLayerId_;created->frameId=activeFrameId_;created->opacity=layer().opacity;
  timeline::Surface blank;blank.width=blank.height=1;blank.pixels.resize(1);created->surface=std::move(blank);prepared.push_back({created->id,&*created->surface,false});
 }
 if(prepared.empty())return false;
 constexpr std::uint64_t limit=256ull*1024*1024;std::uint64_t used=0;auto charge=[&](std::uint64_t bytes){if(bytes>limit-used)throw std::length_error("Outline exceeds working memory limit");used+=bytes;};
 for(const auto& c:timeline_.state().cels)if(c.surface)charge(std::uint64_t(c.surface->pixels.size())*sizeof(Pixel));for(const auto& set:timeline_.state().tilesets)charge(std::uint64_t(set.pixels.size())*sizeof(Pixel));
 for(const auto& slot:timeline_.state().masks)charge(std::uint64_t(slot.mask.surface.pixels.size())*sizeof(Pixel)*3);
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;bool maskChanged=false;std::vector<timeline::MaskSlot> afterMasks;if(masks)afterMasks=timeline_.state().masks;
 for(const auto& target:prepared){
 if(cancelled&&cancelled())return false;
 const auto& before=*target.surface;
 // Bound candidate storage before sampling; no live pixel mutation occurs here.
 const int radius=int(std::clamp(std::floor(settings.thickness+.5),1.,64.));const auto leftBound=std::max<std::int64_t>(0,std::int64_t(selection_?selection_->x:before.offsetX)-radius),topBound=std::max<std::int64_t>(0,std::int64_t(selection_?selection_->y:before.offsetY)-radius);const auto rightBound=std::min<std::int64_t>(width_,std::int64_t(selection_?selection_->x:before.offsetX)+(selection_?selection_->width:before.width)+radius),bottomBound=std::min<std::int64_t>(height_,std::int64_t(selection_?selection_->y:before.offsetY)+(selection_?selection_->height:before.height)+radius);
 const auto area=rightBound>leftBound&&bottomBound>topBound?std::uint64_t(rightBound-leftBound)*(bottomBound-topBound):0;charge(area*160);
 const auto samples=boundary?outlineBoundarySamples(before,width_,height_,selection_,settings,cancelled):outlineSamples(before,width_,height_,selection_,settings,cancelled);if(samples.empty()){used-=area*160;continue;}
 int left=width_,top=height_,right=0,bottom=0;for(const auto& sample:samples){const int x=int(sample.index%width_),y=int(sample.index/width_);left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);}
 charge(std::uint64_t(before.pixels.size())*sizeof(Pixel));const auto w=std::max<std::int64_t>(right,std::int64_t(before.offsetX)+before.width)-std::min(left,before.offsetX),h=std::max<std::int64_t>(bottom,std::int64_t(before.offsetY)+before.height)-std::min(top,before.offsetY);charge(std::uint64_t(w)*h*sizeof(Pixel)*3);
 auto expanded=raster::expanded(before,{left,top,right,bottom});auto after=expanded?std::move(*expanded):before;bool changed=false;
 for(const auto& sample:samples){const int x=int(sample.index%width_),y=int(sample.index/width_);const auto index=raster::worldIndex(after,x,y);if(!index)throw std::logic_error("Missing outline destination");auto stroke=outlineStrokeColor(color,sample.reference,smartHue,darkness,followOpacity);const auto original=raster::readWorld(before,x,y);auto value=(stroke>>24)==0?stroke:brushComposite(original,stroke,100);value=normalizeCanvasPacked(value,target.mask);changed|=value!=original;after.pixels[*index]=value;}
 if(changed){if(target.mask){for(auto& slot:afterMasks)if(slot.mask.id==target.id)slot.mask.surface=std::move(after);maskChanged=true;}else edit.contentHistory.surfaceChanges.push_back({target.id,before,std::move(after)});}used-=area*160;
 }
 if(cancelled&&cancelled())return false;
 if(edit.contentHistory.surfaceChanges.empty()&&!maskChanged)return false;
 if(maskChanged){edit.maskHistory.beforeMasks=timeline_.state().masks;edit.maskHistory.afterMasks=std::move(afterMasks);edit.maskHistory.maskContext=std::make_shared<MaskHistory::MaskContextHistory>(MaskHistory::MaskContextHistory{activeMaskId_,activeMaskId_,maskIsolated_,maskIsolated_});}
 if(created){
  charge(std::uint64_t(created->surface->pixels.size())*sizeof(Pixel));
  edit.snapshotHistory.beforeTimeline=timeline_.state();edit.snapshotHistory.beforeTimeline->cels.push_back(*created);auto state=timeline_.state();created->surface=std::move(edit.contentHistory.surfaceChanges.front().after);state.cels.push_back(std::move(*created));timeline::Timeline validation(state);edit.snapshotHistory.afterTimeline=std::move(state);edit.contentHistory.surfaceChanges.clear();
 }
 reserveHistoryEntries();change_={};applyEdit(edit,true);if(maskChanged||edit.snapshotHistory.beforeTimeline)change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),boundary||settings.position==0?U"内部描边":settings.position==2?U"两侧描边":U"外部描边");return true;
}
}
