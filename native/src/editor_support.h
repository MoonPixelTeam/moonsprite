#pragma once
#include "document.h"
#include "preview_panel_model.h"
#include "ui/tooltips.h"
#include "canvas_renderer.h"
#include "native_widgets.h"
#include "pixel_font.h"
#include "panel_docking.h"
#include "legacy_cursors.h"
#include "image_export.h"
#include "ui_scale.h"
#include "os/os.h"
#include "os/sampling.h"
#include "ui/system.h"
#include "ui/manager.h"
#include "ui/display.h"
#include "ui/window.h"
#include "ui/theme.h"
#include "ui/move_region.h"
#include "ui/paint.h"
#include "ui/graphics.h"
#include "ui/paint_event.h"
#include "ui/resize_event.h"
#include "text/font_mgr.h"
#include <windows.h>
#include <commctrl.h>
#include <array>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <regex>
#include <sstream>
#include <stdexcept>
namespace moon::editor {
using namespace moon;

// Opt-in bounded UI diagnostics; disabled runs do not read the clock or write.

struct InteractionProfile {

  struct Entry {const char* name=nullptr;std::uint64_t calls=0;double total=0,self=0,maximum=0;};

  std::array<Entry,16> entries{};

  std::filesystem::path path;

  bool referenceHitTesting=false;

  InteractionProfile(){if(const auto value=_wgetenv(L"MOONSPRITE_INTERACTION_PROFILE"))path=value;if(!path.empty())referenceHitTesting=_wgetenv(L"MOONSPRITE_HIT_TEST_REFERENCE")!=nullptr;}

  ~InteractionProfile(){if(path.empty())return;try{std::ofstream out(path);out<<"scope\tcalls\ttotal_ms\tself_ms\tmax_ms\n";for(const auto& e:entries)if(e.calls)out<<e.name<<'\t'<<e.calls<<'\t'<<e.total<<'\t'<<e.self<<'\t'<<e.maximum<<'\n';}catch(...){}}

  static InteractionProfile& get(){static InteractionProfile value;return value;}

};

struct InteractionScope {

  InteractionProfile::Entry* entry=nullptr;InteractionScope* parent=nullptr;

  std::chrono::steady_clock::time_point start;double children=0;

  static InteractionScope*& current(){static thread_local InteractionScope* value=nullptr;return value;}

  InteractionScope(int index,const char* name){auto& profile=InteractionProfile::get();if(profile.path.empty())return;entry=&profile.entries[index];entry->name=name;parent=current();current()=this;start=std::chrono::steady_clock::now();}

