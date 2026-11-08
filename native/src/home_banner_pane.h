#pragma once
#include "native_widgets.h"
#include "home_banner.h"
#include "gallery_projects.h"
#include "recent_preview_queue.h"
#include <random>
#include "ui/message.h"
#include "ui/resize_event.h"
namespace moon {
class HomeBannerPane final:public ui::Widget {
 // Transparent native buttons retain separate Tab/Enter/Space targets.
 class Hit final:public ui::Widget {
  bool pressed_=false;
 public:
  std::function<void()> click,enter,changed;
  Hit():ui::Widget(ui::kGenericWidget){setTransparent(true);setFocusStop(true);}
  void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());}
  bool onProcessMessage(ui::Message* msg)override{
   if(!isEnabled())return ui::Widget::onProcessMessage(msg);
   if(msg->type()==ui::kMouseEnterMessage){if(enter)enter();if(changed)changed();}
   if(msg->type()==ui::kMouseLeaveMessage||msg->type()==ui::kFocusEnterMessage||msg->type()==ui::kFocusLeaveMessage){if(changed)changed();}
   if(auto m=dynamic_cast<ui::MouseMessage*>(msg)){
    if(msg->type()==ui::kMouseDownMessage&&m->left()){pressed_=true;requestFocus();captureMouse();return true;}
    if(msg->type()==ui::kMouseUpMessage&&pressed_){pressed_=false;if(hasCapture())releaseMouse();if(m->left()&&bounds().contains(m->position())&&click)click();return true;}
   }
   if(msg->type()==ui::kKeyDownMessage){const auto k=static_cast<ui::KeyMessage*>(msg);if(k->scancode()==ui::kKeyEnter||k->scancode()==ui::kKeySpace){if(click)click();return true;}}
   return ui::Widget::onProcessMessage(msg);
  }
 };
 const PixelFont& font_;const Skin& icons_;
 std::map<std::string,os::SurfaceRef> images_;
 std::vector<home::Banner> definitions_,values_;std::vector<os::SurfaceRef> surfaces_;
 gallery::ScanQueue scan_;std::uint64_t generation_=0,appliedGeneration_=0;
 recent::PreviewQueue previews_;ui::Timer timer_{32,this};
 std::size_t active_=0;bool started_=false,enabled_=false;
 std::chrono::steady_clock::time_point due_;
 Hit* art_=nullptr;Hit* credit_=nullptr;std::vector<Hit*> dots_;
 os::SurfaceRef surface(int width,int height,const std::vector<std::uint32_t>& pixels){
  auto out=os::instance()->makeRgbaSurface(width,height);
  if(out){os::SurfaceLock lock(out.get());for(int y=0;y<height;++y)for(int x=0;x<width;++x){auto p=pixels[std::size_t(y)*width+x];out->putPixel(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24),x,y);}}
  return out;
 }
 gfx::Rect logical()const{return {0,0,bounds().w/uiScale,bounds().h/uiScale};}
 gfx::Rect absolute(gfx::Rect r)const{auto result=uiPhysical(r);result.offset(bounds().x,bounds().y);return result;}
 std::u32string creditText()const{return values_.empty()?U"":U"作者："+unicodeText(values_[active_].author);}
 gfx::Rect authorBounds()const{const auto r=logical();const int width=std::min(std::max(0,r.w/2-4),font_.measure(creditText())+8);return {r.x2()-width-2,r.y2()-17,width,15};}
 gfx::Rect dotBounds(std::size_t i)const{const auto r=logical();const int width=int(values_.size())*8-2;return {r.center().x-width/2+int(i)*8,r.y2()-8,6,6};}
 Hit* button(){auto b=new Hit;addChild(b);b->changed=[this]{invalidate();};return b;}
 void layout(){
  if(!art_)return;art_->setBounds(bounds());credit_->setBounds(absolute(authorBounds()));
  for(std::size_t i=0;i<dots_.size();++i){const bool shown=values_.size()>1&&i<values_.size();dots_[i]->setVisible(shown);dots_[i]->setEnabled(shown);if(shown)dots_[i]->setBounds(absolute(dotBounds(i)));}
 }
 void choose(std::size_t index){if(index>=values_.size()||active_==index)return;active_=index;layout();invalidate();}
 void tick(){
  if(auto result=scan_.take())if(result->generation==generation_){
   appliedGeneration_=result->generation;values_=home::resolveBannerRecords(definitions_,result->projects);active_=0;surfaces_.clear();std::vector<recent::Project> requests;
   for(const auto& b:values_){surfaces_.push_back(b.kind=="image"?images_[b.asset]:os::SurfaceRef{});if(b.kind=="project")requests.push_back({b.path,b.modified,false});}
   previews_.request(requests,{});due_=std::chrono::steady_clock::now()+std::chrono::seconds(8);layout();invalidate();
  }
  for(auto& result:previews_.take())for(std::size_t i=0;i<values_.size();++i)
   if(values_[i].kind=="project"&&result.key==recent::previewKey({values_[i].path,values_[i].modified,false})&&result.value->error.empty()){
    const auto& p=*result.value;surfaces_[i]=surface(p.previewWidth,p.previewHeight,p.pixels);invalidate();
   }
  if(enabled_&&values_.size()>1&&std::chrono::steady_clock::now()>=due_){choose((active_+1)%values_.size());due_=std::chrono::steady_clock::now()+std::chrono::seconds(8);}
 }
