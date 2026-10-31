#include <codecvt>
#include <locale>
#include <sstream>
#include <cmath>
#include <chrono>
#include "native_widgets.h"
#include "native_text_clipboard.h"
#include "pixel_input_menu.h"
#include "entry_edit_history.h"
#include "os/system.h"
#include "color_value_ui.h"
#include "color_picker_layout.h"
#include "ui_scale.h"
#include "ui/message.h"
#include "ui/manager.h"
#include "ui/resize_event.h"
#include "os/sampling.h"
#include "include/core/SkShader.h"
#include "include/core/SkTileMode.h"
#include "include/core/SkColor.h"
#include <algorithm>
#include <fstream>
#include <stdexcept>

namespace moon {
void PixelPopupWindow::setBounds(const gfx::Rect& requested) {
  auto rect=requested;const auto floor=minimumDialogSize(rect.w);rect.w=std::max(rect.w,floor.w);rect.h=std::max(rect.h,minimumDialogSize(rect.w).h);
  if(rect==bounds())return;
  // Aseprite Window::moveWindow(false): retain the old drawable region before
  // layout changes, repaint the new window, and expose old-minus-new below it.
  // moveWindow itself is private; custom native layouts need this small adapter.
  auto* mgr=parent()?manager():nullptr;
  gfx::Region before,after,exposed;
  if(mgr)getDrawableRegion(before,ui::Widget::kCutTopWindowsAndUseChildArea);
  ui::PopupWindow::setBounds(rect);
  if(mgr){
    getDrawableRegion(after,ui::Widget::kCutTopWindowsAndUseChildArea);
    exposed.createSubtraction(before,after);
    invalidateRegion(after);
    mgr->invalidateRegion(exposed);
    mgr->_updateMouseWidgets();
  }
}
int PixelPopupWindow::geometryEdges(gfx::Point p) const {
  auto r=bounds();if(!r.contains(p))return 0;const int edge=3*uiScale;
  return (p.x<r.x+edge?1:p.x>=r.x2()-edge?2:0)|(p.y<r.y+edge?4:p.y>=r.y2()-edge?8:0);
}
const char* PixelPopupWindow::geometryCursor(gfx::Point p) const {
  const int e=hasCapture() && geometryDrag_>1?geometryDrag_-1:geometryEdges(p);
  if((e&1&&e&4)||(e&2&&e&8))return "nwse-resize";
  if((e&1&&e&8)||(e&2&&e&4))return "nesw-resize";
  return e&3?"ew-resize":e&12?"ns-resize":"default";
}
bool PixelPopupWindow::processDialogGeometry(ui::Message* msg) {
  if(geometryDrag_ && !hasCapture())geometryDrag_=0;
  if(msg->type()==ui::kCloseMessage || (msg->type()==ui::kFocusLeaveMessage &&
      (!static_cast<ui::FocusMessage*>(msg)->newFocus() || static_cast<ui::FocusMessage*>(msg)->newFocus()->window()!=this))){geometryDrag_=0;if(hasCapture())releaseMouse();}
  if(msg->type()==ui::kMouseDownMessage){
    auto m=static_cast<ui::MouseMessage*>(msg);const int edges=geometryEdges(m->position());
    // Manager gives visible resize edges first refusal before child controls.
    // Interior/header controls retain their normal click handling.
    if(msg->fromFilter() && !edges)return false;
    if(m->left() && (edges || (bounds().contains(m->position()) && m->position().y<bounds().y+FloatingColumnChrome::headerHeight*uiScale))){geometryDrag_=edges?edges+1:1;geometryOrigin_=m->position();geometryBefore_=bounds();captureMouse();return true;}
  }
  if(msg->type()==ui::kMouseMoveMessage && geometryDrag_ && hasCapture()){
    auto r=geometryBefore_;const auto delta=static_cast<ui::MouseMessage*>(msg)->position()-geometryOrigin_;
    if(geometryDrag_==1)r.offset(delta);
    else {const int e=geometryDrag_-1;const auto floor=minimumDialogSize(r.w);
      if(e&1){r.w=std::max(floor.w,r.w-delta.x);r.x=geometryBefore_.x2()-r.w;}
      if(e&2)r.w=std::max(floor.w,r.w+delta.x);
      const int h=minimumDialogSize(r.w).h;
      if(e&4){r.h=std::max(h,r.h-delta.y);r.y=geometryBefore_.y2()-r.h;}
      else if(e&8)r.h=std::max(h,r.h+delta.y);else r.h=std::max(h,r.h);
    }setBounds(r);return true;
  }
  if(msg->type()==ui::kMouseUpMessage && geometryDrag_){
    geometryDrag_=0;if(hasCapture())releaseMouse();
    if(parent()){
      auto cursor=new ui::MouseMessage(ui::kSetCursorMessage,*static_cast<ui::MouseMessage*>(msg),static_cast<ui::MouseMessage*>(msg)->position());
      cursor->setDisplay(display());cursor->setRecipient(manager());manager()->enqueueMessage(cursor);
    }
    return true;
  }
  return false;
}
bool PixelPopupWindow::onProcessMessage(ui::Message* msg){return processDialogGeometry(msg)||ui::PopupWindow::onProcessMessage(msg);}
void PixelDialog::onPaint(ui::PaintEvent& ev) {
  {auto& g=*ev.graphics();UiPaintScale scale(g);dialogSkin_.drawDialogBackground(g,uiLogical(clientBounds()));}
  paintDialogContents(ev);
}
void FloatingColumnChrome::layoutHeaderButton(PixelButton* button,gfx::Rect physicalFrame){
  button->columnHeaderAction=true;
  button->setBounds(uiPhysical(closeBounds({0,0,physicalFrame.w/uiScale,physicalFrame.h/uiScale})).offset(physicalFrame.origin()));
}
void FloatingColumnChrome::drawTitle(const Skin& skin,const PixelFont& font,ui::Graphics& g,gfx::Rect r,const std::u32string& title){
  const auto ink=font.inkBounds(title);
  font.draw(g,title,r.x+6,r.y+(headerHeight-ink.h)/2-ink.y,skin["text"]);
}
void PixelDialog::drawDialogTitle(const PixelFont& font,ui::Graphics& g,gfx::Rect r,const std::u32string& title)const{FloatingColumnChrome::drawTitle(dialogSkin_,font,g,r,title);}
void FloatingColumnChrome::paint(const Skin& skin,ui::Graphics& g,gfx::Rect r){skin.drawDialogBackground(g,r);}
void Skin::drawDialogBackground(ui::Graphics& g,gfx::Rect rc) const {
  if(!draw(g,"dialog_frame",rc))throw std::runtime_error("Dialog sheet material is missing: dialog_frame");
}
void checkDialogGeometry(const PixelFont& font,const Skin& skin,
                         const std::function<bool(ui::MouseMessage&)>& dispatch) {
  PixelPopupWindow popup("",ui::PopupWindow::ClickBehavior::DoNothingOnClick,
                         ui::PopupWindow::EnterBehavior::DoNothingOnEnter);
  popup.setAutoRemap(false);popup.setWantFocus(true);
  auto child=new PixelButton(font,skin,U"edge child",[]{});popup.addChild(child);
  popup.setBounds({70,90,300,220});popup.openWindow();
  try {
    for(auto size:{gfx::Size(160,120),gfx::Size(520,400)})for(int edge:{1,2,4,8,5,6,9,10}) {
      popup.setBounds({70,90,size.w,size.h});const auto before=popup.bounds();
      // The child covers every edge: normal child dispatch would swallow press.
      child->setBounds(before);
      gfx::Point point((edge&1)?before.x+1:(edge&2)?before.x2()-1:before.center().x,
                       (edge&4)?before.y+1:(edge&8)?before.y2()-1:before.center().y);
      if(std::string(popup.geometryCursor(point))=="default")throw std::runtime_error("Dialog edge cursor missing");
      ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);
      down.setDisplay(popup.display());down.setFromFilter(true);
      if(!dispatch(down) || !popup.hasCapture() || child->hasCapture())throw std::runtime_error("Dialog edge lost press to child");
      ui::FocusMessage focus(ui::kFocusLeaveMessage,&popup,child);popup.onProcessMessage(&focus);
      if(!popup.hasCapture())throw std::runtime_error("Dialog internal focus cancelled resize");
      const gfx::Point delta((edge&1)?-14:(edge&2)?14:0,(edge&4)?-18:(edge&8)?18:0);
      ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point+delta);
      popup.onProcessMessage(&move);
      const auto after=popup.bounds();
      if(after==before || ((edge&1)&&after.x2()!=before.x2()) || ((edge&4)&&after.y2()!=before.y2()))throw std::runtime_error("Dialog resize failed or opposite edge moved");
      ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point+delta);
      popup.onProcessMessage(&up);if(popup.hasCapture())throw std::runtime_error("Dialog resize capture leaked");
      if(std::string(popup.geometryCursor(popup.bounds().center()))!="default" || std::string(popup.geometryCursor(popup.bounds().origin()-gfx::Point(1,1)))!="default")throw std::runtime_error("Dialog resize cursor persisted away from edge");
      ui::MouseMessage interior(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,popup.bounds().center());
      interior.setDisplay(popup.display());interior.setFromFilter(true);
      if(dispatch(interior) || popup.hasCapture())throw std::runtime_error("Dialog resize swallowed interior child click");
    }
    const auto r=popup.bounds();
    ui::MouseMessage lost(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,{r.x+1,r.center().y});
    popup.onProcessMessage(&lost);popup.releaseMouse();
    if(std::string(popup.geometryCursor(r.center()))!="default")throw std::runtime_error("Dialog cursor retained lost capture");
    class ContentDialog final:public PixelDialog {
    public:
      using PixelDialog::PixelDialog;
      gfx::Size minimumDialogSize(int width)const override{return {180*uiScale,(width<240*uiScale?160:120)*uiScale};}
      void paintDialogContents(ui::PaintEvent&)override{}
    } content(skin,"");
    content.setBounds({20,20,1,1});
    if(content.bounds().w!=180*uiScale || content.bounds().h!=160*uiScale)throw std::runtime_error("Dialog content floor not enforced");
    content.setBounds({20,20,300*uiScale,1});
    if(content.bounds().h!=120*uiScale)throw std::runtime_error("Dialog responsive content floor not enforced");
    auto shell=os::instance()->makeRgbaSurface(content.bounds().w,content.bounds().h),expected=os::instance()->makeRgbaSurface(content.bounds().w,content.bounds().h);
    shell->clear();expected->clear();
    {ui::Graphics g(shell);ui::PaintEvent ev(&content,&g);content.onPaint(ev);}
    {ui::Graphics g(expected);UiPaintScale scale(g);skin.drawDialogBackground(g,uiLogical(content.clientBounds()));}
    {os::SurfaceLock a(shell.get()),b(expected.get());for(int y=0;y<shell->height();++y)for(int x=0;x<shell->width();++x)if(shell->getPixel(x,y)!=expected->getPixel(x,y))throw std::runtime_error("Dialog component shell material differs");}
    for(int width:{146,260,400}){const gfx::Rect frame(0,0,width,DialogLayout::fit(DialogLayout::field(2)+textControlHeight));const auto body=DialogLayout::body(frame);
      if(body.x!=6||frame.x2()-body.x2()!=6||body.y-FloatingColumnChrome::headerHeight!=6||DialogLayout::field()-DialogLayout::label()-PixelFont::cell!=2||DialogLayout::label(1)-DialogLayout::field()-textControlHeight!=6||frame.h-DialogLayout::footer(frame.h)-textControlHeight!=6||DialogLayout::footer(frame.h)-body.y2()!=6)throw std::runtime_error("Shared spacing relationships failed");
    }
    for(auto size:{gfx::Size(100,64),gfx::Size(260,160)}){
      const gfx::Rect r(0,0,size.w,size.h);auto floating=os::instance()->makeRgbaSurface(size.w,size.h);floating->clear();{ui::Graphics g(floating);FloatingColumnChrome::paint(skin,g,r);}
      const auto close=FloatingColumnChrome::closeBounds(r);if(close.w!=15 || close.h!=15 || close.y-r.y!=r.y+FloatingColumnChrome::headerHeight-close.y2())throw std::runtime_error("Dialog header actions must be square and vertically centered");if(close.y<2 || close.y2()>FloatingColumnChrome::headerHeight-2 || FloatingColumnChrome::bodyTop(r)<=FloatingColumnChrome::headerHeight)throw std::runtime_error("Floating header overlaps close or content");
      const auto& material=*skin.assets.patches.at("dialog_frame").bitmap;const auto title=material.pixels[5*material.width+2];const auto pixel=gfx::rgba(title&255,(title>>8)&255,(title>>16)&255,title>>24);
      for(int y=2;y<FloatingColumnChrome::headerHeight;++y)if(floating->getPixel(30,y)!=pixel)throw std::runtime_error("Header color band does not contain full title/close row");
    }
    auto reference=os::instance()->makeRgbaSurface(260,160),actual=os::instance()->makeRgbaSurface(260,160);
    reference->clear();actual->clear();
    {ui::Graphics g(reference);skin.draw(g,"dialog_frame",{0,0,260,160});}
    {ui::Graphics g(actual);skin.drawDialogBackground(g,{0,0,260,160});}
    {os::SurfaceLock a(reference.get()),b(actual.get());for(int y=0;y<160;++y)for(int x=0;x<260;++x)if(reference->getPixel(x,y)!=actual->getPixel(x,y))throw std::runtime_error("Dialog background differs from new canvas material");}
  }catch(...){popup.closeWindow(nullptr);throw;}
  popup.closeWindow(nullptr);
}
Skin Skin::load(const std::filesystem::path& path) {
  Skin skin; std::ifstream file(path);
  if(!file) throw std::runtime_error("Skin cannot be read");
  const std::vector<std::string> keys{"background","panel","button","border","text","muted","accent","checkerA","checkerB","timelineBackground","timelineGrid","timelineEdge","timelineInk"};
  std::string line;
  while(std::getline(file,line)) {
    if(!line.empty() && line.back()=='\r') line.pop_back();
    if(line.empty() || line[0]=='#') continue;
    const auto equal=line.find('=');
    if(equal==std::string::npos) throw std::runtime_error("Invalid skin line");
    const auto key=line.substr(0,equal), value=line.substr(equal+1);
    if(std::find(keys.begin(),keys.end(),key)==keys.end() || value.size()!=6 || value.find_first_not_of("0123456789ABCDEFabcdef")!=std::string::npos)
      throw std::runtime_error("Skin only accepts known RGB color tokens");
    const auto rgb=std::stoul(value,nullptr,16);
    if(!skin.colors.emplace(key,gfx::rgba((rgb>>16)&255,(rgb>>8)&255,rgb&255)).second) throw std::runtime_error("Duplicate skin token");
  }
  for(const auto key:{"timelineBackground","timelineGrid","timelineEdge","timelineInk"})if(!skin.colors.count(key))skin.colors[key]=skin.colors.at(std::string(key)=="timelineBackground"?"background":std::string(key)=="timelineInk"?"text":"border");
  if(skin.colors.size()!=keys.size()) throw std::runtime_error("Skin is missing a color token");
  return skin;
}
gfx::Rect Skin::selectionMaterialBounds(gfx::Rect border) const {
  const auto it=assets.patches.find("selection.normal");if(it==assets.patches.end())return {};
  const auto& p=it->second;
  border.enlarge(gfx::Border(std::max(0,p.left-1)*uiScale,std::max(0,p.top-1)*uiScale,
                            std::max(0,p.right-1)*uiScale,std::max(0,p.bottom-1)*uiScale));
  return border;
}
bool Skin::selectionContains(gfx::Rect material,gfx::Point point) const {
  const auto it=assets.patches.find("selection.normal");
  if(it==assets.patches.end() || !material.contains(point))return false;
  const auto& p=it->second;const auto& bitmap=*p.bitmap;
  // Match Skin::draw's fixed-corner and repeating-middle nine-slice mapping.
  // Alpha is the contract: transparent center/corner pixels are not hit targets.
  auto source=[](int pos,int destination,int sourceSize,int first,int last) {
    const int left=std::min(first,destination/2),right=std::min(last,destination-left);
    if(pos<left)return pos;
    if(pos>=destination-right)return sourceSize-right+pos-(destination-right);
    const int middle=sourceSize-first-last;
    return middle>0?first+(pos-left)%middle:std::min(first,sourceSize-1);
  };
  const int x=source((point.x-material.x)/uiScale,material.w/uiScale,bitmap.width,p.left,p.right);
  const int y=source((point.y-material.y)/uiScale,material.h/uiScale,bitmap.height,p.top,p.bottom);
  return (bitmap.pixels[y*bitmap.width+x]>>24)!=0;
}
void Skin::drawSelectionBorder(ui::Graphics& g,gfx::Rect border,bool hover) const {
  drawSelection(g,uiLogical(selectionMaterialBounds(border)),hover);
}
bool Skin::draw(ui::Graphics& g,const std::string& slot,gfx::Rect rc,bool icon,int opacity) const {
  auto it=assets.patches.find(slot); if(it==assets.patches.end()) return false;
  const auto& p=it->second; const auto& b=*p.bitmap;
  const bool tint=icon && (monochromeIcons || slot=="dropdown.arrow") && slot!="gradient-stop" && slot!="gradient-stop-disabled" && slot!="selection-pivot" && slot!="selection-pivot-disabled";
  const auto ink=tint?(*this)[slot.size()>=9 && slot.compare(slot.size()-9,9,"-disabled")==0?"muted":"text"]:gfx::rgba(0,0,0,0);
  auto& c=cache[slot];
  if(c.bitmap!=p.bitmap || c.ink!=ink) {
    auto surface=os::instance()->makeRgbaSurface(b.width,b.height);
    if(!surface) throw std::runtime_error("Cannot create skin surface");
    {os::SurfaceLock lock(surface.get());
      for(int y=0;y<b.height;++y) for(int x=0;x<b.width;++x) {
        const auto v=b.pixels[y*b.width+x]; surface->putPixel(tint?gfx::rgba(gfx::getr(ink),gfx::getg(ink),gfx::getb(ink),v>>24):gfx::rgba(v&255,(v>>8)&255,(v>>16)&255,v>>24),x,y);
      }
    }
    surface->setImmutable(); c={};c.bitmap=p.bitmap;c.surface=surface;c.ink=ink;
  }
  if(icon) {
    auto drawIcon=[&](int sx,int sy,int dx,int dy,int w,int h){
      if(opacity==255)g.drawRgbaSurface(c.surface.get(),sx,sy,dx,dy,w,h);
      else {ui::Paint paint;paint.skPaint().setAlpha(opacity);g.drawSurface(c.surface.get(),gfx::Rect(sx,sy,w,h),gfx::Rect(dx,dy,w,h),os::Sampling(),&paint);}
    };
    if(slot=="plus" || slot=="plus-disabled") {
      // Legacy plus occupies only the top-left 5x5 of its 11x11 SVG viewBox.
      // Center its visible pixels without changing the source shape or alpha.
      int left=b.width,top=b.height,right=0,bottom=0;
      for(int y=0;y<b.height;++y) for(int x=0;x<b.width;++x) if(b.pixels[y*b.width+x]>>24) {
        left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);
      }
      if(right>left && bottom>top) {
        const int w=std::min(right-left,rc.w),h=std::min(bottom-top,rc.h);
        drawIcon(left+(right-left-w)/2,top+(bottom-top-h)/2,rc.x+(rc.w-w)/2,rc.y+(rc.h-h)/2,w,h);
      }
      return true;
    }
    const int w=std::min(b.width,rc.w),h=std::min(b.height,rc.h);
    drawIcon((b.width-w)/2,(b.height-h)/2,rc.x+(rc.w-w)/2,rc.y+(rc.h-h)/2,w,h); return true;
  }
  if(rc.isEmpty()) return true;
  const std::array<int,4> borders{p.left,p.top,p.right,p.bottom};
  if(c.borders!=borders) {
    c.borders=borders;c.tiles.clear();c.stretchEquivalent=true;
    const int sx[]{0,p.left,b.width-p.right},sy[]{0,p.top,b.height-p.bottom};
    const int sw[]{p.left,b.width-p.left-p.right,p.right};
    const int sh[]{p.top,b.height-p.top-p.bottom,p.bottom};
    // Aseprite's drawSurfaceNine stretches the middle segments. This is pixel
    // equivalent to our legacy tiling only when each repeating axis is constant.
    for(int row=0;row<3;++row) for(int col=0;col<3;++col)
      for(int y=0;y<sh[row];++y) for(int x=0;x<sw[col];++x) {
        const auto color=b.pixels[(sy[row]+y)*b.width+sx[col]+x];
        if((col==1 && color!=b.pixels[(sy[row]+y)*b.width+sx[col]]) ||
           (row==1 && color!=b.pixels[sy[row]*b.width+sx[col]+x])) c.stretchEquivalent=false;
      }
  }
  if(c.stretchEquivalent && p.left>0 && p.right>0 && p.top>0 && p.bottom>0 &&
     rc.w>=2*p.left && rc.w>=p.left+p.right && rc.h>=2*p.top && rc.h>=p.top+p.bottom) {
    // Reuse Aseprite MIT UI -> laf/Skia nearest-neighbor image lattice directly.
    g.drawSurfaceNine(c.surface.get(),gfx::Rect(0,0,b.width,b.height),
      gfx::Rect(p.left,p.top,b.width-p.left-p.right,b.height-p.top-p.bottom),rc,true);
    return true;
  }
  // Textured skins and undersized rectangles retain exact fixed-corner/tile
  // semantics. Cache only tiny source segments; destination size isn't a key.
  const int left=std::min(p.left,rc.w/2),right=std::min(p.right,rc.w-left);
  const int top=std::min(p.top,rc.h/2),bottom=std::min(p.bottom,rc.h-top);
  const int sx[]{0,p.left,b.width-right},sy[]{0,p.top,b.height-bottom};
  const int sw[]{left,b.width-p.left-p.right,right},sh[]{top,b.height-p.top-p.bottom,bottom};
  const int dx[]{0,left,rc.w-right},dy[]{0,top,rc.h-bottom};
  const int dw[]{left,rc.w-left-right,right},dh[]{top,rc.h-top-bottom,bottom};
  for(int row=0;row<3;++row) for(int col=0;col<3;++col) {
    if(sw[col]<=0 || sh[row]<=0 || dw[col]<=0 || dh[row]<=0) continue;
    const std::array<int,4> key{sx[col],sy[row],sw[col],sh[row]};
    auto found=c.tiles.find(key);
    if(found==c.tiles.end()) {
      SkBitmap tile;
      if(!tile.tryAllocPixels(SkImageInfo::MakeN32Premul(sw[col],sh[row])))
        throw std::runtime_error("Cannot allocate skin source tile");
      for(int y=0;y<sh[row];++y) for(int x=0;x<sw[col];++x) {
        const auto color=b.pixels[(sy[row]+y)*b.width+sx[col]+x];
        *tile.getAddr32(x,y)=SkPreMultiplyARGB(color>>24,color&255,(color>>8)&255,(color>>16)&255);
      }
      tile.setImmutable();
      if(c.tiles.size()>=64) c.tiles.clear();
      found=c.tiles.emplace(key,std::move(tile)).first;
    }
    const int x=rc.x+dx[col],y=rc.y+dy[row];
    ui::Paint paint;
    const auto matrix=SkMatrix::Translate(float(x+g.getInternalDeltaX()),float(y+g.getInternalDeltaY()));
    paint.skPaint().setShader(found->second.makeShader(SkTileMode::kRepeat,SkTileMode::kRepeat,SkSamplingOptions(),matrix));
    g.drawRect(gfx::Rect(x,y,dw[col],dh[row]),paint);
  }
  return true;
}
bool Skin::drawPanelTab(ui::Graphics& g,gfx::Rect rc,bool first) const {
  if(!draw(g,"panel_tab_active",rc)) return false;
  // Concave corners turn the tab sides into the panel's top border. The
  // leftmost tab shares the panel's outer left edge, so it needs no left turn.
  for(const auto* slot:{"panel_tab_join_left","panel_tab_join_right"}) {
    const bool left=std::string(slot)=="panel_tab_join_left";
    const auto it=assets.patches.find(slot);
    if((left && first) || it==assets.patches.end()) continue;
    const auto& bitmap=*it->second.bitmap;
    const int w=std::min(bitmap.width,rc.w),h=std::min(bitmap.height,rc.h);
    draw(g,slot,gfx::Rect(left?rc.x:rc.x2()-w,rc.y2()-h,w,h),true);
  }
  return true;
}
std::u32string unicodeText(const std::string& value) {return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(value);}
std::string utf8Text(const std::u32string& value) {return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(value);}
void Skin::drawCheckbox(ui::Graphics& g,gfx::Rect row,bool checked,bool hover,bool pressed,bool enabled) const {
  const int opacity=enabled?255:115;
  const auto background=row;
  if(enabled && (pressed || hover))draw(g,pressed?"checkbox.pressed":"checkbox.hover",background,false,opacity);
  draw(g,checked?"checkbox.checked":"checkbox.unchecked",{row.x+4,row.y+(row.h-7)/2,7,7},true,opacity);
}
PixelCheckbox::PixelCheckbox(const PixelFont& font,const Skin& skin,std::u32string label,bool checked,std::function<void(bool)> changed)
  :PixelButton(font,skin,std::move(label),[]{}) {
  skinStyle="checkbox";active=checked;setTransparent(true);
  Click.connect([this,changed=std::move(changed)]{if(!isEnabled())return;active=!active;invalidate();if(changed)changed(active);});
}
PixelSwitch::PixelSwitch(const PixelFont& font,const Skin& skin,std::u32string label,bool checked,std::function<void(bool)> changed)
  :PixelButton(font,skin,std::move(label),[]{}) {
  if(caption.find_first_not_of(U" \t\r\n")==std::u32string::npos)throw std::invalid_argument("PixelSwitch requires a text label");
  skinStyle="switch";active=checked;
  Click.connect([this,changed=std::move(changed)]{if(!isEnabled())return;active=!active;invalidate();if(changed)changed(active);});
}
bool PixelSwitch::onProcessMessage(ui::Message* msg) {
  // Legacy input[type=checkbox] uses Space, rather than Enter, to toggle.
  if(msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()==ui::kKeyEnter || key->scancode()==ui::kKeyEnterPad)return false;}
  return PixelButton::onProcessMessage(msg);
}
PixelScrollBar::PixelScrollBar(const Skin& skin,bool vertical)
  :ui::ScrollBar(vertical?ui::VERTICAL:ui::HORIZONTAL,this),skin_(skin),vertical_(vertical) {
  setBorder(gfx::Border(0));setBarWidth(7*uiScale);setVisible(false);
}
void PixelScrollBar::configure(int total,int page,int value) {
  total=std::max(0,total);page=std::max(1,page);value=std::clamp(value,0,std::max(0,total-page));
  if(total_==total && page_==page && value_==value)return;
  total_=total;page_=page;value_=value;
  setSize(total_);setPos(value_);
}
void PixelScrollBar::setDockBounds(gfx::Rect track) {
  // Layout reserves six pixels: the seventh shares the content's outer edge.
  // Do not add another black strip or inset the thumb inside the track.
  setBounds(track);
}
gfx::Rect PixelScrollBar::edgeBounds(gfx::Rect frame,bool vertical) {
  const int thickness=7*uiScale;
  if(vertical){frame.x=frame.x2()-thickness;frame.w=thickness;}
  else{frame.y=frame.y2()-thickness;frame.h=thickness;}
  return frame;
}
void PixelScrollBar::setMaterialOpacity(int opacity,int hoverOpacity) {
  materialOpacity_=std::clamp(opacity,0,255);
  materialHoverOpacity_=hoverOpacity<0?materialOpacity_:std::clamp(hoverOpacity,0,255);
  // The editor composites the clipped background before this material. Keep
  // an opaque widget region so invalidation cannot escape into other panels.
  setTransparent(false);invalidate();
}
gfx::Rect PixelScrollBar::gridBounds(gfx::Rect viewport,bool vertical) {
  return vertical?gfx::Rect(viewport.x2(),viewport.y-uiScale,7*uiScale,viewport.h+2*uiScale):gfx::Rect(viewport.x,viewport.y2(),viewport.w,7*uiScale);
}
void PixelScrollBar::setViewScroll(const gfx::Point& point) {
  const int next=std::clamp(vertical_?point.y:point.x,0,std::max(0,total_-page_));
  if(next==value_)return;value_=next;setPos(next);if(changed)changed(next);
}
gfx::Rect PixelScrollBar::thumbBounds() {
  int pos=0,len=0;getScrollBarThemeInfo(&pos,&len);auto r=clientBounds();
  const int extent=vertical_?r.h:r.w;
  const int length=std::clamp(len,uiScale,std::max(uiScale,extent-2*uiScale));
  const int start=std::clamp(pos,uiScale,std::max(uiScale,extent-length-uiScale));
  if(vertical_){r.y+=start;r.h=length;}else{r.x+=start;r.w=length;}
  return r.offset(bounds().origin());
}
void PixelScrollBar::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();
  const std::string prefix=vertical_?"scrollbar.vertical.":"scrollbar.horizontal.";
  const auto thumb=thumbBounds().offset(-bounds().origin());
  auto paint=[&](ui::Graphics& target){
    {UiPaintScale scale(target);skin_.draw(target,prefix+"track",uiLogical(clientBounds()));}
    UiPaintScale scale(target,thumb.origin());
    skin_.draw(target,prefix+(thumbHover_ || hasCapture()?"hover":"normal"),uiLogical(gfx::Rect(0,0,thumb.w,thumb.h)));
  };
  const int alpha=thumbHover_ || hasCapture()?materialHoverOpacity_:materialOpacity_;
  if(alpha==255){paint(g);return;}
  const auto rc=clientBounds();
  if(!materialSurface_ || materialSurface_->width()!=rc.w || materialSurface_->height()!=rc.h)
    materialSurface_=os::instance()->makeRgbaSurface(rc.w,rc.h);
  materialSurface_->clear();{ui::Graphics material(materialSurface_);paint(material);}
  ui::Paint opacity;opacity.blendMode(os::BlendMode::SrcOver);opacity.skPaint().setAlpha(alpha);
  g.drawSurface(materialSurface_.get(),rc,rc,os::Sampling(),&opacity);
}
bool PixelScrollBar::onProcessMessage(ui::Message* msg) {
  if(!isEnabled()){if(hasCapture())releaseMouse();return ui::Widget::onProcessMessage(msg);}
  if(msg->type()==ui::kMouseDownMessage && !static_cast<ui::MouseMessage*>(msg)->left())return false;
  if(msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseLeaveMessage){
    const bool hover=msg->type()!=ui::kMouseLeaveMessage && thumbBounds().contains(static_cast<ui::MouseMessage*>(msg)->position());
    if(hover!=thumbHover_){thumbHover_=hover;invalidate();}
  }
  if(msg->type()==ui::kMouseWheelMessage){const auto delta=static_cast<ui::MouseMessage*>(msg)->wheelDelta();
    // LAF already normalizes wheel-down/right to positive deltas.
    const int steps=vertical_?delta.y:(delta.x?delta.x:delta.y);
    if(steps){const int next=int(std::clamp<long long>(value_+1LL*steps*wheelStep,0,std::max(0,total_-page_)));setViewScroll({next,next});}return true;}
  return ui::ScrollBar::onProcessMessage(msg);
}
bool PixelEntry::commitExpression() {
  if(!(numeric || wheel) || !isEnabled() || isReadOnly())return false;
  const auto source=text();std::size_t at=0;int depth=0;
  auto space=[&]{while(at<source.size() && std::isspace(static_cast<unsigned char>(source[at])))++at;};
  std::function<double()> primary,product,sum;
  primary=[&]() -> double {
    space();if(++depth>64)throw std::runtime_error("Expression depth");
    if(at>=source.size())throw std::runtime_error("Missing operand");
    double value;
    if(source[at]=='+' || source[at]=='-'){const bool negative=source[at++]=='-';value=primary();if(negative)value=-value;}
    else if(source[at]=='('){++at;value=sum();space();if(at>=source.size() || source[at++]!=')')throw std::runtime_error("Missing parenthesis");}
    else{if(!(std::isdigit(static_cast<unsigned char>(source[at])) || source[at]=='.'))throw std::runtime_error("Invalid operand");std::size_t used=0;value=std::stod(source.substr(at),&used);at+=used;}
    --depth;if(!std::isfinite(value))throw std::runtime_error("Nonfinite operand");return value;
  };
  product=[&]{double value=primary();space();while(at<source.size() && (source[at]=='*' || source[at]=='/')){const char op=source[at++];const double rhs=primary();if(op=='/' && rhs==0)throw std::runtime_error("Division zero");value=op=='*'?value*rhs:value/rhs;space();}return value;};
  sum=[&]{double value=product();space();while(at<source.size() && (source[at]=='+' || source[at]=='-')){const char op=source[at++];const double rhs=product();value=op=='+'?value+rhs:value-rhs;space();}return value;};
  try{double value=sum();space();if(at!=source.size() || !std::isfinite(value))throw std::runtime_error("Invalid expression");if(deferredNumeric)value=std::clamp(value,numericMinimum,numericMaximum);std::ostringstream out;out.precision(12);out<<value;setText(out.str());if(deferredNumeric&&deferredCommit)deferredCommit();else if(!deferredNumeric||!numericValue||value!=numericValue())Change();if(deferredNumeric&&numericValue){std::ostringstream normalized;normalized.precision(12);normalized<<numericValue();setText(normalized.str());}return true;}catch(...){if(deferredNumeric&&numericValue){std::ostringstream out;out.precision(12);out<<numericValue();setText(out.str());}return false;}
}
void PixelEntry::adjustNumber(int delta) {
  if(!isEnabled() || isReadOnly() || !delta)return;
  if(wheel){wheel(delta);return;}
  if(!numeric)return;
  try{if(deferredNumeric&&numericValue){const double next=std::clamp(numericValue()+delta*numericStep,numericMinimum,numericMaximum);std::ostringstream out;out.precision(12);out<<next;setText(out.str());Change();invalidate();return;}std::size_t used=0;const double value=text().empty()?0:std::stod(text(),&used);
    if(used!=text().size() || !std::isfinite(value))return;
    std::ostringstream out;out.precision(12);out<<value+delta*numericStep;
    setText(out.str());Change();invalidate();
  }catch(...){ }
}
static void drawInputFrame(ui::Graphics& g,const Skin& skin,gfx::Rect physical,bool frameHover=false) {
  skin.draw(g,frameHover?"entry.hover":"entry.normal",uiLogical(physical));
}
bool PixelEntry::editClipboard(Cmd command) {
  if(!isEnabled())return false;
  EntryEditHistory::Record edit(*this,0);
  if(command==Cmd::Copy || command==Cmd::Cut) {
    if((command==Cmd::Copy || !isReadOnly()) && !selectedText().empty() &&
       trySetInputClipboardText(selectedText()) && command==Cmd::Cut)
      executeCmd(Cmd::DeleteNextChar);
  }else if(command==Cmd::Paste) {
    if(!isReadOnly()) {
      std::string text;
      if(ui::get_clipboard_text(text)) {
        // Actual legacy input paste replaces CR/LF/CRLF with one space.
        std::string normalized;normalized.reserve(text.size());
        for(std::size_t i=0;i<text.size();++i){
          if(text[i]=='\r'||text[i]=='\n'){
            normalized+=' ';if(text[i]=='\r'&&i+1<text.size()&&text[i+1]=='\n')++i;
          }else normalized+=text[i];
        }
        auto& system=*ui::UISystem::instance();
        NativeTextClipboard snapshot(system,[](const std::string&){return false;},
          [&](std::string& out){out=normalized;return true;},[]{return true;});
        if(selectedRange().isEmpty())deselectText();
        executeCmd(Cmd::Paste);
      }
    }
  }else return false;
  // Preserve the shared input's existing post-edit scroll correction for both
  // keyboard and menu commands; reuse Entry boxes and its one Change callback.
  if(bounds().w>=currentContentWidth()*uiScale){
    int scroll=0,caret=0;getEntryThemeInfo(&scroll,&caret,nullptr,nullptr);
    if(scroll){setCaretPos(0);setCaretPos(caret);invalidate();}
  }
  return true;
}
void PixelEntry::showInputEditMenu(gfx::Point position) {
  if(editMenuOpen_ || !isEnabled())return;
  // Entry::setText may leave an old anchor beyond the shortened value, which
  // selectedRange clamps against its sentinel box. Empty text has no selection.
  if(text().empty())selectText(0,0);
  PixelInputMenu menu(skin_);const bool selected=!selectedText().empty();
  auto history=EntryEditHistory::get(*this);
  auto historyItem=[&](std::u32string caption,std::u32string shortcut,bool forward){
    auto row=new PixelMenuItem(font_,skin_,std::move(caption),std::move(shortcut));
    row->setEnabled(!isReadOnly()&&!(forward?history->redo:history->undo).empty());
    row->Click.connect([this,history,forward]{history->restore(*this,forward,[this]{onChange();});});menu.addChild(row);
  };
  historyItem(U"撤销",U"Ctrl+Z",false);historyItem(U"重做",U"Ctrl+Y",true);
  menu.addChild(new PixelMenuSeparator(skin_));
  auto clipboard=ui::UISystem::instance()->clipboardDelegate();
  auto item=[&](std::u32string label,std::u32string shortcut,bool enabled,Cmd command){
    auto row=new PixelMenuItem(font_,skin_,std::move(label),std::move(shortcut));row->setEnabled(enabled);
    row->Click.connect([this,enabled,command]{if(!enabled || !isEnabled())return;
      if(!editClipboard(command)) {
        if(command==Cmd::SelectAll)selectAllText();
        else if(command==Cmd::DeleteNextChar && !isReadOnly() && !selectedText().empty()){EntryEditHistory::Record edit(*this,3);executeCmd(command);}
      }
    });menu.addChild(row);
  };
  item(U"剪切",U"Ctrl+X",selected&&!isReadOnly()&&clipboard,Cmd::Cut);
  item(U"复制",U"Ctrl+C",selected&&clipboard,Cmd::Copy);
  item(U"粘贴",U"Ctrl+V",!isReadOnly()&&clipboard&&clipboard->hasClipboardText(),Cmd::Paste);
  item(U"删除",U"Delete",selected&&!isReadOnly(),Cmd::DeleteNextChar);
  menu.addChild(new PixelMenuSeparator(skin_));
  item(U"全选",U"Ctrl+A",!text().empty(),Cmd::SelectAll);
  // Focus temporarily belongs to the menu, not another form field. Preserve
  // the input draft/selection and suppress numeric blur commit during this hop.
  editMenuOpen_=true;
  try {menu.showPopup(position,display());}catch(...){editMenuOpen_=false;editMenuRefocus_=true;requestFocus();throw;}
  editMenuOpen_=false;editMenuRefocus_=true;requestFocus();
}
bool PixelEntry::onProcessMessage(ui::Message* msg) {
  // Legacy text/decimal inputs retain selection across blur and programmatic
  // refocus. Keep explicit form focus callbacks free to select their own range.
  setPersistSelection(true);
  if(rightSelecting_ && msg->type()==ui::kFocusLeaveMessage && !editMenuOpen_){rightSelecting_=false;editMenuRefocus_=false;if(hasCapture())releaseMouse();}
  if((editMenuOpen_ || editMenuRefocus_) && (msg->type()==ui::kFocusEnterMessage || msg->type()==ui::kFocusLeaveMessage)) {
    const bool entering=msg->type()==ui::kFocusEnterMessage;
    if(entering){if(!editMenuOpen_)editMenuRefocus_=false;showCaret();}
    else hideCaret();
    os::System::instance()->setTextInput(entering,entering?caretPosOnScreen():gfx::Point());
    invalidate();return true;
  }
  if(paletteViewport && !hasCapture() && msg->type()==ui::kMouseDownMessage && !paletteViewport().contains(static_cast<ui::MouseMessage*>(msg)->position()))return false;
  if(msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->right()) {
    if(!isEnabled())return true;
    editMenuRefocus_=true;requestFocus();if(hasCapture())releaseMouse();scrubbing_=false;
    const auto mouse=static_cast<ui::MouseMessage*>(msg);int scroll=0;getEntryThemeInfo(&scroll,nullptr,nullptr,nullptr);
    const auto value=unicodeText(text());const int start=std::clamp(scroll,0,int(value.size()));
    int x=bounds().x+getEntryTextBounds().x,best=start,distance=std::abs(mouse->position().x-x);
    for(int i=start;i<int(value.size());++i){x+=font_.measure(value.substr(i,1))*uiScale;const int next=std::abs(mouse->position().x-x);if(next<distance){distance=next;best=i+1;}}
    best=std::min(best,lastCaretPos());const auto range=selectedRange();
    if(range.isEmpty() || best<range.from || best>range.to)selectText(best,best);
    rightSelecting_=true;captureMouse();return true;
  }
  if(rightSelecting_ && (msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage)) {
    if(!hasCapture()){rightSelecting_=false;editMenuRefocus_=false;return true;}
    if(msg->type()==ui::kMouseUpMessage && static_cast<ui::MouseMessage*>(msg)->right()){
      rightSelecting_=false;releaseMouse();showInputEditMenu(static_cast<ui::MouseMessage*>(msg)->position());
    }
    return true;
  }
  bool clipboardHandled=false,navigationHandled=false;
  std::optional<EntryEditHistory::Record> textEdit;
  if(msg->type()==ui::kKeyDownMessage && isEnabled() && hasFocus()) {
    const auto key=static_cast<ui::KeyMessage*>(msg);const auto code=key->scancode();
    auto history=EntryEditHistory::get(*this);
    const bool undo=(code==ui::kKeyZ&&(key->onlyCtrlPressed()||key->modifiers()==ui::KeyModifiers(ui::kKeyCtrlModifier|ui::kKeyShiftModifier)));
    const bool redo=(code==ui::kKeyY&&key->onlyCtrlPressed())||(undo&&key->shiftPressed());
    if(undo||redo){history->restore(*this,redo,[this]{onChange();});return true;}
    if(code==ui::kKeyMenu || (code==ui::kKeyF10 && key->onlyShiftPressed())){
      int scroll=0;getEntryThemeInfo(&scroll,nullptr,nullptr,nullptr);const auto value=unicodeText(text());
      const int start=std::clamp(scroll,0,int(value.size())),caret=std::clamp(caretPos(),start,int(value.size()));
      const auto rc=getEntryTextBounds();showInputEditMenu(bounds().origin()+gfx::Point(std::clamp(rc.x+font_.measure(value.substr(start,caret-start))*uiScale,rc.x,rc.x2()),rc.y2()));return true;
    }
    // Reuse MIT commands for anchors, boxes, scrolling and the IME caret.
    // Browser readonly inputs expose selection, without an editable caret.
    if(!key->altPressed()&&!key->cmdPressed()&&
       (((code==ui::kKeyLeft||code==ui::kKeyRight)&&!key->ctrlPressed())||
        code==ui::kKeyHome||code==ui::kKeyEnd||(code==ui::kKeyA&&key->onlyCtrlPressed()))) {
      history->group=0;const auto range=selectedRange();
      if(!isReadOnly()||code==ui::kKeyA||(key->shiftPressed()&&!selectedText().empty())) {
        if(!key->shiftPressed()&&(code==ui::kKeyLeft||code==ui::kKeyRight)&&!selectedText().empty()) {
          const int edge=code==ui::kKeyLeft?range.from:range.to;selectText(edge,edge);
        }else executeCmd(cmdFromKeyMessage(key),0,key->shiftPressed());
      }
      navigationHandled=true;
    }
    const bool control=key->onlyCtrlPressed(),shift=key->onlyShiftPressed();
    if(control && (code==ui::kKeyC || code==ui::kKeyInsert))clipboardHandled=editClipboard(Cmd::Copy);
    else if((control && code==ui::kKeyX) || (shift && code==ui::kKeyDel))clipboardHandled=editClipboard(Cmd::Cut);
    else if((control && code==ui::kKeyV) || (shift && code==ui::kKeyInsert))clipboardHandled=editClipboard(Cmd::Paste);
    if(!clipboardHandled&&!navigationHandled&&!isReadOnly()){
      if(code==ui::kKeyBackspace||code==ui::kKeyDel)textEdit.emplace(*this,key->ctrlPressed()||key->altPressed()?0:code==ui::kKeyBackspace?2:3);
      else if(!key->ctrlPressed()&&!key->altPressed()&&!key->cmdPressed()&&key->unicodeChar()>=32)textEdit.emplace(*this,key->unicodeChar()<128?1:0);
      else if(code==ui::kKeyLeft||code==ui::kKeyRight||code==ui::kKeyHome||code==ui::kKeyEnd||code==ui::kKeyA)history->group=0;
    }
  }
  if(msg->type()==ui::kMouseLeaveMessage){if(frameHover_){frameHover_=false;invalidate();}}
  else if(msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseUpMessage){
    const auto point=static_cast<ui::MouseMessage*>(msg)->position();
    const bool inside=bounds().contains(point) && (!paletteViewport || paletteViewport().contains(point));
    if(inside!=frameHover_){frameHover_=inside;invalidate();}
  }
  if(paletteViewport && !hasCapture() && msg->type()==ui::kMouseDownMessage && !paletteViewport().contains(static_cast<ui::MouseMessage*>(msg)->position()))return false;
  if(msg->type()==ui::kMouseDownMessage && isEnabled() && !isReadOnly() && focus){
    const auto mouse=static_cast<ui::MouseMessage*>(msg);
    const int suffixWidth=(font_.measure(suffix)+4)*uiScale;
    const bool scrub=(numeric || wheel) && (mouse->position().x<bounds().x+4*uiScale || (!suffix.empty() && mouse->position().x>=bounds().x2()-suffixWidth));
    // A focused field receives no second FocusEnter; scrubbing bypasses Entry's
    // focus handling entirely. Both clicks must still reopen the legacy flyout.
    if(mouse->left() && (hasFocus() || scrub))focus();
  }
  if(msg->type()==ui::kFocusEnterMessage || msg->type()==ui::kFocusLeaveMessage){if(auto history=std::dynamic_pointer_cast<EntryEditHistory>(getProperty(EntryEditHistory::propertyName)))history->group=0;invalidate();}
  if(isEnabled() && !isReadOnly() && (numeric || wheel)) {
    if(msg->type()==ui::kMouseDownMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);
      const int suffixWidth=(font_.measure(suffix)+4)*uiScale;
      if(mouse->left() && (mouse->position().x<bounds().x+4*uiScale || (!suffix.empty() && mouse->position().x>=bounds().x2()-suffixWidth))){scrubbing_=true;scrubLastX_=mouse->position().x;captureMouse();return true;}}
    if(scrubbing_ && msg->type()==ui::kMouseMoveMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);const int dx=mouse->position().x-scrubLastX_;scrubLastX_=mouse->position().x;adjustNumber(dx*(mouse->shiftPressed()?10:1));return true;}
    if(scrubbing_ && msg->type()==ui::kMouseUpMessage){scrubbing_=false;if(hasCapture())releaseMouse();if(blur)blur();return true;}
    if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()==ui::kKeyUp || key->scancode()==ui::kKeyDown){adjustNumber(key->scancode()==ui::kKeyUp?1:-1);return true;}}
  }
  if(scrubbing_ && !hasCapture())scrubbing_=false;
  if(scrubbing_ && msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){scrubbing_=false;if(hasCapture())releaseMouse();return true;}
  if(msg->type()==ui::kMouseEnterMessage && hover) hover();
  if(msg->type()==ui::kFocusEnterMessage && focus) focus();
  if(isEnabled() && !isReadOnly() && msg->type()==ui::kMouseWheelMessage && (numeric || wheel)) {
    const auto mouse=static_cast<ui::MouseMessage*>(msg);
    if(!mouse->ctrlPressed() && !mouse->cmdPressed()) {const int dy=mouse->wheelDelta().y;if(dy) adjustNumber(dy>0?-1:1);return true;}
  }
  if(msg->type()==ui::kKeyDownMessage) {
    const auto key=static_cast<ui::KeyMessage*>(msg);
    if(key->scancode()==ui::kKeyEnter && accept) {const bool expression=deferredNumeric&&text().find_first_of("+-*/()",1)!=std::string::npos;commitExpression();if(!expression)accept();return true;}
    if(key->scancode()==ui::kKeyEsc && cancel) {cancel();return true;}
  }
  const bool handled=clipboardHandled || navigationHandled || ui::Entry::onProcessMessage(msg);
  // A field that can show its entire value must not retain an end-only scroll
  // left over from the smaller geometry used before the toolbar relayout.
  if(bounds().w>=currentContentWidth()*uiScale){
    int scroll=0,caret=0;getEntryThemeInfo(&scroll,&caret,nullptr,nullptr);
    if(scroll){setCaretPos(0);setCaretPos(caret);invalidate();}
  }
  if(msg->type()==ui::kFocusLeaveMessage && blur) {if(deferredNumeric&&numericMounted&&!numericMounted()){if(numericValue){std::ostringstream out;out.precision(12);out<<numericValue();setText(out.str());}}else{commitExpression();blur();}}return handled;
}
void PixelEntry::onResize(ui::ResizeEvent& ev) {
  auto rect=ev.bounds();rect.h=textControlHeight*uiScale;setBoundsQuietly(rect);
}
int PixelEntry::contentWidth() const {
  if(fixedContentWidth_>0)return fixedContentWidth_;
  return currentContentWidth();
}
int PixelEntry::widthForValue(const std::u32string& value) const {
  return 9+font_.measure(value)+(suffix.empty()?0:font_.measure(suffix)+uiGap);
}
int PixelEntry::currentContentWidth() const {
  const int visible=font_.measure(unicodeText(text()));
  const int editing=int(std::ceil(getCharBoxBounds(lastCaretPos()).x*scale().x/uiScale));
  return 6+std::max({font_.measure(U"0"),visible,editing})+3+
    (suffix.empty()?0:font_.measure(suffix)+uiGap);
}
gfx::Rect PixelEntry::onGetEntryTextBounds() const {
  auto rc=clientBounds();
  // Normal frame and text padding share the same layout origin.
  const int padding=3*uiScale;
  rc.x+=padding;rc.w=std::max(0,rc.w-2*padding-(suffix.empty()?0:(font_.measure(suffix)+uiGap)*uiScale));
  rc.y+=(rc.h-10*uiScale)/2;rc.h=10*uiScale;
  return rc;
}
void PixelEntry::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();PhysicalViewportClip viewportClip(g,paletteViewport?std::optional<gfx::Rect>(paletteViewport().offset(-bounds().origin())):std::nullopt);UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());
  drawInputFrame(g,skin_,uiPhysical(rc),isEnabled() && frameHover_);
  int scroll=0,caret=0,state=0;Range selection;getEntryThemeInfo(&scroll,&caret,&state,&selection);
  const auto value=unicodeText(text());const int start=std::clamp(scroll,0,int(value.size()));
  const auto textBounds=uiLogical(getEntryTextBounds());
  int x=textBounds.x;const int y=textBounds.y;
  const int suffixWidth=font_.measure(suffix);
  g.saveClip();g.clipRect(textBounds);
  for(int i=start;i<int(value.size());++i) {
    const auto glyph=value.substr(i,1);const int width=font_.measure(glyph);
    if(!selection.isEmpty() && i>=selection.from && i<selection.to) g.fillRect(skin_["accent"],gfx::Rect(x,y,width,10));
    font_.draw(g,glyph,x,y,skin_[isEnabled()?"text":"muted"]);if(hasFocus() && state && i==caret) g.fillRect(skin_["text"],gfx::Rect(x,y,1,10));x+=width;
  }
  if(hasFocus() && state && caret==int(value.size())) g.fillRect(skin_["text"],gfx::Rect(x,y,1,10));
  g.restoreClip();
  if(!suffix.empty()) font_.draw(g,suffix,std::min(x+uiGap,rc.x2()-3-suffixWidth),y,skin_["muted"]);

}
void PixelSlider::begin() {if(!active_) {active_=true;if(interactionBegin) interactionBegin();}}
void PixelSlider::finish() {if(active_) {active_=false;if(interactionCommit) interactionCommit();}invalidate();}
void PixelSlider::change(int next,bool shift) {
  next=std::clamp(next,minimum,maximum);
  if(shift && next!=minimum && next!=maximum) {const int stride=percentage?10:5;next=std::clamp(int(std::floor(double(next)/stride+0.5))*stride,minimum,maximum);}
  if(next!=value) {value=next;if(changed) changed(value);invalidate();}
}
bool PixelSlider::onProcessMessage(ui::Message* msg) {
  if(msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseLeaveMessage || msg->type()==ui::kFocusLeaveMessage) {
    bool hover=false;
    if((hasFocus() || active_) && (msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage))hover=skin_.selectionContains(skin_.selectionMaterialBounds(bounds()),static_cast<ui::MouseMessage*>(msg)->position());
    if(hover!=selectionHover_){selectionHover_=hover;invalidate();}
  }
  if(msg->type()==ui::kFocusEnterMessage)invalidate();
  if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc && interactionCancel) {
    if(active_){active_=false;if(hasCapture())releaseMouse();interactionCancel();invalidate();}return true;
  }
  if(msg->type()==ui::kFocusLeaveMessage) {finish();if(hasCapture()) releaseMouse();}
  if(!isEnabled()) {finish();return ui::Widget::onProcessMessage(msg);}
  if(msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage) {
    const auto mouse=static_cast<ui::MouseMessage*>(msg);
    if(msg->type()==ui::kMouseDownMessage && mouse->left()) {requestFocus();captureMouse();begin();}
    if(hasCapture()) {
      const auto rc=bounds();const int left=rc.x+uiScale,width=std::max(1,rc.w-2*uiScale-1);
      const double progress=std::clamp(double(mouse->position().x-left)/width,0.0,1.0);
      change(int(std::floor(minimum+progress*(maximum-minimum)+0.5)),mouse->shiftPressed());
      if(msg->type()==ui::kMouseUpMessage && mouse->left()) {releaseMouse();finish();}
      return true;
    }
  }
  if(msg->type()==ui::kMouseWheelMessage) {
    const auto mouse=static_cast<ui::MouseMessage*>(msg);const int delta=mouse->wheelDelta().y;
    if(!delta) return true;
    const int stride=mouse->shiftPressed()?(percentage?10:5):1;
    const int next=std::clamp(value+(delta<0?stride:-stride),minimum,maximum);
    if(next!=value) {const bool discrete=!active_;begin();change(next,false);if(discrete) finish();}return true;
  }
  if(msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage) {
    const auto key=static_cast<ui::KeyMessage*>(msg);int next=value;
    switch(key->scancode()) {
      case ui::kKeyLeft:case ui::kKeyDown:next=value-1;break;
      case ui::kKeyRight:case ui::kKeyUp:next=value+1;break;
      case ui::kKeyHome:next=minimum;break;case ui::kKeyEnd:next=maximum;break;
      case ui::kKeyPageUp:next=value+std::max(1,(maximum-minimum)/10);break;
      case ui::kKeyPageDown:next=value-std::max(1,(maximum-minimum)/10);break;
      default:return ui::Widget::onProcessMessage(msg);
    }
    if(msg->type()==ui::kKeyDownMessage) {begin();change(next,key->shiftPressed());}else if(!hasCapture()) finish();return true;
  }
  return ui::Widget::onProcessMessage(msg);
}
void PixelSlider::onResize(ui::ResizeEvent& ev) {auto rect=ev.bounds();rect.h=textControlHeight*uiScale;setBoundsQuietly(rect);}
void PixelSlider::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());
  // Normal material bounds own layout; selection pixels extend outward.
  const char* slot="slider.normal";
  const auto border=rc;
  skin_.draw(g,slot,border);
  const int width=std::max(0,border.w-2),height=std::max(0,border.h-2);
  const double progress=maximum>minimum?std::clamp(double(value-minimum)/(maximum-minimum),0.0,1.0):0;
  const int fill=int(std::floor(width*progress+0.5));
  if(colorGradient && border.w>4 && border.h>4){
    std::array<std::uint32_t,5> stops;for(int i=0;i<5;++i)stops[i]=colorGradient(i/4.);
    for(int x=0;x<border.w-4;++x){const double t=double(x)/std::max(1,border.w-5)*4;const int i=std::min(3,int(t));const double f=t-i;auto channel=[&](int n){return int(std::floor(((stops[i]>>(8*n))&255)*(1-f)+((stops[i+1]>>(8*n))&255)*f+.5));};
      for(int y=0;y<border.h-4;++y){const int checker=((x/4+y/4)%2)?128:192,a=channel(3);auto over=[&](int n){return (channel(n)*a+checker*(255-a)+127)/255;};g.fillRect(gfx::rgba(over(0),over(1),over(2)),{border.x+2+x,border.y+2+y,1,1});}
    }
    const auto part=skin_.assets.patches.find("icon.marker-light");
    if(part!=skin_.assets.patches.end()){
      const auto box=pickerMarkerBox({border.x+2,border.y+2,border.w-4,border.h-4},progress,.5,part->second.bitmap->width,part->second.bitmap->height);
      const int sx=std::clamp(box.x-(border.x+2)+box.w/2,0,border.w-5),sy=std::clamp(box.y-(border.y+2)+box.h/2,0,border.h-5);
      const double t=double(sx)/std::max(1,border.w-5)*4;const int i=std::min(3,int(t));const double f=t-i;auto channel=[&](int n){return int(std::floor(((stops[i]>>(8*n))&255)*(1-f)+((stops[i+1]>>(8*n))&255)*f+.5));};
      const int a=channel(3),checker=((sx/4+sy/4)%2)?128:192;auto over=[&](int n){return (channel(n)*a+checker*(255-a)+127)/255;};
      skin_.draw(g,pickerLightMarker(over(0),over(1),over(2))?"icon.marker-light":"icon.marker-dark",{box.x,box.y,box.w,box.h},true);
    }
  }
  else if(fill>0 && height>0) {g.saveClip();g.clipRect(gfx::Rect(border.x+1,border.y+1,fill,height));skin_.draw(g,"slider.fill",gfx::Rect(border.x+1,border.y+1,std::max(3,fill),height));g.restoreClip();}
  if(hasFocus() || active_)skin_.drawSelectionBorder(g,uiPhysical(rc),selectionHover_);
  const auto style=skin_.assets.text.find(slot);
  const auto color=skin_[!isEnabled()?"muted":style==skin_.assets.text.end()?"text":style->second.color.c_str()];
  if(!colorGradient){auto label=valueLabel?valueLabel(value):unicodeText(std::to_string(value))+(percentage?U"%":numberSuffix);font_.draw(g,label,rc.x+(rc.w-font_.measure(label))/2,rc.y+(rc.h-10)/2,color);}
}
namespace {
// Insets reserve the skin's frame first, then the requested clear content gap.
gfx::Border menuInsets(const Skin& skin,const char* slot) {
  auto found=skin.assets.patches.find(slot);
  if(found==skin.assets.patches.end()) return gfx::Border(1+uiGap);
  const auto& patch=found->second;
  return gfx::Border(patch.left+uiGap,patch.top+uiGap,patch.right+uiGap,patch.bottom+uiGap);
}
gfx::Border menuBarInsets(const Skin& skin,int reduction=0) {
  auto inset=menuInsets(skin,"menu_hover");
  // Top-level labels have extra horizontal clear padding.
  inset+=gfx::Border(uiGap,0,uiGap,0);
  return gfx::Border(std::max(uiGap,inset.left()-reduction),inset.top(),std::max(uiGap,inset.right()-reduction),inset.bottom());
}
gfx::Border menuRowInsets() {
  return gfx::Border(uiGap,uiGap+1,uiGap,uiGap+1);
}
constexpr int menuIconSize=11;
gfx::Rect menuIconBounds(const gfx::Rect& content,int x,int size) {
  const gfx::Rect container(x,content.y+(content.h-menuIconSize)/2,menuIconSize,menuIconSize);
  return gfx::Rect(container.x+(container.w-size)/2,container.y+(container.h-size)/2,size,size);
}
int menuIconGutter(const PixelMenuItem& item,bool inBar) {
  if(inBar) return 0;
  // Reserve one aligned column only when this menu actually has icons/checks.
  auto needsIcon=[](const PixelMenuItem& entry) {return (entry.iconSkin && !entry.icon.empty()) || bool(entry.checked);};
  if(needsIcon(item)) return menuIconSize+uiGap;
  if(item.parent()) for(auto child:item.parent()->children()) {
    auto entry=dynamic_cast<PixelMenuItem*>(child);
    if(entry && needsIcon(*entry)) return menuIconSize+uiGap;
  }
  return 0;
}
}
PixelMenu::PixelMenu(const Skin& skin):skin_(skin) {
  auto inset=menuInsets(skin,"menu_popup");
  // The menu frame owns the outline; rows supply their own content padding.
  inset+=gfx::Border(-uiGap);inset*=uiScale;
  setBorder(inset);setChildSpacing(uiGap*uiScale);
}
void PixelMenu::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());
  g.fillRect(skin_["background"],rc);
  if(!inBar()){ if(!skin_.draw(g,"menu_popup",rc)) g.drawRect(skin_["border"],rc); }
}
PixelMenuItem::PixelMenuItem(const PixelFont& font,const Skin& skin,std::u32string caption,std::u32string shortcut)
  :ui::MenuItem(""),font_(font),skin_(skin),caption_(std::move(caption)),shortcut_(std::move(shortcut)) {}
