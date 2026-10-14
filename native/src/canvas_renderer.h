#pragma once
#include "document.h"
#include "layer_compositor.h"
#include "os/os.h"
#include "ui/graphics.h"
#include "include/core/SkBitmap.h"
namespace moon {
// Native adapter of canvas-composite-cache.ts + canvas-render-background.ts.
// Owns render resources only; document changes originate in core transactions.
class CanvasRenderer {
  os::SurfaceRef content_;
  std::uint64_t identity_=0,revision_=0;
  unsigned uploads_=0;
  OnionSkinSettings onion_;
  bool onionPlaying_=false;
  std::string onionLayer_;
  std::uint64_t onionGeneration_=0,syncedOnionGeneration_=0;
  std::uint64_t uploadedPixels_=0;
  std::uint64_t pendingRevision_=0;
  PixelRegion pendingChange_,gradientBounds_;std::uint64_t gradientRevision_=0;
  SkBitmap checker_;
  gfx::Color checkerA_=0,checkerB_=0;
public:
  void setOnionSkin(OnionSkinSettings settings,bool playing=false);
  void noteChange(const Document& document);
  void sync(const Document& document);
  void draw(ui::Graphics& g,const gfx::Rect& target,double pixelScale,gfx::Color a,gfx::Color b);
  std::uint64_t uploadedPixels() const {return uploadedPixels_;}
  unsigned uploads() const {return uploads_;}
};
}
