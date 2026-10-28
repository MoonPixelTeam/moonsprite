#pragma once
#include "native_widgets.h"
#include "release_notes.h"
#include "ui/message.h"
#include "ui/resize_event.h"
namespace moon {
class HomeAnnouncementButton final:public PixelButton {
 const releases::Definition& release_;int language_;bool summary_=false;
 std::u32string ellipsis(std::u32string value,int width)const{if(font_.measure(value)<=width)return value;while(!value.empty()&&font_.measure(value+U"…")>width)value.pop_back();return value.empty()?U"":value+U"…";}
 std::vector<std::u32string> lines(int width)const{std::vector<std::u32string> out;std::u32string line;for(const auto ch:release_.summary[language_]){if(!line.empty()&&font_.measure(line+ch)>width){out.push_back(line);line.clear();}line+=ch;}if(!line.empty())out.push_back(line);if(out.size()>3){out.resize(3);out.back()=ellipsis(out.back()+U"…",width);}return out;}
public:
 std::function<void(int)> wheel;std::function<void()> focused;
 HomeAnnouncementButton(const PixelFont& f,const Skin& s,const releases::Definition& release,int language,std::function<void()> action):PixelButton(f,s,U"",std::move(action)),release_(release),language_(language==0?0:1){}
 const std::string& version()const{return release_.version;}
 int preferredHeight(int width,bool summary)const{return std::max(42,22+(summary?int(lines(std::max(1,width-12)).size())*12+6:0));}
 void showSummary(bool value){summary_=value;}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kMouseWheelMessage&&wheel){wheel(static_cast<ui::MouseMessage*>(msg)->wheelDelta().y);return true;}if(msg->type()==ui::kFocusEnterMessage&&focused)focused();return PixelButton::onProcessMessage(msg);}
 void onPaint(ui::PaintEvent& ev)override{PixelButton::onPaint(ev);auto& g=*ev.graphics();PhysicalViewportClip viewportClip(g,paletteViewport?std::optional<gfx::Rect>(paletteViewport().offset(-bounds().origin())):std::nullopt);UiPaintScale scale(g);const auto r=uiLogical(clientBounds());g.saveClip();g.clipRect({r.x+3,r.y+3,std::max(0,r.w-6),std::max(0,r.h-6)});auto date=unicodeText(release_.publishedAt);for(auto& ch:date)if(ch==U'-')ch=U'/';const int dateWidth=font_.measure(date);const auto title=unicodeText(release_.version)+(language_?U" released":U" 已发布");font_.draw(g,ellipsis(title,std::max(1,r.w-12-6-dateWidth)),r.x+6,r.y+6,skin_[isEnabled()?"text":"muted"]);font_.draw(g,date,r.x2()-6-dateWidth,r.y+6,skin_["muted"]);if(summary_){int y=r.y+22;for(const auto& line:lines(std::max(1,r.w-12))){font_.draw(g,line,r.x+6,y,skin_["muted"]);y+=12;}}g.restoreClip();}
};
class HomeAnnouncementsPane final:public ui::Widget {
 const PixelFont& font_;const Skin& skin_;int language_;std::vector<std::size_t> releases_;std::vector<HomeAnnouncementButton*> cards_;PixelScrollBar* bar_;int offset_=0,total_=0,prefix_=0;bool summaries_=false,relayoutEnabled_=true;std::function<void()> relayout_;
 void scrollTo(int value){const int next=std::clamp(value,0,std::max(0,total_-bounds().h/uiScale));if(next==offset_)return;offset_=next;layoutCards();if(relayoutEnabled_&&relayout_)relayout_();invalidate();}
 void layoutCards(){const auto r=bounds();const int page=std::max(1,r.h/uiScale),width=std::max(1,r.w/uiScale-9);summaries_=page>300;int y=prefix_+30;for(auto card:cards_){const int h=card->preferredHeight(width,summaries_);card->showSummary(summaries_);card->paletteViewport=[this]{return bounds();};card->setBounds({r.x,r.y+(y-offset_)*uiScale,width*uiScale,h*uiScale});card->setVisible(isVisible()&&r.intersects(card->bounds()));card->setEnabled(isEnabled());y+=h+UiSpacing::related;}total_=y;bar_->setBounds({r.x2()-7*uiScale,r.y,7*uiScale,r.h});bar_->configure(total_,page,offset_);bar_->setVisible(isVisible()&&total_>page);bar_->setEnabled(isEnabled());}
public:
 HomeAnnouncementsPane(const PixelFont& f,const Skin& s,std::function<void(std::size_t)> open,std::function<void()> relayout,int language=0):ui::Widget(ui::kGenericWidget),font_(f),skin_(s),language_(language==0?0:1),releases_(releases::homeAnnouncements()),relayout_(std::move(relayout)){setTransparent(true);setFocusStop(true);bar_=new PixelScrollBar(s,true);addChild(bar_);bar_->wheelStep=36;bar_->changed=[this](int value){scrollTo(value);};for(std::size_t i=0;i<releases_.size();++i){auto card=new HomeAnnouncementButton(f,s,releases::all()[releases_[i]],language_,[open,index=releases_[i]]{open(index);});card->wheel=[this](int steps){scrollWheel(steps);};card->focused=[this,i]{ensureVisible(i);};cards_.push_back(card);addChild(card);}}
 void setRelayoutEnabled(bool value){relayoutEnabled_=value;}
 void configure(int prefix){prefix_=std::max(0,prefix);layoutCards();const int maximum=std::max(0,total_-bounds().h/uiScale);if(offset_>maximum){offset_=maximum;layoutCards();}}
 int offset()const{return offset_;}int maximum()const{return std::max(0,total_-bounds().h/uiScale);}bool summariesVisible()const{return summaries_;}std::size_t count()const{return cards_.size();}std::size_t releaseIndex(std::size_t slot)const{return releases_.at(slot);}const std::string& version(std::size_t slot)const{return cards_.at(slot)->version();}
 void scrollWheel(int steps){scrollTo(offset_+steps*36);}void scrollEnd(){scrollTo(maximum());}
 void ensureVisible(std::size_t slot){if(slot>=cards_.size())return;const auto r=bounds(),card=cards_[slot]->bounds();if(card.y<r.y)scrollTo(offset_+(card.y-r.y)/uiScale);else if(card.y2()>r.y2())scrollTo(offset_+(card.y2()-r.y2()+uiScale-1)/uiScale);}
 bool reachable(std::size_t slot)const{return slot<cards_.size()&&bounds().intersects(cards_[slot]->bounds())&&cards_[slot]->isVisible();}
 void smokeClick(std::size_t slot){ensureVisible(slot);cards_.at(slot)->Click();}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layoutCards();}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kMouseWheelMessage){scrollWheel(static_cast<ui::MouseMessage*>(msg)->wheelDelta().y);return true;}if(msg->type()==ui::kKeyDownMessage){const auto code=static_cast<ui::KeyMessage*>(msg)->scancode();if(code==ui::kKeyUp||code==ui::kKeyDown||code==ui::kKeyPageUp||code==ui::kKeyPageDown){scrollTo(offset_+(code==ui::kKeyUp||code==ui::kKeyPageUp?-1:1)*(code==ui::kKeyUp||code==ui::kKeyDown?36:bounds().h/uiScale));return true;}if(code==ui::kKeyHome){scrollTo(0);return true;}if(code==ui::kKeyEnd){scrollEnd();return true;}}return ui::Widget::onProcessMessage(msg);}
 void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());g.saveClip();g.clipRect(r);const int y=r.y+prefix_-offset_;g.fillRect(skin_["border"],{r.x,y,r.w-9,1});font_.draw(g,language_?U"Legacy release notes":U"旧版发行说明",r.x,y+6,skin_["text"]);font_.draw(g,language_?U"Native development build":U"原生开发版",r.x,y+18,skin_["muted"]);g.restoreClip();}
};
}
