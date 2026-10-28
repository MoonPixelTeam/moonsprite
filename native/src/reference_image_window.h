#pragma once
#include "reference_image_panel.h"
namespace moon {
class ReferenceImageWindow final:public PixelDialog {
 const PixelFont& font_;PixelButton* close_;ReferenceImagePanel* panel_;std::function<ReferenceSession&()> session_;std::string id_;bool closed_=false;
 void dismiss(){if(closed_)return;closed_=true;panel_->releaseDisplayCaches();session_().closeWindow(id_);closeWindow(nullptr);if(changed)changed();}
public:
 std::function<void()> changed;
 ReferenceImageWindow(const PixelFont& font,const Skin& skin,const Skin& icons,Document& document,std::function<ReferenceSession&()> session,const std::string& id)
 :PixelDialog(skin,"",ClickBehavior::DoNothingOnClick,EnterBehavior::DoNothingOnEnter),font_(font),session_(std::move(session)),id_(id){setAutoRemap(false);setWantFocus(true);close_=new PixelButton(font,skin,U"",[this]{dismiss();});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";addChild(close_);panel_=new ReferenceImagePanel(font,skin,icons,document,session_,id);addChild(panel_);}
 ReferenceImagePanel& panel(){return *panel_;}const std::string& id()const{return id_;}bool closed()const{return closed_;}
 gfx::Size minimumDialogSize(int)const override{return {150*uiScale,120*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layoutHeaderButton(close_);const auto r=bounds();const int top=FloatingColumnChrome::headerHeight+UiSpacing::related;panel_->setBounds({r.x+UiSpacing::related*uiScale,r.y+top*uiScale,std::max(0,r.w-2*UiSpacing::related*uiScale),std::max(0,r.h-(top+UiSpacing::related)*uiScale)});}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale paint(g);drawDialogTitle(font_,g,uiLogical(clientBounds()),U"参考图");}

};
}
