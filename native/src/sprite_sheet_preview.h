#pragma once
#include "native_widgets.h"
#include "image_export.h"
namespace moon::editor {
class SpriteSheetPreview final : public ui::Widget {

  const Skin& skin_;os::SurfaceRef image_;int imageWidth_=0,imageHeight_=0;

public:
  explicit SpriteSheetPreview(const Skin& skin);
  void setImage(StaticImageExport image);
  void clearImage();
  void onPaint(ui::PaintEvent& ev) override;

};
}
