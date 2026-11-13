#include "document.h"
#include "document_history_frame_validation.h"
#include "document_history_target_validation.h"
#include "raster_geometry.h"
#include <algorithm>
#include <stdexcept>
#include <utility>
#include <type_traits>
#include <unordered_map>
#include "document_history_storage.h"
#include "convolution_matrix.h"
#include "cel_properties.h"
#include "history_replay.h"

namespace moon {
using history_storage::adjustmentByteLimit;
using history_storage::adjustmentStorageBudget;
namespace {
// Read-only validation is shared by leaf preflight and final surface prepare.
// Do not cache live target pointers across the pixel activation boundary.
template<class Edit> void validateSurfaceReplay(const timeline::Timeline& timeline,const Edit& e,bool forward){
 std::unordered_map<const timeline::Surface*,std::pair<int,int>> proposedOffsets;proposedOffsets.reserve(e.contentHistory.ownerOffsets.size());
 for(const auto& c:e.contentHistory.ownerOffsets){const auto r=history_targets::requireSurfaceOwner(timeline,c.ownerId,true,"Invalid offset history owner");proposedOffsets[r.surface]={forward?c.afterX:c.beforeX,forward?c.afterY:c.beforeY};}
 if(!e.contentHistory.surfaceChanges.empty()){
  // Observe final proposed offsets in the canonical budget calculation,
  // without publishing intermediate geometry. Repeated owners stay linear.
  std::size_t used=adjustmentStorageBudget(timeline,1,[&](const timeline::Surface& surface){const auto found=proposedOffsets.find(&surface);return found==proposedOffsets.end()?std::pair<int,int>{surface.offsetX,surface.offsetY}:found->second;});
  for(const auto& change:e.contentHistory.surfaceChanges){history_targets::requireSurfaceOwner(timeline,change.ownerId,true,"Invalid convolution history owner");const auto& desired=forward?change.after:change.before;raster::validate(desired);const auto bytes=convolutionSurfaceBytes(desired);if(bytes>adjustmentByteLimit-used)throw std::length_error("Convolution history restore exceeds pixel budget");used+=bytes;}
 }
}
}
void Document::applyHistoryContent(const Edit& edit,bool forward,HistoryReplayPlan& plan){
 if(!edit.children.empty()){plan.rollback.run(edit.children,forward,[&](const auto& child,bool direction){applyValidatedEdit(child,direction,plan.children[std::size_t(&child-edit.children.data())]);});plan.contentApplied=!plan.contentApplied;return;}
 // An internal inverse reuses the exact displaced values. It must not rebuild
 // targets, allocate, or infer the original pixels from a partially applied edit.
 if(plan.leaf&&plan.leaf->ready){exchangeHistoryLeaf(plan);return;}
 history_frames::validateReplay(timeline_,edit,forward);history_targets::validateLeafReplay(timeline_,edit,forward);
 validateSurfaceReplay(timeline_,edit,forward);
 // Validate and settle the pixel activation before preparing metadata, with no
 // pixel writes. Existing activation callbacks retain their original position.
 applyPixelEdit(edit,forward,true,true);
 plan.leaf=std::make_unique<HistoryReplayPlan::Leaf>();auto& leaf=*plan.leaf;
 leaf.pixels=prepareHistoryPixelRestore(edit);
 // Link synchronization selects the most recently edited shared storage.
 // Model the impending write before preparing link metadata; otherwise a
 // captured cel replacement could incorrectly outrank this pixel owner.
 // This advances only the disposable storage stamp, without changing bytes.
 if(leaf.pixels)static_cast<void>(static_cast<std::vector<Pixel>&>(leaf.pixels->storage));
 if(!plan.palette)plan.palette=preparePaletteEdit(edit,forward);
 prepareHistoryLeafMetadata(edit,forward,leaf);
 leaf.ready=true;
 // Everything below is either the already validated pixel write or a noexcept
 // exchange. All text, topology, index/link and projection allocation is done.
 applyPixelEdit(edit,forward,false);
 if(!change_.empty()){leaf.damage.include(change_.x,change_.y);leaf.damage.include(change_.x+change_.w-1,change_.y+change_.h-1);}
 exchangeHistoryLeaf(plan);
}

std::unique_ptr<Document::HistoryReplayPlan::Leaf::Pixels> Document::prepareHistoryPixelRestore(const Edit& e)const{
 if(e.pixels.empty()&&e.contentHistory.runs.empty()&&!e.contentHistory.dense)return {};
 const auto resolved=history_targets::requireSurfaceOwner(timeline_,e.contentHistory.targetCelId,false,"Missing pixel restore owner");const auto& surface=*resolved.surface;
 const auto address=e.contentHistory.pixelAddress.value_or(PixelAddressSpace{width_,height_,0,0});
 if(address.width<1||address.height<1)throw std::logic_error("Invalid pixel restore address");
 std::vector<std::pair<std::size_t,std::size_t>> ranges;
 auto row=[&](std::int64_t x,std::int64_t y,std::size_t count){
  const auto lx=x+std::int64_t(address.originX)-surface.storageOriginX.value_or(0),ly=y+std::int64_t(address.originY)-surface.storageOriginY.value_or(0);
  if(ly<0||ly>=surface.height)return;
  const auto first=std::max<std::int64_t>(0,lx),last=std::min<std::int64_t>(surface.width,lx+std::int64_t(count));if(first>=last)return;
  const auto index=std::size_t(ly)*surface.width+std::size_t(first),length=std::size_t(last-first);
  if(index>surface.pixels.size()||length>surface.pixels.size()-index)throw std::logic_error("Pixel restore span exceeds owner");
  ranges.emplace_back(index,index+length);
 };
 for(const auto& point:e.pixels)row(point.index%std::size_t(address.width),point.index/std::size_t(address.width),1);
 for(const auto& run:e.contentHistory.runs){auto index=run.index,left=run.length;while(left){const auto count=std::min(left,std::size_t(address.width)-index%std::size_t(address.width));row(index%std::size_t(address.width),index/std::size_t(address.width),count);index+=count;left-=count;}}
 if(e.contentHistory.dense){const auto& dense=*e.contentHistory.dense;for(int y=0;y<dense.height;++y)row(dense.x,std::int64_t(dense.y)+y,std::size_t(dense.width));}
 std::sort(ranges.begin(),ranges.end());std::size_t used=0;
 for(const auto& range:ranges){if(used&&range.first<=ranges[used-1].second)ranges[used-1].second=std::max(ranges[used-1].second,range.second);else ranges[used++]=range;}ranges.resize(used);
 auto prepared=std::make_unique<HistoryReplayPlan::Leaf::Pixels>();prepared->storage.share(surface.pixels);prepared->spans.reserve(ranges.size());
 for(const auto& range:ranges)prepared->spans.push_back({range.first,std::vector<Pixel>(surface.pixels.begin()+range.first,surface.pixels.begin()+range.second)});
 return prepared;
}

void Document::prepareHistoryLeafMetadata(const Edit& edit,bool forward,HistoryReplayPlan::Leaf& prepared){
 const auto& content=edit.contentHistory;const auto& layers=edit.layerHistory;const auto& frames=edit.frameHistory;
 const bool metadata=!content.textChanges.empty()||!content.ownerOffsets.empty()||!content.surfaceChanges.empty()||content.celProperties||!layers.targetLayerId.empty()||!(forward?layers.afterOrder:layers.beforeOrder).empty()||frames.beforeScriptDurations||!(forward?frames.afterDisabled:frames.beforeDisabled).empty()||!(forward?frames.afterFrames:frames.beforeFrames).empty()||(forward?frames.afterLoops:frames.beforeLoops)||!frames.targetFrameId.empty()||!(forward?content.afterCels:content.beforeCels).empty();
 prepared.damage=change_;
 if(!metadata)return;
 prepared.layer=activeLayerId_;prepared.frame=activeFrameId_;prepared.frames=selectedFrames_;prepared.geometry=displayedLayerGeometry_;
 prepared.metadata.emplace();auto& draft=*prepared.metadata;
 // Stage only the content metadata used by these existing replay methods.
 // Masks, tilesets, groups and other document resources keep their live owner.
 draft.state_.layers=timeline_.state_.layers;draft.state_.frames=timeline_.state_.frames;draft.state_.groups=timeline_.state_.groups;draft.state_.loopSections=timeline_.state_.loopSections;
 draft.state_.canvasWidth=timeline_.state_.canvasWidth;draft.state_.canvasHeight=timeline_.state_.canvasHeight;
 draft.state_.cels.reserve(timeline_.state_.cels.size());
 for(const auto& source:timeline_.state_.cels){
  timeline::Cel cel;cel.id=source.id;cel.layerId=source.layerId;cel.frameId=source.frameId;cel.linkedCelId=source.linkedCelId;cel.runtimeSharedCelId=source.runtimeSharedCelId;cel.opacity=source.opacity;cel.zIndex=source.zIndex;cel.text=source.text;cel.tilemap=source.tilemap;cel.freeTiles=source.freeTiles;
  if(source.surface){const auto& value=*source.surface;cel.surface.emplace();auto& surface=*cel.surface;surface.width=value.width;surface.height=value.height;surface.offsetX=value.offsetX;surface.offsetY=value.offsetY;surface.storageOriginX=value.storageOriginX;surface.storageOriginY=value.storageOriginY;surface.pixels.share(value.pixels);}
  draft.state_.cels.push_back(std::move(cel));
 }
 // Copy existing indices without an extra synchronization pass. The legacy
 // methods below rebuild at exactly their original layer/frame/cel barriers.
 draft.layers_=timeline_.layers_;draft.frames_=timeline_.frames_;draft.cels_=timeline_.cels_;draft.slots_=timeline_.slots_;draft.resolved_=timeline_.resolved_;draft.linkedDirtyOwner_=timeline_.linkedDirtyOwner_;
 if(prepared.pixels){const auto target=timeline_.resolveSurface(content.targetCelId);draft.linkedDirtyOwner_=target.source->id;}
 auto exchange=[&]()noexcept{
  std::swap(timeline_,draft);activeLayerId_.swap(prepared.layer);activeFrameId_.swap(prepared.frame);selectedFrames_.swap(prepared.frames);displayedLayerGeometry_.swap(prepared.geometry);std::swap(change_,prepared.damage);
 };
 exchange();
 try{
  // These domain methods publish no callbacks. Reuse their existing ordering
  // and link semantics on the private draft; the live document is restored
  // before any pixel write or event publication can occur.
  applySurfaceEdit(edit,forward);applyCelPropertiesEdit(edit,forward);applyLayerEdit(edit,forward);applyFrameEdit(edit,forward);applyCelEdit(edit,forward);
 }catch(...){exchange();throw;}
 exchange();
}

void Document::exchangeHistoryLeaf(HistoryReplayPlan& plan)noexcept{
 static_assert(std::is_nothrow_swappable_v<timeline::Timeline>);
 auto& leaf=*plan.leaf;
 auto pixels=[&]()noexcept{if(!leaf.pixels)return;auto& storage=static_cast<std::vector<Pixel>&>(leaf.pixels->storage);for(auto& span:leaf.pixels->spans)for(std::size_t i=0;i<span.values.size();++i)std::swap(storage[span.index+i],span.values[i]);};
 auto metadata=[&]()noexcept{
  if(leaf.metadata){auto& draft=*leaf.metadata;std::swap(timeline_,draft);
   // The draft deliberately excludes these resource domains. Keep their
   // current owner on both forward publication and inverse compensation.
   timeline_.state_.masks.swap(draft.state_.masks);timeline_.state_.tilesets.swap(draft.state_.tilesets);timeline_.state_.groups.swap(draft.state_.groups);
   activeLayerId_.swap(leaf.layer);activeFrameId_.swap(leaf.frame);selectedFrames_.swap(leaf.frames);displayedLayerGeometry_.swap(leaf.geometry);
  }
  std::swap(change_,leaf.damage);
 };
 if(leaf.applied){metadata();if(plan.palette)exchangePaletteEdit(*plan.palette);pixels();}
 else{
  // Initial publication follows applyPixelEdit, so its backup still contains
  // original values. A later retained reapply exchanges those values first.
  if(leaf.published)pixels();
  if(plan.palette)exchangePaletteEdit(*plan.palette);metadata();
 }
 if(leaf.published&&leaf.pixels){timeline_.selectionContent_.clear();timeline_.visibleContent_.clear();for(auto& stamp:timeline_.thumbnailStorage_)++stamp.second.revision;}
 leaf.published=true;leaf.applied=!leaf.applied;plan.contentApplied=leaf.applied;
}

void Document::applyCelEdit(const Edit& e,bool redo){const auto& values=redo?e.contentHistory.afterCels:e.contentHistory.beforeCels;if(values.empty())return;history_targets::validateCurrentCelTargets(timeline_,values);for(const auto& value:values){auto it=std::find_if(timeline_.state_.cels.begin(),timeline_.state_.cels.end(),[&](const auto& c){return c.id==value.id;});if(it==timeline_.state_.cels.end())throw std::logic_error("Missing history cel");*it=value;}timeline_.buildIndex();if(e.frameHistory.beforeFrames.empty() && !e.beforeFrame.empty())activeFrameId_=redo?e.afterFrame:e.beforeFrame;change_={0,0,width_,height_};}
std::unique_ptr<Document::SurfaceReplay> Document::prepareSurfaceEdit(const Edit& e,bool forward)const{
 validateSurfaceReplay(timeline_,e,forward);
 if(e.contentHistory.textChanges.empty()&&e.contentHistory.ownerOffsets.empty()&&e.contentHistory.surfaceChanges.empty())return {};
 auto prepared=std::make_unique<SurfaceReplay>();
 prepared->text.reserve(e.contentHistory.textChanges.size());prepared->offsets.reserve(e.contentHistory.ownerOffsets.size());
 prepared->replacements.reserve(e.contentHistory.surfaceChanges.size());
 for(const auto& value:e.contentHistory.textChanges)if(timeline_.cels_.count(value.id))prepared->text.push_back({value.id,forward?value.after:value.before});
 for(const auto& value:e.contentHistory.ownerOffsets)prepared->offsets.push_back({value.ownerId,forward?value.afterX:value.beforeX,forward?value.afterY:value.beforeY});
 for(const auto& value:e.contentHistory.surfaceChanges)prepared->replacements.push_back({value.ownerId,forward?value.after:value.before});
 if(!prepared->replacements.empty()){prepared->active=forward?e.afterActive:e.beforeActive;prepared->frame=forward?e.afterFrame:e.beforeFrame;}
 return prepared;
}
void Document::applySurfaceEdit(const Edit& e,bool forward,SurfaceReplay* prepared){
 auto local=prepared?std::unique_ptr<SurfaceReplay>{}:prepareSurfaceEdit(e,forward);if(!prepared)prepared=local.get();if(!prepared)return;
 // Resolve targets after pixel activation. Preparation carries IDs and owned
 // values only; no live pointer survives a frame or layer activation callback.
 for(auto& value:prepared->text){const auto found=timeline_.cels_.find(value.id);value.target=found==timeline_.cels_.end()?nullptr:&timeline_.state_.cels[found->second].text;}
 for(auto& value:prepared->offsets)value.target=&*timeline_.state_.cels[timeline_.cels_.at(value.id)].surface;
 for(auto& value:prepared->replacements)value.target=&*timeline_.state_.cels[timeline_.cels_.at(value.id)].surface;
 // Preserve the existing cache invalidation order before publishing values.
 for(const auto& value:prepared->offsets)timeline_.mutableOwnedSurface(value.id);
 for(const auto& value:prepared->replacements)timeline_.mutableOwnedSurface(value.id);
 static_assert(std::is_nothrow_swappable_v<std::optional<TextCelData>>);
 static_assert(std::is_nothrow_swappable_v<timeline::Surface>);
 for(auto& value:prepared->text)if(value.target)std::swap(*value.target,value.value);
 for(const auto& value:prepared->offsets){value.target->offsetX=value.x;value.target->offsetY=value.y;}
 for(auto& value:prepared->replacements)std::swap(*value.target,value.value);
 if(!prepared->active.empty())activeLayerId_=std::move(prepared->active);if(!prepared->frame.empty())activeFrameId_=std::move(prepared->frame);
 if(!prepared->offsets.empty()||!prepared->replacements.empty())change_={0,0,width_,height_};
}
void Document::applyCelPropertiesEdit(const Edit& e,bool forward){if(!e.contentHistory.celProperties)return;applyCelPropertiesPlan(timeline_.state_,*e.contentHistory.celProperties,forward);timeline_.invalidateCompositeOrder();projectActiveCelOpacities();change_={0,0,width_,height_};}
void Document::applyPixelEdit(const Edit& e,bool forward,bool activateTarget,bool prepareOnly){
 if(e.pixels.empty()&&e.contentHistory.runs.empty()&&!e.contentHistory.dense)return;
 // Reject the full pixel payload before activating its cel. Direct native
 // callers can replay an inactive cel without changing the current view.
 auto activate=[&]{
  if(!activateTarget)return;
  const auto* target=timeline_.findCelById(e.contentHistory.targetCelId);if(!target)throw std::logic_error("Missing pixel history target");
  const auto layerId=target->layerId,frameId=target->frameId;
  selectLayer(layerId);selectFrame(frameId);
 };
 const auto r=history_targets::requireSurfaceOwner(timeline_,e.contentHistory.targetCelId,false,"Missing pixel history owner");const auto& s=*r.surface;raster::validate(s);
 // Existing pre-push operations use canvas indices. Only explicitly migrated
 // owner-local operations may provide a different address space.
 const auto a=e.contentHistory.pixelAddress.value_or(PixelAddressSpace{width_,height_,0,0});
 if(a.width<1||a.height<1)throw std::logic_error("Invalid pixel history address space");
 const std::uint64_t size=std::uint64_t(a.width)*a.height;
 const bool direct=a.width==s.width&&a.originX==s.storageOriginX.value_or(0)&&a.originY==s.storageOriginY.value_or(0);
 if(direct&&a.height<=s.height){
  for(const auto& d:e.pixels)if(d.index>=size)throw std::logic_error("Pixel history point exceeds capture");
  for(const auto& run:e.contentHistory.runs)if(run.index>size||run.length>size-run.index)throw std::logic_error("Pixel history run exceeds capture");
  if(e.contentHistory.dense){const auto& d=*e.contentHistory.dense;if(d.x<0||d.y<0||d.width<1||d.height<1||std::int64_t(d.x)+d.width>a.width||std::int64_t(d.y)+d.height>a.height||std::uint64_t(d.width)*d.height!=d.before.size()||d.before.size()!=d.after.size())throw std::logic_error("Invalid dense pixel history capture");}
  activate();if(prepareOnly)return;auto* owner=timeline_.mutableOwnedSurface(r.source->id);if(!owner)throw std::logic_error("Missing writable history owner");auto& pixels=static_cast<std::vector<Pixel>&>(owner->pixels);
  auto mark=[&](std::int64_t x,std::int64_t y,std::int64_t w,std::int64_t h){const auto left=std::max<std::int64_t>(0,std::int64_t(owner->offsetX)+x),top=std::max<std::int64_t>(0,std::int64_t(owner->offsetY)+y),right=std::min<std::int64_t>(width_,std::int64_t(owner->offsetX)+x+w),bottom=std::min<std::int64_t>(height_,std::int64_t(owner->offsetY)+y+h);if(right>left&&bottom>top){change_.include(int(left),int(top));change_.include(int(right-1),int(bottom-1));}};
  for(const auto& d:e.pixels){pixels[d.index]=forward?d.after:d.before;mark(d.index%std::size_t(a.width),d.index/std::size_t(a.width),1,1);}
  // Legacy history.ts applyRuns(runBefore, true): overlapping writes must
  // unwind in reverse order, including the direct native storage path.
  for(std::size_t step=0;step<e.contentHistory.runs.size();++step){const auto& run=e.contentHistory.runs[forward?step:e.contentHistory.runs.size()-1-step];std::fill_n(pixels.begin()+run.index,run.length,normalizeCanvasPacked(forward?run.after:run.before));if(!run.length)continue;const auto startRow=run.index/std::size_t(a.width),endRow=(run.index+run.length-1)/std::size_t(a.width);if(startRow==endRow)mark(run.index%std::size_t(a.width),startRow,run.length,1);else mark(0,startRow,a.width,endRow-startRow+1);}
  if(e.contentHistory.dense){const auto& d=*e.contentHistory.dense;const auto& values=forward?d.after:d.before;for(int y=0;y<d.height;++y)std::copy_n(values.begin()+std::size_t(y)*d.width,d.width,pixels.begin()+std::size_t(y+d.y)*a.width+d.x);mark(d.x,d.y,d.width,d.height);}
  return;
 }
 struct Span{std::size_t index=0,count=0,skip=0;};
 auto map=[&](std::int64_t x,std::int64_t y,std::size_t count)->Span{
  const auto lx=x+std::int64_t(a.originX)-s.storageOriginX.value_or(0),ly=y+std::int64_t(a.originY)-s.storageOriginY.value_or(0);
  if(ly<0||ly>=s.height)return {};
  const std::int64_t begin=std::max<std::int64_t>(0,lx),end=std::min<std::int64_t>(s.width,lx+std::int64_t(count));if(end<=begin)return {};
  const auto index=direct?std::size_t(y)*s.width+std::size_t(x):std::size_t(ly)*s.width+std::size_t(begin);
  if(index>s.pixels.size()||std::size_t(end-begin)>s.pixels.size()-index)throw std::logic_error("Pixel history span exceeds owner");
  return {index,std::size_t(end-begin),std::size_t(begin-lx)};
 };
 auto walk=[&](auto&& emit){
  for(const auto& d:e.pixels){if(d.index>=size)throw std::logic_error("Pixel history point exceeds capture");emit(d.index%std::size_t(a.width),d.index/std::size_t(a.width),std::size_t(1),forward?&d.after:&d.before,Pixel(0));}
  for(std::size_t step=0;step<e.contentHistory.runs.size();++step){const auto& run=e.contentHistory.runs[forward?step:e.contentHistory.runs.size()-1-step];if(run.index>size||run.length>size-run.index)throw std::logic_error("Pixel history run exceeds capture");auto index=run.index,left=run.length;while(left){const auto count=std::min(left,std::size_t(a.width)-index%std::size_t(a.width));emit(index%std::size_t(a.width),index/std::size_t(a.width),count,static_cast<const Pixel*>(nullptr),normalizeCanvasPacked(forward?run.after:run.before));index+=count;left-=count;}}
  if(e.contentHistory.dense){const auto& d=*e.contentHistory.dense;const auto& values=forward?d.after:d.before;if(d.x<0||d.y<0||d.width<1||d.height<1||std::int64_t(d.x)+d.width>a.width||std::int64_t(d.y)+d.height>a.height||std::uint64_t(d.width)*d.height!=values.size())throw std::logic_error("Invalid dense pixel history capture");for(int y=0;y<d.height;++y)emit(d.x,std::int64_t(d.y)+y,std::size_t(d.width),values.data()+std::size_t(y)*d.width,Pixel(0));}
 };
 // Check all spans before invalidating caches or mutating the first pixel.
 walk([&](std::int64_t x,std::int64_t y,std::size_t n,const Pixel*,Pixel){(void)map(x,y,n);});
 activate();if(prepareOnly)return;auto* owner=timeline_.mutableOwnedSurface(r.source->id);if(!owner)throw std::logic_error("Missing writable history owner");auto& pixels=static_cast<std::vector<Pixel>&>(owner->pixels);
 walk([&](std::int64_t x,std::int64_t y,std::size_t n,const Pixel* values,Pixel fill){const auto span=map(x,y,n);if(!span.count)return;auto destination=pixels.begin()+span.index;if(values)std::copy_n(values+span.skip,span.count,destination);else std::fill_n(destination,span.count,fill);
  const std::int64_t wy=std::int64_t(owner->offsetY)+std::int64_t(span.index/std::size_t(owner->width));
  const std::int64_t wx=std::int64_t(owner->offsetX)+std::int64_t(span.index%std::size_t(owner->width));
  if(wy>=0&&wy<height_){const auto left=std::max<std::int64_t>(0,wx),right=std::min<std::int64_t>(width_,wx+std::int64_t(span.count));if(right>left){change_.include(int(left),int(wy));change_.include(int(right-1),int(wy));}}
 });
}
std::optional<std::size_t> Document::ContentHistory::exclusiveBytes()const{
 if(celProperties)return celProperties->historyBytes(); return {};
}
std::size_t Document::ContentHistory::textBytes()const{
  std::size_t textBytes=0;for(const auto& t:textChanges)for(const auto* value:{&t.before,&t.after})if(*value){textBytes+=sizeof(TextCelData)+(*value)->text.size()*2+(*value)->styleRuns.size()*sizeof(TextStyleRun)+(*value)->transforms.size()*sizeof(TextTransform);for(const auto& transform:(*value)->transforms)textBytes+=(transform.source.projectProperties.size()+transform.target.projectProperties.size())*sizeof(char16_t);}
 return textBytes;
}
std::size_t Document::ContentHistory::addressBytes()const{
 return (pixelAddress?sizeof(PixelAddressSpace):0);
}
std::size_t Document::ContentHistory::pixelBytes(std::size_t deltaCount)const{
 return deltaCount*sizeof(Delta)+runs.size()*sizeof(PixelRun)+targetCelId.size();
}
std::size_t Document::ContentHistory::denseBytes()const{
 std::size_t size=0;
  if(dense)size+=(dense->before.size()+dense->after.size())*sizeof(Pixel);

 return size;
}
std::size_t Document::ContentHistory::celBytes()const{
 std::size_t size=0;
  if(detachedCel && detachedCel->surface) size+=detachedCel->surface->pixels.size()*sizeof(Pixel);
  for(const auto& c:detachedCels)if(c.surface)size+=c.surface->pixels.size()*sizeof(Pixel);
  for(const auto* cels:{&beforeCels,&afterCels})for(const auto& c:*cels)size+=128+(c.surface?c.surface->pixels.size()*sizeof(Pixel):0);

 return size;
}
std::size_t Document::ContentHistory::offsetBytes()const{
 std::size_t size=0;
  for(const auto& c:ownerOffsets)size+=sizeof(OwnerOffsetChange)+c.ownerId.size();

 return size;
}
std::size_t Document::ContentHistory::surfaceBytes()const{
 std::size_t size=0;
  for(const auto& change:surfaceChanges)size+=sizeof(SurfaceChange)+change.ownerId.size()+(change.before.pixels.size()+change.after.pixels.size())*sizeof(Pixel);

 return size;
}
}