  ~InteractionScope(){if(!entry)return;const auto ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();++entry->calls;entry->total+=ms;entry->self+=ms-children;entry->maximum=std::max(entry->maximum,ms);current()=parent;if(parent)parent->children+=ms;}

};

inline void applyLegacyCursor(os::Window& window,const LegacyCursors& cursors,const char* id) {

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

inline LRESULT CALLBACK resizeLimits(HWND hwnd,UINT message,WPARAM wp,LPARAM lp,UINT_PTR,DWORD_PTR) {

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

  const Skin* skin=nullptr;

  int getScrollbarSize() override {return 7*uiScale;}

  gfx::Size getCaretSize(ui::Widget*) override {return {uiScale,10*uiScale};}

  text::FontRef getDefaultFont() const override { return font_; }

  void paintScrollBar(ui::Graphics* g,const ui::Widget* widget,const ui::Style*,const ui::Style*,const gfx::Rect& track,const gfx::Rect& thumb) override {

    if(!skin)return;const bool vertical=widget->align() & ui::VERTICAL;const std::string id=vertical?"scrollbar.vertical.":"scrollbar.horizontal.";

    {UiPaintScale scale(*g);skin->draw(*g,id+"track",uiLogical(track));}

    UiPaintScale scale(*g,thumb.origin());skin->draw(*g,id+(widget->hasMouse() || widget->isSelected()?"hover":"normal"),uiLogical(gfx::Rect(0,0,thumb.w,thumb.h)));

  }

  void getWindowMask(ui::Widget* widget,gfx::Region& region) override {

    // laf subtracts this region when repainting widgets below popup windows.

    // Our native windows are rectangular; an empty mask leaves menus uncovered.

    region=widget->bounds();

  }

};

inline int panelResizeEdges(gfx::Rect rect,gfx::Point point) {

  if(!rect.contains(point))return 0;

  const int edge=3*uiScale;

  return (point.x<rect.x+edge?1:0)|(point.x>=rect.x2()-edge?2:0)|

         (point.y<rect.y+edge?4:0)|(point.y>=rect.y2()-edge?8:0);

}

inline const char* panelResizeCursor(int edges) {

  if((edges&1 && edges&4) || (edges&2 && edges&8))return "nwse-resize";

  if((edges&1 && edges&8) || (edges&2 && edges&4))return "nesw-resize";

  return edges&3?"ew-resize":edges&12?"ns-resize":"default";

}

// floating-panel.tsx: anchored E/S/W/N arithmetic and minimum-size gates.

inline gfx::Rect resizedPanel(gfx::Rect start,gfx::Point delta,int edges,gfx::Rect viewport,gfx::Size minimum) {

  auto next=start;const int minWidth=std::min(minimum.w,viewport.w),minHeight=std::min(minimum.h,viewport.h);

  if(edges&2)next.w=std::max(minWidth,std::min(start.w+delta.x,viewport.x2()-start.x));

  if(edges&8)next.h=std::max(minHeight,std::min(start.h+delta.y,viewport.y2()-start.y));

  if(edges&1){next.w=std::max(minWidth,std::min(start.w-delta.x,start.x2()-viewport.x));next.x=start.x2()-next.w;}

  if(edges&4){next.h=std::max(minHeight,std::min(start.h-delta.y,start.y2()-viewport.y));next.y=start.y2()-next.h;}

  return next;

}

// Application-local floating panel, matching legacy's portal-hosted preview.

// Keep the existing fit-only native preview renderer; this is a layout change.

// The editor paints dialogs itself. Background child widgets must composite

// that same dialog over their overlap, including independent child repaints.

template<class Base> class DialogBackground final : public Base {

public:

  using Base::Base;

  std::function<void(ui::Widget&,ui::PaintEvent&,const std::function<void()>&)> composite;

  std::function<bool()> blocked;

  void onPaint(ui::PaintEvent& ev) override {

    if(composite)composite(*this,ev,[&]{Base::onPaint(ev);});else Base::onPaint(ev);

  }

  bool onProcessMessage(ui::Message* msg) override {

    if(blocked && blocked() && (msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseUpMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseWheelMessage || msg->type()==ui::kKeyDownMessage))return true;

    return Base::onProcessMessage(msg);

  }

};

class PreviewPanel : public ui::Widget {
 const Skin* icons_=nullptr;
 std::array<PixelButton*,4> previewActions_{};
 preview::View previewView_;preview::Playback previewPlayback_;
 std::uint64_t previewIdentity_=0;
 gfx::Rect previewBox_;gfx::Point previewPointerStart_;preview::Point previewPanStart_;
 bool previewPanning_=false,previewSampling_=false,previewSecondary_=false;
 ui::Timer previewTimer_{16,this};
 std::chrono::steady_clock::time_point previewDue_;
 std::function<preview::Point()> sourceCenter_;
 void syncPreview(){if(previewIdentity_!=document_.identity()){previewIdentity_=document_.identity();previewView_={};previewPlayback_={};previewPlayback_.mode=document_.animationLoop()?"all":"once";previewPlayback_.frame=document_.frame().id;previewPanning_=previewSampling_=false;}
 const auto& state=document_.timeline().state();if(!previewPlayback_.playing)previewPlayback_.frame=document_.frame().id;else if(std::none_of(state.frames.begin(),state.frames.end(),[this](const auto& f){return f.id==previewPlayback_.frame;}))previewPlayback_.frame=document_.frame().id;
 if(!timelineAvailable||state.frames.size()<2){previewPlayback_.stop();previewPlayback_.frame=document_.frame().id;}
 if(previewActions_[0]){previewActions_[0]->active=previewView_.follow;previewActions_[3]->icon=previewPlayback_.playing?"playback-pause":"playback-play";previewActions_[3]->active=previewPlayback_.playing;previewActions_[3]->setEnabled(timelineAvailable&&state.frames.size()>1);} }
 double previewScale(){return previewView_.scale(document_.width(),document_.height(),double(previewBox_.w)/uiScale,double(previewBox_.h)/uiScale,uiScale);}
 preview::Point effectivePreviewPan(){return previewView_.follow&&sourceCenter_?previewView_.followPan(document_.width(),document_.height(),previewScale(),sourceCenter_()):previewView_.pan;}
 gfx::Rect previewImage(){const auto z=previewScale();const auto o=previewView_.origin(document_.width(),document_.height(),z,effectivePreviewPan(),uiScale);return {previewBox_.x+int(std::round(o.x*uiScale)),previewBox_.y+int(std::round(o.y*uiScale)),std::max(1,int(std::round(document_.width()*z*uiScale))),std::max(1,int(std::round(document_.height()*z*uiScale)))};}
 void previewDelay(){const auto& frames=document_.timeline().state().frames;const auto at=std::find_if(frames.begin(),frames.end(),[this](const auto& f){return f.id==previewPlayback_.frame;});const double delay=(at==frames.end()?100:at->duration)/std::max(.01,previewPlayback_.rate);previewDue_=std::chrono::steady_clock::now()+std::chrono::duration_cast<std::chrono::steady_clock::duration>(std::chrono::duration<double,std::milli>(delay));}
 void previewTick(){if(!isVisible()){previewPlayback_.stop();return;}syncPreview();if(previewPlayback_.playing&&std::chrono::steady_clock::now()>=previewDue_){previewPlayback_.step(document_.timeline().state());previewDelay();previewActions_[3]->invalidate();invalidate();}if(previewView_.follow)invalidate();}
 void previewLayout(){if(!previewActions_[0])return;const auto r=uiLogical(bounds());gfx::Rect frame=r;frame.y+=frameTop;frame.h-=frameTop;PanelChromeLayout chrome(frame,managed&&!frameTop);if(floatingChrome){chrome.actions={frame.x+UiSpacing::related,FloatingColumnChrome::bodyTop(frame),frame.w-2*UiSpacing::related,UiSpacing::iconSize};chrome.content={chrome.actions.x,chrome.actions.y2()+UiSpacing::related,chrome.actions.w,std::max(0,frame.y2()-UiSpacing::related-chrome.actions.y2()-UiSpacing::related)};}for(int i=0;i<4;++i)previewActions_[i]->setBounds(uiPhysical({chrome.actions.x+i*(UiSpacing::iconSize+UiSpacing::related),chrome.actions.y,UiSpacing::iconSize,UiSpacing::iconSize}));previewBox_=uiPhysical(chrome.content);previewView_.capture(double(previewBox_.w)/uiScale,double(previewBox_.h)/uiScale);}
 void previewSample(gfx::Point p){if(!previewBox_.contains(p)||!sampled)return;const auto r=previewImage();const double z=previewScale()*uiScale;const int x=int(std::floor((p.x-r.x)/z)),y=int(std::floor((p.y-r.y)/z));if(x<0||y<0||x>=document_.width()||y>=document_.height())return;const auto overlay=!previewPlayback_.playing&&document_.floatingDeferred()?document_.floatingOverlayRegion(PixelRegion{x,y,1,1}):std::vector<timeline::Pixel>{};const auto* staged=!previewPlayback_.playing?(document_.floatingDeferred()?&overlay:document_.gradientPreviewPixels()):nullptr;const int width=document_.floatingDeferred()?1:document_.width();const auto pixels=compositeNormalRegion(document_.displayTimeline(),previewPlayback_.frame,{x,y,1,1},document_.layer().id,staged,width,document_.floatingDeferred()?x:0,document_.floatingDeferred()?y:0);if(!pixels.empty())sampled(pixels[0],previewSecondary_);}
 bool processPreview(ui::Message* msg){syncPreview();previewLayout();if(msg->type()==ui::kFocusLeaveMessage){previewPanning_=previewSampling_=false;if(hasCapture())releaseMouse();return false;}if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc&&(previewPanning_||previewSampling_)){previewPanning_=previewSampling_=false;if(hasCapture())releaseMouse();return true;}
 auto mouse=dynamic_cast<ui::MouseMessage*>(msg);if(!mouse)return false;if((previewPanning_||previewSampling_)&&!hasCapture()){previewPanning_=previewSampling_=false;return false;}
 if(previewPanning_||previewSampling_){if(msg->type()==ui::kMouseMoveMessage||msg->type()==ui::kMouseUpMessage){if(previewSampling_)previewSample(mouse->position());else{previewView_.pan={previewPanStart_.x+(mouse->position().x-previewPointerStart_.x)/double(uiScale)*dragSensitivity,previewPanStart_.y+(mouse->position().y-previewPointerStart_.y)/double(uiScale)*dragSensitivity};invalidate();}if(msg->type()==ui::kMouseUpMessage){previewPanning_=previewSampling_=false;releaseMouse();}return true;}}
 if(!previewBox_.contains(mouse->position()))return false;if(msg->type()==ui::kMouseWheelMessage){if(mouse->wheelDelta().y)zoomPreview(mouse->wheelDelta().y<0,mouse->position());return true;}
 if(msg->type()==ui::kMouseDownMessage){if((eyedropper||mouse->altPressed())&&(mouse->left()||mouse->right())){previewSampling_=true;previewSecondary_=mouse->right();captureMouse();previewSample(mouse->position());return true;}if(mouse->left()||mouse->middle()){if(previewView_.follow){previewView_.pan=effectivePreviewPan();previewView_.follow=false;}previewPanning_=true;previewPointerStart_=mouse->position();previewPanStart_=previewView_.pan;captureMouse();return true;}}return false;}
 void drawPreview(ui::Graphics& g){syncPreview();previewLayout();auto box=previewBox_;box.offset(-bounds().origin());box=uiLogical(box);g.fillRect(skin_["background"],box);skin_.draw(g,"panel_content",box);auto image=previewImage();image.offset(-bounds().origin());image=uiLogical(image);g.saveClip();g.clipRect(box);if(previewPlayback_.playing)renderer_.syncFrame(document_,previewPlayback_.frame);else renderer_.sync(document_);renderer_.draw(g,image,previewScale(),checkerboard.light,checkerboard.dark,checkerboard.size);g.restoreClip();}
 void previewMenu(){syncPreview();PixelMenu menu(skin_);auto item=[&](std::u32string title,std::function<void()> action,std::function<bool()> checked={}){auto b=new PixelMenuItem(font_,skin_,std::move(title));b->checked=std::move(checked);b->Click.connect(std::move(action));menu.addChild(b);};item(previewPlayback_.playing?U"暂停":U"播放",[this]{togglePreviewPlayback();});menu.addChild(new PixelMenuSeparator(skin_));const double rates[]{.25,.5,1,1.5,2,3};const char32_t* names[]{U"0.25×",U"0.5×",U"1×",U"1.5×",U"2×",U"3×"};for(int i=0;i<6;++i)item(names[i],[this,r=rates[i]]{previewPlayback_.rate=r;previewDelay();},[this,r=rates[i]]{return previewPlayback_.rate==r;});menu.addChild(new PixelMenuSeparator(skin_));for(const auto mode:{"once","all","tag"})item(std::string(mode)=="once"?U"播放一次":std::string(mode)=="all"?U"循环全部":U"循环当前段",[this,value=std::string(mode)]{previewPlayback_.setMode(document_.timeline().state(),value);previewDelay();invalidate();},[this,value=std::string(mode)]{return previewPlayback_.mode==value;});item(U"播放完成后返回起点",[this]{previewPlayback_.returnToStart=!previewPlayback_.returnToStart;},[this]{return previewPlayback_.returnToStart;});menu.showPopup(previewActions_[3]->bounds().origin(),display());}


  const PixelFont& font_;Skin& skin_;Document& document_;

  CanvasRenderer renderer_;

  // WorkspacePanels: override ?? (canvas view && app scope), reset on document id.

  std::optional<bool> relativeLuminanceOverride_;

  bool inheritedRelativeLuminance_=false;

  std::uint64_t luminanceDocumentIdentity_=0;

  void applyRelativeLuminance() {

    const bool next=relativeLuminanceOverride_.value_or(inheritedRelativeLuminance_);

    if(renderer_.relativeLuminance()!=next){renderer_.setRelativeLuminance(next);invalidate();}

  }

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

  CheckerboardSettings checkerboard;
  bool timelineAvailable=true,eyedropper=false;double dragSensitivity=1;
  std::function<void(timeline::Pixel,bool)> sampled;
  void configurePreviewSource(std::function<preview::Point()> source){sourceCenter_=std::move(source);}
  void togglePreviewFollow(){syncPreview();if(previewView_.follow)previewView_.pan=effectivePreviewPan();previewView_.follow=!previewView_.follow;invalidate();}
  void zoomPreviewTo(double next,std::optional<gfx::Point> pointer={});
  double previewZoom(){syncPreview();previewLayout();return previewScale();}
  void zoomPreview(bool in,std::optional<gfx::Point> pointer={}){syncPreview();previewLayout();zoomPreviewTo(referenceZoomStep(previewScale(),in),pointer);}
  void togglePreviewPlayback(){syncPreview();if(!timelineAvailable||document_.timeline().state().frames.size()<2)return;previewPlayback_.setPlaying(document_.timeline().state(),!previewPlayback_.playing);previewDelay();invalidate();}
  void smokePreviewBehavior(){syncPreview();previewLayout();const auto original=previewView_;const auto active=document_.frame().id;const auto history=document_.historySize();const auto initialScale=previewScale();zoomPreview(true);if(previewScale()==initialScale)throw std::runtime_error("Preview zoom no change");const auto savedScale=previewScale();const auto box=bounds();setBounds({box.x,box.y,box.w+40*uiScale,box.h+30*uiScale});previewLayout();if(previewScale()!=savedScale)throw std::runtime_error("Preview resize changed zoom");setBounds(box);togglePreviewFollow();if(!previewView_.follow)throw std::runtime_error("Preview follow toggle");togglePreviewFollow();if(document_.timeline().state().frames.size()>1){togglePreviewPlayback();previewPlayback_.step(document_.timeline().state());if(document_.frame().id!=active||document_.historySize()!=history)throw std::runtime_error("Preview playback mutated document");previewPlayback_.stop();}previewView_=original;invalidate();}


  void noteContentChange(){renderer_.noteChange(document_);}

  std::uint64_t uploadedPixels() const {return renderer_.uploadedPixels();}

  bool managed=false,floatingChrome=true;int frameTop=0;

  std::function<void()> closed;

  std::function<void()> context;

  std::function<void()> geometryChanged;

  std::function<void(ui::Graphics&)> paintTabs;

  PreviewPanel(const PixelFont& font,Skin& skin,const Skin& icons,Document& document)

    :ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),document_(document) {

    close_=new DialogBackground<PixelButton>(font,skin,U"",[this]{if(closed)closed();});

    close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";addChild(close_);close_->setVisible(false);

    geometryTimer_.Tick.connect([this]{flushGeometry();});
    icons_=&icons;auto tips=new ui::TooltipManager;addChild(tips);const char* names[]{"follow","minus","plus","playback-play"};const char32_t* labels[]{U"跟随画布视窗",U"缩小",U"放大",U"播放"};for(int i=0;i<4;++i){auto button=new PixelButton(font,skin,U"",[this,i]{if(i==0)togglePreviewFollow();else if(i==1)zoomPreview(false);else if(i==2)zoomPreview(true);else togglePreviewPlayback();});button->iconSkin=&icons;button->icon=names[i];button->skinStyle="icon_button";button->columnHeaderAction=true;addChild(button);tips->addTooltipFor(button,utf8Text(labels[i]));previewActions_[i]=button;}previewActions_[3]->context=[this]{previewMenu();};previewTimer_.Tick.connect([this]{previewTick();});previewTimer_.start();

    setVisible(false);

  }

