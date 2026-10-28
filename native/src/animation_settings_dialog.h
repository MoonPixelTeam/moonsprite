#pragma once
#include "animation_settings.h"
#include "native_widgets.h"
#include "native_color_picker.h"
#include "ui_scale.h"
#include "ui/popup_window.h"
#include "ui/resize_event.h"
#include "ui/message.h"
#include "ui/manager.h"
#include "ui/tooltips.h"
#include <regex>
#include <sstream>
#include <cmath>
namespace moon {
class AnimationSettingNumber final:public PixelEntry {
public:
 double value=0,maximum=100;std::function<void(double)> committed;
 using PixelEntry::PixelEntry;
 void sync(double next){value=next;std::ostringstream out;out.precision(17);out<<next;setText(out.str());}
 void commit(){if(!commitExpression()){sync(value);return;}try{const double next=std::stod(text());if(!std::isfinite(next)){sync(value);return;}sync(std::clamp(next,0.,maximum));if(committed)committed(value);}catch(...){sync(value);}}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEnter){commit();return true;}return PixelEntry::onProcessMessage(msg);}
};
class AnimationColorPopup final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;NativeColorPicker* picker_;PixelEntry* hex_;PixelButton* close_;std::uint32_t value_;std::function<void(std::uint32_t)> changed_;
 static std::string hex(std::uint32_t c){static const char digits[]="0123456789ABCDEF";std::string s="#";for(int shift:{0,8,16,24}){const auto b=(c>>shift)&255;s+=digits[b>>4];s+=digits[b&15];}return s;}
