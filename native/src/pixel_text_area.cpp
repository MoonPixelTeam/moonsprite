#include "pixel_text_area.h"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include "modules/skunicode/include/SkUnicode.h"
#include "ui/display.h"
#include "os/system.h"
#include <windows.h>
#include <icu.h>

namespace moon {
namespace {
// The existing MIT UI Entry/laf contract takes a screen-space caret bottom.
// Multi-line fields share the same native input service and OS candidate UI.
void textInputCaret(ui::Widget& input,gfx::Point caret,int scroll){
 if(auto display=input.display())if(auto window=display->nativeWindow()){
  const auto position=input.bounds().origin()+gfx::Point((6+caret.x)*uiScale,(14+caret.y-scroll)*uiScale);
  os::System::instance()->setTextInput(true,window->pointToScreen(position));
 }
}
// Skia's bundled data omits dictionary segmentation. Windows ships the full
// ICU word service; load only the system copy, without a new runtime package.
struct PlatformWordBreaks {
 HMODULE module=LoadLibraryExW(L"icu.dll",nullptr,LOAD_LIBRARY_SEARCH_SYSTEM32);
 decltype(&ubrk_open) open=module?reinterpret_cast<decltype(&ubrk_open)>(GetProcAddress(module,"ubrk_open")):nullptr;
 decltype(&ubrk_close) close=module?reinterpret_cast<decltype(&ubrk_close)>(GetProcAddress(module,"ubrk_close")):nullptr;
 decltype(&ubrk_first) first=module?reinterpret_cast<decltype(&ubrk_first)>(GetProcAddress(module,"ubrk_first")):nullptr;
 decltype(&ubrk_next) next=module?reinterpret_cast<decltype(&ubrk_next)>(GetProcAddress(module,"ubrk_next")):nullptr;
 decltype(&u_isalpha) alphabetic=module?reinterpret_cast<decltype(&u_isalpha)>(GetProcAddress(module,"u_isalpha")):nullptr;
 decltype(&u_ispunct) punctuation=module?reinterpret_cast<decltype(&u_ispunct)>(GetProcAddress(module,"u_ispunct")):nullptr;
 ~PlatformWordBreaks(){if(module)FreeLibrary(module);}
 std::vector<int> boundaries(const std::u16string& text,const std::vector<int>& indices,const std::u32string& original,bool groupPunctuation)const {
  if(!open||!close||!first||!next)return {};
  UErrorCode error=U_ZERO_ERROR;auto iterator=open(UBRK_WORD,"en",reinterpret_cast<const UChar*>(text.data()),int(text.size()),&error);
  if(!iterator||U_FAILURE(error)){if(iterator)close(iterator);return {};}
  std::vector<int> result;
  for(int at=first(iterator);at!=UBRK_DONE;at=next(iterator))if(at>=0&&at<int(indices.size()))result.push_back(indices[at]);
  close(iterator);
  // Windows ICU 72 joins letter.period/colon.letter, whereas the browser
  // reference splits these punctuation positions (decimal separators stay intact).
  if(alphabetic)for(int i=1;i+1<int(original.size());++i)if((original[i]==U'.'||original[i]==U':')&&alphabetic(original[i-1])&&alphabetic(original[i+1])){result.push_back(i);result.push_back(i+1);}
  if(groupPunctuation&&punctuation)result.erase(std::remove_if(result.begin(),result.end(),[&](int at){return at>0&&at<int(original.size())&&punctuation(original[at-1])&&punctuation(original[at]);}),result.end());
  std::sort(result.begin(),result.end());result.erase(std::unique(result.begin(),result.end()),result.end());
  return result;
 }
};
// Legacy TextAreaInput delegates character navigation to the browser. Use the
// existing Unicode backend rather than enumerating combining/emoji ranges.
std::vector<int> textBreakBoundaries(const std::u32string& text,SkUnicode::BreakType type=SkUnicode::BreakType::kGraphemes,bool groupPunctuation=true){
 static const auto unicode=SkUnicode::Make();
 if(!unicode)return {};
 std::u16string utf16;std::vector<int> indices{0};
 for(int i=0;i<int(text.size());++i){
  const auto cp=text[i];
  if(cp>0xffff&&cp<=0x10ffff){utf16+=char16_t(0xd800+((cp-0x10000)>>10));indices.push_back(i);utf16+=char16_t(0xdc00+((cp-0x10000)&1023));}
  else utf16+=char16_t(cp<=0xffff?cp:0xfffd);
  indices.push_back(i+1);
 }
 if(type==SkUnicode::BreakType::kWords){
  static const PlatformWordBreaks platform;
  return platform.boundaries(utf16,indices,text,groupPunctuation);
 }
 auto iterator=unicode->makeBreakIterator(type);
 if(!iterator||!iterator->setText(utf16.data(),int(utf16.size())))return {};
 std::vector<int> result;
 for(auto at=iterator->first();!iterator->isDone();at=iterator->next()){
  if(at>=0&&at<int(indices.size()))result.push_back(indices[at]);
 }
 return result;
}
// Match Windows browser word motion: keep punctuation as ICU segments,
// skip horizontal whitespace, and treat paragraph boundaries separately.
int textWordStep(const std::u32string& text,int caret,bool left,bool deleting=false){
 const auto boundaries=textBreakBoundaries(text,SkUnicode::BreakType::kWords);
 if(boundaries.empty())return caret;
 static const auto unicode=SkUnicode::Make();
 auto horizontal=[&](int i){return i>=0&&i<int(text.size())&&text[i]!=U'\n'&&text[i]!=U'\r'&&unicode&&unicode->isWhitespace(text[i]);};
 if(left){
  int at=caret;
  while(at>0&&horizontal(at-1))--at;
  if(at>0&&text[at-1]==U'\n')return deleting?(at==caret?at-1:at):(at==int(text.size())||text[at]==U'\n'?at-1:at);
  const auto boundary=std::lower_bound(boundaries.begin(),boundaries.end(),at);
  return boundary==boundaries.begin()?0:*std::prev(boundary);
 }
 if(caret>=int(text.size()))return int(text.size());
 if(text[caret]==U'\n'){int at=caret+1;while(at<int(text.size())&&horizontal(at))++at;return at;}
 const auto boundary=std::upper_bound(boundaries.begin(),boundaries.end(),caret);
 int at=boundary==boundaries.end()?int(text.size()):*boundary;
 while(at<int(text.size())&&horizontal(at))++at;
 return at;
}
int textScrollLimit(const std::vector<gfx::Point>& points,int physicalHeight){
 const int visible=std::max(12,physicalHeight/uiScale-8);
 return std::max(0,points.back().y+10-visible);
}
int textGraphemeStep(const std::u32string& text,int caret,bool left){
 const auto boundaries=textBreakBoundaries(text);
 if(boundaries.empty())return caret;
 if(left){const auto at=std::lower_bound(boundaries.begin(),boundaries.end(),caret);return at==boundaries.begin()?0:*std::prev(at);}
 const auto at=std::upper_bound(boundaries.begin(),boundaries.end(),caret);
 return at==boundaries.end()?int(text.size()):*at;
}
}
std::vector<gfx::Point> PixelTextArea::positions()const {
 auto boundaries=textBreakBoundaries(value_);
 // Keep all text visible if the Unicode service is unavailable. User-driven
 // caret stops below still exclude internal positions rather than splitting data.
 if(boundaries.empty()){boundaries.push_back(0);for(int i=1;i<=int(value_.size());++i)boundaries.push_back(i);}
 std::vector<gfx::Point> out(value_.size()+1);int x=0,y=0;
 const int width=std::max(1,bounds().w/uiScale-12);
 const auto lineBreaks=textBreakBoundaries(value_,SkUnicode::BreakType::kLines);
 std::vector<int> advances(value_.size()+1);
 for(int i=0;i<int(value_.size());++i)advances[i+1]=advances[i]+(value_[i]==U'\n'?0:font_.measure(value_.substr(i,1)));
 for(std::size_t cluster=1;cluster<boundaries.size();++cluster){
  const int from=boundaries[cluster-1],to=boundaries[cluster];
  const auto text=value_.substr(from,to-from);const bool newline=text.find(U'\n')!=std::u32string::npos;
  // textarea's pre-wrap keeps a fitting word together and allows trailing
  // spaces to hang. Only an overlong unbreakable run falls back to clusters.
  if(!newline&&x&&std::binary_search(lineBreaks.begin(),lineBreaks.end(),from)){
   const auto next=std::upper_bound(lineBreaks.begin(),lineBreaks.end(),from);
   int end=next==lineBreaks.end()?int(value_.size()):*next;
   while(end>from&&(value_[end-1]==U' '||value_[end-1]==U'\n'))--end;
   if(x+advances[end]-advances[from]>width){x=0;y+=12;}
  }
  const bool hangingSpace=std::all_of(text.begin(),text.end(),[](char32_t c){return c==U' ';});
  if(!newline&&!hangingSpace&&x&&x+advances[to]-advances[from]>width){x=0;y+=12;}
  for(int i=from;i<to;++i){out[i]={x,y};if(value_[i]==U'\n'){x=0;y+=12;}else x+=font_.measure(value_.substr(i,1));}
 }
 out.back()={x,y};return out;
}

bool PixelTextArea::softWrapAt(const std::vector<gfx::Point>& all,int index)const{
  return index>0&&index<int(value_.size())&&value_[index-1]!=U'\n'&&all[index].y>all[index-1].y;
 }

gfx::Point PixelTextArea::caretPoint(const std::vector<gfx::Point>& all)const{
  if(caretUpstream_&&softWrapAt(all,caret_))return {all[caret_-1].x+font_.measure(value_.substr(caret_-1,1)),all[caret_-1].y};
  return all[caret_];
 }

std::vector<PixelTextArea::CaretStop> PixelTextArea::caretStops(const std::vector<gfx::Point>& all)const {
 auto boundaries=textBreakBoundaries(value_);
 if(boundaries.empty()){boundaries={0};if(!value_.empty())boundaries.push_back(int(value_.size()));}
 std::vector<CaretStop> result;result.reserve(boundaries.size()*2);
 for(const int i:boundaries){
  result.push_back({i,false,all[i]});
  if(softWrapAt(all,i))result.push_back({i,true,{all[i-1].x+font_.measure(value_.substr(i-1,1)),all[i-1].y}});
 }
 return result;
}

PixelTextArea::CaretStop PixelTextArea::at(gfx::Point physical)const{
  const auto layout=positions();const int offset=std::clamp(scroll_,0,textScrollLimit(layout,bounds().h));
  auto p=physical-bounds().origin();p={p.x/uiScale-6,p.y/uiScale-4+offset};
  const auto all=caretStops(layout);auto best=all.front();
  int rowDistance=std::numeric_limits<int>::max(),columnDistance=rowDistance;
  for(const auto& stop:all){const int row=std::abs(stop.point.y-p.y),column=std::abs(stop.point.x-p.x);if(row<rowDistance||(row==rowDistance&&column<columnDistance)){rowDistance=row;columnDistance=column;best=stop;}}
  return best;
 }

bool PixelTextArea::onProcessMessage(ui::Message* msg){
  if(msg->type()==ui::kDoubleClickMessage&&isEnabled()){
   const auto mouse=static_cast<ui::MouseMessage*>(msg);if(mouse->left()){
    requestFocus();preferredX_=-1;editGroup_=0;dragging_=false;wordDrag_.reset();if(hasCapture())releaseMouse();
    const auto points=positions();const auto stop=at(mouse->position());int index=stop.index;
    // Browser selection follows the nearest insertion position; the right
    // side of a final letter may therefore select the following whitespace.
    if(index>0&&stop.upstream)index=textGraphemeStep(value_,index,true);
    const auto breaks=textBreakBoundaries(value_,SkUnicode::BreakType::kWords,false);
    if(!breaks.empty()){
     if(index==int(value_.size())&&index>0)index=textGraphemeStep(value_,index,true);
     const auto end=std::upper_bound(breaks.begin(),breaks.end(),index);
     if(end!=breaks.end()&&end!=breaks.begin()){
      anchor_=*std::prev(end);caret_=*end;wordDrag_=WordDrag{anchor_,caret_,mouse->position()};dragging_=true;captureMouse();
      static const auto unicode=SkUnicode::Make();
      // Browser double-click includes trailing horizontal whitespace. Clicking
      // whitespace itself selects that whitespace run, without the preceding word.
      while(caret_<int(value_.size())&&value_[caret_]!=U'\n'&&value_[caret_]!=U'\r'&&unicode&&unicode->isWhitespace(value_[caret_]))++caret_;
      caretUpstream_=softWrapAt(points,caret_);reveal();notifySelection();
     }
    }
    return true;
   }
  }
  if(msg->type()==ui::kMouseDownMessage&&isEnabled()){auto m=static_cast<ui::MouseMessage*>(msg);if(m->left()){wordDrag_.reset();requestFocus();preferredX_=-1;editGroup_=0;const auto stop=at(m->position());caret_=stop.index;caretUpstream_=stop.upstream;if(!m->shiftPressed())anchor_=caret_;dragging_=true;captureMouse();reveal();notifySelection();return true;}}
  if(dragging_&&(msg->type()==ui::kMouseMoveMessage||msg->type()==ui::kMouseUpMessage)){
   auto mouse=static_cast<ui::MouseMessage*>(msg);
   if(!hasCapture()){dragging_=false;wordDrag_.reset();return ui::Widget::onProcessMessage(msg);}
   if(wordDrag_){
    if(msg->type()==ui::kMouseMoveMessage){
     wordDrag_->moved=true;const auto stop=at(mouse->position());int index=stop.index;
     const auto breaks=textBreakBoundaries(value_,SkUnicode::BreakType::kWords,false);
     if(index==int(value_.size())&&index>0)index=textGraphemeStep(value_,index,true);
     const auto end=std::upper_bound(breaks.begin(),breaks.end(),index);
     if(end!=breaks.begin()&&end!=breaks.end()){
      if(stop.index<wordDrag_->from){anchor_=wordDrag_->to;caret_=*std::prev(end);caretUpstream_=false;}
      else {anchor_=wordDrag_->from;caret_=*end;caretUpstream_=softWrapAt(positions(),caret_);}
      reveal();notifySelection();
     }
    }
   }else {const auto stop=at(mouse->position());caret_=stop.index;caretUpstream_=stop.upstream;reveal();notifySelection();}
   if(msg->type()==ui::kMouseUpMessage){dragging_=false;wordDrag_.reset();releaseMouse();}
   return true;
  }
  if(msg->type()==ui::kMouseWheelMessage){
   const auto layout=positions();const auto requested=std::int64_t(scroll_)+std::int64_t(static_cast<ui::MouseMessage*>(msg)->wheelDelta().y)*12;
   scroll_=int(std::clamp<std::int64_t>(requested,0,textScrollLimit(layout,bounds().h)));invalidate();return true;
  }
  if(msg->type()==ui::kFocusEnterMessage||msg->type()==ui::kFocusLeaveMessage){
   if(msg->type()==ui::kFocusLeaveMessage){
    wordDrag_.reset();dragging_=false;if(hasCapture())releaseMouse();
    os::System::instance()->setTextInput(false);
   }else {const auto all=positions();textInputCaret(*this,caretPoint(all),std::clamp(scroll_,0,textScrollLimit(all,bounds().h)));}
   preferredX_=-1;editGroup_=0;invalidate();notifySelection();
  }
  if(msg->type()==ui::kKeyDownMessage&&isEnabled()){wordDrag_.reset();dragging_=false;if(hasCapture())releaseMouse();auto k=static_cast<ui::KeyMessage*>(msg);auto code=k->scancode();bool ctrl=k->ctrlPressed()||k->cmdPressed(),shift=k->shiftPressed();
   if(code==ui::kKeyEsc){if(cancel)cancel();return true;}
   if(ctrl&&(code==ui::kKeyZ||code==ui::kKeyY)){if(code==ui::kKeyY||shift)redoLocal();else undoLocal();return true;}
   if(ctrl&&code==ui::kKeyA){caretUpstream_=false;preferredX_=-1;editGroup_=0;anchor_=0;caret_=int(value_.size());reveal();notifySelection();return true;}
   if(ctrl&&(code==ui::kKeyC||code==ui::kKeyX)){ui::set_clipboard_text(utf8Text(value_.substr(std::min(caret_,anchor_),std::abs(caret_-anchor_))));if(code==ui::kKeyX)replace({});return true;}
   if(ctrl&&code==ui::kKeyV){std::string text;if(ui::get_clipboard_text(text)){auto value=unicodeText(text);std::u32string normalized;for(std::size_t i=0;i<value.size();++i){if(value[i]==U'\r'){normalized+=U'\n';if(i+1<value.size()&&value[i+1]==U'\n')++i;}else normalized+=value[i];}replace(std::move(normalized));}return true;}
   if(code==ui::kKeyLeft||code==ui::kKeyRight){
    // The legacy browser textarea collapses an unmodified selection before stepping.
    const bool left=code==ui::kKeyLeft;
    const bool collapse=!ctrl&&!shift&&caret_!=anchor_;
    const int next=collapse?(left?std::min(caret_,anchor_):std::max(caret_,anchor_)):ctrl?textWordStep(value_,caret_,left):textGraphemeStep(value_,caret_,left);
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
    else if(ctrl){
     const bool left=code==ui::kKeyBackspace;
     const auto clusters=textBreakBoundaries(value_);const auto stop=std::lower_bound(clusters.begin(),clusters.end(),caret_);
     // Browser deletion normalizes an interior logical caret to the cluster end.
     const int caret=stop==clusters.end()?caret_:*stop;
     const int next=textWordStep(value_,caret,left,true);replace({},0,std::min(caret,next),std::max(caret,next));
    }
    else {
     const auto boundaries=textBreakBoundaries(value_);
     if(!boundaries.empty()){
      const auto at=std::lower_bound(boundaries.begin(),boundaries.end(),caret_);
      // Programmatic selection may still provide an interior codepoint offset.
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

void PixelTextArea::onPaint(ui::PaintEvent& ev){auto& g=*ev.graphics();UiPaintScale scale(g);auto rc=uiLogical(clientBounds());skin_.draw(g,"entry.normal",rc);g.saveClip();g.clipRect({rc.x+5,rc.y+3,std::max(0,rc.w-10),std::max(0,rc.h-6)});auto all=positions();scroll_=std::clamp(scroll_,0,textScrollLimit(all,bounds().h));for(int i=0;i<int(value_.size());++i){auto p=all[i];p+=gfx::Point(rc.x+6,rc.y+4-scroll_);if(i>=std::min(caret_,anchor_)&&i<std::max(caret_,anchor_))g.fillRect(skin_["accent"],{p.x,p.y,value_[i]==U'\n'?3:font_.measure(value_.substr(i,1)),10});if(value_[i]!=U'\n')font_.draw(g,value_.substr(i,1),p.x,p.y,skin_["text"]);}if(hasFocus()){auto p=caretPoint(all);textInputCaret(*this,p,scroll_);g.fillRect(skin_["text"],{rc.x+6+p.x,rc.y+4+p.y-scroll_,1,10});}g.restoreClip();}
}
