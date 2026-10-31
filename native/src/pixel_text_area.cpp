#include "pixel_text_area.h"
#include <algorithm>
#include <cmath>
#include "modules/skunicode/include/SkUnicode.h"

namespace moon {
namespace {
// Legacy TextAreaInput delegates character navigation to the browser. Use the
// existing Unicode backend rather than enumerating combining/emoji ranges.
std::vector<int> textGraphemeBoundaries(const std::u32string& text){
 static const auto unicode=SkUnicode::Make();
 if(!unicode)return {};
 std::u16string utf16;std::vector<int> indices{0};
 for(int i=0;i<int(text.size());++i){
  const auto cp=text[i];
  if(cp>0xffff&&cp<=0x10ffff){utf16+=char16_t(0xd800+((cp-0x10000)>>10));indices.push_back(i);utf16+=char16_t(0xdc00+((cp-0x10000)&1023));}
  else utf16+=char16_t(cp<=0xffff?cp:0xfffd);
  indices.push_back(i+1);
 }
 auto iterator=unicode->makeBreakIterator(SkUnicode::BreakType::kGraphemes);
 if(!iterator||!iterator->setText(utf16.data(),int(utf16.size())))return {};
 std::vector<int> result;
 for(auto at=iterator->first();!iterator->isDone();at=iterator->next()){
  if(at>=0&&at<int(indices.size()))result.push_back(indices[at]);
 }
 return result;
}
int textGraphemeStep(const std::u32string& text,int caret,bool left){
 const auto boundaries=textGraphemeBoundaries(text);
 if(boundaries.empty())return caret;
 if(left){const auto at=std::lower_bound(boundaries.begin(),boundaries.end(),caret);return at==boundaries.begin()?0:*std::prev(at);}
 const auto at=std::upper_bound(boundaries.begin(),boundaries.end(),caret);
 return at==boundaries.end()?int(text.size()):*at;
}
}
bool PixelTextArea::onProcessMessage(ui::Message* msg){
  if(msg->type()==ui::kMouseDownMessage&&isEnabled()){auto m=static_cast<ui::MouseMessage*>(msg);if(m->left()){requestFocus();preferredX_=-1;editGroup_=0;const auto stop=at(m->position());caret_=stop.index;caretUpstream_=stop.upstream;if(!m->shiftPressed())anchor_=caret_;dragging_=true;captureMouse();reveal();notifySelection();return true;}}
  if(dragging_&&(msg->type()==ui::kMouseMoveMessage||msg->type()==ui::kMouseUpMessage)){auto m=static_cast<ui::MouseMessage*>(msg);const auto stop=at(m->position());caret_=stop.index;caretUpstream_=stop.upstream;reveal();notifySelection();if(msg->type()==ui::kMouseUpMessage){dragging_=false;if(hasCapture())releaseMouse();}return true;}
  if(msg->type()==ui::kMouseWheelMessage){scroll_=std::max(0,scroll_+static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*12);invalidate();return true;}
  if(msg->type()==ui::kFocusEnterMessage||msg->type()==ui::kFocusLeaveMessage){preferredX_=-1;editGroup_=0;invalidate();notifySelection();}
  if(msg->type()==ui::kKeyDownMessage&&isEnabled()){auto k=static_cast<ui::KeyMessage*>(msg);auto code=k->scancode();bool ctrl=k->ctrlPressed()||k->cmdPressed(),shift=k->shiftPressed();
   if(code==ui::kKeyEsc){if(cancel)cancel();return true;}
   if(ctrl&&(code==ui::kKeyZ||code==ui::kKeyY)){if(code==ui::kKeyY||shift)redoLocal();else undoLocal();return true;}
   if(ctrl&&code==ui::kKeyA){caretUpstream_=false;preferredX_=-1;editGroup_=0;anchor_=0;caret_=int(value_.size());reveal();notifySelection();return true;}
   if(ctrl&&(code==ui::kKeyC||code==ui::kKeyX)){ui::set_clipboard_text(utf8Text(value_.substr(std::min(caret_,anchor_),std::abs(caret_-anchor_))));if(code==ui::kKeyX)replace({});return true;}
   if(ctrl&&code==ui::kKeyV){std::string text;if(ui::get_clipboard_text(text)){auto value=unicodeText(text);std::u32string normalized;for(std::size_t i=0;i<value.size();++i){if(value[i]==U'\r'){normalized+=U'\n';if(i+1<value.size()&&value[i+1]==U'\n')++i;}else normalized+=value[i];}replace(std::move(normalized));}return true;}
   if(code==ui::kKeyLeft||code==ui::kKeyRight){
    // The legacy browser textarea collapses an unmodified selection before stepping.
    const bool left=code==ui::kKeyLeft;
    const bool collapse=!shift&&caret_!=anchor_;
    const int next=collapse?(left?std::min(caret_,anchor_):std::max(caret_,anchor_)):textGraphemeStep(value_,caret_,left);
    // A selected visual row ends before the wrap, even though the next row
    // starts at the same logical offset.
    const bool upstream=collapse&&!left&&softWrapAt(positions(),next);
    move(next,shift,false,upstream);return true;
   }
   if(code==ui::kKeyHome||code==ui::kKeyEnd){
    if(ctrl)move(code==ui::kKeyHome?0:int(value_.size()),shift);
    else {
     const auto all=positions();const auto current=caretPoint(all);CaretStop target{caret_,caretUpstream_,current};
     for(const auto& stop:caretStops(all))if(stop.point.y==current.y&&(code==ui::kKeyHome?stop.point.x<target.point.x:stop.point.x>target.point.x))target=stop;
     move(target.index,shift,false,target.upstream);
    }
    return true;
   }
   if(code==ui::kKeyUp||code==ui::kKeyDown||code==ui::kKeyPageUp||code==ui::kKeyPageDown){
    const auto all=positions();const auto current=caretPoint(all);
    if(preferredX_<0)preferredX_=current.x;
    const bool up=code==ui::kKeyUp||code==ui::kKeyPageUp;
    const bool page=code==ui::kKeyPageUp||code==ui::kKeyPageDown;
    const int rows=page?std::max(1,(bounds().h/uiScale-8)/12):1;
    const int wantedY=current.y+(up?-1:1)*12*rows;
    CaretStop best{up?0:int(value_.size()),false,{}};
    if(wantedY>=0&&wantedY<=all.back().y){
     // Choose the visual row first, then its closest insertion position. Keep the
     // requested column across short rows, as the browser-owned legacy input does.
     int distance=std::numeric_limits<int>::max();
     for(const auto& stop:caretStops(all))if(stop.point.y==wantedY){const int d=std::abs(stop.point.x-preferredX_);if(d<distance){distance=d;best=stop;}}
    }
    move(best.index,shift,true,best.upstream);return true;
   }
   if(code==ui::kKeyBackspace||code==ui::kKeyDel){
    if(caret_!=anchor_)replace({});
    else {
     const auto boundaries=textGraphemeBoundaries(value_);
     if(!boundaries.empty()){
      const auto at=std::lower_bound(boundaries.begin(),boundaries.end(),caret_);
      // Mouse/vertical placement still uses the pixel-font codepoint layout.
      // If it lands inside a cluster, either deletion removes that whole cluster.
      if(at!=boundaries.end()&&*at!=caret_&&at!=boundaries.begin())replace({},0,*std::prev(at),*at);
      else if(code==ui::kKeyBackspace&&caret_>0)replace({},2,textGraphemeStep(value_,caret_,true),caret_);
      else if(code==ui::kKeyDel&&caret_<int(value_.size()))replace({},3,caret_,textGraphemeStep(value_,caret_,false));
     }
    }
    return true;
   }
   if(code==ui::kKeyEnter){replace(U"\n");return true;}
   if(!ctrl&&k->unicodeChar()>=32){replace(std::u32string(1,char32_t(k->unicodeChar())),1);return true;}
  }return ui::Widget::onProcessMessage(msg);
 }

void PixelTextArea::onPaint(ui::PaintEvent& ev){auto& g=*ev.graphics();UiPaintScale scale(g);auto rc=uiLogical(clientBounds());skin_.draw(g,"entry.normal",rc);g.saveClip();g.clipRect({rc.x+5,rc.y+3,std::max(0,rc.w-10),std::max(0,rc.h-6)});auto all=positions();for(int i=0;i<int(value_.size());++i){auto p=all[i];p+=gfx::Point(rc.x+6,rc.y+4-scroll_);if(i>=std::min(caret_,anchor_)&&i<std::max(caret_,anchor_))g.fillRect(skin_["accent"],{p.x,p.y,value_[i]==U'\n'?3:font_.measure(value_.substr(i,1)),10});if(value_[i]!=U'\n')font_.draw(g,value_.substr(i,1),p.x,p.y,skin_["text"]);}if(hasFocus()){auto p=caretPoint(all);g.fillRect(skin_["text"],{rc.x+6+p.x,rc.y+4+p.y-scroll_,1,10});}g.restoreClip();}
}
