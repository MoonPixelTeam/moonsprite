#pragma once
#include "native_widgets.h"
#include "project_backup.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include <ctime>
#include <sstream>
#include <iomanip>
namespace moon {
class ProjectRollbackRows final:public ui::Widget {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;PixelScrollBar* bar_;std::vector<project::BackupRecord> rows_;int scroll_=0,pressed_=-1;bool busy_=false;
 int maximum()const{return std::max(0,int(rows_.size())*40*uiScale-bounds().h);}
 int actionAt(gfx::Point p)const{const auto r=bounds();if(busy_||!r.contains(p)||p.x<r.x2()-55*uiScale||p.x>=r.x2()-8*uiScale)return -1;const int i=(p.y-r.y+scroll_)/(40*uiScale);const int y=r.y+i*40*uiScale-scroll_;return i>=0&&i<int(rows_.size())&&p.y>=y+9*uiScale&&p.y<y+29*uiScale?i:-1;}
 void configure(){scroll_=std::clamp(scroll_,0,maximum());bar_->setVisible(maximum()>0);bar_->setBounds({bounds().x2()-7*uiScale,bounds().y,7*uiScale,bounds().h});bar_->configure(int(rows_.size())*40*uiScale,bounds().h,scroll_);}
public:
 std::function<void(std::size_t)> restore;std::u32string message;
 ProjectRollbackRows(const PixelFont& f,const Skin& s,const Skin& icons):ui::Widget(ui::kGenericWidget),font_(f),skin_(s),icons_(icons){bar_=new PixelScrollBar(s,true);addChild(bar_);bar_->changed=[this](int value){scroll_=value;configure();invalidate();};}
 void setRows(std::vector<project::BackupRecord> rows){rows_=std::move(rows);scroll_=0;configure();invalidate();}
 void setBusy(bool v){busy_=v;bar_->setEnabled(!v);invalidate();}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());configure();}
 bool onProcessMessage(ui::Message* m)override{
  if(m->type()==ui::kMouseWheelMessage&&!busy_){scroll_+=static_cast<ui::MouseMessage*>(m)->wheelDelta().y*40*uiScale;configure();invalidate();return true;}
  if(m->type()==ui::kMouseDownMessage&&static_cast<ui::MouseMessage*>(m)->left()){pressed_=actionAt(static_cast<ui::MouseMessage*>(m)->position());if(pressed_>=0){captureMouse();invalidate();return true;}}
  if(m->type()==ui::kMouseUpMessage&&hasCapture()){releaseMouse();const int p=pressed_;pressed_=-1;invalidate();if(p>=0&&p==actionAt(static_cast<ui::MouseMessage*>(m)->position())&&restore)restore(std::size_t(p));return true;}
  return ui::Widget::onProcessMessage(m);
 }
 void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());skin_.draw(g,"panel_content",r);g.saveClip();g.clipRect({r.x,r.y,std::max(0,r.w-8),r.h});if(rows_.empty())font_.draw(g,message,r.x+3,r.y+6,skin_["muted"]);for(int i=std::max(0,scroll_/(40*uiScale));i<int(rows_.size());++i){const int y=r.y+i*40-scroll_/uiScale;if(y>=r.y2())break;const auto& row=rows_[i];icons_.draw(g,"restore",{r.x+3,y+3,15,15},true);font_.draw(g,unicodeText("存档 "+std::to_string(rows_.size()-i)),r.x+20,y+4,skin_["text"]);const std::time_t stamp=std::time_t(row.modifiedMs/1000);std::tm local{};localtime_s(&local,&stamp);std::ostringstream text;text<<std::put_time(&local,"%Y-%m-%d %H:%M:%S")<<"  "<<row.size<<" B";font_.draw(g,unicodeText(text.str()),r.x+3,y+23,skin_["muted"]);gfx::Rect action{r.x2()-55,y+9,47,textControlHeight};skin_.draw(g,busy_?"button.disabled":pressed_==i?"button.pressed":"button.normal",action);font_.draw(g,busy_?U"回档中":U"回档",action.x+6,DialogLayout::centeredInkY(font_,U"回档",action.y,action.h),skin_[busy_?"muted":"text"]);}g.restoreClip();}
};
class ProjectRollbackDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;ProjectRollbackRows* list_;PixelButton *refresh_,*close_,*header_;bool busy_=false;std::u32string state_;
public:
 std::function<void()> refreshRequested;std::function<void(std::size_t)> restoreRequested;
 ProjectRollbackDialog(const PixelFont& f,const Skin& s,const Skin& icons):PixelDialog(s,""),font_(f),skin_(s){setAutoRemap(false);setWantFocus(true);list_=new ProjectRollbackRows(f,s,icons);addChild(list_);list_->restore=[this](std::size_t i){if(!busy_&&restoreRequested)restoreRequested(i);};auto button=[&](std::u32string text,std::function<void()> action){auto b=new PixelButton(f,s,std::move(text),std::move(action));addChild(b);return b;};refresh_=button(U"刷新",[this]{if(!busy_&&refreshRequested)refreshRequested();});refresh_->iconSkin=&icons;refresh_->icon="refresh";close_=button(U"关闭",[this]{if(!busy_)closeWindow(nullptr);});header_=button(U"",[this]{if(!busy_)closeWindow(nullptr);});header_->iconSkin=&icons;header_->icon="close";header_->skinStyle="icon_button";list_->message=U"正在读取工程备份...";}
 void smokeRefresh(){refresh_->Click();}
 void smokeClose(){close_->Click();}
 const std::u32string& state()const{return state_;}
 void showRows(std::vector<project::BackupRecord> rows){list_->message=U"当前工程没有可用的备份版本。";list_->setRows(std::move(rows));}
 void setState(bool busy,std::u32string state){busy_=busy;state_=std::move(state);list_->setBusy(busy);refresh_->setEnabled(!busy);close_->setEnabled(!busy);header_->setEnabled(!busy);invalidate();}
 gfx::Size minimumDialogSize(int)const override{return {320*uiScale,220*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale;auto place=[&](ui::Widget* c,gfx::Rect b){c->setBounds(uiPhysical(b).offset(r.origin()));};layoutHeaderButton(header_);place(list_,{6,DialogLayout::bodyTop+30,w-12,std::max(0,DialogLayout::footer(h)-18-(DialogLayout::bodyTop+30))});place(refresh_,{6,DialogLayout::footer(h),70,textControlHeight});place(close_,{w-61,DialogLayout::footer(h),55,textControlHeight});}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"工程回档");font_.draw(g,U"选择保存前自动保留的工程版本。",r.x+6,r.y+DialogLayout::bodyTop,skin_["text"]);font_.draw(g,U"回档后仍可通过历史记录撤销。",r.x+6,r.y+DialogLayout::bodyTop+12,skin_["muted"]);g.saveClip();g.clipRect({r.x+6,r.y+DialogLayout::footer(r.h)-16,r.w-12,14});font_.draw(g,state_,r.x+6,r.y+DialogLayout::footer(r.h)-14,skin_["text"]);g.restoreClip();}
 bool onProcessMessage(ui::Message* m)override{if(!busy_&&processDialogGeometry(m))return true;if(m->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(m)->scancode()==ui::kKeyEsc){if(!busy_)closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(m);}
};
}
