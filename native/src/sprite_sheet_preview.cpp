#include "sprite_sheet_preview.h"
#include "canvas_renderer.h"
#include "ui/graphics.h"
#include "ui/paint_event.h"
#include "ui/paint.h"
#include "ui_scale.h"
#include "os/os.h"
#include "os/sampling.h"
#include <algorithm>
#include <stdexcept>
namespace moon::editor {
SpriteSheetPreview::SpriteSheetPreview(const Skin& skin):ui::Widget(ui::kGenericWidget),skin_(skin) {setTransparent(false);setVisible(false);}

void SpriteSheetPreview::setImage(StaticImageExport image) {auto surface=os::instance()->makeRgbaSurface(image.width,image.height);if(!surface)throw std::runtime_error("Cannot allocate sheet preview");uploadRgbaRegion(*surface,image.pixels.data(),image.width,image.height,image.width);imageWidth_=image.width;imageHeight_=image.height;image_=std::move(surface);invalidate();}

void SpriteSheetPreview::clearImage() {image_.reset();imageWidth_=imageHeight_=0;invalidate();}

void SpriteSheetPreview::onPaint(ui::PaintEvent& ev) {auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());g.fillRect(skin_["background"],r);skin_.draw(g,"panel_content",r);if(!image_)return;int fit=std::max(1,std::min((r.w-6)/imageWidth_,(r.h-6)/imageHeight_));gfx::Rect d(r.x+(r.w-imageWidth_*fit)/2,r.y+(r.h-imageHeight_*fit)/2,imageWidth_*fit,imageHeight_*fit);g.saveClip();g.clipRect(r);ui::Paint over;over.blendMode(os::BlendMode::SrcOver);g.drawSurface(image_.get(),{0,0,imageWidth_,imageHeight_},d,os::Sampling(),&over);g.restoreClip();}
}
