#pragma once
#include "native_widgets.h"
#include "ui/message.h"
#include "ui/resize_event.h"
namespace moon {
// Legacy useBrushLibrary requestDialog: explicit cancel/delete; no mutation here.
class BrushLibraryDeleteDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;std::u32string message_,title_,detail_;bool accepted_=false;PixelButton *cancel_,*remove_,*headerClose_;
 std::vector<std::u32string> lines(const std::u32string& value,int width)const{std::vector<std::u32string> result;std::u32string line;for(auto c:value){if(c==U'\n'){result.push_back(line);line.clear();continue;}auto next=line+c;if(!line.empty()&&font_.measure(next)>width){result.push_back(line);line.clear();}line+=c;}if(!line.empty())result.push_back(line);return result;}
public:
 BrushLibraryDeleteDialog(const PixelFont& font,const Skin& skin,const Skin& icons,std::u32string label,std::u32string title=U"删除笔刷",std::u32string detail=U"删除后无法从 MoonSprite 中恢复。"):PixelDialog(skin,""),font_(font),skin_(skin),message_(U"确定删除“"+label+U"”吗？"),title_(std::move(title)),detail_(std::move(detail)){
  setAutoRemap(false);setWantFocus(true);cancel_=new PixelButton(font,skin,U"取消",[this]{closeWindow(nullptr);});remove_=new PixelButton(font,skin,U"删除",[this]{accepted_=true;closeWindow(nullptr);});headerClose_=new PixelButton(font,skin,U"",[this]{closeWindow(nullptr);});headerClose_->iconSkin=&icons;headerClose_->icon="close";headerClose_->skinStyle="icon_button";addChild(cancel_);addChild(remove_);addChild(headerClose_);
 }
 bool accepted()const{return accepted_;}
 gfx::Size minimumDialogSize(int physicalWidth)const override{const int width=std::max(280,physicalWidth/uiScale),rows=int(lines(message_,width-2*DialogLayout::inset).size()),detailRows=int(lines(detail_,width-2*DialogLayout::inset).size());return {280*uiScale,DialogLayout::fit(DialogLayout::bodyTop+rows*(UiSpacing::labelHeight+UiSpacing::related)+UiSpacing::group+detailRows*(UiSpacing::labelHeight+UiSpacing::related))*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int y=r.y+DialogLayout::footer(r.h/uiScale)*uiScale;remove_->setBounds({r.x2()-(DialogLayout::inset+54)*uiScale,y,54*uiScale,textControlHeight*uiScale});cancel_->setBounds({remove_->bounds().x-(54+UiSpacing::related)*uiScale,y,54*uiScale,textControlHeight*uiScale});layoutHeaderButton(headerClose_);}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,title_);int y=r.y+DialogLayout::bodyTop;for(const auto& line:lines(message_,r.w-2*DialogLayout::inset)){font_.draw(g,line,r.x+DialogLayout::inset,y,skin_["text"]);y+=UiSpacing::labelHeight+UiSpacing::related;}y+=UiSpacing::group;for(const auto& line:lines(detail_,r.w-2*DialogLayout::inset)){font_.draw(g,line,r.x+DialogLayout::inset,y,skin_["text"]);y+=UiSpacing::labelHeight+UiSpacing::related;}}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(msg);}
 void smoke(int choice){if(choice==2)remove_->Click();else if(choice==3)headerClose_->Click();else if(choice==1){ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&key);}else cancel_->Click();}
};
}
