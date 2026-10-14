#include "document.h"
#include <stdexcept>
#include <iostream>
using namespace moon;
void check(bool value){if(!value)throw std::runtime_error("Image resize regression");}
int main(){
 check(resizeImagePixels({0x000000ff,0xff000000},2,1,3,1,ImageInterpolation::Nearest)==std::vector<Pixel>({0x000000ff,0xff000000,0xff000000}));
 check(resizeImagePixels({0x000000ff,0xff000000},2,1,3,1,ImageInterpolation::Smooth)==std::vector<Pixel>({0x000000ff,0x80000080,0xff000000}));
 Document d(2,1);d.beginStroke({0,0},0x800000ff);d.commitStroke();d.addLinkedFrame();const auto link=d.cel().linkedCelId;d.commitSelection({},SelectionMask{0,0,2,1,{1,0}});const auto before=d.pixels();const auto h=d.historySize();
 check(d.resizeImage(4,2));check(d.width()==4&&d.height()==2&&d.cel().linkedCelId==link&&d.historySize()==h+1);check(d.selection()->mask==std::vector<unsigned char>({1,1,0,0,1,1,0,0}));
 d.undo();check(d.width()==2&&d.height()==1&&d.pixels()==before&&d.cel().linkedCelId==link&&d.selection()->mask==std::vector<unsigned char>({1,0}));d.redo();check(d.width()==4&&d.pixels()[1]==before[0]);
 auto rev=d.revision();check(!d.resizeImage(4,2)&&d.revision()==rev);try{d.resizeImage(1025,2);check(false);}catch(const std::invalid_argument&){}check(d.width()==4&&d.revision()==rev);
 std::cout<<"image resize tests passed\n";
}
