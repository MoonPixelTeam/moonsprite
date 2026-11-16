#include "canvas_reference_dialog.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include "ui/manager.h"
#include "ui/tooltips.h"
#include <iomanip>
#include <sstream>
namespace moon {namespace {
std::string number(double n){std::ostringstream s;s<<std::setprecision(12)<<n;return s.str();}
// Legacy NumberInput's scrub/stepper is one grouped reference transaction.
class ReferenceEntry final:public PixelEntry {
 bool gestureActive_=false;
 const PixelFont& font_;
public:
 std::function<void(bool)> gesture;
 ReferenceEntry(const PixelFont& font,const Skin& skin):PixelEntry(font,skin),font_(font){}
 bool onProcessMessage(ui::Message* msg)override{
  if(isEnabled()&&msg->type()==ui::kMouseDownMessage){const auto m=static_cast<ui::MouseMessage*>(msg);if(m->left()&&(m->position().x<bounds().x+4*uiScale||(!suffix.empty()&&m->position().x>=bounds().x2()-fontSuffixWidth()))){gestureActive_=true;if(gesture)gesture(false);}}
  const bool handled=PixelEntry::onProcessMessage(msg);
  if(gestureActive_&&(msg->type()==ui::kMouseUpMessage||msg->type()==ui::kFocusLeaveMessage||!hasCapture())){gestureActive_=false;if(gesture)gesture(true);}
  return handled;
 }
 int fontSuffixWidth()const{return (font_.measure(suffix)+4)*uiScale;}
};
}
CanvasReferenceDialog::CanvasReferenceDialog(const PixelFont& font,const Skin& skin,const Skin& icons,std::function<const CanvasReference*()> read,std::function<void(ReferencePatch)> update,std::function<void(int)> action,std::function<void(bool)> gesture)
 :PixelDialog(skin,"",ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),read_(std::move(read)),update_(std::move(update)),action_(std::move(action)),gesture_(std::move(gesture)){
 setAutoRemap(false);setWantFocus(true);
 for(int i=0;i<5;++i){auto field=new ReferenceEntry(font,skin);fields_[i]=field;field->numeric=true;field->numericStep=i==0||i==1||i==3?.01:1;field->suffix=i==2||i==4?U"%":i==3?U"°":U"";field->gesture=[this](bool end){gesture_(end);};addChild(field);field->Change.connect([this,i]{if(syncing_)return;try{std::size_t used=0;const auto value=std::stod(fields_[i]->text(),&used);if(used==fields_[i]->text().size())change(i,value);}catch(const std::exception&){}});field->blur=[this]{gesture_(true);sync();};field->accept=[this]{gesture_(true);sync();};field->cancel=[this]{dismiss();};field->focus=[this,i]{const int next=i>=2?i-2:-1;if(expanded_!=next){const auto previous=minimumDialogSize(0);expanded_=next;const auto nextSize=minimumDialogSize(0);auto box=bounds();box.h+=nextSize.h-previous.h;setBounds(box);layout();invalidate();}};}
 for(int i=0;i<3;++i){auto slider=new PixelSlider(font,skin);sliders_[i]=slider;addChild(slider);slider->interactionBegin=[this]{gesture_(false);};slider->interactionCommit=[this]{gesture_(true);};slider->interactionCancel=[this]{gesture_(true);};slider->changed=[this,i](int n){change(i+2,i==0?n/100.:double(n));};slider->valueLabel=[i](int n){return unicodeText(number(i==0?n/100.:double(n)))+(i==1?U"°":U"%");};}
 const std::u32string labels[]{U"水平翻转",U"垂直翻转",U"",U"",U"",U"",U""};const char* glyphs[]{"","","unlock","export","refresh","canvasTop","delete"};
 auto tips=new ui::TooltipManager;addChild(tips);const char* descriptions[]{"水平翻转","垂直翻转","锁定／解锁参考图","固定屏幕尺寸","重置尺寸、角度与翻转","置于同组参考图最上层","删除参考图"};
 for(int i=0;i<7;++i){buttons_[i]=new PixelButton(font,skin,labels[i],[this,i]{gesture_(true);action_(i);sync();if(i==6)dismiss();});if(*glyphs[i]){buttons_[i]->icon=glyphs[i];buttons_[i]->iconSkin=&icons;buttons_[i]->skinStyle="icon_button";}addChild(buttons_[i]);tips->addTooltipFor(buttons_[i],descriptions[i]);}
 close_=new PixelButton(font,skin,U"",[this]{dismiss();});close_->icon="close";close_->iconSkin=&icons;close_->skinStyle="icon_button";addChild(close_);sync();
}
void CanvasReferenceDialog::filters(bool enabled){if(enabled==extraFilters_)return;extraFilters_=enabled;for(auto type:{ui::kMouseWheelMessage,ui::kFocusEnterMessage,ui::kFocusLeaveMessage}){if(enabled)ui::Manager::getDefault()->addMessageFilter(type,this);else ui::Manager::getDefault()->removeMessageFilter(type,this);}}
CanvasReferenceDialog::~CanvasReferenceDialog(){filters(false);if(!finished_)gesture_(true);}
void CanvasReferenceDialog::dismiss(){if(finished_)return;finished_=true;gesture_(true);closeWindow(nullptr);}
void CanvasReferenceDialog::change(int i,double n){if(!std::isfinite(n))return;const auto* r=read_();if(!r||r->locked)return;ReferencePatch p;switch(i){case 0:p.x=n;break;case 1:p.y=n;break;case 2:if(n<.01)return;p.width=r->initial.value_or(*r).width*n/100;break;case 3:p.angle=n;break;case 4:if(n<0||n>100)return;p.opacity=n/100;break;}update_(p);sync();}
void CanvasReferenceDialog::sync(){const auto* r=read_();if(!r)return;syncing_=true;const double values[]{r->x,r->y,r->width/r->initial.value_or(*r).width*100,r->angle,r->opacity.value_or(1)*100};for(int i=0;i<5;++i){fields_[i]->setEnabled(!r->locked);if(!fields_[i]->hasFocus())fields_[i]->setText(number(std::floor(values[i]*100+.5)/100));}for(int i=0;i<3;++i){auto s=sliders_[i];s->setEnabled(!r->locked);s->minimum=i==0?1:i==1?int(std::clamp(values[3],-100000000.,-180.)):0;s->maximum=i==0?int(std::min(100000000.,std::max(1000.,values[2])*100)):i==1?int(std::min(100000000.,std::max(180.,values[3]))):100;s->value=int(std::clamp(values[i+2]*(i==0?100:1),double(s->minimum),double(s->maximum)));}for(int i=0;i<7;++i)buttons_[i]->setEnabled(i==2||i==5||!r->locked);buttons_[0]->active=r->flipX;buttons_[1]->active=r->flipY;buttons_[2]->active=r->locked;buttons_[2]->icon=r->locked?"lock":"unlock";buttons_[3]->active=r->floating.value_or(false);syncing_=false;layout();invalidate();}
gfx::Size CanvasReferenceDialog::minimumDialogSize(int)const{const int label=font_.measure(U"不透明度"),field=fields_[3]->widthForValue(U"-1000000.00°"),flips=2*font_.measure(U"水平翻转")+2*UiSpacing::padding*2+UiSpacing::related;const int width=std::max(label+UiSpacing::related+field,flips)+2*UiSpacing::padding;const int rows=5*DialogLayout::rowStep-UiSpacing::related+(expanded_>=0?DialogLayout::rowStep:0);return {width*uiScale,(DialogLayout::bodyTop+rows+UiSpacing::group+textControlHeight+UiSpacing::group+UiSpacing::iconSize+UiSpacing::padding)*uiScale};}
void CanvasReferenceDialog::layout(){
 const auto r=bounds();if(!close_)return;layoutHeaderButton(close_);const int width=r.w/uiScale;
 const int x=UiSpacing::padding+font_.measure(U"不透明度")+UiSpacing::related,fieldWidth=width-x-UiSpacing::padding;
 int y=DialogLayout::bodyTop;
 for(int i=0;i<5;++i){fields_[i]->setBounds(uiDisplayRect({x,y,fieldWidth,textControlHeight},r.origin()));y+=DialogLayout::rowStep;
  if(i>=2){auto slider=sliders_[i-2];slider->setVisible(expanded_==i-2);if(expanded_==i-2){slider->setBounds(uiDisplayRect({x,y,fieldWidth,textControlHeight},r.origin()));y+=DialogLayout::rowStep;}}
 }
 y+=UiSpacing::group-UiSpacing::related;const int buttonWidth=(width-2*UiSpacing::padding-UiSpacing::related)/2;
 for(int i=0;i<2;++i)buttons_[i]->setBounds(uiDisplayRect({UiSpacing::padding+i*(buttonWidth+UiSpacing::related),y,buttonWidth,textControlHeight},r.origin()));
 y+=textControlHeight+UiSpacing::group;
 for(int i=2;i<7;++i)buttons_[i]->setBounds(uiDisplayRect({i==6?width-UiSpacing::padding-UiSpacing::iconSize:UiSpacing::padding+(i-2)*(UiSpacing::iconSize+UiSpacing::related),y,UiSpacing::iconSize,UiSpacing::iconSize},r.origin()));
}
void CanvasReferenceDialog::onResize(ui::ResizeEvent& ev){setBoundsQuietly(ev.bounds());layout();}
void CanvasReferenceDialog::paintDialogContents(ui::PaintEvent& ev){auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());const auto* image=read_();auto title=image?unicodeText(image->name):U"参考图";const int available=std::max(0,r.w-UiSpacing::padding-5-UiSpacing::iconSize-UiSpacing::related);while(!title.empty()&&font_.measure(title)>available)title.pop_back();drawDialogTitle(font_,g,r,title);const char32_t* labels[]{U"X",U"Y",U"缩放",U"角度",U"不透明度"};int y=DialogLayout::bodyTop;for(int i=0;i<5;++i){font_.draw(g,labels[i],r.x+UiSpacing::padding,DialogLayout::centeredInkY(font_,labels[i],r.y+y,textControlHeight),skin_["text"]);y+=DialogLayout::rowStep;if(i>=2&&expanded_==i-2)y+=DialogLayout::rowStep;}}
bool CanvasReferenceDialog::onProcessMessage(ui::Message* msg){
 if(msg->type()==ui::kOpenMessage)filters(true);
 if(msg->type()==ui::kCloseMessage){filters(false);if(!finished_){finished_=true;gesture_(true);}}
 if(isVisible()){
  if(auto focus=dynamic_cast<ui::FocusMessage*>(msg);focus&&(msg->type()==ui::kFocusEnterMessage||msg->type()==ui::kFocusLeaveMessage)){
   const auto next=focus->newFocus();if(!next||next->window()!=this){dismiss();return false;}
   bool keep=false;for(int i=2;i<5;++i)keep|=next==fields_[i]||next==sliders_[i-2];
   if(!keep&&expanded_>=0){const auto old=minimumDialogSize(0);expanded_=-1;auto box=bounds();box.h+=minimumDialogSize(0).h-old.h;setBounds(box);layout();invalidate();}
  }
  if(msg->type()==ui::kMouseWheelMessage){const auto mouse=static_cast<ui::MouseMessage*>(msg);if(mouse->display()&&mouse->display()!=display()||!bounds().contains(mouse->position())){dismiss();return false;}}
  if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()==ui::kKeyEsc){dismiss();return true;}const auto focus=ui::Manager::getDefault()->getFocus();if(!focus||focus->window()!=this){dismiss();return false;}}
 }
 if(processDialogGeometry(msg))return true;return PixelDialog::onProcessMessage(msg);
}
}
