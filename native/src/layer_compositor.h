#pragma once
#include "timeline_model.h"
namespace moon {
struct CompositeRegion {int x=0,y=0,width=0,height=0;};
// Adapter for legacy ordinary RGBA/normal layer stack, topmost first.
// Output is only the requested rectangle; caller retains unrelated cached pixels.
// Unmigrated z-order, cel opacity and storage origins reject; valid links resolve once per layer.
std::vector<timeline::Pixel> compositeNormalRegion(const timeline::Timeline& timeline,
 const std::string& frameId,CompositeRegion region,const std::string& previewLayer={},const std::vector<timeline::Pixel>* preview=nullptr,int previewWidth=0,int previewX=0,int previewY=0);
struct OnionSkinSettings {
 bool enabled=false,allLayers=false,showDuringPlayback=true;
 int previousFrames=1,nextFrames=1,previousOpacity=35,nextOpacity=35;
 timeline::Pixel previousColor=0xff5053ef,nextColor=0xffff7929;
};
// Display only: legacy ghost layers are inserted immediately below their owning layer.
std::vector<timeline::Pixel> compositeOnionRegion(const timeline::Timeline& timeline,
 const std::string& frameId,const std::string& layerId,CompositeRegion region,const OnionSkinSettings& settings,const std::string& previewLayer={},const std::vector<timeline::Pixel>* preview=nullptr,int previewWidth=0);
timeline::Pixel tintOnionPixel(timeline::Pixel source,timeline::Pixel tint,int opacity,int distance);
// Preserves the existing direct-pixel path for the editor's admitted single layer.
void compositeOpaqueRgbaRow(timeline::Pixel* output,const timeline::Pixel* source,std::size_t count);
}
