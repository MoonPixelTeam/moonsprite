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
void NativeColorPicker::setScheme(ColorPickerScheme scheme){if(scheme_==scheme)return;finishInteraction();scheme_=scheme;field_.reset();hueStrip_.reset();alphaStrip_.reset();fieldHue_=fieldValue_=stripHue_=stripSaturation_=-1;invalidate();}
void NativeColorPicker::setQuantization(PickerQuantization q){q=pickerNormalizeQuantization(q);if(q.hueSteps==quantization_.hueSteps&&q.colorSteps==quantization_.colorSteps)return;finishInteraction();const bool ringChange=q.hueSteps!=quantization_.hueSteps;quantization_=q;field_.reset();hueStrip_.reset();alphaStrip_.reset();if(ringChange)moonRing_.reset();invalidate();}
void NativeColorPicker::setMoonField(PickerMoonField field){if(moonField_==field)return;finishInteraction();moonField_=field;field_.reset();invalidate();}
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
  if(scheme_==ColorPickerScheme::Wheel||scheme_==ColorPickerScheme::MoonRing){const int side=std::min(box.w,box.h);return {rc.x+box.x+(box.w-side)/2,rc.y+box.y+(box.h-side)/2,side,side};}
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
  flush();zone_=0;moonGesture_.reset();if(hasCapture()) releaseMouse();
  if(active && interactionCommit) interactionCommit();invalidate();
}
void NativeColorPicker::sample(const ui::MouseMessage& mouse) {
  // Match legacy's raw field coordinates, independent of rounded RGB output.
  const auto local=mouse.position()-bounds().origin();
  const double x=double(local.x)/uiScale,y=double(local.y)/uiScale;
  auto& role=roles_[role_];
  if(zone_==3) {
    const auto field=fieldBounds();if(pickerQuantized(quantization_)){const double xx=(x-field.x)/std::max(1,field.w),yy=(y-field.y)/std::max(1,field.h);if(scheme_==ColorPickerScheme::MoonRing)pickerQuantMoonSample(moonGesture_,role,moonField_,xx,yy,quantization_);else{role.hsv=pickerQuantInput(scheme_,role.hsv,xx,yy,quantization_);role.emit();}}else if(scheme_==ColorPickerScheme::MoonRing)moonGesture_.sample(role,moonField_,pickerUnit((x-field.x)/std::max(1,field.w)),pickerUnit((y-field.y)/std::max(1,field.h)));else if(scheme_==ColorPickerScheme::Wheel||scheme_==ColorPickerScheme::NormalMap)pickerSchemeSetField(role,scheme_,(x-field.x)/std::max(1,field.w-1),(y-field.y)/std::max(1,field.h-1));else pickerSchemeSetField(role,scheme_,pickerCoordinate(x,field.x,field.w),pickerCoordinate(y,field.y,field.h));
  } else {
    const auto strip=stripBounds(zone_);
    // Joined strips have no independent thumb padding; sample the same span
    // that the gradient and value marker use, including both endpoint pixels.
    const double position=pickerCoordinate(x,strip.x,strip.w);
    if(zone_==1){if(pickerSchemeUsesValue(scheme_))pickerQuantSetStrip(role,scheme_,pickerShiftStep(position*100,100,true,mouse.shiftPressed())/100,quantization_);else role.hue(pickerQuantHue(pickerShiftStep(position*359,359,false,mouse.shiftPressed()),quantization_));}
    else role.alpha(pickerQuantColor(pickerShiftStep(position*100,100,true,mouse.shiftPressed())/100,quantization_)*255);
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
    if(zone==3&&scheme_==ColorPickerScheme::Wheel){auto field=fieldBounds();const double x=double(local.x)/uiScale,y=double(local.y)/uiScale;const bool quant=pickerQuantized(quantization_);const double xx=(x-field.x)/std::max(1,quant?field.w:field.w-1),yy=(y-field.y)/std::max(1,quant?field.h:field.h-1);if(quant?!pickerQuantWheelBeginHit(xx,yy,quantization_):!pickerWheelBeginHit(xx,yy))return false;}
    if(zone==3&&scheme_==ColorPickerScheme::NormalMap){auto field=fieldBounds();double x=double(local.x)/uiScale,y=double(local.y)/uiScale;if(!pickerNormalMapBeginHit((x-field.x)/std::max(1,pickerQuantized(quantization_)?field.w:field.w-1),(y-field.y)/std::max(1,pickerQuantized(quantization_)?field.h:field.h-1)))return false;}
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
    if(hit==2)pickerQuantSetAlphaValue(roles_[role_],pickerQuantAlphaValue(roles_[role_].color,quantization_)+deltaValue,quantization_);
    else if(hit==1){const int maximum=pickerSchemeStripMaximum(scheme_);const int next=std::clamp(pickerQuantStripValue(scheme_,roles_[role_].hsv,quantization_)+deltaValue,0,maximum);pickerQuantSetStripValue(roles_[role_],scheme_,next,quantization_);}
    else roles_[role_].hue(pickerQuantHue(roles_[role_].hsv.h+deltaValue*(quantization_.hueSteps>0?360./quantization_.hueSteps:1),quantization_));
    queue();flush();if(interactionCommit) interactionCommit();return true;
  }
  if(msg->type()==ui::kKeyDownMessage && !zone_) {
    const auto key=static_cast<ui::KeyMessage*>(msg);
    const bool alpha=focusedZone_==2;const int maximum=alpha?255:pickerSchemeStripMaximum(scheme_);
    int next=alpha?pickerQuantAlphaValue(roles_[role_].color,quantization_):pickerQuantStripValue(scheme_,roles_[role_].hsv,quantization_);
    switch(key->scancode()) {
      case ui::kKeyLeft:case ui::kKeyDown:--next;break;
      case ui::kKeyRight:case ui::kKeyUp:++next;break;
      case ui::kKeyHome:next=0;break;case ui::kKeyEnd:next=maximum;break;
      case ui::kKeyPageUp:next+=std::max(1,maximum/10);break;
      case ui::kKeyPageDown:next-=std::max(1,maximum/10);break;
      default:return ui::Widget::onProcessMessage(msg);
    }
    if(interactionBegin) interactionBegin();next=std::clamp(next,0,maximum);
    if(alpha)pickerQuantSetAlphaValue(roles_[role_],next,quantization_);else pickerQuantSetStripValue(roles_[role_],scheme_,next,quantization_);
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
  const auto savedBounds=bounds();const auto savedRole=roles_[role_];const auto savedScheme=scheme_;
  for(auto scheme:{ColorPickerScheme::SvSquare,ColorPickerScheme::HsSquare,ColorPickerScheme::Wheel,ColorPickerScheme::NormalMap}){setScheme(scheme);
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
        {const double xx=double(x)/std::max(1,field.w-1),yy=double(y)/std::max(1,field.h-1);if(scheme==ColorPickerScheme::NormalMap){double rx=(xx-1./255)/(1-2./255),ry=(yy-1./255)/(1-2./255),dx=(rx-.5)*2,dy=(ry-.5)*2,r=std::hypot(dx,dy);auto actual=field_->getPixel(x,y);if(rx<0||rx>1||ry<0||ry>1||r>1){if(actual!=0)throw std::runtime_error("Normal transparent raster");continue;}double angle=std::atan2(dy,dx),nx=std::cos(angle)*std::clamp(r,0.,1.),ny=std::sin(angle)*std::clamp(r,0.,1.),len=std::hypot(nx,ny);if(len>1&&len>0){nx/=len;ny/=len;}double radius=std::min(1.,std::hypot(nx,ny));auto color=std::uint32_t(pickerByte((nx*.5+.5)*255))|(std::uint32_t(pickerByte((-ny*.5+.5)*255))<<8)|(std::uint32_t(pickerByte(std::sqrt(std::max(0.,1-radius*radius))*255))<<16)|0xff000000;check(field_,x,y,color);continue;}if(scheme==ColorPickerScheme::Wheel){double distance=std::hypot(x+.5-field.w*.5,y+.5-field.h*.5),outer=field.w*.5-1;auto actual=field_->getPixel(x,y);if(distance>outer){if(actual!=0)throw std::runtime_error("Wheel corner alpha");continue;}if(distance>outer-1){if(actual!=skin_["border"])throw std::runtime_error("Wheel outline");continue;}double dx=((xx-1./255)/(1-2./255)-.5)*2,dy=((yy-1./255)/(1-2./255)-.5)*2;double radius=std::hypot(dx,dy);if(radius>1){if(actual!=0)throw std::runtime_error("Wheel polar alpha");continue;}check(field_,x,y,pickerHsvToRgb({pickerHue(std::atan2(dy,dx)*180/3.14159265358979323846),std::min(1.,radius),role.hsv.v}));continue;}const PickerHsv hsv=scheme==ColorPickerScheme::HsSquare?PickerHsv{pickerHue(xx*360),1-yy,role.hsv.v}:PickerHsv{role.hsv.h,xx,1-yy};check(field_,x,y,pickerHsvToRgb(hsv));}
      if(scheme==ColorPickerScheme::NormalMap){auto fixed=field_;auto before=roles_[role_];roles_[role_].hsv.v=roles_[role_].hsv.v>.5?.25:.75;roles_[role_].emit();onPaint(ev);if(field_!=fixed)throw std::runtime_error("Normal fixed field rebuilt");roles_[role_]=before;onPaint(ev);}
      for(int zone=1;zone<=2;++zone) {
        const auto inner=stripBounds(zone);
        for(int y=0;y<inner.h;++y) for(int x=0;x<inner.w;++x) {
          const double at=double(x)/std::max(1,inner.w-1);
          auto expected=scheme!=ColorPickerScheme::SvSquare?pickerHsvToRgb({role.hsv.h,role.hsv.s,at}):pickerHsvToRgb({at*359,1,1});
          if(zone==2) {
            const auto background=((x/4+y/4)%2)?skin_["checkerA"]:skin_["checkerB"];
            const auto rgb=std::uint32_t(gfx::getr(background))|std::uint32_t(gfx::getg(background))<<8|std::uint32_t(gfx::getb(background))<<16;
            expected=pickerComposite(role.color,at,rgb);
          }
          check(zone==1?hueStrip_:alphaStrip_,x,y,expected);
        }
      }
    }
  }
  roles_[role_]=savedRole;setScheme(savedScheme);setBounds(savedBounds);
}
void NativeColorPicker::onPaint(ui::PaintEvent& ev) {
  auto& g=*ev.graphics();UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());
  g.fillRect(skin_["background"],rc);const auto field=fieldBounds();const auto& role=roles_[role_];
  if(field.w==0 || field.h==0) return;
  // One outside panel frame belongs to the parent. These three colored regions
  // touch directly, and share the full available width without local borders.
  const double wantedFieldHue=(scheme_==ColorPickerScheme::SvSquare||scheme_==ColorPickerScheme::MoonRing)?role.hsv.h:0;
  const double wantedFieldValue=(scheme_==ColorPickerScheme::HsSquare||scheme_==ColorPickerScheme::Wheel)?role.hsv.v:1;
  const auto outline=skin_["border"];
  if(!field_ || fieldSize_!=field.w || fieldHeight_!=field.h || fieldHue_!=wantedFieldHue || fieldValue_!=wantedFieldValue || (scheme_==ColorPickerScheme::Wheel&&fieldOutline_!=outline)) {
    field_=os::instance()->makeRgbaSurface(field.w,field.h);
    if(!field_) throw std::runtime_error("Cannot allocate color picker field");
    if(scheme_==ColorPickerScheme::MoonRing&&moonField_==PickerMoonField::HslTriangle&&!pickerQuantized(quantization_))moonGeometry_.ensure(field.w,field.h);
    std::vector<std::uint32_t> quantPixels;if(pickerQuantized(quantization_))quantPixels=pickerQuantRaster(scheme_,role.hsv,moonField_,field.w,field.h,quantization_,&quantTriangleGeometry_);
    {os::SurfaceLock lock(field_.get());
      // The configured laf backend is Skia. Fill its raster bitmap directly,
      // avoiding one SkPixmap::erase/color-conversion call per opaque pixel.
      auto& pixels=static_cast<os::SkiaSurface*>(field_.get())->bitmap();
      for(int y=0;y<field.h;++y) for(int x=0;x<field.w;++x) {
        const double nx=double(x)/std::max(1,field.w-1),ny=double(y)/std::max(1,field.h-1);
        if(!quantPixels.empty()){const auto color=quantPixels[std::size_t(y)*field.w+x];if(scheme_==ColorPickerScheme::Wheel&&quantization_.colorSteps==0){const int coverage=pickerWheelCoverage(x,y,field.w);if(coverage==0){*pixels.getAddr32(x,y)=0;continue;}if(coverage==2){*pixels.getAddr32(x,y)=SkColorSetARGB(255,gfx::getr(outline),gfx::getg(outline),gfx::getb(outline));continue;}}*pixels.getAddr32(x,y)=color?SkColorSetARGB(255,color&255,(color>>8)&255,(color>>16)&255):0;}else if(scheme_==ColorPickerScheme::MoonRing){const auto i=std::size_t(y)*field.w+x;const bool triangle=moonField_==PickerMoonField::HslTriangle;auto color=pickerMoonCenterColor(nx,ny,role.hsv.h,moonField_,triangle?&moonGeometry_.weights[i]:nullptr,triangle?moonGeometry_.inside[i]!=0:true);*pixels.getAddr32(x,y)=color?SkColorSetARGB(255,*color&255,(*color>>8)&255,(*color>>16)&255):0;}else if(scheme_==ColorPickerScheme::NormalMap){auto color=pickerNormalMapRasterColor(nx,ny);*pixels.getAddr32(x,y)=color?SkColorSetARGB(255,*color&255,(*color>>8)&255,(*color>>16)&255):0;}else if(scheme_==ColorPickerScheme::Wheel){int coverage=pickerWheelCoverage(x,y,field.w);if(coverage==0){*pixels.getAddr32(x,y)=0;continue;}if(coverage==2){*pixels.getAddr32(x,y)=SkColorSetARGB(255,gfx::getr(outline),gfx::getg(outline),gfx::getb(outline));continue;}auto color=pickerWheelRasterColor(nx,ny,role.hsv.v);*pixels.getAddr32(x,y)=color?SkColorSetARGB(255,*color&255,(*color>>8)&255,(*color>>16)&255):0;}else{auto color=pickerHsvToRgb(pickerSchemeFieldHsv(scheme_,role.hsv,nx,ny));*pixels.getAddr32(x,y)=SkColorSetARGB(255,color&255,(color>>8)&255,(color>>16)&255);}
      }
    }
    field_->setImmutable();fieldSize_=field.w;fieldHeight_=field.h;fieldHue_=wantedFieldHue;fieldValue_=wantedFieldValue;fieldOutline_=outline;
  }
  g.drawRgbaSurface(field_.get(),field.x,field.y);
  if(scheme_==ColorPickerScheme::MoonRing){
 if(!moonRing_||moonRingWidth_!=field.w||moonRingHeight_!=field.h){moonRing_=os::instance()->makeRgbaSurface(field.w,field.h);if(!moonRing_)throw std::runtime_error("Cannot allocate moon hue ring");{os::SurfaceLock lock(moonRing_.get());auto& pixels=static_cast<os::SkiaSurface*>(moonRing_.get())->bitmap();for(int y=0;y<field.h;++y)for(int x=0;x<field.w;++x){const auto color=pickerQuantRingColor(double(x)/std::max(1,field.w-1),double(y)/std::max(1,field.h-1),quantization_);*pixels.getAddr32(x,y)=SkPreMultiplyARGB(color>>24,color&255,(color>>8)&255,(color>>16)&255);}}moonRing_->setImmutable();moonRingWidth_=field.w;moonRingHeight_=field.h;}
 g.drawRgbaSurface(moonRing_.get(),field.x,field.y);const auto center=pickerQuantMarker(scheme_,role.hsv,moonField_,quantization_);drawMarker(g,field,center.first,center.second,field_);const auto hue=pickerMoonHueMarker(pickerQuantHue(role.hsv.h,quantization_));drawMarker(g,field,hue.first,hue.second,moonRing_);
}else{const auto marker=pickerQuantMarker(scheme_,role.hsv,moonField_,quantization_);drawMarker(g,field,marker.first,marker.second,field_);}
  if(pickerSchemeUsesValue(scheme_) && (stripHue_!=role.hsv.h || stripSaturation_!=role.hsv.s)){hueStrip_.reset();stripHue_=role.hsv.h;stripSaturation_=role.hsv.s;}
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
          const auto color=zone==1?pickerQuantStripColor(scheme_,role.hsv,at,quantization_):role.color;
          for(int y=0;y<inner.h;++y) {
            auto shown=color;
            if(zone==2) {
              const auto checker=((x/4+y/4)%2)?a:b;
              const auto checkerRgb=std::uint32_t(gfx::getr(checker))|(std::uint32_t(gfx::getg(checker))<<8)|(std::uint32_t(gfx::getb(checker))<<16);
              shown=pickerComposite(color,pickerQuantColor(at,quantization_),checkerRgb);
            }
            *pixels.getAddr32(x,y)=SkColorSetARGB(255,shown&255,(shown>>8)&255,(shown>>16)&255);
          }
        }
      }
      surface->setImmutable();
    }
    g.drawRgbaSurface(surface.get(),inner.x,inner.y);
    const double fraction=zone==1?pickerQuantStripFraction(scheme_,role.hsv,quantization_):pickerQuantCell(double(role.color>>24)/255,quantization_);
    drawMarker(g,inner,fraction,0.5,surface);
  }
}
}
