#pragma once
#include "sprite_sheet_import.h"
#include "reference_images.h"
namespace moon::sheet_preview {
// SpriteSheetImportPreview's view and drag state, in UI logical pixels.
enum class Mode { Move,Draw,Left,Top,Right,Bottom,PaddingX,PaddingY,Pan };
struct Point {double x=0,y=0;};
struct View {
 std::optional<double> zoom;Point pan;
 double scale(int w,int h,double vw,double vh)const{return zoom.value_or(referenceFit(std::min((vw-48)/w,(vh-48)/h)));}
 Point origin(int w,int h,double vw,double vh)const{const auto z=scale(w,h,vw,vh);return {(vw-w*z)/2+pan.x,(vh-h*z)/2+pan.y};}
 void wheel(int w,int h,double vw,double vh,Point pointer,bool in){const auto z=scale(w,h,vw,vh),next=std::clamp(z*(in?1.2:1/1.2),.01,256.);const auto p=referenceAnchoredPan(w,h,vw,vh,{pointer.x,pointer.y},{pan.x,pan.y},z,next);pan={p.x,p.y};zoom=next;}
 void fit(){zoom.reset();pan={};}
};
struct Drag {Mode mode;double x,y;SheetImportOptions initial;Point pan;};
inline Drag begin(const SheetImportOptions& o,Point p,double z,Point pan,bool panGesture){
 auto nearEdge=[&](double a,double b){return std::abs(a-b)*z<=7;};
 const bool ix=p.x>=o.x&&p.x<=double(o.x)+o.width,iy=p.y>=o.y&&p.y<=double(o.y)+o.height;
 const auto mode=panGesture?Mode::Pan:iy&&nearEdge(p.x,o.x)?Mode::Left:iy&&nearEdge(p.x,double(o.x)+o.width)?Mode::Right:ix&&nearEdge(p.y,o.y)?Mode::Top:ix&&nearEdge(p.y,double(o.y)+o.height)?Mode::Bottom:iy&&o.paddingX>0&&nearEdge(p.x,double(o.x)+o.width+o.paddingX)?Mode::PaddingX:ix&&o.paddingY>0&&nearEdge(p.y,double(o.y)+o.height+o.paddingY)?Mode::PaddingY:ix&&iy?Mode::Move:Mode::Draw;
 return {mode,std::floor(p.x),std::floor(p.y),o,pan};
}
inline SheetImportOptions moved(const Drag& d,Point p){
 const auto x=std::floor(p.x),y=std::floor(p.y),dx=x-d.x,dy=y-d.y;auto n=d.initial;
 // JS numbers are unbounded doubles; reject native unrepresentable drafts
 // before converting rather than wrapping them into a different tile.
 auto integer=[](double v){if(!std::isfinite(v)||v<INT32_MIN||v>INT32_MAX)throw std::length_error("Sprite sheet drag exceeds native coordinate range");return int(v);};
 switch(d.mode){
 case Mode::Move:n.x=integer(double(n.x)+dx);n.y=integer(double(n.y)+dy);break;
 case Mode::Draw:n.x=integer(std::min(x,d.x));n.y=integer(std::min(y,d.y));n.width=integer(std::abs(dx)+1);n.height=integer(std::abs(dy)+1);break;
 case Mode::Right:n.width=integer(std::max(1.,double(n.width)+dx));break;
 case Mode::Bottom:n.height=integer(std::max(1.,double(n.height)+dy));break;
 case Mode::Left:n.x=integer(std::min(double(n.x)+dx,double(n.x)+n.width-1));n.width=integer(double(d.initial.x)+d.initial.width-n.x);break;
 case Mode::Top:n.y=integer(std::min(double(n.y)+dy,double(n.y)+n.height-1));n.height=integer(double(d.initial.y)+d.initial.height-n.y);break;
 case Mode::PaddingX:n.paddingX=integer(std::max(0.,double(n.paddingX)+dx));break;
 case Mode::PaddingY:n.paddingY=integer(std::max(0.,double(n.paddingY)+dy));break;
 default:break;
 }return n;
}
}
