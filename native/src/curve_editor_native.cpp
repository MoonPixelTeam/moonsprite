#include "curve_editor_native.h"
#include "ui/graphics.h"
#include "ui/paint_event.h"
#include "ui/message.h"
#include "ui_scale.h"
#include <algorithm>
#include <cmath>
namespace moon::editor {
CurveEditorNative::CurveEditorNative(const Skin& skin):ui::Widget(ui::kGenericWidget),skin_(skin) {setVisible(false);setFocusStop(true);}

CurvePoint CurveEditorNative::eventPoint(gfx::Point p)const {return {double(adjustmentByte(std::clamp(((p.x-bounds().x)/double(std::max(1,bounds().w))*124-12)/100,0.0,1.0)*255)),double(adjustmentByte(std::clamp(1-((p.y-bounds().y)/double(std::max(1,bounds().h))*124-10)/100,0.0,1.0)*255))};}

gfx::Point CurveEditorNative::pointPosition(CurvePoint p)const {return {bounds().x+int((12+p.x/255*100)/124*bounds().w),bounds().y+int((10+(255-p.y)/255*100)/124*bounds().h)};}

void CurveEditorNative::notify() {if(changed)changed();invalidate();}

void CurveEditorNative::resetChannel() {if(!points)return;*points={{0,0},{255,255}};selected=active_=-1;notify();}

void CurveEditorNative::deleteSelected() {if(!points || selected<=0 || selected>=int(points->size())-1)return;points->erase(points->begin()+selected);selected=active_=-1;notify();}

void CurveEditorNative::selectChannel() {active_=selected=-1;if(hasCapture())releaseMouse();invalidate();}

void CurveEditorNative::setCoordinate(int axis,double value) {if(!points || points->empty())return;int index=selected>=0&&selected<int(points->size())?selected:0;auto& p=(*points)[index];if(axis==0){if(index==0 || index==int(points->size())-1)return;p.x=std::max((*points)[index-1].x+1,std::min((*points)[index+1].x-1,double(adjustmentByte(value))));}else p.y=adjustmentByte(value);selected=index;notify();}

bool CurveEditorNative::onProcessMessage(ui::Message* msg) {if(!points)return ui::Widget::onProcessMessage(msg);if(msg->type()==ui::kKeyDownMessage){auto k=static_cast<ui::KeyMessage*>(msg);if(k->scancode()==ui::kKeyDel || k->scancode()==ui::kKeyBackspace){deleteSelected();return true;}}if(msg->type()!=ui::kMouseDownMessage && msg->type()!=ui::kDoubleClickMessage && msg->type()!=ui::kMouseMoveMessage && msg->type()!=ui::kMouseUpMessage)return ui::Widget::onProcessMessage(msg);auto m=static_cast<ui::MouseMessage*>(msg);if(msg->type()==ui::kMouseDownMessage || msg->type()==ui::kDoubleClickMessage){int hit=-1;for(int i=0;i<int(points->size());++i){auto at=pointPosition((*points)[i]);if(std::hypot(double(at.x-m->position().x),double(at.y-m->position().y))<=12*uiScale){hit=i;break;}}if(m->right() || msg->type()==ui::kDoubleClickMessage){if(hit>0&&hit<int(points->size())-1){selected=hit;deleteSelected();}return true;}if(!m->left())return false;requestFocus();captureMouse();if(hit<0){auto p=eventPoint(m->position());points->push_back(p);std::stable_sort(points->begin(),points->end(),[](auto a,auto b){return a.x<b.x;});hit=int(std::find_if(points->begin(),points->end(),[&](auto q){return q.x==p.x&&q.y==p.y;})-points->begin());}active_=selected=hit;notify();return true;}if(msg->type()==ui::kMouseMoveMessage && hasCapture() && active_>=0 && active_<int(points->size())){auto p=eventPoint(m->position());p.x=active_==0?0:active_==int(points->size())-1?255:std::max((*points)[active_-1].x+1,std::min((*points)[active_+1].x-1,p.x));(*points)[active_]=p;notify();return true;}if(msg->type()==ui::kMouseUpMessage){active_=-1;if(hasCapture())releaseMouse();return true;}return ui::Widget::onProcessMessage(msg);}

void CurveEditorNative::onPaint(ui::PaintEvent& ev) {if(!points)return;auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());g.fillRect(skin_["background"],r);auto pos=[&](double x,double y){return gfx::Point(int((12+x/255*100)/124*r.w),int((10+(255-y)/255*100)/124*r.h));};const auto lo=pos(0,0),hi=pos(255,255);for(int value=0;value<=4;++value){auto p=pos(value*255.0/4,value*255.0/4);g.drawLine(skin_["panel"],{p.x,hi.y},{p.x,lo.y});g.drawLine(skin_["panel"],{lo.x,p.y},{hi.x,p.y});}const auto ink=channel==1?gfx::rgba(224,100,100):channel==2?gfx::rgba(100,200,130):channel==3?gfx::rgba(110,150,235):skin_["text"];if(histogram){unsigned maximum=1;for(auto n:*histogram)maximum=std::max(maximum,n);for(int x=0;x<256;++x)if((*histogram)[x]){auto p=pos(x,0);int height=std::max(1,int(double((*histogram)[x])/maximum*(lo.y-hi.y-4)));g.fillRect(skin_["panel"],{p.x,lo.y-height,1,height});}}auto lut=buildCurveLut(*points);for(int x=1;x<256;++x)g.drawLine(ink,pos(x-1,lut[x-1]),pos(x,lut[x]));for(int i=0;i<int(points->size());++i){auto p=pos((*points)[i].x,(*points)[i].y);g.fillRect(skin_["background"],{p.x-2,p.y-2,5,5});g.drawRect(i==selected?skin_["text"]:ink,{p.x-2,p.y-2,5,5});}}
}