  DialogBackground<PixelButton>* closeButton() const {return static_cast<DialogBackground<PixelButton>*>(close_);}

  ~PreviewPanel() override {geometryTimer_.stop();previewTimer_.stop();}

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

  bool relativeLuminance()const{return renderer_.relativeLuminance();}

  void syncRelativeLuminance(bool canvasView,bool inPreview=false) {

    if(luminanceDocumentIdentity_!=document_.identity()){

      luminanceDocumentIdentity_=document_.identity();relativeLuminanceOverride_.reset();

    }

    inheritedRelativeLuminance_=canvasView && inPreview;applyRelativeLuminance();

  }

  void toggleRelativeLuminance(){relativeLuminanceOverride_=!relativeLuminance();applyRelativeLuminance();}

  void closePanel(){close_->Click();}

  void finishPointer() {

    flushGeometry();previewPanning_=previewSampling_=false;

    if(!hasCapture())return;

    releaseMouse();dragging_=false;resizeEdges_=0;if(geometryChanged)geometryChanged();

  }

  const char* cursorAt(gfx::Point point) const {

    if(previewSampling_)return "eyedropper";if(previewPanning_)return "move";
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

    const auto previousViewport=viewport_;viewport_=viewport;auto next=bounds();

    if(next.isEmpty())next={viewport.x2()-250-16,viewport.y2()-260-16,250,260};

    auto old=previousViewport.isEmpty()?viewport:previousViewport;

    const auto adjusted=panels::resizeFloatingPosition({next.x,next.y,next.w,next.h},{old.x,old.y,old.w,old.h},{viewport.x,viewport.y,viewport.w,viewport.h});

    next={adjusted.x,adjusted.y,adjusted.w,adjusted.h};

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

      close_->setBounds(uiPhysical(FloatingColumnChrome::closeBounds(uiLogical(bounds()))));

      // Recompute the drawable region after the close button has moved.

      invalidate();

    }

