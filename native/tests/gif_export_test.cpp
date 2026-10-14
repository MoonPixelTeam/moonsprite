#include "gif_export.h"
#include <fstream>
#include <cstdio>
#include <stdexcept>
using namespace moon;
void require(bool v){if(!v)throw std::runtime_error("GIF export regression");}
int main(){try{
 Document d(3,1);d.beginStroke({0,0},0x7f0000ff);d.commitStroke();d.beginStroke({1,0},0x8000ff00);d.commitStroke();d.setFrameDuration(15);d.addFrame();d.beginStroke({2,0},0xffff0000);d.commitStroke();d.setFrameDuration(24);d.markSaved();auto id=d.frame().id;auto revision=d.revision();auto h=d.historySize();GifExportOptions options;auto out=encodeAnimationGif(d,options);require(out.width==3 && out.height==1 && out.frameIds.size()==2 && d.frame().id==id && d.revision()==revision && d.historySize()==h && !d.dirty());std::ofstream file("gif-basic.gif",std::ios::binary);file.write(reinterpret_cast<const char*>(out.bytes.data()),out.bytes.size());file.close();
 options.direction=GifDirection::ReversePingPong;auto reverse=encodeAnimationGif(d,options);require(reverse.frameIds[0]==id && reverse.frameIds.size()==2);options={};options.scalePercent=200;options.trim=true;auto scaled=encodeAnimationGif(d,options);require(scaled.width==6 && scaled.height==2);
 timeline::State state;state.frames={{"a"},{"b"},{"c"},{"d"}};state.loopSections={{"parent",U"", "a","d","forward",2},{"child",U"","b","c","reverse",2}};options={};options.loopSectionId="parent";require(gifExportFrameIds(state,options)==std::vector<std::string>{"a","c","b","c","b","d","a","c","b","c","b","d"});
 Document large(256,2);for(int y=0;y<2;++y)for(int x=0;x<256;++x){large.beginStroke({x,y},0xff000000|Pixel(x)|Pixel(y*100+13)<<8|Pixel((x*37+y*17)%256)<<16);large.commitStroke();}large.markSaved();out=encodeAnimationGif(large);file.open("gif-quantized.gif",std::ios::binary);file.write(reinterpret_cast<const char*>(out.bytes.data()),out.bytes.size());file.close();require(out.frameIds.size()==1);
 return 0;
}catch(const std::exception& e){std::fprintf(stderr,"%s\n",e.what());return 1;}}
