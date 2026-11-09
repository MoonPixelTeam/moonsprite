#include "lua_script_result.h"
#include "raster_geometry.h"
#include <unordered_set>
#include <set>
#include <stdexcept>
namespace moon {
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
