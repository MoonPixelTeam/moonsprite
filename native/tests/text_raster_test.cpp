#include "text_raster.h"
#include <iostream>
#include <stdexcept>
#define CHECK(...) do{if(!(__VA_ARGS__))throw std::runtime_error(#__VA_ARGS__);}while(false)
using namespace moon;
int main(){try{
 CHECK(textUtf16(U"A\U0001f600B").size()==4);CHECK(textUtf32(u"A\U0001f600B")==U"A\U0001f600B");TextCelData d;d.text=u"A\U0001f600B";TextStyleRun red;red.start=1;red.end=3;red.color=0xff0000ff;d.styleRuns={red};CHECK(textStyleAt(d,1).color==red.color&&textStyleAt(d,2).color==red.color);CHECK(textStyleAt(d,3).color==d.color);
 d.styleRuns[0].fontSize=18;CHECK(textSelectionStyle(d,1,3).fontSize==18);CHECK(!textSelectionStyle(d,0,3).fontSize);CHECK(textSelectionStyle(d,4,4).fontSize==d.fontSize);CHECK(textSelectionStyle(d,1,1).color==red.color);CHECK(textSelectionStyle(d,0,0).color==d.color);
 auto shifted=reconcileTextStyleRuns(d.styleRuns,d.text,u"AX\U0001f600B");CHECK(shifted.size()==1&&shifted[0].start==2&&shifted[0].end==4);TextStyleRun blue;blue.start=2;blue.end=3;blue.fontSize=8;auto runs=normalizeTextStyleRuns({red,blue},4);CHECK(runs.size()==2&&!runs[1].color&&runs[1].fontSize==8);
 d.fontFamily="\xe3\x80\x80Tiny5\xc2\xa0";CHECK(normalizeTextCelData(d).fontFamily=="Tiny5");std::string family;for(int i=0;i<130;++i)family+="\xe6\xb1\x89";CHECK(normalizeTextFontFamily(family).size()==384);
 auto glyph=[](const std::string&,int,char32_t c,int)->std::optional<TextGlyph>{if(c==U' ')return {};return TextGlyph{-1,-2,2,2,3,{255,255,255,255}};};d=newTextToolData(0xff332211);d.text=u"AB";auto image=rasterizeText(d,-3,4,glyph);CHECK(image.width==9&&image.height==6&&image.offsetX==-3&&image.offsetY==4);CHECK(image.pixels[2*image.width+2]==d.color&&image.pixels[2*image.width+5]==d.color);
 d.boxed=true;d.boxWidth=3;d.boxHeight=8;image=rasterizeText(d,0,0,glyph);CHECK(image.width==3&&image.height==8&&image.pixels[0]==d.color&&image.pixels[3*3]==d.color);d.boxWidth=8;d.align=TextCelData::Align::Center;image=rasterizeText(d,0,0,glyph);CHECK(image.pixels[0]==0&&image.pixels[1]==d.color&&image.pixels[4]==d.color);
 d.boxed=false;d.actualSpacing=false;d.letterSpacing=-3;d.smooth=true;d.color=0x80ffffff;auto half=[](const std::string&,int,char32_t,int)->std::optional<TextGlyph>{return TextGlyph{-1,-2,2,2,3,{128,128,128,128}};};image=rasterizeText(d,0,0,half);CHECK((image.pixels[2*image.width+1]>>24)==112);
 std::cout<<"Text model/layout fixtures passed (glyph provider deterministic)\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
