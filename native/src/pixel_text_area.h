#pragma once
#include "native_widgets.h"
#include "ui/message.h"
#include "ui/system.h"
#include <limits>
namespace moon {
// Native adapter for legacy LayerPropertyEditor's textarea; shares pixel input skin.
class PixelTextArea : public ui::Widget {
 const PixelFont& font_;const Skin& skin_;std::u32string value_;int caret_=0,anchor_=0,scroll_=0,preferredX_=-1;bool dragging_=false,caretUpstream_=false;
 struct InputState {std::u32string text;int caret,anchor,scroll;bool upstream;};
 struct LocalEdit {InputState before,after;int kind=0;};
 std::vector<LocalEdit> undo_,redo_;int editGroup_=0;
 InputState inputState()const{return {value_,caret_,anchor_,scroll_,caretUpstream_};}
 void notifySelection(){if(selectionChanged)selectionChanged();}
 void restoreInput(const InputState& state){preferredX_=-1;value_=state.text;caret_=state.caret;anchor_=state.anchor;scroll_=state.scroll;caretUpstream_=state.upstream;reveal();if(changed)changed(value_);notifySelection();}
 std::vector<gfx::Point> positions()const {std::vector<gfx::Point> out;int x=0,y=0,width=std::max(1,bounds().w/uiScale-12);for(char32_t c:value_){int w=font_.measure(std::u32string(1,c));if(c!=U'\n'&&x&&x+w>width){x=0;y+=12;}out.push_back({x,y});if(c==U'\n'){x=0;y+=12;}else x+=w;}out.push_back({x,y});return out;}
 // A soft-wrap offset has two visual positions: the preceding row's end
 // and the following row's start. It remains one logical text offset.
 struct CaretStop {int index;bool upstream;gfx::Point point;};
 bool softWrapAt(const std::vector<gfx::Point>& all,int index)const {
  return index>0&&index<int(value_.size())&&value_[index-1]!=U'\n'&&all[index].y>all[index-1].y;
 }
 gfx::Point caretPoint(const std::vector<gfx::Point>& all)const {
  if(caretUpstream_&&softWrapAt(all,caret_))return {all[caret_-1].x+font_.measure(value_.substr(caret_-1,1)),all[caret_-1].y};
  return all[caret_];
 }
 std::vector<CaretStop> caretStops(const std::vector<gfx::Point>& all)const {
  std::vector<CaretStop> result;result.reserve(all.size()*2);
  for(int i=0;i<int(all.size());++i){
   result.push_back({i,false,all[i]});
   if(softWrapAt(all,i))result.push_back({i,true,{all[i-1].x+font_.measure(value_.substr(i-1,1)),all[i-1].y}});
  }
  return result;
 }
 void reveal(){auto p=caretPoint(positions());int h=std::max(12,bounds().h/uiScale-8);if(p.y<scroll_)scroll_=p.y;if(p.y+10>scroll_+h)scroll_=p.y+10-h;invalidate();}
 CaretStop at(gfx::Point physical)const {
  auto p=physical-bounds().origin();p={p.x/uiScale-6,p.y/uiScale-4+scroll_};
  const auto all=caretStops(positions());auto best=all.front();
  int rowDistance=std::numeric_limits<int>::max(),columnDistance=rowDistance;
  for(const auto& stop:all){const int row=std::abs(stop.point.y-p.y),column=std::abs(stop.point.x-p.x);if(row<rowDistance||(row==rowDistance&&column<columnDistance)){rowDistance=row;columnDistance=column;best=stop;}}
  return best;
 }
 void move(int to,bool shift,bool vertical=false,bool upstream=false){caretUpstream_=upstream;editGroup_=0;if(!vertical)preferredX_=-1;caret_=std::clamp(to,0,int(value_.size()));if(!shift)anchor_=caret_;reveal();notifySelection();}
 void replace(std::u32string text,int kind=0,int from=-1,int to=-1){preferredX_=-1;const auto before=inputState();int lo=from>=0?from:std::min(caret_,anchor_),hi=to>=0?to:std::max(caret_,anchor_);if(lo==hi&&text.empty())return;if(caret_!=anchor_)kind=0;caretUpstream_=false;value_.replace(lo,hi-lo,text);caret_=anchor_=lo+int(text.size());const auto after=inputState();if(kind&&kind==editGroup_&&!undo_.empty()&&undo_.back().kind==kind&&undo_.back().after.text==before.text&&undo_.back().after.caret==before.caret&&before.caret==before.anchor)undo_.back().after=after;else undo_.push_back({before,after,kind});redo_.clear();editGroup_=kind;reveal();if(changed)changed(value_);notifySelection();}

public:
 std::function<void(const std::u32string&)> changed;std::function<void()> cancel,selectionChanged;
 PixelTextArea(const PixelFont& f,const Skin& s):ui::Widget(ui::kGenericWidget),font_(f),skin_(s){setFocusStop(true);setTransparent(true);}
 void setValue(const std::u32string& value){caretUpstream_=false;preferredX_=-1;value_=value;caret_=anchor_=int(value.size());scroll_=0;undo_.clear();redo_.clear();editGroup_=0;invalidate();notifySelection();}
 const std::u32string& value()const{return value_;}
 std::pair<int,int> selectionRange()const{return {std::min(caret_,anchor_),std::max(caret_,anchor_)};}
 void setSelectionRange(int from,int to){caretUpstream_=false;preferredX_=-1;editGroup_=0;anchor_=std::clamp(from,0,int(value_.size()));caret_=std::clamp(to,0,int(value_.size()));reveal();notifySelection();}
 bool undoLocal(){editGroup_=0;if(undo_.empty())return false;auto edit=std::move(undo_.back());undo_.pop_back();restoreInput(edit.before);redo_.push_back(std::move(edit));return true;}
 bool redoLocal(){editGroup_=0;if(redo_.empty())return false;auto edit=std::move(redo_.back());redo_.pop_back();restoreInput(edit.after);undo_.push_back(std::move(edit));return true;}
 bool onProcessMessage(ui::Message* msg)override;
 void onPaint(ui::PaintEvent& ev)override;
};
}