    if(parent()) {

      gfx::Region exposed;exposed.createSubtraction(gfx::Region(previous),gfx::Region(bounds()));

      parent()->invalidateRegion(exposed);

    }

  }

  bool onProcessMessage(ui::Message* msg) override {
    if(processPreview(msg))return true;

    if(msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->right() && context) {context();return true;}

    if(managed)return ui::Widget::onProcessMessage(msg);

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

    auto& g=*ev.graphics();{UiPaintScale scale(g);const auto r=uiLogical(clientBounds());

    // The opaque widget owns the whole tab strip, including its empty tail.

    // Clear it too; paintTabs restores all visible sibling labels afterwards.

    auto frame=r;frame.y+=frameTop;frame.h-=frameTop;g.fillRect(skin_["panel"],r);if(floatingChrome)FloatingColumnChrome::paint(skin_,g,frame);else skin_.draw(g,"panel_outer",frame);

    if(!managed){const auto ink=font_.inkBounds(U"预览");font_.draw(g,U"预览",r.x+5-ink.x,r.y+(FloatingColumnChrome::headerHeight-ink.h)/2-ink.y,skin_["text"]);}

    drawPreview(g);

    }

    // This content widget can repaint independently while a stroke is held.

    // Restore the sibling chrome in the same clipped paint, rather than

    // relying on a later full editor refresh to repaint its labels.

    if(managed && paintTabs)paintTabs(g);

  }

};

