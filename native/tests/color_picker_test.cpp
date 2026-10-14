#include "color_picker_layout.h"
#include <stdexcept>
#include <iostream>
#include <utility>
using namespace moon;
static void require(bool condition) {if(!condition) throw std::runtime_error("Color picker legacy contract failed");}
int main() {
  require(pickerHsvToRgb({0,1,1},180)==0xb40000ff);
  require(pickerHsvToRgb({60,1,1})==0xff00ffff);
  require(pickerHsvToRgb({120,1,1})==0xff00ff00);
  require(pickerHsvToRgb({180,1,1})==0xffffff00);
  require(pickerHsvToRgb({240,1,1})==0xffff0000);
  require(pickerHsvToRgb({300,1,1})==0xffff00ff);
  require(pickerHsvToRgb({-60,1,1})==pickerHsvToRgb({300,1,1}));
  // Broad RGB oracle invariant includes achromatic and channel ties.
  for(int r=0;r<256;r+=17) for(int g=0;g<256;g+=17) for(int b=0;b<256;b+=17) {
    const auto rgb=std::uint32_t(r|(g<<8)|(b<<16))|0x7f000000;
    require(pickerHsvToRgb(pickerRgbToHsv(rgb),127)==rgb);
  }
  PickerRole role;role.sync(0xb40000ff);role.field(0.75,0.2);
  const auto hsv=role.hsv;role.sync(role.color);
  require(role.hsv.h==hsv.h && role.hsv.s==hsv.s && role.hsv.v==hsv.v);
  role.hue(240);role.sync(0xb4808080);require(role.hsv.h==240);
  role.field(-1,2);require(role.color==0xb4000000);
  role.field(1,0);require(role.color==0xb4ff0000);
  role.alpha(255);require(role.color==0xffff0000);
  role.hue(361);require(role.hsv.h==1 && (role.color>>24)==255);
  PickerRole secondary;secondary.sync(0x120000ff);secondary.hue(120);
  require(secondary.color==0x1200ff00 && role.hsv.h==1);
  require(pickerShiftStep(13,100,true,true)==10);
  require(pickerShiftStep(359,359,false,true)==359);
  require(pickerShiftStep(13,359,false,true)==15);
  // Joined geometry: no gaps, no overlaps, full vertical and horizontal coverage.
  for(const auto dimensions:{std::pair<int,int>{104,180},{144,260},{4,12},{22,30}}) {
    const auto layout=pickerLayout(dimensions.first,dimensions.second);
    require(layout.field.x==0 && layout.field.w==dimensions.first);
    require(layout.field.y+layout.field.h==layout.hue.y);
    require(layout.hue.y+layout.hue.h==layout.alpha.y);
    require(layout.alpha.y+layout.alpha.h==dimensions.second);
    require(layout.hue.w==layout.field.w && layout.alpha.w==layout.field.w);
    for(auto region:{layout.field,layout.hue,layout.alpha}) {
      require(pickerCoordinate(region.x,region.x,region.w)==0);
      require(pickerCoordinate(region.x+region.w-1,region.x,region.w)==1);
      for(double x:{0.0,0.5,1.0}) for(double y:{0.0,0.5,1.0}) {
        const auto mark=pickerMarkerBox(region,x,y);
        require(mark.w==4 && mark.h==4 && mark.x>=region.x && mark.y>=region.y);
        require(mark.x+mark.w<=region.x+region.w && mark.y+mark.h<=region.y+region.h);
      }
    }
  }
  require(pickerLayout(3,100).field.w==0);
  require(pickerLayout(100,11).field.h==0);
  require(pickerLightMarker(0,0,0));require(!pickerLightMarker(255,255,255));
  require(pickerLightMarker(255,0,0));require(!pickerLightMarker(255,255,0));
  // At zero alpha, contrast depends on displayed checker, not the source RGB.
  auto whiteChecker=pickerComposite(0,0,0x00ffffff);
  auto blackChecker=pickerComposite(0x00ffffff,0,0);
  require(whiteChecker==0xffffffff && blackChecker==0xff000000);
  require(!pickerLightMarker(whiteChecker&255,(whiteChecker>>8)&255,(whiteChecker>>16)&255));
  require(pickerLightMarker(blackChecker&255,(blackChecker>>8)&255,(blackChecker>>16)&255));
  require(pickerComposite(0x000000ff,0.5,0)==0xff000080);
  std::cout<<"Color picker: 4096 RGB round trips, sectors, alpha, role isolation, clamping, HSV echo and shift contracts passed.\n";
}
