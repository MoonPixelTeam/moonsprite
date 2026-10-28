// Legacy workspace-commands-layer-mask.ts; workspace-commands-animation-mask.ts.
#include "document.h"
#include "raster_geometry.h"
#include "layer_compositor.h"
#include "layer_panel_tree.h"
#include <algorithm>
#include <set>
#include <map>
namespace moon {
bool Document::canCreateLayerMasksForLayer(const std::string& owner)const{
 if(!timeline_.hasLayer(owner))return false;
 const auto& layer=timeline_.state().layers[timeline_.layerIndex(owner)];
 for(const auto& f:timeline_.state().frames){
  if(timeline::directMask(timeline_.state(),owner,f.id))continue;
  const auto* cel=timeline_.findCel(owner,f.id);
  if(layer.kind=="adjustment"||(cel&&timeline_.hasVisiblePixels(cel->id)))return true;
 }
 return false;
}
bool Document::createLayerMasksForLayer(const std::string& owner){
 if(!canCreateLayerMasksForLayer(owner)||layerEffectivelyLocked(timeline_.state().layers[timeline_.layerIndex(owner)]))return false;
 commitFloatingPaste();cancelGradient();cancelStroke();if(active())return false;
 auto masks=timeline_.state().masks;
 const auto& layer=timeline_.state().layers[timeline_.layerIndex(owner)];
 std::size_t bytes=0;constexpr std::size_t limit=256*1024*1024;
 for(const auto& m:masks)bytes+=m.mask.surface.pixels.size()*sizeof(Pixel);
 const std::size_t count=std::size_t(width_)*height_;
 for(const auto& f:timeline_.state().frames){
  if(timeline::directMask(timeline_.state(),owner,f.id))continue;
  const auto* cel=timeline_.findCel(owner,f.id);
  if(layer.kind!="adjustment"&&(!cel||!timeline_.hasVisiblePixels(cel->id)))continue;
  if(bytes>limit||count>(limit-bytes)/sizeof(Pixel))return false;
  timeline::MaskSlot slot;slot.ownerId=owner;slot.frameId=f.id;
  slot.mask.id="mask-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);
  slot.mask.surface.width=width_;slot.mask.surface.height=height_;slot.mask.surface.pixels.resize(count);
  masks.push_back(std::move(slot));bytes+=count*sizeof(Pixel);
 }
 if(masks.size()==timeline_.state().masks.size())return false;
 auto before=timeline_.state().masks;timeline_.state_.masks=std::move(masks);
 selectTimelineLayer(owner);activeMaskId_.clear();maskIsolated_=false;
 if(timeline::directMask(timeline_.state(),owner,activeFrameId_))selectAttachedMask(owner,activeFrameId_,false);
 return commitMasks(std::move(before),U"新建图层蒙版");
}
std::vector<Document::MaskPlacement> Document::mapAttachedMaskBlock(const std::vector<MaskSlotKey>& keys,const MaskSlotKey& anchor,const MaskSlotKey& target)const{
 // Legacy mapAnimationMaskBlock indexes the complete owner tree, not visible mask rows.
 const auto owners=buildLayerPanelTree(timeline_.state(),{});
 auto row=[&](const std::string& id){auto it=std::find_if(owners.begin(),owners.end(),[&](const auto& n){return n.id==id;});return it==owners.end()?-1:int(it-owners.begin());};
 const int ar=row(anchor.first),tr=row(target.first);if(ar<0||tr<0||!timeline_.hasFrame(anchor.second)||!timeline_.hasFrame(target.second))return {};
 const int delta=int(timeline_.frameIndex(target.second))-int(timeline_.frameIndex(anchor.second));std::vector<MaskPlacement> out;std::set<MaskSlotKey> used;
 for(const auto& key:keys){const int r=row(key.first);if(r<0||!timeline_.hasFrame(key.second))return {};const int dr=tr+r-ar,dc=int(timeline_.frameIndex(key.second))+delta;if(dr<0||dr>=int(owners.size())||dc<0||dc>=int(timeline_.state().frames.size()))return {};MaskSlotKey next{owners[dr].id,timeline_.state().frames[dc].id};if(!used.insert(next).second)return {};out.push_back({key,std::move(next)});}
 return out;
}
bool Document::copyAttachedMasks(const std::vector<MaskSlotKey>& keys,std::uint32_t sequence){
 std::vector<timeline::MaskSlot> copied;std::set<MaskSlotKey> seen;
 for(const auto& key:keys)if(seen.insert(key).second)if(const auto* mask=timeline::resolvedMask(timeline_.state(),key.first,key.second)){timeline::MaskSlot slot;slot.ownerId=key.first;slot.frameId=key.second;slot.group=findGroup(key.first)!=nullptr;slot.mask=*mask;slot.mask.linkedMaskId.clear();copied.push_back(std::move(slot));}
 const auto owners=buildLayerPanelTree(timeline_.state(),{});auto rank=[&](const auto& id){return std::find_if(owners.begin(),owners.end(),[&](const auto& n){return n.id==id;})-owners.begin();};
 std::sort(copied.begin(),copied.end(),[&](const auto& a,const auto& b){return rank(a.ownerId)!=rank(b.ownerId)?rank(a.ownerId)<rank(b.ownerId):timeline_.frameIndex(a.frameId)<timeline_.frameIndex(b.frameId);});
 maskClipboard_=std::move(copied);maskClipboardSequence_=sequence;return !maskClipboard_.empty();
}
Document::MaskTransferResult Document::moveAttachedMasks(const std::vector<MaskSlotKey>& keys,const MaskSlotKey& anchor,const MaskSlotKey& target){
 std::vector<timeline::MaskSlot> sources;std::vector<MaskSlotKey> independent;std::set<MaskSlotKey> seen;bool linked=false;
 for(const auto& key:keys)if(seen.insert(key).second)if(const auto* direct=timeline::directMask(timeline_.state(),key.first,key.second)){if(!direct->mask.linkedMaskId.empty())linked=true;else{sources.push_back(*direct);independent.push_back(key);}}
 if(linked){maskSelectionHistory_.slots=std::move(independent);++maskSelectionHistory_.serial;return MaskTransferResult::LinkedSelection;}
 return transferAttachedMasks(sources,keys,anchor,target,true);
}
Document::MaskTransferResult Document::pasteAttachedMasks(const std::vector<MaskSlotKey>& selection,const MaskSlotKey& target){
 if(maskClipboard_.empty())return MaskTransferResult::NoChange;
 const MaskSlotKey anchor{maskClipboard_.front().ownerId,maskClipboard_.front().frameId};return transferAttachedMasks(maskClipboard_,selection,anchor,target,false);
}
Document::MaskTransferResult Document::transferAttachedMasks(const std::vector<timeline::MaskSlot>& sources,const std::vector<MaskSlotKey>& selection,const MaskSlotKey& anchor,const MaskSlotKey& target,bool move){
 using R=MaskTransferResult;if(sources.empty())return R::NoChange;
 std::vector<MaskSlotKey> keys;for(const auto& source:sources)keys.push_back({source.ownerId,source.frameId});const auto placements=mapAttachedMaskBlock(keys,anchor,target);if(placements.empty())return R::Invalid;
 if(move&&std::all_of(placements.begin(),placements.end(),[](const auto& p){return p.source==p.target;}))return R::NoChange;
 for(const auto& p:placements){if(const auto* g=findGroup(p.target.first)){if(timeline::isGroupEffectivelyLocked(timeline_.state(),*g))return R::Locked;}else{const auto& layer=timeline_.state().layers[timeline_.layerIndex(p.target.first)];if(layerEffectivelyLocked(layer))return R::Locked;
   // Legacy only rejects empty destination cels for Paste, not Move.
   if(!move){const auto* c=timeline_.findCel(p.target.first,p.target.second);if(!c||!timeline_.hasVisiblePixels(c->id))return R::EmptyCel;}
  }}
 commitFloatingPaste();cancelGradient();cancelStroke();if(active())return R::Invalid;
 const auto& original=timeline_.state();auto after=original.masks;auto nextId=nextLayerId_;
 auto fresh=[&]{return "mask-native-"+std::to_string(identity_)+"-"+std::to_string(++nextId);};
 auto put=[&](timeline::MaskSlot slot){auto it=std::find_if(after.begin(),after.end(),[&](const auto& m){return m.ownerId==slot.ownerId&&m.frameId==slot.frameId;});if(it==after.end())after.push_back(std::move(slot));else *it=std::move(slot);};
 if(move)for(const auto& source:sources){auto white=source;white.mask.id=fresh();white.mask.linkedMaskId.clear();std::fill(white.mask.surface.pixels.begin(),white.mask.surface.pixels.end(),0xffffffff);put(std::move(white));}
 for(std::size_t i=0;i<placements.size();++i){auto dest=sources[i];dest.ownerId=placements[i].target.first;dest.frameId=placements[i].target.second;dest.group=findGroup(dest.ownerId)!=nullptr;if(!move){dest.mask.id=fresh();dest.mask.linkedMaskId.clear();}put(std::move(dest));}
 // Native identities may not dangle. Retain the existing delete/overwrite
 // adaptation: materialize references whose root was overwritten, from the
 // pre-edit resolved pixels. A moved root keeps its ID and its dependents.
 std::set<std::string> ids;for(const auto& m:after)ids.insert(m.mask.id);
 for(auto& m:after)if(!m.mask.linkedMaskId.empty()&&!ids.count(m.mask.linkedMaskId)){if(const auto* resolved=timeline::resolvedMask(original,m.ownerId,m.frameId)){const auto id=m.mask.id;m.mask=*resolved;m.mask.id=id;m.mask.linkedMaskId.clear();}}
 timeline::State validation;validation.layers=original.layers;validation.groups=original.groups;validation.frames=original.frames;validation.masks=after;timeline::validateMasks(validation);
 Edit edit{{},state_,nextState_};edit.beforeMasks=original.masks;edit.afterMasks=after;edit.beforeMaskSelection=selection;edit.afterMaskSelection=std::vector<MaskSlotKey>{};for(const auto& p:placements)edit.afterMaskSelection->push_back(p.target);
 edit.beforeFrame=activeFrameId_;edit.afterFrame=move?target.second:activeFrameId_;edit.beforeActive=activeLayerId_;edit.afterActive=move&&timeline_.hasLayer(target.first)?target.first:activeLayerId_;
 std::string nextActive=move&&ids.count(activeMaskId_)?activeMaskId_:std::string{};edit.maskContext=std::make_shared<Edit::MaskContextHistory>(Edit::MaskContextHistory{activeMaskId_,nextActive,maskIsolated_,!nextActive.empty()&&maskIsolated_});
 history_.reserve(position_+1);timeline_.state_.masks=std::move(after);nextLayerId_=nextId;activeFrameId_=edit.afterFrame;activeLayerId_=edit.afterActive;activeMaskId_=std::move(nextActive);if(activeMaskId_.empty())maskIsolated_=false;
 maskSelectionHistory_.slots=*edit.afterMaskSelection;++maskSelectionHistory_.serial;pushEdit(std::move(edit),move?U"移动图层蒙版单元格":U"粘贴图层蒙版单元格");change_={0,0,width_,height_};publishChange();return R::Done;
}
bool Document::setMaskMoveWithOwner(const std::string& owner,const std::string& frame,bool enabled){
 // Legacy animationMaskAt resolves linked masks before changing this property.
 const auto* resolved=timeline::resolvedMask(timeline_.state(),owner,frame);
 if(!resolved||resolved->moveWithOwner==enabled)return false;
 const auto id=resolved->id;cancelGradient();cancelStroke();
 auto before=timeline_.state().masks;
 for(auto& slot:timeline_.state_.masks)if(slot.mask.id==id){slot.mask.moveWithOwner=enabled;return commitMasks(std::move(before),U"切换图层蒙版绑定移动");}
 return false;
}
std::vector<Pixel> Document::maskDisplayRegion(PixelRegion r)const{std::vector<Pixel> out(std::size_t(r.w)*r.h,0xffffffff);const timeline::AttachedMask* mask=nullptr;for(const auto& m:timeline_.state().masks)if(m.mask.id==activeMaskId_)mask=&m.mask;if(const auto* preview=maskPreview())mask=preview;if(!mask)return out;for(int y=0;y<r.h;++y)for(int x=0;x<r.w;++x){const auto n=timeline::maskCoverage(raster::readWorld(mask->surface,r.x+x,r.y+y));out[std::size_t(y)*r.w+x]=0xff000000|n|(n<<8)|(n<<16);}return out;}

timeline::AttachedMask* Document::mutableActiveMask(){for(auto& v:timeline_.state_.masks)if(v.mask.id==activeMaskId_)return &v.mask;return nullptr;}
bool Document::maskBrushAvailable()const{for(const auto& v:timeline_.state().masks)if(v.mask.id==activeMaskId_){if(v.mask.locked)return false;if(v.group){for(const auto& g:timeline_.state().groups)if(g.id==v.ownerId)return timeline::isGroupEffectivelyVisible(timeline_.state(),g)&&!timeline::isGroupEffectivelyLocked(timeline_.state(),g);}else if(timeline_.hasLayer(v.ownerId)){const auto& l=timeline_.state().layers[timeline_.layerIndex(v.ownerId)];return layerEffectivelyVisible(l)&&!layerEffectivelyLocked(l);}}return false;}
void Document::exitAttachedMask(){commitFloatingPaste();cancelGradient();cancelStroke();activeMaskId_.clear();maskIsolated_=false;change_={0,0,width_,height_};publishChange();}
bool Document::selectAttachedMask(const std::string& owner,const std::string& frame,bool isolated){commitFloatingPaste();cancelGradient();cancelStroke();const auto* m=timeline::resolvedMask(timeline_.state(),owner,frame);if(!m||!timeline_.hasFrame(frame))return false;if(timeline_.hasLayer(owner))activeLayerId_=owner;activeFrameId_=frame;activeMaskId_=m->id;maskIsolated_=isolated;change_={0,0,width_,height_};publishChange();return true;}
bool Document::commitMasks(std::vector<timeline::MaskSlot> before,const std::u32string& label){timeline::validateMasks(timeline_.state());Edit e{{},state_,nextState_};if(!activeMaskId_.empty()&&std::none_of(before.begin(),before.end(),[&](const auto& slot){return slot.mask.id==activeMaskId_;}))e.maskToActivateOnRedo=activeMaskId_;e.beforeMasks=std::move(before);e.afterMasks=timeline_.state().masks;pushEdit(std::move(e),label);change_={0,0,width_,height_};publishChange();return true;}
bool Document::createAttachedMask(const std::string& owner,const std::string& frame,bool group){commitFloatingPaste();cancelGradient();cancelStroke();if(active()||!timeline_.hasFrame(frame))return false;bool valid=false;if(group){for(const auto& g:timeline_.state().groups)if(g.id==owner)valid=!timeline::isGroupEffectivelyLocked(timeline_.state(),g);}else if(timeline_.hasLayer(owner)){const auto& l=timeline_.state().layers[timeline_.layerIndex(owner)];valid=!layerEffectivelyLocked(l);const auto* c=timeline_.findCel(owner,frame);valid=valid&&c&&timeline_.hasVisiblePixels(c->id);}if(!valid)return false;if(timeline::directMask(timeline_.state(),owner,frame))return selectAttachedMask(owner,frame);std::size_t bytes=std::size_t(width_)*height_*4;for(const auto& m:timeline_.state().masks)bytes+=m.mask.surface.pixels.size()*4;if(bytes>256*1024*1024)return false;auto before=timeline_.state().masks;timeline::MaskSlot v;v.ownerId=owner;v.frameId=frame;v.group=group;v.mask.id="mask-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);v.mask.surface.width=width_;v.mask.surface.height=height_;v.mask.surface.pixels.resize(std::size_t(width_)*height_);timeline_.state_.masks.push_back(std::move(v));selectAttachedMask(owner,frame,false);return commitMasks(std::move(before),group?U"新建图层组蒙版":U"新建图层蒙版");}
bool Document::deleteAttachedMask(const std::string& owner,const std::string& frame){return removeAttachedMasks({{owner,frame}},false);}
bool Document::deleteAttachedMasks(const std::vector<std::pair<std::string,std::string>>& slots){return removeAttachedMasks(slots,true);}
bool Document::removeAttachedMasks(const std::vector<std::pair<std::string,std::string>>& slots,bool selected){
 std::set<std::string> removed;std::vector<std::pair<std::string,std::string>> targets;bool group=false;
 auto keys=slots;
 if(selected)for(const auto& slot:timeline_.state().masks)if(std::find(timelineSelection_.maskRows.begin(),timelineSelection_.maskRows.end(),slot.ownerId)!=timelineSelection_.maskRows.end())keys.emplace_back(slot.ownerId,slot.frameId);
 // Legacy deleteSelectedLayerMasks checks every owner before changing any slot.
 for(const auto& key:keys){const auto* slot=timeline::directMask(timeline_.state(),key.first,key.second);if(!slot||!removed.insert(slot->mask.id).second)continue;
  if(slot->group){const auto* owner=findGroup(slot->ownerId);if(!owner||timeline::isGroupEffectivelyLocked(timeline_.state(),*owner))return false;}
  else{if(!timeline_.hasLayer(slot->ownerId)||layerEffectivelyLocked(timeline_.state().layers[timeline_.layerIndex(slot->ownerId)]))return false;}
  group=slot->group;targets.push_back(key);
 }
 if(targets.empty())return false;
 cancelGradient();cancelStroke();
 auto after=timeline_.state().masks;
 // Native link IDs cannot dangle: materialize surviving dependents from the
 // original resolved source before removing any nodes in a linked chain.
 for(auto& slot:after)if(!removed.count(slot.mask.id)&&removed.count(slot.mask.linkedMaskId)){
  const auto* root=timeline::resolvedMask(timeline_.state(),slot.ownerId,slot.frameId);
  slot.mask.surface=root->surface;slot.mask.linkedMaskId.clear();
 }
 after.erase(std::remove_if(after.begin(),after.end(),[&](const auto& slot){return removed.count(slot.mask.id);}),after.end());
 timeline::State validation;validation.layers=timeline_.state().layers;validation.groups=timeline_.state().groups;validation.frames=timeline_.state().frames;validation.masks=after;timeline::validateMasks(validation);
 Edit edit{{},state_,nextState_};edit.beforeMasks=timeline_.state().masks;edit.afterMasks=after;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeActive=edit.afterActive=activeLayerId_;
 if(removed.count(activeMaskId_))edit.maskEditingOnUndo=std::make_pair(activeMaskId_,maskIsolated_);
 if(selected)edit.beforeMaskSelection=targets;
 if(selected&&!timelineSelection_.maskRows.empty()){
  edit.beforeMaskSelection=slots;edit.beforeTimelineSelection=timelineSelection_;
  auto selection=timelineSelection_;selection.maskRows.clear();edit.afterTimelineSelection=selection;
 }
 history_.reserve(position_+1);timeline_.state_.masks=std::move(after);
 if(edit.maskEditingOnUndo){activeMaskId_.clear();maskIsolated_=false;}
 if(selected){maskSelectionHistory_.slots.clear();++maskSelectionHistory_.serial;}
 if(edit.afterTimelineSelection)timelineSelection_=*edit.afterTimelineSelection;
 pushEdit(std::move(edit),!selected&&group?U"删除图层组蒙版":U"删除图层蒙版");
 change_={0,0,width_,height_};publishChange();return true;
}
bool Document::setAttachedMaskFlags(const std::string& owner,const std::string& frame,bool visible,bool locked,bool move,bool autoLink,const std::vector<MaskSlotKey>* selection){
 const auto* resolved=timeline::resolvedMask(timeline_.state(),owner,frame);if(!resolved)return false;
 if(resolved->visible==visible&&resolved->locked==locked&&resolved->moveWithOwner==move&&resolved->autoLinkAnimationCels==autoLink)return false;
 const auto id=resolved->id;const bool wasLocked=resolved->locked;cancelGradient();cancelStroke();auto after=timeline_.state().masks;
 auto it=std::find_if(after.begin(),after.end(),[&](const auto& slot){return slot.mask.id==id;});if(it==after.end())return false;
 it->mask.visible=visible;it->mask.locked=locked;it->mask.moveWithOwner=move;it->mask.autoLinkAnimationCels=autoLink;
 Edit edit{{},state_,nextState_};edit.beforeMasks=timeline_.state().masks;edit.afterMasks=after;
 const bool exitEditing=locked&&!wasLocked&&activeMaskId_==id;
 if(locked!=wasLocked||exitEditing){edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeActive=edit.afterActive=activeLayerId_;if(selection)edit.beforeMaskSelection=edit.afterMaskSelection=*selection;}
 if(exitEditing)edit.maskEditingOnUndo=std::make_pair(activeMaskId_,maskIsolated_);

 if(locked!=wasLocked)edit.maskContext=std::make_shared<Edit::MaskContextHistory>(Edit::MaskContextHistory{activeMaskId_,exitEditing?std::string{}:activeMaskId_,maskIsolated_,exitEditing?false:maskIsolated_});
 history_.reserve(position_+1);timeline_.state_.masks=std::move(after);if(exitEditing){activeMaskId_.clear();maskIsolated_=false;}
 pushEdit(std::move(edit),U"蒙版属性");change_={0,0,width_,height_};publishChange();return true;
}
bool Document::linkAttachedMasks(const std::vector<std::pair<std::string,std::string>>& slots,bool detach){
 cancelGradient();cancelStroke();
 const auto& original=timeline_.state();
 std::vector<std::pair<std::string,std::string>> selected;std::set<std::pair<std::string,std::string>> unique;
 std::map<std::string,std::set<std::size_t>> byOwner;
 for(const auto& key:slots){if((!timeline_.hasLayer(key.first)&&!findGroup(key.first))||!timeline_.hasFrame(key.second)||!unique.insert(key).second)continue;selected.push_back(key);byOwner[key.first].insert(timeline_.frameIndex(key.second));}
 if(selected.empty())return false;
 auto locked=[&](const std::string& owner){if(const auto* g=findGroup(owner))return timeline::isGroupEffectivelyLocked(original,*g);return layerEffectivelyLocked(original.layers[timeline_.layerIndex(owner)]);};
 auto after=original.masks;bool changed=false;
 if(detach){
  std::set<std::string> roots;for(const auto& key:selected)if(const auto* m=timeline::resolvedMask(original,key.first,key.second))roots.insert(m->id);
  std::vector<std::size_t> affected;
  for(std::size_t i=0;i<original.masks.size();++i){const auto& slot=original.masks[i];if(slot.mask.linkedMaskId.empty())continue;const auto* root=timeline::resolvedMask(original,slot.ownerId,slot.frameId);if(!unique.count({slot.ownerId,slot.frameId})&&!roots.count(root->id))continue;if(locked(slot.ownerId))return false;affected.push_back(i);}
  for(const auto i:affected){const auto& slot=original.masks[i];auto independent=*timeline::resolvedMask(original,slot.ownerId,slot.frameId);independent.id=slot.mask.id;independent.linkedMaskId.clear();after[i].mask=std::move(independent);changed=true;}
 }else{
  // Legacy animationLinkSlotKeys adds missing slots between selected endpoints,
  // while an existing, unselected intermediate mask stays independent.
  for(auto& owner:byOwner){auto& frames=owner.second;if(frames.size()<2)continue;const auto first=*frames.begin(),last=*frames.rbegin();for(auto i=first+1;i<last;++i)if(!timeline::directMask(original,owner.first,original.frames[i].id))frames.insert(i);
   const timeline::AttachedMask* source=nullptr;for(const auto i:frames)if((source=timeline::resolvedMask(original,owner.first,original.frames[i].id)))break;
   if(!source)continue;if(locked(owner.first))return false;
   for(const auto i:frames){const auto& frame=original.frames[i].id;auto it=std::find_if(after.begin(),after.end(),[&](const auto& slot){return slot.ownerId==owner.first&&slot.frameId==frame;});
    if(it==after.end()){timeline::MaskSlot slot;slot.ownerId=owner.first;slot.frameId=frame;slot.group=findGroup(owner.first)!=nullptr;slot.mask=*source;slot.mask.id="mask-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);slot.mask.linkedMaskId=source->id;after.push_back(std::move(slot));changed=true;}
    else if(it->mask.id!=source->id&&it->mask.linkedMaskId!=source->id){it->mask.linkedMaskId=source->id;changed=true;}
   }
  }
 }
 if(!changed)return false;
 timeline::State validation;validation.layers=original.layers;validation.groups=original.groups;validation.frames=original.frames;validation.masks=after;timeline::validateMasks(validation);
 Edit edit{{},state_,nextState_};edit.beforeMasks=timeline_.state().masks;edit.afterMasks=after;edit.beforeMaskSelection=edit.afterMaskSelection=selected;
 edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeActive=edit.afterActive=activeLayerId_;
 std::string editOwner=selectedGroupId_.value_or(activeLayerId_);const auto* edited=timeline::resolvedMask(timeline_.state(),editOwner,activeFrameId_);
 if(!edited||edited->id!=activeMaskId_){editOwner.clear();for(const auto& slot:original.masks)if(slot.mask.id==activeMaskId_){editOwner=slot.ownerId;break;}}
 std::string afterActive=activeMaskId_;if(!activeMaskId_.empty()&&!editOwner.empty())if(const auto* m=timeline::resolvedMask(validation,editOwner,activeFrameId_))afterActive=m->id;
 edit.maskContext=std::make_shared<Edit::MaskContextHistory>(Edit::MaskContextHistory{activeMaskId_,afterActive,maskIsolated_,maskIsolated_});
 history_.reserve(position_+1);timeline_.state_.masks=std::move(after);activeMaskId_=afterActive;
 maskSelectionHistory_.slots=selected;++maskSelectionHistory_.serial;
 pushEdit(std::move(edit),detach?U"断开蒙版链接":U"连接所选蒙版");change_={0,0,width_,height_};publishChange();return true;
}
}

namespace moon {
std::vector<Pixel> Document::attachedMaskCanvas(const timeline::Surface& surface)const{
 constexpr std::size_t limit=256*1024*1024;std::size_t used=0;auto account=[&](std::size_t count){if(count>(limit-used)/sizeof(Pixel))throw std::length_error("Mask tool exceeds document pixel budget");used+=count*sizeof(Pixel);};
 for(const auto& c:timeline_.state().cels)if(c.surface)account(c.surface->pixels.size());for(const auto& m:timeline_.state().masks){account(m.mask.surface.pixels.size());account(m.mask.surface.pixels.size());account(m.mask.surface.pixels.size());}account(std::size_t(width_)*height_);account(std::size_t(width_)*height_);
 std::vector<Pixel> out(std::size_t(width_)*height_);for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)out[std::size_t(y)*width_+x]=raster::readWorld(surface,x,y);return out;
}
bool Document::beginMaskPreview(Point seed,WandOptions options,bool shape){
 cancelGradient();if(!maskBrushAvailable()||(!shape&&(seed.x<0||seed.y<0||seed.x>=width_||seed.y>=height_||(selection_&&!selectionContains(selection_,seed.x,seed.y)))))return false;
 const auto* mask=mutableActiveMask();auto canvas=attachedMaskCanvas(mask->surface);options.gapClosing=false;std::optional<SelectionMask> region;
 if(!shape){const auto reference=options.visibleLayers?compositeNormalRegion(timeline_,frame().id,{0,0,width_,height_}):std::vector<Pixel>{};region=magicWandSelection(options.visibleLayers?reference:canvas,width_,height_,seed.x,seed.y,options);if(!region)return false;}
 GradientPreview pending{seed,cel().id,layer().id,frame().id,canvas,selection_,std::move(region),options,contentRevision_,shape};pending.mask=MaskPreviewBaseline{activeMaskId_,mask->surface,std::move(canvas),*mask};gradient_=std::move(pending);++gradientRevision_;return true;
}
bool Document::maskPreviewValid()const{return gradient_&&gradient_->mask&&gradient_->mask->id==activeMaskId_&&maskBrushAvailable();}
const std::vector<Pixel>& Document::previewBaseline()const{return gradient_->mask?gradient_->mask->canvas:gradient_->tilemap?gradient_->tilemapBaseline:pixels();}
void Document::publishMaskPreview(){if(!gradient_||!gradient_->mask)return;auto& baseline=*gradient_->mask;auto& mask=baseline.display;auto expanded=raster::expanded(mask.surface,{0,0,width_,height_});if(expanded)mask.surface=std::move(*expanded);auto dirty=baseline.previous;const auto next=gradientBounds();if(!next.empty()){dirty.include(next.x,next.y);dirty.include(next.x+next.w-1,next.y+next.h-1);}baseline.previous=next;for(int y=dirty.y;y<dirty.y+dirty.h;++y)for(int x=dirty.x;x<dirty.x+dirty.w;++x)mask.surface.pixels[*raster::worldIndex(mask.surface,x,y)]=gradient_->preview[std::size_t(y)*width_+x];}
bool Document::commitMaskPreview(){
 if(!maskPreviewValid()){cancelGradient();return false;}if(gradient_->preview==gradient_->mask->canvas){cancelGradient();return false;}auto before=timeline_.state().masks;mutableActiveMask()->surface=std::move(gradient_->mask->display.surface);const bool shape=gradient_->shape;gradient_.reset();++gradientRevision_;return commitMasks(std::move(before),shape?U"绘制蒙版形状":U"蒙版渐变");
}
bool Document::fillAttachedMask(Point point,Pixel color,WandOptions options,const PatternFillOptions* pattern){
 commitFloatingPaste();cancelStroke();cancelGradient();if(!maskBrushAvailable())return false;auto* mask=mutableActiveMask();auto canvas=attachedMaskCanvas(mask->surface);auto before=timeline_.state().masks;change_={};
 const auto seeds=symmetryHas(symmetryAxes)?symmetryPoints({point.x,point.y},width_,height_,symmetryAxes,symmetryCenter()):std::vector<SymmetryPixel>{{point.x,point.y}};
 bool changed=false;for(auto seed:seeds){Edit child{{},state_,nextState_};changed=(pattern?fillPatternCanvasAt(canvas,{seed.x,seed.y},color,*pattern,options,child):fillCanvasAt(canvas,{seed.x,seed.y},color,options,child))||changed;}
 if(!changed)return false;auto expanded=raster::expanded(mask->surface,{0,0,width_,height_});auto after=expanded?std::move(*expanded):mask->surface;for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)after.pixels[*raster::worldIndex(after,x,y)]=canvas[std::size_t(y)*width_+x];mask->surface=std::move(after);return commitMasks(std::move(before),options.contiguous?U"蒙版连续填充":U"蒙版不连续填充");
}
bool Document::fillAttachedMaskSelection(Pixel color){
 cancelStroke();cancelGradient();if(!maskBrushAvailable())return false;auto* mask=mutableActiveMask();auto canvas=attachedMaskCanvas(mask->surface);const auto normalized=timeline::normalizedMaskPixel(color);bool changed=false;for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)if(!selection_||selectionContains(selection_,x,y)){auto& p=canvas[std::size_t(y)*width_+x];changed|=p!=normalized;p=normalized;}if(!changed)return false;auto before=timeline_.state().masks;auto expanded=raster::expanded(mask->surface,{0,0,width_,height_});auto after=expanded?std::move(*expanded):mask->surface;for(int y=0;y<height_;++y)for(int x=0;x<width_;++x)after.pixels[*raster::worldIndex(after,x,y)]=canvas[std::size_t(y)*width_+x];mask->surface=std::move(after);return commitMasks(std::move(before),U"填充蒙版前景色");
}
}
