#pragma once
#include "pixel_font.h"
#include "skin_assets.h"
#include "ui_scale.h"
#include "os/os.h"
#include "ui/button.h"
#include "ui/scroll_bar.h"
#include "ui/timer.h"
#include "ui/entry.h"
#include "ui/menu.h"
#include "ui/size_hint_event.h"
#include "ui/graphics.h"
#include "ui/paint_event.h"
#include "ui/popup_window.h"
#include <functional>
#include <map>
#include <optional>
#include "include/core/SkBitmap.h"

namespace moon {
class PhysicalViewportClip {
  ui::Graphics& g_;
public:
  PhysicalViewportClip(ui::Graphics& g,std::optional<gfx::Rect> clip):g_(g){g_.saveClip();if(clip)g_.clipRect(*clip);}
  ~PhysicalViewportClip(){g_.restoreClip();}
};
struct Skin;
class PixelButton;
// 1x logical pixels: Fusion 10px plus balanced vertical breathing room.
struct UiSpacing {
  static constexpr int related=2,group=6,padding=6,labelHeight=10;
  static constexpr int controlHeight=20,iconSize=15,sharedBorder=1;
};
inline constexpr int textControlHeight=UiSpacing::controlHeight;

// Shared dialog/floating-window shell, in 1x skin pixels. Header owns the
// complete title and 15px actions, with equal top/bottom padding.
struct FloatingColumnChrome {
  static constexpr int headerHeight=21, contentGap=UiSpacing::related;
  static constexpr int actionSize=UiSpacing::iconSize, actionTop=(headerHeight-actionSize)/2;
  static gfx::Rect closeBounds(gfx::Rect r){return {r.x2()-5-actionSize,r.y+actionTop,actionSize,actionSize};}
  static void layoutHeaderButton(PixelButton* button,gfx::Rect physicalFrame);
  static void drawTitle(const Skin&,const PixelFont&,ui::Graphics&,gfx::Rect,const std::u32string&);
  static int bodyTop(gfx::Rect r){return r.y+headerHeight+contentGap;}
  static void paint(const Skin& skin,ui::Graphics& g,gfx::Rect r);
};

// Shared column chrome in 1x logical pixels. A single title owns a full
// 10px font cell; grouped tabs live above the frame. Actions never share the
// title row, and their top/bottom breathing room is always two skin pixels.
// All form measurements are in local logical pixels. The same values drive
// paint, child placement, preferred height and the resize floor.
struct DialogLayout {
  static constexpr int inset=UiSpacing::padding,gap=UiSpacing::related,group=UiSpacing::group;
  static constexpr int bodyTop=FloatingColumnChrome::headerHeight+inset;
  static constexpr int rowStep=textControlHeight+gap;
  static constexpr int fieldStep=UiSpacing::labelHeight+gap+textControlHeight+group;
  static constexpr int label(int index=0){return bodyTop+index*fieldStep;}
  static constexpr int field(int index=0){return label(index)+UiSpacing::labelHeight+gap;}
  static constexpr int row(int index=0){return bodyTop+index*rowStep;}
  static constexpr int footer(int height){return height-inset-textControlHeight;}
  static constexpr int fit(int contentBottom){return contentBottom+group+textControlHeight+inset;}
  static gfx::Rect body(gfx::Rect r){return {r.x+inset,r.y+bodyTop,std::max(0,r.w-2*inset),std::max(0,footer(r.h)-group-bodyTop)};}
  static int centeredInkY(const PixelFont& font,const std::u32string& text,int top,int height){const auto ink=font.inkBounds(text);return top+(height-ink.h)/2-ink.y;}
};
struct PanelChromeLayout {
  static constexpr int rim=3, gap=UiSpacing::related, titleHeight=UiSpacing::labelHeight, actionHeight=UiSpacing::iconSize;
  gfx::Rect actions, content;
  PanelChromeLayout(gfx::Rect frame,bool singleTitle,int toolbarHeight=actionHeight) {
    const int y=frame.y+rim+gap+(singleTitle?titleHeight+gap:0);
    actions={frame.x+rim+gap,y,frame.w-2*(rim+gap),toolbarHeight};
    const int top=y+(toolbarHeight?toolbarHeight+gap:0);
    content={actions.x,top,actions.w,std::max(0,frame.y2()-rim-gap-top)};
  }
};

// Runtime popup geometry must damage the exposed old area as well as the new
// one. Widget::setBounds alone only lays out children; it is not a window move.
class PixelPopupWindow : public ui::PopupWindow {
public:
  using ui::PopupWindow::PopupWindow;
  void setBounds(const gfx::Rect& rect);
  // Physical display pixels; concrete dialogs supply their content-based floor.
  virtual gfx::Size minimumDialogSize(int) const {return {1,1};}
  virtual const char* geometryCursor(gfx::Point) const;
  bool processDialogGeometry(ui::Message* msg);
  bool onProcessMessage(ui::Message* msg) override;
private:
  int geometryDrag_=0;
  gfx::Point geometryOrigin_;
  gfx::Rect geometryBefore_;
  int geometryEdges(gfx::Point p) const;
};
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
  // Every dialog uses the NewDocumentDialog sheet material, never panel_outer.
  void drawDialogBackground(ui::Graphics& g,gfx::Rect rc) const;
  // Logical skin pixels; checked state is independent of pointer/held state.
  void drawCheckbox(ui::Graphics& g,gfx::Rect row,bool checked,bool hover,bool pressed,bool enabled=true) const;
  // All geometry arguments below are physical display pixels. Material bounds
  // include the complete skin; border bounds refer to its innermost black line.
  gfx::Rect selectionMaterialBounds(gfx::Rect borderBounds) const;
  bool selectionContains(gfx::Rect materialBounds,gfx::Point displayPoint) const;
  void drawSelection(ui::Graphics& g,gfx::Rect rc,bool hover) const {draw(g,hover?"selection.hover":"selection.normal",rc);}
  void drawSelectionBorder(ui::Graphics& g,gfx::Rect physicalBorder,bool hover) const;
  bool drawPanelTab(ui::Graphics& g,gfx::Rect rc,bool first) const;
};
// Dialog shell owns its sheet material. Subclasses paint content only and must
// declare a layout floor, so neither background nor minimum size can be omitted.
class PixelDialog : public PixelPopupWindow {
  const Skin& dialogSkin_;
public:
  PixelDialog(const Skin& skin, const std::string& text,
              ClickBehavior click=ClickBehavior::DoNothingOnClick,
              EnterBehavior enter=EnterBehavior::DoNothingOnEnter)
    :PixelPopupWindow(text,click,enter),dialogSkin_(skin){}
  gfx::Size minimumDialogSize(int physicalWidth) const override=0;
  void onPaint(ui::PaintEvent& ev) final;
  virtual void paintDialogContents(ui::PaintEvent& ev)=0;
  void layoutHeaderButton(PixelButton* button){FloatingColumnChrome::layoutHeaderButton(button,bounds());}
  void drawDialogTitle(const PixelFont& font,ui::Graphics& g,gfx::Rect r,const std::u32string& title)const;
};
void checkDialogGeometry(const PixelFont& font,const Skin& skin,
                         const std::function<bool(ui::MouseMessage&)>& dispatch);
