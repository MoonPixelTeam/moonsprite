#pragma once
#include "timeline_model.h"
#include <vector>
#include <functional>
namespace moon {
struct MorphBounds {int x=0,y=0,width=1,height=1;};
struct MorphShapeField {std::vector<timeline::Pixel> colors;std::vector<float> signedDistance;};
struct MorphTweenPlan {MorphBounds from,to;int width=1,height=1;MorphShapeField a,b;std::size_t byteLength()const{return (a.colors.size()+b.colors.size())*sizeof(timeline::Pixel)+(a.signedDistance.size()+b.signedDistance.size())*sizeof(float);}};
MorphTweenPlan prepareMorphTween(const timeline::Surface& start,const timeline::Surface& end,const RasterColorContext* colors=nullptr);
timeline::Surface morphTweenSurface(const MorphTweenPlan&,const timeline::Surface& start,const timeline::Surface& end,double progress,std::size_t maxPixels=16*1024*1024,const std::function<timeline::Pixel(timeline::Pixel)>& indexedColor={});
}
