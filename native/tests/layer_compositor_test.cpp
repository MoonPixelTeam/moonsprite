#include "layer_compositor.h"
#include <iostream>
#include <fstream>
#include <stdexcept>
using namespace moon;using namespace moon::timeline;
#define CHECK(v) do{if(!(v))throw std::runtime_error(#v);}while(false)
State scene(){State s;s.layers={{"top",U"上"},{"bottom",U"下"}};s.frames={{"a",100},{"b",100}};Cel c;c.id="bottom-a";c.layerId="bottom";c.frameId="a";c.surface=Surface{3,2,0,0,{},{},{0xffff0000,0xffff0000,0xffff0000,0xffff0000,0xffff0000,0xffff0000}};s.cels.push_back(c);c.id="top-a";c.layerId="top";c.surface=Surface{2,1,1,0,{},{},{0x800000ff,0xff00ff00}};s.cels.push_back(c);return s;}
int main(int argc,char**argv){try{
 auto state=scene();auto result=compositeNormalRegion(Timeline(state),"a",{0,0,3,2});CHECK(result[0]==0xffff0000 && result[1]==0xff7f0080 && result[2]==0xff00ff00);CHECK(result[4]==0xffff0000);
 CHECK(compositeNormalRegion(Timeline(state),"b",{0,0,3,2})==std::vector<Pixel>(6,0));
 auto partial=compositeNormalRegion(Timeline(state),"a",{1,0,1,1});CHECK(partial.size()==1 && partial[0]==result[1]);
 state.layers[0].visible=false;CHECK(compositeNormalRegion(Timeline(state),"a",{0,0,3,2})[1]==0xffff0000);
 state.layers[0].visible=true;state.layers[0].opacity=.5;CHECK(compositeNormalRegion(Timeline(state),"a",{2,0,1,1})[0]==0xff808000);
 state.cels[1].surface->offsetX=-1;CHECK(compositeNormalRegion(Timeline(state),"a",{-1,0,1,1})[0]==0x400000ff);
 state.cels[1].linkedCelId="bottom-a";bool rejected=false;try{compositeNormalRegion(Timeline(state),"a",{0,0,1,1});}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected);
 Pixel unchanged=0x00112233,source=0x00010203;compositeOpaqueRgbaRow(&unchanged,&source,1);CHECK(unchanged==0x00112233);
 if(argc>1){std::ifstream f(argv[1]);unsigned a,b,expected;int count=0;while(f>>a>>b>>expected){auto actual=a;compositeOpaqueRgbaRow(&actual,&b,1);CHECK(actual==expected);++count;}CHECK(count>=10000);}
 std::cout<<"Normal layers, region clipping, frame isolation, opacity and legacy RGBA row oracle passed\n";return 0;
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