// Opaque floating frame participates in laf sibling occlusion, including

// transparent children's background repaint. It moves with its contents.

class FloatingColumnSurface final : public ui::Widget {

public:

  std::function<void(ui::Graphics&)> paint;

  std::function<bool(ui::Message*)> pointer;

  FloatingColumnSurface():ui::Widget(ui::kGenericWidget){setTransparent(false);setVisible(false);}

  void onResize(ui::ResizeEvent& ev)override{const auto previous=bounds();setBoundsQuietly(ev.bounds());invalidate();if(parent())parent()->invalidateRect(previous);}

  bool onProcessMessage(ui::Message* msg)override{

    if(pointer && pointer(msg))return true;

    if(msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseUpMessage || msg->type()==ui::kMouseWheelMessage)return true;

    return ui::Widget::onProcessMessage(msg);

  }

  void onPaint(ui::PaintEvent& ev)override{if(paint)paint(*ev.graphics());}

};

// Drag-only overlay stays above column contents while Editor owns capture.

class DockFeedback final : public ui::Widget {

public:

  std::function<void(ui::Graphics&)> paint;

  DockFeedback():ui::Widget(ui::kGenericWidget){setTransparent(true);setVisible(false);}

  void onPaint(ui::PaintEvent& ev)override{if(paint)paint(*ev.graphics());}

};

// GradientStopsEditor pointer capture/ordered identity, ported to laf.

class GradientStopsTrack : public ui::Widget {

 const Skin& icons_;bool dragging_=false,moved_=false,remove_=false;gfx::Point press_;double original_=0;

public:

 std::vector<GradientStop>* stops=nullptr;int* selected=nullptr;std::function<void()> changed,activateColor;

 explicit GradientStopsTrack(const Skin& icons):ui::Widget(ui::kGenericWidget),icons_(icons){setTransparent(true);}

