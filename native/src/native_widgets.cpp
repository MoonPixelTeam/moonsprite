#include <codecvt>
#include <locale>
#include <sstream>
#include <cmath>
#include "native_widgets.h"
#include "color_value_ui.h"
#include "ui_scale.h"
#include "ui/message.h"
#include "os/sampling.h"
#include "include/core/SkShader.h"
#include "include/core/SkTileMode.h"
#include "include/core/SkColor.h"
#include <algorithm>
#include <fstream>
#include <stdexcept>

namespace moon {
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
namespace {
class PhysicalViewportClip {
  ui::Graphics& g_;
public:
  PhysicalViewportClip(ui::Graphics& g,std::optional<gfx::Rect> clip):g_(g){g_.saveClip();if(clip)g_.clipRect(*clip);}
  ~PhysicalViewportClip(){g_.restoreClip();}
};
}
PixelScrollBar::PixelScrollBar(const Skin& skin,bool vertical)
  :ui::ScrollBar(vertical?ui::VERTICAL:ui::HORIZONTAL,this),skin_(skin),vertical_(vertical) {
  setBorder(gfx::Border(0));setBarWidth(7*uiScale);setVisible(false);
}
void PixelScrollBar::configure(int total,int page,int value) {
  total_=std::max(0,total);page_=std::max(1,page);value_=std::clamp(value,0,std::max(0,total_-page_));
  setSize(total_);setPos(value_);
}
void PixelScrollBar::setDockBounds(gfx::Rect track) {
  // Layout reserves six pixels: the seventh shares the content's outer edge.
  // Do not add another black strip or inset the thumb inside the track.
  setBounds(track);
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
  {UiPaintScale scale(g);skin_.draw(g,prefix+"track",uiLogical(clientBounds()));}
  const auto thumb=thumbBounds().offset(-bounds().origin());
  UiPaintScale scale(g,thumb.origin());
  skin_.draw(g,prefix+(thumbHover_ || hasCapture()?"hover":"normal"),uiLogical(gfx::Rect(0,0,thumb.w,thumb.h)));
}
bool PixelScrollBar::onProcessMessage(ui::Message* msg) {
  if(!isEnabled()){if(hasCapture())releaseMouse();return ui::Widget::onProcessMessage(msg);}
  if(msg->type()==ui::kMouseDownMessage && !static_cast<ui::MouseMessage*>(msg)->left())return false;
  if(msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseLeaveMessage){
    const bool hover=msg->type()!=ui::kMouseLeaveMessage && thumbBounds().contains(static_cast<ui::MouseMessage*>(msg)->position());
    if(hover!=thumbHover_){thumbHover_=hover;invalidate();}
  }
  if(msg->type()==ui::kMouseWheelMessage){const int dy=static_cast<ui::MouseMessage*>(msg)->wheelDelta().y;
    if(dy)setViewScroll({value_+(dy<0?wheelStep:-wheelStep),value_+(dy<0?wheelStep:-wheelStep)});return true;}
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
  try{const double value=sum();space();if(at!=source.size() || !std::isfinite(value))return false;std::ostringstream out;out.precision(12);out<<value;setText(out.str());Change();return true;}catch(...){return false;}
}
void PixelEntry::adjustNumber(int delta) {
  if(!isEnabled() || isReadOnly() || !delta)return;
  if(wheel){wheel(delta);return;}
  if(!numeric)return;
  try{std::size_t used=0;const double value=text().empty()?0:std::stod(text(),&used);
    if(used!=text().size() || !std::isfinite(value))return;
    std::ostringstream out;out.precision(12);out<<value+delta*numericStep;
    setText(out.str());Change();invalidate();
  }catch(...){ }
}
// The shared selection material includes its outer pixels in the control's
// bounds. Reserve them even while unfocused so focus never shifts text/layout.
static gfx::Rect inputBorderBounds(gfx::Rect physical) {physical.shrink(2*uiScale);return physical;}
static void drawInputFrame(ui::Graphics& g,const Skin& skin,gfx::Rect physical,bool selected,bool hover=false) {
  const auto border=inputBorderBounds(physical);
  skin.draw(g,"entry.normal",uiLogical(border));
  if(selected)skin.drawSelectionBorder(g,border,hover);
}
bool PixelEntry::onProcessMessage(ui::Message* msg) {
  if(paletteViewport && !hasCapture() && msg->type()==ui::kMouseDownMessage && !paletteViewport().contains(static_cast<ui::MouseMessage*>(msg)->position()))return false;
  if(msg->type()==ui::kMouseDownMessage && isEnabled() && !isReadOnly() && focus){
    const auto mouse=static_cast<ui::MouseMessage*>(msg);
    const int suffixWidth=(font_.measure(suffix)+4)*uiScale;
    const bool scrub=(numeric || wheel) && (mouse->position().x<bounds().x+4*uiScale || (!suffix.empty() && mouse->position().x>=bounds().x2()-suffixWidth));
    // A focused field receives no second FocusEnter; scrubbing bypasses Entry's
    // focus handling entirely. Both clicks must still reopen the legacy flyout.
    if(mouse->left() && (hasFocus() || scrub))focus();
  }
  if(msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseLeaveMessage || msg->type()==ui::kFocusEnterMessage || msg->type()==ui::kFocusLeaveMessage) {
    bool next=false;
    if(hasFocus() && (msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage))next=skin_.selectionContains(skin_.selectionMaterialBounds(inputBorderBounds(bounds())),static_cast<ui::MouseMessage*>(msg)->position());
    if(next!=selectionHover_){selectionHover_=next;invalidate();}
    if(msg->type()==ui::kFocusEnterMessage || msg->type()==ui::kFocusLeaveMessage)invalidate();
  }
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
    if(key->scancode()==ui::kKeyEnter && accept) {commitExpression();accept();return true;}
    if(key->scancode()==ui::kKeyEsc && cancel) {cancel();return true;}
  }
  const bool handled=ui::Entry::onProcessMessage(msg);
  if(msg->type()==ui::kFocusLeaveMessage && blur) {commitExpression();blur();}return handled;
}
void PixelEntry::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();PhysicalViewportClip viewportClip(g,paletteViewport?std::optional<gfx::Rect>(paletteViewport().offset(-bounds().origin())):std::nullopt);UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());
  drawInputFrame(g,skin_,uiPhysical(rc),hasFocus(),selectionHover_);
  int scroll=0,caret=0,state=0;Range selection;getEntryThemeInfo(&scroll,&caret,&state,&selection);
  const auto value=unicodeText(text());const int start=std::clamp(scroll,0,int(value.size()));
  int x=rc.x+2+uiGap;const int y=rc.y+(rc.h-10)/2;
  const int suffixWidth=font_.measure(suffix);
  g.saveClip();g.clipRect(gfx::Rect(rc.x+2+uiGap,y,std::max(0,rc.w-2*(2+uiGap)-(suffix.empty()?0:suffixWidth+uiGap)),10));
  for(int i=start;i<int(value.size());++i) {
    const auto glyph=value.substr(i,1);const int width=font_.measure(glyph);
    if(!selection.isEmpty() && i>=selection.from && i<selection.to) g.fillRect(skin_["accent"],gfx::Rect(x,y,width,10));
    font_.draw(g,glyph,x,y,skin_[isEnabled()?"text":"muted"]);if(hasFocus() && state && i==caret) g.fillRect(skin_["text"],gfx::Rect(x,y,1,10));x+=width;
  }
  if(hasFocus() && state && caret==int(value.size())) g.fillRect(skin_["text"],gfx::Rect(x,y,1,10));
  g.restoreClip();
  if(!suffix.empty()) font_.draw(g,suffix,std::min(x+uiGap,rc.x2()-2-uiGap-suffixWidth),y,skin_["muted"]);
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
    if((hasFocus() || active_) && (msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage))hover=skin_.selectionContains(skin_.selectionMaterialBounds(inputBorderBounds(bounds())),static_cast<ui::MouseMessage*>(msg)->position());
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
      const auto rc=bounds();const int left=rc.x+3*uiScale,width=std::max(1,rc.w-6*uiScale-1);
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
void PixelSlider::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());
  // Widget transparency repaints the underlying UI through the skin's clear margins.
  const char* slot="slider.normal";
  skin_.draw(g,slot,gfx::Rect(rc.x,rc.y,rc.w,std::max(1,rc.h-2)));
  const int width=std::max(0,rc.w-6),height=std::max(0,rc.h-7);
  const double progress=maximum>minimum?std::clamp(double(value-minimum)/(maximum-minimum),0.0,1.0):0;
  const int fill=int(std::floor(width*progress+0.5));
  if(fill>0 && height>0) {g.saveClip();g.clipRect(gfx::Rect(rc.x+3,rc.y+3,fill,height));skin_.draw(g,"slider.fill",gfx::Rect(rc.x+3,rc.y+3,std::max(3,fill),height));g.restoreClip();}
  if(hasFocus() || active_)skin_.drawSelectionBorder(g,inputBorderBounds(uiPhysical(rc)),selectionHover_);
  const auto style=skin_.assets.text.find(slot);
  const auto color=skin_[!isEnabled()?"muted":style==skin_.assets.text.end()?"text":style->second.color.c_str()];
  auto label=unicodeText(std::to_string(value))+(percentage?U"%":U"px");font_.draw(g,label,rc.x+(rc.w-font_.measure(label))/2,rc.y+(rc.h-10)/2,color);
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
bool PixelButton::onProcessMessage(ui::Message* msg) {
  if(paletteViewport && !hasCapture() && msg->type()==ui::kMouseDownMessage && !paletteViewport().contains(static_cast<ui::MouseMessage*>(msg)->position()))return false;
  if(timelinePress && isEnabled() && msg->type()==ui::kMouseDownMessage){const auto& mouse=*static_cast<ui::MouseMessage*>(msg);if(mouse.left() || mouse.right()){timelinePress(mouse);return true;}}
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
  if(timelineRepaint && (msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseLeaveMessage)) timelineRepaint();
  if(open) openGroup();
  return handled;
}
gfx::Rect PixelButton::paletteColorBounds() const {
  auto rc=bounds();
  if(paletteCell && !recentColorSwatch && active && !paletteSharedSelection) rc.shrink(2*uiScale);
  return rc;
}
bool PixelButton::paletteSelectionContains(gfx::Point position) const {
  if(!paletteCell || recentColorSwatch || paletteSharedSelection || !active || !bounds().contains(position)) return false;
  return skin_.selectionContains(bounds(),position);
}
gfx::Rect PixelButton::iconContentBounds(const std::string& state) const {
  auto rc=uiLogical(clientBounds());
  // All states reserve the same content rectangle, including asymmetric shadow.
  const auto family=skin_.assets.patches.count("icon_button.normal")?"icon_button.":"button.";
  int left=0,right=0,top=0,bottom=0;
  for(const auto suffix:{"normal","hover","pressed","selected","focus","disabled"}) {
    auto it=skin_.assets.patches.find(std::string(family)+suffix);
    if(it!=skin_.assets.patches.end()) {left=std::max(left,it->second.left);right=std::max(right,it->second.right);top=std::max(top,it->second.top);bottom=std::max(bottom,it->second.bottom);}
  }
  const int size=std::max(0,std::min(rc.w-left-right,rc.h-top-bottom));
  return gfx::Rect(rc.x+(rc.w-size-left-right)/2+left,rc.y+(rc.h-size-top-bottom)/2+top,size,size);
}
void PixelButton::paintTimelineContent(ui::Graphics& g,gfx::Rect rc,gfx::Point physicalOffset) {
  UiPaintScale scale(g,physicalOffset);
    const bool row=skinStyle=="timeline-row";const bool material=skin_.draw(g,row?"timeline.row":"timeline.button",rc);if(!material)g.fillRect(skin_[row?"timelineBackground":"panel"],rc);
    // Timeline states tint only the cell interior; grid and glyphs stay intact.
    if(row && (active || timelineBackgroundHover))skin_.draw(g,timelineBackgroundHover?"timeline.hover":"timeline.active",gfx::Rect(rc.x+1,rc.y+1,rc.w-1,rc.h-1));
    if(!row && !material){g.drawRect(skin_["timelineGrid"],rc);g.drawRect(skin_["timelineEdge"],gfx::Rect(rc.x+1,rc.y+1,rc.w-2,rc.h-2));}
    if(iconSkin && !icon.empty())iconSkin->draw(g,icon+(isEnabled()?"":"-disabled"),gfx::Rect(rc.x+1+(rc.w-12)/2,rc.y+1+(rc.h-12)/2,11,11),true);
    if(timelineCel)skin_.draw(g,"timeline.dot",gfx::Rect(rc.x+3,rc.y+3,7,7),true);
    if(active && !row)g.drawRect(skin_["accent"],gfx::Rect(rc.x+1,rc.y+1,rc.w-2,rc.h-2));
    if(row){if(!skin_.draw(g,"timeline.line",gfx::Rect(rc.x,rc.y,rc.w,1)))g.fillRect(skin_["timelineGrid"],gfx::Rect(rc.x,rc.y,rc.w,1));if(!skin_.draw(g,"timeline.line",gfx::Rect(rc.x,rc.y,1,rc.h)))g.fillRect(skin_["timelineGrid"],gfx::Rect(rc.x,rc.y,1,rc.h));}
    if(!caption.empty()){
      g.saveClip();g.clipRect(rc);
      const auto ink=font_.inkBounds(caption);
      const int x=centerCaption?rc.x+1+(rc.w-1-ink.w)/2-ink.x:rc.x+1+timelineCaptionPadding-(timelineCaptionPadding?ink.x:0);
      const int y=centerCaption?rc.y+1+(rc.h-1-ink.h)/2-ink.y:rc.y+(rc.h-10)/2;
      font_.draw(g,caption,x,y,skin_["timelineInk"]);g.restoreClip();
    }return;
  }
