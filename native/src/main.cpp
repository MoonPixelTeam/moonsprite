#include <cwctype>
#include "os/dnd.h"
#include <set>
#include <regex>
#include "document.h"
#include "panel_docking.h"
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
#include "gradient_map_presets.h"

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
  const Skin* skin=nullptr;
  int getScrollbarSize() override {return 7*uiScale;}
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
  bool managed=false;int frameTop=0;
  std::function<void()> closed;
  std::function<void()> context;
  std::function<void()> geometryChanged;
  std::function<void(ui::Graphics&)> paintTabs;
  PreviewPanel(const PixelFont& font,Skin& skin,const Skin& icons,Document& document)
    :ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),document_(document) {
    close_=new DialogBackground<PixelButton>(font,skin,U"",[this]{if(closed)closed();});
    close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";addChild(close_);
    geometryTimer_.Tick.connect([this]{flushGeometry();});
    setVisible(false);
  }
  DialogBackground<PixelButton>* closeButton() const {return static_cast<DialogBackground<PixelButton>*>(close_);}
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
    auto frame=r;frame.y+=frameTop;frame.h-=frameTop;g.fillRect(skin_["panel"],r);skin_.draw(g,"panel_outer",frame);
    if(!managed){const auto ink=font_.inkBounds(U"预览");font_.draw(g,U"预览",r.x+5-ink.x,r.y+5-ink.y,skin_["text"]);}
    const int contentTop=managed?(frameTop?frameTop+5:16):19;
    const gfx::Rect content(r.x+5,r.y+contentTop,r.w-10,r.h-contentTop-5);
    g.fillRect(skin_["background"],content);skin_.draw(g,"panel_content",content);
    const int fit=std::max(1,std::min((content.w-6)/document_.width(),(content.h-6)/document_.height()));
    const gfx::Rect image(content.x+(content.w-document_.width()*fit)/2,content.y+(content.h-document_.height()*fit)/2,
                          document_.width()*fit,document_.height()*fit);
    g.saveClip();g.clipRect(content);renderer_.sync(document_);
    renderer_.draw(g,image,fit,skin_["checkerA"],skin_["checkerB"]);g.restoreClip();
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
 std::vector<GradientStop>* stops=nullptr;int* selected=nullptr;std::function<void()> changed;
 explicit GradientStopsTrack(const Skin& icons):ui::Widget(ui::kGenericWidget),icons_(icons){setTransparent(true);}
 void onPaint(ui::PaintEvent& ev)override{if(!stops || stops->size()<2)return;auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());GradientSpec s;s.stops=*stops;GradientSampler sampler(s);for(int x=0;x<r.w;++x){const auto c=sampler.forAmount(double(x)/std::max(1,r.w-1),0,0);g.fillRect(gfx::rgba(c&255,(c>>8)&255,(c>>16)&255,255),gfx::Rect(x,0,1,3));}for(int i=0;i<int(stops->size());++i){const auto& stop=(*stops)[i];const int x=gradientRound(stop.position*(r.w-11));if(i==*selected)g.drawRect(gfx::rgba(41,121,255,255),gfx::Rect(x-1,2,13,17));if(remove_ && i==*selected)continue;g.fillRect(gfx::rgba(stop.color&255,(stop.color>>8)&255,(stop.color>>16)&255,(stop.color>>24)&255),gfx::Rect(x+1,9,9,9));icons_.draw(g,"gradient-stop",gfx::Rect(x,3,11,16),true);}}
 bool onProcessMessage(ui::Message* msg)override{if(!stops || !selected || !isEnabled())return ui::Widget::onProcessMessage(msg);if(dragging_ && !hasCapture()){dragging_=moved_=remove_=false;}if(msg->type()!=ui::kMouseDownMessage && msg->type()!=ui::kMouseMoveMessage && msg->type()!=ui::kMouseUpMessage)return ui::Widget::onProcessMessage(msg);const auto mouse=static_cast<ui::MouseMessage*>(msg);auto position=[&]{return std::clamp(double(mouse->position().x-bounds().x-5*uiScale)/std::max(1,bounds().w-11*uiScale),0.0,1.0);};
  if(msg->type()==ui::kMouseDownMessage && mouse->left()){int hit=-1;double distance=12*uiScale;for(int i=0;i<int(stops->size());++i){const double d=std::abs(mouse->position().x-(bounds().x+((*stops)[i].position*(bounds().w-11*uiScale)+5*uiScale)));if(d<distance){distance=d;hit=i;}}if(hit<0){const double p=std::clamp(position(),.001,.999);auto right=std::find_if(stops->begin(),stops->end(),[&](auto s){return s.position>=p;});if(right!=stops->end() && right!=stops->begin() && right->position-(right-1)->position>=.002){GradientSpec s;s.stops=*stops;GradientStop stop{p,GradientSampler(s).forAmount(p,0,0)};stops->insert(right,stop);*selected=int(std::find_if(stops->begin(),stops->end(),[&](auto v){return v.position==p;})-stops->begin());if(changed)changed();}return true;}*selected=hit;original_=(*stops)[hit].position;press_=mouse->position();dragging_=true;moved_=remove_=false;captureMouse();if(changed)changed();return true;}
  if(dragging_){if(msg->type()==ui::kMouseMoveMessage){if(!moved_ && std::hypot(double(mouse->position().x-press_.x),double(mouse->position().y-press_.y))<5)return true;moved_=true;remove_=stops->size()>2 && mouse->position().y>bounds().y2()+24*uiScale;if(!remove_){const double p=position();auto updated=(*stops)[*selected];if((p==0 || p==1) && updated.position!=p)for(int i=0;i<int(stops->size());++i)if(i!=*selected && (*stops)[i].position==p)(*stops)[i].position=original_;updated.position=p;(*stops)[*selected]=updated;std::stable_sort(stops->begin(),stops->end(),[](auto a,auto b){return a.position<b.position;});*selected=int(std::find_if(stops->begin(),stops->end(),[&](auto v){return v.position==updated.position && v.color==updated.color;})-stops->begin());}if(changed)changed();invalidate();}else if(msg->type()==ui::kMouseUpMessage){if(remove_ && stops->size()>2){stops->erase(stops->begin()+*selected);*selected=std::max(0,*selected-1);if(changed)changed();}dragging_=moved_=remove_=false;releaseMouse();invalidate();}return true;}return ui::Widget::onProcessMessage(msg);
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
class SpriteSheetPreview final : public ui::Widget { const Skin& skin_; std::vector<Pixel> pixels_; int imageWidth_=0,imageHeight_=0; public: explicit SpriteSheetPreview(const Skin& skin):ui::Widget(ui::kGenericWidget),skin_(skin){setTransparent(false);setVisible(false);} void setImage(StaticImageExport image){imageWidth_=image.width;imageHeight_=image.height;pixels_=std::move(image.pixels);invalidate();} void clearImage(){pixels_.clear();imageWidth_=imageHeight_=0;invalidate();} void onPaint(ui::PaintEvent& ev) override {auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());g.fillRect(skin_["background"],r);skin_.draw(g,"panel_content",r);if(pixels_.empty())return;int fit=std::max(1,std::min((r.w-6)/imageWidth_,(r.h-6)/imageHeight_));gfx::Rect d(r.x+(r.w-imageWidth_*fit)/2,r.y+(r.h-imageHeight_*fit)/2,imageWidth_*fit,imageHeight_*fit);g.saveClip();g.clipRect(r);for(int y=0;y<imageHeight_;++y)for(int x=0;x<imageWidth_;++x){auto p=pixels_[std::size_t(y)*imageWidth_+x];if(!(p>>24))continue;g.fillRect(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24),gfx::Rect(d.x+x*fit,d.y+y*fit,fit,fit));}g.restoreClip();} };
// Native host for legacy tool-property popovers/dialog contents.
class ToolPropertyPopup final : public ui::PopupWindow {
  const Skin& skin_;const PixelFont& font_;std::u32string title_;
  std::vector<std::pair<ui::Widget*,gfx::Rect>> controls_;
public:
  ToolPropertyPopup(const Skin& skin,const PixelFont& font,std::u32string title)
    :ui::PopupWindow("",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),skin_(skin),font_(font),title_(std::move(title)){setAutoRemap(false);setWantFocus(false);}
  void place(ui::Widget* widget,gfx::Rect rect){addChild(widget);controls_.push_back({widget,rect});widget->setBounds(uiPhysical(rect).offset(bounds().origin()));}
  void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());for(auto& item:controls_)item.first->setBounds(uiPhysical(item.second).offset(bounds().origin()));}
  void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());g.fillRect(skin_["panel"],r);skin_.draw(g,"panel_outer",r);if(!title_.empty())font_.draw(g,title_,5,5,skin_["text"]);}
};
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
  PixelButton *paletteActions_=nullptr,*paletteLibrary_=nullptr;
  PixelButton *paletteLock_=nullptr,*primaryRole_=nullptr,*secondaryRole_=nullptr;
  PixelEntry* paletteInput_=nullptr;
  int replaceSampling_=-1;
  std::array<bool,9> replaceReturnTools_{};
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
  AntiAliasOptions aaSpec_;bool aaAuto_=true,aaLive_=true,aaScheduled_=false,aaCommit_=false;Pixel aaCustom_=0;std::chrono::steady_clock::time_point aaDue_;std::shared_ptr<std::atomic<bool>> aaCancel_;std::uint64_t aaGeneration_=0;
  struct AntiAliasResult {Document::ConvolutionTask captured;std::optional<std::vector<std::vector<Pixel>>> pixels;std::uint64_t generation;std::string error;};std::future<AntiAliasResult> aaWorker_;
  PixelButton *aaAutoButton_=nullptr,*aaInterior_=nullptr,*aaLiveButton_=nullptr;PixelDropdown* aaSource_=nullptr;PixelEntry *aaOpacity_=nullptr,*aaColorEntry_=nullptr;PixelSlider* aaOpacitySlider_=nullptr;NativeColorPicker* aaPicker_=nullptr;
  ConvolutionOptions convolutionSpec_;std::vector<PixelButton*> convolutionPresets_;std::array<PixelButton*,4> convolutionChannels_{};PixelButton *convolutionTiled_=nullptr,*convolutionLive_=nullptr,*convolutionApply_=nullptr;PixelScrollBar* convolutionScroll_=nullptr;int convolutionScrollPixels_=0;
  struct ConvolutionResult {Document::ConvolutionTask task;std::vector<std::vector<Pixel>> pixels;std::uint64_t generation,optionsRevision;bool cancelled=false;std::string error;};
  std::future<ConvolutionResult> convolutionWorker_;std::shared_ptr<std::atomic<bool>> convolutionCancel_;std::uint64_t convolutionGeneration_=0,convolutionRevision_=0;std::optional<std::uint64_t> convolutionApplied_;bool convolutionLiveEnabled_=true,convolutionScheduled_=false;int convolutionCommit_=0;std::chrono::steady_clock::time_point convolutionDue_;
  std::vector<SavedGradientMapPreset> gmSaved_;std::vector<int> gmHidden_,gmKeys_;bool gmReadable_=true;std::u32string gmError_;int gmStop_=0;GradientStopsTrack* gmTrack_=nullptr;NativeColorPicker* gmPicker_=nullptr;PixelDropdown *gmPreset_=nullptr,*gmDither_=nullptr;PixelEntry *gmPosition_=nullptr,*gmColor_=nullptr,*gmName_=nullptr;PixelButton *gmMode_=nullptr,*gmReverse_=nullptr,*gmPalette_=nullptr,*gmSave_=nullptr,*gmDelete_=nullptr,*gmAdd_=nullptr,*gmRemove_=nullptr,*gmRestore_=nullptr,*gmFlipStops_=nullptr;
  struct GradientMapResult {Document::ConvolutionTask task;std::vector<std::vector<Pixel>> results;std::uint64_t generation;bool cancelled=false;std::string error;};std::future<GradientMapResult> gmWorker_;std::shared_ptr<std::atomic<bool>> gmCancel_;std::uint64_t gmGeneration_=0;bool gmScheduled_=false,gmCommit_=false;
  ColorAdjustment adjustmentSpec_;
  std::array<PixelEntry*,3> adjustmentInputs_{};CurveEditorNative* curveEditor_=nullptr;PixelButton *curveChannelButton_=nullptr,*curveResetButton_=nullptr,*curveDeleteButton_=nullptr;int curveChannel_=0;std::array<std::array<unsigned,256>,4> curveHistogram_{};
  PixelButton *adjustmentPreview_=nullptr,*adjustmentColorize_=nullptr,*adjustmentToneButton_=nullptr;int adjustmentTone_=1;
  bool adjustmentPreviewEnabled_=true;
  std::array<double,3> relativeHsl_{},colorizedHsl_{};bool hasColorizedHsl_=false;
  PixelEntry* extractNameInput_=nullptr;
  PixelButton* extractModeButton_=nullptr;
  int extractMode_=0,extractLimit_=32;
  NativeColorPicker* colorPicker_=nullptr;
  PixelButton *pickerPrimary_=nullptr,*pickerSecondary_=nullptr,*pickerAdd_=nullptr;
  std::vector<PixelButton*> recentButtons_;
  RecentColors recentColors_;
  std::uint64_t recentColorsIdentity_=0;
  std::array<PixelButton*,6> symmetryButtons_{};
  SymmetryAxes persistedSymmetryAxes_;
  std::uint64_t symmetryIdentity_=0;
  bool symmetryLocked_=false,symmetryInitialized_=false,symmetryDragging_=false;
  SymmetryAxis symmetryDragAxis_=SymmetryAxis::Center;
  SymmetryCenter symmetryDragBefore_;
  int symmetryThickness_=1;
  Pixel symmetryColor_=0xffff0000;
  bool zoomTool_=false,zoomDragging_=false,zoomSmooth_=false;
  gfx::Point zoomStartPointer_;double zoomStartScale_=8;ui::MouseButton zoomButton_=ui::kButtonLeft;
  bool eyedropperTool_=false,eyedropperHeld_=false,paletteSamplingHeld_=false;
  EyedropperSource eyedropperSource_=EyedropperSource::Composite;
  EyedropperGesture eyedropperGesture_;
  std::array<SkinPatch,4> eyedropperLensMasks_;
  std::array<SkinPatch,2> eyedropperLensPointers_;
  os::SurfaceRef eyedropperLensSurface_;
  gfx::Point eyedropperLensPointer_;
  Pixel eyedropperLensPrevious_=0;
  PixelButton* eyedropperSourceButton_=nullptr;
  bool eyedropperLensEnabled_=true;int eyedropperLensSize_=2;
  struct PreferenceDraft {bool smooth=false,lens=true,returnStart=false;int source=0,lensSize=2;double rate=1;recovery::Preferences recovery;};
  PreferenceDraft preferenceDraft_;
  int preferenceSection_=0;
  std::array<PixelButton*,14> preferenceTabs_{};
  std::array<PixelDropdown*,9> preferenceFields_{};
  PixelButton* preferenceApply_=nullptr;
  std::u32string preferenceFeedback_;
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
  void useShapeTool(ShapeKind kind){if(gradientPending_ || gradientDragging_ || selectionDragging_ || floatingDragging_ || shapeDragging_)return;document.commitFloatingPaste();cancelStroke();shapeSpec_.kind=kind;shapeTool_=true;eyedropperTool_=false;zoomTool_=false;selectionTool_=gradientTool_=fillTool_=handTool_=eraser_=false;playing_=false;toolRowScroll_=0;refresh();}
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
  void useFillTool(){if(shapeDragging_ || selectionDragging_ || floatingDragging_ || gradientPending_)return;document.commitFloatingPaste();cancelStroke();shapeTool_=false;rememberGradientTool_=false;gradientTool_=false;fillTool_=true;selectionTool_=false;handTool_=eraser_=false;eyedropperTool_=false;zoomTool_=false;refresh();}
  void useGradientTool(){if(shapeDragging_ || selectionDragging_ || floatingDragging_ || gradientPending_)return;document.commitFloatingPaste();cancelStroke();gradientOptions_.visibleLayers=fillOptions_.visibleLayers;gradientOptions_.connectivity=fillOptions_.connectivity;shapeTool_=false;rememberGradientTool_=true;gradientTool_=true;fillTool_=selectionTool_=handTool_=eraser_=false;playing_=false;eyedropperTool_=false;zoomTool_=false;refresh();}
  void sortGradientStops(GradientStop selected){std::stable_sort(gradientStops_.begin(),gradientStops_.end(),[](auto a,auto b){return a.position<b.position;});for(int i=0;i<int(gradientStops_.size());++i)if(gradientStops_[i].position==selected.position && gradientStops_[i].color==selected.color)gradientStop_=i;gradientChanged();}
  void addGradientStop(){double gap=-1,position=.5;for(std::size_t i=1;i<gradientStops_.size();++i)if(gradientStops_[i].position-gradientStops_[i-1].position>gap){gap=gradientStops_[i].position-gradientStops_[i-1].position;position=(gradientStops_[i].position+gradientStops_[i-1].position)/2;}if(gap<.002)return;position=std::clamp(position,.001,.999);GradientSpec s;s.stops=gradientStops_;GradientStop added{position,GradientSampler(s).forAmount(position,0,0)};gradientStops_.push_back(added);sortGradientStops(added);}

  std::optional<SelectionTransform> selectionTransformTarget() const {if(auto floating=document.floatingTransform())return floating;if(!document.selection())return {};const auto& mask=*document.selection();return SelectionTransform{double(mask.x),double(mask.y),double(mask.width),double(mask.height)};}
  TransformPoint selectionPivotPreset(const SelectionTransform& target,int index) const {auto coordinate=[](double size,int position){const double last=std::max(.5,size-.5);return (position==0?.5:position==2?last:std::min(last,std::floor(size/2)+.5))/std::max(1.0,size);};return transformPoint(target,coordinate(target.width,index%3),coordinate(target.height,index/3));}
  TransformPoint selectionPivotPoint() const {auto target=selectionTransformTarget();return selectionPivot_.value_or(target?selectionPivotPreset(*target,4):TransformPoint{});}
  bool selectionPivotHit(gfx::Point point) const {if(!document.selection() || !selectionPivotVisible_ || selectionFreeTransform_ || selectionDragging_)return false;const auto p=selectionPivotPoint();return std::abs(point.x-canvas_.x-p.x*canvasScale())<=10 && std::abs(point.y-canvas_.y-p.y*canvasScale())<=10;}
  Point constrainedSelectionDelta(Point delta,bool shift){if(!shift){selectionAxis_=0;return delta;}const int x=std::abs(delta.x),y=std::abs(delta.y);if(!selectionAxis_ && (x || y))selectionAxis_=x>=y?1:2;if(selectionAxis_==1 && y>x*1.2)selectionAxis_=2;if(selectionAxis_==2 && x>y*1.2)selectionAxis_=1;return selectionAxis_==1?Point{delta.x,0}:Point{0,delta.y};}
  void centerContent(bool horizontal,bool vertical){const auto before=document.selection();if(document.centerActiveContent(horizontal,vertical)){const auto after=document.selection();if(selectionPivot_ && before && after){selectionPivot_->x+=after->x-before->x;selectionPivot_->y+=after->y-before->y;}selectionPivotMask_=after;playing_=false;}refresh();}
  void shrinkSelectionToContent(){document.commitFloatingPaste();const auto before=document.selection();if(!before)return;int left=document.width(),top=document.height(),right=-1,bottom=-1;for(int y=std::max(0,before->y);y<std::min(document.height(),before->y+before->height);++y)for(int x=std::max(0,before->x);x<std::min(document.width(),before->x+before->width);++x)if(selectionContains(before,x,y) && (document.pixels()[std::size_t(y)*document.width()+x]>>24)){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right<left){status_=U"选区中没有内容";refresh();return;}auto next=combineSelection(before,SelectionMask{left,top,right-left+1,bottom-top+1,{}},3);if(selectionEqual(before,next))return;document.commitSelection(before,next);selectionPivot_.reset();selectionPropertiesActive_=true;refresh();}
  void showSelectionPivotPopup(){if(!document.selection())return;ui::PopupWindow popup("",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow);popup.setAutoRemap(false);popup.setWantFocus(true);const auto trigger=selectionControls_[15].first->bounds();const auto popupBounds=gfx::Rect(std::clamp(trigger.x,bounds().x,std::max(bounds().x,bounds().x2()-90*uiScale)),trigger.y2()+2*uiScale,90*uiScale,84*uiScale);popup.setBounds(popupBounds);class PivotPanel final:public ui::Widget{const Skin& skin;public:PivotPanel(const Skin& value):ui::Widget(ui::kGenericWidget),skin(value){}void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto rect=uiLogical(clientBounds());g.fillRect(skin["panel"],rect);skin.draw(g,"panel_outer",rect);}};auto content=new PivotPanel(skin_);popup.addChild(content);content->setBounds(popupBounds);auto visible=new PixelButton(font_,skin_,U"显示轴心",[this]{selectionPivotVisible_=!selectionPivotVisible_;saveSelectionPreferences();invalidateRect(canvasViewport());});visible->active=selectionPivotVisible_;visible->icon=selectionPivotVisible_?"check":"checkboxUnchecked";visible->iconSkin=&toolIcons_;visible->bareIconWithCaption=true;content->addChild(visible);visible->setBounds(gfx::Rect(popupBounds.x+4*uiScale,popupBounds.y+4*uiScale,82*uiScale,19*uiScale));std::array<PixelButton*,9> presets{};for(int i=0;i<9;++i){auto button=new PixelButton(font_,skin_,U"",[this,i]{if(auto target=selectionTransformTarget())selectionPivot_=selectionPivotPreset(*target,i);invalidateRect(canvasViewport());});button->icon="selection-pivot-preset-"+std::to_string(i);button->iconSkin=&toolIcons_;content->addChild(button);button->setBounds(gfx::Rect(popupBounds.x+(4+(i%3)*15)*uiScale,popupBounds.y+(23+(i/3)*16)*uiScale,15*uiScale,16*uiScale));if(auto target=selectionTransformTarget()){const auto point=selectionPivotPreset(*target,i),current=selectionPivotPoint();button->active=std::abs(point.x-current.x)<1e-6 && std::abs(point.y-current.y)<1e-6;}presets[i]=button;button->Click.connect([&,i]{for(int j=0;j<9;++j){presets[j]->active=i==j;presets[j]->invalidate();}});}visible->Click.connect([this,visible]{visible->active=selectionPivotVisible_;visible->icon=selectionPivotVisible_?"check":"checkboxUnchecked";visible->invalidate();});popup.Resize.connect([&,content,visible](ui::ResizeEvent&){const auto area=content->bounds();visible->setBounds(gfx::Rect(area.x+4*uiScale,area.y+4*uiScale,82*uiScale,19*uiScale));for(int i=0;i<9;++i)presets[i]->setBounds(gfx::Rect(area.x+(4+(i%3)*15)*uiScale,area.y+(23+(i/3)*16)*uiScale,15*uiScale,16*uiScale));});std::unique_ptr<ui::Timer> verify;if(smoke_){verify=std::make_unique<ui::Timer>(160,&popup);verify->Tick.connect([&]{if(presets[0]->bounds().x!=visible->bounds().x || presets[3]->bounds().x!=visible->bounds().x || presets[6]->bounds().x!=visible->bounds().x)throw std::runtime_error("Pivot popup left alignment");presets[0]->Click();if(auto target=selectionTransformTarget()){const auto expected=selectionPivotPreset(*target,0);if(!selectionPivot_ || selectionPivot_->x!=expected.x || selectionPivot_->y!=expected.y)status_=U"轴心预设测试失败";}writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/"selection-pivot-smoke.bmp");verify->stop();popup.closeWindow(nullptr);});verify->start();}popup.openWindowInForeground();requestFocus();}
  void startFreeSelectionTransform(){if(!document.selection() || selectionDragging_ || floatingDragging_)return;auto target=*selectionTransformTarget();if(!document.beginSelectionContentMove(false,frameSelectionExplicit_))return;target.quad=std::array<TransformPoint,4>{{transformPoint(target,0,0),transformPoint(target,1,0),transformPoint(target,1,1),transformPoint(target,0,1)}};document.transformFloatingPaste(target,false);selectionFreeTransform_=true;selectionTool_=true;eyedropperTool_=false;zoomTool_=false;selectionPropertiesActive_=true;refresh();}
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
  bool celClipboardContext()const{return !paletteFocused_ && !document.timelineSelection().cels.empty();}
  void cutTimelineCels(){try{playing_=false;document.cutSelectedCels();celClipboardSnapshot_=document.exportCelClipboard();frameClipboardSnapshot_={};status_=U"单元格已剪切";}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}
  Document::CelClipboardSnapshot celClipboardSnapshot_;
  Document::FrameClipboardSnapshot frameClipboardSnapshot_;
  bool hasApplicationFrameClipboard()const{return !frameClipboardSnapshot_.items.empty();}
  bool applicationCelSelectionOnly()const{return !celClipboardSnapshot_.items.empty() && bool(celClipboardSnapshot_.items.front().selectionPixels);}
  bool hasApplicationCelClipboard()const{return !celClipboardSnapshot_.items.empty();}
  std::optional<int> gifDropTargetIndex_;
  std::optional<int> timelineGifDropIndex(gfx::Point at)const{
    if(!documentOpen_ || homeOpen_ || !columnShown(2) || pending_!=Pending::None)return {};
    const auto grid=timelineFrameViewport(true)|timelineFrameViewport();if(!grid.contains(at))return {};
    return std::clamp(frameScroll_+int(std::floor(double(at.x-grid.x+frameScrollRemainder_)/(12*uiScale))),0,int(document.timeline().state().frames.size()));
  }
  void clearTimelineGifDrop(){if(gifDropTargetIndex_){gifDropTargetIndex_.reset();invalidateTimelineGrid();}}
  bool handleTimelineGifDrag(os::DragEvent& event,bool drop=false){
    const auto index=timelineGifDropIndex(event.position());auto data=event.dataProvider();if(!index || !data || !data->contains(os::DragDataItemType::Paths)){clearTimelineGifDrop();return false;}
    const auto paths=data->getPaths();if(paths.empty() || !std::all_of(paths.begin(),paths.end(),[](const auto& path){auto ext=std::filesystem::u8path(path).extension().wstring();std::transform(ext.begin(),ext.end(),ext.begin(),[](wchar_t c){return std::towlower(c);});return ext==L".gif";})){clearTimelineGifDrop();return false;}
    if(!event.sourceSupports(os::DropOperation::Copy)){clearTimelineGifDrop();event.dropResult(os::DropOperation::None);return true;}
    event.dropResult(os::DropOperation::Copy);if(!drop){if(gifDropTargetIndex_!=index){gifDropTargetIndex_=index;invalidateTimelineGrid();}return true;}
    clearTimelineGifDrop();try{for(const auto& path:paths){auto source=openGifAnimation(std::filesystem::u8path(path));if(document.importGifAnimationLayer(source,*index)){playing_=false;frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;status_=U"GIF 已导入时间轴";}}}catch(const std::exception& error){status_=unicodeText(error.what());}refresh();event.acceptDrop(true);return true;
  }
  void copyTimelineFrames(){try{if(document.copySelectedFrames()){frameClipboardSnapshot_=document.exportFrameClipboard();celClipboardSnapshot_={};}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}
  void cutTimelineFrames(){try{playing_=false;if(document.copySelectedFrames()){auto snapshot=document.exportFrameClipboard();frameClipboardSnapshot_=std::move(snapshot);celClipboardSnapshot_={};document.cutSelectedFrames();}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}
  void pasteTimelineFrames(){try{if(document.pasteFrameClipboard(frameClipboardSnapshot_)){if(document.selectedFrames().empty()){frameSelectionExplicit_=false;clearTimelineRowSelection();timelineSelectionGuidesVisible_=true;}else markFrameSelection();}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}
  void copyTimelineCels(){try{if(document.copySelectedCels()){celClipboardSnapshot_=document.exportCelClipboard();frameClipboardSnapshot_={};status_=U"单元格已复制";}else{celClipboardSnapshot_={};frameClipboardSnapshot_={};status_=U"没有选中的单元格";}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}
  void pasteTimelineCels(){try{if(!celClipboardSnapshot_.items.empty())document.pasteCelClipboard(celClipboardSnapshot_);if(document.floating()){playing_=false;selectionTool_=true;eyedropperTool_=handTool_=false;}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}
  bool pixelClipboardContext() const {return !paletteFocused_ && !frameSelectionExplicit_;}
  void beginLayerTransform(){if(selectionDragging_ || floatingDragging_)return;if(!document.beginLayerTransform()){status_=U"所选图层隐藏、锁定或没有可变换内容";refresh();return;}selectionPivot_.reset();selectionFreeTransform_=false;selectionPropertiesActive_=false;useSelectionTool(0);selectionMode_=0;}
  void useSelectionTool(int kind=-1){if(shapeDragging_ || gradientPending_ || gradientDragging_ || floatingDragging_ || (selectionDragging_ && selectionKind_==5))return;if(selectionDragging_ || floatingDragging_)endSelectionGesture(!polygonPending_);if(kind>=0)selectionKind_=kind;document.commitFloatingPaste();cancelStroke();selectionTool_=true;shapeTool_=false;gradientTool_=false;fillTool_=false;handTool_=false;eraser_=false;playing_=false;eyedropperTool_=false;zoomTool_=false;refresh();}
  void selectAllPixels(){document.commitFloatingPaste();useSelectionTool();document.selectAllPixels();selectionPropertiesActive_=false;selectionPivot_.reset();selectionPivotMask_=document.selection();selectionFreeTransform_=false;refresh();}
  void copyMergedPixels(){try{auto payload=document.copyMergedPixels();if(!payload){pixelClipboard_.clear();status_=U"没有可复制的合并像素";}else{celClipboardSnapshot_={};frameClipboardSnapshot_={};status_=pixelClipboard_.write(*payload)?U"合并像素已复制":U"已复制到内部剪贴板，系统剪贴板不可用";}}catch(const std::exception& e){status_=U"复制合并失败："+unicodeText(e.what());}refresh();}
  void cutSelectionPixels(){std::optional<SelectionClipboard> copied;document.cutPixels(copied);selectionPropertiesActive_=false;selectionPivot_.reset();selectionFreeTransform_=false;}
  void copySelectionPixels(bool cut){if(paletteFocused_){if(!cut)copyPaletteColors();return;}if(!pixelClipboardContext()){status_=U"当前色卡或时间轴剪贴板尚未接入";refresh();return;}if(!document.selection()){status_=U"需要像素选区";refresh();return;}auto payload=document.copyPixels();if(!payload){pixelClipboard_.clear();status_=U"选区没有可复制像素";if(cut)cutSelectionPixels();refresh();return;}celClipboardSnapshot_={};frameClipboardSnapshot_={};if(!pixelClipboard_.write(*payload))status_=U"已复制到内部剪贴板，系统剪贴板不可用";else status_=U"像素已复制";if(cut)cutSelectionPixels();refresh();}
  void pasteSelectionPixels(){if(paletteFocused_){pastePaletteColors();return;}if(!pixelClipboardContext()){status_=U"当前色卡或时间轴剪贴板尚未接入";refresh();return;}try{document.commitFloatingPaste();auto payload=pixelClipboard_.read();if(!payload){status_=U"剪贴板没有像素图像";refresh();return;}const auto viewport=canvasViewport();const double scale=canvasScale();const int left=int(std::floor((viewport.x-canvas_.x)/scale)),top=int(std::floor((viewport.y-canvas_.y)/scale)),right=int(std::ceil((viewport.x2()-canvas_.x)/scale)),bottom=int(std::ceil((viewport.y2()-canvas_.y)/scale));auto axis=[](std::optional<int> origin,int size,int start,int end){if(origin){const int center=*origin+size/2;if(center>=start && center<end)return std::clamp(*origin,start-size,end-1);}return start+(end-start)/2-size/2;};const bool copied=payload->originX && payload->originY;int x=axis(payload->originX,payload->width,copied?left:std::max(0,left),copied?right:std::min(document.width(),right)),y=axis(payload->originY,payload->height,copied?top:std::max(0,top),copied?bottom:std::min(document.height(),bottom));if(document.width()<=payload->width || document.height()<=payload->height){x=std::clamp(x,0,std::max(0,document.width()-payload->width));y=std::clamp(y,0,std::max(0,document.height()-payload->height));}else{x=std::clamp(x,-payload->width+1,document.width()-1);y=std::clamp(y,-payload->height+1,document.height()-1);}if(document.beginFloatingPaste(*payload,x,y)){playing_=false;selectionTool_=true;eyedropperTool_=false;zoomTool_=false;handTool_=false;status_=U"浮动粘贴：拖动移动，Enter 确认，Esc 取消";}else status_=U"目标图层隐藏或锁定";refresh();}catch(const std::exception& e){status_=U"粘贴失败："+unicodeText(e.what());refresh();}}
  int selectionHit(gfx::Point position) const {if(selectionFreeTransform_){auto target=selectionTransformTarget();if(target && target->quad){const auto uv=selectionQuadMap(*target->quad,transformCanvasPoint(position),true);return uv.x>=-1e-7 && uv.x<=1+1e-7 && uv.y>=-1e-7 && uv.y<=1+1e-7?2:0;}}return selectionContentHit(document.selection(),(position.x-canvas_.x)/canvasScale(),(position.y-canvas_.y)/canvasScale(),8.0/canvasScale());}
  void endSelectionGesture(bool cancel){if(!selectionDragging_ && !floatingDragging_)return;if(cancel){++wandGeneration_;wandRequest_.reset();if(floatingDragging_){document.cancelFloatingPaste();selectionPivot_=selectionPivotBeforeGesture_;}else document.previewSelection(selectionBefore_);}else if(selectionDragging_){if(selectionBoxDragging_)document.commitSelectionBox(selectionBefore_);else{if(selectionKind_==5)document.previewSelection(combineSelection(selectionBefore_,selectionBrushStroke_.mask(document.width()),gestureSelectionMode_));if(polygonPending_)document.previewSelection(combineSelection(selectionBefore_,lassoSelection(selectionPath_,document.width(),document.height(),true,true),gestureSelectionMode_));const bool moved=selectionMoved_ || selectionKind_>=2 || quickSelection_;document.commitSelection(selectionBefore_,moved?(selectionKind_==3 || selectionKind_==5?document.selection():combineSelection(selectionBefore_,selectionPreview_,gestureSelectionMode_)):gestureSelectionMode_==0?std::optional<SelectionMask>{}:selectionBefore_,true);frameSelectionExplicit_=false;}}selectionDragging_=floatingDragging_=selectionBoxDragging_=polygonPending_=false;wandReleased_=false;selectionPath_.clear();selectionPathRedo_.clear();selectionBrushStroke_={};selectionPreview_.reset();marqueeTarget_.reset();marqueeRotationStart_.reset();marqueeResizeStart_.reset();marqueeCtrlRestore_.reset();marqueeSpaceTarget_.reset();quickSelection_=false;selectionRight_=false;selectionAxis_=0;if(!selectionStatusBefore_.empty()){status_=selectionStatusBefore_;selectionStatusBefore_.clear();}transformHandle_.clear();if(hasCapture())releaseMouse();refresh();}
  struct PaletteGesture {std::size_t start=0,last=0;int anchor=0,columns=1;bool secondary=false,moving=false,active=false;gfx::Point origin;std::vector<int> slots,ids;std::chrono::steady_clock::time_point began;};
  std::optional<PaletteGesture> paletteGesture_;
  FloatingColumnSurface* paletteSelectionOverlay_=nullptr;
  PixelScrollBar* paletteScrollBar_=nullptr;
  PixelScrollBar *railScrollBar_=nullptr,*timelineHorizontal_=nullptr,*timelineVertical_=nullptr,*canvasHorizontal_=nullptr,*canvasVertical_=nullptr,*homeScrollBar_=nullptr,*errorScrollBar_=nullptr,*preferenceNavBar_=nullptr,*preferenceContentBar_=nullptr;
  int preferenceNavPixels_=0,preferenceContentPixels_=0;
  std::map<ui::Widget*,gfx::Rect> scrollViewports_;
  int railScrollPixels_=0;
  int layerScrollRemainder_=0,frameScrollRemainder_=0,homeScrollPixels_=0,errorScrollPixels_=0;
  std::string timelineLastActiveFrame_;
  gfx::Rect paletteSelectionBorder_;
  struct PaletteEdge {gfx::Rect border,clip;std::vector<gfx::Rect> pieces;int side=0;};
  std::vector<PaletteEdge> paletteSelectionEdges_;
  std::vector<Pixel> paletteClipboard_;
  std::optional<std::size_t> paletteFocusedSlot_;
  bool paletteLocked_=true,paletteFocused_=false,editingSecondary_=false;
  int paletteScrollPixels_=0,paletteColumns_=1,renameId_=0;
  std::optional<gfx::Point> paletteMousePosition_;
  std::vector<int> paletteButtonIds_;
  Pixel lastPaletteInk_=0xffff7929;
  BrushOptions brushProfiles_[2];
  struct BrushLineAnchor {Point point;std::uint64_t identity,revision;std::string layer,frame;std::unordered_map<std::size_t,Pixel> baseline;bool mergeWithNext=true;};
  std::optional<BrushLineAnchor> brushLineAnchors_[2];
  Point brushStrokeLast_{};gfx::Point brushStrokePointer_{};
  bool ordinaryBrushTool() const {return !selectionTool_ && !shapeTool_ && !gradientTool_ && !fillTool_ && !handTool_ && !zoomTool_ && !eyedropperTool_;}
  const BrushLineAnchor* brushLineAnchor() const {const auto& a=brushLineAnchors_[eraser_?1:0];return a && a->identity==document.identity() && a->layer==document.layer().id && a->frame==document.frame().id?&*a:nullptr;}
  struct ModifierBrushSize {gfx::Point start;int size;bool pressed=false;};
  std::optional<ModifierBrushSize> modifierBrushSize_;
  bool modifierCtrl_=false,modifierAlt_=false;
  bool brushPreviewShift_=false;
  bool modifierBrushSupported() const {
    return (!pencilImageBrush_ || !pencilImageBrush_->intrinsicSize || (selectionTool_ && selectionKind_==5)) && ((!shapeTool_ && !selectionTool_ && !fillTool_ && !gradientTool_ && !handTool_ && !zoomTool_ && !eyedropperTool_) ||
      (shapeTool_ && shapeSpec_.kind==ShapeKind::Line) || (selectionTool_ && selectionKind_==5 && !selectionPropertiesActive_));
  }
  void setModifierBrushSize(int value) {
    auto& brush=brushProfiles_[eraser_?1:0];value=std::clamp(value,1,64);
    if(brush.size==value)return;brush.size=value;layoutToolOptions();invalidateRect(canvasViewport());
  }
  void finishModifierBrushSize(){if(!modifierBrushSize_)return;const bool pressed=modifierBrushSize_->pressed;modifierBrushSize_.reset();if(pressed && hasCapture())releaseMouse();saveBrushPreferences();updateNavigationCursor();}

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
  struct AutoLinkGesture {std::string start;bool value=false;std::map<std::string,bool> originals;};
  std::optional<AutoLinkGesture> autoLinkGesture_;
  std::string autoLinkSoloTarget_;
  std::map<std::string,bool> autoLinkSoloOriginals_;
  std::uint64_t autoLinkGestureIdentity_=0;
  std::vector<std::string> autoLinkVisibleTargets()const{std::vector<std::string> ids;for(std::size_t n=0;n<layerAutoLinks_.size() && n<document.timeline().state().layers.size();++n)if(layerAutoLinks_[n]->timelineVisible)ids.push_back(document.timeline().state().layers[n].id);return ids;}
  std::vector<std::string> autoLinkModifierTargets()const{auto ids=document.timelineSelection().layers;ids.erase(std::remove_if(ids.begin(),ids.end(),[this](const auto& id){return std::none_of(document.timeline().state().layers.begin(),document.timeline().state().layers.end(),[&](const auto& layer){return layer.id==id;});}),ids.end());return ids.size()>1?ids:autoLinkVisibleTargets();}
  bool autoLinkValue(const std::string& id)const{const auto& layers=document.timeline().state().layers;const auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& layer){return layer.id==id;});return it!=layers.end() && it->autoLinkAnimationCels;}
  void finishAutoLinkGesture(){if(!autoLinkGesture_)return;autoLinkGesture_.reset();if(autoLinkGestureIdentity_==document.identity())document.commitAutoLinkGesture();if(hasCapture())releaseMouse();refresh();}
  void updateAutoLinkGesture(const std::string& id){if(!autoLinkGesture_ || autoLinkGestureIdentity_!=document.identity())return;auto& gesture=*autoLinkGesture_;const auto ids=autoLinkVisibleTargets();const auto start=std::find(ids.begin(),ids.end(),gesture.start),end=std::find(ids.begin(),ids.end(),id);if(start==ids.end() || end==ids.end())return;const auto first=std::min(start,end),last=std::max(start,end);for(auto at=first;at<=last;++at)gesture.originals.emplace(*at,autoLinkValue(*at));for(const auto& [key,value]:gesture.originals){const auto at=std::find(ids.begin(),ids.end(),key);document.previewAutoLinkGesture(key,at>=first && at<=last?gesture.value:value);}refresh();}
  void beginAutoLinkGesture(const std::string& id,const ui::MouseMessage& mouse){
    if(!mouse.left() || pending_!=Pending::None)return;finishAutoLinkGesture();if(autoLinkGestureIdentity_!=document.identity()){autoLinkSoloTarget_.clear();autoLinkSoloOriginals_.clear();}autoLinkGestureIdentity_=document.identity();const bool value=!autoLinkValue(id);document.beginAutoLinkGesture();
    if(mouse.altPressed()){const auto ids=autoLinkModifierTargets();for(const auto& [key,original]:autoLinkSoloOriginals_)document.previewAutoLinkGesture(key,original);if(autoLinkSoloTarget_==id){autoLinkSoloTarget_.clear();autoLinkSoloOriginals_.clear();}else{autoLinkSoloOriginals_.clear();for(const auto& key:ids)autoLinkSoloOriginals_.emplace(key,autoLinkValue(key));for(const auto& key:ids)document.previewAutoLinkGesture(key,key==id);autoLinkSoloTarget_=id;}document.commitAutoLinkGesture();refresh();return;}
    if(mouse.ctrlPressed()){for(const auto& key:autoLinkModifierTargets())document.previewAutoLinkGesture(key,value);document.commitAutoLinkGesture();refresh();return;}
    autoLinkGesture_=AutoLinkGesture{id,value,{}};updateAutoLinkGesture(id);manager()->setCapture(this,true);requestFocus();
  }
  bool processAutoLinkGesture(ui::Message* msg){if(!autoLinkGesture_)return false;if(autoLinkGestureIdentity_!=document.identity()){autoLinkGesture_.reset();if(hasCapture())releaseMouse();return false;}if(!hasCapture() || msg->type()==ui::kFocusLeaveMessage){finishAutoLinkGesture();return false;}if(msg->type()==ui::kMouseMoveMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);for(std::size_t n=0;n<layerAutoLinks_.size() && n<document.timeline().state().layers.size();++n)if(layerAutoLinks_[n]->timelineVisible && layerAutoLinks_[n]->bounds().contains(mouse->position())){updateAutoLinkGesture(document.timeline().state().layers[n].id);break;}return true;}if(msg->type()==ui::kMouseUpMessage){finishAutoLinkGesture();return true;}return false;}
  struct VisibilityGesture {std::string start;bool value=false;std::map<std::string,bool> originals;};
  std::optional<VisibilityGesture> visibilityGesture_;
  std::string visibilitySoloTarget_;
  std::map<std::string,bool> visibilitySoloOriginals_;
  std::uint64_t visibilityGestureIdentity_=0;
  std::vector<std::string> visibilityVisibleTargets()const{std::vector<std::string> ids;for(const auto& layer:document.timeline().state().layers)ids.push_back(layer.id);return ids;}
  std::vector<std::string> visibilityModifierTargets()const{auto ids=visibilityVisibleTargets();const auto& selected=document.timelineSelection().layers;if(selected.size()>1)ids.erase(std::remove_if(ids.begin(),ids.end(),[&](const auto& id){return std::find(selected.begin(),selected.end(),id)==selected.end();}),ids.end());return ids;}
  bool visibilityValue(const std::string& id)const{const auto& layers=document.timeline().state().layers;const auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& layer){return layer.id==id;});return it!=layers.end() && it->visible;}
  void finishVisibilityGesture(){if(!visibilityGesture_)return;visibilityGesture_.reset();if(visibilityGestureIdentity_==document.identity())document.commitVisibilityGesture();if(hasCapture())releaseMouse();refresh();}
  void updateVisibilityGesture(const std::string& id){if(!visibilityGesture_ || visibilityGestureIdentity_!=document.identity())return;auto& gesture=*visibilityGesture_;const auto ids=visibilityVisibleTargets();const auto start=std::find(ids.begin(),ids.end(),gesture.start),end=std::find(ids.begin(),ids.end(),id);if(start==ids.end() || end==ids.end())return;const auto first=std::min(start,end),last=std::max(start,end);for(auto at=first;at<=last;++at)gesture.originals.emplace(*at,visibilityValue(*at));for(const auto& [key,value]:gesture.originals){const auto at=std::find(ids.begin(),ids.end(),key);document.previewVisibilityGesture(key,at>=first && at<=last?gesture.value:value);}refresh();}
  void beginVisibilityGesture(const std::string& id,const ui::MouseMessage& mouse){
    if(!mouse.left() || pending_!=Pending::None)return;finishAutoLinkGesture();finishVisibilityGesture();if(visibilityGestureIdentity_!=document.identity()){visibilitySoloTarget_.clear();visibilitySoloOriginals_.clear();}visibilityGestureIdentity_=document.identity();const bool value=!visibilityValue(id);document.beginVisibilityGesture();
    if(mouse.altPressed()){const auto ids=visibilityModifierTargets();for(const auto& [key,original]:visibilitySoloOriginals_)document.previewVisibilityGesture(key,original);if(visibilitySoloTarget_==id){visibilitySoloTarget_.clear();visibilitySoloOriginals_.clear();}else{visibilitySoloOriginals_.clear();for(const auto& key:ids)visibilitySoloOriginals_.emplace(key,visibilityValue(key));for(const auto& key:ids)document.previewVisibilityGesture(key,key==id);visibilitySoloTarget_=id;}document.commitVisibilityGesture();refresh();return;}
    if(mouse.ctrlPressed()){for(const auto& key:visibilityModifierTargets())document.previewVisibilityGesture(key,value);document.commitVisibilityGesture();refresh();return;}
    visibilityGesture_=VisibilityGesture{id,value,{}};updateVisibilityGesture(id);manager()->setCapture(this,true);requestFocus();
  }
  bool processVisibilityGesture(ui::Message* msg){if(!visibilityGesture_)return false;if(visibilityGestureIdentity_!=document.identity()){visibilityGesture_.reset();if(hasCapture())releaseMouse();return false;}if(!hasCapture() || msg->type()==ui::kFocusLeaveMessage){finishVisibilityGesture();return false;}if(msg->type()==ui::kMouseMoveMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);for(std::size_t n=0;n<layerEyes_.size() && n<document.timeline().state().layers.size();++n)if(layerEyes_[n]->timelineVisible && layerEyes_[n]->bounds().contains(mouse->position())){updateVisibilityGesture(document.timeline().state().layers[n].id);break;}return true;}if(msg->type()==ui::kMouseUpMessage){finishVisibilityGesture();return true;}return false;}
  struct LockGesture {std::string start;bool value=false;std::map<std::string,bool> originals;};
  std::optional<LockGesture> lockGesture_;
  std::string lockSoloTarget_;
  std::map<std::string,bool> lockSoloOriginals_;
  std::uint64_t lockGestureIdentity_=0;
  std::vector<std::string> lockVisibleTargets()const{std::vector<std::string> ids;for(const auto& layer:document.timeline().state().layers)ids.push_back(layer.id);return ids;}
  std::vector<std::string> lockModifierTargets()const{auto ids=lockVisibleTargets();const auto& selected=document.timelineSelection().layers;if(selected.size()>1)ids.erase(std::remove_if(ids.begin(),ids.end(),[&](const auto& id){return std::find(selected.begin(),selected.end(),id)==selected.end();}),ids.end());return ids;}
  bool lockValue(const std::string& id)const{const auto& layers=document.timeline().state().layers;const auto it=std::find_if(layers.begin(),layers.end(),[&](const auto& layer){return layer.id==id;});return it!=layers.end() && it->locked;}
  void finishLockGesture(){if(!lockGesture_)return;lockGesture_.reset();if(lockGestureIdentity_==document.identity())document.commitLockGesture();if(hasCapture())releaseMouse();refresh();}
  void updateLockGesture(const std::string& id){if(!lockGesture_ || lockGestureIdentity_!=document.identity())return;auto& gesture=*lockGesture_;const auto ids=lockVisibleTargets();const auto start=std::find(ids.begin(),ids.end(),gesture.start),end=std::find(ids.begin(),ids.end(),id);if(start==ids.end() || end==ids.end())return;const auto first=std::min(start,end),last=std::max(start,end);for(auto at=first;at<=last;++at)gesture.originals.emplace(*at,lockValue(*at));for(const auto& [key,value]:gesture.originals){const auto at=std::find(ids.begin(),ids.end(),key);document.previewLockGesture(key,at>=first && at<=last?gesture.value:value);}refresh();}
  void beginLockGesture(const std::string& id,const ui::MouseMessage& mouse){
    if(!mouse.left() || pending_!=Pending::None)return;finishAutoLinkGesture();finishVisibilityGesture();finishLockGesture();if(lockGestureIdentity_!=document.identity()){lockSoloTarget_.clear();lockSoloOriginals_.clear();}lockGestureIdentity_=document.identity();const bool value=!lockValue(id);document.beginLockGesture();
    if(mouse.altPressed()){const auto ids=lockModifierTargets();for(const auto& [key,original]:lockSoloOriginals_)document.previewLockGesture(key,original);if(lockSoloTarget_==id){lockSoloTarget_.clear();lockSoloOriginals_.clear();}else{lockSoloOriginals_.clear();for(const auto& key:ids)lockSoloOriginals_.emplace(key,lockValue(key));for(const auto& key:ids)document.previewLockGesture(key,key==id);lockSoloTarget_=id;}document.commitLockGesture();refresh();return;}
    if(mouse.ctrlPressed()){for(const auto& key:lockModifierTargets())document.previewLockGesture(key,value);document.commitLockGesture();refresh();return;}
    lockGesture_=LockGesture{id,value,{}};updateLockGesture(id);manager()->setCapture(this,true);requestFocus();
  }
  bool processLockGesture(ui::Message* msg){if(!lockGesture_)return false;if(lockGestureIdentity_!=document.identity()){lockGesture_.reset();if(hasCapture())releaseMouse();return false;}if(!hasCapture() || msg->type()==ui::kFocusLeaveMessage){finishLockGesture();return false;}if(msg->type()==ui::kMouseMoveMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);for(std::size_t n=0;n<layerLocks_.size() && n<document.timeline().state().layers.size();++n)if(layerLocks_[n]->timelineVisible && layerLocks_[n]->bounds().contains(mouse->position())){updateLockGesture(document.timeline().state().layers[n].id);break;}return true;}if(msg->type()==ui::kMouseUpMessage){finishLockGesture();return true;}return false;}
  std::vector<PixelButton*> layerRows_,layerEyes_,layerLocks_,layerAutoLinks_;
  int layerScroll_=0,frameScroll_=0;
  std::vector<PixelButton*> frameHeaders_,frameCells_;
  bool playing_=false,frameSelectionExplicit_=false;
  // Legacy separates editing context from explicit timeline selection.
  std::string selectedTimelineLayer_,selectedTimelineCelLayer_,selectedTimelineCelFrame_;
  std::uint64_t timelineSelectionIdentity_=0;
  bool timelineSelectionGuidesVisible_=true;
  struct TimelineGesture {
    int kind=0,row=0,column=0,targetRow=0,targetColumn=0,mode=0;
    bool canMove=false,moved=false,copy=false,right=false,after=false,altClick=false,addContent=false,starting=false;
    gfx::Point origin,pointer;
    std::uint64_t identity=0;
    Document::TimelineSelection selection;
    std::vector<std::string> frames;
    std::string activeLayer,activeFrame,anchor,frameAnchor;
  } timelineGesture_;
  ui::Timer timelineScrollTimer_{30,this};
  timeline::LoopPlayback loopPlayback_;
  bool playbackTagMode_=false,playbackModeLoop_=true;
  std::optional<std::string> savedPlaybackMode_;
  std::string playbackSessionMode_="all";
  std::uint64_t playbackModeIdentity_=0;
  std::string playbackTagCycle_,playbackObservedFrame_;
  std::uint64_t playbackIdentity_=0,playbackRevision_=0;
  std::optional<timeline::LoopSection> loopDraft_;
  std::array<PixelEntry*,4> loopInputs_{};
  PixelButton* loopDirection_=nullptr;
  std::string frameClickCollapse_;
  OnionSkinSettings onion_;
  int onionField_=0;
  std::chrono::steady_clock::time_point playbackDue_;
  double playbackRate_=1;bool playbackReturnToStart_=false;std::string playbackStartFrame_;
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
  PixelButton *discard_=nullptr, *keep_=nullptr, *dialogClose_=nullptr, *saveBeforeClose_=nullptr;
  Skin toolIcons_;
  std::array<PixelButton*,5> topActions_{};
  std::vector<PixelButton*> toolRail_;
  std::unique_ptr<ui::PopupWindow> toolFlyout_;
  std::unique_ptr<ToolPropertyPopup> propertyRangePopup_;
  PixelSlider* propertyRangeSlider_=nullptr;
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
    pan_.end();panButton_=ui::kButtonNone;layoutCanvasScrollBars();
    if(hasCapture()) releaseMouse();
    updateNavigationCursor();invalidateRect(canvasViewport());
  }
  // canvas-auto-pan.ts: the active selection gesture owns the viewport edge band.
  void selectionAutoPan(gfx::Point pointer){if(!(selectionDragging_ || floatingDragging_) || selectionKind_==4 || selectionKind_==5)return;const auto viewport=canvasViewport();auto speed=[](int point,int start,int end){return point<start+28?-std::min(16.0,std::max(2.0,(start+28-point)*.4)):point>end-28?std::min(16.0,std::max(2.0,(point-(end-28))*.4)):0.0;};const int dx=int(std::round(speed(pointer.x,viewport.x,viewport.x2()))),dy=int(std::round(speed(pointer.y,viewport.y,viewport.y2())));if(!dx && !dy)return;canvas_.x-=dx;canvas_.y-=dy;constrainCanvas();invalidateRect(viewport);}
  void constrainCanvas() {
    const auto viewport=canvasViewport();
    canvas_.x=clampCanvasAxis(canvas_.x,viewport.x,viewport.w,canvas_.w);
    canvas_.y=clampCanvasAxis(canvas_.y,viewport.y,viewport.h,canvas_.h);layoutCanvasScrollBars();
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
  struct HeldCelNavigation {ui::KeyScancode key;std::chrono::steady_clock::time_point nextAt;};
  std::vector<HeldCelNavigation> heldCelNavigation_;
  std::uint64_t celNavigationIdentity_=0;
  ui::Timer celNavigationTimer_{40,this};
  std::string ownedRecoveryId_;
  std::uint64_t ownedRecoveryIdentity_=0;

  std::optional<Document> openCandidate_;
  std::u32string openError_,errorTitle_=U"无法打开工程";
  int modalErrorScroll_=0;
  std::u32string modalErrorContent_;
  enum class Pending { None, New, Open, OpenError, Close, CloseDocument, LayerOpacity, FrameDuration, LoopSection, OnionValue, PaletteName, PaletteExtract, ColorAdjustment, Convolution, AntiAlias, ReplaceColor, ColorRole, ImageResize, BrushFolderName, StaticExport, SpriteSheet, GifExport, SheetImport, Preferences } pending_=Pending::None;
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
  bool showSelectionOutline_=true;
  std::uint64_t selectionOutlineIdentity_=0;
  void syncSelectionOutlineView(){if(selectionOutlineIdentity_!=document.identity()){showSelectionOutline_=true;selectionOutlineIdentity_=document.identity();}}
  void toggleSelectionOutline(){syncSelectionOutlineView();showSelectionOutline_=!showSelectionOutline_;if(!showSelectionOutline_)antsTimer_.stop();invalidateRect(canvasViewport());}
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
    static constexpr int edge=uiGap,gap=uiGap,toolSize=15,toolHeight=16,toolGap=-1,tabHeight=18,projectTabHeight=16,frame=3;
    // Fusion's current Chinese labels occupy ink rows 1..9 in the 10px cell.
    // Menu row: 16px action buttons with 2px top/bottom padding.
    static constexpr int fontHeight=10,labelInkHeight=9,menuHeight=20,statusHeight=labelInkHeight+2*gap;
    static constexpr int panelY=menuHeight,documentY=panelY,optionsY=documentY+projectTabHeight+frame+gap,optionsHeight=19,workY=optionsY+optionsHeight,inset=frame+gap;
    int right,rightX,workX,workW,tabY=optionsY,top=workY+gap,bottom,split,layerTop,pickerTop=-1;
    explicit Layout(gfx::Rect rc,bool layers=true,int dockWidth=0,double paletteShare=0,int timelineHeight=109)
      :rightX(edge+toolSize+gap+(12*(toolHeight+toolGap)+1>rc.h-statusHeight-optionsY?6:0)),bottom(rc.h-statusHeight) {
      // Native minimums keep the existing 2x controls and canvas reachable.
      right=std::clamp(dockWidth?dockWidth:std::clamp(rc.w/6,116,120),116,std::max(116,rc.w-edge-rightX-gap-160));
      workX=rightX+right+gap;workW=rc.w-edge-workX;
      split=paletteShare>0?top+int(std::round((bottom-top)*paletteShare)):tabY+(bottom-tabY)*2/5;
      split=std::clamp(split,top+70,std::max(top+70,bottom-100));
      layerTop=layers?bottom-std::clamp(timelineHeight,65,std::max(65,bottom-top-100)):bottom+gap;
    }
    int paletteBottom(bool picker) const {return picker?split-gap:bottom;}
    gfx::Rect pickerPanel() const {return {rightX,split,right,bottom-split};}
    gfx::Rect pickerContent() const {const int y=pickerTop>=0?pickerTop:split+frame+gap+labelInkHeight+gap;return {rightX+inset,y,right-2*inset,bottom-y-inset};}
    gfx::Rect pickerGradient(bool recent) const {auto r=pickerContent();r.h-=44+(recent?12+uiGap:0);return r;}
    gfx::Rect workspacePanel() const {return {workX,top,workW,layerTop-gap-top};}
    gfx::Rect workspaceContent() const {return {workX+inset,top+inset,workW-2*inset,layerTop-gap-top-2*inset};}
  };
  panels::Model docking_;
  std::array<PixelButton*,4> dockingTabs_{};
  DockFeedback* dockFeedback_=nullptr;
  std::array<FloatingColumnSurface*,4> floatingSurfaces_{};
  std::array<PixelButton*,4> columnClose_{};
  FloatingColumnSurface* modalSurface_=nullptr;
  std::array<std::uint64_t,4> floatingFocus_{};
  std::uint64_t overlayClock_=0,dialogFocus_=0;
  Pending stackedPending_=Pending::None;
  struct PanelGesture {int id=-1,edges=0,neighbor=-1;bool moved=false,wholeGroup=false;gfx::Point origin,pointer;gfx::Rect tabStart;panels::Rect start;panels::Model before;panels::Target candidate,confirmed;std::chrono::steady_clock::time_point due;};
  PanelGesture panelGesture_;
  std::optional<gfx::Point> pendingPanelPointer_;
  std::uint64_t panelGeometryUpdates_=0,panelBlitMoves_=0,panelFullRefreshes_=0;
  ui::Timer panelDockTimer_{16,this};
  gfx::Rect toDisplay(gfx::Rect local)const{return uiDisplayRect(local,bounds().origin());}
  gfx::Rect dialogDisplayBounds()const{return toDisplay(modalBounds(uiLogical(clientBounds())));}
  std::array<bool,4> columnVisibility()const{return {palettePanelOpen_,colorPickerOpen_,layersPanelOpen_&&documentOpen_,previewPanelOpen_};}
  panels::Rect dockArea(gfx::Rect rc)const{return {Layout::edge+Layout::toolSize+Layout::gap,Layout::optionsY,rc.w-2*Layout::edge-Layout::toolSize-Layout::gap,rc.h-Layout::statusHeight-Layout::optionsY};}
  panels::Rect floatingArea(gfx::Rect rc)const{return {0,0,rc.w,rc.h};}
  panels::Geometry columnGeometry(gfx::Rect rc)const{
    if(docking_.custom)return docking_.layout(dockArea(rc),columnVisibility(),Layout::gap,floatingArea(rc));
    const Layout l(rc,layersPanelOpen_,dockWidth_,paletteShare_,timelineHeight_);panels::Geometry g;g.shown=columnVisibility();
    g.panel[0]={l.rightX,l.tabY,l.right,l.paletteBottom(colorPickerOpen_)-l.tabY};auto c=l.pickerPanel();g.panel[1]={c.x,c.y,c.w,c.h};g.panel[2]={l.workX,l.layerTop,l.workW,l.bottom-l.layerTop};
    if(previewPanel_){auto r=uiLogical(previewPanel_->bounds());g.panel[3]={r.x-rc.x,r.y-rc.y,r.w,r.h};}return g;
  }
  bool columnShown(int id)const{return docking_.custom?docking_.shown(id,columnVisibility()):columnVisibility()[id];}
  Layout workspaceLayout(gfx::Rect rc)const{
    Layout l(rc,layersPanelOpen_,dockWidth_,paletteShare_,timelineHeight_);
    if(docking_.custom){auto r=columnGeometry(rc).canvas;l.workX=r.x;l.workW=r.w;l.top=r.y+Layout::optionsHeight+Layout::gap;l.layerTop=r.y+r.h+Layout::gap;}
    return l;
  }
  Layout columnLayout(gfx::Rect rc,int id)const{
    Layout l(rc,layersPanelOpen_,dockWidth_,paletteShare_,timelineHeight_);if(!docking_.custom)return l;
    auto r=columnGeometry(rc).panel[id];
    if(id==2){l.workX=r.x;l.workW=r.w;l.layerTop=columnBodyTop(id)-19;l.bottom=r.y+r.h;}
    else{l.rightX=r.x;l.right=r.w;l.tabY=r.y;l.top=r.y+Layout::tabHeight;l.split=id==1?r.y:r.y+r.h+Layout::gap;l.bottom=r.y+r.h;if(id==1)l.pickerTop=columnBodyTop(id);}
    return l;
  }
  // Background frame has a 3px rim; keep 2px before controls/content.
  // A single title occupies nine ink rows inside it; grouped tabs sit outside.
  int columnBodyTop(int id)const{const auto frame=columnFrame(id);return frame.y+Layout::inset+(columnFrameTop(id)?0:Layout::labelInkHeight+uiGap);}
  void initializeDocking(){
    if(docking_.custom)return;const auto rc=uiLogical(bounds());const auto geometry=columnGeometry(rc);docking_.leftWidth=geometry.panel[0].w;
    docking_.bottomHeight=timelineHeight_;docking_.bottomShare=double(timelineHeight_)/std::max(1,dockArea(rc).h);
    for(int i=0;i<4;++i){auto& group=docking_.groups[docking_.groupOf(i)];group.weight=std::max(1,geometry.panel[i].h);group.floating=geometry.panel[i];group.floatingArea=floatingArea(rc);group.width=std::max(140,geometry.panel[i].w);}
  }
  void dockColumn(int id,panels::Dock dock){initializeDocking();const auto rc=uiLogical(bounds());auto r=columnGeometry(rc).panel[id];docking_.place(id,dock,-1,true,false,r);docking_.groups[docking_.groupOf(id)].floatingArea=floatingArea(rc);refresh();saveWorkspaceSizes();}

  int documentTabWidth(const Layout& l) const {return std::min(l.workW-18,font_.inkBounds(document.name()).w+2*Layout::inset+11+uiGap+(document.dirty()?3+uiGap:0));}
  void layoutDocumentTab() {
    if(!documentTabNew_)return;
    const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);const int width=documentOpen_?documentTabWidth(l):0;
    documentTabNew_->setBounds(uiPhysical(gfx::Rect(rc.x+width-(documentOpen_?1:0),rc.y+Layout::documentY,17,Layout::projectTabHeight)));
    documentTabClose_->setBounds(uiPhysical(gfx::Rect(rc.x+width-Layout::inset-11,rc.y+Layout::documentY+2,11,11)));
    documentTabClose_->setVisible(documentOpen_);
    documentTabNew_->setEnabled(pending_==Pending::None);documentTabClose_->setEnabled(pending_==Pending::None);
  }
  void closeDocumentTab() {
    closedControlStates_.clear();for(auto child:children())closedControlStates_.push_back({child,child->isEnabled()});
    document=Document::withBuiltinPalette();documentPath_.clear();documentOpen_=false;showHome(true);
  }
  bool enabledTimelineAction(std::size_t i) const {return pending_==Pending::None && (i<=6 || (i==7 && document.timeline().state().frames.size()>1) || i==8);}
  // Toolbar selectAnimationEdge/selectAnimationStep explicitly select frames, independent of keyboard stepping.
  void toolbarSelectFrame(std::size_t index){document.selectFrameHeader(document.timeline().state().frames.at(index).id,0,playing_);markFrameSelection();if(playing_)retargetTagPlayback();refresh();}
  void toolbarStepFrame(int direction){const auto count=document.timeline().state().frames.size();const auto at=document.activeFrameIndex();toolbarSelectFrame(direction>0?(at+1)%count:(at?at-1:0));}
  void keyboardStepFrame(int direction){
    if(playing_){playing_=false;refresh();return;}document.commitFloatingPaste();if(document.timeline().state().frames.size()<2)return;const auto target=timeline::stepFrameId(document.timeline().state(),document.frame().id,direction,playbackTagMode_);if(!target.empty() && target!=document.frame().id){document.clearTimelineSelection();clearTimelineRowSelection();document.selectFrame(target);}const auto* slot=document.timeline().findCel(document.layer().id,document.frame().id);if(slot)document.selectTimelineCel(slot->id);frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;refresh();
  }
  static bool celNavigationKey(ui::KeyScancode key){return key==ui::kKeyLeft || key==ui::kKeyRight || key==ui::kKeyUp || key==ui::kKeyDown;}
  bool celNavigationBlocked() const {
    if(!documentOpen_ || homeOpen_ || pending_!=Pending::None || document.selection() || document.active() || timelineGesture_.kind || pan_.active || selectionDragging_ || floatingDragging_ || shapeDragging_ || gradientDragging_ || gradientPending_ || fillDragging_ || eyedropperGesture_.active())return true;
    auto manager=ui::Manager::getDefault();auto focus=manager->getFocus();
    if(dynamic_cast<ui::Entry*>(focus))return true;
    if(focus){auto ancestor=focus;while(ancestor && ancestor!=this)ancestor=ancestor->parent();if(!ancestor)return true;}
    for(auto child:menuBar_->children())if(auto item=dynamic_cast<ui::MenuItem*>(child))if(item->hasSubmenuOpened())return true;
    return manager->getForegroundWindow() && manager->getForegroundWindow()!=window();
  }
  void stopCelNavigation(){heldCelNavigation_.clear();celNavigationTimer_.stop();}
  void releaseCelNavigation(ui::KeyScancode key){heldCelNavigation_.erase(std::remove_if(heldCelNavigation_.begin(),heldCelNavigation_.end(),[key](const auto& held){return held.key==key;}),heldCelNavigation_.end());if(heldCelNavigation_.empty())celNavigationTimer_.stop();}
  void navigateCel(ui::KeyScancode key){
    if(celNavigationBlocked())return;
    if(playing_){playing_=false;refresh();return;}
    if(key==ui::kKeyLeft || key==ui::kKeyRight){if(document.timeline().state().frames.size()>1)keyboardStepFrame(key==ui::kKeyLeft?-1:1);return;}
    const auto next=int(document.activeLayerIndex())+(key==ui::kKeyUp?-1:1);const auto& layers=document.timeline().state().layers;if(next<0 || next>=int(layers.size()))return;
    const auto id=layers[next].id;document.commitFloatingPaste();const auto* slot=document.timeline().findCel(id,document.frame().id);if(!slot)return;document.selectTimelineCel(slot->id);clearTimelineRowSelection();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;refresh();
  }
  void pressCelNavigation(ui::KeyScancode key,std::chrono::steady_clock::time_point now){
    if(std::any_of(heldCelNavigation_.begin(),heldCelNavigation_.end(),[key](const auto& held){return held.key==key;}))return;
    celNavigationIdentity_=document.identity();heldCelNavigation_.push_back({key,now+std::chrono::milliseconds(280)});navigateCel(key);celNavigationTimer_.start();
  }
  void celNavigationTick(std::chrono::steady_clock::time_point now){
    if(celNavigationIdentity_!=document.identity() || celNavigationBlocked()){stopCelNavigation();return;}
    // Legacy Map iteration retains insertion order when several arrow keys are held.
    for(auto& held:heldCelNavigation_)if(now>=held.nextAt){navigateCel(held.key);held.nextAt=now+std::chrono::milliseconds(held.key==ui::kKeyLeft || held.key==ui::kKeyRight?50:120);}
  }
  bool canDeleteWorkspaceContent() const {return document.selection().has_value() || document.floating() || !document.timelineSelection().cels.empty() || !document.selectedFrames().empty() || document.canDeleteLayers();}
  void deleteWorkspaceContent(bool keyboard){
    playing_=false;cancelStroke();
    if(keyboard && paletteFocused_){document.deletePaletteColors(document.palette().selected);refresh();return;}
    if(document.selection() || document.floating())document.deleteSelectedPixels();
    else if(!document.timelineSelection().cels.empty()){document.deleteSelectedCels();clearTimelineRowSelection();}
    else if(!document.selectedFrames().empty()){document.deleteSelectedFrames();frameSelectionExplicit_=false;clearTimelineRowSelection();}
    else if(keyboard && !document.timelineSelection().layers.empty())document.deleteSelectedLayers();
    else if(keyboard){const auto* slot=document.timeline().findCel(document.layer().id,document.frame().id);if(slot){document.selectTimelineCel(slot->id);document.deleteSelectedCels();clearTimelineRowSelection();}}
    else document.deleteLayer();
    timelineSelectionIdentity_=document.identity();refresh();
  }
  void seekFrame(std::size_t index) {document.clearTimelineSelection();clearTimelineRowSelection();document.clearFrameSelection();loopPlayback_={};frameSelectionExplicit_=false;playing_=false;document.selectFrame(document.timeline().state().frames.at(index).id);refresh();}
  void createLayer(){playing_=false;document.addLayer();clearTimelineRowSelection();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;refresh();}
  void deleteTimelineItems(){playing_=false;cancelStroke();try{if(!document.timelineSelection().cels.empty())document.deleteSelectedCels(true);else{const auto count=document.timeline().state().frames.size();document.deleteSelectedFrames(true);if(document.timeline().state().frames.size()!=count){selectionPivot_.reset();selectionPivotMask_.reset();selectionFreeTransform_=false;}}clearTimelineRowSelection();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();refresh();}catch(const std::exception& e){showSaveError(e);}}
  void frameAction(int kind) {playing_=false;try{if(kind==2)document.deleteSelectedFrames();else {document.addFrame(kind==1);selectionPivot_.reset();selectionPivotMask_.reset();selectionFreeTransform_=false;clearTimelineRowSelection();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();}refresh();}catch(const std::exception& e){showSaveError(e);}}
  // Legacy AnimationPlaybackMenu/useAnimationPlaybackClock rates and deadline reset.
  static double normalizedPlaybackRate(double value){for(double rate:{.25,.5,1.,1.5,2.,3.})if(value==rate)return rate;return 1;}
  std::chrono::steady_clock::duration playbackFrameDelay() const {return std::chrono::duration_cast<std::chrono::steady_clock::duration>(std::chrono::duration<double,std::milli>(document.frame().duration/playbackRate_));}
  void readPlaybackPreferences(std::istream& in){double rate=1;int back=0;if(!(in>>rate>>back))throw std::runtime_error("Invalid animation playback preferences");playbackRate_=normalizedPlaybackRate(rate);playbackReturnToStart_=back==1;std::string mode; savedPlaybackMode_.reset();if(in>>mode)if(mode=="once" || mode=="all" || mode=="tag")savedPlaybackMode_=mode;playbackModeIdentity_=0;}
  void writePlaybackPreferences(std::ostream& out)const{out<<playbackRate_<<' '<<playbackReturnToStart_<<' '<<savedPlaybackMode_.value_or("-");}
  void savePlaybackPreferences(){if(smoke_)return;try{const auto path=palettePreferencePath().parent_path()/"animation-playback.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);writePlaybackPreferences(out);out.close();if(!out)throw std::runtime_error("Cannot save animation playback preferences");}catch(const std::exception& e){status_=U"播放偏好保存失败："+unicodeText(e.what());}}
  void setPlaybackRate(double rate){playbackRate_=normalizedPlaybackRate(rate);if(playing_)playbackDue_=std::chrono::steady_clock::now()+playbackFrameDelay();savePlaybackPreferences();refresh();}
  void completePlayback(bool once){playing_=false;loopPlayback_={};playbackTagCycle_.clear();if(playbackReturnToStart_&&!playbackStartFrame_.empty()){const auto& frames=document.timeline().state().frames;if(std::any_of(frames.begin(),frames.end(),[this](const auto& f){return f.id==playbackStartFrame_;}))document.selectFrame(playbackStartFrame_);}else if(once){const auto& frames=document.timeline().state().frames;const auto first=std::find_if(frames.begin(),frames.end(),[](const auto& f){return !f.disabled;});if(first!=frames.end())document.selectFrame(first->id);}playbackStartFrame_.clear();}
  void setPlaybackLoopMode(bool loop){playbackSessionMode_=loop?"all":"once";savedPlaybackMode_=playbackSessionMode_;savePlaybackPreferences();playbackTagMode_=false;playbackTagCycle_.clear();loopPlayback_={};document.setAnimationLoop(loop);if(playing_){playbackIdentity_=document.identity();playbackRevision_=document.revision();}refresh();}
  void playOnceMode(){setPlaybackLoopMode(false);}
  void showPlaybackMenu(){PixelMenu menu(skin_);auto toggle=new PixelMenuItem(font_,skin_,playing_?U"暂停":U"播放");toggle->iconSkin=&toolIcons_;toggle->icon=playing_?"playback-pause":"playback-play";toggle->Click.connect([this]{togglePlayback();});menu.addChild(toggle);menu.addChild(new PixelMenuSeparator(skin_));const double rates[]{.25,.5,1,1.5,2,3};const char32_t* labels[]{U"0.25×",U"0.5×",U"1×",U"1.5×",U"2×",U"3×"};for(int i=0;i<6;++i){auto item=new PixelMenuItem(font_,skin_,labels[i]);item->checked=[this,rate=rates[i]]{return playbackRate_==rate;};item->Click.connect([this,rate=rates[i]]{setPlaybackRate(rate);});menu.addChild(item);}menu.addChild(new PixelMenuSeparator(skin_));{auto item=new PixelMenuItem(font_,skin_,U"播放一次");item->checked=[this]{return playbackSessionMode_=="once";};item->Click.connect([this]{playOnceMode();});menu.addChild(item);}{auto item=new PixelMenuItem(font_,skin_,U"循环全部");item->checked=[this]{return playbackSessionMode_=="all";};item->Click.connect([this]{setPlaybackLoopMode(true);});menu.addChild(item);}{auto item=new PixelMenuItem(font_,skin_,U"循环当前段");item->checked=[this]{return playbackTagMode_;};item->Click.connect([this]{setPlaybackTagMode();});menu.addChild(item);}auto back=new PixelMenuItem(font_,skin_,U"播放完成后返回起点");back->checked=[this]{return playbackReturnToStart_;};back->Click.connect([this]{playbackReturnToStart_=!playbackReturnToStart_;savePlaybackPreferences();refresh();});menu.addChild(back);const auto at=timelineInactive_[2]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}
  const timeline::LoopSection* playbackSection(const std::string& id)const{for(const auto& section:document.timeline().state().loopSections)if(section.id==id)return &section;return nullptr;}
  bool playbackSectionContains(const timeline::LoopSection& section,const std::string& frame)const{const auto& state=document.timeline().state();const auto range=timeline::loopRange(state,section);for(int i=range.start;i>=0 && i<=range.end;++i)if(state.frames[i].id==frame)return true;return false;}
  bool installPlaybackSection(const timeline::LoopSection& section,bool seek){const auto sequence=timeline::loopPlaybackFrames(document.timeline().state(),section);if(sequence.empty())return false;loopPlayback_={{section.id,0,{}},{},!section.repeatCount};if(seek)document.selectFrame(sequence.front());playbackObservedFrame_=document.frame().id;return true;}
  std::string nextTagFrame(const std::string& frame)const{const auto& frames=document.timeline().state().frames;int at=-1;for(int i=0;i<int(frames.size());++i)if(frames[i].id==frame)at=i;for(int n=1;n<=int(frames.size());++n){const auto& next=frames[(at+n)%frames.size()];if(!next.disabled)return next.id;}return {};}
  void setPlaybackTagMode(){savedPlaybackMode_="tag";savePlaybackPreferences();playbackSessionMode_="tag";if(playbackTagMode_ && (!playing_ || loopPlayback_.repeatIndefinitely))return;playbackTagMode_=true;if(playing_){loopPlayback_={};playbackTagCycle_.clear();const auto* section=timeline::loopAtFrame(document.timeline().state(),document.frame().id);if(!section || !installPlaybackSection(*section,true))playing_=false;else if(section->repeatCount)playbackTagCycle_=section->id;}playbackObservedFrame_=document.frame().id;refresh();}
  void retargetTagPlayback(){if(!playing_ || !playbackTagMode_)return;loopPlayback_={};playbackTagCycle_.clear();const auto* section=timeline::loopAtFrame(document.timeline().state(),document.frame().id);if(section)installPlaybackSection(*section,false);playbackObservedFrame_=document.frame().id;}
  bool continueTagPlayback(const std::string& next){if(next.empty())return false;const auto* cycle=playbackSection(playbackTagCycle_);if(!playbackTagCycle_.empty() && !cycle)return false;if(cycle && playbackSectionContains(*cycle,next))return installPlaybackSection(*cycle,true);if(cycle){const auto* section=timeline::loopAtFrame(document.timeline().state(),next);if(section && section->repeatCount)return installPlaybackSection(*section,true);loopPlayback_={};}document.selectFrame(next);return true;}
  void startLoopPlayback(const std::string& id){cancelStroke();playbackStartFrame_=document.frame().id;const auto& state=document.timeline().state();const auto it=std::find_if(state.loopSections.begin(),state.loopSections.end(),[&](const auto& section){return section.id==id;});if(it==state.loopSections.end())return;const auto sequence=timeline::loopPlaybackFrames(state,*it);if(sequence.empty())return;loopPlayback_={{id,0,{}},{},!it->repeatCount};playbackTagCycle_=playbackTagMode_ && it->repeatCount?id:std::string{};document.clearTimelineSelection();clearTimelineRowSelection();document.clearFrameSelection();frameSelectionExplicit_=false;document.selectFrame(sequence.front());playbackObservedFrame_=document.frame().id;playing_=true;playbackIdentity_=document.identity();playbackRevision_=document.revision();playbackDue_=std::chrono::steady_clock::now()+playbackFrameDelay();refresh();}
  void updateFramesDisabled(bool disabled){
    if(!document.setSelectedFramesDisabled(disabled)){refresh();return;}
    if(playing_){playbackRevision_=document.revision();if(nextTagFrame(document.frame().id).empty()){playing_=false;loopPlayback_={};playbackTagCycle_.clear();}else if(document.frame().disabled){playbackDue_=std::chrono::steady_clock::now();playbackTick();}}
    refresh();
  }
  void togglePlayback(){const bool next=!playing_;cancelStroke();playing_=next;if(playing_ && nextTagFrame(document.frame().id).empty()){playing_=false;loopPlayback_={};playbackTagCycle_.clear();}if(playing_){const bool paused=!loopPlayback_.current.sectionId.empty() && playbackIdentity_==document.identity() && playbackRevision_==document.revision() && playbackSection(loopPlayback_.current.sectionId) && playbackSectionContains(*playbackSection(loopPlayback_.current.sectionId),document.frame().id);if(!paused){playbackStartFrame_=document.frame().id;loopPlayback_={};playbackTagCycle_.clear();if(playbackTagMode_){const auto* section=timeline::loopAtFrame(document.timeline().state(),document.frame().id);if(section){if(!installPlaybackSection(*section,true))playing_=false;else if(section->repeatCount)playbackTagCycle_=section->id;}else if(document.frame().disabled){const auto nextFrame=nextTagFrame(document.frame().id);if(nextFrame.empty())playing_=false;else document.selectFrame(nextFrame);}}else{const auto& frames=document.timeline().state().frames;auto first=std::find_if(frames.begin(),frames.end(),[](const auto& f){return !f.disabled;});if(first==frames.end())playing_=false;else if(playbackSessionMode_=="once")document.selectFrame(first->id);else if(document.frame().disabled)document.selectFrame(nextTagFrame(document.frame().id));}}document.clearTimelineSelection();clearTimelineRowSelection();document.clearFrameSelection();frameSelectionExplicit_=false;playbackIdentity_=document.identity();playbackRevision_=document.revision();playbackDue_=std::chrono::steady_clock::now()+playbackFrameDelay();}playbackObservedFrame_=document.frame().id;refresh();}
  void playbackTick(){if(!playing_)return;if(pending_!=Pending::None || document.active() || playbackIdentity_!=document.identity() || playbackRevision_!=document.revision()){playing_=false;loopPlayback_={};playbackTagCycle_.clear();refresh();return;}const auto now=std::chrono::steady_clock::now();bool moved=false;int count=0;while(now>=playbackDue_ && playing_ && ++count<=10000){if(!loopPlayback_.current.sectionId.empty()){const auto* section=playbackSection(loopPlayback_.current.sectionId);const auto end=section?section->endFrameId:std::string{};const bool finite=section && section->repeatCount && !loopPlayback_.repeatIndefinitely;const auto step=timeline::advanceLoopPlayback(document.timeline().state(),loopPlayback_,document.frame().id);if(step.completed){if(!section){playing_=false;break;}if(playbackTagMode_ && finite){if(!continueTagPlayback(nextTagFrame(end))){playing_=false;break;}}else{completePlayback(false);moved=true;break;}}else document.selectFrame(step.frameId);}else if(playbackTagMode_){if(!continueTagPlayback(nextTagFrame(document.frame().id))){playing_=false;break;}}else{const auto& frames=document.timeline().state().frames;auto index=document.activeFrameIndex()+1;while(index<frames.size() && frames[index].disabled)++index;if(index==frames.size()){if(playbackSessionMode_=="once"){completePlayback(true);moved=true;break;}index=0;while(index<frames.size() && frames[index].disabled)++index;}if(index==frames.size()){playing_=false;break;}document.selectFrame(frames[index].id);}playbackObservedFrame_=document.frame().id;playbackDue_+=playbackFrameDelay();moved=true;}if(moved)refresh();}
  void openLoopEditor(const std::string& id={}){playing_=false;cancelStroke();timeline::LoopSection draft;const auto& state=document.timeline().state();if(!id.empty()){const auto it=std::find_if(state.loopSections.begin(),state.loopSections.end(),[&](const auto& section){return section.id==id;});if(it==state.loopSections.end())return;draft=*it;}else{int n=1;for(;;++n){draft.name=U"循环节 "+unicodeText(std::to_string(n));if(std::none_of(state.loopSections.begin(),state.loopSections.end(),[&](const auto& section){return section.name==draft.name;}))break;}auto selected=document.selectedFrames();if(selected.empty())selected={document.frame().id};int left=int(state.frames.size()),right=0;for(int i=0;i<int(state.frames.size());++i)if(std::find(selected.begin(),selected.end(),state.frames[i].id)!=selected.end()){left=std::min(left,i);right=i;}draft.startFrameId=state.frames[left].id;draft.endFrameId=state.frames[right].id;}loopDraft_=draft;const auto range=timeline::loopRange(state,draft);loopInputs_[0]->setText(utf8Text(draft.name));loopInputs_[1]->setText(std::to_string(range.start+1));loopInputs_[2]->setText(std::to_string(range.end+1));loopInputs_[3]->setText(draft.repeatCount?std::to_string(*draft.repeatCount):"");updateLoopDirection();pending_=Pending::LoopSection;for(auto input:loopInputs_)input->setVisible(true);loopDirection_->setVisible(true);menuBar_->setEnabled(false);discard_->caption=U"保存";discard_->setVisible(true);keep_->caption=U"取消";keep_->setVisible(true);dialogClose_->setVisible(true);refresh();loopInputs_[0]->requestFocus();loopInputs_[0]->selectAllText();}
  void updateLoopDirection(){const char* directions[]{"forward","reverse","ping-pong","ping-pong-reverse"};for(int i=0;i<4;++i)if(loopDraft_->direction==directions[i])static_cast<PixelDropdown*>(loopDirection_)->setSelectedIndex(i);}
  bool commitLoopEditor(){try{auto draft=*loopDraft_;auto integer=[&](int index,int limit){const auto text=loopInputs_[index]->text();std::size_t used=0;const double raw=std::stod(text,&used);if(used!=text.size() || !std::isfinite(raw))throw std::invalid_argument("Loop field");return int(std::trunc(std::clamp(raw,1.0,double(limit))));};const int count=int(document.timeline().state().frames.size());int start=integer(1,count)-1,end=integer(2,count)-1;if(start>end)std::swap(start,end);draft.startFrameId=document.timeline().state().frames[start].id;draft.endFrameId=document.timeline().state().frames[end].id;draft.name=unicodeText(loopInputs_[0]->text());const auto first=draft.name.find_first_not_of(U" \t\r\n"),last=draft.name.find_last_not_of(U" \t\r\n");if(first==std::u32string::npos)draft.name=U"循环节 1";else {draft.name=draft.name.substr(first,last-first+1);if(draft.name.size()>64)draft.name.resize(64);}draft.repeatCount=loopInputs_[3]->text().empty()?std::optional<int>{}:std::optional<int>{integer(3,9999)};if(!draft.id.empty()){const auto* existing=playbackSection(draft.id);if(existing && existing->name==draft.name && existing->startFrameId==draft.startFrameId && existing->endFrameId==draft.endFrameId && existing->direction==draft.direction && existing->repeatCount==draft.repeatCount)return true;}if(draft.id.empty())document.createLoopSection(draft);else document.updateLoopSection(draft);loopPlayback_={};return true;}catch(const std::exception&){status_=U"循环节帧范围或重复次数无效";invalidate();return false;}}
  void openFramePropertiesFor(std::size_t index){if(pending_!=Pending::None || index>=document.timeline().state().frames.size())return;const auto id=document.timeline().state().frames[index].id;if(timelineGesture_.kind)finishTimelineGesture();document.selectFrame(id);showFrameDuration();}
  void showFrameDuration() {playing_=false;cancelStroke();document.beginFrameDuration();pending_=Pending::FrameDuration;paletteInput_->setText(std::to_string(document.frame().duration));paletteInput_->suffix=U"ms";menuBar_->setEnabled(false);discard_->setVisible(false);keep_->caption=U"关闭";keep_->setVisible(true);dialogClose_->setVisible(true);paletteInput_->setVisible(true);refresh();paletteInput_->requestFocus();paletteInput_->selectAllText();}
  void saveOnionSettings(){if(smoke_)return;try{const auto path=palettePreferencePath().parent_path()/"onion-skin.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out<<onion_.enabled<<' '<<onion_.allLayers<<' '<<onion_.showDuringPlayback<<' '<<onion_.previousFrames<<' '<<onion_.nextFrames<<' '<<onion_.previousOpacity<<' '<<onion_.nextOpacity<<' '<<onion_.previousColor<<' '<<onion_.nextColor;out.close();if(!out)throw std::runtime_error("Cannot save onion skin preferences");}catch(const std::exception& e){status_=U"洋葱皮偏好保存失败："+unicodeText(e.what());}refresh();}
  void toggleOnion(){onion_.enabled=!onion_.enabled;saveOnionSettings();refresh();}
  void openOnionValue(int field){onionField_=field;pending_=Pending::OnionValue;const bool color=field>=4;int values[]{onion_.previousFrames,onion_.nextFrames,onion_.previousOpacity,onion_.nextOpacity};paletteInput_->setText(color?paletteHex(field==4?onion_.previousColor:onion_.nextColor):std::to_string(values[field]));paletteInput_->suffix=field<2?U"帧":field<4?U"%":U"";keep_->caption=U"关闭";keep_->setVisible(true);dialogClose_->setVisible(true);discard_->setVisible(false);paletteInput_->setVisible(true);menuBar_->setEnabled(false);refresh();paletteInput_->requestFocus();paletteInput_->selectAllText();}
  void previewOnionValue(){try{auto value=paletteInput_->text();if(onionField_<4){std::size_t used=0;int next=std::stoi(value,&used);if(used!=value.size())return;int* target=onionField_==0?&onion_.previousFrames:onionField_==1?&onion_.nextFrames:onionField_==2?&onion_.previousOpacity:&onion_.nextOpacity;*target=std::clamp(next,0,onionField_<2?8:100);}else{if(value.size() && value[0]=='#')value.erase(0,1);if(value.size()!=6 && value.size()!=8)return;Pixel next=0xff000000;for(std::size_t i=0;i<value.size()/2;++i){std::size_t used=0;auto byte=std::stoul(value.substr(i*2,2),&used,16);if(used!=2)return;next=(next&~(255u<<(i*8)))|Pixel(byte)<<(i*8);} (onionField_==4?onion_.previousColor:onion_.nextColor)=next;}invalidate();}catch(const std::exception&){} }
  void showOnionMenu(){PixelMenu menu(skin_);auto item=[&](const char32_t* caption,std::function<void()> action,std::function<bool()> checked={}){auto b=new PixelMenuItem(font_,skin_,caption);b->Click.connect(action);b->checked=checked;menu.addChild(b);};item(U"显示洋葱皮",[this]{toggleOnion();},[this]{return onion_.enabled;});item(U"当前图层",[this]{onion_.allLayers=false;saveOnionSettings();},[this]{return !onion_.allLayers;});item(U"所有图层",[this]{onion_.allLayers=true;saveOnionSettings();},[this]{return onion_.allLayers;});item(U"播放时显示",[this]{onion_.showDuringPlayback=!onion_.showDuringPlayback;saveOnionSettings();},[this]{return onion_.showDuringPlayback;});const char32_t* names[]{U"前面帧数",U"后面帧数",U"前面不透明度",U"后面不透明度",U"前面颜色",U"后面颜色"};for(int i=0;i<6;++i)item(names[i],[this,i]{openOnionValue(i);});menu.showPopup(pointerMenuPosition(ui::get_mouse_position()),display());}
  std::vector<std::string> contextLayerTargets_;
  std::uint64_t contextLayerIdentity_=0;
  std::string contextFrameId_;
  std::string contextCelId_;
  std::uint64_t contextCelIdentity_=0;
  enum class Column { Palette, Color, Layers, Preview };
  void clipColumn(ui::Graphics& g,int id,bool physical)const {
    if(!docking_.custom)return;const auto geometry=columnGeometry(uiLogical(bounds()));gfx::Region clip(g.getClipBounds());const int own=id<0?-1:docking_.groupOf(id);
    for(int other=0;other<4;++other){if(!geometry.shown[other] || other==id)continue;const int group=docking_.groupOf(other);if(docking_.groups[group].dock!=panels::Dock::Floating)continue;
      if(group==own)continue;
      if(own>=0 && docking_.groups[own].dock==panels::Dock::Floating && (groupFocus(other)<groupFocus(id) || (groupFocus(other)==groupFocus(id) && group<own)))continue;
      auto r=geometry.panel[other];gfx::Rect box(r.x,r.y,r.w,r.h);clip-=gfx::Region(uiPhysical(box));}
    g.clipRegion(clip);
  }
  bool columnFloating(int id)const{return (docking_.custom || id==3) && docking_.groups[docking_.groupOf(id)].dock==panels::Dock::Floating;}
  int columnFrameTop(int id)const{int count=0;for(int tab:docking_.groups[docking_.groupOf(id)].tabs)count+=columnVisibility()[tab];return count>1?Layout::tabHeight-Layout::frame:0;}
  gfx::Rect columnFrame(int id)const{auto r=columnGeometry(uiLogical(bounds())).panel[id];const int top=columnFrameTop(id);return {r.x,r.y+top,r.w,r.h-top};}
  int topFloatingColumnAt(gfx::Point point)const{
    if(!docking_.custom)return previewPanel_ && columnShown(3) && previewPanel_->bounds().contains(point)?3:-1;const auto geometry=columnGeometry(uiLogical(bounds()));
    int top=-1;std::uint64_t rank=0;
    for(const auto& group:docking_.groups){if(group.dock!=panels::Dock::Floating)continue;for(int id:group.tabs)if(geometry.shown[id]){const auto r=geometry.panel[id];const auto focus=groupFocus(id);if(toDisplay(gfx::Rect(r.x,r.y,r.w,r.h)).contains(point) && (top<0 || focus>=rank)){top=id;rank=focus;}}}
    return top;
  }
  std::uint64_t groupFocus(int id)const{std::uint64_t rank=0;for(int tab:docking_.groups[docking_.groupOf(id)].tabs)rank=std::max(rank,floatingFocus_[tab]);return rank;}
  void focusOverlayAt(gfx::Point point){
    const int id=topFloatingColumnAt(point);const bool dialog=pending_!=Pending::None && dialogDisplayBounds().contains(point);
    if(dialog){dialogFocus_=++overlayClock_;raiseDockWidgets();invalidate();return;}
    if(pending_==Pending::None && id>=0){for(int tab:docking_.groups[docking_.groupOf(id)].tabs)floatingFocus_[tab]=++overlayClock_;raiseFloatingAt(point);raiseDockWidgets();invalidate();}
  }
  int widgetColumn(ui::Widget* w)const{
    for(int id=0;id<4;++id)if(w==dockingTabs_[id] || w==columnClose_[id] || w==floatingSurfaces_[id])return id;
    // Focus notifications are queued; a temporary popup may already be gone.
    // Identify only registered column widgets without dereferencing the target.
    if(w==timelineHorizontal_ || w==timelineVertical_)return 2;
    if(w==previewPanel_)return 3;
    if(w==colorPicker_ || w==pickerPrimary_ || w==pickerSecondary_ || w==pickerAdd_)return 1;
    for(auto b:recentButtons_)if(w==b)return 1;
    if(w==paletteScrollBar_ || w==paletteSelectionOverlay_ || w==paletteActions_ || w==paletteLibrary_ || w==paletteLock_ || w==primaryRole_ || w==secondaryRole_)return 0;
    for(auto b:swatches_)if(w==b)return 0;
    for(const auto* list:{&layerRows_,&layerEyes_,&layerLocks_,&layerAutoLinks_,&frameHeaders_,&frameCells_,&timelineInactive_})for(auto b:*list)if(w==b)return 2;
    if(w==layerProperties_)return 2;return -1;
  }
  bool floatingChrome(ui::Widget* w)const{for(int id=0;id<4;++id)if(columnFloating(id) && (w==dockingTabs_[id] || w==columnClose_[id] || (id==3 && w==previewPanel_)))return true;return false;}
  void raiseFloatingAt(gfx::Point point){
    if(!docking_.custom)return;const auto geometry=columnGeometry(uiLogical(bounds()));
    for(int i=int(docking_.groups.size())-1;i>=0;--i){auto& group=docking_.groups[i];if(group.dock!=panels::Dock::Floating)continue;int active=-1;for(int tab:group.tabs)if(geometry.shown[tab])active=tab;if(active<0)continue;auto r=geometry.panel[active];if(!uiPhysical(gfx::Rect(r.x,r.y,r.w,r.h)).offset(bounds().origin()).contains(point))continue;
      if(i!=int(docking_.groups.size())-1){auto moved=group;docking_.groups.erase(docking_.groups.begin()+i);docking_.groups.push_back(std::move(moved));refresh();}break;
    }
  }
  void raiseDockWidgets() {
    const auto geometry=columnGeometry(uiLogical(bounds()));
    for(int id=0;id<4;++id)if(auto surface=floatingSurfaces_[id]){const bool show=(columnFloating(id) || (docking_.custom && columnFrameTop(id)>0))&&columnShown(id)&&id!=3;surface->setVisible(show);if(show){const auto r=geometry.panel[id];auto frame=columnFrame(id);frame.h=Layout::frame;const auto next=toDisplay(columnFloating(id)?gfx::Rect(r.x,r.y,r.w,r.h):frame);if(surface->bounds()!=next)surface->setBounds(next);}}
    if(stackedPending_!=pending_){stackedPending_=pending_;if(pending_!=Pending::None)dialogFocus_=++overlayClock_;}
    if(modalSurface_){modalSurface_->setVisible(pending_!=Pending::None);if(pending_!=Pending::None && modalSurface_->bounds()!=dialogDisplayBounds())modalSurface_->setBounds(dialogDisplayBounds());}
    auto raise=[this](ui::Widget* w){if(w && w->parent()==this)moveChildTo(w,children().back());};
    auto column=[&](int id){
      for(int tab:docking_.groups[docking_.groupOf(id)].tabs)if(tab!=id)raise(dockingTabs_[tab]);
      raise(floatingSurfaces_[id]);
      if(id==0){for(auto w:swatches_)if(!w->active)raise(w);for(auto w:swatches_)if(w->active)raise(w);raise(paletteSelectionOverlay_);raise(paletteScrollBar_);for(auto w:{paletteActions_,paletteLibrary_,paletteLock_,primaryRole_,secondaryRole_})raise(w);}
      if(id==1){raise(colorPicker_);for(auto w:{pickerPrimary_,pickerSecondary_,pickerAdd_})raise(w);for(auto w:recentButtons_)raise(w);}
      if(id==2){for(const auto* list:{&layerRows_,&layerEyes_,&layerLocks_,&layerAutoLinks_,&frameHeaders_,&frameCells_,&timelineInactive_})for(auto w:*list)raise(w);raise(layerProperties_);raise(timelineHorizontal_);raise(timelineVertical_);}
      if(id==3)raise(previewPanel_);
      raise(dockingTabs_[id]);if(columnFloating(id))raise(columnClose_[id]);
    };
    const auto visibility=columnVisibility();std::vector<int> overlays;
    for(const auto& group:docking_.groups)for(int id:group.tabs)if(docking_.shown(id,visibility)){if(group.dock==panels::Dock::Floating && (docking_.custom || id==3))overlays.push_back(id);else column(id);}
    if(pending_!=Pending::None)overlays.push_back(-1);
    std::stable_sort(overlays.begin(),overlays.end(),[this](int a,int b){if(a<0)return false;if(b<0)return true;return groupFocus(a)<groupFocus(b);});
    for(int id:overlays){if(id>=0)column(id);else{raise(modalSurface_);const auto controls=children();for(auto child:controls)if(modalControl(child))raise(child);}}
    if(dockFeedback_ && !dockFeedback_->hasFlags(ui::HIDDEN))raise(dockFeedback_);
  }
  void beginPanelGesture(int id,const ui::MouseMessage& mouse,int edges=0,bool wholeGroup=false) {
    if(pending_!=Pending::None || (pending_==Pending::None && document.active()) || timelineGesture_.kind || panelGesture_.id>=0)return;
    if(mouse.right()){showColumnContextMenu(Column(id));return;}if(!mouse.left())return;
    pendingPanelPointer_.reset();auto& d=panelGesture_;d={};d.id=id;d.edges=edges;d.wholeGroup=wholeGroup || edges || columnFloating(id);d.origin=d.pointer=mouse.position();d.before=docking_;d.tabStart=dockingTabs_[id]->bounds();d.start=columnGeometry(uiLogical(bounds())).panel[id];
    manager()->setCapture(this,true);requestFocus();panelDockTimer_.start();
  }
  void finishPanelGesture(bool cancel=false) {
    if(panelGesture_.id<0)return;if(!cancel)flushDockPointer();else pendingPanelPointer_.reset();const auto d=panelGesture_;panelGesture_={};panelDockTimer_.stop();if(hasCapture())releaseMouse();
    if(cancel)docking_=d.before;
    else if(!d.moved)docking_.select(d.id);
    else if(!d.edges && d.before.groups[d.before.groupOf(d.id)].dock!=panels::Dock::Floating && (d.confirmed.group>=0 || d.confirmed.dock!=panels::Dock::Floating)){
      initializeDocking();if(d.wholeGroup)docking_.placeGroup(d.id,d.confirmed.dock,d.confirmed.group,d.confirmed.after,d.confirmed.merge,d.start,d.confirmed.tabIndex);else docking_.place(d.id,d.confirmed.dock,d.confirmed.group,d.confirmed.after,d.confirmed.merge,d.start,d.confirmed.tabIndex);
    }else if(d.moved && !d.edges && (d.before.groups[d.before.groupOf(d.id)].dock!=panels::Dock::Floating || (!d.wholeGroup && d.before.groups[d.before.groupOf(d.id)].tabs.size()>1))){docking_=d.before;}

    if(!cancel && d.moved && docking_.groups[docking_.groupOf(d.id)].dock==panels::Dock::Floating)docking_.groups[docking_.groupOf(d.id)].floatingArea=floatingArea(uiLogical(bounds()));
    if(dockFeedback_)dockFeedback_->setVisible(false);
    const bool geometryOnly=d.moved && (d.edges || d.before.groups[d.before.groupOf(d.id)].dock==panels::Dock::Floating);
    if(cancel || !geometryOnly)refresh();if(!cancel)saveWorkspaceSizes();updateNavigationCursor();
  }
  void tickPanelGesture() {
    flushDockPointer();
    auto& d=panelGesture_;if(d.id<0)return;if(!hasCapture()){finishPanelGesture(true);return;}
    if(!d.moved)return;
    if(!d.edges && !(d.confirmed==d.candidate) && (d.candidate.group>=0 || d.candidate.dock!=panels::Dock::Floating) && std::chrono::steady_clock::now()>=d.due){const auto previous=dockFeedbackBounds();d.confirmed=d.candidate;if(dockFeedback_)dockFeedback_->invalidateRect(previous|dockFeedbackBounds());}
  }
  gfx::Rect dockGhostRect()const{
    const auto& d=panelGesture_;if(d.id<0)return {};
    const auto pointer=uiLocalPoint(d.pointer,bounds().origin());
    const int width=font_.inkBounds(dockingTabs_[d.id]->caption).w+10;
    return {pointer.x-width/2,pointer.y+uiGap,width,Layout::tabHeight};
  }
  gfx::Rect dockFeedbackBounds()const{
    const auto& d=panelGesture_;if(d.id<0 || !d.moved)return {};
    auto ghost=toDisplay(dockGhostRect());
    if(d.confirmed.group>=0 || d.confirmed.dock!=panels::Dock::Floating){auto r=d.confirmed.preview;ghost|=toDisplay(gfx::Rect(r.x,r.y,r.w,r.h));}
    return ghost;
  }
  void flushDockPointer(){if(!pendingPanelPointer_)return;const auto pointer=*pendingPanelPointer_;pendingPanelPointer_.reset();if(panelGesture_.id>=0 && hasCapture())updatePanelGesture(pointer);}
  void moveFloatingWidgets(int id,gfx::Point delta){
    if(delta==gfx::Point())return;
    std::vector<ui::Widget*> widgets;gfx::Region oldDrawable;bool clean=true;
    const int group=docking_.groupOf(id);
    auto add=[&](ui::Widget* child){if(child && child->parent()==this && !child->hasFlags(ui::HIDDEN))widgets.push_back(child);};
    for(int column:docking_.groups[group].tabs){
      add(dockingTabs_[column]);add(floatingSurfaces_[column]);add(columnClose_[column]);
      if(column==0){add(paletteSelectionOverlay_);add(paletteScrollBar_);for(auto w:swatches_)add(w);for(auto w:{paletteActions_,paletteLibrary_,paletteLock_,primaryRole_,secondaryRole_})add(w);}
      if(column==1){add(colorPicker_);for(auto w:{pickerPrimary_,pickerSecondary_,pickerAdd_})add(w);for(auto w:recentButtons_)add(w);}
      if(column==2){for(const auto* list:{&layerRows_,&layerEyes_,&layerLocks_,&layerAutoLinks_,&frameHeaders_,&frameCells_,&timelineInactive_})for(auto w:*list)add(w);add(layerProperties_);}
      if(column==2){add(timelineHorizontal_);add(timelineVertical_);}
      if(column==3)add(previewPanel_);
    }
    auto visibleRegion=[&]{gfx::Region result;
      for(auto child:widgets){gfx::Region drawable;child->getDrawableRegion(drawable,ui::Widget::kCutTopWindowsAndUseChildArea);result|=drawable;}
      // Window::getDrawableRegion cuts windows above it. Our columns are
      // sibling widgets inside one Window, so apply the same occlusion here.
      const auto geometry=columnGeometry(uiLogical(clientBounds()));
      for(int other=0;other<4;++other){if(!geometry.shown[other] || !columnFloating(other))continue;
        const int front=docking_.groupOf(other);if(front==group)continue;
        if(groupFocus(other)<groupFocus(id) || (groupFocus(other)==groupFocus(id) && front<group))continue;
        const auto r=geometry.panel[other];result-=gfx::Region(toDisplay(gfx::Rect(r.x,r.y,r.w,r.h)));
      }
      if(pending_!=Pending::None)result-=gfx::Region(dialogDisplayBounds());
      return result;
    };
    oldDrawable=visibleRegion();for(auto child:widgets)clean&=child->getUpdateRegion().isEmpty();
    if(std::find(widgets.begin(),widgets.end(),previewPanel_)!=widgets.end())clean&=previewPanel_->closeButton()->getUpdateRegion().isEmpty();
    gfx::Region dirty;dirty.createIntersection(oldDrawable,getUpdateRegion());clean&=dirty.isEmpty();
    if(display()){dirty.createIntersection(oldDrawable,display()->getInvalidRegion());clean&=dirty.isEmpty();}
    if(std::find(widgets.begin(),widgets.end(),paletteSelectionOverlay_)!=widgets.end()){paletteSelectionBorder_.offset(delta);for(auto& edge:paletteSelectionEdges_){edge.border.offset(delta);edge.clip.offset(delta);for(auto& piece:edge.pieces)piece.offset(delta);}}
    for(auto child:widgets)child->offsetWidgets(delta.x,delta.y);
    const auto newDrawable=visibleRegion();
    gfx::Region exposed;exposed.createSubtraction(oldDrawable,newDrawable);invalidateRegion(exposed);
    // Aseprite Window::moveWindow: copy only pixels visible at both positions.
    // GPU readback is avoided; dirty/occluded pixels take the repaint path.
    if(clean && display() && !display()->nativeWindow()->gpuAcceleration()){
      auto source=newDrawable;source.offset(-delta.x,-delta.y);gfx::Region reusable;reusable.createIntersection(oldDrawable,source);
      if(!reusable.isEmpty()){ui::move_region(display(),reusable,delta.x,delta.y);++panelBlitMoves_;}
      gfx::Region uncovered;uncovered.createSubtraction(source,reusable);uncovered.offset(delta.x,delta.y);invalidateRegion(uncovered);
    }else invalidateRegion(newDrawable);
    ++panelGeometryUpdates_;
  }
  void layoutGestureColumns(int id,bool all){
    layoutPanelTabs(all?-1:id);if(all || id==0 || id==1)layoutPalette(all?-1:id);if(all || id==2)layoutLayers();
    if(all){layoutDocumentTab();layoutToolOptions();constrainCanvas();}
    raiseDockWidgets();const auto after=columnGeometry(uiLogical(clientBounds()));
    if(all)invalidateRect(toDisplay(gfx::Rect(dockArea(uiLogical(clientBounds())).x,Layout::documentY,dockArea(uiLogical(clientBounds())).w,clientBounds().h/uiScale-Layout::documentY)));
    else {auto r=after.panel[id];invalidateRect(toDisplay(gfx::Rect(r.x,r.y,r.w,r.h)));}
    ++panelGeometryUpdates_;
  }
  void updatePanelGesture(gfx::Point pointer) {
    auto& d=panelGesture_;if(d.id<0)return;const auto previousFeedback=dockFeedbackBounds();d.pointer=pointer;const auto delta=pointer-d.origin;
    if(!d.moved && std::hypot(double(delta.x),double(delta.y))<(d.edges?1:8))return;
    d.moved=true;initializeDocking();const auto rc=uiLogical(bounds());
    if(d.edges>=16){const int dx=delta.x/uiScale,dy=delta.y/uiScale;
      if(d.edges==16)docking_.leftWidth=std::clamp(d.before.leftWidth+dx,96,4096);
      else if(d.edges==32)docking_.rightWidth=std::clamp(d.before.rightWidth-dx,96,4096);
      else if(d.edges==64)docking_.bottomShare=std::clamp(double(d.start.h-dy)/std::max(1,dockArea(rc).h),.1,.8);
      else if(d.neighbor>=0){const int own=docking_.groupOf(d.id);const auto geometry=d.before.layout(dockArea(rc),columnVisibility());const auto next=geometry.panel[d.before.groups[d.neighbor].active];
        if(d.edges==128){double total=0;int count=0;for(const auto& group:d.before.groups)if(group.dock==d.before.groups[own].dock){bool visible=false;for(int tab:group.tabs)visible|=columnVisibility()[tab];if(visible){total+=group.weight;++count;}}
          const double change=std::clamp(dy,std::min(0,70-d.start.h),std::max(0,next.h-70))*total/std::max(1,dockArea(rc).h-2*(count-1));docking_.groups[own].weight=d.before.groups[own].weight+change;docking_.groups[d.neighbor].weight=d.before.groups[d.neighbor].weight-change;
        }else{const int change=std::clamp(dx,std::min(0,96-d.start.w),std::max(0,next.w-96));bool ownMain=std::find(d.before.groups[own].tabs.begin(),d.before.groups[own].tabs.end(),2)!=d.before.groups[own].tabs.end();if(ownMain)docking_.groups[d.neighbor].width=std::max(96,next.w-change);else docking_.groups[own].width=std::max(96,d.start.w+change);}
      }
      layoutGestureColumns(d.id,true);return;
    }
    if(d.edges){const auto area=floatingArea(rc);const auto adjusted=resizedPanel(gfx::Rect(d.start.x,d.start.y,d.start.w,d.start.h),gfx::Point(delta.x/uiScale,delta.y/uiScale),d.edges,gfx::Rect(area.x,area.y,area.w,area.h),gfx::Size(96,70));auto& group=docking_.groups[docking_.groupOf(d.id)];const panels::Rect next{adjusted.x,adjusted.y,adjusted.w,adjusted.h};const auto previous=columnGeometry(uiLogical(clientBounds())).panel[d.id];if(previous==next)return;group.floating=next;group.floatingArea=floatingArea(rc);docking_.custom=true;layoutGestureColumns(d.id,false);invalidateRect(toDisplay(gfx::Rect(previous.x,previous.y,previous.w,previous.h)));return;}
    // Floating columns only move. Docking is an explicit context-menu action.
    if(d.before.groups[d.before.groupOf(d.id)].dock==panels::Dock::Floating){
      d.candidate={};d.confirmed={};auto& group=docking_.groups[docking_.groupOf(d.id)];
      const auto previous=columnGeometry(uiLogical(clientBounds())).panel[d.id];
      const panels::Rect next{d.start.x+delta.x/uiScale,d.start.y+delta.y/uiScale,d.start.w,d.start.h};group.floating=next;group.floatingArea=floatingArea(rc);docking_.custom=true;
      const auto positioned=columnGeometry(uiLogical(clientBounds())).panel[d.id];group.floating=positioned;
      const gfx::Point movement((positioned.x-previous.x)*uiScale,(positioned.y-previous.y)*uiScale);
      if(dockFeedback_)dockFeedback_->setVisible(false);moveFloatingWidgets(d.id,movement);return;
    }
    // Preview is evaluated against the unchanged dock layout, never the dragged one.
    auto reference=d.before;if(!reference.custom){reference=docking_;reference.custom=true;}
    auto geometry=d.before.custom?reference.layout(dockArea(rc),columnVisibility(),Layout::gap,floatingArea(rc)):columnGeometry(rc);const auto local=uiLocalPoint(pointer,bounds().origin());const int px=local.x,py=local.y;
    auto next=reference.targetAt(px,py,d.id,geometry,dockArea(rc),(d.candidate.group>=0 || d.candidate.dock!=panels::Dock::Floating)?&d.candidate:nullptr);
    if(d.wholeGroup && next.group==reference.groupOf(d.id) && !next.merge)next={};
    if(next.merge && next.group>=0){
      const auto& tabs=reference.groups[next.group].tabs;next.tabIndex=int(tabs.size());
      const auto target=geometry.panel[tabs.front()];int edge=target.x+(tabs.size()==1?5:0);
      for(int index=0;index<int(tabs.size());++index){int tab=tabs[index];if(!columnVisibility()[tab])continue;const int width=font_.inkBounds(dockingTabs_[tab]->caption).w+10;if(px<edge+width/2){next.tabIndex=index;break;}edge+=width-1;}
      next.preview={edge,target.y,std::max(14,font_.inkBounds(dockingTabs_[d.id]->caption).w+10),14};
    }
    if(!(next==d.candidate)){d.candidate=next;d.confirmed={};d.due=std::chrono::steady_clock::now()+std::chrono::milliseconds(100);}
    if(dockFeedback_){dockingTabs_[d.id]->setVisible(false);if(dockFeedback_->bounds()!=bounds())dockFeedback_->setBounds(bounds());dockFeedback_->setVisible(true);if(children().back()!=dockFeedback_)moveChildTo(dockFeedback_,children().back());dockFeedback_->invalidateRect(previousFeedback|dockFeedbackBounds());}
  }
public:
  bool dispatchPanelGesture(ui::Message* msg){return manager()->isWidgetClickable(this) && (processLoopTrack(msg) || processPanelGesture(msg));}
private:
  struct PanelResizeHit {int id=-1,edges=0,neighbor=-1;};
  PanelResizeHit panelResizeAt(gfx::Point point)const{
    if(!docking_.custom || homeOpen_ || pending_!=Pending::None || document.active())return {};
    for(auto close:columnClose_)if(close && close->isVisible() && close->bounds().contains(point))return {};
    const auto geometry=columnGeometry(uiLogical(clientBounds()));
    const int floating=topFloatingColumnAt(point);
    if(floating>=0){const auto r=geometry.panel[floating];return {floating,panelResizeEdges(toDisplay(gfx::Rect(r.x,r.y,r.w,r.h)),point),-1};}
    for(int id=0;id<4;++id){if(!geometry.shown[id])continue;
      const auto r=geometry.panel[id];const int own=docking_.groupOf(id);const auto dock=docking_.groups[own].dock;
      auto contains=[&](gfx::Rect box){return toDisplay(box).contains(point);};
      if(dock==panels::Dock::Left && contains({r.x+r.w-1,r.y,4,r.h}))return {id,16,-1};
      if(dock==panels::Dock::Right && contains({r.x-3,r.y,4,r.h}))return {id,32,-1};
      if(dock==panels::Dock::Bottom && contains({r.x,r.y-3,r.w,4}))return {id,64,-1};
      for(int other=0;other<4;++other){if(!geometry.shown[other])continue;
        const int neighbor=docking_.groupOf(other);if(own==neighbor || docking_.groups[neighbor].dock!=dock)continue;
        const auto n=geometry.panel[other];const bool vertical=dock==panels::Dock::Left || dock==panels::Dock::Right;
        const bool adjacent=vertical?n.y==r.y+r.h+Layout::gap:n.x==r.x+r.w+Layout::gap;
        const auto band=vertical?gfx::Rect(r.x,r.y+r.h-1,r.w,4):gfx::Rect(r.x+r.w-1,r.y,4,r.h);
        if(dock!=panels::Dock::Floating && adjacent && contains(band))return {id,vertical?128:256,neighbor};
      }
    }
    return {};
  }
  static const char* panelResizeHitCursor(int edges){return edges>=16?(edges==16 || edges==32 || edges==256?"ew-resize":"ns-resize"):panelResizeCursor(edges);}
  bool processPanelGesture(ui::Message* msg) {
    if(panelGesture_.id>=0){
      if(msg->type()==ui::kKeyDownMessage){if(static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)finishPanelGesture(true);return true;}
      if(msg->type()==ui::kFocusLeaveMessage && !hasCapture()){finishPanelGesture(true);return false;}
      if(msg->type()==ui::kMouseMoveMessage){pendingPanelPointer_=static_cast<ui::MouseMessage*>(msg)->position();return true;}
      if(msg->type()==ui::kMouseUpMessage){updatePanelGesture(static_cast<ui::MouseMessage*>(msg)->position());tickPanelGesture();
        finishPanelGesture();return true;}
    }
    if(msg->type()!=ui::kMouseDownMessage || homeOpen_)return false;
    const auto mouse=static_cast<ui::MouseMessage*>(msg);focusOverlayAt(mouse->position());
    if(pending_!=Pending::None)return false;
    // A shared dock divider can overlap the next column's title bounds.
    // Preserve its resize route before starting a tab/title move.
    if(!docking_.custom && sizeHandleAt(mouse->position())!=SizeDrag::None)return false;
    raiseFloatingAt(mouse->position());const auto rc=uiLogical(bounds());const auto geometry=columnGeometry(rc);const int floatingHit=topFloatingColumnAt(mouse->position());
    if(mouse->left()){const auto resize=panelResizeAt(mouse->position());if(resize.edges){beginPanelGesture(resize.id,*mouse,resize.edges);panelGesture_.neighbor=resize.neighbor;return true;}}
    for(int id=0;id<4;++id){auto tab=dockingTabs_[id];if(tab && !tab->hasFlags(ui::HIDDEN) && tab->isEnabled() && tab->bounds().contains(mouse->position()) && (floatingHit<0 || docking_.groupOf(id)==docking_.groupOf(floatingHit))){beginPanelGesture(id,*mouse);return true;}}
    for(int id=0;id<4;++id)if(columnClose_[id] && !columnClose_[id]->hasFlags(ui::HIDDEN) && columnShown(id) && (floatingHit<0 || floatingHit==id) && columnClose_[id]->bounds().contains(mouse->position()))return false;
    // The legacy independent preview owns its capture/coalesced move path.
    // Managed docked previews use the shared tab dispatcher above.
    if(!docking_.custom && previewPanel_ && columnShown(3) && previewPanel_->bounds().contains(mouse->position()))return false;
    for(int id=3;id>=0;--id){if(!geometry.shown[id] || (floatingHit>=0 && id!=floatingHit))continue;auto r=geometry.panel[id];const auto physical=toDisplay(gfx::Rect(r.x,r.y,r.w,r.h));
      if(toDisplay(gfx::Rect(r.x,r.y,r.w,16)).contains(mouse->position())){beginPanelGesture(id,*mouse,0,true);return true;}
    }
    return false;
  }
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
    const int current=int(docking_.groups[docking_.groupOf(int(column))].dock);
    for(int i=0;i<4;++i)add(docks[i],i==current?"check":"move",[this,column,i]{dockColumn(int(column),panels::Dock(i));});
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
    add(menu,U"新建图层","plus",U"Shift+N",[this]{createLayer();},true);
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
    add(menu,U"复制所选对象","copy",U"",[this]{document.duplicateSelectedLayers();},document.canDuplicateSelectedLayers());
    add(menu,U"创建关联图层","linkedLayer",U"");
      {auto submenu=branch(menu,U"转换为","convertTo");
    add(submenu,U"转换为背景图层","image",U"");
    add(submenu,U"转换为瓦片图层","tilemap",U"");
    add(submenu,U"转换为普通图层","image",U"");
      }
    separator(menu);
    add(menu,U"向下合并","mergeDown",U"",[this]{document.mergeLayerDown();},document.canMergeLayerDown());
    add(menu,U"合并所选图层","mergeDown",U"",[this]{document.mergeSelectedLayers();},document.canMergeSelectedLayers());
    add(menu,U"合并可见图层","mergeVisible",U"",[this]{try{document.mergeVisibleLayers();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},true);
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
    add(menu,U"属性","properties",U"",[this,targets=contextLayerTargets_,identity=contextLayerIdentity_]{if(identity==document.identity() && !targets.empty())showLayerOpacity(targets);},contextLayerIdentity_==document.identity() && !contextLayerTargets_.empty());
    add(menu,U"删除","delete",U"Delete",[this]{document.deleteSelectedLayers();},document.canDeleteSelectedLayers());
      return;
    }
    if(kind==2){
    add(menu,U"创建循环节","link",U"",[this]{openLoopEditor();});
    add(menu,U"生成补间帧","plus",U"");
    add(menu,U"帧属性","info",U"",[this]{showFrameDuration();},true);
    const bool allDisabled=document.selectedFramesDisabled();
    add(menu,allDisabled?U"启用帧":U"停用帧",allDisabled?"eye":"eyeOff",U"",[this,allDisabled]{updateFramesDisabled(!allDisabled);},true);
    separator(menu);
    add(menu,U"复制帧","copy",U"Ctrl+C",[this]{copyTimelineFrames();},true);
    add(menu,U"粘贴帧","paste",U"Ctrl+V",[this]{pasteTimelineFrames();},hasApplicationFrameClipboard());
    add(menu,U"反转帧顺序","swap",U"",[this]{document.reverseSelectedFrames();refresh();},document.canReverseSelectedFrames());
    separator(menu);
    add(menu,U"新增帧","copy",U"Alt+N",[this]{frameAction(1);},true);
    add(menu,U"新建空白帧","paste",U"Alt+B",[this]{frameAction(0);},true);
    add(menu,U"删除当前帧","delete",U"Alt+C",[this]{deleteTimelineItems();},document.timeline().state().frames.size()>1);
      return;
    }
    add(menu,U"生成补间帧","plus",U"");
    add(menu,U"新建图层蒙版","layerMask",U"");
    separator(menu);
    add(menu,U"粘贴图层蒙版单元格","paste",U"");
    separator(menu);
    add(menu,U"单元格属性","info",U"");
    separator(menu);
    add(menu,U"复制单元格","copy",U"Ctrl+C",[this]{copyTimelineCels();},true);
    add(menu,U"粘贴单元格","paste",U"Ctrl+V",[this]{pasteTimelineCels();},hasApplicationCelClipboard() && (applicationCelSelectionOnly() || !document.selection()));
    add(menu,U"反转单元格顺序","swap",U"",[this]{document.reverseSelectedCels();refresh();},document.canReverseSelectedCels());
    add(menu,U"连接单元格","link",U"",[this]{document.connectSelectedCels();refresh();},document.canConnectSelectedCels());
    add(menu,U"断开单元格连接","link",U"",[this]{document.disconnectSelectedCels();refresh();},document.canDisconnectSelectedCels());
    const auto* contextCel=contextCelIdentity_==document.identity()?document.timeline().findCelById(contextCelId_):nullptr;
    add(menu,U"删除单元格","delete",U"",[this]{deleteTimelineItems();},celHasContent(contextCel?contextCel:&document.cel()));
  }
  void prepareLayerContext(const std::string& id){
    const auto& layers=document.timeline().state().layers;if(std::none_of(layers.begin(),layers.end(),[&](const auto& l){return l.id==id;}))return;
    const auto& selected=document.timelineSelection().layers;if(std::find(selected.begin(),selected.end(),id)==selected.end())document.selectTimelineLayer(id);
    contextLayerTargets_=document.timelineSelection().layers;contextLayerIdentity_=document.identity();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;refresh();
  }
  void prepareCelContext(const std::string& id){
    const auto& selected=document.timelineSelection().cels;
    if(std::find(selected.begin(),selected.end(),id)==selected.end())document.selectTimelineCel(id);
    contextCelId_=id;contextCelIdentity_=document.identity();frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;refresh();
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
    selectedTimelineLayer_.clear();selectedTimelineCelLayer_.clear();selectedTimelineCelFrame_.clear();timelineSelectionGuidesVisible_=true;frameSelectionExplicit_=true;
  }
  void selectTimelineLayer(std::size_t index) {
    document.selectTimelineLayer(document.timeline().state().layers.at(index).id);
    frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;refresh();
  }
  void selectTimelineCel(std::size_t row,std::size_t column) {
    document.selectTimelineCel(document.timeline().findCel(document.timeline().state().layers.at(row).id,document.timeline().state().frames.at(column).id)->id);
    frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;playing_=false;loopPlayback_={};refresh();
  }
  void hideTimelineSelectionGuides() {
    timelineSelectionGuidesVisible_=false;layoutLayers();
    const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,2);
    invalidateRect(uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop,l.workW,l.bottom-l.layerTop)));
  }
  bool clearTimelineSelectionFromBlank(const ui::MouseMessage& mouse) {
    if(pending_!=Pending::None || !columnShown(2) || !documentOpen_ || homeOpen_ || timelineGesture_.kind || (!mouse.left() && !mouse.right()))return false;
    const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,2);const auto point=mouse.position();
    if(!uiPhysical(gfx::Rect(rc.x+l.workX+2,rc.y+l.layerTop+timelineHeaderOffset(),l.workW-4,l.bottom-l.layerTop-timelineHeaderOffset()-2)).contains(point))return false;
    for(auto bar:{timelineHorizontal_,timelineVertical_})if(bar && bar->isVisible() && bar->bounds().contains(point))return false;
    // Legacy useLayerSelectionGuides: only list blank space dismisses selection;
    // row controls, frame headers and cels retain their own gesture handlers.
    for(const auto& buttons:{layerRows_,layerEyes_,layerLocks_,layerAutoLinks_,frameHeaders_,frameCells_})for(auto button:buttons)
      if(button->timelineVisible && button->bounds().contains(point))return false;
    document.clearTimelineSelection();clearTimelineRowSelection();frameSelectionExplicit_=false;
    timelineSelectionGuidesVisible_=true;refresh();
    return mouse.left(); // Right click continues to the create-area menu.
  }
  struct TimelineScrollMetrics {int width=1,height=1;bool horizontal=false,vertical=false;};
  struct LoopTrackDrag {std::string id;int edge=0,start=0,end=0,previewStart=0,previewEnd=0;std::uint64_t identity=0;bool moved=false;gfx::Point pointer;};
  std::optional<LoopTrackDrag> loopTrackDrag_;
  ui::Timer loopTrackTimer_{30,this};
  timeline::LoopSectionLayout loopTrackLayout() const {return timeline::layoutLoopSections(document.timeline().state(),loopTrackDrag_?std::optional<timeline::LoopSectionPreview>{{loopTrackDrag_->id,loopTrackDrag_->previewStart,loopTrackDrag_->previewEnd}}:std::nullopt);}
  int loopTrackHeight() const {return loopTrackLayout().laneCount*20;}
  int timelineHeaderOffset() const {return 37+loopTrackHeight();}
  int timelineRowsOffset() const {return timelineHeaderOffset()+12;}
  gfx::Rect loopTrackViewport() const {const auto l=columnLayout(uiLogical(clientBounds()),2);return toDisplay(gfx::Rect(l.workX+89,l.layerTop+37,timelineScrollMetrics(l).width/uiScale,loopTrackHeight()));}
  gfx::Rect loopTrackItemBounds(const timeline::LoopSectionLayoutItem& item) const {const auto l=columnLayout(uiLogical(clientBounds()),2);return toDisplay(gfx::Rect(l.workX+89+(item.startIndex-frameScroll_)*12,l.layerTop+37+item.lane*20,item.span*12,item.laneSpan*20)).offset(-frameScrollRemainder_,0);}
  struct LoopTrackHit {std::string id;int edge=0;};
  LoopTrackHit loopTrackHit(gfx::Point point) const {if(!documentOpen_ || !columnShown(2) || pending_!=Pending::None || (topFloatingColumnAt(point)>=0 && topFloatingColumnAt(point)!=2) || !loopTrackViewport().contains(point))return {};const auto layout=loopTrackLayout();for(auto it=layout.items.rbegin();it!=layout.items.rend();++it){const auto box=loopTrackItemBounds(*it);if(point.y<box.y || point.y>=box.y2()+uiScale)continue;const int top=box.y+8*uiScale;if(point.y>=top){if(gfx::Rect(box.x-3*uiScale,top,9*uiScale,box.y2()+uiScale-top).contains(point))return {it->id,1};if(gfx::Rect(box.x2()-6*uiScale,top,9*uiScale,box.y2()+uiScale-top).contains(point))return {it->id,2};}if(box.contains(point))return {it->id,0};}return {};}
  void buildLoopTrackMenu(PixelMenu& menu,const std::string& id){auto add=[&](const char32_t* title,const char* icon,std::function<void()> action){auto item=new PixelMenuItem(font_,skin_,title);item->iconSkin=&toolIcons_;item->icon=icon;item->setEnabled(playbackSection(id)!=nullptr);item->Click.connect(action);menu.addChild(item);};add(U"播放循环节","right",[this,id]{startLoopPlayback(id);});add(U"循环节属性","properties",[this,id]{openLoopEditor(id);});menu.addChild(new PixelMenuSeparator(skin_));add(U"删除循环节","delete",[this,id]{document.deleteLoopSection(id);if(loopPlayback_.current.sectionId==id){playing_=false;loopPlayback_={};}refresh();});}
  void finishLoopTrackResize(bool cancel=false){if(!loopTrackDrag_)return;const auto drag=*loopTrackDrag_;loopTrackDrag_.reset();loopTrackTimer_.stop();if(hasCapture())releaseMouse();if(!cancel && drag.identity==document.identity() && drag.moved){if(const auto* current=playbackSection(drag.id)){auto section=*current;if(drag.previewStart!=drag.start || drag.previewEnd!=drag.end){section.startFrameId=document.timeline().state().frames.at(drag.previewStart).id;section.endFrameId=document.timeline().state().frames.at(drag.previewEnd).id;document.updateLoopSection(section);}}}refresh();}
  void updateLoopTrackResize(gfx::Point point,bool scrolling=false){if(!loopTrackDrag_)return;auto& drag=*loopTrackDrag_;if(drag.identity!=document.identity() || !playbackSection(drag.id)){finishLoopTrackResize(true);return;}drag.pointer=point;const auto viewport=loopTrackViewport();if(scrolling){const int width=timelineScrollMetrics(columnLayout(uiLogical(clientBounds()),2)).width;int scroll=frameScroll_*12*uiScale+frameScrollRemainder_;if(point.x>viewport.x2()-30*uiScale)scroll+=18*uiScale;else if(point.x<viewport.x+30*uiScale)scroll-=18*uiScale;scroll=std::clamp(scroll,0,std::max(0,int(document.timeline().state().frames.size())*12*uiScale-width));frameScroll_=scroll/(12*uiScale);frameScrollRemainder_=scroll%(12*uiScale);}
    const double first=viewport.x-frameScroll_*12*uiScale-frameScrollRemainder_;const int index=timeline::loopResizeFrameIndex(point.x,first,12*uiScale,int(document.timeline().state().frames.size()),drag.edge==1);const int start=drag.edge==1?std::min(index,drag.end):drag.start,end=drag.edge==2?std::max(index,drag.start):drag.end;if(start!=drag.previewStart || end!=drag.previewEnd){drag.previewStart=start;drag.previewEnd=end;drag.moved=true;}layoutLayers();invalidateTimelineGrid();}
  bool processLoopTrack(ui::Message* msg){if(loopTrackDrag_){if(!hasCapture() || msg->type()==ui::kFocusLeaveMessage || (msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)){finishLoopTrackResize(true);return true;}if(msg->type()==ui::kMouseMoveMessage){updateLoopTrackResize(static_cast<ui::MouseMessage*>(msg)->position(),true);return true;}if(msg->type()==ui::kMouseUpMessage && static_cast<ui::MouseMessage*>(msg)->left()){updateLoopTrackResize(static_cast<ui::MouseMessage*>(msg)->position());finishLoopTrackResize();return true;}if(msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)return true;}
    if(msg->type()!=ui::kMouseDownMessage && msg->type()!=ui::kDoubleClickMessage)return false;const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto hit=loopTrackHit(mouse->position());if(hit.id.empty())return false;if(mouse->right()){if(msg->type()==ui::kDoubleClickMessage)return true;PixelMenu menu(skin_);buildLoopTrackMenu(menu,hit.id);menu.showPopup(pointerMenuPosition(mouse->position()),display());return true;}if(!mouse->left())return false;if(hit.edge && msg->type()==ui::kMouseDownMessage){const auto* section=playbackSection(hit.id);const auto range=timeline::loopRange(document.timeline().state(),*section);loopTrackDrag_=LoopTrackDrag{hit.id,hit.edge,range.start,range.end,range.start,range.end,document.identity(),false,mouse->position()};requestFocus();captureMouse();loopTrackTimer_.start();invalidateTimelineGrid();}else openLoopEditor(hit.id);return true;}
  void paintLoopTrack(ui::Graphics& g){if(!loopTrackHeight())return;const auto viewport=loopTrackViewport().offset(-bounds().origin());g.saveClip();g.clipRect(viewport);UiPaintScale scale(g);const auto logical=uiLogical(viewport);skin_.draw(g,"timeline.loop.track",logical);for(const auto& item:loopTrackLayout().items){const auto box=uiLogical(loopTrackItemBounds(item).offset(-bounds().origin()));const auto* section=playbackSection(item.id);if(!section)continue;const bool playing=playing_ && loopPlayback_.current.sectionId==item.id,hover=paletteMousePosition_ && loopTrackHit(*paletteMousePosition_).id==item.id;const char* slot=playing?"timeline.loop.playing":hover?"timeline.loop.hover":"timeline.loop.normal";skin_.draw(g,slot,gfx::Rect(box.x+2,box.y+9,box.w-4,box.h-8));const auto ink=font_.inkBounds(section->name);auto label=gfx::Rect(box.x+4,box.y,std::max(0,box.w-8),12);g.saveClip();g.clipRect(label);const int width=std::min(label.w,ink.w);auto background=gfx::Rect(box.x+(box.w-width)/2-1,box.y,width+2,12);skin_.draw(g,"timeline.loop.track",background);font_.draw(g,section->name,box.x+(box.w-ink.w)/2-ink.x,box.y-ink.y,skin_[playing?"accent":hover?"text":"muted"]);g.restoreClip();}g.restoreClip();}
  TimelineScrollMetrics timelineScrollMetrics(const Layout& l) const {
    TimelineScrollMetrics m;const int width=std::max(uiScale,(l.workW-94)*uiScale),height=std::max(uiScale,(l.bottom-l.layerTop-timelineRowsOffset()-4)*uiScale);
    const int contentWidth=int(document.timeline().state().frames.size())*12*uiScale,contentHeight=int(document.timeline().state().layers.size())*12*uiScale;
    for(int i=0;i<3;++i){m.width=std::max(uiScale,width-(m.vertical?6*uiScale:0));m.height=std::max(uiScale,height-(m.horizontal?6*uiScale:0));m.horizontal=contentWidth>m.width;m.vertical=contentHeight>m.height;}
    return m;
  }
  int timelineColumns(const Layout& l) const {return std::max(1,(timelineScrollMetrics(l).width+frameScrollRemainder_+12*uiScale-1)/(12*uiScale));}
  int timelineCapacity(const Layout& l) const {return std::max(1,(timelineScrollMetrics(l).height+layerScrollRemainder_+12*uiScale-1)/(12*uiScale));}
  gfx::Rect timelineRowViewport() const {const auto l=columnLayout(uiLogical(clientBounds()),2);const auto m=timelineScrollMetrics(l);return toDisplay(gfx::Rect(l.workX+5,l.layerTop+timelineRowsOffset(),84+m.width/uiScale,m.height/uiScale));}
  gfx::Rect timelineFrameViewport(bool header=false) const {auto r=timelineRowViewport();r.x+=84*uiScale;r.w-=84*uiScale;if(header){r.y-=12*uiScale;r.h=12*uiScale;}return r;}
  void layoutTimelineScrollBars(const Layout& l) {
    if(!timelineHorizontal_)return;const auto m=timelineScrollMetrics(l);const auto row=timelineRowViewport(),frames=timelineFrameViewport();
    int vertical=std::clamp(layerScroll_*12*uiScale+layerScrollRemainder_,0,std::max(0,int(document.timeline().state().layers.size())*12*uiScale-m.height));
    int horizontal=std::clamp(frameScroll_*12*uiScale+frameScrollRemainder_,0,std::max(0,int(document.timeline().state().frames.size())*12*uiScale-m.width));
    layerScroll_=vertical/(12*uiScale);layerScrollRemainder_=vertical%(12*uiScale);frameScroll_=horizontal/(12*uiScale);frameScrollRemainder_=horizontal%(12*uiScale);
    timelineVertical_->setDockBounds(gfx::Rect(row.x2(),row.y,7*uiScale,row.h));timelineVertical_->configure(int(document.timeline().state().layers.size())*12*uiScale,m.height,vertical);
    timelineHorizontal_->setDockBounds(gfx::Rect(frames.x,row.y2(),frames.w,7*uiScale));timelineHorizontal_->configure(int(document.timeline().state().frames.size())*12*uiScale,m.width,horizontal);
    for(auto bar:{timelineHorizontal_,timelineVertical_}){bar->setEnabled(pending_==Pending::None);bar->wheelStep=12*uiScale;}
    timelineHorizontal_->setVisible(documentOpen_ && columnShown(2) && m.horizontal);timelineVertical_->setVisible(documentOpen_ && columnShown(2) && m.vertical);
  }
  void layoutLayers() {
    if(timelineSelectionIdentity_!=document.identity()){clearTimelineRowSelection();frameSelectionExplicit_=false;timelineSelectionGuidesVisible_=true;timelineSelectionIdentity_=document.identity();}
    frameSelectionExplicit_=!document.selectedFrames().empty();
    const auto& formal=document.timelineSelection();
    selectedTimelineLayer_=formal.layers.empty()?std::string{}:formal.layers.back();
    const auto* selectedCel=formal.cels.empty()?nullptr:document.timeline().findCelById(formal.cels.back());
    selectedTimelineCelLayer_=selectedCel?selectedCel->layerId:std::string{};selectedTimelineCelFrame_=selectedCel?selectedCel->frameId:std::string{};
    if(!layerRow_)return;const auto rc=uiLogical(clientBounds());const auto l=columnLayout(rc,2);const int x=rc.x+l.workX+5,y=rc.y+l.layerTop;
    const auto& layers=document.timeline().state().layers;
    while(layerRows_.size()<layers.size()) {
      const auto i=layerRows_.size();auto select=[this,i]{selectTimelineLayer(i);};
      auto row=i==0?layerRow_:button(U"",select);if(i==0)row->Click.connect(select);row->skinStyle="timeline-row";row->doubleClickLeftOnly=true;row->doubleClick=[this,i]{openLayerPropertiesFor(i);};row->context=[this,i]{prepareLayerContext(document.timeline().state().layers.at(i).id);showLayerContextMenu(1);};
      row->timelinePress=[this,i](const ui::MouseMessage& mouse){beginTimelineGesture(1,int(i),-1,mouse);};

      auto eye=i==0?layerEye_:button(U"",[this,i]{const auto& layer=document.timeline().state().layers.at(i);document.beginVisibilityGesture();document.previewVisibilityGesture(layer.id,!layer.visible);document.commitVisibilityGesture();refresh();});eye->iconSkin=&toolIcons_;eye->skinStyle="timeline-row";eye->context=[this,i]{prepareLayerContext(document.timeline().state().layers.at(i).id);showLayerContextMenu(1);};eye->timelinePress=[this,i](const ui::MouseMessage& mouse){if(mouse.right()){prepareLayerContext(document.timeline().state().layers.at(i).id);showLayerContextMenu(1);return;}beginVisibilityGesture(document.timeline().state().layers.at(i).id,mouse);};
      auto lock=button(U"",[this,i]{const auto& layer=document.timeline().state().layers.at(i);document.beginLockGesture();document.previewLockGesture(layer.id,!layer.locked);document.commitLockGesture();refresh();});lock->iconSkin=&toolIcons_;lock->skinStyle="timeline-row";lock->context=[this,i]{prepareLayerContext(document.timeline().state().layers.at(i).id);showLayerContextMenu(1);};lock->timelinePress=[this,i](const ui::MouseMessage& mouse){if(mouse.right()){prepareLayerContext(document.timeline().state().layers.at(i).id);showLayerContextMenu(1);return;}beginLockGesture(document.timeline().state().layers.at(i).id,mouse);};
      auto autoLink=button(U"",[this,i]{const auto& layer=document.timeline().state().layers.at(i);document.setLayerAutoLinkAnimationCels(layer.id,!layer.autoLinkAnimationCels);refresh();});
      autoLink->skinStyle="timeline-row";autoLink->iconSkin=&toolIcons_;autoLink->timelinePress=[this,i](const ui::MouseMessage& mouse){beginAutoLinkGesture(document.timeline().state().layers.at(i).id,mouse);};
      layerRows_.push_back(row);layerEyes_.push_back(eye);layerLocks_.push_back(lock);layerAutoLinks_.push_back(autoLink);
    }
    layoutTimelineScrollBars(l);const int capacity=timelineCapacity(l);
    for(std::size_t i=0;i<layerRows_.size();++i) {
      const bool shown=columnShown(2) && i<layers.size() && int(i)>=layerScroll_ && int(i)<layerScroll_+capacity;const int rowY=y+timelineRowsOffset()+(int(i)-layerScroll_)*12;
      for(auto b:{layerRows_[i],layerEyes_[i],layerLocks_[i],layerAutoLinks_[i]}){b->timelineParentPainted=true;b->timelineVisible=shown;b->setTransparent(true);b->timelineRepaint=[this]{invalidateTimelineGrid();};b->paletteViewport=[this]{return timelineRowViewport();};b->setVisible(shown);b->setEnabled(pending_==Pending::None);}
      if(i>=layers.size())continue;const auto& layer=layers[i];layerRows_[i]->caption=layer.name;layerRows_[i]->timelineCaptionPadding=2;layerRows_[i]->active=layer.id==document.layer().id;layerRows_[i]->timelineSelected=timelineSelectionGuidesVisible_ && document.selectedFrames().empty() && formal.cels.empty() && std::find(formal.layers.begin(),formal.layers.end(),layer.id)!=formal.layers.end();layerEyes_[i]->active=layerRows_[i]->active;layerLocks_[i]->active=layerRows_[i]->active;layerAutoLinks_[i]->active=layerRows_[i]->active;layerAutoLinks_[i]->icon=layer.autoLinkAnimationCels?"animation-auto-link-on":"animation-auto-link-off";layerAutoLinks_[i]->setBounds(toDisplay(gfx::Rect(x+24,rowY,12,12)).offset(0,-layerScrollRemainder_));
      layerRows_[i]->setBounds(toDisplay(gfx::Rect(x+36,rowY,48,12)).offset(0,-layerScrollRemainder_));layerEyes_[i]->icon=layer.visible?"eye":"eyeOff";layerEyes_[i]->setBounds(toDisplay(gfx::Rect(x,rowY,12,12)).offset(0,-layerScrollRemainder_));layerLocks_[i]->icon=layer.locked?"lock":"unlock";layerLocks_[i]->setBounds(toDisplay(gfx::Rect(x+12,rowY,12,12)).offset(0,-layerScrollRemainder_));
    }
    const auto& frames=document.timeline().state().frames;const int columns=timelineColumns(l);const int active=int(document.activeFrameIndex());if(!timelineGesture_.kind && !loopTrackDrag_ && timelineLastActiveFrame_!=document.frame().id){if(active<frameScroll_){frameScroll_=active;frameScrollRemainder_=0;}else if(active>=frameScroll_+columns){frameScroll_=active-columns+1;frameScrollRemainder_=0;}}timelineLastActiveFrame_=document.frame().id;layoutTimelineScrollBars(l);
    while(frameHeaders_.size()<std::size_t(columns)){const auto col=frameHeaders_.size();auto b=button(U"",[this,col]{document.selectFrameHeader(document.timeline().state().frames.at(frameScroll_+col).id,0,playing_);markFrameSelection();refresh();});b->skinStyle="timeline-row";
      b->timelinePress=[this,col](const ui::MouseMessage& mouse){beginTimelineGesture(2,-1,frameScroll_+int(col),mouse);};
      b->doubleClickLeftOnly=true;b->doubleClick=[this,col]{openFramePropertiesFor(frameScroll_+col);};

      b->context=[this,col]{const auto id=document.timeline().state().frames.at(frameScroll_+col).id;if(std::find(document.selectedFrames().begin(),document.selectedFrames().end(),id)==document.selectedFrames().end())document.selectFrameHeader(id,0,playing_);markFrameSelection();contextFrameId_=id;refresh();showLayerContextMenu(2);};frameHeaders_.push_back(b);}
    for(std::size_t col=0;col<frameHeaders_.size();++col){auto b=frameHeaders_[col];const int index=frameScroll_+int(col);const bool shown=columnShown(2) && int(col)<columns && index<int(frames.size());b->timelineParentPainted=true;b->timelineVisible=shown;b->setTransparent(true);b->timelineRepaint=[this]{invalidateTimelineGrid();};b->paletteViewport=[this]{return timelineFrameViewport(true);};b->setVisible(shown);b->setEnabled(pending_==Pending::None);if(shown){const auto n=std::to_string(index+1);b->caption=std::u32string(n.begin(),n.end());b->centerCaption=true;b->active=frames[index].id==document.frame().id || std::find(document.selectedFrames().begin(),document.selectedFrames().end(),frames[index].id)!=document.selectedFrames().end();b->timelineSelected=timelineSelectionGuidesVisible_ && frameSelectionExplicit_ && std::find(document.selectedFrames().begin(),document.selectedFrames().end(),frames[index].id)!=document.selectedFrames().end();b->setBounds(toDisplay(gfx::Rect(x+84+int(col)*12,y+timelineHeaderOffset(),12,12)).offset(-frameScrollRemainder_,0));}}
    while(frameCells_.size()<std::size_t(columns*capacity)){const auto slot=frameCells_.size();auto b=button(U"",[this,slot]{const auto rc=uiLogical(clientBounds());const auto l=columnLayout(rc,2);const int cols=timelineColumns(l);selectTimelineCel(layerScroll_+slot/cols,frameScroll_+slot%cols);});b->skinStyle="timeline-row";b->timelineCel=true;b->context=[this,slot]{const auto rc=uiLogical(clientBounds());const auto l=columnLayout(rc,2);const int cols=timelineColumns(l);prepareCelContext(document.timeline().findCel(document.timeline().state().layers.at(layerScroll_+slot/cols).id,document.timeline().state().frames.at(frameScroll_+slot%cols).id)->id);showLayerContextMenu(3);};frameCells_.push_back(b);}
    for(std::size_t slot=0;slot<frameCells_.size();++slot){auto b=frameCells_[slot];const int row=int(slot)/columns,col=int(slot)%columns,index=frameScroll_+col;const bool shown=columnShown(2) && row<capacity && row+layerScroll_<int(layers.size()) && index<int(frames.size());b->timelineParentPainted=true;b->timelineVisible=shown;b->setTransparent(true);b->timelineRepaint=[this]{invalidateTimelineGrid();};b->paletteViewport=[this]{return timelineFrameViewport();};b->setVisible(shown);b->setEnabled(pending_==Pending::None);b->timelinePress=[this,row,col](const ui::MouseMessage& mouse){beginTimelineGesture(3,row+layerScroll_,col+frameScroll_,mouse);};if(shown){const auto* cel=document.timeline().findCel(layers[row+layerScroll_].id,frames[index].id);b->timelineCel=celHasContent(cel);b->iconSkin=&toolIcons_;b->icon="";b->active=layers[row+layerScroll_].id==document.layer().id || frames[index].id==document.frame().id;b->timelineSelected=timelineSelectionGuidesVisible_ && std::find(formal.cels.begin(),formal.cels.end(),cel->id)!=formal.cels.end();b->setBounds(toDisplay(gfx::Rect(x+84+col*12,y+timelineRowsOffset()+row*12,12,12)).offset(-frameScrollRemainder_,-layerScrollRemainder_));}}
    layerProperties_->setBounds(toDisplay(gfx::Rect(rc.x+l.workX+l.workW-20,y+19,15,16)));
    layerHeaderOpacity_->setVisible(false);
    for(std::size_t i=0;i<timelineInactive_.size();++i){auto b=timelineInactive_[i];gfx::Rect at;
      if(i<5)at={x+int(i)*14,y+19,15,16};
      else if(i<8)at={x+4*14+15+uiGap+int(i-5)*14,y+19,15,16};
      else if(i<10)at={rc.x+l.workX+l.workW-48+int(i-8)*14,y+19,15,16};
      else at={x+12+int(i-10)*12,y+timelineRowsOffset(),12,12};
      b->setBounds(toDisplay(at));b->setVisible(columnShown(2) && i<10);b->setEnabled(enabledTimelineAction(i));if(i==5)b->active=onion_.enabled;if(i==2){b->active=playing_;b->icon=playing_?"playback-pause":"playback-play";}
    }
    const bool enabled=pending_==Pending::None;
    for(auto b:{layerProperties_}){b->setEnabled(enabled && !formal.layers.empty());b->setVisible(columnShown(2));}
  }

  double zoom_=8;
  double canvasScale() const {return zoom_*uiScale;}
  CanvasRenderer renderer_;
  unsigned chromePaints_=0;

  bool modalControl(ui::Widget* w) const {
    if(w==gmTrack_||w==gmPicker_||w==gmPreset_||w==gmDither_||w==gmPosition_||w==gmColor_||w==gmName_||w==gmMode_||w==gmReverse_||w==gmPalette_||w==gmSave_||w==gmDelete_||w==gmAdd_||w==gmRemove_||w==gmRestore_||w==gmFlipStops_)return true;
    if(w==aaAutoButton_ || w==aaInterior_ || w==aaLiveButton_ || w==aaSource_ || w==aaOpacity_ || w==aaOpacitySlider_ || w==aaColorEntry_ || w==aaPicker_)return true;
    if(w==convolutionScroll_ || w==convolutionTiled_ || w==convolutionLive_ || w==convolutionApply_ || std::find(convolutionPresets_.begin(),convolutionPresets_.end(),w)!=convolutionPresets_.end() || std::find(convolutionChannels_.begin(),convolutionChannels_.end(),w)!=convolutionChannels_.end())return true;
    if(w==preferenceNavBar_ || w==preferenceContentBar_ || w==errorScrollBar_ || w==dialogClose_ || w==saveBeforeClose_ || w==discard_ || w==keep_ || w==paletteInput_ || w==layerOpacityRange_ || w==loopDirection_ || w==replaceScopeButton_ || w==replacePreviewButton_ || w==replaceRememberButton_ || w==importSheetLayout_ || w==importSheetPartial_ || w==gifRange_ || w==gifDirection_ || w==gifTrim_ || w==exportFormatButton_ || w==sheetValue_ || w==sheetPreview_ || w==exportScaleInput_ || w==exportTrimButton_ || w==exportSelectionButton_ || w==resizeLock_ || w==resizeMethod_ || w==adjustmentPreview_ || w==adjustmentColorize_ || w==adjustmentToneButton_ || w==curveEditor_ || w==curveChannelButton_ || w==curveResetButton_ || w==curveDeleteButton_ || w==extractNameInput_ || w==extractModeButton_)return true;
    auto contains=[w](const auto& items){return std::any_of(items.begin(),items.end(),[w](auto item){return item==w;});};
    return w==preferenceApply_ || contains(preferenceTabs_) || contains(preferenceFields_) || contains(loopInputs_) || contains(replaceInputs_) || contains(replaceSample_) || contains(importSheetInputs_) || contains(gifInputs_) || contains(sheetButtons_) || contains(resizeInputs_) || contains(adjustmentInputs_);
  }
  template<class Base> void configureDialogBackground(DialogBackground<Base>* w) {
    w->blocked=[this,w]{return pending_!=Pending::None && !modalControl(w);};
    w->composite=[this](ui::Widget& widget,ui::PaintEvent& ev,const std::function<void()>& paint){
      const int id=widgetColumn(&widget);
      auto& g=*ev.graphics();g.saveClip();
      // Sibling columns share a native Window. Apply Window-style occlusion
      // to independent child repaints as well as the column background.
      gfx::Region visible(widget.clientBounds());const auto geometry=columnGeometry(uiLogical(clientBounds()));
      for(int other=0;other<4;++other){if(!geometry.shown[other] || !columnFloating(other))continue;
        if(id>=0 && docking_.groupOf(other)==docking_.groupOf(id))continue;
        if(id>=0 && columnFloating(id) && (groupFocus(other)<groupFocus(id) || (groupFocus(other)==groupFocus(id) && docking_.groupOf(other)<docking_.groupOf(id))))continue;
        if(modalControl(&widget))continue;
        const auto r=geometry.panel[other];visible-=gfx::Region(widget.toClient(toDisplay(gfx::Rect(r.x,r.y,r.w,r.h))));
      }
      g.clipRegion(visible);
      if(pending_==Pending::None || modalControl(&widget)){paint();g.restoreClip();return;}
      const auto modal=dialogDisplayBounds();
      gfx::Region outside(widget.clientBounds());outside-=gfx::Region(widget.toClient(modal));
      g.saveClip();g.clipRegion(outside);paint();g.restoreClip();
      gfx::Region overlap(g.getClipBounds());overlap&=gfx::Region(widget.toClient(modal));
      for(auto child:children())if(child->isVisible() && modalControl(child))overlap-=gfx::Region(widget.toClient(child->bounds()));
      overlap.offset(widget.bounds().origin()-bounds().origin());
      ui::Graphics dialogGraphics(g.display(),base::AddRef(g.getInternalSurface()),bounds().x,bounds().y);
      dialogGraphics.saveClip();dialogGraphics.clipRegion(overlap);paintDialog(dialogGraphics);dialogGraphics.restoreClip();
      g.restoreClip();
    };
  }
  PixelButton* button(std::u32string label,std::function<void()> action) {
    auto b=new DialogBackground<PixelButton>(font_,skin_,std::move(label),[this,action=std::move(action)] {
      if(colorPicker_) colorPicker_->finishInteraction();
      if(brushRange_) brushRange_->setVisible(false);paletteFocused_=false;action();
      if(pending_==Pending::None) requestFocus();
    }); configureDialogBackground(b);addChild(b); return b;
  }
  Point canvasPoint(gfx::Point p) const {
    return canvasPixel({p.x,p.y},{canvas_.x,canvas_.y},canvasScale());
  }
  gfx::Rect canvasFullViewport() const {
    const auto rc=uiLogical(clientBounds()); const auto l=workspaceLayout(rc);
    const auto content=l.workspaceContent();
    // Keep artwork and pan invalidation inside the inner content frame.
    return toDisplay(gfx::Rect(content.x+1,content.y+1,content.w-2,content.h-2));
  }
  gfx::Rect canvasViewport() const {
    auto r=canvasFullViewport();
    const bool horizontal=canvas_.w>r.w,vertical=canvas_.h>r.h;
    if(vertical || canvas_.h>r.h-(horizontal?6*uiScale:0))r.w-=6*uiScale;
    if(horizontal || canvas_.w>r.w)r.h-=6*uiScale;
    r.w=std::max(1,r.w);r.h=std::max(1,r.h);return r;
  }
  void layoutCanvasScrollBars() {
    if(!canvasHorizontal_)return;const auto r=canvasViewport(),full=canvasFullViewport();
    auto setup=[&](PixelScrollBar* bar,bool vertical){const int size=vertical?canvas_.h:canvas_.w,start=vertical?r.y:r.x,page=vertical?r.h:r.w,origin=vertical?canvas_.y:canvas_.x;
      const int upper=clampCanvasAxis(INT_MAX,start,page,size),lower=clampCanvasAxis(INT_MIN,start,page,size);
      bar->setDockBounds(vertical?gfx::Rect(r.x2(),r.y,7*uiScale,r.h):gfx::Rect(r.x,r.y2(),r.w,7*uiScale));bar->configure(upper-lower+page,page,upper-origin);bar->wheelStep=24*uiScale;
      bar->setVisible(documentOpen_ && !homeOpen_ && (vertical?r.w<full.w:r.y2()<full.y2()));bar->setEnabled(pending_==Pending::None && !document.active());};
    setup(canvasHorizontal_,false);setup(canvasVertical_,true);
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
      layoutPalette();const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,0);auto dock=l.pickerPanel();dock.offset(rc.x,rc.y);invalidateRect(uiPhysical(dock));
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
    layoutCanvasScrollBars();invalidate();
  }
  void zoomCanvas(gfx::Point anchor,int direction) {
    const double next=nextCanvasScale(zoom_,direction);
    setCanvasZoom(anchor,next);
  }
  void setCanvasZoom(gfx::Point anchor,double next) {
    if(next==zoom_) return;
    const auto origin=zoomedCanvasOrigin({canvas_.x,canvas_.y},{anchor.x,anchor.y},canvasScale(),next*uiScale);
    zoom_=next;canvas_=gfx::Rect(origin.x,origin.y,int(std::lround(document.width()*canvasScale())),int(std::lround(document.height()*canvasScale())));
    constrainCanvas();
    invalidate();
  }
  void useZoomTool() {
    if(document.active() && !document.floating())return;
    if(selectionDragging_ || floatingDragging_ || shapeDragging_ || gradientDragging_ || gradientPending_ || fillDragging_ || eyedropperGesture_.active() || zoomDragging_)return;
    selectionTool_=shapeTool_=gradientTool_=fillTool_=handTool_=eraser_=eyedropperTool_=false;zoomTool_=true;toolRowScroll_=0;refresh();updateNavigationCursor();
  }
  void finishZoomTool() {zoomDragging_=false;if(hasCapture())releaseMouse();updateNavigationCursor();}
  void layoutPanelTabs(int only=-1) {
    if(panelTabs_.empty())return;const auto rc=uiLogical(clientBounds());const auto geometry=columnGeometry(rc);
    for(int id=0;id<4;++id){if(only>=0 && docking_.groupOf(id)!=docking_.groupOf(only))continue;auto tab=dockingTabs_[id];if(!tab)continue;const int groupIndex=docking_.groupOf(id);const auto& group=docking_.groups[groupIndex];
      std::vector<int> tabs;for(int item:group.tabs)if(columnVisibility()[item])tabs.push_back(item);
      const bool visible=columnVisibility()[id] && (id!=3 || docking_.custom);tab->setVisible(visible && !(panelGesture_.id==id && panelGesture_.moved && !panelGesture_.edges && !columnFloating(id)));tab->setEnabled(pending_==Pending::None || columnFloating(id));if(!visible)continue;
      const auto r=geometry.panel[id];const bool single=tabs.size()==1;tab->labelOnly=single;tab->tab=!single;tab->active=geometry.shown[id];
      int x=r.x+(single?5:0);for(int item:tabs){if(item==id)break;x+=font_.inkBounds(dockingTabs_[item]->caption).w+9;}tab->firstTab=!tabs.empty()&&tabs.front()==id;
      const auto ink=font_.inkBounds(tab->caption);tab->setBounds(toDisplay(gfx::Rect(rc.x+x,rc.y+r.y+(single?5-ink.y:0),single?ink.w:ink.w+10,single?10:Layout::tabHeight)));
    }
    if(previewPanel_ && (only<0 || docking_.groupOf(only)==docking_.groupOf(3))){previewPanel_->managed=docking_.custom;previewPanel_->frameTop=docking_.custom?columnFrameTop(3):0;if(!docking_.custom)previewPanel_->constrain(toDisplay(gfx::Rect(rc.x+uiGap,rc.y+Layout::optionsY,rc.w-2*uiGap,rc.h-Layout::statusHeight-Layout::optionsY)));
      if(docking_.custom){auto r=geometry.panel[3];previewPanel_->setBounds(toDisplay(gfx::Rect(rc.x+r.x,rc.y+r.y,r.w,r.h)));}
      previewPanel_->setVisible(columnShown(3));if(columnShown(3))previewPanel_->invalidate();}
    for(int id=0;id<4;++id)if(auto close=columnClose_[id]){
      if(only>=0 && docking_.groupOf(id)!=docking_.groupOf(only))continue;
      const bool floating=columnFloating(id) || (id==3 && !docking_.custom);
      close->setVisible(columnShown(id) && floating);close->setEnabled(pending_==Pending::None || floating);
      if(id!=3){const auto r=geometry.panel[id];close->setBounds(toDisplay(gfx::Rect(rc.x+r.x+r.w-16,rc.y+r.y+4,11,12)));}
    }

  }
  int paletteActionsY(const Layout& l) const {
    if(docking_.custom)return columnBodyTop(0);
    // Single-column titles use nine ink rows; leave the standard 2px gap.
    return !panelTabs_.empty() && panelTabs_[0]->labelOnly?
      l.tabY+Layout::frame+uiGap+Layout::labelInkHeight+uiGap:l.top+Layout::inset;
  }
  gfx::Rect paletteContentBounds() const {
    const auto rc=uiLogical(clientBounds());const auto l=columnLayout(rc,0);
    const int y=paletteActionsY(l)+16+uiGap;
    return toDisplay(gfx::Rect(rc.x+l.rightX+Layout::inset,rc.y+y,l.right-2*Layout::inset,l.paletteBottom(columnShown(1))-Layout::inset-y));
  }
  gfx::Rect paletteViewportBounds() const {auto r=paletteContentBounds();if(paletteScrollBar_ && paletteScrollBar_->isVisible())r.w=std::max(1,r.w-6*uiScale);return r;}
  void layoutPalette(int only=-1) {
    const auto rc=uiLogical(clientBounds());const auto l=columnLayout(rc,0);
    if(only<0 || only==0){
    auto area=uiLogical(paletteContentBounds().offset(-bounds().origin()));
    // User correction: connected cells share a single base-pixel black edge.
    // Keep the outer cell size; adjacent bounds overlap only on that edge.
    const int cell=swatchPixels_[swatchSize_]/uiScale,step=cell-1,padding=1+uiGap;
    const int rows=std::max(1,(area.h-padding*2-1)/step);
    const int count=int(swatches_.size());
    int columns=std::max(1,(area.w-padding*2-1)/step);
    const bool overflow=(count+columns-1)/columns>rows;
    if(overflow){area.w=std::max(1,area.w-6);columns=std::max(1,(area.w-padding*2-1)/step);}
    paletteColumns_=columns;
    if(paletteScrollBar_){auto track=paletteContentBounds();track.x=track.x2()-6*uiScale;track.w=7*uiScale;track.y+=uiScale;track.h=std::max(uiScale,track.h-2*uiScale);
      paletteScrollBar_->setDockBounds(track);paletteScrollBar_->wheelStep=step*uiScale;paletteScrollBar_->setVisible(columnShown(0) && overflow);paletteScrollBar_->setEnabled(pending_==Pending::None);}
    const int contentHeight=(2*padding+((count+columns-1)/columns)*step+1)*uiScale;
    paletteScrollPixels_=overflow?std::clamp(paletteScrollPixels_,0,std::max(0,contentHeight-paletteViewportBounds().h)):0;
    if(paletteScrollBar_)paletteScrollBar_->configure(contentHeight,paletteViewportBounds().h,paletteScrollPixels_);
    const bool shared=document.palette().selected.size()>1;
    paletteSelectionBorder_={};paletteSelectionEdges_.clear();
    for(std::size_t i=0;i<swatches_.size();++i) {
      swatches_[i]->paletteSharedSelection=shared;
      const int row=int(i)/columns;
      swatches_[i]->paletteMarkerSize=swatchSize_<2?0:swatchSize_<4?1:2;
      auto cellBounds=gfx::Rect(area.x+padding+int(i%columns)*step,area.y+padding+row*step,cell,cell);
      auto physical=toDisplay(cellBounds).offset(0,-paletteScrollPixels_);swatches_[i]->paletteViewport=[this]{return paletteViewportBounds();};if(swatches_[i]->active && shared)paletteSelectionBorder_=paletteSelectionBorder_.isEmpty()?physical:(paletteSelectionBorder_|physical);
      if(swatches_[i]->active && !shared)physical=skin_.selectionMaterialBounds(physical);
      swatches_[i]->setBounds(physical);
      swatches_[i]->setVisible(columnShown(0) && paletteViewportBounds().intersects(swatches_[i]->bounds()));
    }
    if(shared){
      // legacy paletteSelectionBoundaryEdges: skip neighbors within the selection,
      // merge contiguous perimeter segments before applying the shared skin.
      auto selected=[&](int i){return i>=0 && i<int(swatches_.size()) && swatches_[i]->active;};
      struct Edge {int side,line,first,last;};std::vector<Edge> edges;
      for(int i=0;i<int(swatches_.size());++i)if(selected(i)){
        const int x=i%columns,y=i/columns;
        if(!selected(i-columns))edges.push_back({0,y,x,x+1});
        if(x==columns-1 || !selected(i+1))edges.push_back({1,x+1,y,y+1});
        if(!selected(i+columns))edges.push_back({2,y+1,x,x+1});
        if(x==0 || !selected(i-1))edges.push_back({3,x,y,y+1});
      }
      std::sort(edges.begin(),edges.end(),[](auto a,auto b){return std::tie(a.side,a.line,a.first)<std::tie(b.side,b.line,b.first);});
      std::vector<Edge> merged;for(auto e:edges){if(!merged.empty() && merged.back().side==e.side && merged.back().line==e.line && merged.back().last==e.first)merged.back().last=e.last;else merged.push_back(e);}
      const auto first=swatches_.front()->paletteColorBounds();const int pitch=step*uiScale;
      for(auto e:merged){
        const bool horizontal=e.side==0 || e.side==2;gfx::Rect b;
        if(horizontal)b={first.x+e.first*pitch,first.y+(e.line-(e.side==2?1:0))*pitch,(e.last-e.first)*pitch+uiScale,cell*uiScale};
        else b={first.x+(e.line-(e.side==1?1:0))*pitch,first.y+e.first*pitch,cell*uiScale,(e.last-e.first)*pitch+uiScale};
        auto clip=skin_.selectionMaterialBounds(b);
        if(e.side==0)clip.h=b.y+uiScale-clip.y;
        if(e.side==2){const int end=clip.y2();clip.y=b.y2()-uiScale;clip.h=end-clip.y;}
        if(e.side==3)clip.w=b.x+uiScale-clip.x;
        if(e.side==1){const int end=clip.x2();clip.x=b.x2()-uiScale;clip.w=end-clip.x;}
        // At a concave endpoint this is a straight strip, not the convex
        // corner of a rectangular nine-slice. Extend its source rectangle;
        // retain the contour's original clip for the miter below.
        const int extension=4*uiScale;
        const int row=horizontal?(e.side==0?e.line:e.line-1):0;
        const int col=!horizontal?(e.side==3?e.line:e.line-1):0;
        auto at=[&](int x,int y){return x>=0 && x<columns && y>=0 && selected(y*columns+x);};
        const bool startConcave=horizontal?at(e.first-1,row):at(col,e.first-1);
        const bool endConcave=horizontal?at(e.last,row):at(col,e.last);
        if(horizontal){if(startConcave){b.x-=extension;b.w+=extension;}if(endConcave)b.w+=extension;}
        else{if(startConcave){b.y-=extension;b.h+=extension;}if(endConcave)b.h+=extension;}
        paletteSelectionEdges_.push_back({b,clip,{},e.side});
      }
      // Assign overlapping strips to the closest boundary. This forms a
      // concave miter and prevents one strip's outer black row covering the
      // other strip's white row. The same pieces drive rendering and input.
      const auto material=skin_.selectionMaterialBounds(paletteSelectionBorder_);
      // Clip strips against the actual union, including shared grid seams.
      // An extended straight strip may cross the selected interior at an
      // inward corner; those pixels belong to the colors, never the outline.
      auto occupied=[&](int px,int py){
        const int dx=px-first.x,dy=py-first.y;if(dx<0 || dy<0)return false;
        const int x=dx/pitch,y=dy/pitch;
        for(int yy=std::max(0,y-1);yy<=y;++yy)for(int xx=std::max(0,x-1);xx<=x;++xx)
          if(xx<columns && selected(yy*columns+xx) && px>=first.x+xx*pitch && px<first.x+xx*pitch+cell*uiScale && py>=first.y+yy*pitch && py<first.y+yy*pitch+cell*uiScale)return true;
        return false;
      };
      auto interior=[&](int x,int y){for(int dy=-uiScale;dy<=uiScale;dy+=uiScale)for(int dx=-uiScale;dx<=uiScale;dx+=uiScale)if(!occupied(x+dx,y+dy))return false;return true;};
      for(int y=material.y;y<material.y2();y+=uiScale){int run=-1,begin=material.x;
        auto flush=[&](int x){if(run>=0)paletteSelectionEdges_[run].pieces.push_back({begin,y,x-begin,uiScale});};
        for(int x=material.x;x<=material.x2();x+=uiScale){int winner=-1,best=100000;
          if(x<material.x2() && !interior(x,y))for(int i=0;i<int(paletteSelectionEdges_.size());++i){const auto& edge=paletteSelectionEdges_[i];if(!edge.clip.contains(gfx::Point(x,y)))continue;
            const auto& b=edge.border;const int distance=edge.side==0?b.y-y:edge.side==1?x-(b.x2()-uiScale):edge.side==2?y-(b.y2()-uiScale):b.x-x;
            if(distance>=0 && distance<best && skin_.selectionContains(skin_.selectionMaterialBounds(b),{x,y})){best=distance;winner=i;}}
          if(winner!=run){flush(x);run=winner;begin=x;}
        }
      }
    }
    if(paletteSelectionOverlay_){const bool show=shared && columnShown(0) && !paletteSelectionBorder_.isEmpty();paletteSelectionOverlay_->setVisible(show);if(show)paletteSelectionOverlay_->setBounds(skin_.selectionMaterialBounds(paletteSelectionBorder_)&paletteViewportBounds());paletteSelectionOverlay_->invalidate();}
    // Paint surrounding selection frames after neighboring color cells.
    for(auto swatch:swatches_) if(swatch->active) moveChildTo(swatch,children().back());
    if(paletteLock_) {
      paletteLock_->setBounds(toDisplay(gfx::Rect(rc.x+l.rightX+Layout::inset,rc.y+paletteActionsY(l),15,16)));
      paletteLock_->icon=paletteLocked_?"lock":"unlock";
      primaryRole_->setBounds(toDisplay(gfx::Rect(rc.x+l.rightX+Layout::inset+2*(15+uiGap),rc.y+paletteActionsY(l)+1,22,14)));
      secondaryRole_->setBounds(toDisplay(gfx::Rect(rc.x+l.rightX+Layout::inset+2*(15+uiGap)+22+uiGap,rc.y+paletteActionsY(l)+1,22,14)));
      primaryRole_->swatch=document.displayPalette().primary;secondaryRole_->swatch=document.displayPalette().secondary;
      // Palette chrome stays the same when the picker is hidden or tabbed.
      // Role color controls belong to the picker, not a fallback palette row.
      for(auto b:{paletteLock_,primaryRole_,secondaryRole_}) {b->setVisible(columnShown(0) && b==paletteLock_);b->setEnabled(pending_==Pending::None);}
    }
    if(paletteActions_) {
      const int right=rc.x+l.rightX+l.right-Layout::inset;
      paletteLibrary_->setBounds(toDisplay(gfx::Rect(right-29,rc.y+paletteActionsY(l),15,16)));
      paletteLibrary_->setVisible(columnShown(0));paletteLibrary_->setEnabled(false);
      paletteActions_->setBounds(toDisplay(gfx::Rect(right-15,rc.y+paletteActionsY(l),15,16)));
      paletteActions_->setVisible(columnShown(0));
      paletteActions_->setEnabled(pending_==Pending::None);
    }
    }
    if(colorPicker_ && (only<0 || only==1)) {
      auto inner=columnLayout(rc,1).pickerGradient(!recentColors_.values().empty());inner.offset(rc.x,rc.y);inner.shrink(1);inner=toDisplay(inner);
      colorPicker_->setBounds(inner);
      colorPicker_->syncColors(document.displayPalette().primary,document.displayPalette().secondary);
      colorPicker_->setVisible(columnShown(1));
      colorPicker_->setEnabled(pending_==Pending::None);
    }
    if(pickerPrimary_ && (only<0 || only==1)) {
      const auto box=columnLayout(rc,1).pickerGradient(!recentColors_.values().empty());
      const int x=rc.x+box.x,y=rc.y+box.y2()+uiGap;
      const bool shown=columnShown(1);
      bool inPalette=false;for(int id:document.palette().slots) if(const auto entry=document.paletteEntry(id)) if(entry->color==document.palette().primary) inPalette=true;
      pickerPrimary_->setBounds(toDisplay(gfx::Rect(x,y,box.w-(inPalette?0:15+uiGap),20)));
      pickerSecondary_->setBounds(toDisplay(gfx::Rect(x,y+20+uiGap,box.w,20)));
      pickerPrimary_->swatch=document.displayPalette().primary;pickerSecondary_->swatch=document.displayPalette().secondary;
      pickerPrimary_->setVisible(shown);pickerSecondary_->setVisible(shown);
      for(auto b:{pickerPrimary_,pickerSecondary_,pickerAdd_})b->setEnabled(pending_==Pending::None);
      pickerAdd_->setBounds(toDisplay(gfx::Rect(x+box.w-15,y+(20-16)/2,15,16)));
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
        b->setBounds(toDisplay(gfx::Rect(x+int(i)*(recentSize+uiGap),y+2*(20+uiGap),recentSize,recentSize)));
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
    // Persistent keys must not depend on enum ordinals: new dialogs used to
    // shift existing names and read beyond the old eleven-entry array.
    switch(action){
      case Pending::None:return "none";case Pending::New:return "new";
      case Pending::Open:return "open";case Pending::OpenError:return "error";
      case Pending::Close:return "close";case Pending::CloseDocument:return "close-document";
      case Pending::Preferences:return "preferences";
      case Pending::LayerOpacity:return "layer-opacity";case Pending::FrameDuration:return "frame-duration";
      case Pending::LoopSection:return "loop";case Pending::OnionValue:return "onion";
      case Pending::PaletteName:return "palette-name";case Pending::ColorRole:return "color-role";
      case Pending::AntiAlias:return "anti-alias";case Pending::Convolution:return "convolution";case Pending::PaletteExtract:return "palette-extract";case Pending::ColorAdjustment:return "color-adjustment";
      case Pending::ReplaceColor:return "replace-color";case Pending::ImageResize:return "image-resize";
      case Pending::BrushFolderName:return "brush-folder-name";case Pending::StaticExport:return "static-export";
      case Pending::SpriteSheet:return "sprite-sheet";case Pending::GifExport:return "gif-export";
      case Pending::SheetImport:return "sheet-import";
    }
    return "none";
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
      std::ofstream panelsOut(path.parent_path()/"workspace-panels.txt");docking_.write(panelsOut);panelsOut<<palettePanelOpen_<<' '<<colorPickerOpen_<<' '<<layersPanelOpen_<<' '<<previewPanelOpen_<<'\n';panelsOut.close();if(!panelsOut)throw std::runtime_error("Cannot save panel docking");
    }catch(const std::exception& e){status_=U"栏目尺寸保存失败："+unicodeText(e.what());}
  }
  void loadWorkspaceSizes() {
    std::ifstream in(palettePreferencePath().parent_path()/"workspace-sizes.txt");readWorkspaceSizes(in);
    std::ifstream panelsIn(palettePreferencePath().parent_path()/"workspace-panels.txt");if(docking_.read(panelsIn)){bool p,c,l,v;if(panelsIn>>p>>c>>l>>v){palettePanelOpen_=p;colorPickerOpen_=c;layersPanelOpen_=l;previewPanelOpen_=v;}}
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
        if(kind=="modal" && r.w>=240 && r.h>=67)for(int i=1;i<=int(Pending::Preferences);++i)
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
  gfx::Rect toolPopupBounds(ui::Widget* trigger,int width,int height){
    const auto view=display()->bounds(),at=trigger->bounds();
    return {std::clamp(at.x,view.x,std::max(view.x,view.x2()-width*uiScale)),std::clamp(at.y2()+uiGap*uiScale,view.y,std::max(view.y,view.y2()-height*uiScale)),width*uiScale,height*uiScale};
  }
  void showPropertyRange(PixelEntry* entry,int minimum,int maximum){
    if(!entry->isEnabled() || entry->hasFlags(ui::HIDDEN) || pending_!=Pending::None)return;
    if(propertyRangePopup_)propertyRangePopup_->closeWindow(nullptr);
    propertyRangePopup_=std::make_unique<ToolPropertyPopup>(skin_,font_,U"");
    auto& popup=*propertyRangePopup_;popup.setDisplay(display(),false);popup.setBounds(toolPopupBounds(entry,129,28));
    // FocusEnter can open the flyout before the initiating MouseDown is
    // dispatched. Keep that same click on the owner from closing it again.
    popup.setClickBehavior(ui::PopupWindow::ClickBehavior::CloseOnClickOutsideHotRegion);
    gfx::Region hotRegion;
    for(const auto& area:{entry->bounds(),popup.bounds()})hotRegion|=gfx::Region(gfx::Rect(display()->nativeWindow()->pointToScreen(area.origin()),area.size()));
    popup.setHotRegion(hotRegion);
    auto range=new PixelSlider(font_,skin_);propertyRangeSlider_=range;range->minimum=minimum;range->maximum=maximum;range->percentage=entry->suffix==U"%";
    try{range->value=std::clamp(int(std::stod(entry->text())),minimum,maximum);}catch(...){range->value=minimum;}
    range->changed=[entry](int value){entry->setText(std::to_string(value));entry->Change();};
    popup.place(range,{5,5,119,18});popup.openWindow();
  }
  void showBrushRange(bool opacity) {
    if(handTool_ || pending_!=Pending::None)return;
    showPropertyRange(opacity?brushOpacityInput_:brushSizeInput_,opacity?0:1,opacity?100:64);
  }

  gfx::Rect homeBounds() const {
    const auto rc=uiLogical(bounds());const int width=std::min(560,rc.w-24);
    return {rc.x+(rc.w-width)/2,rc.y+Layout::workY+10,width,rc.h-Layout::workY-Layout::statusHeight-20};
  }
  int homeBannerHeight() const {const auto box=homeBounds();return box.h<340?std::clamp(box.h-188,24,64):110;}
  int homeContentY() const {return homeBounds().y+44+homeBannerHeight()+12;}
  int homeLeftWidth() const {return std::min(148,homeBounds().w/3);}
  std::filesystem::path homeRecentPath() const {return palettePreferencePath().parent_path()/"home-recent.txt";}
  void recordHomeRecent(const std::filesystem::path& path) {
    if(smoke_ || path.empty())return;
    homeRecent_.erase(std::remove(homeRecent_.begin(),homeRecent_.end(),path),homeRecent_.end());homeRecent_.insert(homeRecent_.begin(),path);
    if(homeRecent_.size()>24)homeRecent_.resize(24);
    try{std::filesystem::create_directories(homeRecentPath().parent_path());std::ofstream out(homeRecentPath(),std::ios::binary);for(const auto& entry:homeRecent_)out<<std::quoted(entry.u8string())<<'\n';out.close();if(!out)throw std::runtime_error("Cannot write recent projects");}catch(const std::exception&){status_=U"最近文件记录写入失败";}
  }
  void loadHomeSection() {
    homeEntries_.clear();homeScroll_=homeScrollPixels_=0;
    if(homeSection_==0)for(const auto& path:homeRecent_)homeEntries_.push_back({unicodeText(path.filename().u8string()),path,{}});
    if(homeSection_==2){loadRecoveries();for(const auto& row:recoveryCatalog_.rows())homeEntries_.push_back({unicodeText(row.name),recoveryDirectory()/std::filesystem::u8path(row.id+".moonsprite"),row.id});}
  }
  void layoutHome() {
    if(homeActions_.empty())return;
    const bool shown=homeOpen_;const bool usable=shown && pending_==Pending::None;
    const auto box=homeBounds();const int left=homeLeftWidth(),right=box.x+left+12,width=box.w-left-12;
    const bool compact=box.h<340;const int top=homeContentY(),primaryStep=compact?24:34,resourceTop=top+2*primaryStep+(compact?10:22),resourceStep=compact?18:26;
    for(std::size_t i=0;i<homeActions_.size();++i){const bool primary=i<2;const int y=primary?top+int(i)*primaryStep:resourceTop+int(i-2)*resourceStep;homeActions_[i]->setVisible(shown);homeActions_[i]->setBounds(uiPhysical(gfx::Rect(box.x,y,left,primary?(compact?21:28):(compact?17:22))));}
    for(std::size_t i=0;i<homeActions_.size();++i)homeActions_[i]->setEnabled(usable && i<2);
    homeReturn_->setVisible(shown && documentOpen_);homeReturn_->setBounds(uiPhysical(gfx::Rect(box.x2()-94,box.y+2,94,19)));
    homeReturn_->setEnabled(usable);
    const int tabWidth=std::min(76,width/3);
    for(int i=0;i<3;++i){homeTabs_[i]->setVisible(shown);homeTabs_[i]->setEnabled(usable && i!=1);homeTabs_[i]->active=homeSection_==i;homeTabs_[i]->setBounds(uiPhysical(gfx::Rect(right+i*tabWidth,top,tabWidth-1,21)));}
    auto viewport=uiPhysical(gfx::Rect(right+6,top+28,std::max(1,width-12),std::max(1,box.y2()-top-34)));
    const int total=int(homeEntries_.size())*28*uiScale;const bool overflow=total>viewport.h;
    if(overflow)viewport.w=std::max(1,viewport.w-6*uiScale);
    homeScrollPixels_=std::clamp(homeScrollPixels_,0,std::max(0,total-viewport.h));homeScroll_=homeScrollPixels_/(28*uiScale);
    if(homeScrollBar_){homeScrollBar_->setDockBounds(gfx::Rect(viewport.x2(),viewport.y,7*uiScale,viewport.h));homeScrollBar_->configure(total,viewport.h,homeScrollPixels_);homeScrollBar_->wheelStep=28*uiScale;homeScrollBar_->setVisible(shown && overflow);homeScrollBar_->setEnabled(usable);}
    while(homeRows_.size()<homeEntries_.size()){const auto slot=homeRows_.size();auto row=button(U"",[this,slot]{if(slot>=homeEntries_.size())return;const auto entry=homeEntries_[slot];if(entry.recoveryId.empty())openPath(entry.path);else restoreRecovery(entry.path,entry.recoveryId,entry.name);});row->iconWithCaption=true;row->iconSkin=&toolIcons_;row->icon="image";homeRows_.push_back(row);}
    for(std::size_t i=0;i<homeRows_.size();++i){auto row=homeRows_[i];row->paletteViewport=[viewport]{return viewport;};row->setEnabled(usable);row->setBounds(gfx::Rect(viewport.x,viewport.y+int(i)*28*uiScale-homeScrollPixels_,viewport.w,24*uiScale));row->setVisible(shown && i<homeEntries_.size() && viewport.intersects(row->bounds()));if(i<homeEntries_.size())row->caption=homeEntries_[i].name;}

  }
  void showHome(bool open) {
    if(pending_!=Pending::None || document.active())return;
    playing_=false;
    if(open && !homeOpen_){homeVisibility_.clear();for(auto child:children())homeVisibility_.push_back({child,!child->hasFlags(ui::HIDDEN)});loadHomeSection();homeBannerDue_=std::chrono::steady_clock::now()+std::chrono::seconds(8);}
    homeOpen_=open;refresh();
  }
  void applyHomeVisibility() {
    if(homeOpen_){for(auto child:children())if(child!=modalSurface_ && child!=menuBar_ && child!=homeButton_ && child!=discard_ && child!=keep_ && child!=dialogClose_ && child!=saveBeforeClose_ && child!=paletteInput_)child->setVisible(false);}
    if(homeOpen_){documentTabNew_->setVisible(documentOpen_);documentTabClose_->setVisible(documentOpen_);}
    layoutHome();if(pending_==Pending::OpenError)layoutModal();if(pending_==Pending::Preferences)layoutPreferences(modalBounds(uiLogical(clientBounds())));
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
    const int top=Layout::documentY+Layout::projectTabHeight-1;
    g.fillRect(skin_["panel"],gfx::Rect(0,top,rc.w,rc.h-top));
    g.fillRect(gfx::rgba(0,0,0,255),gfx::Rect(0,top,rc.w,1));
    g.fillRect(gfx::rgba(66,79,103,255),gfx::Rect(0,top+1,rc.w,1));
  }
  void paintDocumentTab(ui::Graphics& g) {
    const auto l=workspaceLayout(uiLogical(bounds()));
    const std::u32string documentTitle=document.name();
    const int tabWidth=documentTabWidth(l);
    const auto rc=uiLogical(clientBounds());
    if(documentOpen_)skin_.draw(g,homeOpen_?"project_tab.inactive":"project_tab.active",gfx::Rect(0,Layout::documentY,tabWidth,Layout::projectTabHeight));
    if(documentOpen_)g.fillRect(gfx::rgba(homeOpen_?23:32,homeOpen_?26:38,homeOpen_?33:53,255),gfx::Rect(0,Layout::documentY+1,1,Layout::projectTabHeight-2));
    const auto titleInk=font_.inkBounds(documentTitle);
    // The 16px tab has a 2px top rim and a 1px bottom rim; center
    // nine ink rows in its 13px interior with 2px padding on both sides.
    if(documentOpen_){
      const int visibleTitleWidth=std::min(titleInk.w,tabWidth-2*Layout::inset-11-uiGap-(document.dirty()?3+uiGap:0));
      g.saveClip();g.clipRect(gfx::Rect(Layout::inset,Layout::documentY+4,visibleTitleWidth,9));
      font_.draw(g,documentTitle,Layout::inset-titleInk.x,Layout::documentY+4-titleInk.y,skin_["text"]);g.restoreClip();
      if(document.dirty())g.fillRect(gfx::rgba(41,121,255,255),gfx::Rect(Layout::inset+visibleTitleWidth+uiGap,Layout::documentY+7,3,3));
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
    const auto& banner=homeBanners_[homeBanner_%homeBanners_.size()];const gfx::Rect frame(box.x,box.y+44,box.w,homeBannerHeight());
    const double factor=std::max(double(frame.w)/banner->width(),double(frame.h)/banner->height());const int sourceW=std::max(1,int(frame.w/factor)),sourceH=std::max(1,int(frame.h/factor));
    g.drawSurface(banner.get(),gfx::Rect((banner->width()-sourceW)/2,(banner->height()-sourceH)/2,sourceW,sourceH),frame,os::Sampling(),nullptr);
    const char32_t* titles[]{U"火焰之境 · 90y",U"月球基底 · 90y",U"沙船 · 90y",U"大厅 · 90y",U"石狮 · 线框",U"蔑视 · 月猫"};
    const int creditWidth=font_.measure(titles[homeBanner_%6])+12;
    g.fillRect(skin_["background"],gfx::Rect(frame.x2()-creditWidth-4,frame.y2()-17,creditWidth,13));text(titles[homeBanner_%6],frame.x2()-creditWidth+2,frame.y2()-15,true);
    const int left=homeLeftWidth(),right=box.x+left+12,width=box.w-left-12;
    const int top=homeContentY()-bounds().y/uiScale;
    const gfx::Rect list(right,top+22,width,std::max(12,box.y2()-top-22));g.fillRect(skin_["panel"],list);skin_.draw(g,"panel_outer",list);
    const bool compact=box.h<340;const int resourceTop=top+2*(compact?24:34)+(compact?10:22);
    g.fillRect(skin_["border"],gfx::Rect(box.x,resourceTop-(compact?6:17),left,1));
    if(!compact)text(U"更多入口 · 待迁移",box.x,resourceTop-13,true);
    if(homeEntries_.empty()){
      const std::u32string heading=homeSection_==2?U"没有待恢复的工程":homeSection_==1?U"画廊尚未迁移":U"从一个新作品开始";
      const std::u32string detail=homeSection_==2?U"恢复工程会显示在这里":U"新建或打开精灵，继续创作";
      const int y=list.y+std::max(8,(list.h-32)/2);
      g.saveClip();g.clipRect(gfx::Rect(right+6,list.y+4,width-12,list.h-8));
      text(heading,right+(width-font_.measure(heading))/2,y);text(detail,right+(width-font_.measure(detail))/2,y+19,true);g.restoreClip();
    }
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
    auto modeGroup=new ui::Widget(ui::kGenericWidget);modeGroup->setTransparent(true);addChild(modeGroup);selectionControls_.push_back({modeGroup,57});
    const char* modeIcons[]{"selection-replace","selection-add","selection-subtract","selection-intersect"};
    const char32_t* modeNames[]{U"替换选区",U"添加选区",U"减去选区",U"相交选区"};
    for(int i=0;i<4;++i){auto b=new PixelButton(font_,skin_,U"",[this,i]{selectionMode_=i;saveSelectionPreferences();layoutToolOptions();invalidateRect(canvasViewport());});b->icon=modeIcons[i];b->iconSkin=&toolIcons_;b->iconGroupIndex=i;b->iconGroupCount=4;b->hover=[this,i,modeNames]{status_=modeNames[i];invalidate();};modeGroup->addChild(b);selectionModeButtons_[i]=b;}
    auto wandNumber=[&](bool gap){auto entry=new PixelEntry(font_,skin_);entry->numeric=true;addChild(entry);selectionControls_.push_back({entry,gap?30:32});auto commit=[this,entry,gap]{try{std::size_t used=0;const double raw=std::stod(entry->text(),&used);if(used!=entry->text().size() || !std::isfinite(raw))return;const int value=int(std::floor(std::clamp(raw,-1000.0,1000.0)+.5));if(gap)wandOptions_.gapThreshold=std::clamp(value,1,16);else wandOptions_.tolerance=std::clamp(value,0,255);}catch(...){ }layoutToolOptions();};entry->Change.connect(commit);entry->accept=[this,commit]{commit();requestFocus();};entry->blur=commit;entry->cancel=[this]{requestFocus();layoutToolOptions();};entry->wheel=[this,gap](int delta){if(gap)wandOptions_.gapThreshold=std::clamp(wandOptions_.gapThreshold+delta,1,16);else wandOptions_.tolerance=std::clamp(wandOptions_.tolerance+delta,0,255);layoutToolOptions();invalidate();};return entry;};
    option(U"容差",28,[]{})->labelOnly=true;wandToleranceInput_=wandNumber(false);
    wandContiguousButton_=option(U"连续",45,[this]{wandOptions_.contiguous=!wandOptions_.contiguous;layoutToolOptions();invalidate();});
    wandGapButton_=option(U"智能闭合",65,[this]{wandOptions_.gapClosing=!wandOptions_.gapClosing;layoutToolOptions();invalidate();});wandGapInput_=wandNumber(true);
    for(auto b:{wandContiguousButton_,wandGapButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}
    wandConnectivityButton_=option(U"4 方连接",57,[this]{wandOptions_.connectivity=wandOptions_.connectivity==4?8:4;fillOptions_.connectivity=wandOptions_.connectivity;saveBrushPreferences();layoutToolOptions();invalidate();});
    wandReferenceButton_=option(U"",15,[this]{showFillSettings(wandReferenceButton_);});wandReferenceButton_->icon="properties";wandReferenceButton_->iconSkin=&toolIcons_;
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
    fillReferenceButton_=fillButton(U"",15,[this]{showFillSettings(fillReferenceButton_);});fillReferenceButton_->icon="properties";fillReferenceButton_->iconSkin=&toolIcons_;auto pivotButton=option(U"",15,[this]{showSelectionPivotPopup();});pivotButton->icon="selection-pivot-preset-4";pivotButton->iconSkin=&toolIcons_;pivotButton->iconGroupCount=1;
    auto shrinkButton=option(U"",15,[this]{shrinkSelectionToContent();});shrinkButton->icon="selection-shrink";shrinkButton->iconSkin=&toolIcons_;shrinkButton->iconGroupCount=1;shrinkButton->hover=[this]{status_=U"收缩选区至内容";invalidate();};
    selectionRoundedButton_=option(U"圆角",43,[this]{selectionRounded_=!selectionRounded_;saveSelectionPreferences();layoutToolOptions();invalidate();});selectionRoundedButton_->iconSkin=&toolIcons_;selectionRoundedButton_->bareIconWithCaption=true;
    selectionCornerRadiusInput_=new PixelEntry(font_,skin_);selectionCornerRadiusInput_->numeric=true;selectionCornerRadiusInput_->suffix=U"px";addChild(selectionCornerRadiusInput_);selectionControls_.push_back({selectionCornerRadiusInput_,44});auto radiusCommit=[this]{try{std::size_t used=0;double value=std::stod(selectionCornerRadiusInput_->text(),&used);if(used==selectionCornerRadiusInput_->text().size() && std::isfinite(value)){selectionCornerRadius_=int(std::floor(std::clamp(value,0.0,256.0)+.5));saveSelectionPreferences();}}catch(...){}layoutToolOptions();};selectionCornerRadiusInput_->Change.connect(radiusCommit);selectionCornerRadiusInput_->blur=radiusCommit;selectionCornerRadiusInput_->accept=[this,radiusCommit]{radiusCommit();requestFocus();};selectionCornerRadiusInput_->cancel=[this]{requestFocus();layoutToolOptions();};


  }
  void showFillSettings(PixelButton* trigger,bool gradient=false){
    PixelMenu menu(skin_);const bool wand=trigger==wandReferenceButton_;const bool visible=gradient?gradientOptions_.visibleLayers:wand?wandOptions_.visibleLayers:fillOptions_.visibleLayers;const int connectivity=gradient?gradientOptions_.connectivity:wand?wandOptions_.connectivity:fillOptions_.connectivity;
    auto heading=[&](const char32_t* text){auto item=new PixelMenuItem(font_,skin_,text);item->setEnabled(false);menu.addChild(item);};
    heading(U"\u53c2\u8003\u56fe\u5c42");
    for(int i=0;i<2;++i){auto item=new PixelMenuItem(font_,skin_,i?U"\u53ef\u89c1\u56fe\u5c42":U"\u5f53\u524d\u56fe\u5c42");item->checked=[visible,i]{return visible==(i!=0);};item->Click.connect([this,i,gradient]{fillOptions_.visibleLayers=wandOptions_.visibleLayers=gradientOptions_.visibleLayers=i!=0;if(gradient)gradientChanged();else{saveBrushPreferences();refresh();}});menu.addChild(item);}
    menu.addChild(new PixelMenuSeparator(skin_));heading(U"\u8fde\u63a5\u65b9\u5f0f");
    for(int n:{4,8}){auto item=new PixelMenuItem(font_,skin_,unicodeText(std::to_string(n))+U" \u65b9\u8fde\u63a5");item->checked=[connectivity,n]{return connectivity==n;};item->Click.connect([this,n,gradient]{fillOptions_.connectivity=wandOptions_.connectivity=gradientOptions_.connectivity=n;if(gradient)gradientChanged();else{saveBrushPreferences();refresh();}});menu.addChild(item);}
    const auto at=trigger->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();
  }
  void showGradientStopsMenu(bool verify=false){
    gradientFreeform_=true;if(gradientStops_.size()<2)gradientStops_={{0,ink_},{1,document.palette().secondary}};
    ToolPropertyPopup popup(skin_,font_,U"自由色标");popup.setDisplay(display(),false);popup.setWantFocus(true);popup.setBounds(toolPopupBounds(gradientFreeformButton_,244,116));
    auto track=new GradientStopsTrack(toolIcons_);track->stops=&gradientStops_;track->selected=&gradientStop_;popup.place(track,{6,24,232,22});
    auto position=new PixelEntry(font_,skin_);position->numeric=true;position->suffix=U"%";popup.place(position,{6,50,60,17});
    auto color=new PixelEntry(font_,skin_);popup.place(color,{70,50,96,17});
    auto sync=[&]{gradientStop_=std::clamp(gradientStop_,0,int(gradientStops_.size())-1);if(!position->hasFocus())position->setText(std::to_string(gradientRound(gradientStops_[gradientStop_].position*100)));if(!color->hasFocus())color->setText(paletteHex(gradientStops_[gradientStop_].color));track->invalidate();};sync();
    track->changed=[&,this]{sync();gradientChanged();};
    position->Change.connect([&,this]{try{auto stop=gradientStops_[gradientStop_];const double next=std::stod(position->text())/100;if(!std::isfinite(next))return;const double previous=stop.position;stop.position=std::clamp(next,0.0,1.0);if(stop.position==0 || stop.position==1)for(int i=0;i<int(gradientStops_.size());++i)if(i!=gradientStop_ && gradientStops_[i].position==stop.position)gradientStops_[i].position=previous;gradientStops_[gradientStop_]=stop;sortGradientStops(stop);sync();}catch(...){} });
    color->Change.connect([&,this]{Pixel next;if(parsePaletteHex(color->text(),next)){gradientStops_[gradientStop_].color=next;gradientChanged();track->invalidate();}});
    for(int index:{14,15,16,17}){auto source=static_cast<PixelButton*>(gradientControls_[index].first);auto action=new PixelButton(font_,skin_,source->caption,[&,source]{source->Click();sync();});popup.place(action,{6+(index-14)*58,73,56,18});}
    auto close=new PixelButton(font_,skin_,U"关闭",[&]{popup.closeWindow(nullptr);});popup.place(close,{182,94,56,18});
    ui::Timer timer(50,&popup);if(verify){timer.Tick.connect([&]{if(track->parent()!=&popup || position->parent()!=&popup || color->parent()!=&popup)throw std::runtime_error("Gradient editor controls must belong to dialog");for(auto widget:{static_cast<ui::Widget*>(track),static_cast<ui::Widget*>(position),static_cast<ui::Widget*>(color),static_cast<ui::Widget*>(close)}){const auto point=popup.display()->nativeWindow()->pointToScreen(widget->bounds().center());if(manager()->pickFromScreenPos(point)!=widget || !manager()->isWidgetClickable(widget))throw std::runtime_error("Property dialog click blocked: target="+std::to_string(widget==track?0:widget==position?1:widget==color?2:3)+" bounds="+std::to_string(widget->bounds().x)+","+std::to_string(widget->bounds().y)+" popup="+std::to_string(popup.bounds().x)+","+std::to_string(popup.bounds().y)+" picked="+std::to_string(manager()->pickFromScreenPos(point)==&popup)+" clickable="+std::to_string(manager()->isWidgetClickable(widget)));ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,widget->bounds().center());down.setDisplay(popup.display());down.setFromFilter(true);if(manager()->sendMessage(&down))throw std::runtime_error("Background global filter swallowed popup click");}timer.stop();popup.closeWindow(nullptr);});timer.start();}
    popup.openWindowInForeground();requestFocus();gradientChanged();
  }
  void showFillTexturePopup(bool verify=false){
    ToolPropertyPopup popup(skin_,font_,U"填充纹理");popup.setDisplay(display(),false);popup.setWantFocus(true);popup.setBounds(toolPopupBounds(fillTextureButton_,150,116));
    auto range=new PixelSlider(font_,skin_);range->minimum=1;range->maximum=16;range->value=fillPattern_.textureScale;range->percentage=false;popup.place(range,{6,92,138,18});range->setVisible(fillPattern_.texture!=FillTexture::Solid);
    range->changed=[this](int value){fillPattern_.textureScale=value;saveBrushPreferences();refresh();};
    std::array<PixelButton*,4> choices{};const char32_t* names[]{U"纯色",U"裂纹",U"木纹",U"颗粒"};
    for(int i=0;i<4;++i){auto choice=new PixelButton(font_,skin_,names[i],[&,i]{fillPattern_.texture=FillTexture(i);range->setVisible(i!=0);for(int j=0;j<4;++j){choices[j]->active=j==i;choices[j]->invalidate();}saveBrushPreferences();refresh();});choices[i]=choice;choice->active=int(fillPattern_.texture)==i;popup.place(choice,{6+(i%2)*70,24+(i/2)*22,68,18});}
    auto close=new PixelButton(font_,skin_,U"关闭",[&]{popup.closeWindow(nullptr);});popup.place(close,{6,70,138,18});
    ui::Timer timer(50,&popup);if(verify){timer.Tick.connect([&]{if(range->parent()!=&popup || fillTextureScale_->isVisible())throw std::runtime_error("Texture scale must stay inside popup");timer.stop();popup.closeWindow(nullptr);});timer.start();}
    popup.openWindowInForeground();requestFocus();
  }
  PixelButton* gradientRadialButton_=nullptr;
  void createGradientOptions(){
    auto control=[&](const char32_t* name,int width,std::function<void()> action){auto b=button(name,[this,action]{action();gradientChanged();});gradientControls_.push_back({b,width});return b;};
    gradientType_=control(U"线性",47,[this]{gradientSpec_.radial=false;gradientSpec_.geometry.reset();gradientGeometry_={};});gradientType_->caption.clear();gradientType_->iconSkin=&toolIcons_;gradientType_->icon="gradient-linear";gradientType_->iconGroupCount=2;
    gradientRadialButton_=button(U"",[this]{gradientSpec_.radial=true;gradientSpec_.geometry.reset();gradientGeometry_={};gradientChanged();});gradientRadialButton_->iconSkin=&toolIcons_;gradientRadialButton_->icon="gradient-radial";gradientRadialButton_->iconGroupCount=2;gradientRadialButton_->iconGroupIndex=1;

    control(U"容差",28,[]{})->labelOnly=true;
    gradientTolerance_=new PixelEntry(font_,skin_);gradientTolerance_->numeric=true;addChild(gradientTolerance_);gradientControls_.push_back({gradientTolerance_,32});auto tolerance=[this]{try{std::size_t used=0;const auto n=std::stod(gradientTolerance_->text(),&used);if(used==gradientTolerance_->text().size() && std::isfinite(n))gradientOptions_.tolerance=gradientRound(std::clamp(n,0.0,255.0));}catch(...){}gradientChanged();};gradientTolerance_->Change.connect(tolerance);gradientTolerance_->blur=tolerance;gradientTolerance_->accept=[this,tolerance]{tolerance();requestFocus();};
    gradientContiguous_=control(U"连续",45,[this]{gradientOptions_.contiguous=!gradientOptions_.contiguous;});gradientContiguous_->iconSkin=&toolIcons_;gradientContiguous_->bareIconWithCaption=true;
    gradientReference_=control(U"",15,[this]{showFillSettings(gradientReference_,true);});gradientReference_->icon="properties";gradientReference_->iconSkin=&toolIcons_;
    gradientConnectivity_=control(U"4 方连接",57,[this]{fillOptions_.connectivity=wandOptions_.connectivity=gradientOptions_.connectivity=gradientOptions_.connectivity==4?8:4;});
    gradientDither_=control(U"无抖动",92,[this]{PixelMenu menu(skin_);const char32_t* names[]{U"无抖动",U"Bayer 2×2",U"Bayer 4×4",U"Bayer 8×8",U"棋盘",U"对角线",U"反向对角线",U"水平线",U"垂直线"};for(int i=0;i<9;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->checked=[this,i]{return gradientSpec_.dither==i;};item->Click.connect([this,i]{gradientSpec_.dither=i;gradientChanged();});menu.addChild(item);}menu.showPopup(gfx::Point(gradientDither_->bounds().x,gradientDither_->bounds().y2()),display());});gradientDither_->iconSkin=&toolIcons_;gradientDither_->icon="dither";gradientDither_->iconWithCaption=true;
    gradientFreeformButton_=control(U"自由色标",65,[this]{showGradientStopsMenu();});gradientFreeformButton_->iconSkin=&toolIcons_;gradientFreeformButton_->bareIconWithCaption=false;
    gradientMode_=control(U"即时应用",65,[this]{gradientConfirm_=!gradientConfirm_;});
    control(U"应用",40,[this]{applyGradientGesture();});control(U"取消",40,[this]{cancelGradientGesture();});
    control(U"色标",40,[this]{PixelMenu menu(skin_);for(int i=0;i<int(gradientStops_.size());++i){auto item=new PixelMenuItem(font_,skin_,unicodeText(std::to_string(gradientRound(gradientStops_[i].position*100)))+U"% "+unicodeText(paletteHex(gradientStops_[i].color)));item->checked=[this,i]{return gradientStop_==i;};item->Click.connect([this,i]{gradientStop_=i;layoutToolOptions();invalidate();});menu.addChild(item);}auto anchor=gradientControls_[11].first->bounds();menu.showPopup(gfx::Point(anchor.x,anchor.y2()),display());});
    gradientStopPosition_=new PixelEntry(font_,skin_);gradientStopPosition_->numeric=true;gradientStopPosition_->suffix=U"%";addChild(gradientStopPosition_);gradientControls_.push_back({gradientStopPosition_,48});auto position=[this]{if(gradientStops_.empty())return;try{std::size_t used=0;const auto n=std::stod(gradientStopPosition_->text(),&used);if(used!=gradientStopPosition_->text().size() || !std::isfinite(n))return;auto& stop=gradientStops_[gradientStop_];const double old=stop.position,next=std::clamp(n/100,0.0,1.0);if(next!=old && (next==0 || next==1))for(int i=0;i<int(gradientStops_.size());++i)if(i!=gradientStop_ && gradientStops_[i].position==next)gradientStops_[i].position=old;stop.position=next;sortGradientStops(stop);}catch(...){} };gradientStopPosition_->Change.connect(position);gradientStopPosition_->blur=position;gradientStopPosition_->accept=[this,position]{position();requestFocus();};
    gradientStopColor_=new PixelEntry(font_,skin_);addChild(gradientStopColor_);gradientControls_.push_back({gradientStopColor_,80});auto color=[this]{if(gradientStops_.empty())return;Pixel next;if(parsePaletteHex(gradientStopColor_->text(),next)){gradientStops_[gradientStop_].color=next;gradientChanged();}};gradientStopColor_->Change.connect(color);gradientStopColor_->blur=color;gradientStopColor_->accept=[this,color]{color();requestFocus();};
    control(U"添加",40,[this]{addGradientStop();});control(U"删除",40,[this]{if(gradientStops_.size()>2){gradientStops_.erase(gradientStops_.begin()+gradientStop_);gradientStop_=std::max(0,gradientStop_-1);}});
    control(U"反转",40,[this]{for(auto& s:gradientStops_)s.position=1-s.position;std::reverse(gradientStops_.begin(),gradientStops_.end());gradientStop_=int(gradientStops_.size())-1-gradientStop_;});
    control(U"重置",40,[this]{gradientStops_={{0,ink_},{1,document.palette().secondary}};gradientStop_=0;});auto track=new GradientStopsTrack(toolIcons_);track->stops=&gradientStops_;track->selected=&gradientStop_;track->changed=[this]{gradientChanged();};addChild(track);gradientControls_.push_back({track,180});
  }
  void connectLegacyPropertyRanges(){
    auto bind=[this](PixelEntry* entry,int minimum,int maximum){entry->focus=[this,entry,minimum,maximum]{showPropertyRange(entry,minimum,maximum);};};
    bind(wandToleranceInput_,0,255);bind(wandGapInput_,1,16);bind(fillToleranceInput_,0,255);bind(fillGapInput_,1,16);bind(gradientTolerance_,0,255);bind(selectionBrushAngleInput_,-180,180);
  }
  void createShapeOptions(){auto option=[&](const char32_t* text,int width,std::function<void()> action){auto b=button(text,[this,action]{action();saveBrushPreferences();layoutToolOptions();invalidate();});shapeControls_.push_back({b,width});return b;};shapeModeButton_=option(U"矩形填充",76,[this]{showToolGroup(shapeSpec_.kind==ShapeKind::Line?5:4);});shapeModeButton_->iconSkin=&toolIcons_;shapeModeButton_->iconWithCaption=true;shapeRoundedButton_=option(U"圆角",45,[this]{shapeRounded_=!shapeRounded_;});shapeRatioButton_=option(U"固定比例",65,[this]{shapeRatio_=!shapeRatio_;});for(auto b:{shapeRoundedButton_,shapeRatioButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}
    auto number=[&](int field,const char32_t* suffix,int width){auto input=new PixelEntry(font_,skin_);input->numeric=true;input->suffix=suffix;addChild(input);shapeControls_.push_back({input,width});auto commit=[this,input,field]{try{std::size_t used=0;const auto value=std::stod(input->text(),&used);if(used!=input->text().size() || !std::isfinite(value))return;if(field==0)shapeRadius_=gradientRound(std::clamp(value,0.0,256.0));else (field==1?shapeRatioWidth_:shapeRatioHeight_)=std::floor(std::clamp(value,.1,100.0)*10+.5)/10;saveBrushPreferences();layoutToolOptions();invalidate();}catch(...){} };input->Change.connect(commit);input->blur=commit;input->accept=[this,commit]{commit();requestFocus();};return input;};shapeRadiusInput_=number(0,U"px",48);shapeRatioWidthInput_=number(1,U"",38);shapeRatioHeightInput_=number(2,U"",38);auto swap=option(U"",19,[this]{std::swap(shapeRatioWidth_,shapeRatioHeight_);});swap->iconSkin=&toolIcons_;swap->icon="swap";
  }
  std::vector<PixelDropdown*> propertyDropdowns_;
  void migratePropertyDropdowns() {
    auto convert=[this](PixelButton*& old,std::vector<std::u32string> names,std::function<int()> current,std::function<void(int)> choose) {
      auto next=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(next);addChild(next);
      next->setOptions(std::move(names));next->setSelectedIndex(current());
      next->prepareOptions=[next,current]{next->setSelectedIndex(current());};propertyDropdowns_.push_back(next);
      next->changed=[this,choose](int index){choose(index);saveBrushPreferences();refresh();};
      auto replace=[&](auto& controls){for(auto& c:controls)if(c.first==old){c.first=next;c.second=std::max(c.second,font_.measure(next->caption)+25);}};
      replace(toolControls_);replace(selectionControls_);replace(fillControls_);replace(gradientControls_);replace(shapeControls_);
      auto previous=old;old=next;removeChild(previous);delete previous;
    };
    convert(selectionAlgorithmButton_,{U"\u5feb\u901f\u65cb\u8f6c",U"RotSprite"},[this]{return selectionRotSprite_;},[this](int i){selectionRotSprite_=i!=0;if(auto target=document.floatingTransform())document.transformFloatingPaste(*target,selectionRotSprite_);});
    convert(gradientDither_,{U"\u65e0\u6296\u52a8",U"Bayer 2\u00d72",U"Bayer 4\u00d74",U"Bayer 8\u00d78",U"\u68cb\u76d8",U"\u5bf9\u89d2\u7ebf",U"\u53cd\u5411\u5bf9\u89d2\u7ebf",U"\u6c34\u5e73\u7ebf",U"\u5782\u76f4\u7ebf"},[this]{return gradientSpec_.dither;},[this](int i){gradientSpec_.dither=i;gradientChanged();});
    convert(eyedropperSourceButton_,{U"\u5408\u6210\u56fe\u50cf",U"\u5f53\u524d\u56fe\u5c42"},[this]{return eyedropperSource_==EyedropperSource::CurrentLayer;},[this](int i){eyedropperSource_=i?EyedropperSource::CurrentLayer:EyedropperSource::Composite;try{if(!smoke_){const auto path=palettePreferencePath().parent_path()/"eyedropper-source.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out.exceptions(std::ios::failbit|std::ios::badbit);out<<(i?"current-layer":"composite");}}catch(const std::exception& e){status_=U"\u5438\u7ba1\u8bbe\u7f6e\u4fdd\u5b58\u5931\u8d25:"+unicodeText(e.what());}});
  }
  static constexpr int propertyIconWidth=15,propertyIconHeight=16;
  int propertyControlWidth(ui::Widget* control,int width) const {
    const auto button=dynamic_cast<PixelButton*>(control);
    if(control==gradientType_)return 29;
    if(auto dropdown=dynamic_cast<PixelDropdown*>(control))return std::max(width,font_.measure(dropdown->caption)+25);
    return button && !button->icon.empty() && button->caption.empty()?propertyIconWidth:width;
  }
  void placePropertyControl(ui::Widget* control,int x,int width) {
    const auto button=dynamic_cast<PixelButton*>(control);
    const int height=dynamic_cast<PixelDropdown*>(control)?16:dynamic_cast<PixelEntry*>(control)?17:button && !button->icon.empty() && button->caption.empty()?propertyIconHeight:button && !button->caption.empty() && button->icon.empty() && !button->labelOnly?18:Layout::optionsHeight;
    control->setBounds(uiPhysical(gfx::Rect(x,uiLogical(bounds()).y+Layout::optionsY+Layout::optionsHeight-height,propertyControlWidth(control,width),height)));
  }
  bool supportsToolSymmetry()const{return !handTool_ && !zoomTool_ && !gradientTool_ && !eyedropperTool_;}
  void layoutSymmetryOptions(){
    const auto rc=uiLogical(bounds());const auto layout=workspaceLayout(rc);
    int left=rc.x+layout.workX;
    auto include=[&](ui::Widget* control){if(!control->hasFlags(ui::HIDDEN))left=std::max(left,control->bounds().x2()/uiScale+uiGap);};
    for(const auto& c:toolControls_)if(std::find(symmetryButtons_.begin(),symmetryButtons_.end(),c.first)==symmetryButtons_.end())include(c.first);
    for(const auto* controls:{&selectionControls_,&fillControls_,&gradientControls_,&shapeControls_})for(const auto& c:*controls)include(c.first);
    const int right=commands_[3]->bounds().x/uiScale-uiGap;left=std::min(left,right-85);const bool show=supportsToolSymmetry();
    for(int i=0;i<6;++i){auto b=symmetryButtons_[i];if(!b)continue;placePropertyControl(b,left+i*14,15);b->setVisible(show && left+85<=right);b->setEnabled(pending_==Pending::None && !document.active() && !selectionDragging_ && !symmetryDragging_);if(i<5)b->active=symmetryFlag(i);}
  }
  void layoutToolRail() {
    if(!railScrollBar_)return;const auto rc=uiLogical(clientBounds());const auto l=workspaceLayout(rc);
    const auto viewport=toDisplay(gfx::Rect(Layout::edge,l.tabY,Layout::toolSize,std::max(1,l.bottom-l.tabY)));
    const int total=(int(toolRail_.size())*(Layout::toolHeight+Layout::toolGap)+1)*uiScale;
    railScrollPixels_=std::clamp(railScrollPixels_,0,std::max(0,total-viewport.h));
    for(std::size_t i=0;i<toolRail_.size();++i){auto b=toolRail_[i];b->setBounds(toDisplay(gfx::Rect(Layout::edge,l.tabY+int(i)*(Layout::toolHeight+Layout::toolGap),Layout::toolSize,Layout::toolHeight)).offset(0,-railScrollPixels_));b->paletteViewport=[viewport]{return viewport;};b->setVisible(!homeOpen_ && viewport.intersects(b->bounds()));}
    railScrollBar_->setDockBounds(gfx::Rect(viewport.x2(),viewport.y,7*uiScale,viewport.h));railScrollBar_->configure(total,viewport.h,railScrollPixels_);railScrollBar_->wheelStep=(Layout::toolHeight+Layout::toolGap)*uiScale;railScrollBar_->setVisible(!homeOpen_ && total>viewport.h);railScrollBar_->setEnabled(pending_==Pending::None);
  }
  void finishToolScrollLayout() {
    const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
    const int left=(rc.x+l.workX)*uiScale,right=commands_[3]->bounds().x-uiGap*uiScale-(supportsToolSymmetry()?(85+uiGap)*uiScale:0);
    const gfx::Rect viewport(left,(rc.y+Layout::optionsY)*uiScale,std::max(uiScale,right-left),Layout::optionsHeight*uiScale);
    std::vector<ui::Widget*> controls;auto add=[&](ui::Widget* w){if(w && w->parent()==this && !w->hasFlags(ui::HIDDEN) && std::find(controls.begin(),controls.end(),w)==controls.end())controls.push_back(w);};
    for(auto& c:toolControls_)if(std::find(symmetryButtons_.begin(),symmetryButtons_.end(),c.first)==symmetryButtons_.end())add(c.first);
    for(const auto* list:{&selectionControls_,&fillControls_,&gradientControls_,&shapeControls_})for(const auto& c:*list)add(c.first);
    for(auto w:selectionModeButtons_)if(!selectionControls_.empty() && !selectionControls_[0].first->hasFlags(ui::HIDDEN))add(w);
    add(gradientRadialButton_);add(eyedropperSourceButton_);
    int end=left;for(auto w:controls)end=std::max(end,w->bounds().x2());const int total=end-left;
    toolRowScroll_=std::clamp(toolRowScroll_,0,std::max(0,total-viewport.w));
    for(auto w:controls){scrollViewports_[w]=viewport;if(w->children().empty())w->setBounds(w->bounds().offset(-toolRowScroll_,0));else {w->setBoundsQuietly(w->bounds().offset(-toolRowScroll_,0));for(auto child:w->children())child->setBounds(child->bounds().offset(-toolRowScroll_,0));}w->setVisible(viewport.intersects(w->bounds()));if(auto b=dynamic_cast<PixelButton*>(w))b->paletteViewport=[viewport]{return viewport;};if(auto entry=dynamic_cast<PixelEntry*>(w))entry->paletteViewport=[viewport]{return viewport;};}
    for(auto b:selectionModeButtons_)if(b)b->paletteViewport=[viewport]{return viewport;};
    int symmetryX=left;for(auto w:controls)if(!w->hasFlags(ui::HIDDEN))symmetryX=std::max(symmetryX,std::min(w->bounds().x2(),viewport.x2())+uiGap*uiScale);
    if(supportsToolSymmetry())for(int i=0;i<6;++i)if(symmetryButtons_[i]){auto b=symmetryButtons_[i];auto r=b->bounds();r.x=symmetryX+i*14*uiScale;b->setBounds(r);b->setVisible(symmetryX+85*uiScale<=commands_[3]->bounds().x-uiGap*uiScale);}

  }
  void layoutToolOptions() {
    struct Finish {Editor& editor;~Finish(){editor.finishToolScrollLayout();}} finish{*this};
    if(!document.selection())selectionPropertiesActive_=false;
    if(toolControls_.empty()) return;
    for(auto dropdown:propertyDropdowns_)if(dropdown->prepareOptions)dropdown->prepareOptions();
    for(int i=0;i<5;++i)if(symmetryButtons_[i])symmetryButtons_[i]->active=symmetryFlag(i);
    if(brushRange_ && (handTool_ || pending_!=Pending::None)) brushRange_->setVisible(false);
    const auto rc=uiLogical(bounds());const auto optionsLayout=workspaceLayout(rc);const bool usable=pending_==Pending::None && !document.active();if(toolRail_.size()>3){const char* icons[]{"selection-rectangle-normal","selection-ellipse-normal","selection-lasso-normal","selection-polygon-lasso-normal","selection-magic-normal","selection-brush-normal"};toolRail_[3]->icon=icons[selectionKind_];}
    if(homeButton_){homeButton_->setEnabled(usable);homeButton_->setVisible(true);}
    commands_[0]->setVisible(false);
    commands_[3]->setBounds(uiPhysical(gfx::Rect(rc.x+optionsLayout.workX+optionsLayout.workW-43-uiGap-43,rc.y+Layout::optionsY,43,19)));
    commands_[4]->setBounds(uiPhysical(gfx::Rect(rc.x+optionsLayout.workX+optionsLayout.workW-43,rc.y+Layout::optionsY,43,19)));
    if(eyedropperSourceButton_)eyedropperSourceButton_->setVisible(false);
    for(auto& control:fillControls_)control.first->setVisible(false);
    for(auto& control:gradientControls_)control.first->setVisible(false);
    if(gradientRadialButton_)gradientRadialButton_->setVisible(false);
    for(auto& control:shapeControls_)control.first->setVisible(false);
    if(zoomTool_){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);layoutSymmetryOptions();return;}
    if(eyedropperTool_ && eyedropperSourceButton_){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);eyedropperSourceButton_->caption=eyedropperSource_==EyedropperSource::Composite?U"合成图像":U"当前图层";placePropertyControl(eyedropperSourceButton_,rc.x+optionsLayout.workX,76);eyedropperSourceButton_->setVisible(true);eyedropperSourceButton_->setEnabled((usable || replaceSampling_>=0) && !eyedropperGesture_.active());layoutSymmetryOptions();return;}
    if(shapeTool_ && !shapeControls_.empty()){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);const bool line=shapeSpec_.kind==ShapeKind::Line,rect=shapeSpec_.kind==ShapeKind::Rectangle || shapeSpec_.kind==ShapeKind::RectangleOutline,outline=shapeSpec_.kind==ShapeKind::RectangleOutline || shapeSpec_.kind==ShapeKind::EllipseOutline;int x=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-(supportsToolSymmetry()?85+uiGap:0);const char32_t* labels[]{U"直线",U"矩形描边",U"矩形填充",U"椭圆描边",U"椭圆填充"};const char* icons[]{"shape-line-normal","shape-rectangle-normal","shape-rectangle-fill-normal","shape-ellipse-normal","shape-ellipse-fill-normal"};shapeModeButton_->caption=labels[int(shapeSpec_.kind)];shapeModeButton_->icon=icons[int(shapeSpec_.kind)];if(toolRail_.size()>5){toolRail_[shapeSpec_.kind==ShapeKind::Line?5:4]->icon=icons[int(shapeSpec_.kind)];}shapeRoundedButton_->icon=shapeRounded_?"check":"checkboxUnchecked";shapeRatioButton_->icon=shapeRatio_?"check":"checkboxUnchecked";if(!shapeRadiusInput_->hasFocus())shapeRadiusInput_->setText(std::to_string(shapeRadius_));for(auto field:{shapeRatioWidthInput_,shapeRatioHeightInput_})if(!field->hasFocus()){std::ostringstream text;text<<(field==shapeRatioWidthInput_?shapeRatioWidth_:shapeRatioHeight_);field->setText(text.str());}
      auto place=[&](ui::Widget* w,int width){width=propertyControlWidth(w,width);placePropertyControl(w,x,width);w->setVisible(true);w->setEnabled(usable && !shapeDragging_);x+=width+uiGap;};shapeModeButton_->setVisible(false);if(line){brushShapeButton_->icon=brushProfiles_[0].shape==BrushShape::Round?"brush-round":brushProfiles_[0].shape==BrushShape::Square?"brush-square":"brush-line";place(brushShapeButton_,15);}if(line || outline){if(!brushSizeInput_->hasFocus())brushSizeInput_->setText(std::to_string(brushProfiles_[0].size));place(brushSizeInput_,toolControls_[3].second);}if(!line){if(rect){place(shapeRoundedButton_,45);if(shapeRounded_)place(shapeRadiusInput_,48);}place(shapeRatioButton_,65);if(shapeRatio_){place(shapeRatioWidthInput_,38);place(shapeRatioHeightInput_,38);place(shapeControls_[6].first,19);}}layoutSymmetryOptions();return;}
    if(gradientTool_ && !gradientControls_.empty()){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);const int left=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-(supportsToolSymmetry()?85+uiGap:0);int total=0;for(int i=0;i<int(gradientControls_.size());++i)if((i<9 && i!=5) || (i>=9 && i<11 && gradientPending_))total+=propertyControlWidth(gradientControls_[i].first,gradientControls_[i].second)+uiGap;int x=left;
      gradientType_->caption.clear();gradientType_->icon="gradient-linear";gradientType_->active=!gradientSpec_.radial;gradientRadialButton_->active=gradientSpec_.radial;if(!gradientTolerance_->hasFocus())gradientTolerance_->setText(std::to_string(gradientOptions_.tolerance));gradientContiguous_->icon=gradientOptions_.contiguous?"check":"checkboxUnchecked";gradientReference_->caption.clear();gradientConnectivity_->caption=gradientOptions_.connectivity==4?U"4 方连接":U"8 方连接";const char32_t* dithers[]{U"无抖动",U"Bayer 2×2",U"Bayer 4×4",U"Bayer 8×8",U"棋盘",U"对角线",U"反向对角线",U"水平线",U"垂直线"};gradientDither_->caption=dithers[gradientSpec_.dither];gradientFreeformButton_->icon.clear();gradientMode_->caption=gradientConfirm_?U"确认应用":U"即时应用";if(!gradientStops_.empty()){gradientStop_=std::clamp(gradientStop_,0,int(gradientStops_.size())-1);if(!gradientStopPosition_->hasFocus()){std::ostringstream text;text<<gradientStops_[gradientStop_].position*100;gradientStopPosition_->setText(text.str());}if(!gradientStopColor_->hasFocus())gradientStopColor_->setText(paletteHex(gradientStops_[gradientStop_].color));}
      for(int i=0;i<int(gradientControls_.size());++i){auto [w,width]=gradientControls_[i];width=propertyControlWidth(w,width);const bool applies=(i<9 && i!=5) || (i>=9 && i<11 && gradientPending_);w->setVisible(applies);w->setEnabled(pending_==Pending::None && !gradientDragging_);placePropertyControl(w,x,width);if(i==0){gradientType_->setBounds(uiPhysical(gfx::Rect(x,rc.y+Layout::optionsY+Layout::optionsHeight-16,15,16)));placePropertyControl(gradientRadialButton_,x+14,15);gradientRadialButton_->setVisible(!w->hasFlags(ui::HIDDEN));gradientRadialButton_->setEnabled(w->isEnabled());}if(applies)x+=width+uiGap;}if(toolRail_.size()>6)toolRail_[6]->icon="tool-gradient-normal";layoutSymmetryOptions();return;}
    if(toolRail_.size()>6)toolRail_[6]->icon=rememberGradientTool_?"tool-gradient-normal":"tool-fill-normal";
    if(fillTool_){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);int x=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-(supportsToolSymmetry()?85+uiGap:0);
      if(!fillToleranceInput_->hasFocus())fillToleranceInput_->setText(std::to_string(fillOptions_.tolerance));if(!fillGapInput_->hasFocus())fillGapInput_->setText(std::to_string(fillOptions_.gapThreshold));fillContiguousButton_->icon=fillOptions_.contiguous?"check":"checkboxUnchecked";fillGapButton_->icon=fillOptions_.gapClosing?"check":"checkboxUnchecked";fillConnectivityButton_->caption=fillOptions_.connectivity==4?U"4 方连接":U"8 方连接";fillReferenceButton_->caption.clear();
      const char32_t* textureNames[]{U"纯色",U"裂纹",U"木纹",U"颗粒"};fillTextureButton_->caption=textureNames[int(fillPattern_.texture)];fillImageButton_->active=!fillPattern_.brushes.empty();if(!fillTextureScale_->hasFocus())fillTextureScale_->setText(std::to_string(fillPattern_.textureScale));
      for(std::size_t i=0;i<fillControls_.size();++i){auto [control,width]=fillControls_[i];width=propertyControlWidth(control,width);const bool show=control!=fillTextureScale_ && i!=5 && (fillOptions_.contiguous || (i!=3 && i!=4));control->setVisible(show);control->setEnabled(usable && !fillDragging_ && (i!=4 || fillOptions_.gapClosing));placePropertyControl(control,x,width);if(show)x+=width+uiGap;}layoutSymmetryOptions();return;}
    if(selectionTool_){if(brushRange_ && selectionKind_!=5)brushRange_->setVisible(false);for(auto& c:toolControls_)c.first->setVisible(false);int x=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-(supportsToolSymmetry()?85+uiGap:0);
      if(selectionKind_==5 && !selectionPropertiesActive_){const auto& brush=brushProfiles_[0];if(!brushSizeInput_->hasFocus())brushSizeInput_->setText(std::to_string(brush.size));brushSizeInput_->setEnabled(usable && !selectionDragging_);brushShapeButton_->setEnabled(usable && !selectionDragging_);brushShapeButton_->icon=brush.shape==BrushShape::Round?"brush-round":brush.shape==BrushShape::Square?"brush-square":"brush-line";for(auto index:{0,3}){auto& control=toolControls_[index];control.first->setVisible(true);placePropertyControl(control.first,x,control.second);x+=control.second+uiGap;}}
      selectionRoundedButton_->icon=selectionRounded_?"check":"checkboxUnchecked";if(!selectionCornerRadiusInput_->hasFocus())selectionCornerRadiusInput_->setText(std::to_string(selectionCornerRadius_));
      const char32_t* modes[]{U"替换选区",U"添加选区",U"减去选区",U"相交选区"};for(int i=0;i<4;++i)selectionModeButtons_[i]->active=i==(selectionRight_?2:selectionShift_?1:selectionMode_);
      selectionAlgorithmButton_->caption=selectionRotSprite_?U"RotSprite":U"快速旋转";if(!selectionBrushAngleInput_->hasFocus())selectionBrushAngleInput_->setText(std::to_string(selectionBrushAngle_));if(!wandToleranceInput_->hasFocus())wandToleranceInput_->setText(std::to_string(wandOptions_.tolerance));if(!wandGapInput_->hasFocus())wandGapInput_->setText(std::to_string(wandOptions_.gapThreshold));wandContiguousButton_->icon=wandOptions_.contiguous?"check":"checkboxUnchecked";wandGapButton_->icon=wandOptions_.gapClosing?"check":"checkboxUnchecked";wandConnectivityButton_->caption=wandOptions_.connectivity==4?U"4 方连接":U"8 方连接";wandReferenceButton_->caption.clear();
      if(auto target=selectionTransformTarget()){const double values[]{target->x,target->y,target->width*(target->flipHorizontal?-1:1),target->height*(target->flipVertical?-1:1),target->angle};for(int i=0;i<5;++i)if(!selectionTransformFields_[i]->hasFocus()){std::ostringstream text;text<<values[i];selectionTransformFields_[i]->setText(text.str());}}
      for(std::size_t i=0;i<selectionControls_.size();++i){auto [control,width]=selectionControls_[i];width=propertyControlWidth(control,width);const bool show=i!=6 && ((i==9 && selectionPropertiesActive_) || (i==17 && selectionKind_==0 && !selectionPropertiesActive_) || (i==18 && selectionKind_==0 && selectionRounded_ && !selectionPropertiesActive_) || ((i==15 || i==16) && document.selection()) || (selectionPropertiesActive_ && document.selection()?i>=10 && i<17:i==0 || (selectionKind_==4 && i>0 && i<8) || (selectionKind_==5 && i==8 && brushProfiles_[0].size>1 && brushProfiles_[0].shape!=BrushShape::Round)));control->setVisible(show);control->setEnabled((usable || document.floating()) && !selectionDragging_ && !floatingDragging_ && (control!=wandGapButton_ && control!=wandGapInput_ || wandOptions_.contiguous));placePropertyControl(control,x,width);if(i==0)for(int m=0;m<4;++m)selectionModeButtons_[m]->setBounds(uiPhysical(gfx::Rect(x+m*14,rc.y+Layout::optionsY+Layout::optionsHeight-propertyIconHeight,propertyIconWidth,propertyIconHeight)));if(show)x+=width+uiGap;}layoutSymmetryOptions();return;}
    for(auto& c:selectionControls_)c.first->setVisible(false);
    const int profile=eraser_?1:0;const auto& brush=brushProfiles_[profile];
    updatingBrushFields_=true;
    if(!brushSizeInput_->hasFocus() || shownBrushProfile_!=profile) brushSizeInput_->setText(std::to_string(brush.size));
    if(!brushOpacityInput_->hasFocus() || shownBrushProfile_!=profile) brushOpacityInput_->setText(std::to_string(brush.opacity));
    updatingBrushFields_=false;shownBrushProfile_=profile;
    brushShapeButton_->icon=brush.shape==BrushShape::Round?"brush-round":brush.shape==BrushShape::Square?"brush-square":"brush-line";
    brushShapeButton_->active=pencilImageBrushId_.empty();imageBrushButton_->active=!pencilImageBrushId_.empty();imageBrushButton_->setEnabled(usable);brushShapeButton_->setEnabled(usable);brushSizeInput_->setEnabled(usable && pencilImageBrushId_.empty());brushOpacityInput_->setEnabled(usable);
    const int right=commands_[3]->bounds().x/uiScale-uiGap-(supportsToolSymmetry()?85+uiGap:0),left=rc.x+optionsLayout.workX;int total=0;
    for(std::size_t i=0;i<toolControls_.size();++i) if(std::find(symmetryButtons_.begin(),symmetryButtons_.end(),toolControls_[i].first)==symmetryButtons_.end() && !(eraser_ && toolControls_[i].pencilOnly)) total+=toolControls_[i].second+toolControls_[i].gap;
    int x=left;
    for(std::size_t i=0;i<toolControls_.size();++i) {
      auto& control=toolControls_[i];if(std::find(symmetryButtons_.begin(),symmetryButtons_.end(),control.first)!=symmetryButtons_.end()){control.first->setVisible(false);continue;}const bool applies=!(eraser_ && control.pencilOnly);
      const auto button=dynamic_cast<PixelButton*>(control.first);
      const bool entry=dynamic_cast<PixelEntry*>(control.first)!=nullptr;
      placePropertyControl(control.first,x,control.second);
      control.first->setVisible(!handTool_ && applies);
      if(applies) x+=control.second+control.gap;
    }
    layoutSymmetryOptions();
  }
  void syncPaletteButtons() {
    auto ids=paletteGesture_ && paletteGesture_->moving && paletteGesture_->active?Document::movedPaletteSlots(paletteGesture_->slots,paletteGesture_->ids,int(paletteGesture_->last),paletteGesture_->anchor,paletteGesture_->columns):document.palette().slots;
    if(std::find(ids.begin(),ids.end(),0)==ids.end()) ids.push_back(0);
    while(swatches_.size()<ids.size()) {
      const auto index=swatches_.size();auto b=button(U"",[this,index]{selectSwatch(index,false,false,false);});
      b->paletteCell=true;
      b->paletteRepaint=[this]{invalidateRect(paletteContentBounds());};
      // Shared edges may route mouse messages to the neighboring color cell.
      // Selection hover follows the full surrounding frame, not widget focus.
      b->paletteSelectionHover=[this,b]{return paletteMousePosition_ && b->paletteSelectionContains(*paletteMousePosition_);};
      b->palettePress=[this,index](const ui::MouseMessage& mouse){beginPalettePointer(index,mouse);};
      b->doubleClickLeftOnly=true;
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
  bool paletteOutlineContains(gfx::Point point)const {
    for(const auto& edge:paletteSelectionEdges_)if(std::any_of(edge.pieces.begin(),edge.pieces.end(),[&](auto r){return r.contains(point);}) && skin_.selectionContains(skin_.selectionMaterialBounds(edge.border),point))return true;
    return false;
  }
  std::size_t paletteSlotAt(gfx::Point point) const {
    const auto first=swatches_.front()->paletteColorBounds();const auto origin=first.origin();const int step=(swatchPixels_[swatchSize_]/uiScale-1)*uiScale;
    const int x=std::clamp((point.x-origin.x)/step,0,paletteColumns_-1),y=std::max(0,int(std::floor(double(point.y-origin.y)/step)));
    return std::size_t(y*paletteColumns_+x);
  }
  void beginPalettePointer(std::size_t index,const ui::MouseMessage& mouse) {
    if(!mouse.left() && !mouse.right())return;
    paletteFocusedSlot_=index;
    bool outline=paletteSelectionOverlay_ && paletteSelectionOverlay_->isVisible() && paletteOutlineContains(mouse.position());
    int anchor=0;
    if(outline){double nearest=1e30;for(std::size_t i=0;i<swatches_.size();++i)if(swatches_[i]->active){const auto c=swatches_[i]->paletteColorBounds().center();double distance=double(c.x-mouse.position().x)*(c.x-mouse.position().x)+double(c.y-mouse.position().y)*(c.y-mouse.position().y);if(distance<nearest){nearest=distance;anchor=paletteButtonIds_[i];}}}
    for(std::size_t i=0;i<swatches_.size();++i)if(swatches_[i]->isVisible() && swatches_[i]->active && swatches_[i]->paletteSelectionContains(mouse.position())){outline=true;anchor=paletteButtonIds_[i];break;}
    const auto selected=document.palette().selected;const int id=paletteButtonIds_[index];
    const bool moving=!mouse.shiftPressed() && !mouse.ctrlPressed() && !mouse.cmdPressed() &&
      (mouse.right()?std::find(selected.begin(),selected.end(),id)!=selected.end():outline);
    if(moving){paletteFocused_=true;requestFocus();}
    else selectSwatch(index,mouse.ctrlPressed()||mouse.cmdPressed(),mouse.shiftPressed(),mouse.right());
    if(mouse.shiftPressed() || mouse.ctrlPressed() || mouse.cmdPressed())return;
    paletteGesture_=PaletteGesture{index,index,moving?(mouse.right()?id:(anchor?anchor:id)):id,paletteColumns_,mouse.right(),moving,false,mouse.position(),document.palette().slots,selected,std::chrono::steady_clock::now()};
    captureMouse();
  }
  void updatePalettePointer(gfx::Point point) {
    if(!paletteGesture_)return;auto& g=*paletteGesture_;g.last=paletteSlotAt(point);
    const int dx=point.x-g.origin.x,dy=point.y-g.origin.y;
    if(!g.active && (dx*dx+dy*dy>=4 || (!g.secondary && !g.moving && std::chrono::steady_clock::now()-g.began>=std::chrono::milliseconds(360))))g.active=true;
    if(g.moving){refresh();return;} // Preview only; commit one transaction on release.
    if(g.secondary){if(g.last<g.slots.size())document.selectSecondaryPalette(g.slots[g.last]);}
    else if(g.active)document.selectPaletteBox(g.start,g.last,g.columns);
    refresh();
  }
  void finishPalettePointer(bool cancel=false) {
    if(!paletteGesture_)return;const auto gesture=*paletteGesture_;paletteGesture_.reset();if(hasCapture())releaseMouse();
    if(!cancel && gesture.moving){if(gesture.active)document.repositionPaletteColors(gesture.slots,gesture.ids,int(gesture.last),gesture.anchor,gesture.columns);else if(gesture.secondary)document.selectSecondaryPalette(gesture.anchor);}
    refresh();
  }
  void copyPaletteColors() {
    std::vector<Pixel> colors;for(int id:document.palette().slots)if(std::find(document.palette().selected.begin(),document.palette().selected.end(),id)!=document.palette().selected.end())if(const auto entry=document.paletteEntry(id))colors.push_back(entry->color);
    if(colors.empty())return;paletteClipboard_=colors;std::ostringstream text;text<<"MOONSPRITE_PALETTE_V1:[";
    for(std::size_t i=0;i<colors.size();++i){if(i)text<<',';auto c=colors[i];text<<"{\"r\":"<<(c&255)<<",\"g\":"<<((c>>8)&255)<<",\"b\":"<<((c>>16)&255)<<",\"a\":"<<(c>>24)<<'}';}text<<']';
    if(!clip::set_text(text.str()))status_=U"颜色已复制到内部剪贴板，系统剪贴板不可用";
    refresh();
  }
  void pastePaletteColors() {
    auto colors=paletteClipboard_;std::string text;
    if(clip::get_text(text) && text.size()<=4*1024*1024 && text.rfind("MOONSPRITE_PALETTE_V1:",0)==0){
      // Same RGBA JSON payload as legacy palette-clipboard (internal fallback on malformed text).
      const std::regex entry(R"(\{\s*"r"\s*:\s*(\d+)\s*,\s*"g"\s*:\s*(\d+)\s*,\s*"b"\s*:\s*(\d+)\s*,\s*"a"\s*:\s*(\d+)\s*\})");
      std::vector<Pixel> parsed;for(auto it=std::sregex_iterator(text.begin(),text.end(),entry);it!=std::sregex_iterator() && parsed.size()<65536;++it){Pixel c=0;for(int i=0;i<4;++i)c|=Pixel(std::clamp(std::strtod((*it)[i+1].str().c_str(),nullptr),0.0,255.0))<<(8*i);parsed.push_back(c);}if(!parsed.empty())colors=std::move(parsed);
    }
    if(colors.empty())return;std::vector<std::size_t> targets;
    const auto& p=document.palette();for(std::size_t i=0;i<p.slots.size();++i)if(p.slots[i] && std::find(p.selected.begin(),p.selected.end(),p.slots[i])!=p.selected.end())targets.push_back(i);
    if(targets.empty() && paletteFocusedSlot_)targets.push_back(*paletteFocusedSlot_);
    if(targets.size()==1){const auto start=targets.front();targets.clear();for(std::size_t i=0;i<colors.size();++i)targets.push_back(start+i);}
    document.pastePaletteColors(colors,targets);refresh();
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
    } else {paletteScrollPixels_+=(mouse.wheelDelta().y>0?1:mouse.wheelDelta().y<0?-1:0)*(swatchPixels_[swatchSize_]-uiScale);layoutPalette();invalidate();}
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
    for(const auto& c:state.cels){bool include=replaceScope_=="document" || (replaceScope_=="selection" && c.layerId==document.layer().id && c.frameId==document.frame().id) || (replaceScope_=="layers" && std::find(document.timelineSelection().layers.begin(),document.timelineSelection().layers.end(),c.layerId)!=document.timelineSelection().layers.end()) || (replaceScope_=="frames" && std::find(document.selectedFrames().begin(),document.selectedFrames().end(),c.frameId)!=document.selectedFrames().end()) || (replaceScope_=="cells" && c.layerId==selectedTimelineCelLayer_ && c.frameId==selectedTimelineCelFrame_);if(start>=0){auto it=std::find_if(state.frames.begin(),state.frames.end(),[&](const auto& f){return f.id==c.frameId;});auto index=int(it-state.frames.begin());include=index>=start && index<=end;}if(include)ids.push_back(c.id);}return ids;}
  void cancelReplacePreview(){document.cancelColorAdjustment();document.cancelPaletteReplacement();}
  void updateReplaceUi(){Pixel a,b;const bool valid=parsePaletteHex(replaceInputs_[0]->text(),a) && parsePaletteHex(replaceInputs_[1]->text(),b);bool ready=replaceScope_=="palette"?std::any_of(document.palette().entries.begin(),document.palette().entries.end(),[](const auto& entry){return entry.id!=0;}):!replaceTargets().empty() && (replaceScope_!="selection" || document.selection().has_value());discard_->setEnabled(ready && valid && replaceSource_!=replaceDestination_);replaceScopeButton_->caption=U"范围："+unicodeText(replaceScope_);replacePreviewButton_->icon=replacePreview_?"check":"checkboxUnchecked";replaceRememberButton_->icon=replaceRemember_?"check":"checkboxUnchecked";for(int i=0;i<2;++i)replaceSample_[i]->active=replaceSampling_==i;}
  void previewReplace(){cancelReplacePreview();if(replaceSampling_<0){if(replaceScope_=="palette"){if(document.beginPaletteReplacement(replacePreview_?std::optional<Pixel>{replaceSource_}:std::nullopt))document.updatePaletteReplacement(replaceSource_,replaceDestination_,replacePreview_);}else if(document.beginColorReplacement(replaceTargets(),replaceScope_=="selection"))document.updateColorReplacement(replaceSource_,replaceDestination_,replacePreview_);}updateReplaceUi();saveReplacePreferences();refresh();}
  void changeReplaceColor(int target,Pixel color,bool sampled=false){cancelReplacePreview();if(target==0){document.setPaletteRole(color,false,paletteLocked_);replaceSource_=color;}else replaceDestination_=color;replaceInputs_[target]->setText(paletteHex(color));previewReplace();}
  void beginReplaceSampling(int target){if(replaceSampling_==target){finishReplaceSampling();return;}if(replaceSampling_<0){cancelReplacePreview();replaceReturnTools_={selectionTool_,shapeTool_,gradientTool_,fillTool_,handTool_,eraser_,eyedropperTool_,eyedropperHeld_,zoomTool_};}replaceSampling_=target;selectionTool_=shapeTool_=gradientTool_=fillTool_=handTool_=eraser_=eyedropperHeld_=zoomTool_=false;eyedropperTool_=true;playing_=false;updateReplaceUi();requestFocus();layoutToolOptions();refresh();}
  void finishReplaceSampling(){if(replaceSampling_<0 || replaceSamplingFinishing_)return;replaceSamplingFinishing_=true;if(eyedropperGesture_.active())eyedropperGesture_.finish();if(hasCapture())releaseMouse();replaceSampling_=-1;selectionTool_=replaceReturnTools_[0];shapeTool_=replaceReturnTools_[1];gradientTool_=replaceReturnTools_[2];fillTool_=replaceReturnTools_[3];handTool_=replaceReturnTools_[4];eraser_=replaceReturnTools_[5];eyedropperTool_=replaceReturnTools_[6];eyedropperHeld_=replaceReturnTools_[7];zoomTool_=replaceReturnTools_[8];replaceSamplingFinishing_=false;layoutToolOptions();previewReplace();updateNavigationCursor();}
  void openReplaceColor(){if(pending_!=Pending::None || document.active())return;if(!replaceLoaded_){std::ifstream in(palettePreferencePath().parent_path()/"color-replacement.txt");if(!(in>>replaceScope_>>replacePreview_>>replaceRemember_>>replaceSource_>>replaceDestination_)){replaceScope_="layers";replacePreview_=false;replaceRemember_=true;replaceSource_=document.palette().primary;replaceDestination_=document.palette().secondary;}replaceLoaded_=true;}if(!replaceRemember_){replaceSource_=document.palette().primary;replaceDestination_=document.palette().secondary;}cancelStroke();playing_=false;pending_=Pending::ReplaceColor;menuBar_->setEnabled(false);replaceInputs_[0]->setText(paletteHex(replaceSource_));replaceInputs_[1]->setText(paletteHex(replaceDestination_));discard_->caption=U"替换";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);previewReplace();refresh();}
  void createReplaceControls(){for(int i=0;i<2;++i){auto input=new PixelEntry(font_,skin_);addChild(input);replaceInputs_[i]=input;input->setVisible(false);auto changed=[this,input,i]{Pixel color;if(parsePaletteHex(input->text(),color))changeReplaceColor(i,color);else discard_->setEnabled(false);};input->Change.connect(changed);input->blur=changed;input->accept=[this]{if(discard_->isEnabled())resolve(true);};input->cancel=[this]{resolve(false);};replaceSample_[i]=button(U"",[this,i]{beginReplaceSampling(i);});replaceSample_[i]->iconSkin=&toolIcons_;replaceSample_[i]->icon="eyedropper";replaceSample_[i]->setEnabled(true);replaceSample_[i]->setVisible(false);}
    replaceScopeButton_=button(U"作用范围",[this]{PixelMenu menu(skin_);auto add=[&](const std::string& id,const std::u32string& text,bool enabled=true){auto item=new PixelMenuItem(font_,skin_,text);item->setEnabled(enabled);item->checked=[this,id]{return replaceScope_==id;};item->Click.connect([this,id]{replaceScope_=id;previewReplace();});menu.addChild(item);};add("document",U"整个文档");add("selection",U"当前像素选区",document.selection().has_value());add("layers",U"选中图层",!selectedTimelineLayer_.empty());add("frames",U"选中帧",!document.selectedFrames().empty());add("cells",U"选中帧格",!selectedTimelineCelFrame_.empty());add("palette",U"调色板",std::any_of(document.palette().entries.begin(),document.palette().entries.end(),[](const auto& entry){return entry.id!=0;}));for(const auto& l:document.timeline().state().loopSections)add("loop-section:"+l.id,U"循环段："+l.name);auto at=replaceScopeButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
    replacePreviewButton_=button(U"实时预览",[this]{replacePreview_=!replacePreview_;previewReplace();});replaceRememberButton_=button(U"记住颜色",[this]{replaceRemember_=!replaceRemember_;if(!replaceRemember_){cancelReplacePreview();replaceSource_=document.palette().primary;replaceDestination_=document.palette().secondary;replaceInputs_[0]->setText(paletteHex(replaceSource_));replaceInputs_[1]->setText(paletteHex(replaceDestination_));}previewReplace();});for(auto b:{replacePreviewButton_,replaceRememberButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}for(auto b:{replaceScopeButton_,replacePreviewButton_,replaceRememberButton_})b->setVisible(false);
  }
  void stopAntiAlias(){if(aaCancel_)aaCancel_->store(true);++aaGeneration_;aaScheduled_=false;aaCommit_=false;}
  void changeAntiAlias(){stopAntiAlias();document.restoreAdjustmentBaseline();if(aaLive_){aaScheduled_=true;aaDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(16);}refresh();}
  void launchAntiAlias(){auto task=document.captureAntiAliasTask();if(!task){status_=U"抗锯齿目标已变化";aaCommit_=false;return;}auto options=aaSpec_;options.color=aaAuto_?std::optional<Pixel>{}:std::optional<Pixel>{aaCustom_};auto token=std::make_shared<std::atomic<bool>>(false);aaCancel_=token;auto generation=aaGeneration_;std::packaged_task<AntiAliasResult()> work([task=std::move(*task),options,token,generation]()mutable{AntiAliasResult result{task.captured,{},generation,{}};try{result.pixels=Document::runAntiAliasTask(std::move(task),options,[token]{return token->load();});}catch(const std::exception& e){result.error=e.what();}return result;});aaWorker_=work.get_future();std::thread(std::move(work)).detach();}
  void requestAntiAliasApply(){aaPicker_->finishInteraction();stopAntiAlias();aaCommit_=true;aaScheduled_=true;aaDue_=std::chrono::steady_clock::now();refresh();}
  void antiAliasTick(){if(pending_!=Pending::AntiAlias)return;if(aaWorker_.valid() && aaWorker_.wait_for(std::chrono::seconds(0))==std::future_status::ready){auto result=aaWorker_.get();if(result.generation==aaGeneration_){if(!result.error.empty()){status_=U"抗锯齿失败："+unicodeText(result.error);aaCommit_=false;}else if(result.pixels&&document.publishConvolutionTask(result.captured,*result.pixels)){if(aaCommit_){aaCommit_=false;if(document.commitColorAdjustment()){resolve(false);return;}status_=U"没有可处理的内容";document.beginAntiAliasPreview();}refresh();}else{aaCommit_=false;status_=U"抗锯齿结果已失效";refresh();}}}if(aaScheduled_&&!aaWorker_.valid()&&std::chrono::steady_clock::now()>=aaDue_){aaScheduled_=false;launchAntiAlias();refresh();}}
  void openAntiAlias(){if(pending_!=Pending::None||document.active())return;if(!document.beginAntiAliasPreview()){status_=U"目标图层已锁定或没有可处理的内容";invalidate();return;}playing_=false;aaSpec_={};aaAuto_=aaLive_=true;aaCustom_=document.palette().primary;aaPicker_->syncColors(aaCustom_,aaCustom_);aaColorEntry_->setText(paletteHex(aaCustom_));aaOpacity_->setText("50");aaSource_->setSelectedIndex(0);pending_=Pending::AntiAlias;menuBar_->setEnabled(false);discard_->caption=U"应用";keep_->caption=U"取消";changeAntiAlias();}
  void createAntiAliasControls(){aaAutoButton_=button(U"自动取色",[this]{aaAuto_=!aaAuto_;changeAntiAlias();});aaInterior_=button(U"包含内部颜色",[this]{aaSpec_.interior=!aaSpec_.interior;changeAntiAlias();});aaLiveButton_=button(U"实时预览",[this]{aaLive_=!aaLive_;changeAntiAlias();});for(auto b:{aaAutoButton_,aaInterior_,aaLiveButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;b->setVisible(false);}auto source=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(source);addChild(source);aaSource_=source;source->setOptions({U"自动取色",U"画布颜色",U"调色板颜色"});source->changed=[this](int i){aaSpec_.colorSource=i;changeAntiAlias();};source->setVisible(false);
    aaOpacity_=new PixelEntry(font_,skin_);aaOpacity_->numeric=true;aaOpacity_->suffix=U"%";addChild(aaOpacity_);aaOpacity_->setVisible(false);auto opacityChanged=[this]{try{std::size_t used=0;auto n=std::stod(aaOpacity_->text(),&used);if(used!=aaOpacity_->text().size()||!std::isfinite(n))return;aaSpec_.opacity=int(std::clamp(std::floor(n+.5),0.0,100.0));changeAntiAlias();}catch(...){}};aaOpacity_->Change.connect(opacityChanged);aaOpacity_->blur=opacityChanged;aaOpacity_->accept=[this]{requestAntiAliasApply();};aaOpacity_->cancel=[this]{resolve(false);};
    aaOpacitySlider_=new PixelSlider(font_,skin_);aaOpacitySlider_->minimum=0;aaOpacitySlider_->maximum=100;aaOpacitySlider_->percentage=true;aaOpacitySlider_->changed=[this](int v){aaSpec_.opacity=v;aaOpacity_->setText(std::to_string(v));changeAntiAlias();};addChild(aaOpacitySlider_);aaOpacitySlider_->setVisible(false);
    aaColorEntry_=new PixelEntry(font_,skin_);addChild(aaColorEntry_);aaColorEntry_->setVisible(false);auto colorChanged=[this]{Pixel c;if(parsePaletteHex(aaColorEntry_->text(),c)){aaCustom_=c;aaPicker_->syncColors(c,c);changeAntiAlias();}};aaColorEntry_->Change.connect(colorChanged);aaColorEntry_->blur=colorChanged;aaColorEntry_->accept=[this]{requestAntiAliasApply();};aaColorEntry_->cancel=[this]{resolve(false);};
    auto picker=new DialogBackground<NativeColorPicker>(font_,skin_,assets_/"color-picker");configureDialogBackground(picker);addChild(picker);aaPicker_=picker;picker->changed=[this](Pixel c,bool){aaCustom_=c;aaColorEntry_->setText(paletteHex(c));changeAntiAlias();};picker->setVisible(false);
  }
  void layoutAntiAlias(const gfx::Rect& modal){bool show=pending_==Pending::AntiAlias,busy=aaCommit_;for(auto c:{aaAutoButton_,aaInterior_,aaLiveButton_}){c->setVisible(show);c->setEnabled(!busy);}aaAutoButton_->icon=aaAuto_?"check":"checkboxUnchecked";aaInterior_->icon=aaSpec_.interior?"check":"checkboxUnchecked";aaLiveButton_->icon=aaLive_?"check":"checkboxUnchecked";aaAutoButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+25,90,18)));aaSource_->setVisible(show&&aaAuto_);aaSource_->setEnabled(!busy);aaSource_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+49,modal.w-12,18)));aaOpacity_->setVisible(show&&aaAuto_&&aaSpec_.colorSource==0);aaOpacity_->setEnabled(!busy);aaOpacity_->setBounds(toDisplay(gfx::Rect(modal.x2()-70,modal.y+73,64,18)));aaOpacitySlider_->setVisible(show&&aaAuto_&&aaSpec_.colorSource==0);aaOpacitySlider_->setEnabled(!busy);aaOpacitySlider_->value=aaSpec_.opacity;aaOpacitySlider_->setBounds(toDisplay(gfx::Rect(modal.x+90,modal.y+73,modal.w-166,18)));aaColorEntry_->setVisible(show&&!aaAuto_);aaColorEntry_->setEnabled(!busy);aaColorEntry_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+49,modal.w-12,18)));aaPicker_->setVisible(show&&!aaAuto_);aaPicker_->setEnabled(!busy);aaPicker_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+73,modal.w-12,116)));aaInterior_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+(aaAuto_?101:197),130,18)));aaLiveButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y2()-26,90,18)));if(show){discard_->setEnabled(!busy);keep_->setEnabled(true);dialogClose_->setEnabled(true);}}
  void stopConvolution(){if(convolutionCancel_)convolutionCancel_->store(true);++convolutionGeneration_;convolutionScheduled_=false;convolutionCommit_=0;}
  void changeConvolution(){stopConvolution();++convolutionRevision_;document.restoreAdjustmentBaseline();if(convolutionLiveEnabled_){convolutionScheduled_=true;convolutionDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(40);}refresh();}
  void launchConvolution(){auto task=document.captureConvolutionTask();if(!task){status_=U"卷积预览目标已变化";convolutionCommit_=0;return;}auto options=convolutionSpec_;auto token=std::make_shared<std::atomic<bool>>(false);convolutionCancel_=token;auto generation=convolutionGeneration_,revision=convolutionRevision_;std::packaged_task<ConvolutionResult()> work([task=std::move(*task),options,token,generation,revision]() mutable {ConvolutionResult result{std::move(task),{},generation,revision};try{for(const auto& target:result.task.targets){auto out=convolvePixels(target.second,result.task.width,result.task.height,options,result.task.selection,[token]{return token->load();});if(token->load()){result.cancelled=true;return result;}result.pixels.push_back(out?std::move(*out):target.second);}}catch(const std::exception& e){result.error=e.what();}return result;});convolutionWorker_=work.get_future();std::thread(std::move(work)).detach();}
  void requestConvolutionApply(bool close){if(close && convolutionApplied_ && *convolutionApplied_==convolutionRevision_){resolve(false);return;}stopConvolution();convolutionCommit_=close?2:1;convolutionScheduled_=true;convolutionDue_=std::chrono::steady_clock::now();refresh();}
  void convolutionTick(){if(pending_!=Pending::Convolution)return;if(convolutionWorker_.valid() && convolutionWorker_.wait_for(std::chrono::seconds(0))==std::future_status::ready){auto result=convolutionWorker_.get();if(result.generation==convolutionGeneration_ && !result.cancelled){if(!result.error.empty()){status_=U"卷积失败："+unicodeText(result.error);convolutionCommit_=0;}else if(document.publishConvolutionTask(result.task,result.pixels)){if(convolutionCommit_){int commit=convolutionCommit_;convolutionCommit_=0;document.commitColorAdjustment();convolutionApplied_=result.optionsRevision;if(commit==2){resolve(false);return;}document.beginColorAdjustment(document.timelineSelection().layers);}refresh();}else{status_=U"卷积结果已失效";convolutionCommit_=0;}}}if(convolutionScheduled_ && !convolutionWorker_.valid() && std::chrono::steady_clock::now()>=convolutionDue_){convolutionScheduled_=false;launchConvolution();refresh();}}
  void openConvolution(){if(pending_!=Pending::None || document.active())return;if(!document.beginColorAdjustment(document.timelineSelection().layers))return;playing_=false;convolutionSpec_={};convolutionLiveEnabled_=true;convolutionApplied_.reset();convolutionScrollPixels_=0;pending_=Pending::Convolution;menuBar_->setEnabled(false);discard_->caption=U"完成";keep_->caption=U"取消";changeConvolution();}
  void createConvolutionControls(){for(std::size_t i=0;i<convolutionPresets().size();++i){auto control=button(unicodeText(convolutionPresets()[i].id),[this,i]{convolutionSpec_.presetId=convolutionPresets()[i].id;convolutionSpec_.channels=convolutionPresets()[i].channels;changeConvolution();});control->setVisible(false);convolutionPresets_.push_back(control);}const char32_t* names[]{U"R",U"G",U"B",U"A"};for(int i=0;i<4;++i)convolutionChannels_[i]=button(names[i],[this,i]{convolutionSpec_.channels[i]=!convolutionSpec_.channels[i];changeConvolution();});convolutionTiled_=button(U"平铺",[this]{convolutionSpec_.tiled=!convolutionSpec_.tiled;changeConvolution();});convolutionLive_=button(U"实时预览",[this]{convolutionLiveEnabled_=!convolutionLiveEnabled_;stopConvolution();document.restoreAdjustmentBaseline();if(convolutionLiveEnabled_){convolutionScheduled_=true;convolutionDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(40);}refresh();});convolutionApply_=button(U"应用",[this]{requestConvolutionApply(false);});for(auto control:{convolutionTiled_,convolutionLive_}){control->iconSkin=&toolIcons_;control->bareIconWithCaption=true;}for(auto control:convolutionChannels_)control->setVisible(false);for(auto control:{convolutionTiled_,convolutionLive_,convolutionApply_})control->setVisible(false);auto scroll=new DialogBackground<PixelScrollBar>(skin_,true);configureDialogBackground(scroll);convolutionScroll_=scroll;addChild(scroll);convolutionScroll_->changed=[this](int v){convolutionScrollPixels_=v;refresh();};convolutionScroll_->setVisible(false);}
  void layoutConvolution(const gfx::Rect& modal){bool show=pending_==Pending::Convolution,busy=convolutionCommit_!=0;auto viewport=toDisplay(gfx::Rect(modal.x+6,modal.y+25,std::max(70,modal.w-109),modal.h-57));int total=int(convolutionPresets_.size())*18*uiScale;convolutionScrollPixels_=std::clamp(convolutionScrollPixels_,0,std::max(0,total-viewport.h));convolutionScroll_->setVisible(show);convolutionScroll_->setEnabled(!busy);convolutionScroll_->setDockBounds(gfx::Rect(viewport.x2()-7*uiScale,viewport.y,7*uiScale,viewport.h));convolutionScroll_->configure(total,viewport.h,convolutionScrollPixels_);convolutionScroll_->wheelStep=18*uiScale;viewport.w-=8*uiScale;for(std::size_t i=0;i<convolutionPresets_.size();++i){auto control=convolutionPresets_[i];control->setBounds(gfx::Rect(viewport.x,viewport.y+int(i)*18*uiScale-convolutionScrollPixels_,viewport.w,18*uiScale));control->paletteViewport=[viewport]{return viewport;};control->active=convolutionSpec_.presetId==convolutionPresets()[i].id;control->setEnabled(!busy);control->setVisible(show&&viewport.intersects(control->bounds()));}int x=modal.x2()-96;for(int i=0;i<4;++i){auto c=convolutionChannels_[i];c->setVisible(show);c->setEnabled(!busy);c->active=convolutionSpec_.channels[i];c->setBounds(toDisplay(gfx::Rect(x+i*22,modal.y+25,20,18)));}int y=modal.y+49;for(auto c:{convolutionTiled_,convolutionLive_,convolutionApply_}){c->setVisible(show);c->setEnabled(!busy);c->setBounds(toDisplay(gfx::Rect(x,y,88,18)));y+=24;}convolutionTiled_->icon=convolutionSpec_.tiled?"check":"checkboxUnchecked";convolutionLive_->icon=convolutionLiveEnabled_?"check":"checkboxUnchecked";if(show){discard_->setEnabled(!busy);keep_->setEnabled(!busy);dialogClose_->setEnabled(!busy);}}
  void cancelGradientMapJob(){if(gmCancel_)gmCancel_->store(true);++gmGeneration_;gmScheduled_=false;gmCommit_=false;}
  void scheduleGradientMap(bool commit=false){cancelGradientMapJob();document.restoreAdjustmentBaseline();gmCommit_=commit;gmScheduled_=commit||adjustmentPreviewEnabled_;updateAdjustmentControls();invalidate();}
  void gradientMapTick(){if(pending_!=Pending::ColorAdjustment||adjustmentSpec_.kind!=ColorAdjustmentKind::GradientMap)return;if(gmWorker_.valid()&&gmWorker_.wait_for(std::chrono::seconds(0))==std::future_status::ready){auto result=gmWorker_.get();if(result.generation==gmGeneration_&&!result.cancelled){if(!result.error.empty()){status_=U"渐变映射失败："+unicodeText(result.error);gmCommit_=false;}else if(document.publishConvolutionTask(result.task,result.results)){if(gmCommit_){gmCommit_=false;document.commitColorAdjustment();resolve(false);return;}}else gmCommit_=false;refresh();}}if(gmScheduled_&&!gmWorker_.valid()){gmScheduled_=false;auto task=document.captureConvolutionTask();if(!task){gmCommit_=false;return;}auto token=std::make_shared<std::atomic<bool>>(false);gmCancel_=token;auto settings=adjustmentSpec_.gradientMap;auto generation=gmGeneration_;std::packaged_task<GradientMapResult()> work([task=std::move(*task),token,settings,generation]()mutable{GradientMapResult result{std::move(task),{},generation};try{GradientMapSampler sampler(settings);for(const auto& target:result.task.targets){auto pixels=target.second;for(std::size_t i=0;i<pixels.size();++i){if((i&1023)==0&&token->load()){result.cancelled=true;return result;}if(!result.task.selection||selectionContains(result.task.selection,int(i%result.task.width),int(i/result.task.width)))pixels[i]=sampler(pixels[i],int(i%result.task.width),int(i/result.task.width));}result.results.push_back(std::move(pixels));}}catch(const std::exception& e){result.error=e.what();}return result;});gmWorker_=work.get_future();std::thread(std::move(work)).detach();}}
  GradientMapPresetStore gradientMapStore()const{return GradientMapPresetStore(palettePreferencePath().parent_path());}
  void gmChanged(){auto& settings=adjustmentSpec_.gradientMap;settings=normalizeGradientMap(settings);gmStop_=std::clamp(gmStop_,0,int(settings.stops.size())-1);auto stop=settings.stops[gmStop_];if(!gmPosition_->hasFocus())gmPosition_->setText(std::to_string(gradientRound(stop.position*100)));if(!gmColor_->hasFocus())gmColor_->setText(paletteHex(stop.color));gmPicker_->syncColors(stop.color,stop.color);int match=-1;for(int i=0;i<int(gmKeys_.size());++i){int key=gmKeys_[i];if(gradientMapSignature(settings)==gradientMapSignature(key<8?gradientMapBuiltins()[key].settings:gmSaved_[key-8].settings)){match=i;break;}}gmPreset_->setSelectedIndex(match);if(match<0)gmPreset_->caption=U"自定义";previewAdjustment();}
  void gmRefreshPresets(){std::vector<std::u32string> names;gmKeys_.clear();for(int i=0;i<8;++i)if(std::find(gmHidden_.begin(),gmHidden_.end(),i)==gmHidden_.end()){names.push_back(gradientMapBuiltins()[i].name);gmKeys_.push_back(i);}for(int i=0;i<int(gmSaved_.size());++i){names.push_back(unicodeText(gmSaved_[i].name));gmKeys_.push_back(8+i);}gmPreset_->setOptions(names);gmPreset_->setSelectedIndex(-1);}
  void openGradientMap(){openColorAdjustment(ColorAdjustmentKind::GradientMap);if(pending_!=Pending::ColorAdjustment)return;document.cancelColorAdjustment();if(!document.beginColorAdjustment(document.timelineSelection().layers)){resolve(false);return;}gmReadable_=true;gmError_.clear();try{gmSaved_=gradientMapStore().load();gmHidden_=gradientMapStore().hidden();}catch(const std::exception& e){gmSaved_.clear();gmHidden_.clear();gmReadable_=false;gmError_=U"预设读取失败";status_=U"预设读取失败："+unicodeText(e.what());}gmName_->setText("");gmRefreshPresets();gmStop_=0;gmDither_->setSelectedIndex(0);gmChanged();}
  void createGradientMapControls(){gmTrack_=new GradientStopsTrack(toolIcons_);gmTrack_->stops=&adjustmentSpec_.gradientMap.stops;gmTrack_->selected=&gmStop_;gmTrack_->changed=[this]{gmChanged();};addChild(gmTrack_);gmTrack_->setVisible(false);auto dropdown=[this](){auto d=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(d);addChild(d);d->setVisible(false);return d;};gmPreset_=dropdown();gmPreset_->changed=[this](int i){if(i<0||i>=int(gmKeys_.size()))return;auto key=gmKeys_[i];adjustmentSpec_.gradientMap=key<8?gradientMapBuiltins()[key].settings:gmSaved_[key-8].settings;gmStop_=0;gmDither_->setSelectedIndex(adjustmentSpec_.gradientMap.dither);gmChanged();};gmDither_=dropdown();gmDither_->setOptions({U"无",U"Bayer 2",U"Bayer 4",U"Bayer 8",U"棋盘",U"斜线",U"反向斜线",U"水平",U"垂直"});gmDither_->changed=[this](int i){adjustmentSpec_.gradientMap.dither=i;gmChanged();};auto entry=[this](){auto e=new PixelEntry(font_,skin_);addChild(e);e->setVisible(false);e->cancel=[this]{resolve(false);};return e;};gmPosition_=entry();gmPosition_->numeric=true;gmPosition_->suffix=U"%";gmPosition_->Change.connect([this]{try{double position=std::stod(gmPosition_->text())/100;if(!std::isfinite(position))return;auto& stops=adjustmentSpec_.gradientMap.stops;auto stop=stops[gmStop_];double original=stop.position;stop.position=std::clamp(position,0.0,1.0);if(stop.position==0||stop.position==1)for(int i=0;i<int(stops.size());++i)if(i!=gmStop_&&stops[i].position==stop.position)stops[i].position=original;stops[gmStop_]=stop;std::stable_sort(stops.begin(),stops.end(),[](auto a,auto b){return a.position<b.position;});gmStop_=int(std::find_if(stops.begin(),stops.end(),[&](auto v){return v.position==stop.position&&v.color==stop.color;})-stops.begin());gmChanged();}catch(...){}});gmColor_=entry();gmColor_->Change.connect([this]{Pixel color;if(parsePaletteHex(gmColor_->text(),color)){adjustmentSpec_.gradientMap.stops[gmStop_].color=color|0xff000000;gmChanged();}});gmName_=entry();gmName_->Change.connect([this]{refresh();});
 auto picker=new DialogBackground<NativeColorPicker>(font_,skin_,assets_/"color-picker");configureDialogBackground(picker);addChild(picker);gmPicker_=picker;picker->changed=[this](Pixel c,bool){adjustmentSpec_.gradientMap.stops[gmStop_].color=c|0xff000000;gmChanged();};picker->setVisible(false);
 gmMode_=button(U"连续",[this]{adjustmentSpec_.gradientMap.steps=!adjustmentSpec_.gradientMap.steps;gmChanged();});gmReverse_=button(U"反向",[this]{adjustmentSpec_.gradientMap.reverse=!adjustmentSpec_.gradientMap.reverse;gmChanged();});gmPalette_=button(U"来自色卡",[this]{std::vector<Pixel> colors;for(auto e:document.palette().entries)if((e.color>>24)&&std::find(document.palette().slots.begin(),document.palette().slots.end(),e.id)!=document.palette().slots.end()&&colors.size()<256)colors.push_back(e.color);std::stable_sort(colors.begin(),colors.end(),[](auto a,auto b){return (int(a&255)-int(b&255))*.2126+(int((a>>8)&255)-int((b>>8)&255))*.7152+(int((a>>16)&255)-int((b>>16)&255))*.0722<0;});auto& stops=adjustmentSpec_.gradientMap.stops;stops.clear();for(int i=0;i<int(colors.size());++i)stops.push_back({colors.size()==1?0:double(i)/(colors.size()-1),colors[i]|0xff000000});gmStop_=0;gmChanged();});gmSave_=button(U"保存预设",[this]{try{auto next=gradientMapStore().save(gmName_->text(),adjustmentSpec_.gradientMap);gmSaved_=std::move(next);gmName_->setText("");gmRefreshPresets();gmError_.clear();status_=U"预设已保存";}catch(const std::exception& e){gmError_=U"预设保存失败";status_=U"保存失败："+unicodeText(e.what());}refresh();});gmDelete_=button(U"删除预设",[this]{int i=gmPreset_->selectedIndex();if(i<0||i>=int(gmKeys_.size()))return;int key=gmKeys_[i];try{if(key<8)gmHidden_=gradientMapStore().hide(key);else gmSaved_=gradientMapStore().remove(gmSaved_[key-8].name);gmRefreshPresets();gmError_.clear();}catch(const std::exception& e){gmError_=U"预设删除失败";status_=U"删除失败："+unicodeText(e.what());}refresh();});gmAdd_=button(U"添加色标",[this]{auto& stops=adjustmentSpec_.gradientMap.stops;if(stops.size()>=256)return;int i=0;double gap=-1;for(int n=0;n<int(stops.size())-1;++n)if(stops[n+1].position-stops[n].position>gap){gap=stops[n+1].position-stops[n].position;i=n;}double p=std::clamp((stops[i].position+stops[i+1].position)/2,.001,.999);if(gap<.002)return;GradientSpec s;s.stops=stops;auto color=GradientSampler(s).forAmount(p,0,0);stops.insert(stops.begin()+i+1,{p,color});gmStop_=i+1;gmChanged();});gmRemove_=button(U"删除色标",[this]{auto& stops=adjustmentSpec_.gradientMap.stops;if(stops.size()<=2)return;stops.erase(stops.begin()+gmStop_);gmStop_=std::max(0,gmStop_-1);gmChanged();});gmRestore_=button(U"重置颜色",[this]{auto& stops=adjustmentSpec_.gradientMap.stops;auto first=stops.front().color,last=stops.back().color;stops={{0,first},{1,last}};gmStop_=0;gmChanged();});gmFlipStops_=button(U"反转色标",[this]{auto& stops=adjustmentSpec_.gradientMap.stops;auto selected=stops[gmStop_];for(auto& stop:stops)stop.position=1-stop.position;std::reverse(stops.begin(),stops.end());std::stable_sort(stops.begin(),stops.end(),[](auto a,auto b){return a.position<b.position;});gmStop_=int(std::find_if(stops.begin(),stops.end(),[&](auto v){return v.position==1-selected.position&&v.color==selected.color;})-stops.begin());gmChanged();});for(auto b:{gmMode_,gmReverse_,gmPalette_,gmSave_,gmDelete_,gmAdd_,gmRemove_,gmRestore_,gmFlipStops_})b->setVisible(false);gmRemove_->caption.clear();gmRemove_->icon="delete";gmRemove_->iconSkin=&toolIcons_;}
 void layoutGradientMap(const gfx::Rect& modal){bool show=pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap;auto place=[&](ui::Widget* w,gfx::Rect r){w->setVisible(show);w->setEnabled(!gmCommit_);w->setBounds(toDisplay(r));};int x=modal.x+6,y=modal.y+25,w=modal.w-12;place(gmPreset_,{x,y,w-80,18});place(gmDelete_,{x+w-76,y,76,18});y+=24;place(gmTrack_,{x,y,w,22});y+=28;place(gmPosition_,{x,y,64,18});place(gmColor_,{x+70,y,w-134,18});place(gmAdd_,{x+w-60,y,38,18});place(gmRemove_,{x+w-20,y,20,18});y+=24;place(gmPicker_,{x,y,w,85});y+=91;place(gmMode_,{x,y,58,18});place(gmReverse_,{x+64,y,58,18});place(gmPalette_,{x+128,y,72,18});y+=24;place(gmRestore_,{x,y,90,18});place(gmFlipStops_,{x+96,y,90,18});y+=24;place(gmDither_,{x,y,w,18});y+=24;place(gmName_,{x,y,w-86,18});place(gmSave_,{x+w-80,y,80,18});gmMode_->caption=adjustmentSpec_.gradientMap.steps?U"阶梯":U"连续";gmReverse_->active=adjustmentSpec_.gradientMap.reverse;gmRemove_->setEnabled(!gmCommit_&&adjustmentSpec_.gradientMap.stops.size()>2);gmAdd_->setEnabled(!gmCommit_&&adjustmentSpec_.gradientMap.stops.size()<256);gmSave_->setEnabled(!gmCommit_&&gmReadable_&&GradientMapPresetStore::validName(gmName_->text()));gmDelete_->setEnabled(!gmCommit_&&gmReadable_&&gmPreset_->selectedIndex()>=0);gmPalette_->setEnabled(std::any_of(document.palette().entries.begin(),document.palette().entries.end(),[](auto e){return e.color>>24;}));if(show){for(auto e:adjustmentInputs_)e->setVisible(false);adjustmentColorize_->setVisible(false);adjustmentToneButton_->setVisible(false);adjustmentPreview_->setVisible(true);adjustmentPreview_->setBounds(toDisplay(gfx::Rect(x,modal.y2()-26,90,18)));}}
  void updateAdjustmentControls(){
    if(adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap){adjustmentPreview_->icon=adjustmentPreviewEnabled_?"check":"checkboxUnchecked";gmTrack_->invalidate();return;}
    if(adjustmentSpec_.kind==ColorAdjustmentKind::Curves){const char32_t* names[]{U"RGB",U"红色",U"绿色",U"蓝色"};curveChannelButton_->caption=names[curveChannel_];curveEditor_->points=&adjustmentSpec_.curves[curveChannel_];curveEditor_->histogram=&curveHistogram_[curveChannel_];curveEditor_->channel=curveChannel_;int index=curveEditor_->selected>=0&&curveEditor_->selected<int(curveEditor_->points->size())?curveEditor_->selected:0;auto p=(*curveEditor_->points)[index];for(int axis=0;axis<2;++axis)if(!adjustmentInputs_[axis]->hasFocus())adjustmentInputs_[axis]->setText(std::to_string(int(axis?p.y:p.x)));adjustmentInputs_[0]->setEnabled(index>0&&index<int(curveEditor_->points->size())-1);curveDeleteButton_->setEnabled(index>0&&index<int(curveEditor_->points->size())-1);adjustmentPreview_->icon=adjustmentPreviewEnabled_?"check":"checkboxUnchecked";curveEditor_->invalidate();return;}for(auto input:adjustmentInputs_)input->setEnabled(true);
    for(int i=0;i<3;++i){if(adjustmentInputs_[i]->hasFocus())continue;double value=adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance?adjustmentSpec_.balance[adjustmentTone_][i]:adjustmentSpec_.kind==ColorAdjustmentKind::BrightnessContrast?(i?adjustmentSpec_.contrast:adjustmentSpec_.brightness):i==0?adjustmentSpec_.hue:i==1?adjustmentSpec_.saturation:adjustmentSpec_.lightness;adjustmentInputs_[i]->setText(std::to_string(int(value)));}adjustmentPreview_->icon=adjustmentPreviewEnabled_?"check":"checkboxUnchecked";adjustmentColorize_->caption=adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance?U"保持亮度":U"着色";adjustmentColorize_->icon=(adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance?adjustmentSpec_.preserveLuminosity:adjustmentSpec_.colorize)?"check":"checkboxUnchecked";if(adjustmentToneButton_){const char32_t* tones[]{U"阴影",U"中间调",U"高光"};adjustmentToneButton_->caption=tones[adjustmentTone_];}
  }
  void previewAdjustment(){if(adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap){scheduleGradientMap();return;}document.updateColorAdjustment(adjustmentSpec_,adjustmentPreviewEnabled_);updateAdjustmentControls();invalidate();}
  void openColorAdjustment(ColorAdjustmentKind kind){if(pending_!=Pending::None || document.active())return;document.commitFloatingPaste();cancelStroke();if(!document.beginColorAdjustment())return;playing_=false;adjustmentSpec_={};adjustmentSpec_.kind=kind;curveChannel_=0;if(kind==ColorAdjustmentKind::Curves){curveHistogram_=buildCurveHistogram(document.pixels());curveEditor_->selectChannel();}adjustmentTone_=1;adjustmentPreviewEnabled_=true;relativeHsl_={};hasColorizedHsl_=false;pending_=Pending::ColorAdjustment;menuBar_->setEnabled(false);discard_->caption=U"应用";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);previewAdjustment();refresh();}
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
  void openSpriteSheet(){if(pending_!=Pending::None||document.active())return;sheetOptions_={};sheetOptions_.fixedWidth=document.width()*4;sheetOptions_.fixedHeight=document.height()*4;sheetOptions_.selectedLayerIds=document.timelineSelection().layers;sheetValue_->setText("4");try{if(sheetPreview_) {sheetPreview_->setImage(buildSpriteSheetImage(document,sheetOptions_));sheetPreview_->setVisible(true);}}catch(...){} pending_=Pending::SpriteSheet;menuBar_->setEnabled(false);discard_->caption=U"导出 PNG";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);refresh();}
  bool saveSpriteSheet(){wchar_t filename[32768]{};auto name=std::filesystem::path(document.name()).stem().wstring()+L"-sprite-sheet.png";std::copy_n(name.c_str(),std::min<std::size_t>(name.size(),32767),filename);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=L"PNG RGBA 精灵表\0*.png\0\0";dialog.lpstrDefExt=L"png";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;if(!GetSaveFileNameW(&dialog))return false;try{writeStaticImagePngAtomic(filename,encodeSpriteSheet(document,sheetOptions_));status_=U"精灵表已导出";return true;}catch(const std::exception& e){status_=U"精灵表导出失败："+unicodeText(e.what());invalidate();return false;}}
  void createSpriteSheetControls(){sheetPreview_=new SpriteSheetPreview(skin_);addChild(sheetPreview_);
    sheetButtons_[0]=button(U"排列",[this]{PixelMenu menu(skin_);const char32_t* names[]{U"横向",U"纵向",U"按行",U"按列"};for(int i=0;i<4;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->checked=[this,i]{return int(sheetOptions_.layout)==i;};item->Click.connect([this,i]{auto& o=sheetOptions_;o.layout=SheetLayout(i);if(i<2)o.constraint=SheetConstraint::None;else if(i==2){if(o.constraint==SheetConstraint::FixedRows)o.constraint=SheetConstraint::FixedColumns;if(o.constraint==SheetConstraint::FixedHeight)o.constraint=SheetConstraint::FixedWidth;}else{if(o.constraint==SheetConstraint::FixedColumns)o.constraint=SheetConstraint::FixedRows;if(o.constraint==SheetConstraint::FixedWidth)o.constraint=SheetConstraint::FixedHeight;}refresh();});menu.addChild(item);}auto at=sheetButtons_[0]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
    sheetButtons_[1]=button(U"约束",[this]{PixelMenu menu(skin_);bool columns=sheetOptions_.layout==SheetLayout::Columns;const char32_t* names[]{U"无约束",columns?U"固定行数":U"固定列数",columns?U"固定高度":U"固定宽度"};for(int i=0;i<3;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->Click.connect([this,i,columns]{sheetOptions_.constraint=i==0?SheetConstraint::None:i==1?(columns?SheetConstraint::FixedRows:SheetConstraint::FixedColumns):(columns?SheetConstraint::FixedHeight:SheetConstraint::FixedWidth);refresh();});menu.addChild(item);}auto at=sheetButtons_[1]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
    sheetButtons_[2]=button(U"帧范围",[this]{PixelMenu menu(skin_);auto add=[&](std::string id,std::u32string name){auto item=new PixelMenuItem(font_,skin_,name);item->checked=[this,id]{return sheetOptions_.frameScope==id;};item->Click.connect([this,id]{sheetOptions_.frameScope=id;refresh();});menu.addChild(item);};add("all",U"全部帧");add("selected",U"选中帧（无选择时当前帧）");for(const auto& l:document.timeline().state().loopSections)add("loop:"+l.id,l.name);auto at=sheetButtons_[2]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
    sheetButtons_[3]=button(U"图层",[this]{PixelMenu menu(skin_);const char* ids[]{"visible","all","selected"};const char32_t* names[]{U"可见图层",U"所有图层（显示隐藏层）",U"选中图层"};for(int i=0;i<3;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->Click.connect([this,id=std::string(ids[i])]{sheetOptions_.layerScope=id;refresh();});menu.addChild(item);}for(int split=0;split<2;++split){auto item=new PixelMenuItem(font_,skin_,split==0?U"拆分图层":U"拆分循环段");item->checked=[this,split]{return split==0?sheetOptions_.splitLayers:sheetOptions_.splitLoopSections;};item->setEnabled(split==0||!document.timeline().state().loopSections.empty());item->Click.connect([this,split]{if(split==0)sheetOptions_.splitLayers=!sheetOptions_.splitLayers;else sheetOptions_.splitLoopSections=!sheetOptions_.splitLoopSections;refresh();});menu.addChild(item);}for(auto text:{U"新建文档 · 未接入",U"导出后自动打开 · 未接入"}){auto item=new PixelMenuItem(font_,skin_,text);item->setEnabled(false);menu.addChild(item);}auto at=sheetButtons_[3]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
    sheetButtons_[4]=button(U"合并重复",[this]{sheetOptions_.mergeDuplicates=!sheetOptions_.mergeDuplicates;refresh();});sheetButtons_[5]=button(U"忽略空帧",[this]{sheetOptions_.ignoreEmpty=!sheetOptions_.ignoreEmpty;refresh();});sheetButtons_[6]=button(U"像素选区",[this]{sheetOptions_.selection=!sheetOptions_.selection;refresh();});for(auto b:sheetButtons_){b->setVisible(false);b->iconSkin=&toolIcons_;}
    sheetValue_=new PixelEntry(font_,skin_);sheetValue_->numeric=true;addChild(sheetValue_);sheetValue_->setVisible(false);auto change=[this]{try{std::size_t used=0;double v=std::stod(sheetValue_->text(),&used);if(used!=sheetValue_->text().size()||!std::isfinite(v))return;auto c=sheetOptions_.constraint;int n=int(std::floor(std::clamp(v,1.0,c==SheetConstraint::FixedWidth||c==SheetConstraint::FixedHeight?262144.0:16384.0)+.5));(c==SheetConstraint::FixedColumns?sheetOptions_.fixedColumns:c==SheetConstraint::FixedRows?sheetOptions_.fixedRows:c==SheetConstraint::FixedWidth?sheetOptions_.fixedWidth:sheetOptions_.fixedHeight)=n;refresh();}catch(...){} };sheetValue_->Change.connect(change);sheetValue_->blur=change;sheetValue_->accept=[this]{resolve(true);};sheetValue_->cancel=[this]{resolve(false);};
  }
  void openDocumentExport(){if(document.timeline().state().frames.size()>1)openGifExport();else openStaticExport();}
  void createExportFormatControl(){exportFormatButton_=button(U"格式",[this]{PixelMenu menu(skin_);auto add=[&](std::u32string name,std::function<void()> action){auto item=new PixelMenuItem(font_,skin_,name);item->Click.connect([this,action]{resolve(false);action();});menu.addChild(item);};add(U"PNG RGBA",[this]{openStaticExport();});add(U"GIF",[this]{openGifExport();});for(auto text:{U"PNG 自动 · 未接入",U"WebP · 未接入",U"其它格式 · 未接入"}){auto item=new PixelMenuItem(font_,skin_,text);item->setEnabled(false);menu.addChild(item);}auto at=exportFormatButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});exportFormatButton_->setVisible(false);}
  void openStaticExport(){if(pending_!=Pending::None||document.active())return;exportOptions_={};pending_=Pending::StaticExport;menuBar_->setEnabled(false);exportScaleInput_->setText("100");discard_->caption=U"导出 PNG";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);refresh();}
  bool saveStaticExport(){wchar_t filename[32768]{};auto name=std::filesystem::path(document.name()).stem().wstring()+L".png";std::copy_n(name.c_str(),std::min<std::size_t>(name.size(),32767),filename);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=L"PNG RGBA 图片\0*.png\0\0";dialog.lpstrDefExt=L"png";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;if(!GetSaveFileNameW(&dialog)){const auto error=CommDlgExtendedError();if(error)status_=U"无法打开导出文件对话框";return false;}try{auto out=encodeStaticImagePng(document,exportOptions_);writeStaticImagePngAtomic(filename,out);status_=U"已导出 PNG";return true;}catch(const std::exception& e){status_=U"导出失败："+unicodeText(e.what());invalidate();return false;}}
  void createStaticExportControls(){exportScaleInput_=new PixelEntry(font_,skin_);exportScaleInput_->numeric=true;exportScaleInput_->suffix=U"%";addChild(exportScaleInput_);exportScaleInput_->setVisible(false);auto change=[this]{try{std::size_t used=0;double v=std::stod(exportScaleInput_->text(),&used);if(used==exportScaleInput_->text().size()&&std::isfinite(v))exportOptions_.scalePercent=int(std::floor(std::clamp(v,1.0,6400.0)+.5));}catch(...){} };exportScaleInput_->Change.connect(change);exportScaleInput_->blur=change;exportScaleInput_->accept=[this]{resolve(true);};exportScaleInput_->cancel=[this]{resolve(false);};exportTrimButton_=button(U"裁切透明边",[this]{exportOptions_.trim=!exportOptions_.trim;refresh();});exportSelectionButton_=button(U"仅像素选区",[this]{exportOptions_.selection=!exportOptions_.selection;refresh();});for(auto b:{exportTrimButton_,exportSelectionButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;b->setVisible(false);}}
  void createResizeControls(){for(int i=0;i<4;++i){auto input=new PixelEntry(font_,skin_);input->numeric=true;input->suffix=i<2?U"px":U"%";addChild(input);resizeInputs_[i]=input;input->setVisible(false);auto changed=[this,input,i]{if(resizeUpdating_||pending_!=Pending::ImageResize)return;try{std::size_t used=0;double v=std::stod(input->text(),&used);if(used!=input->text().size()||!std::isfinite(v))return;v=std::clamp(v,1.0,i<2?16384.0:6400.0);if(i<2)v=std::floor(v+.5);const bool horizontal=i%2==0;int n=i<2?int(v):std::clamp(int(std::floor((horizontal?document.width():document.height())*v/100+.5)),1,16384);(horizontal?resizeWidth_:resizeHeight_)=n;if(resizeLocked_)(horizontal?resizeHeight_:resizeWidth_)=std::max(1,int(std::floor(double(n)*(horizontal?document.height():document.width())/(horizontal?document.width():document.height())+.5)));updateResizeFields();}catch(...){} };input->Change.connect(changed);input->blur=changed;input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}resizeLock_=button(U"保持比例",[this]{resizeLocked_=!resizeLocked_;updateResizeFields();});resizeLock_->iconSkin=&toolIcons_;resizeLock_->setVisible(false);resizeMethod_=button(U"最近邻",[this]{resizeMethodValue_=resizeMethodValue_==ImageInterpolation::Nearest?ImageInterpolation::Smooth:ImageInterpolation::Nearest;updateResizeFields();});resizeMethod_->setVisible(false);}
  void createAdjustmentControls(){
    curveEditor_=new CurveEditorNative(skin_);addChild(curveEditor_);curveEditor_->changed=[this]{previewAdjustment();};curveChannelButton_=button(U"RGB",[this]{curveChannel_=(curveChannel_+1)%4;curveEditor_->selectChannel();updateAdjustmentControls();});curveResetButton_=button(U"重置通道",[this]{curveEditor_->resetChannel();});curveDeleteButton_=button(U"删除点",[this]{curveEditor_->deleteSelected();});for(auto b:{curveChannelButton_,curveResetButton_,curveDeleteButton_})b->setVisible(false);curveResetButton_->caption.clear();curveResetButton_->icon="restore";curveResetButton_->iconSkin=&toolIcons_;curveDeleteButton_->caption.clear();curveDeleteButton_->icon="delete";curveDeleteButton_->iconSkin=&toolIcons_;
    for(int i=0;i<3;++i){auto input=new PixelEntry(font_,skin_);input->numeric=true;addChild(input);adjustmentInputs_[i]=input;input->setVisible(false);auto changed=[this,input,i]{try{std::size_t used=0;double v=std::stod(input->text(),&used);if(used!=input->text().size() || !std::isfinite(v))return;if(adjustmentSpec_.kind==ColorAdjustmentKind::Curves){curveEditor_->setCoordinate(i,v);return;}double lo=-100,hi=100;if(adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation && i==0){lo=adjustmentSpec_.colorize?0:-180;hi=adjustmentSpec_.colorize?360:180;}if(adjustmentSpec_.colorize && i==1)lo=0;v=std::clamp(std::floor(v+.5),lo,hi);if(adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance)adjustmentSpec_.balance[adjustmentTone_][i]=v;else if(adjustmentSpec_.kind==ColorAdjustmentKind::BrightnessContrast)(i?adjustmentSpec_.contrast:adjustmentSpec_.brightness)=v;else (i==0?adjustmentSpec_.hue:i==1?adjustmentSpec_.saturation:adjustmentSpec_.lightness)=v;previewAdjustment();}catch(...){} };input->Change.connect(changed);input->blur=changed;input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}
    adjustmentPreview_=button(U"实时预览",[this]{adjustmentPreviewEnabled_=!adjustmentPreviewEnabled_;previewAdjustment();});adjustmentColorize_=button(U"着色",[this]{if(adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance){adjustmentSpec_.preserveLuminosity=!adjustmentSpec_.preserveLuminosity;previewAdjustment();return;}auto current=std::array<double,3>{adjustmentSpec_.hue,adjustmentSpec_.saturation,adjustmentSpec_.lightness};if(!adjustmentSpec_.colorize){relativeHsl_=current;if(!hasColorizedHsl_){auto c=document.palette().primary;const double r=(c&255)/255.0,g=((c>>8)&255)/255.0,b=((c>>16)&255)/255.0,hi=std::max({r,g,b}),lo=std::min({r,g,b}),d=hi-lo;const double h=d==0?0:std::fmod((hi==r?(g-b)/d:hi==g?(b-r)/d+2:(r-g)/d+4)*60+360,360);colorizedHsl_={std::floor(h+.5),25,adjustmentSpec_.lightness};}current=colorizedHsl_;}else{colorizedHsl_=current;hasColorizedHsl_=true;current=relativeHsl_;}adjustmentSpec_.colorize=!adjustmentSpec_.colorize;adjustmentSpec_.hue=current[0];adjustmentSpec_.saturation=current[1];adjustmentSpec_.lightness=current[2];previewAdjustment();});adjustmentToneButton_=button(U"中间调",[this]{adjustmentTone_=(adjustmentTone_+1)%3;updateAdjustmentControls();invalidate();});adjustmentToneButton_->setVisible(false);for(auto b:{adjustmentPreview_,adjustmentColorize_}){b->setVisible(false);b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}
  }
  void openPaletteExtraction(){
    if(pending_!=Pending::None || document.active())return;
    openPaletteEditor(0,false);pending_=Pending::PaletteExtract;extractMode_=0;paletteInput_->numeric=true;paletteInput_->setText(std::to_string(extractLimit_));extractNameInput_->setText(utf8Text(document.name())+" 调色板");discard_->caption=U"提取";keep_->caption=U"取消";discard_->setVisible(true);layoutModal();paletteInput_->requestFocus();paletteInput_->selectAllText();invalidate();
  }
  bool applyPaletteExtraction(){
    try{std::size_t used=0;const double value=std::stod(paletteInput_->text(),&used);if(used!=paletteInput_->text().size() || !std::isfinite(value))throw std::runtime_error("数量需要1–4096");extractLimit_=int(std::clamp(std::floor(value+.5),1.0,4096.0));
      const auto composite=compositeNormalRegion(document.timeline(),document.frame().id,{0,0,document.width(),document.height()});const auto colors=extractPaletteScanline(composite,extractLimit_);if(colors.empty())throw std::runtime_error("当前图像没有非透明颜色");
      document.applyExtractedPalette(colors,extractMode_==2,paletteColumns_);paletteScrollPixels_=0;status_=extractMode_==0?U"已创建临时调色板："+unicodeText(extractNameInput_->text()):extractMode_==1?U"已替换调色板":U"已追加提取颜色";return true;
    }catch(const std::exception& e){status_=U"提取失败："+unicodeText(e.what());invalidate();return false;}
  }
  void showPaletteActions() {
    if(pending_!=Pending::None) return;
    PixelMenu popup(skin_);
    auto add=[&](PixelMenu& menu,const char32_t* text,const char* icon="",std::function<void()> action={},std::function<bool()> checked={}) {
      auto item=new PixelMenuItem(font_,skin_,text);item->iconSkin=&toolIcons_;item->menuMarks=&toolIcons_;item->icon=icon;item->checked=std::move(checked);item->setEnabled(bool(action));if(action)item->Click.connect(std::move(action));menu.addChild(item);return item;
    };
    auto separator=[&](PixelMenu& menu){menu.addChild(new PixelMenuSeparator(skin_));};
    add(popup,U"自适应布局","",[]{},[]{return true;});
    add(popup,U"自定义布局","",{},[]{return false;});separator(popup);
    add(popup,U"提取颜色","extractColors",document.active()?std::function<void()>{}:std::function<void()>{[this]{openPaletteExtraction();}});
    add(popup,U"显示颜色名称","",{},[]{return false;});
    add(popup,U"同步颜色","",{},[]{return false;});separator(popup);
    auto sort=new PixelMenu(skin_);auto trigger=add(popup,U"排序与渐变","moreLines",[]{});trigger->setSubmenu(sort);
    add(*sort,U"反向颜色","redo");add(*sort,U"渐变");add(*sort,U"色调渐变");separator(*sort);
    for(const auto* name:{U"色调排序",U"饱和度排序",U"明度排序",U"亮度排序",U"Red 排序",U"Green 排序",U"Blue 排序",U"Alpha 排序"})add(*sort,name);
    separator(*sort);add(*sort,U"升序","",{},[]{return true;});add(*sort,U"降序","",{},[]{return false;});separator(popup);
    const char32_t* names[]={U"较小尺寸",U"小尺寸",U"中尺寸",U"大尺寸",U"较大尺寸"};
    for(int i=0;i<5;++i) {
      const auto px=std::to_string(swatchPixels_[i]);
      auto item=new PixelMenuItem(font_,skin_,names[i],std::u32string(px.begin(),px.end())+U" px");item->menuMarks=&toolIcons_;
      item->checked=[this,i]{return swatchSize_==i;};
      item->Click.connect([this,i]{chooseSwatchSize(i);});popup.addChild(item);
    }
    separator(popup);add(popup,U"保存色板","save");
    const auto anchor=paletteActions_->bounds();
    popup.showPopup(gfx::Point(anchor.x,anchor.y2()+uiGap*uiScale),display());requestFocus();
  }
  std::string activeRailTool() const {
    if(shapeTool_){const char* ids[]{"line.line","shape.rectangle-outline","shape.rectangle","shape.ellipse-outline","shape.ellipse"};return ids[int(shapeSpec_.kind)];}
    if(zoomTool_)return "zoom";
    if(eyedropperTool_)return "eyedropper";
    if(handTool_)return "hand";
    if(selectionTool_)return legacyToolGroups()[3][selectionKind_].id;
    if(gradientTool_)return "fill.gradient";
    if(fillTool_)return "fill.bucket";
    return eraser_?legacyToolGroups()[1].front().id:legacyToolGroups()[0].front().id;
  }
  void refresh() {
    ++panelFullRefreshes_;
    syncSelectionOutlineView();
    if(auto entry=menuItems_.find("toggleSelectionOutline");entry!=menuItems_.end())entry->second->setCaption(showSelectionOutline_?U"隐藏蚂蚁线":U"显示蚂蚁线");
    if(playbackModeIdentity_!=document.identity()){playbackSessionMode_=savedPlaybackMode_.value_or(document.animationLoop()?"all":"once");playbackTagMode_=playbackSessionMode_=="tag";playbackTagCycle_.clear();loopPlayback_={};playbackModeIdentity_=document.identity();playbackObservedFrame_=document.frame().id;}else if(playbackModeLoop_!=document.animationLoop()){playbackSessionMode_=document.animationLoop()?"all":"once";playbackTagMode_=false;playbackTagCycle_.clear();loopPlayback_={};}
    playbackModeLoop_=document.animationLoop();if(playing_ && playbackTagMode_ && playbackObservedFrame_!=document.frame().id)retargetTagPlayback();
    if(recentColorsIdentity_!=document.identity()){recentColors_={};recentDrag_.reset();recentColorsIdentity_=document.identity();}
    if(pending_==Pending::SpriteSheet&&sheetPreview_){try{sheetPreview_->setImage(buildSpriteSheetImage(document,sheetOptions_));discard_->setEnabled(true);}catch(const std::exception& e){sheetPreview_->clearImage();status_=U"精灵表预览失败："+unicodeText(e.what());discard_->setEnabled(false);}}
    if(symmetryIdentity_!=document.identity()){document.symmetryAxes=persistedSymmetryAxes_;symmetryIdentity_=document.identity();symmetryInitialized_=symmetryHas(document.symmetryAxes);}
    if(!document.floating())selectionFreeTransform_=false;
    if(selectionPivotIdentity_!=document.identity() || (!document.floating() && !selectionEqual(selectionPivotMask_,document.selection()))){selectionPivot_.reset();selectionFreeTransform_=false;selectionPivotIdentity_=document.identity();selectionPivotMask_=document.selection();}
    if(!homeOpen_ && !homeVisibility_.empty()){for(auto state:homeVisibility_)state.first->setVisible(state.second);homeVisibility_.clear();}
    if(documentOpen_ && !closedControlStates_.empty()){for(auto state:closedControlStates_)state.first->setEnabled(state.second);closedControlStates_.clear();}
    layoutDocumentTab();
    layoutModal();syncPaletteButtons();layoutPanelTabs();layoutPalette();layoutToolOptions();layoutLayers();raiseDockWidgets();
    commands_[3]->setEnabled(pending_==Pending::None && document.canUndo()); commands_[4]->setEnabled(pending_==Pending::None && document.canRedo());

    for(auto& item:menuItems_) item.second->validateItem();
    const bool railEnabled=documentOpen_ && pending_==Pending::None && !shapeDragging_ && !gradientPending_ && !gradientDragging_;
    for(std::size_t i=0;i<toolRail_.size();++i) {
      const auto& group=legacyToolGroups()[i];
      const auto active=activeRailTool();
      toolRail_[i]->active=std::any_of(group.begin(),group.end(),[&](const auto& tool){return active==tool.id;});
      toolRail_[i]->setEnabled(railEnabled && (group.size()>1 || group.front().command>=0 || i==9 || i==11));
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
    paletteScrollPixels_=0;paletteFocused_=false;ink_=document.palette().primary;
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
  void openSelectedLayerProperties(){if(pending_!=Pending::None || document.timelineSelection().layers.empty())return;showLayerOpacity(document.timelineSelection().layers);}
  void openLayerPropertiesFor(std::size_t index){if(pending_!=Pending::None || index>=document.timeline().state().layers.size())return;const auto id=document.timeline().state().layers[index].id;if(timelineGesture_.kind)finishTimelineGesture(true);auto targets=document.timelineSelection().layers;if(targets.size()<2 || std::find(targets.begin(),targets.end(),id)==targets.end())targets={id};showLayerOpacity(targets);}
  void showLayerOpacity(const std::vector<std::string>& targets={}) {
    cancelStroke();document.beginLayerProperties(targets);const auto& source=targets.empty()?document.layer():*std::find_if(document.timeline().state().layers.begin(),document.timeline().state().layers.end(),[&](const auto& l){return l.id==targets.front();});pending_=Pending::LayerOpacity;paletteInput_->numeric=false;paletteInput_->suffix.clear();paletteInput_->setText(utf8Text(source.name));paletteInput_->setVisible(true);
    layerOpacityRange_->value=int(std::lround(source.opacity*100));layerOpacityRange_->setVisible(true);
    keep_->caption=U"关闭";keep_->setVisible(true);dialogClose_->setVisible(true);menuBar_->setEnabled(false);
    for(auto b:commands_)b->setEnabled(false);for(auto b:swatches_)b->setEnabled(false);for(auto b:panelTabs_)b->setEnabled(false);
    paletteActions_->setEnabled(false);refresh();paletteInput_->requestFocus();paletteInput_->selectAllText();
  }
  void showRecoveryPreferences() {
    PixelMenu popup(skin_);
    auto toggle=new PixelMenuItem(font_,skin_,U"自动恢复保存");toggle->checked=[this]{return recoveryPreferences_.enabled;};toggle->Click.connect([this]{auto p=recoveryPreferences_;p.enabled=!p.enabled;setRecoveryPreferences(p);});popup.addChild(toggle);
    const double values[]{0.5,1,2,5,10};const char32_t* names[]{U"30 秒",U"1 分钟",U"2 分钟",U"5 分钟",U"10 分钟"};
    for(int i=0;i<5;++i){auto entry=new PixelMenuItem(font_,skin_,names[i]);const double value=values[i];entry->checked=[this,value]{return recoveryPreferences_.minutes==value;};entry->Click.connect([this,value]{auto p=recoveryPreferences_;p.minutes=value;setRecoveryPreferences(p);});popup.addChild(entry);}
    for(int days:{1,7,30,365}){const auto n=std::to_string(days);auto entry=new PixelMenuItem(font_,skin_,U"保留期预览："+std::u32string(n.begin(),n.end())+U" 天");entry->checked=[this,days]{return recoveryPreferences_.retentionDays==days;};entry->Click.connect([this,days]{auto p=recoveryPreferences_;p.retentionDays=days;setRecoveryPreferences(p);});popup.addChild(entry);}
    popup.showPopup(gfx::Point(bounds().x+8,bounds().y+36),display());
  }
  static const char32_t* preferenceSectionTitle(int i){static const char32_t* names[]{U"常规",U"快捷命令",U"外观",U"主题",U"指针",U"编辑",U"工具",U"撤销",U"文件",U"颜色与图层",U"预设",U"扩展",U"数位板",U"重置"};return names[i];}
  std::vector<int> preferencePageFields()const{
    if(preferenceSection_==6)return {0,1,2,3};
    if(preferenceSection_==5)return {4,5};
    if(preferenceSection_==8)return {6,7,8};
    return {};
  }
  static const char32_t* preferenceFieldTitle(int i){static const char32_t* names[]{U"缩放拖动",U"吸管来源",U"取色镜片",U"镜片尺寸",U"播放速度",U"结束后返回",U"自动恢复",U"保存间隔",U"保留期预览"};return names[i];}
  void createPreferencesControls(){
    for(int i=0;i<14;++i){preferenceTabs_[i]=button(preferenceSectionTitle(i),[this,i]{preferenceSection_=i;preferenceContentPixels_=0;preferenceFeedback_.clear();layoutModal();invalidate();});preferenceTabs_[i]->skinStyle="menu-row";preferenceTabs_[i]->setVisible(false);}
    const std::vector<std::u32string> choices[]{ {U"阶梯",U"平滑"},{U"合成图像",U"当前图层"},{U"关闭",U"开启"},{U"最小 · 50%",U"较小 · 75%",U"中等 · 100%",U"较大 · 125%"},{U"0.25×",U"0.5×",U"1×",U"1.5×",U"2×",U"3×"},{U"关闭",U"开启"},{U"关闭",U"开启"},{U"30 秒",U"1 分钟",U"2 分钟",U"5 分钟",U"10 分钟",U"30 分钟",U"60 分钟"},{U"1 天",U"7 天",U"30 天",U"365 天"} };
    for(int i=0;i<9;++i){auto field=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(field);addChild(field);preferenceFields_[i]=field;field->setOptions(choices[i]);field->setVisible(false);field->changed=[this,i](int value){auto& d=preferenceDraft_;const double rates[]{.25,.5,1,1.5,2,3},minutes[]{.5,1,2,5,10,30,60};const int days[]{1,7,30,365};if(i==0)d.smooth=value==1;if(i==1)d.source=value;if(i==2)d.lens=value==1;if(i==3)d.lensSize=value;if(i==4)d.rate=rates[value];if(i==5)d.returnStart=value==1;if(i==6)d.recovery.enabled=value==1;if(i==7)d.recovery.minutes=minutes[value];if(i==8)d.recovery.retentionDays=days[value];preferenceFeedback_.clear();layoutModal();invalidate();};}
    preferenceApply_=button(U"应用",[this]{applyPreferences();});preferenceApply_->setVisible(false);
    std::ifstream lens(palettePreferencePath().parent_path()/"eyedropper-lens.txt");int enabled,size;if(lens>>enabled>>size){eyedropperLensEnabled_=enabled!=0;eyedropperLensSize_=std::clamp(size,0,3);}
  }
  void showPreferences(){preferenceNavPixels_=preferenceContentPixels_=0;
    if(pending_!=Pending::None || (document.active() && !document.floating()) || selectionDragging_ || floatingDragging_ || zoomDragging_ || eyedropperGesture_.active())return;
    preferenceDraft_={zoomSmooth_,eyedropperLensEnabled_,playbackReturnToStart_,int(eyedropperSource_),eyedropperLensSize_,playbackRate_,recoveryPreferences_};preferenceFeedback_.clear();
    auto index=[](const auto& values,auto value,int fallback){for(int i=0;i<int(std::size(values));++i)if(values[i]==value)return i;return fallback;};
    const double rates[]{.25,.5,1,1.5,2,3},minutes[]{.5,1,2,5,10,30,60};const int days[]{1,7,30,365};
    const int selected[]{int(zoomSmooth_),int(eyedropperSource_),int(eyedropperLensEnabled_),eyedropperLensSize_,index(rates,playbackRate_,2),int(playbackReturnToStart_),int(recoveryPreferences_.enabled),index(minutes,recoveryPreferences_.minutes,3),index(days,recoveryPreferences_.retentionDays,1)};
    for(int i=0;i<9;++i)preferenceFields_[i]->setSelectedIndex(selected[i]);
    playing_=false;pending_=Pending::Preferences;discard_->caption=U"确定";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);saveBeforeClose_->setVisible(false);menuBar_->setEnabled(false);refresh();preferenceTabs_[preferenceSection_]->requestFocus();
  }
  bool applyPreferences(){
    try{
      auto d=preferenceDraft_;d.recovery=recovery::normalizePreferences(d.recovery);
      if(!smoke_){const auto dir=palettePreferencePath().parent_path();std::filesystem::create_directories(dir);auto write=[&](const char* name,const std::string& text){writeExportBytesAtomic(dir/name,std::vector<std::uint8_t>(text.begin(),text.end()));};
        write("zoom-tool-drag-mode.txt",d.smooth?"smooth":"stepped");write("eyedropper-source.txt",d.source?"current-layer":"composite");write("eyedropper-lens.txt",std::to_string(int(d.lens))+" "+std::to_string(d.lensSize));write("animation-playback.txt",std::to_string(d.rate)+" "+std::to_string(int(d.returnStart))+(savedPlaybackMode_?" "+*savedPlaybackMode_:""));recovery::savePreferencesAtomic(recoveryDirectory().parent_path()/"recovery-preferences.txt",d.recovery);
      }
      zoomSmooth_=d.smooth;eyedropperSource_=d.source?EyedropperSource::CurrentLayer:EyedropperSource::Composite;eyedropperLensEnabled_=d.lens;eyedropperLensSize_=d.lensSize;playbackRate_=d.rate;playbackReturnToStart_=d.returnStart;recoveryPreferences_=d.recovery;recoveryQueue_.setIntervalMinutes(d.recovery.minutes);recoveryDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(d.recovery.minutes*60000));preferenceDraft_=d;preferenceFeedback_=U"设置已应用";refresh();return true;
    }catch(const std::exception& e){preferenceFeedback_=U"保存失败，设置窗口保持打开";status_=unicodeText(e.what());invalidate();return false;}
  }
  void layoutPreferences(gfx::Rect modal){
    if(!preferenceApply_)return;const bool show=pending_==Pending::Preferences;
    auto nav=toDisplay(gfx::Rect(modal.x+6,modal.y+24,78,std::max(1,modal.h-57)));
    const int navTotal=14*15*uiScale;preferenceNavPixels_=std::clamp(preferenceNavPixels_,0,std::max(0,navTotal-nav.h));const bool navOverflow=navTotal>nav.h;
    auto content=toDisplay(gfx::Rect(modal.x+98,modal.y+46,modal.w-114,std::max(1,modal.h-85)));
    const auto fields=preferencePageFields();const int textHeight=preferenceSection_==8?170:preferenceSection_==6?165:preferenceSection_==2 || preferenceSection_==3?112:preferenceSection_==0 || preferenceSection_==4?98:64;
    const int contentTotal=std::max(textHeight,int(fields.size())*28+24)*uiScale;preferenceContentPixels_=std::clamp(preferenceContentPixels_,0,std::max(0,contentTotal-content.h));
    if(preferenceNavBar_){preferenceNavBar_->setDockBounds(gfx::Rect(nav.x2()-6*uiScale,nav.y,7*uiScale,nav.h));preferenceNavBar_->configure(navTotal,nav.h,preferenceNavPixels_);preferenceNavBar_->wheelStep=15*uiScale;preferenceNavBar_->setVisible(show && navOverflow);preferenceNavBar_->setEnabled(show);}
    if(navOverflow)nav.w-=6*uiScale;
    const bool contentOverflow=contentTotal>content.h;
    if(preferenceContentBar_){preferenceContentBar_->setDockBounds(gfx::Rect(content.x2()-6*uiScale,content.y,7*uiScale,content.h));preferenceContentBar_->configure(contentTotal,content.h,preferenceContentPixels_);preferenceContentBar_->wheelStep=24*uiScale;preferenceContentBar_->setVisible(show && contentOverflow);preferenceContentBar_->setEnabled(show);}
    if(contentOverflow)content.w-=6*uiScale;
    for(int i=0;i<14;++i){auto tab=preferenceTabs_[i];tab->setEnabled(show);tab->active=preferenceSection_==i;tab->setBounds(gfx::Rect(nav.x,nav.y+i*15*uiScale-preferenceNavPixels_,nav.w,15*uiScale));tab->paletteViewport=[nav]{return nav;};tab->setVisible(show && nav.intersects(tab->bounds()));}
    for(auto field:preferenceFields_)field->setVisible(false);
    int row=0;for(int i:fields){auto field=preferenceFields_[i];field->setEnabled(show && (i!=3 || preferenceDraft_.lens) && ((i!=7 && i!=8) || preferenceDraft_.recovery.enabled));field->setBounds(toDisplay(gfx::Rect(modal.x+171,modal.y+47+row++*28,modal.w-179-(contentOverflow?6:0),20)).offset(0,-preferenceContentPixels_));field->paletteViewport=[content]{return content;};field->setVisible(show && content.intersects(field->bounds()));}
    preferenceApply_->setVisible(show);preferenceApply_->setEnabled(show);
    if(show){int x=modal.x2()-3*58-2*uiGap-8;keep_->setBounds(toDisplay(gfx::Rect(x,modal.y2()-25,58,19)));preferenceApply_->setBounds(toDisplay(gfx::Rect(x+58+uiGap,modal.y2()-25,58,19)));discard_->setBounds(toDisplay(gfx::Rect(x+116+2*uiGap,modal.y2()-25,58,19)));}
  }
public:
  void smokePreferences(const std::filesystem::path& directory){
    smoke_=true;homeOpen_=false;documentOpen_=true;requestFocus();refresh();const auto pixels=document.pixels();const auto history=document.historySize();const bool dirty=document.dirty(),smooth=zoomSmooth_,lens=eyedropperLensEnabled_;const auto original=bounds();
    menuItems_.at("openPreferences")->Click();if(pending_!=Pending::Preferences)throw std::runtime_error("Preferences menu did not open dialog");
    preferenceTabs_[6]->Click();preferenceFields_[0]->setSelectedIndex(!smooth,true);if(zoomSmooth_!=smooth)throw std::runtime_error("Preferences draft changed live setting before Apply");resolve(false);if(zoomSmooth_!=smooth)throw std::runtime_error("Preferences cancel changed setting");
    showPreferences();preferenceTabs_[6]->Click();preferenceFields_[0]->setSelectedIndex(!smooth,true);preferenceFields_[2]->setSelectedIndex(!lens,true);preferenceApply_->Click();if(zoomSmooth_==smooth || eyedropperLensEnabled_==lens || pending_!=Pending::Preferences)throw std::runtime_error("Preferences Apply did not update while keeping dialog open");resolve(false);showPreferences();if(preferenceDraft_.smooth!=zoomSmooth_ || preferenceDraft_.lens!=eyedropperLensEnabled_)throw std::runtime_error("Preferences reopened stale values");
    for(auto size:{gfx::Size(720,600),gfx::Size(1280,960)}){setBounds(gfx::Rect(original.origin(),size));refresh();const auto modal=dialogDisplayBounds();for(auto tab:preferenceTabs_)if(!modal.contains(tab->bounds()) || tab->hasFlags(ui::HIDDEN))throw std::runtime_error("Preferences sidebar escaped viewport visible="+std::to_string(tab->isVisible())+" tab="+std::to_string(tab->bounds().x)+","+std::to_string(tab->bounds().y)+","+std::to_string(tab->bounds().w)+","+std::to_string(tab->bounds().h)+" modal="+std::to_string(modal.x)+","+std::to_string(modal.y)+","+std::to_string(modal.w)+","+std::to_string(modal.h));for(auto field:preferenceFields_)if(!field->hasFlags(ui::HIDDEN)&&!modal.contains(field->bounds()))throw std::runtime_error("Preferences field escaped viewport");if(!modal.contains(preferenceApply_->bounds()) || !bounds().contains(modal))throw std::runtime_error("Preferences actions escaped viewport");}
    const auto savedHome=homeOpen_;homeOpen_=true;refresh();if(preferenceTabs_[0]->hasFlags(ui::HIDDEN) || preferenceApply_->hasFlags(ui::HIDDEN))throw std::runtime_error("Home hid preferences controls");homeOpen_=savedHome;refresh();
    auto surface=os::instance()->makeRgbaSurface(bounds().w,bounds().h);{ui::Graphics g(surface);ui::PaintEvent ev(this,&g);onPaint(ev);paintDialog(g);}for(auto child:children())if(!child->hasFlags(ui::HIDDEN) && modalControl(child)){if(auto button=dynamic_cast<PixelButton*>(child)){ui::Graphics g(nullptr,surface,child->bounds().x,child->bounds().y);g.saveClip();g.clipRect(child->clientBounds());ui::PaintEvent ev(child,&g);button->onPaint(ev);g.restoreClip();}}writeSmokeFrame(surface.get(),directory/"preferences-smoke.bmp");
    resolve(true);if(pending_!=Pending::None || !preferenceApply_->hasFlags(ui::HIDDEN) || document.pixels()!=pixels || document.historySize()!=history || document.dirty()!=dirty)throw std::runtime_error("Preferences close modified document or leaked controls");zoomSmooth_=smooth;eyedropperLensEnabled_=lens;setBounds(original);refresh();
  }
private:
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
    if(pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap&&discard){gmPicker_->finishInteraction();scheduleGradientMap(true);refresh();return;}
    if(pending_==Pending::AntiAlias && discard){requestAntiAliasApply();return;}
    if(pending_==Pending::Convolution && convolutionCommit_ && !discard)return;
    if(pending_==Pending::Convolution && discard){requestConvolutionApply(true);return;}
    const auto action=pending_;
    if(action==Pending::AntiAlias){aaPicker_->finishInteraction();stopAntiAlias();document.cancelColorAdjustment();for(auto c:{aaAutoButton_,aaInterior_,aaLiveButton_})c->setVisible(false);aaSource_->setVisible(false);aaOpacity_->setVisible(false);aaOpacitySlider_->setVisible(false);aaColorEntry_->setVisible(false);aaPicker_->setVisible(false);discard_->caption=U"丢弃";discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);}
    if(action==Pending::Convolution){stopConvolution();document.cancelColorAdjustment();for(auto c:convolutionPresets_)c->setVisible(false);for(auto c:convolutionChannels_)c->setVisible(false);for(auto c:{convolutionTiled_,convolutionLive_,convolutionApply_})c->setVisible(false);convolutionScroll_->setVisible(false);discard_->caption=U"丢弃";discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);}
    if(action==Pending::Preferences){if(discard && !applyPreferences())return;discard=false;discard_->caption=U"丢弃";for(auto tab:preferenceTabs_)tab->setVisible(false);for(auto field:preferenceFields_)field->setVisible(false);preferenceApply_->setVisible(false);}
    if(action==Pending::ReplaceColor){finishReplaceSampling();cancelReplacePreview();if(discard){if(replaceScope_=="palette"){if(document.beginPaletteReplacement()){document.updatePaletteReplacement(replaceSource_,replaceDestination_,true);document.commitPaletteReplacement();}}else if(document.beginColorReplacement(replaceTargets(),replaceScope_=="selection")){document.updateColorReplacement(replaceSource_,replaceDestination_,true);document.commitColorAdjustment();}}for(auto input:replaceInputs_)input->setVisible(false);for(auto b:replaceSample_)b->setVisible(false);for(auto b:{replaceScopeButton_,replacePreviewButton_,replaceRememberButton_})b->setVisible(false);discard_->setEnabled(true);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::BrushFolderName){if(discard){try{PatternBrushLibrary library(fillBrushLibraryDirectory());auto result=fillFolderRename_?library.renameFolder(fillFolderEditing_,paletteInput_->text()):library.createFolder(paletteInput_->text(),fillFolderEditing_);fillFolder_=result.id;applyFillLibrarySelection();}catch(const std::exception& e){status_=U"文件夹操作失败："+unicodeText(e.what());refresh();return;}}paletteInput_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::SheetImport){if(discard){try{document.importSpriteSheet(importSheetOptions_);fitCanvas();}catch(const std::exception& e){status_=U"精灵表导入失败："+unicodeText(e.what());invalidate();return;}}for(auto input:importSheetInputs_)input->setVisible(false);importSheetLayout_->setVisible(false);importSheetPartial_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::GifExport){if(discard&&!saveGifExport())return;for(auto input:gifInputs_)input->setVisible(false);for(auto b:{gifRange_,gifDirection_,gifTrim_})b->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::SpriteSheet){if(discard&&!saveSpriteSheet())return;discard_->setEnabled(true);for(auto b:sheetButtons_)b->setVisible(false);sheetValue_->setVisible(false);if(sheetPreview_)sheetPreview_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::StaticExport){if(discard&&!saveStaticExport())return;exportScaleInput_->setVisible(false);exportTrimButton_->setVisible(false);exportSelectionButton_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::ImageResize){if(discard){try{document.resizeImage(resizeWidth_,resizeHeight_,resizeMethodValue_);fitCanvas();}catch(const std::exception& e){status_=U"调整尺寸失败："+unicodeText(e.what());invalidate();return;}}for(auto input:resizeInputs_)input->setVisible(false);resizeLock_->setVisible(false);resizeMethod_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::ColorAdjustment){cancelGradientMapJob();if(adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap)gmPicker_->finishInteraction();if(discard){document.updateColorAdjustment(adjustmentSpec_,true);document.commitColorAdjustment();}else document.cancelColorAdjustment();for(auto input:adjustmentInputs_)input->setVisible(false);adjustmentPreview_->setVisible(false);adjustmentColorize_->setVisible(false);adjustmentToneButton_->setVisible(false);curveEditor_->setVisible(false);for(auto b:{curveChannelButton_,curveResetButton_,curveDeleteButton_})b->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::PaletteExtract){if(discard && !applyPaletteExtraction())return;paletteInput_->setVisible(false);extractNameInput_->setVisible(false);extractModeButton_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::LoopSection){if(discard && !commitLoopEditor())return;for(auto input:loopInputs_)input->setVisible(false);loopDirection_->setVisible(false);loopDraft_.reset();discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}
    if(action==Pending::OnionValue){previewOnionValue();saveOnionSettings();paletteInput_->setVisible(false);paletteInput_->suffix.clear();discard=false;}
    if(action==Pending::FrameDuration){document.commitFrameDuration();paletteInput_->setVisible(false);paletteInput_->suffix.clear();discard=false;}
    if(action==Pending::LayerOpacity){document.commitLayerOpacity();layerOpacityRange_->setVisible(false);paletteInput_->setVisible(false);discard=false;}
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
  void useEyedropperTool(){if(document.active() || selectionDragging_ || floatingDragging_ || shapeDragging_ || gradientDragging_ || gradientPending_ || fillDragging_ || eyedropperGesture_.active() || zoomDragging_)return;cancelStroke();selectionTool_=shapeTool_=gradientTool_=fillTool_=handTool_=eraser_=zoomTool_=false;eyedropperTool_=true;playing_=false;layoutToolOptions();refresh();}
  void updateEyedropperLens(gfx::Point pointer,Pixel sampled) {
    if(!eyedropperLensEnabled_){eyedropperLensSurface_.reset();return;}
    if(!eyedropperLensSurface_)eyedropperLensPrevious_=eyedropperGesture_.secondary()?document.palette().secondary:document.palette().primary;
    eyedropperLensPointer_=pointer;
    const double px=double(pointer.x-canvas_.x)/canvasScale(),py=double(pointer.y-canvas_.y)/canvasScale();
    const int sx=int(std::floor(px))-12,sy=int(std::floor(py))-12;
    auto pixels=eyedropperSource_==EyedropperSource::Composite?compositeNormalRegion(document.timeline(),document.frame().id,{sx,sy,25,25}):std::vector<Pixel>(625);
    if(eyedropperSource_==EyedropperSource::CurrentLayer)for(int y=0;y<25;++y)for(int x=0;x<25;++x)pixels[y*25+x]=sampleEyedropper(document.timeline(),document.frame().id,document.layer().id,document.width(),document.height(),sx+x,sy+y,eyedropperSource_);
    // Legacy 256px shell / 204px field; adapt CSS pixels to native 2x UI.
    eyedropperLensSurface_=os::instance()->makeRgbaSurface(128,128);eyedropperLensSurface_->clear();
    const double pixelScale=std::max(12.0,zoom_*1.5)/2;
    auto over=[](Pixel background,Pixel color){const unsigned a=color>>24;auto c=[&](int shift){return (((color>>shift)&255)*a+((background>>shift)&255)*(255-a)+127)/255;};return Pixel(c(0)|(c(8)<<8)|(c(16)<<16)|0xff000000);};
    const auto& pointerBitmap=*eyedropperLensPointers_[(299*(sampled&255)+587*((sampled>>8)&255)+114*((sampled>>16)&255))/1000<145?1:0].bitmap;
    os::SurfaceLock lock(eyedropperLensSurface_.get());
    for(int y=0;y<128;++y)for(int x=0;x<128;++x){
      const int at=(y/2)*64+x/2;Pixel color=0;
      if(eyedropperLensMasks_[0].bitmap->pixels[at]>>24){
        const int dx=int(std::floor(px+(x+.5-64)/pixelScale)),dy=int(std::floor(py+(y+.5-64)/pixelScale));
        const auto checker=skin_[(int(std::floor(dx/4.0))+int(std::floor(dy/4.0)))%2?"checkerA":"checkerB"];
        const Pixel bg=Pixel(gfx::getr(checker)|(gfx::getg(checker)<<8)|(gfx::getb(checker)<<16)|0xff000000);
        color=over(bg,dx>=0 && dy>=0 && dx<document.width() && dy<document.height() && dx>=sx && dx<sx+25 && dy>=sy && dy<sy+25?pixels[(dy-sy)*25+dx-sx]:0);
        if(x>=56 && x<72 && y>=56 && y<72){const auto p=pointerBitmap.pixels[(y-56)*2*32+(x-56)*2];color=over(color,(p&0xffffff)|((p>>25)<<24));}
      }
      if(eyedropperLensMasks_[1].bitmap->pixels[at]>>24)color=color?over(color,sampled):sampled;
      if(eyedropperLensMasks_[2].bitmap->pixels[at]>>24)color=color?over(color,eyedropperLensPrevious_):eyedropperLensPrevious_;
      const auto frame=eyedropperLensMasks_[3].bitmap->pixels[at];if(frame>>24)color=frame;
      eyedropperLensSurface_->putPixel(gfx::rgba(color&255,(color>>8)&255,(color>>16)&255,color>>24),x,y);
    }
  }
  void paintEyedropperLens(ui::Graphics& g) {
    if(!eyedropperGesture_.active() || !eyedropperLensSurface_)return;
    UiPaintScale scale(g);auto viewport=uiLogical(canvasViewport());viewport.offset(-bounds().x/uiScale,-bounds().y/uiScale);
    const double lensSizes[]{.5,.75,1,1.25};const int size=int(128*lensSizes[eyedropperLensSize_]);const gfx::Point pointer((eyedropperLensPointer_.x-bounds().x)/uiScale,(eyedropperLensPointer_.y-bounds().y)/uiScale);
    const int x=std::clamp(pointer.x-size/2,viewport.x+3,std::max(viewport.x+3,viewport.x2()-size-3));
    const int y=pointer.y-size-9>=viewport.y+3?pointer.y-size-9:std::clamp(pointer.y+9,viewport.y+3,std::max(viewport.y+3,viewport.y2()-size-3));
    ui::Paint composite;composite.blendMode(os::BlendMode::SrcOver);
    g.saveClip();g.clipRect(viewport);g.drawSurface(eyedropperLensSurface_.get(),gfx::Rect(0,0,128,128),gfx::Rect(x,y,size,size),os::Sampling(),&composite);g.restoreClip();
  }
  void sampleEyedropperAt(Point p){try{const auto color=sampleEyedropper(document.timeline(),document.frame().id,document.layer().id,document.width(),document.height(),p.x,p.y,eyedropperSource_);eyedropperGesture_.sample(color);document.setPaletteRole(color,eyedropperGesture_.secondary(),paletteLocked_);if(replaceSampling_>=0)changeReplaceColor(replaceSampling_,color,true);refresh();}catch(const std::exception& e){status_=U"采色失败："+unicodeText(e.what());invalidate();}}
  void finishEyedropper(){const auto added=eyedropperGesture_.finish(paletteSamplingHeld_);if(added)document.addPaletteColor(*added);eyedropperLensSurface_.reset();if(hasCapture())releaseMouse();if(replaceSampling_>=0)finishReplaceSampling();updateNavigationCursor();refresh();}
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
  void createBrushFromSelection(){
    document.commitFloatingPaste();if(!document.selection()){status_=U"需要像素选区";refresh();return;}
    try{auto brush=createSelectionPatternBrush(document.pixels(),document.width(),document.height(),*document.selection());if(!brush){status_=U"选区中没有可用笔刷像素";refresh();return;}const auto directory=smoke_?fillBrushLibraryDirectory().parent_path().parent_path()/"pattern-brush-library-fixture":fillBrushLibraryDirectory();PatternBrushLibrary library(directory);auto stored=library.save("笔刷",encodePatternBrushPng(*brush),true,brush->sourceX,brush->sourceY);pencilImageBrushId_=stored.id;pencilImageBrush_=*brush;fillPattern_.brushes.clear();fillLibrarySelection_={};fillImageName_.clear();document.previewSelection({});selectionPivot_.reset();selectionPropertiesActive_=false;selectionFreeTransform_=false;selectionTool_=shapeTool_=eyedropperTool_=gradientTool_=fillTool_=handTool_=eraser_=false;status_=U"选区笔刷已保存到本地库";}catch(const std::exception& e){status_=U"创建选区笔刷失败："+unicodeText(e.what());}refresh();
  }
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
    fillTextureButton_=button(U"纯色",[this]{showFillTexturePopup();});fillControls_.push_back({fillTextureButton_,48});
    fillTextureScale_=new PixelEntry(font_,skin_);fillTextureScale_->numeric=true;addChild(fillTextureScale_);fillControls_.push_back({fillTextureScale_,32});auto scale=[this]{try{fillPattern_.textureScale=std::clamp(std::stoi(fillTextureScale_->text()),1,16);saveBrushPreferences();}catch(...){}layoutToolOptions();};fillTextureScale_->Change.connect(scale);fillTextureScale_->blur=scale;fillTextureScale_->accept=[this,scale]{scale();requestFocus();};
    fillImageButton_=button(U"图案",[this]{showFillLibraryMenu();});fillControls_.push_back({fillImageButton_,48});
  }
  void createEyedropperOptions(){
    int maskIndex=0;for(const auto name:{"viewport","eyedropper-magnifier-sampled-mask","eyedropper-magnifier-previous-mask","eyedropper-magnifier-frame"})eyedropperLensMasks_[maskIndex++]=importSkinPng(assets_/"eyedropper"/(std::string(name)+".png"),64);
    eyedropperLensPointers_[0]=importSkinPng(assets_/"cursors/02-Slice-2.png",32);eyedropperLensPointers_[1]=importSkinPng(assets_/"cursors/03-Slice-3.png",32);
    {std::ifstream in(palettePreferencePath().parent_path()/"zoom-tool-drag-mode.txt");std::string mode;if(in>>mode)zoomSmooth_=mode=="smooth";}
    // localStorage preference becomes the existing native preference directory.
    try{std::ifstream in(palettePreferencePath().parent_path()/"eyedropper-source.txt");std::string value;if(in>>value && value=="current-layer")eyedropperSource_=EyedropperSource::CurrentLayer;}catch(const std::exception& e){status_=U"吸管设置读取失败："+unicodeText(e.what());}
    eyedropperSourceButton_=button(U"合成图像",[this]{PixelMenu menu(skin_);for(int i=0;i<2;++i){auto item=new PixelMenuItem(font_,skin_,i?U"当前图层":U"合成图像");item->checked=[this,i]{return eyedropperSource_==(i?EyedropperSource::CurrentLayer:EyedropperSource::Composite);};item->Click.connect([this,i]{eyedropperSource_=i?EyedropperSource::CurrentLayer:EyedropperSource::Composite;try{if(!smoke_){const auto path=palettePreferencePath().parent_path()/"eyedropper-source.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out.exceptions(std::ios::failbit|std::ios::badbit);out<<(i?"current-layer":"composite");}}catch(const std::exception& e){status_=U"吸管设置保存失败："+unicodeText(e.what());}refresh();});menu.addChild(item);}const auto at=eyedropperSourceButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});
  }
  void showToolGroup(std::size_t index,bool smoke=false) {
    if(floatingDragging_ || (selectionDragging_ && selectionKind_==5))return;
    if(pending_!=Pending::None) return;
    class ToolFlyout final:public ui::PopupWindow {
    public:ToolFlyout():ui::PopupWindow("",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow){setAutoRemap(false);setWantFocus(true);}
      bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return ui::PopupWindow::onProcessMessage(msg);}
    };
    // Legacy's manual popover allows the rest of the rail to keep receiving input.
    if(toolFlyout_)toolFlyout_->closeWindow(nullptr);
    toolFlyout_=std::make_unique<ToolFlyout>();
    auto& popup=*toolFlyout_;
    std::vector<PixelButton*> buttons;
    const auto& group=legacyToolGroups()[index];
    const auto anchor=toolRail_[index]->bounds();
    const int width=(int(group.size())*14+1)*uiScale,height=16*uiScale;
    const auto view=display()->bounds();
    const gfx::Rect area(std::clamp(anchor.x2()+uiGap*uiScale,view.x,std::max(view.x,view.x2()-width)),std::clamp(anchor.y,view.y,std::max(view.y,view.y2()-height)),width,height);
    popup.setBounds(area);
    for(const auto& tool:legacyToolGroups()[index]) {
      const bool available=std::string(tool.id)=="eyedropper" || std::string(tool.id)=="zoom" || tool.command>=0 || index==3 || std::string(tool.id)=="line.line" || std::string(tool.id)=="shape.rectangle-outline" || std::string(tool.id)=="shape.rectangle" || std::string(tool.id)=="shape.ellipse-outline" || std::string(tool.id)=="shape.ellipse" || (std::string(tool.id)=="fill.bucket" || std::string(tool.id)=="fill.gradient");
      auto item=new PixelButton(font_,skin_,U"",[]{});
      item->iconGroupIndex=int(buttons.size());item->iconGroupCount=int(group.size());
      item->hover=[this,label=std::u32string(tool.label),available]{status_=label+(available?U"":U" \u00b7 \u672a\u63a5\u5165");invalidate();};
      item->iconSkin=&toolIcons_;item->icon=std::string(tool.icon)+"-normal";
      item->setEnabled(available);
      item->active=activeRailTool()==tool.id;
      if(available) item->Click.connect([this,command=tool.command,id=std::string(tool.id)]{if(id=="eyedropper"){useEyedropperTool();return;}if(id=="zoom"){useZoomTool();return;}if(id=="line.line" || id=="shape.rectangle-outline" || id=="shape.rectangle" || id=="shape.ellipse-outline" || id=="shape.ellipse"){useShapeTool(id=="line.line"?ShapeKind::Line:id=="shape.rectangle-outline"?ShapeKind::RectangleOutline:id=="shape.rectangle"?ShapeKind::Rectangle:id=="shape.ellipse-outline"?ShapeKind::EllipseOutline:ShapeKind::Ellipse);return;}if(id=="fill.bucket"){useFillTool();return;}if(id=="fill.gradient"){useGradientTool();return;}if(command<0){int kind=id=="selection.ellipse"?1:id=="selection.lasso"?2:id=="selection.polygon-lasso"?3:id=="selection.magic"?4:id=="selection.brush"?5:0;useSelectionTool(kind);return;}document.commitFloatingPaste();cancelStroke();selectionTool_=false;shapeTool_=false;eyedropperTool_=false;zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=command==5;eraser_=command==2;refresh();});
      if(available)item->Click.connect([window=&popup]{window->closeWindow(nullptr);});
      popup.addChild(item);buttons.push_back(item);
    }

    auto place=[window=&popup,buttons]{const auto box=window->bounds();for(int i=0;i<int(buttons.size());++i)buttons[i]->setBounds(gfx::Rect(box.x+i*14*uiScale,box.y,15*uiScale,16*uiScale));};
    popup.Resize.connect([place](ui::ResizeEvent&){place();});place();
    popup.openWindow();
    if(smoke){
      if(popup.isForeground())throw std::runtime_error("Tool flyout must not block background hover");
      for(auto button:toolRail_)if(button->isEnabled() && button->isVisible()){
        const auto point=display()->nativeWindow()->pointToScreen(button->bounds().center());
        if(manager()->pickFromScreenPos(point)!=button)throw std::runtime_error("Tool flyout blocked another rail button");
      }
      for(int i=0;i<int(buttons.size());++i){const auto box=buttons[i]->bounds();if(box.w!=15*uiScale || box.h!=16*uiScale || box.y!=buttons[0]->bounds().y || (i && box.x!=buttons[i-1]->bounds().x2()-uiScale))throw std::runtime_error("Tool flyout must be one connected horizontal row");if(buttons[i]->active!=(activeRailTool()==group[i].id))throw std::runtime_error("Tool flyout selection mismatch");}
      popup.closeWindow(nullptr);
    }
  }
  void createToolRail() {
    toolIcons_.colors=skin_.colors;
    toolIcons_.assets.colors=skin_.assets.colors;
    toolIcons_.monochromeIcons=true;
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
      b->caption.clear();b->skinStyle="icon_button";b->iconGroupCount=1;
      b->iconSkin=&toolIcons_;b->icon=std::string(first.icon)+"-normal";
      b->mutedIcon=first.command<0 && index!=3 && index!=4 && index!=5 && index!=6 && index!=9 && index!=11;if(index==4)b->Click.connect([this]{useShapeTool(shapeSpec_.kind==ShapeKind::Line?ShapeKind::Rectangle:shapeSpec_.kind);});if(index==5)b->Click.connect([this]{useShapeTool(ShapeKind::Line);});if(index==6)b->Click.connect([this]{if(rememberGradientTool_)useGradientTool();else useFillTool();});if(index==9)b->Click.connect([this]{useEyedropperTool();});if(index==11)b->Click.connect([this]{useZoomTool();});if(index==3)b->Click.connect([this]{useSelectionTool();});
      b->hover=[this,index] {
        const auto& group=legacyToolGroups()[index];
        const auto& primary=group[index==3?selectionKind_:index==6 && rememberGradientTool_?1:0];
        status_=std::u32string(primary.label)+(primary.command<0 && index!=3 && index!=4 && index!=5 && index!=6 && index!=9 && index!=11?U" · 未接入":U"");
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
  ui::Widget* frontWidgetAt(gfx::Point point){
    if(!isVisible() || !bounds().contains(point))return nullptr;
    const auto widgets=children();
    for(auto it=widgets.rbegin();it!=widgets.rend();++it){auto child=*it;
      if(pending_!=Pending::None && child!=modalSurface_ && !modalControl(child))continue;
      if(child==paletteSelectionOverlay_ && !paletteOutlineContains(point))continue;
      if(auto viewport=scrollViewports_.find(child);viewport!=scrollViewports_.end() && !viewport->second.contains(point))continue;
      if(auto cell=dynamic_cast<PixelButton*>(child);cell && cell->paletteViewport && !cell->paletteViewport().contains(point))continue;
      if(auto entry=dynamic_cast<PixelEntry*>(child);entry && entry->paletteViewport && !entry->paletteViewport().contains(point))continue;
      if(auto hit=child->pick(point))return hit;
    }
    return this;
  }
  void focusWidgetOverlay(ui::Widget* w){
    if(!w)return;const int id=widgetColumn(w);
    if(pending_!=Pending::None && modalControl(w)){dialogFocus_=++overlayClock_;raiseDockWidgets();invalidate();}
    else if(pending_==Pending::None && id>=0 && columnFloating(id)){for(int tab:docking_.groups[docking_.groupOf(id)].tabs)floatingFocus_[tab]=++overlayClock_;raiseDockWidgets();invalidate();}
  }
  void updatePaletteMouse(std::optional<gfx::Point> position) {
    const auto previous=paletteMousePosition_;
    paletteMousePosition_=position;
    if(previous!=position && !homeOpen_ && documentOpen_ && (ordinaryBrushTool() || (shapeTool_ && shapeSpec_.kind==ShapeKind::Line)) &&
       ((previous && canvasViewport().contains(*previous)) || (position && canvasViewport().contains(*position))))invalidateRect(canvasViewport());
    if(previous!=position && layersPanelOpen_) {
      // Filtered display-relative pointer updates also cover the part of the
      // frame lying outside hit widgets, and movements inside a single widget.
      const auto outlines=timelineOutlines();
      const bool changed=std::any_of(outlines.begin(),outlines.end(),[&](const auto& outline){
        auto material=skin_.selectionMaterialBounds(uiPhysical(outline.border).offset(outline.offset));material.offset(bounds().x,bounds().y);
        return (previous && skin_.selectionContains(material,*previous)) != (position && skin_.selectionContains(material,*position));
      });
      const auto l=columnLayout(uiLogical(bounds()),2);
      auto grid=uiPhysical(gfx::Rect(l.workX+5,l.layerTop+timelineHeaderOffset(),l.workW-9,l.bottom-l.layerTop-timelineHeaderOffset()-5));grid.offset(bounds().x,bounds().y);
      if(changed || (previous && grid.contains(*previous)) || (position && grid.contains(*position)))invalidateTimelineGrid();
    }
    if(paletteSelectionOverlay_ && paletteSelectionOverlay_->isVisible())paletteSelectionOverlay_->invalidate();
    for(auto swatch:swatches_) if(swatch->active && swatch->isVisible()) swatch->invalidate();
  }
  void smokeModalBackground() {
    const bool oldPicker=colorPickerOpen_,oldPreview=previewPanelOpen_;
    colorPickerOpen_=previewPanelOpen_=true;refresh();
    auto renderPicker=[&] {
      auto surface=os::instance()->makeRgbaSurface(bounds().x2(),bounds().y2());surface->clear();
      ui::Graphics g(nullptr,surface,colorPicker_->bounds().x,colorPicker_->bounds().y);
      g.clipRect(colorPicker_->clientBounds());ui::PaintEvent ev(colorPicker_,&g);colorPicker_->onPaint(ev);return surface;
    };
    const auto oldRecent=recentColors_;recentColors_.remember({0x123456ff});refresh();auto baseline=renderPicker();
    const auto previousGeometry=modalGeometry_;
    showLayerOpacity();
    if(!colorPicker_->isVisible() || !pickerPrimary_->isVisible() || !pickerSecondary_->isVisible() || !recentButtons_.front()->isVisible() || !previewPanel_->isVisible())throw std::runtime_error("Dialog hid background controls");
    if(colorPicker_->isEnabled() || pickerPrimary_->isEnabled())throw std::runtime_error("Dialog left color controls interactive");
    // Exercise separate child repaint with the dialog overlapping the picker,
    // then moved to another location. Compare every pixel, including borders.
    for(int offset:{0,12}) {
      const auto picker=uiLogical(colorPicker_->bounds());
      modalGeometry_[pending_]=gfx::Rect(picker.x+offset,picker.y+12,modalMinimumWidth(),modalMinimumHeight());layoutModal();
      const auto modal=dialogDisplayBounds();
      auto actual=renderPicker();auto expected=os::instance()->makeRgbaSurface(bounds().x2(),bounds().y2());expected->clear();
      {ui::Graphics g(nullptr,expected,bounds().x,bounds().y);paintDialog(g);}
      const auto field=colorPicker_->bounds();int outside=0,inside=0;
      for(int y=field.y;y<field.y2();++y)for(int x=field.x;x<field.x2();++x){
        const gfx::Point point(x,y);bool control=false;for(auto child:children())if(child->isVisible() && modalControl(child) && child->bounds().contains(point))control=true;
        if(control)continue;
        if(modal.contains(point)){++inside;if(actual->getPixel(x,y)!=expected->getPixel(x,y))throw std::runtime_error("Picker repaint overwrote dialog");}
        else{++outside;if(actual->getPixel(x,y)!=baseline->getPixel(x,y))throw std::runtime_error("Dialog changed background picker pixels");}
      }
      if(!outside || !inside)throw std::runtime_error("Modal overlap regression did not cover both regions");
    }
    resolve(false);modalGeometry_=previousGeometry;recentColors_=oldRecent;colorPickerOpen_=oldPicker;previewPanelOpen_=oldPreview;refresh();
  }
  void smokeToolPropertyLayout(){
    useFillTool();if(fillTextureScale_->isVisible())throw std::runtime_error("Texture parameter leaked into property bar");showFillTexturePopup(true);
    useGradientTool();const bool previousFreeform=gradientFreeform_;showGradientStopsMenu(true);gradientFreeform_=previousFreeform;
    for(auto input:{wandToleranceInput_,wandGapInput_,fillToleranceInput_,fillGapInput_,gradientTolerance_,selectionBrushAngleInput_})if(!input->focus)throw std::runtime_error("Legacy range popup missing");

    const int previousTolerance=gradientOptions_.tolerance;showPropertyRange(gradientTolerance_,0,255);if(propertyRangeSlider_->parent()!=propertyRangePopup_.get() || propertyRangePopup_->isForeground())throw std::runtime_error("Range popover ownership/modal state");propertyRangeSlider_->changed(73);if(gradientOptions_.tolerance!=73)throw std::runtime_error("Range popover binding");gradientOptions_.tolerance=previousTolerance;propertyRangePopup_->closeWindow(nullptr);
    // Match a real owner click: focus can open the popup before MouseDown.
    gradientTolerance_->requestFocus();manager()->dispatchMessages();
    auto clickOwner=[&]{ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,gradientTolerance_->bounds().center());down.setDisplay(display());gradientTolerance_->onProcessMessage(&down);down.setFromFilter(true);propertyRangePopup_->sendMessage(&down);if(!propertyRangePopup_->isVisible())throw std::runtime_error("Owner click immediately closed range popup");ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,gradientTolerance_->bounds().center());gradientTolerance_->onProcessMessage(&up);};
    clickOwner();propertyRangePopup_->closeWindow(nullptr);clickOwner();propertyRangePopup_->closeWindow(nullptr);requestFocus();
    for(auto button:toolRail_)if(!button->caption.empty() || button->skinStyle!="icon_button" || button->iconGroupCount!=1)throw std::runtime_error("Tool rail must reuse shared icon button materials");
    for(std::size_t i=0;i<legacyToolGroups().size();++i)if(legacyToolGroups()[i].size()>1)showToolGroup(i,true);
    for(int kind=0;kind<5;++kind){useShapeTool(ShapeKind(kind));for(std::size_t i=0;i<toolRail_.size();++i)if(toolRail_[i]->active!=(i==std::size_t(kind==0?5:4)))throw std::runtime_error("Shape/line rail selection");if(!shapeModeButton_->hasFlags(ui::HIDDEN))throw std::runtime_error("Unexpected shape mode property");}
    commands_[1]->Click();
    auto check=[&]{
      const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
      if(commands_[4]->bounds().x2()!=(rc.x+l.workX+l.workW)*uiScale || commands_[3]->bounds().x2()+uiGap*uiScale!=commands_[4]->bounds().x)throw std::runtime_error("History buttons overlap canvas dock boundary");
      if(supportsToolSymmetry() && !symmetryButtons_[0]->hasFlags(ui::HIDDEN)){
        int right=(rc.x+l.workX)*uiScale;
        auto visit=[&](ui::Widget* w){if(!w->hasFlags(ui::HIDDEN) && std::find(symmetryButtons_.begin(),symmetryButtons_.end(),w)==symmetryButtons_.end())right=std::max(right,(scrollViewports_.count(w)?std::min(w->bounds().x2(),scrollViewports_.at(w).x2()):w->bounds().x2())+uiGap*uiScale);};
        for(const auto& c:toolControls_)visit(c.first);for(const auto* list:{&selectionControls_,&fillControls_,&gradientControls_,&shapeControls_})for(const auto& c:*list)visit(c.first);
        if(symmetryButtons_[0]->bounds().x!=right || symmetryButtons_[5]->bounds().x2()>commands_[3]->bounds().x-uiGap*uiScale)throw std::runtime_error("Symmetry is not adjacent to tool properties");
      }
    };
    check();const auto docking=docking_;const bool preview=previewPanelOpen_;const auto previewBounds=previewPanel_->bounds();previewPanelOpen_=true;dockColumn(3,panels::Dock::Right);check();docking_=docking;previewPanelOpen_=preview;previewPanel_->setBounds(previewBounds);refresh();
    useFillTool();check();if(!fillConnectivityButton_->hasFlags(ui::HIDDEN) || !fillReferenceButton_->caption.empty() || fillReferenceButton_->icon!="properties")throw std::runtime_error("Legacy fill settings entry");
    useGradientTool();check();if(gradientType_->caption.size() || gradientRadialButton_->hasFlags(ui::HIDDEN) || gradientMode_->hasFlags(ui::HIDDEN))throw std::runtime_error("Legacy gradient controls");
    commands_[1]->Click();
  }
  void smokeAllScrollBars() {
    const auto savedDocument=document;const auto savedDock=docking_;const auto savedBounds=bounds(),savedCanvas=canvas_,savedPreview=previewPanel_->bounds();const auto savedEntries=homeEntries_;
    const bool savedHome=homeOpen_,savedOpen=documentOpen_,savedLayers=layersPanelOpen_;const int savedPreferenceSection=preferenceSection_,savedPreferenceNav=preferenceNavPixels_,savedPreferenceContent=preferenceContentPixels_;const double savedZoom=zoom_;const auto savedPending=pending_;const auto savedError=openError_,savedTitle=errorTitle_;const auto savedModal=modalGeometry_;
    const int savedLayer=layerScroll_,savedFrame=frameScroll_,savedLayerRem=layerScrollRemainder_,savedFrameRem=frameScrollRemainder_,savedTool=toolRowScroll_,savedRail=railScrollPixels_,savedHomePixels=homeScrollPixels_,savedErrorPixels=errorScrollPixels_;
    struct Restore {std::function<void()> run;~Restore(){run();}} restore{[&]{document=savedDocument;docking_=savedDock;homeEntries_=savedEntries;homeOpen_=savedHome;documentOpen_=savedOpen;layersPanelOpen_=savedLayers;zoom_=savedZoom;canvas_=savedCanvas;pending_=savedPending;openError_=savedError;errorTitle_=savedTitle;modalGeometry_=savedModal;layerScroll_=savedLayer;frameScroll_=savedFrame;layerScrollRemainder_=savedLayerRem;frameScrollRemainder_=savedFrameRem;toolRowScroll_=savedTool;railScrollPixels_=savedRail;homeScrollPixels_=savedHomePixels;errorScrollPixels_=savedErrorPixels;preferenceSection_=savedPreferenceSection;preferenceNavPixels_=savedPreferenceNav;preferenceContentPixels_=savedPreferenceContent;setBounds(savedBounds);previewPanel_->setBounds(savedPreview);refresh();}};
    auto check=[](bool okay,const char* message){if(!okay)throw std::runtime_error(message);};
    auto drag=[&](PixelScrollBar* bar,bool vertical,int distance=3){if(!bar || !bar->isVisible())throw std::runtime_error(std::string("Scrollable region has no sheet scrollbar: ")+(bar==timelineHorizontal_?"timeline horizontal":bar==timelineVertical_?"timeline vertical":bar==canvasHorizontal_?"canvas horizontal":bar==canvasVertical_?"canvas vertical":bar==railScrollBar_?"rail":bar==homeScrollBar_?"home":bar==errorScrollBar_?"error":bar==preferenceNavBar_?"preferences categories":"preferences content"));const auto thumb=bar->thumbBounds();auto pointer=thumb.center();ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,pointer);bar->onProcessMessage(&down);check(bar->hasCapture(),"Scrollbar thumb capture failed");pointer+=vertical?gfx::Point(0,distance):gfx::Point(distance,0);ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,pointer);bar->onProcessMessage(&move);ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,pointer);bar->onProcessMessage(&up);check(!bar->hasCapture(),"Scrollbar capture was retained");};
    homeOpen_=false;documentOpen_=layersPanelOpen_=true;pending_=Pending::None;docking_=panels::Model{};setBounds(gfx::Rect(17,23,800,600));document=Document(1,1);
    for(int i=0;i<17;++i)document.addLayer();for(int i=0;i<59;++i)document.addFrame();dockColumn(2,panels::Dock::Floating);auto& group=docking_.groups[docking_.groupOf(2)];group.floating={180,90,230,165};group.floatingArea=floatingArea(uiLogical(clientBounds()));refresh();
    layerScroll_=frameScroll_=layerScrollRemainder_=frameScrollRemainder_=0;layoutLayers();const auto history=document.historySize(),revision=document.revision();const auto oldName=layerRows_[0]->bounds(),oldHeader=frameHeaders_[0]->bounds(),oldCel=frameCells_[0]->bounds();
    drag(timelineHorizontal_,false);check(frameScroll_*12*uiScale+frameScrollRemainder_>0,"Timeline horizontal drag did not move");check(layerRows_[0]->bounds()==oldName && frameHeaders_[0]->bounds().x<oldHeader.x && frameCells_[0]->bounds().x<oldCel.x,"Timeline horizontal scrolling moved fixed names or failed to move headers/cels");
    drag(timelineVertical_,true);check(layerScroll_*12*uiScale+layerScrollRemainder_>0 && layerScrollRemainder_!=0,"Timeline vertical drag snaps to rows");check(frameHeaders_[0]->bounds().y==oldHeader.y && layerRows_[0]->bounds().y<oldName.y,"Timeline vertical scrolling moved frame header or failed to move rows");check(document.historySize()==history && document.revision()==revision,"Timeline scroll changed document history");
    for(auto b:frameCells_)if(b->timelineVisible){const auto visible=b->bounds()&timelineFrameViewport();if(!visible.isEmpty())check(frontWidgetAt(visible.center())==b,"Timeline partially visible cell has wrong input target");}
    docking_=panels::Model{};document=Document(512,512);zoom_=4;canvas_=gfx::Rect(100,100,4096,4096);refresh();constrainCanvas();const auto canvasBefore=canvas_;const auto viewHistory=document.historySize(),viewRevision=document.revision();drag(canvasHorizontal_,false);drag(canvasVertical_,true);check(canvas_.x!=canvasBefore.x && canvas_.y!=canvasBefore.y && document.historySize()==viewHistory && document.revision()==viewRevision,"Canvas scrollbar must pan without changing document");
    useGradientTool();toolRowScroll_=0;layoutToolOptions();check(canvasViewport().y==canvasFullViewport().y,"Tool options reserved an unwanted scrollbar row");commands_[1]->Click();
    setBounds(gfx::Rect(17,23,640,360));refresh();railScrollPixels_=0;layoutToolRail();drag(railScrollBar_,true);check(railScrollPixels_>0,"Small window tool rail scrollbar failed");
    setBounds(gfx::Rect(17,23,800,600));refresh();homeOpen_=true;homeEntries_.clear();for(int i=0;i<24;++i)homeEntries_.push_back({U"滚动回归",{}, {}});homeScrollPixels_=0;layoutHome();drag(homeScrollBar_,true);check(homeScrollPixels_>0 && homeScrollPixels_%(28*uiScale)!=0,"Home list drag still snaps to whole items");homeOpen_=false;
    setBounds(gfx::Rect(17,23,800,600));openError_=U"";for(int i=0;i<80;++i)openError_+=U"较长的错误信息\n";pending_=Pending::OpenError;errorScrollPixels_=0;layoutModal();drag(errorScrollBar_,true);check(errorScrollPixels_>0,"Error text scrollbar failed");
    setBounds(gfx::Rect(17,23,800,360));pending_=Pending::Preferences;preferenceSection_=6;preferenceNavPixels_=preferenceContentPixels_=0;modalGeometry_[Pending::Preferences]=gfx::Rect(10,10,350,150);layoutModal();drag(preferenceNavBar_,true);drag(preferenceContentBar_,true);check(preferenceNavPixels_>0 && preferenceContentPixels_>0,"Preferences sidebar/content overflow was not scrollable");
  }
  void smokePaletteMouse(const std::function<void(ui::Message*)>& dispatch) {
    smokeAllScrollBars();
    {
      const auto savedDocument=document;const auto savedDock=docking_;const auto savedBounds=bounds();const int savedSize=swatchSize_,savedScroll=paletteScrollPixels_;const bool savedPalette=palettePanelOpen_;
      document=Document::withBuiltinPalette();palettePanelOpen_=true;setBounds(gfx::Rect(17,23,800,600));dockColumn(0,panels::Dock::Floating);
      auto& group=docking_.groups[docking_.groupOf(0)];group.floating={240,140,100,150};group.floatingArea=floatingArea(uiLogical(clientBounds()));swatchSize_=4;refresh();
      if(!paletteScrollBar_->isVisible() || paletteScrollBar_->bounds().w!=7*uiScale)throw std::runtime_error("Overflow palette scrollbar missing or incorrect thickness");
      for(auto cell:swatches_)if(cell->isVisible() && cell->bounds().intersects(paletteScrollBar_->bounds()))throw std::runtime_error("Palette cells overlap scrollbar");
      const auto history=document.historySize(),revision=document.revision();const auto bar=paletteScrollBar_->bounds();
      auto send=[&](ui::MessageType type,gfx::Point point){ui::MouseMessage msg(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);paletteScrollBar_->onProcessMessage(&msg);};
      paletteScrollPixels_=0;layoutPalette(0);
      const auto thumb=paletteScrollBar_->thumbBounds();send(ui::kMouseDownMessage,thumb.center());if(!paletteScrollBar_->hasCapture())throw std::runtime_error("Scrollbar thumb failed to capture");
      send(ui::kMouseMoveMessage,thumb.center()+gfx::Point(0,1));
      if(paletteScrollPixels_<=0 || paletteScrollPixels_%paletteScrollBar_->wheelStep==0)throw std::runtime_error("Scrollbar drag still snaps to color rows");
      const auto clipped=swatches_.front()->bounds() & paletteViewportBounds();
      if(!clipped.isEmpty() && paletteSlotAt(clipped.center())!=0)throw std::runtime_error("Partial color cell hit mismatch");
      send(ui::kMouseMoveMessage,{thumb.center().x,bar.y2()+40});send(ui::kMouseUpMessage,{thumb.center().x,bar.y2()+40});
      if(paletteScrollPixels_<=0 || paletteScrollBar_->hasCapture())throw std::runtime_error("Scrollbar drag failed to scroll/release");
      const int before=paletteScrollPixels_;ui::MouseMessage wheel(ui::kMouseWheelMessage,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyNoneModifier,paletteScrollBar_->bounds().center(),gfx::Point(0,1));paletteScrollBar_->onProcessMessage(&wheel);
      if(paletteScrollPixels_!=before-paletteScrollBar_->wheelStep || document.historySize()!=history || document.revision()!=revision)throw std::runtime_error("Scrollbar wheel/history mismatch");
      ui::MouseMessage enter(ui::kMouseEnterMessage,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyNoneModifier,paletteScrollBar_->thumbBounds().center());paletteScrollBar_->onProcessMessage(&enter);
      auto image=os::instance()->makeRgbaSurface(bar.w,bar.h);image->clear();{ui::Graphics g(image);ui::PaintEvent ev(paletteScrollBar_,&g);paletteScrollBar_->onPaint(ev);}
      const auto hovered=paletteScrollBar_->thumbBounds().center()-bar.origin();if(image->getPixel(hovered.x,hovered.y)!=gfx::rgba(0x63,0x73,0x8f))throw std::runtime_error("Scrollbar hover did not use sheet material");
      writeSmokeFrame(image.get(),assets_.parent_path()/"palette-scrollbar-smoke.bmp");
      swatchSize_=0;group.floating={240,140,180,220};refresh();if(paletteScrollBar_->isVisible() || paletteScrollPixels_!=0)throw std::runtime_error("Scrollbar did not disappear when contents fit");
      document=savedDocument;docking_=savedDock;palettePanelOpen_=savedPalette;swatchSize_=savedSize;paletteScrollPixels_=savedScroll;setBounds(savedBounds);refresh();
    }
    {
      const auto saved=document;document=Document::withBuiltinPalette();refresh();
      const auto order=document.palette().order();
      ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,swatches_[0]->paletteColorBounds().center());
      beginPalettePointer(0,down);const int col=paletteColumns_;const std::size_t end=std::min(std::size_t(col+1),order.size()-1);
      updatePalettePointer(swatches_[end]->paletteColorBounds().center());finishPalettePointer();
      if(document.palette().selected.size()!=4)throw std::runtime_error("Palette rectangular pointer selection");
      document.clearPaletteSelection();refresh();beginPalettePointer(0,down);
      const auto last=swatches_.back()->paletteColorBounds();updatePalettePointer({paletteSelectionBorder_.x2(),last.y2()+80*uiScale});
      updatePalettePointer({swatches_[paletteColumns_-1]->paletteColorBounds().x2()-uiScale,last.y2()+80*uiScale});finishPalettePointer();
      if(document.palette().selected.size()!=order.size())throw std::runtime_error("Palette drag into blank space omitted last columns");
      const int previousSize=swatchSize_;
      for(int size=0;size<5;++size){
        chooseSwatchSize(size,false);const auto cells=document.palette().order();document.selectPaletteBox(0,paletteColumns_+1,paletteColumns_);refresh();
        if(!paletteSelectionOverlay_->isVisible())throw std::runtime_error("Shared palette outline hidden");
        for(auto cell:swatches_)if(cell->active && (!cell->paletteSharedSelection || cell->bounds()!=cell->paletteColorBounds()))throw std::runtime_error("Palette still has individual selection materials");
        const auto box=paletteSelectionOverlay_->bounds();auto mask=os::instance()->makeRgbaSurface(bounds().x2(),bounds().y2());mask->clear();
        {ui::Graphics g(nullptr,mask,box.x,box.y);g.clipRect(paletteSelectionOverlay_->clientBounds());ui::PaintEvent ev(paletteSelectionOverlay_,&g);paletteSelectionOverlay_->onPaint(ev);}
        int hits=0;{os::SurfaceLock lock(mask.get());for(int y=box.y;y<box.y2();++y)for(int x=box.x;x<box.x2();++x){const gfx::Point point(x,y);const bool hit=paletteOutlineContains(point);if(hit!=(gfx::geta(mask->getPixel(x,y))!=0))throw std::runtime_error("Shared palette outline alpha/hit mismatch");hits+=hit;}}
        if(!hits)throw std::runtime_error("Shared palette outline has no painted border");
        const auto seam=swatches_[1]->bounds().origin()+gfx::Point(0,swatches_[1]->bounds().h/2);
        if(paletteOutlineContains(seam))throw std::runtime_error("Internal palette seam triggers selection hover");
        if(frontWidgetAt(seam)==paletteSelectionOverlay_)throw std::runtime_error("Shared outline intercepts its transparent center");
        document.selectPaletteBox(0,(int(cells.size())/paletteColumns_+1)*paletteColumns_+paletteColumns_-1,paletteColumns_);refresh();
        const auto perimeter=paletteSelectionOverlay_->bounds();auto contour=os::instance()->makeRgbaSurface(bounds().x2(),bounds().y2());contour->clear();
        {ui::Graphics g(nullptr,contour,perimeter.x,perimeter.y);g.clipRect(paletteSelectionOverlay_->clientBounds());ui::PaintEvent ev(paletteSelectionOverlay_,&g);paletteSelectionOverlay_->onPaint(ev);}
        {os::SurfaceLock lock(contour.get());for(int y=perimeter.y;y<perimeter.y2();++y)for(int x=perimeter.x;x<perimeter.x2();++x)if(paletteOutlineContains({x,y})!=(gfx::geta(contour->getPixel(x,y))!=0))throw std::runtime_error("Stepped palette contour alpha/hit mismatch");}
        if(size==1)writeSmokeFrame(contour.get(),assets_.parent_path()/"palette-concave-outline.bmp");
        const int tail=int(cells.size())%paletteColumns_;
        if(tail && tail<paletteColumns_){
          const auto origin=swatches_.front()->paletteColorBounds().origin();const int pitch=(swatchPixels_[size]/uiScale-1)*uiScale;
          const auto corner=origin+gfx::Point(tail*pitch,int(cells.size())/paletteColumns_*pitch);
          // There must be no spur extending into the three selected quadrants.
          if(paletteOutlineContains(corner-gfx::Point(2*uiScale,2*uiScale)))throw std::runtime_error("Concave selection spur inside selected colors");
        }
        const int remainder=int(cells.size())%paletteColumns_;
        if(remainder && remainder<paletteColumns_-1){const auto empty=swatches_.front()->paletteColorBounds().origin()+gfx::Point((paletteColumns_-1)*(swatchPixels_[size]/uiScale-1)*uiScale,int(cells.size())/paletteColumns_*(swatchPixels_[size]/uiScale-1)*uiScale);if(paletteOutlineContains(empty+gfx::Point(swatchPixels_[size]/2,swatchPixels_[size]/2)))throw std::runtime_error("Palette contour enclosed empty last-row cells");}
        // Overlay uses the same material for normal/hover and must remain the top painted child.
        auto widgets=children();if(std::find(widgets.begin(),widgets.end(),paletteSelectionOverlay_)<std::find(widgets.begin(),widgets.end(),swatches_[1]))throw std::runtime_error("Shared palette outline is below colors");
      }
      chooseSwatchSize(previousSize,false);

      ui::MouseMessage right(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonRight,ui::kKeyNoneModifier,swatches_[4]->paletteColorBounds().center());
      document.clearPaletteSelection();refresh();beginPalettePointer(4,right);updatePalettePointer(swatches_[5]->paletteColorBounds().center());finishPalettePointer();
      if(document.palette().secondaryId!=order[5] || document.palette().selected!=std::vector<int>{order[5]})throw std::runtime_error("Palette secondary drag sampling");
      document.selectPalette(order[0]);refresh();beginPalettePointer(0,down);updatePalettePointer(swatches_[1]->paletteColorBounds().center());finishPalettePointer(true);
      if(document.palette().slots[0]!=order[0])throw std::runtime_error("Palette canceled gesture edits slots");
      document=saved;document.clearPaletteSelection();paletteFocusedSlot_.reset();paletteFocused_=false;refresh();
    }
    smokeToolPropertyLayout();
    {
      PixelDropdown dropdown(font_,skin_);int changes=0;
      dropdown.changed=[&](int){++changes;};dropdown.setOptions({U"One",U"Two",U"Three"});
      if(dropdown.selectedIndex()!=0 || changes)throw std::runtime_error("Dropdown initial selection");
      ui::KeyMessage up(ui::kKeyDownMessage,ui::kKeyUp,ui::kKeyNoneModifier,0,0);
      dropdown.onProcessMessage(&up);
      if(dropdown.selectedIndex()!=2 || changes!=1 || dropdown.caption!=U"Three")throw std::runtime_error("Dropdown keyboard wrap");
      dropdown.setEnabled(false);dropdown.onProcessMessage(&up);
      if(dropdown.selectedIndex()!=2 || changes!=1)throw std::runtime_error("Disabled dropdown changed");
      dropdown.setOptions({});dropdown.showOptions();if(dropdown.selectedIndex()!=-1 || !dropdown.caption.empty())throw std::runtime_error("Empty dropdown selection");
    }
    {
      auto dropdown=dynamic_cast<PixelDropdown*>(selectionAlgorithmButton_);
      if(!dropdown || propertyDropdowns_.size()!=3 || dynamic_cast<PixelDropdown*>(brushShapeButton_) || toolControls_[0].second!=15)throw std::runtime_error("Legacy property component types");
      for(auto button:{wandConnectivityButton_,fillConnectivityButton_,gradientConnectivity_,wandReferenceButton_,fillReferenceButton_,gradientReference_,gradientType_,gradientMode_,fillTextureButton_,shapeModeButton_})
        if(dynamic_cast<PixelDropdown*>(button))throw std::runtime_error("Non-select legacy property converted to dropdown");
      const bool original=selectionRotSprite_;
      dropdown->setSelectedIndex(original?0:1,true);
      if(selectionRotSprite_!=(dropdown->selectedIndex()!=0))throw std::runtime_error("Property dropdown value binding");
      selectionRotSprite_=original;layoutToolOptions();
      if(dropdown->selectedIndex()!=int(original))throw std::runtime_error("Property dropdown refresh binding");
      for(auto control:propertyDropdowns_)if(control->parent()!=this)throw std::runtime_error("Property dropdown ownership");
    }
    {
      auto dropdown=static_cast<PixelDropdown*>(eyedropperSourceButton_);
      const auto previousBounds=dropdown->bounds();const bool wasHidden=dropdown->hasFlags(ui::HIDDEN);dropdown->setVisible(true);dropdown->setBounds(uiPhysical(gfx::Rect(0,0,90,16)));
      auto paint=[&]{auto surface=os::instance()->makeRgbaSurface(dropdown->bounds().w,dropdown->bounds().h);surface->clear();{ui::Graphics g(surface);ui::PaintEvent ev(dropdown,&g);dropdown->onPaint(ev);}std::vector<gfx::Color> pixels;for(int y=0;y<surface->height();++y)for(int x=0;x<surface->width();++x)pixels.push_back(surface->getPixel(x,y));return pixels;};
      auto move=[&](gfx::Point point){ui::MouseMessage msg(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyNoneModifier,point);dropdown->onProcessMessage(&msg);};
      const auto box=dropdown->bounds();dropdown->requestFocus();
      move({box.x+10*uiScale,box.y+box.h/2});const auto normal=paint();
      move({box.x2()-7*uiScale,box.y+box.h/2});const auto hot=paint();
      if(normal==hot)throw std::runtime_error("Dropdown arrow lost button hover state");
      move({box.x+uiScale,box.y+box.h/2});const auto border=paint();
      if(normal!=border)throw std::runtime_error("Dropdown retained removed selection effect");
      move({box.x+10*uiScale,box.y+box.h/2});if(paint()!=normal)throw std::runtime_error("Dropdown interior incorrectly hovers selection");
      dropdown->setBounds(previousBounds);dropdown->setVisible(!wasHidden);requestFocus();
    }
    if(!recentColors_.values().empty())throw std::runtime_error("New project loaded old recent colors");
    const auto title=panelTabs_[0]->bounds();
    if(paletteActions_->bounds().y-(title.y+(font_.inkBounds(panelTabs_[0]->caption).y+Layout::labelInkHeight)*uiScale)!=uiGap*uiScale)throw std::runtime_error("Palette title/button gap");
    smokeModalBackground();
    {
      const auto saved=document;document.markSaved();refresh();fitCanvas();
      const auto cleanClose=documentTabClose_->bounds(),cleanNew=documentTabNew_->bounds();
      const auto point=canvas_.center();ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);
      onProcessMessage(&down);
      if(!document.active() || !document.dirty() || documentTabClose_->bounds().x!=cleanClose.x+(3+uiGap)*uiScale || documentTabNew_->bounds().x!=cleanNew.x+(3+uiGap)*uiScale)
        throw std::runtime_error("First stroke did not synchronously lay out dirty tab controls");
      if(recentColors_.values().empty())throw std::runtime_error("Painting did not populate recent colors");
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
          if(item->isEnabled()!=(index==0 || (index>=2 && index<=5)))throw std::runtime_error("Unmigrated column action enabled");
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
    if(floatingDragging_ && transformHandle_.empty())return selectionCopyDrag_?"copy":"move";
    if(selectionBoxDragging_)return "selection-move";
    if(selectionDragging_ && selectionKind_!=5)return "none";
    if(selectionDragging_ && selectionKind_==5)return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);
    if(!floatingDragging_ && !selectionShift_ && !selectionCtrl_ && selectionPivotHit(position))return "default";
    const auto hit=selectionShift_ && !floatingDragging_?std::string{}:transformHandle_.empty()?transformHit(position):transformHandle_;
    if(!hit.empty())if(auto target=selectionTransformTarget())return selectionTransformCursor(hit,*target,position);
    const int inside=selectionHit(position);
    if(!selectionShift_ && (inside==1 || (inside==2 && (selectionMode_<2 || selectionCtrl_))))
      return selectionCtrl_?"copy":inside==1?"selection-move":"move";
    if(selectionTool_ && selectionKind_==5) {
      const auto p=canvasPoint(position);
      if(p.x>=0 && p.y>=0 && p.x<document.width() && p.y<document.height() && (document.layer().locked || !document.layer().visible))return "unavailable";
      return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);
    }
    const auto p=canvasPoint(position);
    const bool insideCanvas=p.x>=0 && p.y>=0 && p.x<document.width() && p.y<document.height();
    if(insideCanvas && (document.layer().locked || !document.layer().visible))return "unavailable";
    return "none";
  }
  const char* cursorAt(gfx::Point position) const {
    if(loopTrackDrag_ || loopTrackHit(position).edge)return "ew-resize";
    if(panelGesture_.id>=0){const int edges=panelGesture_.edges;return edges?panelResizeHitCursor(edges):"move";}
    if(pending_==Pending::None)for(auto close:columnClose_)if(close && close->isVisible() && close->bounds().contains(position))return "default";
    if(const auto resize=panelResizeAt(position);resize.edges)return panelResizeHitCursor(resize.edges);
    if(docking_.custom && pending_==Pending::None){const int id=topFloatingColumnAt(position);if(id>=0){auto r=columnGeometry(uiLogical(bounds())).panel[id];const auto box=uiPhysical(gfx::Rect(r.x,r.y,r.w,r.h)).offset(bounds().origin());return position.y<box.y+16*uiScale?"move":"default";}}
    if(docking_.custom && pending_==Pending::None){const auto geometry=columnGeometry(uiLogical(clientBounds()));for(int id=0;id<4;++id)if(geometry.shown[id]){const auto r=geometry.panel[id];const auto box=toDisplay(gfx::Rect(r.x,r.y,r.w,r.h));if(box.contains(position) && position.y<box.y+16*uiScale)return "move";}}

    // Captured canvas gestures own the pointer across all sibling UI regions.
    // This is the native equivalent of legacy canvas pointer capture.
    if(zoomDragging_)return "zoom";
    if(pan_.active)return "grabbing";
    if(symmetryDragging_)return "move";
    if(eyedropperGesture_.active())return "eyedropper";
    if(selectionDragging_ || floatingDragging_ || selectionPivotDragging_)return selectionCursorAt(position);
    if(modifierBrushSize_)return modifierBrushSize_->pressed?"ew-resize":legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);
    if(shapeDragging_ || gradientDragging_)return "crosshair";
    if(pending_==Pending::None && (fillDragging_ || (document.active() && !document.floating())))return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);
    if(homeButton_ && homeButton_->isEnabled() && homeButton_->bounds().contains(position))return "progress";
    if(homeOpen_)return "default";
    if(!documentOpen_)return "default";
    if(pending_==Pending::None && sizeDrag_==SizeDrag::None && previewPanel_ && previewPanel_->isVisible() && (previewPanel_->hasCapture() || previewPanel_->bounds().contains(position)))return previewPanel_->cursorAt(position);
    const auto handle=sizeDrag_==SizeDrag::None?sizeHandleAt(position):sizeDrag_;
    if(handle==SizeDrag::Modal)return panelResizeCursor(sizeDrag_==SizeDrag::None?panelResizeEdges(dialogDisplayBounds(),position):sizeDragEdges_);
    if(handle==SizeDrag::ModalMove)return "move";
    if(handle==SizeDrag::DockWidth)return "ew-resize";
    if(handle==SizeDrag::ColorSplit || handle==SizeDrag::Timeline)return "ns-resize";
    if(replaceSampling_>=0 && canvasViewport().contains(position))return "eyedropper";if(pending_!=Pending::None) return "default";
    if(pan_.active) return "grabbing";
    // A captured drawing gesture owns the cursor for its entire lifetime.
    // Resolve this before hover-only symmetry/axis and sampling checks, which
    // otherwise caused a one-frame cursor jump when the pointer crossed an
    // axis or left the canvas.
    if(modifierBrushSize_)return modifierBrushSize_->pressed?"ew-resize":legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);
    if(shapeDragging_ || gradientDragging_)return "crosshair";
    if(fillDragging_)return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);
    if(symmetryDragging_ || (!document.active() && !spaceHeld_ && !handTool_ && !zoomTool_ && !eyedropperTool_ && !eyedropperHeld_ && symmetryHit(position)))return "move";
    if(eyedropperGesture_.active() || ((eyedropperTool_ || eyedropperHeld_) && canvasViewport().contains(position) && !document.active() && !spaceHeld_))return "eyedropper";
    // Selection and transform captures keep their semantic cursor even when
    // the pointer briefly leaves the canvas, matching the legacy pointer
    // capture path.
    if((selectionDragging_ || floatingDragging_ || selectionPivotDragging_) && (selectionTool_ || document.floating()))
      return selectionCursorAt(position);
    if(!canvasViewport().contains(position)) return "default";
    if(!document.active() && (spaceHeld_ || handTool_)) return "grab";
    if(zoomTool_ && !spaceHeld_ && !eyedropperHeld_)return "zoom";
    if(selectionTool_ && !selectionShift_ && !selectionCtrl_ && selectionPivotHit(position))return "default";
    if(selectionTool_ || document.floating())return selectionCursorAt(position);
    const auto point=canvasPoint(position);
    const bool inDocument=point.x>=0 && point.y>=0 && point.x<document.width() && point.y<document.height();
    if(inDocument && (document.layer().locked || !document.layer().visible))return "unavailable";
    // Current cursor color feedback follows the active ordinary layer; legacy's
    // composited replacement sample resolves to ink or the exposed checker.
    if(eraser_ && inDocument) {
      const auto color=skin_[(point.x/4+point.y/4)%2?"checkerA":"checkerB"];
      return legacyPaintCursor(gfx::getr(color),gfx::getg(color),gfx::getb(color));
    }
    if(shapeTool_ || gradientTool_ || fillTool_) {
      if(inDocument && (document.layer().locked || !document.layer().visible))return "unavailable";
      if(shapeTool_ || gradientTool_)return "crosshair";
      return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);
    }
    return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);
  }
  bool panelHasCapture() const {return hasCapture() || (previewPanel_ && previewPanel_->hasCapture());}
  void flushPanelGeometry() {
    flushDockPointer();
    if(previewPanel_)previewPanel_->flushGeometry();
    flushSizeGeometry();
  }
  ~Editor() override {cancelGradientMapJob();stopAntiAlias();stopConvolution();if(propertyRangePopup_){propertyRangePopup_->closeWindow(nullptr);propertyRangePopup_.reset();}celNavigationTimer_.stop();if(toolFlyout_){toolFlyout_->closeWindow(nullptr);toolFlyout_.reset();}antsTimer_.stop();sizeTimer_.stop();if(recoveryTimer_){recoveryTimer_->stop();delete recoveryTimer_;}if(recoveryWorker_.valid())recoveryWorker_.wait();}
  Editor(const PixelFont& font,Skin& skin,std::filesystem::path assets,std::function<void()> refreshCursor,std::filesystem::path recoveryRoot={})
    : ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),assets_(std::move(assets)),refreshCursor_(std::move(refreshCursor)) {
    recoveryDirectory_=std::move(recoveryRoot);
    setFocusStop(true); setExpansive(true);
    loopTrackTimer_.Tick.connect([this]{if(loopTrackDrag_){if(!hasCapture())finishLoopTrackResize(true);else updateLoopTrackResize(loopTrackDrag_->pointer,true);}});
    timelineScrollTimer_.Tick.connect([this]{if(timelineGesture_.kind){if(!hasCapture())finishTimelineGesture(true);else updateTimelineGesture(timelineGesture_.pointer,timelineGesture_.copy,true);}});
    antsTimer_.Tick.connect([this]{
      if(!showSelectionOutline_ || !document.selection() || !documentOpen_ || homeOpen_ || !isVisible()){antsTimer_.stop();return;}
      antsOffset_=(antsOffset_+1)&7;
      const auto& s=*document.selection();const double scale=canvasScale();
      auto dirty=gfx::Rect(int(std::floor(canvas_.x+s.x*scale))-2,int(std::floor(canvas_.y+s.y*scale))-2,
        int(std::ceil(s.width*scale))+5,int(std::ceil(s.height*scale))+5);
      dirty&=canvasViewport();invalidateRect(dirty);
    });
    celNavigationTimer_.Tick.connect([this]{celNavigationTick(std::chrono::steady_clock::now());});
    auto scroll=[this](bool vertical){auto bar=new DialogBackground<PixelScrollBar>(skin_,vertical);configureDialogBackground(bar);addChild(bar);return bar;};
    railScrollBar_=scroll(true);railScrollBar_->changed=[this](int value){railScrollPixels_=value;layoutToolRail();invalidate();};
    timelineHorizontal_=scroll(false);timelineVertical_=scroll(true);canvasHorizontal_=scroll(false);canvasVertical_=scroll(true);homeScrollBar_=scroll(true);errorScrollBar_=scroll(true);preferenceNavBar_=scroll(true);preferenceContentBar_=scroll(true);
    preferenceNavBar_->changed=[this](int value){preferenceNavPixels_=value;layoutModal();invalidateRect(dialogDisplayBounds());};
    preferenceContentBar_->changed=[this](int value){preferenceContentPixels_=value;layoutModal();invalidateRect(dialogDisplayBounds());};
    timelineHorizontal_->changed=[this](int value){frameScroll_=value/(12*uiScale);frameScrollRemainder_=value%(12*uiScale);layoutLayers();invalidateTimelineGrid();};
    timelineVertical_->changed=[this](int value){layerScroll_=value/(12*uiScale);layerScrollRemainder_=value%(12*uiScale);layoutLayers();invalidateTimelineGrid();};
    homeScrollBar_->changed=[this](int value){homeScrollPixels_=value;layoutHome();invalidate();};
    errorScrollBar_->changed=[this](int value){errorScrollPixels_=value;modalErrorScroll_=value/(12*uiScale);layoutModal();invalidateRect(dialogDisplayBounds());};
    canvasHorizontal_->changed=[this](int value){const auto v=canvasViewport();const int upper=clampCanvasAxis(INT_MAX,v.x,v.w,canvas_.w);canvas_.x=upper-value;constrainCanvas();invalidateRect(canvasViewport());};
    canvasVertical_->changed=[this](int value){const auto v=canvasViewport();const int upper=clampCanvasAxis(INT_MAX,v.y,v.h,canvas_.h);canvas_.y=upper-value;constrainCanvas();invalidateRect(canvasViewport());};
    paletteScrollBar_=scroll(true);paletteScrollBar_->changed=[this](int value){paletteScrollPixels_=value;layoutPalette(0);invalidateRect(paletteContentBounds());};
    paletteSelectionOverlay_=new FloatingColumnSurface;paletteSelectionOverlay_->setTransparent(true);addChild(paletteSelectionOverlay_);
    paletteSelectionOverlay_->paint=[this](ui::Graphics& g){UiPaintScale scale(g);const auto offset=-paletteSelectionOverlay_->bounds().origin();const bool hover=paletteMousePosition_ && paletteOutlineContains(*paletteMousePosition_);for(auto edge:paletteSelectionEdges_){edge.border.offset(offset);for(auto piece:edge.pieces){piece.offset(offset);g.saveClip();g.clipRect(uiLogical(piece));skin_.drawSelectionBorder(g,edge.border,hover);g.restoreClip();}}};
    paletteSelectionOverlay_->pointer=[this](ui::Message* msg){if(pending_!=Pending::None)return false;if(msg->type()==ui::kMouseDownMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);beginPalettePointer(std::min(paletteSlotAt(mouse->position()),paletteButtonIds_.size()-1),*mouse);return true;}return false;};
    recoveryTimer_=new ui::Timer(16,this);recoveryTimer_->Tick.connect([this]{if(paletteGesture_ && !paletteGesture_->active && !paletteGesture_->moving && !paletteGesture_->secondary && std::chrono::steady_clock::now()-paletteGesture_->began>=std::chrono::milliseconds(360))updatePalettePointer(paletteGesture_->origin);playbackTick();recoveryTick();convolutionTick();antiAliasTick();gradientMapTick();wandTick();gradientTick();shapeTick();});recoveryTimer_->start();
    commands_.push_back(button(U"新建",[this]{ask(Pending::New);}));
    documentTabNew_=button(U"",[this]{ask(Pending::New);});documentTabNew_->iconSkin=&toolIcons_;documentTabNew_->icon="plus";documentTabNew_->tabAdd=true;
    documentTabClose_=button(U"",[this]{ask(Pending::CloseDocument);});documentTabClose_->iconSkin=&toolIcons_;documentTabClose_->icon="close";documentTabClose_->bareTabIcon=true;
    commands_.push_back(button(U"画笔",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;cancelStroke();selectionTool_=false;shapeTool_=false;eyedropperTool_=false;zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=false;eraser_=false;updateNavigationCursor();refresh();}));
    commands_.push_back(button(U"橡皮",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;cancelStroke();selectionTool_=false;shapeTool_=false;eyedropperTool_=false;zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=false;eraser_=true;updateNavigationCursor();refresh();}));
    commands_.push_back(button(U"撤销",[this]{cancelStroke();document.undo();refresh();}));
    commands_.push_back(button(U"重做",[this]{cancelStroke();document.redo();refresh();}));
    commands_.push_back(button(U"手",[this]{if(shapeDragging_ || gradientPending_ || gradientDragging_)return;cancelStroke();shapeTool_=false;eyedropperTool_=false;zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=true;updateNavigationCursor();refresh();}));
    createToolRail();
    loadPaletteSize();
    try{const auto path=palettePreferencePath().parent_path()/"animation-playback.txt";if(std::filesystem::exists(path)){std::ifstream in(path);readPlaybackPreferences(in);}}catch(const std::exception& e){playbackRate_=1;playbackReturnToStart_=false;savedPlaybackMode_.reset();status_=U"播放偏好读取失败："+unicodeText(e.what());}
    try{const auto path=palettePreferencePath().parent_path()/"onion-skin.txt";if(std::filesystem::exists(path)){std::ifstream in(path);if(!(in>>onion_.enabled>>onion_.allLayers>>onion_.showDuringPlayback>>onion_.previousFrames>>onion_.nextFrames>>onion_.previousOpacity>>onion_.nextOpacity>>onion_.previousColor>>onion_.nextColor))throw std::runtime_error("Invalid onion skin preferences");onion_.previousFrames=std::clamp(onion_.previousFrames,0,8);onion_.nextFrames=std::clamp(onion_.nextFrames,0,8);onion_.previousOpacity=std::clamp(onion_.previousOpacity,0,100);onion_.nextOpacity=std::clamp(onion_.nextOpacity,0,100);}}catch(const std::exception& e){onion_={};status_=U"洋葱皮偏好读取失败："+unicodeText(e.what());}
    // Recent colors belong to this project session; do not import prior runs.
    for(const auto icon:{"restore","moreLines","paletteLocal","extractColors","properties","lock","unlock","undo","redo","dither","image","checkboxUnchecked","more","brush-round","brush-square","brush-line","ink-simple","pressure-dynamics","symmetry-horizontal","symmetry-vertical","symmetry-diagonal-up","symmetry-diagonal-down","symmetry-rotational","close","plus","eye","eyeOff","delete","playback-first","playback-previous","playback-play","playback-pause","playback-next","playback-last","right","check","copy","link","onion","animation-auto-link-off","animation-auto-link-on","newFolder","gradientMap","tilemap","freeTile","linkedLayer","convertTo","mergeDown","mergeVisible","clippingMask","layerMask","layerStyle","paste","clearRecords","info","swap","move","home","folderOpen","save","selection-pivot","gradient-linear","gradient-radial","gradient-stop"}) for(const auto suffix:{"","-disabled"}) {
      const auto name=std::string(icon)+suffix;const auto atlas=skin_.assets.patches.find("icon."+name);toolIcons_.assets.patches[name]=atlas==skin_.assets.patches.end()?importSkinPng(assets_/"utility-icons"/(name+".png"),32):atlas->second;
    }
    for(const auto icon:{"selection-replace","selection-add","selection-subtract","selection-intersect","selection-shrink","selection-pivot-preset-0","selection-pivot-preset-1","selection-pivot-preset-2","selection-pivot-preset-3","selection-pivot-preset-4","selection-pivot-preset-5","selection-pivot-preset-6","selection-pivot-preset-7","selection-pivot-preset-8"})for(const auto suffix:{"","-disabled"}){const auto name=std::string(icon)+suffix;toolIcons_.assets.patches[name]=importSkinPng(assets_/"utility-icons"/(name+".png"),32);}
    for(const auto icon:{"playback-first","playback-previous","playback-play","playback-next","playback-last","onion","plus","delete","plus","newFolder","lock","link"}){const auto index=timelineInactive_.size();auto b=button(U"",[this,index]{switch(index){case 0:toolbarSelectFrame(0);break;case 1:toolbarStepFrame(-1);break;case 2:togglePlayback();break;case 3:toolbarStepFrame(1);break;case 4:toolbarSelectFrame(document.timeline().state().frames.size()-1);break;case 5:toggleOnion();break;case 6:frameAction(1);break;case 7:deleteTimelineItems();break;case 8:createLayer();break;}});b->iconSkin=&toolIcons_;b->icon=icon;b->skinStyle=index<10?"icon_button":"timeline-row";if(index<10){b->iconGroupIndex=int(index<5?index:index<8?index-5:index-8);b->iconGroupCount=index<5?5:3;}timelineInactive_.push_back(b);if(index==5)b->context=[this]{showOnionMenu();};if(index==2)b->context=[this]{showPlaybackMenu();};}
    layerEye_=button(U"",[this]{const auto& layer=document.timeline().state().layers.front();document.beginVisibilityGesture();document.previewVisibilityGesture(layer.id,!layer.visible);document.commitVisibilityGesture();refresh();});layerEye_->iconSkin=&toolIcons_;layerEye_->skinStyle="timeline-row";
    layerRow_=button(document.layer().name,[]{});
    layerRow_->skinStyle="timeline-row";
    layerRow_->doubleClick=[this]{showLayerOpacity();};
    layerProperties_=button(U"",[this]{openSelectedLayerProperties();});layerProperties_->iconSkin=&toolIcons_;layerProperties_->icon="properties";layerProperties_->skinStyle="icon_button";layerProperties_->iconGroupIndex=2;layerProperties_->iconGroupCount=3;
    layerHeaderOpacity_=new PixelSlider(font_,skin_);addChild(layerHeaderOpacity_);
    layerHeaderOpacity_->interactionBegin=[this]{document.beginLayerOpacity();};
    layerHeaderOpacity_->changed=[this](int value){document.previewLayerOpacity(value/100.0);invalidate();};
    layerHeaderOpacity_->interactionCommit=[this]{document.commitLayerOpacity();refresh();};
    layerHeaderOpacity_->interactionCancel=[this]{document.cancelLayerOpacity();refresh();};
    createToolOptions();createGradientOptions();connectLegacyPropertyRanges();createShapeOptions();createEyedropperOptions();
    try{std::ifstream in(palettePreferencePath().parent_path()/"symmetry.txt");if(in){for(int i=0;i<5;++i)in>>symmetryFlag(i);in>>symmetryLocked_>>symmetryThickness_>>symmetryColor_;symmetryThickness_=std::clamp(symmetryThickness_,1,8);persistedSymmetryAxes_=document.symmetryAxes;symmetryInitialized_=symmetryHas(document.symmetryAxes);}}catch(const std::exception& e){status_=U"对称偏好读取失败："+unicodeText(e.what());}createFillPatternOptions();migratePropertyDropdowns();
    paletteActions_=button(U"",[this]{showPaletteActions();});
    paletteActions_->iconSkin=&toolIcons_;paletteActions_->icon="properties";
    paletteActions_->iconGroupCount=2;paletteActions_->iconGroupIndex=1;
    paletteLibrary_=button(U"",[]{});paletteLibrary_->iconSkin=&toolIcons_;paletteLibrary_->icon="paletteLocal";
    paletteLibrary_->iconGroupCount=2;paletteLibrary_->iconGroupIndex=0;paletteLibrary_->setEnabled(false);
    paletteLibrary_->hover=[this]{status_=U"选择本地色板：尚未迁移";invalidate();};
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
    createGradientMapControls();createAntiAliasControls();createConvolutionControls();createPreferencesControls();createReplaceControls();createResizeControls();createStaticExportControls();createSpriteSheetControls();createGifExportControls();createExportFormatControl();createSheetImportControls();
    paletteInput_=new PixelEntry(font_,skin_);addChild(paletteInput_);paletteInput_->setVisible(false);
    for(auto& input:loopInputs_){input=new PixelEntry(font_,skin_);input->numeric=&input!=&loopInputs_[0];addChild(input);input->setVisible(false);input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}
    auto loopDropdown=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(loopDropdown);addChild(loopDropdown);loopDirection_=loopDropdown;
    loopDropdown->setOptions({U"\u6b63\u5411",U"\u53cd\u5411",U"\u6b63\u5411\u5f80\u8fd4",U"\u53cd\u5411\u5f80\u8fd4"});
    loopDropdown->changed=[this](int index){if(!loopDraft_)return;const char* directions[]{"forward","reverse","ping-pong","ping-pong-reverse"};loopDraft_->direction=directions[index];updateLoopDirection();invalidate();};loopDirection_->setVisible(false);
    paletteInput_->accept=[this]{resolve(pending_==Pending::BrushFolderName || pending_==Pending::PaletteName || pending_==Pending::PaletteExtract || pending_==Pending::LayerOpacity);};
    paletteInput_->Change.connect([this]{if(pending_==Pending::LayerOpacity){document.previewLayerName(unicodeText(paletteInput_->text()));refresh();}if(pending_==Pending::OnionValue)previewOnionValue();if(pending_==Pending::FrameDuration){try{std::size_t used=0;const int value=std::stoi(paletteInput_->text(),&used);if(used==paletteInput_->text().size())document.previewFrameDuration(value);}catch(const std::exception&){} }});
    paletteInput_->cancel=[this]{resolve(false);};
    paletteInput_->blur=[this]{if(pending_==Pending::ColorRole) commitPaletteHex();};
    panelTabs_.push_back(button(U"颜色板",[this]{cancelStroke();refresh();}));
    panelTabs_[0]->context=[this]{showColumnContextMenu(Column::Palette);};
    dockingTabs_[0]=panelTabs_[0];const char32_t* dockNames[]{U"颜色板",U"调色盘",U"图层",U"预览"};
    for(int id=1;id<4;++id)dockingTabs_[id]=button(dockNames[id],[this,id]{docking_.select(id);refresh();saveWorkspaceSizes();});
    for(int id=0;id<4;++id){dockingTabs_[id]->timelinePress=[this,id](const ui::MouseMessage& m){beginPanelGesture(id,m);};dockingTabs_[id]->context=[this,id]{showColumnContextMenu(Column(id));};}
    const char* closeCommands[]{"togglePalettePanel","toggleColorPanel","toggleLayersPanel"};
    for(int id=0;id<3;++id){columnClose_[id]=button(U"",[this,command=std::string(closeCommands[id])]{cancelStroke();menuCommands_.invoke(command);saveWorkspaceSizes();});columnClose_[id]->iconSkin=&toolIcons_;columnClose_[id]->icon="close";columnClose_[id]->skinStyle="icon_button";columnClose_[id]->setVisible(false);}
    panelDockTimer_.Tick.connect([this]{tickPanelGesture();});
    modalSurface_=new FloatingColumnSurface;addChild(modalSurface_);
    modalSurface_->paint=[this](ui::Graphics& child){const auto clip=child.getClipBounds().offset(modalSurface_->bounds().origin()-bounds().origin());ui::Graphics g(child.display(),base::AddRef(child.getInternalSurface()),bounds().x,bounds().y);g.saveClip();g.clipRect(clip);paintDialog(g);g.restoreClip();};
    modalSurface_->pointer=[this](ui::Message* msg){return processSizeDrag(msg);};
    dockFeedback_=new DockFeedback;dockFeedback_->paint=[this](ui::Graphics& g){paintDockFeedback(g);};addChild(dockFeedback_);
    for(int id=0;id<4;++id){auto surface=new FloatingColumnSurface;floatingSurfaces_[id]=surface;addChild(surface);surface->paint=[this,surface,id](ui::Graphics& child){const auto clip=child.getClipBounds().offset(surface->bounds().origin()-bounds().origin());ui::Graphics g(child.display(),base::AddRef(child.getInternalSurface()),bounds().x,bounds().y);g.saveClip();g.clipRect(clip);clipColumn(g,id,true);paintChrome(g,true);paintTimelineGrid(g);g.restoreClip();
      // Floating surfaces also clear the header. Restore only the exposed
      // portion of inactive labels; the frame remains above their lower edge.
      if(columnFloating(id)){const auto physicalClip=child.getClipBounds().offset(surface->bounds().origin());for(int tabId:docking_.groups[docking_.groupOf(id)].tabs){auto tab=dockingTabs_[tabId];if(!tab || !tab->isVisible() || tab->active)continue;auto visible=tab->bounds();visible.h=std::max(0,toDisplay(columnFrame(id)).y-visible.y);ui::Graphics label(child.display(),base::AddRef(child.getInternalSurface()),tab->bounds().x,tab->bounds().y);label.saveClip();label.clipRect((visible&physicalClip).offset(-tab->bounds().origin()));ui::PaintEvent ev(tab,&label);tab->onPaint(ev);label.restoreClip();}}
    };}

    const char* topIcons[]{"plus","folderOpen","save","copy","image"};
    for(int i=0;i<5;++i){topActions_[i]=button(i==4?U"导出":U"",[this,i]{switch(i){case 0:ask(Pending::New);break;case 1:chooseProject();break;case 2:menuCommands_.invoke("save");break;case 3:menuCommands_.invoke("saveAs");break;case 4:openDocumentExport();break;}});topActions_[i]->iconSkin=&toolIcons_;topActions_[i]->icon=topIcons[i];topActions_[i]->iconWithCaption=i==4;topActions_[i]->iconGroupCount=i<4?4:0;topActions_[i]->iconGroupIndex=i;}

    auto picker=new DialogBackground<NativeColorPicker>(font_,skin_,assets_/"color-picker");configureDialogBackground(picker);colorPicker_=picker;addChild(colorPicker_);colorPicker_->setVisible(false);
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
menuCommands_.bind("gradientMap",{[this]{openGradientMap();},{},{}});
menuCommands_.bind("quickAntiAlias",{[this]{openAntiAlias();},{},{}});
menuCommands_.bind("convolution",{[this]{openConvolution();},{},{}});
menuCommands_.bind("adjustmentCurves",{[this]{openColorAdjustment(ColorAdjustmentKind::Curves);},{},{}});
menuCommands_.bind("adjustmentColorBalance",{[this]{openColorAdjustment(ColorAdjustmentKind::ColorBalance);},{},{}});
menuCommands_.bind("adjustmentBrightnessContrast",{[this]{openColorAdjustment(ColorAdjustmentKind::BrightnessContrast);},{},{}});
menuCommands_.bind("adjustmentHueSaturation",{[this]{openColorAdjustment(ColorAdjustmentKind::HueSaturation);},{},{}});
menuCommands_.bind("transform",{[this]{beginLayerTransform();},{},{}});
menuCommands_.bind("newLayer",{[this]{createLayer();},{},{}});
menuCommands_.bind("mergeVisibleLayers",{[this]{try{document.mergeVisibleLayers();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},[this]{int count=0;for(const auto& l:document.timeline().state().layers)if(l.visible){if(l.locked)return false;++count;}return count>=2;},{}});
menuCommands_.bind("duplicateLayer",{[this]{document.duplicateSelectedLayers();refresh();},[this]{return document.canDuplicateSelectedLayers();},{}});
menuCommands_.bind("mergeLayerDown",{[this]{try{document.mergeLayerDown();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},{[this]{return document.canMergeLayerDown();}},{}});
menuCommands_.bind("mergeSelectedLayers",{[this]{try{document.mergeSelectedLayers();refresh();}catch(const std::exception& e){status_=unicodeText(e.what());}},[this]{return document.canMergeSelectedLayers();},{}});
menuCommands_.bind("deleteLayer",{[this]{document.deleteSelectedLayers();},[this]{return document.canDeleteSelectedLayers();},{}});
menuCommands_.bind("editDelete",{[this]{deleteWorkspaceContent(false);},[this]{return canDeleteWorkspaceContent();},{}});
menuCommands_.bind("newDocument",{[this]{ask(Pending::New);},{},{}});
menuCommands_.bind("openDocument",{[this]{chooseProject();},{},{}});
menuCommands_.bind("save",{[this]{saveProject(false);},{},{}});
menuCommands_.bind("saveAs",{[this]{saveProject(true);},{},{}});
menuCommands_.bind("undo",{[this]{document.undo();},[this]{return document.canUndo();},{}});
menuCommands_.bind("redo",{[this]{document.redo();},[this]{return document.canRedo();},{}});
// Preferences and layer properties are partial migrations: title/description in
// the destination dialog must state recovery-only and opacity-only coverage.
menuCommands_.bind("openPreferences",{[this]{showPreferences();},{},{}});
menuCommands_.bind("openLayerProperties",{[this]{openSelectedLayerProperties();},[this]{return !document.timelineSelection().layers.empty();},{}});
menuCommands_.bind("resetView",{[this]{
 zoom_=16; const auto viewport=canvasViewport();
 const int width=int(std::lround(document.width()*canvasScale()));
 const int height=int(std::lround(document.height()*canvasScale()));
 canvas_=gfx::Rect(viewport.x+(viewport.w-width)/2,viewport.y+(viewport.h-height)/2,width,height);
 invalidate();
},{},{}});
menuCommands_.bind("toggleColorPanel",{[this]{colorPicker_->finishInteraction();colorPickerOpen_=!colorPickerOpen_;if(colorPickerOpen_)docking_.select(1);refresh();saveWorkspaceSizes();},{},[this]{return colorPickerOpen_;}});
menuCommands_.bind("toggleLayersPanel",{[this]{layersPanelOpen_=!layersPanelOpen_;refresh();},{},[this]{return columnShown(2);}});
menuCommands_.bind("togglePalettePanel",{[this]{palettePanelOpen_=!palettePanelOpen_;if(palettePanelOpen_)docking_.select(0);refresh();saveWorkspaceSizes();},{},[this]{return palettePanelOpen_;}});
menuCommands_.bind("togglePreviewPanel",{[this]{previewPanelOpen_=!previewPanelOpen_;if(previewPanelOpen_)docking_.select(3);refresh();saveWorkspaceSizes();},{},[this]{return previewPanelOpen_;}});
menuCommands_.bind("toggleSelectionOutline",{[this]{toggleSelectionOutline();refresh();},[this]{return bool(document.selection());},[this]{return !showSelectionOutline_;}});
menuCommands_.bind("flipHorizontal",{[this]{document.flipContent(true);refresh();},{},{}});
menuCommands_.bind("flipVertical",{[this]{document.flipContent(false);refresh();},{},{}});
menuCommands_.bind("rotateContentClockwise",{[this]{if(document.rotateContent(90)){selectionPivot_.reset();playing_=false;}refresh();},{},{}});
menuCommands_.bind("rotateContentCounterClockwise",{[this]{if(document.rotateContent(-90)){selectionPivot_.reset();playing_=false;}refresh();},{},{}});
menuCommands_.bind("rotateContent180",{[this]{if(document.rotateContent180()){selectionPivot_.reset();playing_=false;}refresh();},{},{}});
menuCommands_.bind("centerContentBoth",{[this]{centerContent(true,true);},{},{}});
menuCommands_.bind("centerContentHorizontal",{[this]{centerContent(true,false);},{},{}});
menuCommands_.bind("centerContentVertical",{[this]{centerContent(false,true);},{},{}});
menuCommands_.bind("copyMerged",{[this]{copyMergedPixels();},[this]{return !document.active() || document.floating();},{}});
menuCommands_.bind("fillForeground",{[this]{playing_=false;document.fillSelectionOrCanvas(document.palette().primary);refresh();},[this]{return !document.active() || document.floating();},{}});
menuCommands_.bind("freeTransform",{[this]{startFreeSelectionTransform();},[this]{return bool(document.selection());},{}});
menuCommands_.bind("createBrushFromSelection",{[this]{createBrushFromSelection();},[this]{return bool(document.selection()) && !document.active();},{}});
menuCommands_.bind("selectAll",{[this]{selectAllPixels();},{}, {}});
menuCommands_.bind("deselect",{[this]{document.deselectPixels();refresh();},[this]{return bool(document.selection());},{}});
menuCommands_.bind("invertSelection",{[this]{document.invertPixels();refresh();},[this]{return bool(document.selection());},{}});
menuCommands_.bind("copy",{[this]{if(paletteFocused_)copyPaletteColors();else if(celClipboardContext())copyTimelineCels();else if(frameSelectionExplicit_ && !paletteFocused_)copyTimelineFrames();else copySelectionPixels(false);},[this]{return paletteFocused_?!document.palette().selected.empty():celClipboardContext() || frameSelectionExplicit_ || (pixelClipboardContext() && bool(document.selection()));},{}});
menuCommands_.bind("cut",{[this]{if(celClipboardContext())cutTimelineCels();else if(frameSelectionExplicit_){cutTimelineFrames();}else copySelectionPixels(true);},[this]{return !paletteFocused_ && (celClipboardContext()?true:frameSelectionExplicit_ || bool(document.selection()));},{}});
menuCommands_.bind("paste",{[this]{if(paletteFocused_)pastePaletteColors();else if(celClipboardContext())pasteTimelineCels();else if(frameSelectionExplicit_ && !paletteFocused_)pasteTimelineFrames();else pasteSelectionPixels();},[this]{return paletteFocused_?true:celClipboardContext()?hasApplicationCelClipboard() && (applicationCelSelectionOnly() || !document.selection()):frameSelectionExplicit_?hasApplicationFrameClipboard():pixelClipboardContext();},{}});
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
    auto preview=new DialogBackground<PreviewPanel>(font_,skin_,toolIcons_,document);configureDialogBackground(preview);configureDialogBackground(preview->closeButton());previewPanel_=preview;columnClose_[3]=preview->closeButton();addChild(previewPanel_);
    previewPanel_->context=[this]{showColumnContextMenu(Column::Preview);};
    previewPanel_->paintTabs=[this](ui::Graphics& source){
      const auto clip=source.getClipBounds().offset(previewPanel_->bounds().origin());
      const auto& group=docking_.groups[docking_.groupOf(3)];
      auto paint=[&](int id){auto tab=dockingTabs_[id];if(!tab || !tab->isVisible())return;
        ui::Graphics g(source.display(),base::AddRef(source.getInternalSurface()),tab->bounds().x,tab->bounds().y);
        auto visible=tab->bounds();if(!tab->active)visible.h=std::max(0,toDisplay(columnFrame(3)).y-visible.y);
        g.saveClip();g.clipRect(tab->clientBounds());g.clipRect((visible&clip).offset(-tab->bounds().origin()));ui::PaintEvent ev(tab,&g);tab->onPaint(ev);g.restoreClip();};
      for(int id:group.tabs)if(!columnShown(id))paint(id);
      for(int id:group.tabs)if(columnShown(id))paint(id);
    };
    previewPanel_->closed=[this]{previewPanelOpen_=false;refresh();saveWorkspaceSizes();};
    previewPanel_->geometryChanged=[this]{saveWorkspaceSizes();updateNavigationCursor();};
    loadWorkspaceSizes();
    try {recoveryPreferences_=recovery::loadPreferences(recoveryDirectory().parent_path()/"recovery-preferences.txt");recoveryQueue_.setIntervalMinutes(recoveryPreferences_.minutes);recoveryDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(recoveryPreferences_.minutes*60000));}catch(const std::exception&e){status_=U"恢复设置读取失败："+unicodeText(e.what());}loadRecoveries(true);createHome();refresh();
  }
  void requestClose() { ask(Pending::Close); }
  void smokeSelectionCursors() {
    smoke_=true;document=Document(32,32);document.previewSelection(SelectionMask{8,8,16,16,{}});
    canvas_=gfx::Rect(100,100,256,256);zoom_=4;selectionTool_=true;eyedropperTool_=false;zoomTool_=false;selectionPivotVisible_=false;
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
    document.setLayerLocked(false);selectionKind_=0;homeOpen_=false;documentOpen_=true;
    auto captured=[&](const char* id){if(std::string(cursorAt(gfx::Point(-100,-100)))!=id)throw std::runtime_error(std::string("Captured cursor lost ownership: ")+id);};
    selectionDragging_=true;captured("none");selectionDragging_=false;
    floatingDragging_=true;selectionCopyDrag_=true;captured("copy");floatingDragging_=false;selectionCopyDrag_=false;
    selectionBoxDragging_=selectionDragging_=true;captured("selection-move");selectionBoxDragging_=selectionDragging_=false;
    selectionKind_=5;selectionDragging_=true;document.setLayerLocked(true);captured(legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255));selectionDragging_=false;document.setLayerLocked(false);
    shapeDragging_=true;captured("crosshair");shapeDragging_=false;gradientDragging_=true;captured("crosshair");gradientDragging_=false;
    symmetryDragging_=true;captured("move");symmetryDragging_=false;
    eyedropperGesture_.begin(false,false);captured("eyedropper");eyedropperGesture_.finish();
    pan_.active=true;captured("grabbing");pan_.active=false;
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
    const auto beforeSelection=document.selection();const auto beforePixels=document.pixels();const auto beforeRevision=document.revision();
    if(!menuCommands_.invoke("toggleSelectionOutline") || showSelectionOutline_ || !menuCommands_.checked("toggleSelectionOutline"))throw std::runtime_error("Outline menu hide");
    surface->clear();{ui::Graphics g(surface);paintSelectionAnts(g,cv,area,0);}for(int y=0;y<area.h;++y)for(int x=0;x<area.w;++x)if(surface->getPixel(x,y)!=0)throw std::runtime_error("Hidden outline still rendered");
    if(!selectionEqual(beforeSelection,document.selection()) || document.pixels()!=beforePixels || document.historySize()!=history || document.dirty() || document.revision()!=beforeRevision)throw std::runtime_error("Outline toggle mutated document");
    ui::KeyMessage show(ui::kKeyDownMessage,ui::kKeyH,ui::kKeyCtrlModifier,0,0);onProcessMessage(&show);if(!showSelectionOutline_)throw std::runtime_error("Outline Ctrl+H show");
    ui::KeyMessage repeated(ui::kKeyDownMessage,ui::kKeyH,ui::kKeyCtrlModifier,0,1);onProcessMessage(&repeated);if(!showSelectionOutline_)throw std::runtime_error("Outline key repeat toggled view");
    document=Document(3,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.commitSelection({},SelectionMask{0,0,1,1,{}});refresh();document.markSaved();const auto floatingHistory=document.historySize();if(!document.nudgeSelectionContent(1,0))throw std::runtime_error("Outline floating fixture");
    menuCommands_.invoke("toggleSelectionOutline");if(showSelectionOutline_ || !document.floating() || document.pixels()[1]!=0xff123456 || document.historySize()!=floatingHistory || document.dirty())throw std::runtime_error("Outline hide committed floating selection");menuCommands_.invoke("toggleSelectionOutline");if(!document.floating() || document.pixels()[1]!=0xff123456)throw std::runtime_error("Outline show stale floating pixels");document.cancelFloatingPaste();
    menuCommands_.invoke("toggleSelectionOutline");document=Document(2,1);refresh();if(!showSelectionOutline_)throw std::runtime_error("New document outline default");if(menuCommands_.enabled("toggleSelectionOutline"))throw std::runtime_error("Outline menu without selection enabled");

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
    {
      const auto oldControl=brushShapeButton_->bounds();const auto updates=sizeLayoutUpdates_;
      ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,edge);onProcessMessage(&down);
      for(int dx:{10,20,30}){
        ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,edge+gfx::Point(dx,0));onProcessMessage(&move);flushPanelGeometry();
        if(!hasCapture() || brushShapeButton_->bounds().x!=oldControl.x+dx)throw std::runtime_error("Held dock resize did not move tool properties with canvas");
        const auto layout=workspaceLayout(uiLogical(bounds()));if(commands_[4]->bounds().x2()!=(layout.workX+layout.workW)*uiScale)throw std::runtime_error("Held dock resize lost undo/redo canvas alignment");
      }
      ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,edge);onProcessMessage(&up);
      if(brushShapeButton_->bounds()!=oldControl || sizeLayoutUpdates_>updates+4)throw std::runtime_error("Dock resize property restore/coalescing failed");
    }
    drag(edge,gfx::Point(40,0));if(workspaceLayout(uiLogical(bounds())).right!=l.right+20)throw std::runtime_error("Left dock width resize failed");
    l=workspaceLayout(uiLogical(bounds()));edge=gfx::Point((l.rightX+10)*uiScale,l.split*uiScale);
    if(std::string(cursorAt(edge))!="ns-resize")throw std::runtime_error("Panel divider cursor missing");
    drag(edge,gfx::Point(0,40));if(workspaceLayout(uiLogical(bounds())).split!=l.split+20)throw std::runtime_error("Color panel split resize failed");
    l=workspaceLayout(uiLogical(bounds()));edge=gfx::Point((l.workX+10)*uiScale,l.layerTop*uiScale);
    drag(edge,gfx::Point(0,-40));if(workspaceLayout(uiLogical(bounds())).layerTop!=l.layerTop-20)throw std::runtime_error("Timeline resize failed");
    showLayerOpacity();
    for(int edges:{1,2,4,8,5,6,9,10}) {
      const auto before=dialogDisplayBounds();
      const gfx::Point at(edges&1?before.x+2:edges&2?before.x2()-2:before.x+before.w/2,
                          edges&4?before.y+2:edges&8?before.y2()-2:before.y+before.h/2);
      const gfx::Point delta(edges&1?-20:edges&2?20:0,edges&4?-20:edges&8?20:0);
      if(std::string(cursorAt(at))!=panelResizeCursor(edges))throw std::runtime_error("Modal resize cursor mismatch edges="+std::to_string(edges)+" actual="+cursorAt(at)+" gesture="+std::to_string(panelGesture_.id)+" size="+std::to_string(int(sizeDrag_))+" pending="+std::to_string(int(pending_)));
      drag(at,delta);const auto after=dialogDisplayBounds();
      if((edges&1 && after.x2()!=before.x2()) || (edges&2 && after.x!=before.x) ||
         (edges&4 && after.y2()!=before.y2()) || (edges&8 && after.y!=before.y))throw std::runtime_error("Modal resize lost opposite anchor");
      if((edges&3 && after.w!=before.w+20) || (edges&12 && after.h!=before.h+20))throw std::runtime_error("Modal edge failed to resize: "+std::to_string(edges)+" before "+std::to_string(before.w)+","+std::to_string(before.h)+" after "+std::to_string(after.w)+","+std::to_string(after.h));
      if(!after.contains(keep_->bounds()) || !after.contains(layerOpacityRange_->bounds()))throw std::runtime_error("Resized modal controls escaped frame");
    }
    auto modal=dialogDisplayBounds();
    drag(gfx::Point(modal.x+2,modal.y+modal.h/2),gfx::Point(5000,0));
    if(modalBounds(uiLogical(bounds())).w!=240)throw std::runtime_error("Modal minimum width failed");
    const auto footer=keep_->bounds();modal=dialogDisplayBounds();
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
  void smokePrepareDockSplitRepaint(){
    docking_=panels::Model{};palettePanelOpen_=colorPickerOpen_=layersPanelOpen_=true;previewPanelOpen_=false;paletteShare_=0;refresh();
  }
  void smokePrepareDockLabelRepaint(){
    smokePrepareDockSplitRepaint();dockColumn(0,panels::Dock::Left);
    const auto point=dockingTabs_[0]->bounds().center();
    ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);beginPanelGesture(0,down);
    smokeMoveDockLabel({70,60});
  }
  void smokeMoveDockLabel(gfx::Point delta){
    updatePanelGesture(panelGesture_.origin+delta);
    panelGesture_.due=std::chrono::steady_clock::now()+std::chrono::hours(1);
    // A single-column title has text-only bounds, but its dragged material
    // includes an entire framed tab; invalidation must contain those pixels.
    const auto cover=dockFeedbackBounds();const auto ghost=toDisplay(dockGhostRect());
    if(!cover.contains(ghost) || ghost.w<=panelGesture_.tabStart.w || ghost.h<=panelGesture_.tabStart.h)throw std::runtime_error("Dock label repaint does not cover its full material");
    if(ghost.y<panelGesture_.pointer.y+uiGap*uiScale-(uiScale-1) || !ghost.contains(gfx::Point(panelGesture_.pointer.x,ghost.y)))throw std::runtime_error("Dragged label is not beneath/centered on the pointer");
  }
  void smokeFinishDockLabelRepaint(){finishPanelGesture(true);}
  void smokePrepareMergedDockLabelRepaint(){
    smokePrepareDockSplitRepaint();previewPanelOpen_=true;dockColumn(3,panels::Dock::Bottom);
    docking_.place(2,panels::Dock::Bottom,docking_.groupOf(3),true,true);docking_.select(3);refresh();
    const auto point=dockingTabs_[0]->bounds().center();
    ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);beginPanelGesture(0,down);
    smokeMoveMergedDockLabel(0);
  }
  void smokeMoveMergedDockLabel(int shift){
    const auto r=columnGeometry(uiLogical(clientBounds())).panel[3];
    const auto point=toDisplay(gfx::Rect(r.x+r.w/2+shift,r.y-uiGap,1,1)).origin();
    smokeMoveDockLabel(point-panelGesture_.origin);
  }
  void smokeFloatingCoordinateTransitions(){
    const auto saved=docking_;const auto original=bounds();const bool preview=previewPanelOpen_;previewPanelOpen_=true;
    for(int id=0;id<4;++id){
      setBounds(gfx::Rect(17,23,640,480));docking_=panels::Model{};dockColumn(id,panels::Dock::Floating);
      auto& group=docking_.groups[docking_.groupOf(id)];group.floating={130,65,140,140};group.floatingArea=floatingArea(uiLogical(clientBounds()));refresh();
      for(const auto size:{gfx::Size(640,480),gfx::Size(1280,960),gfx::Size(800,600),gfx::Size(1280,960)}){
        setBounds(gfx::Rect(17,23,size.w,size.h));refresh();
        const auto before=columnGeometry(uiLogical(clientBounds())).panel[id];const auto title=dockingTabs_[id]->bounds();const auto point=title.center();
        ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);beginPanelGesture(id,down);updatePanelGesture(point+gfx::Point(-27,19));
        const auto after=columnGeometry(uiLogical(clientBounds())).panel[id];
        if(after.x!=before.x-13 || after.y!=before.y+9 || dockingTabs_[id]->bounds()!=gfx::Rect(title).offset(-26,18))throw std::runtime_error("Floating column jumped after small/large window transition");
        auto frame=id==3?static_cast<ui::Widget*>(previewPanel_):static_cast<ui::Widget*>(floatingSurfaces_[id]);
        if(frame->bounds()!=toDisplay(gfx::Rect(after.x,after.y,after.w,after.h)))throw std::runtime_error("Floating physical bounds disagree with projected layout after movement");
        finishPanelGesture();
      }
    }
    setBounds(original);docking_=saved;previewPanelOpen_=preview;refresh();
  }
  void smokePrepareFloatingPreviewRepaint(){
    smokePrepareDockSplitRepaint();previewPanelOpen_=true;dockColumn(0,panels::Dock::Floating);dockColumn(3,panels::Dock::Floating);
    auto& palette=docking_.groups[docking_.groupOf(0)];palette.floating={260,160,140,150};palette.floatingArea=floatingArea(uiLogical(clientBounds()));
    auto& preview=docking_.groups[docking_.groupOf(3)];preview.floating={220,140,150,130};preview.floatingArea=floatingArea(uiLogical(clientBounds()));refresh();
    focusOverlayAt(dockingTabs_[3]->bounds().center());
  }
  void smokeFloatingPreviewRepaintStep(int step){
    const gfx::Point deltas[]={{100,50},{-40,80},{-120,-70},{80,-60},{160,70},{-60,80},{-140,-100},{20,-30}};
    // Exercise both the front preview and a palette partly covered by it.
    const int id=step<4?3:0;const auto point=dockingTabs_[id]->bounds().center();
    ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);beginPanelGesture(id,down);
    // Consecutive batches can arrive before the first exposed region paints.
    // A later move must repaint dirty sources instead of scrolling stale bits.
    for(int sample=1;sample<=3;++sample)updatePanelGesture(point+gfx::Point(deltas[step].x*sample/3,deltas[step].y*sample/3));
    finishPanelGesture();
  }
  void smokeDockResizeMigration(){smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;document=Document();palettePanelOpen_=colorPickerOpen_=layersPanelOpen_=true;previewPanelOpen_=false;setBounds(gfx::Rect(0,0,1280,960));refresh();smokeDockResizeHover();}
  void smokeDockResizeHover(){
    const auto saved=docking_;const bool savedPreview=previewPanelOpen_;previewPanelOpen_=false;
    for(bool vertical:{true,false}){
      docking_=panels::Model{};dockColumn(0,vertical?panels::Dock::Left:panels::Dock::Bottom);dockColumn(1,vertical?panels::Dock::Left:panels::Dock::Bottom);refresh();
      const auto geometry=columnGeometry(uiLogical(clientBounds()));
      bool checked=false;
      for(int id:{0,1}){const auto r=geometry.panel[id];
        const auto point=toDisplay(gfx::Rect(vertical?r.x+r.w/2:r.x+r.w,vertical?r.y+r.h:r.y+r.h/2,1,1)).origin();
        const auto hit=panelResizeAt(point);if(hit.edges!=(vertical?128:256))continue;
        if(std::string(cursorAt(point))!=(vertical?"ns-resize":"ew-resize"))throw std::runtime_error("Dock splitter hover did not display its resize cursor");
        ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);processPanelGesture(&down);
        if(panelGesture_.id!=hit.id || panelGesture_.edges!=hit.edges || panelGesture_.neighbor!=hit.neighbor)throw std::runtime_error("Dock splitter press disagrees with hover hit");
        finishPanelGesture(true);
        // One pixel outside the outer end of this split band has no resize
        // hit: it must not enter the shared resize path without that cursor.
        const auto outside=toDisplay(gfx::Rect(vertical?r.x-1:r.x+r.w,vertical?r.y+r.h:r.y-4,1,1)).origin();
        if(panelResizeAt(outside).edges)throw std::runtime_error("Dock splitter accepted a point outside its visible hover band");
        checked=true;break;
      }
      if(!checked){const auto r=geometry.panel[0],n=geometry.panel[1];const auto point=toDisplay(gfx::Rect(vertical?r.x+r.w/2:r.x+r.w,vertical?r.y+r.h:r.y+r.h/2,1,1)).origin();const auto hit=panelResizeAt(point);throw std::runtime_error("Dock split diagnostic vertical="+std::to_string(vertical)+" hit="+std::to_string(hit.edges)+" home="+std::to_string(homeOpen_)+" pending="+std::to_string(int(pending_))+" active="+std::to_string(document.active())+" shown="+std::to_string(geometry.shown[0])+std::to_string(geometry.shown[1])+" origin="+std::to_string(bounds().x)+","+std::to_string(bounds().y)+" point="+std::to_string(point.x)+","+std::to_string(point.y)+" first="+std::to_string(r.x)+","+std::to_string(r.y)+","+std::to_string(r.w)+","+std::to_string(r.h)+" second="+std::to_string(n.x)+","+std::to_string(n.y)+","+std::to_string(n.w)+","+std::to_string(n.h));}
    }
    docking_=saved;previewPanelOpen_=savedPreview;refresh();
  }
  void smokeDockSplitShrink(){
    const auto rc=uiLogical(clientBounds());const auto l=workspaceLayout(rc);const auto point=toDisplay(gfx::Rect(l.rightX+10,l.split,1,1)).origin();
    auto expectedTitle=dockingTabs_[1]->bounds();expectedTitle.offset(0,-100);
    const auto updates=sizeLayoutUpdates_;const auto refreshes=panelFullRefreshes_;
    ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);processSizeDrag(&down);
    for(int sample=1;sample<=200;++sample){ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point+gfx::Point(0,-sample/2));processSizeDrag(&move);}
    if(sizeLayoutUpdates_!=updates)throw std::runtime_error("Dock split shrink did not coalesce pointer samples");
    finishSizeDrag();
    if(sizeLayoutUpdates_!=updates+1 || panelFullRefreshes_!=refreshes)throw std::runtime_error("Dock split shrink performed redundant layout/full refresh");
    if(dockingTabs_[1]->bounds()!=expectedTitle || dockingTabs_[1]->bounds().y2()>colorPicker_->bounds().y)throw std::runtime_error("Dock split left the picker title behind/inside content");
  }
  void smokePrepareColumnRepaint(){
    pending_=Pending::None;previewPanelOpen_=false;docking_=panels::Model{};
    dockColumn(0,panels::Dock::Floating);auto& group=docking_.groups[docking_.groupOf(0)];
    group.floating={220,150,160,150};group.floatingArea=floatingArea(uiLogical(clientBounds()));refresh();
  }
  void smokeColumnRepaintStep(int edges){
    const auto point=dockingTabs_[0]->bounds().center();
    ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);beginPanelGesture(0,down,edges);
    const auto updates=panelGeometryUpdates_,refreshes=panelFullRefreshes_,blits=panelBlitMoves_;const auto started=std::chrono::steady_clock::now();
    for(int sample=1;sample<=200;++sample){const auto delta=edges?gfx::Point(sample/4,sample/5):gfx::Point(-sample/2,sample/3);ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point+delta);processPanelGesture(&move);}
    if(panelGeometryUpdates_!=updates || panelFullRefreshes_!=refreshes)throw std::runtime_error("Live column burst performed redundant layout");
    flushPanelGeometry();finishPanelGesture();
    if(panelGeometryUpdates_!=updates+1 || panelFullRefreshes_!=refreshes)throw std::runtime_error("Live column batch performed full refresh/multiple layouts");
    if(!edges && !display()->nativeWindow()->gpuAcceleration() && panelBlitMoves_!=blits+1)throw std::runtime_error("Clean live floating move did not reuse Aseprite move_region");
    std::ofstream report("column-live-performance.txt",std::ios::app);report<<"edges="<<edges<<" samples=200 updates=1 full_refreshes=0 blits="<<panelBlitMoves_-blits<<" batch_us="<<std::chrono::duration<double,std::micro>(std::chrono::steady_clock::now()-started).count()<<'\n';
  }
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
      if(i==0 && !previewPanel_->hasCapture())throw std::runtime_error("Preview title/resize press did not acquire capture");
    }
    if(previewPanel_->geometryUpdates()!=smokePreviewUpdates_)throw std::runtime_error("Preview burst was not coalesced");
  }
  void smokePreviewBatchFlush(const std::function<void()>& dispatch) {
    const auto start=std::chrono::steady_clock::now();dispatch();
    const auto micros=std::chrono::duration<double,std::micro>(std::chrono::steady_clock::now()-start).count();
    if(previewPanel_->geometryUpdates()!=smokePreviewUpdates_+1)throw std::runtime_error("Mouse batch deferred geometry until timer step="+std::to_string(smokePreviewStep_)+" updates="+std::to_string(previewPanel_->geometryUpdates()-smokePreviewUpdates_)+" captured="+std::to_string(previewPanel_->hasCapture())+" managed="+std::to_string(previewPanel_->managed));
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
  void smokeMergedPreviewLabels(const std::filesystem::path& directory) {
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;docking_=panels::Model{};palettePanelOpen_=colorPickerOpen_=layersPanelOpen_=previewPanelOpen_=true;setBounds(gfx::Rect(0,0,1280,960));refresh();
    auto check=[](bool value,const char* text){if(!value)throw std::runtime_error(text);};
    auto renderDocking=[&]{ensureContentCache();auto image=os::instance()->makeRgbaSurface(bounds().x2(),bounds().y2());image->clear();{ui::Graphics g(nullptr,image,bounds().x,bounds().y);paintChrome(g);paintCanvas(g);paintTimelineGrid(g);}
      for(auto child:children()){if(child->hasFlags(ui::HIDDEN))continue;const auto at=child->bounds();ui::Graphics g(nullptr,image,at.x,at.y);g.saveClip();g.clipRect(child->clientBounds());ui::PaintEvent ev(child,&g);if(auto b=dynamic_cast<PixelButton*>(child))b->onPaint(ev);else if(auto scroll=dynamic_cast<PixelScrollBar*>(child))scroll->onPaint(ev);else if(child==colorPicker_)colorPicker_->onPaint(ev);else if(child==previewPanel_)previewPanel_->onPaint(ev);else if(child==dockFeedback_)dockFeedback_->onPaint(ev);else if(auto surface=dynamic_cast<FloatingColumnSurface*>(child))surface->onPaint(ev);g.restoreClip();}return image;};
    // A preview-only repaint during a held stroke must preserve every label,
    // including inactive labels drawn below the background/content siblings.
    const auto beforePreviewTabs=docking_;
    docking_.place(2,panels::Dock::Left,docking_.groupOf(3),true,true);docking_.select(3);refresh();
    auto previewTabs=renderDocking();
    auto checkPreviewLabels=[&](os::Surface* painted){for(int id:docking_.groups[docking_.groupOf(3)].tabs){
      auto tab=dockingTabs_[id];check(tab->isVisible(),"Merged preview hid an inactive label");
      auto expected=os::instance()->makeRgbaSurface(bounds().w,bounds().h);expected->clear();
      {ui::Graphics g(nullptr,expected,tab->bounds().x,tab->bounds().y);g.saveClip();g.clipRect(tab->clientBounds());ui::PaintEvent ev(tab,&g);tab->onPaint(ev);g.restoreClip();}
      auto box=tab->bounds();if(!tab->active)box.h-=Layout::frame*uiScale;for(int y=box.y;y<box.y2();++y)for(int x=box.x;x<box.x2();++x)
        if(tab->active || !dockingTabs_[3]->bounds().contains(gfx::Point(x,y)))check(painted->getPixel(x,y)==expected->getPixel(x,y),"Preview content erased merged label pixels");
    }};
    checkPreviewLabels(previewTabs.get());
    document.beginStroke({0,0},0xff123456);
    {const auto box=previewPanel_->bounds();ui::Graphics g(nullptr,previewTabs,box.x,box.y);g.saveClip();g.clipRect(previewPanel_->clientBounds());
      // Simulate arbitrary old drag/preview pixels in the opaque header tail.
      g.fillRect(gfx::rgba(255,0,255,255),gfx::Rect(0,0,box.w,previewPanel_->frameTop*uiScale));
      ui::PaintEvent ev(previewPanel_,&g);previewPanel_->onPaint(ev);g.restoreClip();}
    {const auto box=previewPanel_->bounds();int start=box.x;for(int id:docking_.groups[docking_.groupOf(3)].tabs)start=std::max(start,dockingTabs_[id]->bounds().x2());
      for(int y=box.y;y<box.y+previewPanel_->frameTop*uiScale;++y)for(int x=start;x<box.x2();++x)
        check(previewTabs->getPixel(x,y)==skin_["panel"],"Preview left stale pixels in the empty merged tab strip");}
    checkPreviewLabels(previewTabs.get());writeSmokeFrame(previewTabs.get(),directory/"panel-preview-held-stroke-tabs.bmp");
    document.cancelStroke();docking_=beforePreviewTabs;refresh();

  }
  void smokeDocking(const std::filesystem::path& directory) {
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;docking_=panels::Model{};palettePanelOpen_=colorPickerOpen_=layersPanelOpen_=previewPanelOpen_=true;setBounds(gfx::Rect(0,0,1280,960));refresh();
    auto check=[](bool value,const char* text){if(!value)throw std::runtime_error(text);};const auto history=document.historySize(),revision=document.revision();
    auto renderDocking=[&](ui::Widget* skip=nullptr){ensureContentCache();auto image=os::instance()->makeRgbaSurface(bounds().x2(),bounds().y2());image->clear();{ui::Graphics g(nullptr,image,bounds().x,bounds().y);paintChrome(g);paintCanvas(g);paintTimelineGrid(g);}
      for(auto child:children()){if(child==skip || child->hasFlags(ui::HIDDEN))continue;const auto at=child->bounds();ui::Graphics g(nullptr,image,at.x,at.y);g.saveClip();g.clipRect(child->clientBounds());ui::PaintEvent ev(child,&g);if(auto b=dynamic_cast<PixelButton*>(child))b->onPaint(ev);else if(auto scroll=dynamic_cast<PixelScrollBar*>(child))scroll->onPaint(ev);else if(child==colorPicker_)colorPicker_->onPaint(ev);else if(child==previewPanel_)previewPanel_->onPaint(ev);else if(child==dockFeedback_)dockFeedback_->onPaint(ev);else if(auto surface=dynamic_cast<FloatingColumnSurface*>(child))surface->onPaint(ev);g.restoreClip();}return image;};
    auto click=[&](int id,gfx::Point point){ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);beginPanelGesture(id,down);};
    dockColumn(0,panels::Dock::Right);auto r=columnGeometry(uiLogical(bounds())).panel[0];check(uiLogical(paletteLock_->bounds()).x==r.x+Layout::inset && uiLogical(paletteActions_->bounds()).x2()==r.x+r.w-Layout::inset && paletteLibrary_->bounds().x2()==paletteActions_->bounds().x+uiScale && !paletteLibrary_->isEnabled(),"Palette toolbar left/right shared-edge layout mismatch");check(toolIcons_.assets.patches.count("paletteLocal") && toolIcons_.assets.patches.count("paletteLocal-disabled"),"Palette selector icon missing from runtime catalog");
    auto start=dockingTabs_[1]->bounds().center();click(1,start);updatePanelGesture(dockingTabs_[0]->bounds().center());check(panelGesture_.candidate.merge && panelGesture_.confirmed.group<0,"Tab merge lacked delay");
    panelGesture_.due=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);tickPanelGesture();finishPanelGesture();
    check(docking_.groupOf(0)==docking_.groupOf(1) && columnShown(1) && !columnShown(0),"Header drag failed to group tabs");check(colorPicker_->bounds().x==(columnGeometry(uiLogical(bounds())).panel[1].x+6)*uiScale,"Grouped picker controls remained at old location");
    for(bool after:{false,true}){
      auto own=columnGeometry(uiLogical(bounds())).panel[1];click(1,dockingTabs_[1]->bounds().center());
      updatePanelGesture(gfx::Point((own.x+own.w/2)*uiScale,(after?own.y+own.h-2:own.y+20)*uiScale));
      panelGesture_.due=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);tickPanelGesture();
      check(panelGesture_.confirmed.group==docking_.groupOf(1) && !panelGesture_.confirmed.merge && panelGesture_.confirmed.after==after,"Grouped tab cannot split beside its own group");finishPanelGesture();
      const auto split=columnGeometry(uiLogical(bounds()));check(docking_.groupOf(0)!=docking_.groupOf(1) && (after?split.panel[1].y>split.panel[0].y:split.panel[1].y<split.panel[0].y),"Own-group split was not committed");
      docking_.place(1,panels::Dock::Right,docking_.groupOf(0),true,true);refresh();
    }
    click(0,dockingTabs_[0]->bounds().center());finishPanelGesture();check(columnShown(0) && !columnShown(1) && !swatches_[0]->hasFlags(ui::HIDDEN),"Tab click failed to activate palette");
    std::stringstream stored;docking_.write(stored);const auto before=stored.str();click(0,dockingTabs_[0]->bounds().center());updatePanelGesture(canvasViewport().center());finishPanelGesture(true);std::stringstream cancelled;docking_.write(cancelled);check(cancelled.str()==before,"Cancelled panel move changed persisted layout");
    const auto originalGroup=docking_.groupOf(1);click(1,dockingTabs_[1]->bounds().center());updatePanelGesture(canvasViewport().center());finishPanelGesture();check(docking_.groupOf(1)==originalGroup && docking_.groupOf(0)==docking_.groupOf(1) && !columnFloating(1),"Untargeted drag created a floating column");
    {const auto frame=columnFrame(1);const auto content=columnLayout(uiLogical(bounds()),1).pickerContent();check(content.y==frame.y+Layout::frame+uiGap && content.x==frame.x+Layout::frame+uiGap,"Grouped picker content lacks background inset");check(paletteActionsY(columnLayout(uiLogical(bounds()),0))==columnBodyTop(0),"Palette actions ignore background layer");}
    const auto originalSize=columnGeometry(uiLogical(bounds())).panel[1];dockColumn(1,panels::Dock::Floating);const auto floated=columnGeometry(uiLogical(bounds())).panel[1];check(floated.w==originalSize.w && floated.h==originalSize.h,"Context float changed original dimensions");
    click(1,dockingTabs_[1]->bounds().center());auto moveTo=gfx::Point(20,20);updatePanelGesture(moveTo);finishPanelGesture();const auto anywhere=columnGeometry(uiLogical(bounds())).panel[1];check(anywhere.x<dockArea(uiLogical(bounds())).x && anywhere.y<Layout::optionsY,"Floating column remained restricted to canvas/dock area");
    click(1,dockingTabs_[1]->bounds().center());updatePanelGesture(dockingTabs_[0]->bounds().center());panelGesture_.due=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);tickPanelGesture();
    check(panelGesture_.candidate.group<0 && panelGesture_.confirmed.group<0 && panelGesture_.candidate.dock==panels::Dock::Floating,"Floating drag offered magnetic docking");finishPanelGesture();check(columnFloating(1),"Floating drag docked without context menu");
    click(1,dockingTabs_[1]->bounds().center());updatePanelGesture(moveTo);finishPanelGesture();
    auto geometry=columnGeometry(uiLogical(bounds()));auto floating=geometry.panel[1];ui::MouseMessage resize(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,gfx::Point((floating.x+floating.w)*uiScale,(floating.y+floating.h)*uiScale));beginPanelGesture(1,resize,10);updatePanelGesture(resize.position()+gfx::Point(30,24));finishPanelGesture();check(docking_.groups[docking_.groupOf(1)].floating.w==floating.w+15,"Floating resize failed");
    dockColumn(0,panels::Dock::Floating);refresh();check(!floatingSurfaces_[0]->hasFlags(ui::HIDDEN),"Floating palette has no opaque frame surface");
    // A queued overlay paint must stay empty for floating movement, even
    // if it was invalidated during the preceding docked-column gesture.
    dockColumn(3,panels::Dock::Floating);refresh();
    click(3,dockingTabs_[3]->bounds().center());updatePanelGesture(panelGesture_.origin+gfx::Point(-80,-60));
    check(dockFeedback_->hasFlags(ui::HIDDEN),"Floating preview showed a detached drag label");
    const auto previewBox=columnGeometry(uiLogical(bounds())).panel[3];const auto previewLabel=uiLogical(dockingTabs_[3]->bounds());
    check(previewLabel.x==previewBox.x+5 && previewLabel.y==previewBox.y+5-font_.inkBounds(dockingTabs_[3]->caption).y,"Floating preview title detached from its frame");
    auto overlay=os::instance()->makeRgbaSurface(bounds().w,bounds().h);overlay->clear();{ui::Graphics g(overlay);paintDockFeedback(g);}
    {os::SurfaceLock lock(overlay.get());for(int y=0;y<overlay->height();++y)for(int x=0;x<overlay->width();++x)check(gfx::geta(overlay->getPixel(x,y))==0,"Floating preview painted a stray ghost label");}
    auto previewMovingImage=renderDocking();writeSmokeFrame(previewMovingImage.get(),directory/"panel-docking-preview-moving-smoke.bmp");finishPanelGesture();
    // The opaque floating frame must honor a partial child repaint clip.
    auto clipped=os::instance()->makeRgbaSurface(bounds().w,bounds().h);clipped->clear();
    const auto frameBounds=floatingSurfaces_[0]->bounds();const auto partial=gfx::Rect(frameBounds.x+12,frameBounds.y+12,8,8);
    {ui::Graphics g(nullptr,clipped,frameBounds.x,frameBounds.y);g.saveClip();g.clipRect(gfx::Rect(12,12,8,8));floatingSurfaces_[0]->paint(g);g.restoreClip();}
    {os::SurfaceLock lock(clipped.get());for(int y=0;y<clipped->height();++y)for(int x=0;x<clipped->width();++x)if(!partial.contains(gfx::Point(x,y)))check(gfx::geta(clipped->getPixel(x,y))==0,"Floating frame repaint escaped its clip");}
    const auto geometryBeforeMove=columnGeometry(uiLogical(bounds())).panel[0];
    // Place the palette over the canvas and tool row, then compare incremental
    // painting of the old/new union with a clean composite (stale-pixel guard).
    click(0,dockingTabs_[0]->bounds().center());updatePanelGesture({bounds().x+300,bounds().y+30});finishPanelGesture();
    auto floatingImage=renderDocking();writeSmokeFrame(floatingImage.get(),directory/"panel-docking-floating-smoke.bmp");
    const auto floatBox=columnFrame(0);const auto& frameBitmap=*skin_.assets.patches.at("panel_outer").bitmap;const auto framePixel=frameBitmap.pixels[(frameBitmap.height/2)*frameBitmap.width];check(floatingImage->getPixel(floatBox.x*uiScale,(floatBox.y+30)*uiScale)==gfx::rgba(framePixel&255,(framePixel>>8)&255,(framePixel>>16)&255,framePixel>>24),"Floating palette outer border was erased");
    const auto oldPosition=columnGeometry(uiLogical(bounds())).panel[0];
    click(0,dockingTabs_[0]->bounds().center());updatePanelGesture(panelGesture_.origin+gfx::Point(80,60));finishPanelGesture();
    auto movedImage=renderDocking();const auto newPosition=columnGeometry(uiLogical(bounds())).panel[0];
    auto repaint=uiPhysical(gfx::Rect(oldPosition.x,oldPosition.y,oldPosition.w,oldPosition.h)|gfx::Rect(newPosition.x,newPosition.y,newPosition.w,newPosition.h));
    {ui::Graphics g(floatingImage);g.saveClip();g.clipRect(repaint);paintChrome(g);paintCanvas(g);paintTimelineGrid(g);for(auto child:children()){if(child->hasFlags(ui::HIDDEN))continue;auto at=child->bounds();ui::Graphics cg(nullptr,floatingImage,at.x,at.y);cg.saveClip();cg.clipRect(child->clientBounds());ui::PaintEvent ev(child,&cg);if(auto pb=dynamic_cast<PixelButton*>(child))pb->onPaint(ev);else if(auto scroll=dynamic_cast<PixelScrollBar*>(child))scroll->onPaint(ev);else if(child==colorPicker_)colorPicker_->onPaint(ev);else if(child==previewPanel_)previewPanel_->onPaint(ev);else if(auto surface=dynamic_cast<FloatingColumnSurface*>(child))surface->onPaint(ev);cg.restoreClip();}g.restoreClip();}
    for(int y=repaint.y;y<std::min(repaint.y2(),bounds().h);++y)for(int x=repaint.x;x<std::min(repaint.x2(),bounds().w);++x)check(floatingImage->getPixel(x,y)==movedImage->getPixel(x,y),"Floating move left stale pixels in exposed region");
    const auto front=floatingSurfaces_[0];auto childOrder=children();check(std::find(childOrder.begin(),childOrder.end(),front)>std::find(childOrder.begin(),childOrder.end(),commands_[4]),"Floating frame below tool controls");
    dockColumn(0,panels::Dock::Right);
    dockColumn(1,panels::Dock::Right);docking_.place(1,panels::Dock::Right,docking_.groupOf(0),true,true);docking_.select(0);dockColumn(3,panels::Dock::Left);refresh();
    check(commands_[4]->bounds().x2()==(workspaceLayout(uiLogical(bounds())).workX+workspaceLayout(uiLogical(bounds())).workW)*uiScale,"Tool property bar escaped canvas column");
    const auto groupFrame=columnFrame(0),firstTab=dockingTabs_[docking_.groups[docking_.groupOf(0)].tabs.front()]->bounds();check(uiLogical(firstTab).x==groupFrame.x && uiLogical(firstTab).y2()==groupFrame.y+Layout::frame,"Grouped tabs do not share the column frame edge");
    check(document.historySize()==history && document.revision()==revision,"Docking modified document/history");
    ensureContentCache();auto image=os::instance()->makeRgbaSurface(bounds().w,bounds().h);image->clear();{ui::Graphics g(image);paintChrome(g);paintCanvas(g);paintTimelineGrid(g);}
    for(auto child:children()){if(child->hasFlags(ui::HIDDEN))continue;const auto at=child->bounds();ui::Graphics g(nullptr,image,at.x,at.y);g.saveClip();g.clipRect(child->clientBounds());ui::PaintEvent ev(child,&g);if(auto b=dynamic_cast<PixelButton*>(child))b->onPaint(ev);else if(auto scroll=dynamic_cast<PixelScrollBar*>(child))scroll->onPaint(ev);else if(child==colorPicker_)colorPicker_->onPaint(ev);else if(child==previewPanel_)previewPanel_->onPaint(ev);else if(child==dockFeedback_)dockFeedback_->onPaint(ev);else if(auto surface=dynamic_cast<FloatingColumnSurface*>(child))surface->onPaint(ev);g.restoreClip();}
    check(dockingTabs_[1]->bounds().y2()==dockingTabs_[0]->bounds().y2(),"Inactive and active tab bottoms differ");
    {const auto order=children();auto index=[&](ui::Widget* w){return std::find(order.begin(),order.end(),w);};
      check(index(dockingTabs_[1])<index(floatingSurfaces_[0]) && index(floatingSurfaces_[0])<index(dockingTabs_[0]),"Inactive tab must be below column background and active tab");
      auto withoutInactive=renderDocking(dockingTabs_[1]);const auto rim=toDisplay(gfx::Rect(groupFrame.x,groupFrame.y,groupFrame.w,Layout::frame));
      for(int y=rim.y;y<rim.y2();++y)for(int x=rim.x;x<rim.x2();++x)check(image->getPixel(x,y)==withoutInactive->getPixel(x,y),"Inactive tab overwrote the column background rim");
      auto inactive=dockingTabs_[1];for(const auto type:{ui::kMouseEnterMessage,ui::kMouseLeaveMessage}){ui::MouseMessage mouse(type,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyNoneModifier,inactive->bounds().center());inactive->sendMessage(&mouse);
        ui::Graphics g(nullptr,image,inactive->bounds().x,inactive->bounds().y);g.saveClip();g.clipRect(inactive->clientBounds());ui::PaintEvent ev(inactive,&g);inactive->onPaint(ev);g.restoreClip();
        for(int y=rim.y;y<rim.y2();++y)for(int x=rim.x;x<rim.x2();++x)check(image->getPixel(x,y)==withoutInactive->getPixel(x,y),"Inactive hover repaint overwrote the background rim");}}
    auto checkTabJoins=[&](os::Surface* painted,int id){
      auto r=uiLogical(dockingTabs_[id]->bounds());const bool first=dockingTabs_[id]->firstTab;
      os::SurfaceLock lock(painted);
      for(const char* slot:{"panel_tab_join_left","panel_tab_join_right"}){const bool left=std::string(slot)=="panel_tab_join_left";if(left && first)continue;
        const auto& b=*skin_.assets.patches.at(slot).bitmap;const int x=left?r.x:r.x2()-b.width,y=r.y2()-b.height;
        for(int by=0;by<b.height;++by)for(int bx=0;bx<b.width;++bx){const auto v=b.pixels[by*b.width+bx];check(painted->getPixel((x+bx)*uiScale,(y+by)*uiScale)==gfx::rgba(v&255,(v>>8)&255,(v>>16)&255,v>>24),"Tab corner material is clipped or misplaced");}
      }
    };checkTabJoins(image.get(),0);
    writeSmokeFrame(image.get(),directory/"panel-docking-smoke.bmp");
    docking_.select(1);refresh();
    const auto pickerFrame=columnFrame(1),pickerBox=columnLayout(uiLogical(bounds()),1).pickerGradient(!recentColors_.values().empty());
    check(pickerBox.y-pickerFrame.y==Layout::frame+uiGap && colorPicker_->bounds()==uiPhysical(gfx::Rect(pickerBox).shrink(1)),"Grouped picker ignored the content layer inset");
    auto pickerImage=renderDocking();checkTabJoins(pickerImage.get(),1);writeSmokeFrame(pickerImage.get(),directory/"panel-docking-picker-smoke.bmp");docking_.select(0);refresh();

    // A preview-only repaint during a held stroke must preserve every label,
    // including inactive labels drawn below the background/content siblings.
    const auto beforePreviewTabs=docking_;
    docking_.place(2,panels::Dock::Left,docking_.groupOf(3),true,true);docking_.select(3);refresh();
    auto previewTabs=renderDocking();
    auto checkPreviewLabels=[&](os::Surface* painted){for(int id:docking_.groups[docking_.groupOf(3)].tabs){
      auto tab=dockingTabs_[id];check(tab->isVisible(),"Merged preview hid an inactive label");
      auto expected=os::instance()->makeRgbaSurface(bounds().w,bounds().h);expected->clear();
      {ui::Graphics g(nullptr,expected,tab->bounds().x,tab->bounds().y);g.saveClip();g.clipRect(tab->clientBounds());ui::PaintEvent ev(tab,&g);tab->onPaint(ev);g.restoreClip();}
      auto box=tab->bounds();if(!tab->active)box.h-=Layout::frame*uiScale;for(int y=box.y;y<box.y2();++y)for(int x=box.x;x<box.x2();++x)
        if(tab->active || !dockingTabs_[3]->bounds().contains(gfx::Point(x,y)))check(painted->getPixel(x,y)==expected->getPixel(x,y),"Preview content erased merged label pixels");
    }};
    checkPreviewLabels(previewTabs.get());
    document.beginStroke({0,0},0xff123456);
    {const auto box=previewPanel_->bounds();ui::Graphics g(nullptr,previewTabs,box.x,box.y);g.saveClip();g.clipRect(previewPanel_->clientBounds());
      // Simulate arbitrary old drag/preview pixels in the opaque header tail.
      g.fillRect(gfx::rgba(255,0,255,255),gfx::Rect(0,0,box.w,previewPanel_->frameTop*uiScale));
      ui::PaintEvent ev(previewPanel_,&g);previewPanel_->onPaint(ev);g.restoreClip();}
    {const auto box=previewPanel_->bounds();int start=box.x;for(int id:docking_.groups[docking_.groupOf(3)].tabs)start=std::max(start,dockingTabs_[id]->bounds().x2());
      for(int y=box.y;y<box.y+previewPanel_->frameTop*uiScale;++y)for(int x=start;x<box.x2();++x)
        check(previewTabs->getPixel(x,y)==skin_["panel"],"Preview left stale pixels in the empty merged tab strip");}
    checkPreviewLabels(previewTabs.get());writeSmokeFrame(previewTabs.get(),directory/"panel-preview-held-stroke-tabs.bmp");
    document.cancelStroke();docking_=beforePreviewTabs;refresh();

    const auto title=dockingTabs_[0]->bounds();click(0,title.center());
    const auto target=columnGeometry(uiLogical(bounds())).panel[3];
    const gfx::Point destination((target.x+target.w/2)*uiScale,(target.y+target.h-8)*uiScale);
    updatePanelGesture(destination);panelGesture_.due=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);tickPanelGesture();
    check(panelGesture_.confirmed.group==docking_.groupOf(3) && !panelGesture_.confirmed.merge,"Vertical split preview missing");
    check(!dockFeedback_->hasFlags(ui::HIDDEN) && dockingTabs_[0]->hasFlags(ui::HIDDEN),"Dragged label did not transfer into overlay");
    auto sample=panelGesture_.confirmed.preview;const int sx=(sample.x+sample.w/2)*uiScale,sy=(sample.y+sample.h/2)*uiScale;
    const auto basePixel=image->getPixel(sx,sy);
    {ui::Graphics g(image);paintDockFeedback(g);}
    check(image->getPixel(sx,sy)!=basePixel,"Translucent dock region did not overlay column contents");
    writeSmokeFrame(image.get(),directory/"panel-docking-drag-smoke.bmp");finishPanelGesture(true);
    const auto closeLayout=docking_;const char* closeCommands[]{"togglePalettePanel","toggleColorPanel","toggleLayersPanel","togglePreviewPanel"};
    for(int id=0;id<4;++id){
      dockColumn(id,panels::Dock::Floating);check(!columnClose_[id]->hasFlags(ui::HIDDEN) && columnShown(id),"Floating column lacks close button");
      auto r=columnGeometry(uiLogical(bounds())).panel[id];check(columnClose_[id]->bounds()==uiPhysical(gfx::Rect(r.x+r.w-16,r.y+4,11,12)),"Floating close button has inconsistent geometry");
      ui::MouseMessage closePress(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,columnClose_[id]->bounds().center());
      check(!processPanelGesture(&closePress) && panelGesture_.id<0,"Close button starts a column drag");
      columnClose_[id]->Click();check(!columnVisibility()[id] && columnClose_[id]->hasFlags(ui::HIDDEN),"Column close did not hide the column");
      menuCommands_.invoke(closeCommands[id]);check(columnShown(id) && !columnClose_[id]->hasFlags(ui::HIDDEN),"Window menu did not reopen floating column");
      dockColumn(id,panels::Dock::Right);check(columnClose_[id]->hasFlags(ui::HIDDEN),"Docked column retained a close button");
    }
    docking_=closeLayout;refresh();check(document.historySize()==history && document.revision()==revision,"Column close modified document history");
    const auto originalBounds=bounds();const bool pickerVisible=colorPickerOpen_;
    for(const auto size:{gfx::Size(640,480),gfx::Size(800,600),gfx::Size(1000,700)}){
      docking_=panels::Model{};docking_.place(0,panels::Dock::Right);docking_.place(3,panels::Dock::Left);colorPickerOpen_=false;
      setBounds(gfx::Rect(17,23,size.w,size.h));refresh();
      const auto geometry=columnGeometry(uiLogical(clientBounds()));auto title=dockingTabs_[3]->bounds();
      check(title.x==bounds().x+(geometry.panel[3].x+5)*uiScale,"Small-client preview title lost the physical origin");
      ui::MouseMessage press(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,title.center());
      check(processPanelGesture(&press) && panelGesture_.id==3 && hasCapture(),"Docked preview title does not start dragging through the shared dispatcher");
      updatePanelGesture(title.center()+gfx::Point(40,60));check(panelGesture_.moved,"Small-client preview drag did not follow the pointer");finishPanelGesture(true);
      std::vector<bool> active;for(auto b:swatches_)active.push_back(b->active);for(auto b:swatches_)b->active=false;swatches_.front()->active=true;layoutPalette();raiseDockWidgets();
      auto frame=renderDocking();auto selected=swatches_.front();auto mask=os::instance()->makeRgbaSurface(frame->width(),frame->height());mask->clear();
      auto expected=renderDocking(selected);
      {ui::Graphics g(nullptr,expected,selected->bounds().x,selected->bounds().y);g.clipRect(selected->clientBounds());ui::PaintEvent ev(selected,&g);selected->onPaint(ev);}
      {ui::Graphics g(nullptr,mask,selected->bounds().x,selected->bounds().y);UiPaintScale scale(g);auto border=selected->clientBounds();border.shrink(2*uiScale);skin_.drawSelectionBorder(g,border,false);}
      {os::SurfaceLock lock(mask.get());const auto material=selected->bounds();for(int y=material.y;y<material.y2();++y)for(int x=material.x;x<material.x2();++x){
        const bool hit=skin_.selectionContains(material,{x,y});check(hit==(gfx::geta(mask->getPixel(x,y))!=0),"Offset palette selection alpha/hit mismatch");
        if(hit)check(frame->getPixel(x,y)==expected->getPixel(x,y),"Neighboring swatch clipped the selected color outline");
      }}
      for(int i=0;i<int(swatches_.size());++i)swatches_[i]->active=active[i];
    }
    setBounds(originalBounds);docking_=closeLayout;colorPickerOpen_=pickerVisible;refresh();
    const auto savedModal=modalGeometry_;showLayerOpacity();modalGeometry_[pending_]={100,100,280,116};refresh();
    dockColumn(0,panels::Dock::Floating);auto& focused=docking_.groups[docking_.groupOf(0)];focused.floating={280,105,140,150};focused.floatingArea=floatingArea(uiLogical(clientBounds()));refresh();
    auto indexOf=[&](ui::Widget* widget){const auto list=children();return int(std::find(list.begin(),list.end(),widget)-list.begin());};
    focusOverlayAt(toDisplay(gfx::Rect(400,110,1,1)).origin());check(indexOf(floatingSurfaces_[0])<indexOf(modalSurface_),"Modal barrier must stay above floating columns");
    auto floatingFocused=renderDocking();writeSmokeFrame(floatingFocused.get(),directory/"panel-docking-floating-focus-smoke.bmp");
    focusOverlayAt(toDisplay(gfx::Rect(110,110,1,1)).origin());check(indexOf(modalSurface_)>indexOf(floatingSurfaces_[0]),"Dialog must stay above the floating column");
    auto dialogFocused=renderDocking();writeSmokeFrame(dialogFocused.get(),directory/"panel-docking-dialog-focus-smoke.bmp");
    const auto overlapPixel=toDisplay(gfx::Rect(300,150,1,1)).origin();
    check(floatingFocused->getPixel(overlapPixel.x,overlapPixel.y)==dialogFocused->getPixel(overlapPixel.x,overlapPixel.y),"Background focus changed modal occlusion");
    focusWidgetOverlay(columnClose_[0]);check(indexOf(floatingSurfaces_[0])<indexOf(modalSurface_),"Background keyboard focus bypassed modal barrier");
    focusWidgetOverlay(paletteInput_);check(dialogFocus_>groupFocus(0),"Keyboard/control focus did not raise dialog");
    check(frontWidgetAt(keep_->bounds().center())==keep_,"Modal surface intercepted the visible dialog button");
    ui::MouseMessage buttonDown(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,keep_->bounds().center());buttonDown.setDisplay(display());
    check(!dispatchPanelGesture(&buttonDown),"Modal button click started a background panel gesture");
    frontWidgetAt(keep_->bounds().center())->sendMessage(&buttonDown);check(keep_->isSelected() && keep_->hasCapture(),"Visible modal button did not receive press");keep_->releaseMouse();keep_->setSelected(false);
    resolve(false);modalGeometry_=savedModal;docking_=closeLayout;refresh();
    smokeDockResizeHover();
    smokeFloatingCoordinateTransitions();
    std::ofstream performance(directory/"column-drag-performance.txt");
    for(int edges:{0,10,16}){
      docking_=closeLayout;dockColumn(0,edges==16?panels::Dock::Left:panels::Dock::Floating);
      const auto origin=dockingTabs_[0]->bounds().center();
      ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,origin);beginPanelGesture(0,down,edges);
      const auto updates=panelGeometryUpdates_,refreshes=panelFullRefreshes_;const auto started=std::chrono::steady_clock::now();
      for(int sample=1;sample<=200;++sample){ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,origin+gfx::Point(sample/2,sample/3));processPanelGesture(&move);}
      check(panelGeometryUpdates_==updates && panelFullRefreshes_==refreshes,"Column pointer burst performed immediate layout/full refresh");
      flushPanelGeometry();
      check(panelGeometryUpdates_==updates+1 && panelFullRefreshes_==refreshes,"Column pointer batch did not apply exactly one geometry update without full refresh");
      const auto elapsed=std::chrono::duration<double,std::micro>(std::chrono::steady_clock::now()-started).count();
      performance<<"edges="<<edges<<" pointer_samples=200 geometry_updates=1 full_refreshes=0 batch_us="<<elapsed<<'\n';
      finishPanelGesture(true);
    }
    docking_=closeLayout;refresh();
    check(document.historySize()==history && document.revision()==revision,"Layout/focus checks modified document history");


  }
  void smokeLayerContext(const std::filesystem::path& directory) {
    document=Document(2,2);document.addLayer();document.beginStroke({0,0},0xff123456);document.commitStroke();document.addLinkedFrame();refresh();contextFrameId_=document.frame().id;
    const int counts[]{6,23,10,10},enabledCounts[]{1,4,7,3};
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
  void smokeTimelineGestures(const std::filesystem::path& directory) {
    setBounds(gfx::Rect(0,0,1280,960));document=Document(2,2);document.addFrame();document.addFrame();document.addFrame();document.addLayer();document.addLayer();refresh();
    auto point=[&](int row,int col){const auto l=workspaceLayout(uiLogical(bounds()));return gfx::Point((l.workX+95+col*12)*uiScale,(l.layerTop+55+row*12)*uiScale);};
    auto press=[&](int kind,int row,int col,gfx::Point p,int modifiers=ui::kKeyNoneModifier){ui::MouseMessage m(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::KeyModifiers(modifiers),p);beginTimelineGesture(kind,row,col,m);};
    auto send=[&](ui::MessageType type,gfx::Point p,int modifiers=ui::kKeyNoneModifier){ui::MouseMessage m(type,os::PointerType::Mouse,ui::kButtonLeft,ui::KeyModifiers(modifiers),p);onProcessMessage(&m);};
    auto require=[](bool value,const char* message){if(!value)throw std::runtime_error(message);};
    const auto initialHistory=document.historySize();const auto p=point(0,0),q=point(1,1);
    press(3,0,0,p);if(!timelineGesture_.kind || !hasCapture())throw std::runtime_error("Timeline begin state="+std::to_string(timelineGesture_.kind)+" capture="+std::to_string(hasCapture())+" open="+std::to_string(documentOpen_));send(ui::kMouseMoveMessage,q);if(document.timelineSelection().cels.size()!=4)throw std::runtime_error("Cel marquee count="+std::to_string(document.timelineSelection().cels.size())+" kind="+std::to_string(timelineGesture_.kind)+" target="+std::to_string(timelineGesture_.targetRow)+","+std::to_string(timelineGesture_.targetColumn)+" capture="+std::to_string(hasCapture())+" pending="+std::to_string(int(pending_)));send(ui::kMouseUpMessage,q);require(document.timelineSelection().cels.size()==4 && document.historySize()==initialHistory,"Cel marquee commit changed content history");
    const auto selection=document.timelineSelection();const auto active=document.frame().id;press(3,2,3,point(2,3));send(ui::kMouseMoveMessage,p);finishTimelineGesture(true);require(document.timelineSelection().cels==selection.cels && document.frame().id==active,"Cancel marquee did not restore selection/context");
    // Drag the actual external material, not a whole-cell proxy.
    const auto box=timelineOutlines().front().border;const auto edge=gfx::Point((box.x+5)*uiScale,(box.y-1)*uiScale);ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,edge);require(beginTimelineOutline(down) && timelineGesture_.canMove,"External selection border cannot start move");send(ui::kMouseMoveMessage,edge+gfx::Point(12*uiScale,0));send(ui::kMouseUpMessage,edge+gfx::Point(12*uiScale,0));require(document.historySize()==initialHistory+1 && document.timelineSelection().cels.size()==4,"Multi-cel outline move failed");document.undo();refresh();require(document.timelineSelection().cels==selection.cels,"UI cel move undo selection");
    const auto& state=document.timeline().state();document.selectTimelineCel(document.timeline().findCel(state.layers[0].id,state.frames[0].id)->id);document.selectTimelineCel(document.timeline().findCel(state.layers[0].id,state.frames[1].id)->id,1);document.selectTimelineCel(document.timeline().findCel(state.layers[1].id,state.frames[0].id)->id,1);refresh();
    auto frame=os::instance()->makeRgbaSurface(bounds().w,bounds().h);frame->clear();
    {ui::Graphics g(frame);UiPaintScale scale(g);for(const auto& outline:timelineOutlines()){skin_.drawSelectionBorder(g,uiPhysical(outline.border),false);}}
    {os::SurfaceLock lock(frame.get());const auto l=columnLayout(uiLogical(bounds()),2);for(int y=(l.layerTop+45)*uiScale;y<(l.layerTop+77)*uiScale;++y)for(int x=(l.workX+85)*uiScale;x<(l.workX+117)*uiScale;++x)require(timelineBorderHit({x,y})==(gfx::geta(frame->getPixel(x,y))!=0),"Sparse cel bounding selection alpha/hit mismatch");}
    auto composite=os::instance()->makeRgbaSurface(bounds().w,bounds().h);{ui::Graphics g(composite);paintChrome(g);paintTimelineGrid(g);}writeSmokeFrame(composite.get(),directory/"timeline-multiselect.bmp");
    require(!timelineBorderHit(point(0,0)),"Transparent selection center starts move");
    const auto l=columnLayout(uiLogical(bounds()),2);const auto header=[&](int c){return gfx::Point((l.workX+95+c*12)*uiScale,(l.layerTop+43)*uiScale);};press(2,-1,0,header(0));send(ui::kMouseMoveMessage,header(2));send(ui::kMouseUpMessage,header(2));require(document.selectedFrames().size()==3,"Frame header drag did not select range");const auto frames=document.selectedFrames();press(2,-1,0,header(0),ui::kKeyAltModifier);send(ui::kMouseMoveMessage,header(3),ui::kKeyAltModifier);send(ui::kMouseUpMessage,header(3),ui::kKeyAltModifier);require(document.timeline().state().frames.size()==7,"Alt frame drag did not copy range");document.undo();refresh();require(document.timeline().state().frames.size()==4 && document.selectedFrames()==frames,"Alt frame drag not atomic undo");
    const auto blankLayout=columnLayout(uiLogical(bounds()),2);
    for(int kind=1;kind<=3;++kind){
      if(kind==1)selectTimelineLayer(0);else if(kind==2){document.selectFrameHeader(document.timeline().state().frames[0].id);refresh();}else selectTimelineCel(0,0);
      const auto layer=document.layer().id,frameId=document.frame().id;const auto history=document.historySize();
      ui::MouseMessage control(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,layerEyes_[0]->bounds().center());
      require(!clearTimelineSelectionFromBlank(control) && !timelineOutlines().empty(),"Row control dismissed timeline selection");
      ui::MouseMessage outside(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,canvasViewport().center());
      require(!clearTimelineSelectionFromBlank(outside) && !timelineOutlines().empty(),"Other panel dismissed timeline selection");
      const auto blank=gfx::Point((blankLayout.workX+(kind==2?20:300))*uiScale,(blankLayout.layerTop+(kind==2?100:55))*uiScale);
      send(ui::kMouseDownMessage,blank);
      require(document.timelineSelection().layers.empty() && document.timelineSelection().cels.empty() && document.selectedFrames().empty() && timelineOutlines().empty(),"List blank click retained selection");
      require(document.layer().id==layer && document.frame().id==frameId && document.historySize()==history,"List blank click changed active context or history");
    }
    selectTimelineCel(0,0);
    ui::MouseMessage rightBlank(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonRight,ui::kKeyNoneModifier,gfx::Point((blankLayout.workX+300)*uiScale,(blankLayout.layerTop+55)*uiScale));
    require(!clearTimelineSelectionFromBlank(rightBlank) && timelineOutlines().empty(),"Blank right click failed to dismiss selection or consumed create menu");
    document=Document();frameSelectionExplicit_=false;refresh();
  }
  void smokeLayers(const std::filesystem::path& directory) {
    smokeTimelineGestures(directory);
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
    const auto& hoverBitmap=*skin_.assets.patches.at("timeline.hover").bitmap;const auto hoverRgba=hoverBitmap.pixels[(hoverBitmap.height/2)*hoverBitmap.width+hoverBitmap.width/2];const auto hoverColor=gfx::rgba(hoverRgba&255,(hoverRgba>>8)&255,(hoverRgba>>16)&255,hoverRgba>>24);
    updatePaletteMouse({});auto hoverBase=renderHover();
    for(std::size_t index=0;index<samples.size();++index) {
      const auto point=uiPhysical(gfx::Rect(samples[index].x,samples[index].y,1,1)).origin();
      updatePaletteMouse(point+bounds().origin());auto target=renderHover();
      {os::SurfaceLock baseLock(hoverBase.get()),actualLock(target.get());
        for(std::size_t other=0;other<samples.size();++other) {
          const auto sample=gfx::Point(samples[other].x*uiScale,samples[other].y*uiScale);
          const auto expected=other==index?hoverColor:hoverBase->getPixel(sample.x,sample.y);
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
      const auto l=workspaceLayout(uiLogical(bounds()));const int x=l.workX+5,y=l.layerTop+timelineHeaderOffset();
      const int rows=std::min(timelineCapacity(l),count-layerScroll_);
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
        const int cols=timelineColumns(l);
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
          if(!timelineHorizontal_->bounds().contains(gfx::Point((x+130)*uiScale,(y+row*12)*uiScale)) && target->getPixel((x+130)*uiScale,(y+row*12)*uiScale)!=target->getPixel((x+130)*uiScale,(y+row*12-1)*uiScale))
            throw std::runtime_error("Unused timeline area has horizontal separators");
        for(int row=0;row<rows;++row)for(int dy=1;dy<12;++dy){
          const auto actual=layerAutoLinks_[row+layerScroll_]->bounds();const auto sample=gfx::Point(actual.x,actual.y+dy*uiScale);
          if(timelineRowViewport().contains(sample) && target->getPixel(sample.x,sample.y)!=ink)throw std::runtime_error("Layer auto-link separator missing");
        }
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
  void smokeSelectAllMigration(){
    smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;requestFocus();document=Document(4,2);document.beginStroke({0,0},0xff123456);document.commitStroke();document.markSaved();selectionTool_=false;eraser_=true;selectionPivot_=TransformPoint{1,1};selectionFreeTransform_=selectionPropertiesActive_=true;refresh();const auto allHistory=document.historySize();if(!menuCommands_.invoke("selectAll") || !selectionTool_ || eraser_ || selectionPivot_ || selectionFreeTransform_ || selectionPropertiesActive_ || !document.selection() || document.selection()->width!=4 || document.selection()->height!=2 || document.historySize()!=allHistory || document.dirty())throw std::runtime_error("Select all menu state without history");document.previewSelection(SelectionMask{0,0,1,1,{}});if(!document.nudgeSelectionContent(2,0))throw std::runtime_error("Select all pending setup");selectionTool_=false;ui::KeyMessage allKey(ui::kKeyDownMessage,ui::kKeyA,ui::kKeyCtrlModifier,0,0);onProcessMessage(&allKey);if(document.floating() || !selectionTool_ || document.pixels()[2]!=0xff123456 || !document.selection() || document.selection()->width!=4 || document.historySize()!=allHistory+1)throw std::runtime_error("CtrlA commits pending without selection history");document.undo();if(document.pixels()[0]!=0xff123456)throw std::runtime_error("Select all undo reaches pixel edit");
  }
  void smokeLayerContextProperties(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;setBounds(gfx::Rect(0,0,1280,960));document=Document(1,1);document.addLayer();document.addLayer();const auto layers=document.timeline().state().layers;document.selectTimelineLayer(layers[0].id);document.selectTimelineLayer(layers[1].id,1);document.selectLayer(layers[2].id);refresh();const auto selected=document.timelineSelection().layers;const auto history=document.historySize();prepareLayerContext(layers[0].id);if(document.timelineSelection().layers!=selected || document.layer().id!=layers[2].id || document.historySize()!=history)throw std::runtime_error("Layer context preserves selected members and activity");
    PixelMenu menu(skin_);buildLayerContextMenu(&menu,1);PixelMenuItem* properties=nullptr;for(auto child:menu.children())if(auto item=dynamic_cast<PixelMenuItem*>(child);item && item->icon=="properties")properties=item;if(!properties || !properties->isEnabled())throw std::runtime_error("Layer context properties enabled");document.selectTimelineLayer(layers[2].id);properties->Click();paletteInput_->setText("context batch");paletteInput_->Change();resolve(false);if(document.timeline().state().layers[0].name!=U"context batch" || document.timeline().state().layers[1].name!=U"context batch" || document.timeline().state().layers[2].name!=layers[2].name || document.historySize()!=history+1)throw std::runtime_error("Layer context frozen property targets");document.undo();if(document.timeline().state().layers[0].name!=layers[0].name || document.timeline().state().layers[1].name!=layers[1].name)throw std::runtime_error("Layer context property undo");document.redo();if(document.timeline().state().layers[0].name!=U"context batch" || document.timeline().state().layers[1].name!=U"context batch")throw std::runtime_error("Layer context property redo");prepareLayerContext(layers[0].id);if(document.timelineSelection().layers!=std::vector<std::string>{layers[0].id} || document.layer().id!=layers[0].id)throw std::runtime_error("Layer context replaces absent member");document=Document();refresh();
  }
  void smokeCurrentMigrationBatch(){ui::Manager::getDefault()->dispatchMessages();smokeTimelineGifDrop();smokeGradientMap();}
  void smokeTransformEnterHistory() {
    smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;setBounds(gfx::Rect(0,0,1280,960));requestFocus();
    auto key=[&](ui::KeyScancode code,ui::KeyModifiers modifiers=ui::kKeyNoneModifier){ui::KeyMessage event(ui::kKeyDownMessage,code,modifiers,0,0);onProcessMessage(&event);};
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
    const double outside=16.0/canvasScale();transformPointer(ui::kMouseDownMessage,14+outside,6-outside);if(transformHandle_!="rotate-ne")throw std::runtime_error("Selection rotation handle UI");const double cx=10,cy=9,radius=std::hypot(14+outside-cx,6-outside-cy),theta=std::atan2(6-outside-cy,14+outside-cx)+3.141592653589793/4;transformPointer(ui::kMouseMoveMessage,cx+radius*std::cos(theta),cy+radius*std::sin(theta),ui::kKeyShiftModifier);transformPointer(ui::kMouseUpMessage,cx+radius*std::cos(theta),cy+radius*std::sin(theta));if(document.floatingTransform()->angle!=45)throw std::runtime_error("Selection rotation45 snap UI");key(ui::kKeyEsc);selectionPropertiesActive_=true;refresh();selectionTransformFields_[2]->setText("-12");selectionTransformFields_[2]->Change();if(!document.floatingTransform()->flipHorizontal || document.floatingTransform()->width!=12)throw std::runtime_error("Selection signed property UI");selectionTransformFields_[4]->setText("23.4");selectionTransformFields_[4]->Change();if(std::abs(document.floatingTransform()->angle-23.4)>1e-8)throw std::runtime_error("Selection angle property UI");const auto committedTransformPixels=document.pixels();const auto committedTransformSelection=document.selection();key(ui::kKeyEnter);if(document.historySize()!=transformHistory+2 || document.floating() || document.selection() || document.pixels()!=committedTransformPixels)throw std::runtime_error("Selection transform confirmation history UI");document.undo();if(!selectionEqual(document.selection(),committedTransformSelection) || document.pixels()!=committedTransformPixels)throw std::runtime_error("Selection transform UI undo selection");document.undo();if(document.pixels()!=transformPixels || !selectionEqual(document.selection(),SelectionMask{6,6,8,6,{}}))throw std::runtime_error("Selection transform UI undo pixels");document.redo();if(document.pixels()!=committedTransformPixels || !selectionEqual(document.selection(),committedTransformSelection))throw std::runtime_error("Selection transform UI redo pixels");document.redo();if(document.selection() || document.pixels()!=committedTransformPixels)throw std::runtime_error("Selection transform UI redo");selectionPropertiesActive_=false;
    document=Document();refresh();
  }
  void smokeSelectionTools(){
    smokeSelectAllMigration();
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
    for(int kind=0;kind<5;++kind){useShapeTool(ShapeKind(kind));railSelected(kind==0?5:4);}
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
    const double outside=16.0/canvasScale();transformPointer(ui::kMouseDownMessage,14+outside,6-outside);if(transformHandle_!="rotate-ne")throw std::runtime_error("Selection rotation handle UI");const double cx=10,cy=9,radius=std::hypot(14+outside-cx,6-outside-cy),theta=std::atan2(6-outside-cy,14+outside-cx)+3.141592653589793/4;transformPointer(ui::kMouseMoveMessage,cx+radius*std::cos(theta),cy+radius*std::sin(theta),ui::kKeyShiftModifier);transformPointer(ui::kMouseUpMessage,cx+radius*std::cos(theta),cy+radius*std::sin(theta));if(document.floatingTransform()->angle!=45)throw std::runtime_error("Selection rotation45 snap UI");key(ui::kKeyEsc);selectionPropertiesActive_=true;refresh();selectionTransformFields_[2]->setText("-12");selectionTransformFields_[2]->Change();if(!document.floatingTransform()->flipHorizontal || document.floatingTransform()->width!=12)throw std::runtime_error("Selection signed property UI");selectionTransformFields_[4]->setText("23.4");selectionTransformFields_[4]->Change();if(std::abs(document.floatingTransform()->angle-23.4)>1e-8)throw std::runtime_error("Selection angle property UI");const auto committedTransformPixels=document.pixels();const auto committedTransformSelection=document.selection();key(ui::kKeyEnter);if(document.historySize()!=transformHistory+2 || document.floating() || document.selection() || document.pixels()!=committedTransformPixels)throw std::runtime_error("Selection transform confirmation history UI");document.undo();if(!selectionEqual(document.selection(),committedTransformSelection) || document.pixels()!=committedTransformPixels)throw std::runtime_error("Selection transform UI undo selection");document.undo();if(document.pixels()!=transformPixels || !selectionEqual(document.selection(),SelectionMask{6,6,8,6,{}}))throw std::runtime_error("Selection transform UI undo pixels");document.redo();if(document.pixels()!=committedTransformPixels || !selectionEqual(document.selection(),committedTransformSelection))throw std::runtime_error("Selection transform UI redo pixels");document.redo();if(document.selection() || document.pixels()!=committedTransformPixels)throw std::runtime_error("Selection transform UI redo");selectionPropertiesActive_=false;
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
    document=Document(48,48);document.beginStroke({18,18},0xff123456);document.commitStroke();document.commitSelection({},SelectionMask{10,10,20,20,{}});document.selectFrameHeader(document.frame().id);refresh();const auto trimFrames=document.selectedFrames();const auto trimHistory=document.historySize();shrinkSelectionToContent();if(document.selectedFrames()!=trimFrames)throw std::runtime_error("Shrink retains timeline selection");if(document.selection()->x!=18 || document.selection()->width!=1 || document.historySize()!=trimHistory+1)throw std::runtime_error("Shrink selection to actual selected content");document.undo();if(document.selection()->width!=20 || document.pixels()[18*48+18]!=0xff123456)throw std::runtime_error("Shrink history is view only");document.redo();refresh();selectionPivot_=TransformPoint{18.5,18.5};selectionPropertiesActive_=false;const auto noopTrimHistory=document.historySize();shrinkSelectionToContent();if(document.historySize()!=noopTrimHistory || !selectionPivot_ || selectionPivot_->x!=18.5 || selectionPivot_->y!=18.5 || selectionPropertiesActive_ || document.selectedFrames()!=trimFrames)throw std::runtime_error("Unchanged shrink preserves view state");document.undo();document.clearFrameSelection();refresh();
    startFreeSelectionTransform();selectionMode_=2;const auto freeHistory=document.historySize();transformPointer(ui::kMouseDownMessage,25,25,ui::kKeyShiftModifier);if(!floatingDragging_ || selectionDragging_)throw std::runtime_error("Free frame interior owns Shift and subtract mode");transformPointer(ui::kMouseMoveMessage,26,26,ui::kKeyShiftModifier);transformPointer(ui::kMouseUpMessage,26,26);key(ui::kKeyEsc);if(document.pixels()[18*48+18]!=0xff123456 || document.historySize()!=freeHistory)throw std::runtime_error("Free interior cancellation");selectionMode_=0;
    selectionPivotVisible_=true;showSelectionPivotPopup();const auto presetExpected=selectionPivotPreset(*selectionTransformTarget(),0);if(!selectionPivot_ || selectionPivot_->x!=presetExpected.x || selectionPivot_->y!=presetExpected.y)throw std::runtime_error("Pivot popup preset callback");
    selectionKind_=0;selectionTool_=false;wandSource_.reset();refresh();
    document=Document(4,3);homeOpen_=false;documentOpen_=true;paletteFocused_=false;fitCanvas();refresh();fillOptions_={};ink_=0xff123456;key(ui::kKeyG);if(!fillTool_ || fillToleranceInput_->hasFlags(ui::HIDDEN) || !brushOpacityInput_->hasFlags(ui::HIDDEN))throw std::runtime_error("Bucket tool/property UI tool="+std::to_string(fillTool_)+" tolerance="+std::to_string(fillToleranceInput_->isVisible())+" opacity="+std::to_string(brushOpacityInput_->isVisible()));pointer(ui::kMouseDownMessage,1,1);if(!fillDragging_ || document.historySize()!=1 || document.pixels()[0]!=ink_)throw std::runtime_error("Bucket commits on press");pointer(ui::kMouseMoveMessage,3,2);key(ui::kKeyEsc);if(fillDragging_ || document.pixels()[0]!=0 || !document.canRedo())throw std::runtime_error("Bucket cancel undoes committed fill");pointer(ui::kMouseDownMessage,1,1,true);pointer(ui::kMouseUpMessage,1,1,true);if(document.pixels()[0]!=document.palette().secondary || fillDragging_)throw std::runtime_error("Bucket background/release UI");fillContiguousButton_->Click();if(fillOptions_.contiguous || !fillGapButton_->hasFlags(ui::HIDDEN))throw std::runtime_error("Bucket global property UI");fillToleranceInput_->setText("300");fillToleranceInput_->Change();if(fillOptions_.tolerance!=255)throw std::runtime_error("Bucket tolerance clamp UI");key(ui::kKeyB);if(fillTool_)throw std::runtime_error("Bucket exit tool UI");fillOptions_={};
    document=Document(5,3);fitCanvas();refresh();gradientSpec_={};gradientOptions_={};gradientConfirm_=true;gradientFreeform_=false;ink_=0xff0000ff;document.setPaletteRole(ink_,false,true);document.setPaletteRole(0xffff0000,true,true);key(ui::kKeyG,ui::kKeyShiftModifier);if(!gradientTool_ || gradientTolerance_->hasFlags(ui::HIDDEN) || !fillToleranceInput_->hasFlags(ui::HIDDEN))throw std::runtime_error("Gradient tool/property UI");pointer(ui::kMouseDownMessage,0,0);pointer(ui::kMouseMoveMessage,4,0);pointer(ui::kMouseUpMessage,4,0);if(!gradientPending_ || document.dirty() || document.historySize()!=0 || (*document.gradientPreviewPixels())[2]!=0xff800080)throw std::runtime_error("Gradient confirmation preview UI");document.setPaletteRole(0xff00ff00,true,true);gradientTick();if((*document.gradientPreviewPixels())[4]!=0xff00ff00 || document.dirty())throw std::runtime_error("Pending gradient color refresh");key(ui::kKeyB);if(!gradientTool_ || !gradientPending_)throw std::runtime_error("Gradient pending tool lock");key(ui::kKeyEsc);if(document.gradientActive() || document.dirty() || gradientPending_)throw std::runtime_error("Gradient preview Escape");pointer(ui::kMouseDownMessage,0,0,true);pointer(ui::kMouseMoveMessage,4,0,true);pointer(ui::kMouseUpMessage,4,0,true);key(ui::kKeyEnter);if(document.historySize()!=1 || document.pixels()[0]!=0xff00ff00 || document.pixels()[4]!=0xff0000ff)throw std::runtime_error("Gradient reverse/apply single UI edit");document.undo();if(document.pixels()[0]!=0)throw std::runtime_error("Gradient UI undo");gradientConfirm_=false;key(ui::kKeyB);gradientSpec_={};gradientOptions_={};
    document=Document(8,6);shapeSpec_={};fitCanvas();refresh();shapeRounded_=shapeRatio_=false;brushProfiles_[0]={1,100,BrushShape::Round};document.setPaletteRole(0xff0000ff,false,true);document.setPaletteRole(0xff00ff00,true,true);refresh();key(ui::kKeyU);if(!shapeTool_ || !shapeModeButton_->hasFlags(ui::HIDDEN) || !brushOpacityInput_->hasFlags(ui::HIDDEN))throw std::runtime_error("Shape tool properties");pointer(ui::kMouseDownMessage,1,1);pointer(ui::kMouseMoveMessage,3,3);shapeTick();if(document.dirty() || document.historySize()!=0 || (*document.gradientPreviewPixels())[2*8+2]!=0xff0000ff)throw std::runtime_error("Shape independent preview UI");key(ui::kKeyEsc);if(document.shapeActive() || document.dirty())throw std::runtime_error("Shape Escape UI");pointer(ui::kMouseDownMessage,1,1,true);pointer(ui::kMouseMoveMessage,3,3,true);pointer(ui::kMouseUpMessage,3,3,true);if(document.historySize()!=1 || document.pixels()[2*8+2]!=0xff0000ff)throw std::runtime_error("Shape actual legacy right-button fallback");document.undo();useShapeTool(ShapeKind::Line);pointer(ui::kMouseDownMessage,0,0,true);pointer(ui::kMouseMoveMessage,7,2,true);pointer(ui::kMouseUpMessage,7,2,true);if(document.pixels()[0]!=0xff00ff00 || document.pixels()[2*8+7]!=0xff00ff00 || document.historySize()!=1)throw std::runtime_error("Line right-button/one history UI");document.undo();useShapeTool(ShapeKind::RectangleOutline);brushSizeInput_->setText("2");brushSizeInput_->Change();if(brushProfiles_[0].size!=2 || brushSizeInput_->hasFlags(ui::HIDDEN))throw std::runtime_error("Shape outline width property");key(ui::kKeyB);if(shapeTool_)throw std::runtime_error("Shape tool exit");brushProfiles_[0]={};shapeSpec_={};shapeRounded_=shapeRatio_=false;


  }
  void smokeImageBrush(){smoke_=true;document=Document(3,1);homeOpen_=false;documentOpen_=true;PatternBrush b;b.width=2;b.height=1;b.coverage={255,255};b.colors={0x800000ff,0xff00ff00};document.beginStroke({1,0},0xffffffff,{},&b);if(document.pixels()[0]!=b.colors[0] || document.pixels()[1]!=b.colors[1])throw std::runtime_error("Image brush actual RGBA stamp");document.cancelStroke();if(document.historySize()!=0 || document.dirty() || document.pixels()[0])throw std::runtime_error("Image brush cancel");ProjectBrushResource resource;resource.metadata.id="smoke-project-brush";resource.metadata.name="smoke";resource.metadata.width=2;resource.metadata.height=1;resource.brush=b;document.setImportedProjectBrushes({resource});selectFillLibraryBrush("project:smoke-project-brush",false,false);if(fillPattern_.brushes.size()!=1||fillPattern_.brushes[0].colors!=b.colors)throw std::runtime_error("Project brush UI selection");pencilImageBrushId_="project:smoke-project-brush";resolvePencilImageBrush();if(!pencilImageBrush_)throw std::runtime_error("Pencil project resource selection");brushProfiles_[0]={};eraser_=false;handTool_=selectionTool_=eyedropperTool_=gradientTool_=shapeTool_=false;fillTool_=false;smoke_=true;setBounds(gfx::Rect(0,0,1280,960));fitCanvas();refresh();auto at=gfx::Point(canvas_.x+int(1.5*canvasScale()),canvas_.y+int(.5*canvasScale()));ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,at);onProcessMessage(&down);enableFlags(ui::HAS_CAPTURE);ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,at);onProcessMessage(&up);disableFlags(ui::HAS_CAPTURE);if(document.pixels()[0]!=b.colors[0]||document.pixels()[1]!=b.colors[1]||document.historySize()!=1)throw std::runtime_error("Image brush pointer stroke");document.undo();if(document.pixels()[0]!=0)throw std::runtime_error("Image brush pointer undo");fillLibrarySelection_={};fillPattern_.brushes.clear();pencilImageBrushId_.clear();pencilImageBrush_.reset();document=Document(4,2);document.beginStroke({1,0},0x80332211);document.commitStroke();document.previewSelection(SelectionMask{1,0,2,2,{1,0,1,1}});refresh();auto captureHistory=document.historySize();if(!menuCommands_.invoke("createBrushFromSelection") || document.selection() || !pencilImageBrush_ || pencilImageBrush_->sourceX!=1 || pencilImageBrush_->colors!=std::vector<Pixel>({0x80332211,0,0,0}) || selectionTool_ || fillTool_ || document.historySize()!=captureHistory)throw std::runtime_error("Selection brush menu saves and activates pencil");PatternBrushLibrary captureLibrary(fillBrushLibraryDirectory().parent_path().parent_path()/"pattern-brush-library-fixture");auto captures=captureLibrary.list();auto capturedItem=std::find_if(captures.brushes.begin(),captures.brushes.end(),[this](const auto& item){return item.id==pencilImageBrushId_;});if(capturedItem==captures.brushes.end() || capturedItem->sourceX!=1 || importPatternBrush(std::filesystem::u8path(capturedItem->filePath)).brush.colors!=pencilImageBrush_->colors)throw std::runtime_error("Selection brush saved PNG metadata");auto capturedId=pencilImageBrushId_;document.previewSelection(SelectionMask{0,1,4,1,{}});refresh();menuCommands_.invoke("createBrushFromSelection");if(!document.selection() || pencilImageBrushId_!=capturedId || document.historySize()!=captureHistory)throw std::runtime_error("Empty selection brush preserves state");pencilImageBrushId_.clear();pencilImageBrush_.reset();document=Document();refresh();}
  void observeModifierRelease(ui::Message* msg){
    if(msg->type()!=ui::kKeyUpMessage)return;
    brushPreviewShift_=msg->shiftPressed();invalidateRect(canvasViewport());
    if(!msg->altPressed()){eyedropperHeld_=false;paletteSamplingHeld_=false;}
    if(static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeySpace)spaceHeld_=false;
    if(modifierBrushSize_ && !modifierBrushSize_->pressed && (!(msg->ctrlPressed() || msg->cmdPressed()) || !msg->altPressed()))finishModifierBrushSize();
    selectionShift_=msg->shiftPressed();selectionCtrl_=msg->ctrlPressed() || msg->cmdPressed();updateNavigationCursor();
  }
  void smokeBrushPreview(){
    smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(16,12);documentOpen_=true;homeOpen_=false;pending_=Pending::None;
    selectionTool_=shapeTool_=gradientTool_=fillTool_=handTool_=zoomTool_=eyedropperTool_=eraser_=spaceHeld_=eyedropperHeld_=false;playing_=false;brushPreviewShift_=false;
    pencilImageBrush_.reset();brushProfiles_[0]={3,50,BrushShape::Square};ink_=0xff0000ff;fitCanvas();refresh();
    auto point=[&](int x,int y){return gfx::Point(canvas_.x+int((x+.5)*canvasScale()),canvas_.y+int((y+.5)*canvasScale()));};
    auto render=[&](){auto image=os::instance()->makeRgbaSurface(bounds().w,bounds().h);ui::Graphics g(image);ensureContentCache();paintCanvas(g);return image;};
    auto same=[](const os::SurfaceRef& a,const os::SurfaceRef& b){for(int y=0;y<a->height();++y)for(int x=0;x<a->width();++x)if(a->getPixel(x,y)!=b->getPixel(x,y))return false;return true;};
    updatePaletteMouse({});auto base=render();const auto uploads=renderer_.uploads();const auto history=document.historySize(),revision=document.contentRevision();const auto pixels=document.pixels();
    updatePaletteMouse(point(6,5));auto preview=render();if(same(base,preview) || document.pixels()!=pixels || document.historySize()!=history || document.contentRevision()!=revision || document.dirty() || renderer_.uploads()!=uploads)throw std::runtime_error("Hover preview missing or mutates document/cache");
    writeSmokeFrame(preview.get(),std::filesystem::path("build")/"brush-preview-smoke.bmp");
    updatePaletteMouse({});if(!same(base,render()))throw std::runtime_error("Preview leaves a trail on pointer exit");
    updatePaletteMouse(point(6,5));spaceHeld_=true;if(!same(base,render()))throw std::runtime_error("Pan did not suppress preview");spaceHeld_=false;
    eyedropperHeld_=true;if(!same(base,render()))throw std::runtime_error("Sampling did not suppress preview");eyedropperHeld_=false;
    document.beginStroke({6,5},ink_,brushProfiles_[0]);auto drawing=render();updatePaletteMouse({});if(!same(drawing,render()))throw std::runtime_error("Drawing pencil overlays translucent paint twice");document.cancelStroke();
    eraser_=true;brushProfiles_[1]={3,100,BrushShape::Round};updatePaletteMouse(point(0,0));if(same(base,render()))throw std::runtime_error("Eraser outline missing at canvas edge");eraser_=false;
    brushPreviewShift_=true;brushLineAnchors_[0]=BrushLineAnchor{{2,2},document.identity(),document.revision(),document.layer().id,document.frame().id,{},false};updatePaletteMouse(point(12,7));auto line=render();brushPreviewShift_=false;if(same(line,render()))throw std::runtime_error("Shift connected line preview missing");
    brushLineAnchors_[0].reset();updatePaletteMouse({});
  }
  void smokeModifiers(){
    smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(32,24);homeOpen_=false;documentOpen_=true;paletteFocused_=false;requestFocus();fitCanvas();refresh();
    auto check=[](bool ok,const char* text){if(!ok)throw std::runtime_error(text);};
    auto key=[&](ui::MessageType type,ui::KeyScancode code,ui::KeyModifiers mods=ui::kKeyNoneModifier){ui::KeyMessage e(type,code,mods,0,0);onProcessMessage(&e);};
    auto pointer=[&](ui::MessageType type,gfx::Point at,ui::KeyModifiers mods=ui::kKeyNoneModifier,ui::MouseButton button=ui::kButtonLeft){ui::MouseMessage e(type,os::PointerType::Mouse,button,mods,at);onProcessMessage(&e);if(type==ui::kMouseDownMessage && (document.active() || modifierBrushSize_ || gradientDragging_ || shapeDragging_ || floatingDragging_ || selectionDragging_))enableFlags(ui::HAS_CAPTURE);if(type==ui::kMouseUpMessage)disableFlags(ui::HAS_CAPTURE);};
    auto point=[&](int x,int y){return gfx::Point(canvas_.x+int((x+.5)*canvasScale()),canvas_.y+int((y+.5)*canvasScale()));};
    const auto ca=ui::KeyModifiers(ui::kKeyCtrlModifier|ui::kKeyAltModifier),cs=ui::KeyModifiers(ui::kKeyCtrlModifier|ui::kKeyShiftModifier);
    key(ui::kKeyDownMessage,ui::kKeyB);brushProfiles_[0].size=4;const auto origin=point(8,8);const auto before=document.pixels();const auto history=document.historySize();const double zoom=zoom_;
    pointer(ui::kMouseMoveMessage,origin,ca);pointer(ui::kMouseMoveMessage,origin+gfx::Point(16*uiScale,0),ca);check(brushProfiles_[0].size==8 && !document.active() && !eyedropperGesture_.active(),"CtrlAlt hover resize must not paint or sample");
    key(ui::kKeyUpMessage,ui::kKeyAlt,ui::kKeyCtrlModifier);check(!modifierBrushSize_ && !eyedropperHeld_,"CtrlAlt release clears sizing and sampling");
    pointer(ui::kMouseDownMessage,origin,ca);pointer(ui::kMouseMoveMessage,origin+gfx::Point(-8*uiScale,0));pointer(ui::kMouseUpMessage,origin+gfx::Point(-8*uiScale,0));check(brushProfiles_[0].size==6 && !modifierBrushSize_,"Captured brush resize survives modifier release");
    ui::MouseMessage wheel(ui::kMouseWheelMessage,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyCtrlModifier,origin,gfx::Point(0,-1));onProcessMessage(&wheel);check(brushProfiles_[0].size==7 && zoom_==zoom,"Ctrl wheel must resize without zoom");
    check(document.pixels()==before && document.historySize()==history && !document.dirty(),"Brush sizing must not change artwork/history");
    key(ui::kKeyDownMessage,ui::kKeyE,ui::kKeyAltModifier);check(!eraser_,"Modified tool key must not switch tool");
    pointer(ui::kMouseMoveMessage,origin,ca);ui::Message blur(ui::kFocusLeaveMessage);onProcessMessage(&blur);check(!modifierBrushSize_ && !spaceHeld_ && !eyedropperHeld_,"Blur must release modifiers");requestFocus();
    key(ui::kKeyDownMessage,ui::kKey3,ui::kKeyCtrlModifier);check(brushProfiles_[0].shape==BrushShape::Line,"Ctrl3 must set pencil brush shape");key(ui::kKeyDownMessage,ui::kKeyClosebrace);check(brushProfiles_[0].size==8,"Pencil bracket size shortcut");
    key(ui::kKeyDownMessage,ui::kKeyE);key(ui::kKeyDownMessage,ui::kKey2,ui::kKeyCtrlModifier);check(eraser_ && brushProfiles_[1].shape==BrushShape::Square,"Ctrl2 must set eraser profile");key(ui::kKeyDownMessage,ui::kKeyB);
    key(ui::kKeyDownMessage,ui::kKeyAlt,ca);check(!eyedropperHeld_,"CtrlAlt does not select sampler");key(ui::kKeyUpMessage,ui::kKeyLControl,ui::kKeyAltModifier);check(eyedropperHeld_,"Alt sampler resumes after Ctrl release");key(ui::kKeyUpMessage,ui::kKeyAlt);
    brushProfiles_[0]={1,50,BrushShape::Round};document.setPaletteRole(0xff0000ff,false,true);refresh();const auto a=point(1,1),b=point(5,1);
    pointer(ui::kMouseDownMessage,a);pointer(ui::kMouseUpMessage,a);const auto first=document.pixels()[33];pointer(ui::kMouseDownMessage,b,ui::kKeyShiftModifier);pointer(ui::kMouseUpMessage,b,ui::kKeyShiftModifier);
    check(document.pixels()[33]==first && document.pixels()[35]==first && document.historySize()==history+1,"Shift connection must reuse alpha baseline and merge anchor stroke");document.undo();check(document.pixels()[35]==0 && document.pixels()[33]==0,"Shift connection undo restores merged anchor stroke");
    document=Document(32,24);brushLineAnchors_[0].reset();brushProfiles_[0]={};fitCanvas();refresh();pointer(ui::kMouseDownMessage,point(1,1));pointer(ui::kMouseUpMessage,point(1,1));pointer(ui::kMouseDownMessage,point(6,3),cs);pointer(ui::kMouseUpMessage,point(6,3),cs);check(document.pixels()[1*32+6]!=0 && document.pixels()[3*32+6]==0,"CtrlShift constrains connection endpoint");
    document=Document(32,24);useGradientTool();gradientSpec_={};gradientSpec_.radial=false;gradientConfirm_=true;pointer(ui::kMouseDownMessage,point(2,2));pointer(ui::kMouseMoveMessage,point(9,5));key(ui::kKeyDownMessage,ui::kKeyLShift,ui::kKeyShiftModifier);const auto constrained=constrainGradientEndpoint({2,2},{9,5});check(std::abs(gradientSpec_.end.x-constrained.x)<1e-8 && std::abs(gradientSpec_.end.y-constrained.y)<1e-8,"Gradient Shift updates without mouse movement");key(ui::kKeyUpMessage,ui::kKeyLShift);check(gradientSpec_.end.y==5,"Gradient release restores unconstrained endpoint");key(ui::kKeyDownMessage,ui::kKeyEsc);check(!gradientDragging_ && !document.dirty(),"Gradient modifier preview Escape cancels");
    document=Document(8,8);useSelectionTool(0);document.commitSelection({},SelectionMask{1,1,2,2,{}});refresh();key(ui::kKeyDownMessage,ui::kKeyI,cs);check(pending_==Pending::None && document.selection() && !selectionContains(document.selection(),1,1) && selectionContains(document.selection(),0,0),"CtrlShiftI must invert selection instead of importing");
    document=Document();brushProfiles_[0]={};gradientConfirm_=false;selectionTool_=false;refresh();
  }
  void smokeSamplingAndZoom(const std::filesystem::path& directory){
    smoke_=true;smokeEyedropper();homeOpen_=false;documentOpen_=true;paletteFocused_=false;document=Document(32,32);fitCanvas();refresh();
    int check=0;auto require=[&](bool value){++check;if(!value)throw std::runtime_error("Legacy sampling/zoom tool regression check="+std::to_string(check));};
    require(toolRail_[9]->isEnabled() && toolRail_[11]->isEnabled());
    toolRail_[9]->Click();require(eyedropperTool_ && activeRailTool()=="eyedropper");
    toolRail_[11]->Click();require(zoomTool_ && !eyedropperTool_ && activeRailTool()=="zoom");
    auto pointer=[&](ui::MessageType type,ui::MouseButton button,gfx::Point at){ui::MouseMessage msg(type,os::PointerType::Mouse,button,ui::kKeyNoneModifier,at);onProcessMessage(&msg);if(type==ui::kMouseDownMessage)enableFlags(ui::HAS_CAPTURE);else if(type==ui::kMouseUpMessage)disableFlags(ui::HAS_CAPTURE);};
    const auto anchor=canvasViewport().center();const auto pixels=document.pixels();const auto history=document.historySize();
    const double start=zoom_;pointer(ui::kMouseDownMessage,ui::kButtonLeft,anchor);require(zoomDragging_ && std::string(cursorAt(gfx::Point(-100,-100)))=="zoom");pointer(ui::kMouseUpMessage,ui::kButtonLeft,anchor);require(!zoomDragging_ && zoom_==nextCanvasScale(start,1));
    pointer(ui::kMouseDownMessage,ui::kButtonRight,anchor);pointer(ui::kMouseUpMessage,ui::kButtonRight,anchor);require(zoom_==start);
    zoomSmooth_=false;pointer(ui::kMouseDownMessage,ui::kButtonLeft,anchor);pointer(ui::kMouseMoveMessage,ui::kButtonLeft,anchor+gfx::Point(48*uiScale,0));require(zoom_==nextCanvasScale(nextCanvasScale(start,1),1));pointer(ui::kMouseMoveMessage,ui::kButtonLeft,anchor);require(zoom_==start);pointer(ui::kMouseUpMessage,ui::kButtonLeft,anchor+gfx::Point(0,4*uiScale));require(zoom_==start);
    require(canvasZoomDragTarget(8,23,false,false)==8 && canvasZoomDragTarget(8,-24,false,false)==6 && canvasZoomDragTarget(8,96,true,false)==16 && canvasZoomDragTarget(8,23,true,true)==8);
    ui::KeyMessage pencil(ui::kKeyDownMessage,ui::kKeyB,ui::kKeyNoneModifier,0,0);onProcessMessage(&pencil);require(!zoomTool_ && !eyedropperTool_);
    ui::KeyMessage zoom(ui::kKeyDownMessage,ui::kKeyZ,ui::kKeyNoneModifier,0,0);onProcessMessage(&zoom);require(zoomTool_);
    pointer(ui::kMouseDownMessage,ui::kButtonLeft,anchor);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);require(!zoomDragging_);
    require(document.pixels()==pixels && document.historySize()==history && !document.dirty());
    toolRail_[9]->Click();pointer(ui::kMouseDownMessage,ui::kButtonLeft,anchor);require(eyedropperLensSurface_ && eyedropperGesture_.active());
    auto surface=os::instance()->makeRgbaSurface(bounds().w,bounds().h);{ui::Graphics g(surface);ui::PaintEvent event(this,&g);onPaint(event);}writeSmokeFrame(surface.get(),directory/"sampling-zoom-smoke.bmp");
    pointer(ui::kMouseUpMessage,ui::kButtonLeft,anchor);require(!eyedropperLensSurface_ && !eyedropperGesture_.active() && !document.dirty());
  }
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
    replaceScope_="document";replacePreview_=false;selectionTool_=true;shapeTool_=gradientTool_=fillTool_=handTool_=eraser_=eyedropperTool_=false;zoomTool_=false;openReplaceColor();beginReplaceSampling(1);eyedropperGesture_.begin(false,false);sampleEyedropperAt({0,0});finishEyedropper();if(replaceDestination_!=pixels[0] || pending_!=Pending::ReplaceColor || replaceSampling_!=-1 || !selectionTool_ || eyedropperTool_ || document.pixels()!=pixels)throw std::runtime_error("Replacement target sample returns modal/tool");beginReplaceSampling(0);eyedropperGesture_.begin(false,false);sampleEyedropperAt({1,0});ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(replaceSource_!=0 || pending_!=Pending::ReplaceColor || replaceSampling_!=-1 || !selectionTool_)throw std::runtime_error("Replacement sampling Escape returns modal");resolve(false);document=Document();selectionTool_=false;refresh();
  }
  void smokeColorReplacement(){
    smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(2,1);homeOpen_=false;documentOpen_=true;document.beginStroke({0,0},0x801e140a);document.commitStroke();document.markSaved();const auto pixels=document.pixels();const auto h=document.historySize();refresh();replaceLoaded_=true;replaceRemember_=true;replaceScope_="document";replaceSource_=pixels[0];replaceDestination_=0x01020304;replacePreview_=false;openReplaceColor();if(document.displayPixels()!=pixels)throw std::runtime_error("Replacement default preview off");replacePreview_=true;previewReplace();if(document.pixels()!=pixels || document.dirty() || document.displayPixels()[0]!=replaceDestination_)throw std::runtime_error("Replacement independent preview");resolve(false);if(document.historySize()!=h || document.pixels()!=pixels)throw std::runtime_error("Replacement cancel");openReplaceColor();resolve(true);if(document.historySize()!=h+1 || document.pixels()[0]!=replaceDestination_)throw std::runtime_error("Replacement apply");document.undo();if(document.pixels()!=pixels)throw std::runtime_error("Replacement undo");document=Document();refresh();
  }
  void smokeGifExport(){smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(2,1);homeOpen_=false;documentOpen_=true;refresh();const auto revision=document.revision(),h=document.historySize();openGifExport();if(pending_!=Pending::GifExport || gifInputs_[0]->hasFlags(ui::HIDDEN) || gifOptions_.scalePercent!=100 || gifOptions_.direction!=GifDirection::Forward || gifOptions_.trim || gifExplicitRange_)throw std::runtime_error("GIF defaults/modal");gifInputs_[0]->setText("200");gifInputs_[0]->Change();auto out=encodeAnimationGif(document,gifOptions_);if(out.width!=4 || out.height!=2)throw std::runtime_error("GIF modal scale");resolve(false);if(document.revision()!=revision || document.historySize()!=h || document.dirty())throw std::runtime_error("GIF cancel mutation");document=Document();refresh();}
  void smokeDeselectPending(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;paletteFocused_=false;playing_=false;document=Document(4,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.commitSelection({},SelectionMask{0,0,1,1,{}});const auto history=document.historySize();if(!document.nudgeSelectionContent(2,0))throw std::runtime_error("Deselect pending fixture");refresh();if(!menuCommands_.invoke("deselect") || document.floating() || !document.selection() || document.selection()->x!=2 || document.pixels()[2]!=0xff123456 || document.historySize()!=history+1)throw std::runtime_error("Deselect menu commits pending and retains selection");document.undo();if(!document.selection() || document.selection()->x!=0 || document.pixels()[0]!=0xff123456)throw std::runtime_error("Deselect pending undo");document.redo();requestFocus();ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyD,ui::kKeyCtrlModifier,0,0);onProcessMessage(&key);if(document.selection())throw std::runtime_error("Deselect next CtrlD clears selection");document=Document();refresh();
  }
  void smokeSelectionEnter(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;paletteFocused_=false;docking_=panels::Model{};layersPanelOpen_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(2,1);document.addFrame();document.commitSelection({},SelectionMask{0,0,1,1,{}});refresh();requestFocus();
    auto key=[&](int repeat=0){ui::KeyMessage message(ui::kKeyDownMessage,ui::kKeyEnter,ui::kKeyNoneModifier,0,repeat);onProcessMessage(&message);};auto revision=document.revision();key();if(document.selection() || playing_ || document.revision()!=revision+1)throw std::runtime_error("Enter completes ordinary selection before playback");document.undo();if(!document.selection())throw std::runtime_error("Enter selection completion undo");document.commitSelection(document.selection(),{});SelectionClipboard clipboard;clipboard.width=1;clipboard.height=1;clipboard.pixels={0xffabcdef};clipboard.mask={1};if(!document.beginFloatingPaste(clipboard,1,0))throw std::runtime_error("Enter floating fixture");refresh();key();if(document.floating() || document.selection() || playing_ || document.pixels()[1]!=0xffabcdef)throw std::runtime_error("Enter commits paste and completes selection");document.undo();if(!document.selection() || document.pixels()[1]!=0xffabcdef)throw std::runtime_error("Enter completion separate undo");document.undo();if(document.pixels()[1])throw std::runtime_error("Enter paste undo");document=Document(1,1);document.addFrame();refresh();requestFocus();key(1);if(playing_)throw std::runtime_error("Enter playback repeat suppressed");layersPanelOpen_=false;refresh();key();if(playing_)throw std::runtime_error("Enter hidden timeline playback blocked");layersPanelOpen_=true;refresh();paletteInput_->setVisible(true);paletteInput_->requestFocus();key();if(playing_)throw std::runtime_error("Enter Entry playback blocked");paletteInput_->setVisible(false);requestFocus();key();if(!playing_)throw std::runtime_error("Enter starts animation without selection");key();if(playing_)throw std::runtime_error("Enter pauses animation");document=Document();refresh();requestFocus();key();if(playing_)throw std::runtime_error("Enter single frame playback blocked");document=Document();refresh();
  }
  void smokeTimelineDeleteShortcut(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;paletteFocused_=false;docking_=panels::Model{};layersPanelOpen_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(2,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.beginStroke({1,0},0xffabcdef);document.commitStroke();document.addFrame();document.selectFrame(document.timeline().state().frames.front().id);document.selectTimelineCel(document.cel().id);document.commitSelection({},SelectionMask{0,0,1,1,{}});refresh();requestFocus();auto history=document.historySize();
    auto key=[&](int repeat=0){ui::KeyMessage message(ui::kKeyDownMessage,ui::kKeyC,ui::kKeyAltModifier,0,repeat);onProcessMessage(&message);};key();if(document.timeline().state().frames.size()!=2 || document.pixels()[0] || document.pixels()[1] || !document.selection() || document.historySize()!=history+1)throw std::runtime_error("AltC explicit full Cel ignores pixel mask");document.undo();document.clearTimelineSelection();history=document.historySize();key(1);if(document.historySize()!=history)throw std::runtime_error("AltC repeat suppressed");layersPanelOpen_=false;refresh();key();if(document.historySize()!=history)throw std::runtime_error("AltC hidden timeline blocked");layersPanelOpen_=true;refresh();paletteInput_->setVisible(true);paletteInput_->requestFocus();key();if(document.historySize()!=history)throw std::runtime_error("AltC Entry priority");paletteInput_->setVisible(false);requestFocus();const auto frameRevision=document.revision();key();if(document.timeline().state().frames.size()!=1 || document.selection() || document.revision()!=frameRevision+1)throw std::runtime_error("AltC active frame clears pixel selection");document.undo();if(document.timeline().state().frames.size()!=2)throw std::runtime_error("AltC frame single undo");document.selectFrameHeader(document.timeline().state().frames.front().id);document.selectFrameHeader(document.timeline().state().frames.back().id,2);contextFrameId_=document.frame().id;refresh();{PixelMenu menu(skin_);buildLayerContextMenu(&menu,2);auto item=dynamic_cast<PixelMenuItem*>(menu.children().back());if(!item || !item->isEnabled())throw std::runtime_error("All-selected frame delete context enabled");item->Click();}if(document.timeline().state().frames.size()!=1)throw std::runtime_error("All-selected context delete leaves one");document=Document();frameSelectionExplicit_=false;refresh();
  }
  void smokeLoopTrack(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;docking_=panels::Model{};layersPanelOpen_=true;document=Document(1,1);for(int n=0;n<7;++n)document.addFrame();const auto frames=document.timeline().state().frames;document.createLoopSection(timeline::LoopSection{{},U"Outer",frames[0].id,frames[7].id});const auto outer=document.timeline().state().loopSections.back().id;document.createLoopSection(timeline::LoopSection{{},U"Child",frames[1].id,frames[3].id});const auto child=document.timeline().state().loopSections.back().id;document.selectFrame(frames[0].id);frameScroll_=frameScrollRemainder_=0;setBounds(gfx::Rect(0,0,1280,960));refresh();if(loopTrackHeight()!=40 || timelineFrameViewport(true).y!=loopTrackViewport().y2())throw std::runtime_error("Loop track and frame header geometry disagree");for(const auto* slot:{"timeline.loop.track","timeline.loop.normal","timeline.loop.hover","timeline.loop.playing"})if(!skin_.assets.patches.count(slot))throw std::runtime_error("Loop replaceable sheet material missing");
    auto item=[&](const std::string& id){for(const auto& value:loopTrackLayout().items)if(value.id==id)return value;throw std::runtime_error("Loop layout target missing");};auto send=[&](ui::MessageType type,gfx::Point point){ui::MouseMessage message(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);onProcessMessage(&message);};
    auto box=loopTrackItemBounds(item(child));const auto history=document.historySize();send(ui::kMouseDownMessage,{box.x+box.w/2,box.y+2*uiScale});if(pending_!=Pending::LoopSection || !loopDraft_ || loopDraft_->id!=child)throw std::runtime_error("Loop body click opens exact properties");resolve(false);if(document.historySize()!=history)throw std::runtime_error("Loop click cancel history");box=loopTrackItemBounds(item(child));send(ui::kDoubleClickMessage,{box.x+box.w/2,box.y+2*uiScale});if(pending_!=Pending::LoopSection)throw std::runtime_error("Loop double click properties");resolve(false);
    box=loopTrackItemBounds(item(child));const auto edge=gfx::Point(box.x2()-2*uiScale,box.y+15*uiScale);if(loopTrackHit(edge).edge!=2 || std::string(cursorAt(edge))!="ew-resize")throw std::runtime_error("Loop end edge hit/cursor");send(ui::kMouseDownMessage,edge);if(!loopTrackDrag_ || !hasCapture()){std::ostringstream detail;detail<<"Loop edge captures mouse: drag="<<bool(loopTrackDrag_)<<" capture="<<hasCapture()<<" owner="<<(manager()?manager()->getCapture():nullptr)<<" editor="<<this<<" pending="<<int(pending_)<<" hit="<<loopTrackHit(edge).id<<":"<<loopTrackHit(edge).edge<<" point="<<edge.x<<","<<edge.y<<" focus="<<hasFocus();throw std::runtime_error(detail.str());}const auto target=gfx::Point(loopTrackViewport().x+6*12*uiScale,edge.y);send(ui::kMouseUpMessage,target);if(loopTrackDrag_ || hasCapture() || document.historySize()!=history+1 || timeline::loopRange(document.timeline().state(),*playbackSection(child)).end!=5)throw std::runtime_error("Loop release final pointer commits once");document.undo();if(timeline::loopRange(document.timeline().state(),*playbackSection(child)).end!=3)throw std::runtime_error("Loop resize undo");document.redo();
    box=loopTrackItemBounds(item(child));const auto start=gfx::Point(box.x+uiScale,box.y+15*uiScale);auto revision=document.revision();send(ui::kMouseDownMessage,start);send(ui::kMouseMoveMessage,{box.x+12*uiScale,start.y});if(document.revision()!=revision)throw std::runtime_error("Loop preview mutates document");ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(loopTrackDrag_ || document.revision()!=revision)throw std::runtime_error("Loop Escape cancels preview");send(ui::kMouseDownMessage,start);ui::Message blur(ui::kFocusLeaveMessage);onProcessMessage(&blur);if(loopTrackDrag_ || hasCapture() || document.revision()!=revision)throw std::runtime_error("Loop blur cancels preview");send(ui::kMouseDownMessage,start);releaseMouse();send(ui::kMouseMoveMessage,start);if(loopTrackDrag_ || document.revision()!=revision)throw std::runtime_error("Loop capture loss cancels preview");
    {PixelMenu menu(skin_);buildLoopTrackMenu(menu,child);static_cast<PixelMenuItem*>(menu.children()[0])->Click();if(!playing_ || loopPlayback_.current.sectionId!=child)throw std::runtime_error("Loop context plays clicked section");playing_=false;static_cast<PixelMenuItem*>(menu.children()[1])->Click();if(pending_!=Pending::LoopSection || loopDraft_->id!=child)throw std::runtime_error("Loop context properties target");resolve(false);static_cast<PixelMenuItem*>(menu.children().back())->Click();if(playbackSection(child))throw std::runtime_error("Loop context delete target");document.undo();if(!playbackSection(child))throw std::runtime_error("Loop context delete undo");}
    const int scrollFixtureFrames=timelineColumns(columnLayout(uiLogical(clientBounds()),2))+10;while(int(document.timeline().state().frames.size())<scrollFixtureFrames)document.addFrame();document.selectFrame(frames[0].id);frameScroll_=frameScrollRemainder_=0;refresh();box=loopTrackItemBounds(item(outer));const auto scrollEdge=gfx::Point(box.x+2*uiScale,box.y+15*uiScale);const auto scrollHit=loopTrackHit(scrollEdge);if(scrollHit.id!=outer || scrollHit.edge!=1)throw std::runtime_error("Loop scroll fixture requires visible start edge");send(ui::kMouseDownMessage,scrollEdge);const int scroll=frameScroll_*12*uiScale+frameScrollRemainder_;updateLoopTrackResize({loopTrackViewport().x2()-uiScale,box.y+15*uiScale},true);if(frameScroll_*12*uiScale+frameScrollRemainder_<=scroll){std::ostringstream detail;detail<<"Loop edge auto scroll: drag="<<bool(loopTrackDrag_)<<" before="<<scroll<<" after="<<(frameScroll_*12*uiScale+frameScrollRemainder_)<<" hit="<<scrollHit.id<<":"<<scrollHit.edge<<" pending="<<int(pending_)<<" point="<<scrollEdge.x<<","<<scrollEdge.y<<" viewport="<<loopTrackViewport().x<<","<<loopTrackViewport().y<<","<<loopTrackViewport().w<<","<<loopTrackViewport().h<<" frames="<<document.timeline().state().frames.size()<<" width="<<timelineScrollMetrics(columnLayout(uiLogical(clientBounds()),2)).width;throw std::runtime_error(detail.str());}finishLoopTrackResize(true);document=Document();playing_=false;loopPlayback_={};refresh();
  }
  void smokeLoopEditorNormalization(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;document=Document(1,1);document.addFrame();document.addFrame();refresh();openLoopEditor();loopInputs_[0]->setText("   ");loopInputs_[1]->setText("99.75");loopInputs_[2]->setText("-4.5");loopInputs_[3]->setText("10000.8");const auto history=document.historySize();resolve(true);if(pending_!=Pending::None || document.historySize()!=history+1 || document.timeline().state().loopSections.size()!=1)throw std::runtime_error("Loop normalized create transaction");auto section=document.timeline().state().loopSections.front();auto range=timeline::loopRange(document.timeline().state(),section);if(section.name!=U"循环节 1" || range.start!=0 || range.end!=2 || section.repeatCount!=9999)throw std::runtime_error("Loop range name repeat normalization");document.undo();if(!document.timeline().state().loopSections.empty())throw std::runtime_error("Loop normalized create undo");document.redo();openLoopEditor(section.id);loopInputs_[0]->setText("  Edited  ");loopInputs_[1]->setText("2.8");loopInputs_[2]->setText("3.9");loopInputs_[3]->setText("0.4");resolve(true);section=document.timeline().state().loopSections.front();range=timeline::loopRange(document.timeline().state(),section);if(section.name!=U"Edited" || range.start!=1 || range.end!=2 || section.repeatCount!=1)throw std::runtime_error("Loop edit integer truncation and minimum");document.undo();if(document.timeline().state().loopSections.front().name!=U"循环节 1")throw std::runtime_error("Loop normalized edit undo");openLoopEditor(section.id);const auto unchangedRevision=document.revision();resolve(true);if(document.revision()!=unchangedRevision)throw std::runtime_error("Loop unchanged save no history");openLoopEditor(section.id);loopInputs_[0]->setText("cancelled");resolve(false);if(document.revision()!=unchangedRevision || document.timeline().state().loopSections.front().name!=U"循环节 1")throw std::runtime_error("Loop cancel keeps metadata history");openLoopEditor(section.id);loopInputs_[3]->setText("");resolve(true);if(document.timeline().state().loopSections.front().repeatCount)throw std::runtime_error("Loop empty repeat remains infinite");document=Document();refresh();
  }
  void smokeFrameAddShortcutGuards(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;paletteFocused_=false;docking_=panels::Model{};layersPanelOpen_=true;setBounds(gfx::Rect(0,0,1280,960));
    auto key=[&](ui::KeyScancode code,int repeat=0,ui::KeyModifiers modifiers=ui::kKeyAltModifier){ui::KeyMessage message(ui::kKeyDownMessage,code,modifiers,0,repeat);onProcessMessage(&message);};
    for(const auto code:{ui::kKeyN,ui::kKeyM,ui::kKeyB}){document=Document(1,1);document.beginStroke({0,0},0xff123456);document.commitStroke();refresh();requestFocus();const auto history=document.historySize();key(code,1);if(document.timeline().state().frames.size()!=1 || document.historySize()!=history)throw std::runtime_error("Frame add shortcut repeat suppressed");layersPanelOpen_=false;refresh();key(code);if(document.timeline().state().frames.size()!=1 || document.historySize()!=history)throw std::runtime_error("Frame add shortcut hidden timeline blocked");layersPanelOpen_=true;refresh();paletteInput_->setVisible(true);paletteInput_->requestFocus();key(code);if(document.timeline().state().frames.size()!=1 || document.historySize()!=history)throw std::runtime_error("Frame add shortcut Entry priority");paletteInput_->setVisible(false);requestFocus();key(code,0,ui::KeyModifiers(ui::kKeyAltModifier|ui::kKeyShiftModifier));key(code,0,ui::KeyModifiers(ui::kKeyAltModifier|ui::kKeyCtrlModifier));if(document.timeline().state().frames.size()!=1 || document.historySize()!=history)throw std::runtime_error("Frame add shortcut exact modifiers");key(code);if(document.timeline().state().frames.size()!=2 || document.historySize()!=history+1)throw std::runtime_error("Frame add shortcut accepted once");if(code==ui::kKeyB && document.pixels()[0])throw std::runtime_error("AltB blank frame payload");if(code==ui::kKeyN && (document.pixels()[0]!=0xff123456 || document.cel().linkedCelId))throw std::runtime_error("AltN independent duplicate payload");if(code==ui::kKeyM && (document.pixels()[0]!=0xff123456 || !document.cel().linkedCelId))throw std::runtime_error("AltM linked payload");document.undo();if(document.timeline().state().frames.size()!=1 || document.pixels()[0]!=0xff123456)throw std::runtime_error("Frame add shortcut single undo");}
    document=Document();frameSelectionExplicit_=false;refresh();
  }
  void smokeCelContextDelete(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;paletteFocused_=false;document=Document(2,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.beginStroke({1,0},0xffabcdef);document.commitStroke();const auto first=document.cel().id;document.addFrame();document.beginStroke({1,0},0xfffedcba);document.commitStroke();const auto second=document.cel().id;document.addFrame();const auto empty=document.cel().id;document.selectTimelineCel(first);document.selectTimelineCel(second,1);const auto selected=document.timelineSelection().cels;prepareCelContext(first);if(document.timelineSelection().cels!=selected)throw std::runtime_error("Cel context preserves selected multi target");document.commitSelection({},SelectionMask{0,0,1,1,{}});refresh();const auto revision=document.revision();{PixelMenu menu(skin_);buildLayerContextMenu(&menu,3);auto item=dynamic_cast<PixelMenuItem*>(menu.children().back());if(!item || !item->isEnabled())throw std::runtime_error("Cel context full delete enabled under pixel selection");item->Click();}if(document.timeline().state().frames.size()!=3 || !document.timelineSelection().cels.empty() || !document.selection() || document.revision()!=revision+1)throw std::runtime_error("Cel context full multi deletion state");for(const auto& id:{first,second}){const auto surface=document.timeline().resolveSurface(id).surface;if(!surface || std::any_of(surface->pixels.begin(),surface->pixels.end(),[](Pixel p){return (p>>24)!=0;}))throw std::runtime_error("Cel context clears every selected full Cel");}document.undo();if(document.timeline().resolveSurface(first).surface->pixels[1]!=0xffabcdef || document.timeline().resolveSurface(second).surface->pixels[1]!=0xfffedcba || !document.timelineSelection().cels.empty())throw std::runtime_error("Cel context deletion undo content only");document.selectTimelineCel(first);document.selectTimelineCel(empty,1);prepareCelContext(empty);{PixelMenu menu(skin_);buildLayerContextMenu(&menu,3);if(menu.children().back()->isEnabled())throw std::runtime_error("Empty clicked Cel context delete disabled despite selected content");}prepareCelContext(second);if(document.timelineSelection().cels!=std::vector<std::string>{second})throw std::runtime_error("Unselected Cel context replaces targets");document=Document();refresh();
  }
  void smokeTimelineDeleteToolbar(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;paletteFocused_=false;docking_=panels::Model{};layersPanelOpen_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(2,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.beginStroke({1,0},0xffabcdef);document.commitStroke();document.addFrame();document.selectFrame(document.timeline().state().frames.front().id);document.selectTimelineCel(document.cel().id);document.commitSelection({},SelectionMask{0,0,1,1,{}});refresh();const auto revision=document.revision();if(!timelineInactive_[7]->isEnabled())throw std::runtime_error("Timeline toolbar delete fixture disabled");timelineInactive_[7]->Click();if(document.timeline().state().frames.size()!=2 || document.pixels()[0] || document.pixels()[1] || !document.selection() || !document.timelineSelection().cels.empty() || document.revision()!=revision+1)throw std::runtime_error("Timeline toolbar deletes full selected Cel before frame");document.undo();if(document.pixels()[0]!=0xff123456 || document.pixels()[1]!=0xffabcdef || !document.timelineSelection().cels.empty())throw std::runtime_error("Timeline toolbar Cel delete undo");document.redo();if(document.pixels()[0] || document.pixels()[1])throw std::runtime_error("Timeline toolbar Cel delete redo");document.selectFrameHeader(document.timeline().state().frames.front().id);document.selectFrameHeader(document.timeline().state().frames.back().id,2);markFrameSelection();refresh();timelineInactive_[7]->Click();if(document.timeline().state().frames.size()!=1 || document.selection() || !document.selectedFrames().empty() || frameSelectionExplicit_)throw std::runtime_error("Timeline toolbar all selected frames leaves one and clears selection");if(timelineInactive_[7]->isEnabled())throw std::runtime_error("Timeline toolbar sole frame deletion disabled");document.undo();if(document.timeline().state().frames.size()!=2)throw std::runtime_error("Timeline toolbar frame delete undo");document=Document();frameSelectionExplicit_=false;refresh();
  }
  void smokeCelCopyShortcut(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;paletteFocused_=false;playing_=false;document=Document(1,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.selectTimelineCel(document.cel().id);celClipboardSnapshot_={};refresh();requestFocus();const auto history=document.historySize();const auto selected=document.timelineSelection().cels;
    auto key=[&](int repeat=0,ui::KeyModifiers modifiers=ui::kKeyCtrlModifier){ui::KeyMessage message(ui::kKeyDownMessage,ui::kKeyD,modifiers,0,repeat);onProcessMessage(&message);};key();if(!hasApplicationCelClipboard() || document.timelineSelection().cels!=selected || document.historySize()!=history)throw std::runtime_error("CtrlD copies explicit Cel without edit");celClipboardSnapshot_={};key(1);if(hasApplicationCelClipboard())throw std::runtime_error("CtrlD repeated copy suppressed");key(0,ui::KeyModifiers(ui::kKeyCtrlModifier|ui::kKeyShiftModifier));if(hasApplicationCelClipboard())throw std::runtime_error("CtrlShiftD is not Cel copy");
    document.commitSelection({},SelectionMask{0,0,1,1,{}});key();if(document.selection() || hasApplicationCelClipboard() || document.timelineSelection().cels!=selected)throw std::runtime_error("CtrlD pixel deselect before Cel copy");paletteInput_->setVisible(true);paletteInput_->requestFocus();key();if(hasApplicationCelClipboard())throw std::runtime_error("CtrlD Entry priority");paletteInput_->setVisible(false);requestFocus();key();if(!hasApplicationCelClipboard())throw std::runtime_error("CtrlD after pixel deselect copies Cel");document=Document();celClipboardSnapshot_={};refresh();
  }
  void smokeDeleteRouting(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;paletteFocused_=false;playing_=false;
    auto key=[&](ui::KeyScancode code){ui::KeyMessage message(ui::kKeyDownMessage,code,ui::kKeyNoneModifier,0,0);onProcessMessage(&message);};
    auto fixture=[&]{document=Document(2,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.beginStroke({1,0},0xffabcdef);document.commitStroke();frameSelectionExplicit_=false;clearTimelineRowSelection();refresh();requestFocus();};
    fixture();auto history=document.historySize();key(ui::kKeyDel);if(document.timeline().state().layers.size()!=1 || document.pixels()[0] || document.pixels()[1] || document.historySize()!=history+1)throw std::runtime_error("Delete implicit active Cel");document.undo();if(document.pixels()[0]!=0xff123456)throw std::runtime_error("Delete implicit Cel undo");
    fixture();document.addFrame();document.selectFrame(document.timeline().state().frames.front().id);const auto source=document.cel().id;document.selectTimelineCel(source);history=document.historySize();key(ui::kKeyBackspace);if(document.timeline().state().frames.size()!=2 || document.timeline().state().layers.size()!=1 || document.pixels()[0] || !document.timelineSelection().cels.empty() || document.historySize()!=history+1)throw std::runtime_error("Backspace explicit Cel");document.undo();if(document.pixels()[0]!=0xff123456)throw std::runtime_error("Backspace Cel undo");
    fixture();document.addFrame();document.addFrame();const auto frames=document.timeline().state().frames;document.selectFrameHeader(frames[0].id);document.selectFrameHeader(frames[2].id,2);markFrameSelection();history=document.historySize();key(ui::kKeyDel);if(document.timeline().state().frames.size()!=1 || document.historySize()!=history+1 || !document.selectedFrames().empty() || frameSelectionExplicit_)throw std::runtime_error("Delete all selected frames leaves one");document.undo();if(document.timeline().state().frames.size()!=3)throw std::runtime_error("Delete frames undo");
    fixture();document.addLayer();document.selectTimelineLayer(document.timeline().state().layers.back().id);history=document.historySize();key(ui::kKeyBackspace);if(document.timeline().state().layers.size()!=1 || document.historySize()!=history+1)throw std::runtime_error("Backspace explicit layer");
    fixture();document.selectTimelineCel(document.cel().id);document.commitSelection({},SelectionMask{0,0,1,1,{}});history=document.historySize();key(ui::kKeyDel);if(document.pixels()[0] || document.pixels()[1]!=0xffabcdef || document.timeline().state().layers.size()!=1 || document.historySize()!=history+1)throw std::runtime_error("Delete pixel selection before Cel");document.undo();if(document.pixels()[0]!=0xff123456)throw std::runtime_error("Delete pixel undo");
    fixture();document.selectTimelineCel(document.cel().id);if(!menuCommands_.invoke("editDelete") || document.pixels()[0] || document.timeline().state().layers.size()!=1)throw std::runtime_error("Edit delete Cel enabled on sole layer");fixture();document.addLayer();document.clearTimelineSelection();if(!menuCommands_.invoke("editDelete") || document.timeline().state().layers.size()!=1)throw std::runtime_error("Edit delete active layer fallback");
    fixture();paletteInput_->setVisible(true);paletteInput_->requestFocus();history=document.historySize();key(ui::kKeyDel);key(ui::kKeyBackspace);if(document.historySize()!=history || document.pixels()[0]!=0xff123456)throw std::runtime_error("Delete Entry priority");paletteInput_->setVisible(false);requestFocus();document=Document();frameSelectionExplicit_=false;refresh();
  }
  void smokeArrowNavigation(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;playbackTagMode_=false;document=Document(2,1);document.addLayer();document.addLayer();document.addFrame();document.addFrame();const auto layers=document.timeline().state().layers;const auto frames=document.timeline().state().frames;document.selectLayer(layers[0].id);document.selectFrame(frames[0].id);refresh();requestFocus();const auto history=document.historySize();
    auto send=[&](ui::MessageType type,ui::KeyScancode code,ui::KeyModifiers mods=ui::kKeyNoneModifier,int repeat=0){ui::KeyMessage key(type,code,mods,0,repeat);onProcessMessage(&key);};
    auto tap=[&](ui::KeyScancode code){send(ui::kKeyDownMessage,code);send(ui::kKeyUpMessage,code);};
    tap(ui::kKeyUp);if(document.layer().id!=layers[0].id)throw std::runtime_error("Arrow top boundary");tap(ui::kKeyDown);if(document.layer().id!=layers[1].id || document.timelineSelection().cels.size()!=1)throw std::runtime_error("Arrow next flat Cel");tap(ui::kKeyDown);tap(ui::kKeyDown);if(document.layer().id!=layers[2].id)throw std::runtime_error("Arrow bottom boundary");tap(ui::kKeyUp);tap(ui::kKeyRight);tap(ui::kKeyLeft);if(document.layer().id!=layers[1].id || document.frame().id!=frames[0].id || document.historySize()!=history)throw std::runtime_error("Arrow axes/history");
    const auto now=std::chrono::steady_clock::now();pressCelNavigation(ui::kKeyRight,now);pressCelNavigation(ui::kKeyRight,now);if(document.frame().id!=frames[1].id || heldCelNavigation_.size()!=1)throw std::runtime_error("Arrow native repeat suppressed");celNavigationTick(now+std::chrono::milliseconds(279));if(document.frame().id!=frames[1].id)throw std::runtime_error("Arrow initial delay");celNavigationTick(now+std::chrono::milliseconds(280));if(document.frame().id!=frames[2].id)throw std::runtime_error("Arrow first repeat");celNavigationTick(now+std::chrono::milliseconds(329));if(document.frame().id!=frames[2].id)throw std::runtime_error("Arrow horizontal repeat deadline");celNavigationTick(now+std::chrono::milliseconds(330));if(document.frame().id!=frames[0].id)throw std::runtime_error("Arrow horizontal repeat wrap");send(ui::kKeyUpMessage,ui::kKeyRight);if(!heldCelNavigation_.empty() || celNavigationTimer_.isRunning())throw std::runtime_error("Arrow release timer stop");
    document.selectLayer(layers[0].id);pressCelNavigation(ui::kKeyDown,now);celNavigationTick(now+std::chrono::milliseconds(280));if(document.layer().id!=layers[2].id || heldCelNavigation_[0].nextAt!=now+std::chrono::milliseconds(400))throw std::runtime_error("Arrow vertical repeat deadline");stopCelNavigation();document.selectLayer(layers[1].id);document.selectFrame(frames[1].id);pressCelNavigation(ui::kKeyRight,now);pressCelNavigation(ui::kKeyUp,now);celNavigationTick(now+std::chrono::milliseconds(280));if(document.frame().id!=frames[0].id || document.layer().id!=layers[0].id || heldCelNavigation_[0].key!=ui::kKeyRight || heldCelNavigation_[1].key!=ui::kKeyUp)throw std::runtime_error("Arrow held insertion order");ui::Message blur(ui::kFocusLeaveMessage);onProcessMessage(&blur);if(!heldCelNavigation_.empty() || celNavigationTimer_.isRunning())throw std::runtime_error("Arrow blur timer stop");
    playing_=true;const auto paused=document.frame().id;tap(ui::kKeyRight);if(playing_ || document.frame().id!=paused)throw std::runtime_error("Arrow pause before step");send(ui::kKeyDownMessage,ui::kKeyRight,ui::kKeyShiftModifier);if(document.frame().id!=paused || !heldCelNavigation_.empty())throw std::runtime_error("Arrow modifiers blocked");paletteInput_->setVisible(true);paletteInput_->requestFocus();tap(ui::kKeyRight);if(document.frame().id!=paused || !heldCelNavigation_.empty())throw std::runtime_error("Arrow Entry priority");paletteInput_->setVisible(false);requestFocus();document.commitSelection({},SelectionMask{0,0,1,1,{}});tap(ui::kKeyRight);if(document.frame().id!=paused || !heldCelNavigation_.empty())throw std::runtime_error("Arrow pixel selection priority");document.cancelFloatingPaste();document=Document();stopCelNavigation();refresh();
  }
  void smokeDeleteLayerTargets(){smoke_=true;homeOpen_=false;documentOpen_=true;document=Document(1,1);document.addLayer();document.addLayer();const auto layers=document.timeline().state().layers;document.selectTimelineLayer(layers[1].id);document.selectLayer(layers[0].id);refresh();if(!menuCommands_.invoke("deleteLayer") || document.timeline().state().layers.size()!=2 || document.layer().id!=layers[2].id)throw std::runtime_error("Layer menu deletes selected target/landing");document.undo();document.clearTimelineSelection();refresh();if(menuCommands_.invoke("deleteLayer"))throw std::runtime_error("Layer menu no selected targets enabled");document=Document();refresh();}
  void smokeCreatedFrameState(){smoke_=true;homeOpen_=false;documentOpen_=true;document=Document(2,1);document.beginStroke({0,0},0xff123456);document.commitStroke();const auto original=document.frame().id;document.selectFrameHeader(original);document.commitSelection({},SelectionMask{0,0,1,1,{}});selectionPivot_=TransformPoint{.5,.5};frameSelectionExplicit_=true;refresh();requestFocus();ui::KeyMessage duplicate(ui::kKeyDownMessage,ui::kKeyN,ui::kKeyAltModifier,0,0);onProcessMessage(&duplicate);if(document.frame().id==original || document.pixels()[0]!=0xff123456 || document.selection() || !document.selectedFrames().empty() || selectionPivot_ || frameSelectionExplicit_)throw std::runtime_error("Duplicate frame clears old selection/pivot");document.undo();if(document.frame().id!=original || document.selection())throw std::runtime_error("Frame creation undo selection state");document.selectTimelineCel(document.cel().id);document.commitSelection({},SelectionMask{0,0,2,1,{}});ui::KeyMessage blank(ui::kKeyDownMessage,ui::kKeyB,ui::kKeyAltModifier,0,0);onProcessMessage(&blank);if(document.pixels()[0]!=0 || document.selection() || !document.timelineSelection().cels.empty())throw std::runtime_error("Blank frame clears Cel/selection");document=Document();refresh();}
  void smokeNewLayerPlacement(){smokeCreatedFrameState();smokeDeleteLayerTargets();smoke_=true;homeOpen_=false;documentOpen_=true;document=Document(1,1);document.addLayer();document.addLayer();const auto layers=document.timeline().state().layers;document.selectTimelineLayer(layers[1].id);document.selectTimelineLayer(layers[2].id,1);document.selectLayer(layers[2].id);refresh();auto history=document.historySize();if(!menuCommands_.invoke("newLayer") || document.timeline().state().layers[1].id!=document.layer().id || !document.timelineSelection().layers.empty() || frameSelectionExplicit_ || document.historySize()!=history+1)throw std::runtime_error("New layer selected placement/menu");document.undo();document.clearTimelineSelection();document.selectLayer(layers[2].id);refresh();ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyN,ui::kKeyShiftModifier,0,0);requestFocus();onProcessMessage(&key);if(document.timeline().state().layers.front().id!=document.layer().id)throw std::runtime_error("New layer ShiftN top placement");document=Document();refresh();}
  void smokeFrameNavigation(){smokeNewLayerPlacement();
    smoke_=true;document=Document(1,1);document.addFrame();document.addFrame();const auto frames=document.timeline().state().frames;document.selectFrameHeader(frames[1].id);document.setSelectedFramesDisabled(true);document.selectFrame(frames[2].id);refresh();const auto history=document.historySize();timelineInactive_[3]->Click();if(document.frame().id!=frames[0].id || document.selectedFrames()!=std::vector<std::string>{frames[0].id})throw std::runtime_error("Toolbar next wraps and selects frame");timelineInactive_[1]->Click();if(document.frame().id!=frames[0].id)throw std::runtime_error("Toolbar previous clamps");timelineInactive_[3]->Click();if(document.frame().id!=frames[1].id)throw std::runtime_error("Toolbar includes disabled");document.selectFrame(frames[0].id);paletteFocused_=false;requestFocus();ui::KeyMessage next(ui::kKeyDownMessage,ui::kKeyStop,ui::kKeyNoneModifier,0,0);onProcessMessage(&next);if(document.frame().id!=frames[2].id || document.timelineSelection().cels!=std::vector<std::string>{document.cel().id} || !document.selectedFrames().empty() || document.historySize()!=history)throw std::runtime_error("Keyboard skips disabled selects cel/history");ui::KeyMessage previous(ui::kKeyDownMessage,ui::kKeyComma,ui::kKeyNoneModifier,0,0);onProcessMessage(&previous);if(document.frame().id!=frames[0].id)throw std::runtime_error("Keyboard previous skips");onProcessMessage(&previous);if(document.frame().id!=frames[2].id)throw std::runtime_error("Keyboard previous wraps");timeline::LoopSection section;section.name=U"manual";section.startFrameId=frames[1].id;section.endFrameId=frames[2].id;document.createLoopSection(section);playbackTagMode_=true;onProcessMessage(&next);if(document.frame().id!=frames[2].id)throw std::runtime_error("Keyboard tag one playable");playbackTagMode_=false;playing_=true;onProcessMessage(&next);if(playing_ || document.frame().id!=frames[2].id)throw std::runtime_error("Keyboard pauses before stepping");paletteInput_->setVisible(true);paletteInput_->requestFocus();onProcessMessage(&next);if(document.frame().id!=frames[2].id)throw std::runtime_error("Keyboard input focus");paletteInput_->setVisible(false);requestFocus();SelectionClipboard copied;copied.width=1;copied.height=1;copied.pixels={0xff112233};copied.mask={1};if(!document.beginFloatingPaste(copied,0,0))throw std::runtime_error("Navigation floating fixture");const auto before=document.historySize();onProcessMessage(&next);if(document.floating() || document.frame().id!=frames[0].id || document.timeline().findCel(document.layer().id,frames[2].id)->surface->pixels[0]!=0xff112233 || document.historySize()!=before+1)throw std::runtime_error("Keyboard commits originating floating pixels");document=Document();playbackTagMode_=false;refresh();
  }
  void smokeLockGestures(){
    smoke_=true;document=Document(1,1);document.addLayer();document.addLayer();refresh();const auto layers=document.timeline().state().layers;const auto active=document.layer().id;auto press=[&](int row,ui::KeyModifiers modifier){ui::MouseMessage mouse(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,modifier,layerLocks_[row]->bounds().center());layerLocks_[row]->onProcessMessage(&mouse);};auto move=[&](int row){ui::MouseMessage mouse(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,layerLocks_[row]->bounds().center());onProcessMessage(&mouse);};const auto history=document.historySize();press(0,ui::kKeyNoneModifier);move(2);move(1);ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,layerLocks_[1]->bounds().center());onProcessMessage(&up);if(!lockValue(layers[0].id)||!lockValue(layers[1].id)||lockValue(layers[2].id)||document.historySize()!=history+1||document.layer().id!=active)throw std::runtime_error("Lock sweep/backtrack/active/history");document.undo();if(lockValue(layers[0].id)||lockValue(layers[1].id))throw std::runtime_error("Lock undo");document.redo();document.selectTimelineLayer(layers[0].id);document.selectTimelineLayer(layers[2].id,1);const auto selected=document.timelineSelection();press(0,ui::kKeyCtrlModifier);if(lockValue(layers[0].id)||lockValue(layers[2].id)||!lockValue(layers[1].id)||document.timelineSelection().layers!=selected.layers)throw std::runtime_error("Lock Ctrl selected");press(2,ui::kKeyAltModifier);if(lockValue(layers[0].id)||!lockValue(layers[2].id))throw std::runtime_error("Lock solo");press(2,ui::kKeyAltModifier);if(lockValue(layers[0].id)||lockValue(layers[2].id))throw std::runtime_error("Lock solo restore");document.clearTimelineSelection();press(0,ui::kKeyAltModifier);press(2,ui::kKeyAltModifier);press(2,ui::kKeyAltModifier);if(lockValue(layers[0].id)||!lockValue(layers[1].id)||lockValue(layers[2].id))throw std::runtime_error("Lock changed solo restore");press(0,ui::kKeyNoneModifier);ui::Message blur(ui::kFocusLeaveMessage);processLockGesture(&blur);if(lockGesture_||!lockValue(layers[0].id))throw std::runtime_error("Lock blur commits");document.undo();press(0,ui::kKeyNoneModifier);releaseMouse();ui::Message lost(ui::kMouseMoveMessage);processLockGesture(&lost);if(lockGesture_||!lockValue(layers[0].id))throw std::runtime_error("Lock cancel commits");document=Document();lockSoloTarget_.clear();lockSoloOriginals_.clear();refresh();
  }
  void smokeVisibilityGestures(){
    smoke_=true;document=Document(1,1);document.addLayer();document.addLayer();refresh();const auto layers=document.timeline().state().layers;const auto active=document.layer().id;auto press=[&](int row,ui::KeyModifiers modifier){ui::MouseMessage mouse(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,modifier,layerEyes_[row]->bounds().center());layerEyes_[row]->onProcessMessage(&mouse);};auto move=[&](int row){ui::MouseMessage mouse(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,layerEyes_[row]->bounds().center());onProcessMessage(&mouse);};const auto history=document.historySize();press(0,ui::kKeyNoneModifier);move(2);move(1);ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,layerEyes_[1]->bounds().center());onProcessMessage(&up);if(visibilityValue(layers[0].id)||visibilityValue(layers[1].id)||!visibilityValue(layers[2].id)||document.historySize()!=history+1||document.layer().id!=active)throw std::runtime_error("Visibility sweep/backtrack/active/history");document.undo();if(!visibilityValue(layers[0].id)||!visibilityValue(layers[1].id))throw std::runtime_error("Visibility undo");document.redo();document.selectTimelineLayer(layers[0].id);document.selectTimelineLayer(layers[2].id,1);const auto selected=document.timelineSelection();press(0,ui::kKeyCtrlModifier);if(!visibilityValue(layers[0].id)||!visibilityValue(layers[2].id)||visibilityValue(layers[1].id)||document.timelineSelection().layers!=selected.layers)throw std::runtime_error("Visibility Ctrl selected");press(2,ui::kKeyAltModifier);if(visibilityValue(layers[0].id)||!visibilityValue(layers[2].id))throw std::runtime_error("Visibility solo");press(2,ui::kKeyAltModifier);if(!visibilityValue(layers[0].id)||!visibilityValue(layers[2].id))throw std::runtime_error("Visibility solo restore");document.clearTimelineSelection();press(0,ui::kKeyAltModifier);press(2,ui::kKeyAltModifier);press(2,ui::kKeyAltModifier);if(!visibilityValue(layers[0].id)||visibilityValue(layers[1].id)||!visibilityValue(layers[2].id))throw std::runtime_error("Visibility changed solo restore");press(0,ui::kKeyNoneModifier);ui::Message blur(ui::kFocusLeaveMessage);processVisibilityGesture(&blur);if(visibilityGesture_||visibilityValue(layers[0].id))throw std::runtime_error("Visibility blur commits");document.undo();press(0,ui::kKeyNoneModifier);releaseMouse();ui::Message lost(ui::kMouseMoveMessage);processVisibilityGesture(&lost);if(visibilityGesture_||visibilityValue(layers[0].id))throw std::runtime_error("Visibility cancel commits");document=Document();visibilitySoloTarget_.clear();visibilitySoloOriginals_.clear();refresh();
  }
  void smokeAutoLinkGestures(){
    smoke_=true;document=Document(1,1);document.addLayer();document.addLayer();refresh();const auto layers=document.timeline().state().layers;const auto active=document.layer().id;const auto history=document.historySize();auto press=[&](int n,ui::KeyModifiers modifiers){ui::MouseMessage mouse(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,modifiers,layerAutoLinks_[n]->bounds().center());beginAutoLinkGesture(layers[n].id,mouse);};press(0,ui::kKeyNoneModifier);auto sweepMove=[&](int n){ui::MouseMessage mouse(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,layerAutoLinks_[n]->bounds().center());onProcessMessage(&mouse);};sweepMove(2);sweepMove(1);ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,layerAutoLinks_[1]->bounds().center());onProcessMessage(&up);if(!autoLinkValue(layers[0].id) || !autoLinkValue(layers[1].id) || autoLinkValue(layers[2].id) || document.historySize()!=history+1 || document.layer().id!=active)throw std::runtime_error("Auto-link range/backtrack history");document.undo();if(autoLinkValue(layers[0].id) || autoLinkValue(layers[1].id))throw std::runtime_error("Auto-link gesture undo");document.redo();document.selectTimelineLayer(layers[0].id);document.selectTimelineLayer(layers[2].id,1);const auto selected=document.timelineSelection();press(0,ui::kKeyCtrlModifier);if(autoLinkValue(layers[0].id) || autoLinkValue(layers[2].id) || !autoLinkValue(layers[1].id) || document.timelineSelection().layers!=selected.layers)throw std::runtime_error("Auto-link Ctrl selected");press(2,ui::kKeyAltModifier);if(!autoLinkValue(layers[2].id) || autoLinkValue(layers[0].id) || !autoLinkValue(layers[1].id))throw std::runtime_error("Auto-link Alt selected solo");press(2,ui::kKeyAltModifier);if(autoLinkValue(layers[2].id) || !autoLinkValue(layers[1].id))throw std::runtime_error("Auto-link Alt restore");document.clearTimelineSelection();press(0,ui::kKeyAltModifier);press(2,ui::kKeyAltModifier);press(2,ui::kKeyAltModifier);if(autoLinkValue(layers[0].id) || !autoLinkValue(layers[1].id) || autoLinkValue(layers[2].id))throw std::runtime_error("Auto-link changed solo target restore");press(0,ui::kKeyNoneModifier);ui::Message blur(ui::kFocusLeaveMessage);processAutoLinkGesture(&blur);if(autoLinkGesture_ || !autoLinkValue(layers[0].id))throw std::runtime_error("Auto-link blur commits");document.undo();press(0,ui::kKeyNoneModifier);releaseMouse();ui::Message move(ui::kMouseMoveMessage);processAutoLinkGesture(&move);if(autoLinkGesture_ || !autoLinkValue(layers[0].id))throw std::runtime_error("Auto-link capture cancel commits");document=Document();autoLinkSoloTarget_.clear();autoLinkSoloOriginals_.clear();refresh();
  }
  void smokeFrameDisabled(){
    smoke_=true;playing_=false;savedPlaybackMode_.reset();document=Document(1,1);document.addFrame();document.addFrame();const auto frames=document.timeline().state().frames;
    document.selectFrameHeader(frames[1].id);contextFrameId_=frames[1].id;{PixelMenu menu(skin_);buildLayerContextMenu(&menu,2);auto item=dynamic_cast<PixelMenuItem*>(menu.children()[3]);if(!item || !item->isEnabled())throw std::runtime_error("Disable frame menu");item->Click();}if(!document.frame().disabled || !document.selectedFramesDisabled())throw std::runtime_error("Disable frame target");document.clearFrameSelection();document.selectFrame(frames[0].id);playbackSessionMode_="all";playbackTagMode_=false;togglePlayback();playbackDue_=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);playbackTick();if(document.frame().id!=frames[2].id || !playing_)throw std::runtime_error("Disabled all skip");playing_=false;document.selectFrameHeader(frames[0].id);updateFramesDisabled(true);document.clearFrameSelection();document.selectFrame(frames[0].id);playbackSessionMode_="once";togglePlayback();if(document.frame().id!=frames[2].id || !playing_)throw std::runtime_error("Disabled once start");playbackDue_=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);playbackTick();if(playing_ || document.frame().id!=frames[2].id)throw std::runtime_error("Disabled once completion");document.selectFrameHeader(frames[0].id);document.selectFrameHeader(frames[2].id,2);updateFramesDisabled(true);togglePlayback();if(playing_)throw std::runtime_error("All disabled playback");document.undo();document.clearFrameSelection();document.selectFrame(frames[0].id);playbackSessionMode_="all";togglePlayback();if(document.frame().disabled)throw std::runtime_error("Disabled all start");document.selectFrameHeader(document.frame().id);updateFramesDisabled(true);if(playing_)throw std::runtime_error("Disable live last playable");playing_=false;document.undo();document.clearFrameSelection();timeline::LoopSection section;section.name=U"disabled";section.startFrameId=frames[0].id;section.endFrameId=frames[2].id;document.createLoopSection(section);const auto tag=document.timeline().state().loopSections.front().id;startLoopPlayback(tag);if(document.frame().disabled || !playing_)throw std::runtime_error("Disabled tag start");playbackDue_=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);playbackTick();if(document.frame().disabled)throw std::runtime_error("Disabled tag step");playing_=false;loopPlayback_={};playbackTagCycle_.clear();playbackTagMode_=false;document=Document();savedPlaybackMode_.reset();refresh();
  }
  void smokePlaybackPreferences(){smoke_=true;savedPlaybackMode_.reset();playing_=false;loopPlayback_={};document=Document(1,1);document.addFrame();document.addFrame();document.markSaved();const auto history=document.historySize(),revision=document.revision();const int duration=document.frame().duration;std::istringstream preferences("1.5 1");readPlaybackPreferences(preferences);if(playbackRate_!=1.5||!playbackReturnToStart_)throw std::runtime_error("Playback preference reload");setPlaybackRate(2);if(std::chrono::duration<double,std::milli>(playbackFrameDelay()).count()!=duration/2.0||document.frame().duration!=duration)throw std::runtime_error("Playback rate changed frame duration");setPlaybackRate(17);if(playbackRate_!=1)throw std::runtime_error("Playback rate normalization");document.setImportedLoop(false);const auto start=document.frame().id;togglePlayback();if(document.activeFrameIndex()!=0)throw std::runtime_error("Once must start first");togglePlayback();if(document.activeFrameIndex()!=0)throw std::runtime_error("Pause returned to start");togglePlayback();playbackDue_=std::chrono::steady_clock::now()-std::chrono::seconds(2);playbackTick();if(playing_||document.activeFrameIndex()!=0)throw std::runtime_error("Once completion return capture");document.selectFrame(start);togglePlayback();playbackDue_=std::chrono::steady_clock::now()-std::chrono::seconds(2);playbackTick();if(document.frame().id!=start)throw std::runtime_error("Return to original playback start");if(document.historySize()!=history||document.revision()!=revision||document.dirty())throw std::runtime_error("Playback preferences changed document");playbackRate_=1;playbackReturnToStart_=false;playbackStartFrame_.clear();document=Document();refresh();}
  void smokeSpriteSheet(){smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(1,1);homeOpen_=false;documentOpen_=true;document.addFrame();refresh();auto h=document.historySize(),rev=document.revision();const bool dirtyBefore=document.dirty();openSpriteSheet();if(!sheetPreview_ || document.historySize()!=h || document.revision()!=rev || document.dirty()!=dirtyBefore)throw std::runtime_error("Sheet preview mutated document");if(sheetButtons_[0]->hasFlags(ui::HIDDEN)||sheetOptions_.layout!=SheetLayout::Rows||sheetOptions_.constraint!=SheetConstraint::None)throw std::runtime_error("Sheet default UI");auto image=encodeSpriteSheet(document,sheetOptions_);if(image.width!=2||image.height!=1)throw std::runtime_error("Sheet all frames UI");sheetOptions_.splitLayers=true;refresh();if(buildSpriteSheetImage(document,sheetOptions_).width!=2 || document.dirty()!=dirtyBefore || document.historySize()!=h || document.revision()!=rev)throw std::runtime_error("Sheet split UI mutation");resolve(false);if(document.historySize()!=h||document.revision()!=rev||document.dirty()!=dirtyBefore)throw std::runtime_error("Sheet cancel mutation");document=Document();refresh();}
  void smokeStaticExport(){smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(3,2);homeOpen_=false;documentOpen_=true;refresh();const auto h=document.historySize(),rev=document.revision();openStaticExport();if(exportScaleInput_->hasFlags(ui::HIDDEN)||exportOptions_.scalePercent!=100||exportOptions_.trim)throw std::runtime_error("Static export defaults/UI");exportScaleInput_->setText("200");exportScaleInput_->Change();auto out=encodeStaticImagePng(document,exportOptions_);if(out.width!=6||out.height!=4)throw std::runtime_error("Static export percentage");resolve(false);if(document.historySize()!=h||document.revision()!=rev||document.dirty())throw std::runtime_error("Static export cancel mutation");document=Document();refresh();}
  void smokeImageResize(){smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(2,1);documentOpen_=true;homeOpen_=false;refresh();auto h=document.historySize();openImageResize();resizeInputs_[0]->setText("4");resizeInputs_[0]->Change();if(resizeHeight_!=2)throw std::runtime_error("Image resize aspect");resolve(false);if(document.width()!=2||document.historySize()!=h)throw std::runtime_error("Image resize cancel");openImageResize();resizeInputs_[0]->setText("4");resizeInputs_[0]->Change();resolve(true);if(document.width()!=4||document.height()!=2||document.historySize()!=h+1)throw std::runtime_error("Image resize apply");document.undo();if(document.width()!=2||document.height()!=1)throw std::runtime_error("Image resize undo");document=Document();refresh();}
  void smokeGradientMap(){smoke_=true;homeOpen_=false;documentOpen_=true;std::vector<Pixel> pixels{0x00112233,0x3f806020,0xffffffff};document=Document::fromImage(3,1,pixels,U"GM");refresh();auto h=document.historySize();if(!menuCommands_.invoke("gradientMap")||adjustmentSpec_.kind!=ColorAdjustmentKind::GradientMap||gmTrack_->hasFlags(ui::HIDDEN)||adjustmentSpec_.gradientMap.stops.size()!=2||!adjustmentPreviewEnabled_)throw std::runtime_error("GM defaults");auto drain=[&]{auto until=std::chrono::steady_clock::now()+std::chrono::seconds(5);while((gmScheduled_||gmWorker_.valid())&&std::chrono::steady_clock::now()<until){gradientMapTick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}if(gmScheduled_||gmWorker_.valid())throw std::runtime_error("GM worker timeout");};drain();if(document.pixels()!=pixels||document.displayPixels()==pixels||(document.displayPixels()[1]>>24)!=63)throw std::runtime_error("GM independent preview");gmAdd_->Click();if(adjustmentSpec_.gradientMap.stops.size()!=3||gmStop_!=1)throw std::runtime_error("GM add largest gap");gmPosition_->setText("25");gmPosition_->Change();gmColor_->setText("#FF000080");gmColor_->Change();if(adjustmentSpec_.gradientMap.stops[gmStop_].position!=.25||adjustmentSpec_.gradientMap.stops[gmStop_].color!=0xff0000ff)throw std::runtime_error("GM stop fields and opaque setting");gmRemove_->Click();if(adjustmentSpec_.gradientMap.stops.size()!=2)throw std::runtime_error("GM remove stop");gmMode_->Click();gmReverse_->Click();gmDither_->setSelectedIndex(3,true);if(!adjustmentSpec_.gradientMap.steps||!adjustmentSpec_.gradientMap.reverse||adjustmentSpec_.gradientMap.dither!=3)throw std::runtime_error("GM mode reverse dither");gmPalette_->Click();if(adjustmentSpec_.gradientMap.stops.size()<2)throw std::runtime_error("GM palette");adjustmentPreview_->Click();if(document.displayPixels()!=pixels)throw std::runtime_error("GM live off");resolve(false);if(document.historySize()!=h||document.pixels()!=pixels)throw std::runtime_error("GM cancel");menuCommands_.invoke("gradientMap");adjustmentSpec_.gradientMap=gradientMapBuiltins()[2].settings;gmChanged();resolve(true);drain();if(pending_!=Pending::None||document.historySize()!=h+1||document.pixels()==pixels||(document.pixels()[1]>>24)!=63||document.pixels()[0]!=pixels[0])throw std::runtime_error("GM apply alpha/history");document.undo();if(document.pixels()!=pixels)throw std::runtime_error("GM undo");document.redo();if(document.pixels()==pixels)throw std::runtime_error("GM redo");document.undo();menuCommands_.invoke("gradientMap");gradientMapTick();resolve(false);if(gmWorker_.valid()){gmWorker_.wait();gmWorker_.get();}if(document.pixels()!=pixels||document.colorAdjustmentActive())throw std::runtime_error("GM stale close");document=Document();refresh();}
  void smokeAntiAlias(){smoke_=true;homeOpen_=false;documentOpen_=true;std::vector<Pixel> pixels(25);pixels[6]=pixels[12]=pixels[18]=0xffc06020;document=Document::fromImage(5,5,pixels,U"AA");refresh();auto h=document.historySize();if(!menuCommands_.invoke("quickAntiAlias") || !aaAuto_||!aaLive_||aaSpec_.opacity!=50||aaSpec_.interior||aaSpec_.colorSource!=0||aaAutoButton_->hasFlags(ui::HIDDEN))throw std::runtime_error("AA menu defaults");auto drain=[&]{auto until=std::chrono::steady_clock::now()+std::chrono::seconds(5);while((aaScheduled_||aaWorker_.valid())&&std::chrono::steady_clock::now()<until){antiAliasTick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}if(aaScheduled_||aaWorker_.valid())throw std::runtime_error("AA worker timeout");};drain();if(document.pixels()!=pixels||document.displayPixels()==pixels||document.historySize()!=h)throw std::runtime_error("AA detached preview");aaSource_->setSelectedIndex(2,true);drain();if(aaSpec_.colorSource!=2||!aaOpacity_->hasFlags(ui::HIDDEN))throw std::runtime_error("AA palette source");aaInterior_->Click();if(!aaSpec_.interior)throw std::runtime_error("AA interior toggle");aaAutoButton_->Click();if(aaPicker_->hasFlags(ui::HIDDEN)||aaColorEntry_->hasFlags(ui::HIDDEN)||!aaSource_->hasFlags(ui::HIDDEN))throw std::runtime_error("AA custom picker");aaColorEntry_->setText("#FF000080");aaColorEntry_->Change();drain();if(aaCustom_!=0x800000ff)throw std::runtime_error("AA custom alpha");aaLiveButton_->Click();if(document.displayPixels()!=pixels)throw std::runtime_error("AA disable live restores");resolve(false);if(document.pixels()!=pixels||document.historySize()!=h)throw std::runtime_error("AA cancel");menuCommands_.invoke("quickAntiAlias");requestAntiAliasApply();drain();if(pending_!=Pending::None||document.pixels()==pixels||document.historySize()!=h+1)throw std::runtime_error("AA apply one history");document.undo();if(document.pixels()!=pixels)throw std::runtime_error("AA undo");document.redo();if(document.pixels()==pixels)throw std::runtime_error("AA redo");document.undo();menuCommands_.invoke("quickAntiAlias");aaDue_=std::chrono::steady_clock::now();antiAliasTick();resolve(false);if(aaWorker_.valid()){aaWorker_.wait();aaWorker_.get();}if(document.pixels()!=pixels||document.colorAdjustmentActive())throw std::runtime_error("AA stale close");document=Document();refresh();}
  void smokeConvolution(){smoke_=true;homeOpen_=false;documentOpen_=true;document=Document::fromImage(3,1,{0xff140a1e,0xff140a3c,0xff140a78},U"convolution");refresh();auto original=document.pixels();auto history=document.historySize();if(!menuCommands_.invoke("convolution") || convolutionSpec_.presetId!="blur-3x3" || !convolutionLiveEnabled_ || convolutionSpec_.tiled || convolutionPresets_.size()!=40)throw std::runtime_error("Convolution defaults and presets");convolutionTick();if(convolutionWorker_.valid())throw std::runtime_error("Convolution debounce missing");auto drain=[&]{const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(5);while((convolutionScheduled_ || convolutionWorker_.valid()) && std::chrono::steady_clock::now()<until){convolutionTick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}if(convolutionScheduled_ || convolutionWorker_.valid())throw std::runtime_error("Convolution worker timeout");};convolutionSpec_={"negative",{true,true,true,false},false};changeConvolution();drain();if(document.pixels()!=original || document.displayPixels()==original || document.historySize()!=history)throw std::runtime_error("Convolution detached live preview");requestConvolutionApply(false);drain();auto applied=document.pixels();if(pending_!=Pending::Convolution || document.historySize()!=history+1 || applied==original)throw std::runtime_error("Convolution Apply stays open");requestConvolutionApply(true);if(pending_!=Pending::None || document.historySize()!=history+1 || document.pixels()!=applied)throw std::runtime_error("Convolution Done applied twice");menuCommands_.invoke("convolution");convolutionSpec_={"brightness",{true,true,true,false},false};changeConvolution();drain();resolve(false);if(document.pixels()!=applied || document.historySize()!=history+1)throw std::runtime_error("Convolution Cancel lost applied baseline");document.undo();if(document.pixels()!=original)throw std::runtime_error("Convolution undo");menuCommands_.invoke("convolution");convolutionDue_=std::chrono::steady_clock::now();convolutionTick();resolve(false);if(convolutionWorker_.valid()){convolutionWorker_.wait();convolutionWorker_.get();}if(document.pixels()!=original || document.colorAdjustmentActive())throw std::runtime_error("Convolution stale close result");document=Document();refresh();}
  void smokeCurves(){smoke_=true;homeOpen_=false;documentOpen_=true;document=Document(2,1);document.beginStroke({0,0},0x801e140a);document.commitStroke();document.markSaved();refresh();auto history=document.historySize();if(!menuCommands_.invoke("adjustmentCurves") || curveChannel_!=0 || curveEditor_->hasFlags(ui::HIDDEN) || adjustmentSpec_.curves[0].size()!=2)throw std::runtime_error("Curves menu defaults");curveEditor_->setBounds(gfx::Rect(0,0,248*uiScale,248*uiScale));auto pointer=[&](ui::MessageType type,CurvePoint p,decltype(ui::kButtonLeft) buttons=ui::kButtonLeft){ui::MouseMessage m(type,os::PointerType::Mouse,buttons,ui::kKeyNoneModifier,curveEditor_->pointPosition(p));curveEditor_->onProcessMessage(&m);};pointer(ui::kMouseDownMessage,{128,170});pointer(ui::kMouseUpMessage,{128,170});if(adjustmentSpec_.curves[0].size()!=3 || curveEditor_->selected!=1)throw std::runtime_error("Curve adds interior point");curveEditor_->setCoordinate(0,400);if(adjustmentSpec_.curves[0][1].x!=254)throw std::runtime_error("Curve point X neighbor clamp");curveEditor_->setCoordinate(0,128);curveEditor_->setCoordinate(1,170);curveChannelButton_->Click();if(curveChannel_!=1 || curveEditor_->selected!=-1 || adjustmentSpec_.curves[0].size()!=3)throw std::runtime_error("Curve channel retains independent points");curveEditor_->resetChannel();curveChannelButton_->Click();curveChannelButton_->Click();curveChannelButton_->Click();curveEditor_->selected=1;curveEditor_->deleteSelected();if(adjustmentSpec_.curves[0].size()!=2)throw std::runtime_error("Curve deletes inner point");curveEditor_->selected=0;curveEditor_->deleteSelected();if(adjustmentSpec_.curves[0].size()!=2)throw std::runtime_error("Curve keeps endpoints");resolve(false);if(document.historySize()!=history || document.dirty())throw std::runtime_error("Curves cancel view history");menuCommands_.invoke("adjustmentCurves");adjustmentSpec_.curves[0]={{0,0},{128,170},{255,255}};previewAdjustment();resolve(true);if(document.historySize()!=history+1 || (document.pixels()[0]>>24)!=128 || document.pixels()[0]==0x801e140a)throw std::runtime_error("Curves apply pixel history");document.undo();if(document.pixels()[0]!=0x801e140a)throw std::runtime_error("Curves undo");document=Document();refresh();}
  void smokeColorAdjustments(){
    smoke_=true;setBounds(gfx::Rect(0,0,1280,960));document=Document(2,1);homeOpen_=false;documentOpen_=true;document.beginStroke({0,0},0x801e140a);document.commitStroke();document.markSaved();const auto pixels=document.pixels();const auto h=document.historySize();refresh();openColorAdjustment(ColorAdjustmentKind::BrightnessContrast);adjustmentInputs_[0]->setText("20");adjustmentInputs_[0]->Change();if(document.pixels()!=pixels || document.dirty() || document.displayPixels()[0]==pixels[0])throw std::runtime_error("Adjustment independent preview");resolve(false);if(document.historySize()!=h || document.pixels()!=pixels)throw std::runtime_error("Adjustment cancel");openColorAdjustment(ColorAdjustmentKind::HueSaturation);adjustmentInputs_[0]->setText("120");adjustmentInputs_[0]->Change();resolve(true);if(document.historySize()!=h+1 || (document.pixels()[0]>>24)!=128)throw std::runtime_error("Adjustment apply");document.undo();if(document.pixels()!=pixels)throw std::runtime_error("Adjustment undo");document=Document(1,1);document.beginStroke({0,0},0x801e140a);document.commitStroke();document.markSaved();refresh();auto balanceHistory=document.historySize();if(!menuCommands_.invoke("adjustmentColorBalance") || adjustmentTone_!=1 || !adjustmentSpec_.preserveLuminosity || adjustmentInputs_[2]->hasFlags(ui::HIDDEN) || adjustmentToneButton_->hasFlags(ui::HIDDEN))throw std::runtime_error("Color balance menu defaults");adjustmentInputs_[0]->setText("20");adjustmentInputs_[0]->Change();adjustmentToneButton_->Click();if(adjustmentTone_!=2 || adjustmentSpec_.balance[1][0]!=20)throw std::runtime_error("Color balance tone preserves parameters");adjustmentInputs_[2]->setText("10");adjustmentInputs_[2]->Change();adjustmentColorize_->Click();if(adjustmentSpec_.preserveLuminosity)throw std::runtime_error("Color balance preserve toggle");resolve(false);if(document.historySize()!=balanceHistory || document.dirty() || document.pixels()[0]!=0x801e140a)throw std::runtime_error("Color balance cancel");menuCommands_.invoke("adjustmentColorBalance");adjustmentInputs_[0]->setText("20");adjustmentInputs_[0]->Change();resolve(true);if(document.historySize()!=balanceHistory+1 || document.pixels()[0]==0x801e140a || (document.pixels()[0]>>24)!=128)throw std::runtime_error("Color balance apply alpha history");document.undo();if(document.pixels()[0]!=0x801e140a)throw std::runtime_error("Color balance undo");document=Document();refresh();
  }
  void smokeSymmetry(){
    smoke_=true;setBounds(gfx::Rect(0,0,1280,960));const auto savedAxes=persistedSymmetryAxes_;document=Document(8,8);homeOpen_=false;documentOpen_=true;requestFocus();fitCanvas();refresh();symmetryInitialized_=false;toggleSymmetry(1);layoutToolOptions();if(!document.symmetryAxes.vertical || !symmetryButtons_[1]->active)throw std::runtime_error("Symmetry toggle");const auto history=document.historySize();const auto center=document.symmetryCenter();symmetryLocked_=true;if(symmetryHit(gfx::Point(int(canvas_.x+center.x*canvasScale()),int(canvas_.y+center.y*canvasScale()))))throw std::runtime_error("Symmetry lock");if(!symmetryHit(gfx::Point(int(canvas_.x+center.x*canvasScale()),int(canvas_.y+center.y*canvasScale())),true))throw std::runtime_error("Symmetry Ctrl override");symmetryDragging_=true;symmetryDragBefore_=center;document.setSymmetryCenter({1.5,2},false);finishSymmetryDrag(true);if(document.symmetryCenter().x!=center.x || document.historySize()!=history)throw std::runtime_error("Symmetry axis cancel");symmetryLocked_=false;persistedSymmetryAxes_=savedAxes;document=Document();refresh();
  }
  void smokeSheetImport(){const auto saved=document;document=Document::fromImage(4,2,std::vector<Pixel>(8,0xff123456),U"sheet");openSheetImport(false);if(pending_!=Pending::SheetImport||importSheetOptions_.layout!=2||importSheetOptions_.width!=16)throw std::runtime_error("Sheet import defaults");resolve(false);if(document.width()!=4)throw std::runtime_error("Sheet import cancel");openSheetImport(false);importSheetOptions_.width=2;importSheetOptions_.height=1;resolve(true);if(document.width()!=2||document.timeline().state().frames.size()!=4)throw std::runtime_error("Sheet import apply");document.undo();if(document.width()!=4||document.height()!=2)throw std::runtime_error("Sheet import UI undo");document=saved;refresh();}
  void smokeLayerSelectionTargets(){const auto saved=document;smoke_=true;documentOpen_=true;homeOpen_=false;paletteFocused_=false;document=Document(1,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.addLayer();document.beginStroke({0,0},0xff123456);document.commitStroke();document.addLayer();document.beginStroke({0,0},0xff123456);document.commitStroke();refresh();const auto layers=document.timeline().state().layers;document.selectTimelineLayer(layers[0].id);document.selectTimelineLayer(layers[2].id,1);refresh();replaceScope_="layers";const auto ids=replaceTargets();if(ids.size()!=2)throw std::runtime_error("Multi layer replacement targets");if(!document.beginColorReplacement(ids))throw std::runtime_error("Multi layer replacement start");document.updateColorReplacement(0xff123456,0xffabcdef);document.commitColorAdjustment();for(int i=0;i<3;++i){document.selectLayer(layers[i].id);if(document.pixels()[0]!=(i==1?0xff123456:0xffabcdef))throw std::runtime_error("Multi layer pixel targets");}document.undo();document.selectTimelineLayer(layers[0].id);document.selectTimelineLayer(layers[2].id,2);if(document.timelineSelection().layers.size()!=3||document.layer().id!=layers[2].id)throw std::runtime_error("Layer Shift range");document.selectTimelineLayer(layers[1].id,1);if(document.timelineSelection().layers.size()!=2)throw std::runtime_error("Layer Ctrl toggle");auto deleteRevision=document.revision();document.deleteLayer();if(document.timeline().state().layers.size()!=1||document.revision()!=deleteRevision+1)throw std::runtime_error("Multi layer delete");document.undo();if(document.timelineSelection().layers.size()!=2||document.timeline().state().layers.size()!=3)throw std::runtime_error("Multi layer delete undo");refresh();openSpriteSheet();if(sheetOptions_.selectedLayerIds.size()!=2)throw std::runtime_error("Sheet multiple selected layers");resolve(false);document=saved;replaceScope_="layers";refresh();}
  void smokeFrameCutAndMergeVisible(){const auto saved=document;smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;pending_=Pending::None;document=Document(1,1);document.beginStroke({0,0},0xff123456);document.commitStroke();const auto first=document.frame().id;document.addFrame();refresh();document.selectFrameHeader(first);frameSelectionExplicit_=true;refresh();menuCommands_.invoke("cut");if(document.timeline().state().frames.size()!=1)throw std::runtime_error("Frame menu cut");document.pasteCopiedFrames();if(document.pixels()[0]!=0xff123456)throw std::runtime_error("Frame cut paste");document.undo();if(document.timeline().state().frames.size()!=1)throw std::runtime_error("Frame paste undo");frameSelectionExplicit_=false;document=Document(1,1);document.addLayer();refresh();menuCommands_.invoke("mergeVisibleLayers");if(document.timeline().state().layers.size()!=1)throw std::runtime_error("Visible merge menu");document.undo();if(document.timeline().state().layers.size()!=2)throw std::runtime_error("Visible merge menu undo");document=saved;refresh();}
  void smokePlaybackModePersistence(){smoke_=true;playing_=false;homeOpen_=false;documentOpen_=true;auto restore=[&](const char* text,bool loop){std::istringstream stream(text);readPlaybackPreferences(stream);document=Document(1,1);document.setImportedLoop(loop);document.markSaved();const auto history=document.historySize(),revision=document.revision();refresh();if(document.animationLoop()!=loop || document.dirty() || document.historySize()!=history || document.revision()!=revision)throw std::runtime_error("Playback mode preference altered project");};restore("1 0",false);if(playbackSessionMode_!="once")throw std::runtime_error("Legacy preference loop fallback false");restore("1 0 invalid",true);if(playbackSessionMode_!="all" || savedPlaybackMode_)throw std::runtime_error("Invalid mode preference fallback");restore("1.5 1 once",true);if(playbackSessionMode_!="once" || playbackTagMode_ || playbackRate_!=1.5 || !playbackReturnToStart_)throw std::runtime_error("Once preference reload");document.addFrame();refresh();togglePlayback();if(document.activeFrameIndex()!=0)throw std::runtime_error("Preference once overrides loop playback");playing_=false;restore("1 0 all",false);if(playbackSessionMode_!="all")throw std::runtime_error("All preference reload");document.addFrame();refresh();togglePlayback();playbackDue_=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);playbackTick();if(!playing_ || document.activeFrameIndex()!=0)throw std::runtime_error("Preference all overrides loop playback");playing_=false;std::ostringstream serialized;writePlaybackPreferences(serialized);restore(serialized.str().c_str(),false);if(playbackSessionMode_!="all")throw std::runtime_error("Mode preference serialization roundtrip");restore("1 0 tag",false);if(!playbackTagMode_ || playbackSessionMode_!="tag")throw std::runtime_error("Tag preference reload");setPlaybackLoopMode(true);document.undo();refresh();if(playbackSessionMode_!="once" || savedPlaybackMode_!=std::optional<std::string>{"all"})throw std::runtime_error("Loop undo changed saved preference");document=Document(1,1);document.setImportedLoop(false);refresh();if(playbackSessionMode_!="all" || document.animationLoop())throw std::runtime_error("New project did not restore saved session mode");savedPlaybackMode_.reset();playbackRate_=1;playbackReturnToStart_=false;document=Document();refresh();}
  void smokePlayTagMode(){smoke_=true;savedPlaybackMode_.reset();homeOpen_=false;documentOpen_=true;playing_=false;document=Document(1,1);for(int i=0;i<5;++i)document.addFrame();refresh();const auto frames=document.timeline().state().frames;auto make=[&](int a,int b,std::optional<int> repeats,const char* direction="forward"){timeline::LoopSection section;section.name=U"tag";section.startFrameId=frames[a].id;section.endFrameId=frames[b].id;section.repeatCount=repeats;section.direction=direction;return document.createLoopSection(section);};const auto first=make(1,2,2),later=make(3,4,2);make(5,5,{});document.selectFrame(frames[1].id);refresh();document.markSaved();const auto history=document.historySize();const auto revision=document.revision();setPlaybackTagMode();if(!playbackTagMode_ || playing_ || document.historySize()!=history || document.revision()!=revision || document.dirty())throw std::runtime_error("Tag mode session-only");togglePlayback();if(document.frame().id!=frames[1].id || playbackTagCycle_!=first)throw std::runtime_error("Tag finite start");auto tick=[&](int index){playbackDue_=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);playbackTick();if(!playing_ || document.frame().id!=frames[index].id)throw std::runtime_error("Tag sequence "+std::to_string(index));};for(int index:{2,1,2,3,4,3,4,5,0,1})tick(index);if(loopPlayback_.current.sectionId!=first || playbackTagCycle_!=first)throw std::runtime_error("Tag finite cycle restores anchor");tick(2);const auto paused=loopPlayback_;togglePlayback();togglePlayback();if(document.frame().id!=frames[2].id || loopPlayback_.current.iteration!=paused.current.iteration)throw std::runtime_error("Tag pause preserves iteration");tick(1);if(document.historySize()!=history || document.dirty() || document.animationLoop()!=true)throw std::runtime_error("Tag playback changed document");setPlaybackLoopMode(true);document.selectFrame(frames[0].id);refresh();setPlaybackTagMode();if(playing_ || !playbackTagMode_)throw std::runtime_error("Running tag outside section stops");togglePlayback();tick(1);if(!loopPlayback_.current.sectionId.empty())throw std::runtime_error("Tag no-label fallback all");playing_=false;document=Document(1,1);for(int i=0;i<3;++i)document.addFrame();refresh();const auto secondFrames=document.timeline().state().frames;timeline::LoopSection outer;outer.name=U"outer";outer.startFrameId=secondFrames[0].id;outer.endFrameId=secondFrames[3].id;document.createLoopSection(outer);timeline::LoopSection inner;inner.name=U"inner";inner.startFrameId=secondFrames[1].id;inner.endFrameId=secondFrames[2].id;inner.direction="ping-pong-reverse";document.createLoopSection(inner);document.selectFrame(secondFrames[1].id);refresh();setPlaybackTagMode();togglePlayback();if(document.frame().id!=secondFrames[2].id || loopPlayback_.current.sectionId!=document.timeline().state().loopSections.back().id)throw std::runtime_error("Tag chooses innermost directional start");const auto due=playbackDue_;setPlaybackTagMode();if(playbackDue_!=due || document.frame().id!=secondFrames[2].id)throw std::runtime_error("Tag infinite reselect no-op");document.selectFrame(secondFrames[3].id);refresh();if(!playing_ || loopPlayback_.current.sectionId!=document.timeline().state().loopSections.front().id)throw std::runtime_error("Tag click retarget outer");setPlaybackLoopMode(false);document.undo();refresh();if(playbackTagMode_)throw std::runtime_error("Loop history restores non-tag mode");playing_=false;document=Document();refresh();}
  void smokePlayAllMode(){smoke_=true;savedPlaybackMode_.reset();homeOpen_=false;documentOpen_=true;playing_=false;loopPlayback_={};document=Document(1,1);document.addFrame();refresh();if(!document.animationLoop())throw std::runtime_error("All default loop");playOnceMode();const auto history=document.historySize();const auto frame=document.frame().id;setPlaybackLoopMode(true);if(!document.animationLoop() || document.historySize()!=history+1 || document.frame().id!=frame)throw std::runtime_error("All document transaction");const auto revision=document.revision();setPlaybackLoopMode(true);if(document.historySize()!=history+1 || document.revision()!=revision)throw std::runtime_error("All no-op history");document.undo();if(document.animationLoop())throw std::runtime_error("All undo");document.redo();if(!document.animationLoop())throw std::runtime_error("All redo");togglePlayback();if(document.frame().id!=frame)throw std::runtime_error("All starts current frame");playbackDue_=std::chrono::steady_clock::now()-std::chrono::milliseconds(1);playbackTick();if(!playing_ || document.activeFrameIndex()!=0)throw std::runtime_error("All wraps last frame");playing_=false;const auto section=document.createLoopSection();startLoopPlayback(section);const auto at=document.frame().id;const auto due=playbackDue_;const auto sectionHistory=document.historySize();setPlaybackLoopMode(true);if(!playing_ || !loopPlayback_.current.sectionId.empty() || document.frame().id!=at || playbackDue_!=due || document.historySize()!=sectionHistory)throw std::runtime_error("All clears section no-op retains schedule");setPlaybackLoopMode(false);const auto changedDue=playbackDue_;setPlaybackLoopMode(true);if(!playing_ || document.frame().id!=at || playbackDue_!=changedDue || playbackRevision_!=document.revision())throw std::runtime_error("All running changed mode retains frame schedule");playing_=false;document=Document();refresh();}
  void smokePlayOnceMode(){smoke_=true;savedPlaybackMode_.reset();homeOpen_=false;documentOpen_=true;document=Document(1,1);document.addFrame();refresh();const auto frame=document.frame().id;const auto history=document.historySize();playOnceMode();if(document.animationLoop() || document.historySize()!=history+1 || document.frame().id!=frame)throw std::runtime_error("Play once document transaction");playOnceMode();if(document.historySize()!=history+1)throw std::runtime_error("Play once no-op history");document.undo();if(!document.animationLoop())throw std::runtime_error("Play once undo");document.redo();if(document.animationLoop())throw std::runtime_error("Play once redo");togglePlayback();if(document.activeFrameIndex()!=0)throw std::runtime_error("Play once start");playbackDue_=std::chrono::steady_clock::now()-std::chrono::seconds(2);playbackTick();if(playing_ || document.activeFrameIndex()!=0)throw std::runtime_error("Play once complete");document.undo();const auto section=document.createLoopSection();startLoopPlayback(section);const auto at=document.frame().id;playOnceMode();if(!playing_ || !loopPlayback_.current.sectionId.empty() || document.frame().id!=at)throw std::runtime_error("Play once clears section without seeking");playing_=false;savedPlaybackMode_.reset();document=Document();refresh();}
  void smokeLayerTransformSelection(){smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;requestFocus();document=Document(6,3);document.beginStroke({0,0},0xff111111);document.commitStroke();auto lower=document.layer().id;document.addLayer();document.beginStroke({3,1},0xff222222);document.commitStroke();auto upper=document.layer().id;document.selectTimelineLayer(lower,0);document.selectTimelineLayer(upper,1);refresh();auto history=document.historySize();if(!menuCommands_.invoke("transform") || !document.selection() || document.selection()->width!=4 || document.selection()->height!=2 || document.historySize()!=history || !selectionTool_)throw std::runtime_error("Multilayer transform menu union");document.previewSelection({});ui::KeyMessage transform(ui::kKeyDownMessage,ui::kKeyT,ui::kKeyCtrlModifier,0,0);onProcessMessage(&transform);if(!document.selection() || document.selection()->width!=4 || document.historySize()!=history)throw std::runtime_error("Multilayer CtrlT union");document=Document();refresh();}
  void smokeFlipContent(){smokeLayerTransformSelection();smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;requestFocus();document=Document(3,2);document.beginStroke({0,0},0xff123456);document.commitStroke();refresh();auto history=document.historySize();if(!menuCommands_.invoke("flipHorizontal") || document.pixels()[2]!=0xff123456 || document.historySize()!=history+1)throw std::runtime_error("Mirror menu");document.undo();ui::KeyMessage flip(ui::kKeyDownMessage,ui::kKeyV,ui::kKeyShiftModifier,0,0);onProcessMessage(&flip);if(document.pixels()[3]!=0xff123456)throw std::runtime_error("Mirror ShiftV shortcut");document=Document();refresh();}
  void smokeRotateContent90(){smokeFlipContent();smoke_=true;homeOpen_=false;documentOpen_=true;document=Document(6,4);document.beginStroke({1,1},0xff123456);document.commitStroke();document.commitSelection({},SelectionMask{1,1,4,2,{}});refresh();auto history=document.historySize();if(!menuCommands_.invoke("rotateContentClockwise") || document.pixels()[3]!=0xff123456 || document.historySize()!=history+1)throw std::runtime_error("Rotate90 clockwise menu");document.undo();if(!menuCommands_.invoke("rotateContentCounterClockwise") || document.pixels()[20]!=0xff123456 || document.width()!=6 || document.height()!=4)throw std::runtime_error("Rotate90 counterclockwise menu");document=Document();refresh();}
  void smokeRotateContent180(){smokeRotateContent90();smoke_=true;homeOpen_=false;documentOpen_=true;document=Document(3,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.commitSelection({},SelectionMask{0,0,3,1,{}});refresh();selectionPivot_=TransformPoint{.5,.5};auto history=document.historySize();if(!menuCommands_.invoke("rotateContent180") || document.pixels()[2]!=0xff123456 || document.pixels()[0]!=0 || selectionPivot_ || document.historySize()!=history+1)throw std::runtime_error("Rotate180 menu");document.undo();if(document.pixels()[0]!=0xff123456)throw std::runtime_error("Rotate180 menu undo");document=Document();refresh();}
  void smokeCenterContent(){smokeRotateContent180();smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;document=Document(8,8);document.beginStroke({0,0},0xff123456);document.commitStroke();document.commitSelection({},SelectionMask{0,0,2,2,{}});refresh();selectionPivot_=TransformPoint{.5,.5};if(!menuCommands_.invoke("centerContentHorizontal") || document.selection()->x!=3 || document.selection()->y!=0 || !selectionPivot_ || selectionPivot_->x!=3.5 || selectionPivot_->y!=.5)throw std::runtime_error("Horizontal center menu/pivot");document.undo();refresh();if(!menuCommands_.invoke("centerContentVertical") || document.selection()->x!=0 || document.selection()->y!=3)throw std::runtime_error("Vertical center menu");document.undo();refresh();if(!menuCommands_.invoke("centerContentBoth") || document.selection()->x!=3 || document.selection()->y!=3)throw std::runtime_error("Both center menu");document=Document();refresh();}
  void smokeCutSelectionState(){smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;document=Document(3,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.previewSelection(SelectionMask{0,0,1,1,{}});refresh();selectionPropertiesActive_=selectionFreeTransform_=true;selectionPivot_=TransformPoint{.5,.5};auto history=document.historySize();copySelectionPixels(true);if(document.selection() || selectionPropertiesActive_ || selectionFreeTransform_ || selectionPivot_ || document.pixels()[0]!=0 || document.historySize()!=history+1)throw std::runtime_error("Cut finishes selection UI state");document.undo();document.previewSelection(SelectionMask{1,0,1,1,{}});refresh();selectionPropertiesActive_=true;history=document.historySize();copySelectionPixels(true);if(document.selection() || selectionPropertiesActive_ || document.historySize()!=history)throw std::runtime_error("Empty cut finishes selection UI state");document.previewSelection(SelectionMask{0,0,1,1,{}});auto payload=document.copyPixels();if(!payload || !document.beginFloatingPaste(*payload,2,0))throw std::runtime_error("Floating cut fixture");refresh();selectionPropertiesActive_=true;copySelectionPixels(true);if(document.floating() || document.selection() || selectionPropertiesActive_ || document.pixels()[0]!=0xff123456 || document.pixels()[2]!=0 || document.historySize()!=history)throw std::runtime_error("Clipboard floating cut cancels without pixel edit");document=Document();refresh();}
  void smokeCopyMerged(){smokeCutSelectionState();smokeCenterContent();smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;requestFocus();document=Document(2,1);document.fillSelectionOrCanvas(0xffff0000);document.addLayer();document.fillSelectionOrCanvas(0xff0000ff);document.setLayerOpacity(.5);refresh();auto history=document.historySize();if(!menuCommands_.invoke("copyMerged"))throw std::runtime_error("Copy merged menu");auto copied=pixelClipboard_.read();if(!copied || copied->pixels[0]!=0xff800080 || document.historySize()!=history)throw std::runtime_error("Copy merged visible stack");document.selectTimelineCel(document.cel().id);document.copySelectedCels();celClipboardSnapshot_=document.exportCelClipboard();frameClipboardSnapshot_={};ui::KeyMessage copy(ui::kKeyDownMessage,ui::kKeyC,ui::kKeyCtrlModifier|ui::kKeyShiftModifier,0,0);onProcessMessage(&copy);copied=pixelClipboard_.read();if(!copied || copied->pixels[0]!=0xff800080 || hasApplicationCelClipboard() || document.hasCelClipboard())throw std::runtime_error("Copy merged shortcut clipboard priority");document=Document(3,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.selectTimelineCel(document.cel().id);document.copySelectedCels();celClipboardSnapshot_=document.exportCelClipboard();frameClipboardSnapshot_={};document.clearTimelineSelection();frameSelectionExplicit_=false;document.previewSelection(SelectionMask{1,0,1,1,{}});refresh();copySelectionPixels(false);if(!hasApplicationCelClipboard() || !document.hasCelClipboard())throw std::runtime_error("Empty pixel copy preserves timeline clipboard");document.previewSelection(SelectionMask{0,0,1,1,{}});refresh();copySelectionPixels(false);if(hasApplicationCelClipboard() || document.hasCelClipboard() || document.hasFrameClipboard())throw std::runtime_error("Pixel copy replaces timeline clipboard");document=Document();refresh();}
  void smokeSelectionFill(){smokeCopyMerged();smoke_=true;playing_=false;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;requestFocus();document=Document(3,1);document.commitSelection({},SelectionMask{0,0,2,1,{1,0}});document.setPaletteRole(0x00123456,false,true);refresh();const auto mask=document.selection();const auto history=document.historySize();if(!menuCommands_.invoke("fillForeground") || document.pixels()[0]!=0x00123456 || document.pixels()[1]!=0 || !selectionEqual(mask,document.selection()) || document.historySize()!=history+1)throw std::runtime_error("Fill menu exact RGBA mask");document.undo();ui::KeyMessage fill(ui::kKeyDownMessage,ui::kKeyF,ui::kKeyNoneModifier,0,0);onProcessMessage(&fill);if(document.pixels()[0]!=0x00123456 || !selectionEqual(mask,document.selection()))throw std::runtime_error("Fill F shortcut");document=Document();refresh();}
  void smokeCelSelectionClipboard(){smokeSelectionFill();smoke_=true;playing_=false;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;document=Document(3,1);document.beginStroke({1,0},0xff123456);document.commitStroke();refresh();document.commitSelection({},SelectionMask{0,0,3,1,{0,1,0}});document.selectTimelineCel(document.cel().id);refresh();if(!menuCommands_.invoke("copy") || !applicationCelSelectionOnly())throw std::runtime_error("Selection Cel menu copy");document=Document(4,1);refresh();document.selectTimelineCel(document.cel().id);refresh();auto history=document.historySize();if(!menuCommands_.invoke("paste") || !document.floating() || document.pixels()[1]!=0xff123456 || document.historySize()!=history)throw std::runtime_error("Cross project selection Cel floating paste");ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(document.floating() || document.pixels()[1]!=0 || document.historySize()!=history)throw std::runtime_error("Selection Cel UI cancel");document.selectTimelineCel(document.cel().id);refresh();menuCommands_.invoke("paste");ui::KeyMessage enter(ui::kKeyDownMessage,ui::kKeyEnter,ui::kKeyNoneModifier,0,0);onProcessMessage(&enter);if(document.floating() || document.selection() || document.pixels()[1]!=0xff123456 || document.historySize()!=history+2)throw std::runtime_error("Selection Cel UI commit and clear");document.undo();if(!document.selection() || document.pixels()[1]!=0xff123456)throw std::runtime_error("Selection Cel UI undo clear");document.undo();if(document.pixels()[1]!=0)throw std::runtime_error("Selection Cel UI undo pixels");document.redo();document.redo();if(document.selection() || document.pixels()[1]!=0xff123456)throw std::runtime_error("Selection Cel UI redo commit and clear");celClipboardSnapshot_={};document=Document();refresh();}
  void smokeCelClipboard(){smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;document=Document(1,1);document.beginStroke({0,0},0xff123456);document.commitStroke();const auto first=document.frame().id;document.addFrame();const auto second=document.frame().id;refresh();document.selectTimelineCel(document.timeline().findCel(document.layer().id,first)->id);refresh();if(!menuCommands_.invoke("copy")||!document.hasCelClipboard())throw std::runtime_error("Cel copy menu");document.selectTimelineCel(document.timeline().findCel(document.layer().id,second)->id);refresh();if(!menuCommands_.invoke("paste")||document.pixels()[0]!=0xff123456)throw std::runtime_error("Cel paste menu");document.undo();if(document.pixels()[0]!=0)throw std::runtime_error("Cel paste undo");document.selectTimelineCel(document.timeline().findCel(document.layer().id,first)->id);refresh();if(!menuCommands_.invoke("cut")||document.pixels()[0]!=0||!document.timelineSelection().cels.empty())throw std::runtime_error("Cel cut menu");document.undo();if(document.pixels()[0]!=0xff123456||!document.timelineSelection().cels.empty())throw std::runtime_error("Cel cut undo");document.redo();document.selectTimelineCel(document.timeline().findCel(document.layer().id,second)->id);refresh();if(!menuCommands_.invoke("paste")||document.pixels()[0]!=0xff123456)throw std::runtime_error("Cel cut clipboard");document=Document(1,1);if(document.hasCelClipboard())throw std::runtime_error("Cross document cel clipboard");refresh();document.selectTimelineCel(document.cel().id);refresh();if(!menuCommands_.invoke("paste") || document.pixels()[0]!=0xff123456)throw std::runtime_error("Cross project application Cel paste");document.undo();if(document.pixels()[0]!=0)throw std::runtime_error("Cross project application Cel undo");document.selectFrameHeader(document.frame().id);frameSelectionExplicit_=true;ui::KeyMessage copyFrame(ui::kKeyDownMessage,ui::kKeyC,ui::kKeyCtrlModifier,0,0);onProcessMessage(&copyFrame);document.selectTimelineCel(document.cel().id);frameSelectionExplicit_=false;refresh();if(hasApplicationCelClipboard())throw std::runtime_error("Frame copy retained stale application Cel clipboard");document.selectTimelineCel(document.cel().id);copyTimelineCels();if(!hasApplicationCelClipboard())throw std::runtime_error("Cel snapshot setup");document.clearTimelineSelection();copyTimelineCels();if(hasApplicationCelClipboard() || document.hasCelClipboard())throw std::runtime_error("Empty Cel copy retained application clipboard");const auto emptyCopyHistory=document.historySize();pasteTimelineCels();if(document.historySize()!=emptyCopyHistory)throw std::runtime_error("Empty Cel clipboard pasted stale content");celClipboardSnapshot_={};refresh();}
  void smokeMigratedTimelineActions(){
    smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;document=Document(2,1);
    document.beginStroke({0,0},0xff123456);document.commitStroke();const auto root=document.cel().id;const auto first=document.frame().id;document.addLinkedFrame();const auto alias=document.cel().id;const auto last=document.frame().id;
    document.selectTimelineCel(root);refresh();
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,3);auto item=dynamic_cast<PixelMenuItem*>(menu.children()[11]);if(!item || !item->isEnabled())throw std::runtime_error("Root unlink menu disabled");const auto h=document.revision();item->Click();if(document.timeline().findCelById(alias)->linkedCelId || document.revision()!=h+1)throw std::runtime_error("Root unlink menu transaction");document.undo();}
    document.selectFrameHeader(first);document.selectFrameHeader(last,1);contextFrameId_=last;refresh();
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,2);auto item=dynamic_cast<PixelMenuItem*>(menu.children()[7]);if(!item || !item->isEnabled())throw std::runtime_error("Reverse frames menu disabled");const auto h=document.revision();item->Click();if(document.timeline().state().frames.front().id!=last || document.revision()!=h+1)throw std::runtime_error("Reverse frames menu transaction");document.undo();}
    document.selectTimelineCel(root);document.commitSelection({},SelectionMask{0,0,1,1,{}});refresh();const auto h=document.revision();
    if(!menuCommands_.invoke("cut") || document.pixels()[0]!=0 || document.selection() || !applicationCelSelectionOnly() || document.revision()!=h+1)throw std::runtime_error("Selected Cel cut menu transaction");
    document.undo();if(!document.selection() || document.pixels()[0]!=0xff123456 || !document.timeline().findCelById(alias)->linkedCelId)throw std::runtime_error("Selected Cel cut menu undo");document.redo();if(document.pixels()[0]!=0 || document.selection())throw std::runtime_error("Selected Cel cut menu redo");celClipboardSnapshot_={};document=Document();refresh();
  }
  void smokeLayerMergeAndCelLink(){
    smoke_=true;homeOpen_=false;documentOpen_=true;playing_=false;paletteFocused_=false;frameSelectionExplicit_=false;document=Document(1,1);
    document.beginStroke({0,0},0xff123456);document.commitStroke();const auto root=document.cel().id;document.addFrame();const auto alias=document.cel().id;
    document.selectTimelineCel(root);document.selectTimelineCel(alias,1);refresh();
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,3);auto item=dynamic_cast<PixelMenuItem*>(menu.children()[10]);if(!item || !item->isEnabled())throw std::runtime_error("Connect Cel context disabled");const auto rev=document.revision();item->Click();if(document.timeline().findCelById(alias)->linkedCelId!=root || document.revision()!=rev+1)throw std::runtime_error("Connect Cel context action");document.undo();if(document.timeline().findCelById(alias)->linkedCelId)throw std::runtime_error("Connect Cel context undo");document.redo();}
    document.addLayer();document.beginStroke({0,0},0x80445566);document.commitStroke();const auto top=document.layer().id;document.selectTimelineLayer(top);refresh();const auto expected=compositeNormalRegion(document.timeline(),document.frame().id,{0,0,1,1});
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,1);auto item=dynamic_cast<PixelMenuItem*>(menu.children()[5]);if(!item || !item->isEnabled())throw std::runtime_error("Merge down context disabled");const auto rev=document.revision();item->Click();if(document.timeline().state().layers.size()!=1 || document.pixels()!=expected || document.revision()!=rev+1)throw std::runtime_error("Merge down context action");document.undo();if(document.layer().id!=top || document.timelineSelection().layers!=std::vector<std::string>{top})throw std::runtime_error("Merge down context undo");document.redo();if(document.timeline().state().layers.size()!=1)throw std::runtime_error("Merge down context redo");}
    document=Document();refresh();
  }
  void smokeFrameContextClipboard(){
    frameClipboardSnapshot_={};
    smoke_=true;homeOpen_=false;documentOpen_=true;playing_=false;paletteFocused_=false;document=Document(1,1);document.beginStroke({0,0},0xff123456);document.commitStroke();const auto first=document.frame().id;document.addFrame();const auto last=document.frame().id;
    document.selectFrameHeader(first);markFrameSelection();contextFrameId_=first;refresh();
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,2);auto copy=dynamic_cast<PixelMenuItem*>(menu.children()[5]);auto paste=dynamic_cast<PixelMenuItem*>(menu.children()[6]);if(!copy || !copy->isEnabled() || !paste || paste->isEnabled())throw std::runtime_error("Frame clipboard initial context state");const auto rev=document.revision();copy->Click();if(!document.hasFrameClipboard() || hasApplicationCelClipboard() || document.revision()!=rev)throw std::runtime_error("Frame context copy");}
    document.selectFrameHeader(last);document.selectFrameHeader(first,1);markFrameSelection();contextFrameId_=first;refresh();const auto selection=document.selectedFrames();const auto rev=document.revision();
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,2);auto paste=dynamic_cast<PixelMenuItem*>(menu.children()[6]);if(!paste || !paste->isEnabled())throw std::runtime_error("Frame clipboard context paste disabled");paste->Click();}
    if(document.activeFrameIndex()!=2 || document.pixels()[0]!=0xff123456 || document.revision()!=rev+1 || frameSelectionExplicit_ || document.timelineSelection().cels.empty())throw std::runtime_error("Frame context paste semantics");document.undo();if(document.selectedFrames()!=selection || document.timeline().state().frames.size()!=2)throw std::runtime_error("Frame context paste undo");document.redo();if(document.timeline().state().frames.size()!=3 || document.timelineSelection().cels.empty())throw std::runtime_error("Frame context paste redo");document=Document();frameSelectionExplicit_=false;refresh();
  }
  void smokeTimelineGifDrop(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;paletteFocused_=false;docking_=panels::Model{};layersPanelOpen_=true;frameScroll_=frameScrollRemainder_=0;setBounds(gfx::Rect(0,0,1280,960));requestFocus();
    const auto fixtureRoot=assets_.parent_path()/"gif-timeline-test-owned";std::filesystem::create_directories(fixtureRoot);const auto path=fixtureRoot/"walk.gif";Document source(2,1);source.beginStroke({0,0},0xff0000ff);source.commitStroke();source.setFrameDuration(120);source.addFrame();source.beginStroke({1,0},0xff00ff00);source.commitStroke();source.setFrameDuration(270);GifExportOptions options;options.trim=false;const auto encoded=encodeAnimationGif(source,options);writeExportBytesAtomic(path,encoded.bytes);const auto decoded=openGifAnimation(path);if(decoded.timeline().state().frames.size()!=2 || decoded.timeline().state().frames[0].duration!=120 || decoded.timeline().state().frames[1].duration!=270 || decoded.timeline().resolveSurface(decoded.timeline().findCel(decoded.layer().id,decoded.timeline().state().frames[1].id)->id).surface->pixels!=std::vector<Pixel>({0,0xff00ff00}))throw std::runtime_error("GIF drop decoder fixture duration");
    class Paths final:public os::DragDataProvider{base::paths paths_;public:explicit Paths(base::paths paths):paths_(std::move(paths)){}base::paths getPaths()override{return paths_;}os::SurfaceRef getImage()override{return {};}std::string getUrl()override{return {};}bool contains(os::DragDataItemType type)override{return type==os::DragDataItemType::Paths;}};
    auto event=[&](gfx::Point point,base::paths paths){return os::DragEvent(display()->nativeWindow(),os::DropOperation::Copy,point,std::make_unique<Paths>(std::move(paths)));};
    document=Document(2,1);document.addFrame();document.setFrameDuration(350);refresh();const auto grid=timelineFrameViewport();const auto point=gfx::Point(grid.x+12*uiScale+uiScale,grid.y+uiScale);auto native=display()->nativeWindow();if(!native->hasDragTarget())throw std::runtime_error("Native OLE drag target not registered");
    auto enter=event(point,{path.u8string()});native->notifyDragEnter(enter);if(gifDropTargetIndex_!=1 || enter.dropResult()!=os::DropOperation::Copy)throw std::runtime_error("Native OLE GIF drag enter target");auto outside=event(canvasViewport().center(),{path.u8string()});native->notifyDrag(outside);if(gifDropTargetIndex_)throw std::runtime_error("Native GIF preview outside grid");auto mixed=event(point,{path.u8string(),"other.png"});native->notifyDrag(mixed);if(gifDropTargetIndex_)throw std::runtime_error("Native GIF mixed file preview");auto move=event(point,{path.u8string()});native->notifyDrag(move);if(gifDropTargetIndex_!=1)throw std::runtime_error("Native GIF drag preview restore");native->notifyDragLeave(move);if(gifDropTargetIndex_)throw std::runtime_error("Native GIF drag leave preview");
    auto preview=event(point,{path.u8string()});native->notifyDragEnter(preview);const auto history=document.historySize();auto drop=event(point,{path.u8string()});native->notifyDrop(drop);if(!drop.acceptDrop() || gifDropTargetIndex_ || document.timeline().state().layers.size()!=2 || document.timeline().state().frames.size()!=3 || document.historySize()!=history+1 || document.activeFrameIndex()!=1 || document.timelineSelection().cels.size()!=2 || document.timeline().state().frames[1].duration!=350 || document.timeline().state().frames[2].duration!=270 || document.pixels()!=decoded.timeline().resolveSurface(decoded.timeline().findCel(decoded.layer().id,decoded.timeline().state().frames[0].id)->id).surface->pixels)throw std::runtime_error("Native GIF timeline drop structure/history/pixels");document.undo();if(document.timeline().state().frames.size()!=2 || document.timeline().state().layers.size()!=1)throw std::runtime_error("GIF drop undo");document.redo();if(document.timeline().state().frames.size()!=3 || document.timeline().state().layers.size()!=2)throw std::runtime_error("GIF drop redo");
    document=Document(3,1);refresh();const auto revision=document.revision();auto mismatch=event(point,{path.u8string()});native->notifyDragEnter(mismatch);native->notifyDrop(mismatch);if(document.revision()!=revision || document.timeline().state().layers.size()!=1 || document.timeline().state().frames.size()!=1 || gifDropTargetIndex_)throw std::runtime_error("GIF dimension failure atomic");auto missing=event(point,{(fixtureRoot/"missing.gif").u8string()});native->notifyDrop(missing);if(document.revision()!=revision || document.timeline().state().layers.size()!=1)throw std::runtime_error("GIF decode failure atomic");
    document=Document();clearTimelineGifDrop();refresh();
  }
  void smokeCrossProjectFrameClipboard(){
    smoke_=true;homeOpen_=false;documentOpen_=true;playing_=false;paletteFocused_=false;celClipboardSnapshot_={};frameClipboardSnapshot_={};document=Document(1,1);document.beginStroke({0,0},0xff123456);document.commitStroke();document.addLayer();document.beginStroke({0,0},0xffabcdef);document.commitStroke();document.selectFrameHeader(document.frame().id);markFrameSelection();refresh();
    if(!menuCommands_.invoke("copy") || !hasApplicationFrameClipboard())throw std::runtime_error("Cross frame menu copy");
    document=Document(1,1);document.selectFrameHeader(document.frame().id);markFrameSelection();contextFrameId_=document.frame().id;refresh();const auto history=document.historySize();
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,2);auto paste=dynamic_cast<PixelMenuItem*>(menu.children()[6]);if(!paste || !paste->isEnabled())throw std::runtime_error("Cross frame context paste enable");paste->Click();}
    if(document.timeline().state().layers.size()!=2 || document.timeline().state().frames.size()!=2 || document.pixels()[0]!=0xffabcdef || document.historySize()!=history+1 || !frameSelectionExplicit_ || document.selectedFrames().size()!=1 || !document.timelineSelection().cels.empty())throw std::runtime_error("Cross frame source-close paste/header selection");
    document.undo();if(document.timeline().state().layers.size()!=1 || document.timeline().state().frames.size()!=1)throw std::runtime_error("Cross frame structural undo");document.redo();if(document.timeline().state().layers.size()!=2 || document.timeline().state().frames.size()!=2)throw std::runtime_error("Cross frame structural redo");
    document=Document(2,1);document.selectFrameHeader(document.frame().id);markFrameSelection();refresh();const auto revision=document.revision();pasteTimelineFrames();if(document.revision()!=revision || document.timeline().state().frames.size()!=1 || document.timeline().state().layers.size()!=1)throw std::runtime_error("Cross frame dimension refusal atomic");
    document=Document(1,1);document.beginStroke({0,0},0xff556677);document.commitStroke();const auto cutFrame=document.frame().id;document.addFrame();document.selectFrameHeader(cutFrame);markFrameSelection();refresh();if(!menuCommands_.invoke("cut") || document.timeline().state().frames.size()!=1 || !hasApplicationFrameClipboard())throw std::runtime_error("Cross frame cut capture");
    document=Document(1,1);document.selectFrameHeader(document.frame().id);markFrameSelection();refresh();if(!menuCommands_.invoke("paste") || document.pixels()[0]!=0xff556677 || document.selectedFrames().size()!=1)throw std::runtime_error("Cross frame cut source-close paste");
    document.selectTimelineCel(document.cel().id);frameSelectionExplicit_=false;refresh();copyTimelineCels();if(hasApplicationFrameClipboard() || !hasApplicationCelClipboard())throw std::runtime_error("Cel copy replaces frame snapshot");
    document.selectFrameHeader(document.frame().id);markFrameSelection();copyTimelineFrames();document.clearTimelineSelection();frameSelectionExplicit_=false;document.previewSelection(SelectionMask{0,0,1,1,{}});refresh();copySelectionPixels(false);if(hasApplicationFrameClipboard())throw std::runtime_error("Pixel copy replaces frame snapshot");
    document=Document();celClipboardSnapshot_={};frameClipboardSnapshot_={};frameSelectionExplicit_=false;refresh();
  }
  void smokeCelReverseContext(){
    smoke_=true;homeOpen_=false;documentOpen_=true;playing_=false;document=Document(1,1);document.beginStroke({0,0},0xff123456);document.commitStroke();const auto root=document.cel().id;const auto first=document.frame().id;document.addLinkedFrame();const auto alias=document.cel().id;const auto last=document.frame().id;document.selectTimelineCel(root);document.selectTimelineCel(alias,1);refresh();const auto rev=document.revision();
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,3);auto item=dynamic_cast<PixelMenuItem*>(menu.children()[9]);if(!item || !item->isEnabled())throw std::runtime_error("Reverse Cel context disabled");item->Click();}
    if(document.timeline().findCelById(root)->frameId!=last || document.timeline().findCelById(alias)->frameId!=first || document.timeline().findCelById(alias)->linkedCelId!=root || document.revision()!=rev+1)throw std::runtime_error("Reverse Cel context action");document.undo();if(document.timeline().findCelById(root)->frameId!=first)throw std::runtime_error("Reverse Cel context undo");document.redo();if(document.timeline().findCelById(root)->frameId!=last)throw std::runtime_error("Reverse Cel context redo");document=Document();refresh();
  }
  void smokeMergeLayerDownMenu(){
    smoke_=true;homeOpen_=false;documentOpen_=true;playing_=false;document=Document(1,1);document.beginStroke({0,0},0xff123456);document.commitStroke();const auto bottom=document.layer().id;document.addLayer();document.beginStroke({0,0},0x80445566);document.commitStroke();const auto top=document.layer().id;document.selectTimelineLayer(bottom);document.selectLayer(top);refresh();const auto expected=compositeNormalRegion(document.timeline(),document.frame().id,{0,0,1,1});const auto history=document.historySize();if(!menuCommands_.enabled("mergeLayerDown") || !menuCommands_.invoke("mergeLayerDown") || document.timeline().state().layers.size()!=1 || document.pixels()!=expected || document.historySize()!=history+1)throw std::runtime_error("Merge down main menu active target/pixels/history");document.undo();if(document.layer().id!=top || document.timeline().state().layers.size()!=2 || document.timelineSelection().layers!=std::vector<std::string>{bottom})throw std::runtime_error("Merge down main menu undo");document.redo();if(document.timeline().state().layers.size()!=1 || menuCommands_.enabled("mergeLayerDown"))throw std::runtime_error("Merge down main menu redo/sole layer guard");document.undo();document.selectLayer(bottom);refresh();if(menuCommands_.enabled("mergeLayerDown"))throw std::runtime_error("Merge down bottom guard");document.selectLayer(top);document.setLayerLocked(true);refresh();if(menuCommands_.enabled("mergeLayerDown"))throw std::runtime_error("Merge down locked guard");document.setLayerLocked(false);document.setLayerVisible(false);refresh();if(menuCommands_.enabled("mergeLayerDown"))throw std::runtime_error("Merge down hidden guard");document=Document();refresh();
  }
  void smokeSelectedLayerMerge(){
    smoke_=true;homeOpen_=false;documentOpen_=true;playing_=false;document=Document(1,1);document.beginStroke({0,0},0xff123456);document.commitStroke();const auto bottom=document.layer().id;document.addLayer();document.beginStroke({0,0},0x80445566);document.commitStroke();const auto top=document.layer().id;document.selectTimelineLayer(bottom);document.selectTimelineLayer(top,1);refresh();const auto expected=compositeNormalRegion(document.timeline(),document.frame().id,{0,0,1,1});const auto rev=document.revision();
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,1);auto item=dynamic_cast<PixelMenuItem*>(menu.children()[6]);if(!item || !item->isEnabled())throw std::runtime_error("Selected layer merge context disabled");item->Click();}
    if(document.timeline().state().layers.size()!=1 || document.pixels()!=expected || document.timelineSelection().layers!=std::vector<std::string>{document.layer().id} || document.revision()!=rev+1)throw std::runtime_error("Selected layer merge context action");document.undo();if(document.timeline().state().layers.size()!=2 || document.timelineSelection().layers.size()!=2)throw std::runtime_error("Selected layer merge context undo");document.redo();if(document.timeline().state().layers.size()!=1)throw std::runtime_error("Selected layer merge context redo");document.undo();refresh();if(!menuCommands_.invoke("mergeSelectedLayers") || document.timeline().state().layers.size()!=1)throw std::runtime_error("Selected layer merge top command");document=Document();refresh();
  }
  void smokeDuplicateLayerRows(){
    smoke_=true;homeOpen_=false;documentOpen_=true;playing_=false;document=Document(1,1);document.beginStroke({0,0},0xff123456);document.commitStroke();const auto bottom=document.layer().id;document.addLinkedFrame();document.addLayer();const auto top=document.layer().id;document.selectTimelineLayer(bottom);document.selectTimelineLayer(top,1);refresh();const auto rev=document.revision();
    {PixelMenu menu(skin_);buildLayerContextMenu(&menu,1);auto item=dynamic_cast<PixelMenuItem*>(menu.children()[1]);if(!item || !item->isEnabled())throw std::runtime_error("Duplicate rows context disabled");item->Click();}
    if(document.timeline().state().layers.size()!=4 || document.timelineSelection().layers.size()!=2 || document.revision()!=rev+1)throw std::runtime_error("Duplicate rows context action");document.undo();if(document.timeline().state().layers.size()!=2 || document.timelineSelection().layers.size()!=2)throw std::runtime_error("Duplicate rows context undo");document.redo();if(document.timeline().state().layers.size()!=4)throw std::runtime_error("Duplicate rows context redo");document.undo();refresh();if(!menuCommands_.invoke("duplicateLayer") || document.timeline().state().layers.size()!=4)throw std::runtime_error("Duplicate rows top command");document=Document();refresh();
  }
  void smokeSelectedLayerPropertiesEntry(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;document=Document(1,1);document.addLayer();document.addLayer();const auto layers=document.timeline().state().layers;document.selectTimelineLayer(layers[1].id);document.selectTimelineLayer(layers[2].id,1);document.selectLayer(layers[0].id);refresh();const auto selected=document.timelineSelection().layers;const auto history=document.historySize();if(!menuCommands_.invoke("openLayerProperties") || pending_!=Pending::LayerOpacity || paletteInput_->text()!=utf8Text(layers[1].name))throw std::runtime_error("Layer property menu selected source");paletteInput_->setText("selected");paletteInput_->Change();resolve(false);if(document.timeline().state().layers[0].name!=layers[0].name || document.timeline().state().layers[1].name!=U"selected" || document.timeline().state().layers[2].name!=U"selected" || document.layer().id!=layers[0].id || document.timelineSelection().layers!=selected || document.historySize()!=history+1)throw std::runtime_error("Layer property menu selected targets/history");document.undo();document.selectTimelineLayer(layers[2].id);refresh();layerProperties_->Click();paletteInput_->setText("toolbar");paletteInput_->Change();resolve(false);if(document.timeline().state().layers[2].name!=U"toolbar" || document.timeline().state().layers[0].name!=layers[0].name || document.timeline().state().layers[1].name!=layers[1].name)throw std::runtime_error("Layer property toolbar single selected");document.clearTimelineSelection();refresh();if(layerProperties_->isEnabled() || menuCommands_.invoke("openLayerProperties") || pending_!=Pending::None)throw std::runtime_error("Layer properties no selected targets disabled");document=Document();refresh();
  }
  void smokeLayerRowProperties(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;setBounds(gfx::Rect(0,0,1280,960));document=Document(1,1);document.addLayer();document.addLayer();const auto layers=document.timeline().state().layers;document.selectTimelineLayer(layers[1].id);document.selectTimelineLayer(layers[2].id,1);document.selectLayer(layers[0].id);refresh();const auto selected=document.timelineSelection().layers;const auto active=document.layer().id;auto history=document.historySize();auto twice=[&](int row,ui::MouseButton button){ui::MouseMessage mouse(ui::kDoubleClickMessage,os::PointerType::Mouse,button,ui::kKeyNoneModifier,layerRows_[row]->bounds().center());layerRows_[row]->onProcessMessage(&mouse);};twice(1,ui::kButtonRight);if(pending_!=Pending::None)throw std::runtime_error("Layer right double ignored");twice(1,ui::kButtonLeft);if(pending_!=Pending::LayerOpacity || document.layer().id!=active || document.timelineSelection().layers!=selected || document.historySize()!=history)throw std::runtime_error("Layer double preserves active/selection");paletteInput_->setText("batch");paletteInput_->Change();resolve(false);if(document.timeline().state().layers[0].name==U"batch" || document.timeline().state().layers[1].name!=U"batch" || document.timeline().state().layers[2].name!=U"batch" || document.historySize()!=history+1)throw std::runtime_error("Layer double selected batch targets");document.undo();twice(0,ui::kButtonLeft);paletteInput_->setText("single");paletteInput_->Change();resolve(false);if(document.timeline().state().layers[0].name!=U"single" || document.timeline().state().layers[1].name==U"single" || document.timelineSelection().layers!=selected)throw std::runtime_error("Layer double outside selection target");document.undo();refresh();ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,layerRows_[1]->bounds().center());beginTimelineGesture(1,1,-1,down);ui::MouseMessage captured(ui::kDoubleClickMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,layerRows_[1]->bounds().center());onProcessMessage(&captured);if(pending_!=Pending::LayerOpacity || timelineGesture_.kind || hasCapture() || document.timelineSelection().layers!=selected)throw std::runtime_error("Layer captured double preserves batch/release");resolve(false);document=Document();refresh();
  }
  void smokeFrameHeaderProperties(){
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;docking_=panels::Model{};layersPanelOpen_=true;docking_.select(2);setBounds(gfx::Rect(0,0,1280,960));document=Document(1,1);document.addFrame();document.addFrame();const auto frames=document.timeline().state().frames;document.selectFrameHeader(frames[0].id);document.selectFrameHeader(frames[1].id,1);document.selectFrame(frames[2].id);refresh();if(frameScroll_!=0 || frameHeaders_.size()<3 || !frameHeaders_[0]->timelineVisible || !frameHeaders_[1]->timelineVisible || !frameHeaders_[2]->timelineVisible)throw std::runtime_error("Frame header double-click fixture requires three visible frame titles");const auto selected=document.selectedFrames();const auto history=document.historySize();
    ui::MouseMessage rightDouble(ui::kDoubleClickMessage,os::PointerType::Mouse,ui::kButtonRight,ui::kKeyNoneModifier,frameHeaders_[0]->bounds().center());frameHeaders_[0]->onProcessMessage(&rightDouble);if(pending_!=Pending::None)throw std::runtime_error("Frame right double-click ignored");
    ui::MouseMessage doubleClick(ui::kDoubleClickMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,frameHeaders_[0]->bounds().center());frameHeaders_[0]->onProcessMessage(&doubleClick);if(pending_!=Pending::FrameDuration || document.frame().id!=frames[0].id || document.selectedFrames()!=selected || document.historySize()!=history)throw std::runtime_error("Frame header double-click target/selection/history pending="+std::to_string(int(pending_))+" target="+document.frame().id+" expected="+frames[0].id+" selected="+std::to_string(document.selectedFrames().size())+" expectedSelected="+std::to_string(selected.size())+" history="+std::to_string(document.historySize())+" expectedHistory="+std::to_string(history)+" scroll="+std::to_string(frameScroll_)+" enabled="+std::to_string(frameHeaders_[0]->isEnabled()));paletteInput_->setText("250");paletteInput_->Change();resolve(false);if(document.timeline().state().frames[0].duration!=250 || document.timeline().state().frames[1].duration!=250 || document.timeline().state().frames[2].duration!=100 || document.historySize()!=history+1)throw std::runtime_error("Frame double-click properties selected transaction");document.undo();
    refresh();ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyCtrlModifier,frameHeaders_[2]->bounds().center());beginTimelineGesture(2,-1,2,down);ui::MouseMessage capturedDouble(ui::kDoubleClickMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,frameHeaders_[2]->bounds().center());onProcessMessage(&capturedDouble);if(pending_!=Pending::FrameDuration || timelineGesture_.kind || hasCapture() || document.frame().id!=frames[2].id)throw std::runtime_error("Frame captured double-click settles gesture");resolve(false);document=Document();frameSelectionExplicit_=false;refresh();
  }
  void smokeFrameDurationTargets(){
    smoke_=true;homeOpen_=false;documentOpen_=true;playing_=false;document=Document(1,1);document.addFrame();document.addFrame();const auto frames=document.timeline().state().frames;document.selectFrameHeader(frames[0].id);document.selectFrameHeader(frames[1].id,1);document.selectFrame(frames[2].id);const auto selection=document.selectedFrames();refresh();const auto history=document.historySize();showFrameDuration();paletteInput_->setText("275");paletteInput_->Change();if(document.frame().duration!=275 || document.timeline().state().frames[0].duration!=100 || document.timeline().state().frames[1].duration!=100)throw std::runtime_error("Frame properties outside selection target");ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(pending_!=Pending::None || document.historySize()!=history+1 || document.selectedFrames()!=selection)throw std::runtime_error("Frame properties Escape commit");document.undo();if(document.frame().duration!=100)throw std::runtime_error("Frame properties target undo");document.redo();if(document.frame().duration!=275)throw std::runtime_error("Frame properties target redo");
    document.selectFrame(frames[0].id);refresh();showFrameDuration();paletteInput_->setText("350");paletteInput_->Change();paletteInput_->setText("400");paletteInput_->Change();const auto beforeClose=document.historySize();resolve(false);if(document.historySize()!=beforeClose+1 || document.timeline().state().frames[0].duration!=400 || document.timeline().state().frames[1].duration!=400 || document.timeline().state().frames[2].duration!=275 || document.selectedFrames()!=selection)throw std::runtime_error("Frame properties selected close transaction");document.undo();if(document.timeline().state().frames[0].duration!=100 || document.timeline().state().frames[1].duration!=100)throw std::runtime_error("Frame properties multi undo");document=Document();refresh();
  }
  void smokeAnimation() {
    smokeFrameHeaderProperties();smokeSelectedLayerPropertiesEntry();smokeLayerRowProperties();smokeFrameDurationTargets();
    smokeDuplicateLayerRows();
    smokeMergeLayerDownMenu();smokeSelectedLayerMerge();
    smokeCelReverseContext();
    smokeFrameContextClipboard();
    smokeCrossProjectFrameClipboard();
    smokeLayerMergeAndCelLink();
    smokeMigratedTimelineActions();
    smokePlaybackModePersistence();smokePlayTagMode();smokePlayAllMode();smokePlayOnceMode();smokeCelSelectionClipboard();smokeCelClipboard();smokeLayerSelectionTargets();smokeFrameCutAndMergeVisible();smokeSheetImport();smokeSymmetry();
    smokeImageBrush();smokeEyedropper();smokePaletteExtraction();smokeColorAdjustments();smokeColorReplacement();smokeReplacePaletteSampling();smokeImageResize();smokeStaticExport();smokeSelectionEnter();smokeTimelineDeleteShortcut();smokeTimelineDeleteToolbar();smokeFrameAddShortcutGuards();smokeLoopEditorNormalization();smokeLoopTrack();smokeCelContextDelete();smokeDeselectPending();smokeCelCopyShortcut();smokeDeleteRouting();smokeArrowNavigation();smokeFrameNavigation();smokeLockGestures();smokeVisibilityGestures();smokeAutoLinkGestures();smokeFrameDisabled();smokePlaybackPreferences();smokeSpriteSheet();smokeGifExport();
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
    // Entry/dropdown field focus must render exactly the shared selection
    // material, including its exterior; transparent interior never hits.
    for(const auto size:{gfx::Size(36,17),gfx::Size(70,18),gfx::Size(120,16),gfx::Size(119,18),gfx::Size(60,18)}) {
      auto surface=os::instance()->makeRgbaSurface((size.w+8)*uiScale,(size.h+8)*uiScale);surface->clear();
      auto border=uiPhysical(gfx::Rect(4,4,size.w,size.h));border.shrink(2*uiScale);
      const auto material=skin_.selectionMaterialBounds(border);
      {ui::Graphics graphics(surface);UiPaintScale scale(graphics);skin_.drawSelectionBorder(graphics,border,false);}
      for(int y=0;y<surface->height();++y)for(int x=0;x<surface->width();++x)
        if(bool(surface->getPixel(x,y)>>24)!=skin_.selectionContains(material,{x,y}))throw std::runtime_error("Input selection alpha/hit mismatch");
    }

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
  void smokeRange(bool focused=true) {commands_[1]->Click();brushOpacityInput_->requestFocus();showBrushRange(true);propertyRangeSlider_->value=72;propertyRangeSlider_->changed(72);if(focused) propertyRangeSlider_->requestFocus();}
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
  void smokeWindowInput(const LegacyCursors& cursors) {
    smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;
    palettePanelOpen_=colorPickerOpen_=layersPanelOpen_=previewPanelOpen_=true;
    docking_=panels::Model{};refresh();
    auto checkResize=[&](gfx::Rect box){for(const auto point:{gfx::Point(box.x+1,box.y+1),gfx::Point(box.center().x,box.y+1),gfx::Point(box.x2()-2,box.y+1),gfx::Point(box.x+1,box.center().y),gfx::Point(box.x2()-2,box.center().y),gfx::Point(box.x+1,box.y2()-2),gfx::Point(box.center().x,box.y2()-2),gfx::Point(box.x2()-2,box.y2()-2)}){
      const auto edges=panelResizeEdges(box,point);
      if(!edges || std::string(cursorAt(point))!=panelResizeCursor(edges))throw std::runtime_error("Window floating resize cursor mismatch custom="+std::to_string(docking_.custom)+" at="+std::to_string(point.x)+","+std::to_string(point.y)+" actual="+cursorAt(point));
    }};
    checkResize(previewPanel_->bounds());
    dockColumn(3,panels::Dock::Floating);
    auto& group=docking_.groups[docking_.groupOf(3)];group.floating={130,65,140,140};group.floatingArea=floatingArea(uiLogical(clientBounds()));refresh();
    auto native=display()->nativeWindow();const auto hwnd=static_cast<HWND>(native->nativeHandle());
    auto checkPoint=[&](gfx::Point point,ui::Widget* expected){
      POINT screen{point.x*native->scale(),point.y*native->scale()};ClientToScreen(hwnd,&screen);
      const gfx::Point absolute(screen.x,screen.y);
      if(native->pointFromScreen(absolute)!=point || native->pointToScreen(point)!=absolute)throw std::runtime_error("Window screen/client conversion differs from Win32");
      if(auto actual=manager()->pickFromScreenPos(absolute);actual!=expected){auto describe=[](ui::Widget* w){if(!w)return std::string("null");const auto b=w->bounds();return std::to_string(w->type())+" rect="+std::to_string(b.x)+","+std::to_string(b.y)+","+std::to_string(b.w)+","+std::to_string(b.h);};throw std::runtime_error("Window input target differs at "+std::to_string(point.x)+","+std::to_string(point.y)+" window origin="+std::to_string(screen.x-point.x)+","+std::to_string(screen.y-point.y)+" expected "+describe(expected)+" actual "+describe(actual)+" editor "+describe(this)+" bar "+describe(menuBar_));}
    };
    auto dispatchPointer=[&](ui::MessageType type,gfx::Point point,ui::Widget* target,ui::MouseButton button=ui::kButtonNone){
      auto message=new ui::MouseMessage(type,os::PointerType::Mouse,button,ui::kKeyNoneModifier,point);
      message->setDisplay(display());message->setRecipient(target);message->setPropagateToParent(true);
      manager()->enqueueMessage(message);manager()->dispatchMessages();
    };
    auto checkNativeMove=[&](gfx::Point point,ui::Widget* expected){
      checkPoint(point,expected);dispatchPointer(ui::kMouseMoveMessage,point,expected);
      const auto id=cursorAt(point);applyLegacyCursor(*native,cursors,id);
      const auto expectedCursor=std::string(id)=="none"?nullptr:static_cast<HCURSOR>(cursors.get(id)->nativeHandle());
      if(GetCursor()!=expectedCursor)throw std::runtime_error(std::string("Native cursor application mismatch: ")+id);
    };
    for(auto item:menuBar_->getMenu()->children())if(item->isVisible()){
      const auto r=item->bounds();if(!menuBar_->bounds().contains(r))throw std::runtime_error("Top menu wrapped outside its input container");
      for(int y=r.y+1;y<r.y2()-1;y+=3)for(int x=r.x+1;x<r.x2()-1;x+=3)checkPoint({x,y},item);
      checkNativeMove(r.center(),item);
      if(auto top=dynamic_cast<ui::MenuItem*>(item);top && top->isEnabled() && top->hasSubmenu()){
        const auto point=r.center();
        dispatchPointer(ui::kMouseDownMessage,point,item,ui::kButtonLeft);
        dispatchPointer(ui::kMouseUpMessage,point,item,ui::kButtonLeft);
        if(!top->hasSubmenuOpened())throw std::runtime_error("Native top-menu click failed to open submenu");
        const auto popup=top->getSubmenu();
        for(auto row:popup->children())if(row->isVisible() && !row->bounds().isEmpty() && popup->window()->bounds().contains(row->bounds().center()) && popup->parent()->childrenBounds().contains(row->bounds().center()))checkPoint(row->bounds().center(),row);
        menuBar_->cancelMenuLoop();manager()->dispatchMessages();
        if(manager()->getCapture())throw std::runtime_error("Top menu retained mouse capture after closing");
      }
    }
    const auto r=columnGeometry(uiLogical(clientBounds())).panel[3];const auto box=toDisplay({r.x,r.y,r.w,r.h});
    for(const auto point:{gfx::Point(box.x+1,box.y+1),gfx::Point(box.center().x,box.y+1),gfx::Point(box.x2()-2,box.y+1),gfx::Point(box.x+1,box.center().y),gfx::Point(box.x2()-2,box.center().y),gfx::Point(box.x+1,box.y2()-2),gfx::Point(box.center().x,box.y2()-2),gfx::Point(box.x2()-2,box.y2()-2)}){
      const auto edges=panelResizeEdges(box,point);
      if(!edges || std::string(cursorAt(point))!=panelResizeCursor(edges))throw std::runtime_error("Window floating resize cursor mismatch");
      checkPoint(point,frontWidgetAt(point));checkNativeMove(point,frontWidgetAt(point));
    }
    docking_=panels::Model{};refresh();const auto preview=previewPanel_->bounds();
    for(const auto point:{gfx::Point(preview.x+1,preview.center().y),gfx::Point(preview.x2()-2,preview.center().y),gfx::Point(preview.center().x,preview.y+1),gfx::Point(preview.center().x,preview.y2()-2)})checkNativeMove(point,frontWidgetAt(point));
  }
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
    fitCanvas();check(canvas_==original);
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
    smoke_=true;homeOpen_=false;documentOpen_=true;brushProfiles_[0]={};brushProfiles_[1]={};refresh();
    {auto previous=std::move(document);document=Document();showLayerOpacity();layerOpacityRange_->changed(40);layerOpacityRange_->changed(60);
      if(document.historySize()!=0 || document.dirty() || document.layer().opacity!=.6)throw std::runtime_error("Opacity preview smoke failed");
      ui::KeyMessage esc(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&esc);
      if(document.historySize()!=1 || document.layer().opacity!=.6 || pending_!=Pending::None)throw std::runtime_error("Opacity Escape commit failed");
      document.undo();if(document.layer().opacity!=1)throw std::runtime_error("Opacity undo failed");document=std::move(previous);refresh();}
    {auto previous=std::move(document);document=Document(1,1);const auto first=document.layer().id;document.setLayerOpacity(.3);document.addLayer();const auto second=document.layer().id;document.setLayerOpacity(.7);document.selectTimelineLayer(first);document.selectTimelineLayer(second,1);refresh();const auto history=document.historySize();menuCommands_.invoke("openLayerProperties");paletteInput_->setText("  renamed  ");paletteInput_->Change();if(document.layer().name!=U"  renamed  ")throw std::runtime_error("Layer name live preview");layerOpacityRange_->changed(50);if(document.timeline().state().layers[0].opacity!=.5 || document.timeline().state().layers[1].opacity!=.5 || document.historySize()!=history)throw std::runtime_error("Multi opacity preview");resolve(false);if(document.historySize()!=history+1 || pending_!=Pending::None || document.layer().name!=U"renamed")throw std::runtime_error("Multi property close history/name");document.undo();if(document.timeline().state().layers[0].opacity!=.7 || document.timeline().state().layers[1].opacity!=.3 || document.layer().name==U"renamed")throw std::runtime_error("Multi property undo originals");document=std::move(previous);refresh();}
    {menuCommands_.invoke("toggleLayersPanel");if(layerRow_->isVisible())throw std::runtime_error("Layer panel hide failed");menuCommands_.invoke("toggleLayersPanel");
     menuCommands_.invoke("togglePalettePanel");if(panelTabs_[0]->isVisible())throw std::runtime_error("Palette hide failed");menuCommands_.invoke("togglePalettePanel");
     menuCommands_.invoke("togglePreviewPanel");if(previewPanel_->isVisible())throw std::runtime_error("Preview hide failed");menuCommands_.invoke("togglePreviewPanel");refresh();}
    {auto previous=std::move(document);document=Document();refresh();const auto raw=document.pixels();
      if(layerRow_->caption!=document.layer().name || !layerRow_->active)throw std::runtime_error("Layer row does not represent document");
      layerEye_->Click();if(document.layer().visible || document.pixels()!=raw)throw std::runtime_error("Layer row visibility failed");document.undo();refresh();
      document.selectTimelineLayer(document.layer().id);refresh();
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
    if(toolRail_.size()!=13)throw std::runtime_error("Legacy tool rail coverage mismatch");
    for(auto tool:toolRail_)for(const auto suffix:{"","-disabled"})
      if(!toolIcons_.assets.patches.count(tool->icon+suffix))throw std::runtime_error("Legacy tool icon state missing: "+tool->icon+suffix);
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
      refresh();chooseSwatchSize(4,false);paletteScrollPixels_=1000;layoutPalette();
      require(paletteScrollPixels_>0 && !swatches_[0]->isVisible());
      for(auto cell:swatches_) if(cell->isVisible()) require(paletteContentBounds().contains(cell->bounds()));
      document=Document();paletteScrollPixels_=0;loadPaletteSize();refresh();ink_=originalInk;
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
      showBrushRange(true);propertyRangeSlider_->value=50;
      int begins=0,commits=0;propertyRangeSlider_->interactionBegin=[&]{++begins;};propertyRangeSlider_->interactionCommit=[&]{++commits;};
      ui::MouseMessage rangeWheel(ui::kMouseWheelMessage,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyShiftModifier,propertyRangeSlider_->bounds().center(),gfx::Point(0,1));
      propertyRangeSlider_->onProcessMessage(&rangeWheel);require(propertyRangeSlider_->value==40 && brushProfiles_[0].opacity==40 && begins==1 && commits==1);
      const auto rangeBounds=propertyRangeSlider_->bounds();
      ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,gfx::Point(rangeBounds.x+6,rangeBounds.y+8));
      propertyRangeSlider_->onProcessMessage(&down);require(propertyRangeSlider_->value==0);
      ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,gfx::Point(rangeBounds.x2()+50,rangeBounds.y+8));
      propertyRangeSlider_->onProcessMessage(&move);require(propertyRangeSlider_->value==100);
      ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,gfx::Point(rangeBounds.x2()+50,rangeBounds.y+8));
      propertyRangeSlider_->onProcessMessage(&up);require(begins==2 && commits==2 && !propertyRangeSlider_->hasCapture());
      propertyRangeSlider_->interactionBegin={};propertyRangeSlider_->interactionCommit={};propertyRangeSlider_->setVisible(false);propertyRangePopup_->closeWindow(nullptr);requestFocus();
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
      case Pending::Preferences:return U"";
      case Pending::LayerOpacity:return U"拖动预览，关闭后应用";
      case Pending::FrameDuration:return U"1–60000 ms，修改预览，关闭保存";
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
    if(pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap)return 320;
    if(pending_==Pending::AntiAlias)return 280;
    if(pending_==Pending::Convolution)return 300;
    if(pending_==Pending::Preferences)return 310;
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
  int modalMinimumHeight() const {if(pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap)return 382;if(pending_==Pending::AntiAlias)return aaAuto_?175:271;if(pending_==Pending::Convolution)return 250;if(pending_==Pending::Preferences)return 260;return pending_==Pending::LayerOpacity?116:pending_==Pending::SheetImport?205:pending_==Pending::GifExport?170:pending_==Pending::SpriteSheet?205:pending_==Pending::StaticExport?142:pending_==Pending::ReplaceColor?153:pending_==Pending::BrushFolderName?75:pending_==Pending::ImageResize?164:pending_==Pending::ColorAdjustment?(adjustmentSpec_.kind==ColorAdjustmentKind::Curves?285:adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance?180:153):pending_==Pending::PaletteExtract?136:pending_==Pending::LoopSection?157:pending_==Pending::OpenError?99:pending_==Pending::PaletteName || pending_==Pending::ColorRole || pending_==Pending::LayerOpacity || pending_==Pending::FrameDuration || pending_==Pending::OnionValue?75:67;}
  gfx::Rect modalBounds(gfx::Rect rc) const {
    const auto saved=modalGeometry_.find(pending_);const int h=modalMinimumHeight();
    const int width=std::min(modalMinimumWidth()+(pending_==Pending::Preferences?50:16),std::max(240,rc.w-2*uiGap));
    const int preferredHeight=pending_==Pending::OpenError?
      std::max(h,std::min(59+int(modalErrorLines(width-20).size())*12,std::max(h,rc.h*3/4))):pending_==Pending::Preferences?280:h;
    auto rect=saved==modalGeometry_.end()?gfx::Rect(rc.x+(rc.w-width)/2,rc.y+(rc.h-preferredHeight)/2,width,preferredHeight):saved->second;
    if(rc.w<=2*uiGap || rc.h<=2*uiGap)return rect;
    rect.w=std::max(modalMinimumWidth(),rect.w);rect.h=std::max(h,rect.h);
    // Direct MIT Aseprite reuse, in the parent display's logical coordinates.
    ui::limit_with_workarea(gfx::Rect(rc.x+uiGap,rc.y+uiGap,rc.w-2*uiGap,rc.h-2*uiGap),rect);
    return rect;
  }
  SizeDrag sizeHandleAt(gfx::Point point) const {
    const auto rc=uiLogical(clientBounds());const auto l=workspaceLayout(rc);
    if(pending_!=Pending::None) {
      const auto modal=dialogDisplayBounds();
      if(panelResizeEdges(modal,point))return SizeDrag::Modal;
      if(dialogClose_ && dialogClose_->isVisible() && dialogClose_->bounds().contains(point))return SizeDrag::None;
      if(modal.contains(point) && point.y<modal.y+16*uiScale)return SizeDrag::ModalMove;
      return SizeDrag::None;
    }
    if(docking_.custom)return SizeDrag::None;
    if((palettePanelOpen_ || colorPickerOpen_) && toDisplay(gfx::Rect(rc.x+l.rightX+l.right-1,rc.y+l.tabY,uiGap+2,l.bottom-l.tabY)).contains(point))return SizeDrag::DockWidth;
    if(palettePanelOpen_ && colorPickerOpen_ && toDisplay(gfx::Rect(rc.x+l.rightX,rc.y+l.split-uiGap,l.right,2*uiGap)).contains(point))return SizeDrag::ColorSplit;
    if(layersPanelOpen_ && toDisplay(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop-uiGap,l.workW,2*uiGap)).contains(point))return SizeDrag::Timeline;
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
    const auto rc=uiLogical(clientBounds());const auto before=canvasViewport();const auto l=workspaceLayout(rc);
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
      modalGeometry_[pending_]=modal;++sizeLayoutUpdates_;layoutModal();raiseDockWidgets();
      invalidateRect(toDisplay(oldModal));invalidateRect(toDisplay(modal));return;
    }
    if(oldWidth==dockWidth_ && oldHeight==timelineHeight_ && oldShare==paletteShare_)return;
    ++sizeLayoutUpdates_;
    canvas_.offset(canvasViewport().center()-before.center());
    // Resize only affected controls in the coalesced frame. A dock-width
    // change also moves the canvas property row; keep its widgets and labels
    // in this same geometry update without a full-editor refresh.
    if(sizeDrag_!=SizeDrag::Timeline)layoutPalette();
    if(sizeDrag_==SizeDrag::DockWidth){layoutPanelTabs();layoutToolOptions();}
    else if(sizeDrag_==SizeDrag::ColorSplit)layoutPanelTabs(1);
    else if(sizeDrag_==SizeDrag::Timeline)layoutPanelTabs(2);
    if(sizeDrag_!=SizeDrag::ColorSplit)layoutLayers();
    raiseDockWidgets();
    if(sizeDrag_==SizeDrag::ColorSplit)invalidateRect(toDisplay(gfx::Rect(rc.x+l.rightX,rc.y+l.top,l.right,l.bottom-l.top)));
    else invalidateRect(toDisplay(gfx::Rect(rc.x+(sizeDrag_==SizeDrag::Timeline?l.workX:l.rightX),rc.y+l.tabY,rc.w-(sizeDrag_==SizeDrag::Timeline?l.workX:l.rightX),l.bottom-l.tabY)));
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
    sizeDrag_=handle;sizeDragMouse_=mouse->position();const auto rc=uiLogical(clientBounds());const auto l=workspaceLayout(rc);
    if(handle==SizeDrag::Modal || handle==SizeDrag::ModalMove){sizeDragBounds_=modalBounds(rc);sizeDragEdges_=panelResizeEdges(toDisplay(sizeDragBounds_),sizeDragMouse_);}
    else sizeDragValue_=handle==SizeDrag::DockWidth?l.right:handle==SizeDrag::ColorSplit?l.split-l.top:l.bottom-l.layerTop;
    captureMouse();updateNavigationCursor();return true;
  }
  void layoutModal() {const auto rc=uiLogical(clientBounds());
    const auto modal=modalBounds(rc);
    layoutPreferences(modal);
    if(modalErrorContent_!=openError_){modalErrorContent_=openError_;modalErrorScroll_=errorScrollPixels_=0;}
    const int errorPage=modalErrorVisibleLines(modal)*12*uiScale,errorTotal=int(modalErrorLines(modal.w-20).size())*12*uiScale;
    errorScrollPixels_=std::clamp(errorScrollPixels_,0,std::max(0,errorTotal-errorPage));modalErrorScroll_=errorScrollPixels_/(12*uiScale);
    if(errorScrollBar_){errorScrollBar_->setDockBounds(toDisplay(gfx::Rect(modal.x2()-13,modal.y+32,7,errorPage/uiScale)));errorScrollBar_->configure(errorTotal,errorPage,errorScrollPixels_);errorScrollBar_->wheelStep=36*uiScale;errorScrollBar_->setVisible(pending_==Pending::OpenError && errorTotal>errorPage);errorScrollBar_->setEnabled(pending_==Pending::OpenError);}
    const int actionY=modal.y2()-(pending_==Pending::LoopSection || pending_==Pending::OpenError?23:25);
    dialogClose_->setBounds(toDisplay(gfx::Rect(modal.x2()-2-uiGap-11,modal.y+2,11,12)));
    const bool confirmation=pending_==Pending::New || pending_==Pending::Open || pending_==Pending::Close || pending_==Pending::CloseDocument;
    const bool two=confirmation || pending_==Pending::AntiAlias || pending_==Pending::Convolution || pending_==Pending::SheetImport || pending_==Pending::GifExport || pending_==Pending::SpriteSheet || pending_==Pending::StaticExport || pending_==Pending::ReplaceColor || pending_==Pending::BrushFolderName || pending_==Pending::ImageResize || pending_==Pending::ColorAdjustment || pending_==Pending::PaletteExtract || pending_==Pending::LoopSection || (pending_==Pending::PaletteName && renameId_!=0);
    const int count=confirmation?3:two?2:1;
    int buttonX=modal.x+(modal.w-(count*66+(count-1)*uiGap))/2;
    if(confirmation){saveBeforeClose_->setBounds(toDisplay(gfx::Rect(buttonX,actionY,66,19)));buttonX+=66+uiGap;}
    if(two){discard_->setBounds(toDisplay(gfx::Rect(buttonX,actionY,66,19)));buttonX+=66+uiGap;}
    keep_->setBounds(toDisplay(gfx::Rect(buttonX,actionY,66,19)));
    if(layerOpacityRange_)layerOpacityRange_->setBounds(toDisplay(gfx::Rect(modal.x+2+uiGap,modal.y+16+uiGap+10+uiGap,modal.w-2*(2+uiGap),18)));
    if(pending_==Pending::LayerOpacity)layerOpacityRange_->setBounds(toDisplay(gfx::Rect(modal.x+2+uiGap,modal.y+68,modal.w-2*(2+uiGap),18)));
    if(loopDirection_){for(int i=0;i<4;++i)loopInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+98,modal.y+24+i*21,modal.w-106,18)));loopDirection_->setBounds(toDisplay(gfx::Rect(modal.x+98,modal.y+108,modal.w-106,16)));}
    if(paletteInput_) paletteInput_->setBounds(toDisplay(gfx::Rect(modal.x+2+uiGap,modal.y+16+uiGap+10+uiGap,modal.w-2*(2+uiGap),18)));
    if(replaceScopeButton_){bool show=pending_==Pending::ReplaceColor;for(int i=0;i<2;++i){replaceInputs_[i]->setVisible(show);replaceInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+65,modal.y+25+i*23,modal.w-96,18)));replaceSample_[i]->setVisible(show);replaceSample_[i]->setBounds(toDisplay(gfx::Rect(modal.x+modal.w-25,modal.y+25+i*23,18,18)));}replaceScopeButton_->setVisible(show);replaceScopeButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+72,modal.w-12,18)));replacePreviewButton_->setVisible(show);replaceRememberButton_->setVisible(show);replacePreviewButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+96,78,18)));replaceRememberButton_->setBounds(toDisplay(gfx::Rect(modal.x+86,modal.y+96,78,18)));}
    if(importSheetLayout_){const bool show=pending_==Pending::SheetImport;const char32_t* layouts[]{U"横向",U"纵向",U"按行",U"按列"};importSheetLayout_->setVisible(show);importSheetLayout_->caption=layouts[importSheetOptions_.layout];importSheetLayout_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+25,modal.w-14,18)));for(int i=0;i<8;++i){importSheetInputs_[i]->setVisible(show);importSheetInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+48+(i%2)*(modal.w/2),modal.y+timelineRowsOffset()+(i/2)*23,modal.w/2-58,18)));importSheetInputs_[i]->setEnabled(i!=6&&i!=7||(i==6?importSheetOptions_.layout!=1:importSheetOptions_.layout!=0));}importSheetPartial_->setVisible(show);importSheetPartial_->icon=importSheetOptions_.partialTiles?"check":"checkboxUnchecked";importSheetPartial_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+143,modal.w-14,18)));}
    if(gifRange_){bool show=pending_==Pending::GifExport;gifInputs_[0]->setVisible(show);gifInputs_[0]->setBounds(toDisplay(gfx::Rect(modal.x+70,modal.y+25,modal.w-78,18)));for(int i=1;i<3;++i){gifInputs_[i]->setVisible(show && gifExplicitRange_);gifInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+(i==1?6:modal.w/2),modal.y+71,modal.w/2-10,18)));}gifRange_->setVisible(show);gifRange_->caption=gifExplicitRange_?U"指定帧范围":gifOptions_.loopSectionId.empty()?U"全部帧":U"循环段";gifRange_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+48,modal.w-12,18)));const char32_t* names[]{U"正向",U"反向",U"正向往返",U"反向往返"};gifDirection_->caption=names[int(gifOptions_.direction)];gifDirection_->setVisible(show);gifDirection_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+94,modal.w-12,18)));gifTrim_->setVisible(show);gifTrim_->icon=gifOptions_.trim?"check":"checkboxUnchecked";gifTrim_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+117,110,18)));}
    if(exportFormatButton_){const bool show=pending_==Pending::StaticExport||pending_==Pending::GifExport;exportFormatButton_->setVisible(show);exportFormatButton_->caption=pending_==Pending::GifExport?U"GIF":U"PNG RGBA";exportFormatButton_->setBounds(toDisplay(gfx::Rect(modal.x2()-80,modal.y+3,62,18)));}
    if(sheetPreview_){sheetPreview_->setBounds(toDisplay(gfx::Rect(modal.x+modal.w-140,modal.y+25,130,130)));} if(sheetValue_){const bool show=pending_==Pending::SpriteSheet;for(int i=0;i<7;++i){sheetButtons_[i]->setVisible(show);sheetButtons_[i]->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+25+i*21,modal.w-14,18)));}const char32_t* layouts[]{U"横向",U"纵向",U"按行",U"按列"};sheetButtons_[0]->caption=U"排列："+std::u32string(layouts[int(sheetOptions_.layout)]);const char32_t* constraints[]{U"无约束",U"固定列数",U"固定宽度",U"固定行数",U"固定高度"};const auto c=sheetOptions_.constraint;sheetButtons_[1]->caption=constraints[int(c)];sheetButtons_[1]->setEnabled(sheetOptions_.layout==SheetLayout::Rows||sheetOptions_.layout==SheetLayout::Columns);sheetButtons_[2]->caption=sheetOptions_.frameScope=="all"?U"全部帧":sheetOptions_.frameScope=="selected"?U"选中帧":U"循环段帧";sheetButtons_[3]->caption=sheetOptions_.layerScope=="visible"?U"可见图层":sheetOptions_.layerScope=="all"?U"所有图层":U"选中图层";sheetButtons_[6]->setEnabled(document.selection().has_value());for(int i=4;i<7;++i){bool checked=i==4?sheetOptions_.mergeDuplicates:i==5?sheetOptions_.ignoreEmpty:sheetOptions_.selection;sheetButtons_[i]->icon=checked?"check":"checkboxUnchecked";sheetButtons_[i]->bareIconWithCaption=true;}sheetValue_->setVisible(show&&c!=SheetConstraint::None);sheetValue_->setBounds(toDisplay(gfx::Rect(modal.x+modal.w-70,modal.y+46,62,18)));if(c!=SheetConstraint::None){sheetButtons_[1]->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+46,modal.w-84,18)));if(!sheetValue_->hasFocus())sheetValue_->setText(std::to_string(c==SheetConstraint::FixedColumns?sheetOptions_.fixedColumns:c==SheetConstraint::FixedRows?sheetOptions_.fixedRows:c==SheetConstraint::FixedWidth?sheetOptions_.fixedWidth:sheetOptions_.fixedHeight));}}
    if(exportScaleInput_){const bool show=pending_==Pending::StaticExport;exportScaleInput_->setVisible(show);exportScaleInput_->setBounds(toDisplay(gfx::Rect(modal.x+70,modal.y+25,modal.w-78,18)));exportTrimButton_->setVisible(show);exportSelectionButton_->setVisible(show);exportSelectionButton_->setEnabled(document.selection().has_value());exportTrimButton_->icon=exportOptions_.trim?"check":"checkboxUnchecked";exportSelectionButton_->icon=exportOptions_.selection?"check":"checkboxUnchecked";exportTrimButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+50,110,18)));exportSelectionButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+73,110,18)));}
    if(resizeMethod_){const bool show=pending_==Pending::ImageResize;for(int i=0;i<4;++i){resizeInputs_[i]->setVisible(show);resizeInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+65+(i/2)*85,modal.y+25+(i%2)*23,76,18)));}resizeLock_->setVisible(show);resizeMethod_->setVisible(show);resizeLock_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+76,100,18)));resizeMethod_->setBounds(toDisplay(gfx::Rect(modal.x+114,modal.y+76,modal.w-122,18)));}
    if(aaPicker_)layoutAntiAlias(modal);
    if(convolutionScroll_)layoutConvolution(modal);
    if(curveEditor_){const bool show=pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::Curves;curveEditor_->setVisible(show);curveEditor_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+47,modal.w-12,160)));for(auto b:{curveChannelButton_,curveResetButton_,curveDeleteButton_})b->setVisible(show);curveChannelButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+25,58,18)));curveResetButton_->setBounds(toDisplay(gfx::Rect(modal.x+70,modal.y+25,65,18)));curveDeleteButton_->setBounds(toDisplay(gfx::Rect(modal.x+141,modal.y+25,55,18)));if(show){for(int i=0;i<3;++i){adjustmentInputs_[i]->setVisible(i<2);adjustmentInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+25+i*85,modal.y+211,55,18)));}adjustmentPreview_->setVisible(true);adjustmentPreview_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+235,80,18)));adjustmentColorize_->setVisible(false);adjustmentToneButton_->setVisible(false);}}
    if(adjustmentPreview_ && adjustmentSpec_.kind!=ColorAdjustmentKind::Curves){const bool show=pending_==Pending::ColorAdjustment,hsl=adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation,balance=adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance;for(int i=0;i<3;++i){adjustmentInputs_[i]->setVisible(show && (i<2 || hsl || balance));adjustmentInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+86,modal.y+25+i*23,modal.w-94,18)));}adjustmentColorize_->setVisible(show && (hsl || balance));adjustmentToneButton_->setVisible(show && balance);adjustmentToneButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+119,66,18)));adjustmentPreview_->setVisible(show);adjustmentColorize_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+96,66,18)));adjustmentPreview_->setBounds(toDisplay(gfx::Rect(modal.x+86,modal.y+96,80,18)));}
    if(gmPicker_)layoutGradientMap(modal);
    if(extractModeButton_){const bool show=pending_==Pending::PaletteExtract;extractModeButton_->setVisible(show);extractNameInput_->setVisible(show && extractMode_==0);if(show){const char32_t* modes[]{U"新建",U"替换",U"追加"};extractModeButton_->caption=modes[extractMode_];extractModeButton_->setBounds(toDisplay(gfx::Rect(modal.x+64,modal.y+24,modal.w-72,18)));paletteInput_->setBounds(toDisplay(gfx::Rect(modal.x+64,modal.y+48,modal.w-72,18)));extractNameInput_->setBounds(toDisplay(gfx::Rect(modal.x+64,modal.y+72,modal.w-72,18)));}}

    layoutPreferences(modal);
  }
  void layoutTopMenu(gfx::Rect bar) {
    if(!menuBar_)return;auto menu=menuBar_->getMenu();
    std::vector<PixelMenuItem*> entries;
    for(auto child:menu->children())if(auto entry=dynamic_cast<PixelMenuItem*>(child)){entry->barInsetReduction=0;entries.push_back(entry);}
    // Aseprite Menu wraps overflowing labels. Our fixed-height menu bar must
    // fit its labels before layout, otherwise their painted/hit regions escape.
    auto required=[&]{int width=menu->border().width()+menuBar_->border().width();for(auto entry:entries)width+=entry->sizeHint().w;return width+std::max(0,int(entries.size())-1)*menu->childSpacing();};
    for(int reduction=1;required()>bar.w && reduction<=32;++reduction)for(auto entry:entries)entry->barInsetReduction=reduction;
    menuBar_->setBounds(bar);
  }
  void onResize(ui::ResizeEvent& ev) override {
    const auto oldView=canvasViewport();const bool positioned=!canvas_.isEmpty();
    setBoundsQuietly(ev.bounds());const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
    if(positioned){const auto nextView=canvasViewport();const auto delta=nextView.center()-oldView.center();canvas_.offset(delta);
      if(pan_.active){pan_.origin.x+=delta.x;pan_.origin.y+=delta.y;}}

    const int actionWidth=57+4+48;
    layoutTopMenu(uiPhysical(gfx::Rect(rc.x+uiGap,rc.y,rc.w-2*uiGap-actionWidth,Layout::menuHeight)));
    for(int i=0;i<5;++i)if(topActions_[i])topActions_[i]->setBounds(uiPhysical(gfx::Rect(rc.x+rc.w-uiGap-actionWidth+(i<4?i*14:61),rc.y+(Layout::menuHeight-16)/2,i==4?48:15,16)));

    layoutToolOptions();
    layoutToolRail();
    layoutPanelTabs();
    layoutDocumentTab();
    layoutPalette();layoutLayers();
    if(canvas_.isEmpty()) fitCanvas();
    layoutCanvasScrollBars();layoutModal();raiseDockWidgets();applyHomeVisibility();if(pending_==Pending::Preferences)layoutPreferences(modalBounds(uiLogical(clientBounds())));
  }
  void invalidateTimelineGrid() {
    const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,2);
    invalidateRect(uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop+35,l.workW,l.bottom-l.layerTop-35)));
  }
  bool timelineBorderHit(gfx::Point point) const {
    for(const auto& outline:timelineOutlines()){auto material=skin_.selectionMaterialBounds(uiPhysical(outline.border).offset(outline.offset));material.offset(bounds().x,bounds().y);if(outline.clip.contains(point) && skin_.selectionContains(material,point))return true;}return false;
  }
  void beginTimelineGesture(int kind,int row,int column,const ui::MouseMessage& mouse,bool outline=false) {
    if(pending_!=Pending::None || !documentOpen_ || timelineGesture_.kind)return;
    const auto& state=document.timeline().state();auto& d=timelineGesture_;d={};d.kind=kind;d.starting=true;d.row=d.targetRow=row;d.column=d.targetColumn=column;d.origin=d.pointer=mouse.position();d.identity=document.identity();d.right=mouse.right();d.copy=mouse.altPressed() && !d.right;d.altClick=d.copy;d.addContent=mouse.shiftPressed();d.selection=document.timelineSelection();d.frames=document.selectedFrames();d.frameAnchor=document.frameSelectionAnchor();d.activeLayer=document.layer().id;d.activeFrame=document.frame().id;
    d.mode=(mouse.ctrlPressed()||mouse.cmdPressed())?1:mouse.shiftPressed()?2:0;
    auto has=[](const auto& ids,const auto& id){return std::find(ids.begin(),ids.end(),id)!=ids.end();};
    if(kind==1){d.anchor=state.layers[row].id;d.canMove=!d.mode;if(!has(d.selection.layers,d.anchor) || d.mode)document.selectTimelineLayer(d.anchor,d.mode);frameSelectionExplicit_=false;}
    else if(kind==2){d.anchor=state.frames[column].id;d.canMove=!d.mode && has(d.frames,d.anchor) && (outline || d.copy || (d.right && d.frames.size()>1) || timelineBorderHit(mouse.position()));if(d.mode)document.selectFrameHeader(d.anchor,d.mode,playing_);else if(!d.canMove)document.selectFrameHeader(d.anchor,0,playing_);markFrameSelection();}
    else{d.anchor=document.timeline().findCel(state.layers[row].id,state.frames[column].id)->id;const bool selected=has(d.selection.cels,d.anchor);if(d.mode==2 && selected)d.mode=1;d.canMove=d.copy || (!d.mode && selected && (outline || (d.right && d.selection.cels.size()>1) || timelineBorderHit(mouse.position())));if(!d.canMove && !d.mode)document.selectTimelineCel(d.anchor);else if(d.copy && !selected)document.selectTimelineCel(d.anchor);frameSelectionExplicit_=false;}
    timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;requestFocus();if(manager())manager()->setCapture(this,true);d.starting=false;timelineScrollTimer_.start();refresh();
  }
  void updateTimelineGesture(gfx::Point pointer,bool copy,bool scrolling=false) {
    auto& d=timelineGesture_;if(!d.kind)return;if(d.identity!=document.identity()){finishTimelineGesture(true);return;}d.pointer=pointer;d.copy=copy && !d.right;
    if(!d.moved && std::hypot(double(pointer.x-d.origin.x),double(pointer.y-d.origin.y))<4)return;d.moved=true;
    const auto l=columnLayout(uiLogical(bounds()),2);const auto at=uiLogical(gfx::Rect(pointer.x-bounds().x,pointer.y-bounds().y,1,1)).origin();const auto& state=document.timeline().state();const int columns=timelineColumns(l),rows=timelineCapacity(l);
    if(scrolling){if(d.kind!=1){if(at.x<l.workX+104)frameScroll_=std::max(0,frameScroll_-1);else if(at.x>=l.workX+89+columns*12-15)frameScroll_=std::min(std::max(0,int(state.frames.size())-columns),frameScroll_+1);}if(d.kind!=2){if(at.y<l.layerTop+timelineRowsOffset()+12)layerScroll_=std::max(0,layerScroll_-1);else if(at.y>=l.layerTop+timelineRowsOffset()+rows*12-12)layerScroll_=std::min(std::max(0,int(state.layers.size())-rows),layerScroll_+1);}}
    d.targetRow=std::clamp(layerScroll_+int(std::floor((double(at.y-l.layerTop-timelineRowsOffset())+double(layerScrollRemainder_)/uiScale)/12)),0,int(state.layers.size())-1);d.targetColumn=std::clamp(frameScroll_+int(std::floor((double(at.x-l.workX-89)+double(frameScrollRemainder_)/uiScale)/12)),0,int(state.frames.size())-1);d.after=d.kind==1?(at.y-l.layerTop-timelineRowsOffset())%12>=6:(at.x-l.workX-89)%12>=6;
    if(d.canMove && d.kind==3){int minR=d.row,maxR=d.row,minC=d.column,maxC=d.column;for(const auto& id:document.timelineSelection().cels){const auto* c=document.timeline().findCelById(id);if(!c)continue;const int r=int(std::find_if(state.layers.begin(),state.layers.end(),[&](const auto& l){return l.id==c->layerId;})-state.layers.begin()),col=int(std::find_if(state.frames.begin(),state.frames.end(),[&](const auto& f){return f.id==c->frameId;})-state.frames.begin());minR=std::min(minR,r);maxR=std::max(maxR,r);minC=std::min(minC,col);maxC=std::max(maxC,col);}d.targetRow=std::clamp(d.targetRow,d.row-minR,int(state.layers.size())-1-maxR+d.row);d.targetColumn=std::clamp(d.targetColumn,d.column-minC,int(state.frames.size())-1-maxC+d.column);}
    if(!d.canMove){if(d.kind==2){document.selectFrameHeader(d.anchor,0,playing_);document.selectFrameHeader(state.frames[d.targetColumn].id,2,playing_);markFrameSelection();}else if(d.kind==3){std::vector<std::string> rectangle;for(int r=std::min(d.row,d.targetRow);r<=std::max(d.row,d.targetRow);++r)for(int c=std::min(d.column,d.targetColumn);c<=std::max(d.column,d.targetColumn);++c)rectangle.push_back(document.timeline().findCel(state.layers[r].id,state.frames[c].id)->id);document.selectTimelineCel(document.timeline().findCel(state.layers[d.targetRow].id,state.frames[d.targetColumn].id)->id,0,rectangle);}}
    layoutLayers();invalidateTimelineGrid();
  }
  void finishTimelineGesture(bool cancel=false) {
    const auto d=timelineGesture_;if(!d.kind)return;timelineScrollTimer_.stop();timelineGesture_={};if(hasCapture())releaseMouse();if(d.identity!=document.identity())return;const auto& state=document.timeline().state();
    if(cancel){document.restoreTimelineSelection(d.selection,d.frames);document.restoreFrameSelectionAnchor(d.frameAnchor);document.selectLayer(d.activeLayer);document.selectFrame(d.activeFrame);}
    else if(d.canMove && d.moved){playing_=false;loopPlayback_={};if(d.kind==1)document.moveTimelineLayers(state.layers[d.targetRow].id,d.after,d.copy);else if(d.kind==2){if(d.copy)document.copyTimelineFrames(state.frames[d.targetColumn].id,d.after);else document.moveSelectedFrames(state.frames[d.targetColumn].id,d.after);}else document.moveTimelineCels(d.anchor,document.timeline().findCel(state.layers[d.targetRow].id,state.frames[d.targetColumn].id)->id,d.copy);}
    else if(!d.moved){if(d.kind==1 && !d.mode)document.selectTimelineLayer(d.anchor);else if(d.kind==2 && !d.mode && !(d.right && d.canMove)){document.selectFrameHeader(d.anchor,0,playing_);markFrameSelection();}else if(d.kind==3 && !(d.right && d.canMove)){document.selectTimelineCel(d.anchor,d.altClick?0:d.mode);if(d.altClick){const auto before=document.selection();SelectionMask mask{0,0,document.width(),document.height(),std::vector<std::uint8_t>(std::size_t(document.width())*document.height())};const auto& pixels=document.pixels();for(std::size_t i=0;i<mask.mask.size();++i)mask.mask[i]=(pixels[i]>>24)?1:0;document.commitSelection(before,combineSelection(before,mask,d.addContent?1:0));selectionTool_=true;selectionPropertiesActive_=true;}}}
    timelineSelectionGuidesVisible_=true;frameSelectionExplicit_=!document.selectedFrames().empty();refresh();if(!cancel && d.right && !d.moved){if(d.kind==1)prepareLayerContext(d.anchor);else if(d.kind==3)prepareCelContext(d.anchor);showLayerContextMenu(d.kind==3?3:d.kind);}if(playing_ && !cancel){document.clearTimelineSelection();frameSelectionExplicit_=false;refresh();}
  }
public:
  bool beginTimelineOutline(const ui::MouseMessage& mouse) {
    const int floatingHit=topFloatingColumnAt(mouse.position());if(floatingHit>=0 && floatingHit!=2)return false;
    if(!documentOpen_ || !columnShown(2) || pending_!=Pending::None || timelineGesture_.kind || (!mouse.left() && !mouse.right()) || !timelineBorderHit(mouse.position()))return false;
    const auto l=columnLayout(uiLogical(bounds()),2);const auto at=uiLogical(gfx::Rect(mouse.position().x-bounds().x,mouse.position().y-bounds().y,1,1)).origin();const auto& state=document.timeline().state();int row=std::clamp(layerScroll_+int(std::floor((double(at.y-l.layerTop-timelineRowsOffset())+double(layerScrollRemainder_)/uiScale)/12)),0,int(state.layers.size())-1),column=std::clamp(frameScroll_+int(std::floor((double(at.x-l.workX-89)+double(frameScrollRemainder_)/uiScale)/12)),0,int(state.frames.size())-1);
    if(!document.timelineSelection().cels.empty()){
      int distance=100000;for(const auto& id:document.timelineSelection().cels){const auto* c=document.timeline().findCelById(id);if(!c)continue;const int r=int(std::find_if(state.layers.begin(),state.layers.end(),[&](const auto& l){return l.id==c->layerId;})-state.layers.begin()),col=int(std::find_if(state.frames.begin(),state.frames.end(),[&](const auto& f){return f.id==c->frameId;})-state.frames.begin());const int next=std::abs(r-row)+std::abs(col-column);if(next<distance){distance=next;timelineGesture_.targetRow=r;timelineGesture_.targetColumn=col;}}
      row=timelineGesture_.targetRow;column=timelineGesture_.targetColumn;timelineGesture_={};beginTimelineGesture(3,row,column,mouse,true);
    }else if(!document.selectedFrames().empty())beginTimelineGesture(2,-1,column,mouse,true);else if(!document.timelineSelection().layers.empty())beginTimelineGesture(1,row,-1,mouse,true);else return false;return true;
  }
public:
  struct TimelineOutline {gfx::Rect border;bool hover=false;gfx::Point offset{};gfx::Rect clip;};
  std::vector<TimelineOutline> timelineOutlines() const {
    std::vector<TimelineOutline> result;
    if(!documentOpen_ || !columnShown(2) || !timelineSelectionGuidesVisible_)return result;
    const auto l=columnLayout(uiLogical(bounds()),2);
    const int rows=std::min(timelineCapacity(l),int(document.timeline().state().layers.size())-layerScroll_);
    const int columns=timelineColumns(l);
    const int visibleColumns=std::min(columns,int(document.timeline().state().frames.size())-frameScroll_);
    const int x=l.workX+5,y=l.layerTop+timelineHeaderOffset();
    auto add=[&](gfx::Rect box,gfx::Point offset,gfx::Rect clip){
      clip.enlarge(2*uiScale);
      auto material=skin_.selectionMaterialBounds(uiPhysical(box).offset(offset));material.offset(bounds().x,bounds().y);
      result.push_back({box,paletteMousePosition_ && clip.contains(*paletteMousePosition_) && skin_.selectionContains(material,*paletteMousePosition_),offset,clip});
    };
    for(int row=0;row<rows;){if(!layerRows_[row+layerScroll_]->timelineSelected){++row;continue;}const int first=row;while(row<rows && layerRows_[row+layerScroll_]->timelineSelected)++row;add(gfx::Rect(x+36,y+12+first*12,48+visibleColumns*12+1,(row-first)*12+1),{0,-layerScrollRemainder_},timelineRowViewport());}
    for(int col=0;col<visibleColumns;){if(!frameHeaders_[col]->timelineSelected){++col;continue;}const int first=col;while(col<visibleColumns && frameHeaders_[col]->timelineSelected)++col;add(gfx::Rect(x+84+first*12,y,(col-first)*12+1,(rows+1)*12+1),{-frameScrollRemainder_,0},timelineFrameViewport(true)|timelineFrameViewport());}
    std::set<std::pair<int,int>> selected;
    const auto& state=document.timeline().state();
    for(const auto& id:document.timelineSelection().cels){const auto* cel=document.timeline().findCelById(id);if(!cel)continue;int r=int(std::find_if(state.layers.begin(),state.layers.end(),[&](const auto& l){return l.id==cel->layerId;})-state.layers.begin())-layerScroll_,c=int(std::find_if(state.frames.begin(),state.frames.end(),[&](const auto& f){return f.id==cel->frameId;})-state.frames.begin())-frameScroll_;if(timelineGesture_.kind==3 && timelineGesture_.canMove && timelineGesture_.moved){r+=timelineGesture_.targetRow-timelineGesture_.row;c+=timelineGesture_.targetColumn-timelineGesture_.column;}if(r>=0 && r<rows && c>=0 && c<visibleColumns)selected.insert({r,c});}

    // deriveLayerPanelVisuals uses the bounds of directly selected cels,
    // including gaps, for both the displayed box and the drag hit target.
    if(!selected.empty()){int top=rows,bottom=-1,left=visibleColumns,right=-1;for(const auto [r,c]:selected){top=std::min(top,r);bottom=std::max(bottom,r);left=std::min(left,c);right=std::max(right,c);}add(gfx::Rect(x+84+left*12,y+12+top*12,(right-left+1)*12+1,(bottom-top+1)*12+1),{-frameScrollRemainder_,-layerScrollRemainder_},timelineFrameViewport());}
    return result;
  }
  void paintTimelineGrid(ui::Graphics& g) {
    if(!documentOpen_ || !columnShown(2))return;
    g.saveClip();clipColumn(g,2,true);paintLoopTrack(g);{
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
      g.saveClip();if(b->paletteViewport)g.clipRect(b->paletteViewport().offset(-bounds().origin()));
      b->paintTimelineContent(g,gfx::Rect(0,0,box.w/uiScale,box.h/uiScale),box.origin());
      // LayersPanel disabled-frame SVG: rising diagonal, inset 4, currentColor .72.
      const auto header=std::find(frameHeaders_.begin(),frameHeaders_.end(),b);
      if(header!=frameHeaders_.end()){const auto index=frameScroll_+int(header-frameHeaders_.begin());if(index<int(document.timeline().state().frames.size()) && document.timeline().state().frames[index].disabled){UiPaintScale scale(g);const auto rc=uiLogical(box);g.drawLine(gfx::rgba(gfx::getr(skin_["timelineInk"]),gfx::getg(skin_["timelineInk"]),gfx::getb(skin_["timelineInk"]),184),gfx::Point(rc.x+2,rc.y2()-3),gfx::Point(rc.x2()-3,rc.y+2));}}

      g.restoreClip();
    }
    // Adjacent canonical linked slots reuse the user's original ball as a
    // 3/1/3 horizontal nine-slice. Only visible content receives a marker.
    {
      g.saveClip();g.clipRect(timelineFrameViewport().offset(-bounds().origin()));
      {UiPaintScale scale(g,gfx::Point(-frameScrollRemainder_,-layerScrollRemainder_));const auto l=columnLayout(uiLogical(bounds()),2);
      const int columns=timelineColumns(l);
      const int rows=std::min(timelineCapacity(l),int(document.timeline().state().layers.size())-layerScroll_);
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
        if(col-first>1)skin_.draw(g,"timeline.linked-dot",gfx::Rect(l.workX+92+first*12,l.layerTop+timelineRowsOffset()+row*12+3,7+(col-first-1)*12,7));
      }
    }
      }g.restoreClip();
    {UiPaintScale scale(g);
    if(timelineGesture_.kind && timelineGesture_.canMove && timelineGesture_.moved && timelineGesture_.kind!=3){const auto l=columnLayout(uiLogical(bounds()),2);const auto& d=timelineGesture_;if(d.kind==1){const int row=d.targetRow-layerScroll_+(d.after?1:0);skin_.drawSelectionBorder(g,uiPhysical(gfx::Rect(l.workX+41,l.layerTop+timelineRowsOffset()+row*12,48+std::min(timelineColumns(l),int(document.timeline().state().frames.size())-frameScroll_)*12+1,1)),false);}else{const int col=d.targetColumn-frameScroll_+(d.after?1:0);skin_.drawSelectionBorder(g,uiPhysical(gfx::Rect(l.workX+89+col*12,l.layerTop+timelineHeaderOffset(),1,std::min(timelineCapacity(l),int(document.timeline().state().layers.size())-layerScroll_)*12+13)),false);}}
    }
    if(gifDropTargetIndex_){const auto grid=timelineFrameViewport(true)|timelineFrameViewport();g.saveClip();g.clipRect(gfx::Rect(grid).offset(-bounds().origin()));const int x=grid.x+(*gifDropTargetIndex_-frameScroll_)*12*uiScale-frameScrollRemainder_-uiScale;g.fillRect(skin_["accent"],gfx::Rect(x-bounds().x,grid.y-bounds().y,2*uiScale,grid.h));g.restoreClip();}
    for(const auto& outline:timelineOutlines()) {
      // 3px skin frame: outer black, white, inner black. The inner black
      // coincides with the existing 1px grid border; the other two extend out.
      auto outlineClip=outline.clip;outlineClip.offset(-bounds().origin());g.saveClip();g.clipRect(outlineClip);{UiPaintScale scale(g);skin_.drawSelectionBorder(g,uiPhysical(outline.border).offset(outline.offset),outline.hover);}g.restoreClip();
    }
    }g.restoreClip();
  }
  void paintChrome(ui::Graphics& g,bool includeFloating=false) {
    ++chromePaints_;UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());const auto l=workspaceLayout(rc);const auto pl=columnLayout(rc,0),cl=columnLayout(rc,1),ll=columnLayout(rc,2);
    auto label=[&](const std::u32string& s,int x,int y,bool muted=false){font_.draw(g,s,x,y,skin_[muted?"muted":"text"]);};
    g.fillRect(skin_["background"],rc);
    paintWorkLayer(g,rc);
    const int colorPanelTop=pl.tabY;
    const gfx::Rect colorPanel=docking_.custom?columnFrame(0):gfx::Rect(pl.rightX,colorPanelTop,pl.right,pl.paletteBottom(colorPickerOpen_)-colorPanelTop);
    auto colorContent=uiLogical(paletteContentBounds().offset(-bounds().origin()));
    auto panel=[&](const gfx::Rect& box,const char* slot,const char* fill) {
      g.fillRect(skin_[fill],box);
      if(!skin_.draw(g,slot,box)) g.drawRect(skin_["border"],box);
    };
    g.saveClip();clipColumn(g,-1,true);panel(l.workspacePanel(),"panel_outer","panel");panel(l.workspaceContent(),"panel_content","background");g.restoreClip();
    if(columnShown(0) && (includeFloating || !columnFloating(0))){g.saveClip();clipColumn(g,0,true);panel(colorPanel,"panel_outer","panel");g.restoreClip();}
    if(columnShown(0) && (includeFloating || !columnFloating(0))){g.saveClip();clipColumn(g,0,true);panel(colorContent,"panel_content","background");g.restoreClip();}
    if(columnShown(1) && (includeFloating || !columnFloating(1))) {
      g.saveClip();clipColumn(g,1,true);panel(docking_.custom?columnFrame(1):cl.pickerPanel(),"panel_outer","panel");
      panel(cl.pickerGradient(!recentColors_.values().empty()),"panel_content","background");
      const auto ink=font_.inkBounds(U"调色盘");
      g.restoreClip();
    }
    if(columnShown(2) && documentOpen_ && (includeFloating || !columnFloating(2))){
      g.saveClip();clipColumn(g,2,true);const gfx::Rect outer=docking_.custom?columnFrame(2):gfx::Rect(ll.workX,ll.layerTop,ll.workW,ll.bottom-ll.layerTop);
      if(!skin_.draw(g,"timeline.frame",outer)){g.fillRect(skin_["panel"],outer);g.drawRect(skin_["timelineGrid"],outer);
      g.drawRect(skin_["timelineEdge"],gfx::Rect(outer.x+1,outer.y+1,outer.w-2,outer.h-2));g.drawRect(skin_["timelineGrid"],gfx::Rect(outer.x+2,outer.y+2,outer.w-4,outer.h-4));}

      const int x=ll.workX+5,y=ll.layerTop+timelineHeaderOffset(),gx=x+84;
      if(!skin_.draw(g,"timeline.grid",gfx::Rect(ll.workX+5,y,ll.workW-9,ll.bottom-y-5))){g.fillRect(skin_["timelineBackground"],gfx::Rect(ll.workX+5,y,ll.workW-9,ll.bottom-y-5));
      g.drawRect(skin_["timelineGrid"],gfx::Rect(ll.workX+5,y,ll.workW-9,ll.bottom-y-5));}
      const auto& layers=document.timeline().state().layers;
      const int capacity=timelineCapacity(ll);
      const int rows=std::min(capacity,int(layers.size())-layerScroll_);
      const int columns=timelineColumns(ll);
      const int visibleColumns=std::min(columns,int(document.timeline().state().frames.size())-frameScroll_);
      auto line=[&](gfx::Rect r){if(!skin_.draw(g,"timeline.line",r))g.fillRect(skin_["timelineGrid"],r);};
      // Derive every separator from the visible rows/columns, including the
      // empty auto-link column. Children own their cell's top and left edges.
      g.saveClip();g.clipRect(gfx::Rect(x,y,84+timelineScrollMetrics(ll).width/uiScale,12+timelineScrollMetrics(ll).height/uiScale));
      for(int dx:{0,12,24,36,84})line(gfx::Rect(x+dx,y,1,(rows+1)*12+1));
      g.saveClip();g.clipRect(gfx::Rect(gx,y,timelineScrollMetrics(ll).width/uiScale,12+timelineScrollMetrics(ll).height/uiScale));g.save();g.concat(gfx::Matrix::MakeAll(1,0,-double(frameScrollRemainder_)/uiScale,0,1,0,0,0,1));
      for(int col=1;col<=visibleColumns;++col)line(gfx::Rect(gx+col*12,y,1,(rows+1)*12+1));g.restore();g.restoreClip();
      line(gfx::Rect(x,y,84+visibleColumns*12+1,1));
      g.saveClip();g.clipRect(gfx::Rect(x,y+12,84+timelineScrollMetrics(ll).width/uiScale,timelineScrollMetrics(ll).height/uiScale));
      g.save();g.concat(gfx::Matrix::MakeAll(1,0,0,0,1,-double(layerScrollRemainder_)/uiScale,0,0,1));
      for(int row=1;row<=rows+1;++row)line(gfx::Rect(x,y+row*12,84+visibleColumns*12+1,1));g.restore();g.restoreClip();
      for(int i=0;i<3;++i)toolIcons_.draw(g,std::string(i==0?"eye":i==1?"lock":"animation-auto-link-off")+"-disabled",gfx::Rect(x+i*12+1,y+1,11,11),true);g.restoreClip();


      g.restoreClip();
    }
    if(includeFloating)return;
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
    syncSelectionOutlineView();if(!showSelectionOutline_ || !document.selection())return;
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
  // legacy useCanvasBrushOverlay, canvas-render-brush and connected-line preview.
  // Display-only replacement pixels: never mutate the document/cache/history.
  void paintBrushPreview(ui::Graphics& g,const gfx::Rect& cv) {
    if(homeOpen_ || !documentOpen_ || pending_!=Pending::None || playing_ || spaceHeld_ || pan_.active ||
       eyedropperHeld_ || eyedropperGesture_.active() || !document.layer().visible || document.layer().locked || !paletteMousePosition_ ||
       !(ordinaryBrushTool() || (shapeTool_ && shapeSpec_.kind==ShapeKind::Line)) ||
       shapeDragging_ || document.floating() || !canvasViewport().contains(*paletteMousePosition_))return;
    if(auto hit=frontWidgetAt(*paletteMousePosition_);hit && hit!=this)return;
    if(document.active() && !eraser_)return;
    const auto brush=brushProfiles_[eraser_?1:0];const auto p=canvasPoint(*paletteMousePosition_);
    const auto anchor=brushPreviewShift_ && !document.active() && ordinaryBrushTool()?brushLineAnchor():nullptr;
    Point target=p;if(anchor && modifierCtrl_){auto end=constrainShapeLine({double(anchor->point.x),double(anchor->point.y)},{double(p.x),double(p.y)});target={int(end.x),int(end.y)};}
    const double scale=canvasScale();
    auto box=[&](int x,int y){const int l=int(std::round(cv.x+x*scale)),t=int(std::round(cv.y+y*scale));return gfx::Rect(l,t,std::max(1,int(std::round(cv.x+(x+1)*scale))-l),std::max(1,int(std::round(cv.y+(y+1)*scale))-t));};
    if(eraser_ && !anchor){
      // Complete outline includes the portion outside the document.
      std::set<std::pair<int,int>> mask;
      if(pencilImageBrush_){const auto stamp=prepareImageBrushStamp(*pencilImageBrush_,brush.size,pencilImageBrushAngle_);for(auto sample:stamp.samples)mask.emplace(p.x-stamp.width/2+sample.x,p.y-stamp.height/2+sample.y);}
      else for(auto span:brushSpans(brush))for(int x=span.left;x<=span.right;++x)mask.emplace(p.x-brush.size/2+x,p.y-brush.size/2+span.y);
      for(auto [x,y]:mask){const auto r=box(x,y);if(!r.intersects(g.getClipBounds()))continue;const auto color=selectionPreviewColor(x,y);
        if(!mask.count({x-1,y}))g.fillRect(color,gfx::Rect(r.x,r.y,1,r.h));
        if(!mask.count({x+1,y}))g.fillRect(color,gfx::Rect(r.x2()-1,r.y,1,r.h));
        if(!mask.count({x,y-1}))g.fillRect(color,gfx::Rect(r.x,r.y,r.w,1));
        if(!mask.count({x,y+1}))g.fillRect(color,gfx::Rect(r.x,r.y2()-1,r.w,1));
      }return;
    }
    const auto replacements=document.brushPreview(anchor?anchor->point:p,target,eraser_?0:ink_,brush,pencilImageBrush_?&*pencilImageBrush_:nullptr,pencilImageBrushAngle_,anchor && anchor->revision==document.revision()?&anchor->baseline:nullptr,bool(anchor));
    if(replacements.empty())return;
    PixelRegion region;for(auto [i,value]:replacements)region.include(int(i%document.width()),int(i/document.width()));
    std::vector<Pixel> pixels(std::size_t(region.w)*region.h);
    for(int y=0;y<region.h;++y)std::copy_n(document.pixels().begin()+std::size_t(region.y+y)*document.width()+region.x,region.w,pixels.begin()+std::size_t(y)*region.w);
    for(auto [i,value]:replacements)pixels[(i/document.width()-region.y)*region.w+i%document.width()-region.x]=value;
    auto composed=compositeNormalRegion(document.displayTimeline(),document.frame().id,{region.x,region.y,region.w,region.h},document.layer().id,&pixels,region.w,region.x,region.y);
    for(auto [i,value]:replacements){const int x=int(i%document.width()),y=int(i/document.width());auto r=box(x,y);if(!r.intersects(g.getClipBounds()))continue;
      auto color=composed[std::size_t(y-region.y)*region.w+x-region.x];
      g.fillRect(skin_[(x/4+y/4)%2?"checkerB":"checkerA"],r);
      g.fillRect(gfx::rgba(color&255,(color>>8)&255,(color>>16)&255,color>>24),r);
    }
  }
  void paintCanvas(ui::Graphics& g) {
    auto viewport=canvasViewport();viewport.offset(-bounds().x,-bounds().y);
    auto cv=canvas_;cv.offset(-bounds().x,-bounds().y);
    g.saveClip();g.clipRect(viewport);clipColumn(g,-1,true);
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
    paintBrushPreview(g,cv);
    if(symmetryHas(document.symmetryAxes)){const auto c=document.symmetryCenter();const auto a=document.symmetryAxes;const auto color=gfx::rgba(symmetryColor_&255,(symmetryColor_>>8)&255,(symmetryColor_>>16)&255,symmetryColor_>>24);auto draw=[&](double x,double y){if(x<0 || y<0 || x>document.width() || y>document.height())return;g.fillRect(color,gfx::Rect(int(std::round(cv.x+x*canvasScale())),int(std::round(cv.y+y*canvasScale())),symmetryThickness_,symmetryThickness_));};for(int x=0;x<=cv.w;++x){const double px=x/canvasScale();if(a.horizontal||a.rotational)draw(px,c.y);if(a.diagonalDown)draw(px,px+c.y-c.x);if(a.diagonalUp)draw(px,c.x+c.y-px);}if(a.vertical||a.rotational)for(int y=0;y<=cv.h;++y)draw(c.x,y/canvasScale());}

    if(selectionTool_ && selectionKind_==5 && selectionBrushPointer_ && !spaceHeld_ && !handTool_ && ((selectionDragging_ && !selectionBoxDragging_) || transformHit(*selectionBrushPointer_).empty())){const auto pointer=*selectionBrushPointer_;if((selectionDragging_ && !selectionBoxDragging_) || selectionHit(pointer)==0){auto coverage=selectionBrushStroke_;const auto p=canvasPoint(pointer);coverage.collect(document.width(),document.height(),{p.x,p.y},{p.x,p.y},brushProfiles_[0],selectionBrushAngle_);const double scale=canvasScale();auto draw=[&](int x,int y){const int left=int(std::round(cv.x+x*scale)),top=int(std::round(cv.y+y*scale)),right=int(std::round(cv.x+(x+1)*scale)),bottom=int(std::round(cv.y+(y+1)*scale));g.fillRect(gfx::rgba(41,121,255,89),gfx::Rect(left,top,std::max(1,right-left),std::max(1,bottom-top)));};for(auto key:coverage.visited)draw(int(key%document.width()),int(key/document.width()));for(auto p:coverage.outsidePreview)draw(p.first,p.second);}}
    if(document.gradientActive()){auto handle=[&](TransformPoint p){const int x=gradientRound(cv.x+p.x*canvasScale()),y=gradientRound(cv.y+p.y*canvasScale());g.fillRect(gfx::rgba(0,0,0,255),gfx::Rect(x-5,y-5,10,10));g.fillRect(gfx::rgba(255,255,255,255),gfx::Rect(x-3,y-3,6,6));};handle(gradientSpec_.radial?resolveGradientGeometry(gradientSpec_).center:gradientSpec_.start);handle(gradientSpec_.end);}
    paintSelectionFeedback(g,cv,viewport);
    paintSelectionAnts(g,cv,viewport,antsOffset_);
    if(showSelectionOutline_ && document.selection() && !homeOpen_ && !smoke_ && !antsTimer_.isRunning())antsTimer_.start();

    if(selectionTool_ && !selectionDragging_){if(auto target=selectionControlTarget()){for(auto uv:std::array<TransformPoint,8>{{{0,0},{.5,0},{1,0},{0,.5},{1,.5},{0,1},{.5,1},{1,1}}}){if(selectionFreeTransform_ && (uv.x==.5 || uv.y==.5))continue;auto p=transformPoint(*target,uv.x,uv.y);const int x=int(std::round(cv.x+p.x*canvasScale())),y=int(std::round(cv.y+p.y*canvasScale()));g.fillRect(gfx::rgba(0,0,0,255),gfx::Rect(x-5,y-5,10,10));g.fillRect(gfx::rgba(255,255,255,255),gfx::Rect(x-3,y-3,6,6));}}}

    if(document.selection() && selectionPivotVisible_ && !selectionFreeTransform_ && !selectionDragging_){const auto p=selectionPivotPoint();UiPaintScale scale(g,gfx::Point(int(std::round(cv.x+p.x*canvasScale()))-9,int(std::round(cv.y+p.y*canvasScale()))-9));toolIcons_.draw(g,"selection-pivot",gfx::Rect(0,0,9,9),true);}
    g.restoreClip();
  }
  void onPaint(ui::PaintEvent& ev) override {
    auto& g=*ev.graphics();if(!homeOpen_)ensureContentCache();
    auto viewport=canvasViewport();viewport.offset(-bounds().x,-bounds().y);
    // Like legacy's requestDrawRef, invalidations share the existing drawing
    // scheduler. Pan requests only the viewport and reuses composed content.
    if(!homeOpen_ && pending_==Pending::None && viewport.contains(g.getClipBounds())) {paintCanvas(g);paintEyedropperLens(g);return;}
    if(homeOpen_)paintHome(g);else{paintChrome(g);paintTimelineGrid(g);paintCanvas(g);paintEyedropperLens(g);}
  }
  void paintDockFeedback(ui::Graphics& g) {
    const auto& d=panelGesture_;if(d.id<0 || !d.moved || d.edges || d.before.groups[d.before.groupOf(d.id)].dock==panels::Dock::Floating)return;
    UiPaintScale scale(g);
    if(d.confirmed.group>=0 || d.confirmed.dock!=panels::Dock::Floating){
      auto r=d.confirmed.preview;const auto color=skin_["accent"];
      g.fillRect(gfx::rgba(gfx::getr(color),gfx::getg(color),gfx::getb(color),88),gfx::Rect(r.x,r.y,r.w,r.h));
    }
    const auto& caption=dockingTabs_[d.id]->caption;const auto ink=font_.inkBounds(caption);
    const auto ghost=dockGhostRect();skin_.draw(g,"panel_tab_active",ghost);
    font_.draw(g,caption,ghost.x+5-ink.x,ghost.y+4,skin_["text"]);
  }
  void paintDialog(ui::Graphics& g) {
    UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());
    auto label=[&](const std::u32string& text,int x,int y,bool muted=false) {font_.draw(g,text,x,y,skin_[muted?"muted":"text"]);};
    if(pending_!=Pending::None) {
      const auto modal=modalBounds(rc);
      if(!skin_.draw(g,"dialog_frame",modal)) {
        g.fillRect(skin_["panel"],modal);g.drawRect(skin_["border"],modal);
      }
      if(pending_==Pending::ReplaceColor){label(U"替换颜色",modal.x+6,modal.y+6);label(U"源 HEX",modal.x+6,modal.y+28);label(U"目标 HEX",modal.x+6,modal.y+51);return;}
      if(pending_==Pending::Preferences){
        label(U"首选项",modal.x+6,modal.y+6);
        const gfx::Rect body(modal.x+90,modal.y+23,modal.w-98,modal.h-57);g.fillRect(skin_["background"],body);skin_.draw(g,"panel_outer",body);
        const int x=body.x+8;label(preferenceSectionTitle(preferenceSection_),x,body.y+7);
        g.saveClip();g.clipRect(gfx::Rect(x,body.y+23,body.w-16-(preferenceContentBar_ && preferenceContentBar_->isVisible()?6:0),std::max(1,body.h-28)));
        g.save();g.concat(gfx::Matrix::MakeAll(1,0,0,0,1,-double(preferenceContentPixels_)/uiScale,0,0,1));
        int row=0;for(int field:preferencePageFields())label(preferenceFieldTitle(field),x,modal.y+52+row++*28);

        if(preferenceSection_==0){label(U"MoonSprite Native",x,body.y+29);label(U"界面语言：简体中文",x,body.y+51);label(U"设置仅影响编辑器，不修改作品",x,body.y+82);}
        else if(preferenceSection_==2 || preferenceSection_==3){label(U"原生像素界面",x,body.y+29);label(U"Fusion Pixel · 10px",x,body.y+51);label(U"整体缩放：2×",x,body.y+73);label(U"当前主题：MoonSprite Dark",x,body.y+95);}
        else if(preferenceSection_==4){label(U"沿用旧版像素指针",x,body.y+29);label(U"滑块使用默认指针",x,body.y+51);label(U"取色镜片设置位于工具分类",x,body.y+82);}
        else if(preferenceSection_==8){label(U"恢复数据保留期仅用于预览",x,body.y+134);label(U"不会自动删除已有恢复文件",x,body.y+150);}
        else if(preferenceSection_==6){label(U"Shift 拖动缩放时使用阶梯模式",x,body.y+148);}
        else if(preferenceSection_!=5){label(U"此分类的设置尚未迁移",x,body.y+29);}
        g.restore();g.restoreClip();if(!preferenceFeedback_.empty())label(preferenceFeedback_,x,body.y2()-15);return;
      }
      if(pending_==Pending::SheetImport){label(U"导入精灵表 · RGBA",modal.x+6,modal.y+6);const char32_t* names[]{U"X",U"Y",U"宽",U"高",U"间距X",U"间距Y",U"列数",U"行数"};for(int i=0;i<8;++i)label(names[i],modal.x+6+(i%2)*(modal.w/2),modal.y+52+(i/2)*23);label(U"单帧 1–1024 px；独立 Cel / 可撤销",modal.x+6,modal.y+170);return;}
      if(pending_==Pending::GifExport){label(U"导出 GIF 动画",modal.x+6,modal.y+6);label(U"比例",modal.x+6,modal.y+28);return;}
      if(pending_==Pending::SpriteSheet){label(U"精灵表 · PNG文件输出子集",modal.x+6,modal.y+6);label(U"原尺寸单元格 / 透明背景",modal.x+6,modal.y+174);return;}
      if(pending_==Pending::StaticExport){label(U"导出当前帧 · PNG RGBA",modal.x+6,modal.y+6);label(U"比例",modal.x+6,modal.y+28);label(U"当前帧全部可见图层，透明背景",modal.x+6,modal.y+98);return;}
      if(pending_==Pending::ImageResize){label(U"调整图像尺寸",modal.x+6,modal.y+6);label(U"宽度",modal.x+6,modal.y+28);label(U"高度",modal.x+6,modal.y+51);label(U"当前原生可编辑范围 1–1024 px",modal.x+6,modal.y+101);return;}
      if(pending_==Pending::AntiAlias){label(U"自动抗锯齿",modal.x+6,modal.y+6);if(aaAuto_&&aaSpec_.colorSource==0)label(U"不透明度",modal.x+6,modal.y+76);if(aaWorker_.valid()||aaScheduled_)label(U"处理中…",modal.x+6,modal.y+(aaAuto_?125:221));return;}
      if(pending_==Pending::Convolution){label(U"卷积矩阵",modal.x+6,modal.y+6);if(convolutionWorker_.valid() || convolutionScheduled_)label(U"处理中…",modal.x2()-96,modal.y+124);return;}
      if(pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap){label(U"渐变映射",modal.x+6,modal.y+6);if(!gmError_.empty())label(gmError_,modal.x+6,modal.y2()-45);else if(gmWorker_.valid()||gmScheduled_)label(U"处理中…",modal.x+6,modal.y2()-45);return;}
      if(pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::Curves){label(U"曲线",modal.x+6,modal.y+6);label(U"X",modal.x+6,modal.y+214);label(U"Y",modal.x+91,modal.y+214);return;}
      if(pending_==Pending::ColorAdjustment){const bool hsl=adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation;const bool balance=adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance;label(balance?U"色彩平衡":hsl?U"色相/饱和度":U"亮度/对比度",modal.x+6,modal.y+6);const char32_t* names[]{balance?U"青色 / 红色":hsl?U"色相":U"亮度",balance?U"洋红 / 绿色":hsl?U"饱和度":U"对比度",balance?U"黄色 / 蓝色":U"明度"};for(int i=0;i<((hsl || balance)?3:2);++i)label(names[i],modal.x+6,modal.y+28+i*23);return;}
      if(pending_==Pending::PaletteExtract){label(U"提取颜色",modal.x+6,modal.y+6);label(U"方式",modal.x+6,modal.y+27);label(U"数量",modal.x+6,modal.y+51);if(extractMode_==0)label(U"名称",modal.x+6,modal.y+75);return;}
      if(pending_==Pending::LoopSection){label(U"循环节属性",modal.x+2+uiGap,modal.y+uiGap);const char32_t* labels[]{U"名称",U"开始帧",U"结束帧",U"重复（空为无限）",U"方向"};for(int i=0;i<5;++i)label(labels[i],modal.x+6,modal.y+28+i*21);return;}
      if(pending_==Pending::OnionValue){label(U"洋葱皮设置",modal.x+2+uiGap,modal.y+uiGap);label(onionField_<2?U"0–8 帧":onionField_<4?U"0–100%":U"HEX：6 或 8 位",modal.x+2+uiGap,modal.y+16+uiGap);return;}
      if(pending_==Pending::FrameDuration){label(U"帧时长",modal.x+2+uiGap,modal.y+uiGap);label(U"1–60000 ms，修改预览，关闭保存",modal.x+2+uiGap,modal.y+16+uiGap);return;}
      if(pending_==Pending::LayerOpacity){label(U"图层属性",modal.x+2+uiGap,modal.y+uiGap);label(U"名称",modal.x+2+uiGap,modal.y+16+uiGap);label(U"不透明度",modal.x+2+uiGap,modal.y+54);return;}
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
        const int first=errorScrollPixels_/(12*uiScale),remainder=errorScrollPixels_%(12*uiScale);
        g.saveClip();g.clipRect(gfx::Rect(modal.x+6,modal.y+32,modal.w-20,visible*12));
        // Graphics is already at UI scale here; preserve sub-row scrolling.
        g.save();g.concat(gfx::Matrix::MakeAll(1,0,0,0,1,-double(remainder)/uiScale,0,0,1));
        for(int i=0;i<=visible && first+i<int(lines.size());++i)label(lines[first+i],modal.x+6,modal.y+32+i*12);
        g.restore();g.restoreClip();
        return;
      }
      label(U"未保存的绘画",modal.x+2+uiGap,modal.y+uiGap);
      label(U"是否保存当前工程的修改？",modal.x+2+uiGap,modal.y+16+uiGap);
      label(U"保存成功后继续；取消保留当前内容",modal.x+2+uiGap,modal.y+16+uiGap+10+uiGap,true);
    }
  }
  bool onProcessMessage(ui::Message* msg) override {
    if(msg->type()==ui::kDragLeaveMessage){clearTimelineGifDrop();return true;}
    if(msg->type()==ui::kDragEnterMessage || msg->type()==ui::kDragMessage || msg->type()==ui::kDropMessage){auto& event=static_cast<ui::DndMessage*>(msg)->event();if(handleTimelineGifDrag(event,msg->type()==ui::kDropMessage)){if(msg->type()==ui::kDragEnterMessage)static_cast<ui::DragEnterMessage*>(msg)->widget(this);if(msg->type()==ui::kDragMessage)static_cast<ui::DragMessage*>(msg)->widget(this);return true;}}
    if(msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage){
      brushPreviewShift_=msg->shiftPressed();if(!homeOpen_ && documentOpen_)invalidateRect(canvasViewport());
      modifierCtrl_=msg->ctrlPressed() || msg->cmdPressed();modifierAlt_=msg->altPressed();
      if(!modifierCtrl_ || !modifierAlt_){if(modifierBrushSize_ && !modifierBrushSize_->pressed)finishModifierBrushSize();}
      if(!modifierAlt_){eyedropperHeld_=false;paletteSamplingHeld_=false;}
      if(pending_==Pending::None && !homeOpen_ && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()) && !document.active() && !selectionDragging_ && !floatingDragging_ && !shapeDragging_ && !gradientDragging_)eyedropperHeld_=modifierAlt_ && !modifierCtrl_ && !spaceHeld_;
      updateNavigationCursor();
    }
    if(msg->type()==ui::kFocusLeaveMessage){finishModifierBrushSize();brushPreviewShift_=false;modifierCtrl_=modifierAlt_=selectionShift_=selectionCtrl_=false;eyedropperHeld_=paletteSamplingHeld_=spaceHeld_=false;}
    if(paletteGesture_){
      if(!hasCapture()){finishPalettePointer(true);}
      else if(msg->type()==ui::kFocusLeaveMessage || (msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)){finishPalettePointer(true);return true;}
      if(msg->type()==ui::kMouseMoveMessage){updatePalettePointer(static_cast<ui::MouseMessage*>(msg)->position());return true;}
      if(msg->type()==ui::kMouseUpMessage){updatePalettePointer(static_cast<ui::MouseMessage*>(msg)->position());finishPalettePointer();return true;}
    }
    // Capture routes a second frame-header click to Editor rather than its button.
    if(pending_==Pending::None && columnShown(2) && msg->type()==ui::kDoubleClickMessage && static_cast<ui::MouseMessage*>(msg)->left()){const auto point=static_cast<ui::MouseMessage*>(msg)->position();for(std::size_t col=0;col<frameHeaders_.size();++col)if(frameHeaders_[col]->timelineVisible && frameHeaders_[col]->bounds().contains(point)){openFramePropertiesFor(frameScroll_+col);return true;}}
    if(pending_==Pending::None && columnShown(2) && msg->type()==ui::kDoubleClickMessage && static_cast<ui::MouseMessage*>(msg)->left()){const auto point=static_cast<ui::MouseMessage*>(msg)->position();for(std::size_t row=0;row<layerRows_.size();++row)if(layerRows_[row]->timelineVisible && layerRows_[row]->bounds().contains(point)){openLayerPropertiesFor(row);return true;}}
    if(msg->type()==ui::kFocusLeaveMessage)stopCelNavigation();
    if(msg->type()==ui::kKeyUpMessage)releaseCelNavigation(static_cast<ui::KeyMessage*>(msg)->scancode());
    if(processLockGesture(msg))return true;
    if(processVisibilityGesture(msg))return true;
    if(processAutoLinkGesture(msg))return true;
    if(processLoopTrack(msg))return true;
    if(processPanelGesture(msg))return true;
    if(timelineGesture_.kind && !timelineGesture_.starting){
      if(msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage){timelineGesture_.copy=static_cast<ui::KeyMessage*>(msg)->altPressed() && !timelineGesture_.right;}
      if(!hasCapture() && (msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage || msg->type()==ui::kKeyDownMessage))finishTimelineGesture(true);
      else if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){finishTimelineGesture(true);return true;}
      else if(msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage){invalidateTimelineGrid();return true;}
      else if(msg->type()==ui::kMouseMoveMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);updateTimelineGesture(mouse->position(),mouse->altPressed());return true;}
      else if(msg->type()==ui::kMouseUpMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);if((timelineGesture_.right && mouse->right()) || (!timelineGesture_.right && mouse->left())){updateTimelineGesture(mouse->position(),mouse->altPressed());finishTimelineGesture();}return true;}
    }
    if(msg->type()==ui::kMouseDownMessage && beginTimelineOutline(*static_cast<ui::MouseMessage*>(msg)))return true;
    if(msg->type()==ui::kMouseDownMessage && clearTimelineSelectionFromBlank(*static_cast<ui::MouseMessage*>(msg)))return true;
    if(replaceSampling_>=0){
      if(eyedropperGesture_.active() && !hasCapture()){finishReplaceSampling();}
      if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){finishReplaceSampling();return true;}
      if(msg->type()==ui::kFocusLeaveMessage){finishReplaceSampling();return true;}
      if(msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage){auto mouse=static_cast<ui::MouseMessage*>(msg);const bool canvas=canvasViewport().contains(mouse->position()) && !dialogDisplayBounds().contains(mouse->position());
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
    if(pending_==Pending::Preferences && msg->type()==ui::kMouseWheelMessage){auto mouse=static_cast<ui::MouseMessage*>(msg);const auto modal=modalBounds(uiLogical(clientBounds()));const auto p=uiLocalPoint(mouse->position(),bounds().origin());if(p.x<modal.x+90)preferenceNavPixels_-=mouse->wheelDelta().y*15*uiScale;else preferenceContentPixels_-=mouse->wheelDelta().y*24*uiScale;layoutModal();invalidateRect(dialogDisplayBounds());return true;}
    if(pending_==Pending::OpenError && msg->type()==ui::kMouseWheelMessage) {
      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto modal=modalBounds(uiLogical(bounds()));
      if(uiPhysical(modal).contains(mouse->position())) {
        const int maximum=std::max(0,int(modalErrorLines(modal.w-20).size())-modalErrorVisibleLines(modal));
        // View::scrollByMessage uses three text rows per ordinary wheel step.
        errorScrollPixels_=std::clamp(errorScrollPixels_+mouse->wheelDelta().y*36*uiScale,0,maximum*12*uiScale);layoutModal();
        invalidateRect(uiPhysical(modal));return true;
      }
    }
    if((homeOpen_ || !documentOpen_) && pending_==Pending::None){
      if(homeOpen_ && documentOpen_ && msg->type()==ui::kMouseDownMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
        if(mouse->left() && uiPhysical(gfx::Rect(rc.x+Layout::edge,rc.y+Layout::documentY,documentTabWidth(l)-Layout::inset-11,Layout::projectTabHeight)).contains(mouse->position())){showHome(false);return true;}}
      if(homeOpen_ && msg->type()==ui::kMouseWheelMessage){homeScrollPixels_+=(static_cast<ui::MouseMessage*>(msg)->wheelDelta().y>0?-1:1)*28*uiScale;layoutHome();invalidate();return true;}
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
    if(zoomDragging_ && !hasCapture())zoomDragging_=false;
    if(zoomDragging_ && (msg->type()==ui::kFocusLeaveMessage || (msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc))){finishZoomTool();if(msg->type()==ui::kKeyDownMessage)return true;}
    if((zoomDragging_ || gradientDragging_) && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)){
      const auto key=static_cast<ui::KeyMessage*>(msg);const auto code=key->scancode();
      if(code>=ui::kKeyLShift && code<=ui::kKeyCommand){ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,zoomDragging_?zoomButton_:strokeButton_,key->modifiers(),selectionPointerPosition_);onProcessMessage(&move);return true;}
    }
    if(zoomDragging_ && msg->type()==ui::kKeyDownMessage)return true;
    if(symmetryDragging_ && !hasCapture())finishSymmetryDrag(true);
    if(eyedropperGesture_.active() && !hasCapture()){eyedropperGesture_.finish();eyedropperLensSurface_.reset();invalidateRect(canvasViewport());}
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
      if(modifierBrushSize_ && key->scancode()==ui::kKeyEsc){finishModifierBrushSize();return true;}
      if(symmetryDragging_){if(key->scancode()==ui::kKeyEsc)finishSymmetryDrag(true);return true;}
      if(pending_!=Pending::None) { if(key->scancode()==ui::kKeyEsc) resolve(false); return false; }
      if(key->scancode()==ui::kKeyS && key->altPressed() && !key->ctrlPressed() && !key->cmdPressed() && !paletteFocused_ && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){paletteSamplingHeld_=true;return true;}
      if(eyedropperGesture_.active()){if(key->scancode()==ui::kKeyEsc)finishEyedropper();return true;}
      if((key->scancode()==ui::kKeyAlt || key->scancode()==ui::kKeyAltGr) && !document.active() && !selectionDragging_ && !floatingDragging_ && !paletteFocused_ && !spaceHeld_ && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){eyedropperHeld_=!(key->ctrlPressed() || key->cmdPressed());updateNavigationCursor();return true;}
      if(key->scancode()==ui::kKeySpace && selectionDragging_ && !selectionBoxDragging_ && selectionKind_<=1 && marqueeTarget_){if(!marqueeSpaceTarget_){marqueeSpaceTarget_=marqueeTarget_;marqueeSpacePointer_={double(selectionLast_.x),double(selectionLast_.y)};marqueeSpaceHadResize_=bool(marqueeResizeStart_);}return true;}
      if(key->scancode()==ui::kKeySpace && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())) {spaceHeld_=true;updateNavigationCursor();return true;}
      if(pan_.active) {
        if(key->scancode()==ui::kKeyEsc) finishPan(true);
        return true;
      }
      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyH && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){if(!key->repeat()){toggleSelectionOutline();refresh();}return true;}
      if(!key->ctrlPressed() && !key->cmdPressed() && !key->altPressed() && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()) && columnShown(2) && document.timeline().state().frames.size()>1){const auto code=key->scancode();if(code==ui::kKeyComma || code==ui::kKeyStop){keyboardStepFrame(code==ui::kKeyComma?-1:1);return true;}}
      if(paletteFocused_ && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()) && (key->scancode()==ui::kKeyDel || key->scancode()==ui::kKeyBackspace)) {
        const auto ids=document.palette().selected;document.deletePaletteColors(ids);refresh();return true;
      }
      if(shapeDragging_){if(key->scancode()==ui::kKeyEsc)cancelStroke();return true;}
      if(gradientDragging_ || gradientPending_){if(key->scancode()==ui::kKeyEsc){if(gradientDragging_ && gradientPending_ && gradientHandle_>=0){gradientSpec_=gradientHandleBefore_;gradientDragging_=false;gradientHandle_=-1;gradientRequest_=true;if(hasCapture())releaseMouse();gradientTick();refresh();}else cancelGradientGesture();}else if(key->scancode()==ui::kKeyEnter)applyGradientGesture();return true;}
      if(fillDragging_){if(key->scancode()==ui::kKeyEsc)cancelStroke();return true;}
      if(selectionDragging_ || floatingDragging_){if(key->scancode()==ui::kKeyEsc || ((key->ctrlPressed() || key->cmdPressed()) && key->scancode()==ui::kKeyD))endSelectionGesture(true);else if(polygonPending_ && (key->ctrlPressed() || key->cmdPressed()) && (key->scancode()==ui::kKeyZ || key->scancode()==ui::kKeyY))polygonStep(key->scancode()==ui::kKeyY || key->shiftPressed());else if(key->scancode()==ui::kKeyEnter && polygonPending_)endSelectionGesture(false);else if(key->scancode()==ui::kKeyEnter && selectionKind_==4){wandReleased_=true;if(hasCapture())releaseMouse();if(wandPreviewReady_)endSelectionGesture(false);else wandTick();}return true;}
      if((ordinaryBrushTool() || (selectionTool_ && selectionKind_==5) || shapeTool_) && !paletteFocused_ && !key->altPressed() && !key->shiftPressed() && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){
        if((key->ctrlPressed() || key->cmdPressed()) && key->scancode()>=ui::kKey1 && key->scancode()<=ui::kKey3){if(!key->repeat()){brushProfiles_[eraser_?1:0].shape=BrushShape(key->scancode()-ui::kKey1);if(pencilImageBrush_){pencilImageBrushId_.clear();pencilImageBrush_.reset();}saveBrushPreferences();refresh();}return true;}
        if(!key->ctrlPressed() && !key->cmdPressed() && (key->scancode()==ui::kKeyOpenbrace || key->scancode()==ui::kKeyClosebrace)){if(!pencilImageBrush_ || !pencilImageBrush_->intrinsicSize){setModifierBrushSize(brushProfiles_[eraser_?1:0].size+(key->scancode()==ui::kKeyClosebrace?1:-1));saveBrushPreferences();}return true;}
      }
      if(document.selection() && !paletteFocused_ && !key->ctrlPressed() && !key->cmdPressed() && !key->altPressed()){
        int dx=0,dy=0;if(key->scancode()==ui::kKeyLeft)dx=-1;else if(key->scancode()==ui::kKeyRight)dx=1;else if(key->scancode()==ui::kKeyUp)dy=-1;else if(key->scancode()==ui::kKeyDown)dy=1;
        if(dx || dy){if(document.nudgeSelectionContent(dx,dy,frameSelectionExplicit_)){playing_=false;hideTimelineSelectionGuides();refresh();}return true;}
      }
      if(celNavigationKey(key->scancode()) && !key->ctrlPressed() && !key->cmdPressed() && !key->shiftPressed() && !key->altPressed() && !celNavigationBlocked()){pressCelNavigation(key->scancode(),std::chrono::steady_clock::now());return true;}
      if(key->scancode()==ui::kKeyEnter && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){
        if(document.selection()){document.commitFloatingPaste();if(document.selection())document.commitSelection(document.selection(),{});refresh();return true;}
        auto focus=ui::Manager::getDefault()->getFocus();if(!key->repeat() && !key->ctrlPressed() && !key->cmdPressed() && !key->shiftPressed() && !key->altPressed() && columnShown(2) && document.timeline().state().frames.size()>1 && !dynamic_cast<ui::Button*>(focus) && !celNavigationBlocked()){togglePlayback();return true;}
      }
      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyI){chooseSheetSource();return true;}
      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyE){openDocumentExport();return true;}
      if(key->shiftPressed() && !key->ctrlPressed() && !key->cmdPressed() && !key->altPressed() && key->scancode()==ui::kKeyR && !paletteFocused_){openReplaceColor();return true;}
      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyM && !paletteFocused_){openColorAdjustment(ColorAdjustmentKind::Curves);return true;}
      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyU && !paletteFocused_){openColorAdjustment(ColorAdjustmentKind::HueSaturation);return true;}
      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyT && !paletteFocused_){beginLayerTransform();return true;}
      if(key->shiftPressed() && !key->ctrlPressed() && !key->cmdPressed() && !key->altPressed() && (key->scancode()==ui::kKeyH || key->scancode()==ui::kKeyV) && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){if(!key->repeat())menuCommands_.invoke(key->scancode()==ui::kKeyH?"flipHorizontal":"flipVertical");return true;}
      // Legacy Ctrl+D resolves pixel deselect first, then explicit Cel copy.
      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !key->altPressed() && key->scancode()==ui::kKeyD && !paletteFocused_ && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(document.selection()){if(!key->repeat()){document.deselectPixels();refresh();}return true;}if(!document.timelineSelection().cels.empty()){if(!key->repeat())copyTimelineCels();return true;}}
      if((key->ctrlPressed() || key->cmdPressed()) && !key->altPressed() && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(key->scancode()==ui::kKeyC){if(key->shiftPressed() && !key->altPressed() && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){if(!key->repeat())copyMergedPixels();return true;}if(celClipboardContext()){copyTimelineCels();return true;}if(frameSelectionExplicit_ && !paletteFocused_){copyTimelineFrames();}else copySelectionPixels(false);return true;}if(key->scancode()==ui::kKeyX && !key->shiftPressed()){if(celClipboardContext()){cutTimelineCels();return true;}if(frameSelectionExplicit_){cutTimelineFrames();}else copySelectionPixels(true);return true;}if(key->scancode()==ui::kKeyV && !key->shiftPressed()){if(celClipboardContext()){pasteTimelineCels();return true;}if(frameSelectionExplicit_ && !paletteFocused_){pasteTimelineFrames();}else pasteSelectionPixels();return true;}if(!paletteFocused_ && !frameSelectionExplicit_){if(key->scancode()==ui::kKeyA && !key->shiftPressed()){selectAllPixels();return true;}if(key->shiftPressed() && key->scancode()==ui::kKeyI){document.invertPixels();refresh();return true;}}}
      if(!key->altPressed() && !key->ctrlPressed() && !key->cmdPressed() && !paletteFocused_ && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(key->scancode()==ui::kKeyZ && !key->shiftPressed() && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){useZoomTool();return true;}if(key->scancode()==ui::kKeyI && !key->shiftPressed() && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){useEyedropperTool();return true;}if(key->scancode()==ui::kKeyU && !key->shiftPressed()){useShapeTool(shapeSpec_.kind==ShapeKind::Line?ShapeKind::Rectangle:shapeSpec_.kind);return true;}if(key->scancode()==ui::kKeyG){if(key->shiftPressed())useGradientTool();else useFillTool();return true;}if(key->scancode()==ui::kKeyM){useSelectionTool(key->shiftPressed()?1:0);return true;}if(key->scancode()==ui::kKeyQ){useSelectionTool(key->shiftPressed()?3:2);return true;}if(key->scancode()==ui::kKeyW && !key->shiftPressed()){useSelectionTool(4);return true;}}

      if(key->altPressed() && !key->ctrlPressed() && !key->cmdPressed() && !key->shiftPressed() && key->scancode()==ui::kKeyC && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(!key->repeat() && columnShown(2))deleteTimelineItems();return true;}
      if(key->altPressed() && !key->ctrlPressed() && !key->cmdPressed() && !key->shiftPressed() && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){const auto code=key->scancode();if(code==ui::kKeyM || code==ui::kKeyN || code==ui::kKeyB){if(!key->repeat() && columnShown(2)){if(code==ui::kKeyM){playing_=false;document.addLinkedFrame(frameSelectionExplicit_);refresh();}else frameAction(code==ui::kKeyN?1:0);}return true;}}
      if((key->ctrlPressed() || key->cmdPressed()) && !key->shiftPressed() && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){
        if(key->scancode()==ui::kKeyI && key->altPressed()){if(!key->repeat())openImageResize();return true;}
        if(!key->altPressed() && key->scancode()==ui::kKeyB){if(!key->repeat())menuCommands_.invoke("createBrushFromSelection");return true;}
        if(!key->altPressed() && key->scancode()==ui::kKeyW){if(!key->repeat())ask(Pending::CloseDocument);return true;}
      }
      switch(key->scancode()) {
        case ui::kKeyH: if(key->ctrlPressed() || key->cmdPressed() || key->altPressed() || key->shiftPressed() || dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()))break;cancelStroke();shapeTool_=false;eyedropperTool_=false;zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=true;updateNavigationCursor();refresh();return true;
        case ui::kKeyTab: if(!key->ctrlPressed()){layersPanelOpen_=!layersPanelOpen_;if(layersPanelOpen_)docking_.select(2);refresh();saveWorkspaceSizes();return true;}break;
        case ui::kKeyF: if(!key->ctrlPressed() && !key->cmdPressed() && !key->shiftPressed() && !key->altPressed() && !dynamic_cast<PixelEntry*>(ui::Manager::getDefault()->getFocus())){if(!key->repeat())menuCommands_.invoke("fillForeground");return true;}break;
        case ui::kKeyEsc: playing_=false;if(document.floating())document.cancelFloatingPaste();cancelStroke();refresh();return true;
        case ui::kKeyB: if(key->ctrlPressed() || key->cmdPressed() || key->altPressed() || key->shiftPressed() || dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()))break;document.commitFloatingPaste();cancelStroke(); selectionTool_=false;shapeTool_=false;eyedropperTool_=false;zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=false; eraser_=false; updateNavigationCursor();refresh(); return true;
        case ui::kKeyE: if(key->ctrlPressed() || key->cmdPressed() || key->altPressed() || key->shiftPressed() || dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus()))break;document.commitFloatingPaste();cancelStroke(); selectionTool_=false;shapeTool_=false;eyedropperTool_=false;zoomTool_=false;gradientTool_=false;fillTool_=false;handTool_=false; eraser_=true; updateNavigationCursor();refresh(); return true;
        case ui::kKeyZ: if((key->ctrlPressed() || key->cmdPressed()) && !key->altPressed()) { cancelStroke(); if(key->shiftPressed()) document.redo(); else document.undo(); refresh(); return true; } break;
        case ui::kKeyY: if((key->ctrlPressed() || key->cmdPressed()) && !key->altPressed() && !key->shiftPressed()) {cancelStroke();document.redo();refresh();return true;} break;
        case ui::kKeyS: if((key->ctrlPressed() || key->cmdPressed()) && !key->altPressed()) {saveProject(key->shiftPressed());return true;} break;
        case ui::kKeyO: if((key->ctrlPressed() || key->cmdPressed()) && !key->altPressed() && !key->shiftPressed()) {cancelStroke();chooseProject();return true;} break;
        case ui::kKeyDel: case ui::kKeyBackspace:
          if(!dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){deleteWorkspaceContent(true);return true;}break;
        case ui::kKeyN: if(!key->altPressed() && !key->cmdPressed() && !dynamic_cast<ui::Entry*>(ui::Manager::getDefault()->getFocus())){if(key->shiftPressed() && !key->ctrlPressed()){cancelStroke();createLayer();return true;}if(key->ctrlPressed() && !key->shiftPressed()){ask(Pending::New);return true;}}break;
        default: break;
      }
    }
    if(polygonPending_ && msg->type()==ui::kDoubleClickMessage && static_cast<ui::MouseMessage*>(msg)->left() && selectionPath_.size()>=3){endSelectionGesture(false);return true;}
    if(pending_==Pending::None && msg->type()==ui::kDoubleClickMessage &&
      paletteViewportBounds().contains(static_cast<ui::MouseMessage*>(msg)->position())) {
      cancelStroke();document.addPaletteColor(ink_,paletteLocked_);paletteFocused_=true;refresh();return true;
    }
    if(pending_==Pending::None && msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->right()) {
      const auto point=static_cast<ui::MouseMessage*>(msg)->position();const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);
      if(palettePanelOpen_ && uiPhysical(gfx::Rect(rc.x+l.rightX,rc.y+l.tabY,l.right,Layout::tabHeight)).contains(point)){showColumnContextMenu(Column::Palette);return true;}
      if(colorPickerOpen_ && uiPhysical(gfx::Rect(rc.x+l.rightX,rc.y+l.split,l.right,Layout::tabHeight)).contains(point)){showColumnContextMenu(Column::Color);return true;}
      if(layersPanelOpen_ && toDisplay(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop,l.workW,16)).contains(point)){showColumnContextMenu(Column::Layers);return true;}
    }
    if(pending_==Pending::None && msg->type()==ui::kMouseDownMessage && !document.active()) {
      const auto mouse=static_cast<ui::MouseMessage*>(msg);
      if(brushRange_) brushRange_->setVisible(false);
      if(palettePanelOpen_ && paletteViewportBounds().contains(mouse->position())) {document.clearPaletteSelection();paletteFocused_=true;paletteFocusedSlot_=paletteSlotAt(mouse->position());refresh();}
      else {paletteFocused_=false;paletteFocusedSlot_.reset();document.clearPaletteSelection();refresh();}
    }
    if(pending_==Pending::None && columnShown(2) && msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->right()) {
      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,2);
      if(uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop,l.workW,l.bottom-l.layerTop)).contains(mouse->position())){
        const auto point=mouse->position();const int row=(point.y/uiScale-rc.y-l.layerTop-timelineRowsOffset())/12+layerScroll_;
        if(point.y/uiScale>=rc.y+l.layerTop+timelineRowsOffset() && point.x/uiScale>=rc.x+l.workX+5 && point.x/uiScale<rc.x+l.workX+89 && row>=0 && row<int(document.timeline().state().layers.size())){prepareLayerContext(document.timeline().state().layers[row].id);showLayerContextMenu(1);}else showLayerContextMenu(0);
        return true;
      }
    }
    if(pending_==Pending::None && columnShown(2) && msg->type()==ui::kMouseWheelMessage) {
      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());const auto l=columnLayout(rc,2);
      if(uiPhysical(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop+timelineHeaderOffset(),l.workW,l.bottom-l.layerTop-timelineHeaderOffset())).contains(mouse->position())){const auto delta=mouse->wheelDelta();if(mouse->shiftPressed() || delta.x){frameScroll_+=(delta.x?delta.x:delta.y)>0?-1:1;frameScroll_=std::max(0,frameScroll_);}else {layerScroll_+=delta.y>0?-1:1;layerScroll_=std::max(0,layerScroll_);}layoutLayers();invalidateTimelineGrid();return true;}
    }
    if(pending_==Pending::None && msg->type()==ui::kMouseWheelMessage) {
      const auto mouse=static_cast<ui::MouseMessage*>(msg);
      const auto logical=uiLogical(bounds());
      if(mouse->position().x>=bounds().x+workspaceLayout(uiLogical(bounds())).workX*uiScale && mouse->position().y>=bounds().y+Layout::optionsY*uiScale && mouse->position().y<bounds().y+Layout::workY*uiScale && !mouse->ctrlPressed() && !mouse->cmdPressed()) {
        const auto delta=mouse->wheelDelta();toolRowScroll_+=(delta.x?delta.x:delta.y)*24*uiScale;layoutToolOptions();invalidate();return true;
      }
      if(palettePanelOpen_ && paletteViewportBounds().contains(mouse->position())) {
        paletteWheel(*mouse);
        return true;
      }
      if(canvasViewport().contains(mouse->position())) {
        if((mouse->ctrlPressed() || mouse->cmdPressed()) && modifierBrushSupported() && !document.active() && !selectionDragging_ && !floatingDragging_ && !shapeDragging_ && mouse->wheelDelta().y){
          setModifierBrushSize(brushProfiles_[eraser_?1:0].size+(mouse->wheelDelta().y<0?1:-1));saveBrushPreferences();return true;
        }
        // Keep the coordinate mapping stable until the current stroke ends.
        if((!document.active() || (document.floating() && !floatingDragging_ && !selectionDragging_)) && !pan_.active && !zoomDragging_ && mouse->wheelDelta().y!=0)
          zoomCanvas(mouse->position(),mouse->wheelDelta().y<0?1:-1);
        return true;
      }
    }
    if(docking_.custom && pending_==Pending::None && msg->type()==ui::kMouseDownMessage){const auto m=static_cast<ui::MouseMessage*>(msg);const auto rc=uiLogical(bounds());const auto geometry=columnGeometry(rc);for(int id=0;id<4;++id)if(geometry.shown[id] && docking_.groups[docking_.groupOf(id)].dock==panels::Dock::Floating){auto r=geometry.panel[id];if(uiPhysical(gfx::Rect(rc.x+r.x,rc.y+r.y,r.w,r.h)).contains(m->position()))return true;}}
    if(pending_==Pending::None && (msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage)) {
      auto mouse=static_cast<ui::MouseMessage*>(msg);if(msg->type()==ui::kMouseMoveMessage && !selectionSyntheticMove_)selectionAutoPan(mouse->position());selectionPointerPosition_=mouse->position();brushPreviewShift_=mouse->shiftPressed();modifierCtrl_=mouse->ctrlPressed() || mouse->cmdPressed(); const auto p=canvasPoint(mouse->position());
      if(modifierBrushSize_ && modifierBrushSize_->pressed){
        if(msg->type()==ui::kMouseMoveMessage)setModifierBrushSize(modifierBrushSize_->size+int(std::floor(double(mouse->position().x-modifierBrushSize_->start.x)/(4*uiScale)+.5)));
        if(msg->type()==ui::kMouseUpMessage && mouse->left())finishModifierBrushSize();return true;
      }
      if(!document.active() && !shapeDragging_ && !selectionDragging_ && !floatingDragging_ && !gradientDragging_ && !spaceHeld_ && modifierBrushSupported() && (mouse->ctrlPressed() || mouse->cmdPressed()) && mouse->altPressed() && canvasViewport().contains(mouse->position())){
        if(msg->type()==ui::kMouseMoveMessage || (msg->type()==ui::kMouseDownMessage && mouse->left())){
          if(!modifierBrushSize_)modifierBrushSize_=ModifierBrushSize{mouse->position(),brushProfiles_[eraser_?1:0].size};
          if(msg->type()==ui::kMouseDownMessage){modifierBrushSize_->start=mouse->position();modifierBrushSize_->size=brushProfiles_[eraser_?1:0].size;modifierBrushSize_->pressed=true;requestFocus();captureMouse();}
          else setModifierBrushSize(modifierBrushSize_->size+int(std::floor(double(mouse->position().x-modifierBrushSize_->start.x)/(4*uiScale)+.5)));
          eyedropperHeld_=false;updateNavigationCursor();return true;
        }
      }else if(modifierBrushSize_)finishModifierBrushSize();
      if(zoomDragging_){
        if(msg->type()==ui::kMouseMoveMessage)setCanvasZoom(zoomStartPointer_,canvasZoomDragTarget(zoomStartScale_,double(mouse->position().x-zoomStartPointer_.x)/uiScale,zoomSmooth_,mouse->shiftPressed()));
        if(msg->type()==ui::kMouseUpMessage && (mouse->button()==zoomButton_ || mouse->button()==ui::kButtonNone)){
          if(mouse->button()!=ui::kButtonNone && std::abs(mouse->position().x-zoomStartPointer_.x)<=3*uiScale && std::abs(mouse->position().y-zoomStartPointer_.y)<=3*uiScale)zoomCanvas(mouse->position(),zoomButton_==ui::kButtonRight?-1:1);
          finishZoomTool();
        }
        return true;
      }
      if(zoomTool_ && msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && !mouse->altPressed() && !spaceHeld_ && canvasViewport().contains(mouse->position()) && (!document.active() || document.floating()) && !selectionDragging_ && !floatingDragging_){requestFocus();zoomDragging_=true;zoomStartPointer_=mouse->position();zoomStartScale_=zoom_;zoomButton_=mouse->button();captureMouse();updateNavigationCursor();return true;}
      if(symmetryDragging_){if(msg->type()==ui::kMouseMoveMessage){if(!symmetryAxisDragAllowed(symmetryLocked_,mouse->ctrlPressed())){finishSymmetryDrag();return true;}document.setSymmetryCenter(moveSymmetryCenter(document.symmetryCenter(),symmetryDragAxis_,{(mouse->position().x-canvas_.x)/canvasScale(),(mouse->position().y-canvas_.y)/canvasScale()},document.width(),document.height()),false);invalidateRect(canvasViewport());}if(msg->type()==ui::kMouseUpMessage)finishSymmetryDrag();return true;}
      if(msg->type()==ui::kMouseDownMessage && mouse->left() && !document.active() && !selectionDragging_ && !floatingDragging_ && !spaceHeld_ && !handTool_ && !zoomTool_ && !eyedropperTool_ && !eyedropperHeld_){if(auto hit=symmetryHit(mouse->position(),mouse->ctrlPressed())){symmetryDragging_=true;symmetryDragAxis_=*hit;symmetryDragBefore_=document.symmetryCenter();captureMouse();return true;}}
      if(eyedropperGesture_.active()){if(msg->type()==ui::kMouseMoveMessage && canvasViewport().contains(mouse->position())){updateEyedropperLens(mouse->position(),sampleEyedropper(document.timeline(),document.frame().id,document.layer().id,document.width(),document.height(),p.x,p.y,eyedropperSource_));sampleEyedropperAt(p);}if(msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_)finishEyedropper();return true;}
      if(msg->type()==ui::kMouseDownMessage && (mouse->left() || mouse->right()) && (eyedropperTool_ || mouse->altPressed()) && !mouse->ctrlPressed() && !mouse->cmdPressed() && !spaceHeld_ && !document.active() && !selectionDragging_ && !floatingDragging_ && canvasViewport().contains(mouse->position())){paletteFocused_=false;requestFocus();playing_=false;strokeButton_=mouse->button();eyedropperGesture_.begin(mouse->right(),!eyedropperTool_ || mouse->altPressed());captureMouse();updateEyedropperLens(mouse->position(),sampleEyedropper(document.timeline(),document.frame().id,document.layer().id,document.width(),document.height(),p.x,p.y,eyedropperSource_));sampleEyedropperAt(p);updateNavigationCursor();return true;}
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
        if(!handle.empty()){if(!document.beginSelectionContentMove(copy,frameSelectionExplicit_)){status_=U"目标图层隐藏或锁定";refresh();return true;}floatingDragging_=true;transformHandle_=handle;transformGestureStart_=*document.floatingTransform();transformPointerStart_=transformCanvasPoint(mouse->position());selectionPivotBeforeGesture_=selectionPivot_;selectionPivotStart_=selectionPivotPoint();selectionMoved_=false;selectionStart_=p;selectionPress_=mouse->position();playing_=false;captureMouse();invalidateRect(canvasViewport());return true;}
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
        playing_=false;resolvePencilImageBrush();const auto anchor=mouse->left() && mouse->shiftPressed() && ordinaryBrushTool()?brushLineAnchor():nullptr;
        Point target=p;if(anchor && (mouse->ctrlPressed() || mouse->cmdPressed())){const auto end=constrainShapeLine({double(anchor->point.x),double(anchor->point.y)},{double(p.x),double(p.y)});target={int(end.x),int(end.y)};}
        document.beginStroke(anchor?anchor->point:target,strokeColor_,brushProfiles_[eraser_?1:0],pencilImageBrush_?&*pencilImageBrush_:nullptr,pencilImageBrushAngle_,anchor && anchor->revision==document.revision()?&anchor->baseline:nullptr);
        if(anchor){
          document.updateStroke(target);auto baseline=document.strokeBaseline();const bool merge=anchor->mergeWithNext && anchor->revision==document.revision();
          if(document.commitStroke()){if(merge)document.mergeLastStrokeEdits();brushLineAnchors_[eraser_?1:0]=BrushLineAnchor{target,document.identity(),document.revision(),document.layer().id,document.frame().id,std::move(baseline),false};}
          document.beginStroke(target,strokeColor_,brushProfiles_[eraser_?1:0],pencilImageBrush_?&*pencilImageBrush_:nullptr,pencilImageBrushAngle_,nullptr,false);
        }brushStrokeLast_=target;brushStrokePointer_=mouse->position();invalidateStrokePixels(revision);
        if(hadSelection) invalidateRect(paletteContentBounds());
        if(wasDirty!=document.dirty()) {layoutDocumentTab();const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);invalidateRect(uiPhysical(gfx::Rect(rc.x+Layout::edge,rc.y+Layout::documentY,rc.w-2*Layout::edge,Layout::projectTabHeight+Layout::frame)));}
        return true;
      }
      if(document.active() && msg->type()==ui::kMouseMoveMessage) {const auto revision=document.contentRevision();document.updateStroke(p);brushStrokeLast_=p;brushStrokePointer_=mouse->position();invalidateStrokePixels(revision);return true;}
      if(document.active() && msg->type()==ui::kMouseUpMessage && mouse->button()==strokeButton_) {const auto revision=document.contentRevision();if(mouse->position()!=brushStrokePointer_){document.updateStroke(p);brushStrokeLast_=p;}
        auto baseline=document.strokeBaseline();invalidateStrokePixels(revision);const bool changed=document.commitStroke();
        if(ordinaryBrushTool() && (changed || !brushLineAnchor()))brushLineAnchors_[eraser_?1:0]=BrushLineAnchor{brushStrokeLast_,document.identity(),document.revision(),document.layer().id,document.frame().id,std::move(baseline)};
        releaseMouse();refresh();return true;}
    }
    return ui::Widget::onProcessMessage(msg);
  }
};
class Desktop : public ui::Window {
public:
  Editor* editor=nullptr;
  bool approved=false;
  Desktop():ui::Window(ui::Window::DesktopWindow) {}
  void onBroadcastMouseMessage(const gfx::Point& screen,ui::WidgetsList& targets)override{
    if(editor)if(auto hit=editor->frontWidgetAt(display()->nativeWindow()->pointFromScreen(screen)))targets.push_back(hit);
    ui::Window::onBroadcastMouseMessage(screen,targets);
  }
  void onBeforeClose(ui::CloseEvent& ev) override {
    if(!approved && editor) {ev.cancel(); editor->requestClose();}
  }
};
class Manager : public ui::Manager {
public:
  Desktop* desktop=nullptr;
  std::function<void()> refreshCursor;
  explicit Manager(const os::WindowRef& window):ui::Manager(window) {}
  ui::Widget* pickFromScreenPos(const gfx::Point& screen)const override{
    auto hit=ui::Manager::pickFromScreenPos(screen);
    if(hit && desktop && desktop->editor && hit->window()==desktop)
      return desktop->editor->frontWidgetAt(desktop->display()->nativeWindow()->pointFromScreen(screen));
    return hit;
  }
  bool onProcessMessage(ui::Message* msg) override {

    if(msg->fromFilter() && msg->type()==ui::kKeyUpMessage){if(desktop && desktop->editor)desktop->editor->observeModifierRelease(msg);return false;}
    if(msg->fromFilter() && msg->type()==ui::kFocusEnterMessage){if(desktop && desktop->editor)desktop->editor->focusWidgetOverlay(static_cast<ui::FocusMessage*>(msg)->newFocus());return false;}
    if(msg->fromFilter() && msg->type()==ui::kMouseDownMessage){if(!desktop || !desktop->editor)return false;const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto target=desktop->editor->display();if(!msg->display() || !target)return false;const auto picked=pickFromScreenPos(mouse->screenPosition());if(!picked || picked->window()!=desktop || !isWidgetClickable(desktop->editor))return false;ui::MouseMessage translated(msg->type(),*mouse,mouse->positionForDisplay(target));if(desktop->editor->dispatchPanelGesture(&translated))return true;return desktop->editor->beginTimelineOutline(translated);}
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
    skin.assets=loadThemeAtlas(themePath).assets;theme.skin=&skin;
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
      const auto picked=manager.pickFromScreenPos(ui::get_mouse_position());
      // Legacy styles.css range inputs, thumb and track all use the default
      // cursor. Capture keeps that ownership when a slider drag leaves it.
      const bool sliderPointer=dynamic_cast<PixelSlider*>(manager.getCapture()) ||
        (!manager.getCapture() && dynamic_cast<PixelSlider*>(picked));
      const char* id=sliderPointer?"default":editor && (editor->panelHasCapture() || (picked && (picked==editor || picked->hasAncestor(editor))))?editor->cursorAt(pos):"default";
      // setCursor is also needed after the OS resets it on entering the window.
      applyLegacyCursor(*window,cursors,id);
    };
    manager.addMessageFilter(ui::kKeyUpMessage,&manager);manager.addMessageFilter(ui::kSetCursorMessage,&manager);manager.addMessageFilter(ui::kFocusEnterMessage,&manager);
    for(const auto type:{ui::kMouseDownMessage,ui::kMouseMoveMessage,ui::kMouseEnterMessage,ui::kMouseLeaveMessage}) manager.addMessageFilter(type,&manager);
    std::filesystem::path recoveryRoot;for(int i=1;i+1<argc;++i)if(std::string(argv[i])=="--recovery-test-root"){const auto root=std::filesystem::u8path(argv[i+1]);if(!root.is_absolute() || !std::filesystem::exists(root/"test-owned.marker"))throw std::runtime_error("Recovery test root must be owned");recoveryRoot=root/"recovery";}
    auto editor=new Editor(font,skin,assets,manager.refreshCursor,recoveryRoot); desktop.editor=editor;
    if(argc>1 && std::string(argv[1])=="--gradient-map-check") {try{editor->smokeGradientMap();}catch(const std::exception& e){std::ofstream("native-gradient-map-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--anti-alias-check") {try{editor->smokeAntiAlias();}catch(const std::exception& e){std::ofstream("native-anti-alias-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--convolution-check") {try{editor->smokeConvolution();}catch(const std::exception& e){std::ofstream("native-convolution-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--preferences-check") {try{editor->smokePreferences(std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("native-preferences-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--brush-preview-check") {try{editor->smokeBrushPreview();}catch(const std::exception& e){std::ofstream("native-brush-preview-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--modifiers-check") {try{editor->smokeModifiers();}catch(const std::exception& e){std::ofstream("native-modifiers-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--sampling-zoom-check") {try{editor->smokeSamplingAndZoom(std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("native-sampling-zoom-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--selection-cursors-check") {try{editor->smokeSelectionCursors();}catch(const std::exception& e){std::ofstream("native-selection-cursors-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--ants-check") {try{editor->smokeAnts(std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("native-ants-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--layer-context-check") {editor->smokeLayerContext(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--layers-check") {editor->smokeLayers(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--cel-clipboard-check") {try{editor->smokeCelClipboard();editor->smokeFrameCutAndMergeVisible();}catch(const std::exception& e){std::ofstream("native-cel-clipboard-error.txt")<<e.what();delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 1;}delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 0;}
    if(argc>1 && std::string(argv[1])=="--animation-check") {try{editor->smokeAnimation();}catch(const std::exception& e){std::ofstream("native-animation-error.txt")<<e.what();delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 1;}delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 0;}
    if(argc>1 && std::string(argv[1])=="--skin-resize-check") {editor->smokeSkinResize(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}
    editor->closeRequested=[&]{desktop.approved=true;desktop.closeWindow(editor);};
    desktop.addChild(editor); desktop.setBounds(manager.bounds()); desktop.openWindow();
    system->finishLaunching();
    if(argc>1 && std::string(argv[1])=="--migration-batch-check") {try{editor->smokeCurrentMigrationBatch();}catch(const std::exception& e){std::ofstream("native-migration-batch-error.txt")<<e.what();delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 1;}delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 0;}
    if(argc>1 && std::string(argv[1])=="--preview-labels-check") {editor->smokeMergedPreviewLabels(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--docking-check") {editor->smokeDocking(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}

    ui::set_use_native_cursors(true); manager.refreshCursor();
    const bool windowInputCheck=argc>1 && std::string(argv[1])=="--window-input-check";
    ui::Timer windowInputTimer(200,editor);int windowInputPhase=0;
    if(windowInputCheck){windowInputTimer.Tick.connect([&]{try{
      windowInputTimer.stop();
      const auto hwnd=static_cast<HWND>(window->nativeHandle());
      if(windowInputPhase%2==0){
        const int variant=windowInputPhase/2;
        if(variant==2)ShowWindow(hwnd,SW_MAXIMIZE);
        else {ShowWindow(hwnd,SW_RESTORE);const gfx::Point positions[]{gfx::Point(137,93),gfx::Point(-40,120),gfx::Point(),gfx::Point(311,147)};RECT rc{0,0,720,600};AdjustWindowRectEx(&rc,DWORD(GetWindowLongPtrW(hwnd,GWL_STYLE)),FALSE,DWORD(GetWindowLongPtrW(hwnd,GWL_EXSTYLE)));SetWindowPos(hwnd,nullptr,positions[variant].x,positions[variant].y,rc.right-rc.left,rc.bottom-rc.top,SWP_NOZORDER|SWP_NOACTIVATE);}
      }else {
        editor->smokeWindowInput(cursors);
        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/("window-input-"+std::to_string(windowInputPhase/2)+".bmp"));
        if(windowInputPhase==7){windowInputTimer.stop();desktop.approved=true;desktop.closeWindow(editor);}
      }
      ++windowInputPhase;if(windowInputPhase<8)windowInputTimer.start();
    }catch(const std::exception& e){std::ofstream("native-window-input-error.txt")<<e.what();std::exit(1);}});windowInputTimer.start();}
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
      // Popup checks run nested manager loops. Do not let the next test phase
      // run inside a still-open foreground menu and falsely reject capture.
      workspaceTimer.stop();
      struct RestartTick {ui::Timer& timer;bool again=true;~RestartTick(){if(again)timer.start();}} restart{workspaceTimer};
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
        else editor->smokePrepareColumnRepaint();
        return;
      }
      if(workspaceCheck && !modalCheck && workspacePhase>=15 && workspacePhase<=19){
        if(workspacePhase==15){editor->smokeColumnRepaintStep(0);return;}
        if(workspacePhase==16 || workspacePhase==18){previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/(workspacePhase==16?"column-move-incremental.bmp":"column-resize-incremental.bmp"));editor->invalidate();return;}
        if(previewFrame!=framePixels())throw std::runtime_error("Floating column incremental repaint differs from full repaint at phase "+std::to_string(workspacePhase));
        if(workspacePhase==17)editor->smokeColumnRepaintStep(10);else editor->smokePrepareDockSplitRepaint();return;
      }
      if(workspaceCheck && !modalCheck && workspacePhase>=20 && workspacePhase<=22){
        if(workspacePhase==20){editor->smokeDockSplitShrink();return;}
        if(workspacePhase==21){previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"dock-split-shrink-incremental.bmp");editor->invalidate();return;}
        if(previewFrame!=framePixels())throw std::runtime_error("Dock split shrink left pixels differing from full repaint");
        editor->smokePrepareDockLabelRepaint();return;
      }
      if(workspaceCheck && !modalCheck && workspacePhase>=23 && workspacePhase<=27){
        if(workspacePhase==23){editor->smokeMoveDockLabel({33,113});return;}
        if(workspacePhase==24 || workspacePhase==26){previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"dock-label-incremental.bmp");editor->invalidate();return;}
        if(previewFrame!=framePixels())throw std::runtime_error("Dock label drag left background/material trails at phase "+std::to_string(workspacePhase));
        if(workspacePhase==25)editor->smokeMoveDockLabel({-11,77});else{editor->smokeFinishDockLabelRepaint();editor->smokePrepareMergedDockLabelRepaint();}return;
      }
      if(workspaceCheck && !modalCheck && workspacePhase>=28 && workspacePhase<=32){
        if(workspacePhase==28){editor->smokeMoveMergedDockLabel(80);return;}
        if(workspacePhase==29 || workspacePhase==31){previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"merged-tab-strip-incremental.bmp");editor->invalidate();return;}
        if(previewFrame!=framePixels())throw std::runtime_error("Merged preview tab strip retained drag feedback pixels at phase "+std::to_string(workspacePhase));
        if(workspacePhase==30)editor->smokeMoveMergedDockLabel(-80);else{editor->smokeFinishDockLabelRepaint();editor->smokePrepareFloatingPreviewRepaint();}return;
      }
      if(workspaceCheck && !modalCheck && workspacePhase>=33 && workspacePhase<=56){
        const int stage=(workspacePhase-33)%3;
        if(stage==0){editor->smokeFloatingPreviewRepaintStep((workspacePhase-33)/3);return;}
        if(stage==1){previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"floating-preview-continuous-incremental.bmp");editor->invalidate();return;}
        if(previewFrame!=framePixels()){writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"floating-preview-continuous-full.bmp");throw std::runtime_error("Floating preview continuous move retained background pixels at phase "+std::to_string(workspacePhase));}
        if(workspacePhase==56)editor->smokeWorkspaceModalPreview();return;
      }
      if(workspaceCheck)writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"workspace-modal-smoke.bmp");
      restart.again=false;workspaceTimer.stop();desktop.approved=true;desktop.closeWindow(editor);
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
    }catch(const std::exception& e){std::fprintf(stderr,"%s\n",e.what());std::ofstream("native-smoke-error.txt")<<e.what();std::exit(1);}});timer.start();}
    manager.run();
    manager.removeMessageFilter(ui::kSetCursorMessage,&manager);
    for(const auto type:{ui::kMouseDownMessage,ui::kMouseMoveMessage,ui::kMouseEnterMessage,ui::kMouseLeaveMessage}) manager.removeMessageFilter(type,&manager);
    return 0;
  } catch(const std::exception& e) {
    if(argc>1 && (std::string(argv[1])=="--selection-check" || std::string(argv[1])=="--smoke" || std::string(argv[1])=="--home-check" || std::string(argv[1])=="--palette-mouse-check" || std::string(argv[1])=="--workspace-check" || std::string(argv[1])=="--layer-context-check" || std::string(argv[1])=="--layers-check" || std::string(argv[1])=="--skin-resize-check" || std::string(argv[1])=="--animation-check" || std::string(argv[1])=="--docking-check")) {std::ofstream("native-smoke-error.txt")<<e.what();std::fprintf(stderr,"%s\n",e.what());return 1;}
    MessageBoxA(nullptr,e.what(),"MoonSprite native startup error",MB_OK|MB_ICONERROR); return 1;
  }
}