void PixelMenuSeparator::onSizeHint(ui::SizeHintEvent& ev) {
  // Menu child spacing supplies the legacy divider's vertical margins.
  ev.setSizeHint((2*uiGap+1)*uiScale,uiScale);
}
void PixelMenuSeparator::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());
  g.fillRect(skin_["background"],rc);skin_.draw(g,"menu_item",rc);
  if(rc.w>2*uiGap) g.fillRect(skin_["border"],gfx::Rect(rc.x+uiGap,rc.y,rc.w-2*uiGap,1));
}
void PixelMenuItem::onValidate() {if(available) setEnabled(available());}
void PixelMenuItem::onSizeHint(ui::SizeHintEvent& ev) {
  const auto inset=inBar()?menuBarInsets(skin_,barInsetReduction):menuRowInsets();
  const auto captionInk=font_.inkBounds(caption_),shortcutInk=font_.inkBounds(shortcut_);
  const int iconHeight=iconSkin && !icon.empty()?menuIconSize:0;
  const int lineHeight=std::max({inBar()?9:menuIconSize,captionInk.h,shortcutInk.h,iconHeight});
  const int extra=(hasSubmenu() && !inBar()?menuIconSize+uiGap:0)+menuIconGutter(*this,inBar())+(inBar() || shortcut_.empty()?0:8+shortcutInk.w);
  ev.setSizeHint((captionInk.w+inset.width()+extra)*uiScale,(lineHeight+inset.height())*uiScale);
}
void PixelMenuItem::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());
  // Each menu item owns its paint region; cover content behind the popup.
  g.fillRect(skin_["background"],rc);
  if(inBar()) g.fillRect(skin_["background"],rc); else skin_.draw(g,"menu_item",rc);
  if((isHighlighted() || (inBar() && hasMouse())) && isEnabled()) {
    if(inBar()) {
      if(!skin_.draw(g,"menu_hover",rc)) g.fillRect(skin_["border"],rc);
    } else {
      // A flat menu highlight, not another framed button inside the popup.
      if(!skin_.draw(g,"menu_item_hover",rc)) g.fillRect(skin_["panel"],rc);
    }
  }
  const auto inset=inBar()?menuBarInsets(skin_,barInsetReduction):menuRowInsets();
  const gfx::Rect content(rc.x+inset.left(),rc.y+inset.top(),rc.w-inset.width(),rc.h-inset.height());
  const auto captionInk=font_.inkBounds(caption_),shortcutInk=font_.inkBounds(shortcut_);
  // Fusion's ten-pixel cell includes blank bearings. Align the visible ink,
  // retaining a common baseline for the caption and its shortcut.
  const int textY=content.y+(content.h-captionInk.h)/2-captionInk.y;
  const auto color=skin_[isEnabled()?"text":"muted"];
  if(iconSkin && !icon.empty()) iconSkin->draw(g,icon+(isEnabled()?"":"-disabled"),menuIconBounds(content,content.x,menuIconSize),true);
  if(hasSubmenu() && !inBar() && menuMarks) menuMarks->draw(g,"right",menuIconBounds(content,content.x2()-menuIconSize,5),true);
  font_.draw(g,caption_,content.x+menuIconGutter(*this,inBar())-captionInk.x,textY,color);
  if(!inBar()) {
    const int shortcutRight=content.x2()-(hasSubmenu()?menuIconSize+uiGap:0);
    font_.draw(g,shortcut_,shortcutRight-shortcutInk.w-shortcutInk.x,textY,skin_["muted"]);
    if(checked && checked() && menuMarks) menuMarks->draw(g,"check",menuIconBounds(content,content.x,7),true);
  }
}
PixelButton::PixelButton(const PixelFont& font,const Skin& skin,std::u32string label,std::function<void()> action)
  :ui::Button(""),font_(font),skin_(skin),caption(std::move(label)) {
  Click.connect(std::move(action));
  groupHold_.Tick.connect([this]{
    groupHold_.stop();
    if(!isEnabled() || !hasCapture() || !openGroup)return;
    releaseMouse();setSelected(false);invalidate();openGroup();
  });
}
gfx::Rect PixelButton::switchToggleBounds() const {
  const auto rc=uiLogical(clientBounds());
  return uiPhysical(gfx::Rect(rc.x2()-4-18,rc.y+(rc.h-9)/2,18,9)).offset(bounds().origin());
}
void PixelButton::onResize(ui::ResizeEvent& ev) {
  if(isCheckbox()){auto rect=ev.bounds();rect.h=textControlHeight*uiScale;setBoundsQuietly(rect);}
  else ui::Button::onResize(ev);
}
bool PixelButton::onProcessMessage(ui::Message* msg) {
  if(msg->type()==ui::kMouseLeaveMessage){if(contentPointerInside_){contentPointerInside_=false;invalidate();}}
  else if(msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseUpMessage){
    const auto point=static_cast<ui::MouseMessage*>(msg)->position();
    const bool inside=bounds().contains(point) && (!paletteViewport || paletteViewport().contains(point));
    if(inside!=contentPointerInside_){contentPointerInside_=inside;invalidate();}
  }
  if(skinStyle=="switch"){
    if(msg->type()==ui::kMouseLeaveMessage){switchPointerInside_=false;invalidate();}
    else if(msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseUpMessage){
      const auto point=static_cast<ui::MouseMessage*>(msg)->position();
      const bool inside=switchToggleBounds().contains(point) && (!paletteViewport || paletteViewport().contains(point));
      if(inside!=switchPointerInside_){switchPointerInside_=inside;invalidate();}
    }
  }
  if(isCheckbox()) {
    // Normal material is transparent: expose the parent when hover/held ends.
    setTransparent(true);
    // Pointer messages use physical display coordinates, including while captured.
    // Keep state repainting independent of the manager's HAS_MOUSE update order.
    if(msg->type()==ui::kMouseLeaveMessage){checkboxPointerInside_=false;invalidate();}
    else if(msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseMoveMessage ||
            msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseUpMessage){
      const auto point=static_cast<ui::MouseMessage*>(msg)->position();
      const bool inside=bounds().contains(point) && (!paletteViewport || paletteViewport().contains(point));
      if(checkboxPointerInside_!=inside){checkboxPointerInside_=inside;invalidate();}
    }
  }
  if(isCheckbox() && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)) {
    const auto key=static_cast<ui::KeyMessage*>(msg);
    if(key->scancode()==ui::kKeyEnter || key->scancode()==ui::kKeyEnterPad)return false;
  }

  if(paletteViewport && !hasCapture() && msg->type()==ui::kMouseDownMessage && !paletteViewport().contains(static_cast<ui::MouseMessage*>(msg)->position()))return false;
  if(pointerPress && isEnabled() && msg->type()==ui::kMouseDownMessage){const auto& mouse=*static_cast<ui::MouseMessage*>(msg);if(mouse.left() || mouse.right()){pointerPress(mouse);return true;}}
  if(framePress && isEnabled()) {
    if(msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->left()){auto& mouse=*static_cast<ui::MouseMessage*>(msg);frameDragStart=mouse.position().x;framePress(mouse);requestFocus();captureMouse();return true;}
    if(msg->type()==ui::kMouseMoveMessage && hasCapture()){if(frameDrag && (labelOnly || std::abs(static_cast<ui::MouseMessage*>(msg)->position().x-frameDragStart)>=4*uiScale))frameDrag(static_cast<ui::MouseMessage*>(msg)->position().x);return true;}
    if(msg->type()==ui::kMouseUpMessage && hasCapture()){const int x=static_cast<ui::MouseMessage*>(msg)->position().x;releaseMouse();if(std::abs(x-frameDragStart)>=4*uiScale){if(frameDrop)frameDrop(x);}else if(frameClick)frameClick();return true;}
    if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc && hasCapture()){releaseMouse();return true;}
  }
  if(rowDrop && isEnabled()) {
    if(msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->left()) {
      rowDragStart=static_cast<ui::MouseMessage*>(msg)->position().y;Click();requestFocus();captureMouse();return true;
    }
    if(msg->type()==ui::kMouseMoveMessage && hasCapture())return true;
    if(msg->type()==ui::kMouseUpMessage && hasCapture()) {
      const auto y=static_cast<ui::MouseMessage*>(msg)->position().y;releaseMouse();if(std::abs(y-rowDragStart)>=4*uiScale)rowDrop(y);return true;
    }
    if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc && hasCapture()){releaseMouse();return true;}
  }
  if(isEnabled() && doubleClick && msg->type()==ui::kDoubleClickMessage && (!doubleClickLeftOnly || static_cast<ui::MouseMessage*>(msg)->left())) {doubleClick();return true;}
  if(paletteCell && isEnabled() && palettePress && msg->type()==ui::kMouseDownMessage) {palettePress(*static_cast<ui::MouseMessage*>(msg));return true;}
  if(paletteCell && isEnabled() && msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->left()) {Click();return true;}
  if(msg->type()==ui::kMouseEnterMessage && hover) hover();
  if(openGroup) {
    if(msg->type()==ui::kKeyDownMessage && isEnabled()) {
      const auto code=static_cast<ui::KeyMessage*>(msg)->scancode();
      if(code==ui::kKeyDown || code==ui::kKeyF4){groupHold_.stop();openGroup();return true;}
    }
    if(msg->type()==ui::kMouseDownMessage && isEnabled() && static_cast<ui::MouseMessage*>(msg)->left()) {
      groupPressOrigin_=static_cast<ui::MouseMessage*>(msg)->position();groupHold_.start();
    }
    if(msg->type()==ui::kMouseMoveMessage) {
      const auto point=static_cast<ui::MouseMessage*>(msg)->position();
      if(std::hypot(double(point.x-groupPressOrigin_.x),double(point.y-groupPressOrigin_.y))>8)groupHold_.stop();
    }
    if(msg->type()==ui::kMouseUpMessage || msg->type()==ui::kMouseLeaveMessage)groupHold_.stop();
  }
  if(msg->type()==ui::kMouseDownMessage && isEnabled() && context && static_cast<ui::MouseMessage*>(msg)->right()) {context();return true;}
  const bool open=msg->type()==ui::kMouseUpMessage && isEnabled() && openGroup && hasCapture() &&
    static_cast<ui::MouseMessage*>(msg)->left() && bounds().contains(static_cast<ui::MouseMessage*>(msg)->position());
  const bool handled=ui::Button::onProcessMessage(msg);
  if(paletteRepaint && (msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseLeaveMessage || msg->type()==ui::kMouseMoveMessage)) paletteRepaint();
  if(hoverRepaint && (msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseLeaveMessage)) hoverRepaint();
  if(open) openGroup();
  return handled;
}
// legacy PalettePanel nameLuminance: alpha composite over white, threshold150.
std::uint32_t PixelButton::paletteNameTextColor(std::uint32_t rgba){const double a=(rgba>>24)/255.0;const double luminance=(.299*(rgba&255)+.587*((rgba>>8)&255)+.114*((rgba>>16)&255))*a+255*(1-a);return luminance>150?0xff111111:0xffffffff;}
gfx::Rect PixelButton::paletteColorBounds() const {
  auto rc=paletteMaterialRect?gfx::Rect(*paletteMaterialRect).offset(bounds().origin()):bounds();
  if(paletteCell && !recentColorSwatch && active && !paletteSharedSelection) rc.shrink(2*uiScale);
  return rc;
}
bool PixelButton::paletteSelectionContains(gfx::Point position) const {
  if(!paletteCell || recentColorSwatch || paletteSharedSelection || !active || !bounds().contains(position)) return false;
  return skin_.selectionContains(paletteMaterialRect?gfx::Rect(*paletteMaterialRect).offset(bounds().origin()):bounds(),position);
}
gfx::Rect PixelButton::iconContentBounds(const std::string& state) const {
  auto rc=uiLogical(clientBounds());
  // All four button materials share the same fixed border and content rectangle.
  const auto family=skin_.assets.patches.count("icon_button.normal")?"icon_button.":"button.";
  int left=0,right=0,top=0,bottom=0;
  for(const auto suffix:{"normal","hover","pressed","selected","focus","disabled"}) {
    auto it=skin_.assets.patches.find(std::string(family)+suffix);
    if(it!=skin_.assets.patches.end()) {left=std::max(left,it->second.left);right=std::max(right,it->second.right);top=std::max(top,it->second.top);bottom=std::max(bottom,it->second.bottom);}
  }
  const int size=std::max(0,std::min(rc.w-left-right,rc.h-top-bottom));
  return gfx::Rect(rc.x+(rc.w-size-left-right)/2+left,rc.y+(rc.h-size-top-bottom)/2+top,size,size);
}
// Center the visible icon pixels, preserving its original bitmap and alpha.
static void drawCaptionIcon(ui::Graphics& g,const Skin& skin,const std::string& name,gfx::Rect slot,int opacity) {
  const auto it=skin.assets.patches.find(name);if(it==skin.assets.patches.end())return;
  const auto& b=*it->second.bitmap;int x0=b.width,y0=b.height,x1=0,y1=0;
  for(int y=0;y<b.height;++y)for(int x=0;x<b.width;++x)if(b.pixels[y*b.width+x]>>24){x0=std::min(x0,x);y0=std::min(y0,y);x1=std::max(x1,x+1);y1=std::max(y1,y+1);}
  if(x1>x0 && y1>y0)skin.draw(g,name,{slot.x+(slot.w-(x1-x0))/2-x0,slot.y+(slot.h-(y1-y0))/2-y0,b.width,b.height},true,opacity);
}
void PixelButton::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();
  PhysicalViewportClip viewportClip(g,paletteViewport?std::optional<gfx::Rect>(paletteViewport().offset(-bounds().origin())):std::nullopt);
  UiPaintScale scale(g,paletteMaterialRect?paletteMaterialRect->origin():gfx::Point());
  auto rc=uiLogical(paletteMaterialRect?gfx::Rect(paletteMaterialRect->size()):clientBounds());
  if(isCheckbox()) {
    // Existing controlled bindings own their checked state through the icon.
    const bool checked=skinStyle=="checkbox"?active:icon!="checkboxUnchecked";
    const bool over=checkboxPointerInside_.value_or(hasMouse());
    skin_.drawCheckbox(g,rc,checked,over,isSelected() && (!hasCapture() || over),isEnabled());
    g.saveClip();g.clipRect({rc.x+15,rc.y,std::max(0,rc.w-15),rc.h});
    const auto ink=font_.inkBounds(caption);
    font_.draw(g,caption,rc.x+15-ink.x,rc.y+(rc.h-ink.h)/2-ink.y,skin_[isEnabled()?"text":"muted"]);
    g.restoreClip();return;
  }
  if(skinStyle=="switch") {
    const int opacity=isEnabled()?255:166;
    skin_.draw(g,isEnabled() && contentPointerInside_?"switch.container.hover":"switch.container",rc,false,opacity);
    const auto toggle=uiLogical(switchToggleBounds().offset(-bounds().origin()));
    const bool over=isEnabled() && switchPointerInside_;
    skin_.draw(g,std::string(active?"switch.on.":"switch.off.")+(over?"hover":"normal"),toggle,false,opacity);
    auto text=gfx::Rect(rc.x+4,rc.y+2,std::max(0,toggle.x-uiGap-(rc.x+4)),std::max(0,rc.h-4));
    g.saveClip();g.clipRect(text);
    if(iconSkin && !icon.empty()){
      const auto part=iconSkin->assets.patches.find(icon);const int iw=part==iconSkin->assets.patches.end()?11:part->second.bitmap->width;
      drawCaptionIcon(g,*iconSkin,icon,{text.x,rc.y,iw,rc.h},opacity);text.x+=iw+uiGap;text.w=std::max(0,text.w-iw-uiGap);
    }
    g.clipRect(text);const auto ink=font_.inkBounds(caption);
    font_.draw(g,caption,text.x-ink.x,rc.y+(rc.h-ink.h)/2-ink.y,skin_[isEnabled()?"text":"muted"]);
    g.restoreClip();return;
  }
  if(skinStyle=="menu-row") {
    g.fillRect(skin_["background"],rc);skin_.draw(g,"menu_item",rc);
    if(isEnabled() && (active || hasMouse() || isSelected())) {
      if(!skin_.draw(g,"menu_item_hover",rc))g.fillRect(skin_["panel"],rc);
    }
    const auto inset=menuRowInsets();
    const gfx::Rect content(rc.x+inset.left(),rc.y+inset.top(),rc.w-inset.width(),rc.h-inset.height());
    const auto ink=font_.inkBounds(caption);
    font_.draw(g,caption,content.x-ink.x,content.y+(content.h-ink.h)/2-ink.y,skin_[isEnabled()?"text":"muted"]);
    return;
  }
  const int contentOpacity=isEnabled() && !isSelected() && !active && !hasMouse()?128:255;
  auto contentColor=[&](gfx::Color color){return gfx::rgba(gfx::getr(color),gfx::getg(color),gfx::getb(color),gfx::geta(color)*contentOpacity/255);};
  if(columnHeaderAction){
    const char* state=!isEnabled()?"disabled":isSelected()&&contentPointerInside_?"pressed":active?"selected":contentPointerInside_?"hover":"normal";
    if(!skin_.draw(g,std::string("icon_button.")+state,rc))skin_.draw(g,"icon_button.normal",rc);
    if(iconSkin)iconSkin->draw(g,icon+(isEnabled()?"":"-disabled"),{rc.x+2,rc.y+2,11,11},true,contentOpacity);
    return;
  }
  if(iconGroupCount>0 && caption.empty()) {
    // Preserve each button's complete material. Layout overlaps the outermost
    // one-pixel edges so neighbours share exactly one outline.
    const char* state=!isEnabled()?"disabled":isSelected() && contentPointerInside_?"pressed":contentPointerInside_?"hover":"normal";
    g.saveClip();g.clipRect(rc);g.fillRect(skin_["panel"],rc);
    if(!skin_.draw(g,std::string("icon_button.")+state,rc))skin_.draw(g,"icon_button.normal",rc);
    if(iconSkin)iconSkin->draw(g,icon+(isEnabled()?"":"-disabled"),gfx::Rect(rc.x+(rc.w-11)/2,rc.y+(rc.h-11)/2,11,11),true,contentOpacity);
    g.restoreClip();return;
  }
  if(tabAdd || bareTabIcon) {
    g.fillRect(skin_["panel"],rc);
    if(tabAdd)skin_.draw(g,"project_tab.inactive",rc);
    if(isEnabled() && (hasMouse() || isSelected()))g.fillRect(skin_["border"],gfx::Rect(rc.x+1,rc.y+1,rc.w-2,rc.h-2));
    if(iconSkin){const auto name=icon+(isEnabled()?"":"-disabled");const auto it=iconSkin->assets.patches.find(name);
      if(it!=iconSkin->assets.patches.end()){const auto& bitmap=*it->second.bitmap;iconSkin->draw(g,name,gfx::Rect(rc.x+(rc.w-bitmap.width)/2,rc.y+(rc.h-bitmap.height)/2,bitmap.width,bitmap.height),true,contentOpacity);}}
    return;
}
  if(labelOnly) {if(!transparentLabel)g.fillRect(skin_["panel"],rc);font_.draw(g,caption,rc.x,rc.y+(rc.h-10)/2,skin_["text"]);return;}
  if(bareIconWithCaption && iconSkin) {
    g.fillRect(skin_["panel"],rc);
    drawCaptionIcon(g,*iconSkin,icon+(!isEnabled()?"-disabled":""),{rc.x,rc.y,11,rc.h},contentOpacity);
    const auto ink=font_.inkBounds(caption);
    font_.draw(g,caption,rc.x+11+uiGap-ink.x,rc.y+(rc.h-ink.h)/2-ink.y,contentColor(skin_[isEnabled()?"text":"muted"]));
    return;
  }
  if(colorRole || recentColorSwatch) {
    // legacy filled-color-trigger: checker -> real RGBA -> translucent material.
    // Do not flatten the skin onto a solid panel or replace alpha with a mask.
    auto asColor=[](std::uint32_t rgba) {return gfx::rgba(rgba&255,(rgba>>8)&255,(rgba>>16)&255,rgba>>24);};
    auto checker=[&](const char* token,std::uint32_t fallback) {
      const auto it=skin_.assets.colors.find(token);return asColor(it==skin_.assets.colors.end()?fallback:it->second);
    };
    // Legacy styles.css uses #808080 / #C0C0C0 for color-value transparency.
    const auto light=checker("roleCheckerLight",0xffc0c0c0),dark=checker("roleCheckerDark",0xff808080);
    const int cell=recentColorSwatch?4:std::max(1,(rc.h-2)/2);
    for(int y=rc.y;y<rc.y2();y+=cell) for(int x=rc.x;x<rc.x2();x+=cell)
      g.fillRect(((x-rc.x)/cell+(y-rc.y)/cell)%2?light:dark,gfx::Rect(x,y,std::min(cell,rc.x2()-x),std::min(cell,rc.y2()-y)));
    g.fillRect(asColor(swatch),rc);
    if(recentColorSwatch) {
      // Fill integer-aligned strips inside the 12x12 bounds. Skia's centered
      // stroke shifts edges under the native 2x transform.
      const auto black=gfx::rgba(0,0,0);
      g.fillRect(black,gfx::Rect(rc.x,rc.y,rc.w,1));
      g.fillRect(black,gfx::Rect(rc.x,rc.y2()-1,rc.w,1));
      if(!(swatchOpenEdges&1))g.fillRect(black,gfx::Rect(rc.x,rc.y,1,rc.h));
      if(!(swatchOpenEdges&2))g.fillRect(black,gfx::Rect(rc.x2()-1,rc.y,1,rc.h));return;
    }
    const char* state=!isEnabled()?"disabled":isSelected()?"pressed":active?"selected":hasMouse()?"hover":hasFocus()?"focus":"normal";
    const auto slot=std::string("role_button.")+state;
    auto material=skin_.assets.patches.find(slot);
    if(material==skin_.assets.patches.end()) material=skin_.assets.patches.find("role_button.normal");
    gfx::Rect content(rc.x+2,rc.y+2,std::max(0,rc.w-4),std::max(0,rc.h-5));
    if(material!=skin_.assets.patches.end()) {
      skin_.draw(g,material->first,rc);
      const auto& patch=material->second;
      content=gfx::Rect(rc.x+patch.left,rc.y+patch.top,std::max(0,rc.w-patch.left-patch.right),std::max(0,rc.h-patch.top-patch.bottom));
    }
    const auto text=displayColorRoleHex(swatch);const auto ink=font_.inkBounds(text);
    g.saveClip();g.clipRect(content);
    font_.draw(g,text,content.x+(content.w-ink.w)/2-ink.x,content.y+(content.h-ink.h)/2-ink.y,asColor(colorRoleTextColor(swatch)));
    g.restoreClip();return;
  }
  if(paletteCell) {
    const auto selectionBounds=rc;
    if(active && !paletteSharedSelection) {g.fillRect(gfx::rgba(0,0,0),rc);rc.shrink(2);}
    // Connected cells overlap their one-base-pixel black borders.
    for(int y=rc.y;y<rc.y2();y+=4) for(int x=rc.x;x<rc.x2();x+=4)
      g.fillRect(skin_[((x-rc.x)/4+(y-rc.y)/4)%2?"checkerA":"checkerB"],gfx::Rect(x,y,std::min(4,rc.x2()-x),std::min(4,rc.y2()-y)));
    g.fillRect(gfx::rgba(swatch&255,(swatch>>8)&255,(swatch>>16)&255,swatch>>24),rc);
    const auto black=gfx::rgba(0,0,0);
    g.fillRect(black,gfx::Rect(rc.x,rc.y,rc.w,1));
    g.fillRect(black,gfx::Rect(rc.x,rc.y2()-1,rc.w,1));
    g.fillRect(black,gfx::Rect(rc.x,rc.y,1,rc.h));
    g.fillRect(black,gfx::Rect(rc.x2()-1,rc.y,1,rc.h));
    const auto tone=colorRoleTextColor(swatch)==0xffffffff?"white":"black";
    const char* sizes[]{"small","medium","large"};const int markerSize=std::clamp(paletteMarkerSize,0,2);
    auto marker=[&](const char* role,bool foreground) {
      const auto slot=std::string("role-marker.")+role+"."+sizes[markerSize]+"."+tone;
      const auto found=skin_.assets.patches.find(slot);if(found==skin_.assets.patches.end()) return;
      const auto& bitmap=*found->second.bitmap;
      const int x=foreground?rc.x+1:rc.x2()-1-bitmap.width,y=foreground?rc.y+1:rc.y2()-1-bitmap.height;
      g.saveClip();g.clipRect(gfx::Rect(rc.x+1,rc.y+1,rc.w-2,rc.h-2));
      skin_.draw(g,slot,gfx::Rect(x,y,bitmap.width,bitmap.height),true);g.restoreClip();
    };
    if(foregroundMarker) marker("foreground",true);
    if(backgroundMarker) marker("background",false);
    // Legacy name overlay is pointer-transparent, centered, single-line and clipped.
    // Native user specification fixes Fusion Pixel10px; no CSS blur text shadow.
    if(!paletteDisplayName.empty()){auto content=rc;content.shrink(1);if(!content.isEmpty()){const auto ink=font_.inkBounds(paletteDisplayName);const auto color=paletteNameTextColor(swatch);g.saveClip();g.clipRect(content);font_.draw(g,paletteDisplayName,content.x+(content.w-ink.w)/2-ink.x,content.y+(content.h-ink.h)/2-ink.y,gfx::rgba(color&255,(color>>8)&255,(color>>16)&255));g.restoreClip();}}
    if(active && !paletteSharedSelection) skin_.drawSelection(g,selectionBounds,paletteSelectionHover?paletteSelectionHover():hasMouse());
    return;
  }
  if(tab) {
    // Both states share the bottom and caption baseline. Inactive tabs sit
    // below the panel frame in paint order, with a two-pixel lower top edge.
    // A label can repaint alone on mouse enter/leave, without repainting the
    // opaque sibling above it. Clip the shared rim in that path as well.
    g.saveClip();if(!active)g.clipRect(gfx::Rect(rc.x,rc.y,rc.w,rc.h-3));
    g.fillRect(skin_["panel"],rc);
    auto material=rc;if(!active){material.y+=2;material.h-=2;}
    if(!(active?skin_.drawPanelTab(g,rc,firstTab):skin_.draw(g,"panel_tab_inactive",material))) {
      g.drawRect(skin_["border"],rc);
    }
    font_.draw(g,caption,rc.x+(rc.w-font_.measure(caption))/2,rc.y+4,skin_[isEnabled()?"text":"muted"]);
    g.restoreClip();
    return;
  }
  const bool selected=active || isSelected();
  const auto state=!isEnabled()?"disabled":isSelected()?"pressed":active?"selected":hasMouse()?"hover":hasFocus()?"focus":"normal";
  const bool iconOnly=!icon.empty() && caption.empty();
  const auto family=!skinStyle.empty()?skinStyle:iconOnly && skin_.assets.patches.count("icon_button.normal")?std::string("icon_button"):
    (!caption.empty() && icon.empty() && skin_.assets.patches.count("text_button.normal")?"text_button":"button");
  const auto slot=family+"."+state;
  const auto iconArea=iconContentBounds(state);
  if(iconOnly) {
    g.fillRect(skin_["panel"],rc);
    auto it=skin_.assets.patches.find(slot);if(it==skin_.assets.patches.end()) it=skin_.assets.patches.find(family+".normal");
    if(it!=skin_.assets.patches.end()) {const auto& patch=it->second;
      rc=gfx::Rect(iconArea.x-patch.left,iconArea.y-patch.top,iconArea.w+patch.left+patch.right,iconArea.h+patch.top+patch.bottom);}
  }
  if(skin_.assets.patches.count(slot) || skin_.assets.patches.count(family+".normal")) {
    g.fillRect(skin_["panel"],rc);
    if(!skin_.draw(g,slot,rc)) skin_.draw(g,family+".normal",rc);
  } else {
    g.fillRect(skin_[selected?"accent":"button"],rc);
    g.drawRect(skin_[hasFocus()||hasMouse()?"accent":"border"],rc);
  }
  if(iconWithCaption && iconSkin) {
    drawCaptionIcon(g,*iconSkin,icon+(!isEnabled()?"-disabled":""),{rc.x+3+uiGap,rc.y,11,rc.h},contentOpacity);
    const auto ink=font_.inkBounds(caption);
    font_.draw(g,caption,rc.x+3+uiGap+11+uiGap-ink.x,rc.y+(rc.h-ink.h)/2-ink.y,contentColor(skin_[isEnabled()?"text":"muted"]));return;
  }
  if(swatch) g.fillRect(gfx::rgba(swatch&255,(swatch>>8)&255,(swatch>>16)&255),gfx::Rect(rc.x+3,rc.y+3,rc.w-6,rc.h-6));
  else if(icon.empty() || !(iconSkin?*iconSkin:skin_).draw(g,icon+((iconSkin && (!isEnabled() || mutedIcon))?"-disabled":""),iconOnly?iconArea:rc,true,contentOpacity)) {
    auto style=skin_.assets.text.find(slot);
    if(style==skin_.assets.text.end()) style=skin_.assets.text.find(family+".normal");
    const int dx=style==skin_.assets.text.end()?0:style->second.x,dy=style==skin_.assets.text.end()?0:style->second.y;
    const auto color=skin_[!isEnabled()?"muted":style==skin_.assets.text.end()?"text":style->second.color.c_str()];
    font_.draw(g,caption,rc.x+(rc.w-font_.measure(caption))/2+dx,rc.y+(rc.h-10)/2+dy,contentColor(color));
  }
}
PixelDropdown::PixelDropdown(const PixelFont& font,const Skin& skin)
  :PixelButton(font,skin,U"",[this]{showOptions();}),dropdownFont_(font),dropdownSkin_(skin) {setTransparent(true);}
