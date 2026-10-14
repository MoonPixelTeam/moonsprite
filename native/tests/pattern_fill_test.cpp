#include "document.h"
#include <iostream>
#include <stdexcept>
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
using namespace moon;
int main(){try{
 PatternFillOptions p;p.brushes={{2,1,1,0,true,{255,255},{0xff0000ff,0},{}}};p.paintMode=PatternPaintMode::Source;
 PatternFillSampler source(p,0xffabcdef,0,0,0,0,5,1);CHECK(source.sample(0,0).coverage==0);CHECK(source.sample(1,0).color==0xff0000ff);CHECK(source.sample(-1,0).color==0xff0000ff);
 p.paintMode=PatternPaintMode::Target;PatternFillSampler target(p,0,2,0,0,0,5,1);CHECK(target.sample(2,0).color==0xff0000ff);CHECK(target.sample(3,0).coverage==0);
 Document d(5,1);d.previewSelection(SelectionMask{1,0,3,1,{}});auto before=d.pixels();CHECK(d.fillPatternPixels({1,0},0xffffffff,p));CHECK(d.pixels()[0]==0&&d.pixels()[1]==0xff0000ff&&d.pixels()[2]==0&&d.pixels()[3]==0xff0000ff&&d.pixels()[4]==0);d.undo();CHECK(d.pixels()==before&&!d.canUndo());d.redo();CHECK(d.pixels()[1]==0xff0000ff);
 // legacy workspace-pattern-fill.test.ts complete selected library cycles.
 p.brushes={{1,1,0,0,true,{255},{0xff0a14f0},{}},{1,1,0,0,true,{255},{0xfff0140a},{}}};p.paintMode=PatternPaintMode::Source;p.mode=PatternMode::Regular;
 Document multi(5,1);CHECK(multi.fillPatternPixels({0,0},0,p));CHECK(multi.pixels()==std::vector<Pixel>({0xff0a14f0,0xfff0140a,0xff0a14f0,0xfff0140a,0xff0a14f0}));multi.undo();CHECK(!multi.canUndo());multi.redo();CHECK(multi.pixels()[4]==0xff0a14f0);
 p.brushes={{1,1,0,0,true,{255},{0x800000ff},{}}};p.mode=PatternMode::Default;Document alpha(1,1);alpha.beginStroke({0,0},0xffff0000);alpha.commitStroke();CHECK(alpha.fillPatternPixels({0,0},0xffffffff,p));CHECK(alpha.pixels()[0]==brushComposite(0xffff0000,0x800000ff,100));
 PatternFillOptions wood;wood.texture=FillTexture::Wood;Document texture(8,1);CHECK(texture.fillPatternPixels({0,0},0xff123456,wood));CHECK(texture.pixels()[0]==0xff123456&&texture.pixels()[3]==0);texture.undo();CHECK(!texture.canUndo());
 p.mode=PatternMode::Random;p.settings.randomCount=3;p.randomSeed=42;PatternFillSampler a(p,0,0,0,0,0,8,8),b(p,0,0,0,0,0,8,8);for(int y=0;y<8;++y)for(int x=0;x<8;++x)CHECK(a.sample(x,y).color==b.sample(x,y).color);
 Document linked(2,1);linked.beginStroke({0,0},0xff112233);linked.commitStroke();auto frame=linked.frame().id;linked.setLayerAutoLinkAnimationCels(linked.layer().id,true);linked.addFrame();CHECK(linked.cel().linkedCelId);p.mode=PatternMode::Default;CHECK(linked.fillPatternPixels({1,0},0,p));linked.selectFrame(frame);CHECK(linked.pixels()[1]==0x800000ff);linked.undo();CHECK(linked.pixels()[1]==0);linked.redo();CHECK(linked.pixels()[1]==0x800000ff);
 std::cout<<"pattern fill checks passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