public:
 std::function<void(const home::Banner&)> open;std::function<void(const std::string&)> author;
 HomeBannerPane(const PixelFont& font,const Skin&,const Skin& icons,const std::filesystem::path& assets):ui::Widget(ui::kGenericWidget),font_(font),icons_(icons){
  setTransparent(true);std::mt19937 random(std::random_device{}());
  definitions_=home::shuffleBanners(home::bannerDefinitions(),[&]{return std::generate_canonical<double,53>(random);});
  for(const auto& b:definitions_)if(b.kind=="image"){const auto patch=importSkinPng(assets/"home"/(b.asset+".png"),2048);images_[b.asset]=surface(patch.bitmap->width,patch.bitmap->height,patch.bitmap->pixels);}
  values_=home::resolveBanners(definitions_,{});for(const auto& b:values_)surfaces_.push_back(images_[b.asset]);
  art_=button();art_->click=[this]{if(open&&!values_.empty()){auto value=values_[active_];open(value);}};
  credit_=button();credit_->click=[this]{if(author&&!values_.empty()){auto url=values_[active_].url;author(url);}};
  for(std::size_t i=0;i<definitions_.size();++i){auto dot=button();dot->enter=dot->click=[this,i]{choose(i);};dots_.push_back(dot);}
  // laf picks the first intersecting child; overlays must precede the art.
  removeChild(art_);addChild(art_);
  due_=std::chrono::steady_clock::now()+std::chrono::seconds(8);timer_.Tick.connect([this]{tick();});
 }
 void start(const std::filesystem::path& directory,bool force=false){if(started_&&!force)return;started_=true;generation_=scan_.request([directory](const std::function<bool()>& canceled){try{return gallery::list(directory,{},canceled);}catch(...){return std::vector<recent::Project>{};}});}
 void setActive(bool value){if(enabled_==value)return;enabled_=value;if(value){due_=std::chrono::steady_clock::now()+std::chrono::seconds(8);timer_.start();}else timer_.stop();}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layout();}
 void onPaint(ui::PaintEvent& ev)override{
  if(values_.empty())return;auto& g=*ev.graphics();UiPaintScale paint(g);const auto r=logical();
  const auto& b=values_[active_];const auto& image=surfaces_[active_];
  if(image){const double zoom=std::max(double(r.w)/image->width(),double(r.h)/image->height());const int w=std::max(1,int(r.w/zoom)),h=std::max(1,int(r.h/zoom));g.drawSurface(image.get(),{(image->width()-w)/2,(image->height()-h)/2,w,h},r,os::Sampling(),nullptr);}
  else icons_.draw(g,"image",{r.center().x-7,r.center().y-7,15,15},true);
  bool hovered=false;for(auto child:children())hovered|=child->hasMouse()||child->hasFocus();const int opacity=hovered?255:51;
  if(hovered)for(int y=r.h*38/100;y<r.h;++y)g.fillRect(gfx::rgba(0,0,0,86*(y-r.h*38/100)/std::max(1,r.h-r.h*38/100)),{0,y,r.w,1});
  g.saveClip();g.clipRect(r);auto title=unicodeText(b.name);while(!title.empty()&&font_.measure(title)>r.w/2-12)title.pop_back();
  g.fillRect(gfx::rgba(12,15,20,209*opacity/255),{r.x+2,r.y2()-17,font_.measure(title)+8,15});font_.draw(g,title,r.x+6,r.y2()-15,gfx::rgba(255,255,255,opacity));
  auto credit=creditText();const auto creditBox=authorBounds();while(!credit.empty()&&font_.measure(credit)>creditBox.w-8)credit.pop_back();
  g.fillRect(gfx::rgba(12,15,20,209*opacity/255),creditBox);font_.draw(g,credit,creditBox.x+4,creditBox.y+2,gfx::rgba(255,255,255,opacity));
  if(values_.size()>1)for(std::size_t i=0;i<values_.size();++i)g.fillRect(gfx::rgba(255,255,255,i==active_?opacity/5:opacity),dotBounds(i));g.restoreClip();
 }
 void smokePoll(){tick();}std::size_t count()const{return values_.size();}const auto& values()const{return values_;}
 void smokeChoose(std::size_t i){choose(i);}void smokeOpen(){art_->click();}void smokeAuthor(){credit_->click();}
 bool smokePreview(std::size_t i)const{return bool(surfaces_.at(i));}void smokeAdvance(){due_=std::chrono::steady_clock::now();tick();}std::size_t index()const{return active_;}
 ui::Widget* smokeArt(){return art_;}ui::Widget* smokeCredit(){return credit_;}ui::Widget* smokeDot(std::size_t i){return dots_.at(i);}
 bool smokeScanSettled()const{return generation_==appliedGeneration_;}
};
}
