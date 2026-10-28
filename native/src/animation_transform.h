#pragma once
#include "animation_crossfade.h"
namespace moon {
enum class TransformTweenScope{Frame,Loop};
struct TweenPathPoint{double x=0,y=0;};
struct TransformTweenOptions:CrossfadeTweenOptions {
 TransformTweenOptions(){layerScope=TweenLayerScope::Current;}
 TransformTweenScope scope=TransformTweenScope::Frame;std::string loopSectionId;
 std::optional<std::vector<TweenPathPoint>> path;std::optional<TweenPathPoint> pathAnchor;
 double offsetX=16,offsetY=0,rotation=0,scale=100,opacity=100;
};
struct TransformTweenSource {std::vector<std::string> frameIds,layerIds;std::string insertionFrameId;TweenRegion pivot;};
std::optional<timeline::Surface> transformTweenEndpointPreview(const timeline::Timeline&,const TransformTweenSource&,const TransformTweenOptions&);
TweenPathPoint tweenTranslation(const TransformTweenOptions&,double progress);
void validateTransformTweenOptions(const TransformTweenOptions&);
TransformTweenSource prepareTransformTweenSource(const timeline::Timeline&,const std::string&,const std::string&,const TransformTweenOptions&,const std::vector<std::string>& selected={});
std::string transformTweenSourceFrameId(const TransformTweenSource&,const TransformTweenOptions&,int);
timeline::Surface transformTweenSurface(const timeline::Surface&,TweenRegion,const TransformTweenOptions&,double,std::size_t&,std::size_t maxPixels=16*1024*1024);
CrossfadeTweenFrame prepareTransformTweenFrame(const timeline::Timeline&,const TransformTweenSource&,const TransformTweenOptions&,int,std::size_t&,std::size_t maxPixels=16*1024*1024);
TweenRegion transformTweenPreviewBounds(const timeline::Timeline&,const TransformTweenSource&,const TransformTweenOptions&);
TweenRegion transformTweenCanvasBounds(const timeline::Timeline&,const std::vector<timeline::Cel>&,int,int);
std::vector<timeline::Pixel> compositeTransformTweenPreview(const timeline::Timeline&,const TransformTweenSource&,const TransformTweenOptions&,int,TweenRegion);
}
