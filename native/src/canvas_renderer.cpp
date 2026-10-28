#include "canvas_renderer.h"
#include "relative_luminance.h"
#include "layer_compositor.h"
#include "cel_properties.h"
#include "raster_geometry.h"
#include "os/sampling.h"
#include "ui/paint.h"
#include "os/skia/skia_surface.h"
#include "include/core/SkShader.h"
#include "include/core/SkTileMode.h"
#include <stdexcept>
namespace moon {
void uploadRgbaRegion(os::Surface& target,const timeline::Pixel* source,int width,int height,std::size_t rowPixels,int x,int y){
  if(!source || width<1 || height<1 || rowPixels<std::size_t(width) || x<0 || y<0 || width>target.width()-x || height>target.height()-y)throw std::invalid_argument("Invalid RGBA upload region source="+std::to_string(bool(source))+" size="+std::to_string(width)+"x"+std::to_string(height)+" stride="+std::to_string(rowPixels)+" origin="+std::to_string(x)+","+std::to_string(y)+" target="+std::to_string(target.width())+"x"+std::to_string(target.height()));
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
// Dirty-rectangle adapter, retaining the last displayed preview footprint.
bool CanvasRenderer::syncTilemapPreview(const Document& doc,const std::string& frame,bool eligible){
 const auto* next=doc.tilemapPreviewRegions();const auto& state=doc.displayTimeline().state();
 const bool simple=state.groups.empty()&&state.masks.empty()&&!doc.maskIsolated()&&std::none_of(state.layers.begin(),state.layers.end(),[](const auto& layer){return timeline::styleVisible(layer.layerStyles);});
 if(!eligible||!simple||(!next&&!tilemapPreviewLocal_))return false;
 auto regions=tilemapPreviewRegions_;if(next)regions.insert(regions.end(),next->begin(),next->end());
 std::vector<PixelRegion> unique;for(auto region:regions){const int left=std::clamp(region.x,0,doc.width()),top=std::clamp(region.y,0,doc.height()),right=std::clamp(region.x+region.w,0,doc.width()),bottom=std::clamp(region.y+region.h,0,doc.height());if(right<=left||bottom<=top)continue;region={left,top,right-left,bottom-top};if(std::none_of(unique.begin(),unique.end(),[&](const auto& r){return r.x==region.x&&r.y==region.y&&r.w==region.w&&r.h==region.h;}))unique.push_back(region);}
 for(const auto& region:unique){auto pixels=onion_.enabled?compositeOnionRegion(doc.displayTimeline(),frame,doc.layer().id,{region.x,region.y,region.w,region.h},onion_):compositeNormalRegion(doc.displayTimeline(),frame,{region.x,region.y,region.w,region.h},{},nullptr,0,0,0,false);if(relativeLuminance_)for(auto& value:pixels)value=relativeLuminancePixel(value);uploadRgbaRegion(*content_,pixels.data(),region.w,region.h,region.w,region.x,region.y);uploadedPixels_+=std::uint64_t(region.w)*region.h;}
 tilemapPreviewRegions_=next?*next:std::vector<PixelRegion>{};tilemapPreviewLocal_=next!=nullptr;
 syncedRelativeLuminance_=relativeLuminance_;onionLayer_=doc.layer().id;syncedOnionGeneration_=onionGeneration_;floatingRevision_=doc.floatingOverlayRevision();gradientRevision_=doc.gradientRevision();gradientBounds_=doc.gradientBounds();identity_=doc.identity();revision_=doc.contentRevision();++uploads_;pendingChange_={};pendingRevision_=0;return true;
}
void CanvasRenderer::sync(const Document& doc) {
  if(!previewFrame_.empty()){previewFrame_.clear();identity_=0;}
  const bool floatingChanged=floatingRevision_!=doc.floatingOverlayRevision();
  const bool gradientChanged=gradientRevision_!=doc.gradientRevision();
 const bool displayChanged=syncedRelativeLuminance_!=relativeLuminance_ || syncedOnionGeneration_!=onionGeneration_ || (onion_.enabled && onionLayer_!=doc.layer().id);
  if(content_ && identity_==doc.identity() && revision_==doc.contentRevision() && !displayChanged && !gradientChanged && !floatingChanged) return;
  const bool replacement=!content_ || identity_!=doc.identity() || content_->width()!=doc.width() || content_->height()!=doc.height();
  if(replacement) {
    content_=os::instance()->makeRgbaSurface(doc.width(),doc.height());
    if(!content_) throw std::runtime_error("Cannot allocate canvas content cache");
  }
  if(syncTilemapPreview(doc,doc.frame().id,!replacement&&gradientChanged&&revision_==doc.contentRevision()&&!displayChanged&&!floatingChanged))return;
  // Missed revisions/new document require a full upload; otherwise repair only
  // the core's dirty rectangle (including live stroke/cancel/undo/redo changes).
  auto region=doc.lastContentChange();
  if(!replacement && !pendingChange_.empty() && pendingRevision_==doc.contentRevision()) region=pendingChange_;
  else if(replacement || revision_+1!=doc.contentRevision() || region.empty()) region={0,0,doc.width(),doc.height()};
  if(gradientChanged && !replacement && revision_==doc.contentRevision()){region=gradientBounds_;const auto next=doc.gradientBounds();if(!next.empty()){region.include(next.x,next.y);region.include(next.x+next.w-1,next.y+next.h-1);}if(region.empty())region={0,0,doc.width(),doc.height()};}
  if(displayChanged)region={0,0,doc.width(),doc.height()};
  if(gradientChanged&&(doc.tilemapPreviewRegions()||tilemapPreviewLocal_))region={0,0,doc.width(),doc.height()};
  if(floatingChanged&&!replacement&&!displayChanged){if(revision_==doc.contentRevision()&&floatingRevision_+1==doc.floatingOverlayRevision())region=doc.floatingOverlayChange();else if(floatingRevision_+1!=doc.floatingOverlayRevision())region={0,0,doc.width(),doc.height()};else{auto delta=doc.floatingOverlayChange();if(!delta.empty()){region.include(delta.x,delta.y);region.include(delta.x+delta.w-1,delta.y+delta.h-1);}}if(region.empty())region={0,0,doc.width(),doc.height()};}
  const auto activeSurface=doc.displayTimeline().resolveSurface(doc.cel().id).surface;
  const bool canvasStorage=doc.gradientPreviewPixels() || (activeSurface && raster::fullCanvas(*activeSurface,doc.width(),doc.height()));
  const bool direct=!(doc.layer().kind=="tilemap"&&doc.active())&&!doc.maskIsolated()&&doc.displayTimeline().state().masks.empty()&&canvasStorage && !doc.floatingDeferred() && !onion_.enabled && doc.displayTimeline().state().groups.empty() && doc.displayTimeline().state().layers.size()==1 && !timeline::styleVisible(doc.layer().layerStyles) && doc.layer().visible && doc.layer().blendMode=="normal" && frameCelOpacity(doc.displayTimeline(),doc.layer(),doc.frame().id)==1;
  const auto overlay=doc.floatingDeferred()?doc.floatingOverlayRegion(onion_.enabled?PixelRegion{0,0,doc.width(),doc.height()}:region):std::vector<timeline::Pixel>{};
  const auto* preview=doc.floatingDeferred()?&overlay:doc.gradientPreviewPixels();
  const int previewWidth=doc.floatingDeferred()&&!onion_.enabled?region.w:doc.width();
  const int previewX=doc.floatingDeferred()&&!onion_.enabled?region.x:0,previewY=doc.floatingDeferred()&&!onion_.enabled?region.y:0;
  const auto composed=doc.maskIsolated()?doc.maskDisplayRegion(region):direct?std::vector<timeline::Pixel>{}:(onion_.enabled?compositeOnionRegion(doc.displayTimeline(),doc.frame().id,doc.layer().id,{region.x,region.y,region.w,region.h},onion_,doc.layer().id,preview,previewWidth,doc.maskPreview()):compositeNormalRegion(doc.displayTimeline(),doc.frame().id,{region.x,region.y,region.w,region.h},doc.layer().id,preview,previewWidth,previewX,previewY,!doc.active(),{},{},doc.maskPreview()));
  {
    // Resolve the active storage once per upload, not once per pixel. Skia
    // handles packed straight RGBA -> native premultiplied conversion in bulk.
    const auto* source=direct?doc.displayPixels().data()+std::size_t(region.y)*doc.width()+region.x:composed.data();
    if(relativeLuminance_){std::vector<timeline::Pixel> gray(std::size_t(region.w)*region.h);const auto stride=direct?doc.width():region.w;for(int y=0;y<region.h;++y)for(int x=0;x<region.w;++x)gray[std::size_t(y)*region.w+x]=relativeLuminancePixel(source[std::size_t(y)*stride+x]);uploadRgbaRegion(*content_,gray.data(),region.w,region.h,region.w,region.x,region.y);}
    else uploadRgbaRegion(*content_,source,region.w,region.h,direct?doc.width():region.w,region.x,region.y);
  }
  uploadedPixels_+=std::uint64_t(region.w)*region.h;
  const auto* tileRegions=doc.tilemapPreviewRegions();tilemapPreviewLocal_=tileRegions!=nullptr;tilemapPreviewRegions_=tileRegions?*tileRegions:std::vector<PixelRegion>{};
  syncedRelativeLuminance_=relativeLuminance_;onionLayer_=doc.layer().id;syncedOnionGeneration_=onionGeneration_;
  floatingRevision_=doc.floatingOverlayRevision();gradientRevision_=doc.gradientRevision();gradientBounds_=doc.gradientBounds();identity_=doc.identity();revision_=doc.contentRevision();++uploads_;pendingChange_={};pendingRevision_=0;
}
void CanvasRenderer::syncFrame(const Document& doc,const std::string& frame){
 if(frame==doc.frame().id){sync(doc);return;}
 const bool same=content_&&identity_==doc.identity()&&revision_==doc.contentRevision()&&previewFrame_==frame&&content_->width()==doc.width()&&content_->height()==doc.height();
 const bool displaySame=syncedRelativeLuminance_==relativeLuminance_&&syncedOnionGeneration_==onionGeneration_;
 if(same&&displaySame&&gradientRevision_==doc.gradientRevision()&&floatingRevision_==doc.floatingOverlayRevision())return;
 if(syncTilemapPreview(doc,frame,same&&displaySame&&!onion_.enabled&&gradientRevision_!=doc.gradientRevision()&&floatingRevision_==doc.floatingOverlayRevision()))return;
 if(!content_||content_->width()!=doc.width()||content_->height()!=doc.height()){content_=os::instance()->makeRgbaSurface(doc.width(),doc.height());if(!content_)throw std::runtime_error("Cannot allocate preview frame");}
 auto pixels=compositeNormalRegion(doc.displayTimeline(),frame,{0,0,doc.width(),doc.height()});if(relativeLuminance_)for(auto& value:pixels)value=relativeLuminancePixel(value);uploadRgbaRegion(*content_,pixels.data(),doc.width(),doc.height(),doc.width());previewFrame_=frame;identity_=doc.identity();revision_=doc.contentRevision();syncedRelativeLuminance_=relativeLuminance_;syncedOnionGeneration_=onionGeneration_;gradientRevision_=doc.gradientRevision();floatingRevision_=doc.floatingOverlayRevision();gradientBounds_=doc.gradientBounds();const auto* regions=doc.tilemapPreviewRegions();tilemapPreviewLocal_=regions!=nullptr;tilemapPreviewRegions_=regions?*regions:std::vector<PixelRegion>{};uploadedPixels_+=std::uint64_t(doc.width())*doc.height();++uploads_;pendingChange_={};pendingRevision_=0;
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
