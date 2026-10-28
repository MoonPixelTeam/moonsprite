#pragma once
#include "native_widgets.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include "os/sampling.h"
#include <algorithm>
namespace moon {
// Native shell adaptation of useAppInformationDialogs.tsx about-v2.
class AboutRepositoryButton final:public PixelButton {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;
public:
 AboutRepositoryButton(const PixelFont& font,const Skin& skin,const Skin& icons,std::function<void()> action):PixelButton(font,skin,U"",std::move(action)),font_(font),skin_(skin),icons_(icons){}
 void onPaint(ui::PaintEvent& ev)override{
  PixelButton::onPaint(ev);auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());
  const std::u32string text=U"github.com/MoonPixelTeam/moonsprite";const int width=15+5+font_.measure(text)+5+13,x=r.x+(r.w-width)/2;
  icons_.draw(g,isEnabled()?"about-git-fork":"about-git-fork-disabled",{x,r.y+(r.h-15)/2,15,15},true);
  font_.draw(g,text,x+20,r.y+(r.h-PixelFont::cell)/2,skin_["text"]);
  icons_.draw(g,isEnabled()?"about-external-link":"about-external-link-disabled",{x+20+font_.measure(text)+5,r.y+(r.h-13)/2,13,13},true);
 }
};
class AboutDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;os::SurfaceRef logo_;
 PixelButton *done_,*headerClose_;AboutRepositoryButton* repository_;
 bool moving_=false;gfx::Point press_;gfx::Rect before_;
 std::vector<std::u32string> lines(const std::u32string& text,int width)const{
  std::vector<std::u32string> result;std::u32string row;
  for(const auto ch:text){auto next=row+ch;if(!row.empty()&&font_.measure(next)>std::max(1,width)){result.push_back(row);row.clear();}row+=ch;}
  if(!row.empty())result.push_back(row);return result;
 }
 int detailsTop(int width)const{return std::max(61,39+int(lines(description(),width-46).size())*12+6);}
 static std::u32string description(){return U"面向像素创作者的源码可见 Windows 绘画工作台，专注清晰、快速的像素级编辑体验。";}
 void drawRows(ui::Graphics& g,const std::u32string& text,int x,int y,int width)const{for(const auto& row:lines(text,width)){font_.draw(g,row,x,y,skin_["text"]);y+=12;}}
public:
 AboutDialog(const PixelFont& font,const Skin& skin,const Skin& icons,os::SurfaceRef logo,std::function<void()> openRepository):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),logo_(std::move(logo)){
  setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);
  done_=new PixelButton(font,skin,U"完成",[this]{closeWindow(nullptr);});addChild(done_);
  headerClose_=new PixelButton(font,skin,U"",[this]{closeWindow(nullptr);});headerClose_->iconSkin=&icons;headerClose_->icon="close";headerClose_->skinStyle="icon_button";addChild(headerClose_);
  repository_=new AboutRepositoryButton(font,skin,icons,std::move(openRepository));addChild(repository_);
 }
 gfx::Size minimumDialogSize(int physicalWidth)const override{
  const int width=std::max(250,font_.measure(U"github.com/MoonPixelTeam/moonsprite")+54);
  const int w=std::max(width,physicalWidth/uiScale);
  const int authorRows=int(lines(U"MoonPixel Studio & MoonSprite Contributors",w-72).size());
  return {width*uiScale,(detailsTop(w)+18*3+authorRows*12+6+52)*uiScale};
 }
 void onResize(ui::ResizeEvent& ev)override{
  setBoundsQuietly(ev.bounds());const auto r=bounds();
  done_->setBounds({r.x2()-62*uiScale,r.y2()-(textControlHeight+6)*uiScale,56*uiScale,textControlHeight*uiScale});
  layoutHeaderButton(headerClose_);
  repository_->setBounds({r.x+6*uiScale,r.y2()-52*uiScale,r.w-12*uiScale,textControlHeight*uiScale});
 }
 void paintDialogContents(ui::PaintEvent& ev)override{
  auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());
  drawDialogTitle(font_,g,r,U"关于 MoonSprite");
  if(logo_)g.drawSurface(logo_.get(),gfx::Rect(0,0,logo_->width(),logo_->height()),gfx::Rect(r.x+6,r.y+DialogLayout::bodyTop,28,28),os::Sampling(),nullptr);
  font_.draw(g,U"MoonSprite",r.x+40,r.y+DialogLayout::bodyTop,skin_["text"]);drawRows(g,description(),r.x+40,r.y+39,r.w-46);
  int y=r.y+detailsTop(r.w);auto detail=[&](const std::u32string& label,const std::u32string& value){font_.draw(g,label,r.x+6,y,skin_["text"]);const auto rows=lines(value,r.w-72);for(const auto& row:rows){font_.draw(g,row,r.x+64,y,skin_["text"]);y+=12;}y+=6;};
  detail(U"版本",U"Native - Development");detail(U"旧版基线",U"1.0.0-beta9");detail(U"作者",U"MoonPixel Studio & MoonSprite Contributors");detail(U"许可",U"MoonSprite 源码可见许可");
 }
 bool onProcessMessage(ui::Message* msg)override{
  if(processDialogGeometry(msg))return true;
  if(msg->type()==ui::kCloseMessage){moving_=false;if(hasCapture())releaseMouse();}
  if(msg->type()==ui::kKeyDownMessage){const auto code=static_cast<ui::KeyMessage*>(msg)->scancode();if(code==ui::kKeyEsc){closeWindow(nullptr);return true;}}
  if(msg->type()==ui::kMouseDownMessage&&!msg->fromFilter()){auto m=static_cast<ui::MouseMessage*>(msg);auto p=uiLocalPoint(m->position(),bounds().origin());if(m->left()&&p.y<20){moving_=true;press_=m->position();before_=bounds();captureMouse();return true;}}
  if(msg->type()==ui::kMouseMoveMessage&&moving_&&hasCapture()){setBounds(gfx::Rect(before_).offset(static_cast<ui::MouseMessage*>(msg)->position()-press_));return true;}
  if(msg->type()==ui::kMouseUpMessage&&moving_){moving_=false;if(hasCapture())releaseMouse();return true;}
  return PixelPopupWindow::onProcessMessage(msg);
 }
 void smokeRepository(){repository_->Click();}
 void smokeDone(){done_->Click();}
 void smokeHeaderClose(){headerClose_->Click();}
};
}
