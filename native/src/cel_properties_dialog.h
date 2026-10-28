#pragma once
#include "native_widgets.h"
#include "ui/popup_window.h"
#include "ui/resize_event.h"
#include "ui/message.h"
namespace moon {
class CelPropertiesDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;PixelSlider* opacity_;PixelEntry* z_;PixelButton *close_,*headerClose_;int zIndex_;std::function<void(double,int)> changed_;
 void previewZ(){try{std::size_t used=0;auto v=std::stod(z_->text(),&used);if(used!=z_->text().size()||!std::isfinite(v))return;zIndex_=int(std::clamp(std::trunc(v),-999.,999.));changed_(opacity_->value/100.,zIndex_);}catch(const std::invalid_argument&){}catch(const std::out_of_range&){} }
public:
 CelPropertiesDialog(const PixelFont& font,const Skin& skin,const Skin& icons,double opacity,int z,std::function<void(double,int)> changed):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),zIndex_(z),changed_(std::move(changed)){
  setAutoRemap(false);setWantFocus(true);opacity_=new PixelSlider(font,skin);opacity_->value=int(std::floor(opacity*100+.5));opacity_->changed=[this](int value){changed_(value/100.,zIndex_);};addChild(opacity_);
  z_=new PixelEntry(font,skin);z_->numeric=true;z_->setText(std::to_string(z));z_->Change.connect([this]{previewZ();});z_->blur=[this]{previewZ();z_->setText(std::to_string(zIndex_));};z_->wheel=[this](int delta){z_->setText(std::to_string(std::clamp(zIndex_+delta,-999,999)));previewZ();};z_->accept=z_->cancel=[this]{previewZ();closeWindow(nullptr);};addChild(z_);
  close_=new PixelButton(font,skin,U"关闭",[this]{previewZ();closeWindow(nullptr);});addChild(close_);headerClose_=new PixelButton(font,skin,U"",[this]{previewZ();closeWindow(nullptr);});headerClose_->iconSkin=&icons;headerClose_->icon="close";headerClose_->skinStyle="icon_button";addChild(headerClose_);
 }
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());auto r=bounds();opacity_->setBounds({r.x+6*uiScale,r.y+DialogLayout::field()*uiScale,r.w-12*uiScale,textControlHeight*uiScale});z_->setBounds({r.x+6*uiScale,r.y+DialogLayout::field(1)*uiScale,r.w-12*uiScale,textControlHeight*uiScale});close_->setBounds({r.x2()-61*uiScale,r.y2()-(textControlHeight+6)*uiScale,55*uiScale,textControlHeight*uiScale});layoutHeaderButton(headerClose_);}
  gfx::Size minimumDialogSize(int)const override{return {std::max(146,font_.measure(U"单元格属性")+32)*uiScale,DialogLayout::fit(DialogLayout::field(1)+textControlHeight)*uiScale};}
  void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"单元格属性");font_.draw(g,U"不透明度",r.x+6,r.y+DialogLayout::label(),skin_["text"]);font_.draw(g,U"Z 顺序",r.x+6,r.y+DialogLayout::label(1),skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage){auto code=static_cast<ui::KeyMessage*>(msg)->scancode();if(code==ui::kKeyEsc||code==ui::kKeyEnter){previewZ();closeWindow(nullptr);return true;}}return PixelPopupWindow::onProcessMessage(msg);}
 void smoke(){opacity_->value=37;opacity_->changed(37);z_->setText("-1001");previewZ();if(zIndex_!=-999)throw std::runtime_error("Cel Z clamp");z_->setText("24");previewZ();}
};
}