class PixelButton : public ui::Button {
protected:
  const PixelFont& font_; const Skin& skin_;
private:
  ui::Timer groupHold_{400,this};
  gfx::Point groupPressOrigin_;
  std::optional<bool> checkboxPointerInside_;
  bool switchPointerInside_=false;
  bool contentPointerInside_=false;
public:
  bool contentPointerInside() const {return contentPointerInside_;}
  std::function<void()> hoverRepaint;
  std::function<void(const ui::MouseMessage&)> pointerPress;
  bool centerCaption=false;
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
  // Full material relative to the clipped widget; widget bounds own only visible pixels.
  std::optional<gfx::Rect> paletteMaterialRect;
  std::function<gfx::Rect()> paletteViewport; // Physical paint and input clip.
  bool paletteSharedSelection=false;
  bool foregroundMarker=false,backgroundMarker=false;
  int paletteMarkerSize=0;
  std::u32string paletteDisplayName;
  static std::uint32_t paletteNameTextColor(std::uint32_t rgba);
  bool colorRole=false,recentColorSwatch=false;
  int swatchOpenEdges=0; // Joined comparison: bit 1 left, bit 2 right.
  bool columnHeaderAction=false;
  bool labelOnly=false,transparentLabel=false,iconWithCaption=false,bareIconWithCaption=false;
  bool firstTab=false;
  bool tabAdd=false,bareTabIcon=false;
  std::uint32_t swatch=0;
  PixelButton(const PixelFont& font,const Skin& skin,std::u32string label,std::function<void()> action);
  bool isCheckbox() const {return skinStyle=="checkbox" || (bareIconWithCaption && (icon=="check" || icon=="checkboxChecked" || icon=="checkboxUnchecked"));}
  gfx::Rect iconContentBounds(const std::string& state="normal") const;
  gfx::Rect switchToggleBounds() const; // Physical display coordinates, also used for hover.
  gfx::Rect paletteColorBounds() const;
  bool paletteSelectionContains(gfx::Point position) const;
  void onPaint(ui::PaintEvent& ev) override;
  bool onProcessMessage(ui::Message* msg) override;
  void onResize(ui::ResizeEvent& ev) override;
  void onSizeHint(ui::SizeHintEvent& ev) override {
    ui::Button::onSizeHint(ev);
    if(isCheckbox())ev.setSizeHint(ev.sizeHint().w,textControlHeight*uiScale);
  }
};
// Controlled label-row toggle, matching legacy PreferenceToggle. A caption
// is required; the optional icon precedes it and the switch stays at right.
class PixelCheckbox : public PixelButton {
public:
  PixelCheckbox(const PixelFont& font,const Skin& skin,std::u32string label,bool checked,std::function<void(bool)> changed);
  bool checked() const {return active;}
  void setChecked(bool checked){if(active!=checked){active=checked;invalidate();}}
};
class PixelSwitch : public PixelButton {
public:
  PixelSwitch(const PixelFont& font,const Skin& skin,std::u32string label,bool checked,std::function<void(bool)> changed);
  bool checked() const {return active;}
  void setChecked(bool checked){if(active!=checked){active=checked;invalidate();}}
  bool onProcessMessage(ui::Message* msg) override;
  void onSizeHint(ui::SizeHintEvent& ev) override {
    PixelButton::onSizeHint(ev);
    ev.setSizeHint(ev.sizeHint().w,textControlHeight*uiScale);
  }
};
// Reuse Aseprite's MIT ScrollBar interaction and thumb geometry; only the
// document-independent delegate and pixel skin are adapted here.
class PixelScrollBar : public ui::ScrollBar, private ui::ScrollableViewDelegate {
  const Skin& skin_;
  bool vertical_;
  bool thumbHover_=false;
  int materialOpacity_=255;
  int materialHoverOpacity_=255;
  os::SurfaceRef materialSurface_;
  int total_=0,page_=0,value_=0;
  gfx::Size visibleSize() const override {return {page_,page_};}
  gfx::Point viewScroll() const override {return {value_,value_};}
  void setViewScroll(const gfx::Point& point) override;
public:
  std::function<void(int)> changed;
  int wheelStep=1;
  PixelScrollBar(const Skin& skin,bool vertical);
  static gfx::Rect edgeBounds(gfx::Rect frame,bool vertical);
  static gfx::Rect gridBounds(gfx::Rect viewport,bool vertical);
  void setMaterialOpacity(int opacity,int hoverOpacity=-1);
  bool translucent() const {return materialOpacity_<255 || materialHoverOpacity_<255;}
  void setDockBounds(gfx::Rect track); // Share one base-pixel edge with the adjacent content.
  void configure(int total,int page,int value);
  gfx::Rect thumbBounds(); // Physical display coordinates for paint and hover.
  void onPaint(ui::PaintEvent& ev) override;
  bool onProcessMessage(ui::Message* msg) override;
};
class PixelEntry : public ui::Entry {
  const PixelFont& font_;const Skin& skin_;
  bool scrubbing_=false;
  bool frameHover_=false;
  int scrubLastX_=0;
public:
  std::function<gfx::Rect()> paletteViewport;
  bool numeric=false;
  // Opt-in legacy NumberInput live=false: editor commands change draft only.
  bool deferredNumeric=false;
  double numericMinimum=0,numericMaximum=100;
  std::function<double()> numericValue;
  std::function<void()> deferredCommit;
  std::function<bool()> numericMounted;
  void onChange() override {if(!deferredNumeric)ui::Entry::onChange();}
  double numericStep=1;
  void adjustNumber(int delta);
  bool commitExpression();
  int contentWidth() const; // Logical pixels, including padding, unit and caret.
  int widthForValue(const std::u32string& value) const;
  int currentContentWidth() const;
  void setFixedContentWidth(int width) { fixedContentWidth_=std::max(0,width); }
  std::function<void()> accept, cancel, blur, focus, hover;
  std::u32string suffix;
  std::function<void(int)> wheel;
  bool onProcessMessage(ui::Message* msg) override;
  void onResize(ui::ResizeEvent& ev) override;
  void onSizeHint(ui::SizeHintEvent& ev) override {
    ui::Entry::onSizeHint(ev);
    ev.setSizeHint(ev.sizeHint().w,textControlHeight*uiScale);
  }
  PixelEntry(const PixelFont& font,const Skin& skin):ui::Entry(256,""),font_(font),skin_(skin) {setScale(gfx::PointF(2,2));setTransparent(true);}
  void onPaint(ui::PaintEvent& ev) override;
  gfx::Rect onGetEntryTextBounds() const override;
private:
  int fixedContentWidth_=0;
  bool editMenuOpen_=false,editMenuRefocus_=false,rightSelecting_=false;
  bool editClipboard(Cmd command);
  void showInputEditMenu(gfx::Point position);
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
  std::u32string numberSuffix=U"px";
  std::function<std::u32string(int)> valueLabel; // Categorical RangeField values (e.g. layer density).
  std::function<void(int)> changed;
  std::function<std::uint32_t(double)> colorGradient; // Legacy color editor five-stop channel track.
  std::function<void()> interactionBegin,interactionCommit,interactionCancel;
  PixelSlider(const PixelFont& font,const Skin& skin):ui::Widget(ui::kGenericWidget),font_(font),skin_(skin) {setFocusStop(true);setTransparent(true);}
  bool onProcessMessage(ui::Message* msg) override;
  void onPaint(ui::PaintEvent& ev) override;
  void onResize(ui::ResizeEvent& ev) override;
  void onSizeHint(ui::SizeHintEvent& ev) override {ev.setSizeHint(80*uiScale,textControlHeight*uiScale);}
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
  void setShortcut(std::u32string value){if(shortcut_!=value){shortcut_=std::move(value);invalidate();}}
  void setCaption(std::u32string caption) {if(caption_!=caption){caption_=std::move(caption);invalidate();}}
  void onValidate() override;
};
// One read-only input frame with an inset arrow; options use the native menu.
class PixelDropdown : public PixelButton {
  const PixelFont& dropdownFont_;const Skin& dropdownSkin_;
  std::vector<std::u32string> options_;
  int selectedIndex_=-1;
  bool open_=false;
public:
  std::function<void(int)> changed;
  std::map<int,std::u32string> optionGroups;
  std::function<void(bool)> popupStateChanged;
  std::function<void()> prepareOptions;
  std::function<bool(int)> optionEnabled;
  PixelDropdown(const PixelFont& font,const Skin& skin);
  void onResize(ui::ResizeEvent& ev) override;
  void onSizeHint(ui::SizeHintEvent& ev) override {
    PixelButton::onSizeHint(ev);
    ev.setSizeHint(ev.sizeHint().w,textControlHeight*uiScale);
  }
  void setOptions(std::vector<std::u32string> options);
  void setSelectedIndex(int index,bool notify=false);
  int selectedIndex() const {return selectedIndex_;}
  void showOptions();
  void onPaint(ui::PaintEvent& ev) override;
  bool onProcessMessage(ui::Message* msg) override;
};

