#pragma once
#include "color_picker_model.h"
#include <optional>
#include <utility>
namespace moon {
constexpr double pickerWheelInset=1./255,pickerWheelScale=1-2*pickerWheelInset,pickerWheelPi=3.1415926535897932384626433832795;
struct PickerWheelPoint {double x=0,y=0;};
inline PickerWheelPoint pickerWheelRaw(double x,double y){return {((x-pickerWheelInset)/pickerWheelScale-.5)*2,((y-pickerWheelInset)/pickerWheelScale-.5)*2};}
inline bool pickerWheelRasterInside(double x,double y){auto xx=(x-pickerWheelInset)/pickerWheelScale,yy=(y-pickerWheelInset)/pickerWheelScale;if(xx<0||xx>1||yy<0||yy>1)return false;return std::hypot((xx-.5)*2,(yy-.5)*2)<=1;}
inline bool pickerWheelBeginHit(double x,double y){auto p=pickerWheelRaw(x,y);if(std::hypot(p.x,p.y)>1)return false;auto ix=std::clamp(std::floor((p.x+1)*.5*255+.5),0.,255.),iy=std::clamp(std::floor((p.y+1)*.5*255+.5),0.,255.);return pickerWheelRasterInside(ix/255,iy/255);}
inline PickerHsv pickerWheelInputHsv(PickerHsv source,double x,double y){auto p=pickerWheelRaw(x,y);auto radius=std::hypot(p.x,p.y);if(radius>1&&radius>0){p.x/=radius;p.y/=radius;}return {pickerHue(std::atan2(p.y,p.x)*180/pickerWheelPi),std::min(1.,std::hypot(p.x,p.y)),source.v};}
inline std::optional<std::uint32_t> pickerWheelRasterColor(double x,double y,double value){if(!pickerWheelRasterInside(x,y))return {};auto p=pickerWheelRaw(x,y);return pickerHsvToRgb({pickerHue(std::atan2(p.y,p.x)*180/pickerWheelPi),std::min(1.,std::hypot(p.x,p.y)),value});}
inline std::pair<double,double> pickerWheelMarker(PickerHsv s){auto r=s.h*pickerWheelPi/180;return {pickerWheelInset+(std::cos(r)*s.s+1)*.5*pickerWheelScale,pickerWheelInset+(std::sin(r)*s.s+1)*.5*pickerWheelScale};}
inline int pickerWheelCoverage(int x,int y,int side){auto r=std::hypot(x+.5-side*.5,y+.5-side*.5),outer=side*.5-1;if(outer<=0||r>outer)return 0;return r>=outer-1?2:1;}
}