public:
 AnimationColorPopup(const PixelFont& font,const Skin& skin,const std::filesystem::path& markers,std::uint32_t value,std::function<void(std::uint32_t)> changed):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),value_(value),changed_(std::move(changed)){
  setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);picker_=new NativeColorPicker(font,skin,markers);addChild(picker_);hex_=new PixelEntry(font,skin);addChild(hex_);hex_->setText(hex(value));picker_->syncColors(value,value);picker_->changed=[this](std::uint32_t c,bool){value_=c;hex_->setText(hex(c));changed_(c);};
  auto update=[this]{auto s=hex_->text();if(!s.empty()&&s[0]=='#')s.erase(0,1);if(s.size()!=6&&s.size()!=8)return;std::uint32_t c=s.size()==6?value_&0xff000000:0;for(std::size_t i=0;i<s.size()/2;++i){const auto byte=s.substr(i*2,2);if(byte.find_first_not_of("0123456789abcdefABCDEF")!=std::string::npos)return;c|=std::uint32_t(std::stoul(byte,nullptr,16))<<(i*8);}value_=c;picker_->syncColors(c,c);changed_(c);};hex_->Change.connect(update);hex_->blur=[this,update]{update();hex_->setText(hex(value_));};hex_->accept=hex_->blur;close_=new PixelButton(font,skin,U"关闭",[this]{picker_->finishInteraction();closeWindow(nullptr);});addChild(close_);
 }
 ~AnimationColorPopup(){picker_->finishInteraction();}
 void smoke(){hex_->setText("#12345678");hex_->Change();if(value_!=0x78563412)throw std::runtime_error("Animation color RGBA alpha input");hex_->setText("#ABCDEF");hex_->Change();if(value_!=0x78efcdab)throw std::runtime_error("Animation color RGB preserves alpha");picker_->changed(0x40332211,false);if(value_!=0x40332211||hex_->text()!="#11223340")throw std::runtime_error("Animation native picker output");}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());auto r=bounds();picker_->setBounds({r.x+6*uiScale,r.y+DialogLayout::bodyTop*uiScale,r.w-12*uiScale,r.h-(DialogLayout::bodyTop+textControlHeight+2*DialogLayout::inset)*uiScale});hex_->setBounds({r.x+6*uiScale,r.y2()-(textControlHeight+6)*uiScale,r.w-69*uiScale,textControlHeight*uiScale});close_->setBounds({r.x2()-61*uiScale,r.y2()-(textControlHeight+6)*uiScale,55*uiScale,textControlHeight*uiScale});}
 gfx::Size minimumDialogSize(int)const override{return {175*uiScale,178*uiScale};}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"洋葱皮颜色 RGBA");}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kMouseLeaveMessage)return true;if(msg->type()==ui::kCloseMessage)picker_->finishInteraction();return PixelPopupWindow::onProcessMessage(msg);}
};
class AnimationSettingsControls final:public ui::Widget {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;std::filesystem::path markers_;
 animationprefs::Settings& settings_;std::function<void()> changed_;
 PixelButton *skip_,*enabled_,*playback_,*scope_[2],*colors_[2];
 AnimationSettingNumber* values_[4];PixelSlider* opacity_[2];int shownOpacity_=-1;
 bool colorOpen_=false,rangeFilters_=false;ui::TooltipManager* tips_=nullptr;
 int fieldLeft()const{return 8+std::max({font_.measure(U"生效范围"),font_.measure(U"显示范围"),font_.measure(U"叠加透明度"),font_.measure(U"颜色")});}
 double numeric(int i)const{return i==0?settings_.onion.previousFrames:i==1?settings_.onion.nextFrames:i==2?settings_.onion.previousOpacity:settings_.onion.nextOpacity;}
 void commitNumeric(int i,double value){const double next=value;auto& o=settings_.onion;double* target=i==0?&o.previousFrames:i==1?&o.nextFrames:i==2?&o.previousOpacity:&o.nextOpacity;*target=std::clamp(next,0.,i<2?8.:100.);apply();}
 void checkbox(PixelButton* b,bool value){b->active=value;b->invalidate();}
 void closeRange(){shownOpacity_=-1;if(rangeFilters_){rangeFilters_=false;auto manager=ui::Manager::getDefault();manager->removeMessageFilter(ui::kMouseDownMessage,this);manager->removeMessageFilter(ui::kFocusEnterMessage,this);}layoutControls();invalidate();}
 void openRange(int index){shownOpacity_=index;if(!rangeFilters_){rangeFilters_=true;auto manager=ui::Manager::getDefault();manager->addMessageFilter(ui::kMouseDownMessage,this);manager->addMessageFilter(ui::kFocusEnterMessage,this);}layoutControls();invalidate();}
 void apply(){sync();changed_();}
 void color(int index,bool verify=false){commitInputs();closeRange();colorOpen_=true;if(popupOpen)popupOpen(true);AnimationColorPopup popup(font_,skin_,markers_,index?settings_.onion.nextColor:settings_.onion.previousColor,[this,index](std::uint32_t c){(index?settings_.onion.nextColor:settings_.onion.previousColor)=c;apply();});popup.setDisplay(display(),false);auto r=bounds();popup.setBounds({r.x+10,r.y+40,400,440});ui::Timer timer(50,&popup);if(verify){timer.Tick.connect([&]{popup.smoke();timer.stop();popup.closeWindow(nullptr);});timer.start();}popup.openWindowInForeground();colorOpen_=false;if(popupOpen)popupOpen(false);requestFocus();}
public:
 AnimationSettingsControls(const PixelFont& font,const Skin& skin,const Skin& icons,const std::filesystem::path& markers,animationprefs::Settings& settings,std::function<void()> changed):ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),icons_(icons),markers_(markers),settings_(settings),changed_(std::move(changed)){
  setTransparent(true);auto button=[&](const char32_t* title,std::function<void()> action){auto b=new PixelButton(font,skin,title,action);addChild(b);return b;};
  skip_=new PixelSwitch(font,skin,U"左右切换时跳过停用帧",settings_.skipDisabledFrames,[this](bool value){settings_.skipDisabledFrames=value;apply();});addChild(skip_);
  enabled_=new PixelSwitch(font,skin,U"启用洋葱皮",settings_.onion.enabled,[this](bool value){auto& o=settings_.onion;o.enabled=value;if(value)o.showDuringPlayback=true;else closeRange();apply();});addChild(enabled_);
  playback_=new PixelSwitch(font,skin,U"播放动画时显示洋葱皮",settings_.onion.showDuringPlayback,[this](bool value){settings_.onion.showDuringPlayback=value;apply();});addChild(playback_);
  tips_=new ui::TooltipManager;addChild(tips_);tips_->addTooltipFor(skip_,utf8Text(U"使用左右方向键或“，/。”切换帧时，自动跳过停用的帧。"));
  for(int i=0;i<2;++i){scope_[i]=button(i?U"所有图层":U"当前图层",[this,i]{if(settings_.onion.allLayers==(i!=0))return;settings_.onion.allLayers=i!=0;apply();});colors_[i]=button(U"",[this,i]{color(i);});colors_[i]->skinStyle="color-value";colors_[i]->colorRole=true;}
  for(int i=0;i<4;++i){auto e=new AnimationSettingNumber(font,skin);values_[i]=e;e->numeric=true;e->maximum=i<2?8:100;e->suffix=i<2?U"":U"%";addChild(e);e->committed=[this,i](double v){commitNumeric(i,v);};e->blur=[e]{e->commit();};e->wheel=[this,i,e](int delta){commitNumeric(i,numeric(i)+delta);e->sync(numeric(i));};if(i>=2)e->focus=[this,i]{openRange(i-2);};}
  for(int i=0;i<2;++i){auto slider=new PixelSlider(font,skin);opacity_[i]=slider;slider->minimum=0;slider->maximum=100;slider->changed=[this,i](int value){commitNumeric(i+2,value);values_[i+2]->sync(numeric(i+2));};addChild(slider);}
  sync();
 }
 ~AnimationSettingsControls(){if(rangeFilters_){auto manager=ui::Manager::getDefault();manager->removeMessageFilter(ui::kMouseDownMessage,this);manager->removeMessageFilter(ui::kFocusEnterMessage,this);}}
 void commitInputs(){for(auto e:values_)if(e->hasFocus())e->commit();}
 void sync(){checkbox(skip_,settings_.skipDisabledFrames);checkbox(enabled_,settings_.onion.enabled);checkbox(playback_,settings_.onion.showDuringPlayback);for(int i=0;i<4;++i)if(!values_[i]->hasFocus())values_[i]->sync(numeric(i));for(int i=0;i<2;++i){scope_[i]->active=settings_.onion.allLayers==(i!=0);colors_[i]->swatch=i?settings_.onion.nextColor:settings_.onion.previousColor;colors_[i]->invalidate();opacity_[i]->value=int(std::floor(numeric(i+2)+.5));opacity_[i]->invalidate();}layoutControls();invalidate();}
 void layoutControls(){
  if(bounds().isEmpty())return;
  const auto r=bounds();const int w=r.w/uiScale;auto place=[&](ui::Widget* c,gfx::Rect b){c->setBounds(uiPhysical(b).offset(r.origin()));};
  place(skip_,{6,0,w-12,textControlHeight});place(enabled_,{6,38,w-12,textControlHeight});
  const bool enabled=settings_.onion.enabled;place(playback_,{6,60,w-12,textControlHeight});playback_->setVisible(enabled);
  const int left=fieldLeft(),column=(w-left-8)/2;const int scopeWidth=w-left-6,leftScope=(scopeWidth+UiSpacing::sharedBorder)/2;for(int i=0;i<2;++i){const int x=left+i*(column+2);place(scope_[i],{i?left+leftScope-UiSpacing::sharedBorder:left,86,i?scopeWidth-leftScope+UiSpacing::sharedBorder:leftScope,textControlHeight});scope_[i]->setVisible(enabled);place(colors_[i],{x,190,column,textControlHeight});colors_[i]->setVisible(enabled);place(opacity_[i],{x,168,column,textControlHeight});opacity_[i]->setVisible(enabled&&shownOpacity_==i);}
  for(int i=0;i<4;++i){place(values_[i],{left+(i%2)*(column+2),i<2?124:146,column,textControlHeight});values_[i]->setVisible(enabled);}

 }
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layoutControls();}
 int contentHeight()const{return settings_.onion.enabled?210:58;}
 void onPaint(ui::PaintEvent& ev)override{
  auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());auto text=[&](const char32_t* s,int x,int y){font_.draw(g,s,r.x+x,r.y+y,skin_["text"]);};text(U"洋葱皮",6,26);
  if(settings_.onion.enabled){text(U"生效范围",6,91);text(U"前面",fieldLeft(),112);text(U"后面",fieldLeft()+(r.w-fieldLeft()-8)/2+2,112);text(U"显示范围",6,129);text(U"叠加透明度",6,151);text(U"颜色",6,195);}

 }
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->fromFilter()){
   if(shownOpacity_<0||colorOpen_)return false;
   if(msg->type()==ui::kMouseDownMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto point=mouse->position();if(mouse->display()!=display()||!isVisible()||(!values_[shownOpacity_+2]->bounds().contains(point)&&!opacity_[shownOpacity_]->bounds().contains(point)))closeRange();}
   else if(msg->type()==ui::kFocusEnterMessage){auto next=static_cast<ui::FocusMessage*>(msg)->newFocus();if(next!=values_[shownOpacity_+2]&&next!=opacity_[shownOpacity_])closeRange();}
   return false;
  }
  return ui::Widget::onProcessMessage(msg);
 }
 std::function<void(bool)> popupOpen;
 void dismissTransient(){commitInputs();closeRange();}
 void smoke(){
  const auto original=settings_;skip_->Click();if(settings_.skipDisabledFrames==original.skipDisabledFrames)throw std::runtime_error("Animation skip toggle");settings_.onion.enabled=false;settings_.onion.showDuringPlayback=false;sync();enabled_->Click();if(!settings_.onion.enabled||!settings_.onion.showDuringPlayback||!values_[0]->isVisible())throw std::runtime_error("Onion enabled control transition");playback_->Click();scope_[1]->Click();if(settings_.onion.showDuringPlayback||!settings_.onion.allLayers)throw std::runtime_error("Onion scope/playback UI");values_[0]->setText("2+3");ui::KeyMessage enter(ui::kKeyDownMessage,ui::kKeyEnter,ui::kKeyNoneModifier,0,0);values_[0]->onProcessMessage(&enter);values_[2]->setText("32.5");values_[2]->commit();if(settings_.onion.previousOpacity!=32.5)throw std::runtime_error("Onion fractional opacity");values_[2]->setText("125");values_[2]->commit();if(settings_.onion.previousFrames!=5||settings_.onion.previousOpacity!=100)throw std::runtime_error("Onion expressions/clamp");values_[3]->requestFocus();ui::Manager::getDefault()->dispatchMessages();openRange(1);opacity_[1]->changed(17);if(settings_.onion.nextOpacity!=17||values_[3]->text()!="17")throw std::runtime_error("Onion opacity slider / focused entry synchronization");
  const auto sliderPoint=opacity_[1]->bounds().center();ui::MouseMessage sliderPress(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,sliderPoint);sliderPress.setDisplay(display());sliderPress.setFromFilter(true);onProcessMessage(&sliderPress);if(shownOpacity_!=1)throw std::runtime_error("Onion range closed on own slider");
  ui::MouseMessage outside(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,bounds().origin()-gfx::Point(2*uiScale,2*uiScale));outside.setDisplay(display());outside.setFromFilter(true);onProcessMessage(&outside);if(shownOpacity_!=-1||rangeFilters_)throw std::runtime_error("Onion outside press did not close range");values_[3]->focus();if(shownOpacity_!=1)throw std::runtime_error("Focused opacity click failed to reopen range");ui::FocusMessage focusOther(ui::kFocusEnterMessage,values_[3],skip_);focusOther.setFromFilter(true);onProcessMessage(&focusOther);if(shownOpacity_!=-1)throw std::runtime_error("Onion keyboard focus did not close range");
  openRange(0);enabled_->Click();if(shownOpacity_!=-1||values_[0]->isVisible())throw std::runtime_error("Onion disable retained transient controls");enabled_->Click();if(!settings_.onion.enabled||!settings_.onion.showDuringPlayback)throw std::runtime_error("Onion reenabling playback default");color(0,true);if(settings_.onion.previousColor!=0x40332211)throw std::runtime_error("Animation color live settings");dismissTransient();skip_->requestFocus();ui::Manager::getDefault()->dispatchMessages();settings_=original;sync();changed_();
 }
};
class AnimationSettingsDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;animationprefs::Settings& settings_;
 AnimationSettingsControls* controls_;PixelButton *close_,*headerClose_,*reset_;std::u32string error_;
