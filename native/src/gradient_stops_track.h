#pragma once
#include "native_widgets.h"
#include "gradient_model.h"
#include "ui_scale.h"
#include "ui/message.h"
#include "ui/graphics.h"
#include "ui/paint_event.h"
#include <algorithm>
#include <cmath>
namespace moon::editor {
using namespace moon;
// GradientStopsEditor pointer capture/ordered identity, ported to laf.

class GradientStopsTrack : public ui::Widget {

 const Skin& icons_;bool dragging_=false,moved_=false,remove_=false;gfx::Point press_;double original_=0;

public:

 std::vector<GradientStop>* stops=nullptr;int* selected=nullptr;std::function<void()> changed,activateColor;

 explicit GradientStopsTrack(const Skin& icons):ui::Widget(ui::kGenericWidget),icons_(icons){setTransparent(true);}

 void onPaint(ui::PaintEvent& ev)override{if(!stops || stops->size()<2)return;auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());GradientSpec s;s.stops=*stops;GradientSampler sampler(s);for(int x=0;x<r.w;++x){const auto c=sampler.forAmount(double(x)/std::max(1,r.w-1),0,0);g.fillRect(gfx::rgba(c&255,(c>>8)&255,(c>>16)&255,255),gfx::Rect(x,0,1,3));}for(int i=0;i<int(stops->size());++i){const auto& stop=(*stops)[i];const int x=gradientRound(stop.position*(r.w-11));if(i==*selected)g.drawRect(gfx::rgba(41,121,255,255),gfx::Rect(x-1,2,13,17));if(remove_ && i==*selected)continue;g.fillRect(gfx::rgba(stop.color&255,(stop.color>>8)&255,(stop.color>>16)&255,(stop.color>>24)&255),gfx::Rect(x+1,9,9,9));icons_.draw(g,"gradient-stop",gfx::Rect(x,3,11,16),true);}}

 bool onProcessMessage(ui::Message* msg)override{if(!stops || !selected || !isEnabled())return ui::Widget::onProcessMessage(msg);if(dragging_ && !hasCapture()){dragging_=moved_=remove_=false;}if(msg->type()!=ui::kMouseDownMessage && msg->type()!=ui::kDoubleClickMessage && msg->type()!=ui::kMouseMoveMessage && msg->type()!=ui::kMouseUpMessage)return ui::Widget::onProcessMessage(msg);const auto mouse=static_cast<ui::MouseMessage*>(msg);if(msg->type()==ui::kDoubleClickMessage){if(!mouse->left())return true;int hit=-1;for(int i=0;i<int(stops->size());++i){const int x=bounds().x+gradientRound((*stops)[i].position*(bounds().w/uiScale-11))*uiScale;if(gfx::Rect(x,bounds().y+3*uiScale,11*uiScale,16*uiScale).contains(mouse->position()))hit=i;}if(hit>=0){dragging_=moved_=remove_=false;if(hasCapture())releaseMouse();*selected=hit;if(changed)changed();if(activateColor)activateColor();}return true;}auto position=[&]{return std::clamp(double(mouse->position().x-bounds().x-5*uiScale)/std::max(1,bounds().w-11*uiScale),0.0,1.0);};

  if(msg->type()==ui::kMouseDownMessage && mouse->left()){int hit=-1;double distance=12*uiScale;for(int i=0;i<int(stops->size());++i){const double d=std::abs(mouse->position().x-(bounds().x+((*stops)[i].position*(bounds().w-11*uiScale)+5*uiScale)));if(d<distance){distance=d;hit=i;}}if(hit<0){const double p=std::clamp(position(),.001,.999);auto right=std::find_if(stops->begin(),stops->end(),[&](auto s){return s.position>=p;});if(right!=stops->end() && right!=stops->begin() && right->position-(right-1)->position>=.002){GradientSpec s;s.stops=*stops;GradientStop stop{p,GradientSampler(s).forAmount(p,0,0)};stops->insert(right,stop);*selected=int(std::find_if(stops->begin(),stops->end(),[&](auto v){return v.position==p;})-stops->begin());if(changed)changed();}return true;}*selected=hit;original_=(*stops)[hit].position;press_=mouse->position();dragging_=true;moved_=remove_=false;captureMouse();if(changed)changed();return true;}

  if(dragging_){if(msg->type()==ui::kMouseMoveMessage){if(mouse->button()==ui::kButtonNone){dragging_=moved_=remove_=false;if(hasCapture())releaseMouse();invalidate();return true;}if(!moved_ && std::hypot(double(mouse->position().x-press_.x),double(mouse->position().y-press_.y))<5)return true;moved_=true;remove_=stops->size()>2 && mouse->position().y>bounds().y2()+24*uiScale;if(!remove_){const double p=position();auto updated=(*stops)[*selected];if((p==0 || p==1) && updated.position!=p)for(int i=0;i<int(stops->size());++i)if(i!=*selected && (*stops)[i].position==p)(*stops)[i].position=original_;updated.position=p;(*stops)[*selected]=updated;std::stable_sort(stops->begin(),stops->end(),[](auto a,auto b){return a.position<b.position;});*selected=int(std::find_if(stops->begin(),stops->end(),[&](auto v){return v.position==updated.position && v.color==updated.color;})-stops->begin());}if(changed)changed();invalidate();}else if(msg->type()==ui::kMouseUpMessage){if(remove_ && stops->size()>2){stops->erase(stops->begin()+*selected);*selected=std::max(0,*selected-1);if(changed)changed();}dragging_=moved_=remove_=false;releaseMouse();invalidate();}return true;}return ui::Widget::onProcessMessage(msg);

 }

};

}
