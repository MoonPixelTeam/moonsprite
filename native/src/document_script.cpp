#include "lua_script_result.h"
#include "raster_geometry.h"
#include <unordered_set>
#include <set>
#include <stdexcept>
#include <cmath>
namespace moon {
struct ScriptDocumentBuilder {
 static Document build(const script::CreatedDocument& value){
  if(value.colorMode!="rgba")throw std::invalid_argument("Native Lua document color mode is not yet supported");
  if(value.name.empty()||value.width<1||value.height<1||std::uint64_t(value.width)*value.height>script::InvocationCapture::maxImagePixels||value.layers.empty())throw std::invalid_argument("Invalid Lua created document");
  constexpr std::uint64_t limit=256ull*1024*1024;std::uint64_t bytes=std::uint64_t(value.width)*value.height*sizeof(Pixel);std::size_t frames=1;std::unordered_set<std::string> ids;
  for(const auto& l:value.layers){const auto& s=l.surface;if(l.id.empty()||l.name.empty()||!ids.insert(l.id).second||l.opacity<0||l.opacity>255||!std::isfinite(l.frameNumber)||l.frameNumber<1||std::floor(l.frameNumber)!=l.frameNumber||l.frameNumber>double(limit/sizeof(DocumentFrame))||!s.pixels||s.width<1||s.height<1||std::uint64_t(s.width)*s.height!=s.pixels->size()||s.pixels->size()>script::InvocationCapture::maxImagePixels)throw std::invalid_argument("Invalid Lua created document layer");
   raster::coordinate(std::int64_t(s.x)+s.width);raster::coordinate(std::int64_t(s.y)+s.height);frames=std::max(frames,std::size_t(l.frameNumber));const auto n=s.pixels->size()*sizeof(Pixel);if(n>limit-bytes)throw std::length_error("Lua created document exceeds native budget");bytes+=n;
  }
  if(frames>(limit-bytes)/(sizeof(DocumentFrame)+64))throw std::length_error("Lua created document frame metadata exceeds native budget");
  // Native constructor supplies IDs/statistics/role colors; replace its default
  // bitmap with the exact sparse per-frame result, no creation undo entries.
  Document d(value.width,value.height);timeline::State state;state.canvasWidth=value.width;state.canvasHeight=value.height;
  for(std::size_t i=0;i<frames;++i)state.frames.push_back({"frame-"+std::to_string(i+1),100,false});
  for(const auto& l:value.layers){DocumentLayer layer;layer.id=l.id;layer.name=l.name;layer.opacity=l.opacity/255.;layer.visible=l.visible;layer.locked=l.locked;layer.groupId=l.parentGroupId;state.layers.push_back(std::move(layer));
   timeline::Surface s;s.width=l.surface.width;s.height=l.surface.height;s.offsetX=l.surface.x;s.offsetY=l.surface.y;s.storageOriginX=s.storageOriginY=0;s.pixels=*l.surface.pixels;
   DocumentCel c;c.id="script-cel-"+std::to_string(d.identity_)+"-"+std::to_string(state.cels.size()+1);c.layerId=l.id;c.frameId=state.frames[std::size_t(l.frameNumber)-1].id;c.opacity=l.opacity/255.;c.surface=std::move(s);state.cels.push_back(std::move(c));
   d.displayedLayerGeometry_[l.id]={l.surface.width,l.surface.height,l.surface.x,l.surface.y};
  }
  std::reverse(state.layers.begin(),state.layers.end()); // legacy bottom-to-top -> native top-to-bottom.
  timeline::Timeline checked(std::move(state));d.timeline_=std::move(checked);d.activeLayerId_=value.layers.back().id;d.activeFrameId_=d.timeline_.state().frames.front().id;d.name_=value.name;d.projectId_="doc-script-"+std::to_string(d.identity_);d.modified_=true;d.projectActiveCelOpacities();return d;
 }
};
namespace script {Document buildCreatedDocument(const CreatedDocument& value){return ScriptDocumentBuilder::build(value);}}
void Document::commitScriptCreatedLayer(const script::CreatedLayer& value,std::u32string label){
 if(active())throw std::logic_error("Finish active edit before script layer creation");
 const auto& s=value.surface;
 if(value.id.empty()||value.name.empty()||timeline_.hasLayer(value.id)||value.opacity<0||value.opacity>255||(value.stackIndex&&!*value.stackIndex)||!std::isfinite(value.frameNumber)||value.frameNumber<1||std::floor(value.frameNumber)!=value.frameNumber||!s.pixels||s.width<1||s.height<1||std::uint64_t(s.width)*s.height!=s.pixels->size()||s.pixels->size()>script::InvocationCapture::maxImagePixels)throw std::invalid_argument("Invalid Lua created layer");
 raster::coordinate(std::int64_t(s.x)+s.width);raster::coordinate(std::int64_t(s.y)+s.height);
 // Candidate construction uses the existing native structural transaction.
 // Admit live+candidate+history surface before making any full-state copy.
 constexpr std::uint64_t limit=256ull*1024*1024;std::uint64_t used=0;
 auto admit=[&](std::uint64_t bytes){if(bytes>limit-used)throw std::length_error("Lua layer creation exceeds native working budget");used+=bytes;};
 for(const auto& c:timeline_.state().cels)if(c.surface)admit(c.surface->pixels.size()*sizeof(Pixel)*2ull);
 for(const auto& m:timeline_.state().masks)admit(m.mask.surface.pixels.size()*sizeof(Pixel)*2ull);
 for(const auto& set:timeline_.state().tilesets)admit(set.pixels.size()*sizeof(Pixel)*2ull);
 admit(s.pixels->size()*sizeof(Pixel)*3ull);
 const auto& frames=timeline_.state().frames;const auto frameIndex=value.frameNumber<=frames.size()?std::size_t(value.frameNumber)-1:0;
 const auto frameId=frames.at(frameIndex).id;
 const auto size=timeline_.state().layers.size();const auto legacyIndex=value.stackIndex?std::min(*value.stackIndex-1,size):size;const auto index=size-legacyIndex;
 DocumentLayer layer;layer.id=value.id;layer.name=value.name;layer.opacity=value.opacity/255.;layer.visible=value.visible;layer.locked=value.locked;layer.groupId=value.parentGroupId;
 timeline::Surface surface;surface.width=s.width;surface.height=s.height;surface.offsetX=s.x;surface.offsetY=s.y;surface.storageOriginX=surface.storageOriginY=0;surface.pixels=*s.pixels;
 DocumentCel c;c.id="cel-"+value.id+"-"+frameId;for(std::size_t suffix=1;timeline_.findCelById(c.id);++suffix)c.id="cel-"+value.id+"-"+frameId+"-"+std::to_string(suffix);c.layerId=layer.id;c.frameId=frameId;c.opacity=layer.opacity;c.surface=std::move(surface);
 Edit edit{{},state_,nextState_};edit.beforeFrame=activeFrameId_;edit.afterFrame=frameId;edit.beforeActive=activeLayerId_;edit.afterActive=layer.id;for(const auto& l:timeline_.state().layers)edit.beforeOrder.push_back(l.id);edit.afterOrder=edit.beforeOrder;edit.afterOrder.insert(edit.afterOrder.begin()+index,layer.id);edit.detachedLayer=layer;edit.detachedCels.push_back(c);
 edit.beforeGroupUi=GroupUiSnapshot{selectedGroupIds_,collapsedGroupIds_,selectedGroupId_};edit.afterGroupUi=GroupUiSnapshot{{},collapsedGroupIds_,{}};
 edit.beforeTimelineSelection=timelineSelection_;auto selected=timelineSelection_;selected.layers={layer.id};selected.layerAnchor=layer.id;edit.afterTimelineSelection=selected;
 auto next=timeline_.state();next.layers.insert(next.layers.begin()+index,std::move(layer));next.cels.push_back(std::move(c));timeline::Timeline prepared(std::move(next));
 reserveHistoryEntries();auto beforeLayer=activeLayerId_,beforeFrame=activeFrameId_;auto oldSelection=timelineSelection_;auto oldGroups=selectedGroupIds_;auto oldGroup=selectedGroupId_;auto nextLayer=edit.afterActive,nextFrame=edit.afterFrame;std::swap(timeline_,prepared);activeLayerId_=std::move(nextLayer);activeFrameId_=std::move(nextFrame);selectedGroupIds_.clear();selectedGroupId_.reset();timelineSelection_=std::move(selected);
 const auto oldRevision=revision_;
 try{pushEdit(std::move(edit),label.empty()?U"脚本":std::move(label));}
 catch(...){if(revision_==oldRevision){std::swap(timeline_,prepared);activeLayerId_=std::move(beforeLayer);activeFrameId_=std::move(beforeFrame);timelineSelection_=std::move(oldSelection);selectedGroupIds_=std::move(oldGroups);selectedGroupId_=std::move(oldGroup);}change_={0,0,width_,height_};publishChange();throw;}
 change_={0,0,width_,height_};publishChange();
}
bool Document::commitScriptRasterBatch(const script::RasterBatch& batch){
 if(active()||!activeMaskId_.empty()||!layer().kind.empty()||layerEffectivelyLocked(layer()))throw std::logic_error("Lua raster target is not editable");
 const auto& expected=batch.before;
 auto validate=[](const script::SurfaceSnapshot& s){if(s.width<1||s.height<1||!s.pixels||std::uint64_t(s.width)*s.height!=s.pixels->size()||s.pixels->size()>script::InvocationCapture::maxImagePixels)throw std::invalid_argument("Invalid Lua raster snapshot");raster::coordinate(std::int64_t(s.x)+s.width);raster::coordinate(std::int64_t(s.y)+s.height);};
 validate(expected);if(batch.after)validate(*batch.after);
 const auto* slot=timeline_.findCel(layer().id,frame().id);const auto resolved=slot?timeline_.resolveSurface(slot->id):timeline::Resolution{};
 const auto* current=resolved.surface;
 if(slot&&(!current||!resolved.source||resolved.issue!=timeline::LinkIssue::None))throw std::logic_error("Invalid Lua raster owner");
 if(current){raster::validate(*current);if(expected.width!=current->width||expected.height!=current->height||expected.x!=current->offsetX||expected.y!=current->offsetY||current->pixels!=*expected.pixels)throw std::logic_error("Lua raster baseline changed");}
 else{const auto g=displayedLayerGeometry(layer().id);if(g!=std::array<int,4>{expected.width,expected.height,expected.x,expected.y}||std::any_of(expected.pixels->begin(),expected.pixels->end(),[](Pixel p){return p!=0;}))throw std::logic_error("Lua empty raster baseline changed");}
 if(batch.after&&!batch.changes.empty())throw std::invalid_argument("Lua surface replacement also contains pixel changes");
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=layer().id;edit.beforeFrame=edit.afterFrame=frame().id;
 std::size_t changed=0;
 if(!batch.after){std::unordered_set<std::size_t> seen;for(const auto& c:batch.changes){if(c.index>=expected.pixels->size()||!seen.insert(c.index).second||(*expected.pixels)[c.index]!=c.before)throw std::invalid_argument("Invalid Lua pixel change");changed+=c.before!=c.after;}if(!changed)return false;}
 // Admission before history/owner copies. Match existing surface-edit working
 // budget and deduplicate linked storage; do not copy an entire project.
 constexpr std::size_t limit=256*1024*1024;std::size_t used=0;std::set<std::string> seen;
 auto admit=[&](std::size_t bytes){if(bytes>limit-used)throw std::length_error("Lua raster transaction exceeds native working budget");used+=bytes;};
 for(const auto& c:timeline_.state().cels)if(c.surface&&seen.insert(timeline_.linkedStorageKey(c.id)).second)admit(c.surface->pixels.size()*sizeof(Pixel));
 for(const auto& m:timeline_.state().masks)admit(m.mask.surface.pixels.size()*sizeof(Pixel));
 admit(changed*sizeof(Delta));
 if(changed){edit.pixels.reserve(changed);for(const auto& c:batch.changes)if(c.before!=c.after)edit.pixels.push_back({c.index,c.before,c.after});}
 auto makeSurface=[](const script::SurfaceSnapshot& s){timeline::Surface out;out.width=s.width;out.height=s.height;out.offsetX=s.x;out.offsetY=s.y;out.storageOriginX=out.storageOriginY=0;out.pixels=*s.pixels;return out;};
 if(batch.after){admit(expected.pixels->size()*sizeof(Pixel));admit(batch.after->pixels->size()*sizeof(Pixel)*2);}
 std::optional<timeline::Timeline> prepared;
 std::string ownerId;
 if(!slot){
  // Same empty-slot materialization rule as commitStroke: undo clears pixels
  // while retaining the committed Cel. No-change pixel batches create nothing.
  admit(used);admit(expected.pixels->size()*sizeof(Pixel));auto candidate=timeline_.state();timeline::Cel created;created.id="cel-"+layer().id+"-"+frame().id;
  for(std::size_t suffix=1;timeline_.findCelById(created.id);++suffix)created.id="cel-"+layer().id+"-"+frame().id+"-"+std::to_string(suffix);
  created.layerId=layer().id;created.frameId=frame().id;created.opacity=layer().opacity;created.surface=makeSurface(expected);ownerId=created.id;candidate.cels.push_back(std::move(created));prepared.emplace(std::move(candidate),ownerId);
 }else ownerId=resolved.source->id;
 auto& targetTimeline=prepared?*prepared:timeline_;const auto owner=targetTimeline.resolveSurface(ownerId);const auto& before=*owner.surface;
 std::optional<timeline::Surface> replacement;
 if(batch.after){edit.surfaceChanges.push_back({ownerId,before,makeSurface(*batch.after)});replacement=edit.surfaceChanges.front().after;}
 else{edit.targetCelId=slot?slot->id:ownerId;edit.pixelAddress=PixelAddressSpace{before.width,before.height,before.storageOriginX.value_or(0),before.storageOriginY.value_or(0)};}
 // All history payloads and replacement pixels are prepared before installation.
 reserveHistoryEntries();auto* live=targetTimeline.mutableOwnedSurface(ownerId);if(!live)throw std::logic_error("Missing Lua writable owner");
 if(batch.after)std::swap(*live,*replacement);else for(const auto& p:edit.pixels)live->pixels[p.index]=p.after;
 if(prepared)std::swap(timeline_,*prepared);
 const auto beforeRevision=revision_;
 try{pushEdit(std::move(edit),batch.label.empty()?U"脚本":batch.label);}
 catch(...){
  // History allocation is pre-reserved. Still restore pixels if label/history
  // preparation throws, as required by the batch failure contract.
  // Observer exceptions happen after a committed history push. Keep that
  // committed history and its pixels consistent, then propagate the error.
  if(revision_!=beforeRevision){change_={0,0,width_,height_};publishChange();throw;}
  if(prepared)std::swap(timeline_,*prepared);
  else if(batch.after)std::swap(*live,*replacement);
  else for(const auto& p:batch.changes)live->pixels[p.index]=p.before;
  throw;
 }
 change_={0,0,width_,height_};publishChange();return true;
}
}
