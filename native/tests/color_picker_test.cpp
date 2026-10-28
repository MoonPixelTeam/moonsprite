#include "color_picker_layout.h"
#include <stdexcept>
#include <iostream>
#include <utility>
using namespace moon;
static void require(bool condition) {if(!condition) throw std::runtime_error("Color picker legacy contract failed");}
int main() {
  // Actual original color-values::parseRgbaHex 43-case oracle.
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"112233",parsed,0);require(valid && parsed==0x332211u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"#aAbBcC",parsed,127);require(valid && parsed==0x7fccbbaau);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"11223300",parsed,255);require(valid && parsed==0x332211u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"#01020380",parsed,0);require(valid && parsed==0x80030201u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"+11223",parsed,127);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"11+233",parsed,255);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"11-133",parsed,0);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"11 233",parsed,127);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"12345",parsed,255);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"1234567",parsed,0);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"123456789",parsed,127);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"#GG2233",parsed,255);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"##112233",parsed,0);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"0x112233",parsed,127);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"",parsed,255);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u0085112233",parsed,0);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u200b112233",parsed,127);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"11\u30002233",parsed,255);require(!valid && parsed==0x12345678);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u0009#123456\u0009",parsed,0);require(valid && parsed==0x563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u000a#123456\u000a",parsed,127);require(valid && parsed==0x7f563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u000b#123456\u000b",parsed,255);require(valid && parsed==0xff563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u000c#123456\u000c",parsed,0);require(valid && parsed==0x563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u000d#123456\u000d",parsed,127);require(valid && parsed==0x7f563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U" #123456 ",parsed,255);require(valid && parsed==0xff563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u00a0#123456\u00a0",parsed,0);require(valid && parsed==0x563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u1680#123456\u1680",parsed,127);require(valid && parsed==0x7f563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2000#123456\u2000",parsed,255);require(valid && parsed==0xff563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2001#123456\u2001",parsed,0);require(valid && parsed==0x563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2002#123456\u2002",parsed,127);require(valid && parsed==0x7f563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2003#123456\u2003",parsed,255);require(valid && parsed==0xff563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2004#123456\u2004",parsed,0);require(valid && parsed==0x563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2005#123456\u2005",parsed,127);require(valid && parsed==0x7f563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2006#123456\u2006",parsed,255);require(valid && parsed==0xff563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2007#123456\u2007",parsed,0);require(valid && parsed==0x563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2008#123456\u2008",parsed,127);require(valid && parsed==0x7f563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2009#123456\u2009",parsed,255);require(valid && parsed==0xff563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u200a#123456\u200a",parsed,0);require(valid && parsed==0x563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2028#123456\u2028",parsed,127);require(valid && parsed==0x7f563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u2029#123456\u2029",parsed,255);require(valid && parsed==0xff563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u202f#123456\u202f",parsed,0);require(valid && parsed==0x563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u205f#123456\u205f",parsed,127);require(valid && parsed==0x7f563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\u3000#123456\u3000",parsed,255);require(valid && parsed==0xff563412u);}
{std::uint32_t parsed=0x12345678;const bool valid=pickerParseRgbaHex(U"\ufeff#123456\ufeff",parsed,0);require(valid && parsed==0x563412u);}

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