void PixelDropdown::onResize(ui::ResizeEvent& ev) {
  auto rect=ev.bounds();rect.h=textControlHeight*uiScale;
  setBoundsQuietly(rect);
}
void PixelDropdown::setOptions(std::vector<std::u32string> options) {
  options_=std::move(options);setSelectedIndex(options_.empty()?-1:std::max(0,std::min(selectedIndex_,int(options_.size())-1)));
}
void PixelDropdown::setSelectedIndex(int index,bool notify) {
  if(notify && optionEnabled && !optionEnabled(index))return;
  const int next=options_.empty()?-1:std::clamp(index,0,int(options_.size())-1);
  const bool different=next!=selectedIndex_;selectedIndex_=next;
  const auto text=next<0?U"":options_[next];const bool textChanged=caption!=text;caption=text;if(different || textChanged)invalidate();
  if(different && notify && changed)changed(next);
}
void PixelDropdown::showOptions() {
  if(!isEnabled() || open_)return;
  if(prepareOptions)prepareOptions();
  if(options_.empty())return;
  PixelMenu menu(dropdownSkin_);
  for(int i=0;i<int(options_.size());++i){
    if(auto group=optionGroups.find(i);group!=optionGroups.end()){if(i)menu.addChild(new PixelMenuSeparator(dropdownSkin_));auto heading=new PixelMenuItem(dropdownFont_,dropdownSkin_,group->second);heading->setEnabled(false);menu.addChild(heading);}
    auto item=new PixelMenuItem(dropdownFont_,dropdownSkin_,options_[i]);
    item->setEnabled(!optionEnabled || optionEnabled(i));item->Click.connect([this,i]{setSelectedIndex(i,true);});menu.addChild(item);
  }
  menu.setMinSize(gfx::Size(bounds().w,0));
  open_=true;invalidate();if(popupStateChanged)popupStateChanged(true);
  try{menu.showPopup({bounds().x,bounds().y2()+2*uiScale},display());}
  catch(...){open_=false;invalidate();if(popupStateChanged)popupStateChanged(false);throw;}
  open_=false;if(popupStateChanged)popupStateChanged(false);requestFocus();invalidate();
}
bool PixelDropdown::onProcessMessage(ui::Message* msg) {
  if(paletteViewport && !hasCapture() && msg->type()==ui::kMouseDownMessage && !paletteViewport().contains(static_cast<ui::MouseMessage*>(msg)->position()))return false;
  if(isEnabled() && msg->type()==ui::kKeyDownMessage){
    if(prepareOptions)prepareOptions();
    const auto key=static_cast<ui::KeyMessage*>(msg)->scancode();
    if(key==ui::kKeyDown || key==ui::kKeyUp){if(!options_.empty())setSelectedIndex((std::max(0,selectedIndex_)+(key==ui::kKeyDown?1:int(options_.size())-1))%int(options_.size()),true);return true;}
  }
  return PixelButton::onProcessMessage(msg);
}
void PixelDropdown::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();PhysicalViewportClip viewportClip(g,paletteViewport?std::optional<gfx::Rect>(paletteViewport().offset(-bounds().origin())):std::nullopt);UiPaintScale scale(g);const auto r=uiLogical(clientBounds());
  const int arrowWidth=15;const auto field=r;
  drawInputFrame(g,dropdownSkin_,uiPhysical(field),isEnabled() && contentPointerInside());
  // One entry frame owns the whole control; the arrow is only an inset glyph.
  dropdownSkin_.draw(g,"dropdown.arrow",gfx::Rect(r.x2()-3-5,r.y+(r.h-3)/2,5,3),true,isEnabled()?255:115);
  const auto ink=dropdownFont_.inkBounds(caption);
  g.saveClip();g.clipRect(gfx::Rect(field.x+3,field.y+2,std::max(0,field.w-arrowWidth-3),std::max(0,field.h-4)));
  dropdownFont_.draw(g,caption,field.x+3-ink.x,field.y+(field.h-ink.h)/2-ink.y,dropdownSkin_[isEnabled()?"text":"muted"]);g.restoreClip();
}

}
