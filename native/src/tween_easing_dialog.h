#pragma once
#include "tween_easing_model.h"
#include "native_widgets.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include "ui/paint.h"
#include "ui/timer.h"
#include <sstream>
namespace moon {
class TweenEasingPlot final:public ui::Widget {
 const Skin& skin_;TweenEasingDraft& draft_;int frames_;std::function<void()> changed_;
 void notify(){if(changed_)changed_();invalidate();}
public:
 TweenEasingPlot(const Skin& skin,TweenEasingDraft& draft,int frames,std::function<void()> changed):ui::Widget(ui::kGenericWidget),skin_(skin),draft_(draft),frames_(frames),changed_(std::move(changed)){setFocusStop(true);}
 gfx::Point pointPosition(double x,double y)const{return {bounds().x+int((12+x*100)/124*bounds().w),bounds().y+int((10+(1-y)*100)/124*bounds().h)};}
 void cancelDrag(){draft_.cancel();if(hasCapture())releaseMouse();notify();}
 bool onProcessMessage(ui::Message* msg)override{
  if(draft_.dragged>=0&&!hasCapture())draft_.finish();
  if(msg->type()==ui::kFocusLeaveMessage&&draft_.dragged>=0){const auto f=static_cast<ui::FocusMessage*>(msg);if(!f->newFocus()||f->newFocus()->window()!=window())cancelDrag();}
  if(msg->type()!=ui::kMouseDownMessage&&msg->type()!=ui::kMouseMoveMessage&&msg->type()!=ui::kMouseUpMessage)return ui::Widget::onProcessMessage(msg);
  const auto m=static_cast<ui::MouseMessage*>(msg);
  if(msg->type()==ui::kMouseDownMessage&&m->left()){const auto curve=draft_.displayed();for(int index:{0,2}){const auto at=pointPosition(curve[index],curve[index+1]);if(std::abs(at.x-m->position().x)<=4*uiScale&&std::abs(at.y-m->position().y)<=4*uiScale){requestFocus();draft_.begin(index);captureMouse();return true;}}}
  if(msg->type()==ui::kMouseMoveMessage&&hasCapture()&&draft_.dragged>=0){const auto p=tweenCurvePlotPoint(m->position().x,m->position().y,bounds().x,bounds().y,bounds().w,bounds().h);draft_.move(p.first,p.second);notify();return true;}
  if(msg->type()==ui::kMouseUpMessage&&hasCapture()){draft_.finish();releaseMouse();return true;}
  return ui::Widget::onProcessMessage(msg);
 }
 void onPaint(ui::PaintEvent& ev)override{
  auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());g.fillRect(skin_["background"],r);const auto curve=draft_.displayed();auto pos=[&](double x,double y){return gfx::Point(r.x+int((12+x*100)/124*r.w),r.y+int((10+(1-y)*100)/124*r.h));};
  const auto lo=pos(0,0),hi=pos(1,1);for(int i=0;i<=4;++i){const auto p=pos(i/4.,i/4.);g.drawLine(skin_["panel"],{p.x,hi.y},{p.x,lo.y});g.drawLine(skin_["panel"],{lo.x,p.y},{hi.x,p.y});}
  for(int i=1;i<=100;++i)g.drawLine(skin_["text"],pos((i-1)/100.,tweenProgress((i-1)/100.,draft_.easing,curve)),pos(i/100.,tweenProgress(i/100.,draft_.easing,curve)));
  const int samples=std::max(1,std::min(frames_,40));for(int i=0;i<=samples;++i){const double t=double(i)/samples;const auto p=pos(t,tweenProgress(t,draft_.easing,curve));g.fillRect(skin_["text"],{p.x-1,p.y-1,3,3});}
  g.drawLine(skin_["panel"],lo,pos(curve[0],curve[1]));g.drawLine(skin_["panel"],hi,pos(curve[2],curve[3]));
  for(int index:{0,2}){const auto p=pos(curve[index],curve[index+1]);g.fillRect(skin_["background"],{p.x-2,p.y-2,5,5});g.drawRect(skin_["text"],{p.x-2,p.y-2,5,5});}
 }
};
class TweenEasingDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;TweenEasingDraft draft_;PixelDropdown* easing_;PixelEntry* values_[4];TweenEasingPlot* plot_;PixelButton *reset_,*apply_,*cancel_,*close_;std::optional<std::pair<TweenEasing,std::array<double,4>>> result_;
 void sync(){const auto curve=draft_.displayed();easing_->setSelectedIndex(int(draft_.easing));for(int i=0;i<4;++i){std::ostringstream out;out.precision(8);out<<curve[i];values_[i]->setText(out.str());}plot_->invalidate();}
 void commit(int index){auto e=values_[index];try{if(!e->commitExpression())throw std::runtime_error("Invalid easing expression");std::size_t used=0;const auto value=std::stod(e->text(),&used);if(used!=e->text().size())throw std::runtime_error("Invalid easing coordinate");draft_.set(index,value);}catch(...){}sync();}
 void accept(){for(int i=0;i<4;++i)if(values_[i]->hasFocus())commit(i);draft_.finish();result_=std::make_pair(draft_.easing,draft_.custom);closeWindow(nullptr);}
