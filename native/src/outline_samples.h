#pragma once
#include "selection_model.h"
#include "raster_geometry.h"
#include <unordered_map>
#include <functional>
namespace moon {
struct OutlineSample {std::size_t index;timeline::Pixel reference;};
// Position: inside0/outside1/both2; kernel round0/square1/horizontal2/vertical3.
struct OutlineSampling {double thickness=1;int position=1,kernel=0;unsigned directions=90;timeline::Pixel background=0;std::optional<timeline::Pixel> sourceColor;};
struct OutlineSettings {
 OutlineSampling sampling;timeline::Pixel color=0xff000000;bool smartHue=false;double darkness=45;bool followOpacity=false,previewEnabled=true;
};
std::vector<OutlineSample> outlineSamples(const timeline::Surface&,int width,int height,const std::optional<SelectionMask>&,const OutlineSampling&,const std::function<bool()>& cancelled={});
std::vector<OutlineSample> outlineBoundarySamples(const timeline::Surface&,int width,int height,const std::optional<SelectionMask>&,const OutlineSampling&,const std::function<bool()>& cancelled={});
timeline::Pixel outlineStrokeColor(timeline::Pixel color,timeline::Pixel reference,bool smartHue=false,double darkness=45,bool followOpacity=false);
}
