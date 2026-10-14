#include "document.h"
#include "selection_tools.h"
#include "project_import.h"
#include "project_file.h"
#include "image_export.h"
#include "gif_export.h"
#include "sprite_sheet.h"
#include "sprite_sheet_import.h"
#include "image_decode.h"
#include "recovery_store.h"
#include "recovery_scheduler.h"
#include "recovery_catalog.h"
#include "recovery_preferences.h"
#include "project_encode.h"
#include <future>
#include <thread>
#include <codecvt>
#include <locale>
#include "canvas_view.h"
#include "canvas_renderer.h"
#include "ui_scale.h"
#include "os/sampling.h"
#include "legacy_cursors.h"
#include "legacy_tools.h"
#include "pixel_font.h"
#include "native_widgets.h"
#include "menu_catalog.h"
#include "theme_atlas.h"
#include "native_color_picker.h"
#include "recent_colors.h"
#include "eyedropper_model.h"
#include "palette_extraction.h"
#include "pattern_brush_import.h"
#include "pattern_brush_library.h"
#include "selection_pattern_brush.h"
#include "os/os.h"
#include "ui/system.h"
#include "ui/manager.h"
#include "ui/display.h"
#include "ui/move_region.h"
#include "ui/fit_bounds.h"
#include "ui/paint.h"
#include "gfx/path.h"
#include "ui/window.h"
#include "ui/popup_window.h"
#include "ui/theme.h"
#include "gfx/region.h"
#include "ui/button.h"
#include "ui/graphics.h"
#include "ui/paint_event.h"
#include "ui/resize_event.h"
#include "ui/timer.h"
#include "ui/cursor_type.h"
#include <windows.h>
#include <commctrl.h>
#include <commdlg.h>
#include "pixel_clipboard.h"
#include <filesystem>
#include <fstream>
#include <sstream>
#include <functional>
#include <map>
#include <algorithm>
#include <stdexcept>
#include <cctype>
#include <chrono>
#include <cstdio>
#include <iomanip>

namespace {
using namespace moon;
void applyLegacyCursor(os::Window& window,const LegacyCursors& cursors,const char* id) {
  if(std::string(id)=="none") {
    // laf WindowWin stores a null HCURSOR to hide successfully, but its
    // boolean reports whether the handle is non-null, not operation success.
    window.setCursor(os::NativeCursor::Hidden);
    return;
  }


  if(!window.setCursor(cursors.get(id)))throw std::runtime_error("Cannot apply legacy cursor");
}
void writeSmokeFrame(os::Surface* surface,const std::filesystem::path& path);
// Smallest client area that keeps the 13-tool rail, two left panels and
// bottom timeline usable at fixed 2x; this is a native layout constraint.
constexpr int minimumClientWidth=720,minimumClientHeight=600;
LRESULT CALLBACK resizeLimits(HWND hwnd,UINT message,WPARAM wp,LPARAM lp,UINT_PTR,DWORD_PTR) {
  if(message==WM_GETMINMAXINFO){auto info=reinterpret_cast<MINMAXINFO*>(lp);RECT rc{0,0,minimumClientWidth,minimumClientHeight};
    AdjustWindowRectEx(&rc,DWORD(GetWindowLongPtrW(hwnd,GWL_STYLE)),FALSE,DWORD(GetWindowLongPtrW(hwnd,GWL_EXSTYLE)));
    info->ptMinTrackSize={rc.right-rc.left,rc.bottom-rc.top};return 0;}
  return DefSubclassProc(hwnd,message,wp,lp);
}


class PixelTheme : public ui::Theme {
  text::FontRef font_;
public:
  explicit PixelTheme(const std::string& path) {
    font_=fontMgr()->loadSpriteSheetFont(path.c_str(),10);
    if(!font_) throw std::runtime_error("Cannot load Fusion sprite font");
  }
  text::FontRef getDefaultFont() const override { return font_; }
  void getWindowMask(ui::Widget* widget,gfx::Region& region) override {
    // laf subtracts this region when repainting widgets below popup windows.
    // Our native windows are rectangular; an empty mask leaves menus uncovered.
    region=widget->bounds();
  }
};
int panelResizeEdges(gfx::Rect rect,gfx::Point point) {
  if(!rect.contains(point))return 0;
  const int edge=3*uiScale;
  return (point.x<rect.x+edge?1:0)|(point.x>=rect.x2()-edge?2:0)|
         (point.y<rect.y+edge?4:0)|(point.y>=rect.y2()-edge?8:0);
}
const char* panelResizeCursor(int edges) {
  if((edges&1 && edges&4) || (edges&2 && edges&8))return "nwse-resize";
  if((edges&1 && edges&8) || (edges&2 && edges&4))return "nesw-resize";
  return edges&3?"ew-resize":edges&12?"ns-resize":"default";
}
// floating-panel.tsx: anchored E/S/W/N arithmetic and minimum-size gates.
gfx::Rect resizedPanel(gfx::Rect start,gfx::Point delta,int edges,gfx::Rect viewport,gfx::Size minimum) {
  auto next=start;const int minWidth=std::min(minimum.w,viewport.w),minHeight=std::min(minimum.h,viewport.h);
  if(edges&2)next.w=std::max(minWidth,std::min(start.w+delta.x,viewport.x2()-start.x));
  if(edges&8)next.h=std::max(minHeight,std::min(start.h+delta.y,viewport.y2()-start.y));
  if(edges&1){next.w=std::max(minWidth,std::min(start.w-delta.x,start.x2()-viewport.x));next.x=start.x2()-next.w;}
  if(edges&4){next.h=std::max(minHeight,std::min(start.h-delta.y,start.y2()-viewport.y));next.y=start.y2()-next.h;}
  return next;
}
// Application-local floating panel, matching legacy's portal-hosted preview.
// Keep the existing fit-only native preview renderer; this is a layout change.
class PreviewPanel : public ui::Widget {
  const PixelFont& font_;Skin& skin_;Document& document_;
  CanvasRenderer renderer_;
  PixelButton* close_;
  gfx::Rect viewport_,startBounds_;
  gfx::Point startMouse_;
  bool dragging_=false;
  int resizeEdges_=0;
  ui::Timer geometryTimer_{16,this};
  std::optional<gfx::Point> pendingPointer_;
  std::uint64_t geometryUpdates_=0;
  std::uint64_t blitMoves_=0,paintCount_=0;
public:
  std::function<void()> closed;
  std::function<void()> context;
  std::function<void()> geometryChanged;
  PreviewPanel(const PixelFont& font,Skin& skin,const Skin& icons,Document& document)
    :ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),document_(document) {
    close_=new PixelButton(font,skin,U"",[this]{if(closed)closed();});
    close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";addChild(close_);
    geometryTimer_.Tick.connect([this]{flushGeometry();});
    setVisible(false);
  }
  ~PreviewPanel() override {geometryTimer_.stop();}
  std::uint64_t geometryUpdates() const {return geometryUpdates_;}
  std::uint64_t blitMoves() const {return blitMoves_;}
  std::uint64_t paintCount() const {return paintCount_;}
  void flushGeometry() {
    geometryTimer_.stop();if(!pendingPointer_)return;
    const auto p=*pendingPointer_;pendingPointer_.reset();if(!hasCapture())return;
    // Window position follows device pixels, independently of 2x skin size.
    const int dx=p.x-startMouse_.x,dy=p.y-startMouse_.y;
    auto next=startBounds_;
    if(dragging_) {
      if(std::hypot(p.x-startMouse_.x,p.y-startMouse_.y)<8)return;
      next.offset(dx,dy);
      next.x=std::clamp(next.x,viewport_.x-next.w+160,viewport_.x2()-120);
      next.y=std::clamp(next.y,viewport_.y,viewport_.y2()-19*uiScale);
    } else next=resizedPanel(startBounds_,gfx::Point(dx/uiScale*uiScale,dy/uiScale*uiScale),resizeEdges_,viewport_,gfx::Size(180,120));
    if(next!=bounds()){++geometryUpdates_;setBounds(next);}
  }
  void closePanel(){close_->Click();}
  void finishPointer() {
    flushGeometry();
    if(!hasCapture())return;
    releaseMouse();dragging_=false;resizeEdges_=0;if(geometryChanged)geometryChanged();
  }
  const char* cursorAt(gfx::Point point) const {
    if(hasCapture())return dragging_?"move":panelResizeCursor(resizeEdges_);
    const auto edges=panelResizeEdges(bounds(),point);
    if(edges)return panelResizeCursor(edges);
    if(close_->bounds().contains(point))return "default";
    if(bounds().contains(point) && point.y<bounds().y+19*uiScale)return "move";
    return "default";
  }
  void constrain(gfx::Rect viewport) {
    if(viewport.w<=0 || viewport.h<=0)return;
    if(viewport==viewport_ && !bounds().isEmpty())return;
    viewport_=viewport;auto next=bounds();
    if(next.isEmpty())next={viewport.x2()-250-16,viewport.y2()-260-16,250,260};
    next.w=std::min(next.w,viewport.w);next.h=std::min(next.h,viewport.h);
    next.x=std::clamp(next.x,viewport.x,viewport.x2()-next.w);
    next.y=std::clamp(next.y,viewport.y,viewport.y2()-next.h);
    if(next!=bounds())setBounds(next);
  }
  void onResize(ui::ResizeEvent& ev) override {
    const auto previous=bounds();
    if(previous==ev.bounds())return;
    // Aseprite Window::moveWindow offsets children for translation and only
    // relayouts for resize; its GPU path repaints instead of reading back pixels.
    if(previous.size()==ev.bounds().size()) {
      gfx::Region oldDrawable;
      if(display())getDrawableRegion(oldDrawable,kCutTopWindowsAndUseChildArea);
      gfx::Region invalidSource;
      if(display())invalidSource.createIntersection(oldDrawable,display()->getInvalidRegion());
      const bool blit=dragging_ && isVisible() && display() && !display()->nativeWindow()->gpuAcceleration() &&
        getUpdateRegion().isEmpty() && close_->getUpdateRegion().isEmpty() && invalidSource.isEmpty();
      const int dx=ev.bounds().x-previous.x,dy=ev.bounds().y-previous.y;
      offsetWidgets(dx,dy);
      if(blit) {
        // Direct reuse of Aseprite's software-surface overlap-safe scroll path.
        gfx::Region newDrawable,source,movable,uncovered;
        getDrawableRegion(newDrawable,kCutTopWindowsAndUseChildArea);
        source=newDrawable;source.offset(-dx,-dy);
        movable.createIntersection(oldDrawable,source);
        ui::move_region(display(),movable,dx,dy);++blitMoves_;
        uncovered.createSubtraction(source,movable);uncovered.offset(dx,dy);
        invalidateRegion(uncovered);
      }
      else invalidate();
    } else {
      setBoundsQuietly(ev.bounds());const auto r=uiLogical(bounds());
      close_->setBounds(gfx::Rect(bounds().x2()-16*uiScale,bounds().y+4*uiScale,11*uiScale,12*uiScale));
      // Recompute the drawable region after the close button has moved.
      invalidate();
    }
    if(parent()) {
      gfx::Region exposed;exposed.createSubtraction(gfx::Region(previous),gfx::Region(bounds()));
      parent()->invalidateRegion(exposed);
    }
  }
  bool onProcessMessage(ui::Message* msg) override {
    if(msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->right() && context) {context();return true;}
    if(msg->type()==ui::kMouseDownMessage) {
      auto mouse=static_cast<ui::MouseMessage*>(msg);
      if(mouse->left()) {
        startMouse_=mouse->position();startBounds_=bounds();const auto r=bounds();
        resizeEdges_=panelResizeEdges(r,startMouse_);
        dragging_=!resizeEdges_ && startMouse_.y<r.y+19*uiScale;
        if(dragging_ || resizeEdges_)captureMouse();
      }
      return true;
    }
    if(msg->type()==ui::kMouseMoveMessage && hasCapture()) {
      pendingPointer_=static_cast<ui::MouseMessage*>(msg)->position();
      if(!geometryTimer_.isRunning())geometryTimer_.start();return true;
    }
    if(msg->type()==ui::kMouseUpMessage && hasCapture()) {
      pendingPointer_=static_cast<ui::MouseMessage*>(msg)->position();
      finishPointer();return true;
    }
    if(hasCapture() && msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc) {
      finishPointer();return true;
    }
    if(msg->type()==ui::kMouseWheelMessage)return true;
    return ui::Widget::onProcessMessage(msg);
  }
  void onPaint(ui::PaintEvent& ev) override {
    ++paintCount_;
    auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());
    g.fillRect(skin_["panel"],r);skin_.draw(g,"panel_outer",r);
    const auto ink=font_.inkBounds(U"预览");font_.draw(g,U"预览",r.x+5-ink.x,r.y+5-ink.y,skin_["text"]);
    const gfx::Rect content(r.x+5,r.y+19,r.w-10,r.h-24);
    g.fillRect(skin_["background"],content);skin_.draw(g,"panel_content",content);
    const int fit=std::max(1,std::min((content.w-6)/document_.width(),(content.h-6)/document_.height()));
    const gfx::Rect image(content.x+(content.w-document_.width()*fit)/2,content.y+(content.h-document_.height()*fit)/2,
                          document_.width()*fit,document_.height()*fit);
    g.saveClip();g.clipRect(content);renderer_.sync(document_);
    renderer_.draw(g,image,fit,skin_["checkerA"],skin_["checkerB"]);g.restoreClip();
  }
};
// GradientStopsEditor pointer capture/ordered identity, ported to laf.
class GradientStopsTrack : public ui::Widget {
 const Skin& icons_;bool dragging_=false,moved_=false,remove_=false;gfx::Point press_;double original_=0;
public:
 std::vector<GradientStop>* stops=nullptr;int* selected=nullptr;std::function<void()> changed;
 explicit GradientStopsTrack(const Skin& icons):ui::Widget(ui::kGenericWidget),icons_(icons){setTransparent(true);}
 void onPaint(ui::PaintEvent& ev)override{if(!stops || stops->size()<2)return;auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());GradientSpec s;s.stops=*stops;GradientSampler sampler(s);for(int x=0;x<r.w;++x){const auto c=sampler.forAmount(double(x)/std::max(1,r.w-1),0,0);g.fillRect(gfx::rgba(c&255,(c>>8)&255,(c>>16)&255,255),gfx::Rect(x,0,1,3));}for(int i=0;i<int(stops->size());++i){const auto& stop=(*stops)[i];const int x=gradientRound(stop.position*(r.w-11));if(i==*selected)g.drawRect(gfx::rgba(41,121,255,255),gfx::Rect(x-1,2,13,17));if(remove_ && i==*selected)continue;g.fillRect(gfx::rgba(stop.color&255,(stop.color>>8)&255,(stop.color>>16)&255,(stop.color>>24)&255),gfx::Rect(x+1,9,9,9));icons_.draw(g,"gradient-stop",gfx::Rect(x,3,11,16),true);}}
 bool onProcessMessage(ui::Message* msg)override{if(!stops || !selected || !isEnabled())return ui::Widget::onProcessMessage(msg);if(dragging_ && !hasCapture()){dragging_=moved_=remove_=false;}if(msg->type()!=ui::kMouseDownMessage && msg->type()!=ui::kMouseMoveMessage && msg->type()!=ui::kMouseUpMessage)return ui::Widget::onProcessMessage(msg);const auto mouse=static_cast<ui::MouseMessage*>(msg);auto position=[&]{return std::clamp(double(mouse->position().x-bounds().x-5*uiScale)/std::max(1,bounds().w-11*uiScale),0.0,1.0);};
  if(msg->type()==ui::kMouseDownMessage && mouse->left()){int hit=-1;double distance=12*uiScale;for(int i=0;i<int(stops->size());++i){const double d=std::abs(mouse->position().x-(bounds().x+((*stops)[i].position*(bounds().w-11*uiScale)+5*uiScale)));if(d<distance){distance=d;hit=i;}}if(hit<0){const double p=std::clamp(position(),.001,.999);auto right=std::find_if(stops->begin(),stops->end(),[&](auto s){return s.position>=p;});if(right!=stops->end() && right!=stops->begin() && right->position-(right-1)->position>=.002){GradientSpec s;s.stops=*stops;GradientStop stop{p,GradientSampler(s).forAmount(p,0,0)};stops->insert(right,stop);*selected=int(std::find_if(stops->begin(),stops->end(),[&](auto v){return v.position==p;})-stops->begin());if(changed)changed();}return true;}*selected=hit;original_=(*stops)[hit].position;press_=mouse->position();dragging_=true;moved_=remove_=false;captureMouse();if(changed)changed();return true;}
  if(dragging_){if(msg->type()==ui::kMouseMoveMessage){if(!moved_ && std::hypot(double(mouse->position().x-press_.x),double(mouse->position().y-press_.y))<5)return true;moved_=true;remove_=stops->size()>2 && mouse->position().y>bounds().y2()+24*uiScale;if(!remove_){const double p=position();auto updated=(*stops)[*selected];if((p==0 || p==1) && updated.position!=p)for(int i=0;i<int(stops->size());++i)if(i!=*selected && (*stops)[i].position==p)(*stops)[i].position=original_;updated.position=p;(*stops)[*selected]=updated;std::stable_sort(stops->begin(),stops->end(),[](auto a,auto b){return a.position<b.position;});*selected=int(std::find_if(stops->begin(),stops->end(),[&](auto v){return v.position==updated.position && v.color==updated.color;})-stops->begin());}if(changed)changed();invalidate();}else if(msg->type()==ui::kMouseUpMessage){if(remove_ && stops->size()>2){stops->erase(stops->begin()+*selected);*selected=std::max(0,*selected-1);if(changed)changed();}dragging_=moved_=remove_=false;releaseMouse();invalidate();}return true;}return ui::Widget::onProcessMessage(msg);
 }
};
class SpriteSheetPreview final : public ui::Widget { const Skin& skin_; std::vector<Pixel> pixels_; int imageWidth_=0,imageHeight_=0; public: explicit SpriteSheetPreview(const Skin& skin):ui::Widget(ui::kGenericWidget),skin_(skin){setTransparent(false);setVisible(false);} void setImage(StaticImageExport image){imageWidth_=image.width;imageHeight_=image.height;pixels_=std::move(image.pixels);invalidate();} void onPaint(ui::PaintEvent& ev) override {auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());g.fillRect(skin_["background"],r);skin_.draw(g,"panel_content",r);if(pixels_.empty())return;int fit=std::max(1,std::min((r.w-6)/imageWidth_,(r.h-6)/imageHeight_));gfx::Rect d(r.x+(r.w-imageWidth_*fit)/2,r.y+(r.h-imageHeight_*fit)/2,imageWidth_*fit,imageHeight_*fit);g.saveClip();g.clipRect(r);for(int y=0;y<imageHeight_;++y)for(int x=0;x<imageWidth_;++x){auto p=pixels_[std::size_t(y)*imageWidth_+x];if(!(p>>24))continue;g.fillRect(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24),gfx::Rect(d.x+x*fit,d.y+y*fit,fit,fit));}g.restoreClip();} };
class Editor : public ui::Widget {
public:
  Document document=Document::withBuiltinPalette();
  std::function<void()> closeRequested;
private:
  const PixelFont& font_; Skin& skin_; std::filesystem::path assets_;
  PreviewPanel* previewPanel_=nullptr;
  PixelButton *documentTabNew_=nullptr,*documentTabClose_=nullptr;
  PixelMenuItem* homeButton_=nullptr;
  bool homeOpen_=false;
  int homeSection_=0,homeScroll_=0,homeBanner_=0;
  std::chrono::steady_clock::time_point homeBannerDue_;
  std::vector<PixelButton*> homeActions_,homeTabs_,homeRows_;
  PixelButton* homeReturn_=nullptr;
  std::vector<std::pair<ui::Widget*,bool>> homeVisibility_;
  std::vector<std::filesystem::path> homeRecent_;
  std::vector<os::SurfaceRef> homeBanners_;
  os::SurfaceRef homeLogo_;
  struct HomeRow {std::u32string name;std::filesystem::path path;std::string recoveryId;};
  std::vector<HomeRow> homeEntries_;
  bool documentOpen_=true;
  std::vector<std::pair<ui::Widget*,bool>> closedControlStates_;
  std::vector<PixelButton*> commands_, swatches_, panelTabs_, timelineInactive_;
  PixelButton* paletteActions_=nullptr;
  PixelButton *paletteLock_=nullptr,*primaryRole_=nullptr,*secondaryRole_=nullptr;
  PixelEntry* paletteInput_=nullptr;
  int replaceSampling_=-1;
  std::array<bool,8> replaceReturnTools_{};
  bool replaceSamplingFinishing_=false;
  PixelButton* exportFormatButton_=nullptr;
  GifExportOptions gifOptions_;
  std::array<PixelEntry*,3> gifInputs_{};
  PixelButton *gifRange_=nullptr,*gifDirection_=nullptr,*gifTrim_=nullptr;
  bool gifExplicitRange_=false;
  Pixel replaceSource_=0,replaceDestination_=0;
  std::array<PixelEntry*,2> replaceInputs_{};
  std::array<PixelButton*,2> replaceSample_{};
  PixelButton *replaceScopeButton_=nullptr,*replacePreviewButton_=nullptr,*replaceRememberButton_=nullptr;
  std::string replaceScope_="layers";
  bool replacePreview_=false,replaceRemember_=true,replaceLoaded_=false;
  SheetImportOptions importSheetOptions_;std::array<PixelEntry*,8> importSheetInputs_{};PixelButton *importSheetLayout_=nullptr,*importSheetPartial_=nullptr;bool importAfterOpen_=false,importSheetUpdating_=false;
  SpriteSheetOptions sheetOptions_;PixelEntry* sheetValue_=nullptr;std::array<PixelButton*,7> sheetButtons_{};SpriteSheetPreview* sheetPreview_=nullptr;
  PixelEntry* exportScaleInput_=nullptr;PixelButton *exportTrimButton_=nullptr,*exportSelectionButton_=nullptr;StaticImageExportOptions exportOptions_;
  std::array<PixelEntry*,4> resizeInputs_{};
  PixelButton *resizeLock_=nullptr,*resizeMethod_=nullptr;
  int resizeWidth_=1,resizeHeight_=1;bool resizeLocked_=true,resizeUpdating_=false;
  ImageInterpolation resizeMethodValue_=ImageInterpolation::Nearest;
  ColorAdjustment adjustmentSpec_;
  std::array<PixelEntry*,3> adjustmentInputs_{};
  PixelButton *adjustmentPreview_=nullptr,*adjustmentColorize_=nullptr;
  bool adjustmentPreviewEnabled_=true;
  std::array<double,3> relativeHsl_{},colorizedHsl_{};bool hasColorizedHsl_=false;
  PixelEntry* extractNameInput_=nullptr;
  PixelButton* extractModeButton_=nullptr;
  int extractMode_=0,extractLimit_=32;
  NativeColorPicker* colorPicker_=nullptr;
  PixelButton *pickerPrimary_=nullptr,*pickerSecondary_=nullptr,*pickerAdd_=nullptr;
  std::vector<PixelButton*> recentButtons_;
  RecentColors recentColors_;
  std::array<PixelButton*,6> symmetryButtons_{};
  SymmetryAxes persistedSymmetryAxes_;
  std::uint64_t symmetryIdentity_=0;
  bool symmetryLocked_=false,symmetryInitialized_=false,symmetryDragging_=false;
  SymmetryAxis symmetryDragAxis_=SymmetryAxis::Center;
  SymmetryCenter symmetryDragBefore_;
  int symmetryThickness_=1;
  Pixel symmetryColor_=0xffff0000;
  bool eyedropperTool_=false,eyedropperHeld_=false,paletteSamplingHeld_=false;
  EyedropperSource eyedropperSource_=EyedropperSource::Composite;
  EyedropperGesture eyedropperGesture_;
  PixelButton* eyedropperSourceButton_=nullptr;
  RecentPaintDrag recentDrag_;
  Pixel strokeColor_=0;

  bool selectionTool_=false,selectionDragging_=false,floatingDragging_=false,selectionMoved_=false,selectionBoxDragging_=false;
  int selectionMode_=0,gestureSelectionMode_=0,selectionKind_=0;
  std::optional<SelectionMask> selectionPreview_;
  std::optional<SelectionTransform> marqueeTarget_,marqueeRotationStart_,marqueeResizeStart_;
  TransformPoint marqueePointerStart_,marqueePointerLast_;
  int marqueeDirectionX_=1,marqueeDirectionY_=1;
  std::optional<SelectionTransform> marqueeCtrlRestore_,marqueeSpaceTarget_;
  TransformPoint marqueeSpacePointer_;
  bool marqueeSpaceHadResize_=false;
  bool selectionShift_=false,selectionRight_=false,selectionCtrl_=false;
  int selectionAxis_=0;
  gfx::Point selectionPointerPosition_;
  bool selectionSyntheticMove_=false;
  bool selectionFreeTransform_=false,selectionPivotVisible_=true,selectionPivotDragging_=false;
  std::optional<TransformPoint> selectionPivot_,selectionPivotBeforeGesture_;
  TransformPoint selectionPivotStart_,selectionPivotPointerStart_;
  std::uint64_t selectionPivotIdentity_=0;
  std::optional<SelectionMask> selectionPivotMask_;
  mutable std::map<std::pair<int,int>,std::vector<Pixel>> selectionColorTiles_;
  mutable std::uint64_t selectionColorIdentity_=0,selectionColorRevision_=0;
  mutable std::string selectionColorFrame_;

  Point selectionLast_{};
  std::u32string selectionStatusBefore_;
  bool quickSelection_=false;
  std::optional<gfx::Point> quickSelectionPress_;
  std::chrono::steady_clock::time_point quickSelectionTime_;
  SelectionMask quickSelectionCell_;

  std::vector<SelectionPoint> selectionPath_,selectionPathRedo_;
  SelectionBrushStroke selectionBrushStroke_;
  SelectionPoint selectionBrushLast_{};
  std::optional<gfx::Point> selectionBrushPointer_;
  std::uint64_t selectionBrushIdentity_=0;
  int selectionBrushAngle_=0;
  PixelEntry* selectionBrushAngleInput_=nullptr;

  WandOptions wandOptions_;
  bool polygonPending_=false,wandReleased_=false,wandPreviewReady_=false;
  std::shared_ptr<const std::vector<Pixel>> wandSource_;
  std::future<std::optional<SelectionMask>> wandWorker_;
  std::optional<SelectionPoint> wandRequest_,wandLastPoint_;
  std::uint64_t wandGeneration_=0,wandWorkerGeneration_=0,wandIdentity_=0,wandContentRevision_=0;std::string wandLayer_,wandFrame_;
  std::vector<std::pair<ui::Widget*,int>> selectionControls_;
  int numberScrubLastX_=0;
  PixelEntry* modalNumberScrub_=nullptr;
  std::array<PixelButton*,4> selectionModeButtons_{};
  PixelEntry *wandToleranceInput_=nullptr,*wandGapInput_=nullptr;
  PixelButton *wandContiguousButton_=nullptr,*wandGapButton_=nullptr,*wandConnectivityButton_=nullptr,*wandReferenceButton_=nullptr;
  void wandTick(){
    if(selectionDragging_ && selectionKind_==4 && wandSource_ && (wandIdentity_!=document.identity() || wandContentRevision_!=document.contentRevision() || wandLayer_!=document.layer().id || wandFrame_!=document.frame().id)){if(wandIdentity_==document.identity())endSelectionGesture(true);else{selectionDragging_=false;wandRequest_.reset();++wandGeneration_;if(hasCapture())releaseMouse();}return;}

    if(wandWorker_.valid() && wandWorker_.wait_for(std::chrono::seconds(0))==std::future_status::ready){const auto generation=wandWorkerGeneration_;std::optional<SelectionMask> result;try{result=wandWorker_.get();}catch(const std::exception& e){if(selectionDragging_ && generation==wandGeneration_){endSelectionGesture(true);status_=U"魔棒失败："+unicodeText(e.what());refresh();}return;}if(selectionDragging_ && selectionKind_==4 && generation==wandGeneration_ && !wandRequest_){wandPreviewReady_=true;selectionPreview_=result;invalidateRect(canvasViewport());if(wandReleased_)endSelectionGesture(false);}}
    if(wandRequest_ && !wandWorker_.valid()){const auto p=*wandRequest_;wandRequest_.reset();const auto source=wandSource_;const auto options=wandOptions_;const int w=document.width(),h=document.height();wandWorkerGeneration_=wandGeneration_;std::packaged_task<std::optional<SelectionMask>()> task([source,options,w,h,p]{return magicWandSelection(*source,w,h,p.x,p.y,options);});wandWorker_=task.get_future();std::thread(std::move(task)).detach();}
  }
  void requestWand(Point p){if(wandLastPoint_ && wandLastPoint_->x==p.x && wandLastPoint_->y==p.y)return;wandLastPoint_=SelectionPoint{p.x,p.y};wandPreviewReady_=false;wandRequest_=SelectionPoint{p.x,p.y};wandTick();}
  void updateSelectionCreation(Point p,bool constrain=false,bool center=false,bool rotate=false){
    if(selectionKind_==4){requestWand(p);return;}
    if(selectionKind_==5){selectionBrushStroke_.collect(document.width(),document.height(),selectionBrushLast_,{p.x,p.y},brushProfiles_[0],selectionBrushAngle_);selectionBrushLast_={p.x,p.y};return;}

    std::optional<SelectionMask> incoming;
    if(marqueeSpaceTarget_){auto target=*marqueeSpaceTarget_;target.x+=p.x-marqueeSpacePointer_.x;target.y+=p.y-marqueeSpacePointer_.y;marqueeTarget_=target;selectionPreview_=rotatedMarqueeSelection(target,document.width(),document.height(),selectionKind_==1,selectionRounded_?selectionCornerRadius_:0);selectionLast_=p;return;}
    if(quickSelection_){const int cw=quickSelectionCell_.width,ch=quickSelectionCell_.height;
      const int left=std::min(quickSelectionCell_.x,int(std::floor(double(p.x)/cw))*cw),top=std::min(quickSelectionCell_.y,int(std::floor(double(p.y)/ch))*ch);
      const int right=std::max(quickSelectionCell_.x+cw,(int(std::floor(double(p.x)/cw))+1)*cw),bottom=std::max(quickSelectionCell_.y+ch,(int(std::floor(double(p.y)/ch))+1)*ch);
      selectionPreview_=rectangleSelection(left,top,right-left,bottom-top,document.width(),document.height());selectionLast_=p;return;}
    if(selectionKind_==2 || selectionKind_==3){SelectionPoint point{p.x,p.y};if(selectionKind_==2 && (selectionPath_.empty() || selectionPath_.back().x!=p.x || selectionPath_.back().y!=p.y)){selectionPath_.push_back(point);selectionPathRedo_.clear();}auto path=selectionPath_;if(selectionKind_==3 && (path.empty() || path.back().x!=p.x || path.back().y!=p.y))path.push_back(point);incoming=lassoSelection(path,document.width(),document.height(),selectionKind_==3,true);}
    else {const TransformPoint pointer{double(p.x),double(p.y)};if(rotate && marqueeTarget_){if(!marqueeRotationStart_){marqueeRotationStart_=marqueeTarget_;marqueePointerStart_=pointer;}auto target=*marqueeRotationStart_;const double cx=target.x+target.width/2,cy=target.y+target.height/2;target.angle+=(std::atan2(pointer.y-cy,pointer.x-cx)-std::atan2(marqueePointerStart_.y-cy,marqueePointerStart_.x-cx))*180/3.141592653589793;marqueeTarget_=target;marqueePointerLast_=pointer;}
      else {if(marqueeRotationStart_){marqueeResizeStart_=marqueeTarget_;marqueePointerStart_=marqueePointerLast_;marqueeRotationStart_.reset();}if(marqueeResizeStart_ && center && !marqueeCtrlRestore_){marqueeCtrlRestore_=marqueeTarget_;auto target=*marqueeTarget_;target.x=selectionStart_.x-std::floor(target.width/2);target.y=selectionStart_.y-std::floor(target.height/2);marqueeResizeStart_=target;marqueePointerStart_=pointer;}else if(marqueeCtrlRestore_ && !center){marqueeResizeStart_=marqueeCtrlRestore_;marqueeCtrlRestore_.reset();marqueePointerStart_=pointer;}if(marqueeResizeStart_)marqueeTarget_=resizeRotatedMarquee(*marqueeResizeStart_,{pointer.x-marqueePointerStart_.x,pointer.y-marqueePointerStart_.y},marqueeDirectionX_,marqueeDirectionY_,constrain);else{int dx=p.x-selectionStart_.x,dy=p.y-selectionStart_.y;marqueeDirectionX_=dx<0?-1:1;marqueeDirectionY_=dy<0?-1:1;if(constrain){const int size=std::max(std::abs(dx),std::abs(dy));dx=dx<0?-size:size;dy=dy<0?-size:size;}const int left=center?selectionStart_.x-std::abs(dx):std::min(selectionStart_.x,selectionStart_.x+dx),top=center?selectionStart_.y-std::abs(dy):std::min(selectionStart_.y,selectionStart_.y+dy),w=std::abs(dx)*(center?2:1)+1,h=std::abs(dy)*(center?2:1)+1;marqueeTarget_=SelectionTransform{double(left),double(top),double(w),double(h)};}}
      const auto target=*marqueeTarget_;incoming=target.angle==0 && !(selectionKind_==0 && selectionRounded_)?(selectionKind_==1?ellipseSelection(int(target.x),int(target.y),int(target.width),int(target.height),document.width(),document.height()):rectangleSelection(int(target.x),int(target.y),int(target.width),int(target.height),document.width(),document.height())):rotatedMarqueeSelection(target,document.width(),document.height(),selectionKind_==1,selectionRounded_?selectionCornerRadius_:0);}

    selectionPreview_=incoming;
    selectionLast_=p;
    if(selectionKind_<=1){const auto dimensions=std::to_string(int(marqueeTarget_?marqueeTarget_->width:std::abs(p.x-selectionStart_.x)+1))+" x "+std::to_string(int(marqueeTarget_?marqueeTarget_->height:std::abs(p.y-selectionStart_.y)+1));status_=unicodeText(dimensions);invalidateRect(gfx::Rect(bounds().x,bounds().y2()-Layout::statusHeight*uiScale,bounds().w,Layout::statusHeight*uiScale));}
  }
  void polygonStep(bool redo){auto& source=redo?selectionPathRedo_:selectionPath_;auto& target=redo?selectionPath_:selectionPathRedo_;if(source.empty())return;target.push_back(source.back());source.pop_back();auto incoming=lassoSelection(selectionPath_,document.width(),document.height(),true,true);selectionPreview_=incoming;invalidateRect(canvasViewport());}

  SelectionTransform transformGestureStart_;
  TransformPoint transformPointerStart_;
  std::string transformHandle_;
  bool selectionCopyDrag_=false;
  bool selectionRotSprite_=false;
  PixelButton* selectionAlgorithmButton_=nullptr;
  std::array<PixelEntry*,5> selectionTransformFields_{};
  bool selectionPropertiesActive_=false,selectionRounded_=false;
  int selectionCornerRadius_=4;
  PixelButton* selectionRoundedButton_=nullptr;
  PixelEntry* selectionCornerRadiusInput_=nullptr;
  bool shapeTool_=false,shapeDragging_=false,shapeRounded_=false,shapeRatio_=false,shapeRequest_=false;
  ShapeSpec shapeSpec_;ShapeDragGeometry shapeGeometry_;TransformPoint shapePointer_{};
  int shapeRadius_=4;double shapeRatioWidth_=1,shapeRatioHeight_=1;
  Pixel shapeColor_=0;std::uint64_t shapeIdentity_=0;
  std::vector<std::pair<ui::Widget*,int>> shapeControls_;
  PixelButton *shapeModeButton_=nullptr,*shapeRoundedButton_=nullptr,*shapeRatioButton_=nullptr;
  PixelEntry *shapeRadiusInput_=nullptr,*shapeRatioWidthInput_=nullptr,*shapeRatioHeightInput_=nullptr;
  void shapeTick(){if(!shapeDragging_)return;if(document.identity()!=shapeIdentity_ || !document.shapeActive()){shapeDragging_=shapeRequest_=false;if(hasCapture())releaseMouse();refresh();return;}if(shapeRequest_){shapeRequest_=false;shapeSpec_.brush=brushProfiles_[0];shapeSpec_.strokeWidth=brushProfiles_[0].size;shapeSpec_.cornerRadius=shapeRounded_?shapeRadius_:0;document.updateShapePreview(shapeSpec_,shapeColor_);invalidateRect(canvasViewport());}}
  void useShapeTool(ShapeKind kind){if(gradientPending_ || gradientDragging_ || selectionDragging_ || floatingDragging_ || shapeDragging_)return;document.commitFloatingPaste();cancelStroke();shapeSpec_.kind=kind;shapeTool_=true;eyedropperTool_=false;selectionTool_=gradientTool_=fillTool_=handTool_=eraser_=false;playing_=false;toolRowScroll_=0;refresh();}
  bool fillTool_=false,fillDragging_=false,fillCommitted_=false;
  WandOptions fillOptions_;
  PatternFillOptions fillPattern_;
  PixelButton *fillTextureButton_=nullptr,*fillImageButton_=nullptr;
  PixelEntry* fillTextureScale_=nullptr;
  std::u32string fillImageName_;
  PatternBrushSelection fillLibrarySelection_;
  std::string fillFolder_,fillFolderEditing_;
  bool fillFolderRename_=false;
  std::vector<std::pair<ui::Widget*,int>> fillControls_;
  PixelEntry *fillToleranceInput_=nullptr,*fillGapInput_=nullptr;
  PixelButton *fillContiguousButton_=nullptr,*fillGapButton_=nullptr,*fillConnectivityButton_=nullptr,*fillReferenceButton_=nullptr;
  bool rememberGradientTool_=false;
  bool gradientTool_=false,gradientDragging_=false,gradientPending_=false,gradientRequest_=false,gradientRight_=false,gradientConfirm_=false,gradientFreeform_=false;
  GradientSpec gradientSpec_;GradientDragGeometry gradientGeometry_;
  WandOptions gradientOptions_;
  std::uint64_t gradientIdentity_=0,gradientContent_=0;
  std::string gradientLayer_,gradientFrame_;
  std::vector<GradientStop> gradientStops_;
  int gradientStop_=0,gradientHandle_=-1;TransformPoint gradientHandlePress_{};GradientSpec gradientHandleBefore_;
  std::vector<std::pair<ui::Widget*,int>> gradientControls_;
  PixelEntry *gradientTolerance_=nullptr,*gradientStopPosition_=nullptr,*gradientStopColor_=nullptr;
  PixelButton *gradientType_=nullptr,*gradientContiguous_=nullptr,*gradientReference_=nullptr,*gradientConnectivity_=nullptr,*gradientDither_=nullptr,*gradientFreeformButton_=nullptr,*gradientMode_=nullptr;
  void gradientColors(){gradientSpec_.first=gradientRight_?document.palette().secondary:ink_;gradientSpec_.last=gradientRight_?ink_:document.palette().secondary;gradientSpec_.stops=gradientFreeform_?gradientStops_:std::vector<GradientStop>{};if(gradientRight_)for(auto& stop:gradientSpec_.stops)stop.position=1-stop.position;}
  void gradientTick(){if(!document.gradientActive()){gradientDragging_=gradientPending_=gradientRequest_=false;return;}if(document.identity()!=gradientIdentity_ || document.contentRevision()!=gradientContent_ || document.layer().id!=gradientLayer_ || document.frame().id!=gradientFrame_){cancelGradientGesture();return;}if(gradientPending_ && (gradientSpec_.first!=(gradientRight_?document.palette().secondary:document.palette().primary) || gradientSpec_.last!=(gradientRight_?document.palette().primary:document.palette().secondary))){ink_=document.palette().primary;gradientRequest_=true;}if(!gradientRequest_)return;gradientRequest_=false;gradientColors();document.updateGradient(gradientSpec_,gradientOptions_);invalidateRect(canvasViewport());}
  void gradientChanged(){saveBrushPreferences();gradientRequest_=document.gradientActive();gradientTick();layoutToolOptions();invalidate();}
  void cancelGradientGesture(){gradientDragging_=gradientPending_=gradientRequest_=false;gradientHandle_=-1;document.cancelGradient();if(hasCapture())releaseMouse();refresh();}
  void applyGradientGesture(){gradientRequest_=true;gradientTick();document.commitGradient();gradientDragging_=gradientPending_=gradientRequest_=false;gradientHandle_=-1;if(hasCapture())releaseMouse();refresh();}
  void useFillTool(){if(shapeDragging_ || selectionDragging_ || floatingDragging_ || gradientPending_)return;document.commitFloatingPaste();cancelStroke();shapeTool_=false;rememberGradientTool_=false;gradientTool_=false;fillTool_=true;selectionTool_=false;handTool_=eraser_=false;eyedropperTool_=false;refresh();}
  void useGradientTool(){if(shapeDragging_ || selectionDragging_ || floatingDragging_ || gradientPending_)return;document.commitFloatingPaste();cancelStroke();gradientOptions_.visibleLayers=fillOptions_.visibleLayers;gradientOptions_.connectivity=fillOptions_.connectivity;shapeTool_=false;rememberGradientTool_=true;gradientTool_=true;fillTool_=selectionTool_=handTool_=eraser_=false;playing_=false;eyedropperTool_=false;refresh();}
  void sortGradientStops(GradientStop selected){std::stable_sort(gradientStops_.begin(),gradientStops_.end(),[](auto a,auto b){return a.position<b.position;});for(int i=0;i<int(gradientStops_.size());++i)if(gradientStops_[i].position==selected.position && gradientStops_[i].color==selected.color)gradientStop_=i;gradientChanged();}
  void addGradientStop(){double gap=-1,position=.5;for(std::size_t i=1;i<gradientStops_.size();++i)if(gradientStops_[i].position-gradientStops_[i-1].position>gap){gap=gradientStops_[i].position-gradientStops_[i-1].position;position=(gradientStops_[i].position+gradientStops_[i-1].position)/2;}if(gap<.002)return;position=std::clamp(position,.001,.999);GradientSpec s;s.stops=gradientStops_;GradientStop added{position,GradientSampler(s).forAmount(position,0,0)};gradientStops_.push_back(added);sortGradientStops(added);}

  std::optional<SelectionTransform> selectionTransformTarget() const {if(auto floating=document.floatingTransform())return floating;if(!document.selection())return {};const auto& mask=*document.selection();return SelectionTransform{double(mask.x),double(mask.y),double(mask.width),double(mask.height)};}
  TransformPoint selectionPivotPreset(const SelectionTransform& target,int index) const {auto coordinate=[](double size,int position){const double last=std::max(.5,size-.5);return (position==0?.5:position==2?last:std::min(last,std::floor(size/2)+.5))/std::max(1.0,size);};return transformPoint(target,coordinate(target.width,index%3),coordinate(target.height,index/3));}
  TransformPoint selectionPivotPoint() const {auto target=selectionTransformTarget();return selectionPivot_.value_or(target?selectionPivotPreset(*target,4):TransformPoint{});}
  bool selectionPivotHit(gfx::Point point) const {if(!document.selection() || !selectionPivotVisible_ || selectionFreeTransform_ || selectionDragging_)return false;const auto p=selectionPivotPoint();return std::abs(point.x-canvas_.x-p.x*canvasScale())<=10 && std::abs(point.y-canvas_.y-p.y*canvasScale())<=10;}
  Point constrainedSelectionDelta(Point delta,bool shift){if(!shift){selectionAxis_=0;return delta;}const int x=std::abs(delta.x),y=std::abs(delta.y);if(!selectionAxis_ && (x || y))selectionAxis_=x>=y?1:2;if(selectionAxis_==1 && y>x*1.2)selectionAxis_=2;if(selectionAxis_==2 && x>y*1.2)selectionAxis_=1;return selectionAxis_==1?Point{delta.x,0}:Point{0,delta.y};}
  void shrinkSelectionToContent(){document.commitFloatingPaste();const auto before=document.selection();if(!before)return;int left=document.width(),top=document.height(),right=-1,bottom=-1;for(int y=std::max(0,before->y);y<std::min(document.height(),before->y+before->height);++y)for(int x=std::max(0,before->x);x<std::min(document.width(),before->x+before->width);++x)if(selectionContains(before,x,y) && (document.pixels()[std::size_t(y)*document.width()+x]>>24)){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right<left){status_=U"选区中没有内容";refresh();return;}auto next=combineSelection(before,SelectionMask{left,top,right-left+1,bottom-top+1,{}},3);if(!selectionEqual(before,next))document.commitSelection(before,next,true);selectionPivot_.reset();selectionPropertiesActive_=true;refresh();}
  void showSelectionPivotPopup(){if(!document.selection())return;ui::PopupWindow popup("",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow);popup.setAutoRemap(false);popup.setWantFocus(true);const auto trigger=selectionControls_[15].first->bounds();const auto popupBounds=gfx::Rect(std::clamp(trigger.x,bounds().x,std::max(bounds().x,bounds().x2()-90*uiScale)),trigger.y2()+2*uiScale,90*uiScale,84*uiScale);popup.setBounds(popupBounds);class PivotPanel final:public ui::Widget{const Skin& skin;public:PivotPanel(const Skin& value):ui::Widget(ui::kGenericWidget),skin(value){}void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto rect=uiLogical(clientBounds());g.fillRect(skin["panel"],rect);skin.draw(g,"panel_outer",rect);}};auto content=new PivotPanel(skin_);popup.addChild(content);content->setBounds(popupBounds);auto visible=new PixelButton(font_,skin_,U"显示轴心",[this]{selectionPivotVisible_=!selectionPivotVisible_;saveSelectionPreferences();invalidateRect(canvasViewport());});visible->active=selectionPivotVisible_;visible->icon=selectionPivotVisible_?"check":"checkboxUnchecked";visible->iconSkin=&toolIcons_;visible->bareIconWithCaption=true;content->addChild(visible);visible->setBounds(gfx::Rect(popupBounds.x+4*uiScale,popupBounds.y+4*uiScale,82*uiScale,19*uiScale));std::array<PixelButton*,9> presets{};for(int i=0;i<9;++i){auto button=new PixelButton(font_,skin_,U"",[this,i]{if(auto target=selectionTransformTarget())selectionPivot_=selectionPivotPreset(*target,i);invalidateRect(canvasViewport());});button->icon="selection-pivot-preset-"+std::to_string(i);button->iconSkin=&toolIcons_;content->addChild(button);button->setBounds(gfx::Rect(popupBounds.x+(4+(i%3)*15)*uiScale,popupBounds.y+(23+(i/3)*16)*uiScale,15*uiScale,16*uiScale));if(auto target=selectionTransformTarget()){const auto point=selectionPivotPreset(*target,i),current=selectionPivotPoint();button->active=std::abs(point.x-current.x)<1e-6 && std::abs(point.y-current.y)<1e-6;}presets[i]=button;button->Click.connect([&,i]{for(int j=0;j<9;++j){presets[j]->active=i==j;presets[j]->invalidate();}});}visible->Click.connect([this,visible]{visible->active=selectionPivotVisible_;visible->icon=selectionPivotVisible_?"check":"checkboxUnchecked";visible->invalidate();});popup.Resize.connect([&,content,visible](ui::ResizeEvent&){const auto area=content->bounds();visible->setBounds(gfx::Rect(area.x+4*uiScale,area.y+4*uiScale,82*uiScale,19*uiScale));for(int i=0;i<9;++i)presets[i]->setBounds(gfx::Rect(area.x+(4+(i%3)*15)*uiScale,area.y+(23+(i/3)*16)*uiScale,15*uiScale,16*uiScale));});std::unique_ptr<ui::Timer> verify;if(smoke_){verify=std::make_unique<ui::Timer>(160,&popup);verify->Tick.connect([&]{if(presets[0]->bounds().x!=visible->bounds().x || presets[3]->bounds().x!=visible->bounds().x || presets[6]->bounds().x!=visible->bounds().x)throw std::runtime_error("Pivot popup left alignment");presets[0]->Click();if(auto target=selectionTransformTarget()){const auto expected=selectionPivotPreset(*target,0);if(!selectionPivot_ || selectionPivot_->x!=expected.x || selectionPivot_->y!=expected.y)status_=U"轴心预设测试失败";}writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/"selection-pivot-smoke.bmp");verify->stop();popup.closeWindow(nullptr);});verify->start();}popup.openWindowInForeground();requestFocus();}
  void startFreeSelectionTransform(){if(!document.selection() || selectionDragging_ || floatingDragging_)return;auto target=*selectionTransformTarget();if(!document.beginSelectionContentMove(false,frameSelectionExplicit_))return;target.quad=std::array<TransformPoint,4>{{transformPoint(target,0,0),transformPoint(target,1,0),transformPoint(target,1,1),transformPoint(target,0,1)}};document.transformFloatingPaste(target,false);selectionFreeTransform_=true;selectionTool_=true;eyedropperTool_=false;selectionPropertiesActive_=true;refresh();}
  TransformPoint transformCanvasPoint(gfx::Point p) const {return {(p.x-canvas_.x)/canvasScale(),(p.y-canvas_.y)/canvasScale()};}
  std::optional<SelectionTransform> selectionControlTarget() const {
    auto target=selectionTransformTarget();
    if(target && !target->quad && target->angle==0 && target->shearX==0 && target->shearY==0 && document.selection()){
      const auto& mask=*document.selection();target->x=mask.x;target->y=mask.y;target->width=mask.width;target->height=mask.height;
    }
    return target;
  }
  std::string transformHit(gfx::Point p)const {auto target=selectionControlTarget();return target?selectionTransformHit(*target,transformCanvasPoint(p),1.0/canvasScale()):std::string{};}
  Point selectionStart_{},floatingStart_{};
  gfx::Point selectionPress_;
  std::optional<SelectionMask> selectionBefore_;
  PixelClipboard pixelClipboard_;
  bool pixelClipboardContext() const {return !paletteFocused_ && !frameSelectionExplicit_;}
  void beginLayerTransform(){if(selectionDragging_ || floatingDragging_ || document.layer().locked || !document.layer().visible)return;document.commitFloatingPaste();int l=document.width(),top=document.height(),r=-1,b=-1;for(int y=0;y<document.height();++y)for(int x=0;x<document.width();++x)if(document.pixels()[y*document.width()+x]>>24){l=std::min(l,x);top=std::min(top,y);r=std::max(r,x);b=std::max(b,y);}if(r<l)return;document.previewSelection(SelectionMask{l,top,r-l+1,b-top+1,{}});selectionPropertiesActive_=false;useSelectionTool(0);selectionMode_=0;}
  void useSelectionTool(int kind=-1){if(shapeDragging_ || gradientPending_ || gradientDragging_ || floatingDragging_ || (selectionDragging_ && selectionKind_==5))return;if(selectionDragging_ || floatingDragging_)endSelectionGesture(!polygonPending_);if(kind>=0)selectionKind_=kind;document.commitFloatingPaste();cancelStroke();selectionTool_=true;shapeTool_=false;gradientTool_=false;fillTool_=false;handTool_=false;eraser_=false;playing_=false;eyedropperTool_=false;refresh();}
  void copySelectionPixels(bool cut){if(!pixelClipboardContext()){status_=U"当前色卡或时间轴剪贴板尚未接入";refresh();return;}if(!document.selection()){status_=U"需要像素选区";refresh();return;}auto payload=document.copyPixels();if(!payload){pixelClipboard_.clear();status_=U"选区没有可复制像素";if(cut){std::optional<SelectionClipboard> empty;document.cutPixels(empty);}refresh();return;}if(!pixelClipboard_.write(*payload))status_=U"已复制到内部剪贴板，系统剪贴板不可用";else status_=U"像素已复制";if(cut){std::optional<SelectionClipboard> copied;document.cutPixels(copied);}refresh();}
  void pasteSelectionPixels(){if(!pixelClipboardContext()){status_=U"当前色卡或时间轴剪贴板尚未接入";refresh();return;}try{document.commitFloatingPaste();auto payload=pixelClipboard_.read();if(!payload){status_=U"剪贴板没有像素图像";refresh();return;}const auto viewport=canvasViewport();const double scale=canvasScale();const int left=int(std::floor((viewport.x-canvas_.x)/scale)),top=int(std::floor((viewport.y-canvas_.y)/scale)),right=int(std::ceil((viewport.x2()-canvas_.x)/scale)),bottom=int(std::ceil((viewport.y2()-canvas_.y)/scale));auto axis=[](std::optional<int> origin,int size,int start,int end){if(origin){const int center=*origin+size/2;if(center>=start && center<end)return std::clamp(*origin,start-size,end-1);}return start+(end-start)/2-size/2;};const bool copied=payload->originX && payload->originY;int x=axis(payload->originX,payload->width,copied?left:std::max(0,left),copied?right:std::min(document.width(),right)),y=axis(payload->originY,payload->height,copied?top:std::max(0,top),copied?bottom:std::min(document.height(),bottom));if(document.width()<=payload->width || document.height()<=payload->height){x=std::clamp(x,0,std::max(0,document.width()-payload->width));y=std::clamp(y,0,std::max(0,document.height()-payload->height));}else{x=std::clamp(x,-payload->width+1,document.width()-1);y=std::clamp(y,-payload->height+1,document.height()-1);}if(document.beginFloatingPaste(*payload,x,y)){playing_=false;selectionTool_=true;eyedropperTool_=false;handTool_=false;status_=U"浮动粘贴：拖动移动，Enter 确认，Esc 取消";}else status_=U"目标图层隐藏或锁定";refresh();}catch(const std::exception& e){status_=U"粘贴失败："+unicodeText(e.what());refresh();}}
  int selectionHit(gfx::Point position) const {if(selectionFreeTransform_){auto target=selectionTransformTarget();if(target && target->quad){const auto uv=selectionQuadMap(*target->quad,transformCanvasPoint(position),true);return uv.x>=-1e-7 && uv.x<=1+1e-7 && uv.y>=-1e-7 && uv.y<=1+1e-7?2:0;}}return selectionContentHit(document.selection(),(position.x-canvas_.x)/canvasScale(),(position.y-canvas_.y)/canvasScale(),8.0/canvasScale());}
  void endSelectionGesture(bool cancel){if(!selectionDragging_ && !floatingDragging_)return;if(cancel){++wandGeneration_;wandRequest_.reset();if(floatingDragging_){document.cancelFloatingPaste();selectionPivot_=selectionPivotBeforeGesture_;}else document.previewSelection(selectionBefore_);}else if(selectionDragging_){if(selectionBoxDragging_)document.commitSelectionBox(selectionBefore_);else{if(selectionKind_==5)document.previewSelection(combineSelection(selectionBefore_,selectionBrushStroke_.mask(document.width()),gestureSelectionMode_));if(polygonPending_)document.previewSelection(combineSelection(selectionBefore_,lassoSelection(selectionPath_,document.width(),document.height(),true,true),gestureSelectionMode_));const bool moved=selectionMoved_ || selectionKind_>=2 || quickSelection_;document.commitSelection(selectionBefore_,moved?(selectionKind_==3 || selectionKind_==5?document.selection():combineSelection(selectionBefore_,selectionPreview_,gestureSelectionMode_)):gestureSelectionMode_==0?std::optional<SelectionMask>{}:selectionBefore_,true);frameSelectionExplicit_=false;}}selectionDragging_=floatingDragging_=selectionBoxDragging_=polygonPending_=false;wandReleased_=false;selectionPath_.clear();selectionPathRedo_.clear();selectionBrushStroke_={};selectionPreview_.reset();marqueeTarget_.reset();marqueeRotationStart_.reset();marqueeResizeStart_.reset();marqueeCtrlRestore_.reset();marqueeSpaceTarget_.reset();quickSelection_=false;selectionRight_=false;selectionAxis_=0;if(!selectionStatusBefore_.empty()){status_=selectionStatusBefore_;selectionStatusBefore_.clear();}transformHandle_.clear();if(hasCapture())releaseMouse();refresh();}
  bool paletteLocked_=true,paletteFocused_=false,editingSecondary_=false;
  int paletteScrollRow_=0,paletteColumns_=1,renameId_=0;
  std::optional<gfx::Point> paletteMousePosition_;
  std::vector<int> paletteButtonIds_;
  Pixel lastPaletteInk_=0xffff7929;
  BrushOptions brushProfiles_[2];
  struct ToolControl {ui::Widget* first;int second;int gap=uiGap;bool pencilOnly=false;};
  std::vector<ToolControl> toolControls_;
  PixelButton* brushShapeButton_=nullptr;
  PixelButton* imageBrushButton_=nullptr;
  std::string pencilImageBrushId_;
  double pencilImageBrushAngle_=0;
  std::optional<PatternBrush> pencilImageBrush_;
  PixelEntry *brushSizeInput_=nullptr,*brushOpacityInput_=nullptr;
  PixelSlider* brushRange_=nullptr;
  PixelSlider* layerOpacityRange_=nullptr;
  PixelSlider* layerHeaderOpacity_=nullptr;
  std::vector<PixelButton*> layerRows_,layerEyes_,layerLocks_,layerAutoLinks_;
  int layerScroll_=0,frameScroll_=0;
  std::vector<PixelButton*> frameHeaders_,frameCells_;
  bool playing_=false,frameSelectionExplicit_=false;
  // Legacy separates editing context from explicit timeline selection.
  std::string selectedTimelineLayer_,selectedTimelineCelLayer_,selectedTimelineCelFrame_;
  std::uint64_t timelineSelectionIdentity_=0;
  bool timelineSelectionGuidesVisible_=true;
  timeline::LoopPlayback loopPlayback_;
  std::uint64_t playbackIdentity_=0,playbackRevision_=0;
  std::optional<timeline::LoopSection> loopDraft_;
  std::array<PixelEntry*,4> loopInputs_{};
  PixelButton* loopDirection_=nullptr;
  std::string frameClickCollapse_;
  OnionSkinSettings onion_;
  int onionField_=0;
  std::chrono::steady_clock::time_point playbackDue_;
  timeline::State recoveryState_;
  std::size_t recoveryCelIndex_=0;
  PixelButton *layerEye_=nullptr,*layerRow_=nullptr,*layerProperties_=nullptr;
  bool brushRangeOpacity_=false;
  bool updatingBrushFields_=false,smoke_=false;
  int toolRowScroll_=0,shownBrushProfile_=-1;
  ui::MouseButton strokeButton_=ui::kButtonNone;
  int swatchSize_=1;
  static constexpr int swatchPixels_[5]={22,30,40,52,64};
  static constexpr const char* swatchKeys_[5]={"tiny","small","medium","large","huge"};
  PixelButton *discard_, *keep_, *dialogClose_, *saveBeforeClose_;
  Skin toolIcons_;
  std::array<PixelButton*,5> topActions_{};
  std::vector<PixelButton*> toolRail_;
  ui::MenuBar* menuBar_=nullptr;
  std::map<std::string,PixelMenuItem*> menuItems_;
  menus::Commands menuCommands_;
  Pixel ink_=0xffff7929;
  bool palettePanelOpen_=true,previewPanelOpen_=true,layersPanelOpen_=true;
  bool eraser_=false, colorPickerOpen_=true, handTool_=false, spaceHeld_=false;
  CanvasPan pan_;
  ui::MouseButton panButton_=ui::kButtonNone;
  std::function<void()> refreshCursor_;
  void updateNavigationCursor() {if(refreshCursor_) refreshCursor_();}
  void finishPan(bool cancel) {
    if(!pan_.active) return;
    if(cancel) {canvas_.x=pan_.origin.x;canvas_.y=pan_.origin.y;}
    pan_.end();panButton_=ui::kButtonNone;
    if(hasCapture()) releaseMouse();
    updateNavigationCursor();invalidateRect(canvasViewport());
  }
  // canvas-auto-pan.ts: the active selection gesture owns the viewport edge band.
  void selectionAutoPan(gfx::Point pointer){if(!(selectionDragging_ || floatingDragging_) || selectionKind_==4 || selectionKind_==5)return;const auto viewport=canvasViewport();auto speed=[](int point,int start,int end){return point<start+28?-std::min(16.0,std::max(2.0,(start+28-point)*.4)):point>end-28?std::min(16.0,std::max(2.0,(point-(end-28))*.4)):0.0;};const int dx=int(std::round(speed(pointer.x,viewport.x,viewport.x2()))),dy=int(std::round(speed(pointer.y,viewport.y,viewport.y2())));if(!dx && !dy)return;canvas_.x-=dx;canvas_.y-=dy;constrainCanvas();invalidateRect(viewport);}
  void constrainCanvas() {
    const auto viewport=canvasViewport();
    canvas_.x=clampCanvasAxis(canvas_.x,viewport.x,viewport.w,canvas_.w);
    canvas_.y=clampCanvasAxis(canvas_.y,viewport.y,viewport.h,canvas_.h);
  }
  std::filesystem::path documentPath_,candidatePath_,recoveryDirectory_;
  bool candidateRecovery_=false;
  recovery::Scheduler recoveryQueue_;
  recovery::RecoveryCatalog recoveryCatalog_;
  recovery::Preferences recoveryPreferences_;
  std::optional<recovery::Ticket> recoveryTicket_;
  std::future<void> recoveryWorker_;
  std::vector<Pixel> recoveryPixels_;
  std::uint64_t recoveryIdentity_=0;
  std::size_t recoveryOffset_=0;
  std::chrono::steady_clock::time_point recoveryDue_=std::chrono::steady_clock::now()+std::chrono::minutes(5);
  ui::Timer* recoveryTimer_=nullptr;
  std::string ownedRecoveryId_;
  std::uint64_t ownedRecoveryIdentity_=0;

  std::optional<Document> openCandidate_;
  std::u32string openError_,errorTitle_=U"无法打开工程";
  int modalErrorScroll_=0;
  std::u32string modalErrorContent_;
  enum class Pending { None, New, Open, OpenError, Close, CloseDocument, LayerOpacity, FrameDuration, LoopSection, OnionValue, PaletteName, PaletteExtract, ColorAdjustment, ReplaceColor, ColorRole, ImageResize, BrushFolderName, StaticExport, SpriteSheet, GifExport, SheetImport } pending_=Pending::None;
  int dockWidth_=0,timelineHeight_=109;
  double paletteShare_=0;
  std::map<Pending,gfx::Rect> modalGeometry_;
  enum class SizeDrag { None, DockWidth, ColorSplit, Timeline, Modal, ModalMove } sizeDrag_=SizeDrag::None;
  gfx::Point sizeDragMouse_;
  gfx::Rect sizeDragBounds_;
  int sizeDragEdges_=0,sizeDragValue_=0;
  ui::Timer sizeTimer_{16,this};
  ui::Timer antsTimer_{100,this};
  int antsOffset_=0;
  std::optional<gfx::Point> pendingSizePointer_;
  std::uint64_t sizeLayoutUpdates_=0;
  std::uint64_t smokePreviewUpdates_=0;
  std::uint64_t smokePreviewBlits_=0,smokePreviewPaints_=0;
  int smokePreviewStep_=0;
  std::u32string status_=U"内存画布";
  gfx::Rect canvas_;
  // User layout: left tool rail, adjacent color dock, then document/timeline.
  struct Layout {
    // Logical skin pixels; physical UI remains exactly 2x.
    // 11px legacy icon + 1px colored frame + 1px black edge on each side.
    // Neighbors overlap only the outer black pixel; colored frames stay whole.
    static constexpr int edge=uiGap,gap=uiGap,toolSize=15,toolHeight=16,toolGap=-1,tabHeight=15,frame=3;
    // Fusion's current Chinese labels occupy ink rows 1..9 in the 10px cell.
    // Skin strokes and clear padding are separate: menu 2+2+9+2+2, status 2+9+2.
    static constexpr int fontHeight=10,labelInkHeight=9,menuHeight=16,statusHeight=labelInkHeight+2*gap;
    static constexpr int panelY=menuHeight,documentY=panelY+14,optionsY=documentY+tabHeight+frame+gap,optionsHeight=19,workY=optionsY+optionsHeight,inset=frame+gap;
    int right,rightX,workX,workW,tabY=optionsY,top=workY+gap,bottom,split,layerTop;
    explicit Layout(gfx::Rect rc,bool layers=true,int dockWidth=0,double paletteShare=0,int timelineHeight=109)
      :rightX(edge+toolSize+gap),bottom(rc.h-statusHeight) {
      // Native minimums keep the existing 2x controls and canvas reachable.
      right=std::clamp(dockWidth?dockWidth:std::clamp(rc.w/6,116,120),116,std::max(116,rc.w-edge-rightX-gap-160));
      workX=rightX+right+gap;workW=rc.w-edge-workX;
      split=paletteShare>0?top+int(std::round((bottom-top)*paletteShare)):tabY+(bottom-tabY)*2/5;
      split=std::clamp(split,top+70,std::max(top+70,bottom-100));
      layerTop=layers?bottom-std::clamp(timelineHeight,65,std::max(65,bottom-top-100)):bottom+gap;
    }
    int paletteBottom(bool picker) const {return picker?split-gap:bottom;}
    gfx::Rect pickerPanel() const {return {rightX,split,right,bottom-split};}
    gfx::Rect pickerContent() const {return {rightX+inset,split+tabHeight,right-2*inset,bottom-split-tabHeight-inset};}
    gfx::Rect pickerGradient(bool recent) const {auto r=pickerContent();r.h-=44+(recent?12+uiGap:0);return r;}
    gfx::Rect workspacePanel() const {return {workX,top,workW,layerTop-gap-top};}
    gfx::Rect workspaceContent() const {return {workX+inset,top+inset,workW-2*inset,layerTop-gap-top-2*inset};}
  };
  Layout workspaceLayout(gfx::Rect rc) const {return Layout(rc,layersPanelOpen_,dockWidth_,paletteShare_,timelineHeight_);}
  int documentTabWidth(const Layout& l) const {return std::min(l.workW-18,font_.inkBounds(document.name()).w+2*Layout::inset+11+uiGap+(document.dirty()?3+uiGap:0));}
  void layoutDocumentTab() {
    if(!documentTabNew_)return;
    const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);const int width=documentOpen_?documentTabWidth(l):0;
    documentTabNew_->setBounds(uiPhysical(gfx::Rect(rc.x+width-(documentOpen_?1:0),rc.y+Layout::documentY,17,Layout::tabHeight)));
    documentTabClose_->setBounds(uiPhysical(gfx::Rect(rc.x+Layout::edge+width-Layout::inset-11,rc.y+Layout::documentY+2,11,11)));
    documentTabClose_->setVisible(documentOpen_);
    documentTabNew_->setEnabled(pending_==Pending::None);documentTabClose_->setEnabled(pending_==Pending::None);
  }
  void closeDocumentTab() {
    closedControlStates_.clear();for(auto child:children())closedControlStates_.push_back({child,child->isEnabled()});
    document=Document::withBuiltinPalette();documentPath_.clear();documentOpen_=false;showHome(true);
  }
  bool enabledTimelineAction(std::size_t i) const {return pending_==Pending::None && (i<=6 || (i==7 && document.timeline().state().frames.size()>1) || i==8);}
  void seekFrame(std::size_t index) {clearTimelineRowSelection();document.clearFrameSelection();loopPlayback_={};frameSelectionExplicit_=false;playing_=false;document.selectFrame(document.timeline().state().frames.at(index).id);refresh();}
  void frameAction(int kind) {playing_=false;try{if(kind==2)document.deleteSelectedFrames();else document.addFrame(kind==1);refresh();}catch(const std::exception& e){showSaveError(e);}}
  void startLoopPlayback(const std::string& id){cancelStroke();const auto& state=document.timeline().state();const auto it=std::find_if(state.loopSections.begin(),state.loopSections.end(),[&](const auto& section){return section.id==id;});if(it==state.loopSections.end())return;const auto sequence=timeline::loopPlaybackFrames(state,*it);if(sequence.empty())return;loopPlayback_={{id,0,{}},{},!it->repeatCount};clearTimelineRowSelection();document.clearFrameSelection();frameSelectionExplicit_=false;document.selectFrame(sequence.front());playing_=true;playbackIdentity_=document.identity();playbackRevision_=document.revision();playbackDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(document.frame().duration);refresh();}
  void togglePlayback() {const bool next=!playing_;cancelStroke();playing_=next;if(playing_){if(playbackIdentity_!=document.identity() || playbackRevision_!=document.revision())loopPlayback_={};if(loopPlayback_.current.sectionId.empty() && !document.animationLoop())document.selectFrame(document.timeline().state().frames.front().id);clearTimelineRowSelection();document.clearFrameSelection();frameSelectionExplicit_=false;playbackIdentity_=document.identity();playbackRevision_=document.revision();playbackDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(document.frame().duration);}refresh();}
  void playbackTick() {if(!playing_)return;if(pending_!=Pending::None || document.active() || playbackIdentity_!=document.identity() || playbackRevision_!=document.revision()){playing_=false;loopPlayback_={};refresh();return;}const auto now=std::chrono::steady_clock::now();bool moved=false;int count=0;while(now>=playbackDue_ && playing_ && ++count<=10000){if(!loopPlayback_.current.sectionId.empty()){const auto step=timeline::advanceLoopPlayback(document.timeline().state(),loopPlayback_,document.frame().id);if(step.completed){playing_=false;loopPlayback_={};moved=true;break;}document.selectFrame(step.frameId);}else{auto index=document.activeFrameIndex()+1;if(index==document.timeline().state().frames.size()){if(!document.animationLoop()){playing_=false;document.selectFrame(document.timeline().state().frames.front().id);moved=true;break;}index=0;}document.selectFrame(document.timeline().state().frames[index].id);}playbackDue_+=std::chrono::milliseconds(document.frame().duration);moved=true;}if(moved)refresh();}
  void openLoopEditor(const std::string& id={}){playing_=false;cancelStroke();timeline::LoopSection draft;const auto& state=document.timeline().state();if(!id.empty()){const auto it=std::find_if(state.loopSections.begin(),state.loopSections.end(),[&](const auto& section){return section.id==id;});if(it==state.loopSections.end())return;draft=*it;}else{int n=1;for(;;++n){draft.name=U"循环节 "+unicodeText(std::to_string(n));if(std::none_of(state.loopSections.begin(),state.loopSections.end(),[&](const auto& section){return section.name==draft.name;}))break;}auto selected=document.selectedFrames();if(selected.empty())selected={document.frame().id};int left=int(state.frames.size()),right=0;for(int i=0;i<int(state.frames.size());++i)if(std::find(selected.begin(),selected.end(),state.frames[i].id)!=selected.end()){left=std::min(left,i);right=i;}draft.startFrameId=state.frames[left].id;draft.endFrameId=state.frames[right].id;}loopDraft_=draft;const auto range=timeline::loopRange(state,draft);loopInputs_[0]->setText(utf8Text(draft.name));loopInputs_[1]->setText(std::to_string(range.start+1));loopInputs_[2]->setText(std::to_string(range.end+1));loopInputs_[3]->setText(draft.repeatCount?std::to_string(*draft.repeatCount):"");updateLoopDirection();pending_=Pending::LoopSection;for(auto input:loopInputs_)input->setVisible(true);loopDirection_->setVisible(true);menuBar_->setEnabled(false);discard_->caption=U"保存";discard_->setVisible(true);keep_->caption=U"取消";keep_->setVisible(true);dialogClose_->setVisible(true);refresh();loopInputs_[0]->requestFocus();loopInputs_[0]->selectAllText();}
  void updateLoopDirection(){const char* directions[]{"forward","reverse","ping-pong","ping-pong-reverse"};const char32_t* labels[]{U"正向",U"反向",U"往返",U"反向往返"};for(int i=0;i<4;++i)if(loopDraft_->direction==directions[i])loopDirection_->caption=labels[i];}
  bool commitLoopEditor(){try{auto draft=*loopDraft_;auto integer=[&](int index,int limit){const auto text=loopInputs_[index]->text();std::size_t used=0;const int value=std::stoi(text,&used);if(used!=text.size() || value<1 || value>limit)throw std::invalid_argument("Loop field");return value;};const int count=int(document.timeline().state().frames.size());int start=integer(1,count)-1,end=integer(2,count)-1;if(start>end)std::swap(start,end);draft.startFrameId=document.timeline().state().frames[start].id;draft.endFrameId=document.timeline().state().frames[end].id;draft.name=unicodeText(loopInputs_[0]->text());const auto first=draft.name.find_first_not_of(U" \t\r\n"),last=draft.name.find_last_not_of(U" \t\r\n");draft.name=first==std::u32string::npos?loopDraft_->name:draft.name.substr(first,last-first+1);if(draft.name.size()>64)draft.name.resize(64);draft.repeatCount=loopInputs_[3]->text().empty()?std::optional<int>{}:std::optional<int>{integer(3,9999)};if(draft.id.empty())document.createLoopSection(draft);else document.updateLoopSection(draft);loopPlayback_={};return true;}catch(const std::exception&){status_=U"循环节帧范围或重复次数无效";invalidate();return false;}}
  void showFrameDuration() {playing_=false;cancelStroke();document.beginFrameDuration();pending_=Pending::FrameDuration;paletteInput_->setText(std::to_string(document.frame().duration));paletteInput_->suffix=U"ms";menuBar_->setEnabled(false);discard_->setVisible(false);keep_->caption=U"关闭";keep_->setVisible(true);dialogClose_->setVisible(true);paletteInput_->setVisible(true);refresh();paletteInput_->requestFocus();paletteInput_->selectAllText();}
  void saveOnionSettings(){if(smoke_)return;try{const auto path=palettePreferencePath().parent_path()/"onion-skin.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out<<onion_.enabled<<' '<<onion_.allLayers<<' '<<onion_.showDuringPlayback<<' '<<onion_.previousFrames<<' '<<onion_.nextFrames<<' '<<onion_.previousOpacity<<' '<<onion_.nextOpacity<<' '<<onion_.previousColor<<' '<<onion_.nextColor;out.close();if(!out)throw std::runtime_error("Cannot save onion skin preferences");}catch(const std::exception& e){status_=U"洋葱皮偏好保存失败："+unicodeText(e.what());}refresh();}
  void toggleOnion(){onion_.enabled=!onion_.enabled;saveOnionSettings();refresh();}
  void openOnionValue(int field){onionField_=field;pending_=Pending::OnionValue;const bool color=field>=4;int values[]{onion_.previousFrames,onion_.nextFrames,onion_.previousOpacity,onion_.nextOpacity};paletteInput_->setText(color?paletteHex(field==4?onion_.previousColor:onion_.nextColor):std::to_string(values[field]));paletteInput_->suffix=field<2?U"帧":field<4?U"%":U"";keep_->caption=U"关闭";keep_->setVisible(true);dialogClose_->setVisible(true);discard_->setVisible(false);paletteInput_->setVisible(true);menuBar_->setEnabled(false);refresh();paletteInput_->requestFocus();paletteInput_->selectAllText();}
  void previewOnionValue(){try{auto value=paletteInput_->text();if(onionField_<4){std::size_t used=0;int next=std::stoi(value,&used);if(used!=value.size())return;int* target=onionField_==0?&onion_.previousFrames:onionField_==1?&onion_.nextFrames:onionField_==2?&onion_.previousOpacity:&onion_.nextOpacity;*target=std::clamp(next,0,onionField_<2?8:100);}else{if(value.size() && value[0]=='#')value.erase(0,1);if(value.size()!=6 && value.size()!=8)return;Pixel next=0xff000000;for(std::size_t i=0;i<value.size()/2;++i){std::size_t used=0;auto byte=std::stoul(value.substr(i*2,2),&used,16);if(used!=2)return;next=(next&~(255u<<(i*8)))|Pixel(byte)<<(i*8);} (onionField_==4?onion_.previousColor:onion_.nextColor)=next;}invalidate();}catch(const std::exception&){} }
  void showOnionMenu(){PixelMenu menu(skin_);auto item=[&](const char32_t* caption,std::function<void()> action,std::function<bool()> checked={}){auto b=new PixelMenuItem(font_,skin_,caption);b->Click.connect(action);b->checked=checked;menu.addChild(b);};item(U"显示洋葱皮",[this]{toggleOnion();},[this]{return onion_.enabled;});item(U"当前图层",[this]{onion_.allLayers=false;saveOnionSettings();},[this]{return !onion_.allLayers;});item(U"所有图层",[this]{onion_.allLayers=true;saveOnionSettings();},[this]{return onion_.allLayers;});item(U"播放时显示",[this]{onion_.showDuringPlayback=!onion_.showDuringPlayback;saveOnionSettings();},[this]{return onion_.showDuringPlayback;});const char32_t* names[]{U"前面帧数",U"后面帧数",U"前面不透明度",U"后面不透明度",U"前面颜色",U"后面颜色"};for(int i=0;i<6;++i)item(names[i],[this,i]{openOnionValue(i);});menu.showPopup(pointerMenuPosition(ui::get_mouse_position()),display());}
  std::string contextFrameId_;
  enum class Column { Palette, Color, Layers, Preview };
  void buildColumnContextMenu(PixelMenu& menu,Column column) {
    const char32_t* names[]{U"颜色板",U"调色盘",U"图层",U"预览"};
    const char* commands[]{"togglePalettePanel","toggleColorPanel","toggleLayersPanel","togglePreviewPanel"};
    auto add=[&](std::u32string title,const char* icon,std::function<void()> action={}) {
      auto item=new PixelMenuItem(font_,skin_,std::move(title));item->iconSkin=&toolIcons_;item->menuMarks=&toolIcons_;item->icon=icon;
      item->setEnabled(pending_==Pending::None && bool(action));
      if(action)item->Click.connect(action);
      menu.addChild(item);return item;
    };
    add(U"隐藏 "+std::u32string(names[int(column)])+U" 栏目","eyeOff",[this,column,command=std::string(commands[int(column)])]{cancelStroke();menuCommands_.invoke(command);});
    menu.addChild(new PixelMenuSeparator(skin_));
    const char32_t* docks[]{U"停靠到左侧",U"停靠到右侧",U"停靠到底部",U"设为悬浮栏目"};
    const int current=column==Column::Preview?3:column==Column::Layers?2:0;
    for(int i=0;i<4;++i)add(docks[i],i==current?"check":"move");
    if(column==Column::Preview){menu.addChild(new PixelMenuSeparator(skin_));add(U"查看相对明暗","");}
  }
  gfx::Point pointerMenuPosition(gfx::Point screenPosition) const {
    // Menu::showPopup/fit_bounds take coordinates relative to parentDisplay.
    return display()->nativeWindow()->pointFromScreen(screenPosition);
  }
  void showColumnContextMenu(Column column) {
    if(pending_!=Pending::None)return;
    PixelMenu menu(skin_);buildColumnContextMenu(menu,column);menu.showPopup(pointerMenuPosition(ui::get_mouse_position()),display());
  }
  // Legacy create-area / layer / frame-header / cel context menus.
  void buildLayerContextMenu(PixelMenu* menu,int kind) {
    auto add=[this,kind](PixelMenu* parent,const char32_t* title,const char* icon,const char32_t* shortcut,std::function<void()> action={},bool enabled=true){
      auto entry=new PixelMenuItem(font_,skin_,title,shortcut);entry->iconSkin=&toolIcons_;entry->icon=icon;entry->menuMarks=&toolIcons_;
      entry->setEnabled(pending_==Pending::None && bool(action) && enabled);
      if(action)entry->Click.connect([this,action,kind,target=contextFrameId_]{playing_=false;cancelStroke();try{if(kind==2 && !target.empty())document.selectFrame(target);action();refresh();}catch(const std::exception& e){showSaveError(e);}});
      parent->addChild(entry);
    };
    auto separator=[this](PixelMenu* parent){parent->addChild(new PixelMenuSeparator(skin_));};
    auto branch=[this](PixelMenu* parent,const char32_t* title,const char* icon){auto child=new PixelMenu(skin_);auto entry=new PixelMenuItem(font_,skin_,title);entry->iconSkin=&toolIcons_;entry->icon=icon;entry->menuMarks=&toolIcons_;entry->setSubmenu(child);parent->addChild(entry);return child;};
    auto create=[&](PixelMenu* menu){
    add(menu,U"新建图层","plus",U"Shift+N",[this]{document.addLayer();},true);
    add(menu,U"新建图层组","newFolder",U"Ctrl+G");
    separator(menu);
    add(menu,U"渐变映射调整图层","gradientMap",U"");
    add(menu,U"新建瓦片图层","tilemap",U"");
    add(menu,U"新建自由瓦片图层","freeTile",U"");
    add(menu,U"新建背景图层","image",U"");
    };
    if(kind==0){create(menu);return;}
    if(kind==1){
      create(branch(menu,U"新建","plus"));
    add(menu,U"复制所选对象","copy",U"");
    add(menu,U"创建关联图层","linkedLayer",U"");
      {auto submenu=branch(menu,U"转换为","convertTo");
    add(submenu,U"转换为背景图层","image",U"");
    add(submenu,U"转换为瓦片图层","tilemap",U"");
    add(submenu,U"转换为普通图层","image",U"");
      }
    separator(menu);
    add(menu,U"向下合并","mergeDown",U"");
    add(menu,U"合并所选图层","mergeDown",U"");
    add(menu,U"合并可见图层","mergeVisible",U"");
    separator(menu);
    add(menu,U"开启剪贴蒙版","clippingMask",U"Ctrl+Alt+G");
    add(menu,U"新建图层蒙版","layerMask",U"");
    separator(menu);
      {auto submenu=branch(menu,U"图层样式","layerStyle");
    add(submenu,U"图层样式","layerStyle",U"");
    add(submenu,U"拆分图层样式","layerStyle",U"");
    separator(submenu);
    add(submenu,U"复制图层样式","copy",U"");
    add(submenu,U"粘贴图层样式","paste",U"");
    add(submenu,U"清除图层样式","clearRecords",U"");
      }
    separator(menu);
    add(menu,U"属性","properties",U"",[this]{showLayerOpacity();},true);
    add(menu,U"删除","delete",U"Delete",[this]{document.deleteLayer();},document.timeline().state().layers.size()>1 && !document.layer().locked);
      return;
    }
    if(kind==2){
    add(menu,U"创建循环节","link",U"",[this]{openLoopEditor();});
    add(menu,U"生成补间帧","plus",U"");
    add(menu,U"帧属性","info",U"",[this]{showFrameDuration();},true);
    const bool allDisabled=std::all_of(document.timeline().state().frames.begin(),document.timeline().state().frames.end(),[this](const auto& f){return (!document.selectedFrames().empty() && std::find(document.selectedFrames().begin(),document.selectedFrames().end(),f.id)==document.selectedFrames().end()) || f.disabled;});
    add(menu,allDisabled?U"启用帧":U"停用帧",allDisabled?"eye":"eyeOff",U"");
    separator(menu);
    add(menu,U"复制帧","copy",U"Ctrl+C");
    add(menu,U"粘贴帧","paste",U"Ctrl+V");
    add(menu,U"反转帧顺序","swap",U"");
    separator(menu);
    add(menu,U"新增帧","copy",U"Alt+N",[this]{frameAction(1);},true);
    add(menu,U"新建空白帧","paste",U"Alt+B",[this]{frameAction(0);},true);
    add(menu,U"删除当前帧","delete",U"Alt+C",[this]{document.deleteSelectedFrames();},document.timeline().state().frames.size()>std::max(std::size_t(1),document.selectedFrames().size()));
      return;
    }
    add(menu,U"生成补间帧","plus",U"");
    add(menu,U"新建图层蒙版","layerMask",U"");
    separator(menu);
    add(menu,U"粘贴图层蒙版单元格","paste",U"");
    separator(menu);
    add(menu,U"单元格属性","info",U"");
    separator(menu);
    add(menu,U"复制单元格","copy",U"Ctrl+C");
    add(menu,U"粘贴单元格","paste",U"Ctrl+V");
    add(menu,U"反转单元格顺序","swap",U"");
    add(menu,U"连接单元格","link",U"");
    add(menu,U"断开单元格连接","link",U"",[this]{document.disconnectCel();},document.cel().linkedCelId.has_value());
    add(menu,U"删除单元格","delete",U"");
  }
  void showLayerContextMenu(int kind){PixelMenu menu(skin_);buildLayerContextMenu(&menu,kind);menu.showPopup(pointerMenuPosition(ui::get_mouse_position()),display());}

  std::uint64_t celContentIdentity_=0,celContentRevision_=0;
  std::map<std::string,bool> celContentCache_;
  bool celHasContent(const timeline::Cel* cel) {
    if(celContentIdentity_!=document.identity() || celContentRevision_!=document.contentRevision()) {
      celContentCache_.clear();celContentIdentity_=document.identity();celContentRevision_=document.contentRevision();
    }
    if(!cel)return false;
    const auto resolved=document.timeline().resolveSurface(cel->id);
    if(!resolved.surface || !resolved.source)return false;
    auto cached=celContentCache_.find(resolved.source->id);
    if(cached!=celContentCache_.end())return cached->second;
    const auto& pixels=resolved.surface->pixels;
    const bool content=std::any_of(pixels.begin(),pixels.end(),[](Pixel pixel){return (pixel>>24)!=0;});
    celContentCache_[resolved.source->id]=content;return content;
  }
  void clearTimelineRowSelection() {
    selectedTimelineLayer_.clear();selectedTimelineCelLayer_.clear();selectedTimelineCelFrame_.clear();
  }
  void markFrameSelection() {
    clearTimelineRowSelection();timelineSelectionGuidesVisible_=true;frameSelectionExplicit_=true;
  }
  void selectTimelineLayer(std::size_t index) {
    clearTimelineRowSelection();document.clearFrameSelection();frameSelectionExplicit_=false;
    selectedTimelineLayer_=document.timeline().state().layers.at(index).id;
    timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;
    document.selectLayer(selectedTimelineLayer_);paletteFocused_=false;refresh();
  }
  void selectTimelineCel(std::size_t row,std::size_t column) {
    const auto layer=document.timeline().state().layers.at(row).id;
    const auto frame=document.timeline().state().frames.at(column).id;
    clearTimelineRowSelection();document.clearFrameSelection();frameSelectionExplicit_=false;
    selectedTimelineCelLayer_=layer;selectedTimelineCelFrame_=frame;
    timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;
    playing_=false;loopPlayback_={};document.selectLayer(layer);document.selectFrame(frame);refresh();
  }
  void hideTimelineSelectionGuides() {
    timelineSelectionGuidesVisible_=false;layoutLayers();
    const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
    invalidateRect(uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop,l.workW,l.bottom-l.layerTop)));
  }
  void layoutLayers() {
    if(timelineSelectionIdentity_!=document.identity()){clearTimelineRowSelection();frameSelectionExplicit_=false;timelineSelectionGuidesVisible_=true;timelineSelectionIdentity_=document.identity();}
    if(!layerRow_)return;const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);const int x=rc.x+l.workX+5,y=rc.y+l.layerTop;
    const auto& layers=document.timeline().state().layers;
    while(layerRows_.size()<layers.size()) {
      const auto i=layerRows_.size();auto select=[this,i]{selectTimelineLayer(i);};
      auto row=i==0?layerRow_:button(U"",select);if(i==0)row->Click.connect(select);row->skinStyle="timeline-row";row->doubleClick=[this,select]{select();showLayerOpacity();};row->context=[this,select]{select();showLayerContextMenu(1);};
      row->rowDrop=[this](int py){const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);const auto index=std::clamp((py/uiScale-rc.y-l.layerTop-49+6)/12+layerScroll_,0,int(document.timeline().state().layers.size()-1));document.moveLayer(std::size_t(index));refresh();};
      auto eye=i==0?layerEye_:button(U"",[this,i]{document.selectLayer(document.timeline().state().layers.at(i).id);document.setLayerVisible(!document.layer().visible);refresh();});eye->iconSkin=&toolIcons_;eye->skinStyle="timeline-row";eye->context=[this,select]{select();showLayerContextMenu(1);};
      auto lock=button(U"",[this,i]{document.selectLayer(document.timeline().state().layers.at(i).id);document.setLayerLocked(!document.layer().locked);refresh();});lock->iconSkin=&toolIcons_;lock->skinStyle="timeline-row";lock->context=[this,select]{select();showLayerContextMenu(1);};
      auto autoLink=button(U"",[this,i]{const auto& layer=document.timeline().state().layers.at(i);document.setLayerAutoLinkAnimationCels(layer.id,!layer.autoLinkAnimationCels);refresh();});
      autoLink->skinStyle="timeline-row";autoLink->iconSkin=&toolIcons_;
      layerRows_.push_back(row);layerEyes_.push_back(eye);layerLocks_.push_back(lock);layerAutoLinks_.push_back(autoLink);
    }
    const int capacity=std::max(1,(l.bottom-l.layerTop-53)/12);layerScroll_=std::clamp(layerScroll_,0,std::max(0,int(layers.size())-capacity));
    for(std::size_t i=0;i<layerRows_.size();++i) {
      const bool shown=layersPanelOpen_ && i<layers.size() && int(i)>=layerScroll_ && int(i)<layerScroll_+capacity;const int rowY=y+49+(int(i)-layerScroll_)*12;
      for(auto b:{layerRows_[i],layerEyes_[i],layerLocks_[i],layerAutoLinks_[i]}){b->timelineParentPainted=true;b->timelineVisible=shown;b->setTransparent(true);b->timelineRepaint=[this]{invalidateTimelineGrid();};b->setVisible(shown);b->setEnabled(pending_==Pending::None);}
      if(i>=layers.size())continue;const auto& layer=layers[i];layerRows_[i]->caption=layer.name;layerRows_[i]->timelineCaptionPadding=2;layerRows_[i]->active=layer.id==document.layer().id;layerRows_[i]->timelineSelected=timelineSelectionGuidesVisible_ && selectedTimelineLayer_==layer.id;layerEyes_[i]->active=layerRows_[i]->active;layerLocks_[i]->active=layerRows_[i]->active;layerAutoLinks_[i]->active=layerRows_[i]->active;layerAutoLinks_[i]->icon=layer.autoLinkAnimationCels?"animation-auto-link-on":"animation-auto-link-off";layerAutoLinks_[i]->setBounds(uiPhysical(gfx::Rect(x+24,rowY,12,12)));
      layerRows_[i]->setBounds(uiPhysical(gfx::Rect(x+36,rowY,48,12)));layerEyes_[i]->icon=layer.visible?"eye":"eyeOff";layerEyes_[i]->setBounds(uiPhysical(gfx::Rect(x,rowY,12,12)));layerLocks_[i]->icon=layer.locked?"lock":"unlock";layerLocks_[i]->setBounds(uiPhysical(gfx::Rect(x+12,rowY,12,12)));
    }
    const auto& frames=document.timeline().state().frames;const int columns=std::max(1,(l.workW-94)/12);frameScroll_=std::clamp(frameScroll_,0,std::max(0,int(frames.size())-columns));const int active=int(document.activeFrameIndex());if(active<frameScroll_)frameScroll_=active;else if(active>=frameScroll_+columns)frameScroll_=active-columns+1;
    while(frameHeaders_.size()<std::size_t(columns)){const auto col=frameHeaders_.size();auto b=button(U"",[this,col]{document.selectFrameHeader(document.timeline().state().frames.at(frameScroll_+col).id,0,playing_);markFrameSelection();refresh();});b->skinStyle="timeline-row";
      b->framePress=[this,col](const ui::MouseMessage& mouse){const auto id=document.timeline().state().frames.at(frameScroll_+col).id;const bool toggle=mouse.ctrlPressed()||mouse.cmdPressed(),range=mouse.shiftPressed();frameClickCollapse_.clear();if(!toggle && !range && std::find(document.selectedFrames().begin(),document.selectedFrames().end(),id)!=document.selectedFrames().end()){frameClickCollapse_=id;if(!playing_)document.selectFrame(id);}else document.selectFrameHeader(id,range?2:toggle?1:0,playing_);markFrameSelection();refresh();};b->frameClick=[this]{if(!frameClickCollapse_.empty())document.selectFrameHeader(frameClickCollapse_,0,playing_);frameClickCollapse_.clear();refresh();};b->frameDrag=[this](int px){const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);const int left=(rc.x+l.workX+89)*uiScale,columns=std::max(1,(l.workW-94)/12);if(px<left && frameScroll_>0)--frameScroll_;else if(px>=left+columns*12*uiScale && frameScroll_+columns<int(document.timeline().state().frames.size()))++frameScroll_;layoutLayers();invalidate();};b->frameDrop=[this](int px){const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);const int relative=px/uiScale-rc.x-l.workX-89;const int index=std::clamp(frameScroll_+std::max(0,relative)/12,0,int(document.timeline().state().frames.size()-1));const bool after=relative>=0 && relative%12>=6;playing_=false;loopPlayback_={};document.moveSelectedFrames(document.timeline().state().frames[index].id,after);frameClickCollapse_.clear();refresh();};
      b->context=[this,col]{const auto id=document.timeline().state().frames.at(frameScroll_+col).id;if(std::find(document.selectedFrames().begin(),document.selectedFrames().end(),id)==document.selectedFrames().end())document.selectFrameHeader(id,0,playing_);markFrameSelection();contextFrameId_=id;refresh();showLayerContextMenu(2);};b->doubleClick=[this,col]{const auto id=document.timeline().state().frames.at(frameScroll_+col).id;if(document.selectedFrames().empty())document.selectFrameHeader(id);markFrameSelection();showFrameDuration();};frameHeaders_.push_back(b);}
    for(std::size_t col=0;col<frameHeaders_.size();++col){auto b=frameHeaders_[col];const int index=frameScroll_+int(col);const bool shown=layersPanelOpen_ && int(col)<columns && index<int(frames.size());b->timelineParentPainted=true;b->timelineVisible=shown;b->setTransparent(true);b->timelineRepaint=[this]{invalidateTimelineGrid();};b->setVisible(shown);b->setEnabled(pending_==Pending::None);if(shown){const auto n=std::to_string(index+1);b->caption=std::u32string(n.begin(),n.end());b->centerCaption=true;b->active=frames[index].id==document.frame().id || std::find(document.selectedFrames().begin(),document.selectedFrames().end(),frames[index].id)!=document.selectedFrames().end();b->timelineSelected=timelineSelectionGuidesVisible_ && frameSelectionExplicit_ && std::find(document.selectedFrames().begin(),document.selectedFrames().end(),frames[index].id)!=document.selectedFrames().end();b->setBounds(uiPhysical(gfx::Rect(x+84+int(col)*12,y+37,12,12)));}}
    while(frameCells_.size()<std::size_t(columns*capacity)){const auto slot=frameCells_.size();auto b=button(U"",[this,slot]{const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);const int cols=std::max(1,(l.workW-94)/12);selectTimelineCel(layerScroll_+slot/cols,frameScroll_+slot%cols);});b->skinStyle="timeline-row";b->timelineCel=true;b->context=[this,slot]{const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);const int cols=std::max(1,(l.workW-94)/12);selectTimelineCel(layerScroll_+slot/cols,frameScroll_+slot%cols);showLayerContextMenu(3);};frameCells_.push_back(b);}
    for(std::size_t slot=0;slot<frameCells_.size();++slot){auto b=frameCells_[slot];const int row=int(slot)/columns,col=int(slot)%columns,index=frameScroll_+col;const bool shown=layersPanelOpen_ && row<capacity && row+layerScroll_<int(layers.size()) && index<int(frames.size());b->timelineParentPainted=true;b->timelineVisible=shown;b->setTransparent(true);b->timelineRepaint=[this]{invalidateTimelineGrid();};b->setVisible(shown);b->setEnabled(pending_==Pending::None);if(shown){const auto* cel=document.timeline().findCel(layers[row+layerScroll_].id,frames[index].id);b->timelineCel=celHasContent(cel);b->iconSkin=&toolIcons_;b->icon="";b->active=layers[row+layerScroll_].id==document.layer().id || frames[index].id==document.frame().id;b->timelineSelected=timelineSelectionGuidesVisible_ && selectedTimelineCelLayer_==layers[row+layerScroll_].id && selectedTimelineCelFrame_==frames[index].id;b->setBounds(uiPhysical(gfx::Rect(x+84+col*12,y+49+row*12,12,12)));}}
    layerProperties_->setBounds(uiPhysical(gfx::Rect(rc.x+l.workX+l.workW-20,y+19,15,16)));
    layerHeaderOpacity_->setVisible(false);
    for(std::size_t i=0;i<timelineInactive_.size();++i){auto b=timelineInactive_[i];gfx::Rect at;
      if(i<5)at={x+int(i)*14,y+19,15,16};
      else if(i<8)at={x+4*14+15+uiGap+int(i-5)*14,y+19,15,16};
      else if(i<10)at={rc.x+l.workX+l.workW-48+int(i-8)*14,y+19,15,16};
      else at={x+12+int(i-10)*12,y+49,12,12};
      b->setBounds(uiPhysical(at));b->setVisible(layersPanelOpen_ && i<10);b->setEnabled(enabledTimelineAction(i));if(i==5)b->active=onion_.enabled;if(i==2){b->active=playing_;b->icon=playing_?"playback-pause":"playback-play";}
    }
    const bool enabled=pending_==Pending::None;
    for(auto b:{layerProperties_}){b->setEnabled(enabled);b->setVisible(layersPanelOpen_);}
  }

  double zoom_=8;
  double canvasScale() const {return zoom_*uiScale;}
  CanvasRenderer renderer_;
  unsigned chromePaints_=0;

  PixelButton* button(std::u32string label,std::function<void()> action) {
    auto b=new PixelButton(font_,skin_,std::move(label),[this,action=std::move(action)] {
      if(colorPicker_) colorPicker_->finishInteraction();
      if(brushRange_) brushRange_->setVisible(false);paletteFocused_=false;action();
      if(pending_==Pending::None) requestFocus();
    }); addChild(b); return b;
  }
  Point canvasPoint(gfx::Point p) const {
    return canvasPixel({p.x,p.y},{canvas_.x,canvas_.y},canvasScale());
  }
  gfx::Rect canvasViewport() const {
    const auto rc=uiLogical(bounds()); const auto l=workspaceLayout(rc);
    const auto content=l.workspaceContent();
    // Keep artwork and pan invalidation inside the inner content frame.
    return uiPhysical(gfx::Rect(rc.x+content.x+1,rc.y+content.y+1,content.w-2,content.h-2));
  }
  gfx::Rect changedCanvasPixels() const {
    const auto region=document.lastContentChange();if(region.empty()) return {};
    const double scale=canvasScale();
    const int left=int(std::floor(canvas_.x+region.x*scale))-1,top=int(std::floor(canvas_.y+region.y*scale))-1;
    const int right=int(std::ceil(canvas_.x+(region.x+region.w)*scale))+1,bottom=int(std::ceil(canvas_.y+(region.y+region.h)*scale))+1;
    return gfx::Rect(left,top,right-left,bottom-top)&canvasViewport();
  }
  void invalidateStrokePixels(std::uint64_t before) {
    if(document.contentRevision()==before) return;
    renderer_.noteChange(document);
    if(recentDrag_.observe(recentColors_,RecentPaintKind::Draw,eraser_,strokeColor_,true)) {
      if(!smoke_) {try {recentColors_.save(palettePreferencePath().parent_path()/"recent-colors.txt");} catch(const std::exception&) {status_=U"最近颜色保存失败";}}
      layoutPalette();const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);auto dock=l.pickerPanel();dock.offset(rc.x,rc.y);invalidateRect(uiPhysical(dock));
    }
    const auto area=changedCanvasPixels();if(!area.isEmpty()) invalidateRect(area);
    if(previewPanel_ && previewPanel_->isVisible())previewPanel_->invalidate();
  }
  void fitCanvas() {
    const auto rc=uiLogical(bounds()); const auto l=workspaceLayout(rc);
    zoom_=std::max(1,std::min(8,std::min((l.workW-24)/document.width(),(l.workspaceContent().h-24)/document.height())));
    canvas_=uiPhysical(gfx::Rect(rc.x+l.workX+(l.workW-document.width()*zoom_)/2,
                     rc.y+l.top+(l.workspacePanel().h-document.height()*zoom_)/2,
                     document.width()*zoom_,document.height()*zoom_));
    invalidate();
  }
  void zoomCanvas(gfx::Point anchor,int direction) {
    const double next=nextCanvasScale(zoom_,direction);
    if(next==zoom_) return;
    const auto origin=zoomedCanvasOrigin({canvas_.x,canvas_.y},{anchor.x,anchor.y},canvasScale(),next*uiScale);
    zoom_=next;canvas_=gfx::Rect(origin.x,origin.y,int(std::lround(document.width()*canvasScale())),int(std::lround(document.height()*canvasScale())));
    constrainCanvas();
    invalidate();
  }
  void layoutPanelTabs() {
    if(panelTabs_.empty()) return;
    const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
    panelTabs_[0]->setVisible(palettePanelOpen_);panelTabs_[0]->active=true;
    const bool singleColumn=std::count_if(panelTabs_.begin(),panelTabs_.end(),[](auto tab){return !tab->hasFlags(ui::HIDDEN);})==1;
    for(auto tab:panelTabs_) {tab->labelOnly=singleColumn;tab->tab=!singleColumn;}

    const auto ink=font_.inkBounds(panelTabs_[0]->caption);
    panelTabs_[0]->setBounds(uiPhysical(singleColumn?
      gfx::Rect(rc.x+l.rightX+Layout::inset-ink.x,rc.y+l.tabY+Layout::frame+uiGap-ink.y,ink.w,10):
      gfx::Rect(rc.x+l.rightX,rc.y+l.tabY,42,19)));
    if(previewPanel_) {
      previewPanel_->constrain(uiPhysical(gfx::Rect(rc.x+uiGap,rc.y+l.tabY,rc.w-2*uiGap,l.bottom-l.tabY)));
      previewPanel_->setVisible(previewPanelOpen_ && pending_==Pending::None);
      if(previewPanel_->isVisible())previewPanel_->invalidate();
    }
  }
  gfx::Rect paletteContentBounds() const {
    const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
    return uiPhysical(gfx::Rect(rc.x+l.rightX+Layout::inset,rc.y+l.top+Layout::inset+16+uiGap,l.right-2*Layout::inset,l.paletteBottom(colorPickerOpen_)-l.top-2*Layout::inset-16-uiGap));
  }
  void layoutPalette() {
    const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
    const auto area=uiLogical(paletteContentBounds());
    // User correction: connected cells share a single base-pixel black edge.
    // Keep the outer cell size; adjacent bounds overlap only on that edge.
    const int cell=swatchPixels_[swatchSize_]/uiScale,step=cell-1,padding=1+uiGap;
    const int columns=std::max(1,(area.w-padding*2-1)/step);
    paletteColumns_=columns;
    const int rows=std::max(1,(area.h-padding*2-1)/step);
    const int count=int(swatches_.size());
    paletteScrollRow_=std::clamp(paletteScrollRow_,0,std::max(0,(count+columns-1)/columns-rows));
    for(std::size_t i=0;i<swatches_.size();++i) {
      const int row=int(i)/columns-paletteScrollRow_;
      swatches_[i]->paletteMarkerSize=swatchSize_<2?0:swatchSize_<4?1:2;
      auto cellBounds=gfx::Rect(area.x+padding+int(i%columns)*step,area.y+padding+row*step,cell,cell);
      if(swatches_[i]->active) cellBounds.enlarge(2);
      swatches_[i]->setBounds(uiPhysical(cellBounds));
      swatches_[i]->setVisible(palettePanelOpen_ && row>=0 && row<rows && paletteContentBounds().contains(swatches_[i]->bounds()));
    }
    // Paint surrounding selection frames after neighboring color cells.
    for(auto swatch:swatches_) if(swatch->active) moveChildTo(swatch,children().back());
    if(paletteLock_) {
      paletteLock_->setBounds(uiPhysical(gfx::Rect(rc.x+l.rightX+Layout::inset+(15+uiGap),rc.y+l.top+Layout::inset,15,16)));
      paletteLock_->icon=paletteLocked_?"lock":"unlock";
      primaryRole_->setBounds(uiPhysical(gfx::Rect(rc.x+l.rightX+Layout::inset+2*(15+uiGap),rc.y+l.top+Layout::inset+1,22,14)));
      secondaryRole_->setBounds(uiPhysical(gfx::Rect(rc.x+l.rightX+Layout::inset+2*(15+uiGap)+22+uiGap,rc.y+l.top+Layout::inset+1,22,14)));
      primaryRole_->swatch=document.displayPalette().primary;secondaryRole_->swatch=document.displayPalette().secondary;
      for(auto b:{paletteLock_,primaryRole_,secondaryRole_}) {b->setVisible((palettePanelOpen_) && (b==paletteLock_ || !colorPickerOpen_));b->setEnabled(pending_==Pending::None);}
    }
    if(paletteActions_) {
      paletteActions_->setBounds(uiPhysical(gfx::Rect(rc.x+l.rightX+Layout::inset,rc.y+l.top+Layout::inset,15,16)));
      paletteActions_->setVisible(palettePanelOpen_);
      paletteActions_->setEnabled(pending_==Pending::None);
    }
    if(colorPicker_) {
      auto inner=l.pickerGradient(!recentColors_.values().empty());inner.offset(rc.x,rc.y);inner.shrink(1);inner=uiPhysical(inner);
      colorPicker_->setBounds(inner);
      colorPicker_->syncColors(document.displayPalette().primary,document.displayPalette().secondary);
      colorPicker_->setVisible(colorPickerOpen_ && pending_==Pending::None);
      colorPicker_->setEnabled(pending_==Pending::None);
    }
    if(pickerPrimary_) {
      const auto box=l.pickerGradient(!recentColors_.values().empty());
      const int x=rc.x+box.x,y=rc.y+box.y2()+uiGap;
      const bool shown=colorPickerOpen_ && pending_==Pending::None;
      bool inPalette=false;for(int id:document.palette().slots) if(const auto entry=document.paletteEntry(id)) if(entry->color==document.palette().primary) inPalette=true;
      pickerPrimary_->setBounds(uiPhysical(gfx::Rect(x,y,box.w-(inPalette?0:15+uiGap),20)));
      pickerSecondary_->setBounds(uiPhysical(gfx::Rect(x,y+20+uiGap,box.w,20)));
      pickerPrimary_->swatch=document.displayPalette().primary;pickerSecondary_->swatch=document.displayPalette().secondary;
      pickerPrimary_->setVisible(shown);pickerSecondary_->setVisible(shown);
      pickerAdd_->setBounds(uiPhysical(gfx::Rect(x+box.w-15,y+(20-16)/2,15,16)));
      pickerAdd_->setVisible(shown && !inPalette);
      constexpr int recentSize=12;
      const int capacity=std::max(0,(box.w+uiGap)/(recentSize+uiGap));
      while(recentButtons_.size()<recentColors_.values().size()) {
        const auto index=recentButtons_.size();auto b=button(U"",[]{});b->paletteCell=true;b->recentColorSwatch=true;
        b->palettePress=[this,index](const ui::MouseMessage& mouse) {
          if(!mouse.left() && !mouse.right()) return;
          colorPicker_->finishInteraction();document.setPaletteRole(recentColors_.values().at(index),mouse.right(),paletteLocked_);refresh();
        };recentButtons_.push_back(b);
      }
      for(std::size_t i=0;i<recentButtons_.size();++i) {
        auto b=recentButtons_[i];const bool exists=i<recentColors_.values().size();
        if(exists) b->swatch=recentColors_.values()[i];
        b->setBounds(uiPhysical(gfx::Rect(x+int(i)*(recentSize+uiGap),y+2*(20+uiGap),recentSize,recentSize)));
        b->setVisible(shown && exists && int(i)<capacity);
      }
    }
  }
  std::filesystem::path palettePreferencePath() const {
    const auto base=_wgetenv(L"LOCALAPPDATA");
    if(!base) throw std::runtime_error("LOCALAPPDATA unavailable");
    return std::filesystem::path(base)/L"MoonSprite"/L"Native"/L"palette-swatch-size.txt";
  }
  static const char* modalSizeKey(Pending action) {
    static const char* keys[]{"none","new","open","error","close","layer-opacity","frame-duration","loop","onion","palette-name","color-role"};
    return keys[int(action)];
  }
  void writeWorkspaceSizes(std::ostream& out) const {
    out.precision(17);out<<"moonsprite-workspace-sizes-v1\n";
    out<<"dock "<<dockWidth_<<' '<<paletteShare_<<' '<<timelineHeight_<<'\n';
    if(previewPanel_) {const auto r=previewPanel_->bounds();out<<"preview "<<r.x<<' '<<r.y<<' '<<r.w<<' '<<r.h<<'\n';}
    for(const auto& item:modalGeometry_) {const auto r=item.second;out<<"modal "<<modalSizeKey(item.first)<<' '<<r.x<<' '<<r.y<<' '<<r.w<<' '<<r.h<<'\n';}
  }
  void saveWorkspaceSizes() {
    if(smoke_)return;
    try {
      const auto path=palettePreferencePath().parent_path()/"workspace-sizes.txt";std::filesystem::create_directories(path.parent_path());
      std::ofstream out(path);writeWorkspaceSizes(out);
      out.close();if(!out)throw std::runtime_error("Cannot save workspace sizes");
    }catch(const std::exception& e){status_=U"栏目尺寸保存失败："+unicodeText(e.what());}
  }
  void loadWorkspaceSizes() {
    std::ifstream in(palettePreferencePath().parent_path()/"workspace-sizes.txt");readWorkspaceSizes(in);
  }
  void readWorkspaceSizes(std::istream& in) {
    std::string header;
    if(!(in>>header) || header!="moonsprite-workspace-sizes-v1")return;
    std::string line;std::getline(in,line);
    while(std::getline(in,line)) {
      std::istringstream row(line);std::string kind;row>>kind;
      if(kind=="dock") {
        int width,height;double share;
        if(row>>width>>share>>height && width>=0 && width<=8192 && std::isfinite(share) && share>=0 && share<=1 && height>=65 && height<=8192)
          {dockWidth_=width;paletteShare_=share;timelineHeight_=height;}
      } else {
        std::string key;if(kind=="modal")row>>key;
        gfx::Rect r;if(!(row>>r.x>>r.y>>r.w>>r.h) || std::abs(double(r.x))>16384 || std::abs(double(r.y))>16384 || r.w>8192 || r.h>8192)continue;
        if(kind=="preview" && r.w>=180 && r.h>=120 && previewPanel_)previewPanel_->setBounds(r);
        if(kind=="modal" && r.w>=240 && r.h>=67)for(int i=1;i<=int(Pending::ColorRole);++i)
          if(key==modalSizeKey(Pending(i)))modalGeometry_[Pending(i)]=r;
      }
    }
  }
  void saveSelectionPreferences(){if(smoke_)return;try{const auto path=palettePreferencePath().parent_path();std::filesystem::create_directories(path);std::ofstream out(path/"selection-options.txt");out<<selectionRounded_<<' '<<selectionCornerRadius_<<' '<<selectionMode_<<' '<<selectionPivotVisible_<<'\n';}catch(...){status_=U"选区偏好保存失败";}}
  void saveBrushPreferences() {
    if(smoke_) return;
    try {
      const auto path=palettePreferencePath().parent_path();std::filesystem::create_directories(path);
      std::ofstream out(path/"brush-profiles.txt");
      for(const auto& brush:brushProfiles_) out<<brush.size<<' '<<brush.opacity<<' '<<int(brush.shape)<<'\n';
      out<<selectionBrushAngle_<<' '<<selectionRotSprite_<<'\n';out<<fillOptions_.tolerance<<' '<<fillOptions_.contiguous<<' '<<fillOptions_.gapClosing<<' '<<fillOptions_.gapThreshold<<' '<<fillOptions_.visibleLayers<<' '<<fillOptions_.connectivity<<'\n';out<<gradientSpec_.radial<<' '<<gradientSpec_.dither<<' '<<gradientOptions_.tolerance<<' '<<gradientOptions_.contiguous<<' '<<gradientConfirm_<<' '<<gradientFreeform_<<' '<<gradientStops_.size()<<'\n';for(const auto& stop:gradientStops_)out<<stop.position<<' '<<stop.color<<'\n';out<<int(shapeSpec_.kind)<<' '<<shapeRounded_<<' '<<shapeRadius_<<' '<<shapeRatio_<<' '<<shapeRatioWidth_<<' '<<shapeRatioHeight_<<'\n';out<<int(fillPattern_.texture)<<' '<<fillPattern_.textureScale<<'\n';out.close();if(!out) throw std::runtime_error("Brush preferences write failed");
    } catch(const std::exception&) {status_=U"笔刷参数已调整，但偏好保存失败";}
  }
  void commitBrushField(bool opacity) {
    if(updatingBrushFields_ || handTool_ || pending_!=Pending::None) return;
    auto input=opacity?brushOpacityInput_:brushSizeInput_;
    try {
      std::size_t end=0;const auto value=std::stod(input->text(),&end);
      if(end!=input->text().size() || !std::isfinite(value)) return;
      auto& brush=brushProfiles_[eraser_?1:0];
      const int next=int(std::floor(std::clamp(value,opacity?0.0:1.0,opacity?100.0:64.0)+0.5));
      auto& target=opacity?brush.opacity:brush.size;
      if(target!=next) {target=next;saveBrushPreferences();if(brushRange_ && brushRangeOpacity_==opacity) {brushRange_->value=next;brushRange_->invalidate();}}
    } catch(const std::exception&) {return;}
  }
  void brushShapeMenu() {
    if(pending_!=Pending::None || document.active()) return;
    PixelMenu menu(skin_);const char32_t* labels[]={U"圆形",U"方形",U"线形"};const char* icons[]={"brush-round","brush-square","brush-line"};
    for(int i=0;i<3;++i) {auto item=new PixelMenuItem(font_,skin_,labels[i]);item->iconSkin=&toolIcons_;item->icon=icons[i];
      item->checked=[this,i]{return int(brushProfiles_[eraser_?1:0].shape)==i;};
      item->Click.connect([this,i]{brushProfiles_[eraser_?1:0].shape=BrushShape(i);saveBrushPreferences();refresh();});menu.addChild(item);}
    menu.showPopup(gfx::Point(brushShapeButton_->bounds().x,brushShapeButton_->bounds().y2()+uiGap*uiScale),display());requestFocus();
  }
  void showBrushRange(bool opacity) {
    if(!brushRange_ || handTool_ || pending_!=Pending::None) return;
    brushRangeOpacity_=opacity;brushRange_->minimum=opacity?0:1;brushRange_->maximum=opacity?100:64;brushRange_->percentage=opacity;
    brushRange_->value=opacity?brushProfiles_[eraser_?1:0].opacity:brushProfiles_[eraser_?1:0].size;
    const auto input=opacity?brushOpacityInput_:brushSizeInput_;const auto at=input->bounds();
    brushRange_->setBounds(gfx::Rect(at.x,at.y2()+uiGap*uiScale,119*uiScale,18*uiScale));brushRange_->setVisible(true);brushRange_->invalidate();
  }
  gfx::Rect homeBounds() const {
    const auto rc=uiLogical(bounds());const int width=std::min(490,rc.w-20);
    return {rc.x+(rc.w-width)/2,rc.y+Layout::workY+10,width,rc.h-Layout::workY-Layout::statusHeight-20};
  }
  int homeContentY() const {const auto box=homeBounds();return box.y+(box.h<340?90:130);}
  std::filesystem::path homeRecentPath() const {return palettePreferencePath().parent_path()/"home-recent.txt";}
  void recordHomeRecent(const std::filesystem::path& path) {
    if(smoke_ || path.empty())return;
    homeRecent_.erase(std::remove(homeRecent_.begin(),homeRecent_.end(),path),homeRecent_.end());homeRecent_.insert(homeRecent_.begin(),path);
    if(homeRecent_.size()>24)homeRecent_.resize(24);
    try{std::filesystem::create_directories(homeRecentPath().parent_path());std::ofstream out(homeRecentPath(),std::ios::binary);for(const auto& entry:homeRecent_)out<<std::quoted(entry.u8string())<<'\n';out.close();if(!out)throw std::runtime_error("Cannot write recent projects");}catch(const std::exception&){status_=U"最近文件记录写入失败";}
  }
  void loadHomeSection() {
    homeEntries_.clear();homeScroll_=0;
    if(homeSection_==0)for(const auto& path:homeRecent_)homeEntries_.push_back({unicodeText(path.filename().u8string()),path,{}});
    if(homeSection_==2){loadRecoveries();for(const auto& row:recoveryCatalog_.rows())homeEntries_.push_back({unicodeText(row.name),recoveryDirectory()/std::filesystem::u8path(row.id+".moonsprite"),row.id});}
  }
  void layoutHome() {
    if(homeActions_.empty())return;
    const bool shown=homeOpen_ && pending_==Pending::None;
    const auto box=homeBounds();const int left=std::min(140,box.w/3),right=box.x+left+10,width=box.w-left-10;
    const int top=homeContentY(),step=box.h<340?22:29,height=box.h<340?19:24;
    for(std::size_t i=0;i<homeActions_.size();++i){homeActions_[i]->setVisible(shown);homeActions_[i]->setBounds(uiPhysical(gfx::Rect(box.x,top+int(i)*step,left,height)));}
    for(std::size_t i=0;i<homeActions_.size();++i)homeActions_[i]->setEnabled(shown && i<2);
    homeReturn_->setVisible(shown && documentOpen_);homeReturn_->setBounds(uiPhysical(gfx::Rect(box.x2()-94,box.y+2,94,19)));
    homeReturn_->setEnabled(shown);
    for(int i=0;i<3;++i){homeTabs_[i]->setVisible(shown);homeTabs_[i]->setEnabled(shown && i!=1);homeTabs_[i]->active=homeSection_==i;homeTabs_[i]->setBounds(uiPhysical(gfx::Rect(right+i*68,top,67,19)));}
    const int count=std::max(0,(box.y2()-top-36)/28);homeScroll_=std::clamp(homeScroll_,0,std::max(0,int(homeEntries_.size())-count));
    while(homeRows_.size()<homeEntries_.size()){const auto slot=homeRows_.size();auto row=button(U"",[this,slot]{const auto index=homeScroll_+int(slot);if(index>=int(homeEntries_.size()))return;const auto entry=homeEntries_[index];if(entry.recoveryId.empty())openPath(entry.path);else restoreRecovery(entry.path,entry.recoveryId,entry.name);});row->iconWithCaption=true;row->iconSkin=&toolIcons_;row->icon="image";homeRows_.push_back(row);}
    for(std::size_t i=0;i<homeRows_.size();++i){const int index=homeScroll_+int(i);auto row=homeRows_[i];row->setEnabled(shown);row->setVisible(shown && int(i)<count && index<int(homeEntries_.size()));row->setBounds(uiPhysical(gfx::Rect(right+5,top+26+int(i)*28,width-10,22)));if(index<int(homeEntries_.size()))row->caption=homeEntries_[index].name;}
  }
  void showHome(bool open) {
    if(pending_!=Pending::None || document.active())return;
    playing_=false;
    if(open && !homeOpen_){homeVisibility_.clear();for(auto child:children())homeVisibility_.push_back({child,!child->hasFlags(ui::HIDDEN)});loadHomeSection();homeBannerDue_=std::chrono::steady_clock::now()+std::chrono::seconds(8);}
    homeOpen_=open;refresh();
  }
  void applyHomeVisibility() {
    if(homeOpen_){for(auto child:children())if(child!=menuBar_ && child!=homeButton_ && child!=discard_ && child!=keep_ && child!=dialogClose_ && child!=saveBeforeClose_ && child!=paletteInput_)child->setVisible(false);}
    if(homeOpen_){documentTabNew_->setVisible(documentOpen_);documentTabClose_->setVisible(documentOpen_);}
    layoutHome();
  }
  void createHome() {
    auto image=[&](const std::filesystem::path& path){const auto patch=importSkinPng(path,2048);const auto& b=*patch.bitmap;auto surface=os::instance()->makeRgbaSurface(b.width,b.height);surface->clear();{os::SurfaceLock lock(surface.get());for(int y=0;y<b.height;++y)for(int x=0;x<b.width;++x){const auto p=b.pixels[y*b.width+x];surface->putPixel(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24),x,y);}}return surface;};
    homeLogo_=image(assets_/"home/logo.png");for(const auto name:{"fire","crystal","coast","hall","stone-lion","contempt"})homeBanners_.push_back(image(assets_/"home"/(std::string("home-banner-")+name+".png")));
    std::ifstream recent(homeRecentPath(),std::ios::binary);std::string path;while(homeRecent_.size()<24 && recent>>std::quoted(path))if(path.size()<32768)homeRecent_.push_back(std::filesystem::u8path(path));
    auto action=[&](const char32_t* title,const char* icon,std::function<void()> run={}){auto b=button(title,run?run:[]{});b->iconSkin=&toolIcons_;b->icon=icon;b->iconWithCaption=true;b->setEnabled(bool(run));homeActions_.push_back(b);};
    action(U"新建精灵","plus",[this]{ask(Pending::New);});action(U"打开精灵","folderOpen",[this]{chooseProject();});action(U"工程备份","save");action(U"使用帮助","info");action(U"使用技巧","info");action(U"Steam 愿望单","link");
    for(int i=0;i<3;++i){const char32_t* titles[]{U"最近文件",U"画廊",U"恢复"};auto b=button(titles[i],[this,i]{homeSection_=i;loadHomeSection();refresh();});if(i==1)b->setEnabled(false);homeTabs_.push_back(b);}
    homeReturn_=button(U"返回当前工程",[this]{showHome(false);});
    layoutHome();
  }
  // The work layer overlays the flat base layer; columns are painted above it.
  void paintWorkLayer(ui::Graphics& g,const gfx::Rect& rc) {
    const int top=Layout::documentY+Layout::tabHeight-1;
    g.fillRect(skin_["panel"],gfx::Rect(0,top,rc.w,rc.h-top));
    g.fillRect(gfx::rgba(0,0,0,255),gfx::Rect(0,top,rc.w,1));
    g.fillRect(gfx::rgba(66,79,103,255),gfx::Rect(0,top+1,rc.w,1));
  }
  void paintDocumentTab(ui::Graphics& g) {
    const auto l=workspaceLayout(uiLogical(bounds()));
    const std::u32string documentTitle=document.name();
    const int tabWidth=documentTabWidth(l);
    const auto rc=uiLogical(clientBounds());
    if(documentOpen_)skin_.draw(g,homeOpen_?"project_tab.inactive":"project_tab.active",gfx::Rect(0,Layout::documentY,tabWidth,Layout::tabHeight));
    if(documentOpen_)g.fillRect(skin_[homeOpen_?"panel":"button"],gfx::Rect(0,Layout::documentY+1,1,Layout::tabHeight-1));
    const auto titleInk=font_.inkBounds(documentTitle);
    // The tab's 3px cap ends before its 2px content padding. Its bottom is open.
    if(documentOpen_){
      const int visibleTitleWidth=std::min(titleInk.w,tabWidth-2*Layout::inset-11-uiGap-(document.dirty()?3+uiGap:0));
      g.saveClip();g.clipRect(gfx::Rect(Layout::inset,Layout::documentY+1,visibleTitleWidth,12));
      font_.draw(g,documentTitle,Layout::edge+Layout::inset-titleInk.x,Layout::documentY+1-titleInk.y,skin_["text"]);g.restoreClip();
      if(document.dirty())g.fillRect(gfx::rgba(41,121,255,255),gfx::Rect(Layout::inset+visibleTitleWidth+uiGap,Layout::documentY+6,3,3));
    }
  }
  void paintHome(ui::Graphics& g) {
    UiPaintScale scale(g);const auto rc=uiLogical(clientBounds()),absolute=homeBounds();auto box=absolute;box.offset(-bounds().x/uiScale,-bounds().y/uiScale);
    g.fillRect(skin_["background"],rc);
    if(documentOpen_){paintWorkLayer(g,rc);paintDocumentTab(g);}
    auto text=[&](const std::u32string& title,int x,int y,bool muted=false){font_.draw(g,title,x,y,skin_[muted?"muted":"text"]);};
    g.drawSurface(homeLogo_.get(),gfx::Rect(0,0,14,14),gfx::Rect(box.x,box.y,28,28),os::Sampling(),nullptr);
    text(U"MOONSPRITE",box.x+36,box.y+2);text(U"像素艺术专业编辑器",box.x+36,box.y+17,true);
    g.fillRect(skin_["border"],gfx::Rect(box.x,box.y+36,box.w,1));
    const auto& banner=homeBanners_[homeBanner_%homeBanners_.size()];const gfx::Rect frame(box.x,box.y+44,box.w,box.h<340?36:72);
    const double factor=std::max(double(frame.w)/banner->width(),double(frame.h)/banner->height());const int sourceW=std::max(1,int(frame.w/factor)),sourceH=std::max(1,int(frame.h/factor));
    g.drawSurface(banner.get(),gfx::Rect((banner->width()-sourceW)/2,(banner->height()-sourceH)/2,sourceW,sourceH),frame,os::Sampling(),nullptr);
    const char32_t* titles[]{U"火焰之境 · 90y",U"月球基底 · 90y",U"沙船 · 90y",U"大厅 · 90y",U"石狮 · 线框",U"蔑视 · 月猫"};
    g.fillRect(skin_["background"],gfx::Rect(frame.x+3,frame.y2()-15,130,12));text(titles[homeBanner_%6],frame.x+6,frame.y2()-14,true);
    const int left=std::min(140,box.w/3),right=box.x+left+10,width=box.w-left-10;
    const int top=homeContentY()-bounds().y/uiScale;
    const gfx::Rect list(right,top+22,width,std::max(12,box.y2()-top-22));g.fillRect(skin_["panel"],list);skin_.draw(g,"panel_outer",list);
    if(homeEntries_.empty()){g.saveClip();g.clipRect(gfx::Rect(right+5,top+27,width-10,list.h-10));text(homeSection_==2?U"没有待恢复的工程":homeSection_==1?U"画廊尚未迁移":U"没有最近文件",right+10,top+44);text(homeSection_==2?U"非正常关闭的工程会出现在这里。":U"打开或保存工程后，会显示在这里。",right+10,top+61,true);g.restoreClip();}
    const auto y=box.y+322;if(y+36<box.y2()){text(U"MoonSprite",box.x,y,true);text(U"像素绘画与动画创作",box.x,y+15,true);}
    text(status_,uiGap,rc.h-Layout::statusHeight+uiGap,true);
  }
  void createToolOptions() {
    try {
      {std::ifstream selectionSettings(palettePreferencePath().parent_path()/"selection-options.txt");int rounded,radius,mode,pivot;if(selectionSettings>>rounded>>radius>>mode>>pivot){selectionRounded_=rounded!=0;selectionCornerRadius_=std::clamp(radius,0,256);selectionMode_=std::clamp(mode,0,3);selectionPivotVisible_=pivot!=0;}}
      const auto path=palettePreferencePath().parent_path()/"brush-profiles.txt";
      if(std::filesystem::exists(path)) {
        std::ifstream in(path);int size,opacity,shape;
        for(auto& brush:brushProfiles_) {if(!(in>>size>>opacity>>shape)) throw std::runtime_error("Invalid brush preferences");
          brush={std::clamp(size,1,64),std::clamp(opacity,0,100),BrushShape(std::clamp(shape,0,2))};}int angle;if(in>>angle)selectionBrushAngle_=std::clamp(angle,-180,180);int algorithm;if(in>>algorithm)selectionRotSprite_=algorithm==1;int tolerance,contiguous,gap,threshold,reference,connectivity;if(in>>tolerance>>contiguous>>gap>>threshold>>reference>>connectivity)fillOptions_={std::clamp(tolerance,0,255),connectivity==8?8:4,std::clamp(threshold,1,16),contiguous!=0,gap!=0,reference!=0};int radial,dither,gt,gc,confirm,freeform;std::size_t stops;if(in>>radial>>dither>>gt>>gc>>confirm>>freeform>>stops){gradientSpec_.radial=radial!=0;gradientSpec_.dither=std::clamp(dither,0,8);gradientOptions_.tolerance=std::clamp(gt,0,255);gradientOptions_.contiguous=gc!=0;gradientConfirm_=confirm!=0;gradientFreeform_=freeform!=0;if(stops<=4096)for(std::size_t i=0;i<stops;++i){GradientStop stop;if(!(in>>stop.position>>stop.color))break;if(std::isfinite(stop.position)){stop.position=std::clamp(stop.position,0.0,1.0);gradientStops_.push_back(stop);}}std::stable_sort(gradientStops_.begin(),gradientStops_.end(),[](auto a,auto b){return a.position<b.position;});}int kind,rounded,radius,ratio;double rw,rh;if(in>>kind>>rounded>>radius>>ratio>>rw>>rh){shapeSpec_.kind=ShapeKind(std::clamp(kind,0,4));shapeRounded_=rounded!=0;shapeRadius_=std::clamp(radius,0,256);shapeRatio_=ratio!=0;if(std::isfinite(rw))shapeRatioWidth_=std::clamp(rw,.1,100.0);if(std::isfinite(rh))shapeRatioHeight_=std::clamp(rh,.1,100.0);}int texture,textureScale;if(in>>texture>>textureScale){fillPattern_.texture=FillTexture(std::clamp(texture,0,3));fillPattern_.textureScale=std::clamp(textureScale,1,16);}
      }
    } catch(const std::exception&) {status_=U"笔刷偏好读取失败，使用有效默认值";}
    wandOptions_.connectivity=fillOptions_.connectivity;wandOptions_.visibleLayers=fillOptions_.visibleLayers;
    auto icon=[&](const char* name,const char32_t* hint,bool enabled=false) {
      auto control=button(U"",[]{});control->icon=name;control->iconSkin=&toolIcons_;control->setEnabled(enabled);
      control->hover=[this,hint]{status_=hint;invalidate();};toolControls_.push_back({control,15});return control;
    };
    auto label=[&](const char32_t* text) {auto control=button(text,[]{});control->labelOnly=true;control->setEnabled(false);toolControls_.push_back({control,font_.measure(text)});return control;};
    brushShapeButton_=icon("brush-round",U"笔刷形状",true);brushShapeButton_->Click.connect([this]{brushShapeMenu();});
    icon("dither",U"笔刷抖动：尚未迁移");imageBrushButton_=icon("image",U"图像笔刷",true);imageBrushButton_->Click.connect([this]{showPencilImageBrushes();});
    toolControls_[0].gap=toolControls_[1].gap=-1;
    auto number=[&](bool opacity) {
      auto control=new PixelEntry(font_,skin_);addChild(control);control->suffix=opacity?U"%":U"px";
      const int width=font_.measure(opacity?U"100":U"64")+font_.measure(control->suffix)+2*(2+uiGap)+uiGap+1;
      toolControls_.push_back({control,width});
      control->focus=[this,opacity]{showBrushRange(opacity);};
      control->Change.connect([this,opacity]{commitBrushField(opacity);});
      control->accept=[this,opacity]{commitBrushField(opacity);requestFocus();layoutToolOptions();};
      control->blur=[this,opacity]{commitBrushField(opacity);};
      control->cancel=[this]{requestFocus();layoutToolOptions();};
      control->wheel=[this,opacity](int delta){auto& value=opacity?brushProfiles_[eraser_?1:0].opacity:brushProfiles_[eraser_?1:0].size;
        value=std::clamp(value+delta,opacity?0:1,opacity?100:64);saveBrushPreferences();layoutToolOptions();invalidate();};
      return control;
    };
    brushSizeInput_=number(false);label(U"不透明度");brushOpacityInput_=number(true);
    {auto scrubLabel=static_cast<PixelButton*>(toolControls_[4].first);scrubLabel->setEnabled(true);scrubLabel->framePress=[this](const ui::MouseMessage& msg){numberScrubLastX_=msg.position().x;};scrubLabel->frameDrag=[this](int x){brushOpacityInput_->adjustNumber((x-numberScrubLastX_)*((os::instance()->keyModifiers() & ui::kKeyShiftModifier)?10:1));numberScrubLastX_=x;};}
    label(U"阶梯");toolControls_.back().pencilOnly=true;
    auto step=new PixelEntry(font_,skin_);addChild(step);step->setText("1");step->setEnabled(false);step->hover=[this]{status_=U"线条阶梯：尚未迁移";invalidate();};toolControls_.push_back({step,22,uiGap,true});
    auto perfect=icon("checkboxUnchecked",U"完美像素：尚未迁移");perfect->caption=U"完美像素";perfect->bareIconWithCaption=true;toolControls_.back().second=11+uiGap+font_.measure(perfect->caption);
    icon("ink-simple",U"墨水模式：当前仅普通模式，其他模式尚未迁移");icon("pressure-dynamics",U"压力与速度动态：尚未迁移");
    const auto symmetryStart=toolControls_.size();
    const char* symmetryIcons[]{"symmetry-horizontal","symmetry-vertical","symmetry-diagonal-up","symmetry-diagonal-down","symmetry-rotational","more"};
    for(int i=0;i<6;++i){auto b=icon(symmetryIcons[i],i<5?U"对称绘制":U"对称轴设置");b->setEnabled(true);symmetryButtons_[i]=b;b->Click.connect([this,i]{if(i==5)showSymmetryMenu();else toggleSymmetry(i);});}
    for(std::size_t i=symmetryStart;i+1<toolControls_.size();++i) toolControls_[i].gap=-1;
    commands_[3]->icon="undo";commands_[4]->icon="redo";
    for(auto b:{commands_[3],commands_[4]}) {b->iconSkin=&toolIcons_;b->iconWithCaption=true;}
    auto option=[&](const char32_t* text,int width,auto action){auto b=button(text,action);selectionControls_.push_back({b,width});return b;};
    auto modeGroup=new ui::Widget(ui::kGenericWidget);addChild(modeGroup);selectionControls_.push_back({modeGroup,57});
    const char* modeIcons[]{"selection-replace","selection-add","selection-subtract","selection-intersect"};
    const char32_t* modeNames[]{U"替换选区",U"添加选区",U"减去选区",U"相交选区"};
    for(int i=0;i<4;++i){auto b=new PixelButton(font_,skin_,U"",[this,i]{selectionMode_=i;saveSelectionPreferences();layoutToolOptions();invalidateRect(canvasViewport());});b->icon=modeIcons[i];b->iconSkin=&toolIcons_;b->iconGroupIndex=i;b->iconGroupCount=4;b->hover=[this,i,modeNames]{status_=modeNames[i];invalidate();};modeGroup->addChild(b);selectionModeButtons_[i]=b;}
    auto wandNumber=[&](bool gap){auto entry=new PixelEntry(font_,skin_);entry->numeric=true;addChild(entry);selectionControls_.push_back({entry,gap?30:32});auto commit=[this,entry,gap]{try{std::size_t used=0;const double raw=std::stod(entry->text(),&used);if(used!=entry->text().size() || !std::isfinite(raw))return;const int value=int(std::floor(std::clamp(raw,-1000.0,1000.0)+.5));if(gap)wandOptions_.gapThreshold=std::clamp(value,1,16);else wandOptions_.tolerance=std::clamp(value,0,255);}catch(...){ }layoutToolOptions();};entry->Change.connect(commit);entry->accept=[this,commit]{commit();requestFocus();};entry->blur=commit;entry->cancel=[this]{requestFocus();layoutToolOptions();};entry->wheel=[this,gap](int delta){if(gap)wandOptions_.gapThreshold=std::clamp(wandOptions_.gapThreshold+delta,1,16);else wandOptions_.tolerance=std::clamp(wandOptions_.tolerance+delta,0,255);layoutToolOptions();invalidate();};return entry;};
    option(U"容差",28,[]{})->labelOnly=true;wandToleranceInput_=wandNumber(false);
    wandContiguousButton_=option(U"连续",45,[this]{wandOptions_.contiguous=!wandOptions_.contiguous;layoutToolOptions();invalidate();});
    wandGapButton_=option(U"智能闭合",65,[this]{wandOptions_.gapClosing=!wandOptions_.gapClosing;layoutToolOptions();invalidate();});wandGapInput_=wandNumber(true);
    for(auto b:{wandContiguousButton_,wandGapButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}
    wandConnectivityButton_=option(U"4 方连接",57,[this]{wandOptions_.connectivity=wandOptions_.connectivity==4?8:4;fillOptions_.connectivity=wandOptions_.connectivity;saveBrushPreferences();layoutToolOptions();invalidate();});
    wandReferenceButton_=option(U"当前图层",67,[this]{wandOptions_.visibleLayers=!wandOptions_.visibleLayers;fillOptions_.visibleLayers=wandOptions_.visibleLayers;saveBrushPreferences();layoutToolOptions();invalidate();});
    selectionBrushAngleInput_=new PixelEntry(font_,skin_);selectionBrushAngleInput_->numeric=true;selectionBrushAngleInput_->suffix=U"°";addChild(selectionBrushAngleInput_);selectionControls_.push_back({selectionBrushAngleInput_,42});auto angleCommit=[this]{try{std::size_t used=0;const double value=std::stod(selectionBrushAngleInput_->text(),&used);if(used==selectionBrushAngleInput_->text().size() && std::isfinite(value))selectionBrushAngle_=std::clamp(int(std::floor(std::clamp(value,-180.0,180.0)+.5)),-180,180);}catch(...){}saveBrushPreferences();layoutToolOptions();invalidateRect(canvasViewport());};selectionBrushAngleInput_->Change.connect(angleCommit);selectionBrushAngleInput_->blur=angleCommit;selectionBrushAngleInput_->accept=[this,angleCommit]{angleCommit();requestFocus();};selectionBrushAngleInput_->cancel=[this]{requestFocus();layoutToolOptions();};selectionBrushAngleInput_->wheel=[this](int delta){selectionBrushAngle_=std::clamp(selectionBrushAngle_+delta,-180,180);saveBrushPreferences();layoutToolOptions();invalidateRect(canvasViewport());};
    selectionAlgorithmButton_=option(U"快速旋转",70,[this]{if(selectionDragging_ || floatingDragging_)return;selectionRotSprite_=!selectionRotSprite_;saveBrushPreferences();if(auto target=document.floatingTransform())document.transformFloatingPaste(*target,selectionRotSprite_);layoutToolOptions();invalidateRect(canvasViewport());});
    const char32_t* fieldSuffix[]{U"X",U"Y",U"宽",U"高",U"°"};
    for(int index=0;index<5;++index){auto input=new PixelEntry(font_,skin_);input->numeric=true;input->suffix=fieldSuffix[index];addChild(input);selectionTransformFields_[index]=input;selectionControls_.push_back({input,48});auto commit=[this,input,index]{if(selectionDragging_ || floatingDragging_)return;try{std::size_t used=0;const double value=std::stod(input->text(),&used);if(used!=input->text().size() || !std::isfinite(value) || !document.selection())return;auto target=*selectionTransformTarget();if(index==0 || index==1){const double next=std::floor(value+.5);auto& coordinate=index==0?target.x:target.y;auto& origin=index==0?target.flipOriginX:target.flipOriginY;if(origin)*origin+=next-coordinate;coordinate=next;}else if(index==4)target.angle=std::floor(value*10+.5)/10;else{const double magnitude=std::max(1.0,std::floor(std::abs(value)+.5)),old=index==2?target.width:target.height;const bool oldFlip=index==2?target.flipHorizontal:target.flipVertical;const double factor=(value<0?-magnitude:magnitude)/(old*(oldFlip?-1:1));const double radians=target.angle*3.141592653589793/180,dx=index==2?(factor-1)*old/2:0,dy=index==3?(factor-1)*old/2:0;const auto previous=target;target=resizeSelectionTransform(target,{dx*std::cos(radians)-dy*std::sin(radians),dx*std::sin(radians)+dy*std::cos(radians)},index==2?"e":"s",false,false,true);if(factor>0 && oldFlip){auto& origin=index==2?target.flipOriginX:target.flipOriginY;const auto& original=index==2?previous.flipOriginX:previous.flipOriginY;if(original)origin=(index==2?target.x:target.y)+(*original-(index==2?previous.x:previous.y))/old*magnitude;}}if(!document.beginSelectionContentMove(false,frameSelectionExplicit_))return;document.transformFloatingPaste(target,selectionRotSprite_);selectionPropertiesActive_=true;layoutToolOptions();invalidateRect(canvasViewport());}catch(...){}};input->Change.connect(commit);input->blur=commit;input->accept=[this,commit]{commit();requestFocus();layoutToolOptions();};input->cancel=[this]{requestFocus();layoutToolOptions();};}





    auto fillButton=[&](const char32_t* caption,int width,std::function<void()> action){auto b=button(caption,[this,action]{action();saveBrushPreferences();layoutToolOptions();invalidate();});fillControls_.push_back({b,width});return b;};
    auto fillNumber=[&](bool gap){auto input=new PixelEntry(font_,skin_);input->numeric=true;addChild(input);fillControls_.push_back({input,34});auto commit=[this,input,gap]{try{std::size_t used=0;double value=std::stod(input->text(),&used);if(used!=input->text().size() || !std::isfinite(value))return;const int next=int(std::floor(std::clamp(value,0.0,255.0)+.5));if(gap)fillOptions_.gapThreshold=std::clamp(next,1,16);else fillOptions_.tolerance=next;saveBrushPreferences();}catch(...){}layoutToolOptions();};input->Change.connect(commit);input->blur=commit;input->accept=[this,commit]{commit();requestFocus();};return input;};
    fillButton(U"容差",28,[]{})->labelOnly=true;fillToleranceInput_=fillNumber(false);
    fillContiguousButton_=fillButton(U"连续",45,[this]{fillOptions_.contiguous=!fillOptions_.contiguous;});
    fillGapButton_=fillButton(U"智能闭合",65,[this]{fillOptions_.gapClosing=!fillOptions_.gapClosing;});fillGapInput_=fillNumber(true);
    for(auto b:{fillContiguousButton_,fillGapButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}
    fillConnectivityButton_=fillButton(U"4 方连接",57,[this]{fillOptions_.connectivity=fillOptions_.connectivity==4?8:4;wandOptions_.connectivity=fillOptions_.connectivity;});
    fillReferenceButton_=fillButton(U"当前图层",67,[this]{fillOptions_.visibleLayers=!fillOptions_.visibleLayers;wandOptions_.visibleLayers=fillOptions_.visibleLayers;});auto pivotButton=option(U"",15,[this]{showSelectionPivotPopup();});pivotButton->icon="selection-pivot-preset-4";pivotButton->iconSkin=&toolIcons_;pivotButton->iconGroupCount=1;
    auto shrinkButton=option(U"",15,[this]{shrinkSelectionToContent();});shrinkButton->icon="selection-shrink";shrinkButton->iconSkin=&toolIcons_;shrinkButton->iconGroupCount=1;shrinkButton->hover=[this]{status_=U"收缩选区至内容";invalidate();};
    selectionRoundedButton_=option(U"圆角",43,[this]{selectionRounded_=!selectionRounded_;saveSelectionPreferences();layoutToolOptions();invalidate();});selectionRoundedButton_->iconSkin=&toolIcons_;selectionRoundedButton_->bareIconWithCaption=true;
    selectionCornerRadiusInput_=new PixelEntry(font_,skin_);selectionCornerRadiusInput_->numeric=true;selectionCornerRadiusInput_->suffix=U"px";addChild(selectionCornerRadiusInput_);selectionControls_.push_back({selectionCornerRadiusInput_,44});auto radiusCommit=[this]{try{std::size_t used=0;double value=std::stod(selectionCornerRadiusInput_->text(),&used);if(used==selectionCornerRadiusInput_->text().size() && std::isfinite(value)){selectionCornerRadius_=int(std::floor(std::clamp(value,0.0,256.0)+.5));saveSelectionPreferences();}}catch(...){}layoutToolOptions();};selectionCornerRadiusInput_->Change.connect(radiusCommit);selectionCornerRadiusInput_->blur=radiusCommit;selectionCornerRadiusInput_->accept=[this,radiusCommit]{radiusCommit();requestFocus();};selectionCornerRadiusInput_->cancel=[this]{requestFocus();layoutToolOptions();};


  }
  void createGradientOptions(){
    auto control=[&](const char32_t* name,int width,std::function<void()> action){auto b=button(name,[this,action]{action();gradientChanged();});gradientControls_.push_back({b,width});return b;};
    gradientType_=control(U"线性",47,[this]{gradientSpec_.radial=!gradientSpec_.radial;gradientSpec_.geometry.reset();gradientGeometry_={};});gradientType_->iconSkin=&toolIcons_;gradientType_->iconWithCaption=true;
    control(U"容差",28,[]{})->labelOnly=true;
    gradientTolerance_=new PixelEntry(font_,skin_);gradientTolerance_->numeric=true;addChild(gradientTolerance_);gradientControls_.push_back({gradientTolerance_,32});auto tolerance=[this]{try{std::size_t used=0;const auto n=std::stod(gradientTolerance_->text(),&used);if(used==gradientTolerance_->text().size() && std::isfinite(n))gradientOptions_.tolerance=gradientRound(std::clamp(n,0.0,255.0));}catch(...){}gradientChanged();};gradientTolerance_->Change.connect(tolerance);gradientTolerance_->blur=tolerance;gradientTolerance_->accept=[this,tolerance]{tolerance();requestFocus();};
    gradientContiguous_=control(U"连续",45,[this]{gradientOptions_.contiguous=!gradientOptions_.contiguous;});gradientContiguous_->iconSkin=&toolIcons_;gradientContiguous_->bareIconWithCaption=true;
    gradientReference_=control(U"当前图层",67,[this]{fillOptions_.visibleLayers=wandOptions_.visibleLayers=gradientOptions_.visibleLayers=!gradientOptions_.visibleLayers;});
    gradientConnectivity_=control(U"4 方连接",57,[this]{fillOptions_.connectivity=wandOptions_.connectivity=gradientOptions_.connectivity=gradientOptions_.connectivity==4?8:4;});
    gradientDither_=control(U"无抖动",92,[this]{PixelMenu menu(skin_);const char32_t* names[]{U"无抖动",U"Bayer 2×2",U"Bayer 4×4",U"Bayer 8×8",U"棋盘",U"对角线",U"反向对角线",U"水平线",U"垂直线"};for(int i=0;i<9;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->checked=[this,i]{return gradientSpec_.dither==i;};item->Click.connect([this,i]{gradientSpec_.dither=i;gradientChanged();});menu.addChild(item);}menu.showPopup(gfx::Point(gradientDither_->bounds().x,gradientDither_->bounds().y2()),display());});gradientDither_->iconSkin=&toolIcons_;gradientDither_->icon="dither";gradientDither_->iconWithCaption=true;
    gradientFreeformButton_=control(U"自由色标",65,[this]{gradientFreeform_=!gradientFreeform_;if(gradientStops_.size()<2)gradientStops_={{0,ink_},{1,document.palette().secondary}};});gradientFreeformButton_->iconSkin=&toolIcons_;gradientFreeformButton_->bareIconWithCaption=true;
    gradientMode_=control(U"即时应用",65,[this]{gradientConfirm_=!gradientConfirm_;});
    control(U"应用",40,[this]{applyGradientGesture();});control(U"取消",40,[this]{cancelGradientGesture();});
    control(U"色标",40,[this]{PixelMenu menu(skin_);for(int i=0;i<int(gradientStops_.size());++i){auto item=new PixelMenuItem(font_,skin_,unicodeText(std::to_string(gradientRound(gradientStops_[i].position*100)))+U"% "+unicodeText(paletteHex(gradientStops_[i].color)));item->checked=[this,i]{return gradientStop_==i;};item->Click.connect([this,i]{gradientStop_=i;layoutToolOptions();invalidate();});menu.addChild(item);}auto anchor=gradientControls_[11].first->bounds();menu.showPopup(gfx::Point(anchor.x,anchor.y2()),display());});
    gradientStopPosition_=new PixelEntry(font_,skin_);gradientStopPosition_->numeric=true;gradientStopPosition_->suffix=U"%";addChild(gradientStopPosition_);gradientControls_.push_back({gradientStopPosition_,48});auto position=[this]{if(gradientStops_.empty())return;try{std::size_t used=0;const auto n=std::stod(gradientStopPosition_->text(),&used);if(used!=gradientStopPosition_->text().size() || !std::isfinite(n))return;auto& stop=gradientStops_[gradientStop_];const double old=stop.position,next=std::clamp(n/100,0.0,1.0);if(next!=old && (next==0 || next==1))for(int i=0;i<int(gradientStops_.size());++i)if(i!=gradientStop_ && gradientStops_[i].position==next)gradientStops_[i].position=old;stop.position=next;sortGradientStops(stop);}catch(...){} };gradientStopPosition_->Change.connect(position);gradientStopPosition_->blur=position;gradientStopPosition_->accept=[this,position]{position();requestFocus();};
    gradientStopColor_=new PixelEntry(font_,skin_);addChild(gradientStopColor_);gradientControls_.push_back({gradientStopColor_,80});auto color=[this]{if(gradientStops_.empty())return;Pixel next;if(parsePaletteHex(gradientStopColor_->text(),next)){gradientStops_[gradientStop_].color=next;gradientChanged();}};gradientStopColor_->Change.connect(color);gradientStopColor_->blur=color;gradientStopColor_->accept=[this,color]{color();requestFocus();};
    control(U"添加",40,[this]{addGradientStop();});control(U"删除",40,[this]{if(gradientStops_.size()>2){gradientStops_.erase(gradientStops_.begin()+gradientStop_);gradientStop_=std::max(0,gradientStop_-1);}});
    control(U"反转",40,[this]{for(auto& s:gradientStops_)s.position=1-s.position;std::reverse(gradientStops_.begin(),gradientStops_.end());gradientStop_=int(gradientStops_.size())-1-gradientStop_;});
    control(U"重置",40,[this]{gradientStops_={{0,ink_},{1,document.palette().secondary}};gradientStop_=0;});auto track=new GradientStopsTrack(toolIcons_);track->stops=&gradientStops_;track->selected=&gradientStop_;track->changed=[this]{gradientChanged();};addChild(track);gradientControls_.push_back({track,180});
  }
  void createShapeOptions(){auto option=[&](const char32_t* text,int width,std::function<void()> action){auto b=button(text,[this,action]{action();saveBrushPreferences();layoutToolOptions();invalidate();});shapeControls_.push_back({b,width});return b;};shapeModeButton_=option(U"矩形填充",76,[this]{showToolGroup(shapeSpec_.kind==ShapeKind::Line?5:4);});shapeModeButton_->iconSkin=&toolIcons_;shapeModeButton_->iconWithCaption=true;shapeRoundedButton_=option(U"圆角",45,[this]{shapeRounded_=!shapeRounded_;});shapeRatioButton_=option(U"固定比例",65,[this]{shapeRatio_=!shapeRatio_;});for(auto b:{shapeRoundedButton_,shapeRatioButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}
    auto number=[&](int field,const char32_t* suffix,int width){auto input=new PixelEntry(font_,skin_);input->numeric=true;input->suffix=suffix;addChild(input);shapeControls_.push_back({input,width});auto commit=[this,input,field]{try{std::size_t used=0;const auto value=std::stod(input->text(),&used);if(used!=input->text().size() || !std::isfinite(value))return;if(field==0)shapeRadius_=gradientRound(std::clamp(value,0.0,256.0));else (field==1?shapeRatioWidth_:shapeRatioHeight_)=std::floor(std::clamp(value,.1,100.0)*10+.5)/10;saveBrushPreferences();layoutToolOptions();invalidate();}catch(...){} };input->Change.connect(commit);input->blur=commit;input->accept=[this,commit]{commit();requestFocus();};return input;};shapeRadiusInput_=number(0,U"px",48);shapeRatioWidthInput_=number(1,U"",38);shapeRatioHeightInput_=number(2,U"",38);auto swap=option(U"",19,[this]{std::swap(shapeRatioWidth_,shapeRatioHeight_);});swap->iconSkin=&toolIcons_;swap->icon="swap";
  }
  static constexpr int propertyIconWidth=15,propertyIconHeight=16;
  int propertyControlWidth(ui::Widget* control,int width) const {
    const auto button=dynamic_cast<PixelButton*>(control);
    return button && !button->icon.empty() && button->caption.empty()?propertyIconWidth:width;
  }
  void placePropertyControl(ui::Widget* control,int x,int width) {
    const auto button=dynamic_cast<PixelButton*>(control);
    const int height=dynamic_cast<PixelEntry*>(control)?17:button && !button->icon.empty() && button->caption.empty()?propertyIconHeight:button && !button->caption.empty() && button->icon.empty() && !button->labelOnly?18:Layout::optionsHeight;
    control->setBounds(uiPhysical(gfx::Rect(x,uiLogical(bounds()).y+Layout::optionsY+Layout::optionsHeight-height,propertyControlWidth(control,width),height)));
  }
  void layoutSymmetryOptions(){const auto rc=uiLogical(bounds());const bool show=!handTool_ && !gradientTool_ && !eyedropperTool_;const int left=commands_[3]->bounds().x/uiScale-94;for(int i=0;i<6;++i){auto b=symmetryButtons_[i];if(!b)continue;b->setBounds(uiPhysical(gfx::Rect(left+i*15,rc.y+Layout::optionsY+2,15,16)));b->setVisible(show);b->setEnabled(pending_==Pending::None && !document.active() && !selectionDragging_ && !symmetryDragging_);if(i<5)b->active=symmetryFlag(i);}}
  void layoutToolOptions() {
    if(!document.selection())selectionPropertiesActive_=false;
    if(toolControls_.empty()) return;
    for(int i=0;i<5;++i)if(symmetryButtons_[i])symmetryButtons_[i]->active=symmetryFlag(i);
    if(brushRange_ && (handTool_ || pending_!=Pending::None)) brushRange_->setVisible(false);
    const auto rc=uiLogical(bounds());const auto optionsLayout=workspaceLayout(rc);const bool usable=pending_==Pending::None && !document.active();if(toolRail_.size()>3){const char* icons[]{"selection-rectangle-normal","selection-ellipse-normal","selection-lasso-normal","selection-polygon-lasso-normal","selection-magic-normal","selection-brush-normal"};toolRail_[3]->icon=icons[selectionKind_];}
    if(homeButton_){homeButton_->setEnabled(usable);homeButton_->setVisible(true);}
    commands_[0]->setVisible(false);
    commands_[3]->setBounds(uiPhysical(gfx::Rect(rc.x+rc.w-uiGap-43-uiGap-43,rc.y+Layout::optionsY,43,19)));
    commands_[4]->setBounds(uiPhysical(gfx::Rect(rc.x+rc.w-uiGap-43,rc.y+Layout::optionsY,43,19)));
    if(eyedropperSourceButton_)eyedropperSourceButton_->setVisible(false);
    for(auto& control:fillControls_)control.first->setVisible(false);
    for(auto& control:gradientControls_)control.first->setVisible(false);
    for(auto& control:shapeControls_)control.first->setVisible(false);
    if(eyedropperTool_ && eyedropperSourceButton_){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);eyedropperSourceButton_->caption=eyedropperSource_==EyedropperSource::Composite?U"合成图像":U"当前图层";eyedropperSourceButton_->setBounds(uiPhysical(gfx::Rect(rc.x+optionsLayout.workX,rc.y+Layout::optionsY,76,Layout::optionsHeight)));eyedropperSourceButton_->setVisible(true);eyedropperSourceButton_->setEnabled((usable || replaceSampling_>=0) && !eyedropperGesture_.active());layoutSymmetryOptions();return;}
    if(shapeTool_ && !shapeControls_.empty()){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);const bool line=shapeSpec_.kind==ShapeKind::Line,rect=shapeSpec_.kind==ShapeKind::Rectangle || shapeSpec_.kind==ShapeKind::RectangleOutline,outline=shapeSpec_.kind==ShapeKind::RectangleOutline || shapeSpec_.kind==ShapeKind::EllipseOutline;int x=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-94;const char32_t* labels[]{U"直线",U"矩形描边",U"矩形填充",U"椭圆描边",U"椭圆填充"};const char* icons[]{"shape-line-normal","shape-rectangle-normal","shape-rectangle-fill-normal","shape-ellipse-normal","shape-ellipse-fill-normal"};shapeModeButton_->caption=labels[int(shapeSpec_.kind)];shapeModeButton_->icon=icons[int(shapeSpec_.kind)];if(toolRail_.size()>5){toolRail_[shapeSpec_.kind==ShapeKind::Line?5:4]->icon=icons[int(shapeSpec_.kind)];}shapeRoundedButton_->icon=shapeRounded_?"check":"checkboxUnchecked";shapeRatioButton_->icon=shapeRatio_?"check":"checkboxUnchecked";if(!shapeRadiusInput_->hasFocus())shapeRadiusInput_->setText(std::to_string(shapeRadius_));for(auto field:{shapeRatioWidthInput_,shapeRatioHeightInput_})if(!field->hasFocus()){std::ostringstream text;text<<(field==shapeRatioWidthInput_?shapeRatioWidth_:shapeRatioHeight_);field->setText(text.str());}
      auto place=[&](ui::Widget* w,int width){width=propertyControlWidth(w,width);placePropertyControl(w,x,width);w->setVisible(x+width<=right);w->setEnabled(usable && !shapeDragging_);x+=width+uiGap;};place(shapeModeButton_,76);if(line){brushShapeButton_->icon=brushProfiles_[0].shape==BrushShape::Round?"brush-round":brushProfiles_[0].shape==BrushShape::Square?"brush-square":"brush-line";place(brushShapeButton_,15);}if(line || outline){if(!brushSizeInput_->hasFocus())brushSizeInput_->setText(std::to_string(brushProfiles_[0].size));place(brushSizeInput_,toolControls_[3].second);}if(!line){if(rect){place(shapeRoundedButton_,45);if(shapeRounded_)place(shapeRadiusInput_,48);}place(shapeRatioButton_,65);if(shapeRatio_){place(shapeRatioWidthInput_,38);place(shapeRatioHeightInput_,38);place(shapeControls_[6].first,19);}}layoutSymmetryOptions();return;}
    if(gradientTool_ && !gradientControls_.empty()){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);const int left=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-94;int total=0;for(int i=0;i<int(gradientControls_.size());++i)if((i<9 || (i<11?gradientPending_:gradientFreeform_)))total+=gradientControls_[i].second+uiGap;toolRowScroll_=std::clamp(toolRowScroll_,0,std::max(0,total-(right-left)));int x=left-toolRowScroll_;
      gradientType_->caption=gradientSpec_.radial?U"径向":U"线性";gradientType_->icon=gradientSpec_.radial?"gradient-radial":"gradient-linear";if(!gradientTolerance_->hasFocus())gradientTolerance_->setText(std::to_string(gradientOptions_.tolerance));gradientContiguous_->icon=gradientOptions_.contiguous?"check":"checkboxUnchecked";gradientReference_->caption=gradientOptions_.visibleLayers?U"可见图层":U"当前图层";gradientConnectivity_->caption=gradientOptions_.connectivity==4?U"4 方连接":U"8 方连接";const char32_t* dithers[]{U"无抖动",U"Bayer 2×2",U"Bayer 4×4",U"Bayer 8×8",U"棋盘",U"对角线",U"反向对角线",U"水平线",U"垂直线"};gradientDither_->caption=dithers[gradientSpec_.dither];gradientFreeformButton_->icon=gradientFreeform_?"check":"checkboxUnchecked";gradientMode_->caption=gradientConfirm_?U"确认应用":U"即时应用";if(!gradientStops_.empty()){gradientStop_=std::clamp(gradientStop_,0,int(gradientStops_.size())-1);if(!gradientStopPosition_->hasFocus()){std::ostringstream text;text<<gradientStops_[gradientStop_].position*100;gradientStopPosition_->setText(text.str());}if(!gradientStopColor_->hasFocus())gradientStopColor_->setText(paletteHex(gradientStops_[gradientStop_].color));}
      for(int i=0;i<int(gradientControls_.size());++i){auto [w,width]=gradientControls_[i];width=propertyControlWidth(w,width);const bool applies=i<9 || (i<11?gradientPending_:gradientFreeform_);w->setVisible(applies && x>=left && x+width<=right);w->setEnabled(pending_==Pending::None && !gradientDragging_);placePropertyControl(w,x,width);if(applies)x+=width+uiGap;}if(toolRail_.size()>6)toolRail_[6]->icon="tool-gradient-normal";layoutSymmetryOptions();return;}
    if(toolRail_.size()>6)toolRail_[6]->icon=rememberGradientTool_?"tool-gradient-normal":"tool-fill-normal";
    if(fillTool_){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);int x=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-94;
      if(!fillToleranceInput_->hasFocus())fillToleranceInput_->setText(std::to_string(fillOptions_.tolerance));if(!fillGapInput_->hasFocus())fillGapInput_->setText(std::to_string(fillOptions_.gapThreshold));fillContiguousButton_->icon=fillOptions_.contiguous?"check":"checkboxUnchecked";fillGapButton_->icon=fillOptions_.gapClosing?"check":"checkboxUnchecked";fillConnectivityButton_->caption=fillOptions_.connectivity==4?U"4 方连接":U"8 方连接";fillReferenceButton_->caption=fillOptions_.visibleLayers?U"可见图层":U"当前图层";
      const char32_t* textureNames[]{U"纯色",U"裂纹",U"木纹",U"颗粒"};fillTextureButton_->caption=textureNames[int(fillPattern_.texture)];fillImageButton_->active=!fillPattern_.brushes.empty();if(!fillTextureScale_->hasFocus())fillTextureScale_->setText(std::to_string(fillPattern_.textureScale));
      for(std::size_t i=0;i<fillControls_.size();++i){auto [control,width]=fillControls_[i];width=propertyControlWidth(control,width);const bool show=(fillOptions_.contiguous || (i!=3 && i!=4)) && x+width<=right;control->setVisible(show);control->setEnabled(usable && !fillDragging_ && (i!=4 || fillOptions_.gapClosing));placePropertyControl(control,x,width);if(show)x+=width+uiGap;}layoutSymmetryOptions();return;}
    if(selectionTool_){if(brushRange_ && selectionKind_!=5)brushRange_->setVisible(false);for(auto& c:toolControls_)c.first->setVisible(false);int x=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-94;
      if(selectionKind_==5 && !selectionPropertiesActive_){const auto& brush=brushProfiles_[0];if(!brushSizeInput_->hasFocus())brushSizeInput_->setText(std::to_string(brush.size));brushSizeInput_->setEnabled(usable && !selectionDragging_);brushShapeButton_->setEnabled(usable && !selectionDragging_);brushShapeButton_->icon=brush.shape==BrushShape::Round?"brush-round":brush.shape==BrushShape::Square?"brush-square":"brush-line";for(auto index:{0,3}){auto& control=toolControls_[index];control.first->setVisible(x+control.second<=right);placePropertyControl(control.first,x,control.second);x+=control.second+uiGap;}}
      selectionRoundedButton_->icon=selectionRounded_?"check":"checkboxUnchecked";if(!selectionCornerRadiusInput_->hasFocus())selectionCornerRadiusInput_->setText(std::to_string(selectionCornerRadius_));
      const char32_t* modes[]{U"替换选区",U"添加选区",U"减去选区",U"相交选区"};for(int i=0;i<4;++i)selectionModeButtons_[i]->active=i==(selectionRight_?2:selectionShift_?1:selectionMode_);
      selectionAlgorithmButton_->caption=selectionRotSprite_?U"RotSprite":U"快速旋转";if(!selectionBrushAngleInput_->hasFocus())selectionBrushAngleInput_->setText(std::to_string(selectionBrushAngle_));if(!wandToleranceInput_->hasFocus())wandToleranceInput_->setText(std::to_string(wandOptions_.tolerance));if(!wandGapInput_->hasFocus())wandGapInput_->setText(std::to_string(wandOptions_.gapThreshold));wandContiguousButton_->icon=wandOptions_.contiguous?"check":"checkboxUnchecked";wandGapButton_->icon=wandOptions_.gapClosing?"check":"checkboxUnchecked";wandConnectivityButton_->caption=wandOptions_.connectivity==4?U"4 方连接":U"8 方连接";wandReferenceButton_->caption=wandOptions_.visibleLayers?U"可见图层":U"当前图层";
      if(auto target=selectionTransformTarget()){const double values[]{target->x,target->y,target->width*(target->flipHorizontal?-1:1),target->height*(target->flipVertical?-1:1),target->angle};for(int i=0;i<5;++i)if(!selectionTransformFields_[i]->hasFocus()){std::ostringstream text;text<<values[i];selectionTransformFields_[i]->setText(text.str());}}
      for(std::size_t i=0;i<selectionControls_.size();++i){auto [control,width]=selectionControls_[i];width=propertyControlWidth(control,width);const bool show=(i==9 || (i==17 && selectionKind_==0 && !selectionPropertiesActive_) || (i==18 && selectionKind_==0 && selectionRounded_ && !selectionPropertiesActive_) || ((i==15 || i==16) && document.selection()) || (selectionPropertiesActive_ && document.selection()?i>=10 && i<17:i==0 || (selectionKind_==4 && i>0 && i<8) || (selectionKind_==5 && i==8 && brushProfiles_[0].size>1 && brushProfiles_[0].shape!=BrushShape::Round))) && x+width<=right;control->setVisible(show);control->setEnabled((usable || document.floating()) && !selectionDragging_ && !floatingDragging_ && (control!=wandGapButton_ && control!=wandGapInput_ || wandOptions_.contiguous));placePropertyControl(control,x,width);if(i==0)for(int m=0;m<4;++m)selectionModeButtons_[m]->setBounds(uiPhysical(gfx::Rect(x+m*14,rc.y+Layout::optionsY+Layout::optionsHeight-propertyIconHeight,propertyIconWidth,propertyIconHeight)));if(show)x+=width+uiGap;}layoutSymmetryOptions();return;}
    for(auto& c:selectionControls_)c.first->setVisible(false);
    const int profile=eraser_?1:0;const auto& brush=brushProfiles_[profile];
    updatingBrushFields_=true;
    if(!brushSizeInput_->hasFocus() || shownBrushProfile_!=profile) brushSizeInput_->setText(std::to_string(brush.size));
    if(!brushOpacityInput_->hasFocus() || shownBrushProfile_!=profile) brushOpacityInput_->setText(std::to_string(brush.opacity));
    updatingBrushFields_=false;shownBrushProfile_=profile;
    brushShapeButton_->icon=brush.shape==BrushShape::Round?"brush-round":brush.shape==BrushShape::Square?"brush-square":"brush-line";
    imageBrushButton_->active=!pencilImageBrushId_.empty();imageBrushButton_->setEnabled(usable);brushShapeButton_->setEnabled(usable);brushSizeInput_->setEnabled(usable && pencilImageBrushId_.empty());brushOpacityInput_->setEnabled(usable);
    const int right=commands_[3]->bounds().x/uiScale-uiGap,left=rc.x+optionsLayout.workX;int total=0;
    for(std::size_t i=0;i<toolControls_.size();++i) if(!(eraser_ && toolControls_[i].pencilOnly)) total+=toolControls_[i].second+toolControls_[i].gap;
    toolRowScroll_=std::clamp(toolRowScroll_,0,std::max(0,total-(right-left)));int x=left-toolRowScroll_;
    for(std::size_t i=0;i<toolControls_.size();++i) {
      auto& control=toolControls_[i];const bool applies=!(eraser_ && control.pencilOnly);
      const auto button=dynamic_cast<PixelButton*>(control.first);
      const bool entry=dynamic_cast<PixelEntry*>(control.first)!=nullptr;
      placePropertyControl(control.first,x,control.second);
      control.first->setVisible(!handTool_ && applies && x>=left && x+control.second<=right);
      if(applies) x+=control.second+control.gap;
    }
    layoutSymmetryOptions();
  }
  void syncPaletteButtons() {
    auto ids=document.palette().slots;
    if(std::find(ids.begin(),ids.end(),0)==ids.end()) ids.push_back(0);
    while(swatches_.size()<ids.size()) {
      const auto index=swatches_.size();auto b=button(U"",[this,index]{selectSwatch(index,false,false,false);});
      b->paletteCell=true;
      b->paletteRepaint=[this]{invalidateRect(paletteContentBounds());};
      // Shared edges may route mouse messages to the neighboring color cell.
      // Selection hover follows the full surrounding frame, not widget focus.
      b->paletteSelectionHover=[this,b]{return paletteMousePosition_ && b->paletteSelectionContains(*paletteMousePosition_);};
      b->palettePress=[this,index](const ui::MouseMessage& mouse){selectSwatch(index,mouse.ctrlPressed()||mouse.cmdPressed(),mouse.shiftPressed(),mouse.right());};
      b->doubleClick=[this,index]{
        const int id=paletteButtonIds_[index];cancelStroke();
        if(!id) {document.addPaletteColor(ink_,paletteLocked_,index<document.palette().slots.size()?std::optional<std::size_t>(index):std::nullopt);refresh();}
        else openPaletteEditor(id,false);
      };
      b->hover=[this,index]{const auto entry=document.paletteEntry(paletteButtonIds_[index]);status_=entry?entry->name:U"双击空槽添加前景色";invalidate();};
      swatches_.push_back(b);
    }
    while(swatches_.size()>ids.size()) {delete swatches_.back();swatches_.pop_back();}
    paletteButtonIds_=std::move(ids);
    const auto& palette=document.palette();
    auto roleId=[&](int preferred,Pixel color) {
      const auto chosen=document.paletteEntry(preferred);
      if(chosen && chosen->color==color && std::find(palette.slots.begin(),palette.slots.end(),preferred)!=palette.slots.end()) return preferred;
      for(const int id:palette.slots) if(const auto entry=document.paletteEntry(id)) if(entry->color==color) return id;
      return 0;
    };
    const int foregroundId=roleId(palette.primaryId,palette.primary),backgroundId=roleId(palette.secondaryId,palette.secondary);
    for(std::size_t i=0;i<swatches_.size();++i) {
      const auto entry=document.displayPaletteEntry(paletteButtonIds_[i]);swatches_[i]->swatch=entry?entry->color:0;
      swatches_[i]->foregroundMarker=entry && entry->id==foregroundId;
      swatches_[i]->backgroundMarker=entry && entry->id==backgroundId;
      const auto& selected=document.palette().selected;
      swatches_[i]->active=std::find(selected.begin(),selected.end(),paletteButtonIds_[i])!=selected.end();
    }
    if(document.palette().primary!=lastPaletteInk_) {lastPaletteInk_=document.palette().primary;ink_=lastPaletteInk_;}
  }
  void selectSwatch(std::size_t index,bool ctrl,bool shift,bool secondary) {
    const int id=paletteButtonIds_.at(index);if(!gradientPending_)cancelStroke();paletteFocused_=true;
    if(secondary) document.selectSecondaryPalette(id);
    else if(shift) document.selectPaletteSlotRange(index,paletteColumns_);
    else if(id) document.selectPalette(id,ctrl);else document.clearPaletteSelection();
    ink_=document.palette().primary;lastPaletteInk_=ink_;if(gradientPending_){gradientRequest_=true;gradientTick();}requestFocus();refresh();
  }
  void loadPaletteSize() {
    try {
      const auto path=palettePreferencePath();
      std::ifstream lock(path.parent_path()/"palette-edit-locked.txt");std::string value;
      if(lock>>value) paletteLocked_=value!="false";
      if(!std::filesystem::exists(path)) return;
      std::ifstream in(path);std::string key;
      if(!(in>>key)) throw std::runtime_error("Cannot read palette preference");
      for(int i=0;i<5;++i) if(key==swatchKeys_[i]) {swatchSize_=i;return;}
      // Same fallback as legacy for unknown stored preferences.
    } catch(const std::exception&) {status_=U"色卡尺寸偏好读取失败，使用小尺寸";}
  }
  void chooseSwatchSize(int size,bool persist=true) {
    swatchSize_=std::clamp(size,0,4);
    if(persist) {
      try {
        const auto path=palettePreferencePath();std::filesystem::create_directories(path.parent_path());
        std::ofstream out(path);out<<swatchKeys_[swatchSize_];out.close();
        if(!out) throw std::runtime_error("Cannot save palette preference");
      } catch(const std::exception&) {status_=U"色卡尺寸已调整，但偏好保存失败";}
    }
    layoutPalette();invalidate();
  }
  void togglePaletteLock() {
    paletteLocked_=!paletteLocked_;
    try {const auto path=palettePreferencePath().parent_path();std::filesystem::create_directories(path);
      std::ofstream out(path/"palette-edit-locked.txt");out<<(paletteLocked_?"true":"false");out.close();if(!out) throw std::runtime_error("Palette lock write failed");
    } catch(const std::exception&) {status_=U"锁定偏好保存失败";}
    refresh();
  }
  void paletteWheel(const ui::MouseMessage& mouse,bool persist=true) {
    if(mouse.ctrlPressed() || mouse.cmdPressed()) {
      const auto delta=mouse.wheelDelta();
      const int dominant=std::abs(delta.y)>=std::abs(delta.x)?delta.y:delta.x;
      if(dominant) chooseSwatchSize(swatchSize_+(dominant<0?1:-1),persist);
    } else {paletteScrollRow_+=mouse.wheelDelta().y>0?1:mouse.wheelDelta().y<0?-1:0;layoutPalette();invalidate();}
  }
  static bool parsePaletteHex(std::string value,Pixel& next){try{if(!value.empty() && value[0]=='#')value.erase(0,1);if(value.size()!=6 && value.size()!=8)return false;next=0xff000000;for(std::size_t i=0;i<value.size()/2;++i){std::size_t used=0;auto byte=std::stoul(value.substr(i*2,2),&used,16);if(used!=2)return false;next=(next&~(255u<<(i*8)))|Pixel(byte)<<(i*8);}return true;}catch(...){return false;}}
  static std::string paletteHex(Pixel color) {
    const char* digits="0123456789ABCDEF";std::string value="#";
    for(int i=0;i<((color>>24)==255?3:4);++i) {const int byte=(color>>(i*8))&255;value+=digits[byte>>4];value+=digits[byte&15];}
    return value;
  }
  void commitPaletteHex() {
    auto value=paletteInput_->text();const auto first=value.find_first_not_of(" \r\n\t"),last=value.find_last_not_of(" \r\n\t");
    value=first==std::string::npos?"":value.substr(first,last-first+1);if(!value.empty() && value[0]=='#') value.erase(0,1);
    Pixel color=editingSecondary_?document.palette().secondary:document.palette().primary;
    bool valid=value.size()==6 || value.size()==8;
    for(char ch:value) valid=valid && std::isxdigit(static_cast<unsigned char>(ch));
    if(valid) {
      Pixel next=color&0xff000000;
      for(std::size_t i=0;i<value.size()/2;++i) {const auto byte=std::stoul(value.substr(i*2,2),nullptr,16);next=(next&~(Pixel(255)<<(i*8)))|(Pixel(byte)<<(i*8));}
      document.setPaletteRole(next,editingSecondary_,paletteLocked_);color=next;
    } else status_=U"无效 HEX，已恢复当前颜色";
    paletteInput_->setText(paletteHex(color));refresh();
  }
  void openPaletteEditor(int id,bool secondary) {
    paletteInput_->numeric=false;
    if(colorPicker_) colorPicker_->finishInteraction();
    if(!gradientPending_)cancelStroke();renameId_=id;editingSecondary_=secondary;
    pending_=id?Pending::PaletteName:Pending::ColorRole;layoutPalette();
    paletteInput_->setText(id?utf8Text(document.paletteEntry(id)->name):paletteHex(secondary?document.palette().secondary:document.palette().primary));
    menuBar_->setEnabled(false);for(auto b:commands_) b->setEnabled(false);for(auto b:swatches_) b->setEnabled(false);for(auto b:panelTabs_) b->setEnabled(false);
    discard_->caption=U"确定";keep_->caption=id?U"取消":U"关闭";
    discard_->setVisible(id!=0);keep_->setVisible(true);dialogClose_->setVisible(true);paletteInput_->setVisible(true);paletteInput_->requestFocus();paletteInput_->selectAllText();refresh();
  }
  void saveReplacePreferences(){if(smoke_)return;try{auto path=palettePreferencePath().parent_path()/"color-replacement.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out<<replaceScope_<<' '<<replacePreview_<<' '<<replaceRemember_<<' '<<replaceSource_<<' '<<replaceDestination_;}catch(...) {status_=U"替换颜色偏好保存失败";}}
  std::vector<std::string> replaceTargets()const{std::vector<std::string> ids;const auto& state=document.timeline().state();int start=-1,end=-1;if(replaceScope_.rfind("loop-section:",0)==0){auto it=std::find_if(state.loopSections.begin(),state.loopSections.end(),[this](const auto& l){return l.id==replaceScope_.substr(13);});if(it!=state.loopSections.end()){auto range=timeline::loopRange(state,*it);start=range.start;end=range.end;}}
    for(const auto& c:state.cels){bool include=replaceScope_=="document" || (replaceScope_=="selection" && c.layerId==document.layer().id && c.frameId==document.frame().id) || (replaceScope_=="layers" && c.layerId==selectedTimelineLayer_) || (replaceScope_=="frames" && std::find(document.selectedFrames().begin(),document.selectedFrames().end(),c.frameId)!=document.selectedFrames().end()) || (replaceScope_=="cells" && c.layerId==selectedTimelineCelLayer_ && c.frameId==selectedTimelineCelFrame_);if(start>=0){auto it=std::find_if(state.frames.begin(),state.frames.end(),[&](const auto& f){return f.id==c.frameId;});auto index=int(it-state.frames.begin());include=index>=start && index<=end;}if(include)ids.push_back(c.id);}return ids;}
  void cancelReplacePreview(){document.cancelColorAdjustment();document.cancelPaletteReplacement();}
  void updateReplaceUi(){Pixel a,b;const bool valid=parsePaletteHex(replaceInputs_[0]->text(),a) && parsePaletteHex(replaceInputs_[1]->text(),b);bool ready=replaceScope_=="palette"?std::any_of(document.palette().entries.begin(),document.palette().entries.end(),[](const auto& entry){return entry.id!=0;}):!replaceTargets().empty() && (replaceScope_!="selection" || document.selection().has_value());discard_->setEnabled(ready && valid && replaceSource_!=replaceDestination_);replaceScopeButton_->caption=U"范围："+unicodeText(replaceScope_);replacePreviewButton_->icon=replacePreview_?"check":"checkboxUnchecked";replaceRememberButton_->icon=replaceRemember_?"check":"checkboxUnchecked";for(int i=0;i<2;++i)replaceSample_[i]->active=replaceSampling_==i;}
  void previewReplace(){cancelReplacePreview();if(replaceSampling_<0){if(replaceScope_=="palette"){if(document.beginPaletteReplacement(replacePreview_?std::optional<Pixel>{replaceSource_}:std::nullopt))document.updatePaletteReplacement(replaceSource_,replaceDestination_,replacePreview_);}else if(document.beginColorReplacement(replaceTargets(),replaceScope_=="selection"))document.updateColorReplacement(replaceSource_,replaceDestination_,replacePreview_);}updateReplaceUi();saveReplacePreferences();refresh();}
  void changeReplaceColor(int target,Pixel color,bool sampled=false){cancelReplacePreview();if(target==0){document.setPaletteRole(color,false,paletteLocked_);replaceSource_=color;}else replaceDestination_=color;replaceInputs_[target]->setText(paletteHex(color));previewReplace();}
  void beginReplaceSampling(int target){if(replaceSampling_==target){finishReplaceSampling();return;}if(replaceSampling_<0){cancelReplacePreview();replaceReturnTools_={selectionTool_,shapeTool_,gradientTool_,fillTool_,handTool_,eraser_,eyedropperTool_,eyedropperHeld_};}replaceSampling_=target;selectionTool_=shapeTool_=gradientTool_=fillTool_=handTool_=eraser_=eyedropperHeld_=false;eyedropperTool_=true;playing_=false;updateReplaceUi();requestFocus();layoutToolOptions();refresh();}
  void finishReplaceSampling(){if(replaceSampling_<0 || replaceSamplingFinishing_)return;replaceSamplingFinishing_=true;if(eyedropperGesture_.active())eyedropperGesture_.finish();if(hasCapture())releaseMouse();replaceSampling_=-1;selectionTool_=replaceReturnTools_[0];shapeTool_=replaceReturnTools_[1];gradientTool_=replaceReturnTools_[2];fillTool_=replaceReturnTools_[3];handTool_=replaceReturnTools_[4];eraser_=replaceReturnTools_[5];eyedropperTool_=replaceReturnTools_[6];eyedropperHeld_=replaceReturnTools_[7];replaceSamplingFinishing_=false;layoutToolOptions();previewReplace();updateNavigationCursor();}
  void openReplaceColor(){if(pending_!=Pending::None || document.active())return;if(!replaceLoaded_){std::ifstream in(palettePreferencePath().parent_path()/"color-replacement.txt");if(!(in>>replaceScope_>>replacePreview_>>replaceRemember_>>replaceSource_>>replaceDestination_)){replaceScope_="layers";replacePreview_=false;replaceRemember_=true;replaceSource_=document.palette().primary;replaceDestination_=document.palette().secondary;}replaceLoaded_=true;}if(!replaceRemember_){replaceSource_=document.palette().primary;replaceDestination_=document.palette().secondary;}cancelStroke();playing_=false;pending_=Pending::ReplaceColor;menuBar_->setEnabled(false);replaceInputs_[0]->setText(paletteHex(replaceSource_));replaceInputs_[1]->setText(paletteHex(replaceDestination_));discard_->caption=U"替换";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);previewReplace();refresh();}
  void createReplaceControls(){for(int i=0;i<2;++i){auto input=new PixelEntry(font_,skin_);addChild(input);replaceInputs_[i]=input;input->setVisible(false);auto changed=[this,input,i]{Pixel color;if(parsePaletteHex(input->text(),color))changeReplaceColor(i,color);else discard_->setEnabled(false);};input->Change.connect(changed);input->blur=changed;input->accept=[this]{if(discard_->isEnabled())resolve(true);};input->cancel=[this]{resolve(false);};replaceSample_[i]=button(U"",[this,i]{beginReplaceSampling(i);});replaceSample_[i]->iconSkin=&toolIcons_;replaceSample_[i]->icon="eyedropper";replaceSample_[i]->setEnabled(true);replaceSample_[i]->setVisible(false);}
    replaceScopeButton_=button(U"作用范围",[this]{PixelMenu menu(skin_);auto add=[&](const std::string& id,const std::u32string& text,bool enabled=true){auto item=new PixelMenuItem(font_,skin_,text);item->setEnabled(enabled);item->checked=[this,id]{return replaceScope_==id;};item->Click.connect([this,id]{replaceScope_=id;previewReplace();});menu.addChild(item);};add("document",U"整个文档");add("selection",U"当前像素选区",document.selection().has_value());add("layers",U"选中图层",!selectedTimelineLayer_.empty());add("frames",U"选中帧",!document.selectedFrames().empty());add("cells",U"选中帧格",!selectedTimelineCelFrame_.empty());add("palette",U"调色板",std::any_of(document.palette().entries.begin(),document.palette().entries.end(),[](const auto& entry){return entry.id!=0;}));for(const auto& l:document.timeline().state().loopSections)add("loop-section:"+l.id,U"循环段："+l.name);auto at=replaceScopeButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
    replacePreviewButton_=button(U"实时预览",[this]{replacePreview_=!replacePreview_;previewReplace();});replaceRememberButton_=button(U"记住颜色",[this]{replaceRemember_=!replaceRemember_;if(!replaceRemember_){cancelReplacePreview();replaceSource_=document.palette().primary;replaceDestination_=document.palette().secondary;replaceInputs_[0]->setText(paletteHex(replaceSource_));replaceInputs_[1]->setText(paletteHex(replaceDestination_));}previewReplace();});for(auto b:{replacePreviewButton_,replaceRememberButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}for(auto b:{replaceScopeButton_,replacePreviewButton_,replaceRememberButton_})b->setVisible(false);
  }
  void updateAdjustmentControls(){
    for(int i=0;i<3;++i){if(adjustmentInputs_[i]->hasFocus())continue;double value=adjustmentSpec_.kind==ColorAdjustmentKind::BrightnessContrast?(i?adjustmentSpec_.contrast:adjustmentSpec_.brightness):i==0?adjustmentSpec_.hue:i==1?adjustmentSpec_.saturation:adjustmentSpec_.lightness;adjustmentInputs_[i]->setText(std::to_string(int(value)));}adjustmentPreview_->icon=adjustmentPreviewEnabled_?"check":"checkboxUnchecked";adjustmentColorize_->icon=adjustmentSpec_.colorize?"check":"checkboxUnchecked";
  }
  void previewAdjustment(){document.updateColorAdjustment(adjustmentSpec_,adjustmentPreviewEnabled_);updateAdjustmentControls();invalidate();}
  void openColorAdjustment(ColorAdjustmentKind kind){if(pending_!=Pending::None || document.active())return;document.commitFloatingPaste();cancelStroke();if(!document.beginColorAdjustment())return;playing_=false;adjustmentSpec_={};adjustmentSpec_.kind=kind;adjustmentPreviewEnabled_=true;relativeHsl_={};hasColorizedHsl_=false;pending_=Pending::ColorAdjustment;menuBar_->setEnabled(false);discard_->caption=U"应用";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);previewAdjustment();refresh();}
  void updateResizeFields(){resizeUpdating_=true;for(int i=0;i<4;++i)if(!resizeInputs_[i]->hasFocus()){const double value=i==0?resizeWidth_:i==1?resizeHeight_:i==2?100.0*resizeWidth_/document.width():100.0*resizeHeight_/document.height();resizeInputs_[i]->setText(std::to_string(int(std::floor(value+.5))));}resizeLock_->icon=resizeLocked_?"lock":"unlock";resizeMethod_->caption=resizeMethodValue_==ImageInterpolation::Nearest?U"最近邻":U"平滑";resizeUpdating_=false;}
  void openImageResize(){if(pending_!=Pending::None||document.active())return;document.commitFloatingPaste();cancelStroke();playing_=false;resizeWidth_=document.width();resizeHeight_=document.height();resizeLocked_=true;resizeMethodValue_=ImageInterpolation::Nearest;pending_=Pending::ImageResize;menuBar_->setEnabled(false);discard_->caption=U"应用";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);updateResizeFields();refresh();resizeInputs_[0]->requestFocus();resizeInputs_[0]->selectAllText();}
  void openGifExport(){if(pending_!=Pending::None||document.active())return;gifOptions_={};gifOptions_.frameEnd=int(document.timeline().state().frames.size());gifExplicitRange_=false;pending_=Pending::GifExport;menuBar_->setEnabled(false);gifInputs_[0]->setText("100");gifInputs_[1]->setText("1");gifInputs_[2]->setText(std::to_string(gifOptions_.frameEnd));discard_->caption=U"导出 GIF";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);refresh();}
  bool saveGifExport(){wchar_t filename[32768]{};auto name=std::filesystem::path(document.name()).stem().wstring()+L".gif";std::copy_n(name.c_str(),std::min<std::size_t>(name.size(),32767),filename);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=L"GIF 动画\0*.gif\0\0";dialog.lpstrDefExt=L"gif";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;if(!GetSaveFileNameW(&dialog)){if(CommDlgExtendedError())status_=U"无法打开导出文件对话框";return false;}try{auto options=gifOptions_;if(!gifExplicitRange_ && options.loopSectionId.empty()){options.frameStart=1;options.frameEnd=int(document.timeline().state().frames.size());}auto out=encodeAnimationGif(document,options);writeExportBytesAtomic(filename,out.bytes);status_=U"已导出 GIF 动画";return true;}catch(const std::exception& e){status_=U"GIF 导出失败："+unicodeText(e.what());invalidate();return false;}}
  void createGifExportControls(){for(int i=0;i<3;++i){auto input=new PixelEntry(font_,skin_);input->numeric=true;addChild(input);gifInputs_[i]=input;input->setVisible(false);auto change=[this,input,i]{try{std::size_t used=0;double v=std::stod(input->text(),&used);if(used!=input->text().size()||!std::isfinite(v))return;int n=int(std::floor(std::clamp(v,1.0,i==0?6400.0:double(document.timeline().state().frames.size()))+.5));(i==0?gifOptions_.scalePercent:i==1?gifOptions_.frameStart:gifOptions_.frameEnd)=n;}catch(...){} };input->Change.connect(change);input->blur=change;input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}
    gifRange_=button(U"全部帧",[this]{PixelMenu menu(skin_);auto add=[&](std::u32string name,std::string id,bool range){auto item=new PixelMenuItem(font_,skin_,name);item->Click.connect([this,id,range]{gifExplicitRange_=range;gifOptions_.loopSectionId=id;refresh();});menu.addChild(item);};add(U"全部帧","",false);add(U"指定帧范围","",true);for(const auto& loop:document.timeline().state().loopSections)add(U"循环段："+loop.name,loop.id,false);auto at=gifRange_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
    gifDirection_=button(U"正向",[this]{PixelMenu menu(skin_);const char32_t* names[]{U"正向",U"反向",U"正向往返",U"反向往返"};for(int i=0;i<4;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->Click.connect([this,i]{gifOptions_.direction=GifDirection(i);refresh();});menu.addChild(item);}auto at=gifDirection_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});gifTrim_=button(U"裁切透明边",[this]{gifOptions_.trim=!gifOptions_.trim;refresh();});gifTrim_->iconSkin=&toolIcons_;gifTrim_->bareIconWithCaption=true;for(auto b:{gifRange_,gifDirection_,gifTrim_})b->setVisible(false);
  }
  void updateSheetImportFields(){if(importSheetUpdating_)return;importSheetUpdating_=true;int sw=importSheetOptions_.selection&&document.selection()?document.selection()->width:document.width(),sh=importSheetOptions_.selection&&document.selection()?document.selection()->height:document.height();int counts[2]{};try{auto plan=planSpriteSheetImport(sw,sh,importSheetOptions_);counts[0]=plan.columns;counts[1]=plan.rows;}catch(...){}for(int i=0;i<8;++i)if(!importSheetInputs_[i]->hasFocus()){int values[]{importSheetOptions_.x,importSheetOptions_.y,importSheetOptions_.width,importSheetOptions_.height,importSheetOptions_.paddingX,importSheetOptions_.paddingY,counts[0],counts[1]};importSheetInputs_[i]->setText(std::to_string(values[i]));}importSheetUpdating_=false;}
  void openSheetImport(bool selected){if(pending_!=Pending::None||document.active())return;if(selected&&!document.selection())return;importSheetOptions_={};importSheetOptions_.selection=selected;if(selected){importSheetOptions_.width=std::min(16,document.selection()->width);importSheetOptions_.height=std::min(16,document.selection()->height);}pending_=Pending::SheetImport;menuBar_->setEnabled(false);discard_->caption=U"导入";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);updateSheetImportFields();refresh();}
  void chooseSheetSource(){importAfterOpen_=true;chooseProject();if(pending_!=Pending::Open&&pending_!=Pending::SheetImport)importAfterOpen_=false;}
  void createSheetImportControls(){for(int i=0;i<8;++i){auto input=new PixelEntry(font_,skin_);input->numeric=true;addChild(input);input->setVisible(false);importSheetInputs_[i]=input;auto change=[this,input,i]{if(importSheetUpdating_)return;try{std::size_t used=0;double v=std::stod(input->text(),&used);if(used!=input->text().size()||!std::isfinite(v))return;int n=int(std::floor(std::clamp(v,i<2?-262144.0:i<6?0.0:1.0,262144.0)+.5));auto& o=importSheetOptions_;if(i<6){int* fields[]{&o.x,&o.y,&o.width,&o.height,&o.paddingX,&o.paddingY};*fields[i]=i==2||i==3?std::max(1,n):n;}else{bool horizontal=i==6;int extent=o.selection&&document.selection()?(horizontal?document.selection()->width:document.selection()->height):(horizontal?document.width():document.height());int origin=horizontal?o.x:o.y,gap=horizontal?o.paddingX:o.paddingY,count=std::clamp(n,1,10000);(horizontal?o.width:o.height)=std::max(1,int(std::floor(double(extent-origin-gap*(count-1))/count)));}updateSheetImportFields();}catch(...){} };input->Change.connect(change);input->blur=change;input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}importSheetLayout_=button(U"排列",[this]{PixelMenu menu(skin_);const char32_t* names[]{U"横向",U"纵向",U"按行",U"按列"};for(int i=0;i<4;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->Click.connect([this,i]{importSheetOptions_.layout=i;updateSheetImportFields();refresh();});menu.addChild(item);}auto at=importSheetLayout_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});importSheetPartial_=button(U"包含不完整单元格",[this]{importSheetOptions_.partialTiles=!importSheetOptions_.partialTiles;updateSheetImportFields();refresh();});importSheetPartial_->iconSkin=&toolIcons_;importSheetPartial_->bareIconWithCaption=true;importSheetLayout_->setVisible(false);importSheetPartial_->setVisible(false);}
  void openSpriteSheet(){if(pending_!=Pending::None||document.active())return;sheetOptions_={};sheetOptions_.fixedWidth=document.width()*4;sheetOptions_.fixedHeight=document.height()*4;if(!selectedTimelineLayer_.empty())sheetOptions_.selectedLayerIds={selectedTimelineLayer_};sheetValue_->setText("4");try{if(sheetPreview_) {sheetPreview_->setImage(encodeSpriteSheet(document,sheetOptions_));sheetPreview_->setVisible(true);}}catch(...){} pending_=Pending::SpriteSheet;menuBar_->setEnabled(false);discard_->caption=U"导出 PNG";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);refresh();}
  bool saveSpriteSheet(){wchar_t filename[32768]{};auto name=std::filesystem::path(document.name()).stem().wstring()+L"-sprite-sheet.png";std::copy_n(name.c_str(),std::min<std::size_t>(name.size(),32767),filename);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=L"PNG RGBA 精灵表\0*.png\0\0";dialog.lpstrDefExt=L"png";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;if(!GetSaveFileNameW(&dialog))return false;try{writeStaticImagePngAtomic(filename,encodeSpriteSheet(document,sheetOptions_));status_=U"精灵表已导出";return true;}catch(const std::exception& e){status_=U"精灵表导出失败："+unicodeText(e.what());invalidate();return false;}}
  void createSpriteSheetControls(){sheetPreview_=new SpriteSheetPreview(skin_);addChild(sheetPreview_);
    sheetButtons_[0]=button(U"排列",[this]{PixelMenu menu(skin_);const char32_t* names[]{U"横向",U"纵向",U"按行",U"按列"};for(int i=0;i<4;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->checked=[this,i]{return int(sheetOptions_.layout)==i;};item->Click.connect([this,i]{auto& o=sheetOptions_;o.layout=SheetLayout(i);if(i<2)o.constraint=SheetConstraint::None;else if(i==2){if(o.constraint==SheetConstraint::FixedRows)o.constraint=SheetConstraint::FixedColumns;if(o.constraint==SheetConstraint::FixedHeight)o.constraint=SheetConstraint::FixedWidth;}else{if(o.constraint==SheetConstraint::FixedColumns)o.constraint=SheetConstraint::FixedRows;if(o.constraint==SheetConstraint::FixedWidth)o.constraint=SheetConstraint::FixedHeight;}refresh();});menu.addChild(item);}auto at=sheetButtons_[0]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
    sheetButtons_[1]=button(U"约束",[this]{PixelMenu menu(skin_);bool columns=sheetOptions_.layout==SheetLayout::Columns;const char32_t* names[]{U"无约束",columns?U"固定行数":U"固定列数",columns?U"固定高度":U"固定宽度"};for(int i=0;i<3;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->Click.connect([this,i,columns]{sheetOptions_.constraint=i==0?SheetConstraint::None:i==1?(columns?SheetConstraint::FixedRows:SheetConstraint::FixedColumns):(columns?SheetConstraint::FixedHeight:SheetConstraint::FixedWidth);refresh();});menu.addChild(item);}auto at=sheetButtons_[1]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
    sheetButtons_[2]=button(U"帧范围",[this]{PixelMenu menu(skin_);auto add=[&](std::string id,std::u32string name){auto item=new PixelMenuItem(font_,skin_,name);item->checked=[this,id]{return sheetOptions_.frameScope==id;};item->Click.connect([this,id]{sheetOptions_.frameScope=id;refresh();});menu.addChild(item);};add("all",U"全部帧");add("selected",U"选中帧（无选择时当前帧）");for(const auto& l:document.timeline().state().loopSections)add("loop:"+l.id,l.name);auto at=sheetButtons_[2]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
    sheetButtons_[3]=button(U"图层",[this]{PixelMenu menu(skin_);const char* ids[]{"visible","all","selected"};const char32_t* names[]{U"可见图层",U"所有图层（显示隐藏层）",U"选中图层（当前单选）"};for(int i=0;i<3;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->Click.connect([this,id=std::string(ids[i])]{sheetOptions_.layerScope=id;refresh();});menu.addChild(item);}for(auto text:{U"拆分图层 · 未接入",U"拆分循环段 · 未接入",U"新建文档 / 实时预览 · 未接入",U"导出后自动打开 · 未接入"}){auto item=new PixelMenuItem(font_,skin_,text);item->setEnabled(false);menu.addChild(item);}auto at=sheetButtons_[3]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
    sheetButtons_[4]=button(U"合并重复",[this]{sheetOptions_.mergeDuplicates=!sheetOptions_.mergeDuplicates;refresh();});sheetButtons_[5]=button(U"忽略空帧",[this]{sheetOptions_.ignoreEmpty=!sheetOptions_.ignoreEmpty;refresh();});sheetButtons_[6]=button(U"像素选区",[this]{sheetOptions_.selection=!sheetOptions_.selection;refresh();});for(auto b:sheetButtons_){b->setVisible(false);b->iconSkin=&toolIcons_;}
    sheetValue_=new PixelEntry(font_,skin_);sheetValue_->numeric=true;addChild(sheetValue_);sheetValue_->setVisible(false);auto change=[this]{try{std::size_t used=0;double v=std::stod(sheetValue_->text(),&used);if(used!=sheetValue_->text().size()||!std::isfinite(v))return;auto c=sheetOptions_.constraint;int n=int(std::floor(std::clamp(v,1.0,c==SheetConstraint::FixedWidth||c==SheetConstraint::FixedHeight?262144.0:16384.0)+.5));(c==SheetConstraint::FixedColumns?sheetOptions_.fixedColumns:c==SheetConstraint::FixedRows?sheetOptions_.fixedRows:c==SheetConstraint::FixedWidth?sheetOptions_.fixedWidth:sheetOptions_.fixedHeight)=n;}catch(...){} };sheetValue_->Change.connect(change);sheetValue_->blur=change;sheetValue_->accept=[this]{resolve(true);};sheetValue_->cancel=[this]{resolve(false);};
  }
  void openDocumentExport(){if(document.timeline().state().frames.size()>1)openGifExport();else openStaticExport();}
  void createExportFormatControl(){exportFormatButton_=button(U"格式",[this]{PixelMenu menu(skin_);auto add=[&](std::u32string name,std::function<void()> action){auto item=new PixelMenuItem(font_,skin_,name);item->Click.connect([this,action]{resolve(false);action();});menu.addChild(item);};add(U"PNG RGBA",[this]{openStaticExport();});add(U"GIF",[this]{openGifExport();});for(auto text:{U"PNG 自动 · 未接入",U"WebP · 未接入",U"其它格式 · 未接入"}){auto item=new PixelMenuItem(font_,skin_,text);item->setEnabled(false);menu.addChild(item);}auto at=exportFormatButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});exportFormatButton_->setVisible(false);}
  void openStaticExport(){if(pending_!=Pending::None||document.active())return;exportOptions_={};pending_=Pending::StaticExport;menuBar_->setEnabled(false);exportScaleInput_->setText("100");discard_->caption=U"导出 PNG";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);refresh();}
  bool saveStaticExport(){wchar_t filename[32768]{};auto name=std::filesystem::path(document.name()).stem().wstring()+L".png";std::copy_n(name.c_str(),std::min<std::size_t>(name.size(),32767),filename);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=L"PNG RGBA 图片\0*.png\0\0";dialog.lpstrDefExt=L"png";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;if(!GetSaveFileNameW(&dialog)){const auto error=CommDlgExtendedError();if(error)status_=U"无法打开导出文件对话框";return false;}try{auto out=encodeStaticImagePng(document,exportOptions_);writeStaticImagePngAtomic(filename,out);status_=U"已导出 PNG";return true;}catch(const std::exception& e){status_=U"导出失败："+unicodeText(e.what());invalidate();return false;}}
  void createStaticExportControls(){exportScaleInput_=new PixelEntry(font_,skin_);exportScaleInput_->numeric=true;exportScaleInput_->suffix=U"%";addChild(exportScaleInput_);exportScaleInput_->setVisible(false);auto change=[this]{try{std::size_t used=0;double v=std::stod(exportScaleInput_->text(),&used);if(used==exportScaleInput_->text().size()&&std::isfinite(v))exportOptions_.scalePercent=int(std::floor(std::clamp(v,1.0,6400.0)+.5));}catch(...){} };exportScaleInput_->Change.connect(change);exportScaleInput_->blur=change;exportScaleInput_->accept=[this]{resolve(true);};exportScaleInput_->cancel=[this]{resolve(false);};exportTrimButton_=button(U"裁切透明边",[this]{exportOptions_.trim=!exportOptions_.trim;refresh();});exportSelectionButton_=button(U"仅像素选区",[this]{exportOptions_.selection=!exportOptions_.selection;refresh();});for(auto b:{exportTrimButton_,exportSelectionButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;b->setVisible(false);}}
  void createResizeControls(){for(int i=0;i<4;++i){auto input=new PixelEntry(font_,skin_);input->numeric=true;input->suffix=i<2?U"px":U"%";addChild(input);resizeInputs_[i]=input;input->setVisible(false);auto changed=[this,input,i]{if(resizeUpdating_||pending_!=Pending::ImageResize)return;try{std::size_t used=0;double v=std::stod(input->text(),&used);if(used!=input->text().size()||!std::isfinite(v))return;v=std::clamp(v,1.0,i<2?16384.0:6400.0);if(i<2)v=std::floor(v+.5);const bool horizontal=i%2==0;int n=i<2?int(v):std::clamp(int(std::floor((horizontal?document.width():document.height())*v/100+.5)),1,16384);(horizontal?resizeWidth_:resizeHeight_)=n;if(resizeLocked_)(horizontal?resizeHeight_:resizeWidth_)=std::max(1,int(std::floor(double(n)*(horizontal?document.height():document.width())/(horizontal?document.width():document.height())+.5)));updateResizeFields();}catch(...){} };input->Change.connect(changed);input->blur=changed;input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}resizeLock_=button(U"保持比例",[this]{resizeLocked_=!resizeLocked_;updateResizeFields();});resizeLock_->iconSkin=&toolIcons_;resizeLock_->setVisible(false);resizeMethod_=button(U"最近邻",[this]{resizeMethodValue_=resizeMethodValue_==ImageInterpolation::Nearest?ImageInterpolation::Smooth:ImageInterpolation::Nearest;updateResizeFields();});resizeMethod_->setVisible(false);}
  void createAdjustmentControls(){
    for(int i=0;i<3;++i){auto input=new PixelEntry(font_,skin_);input->numeric=true;addChild(input);adjustmentInputs_[i]=input;input->setVisible(false);auto changed=[this,input,i]{try{std::size_t used=0;double v=std::stod(input->text(),&used);if(used!=input->text().size() || !std::isfinite(v))return;double lo=-100,hi=100;if(adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation && i==0){lo=adjustmentSpec_.colorize?0:-180;hi=adjustmentSpec_.colorize?360:180;}if(adjustmentSpec_.colorize && i==1)lo=0;v=std::clamp(std::floor(v+.5),lo,hi);if(adjustmentSpec_.kind==ColorAdjustmentKind::BrightnessContrast)(i?adjustmentSpec_.contrast:adjustmentSpec_.brightness)=v;else (i==0?adjustmentSpec_.hue:i==1?adjustmentSpec_.saturation:adjustmentSpec_.lightness)=v;previewAdjustment();}catch(...){} };input->Change.connect(changed);input->blur=changed;input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}
    adjustmentPreview_=button(U"实时预览",[this]{adjustmentPreviewEnabled_=!adjustmentPreviewEnabled_;previewAdjustment();});adjustmentColorize_=button(U"着色",[this]{auto current=std::array<double,3>{adjustmentSpec_.hue,adjustmentSpec_.saturation,adjustmentSpec_.lightness};if(!adjustmentSpec_.colorize){relativeHsl_=current;if(!hasColorizedHsl_){auto c=document.palette().primary;const double r=(c&255)/255.0,g=((c>>8)&255)/255.0,b=((c>>16)&255)/255.0,hi=std::max({r,g,b}),lo=std::min({r,g,b}),d=hi-lo;const double h=d==0?0:std::fmod((hi==r?(g-b)/d:hi==g?(b-r)/d+2:(r-g)/d+4)*60+360,360);colorizedHsl_={std::floor(h+.5),25,adjustmentSpec_.lightness};}current=colorizedHsl_;}else{colorizedHsl_=current;hasColorizedHsl_=true;current=relativeHsl_;}adjustmentSpec_.colorize=!adjustmentSpec_.colorize;adjustmentSpec_.hue=current[0];adjustmentSpec_.saturation=current[1];adjustmentSpec_.lightness=current[2];previewAdjustment();});for(auto b:{adjustmentPreview_,adjustmentColorize_}){b->setVisible(false);b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}
  }
  void openPaletteExtraction(){
    if(pending_!=Pending::None || document.active())return;
    openPaletteEditor(0,false);pending_=Pending::PaletteExtract;extractMode_=0;paletteInput_->numeric=true;paletteInput_->setText(std::to_string(extractLimit_));extractNameInput_->setText(utf8Text(document.name())+" 调色板");discard_->caption=U"提取";keep_->caption=U"取消";discard_->setVisible(true);layoutModal();paletteInput_->requestFocus();paletteInput_->selectAllText();invalidate();
  }
  bool applyPaletteExtraction(){
    try{std::size_t used=0;const double value=std::stod(paletteInput_->text(),&used);if(used!=paletteInput_->text().size() || !std::isfinite(value))throw std::runtime_error("数量需要1–4096");extractLimit_=int(std::clamp(std::floor(value+.5),1.0,4096.0));
      const auto composite=compositeNormalRegion(document.timeline(),document.frame().id,{0,0,document.width(),document.height()});const auto colors=extractPaletteScanline(composite,extractLimit_);if(colors.empty())throw std::runtime_error("当前图像没有非透明颜色");
      document.applyExtractedPalette(colors,extractMode_==2,paletteColumns_);paletteScrollRow_=0;status_=extractMode_==0?U"已创建临时调色板："+unicodeText(extractNameInput_->text()):extractMode_==1?U"已替换调色板":U"已追加提取颜色";return true;
    }catch(const std::exception& e){status_=U"提取失败："+unicodeText(e.what());invalidate();return false;}
  }
  void showPaletteActions() {
    if(pending_!=Pending::None) return;
    PixelMenu popup(skin_);
    auto extract=new PixelMenuItem(font_,skin_,U"提取颜色");extract->iconSkin=&toolIcons_;extract->icon="extractColors";extract->setEnabled(!document.active());extract->Click.connect([this]{openPaletteExtraction();});popup.addChild(extract);popup.addChild(new PixelMenuSeparator(skin_));
    const char32_t* names[]={U"较小尺寸",U"小尺寸",U"中尺寸",U"大尺寸",U"较大尺寸"};
    for(int i=0;i<5;++i) {
      const auto px=std::to_string(swatchPixels_[i]);
      auto item=new PixelMenuItem(font_,skin_,names[i],std::u32string(px.begin(),px.end())+U" px");
      item->checked=[this,i]{return swatchSize_==i;};
      item->Click.connect([this,i]{chooseSwatchSize(i);});popup.addChild(item);
    }
    const auto anchor=paletteActions_->bounds();
    popup.showPopup(gfx::Point(anchor.x,anchor.y2()+uiGap*uiScale),display());requestFocus();
  }
  std::string activeRailTool() const {
    if(eyedropperTool_)return "eyedropper";
    if(handTool_)return "hand";
    if(selectionTool_)return legacyToolGroups()[3][selectionKind_].id;
    if(gradientTool_)return "fill.gradient";
    if(fillTool_)return "fill.bucket";
    return eraser_?legacyToolGroups()[1].front().id:legacyToolGroups()[0].front().id;
  }
  void refresh() {
    if(symmetryIdentity_!=document.identity()){document.symmetryAxes=persistedSymmetryAxes_;symmetryIdentity_=document.identity();symmetryInitialized_=symmetryHas(document.symmetryAxes);}
    if(!document.floating())selectionFreeTransform_=false;
    if(selectionPivotIdentity_!=document.identity() || (!document.floating() && !selectionEqual(selectionPivotMask_,document.selection()))){selectionPivot_.reset();selectionFreeTransform_=false;selectionPivotIdentity_=document.identity();selectionPivotMask_=document.selection();}
    if(!homeOpen_ && !homeVisibility_.empty()){for(auto state:homeVisibility_)state.first->setVisible(state.second);homeVisibility_.clear();}
    if(documentOpen_ && !closedControlStates_.empty()){for(auto state:closedControlStates_)state.first->setEnabled(state.second);closedControlStates_.clear();}
    layoutDocumentTab();
    layoutModal();syncPaletteButtons();layoutPanelTabs();layoutPalette();layoutToolOptions();layoutLayers();
    commands_[3]->setEnabled(pending_==Pending::None && document.canUndo()); commands_[4]->setEnabled(pending_==Pending::None && document.canRedo());

    for(auto& item:menuItems_) item.second->validateItem();
    const bool railEnabled=documentOpen_ && pending_==Pending::None && !shapeDragging_ && !gradientPending_ && !gradientDragging_;
    for(std::size_t i=0;i<toolRail_.size();++i) {
      const auto& group=legacyToolGroups()[i];
      const auto active=activeRailTool();
      toolRail_[i]->active=std::any_of(group.begin(),group.end(),[&](const auto& tool){return active==tool.id;});
      toolRail_[i]->setEnabled(railEnabled && (group.size()>1 || group.front().command>=0));
    }
    if(!documentOpen_){
      for(auto child:children())if(child!=menuBar_ && child!=documentTabNew_ && child!=homeButton_ && child!=discard_ && child!=keep_ && child!=dialogClose_ && child!=saveBeforeClose_)child->setEnabled(false);
      for(auto child:timelineInactive_)child->setVisible(false);
      for(auto child:layerRows_)child->setVisible(false);
      for(auto child:layerEyes_)child->setVisible(false);
      for(auto child:layerLocks_)child->setVisible(false);
      for(auto child:frameHeaders_)child->setVisible(false);
      for(auto child:frameCells_)child->setVisible(false);
      layerProperties_->setVisible(false);
      previewPanel_->setVisible(false);
    }
    for(int i=0;i<5;++i)if(topActions_[i]){topActions_[i]->setVisible(true);topActions_[i]->setEnabled(pending_==Pending::None && (i<2 || documentOpen_));}
    applyHomeVisibility();updateNavigationCursor();invalidate();
  }
  void cancelStroke() {
    playing_=false;
    finishPan(true);
    shapeDragging_=shapeRequest_=false;gradientDragging_=gradientPending_=gradientRequest_=false;gradientHandle_=-1;if(fillDragging_){fillDragging_=false;if(fillCommitted_){fillCommitted_=false;document.undo();}}document.cancelStroke(); if(hasCapture()) releaseMouse(); refresh();
  }
  void acceptOpen() {
    if(!openCandidate_) return;
    homeOpen_=false;
    documentOpen_=true;
    document=std::move(*openCandidate_);documentPath_=candidateRecovery_?std::filesystem::path():std::move(candidatePath_);if(candidateRecovery_)document.markRecovered(document.name()+U"（恢复）");candidateRecovery_=false;openCandidate_.reset();
    recordHomeRecent(documentPath_);
    paletteScrollRow_=0;paletteFocused_=false;ink_=document.palette().primary;
    status_=U"工程已打开";fitCanvas();refresh();if(importAfterOpen_){importAfterOpen_=false;openSheetImport(false);}
  }
  void openPath(const std::filesystem::path& path) {
    try {
      auto ext=path.extension().wstring();std::transform(ext.begin(),ext.end(),ext.begin(),[](wchar_t c){return ::towlower(c);});
      if(ext==L".gif"){auto image=openGifAnimation(path);if(documentOpen_&&document.dirty()){openCandidate_=std::move(image);candidatePath_.clear();candidateRecovery_=false;ask(Pending::Open);}else{document=std::move(image);documentPath_.clear();documentOpen_=true;homeOpen_=false;fitCanvas();refresh();}return;}
      if(ext==L".png"||ext==L".jpg"||ext==L".jpeg"||ext==L".bmp"||ext==L".webp"){auto image=openRasterImage(path);if(documentOpen_&&document.dirty()){openCandidate_=std::move(image);candidatePath_.clear();candidateRecovery_=false;ask(Pending::Open);}else{document=std::move(image);documentPath_.clear();documentOpen_=true;homeOpen_=false;fitCanvas();refresh();if(importAfterOpen_){importAfterOpen_=false;openSheetImport(false);}}return;}

      const project::Limits limits;
      std::ifstream file(path,std::ios::binary|std::ios::ate);
      if(!file) throw std::runtime_error("Cannot read project file");
      const auto size=file.tellg();
      if(size<0 || std::uint64_t(size)>limits.archiveBytes) throw project::Error(project::ErrorKind::Limit,"Project exceeds read budget");
      auto bytes=std::make_shared<project::Bytes>(std::size_t(size));file.seekg(0);
      if(!file.read(reinterpret_cast<char*>(bytes->data()),std::streamsize(bytes->size()))) throw std::runtime_error("Incomplete project read");
      auto imported=project::prepareEditableImport(project::readProjectManifest(bytes,limits));
      PaletteState palette;palette.entries.clear();palette.slots=std::move(imported.palette.slots);palette.nextId=imported.palette.nextId;
      for(auto& e:imported.palette.entries) palette.entries.push_back({e.id,std::move(e.name),e.color});
      openCandidate_=Document::fromImported(imported.width,imported.height,std::move(imported.timeline),std::move(palette),std::move(imported.id),std::move(imported.name),std::move(imported.sourceArchive));openCandidate_->setImportedProjectBrushes(std::move(imported.customBrushes));openCandidate_->selectLayer(imported.activeLayerId);openCandidate_->selectFrame(imported.activeFrameId);openCandidate_->setImportedLoop(imported.loop);if(imported.symmetryCenter)openCandidate_->setSymmetryCenter({imported.symmetryCenter->first,imported.symmetryCenter->second},false);
      candidatePath_=path;candidateRecovery_=false;ask(Pending::Open);
    } catch(const std::exception& e) {
      errorTitle_=U"无法打开工程";openCandidate_.reset();openError_=unicodeText(e.what());
      pending_=Pending::OpenError;menuBar_->setEnabled(false);
      for(auto b:commands_) b->setEnabled(false);for(auto b:swatches_) b->setEnabled(false);for(auto b:panelTabs_) b->setEnabled(false);
      refresh();
      dialogClose_->setVisible(true);discard_->setVisible(false);keep_->caption=U"确定";keep_->setVisible(true);keep_->requestFocus();invalidate();
    }
  }
  void showSaveError(const std::exception& error) {
    errorTitle_=U"无法保存工程";openError_=unicodeText(error.what());pending_=Pending::OpenError;
    saveBeforeClose_->setVisible(false);discard_->setVisible(false);keep_->caption=U"确定";keep_->setVisible(true);dialogClose_->setVisible(true);
    menuBar_->setEnabled(false);for(auto b:commands_)b->setEnabled(false);for(auto b:swatches_)b->setEnabled(false);for(auto b:panelTabs_)b->setEnabled(false);
    refresh();keep_->requestFocus();
  }
  bool savePath(const std::filesystem::path& path) {
    try {document.commitFloatingPaste();project::saveDocumentAtomic(document,path);documentPath_=path;status_=U"工程已保存";recordHomeRecent(path);
      if(ownedRecoveryIdentity_==document.identity() && !ownedRecoveryId_.empty()) {
        try {if(recoveryWorker_.valid()){recoveryWorker_.get();if(recoveryTicket_)recoveryQueue_.complete(*recoveryTicket_,true);recoveryTicket_.reset();}
          project::removeOwnedRecovery(recoveryDirectory(),ownedRecoveryId_);ownedRecoveryId_.clear();
        } catch(const std::exception&e){status_=U"工程已保存；恢复清理失败："+unicodeText(e.what());}
      }
      refresh();return true;}
    catch(const std::exception& e) {showSaveError(e);return false;}
  }
  bool saveProject(bool saveAs) {
    if(!documentOpen_)return false;
    if(colorPicker_) colorPicker_->finishInteraction();cancelStroke();
    auto path=documentPath_;
    if(saveAs || path.empty()) {
      wchar_t filename[32768]{};
      const auto initial=path.empty()?std::filesystem::path(L"未命名.moonsprite"):path;
      wcsncpy_s(filename,initial.c_str(),_TRUNCATE);
      OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;
      dialog.lpstrFilter=L"MoonSprite 与图像\0*.moonsprite;*.png;*.jpg;*.jpeg;*.bmp;*.webp\0工程\0*.moonsprite\0图像\0*.png;*.jpg;*.jpeg;*.bmp;*.webp\0\0";dialog.lpstrDefExt=L"moonsprite";
      dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;
      if(!GetSaveFileNameW(&dialog)) {
        if(CommDlgExtendedError()) showSaveError(std::runtime_error("Cannot open save dialog"));
        return false;
      }
      path=filename;
      if(_wcsicmp(path.extension().c_str(),L".moonsprite")!=0) {path+=L".moonsprite";if(std::filesystem::exists(path)){showSaveError(std::runtime_error("Select the full .moonsprite filename to confirm overwrite"));return false;}}
    }
    return savePath(path);
  }
  std::filesystem::path recoveryDirectory() {
    if(!recoveryDirectory_.empty())return recoveryDirectory_;
    wchar_t local[32768]{};GetEnvironmentVariableW(L"LOCALAPPDATA",local,32768);
    return std::filesystem::path(local)/L"MoonSprite"/L"Native"/L"recovery";
  }
  void recoveryTick(bool force=false) {
    if(homeOpen_ && !homeBanners_.empty() && std::chrono::steady_clock::now()>=homeBannerDue_){homeBanner_=(homeBanner_+1)%int(homeBanners_.size());homeBannerDue_=std::chrono::steady_clock::now()+std::chrono::seconds(8);invalidate();}
    if(smoke_ && !force)return;
    if(recoveryWorker_.valid()) {
      if(recoveryWorker_.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready)return;
      bool success=true;try{recoveryWorker_.get();}catch(const std::exception&e){success=false;status_=U"自动恢复保存失败："+unicodeText(e.what());invalidate();}
      recoveryQueue_.complete(*recoveryTicket_,success);recoveryTicket_.reset();
    }
    const auto now=std::chrono::steady_clock::now();
    if(force || now>=recoveryDue_) {
      recoveryDue_=now+std::chrono::milliseconds(static_cast<long long>(recoveryPreferences_.minutes*60000));
      if(recoveryPreferences_.enabled && document.dirty() && !document.active()) {
        if(ownedRecoveryIdentity_!=document.identity()){ownedRecoveryId_.clear();ownedRecoveryIdentity_=document.identity();}
        if(ownedRecoveryId_.empty())ownedRecoveryId_="native-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64())+"-"+std::to_string(document.identity());
        recoveryQueue_.request({ownedRecoveryId_,"",document.revision(),document.contentRevision(),true,true});
      }
    }
    if(!recoveryTicket_) {
      recoveryTicket_=recoveryQueue_.next();if(!recoveryTicket_)return;
      recoveryIdentity_=document.identity();recoveryOffset_=0;recoveryCelIndex_=0;recoveryPixels_.clear();recoveryState_={};recoveryState_.layers=document.timeline().state().layers;recoveryState_.frames=document.timeline().state().frames;recoveryState_.loopSections=document.timeline().state().loopSections;
      for(const auto& source:document.timeline().state().cels){timeline::Cel cel;cel.id=source.id;cel.layerId=source.layerId;cel.frameId=source.frameId;cel.opacity=source.opacity;cel.linkedCelId=source.linkedCelId;cel.runtimeSharedCelId=source.runtimeSharedCelId;if(source.surface){timeline::Surface surface;surface.width=document.width();surface.height=document.height();surface.pixels.reserve(source.surface->pixels.size());cel.surface=std::move(surface);}recoveryState_.cels.push_back(std::move(cel));}
    }
    if(document.active() || !document.dirty() || document.identity()!=recoveryIdentity_ || document.revision()!=recoveryTicket_->target.revision || document.contentRevision()!=recoveryTicket_->target.contentRevision) {
      recoveryQueue_.complete(*recoveryTicket_,false);recoveryTicket_.reset();recoveryPixels_.clear();recoveryState_={};return;
    }
    while(recoveryCelIndex_<recoveryState_.cels.size() && !recoveryState_.cels[recoveryCelIndex_].surface)++recoveryCelIndex_;
    if(recoveryCelIndex_<recoveryState_.cels.size()){
    const auto& original=document.timeline().state().cels[recoveryCelIndex_].surface->pixels;auto& copy=recoveryState_.cels[recoveryCelIndex_].surface->pixels;const auto count=std::min<std::size_t>(16384,original.size()-recoveryOffset_);
    copy.insert(copy.end(),original.begin()+recoveryOffset_,original.begin()+recoveryOffset_+count);recoveryOffset_+=count;
    if(recoveryOffset_!=original.size())return;recoveryOffset_=0;++recoveryCelIndex_;while(recoveryCelIndex_<recoveryState_.cels.size() && !recoveryState_.cels[recoveryCelIndex_].surface)++recoveryCelIndex_;if(recoveryCelIndex_!=recoveryState_.cels.size())return;
    }
    auto state=std::move(recoveryState_);
    auto source=document.sourceArchive();if(!source)source=std::make_shared<const std::vector<std::uint8_t>>();
    // Empty archive signals a new document to encoder; build metadata without copying history.
    auto snapshot=Document::fromImported(document.width(),document.height(),std::move(state),document.palette(),document.projectId().empty()?ownedRecoveryId_:document.projectId(),document.name(),source);
    snapshot.setImportedProjectBrushes(document.projectBrushes());
    snapshot.setSymmetryCenter(document.symmetryCenter(),false);
    snapshot.selectLayer(document.layer().id);snapshot.selectFrame(document.frame().id);snapshot.setImportedLoop(document.animationLoop());
    if(!document.sourceArchive())snapshot.clearSourceArchiveForNewSnapshot();
    const auto id=ownedRecoveryId_;const auto directory=recoveryDirectory();
    recoveryWorker_=std::async(std::launch::async,[snapshot=std::move(snapshot),id,directory]() mutable {
      const auto encoded=project::encodeRecoveryProject(snapshot);
      const auto stamp=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
      project::writeRecoveryFiles(directory,{id,std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(snapshot.name()),std::to_string(stamp)},*encoded.bytes);
    });
  }
  void restoreRecovery(const std::filesystem::path& archive,const std::string& id,const std::u32string& name) {
    try {auto file=std::ifstream(archive,std::ios::binary|std::ios::ate);if(!file)throw std::runtime_error("Cannot read recovery");const auto length=file.tellg();if(length<0 || std::uint64_t(length)>project::Limits{}.archiveBytes)throw std::runtime_error("Recovery size exceeds budget");auto bytes=std::make_shared<project::Bytes>(std::size_t(length));file.seekg(0);file.read(reinterpret_cast<char*>(bytes->data()),std::streamsize(bytes->size()));auto imported=project::prepareEditableImport(project::readProjectManifest(bytes));PaletteState palette;palette.entries.clear();palette.slots=imported.palette.slots;palette.nextId=imported.palette.nextId;for(auto& e:imported.palette.entries)palette.entries.push_back({e.id,std::move(e.name),e.color});openCandidate_=Document::fromImported(imported.width,imported.height,std::move(imported.timeline),std::move(palette),std::move(imported.id),name,imported.sourceArchive);openCandidate_->setImportedProjectBrushes(std::move(imported.customBrushes));openCandidate_->selectLayer(imported.activeLayerId);openCandidate_->selectFrame(imported.activeFrameId);openCandidate_->setImportedLoop(imported.loop);if(imported.symmetryCenter)openCandidate_->setSymmetryCenter({imported.symmetryCenter->first,imported.symmetryCenter->second},false);candidateRecovery_=true;ask(Pending::Open);}catch(const std::exception&e){showSaveError(e);errorTitle_=U"无法恢复工程";}}
  void setRecoveryPreferences(recovery::Preferences preferences) {
    try {preferences=recovery::normalizePreferences(preferences);if(!smoke_)recovery::savePreferencesAtomic(recoveryDirectory().parent_path()/"recovery-preferences.txt",preferences);recoveryPreferences_=preferences;recoveryQueue_.setIntervalMinutes(preferences.minutes);recoveryDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(preferences.minutes*60000));status_=U"恢复设置已保存";refresh();}
    catch(const std::exception&e){showSaveError(e);errorTitle_=U"恢复设置保存失败";}
  }
  void showLayerOpacity() {
    cancelStroke();document.beginLayerOpacity();pending_=Pending::LayerOpacity;
    layerOpacityRange_->value=int(std::lround(document.layer().opacity*100));layerOpacityRange_->setVisible(true);
    keep_->caption=U"关闭";keep_->setVisible(true);dialogClose_->setVisible(true);menuBar_->setEnabled(false);
    for(auto b:commands_)b->setEnabled(false);for(auto b:swatches_)b->setEnabled(false);for(auto b:panelTabs_)b->setEnabled(false);
    paletteActions_->setEnabled(false);refresh();layerOpacityRange_->requestFocus();
  }
  void showRecoveryPreferences() {
    PixelMenu popup(skin_);
    auto toggle=new PixelMenuItem(font_,skin_,U"自动恢复保存");toggle->checked=[this]{return recoveryPreferences_.enabled;};toggle->Click.connect([this]{auto p=recoveryPreferences_;p.enabled=!p.enabled;setRecoveryPreferences(p);});popup.addChild(toggle);
    const double values[]{0.5,1,2,5,10};const char32_t* names[]{U"30 秒",U"1 分钟",U"2 分钟",U"5 分钟",U"10 分钟"};
    for(int i=0;i<5;++i){auto entry=new PixelMenuItem(font_,skin_,names[i]);const double value=values[i];entry->checked=[this,value]{return recoveryPreferences_.minutes==value;};entry->Click.connect([this,value]{auto p=recoveryPreferences_;p.minutes=value;setRecoveryPreferences(p);});popup.addChild(entry);}
    for(int days:{1,7,30,365}){const auto n=std::to_string(days);auto entry=new PixelMenuItem(font_,skin_,U"保留期预览："+std::u32string(n.begin(),n.end())+U" 天");entry->checked=[this,days]{return recoveryPreferences_.retentionDays==days;};entry->Click.connect([this,days]{auto p=recoveryPreferences_;p.retentionDays=days;setRecoveryPreferences(p);});popup.addChild(entry);}
    popup.showPopup(gfx::Point(bounds().x+8,bounds().y+36),display());
  }
  void loadRecoveries(bool startup=false) {
    if(!recoveryCatalog_.beginLoad(startup))return;
    try {recoveryCatalog_.loaded(project::listRecoveryRecords(recoveryDirectory()));if(recoveryCatalog_.visible())status_=U"发现可恢复工程 · 文件 → 恢复工程";}
    catch(const std::exception&e){recoveryCatalog_.loadFailed(e.what());status_=U"读取恢复记录失败："+unicodeText(e.what());}
    refresh();
  }
  void chooseRecovery() {
    loadRecoveries();const auto dir=recoveryDirectory();auto records=recoveryCatalog_.rows();if(records.empty()){status_=U"没有可恢复工程";refresh();return;}PixelMenu popup(skin_);for(const auto& r:records){bool stale=false;try{const auto now=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();stale=recovery::retentionStale(std::stoll(r.updatedAt),now,recoveryPreferences_.retentionDays);}catch(const std::exception&){}auto item=new PixelMenuItem(font_,skin_,unicodeText(r.name)+(stale?U" · 超过保留期":U""));item->Click.connect([this,dir,r]{restoreRecovery(dir/std::filesystem::u8path(r.id+".moonsprite"),r.id,unicodeText(r.name));});popup.addChild(item);}popup.showPopup(gfx::Point(bounds().x+8,bounds().y+36),display());
  }
  void chooseProject() {
    wchar_t filename[32768]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);
    dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;
    dialog.lpstrFilter=L"MoonSprite 工程\0*.moonsprite\0\0";
    dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_FILEMUSTEXIST;
    if(GetOpenFileNameW(&dialog)) openPath(filename);
    else if(CommDlgExtendedError()) {
      openError_=U"无法打开文件选择器";pending_=Pending::OpenError;layoutModal();layoutPalette();
      dialogClose_->setVisible(true);discard_->setVisible(false);keep_->caption=U"确定";keep_->setVisible(true);invalidate();
    }
  }
  void ask(Pending action) {
    document.commitFloatingPaste();
    if(colorPicker_) colorPicker_->finishInteraction();
    cancelStroke();
    if(!document.dirty()) { if(action==Pending::New) {document=Document::withBuiltinPalette();documentPath_.clear();documentOpen_=true;homeOpen_=false;} else if(action==Pending::Open) acceptOpen(); else if(action==Pending::Close) closeRequested(); else if(action==Pending::CloseDocument)closeDocumentTab(); refresh(); return; }
    spaceHeld_=false;updateNavigationCursor();
    pending_=action;layoutModal();layoutPalette();
    layoutDocumentTab();
    menuBar_->setEnabled(false);
    paletteActions_->setEnabled(false);
    for(auto b:commands_) b->setEnabled(false);
    for(auto b:swatches_) b->setEnabled(false);
    for(auto b:panelTabs_) b->setEnabled(false);
    paletteActions_->setEnabled(false);
    dialogClose_->setVisible(true);
    saveBeforeClose_->setVisible(true);discard_->setVisible(true); keep_->setVisible(true); keep_->requestFocus(); applyHomeVisibility();invalidate();
  }
  void resolve(bool discard) {
    finishSizeDrag();
    const auto action=pending_;
    if(action==Pending::ReplaceColor){finishReplaceSampling();cancelReplacePreview();if(discard){if(replaceScope_=="palette"){if(document.beginPaletteReplacement()){document.updatePaletteReplacement(replaceSource_,replaceDestination_,true);document.commitPaletteReplacement();}}else if(document.beginColorReplacement(replaceTargets(),replaceScope_=="selection")){document.updateColorReplacement(replaceSource_,replaceDestination_,true);document.commitColorAdjustment();}}for(auto input:replaceInputs_)input->setVisible(false);for(auto b:replaceSample_)b->setVisible(false);for(auto b:{replaceScopeButton_,replacePreviewButton_,replaceRememberButton_})b->setVisible(false);discard_->setEnabled(true);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::BrushFolderName){if(discard){try{PatternBrushLibrary library(fillBrushLibraryDirectory());auto result=fillFolderRename_?library.renameFolder(fillFolderEditing_,paletteInput_->text()):library.createFolder(paletteInput_->text(),fillFolderEditing_);fillFolder_=result.id;applyFillLibrarySelection();}catch(const std::exception& e){status_=U"文件夹操作失败："+unicodeText(e.what());refresh();return;}}paletteInput_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::SheetImport){if(discard){try{document.importSpriteSheet(importSheetOptions_);fitCanvas();}catch(const std::exception& e){status_=U"精灵表导入失败："+unicodeText(e.what());invalidate();return;}}for(auto input:importSheetInputs_)input->setVisible(false);importSheetLayout_->setVisible(false);importSheetPartial_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::GifExport){if(discard&&!saveGifExport())return;for(auto input:gifInputs_)input->setVisible(false);for(auto b:{gifRange_,gifDirection_,gifTrim_})b->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::SpriteSheet){if(discard&&!saveSpriteSheet())return;for(auto b:sheetButtons_)b->setVisible(false);sheetValue_->setVisible(false);if(sheetPreview_)sheetPreview_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::StaticExport){if(discard&&!saveStaticExport())return;exportScaleInput_->setVisible(false);exportTrimButton_->setVisible(false);exportSelectionButton_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::ImageResize){if(discard){try{document.resizeImage(resizeWidth_,resizeHeight_,resizeMethodValue_);fitCanvas();}catch(const std::exception& e){status_=U"调整尺寸失败："+unicodeText(e.what());invalidate();return;}}for(auto input:resizeInputs_)input->setVisible(false);resizeLock_->setVisible(false);resizeMethod_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::ColorAdjustment){if(discard){document.updateColorAdjustment(adjustmentSpec_,true);document.commitColorAdjustment();}else document.cancelColorAdjustment();for(auto input:adjustmentInputs_)input->setVisible(false);adjustmentPreview_->setVisible(false);adjustmentColorize_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::PaletteExtract){if(discard && !applyPaletteExtraction())return;paletteInput_->setVisible(false);extractNameInput_->setVisible(false);extractModeButton_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::LoopSection){if(discard && !commitLoopEditor())return;for(auto input:loopInputs_)input->setVisible(false);loopDirection_->setVisible(false);loopDraft_.reset();discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::OnionValue){previewOnionValue();saveOnionSettings();paletteInput_->setVisible(false);paletteInput_->suffix.clear();discard=false;}
    if(action==Pending::FrameDuration){document.commitFrameDuration();paletteInput_->setVisible(false);paletteInput_->suffix.clear();discard=false;}
    if(action==Pending::LayerOpacity){document.commitLayerOpacity();layerOpacityRange_->setVisible(false);discard=false;}
    if(action==Pending::PaletteName || action==Pending::ColorRole) {
      if(action==Pending::PaletteName && discard) document.renamePaletteColor(renameId_,unicodeText(paletteInput_->text()));
      if(action==Pending::ColorRole) commitPaletteHex();
      pending_=Pending::None;paletteInput_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";
      discard=false;
    }
    pending_=Pending::None;
    menuBar_->setEnabled(true);
    dialogClose_->setVisible(false);saveBeforeClose_->setVisible(false);
    discard_->setVisible(false); keep_->setVisible(false);
    for(auto b:commands_) b->setEnabled(true);
    for(auto b:swatches_) b->setEnabled(true);
    for(auto b:panelTabs_) b->setEnabled(true);
    if(discard) { if(action==Pending::New) {document=Document::withBuiltinPalette();documentPath_.clear();documentOpen_=true;homeOpen_=false;} else if(action==Pending::Open) acceptOpen(); else if(action==Pending::Close) closeRequested(); else if(action==Pending::CloseDocument)closeDocumentTab(); }
    if(action==Pending::Open&&!discard)importAfterOpen_=false;
    openCandidate_.reset();candidateRecovery_=false;keep_->caption=U"取消";
    requestFocus(); refresh();
  }
  bool& symmetryFlag(int i){auto& a=document.symmetryAxes;return i==0?a.horizontal:i==1?a.vertical:i==2?a.diagonalUp:i==3?a.diagonalDown:a.rotational;}
  void saveSymmetryPreferences(){try{if(smoke_)return;const auto path=palettePreferencePath().parent_path()/"symmetry.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out.exceptions(std::ios::failbit|std::ios::badbit);for(int i=0;i<5;++i)out<<symmetryFlag(i)<<' ';out<<symmetryLocked_<<' '<<symmetryThickness_<<' '<<symmetryColor_;}catch(const std::exception& e){status_=U"对称偏好保存失败："+unicodeText(e.what());}}
  void toggleSymmetry(int i){if(document.active())return;const bool on=!symmetryFlag(i);if(on && (!symmetryInitialized_ || !canvasViewport().contains(gfx::Point(int(canvas_.x+document.symmetryCenter().x*canvasScale()),int(canvas_.y+document.symmetryCenter().y*canvasScale()))))){const auto at=canvasViewport().center();document.setSymmetryCenter({(at.x-canvas_.x)/canvasScale(),(at.y-canvas_.y)/canvasScale()});symmetryInitialized_=true;}symmetryFlag(i)=on;persistedSymmetryAxes_=document.symmetryAxes;saveSymmetryPreferences();refresh();}
  void showSymmetryMenu(){PixelMenu menu(skin_);auto add=[&](const char32_t* label,std::function<void()> action){auto item=new PixelMenuItem(font_,skin_,label);item->Click.connect(action);menu.addChild(item);return item;};add(U"重置对称轴",[this]{document.setSymmetryCenter(defaultSymmetryCenter(document.width(),document.height()));refresh();});auto lock=add(U"锁定对称轴（Ctrl临时解锁）",[this]{symmetryLocked_=!symmetryLocked_;saveSymmetryPreferences();});lock->checked=[this]{return symmetryLocked_;};for(int n=1;n<=8;++n){auto item=new PixelMenuItem(font_,skin_,U"轴粗细 "+unicodeText(std::to_string(n))+U" px");item->checked=[this,n]{return symmetryThickness_==n;};item->Click.connect([this,n]{symmetryThickness_=n;saveSymmetryPreferences();invalidateRect(canvasViewport());});menu.addChild(item);}auto colorLabel=new PixelMenuItem(font_,skin_,U"对称轴颜色 HEX");colorLabel->setEnabled(false);menu.addChild(colorLabel);auto colorInput=new PixelEntry(font_,skin_);colorInput->setText(paletteHex(symmetryColor_));menu.addChild(colorInput);colorInput->Change.connect([this,colorInput]{Pixel next;if(parsePaletteHex(colorInput->text(),next)){symmetryColor_=next;saveSymmetryPreferences();invalidateRect(canvasViewport());}});const auto at=symmetryButtons_[5]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}
  std::optional<SymmetryAxis> symmetryHit(gfx::Point at,bool ctrl=false)const{if(!symmetryAxisDragAllowed(symmetryLocked_,ctrl) || !symmetryHas(document.symmetryAxes) || !canvasViewport().contains(at) || !canvas_.contains(at))return {};const auto p=SymmetryCenter{(at.x-canvas_.x)/canvasScale(),(at.y-canvas_.y)/canvasScale()},c=document.symmetryCenter();if(std::hypot(p.x-c.x,p.y-c.y)<=std::max(.35,9/canvasScale()))return SymmetryAxis::Center;const double radius=std::max(.25,std::max(7.0,symmetryThickness_/2.0+4)/canvasScale());double best=radius;std::optional<SymmetryAxis> axis;auto check=[&](SymmetryAxis a,double d){if(d<=radius && (!axis || d<best)){best=d;axis=a;}};const auto a=document.symmetryAxes;if(a.horizontal||a.rotational)check(SymmetryAxis::Horizontal,std::abs(p.y-c.y));if(a.vertical||a.rotational)check(SymmetryAxis::Vertical,std::abs(p.x-c.x));if(a.diagonalUp)check(SymmetryAxis::DiagonalUp,std::abs(p.x+p.y-c.x-c.y)/std::sqrt(2.0));if(a.diagonalDown)check(SymmetryAxis::DiagonalDown,std::abs(p.y-p.x-c.y+c.x)/std::sqrt(2.0));return axis;}
  void finishSymmetryDrag(bool cancel=false){if(!symmetryDragging_)return;const auto center=cancel?symmetryDragBefore_:document.symmetryCenter();document.setSymmetryCenter(center,!cancel);symmetryDragging_=false;if(hasCapture())releaseMouse();updateNavigationCursor();refresh();}
  void useEyedropperTool(){if(document.active() || selectionDragging_ || floatingDragging_ || shapeDragging_ || fillDragging_ || eyedropperGesture_.active())return;cancelStroke();selectionTool_=shapeTool_=gradientTool_=fillTool_=handTool_=eraser_=false;eyedropperTool_=true;playing_=false;layoutToolOptions();refresh();}
  void sampleEyedropperAt(Point p){try{const auto color=sampleEyedropper(document.timeline(),document.frame().id,document.layer().id,document.width(),document.height(),p.x,p.y,eyedropperSource_);eyedropperGesture_.sample(color);document.setPaletteRole(color,eyedropperGesture_.secondary(),paletteLocked_);if(replaceSampling_>=0)changeReplaceColor(replaceSampling_,color,true);refresh();}catch(const std::exception& e){status_=U"采色失败："+unicodeText(e.what());invalidate();}}
  void finishEyedropper(){const auto added=eyedropperGesture_.finish(paletteSamplingHeld_);if(added)document.addPaletteColor(*added);if(hasCapture())releaseMouse();if(replaceSampling_>=0)finishReplaceSampling();updateNavigationCursor();refresh();}
  std::filesystem::path fillBrushLibraryDirectory() const {
    wchar_t path[32768]{};const auto size=GetModuleFileNameW(nullptr,path,32768);if(!size || size==32768)throw std::runtime_error("Cannot locate native brush library");return std::filesystem::path(path).parent_path()/L"brushes";
  }
  void resolvePencilImageBrush(){pencilImageBrush_.reset();if(pencilImageBrushId_.empty())return;try{if(pencilImageBrushId_.rfind("project:",0)==0){const auto id=pencilImageBrushId_.substr(8);for(const auto& item:document.projectBrushes())if(item.metadata.id==id){pencilImageBrush_=item.brush;return;}throw std::runtime_error("工程笔刷已不存在");}PatternBrushLibrary library(fillBrushLibraryDirectory());for(const auto& item:library.list().brushes)if(item.id==pencilImageBrushId_){pencilImageBrush_=importPatternBrush(std::filesystem::u8path(item.filePath)).brush;return;}throw std::runtime_error("本地笔刷已不存在");}catch(const std::exception& e){pencilImageBrushId_.clear();status_=U"图像笔刷不可用："+unicodeText(e.what());}}
  void showPencilImageBrushes(){if(document.active())return;PixelMenu menu(skin_);auto clear=new PixelMenuItem(font_,skin_,U"普通笔刷");clear->Click.connect([this]{pencilImageBrushId_.clear();pencilImageBrush_.reset();refresh();});menu.addChild(clear);try{PatternBrushLibrary library(fillBrushLibraryDirectory());for(const auto& item:library.list().brushes){auto row=new PixelMenuItem(font_,skin_,unicodeText(item.name));row->checked=[this,id=item.id]{return pencilImageBrushId_==id;};row->Click.connect([this,id=item.id]{pencilImageBrushId_=id;resolvePencilImageBrush();refresh();});menu.addChild(row);}for(const auto& item:document.projectBrushes()){auto row=new PixelMenuItem(font_,skin_,U"工程："+unicodeText(item.metadata.name));row->checked=[this,id=item.metadata.id]{return pencilImageBrushId_=="project:"+id;};row->Click.connect([this,id=item.metadata.id]{pencilImageBrushId_="project:"+id;resolvePencilImageBrush();refresh();});menu.addChild(row);}}catch(const std::exception& e){status_=U"笔刷库读取失败："+unicodeText(e.what());}menu.addChild(new PixelMenuSeparator(skin_));auto angleLabel=new PixelMenuItem(font_,skin_,U"角度（度）");angleLabel->setEnabled(false);menu.addChild(angleLabel);auto angle=new PixelEntry(font_,skin_);angle->numeric=true;angle->setText(std::to_string(int(pencilImageBrushAngle_)));menu.addChild(angle);angle->Change.connect([this,angle]{try{std::size_t used=0;double value=std::stod(angle->text(),&used);if(used==angle->text().size() && std::isfinite(value))pencilImageBrushAngle_=std::clamp(value,-180.0,180.0);}catch(...){} });auto at=imageBrushButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}
  void applyFillLibrarySelection(){
    PatternBrushLibrary library(fillBrushLibraryDirectory());const auto listing=library.list();std::vector<PatternBrush> brushes;std::u32string name;
    for(const auto& id:fillLibrarySelection_.ids){auto item=std::find_if(listing.brushes.begin(),listing.brushes.end(),[&](const auto& value){return value.id==id;});if(item==listing.brushes.end()){auto projectId=id.rfind("project:",0)==0?id.substr(8):id;auto project=std::find_if(document.projectBrushes().begin(),document.projectBrushes().end(),[&](const auto& resource){return resource.metadata.id==projectId;});if(project!=document.projectBrushes().end()){if(id==fillLibrarySelection_.active)name=unicodeText(project->metadata.name);brushes.push_back(project->brush);}continue;}auto loaded=importPatternBrush(std::filesystem::u8path(item->filePath));loaded.brush.sourceX=item->sourceX.value_or(0);loaded.brush.sourceY=item->sourceY.value_or(0);if(id==fillLibrarySelection_.active)name=unicodeText(item->name);brushes.push_back(std::move(loaded.brush));}
    fillPattern_.brushes=std::move(brushes);fillImageName_=std::move(name);
  }
  void selectFillLibraryBrush(const std::string& id,bool ctrl,bool shift){
    try{PatternBrushLibrary library(fillBrushLibraryDirectory());std::vector<std::string> ordered;for(const auto& item:library.list().brushes)ordered.push_back(item.id);for(const auto& item:document.projectBrushes())ordered.push_back("project:"+item.metadata.id);auto previous=fillLibrarySelection_;fillLibrarySelection_.select(ordered,id,ctrl,shift);try{applyFillLibrarySelection();}catch(...){fillLibrarySelection_=std::move(previous);throw;}status_=U"已选择图案："+fillImageName_;}catch(const std::exception& e){status_=U"图案选择失败："+unicodeText(e.what());}refresh();
  }
  void deleteFillLibrarySelection(){
    try{PatternBrushLibrary library(fillBrushLibraryDirectory());auto ids=fillLibrarySelection_.ids;for(const auto& id:ids){if(id.rfind("project:",0)==0)document.deleteProjectBrush(id.substr(8));else library.remove(id);fillLibrarySelection_.removed(id);}applyFillLibrarySelection();status_=U"已删除选中图案";}catch(const std::exception& e){status_=U"删除图案失败："+unicodeText(e.what());try{applyFillLibrarySelection();}catch(const std::exception&) {fillPattern_.brushes.clear();fillImageName_.clear();}}refresh();
  }
  void confirmFillLibraryDelete(){
    PixelMenu menu(skin_);auto cancel=new PixelMenuItem(font_,skin_,U"取消");menu.addChild(cancel);auto confirm=new PixelMenuItem(font_,skin_,U"确认删除选中图案（无法撤销）");confirm->Click.connect([this]{deleteFillLibrarySelection();});menu.addChild(confirm);auto at=fillImageButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();
  }
  void editFillFolder(bool rename){if(rename&&fillFolder_.empty())return;fillFolderRename_=rename;fillFolderEditing_=fillFolder_;paletteInput_->numeric=false;paletteInput_->suffix.clear();paletteInput_->setText(rename?std::filesystem::u8path(fillFolder_).filename().u8string():"");pending_=Pending::BrushFolderName;menuBar_->setEnabled(false);discard_->caption=rename?U"重命名":U"创建";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);paletteInput_->setVisible(true);refresh();paletteInput_->requestFocus();paletteInput_->selectAllText();}
  void moveFillBrushes(const std::string& folder){try{PatternBrushLibrary library(fillBrushLibraryDirectory());for(const auto& id:fillLibrarySelection_.ids)library.move(id,folder);applyFillLibrarySelection();status_=U"已移动选中图案";}catch(const std::exception& e){status_=U"移动图案失败："+unicodeText(e.what());}refresh();}
  void confirmFillFolderDelete(){if(fillFolder_.empty())return;auto target=fillFolder_;PixelMenu menu(skin_);menu.addChild(new PixelMenuItem(font_,skin_,U"取消"));auto confirm=new PixelMenuItem(font_,skin_,U"确认删除文件夹及全部图案（无法撤销）");confirm->Click.connect([this,target]{try{PatternBrushLibrary library(fillBrushLibraryDirectory());auto before=library.list();library.removeFolder(target);for(const auto& item:before.brushes)if(item.folderId==target||item.folderId.rfind(target+"/",0)==0)fillLibrarySelection_.removed(item.id);fillFolder_.clear();applyFillLibrarySelection();status_=U"已删除图案文件夹";}catch(const std::exception& e){status_=U"删除文件夹失败："+unicodeText(e.what());}refresh();});menu.addChild(confirm);auto at=fillImageButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}
  void showFillFolderMenu(){PixelMenu menu(skin_);try{PatternBrushLibrary library(fillBrushLibraryDirectory());auto listing=library.list();auto root=new PixelMenuItem(font_,skin_,U"根文件夹");root->Click.connect([this]{fillFolder_.clear();refresh();});menu.addChild(root);for(const auto& folder:listing.folders){auto row=new PixelMenuItem(font_,skin_,unicodeText(folder.id));row->checked=[this,id=folder.id]{return fillFolder_==id;};row->Click.connect([this,id=folder.id]{fillFolder_=id;refresh();});menu.addChild(row);}auto create=new PixelMenuItem(font_,skin_,U"新建子文件夹…");create->Click.connect([this]{editFillFolder(false);});menu.addChild(create);if(!fillFolder_.empty()){auto rename=new PixelMenuItem(font_,skin_,U"重命名当前文件夹…");rename->Click.connect([this]{editFillFolder(true);});menu.addChild(rename);auto remove=new PixelMenuItem(font_,skin_,U"删除当前文件夹…");remove->Click.connect([this]{confirmFillFolderDelete();});menu.addChild(remove);}if(!fillLibrarySelection_.ids.empty()){auto move=new PixelMenuItem(font_,skin_,U"移动选中图案到根文件夹");move->Click.connect([this]{moveFillBrushes({});});menu.addChild(move);for(const auto& folder:listing.folders){auto row=new PixelMenuItem(font_,skin_,U"移动选中图案到 "+unicodeText(folder.id));row->Click.connect([this,id=folder.id]{moveFillBrushes(id);});menu.addChild(row);}}}catch(const std::exception& e){status_=U"文件夹读取失败："+unicodeText(e.what());}auto at=fillImageButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}
  void createFillBrushFromSelection(){
    document.commitFloatingPaste();if(!document.selection()){status_=U"需要选区";refresh();return;}
    try{auto brush=createSelectionPatternBrush(document.pixels(),document.width(),document.height(),*document.selection());if(!brush){status_=U"选区中没有可用笔刷像素";refresh();return;}PatternBrushLibrary library(fillBrushLibraryDirectory());auto stored=library.save("笔刷",encodePatternBrushPng(*brush),true,brush->sourceX,brush->sourceY);if(!fillFolder_.empty())library.move(stored.id,fillFolder_);fillLibrarySelection_.ids={stored.id};fillLibrarySelection_.active=fillLibrarySelection_.anchor=stored.id;applyFillLibrarySelection();document.previewSelection({});selectionPropertiesActive_=false;status_=U"选区笔刷已保存到本地库";}catch(const std::exception& e){status_=U"创建选区笔刷失败："+unicodeText(e.what());}refresh();
  }
  void importFillImage(){
    wchar_t filename[32768]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=L"图案图像\0*.png;*.jpg;*.jpeg;*.bmp;*.gif;*.webp\0\0";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_FILEMUSTEXIST|OFN_ALLOWMULTISELECT;
    if(!GetOpenFileNameW(&dialog))return;
    std::vector<std::filesystem::path> paths;auto first=std::filesystem::path(filename);auto next=filename+std::wcslen(filename)+1;if(!*next)paths.push_back(first);else for(;*next;next+=std::wcslen(next)+1)paths.push_back(first/next);
    int success=0,failed=0;std::string last,error;try{PatternBrushLibrary library(fillBrushLibraryDirectory());for(const auto& path:paths){try{auto imported=importPatternBrush(path);auto stored=library.save(utf8Text(imported.name),encodePatternBrushPng(imported.brush));if(!fillFolder_.empty())library.move(stored.id,fillFolder_);last=stored.id;++success;}catch(const std::exception& e){if(error.empty())error=e.what();++failed;}}if(!last.empty()){fillLibrarySelection_.ids={last};fillLibrarySelection_.active=fillLibrarySelection_.anchor=last;applyFillLibrarySelection();}status_=U"已导入图案："+unicodeText(std::to_string(success));if(failed)status_+=U" · 失败 "+unicodeText(std::to_string(failed))+U"："+unicodeText(error);}catch(const std::exception& e){status_=U"图案导入失败："+unicodeText(e.what());}refresh();
  }
  void showFillLibraryMenu(){
    PixelMenu menu(skin_);auto capture=new PixelMenuItem(font_,skin_,U"从选区创建笔刷");capture->Click.connect([this]{createFillBrushFromSelection();});menu.addChild(capture);auto folders=new PixelMenuItem(font_,skin_,U"文件夹…");folders->Click.connect([this]{showFillFolderMenu();});menu.addChild(folders);auto load=new PixelMenuItem(font_,skin_,U"导入图像…");load->Click.connect([this]{importFillImage();});menu.addChild(load);
    try{PatternBrushLibrary library(fillBrushLibraryDirectory());for(const auto& item:library.list().brushes){if(item.folderId!=fillFolder_)continue;auto row=new PixelMenuItem(font_,skin_,unicodeText(item.name));row->checked=[this,id=item.id]{return std::find(fillLibrarySelection_.ids.begin(),fillLibrarySelection_.ids.end(),id)!=fillLibrarySelection_.ids.end();};row->Click.connect([this,id=item.id]{selectFillLibraryBrush(id,(GetKeyState(VK_CONTROL)&0x8000)!=0,(GetKeyState(VK_SHIFT)&0x8000)!=0);});menu.addChild(row);}}catch(const std::exception& e){status_=U"图案库读取失败："+unicodeText(e.what());}
    for(const auto& resource:document.projectBrushes()){auto row=new PixelMenuItem(font_,skin_,U"工程 · "+unicodeText(resource.metadata.name));row->checked=[this,id="project:"+resource.metadata.id]{return std::find(fillLibrarySelection_.ids.begin(),fillLibrarySelection_.ids.end(),id)!=fillLibrarySelection_.ids.end();};row->Click.connect([this,id="project:"+resource.metadata.id]{selectFillLibraryBrush(id,(GetKeyState(VK_CONTROL)&0x8000)!=0,(GetKeyState(VK_SHIFT)&0x8000)!=0);});menu.addChild(row);}
    if(!fillLibrarySelection_.ids.empty()){auto remove=new PixelMenuItem(font_,skin_,U"删除选中图案…");remove->Click.connect([this]{confirmFillLibraryDelete();});menu.addChild(remove);}if(!fillPattern_.brushes.empty()){auto clear=new PixelMenuItem(font_,skin_,U"停用图像图案");clear->Click.connect([this]{fillLibrarySelection_={};fillPattern_.brushes.clear();fillImageName_.clear();refresh();});menu.addChild(clear);}
    auto mode=new PixelMenuItem(font_,skin_,U"布局：默认 / 规则 / 随机");mode->Click.connect([this]{fillPattern_.mode=fillPattern_.mode==PatternMode::Default?PatternMode::Regular:fillPattern_.mode==PatternMode::Regular?PatternMode::Random:PatternMode::Default;refresh();});menu.addChild(mode);
    auto sample=new PixelMenuItem(font_,skin_,U"采样：绘制 / 源坐标 / 目标坐标");sample->Click.connect([this]{fillPattern_.paintMode=PatternPaintMode((int(fillPattern_.paintMode)+1)%3);refresh();});menu.addChild(sample);
    auto overlap=new PixelMenuItem(font_,skin_,fillPattern_.settings.regularOverlap?U"规则允许重叠：是":U"规则允许重叠：否");overlap->Click.connect([this]{fillPattern_.settings.regularOverlap=!fillPattern_.settings.regularOverlap;refresh();});menu.addChild(overlap);
    auto addSpacing=[&](const char32_t* label,int value,int lo,int hi,std::function<void(int)> set){auto field=new PixelEntry(font_,skin_);field->numeric=true;field->setText(std::to_string(value));field->Change.connect([field,lo,hi,set]{try{set(std::clamp(std::stoi(field->text()),lo,hi));}catch(...){}});auto item=new PixelMenuItem(font_,skin_,label);item->setEnabled(false);menu.addChild(item);menu.addChild(field);};
    addSpacing(U"规则 X 间距",fillPattern_.settings.regularSpacingX,fillPattern_.settings.regularOverlap?-4096:0,4096,[this](int n){fillPattern_.settings.regularSpacingX=n;});
    addSpacing(U"规则 Y 间距",fillPattern_.settings.regularSpacingY,fillPattern_.settings.regularOverlap?-4096:0,4096,[this](int n){fillPattern_.settings.regularSpacingY=n;});
    addSpacing(U"随机间距",fillPattern_.settings.randomSpacing,0,4096,[this](int n){fillPattern_.settings.randomSpacing=n;});
    auto at=fillImageButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();
  }
  void createFillPatternOptions(){
    fillTextureButton_=button(U"纯色",[this]{PixelMenu menu(skin_);const char32_t* names[]{U"纯色",U"裂纹",U"木纹",U"颗粒"};for(int i=0;i<4;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->checked=[this,i]{return int(fillPattern_.texture)==i;};item->Click.connect([this,i]{fillPattern_.texture=FillTexture(i);saveBrushPreferences();refresh();});menu.addChild(item);}const auto at=fillTextureButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});fillControls_.push_back({fillTextureButton_,48});
    fillTextureScale_=new PixelEntry(font_,skin_);fillTextureScale_->numeric=true;addChild(fillTextureScale_);fillControls_.push_back({fillTextureScale_,32});auto scale=[this]{try{fillPattern_.textureScale=std::clamp(std::stoi(fillTextureScale_->text()),1,16);saveBrushPreferences();}catch(...){}layoutToolOptions();};fillTextureScale_->Change.connect(scale);fillTextureScale_->blur=scale;fillTextureScale_->accept=[this,scale]{scale();requestFocus();};
    fillImageButton_=button(U"图案",[this]{showFillLibraryMenu();});fillControls_.push_back({fillImageButton_,48});
  }
  void createEyedropperOptions(){
    // localStorage preference becomes the existing native preference directory.
    try{std::ifstream in(palettePreferencePath().parent_path()/"eyedropper-source.txt");std::string value;if(in>>value && value=="current-layer")eyedropperSource_=EyedropperSource::CurrentLayer;}catch(const std::exception& e){status_=U"吸管设置读取失败："+unicodeText(e.what());}
    eyedropperSourceButton_=button(U"合成图像",[this]{PixelMenu menu(skin_);for(int i=0;i<2;++i){auto item=new PixelMenuItem(font_,skin_,i?U"当前图层":U"合成图像");item->checked=[this,i]{return eyedropperSource_==(i?EyedropperSource::CurrentLayer:EyedropperSource::Composite);};item->Click.connect([this,i]{eyedropperSource_=i?EyedropperSource::CurrentLayer:EyedropperSource::Composite;try{if(!smoke_){const auto path=palettePreferencePath().parent_path()/"eyedropper-source.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out.exceptions(std::ios::failbit|std::ios::badbit);out<<(i?"current-layer":"composite");}}catch(const std::exception& e){status_=U"吸管设置保存失败："+unicodeText(e.what());}refresh();});menu.addChild(item);}const auto at=eyedropperSourceButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
  }
  void showToolGroup(std::size_t index,bool smoke=false) {
    if(floatingDragging_ || (selectionDragging_ && selectionKind_==5))return;
    if(pending_!=Pending::None) return;
    PixelMenu popup(skin_);
    for(const auto& tool:legacyToolGroups()[index]) {
      const bool available=std::string(tool.id)=="eyedropper" || tool.command>=0 || index==3 || std::string(tool.id)=="line.line" || std::string(tool.id)=="shape.rectangle-outline" || std::string(tool.id)=="shape.rectangle" || std::string(tool.id)=="shape.ellipse-outline" || std::string(tool.id)=="shape.ellipse" || (std::string(tool.id)=="fill.bucket" || std::string(tool.id)=="fill.gradient");
      auto item=new PixelMenuItem(font_,skin_,std::u32string(tool.label)+(available?U"":U" · 未接入"));
      item->iconSkin=&toolIcons_;item->icon=std::string(tool.icon)+"-normal";
      item->setEnabled(available);
      item->checked=[this,id=std::string(tool.id)]{return activeRailTool()==id;};
      if(available) item->Click.connect([this,command=tool.command,id=std::string(tool.id)]{if(id=="eyedropper"){useEyedropperTool();return;}if(id=="line.line" || id=="shape.rectangle-outline" || id=="shape.rectangle" || id=="shape.ellipse-outline" || id=="shape.ellipse"){useShapeTool(id=="line.line"?ShapeKind::Line:id=="shape.rectangle-outline"?ShapeKind::RectangleOutline:id=="shape.rectangle"?ShapeKind::Rectangle:id=="shape.ellipse-outline"?ShapeKind::EllipseOutline:ShapeKind::Ellipse);return;}if(id=="fill.bucket"){useFillTool();return;}if(id=="fill.gradient"){useGradientTool();return;}if(command<0){int kind=id=="selection.ellipse"?1:id=="selection.lasso"?2:id=="selection.polygon-lasso"?3:id=="selection.magic"?4:id=="selection.brush"?5:0;useSelectionTool(kind);return;}document.commitFloatingPaste();cancelStroke();selectionTool_=false;shapeTool_=false;eyedropperTool_=false;gradientTool_=false;fillTool_=false;handTool_=command==5;eraser_=command==2;refresh();});
      popup.addChild(item);
    }

    const auto anchor=toolRail_[index]->bounds();
    bool opened=false;
    ui::Timer closeSmoke(100,this);
    if(smoke) {
      closeSmoke.Tick.connect([&] {
        auto box=dynamic_cast<ui::MenuBox*>(popup.parent());
        if(!box) throw std::runtime_error("Tool group popup did not open");
        opened=true;closeSmoke.stop();box->cancelMenuLoop();
      });
      closeSmoke.start();
    }
    popup.showPopup(gfx::Point(anchor.x2()+uiGap*uiScale,anchor.y),display());
    if(smoke && !opened) throw std::runtime_error("Tool group closed before validation");
    requestFocus();
  }
  void createToolRail() {
    toolIcons_.colors=skin_.colors;
    for(std::size_t index=0;index<legacyToolGroups().size();++index) {
      const auto& group=legacyToolGroups()[index];
      for(const auto& tool:group) {
        for(const auto* suffix:{"-normal","-normal-disabled"}) {
          const auto name=std::string(tool.icon)+suffix;
          const auto atlas=skin_.assets.patches.find("icon."+name);toolIcons_.assets.patches[name]=atlas==skin_.assets.patches.end()?importSkinPng(assets_/"tool-icons"/(name+".png"),32):atlas->second;
        }
      }
      const auto& first=group.front();
      auto b=first.command>=0?commands_[first.command]:button(first.label,[]{});
      if(first.command<0) commands_.push_back(b);
      b->iconSkin=&toolIcons_;b->icon=std::string(first.icon)+"-normal";
      b->mutedIcon=first.command<0 && index!=3 && index!=4 && index!=5 && index!=6 && index!=9;if(index==4)b->Click.connect([this]{useShapeTool(shapeSpec_.kind==ShapeKind::Line?ShapeKind::Rectangle:shapeSpec_.kind);});if(index==5)b->Click.connect([this]{useShapeTool(ShapeKind::Line);});if(index==6)b->Click.connect([this]{if(rememberGradientTool_)useGradientTool();else useFillTool();});if(index==9)b->Click.connect([this]{useEyedropperTool();});if(index==3)b->Click.connect([this]{useSelectionTool();});
      b->hover=[this,index] {
        const auto& group=legacyToolGroups()[index];
        const auto& primary=group[index==3?selectionKind_:index==6 && rememberGradientTool_?1:0];
        status_=std::u32string(primary.label)+(primary.command<0 && index!=3 && index!=4 && index!=5 && index!=6 && index!=9?U" · 未接入":U"");
        if(group.size()>1) status_+=U" · 单击、长按或右键展开工具组";
        invalidateRect(gfx::Rect(bounds().x,bounds().y2()-36,bounds().w,36));
      };
      if(group.size()>1) {
        b->context=[this,index]{showToolGroup(index);};
        b->openGroup=[this,index]{showToolGroup(index);};
      }
      toolRail_.push_back(b);
    }
  }
public:
  void updatePaletteMouse(std::optional<gfx::Point> position) {
    const auto previous=paletteMousePosition_;
    paletteMousePosition_=position;
    if(previous!=position && layersPanelOpen_) {
      // Filtered display-relative pointer updates also cover the part of the
      // frame lying outside hit widgets, and movements inside a single widget.
      const auto outlines=timelineOutlines();
      const bool changed=std::any_of(outlines.begin(),outlines.end(),[&](const auto& outline){
        auto material=skin_.selectionMaterialBounds(uiPhysical(outline.border));material.offset(bounds().x,bounds().y);
        return (previous && skin_.selectionContains(material,*previous)) != (position && skin_.selectionContains(material,*position));
      });
      const auto l=workspaceLayout(uiLogical(bounds()));
      auto grid=uiPhysical(gfx::Rect(l.workX+5,l.layerTop+37,l.workW-9,l.bottom-l.layerTop-42));grid.offset(bounds().x,bounds().y);
      if(changed || (previous && grid.contains(*previous)) || (position && grid.contains(*position)))invalidateTimelineGrid();
    }
    for(auto swatch:swatches_) if(swatch->active && swatch->isVisible()) swatch->invalidate();
  }
  void smokePaletteMouse(const std::function<void(ui::Message*)>& dispatch) {
    {
      const auto saved=document;document.markSaved();refresh();fitCanvas();
      const auto cleanClose=documentTabClose_->bounds(),cleanNew=documentTabNew_->bounds();
      const auto point=canvas_.center();ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);
      onProcessMessage(&down);
      if(!document.active() || !document.dirty() || documentTabClose_->bounds().x!=cleanClose.x+(3+uiGap)*uiScale || documentTabNew_->bounds().x!=cleanNew.x+(3+uiGap)*uiScale)
        throw std::runtime_error("First stroke did not synchronously lay out dirty tab controls");
      cancelStroke();document=saved;refresh();
    }
    const auto original=document;const auto originalPath=documentPath_;
    document.beginStroke({0,0},0xff123456);document.commitStroke();refresh();
    const auto modified=document.pixels();documentTabClose_->Click();
    if(pending_!=Pending::CloseDocument || !saveBeforeClose_->isVisible())throw std::runtime_error("Tab close bypassed unsaved confirmation");
    resolve(false);if(!documentOpen_ || document.pixels()!=modified)throw std::runtime_error("Cancel tab close changed document");
    documentTabClose_->Click();resolve(true);
    if(documentOpen_ || documentTabClose_->isVisible() || !documentTabNew_->isEnabled())throw std::runtime_error("Tab close did not leave new action available");
    documentTabNew_->Click();if(!documentOpen_ || document.dirty() || !documentTabClose_->isVisible())throw std::runtime_error("New tab action failed");
    const auto l=workspaceLayout(uiLogical(bounds()));
    if(documentTabNew_->bounds().x!=bounds().x+(documentTabWidth(l)-1)*uiScale)throw std::runtime_error("New action detached from document tab");
    document=original;documentPath_=originalPath;refresh();
    for(const auto column:{Column::Palette,Column::Color,Column::Layers,Column::Preview}) {
      PixelMenu menu(skin_);buildColumnContextMenu(menu,column);
      if(menu.children().size()!=(column==Column::Preview?8:6))throw std::runtime_error("Column context entries differ from legacy");
      int index=0;for(auto child:menu.children()) {
        if(auto item=dynamic_cast<PixelMenuItem*>(child))
          if(item->isEnabled()!=(index==0))throw std::runtime_error("Unmigrated column action enabled");
        ++index;
      }
    }
    ui::Message leave(ui::kMouseLeaveMessage);leave.setFromFilter(true);
    dispatch(&leave);
    if(paletteMousePosition_)throw std::runtime_error("Leave retained palette hover");
    ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyNoneModifier,gfx::Point(40,60));
    move.setFromFilter(true);dispatch(&move);
    if(paletteMousePosition_)throw std::runtime_error("Display-less Move acquired palette hover");
    move.setDisplay(display());dispatch(&move);
    if(!paletteMousePosition_ || *paletteMousePosition_!=move.position())throw std::runtime_error("Move changed display-relative coordinates");
    ui::MouseMessage enter(ui::kMouseEnterMessage,move,gfx::Point(50,70));
    enter.setDisplay(display());enter.setFromFilter(true);dispatch(&enter);
    if(!paletteMousePosition_ || *paletteMousePosition_!=enter.position())throw std::runtime_error("Enter changed display-relative coordinates");
    dispatch(&leave);
    if(paletteMousePosition_)throw std::runtime_error("Leave failed to clear palette hover");
  }
  void smokeHome() {
    smoke_=true;const auto saved=document;document.beginStroke({0,0},0xff112233);document.commitStroke();refresh();
    const auto pixels=document.pixels();const auto history=document.historySize();const auto identity=document.identity();
    const auto homePoint=homeButton_->bounds().center();
    if(menuBar_->getMenu()->children().front()!=homeButton_ || std::string(cursorAt(homePoint))!="progress")throw std::runtime_error("Home menu cursor or order mismatch");
    if(documentTabNew_->bounds().y2()>brushSizeInput_->bounds().y || brushSizeInput_->bounds().y2()>canvasViewport().y || brushSizeInput_->bounds().x<canvasViewport().x-Layout::inset*uiScale)throw std::runtime_error("Document tabs/options/canvas order mismatch");
    homeButton_->Click();
    if(std::string(cursorAt(homePoint))!="progress")throw std::runtime_error("Home menu lost progress cursor on home");
    if(!homeOpen_ || document.identity()!=identity || document.pixels()!=pixels || document.historySize()!=history || swatches_[0]->isVisible() || !homeReturn_->isVisible() || !documentTabNew_->isVisible() || !documentTabClose_->isVisible())throw std::runtime_error("Home switch lost project or exposed editor widgets");
    homeActions_[0]->Click();if(pending_!=Pending::New || !homeOpen_)throw std::runtime_error("Home New bypassed dirty guard");
    resolve(false);if(!homeOpen_ || document.pixels()!=pixels)throw std::runtime_error("Home New cancel lost project");
    homeReturn_->Click();if(homeOpen_ || !swatches_[0]->isVisible() || document.pixels()!=pixels)throw std::runtime_error("Home return failed");
    document=saved;refresh();showHome(true);
    const auto original=bounds();for(const auto size:{gfx::Size(720,600),gfx::Size(1280,960)}){setBounds(gfx::Rect(original.origin(),size));if(std::any_of(homeActions_.begin(),homeActions_.end(),[this](auto action){return !bounds().contains(action->bounds());}) || !bounds().contains(homeTabs_[2]->bounds()) || swatches_[0]->isVisible())throw std::runtime_error("Home resize escaped viewport");}
    setBounds(original);refresh();
  }
  const char* selectionTransformCursor(const std::string& hit,const SelectionTransform& target,gfx::Point position) const {
    if(hit.rfind("rotate-",0)==0) {
      // legacy useCanvasCursor: hover follows the displayed corner; rotation
      // capture follows the pointer about the displayed center (six directions).
      const auto center=transformPoint(target,.5,.5);
      const auto point=floatingDragging_?transformCanvasPoint(position):transformPoint(target,hit=="rotate-ne" || hit=="rotate-se"?1:0,hit=="rotate-sw" || hit=="rotate-se"?1:0);
      const double dx=point.x-center.x,dy=point.y-center.y;
      if(std::abs(dy)>0 && std::abs(dx)<=std::abs(dy)*(std::sqrt(2.0)-1))return dy<0?"selection-rotate-n":"selection-rotate-s";
      return dy<0?(dx<0?"selection-rotate-nw":"selection-rotate-ne"):(dx<0?"selection-rotate-sw":"selection-rotate-se");
    }
    if(hit.rfind("shear-",0)==0){const bool horizontal=hit=="shear-n" || hit=="shear-s";const auto a=transformPoint(target,0,0),b=transformPoint(target,horizontal?1:0,horizontal?0:1);const int bucket=(int(std::floor(std::atan2(b.y-a.y,b.x-a.x)*180/3.141592653589793/45+.5))%4+4)%4;return bucket==0?"selection-shear-horizontal":bucket==1?"selection-shear-nwse":bucket==2?"selection-shear-vertical":"selection-shear-nesw";}
    double direction=hit=="n" || hit=="s"?90:hit=="nw" || hit=="se"?45:hit=="ne" || hit=="sw"?-45:0;
    direction+=target.angle;
    if(hit.size()==2 && (target.flipHorizontal || target.flipVertical)) {
      // Legacy flipped corners derive their direction from opposite controls.
      const auto a=transformPoint(target,hit=="ne" || hit=="se"?1:0,hit=="sw" || hit=="se"?1:0);
      const auto b=transformPoint(target,hit=="ne" || hit=="se"?0:1,hit=="sw" || hit=="se"?0:1);
      direction=std::atan2(a.y-b.y,a.x-b.x)*180/3.141592653589793;
    }
    const int bucket=(int(std::floor(direction/45+.5))%4+4)%4;
    return bucket==0?"ew-resize":bucket==1?"nwse-resize":bucket==2?"ns-resize":"nesw-resize";
  }
  const char* selectionCursorAt(gfx::Point position) const {
    if(selectionPivotDragging_)return "move";
    if(!selectionShift_ && !selectionCtrl_ && selectionPivotHit(position))return "default";
    if(floatingDragging_ && transformHandle_.empty())return selectionCopyDrag_?"copy":"move";
    if(selectionBoxDragging_)return "selection-move";
    if(selectionDragging_ && selectionKind_!=5)return "none";
    const auto hit=selectionShift_ && !floatingDragging_?std::string{}:transformHandle_.empty()?transformHit(position):transformHandle_;
    if(!hit.empty())if(auto target=selectionTransformTarget())return selectionTransformCursor(hit,*target,position);
    const int inside=selectionHit(position);
    if(!selectionShift_ && (inside==1 || (inside==2 && (selectionMode_<2 || selectionCtrl_))))
      return selectionCtrl_?"copy":inside==1?"selection-move":"move";
    if(selectionTool_ && selectionKind_==5) {
      if(document.layer().locked || !document.layer().visible)return "unavailable";
      return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);
    }
    const auto p=canvasPoint(position);
    if(p.x>=0 && p.y>=0 && p.x<document.width() && p.y<document.height() && (document.layer().locked || !document.layer().visible))return "unavailable";
    return "none";
  }
  const char* cursorAt(gfx::Point position) const {
    if(homeButton_ && homeButton_->isEnabled() && homeButton_->bounds().contains(position))return "progress";
    if(homeOpen_)return "default";
    if(!documentOpen_)return "default";
    if(pending_==Pending::None && sizeDrag_==SizeDrag::None && previewPanel_ && previewPanel_->isVisible() && (previewPanel_->hasCapture() || previewPanel_->bounds().contains(position)))return previewPanel_->cursorAt(position);
    const auto handle=sizeDrag_==SizeDrag::None?sizeHandleAt(position):sizeDrag_;
    if(handle==SizeDrag::Modal)return panelResizeCursor(sizeDrag_==SizeDrag::None?panelResizeEdges(uiPhysical(modalBounds(uiLogical(bounds()))),position):sizeDragEdges_);
    if(handle==SizeDrag::ModalMove)return "move";
    if(handle==SizeDrag::DockWidth)return "ew-resize";
    if(handle==SizeDrag::ColorSplit || handle==SizeDrag::Timeline)return "ns-resize";
    if(replaceSampling_>=0 && canvasViewport().contains(position))return "eyedropper";if(pending_!=Pending::None) return "default";
    if(pan_.active) return "grabbing";
    if(symmetryDragging_ || (!document.active() && !spaceHeld_ && !handTool_ && symmetryHit(position)))return "move";
    if(eyedropperGesture_.active() || ((eyedropperTool_ || eyedropperHeld_) && canvasViewport().contains(position) && !document.active() && !spaceHeld_))return "eyedropper";
    if(!canvasViewport().contains(position)) return "default";
    if(!document.active() && (spaceHeld_ || handTool_)) return "grab";
    if(selectionPivotDragging_)return "move";if(!selectionShift_ && !selectionCtrl_ && selectionPivotHit(position))return "default";
    if(selectionTool_ || document.floating())return selectionCursorAt(position);
    const auto point=canvasPoint(position);
    const bool inDocument=point.x>=0 && point.y>=0 && point.x<document.width() && point.y<document.height();
    // Current cursor color feedback follows the active ordinary layer; legacy's
    // composited replacement sample resolves to ink or the exposed checker.
    if(eraser_ && inDocument) {
      const auto color=skin_[(point.x/4+point.y/4)%2?"checkerA":"checkerB"];
      return legacyPaintCursor(gfx::getr(color),gfx::getg(color),gfx::getb(color));
    }
    return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);
  }
  bool panelHasCapture() const {return hasCapture() || (previewPanel_ && previewPanel_->hasCapture());}
  void flushPanelGeometry() {
    if(previewPanel_)previewPanel_->flushGeometry();
    flushSizeGeometry();
  }
  ~Editor() override {antsTimer_.stop();sizeTimer_.stop();if(recoveryTimer_){recoveryTimer_->stop();delete recoveryTimer_;}if(recoveryWorker_.valid())recoveryWorker_.wait();}
  Editor(const PixelFont& font,Skin& skin,std::filesystem::path assets,std::function<void()> refreshCursor,std::filesystem::path recoveryRoot={})
    : ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),assets_(std::move(assets)),refreshCursor_(std::move(refreshCursor)) {
    recoveryDirectory_=std::move(recoveryRoot);
    setFocusStop(true); setExpansive(true);
    antsTimer_.Tick.connect([this]{
      if(!document.selection() || !documentOpen_ || homeOpen_ || !isVisible()){antsTimer_.stop();return;}
      antsOffset_=(antsOffset_+1)&7;
      const auto& s=*document.selection();const double scale=canvasScale();
      auto dirty=gfx::Rect(int(std::floor(canvas_.x+s.x*scale))-2,int(std::floor(canvas_.y+s.y*scale))-2,
        int(std::ceil(s.width*scale))+5,int(std::ceil(s.height*scale))+5);
      dirty&=canvasViewport();invalidateRect(dirty);
    });
    recoveryTimer_=new ui::Timer(16,this);recoveryTimer_->Tick.connect([this]{playbackTick();recoveryTick();wandTick();gradientTick();shapeTick();});recoveryTimer_->start();
    commands_.push_back(button(U"新建",[this]{ask(Pending::New);}));
    documentTabNew_=button(U"",[this]{ask(Pending::New);});documentTabNew_->iconSkin=&toolIcons_;documentTabNew_->icon="plus";documentTabNew_->tabAdd=true;
    documentTabClose_=button(U"",[this]{ask(Pending::CloseDocument);});documentTabClose_->iconSkin=&toolIcons_;documentTabClose_->icon="close";documentTabClose_->bareTabIcon=true;
    commands_.push_back(button(U"画笔",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;cancelStroke();selectionTool_=false;shapeTool_=false;eyedropperTool_=false;gradientTool_=false;fillTool_=false;handTool_=false;eraser_=false;updateNavigationCursor();refresh();}));
    commands_.push_back(button(U"橡皮",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;cancelStroke();selectionTool_=false;shapeTool_=false;eyedropperTool_=false;gradientTool_=false;fillTool_=false;handTool_=false;eraser_=true;updateNavigationCursor();refresh();}));
    commands_.push_back(button(U"撤销",[this]{cancelStroke();document.undo();refresh();}));
    commands_.push_back(button(U"重做",[this]{cancelStroke();document.redo();refresh();}));
    commands_.push_back(button(U"手",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;cancelStroke();shapeTool_=false;eyedropperTool_=false;gradientTool_=false;fillTool_=false;handTool_=true;updateNavigationCursor();refresh();}));
    createToolRail();
    loadPaletteSize();
    try{const auto path=palettePreferencePath().parent_path()/"onion-skin.txt";if(std::filesystem::exists(path)){std::ifstream in(path);if(!(in>>onion_.enabled>>onion_.allLayers>>onion_.showDuringPlayback>>onion_.previousFrames>>onion_.nextFrames>>onion_.previousOpacity>>onion_.nextOpacity>>onion_.previousColor>>onion_.nextColor))throw std::runtime_error("Invalid onion skin preferences");onion_.previousFrames=std::clamp(onion_.previousFrames,0,8);onion_.nextFrames=std::clamp(onion_.nextFrames,0,8);onion_.previousOpacity=std::clamp(onion_.previousOpacity,0,100);onion_.nextOpacity=std::clamp(onion_.nextOpacity,0,100);}}catch(const std::exception& e){onion_={};status_=U"洋葱皮偏好读取失败："+unicodeText(e.what());}
    try {recentColors_.load(palettePreferencePath().parent_path()/"recent-colors.txt");} catch(const std::exception&) {status_=U"最近颜色读取失败";}
    for(const auto icon:{"extractColors","properties","lock","unlock","undo","redo","dither","image","checkboxUnchecked","more","brush-round","brush-square","brush-line","ink-simple","pressure-dynamics","symmetry-horizontal","symmetry-vertical","symmetry-diagonal-up","symmetry-diagonal-down","symmetry-rotational","close","plus","eye","eyeOff","delete","playback-first","playback-previous","playback-play","playback-pause","playback-next","playback-last","right","check","copy","link","onion","animation-auto-link-off","animation-auto-link-on","newFolder","gradientMap","tilemap","freeTile","linkedLayer","convertTo","mergeDown","mergeVisible","clippingMask","layerMask","layerStyle","paste","clearRecords","info","swap","move","home","folderOpen","save","selection-pivot","gradient-linear","gradient-radial","gradient-stop"}) for(const auto suffix:{"","-disabled"}) {
      const auto name=std::string(icon)+suffix;const auto atlas=skin_.assets.patches.find("icon."+name);toolIcons_.assets.patches[name]=atlas==skin_.assets.patches.end()?importSkinPng(assets_/"utility-icons"/(name+".png"),32):atlas->second;
    }
    for(const auto icon:{"selection-replace","selection-add","selection-subtract","selection-intersect","selection-shrink","selection-pivot-preset-0","selection-pivot-preset-1","selection-pivot-preset-2","selection-pivot-preset-3","selection-pivot-preset-4","selection-pivot-preset-5","selection-pivot-preset-6","selection-pivot-preset-7","selection-pivot-preset-8"})for(const auto suffix:{"","-disabled"}){const auto name=std::string(icon)+suffix;toolIcons_.assets.patches[name]=importSkinPng(assets_/"utility-icons"/(name+".png"),32);}
    for(const auto icon:{"playback-first","playback-previous","playback-play","playback-next","playback-last","onion","plus","delete","plus","newFolder","lock","link"}){const auto index=timelineInactive_.size();auto b=button(U"",[this,index]{switch(index){case 0:seekFrame(0);break;case 1:seekFrame(document.activeFrameIndex()?document.activeFrameIndex()-1:0);break;case 2:togglePlayback();break;case 3:seekFrame(std::min(document.activeFrameIndex()+1,document.timeline().state().frames.size()-1));break;case 4:seekFrame(document.timeline().state().frames.size()-1);break;case 5:toggleOnion();break;case 6:frameAction(1);break;case 7:frameAction(2);break;case 8:playing_=false;document.addLayer();refresh();break;}});b->iconSkin=&toolIcons_;b->icon=icon;b->skinStyle=index<10?"icon_button":"timeline-row";if(index<10){b->iconGroupIndex=int(index<5?index:index<8?index-5:index-8);b->iconGroupCount=index<5?5:3;}timelineInactive_.push_back(b);if(index==5)b->context=[this]{showOnionMenu();};}
    layerEye_=button(U"",[this]{document.selectLayer(document.timeline().state().layers.front().id);document.setLayerVisible(!document.layer().visible);refresh();});layerEye_->iconSkin=&toolIcons_;layerEye_->skinStyle="timeline-row";
    layerRow_=button(document.layer().name,[]{});
    layerRow_->skinStyle="timeline-row";
    layerRow_->doubleClick=[this]{showLayerOpacity();};
    layerProperties_=button(U"",[this]{showLayerOpacity();});layerProperties_->iconSkin=&toolIcons_;layerProperties_->icon="properties";layerProperties_->skinStyle="icon_button";layerProperties_->iconGroupIndex=2;layerProperties_->iconGroupCount=3;
    layerHeaderOpacity_=new PixelSlider(font_,skin_);addChild(layerHeaderOpacity_);
    layerHeaderOpacity_->interactionBegin=[this]{document.beginLayerOpacity();};
    layerHeaderOpacity_->changed=[this](int value){document.previewLayerOpacity(value/100.0);invalidate();};
    layerHeaderOpacity_->interactionCommit=[this]{document.commitLayerOpacity();refresh();};
    layerHeaderOpacity_->interactionCancel=[this]{document.cancelLayerOpacity();refresh();};
    createToolOptions();createGradientOptions();createShapeOptions();createEyedropperOptions();
    try{std::ifstream in(palettePreferencePath().parent_path()/"symmetry.txt");if(in){for(int i=0;i<5;++i)in>>symmetryFlag(i);in>>symmetryLocked_>>symmetryThickness_>>symmetryColor_;symmetryThickness_=std::clamp(symmetryThickness_,1,8);persistedSymmetryAxes_=document.symmetryAxes;symmetryInitialized_=symmetryHas(document.symmetryAxes);}}catch(const std::exception& e){status_=U"对称偏好读取失败："+unicodeText(e.what());}createFillPatternOptions();
    paletteActions_=button(U"",[this]{showPaletteActions();});
    paletteActions_->iconSkin=&toolIcons_;paletteActions_->icon="properties";
    paletteActions_->hover=[this]{status_=U"颜色尺寸 · Ctrl + 滚轮调整";invalidate();};
    paletteLock_=button(U"",[this]{togglePaletteLock();});paletteLock_->iconSkin=&toolIcons_;
    paletteLock_->hover=[this]{status_=paletteLocked_?U"锁定：改变角色颜色不修改色卡":U"解锁：改变已绑定的角色颜色会修改色卡";invalidate();};
    primaryRole_=button(U"",[this]{openPaletteEditor(0,false);});
    secondaryRole_=button(U"",[this]{openPaletteEditor(0,true);});
    primaryRole_->hover=[this]{status_=U"前景色 · 点击编辑 HEX";invalidate();};
    secondaryRole_->hover=[this]{status_=U"背景色 · 点击编辑 HEX";invalidate();};
    extractNameInput_=new PixelEntry(font_,skin_);addChild(extractNameInput_);extractNameInput_->setVisible(false);extractNameInput_->accept=[this]{resolve(true);};extractNameInput_->cancel=[this]{resolve(false);};
    extractModeButton_=button(U"新建",[this]{PixelMenu menu(skin_);const char32_t* labels[]{U"新建",U"替换",U"追加"};for(int i=0;i<3;++i){auto item=new PixelMenuItem(font_,skin_,labels[i]);item->checked=[this,i]{return extractMode_==i;};item->Click.connect([this,i]{extractMode_=i;layoutModal();invalidate();});menu.addChild(item);}const auto at=extractModeButton_->bounds();menu.showPopup({at.x,at.y2()},display());});extractModeButton_->setVisible(false);
    createAdjustmentControls();
    createReplaceControls();createResizeControls();createStaticExportControls();createSpriteSheetControls();createGifExportControls();createExportFormatControl();createSheetImportControls();
    paletteInput_=new PixelEntry(font_,skin_);addChild(paletteInput_);paletteInput_->setVisible(false);
    for(auto& input:loopInputs_){input=new PixelEntry(font_,skin_);input->numeric=&input!=&loopInputs_[0];addChild(input);input->setVisible(false);input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}
    loopDirection_=button(U"",[this]{const char* directions[]{"forward","reverse","ping-pong","ping-pong-reverse"};int index=0;for(int i=0;i<4;++i)if(loopDraft_->direction==directions[i])index=i;loopDraft_->direction=directions[(index+1)%4];updateLoopDirection();invalidate();});loopDirection_->setVisible(false);
    paletteInput_->accept=[this]{resolve(pending_==Pending::BrushFolderName || pending_==Pending::PaletteName || pending_==Pending::PaletteExtract || pending_==Pending::LayerOpacity);};
    paletteInput_->Change.connect([this]{if(pending_==Pending::OnionValue)previewOnionValue();if(pending_==Pending::FrameDuration){try{std::size_t used=0;const int value=std::stoi(paletteInput_->text(),&used);if(used==paletteInput_->text().size())document.previewFrameDuration(value);}catch(const std::exception&){} }});
    paletteInput_->cancel=[this]{resolve(false);};
    paletteInput_->blur=[this]{if(pending_==Pending::ColorRole) commitPaletteHex();};
    panelTabs_.push_back(button(U"颜色板",[this]{cancelStroke();refresh();}));
    panelTabs_[0]->context=[this]{showColumnContextMenu(Column::Palette);};
    const char* topIcons[]{"plus","folderOpen","save","copy","image"};
    for(int i=0;i<5;++i){topActions_[i]=button(i==4?U"导出":U"",[this,i]{switch(i){case 0:ask(Pending::New);break;case 1:chooseProject();break;case 2:menuCommands_.invoke("save");break;case 3:menuCommands_.invoke("saveAs");break;case 4:openDocumentExport();break;}});topActions_[i]->iconSkin=&toolIcons_;topActions_[i]->icon=topIcons[i];topActions_[i]->iconWithCaption=i==4;topActions_[i]->iconGroupCount=i<4?4:0;topActions_[i]->iconGroupIndex=i;}

    colorPicker_=new NativeColorPicker(font_,skin_,assets_/"color-picker");addChild(colorPicker_);colorPicker_->setVisible(false);
    colorPicker_->changed=[this](Pixel color,bool secondary){document.setPaletteRole(color,secondary,paletteLocked_);refresh();};
    pickerPrimary_=button(U"",[this]{openPaletteEditor(0,false);});pickerPrimary_->colorRole=true;
    pickerSecondary_=button(U"",[this]{openPaletteEditor(0,true);});pickerSecondary_->colorRole=true;
    pickerAdd_=button(U"",[this]{document.addPaletteColor(document.palette().primary,paletteLocked_);refresh();});
    pickerAdd_->iconSkin=&toolIcons_;pickerAdd_->icon="plus";
    colorPicker_->interactionBegin=[this]{if(!gradientPending_)cancelStroke();paletteFocused_=false;};
    for(auto b:panelTabs_) b->tab=true;
    panelTabs_[0]->firstTab=true;
    dialogClose_=button(U"",[this]{resolve(false);});dialogClose_->iconSkin=&toolIcons_;dialogClose_->icon="close";
    discard_=button(U"丢弃",[this]{resolve(true);}); keep_=button(U"取消",[this]{resolve(false);});
    saveBeforeClose_=button(U"保存",[this]{if(saveProject(false))resolve(true);});
    dialogClose_->setVisible(false);saveBeforeClose_->setVisible(false);
    discard_->setVisible(false); keep_->setVisible(false); refresh();
    layerOpacityRange_=new PixelSlider(font_,skin_);addChild(layerOpacityRange_);layerOpacityRange_->setVisible(false);
    layerOpacityRange_->changed=[this](int value){document.previewLayerOpacity(value/100.0);invalidate();};
    brushRange_=new PixelSlider(font_,skin_);addChild(brushRange_);brushRange_->setVisible(false);
    brushRange_->changed=[this](int value){
      auto& profile=brushProfiles_[eraser_?1:0];(brushRangeOpacity_?profile.opacity:profile.size)=value;
      updatingBrushFields_=true;(brushRangeOpacity_?brushOpacityInput_:brushSizeInput_)->setText(std::to_string(value));updatingBrushFields_=false;
      saveBrushPreferences();invalidate();
    };
    menuBar_=new ui::MenuBar(ui::MenuBar::ProcessTopLevelShortcuts::kNo);
    auto root=new PixelMenu(skin_);root->setBorder(gfx::Border(0));
    menuBar_->setMenu(root);addChild(menuBar_);
    homeButton_=new PixelMenuItem(font_,skin_,U"首页");
    homeButton_->available=[this]{return pending_==Pending::None && !document.active();};
    homeButton_->Click.connect([this]{showHome(true);});root->addChild(homeButton_);
    auto group=[&](std::u32string title,bool enabled=true) {
      auto item=new PixelMenuItem(font_,skin_,std::move(title));auto menu=new PixelMenu(skin_);
      item->setSubmenu(menu);item->setEnabled(enabled);root->addChild(item);return menu;
    };
    auto item=[&](PixelMenu* menu,const std::string& id,std::u32string title,std::u32string shortcut,
                  std::function<void()> action,std::function<bool()> enabled={},std::function<bool()> checked={}) {
      auto entry=new PixelMenuItem(font_,skin_,std::move(title),std::move(shortcut));
      entry->menuMarks=&toolIcons_;
      entry->available=[this,enabled,id]{return pending_==Pending::None && (documentOpen_ && !homeOpen_ || id=="newDocument" || id=="openDocument" || id=="closeWindow" || id.find("toggle")==0) && (!enabled || enabled());};
      entry->checked=std::move(checked);
      entry->Click.connect([this,entry,action]{if(entry->available()) {cancelStroke();action();refresh();}});
      menu->addChild(entry);menuItems_[id]=entry;
    };
menuCommands_.bind("replaceColor",{[this]{openReplaceColor();},{},{}});
menuCommands_.bind("importSpriteSheet",{[this]{chooseSheetSource();},{},{}});
menuCommands_.bind("importSpriteSheetDocument",{[this]{openSheetImport(false);},{},{}});
menuCommands_.bind("importSpriteSheetSelection",{[this]{openSheetImport(true);},[this]{return document.selection().has_value();},{}});
menuCommands_.bind("exportSpriteSheet",{[this]{openSpriteSheet();},{},{}});
menuCommands_.bind("exportDocument",{[this]{openDocumentExport();},{},{}});
menuCommands_.bind("imageResize",{[this]{openImageResize();},{},{}});
menuCommands_.bind("invertColors",{[this]{if(document.beginColorAdjustment()){ColorAdjustment a;a.kind=ColorAdjustmentKind::Invert;document.updateColorAdjustment(a);document.commitColorAdjustment();refresh();}},{},{}});
menuCommands_.bind("adjustmentBrightnessContrast",{[this]{openColorAdjustment(ColorAdjustmentKind::BrightnessContrast);},{},{}});
menuCommands_.bind("adjustmentHueSaturation",{[this]{openColorAdjustment(ColorAdjustmentKind::HueSaturation);},{},{}});
menuCommands_.bind("transform",{[this]{beginLayerTransform();},[this]{return !document.layer().locked && document.layer().visible;},{}});
menuCommands_.bind("newLayer",{[this]{document.addLayer();},{},{}});
menuCommands_.bind("duplicateLayer",{[this]{document.duplicateLayer();refresh();},[this]{return !document.layer().locked;},{}});
menuCommands_.bind("mergeDown",{[this]{try{document.mergeLayerDown();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},{[this]{return document.activeLayerIndex()+1<document.timeline().state().layers.size()&&!document.layer().locked;}},{}});
menuCommands_.bind("deleteLayer",{[this]{document.deleteLayer();},[this]{return document.timeline().state().layers.size()>1 && !document.layer().locked;},{}});
menuCommands_.bind("editDelete",{[this]{document.deleteLayer();},[this]{return document.timeline().state().layers.size()>1 && !document.layer().locked;},{}});
menuCommands_.bind("newDocument",{[this]{ask(Pending::New);},{},{}});
menuCommands_.bind("openDocument",{[this]{chooseProject();},{},{}});
menuCommands_.bind("save",{[this]{saveProject(false);},{},{}});
menuCommands_.bind("saveAs",{[this]{saveProject(true);},{},{}});
menuCommands_.bind("undo",{[this]{document.undo();},[this]{return document.canUndo();},{}});
menuCommands_.bind("redo",{[this]{document.redo();},[this]{return document.canRedo();},{}});
// Preferences and layer properties are partial migrations: title/description in
// the destination dialog must state recovery-only and opacity-only coverage.
menuCommands_.bind("openPreferences",{[this]{showRecoveryPreferences();},{},{}});
menuCommands_.bind("openLayerProperties",{[this]{showLayerOpacity();},{},{}});
menuCommands_.bind("resetView",{[this]{
 zoom_=16; const auto viewport=canvasViewport();
 const int width=int(std::lround(document.width()*canvasScale()));
 const int height=int(std::lround(document.height()*canvasScale()));
 canvas_=gfx::Rect(viewport.x+(viewport.w-width)/2,viewport.y+(viewport.h-height)/2,width,height);
 invalidate();
},{},{}});
menuCommands_.bind("toggleColorPanel",{[this]{colorPicker_->finishInteraction();colorPickerOpen_=!colorPickerOpen_;refresh();},{},[this]{return colorPickerOpen_;}});
menuCommands_.bind("toggleLayersPanel",{[this]{layersPanelOpen_=!layersPanelOpen_;refresh();},{},[this]{return layersPanelOpen_;}});
menuCommands_.bind("togglePalettePanel",{[this]{palettePanelOpen_=!palettePanelOpen_;refresh();},{},[this]{return palettePanelOpen_;}});
menuCommands_.bind("togglePreviewPanel",{[this]{previewPanelOpen_=!previewPanelOpen_;refresh();},{},[this]{return previewPanelOpen_;}});
menuCommands_.bind("freeTransform",{[this]{startFreeSelectionTransform();},[this]{return bool(document.selection());},{}});
menuCommands_.bind("selectAll",{[this]{document.selectAllPixels();refresh();},{}, {}});
menuCommands_.bind("deselect",{[this]{document.deselectPixels();refresh();},[this]{return bool(document.selection());},{}});
menuCommands_.bind("invertSelection",{[this]{document.invertPixels();refresh();},[this]{return bool(document.selection());},{}});
menuCommands_.bind("copy",{[this]{copySelectionPixels(false);},[this]{return pixelClipboardContext() && bool(document.selection());},{}});
menuCommands_.bind("cut",{[this]{copySelectionPixels(true);},[this]{return pixelClipboardContext() && bool(document.selection());},{}});
menuCommands_.bind("paste",{[this]{pasteSelectionPixels();},[this]{return pixelClipboardContext();},{}});
// Existing item(...) helper owns pending/dialog checks and cancelStroke.
// Do NOT recreate skin/editor entries. Keep external theme runtime loading.
std::function<void(PixelMenu*,const std::string&)> appendChildren=[&](PixelMenu* parent,const std::string& id){
 if(id=="recent" || id=="scripts"){auto empty=new PixelMenuItem(font_,skin_,id=="recent"?U"没有最近文件":U"没有可用脚本");empty->setEnabled(false);parent->addChild(empty);}
 for(const auto& e:menus::catalog())if(id==e.parent){
  if(e.separatorBefore && !parent->children().empty())parent->addChild(new PixelMenuSeparator(skin_));
  if(e.group){auto branch=new PixelMenu(skin_);
   auto trigger=new PixelMenuItem(font_,skin_,e.title);trigger->menuMarks=&toolIcons_;trigger->setSubmenu(branch);parent->addChild(trigger);appendChildren(branch,e.id);
  }else{
   const std::string command=e.id;
   item(parent,command,e.title,unicodeText(e.shortcut),[this,command]{menuCommands_.invoke(command);},[this,command]{return menuCommands_.enabled(command);},[this,command]{return menuCommands_.checked(command);});
  }
 }
};
PixelMenu* fileMenu=nullptr;
for(const auto& e:menus::catalog())if(!*e.parent){if(std::string(e.id)=="help"){auto pet=new PixelMenuItem(font_,skin_,U"宠物");pet->setEnabled(false);root->addChild(pet);}auto branch=group(e.title);if(std::string(e.id)=="file")fileMenu=branch;appendChildren(branch,e.id);}

    item(fileMenu,"recovery",U"恢复工程",U"",[this]{chooseRecovery();});
    menuItems_["new"]=menuItems_.at("newDocument");menuItems_["open"]=menuItems_.at("openDocument");
    sizeTimer_.Tick.connect([this]{flushSizeGeometry();});
    previewPanel_=new PreviewPanel(font_,skin_,toolIcons_,document);addChild(previewPanel_);
    previewPanel_->context=[this]{showColumnContextMenu(Column::Preview);};
    previewPanel_->closed=[this]{previewPanelOpen_=false;refresh();};
    previewPanel_->geometryChanged=[this]{saveWorkspaceSizes();updateNavigationCursor();};
    loadWorkspaceSizes();
    try {recoveryPreferences_=recovery::loadPreferences(recoveryDirectory().parent_path()/"recovery-preferences.txt");recoveryQueue_.setIntervalMinutes(recoveryPreferences_.minutes);recoveryDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(recoveryPreferences_.minutes*60000));}catch(const std::exception&e){status_=U"恢复设置读取失败："+unicodeText(e.what());}loadRecoveries(true);createHome();refresh();
  }
  void requestClose() { ask(Pending::Close); }
  void smokeSelectionCursors() {
    smoke_=true;document=Document(32,32);document.previewSelection(SelectionMask{8,8,16,16,{}});
    canvas_=gfx::Rect(100,100,256,256);zoom_=4;selectionTool_=true;eyedropperTool_=false;
    const gfx::Point center(228,228),edge(164,196),outside(120,120);
    auto expect=[&](gfx::Point p,const char* id){if(std::string(selectionCursorAt(p))!=id)throw std::runtime_error(std::string("Selection cursor mismatch: ")+id);};
    expect(center,"move");expect(edge,"selection-move");selectionCtrl_=true;expect(center,"copy");selectionCtrl_=false;
    selectionBoxDragging_=selectionDragging_=true;expect(outside,"selection-move");selectionBoxDragging_=selectionDragging_=false;
    floatingDragging_=true;selectionCopyDrag_=true;expect(outside,"copy");selectionCtrl_=false;expect(center,"copy");selectionCopyDrag_=false;expect(edge,"move");floatingDragging_=false;
    SelectionTransform target{0,0,100,100};
    for(auto pair:std::vector<std::pair<std::string,const char*>>{{"n","ns-resize"},{"e","ew-resize"},{"nw","nwse-resize"},{"ne","nesw-resize"}})
      if(std::string(selectionTransformCursor(pair.first,target,center))!=pair.second)throw std::runtime_error("Legacy resize direction mismatch");
    target.angle=90;if(std::string(selectionTransformCursor("rotate-ne",target,center))!="selection-rotate-se")throw std::runtime_error("Rotated corner cursor mismatch");
    target.angle=0;floatingDragging_=true;
    for(auto pair:std::vector<std::pair<gfx::Point,const char*>>{{{500,100},"selection-rotate-n"},{{900,100},"selection-rotate-ne"},{{900,900},"selection-rotate-se"},{{500,900},"selection-rotate-s"},{{100,900},"selection-rotate-sw"},{{100,100},"selection-rotate-nw"}})
      if(std::string(selectionTransformCursor("rotate-ne",target,pair.first))!=pair.second)throw std::runtime_error("Rotation drag six-direction cursor mismatch");
    floatingDragging_=false;document.deselectPixels();selectionKind_=5;expect(outside,legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255));
    document.setLayerLocked(true);expect(outside,"unavailable");
  }
  void smokeAnts(const std::filesystem::path& output) {
    smoke_=true;document=Document(32,24);document.previewSelection(SelectionMask{2,2,24,16,{}});
    const gfx::Rect area(0,0,320,240),cv(8,8,256,192);const auto history=document.historySize();
    for(double scale:{.5,1.0,2.0,8.0}) {
      zoom_=scale/uiScale;
      auto render=[&](int phase){auto surface=os::instance()->makeRgbaSurface(area.w,area.h);surface->clear();ui::Graphics g(surface);paintSelectionAnts(g,cv,area,phase);return surface;};
      auto first=render(0),inverse=render(4),cycle=render(8);
      const int y=int(cv.y+2*scale),left=int(cv.x+2*scale);int changes=0;
      for(int x=left+2;x<left+int(24*scale)-2;++x) {
        const auto a=first->getPixel(x,y),b=inverse->getPixel(x,y);
        if(a!=gfx::rgba(0,0,0,255) && a!=gfx::rgba(255,255,255,255))throw std::runtime_error("Ants stroke is not opaque black/white");
        if(a==b || a!=cycle->getPixel(x,y))throw std::runtime_error("Ants phase inversion/cycle failed");
        if(a!=first->getPixel(x-1,y))++changes;
        if(first->getPixel(x,y+1)!=0)throw std::runtime_error("Ants stroke exceeded one device pixel");
      }
      if(changes<1)throw std::runtime_error("Ants pattern scaled with document pixels");
      if(scale==8)writeSmokeFrame(first.get(),output/"ants-smoke.bmp");
    }
    SelectionMask hole{2,2,12,12,std::vector<unsigned char>(144,1)};
    for(int y=4;y<8;++y)for(int x=4;x<8;++x)hole.mask[y*12+x]=0;
    document.previewSelection(hole);zoom_=2.0/uiScale;
    auto surface=os::instance()->makeRgbaSurface(area.w,area.h);surface->clear();
    {ui::Graphics g(surface);paintSelectionAnts(g,cv,area,0);}
    if(surface->getPixel(cv.x+14,cv.y+12)==0 || surface->getPixel(cv.x+14,cv.y+14)!=0)throw std::runtime_error("Ants hole boundary failed");
    if(document.historySize()!=history || document.dirty())throw std::runtime_error("Ants rendering mutated document");
  }
  void smokeWorkspace() {
    smoke_=true;dockWidth_=0;paletteShare_=0;timelineHeight_=109;modalGeometry_.clear();
    smokePointerPopup();
    const auto pixels=document.pixels();const auto history=document.historySize();const auto dirty=document.dirty();
    const auto original=bounds();const auto scale=zoom_;
    for(int i=0;i<4;++i)if(topActions_[i]->bounds().w!=15*uiScale || topActions_[i]->bounds().h!=16*uiScale || topActions_[i]->bounds().y<bounds().y || topActions_[i]->bounds().y2()>bounds().y+Layout::menuHeight*uiScale)throw std::runtime_error("Top action dimensions");
    for(const auto size:{gfx::Size(720,600),gfx::Size(1280,960),gfx::Size(1600,1000)}) {
      setBounds(gfx::Rect(original.x,original.y,size.w,size.h));refresh();
      const auto dock=paletteContentBounds(),picker=colorPicker_->bounds(),view=canvasViewport();
      if(dock.x<=toolRail_[0]->bounds().x2() || dock.x2()>=view.x || picker.x<=toolRail_[0]->bounds().x2() || picker.x2()>=view.x)
        throw std::runtime_error("Color panels are not between tool rail and canvas");
      if(!bounds().contains(previewPanel_->bounds()) || !previewPanel_->isVisible() || !swatches_[0]->isVisible())
        throw std::runtime_error("Floating preview hides palette or exceeds workspace");
    }
    setBounds(original);refresh();const auto initial=previewPanel_->bounds();
    auto mouse=[&](ui::MessageType type,gfx::Point point) {
      ui::MouseMessage event(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);
      previewPanel_->onProcessMessage(&event);
    };
    const gfx::Point header(initial.x+20,initial.y+12);
    if(std::string(cursorAt(header))!="move")throw std::runtime_error("Preview title did not use legacy move cursor");
    mouse(ui::kMouseDownMessage,header);
    if(std::string(cursorAt(header))!="move")throw std::runtime_error("Preview dragging did not use legacy move cursor");
    mouse(ui::kMouseUpMessage,header);
    mouse(ui::kMouseDownMessage,header);mouse(ui::kMouseMoveMessage,header+gfx::Point(-40,-30));mouse(ui::kMouseUpMessage,header+gfx::Point(-40,-30));
    if(previewPanel_->bounds().origin()!=initial.origin()+gfx::Point(-40,-30))throw std::runtime_error("Preview title drag failed");
    const auto moved=previewPanel_->bounds();const gfx::Point corner(moved.x2()-2,moved.y2()-2);
    mouse(ui::kMouseDownMessage,corner);mouse(ui::kMouseMoveMessage,corner+gfx::Point(20,20));mouse(ui::kMouseUpMessage,corner+gfx::Point(20,20));
    const auto resized=previewPanel_->bounds();
    if(resized.w!=moved.w+20 || resized.h!=moved.h+20)throw std::runtime_error("Preview corner resize failed");
    previewPanel_->closePanel();if(previewPanelOpen_ || previewPanel_->isVisible())throw std::runtime_error("Preview close failed");
    menuCommands_.invoke("togglePreviewPanel");
    if(!previewPanel_->isVisible() || previewPanel_->bounds()!=resized || !swatches_[0]->isVisible())throw std::runtime_error("Preview reopen lost geometry or palette");
    const auto preciseStart=previewPanel_->bounds();const gfx::Point preciseHeader(preciseStart.x+20,preciseStart.y+12);
    mouse(ui::kMouseDownMessage,preciseHeader);mouse(ui::kMouseMoveMessage,preciseHeader+gfx::Point(9,0));flushPanelGeometry();
    if(previewPanel_->bounds().x!=preciseStart.x+9)throw std::runtime_error("Preview drag quantized device-pixel position");
    mouse(ui::kMouseMoveMessage,preciseHeader+gfx::Point(10,0));flushPanelGeometry();
    if(previewPanel_->bounds().x!=preciseStart.x+10)throw std::runtime_error("Preview one-pixel continuation failed");
    mouse(ui::kMouseUpMessage,preciseHeader+gfx::Point(10,0));
    auto drag=[&](gfx::Point point,gfx::Point delta) {
      const auto count=sizeLayoutUpdates_;
      for(int i=0;i<=201;++i) {
        const auto type=i==0?ui::kMouseDownMessage:i==201?ui::kMouseUpMessage:ui::kMouseMoveMessage;
        const auto at=point+gfx::Point(delta.x*std::min(i,200)/200,delta.y*std::min(i,200)/200);
        ui::MouseMessage event(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,at);
        onProcessMessage(&event);
        if(i<=200 && sizeLayoutUpdates_!=count)throw std::runtime_error("Resize burst performed redundant layout before frame flush");
      }
      if(sizeLayoutUpdates_>count+1)throw std::runtime_error("Resize burst was not coalesced");
      if(hasCapture() || sizeDrag_!=SizeDrag::None)throw std::runtime_error("Resize capture did not release");
    };
    auto l=workspaceLayout(uiLogical(bounds()));
    gfx::Point edge((l.rightX+l.right)*uiScale,(l.top+10)*uiScale);
    if(std::string(cursorAt(edge))!="ew-resize")throw std::runtime_error("Dock resize cursor missing");
    drag(edge,gfx::Point(40,0));if(workspaceLayout(uiLogical(bounds())).right!=l.right+20)throw std::runtime_error("Left dock width resize failed");
    l=workspaceLayout(uiLogical(bounds()));edge=gfx::Point((l.rightX+10)*uiScale,l.split*uiScale);
    if(std::string(cursorAt(edge))!="ns-resize")throw std::runtime_error("Panel divider cursor missing");
    drag(edge,gfx::Point(0,40));if(workspaceLayout(uiLogical(bounds())).split!=l.split+20)throw std::runtime_error("Color panel split resize failed");
    l=workspaceLayout(uiLogical(bounds()));edge=gfx::Point((l.workX+10)*uiScale,l.layerTop*uiScale);
    drag(edge,gfx::Point(0,-40));if(workspaceLayout(uiLogical(bounds())).layerTop!=l.layerTop-20)throw std::runtime_error("Timeline resize failed");
    showLayerOpacity();
    for(int edges:{1,2,4,8,5,6,9,10}) {
      const auto before=uiPhysical(modalBounds(uiLogical(bounds())));
      const gfx::Point at(edges&1?before.x+2:edges&2?before.x2()-2:before.x+before.w/2,
                          edges&4?before.y+2:edges&8?before.y2()-2:before.y+before.h/2);
      const gfx::Point delta(edges&1?-20:edges&2?20:0,edges&4?-20:edges&8?20:0);
      if(std::string(cursorAt(at))!=panelResizeCursor(edges))throw std::runtime_error("Modal resize cursor mismatch");
      drag(at,delta);const auto after=uiPhysical(modalBounds(uiLogical(bounds())));
      if((edges&1 && after.x2()!=before.x2()) || (edges&2 && after.x!=before.x) ||
         (edges&4 && after.y2()!=before.y2()) || (edges&8 && after.y!=before.y))throw std::runtime_error("Modal resize lost opposite anchor");
      if((edges&3 && after.w!=before.w+20) || (edges&12 && after.h!=before.h+20))throw std::runtime_error("Modal edge failed to resize: "+std::to_string(edges)+" before "+std::to_string(before.w)+","+std::to_string(before.h)+" after "+std::to_string(after.w)+","+std::to_string(after.h));
      if(!after.contains(keep_->bounds()) || !after.contains(layerOpacityRange_->bounds()))throw std::runtime_error("Resized modal controls escaped frame");
    }
    auto modal=uiPhysical(modalBounds(uiLogical(bounds())));
    drag(gfx::Point(modal.x+2,modal.y+modal.h/2),gfx::Point(5000,0));
    if(modalBounds(uiLogical(bounds())).w!=240)throw std::runtime_error("Modal minimum width failed");
    const auto footer=keep_->bounds();modal=uiPhysical(modalBounds(uiLogical(bounds())));
    drag(gfx::Point(modal.x2()-2,modal.y2()-2),gfx::Point(40,40));
    if(keep_->bounds().y!=footer.y+40 || layerOpacityRange_->bounds().w!=modal.w-8*uiScale+40)throw std::runtime_error("Dialog controls did not reflow");
    const auto savedModals=modalGeometry_;const auto savedPreview=previewPanel_->bounds();
    std::stringstream preferences;writeWorkspaceSizes(preferences);
    const auto savedWidth=dockWidth_,savedHeight=timelineHeight_;const auto savedShare=paletteShare_;
    dockWidth_=0;timelineHeight_=109;paletteShare_=0;modalGeometry_.clear();readWorkspaceSizes(preferences);
    if(dockWidth_!=savedWidth || timelineHeight_!=savedHeight || paletteShare_!=savedShare || modalGeometry_!=savedModals || previewPanel_->bounds()!=savedPreview)
      throw std::runtime_error("Workspace size preferences roundtrip failed");
    std::istringstream invalid("moonsprite-workspace-sizes-v1\ndock -1 2 -1\nmodal layer-opacity 0 0 -1 -1\n");readWorkspaceSizes(invalid);
    if(dockWidth_!=savedWidth || modalGeometry_!=savedModals)throw std::runtime_error("Invalid layout preference replaced valid sizes");
    resolve(false);
    const auto previousError=openError_;const auto previousTitle=errorTitle_;
    std::string longError;for(int i=0;i<80;++i)longError+="A long path or import error must remain readable.\n";
    showSaveError(std::runtime_error(longError));
    std::u32string joined;for(const auto& line:modalErrorLines(220))joined+=line;
    auto expected=openError_;expected.erase(std::remove(expected.begin(),expected.end(),U'\n'),expected.end());
    if(joined!=expected)throw std::runtime_error("Modal wrapping lost error text");
    for(const auto size:{gfx::Size(720,600),gfx::Size(1600,1000)}) {
      setBounds(gfx::Rect(original.x,original.y,size.w,size.h));modalGeometry_.erase(Pending::OpenError);layoutModal();
      const auto area=uiLogical(bounds());const auto fitted=modalBounds(area);
      if(!area.contains(fitted) || fitted.h>area.h*3/4 || !uiPhysical(fitted).contains(keep_->bounds()) || keep_->bounds().center().x!=uiPhysical(fitted).center().x)
        throw std::runtime_error("Adaptive dialog or centered footer failed");
      ui::MouseMessage wheel(ui::kMouseWheelMessage,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyNoneModifier,uiPhysical(fitted).center(),gfx::Point(0,10000));
      onProcessMessage(&wheel);
      if(modalErrorScroll_!=int(modalErrorLines(fitted.w-20).size())-modalErrorVisibleLines(fitted))throw std::runtime_error("Error overflow cannot reach last line");
      modalGeometry_[Pending::OpenError]=gfx::Rect(-200,-200,3000,3000);layoutModal();
      if(!area.contains(modalBounds(area)))throw std::runtime_error("Saved oversized dialog escaped small window");
    }
    resolve(false);openError_=previousError;errorTitle_=previousTitle;modalGeometry_.erase(Pending::OpenError);setBounds(original);refresh();
    if(document.pixels()!=pixels || document.historySize()!=history || document.dirty()!=dirty || zoom_!=scale)
      throw std::runtime_error("Workspace interactions changed document or canvas scale");
    invalidate();
  }
  void smokePointerPopup() {
    const auto native=display()->nativeWindow();const auto originalFrame=native->frame();
    auto restore=[&]{native->setFrame(originalFrame);};
    try {
      for(const auto origin:{gfx::Point(137,93),gfx::Point(-40,120)}) {
        auto frame=originalFrame;frame.x=origin.x;frame.y=origin.y;native->setFrame(frame);
        for(bool edge:{false,true}) {
          const auto area=display()->bounds();
          const gfx::Point local=edge?gfx::Point(area.x2()-3,area.y2()-3):gfx::Point(100,110);
          const auto screen=native->pointToScreen(local);const auto anchor=pointerMenuPosition(screen);
          if(anchor!=local)throw std::runtime_error("Pointer popup screen/display conversion failed");
          PixelMenu menu(skin_);buildColumnContextMenu(menu,Column::Palette);
          gfx::Rect opened;ui::Timer closeTimer(20,this);
          closeTimer.Tick.connect([&]{closeTimer.stop();menu.window()->closeWindow(this);});
          menu.OpenPopup.connect([&]{opened=menu.window()->bounds();closeTimer.start();});
          menu.showPopup(anchor,display());
          if(opened.isEmpty() || !area.contains(opened))throw std::runtime_error("Pointer popup escaped parent display");
          // Aseprite choose_side overlaps the horizontal anchor by one UI
          // scale unit; retain that fitting behavior while rejecting offsets.
          if(!edge && (std::abs(opened.x-local.x)>uiScale || opened.y!=local.y))throw std::runtime_error("Pointer popup did not open beside pointer in moved window: "+std::to_string(opened.x)+","+std::to_string(opened.y)+" expected near "+std::to_string(local.x)+","+std::to_string(local.y));
        }
      }
      restore();
    }catch(...){restore();throw;}
  }
  void smokeWorkspaceModalPreview() {showLayerOpacity();}
  void smokePreviewRepaintStep(int step) {
    const auto r=previewPanel_->bounds();
    const bool resize=step>=4;
    const gfx::Point point=resize?gfx::Point(r.x2()-2,r.y2()-2):gfx::Point(r.x+20,r.y+12);
    const gfx::Point moves[]{gfx::Point(-180,-120),gfx::Point(280,40),gfx::Point(-100,180),gfx::Point(80,-100),gfx::Point(80,60),gfx::Point(-100,-80)};
    smokePreviewUpdates_=previewPanel_->geometryUpdates();
    smokePreviewBlits_=previewPanel_->blitMoves();smokePreviewPaints_=previewPanel_->paintCount();smokePreviewStep_=step;
    for(int i=0;i<=200;++i) {
      const auto type=i==0?ui::kMouseDownMessage:ui::kMouseMoveMessage;
      ui::MouseMessage message(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point+gfx::Point(moves[step].x*i/200,moves[step].y*i/200));
      previewPanel_->onProcessMessage(&message);
    }
    if(previewPanel_->geometryUpdates()!=smokePreviewUpdates_)throw std::runtime_error("Preview burst was not coalesced");
  }
  void smokePreviewBatchFlush(const std::function<void()>& dispatch) {
    const auto start=std::chrono::steady_clock::now();dispatch();
    const auto micros=std::chrono::duration<double,std::micro>(std::chrono::steady_clock::now()-start).count();
    if(previewPanel_->geometryUpdates()!=smokePreviewUpdates_+1)throw std::runtime_error("Mouse batch deferred geometry until timer");
    const bool software=!display()->nativeWindow()->gpuAcceleration();
    if(software && smokePreviewStep_<4 && previewPanel_->blitMoves()!=smokePreviewBlits_+1)throw std::runtime_error("Drawn preview did not reuse Aseprite software move_region");
    if(software && smokePreviewStep_<4 && !previewPanel_->getUpdateRegion().isEmpty())throw std::runtime_error("Software translation requested unnecessary preview repaint");
    std::ofstream report("drag-performance.txt",smokePreviewStep_==0?std::ios::trunc:std::ios::app);
    report<<"step="<<smokePreviewStep_<<" pointer_samples=200 geometry_updates=1 batch_flush_us="<<micros<<" software="<<software<<" blit_moves="<<previewPanel_->blitMoves()-smokePreviewBlits_<<"\n";
    // Release this synthetic gesture before yielding to the live OS queue so
    // real mouse movement cannot change the test's recorded final geometry.
    previewPanel_->finishPointer();
  }
  void smokeFinishPreviewRepaintStep() {
    if(previewPanel_->geometryUpdates()!=smokePreviewUpdates_+1)throw std::runtime_error("Preview frame timer failed to apply latest pointer once");
    previewPanel_->finishPointer();
    if(previewPanel_->hasCapture())throw std::runtime_error("Preview repaint drag retained capture");
  }
  void smokeLayerContext(const std::filesystem::path& directory) {
    document=Document(2,2);document.addLayer();document.beginStroke({0,0},0xff123456);document.commitStroke();document.addLinkedFrame();refresh();contextFrameId_=document.frame().id;
    const int counts[]{6,23,10,10},enabledCounts[]{1,3,5,1};
    for(int kind=0;kind<4;++kind){
      PixelMenu menu(skin_);buildLayerContextMenu(&menu,kind);int leaves=0,enabled=0;
      std::function<void(PixelMenu*)> inspect=[&](PixelMenu* current){for(auto child:current->children())if(auto item=dynamic_cast<PixelMenuItem*>(child)){
        if(!toolIcons_.assets.patches.count(item->icon) || !toolIcons_.assets.patches.count(item->icon+"-disabled"))throw std::runtime_error("Context menu missing legacy icon");
        if(auto branch=dynamic_cast<PixelMenu*>(item->getSubmenu()))inspect(branch);else{++leaves;if(item->isEnabled())++enabled;}
      }};inspect(&menu);
      if(leaves!=counts[kind] || enabled!=enabledCounts[kind])throw std::runtime_error("Context menu coverage/state mismatch "+std::to_string(kind)+":"+std::to_string(leaves)+":"+std::to_string(enabled));
      const auto size=menu.sizeHint();menu.setBounds(gfx::Rect(0,0,size.w,size.h));
      auto target=os::instance()->makeRgbaSurface(size.w,size.h);target->clear();
      {ui::Graphics g(target);ui::PaintEvent ev(&menu,&g);menu.onPaint(ev);}
      for(auto child:menu.children()){
        const auto at=child->bounds();ui::Graphics g(nullptr,target,at.x,at.y);g.saveClip();g.clipRect(child->clientBounds());ui::PaintEvent ev(child,&g);
        if(auto item=dynamic_cast<PixelMenuItem*>(child))item->onPaint(ev);else if(auto separator=dynamic_cast<PixelMenuSeparator*>(child))separator->onPaint(ev);
        g.restoreClip();
      }
      writeSmokeFrame(target.get(),directory/("layer-context-"+std::to_string(kind)+".bmp"));
    }
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,3);auto item=dynamic_cast<PixelMenuItem*>(menu.children()[11]);if(!item || !item->isEnabled())throw std::runtime_error("Disconnect context action unavailable");item->Click();if(document.cel().linkedCelId)throw std::runtime_error("Disconnect context action failed");document.undo();if(!document.cel().linkedCelId)throw std::runtime_error("Disconnect context undo failed");}
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,0);const auto count=document.timeline().state().layers.size();static_cast<PixelMenuItem*>(menu.children().front())->Click();if(document.timeline().state().layers.size()!=count+1)throw std::runtime_error("Create context action failed");document.undo();}
    document=Document();refresh();
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,2);if(menu.children().back()->isEnabled())throw std::runtime_error("Last frame deletion enabled");}
  }
  void smokeLayers(const std::filesystem::path& directory) {
    setBounds(gfx::Rect(0,0,1280,960));document=Document(2,2);refresh();
    const auto autoLinkLayer=document.layer().id;const auto toggleHistory=document.historySize();
    layerAutoLinks_[0]->Click();
    if(!document.layer().autoLinkAnimationCels || layerAutoLinks_[0]->icon!="animation-auto-link-on" || document.historySize()!=toggleHistory+1)
      throw std::runtime_error("Auto-link click did not toggle layer metadata/icon/history");
    document.undo();refresh();if(document.layer().autoLinkAnimationCels)throw std::runtime_error("Auto-link toggle undo");
    document.redo();refresh();document.addFrame();
    if(document.cel().linkedCelId)throw std::runtime_error("Empty independent cel acquired automatic link");
    document=Document(2,2);refresh();
    // Verify runtime style mapping, pointer updates and independent regions,
    // including the auto-link region that has no enabled hit widget yet.
    const auto hoverLayout=workspaceLayout(uiLogical(bounds()));
    const int hx=hoverLayout.workX+5,hy=hoverLayout.layerTop+37;
    const std::vector<gfx::Point> samples{{hx+1,hy+13},{hx+13,hy+13},{hx+25,hy+13},
      {hx+37,hy+13},{hx+85,hy+1},{hx+85,hy+13}};
    auto renderHover=[&]{auto target=os::instance()->makeRgbaSurface(bounds().w,bounds().h);
      {ui::Graphics g(target);paintChrome(g);paintTimelineGrid(g);}return target;};
    updatePaletteMouse({});auto hoverBase=renderHover();
    for(std::size_t index=0;index<samples.size();++index) {
      const auto point=uiPhysical(gfx::Rect(samples[index].x,samples[index].y,1,1)).origin();
      updatePaletteMouse(point+bounds().origin());auto target=renderHover();
      {os::SurfaceLock baseLock(hoverBase.get()),actualLock(target.get());
        for(std::size_t other=0;other<samples.size();++other) {
          const auto sample=gfx::Point(samples[other].x*uiScale,samples[other].y*uiScale);
          const auto expected=other==index?gfx::rgba(0x2c,0x34,0x45):hoverBase->getPixel(sample.x,sample.y);
          if(target->getPixel(sample.x,sample.y)!=expected)throw std::runtime_error("Timeline hover mismatch region="+std::to_string(index)+" sample="+std::to_string(other)+" actual="+std::to_string(target->getPixel(sample.x,sample.y))+" expected="+std::to_string(expected));
        }
      }
    }
    updatePaletteMouse({});auto hoverRestored=renderHover();
    {os::SurfaceLock baseLock(hoverBase.get()),actualLock(hoverRestored.get());
      for(const auto sample:samples)if(hoverBase->getPixel(sample.x*uiScale,sample.y*uiScale)!=hoverRestored->getPixel(sample.x*uiScale,sample.y*uiScale))
        throw std::runtime_error("Timeline hover did not restore background after leave");
    }
    document=Document(2,2);document.beginStroke({0,0},0xff123456);document.commitStroke();
    document.setLayerAutoLinkAnimationCels(document.layer().id,true);document.addFrame();document.addFrame();
    document.setLayerAutoLinkAnimationCels(document.layer().id,false);document.addFrame(true);refresh();updatePaletteMouse({});
    auto linkedImage=renderHover();
    const auto linkedLayout=workspaceLayout(uiLogical(bounds()));const int markerX=linkedLayout.workX+92,markerY=linkedLayout.layerTop+55;
    {
      os::SurfaceLock lock(linkedImage.get());
      const auto marker=linkedImage->getPixel((markerX+3)*uiScale,markerY*uiScale);
      for(int x=markerX+3;x<=markerX+27;++x)
        if(linkedImage->getPixel(x*uiScale,markerY*uiScale)!=marker)throw std::runtime_error("Linked cel ball middle is not continuous");
      // All seven sprite rows must match the stretched center column,
      // including the rounded-cap edges missed by the center-line check.
      for(int y=markerY-3;y<=markerY+3;++y)for(int sy=0;sy<uiScale;++sy) {
        const auto expected=linkedImage->getPixel((markerX+8)*uiScale,y*uiScale+sy);
        for(int x=(markerX+3)*uiScale;x<(markerX+28)*uiScale;++x)
          if(linkedImage->getPixel(x,y*uiScale+sy)!=expected)throw std::runtime_error("Linked cel run has a rounded-cap seam");
      }
      if(linkedImage->getPixel((markerX+31)*uiScale,markerY*uiScale)==marker)throw std::runtime_error("Unlinked duplicate acquired linked ball bridge");
    }
    writeSmokeFrame(linkedImage.get(),directory/"timeline-auto-link.bmp");
    document=Document(2,2);refresh();
    int outlineCheck=0;auto noTimelineOutline=[&]{
      ++outlineCheck;
      for(const auto& buttons:{layerRows_,frameHeaders_,frameCells_})for(auto b:buttons)
        if(!b->hasFlags(ui::HIDDEN) && b->timelineSelected)throw std::runtime_error("Active timeline context acquired a selection outline check="+std::to_string(outlineCheck)+" caption="+std::to_string(b->caption.size())+" layer="+selectedTimelineLayer_+" cel="+selectedTimelineCelFrame_+" frames="+std::to_string(document.selectedFrames().size()));
    };
    noTimelineOutline();
    document.addLayer();document.addFrame();refresh();noTimelineOutline();
    layerRows_[0]->Click();
    if(!layerRows_[0]->timelineSelected || frameCells_[0]->timelineSelected || frameHeaders_[0]->timelineSelected)
      throw std::runtime_error("Explicit layer selection leaked to frame/cel");
    document.selectLayer(document.timeline().state().layers[1].id);refresh();
    if(!layerRows_[0]->timelineSelected || layerRows_[0]->active || layerRows_[1]->timelineSelected)
      throw std::runtime_error("Layer activity replaced explicit selection");
    frameCells_[0]->Click();
    if(!frameCells_[0]->timelineSelected || layerRows_[0]->timelineSelected || frameHeaders_[0]->timelineSelected)
      throw std::runtime_error("Explicit cel selection leaked to row/frame");
    const auto selectedCelFrame=document.frame().id;
    document.selectFrame(document.timeline().state().frames[1].id);refresh();
    if(!frameCells_[0]->timelineSelected || selectedTimelineCelFrame_!=selectedCelFrame)
      throw std::runtime_error("Frame activity replaced explicit cel selection");
    frameHeaders_[0]->Click();
    if(!frameHeaders_[0]->timelineSelected || frameCells_[0]->timelineSelected || layerRows_[0]->timelineSelected)
      throw std::runtime_error("Explicit frame selection leaked to row/cel");
    const auto toggledFrame=document.selectedFrames().front();document.selectFrameHeader(toggledFrame,1);refresh();noTimelineOutline();
    frameCells_[0]->Click();hideTimelineSelectionGuides();noTimelineOutline();
    if(selectedTimelineCelFrame_.empty())throw std::runtime_error("Hiding guides cleared logical cel selection");
    layerRows_[0]->Click();if(!layerRows_[0]->timelineSelected)throw std::runtime_error("Timeline click did not restore guides");
    seekFrame(1);noTimelineOutline();
    document=Document(2,2);refresh();noTimelineOutline();
    if(frameCells_[0]->timelineCel)throw std::runtime_error("Blank cel has content marker");
    document.beginStroke({0,0},0x00123456);document.commitStroke();refresh();
    if(frameCells_[0]->timelineCel)throw std::runtime_error("Transparent RGB has content marker");
    document.beginStroke({0,0},0x01123456);document.commitStroke();refresh();
    if(!frameCells_[0]->timelineCel)throw std::runtime_error("Visible pixel lacks content marker");
    document.undo();refresh();if(frameCells_[0]->timelineCel)throw std::runtime_error("Undo left stale content marker");
    document.redo();refresh();if(!frameCells_[0]->timelineCel)throw std::runtime_error("Redo lost content marker");
    document.beginStroke({0,0},0);document.commitStroke();refresh();
    if(frameCells_[0]->timelineCel)throw std::runtime_error("Erased cel has content marker");
    setBounds(gfx::Rect(0,0,1280,960));document=Document(2,2);
    document.beginStroke({0,0},0xff123456);document.commitStroke();document.addLayer();document.addFrame(true);document.addFrame();refresh();
    for(int mode=0;mode<3;++mode) {
      if(mode==0)selectTimelineLayer(0);
      else if(mode==1){document.selectFrameHeader(document.timeline().state().frames[0].id);document.selectFrameHeader(document.timeline().state().frames[1].id,2);markFrameSelection();refresh();}
      else selectTimelineCel(0,0);
      const auto outlines=timelineOutlines();
      if(outlines.size()!=1)throw std::runtime_error("Adjacent timeline targets did not share one outline");
      const auto box=outlines.front().border;
      const auto material=skin_.selectionMaterialBounds(uiPhysical(box));
      auto frameOnly=os::instance()->makeRgbaSurface(1280,960);frameOnly->clear();
      {ui::Graphics g(frameOnly);UiPaintScale scale(g);skin_.drawSelectionBorder(g,uiPhysical(box),false);}
      {
        os::SurfaceLock frameLock(frameOnly.get());
        for(int y=material.y-1;y<=material.y2();++y)for(int x=material.x-1;x<=material.x2();++x) {
          const auto point=gfx::Point(x,y);
          const bool painted=gfx::geta(frameOnly->getPixel(x,y))!=0;
          if(skin_.selectionContains(material,point)!=painted)throw std::runtime_error("Timeline selection hit region differs from painted skin alpha");
          // Use the same display-relative pointer path as the manager filter.
          paletteMousePosition_=point+bounds().origin();
          if(timelineOutlines().front().hover!=painted)throw std::runtime_error("Timeline border hover includes transparent interior or excludes exterior");
        }
      }
      paletteMousePosition_.reset();
      if(mode==0 && (box.x!=workspaceLayout(uiLogical(bounds())).workX+41 || box.w!=48+3*12+1))throw std::runtime_error("Layer selection must start after auto-link and cover name plus actual frames");
      if(mode==1 && (box.w!=25 || box.h!=37))throw std::runtime_error("Selected frames outline does not cover merged columns");
      if(mode==2 && (box.w!=13 || box.h!=13))throw std::runtime_error("Cel outline does not include shared grid border");
      auto base=os::instance()->makeRgbaSurface(1280,960);auto selected=os::instance()->makeRgbaSurface(1280,960);
      timelineSelectionGuidesVisible_=false;
      {ui::Graphics g(base);paintChrome(g);paintTimelineGrid(g);}
      timelineSelectionGuidesVisible_=true;
      {ui::Graphics g(selected);paintChrome(g);paintTimelineGrid(g);}
      {
        os::SurfaceLock baseLock(base.get()),selectedLock(selected.get());
        for(int y=box.y+1;y<box.y2()-1;++y)for(int x=box.x+1;x<box.x2()-1;++x)
          if(base->getPixel(x*uiScale,y*uiScale)!=selected->getPixel(x*uiScale,y*uiScale))
            throw std::runtime_error("Selection border changed timeline content/internal grid");
        const int center=(box.x+box.w/2)*uiScale;
        if(selected->getPixel(center,box.y*uiScale)!=gfx::rgba(0,0,0))throw std::runtime_error("Selection inner black is not on existing grid border");
        if(selected->getPixel(center,(box.y-2)*uiScale)!=gfx::rgba(0,0,0))throw std::runtime_error("Outer selection frame was clipped to target bounds");
        if(selected->getPixel(center,(box.y-1)*uiScale)==base->getPixel(center,(box.y-1)*uiScale))throw std::runtime_error("White selection border did not extend outside target");
      }
      writeSmokeFrame(selected.get(),directory/("timeline-outline-"+std::to_string(mode)+".bmp"));
    }
    document=Document(2,2);refresh();
    // Exercise the actual parent/child painters after adding and scrolling rows.
    for(int width:{1280,1600})for(int count:{1,3,18}) {
      setBounds(gfx::Rect(0,0,width,960));document=Document(2,2);
      for(int i=1;i<count;++i)document.addLayer();
      document.beginStroke({0,0},0xff123456);document.commitStroke();
      document.addFrame(true);document.addFrame();layersPanelOpen_=true;refresh();
      if(count==3){selectTimelineCel(0,0);}
      if(count==18){layerScroll_=12;layoutLayers();}
      const auto l=workspaceLayout(uiLogical(bounds()));const int x=l.workX+5,y=l.layerTop+37;
      const int rows=std::min(std::max(1,(l.bottom-l.layerTop-53)/12),count-layerScroll_);
      if(timelineInactive_[5]->bounds().x-timelineInactive_[4]->bounds().x2()!=uiGap*uiScale)
        throw std::runtime_error("Layer toolbar group spacing");
      for(int i:{1,2,3,4,6,7,9})
        if(timelineInactive_[i-1]->bounds().x2()-timelineInactive_[i]->bounds().x!=uiScale)
          throw std::runtime_error("Layer toolbar shared outline width");
      auto target=os::instance()->makeRgbaSurface(width,960);target->clear();
      {ui::Graphics g(target);paintChrome(g);paintTimelineGrid(g);}
      auto paint=[&](PixelButton* b){if(b->hasFlags(ui::HIDDEN))return;const auto at=b->bounds();ui::Graphics g(nullptr,target,at.x,at.y);g.saveClip();g.clipRect(b->clientBounds());ui::PaintEvent ev(b,&g);b->onPaint(ev);g.restoreClip();};
      for(auto b:timelineInactive_)paint(b);paint(layerProperties_);
      for(auto b:layerRows_)paint(b);for(auto b:layerEyes_)paint(b);for(auto b:layerLocks_)paint(b);
      for(auto b:frameHeaders_)paint(b);for(auto b:frameCells_)paint(b);
      if(layerEyes_[layerScroll_]->bounds().x!=timelineInactive_[0]->bounds().x)
        throw std::runtime_error("Timeline and toolbar left edges differ");
      if(frameHeaders_[0]->bounds().y-timelineInactive_[0]->bounds().y2()!=uiGap*uiScale)
        throw std::runtime_error("Timeline toolbar bottom gap");
      {os::SurfaceLock actual(target.get());
        const auto selected=skin_["background"];
        const int cols=std::max(1,(l.workW-94)/12);
        for(int row=0;row<rows;++row)for(int col=0;col<3;++col){
          const auto* cell=frameCells_[row*cols+col];
          const auto sample=gfx::Point(cell->bounds().x+2,cell->bounds().y+2);
          const auto outlines=timelineOutlines();
          const bool covered=std::any_of(outlines.begin(),outlines.end(),[&](const auto& outline){auto box=outline.border;box.enlarge(2);return uiPhysical(box).contains(sample);});
          if(cell->active && !covered && target->getPixel(sample.x,sample.y)!=selected)
            throw std::runtime_error("Timeline active background mismatch");
        }
      }
      writeSmokeFrame(target.get(),directory/"timeline-selection-check.bmp");
      auto edge=os::instance()->makeRgbaSurface(2,2);edge->clear();
      {ui::Graphics g(edge);UiPaintScale scale(g);skin_.draw(g,"timeline.line",gfx::Rect(0,0,1,1));}
      {os::SurfaceLock actual(target.get()),expected(edge.get());
        const auto ink=edge->getPixel(0,0);
        for(int row=0;row<=rows;++row)for(int dx:{0,12,24,36,84,96,108,120})
          if(target->getPixel((x+dx)*uiScale,(y+row*12)*uiScale)!=ink)
            throw std::runtime_error("Layer grid intersection missing");
        for(int row=1;row<=rows+1;++row)
          if(target->getPixel((x+130)*uiScale,(y+row*12)*uiScale)!=target->getPixel((x+130)*uiScale,(y+row*12-1)*uiScale))
            throw std::runtime_error("Unused timeline area has horizontal separators");
        for(int row=0;row<rows;++row)for(int dy=1;dy<12;++dy)
          if(target->getPixel((x+24)*uiScale,(y+12+row*12+dy)*uiScale)!=ink)
            throw std::runtime_error("Layer auto-link separator missing");
      }
      writeSmokeFrame(target.get(),directory/("layers-"+std::to_string(width)+"-"+std::to_string(count)+".bmp"));
    }
  }
  void smokeSelectionDisplay(){
    document=Document(32,24);document.markSaved();document.commitSelection({},SelectionMask{2,2,5,4,{}});fitCanvas();refresh();useSelectionTool(0);const auto before=document.selection();const auto history=document.historySize();
    const auto start=gfx::Point(canvas_.x+int(12.5*canvasScale()),canvas_.y+int(7.5*canvasScale())),end=gfx::Point(canvas_.x+int(25.5*canvasScale()),canvas_.y+int(18.5*canvasScale()));
    ui::MouseMessage press(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,start),move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,end);
    onProcessMessage(&press);onProcessMessage(&move);updatePaletteMouse(end);selectionBrushPointer_=end;
    if(!selectionDragging_ || !selectionEqual(document.selection(),before) || !selectionPreview_ || document.historySize()!=history || document.dirty())throw std::runtime_error("Creation preview replaced selection/history before release");
    if(std::string(cursorAt(end))!="none")throw std::runtime_error("Creation pointer should hide mouse and display corners");
  }
  void smokeSelectionTools(){
    smoke_=true;selectionRounded_=false;selectionMode_=0;selectionPivotVisible_=false;
    document=Document(7,7);paletteFocused_=false;frameSelectionExplicit_=false;fitCanvas();refresh();
    auto railSelected=[&](std::size_t index){
      for(std::size_t i=0;i<toolRail_.size();++i)if(toolRail_[i]->active!=(i==index))throw std::runtime_error("Tool rail active group mismatch");
    };
    for(int kind=0;kind<6;++kind){useSelectionTool(kind);railSelected(3);if(activeRailTool()!=legacyToolGroups()[3][kind].id)throw std::runtime_error("Selected selection member mismatch");}
    commands_[1]->Click();railSelected(0);commands_[2]->Click();railSelected(1);
    commands_[5]->Click();railSelected(10);useFillTool();railSelected(6);
    useGradientTool();railSelected(6);commands_[1]->Click();railSelected(0);
    if(toolRail_[6]->icon!="tool-gradient-normal")throw std::runtime_error("Remembered gradient icon lost");
    toolRail_[6]->Click();railSelected(6);if(!gradientTool_)throw std::runtime_error("Remembered gradient tool lost");
    useFillTool();useSelectionTool(0);
    for(int i=1;i<4;++i)if(selectionModeButtons_[i]->bounds().x!=selectionModeButtons_[i-1]->bounds().x2()-uiScale)throw std::runtime_error("Selection modes must share one outline");
    for(auto button:selectionModeButtons_)if(button->bounds().w!=15*uiScale || button->bounds().h!=16*uiScale || button->bounds().y2()!=brushShapeButton_->bounds().y2())throw std::runtime_error("Property icon button dimensions must match pencil");
    auto pointer=[&](ui::MessageType type,int x,int y,bool right=false){ui::MouseMessage mouse(type,os::PointerType::Mouse,right?ui::kButtonRight:ui::kButtonLeft,ui::kKeyNoneModifier,gfx::Point(canvas_.x+int((x+.5)*canvasScale()),canvas_.y+int((y+.5)*canvasScale())));onProcessMessage(&mouse);if(fillDragging_ || gradientDragging_ || shapeDragging_)enableFlags(ui::HAS_CAPTURE);else disableFlags(ui::HAS_CAPTURE);};
    auto key=[&](ui::KeyScancode code,ui::KeyModifiers modifiers=ui::kKeyNoneModifier){ui::KeyMessage message(ui::kKeyDownMessage,code,modifiers,0,0);onProcessMessage(&message);if(!fillDragging_ && !gradientDragging_ && !shapeDragging_)disableFlags(ui::HAS_CAPTURE);};
    useSelectionTool(1);pointer(ui::kMouseDownMessage,0,0);pointer(ui::kMouseMoveMessage,4,4);pointer(ui::kMouseUpMessage,4,4);if(!selectionContains(document.selection(),2,0) || selectionContains(document.selection(),0,0) || document.dirty())throw std::runtime_error("Ellipse selection UI");document.deselectPixels();
    useSelectionTool(2);pointer(ui::kMouseDownMessage,1,1);pointer(ui::kMouseMoveMessage,5,1);pointer(ui::kMouseMoveMessage,5,5);pointer(ui::kMouseMoveMessage,1,5);pointer(ui::kMouseUpMessage,1,5);if(!selectionContains(document.selection(),3,3) || document.dirty())throw std::runtime_error("Lasso selection UI");document.deselectPixels();
    useSelectionTool(3);for(auto p:std::vector<SelectionPoint>{{1,1},{5,1},{5,5}}){pointer(ui::kMouseDownMessage,p.x,p.y);pointer(ui::kMouseUpMessage,p.x,p.y);}pointer(ui::kMouseDownMessage,5,5,true);if(selectionPath_.size()!=2)throw std::runtime_error("Polygon right-click step undo");key(ui::kKeyY,ui::kKeyCtrlModifier);if(selectionPath_.size()!=3)throw std::runtime_error("Polygon step redo");pointer(ui::kMouseDownMessage,1,5);pointer(ui::kMouseUpMessage,1,5);key(ui::kKeyEnter);if(polygonPending_ || !selectionContains(document.selection(),3,3) || document.dirty())throw std::runtime_error("Polygon selection UI");document.deselectPixels();
    pointer(ui::kMouseDownMessage,1,1);pointer(ui::kMouseUpMessage,1,1);pointer(ui::kMouseDownMessage,5,1);pointer(ui::kMouseUpMessage,5,1);key(ui::kKeyEsc);if(document.selection() || polygonPending_)throw std::runtime_error("Polygon cancellation UI");
    document=Document(5,2);document.beginStroke({0,0},0xff0000ff);document.commitStroke();document.beginStroke({1,0},0xffff0000);document.commitStroke();document.beginStroke({2,0},0xff0000ff);document.commitStroke();document.markSaved();fitCanvas();refresh();useSelectionTool(4);pointer(ui::kMouseDownMessage,0,0);pointer(ui::kMouseMoveMessage,2,0);pointer(ui::kMouseUpMessage,2,0);for(int n=0;n<3 && selectionDragging_;++n){if(wandWorker_.valid())wandWorker_.wait();wandTick();}if(selectionDragging_ || !selectionContains(document.selection(),2,0) || selectionContains(document.selection(),0,0) || document.dirty())throw std::runtime_error("Latest magic preview/release UI");document.deselectPixels();
    pointer(ui::kMouseDownMessage,0,0);key(ui::kKeyEsc);if(wandWorker_.valid())wandWorker_.wait();wandTick();if(document.selection())throw std::runtime_error("Magic cancellation applied stale result");
    pointer(ui::kMouseDownMessage,0,0);document=Document(3,3);if(wandWorker_.valid())wandWorker_.wait();wandTick();if(document.selection() || selectionDragging_ || document.dirty())throw std::runtime_error("Magic result entered switched document");
    document=Document(7,7);fitCanvas();useSelectionTool(5);brushProfiles_[0]={1,0,BrushShape::Round};selectionMode_=0;const auto brushPixels=document.pixels();
    pointer(ui::kMouseDownMessage,1,1);pointer(ui::kMouseMoveMessage,5,1);if(document.selection() || document.historySize()!=0 || document.dirty())throw std::runtime_error("Brush preview published selection/history");pointer(ui::kMouseUpMessage,5,1);if(!selectionContains(document.selection(),3,1) || document.historySize()!=1 || document.pixels()!=brushPixels || document.dirty())throw std::runtime_error("Brush commit UI");
    pointer(ui::kMouseDownMessage,3,1,true);pointer(ui::kMouseUpMessage,3,1,true);if(selectionContains(document.selection(),3,1) || !selectionContains(document.selection(),2,1) || document.historySize()!=2)throw std::runtime_error("Brush right subtraction UI");
    const auto brushHistory=document.historySize();pointer(ui::kMouseDownMessage,1,5);pointer(ui::kMouseMoveMessage,5,5);key(ui::kKeyEsc);if(selectionContains(document.selection(),3,5) || document.historySize()!=brushHistory || document.pixels()!=brushPixels)throw std::runtime_error("Brush cancel UI");
    document.deselectPixels();refresh();useSelectionTool(5);key(ui::kKey3,ui::kKeyCtrlModifier);key(ui::kKeyClosebrace);if(brushProfiles_[0].shape!=BrushShape::Line || brushProfiles_[0].size!=2 || selectionBrushAngleInput_->hasFlags(ui::HIDDEN))throw std::runtime_error("Brush property shortcuts UI shape="+std::to_string(int(brushProfiles_[0].shape))+" size="+std::to_string(brushProfiles_[0].size)+" angleVisible="+std::to_string(selectionBrushAngleInput_->isVisible()));brushProfiles_[0]={};selectionBrushAngle_=0;

    document=Document(32,24);document.beginStroke({6,6},0x80443322);document.commitStroke();document.beginStroke({13,11},0xff778899);document.commitStroke();document.commitSelection({},SelectionMask{6,6,8,6,{}});document.markSaved();fitCanvas();refresh();useSelectionTool(0);selectionRotSprite_=false;const auto transformPixels=document.pixels();const auto transformHistory=document.historySize();
    auto transformPointer=[&](ui::MessageType type,double x,double y,ui::KeyModifiers modifiers=ui::kKeyNoneModifier){ui::MouseMessage mouse(type,os::PointerType::Mouse,ui::kButtonLeft,modifiers,gfx::Point(canvas_.x+int(std::round(x*canvasScale())),canvas_.y+int(std::round(y*canvasScale()))));onProcessMessage(&mouse);};
    for(double zoom:{2.0,4.0}){
      const double savedZoom=zoom_;zoom_=zoom;
      const auto origin=gfx::Point(canvas_.x+int(14*canvasScale()),canvas_.y+int(12*canvasScale()));
      auto sample=[&](ui::MessageType type,gfx::Point point){ui::MouseMessage msg(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);onProcessMessage(&msg);};
      sample(ui::kMouseDownMessage,origin);if(transformHandle_!="se")throw std::runtime_error("Resize subpixel test handle");
      sample(ui::kMouseMoveMessage,origin+gfx::Point(1,1));
      if(document.floatingTransform()->width!=8 || document.floatingTransform()->height!=6)throw std::runtime_error("Resize moved before document pixel boundary");
      sample(ui::kMouseMoveMessage,origin+gfx::Point(int(canvasScale()),int(canvasScale())));
      if(document.floatingTransform()->width!=9 || document.floatingTransform()->height!=7)throw std::runtime_error("Resize document pixel step");
      const auto controls=*selectionControlTarget();const auto& mask=*document.selection();
      if(controls.x!=mask.x || controls.y!=mask.y || controls.width!=mask.width || controls.height!=mask.height)throw std::runtime_error("Resize controls diverged from pixel mask");
      sample(ui::kMouseUpMessage,origin+gfx::Point(int(canvasScale()),int(canvasScale())));key(ui::kKeyEsc);zoom_=savedZoom;
    }
    transformPointer(ui::kMouseDownMessage,14,12);if(transformHandle_!="se" || !floatingDragging_)throw std::runtime_error("Selection resize handle UI");useSelectionTool(4);if(selectionKind_!=0 || !floatingDragging_)throw std::runtime_error("Transform tool switching lock");transformPointer(ui::kMouseMoveMessage,18,15);transformPointer(ui::kMouseUpMessage,18,15);if(!document.floating() || document.floatingTransform()->width!=12 || document.historySize()!=transformHistory || document.dirty())throw std::runtime_error("Selection resize preview UI");key(ui::kKeyEsc);if(document.pixels()!=transformPixels || document.selection()->x!=6 || document.historySize()!=transformHistory)throw std::runtime_error("Selection transform cancel UI");
    const double outside=16.0/canvasScale();transformPointer(ui::kMouseDownMessage,14+outside,6-outside);if(transformHandle_!="rotate-ne")throw std::runtime_error("Selection rotation handle UI");const double cx=10,cy=9,radius=std::hypot(14+outside-cx,6-outside-cy),theta=std::atan2(6-outside-cy,14+outside-cx)+3.141592653589793/4;transformPointer(ui::kMouseMoveMessage,cx+radius*std::cos(theta),cy+radius*std::sin(theta),ui::kKeyShiftModifier);transformPointer(ui::kMouseUpMessage,cx+radius*std::cos(theta),cy+radius*std::sin(theta));if(document.floatingTransform()->angle!=45)throw std::runtime_error("Selection rotation45 snap UI");key(ui::kKeyEsc);selectionPropertiesActive_=true;refresh();selectionTransformFields_[2]->setText("-12");selectionTransformFields_[2]->Change();if(!document.floatingTransform()->flipHorizontal || document.floatingTransform()->width!=12)throw std::runtime_error("Selection signed property UI");selectionTransformFields_[4]->setText("23.4");selectionTransformFields_[4]->Change();if(std::abs(document.floatingTransform()->angle-23.4)>1e-8)throw std::runtime_error("Selection angle property UI");key(ui::kKeyEnter);if(document.historySize()!=transformHistory+1 || document.floating())throw std::runtime_error("Selection transform confirmation history UI");document.undo();if(document.pixels()!=transformPixels)throw std::runtime_error("Selection transform UI undo");selectionPropertiesActive_=false;
    document=Document(48,48);document.beginStroke({16,16},0xff112233);document.commitStroke();document.commitSelection({},SelectionMask{12,12,16,16,{}});fitCanvas();refresh();useSelectionTool(0);selectionPivotVisible_=true;selectionPivot_=TransformPoint{14,14};
    const auto pivotHistory=document.historySize();transformPointer(ui::kMouseDownMessage,14,14);if(!selectionPivotDragging_ || document.floating())throw std::runtime_error("Pivot drag started a content transaction");transformPointer(ui::kMouseMoveMessage,17,15);transformPointer(ui::kMouseUpMessage,17,15);if(!selectionPivot_ || selectionPivot_->x!=17 || selectionPivot_->y!=15 || document.historySize()!=pivotHistory)throw std::runtime_error("Pivot drag changed history or missed integer delta");
    {
      const auto savedCanvas=canvas_;const double savedZoom=zoom_;
      auto physicalPointer=[&](ui::MessageType type,gfx::Point at,ui::MouseButton button=ui::kButtonLeft){ui::MouseMessage mouse(type,os::PointerType::Mouse,button,ui::kKeyNoneModifier,at);onProcessMessage(&mouse);};
      for(double zoom:{1.0,2.0,4.0}){
        zoom_=zoom;selectionPivot_=TransformPoint{14.5,14.5};
        const auto origin=gfx::Point(canvas_.x+int(14.5*canvasScale()),canvas_.y+int(14.5*canvasScale()));
        physicalPointer(ui::kMouseDownMessage,origin);if(!selectionPivotDragging_)throw std::runtime_error("Pivot zoom drag did not start");
        physicalPointer(ui::kMouseMoveMessage,origin+gfx::Point(1,0));
        const double expected=14.5+std::floor(1.0/canvasScale()+.5);
        if(selectionPivot_->x!=expected || selectionPivot_->y!=14.5)throw std::runtime_error("Pivot subpixel threshold");
        physicalPointer(ui::kMouseMoveMessage,origin+gfx::Point(-int(canvasScale()),int(canvasScale())));
        if(selectionPivot_->x!=13.5 || selectionPivot_->y!=15.5)throw std::runtime_error("Pivot signed document pixel step");
        physicalPointer(ui::kMouseUpMessage,origin+gfx::Point(int(2*canvasScale()),-int(canvasScale())));
        if(selectionPivot_->x!=16.5 || selectionPivot_->y!=13.5 || selectionPivotDragging_)throw std::runtime_error("Pivot release final position");
      }
      const auto edge=gfx::Point(canvasViewport().x+1,canvasViewport().y+canvasViewport().h/2);
      selectionPivot_=transformCanvasPoint(edge);physicalPointer(ui::kMouseDownMessage,edge);
      if(!selectionPivotDragging_)throw std::runtime_error("Pivot edge drag did not start");
      const auto stableCanvas=canvas_;physicalPointer(ui::kMouseMoveMessage,edge+gfx::Point(1,0));
      if(canvas_!=stableCanvas)throw std::runtime_error("Pivot drag must not auto-pan");
      const auto pivotBefore=selectionPivotStart_;physicalPointer(ui::kMouseUpMessage,edge,ui::kButtonNone);
      if(selectionPivot_->x!=pivotBefore.x || selectionPivot_->y!=pivotBefore.y)throw std::runtime_error("Pivot capture cancellation");
      zoom_=savedZoom;canvas_=savedCanvas;
      if(document.historySize()!=pivotHistory)throw std::runtime_error("Pivot drag created document history");
    }
    {
      const double beforeZoom=zoom_;const auto mask=document.selection();
      if(!document.beginSelectionContentMove(false))throw std::runtime_error("Floating zoom fixture");
      ui::MouseMessage wheel(ui::kMouseWheelMessage,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyNoneModifier,canvasViewport().center(),gfx::Point(0,-1));onProcessMessage(&wheel);
      if(zoom_==beforeZoom || !document.floating() || !selectionEqual(mask,document.selection()))throw std::runtime_error("Floating selection view zoom");
      if(std::string(cursorAt(gfx::Point(bounds().x+1,bounds().y+1)))!="default")throw std::runtime_error("Floating selection outside cursor");
      document.cancelFloatingPaste();zoom_=beforeZoom;fitCanvas();
      PixelEntry numericField(font_,skin_);numericField.numeric=true;numericField.setText("12");int changed=0;numericField.Change.connect([&]{++changed;});numericField.adjustNumber(3);
      if(numericField.text()!="15" || changed!=1)throw std::runtime_error("Numeric entry adjustment commit");numericField.setText("(20+3)*2/4");if(!numericField.commitExpression() || numericField.text()!="11.5")throw std::runtime_error("Numeric expression commit");numericField.setText("15");numericField.setEnabled(false);numericField.adjustNumber(3);if(numericField.text()!="15")throw std::runtime_error("Disabled numeric field changed");
    }
    selectionPivotVisible_=false;selectionPivot_.reset();const double band=20.0/canvasScale();transformPointer(ui::kMouseDownMessage,20,12-band);if(transformHandle_!="shear-n")throw std::runtime_error("Shear edge UI hit");transformPointer(ui::kMouseMoveMessage,23,12-band);transformPointer(ui::kMouseUpMessage,23,12-band);if(!document.floating() || std::abs(document.floatingTransform()->shearX)<1)throw std::runtime_error("Shear preview missing");key(ui::kKeyEsc);
    startFreeSelectionTransform();if(!document.floating() || !document.floatingTransform()->quad || !selectionFreeTransform_)throw std::runtime_error("Free transform command missing");transformPointer(ui::kMouseDownMessage,28,12);if(transformHandle_!="ne")throw std::runtime_error("Free transform corner hit");transformPointer(ui::kMouseMoveMessage,31,10);transformPointer(ui::kMouseUpMessage,31,10);if((*document.floatingTransform()->quad)[1].x!=31 || (*document.floatingTransform()->quad)[1].y!=10)throw std::runtime_error("Free transform corner preview");key(ui::kKeyEsc);if(document.floating() || document.pixels()[16*48+16]!=0xff112233)throw std::runtime_error("Free transform cancellation");
    key(ui::kKeyEsc);document=Document(48,48);fitCanvas();refresh();useSelectionTool(0);selectionPivotVisible_=false;quickSelectionPress_.reset();
    transformPointer(ui::kMouseDownMessage,10,10);transformPointer(ui::kMouseMoveMessage,20,16);const auto unrotated=selectionPreview_;transformPointer(ui::kMouseMoveMessage,20,16,ui::kKeyAltModifier);transformPointer(ui::kMouseMoveMessage,17,20,ui::kKeyAltModifier);if(!marqueeTarget_ || std::abs(marqueeTarget_->angle)<1 || selectionEqual(unrotated,selectionPreview_))throw std::runtime_error("Alt marquee rotation preview");const auto center=transformPoint(*marqueeTarget_,.5,.5);transformPointer(ui::kMouseMoveMessage,18,21);if(std::abs(transformPoint(*marqueeTarget_,.5,.5).x-center.x)>1e-8)throw std::runtime_error("Alt release marquee center");const auto restore=*marqueeTarget_;key(ui::kKeyLControl,ui::kKeyCtrlModifier);if(!marqueeCtrlRestore_ || marqueeTarget_->width!=restore.width || marqueeTarget_->angle!=restore.angle)throw std::runtime_error("Ctrl after Alt must preserve size and angle");transformPointer(ui::kMouseMoveMessage,20,23,ui::kKeyCtrlModifier);ui::KeyMessage ctrlRelease(ui::kKeyUpMessage,ui::kKeyLControl,ui::kKeyNoneModifier,0,0);onProcessMessage(&ctrlRelease);if(marqueeCtrlRestore_ || marqueeTarget_->x!=restore.x || marqueeTarget_->y!=restore.y || marqueeTarget_->width!=restore.width)throw std::runtime_error("Ctrl release must restore rotated bounds");key(ui::kKeySpace);const auto beforeSpace=*marqueeTarget_;transformPointer(ui::kMouseMoveMessage,22,25);if(marqueeTarget_->x!=beforeSpace.x+2 || marqueeTarget_->width!=beforeSpace.width || spaceHeld_)throw std::runtime_error("Space moves marquee without navigation cursor");ui::KeyMessage spaceRelease(ui::kKeyUpMessage,ui::kKeySpace,ui::kKeyNoneModifier,0,0);onProcessMessage(&spaceRelease);const auto afterSpace=*marqueeTarget_;transformPointer(ui::kMouseMoveMessage,22,25);if(marqueeTarget_->x!=afterSpace.x || marqueeTarget_->width!=afterSpace.width)throw std::runtime_error("Space release marquee jumps");key(ui::kKeyEsc);if(document.selection())throw std::runtime_error("Rotated marquee cancel");
    quickSelectionPress_.reset();transformPointer(ui::kMouseDownMessage,12,12);transformPointer(ui::kMouseUpMessage,12,12);document.commitSelection({},SelectionMask{10,10,8,8,{}});transformPointer(ui::kMouseDownMessage,12,12);if(!quickSelection_ || floatingDragging_ || !selectionPreview_ || selectionPreview_->width!=4)throw std::runtime_error("Quick selection must precede transform hit");transformPointer(ui::kMouseUpMessage,12,12);if(document.selection()->x!=12 || document.selection()->width!=4)throw std::runtime_error("Quick cell commit");
    document=Document(48,48);document.beginStroke({18,18},0xff123456);document.commitStroke();document.commitSelection({},SelectionMask{10,10,20,20,{}});refresh();const auto trimHistory=document.historySize();shrinkSelectionToContent();if(document.selection()->x!=18 || document.selection()->width!=1 || document.historySize()!=trimHistory+1)throw std::runtime_error("Shrink selection to actual selected content");document.undo();if(document.selection()->width!=20 || document.pixels()[18*48+18]!=0xff123456)throw std::runtime_error("Shrink history is view only");
    startFreeSelectionTransform();selectionMode_=2;const auto freeHistory=document.historySize();transformPointer(ui::kMouseDownMessage,25,25,ui::kKeyShiftModifier);if(!floatingDragging_ || selectionDragging_)throw std::runtime_error("Free frame interior owns Shift and subtract mode");transformPointer(ui::kMouseMoveMessage,26,26,ui::kKeyShiftModifier);transformPointer(ui::kMouseUpMessage,26,26);key(ui::kKeyEsc);if(document.pixels()[18*48+18]!=0xff123456 || document.historySize()!=freeHistory)throw std::runtime_error("Free interior cancellation");selectionMode_=0;
    selectionPivotVisible_=true;showSelectionPivotPopup();const auto presetExpected=selectionPivotPreset(*selectionTransformTarget(),0);if(!selectionPivot_ || selectionPivot_->x!=presetExpected.x || selectionPivot_->y!=presetExpected.y)throw std::runtime_error("Pivot popup preset callback");
    selectionKind_=0;selectionTool_=false;wandSource_.reset();refresh();
    document=Document(4,3);homeOpen_=false;documentOpen_=true;paletteFocused_=false;fitCanvas();refresh();fillOptions_={};ink_=0xff123456;key(ui::kKeyG);if(!fillTool_ || fillToleranceInput_->hasFlags(ui::HIDDEN) || !brushOpacityInput_->hasFlags(ui::HIDDEN))throw std::runtime_error("Bucket tool/property UI tool="+std::to_string(fillTool_)+" tolerance="+std::to_string(fillToleranceInput_->isVisible())+" opacity="+std::to_string(brushOpacityInput_->isVisible()));pointer(ui::kMouseDownMessage,1,1);if(!fillDragging_ || document.historySize()!=1 || document.pixels()[0]!=ink_)throw std::runtime_error("Bucket commits on press");pointer(ui::kMouseMoveMessage,3,2);key(ui::kKeyEsc);if(fillDragging_ || document.pixels()[0]!=0 || !document.canRedo())throw std::runtime_error("Bucket cancel undoes committed fill");pointer(ui::kMouseDownMessage,1,1,true);pointer(ui::kMouseUpMessage,1,1,true);if(document.pixels()[0]!=document.palette().secondary || fillDragging_)throw std::runtime_error("Bucket background/release UI");fillContiguousButton_->Click();if(fillOptions_.contiguous || !fillGapButton_->hasFlags(ui::HIDDEN))throw std::runtime_error("Bucket global property UI");fillToleranceInput_->setText("300");fillToleranceInput_->Change();if(fillOptions_.tolerance!=255)throw std::runtime_error("Bucket tolerance clamp UI");key(ui::kKeyB);if(fillTool_)throw std::runtime_error("Bucket exit tool UI");fillOptions_={};
    document=Document(5,3);fitCanvas();refresh();gradientSpec_={};gradientOptions_={};gradientConfirm_=true;gradientFreeform_=false;ink_=0xff0000ff;document.setPaletteRole(ink_,false,true);document.setPaletteRole(0xffff0000,true,true);key(ui::kKeyG,ui::kKeyShiftModifier);if(!gradientTool_ || gradientTolerance_->hasFlags(ui::HIDDEN) || !fillToleranceInput_->hasFlags(ui::HIDDEN))throw std::runtime_error("Gradient tool/property UI");pointer(ui::kMouseDownMessage,0,0);pointer(ui::kMouseMoveMessage,4,0);pointer(ui::kMouseUpMessage,4,0);if(!gradientPending_ || document.dirty() || document.historySize()!=0 || (*document.gradientPreviewPixels())[2]!=0xff800080)throw std::runtime_error("Gradient confirmation preview UI");document.setPaletteRole(0xff00ff00,true,true);gradientTick();if((*document.gradientPreviewPixels())[4]!=0xff00ff00 || document.dirty())throw std::runtime_error("Pending gradient color refresh");key(ui::kKeyB);if(!gradientTool_ || !gradientPending_)throw std::runtime_error("Gradient pending tool lock");key(ui::kKeyEsc);if(document.gradientActive() || document.dirty() || gradientPending_)throw std::runtime_error("Gradient preview Escape");pointer(ui::kMouseDownMessage,0,0,true);pointer(ui::kMouseMoveMessage,4,0,true);pointer(ui::kMouseUpMessage,4,0,true);key(ui::kKeyEnter);if(document.historySize()!=1 || document.pixels()[0]!=0xff00ff00 || document.pixels()[4]!=0xff0000ff)throw std::runtime_error("Gradient reverse/apply single UI edit");document.undo();if(document.pixels()[0]!=0)throw std::runtime_error("Gradient UI undo");gradientConfirm_=false;key(ui::kKeyB);gradientSpec_={};gradientOptions_={};
    document=Document(8,6);shapeSpec_={};fitCanvas();refresh();shapeRounded_=shapeRatio_=false;brushProfiles_[0]={1,100,BrushShape::Round};document.setPaletteRole(0xff0000ff,false,true);document.setPaletteRole(0xff00ff00,true,true);refresh();key(ui::kKeyU);if(!shapeTool_ || shapeModeButton_->hasFlags(ui::HIDDEN) || !brushOpacityInput_->hasFlags(ui::HIDDEN))throw std::runtime_error("Shape tool properties");pointer(ui::kMouseDownMessage,1,1);pointer(ui::kMouseMoveMessage,3,3);shapeTick();if(document.dirty() || document.historySize()!=0 || (*document.gradientPreviewPixels())[2*8+2]!=0xff0000ff)throw std::runtime_error("Shape independent preview UI");key(ui::kKeyEsc);if(document.shapeActive() || document.dirty())throw std::runtime_error("Shape Escape UI");pointer(ui::kMouseDownMessage,1,1,true);pointer(ui::kMouseMoveMessage,3,3,true);pointer(ui::kMouseUpMessage,3,3,true);if(document.historySize()!=1 || document.pixels()[2*8+2]!=0xff0000ff)throw std::runtime_error("Shape actual legacy right-button fallback");document.undo();useShapeTool(ShapeKind::Line);pointer(ui::kMouseDownMessage,0,0,true);pointer(ui::kMouseMoveMessage,7,2,true);pointer(ui::kMouseUpMessage,7,2,true);if(document.pixels()[0]!=0xff00ff00 || document.pixels()[2*8+7]!=0xff00ff00 || document.historySize()!=1)throw std::runtime_error("Line right-button/one history UI");document.undo();useShapeTool(ShapeKind::RectangleOutline);brushSizeInput_->setText("2");brushSizeInput_->Change();if(brushProfiles_[0].size!=2 || brushSizeInput_->hasFlags(ui::HIDDEN))throw std::runtime_error("Shape outline width property");key(ui::kKeyB);if(shapeTool_)throw std::runtime_error("Shape tool exit");brushProfiles_[0]={};shapeSpec_={};shapeRounded_=shapeRatio_=false;


  }
  void smokeImageBrush(){smoke_=true;document=Document(3,1);homeOpen_=false;documentOpen_=true;PatternBrush b;b.width=2;b.height=1;b.coverage={255,255};b.colors={0x800000ff,0xff00ff00};document.beginStroke({1,0},0xffffffff,{},&b);if(document.pixels()[0]!=b.colors[0] || document.pixels()[1]!=b.colors[1])throw std::runtime_error("Image brush actual RGBA stamp");document.cancelStroke();if(document.historySize()!=0 || document.dirty() || document.pixels()[0])throw std::runtime_error("Image brush cancel");ProjectBrushResource resource;resource.metadata.id="smoke-project-brush";resource.metadata.name="smoke";resource.metadata.width=2;resource.metadata.height=1;resource.brush=b;document.setImportedProjectBrushes({resource});selectFillLibraryBrush("project:smoke-project-brush",false,false);if(fillPattern_.brushes.size()!=1||fillPattern_.brushes[0].colors!=b.colors)throw std::runtime_error("Project brush UI selection");pencilImageBrushId_="project:smoke-project-brush";resolvePencilImageBrush();if(!pencilImageBrush_)throw std::runtime_error("Pencil project resource selection");brushProfiles_[0]={};eraser_=false;handTool_=selectionTool_=eyedropperTool_=gradientTool_=shapeTool_=false;fillTool_=false;smoke_=true;setBounds(gfx::Rect(0,0,1280,960));fitCanvas();refresh();auto at=gfx::Point(canvas_.x+int(1.5*canvasScale()),canvas_.y+int(.5*canvasScale()));ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,at);onProcessMessage(&down);enableFlags(ui::HAS_CAPTURE);ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,at);onProcessMessage(&up);disableFlags(ui::HAS_CAPTURE);if(document.pixels()[0]!=b.colors[0]||document.pixels()[1]!=b.colors[1]||document.historySize()!=1)throw std::runtime_error("Image brush pointer stroke");document.undo();if(document.pixels()[0]!=0)throw std::runtime_error("Image brush pointer undo");fillLibrarySelection_={};fillPattern_.brushes.clear();pencilImageBrushId_.clear();pencilImageBrush_.reset();document=Document();refresh();}
  void smokeEyedropper(){
    smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(4,3);homeOpen_=false;documentOpen_=true;paletteFocused_=false;requestFocus();fitCanvas();refresh();document.beginStroke({1,1},0x80443322,BrushOptions{1,100,BrushShape::Round});document.commitStroke();document.markSaved();const auto history=document.historySize();const auto pixels=document.pixels();
    auto key=[&](ui::MessageType type,ui::KeyScancode code,ui::KeyModifiers modifiers=ui::kKeyNoneModifier){ui::KeyMessage event(type,code,modifiers,0,0);onProcessMessage(&event);};
    auto pointer=[&](ui::MessageType type,int x,int y,bool right=false,ui::KeyModifiers modifiers=ui::kKeyNoneModifier){const auto at=gfx::Point(canvas_.x+int((x+.5)*canvasScale()),canvas_.y+int((y+.5)*canvasScale()));ui::MouseMessage event(type,os::PointerType::Mouse,right?ui::kButtonRight:ui::kButtonLeft,modifiers,at);onProcessMessage(&event);if(type==ui::kMouseDownMessage)enableFlags(ui::HAS_CAPTURE);else if(type==ui::kMouseUpMessage)disableFlags(ui::HAS_CAPTURE);};
    key(ui::kKeyDownMessage,ui::kKeyI);eyedropperSource_=EyedropperSource::CurrentLayer;if(!eyedropperTool_ || eyedropperSourceButton_->hasFlags(ui::HIDDEN))throw std::runtime_error("Eyedropper tool/properties tool="+std::to_string(eyedropperTool_)+" source="+std::to_string(eyedropperSourceButton_->isVisible()));
    pointer(ui::kMouseDownMessage,1,1,true);if(document.palette().secondary!=0x80443322)throw std::runtime_error("Eyedropper background alpha");pointer(ui::kMouseMoveMessage,2,1,true);pointer(ui::kMouseUpMessage,2,1,true);if(document.palette().secondary!=0)throw std::runtime_error("Eyedropper continuous transparent sample");
    key(ui::kKeyDownMessage,ui::kKeyB);key(ui::kKeyDownMessage,ui::kKeyAlt,ui::kKeyAltModifier);pointer(ui::kMouseDownMessage,1,1,false,ui::kKeyAltModifier);key(ui::kKeyUpMessage,ui::kKeyAlt);pointer(ui::kMouseUpMessage,1,1);if(eyedropperTool_ || eyedropperHeld_ || document.palette().primary!=0x80443322 || document.pixels()!=pixels || document.historySize()!=history || document.dirty())throw std::runtime_error("Temporary eyedropper restores tool without edit");
    document=Document();eyedropperTool_=eyedropperHeld_=paletteSamplingHeld_=false;eyedropperSource_=EyedropperSource::Composite;refresh();
  }
  void smokePaletteExtraction(){
    document=Document(3,2);homeOpen_=false;documentOpen_=true;paletteFocused_=false;requestFocus();fitCanvas();refresh();document.beginStroke({0,0},0xff0000ff);document.commitStroke();document.beginStroke({1,0},0xff00ff00);document.commitStroke();document.markSaved();const auto pixels=document.pixels();const auto oldOrder=document.palette().order();const auto history=document.historySize();
    openPaletteExtraction();if(pending_!=Pending::PaletteExtract || extractModeButton_->hasFlags(ui::HIDDEN) || extractNameInput_->hasFlags(ui::HIDDEN))throw std::runtime_error("Palette extraction modal");resolve(false);if(document.historySize()!=history || document.palette().order()!=oldOrder)throw std::runtime_error("Palette extraction cancel");
    openPaletteExtraction();paletteInput_->setText("1");resolve(true);if(pending_!=Pending::None || document.palette().order().size()!=1 || document.paletteEntry(document.palette().order()[0])->color!=0xff0000ff || document.historySize()!=history+1 || document.pixels()!=pixels)throw std::runtime_error("Palette extraction apply");document.undo();if(document.palette().order()!=oldOrder)throw std::runtime_error("Palette extraction undo");document.redo();if(document.palette().order().size()!=1)throw std::runtime_error("Palette extraction redo");
    document=Document(2,2);openPaletteExtraction();resolve(true);if(pending_!=Pending::PaletteExtract || document.historySize()!=0)throw std::runtime_error("Palette extraction empty must remain open");resolve(false);document=Document();refresh();
  }
  void smokeReplacePaletteSampling(){
    smoke_=true;document=Document(2,1);homeOpen_=false;documentOpen_=true;document.beginStroke({0,0},0x801e140a);document.commitStroke();document.markSaved();document.clearPaletteSelection();const auto pixels=document.pixels();const auto h=document.historySize();replaceLoaded_=true;replaceRemember_=true;replaceScope_="palette";replaceSource_=document.paletteEntry(1)->color;replaceDestination_=0x01020304;replacePreview_=true;paletteLocked_=true;refresh();openReplaceColor();if(document.displayPaletteEntry(1)->color!=replaceDestination_ || document.paletteEntry(1)->color==replaceDestination_ || document.dirty())throw std::runtime_error("Replacement palette isolated preview");resolve(false);if(document.historySize()!=h || document.paletteEntry(1)->color!=replaceSource_)throw std::runtime_error("Replacement palette cancel");openReplaceColor();resolve(true);if(document.historySize()!=h+1 || document.paletteEntry(1)->color!=replaceDestination_)throw std::runtime_error("Replacement palette apply");document.undo();
    replaceScope_="document";replacePreview_=false;selectionTool_=true;shapeTool_=gradientTool_=fillTool_=handTool_=eraser_=eyedropperTool_=false;openReplaceColor();beginReplaceSampling(1);eyedropperGesture_.begin(false,false);sampleEyedropperAt({0,0});finishEyedropper();if(replaceDestination_!=pixels[0] || pending_!=Pending::ReplaceColor || replaceSampling_!=-1 || !selectionTool_ || eyedropperTool_ || document.pixels()!=pixels)throw std::runtime_error("Replacement target sample returns modal/tool");beginReplaceSampling(0);eyedropperGesture_.begin(false,false);sampleEyedropperAt({1,0});ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(replaceSource_!=0 || pending_!=Pending::ReplaceColor || replaceSampling_!=-1 || !selectionTool_)throw std::runtime_error("Replacement sampling Escape returns modal");resolve(false);document=Document();selectionTool_=false;refresh();
  }
  void smokeColorReplacement(){
    smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(2,1);homeOpen_=false;documentOpen_=true;document.beginStroke({0,0},0x801e140a);document.commitStroke();document.markSaved();const auto pixels=document.pixels();const auto h=document.historySize();refresh();replaceLoaded_=true;replaceRemember_=true;replaceScope_="document";replaceSource_=pixels[0];replaceDestination_=0x01020304;replacePreview_=false;openReplaceColor();if(document.displayPixels()!=pixels)throw std::runtime_error("Replacement default preview off");replacePreview_=true;previewReplace();if(document.pixels()!=pixels || document.dirty() || document.displayPixels()[0]!=replaceDestination_)throw std::runtime_error("Replacement independent preview");resolve(false);if(document.historySize()!=h || document.pixels()!=pixels)throw std::runtime_error("Replacement cancel");openReplaceColor();resolve(true);if(document.historySize()!=h+1 || document.pixels()[0]!=replaceDestination_)throw std::runtime_error("Replacement apply");document.undo();if(document.pixels()!=pixels)throw std::runtime_error("Replacement undo");document=Document();refresh();
  }
  void smokeGifExport(){smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(2,1);homeOpen_=false;documentOpen_=true;refresh();const auto revision=document.revision(),h=document.historySize();openGifExport();if(pending_!=Pending::GifExport || gifInputs_[0]->hasFlags(ui::HIDDEN) || gifOptions_.scalePercent!=100 || gifOptions_.direction!=GifDirection::Forward || gifOptions_.trim || gifExplicitRange_)throw std::runtime_error("GIF defaults/modal");gifInputs_[0]->setText("200");gifInputs_[0]->Change();auto out=encodeAnimationGif(document,gifOptions_);if(out.width!=4 || out.height!=2)throw std::runtime_error("GIF modal scale");resolve(false);if(document.revision()!=revision || document.historySize()!=h || document.dirty())throw std::runtime_error("GIF cancel mutation");document=Document();refresh();}
  void smokeSpriteSheet(){smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(1,1);homeOpen_=false;documentOpen_=true;document.addFrame();refresh();auto h=document.historySize(),rev=document.revision();const bool dirtyBefore=document.dirty();openSpriteSheet();if(!sheetPreview_ || document.historySize()!=h || document.revision()!=rev || document.dirty()!=dirtyBefore)throw std::runtime_error("Sheet preview mutated document");if(sheetButtons_[0]->hasFlags(ui::HIDDEN)||sheetOptions_.layout!=SheetLayout::Rows||sheetOptions_.constraint!=SheetConstraint::None)throw std::runtime_error("Sheet default UI");auto image=encodeSpriteSheet(document,sheetOptions_);if(image.width!=2||image.height!=1)throw std::runtime_error("Sheet all frames UI");resolve(false);if(document.historySize()!=h||document.revision()!=rev||document.dirty()!=dirtyBefore)throw std::runtime_error("Sheet cancel mutation");document=Document();refresh();}
  void smokeStaticExport(){smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(3,2);homeOpen_=false;documentOpen_=true;refresh();const auto h=document.historySize(),rev=document.revision();openStaticExport();if(exportScaleInput_->hasFlags(ui::HIDDEN)||exportOptions_.scalePercent!=100||exportOptions_.trim)throw std::runtime_error("Static export defaults/UI");exportScaleInput_->setText("200");exportScaleInput_->Change();auto out=encodeStaticImagePng(document,exportOptions_);if(out.width!=6||out.height!=4)throw std::runtime_error("Static export percentage");resolve(false);if(document.historySize()!=h||document.revision()!=rev||document.dirty())throw std::runtime_error("Static export cancel mutation");document=Document();refresh();}
  void smokeImageResize(){smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(2,1);documentOpen_=true;homeOpen_=false;refresh();auto h=document.historySize();openImageResize();resizeInputs_[0]->setText("4");resizeInputs_[0]->Change();if(resizeHeight_!=2)throw std::runtime_error("Image resize aspect");resolve(false);if(document.width()!=2||document.historySize()!=h)throw std::runtime_error("Image resize cancel");openImageResize();resizeInputs_[0]->setText("4");resizeInputs_[0]->Change();resolve(true);if(document.width()!=4||document.height()!=2||document.historySize()!=h+1)throw std::runtime_error("Image resize apply");document.undo();if(document.width()!=2||document.height()!=1)throw std::runtime_error("Image resize undo");document=Document();refresh();}
  void smokeColorAdjustments(){
    smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(2,1);homeOpen_=false;documentOpen_=true;document.beginStroke({0,0},0x801e140a);document.commitStroke();document.markSaved();const auto pixels=document.pixels();const auto h=document.historySize();refresh();openColorAdjustment(ColorAdjustmentKind::BrightnessContrast);adjustmentInputs_[0]->setText("20");adjustmentInputs_[0]->Change();if(document.pixels()!=pixels || document.dirty() || document.displayPixels()[0]==pixels[0])throw std::runtime_error("Adjustment independent preview");resolve(false);if(document.historySize()!=h || document.pixels()!=pixels)throw std::runtime_error("Adjustment cancel");openColorAdjustment(ColorAdjustmentKind::HueSaturation);adjustmentInputs_[0]->setText("120");adjustmentInputs_[0]->Change();resolve(true);if(document.historySize()!=h+1 || (document.pixels()[0]>>24)!=128)throw std::runtime_error("Adjustment apply");document.undo();if(document.pixels()!=pixels)throw std::runtime_error("Adjustment undo");document=Document();refresh();
  }
  void smokeSymmetry(){
    smoke_=true;setBounds(gfx::Rect(0,0,1280,960));const auto savedAxes=persistedSymmetryAxes_;document=Document(8,8);homeOpen_=false;documentOpen_=true;requestFocus();fitCanvas();refresh();symmetryInitialized_=false;toggleSymmetry(1);layoutToolOptions();if(!document.symmetryAxes.vertical || !symmetryButtons_[1]->active)throw std::runtime_error("Symmetry toggle");const auto history=document.historySize();const auto center=document.symmetryCenter();symmetryLocked_=true;if(symmetryHit(gfx::Point(int(canvas_.x+center.x*canvasScale()),int(canvas_.y+center.y*canvasScale()))))throw std::runtime_error("Symmetry lock");if(!symmetryHit(gfx::Point(int(canvas_.x+center.x*canvasScale()),int(canvas_.y+center.y*canvasScale())),true))throw std::runtime_error("Symmetry Ctrl override");symmetryDragging_=true;symmetryDragBefore_=center;document.setSymmetryCenter({1.5,2},false);finishSymmetryDrag(true);if(document.symmetryCenter().x!=center.x || document.historySize()!=history)throw std::runtime_error("Symmetry axis cancel");symmetryLocked_=false;persistedSymmetryAxes_=savedAxes;document=Document();refresh();
  }
  void smokeSheetImport(){const auto saved=document;document=Document::fromImage(4,2,std::vector<Pixel>(8,0xff123456),U"sheet");openSheetImport(false);if(pending_!=Pending::SheetImport||importSheetOptions_.layout!=2||importSheetOptions_.width!=16)throw std::runtime_error("Sheet import defaults");resolve(false);if(document.width()!=4)throw std::runtime_error("Sheet import cancel");openSheetImport(false);importSheetOptions_.width=2;importSheetOptions_.height=1;resolve(true);if(document.width()!=2||document.timeline().state().frames.size()!=4)throw std::runtime_error("Sheet import apply");document.undo();if(document.width()!=4||document.height()!=2)throw std::runtime_error("Sheet import UI undo");document=saved;refresh();}
  void smokeAnimation() {
    smokeSheetImport();smokeSymmetry();
    smokeImageBrush();smokeEyedropper();smokePaletteExtraction();smokeColorAdjustments();smokeColorReplacement();smokeReplacePaletteSampling();smokeImageResize();smokeStaticExport();smokeSpriteSheet();smokeGifExport();
    const auto beforeOnion=onion_;const auto documentBefore=document;document=Document(2,1);document.beginStroke({0,0},0xffffffff);document.commitStroke();document.addLinkedFrame();if(!document.cel().linkedCelId)throw std::runtime_error("Linked UI document failed");document.addFrame();document.markSaved();const auto historyBefore=document.historySize();onion_.enabled=true;ensureContentCache();if(document.dirty() || document.historySize()!=historyBefore)throw std::runtime_error("Onion canvas cache changed document");onion_.showDuringPlayback=false;renderer_.setOnionSkin(onion_,true);renderer_.sync(document);onion_=beforeOnion;document=documentBefore;
    document=Document(2,2);document.beginStroke({0,0},0xff123456);document.commitStroke();document.addLayer();document.beginStroke({1,1},0xffabcdef);document.commitStroke();document.addFrame(true);document.setFrameDuration(200);document.addFrame();document.setFrameDuration(300);seekFrame(1);const auto history=document.historySize();document.markSaved();togglePlayback();if(!playing_)throw std::runtime_error("Playback did not start");playbackDue_=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);playbackTick();if(document.activeFrameIndex()!=2 || document.dirty() || document.historySize()!=history)throw std::runtime_error("Playback changed document/history or wrong frame");togglePlayback();const auto stopped=document.frame().id;playbackDue_=std::chrono::steady_clock::now()-std::chrono::seconds(1);playbackTick();if(playing_ || document.frame().id!=stopped)throw std::runtime_error("Pause advanced frame");showFrameDuration();paletteInput_->setText("450");paletteInput_->Change();resolve(false);if(document.frame().duration!=450)throw std::runtime_error("Frame properties close did not commit");document.undo();if(document.frame().duration!=300)throw std::runtime_error("Frame duration undo");document.setImportedLoop(false);togglePlayback();if(document.activeFrameIndex()!=0)throw std::runtime_error("Once playback did not start first frame");playbackDue_=std::chrono::steady_clock::now()-std::chrono::seconds(2);playbackTick();if(playing_ || document.activeFrameIndex()!=0)throw std::runtime_error("Once playback completion");document.selectFrameHeader(document.timeline().state().frames.front().id);document.selectFrameHeader(document.timeline().state().frames.back().id,2);const auto loopHistory=document.historySize();openLoopEditor();resolve(false);if(document.historySize()!=loopHistory || !document.timeline().state().loopSections.empty())throw std::runtime_error("Loop cancel mutated document");openLoopEditor();loopInputs_[3]->setText("1");resolve(true);if(document.timeline().state().loopSections.size()!=1)throw std::runtime_error("Loop save failed");startLoopPlayback(document.timeline().state().loopSections.front().id);playbackDue_=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);playbackTick();const auto loopPaused=document.frame().id;togglePlayback();togglePlayback();if(document.frame().id!=loopPaused)throw std::runtime_error("Loop pause lost position");playing_=false;loopPlayback_={};document=Document(4,3);frameSelectionExplicit_=false;setBounds(gfx::Rect(0,0,1280,960));fitCanvas();refresh();useSelectionTool();auto gesture=[&](ui::MessageType type,int x,int y){const auto point=gfx::Point(canvas_.x+int((x+.5)*canvasScale()),canvas_.y+int((y+.5)*canvasScale()));ui::MouseMessage mouse(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);onProcessMessage(&mouse);};gesture(ui::kMouseDownMessage,0,0);gesture(ui::kMouseMoveMessage,1,1);gesture(ui::kMouseUpMessage,1,1);if(!document.selection() || document.selection()->width!=2 || document.dirty())throw std::runtime_error("Rectangle UI gesture/history");menuCommands_.invoke("invertSelection");if(selectionContains(document.selection(),0,0) || !selectionContains(document.selection(),3,2))throw std::runtime_error("Selection menu inverse");document.undo();if(document.dirty())throw std::runtime_error("Selection UI undo dirty");menuCommands_.invoke("deselect");if(document.selection())throw std::runtime_error("Selection menu deselect");selectionPivotVisible_=false;document=Document(16,12);document.beginStroke({8,6},0xff123456);document.commitStroke();document.commitSelection({},SelectionMask{2,1,12,10,{}});fitCanvas();refresh();gesture(ui::kMouseDownMessage,8,6);gesture(ui::kMouseMoveMessage,9,7);gesture(ui::kMouseUpMessage,9,7);if(!document.floating() || document.pixels()[104]!=0 || document.pixels()[121]!=0xff123456)throw std::runtime_error("Content lift UI gesture");document.cancelFloatingPaste();auto edgeGesture=[&](ui::MessageType type,int x){ui::MouseMessage mouse(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,gfx::Point(canvas_.x+int(x*canvasScale()),canvas_.y+int(4.0*canvasScale())));onProcessMessage(&mouse);};edgeGesture(ui::kMouseDownMessage,2);edgeGesture(ui::kMouseMoveMessage,3);edgeGesture(ui::kMouseUpMessage,3);if(document.floating() || document.selection()->x!=3 || document.pixels()[104]!=0xff123456)throw std::runtime_error("Boundary UI gesture");document.undo();ui::KeyMessage nudge(ui::kKeyDownMessage,ui::kKeyRight,ui::kKeyShiftModifier,0,0);onProcessMessage(&nudge);if(!document.floating() || document.selection()->x!=3 || document.pixels()[105]!=0xff123456)throw std::runtime_error("Selection arrow UI distance");ui::KeyMessage escapeMove(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escapeMove);if(document.floating() || document.pixels()[104]!=0xff123456)throw std::runtime_error("Selection arrow UI cancel");selectionTool_=false;document=Document();refresh();smokeSelectionTools();
  }
  void smokeStrokePerformance() {
    const auto saved=document;const auto savedCanvas=canvas_;const auto savedZoom=zoom_;
    const auto savedBrush=brushProfiles_[0];const auto savedInk=ink_;const auto savedPreview=previewPanelOpen_;
    previewPanelOpen_=false;eraser_=false;handTool_=false;spaceHeld_=false;ink_=0xff3366cc;brushProfiles_[0]={1,100,BrushShape::Round};
    const auto target=os::instance()->makeRgbaSurface(bounds().w,bounds().h);
    std::ofstream report("stroke-performance.txt");
    report<<"Native mouse-message + software paint replay; 512 preserved serpentine samples. Full chrome excludes child paints (old lower bound); not hardware input-to-photon latency.\n";
    auto send=[&](ui::MessageType type,gfx::Point point) {ui::MouseMessage msg(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);onProcessMessage(&msg);};
    for(bool full:{true,false}) {
      document=Document();fitCanvas();ensureContentCache();
      std::vector<double> inputTimes,paintTimes;const auto initialChrome=chromePaints_;
      for(int i=0;i<512;++i) {
        const int y=i/32,x=(y%2)?31-i%32:i%32;
        const gfx::Point mouse(canvas_.x+int((x+0.5)*canvasScale()),canvas_.y+int((y+0.5)*canvasScale()));
        const auto start=std::chrono::steady_clock::now();send(i?ui::kMouseMoveMessage:ui::kMouseDownMessage,mouse);
        const auto inputEnd=std::chrono::steady_clock::now();
        if(document.pixels()[y*32+x]!=ink_) throw std::runtime_error("Stroke replay endpoint mismatch");
        ui::Graphics g(target);g.saveClip();
        if(!full) {auto clip=changedCanvasPixels();clip.offset(-bounds().x,-bounds().y);g.clipRect(clip);}
        ui::PaintEvent ev(this,&g);onPaint(ev);g.restoreClip();
        const auto end=std::chrono::steady_clock::now();
        inputTimes.push_back(std::chrono::duration<double,std::micro>(inputEnd-start).count());
        paintTimes.push_back(std::chrono::duration<double,std::micro>(end-inputEnd).count());
      }
      auto metrics=[&](std::vector<double> values) {std::sort(values.begin(),values.end());double total=0;for(auto v:values) total+=v;report<<" mean_us="<<total/values.size()<<" p95_us="<<values[values.size()*95/100]<<" max_us="<<values.back();};
      report<<(full?"full-chrome":"dirty-canvas")<<" input";metrics(inputTimes);report<<" paint";metrics(paintTimes);report<<" chrome_paints="<<(chromePaints_-initialChrome)<<"\n";
      if(!full && chromePaints_!=initialChrome) throw std::runtime_error("Stroke redraw escaped canvas");
      document.commitStroke();if(hasCapture()) releaseMouse();
      document.undo();for(auto pixel:document.pixels()) if(pixel) throw std::runtime_error("Stroke replay undo mismatch");
      document.redo();for(int i=0;i<512;++i) if(document.pixels()[i]!=ink_) throw std::runtime_error("Stroke replay redo mismatch");
    }
    for(double testZoom:{1.0,2.0,4.0,8.0,16.0}) {
      document=Document();zoom_=testZoom;const auto view=canvasViewport();
      const int side=int(32*canvasScale());canvas_=gfx::Rect(view.x+(view.w-side)/2,view.y+(view.h-side)/2,side,side);
      for(int brushSize:{1,5,64}) {
        brushProfiles_[0]={brushSize,50,BrushShape::Round};
        for(const auto point:{Point{14,14},Point{18,15},Point{15,18}}) {
          const gfx::Point at(canvas_.x+int((point.x+0.5)*canvasScale()),canvas_.y+int((point.y+0.5)*canvasScale()));
          send(document.active()?ui::kMouseMoveMessage:ui::kMouseDownMessage,at);
          if(document.pixels()[point.y*32+point.x]==0) throw std::runtime_error("Zoom/brush replay endpoint mismatch");
        }
        document.cancelStroke();if(hasCapture()) releaseMouse();
        for(auto pixel:document.pixels()) if(pixel) throw std::runtime_error("Zoom/brush cancel mismatch");
      }
    }
    report<<"Static centers and rapid folded endpoints passed at zoom 1/2/4/8/16, brush 1/5/64, opacity50; cancel restored all pixels.\n";
    document=saved;canvas_=savedCanvas;zoom_=savedZoom;brushProfiles_[0]=savedBrush;ink_=savedInk;previewPanelOpen_=savedPreview;refresh();
  }
  void smokeResize() {
    const auto original=bounds();const auto origin=canvas_;const auto pixels=document.pixels();const auto history=document.historySize();const auto dirty=document.dirty();const auto zoom=zoom_;
    for(const auto size:{gfx::Size(720,600),gfx::Size(1024,768),gfx::Size(1600,1000)}){
      const auto before=canvasViewport().center();ui::ResizeEvent resize(this,gfx::Rect(original.x,original.y,size.w,size.h));onResize(resize);
      const auto l=workspaceLayout(uiLogical(bounds()));if(l.workspaceContent().w<=0 || l.workspaceContent().h<=0 || l.pickerGradient(true).h<=0)throw std::runtime_error("Invalid resize layout");
      const auto point=canvasPoint(gfx::Point(canvas_.x+int(3.5*canvasScale()),canvas_.y+int(4.5*canvasScale())));
      if(point.x!=3 || point.y!=4 || zoom_!=zoom || document.pixels()!=pixels || document.historySize()!=history || document.dirty()!=dirty)throw std::runtime_error("Resize altered view scale or document");
    }
    ui::ResizeEvent restore(this,original);onResize(restore);if(canvas_!=origin)throw std::runtime_error("Resize roundtrip pan changed");
  }
  void smokeSkinResize(const std::filesystem::path& directory) {
    font_.smokeRasterEquivalent();
    colorPicker_->smokeSurfacePixels();
    // Every size uses the sheet's black/white/black frame, excluding its interior.
    for(int size=0;size<5;++size) {
      PixelButton swatch(font_,skin_,U"",[]{});swatch.paletteCell=true;swatch.active=true;
      const int side=swatchPixels_[size]+4*uiScale;
      const gfx::Rect box(18,26,side,side);swatch.setBounds(box);
      auto renderedFrame=os::instance()->makeRgbaSurface(box.x2()+2,box.y2()+2);renderedFrame->clear();
      {ui::Graphics graphics(renderedFrame);UiPaintScale scale(graphics);skin_.drawSelection(graphics,uiLogical(box),false);}
      for(int y=box.y-1;y<=box.y2();++y) for(int x=box.x-1;x<=box.x2();++x) {
        const bool inside=box.contains(gfx::Point(x,y));
        const bool frame=inside && (x<box.x+3*uiScale || x>=box.x2()-3*uiScale || y<box.y+3*uiScale || y>=box.y2()-3*uiScale);
        const auto nativeWindow=display()->nativeWindow();
        const auto screenPosition=nativeWindow->pointToScreen(gfx::Point(x,y));
        const auto localPosition=nativeWindow->pointFromScreen(screenPosition);
        const bool painted=gfx::geta(renderedFrame->getPixel(x,y))!=0;
        if(localPosition!=gfx::Point(x,y) || swatch.paletteSelectionContains(localPosition)!=frame || frame!=painted)
          throw std::runtime_error("Palette selection hover hit region differs from visible frame");
      }
      swatch.active=false;
      if(swatch.paletteSelectionContains(box.origin())) throw std::runtime_error("Unselected palette frame is hoverable");
    }
    for(int size=0;size<5;++size) for(bool light:{false,true}) for(bool selected:{false,true}) {
      PixelButton swatch(font_,skin_,U"",[]{});swatch.paletteCell=true;swatch.active=selected;
      swatch.foregroundMarker=swatch.backgroundMarker=true;
      swatch.paletteMarkerSize=size<2?0:size<4?1:2;swatch.swatch=light?0xffffffff:0xff000000;
      const int cell=swatchPixels_[size]/uiScale,inset=selected?2:0,side=(cell+2*inset)*uiScale;
      swatch.setBounds(gfx::Rect(0,0,side,side));
      auto surface=os::instance()->makeRgbaSurface(side,side);surface->clear();
      {ui::Graphics graphics(surface);ui::PaintEvent event(&swatch,&graphics);swatch.onPaint(event);}
      const auto ink=light?gfx::rgba(0,0,0):gfx::rgba(255,255,255);
      const int begin=(inset+1)*uiScale,end=(inset+cell-1)*uiScale;int marked=0;
      for(int y=begin;y<end;++y) for(int x=begin;x<end;++x) if(surface->getPixel(x,y)==ink) ++marked;
      const int foregroundPixels[]{12,39,80},backgroundPixels[]{3,12,33};
      if(surface->getPixel(begin,begin)!=ink || surface->getPixel(end-1,end-1)!=ink ||
         marked!=(foregroundPixels[swatch.paletteMarkerSize]+backgroundPixels[swatch.paletteMarkerSize])*uiScale*uiScale)
        throw std::runtime_error("Palette role marker shape, size or contrast differs from user reference");
    }
    // A surrounding selection must preserve every interior color pixel.
    int colorPixels=-1;gfx::Color normalEdge=0;
    for(int state=0;state<3;++state) {
      PixelButton swatch(font_,skin_,U"",[]{});swatch.paletteCell=true;
      swatch.swatch=0xff556677;swatch.active=state!=0;
      if(state==2) swatch.enableFlags(ui::HAS_MOUSE);
      const int side=(swatch.active?15:11)*uiScale;
      swatch.setBounds(gfx::Rect(0,0,side,side));
      auto surface=os::instance()->makeRgbaSurface(side,side);surface->clear();
      {ui::Graphics graphics(surface);ui::PaintEvent event(&swatch,&graphics);swatch.onPaint(event);}
      const auto color=gfx::rgba(0x77,0x66,0x55);int pixels=0;
      for(int y=0;y<side;++y) for(int x=0;x<side;++x) if(surface->getPixel(x,y)==color) ++pixels;
      if(state==0) colorPixels=pixels;
      else {
        if(pixels!=colorPixels || swatch.paletteColorBounds().w!=11*uiScale)
          throw std::runtime_error("Palette selection reduced the color interior");
        const auto edge=surface->getPixel(uiScale,side/2);
        if(state==1) normalEdge=edge;
        else if(edge==normalEdge) throw std::runtime_error("Selected palette hover has no visual change");
      }
    }
    // Oracle is the previous fixed-corner, tiled-edge/center implementation.
    auto oldDraw=[](ui::Graphics& g,const SkinPatch& p,gfx::Rect rc) {
      const auto& b=*p.bitmap;auto source=os::instance()->makeRgbaSurface(b.width,b.height);
      for(int y=0;y<b.height;++y) for(int x=0;x<b.width;++x) {
        const auto v=b.pixels[y*b.width+x];source->putPixel(gfx::rgba(v&255,(v>>8)&255,(v>>16)&255,v>>24),x,y);
      }
      source->setImmutable();auto tiled=os::instance()->makeRgbaSurface(rc.w,rc.h);tiled->clear();
      const int left=std::min(p.left,rc.w/2),right=std::min(p.right,rc.w-left);
      const int top=std::min(p.top,rc.h/2),bottom=std::min(p.bottom,rc.h-top);
      const int sx[]{0,p.left,b.width-right},sy[]{0,p.top,b.height-bottom};
      const int sw[]{left,b.width-p.left-p.right,right},sh[]{top,b.height-p.top-p.bottom,bottom};
      const int dx[]{0,left,rc.w-right},dy[]{0,top,rc.h-bottom};
      const int dw[]{left,rc.w-left-right,right},dh[]{top,rc.h-top-bottom,bottom};
      for(int row=0;row<3;++row) for(int col=0;col<3;++col) {
        if(sw[col]<=0 || sh[row]<=0) continue;
        for(int y=0;y<dh[row];y+=sh[row]) for(int x=0;x<dw[col];x+=sw[col])
          tiled->drawRgbaSurface(source.get(),sx[col],sy[row],dx[col]+x,dy[row]+y,std::min(sw[col],dw[col]-x),std::min(sh[row],dh[row]-y));
      }
      g.drawRgbaSurface(tiled.get(),rc.x,rc.y);
    };
    Skin test;test.assets=skin_.assets;
    auto bitmap=std::make_shared<SkinBitmap>();bitmap->width=7;bitmap->height=8;
    for(int y=0;y<8;++y) for(int x=0;x<7;++x)
      bitmap->pixels.push_back(((x+y)%3==0?0x80000000u:0xff000000u)|Pixel(x*31)|Pixel(y*29)<<8|0x00440000u);
    test.assets.patches["texture-test"]={bitmap,2,1,1,2};
    test.assets.patches["zero-border-test"]={bitmap,0,0,1,0};
    int cases=0;
    for(const auto slot:{"panel_outer","panel_content","timeline.frame","timeline.grid","document_frame","button.normal","entry.normal","slider.normal","selection.normal","selection.hover","texture-test","zero-border-test"}) {
      if(!test.assets.patches.count(slot)) continue;
      for(const auto size:{gfx::Size(1,1),gfx::Size(5,7),gfx::Size(29,23),gfx::Size(480,280)}) {
        for(int scale:{1,2}) {
          const int w=(size.w+12)*scale+10,h=(size.h+12)*scale+10;
          auto before=os::instance()->makeRgbaSurface(w,h),after=os::instance()->makeRgbaSurface(w,h);
          before->clear();after->clear();
          {ui::Graphics a(before),b(after);a.fillRect(gfx::rgba(37,45,59),gfx::Rect(0,0,w,h));b.fillRect(gfx::rgba(37,45,59),gfx::Rect(0,0,w,h));}
          {
            ui::Graphics a(nullptr,before,5,7),b(nullptr,after,5,7);
            a.clipRect(gfx::Rect(1,2,w-8,h-10));b.clipRect(gfx::Rect(1,2,w-8,h-10));
            std::unique_ptr<UiPaintScale> sa,sb;
            if(scale==2){sa=std::make_unique<UiPaintScale>(a);sb=std::make_unique<UiPaintScale>(b);}
            const gfx::Rect rect(3,4,size.w,size.h);oldDraw(a,test.assets.patches.at(slot),rect);test.draw(b,slot,rect);
          }
          for(int y=0;y<h;++y) for(int x=0;x<w;++x) if(before->getPixel(x,y)!=after->getPixel(x,y))
            throw std::runtime_error(std::string("Skin resize pixels differ: ")+slot+" "+std::to_string(size.w)+"x"+std::to_string(size.h)+" scale "+std::to_string(scale)+" at "+std::to_string(x)+","+std::to_string(y));
          ++cases;
        }
      }
    }
    auto frame=os::instance()->makeRgbaSurface(800,600);ui::Graphics g(frame);
    auto benchmark=[&](bool old) {
      const auto start=std::chrono::steady_clock::now();
      for(int i=0;i<40;++i) for(const auto slot:{"panel_outer","panel_content","timeline.frame","timeline.grid"}) {
        const gfx::Rect rc(3,4,480+i,280+i);
        if(old)oldDraw(g,test.assets.patches.at(slot),rc);else test.draw(g,slot,rc);
      }
      return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
    };
    const auto oldMs=benchmark(true),newMs=benchmark(false);
    std::ofstream report(directory/"skin-resize-benchmark.txt");
    report<<"pixel_cases="<<cases<<"\nframes=40\nold_skin_ms="<<oldMs<<"\nnew_skin_ms="<<newMs<<"\nspeedup="<<oldMs/newMs<<"\n";
  }
  void smokeColorPicker() {colorPickerOpen_=true;panelTabs_[0]->Click();refresh();}
  void smokePickerLightBackground() {document.setPaletteRole(0x804433ff,false,true);document.setPaletteRole(0x000000ff,true,true);refresh();}
  void smokeRange(bool focused=true) {commands_[1]->Click();brushOpacityInput_->requestFocus();showBrushRange(true);brushRange_->value=72;brushRange_->changed(72);if(focused) brushRange_->requestFocus();}
  void smokeDialog() {
    requestClose();
    if(pending_!=Pending::Close || !keep_->isVisible()) throw std::runtime_error("Dialog did not open");
  }
  void smokePreviewPanel() {
    const auto pixels=document.pixels();const auto history=document.historySize();
    if(!previewPanelOpen_)menuCommands_.invoke("togglePreviewPanel");
    if(!previewPanel_->isVisible() || !panelTabs_[0]->labelOnly || panelTabs_[0]->tab || !swatches_[0]->isVisible() ||
       document.pixels()!=pixels || document.historySize()!=history)
      throw std::runtime_error("Floating preview changed document or palette geometry");
  }
  void smokeDismissDialog(){resolve(false);}
  void smokeMenu(int phase,int index=5) {
    auto top=static_cast<ui::MenuItem*>(menuBar_->getMenu()->children()[index+1]);
    if(phase==0) {status_=U"矩形框选工具 · 未接入 · 单击或右键展开工具组";invalidate();top->openSubmenu();}
    else if(phase==1) {
      if(!top->hasSubmenuOpened()) throw std::runtime_error("Menu did not open");
      auto popup=top->getSubmenu()->window();
      if(popup->bounds().w>bounds().w || popup->bounds().h>bounds().h)throw std::runtime_error("Menu exceeds viewport without scrolling");
      gfx::Region mask;
      popup->getRegion(mask);
      gfx::Region missing(popup->bounds());missing-=mask;
      if(mask.isEmpty() || !missing.isEmpty()) throw std::runtime_error("Menu window has no complete occlusion mask");
      gfx::Region background;
      getDrawableRegion(background,ui::Widget::kCutTopWindows);
      background&=mask;
      if(!background.isEmpty()) throw std::runtime_error("Background repaint overlaps the open menu");
      menuBar_->cancelMenuLoop();
    } else if(top->hasSubmenuOpened()) throw std::runtime_error("Menu did not close");
  }
  void smokeNavigation() {
    const auto pixels=document.pixels();const auto history=document.historySize();const bool dirty=document.dirty();
    const auto original=canvas_;const double scale=zoom_;
    auto check=[n=0](bool ok)mutable{++n;if(!ok)throw std::runtime_error("Canvas navigation smoke failed check "+std::to_string(n));};
    auto send=[&](ui::MessageType type,ui::MouseButton button,gfx::Point point) {
      ui::MouseMessage msg(type,os::PointerType::Mouse,button,ui::kKeyNoneModifier,point);onProcessMessage(&msg);
    };
    auto key=[&](ui::MessageType type,ui::KeyScancode code) {
      ui::KeyMessage msg(type,code,ui::kKeyNoneModifier,0,0);onProcessMessage(&msg);
    };
    ensureContentCache();
    const auto builds=renderer_.uploads(),chrome=chromePaints_;
    auto before=os::instance()->makeRgbaSurface(bounds().w,bounds().h);
    auto after=os::instance()->makeRgbaSurface(bounds().w,bounds().h);
    auto render=[&](const os::SurfaceRef& target) {
      ui::Graphics graphics(target);graphics.clipRect(canvasViewport());
      ui::PaintEvent ev(this,&graphics);onPaint(ev);
    };
    render(before);
    const auto start=canvasViewport().center();
    send(ui::kMouseDownMessage,ui::kButtonMiddle,start);check(pan_.active && hasCapture() && std::string(cursorAt(start))=="grabbing");
    send(ui::kMouseMoveMessage,ui::kButtonMiddle,start+gfx::Point(1,1));
    check(canvas_.x==original.x+1 && canvas_.y==original.y+1);
    render(after);
    check(renderer_.uploads()==builds && chromePaints_==chrome);
    {
      os::SurfaceLock first(before.get()),second(after.get());
      for(int y=original.y-6;y<original.y2()+6;++y)
        for(int x=original.x-6;x<original.x2()+6;++x)
          check(before->getPixel(x,y)==after->getPixel(x+1,y+1));
    }
    send(ui::kMouseMoveMessage,ui::kButtonMiddle,start+gfx::Point(23,17));
    check(canvas_.x==original.x+23 && canvas_.y==original.y+17);
    send(ui::kMouseUpMessage,ui::kButtonLeft,start);check(pan_.active);
    send(ui::kMouseUpMessage,ui::kButtonMiddle,start+gfx::Point(23,17));check(!pan_.active && !hasCapture());
    const auto moved=canvas_;
    key(ui::kKeyDownMessage,ui::kKeySpace);
    send(ui::kMouseDownMessage,ui::kButtonLeft,start);check(pan_.active);
    key(ui::kKeyUpMessage,ui::kKeySpace);check(pan_.active && !spaceHeld_);
    send(ui::kMouseMoveMessage,ui::kButtonLeft,start+gfx::Point(-19,9));
    key(ui::kKeyDownMessage,ui::kKeyEsc);check(!pan_.active && canvas_==moved && !hasCapture());
    key(ui::kKeyDownMessage,ui::kKeyH);check(handTool_);
    send(ui::kMouseDownMessage,ui::kButtonLeft,start);
    send(ui::kMouseMoveMessage,ui::kButtonLeft,gfx::Point(-10000,10000));
    const auto viewport=canvasViewport();
    check(canvas_.x==clampCanvasAxis(-10000,viewport.x,viewport.w,canvas_.w));
    send(ui::kMouseUpMessage,ui::kButtonLeft,gfx::Point(-10000,10000));check(!pan_.active);
    key(ui::kKeyDownMessage,ui::kKeyF);check(canvas_==original);
    // Blank workspace is also a pan target; loss of focus cancels safely.
    const auto blank=viewport.origin()+gfx::Point(2,2);
    send(ui::kMouseDownMessage,ui::kButtonMiddle,blank);check(pan_.active);
    send(ui::kMouseMoveMessage,ui::kButtonMiddle,blank+gfx::Point(12,8));
    ui::FocusMessage focus(ui::kFocusLeaveMessage,this,nullptr);onProcessMessage(&focus);
    check(!pan_.active && !spaceHeld_ && !hasCapture() && canvas_==original);
    key(ui::kKeyDownMessage,ui::kKeySpace);
    send(ui::kMouseDownMessage,ui::kButtonLeft,start);
    send(ui::kMouseMoveMessage,ui::kButtonLeft,start+gfx::Point(20,10));
    // laf sends a button-less mouse-up when the OS window is deactivated.
    send(ui::kMouseUpMessage,ui::kButtonNone,start);
    check(!pan_.active && !spaceHeld_ && !hasCapture() && canvas_==original);
    key(ui::kKeyDownMessage,ui::kKeyB);check(!handTool_);
    send(ui::kMouseDownMessage,ui::kButtonMiddle,gfx::Point(bounds().x+2,bounds().y+2));check(!pan_.active);
    check(document.pixels()==pixels && document.historySize()==history && document.dirty()==dirty && zoom_==scale);
    // Draw at a known document coordinate after a pan, then cancel the stroke.
    send(ui::kMouseDownMessage,ui::kButtonMiddle,start);
    send(ui::kMouseUpMessage,ui::kButtonMiddle,start+gfx::Point(13,7));
    const gfx::Point zoomAnchor(canvas_.x+8*canvasScale(),canvas_.y+9*canvasScale());
    zoomCanvas(zoomAnchor,1);
    check(canvasPoint(zoomAnchor).x==8 && canvasPoint(zoomAnchor).y==9);
    zoomCanvas(zoomAnchor,-1);
    send(ui::kMouseDownMessage,ui::kButtonLeft,gfx::Point(canvas_.x+2*canvasScale()+1,canvas_.y+3*canvasScale()+1));
    check(document.pixels()[3*32+2]==ink_);
    key(ui::kKeyDownMessage,ui::kKeySpace);
    send(ui::kMouseDownMessage,ui::kButtonMiddle,start);check(!pan_.active && document.active());
    key(ui::kKeyDownMessage,ui::kKeyEsc);key(ui::kKeyUpMessage,ui::kKeySpace);
    fitCanvas();check(canvas_==original && document.pixels()==pixels && document.historySize()==history);
  }
  void smokeRecovery(const std::filesystem::path& dir) {
    auto previous=std::move(document);auto previousPath=documentPath_;document=Document();playing_=false;document.beginStroke({1,1},0xff112233);document.commitStroke();document.setLayerVisible(false);document.setLayerOpacity(.4);
    recoveryDirectory_=dir/"native-recovery-smoke";
    for(int i=0;i<200;++i){recoveryTick(true);if(recoveryWorker_.valid())recoveryWorker_.wait();if(!project::listRecoveryRecords(recoveryDirectory_).empty())break;}
    auto records=project::listRecoveryRecords(recoveryDirectory_);if(records.empty())throw std::runtime_error("Recovery write smoke failed");
    const auto record=records.front();restoreRecovery(recoveryDirectory_/std::filesystem::u8path(record.id+".moonsprite"),record.id,U"测试恢复");
    if(pending_!=Pending::Open)throw std::runtime_error("Recovery dirty protection failed");resolve(false);
    restoreRecovery(recoveryDirectory_/std::filesystem::u8path(record.id+".moonsprite"),record.id,U"测试恢复");resolve(true);
    if(!document.dirty() || !documentPath_.empty() || document.name()!=U"测试恢复（恢复）" || document.pixels()[33]!=0xff112233 || document.layer().visible || document.layer().opacity!=.4)throw std::runtime_error("Recovery restore smoke failed");
    document=std::move(previous);documentPath_=previousPath;if(recoveryWorker_.valid()){recoveryWorker_.get();if(recoveryTicket_)recoveryQueue_.complete(*recoveryTicket_,true);recoveryTicket_.reset();}recoveryDirectory_.clear();ownedRecoveryId_.clear();fitCanvas();refresh();
  }
  void smokeSave(const std::filesystem::path& directory) {
    auto check=[](bool ok){if(!ok)throw std::runtime_error("Project save lifecycle smoke failed");};
    auto previous=std::move(document);auto oldPath=documentPath_;document=Document(3,2);documentPath_.clear();
    playing_=false;document.beginStroke({1,1},0x80445566);document.commitStroke();const auto pixels=document.pixels();
    document.setLayerVisible(false);document.setLayerOpacity(.4);
    const auto saved=directory/"native-saved-smoke.moonsprite";
    check(savePath(saved) && !document.dirty() && documentPath_==saved && document.sourceArchive());
    openPath(saved);check(document.pixels()==pixels && !document.dirty() && pending_==Pending::None && !document.layer().visible && document.layer().opacity==.4);
    playing_=false;document.beginStroke({0,0},0xff123456);document.commitStroke();
    check(saveProject(false) && !document.dirty());
    document.undo();check(document.dirty());document.redo();check(document.dirty());
    const auto current=document.pixels();const auto savedPath=documentPath_;
    check(!savePath(directory) && document.dirty() && document.pixels()==current && documentPath_==savedPath && pending_==Pending::OpenError);resolve(false);
    ask(Pending::New);check(pending_==Pending::New && saveBeforeClose_->isVisible());
    saveBeforeClose_->Click();check(pending_==Pending::None && document.width()==32 && documentPath_.empty());
    openPath(saved);check(document.pixels()==current && !document.dirty());
    document=std::move(previous);documentPath_=std::move(oldPath);fitCanvas();refresh();
  }
  void smokeOpen(const std::filesystem::path& sample) {
    auto check=[](bool ok){if(!ok)throw std::runtime_error("Project open lifecycle smoke failed");};
    auto previous=std::move(document);auto previousPath=documentPath_;document=Document();openPath(sample);check(pending_==Pending::None && !document.projectId().empty() && !document.dirty());
    const auto expected=document.pixels();const auto name=document.name();const auto source=document.sourceArchive();
    check(source && !source->empty());
    playing_=false;document.beginStroke({0,0},0xff123456);document.commitStroke();
    const auto dirtyPixels=document.pixels();const auto identity=document.identity();const auto history=document.historySize();
    openPath(sample);check(pending_==Pending::Open && document.identity()==identity);resolve(false);
    check(document.identity()==identity && document.pixels()==dirtyPixels && document.historySize()==history && document.dirty());
    openPath(sample.parent_path()/"missing-open-smoke.moonsprite");check(pending_==Pending::OpenError && document.identity()==identity);resolve(false);
    check(document.pixels()==dirtyPixels && document.dirty());
    openPath(sample);check(pending_==Pending::Open);resolve(true);
    check(document.identity()!=identity && document.pixels()==expected && document.name()==name && !document.dirty() && !document.canUndo());
    openPath(sample);check(pending_==Pending::None && document.pixels()==expected);
    document=std::move(previous);documentPath_=std::move(previousPath);fitCanvas();refresh();
  }
  void smokeInteraction() {
    smoke_=true;brushProfiles_[0]={};brushProfiles_[1]={};refresh();
    {auto previous=std::move(document);document=Document();showLayerOpacity();layerOpacityRange_->changed(40);layerOpacityRange_->changed(60);
      if(document.historySize()!=0 || document.dirty() || document.layer().opacity!=.6)throw std::runtime_error("Opacity preview smoke failed");
      ui::KeyMessage esc(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&esc);
      if(document.historySize()!=1 || document.layer().opacity!=.6 || pending_!=Pending::None)throw std::runtime_error("Opacity Escape commit failed");
      document.undo();if(document.layer().opacity!=1)throw std::runtime_error("Opacity undo failed");document=std::move(previous);refresh();}
    {menuCommands_.invoke("toggleLayersPanel");if(layerRow_->isVisible())throw std::runtime_error("Layer panel hide failed");menuCommands_.invoke("toggleLayersPanel");
     menuCommands_.invoke("togglePalettePanel");if(panelTabs_[0]->isVisible())throw std::runtime_error("Palette hide failed");menuCommands_.invoke("togglePalettePanel");
     menuCommands_.invoke("togglePreviewPanel");if(previewPanel_->isVisible())throw std::runtime_error("Preview hide failed");menuCommands_.invoke("togglePreviewPanel");refresh();}
    {auto previous=std::move(document);document=Document();refresh();const auto raw=document.pixels();
      if(layerRow_->caption!=document.layer().name || !layerRow_->active)throw std::runtime_error("Layer row does not represent document");
      layerEye_->Click();if(document.layer().visible || document.pixels()!=raw)throw std::runtime_error("Layer row visibility failed");document.undo();refresh();
      layerProperties_->Click();if(pending_!=Pending::LayerOpacity)throw std::runtime_error("Timeline properties entry failed");
      layerOpacityRange_->changed(50);resolve(false);if(document.layer().opacity!=.5)throw std::runtime_error("Timeline opacity commit failed");document.undo();if(document.layer().opacity!=1)throw std::runtime_error("Timeline opacity undo failed");
      document=std::move(previous);refresh();}
    {const auto raw=document.pixels();const auto count=document.historySize();std::size_t leaves=0;
      for(const auto& e:menus::catalog())if(!e.group){++leaves;auto item=menuItems_.at(e.id);item->validateItem();if(!menuCommands_.connected(e.id)){if(item->isEnabled())throw std::runtime_error("Unmigrated menu enabled");item->Click();}}
      if(leaves!=142 || document.pixels()!=raw || document.historySize()!=count)throw std::runtime_error("Full disabled menu contract failed");
      const auto l=workspaceLayout(uiLogical(bounds()));if(l.workspacePanel().y2()+uiGap!=l.layerTop)throw std::runtime_error("Timeline overlaps canvas");}
    // Cache invalidation/compositing contract, including semi-transparent data.
    {
      Document source(4,4);CanvasRenderer cache;
      const auto target=os::instance()->makeRgbaSurface(4,4);
      auto render=[&] {cache.sync(source);ui::Graphics g(target);cache.draw(g,gfx::Rect(0,0,4,4),1,gfx::rgba(0,0,0),gfx::rgba(255,255,255));};
      render();const auto initial=cache.uploads();render();
      if(cache.uploads()!=initial) throw std::runtime_error("Unchanged content was uploaded twice");
      source.beginStroke({1,1},0x800000ff);render();
      {os::SurfaceLock lock(target.get());const auto p=target->getPixel(1,1);
        if(gfx::getr(p)!=255 || std::abs(gfx::getg(p)-127)>1) throw std::runtime_error("RGBA preview was flattened or cached stale");}
      source.cancelStroke();render();
      {os::SurfaceLock lock(target.get());if(target->getPixel(1,1)!=gfx::rgba(255,255,255)) throw std::runtime_error("Cancel did not invalidate cached pixels");}
      source.beginStroke({1,1},0xff0000ff);source.commitStroke();source.setLayerOpacity(.5);render();
      {os::SurfaceLock lock(target.get());if(std::abs(gfx::getg(target->getPixel(1,1))-127)>1)throw std::runtime_error("Layer opacity cache failed");}
      source.setLayerVisible(false);render();
      {os::SurfaceLock lock(target.get());if(target->getPixel(1,1)!=gfx::rgba(255,255,255))throw std::runtime_error("Hidden layer cache failed");}
      source=Document(4,4);render();
      const auto beforePixels=cache.uploadedPixels();
      source.beginStroke({0,0},0x800000ff);cache.noteChange(source);
      source.updateStroke({1,0});cache.noteChange(source);render();
      if(cache.uploadedPixels()-beforePixels!=2) throw std::runtime_error("Batched stroke dirty upload expanded to full canvas");
      source.cancelStroke();render();
    }
    auto smokeRequire=[](bool condition,int line){if(!condition) throw std::runtime_error("Native input smoke assertion failed at line "+std::to_string(line));};
#define require(condition) smokeRequire((condition),__LINE__)
    for(auto b:{toolRail_.front(),paletteActions_,paletteLock_,brushShapeButton_,dialogClose_}) {
      const auto base=b->iconContentBounds();require(base.w==base.h && base.w>0);
      for(const auto state:{"hover","pressed","selected","disabled"}) require(b->iconContentBounds(state)==base);
    }
    require(brushSizeInput_->suffix==U"px" && brushOpacityInput_->suffix==U"%");
    require(brushSizeInput_->bounds().y+2*uiScale==brushShapeButton_->bounds().y+uiScale);
    require(brushSizeInput_->bounds().y2()-3*uiScale==brushShapeButton_->bounds().y2()-3*uiScale);
    for(std::size_t i=1;i<toolControls_.size();++i) if(toolControls_[i-1].gap==-1) {
      require(toolControls_[i].first->bounds().x==toolControls_[i-1].first->bounds().x2()-uiScale);
      const auto b=dynamic_cast<PixelButton*>(toolControls_[i].first);require(b && b->iconContentBounds().w==11 && b->iconContentBounds().h==11);
    }
    require(dynamic_cast<PixelEntry*>(toolControls_[7].first) && !toolControls_[7].first->isEnabled());
    require(dialogClose_->icon=="close" && !skin_.assets.patches.count("close_button.normal"));
    if(toolRail_.size()!=13 || toolIcons_.assets.patches.size()!=162)
      throw std::runtime_error("Legacy tool catalog/icon coverage mismatch");
    for(std::size_t i=1;i<toolRail_.size();++i)
      if(toolRail_[i]->bounds().y!=toolRail_[i-1]->bounds().y2()+Layout::toolGap*uiScale)
        throw std::runtime_error("Tool rail must overlap by one outer skin pixel");
    for(std::size_t i=0;i<legacyToolGroups().size();++i)
      if(legacyToolGroups()[i].size()>1) showToolGroup(i,true);
    auto mouse=[&](ui::MessageType type,int x,int y) {
      ui::MouseMessage msg(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,
        gfx::Point(canvas_.x+x*canvasScale()+1,canvas_.y+y*canvasScale()+1));
      onProcessMessage(&msg);
    };
    auto wheel=[&](gfx::Point at,int delta) {
      ui::MouseMessage msg(ui::kMouseWheelMessage,os::PointerType::Mouse,ui::kButtonNone,
        ui::kKeyNoneModifier,at,gfx::Point(0,delta));onProcessMessage(&msg);
    };
    const auto initialCanvas=canvas_;const double initialZoom=zoom_;
    const auto blank=document.pixels();
    const auto originalInk=ink_;
    const auto cursorPoint=canvasViewport().center();
    auto cursorIs=[&](const char* id){return std::string(cursorAt(cursorPoint))==id;};
    ink_=0xff000000;require(cursorIs("pencil-white"));
    ink_=0xffffffff;require(cursorIs("pencil-black"));
    eraser_=true;require(cursorIs("pencil-white"));eraser_=false;
    spaceHeld_=true;require(cursorIs("grab"));spaceHeld_=false;
    handTool_=true;require(cursorIs("grab"));handTool_=false;
    require(std::string(cursorAt(gfx::Point(2,2)))=="default");
    ink_=originalInk;
    {
      const auto saved=document;const bool locked=paletteLocked_;paletteLocked_=true;
      smokeColorPicker();require(colorPicker_->isVisible());
      require(swatches_.front()->isVisible());
      require(panelTabs_.size()==1 && paletteLock_->isVisible() && pickerPrimary_->isVisible() && pickerSecondary_->isVisible() && !primaryRole_->isVisible() && !secondaryRole_->isVisible());
      const auto field=colorPicker_->regionBounds(NativeColorPicker::Region::Field);
      const auto hue=colorPicker_->regionBounds(NativeColorPicker::Region::Hue);
      const auto alpha=colorPicker_->regionBounds(NativeColorPicker::Region::Alpha);
      require(field.y2()==hue.y && hue.y2()==alpha.y && field.x==hue.x && hue.x==alpha.x);
      require(field.w==hue.w && hue.w==alpha.w && colorPicker_->bounds().contains(alpha));
      for(const auto size:{gfx::Rect(0,0,320,240),gfx::Rect(0,0,480,320)}) {
        const Layout compactLayout(size);
        require(compactLayout.pickerContent().w>0 && compactLayout.pickerContent().h>16);
        require(compactLayout.paletteBottom(true)+uiGap==compactLayout.pickerPanel().y);
        require(compactLayout.pickerPanel().y2()==compactLayout.bottom);
      }
      require(paletteContentBounds().y2()+uiGap*uiScale<=colorPicker_->bounds().y);
      const auto box=colorPicker_->regionBounds(NativeColorPicker::Region::Field);const int size=std::min(box.w,box.h);
      const auto point=box.origin()+gfx::Point(size/4,size/4);
      auto pick=[&](ui::MessageType type,ui::MouseButton button){ui::MouseMessage message(type,os::PointerType::Mouse,button,ui::kKeyNoneModifier,point);colorPicker_->onProcessMessage(&message);};
      const auto initialSecondary=document.palette().secondary;
      pick(ui::kMouseDownMessage,ui::kButtonLeft);pick(ui::kMouseUpMessage,ui::kButtonLeft);
      require(document.palette().primary!=saved.palette().primary && document.palette().secondary==initialSecondary);
      const auto primary=document.palette().primary;
      pick(ui::kMouseDownMessage,ui::kButtonRight);pick(ui::kMouseUpMessage,ui::kButtonRight);
      require(document.palette().primary==primary && document.palette().secondary!=initialSecondary);
      require(document.pixels()==saved.pixels() && document.historySize()==saved.historySize());
      auto sampleAt=[&](gfx::Point p) {
        ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,p);
        ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,p);
        colorPicker_->onProcessMessage(&down);colorPicker_->onProcessMessage(&up);
      };
      sampleAt({hue.x,hue.y});sampleAt({field.x2()-1,field.y});sampleAt({alpha.x2()-1,alpha.y});
      require(document.palette().primary==0xff0000ff);
      sampleAt({alpha.x,alpha.y});require(document.palette().primary==0x000000ff);
      sampleAt({alpha.x2()-1,alpha.y});sampleAt({field.x,field.y});require(document.palette().primary==0xffffffff);
      sampleAt({field.x,field.y2()-1});require(document.palette().primary==0xff000000);
      require(document.pixels()==saved.pixels() && document.historySize()==saved.historySize());
      pick(ui::kMouseDownMessage,ui::kButtonLeft);panelTabs_[0]->Click();
      require(!colorPicker_->hasCapture() && colorPicker_->isVisible());
      document=saved;paletteLocked_=locked;refresh();
    }
    {
      const auto saved=document;const auto recent=recentColors_;const bool locked=paletteLocked_;paletteLocked_=true;
      recentColors_.remember({0xff123456,0xffabcdef,0x80112233});refresh();
      require(recentButtons_[0]->isVisible() && recentButtons_[0]->bounds().w==12*uiScale && recentButtons_[0]->bounds().h==12*uiScale);
      require(recentButtons_[1]->bounds().x-recentButtons_[0]->bounds().x2()==uiGap*uiScale);
      const auto values=recentColors_.values();const auto history=document.historySize();
      ui::MouseMessage select(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonRight,ui::kKeyNoneModifier,recentButtons_[0]->bounds().center());
      recentButtons_[0]->onProcessMessage(&select);
      require(document.palette().secondary==values[0] && recentColors_.values()==values && document.historySize()==history);
      document.setPaletteRole(0x80443322,false,true);refresh();require(pickerAdd_->isVisible());
      require(pickerPrimary_->bounds().x2()+uiGap*uiScale==pickerAdd_->bounds().x);
      const auto count=document.palette().entries.size();pickerAdd_->Click();
      require(document.palette().entries.size()==count+1 && !pickerAdd_->isVisible() && document.palette().primaryId!=0);
      require(pickerPrimary_->bounds().w==pickerSecondary_->bounds().w);
      require(recentColors_.values()==values);document.undo();require(document.palette().entries.size()==count);
      document=saved;recentColors_=recent;paletteLocked_=locked;refresh();
    }
    {
      const auto savedSize=swatchSize_;const auto history=document.historySize();
      for(int size=0;size<5;++size) {
        chooseSwatchSize(size,false);
        for(auto cell:swatches_) if(cell->isVisible()) require(paletteContentBounds().contains(cell->bounds()) && cell->paletteColorBounds().w==swatchPixels_[size]);
        require(swatches_[1]->paletteColorBounds().x==swatches_[0]->paletteColorBounds().x2()-uiScale);
      }
      auto paletteScroll=[&](int x,int y,int modifiers) {
        ui::MouseMessage message(ui::kMouseWheelMessage,os::PointerType::Mouse,ui::kButtonNone,
          ui::KeyModifiers(modifiers),paletteContentBounds().center(),gfx::Point(x,y));
        paletteWheel(message,false);
      };
      chooseSwatchSize(1,false);
      paletteScroll(0,-1,ui::kKeyCtrlModifier);require(swatchSize_==2);
      paletteScroll(2,-1,ui::kKeyCtrlModifier);require(swatchSize_==1);
      paletteScroll(0,-1,ui::kKeyNoneModifier);require(swatchSize_==1);
      chooseSwatchSize(4,false);paletteScroll(0,-1,ui::kKeyCtrlModifier);require(swatchSize_==4);
      chooseSwatchSize(0,false);paletteScroll(0,1,ui::kKeyCtrlModifier);require(swatchSize_==0);
      swatches_[0]->Click();require(ink_==document.paletteEntry(1)->color);
      chooseSwatchSize(0,false);require(ink_==document.paletteEntry(1)->color && swatches_[0]->active);
      menuCommands_.invoke("togglePreviewPanel");for(auto cell:swatches_) require(cell->isVisible());
      require(paletteActions_->isVisible());
      menuCommands_.invoke("togglePreviewPanel");for(auto cell:swatches_) require(cell->isVisible());
      chooseSwatchSize(savedSize,false);ink_=originalInk;refresh();
      require(document.pixels()==blank && document.historySize()==history && zoom_==initialZoom);
    }
    {
      const auto before=document.pixels();
      paletteLocked_=true;
      const auto originalName=document.paletteEntry(1)->name;
      openPaletteEditor(1,false);paletteInput_->setText("renamed");resolve(false);require(document.paletteEntry(1)->name==originalName);
      openPaletteEditor(1,false);paletteInput_->setText("renamed");resolve(true);require(document.paletteEntry(1)->name==U"renamed");
      document.undo();require(document.paletteEntry(1)->name==originalName);document.redo();document.undo();
      openPaletteEditor(0,false);paletteInput_->setText("#12345680");resolve(false);
      require(document.palette().primary==0x80563412 && document.paletteEntry(1)->name==originalName);
      openPaletteEditor(0,false);paletteInput_->setText("ABCDEF");paletteInput_->accept();require(document.palette().primary==0x80efcdab);
      openPaletteEditor(0,false);paletteInput_->setText("xyz");resolve(false);require(document.palette().primary==0x80efcdab);
      document.selectPalette(1);refresh();paletteLocked_=false;
      openPaletteEditor(0,false);paletteInput_->setText("654321");resolve(false);require(document.paletteEntry(1)->color==0xff214365);
      document.undo();require(document.paletteEntry(1)->color==0xff211b18);
      const auto emptySlot=swatches_.size()-1;
      swatches_.back()->doubleClick();require(document.palette().order().size()==3);require(document.palette().selected.empty());
      require(document.palette().slots[emptySlot]!=0 && document.palette().slots[2]==0);
      require(paletteButtonIds_==document.palette().slots);
      document.undo();refresh();require(document.palette().order().size()==2 && document.pixels()==before);
      // Build enough swatches to overflow the viewport, without persisting UI preferences.
      for(int i=0;i<40;++i) document.addPaletteColor(0xff000000+Pixel(i),false);
      refresh();chooseSwatchSize(4,false);paletteScrollRow_=1000;layoutPalette();
      require(paletteScrollRow_>0 && !swatches_[0]->isVisible());
      for(auto cell:swatches_) if(cell->isVisible()) require(paletteContentBounds().contains(cell->bounds()));
      document=Document();paletteScrollRow_=0;loadPaletteSize();refresh();ink_=originalInk;
    }
    {
      const auto history=document.historySize();const auto pixels=document.pixels();
      brushSizeInput_->setText("8");brushSizeInput_->Change();require(brushProfiles_[0].size==8);
      brushOpacityInput_->setText("25");brushOpacityInput_->Change();require(brushProfiles_[0].opacity==25);
      commands_[2]->Click();require(brushSizeInput_->text()=="1" && brushOpacityInput_->text()=="100");
      brushSizeInput_->setText("99");brushSizeInput_->Change();require(brushProfiles_[1].size==64);
      commands_[1]->Click();require(brushSizeInput_->text()=="8" && brushOpacityInput_->text()=="25");
      commands_[5]->Click();for(const auto& control:toolControls_) require(!control.first->isVisible());
      require(commands_[3]->isVisible() && commands_[4]->isVisible());
      commands_[1]->Click();require(document.historySize()==history && document.pixels()==pixels);
      showBrushRange(true);brushRange_->value=50;
      int begins=0,commits=0;brushRange_->interactionBegin=[&]{++begins;};brushRange_->interactionCommit=[&]{++commits;};
      ui::MouseMessage rangeWheel(ui::kMouseWheelMessage,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyShiftModifier,brushRange_->bounds().center(),gfx::Point(0,1));
      brushRange_->onProcessMessage(&rangeWheel);require(brushRange_->value==40 && brushProfiles_[0].opacity==40 && begins==1 && commits==1);
      const auto rangeBounds=brushRange_->bounds();
      ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,gfx::Point(rangeBounds.x+6,rangeBounds.y+8));
      brushRange_->onProcessMessage(&down);require(brushRange_->value==0);
      ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,gfx::Point(rangeBounds.x2()+50,rangeBounds.y+8));
      brushRange_->onProcessMessage(&move);require(brushRange_->value==100);
      ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,gfx::Point(rangeBounds.x2()+50,rangeBounds.y+8));
      brushRange_->onProcessMessage(&up);require(begins==2 && commits==2 && !brushRange_->hasCapture());
      brushRange_->interactionBegin={};brushRange_->interactionCommit={};brushRange_->setVisible(false);requestFocus();
      require(document.historySize()==history && document.pixels()==pixels);
      brushProfiles_[0]={};brushProfiles_[1]={};refresh();
    }
    smokeNavigation();
    ensureContentCache();const auto uploads=renderer_.uploads();refresh();ensureContentCache();
    if(renderer_.uploads()!=uploads) throw std::runtime_error("UI refresh invalidated document content");
    menuItems_.at("undo")->validateItem();require(!menuItems_.at("undo")->isEnabled());
    menuItems_.at("undo")->Click();require(document.pixels()==blank && document.historySize()==0);
    const gfx::Point anchor(canvas_.x+8*canvasScale(),canvas_.y+9*canvasScale());
    wheel(anchor,-1);require(zoom_==10);
    const auto anchored=canvasPoint(anchor);require(anchored.x==8 && anchored.y==9);
    mouse(ui::kMouseDownMessage,3,4);require(document.pixels()[4*32+3]==ink_);
    wheel(anchor,-1);require(zoom_==10 && document.active());
    cancelStroke();require(document.pixels()==blank && !document.dirty() && document.historySize()==0);
    wheel(anchor,1);require(zoom_==initialZoom && canvas_==initialCanvas);
    wheel(gfx::Point(bounds().x+5,bounds().y+5),-1);require(zoom_==initialZoom);
    for(int i=0;i<30;++i) wheel(anchor,-1);
    require(zoom_==64 && document.pixels()==blank && document.historySize()==0);
    for(int i=0;i<30;++i) wheel(anchor,1);
    require(zoom_==0.0625 && !document.dirty());
    fitCanvas();require(zoom_==initialZoom && canvas_==initialCanvas);
    mouse(ui::kMouseDownMessage,3,4); mouse(ui::kMouseMoveMessage,20,4); mouse(ui::kMouseUpMessage,20,15);
    require(document.historySize()==1 && document.pixels()[4*32+3]==ink_ && document.pixels()[15*32+20]==ink_);
    menuItems_.at("undo")->Click(); require(document.dirty());
    menuItems_.at("redo")->validateItem();require(menuItems_.at("redo")->isEnabled());
    menuItems_.at("redo")->Click(); require(document.dirty());
    const auto pixels=document.pixels();
    mouse(ui::kMouseDownMessage,1,1); mouse(ui::kMouseMoveMessage,30,30);
    ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);
    onProcessMessage(&escape); require(document.pixels()==pixels && document.historySize()==1);
    commands_[2]->Click(); mouse(ui::kMouseDownMessage,3,4); mouse(ui::kMouseUpMessage,3,4);
    require(document.pixels()[4*32+3]==0); commands_[3]->Click(); require(document.pixels()==pixels);
    previewPanel_->closePanel(); require(!previewPanelOpen_ && document.pixels()==pixels);
    menuCommands_.invoke("togglePreviewPanel"); require(previewPanelOpen_ && document.pixels()==pixels);
    wheel(anchor,-1);require(zoom_==10);
    menuItems_.at("resetView")->Click();require(zoom_==16 && document.pixels()==pixels);fitCanvas();require(zoom_==initialZoom);
    menuItems_.at("new")->Click();require(pending_==Pending::New && !menuBar_->isEnabled());
    menuItems_.at("resetView")->Click();require(pending_==Pending::New);
    resolve(false);require(document.pixels()==pixels && menuBar_->isEnabled());
    requestClose(); require(pending_==Pending::Close);
    wheel(anchor,-1);require(zoom_==initialZoom);
    dialogClose_->Click(); require(pending_==Pending::None && !dialogClose_->isVisible() && document.pixels()==pixels);
    commands_[1]->Click(); status_=U"内存画布"; refresh();
  }
#undef require
  std::u32string modalHint() const {
    switch(pending_) {
      case Pending::LayerOpacity:return U"拖动预览，关闭后应用";
      case Pending::FrameDuration:return U"1–60000 ms，关闭后应用";
      case Pending::PaletteExtract:return U"扫描线顺序 · 非透明RGBA · 数量1–4096";
      case Pending::BrushFolderName:return U"文件夹名称，确定后应用";
      case Pending::PaletteName:return U"编辑名称，确定后应用";
      case Pending::ColorRole:return U"HEX：6 或 8 位；回车 / 关闭提交";
      case Pending::OnionValue:return onionField_<2?U"0–8 帧":onionField_<4?U"0–100%":U"HEX：6 或 8 位";
      case Pending::LoopSection:return U"";
      case Pending::OpenError:return U"当前内容保持不变";
      default:return U"保存成功后继续；取消保留当前内容";
    }
  }
  int modalMinimumWidth() const {
    return std::max({240,font_.measure(modalHint())+12,
      pending_==Pending::OpenError?font_.measure(errorTitle_)+25:0});
  }
  // TextBox::onSizeHint reflows against the available viewport. Fusion BDF
  // glyph advances need a native adapter; preserve explicit newlines too.
  std::vector<std::u32string> modalErrorLines(int width) const {
    std::vector<std::u32string> lines;std::u32string line;int advance=0;
    for(char32_t c:openError_) {
      if(c==U'\r')continue;
      const int glyph=font_.measure(std::u32string(1,c));
      if(c==U'\n' || (!line.empty() && advance+glyph>width)) {
        lines.push_back(line);line.clear();advance=0;
      }
      if(c!=U'\n'){line+=c;advance+=glyph;}
    }
    lines.push_back(line);return lines;
  }
  int modalErrorVisibleLines(gfx::Rect modal) const {return std::max(1,(modal.h-59)/12);}
  int modalMinimumHeight() const {return pending_==Pending::SheetImport?205:pending_==Pending::GifExport?170:pending_==Pending::SpriteSheet?205:pending_==Pending::StaticExport?142:pending_==Pending::ReplaceColor?153:pending_==Pending::BrushFolderName?75:pending_==Pending::ImageResize?164:pending_==Pending::ColorAdjustment?153:pending_==Pending::PaletteExtract?136:pending_==Pending::LoopSection?157:pending_==Pending::OpenError?99:pending_==Pending::PaletteName || pending_==Pending::ColorRole || pending_==Pending::LayerOpacity || pending_==Pending::FrameDuration || pending_==Pending::OnionValue?75:67;}
  gfx::Rect modalBounds(gfx::Rect rc) const {
    const auto saved=modalGeometry_.find(pending_);const int h=modalMinimumHeight();
    const int width=std::min(modalMinimumWidth()+16,std::max(240,rc.w-2*uiGap));
    const int preferredHeight=pending_==Pending::OpenError?
      std::max(h,std::min(59+int(modalErrorLines(width-20).size())*12,std::max(h,rc.h*3/4))):h;
    auto rect=saved==modalGeometry_.end()?gfx::Rect(rc.x+(rc.w-width)/2,rc.y+(rc.h-preferredHeight)/2,width,preferredHeight):saved->second;
    if(rc.w<=2*uiGap || rc.h<=2*uiGap)return rect;
    rect.w=std::max(modalMinimumWidth(),rect.w);rect.h=std::max(h,rect.h);
    // Direct MIT Aseprite reuse, in the parent display's logical coordinates.
    ui::limit_with_workarea(gfx::Rect(rc.x+uiGap,rc.y+uiGap,rc.w-2*uiGap,rc.h-2*uiGap),rect);
    return rect;
  }
  SizeDrag sizeHandleAt(gfx::Point point) const {
    const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
    if(pending_!=Pending::None) {
      const auto modal=uiPhysical(modalBounds(rc));
      if(panelResizeEdges(modal,point))return SizeDrag::Modal;
      if(dialogClose_ && dialogClose_->isVisible() && dialogClose_->bounds().contains(point))return SizeDrag::None;
      if(modal.contains(point) && point.y<modal.y+16*uiScale)return SizeDrag::ModalMove;
      return SizeDrag::None;
    }
    if((palettePanelOpen_ || colorPickerOpen_) && uiPhysical(gfx::Rect(rc.x+l.rightX+l.right-1,rc.y+l.tabY,uiGap+2,l.bottom-l.tabY)).contains(point))return SizeDrag::DockWidth;
    if(palettePanelOpen_ && colorPickerOpen_ && uiPhysical(gfx::Rect(rc.x+l.rightX,rc.y+l.split-uiGap,l.right,2*uiGap)).contains(point))return SizeDrag::ColorSplit;
    if(layersPanelOpen_ && uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop-uiGap,l.workW,2*uiGap)).contains(point))return SizeDrag::Timeline;
    return SizeDrag::None;
  }
  void finishSizeDrag() {
    flushSizeGeometry();
    if(sizeDrag_==SizeDrag::None)return;
    if(hasCapture())releaseMouse();sizeDrag_=SizeDrag::None;sizeDragEdges_=0;
    saveWorkspaceSizes();updateNavigationCursor();
  }
  void flushSizeGeometry() {
    sizeTimer_.stop();if(!pendingSizePointer_)return;
    const auto point=*pendingSizePointer_;pendingSizePointer_.reset();
    if(sizeDrag_==SizeDrag::None || !hasCapture())return;
    const gfx::Point delta((point.x-sizeDragMouse_.x)/uiScale,(point.y-sizeDragMouse_.y)/uiScale);
    const auto rc=uiLogical(bounds());const auto before=canvasViewport();const auto l=workspaceLayout(rc);
    const auto oldModal=modalBounds(rc);
    const auto oldWidth=dockWidth_,oldHeight=timelineHeight_;const auto oldShare=paletteShare_;
    if(sizeDrag_==SizeDrag::DockWidth)dockWidth_=std::clamp(sizeDragValue_+delta.x,116,std::max(116,rc.w-Layout::edge-l.rightX-uiGap-160));
    else if(sizeDrag_==SizeDrag::ColorSplit)paletteShare_=double(std::clamp(sizeDragValue_+delta.y,70,std::max(70,l.bottom-l.top-100)))/std::max(1,l.bottom-l.top);
    else if(sizeDrag_==SizeDrag::Timeline)timelineHeight_=std::clamp(sizeDragValue_-delta.y,65,std::max(65,l.bottom-l.top-100));
    else {
      const gfx::Rect viewport(rc.x+uiGap,rc.y+uiGap,rc.w-2*uiGap,rc.h-2*uiGap);
      auto modal=sizeDragBounds_;
      if(sizeDrag_==SizeDrag::Modal)modal=resizedPanel(modal,delta,sizeDragEdges_,viewport,gfx::Size(modalMinimumWidth(),modalMinimumHeight()));
      else {modal.offset(delta);modal.x=std::clamp(modal.x,viewport.x,viewport.x2()-modal.w);modal.y=std::clamp(modal.y,viewport.y,viewport.y2()-modal.h);}
      if(modal==oldModal)return;
      modalGeometry_[pending_]=modal;++sizeLayoutUpdates_;layoutModal();
      invalidateRect(uiPhysical(oldModal));invalidateRect(uiPhysical(modal));return;
    }
    if(oldWidth==dockWidth_ && oldHeight==timelineHeight_ && oldShare==paletteShare_)return;
    ++sizeLayoutUpdates_;
    canvas_.offset(canvasViewport().center()-before.center());
    // Resize only affected dock controls. No menu validation, palette sync,
    // toolbar layout or duplicate full-editor refresh on the pointer hot path.
    if(sizeDrag_!=SizeDrag::Timeline)layoutPalette();
    if(sizeDrag_==SizeDrag::DockWidth)layoutPanelTabs();
    if(sizeDrag_!=SizeDrag::ColorSplit)layoutLayers();
    if(sizeDrag_==SizeDrag::ColorSplit)invalidateRect(uiPhysical(gfx::Rect(rc.x+l.rightX,rc.y+l.top,l.right,l.bottom-l.top)));
    else invalidateRect(uiPhysical(gfx::Rect(rc.x+(sizeDrag_==SizeDrag::Timeline?l.workX:l.rightX),rc.y+l.tabY,rc.w-(sizeDrag_==SizeDrag::Timeline?l.workX:l.rightX),l.bottom-l.tabY)));
  }
  bool processSizeDrag(ui::Message* msg) {
    if(sizeDrag_!=SizeDrag::None && !hasCapture())finishSizeDrag();
    if(sizeDrag_!=SizeDrag::None) {
      if(msg->type()==ui::kMouseUpMessage) {pendingSizePointer_=static_cast<ui::MouseMessage*>(msg)->position();finishSizeDrag();return true;}
      if((selectionDragging_ || floatingDragging_) && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()>=ui::kKeyLShift && key->scancode()<=ui::kKeyCommand){ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,selectionRight_?ui::kButtonRight:ui::kButtonLeft,key->modifiers(),selectionPointerPosition_);selectionSyntheticMove_=true;onProcessMessage(&move);selectionSyntheticMove_=false;return true;}}
    if(msg->type()==ui::kMouseLeaveMessage){selectionBrushPointer_.reset();invalidateRect(canvasViewport());}
    if(msg->type()==ui::kFocusLeaveMessage) {finishSizeDrag();return false;}
      if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc) {finishSizeDrag();return true;}
      if(msg->type()==ui::kMouseMoveMessage) {
        pendingSizePointer_=static_cast<ui::MouseMessage*>(msg)->position();
        if(!sizeTimer_.isRunning())sizeTimer_.start();return true;
      }
    }
    if(msg->type()!=ui::kMouseDownMessage || (pending_==Pending::None && (document.active() || pan_.active)))return false;
    const auto mouse=static_cast<ui::MouseMessage*>(msg);if(!mouse->left())return false;
    const auto handle=sizeHandleAt(mouse->position());if(handle==SizeDrag::None)return false;
    sizeDrag_=handle;sizeDragMouse_=mouse->position();const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
    if(handle==SizeDrag::Modal || handle==SizeDrag::ModalMove){sizeDragBounds_=modalBounds(rc);sizeDragEdges_=panelResizeEdges(uiPhysical(sizeDragBounds_),sizeDragMouse_);}
    else sizeDragValue_=handle==SizeDrag::DockWidth?l.right:handle==SizeDrag::ColorSplit?l.split-l.top:l.bottom-l.layerTop;
    captureMouse();updateNavigationCursor();return true;
  }
  void layoutModal() {const auto rc=uiLogical(bounds());
    const auto modal=modalBounds(rc);
    if(modalErrorContent_!=openError_){modalErrorContent_=openError_;modalErrorScroll_=0;}
    modalErrorScroll_=std::clamp(modalErrorScroll_,0,std::max(0,int(modalErrorLines(modal.w-20).size())-modalErrorVisibleLines(modal)));
    const int actionY=modal.y2()-(pending_==Pending::LoopSection || pending_==Pending::OpenError?23:25);
    dialogClose_->setBounds(uiPhysical(gfx::Rect(modal.x2()-2-uiGap-11,modal.y+2,11,12)));
    const bool confirmation=pending_==Pending::New || pending_==Pending::Open || pending_==Pending::Close || pending_==Pending::CloseDocument;
    const bool two=confirmation || pending_==Pending::SheetImport || pending_==Pending::GifExport || pending_==Pending::SpriteSheet || pending_==Pending::StaticExport || pending_==Pending::ReplaceColor || pending_==Pending::BrushFolderName || pending_==Pending::ImageResize || pending_==Pending::ColorAdjustment || pending_==Pending::PaletteExtract || pending_==Pending::LoopSection || (pending_==Pending::PaletteName && renameId_!=0);
    const int count=confirmation?3:two?2:1;
    int buttonX=modal.x+(modal.w-(count*66+(count-1)*uiGap))/2;
    if(confirmation){saveBeforeClose_->setBounds(uiPhysical(gfx::Rect(buttonX,actionY,66,19)));buttonX+=66+uiGap;}
    if(two){discard_->setBounds(uiPhysical(gfx::Rect(buttonX,actionY,66,19)));buttonX+=66+uiGap;}
    keep_->setBounds(uiPhysical(gfx::Rect(buttonX,actionY,66,19)));
    if(layerOpacityRange_)layerOpacityRange_->setBounds(uiPhysical(gfx::Rect(modal.x+2+uiGap,modal.y+16+uiGap+10+uiGap,modal.w-2*(2+uiGap),18)));
    if(loopDirection_){for(int i=0;i<4;++i)loopInputs_[i]->setBounds(uiPhysical(gfx::Rect(modal.x+98,modal.y+24+i*21,modal.w-106,18)));loopDirection_->setBounds(uiPhysical(gfx::Rect(modal.x+98,modal.y+108,modal.w-106,18)));}
    if(paletteInput_) paletteInput_->setBounds(uiPhysical(gfx::Rect(modal.x+2+uiGap,modal.y+16+uiGap+10+uiGap,modal.w-2*(2+uiGap),18)));
    if(replaceScopeButton_){bool show=pending_==Pending::ReplaceColor;for(int i=0;i<2;++i){replaceInputs_[i]->setVisible(show);replaceInputs_[i]->setBounds(uiPhysical(gfx::Rect(modal.x+65,modal.y+25+i*23,modal.w-96,18)));replaceSample_[i]->setVisible(show);replaceSample_[i]->setBounds(uiPhysical(gfx::Rect(modal.x+modal.w-25,modal.y+25+i*23,18,18)));}replaceScopeButton_->setVisible(show);replaceScopeButton_->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+72,modal.w-12,18)));replacePreviewButton_->setVisible(show);replaceRememberButton_->setVisible(show);replacePreviewButton_->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+96,78,18)));replaceRememberButton_->setBounds(uiPhysical(gfx::Rect(modal.x+86,modal.y+96,78,18)));}
    if(importSheetLayout_){const bool show=pending_==Pending::SheetImport;const char32_t* layouts[]{U"横向",U"纵向",U"按行",U"按列"};importSheetLayout_->setVisible(show);importSheetLayout_->caption=layouts[importSheetOptions_.layout];importSheetLayout_->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+25,modal.w-14,18)));for(int i=0;i<8;++i){importSheetInputs_[i]->setVisible(show);importSheetInputs_[i]->setBounds(uiPhysical(gfx::Rect(modal.x+48+(i%2)*(modal.w/2),modal.y+49+(i/2)*23,modal.w/2-58,18)));importSheetInputs_[i]->setEnabled(i!=6&&i!=7||(i==6?importSheetOptions_.layout!=1:importSheetOptions_.layout!=0));}importSheetPartial_->setVisible(show);importSheetPartial_->icon=importSheetOptions_.partialTiles?"check":"checkboxUnchecked";importSheetPartial_->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+143,modal.w-14,18)));}
    if(gifRange_){bool show=pending_==Pending::GifExport;gifInputs_[0]->setVisible(show);gifInputs_[0]->setBounds(uiPhysical(gfx::Rect(modal.x+70,modal.y+25,modal.w-78,18)));for(int i=1;i<3;++i){gifInputs_[i]->setVisible(show && gifExplicitRange_);gifInputs_[i]->setBounds(uiPhysical(gfx::Rect(modal.x+(i==1?6:modal.w/2),modal.y+71,modal.w/2-10,18)));}gifRange_->setVisible(show);gifRange_->caption=gifExplicitRange_?U"指定帧范围":gifOptions_.loopSectionId.empty()?U"全部帧":U"循环段";gifRange_->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+48,modal.w-12,18)));const char32_t* names[]{U"正向",U"反向",U"正向往返",U"反向往返"};gifDirection_->caption=names[int(gifOptions_.direction)];gifDirection_->setVisible(show);gifDirection_->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+94,modal.w-12,18)));gifTrim_->setVisible(show);gifTrim_->icon=gifOptions_.trim?"check":"checkboxUnchecked";gifTrim_->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+117,110,18)));}
    if(exportFormatButton_){const bool show=pending_==Pending::StaticExport||pending_==Pending::GifExport;exportFormatButton_->setVisible(show);exportFormatButton_->caption=pending_==Pending::GifExport?U"GIF":U"PNG RGBA";exportFormatButton_->setBounds(uiPhysical(gfx::Rect(modal.x2()-80,modal.y+3,62,18)));}
    if(sheetPreview_){sheetPreview_->setBounds(uiPhysical(gfx::Rect(modal.x+modal.w-140,modal.y+25,130,130)));} if(sheetValue_){const bool show=pending_==Pending::SpriteSheet;for(int i=0;i<7;++i){sheetButtons_[i]->setVisible(show);sheetButtons_[i]->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+25+i*21,modal.w-14,18)));}const char32_t* layouts[]{U"横向",U"纵向",U"按行",U"按列"};sheetButtons_[0]->caption=U"排列："+std::u32string(layouts[int(sheetOptions_.layout)]);const char32_t* constraints[]{U"无约束",U"固定列数",U"固定宽度",U"固定行数",U"固定高度"};const auto c=sheetOptions_.constraint;sheetButtons_[1]->caption=constraints[int(c)];sheetButtons_[1]->setEnabled(sheetOptions_.layout==SheetLayout::Rows||sheetOptions_.layout==SheetLayout::Columns);sheetButtons_[2]->caption=sheetOptions_.frameScope=="all"?U"全部帧":sheetOptions_.frameScope=="selected"?U"选中帧":U"循环段帧";sheetButtons_[3]->caption=sheetOptions_.layerScope=="visible"?U"可见图层":sheetOptions_.layerScope=="all"?U"所有图层":U"选中图层（当前单选）";sheetButtons_[6]->setEnabled(document.selection().has_value());for(int i=4;i<7;++i){bool checked=i==4?sheetOptions_.mergeDuplicates:i==5?sheetOptions_.ignoreEmpty:sheetOptions_.selection;sheetButtons_[i]->icon=checked?"check":"checkboxUnchecked";sheetButtons_[i]->bareIconWithCaption=true;}sheetValue_->setVisible(show&&c!=SheetConstraint::None);sheetValue_->setBounds(uiPhysical(gfx::Rect(modal.x+modal.w-70,modal.y+46,62,18)));if(c!=SheetConstraint::None){sheetButtons_[1]->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+46,modal.w-84,18)));if(!sheetValue_->hasFocus())sheetValue_->setText(std::to_string(c==SheetConstraint::FixedColumns?sheetOptions_.fixedColumns:c==SheetConstraint::FixedRows?sheetOptions_.fixedRows:c==SheetConstraint::FixedWidth?sheetOptions_.fixedWidth:sheetOptions_.fixedHeight));}}
    if(exportScaleInput_){const bool show=pending_==Pending::StaticExport;exportScaleInput_->setVisible(show);exportScaleInput_->setBounds(uiPhysical(gfx::Rect(modal.x+70,modal.y+25,modal.w-78,18)));exportTrimButton_->setVisible(show);exportSelectionButton_->setVisible(show);exportSelectionButton_->setEnabled(document.selection().has_value());exportTrimButton_->icon=exportOptions_.trim?"check":"checkboxUnchecked";exportSelectionButton_->icon=exportOptions_.selection?"check":"checkboxUnchecked";exportTrimButton_->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+50,110,18)));exportSelectionButton_->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+73,110,18)));}
    if(resizeMethod_){const bool show=pending_==Pending::ImageResize;for(int i=0;i<4;++i){resizeInputs_[i]->setVisible(show);resizeInputs_[i]->setBounds(uiPhysical(gfx::Rect(modal.x+65+(i/2)*85,modal.y+25+(i%2)*23,76,18)));}resizeLock_->setVisible(show);resizeMethod_->setVisible(show);resizeLock_->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+76,100,18)));resizeMethod_->setBounds(uiPhysical(gfx::Rect(modal.x+114,modal.y+76,modal.w-122,18)));}
    if(adjustmentPreview_){const bool show=pending_==Pending::ColorAdjustment,hsl=adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation;for(int i=0;i<3;++i){adjustmentInputs_[i]->setVisible(show && (i<2 || hsl));adjustmentInputs_[i]->setBounds(uiPhysical(gfx::Rect(modal.x+86,modal.y+25+i*23,modal.w-94,18)));}adjustmentColorize_->setVisible(show && hsl);adjustmentPreview_->setVisible(show);adjustmentColorize_->setBounds(uiPhysical(gfx::Rect(modal.x+6,modal.y+96,66,18)));adjustmentPreview_->setBounds(uiPhysical(gfx::Rect(modal.x+86,modal.y+96,80,18)));}
    if(extractModeButton_){const bool show=pending_==Pending::PaletteExtract;extractModeButton_->setVisible(show);extractNameInput_->setVisible(show && extractMode_==0);if(show){const char32_t* modes[]{U"新建",U"替换",U"追加"};extractModeButton_->caption=modes[extractMode_];extractModeButton_->setBounds(uiPhysical(gfx::Rect(modal.x+64,modal.y+24,modal.w-72,18)));paletteInput_->setBounds(uiPhysical(gfx::Rect(modal.x+64,modal.y+48,modal.w-72,18)));extractNameInput_->setBounds(uiPhysical(gfx::Rect(modal.x+64,modal.y+72,modal.w-72,18)));}}

  }
  void onResize(ui::ResizeEvent& ev) override {
    const auto oldView=canvasViewport();const bool positioned=!canvas_.isEmpty();
    setBoundsQuietly(ev.bounds());const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
    if(positioned){const auto nextView=canvasViewport();const auto delta=nextView.center()-oldView.center();canvas_.offset(delta);
      if(pan_.active){pan_.origin.x+=delta.x;pan_.origin.y+=delta.y;}}

    const int actionWidth=57+4+48;
    if(menuBar_) menuBar_->setBounds(uiPhysical(gfx::Rect(rc.x+uiGap,rc.y,rc.w-2*uiGap-actionWidth,Layout::menuHeight)));
    for(int i=0;i<5;++i)if(topActions_[i])topActions_[i]->setBounds(uiPhysical(gfx::Rect(rc.x+rc.w-uiGap-actionWidth+(i<4?i*14:61),rc.y+(Layout::menuHeight-16)/2,i==4?48:15,16)));

    layoutToolOptions();
    for(std::size_t i=0;i<toolRail_.size();++i)
      toolRail_[i]->setBounds(uiPhysical(gfx::Rect(rc.x+Layout::edge,
        rc.y+l.tabY+int(i)*(Layout::toolHeight+Layout::toolGap),Layout::toolSize,Layout::toolHeight)));
    layoutPanelTabs();
    layoutDocumentTab();
    layoutPalette();layoutLayers();
    if(canvas_.isEmpty()) fitCanvas();
    layoutModal();applyHomeVisibility();
  }
  void invalidateTimelineGrid() {
    const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
    invalidateRect(uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop+35,l.workW,l.bottom-l.layerTop-35)));
  }
  struct TimelineOutline {gfx::Rect border;bool hover=false;};
  std::vector<TimelineOutline> timelineOutlines() const {
    std::vector<TimelineOutline> result;
    if(!documentOpen_ || !layersPanelOpen_ || !timelineSelectionGuidesVisible_)return result;
    const auto l=workspaceLayout(uiLogical(bounds()));
    const int rows=std::min(std::max(1,(l.bottom-l.layerTop-53)/12),int(document.timeline().state().layers.size())-layerScroll_);
    const int columns=std::max(1,(l.workW-94)/12);
    const int visibleColumns=std::min(columns,int(document.timeline().state().frames.size())-frameScroll_);
    const int x=l.workX+5,y=l.layerTop+37;
    auto add=[&](gfx::Rect box){
      auto material=skin_.selectionMaterialBounds(uiPhysical(box));material.offset(bounds().x,bounds().y);
      result.push_back({box,paletteMousePosition_ && skin_.selectionContains(material,*paletteMousePosition_)});
    };
    for(int row=0;row<rows;++row)if(layerRows_[row+layerScroll_]->timelineSelected)
      add(gfx::Rect(x+36,y+12+row*12,48+visibleColumns*12+1,13));
    // Consecutive selected frame columns share one external outline.
    for(int col=0;col<visibleColumns;) {
      if(!frameHeaders_[col]->timelineSelected){++col;continue;}
      const int first=col;while(col<visibleColumns && frameHeaders_[col]->timelineSelected)++col;
      add(gfx::Rect(x+84+first*12,y,(col-first)*12+1,(rows+1)*12+1));
    }
    for(int row=0;row<rows;++row)for(int col=0;col<visibleColumns;++col)
      if(frameCells_[row*columns+col]->timelineSelected)add(gfx::Rect(x+84+col*12,y+12+row*12,13,13));
    return result;
  }
  void paintTimelineGrid(ui::Graphics& g) {
    if(!documentOpen_ || !layersPanelOpen_)return;
    auto backgroundHover=[&](PixelButton* button){
      return paletteMousePosition_ && button->bounds().contains(*paletteMousePosition_);
    };
    // Transparent hit widgets ask their parent to repaint this same composite.
    // Their temporarily hidden flag during laf's background pass is not layout visibility.
    for(const auto& buttons:{layerRows_,layerEyes_,layerLocks_,layerAutoLinks_,frameHeaders_,frameCells_})for(auto b:buttons) {
      if(!b->timelineVisible)continue;
      auto box=b->bounds();box.offset(-bounds().x,-bounds().y);
      if(!box.intersects(g.getClipBounds()))continue;
      b->timelineBackgroundHover=backgroundHover(b);
      b->paintTimelineContent(g,uiLogical(box));
    }
    // Adjacent canonical linked slots reuse the user's original ball as a
    // 3/1/3 horizontal nine-slice. Only visible content receives a marker.
    {
      UiPaintScale scale(g);const auto l=workspaceLayout(uiLogical(bounds()));
      const int columns=std::max(1,(l.workW-94)/12);
      const int rows=std::min(std::max(1,(l.bottom-l.layerTop-53)/12),int(document.timeline().state().layers.size())-layerScroll_);
      const auto& frames=document.timeline().state().frames;
      const int visible=std::min(columns,int(frames.size())-frameScroll_);
      for(int row=0;row<rows;++row)for(int col=0;col<visible;) {
        const auto& layer=document.timeline().state().layers[row+layerScroll_];
        const auto* left=document.timeline().findCel(layer.id,frames[frameScroll_+col].id);
        const auto a=document.timeline().resolveSurface(left->id);
        const int first=col++;
        if(!a.source || !celHasContent(left))continue;
        while(col<visible) {
          const auto* next=document.timeline().findCel(layer.id,frames[frameScroll_+col].id);
          const auto b=document.timeline().resolveSurface(next->id);
          if(!b.source || a.source->id!=b.source->id)break;
          ++col;
        }
        // Draw each complete run once: overlapping pairwise rounded caps
        // would leave dark seams inside runs of three or more cels.
        if(col-first>1)skin_.draw(g,"timeline.linked-dot",gfx::Rect(l.workX+92+first*12,l.layerTop+49+row*12+3,7+(col-first-1)*12,7));
      }
    }
    UiPaintScale scale(g);
    for(const auto& outline:timelineOutlines()) {
      // 3px skin frame: outer black, white, inner black. The inner black
      // coincides with the existing 1px grid border; the other two extend out.
    }
  }
  void paintChrome(ui::Graphics& g) {
    ++chromePaints_;UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());const auto l=workspaceLayout(rc);
    auto label=[&](const std::u32string& s,int x,int y,bool muted=false){font_.draw(g,s,x,y,skin_[muted?"muted":"text"]);};
    g.fillRect(skin_["background"],rc);
    paintWorkLayer(g,rc);
    const bool singleColorColumn=std::count_if(panelTabs_.begin(),panelTabs_.end(),[](auto tab){return !tab->hasFlags(ui::HIDDEN);})==1;
    const int colorPanelTop=singleColorColumn?l.tabY:l.top;
    const gfx::Rect colorPanel(l.rightX,colorPanelTop,l.right,l.paletteBottom(colorPickerOpen_)-colorPanelTop);
    auto colorContent=uiLogical(paletteContentBounds());colorContent.offset(-bounds().x/uiScale,-bounds().y/uiScale);
    auto panel=[&](const gfx::Rect& box,const char* slot,const char* fill) {
      g.fillRect(skin_[fill],box);
      if(!skin_.draw(g,slot,box)) g.drawRect(skin_["border"],box);
    };
    panel(l.workspacePanel(),"panel_outer","panel");
    if(palettePanelOpen_)panel(colorPanel,"panel_outer","panel");
    panel(l.workspaceContent(),"panel_content","background");if(palettePanelOpen_)panel(colorContent,"panel_content","background");
    if(colorPickerOpen_) {
      panel(l.pickerPanel(),"panel_outer","panel");
      panel(l.pickerGradient(!recentColors_.values().empty()),"panel_content","background");
      const auto ink=font_.inkBounds(U"调色盘");
      label(U"调色盘",l.rightX+Layout::inset-ink.x,l.split+Layout::frame+uiGap-ink.y);
    }
    if(layersPanelOpen_ && documentOpen_){
      const gfx::Rect outer(l.workX,l.layerTop,l.workW,l.bottom-l.layerTop);
      if(!skin_.draw(g,"timeline.frame",outer)){g.fillRect(skin_["panel"],outer);g.drawRect(skin_["timelineGrid"],outer);
      g.drawRect(skin_["timelineEdge"],gfx::Rect(outer.x+1,outer.y+1,outer.w-2,outer.h-2));g.drawRect(skin_["timelineGrid"],gfx::Rect(outer.x+2,outer.y+2,outer.w-4,outer.h-4));}
      label(U"图层",l.workX+5,l.layerTop+5);if(const auto* section=timeline::loopAtFrame(document.timeline().state(),document.frame().id))label(section->name,l.workX+89,l.layerTop+5);
      const int x=l.workX+5,y=l.layerTop+37,gx=x+84;
      if(!skin_.draw(g,"timeline.grid",gfx::Rect(l.workX+5,y,l.workW-9,l.bottom-y-5))){g.fillRect(skin_["timelineBackground"],gfx::Rect(l.workX+5,y,l.workW-9,l.bottom-y-5));
      g.drawRect(skin_["timelineGrid"],gfx::Rect(l.workX+5,y,l.workW-9,l.bottom-y-5));}
      const auto& layers=document.timeline().state().layers;
      const int capacity=std::max(1,(l.bottom-l.layerTop-53)/12);
      const int rows=std::min(capacity,int(layers.size())-layerScroll_);
      const int columns=std::max(1,(l.workW-94)/12);
      const int visibleColumns=std::min(columns,int(document.timeline().state().frames.size())-frameScroll_);
      auto line=[&](gfx::Rect r){if(!skin_.draw(g,"timeline.line",r))g.fillRect(skin_["timelineGrid"],r);};
      // Derive every separator from the visible rows/columns, including the
      // empty auto-link column. Children own their cell's top and left edges.
      for(int dx:{0,12,24,36,84})line(gfx::Rect(x+dx,y,1,(rows+1)*12+1));
      for(int col=1;col<=visibleColumns;++col)line(gfx::Rect(gx+col*12,y,1,(rows+1)*12+1));
      for(int row=0;row<=rows+1;++row)line(gfx::Rect(x,y+row*12,84+visibleColumns*12+1,1));
      for(int i=0;i<3;++i)toolIcons_.draw(g,std::string(i==0?"eye":i==1?"lock":"animation-auto-link-off")+"-disabled",gfx::Rect(x+i*12+1,y+1,11,11),true);


    }
    paintDocumentTab(g);
    auto percent=std::to_string(zoom_*100);
    while(percent.back()=='0') percent.pop_back();if(percent.back()=='.') percent.pop_back();
    const std::u32string zoomText=std::u32string(percent.begin(),percent.end())+U"%  滚轮缩放 / F 适应";
    const auto statusInk=font_.inkBounds(status_),zoomInk=font_.inkBounds(zoomText);
    // Status starts immediately after the workspace's final frame pixel.
    // No extra external gap: its 2px top/bottom padding is the visible separation.
    const int statusInkY=rc.h-Layout::statusHeight+uiGap;
    const int zoomInkX=std::max(uiGap,rc.w-uiGap-zoomInk.w);
    g.saveClip();
    g.clipRect(gfx::Rect(uiGap,statusInkY,std::max(0,zoomInkX-2*uiGap),Layout::labelInkHeight));
    label(status_,uiGap-statusInk.x,statusInkY-statusInk.y,true);
    g.restoreClip();
    g.saveClip();
    g.clipRect(gfx::Rect(zoomInkX,statusInkY,std::max(0,rc.w-uiGap-zoomInkX),Layout::labelInkHeight));
    label(zoomText,zoomInkX-zoomInk.x,statusInkY-zoomInk.y,true);
    g.restoreClip();
  }
  void ensureContentCache() {renderer_.setOnionSkin(onion_,playing_);renderer_.sync(document);}
  void paintSelectionAnts(ui::Graphics& g,gfx::Rect cv,gfx::Rect viewport,int phase) {
    if(!document.selection())return;
    const auto& s=document.selection();const double scale=canvasScale();gfx::Path path;
    auto segment=[&](int x,int y,int x2,int y2){
      path.moveTo(cv.x+x*scale,cv.y+y*scale);path.lineTo(cv.x+x2*scale,cv.y+y2*scale);
    };
    if(s->mask.empty()) {
      segment(s->x,s->y,s->x+s->width,s->y);segment(s->x,s->y+s->height,s->x+s->width,s->y+s->height);
      segment(s->x,s->y,s->x,s->y+s->height);segment(s->x+s->width,s->y,s->x+s->width,s->y+s->height);
    } else {
      for(int y=std::max(s->y,int(std::floor((viewport.y-cv.y)/scale))-1);y<std::min(s->y+s->height,int(std::ceil((viewport.y2()-cv.y)/scale))+1);++y)
        for(int x=std::max(s->x,int(std::floor((viewport.x-cv.x)/scale))-1);x<std::min(s->x+s->width,int(std::ceil((viewport.x2()-cv.x)/scale))+1);++x) {
          if(!selectionContains(s,x,y))continue;
          if(!selectionContains(s,x,y-1))segment(x,y,x+1,y);
          if(!selectionContains(s,x,y+1))segment(x,y+1,x+1,y+1);
          if(!selectionContains(s,x-1,y))segment(x,y,x,y+1);
          if(!selectionContains(s,x+1,y))segment(x+1,y,x+1,y+1);
        }
    }
    // Direct MIT Aseprite shader reuse: 4 black / 4 white device pixels.
    // Transform boundary coordinates, never the shader or hairline stroke.
    ui::Paint paint;paint.style(ui::Paint::Stroke);
    ui::set_checkered_paint_mode(paint,phase,gfx::rgba(0,0,0,255),gfx::rgba(255,255,255,255));
    g.drawPath(path,paint);
  }
  gfx::Color selectionPreviewColor(int x,int y) const {
    Pixel pixel=0;if(selectionColorIdentity_!=document.identity() || selectionColorRevision_!=document.contentRevision() || selectionColorFrame_!=document.frame().id){selectionColorTiles_.clear();selectionColorIdentity_=document.identity();selectionColorRevision_=document.contentRevision();selectionColorFrame_=document.frame().id;}
    if(x>=0 && y>=0 && x<document.width() && y<document.height()){const auto key=std::make_pair(x/64,y/64);auto it=selectionColorTiles_.find(key);const int left=key.first*64,top=key.second*64,width=std::min(64,document.width()-left);if(it==selectionColorTiles_.end()){if(selectionColorTiles_.size()>=32)selectionColorTiles_.erase(selectionColorTiles_.begin());it=selectionColorTiles_.emplace(key,compositeNormalRegion(document.timeline(),document.frame().id,{left,top,width,std::min(64,document.height()-top)})).first;}pixel=it->second[(y-top)*width+x-left];}
    auto color=pixel>>24?gfx::rgba(pixel&255,(pixel>>8)&255,(pixel>>16)&255,255):skin_[((int(std::floor(x/4.0))+int(std::floor(y/4.0)))%2==0)?"checkerA":"checkerB"];
    return gfx::getr(color)*.2126+gfx::getg(color)*.7152+gfx::getb(color)*.0722>145?gfx::rgba(0,0,0,255):gfx::rgba(255,255,255,255);
  }
  void paintSelectionFeedback(ui::Graphics& g,const gfx::Rect& cv,const gfx::Rect& viewport) {
    if(!selectionTool_ || handTool_ || spaceHeld_)return;
    const double scale=canvasScale();
    auto pixelBox=[&](int x,int y){const int left=int(std::round(cv.x+x*scale)),top=int(std::round(cv.y+y*scale));return gfx::Rect(left,top,std::max(1,int(std::round(cv.x+(x+1)*scale))-left),std::max(1,int(std::round(cv.y+(y+1)*scale))-top));};
    auto pixel=[&](int x,int y){if(x<0 || y<0 || x>=document.width() || y>=document.height())return;const auto box=pixelBox(x,y);if(box.intersects(viewport))g.fillRect(selectionPreviewColor(x,y),box);};
    const bool creating=selectionDragging_ && !selectionBoxDragging_;
    if(creating && selectionPreview_){const auto& mask=*selectionPreview_;
      if(selectionKind_==2 || selectionKind_==3){auto path=selectionPath_;if(selectionKind_==3 && (path.empty() || path.back().x!=selectionLast_.x || path.back().y!=selectionLast_.y))path.push_back({selectionLast_.x,selectionLast_.y});for(std::size_t i=1;i<path.size();++i)for(auto at:selectionLine(path[i-1],path[i],selectionKind_==3))pixel(at.x,at.y);if(path.size()>1)for(auto at:selectionLine(path.back(),path.front(),selectionKind_==3))pixel(at.x,at.y);}
      else {const int left=std::max(mask.x,int(std::floor((viewport.x-cv.x)/scale))),top=std::max(mask.y,int(std::floor((viewport.y-cv.y)/scale))),right=std::min(mask.x+mask.width,int(std::ceil((viewport.x2()-cv.x)/scale))),bottom=std::min(mask.y+mask.height,int(std::ceil((viewport.y2()-cv.y)/scale)));for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)if(selectionContains(selectionPreview_,x,y) && (selectionKind_==4 || !selectionContains(selectionPreview_,x-1,y) || !selectionContains(selectionPreview_,x+1,y) || !selectionContains(selectionPreview_,x,y-1) || !selectionContains(selectionPreview_,x,y+1)))pixel(x,y);}
      if(selectionKind_<=1){const auto target=marqueeTarget_.value_or(SelectionTransform{double(mask.x),double(mask.y),double(mask.width),double(mask.height)});const int l=int(std::floor(target.x)),t=int(std::floor(target.y)),r=l+int(target.width)-1,b=t+int(target.height)-1;
        const auto first=unicodeText(std::to_string(l)+", "+std::to_string(t)+" - "+std::to_string(r)+", "+std::to_string(b));const auto second=unicodeText(std::to_string(int(target.width))+" x "+std::to_string(int(target.height)));

        const int width=std::max(font_.inkBounds(first).w,font_.inkBounds(second).w)+4;auto anchor=pixelBox(l,t).origin();const int bx=std::clamp(anchor.x,viewport.x,std::max(viewport.x,viewport.x2()-width*uiScale)),by=std::clamp(anchor.y-26*uiScale,viewport.y,std::max(viewport.y,viewport.y2()-26*uiScale));
        UiPaintScale ui(g,gfx::Point(bx,by));g.fillRect(gfx::rgba(74,74,81,180),gfx::Rect(0,0,width,26));font_.draw(g,first,2,2,gfx::rgba(255,255,255,255));font_.draw(g,second,2,14,gfx::rgba(255,255,255,255));
      }
    }
    if(selectionKind_==5 || floatingDragging_ || selectionBoxDragging_ || selectionPivotDragging_ || !paletteMousePosition_)return;
    const auto point=*paletteMousePosition_;if(!canvasViewport().contains(point))return;
    const auto hit=transformHit(point);const int content=selectionHit(point);if(!selectionShift_ && selectionPivotHit(point))return;
    if(!creating && !selectionShift_ && (!hit.empty() || content==1 || (content==2 && (selectionMode_<2 || selectionCtrl_))))return;
    const auto p=canvasPoint(point);auto box=pixelBox(p.x,p.y);const int w=std::max(2,box.w),h=std::max(2,box.h);box.x-=(w-box.w)/2;box.y-=(h-box.h)/2;box.w=w;box.h=h;const auto color=selectionPreviewColor(p.x,p.y);
    for(int sx:{-1,1})for(int sy:{-1,1}){const int x=sx<0?box.x:box.x2(),y=sy<0?box.y:box.y2();g.fillRect(color,gfx::Rect(sx<0?x-6:x,sy<0?y-2:y,6,2));g.fillRect(color,gfx::Rect(sx<0?x-2:x,sy<0?y-6:y,2,6));}
  }
  void paintCanvas(ui::Graphics& g) {
    auto viewport=canvasViewport();viewport.offset(-bounds().x,-bounds().y);
    auto cv=canvas_;cv.offset(-bounds().x,-bounds().y);
    g.saveClip();g.clipRect(viewport);
    g.fillRect(skin_["background"],viewport);
    if(!documentOpen_){g.restoreClip();return;}
    {
      // Decoration remains 2x, but its origin can move by one device pixel.
      UiPaintScale scale(g,cv.origin());
      skin_.draw(g,"document_frame",gfx::Rect(-3,-3,cv.w/uiScale+6,cv.h/uiScale+6));
      const auto dimensions=std::to_string(document.width())+" x "+std::to_string(document.height());
      font_.draw(g,std::u32string(dimensions.begin(),dimensions.end()),0,-15,skin_["muted"]);
    }
    renderer_.draw(g,cv,canvasScale(),skin_["checkerA"],skin_["checkerB"]);
    if(symmetryHas(document.symmetryAxes)){const auto c=document.symmetryCenter();const auto a=document.symmetryAxes;const auto color=gfx::rgba(symmetryColor_&255,(symmetryColor_>>8)&255,(symmetryColor_>>16)&255,symmetryColor_>>24);auto draw=[&](double x,double y){if(x<0 || y<0 || x>document.width() || y>document.height())return;g.fillRect(color,gfx::Rect(int(std::round(cv.x+x*canvasScale())),int(std::round(cv.y+y*canvasScale())),symmetryThickness_,symmetryThickness_));};for(int x=0;x<=cv.w;++x){const double px=x/canvasScale();if(a.horizontal||a.rotational)draw(px,c.y);if(a.diagonalDown)draw(px,px+c.y-c.x);if(a.diagonalUp)draw(px,c.x+c.y-px);}if(a.vertical||a.rotational)for(int y=0;y<=cv.h;++y)draw(c.x,y/canvasScale());}

    if(selectionTool_ && selectionKind_==5 && selectionBrushPointer_ && !spaceHeld_ && !handTool_ && ((selectionDragging_ && !selectionBoxDragging_) || transformHit(*selectionBrushPointer_).empty())){const auto pointer=*selectionBrushPointer_;if((selectionDragging_ && !selectionBoxDragging_) || selectionHit(pointer)==0){auto coverage=selectionBrushStroke_;const auto p=canvasPoint(pointer);coverage.collect(document.width(),document.height(),{p.x,p.y},{p.x,p.y},brushProfiles_[0],selectionBrushAngle_);const double scale=canvasScale();auto draw=[&](int x,int y){const int left=int(std::round(cv.x+x*scale)),top=int(std::round(cv.y+y*scale)),right=int(std::round(cv.x+(x+1)*scale)),bottom=int(std::round(cv.y+(y+1)*scale));g.fillRect(gfx::rgba(41,121,255,89),gfx::Rect(left,top,std::max(1,right-left),std::max(1,bottom-top)));};for(auto key:coverage.visited)draw(int(key%document.width()),int(key/document.width()));for(auto p:coverage.outsidePreview)draw(p.first,p.second);}}
    if(document.gradientActive()){auto handle=[&](TransformPoint p){const int x=gradientRound(cv.x+p.x*canvasScale()),y=gradientRound(cv.y+p.y*canvasScale());g.fillRect(gfx::rgba(0,0,0,255),gfx::Rect(x-5,y-5,10,10));g.fillRect(gfx::rgba(255,255,255,255),gfx::Rect(x-3,y-3,6,6));};handle(gradientSpec_.radial?resolveGradientGeometry(gradientSpec_).center:gradientSpec_.start);handle(gradientSpec_.end);}
    paintSelectionFeedback(g,cv,viewport);
    paintSelectionAnts(g,cv,viewport,antsOffset_);
    if(document.selection() && !homeOpen_ && !smoke_ && !antsTimer_.isRunning())antsTimer_.start();

    if(selectionTool_ && !selectionDragging_){if(auto target=selectionControlTarget()){for(auto uv:std::array<TransformPoint,8>{{{0,0},{.5,0},{1,0},{0,.5},{1,.5},{0,1},{.5,1},{1,1}}}){if(selectionFreeTransform_ && (uv.x==.5 || uv.y==.5))continue;auto p=transformPoint(*target,uv.x,uv.y);const int x=int(std::round(cv.x+p.x*canvasScale())),y=int(std::round(cv.y+p.y*canvasScale()));g.fillRect(gfx::rgba(0,0,0,255),gfx::Rect(x-5,y-5,10,10));g.fillRect(gfx::rgba(255,255,255,255),gfx::Rect(x-3,y-3,6,6));}}}

    if(document.selection() && selectionPivotVisible_ && !selectionFreeTransform_ && !selectionDragging_){const auto p=selectionPivotPoint();UiPaintScale scale(g,gfx::Point(int(std::round(cv.x+p.x*canvasScale()))-9,int(std::round(cv.y+p.y*canvasScale()))-9));toolIcons_.draw(g,"selection-pivot",gfx::Rect(0,0,9,9),true);}
    g.restoreClip();
  }
  void onPaint(ui::PaintEvent& ev) override {
    auto& g=*ev.graphics();if(!homeOpen_)ensureContentCache();
    auto viewport=canvasViewport();viewport.offset(-bounds().x,-bounds().y);
    // Like legacy's requestDrawRef, invalidations share the existing drawing
    // scheduler. Pan requests only the viewport and reuses composed content.
    if(!homeOpen_ && pending_==Pending::None && viewport.contains(g.getClipBounds())) {paintCanvas(g);return;}
    if(homeOpen_)paintHome(g);else{paintChrome(g);paintTimelineGrid(g);paintCanvas(g);}
    UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());
    auto label=[&](const std::u32string& text,int x,int y,bool muted=false) {font_.draw(g,text,x,y,skin_[muted?"muted":"text"]);};
    if(pending_!=Pending::None) {
      const auto modal=modalBounds(rc);
      if(!skin_.draw(g,"dialog_frame",modal)) {
        g.fillRect(skin_["panel"],modal);g.drawRect(skin_["border"],modal);
      }
      if(pending_==Pending::ReplaceColor){label(U"替换颜色",modal.x+6,modal.y+6);label(U"源 HEX",modal.x+6,modal.y+28);label(U"目标 HEX",modal.x+6,modal.y+51);return;}
      if(pending_==Pending::SheetImport){label(U"导入精灵表 · RGBA",modal.x+6,modal.y+6);const char32_t* names[]{U"X",U"Y",U"宽",U"高",U"间距X",U"间距Y",U"列数",U"行数"};for(int i=0;i<8;++i)label(names[i],modal.x+6+(i%2)*(modal.w/2),modal.y+52+(i/2)*23);label(U"单帧 1–1024 px；独立 Cel / 可撤销",modal.x+6,modal.y+170);return;}
      if(pending_==Pending::GifExport){label(U"导出 GIF 动画",modal.x+6,modal.y+6);label(U"比例",modal.x+6,modal.y+28);return;}
      if(pending_==Pending::SpriteSheet){label(U"精灵表 · PNG文件输出子集",modal.x+6,modal.y+6);label(U"原尺寸单元格 / 透明背景",modal.x+6,modal.y+174);return;}
      if(pending_==Pending::StaticExport){label(U"导出当前帧 · PNG RGBA",modal.x+6,modal.y+6);label(U"比例",modal.x+6,modal.y+28);label(U"当前帧全部可见图层，透明背景",modal.x+6,modal.y+98);return;}
      if(pending_==Pending::ImageResize){label(U"调整图像尺寸",modal.x+6,modal.y+6);label(U"宽度",modal.x+6,modal.y+28);label(U"高度",modal.x+6,modal.y+51);label(U"当前原生可编辑范围 1–1024 px",modal.x+6,modal.y+101);return;}
      if(pending_==Pending::ColorAdjustment){const bool hsl=adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation;label(hsl?U"色相/饱和度":U"亮度/对比度",modal.x+6,modal.y+6);const char32_t* names[]{hsl?U"色相":U"亮度",hsl?U"饱和度":U"对比度",U"明度"};for(int i=0;i<(hsl?3:2);++i)label(names[i],modal.x+6,modal.y+28+i*23);return;}
      if(pending_==Pending::PaletteExtract){label(U"提取颜色",modal.x+6,modal.y+6);label(U"方式",modal.x+6,modal.y+27);label(U"数量",modal.x+6,modal.y+51);if(extractMode_==0)label(U"名称",modal.x+6,modal.y+75);return;}
      if(pending_==Pending::LoopSection){label(U"循环节属性",modal.x+2+uiGap,modal.y+uiGap);const char32_t* labels[]{U"名称",U"开始帧",U"结束帧",U"重复（空为无限）",U"方向"};for(int i=0;i<5;++i)label(labels[i],modal.x+6,modal.y+28+i*21);return;}
      if(pending_==Pending::OnionValue){label(U"洋葱皮设置",modal.x+2+uiGap,modal.y+uiGap);label(onionField_<2?U"0–8 帧":onionField_<4?U"0–100%":U"HEX：6 或 8 位",modal.x+2+uiGap,modal.y+16+uiGap);return;}
      if(pending_==Pending::FrameDuration){label(U"帧时长",modal.x+2+uiGap,modal.y+uiGap);label(U"1–60000 ms，关闭后应用",modal.x+2+uiGap,modal.y+16+uiGap);return;}
      if(pending_==Pending::LayerOpacity){label(U"图层不透明度",modal.x+2+uiGap,modal.y+uiGap);label(U"拖动预览，关闭后应用",modal.x+2+uiGap,modal.y+16+uiGap);return;}
      if(pending_==Pending::BrushFolderName){label(fillFolderRename_?U"重命名文件夹":U"新建文件夹",modal.x+2+uiGap,modal.y+uiGap);label(U"文件夹名称，确定后应用",modal.x+2+uiGap,modal.y+16+uiGap);return;}
      if(pending_==Pending::PaletteName || pending_==Pending::ColorRole) {
        label(pending_==Pending::PaletteName?U"颜色名称":editingSecondary_?U"背景色":U"前景色",modal.x+2+uiGap,modal.y+uiGap);
        label(pending_==Pending::PaletteName?U"编辑名称，确定后应用":U"HEX：6 或 8 位；回车 / 关闭提交",modal.x+2+uiGap,modal.y+16+uiGap);
        return;
      }
      if(pending_==Pending::OpenError) {
        label(errorTitle_,modal.x+2+uiGap,modal.y+uiGap);
        label(U"当前内容保持不变",modal.x+2+uiGap,modal.y+18,true);
        const auto lines=modalErrorLines(modal.w-20);const int visible=modalErrorVisibleLines(modal);
        const int first=std::clamp(modalErrorScroll_,0,std::max(0,int(lines.size())-visible));
        for(int i=0;i<visible && first+i<int(lines.size());++i)label(lines[first+i],modal.x+6,modal.y+32+i*12);
        if(int(lines.size())>visible) {
          const int trackHeight=visible*12,thumbHeight=std::max(6,trackHeight*visible/int(lines.size()));
          g.fillRect(skin_["border"],gfx::Rect(modal.x2()-9,modal.y+32,3,trackHeight));
          g.fillRect(skin_["muted"],gfx::Rect(modal.x2()-9,modal.y+32+(trackHeight-thumbHeight)*first/(int(lines.size())-visible),3,thumbHeight));
        }
        return;
      }
      label(U"未保存的绘画",modal.x+2+uiGap,modal.y+uiGap);
      label(U"是否保存当前工程的修改？",modal.x+2+uiGap,modal.y+16+uiGap);
      label(U"保存成功后继续；取消保留当前内容",modal.x+2+uiGap,modal.y+16+uiGap+10+uiGap,true);
    }
  }
  bool onProcessMessage(ui::Message* msg) override {
    if(replaceSampling_>=0){
      if(eyedropperGesture_.active() && !hasCapture()){finishReplaceSampling();}
      if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){finishReplaceSampling();return true;}
      if(msg->type()==ui::kFocusLeaveMessage){finishReplaceSampling();return true;}
      if(msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage){auto mouse=static_cast<ui::MouseMessage*>(msg);const bool canvas=canvasViewport().contains(mouse->position()) && !uiPhysical(modalBounds(uiLogical(bounds()))).contains(mouse->position());
        if(eyedropperGesture_.active()){if(msg->type()==ui::kMouseMoveMessage && canvas)sampleEyedropperAt(canvasPoint(mouse->position()));if(msg->type()==ui::kMouseUpMessage && (mouse->button()==strokeButton_ || mouse->button()==ui::kButtonNone))finishEyedropper();return true;}
        if(msg->type()==ui::kMouseDownMessage && canvas && (mouse->left() || mouse->right())){cancelReplacePreview();strokeButton_=mouse->button();eyedropperGesture_.begin(mouse->right(),false);captureMouse();sampleEyedropperAt(canvasPoint(mouse->position()));updateNavigationCursor();return true;}
      }
    }
    if(modalNumberScrub_ && (msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage)){
      const auto mouse=static_cast<ui::MouseMessage*>(msg);
      if(msg->type()==ui::kMouseMoveMessage){const int dx=mouse->position().x-numberScrubLastX_;numberScrubLastX_=mouse->position().x;modalNumberScrub_->adjustNumber(dx*(mouse->shiftPressed()?10:1));}
      else{modalNumberScrub_=nullptr;if(hasCapture())releaseMouse();}return true;
    }
    if(pending_!=Pending::None && msg->type()==ui::kMouseDownMessage){
      const auto mouse=static_cast<ui::MouseMessage*>(msg);
      if(mouse->left())for(auto child:children())if(auto entry=dynamic_cast<PixelEntry*>(child)){
        if(!entry->numeric || !entry->isVisible() || !entry->isEnabled())continue;
        const auto rect=entry->bounds();const auto at=mouse->position();
        if(at.x<rect.x && at.x>=rect.x-60*uiScale && at.y>=rect.y && at.y<rect.y2()){
          modalNumberScrub_=entry;numberScrubLastX_=at.x;captureMouse();return true;
        }
      }
    }
    if(pending_==Pending::OpenError && msg->type()==ui::kMouseWheelMessage) {
      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto modal=modalBounds(uiLogical(bounds()));
      if(uiPhysical(modal).contains(mouse->position())) {
        const int maximum=std::max(0,int(modalErrorLines(modal.w-20).size())-modalErrorVisibleLines(modal));
        // View::scrollByMessage uses three text rows per ordinary wheel step.
        modalErrorScroll_=std::clamp(modalErrorScroll_+mouse->wheelDelta().y*3,0,maximum);
        invalidateRect(uiPhysical(modal));return true;
      }
    }
    if((homeOpen_ || !documentOpen_) && pending_==Pending::None){
      if(homeOpen_ && documentOpen_ && msg->type()==ui::kMouseDownMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
        if(mouse->left() && uiPhysical(gfx::Rect(rc.x+Layout::edge,rc.y+Layout::documentY,documentTabWidth(l)-Layout::inset-11,Layout::tabHeight)).contains(mouse->position())){showHome(false);return true;}}
      if(homeOpen_ && msg->type()==ui::kMouseWheelMessage){homeScroll_+=static_cast<ui::MouseMessage*>(msg)->wheelDelta().y>0?-1:1;layoutHome();invalidate();return true;}
      if(homeOpen_ && msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc && documentOpen_){showHome(false);return true;}
      if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->ctrlPressed() && key->scancode()==ui::kKeyN){ask(Pending::New);return true;}if(key->ctrlPressed() && key->scancode()==ui::kKeyO){chooseProject();return true;}}
      return ui::Widget::onProcessMessage(msg);
    }
    if(previewPanel_ && previewPanel_->hasCapture() && (msg->type()==ui::kFocusLeaveMessage ||
       (msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc))) {
      previewPanel_->finishPointer();if(msg->type()==ui::kKeyDownMessage)return true;
    }
    if(msg->type()==ui::kKeyUpMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyS)paletteSamplingHeld_=false;
    if(msg->type()==ui::kKeyUpMessage && (static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyAlt || static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyAltGr)){eyedropperHeld_=false;paletteSamplingHeld_=false;updateNavigationCursor();}
    if(symmetryDragging_ && !hasCapture())finishSymmetryDrag(true);
    if(eyedropperGesture_.active() && !hasCapture())eyedropperGesture_.finish();
    if(selectionTool_ && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)){selectionShift_=msg->shiftPressed();selectionCtrl_=msg->ctrlPressed() || msg->cmdPressed();layoutToolOptions();invalidateRect(canvasViewport());updateNavigationCursor();}
    if((selectionDragging_ || floatingDragging_) && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()>=ui::kKeyLShift && key->scancode()<=ui::kKeyCommand){ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,selectionRight_?ui::kButtonRight:ui::kButtonLeft,key->modifiers(),selectionPointerPosition_);selectionSyntheticMove_=true;onProcessMessage(&move);selectionSyntheticMove_=false;return true;}}
    if(msg->type()==ui::kMouseLeaveMessage){selectionBrushPointer_.reset();invalidateRect(canvasViewport());}
    if(processSizeDrag(msg))return true;
    if(msg->type()==ui::kFocusLeaveMessage) {
      if(symmetryDragging_)finishSymmetryDrag(true);eyedropperHeld_=false;paletteSamplingHeld_=false;if(eyedropperGesture_.active())finishEyedropper();spaceHeld_=false;if(selectionPivotDragging_){selectionPivot_=selectionPivotStart_;selectionPivotDragging_=false;if(hasCapture())releaseMouse();}if(selectionDragging_ || floatingDragging_)endSelectionGesture(true);cancelStroke();updateNavigationCursor();
    }
    if(gradientDragging_ && !hasCapture()){if(gradientPending_ && gradientHandle_>=0){gradientSpec_=gradientHandleBefore_;gradientDragging_=false;gradientHandle_=-1;gradientRequest_=true;gradientTick();refresh();}else cancelStroke();}if((fillDragging_ || shapeDragging_) && !hasCapture())cancelStroke();
    if(pan_.active && !hasCapture()) finishPan(true);
    if(msg->type()==ui::kSetCursorMessage) {updateNavigationCursor();return true;}
    if(msg->type()==ui::kKeyUpMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeySpace) {
      if(marqueeSpaceTarget_){const auto last=*marqueeTarget_,first=*marqueeSpaceTarget_;selectionStart_.x+=int(std::round(last.x-first.x));selectionStart_.y+=int(std::round(last.y-first.y));if(marqueeSpaceHadResize_){marqueeResizeStart_=last;marqueePointerStart_={double(selectionLast_.x),double(selectionLast_.y)};}marqueeSpaceTarget_.reset();invalidateRect(canvasViewport());}spaceHeld_=false;updateNavigationCursor();return true;
    }
    if(selectionPivotDragging_ && msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){selectionPivot_=selectionPivotStart_;selectionPivotDragging_=false;if(hasCapture())releaseMouse();invalidateRect(canvasViewport());return true;}
    if(shapeDragging_ && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)){const auto key=static_cast<ui::KeyMessage*>(msg);const auto code=key->scancode();if(code>=ui::kKeyLShift && code<=ui::kKeyCommand){if(shapeSpec_.kind==ShapeKind::Line)shapeSpec_.end=key->shiftPressed()?constrainShapeLine(shapeSpec_.start,shapePointer_):shapePointer_;else shapeGeometry_.update(shapeSpec_,shapePointer_,key->shiftPressed(),key->ctrlPressed() || key->cmdPressed(),key->altPressed(),shapeRatio_?shapeRatioWidth_/shapeRatioHeight_:0);shapeRequest_=true;shapeTick();return true;}}
    if(msg->type()==ui::kKeyDownMessage) {
      auto key=static_cast<ui::KeyMessage*>(msg);
      if(symmetryDragging_){if(key->scancode()==ui::kKeyEsc)finishSymmetryDrag(true);return true;}
      if(pending_!=Pending::None) { if(key->scancode()==ui::kKeyEsc) resolve(false); return false; }
      if(key->scancode()==ui::kKeyS && key->altPressed() && !key->ctrlPressed() && !key->cmdPressed() && !paletteFocused_ && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){paletteSamplingHeld_=true;return true;}
      if(eyedropperGesture_.active()){if(key->scancode()==ui::kKeyEsc)finishEyedropper();return true;}
      if((key->scancode()==ui::kKeyAlt || key->scancode()==ui::kKeyAltGr) && !document.active() && !selectionDragging_ && !floatingDragging_ && !paletteFocused_ && !spaceHeld_ && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){eyedropperHeld_=true;updateNavigationCursor();return true;}
      if(key->scancode()==ui::kKeySpace && selectionDragging_ && !selectionBoxDragging_ && selectionKind_<=1 && marqueeTarget_){if(!marqueeSpaceTarget_){marqueeSpaceTarget_=marqueeTarget_;marqueeSpacePointer_={double(selectionLast_.x),double(selectionLast_.y)};marqueeSpaceHadResize_=bool(marqueeResizeStart_);}return true;}
      if(key->scancode()==ui::kKeySpace) {spaceHeld_=true;updateNavigationCursor();return true;}
      if(pan_.active) {
        if(key->scancode()==ui::kKeyEsc) finishPan(true);
        return true;
      }
      if(paletteFocused_ && (key->scancode()==ui::kKeyDel || key->scancode()==ui::kKeyBackspace)) {
        const auto ids=document.palette().selected;document.deletePaletteColors(ids);refresh();return true;
      }
      if(shapeDragging_){if(key->scancode()==ui::kKeyEsc)cancelStroke();return true;}
      if(gradientDragging_ || gradientPending_){if(key->scancode()==ui::kKeyEsc){if(gradientDragging_ && gradientPending_ && gradientHandle_>=0){gradientSpec_=gradientHandleBefore_;gradientDragging_=false;gradientHandle_=-1;gradientRequest_=true;if(hasCapture())releaseMouse();gradientTick();refresh();}else cancelGradientGesture();}else if(key->scancode()==ui::kKeyEnter)applyGradientGesture();return true;}
      if(fillDragging_){if(key->scancode()==ui::kKeyEsc)cancelStroke();return true;}
      if(selectionDragging_ || floatingDragging_){if(key->scancode()==ui::kKeyEsc || ((key->ctrlPressed() || key->cmdPressed()) && key->scancode()==ui::kKeyD))endSelectionGesture(true);else if(polygonPending_ && (key->ctrlPressed() || key->cmdPressed()) && (key->scancode()==ui::kKeyZ || key->scancode()==ui::kKeyY))polygonStep(key->scancode()==ui::kKeyY || key->shiftPressed());else if(key->scancode()==ui::kKeyEnter && polygonPending_)endSelectionGesture(false);else if(key->scancode()==ui::kKeyEnter && selectionKind_==4){wandReleased_=true;if(hasCapture())releaseMouse();if(wandPreviewReady_)endSelectionGesture(false);else wandTick();}return true;}
      if(((selectionTool_ && selectionKind_==5) || shapeTool_) && !paletteFocused_ && !key->altPressed()){
        if((key->ctrlPressed() || key->cmdPressed()) && key->scancode()>=ui::kKey1 && key->scancode()<=ui::kKey3){brushProfiles_[0].shape=BrushShape(key->scancode()-ui::kKey1);saveBrushPreferences();refresh();return true;}
        if(!key->ctrlPressed() && !key->cmdPressed() && (key->scancode()==ui::kKeyOpenbrace || key->scancode()==ui::kKeyClosebrace)){brushProfiles_[0].size=std::clamp(brushProfiles_[0].size+(key->scancode()==ui::kKeyClosebrace?1:-1),1,64);saveBrushPreferences();refresh();return true;}
      }
      if(document.selection() && !paletteFocused_ && !key->ctrlPressed() && !key->cmdPressed() && !key->altPressed()){
        int dx=0,dy=0;if(key->scancode()==ui::kKeyLeft)dx=-1;else if(key->scancode()==ui::kKeyRight)dx=1;else if(key->scancode()==ui::kKeyUp)dy=-1;else if(key->scancode()==ui::kKeyDown)dy=1;
        if(dx || dy){if(document.nudgeSelectionContent(dx,dy,frameSelectionExplicit_)){playing_=false;hideTimelineSelectionGuides();refresh();}return true;}
      }
      if(key->scancode()==ui::kKeyEnter){if(document.floating()){document.commitFloatingPaste();refresh();}else togglePlayback();return true;}
      if(key->ctrlPressed() && key->scancode()==ui::kKeyI){chooseSheetSource();return true;}
      if(key->ctrlPressed() && key->scancode()==ui::kKeyE){openDocumentExport();return true;}
      if(key->shiftPressed() && !key->ctrlPressed() && !key->cmdPressed() && key->scancode()==ui::kKeyR && !paletteFocused_){openReplaceColor();return true;}
      if((key->ctrlPressed() || key->cmdPressed()) && key->scancode()==ui::kKeyU && !paletteFocused_){openColorAdjustment(ColorAdjustmentKind::HueSaturation);return true;}
      if((key->ctrlPressed() || key->cmdPressed()) && key->scancode()==ui::kKeyT && !paletteFocused_){beginLayerTransform();return true;}
      if(key->ctrlPressed() || key->cmdPressed()){if(key->scancode()==ui::kKeyC){if(frameSelectionExplicit_){document.copySelectedFrames();refresh();}else copySelectionPixels(false);return true;}if(key->scancode()==ui::kKeyX){copySelectionPixels(true);return true;}if(key->scancode()==ui::kKeyV){if(frameSelectionExplicit_){document.pasteCopiedFrames();refresh();}else pasteSelectionPixels();return true;}if(!paletteFocused_ && !frameSelectionExplicit_){if(key->scancode()==ui::kKeyA){document.selectAllPixels();refresh();return true;}if(key->scancode()==ui::kKeyD){document.deselectPixels();refresh();return true;}if(key->shiftPressed() && key->scancode()==ui::kKeyI){document.invertPixels();refresh();return true;}}}
      if(!key->altPressed() && !key->ctrlPressed() && !key->cmdPressed() && !paletteFocused_){if(key->scancode()==ui::kKeyI && !key->shiftPressed() && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){useEyedropperTool();return true;}if(key->scancode()==ui::kKeyU){useShapeTool(shapeSpec_.kind==ShapeKind::Line?ShapeKind::Rectangle:shapeSpec_.kind);return true;}if(key->scancode()==ui::kKeyG){if(key->shiftPressed())useGradientTool();else useFillTool();return true;}if(key->scancode()==ui::kKeyM){useSelectionTool(key->shiftPressed()?1:0);return true;}if(key->scancode()==ui::kKeyQ){useSelectionTool(key->shiftPressed()?3:2);return true;}if(key->scancode()==ui::kKeyW){useSelectionTool(4);return true;}}

      if(key->altPressed()){if(key->scancode()==ui::kKeyM){playing_=false;document.addLinkedFrame(frameSelectionExplicit_);refresh();return true;}if(key->scancode()==ui::kKeyN){frameAction(1);return true;}if(key->scancode()==ui::kKeyB){frameAction(0);return true;}if(key->scancode()==ui::kKeyC){frameAction(2);return true;}}
      switch(key->scancode()) {
        case ui::kKeyH: cancelStroke();shapeTool_=false;eyedropperTool_=false;gradientTool_=false;fillTool_=false;handTool_=true;updateNavigationCursor();refresh();return true;
        case ui::kKeyTab: if(!key->ctrlPressed()){layersPanelOpen_=!layersPanelOpen_;refresh();return true;}break;
        case ui::kKeyF: if(!document.active()) fitCanvas(); return true;
        case ui::kKeyEsc: playing_=false;if(document.floating())document.cancelFloatingPaste();cancelStroke();refresh();return true;
        case ui::kKeyB: document.commitFloatingPaste();cancelStroke(); selectionTool_=false;shapeTool_=false;eyedropperTool_=false;gradientTool_=false;fillTool_=false;handTool_=false; eraser_=false; updateNavigationCursor();refresh(); return true;
        case ui::kKeyE: document.commitFloatingPaste();cancelStroke(); selectionTool_=false;shapeTool_=false;eyedropperTool_=false;gradientTool_=false;fillTool_=false;handTool_=false; eraser_=true; updateNavigationCursor();refresh(); return true;
        case ui::kKeyZ: if(key->ctrlPressed()) { cancelStroke(); if(key->shiftPressed()) document.redo(); else document.undo(); refresh(); return true; } break;
        case ui::kKeyY: if(key->ctrlPressed()) {cancelStroke();document.redo();refresh();return true;} break;
        case ui::kKeyS: if(key->ctrlPressed()) {saveProject(key->shiftPressed());return true;} break;
        case ui::kKeyO: if(key->ctrlPressed()) {cancelStroke();chooseProject();return true;} break;
        case ui::kKeyDel: if(!paletteFocused_){cancelStroke();if(document.selection() || document.floating())document.deleteSelectedPixels();else document.deleteLayer();refresh();return true;}break;
        case ui::kKeyN: if(key->shiftPressed() && !key->ctrlPressed()){cancelStroke();document.addLayer();refresh();return true;}if(key->ctrlPressed()) {ask(Pending::New);return true;} break;
        default: break;
      }
    }
    if(polygonPending_ && msg->type()==ui::kDoubleClickMessage && static_cast<ui::MouseMessage*>(msg)->left() && selectionPath_.size()>=3){endSelectionGesture(false);return true;}
    if(pending_==Pending::None && msg->type()==ui::kDoubleClickMessage &&
      paletteContentBounds().contains(static_cast<ui::MouseMessage*>(msg)->position())) {
      cancelStroke();document.addPaletteColor(ink_,paletteLocked_);paletteFocused_=true;refresh();return true;
    }
    if(pending_==Pending::None && msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->right()) {
      const auto point=static_cast<ui::MouseMessage*>(msg)->position();const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
      if(palettePanelOpen_ && uiPhysical(gfx::Rect(rc.x+l.rightX,rc.y+l.tabY,l.right,Layout::tabHeight)).contains(point)){showColumnContextMenu(Column::Palette);return true;}
      if(colorPickerOpen_ && uiPhysical(gfx::Rect(rc.x+l.rightX,rc.y+l.split,l.right,Layout::tabHeight)).contains(point)){showColumnContextMenu(Column::Color);return true;}
      if(layersPanelOpen_ && uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop,l.workW,16)).contains(point)){showColumnContextMenu(Column::Layers);return true;}
    }
    if(pending_==Pending::None && msg->type()==ui::kMouseDownMessage && !document.active()) {
      const auto mouse=static_cast<ui::MouseMessage*>(msg);
      if(brushRange_) brushRange_->setVisible(false);
      if(palettePanelOpen_ && paletteContentBounds().contains(mouse->position())) {document.clearPaletteSelection();paletteFocused_=true;refresh();}
      else paletteFocused_=false;
    }
    if(pending_==Pending::None && layersPanelOpen_ && msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->right()) {
      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
      if(uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop,l.workW,l.bottom-l.layerTop)).contains(mouse->position())){
        const auto point=mouse->position();const int row=(point.y/uiScale-rc.y-l.layerTop-49)/12+layerScroll_;
        if(point.y/uiScale>=rc.y+l.layerTop+49 && point.x/uiScale>=rc.x+l.workX+5 && point.x/uiScale<rc.x+l.workX+89 && row>=0 && row<int(document.timeline().state().layers.size())){document.selectLayer(document.timeline().state().layers[row].id);refresh();showLayerContextMenu(1);}else showLayerContextMenu(0);
        return true;
      }
    }
    if(pending_==Pending::None && layersPanelOpen_ && msg->type()==ui::kMouseWheelMessage) {
      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
      if(uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop+37,l.workW,l.bottom-l.layerTop-37)).contains(mouse->position())){layerScroll_+=mouse->wheelDelta().y>0?-1:1;refresh();return true;}
    }
    if(pending_==Pending::None && msg->type()==ui::kMouseWheelMessage) {
      const auto mouse=static_cast<ui::MouseMessage*>(msg);
      const auto logical=uiLogical(bounds());
      if(mouse->position().x>=bounds().x+workspaceLayout(uiLogical(bounds())).workX*uiScale && mouse->position().y>=bounds().y+Layout::optionsY*uiScale && mouse->position().y<bounds().y+Layout::workY*uiScale && !mouse->ctrlPressed() && !mouse->cmdPressed()) {
        const auto delta=mouse->wheelDelta();toolRowScroll_+=(delta.x?delta.x:delta.y)*24;layoutToolOptions();invalidate();return true;
      }
      if(palettePanelOpen_ && paletteContentBounds().contains(mouse->position())) {
        paletteWheel(*mouse);
        return true;
      }
      if(canvasViewport().contains(mouse->position())) {
        // Keep the coordinate mapping stable until the current stroke ends.
        if((!document.active() || (document.floating() && !floatingDragging_ && !selectionDragging_)) && !pan_.active && mouse->wheelDelta().y!=0)
          zoomCanvas(mouse->position(),mouse->wheelDelta().y<0?1:-1);
        return true;
      }
    }
    if(pending_==Pending::None && (msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage)) {
      auto mouse=static_cast<ui::MouseMessage*>(msg);if(msg->type()==ui::kMouseMoveMessage && !selectionSyntheticMove_)selectionAutoPan(mouse->position());selectionPointerPosition_=mouse->position(); const auto p=canvasPoint(mouse->position());
      if(symmetryDragging_){if(msg->type()==ui::kMouseMoveMessage){if(!symmetryAxisDragAllowed(symmetryLocked_,mouse->ctrlPressed())){finishSymmetryDrag();return true;}document.setSymmetryCenter(moveSymmetryCenter(document.symmetryCenter(),symmetryDragAxis_,{(mouse->position().x-canvas_.x)/canvasScale(),(mouse->position().y-canvas_.y)/canvasScale()},document.width(),document.height()),false);invalidateRect(canvasViewport());}if(msg->type()==ui::kMouseUpMessage)finishSymmetryDrag();return true;}
      if(msg->type()==ui::kMouseDownMessage && mouse->left() && !document.active() && !selectionDragging_ && !floatingDragging_ && !spaceHeld_ && !handTool_){if(auto hit=symmetryHit(mouse->position(),mouse->ctrlPressed())){symmetryDragging_=true;symmetryDragAxis_=*hit;symmetryDragBefore_=document.symmetryCenter();captureMouse();return true;}}
      if(eyedropperGesture_.active()){if(msg->type()==ui::kMouseMoveMessage && canvasViewport().contains(mouse->position()))sampleEyedropperAt(p);if(msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_)finishEyedropper();return true;}
      if(msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && (eyedropperTool_ || mouse->altPressed()) && !mouse->ctrlPressed() && !mouse->cmdPressed() && !spaceHeld_ && !document.active() && !selectionDragging_ && !floatingDragging_ && canvasViewport().contains(mouse->position())){paletteFocused_=false;requestFocus();playing_=false;strokeButton_=mouse->button();eyedropperGesture_.begin(mouse->right(),!eyedropperTool_ || mouse->altPressed());captureMouse();sampleEyedropperAt(p);updateNavigationCursor();return true;}
      if(msg->type()==ui::kMouseDownMessage && mouse->left() && !spaceHeld_ && !handTool_ && !document.active() && !mouse->shiftPressed() && !mouse->ctrlPressed() && !mouse->cmdPressed() && !mouse->altPressed() && canvasViewport().contains(mouse->position()) && selectionPivotHit(mouse->position())){selectionPivotDragging_=true;selectionPivotStart_=selectionPivotPoint();selectionPivotPointerStart_=transformCanvasPoint(mouse->position());captureMouse();return true;}
      if(selectionPivotDragging_){if(msg->type()==ui::kMouseMoveMessage || (msg->type()==ui::kMouseUpMessage && mouse->left())){auto at=transformCanvasPoint(mouse->position());auto round=[](double v){return std::copysign(std::floor(std::abs(v)+.5),v);};selectionPivot_=TransformPoint{selectionPivotStart_.x+round(at.x-selectionPivotPointerStart_.x),selectionPivotStart_.y+round(at.y-selectionPivotPointerStart_.y)};invalidateRect(canvasViewport());}if(msg->type()==ui::kMouseUpMessage){if(mouse->button()==ui::kButtonNone)selectionPivot_=selectionPivotStart_;selectionPivotDragging_=false;if(hasCapture())releaseMouse();updateNavigationCursor();}return true;}
      if(selectionTool_){selectionShift_=mouse->shiftPressed();selectionCtrl_=mouse->ctrlPressed() || mouse->cmdPressed();selectionRight_=mouse->right();layoutToolOptions();invalidateRect(canvasViewport());}
      if(selectionTool_ && selectionKind_==5){selectionBrushPointer_=canvasViewport().contains(mouse->position()) || selectionDragging_?std::optional<gfx::Point>{mouse->position()}:std::optional<gfx::Point>{};invalidateRect(canvasViewport());if(selectionDragging_ && !selectionBoxDragging_ && selectionBrushIdentity_!=document.identity()){selectionDragging_=false;selectionBrushStroke_={};if(hasCapture())releaseMouse();return true;}}

      if(msg->type()==ui::kMouseUpMessage && mouse->button()==ui::kButtonNone) {
        eyedropperHeld_=false;paletteSamplingHeld_=false;if(eyedropperGesture_.active())finishEyedropper();spaceHeld_=false;if(selectionPivotDragging_){selectionPivot_=selectionPivotStart_;selectionPivotDragging_=false;if(hasCapture())releaseMouse();}if(selectionDragging_ || floatingDragging_)endSelectionGesture(true);cancelStroke();updateNavigationCursor();return true;
      }
      if(pan_.active) {
        if(msg->type()==ui::kMouseMoveMessage || (msg->type()==ui::kMouseUpMessage && mouse->button()==panButton_)) {
          const auto origin=pan_.move({mouse->position().x,mouse->position().y});
          const auto previous=canvas_;
          canvas_.x=origin.x;canvas_.y=origin.y;constrainCanvas();
          if(canvas_!=previous) invalidateRect(canvasViewport());
          if(msg->type()==ui::kMouseUpMessage) finishPan(false);
        }
        return true;
      }
      if(shapeDragging_){shapePointer_={double(p.x),double(p.y)};if(msg->type()==ui::kMouseMoveMessage || (msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_)){if(shapeSpec_.kind==ShapeKind::Line)shapeSpec_.end=mouse->shiftPressed()?constrainShapeLine(shapeSpec_.start,{double(p.x),double(p.y)}):TransformPoint{double(p.x),double(p.y)};else shapeGeometry_.update(shapeSpec_,{double(p.x),double(p.y)},mouse->shiftPressed(),mouse->ctrlPressed() || mouse->cmdPressed(),mouse->altPressed(),shapeRatio_?shapeRatioWidth_/shapeRatioHeight_:0);shapeRequest_=true;if(msg->type()==ui::kMouseUpMessage){shapeTick();if(document.shapeActive())document.commitShapePreview();shapeDragging_=shapeRequest_=false;if(hasCapture())releaseMouse();refresh();}else invalidateRect(canvasViewport());}return true;}
      if(shapeTool_ && msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && !spaceHeld_ && !handTool_ && canvasViewport().contains(mouse->position()) && canvas_.contains(mouse->position())){hideTimelineSelectionGuides();paletteFocused_=false;document.clearPaletteSelection();requestFocus();playing_=false;strokeButton_=mouse->button();if(document.beginShapePreview()){shapePointer_=shapeSpec_.start=shapeSpec_.end={double(p.x),double(p.y)};shapeSpec_.bounds={double(p.x),double(p.y),1,1};shapeGeometry_={};shapeColor_=shapeSpec_.kind==ShapeKind::Line && mouse->right()?document.palette().secondary:ink_;shapeIdentity_=document.identity();shapeDragging_=shapeRequest_=true;captureMouse();shapeTick();refresh();}return true;}
      if(gradientDragging_){if(msg->type()==ui::kMouseMoveMessage || (msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_)){const TransformPoint at{double(p.x),double(p.y)};if(gradientHandle_>=0){const TransformPoint delta{at.x-gradientHandlePress_.x,at.y-gradientHandlePress_.y};gradientSpec_=gradientHandleBefore_;if(gradientHandle_==0){gradientSpec_.start={gradientHandleBefore_.start.x+delta.x,gradientHandleBefore_.start.y+delta.y};gradientSpec_.geometry.reset();}else if(gradientHandle_==1){gradientGeometry_.update(gradientSpec_,at,mouse->shiftPressed(),mouse->ctrlPressed() || mouse->cmdPressed(),mouse->altPressed());}else{gradientSpec_.start={gradientHandleBefore_.start.x+delta.x,gradientHandleBefore_.start.y+delta.y};gradientSpec_.end={gradientHandleBefore_.end.x+delta.x,gradientHandleBefore_.end.y+delta.y};if(gradientSpec_.geometry){gradientSpec_.geometry->center.x+=delta.x;gradientSpec_.geometry->center.y+=delta.y;}}}else gradientGeometry_.update(gradientSpec_,at,mouse->shiftPressed(),mouse->ctrlPressed() || mouse->cmdPressed(),mouse->altPressed());gradientRequest_=true;if(msg->type()==ui::kMouseUpMessage){gradientTick();gradientDragging_=false;if(hasCapture())releaseMouse();if(gradientConfirm_){if(gradientSpec_.start.x==gradientSpec_.end.x && gradientSpec_.start.y==gradientSpec_.end.y)cancelGradientGesture();else{gradientPending_=true;refresh();}}else applyGradientGesture();}else invalidateRect(canvasViewport());}return true;}
      if(gradientPending_ && msg->type()==ui::kMouseDownMessage && mouse->left() && !mouse->ctrlPressed() && !mouse->cmdPressed() && !spaceHeld_ && canvasViewport().contains(mouse->position())){const auto at=TransformPoint{double(p.x),double(p.y)};gradientHandle_=gradientEditHandle(gradientSpec_,at,canvasScale());if(gradientHandle_<0)return true;gradientHandlePress_=at;gradientHandleBefore_=gradientSpec_;gradientGeometry_={};gradientDragging_=true;strokeButton_=mouse->button();captureMouse();return true;}
      if(gradientTool_ && !gradientPending_ && msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && !spaceHeld_ && !handTool_ && canvasViewport().contains(mouse->position()) && canvas_.contains(mouse->position())){hideTimelineSelectionGuides();paletteFocused_=false;document.clearPaletteSelection();requestFocus();playing_=false;strokeButton_=mouse->button();gradientRight_=mouse->right();if(document.beginGradient(p,gradientOptions_)){gradientSpec_.start=gradientSpec_.end={double(p.x),double(p.y)};gradientSpec_.angle=0;gradientSpec_.geometry.reset();gradientGeometry_={};gradientDragging_=true;gradientIdentity_=document.identity();gradientContent_=document.contentRevision();gradientLayer_=document.layer().id;gradientFrame_=document.frame().id;gradientRequest_=true;captureMouse();gradientTick();refresh();}return true;}
      if(fillDragging_){if(msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_){fillDragging_=false;fillCommitted_=false;if(hasCapture())releaseMouse();refresh();}return true;}
      if(fillTool_ && msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && !spaceHeld_ && !handTool_ && canvasViewport().contains(mouse->position()) && canvas_.contains(mouse->position())){hideTimelineSelectionGuides();paletteFocused_=false;document.clearPaletteSelection();requestFocus();playing_=false;strokeButton_=mouse->button();try{fillCommitted_=document.fillPatternPixels(p,mouse->right()?document.palette().secondary:ink_,fillPattern_,fillOptions_);fillDragging_=fillCommitted_;if(fillDragging_)captureMouse();}catch(const std::exception& e){status_=U"填充失败："+unicodeText(e.what());}refresh();return true;}
      if(msg->type()==ui::kMouseDownMessage && !document.active() && canvasViewport().contains(mouse->position()) &&
         (mouse->middle() || (mouse->left() && (spaceHeld_ || handTool_)))) {
        requestFocus();captureMouse();
        pan_.begin({mouse->position().x,mouse->position().y},{canvas_.x,canvas_.y});
        panButton_=mouse->button();updateNavigationCursor();return true;
      }
      if((selectionDragging_ || floatingDragging_) && msg->type()==ui::kMouseMoveMessage){selectionMoved_|=std::abs(mouse->position().x-selectionPress_.x)>3 || std::abs(mouse->position().y-selectionPress_.y)>3;if(floatingDragging_ && !transformHandle_.empty()){const auto current=transformCanvasPoint(mouse->position());auto target=transformGestureStart_;if(selectionFreeTransform_ && target.quad){const int index=transformHandle_=="nw"?0:transformHandle_=="ne"?1:transformHandle_=="se"?2:3;auto quad=*target.quad;quad[index]={std::floor(current.x+.5),std::floor(current.y+.5)};if(selectionQuadConvex(quad)){target.quad=quad;const auto box=transformBounds(target);target.x=box.x;target.y=box.y;target.width=box.width;target.height=box.height;target.angle=0;target.shearX=target.shearY=0;}}
          else if(transformHandle_.rfind("shear-",0)==0)target=shearSelectionTransform(transformGestureStart_,{current.x-transformPointerStart_.x,current.y-transformPointerStart_.y},transformHandle_.back(),selectionPivotStart_);
          else if(transformHandle_.rfind("rotate-",0)==0){const double cx=selectionPivotStart_.x,cy=selectionPivotStart_.y;const double delta=(std::atan2(current.y-cy,current.x-cx)-std::atan2(transformPointerStart_.y-cy,transformPointerStart_.x-cx))*180/3.141592653589793;target.angle=transformGestureStart_.angle+delta;if(mouse->shiftPressed())target.angle=std::floor(target.angle/45+.5)*45;const double radians=(target.angle-transformGestureStart_.angle)*3.141592653589793/180,dx=transformGestureStart_.x+target.width/2-cx,dy=transformGestureStart_.y+target.height/2-cy;target.x=cx+dx*std::cos(radians)-dy*std::sin(radians)-target.width/2;target.y=cy+dx*std::sin(radians)+dy*std::cos(radians)-target.height/2;}else {target=resizeSelectionTransform(transformGestureStart_,{double(p.x-selectionStart_.x),double(p.y-selectionStart_.y)},transformHandle_,mouse->shiftPressed(),mouse->ctrlPressed() || mouse->cmdPressed(),mouse->altPressed(),selectionPivotStart_);if(selectionPivot_ && !mouse->altPressed()){const auto local=transformLocalPoint(transformGestureStart_,selectionPivotStart_);selectionPivot_=transformPoint(target,(local.x-transformGestureStart_.x)/transformGestureStart_.width,(local.y-transformGestureStart_.y)/transformGestureStart_.height);}}document.transformFloatingPaste(target,selectionRotSprite_);}else if(floatingDragging_){int dx=p.x-selectionStart_.x,dy=p.y-selectionStart_.y;const auto distance=constrainedSelectionDelta({dx,dy},mouse->shiftPressed());dx=distance.x;dy=distance.y;auto target=transformGestureStart_;target.x+=dx;target.y+=dy;if(target.quad)for(auto& point:*target.quad){point.x+=dx;point.y+=dy;}if(selectionPivot_)selectionPivot_=TransformPoint{selectionPivotStart_.x+dx,selectionPivotStart_.y+dy};if(target.flipOriginX)*target.flipOriginX+=dx;if(target.flipOriginY)*target.flipOriginY+=dy;document.transformFloatingPaste(target,selectionRotSprite_);}else if(selectionBoxDragging_){int dx=p.x-selectionStart_.x,dy=p.y-selectionStart_.y;const auto distance=constrainedSelectionDelta({dx,dy},mouse->shiftPressed());dx=distance.x;dy=distance.y;auto moved=selectionBefore_;moved->x+=dx;moved->y+=dy;document.previewSelection(std::move(moved));}else updateSelectionCreation(p,mouse->shiftPressed() && !(selectionBefore_ && gestureSelectionMode_==1),mouse->ctrlPressed() || mouse->cmdPressed(),mouse->altPressed());invalidateRect(canvasViewport());return true;}
      if((selectionDragging_ || floatingDragging_) && msg->type()==ui::kMouseUpMessage){if(polygonPending_){if(hasCapture())releaseMouse();return true;}if(selectionDragging_ && !selectionBoxDragging_ && selectionKind_==4){wandReleased_=true;if(hasCapture())releaseMouse();if(wandPreviewReady_)endSelectionGesture(false);else wandTick();return true;}endSelectionGesture(false);return true;}
      if(msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && !spaceHeld_ && !handTool_ && canvasViewport().contains(mouse->position()) && (selectionTool_ || document.floating())){
        if(mouse->left() && !mouse->shiftPressed() && !mouse->ctrlPressed() && !mouse->cmdPressed() && !mouse->altPressed() && selectionPivotHit(mouse->position())){selectionPivotDragging_=true;selectionPivotStart_=selectionPivotPoint();selectionPivotPointerStart_=transformCanvasPoint(mouse->position());captureMouse();return true;}
        if(polygonPending_){if(mouse->left() && selectionPath_.size()>=3 && p.x==selectionPath_.front().x && p.y==selectionPath_.front().y){endSelectionGesture(false);return true;}if(mouse->right())polygonStep(false);else{if(selectionPath_.empty() || selectionPath_.back().x!=p.x || selectionPath_.back().y!=p.y){selectionPath_.push_back({p.x,p.y});selectionPathRedo_.clear();}updateSelectionCreation(p);}return true;}
        bool quickPress=false;
        if(!selectionFreeTransform_ && selectionKind_==0 && mouse->left()){
          const auto now=std::chrono::steady_clock::now();const auto at=mouse->position();
          quickPress=quickSelectionPress_ && now-quickSelectionTime_<=std::chrono::milliseconds(500) && (at.x-quickSelectionPress_->x)*(at.x-quickSelectionPress_->x)+(at.y-quickSelectionPress_->y)*(at.y-quickSelectionPress_->y)<=36;
          if(quickPress)quickSelectionPress_.reset();else{quickSelectionPress_=at;quickSelectionTime_=now;}
        }
        if(quickPress){quickSelection_=true;quickSelectionCell_=SelectionMask{int(std::floor(p.x/4.0))*4,int(std::floor(p.y/4.0))*4,4,4,{}};}
        hideTimelineSelectionGuides();paletteFocused_=false;requestFocus();const bool copy=mouse->ctrlPressed() || mouse->cmdPressed();int hit=mouse->left() && (selectionFreeTransform_ || !mouse->shiftPressed()) && !quickPress?selectionHit(mouse->position()):0;if(hit==2 && !copy && selectionMode_>=2 && !selectionFreeTransform_)hit=0;
        const auto handle=mouse->left() && (selectionFreeTransform_ || !mouse->shiftPressed()) && !quickPress?transformHit(mouse->position()):std::string{};if(selectionFreeTransform_ && !(mouse->left() && (hit==2 || !handle.empty())))return true;if(document.selection() && (hit || !handle.empty()))selectionPropertiesActive_=true;
        if(!handle.empty()){if(!document.beginSelectionContentMove(false,frameSelectionExplicit_)){status_=U"目标图层隐藏或锁定";refresh();return true;}floatingDragging_=true;transformHandle_=handle;transformGestureStart_=*document.floatingTransform();transformPointerStart_=transformCanvasPoint(mouse->position());selectionPivotBeforeGesture_=selectionPivot_;selectionPivotStart_=selectionPivotPoint();selectionMoved_=false;selectionStart_=p;selectionPress_=mouse->position();playing_=false;captureMouse();invalidateRect(canvasViewport());return true;}
        if(hit==2 || (copy && hit==1)){selectionCopyDrag_=copy && !document.floating();if(!document.beginSelectionContentMove(copy,frameSelectionExplicit_)){status_=U"目标图层隐藏或锁定";refresh();return true;}floatingDragging_=true;transformGestureStart_=*document.floatingTransform();selectionPivotBeforeGesture_=selectionPivot_;selectionPivotStart_=selectionPivotPoint();floatingStart_={int(std::floor(document.floatingTransform()->x)),int(std::floor(document.floatingTransform()->y))};playing_=false;}
        else if(hit==1){document.prepareSelectionBoxMove();selectionBefore_=document.selection();selectionDragging_=selectionBoxDragging_=true;}
        else{selectionPropertiesActive_=false;document.commitFloatingPaste();selectionBefore_=document.selection();selectionStatusBefore_=status_;selectionPreview_.reset();gestureSelectionMode_=mouse->right()?2:mouse->shiftPressed()?1:selectionMode_;selectionDragging_=true;selectionBoxDragging_=false;polygonPending_=selectionKind_==3;selectionPath_={{p.x,p.y}};selectionPathRedo_.clear();if(selectionKind_==5){selectionBrushStroke_={};selectionBrushLast_={p.x,p.y};selectionBrushIdentity_=document.identity();}if(selectionKind_==4){++wandGeneration_;wandReleased_=false;wandPreviewReady_=false;wandLastPoint_.reset();wandIdentity_=document.identity();wandContentRevision_=document.contentRevision();wandLayer_=document.layer().id;wandFrame_=document.frame().id;wandSource_=std::make_shared<const std::vector<Pixel>>(wandOptions_.visibleLayers?compositeNormalRegion(document.timeline(),document.frame().id,{0,0,document.width(),document.height()}):document.pixels());}}

        selectionMoved_=false;selectionStart_=selectionLast_=p;selectionPress_=mouse->position();
        if(selectionDragging_ && !selectionBoxDragging_)updateSelectionCreation(p);captureMouse();return true;
      }
      if(msg->type()==ui::kMouseDownMessage && !document.active() && (mouse->left() || mouse->right()) && !spaceHeld_ && !handTool_ && canvasViewport().contains(mouse->position()) && canvas_.contains(mouse->position())) {
        hideTimelineSelectionGuides();paletteFocused_=false;const bool hadSelection=!document.palette().selected.empty();document.clearPaletteSelection();requestFocus(); captureMouse(); strokeButton_=mouse->button();
        const auto revision=document.contentRevision();const bool wasDirty=document.dirty();
        recentDrag_.reset();strokeColor_=mouse->right()?document.palette().secondary:eraser_?0:ink_;
        playing_=false;resolvePencilImageBrush();document.beginStroke(p,strokeColor_,brushProfiles_[eraser_?1:0],pencilImageBrush_?&*pencilImageBrush_:nullptr,pencilImageBrushAngle_);invalidateStrokePixels(revision);
        if(hadSelection) invalidateRect(paletteContentBounds());
        if(wasDirty!=document.dirty()) {layoutDocumentTab();const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);invalidateRect(uiPhysical(gfx::Rect(rc.x+Layout::edge,rc.y+Layout::documentY,rc.w-2*Layout::edge,Layout::tabHeight+Layout::frame)));}
        return true;
      }
      if(document.active() && msg->type()==ui::kMouseMoveMessage) {const auto revision=document.contentRevision();document.updateStroke(p);invalidateStrokePixels(revision);return true;}
      if(document.active() && msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_) {const auto revision=document.contentRevision();document.updateStroke(p);invalidateStrokePixels(revision);document.commitStroke();releaseMouse();refresh();return true;}
    }
    return ui::Widget::onProcessMessage(msg);
  }
};
class Desktop : public ui::Window {
public:
  Editor* editor=nullptr;
  bool approved=false;
  Desktop():ui::Window(ui::Window::DesktopWindow) {}
  void onBeforeClose(ui::CloseEvent& ev) override {
    if(!approved && editor) {ev.cancel(); editor->requestClose();}
  }
};
class Manager : public ui::Manager {
public:
  Desktop* desktop=nullptr;
  std::function<void()> refreshCursor;
  explicit Manager(const os::WindowRef& window):ui::Manager(window) {}
  bool onProcessMessage(ui::Message* msg) override {

    if(msg->fromFilter() && (msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseLeaveMessage)) {
      if(desktop && desktop->editor) {
        std::optional<gfx::Point> position;
        // Manager::setMouse emits Leave as Message, not MouseMessage.
        // Only Enter/Move carry coordinates and a source display.
        if(msg->type()!=ui::kMouseLeaveMessage) {
          const auto source=msg->display();
          const auto target=desktop->editor->display();
          if(source && target && source->nativeWindow() && target->nativeWindow())
            position=static_cast<ui::MouseMessage*>(msg)->positionForDisplay(target);
        }
        desktop->editor->updatePaletteMouse(position);
      }
      return false;
    }
    if(msg->type()==ui::kSetCursorMessage && refreshCursor) {
      // Aseprite emits one SetCursor after the OS mouse-event batch. Apply its
      // latest geometry before the same dispatch paints, without a 16ms wait.
      if(desktop && desktop->editor)desktop->editor->flushPanelGeometry();
      refreshCursor();return true;
    }
    if(msg->type()==ui::kCloseDisplayMessage && desktop) {desktop->closeWindow(this);return true;}
    return ui::Manager::onProcessMessage(msg);
  }
};
void writeSmokeFrame(os::Surface* surface,const std::filesystem::path& path) {
  // Capture the physical framebuffer without an additional UI-scale expansion.
  const int w=surface->width(),h=surface->height();
  const unsigned stride=(w*3+3)&~3u, bytes=stride*h;
  std::ofstream out(path,std::ios::binary);
  auto u16=[&](unsigned v){out.put(char(v));out.put(char(v>>8));};
  auto u32=[&](unsigned v){u16(v);u16(v>>16);};
  out.write("BM",2);u32(54+bytes);u32(0);u32(54);u32(40);u32(w);u32(h);u16(1);u16(24);
  u32(0);u32(bytes);u32(0);u32(0);u32(0);u32(0);
  os::SurfaceLock lock(surface);
  for(int y=h-1;y>=0;--y) {
    for(int x=0;x<w;++x) {const auto c=surface->getPixel(x,y);out.put(char(gfx::getb(c)));out.put(char(gfx::getg(c)));out.put(char(gfx::getr(c)));}
    for(unsigned n=w*3;n<stride;++n) out.put(0);
  }
  if(!out) throw std::runtime_error("Cannot write smoke framebuffer");
}
}
int app_main(int argc,char* argv[]) {
  try {
    if(argc==3 && std::string(argv[1])=="--recovery-crash-verify") {
      const auto root=std::filesystem::u8path(argv[2]);if(!root.is_absolute() || !std::filesystem::exists(root/"test-owned.marker"))return 2;
      const auto records=project::listRecoveryRecords(root/"recovery");if(records.size()!=1 || records[0].id!="crash-fixture")return 3;
      std::ifstream file(root/"recovery/crash-fixture.moonsprite",std::ios::binary);auto bytes=std::make_shared<project::Bytes>(std::istreambuf_iterator<char>(file),std::istreambuf_iterator<char>());
      const auto parsed=project::prepareEditableImport(project::readProjectManifest(bytes));
      if(parsed.width!=3 || parsed.height!=2 || parsed.timeline.cels[0].surface->pixels[4]!=0xff123456)return 4;
      std::ofstream(root/"verified.marker")<<"restored";return 0;
    }
    if(argc==3 && std::string(argv[1])=="--recovery-crash-fixture") {
      const auto root=std::filesystem::u8path(argv[2]);
      if(!root.is_absolute() || !std::filesystem::exists(root/"test-owned.marker"))throw std::runtime_error("Recovery fixture requires an explicitly owned test directory");
      Document fixture(3,2);fixture.beginStroke({1,1},0xff123456);fixture.commitStroke();
      const auto encoded=project::encodeRecoveryProject(fixture);
      project::writeRecoveryFiles(root/"recovery",{"crash-fixture","异常退出样本","1"},*encoded.bytes);
      std::ofstream(root/"ready.marker")<<GetCurrentProcessId();
      Sleep(INFINITE);return 0;
    }
    const auto assets=std::filesystem::u8path(argv[0]).parent_path()/"assets";
    auto system=os::System::make(); system->setAppMode(os::AppMode::GUI);
    // Device-pixel framebuffer/input; skins and Fusion font alone paint at 2x.
    os::WindowSpec spec(1280,960,1); spec.resizable(true); spec.maximizable(true);
    auto window=system->makeWindow(spec);
    if(!SetWindowSubclass(static_cast<HWND>(window->nativeHandle()),resizeLimits,1,0))throw std::runtime_error("Cannot set native resize limits");
    window->setTitle("MoonSprite Native - Development");
    ui::UISystem uiSystem;
    PixelTheme theme((assets/"fusion-ascii.png").u8string()); ui::set_theme(&theme,uiScale);
    PixelFont font((assets/"fonts/fusion-pixel-10px-monospaced-zh_hans.bdf").u8string()); Skin skin=Skin::load(assets/"dark.skin");
    auto themePath=assets/"themes/moonsprite-dark/theme.xml";
    auto cursorPath=assets/"cursors";
    for(int i=1;i<argc;++i) if(std::string(argv[i])=="--theme") {
      if(i+1>=argc) throw std::runtime_error("--theme needs a theme.xml path");
      themePath=std::filesystem::u8path(argv[++i]);
    }
    for(int i=1;i<argc;++i) if(std::string(argv[i])=="--cursors") {
      if(i+1>=argc) throw std::runtime_error("--cursors needs a directory");
      cursorPath=std::filesystem::u8path(argv[++i]);
    }
    skin.assets=loadThemeAtlas(themePath).assets;
    // Manager must exist before the desktop's window is opened.
    Manager manager(window); Desktop desktop; manager.desktop=&desktop;
    LegacyCursors cursors(cursorPath,cursorPath==assets/"cursors"?&skin.assets:nullptr);
    if(argc>1 && std::string(argv[1])=="--cursor-apply-check") {
      for(const auto* id:{"default","none","none","selection-move","copy","none","ew-resize","ns-resize","nwse-resize","nesw-resize","selection-rotate-n","selection-rotate-ne","selection-rotate-se","selection-rotate-s","selection-rotate-sw","selection-rotate-nw","pencil-white","unavailable","default"}) {
        applyLegacyCursor(*window,cursors,id);
        const auto expected=std::string(id)=="none"?nullptr:static_cast<HCURSOR>(cursors.get(id)->nativeHandle());
        if(GetCursor()!=expected)throw std::runtime_error("Legacy cursor handle transition failed");
      }
      return 0;
    }
    manager.refreshCursor=[&] {
      const auto pos=window->pointFromScreen(ui::get_mouse_position());
      const auto editor=desktop.editor;
      const auto picked=manager.pick(pos);
      const char* id=editor && (editor->panelHasCapture() || (picked && (picked==editor || picked->hasAncestor(editor))))?editor->cursorAt(pos):"default";
      // setCursor is also needed after the OS resets it on entering the window.
      applyLegacyCursor(*window,cursors,id);
    };
    manager.addMessageFilter(ui::kSetCursorMessage,&manager);
    for(const auto type:{ui::kMouseMoveMessage,ui::kMouseEnterMessage,ui::kMouseLeaveMessage}) manager.addMessageFilter(type,&manager);
    std::filesystem::path recoveryRoot;for(int i=1;i+1<argc;++i)if(std::string(argv[i])=="--recovery-test-root"){const auto root=std::filesystem::u8path(argv[i+1]);if(!root.is_absolute() || !std::filesystem::exists(root/"test-owned.marker"))throw std::runtime_error("Recovery test root must be owned");recoveryRoot=root/"recovery";}
    auto editor=new Editor(font,skin,assets,manager.refreshCursor,recoveryRoot); desktop.editor=editor;
    if(argc>1 && std::string(argv[1])=="--selection-cursors-check") {try{editor->smokeSelectionCursors();}catch(const std::exception& e){std::ofstream("native-selection-cursors-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--ants-check") {try{editor->smokeAnts(std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("native-ants-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--layer-context-check") {editor->smokeLayerContext(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--layers-check") {editor->smokeLayers(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--animation-check") {try{editor->smokeAnimation();}catch(const std::exception& e){std::ofstream("native-animation-error.txt")<<e.what();delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 1;}delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 0;}
    if(argc>1 && std::string(argv[1])=="--skin-resize-check") {editor->smokeSkinResize(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}
    editor->closeRequested=[&]{desktop.approved=true;desktop.closeWindow(editor);};
    desktop.addChild(editor); desktop.setBounds(manager.bounds()); desktop.openWindow();
    system->finishLaunching();
    ui::set_use_native_cursors(true); manager.refreshCursor();
    const bool modalCheck=argc>1 && std::string(argv[1])=="--modal-layout-check";
    const bool workspaceCheck=modalCheck || (argc>1 && std::string(argv[1])=="--workspace-check");
    const bool paletteMouseCheck=argc>1 && std::string(argv[1])=="--palette-mouse-check";
    const bool selectionCheck=argc>1 && std::string(argv[1])=="--selection-check";
    const bool homeCheck=argc>1 && std::string(argv[1])=="--home-check";
    ui::Timer workspaceTimer(400,editor);int workspacePhase=0;
    std::vector<gfx::Color> previewFrame;
    auto framePixels=[&]{
      auto surface=window->surface();os::SurfaceLock lock(surface);
      std::vector<gfx::Color> pixels;pixels.reserve(surface->width()*surface->height());
      for(int y=0;y<surface->height();++y)for(int x=0;x<surface->width();++x)pixels.push_back(surface->getPixel(x,y));
      return pixels;
    };
    if(workspaceCheck || paletteMouseCheck || homeCheck || selectionCheck)workspaceTimer.Tick.connect([&]{try{
      if(workspacePhase++==0){
        if(selectionCheck){editor->smokeSelectionTools();editor->smokeSelectionDisplay();return;}
        if(homeCheck){editor->smokeHome();return;}
        // Match the underlying manager's real message types, including
        // display-less Leave and early Move before display assignment.
        editor->smokePaletteMouse([&](ui::Message* message){manager.onProcessMessage(message);});
        if(workspaceCheck){editor->smokeWorkspace();if(modalCheck)editor->smokeWorkspaceModalPreview();}return;
      }
      if(workspacePhase==2)writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/(selectionCheck?"selection-smoke.bmp":homeCheck?"home-smoke.bmp":paletteMouseCheck?"palette-mouse-smoke.bmp":"workspace-smoke.bmp"));
      if(workspaceCheck && !modalCheck && workspacePhase==2){editor->smokePreviewRepaintStep(0);editor->smokePreviewBatchFlush([&]{ui::Message cursor(ui::kSetCursorMessage);manager.onProcessMessage(&cursor);});return;}
      if(workspaceCheck && workspacePhase>=3 && workspacePhase<=14) {
        if(workspacePhase%2==1){editor->smokeFinishPreviewRepaintStep();previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"preview-incremental.bmp");editor->invalidate();return;}
        if(previewFrame!=framePixels()){writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"preview-full.bmp");throw std::runtime_error("Preview move/resize left pixels differing from full repaint at phase "+std::to_string(workspacePhase));}
        if(workspacePhase<14){editor->smokePreviewRepaintStep((workspacePhase-2)/2);editor->smokePreviewBatchFlush([&]{ui::Message cursor(ui::kSetCursorMessage);manager.onProcessMessage(&cursor);});}
        else editor->smokeWorkspaceModalPreview();
        return;
      }
      if(workspaceCheck)writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"workspace-modal-smoke.bmp");
      workspaceTimer.stop();desktop.approved=true;desktop.closeWindow(editor);
    }catch(const std::exception& e){std::ofstream("native-workspace-error.txt")<<e.what();std::exit(1);}});
    if(workspaceCheck || paletteMouseCheck || homeCheck || selectionCheck)workspaceTimer.start();
    const bool smoke=argc>1 && std::string(argv[1])=="--smoke";
    ui::Timer timer(400,editor);
    int phase=0;
    if(smoke) {timer.Tick.connect([&]{try{
      if(phase++==0) {timer.stop();editor->smokeInteraction();editor->smokeResize();editor->smokeStrokePerformance();if(const wchar_t* sample=_wgetenv(L"MOONSPRITE_IMPORT_SMOKE")){editor->smokeOpen(std::filesystem::path(sample));editor->smokeSave(std::filesystem::path(sample).parent_path());editor->smokeRecovery(std::filesystem::path(sample).parent_path());}editor->smokeMenu(0);timer.start();return;}
      if(phase==2) {
        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"menu-smoke.bmp");
        editor->smokeMenu(1);return;
      }
      if(phase<10)editor->smokeMenu(2);
      if(phase==3) {
        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"smoke.bmp");
        editor->smokePreviewPanel();return;
      }
      if(phase==4) {
        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"preview-smoke.bmp");
        editor->smokeRange(false);return;
      }
      if(phase==5) {
        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"range-normal-smoke.bmp");editor->smokeRange();return;
      }
      if(phase==6) {
        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"range-smoke.bmp");editor->smokeColorPicker();return;
      }
      if(phase==7) {
        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"color-picker-smoke.bmp");editor->smokePickerLightBackground();return;
      }
      if(phase==8) {
        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"color-roles-alpha-smoke.bmp");editor->smokeDialog();return;
      }
      if(phase==9){writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"dialog-smoke.bmp");editor->smokeDismissDialog();return;}
      if(phase>=10 && phase<=23){const int index=(phase-10)/2;if(phase%2==0)editor->smokeMenu(0,index);else{writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/("menu-full-"+std::to_string(index)+".bmp"));editor->smokeMenu(1,index);}return;}
      timer.stop();
      desktop.approved=true;desktop.closeWindow(editor);
    }catch(const std::exception& e){std::ofstream("native-smoke-error.txt")<<e.what();std::exit(1);}});timer.start();}
    manager.run();
    manager.removeMessageFilter(ui::kSetCursorMessage,&manager);
    for(const auto type:{ui::kMouseMoveMessage,ui::kMouseEnterMessage,ui::kMouseLeaveMessage}) manager.removeMessageFilter(type,&manager);
    return 0;
  } catch(const std::exception& e) {
    if(argc>1 && (std::string(argv[1])=="--selection-check" || std::string(argv[1])=="--smoke" || std::string(argv[1])=="--home-check" || std::string(argv[1])=="--palette-mouse-check" || std::string(argv[1])=="--workspace-check" || std::string(argv[1])=="--layer-context-check" || std::string(argv[1])=="--layers-check" || std::string(argv[1])=="--skin-resize-check" || std::string(argv[1])=="--animation-check")) {std::ofstream("native-smoke-error.txt")<<e.what();std::fprintf(stderr,"%s\n",e.what());return 1;}
    MessageBoxA(nullptr,e.what(),"MoonSprite native startup error",MB_OK|MB_ICONERROR); return 1;
  }
}