 void onPaint(ui::PaintEvent& ev)override{if(!stops || stops->size()<2)return;auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());GradientSpec s;s.stops=*stops;GradientSampler sampler(s);for(int x=0;x<r.w;++x){const auto c=sampler.forAmount(double(x)/std::max(1,r.w-1),0,0);g.fillRect(gfx::rgba(c&255,(c>>8)&255,(c>>16)&255,255),gfx::Rect(x,0,1,3));}for(int i=0;i<int(stops->size());++i){const auto& stop=(*stops)[i];const int x=gradientRound(stop.position*(r.w-11));if(i==*selected)g.drawRect(gfx::rgba(41,121,255,255),gfx::Rect(x-1,2,13,17));if(remove_ && i==*selected)continue;g.fillRect(gfx::rgba(stop.color&255,(stop.color>>8)&255,(stop.color>>16)&255,(stop.color>>24)&255),gfx::Rect(x+1,9,9,9));icons_.draw(g,"gradient-stop",gfx::Rect(x,3,11,16),true);}}

 bool onProcessMessage(ui::Message* msg)override{if(!stops || !selected || !isEnabled())return ui::Widget::onProcessMessage(msg);if(dragging_ && !hasCapture()){dragging_=moved_=remove_=false;}if(msg->type()!=ui::kMouseDownMessage && msg->type()!=ui::kDoubleClickMessage && msg->type()!=ui::kMouseMoveMessage && msg->type()!=ui::kMouseUpMessage)return ui::Widget::onProcessMessage(msg);const auto mouse=static_cast<ui::MouseMessage*>(msg);if(msg->type()==ui::kDoubleClickMessage){if(!mouse->left())return true;int hit=-1;for(int i=0;i<int(stops->size());++i){const int x=bounds().x+gradientRound((*stops)[i].position*(bounds().w/uiScale-11))*uiScale;if(gfx::Rect(x,bounds().y+3*uiScale,11*uiScale,16*uiScale).contains(mouse->position()))hit=i;}if(hit>=0){dragging_=moved_=remove_=false;if(hasCapture())releaseMouse();*selected=hit;if(changed)changed();if(activateColor)activateColor();}return true;}auto position=[&]{return std::clamp(double(mouse->position().x-bounds().x-5*uiScale)/std::max(1,bounds().w-11*uiScale),0.0,1.0);};

  if(msg->type()==ui::kMouseDownMessage && mouse->left()){int hit=-1;double distance=12*uiScale;for(int i=0;i<int(stops->size());++i){const double d=std::abs(mouse->position().x-(bounds().x+((*stops)[i].position*(bounds().w-11*uiScale)+5*uiScale)));if(d<distance){distance=d;hit=i;}}if(hit<0){const double p=std::clamp(position(),.001,.999);auto right=std::find_if(stops->begin(),stops->end(),[&](auto s){return s.position>=p;});if(right!=stops->end() && right!=stops->begin() && right->position-(right-1)->position>=.002){GradientSpec s;s.stops=*stops;GradientStop stop{p,GradientSampler(s).forAmount(p,0,0)};stops->insert(right,stop);*selected=int(std::find_if(stops->begin(),stops->end(),[&](auto v){return v.position==p;})-stops->begin());if(changed)changed();}return true;}*selected=hit;original_=(*stops)[hit].position;press_=mouse->position();dragging_=true;moved_=remove_=false;captureMouse();if(changed)changed();return true;}

  if(dragging_){if(msg->type()==ui::kMouseMoveMessage){if(mouse->button()==ui::kButtonNone){dragging_=moved_=remove_=false;if(hasCapture())releaseMouse();invalidate();return true;}if(!moved_ && std::hypot(double(mouse->position().x-press_.x),double(mouse->position().y-press_.y))<5)return true;moved_=true;remove_=stops->size()>2 && mouse->position().y>bounds().y2()+24*uiScale;if(!remove_){const double p=position();auto updated=(*stops)[*selected];if((p==0 || p==1) && updated.position!=p)for(int i=0;i<int(stops->size());++i)if(i!=*selected && (*stops)[i].position==p)(*stops)[i].position=original_;updated.position=p;(*stops)[*selected]=updated;std::stable_sort(stops->begin(),stops->end(),[](auto a,auto b){return a.position<b.position;});*selected=int(std::find_if(stops->begin(),stops->end(),[&](auto v){return v.position==updated.position && v.color==updated.color;})-stops->begin());}if(changed)changed();invalidate();}else if(msg->type()==ui::kMouseUpMessage){if(remove_ && stops->size()>2){stops->erase(stops->begin()+*selected);*selected=std::max(0,*selected-1);if(changed)changed();}dragging_=moved_=remove_=false;releaseMouse();invalidate();}return true;}return ui::Widget::onProcessMessage(msg);

 }

};

// CurveEditor pointer/data semantics from legacy AdjustmentDialog.tsx.

class CurveEditorNative final:public ui::Widget{

 const Skin& skin_;int active_=-1;

public:

 std::vector<CurvePoint>* points=nullptr;const std::array<unsigned,256>* histogram=nullptr;int selected=-1,channel=0;std::function<void()> changed;

 explicit CurveEditorNative(const Skin& skin):ui::Widget(ui::kGenericWidget),skin_(skin){setVisible(false);setFocusStop(true);}

 CurvePoint eventPoint(gfx::Point p)const{return {double(adjustmentByte(std::clamp(((p.x-bounds().x)/double(std::max(1,bounds().w))*124-12)/100,0.0,1.0)*255)),double(adjustmentByte(std::clamp(1-((p.y-bounds().y)/double(std::max(1,bounds().h))*124-10)/100,0.0,1.0)*255))};}

 gfx::Point pointPosition(CurvePoint p)const{return {bounds().x+int((12+p.x/255*100)/124*bounds().w),bounds().y+int((10+(255-p.y)/255*100)/124*bounds().h)};}

 void notify(){if(changed)changed();invalidate();}

 void resetChannel(){if(!points)return;*points={{0,0},{255,255}};selected=active_=-1;notify();}

 void deleteSelected(){if(!points || selected<=0 || selected>=int(points->size())-1)return;points->erase(points->begin()+selected);selected=active_=-1;notify();}

 void selectChannel(){active_=selected=-1;if(hasCapture())releaseMouse();invalidate();}

