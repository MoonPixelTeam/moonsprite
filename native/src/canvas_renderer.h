#pragma once
#include "document.h"
#include <cmath>
#include "layer_compositor.h"
#include "os/os.h"
#include "ui/graphics.h"
#include "include/core/SkBitmap.h"
namespace moon {
// Shared native upload for canvas and static previews. Source is straight
// packed RGBA; rowPixels may exceed width for a crop of a larger surface.
void uploadRgbaRegion(os::Surface& target,const timeline::Pixel* source,int width,int height,std::size_t rowPixels,int x=0,int y=0);
// Native adapter of canvas-composite-cache.ts + canvas-render-background.ts.
// Owns render resources only; document changes originate in core transactions.
struct CheckerboardSettings {
  int size=16;
  gfx::Color light=gfx::rgba(192,192,192),dark=gfx::rgba(128,128,128);
  gfx::Color at(double x,double y)const{return (int(std::floor(x/size))+int(std::floor(y/size)))%2?dark:light;}
};
class CanvasRenderer {
  os::SurfaceRef content_;
  std::uint64_t identity_=0,revision_=0;
  unsigned uploads_=0;
  OnionSkinSettings onion_;
  bool onionPlaying_=false;
  bool relativeLuminance_=false,syncedRelativeLuminance_=false;
  std::string onionLayer_;
  std::uint64_t onionGeneration_=0,syncedOnionGeneration_=0;
  std::uint64_t uploadedPixels_=0;
  std::uint64_t pendingRevision_=0;
  PixelRegion pendingChange_,gradientBounds_;std::uint64_t gradientRevision_=0;
  SkBitmap checker_;
  gfx::Color checkerA_=0,checkerB_=0;
public:
  void setOnionSkin(OnionSkinSettings settings,bool playing=false);
  void setRelativeLuminance(bool enabled){relativeLuminance_=enabled;}
  bool relativeLuminance()const{return relativeLuminance_;}
  void noteChange(const Document& document);
  void sync(const Document& document);
  void draw(ui::Graphics& g,const gfx::Rect& target,double pixelScale,gfx::Color a,gfx::Color b,int checkerSize=16);
  std::uint64_t uploadedPixels() const {return uploadedPixels_;}
  unsigned uploads() const {return uploads_;}
};
}
