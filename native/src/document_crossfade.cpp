#include "document.h"
#include "raster_geometry.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <unordered_set>
namespace moon {
std::vector<Pixel> Document::crossfadeTweenPreview(const std::string& start,const std::string& layerId,const CrossfadeTweenOptions& options,int step,const std::vector<std::string>& selected) const {
 const auto source=prepareCrossfadeTweenSource(timeline_,start,layerId,options.layerScope,selected,options.betweenMode);return compositeCrossfadeTweenPreview(timeline_,width_,height_,source,options,step);
}

bool Document::generateCrossfadeTween(const std::string& start,const std::string& layerId,const CrossfadeTweenOptions& options,const std::vector<std::string>& selected,std::optional<TransformPoint> pivot){if(hasTilemapContent()||hasFreeTileContent())return false;
 // legacy generateAnimationTween resolves pending pixels before preparing its batch.
 commitFloatingPaste();if(active())throw std::runtime_error("Finish the active edit before generating tween frames");
 validateCrossfadeTweenOptions(options);const auto& original=timeline_.state();
 if(original.frames.size()+std::size_t(options.frameCount)>10000)throw std::length_error("Tween exceeds native frame limit");
 constexpr std::uint64_t workingLimit=256ull*1024*1024,outputLimit=128ull*1024*1024;std::uint64_t stored=0;
 for(const auto& c:original.cels)if(c.surface){raster::validate(*c.surface);const auto bytes=std::uint64_t(c.surface->pixels.size())*sizeof(Pixel);if(bytes>workingLimit-stored)throw std::length_error("Tween exceeds native document pixel budget");stored+=bytes;}
 if(stored>workingLimit/2)throw std::length_error("Tween exceeds native working budget");
 const auto source=prepareCrossfadeTweenSource(timeline_,start,layerId,options.layerScope,selected,options.betweenMode);std::uint64_t shapeBytes=0;for(const auto& part:source.layers)if(part.morph)shapeBytes+=part.morph->byteLength();
 if(shapeBytes>outputLimit||shapeBytes>workingLimit-stored*2)throw std::length_error("Tween exceeds native working budget");std::size_t remaining=std::size_t(std::min<std::uint64_t>(outputLimit-shapeBytes,(workingLimit-stored*2-shapeBytes)/3));
 Edit edit{{},state_,nextState_};captureFrameOrder(edit,false);edit.beforeSelection=selectedFrames_;edit.beforeLoops=original.loopSections;for(const auto& l:original.layers)edit.beforeLayerOpacityProjection.push_back({l.id,l.opacity});
 std::unordered_set<std::string> used;for(const auto& f:original.frames)used.insert(f.id);for(const auto& c:original.cels)used.insert(c.id);for(const auto& l:original.loopSections)used.insert(l.id);
 auto next=nextFrameId_;auto fresh=[&](const char* prefix){std::string id;do{id=std::string(prefix)+std::to_string(identity_)+"-"+std::to_string(++next);}while(!used.insert(id).second);return id;};
 edit.detachedFrames.reserve(options.frameCount);edit.detachedCels.reserve(std::size_t(options.frameCount)*original.layers.size());std::vector<std::string> ids;ids.reserve(options.frameCount);
 for(int step=1;step<=options.frameCount;++step){DocumentFrame f{fresh("frame-native-"),options.duration};ids.push_back(f.id);auto output=prepareCrossfadeTweenFrame(timeline_,width_,height_,source,options,step,&remaining,std::min<std::size_t>(16*1024*1024,remaining/sizeof(Pixel)));for(auto& c:output.cels){c.id=fresh("cel-tween-native-");c.frameId=f.id;c.linkedCelId.reset();c.runtimeSharedCelId.reset();edit.detachedCels.push_back(std::move(c));}edit.detachedFrames.push_back(std::move(f));}
 TweenRegion canvas{0,0,width_,height_};if(options.autoCropCanvas)canvas=transformTweenCanvasBounds(timeline_,edit.detachedCels,width_,height_);
 if(canvas.width<1||canvas.height<1||canvas.width>1024||canvas.height>1024)throw std::length_error("Tween canvas exceeds native editable dimensions 1..1024");
 const bool resized=canvas.x!=0||canvas.y!=0||canvas.width!=width_||canvas.height!=height_;std::unordered_set<std::string> shiftedOwners;
 if(resized){
  edit.beforeDimensions={{width_,height_}};edit.afterDimensions={{canvas.width,canvas.height}};edit.pixelSelectionEdit=true;edit.beforePixelsSelection=selection_;
  if(selection_){SelectionMask shifted{0,0,canvas.width,canvas.height,{}};shifted.mask.resize(std::size_t(canvas.width)*canvas.height);for(int y=0;y<canvas.height;++y)for(int x=0;x<canvas.width;++x){const auto sx=std::int64_t(x)+canvas.x,sy=std::int64_t(y)+canvas.y;shifted.mask[std::size_t(y)*canvas.width+x]=selectionContains(selection_,raster::coordinate(sx),raster::coordinate(sy))?1:0;}edit.afterPixelsSelection=trimSelection(std::move(shifted));}
  edit.beforeTrimPivot.emplace(pivot);if(pivot){pivot->x-=canvas.x;pivot->y-=canvas.y;}edit.afterTrimPivot.emplace(pivot);
  if(canvas.x||canvas.y)for(const auto& c:original.cels)if(c.surface){const auto resolved=timeline_.resolveSurface(c.id);if(resolved.issue!=timeline::LinkIssue::None||!resolved.source)throw std::runtime_error("Invalid tween resize owner");if(resolved.source->id!=c.id)continue;const auto& s=*c.surface;const int x=raster::coordinate(std::int64_t(s.offsetX)-canvas.x),y=raster::coordinate(std::int64_t(s.offsetY)-canvas.y);raster::coordinate(std::int64_t(x)+s.width);raster::coordinate(std::int64_t(y)+s.height);shiftedOwners.insert(c.id);edit.ownerOffsets.push_back({c.id,s.offsetX,s.offsetY,x,y});}
  for(auto& c:edit.detachedCels)if(c.surface){auto& s=*c.surface;s.offsetX=raster::coordinate(std::int64_t(s.offsetX)-canvas.x);s.offsetY=raster::coordinate(std::int64_t(s.offsetY)-canvas.y);raster::coordinate(std::int64_t(s.offsetX)+s.width);raster::coordinate(std::int64_t(s.offsetY)+s.height);}
 }
 auto candidate=original;const auto insertion=timeline_.frameIndex(start)+1;
 if(resized)for(auto& c:candidate.cels)if(c.surface&&shiftedOwners.count(c.id)){c.surface->offsetX=raster::coordinate(std::int64_t(c.surface->offsetX)-canvas.x);c.surface->offsetY=raster::coordinate(std::int64_t(c.surface->offsetY)-canvas.y);}
 candidate.frames.insert(candidate.frames.begin()+insertion,edit.detachedFrames.begin(),edit.detachedFrames.end());candidate.cels.insert(candidate.cels.end(),edit.detachedCels.begin(),edit.detachedCels.end());
 for(auto& section:candidate.loopSections){const auto range=timeline::loopRange(original,section);if(range.end>=0&&original.frames[range.end].id==start){if(section.endFrameId==start)section.endFrameId=ids.back();else if(section.startFrameId==start)section.startFrameId=ids.back();}}
 int number=1;auto loopName=[&]{const auto n=std::to_string(number);return U"补间 "+std::u32string(n.begin(),n.end());};while(std::any_of(candidate.loopSections.begin(),candidate.loopSections.end(),[&](const auto& l){return l.name==loopName();}))++number;
 timeline::LoopSection loop;loop.id=fresh("loop-tween-native-");loop.name=loopName();loop.startFrameId=start;loop.endFrameId=source.endFrameId;loop.direction="forward";candidate.loopSections.push_back(std::move(loop));
 edit.afterLoops=candidate.loopSections;for(const auto& f:candidate.frames)edit.afterFrames.push_back(f.id);edit.afterActive=layerId;edit.afterFrame=ids.front();edit.afterSelection=ids;edit.afterFrameAnchor=ids.front();edit.afterTimelineSelection=TimelineSelection{};
 timeline::Timeline validated(std::move(candidate));if(!validated.diagnoseLinks().empty())throw std::runtime_error("Tween creates an invalid Cel link");
 for(const auto& id:ids)for(const auto& layer:validated.state().layers){const auto* c=validated.findCel(layer.id,id);if(!c)throw std::runtime_error("Tween creates an incomplete raster frame");const auto resolved=validated.resolveSurface(c->id);if(!resolved.surface)throw std::runtime_error("Tween creates an unavailable raster surface");}
 for(auto& layer:validated.state_.layers){const auto* c=validated.findCel(layer.id,edit.afterFrame);const auto resolved=validated.resolveSurface(c->id);if(resolved.source&&resolved.source->opacity&&std::isfinite(*resolved.source->opacity))layer.opacity=std::clamp(*resolved.source->opacity,0.,1.);}
 for(const auto& l:validated.state().layers)edit.afterLayerOpacityProjection.push_back({l.id,l.opacity});
 auto activeLayer=edit.afterActive,activeFrame=edit.afterFrame,anchor=*edit.afterFrameAnchor;auto selectionAfter=resized?edit.afterPixelsSelection:selection_;auto selectedAfter=ids;history_.reserve(position_+1);
 timeline_=std::move(validated);nextFrameId_=next;activeLayerId_=std::move(activeLayer);activeFrameId_=std::move(activeFrame);frameAnchor_=std::move(anchor);selectedFrames_=std::move(selectedAfter);timelineSelection_={};if(resized){width_=canvas.width;height_=canvas.height;selection_=std::move(selectionAfter);selectionPivotHistory_.pivot=pivot;++selectionPivotHistory_.serial;}
 change_={0,0,width_,height_};publishChange();pushEdit(std::move(edit),U"交叉淡化补间");return true;
}
}
