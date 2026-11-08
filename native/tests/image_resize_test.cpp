#include "document.h"
#include <stdexcept>
#include <iostream>
#include <random>
#include <chrono>
#include "fixtures/image_resize_reference.h"
using namespace moon;
void check(bool value){if(!value)throw std::runtime_error("Image resize regression");}
int main(){
 std::mt19937 random(70271);
 for(int test=0;test<1600;++test){const int sw=1+random()%35,sh=1+random()%29,tw=1+random()%47,th=1+random()%41;std::vector<Pixel> source(std::size_t(sw)*sh);for(auto& p:source)p=random();
  const double sx=(1+random()%80)/13.,sy=(1+random()%80)/17.,ox=(int(random()%50)-25)/7.,oy=(int(random()%50)-25)/11.;
  for(auto method:{ImageInterpolation::Nearest,ImageInterpolation::Smooth}){
   check(resizeImagePixels(source,sw,sh,tw,th,method)==resize_reference::resizeImagePixels(source,sw,sh,tw,th,method));
   check(resizeImagePixels(source,sw,sh,tw,th,method,sx,sy,ox,oy)==resize_reference::resizeImagePixels(source,sw,sh,tw,th,method,sx,sy,ox,oy));
   check(resizeFreeTileImagePixels(source,sw,sh,tw,th,method)==resize_reference::resizeFreeTileImagePixels(source,sw,sh,tw,th,method));
  }
 }
 // Cross the bounded axis-table stripe and final partial stripe.
 for(int tw:{4095,4096,4097,8193}){std::vector<Pixel> source(17*3);for(auto& p:source)p=random();for(auto method:{ImageInterpolation::Nearest,ImageInterpolation::Smooth}){
  check(resizeImagePixels(source,17,3,tw,2,method,.37,1.73,-2.4,.3)==resize_reference::resizeImagePixels(source,17,3,tw,2,method,.37,1.73,-2.4,.3));
  check(resizeFreeTileImagePixels(source,17,3,tw,2,method)==resize_reference::resizeFreeTileImagePixels(source,17,3,tw,2,method));
 }}
 // Report timing, never enforce a machine-dependent performance threshold.
 std::vector<Pixel> sample(1024*768);for(auto& p:sample)p=random();
 for(bool freeTile:{false,true})for(auto method:{ImageInterpolation::Nearest,ImageInterpolation::Smooth}){
  auto run=[&](bool reference){const auto start=std::chrono::steady_clock::now();std::vector<Pixel> result;
   for(int n=0;n<3;++n)result=freeTile?(reference?resize_reference::resizeFreeTileImagePixels(sample,1024,768,1537,1153,method):resizeFreeTileImagePixels(sample,1024,768,1537,1153,method)):(reference?resize_reference::resizeImagePixels(sample,1024,768,1537,1153,method):resizeImagePixels(sample,1024,768,1537,1153,method));
   check(result.size()==1537*1153);return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count()/3;
  };
  const auto oldMs=run(true),newMs=run(false);std::cout<<(freeTile?"free":"rgba")<<" "<<(method==ImageInterpolation::Nearest?"nearest":"smooth")<<" reference_ms="<<oldMs<<" optimized_ms="<<newMs<<" ratio="<<oldMs/newMs<<"\n";
 }

 check(resizeImagePixels({0x000000ff,0xff000000},2,1,3,1,ImageInterpolation::Nearest)==std::vector<Pixel>({0x000000ff,0xff000000,0xff000000}));
 check(resizeImagePixels({0x000000ff,0xff000000},2,1,3,1,ImageInterpolation::Smooth)==std::vector<Pixel>({0x000000ff,0x80000080,0xff000000}));
 Document d(2,1);d.beginStroke({0,0},0x800000ff);d.commitStroke();d.addLinkedFrame();const auto link=d.cel().linkedCelId;d.commitSelection({},SelectionMask{0,0,2,1,{1,0}});const auto before=d.pixels();const auto h=d.historySize();
 check(d.resizeImage(4,2));check(d.width()==4&&d.height()==2&&d.cel().linkedCelId==link&&d.historySize()==h+1);check(d.selection()->mask==std::vector<unsigned char>({1,1,0,0,1,1,0,0}));
 d.undo();check(d.width()==2&&d.height()==1&&d.pixels()==before&&d.cel().linkedCelId==link&&d.selection()->mask==std::vector<unsigned char>({1,0}));d.redo();check(d.width()==4&&d.pixels()[1]==before[0]);
 auto rev=d.revision();check(!d.resizeImage(4,2)&&d.revision()==rev);try{d.resizeImage(32769,2);check(false);}catch(const std::length_error&){}check(d.width()==4&&d.revision()==rev);
 std::cout<<"image resize tests passed\n";
}
