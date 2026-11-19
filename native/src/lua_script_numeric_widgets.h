#pragma once
#include "native_widgets.h"
#include "ui/message.h"
#include <cmath>
#include <charconv>
#include <cstdint>
#include <sstream>
namespace moon {
// NumberInput: configurable live drafts, expressions committed
// on Enter/blur, callback only on blur. Reuse PixelEntry's expression parser,
// edit history, clipboard, caret, scrub and keyboard numeric interactions.
class ScriptNumberEntry final:public PixelEntry {
 double value_=0;bool updating_=false,live_=true;
 void normalize(){if(updating_)return;try{const auto parsed=evaluateExpression();if(!parsed)return;const auto next=normalized(*parsed);if(next!=value_){value_=next;if(changed)changed(value_);}if(next!=*parsed)displayValue();}catch(...){}}
 void displayValue(){std::ostringstream out;out.precision(17);out<<value_;updating_=true;setText(out.str());updating_=false;}
public:
 std::function<void(double)> changed;std::function<void()> committed;
 ScriptNumberEntry(const PixelFont& font,const Skin& skin,double value,double minimum,double maximum,double step,bool live=true):PixelEntry(font,skin),live_(live){
  numeric=true;numericSteppers=true;numericExpressionFilter=true;numericMinimum=minimum;numericMaximum=maximum;numericStep=std::isfinite(step)&&step!=0?std::abs(step):1;
  numericValue=[this]{return value_;};
  wheel=[this](int delta){const auto next=normalized(value_+delta*numericStep);if(next!=value_){value_=next;if(changed)changed(value_);}displayValue();};
  Change.connect([this]{if(updating_||!live_)return;const auto s=text();if(s.size()>1&&s.find_first_of("+-*/()",1)!=std::string::npos)return;normalize();});
  accept=[this]{normalize();displayValue();};blur=[this]{normalize();displayValue();if(committed)committed();};sync(value);
 }
 void sync(double value){value_=std::isfinite(value)?value:0;displayValue();}
 double value()const{return value_;}
 double normalized(double candidate)const{return std::isfinite(candidate)?std::clamp(candidate,numericMinimum,numericMaximum):value_;}
 bool onProcessMessage(ui::Message* msg)override{
  // Invalid/empty expressions revert to the last accepted numeric value.
  if(isEnabled()&&msg->type()==ui::kFocusLeaveMessage){if(!commitExpression())displayValue();else normalize();}
  if(isEnabled()&&msg->type()==ui::kKeyDownMessage){const auto code=static_cast<ui::KeyMessage*>(msg)->scancode();if(code==ui::kKeyEnter||code==ui::kKeyEnterPad){const bool expression=text().find_first_of("+-*/()",1)!=std::string::npos;if(!commitExpression())displayValue();normalize();displayValue();if(!expression)releaseFocus();return true;}}
  return PixelEntry::onProcessMessage(msg);
 }
};
// FormField label capture adjusts accepted values without focus or blur.
 class ScriptNumberLabel final:public ui::Widget{std::function<ScriptNumberEntry*()> resolve_;bool dragging_=false;int lastX_=0;public:explicit ScriptNumberLabel(std::function<ScriptNumberEntry*()> resolve):ui::Widget(ui::kGenericWidget),resolve_(std::move(resolve)){setTransparent(true);}void cancelDrag(){dragging_=false;if(hasCapture())releaseMouse();}bool scrubbable()const{auto* entry=resolve_();return entry&&entry->isEnabled()&&!entry->isReadOnly();}bool onProcessMessage(ui::Message* message)override{if(dragging_&&!hasCapture())dragging_=false;auto* entry=resolve_();const bool enabled=entry&&entry->isEnabled()&&!entry->isReadOnly();if(message->type()==ui::kMouseDownMessage){auto* mouse=static_cast<ui::MouseMessage*>(message);if(mouse->left()&&enabled){lastX_=mouse->position().x;dragging_=true;captureMouse();return true;}}if(message->type()==ui::kMouseMoveMessage&&dragging_&&hasCapture()){auto* mouse=static_cast<ui::MouseMessage*>(message);const double pixels=double(mouse->position().x-lastX_)/uiScale;lastX_=mouse->position().x;if(enabled&&pixels){const double next=entry->normalized(entry->value()+pixels*entry->numericStep*(mouse->shiftPressed()?10:1));if(next!=entry->value()){entry->sync(next);if(entry->changed)entry->changed(next);}}return true;}if(message->type()==ui::kMouseUpMessage&&dragging_&&static_cast<ui::MouseMessage*>(message)->left()){dragging_=false;if(hasCapture())releaseMouse();return true;}if(message->type()==ui::kFocusLeaveMessage){dragging_=false;if(hasCapture())releaseMouse();}return ui::Widget::onProcessMessage(message);}};
// RangeField accepts arbitrary finite doubles. PixelSlider's existing skin and
// hit outline paint the normalized position; input stays in the Lua domain.
class ScriptRangeSlider final:public PixelSlider {
 double low_,high_,step_,current_;bool dragging_=false;
 double clamp(double v)const{return std::max(low_,std::min(high_,v));}
 // useSliderWheel.ts: Number(candidate.toFixed(10)), without multiplying
 // the binary value by 1e10 (which can overflow or round a second time).
 static double wheelDecimal(double candidate){
  const double magnitude=std::abs(candidate);
  if(!std::isfinite(candidate)||magnitude>=1e21)return candidate;
  if(candidate==0)return 0;
  char digits[64];const auto formatted=std::to_chars(digits,digits+sizeof(digits),magnitude,std::chars_format::fixed,10);
  if(formatted.ec!=std::errc{})throw std::runtime_error("Slider decimal formatting failed");
  // to_chars uses ties-to-even; ECMAScript toFixed rounds an exact tie
  // away from zero. Strip binary factors to detect a tenth-decimal tie.
  int exponent=0;auto significand=std::uint64_t(std::ldexp(std::frexp(magnitude,&exponent),53));exponent-=53;
  while((significand&1)==0){significand>>=1;++exponent;}
  if(exponent==-11&&(significand&3)==1)++formatted.ptr[-1];
  double rounded=0;const auto parsed=std::from_chars(digits,formatted.ptr,rounded,std::chars_format::fixed);
  if(parsed.ec!=std::errc{}||parsed.ptr!=formatted.ptr)throw std::runtime_error("Slider decimal parsing failed");
  return std::signbit(candidate)?-rounded:rounded;
 }
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
 void cancelInteraction(){dragging_=false;if(hasCapture())releaseMouse();invalidate();}
 double domainValue()const{return current_;}
 void sync(double value){current_=value;syncPaint();}
 bool onProcessMessage(ui::Message* msg)override{
  if(!isEnabled()){cancelInteraction();return ui::Widget::onProcessMessage(msg);}
  if(dragging_&&!hasCapture())dragging_=false;
  if(msg->type()==ui::kMouseDownMessage||msg->type()==ui::kMouseMoveMessage||msg->type()==ui::kMouseUpMessage){auto m=static_cast<ui::MouseMessage*>(msg);if(msg->type()==ui::kMouseDownMessage&&m->left()){requestFocus();captureMouse();dragging_=true;}if(dragging_&&hasCapture()){
   if(msg->type()==ui::kMouseUpMessage){if(m->left()){cancelInteraction();if(released)released();}return true;}
   const auto r=bounds();const double t=std::clamp(double(m->position().x-r.x-uiScale)/std::max(1,r.w-2*uiScale-1),0.,1.);set(low_+t*(high_-low_),m->shiftPressed(),true);
   return true;
  }}
  if(msg->type()==ui::kMouseWheelMessage){auto m=static_cast<ui::MouseMessage*>(msg);const int dy=m->wheelDelta().y;if(dy){const double stride=m->shiftPressed()?std::max(step_,5.):step_;const auto v=current_+(dy<0?stride:-stride);set(wheelDecimal(v),false,false);}return true;}
  if(msg->type()==ui::kKeyDownMessage){auto k=static_cast<ui::KeyMessage*>(msg);const auto code=k->scancode();double next=current_;switch(code){case ui::kKeyLeft:case ui::kKeyDown:next-=step_;break;case ui::kKeyRight:case ui::kKeyUp:next+=step_;break;case ui::kKeyHome:next=low_;break;case ui::kKeyEnd:next=high_;break;case ui::kKeyPageUp:next+=(high_-low_)/10;break;case ui::kKeyPageDown:next-=(high_-low_)/10;break;default:return PixelSlider::onProcessMessage(msg);}set(next,k->shiftPressed(),true);return true;}
  if(msg->type()==ui::kKeyUpMessage)return ui::Widget::onProcessMessage(msg);
  if(msg->type()==ui::kFocusLeaveMessage){cancelInteraction();if(released)released();return true;}
  // Hover/focus painting retains the common material and selection hit rules.
  return PixelSlider::onProcessMessage(msg);
 }
};
}