public:
 AnimationSettingsDialog(const PixelFont& font,const Skin& skin,const Skin& icons,const std::filesystem::path& markers,animationprefs::Settings& settings,std::function<void()> changed):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),settings_(settings){
  setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);
  controls_=new AnimationSettingsControls(font,skin,icons,markers,settings,[this,changed]{changed();relayout();});addChild(controls_);
  controls_->popupOpen=[this](bool open){setClickBehavior(open?ui::PopupWindow::ClickBehavior::DoNothingOnClick:ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow);};
  auto close=[this]{controls_->dismissTransient();closeWindow(nullptr);};
  close_=new PixelButton(font,skin,U"关闭",close);addChild(close_);
  headerClose_=new PixelButton(font,skin,U"",close);headerClose_->iconSkin=&icons;headerClose_->icon="close";headerClose_->skinStyle="icon_button";addChild(headerClose_);
  reset_=new PixelButton(font,skin,U"重置",[this,changed]{controls_->dismissTransient();settings_=animationprefs::Settings{};controls_->sync();changed();relayout();});reset_->iconSkin=&icons;reset_->icon="restore";reset_->iconWithCaption=true;addChild(reset_);
 }
 void setError(std::u32string error){error_=std::move(error);invalidate();}
 void relayout(){if(bounds().isEmpty())return;auto r=bounds();auto floor=minimumDialogSize(r.w);r.w=std::max(r.w,floor.w);r.h=std::max(r.h,floor.h);setBounds(r);invalidate();}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());auto r=bounds();controls_->setBounds({r.x,r.y+DialogLayout::bodyTop*uiScale,r.w,controls_->contentHeight()*uiScale});layoutHeaderButton(headerClose_);close_->setBounds({r.x2()-61*uiScale,r.y2()-26*uiScale,55*uiScale,textControlHeight*uiScale});reset_->setBounds({r.x+6*uiScale,r.y2()-26*uiScale,55*uiScale,textControlHeight*uiScale});}
 gfx::Size minimumDialogSize(int)const override{return {202*uiScale,(DialogLayout::bodyTop+controls_->contentHeight()+48)*uiScale};}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"动画设置");font_.draw(g,error_.empty()?U"更改即时生效":error_,r.x+6,r.y2()-42,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kCloseMessage)controls_->dismissTransient();if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){controls_->dismissTransient();closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(msg);}
 void smoke(){const auto original=settings_;const auto geometry=bounds();
  for(int edge:{1,2,4,8,5,6,9,10}){setBounds(geometry);auto r=bounds();const gfx::Point from(edge&1?r.x+1:edge&2?r.x2()-1:r.x+r.w/2,edge&4?r.y+1:edge&8?r.y2()-1:r.y+r.h/2);auto send=[&](ui::MessageType type,gfx::Point p){ui::MouseMessage m(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,p);processDialogGeometry(&m);};const gfx::Point delta(edge&1?10000:edge&2?-10000:0,edge&4?10000:edge&8?-10000:0);send(ui::kMouseDownMessage,from);send(ui::kMouseMoveMessage,from+delta);send(ui::kMouseUpMessage,from+delta);auto result=bounds();auto floor=minimumDialogSize(result.w);if(result.w<floor.w||result.h<floor.h||(edge&1&&result.x2()!=r.x2())||(edge&4&&result.y2()!=r.y2()))throw std::runtime_error("Shared popup content floor / opposite edge");}setBounds(geometry);
  controls_->smoke();reset_->Click();if(settings_.onion.enabled||!settings_.skipDisabledFrames||settings_.onion.previousColor!=0xff5053ef)throw std::runtime_error("Animation scoped defaults");settings_=original;controls_->sync();relayout();}
};
}
