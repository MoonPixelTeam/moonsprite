#pragma once
#include "native_widgets.h"
#include "ui/message.h"
#include "ui/system.h"
#include <limits>
namespace moon {
// Native adapter for legacy LayerPropertyEditor's textarea; shares pixel input skin.
class PixelTextArea : public ui::Widget {
 const PixelFont& font_;const Skin& skin_;std::u32string value_;int caret_=0,anchor_=0,scroll_=0,preferredX_=-1;bool dragging_=false;
 struct InputState {std::u32string text;int caret,anchor,scroll;};
 struct LocalEdit {InputState before,after;int kind=0;};
 std::vector<LocalEdit> undo_,redo_;int editGroup_=0;
 InputState inputState()const{return {value_,caret_,anchor_,scroll_};}
 void notifySelection(){if(selectionChanged)selectionChanged();}
 void restoreInput(const InputState& state){preferredX_=-1;value_=state.text;caret_=state.caret;anchor_=state.anchor;scroll_=state.scroll;reveal();if(changed)changed(value_);notifySelection();}
 std::vector<gfx::Point> positions()const {std::vector<gfx::Point> out;int x=0,y=0,width=std::max(1,bounds().w/uiScale-12);for(char32_t c:value_){int w=font_.measure(std::u32string(1,c));if(c!=U'\n'&&x&&x+w>width){x=0;y+=12;}out.push_back({x,y});if(c==U'\n'){x=0;y+=12;}else x+=w;}out.push_back({x,y});return out;}
 void reveal(){auto p=positions()[caret_];int h=std::max(12,bounds().h/uiScale-8);if(p.y<scroll_)scroll_=p.y;if(p.y+10>scroll_+h)scroll_=p.y+10-h;invalidate();}
 int at(gfx::Point physical)const {auto p=physical-bounds().origin();p={p.x/uiScale-6,p.y/uiScale-4+scroll_};auto all=positions();int best=0;double score=1e20;for(int i=0;i<int(all.size());++i){double s=std::abs(all[i].y-p.y)*10000.+std::abs(all[i].x-p.x);if(s<score){score=s;best=i;}}return best;}
 void move(int to,bool shift,bool vertical=false){editGroup_=0;if(!vertical)preferredX_=-1;caret_=std::clamp(to,0,int(value_.size()));if(!shift)anchor_=caret_;reveal();notifySelection();}
 void replace(std::u32string text,int kind=0,int from=-1,int to=-1){preferredX_=-1;const auto before=inputState();int lo=from>=0?from:std::min(caret_,anchor_),hi=to>=0?to:std::max(caret_,anchor_);if(lo==hi&&text.empty())return;if(caret_!=anchor_)kind=0;value_.replace(lo,hi-lo,text);caret_=anchor_=lo+int(text.size());const auto after=inputState();if(kind&&kind==editGroup_&&!undo_.empty()&&undo_.back().kind==kind&&undo_.back().after.text==before.text&&undo_.back().after.caret==before.caret&&before.caret==before.anchor)undo_.back().after=after;else undo_.push_back({before,after,kind});redo_.clear();editGroup_=kind;reveal();if(changed)changed(value_);notifySelection();}

public:
 std::function<void(const std::u32string&)> changed;std::function<void()> cancel,selectionChanged;
 PixelTextArea(const PixelFont& f,const Skin& s):ui::Widget(ui::kGenericWidget),font_(f),skin_(s){setFocusStop(true);setTransparent(true);}
 void setValue(const std::u32string& value){preferredX_=-1;value_=value;caret_=anchor_=int(value.size());scroll_=0;undo_.clear();redo_.clear();editGroup_=0;invalidate();notifySelection();}
 const std::u32string& value()const{return value_;}
 std::pair<int,int> selectionRange()const{return {std::min(caret_,anchor_),std::max(caret_,anchor_)};}
 void setSelectionRange(int from,int to){preferredX_=-1;editGroup_=0;anchor_=std::clamp(from,0,int(value_.size()));caret_=std::clamp(to,0,int(value_.size()));reveal();notifySelection();}
 bool undoLocal(){editGroup_=0;if(undo_.empty())return false;auto edit=std::move(undo_.back());undo_.pop_back();restoreInput(edit.before);redo_.push_back(std::move(edit));return true;}
 bool redoLocal(){editGroup_=0;if(redo_.empty())return false;auto edit=std::move(redo_.back());redo_.pop_back();restoreInput(edit.after);undo_.push_back(std::move(edit));return true;}
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->type()==ui::kMouseDownMessage&&isEnabled()){auto m=static_cast<ui::MouseMessage*>(msg);if(m->left()){requestFocus();preferredX_=-1;editGroup_=0;caret_=at(m->position());if(!m->shiftPressed())anchor_=caret_;dragging_=true;captureMouse();reveal();notifySelection();return true;}}
  if(dragging_&&(msg->type()==ui::kMouseMoveMessage||msg->type()==ui::kMouseUpMessage)){auto m=static_cast<ui::MouseMessage*>(msg);caret_=at(m->position());reveal();notifySelection();if(msg->type()==ui::kMouseUpMessage){dragging_=false;if(hasCapture())releaseMouse();}return true;}
  if(msg->type()==ui::kMouseWheelMessage){scroll_=std::max(0,scroll_+static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*12);invalidate();return true;}
  if(msg->type()==ui::kFocusEnterMessage||msg->type()==ui::kFocusLeaveMessage){preferredX_=-1;editGroup_=0;invalidate();notifySelection();}
  if(msg->type()==ui::kKeyDownMessage&&isEnabled()){auto k=static_cast<ui::KeyMessage*>(msg);auto code=k->scancode();bool ctrl=k->ctrlPressed()||k->cmdPressed(),shift=k->shiftPressed();
   if(code==ui::kKeyEsc){if(cancel)cancel();return true;}
   if(ctrl&&(code==ui::kKeyZ||code==ui::kKeyY)){if(code==ui::kKeyY||shift)redoLocal();else undoLocal();return true;}
   if(ctrl&&code==ui::kKeyA){preferredX_=-1;editGroup_=0;anchor_=0;caret_=int(value_.size());reveal();notifySelection();return true;}
   if(ctrl&&(code==ui::kKeyC||code==ui::kKeyX)){ui::set_clipboard_text(utf8Text(value_.substr(std::min(caret_,anchor_),std::abs(caret_-anchor_))));if(code==ui::kKeyX)replace({});return true;}
   if(ctrl&&code==ui::kKeyV){std::string text;if(ui::get_clipboard_text(text)){auto value=unicodeText(text);std::u32string normalized;for(std::size_t i=0;i<value.size();++i){if(value[i]==U'\r'){normalized+=U'\n';if(i+1<value.size()&&value[i+1]==U'\n')++i;}else normalized+=value[i];}replace(std::move(normalized));}return true;}
   if(code==ui::kKeyLeft||code==ui::kKeyRight){
    // The legacy browser textarea collapses an unmodified selection before stepping.
    const bool left=code==ui::kKeyLeft;
    const int next=!shift&&caret_!=anchor_?(left?std::min(caret_,anchor_):std::max(caret_,anchor_)):caret_+(left?-1:1);
    move(next,shift);return true;
   }
   if(code==ui::kKeyHome||code==ui::kKeyEnd){int next=caret_;if(ctrl)next=code==ui::kKeyHome?0:int(value_.size());else if(code==ui::kKeyHome){while(next>0&&value_[next-1]!=U'\n')--next;}else while(next<int(value_.size())&&value_[next]!=U'\n')++next;move(next,shift);return true;}
   if(code==ui::kKeyUp||code==ui::kKeyDown||code==ui::kKeyPageUp||code==ui::kKeyPageDown){
    const auto all=positions();const auto current=all[caret_];
    if(preferredX_<0)preferredX_=current.x;
    const bool up=code==ui::kKeyUp||code==ui::kKeyPageUp;
    const bool page=code==ui::kKeyPageUp||code==ui::kKeyPageDown;
    const int rows=page?std::max(1,(bounds().h/uiScale-8)/12):1;
    const int wantedY=current.y+(up?-1:1)*12*rows;
    int best=up?0:int(value_.size());
    if(wantedY>=0&&wantedY<=all.back().y){
     // Choose the visual row first, then its closest insertion position. Keep the
     // requested column across short rows, as the browser-owned legacy input does.
     int distance=std::numeric_limits<int>::max();
     for(int i=0;i<int(all.size());++i)if(all[i].y==wantedY){const int d=std::abs(all[i].x-preferredX_);if(d<distance){distance=d;best=i;}}
    }
    move(best,shift,true);return true;
   }
   if(code==ui::kKeyBackspace||code==ui::kKeyDel){if(caret_!=anchor_)replace({});else if(code==ui::kKeyBackspace&&caret_>0)replace({},2,caret_-1,caret_);else if(code==ui::kKeyDel&&caret_<int(value_.size()))replace({},3,caret_,caret_+1);return true;}
   if(code==ui::kKeyEnter){replace(U"\n");return true;}
   if(!ctrl&&k->unicodeChar()>=32){replace(std::u32string(1,char32_t(k->unicodeChar())),1);return true;}
  }return ui::Widget::onProcessMessage(msg);
 }
 void onPaint(ui::PaintEvent& ev)override {auto& g=*ev.graphics();UiPaintScale scale(g);auto rc=uiLogical(clientBounds());skin_.draw(g,"entry.normal",rc);g.saveClip();g.clipRect({rc.x+5,rc.y+3,std::max(0,rc.w-10),std::max(0,rc.h-6)});auto all=positions();for(int i=0;i<int(value_.size());++i){auto p=all[i];p+=gfx::Point(rc.x+6,rc.y+4-scroll_);if(i>=std::min(caret_,anchor_)&&i<std::max(caret_,anchor_))g.fillRect(skin_["accent"],{p.x,p.y,value_[i]==U'\n'?3:font_.measure(value_.substr(i,1)),10});if(value_[i]!=U'\n')font_.draw(g,value_.substr(i,1),p.x,p.y,skin_["text"]);}if(hasFocus()){auto p=all[caret_];g.fillRect(skin_["text"],{rc.x+6+p.x,rc.y+4+p.y-scroll_,1,10});}g.restoreClip();}
};
}