void PixelButton::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();
  PhysicalViewportClip viewportClip(g,paletteViewport?std::optional<gfx::Rect>(paletteViewport().offset(-bounds().origin())):std::nullopt);
  if(skinStyle=="timeline" || skinStyle=="timeline-row") {if(!timelineParentPainted)paintTimelineContent(g,uiLogical(clientBounds()));return;}
  UiPaintScale scale(g);auto rc=uiLogical(clientBounds());
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
  if(iconGroupCount>0) {
    // Preserve each button's complete material. Layout overlaps the outermost
    // one-pixel edges so neighbours share exactly one outline.
    const char* state=!isEnabled()?"disabled":isSelected()?"pressed":active?"selected":hasMouse()?"hover":hasFocus()?"focus":"normal";
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
  if(labelOnly) {g.fillRect(skin_["panel"],rc);font_.draw(g,caption,rc.x,rc.y+(rc.h-10)/2,skin_["text"]);return;}
  if(bareIconWithCaption && iconSkin) {
    g.fillRect(skin_["panel"],rc);
    iconSkin->draw(g,icon+(!isEnabled()?"-disabled":""),gfx::Rect(rc.x,rc.y+(rc.h-11)/2,11,11),true,contentOpacity);
    font_.draw(g,caption,rc.x+11+uiGap,rc.y+(rc.h-10)/2,contentColor(skin_[isEnabled()?"text":"muted"]));
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
      g.fillRect(black,gfx::Rect(rc.x,rc.y,1,rc.h));
      g.fillRect(black,gfx::Rect(rc.x2()-1,rc.y,1,rc.h));return;
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
    iconSkin->draw(g,icon+(!isEnabled()?"-disabled":""),gfx::Rect(rc.x+3+uiGap,rc.y+(rc.h-11)/2,11,11),true,contentOpacity);
    font_.draw(g,caption,rc.x+3+uiGap+11+uiGap,rc.y+(rc.h-10)/2,contentColor(skin_[isEnabled()?"text":"muted"]));return;
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
void PixelDropdown::setOptions(std::vector<std::u32string> options) {
  options_=std::move(options);setSelectedIndex(options_.empty()?-1:std::max(0,std::min(selectedIndex_,int(options_.size())-1)));
}
void PixelDropdown::setSelectedIndex(int index,bool notify) {
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
    auto item=new PixelMenuItem(dropdownFont_,dropdownSkin_,options_[i]);
    item->Click.connect([this,i]{setSelectedIndex(i,true);});menu.addChild(item);
  }
  menu.setMinSize(gfx::Size(bounds().w,0));
  open_=true;updateHover();invalidate();
  try{menu.showPopup({bounds().x,bounds().y2()+2*uiScale},display());}
  catch(...){open_=false;invalidate();throw;}
  open_=false;requestFocus();updateHover();invalidate();
}
gfx::Rect PixelDropdown::arrowBounds() const {
  const auto r=bounds();return {r.x2()-15*uiScale,r.y+(r.h-16*uiScale)/2,15*uiScale,16*uiScale};
}
void PixelDropdown::updateHover() {
  const bool arrow=isEnabled() && pointer_ && arrowBounds().contains(*pointer_);
  if(arrow!=arrowHover_){arrowHover_=arrow;invalidate();}
}
bool PixelDropdown::onProcessMessage(ui::Message* msg) {
  if(paletteViewport && !hasCapture() && msg->type()==ui::kMouseDownMessage && !paletteViewport().contains(static_cast<ui::MouseMessage*>(msg)->position()))return false;
  if(msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseUpMessage) {
    const auto mouse=static_cast<ui::MouseMessage*>(msg);
    pointer_=mouse->position();updateHover();
    if(msg->type()==ui::kMouseDownMessage && mouse->left()){arrowPressed_=isEnabled() && arrowHover_;invalidate();}
    if(msg->type()==ui::kMouseUpMessage){arrowPressed_=false;invalidate();}
  }
  if(msg->type()==ui::kMouseLeaveMessage){pointer_.reset();updateHover();}
  if(msg->type()==ui::kFocusEnterMessage || msg->type()==ui::kFocusLeaveMessage){if(msg->type()==ui::kFocusLeaveMessage)arrowPressed_=false;updateHover();invalidate();}
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
  drawInputFrame(g,dropdownSkin_,uiPhysical(field),false);
  const gfx::Rect arrow(r.x2()-arrowWidth,r.y+(r.h-16)/2,arrowWidth,16);
  const char* state=!isEnabled()?"disabled":arrowPressed_ && isSelected() && arrowHover_?"pressed":arrowHover_?"hover":"normal";
  {
    dropdownSkin_.draw(g,std::string("icon_button.")+state,arrow);
    dropdownSkin_.draw(g,"dropdown.arrow",gfx::Rect(arrow.x+(arrow.w-5)/2,arrow.y+(arrow.h-3)/2,5,3),true,isEnabled() && !arrowHover_ && !arrowPressed_?128:255);
  }
  const auto ink=dropdownFont_.inkBounds(caption);
  g.saveClip();g.clipRect(gfx::Rect(field.x+3,field.y+2,std::max(0,field.w-arrowWidth-3),std::max(0,field.h-4)));
  dropdownFont_.draw(g,caption,field.x+3-ink.x,field.y+(field.h-ink.h)/2-ink.y,dropdownSkin_[isEnabled()?"text":"muted"]);g.restoreClip();
}

}