 void setCoordinate(int axis,double value){if(!points || points->empty())return;int index=selected>=0&&selected<int(points->size())?selected:0;auto& p=(*points)[index];if(axis==0){if(index==0 || index==int(points->size())-1)return;p.x=std::max((*points)[index-1].x+1,std::min((*points)[index+1].x-1,double(adjustmentByte(value))));}else p.y=adjustmentByte(value);selected=index;notify();}

 bool onProcessMessage(ui::Message* msg)override{if(!points)return ui::Widget::onProcessMessage(msg);if(msg->type()==ui::kKeyDownMessage){auto k=static_cast<ui::KeyMessage*>(msg);if(k->scancode()==ui::kKeyDel || k->scancode()==ui::kKeyBackspace){deleteSelected();return true;}}if(msg->type()!=ui::kMouseDownMessage && msg->type()!=ui::kDoubleClickMessage && msg->type()!=ui::kMouseMoveMessage && msg->type()!=ui::kMouseUpMessage)return ui::Widget::onProcessMessage(msg);auto m=static_cast<ui::MouseMessage*>(msg);if(msg->type()==ui::kMouseDownMessage || msg->type()==ui::kDoubleClickMessage){int hit=-1;for(int i=0;i<int(points->size());++i){auto at=pointPosition((*points)[i]);if(std::hypot(double(at.x-m->position().x),double(at.y-m->position().y))<=12*uiScale){hit=i;break;}}if(m->right() || msg->type()==ui::kDoubleClickMessage){if(hit>0&&hit<int(points->size())-1){selected=hit;deleteSelected();}return true;}if(!m->left())return false;requestFocus();captureMouse();if(hit<0){auto p=eventPoint(m->position());points->push_back(p);std::stable_sort(points->begin(),points->end(),[](auto a,auto b){return a.x<b.x;});hit=int(std::find_if(points->begin(),points->end(),[&](auto q){return q.x==p.x&&q.y==p.y;})-points->begin());}active_=selected=hit;notify();return true;}if(msg->type()==ui::kMouseMoveMessage && hasCapture() && active_>=0 && active_<int(points->size())){auto p=eventPoint(m->position());p.x=active_==0?0:active_==int(points->size())-1?255:std::max((*points)[active_-1].x+1,std::min((*points)[active_+1].x-1,p.x));(*points)[active_]=p;notify();return true;}if(msg->type()==ui::kMouseUpMessage){active_=-1;if(hasCapture())releaseMouse();return true;}return ui::Widget::onProcessMessage(msg);}

 void onPaint(ui::PaintEvent& ev)override{if(!points)return;auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());g.fillRect(skin_["background"],r);auto pos=[&](double x,double y){return gfx::Point(int((12+x/255*100)/124*r.w),int((10+(255-y)/255*100)/124*r.h));};const auto lo=pos(0,0),hi=pos(255,255);for(int value=0;value<=4;++value){auto p=pos(value*255.0/4,value*255.0/4);g.drawLine(skin_["panel"],{p.x,hi.y},{p.x,lo.y});g.drawLine(skin_["panel"],{lo.x,p.y},{hi.x,p.y});}const auto ink=channel==1?gfx::rgba(224,100,100):channel==2?gfx::rgba(100,200,130):channel==3?gfx::rgba(110,150,235):skin_["text"];if(histogram){unsigned maximum=1;for(auto n:*histogram)maximum=std::max(maximum,n);for(int x=0;x<256;++x)if((*histogram)[x]){auto p=pos(x,0);int height=std::max(1,int(double((*histogram)[x])/maximum*(lo.y-hi.y-4)));g.fillRect(skin_["panel"],{p.x,lo.y-height,1,height});}}auto lut=buildCurveLut(*points);for(int x=1;x<256;++x)g.drawLine(ink,pos(x-1,lut[x-1]),pos(x,lut[x]));for(int i=0;i<int(points->size());++i){auto p=pos((*points)[i].x,(*points)[i].y);g.fillRect(skin_["background"],{p.x-2,p.y-2,5,5});g.drawRect(i==selected?skin_["text"]:ink,{p.x-2,p.y-2,5,5});}}

};

class SpriteSheetPreview final : public ui::Widget {

  const Skin& skin_;os::SurfaceRef image_;int imageWidth_=0,imageHeight_=0;

public:

  explicit SpriteSheetPreview(const Skin& skin):ui::Widget(ui::kGenericWidget),skin_(skin){setTransparent(false);setVisible(false);}

  void setImage(StaticImageExport image){auto surface=os::instance()->makeRgbaSurface(image.width,image.height);if(!surface)throw std::runtime_error("Cannot allocate sheet preview");uploadRgbaRegion(*surface,image.pixels.data(),image.width,image.height,image.width);imageWidth_=image.width;imageHeight_=image.height;image_=std::move(surface);invalidate();}

  void clearImage(){image_.reset();imageWidth_=imageHeight_=0;invalidate();}

  void onPaint(ui::PaintEvent& ev) override {auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());g.fillRect(skin_["background"],r);skin_.draw(g,"panel_content",r);if(!image_)return;int fit=std::max(1,std::min((r.w-6)/imageWidth_,(r.h-6)/imageHeight_));gfx::Rect d(r.x+(r.w-imageWidth_*fit)/2,r.y+(r.h-imageHeight_*fit)/2,imageWidth_*fit,imageHeight_*fit);g.saveClip();g.clipRect(r);ui::Paint over;over.blendMode(os::BlendMode::SrcOver);g.drawSurface(image_.get(),{0,0,imageWidth_,imageHeight_},d,os::Sampling(),&over);g.restoreClip();}

};