// Shared named-preset form used by NewDocumentDialog and export settings.
// Factories let the caller retain its existing popup/background ownership.
struct PixelPresetControls {
  PixelDropdown* choices=nullptr;PixelEntry* name=nullptr;PixelButton *save=nullptr,*remove=nullptr;
  template<class E,class B,class D>
  static PixelPresetControls create(E entry,B button,D dropdown,const Skin& icons,
    std::function<void(int)> choose,std::function<void()> saveAction,std::function<void()> removeAction) {
    PixelPresetControls row;row.name=entry();row.choices=dropdown();row.choices->changed=std::move(choose);
    row.save=button(U"保存预设",std::move(saveAction));row.remove=button(U"",std::move(removeAction));
    row.remove->iconSkin=&icons;row.remove->icon="delete";row.remove->skinStyle="icon_button";return row;
  }
  void layout(gfx::Rect physical)const {
    const int unit=uiScale,w=physical.w/unit;auto place=[&](ui::Widget* c,int x,int y,int width,int height){c->setBounds(gfx::Rect(physical.x+x*unit,physical.y+y*unit,width*unit,height*unit));};
    place(choices,0,0,w,textControlHeight);place(name,0,22,w-78,textControlHeight);
    place(save,w-76,22,58,textControlHeight);place(remove,w-16,24,16,16);
  }
};

}
