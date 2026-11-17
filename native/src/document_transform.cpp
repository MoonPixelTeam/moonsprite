#include "document.h"
#include "raster_geometry.h"
#include "raster_color_context.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <unordered_set>
namespace moon {
bool Document::generateTransformTween(const std::string& start,const std::string& layerId,const TransformTweenOptions& options,const std::vector<std::string>& selected,std::optional<TransformPoint> pivot){auto selectionOperation=animationChangeBinding_.selectionOperation(*this,selectionRevision_);const bool resources=hasTilemapContent()||hasFreeTileContent()||std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& layer){return layer.background.has_value();});
 // legacy generateAnimationTween resolves pending pixels before preparing its batch.
 commitFloatingPaste();if(active())throw std::runtime_error("Finish the active edit before generating tween frames");
 validateTransformTweenOptions(options);const RasterColorContext colors(palette_.entries,palette_.order(),colorMode_,pixelFormat_);const auto source=prepareTransformTweenSource(timeline_,start,layerId,options,selected,&colors);const auto& original=timeline_.state();
 if(original.frames.size()+std::size_t(options.frameCount)>10000)throw std::length_error("Tween exceeds native frame limit");
 constexpr std::uint64_t workingLimit=256ull*1024*1024,outputLimit=128ull*1024*1024;std::uint64_t stored=0;
 for(const auto& c:original.cels)if(c.surface){raster::validate(*c.surface);const auto bytes=std::uint64_t(c.surface->pixels.size())*sizeof(Pixel);if(bytes>workingLimit-stored)throw std::length_error("Tween exceeds native document pixel budget");stored+=bytes;}
 if(stored>workingLimit/2)throw std::length_error("Tween exceeds native working budget");
 std::size_t remaining=std::size_t(std::min<std::uint64_t>(outputLimit,(workingLimit-stored*2)/3));
 Edit edit{{},state_,nextState_};captureFrameOrder(edit,false);edit.beforeSelection=selectedFrames_;edit.frameHistory.beforeLoops=original.loopSections;for(const auto& l:original.layers)edit.layerHistory.beforeLayerOpacityProjection.push_back({l.id,l.opacity});
 std::unordered_set<std::string> used;for(const auto& f:original.frames)used.insert(f.id);for(const auto& c:original.cels)used.insert(c.id);for(const auto& l:original.loopSections)used.insert(l.id);for(const auto& m:original.masks)used.insert(m.mask.id);
 std::vector<timeline::MaskSlot> generatedMasks;
 auto next=nextFrameId_;auto fresh=[&](const char* prefix){std::string id;do{id=std::string(prefix)+std::to_string(identity_)+"-"+std::to_string(++next);}while(!used.insert(id).second);return id;};
 edit.frameHistory.detachedFrames.reserve(options.frameCount);edit.contentHistory.detachedCels.reserve(std::size_t(options.frameCount)*original.layers.size());std::vector<std::string> ids;ids.reserve(options.frameCount);
 for(int step=1;step<=options.frameCount;++step){DocumentFrame f{fresh("frame-native-"),options.duration};ids.push_back(f.id);auto output=prepareTransformTweenFrame(timeline_,source,options,step,remaining,std::min<std::size_t>(16*1024*1024,remaining/sizeof(Pixel)),&colors);for(auto& c:output.cels){c.id=fresh("cel-transform-native-");c.frameId=f.id;c.linkedCelId.reset();c.runtimeSharedCelId.reset();edit.contentHistory.detachedCels.push_back(std::move(c));}for(auto& mask:output.masks){mask.frameId=f.id;mask.mask.id=fresh("mask-tween-native-");generatedMasks.push_back(std::move(mask));}edit.frameHistory.detachedFrames.push_back(std::move(f));}
 TweenRegion canvas{0,0,width_,height_};if(options.autoCropCanvas)canvas=transformTweenCanvasBounds(timeline_,edit.contentHistory.detachedCels,width_,height_,&colors);
 if(canvas.width<1||canvas.height<1||canvas.width>1024||canvas.height>1024)throw std::length_error("Tween canvas exceeds native editable dimensions 1..1024");
 const bool resized=canvas.x!=0||canvas.y!=0||canvas.width!=width_||canvas.height!=height_;std::unordered_set<std::string> shiftedOwners;
 if(resized&&!resources){
  edit.snapshotHistory.beforeDimensions={{width_,height_}};edit.snapshotHistory.afterDimensions={{canvas.width,canvas.height}};edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=selection_;
  if(selection_){SelectionMask shifted{0,0,canvas.width,canvas.height,{}};shifted.mask.resize(std::size_t(canvas.width)*canvas.height);for(int y=0;y<canvas.height;++y)for(int x=0;x<canvas.width;++x){const auto sx=std::int64_t(x)+canvas.x,sy=std::int64_t(y)+canvas.y;shifted.mask[std::size_t(y)*canvas.width+x]=selectionContains(selection_,raster::coordinate(sx),raster::coordinate(sy))?1:0;}edit.pixelSelectionHistory.afterPixelsSelection=trimSelection(std::move(shifted));}
  edit.pixelSelectionHistory.beforeTrimPivot.emplace(pivot);if(pivot){pivot->x-=canvas.x;pivot->y-=canvas.y;}edit.pixelSelectionHistory.afterTrimPivot.emplace(pivot);
  if(canvas.x||canvas.y)for(const auto& c:original.cels)if(c.surface){const auto resolved=timeline_.resolveSurface(c.id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source)throw std::runtime_error("Invalid tween resize owner");if(resolved.source->id!=c.id)continue;const auto& s=*c.surface;const int x=raster::coordinate(std::int64_t(s.offsetX)-canvas.x),y=raster::coordinate(std::int64_t(s.offsetY)-canvas.y);raster::coordinate(std::int64_t(x)+s.width);raster::coordinate(std::int64_t(y)+s.height);shiftedOwners.insert(c.id);edit.contentHistory.ownerOffsets.push_back({c.id,s.offsetX,s.offsetY,x,y});}
  for(auto& c:edit.contentHistory.detachedCels)if(c.surface){auto& s=*c.surface;s.offsetX=raster::coordinate(std::int64_t(s.offsetX)-canvas.x);s.offsetY=raster::coordinate(std::int64_t(s.offsetY)-canvas.y);raster::coordinate(std::int64_t(s.offsetX)+s.width);raster::coordinate(std::int64_t(s.offsetY)+s.height);}
 }
 auto candidate=original;const auto insertion=timeline_.frameIndex(source.insertionFrameId)+1;
 if(resized&&!resources)for(auto& c:candidate.cels)if(c.surface&&shiftedOwners.count(c.id)){c.surface->offsetX=raster::coordinate(std::int64_t(c.surface->offsetX)-canvas.x);c.surface->offsetY=raster::coordinate(std::int64_t(c.surface->offsetY)-canvas.y);}
 candidate.frames.insert(candidate.frames.begin()+insertion,edit.frameHistory.detachedFrames.begin(),edit.frameHistory.detachedFrames.end());candidate.cels.insert(candidate.cels.end(),edit.contentHistory.detachedCels.begin(),edit.contentHistory.detachedCels.end());
 if(resized&&!resources){for(auto& slot:candidate.masks){slot.mask.surface.offsetX=raster::coordinate(std::int64_t(slot.mask.surface.offsetX)-canvas.x);slot.mask.surface.offsetY=raster::coordinate(std::int64_t(slot.mask.surface.offsetY)-canvas.y);}for(auto& slot:generatedMasks){slot.mask.surface.offsetX=raster::coordinate(std::int64_t(slot.mask.surface.offsetX)-canvas.x);slot.mask.surface.offsetY=raster::coordinate(std::int64_t(slot.mask.surface.offsetY)-canvas.y);}}
 candidate.masks.insert(candidate.masks.end(),generatedMasks.begin(),generatedMasks.end());edit.maskHistory.afterMasks=candidate.masks;
 if(options.scope!=TransformTweenScope::Loop)for(auto& section:candidate.loopSections){const auto range=timeline::loopRange(original,section);if(range.end>=0&&original.frames[range.end].id==source.insertionFrameId){if(section.endFrameId==source.insertionFrameId)section.endFrameId=ids.back();else if(section.startFrameId==source.insertionFrameId)section.startFrameId=ids.back();}}
 int number=1;auto loopName=[&]{const auto n=std::to_string(number);return U"补间 "+std::u32string(n.begin(),n.end());};while(std::any_of(candidate.loopSections.begin(),candidate.loopSections.end(),[&](const auto& l){return l.name==loopName();}))++number;
 timeline::LoopSection loop;loop.id=fresh("loop-tween-native-");loop.name=loopName();loop.startFrameId=ids.front();loop.endFrameId=ids.back();loop.direction="forward";candidate.loopSections.push_back(std::move(loop));
 edit.frameHistory.afterLoops=candidate.loopSections;for(const auto& f:candidate.frames)edit.frameHistory.afterFrames.push_back(f.id);edit.afterActive=layerId;edit.afterFrame=ids.front();edit.afterSelection=ids;edit.afterFrameAnchor=ids.front();edit.afterTimelineSelection=TimelineSelection{};
 if(resized&&resources){
  // Legacy resizeDocumentAt + resizeAnimationCelsAt: use the existing native
  // resource canvas transaction on a detached document before live installation.
  Document staged(width_,height_);staged.timeline_=timeline::Timeline(std::move(candidate));staged.activeLayerId_=layerId;staged.activeFrameId_=ids.front();staged.colorMode_=colorMode_;staged.palette_=palette_;staged.selection_=selection_;staged.displayedLayerGeometry_=displayedLayerGeometry_;
  staged.resizeBackgroundCanvas(canvas.width,canvas.height,-canvas.x,-canvas.y,false,pivot);
  candidate=staged.timeline_.state();edit.snapshotHistory.beforeTimeline=original;edit.snapshotHistory.afterTimeline=candidate;
  edit.snapshotHistory.beforeDimensions={{width_,height_}};edit.snapshotHistory.afterDimensions={{canvas.width,canvas.height}};
  edit.pixelSelectionHistory.pixelSelectionEdit=true;edit.pixelSelectionHistory.beforePixelsSelection=selection_;edit.pixelSelectionHistory.afterPixelsSelection=staged.selection_;
  edit.pixelSelectionHistory.beforeTrimPivot.emplace(pivot);if(pivot){pivot->x-=canvas.x;pivot->y-=canvas.y;}edit.pixelSelectionHistory.afterTrimPivot.emplace(pivot);
  edit.frameHistory={};edit.contentHistory={};edit.maskHistory={};edit.normalizeAnimationSelection=true;
 }
 timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("Tween creates an invalid Cel link");
 for(const auto& id:ids)for(const auto& layer:validated.state().layers){const auto* c=validated.findCel(layer.id,id);if(!c)continue;const auto resolved=validated.resolveSurface(c->id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source)throw std::runtime_error("Tween creates an unavailable Cel");}
 for(auto& layer:validated.state_.layers){const auto* c=validated.findCel(layer.id,edit.afterFrame);if(!c)continue;const auto resolved=validated.resolveSurface(c->id);if(resolved.source&&resolved.source->opacity&&std::isfinite(*resolved.source->opacity))layer.opacity=std::clamp(*resolved.source->opacity,0.,1.);}
 for(const auto& l:validated.state().layers)edit.layerHistory.afterLayerOpacityProjection.push_back({l.id,l.opacity});
 if(edit.snapshotHistory.afterTimeline)edit.snapshotHistory.afterTimeline=validated.state();
 auto activeLayer=edit.afterActive,activeFrame=edit.afterFrame,anchor=*edit.afterFrameAnchor;auto selectionAfter=resized?edit.pixelSelectionHistory.afterPixelsSelection:selection_;auto selectedAfter=ids;reserveHistoryEntries();
 clearAnimationItemSelection();timeline_=std::move(validated);nextFrameId_=next;activeLayerId_=std::move(activeLayer);activeFrameId_=std::move(activeFrame);frameAnchor_=std::move(anchor);selectedFrames_=std::move(selectedAfter);timelineSelection_={};if(resized){width_=canvas.width;height_=canvas.height;setSelectionValue(std::move(selectionAfter));selectionPivotHistory_.pivot=pivot;++selectionPivotHistory_.serial;}
 change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"变换补间");return true;
}
}
