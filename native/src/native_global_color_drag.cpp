#include "native_global_color_drag.h"
#include "native_color_picker.h"
#include "native_widgets.h"
#include "system_screen_color.h"
#include "eyedropper_lens.h"
#include "ui/display.h"
#include "ui/layer.h"
#include "ui/manager.h"
#include "ui/message.h"
#include "ui/property.h"
#include "os/surface.h"
#include "os/system.h"
#include "os/paint.h"
#include "include/effects/SkImageFilters.h"
#include <thread>

namespace moon {
namespace {
const char* propertyName="moon.global-color-drag";
const void* environmentOwner=nullptr;
std::function<GlobalColorDragEnvironment()> environmentProvider;
class ColorDrag;
std::vector<std::weak_ptr<ColorDrag>> drags;

struct GlobalField {
 const std::vector<std::uint32_t>& pixels;bool distortion;
 std::uint32_t at(view::Point point)const{
  const int x=std::clamp(int(point.x*11/204),0,10),y=std::clamp(int(point.y*11/204),0,10);
  auto p=pixels[y*11+x];if(!distortion)return p;
  // styles.css global-color-magnifier: contrast(1.04) saturate(1.08).
  double c[3];for(int i=0;i<3;++i)c[i]=std::clamp((((p>>(8*i))&255)/255.-.5)*1.04+.5,0.,1.);
  const double l=c[0]*.213+c[1]*.715+c[2]*.072;
  std::uint32_t out=p&0xff000000;for(int i=0;i<3;++i)out|=std::uint32_t(eyedropper_lens::clampedByte((l+(c[i]-l)*1.08)*255))<<(8*i);
  return out;
 }
};

class ColorDrag final:public ui::Property,public std::enable_shared_from_this<ColorDrag> {
 PixelButton* button_;std::function<void(std::uint32_t)> changed_;
 ui::Timer timer_;GlobalColorSampling sampling_;GlobalColorDragEnvironment environment_;
 ui::Display* lensDisplay_=nullptr;ui::UILayerRef lens_;bool pressed_=false,dragged_=false;
 bool cursor_=false;const void* providerOwner_=nullptr;
 gfx::Point lensPointer_;int lensSize_=0,lensPadding_=0;
 ui::Widget* picked(GlobalColorSampling::Point p){return ui::Manager::getDefault()->pickFromScreenPos({p.x,p.y});}
 void hideLens(){
  if(lens_){lensDisplay_->removeLayer(lens_);lens_.reset();lensDisplay_=nullptr;}
 }
 void cursor(bool active){if(cursor_==active)return;cursor_=active;if(environment_.cursor)environment_.cursor(active);}
 void placeLens(GlobalColorSampling::Point p){
  lensPointer_={p.x,p.y};if(!lens_)return;
  const auto local=lensDisplay_->nativeWindow()->pointFromScreen(lensPointer_);
  const auto size=lensSize_;const auto area=lensDisplay_->size();
  // Source browser viewport becomes source native Display. Screen sampling
  // still works outside it; its pointer-transparent lens stays in that window.
  const auto position=eyedropper_lens::position({double(local.x),double(local.y)},{double(area.w),double(area.h)},size);
  lensDisplay_->dirtyRect(lens_->bounds());lens_->setPosition({int(std::floor(position.x))-lensPadding_,int(std::floor(position.y))-lensPadding_});lensDisplay_->dirtyRect(lens_->bounds());
 }
 void showLens(GlobalColorSampling::Point p,const std::vector<std::uint32_t>& pixels){
  if(!button_||pixels.size()!=121||!environment_.skin)return;
  for(const auto& mask:environment_.masks)if(!mask.bitmap)return;
  for(const auto& pointer:environment_.pointers)if(!pointer.bitmap)return;
  const auto& skin=*environment_.skin;const auto sampled=pixels[60];std::uint32_t ink=0;double darkest=1e9;
  for(const char* key:{"background","panel","button","border","text","muted","accent"}){
   const auto c=skin[key];const auto rgba=std::uint32_t(gfx::getr(c)|(gfx::getg(c)<<8)|(gfx::getb(c)<<16)|(gfx::geta(c)<<24));
   const double l=eyedropper_lens::themeLuminance(rgba);if(l<darkest){darkest=l;ink=rgba;}
  }
  const auto shell=eyedropper_lens::shell(GlobalField{pixels,environment_.distortion},
   {environment_.masks[0].bitmap.get(),environment_.masks[1].bitmap.get(),environment_.masks[2].bitmap.get(),environment_.masks[3].bitmap.get()},
   *environment_.pointers[eyedropper_lens::luminance(sampled)<145?1:0].bitmap,sampled,sampled,ink,environment_.line);
  auto source=os::instance()->makeRgbaSurface(128,128);source->clear();
  {os::SurfaceLock lock(source.get());for(int y=0;y<128;++y)for(int x=0;x<128;++x){const auto c=shell[y*128+x];source->putPixel(gfx::rgba(c&255,(c>>8)&255,(c>>16)&255,c>>24),x,y);}}
  const int size=std::max(1,int(128*uiScale*environment_.size));lensSize_=size;lensPadding_=std::max(1,int(std::ceil(12*environment_.size)));
  auto scaled=os::instance()->makeRgbaSurface(size+2*lensPadding_,size+2*lensPadding_);scaled->clear();
  os::Paint paint;paint.blendMode(os::BlendMode::SrcOver);
  os::Paint shadow=paint;const float factor=float(environment_.size);const bool dark=eyedropper_lens::luminance(std::uint32_t(gfx::getr(skin["background"])|(gfx::getg(skin["background"])<<8)|(gfx::getb(skin["background"])<<16)))<eyedropper_lens::luminance(std::uint32_t(gfx::getr(skin["text"])|(gfx::getg(skin["text"])<<8)|(gfx::getb(skin["text"])<<16)));
  shadow.skPaint().setImageFilter(SkImageFilters::DropShadow(3*factor,4*factor,2*factor,2*factor,dark?SkColorSetARGB(158,0,0,0):SkColorSetARGB(82,24,32,43),nullptr));
  scaled->drawSurface(source.get(),{0,0,128,128},{lensPadding_,lensPadding_,size,size},os::Sampling(),&shadow);
  if(!lens_){lensDisplay_=button_->display();if(!lensDisplay_)return;lens_=ui::UILayer::Make();lens_->setSurface(scaled);lens_->setPaint(paint);lensDisplay_->addLayer(lens_);}
  else {lensDisplay_->dirtyRect(lens_->bounds());lens_->setSurface(scaled);}
  placeLens(p);
 }
 void start(gfx::Point screen){
  environment_=environmentProvider?environmentProvider():GlobalColorDragEnvironment{};providerOwner_=environmentOwner;
  sampling_.begin(button_->swatch,environment_.magnifier);dragged_=true;cursor(true);sampling_.queue({screen.x,screen.y});
 }
 void stop(bool release,gfx::Point screen={}){
  pressed_=false;const bool dragged=dragged_;dragged_=false;
  if(button_){if(button_->hasCapture())button_->releaseMouse();button_->setSelected(false);button_->invalidate();}
  if(dragged&&release)sampling_.release({screen.x,screen.y});else sampling_.cancel();cursor(false);
 }
public:
 explicit ColorDrag(PixelButton& button,std::function<void(std::uint32_t)> changed)
  :ui::Property(propertyName),button_(&button),changed_(std::move(changed)),timer_(16,&button){
  sampling_.ports.picker=[this](auto p)->std::optional<GlobalColorSampling::Picker>{
   auto widget=picked(p);for(auto w=widget;w;w=w->parent())if(auto picker=dynamic_cast<NativeColorPicker*>(w)){
    const auto local=picker->display()->nativeWindow()->pointFromScreen({p.x,p.y});
    for(auto region:{NativeColorPicker::Region::Field,NativeColorPicker::Region::Hue,NativeColorPicker::Region::Alpha})
     if(picker->regionBounds(region).contains(local))return GlobalColorSampling::Picker{picker->sampleExternal(local)};
    break;
   }
   finishGlobalColorPickerSampling();return {};
  };
  sampling_.ports.hideAt=[this](auto p){auto target=picked(p);for(auto w=target;w;w=w->parent())if(dynamic_cast<NativeColorPicker*>(w))return true;return environment_.hideAt&&environment_.hideAt(target);};
  sampling_.ports.canvas=[this](auto p){return environment_.canvas?environment_.canvas({p.x,p.y},picked(p)):std::optional<std::uint32_t>{};};
  sampling_.ports.capture=[](auto p,bool region){
   // Detached promise workers capture only coordinates. Destroying a control
   // invalidates owner callbacks without waiting on a screen/GDI operation.
   auto promise=std::make_shared<std::promise<GlobalColorSampling::Capture>>();auto future=promise->get_future();
   std::thread([promise,p,region]{try{GlobalColorSampling::Capture result;if(region)result.pixels=sampleScreenColorRegion(p.x,p.y,5);if(result.pixels.empty())result.color=sampleScreenColor(p.x,p.y);promise->set_value(std::move(result));}catch(...){promise->set_exception(std::current_exception());}}).detach();return future;
  };
  sampling_.ports.apply=[this](auto color){if(button_&&button_->isVisible()&&button_->isEnabled()&&(!environment_.valid||environment_.valid())){auto changed=changed_;changed(color);}};
  sampling_.ports.fallback=[this](auto p)->std::optional<std::uint32_t>{auto w=picked(p);if(!w||!w->display())return {};auto d=w->display();const auto at=d->nativeWindow()->pointFromScreen({p.x,p.y});auto surface=d->backLayer()->surface();if(!surface||at.x<0||at.y<0||at.x>=surface->width()||at.y>=surface->height())return {};const auto c=surface->getPixel(at.x,at.y);if(!gfx::geta(c))return {};return std::uint32_t(gfx::getr(c)|(gfx::getg(c)<<8)|(gfx::getb(c)<<16)|(gfx::geta(c)<<24));};
  sampling_.ports.hideLens=[this]{hideLens();};sampling_.ports.finishPicker=finishGlobalColorPickerSampling;
  sampling_.ports.moveLens=[this](auto p){placeLens(p);};sampling_.ports.lens=[this](auto p,const auto& pixels){showLens(p,pixels);};
 }
 void connect(){std::weak_ptr<ColorDrag> weak=shared_from_this();timer_.Tick.connect([weak]{if(auto self=weak.lock())self->tick();});}
 ~ColorDrag()override{detach();}
 void detach(){if(!button_)return;stop(false);timer_.stop();button_=nullptr;changed_={};environment_={};}
 void ownerGone(const void* owner){if(providerOwner_==owner){stop(false);environment_={};}}
 bool active()const{return sampling_.active();}
 void tick(){
  if(!button_)return;
  if((pressed_&&!button_->hasCapture())||!button_->isVisible()||!button_->isEnabled()||(environment_.valid&&!environment_.valid())){stop(false);}
  sampling_.frame();sampling_.poll();if(!pressed_&&!sampling_.busy())timer_.stop();
 }
 bool process(ui::Message* message){
  if(!button_)return false;
  if(message->type()==ui::kFocusLeaveMessage||message->type()==ui::kCloseMessage||(message->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(message)->scancode()==ui::kKeyEsc)){
   const bool consumed=pressed_&&message->type()==ui::kKeyDownMessage;stop(false);return consumed;
  }
  if(!button_->isEnabled()||!button_->isVisible()){stop(false);return false;}
  if(message->type()==ui::kMouseDownMessage&&static_cast<ui::MouseMessage*>(message)->left()){
   stop(false);button_->requestFocus();pressed_=true;button_->setSelected(true);button_->invalidate();button_->captureMouse();timer_.start();return true;
  }
  if(pressed_&&message->type()==ui::kMouseMoveMessage){
   auto mouse=static_cast<ui::MouseMessage*>(message);const auto local=mouse->positionForDisplay(button_->display());
   const auto r=button_->bounds();const bool inside=local.x>=r.x&&local.x<=r.x2()&&local.y>=r.y&&local.y<=r.y2();
   if(!dragged_&&!inside)start(mouse->screenPosition());else if(dragged_){const auto p=mouse->screenPosition();sampling_.queue({p.x,p.y});}return true;
  }
  if(pressed_&&message->type()==ui::kMouseUpMessage){
   auto mouse=static_cast<ui::MouseMessage*>(message);if(mouse->button()!=ui::kButtonNone&&!mouse->left())return true;
   const bool click=!dragged_&&mouse->left()&&button_->bounds().contains(mouse->positionForDisplay(button_->display()));
   auto target=button_;stop(mouse->left(),mouse->screenPosition());if(click)target->Click();return true;
  }
  return false;
 }
};
std::shared_ptr<ColorDrag> state(PixelButton& button){return std::dynamic_pointer_cast<ColorDrag>(button.getProperty(propertyName));}
}
void setGlobalColorDragEnvironment(const void* owner,std::function<GlobalColorDragEnvironment()> provider){clearGlobalColorDragEnvironment(environmentOwner);environmentOwner=owner;environmentProvider=std::move(provider);}
void clearGlobalColorDragEnvironment(const void* owner){if(owner!=environmentOwner)return;for(auto& weak:drags)if(auto s=weak.lock())s->ownerGone(owner);environmentOwner=nullptr;environmentProvider={};}
void bindGlobalColorDrag(PixelButton& button,std::function<void(std::uint32_t)> changed){unbindGlobalColorDrag(button);auto s=std::make_shared<ColorDrag>(button,std::move(changed));s->connect();button.setProperty(s);drags.erase(std::remove_if(drags.begin(),drags.end(),[](const auto& p){return p.expired();}),drags.end());drags.push_back(s);}
void unbindGlobalColorDrag(PixelButton& button){if(auto s=state(button))s->detach();button.removeProperty(propertyName);}
bool globalColorDragActive(){for(auto& weak:drags)if(auto s=weak.lock();s&&s->active())return true;return false;}
void pollGlobalColorDrag(PixelButton& button){if(auto s=state(button))s->tick();}
bool processGlobalColorDrag(PixelButton& button,ui::Message* message){auto s=state(button);return s&&s->process(message);}
}
