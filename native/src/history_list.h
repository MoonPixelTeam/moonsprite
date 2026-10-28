#pragma once
#include "native_widgets.h"
#include "history_panel_model.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include <functional>
namespace moon {
struct HistoryListRow {std::size_t position=0;std::u32string label;bool current=false,future=false,checked=false;};
class HistoryList : public ui::Widget {
 const PixelFont& font_;const Skin& skin_;PixelScrollBar* bar_;std::vector<HistoryListRow> rows_;int scroll_=0,pressed_=-1,hover_=-1;bool checkbox_;
 int rowAt(gfx::Point p)const{const auto r=bounds();if(!r.contains(p)||p.x>=r.x2()-(bar_->isVisible()?7*uiScale:0))return -1;const int i=(p.y-r.y+scroll_)/rowHeight();return i>=0&&i<int(rows_.size())?i:-1;}
 void configure(){const auto r=bounds();scroll_=std::clamp(scroll_,0,maximumScroll());const bool show=int(rows_.size())*rowHeight()>r.h;bar_->setVisible(show);if(show){bar_->setBounds({r.x2()-7*uiScale,r.y,7*uiScale,r.h});bar_->configure(int(rows_.size())*rowHeight(),r.h,scroll_);}}
public:
 std::function<void(std::size_t)> selected;std::function<void(int)> scrolled;std::u32string emptyText;
 HistoryList(const PixelFont& font,const Skin& skin,bool checkbox=false):ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),checkbox_(checkbox){setTransparent(true);bar_=new PixelScrollBar(skin,true);addChild(bar_);bar_->changed=[this](int value){setScroll(value);};}
 int rowHeight()const{return textControlHeight*uiScale;}
 PixelScrollBar* scrollBar()const{return bar_;}
 const std::vector<HistoryListRow>& rows()const{return rows_;}
 int scroll()const{return scroll_;}
 int maximumScroll()const{return std::max(0,int(rows_.size())*rowHeight()-bounds().h);}
 void setScroll(int value){const int next=std::clamp(value,0,maximumScroll());if(next==scroll_)return;scroll_=next;configure();invalidate();if(scrolled)scrolled(scroll_);}
 void setRows(std::vector<HistoryListRow> rows,bool reveal=false){rows_=std::move(rows);pressed_=-1;hover_=-1;if(reveal){for(std::size_t i=0;i<rows_.size();++i)if(rows_[i].current){scroll_=historyRevealScroll(int(i)*rowHeight(),int(i+1)*rowHeight(),scroll_,bounds().h,int(rows_.size())*rowHeight());break;}}configure();invalidate();}
 void choosePosition(std::size_t position){if(selected)selected(position);}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());configure();}
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->type()==ui::kMouseWheelMessage){setScroll(scroll_+static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*rowHeight()*3);return true;}
  if(msg->type()==ui::kMouseMoveMessage||msg->type()==ui::kMouseEnterMessage){const int i=rowAt(static_cast<ui::MouseMessage*>(msg)->position());if(i!=hover_){hover_=i;invalidate();}}
  if(msg->type()==ui::kMouseLeaveMessage){hover_=-1;invalidate();}
  if(msg->type()==ui::kMouseDownMessage){auto m=static_cast<ui::MouseMessage*>(msg);if(m->left()){pressed_=rowAt(m->position());if(pressed_>=0){captureMouse();invalidate();return true;}}}
  if(msg->type()==ui::kMouseUpMessage&&hasCapture()){releaseMouse();const int p=pressed_;pressed_=-1;const int next=rowAt(static_cast<ui::MouseMessage*>(msg)->position());invalidate();if(p>=0&&p==next){const auto key=rows_[p].position;if(selected)selected(key);}return true;}
  if(msg->type()==ui::kFocusLeaveMessage){pressed_=-1;hover_=-1;if(hasCapture())releaseMouse();invalidate();}
  return ui::Widget::onProcessMessage(msg);
 }
 void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=clientBounds();const auto logical=uiLogical(r);skin_.draw(g,"panel_content",logical);const int width=logical.w-(bar_->isVisible()?7:0);g.saveClip();g.clipRect({logical.x,logical.y,width,logical.h});if(rows_.empty()&&!emptyText.empty())font_.draw(g,emptyText,logical.x+3,logical.y+3,skin_["muted"]);const int first=scroll_/rowHeight(),last=std::min(int(rows_.size()),(scroll_+r.h+rowHeight()-1)/rowHeight());for(int i=first;i<last;++i){const auto& row=rows_[i];const int y=logical.y+(i*rowHeight()-scroll_)/uiScale;gfx::Rect rr{logical.x,y,width,textControlHeight};if(checkbox_)skin_.drawCheckbox(g,rr,row.checked,i==hover_,i==pressed_);else if(row.current||i==hover_||i==pressed_)skin_.draw(g,row.current?"button.selected":i==pressed_?"button.pressed":"button.hover",rr);font_.draw(g,row.label,logical.x+(checkbox_?17:3),DialogLayout::centeredInkY(font_,row.label,y,textControlHeight),skin_[row.future?"muted":"text"]);}g.restoreClip();}
};
}
