#pragma once
#include "custom_grid.h"
#include "native_widgets.h"
#include "ui/popup_window.h"
#include "ui/resize_event.h"
#include "ui/message.h"
#include <sstream>
namespace moon {
class CustomGridDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;GridSettings draft_;PixelEntry* fields_[4];PixelButton *done_,*cancel_,*close_;std::function<void(GridSettings)> apply_;
 double& value(int i){return i==0?draft_.x:i==1?draft_.y:i==2?draft_.width:draft_.height;}
 void sync(int i){std::ostringstream s;s.precision(17);s<<value(i);fields_[i]->setText(s.str());}
 void commit(int i){auto e=fields_[i];try{if(!e->commitExpression())throw std::invalid_argument("Invalid grid number");std::size_t used=0;double v=std::stod(e->text(),&used);if(used!=e->text().size()||!std::isfinite(v))throw std::invalid_argument("Invalid grid number");value(i)=v;draft_=normalizeGridSettings(draft_);}catch(const std::exception&){}sync(i);}
 void done(){for(int i=0;i<4;++i)commit(i);apply_(draft_);closeWindow(nullptr);}
public:
 CustomGridDialog(const PixelFont& font,const Skin& skin,const Skin& icons,GridSettings initial,std::function<void(GridSettings)> apply):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),draft_(normalizeGridSettings(initial)),apply_(std::move(apply)){
  setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);
  for(int i=0;i<4;++i){auto e=fields_[i]=new PixelEntry(font,skin);addChild(e);e->numeric=true;e->numericStep=1;e->suffix=U"px";sync(i);e->blur=[this,i]{commit(i);};e->accept=[this]{done();};e->cancel=[this]{closeWindow(nullptr);};e->wheel=[this,i](int n){commit(i);this->value(i)+=n;draft_=normalizeGridSettings(draft_);sync(i);};}
  auto button=[&](const char32_t* label,std::function<void()> fn){auto b=new PixelButton(font,skin,label,std::move(fn));addChild(b);return b;};done_=button(U"完成",[this]{done();});cancel_=button(U"取消",[this]{closeWindow(nullptr);});close_=button(U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";
 }
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());auto r=bounds();auto place=[&](ui::Widget* w,int x,int y,int width,int height){w->setBounds({r.x+x*uiScale,r.y+y*uiScale,width*uiScale,height*uiScale});};const int w=r.w/uiScale,h=r.h/uiScale;for(int i=0;i<4;++i)place(fields_[i],70,DialogLayout::row(i),w-76,textControlHeight);layoutHeaderButton(close_);place(cancel_,w-120,DialogLayout::footer(h),55,textControlHeight);place(done_,w-63,DialogLayout::footer(h),57,textControlHeight);}
  gfx::Size minimumDialogSize(int)const override {
   int field=0;for(auto entry:fields_)field=std::max(field,entry->widthForValue(U"-9999"));
   return {std::max(146,76+field)*uiScale,DialogLayout::fit(DialogLayout::row(3)+textControlHeight)*uiScale};
 }
  void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"自定义网格设置");const char32_t* names[]={U"X 偏移",U"Y 偏移",U"宽度",U"高度"};for(int i=0;i<4;++i)font_.draw(g,names[i],r.x+6,DialogLayout::centeredInkY(font_,names[i],r.y+DialogLayout::row(i),textControlHeight),skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg)->scancode();if(key==ui::kKeyEsc){closeWindow(nullptr);return true;}if(key==ui::kKeyEnter){done();return true;}}return PixelPopupWindow::onProcessMessage(msg);}
 void smoke(bool apply){fields_[0]->setText("-3.8");fields_[1]->setText("4+2");fields_[2]->setText("0");fields_[3]->setText("7.9");for(int i=0;i<4;++i)commit(i);if(draft_!=GridSettings{-3,6,1,7})throw std::runtime_error("Grid draft normalization");if(apply)done_->Click();else cancel_->Click();}
};
}
