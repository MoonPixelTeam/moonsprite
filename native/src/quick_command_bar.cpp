#include "quick_command_bar.h"
#include "quick_command_metadata.h"
#include "quick_command_tooltip.h"
#include "quick_command_composite.h"
#include "ui/message.h"
#include "ui_scale.h"
#include <algorithm>
#include <stdexcept>
namespace moon {

class QuickCommandBar::Control : public PixelButton {
 QuickCommandBar& owner_;std::string id_;bool down_=false;ui::Timer release_{100,this};
public:
 Control(QuickCommandBar& owner,std::string id,std::string image):PixelButton(owner.font_,owner.skin_,U"",[]{}),owner_(owner),id_(std::move(id)){
  iconSkin=&owner.icons_;icon=std::move(image);skinStyle="icon_button";setFocusStop(false);
  release_.Tick.connect([this]{release_.stop();down_=false;setSelected(false);invalidate();});
 }
 bool onProcessMessage(ui::Message* message) override {
  if(down_&&!hasCapture()){const bool moving=owner_.moving_;owner_.moving_=false;down_=false;setSelected(false);if(moving&&owner_.changed)owner_.changed(owner_.bar_);}
  if(!isEnabled())return PixelButton::onProcessMessage(message);
  const auto type=message->type();if(type==ui::kMouseEnterMessage||type==ui::kMouseLeaveMessage){owner_.invalidate();for(auto b:owner_.controls_)b->invalidate();}
  if(type==ui::kMouseDownMessage){auto m=static_cast<ui::MouseMessage*>(message);if(m->right()){if(owner_.execute)owner_.execute(id_,true);return true;}if(!m->left())return false;
   release_.stop();down_=true;setSelected(true);captureMouse();
   if(id_=="move"){owner_.moving_=true;const auto r=owner_.bounds();const bool v=owner_.bar_.edge==quick::Edge::Left||owner_.bar_.edge==quick::Edge::Right;owner_.drag_={owner_.bar_.edge,double(v?m->position().y-r.center().y:m->position().x-r.center().x)/uiScale};}invalidate();return true;
  }
  if(type==ui::kMouseMoveMessage&&hasCapture()&&owner_.moving_){auto m=static_cast<ui::MouseMessage*>(message);const auto v=owner_.viewport_,r=owner_.bounds();
   auto result=quick::moveBar(owner_.drag_,{0,0,double(v.w)/uiScale,double(v.h)/uiScale},{0,0,double(r.w)/uiScale,double(r.h)/uiScale},double(m->position().x-v.x)/uiScale,double(m->position().y-v.y)/uiScale,unsigned(std::count_if(owner_.bar_.commands.begin(),owner_.bar_.commands.end(),[](auto& c){return c.enabled;})));
   owner_.bar_.edge=result.edge;owner_.bar_.position=result.position;owner_.layoutControls();return true;
  }
  if(type==ui::kMouseUpMessage&&down_){down_=false;bool activate=bounds().contains(static_cast<ui::MouseMessage*>(message)->position());if(hasCapture())releaseMouse();
   if(owner_.moving_){owner_.moving_=false;if(owner_.changed)owner_.changed(owner_.bar_);}else if(activate){if(id_=="toggle"){owner_.bar_.expanded=!owner_.bar_.expanded;if(owner_.changed)owner_.changed(owner_.bar_);}else if(id_=="settings"){if(owner_.settings)owner_.settings();}else if(owner_.execute)owner_.execute(id_,false);}
   if(id_=="toggle"){setSelected(false);invalidate();}else release_.start();return true;
  }
  if(type==ui::kFocusLeaveMessage&&down_){if(hasCapture())releaseMouse();down_=false;setSelected(false);if(owner_.moving_){owner_.moving_=false;if(owner_.changed)owner_.changed(owner_.bar_);}}
  return PixelButton::onProcessMessage(message);
 }
 void onPaint(ui::PaintEvent& event) override {
  auto paint=[&]{
  auto& g=*event.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());
  bool hover=owner_.hasMouse()||hasMouse();for(auto b:owner_.controls_)hover=hover||b->hasMouse();
  const int opacity=owner_.translucent_&&!hover&&!owner_.moving_?51:255;
  const char* state=!isEnabled()?"disabled":(down_||isSelected())?"pressed":active?"selected":hasMouse()?"hover":"normal";
  owner_.skin_.draw(g,std::string("icon_button.")+state,r,false,opacity);
  owner_.icons_.draw(g,icon+(isEnabled()?"":"-disabled"),{r.x+(r.w-11)/2,r.y+(r.h-11)/2,11,11},true,opacity);
  };
  if(auto composite=std::dynamic_pointer_cast<quick::Composite>(owner_.getProperty(quick::Composite::key)))composite->paint(*this,event,paint);else paint();
 }
};
QuickCommandBar::QuickCommandBar(const PixelFont& f,const Skin& s,const Skin& icons):font_(f),skin_(s),icons_(icons){tips_=new ui::TooltipManager;addChild(tips_);}
void QuickCommandBar::sync(const quick::Bar& bar,gfx::Rect viewport,bool translucent,bool interactive){
 if(!moving_)bar_=bar;viewport_=viewport;if(translucent_!=translucent){translucent_=translucent;invalidate();for(auto b:controls_)b->invalidate();}
 if(controls_.empty()){
  auto add=[&](const std::string& id,const std::string& icon,const std::u32string& label){auto b=new Control(*this,id,icon);addChild(b);controls_.push_back(b);tips_->addTooltipFor(b,utf8Text(label));};
  add("toggle","down",U"展开／折叠快捷指令栏");for(auto& m:quick::metadata)add(m.id,m.icon,m.label);add("settings","properties",U"快捷指令栏设置");add("move","move",U"拖动快捷指令栏");
 }
 auto updateTip=[&](ui::Widget* widget,const std::string& text){if(tips_->getTooltipFor(widget)!=text){tips_->removeTooltipFor(widget);tips_->addTooltipFor(widget,text);}};
 updateTip(controls_[0],utf8Text(std::u32string(bar_.expanded?U"折叠快捷指令栏":U"展开快捷指令栏")+U"\n显示或收起常用的画布与选区指令。"));
 updateTip(controls_[controls_.size()-2],utf8Text(U"设置快捷指令栏\n打开首选项中的快捷指令栏设置，选择按钮并调整显示顺序。"));
 updateTip(controls_.back(),utf8Text(U"移动快捷指令栏\n按住并拖动到画布边缘，可将快捷指令栏停靠在上、下、左、右任意一侧。"));
 const std::string toggleIcon=bar_.expanded?"up":"down";if(controls_[0]->icon!=toggleIcon){controls_[0]->icon=toggleIcon;controls_[0]->invalidate();}
 for(unsigned i=0;i<std::size(quick::metadata);++i){const auto& m=quick::metadata[i];auto b=controls_[i+1];const bool available=enabled&&enabled(m.id);b->setEnabled(interactive&&available);const bool active=checked&&checked(m.id);if(b->active!=active){b->active=active;b->invalidate();}auto label=std::u32string(m.label);if(m.description&&*m.description)label+=U"\n"+std::u32string(m.description);if(!available)label+=U" · 当前不可用／尚未迁移";auto text=utf8Text(label);if(m.shortcut&&*m.shortcut)if(auto provider=std::dynamic_pointer_cast<quick::ShortcutTooltip>(getProperty(quick::ShortcutTooltip::key))){const auto binding=provider->resolve(m.shortcut);if(!binding.empty())text+="\n"+binding;}if(tips_->getTooltipFor(b)!=text){tips_->removeTooltipFor(b);tips_->addTooltipFor(b,text);}}
 controls_[0]->setEnabled(interactive);controls_[controls_.size()-2]->setEnabled(interactive);controls_.back()->setEnabled(interactive);layoutControls();
}
void QuickCommandBar::layoutControls(){
 if(controls_.empty())return;const bool vertical=bar_.edge==quick::Edge::Left||bar_.edge==quick::Edge::Right;
 std::vector<Control*> visible{controls_[0]};if(bar_.expanded){for(auto& c:bar_.commands)if(c.enabled)for(unsigned i=0;i<std::size(quick::metadata);++i)if(c.id==quick::metadata[i].id)visible.push_back(controls_[i+1]);visible.push_back(controls_[controls_.size()-2]);visible.push_back(controls_.back());}
 const int cell=15*uiScale,gap=2*uiScale,pad=2*uiScale,desired=int(visible.size())*(cell+gap)-gap+pad*2;
 const int length=std::max(0,std::min(desired,(vertical?viewport_.h:viewport_.w)-16*uiScale)),thickness=cell+pad*2;
 gfx::Rect next(0,0,vertical?thickness:length,vertical?length:thickness);
 if(vertical){next.x=bar_.edge==quick::Edge::Left?viewport_.x+2*uiScale:viewport_.x2()-next.w-2*uiScale;next.y=viewport_.y+int(viewport_.h*bar_.position)-next.h/2;}else{next.x=viewport_.x+int(viewport_.w*bar_.position)-next.w/2;next.y=bar_.edge==quick::Edge::Top?viewport_.y+2*uiScale:viewport_.y2()-next.h-2*uiScale;}
 const auto old=bounds();if(old!=next){if(parent())parent()->invalidateRect(old);setBounds(next);if(parent())parent()->invalidateRect(next);}
 for(auto c:controls_)if(std::find(visible.begin(),visible.end(),c)==visible.end()&&c->isVisible())c->setVisible(false);int offset=pad;for(auto c:visible){auto r=vertical?gfx::Rect(next.x+pad,next.y+offset,cell,cell):gfx::Rect(next.x+offset,next.y+pad,cell,cell);if(c->bounds()!=r)c->setBounds(r);const bool show=next.contains(r);if(c->isVisible()!=show)c->setVisible(show);offset+=cell+gap;}
}
void QuickCommandBar::onPaint(ui::PaintEvent& event){auto paint=[&]{auto& g=*event.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());bool hover=hasMouse();for(auto b:controls_)hover=hover||b->hasMouse();skin_.draw(g,"panel_outer",r,false,translucent_&&!hover&&!moving_?51:255);};if(auto composite=std::dynamic_pointer_cast<quick::Composite>(getProperty(quick::Composite::key)))composite->paint(*this,event,paint);else paint();}
void QuickCommandBar::smoke(){if(controls_.size()!=41)throw std::runtime_error("Quick command controls missing");auto toggle=controls_[0];auto r=toggle->bounds();ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,r.center()),up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,r.center());const bool before=bar_.expanded;toggle->onProcessMessage(&down);toggle->onProcessMessage(&up);toggle->onProcessMessage(&up);if(bar_.expanded==before)throw std::runtime_error("Duplicate release toggled quick bar twice");}
}
