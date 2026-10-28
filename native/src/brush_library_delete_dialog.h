#pragma once
#include "native_widgets.h"
#include "ui/message.h"
#include "ui/resize_event.h"
namespace moon {
// Legacy useBrushLibrary requestDialog: explicit cancel/delete; no mutation here.
class BrushLibraryDeleteDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;std::u32string message_;bool accepted_=false;PixelButton *cancel_,*remove_,*headerClose_;
 std::vector<std::u32string> lines(int width)const{std::vector<std::u32string> result;std::u32string line;for(auto c:message_){auto next=line+c;if(!line.empty()&&font_.measure(next)>width){result.push_back(line);line.clear();}line+=c;}if(!line.empty())result.push_back(line);return result;}
public:
 BrushLibraryDeleteDialog(const PixelFont& font,const Skin& skin,const Skin& icons,std::u32string label):PixelDialog(skin,""),font_(font),skin_(skin),message_(U"确定删除“"+label+U"”吗？"){
  setAutoRemap(false);setWantFocus(true);cancel_=new PixelButton(font,skin,U"取消",[this]{closeWindow(nullptr);});remove_=new PixelButton(font,skin,U"删除",[this]{accepted_=true;closeWindow(nullptr);});headerClose_=new PixelButton(font,skin,U"",[this]{closeWindow(nullptr);});headerClose_->iconSkin=&icons;headerClose_->icon="close";headerClose_->skinStyle="icon_button";addChild(cancel_);addChild(remove_);addChild(headerClose_);
 }
 bool accepted()const{return accepted_;}
 gfx::Size minimumDialogSize(int physicalWidth)const override{const int width=std::max(280,physicalWidth/uiScale),rows=int(lines(width-2*DialogLayout::inset).size());return {280*uiScale,DialogLayout::fit(DialogLayout::bodyTop+rows*(UiSpacing::labelHeight+UiSpacing::related)+UiSpacing::group+UiSpacing::labelHeight)*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int y=r.y+DialogLayout::footer(r.h/uiScale)*uiScale;remove_->setBounds({r.x2()-(DialogLayout::inset+54)*uiScale,y,54*uiScale,textControlHeight*uiScale});cancel_->setBounds({remove_->bounds().x-(54+UiSpacing::related)*uiScale,y,54*uiScale,textControlHeight*uiScale});layoutHeaderButton(headerClose_);}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"删除笔刷");int y=r.y+DialogLayout::bodyTop;for(const auto& line:lines(r.w-2*DialogLayout::inset)){font_.draw(g,line,r.x+DialogLayout::inset,y,skin_["text"]);y+=UiSpacing::labelHeight+UiSpacing::related;}font_.draw(g,U"删除后无法从 MoonSprite 中恢复。",r.x+DialogLayout::inset,y+UiSpacing::group,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(msg);}
 void smoke(int choice){if(choice==2)remove_->Click();else if(choice==3)headerClose_->Click();else if(choice==1){ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&key);}else cancel_->Click();}
};
}
