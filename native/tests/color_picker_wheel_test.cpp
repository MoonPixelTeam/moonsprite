#include "color_picker_scheme.h"
#include <cmath>
#include <iostream>
#include <stdexcept>
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
using namespace moon;
int main(){try{CHECK(parseColorPickerScheme("wheel")==ColorPickerScheme::Wheel);CHECK(pickerWheelBeginHit(.5,.5));CHECK(!pickerWheelBeginHit(0,0));CHECK(!pickerWheelBeginHit(1,.5));for(double h:{0.,90.,180.,270.}){auto radians=h*pickerWheelPi/180;double x=pickerWheelInset+(std::cos(radians)*.75+1)*.5*pickerWheelScale,y=pickerWheelInset+(std::sin(radians)*.75+1)*.5*pickerWheelScale;CHECK(pickerWheelBeginHit(x,y));auto hsv=pickerWheelInputHsv({200,.2,.4},x,y);CHECK(std::abs(hsv.h-h)<1e-9&&std::abs(hsv.s-.75)<1e-9&&hsv.v==.4);auto marker=pickerWheelMarker(hsv);CHECK(std::abs(marker.first-x)<1e-9&&std::abs(marker.second-y)<1e-9);}auto outside=pickerWheelInputHsv({30,.2,.6},3,.5);CHECK(outside.h==0&&outside.s==1&&outside.v==.6);CHECK(!pickerWheelRasterColor(0,0,.5));CHECK(pickerWheelRasterColor(.5,.5,.5)==0xff808080);CHECK(pickerWheelCoverage(0,0,100)==0&&pickerWheelCoverage(50,50,100)==1);std::cout<<"Wheel mask, continuous polar HSV, projection, marker and raster passed\n";return 0;}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
