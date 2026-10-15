#include "canvas_renderer.h"
#include "relative_luminance.h"
#include "layer_compositor.h"
#include "os/sampling.h"
#include "ui/paint.h"
#include "os/skia/skia_surface.h"
#include "include/core/SkShader.h"
#include "include/core/SkTileMode.h"
#include <stdexcept>
namespace moon {
void uploadRgbaRegion(os::Surface& target,const timeline::Pixel* source,int width,int height,std::size_t rowPixels,int x,int y){
  if(!source || width<1 || height<1 || rowPixels<std::size_t(width) || x<0 || y<0 || width>target.width()-x || height>target.height()-y)throw std::invalid_argument("Invalid RGBA upload region");
  os::SurfaceLock lock(&target);
  auto* skia=dynamic_cast<os::SkiaSurface*>(&target);
  if(skia && skia->canvas().writePixels(SkImageInfo::Make(width,height,kRGBA_8888_SkColorType,kUnpremul_SkAlphaType),source,rowPixels*sizeof(timeline::Pixel),x,y))return;
  for(int row=0;row<height;++row)for(int col=0;col<width;++col){const auto p=source[std::size_t(row)*rowPixels+col];ui::Paint paint(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24));paint.blendMode(os::BlendMode::Src);target.drawRect(gfx::Rect(x+col,y+row,1,1),paint);}
}
void CanvasRenderer::setOnionSkin(OnionSkinSettings settings,bool playing){
 const bool effective=settings.enabled && (!playing || settings.showDuringPlayback);
 if(onion_.enabled!=effective || onion_.allLayers!=settings.allLayers || onion_.previousFrames!=settings.previousFrames || onion_.nextFrames!=settings.nextFrames || onion_.previousOpacity!=settings.previousOpacity || onion_.nextOpacity!=settings.nextOpacity || onion_.previousColor!=settings.previousColor || onion_.nextColor!=settings.nextColor)++onionGeneration_;
 onion_=settings;onion_.enabled=effective;onionPlaying_=playing;
}
void CanvasRenderer::noteChange(const Document& doc) {
  if(!content_ || identity_!=doc.identity() || doc.contentRevision()==revision_) return;
  const auto previous=pendingChange_.empty()?revision_:pendingRevision_;
  if(doc.contentRevision()!=previous+1) {pendingChange_={};pendingRevision_=0;return;}
  const auto region=doc.lastContentChange();
  if(!region.empty()) {pendingChange_.include(region.x,region.y);pendingChange_.include(region.x+region.w-1,region.y+region.h-1);}
  pendingRevision_=doc.contentRevision();
}
void CanvasRenderer::sync(const Document& doc) {
  const bool gradientChanged=gradientRevision_!=doc.gradientRevision();
 const bool displayChanged=syncedRelativeLuminance_!=relativeLuminance_ || syncedOnionGeneration_!=onionGeneration_ || (onion_.enabled && onionLayer_!=doc.layer().id);
  if(content_ && identity_==doc.identity() && revision_==doc.contentRevision() && !displayChanged && !gradientChanged) return;
  const bool replacement=!content_ || identity_!=doc.identity() || content_->width()!=doc.width() || content_->height()!=doc.height();
  if(replacement) {
    content_=os::instance()->makeRgbaSurface(doc.width(),doc.height());
    if(!content_) throw std::runtime_error("Cannot allocate canvas content cache");
  }
  // Missed revisions/new document require a full upload; otherwise repair only
  // the core's dirty rectangle (including live stroke/cancel/undo/redo changes).
  auto region=doc.lastContentChange();
  if(!replacement && !pendingChange_.empty() && pendingRevision_==doc.contentRevision()) region=pendingChange_;
  else if(replacement || revision_+1!=doc.contentRevision() || region.empty()) region={0,0,doc.width(),doc.height()};
  if(gradientChanged && !replacement && revision_==doc.contentRevision()){region=gradientBounds_;const auto next=doc.gradientBounds();if(!next.empty()){region.include(next.x,next.y);region.include(next.x+next.w-1,next.y+next.h-1);}}
  if(displayChanged)region={0,0,doc.width(),doc.height()};
  const bool direct=!onion_.enabled && doc.timeline().state().layers.size()==1 && doc.layer().visible && doc.layer().opacity==1;
  const auto composed=direct?std::vector<timeline::Pixel>{}:(onion_.enabled?compositeOnionRegion(doc.displayTimeline(),doc.frame().id,doc.layer().id,{region.x,region.y,region.w,region.h},onion_,doc.layer().id,doc.gradientPreviewPixels(),doc.width()):compositeNormalRegion(doc.displayTimeline(),doc.frame().id,{region.x,region.y,region.w,region.h},doc.layer().id,doc.gradientPreviewPixels(),doc.width(),0,0,!doc.active()));
  {
    // Resolve the active storage once per upload, not once per pixel. Skia
    // handles packed straight RGBA -> native premultiplied conversion in bulk.
    const auto* source=direct?doc.displayPixels().data()+std::size_t(region.y)*doc.width()+region.x:composed.data();
    if(relativeLuminance_){std::vector<timeline::Pixel> gray(std::size_t(region.w)*region.h);const auto stride=direct?doc.width():region.w;for(int y=0;y<region.h;++y)for(int x=0;x<region.w;++x)gray[std::size_t(y)*region.w+x]=relativeLuminancePixel(source[std::size_t(y)*stride+x]);uploadRgbaRegion(*content_,gray.data(),region.w,region.h,region.w,region.x,region.y);}
    else uploadRgbaRegion(*content_,source,region.w,region.h,direct?doc.width():region.w,region.x,region.y);
  }
  uploadedPixels_+=std::uint64_t(region.w)*region.h;
  syncedRelativeLuminance_=relativeLuminance_;onionLayer_=doc.layer().id;syncedOnionGeneration_=onionGeneration_;
  gradientRevision_=doc.gradientRevision();gradientBounds_=doc.gradientBounds();identity_=doc.identity();revision_=doc.contentRevision();++uploads_;pendingChange_={};pendingRevision_=0;
}
void CanvasRenderer::draw(ui::Graphics& g,const gfx::Rect& target,double pixelScale,gfx::Color a,gfx::Color b,int checkerSize) {
  if(!content_) throw std::runtime_error("Canvas cache must be synchronized before drawing");
  if(checker_.empty() || checkerA_!=a || checkerB_!=b) {
    // legacy uses a fixed 2x2 tile; never allocate a viewport-sized checker.
    SkBitmap tile;
    if(!tile.tryAllocPixels(SkImageInfo::MakeN32Premul(2,2))) throw std::runtime_error("Cannot allocate checker tile");
    for(int y=0;y<2;++y) for(int x=0;x<2;++x) {
      const auto c=(x+y)%2?b:a;
      *tile.getAddr32(x,y)=SkColorSetARGB(255,gfx::getr(c),gfx::getg(c),gfx::getb(c));
    }
    tile.setImmutable();checker_=tile;checkerA_=a;checkerB_=b;
  }
  ui::Paint background(a);
  // legacy canvas-render-background.ts: document-anchored fixed 2x2 tile,
  // light first; cells below two display pixels collapse to solid light.
  const double cell=std::clamp(checkerSize,1,256)*pixelScale;
  if(cell>=2) {
    const auto matrix=SkMatrix::MakeAll(float(cell),0,float(target.x+g.getInternalDeltaX()),
                                      0,float(cell),float(target.y+g.getInternalDeltaY()),0,0,1);
    background.skPaint().setShader(checker_.makeShader(SkTileMode::kRepeat,SkTileMode::kRepeat,SkSamplingOptions(),matrix));
  }
  g.drawRect(target,background);
  ui::Paint composite;composite.blendMode(os::BlendMode::SrcOver);
  g.drawSurface(content_.get(),gfx::Rect(0,0,content_->width(),content_->height()),target,os::Sampling(),&composite);
}
}
