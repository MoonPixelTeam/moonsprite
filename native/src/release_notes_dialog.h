#pragma once
#include "help_dialog.h"
#include "release_notes.h"
namespace moon {
class ReleaseNotesDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;const releases::Definition& release_;int language_;HelpPane* body_;PixelButton *done_,*close_;
 std::u32string text(const char32_t* zh,const char32_t* en)const{return language_?en:zh;}
public:
 ReleaseNotesDialog(const PixelFont& font,const Skin& skin,const Skin& icons,const releases::Definition& release,int language=0):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),release_(release),language_(language==0?0:1){setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);body_=new HelpPane(font,skin);addChild(body_);
 std::vector<HelpPane::Block> blocks;
 blocks.push_back({text(U"原生开发版 · 以下为旧版发行说明",U"Native development build · Legacy release notes"),-1,true});blocks.push_back({text(U"旧版版本：",U"Legacy version: ")+unicodeText(release_.version)});blocks.push_back({unicodeText(release_.publishedAt),-1,true});blocks.push_back({release_.summary[language_]});
 for(const auto& section:release_.sections){blocks.push_back({section.title[language_]+U" · "+unicodeText(std::to_string(section.items.size()))+text(U" 项更新",U" updates"),-1,true});for(const auto& item:section.items)blocks.push_back({item[language_]});}body_->setBlocks(std::move(blocks));
 done_=new PixelButton(font,skin,text(U"完成",U"Done"),[this]{closeWindow(nullptr);});addChild(done_);close_=new PixelButton(font,skin,U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";addChild(close_);}
 gfx::Size minimumDialogSize(int)const override{return {360*uiScale,220*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale;layoutHeaderButton(close_);const int footer=DialogLayout::footer(h);body_->setBounds(uiPhysical({6,DialogLayout::bodyTop,w-12,std::max(1,footer-6-DialogLayout::bodyTop)}).offset(r.origin()));done_->setBounds(uiPhysical({w-62,footer,56,textControlHeight}).offset(r.origin()));}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);drawDialogTitle(font_,g,uiLogical(clientBounds()),text(U"更新日志 · 旧版历史",U"Release notes · Legacy history"));}
 bool onProcessMessage(ui::Message* msg)override{if(processDialogGeometry(msg))return true;if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(msg);}
 std::string version()const{return release_.version;}int itemCount()const{int count=0;for(const auto& section:release_.sections)count+=int(section.items.size());return count;}void focusContent(){body_->requestFocus();}int scroll()const{return body_->scroll();}
 void smokeScroll(){ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyPageDown,ui::kKeyNoneModifier,0,0);body_->onProcessMessage(&key);}void smokeDone(){done_->Click();}void smokeClose(){close_->Click();}
};
}