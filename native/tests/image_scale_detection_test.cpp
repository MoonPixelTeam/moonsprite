#include "image_scale_detection.h"
#include "image_resize_task.h"
#include "fixtures/image_scale_legacy.h"
#include <iostream>
using namespace moon;
void check(bool value){if(!value)throw std::runtime_error("Image scale regression");}
int main(){try{
 for(const auto& c:imageScaleOracle){std::vector<Pixel> input(c.pixels,c.pixels+std::size_t(c.width)*c.height);check(detectRepeatedPixelScale(input,c.width,c.height)==c.scale);auto d=Document::fromImage(c.width,c.height,std::move(input),U"Oracle");check(detectDocumentPixelScale(d.timeline(),d.frame().id,c.width,c.height)==c.scale);}
 check(detectRepeatedPixelScale({},0,0)==0);check(detectRepeatedPixelScale({0},2,2)==0);
 std::vector<Pixel> pixels(24*16);for(int y=0;y<16;++y)for(int x=0;x<24;++x)pixels[y*24+x]=((x/4+y/4)%2)?0xff0000ff:0xff00ff00;
 auto d=Document::fromImage(24,16,pixels,U"Detect");const auto h=d.historySize();std::function<void()> job;ImageResizeTask task(d,24,16,ImageInterpolation::Nearest,[&](std::function<void()> next){job=std::move(next);},true);while(task.phase()==ImageResizeTask::Phase::Capturing)task.tick(d);check(bool(job));job();task.tick(d);check(task.phase()==ImageResizeTask::Phase::Ready&&task.detectedScale()==4&&!task.commit(d)&&d.width()==24&&d.historySize()==h);
 // Cancel/stale detection must never populate a result into a new source.
 for(bool stale:{false,true}){std::function<void()> held;ImageResizeTask pending(d,24,16,ImageInterpolation::Nearest,[&](std::function<void()> next){held=std::move(next);},true);while(pending.phase()==ImageResizeTask::Phase::Capturing)pending.tick(d);if(stale){d.beginStroke({0,0},0xff123456);d.commitStroke();pending.tick(d);check(pending.phase()==ImageResizeTask::Phase::Failed);}else pending.cancel();held();pending.tick(d);check(!pending.commit(d)&&d.width()==24);}
 std::cout<<"180 unchanged legacy RGBA/composite oracles, validation and detection-only async history guard passed\n";
 return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
