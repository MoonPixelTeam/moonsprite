#pragma once
#include "native_widgets.h"
#include "ui/message.h"
#include <cmath>
#include <sstream>
namespace moon {
// LuaScriptDialog NumberInput: live plain-number drafts, expressions committed
// on Enter/blur, callback only on blur. Reuse PixelEntry's expression parser,
// edit history, clipboard, caret, scrub and keyboard numeric interactions.
class ScriptNumberEntry final:public PixelEntry {
 double value_=0;bool updating_=false;
 void normalize(){if(updating_)return;try{std::size_t used=0;const auto v=std::stod(text(),&used);if(used==text().size()&&std::isfinite(v)){const auto next=std::clamp(v,numericMinimum,numericMaximum);if(next!=value_){value_=next;if(changed)changed(value_);}if(next!=v)displayValue();}}catch(...){}}
 void displayValue(){std::ostringstream out;out.precision(17);out<<value_;updating_=true;setText(out.str());updating_=false;}
public:
 std::function<void(double)> changed;std::function<void()> committed;
 ScriptNumberEntry(const PixelFont& font,const Skin& skin,double value,double minimum,double maximum,double step):PixelEntry(font,skin){
  numeric=true;numericMinimum=minimum;numericMaximum=maximum;numericStep=std::isfinite(step)&&step!=0?std::abs(step):1;
  numericValue=[this]{return value_;};
  Change.connect([this]{if(updating_)return;const auto s=text();if(s.size()>1&&s.find_first_of("+-*/()",1)!=std::string::npos)return;normalize();});
  accept=[this]{normalize();displayValue();};blur=[this]{normalize();displayValue();if(committed)committed();};sync(value);
 }
 void sync(double value){value_=std::isfinite(value)?value:0;displayValue();}
 double value()const{return value_;}
 bool onProcessMessage(ui::Message* msg)override{
  // Invalid/empty expressions revert to the last accepted numeric value.
  if(isEnabled()&&msg->type()==ui::kFocusLeaveMessage){if(!commitExpression())displayValue();}
  if(isEnabled()&&msg->type()==ui::kKeyDownMessage){const auto code=static_cast<ui::KeyMessage*>(msg)->scancode();if(code==ui::kKeyEnter||code==ui::kKeyEnterPad){if(!commitExpression())displayValue();normalize();displayValue();return true;}}
  return PixelEntry::onProcessMessage(msg);
 }
};
// RangeField accepts arbitrary finite doubles. PixelSlider's existing skin and
// hit outline paint the normalized position; input stays in the Lua domain.
class ScriptRangeSlider final:public PixelSlider {
 double low_,high_,step_,current_;bool dragging_=false;
 double clamp(double v)const{return std::max(low_,std::min(high_,v));}
 void set(double v,bool shift,bool quantize){
  if(quantize&&step_>0)v=low_+std::floor((v-low_)/step_+.5)*step_;
  v=clamp(v);if(shift&&v!=low_&&v!=high_){const auto stride=std::max(step_,5.);v=clamp(std::floor(v/stride+.5)*stride);}
  if(v!=current_){current_=v;syncPaint();if(draftChanged)draftChanged(v);}
 }
 void syncPaint(){value=high_>low_?int(std::floor((clamp(current_)-low_)/(high_-low_)*10000+.5)):0;invalidate();}
public:
 std::function<void(double)> draftChanged;std::function<void()> released;
 ScriptRangeSlider(const PixelFont& font,const Skin& skin,double value,double minimum,double maximum,double step):PixelSlider(font,skin),low_(minimum),high_(maximum),step_(std::isfinite(step)&&step>0?step:1),current_(value){
  this->minimum=0;this->maximum=10000;percentage=false;numberSuffix=U"";valueLabel=[this](int){std::ostringstream out;out.precision(15);out<<current_;return unicodeText(out.str());};syncPaint();
 }
 double domainValue()const{return current_;}
 void sync(double value){current_=value;syncPaint();}
 bool onProcessMessage(ui::Message* msg)override{
  if(!isEnabled())return ui::Widget::onProcessMessage(msg);
  if(msg->type()==ui::kMouseDownMessage||msg->type()==ui::kMouseMoveMessage||msg->type()==ui::kMouseUpMessage){auto m=static_cast<ui::MouseMessage*>(msg);if(msg->type()==ui::kMouseDownMessage&&m->left()){requestFocus();captureMouse();dragging_=true;}if(dragging_&&hasCapture()){
   const auto r=bounds();const double t=std::clamp(double(m->position().x-r.x-uiScale)/std::max(1,r.w-2*uiScale-1),0.,1.);set(low_+t*(high_-low_),m->shiftPressed(),true);
   if(msg->type()==ui::kMouseUpMessage&&m->left()){dragging_=false;releaseMouse();if(released)released();}return true;
  }}
  if(msg->type()==ui::kMouseWheelMessage){auto m=static_cast<ui::MouseMessage*>(msg);const int dy=m->wheelDelta().y;if(dy){const double stride=m->shiftPressed()?std::max(step_,5.):step_;const auto v=current_+(dy<0?stride:-stride);set(std::round(v*1e10)/1e10,false,false);}return true;}
  if(msg->type()==ui::kKeyDownMessage){auto k=static_cast<ui::KeyMessage*>(msg);const auto code=k->scancode();double next=current_;switch(code){case ui::kKeyLeft:case ui::kKeyDown:next-=step_;break;case ui::kKeyRight:case ui::kKeyUp:next+=step_;break;case ui::kKeyHome:next=low_;break;case ui::kKeyEnd:next=high_;break;case ui::kKeyPageUp:next+=(high_-low_)/10;break;case ui::kKeyPageDown:next-=(high_-low_)/10;break;default:return PixelSlider::onProcessMessage(msg);}set(next,k->shiftPressed(),true);return true;}
  if(msg->type()==ui::kKeyUpMessage)return ui::Widget::onProcessMessage(msg);
  if(msg->type()==ui::kFocusLeaveMessage){dragging_=false;if(hasCapture())releaseMouse();if(released)released();invalidate();return true;}
  // Hover/focus painting retains the common material and selection hit rules.
  return PixelSlider::onProcessMessage(msg);
 }
};
}
