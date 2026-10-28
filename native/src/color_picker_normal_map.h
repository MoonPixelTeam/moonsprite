#pragma once
#include "color_picker_model.h"
#include "color_picker_wheel.h"
#include <optional>
namespace moon {
struct PickerNormalVector {double x=0,y=0;};
inline PickerNormalVector pickerNormalProject(double x,double y){double r=std::hypot(x,y);return r>1&&r>0?PickerNormalVector{x/r,y/r}:PickerNormalVector{x,y};}
inline PickerNormalVector pickerNormalQuantize(double x,double y,int hueSteps=0,int colorSteps=0){double r=std::clamp(std::hypot(x,y),0.,1.),angle=std::atan2(y,x),tau=pickerWheelPi*2;if(hueSteps>0)angle=std::floor(std::fmod(std::fmod(angle,tau)+tau,tau)/(tau/hueSteps)+.5)*(tau/hueSteps);r=colorSteps>1?std::floor(r*(colorSteps-1)+.5)/(colorSteps-1):colorSteps==1?0:r;return {std::cos(angle)*r,std::sin(angle)*r};}
inline std::uint32_t pickerNormalMapColorAt(double x,double y,int alpha=255){auto n=pickerNormalProject(x,y);double r=std::min(1.,std::hypot(n.x,n.y)),z=std::sqrt(std::max(0.,1-r*r));return std::uint32_t(pickerByte((n.x*.5+.5)*255))|(std::uint32_t(pickerByte((-n.y*.5+.5)*255))<<8)|(std::uint32_t(pickerByte(z*255))<<16)|(std::uint32_t(pickerByte(alpha))<<24);}
inline PickerNormalVector pickerNormalVectorFromColor(std::uint32_t c){return pickerNormalProject(double(c&255)/127.5-1,1-double((c>>8)&255)/127.5);}
inline bool pickerNormalMapBeginHit(double x,double y){return std::hypot((x-.5)*2,(y-.5)*2)<=1;}
inline std::uint32_t pickerNormalMapInputColor(double x,double y,int alpha){auto p=pickerNormalProject((x-.5)*2,(y-.5)*2);auto n=pickerNormalQuantize(p.x,p.y);return pickerNormalMapColorAt(n.x,n.y,alpha);}
inline std::optional<std::uint32_t> pickerNormalMapRasterColor(double x,double y){double rx=(x-pickerWheelInset)/pickerWheelScale,ry=(y-pickerWheelInset)/pickerWheelScale;if(rx<0||rx>1||ry<0||ry>1)return {};double dx=(rx-.5)*2,dy=(ry-.5)*2;if(std::hypot(dx,dy)>1)return {};auto n=pickerNormalQuantize(dx,dy);return pickerNormalMapColorAt(n.x,n.y);}
inline std::pair<double,double> pickerNormalMapMarker(PickerHsv source){auto v=pickerNormalVectorFromColor(pickerHsvToRgb(source));auto n=pickerNormalQuantize(v.x,v.y);return {pickerWheelInset+(n.x+1)*.5*pickerWheelScale,pickerWheelInset+(n.y+1)*.5*pickerWheelScale};}
}
