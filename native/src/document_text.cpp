#include "document.h"
#include "raster_geometry.h"
#include "layer_compositor.h"
#include <algorithm>
#include <set>
namespace moon {
namespace {
// canvas-input-text.ts invalidates both old and new text extents. Existing
// derived/style stacks retain full damage until their expansion is migrated.
PixelRegion textPreviewDamage(const timeline::State& state,const timeline::Surface* before,const timeline::Surface& after,int width,int height){
 for(const auto& layer:state.layers)if(layer.kind=="adjustment"||timeline::styleVisible(layer.layerStyles))return {0,0,width,height};
 if(!state.groups.empty())return {0,0,width,height};
 PixelRegion result;
 auto include=[&](const timeline::Surface& surface){
  const auto left=std::max<std::int64_t>(0,surface.offsetX),top=std::max<std::int64_t>(0,surface.offsetY);
  const auto right=std::min<std::int64_t>(width,std::int64_t(surface.offsetX)+surface.width),bottom=std::min<std::int64_t>(height,std::int64_t(surface.offsetY)+surface.height);
  if(right>left&&bottom>top){result.include(int(left),int(top));result.include(int(right-1),int(bottom-1));}
 };
 if(before)include(*before);include(after);return result;
}
}
bool Document::beginTextDraft(const TextCelData& raw,timeline::Surface surface,const std::string& id){if(layer().kind=="tilemap"||layer().kind=="free-tile")return false;
 if(textDraft_)cancelTextDraft();commitFloatingPaste();if(active())return false;raster::validate(surface);TextDraft draft;auto& e=draft.edit;e=Edit{{},state_,nextState_};if(id.empty())e.beforeTimeline=timeline_.state();e.beforeActive=activeLayerId_;e.beforeFrame=activeFrameId_;e.beforeTimelineSelection=timelineSelection_;e.beforeSelection=selectedFrames_;e.beforePalette=palette_;e.beforeGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};
 if(id.empty()){
  if(timeline_.state().layers.size()>=256)return false;DocumentLayer l;l.id="text-native-"+std::to_string(identity_)+"-"+std::to_string(++nextLayerId_);l.kind="text";l.name=U"文字";l.groupId=layer().groupId;auto& state=timeline_.state_;const auto at=timeline_.layerIndex(activeLayerId_);state.layers.insert(state.layers.begin()+at,l);for(const auto& frame:state.frames){DocumentCel c;c.id=l.id+"-"+frame.id;c.layerId=l.id;c.frameId=frame.id;c.surface=timeline::Surface{1,1,0,0,{},{},{0}};state.cels.push_back(std::move(c));}timeline_.buildIndex();activeLayerId_=l.id;draft.owner=timeline_.findCel(l.id,activeFrameId_)->id;draft.created=true;timelineSelection_.layers={l.id};timelineSelection_.cels={draft.owner};timelineSelection_.layerAnchor=l.id;selectedFrames_.clear();selectedGroupIds_.clear();selectedGroupId_.reset();
 }else{const auto* c=timeline_.findCelById(id);if(!c||timeline_.state().layers[timeline_.layerIndex(c->layerId)].kind!="text")return false;const auto& l=timeline_.state().layers[timeline_.layerIndex(c->layerId)];if(layerEffectivelyLocked(l)||!layerEffectivelyVisible(l))return false;const auto r=timeline_.resolveSurface(id);if(!r.source)return false;draft.owner=r.source->id;draft.originalSurface=*r.surface;draft.originalText=r.source->text;e.beforeTimeline.reset();activeLayerId_=c->layerId;activeFrameId_=c->frameId;}
 textDraft_=std::move(draft);try{return previewTextDraft(raw,std::move(surface));}catch(...){cancelTextDraft();throw;}
}
bool Document::previewTextDraft(const TextCelData& raw,timeline::Surface surface){
 if(!textDraft_)return false;raster::validate(surface);std::uint64_t bytes=surface.pixels.size()*4;for(const auto& c:timeline_.state().cels)if(c.surface)bytes+=c.surface->pixels.size()*4;if(textDraft_->edit.beforeTimeline)for(const auto& c:textDraft_->edit.beforeTimeline->cels)if(c.surface)bytes+=c.surface->pixels.size()*4;if(textDraft_->originalSurface)bytes+=textDraft_->originalSurface->pixels.size()*4;if(bytes>256ull*1024*1024)throw std::length_error("Text preview exceeds document pixel budget");auto data=normalizeTextCelData(raw);auto& owner=timeline_.state_.cels[timeline_.cels_.at(textDraft_->owner)];const auto damage=textPreviewDamage(timeline_.state(),owner.surface?&*owner.surface:nullptr,surface,width_,height_);owner.text=std::move(data);owner.surface=std::move(surface);if(textDraft_->created){auto units=owner.text->text;auto endLine=units.find(u'\n');if(endLine!=std::u16string::npos)units.resize(endLine);while(!units.empty()&&javascriptWhitespace(units.front()))units.erase(units.begin());while(!units.empty()&&javascriptWhitespace(units.back()))units.pop_back();if(units.size()>32)units.resize(32);auto name=textUtf32(units);const auto end=name.find(U'\n');if(end!=std::u32string::npos)name.resize(end);while(!name.empty()&&javascriptWhitespace(name.front()))name.erase(name.begin());while(!name.empty()&&javascriptWhitespace(name.back()))name.pop_back();if(name.size()>32)name.resize(32);timeline_.state_.layers[timeline_.layerIndex(owner.layerId)].name=name.empty()?U"文字":name;}timeline_.buildIndex();change_=damage.empty()?PixelRegion{0,0,width_,height_}:damage;publishChange();return true;
}
void Document::cancelTextDraft(){if(!textDraft_)return;auto draft=std::move(*textDraft_);auto e=std::move(draft.edit);textDraft_.reset();if(e.beforeTimeline)timeline_=timeline::Timeline(std::move(*e.beforeTimeline));else{auto& owner=timeline_.state_.cels[timeline_.cels_.at(draft.owner)];owner.surface=std::move(draft.originalSurface);owner.text=std::move(draft.originalText);timeline_.buildIndex();}activeLayerId_=e.beforeActive;activeFrameId_=e.beforeFrame;timelineSelection_=*e.beforeTimelineSelection;selectedFrames_=*e.beforeSelection;palette_=*e.beforePalette;applyGroupUi(e,false);change_={0,0,width_,height_};publishChange();}
bool Document::commitTextDraft(){if(!textDraft_)return false;auto draft=std::move(*textDraft_);textDraft_.reset();auto& e=draft.edit;if(draft.created)e.afterTimeline=timeline_.state();else{const auto* owner=timeline_.findCelById(draft.owner);e.surfaceChanges.push_back({draft.owner,std::move(*draft.originalSurface),*owner->surface});e.textChanges.push_back({draft.owner,std::move(draft.originalText),owner->text});}e.afterActive=activeLayerId_;e.afterFrame=activeFrameId_;e.afterTimelineSelection=timelineSelection_;e.afterSelection=selectedFrames_;e.afterPalette=palette_;e.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};pushEdit(std::move(e),draft.created?U"创建文字":U"编辑文字");return true;}
}
namespace moon {
bool Document::canRasterizeLayer(const std::string& id)const{
 if(!timeline_.hasLayer(id))return false;const auto& l=timeline_.state().layers[timeline_.layerIndex(id)];if(!l.kind.empty()&&l.kind!="text"&&l.kind!="free-tile")return false;
 const auto& s=l.layerStyles;const bool configured=s&&(s->gradientMapEnabled||s->overlayEnabled||s->gradientEnabled||s->stroke.enabled||s->shadow.enabled||s->innerGlow.enabled);
 return l.kind=="free-tile"||l.kind=="text"||l.background||!l.linkedContentId.empty()||configured;
}
bool Document::rasterizeLayer(const std::string& id){
 if(!canRasterizeLayer(id))return false;
 // Legacy retires a pending text creation/edit before conversion. Later cancel is a no-op.
 if(textDraft_){const auto* owner=timeline_.findCelById(textDraft_->owner);if(!owner||owner->layerId!=id)return false;commitTextDraft();}
 commitFloatingPaste();cancelStroke();cancelLayerOpacity();if(active())return false;
 if(timeline_.state().layers[timeline_.layerIndex(id)].kind=="free-tile"){
  constexpr std::size_t limit=256*1024*1024;std::size_t used=0;auto charge=[&](std::size_t n){if(n>(limit-used)/sizeof(Pixel))throw std::length_error("Free tile rasterization exceeds document pixel budget");used+=n*sizeof(Pixel);};for(const auto& c:timeline_.state().cels)if(c.surface)charge(c.surface->pixels.size()*3);for(const auto& m:timeline_.state().masks)charge(m.mask.surface.pixels.size()*3);for(const auto& set:timeline_.state().tilesets)charge(set.pixels.size()*3);
  auto next=timeline_.state();auto& owner=next.layers[timeline_.layerIndex(id)];const auto sources=*owner.freeTiles;owner.kind.clear();owner.freeTiles.reset();owner.autoLinkAnimationCels=false;
  for(auto& c:next.cels)if(c.layerId==id)c.freeTiles.reset();
  std::set<std::string> candidates;for(const auto& s:sources.sources)candidates.insert(s.tilesetId);if(!sources.legacyTilesetId.empty())candidates.insert(sources.legacyTilesetId);
  for(const auto& l:next.layers){candidates.erase(l.tilemapTilesetId);if(l.freeTiles){candidates.erase(l.freeTiles->legacyTilesetId);for(const auto& s:l.freeTiles->sources)candidates.erase(s.tilesetId);}}
  for(const auto& c:next.cels)if(c.tilemap)for(const auto& cell:c.tilemap->cells)if(cell)candidates.erase(cell->tilesetId);
  next.tilesets.erase(std::remove_if(next.tilesets.begin(),next.tilesets.end(),[&](const auto& s){return candidates.count(s.id);}),next.tilesets.end());
  Document staged(width_,height_);staged.timeline_=timeline::Timeline(std::move(next));staged.activeLayerId_=id;staged.activeFrameId_=activeFrameId_;
  if(staged.canRasterizeLayer(id))staged.rasterizeLayer(id);
  Edit e{{},state_,nextState_};e.beforeTimeline=timeline_.state();e.afterTimeline=std::move(staged.timeline_.state_);e.beforeActive=e.afterActive=activeLayerId_;e.beforeFrame=e.afterFrame=activeFrameId_;e.beforeTimelineSelection=e.afterTimelineSelection=timelineSelection_;e.beforeSelection=e.afterSelection=selectedFrames_;e.beforeGroupUi=e.afterGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};e.beforeTileSelection=tileSelection_;auto selected=tileSelection_;if(candidates.count(selected.tilesetId))selected={};e.afterTileSelection=selected;
  const auto afterMaskId=std::any_of(e.afterTimeline->masks.begin(),e.afterTimeline->masks.end(),[&](const auto& m){return m.mask.id==activeMaskId_;})?activeMaskId_:std::string{};
  e.maskContext=std::make_shared<Edit::MaskContextHistory>(Edit::MaskContextHistory{activeMaskId_,afterMaskId,maskIsolated_,!afterMaskId.empty()&&maskIsolated_});
  history_.reserve(position_+1);applyEdit(e,true);publishChange();pushEdit(std::move(e),U"转换为普通图层");return true;
 }
 Edit e{{},state_,nextState_};captureGroupEdit(e,false);captureGroupEdit(e,true);
 const auto original=timeline_.state().layers[timeline_.layerIndex(id)];
 const bool bake=timeline::styleVisible(original.layerStyles);
 if(bake){
  std::size_t used=0;constexpr std::size_t limit=64*1024*1024;auto charge=[&](std::size_t n){if(n>limit-used)throw std::length_error("Rasterized layer exceeds pixel memory budget");used+=n;};for(const auto& c:timeline_.state().cels)if(c.surface)charge(c.surface->pixels.size());for(const auto& m:timeline_.state().masks)charge(m.mask.surface.pixels.size());
  for(const auto& frame:timeline_.state().frames){const auto* slot=timeline_.findCel(id,frame.id);if(!slot)continue;const auto resolved=timeline_.resolveSurface(slot->id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.surface)throw std::invalid_argument("Cannot rasterize invalid cel link");const auto& source=*resolved.surface;
   int left=source.width,top=source.height,right=0,bottom=0;for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x)if(source.pixels[std::size_t(y)*source.width+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);}
   auto bounds=layerStyleOutputBounds(right>left?CompositeRegion{source.offsetX+left,source.offsetY+top,right-left,bottom-top}:CompositeRegion{source.offsetX,source.offsetY,1,1},original.layerStyles);
   const auto count=std::uint64_t(bounds.width)*bounds.height;if(count>limit)throw std::length_error("Rasterized layer bounds exceed pixel memory budget");charge(std::size_t(count));
   timeline::State isolated;isolated.canvasWidth=width_;isolated.canvasHeight=height_;auto metadata=original;metadata.visible=true;metadata.opacity=1;metadata.blendMode="normal";metadata.groupId.reset();metadata.clippingMask=false;metadata.linkedContentId.clear();isolated.layers={metadata};isolated.frames={frame};auto cel=*slot;cel.surface=source;cel.linkedCelId.reset();cel.runtimeSharedCelId.reset();cel.opacity=1;isolated.cels={cel};
   if(const auto* mask=timeline::resolvedMask(timeline_.state(),id,frame.id)){timeline::MaskSlot m;m.ownerId=id;m.frameId=frame.id;m.mask=*mask;m.mask.linkedMaskId.clear();isolated.masks.push_back(std::move(m));}
   timeline::Timeline preview(std::move(isolated));timeline::Surface out;out.width=bounds.width;out.height=bounds.height;out.offsetX=bounds.x;out.offsetY=bounds.y;out.pixels=compositeNormalRegion(preview,frame.id,bounds);auto after=*slot;after.surface=std::move(out);after.linkedCelId.reset();after.runtimeSharedCelId.reset();after.text.reset();e.beforeCels.push_back(*slot);e.afterCels.push_back(std::move(after));
  }
  auto& masks=e.afterLayerStructure->masks;masks.erase(std::remove_if(masks.begin(),masks.end(),[&](const auto& m){return !m.group&&m.ownerId==id;}),masks.end());
  if(std::any_of(e.beforeLayerStructure->masks.begin(),e.beforeLayerStructure->masks.end(),[&](const auto& m){return !m.group&&m.ownerId==id&&m.mask.id==activeMaskId_;}))e.maskContext=std::make_shared<Edit::MaskContextHistory>(Edit::MaskContextHistory{activeMaskId_,{},maskIsolated_,false});
 }else appendDetachLinkedLayer(e,id);
 for(auto& layer:e.afterLayerStructure->layers)if(layer.id==id){layer.kind.clear();layer.background.reset();layer.layerStyles.reset();layer.linkedContentId.clear();}
 for(const auto& cel:timeline_.state().cels)if(!bake&&cel.layerId==id&&cel.text)e.textChanges.push_back({cel.id,cel.text,{}});
 return commitGroupEdit(std::move(e),U"转换为普通图层");
}
}
