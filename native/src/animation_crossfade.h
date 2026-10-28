#pragma once
#include "timeline_model.h"
#include "animation_morph.h"
#include <array>
namespace moon {
enum class TweenBetweenMode{Morph,Crossfade};
enum class TweenEasing{Linear,EaseIn,EaseOut,EaseInOut,Custom};
enum class TweenLayerScope{Current,Selected,All};
struct CrossfadeTweenOptions{int frameCount=8,duration=100;TweenLayerScope layerScope=TweenLayerScope::All;TweenEasing easing=TweenEasing::Linear;std::array<double,4> curve{.42,0,.58,1};TweenBetweenMode betweenMode=TweenBetweenMode::Morph;bool autoCropCanvas=false;};
struct TweenRegion{int x=0,y=0,width=1,height=1;};
struct CrossfadeTweenLayerSource{std::string layerId;TweenRegion bounds;double startOpacity=1,endOpacity=1;std::optional<MorphTweenPlan> morph;};
struct CrossfadeTweenSource{std::string startFrameId,endFrameId;std::vector<std::string> layerIds;std::vector<CrossfadeTweenLayerSource> layers;};
struct CrossfadeTweenFrame{std::vector<timeline::Cel> cels;};
struct CrossfadeSurfaceResult{timeline::Surface surface;double opacity=1;};
void validateCrossfadeTweenOptions(const CrossfadeTweenOptions&);
double tweenProgress(double progress,TweenEasing easing,const std::array<double,4>& curve={.42,0,.58,1});
CrossfadeSurfaceResult crossfadeTweenSurface(const timeline::Surface* start,const timeline::Surface* end,TweenRegion bounds,double progress,double startOpacity,double endOpacity,std::size_t maxPixels=16*1024*1024);
CrossfadeTweenSource prepareCrossfadeTweenSource(const timeline::Timeline&,const std::string& startFrame,const std::string& activeLayer,TweenLayerScope,const std::vector<std::string>& selectedLayers={},TweenBetweenMode mode=TweenBetweenMode::Morph);
std::size_t crossfadeTweenAllocationBytes(const timeline::Timeline&,int width,int height,const CrossfadeTweenOptions&);
CrossfadeTweenFrame prepareCrossfadeTweenFrame(const timeline::Timeline&,int width,int height,const CrossfadeTweenSource&,const CrossfadeTweenOptions&,int step,std::size_t* remaining=nullptr,std::size_t maxPixels=16*1024*1024);
std::vector<timeline::Pixel> compositeCrossfadeTweenPreview(const timeline::Timeline&,int width,int height,const CrossfadeTweenSource&,const CrossfadeTweenOptions&,int step,std::optional<TweenRegion> region={});
TweenRegion crossfadeTweenPreviewBounds(const timeline::Timeline&,const CrossfadeTweenSource&);
}
