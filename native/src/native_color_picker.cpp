#include "native_color_picker.h"
#include "ui_scale.h"
#include "ui/message.h"
#include "os/skia/skia_surface.h"
#include <stdexcept>

namespace moon {
NativeColorPicker::NativeColorPicker(const PixelFont& font,const Skin& skin,const std::filesystem::path& markerDir)
  :ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),frameTimer_(16,this) {
  loadMarkers(markerDir);setFocusStop(true);frameTimer_.Tick.connect([this]{flush();});
}
NativeColorPicker::~NativeColorPicker() {frameTimer_.stop();}
void NativeColorPicker::loadMarkers(const std::filesystem::path& markerDir) {
  Skin next;
  next.assets.patches["light"]=skin_.assets.patches.count("icon.marker-light")?skin_.assets.patches.at("icon.marker-light"):importSkinPng(markerDir/"marker-light.png",32);
  next.assets.patches["dark"]=skin_.assets.patches.count("icon.marker-dark")?skin_.assets.patches.at("icon.marker-dark"):importSkinPng(markerDir/"marker-dark.png",32);
  const auto& light=*next.assets.patches.at("light").bitmap;
  const auto& dark=*next.assets.patches.at("dark").bitmap;
  if(light.width!=dark.width || light.height!=dark.height)
    throw std::runtime_error("Color picker marker variants must have matching dimensions");
  markerWidth_=light.width;markerHeight_=light.height;markerSkin_=std::move(next);invalidate();
}
gfx::Rect NativeColorPicker::fieldBounds() const {
  const auto rc=uiLogical(clientBounds());const auto box=pickerLayout(rc.w,rc.h,markerWidth_,markerHeight_).field;
  return {rc.x+box.x,rc.y+box.y,box.w,box.h};
}
gfx::Rect NativeColorPicker::stripBounds(int zone) const {
  const auto rc=uiLogical(clientBounds());const auto layout=pickerLayout(rc.w,rc.h,markerWidth_,markerHeight_);
  const auto box=zone==1?layout.hue:layout.alpha;return {rc.x+box.x,rc.y+box.y,box.w,box.h};
}
gfx::Rect NativeColorPicker::regionBounds(Region region) const {
  auto rc=uiPhysical(region==Region::Field?fieldBounds():stripBounds(int(region)));
  rc.offset(bounds().x,bounds().y);return rc;
}
void NativeColorPicker::syncColors(std::uint32_t primary,std::uint32_t secondary) {
  const std::uint32_t colors[]{primary,secondary};
  bool change=false;
  for(int i=0;i<2;++i) if(!(zone_ && role_==i) && roles_[i].color!=colors[i]) {roles_[i].sync(colors[i]);change=true;}
  if(change) invalidate();
}
void NativeColorPicker::queue() {
  pending_=true;if(!frameTimer_.isRunning()) frameTimer_.start();invalidate();
}
void NativeColorPicker::flush() {
  frameTimer_.stop();if(!pending_) return;
  pending_=false;if(changed) changed(roles_[role_].color,role_==1);
}
void NativeColorPicker::finishInteraction() {
  const bool active=zone_!=0;
  flush();zone_=0;if(hasCapture()) releaseMouse();
  if(active && interactionCommit) interactionCommit();invalidate();
}
void NativeColorPicker::sample(const ui::MouseMessage& mouse) {
  // Match legacy's raw field coordinates, independent of rounded RGB output.
  const auto local=mouse.position()-bounds().origin();
  const double x=double(local.x)/uiScale,y=double(local.y)/uiScale;
  auto& role=roles_[role_];
  if(zone_==3) {
    const auto field=fieldBounds();role.field(pickerCoordinate(x,field.x,field.w),pickerCoordinate(y,field.y,field.h));
  } else {
    const auto strip=stripBounds(zone_);
    // Joined strips have no independent thumb padding; sample the same span
    // that the gradient and value marker use, including both endpoint pixels.
    const double position=pickerCoordinate(x,strip.x,strip.w);
    if(zone_==1) role.hue(pickerShiftStep(position*359,359,false,mouse.shiftPressed()));
    else role.alpha(pickerShiftStep(position*100,100,true,mouse.shiftPressed())*2.55);
  }
  queue();
}
bool NativeColorPicker::onProcessMessage(ui::Message* msg) {
  if(msg->type()==ui::kFocusLeaveMessage) finishInteraction();
  if(!isEnabled()) {finishInteraction();return ui::Widget::onProcessMessage(msg);}
  if(msg->type()==ui::kMouseDownMessage) {
    const auto mouse=static_cast<ui::MouseMessage*>(msg);
    if(!mouse->left() && !mouse->right()) return false;
    const auto local=mouse->position()-bounds().origin();const gfx::Point point(local.x/uiScale,local.y/uiScale);
    int zone=fieldBounds().contains(point)?3:stripBounds(1).contains(point)?1:stripBounds(2).contains(point)?2:0;
    if(!zone) return false;
    finishInteraction();requestFocus();role_=mouse->right()?1:0;zone_=zone;focusedZone_=zone;
    captureMouse();if(interactionBegin) interactionBegin();sample(*mouse);return true;
  }
  if((msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage) && hasCapture()) {
    const auto mouse=static_cast<ui::MouseMessage*>(msg);
    if(msg->type()==ui::kMouseUpMessage && (role_==1?!mouse->right():!mouse->left())) return true;
    sample(*mouse);if(msg->type()==ui::kMouseUpMessage) finishInteraction();return true;
  }
  if(msg->type()==ui::kMouseWheelMessage) {
    const auto mouse=static_cast<ui::MouseMessage*>(msg);if(zone_) return true;
    const int delta=mouse->wheelDelta().y;if(!delta) return true;
    const auto local=mouse->position()-bounds().origin();const gfx::Point point(local.x/uiScale,local.y/uiScale);
    const int hit=stripBounds(2).contains(point)?2:stripBounds(1).contains(point)?1:3;
    if(interactionBegin) interactionBegin();
    const int stride=(hit!=3 && mouse->shiftPressed())?5:1;
    const int deltaValue=delta<0?stride:-stride;
    if(hit==2) roles_[role_].alpha(double(roles_[role_].color>>24)+deltaValue);
    else if(hit==1) roles_[role_].hue(std::clamp(std::floor(roles_[role_].hsv.h+0.5)+deltaValue,0.0,359.0));
    else roles_[role_].hue(roles_[role_].hsv.h+deltaValue);
    queue();flush();if(interactionCommit) interactionCommit();return true;
  }
  if(msg->type()==ui::kKeyDownMessage && !zone_) {
    const auto key=static_cast<ui::KeyMessage*>(msg);
    const bool alpha=focusedZone_==2;const int maximum=alpha?255:359;
    int next=alpha?int(roles_[role_].color>>24):int(std::floor(roles_[role_].hsv.h+0.5));
    switch(key->scancode()) {
      case ui::kKeyLeft:case ui::kKeyDown:--next;break;
      case ui::kKeyRight:case ui::kKeyUp:++next;break;
      case ui::kKeyHome:next=0;break;case ui::kKeyEnd:next=maximum;break;
      case ui::kKeyPageUp:next+=std::max(1,maximum/10);break;
      case ui::kKeyPageDown:next-=std::max(1,maximum/10);break;
      default:return ui::Widget::onProcessMessage(msg);
    }
    if(interactionBegin) interactionBegin();next=std::clamp(next,0,maximum);
    if(alpha) roles_[role_].alpha(next);else roles_[role_].hue(next);
    queue();flush();if(interactionCommit) interactionCommit();return true;
  }
  return ui::Widget::onProcessMessage(msg);
}
void NativeColorPicker::drawMarker(ui::Graphics& g,const gfx::Rect& area,double x,double y,const os::SurfaceRef& background) {
  if(!background) return;
  const auto box=pickerMarkerBox({area.x,area.y,area.w,area.h},x,y,markerWidth_,markerHeight_);
  if(!box.w || !box.h) return;
  // Read actual displayed pixels. In alpha this is the already composited
  // checkerboard, never raw source RGB or transparent black.
  const int sampleX=std::clamp(box.x-area.x+box.w/2,0,area.w-1);
  const int sampleY=std::clamp(box.y-area.y+box.h/2,0,area.h-1);
  const auto color=background->getPixel(sampleX,sampleY);
  const auto slot=pickerLightMarker(gfx::getr(color),gfx::getg(color),gfx::getb(color))?"light":"dark";
  markerSkin_.draw(g,slot,gfx::Rect(box.x,box.y,box.w,box.h),true);
}
void NativeColorPicker::smokeSurfacePixels() {
  const auto savedBounds=bounds();const auto savedRole=roles_[role_];
  for(const auto size:{gfx::Size(180,240),gfx::Size(180,400),gfx::Size(220,300)})
    for(const auto color:{0xff123456u,0x80563412u,0xff808080u}) {
      setBounds(gfx::Rect(0,0,size.w,size.h));roles_[role_].sync(color);
      auto surface=os::instance()->makeRgbaSurface(size.w,size.h);surface->clear();
      ui::Graphics graphics(surface);ui::PaintEvent ev(this,&graphics);onPaint(ev);
      const auto field=fieldBounds();const auto& role=roles_[role_];
      auto check=[&](const os::SurfaceRef& generated,int x,int y,std::uint32_t rgba) {
        const auto expected=gfx::rgba(rgba&255,(rgba>>8)&255,(rgba>>16)&255,255);
        if(generated->getPixel(x,y)!=expected)throw std::runtime_error("Picker raster differs from legacy pixel oracle");
      };
      for(int y=0;y<field.h;++y) for(int x=0;x<field.w;++x)
        check(field_,x,y,pickerHsvToRgb({role.hsv.h,double(x)/std::max(1,field.w-1),1-double(y)/std::max(1,field.h-1)}));
      for(int zone=1;zone<=2;++zone) {
        const auto inner=stripBounds(zone);
        for(int y=0;y<inner.h;++y) for(int x=0;x<inner.w;++x) {
          const double at=double(x)/std::max(1,inner.w-1);
          auto expected=pickerHsvToRgb({at*359,1,1});
          if(zone==2) {
            const auto background=((x/4+y/4)%2)?skin_["checkerA"]:skin_["checkerB"];
            const auto rgb=std::uint32_t(gfx::getr(background))|std::uint32_t(gfx::getg(background))<<8|std::uint32_t(gfx::getb(background))<<16;
            expected=pickerComposite(role.color,at,rgb);
          }
          check(zone==1?hueStrip_:alphaStrip_,x,y,expected);
        }
      }
    }
  roles_[role_]=savedRole;setBounds(savedBounds);
}
void NativeColorPicker::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());
  g.fillRect(skin_["background"],rc);const auto field=fieldBounds();const auto& role=roles_[role_];
  if(field.w==0 || field.h==0) return;
  // One outside panel frame belongs to the parent. These three colored regions
  // touch directly, and share the full available width without local borders.
  if(!field_ || fieldSize_!=field.w || fieldHeight_!=field.h || fieldHue_!=role.hsv.h) {
    field_=os::instance()->makeRgbaSurface(field.w,field.h);
    if(!field_) throw std::runtime_error("Cannot allocate color picker field");
    {os::SurfaceLock lock(field_.get());
      // The configured laf backend is Skia. Fill its raster bitmap directly,
      // avoiding one SkPixmap::erase/color-conversion call per opaque pixel.
      auto& pixels=static_cast<os::SkiaSurface*>(field_.get())->bitmap();
      for(int y=0;y<field.h;++y) for(int x=0;x<field.w;++x) {
        const auto color=pickerHsvToRgb({role.hsv.h,double(x)/std::max(1,field.w-1),1-double(y)/std::max(1,field.h-1)});
        *pixels.getAddr32(x,y)=SkColorSetARGB(255,color&255,(color>>8)&255,(color>>16)&255);
      }
    }
    field_->setImmutable();fieldSize_=field.w;fieldHeight_=field.h;fieldHue_=role.hsv.h;
  }
  g.drawRgbaSurface(field_.get(),field.x,field.y);
  drawMarker(g,field,role.hsv.s,1-role.hsv.v,field_);
  for(int zone=1;zone<=2;++zone) {
    const auto inner=stripBounds(zone);
    if(stripWidth_!=inner.w || stripHeight_!=inner.h) {hueStrip_.reset();alphaStrip_.reset();stripWidth_=inner.w;stripHeight_=inner.h;}
    const auto a=skin_["checkerA"],b=skin_["checkerB"];
    if(alphaRgb_!=(role.color&0xffffff) || checkerA_!=a || checkerB_!=b) {
      alphaStrip_.reset();alphaRgb_=role.color&0xffffff;checkerA_=a;checkerB_=b;
    }
    auto& surface=zone==1?hueStrip_:alphaStrip_;
    if(!surface) {
      surface=os::instance()->makeRgbaSurface(inner.w,inner.h);
      if(!surface) throw std::runtime_error("Cannot allocate color picker strip");
      {os::SurfaceLock lock(surface.get());
        auto& pixels=static_cast<os::SkiaSurface*>(surface.get())->bitmap();
        for(int x=0;x<inner.w;++x) {
          const double at=double(x)/std::max(1,inner.w-1);
          const auto color=zone==1?pickerHsvToRgb({at*359,1,1}):role.color;
          for(int y=0;y<inner.h;++y) {
            auto shown=color;
            if(zone==2) {
              const auto checker=((x/4+y/4)%2)?a:b;
              const auto checkerRgb=std::uint32_t(gfx::getr(checker))|(std::uint32_t(gfx::getg(checker))<<8)|(std::uint32_t(gfx::getb(checker))<<16);
              shown=pickerComposite(color,at,checkerRgb);
            }
            *pixels.getAddr32(x,y)=SkColorSetARGB(255,shown&255,(shown>>8)&255,(shown>>16)&255);
          }
        }
      }
      surface->setImmutable();
    }
    g.drawRgbaSurface(surface.get(),inner.x,inner.y);
    const double fraction=zone==1?role.hsv.h/359.0:double(role.color>>24)/255;
    drawMarker(g,inner,fraction,0.5,surface);
  }
}
}
