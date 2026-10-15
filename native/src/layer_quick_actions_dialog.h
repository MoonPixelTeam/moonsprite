#pragma once
#include "layer_quick_actions.h"
#include "native_widgets.h"
#include "ui_scale.h"
#include "ui/popup_window.h"
#include "ui/resize_event.h"
#include "ui/message.h"
#include "ui/display.h"
#include <stdexcept>
namespace moon {
// Legacy LayerSettingsEditor.tsx quick-actions subdialog only. Unsupported
// actions remain in the model and order; native migration gaps are read-only.
class LayerQuickActionList final:public ui::Widget {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;
 layerquick::Actions& actions_;std::function<bool(const std::string&)> connected_;
 ui::Timer timer_{16,this};std::string dragged_;gfx::Point pointer_;int scroll_=0;
 PixelScrollBar* bar_;std::function<void()> changed_;
 int checkboxHover_=-1,checkboxPress_=-1;
 public: std::function<void(std::u32string)> hint;
 private:
 int page()const{return std::max(0,bounds().h/uiScale);}
 int maximum()const{return std::max(0,int(actions_.size())*20-page());}
 int rowAt(gfx::Point p)const {if(!bounds().contains(p)||p.x>=bounds().x2()-8*uiScale)return -1;const int i=((p.y-bounds().y)/uiScale+scroll_)/20;return i<int(actions_.size())?i:-1;}
 void setScroll(int value){scroll_=std::clamp(value,0,maximum());bar_->configure(int(actions_.size())*20,page(),scroll_);invalidate();}
 void reorderAt(gfx::Point p){const int target=rowAt(p);if(target<0||dragged_.empty())return;const bool after=(p.y-bounds().y)/uiScale+scroll_>=target*20+10;const auto id=actions_[target].id;if(layerquick::reorder(actions_,dragged_,id,after)){changed_();invalidate();}}
public:
 LayerQuickActionList(const PixelFont& font,const Skin& skin,const Skin& icons,layerquick::Actions& actions,std::function<bool(const std::string&)> connected,std::function<void()> changed):ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),icons_(icons),actions_(actions),connected_(std::move(connected)),changed_(std::move(changed)){
  bar_=new PixelScrollBar(skin,true);addChild(bar_);bar_->wheelStep=20;bar_->changed=[this](int value){setScroll(value);};timer_.Tick.connect([this]{edgeTick();});
 }
 ~LayerQuickActionList(){endDrag();}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());bar_->setBounds({bounds().x2()-8*uiScale,bounds().y,8*uiScale,bounds().h});setScroll(scroll_);}
 void endDrag(){timer_.stop();dragged_.clear();if(hasCapture())releaseMouse();invalidate();}
 void edgeTick(){if(dragged_.empty()||!hasCapture()){endDrag();return;}const auto p=uiLocalPoint(pointer_,bounds().origin());const int direction=layerquick::edgeDirection(p.x,p.y,0,0,bounds().w/uiScale-8,page());if(direction){setScroll(scroll_+direction*12);reorderAt(pointer_);}}
 void onPaint(ui::PaintEvent& ev)override{
  auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());g.fillRect(skin_["background"],r);g.saveClip();g.clipRect({r.x,r.y,std::max(0,r.w-8),r.h});
  for(int i=0;i<int(actions_.size());++i){int y=r.y+i*20-scroll_;if(y+20<=r.y||y>=r.y2())continue;const auto& a=actions_[i];const auto m=layerquick::find(a.id);const bool connected=connected_(a.id),available=a.enabled||(connected&&layerquick::count(actions_)<layerquick::limit);if(a.id==dragged_)g.fillRect(skin_["panel"],{r.x,y,r.w-8,20});icons_.draw(g,"move",{r.x+3,y+4,11,11},true);icons_.draw(g,m->icon,{r.x+19,y+4,11,11},true,connected?255:96);g.saveClip();g.clipRect({r.x+34,y,r.w-65,20});font_.draw(g,m->label,r.x+34,y+5,skin_[connected?"text":"muted"]);g.restoreClip();skin_.drawCheckbox(g,{r.x+r.w-28,y+2,20,16},a.enabled,checkboxHover_==i,checkboxPress_==i && checkboxHover_==i,available);}
  g.restoreClip();
 }
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->type()==ui::kMouseLeaveMessage || msg->type()==ui::kFocusLeaveMessage){checkboxHover_=-1;if(msg->type()==ui::kFocusLeaveMessage){checkboxPress_=-1;if(dragged_.empty()&&hasCapture())releaseMouse();}invalidate();}
  if(msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage){const auto point=static_cast<ui::MouseMessage*>(msg)->position();const int row=rowAt(point);const int next=point.x>=bounds().x2()-28*uiScale?row:-1;if(next!=checkboxHover_){checkboxHover_=next;invalidate();}}
  if(msg->type()==ui::kMouseUpMessage && checkboxPress_>=0){const int row=checkboxPress_;checkboxPress_=-1;if(hasCapture())releaseMouse();const auto point=static_cast<ui::MouseMessage*>(msg)->position();if(rowAt(point)==row && point.x>=bounds().x2()-28*uiScale){const auto id=actions_[row].id;if(layerquick::toggle(actions_,id,!actions_[row].enabled,connected_))changed_();}invalidate();return true;}
  if(!dragged_.empty()&&msg->type()==ui::kFocusLeaveMessage){endDrag();return false;}
  if(msg->type()==ui::kMouseWheelMessage){auto m=static_cast<ui::MouseMessage*>(msg);setScroll(scroll_+m->wheelDelta().y*20);return true;}
  if(msg->type()==ui::kMouseDownMessage){auto m=static_cast<ui::MouseMessage*>(msg);if(!m->left())return false;const int i=rowAt(m->position());if(i<0)return false;const auto p=uiLocalPoint(m->position(),bounds().origin());if(p.x<17){endDrag();dragged_=actions_[i].id;pointer_=m->position();requestFocus();captureMouse();timer_.start();invalidate();return true;}if(p.x>=bounds().w/uiScale-28){checkboxHover_=checkboxPress_=i;captureMouse();invalidate();return true;}return true;}
  if(msg->type()==ui::kMouseMoveMessage&&!dragged_.empty()){if(!hasCapture()){endDrag();return false;}pointer_=static_cast<ui::MouseMessage*>(msg)->position();reorderAt(pointer_);return true;}
  if(msg->type()==ui::kMouseMoveMessage&&dragged_.empty()){const int i=rowAt(static_cast<ui::MouseMessage*>(msg)->position());if(hint)hint(i>=0&&!connected_(actions_[i].id)?U"未迁移；已启用项可关闭":U"");}
  if(msg->type()==ui::kMouseUpMessage&&!dragged_.empty()){endDrag();return true;}
  return ui::Widget::onProcessMessage(msg);
 }
 void smoke(){
  const auto original=actions_;const auto first=actions_.front().id;auto point=bounds().origin()+gfx::Point(5*uiScale,5*uiScale);ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);down.setDisplay(display());onProcessMessage(&down);if(!hasCapture()||dragged_!=first)throw std::runtime_error("Quick actions drag capture");
  point.y=bounds().y+35*uiScale;ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);onProcessMessage(&move);if(actions_[1].id!=first||!hasCapture())throw std::runtime_error("Quick actions live reorder loses capture");pointer_={bounds().x+5*uiScale,bounds().y2()-1};edgeTick();if(scroll_!=12)throw std::runtime_error("Quick actions edge scroll");ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);onProcessMessage(&up);if(hasCapture()||!dragged_.empty()||timer_.isRunning())throw std::runtime_error("Quick actions capture release");actions_=original;setScroll(0);changed_();
 }
};
class LayerQuickActionsDialog final:public PixelPopupWindow {
 const PixelFont& font_;const Skin& skin_;layerquick::Actions& actions_;
 LayerQuickActionList* list_;PixelButton *close_,*headerClose_,*reset_;std::function<void()> changed_;
 std::u32string error_,hint_;int drag_=0;gfx::Point start_;gfx::Rect original_;
public:
 LayerQuickActionsDialog(const PixelFont& font,const Skin& skin,const Skin& icons,layerquick::Actions& actions,std::function<bool(const std::string&)> connected,std::function<void()> changed):PixelPopupWindow("",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),actions_(actions),changed_(std::move(changed)){
  setAutoRemap(false);setWantFocus(true);list_=new LayerQuickActionList(font,skin,icons,actions,std::move(connected),[this]{changed_();invalidate();});addChild(list_);list_->hint=[this](std::u32string text){if(hint_!=text){hint_=std::move(text);invalidate();}};close_=new PixelButton(font,skin,U"关闭",[this]{list_->endDrag();closeWindow(nullptr);});addChild(close_);headerClose_=new PixelButton(font,skin,U"",[this]{list_->endDrag();closeWindow(nullptr);});headerClose_->iconSkin=&icons;headerClose_->icon="close";headerClose_->skinStyle="icon_button";addChild(headerClose_);reset_=new PixelButton(font,skin,U"重置",[this]{list_->endDrag();actions_=layerquick::normalize({});changed_();list_->invalidate();invalidate();});reset_->iconSkin=&icons;reset_->icon="restore";reset_->iconWithCaption=true;addChild(reset_);
 }
 ~LayerQuickActionsDialog(){list_->endDrag();}
 void setError(std::u32string text){error_=std::move(text);invalidate();}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();list_->setBounds({r.x+6*uiScale,r.y+49*uiScale,r.w-12*uiScale,std::max(20*uiScale,r.h-100*uiScale)});close_->setBounds({r.x2()-61*uiScale,r.y2()-24*uiScale,55*uiScale,18*uiScale});reset_->setBounds({r.x+6*uiScale,r.y2()-24*uiScale,55*uiScale,18*uiScale});headerClose_->setBounds({r.x2()-20*uiScale,r.y+3*uiScale,15*uiScale,16*uiScale});}
 void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());g.fillRect(skin_["panel"],r);skin_.draw(g,"panel_outer",r);font_.draw(g,U"快捷操作",r.x+6,r.y+6,skin_["text"]);font_.draw(g,U"选择至多 5 个图层快捷操作",r.x+6,r.y+23,skin_["text"]);font_.draw(g,unicodeText(std::to_string(layerquick::count(actions_))+" / 5"),r.x+6,r.y+36,skin_["text"]);font_.draw(g,error_.empty()?(hint_.empty()?U"更改即时生效":hint_):error_,r.x+6,r.y2()-41,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->type()==ui::kCloseMessage){list_->endDrag();drag_=0;if(hasCapture())releaseMouse();}
  if(msg->type()==ui::kMouseLeaveMessage)return true;
  if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){list_->endDrag();closeWindow(nullptr);return true;}
  if(msg->type()==ui::kFocusLeaveMessage){list_->endDrag();drag_=0;if(hasCapture())releaseMouse();}
  if(msg->type()==ui::kMouseDownMessage && !msg->fromFilter()){auto m=static_cast<ui::MouseMessage*>(msg);if(m->left()){const auto p=uiLocalPoint(m->position(),bounds().origin());drag_=p.x>=bounds().w/uiScale-5&&p.y>=bounds().h/uiScale-5?2:p.y<20?1:0;if(drag_){start_=m->position();original_=bounds();captureMouse();return true;}}}
  if(msg->type()==ui::kMouseMoveMessage&&drag_&&hasCapture()){auto p=static_cast<ui::MouseMessage*>(msg)->position()-start_;auto r=original_;if(drag_==1)r.offset(p);else{r.w=std::clamp(r.w+p.x,340,640);r.h=std::clamp(r.h+p.y,360,760);}setBounds(r);return true;}
  if(msg->type()==ui::kMouseUpMessage&&drag_){drag_=0;if(hasCapture())releaseMouse();return true;}return ui::PopupWindow::onProcessMessage(msg);
 }
 void smoke(){list_->smoke();}
};
}
