#pragma once
#include "history_list.h"
#include "ui_scale.h"
#include "ui/resize_event.h"
#include "ui/message.h"
#include <windows.h>
namespace moon {
inline std::wstring historyWide(const std::u32string& text){const auto utf8=utf8Text(text);if(utf8.empty())return {};const int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,utf8.data(),int(utf8.size()),nullptr,0);if(n<=0)return {};std::wstring result(n,0);MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,utf8.data(),int(utf8.size()),result.data(),n);return result;}
inline bool historySearchMatches(const std::u32string& label,std::u32string query){const auto a=query.find_first_not_of(U" \t\r\n"),b=query.find_last_not_of(U" \t\r\n");if(a==std::u32string::npos)return true;query=query.substr(a,b-a+1);const auto hay=historyWide(label),needle=historyWide(query);return FindNLSStringEx(L"zh-CN",FIND_FROMSTART|NORM_IGNORECASE,hay.data(),int(hay.size()),needle.data(),int(needle.size()),nullptr,nullptr,nullptr,0)>=0;}
class HistorySearchEntry:public PixelEntry {
 const PixelFont& font_;const Skin& skin_;
public:HistorySearchEntry(const PixelFont& f,const Skin& s):PixelEntry(f,s),font_(f),skin_(s){}
 void onPaint(ui::PaintEvent& ev)override{PixelEntry::onPaint(ev);if(text().empty()){auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());font_.draw(g,U"搜索操作类型",r.x+6,DialogLayout::centeredInkY(font_,U"搜索操作类型",r.y,r.h),skin_["muted"]);}}
};
class HistoryDisplayDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;std::vector<HistoryDisplayOption> options_;std::vector<std::u32string>& hidden_;std::function<std::u32string()> save_;HistorySearchEntry* search_;HistoryList* list_;PixelButton *show_,*hide_,*done_,*headerClose_;std::u32string error_;std::size_t matched_=0;
 void apply(){error_=save_?save_():U"";syncRows();}
public:
 HistoryDisplayDialog(const PixelFont& font,const Skin& skin,const Skin& icons,std::vector<HistoryDisplayOption> options,std::vector<std::u32string>& hidden,std::function<std::u32string()> save):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),options_(std::move(options)),hidden_(hidden),save_(std::move(save)){
  setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);std::stable_sort(options_.begin(),options_.end(),[](const auto& a,const auto& b){const auto x=historyWide(a.label),y=historyWide(b.label);return CompareStringEx(L"zh-CN",0,x.data(),int(x.size()),y.data(),int(y.size()),nullptr,nullptr,0)==CSTR_LESS_THAN;});search_=new HistorySearchEntry(font,skin);addChild(search_);search_->Change.connect([this]{syncRows();});list_=new HistoryList(font,skin,true);list_->emptyText=U"没有匹配的操作类型";addChild(list_);list_->selected=[this](std::size_t index){if(index>=options_.size())return;const auto id=options_[index].id;const auto at=std::find(hidden_.begin(),hidden_.end(),id);if(at==hidden_.end())hidden_.push_back(id);else hidden_.erase(at);apply();};auto button=[&](std::u32string title,std::function<void()> action){auto b=new PixelButton(font,skin,std::move(title),std::move(action));addChild(b);return b;};show_=button(U"全部显示",[this]{hidden_.clear();apply();});hide_=button(U"全部隐藏",[this]{hidden_.clear();for(const auto& option:options_)hidden_.push_back(option.id);apply();});done_=button(U"关闭",[this]{closeWindow(nullptr);});headerClose_=button(U"",[this]{closeWindow(nullptr);});headerClose_->iconSkin=&icons;headerClose_->icon="close";headerClose_->skinStyle="icon_button";syncRows();
 }
 void syncRows(){std::vector<HistoryListRow> rows;const auto query=unicodeText(search_->text());for(std::size_t i=0;i<options_.size();++i)if(historySearchMatches(options_[i].label,query)){const auto& o=options_[i];rows.push_back({i,o.label,false,false,std::find(hidden_.begin(),hidden_.end(),o.id)==hidden_.end()});}matched_=rows.size();list_->setRows(std::move(rows));invalidate();}
 void smokeFilter(const std::string& query){search_->setText(query);syncRows();}
 HistoryList& listView(){return *list_;}
 void smokeShowAll(){hidden_.clear();apply();}
 void smokeHideAll(){hidden_.clear();for(const auto& row:options_)hidden_.push_back(row.id);apply();}
 gfx::Size minimumDialogSize(int)const override{return {270*uiScale,250*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale;auto place=[&](ui::Widget* c,gfx::Rect b){c->setBounds(uiPhysical(b).offset(r.origin()));};layoutHeaderButton(headerClose_);place(search_,{6,DialogLayout::bodyTop+26,w-12,textControlHeight});place(show_,{6,DialogLayout::bodyTop+48,(w-14)/2,textControlHeight});place(hide_,{8+(w-14)/2,DialogLayout::bodyTop+48,(w-14)/2,textControlHeight});place(list_,{6,DialogLayout::bodyTop+84,w-12,std::max(0,DialogLayout::footer(h)-UiSpacing::group-(error_.empty()?0:12)-(DialogLayout::bodyTop+84))});place(done_,{w-61,DialogLayout::footer(h),55,textControlHeight});}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"历史显示设置");font_.draw(g,U"选择要在历史面板显示的操作类型",r.x+6,r.y+DialogLayout::bodyTop,skin_["text"]);font_.draw(g,U"更改即时生效，隐藏不影响撤销和重做",r.x+6,r.y+DialogLayout::bodyTop+12,skin_["muted"]);std::size_t shown=0;for(const auto& o:options_)if(std::find(hidden_.begin(),hidden_.end(),o.id)==hidden_.end())++shown;font_.draw(g,unicodeText(std::to_string(shown)+" / "+std::to_string(options_.size())),r.x+6,r.y+DialogLayout::bodyTop+70,skin_["text"]);if(!error_.empty())font_.draw(g,error_,r.x+6,r.y+DialogLayout::footer(r.h)-12,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(processDialogGeometry(msg))return true;if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(msg);}
};
}