// Native host for legacy tool-property popovers/dialog contents.

class ToolPropertyPopup final : public PixelDialog {

  const Skin& skin_;const PixelFont& font_;std::u32string title_;

  std::vector<std::pair<ui::Widget*,gfx::Rect>> controls_;

public:

  ToolPropertyPopup(const Skin& skin,const PixelFont& font,std::u32string title)

    :PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),skin_(skin),font_(font),title_(std::move(title)){setAutoRemap(false);setWantFocus(false);}

  void place(ui::Widget* widget,gfx::Rect rect){addChild(widget);controls_.push_back({widget,rect});widget->setBounds(uiPhysical(rect).offset(bounds().origin()));}

  void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());for(auto& item:controls_)item.first->setBounds(uiPhysical(item.second).offset(bounds().origin()));}

  gfx::Size minimumDialogSize(int)const override{int w=font_.measure(title_)+12,h=title_.empty()?12:DialogLayout::bodyTop+6;for(const auto& item:controls_){w=std::max(w,item.second.x2()+6);h=std::max(h,item.second.y2()+6);}return {w*uiScale,h*uiScale};}
  void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());if(!title_.empty())drawDialogTitle(font_,g,r,title_);}

};

// Loop-dialog-only NumberInput adaptation; reuses PixelEntry expression parser.

class LoopNumberEntry final:public PixelEntry {

public:

  double minimum=1,maximum=9999,value=1;

  std::function<void()> committed;

  using PixelEntry::PixelEntry;

  void setValue(double next){value=next;std::ostringstream out;out.precision(12);out<<next;setText(out.str());}

  void updateLiveValue(){

    if(!isEnabled() || isReadOnly())return;

    const auto source=text();if(source.empty() || source.find_first_of("+-*/()",1)!=std::string::npos)return;

    static const std::regex plain(R"(^\s*[+\-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+\-]?[0-9]+)?\s*$)");

    if(!std::regex_match(source,plain))return;

    try{const double next=std::stod(source);if(std::isfinite(next)){value=std::clamp(next,minimum,maximum);if(committed)committed();}}catch(...){}

  }

  bool commitValue(){

    const auto source=text();static const std::regex token(R"((\s+|[+*/()\-]|(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+\-]?[0-9]+)?))");

    std::size_t offset=0;std::smatch match;while(offset<source.size()){const auto tail=source.substr(offset);if(!std::regex_search(tail,match,token,std::regex_constants::match_continuous)){setValue(value);return false;}offset+=match.length();}

    if(source.empty() || !commitExpression()){setValue(value);return false;}try{setValue(std::clamp(std::stod(text()),minimum,maximum));}catch(...){setValue(value);return false;}if(committed)committed();return true;

  }

  bool onProcessMessage(ui::Message* msg)override{

    if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEnter){const auto source=text();const bool expression=source.size()>1 && source.find_first_of("+-*/()",1)!=std::string::npos;commitValue();if(!expression && accept)accept();return true;}

    if(isEnabled() && msg->type()==ui::kFocusLeaveMessage)commitValue();return PixelEntry::onProcessMessage(msg);

  }

};

// Only frame-duration mode changes Enter/blur/wheel; shared text uses PixelEntry unchanged.

class FrameDurationPaletteEntry final:public PixelEntry {

public:

  using PixelEntry::PixelEntry;

  bool durationMode=false;

  std::function<void()> durationCommit;

  std::function<void(int)> durationWheel;

  bool onProcessMessage(ui::Message* msg)override{

    if(!durationMode)return PixelEntry::onProcessMessage(msg);

    if(msg->type()==ui::kKeyDownMessage){const auto code=static_cast<ui::KeyMessage*>(msg)->scancode();

      if(code==ui::kKeyEnter){const auto draft=text();const bool expression=draft.size()>1&&draft.find_first_of("+-*/()",1)!=std::string::npos;if(durationCommit)durationCommit();if(!expression){durationMode=false;if(accept)accept();}return true;}

      if(code==ui::kKeyEsc){durationMode=false;if(cancel)cancel();return true;}

      if(code==ui::kKeyUp||code==ui::kKeyDown)return ui::Entry::onProcessMessage(msg);

    }

    if(msg->type()==ui::kFocusLeaveMessage){if(durationCommit)durationCommit();invalidate();return ui::Entry::onProcessMessage(msg);}

    if(msg->type()==ui::kMouseWheelMessage&&isEnabled()&&!isReadOnly()){auto mouse=static_cast<ui::MouseMessage*>(msg);if(!mouse->ctrlPressed()&&!mouse->cmdPressed()&&mouse->wheelDelta().y){if(durationWheel)durationWheel(mouse->wheelDelta().y<0?1:-1);return true;}}

    return PixelEntry::onProcessMessage(msg);

  }

};

class LayerLabelSeparator final : public ui::Widget {

public:

  std::function<bool(ui::Message*)> process;

  LayerLabelSeparator():ui::Widget(ui::kGenericWidget){setFocusStop(true);setTransparent(true);}

  bool onProcessMessage(ui::Message* msg) override {return (process && process(msg)) || ui::Widget::onProcessMessage(msg);}

};
}