public:
 TweenEasingDialog(const PixelFont& font,const Skin& skin,const Skin& icons,TweenEasing easing,std::array<double,4> curve,int frames):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::DoNothingOnClick),font_(font),skin_(skin){
  draft_.easing=easing;draft_.custom=curve;setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);
  easing_=new PixelDropdown(font,skin);addChild(easing_);easing_->setOptions({U"线性",U"缓入",U"缓出",U"缓入缓出",U"自定义曲线"});easing_->changed=[this](int i){draft_.easing=TweenEasing(i);sync();};
  plot_=new TweenEasingPlot(skin,draft_,frames,[this]{sync();});addChild(plot_);
  for(int i=0;i<4;++i){auto e=new PixelEntry(font,skin);values_[i]=e;e->numeric=true;e->numericStep=.01;addChild(e);e->accept=e->blur=[this,i]{commit(i);};e->cancel=[this]{closeWindow(nullptr);};e->wheel=[this,i](int delta){values_[i]->setText(std::to_string(draft_.displayed()[i]+delta*.01));commit(i);};}
  auto button=[&](const char32_t* text,std::function<void()> action){auto b=new PixelButton(font,skin,text,std::move(action));addChild(b);return b;};
  reset_=button(U"重置",[this]{draft_.reset();sync();});apply_=button(U"应用",[this]{accept();});cancel_=button(U"取消",[this]{closeWindow(nullptr);});close_=button(U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";sync();
 }
 const auto& result()const{return result_;}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale;auto place=[&](ui::Widget* c,int x,int y,int cw,int ch){c->setBounds({r.x+x*uiScale,r.y+y*uiScale,cw*uiScale,ch*uiScale});};layoutHeaderButton(close_);place(easing_,44,DialogLayout::bodyTop,w-50,textControlHeight);place(plot_,6,53,w-12,h-151);for(int i=0;i<4;++i)place(values_[i],6+i*(w-10)/4,h-74,(w-18)/4,textControlHeight);place(reset_,6,h-48,55,textControlHeight);place(cancel_,w-120,DialogLayout::footer(h),55,textControlHeight);place(apply_,w-63,DialogLayout::footer(h),57,textControlHeight);}
 gfx::Size minimumDialogSize(int)const override{return {260*uiScale,290*uiScale};}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"编辑缓动曲线");font_.draw(g,U"缓动",6,32,skin_["text"]);const char32_t* labels[]={U"X1",U"Y1",U"X2",U"Y2"};for(int i=0;i<4;++i)font_.draw(g,labels[i],6+i*(r.w-10)/4,r.h-86,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}if(key->scancode()==ui::kKeyEnter){accept();return true;}}return PixelPopupWindow::onProcessMessage(msg);}
 void smoke(int action){
  easing_->setSelectedIndex(0,true);values_[0]->setText(".25");commit(0);if(draft_.easing!=TweenEasing::Custom||draft_.custom!=std::array<double,4>{.25,1./3,2./3,2./3})throw std::runtime_error("Preset easing edit");
  draft_.reset();sync();const auto original=draft_.custom;const auto at=plot_->pointPosition(.42,0);ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,at);plot_->onProcessMessage(&down);
  const auto target=plot_->pointPosition(.25,.75);ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,target);plot_->onProcessMessage(&move);if(std::abs(draft_.custom[0]-.25)>.015||std::abs(draft_.custom[1]-.75)>.015)throw std::runtime_error("Easing handle drag");plot_->cancelDrag();if(draft_.custom!=original)throw std::runtime_error("Easing pointer cancel");
  values_[0]->setText(".25");commit(0);if(action==1)accept();else if(action==2){ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);}else cancel_->Click();
 }
};
}
