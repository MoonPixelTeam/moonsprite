#pragma once
#include "pixel_font.h"
#include "skin_assets.h"
#include "os/os.h"
#include "ui/button.h"
#include "ui/scroll_bar.h"
#include "ui/timer.h"
#include "ui/entry.h"
#include "ui/menu.h"
#include "ui/size_hint_event.h"
#include "ui/graphics.h"
#include "ui/paint_event.h"
#include <functional>
#include <map>
#include <optional>
#include "include/core/SkBitmap.h"

namespace moon {
struct Skin {
  std::map<std::string,gfx::Color> colors;
  SkinAssets assets;
  // UI glyphs share theme ink; color artwork and cursor/selection materials do not.
  bool monochromeIcons=false;
  struct CachedImage {
    std::shared_ptr<const SkinBitmap> bitmap;
    os::SurfaceRef surface;
    gfx::Color ink=gfx::rgba(0,0,0,0);
    std::array<int,4> borders{-1,-1,-1,-1};
    bool stretchEquivalent=false;
    std::map<std::array<int,4>,SkBitmap> tiles;
  };
  mutable std::map<std::string,CachedImage> cache;
  gfx::Color operator[](const char* key) const {
    auto i=assets.colors.find(key);
    if(i==assets.colors.end()) return colors.at(key);
    auto v=i->second;return gfx::rgba(v&255,(v>>8)&255,(v>>16)&255,v>>24);
  }
  static Skin load(const std::filesystem::path& path);
  bool draw(ui::Graphics& g,const std::string& slot,gfx::Rect rc,bool icon=false,int opacity=255) const;
  // All geometry arguments below are physical display pixels. Material bounds
  // include the complete skin; border bounds refer to its innermost black line.
  gfx::Rect selectionMaterialBounds(gfx::Rect borderBounds) const;
  bool selectionContains(gfx::Rect materialBounds,gfx::Point displayPoint) const;
  void drawSelection(ui::Graphics& g,gfx::Rect rc,bool hover) const {draw(g,hover?"selection.hover":"selection.normal",rc);}
  void drawSelectionBorder(ui::Graphics& g,gfx::Rect physicalBorder,bool hover) const;
  bool drawPanelTab(ui::Graphics& g,gfx::Rect rc,bool first) const;
};
class PixelButton : public ui::Button {
  const PixelFont& font_; const Skin& skin_;
  ui::Timer groupHold_{400,this};
  gfx::Point groupPressOrigin_;
public:
  bool timelineCel=false;
  bool timelineSelected=false;
  bool timelineBackgroundHover=false;
  bool timelineParentPainted=false,timelineVisible=false;
  std::function<void()> timelineRepaint;
  std::function<void(const ui::MouseMessage&)> timelinePress;
  bool centerCaption=false;
  int timelineCaptionPadding=0;
  int iconGroupIndex=0,iconGroupCount=0;
  std::u32string caption;
  std::string skinStyle;
  std::string icon;
  const Skin* iconSkin=nullptr;
  const Skin* menuMarks=nullptr;
  bool mutedIcon=false;
  bool doubleClickLeftOnly=false;
  std::function<void()> hover, context, openGroup, doubleClick;
  std::function<void(int)> rowDrop,frameDrop,frameDrag;
  std::function<void(const ui::MouseMessage&)> framePress;
  std::function<void()> frameClick;
  int frameDragStart=0;
  int rowDragStart=0;
  std::function<void(const ui::MouseMessage&)> palettePress;
  std::function<void()> paletteRepaint;
  std::function<bool()> paletteSelectionHover;
  bool active=false;
  bool tab=false;
  bool paletteCell=false;
  std::function<gfx::Rect()> paletteViewport; // Physical paint and input clip.
  bool paletteSharedSelection=false;
  bool foregroundMarker=false,backgroundMarker=false;
  int paletteMarkerSize=0;
  bool colorRole=false,recentColorSwatch=false;
  bool labelOnly=false,iconWithCaption=false,bareIconWithCaption=false;
  bool firstTab=false;
  bool tabAdd=false,bareTabIcon=false;
  std::uint32_t swatch=0;
  PixelButton(const PixelFont& font,const Skin& skin,std::u32string label,std::function<void()> action);
  gfx::Rect iconContentBounds(const std::string& state="normal") const;
  gfx::Rect paletteColorBounds() const;
  bool paletteSelectionContains(gfx::Point position) const;
  void paintTimelineContent(ui::Graphics& g,gfx::Rect rc,gfx::Point physicalOffset={});
  void onPaint(ui::PaintEvent& ev) override;
  bool onProcessMessage(ui::Message* msg) override;
};
// Reuse Aseprite's MIT ScrollBar interaction and thumb geometry; only the
// document-independent delegate and pixel skin are adapted here.
class PixelScrollBar : public ui::ScrollBar, private ui::ScrollableViewDelegate {
  const Skin& skin_;
  bool vertical_;
  bool thumbHover_=false;
  int total_=0,page_=0,value_=0;
  gfx::Size visibleSize() const override {return {page_,page_};}
  gfx::Point viewScroll() const override {return {value_,value_};}
  void setViewScroll(const gfx::Point& point) override;
public:
  std::function<void(int)> changed;
  int wheelStep=1;
  PixelScrollBar(const Skin& skin,bool vertical);
  void setDockBounds(gfx::Rect track); // Share one base-pixel edge with the adjacent content.
  void configure(int total,int page,int value);
  gfx::Rect thumbBounds(); // Physical display coordinates for paint and hover.
  void onPaint(ui::PaintEvent& ev) override;
  bool onProcessMessage(ui::Message* msg) override;
};
class PixelEntry : public ui::Entry {
  const PixelFont& font_;const Skin& skin_;
  bool scrubbing_=false;
  bool selectionHover_=false;
  int scrubLastX_=0;
public:
  std::function<gfx::Rect()> paletteViewport;
  bool numeric=false;
  double numericStep=1;
  void adjustNumber(int delta);
  bool commitExpression();
  std::function<void()> accept, cancel, blur, focus, hover;
  std::u32string suffix;
  std::function<void(int)> wheel;
  bool onProcessMessage(ui::Message* msg) override;
  PixelEntry(const PixelFont& font,const Skin& skin):ui::Entry(256,""),font_(font),skin_(skin) {setScale(gfx::PointF(2,2));setTransparent(true);}
  void onPaint(ui::PaintEvent& ev) override;
};
std::u32string unicodeText(const std::string& value);
std::string utf8Text(const std::u32string& value);
class PixelSlider : public ui::Widget {
  const PixelFont& font_;const Skin& skin_;
  bool active_=false,selectionHover_=false;
  void begin();void finish();void change(int next,bool shift);
public:
  int minimum=0,maximum=100,value=100;
  bool percentage=true;
  std::function<void(int)> changed;
  std::function<void()> interactionBegin,interactionCommit,interactionCancel;
  PixelSlider(const PixelFont& font,const Skin& skin):ui::Widget(ui::kGenericWidget),font_(font),skin_(skin) {setFocusStop(true);setTransparent(true);}
  bool onProcessMessage(ui::Message* msg) override;
  void onPaint(ui::PaintEvent& ev) override;
};
class PixelMenu : public ui::Menu {
  const Skin& skin_;
public:
  explicit PixelMenu(const Skin& skin);
  void onPaint(ui::PaintEvent& ev) override;
};
class PixelMenuSeparator : public ui::MenuSeparator {
  const Skin& skin_;
public:
  explicit PixelMenuSeparator(const Skin& skin):skin_(skin) {}
  void onPaint(ui::PaintEvent& ev) override;
  void onSizeHint(ui::SizeHintEvent& ev) override;
};
class PixelMenuItem : public ui::MenuItem {
  const PixelFont& font_; const Skin& skin_;
  std::u32string caption_, shortcut_;
public:
  int barInsetReduction=0;
  const Skin* iconSkin=nullptr;
  const Skin* menuMarks=nullptr;
  std::string icon;
  std::function<bool()> available, checked;
  PixelMenuItem(const PixelFont& font,const Skin& skin,std::u32string caption,std::u32string shortcut=U"");
  void onPaint(ui::PaintEvent& ev) override;
  void onSizeHint(ui::SizeHintEvent& ev) override;
  void setCaption(std::u32string caption) {if(caption_!=caption){caption_=std::move(caption);invalidate();}}
  void onValidate() override;
};
// Read-only input face plus arrow button; options use the existing native menu.
class PixelDropdown : public PixelButton {
  const PixelFont& dropdownFont_;const Skin& dropdownSkin_;
  std::vector<std::u32string> options_;
  int selectedIndex_=-1;
  bool open_=false,arrowHover_=false,arrowPressed_=false;
  std::optional<gfx::Point> pointer_;
  void updateHover();
  gfx::Rect arrowBounds() const;
public:
  std::function<void(int)> changed;
  std::function<void()> prepareOptions;
  PixelDropdown(const PixelFont& font,const Skin& skin);
  void setOptions(std::vector<std::u32string> options);
  void setSelectedIndex(int index,bool notify=false);
  int selectedIndex() const {return selectedIndex_;}
  void showOptions();
  void onPaint(ui::PaintEvent& ev) override;
  bool onProcessMessage(ui::Message* msg) override;
};

}
