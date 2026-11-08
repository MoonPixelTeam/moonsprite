#include "document.h"
#include <iostream>
using namespace moon;
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
static void begin(Document& d,Point p,Pixel color,BrushOptions b,repeat::Mode mode,const PatternBrush* image=nullptr){d.beginStroke(p,color,b,image,0,nullptr,true,false,false,mode);}
int main(){try{
 for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(bool perfect:{false,true}){
  Document d(8,6);BrushOptions b;b.perfectPixels=perfect;b.opacity=50;
  const bool x=repeat::includesX(mode);begin(d,x?Point{7,2}:Point{2,5},0xff123456,b,mode);d.updateStroke(x?Point{9,2}:Point{2,7});CHECK(d.commitStroke());CHECK(d.historySize()==1);
  const auto pixels=d.pixels();CHECK((pixels[x?23:42]>>24)==128);CHECK((pixels[x?16:2]>>24)==128);CHECK((pixels[x?17:10]>>24)==128);CHECK(pixels[x?20:26]==0);d.undo();CHECK(std::all_of(d.pixels().begin(),d.pixels().end(),[](auto p){return !p;}));d.redo();CHECK(d.pixels()==pixels);
 }
 for(bool dynamic:{false,true}){Document d(8,6);BrushOptions b;b.size=3;b.shape=BrushShape::Square;begin(d,{0,0},0xffaabbcc,b,repeat::Mode::Both);if(dynamic){d.cancelStroke();d.beginStroke({0,0},0xffaabbcc,b,nullptr,0,nullptr,false,false,false,repeat::Mode::Both);d.configureStrokeDynamics(b,nullptr,0xff000000,0xffffffff,0);d.updateDynamicStroke({0,0},{0,0,3,100},true);d.updateDynamicStroke({-1,-1},{-1,-1,3,100});}CHECK(d.commitStroke());CHECK(d.pixels()[47]);CHECK(d.pixels()[0]);CHECK(!d.pixels()[3*8+3]);}
 {Document d(8,4);d.previewSelection(SelectionMask{0,1,1,1,{}});begin(d,{7,1},0xff123456,{},repeat::Mode::X);d.updateStroke({9,1});CHECK(d.commitStroke());CHECK(d.pixels()[8]);CHECK(!d.pixels()[15]&&!d.pixels()[9]);}
 {Document d(8,4);begin(d,{15,1},0xff123456,{},repeat::Mode::X);d.updateStroke({17,1});d.cancelStroke();CHECK(!d.canUndo());CHECK(std::all_of(d.pixels().begin(),d.pixels().end(),[](auto p){return !p;}));d.beginStroke({0,0},0xffabcdef);d.commitStroke();CHECK(!d.pixels()[7]);}
 {Document d(8,4);PatternBrush image;image.width=3;image.height=1;image.coverage={255,255,255};image.colors={0xff112233,0xff445566,0xff778899};begin(d,{0,1},0xffffffff,{},repeat::Mode::X,&image);CHECK(d.commitStroke());CHECK(d.pixels()[15]==0xff112233&&d.pixels()[8]==0xff445566&&d.pixels()[9]==0xff778899);d.undo();CHECK(!d.pixels()[15]);}
 {Document d(8,4);d.fillSelectionOrCanvas(0xff112233);const auto owner=d.layer().id,frame=d.frame().id;CHECK(d.createAttachedMask(owner,frame));const auto raster=d.pixels();begin(d,{7,1},0xff000000,{},repeat::Mode::X);d.updateStroke({8,1});CHECK(d.commitStroke());CHECK(d.pixels()==raster);d.undo();d.redo();}
 {Document d(8,4);BrushOptions b;b.size=3;b.shape=BrushShape::Square;auto preview=d.brushPreview({0,1},{0,1},0xff112233,b,nullptr,0,nullptr,false,repeat::Mode::X);begin(d,{0,1},0xff112233,b,repeat::Mode::X);d.commitStroke();for(std::size_t i=0;i<d.pixels().size();++i)CHECK(d.pixels()[i]==(preview.count(i)?preview.at(i):0));}
 std::cout<<"Repeated solid/perfect/dynamic coverage, selection, cancel and undo passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
