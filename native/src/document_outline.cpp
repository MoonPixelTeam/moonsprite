#include "document.h"
#include "outline_samples.h"
#include <unordered_set>
namespace moon {
bool Document::outlinePixels(const OutlineSampling& settings,Pixel color,bool smartHue,double darkness,bool followOpacity,bool boundary){
 commitFloatingPaste();cancelStroke();if(boundary&&!selection_)return false;
 // Mask commands use the same sampling but must retain mask authority/history;
 // their adapter is not yet migrated. Do not modify the derived display raster.
 if(!activeMaskId_.empty()||!timelineSelection_.maskRows.empty())return false;
 std::vector<const DocumentCel*> targets;const auto layers=selectedLayerIdsWithGroups();
 if(!timelineSelection_.cels.empty()){for(const auto& id:timelineSelection_.cels)if(const auto* c=timeline_.findCelById(id))targets.push_back(c);}
 else{const auto frames=selectedFrames_.empty()?std::vector<std::string>{activeFrameId_}:selectedFrames_;for(const auto& f:frames)for(const auto& l:timeline_.state().layers){
  if(!layers.empty()){if(std::find(layers.begin(),layers.end(),l.id)==layers.end())continue;}
  else if(selectedFrames_.empty()){if(l.id!=activeLayerId_)continue;}
  else if(layerEffectivelyLocked(l)||!layerEffectivelyVisible(l))continue;
  if(l.kind.empty())if(const auto* c=timeline_.findCel(l.id,f))targets.push_back(c);
 }}
 // Legacy collect excludes tile layers before checking the locks of the batch.
 targets.erase(std::remove_if(targets.begin(),targets.end(),[&](const auto* c){return !timeline_.state().layers[timeline_.layerIndex(c->layerId)].kind.empty();}),targets.end());
 for(const auto* c:targets){const auto& l=timeline_.state().layers[timeline_.layerIndex(c->layerId)];if(layerEffectivelyLocked(l))return false;}
 constexpr std::uint64_t limit=256ull*1024*1024;std::uint64_t used=0;auto charge=[&](std::uint64_t bytes){if(bytes>limit-used)throw std::length_error("Outline exceeds working memory limit");used+=bytes;};
 for(const auto& c:timeline_.state().cels)if(c.surface)charge(std::uint64_t(c.surface->pixels.size())*sizeof(Pixel));for(const auto& set:timeline_.state().tilesets)charge(std::uint64_t(set.pixels.size())*sizeof(Pixel));
 Edit edit{{},state_,nextState_};edit.beforeActive=edit.afterActive=activeLayerId_;edit.beforeFrame=edit.afterFrame=activeFrameId_;edit.beforeTimelineSelection=edit.afterTimelineSelection=timelineSelection_;edit.beforeSelection=edit.afterSelection=selectedFrames_;std::unordered_set<std::string> seen;
 for(const auto* target:targets){const auto& layer=timeline_.state().layers[timeline_.layerIndex(target->layerId)];if(!layer.kind.empty())continue;const auto resolved=timeline_.resolveSurface(target->id);if(resolved.issue!=timeline::LinkIssue::None)throw std::invalid_argument("Invalid outline target link");if(!resolved.source||!resolved.surface||!seen.insert(timeline_.linkedStorageKey(resolved.source->id)).second)continue;
 const auto& before=*resolved.surface;
 // Bound candidate storage before sampling; no live pixel mutation occurs here.
 const int radius=int(std::clamp(std::floor(settings.thickness+.5),1.,64.));const auto leftBound=std::max<std::int64_t>(0,std::int64_t(selection_?selection_->x:before.offsetX)-radius),topBound=std::max<std::int64_t>(0,std::int64_t(selection_?selection_->y:before.offsetY)-radius);const auto rightBound=std::min<std::int64_t>(width_,std::int64_t(selection_?selection_->x:before.offsetX)+(selection_?selection_->width:before.width)+radius),bottomBound=std::min<std::int64_t>(height_,std::int64_t(selection_?selection_->y:before.offsetY)+(selection_?selection_->height:before.height)+radius);
 const auto area=rightBound>leftBound&&bottomBound>topBound?std::uint64_t(rightBound-leftBound)*(bottomBound-topBound):0;charge(area*160);
 const auto samples=boundary?outlineBoundarySamples(before,width_,height_,selection_,settings):outlineSamples(before,width_,height_,selection_,settings);if(samples.empty()){used-=area*160;continue;}
 int left=width_,top=height_,right=0,bottom=0;for(const auto& sample:samples){const int x=int(sample.index%width_),y=int(sample.index/width_);left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);}
 charge(std::uint64_t(before.pixels.size())*sizeof(Pixel));const auto w=std::max<std::int64_t>(right,std::int64_t(before.offsetX)+before.width)-std::min(left,before.offsetX),h=std::max<std::int64_t>(bottom,std::int64_t(before.offsetY)+before.height)-std::min(top,before.offsetY);charge(std::uint64_t(w)*h*sizeof(Pixel)*3);
 auto expanded=raster::expanded(before,{left,top,right,bottom});auto after=expanded?std::move(*expanded):before;bool changed=false;
 for(const auto& sample:samples){const int x=int(sample.index%width_),y=int(sample.index/width_);const auto index=raster::worldIndex(after,x,y);if(!index)throw std::logic_error("Missing outline destination");auto stroke=outlineStrokeColor(color,sample.reference,smartHue,darkness,followOpacity);const auto original=raster::readWorld(before,x,y);const auto value=(stroke>>24)==0?stroke:brushComposite(original,stroke,100);changed|=value!=original;after.pixels[*index]=value;}
 if(changed)edit.surfaceChanges.push_back({resolved.source->id,before,std::move(after)});used-=area*160;
 }
 if(edit.surfaceChanges.empty())return false;reserveHistoryEntries();change_={};applyEdit(edit,true);publishChange();pushEdit(std::move(edit),boundary||settings.position==0?U"内部描边":settings.position==2?U"两侧描边":U"外部描边");return true;
}
}
