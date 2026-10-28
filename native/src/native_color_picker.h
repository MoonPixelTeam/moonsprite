#pragma once
#include "color_picker_layout.h"
#include "color_picker_scheme.h"
#include "color_picker_quantization.h"
#include "native_widgets.h"
#include "ui/timer.h"

namespace moon {
// First migrated ColorPanel scheme: legacy's default continuous SV square.
// Owns view state only; caller routes changes through Document role commands.
class NativeColorPicker : public ui::Widget {
  const PixelFont& font_;const Skin& skin_;
  PickerRole roles_[2];
  ColorPickerScheme scheme_=ColorPickerScheme::SvSquare;
  PickerQuantization quantization_;PickerQuantTriangleGeometry quantTriangleGeometry_;
  PickerMoonField moonField_=PickerMoonField::HsvSquare;
  PickerMoonGesture moonGesture_;PickerMoonGeometry moonGeometry_;
  os::SurfaceRef moonRing_;int moonRingWidth_=0,moonRingHeight_=0;
  double fieldValue_=-1,stripHue_=-1,stripSaturation_=-1;
  gfx::Color fieldOutline_=0;
  Skin markerSkin_;int markerWidth_=4,markerHeight_=4;
  int role_=0,zone_=0,focusedZone_=1;
  bool pending_=false;
  ui::Timer frameTimer_;
  os::SurfaceRef field_,hueStrip_,alphaStrip_;
  int stripWidth_=0,stripHeight_=0;std::uint32_t alphaRgb_=0;gfx::Color checkerA_=0,checkerB_=0;
  int fieldSize_=0,fieldHeight_=0;double fieldHue_=-1;
  gfx::Rect fieldBounds() const;
  gfx::Rect stripBounds(int zone) const;
  void sample(const ui::MouseMessage& mouse);
  void queue();void flush();
  void drawMarker(ui::Graphics& g,const gfx::Rect& area,double x,double y,const os::SurfaceRef& background);
public:
  enum class Region {Hue=1,Alpha=2,Field=3};
  // Absolute physical pixels, matching mouse events and test click coordinates.
  gfx::Rect regionBounds(Region region) const;
  void loadMarkers(const std::filesystem::path& markerDir);
  std::function<void(std::uint32_t,bool)> changed;
  std::function<void()> interactionBegin,interactionCommit;
  explicit NativeColorPicker(const PixelFont& font,const Skin& skin,const std::filesystem::path& markerDir);
  ~NativeColorPicker() override;
  ColorPickerScheme scheme()const{return scheme_;}
  void setScheme(ColorPickerScheme scheme);
  PickerMoonField moonField()const{return moonField_;}
  void setMoonField(PickerMoonField field);
  PickerQuantization quantization()const{return quantization_;}
  void setQuantization(PickerQuantization q);
  void syncColors(std::uint32_t primary,std::uint32_t secondary);
  void finishInteraction();
  void smokeSurfacePixels();
  void onPaint(ui::PaintEvent& ev) override;
  bool onProcessMessage(ui::Message* msg) override;
};
}
