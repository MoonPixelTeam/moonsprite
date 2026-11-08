#include "image_resize_task.h"
#include <iostream>
#include <thread>
using namespace moon;
using Phase=ImageResizeTask::Phase;
void check(bool value){if(!value)throw std::runtime_error("Async image resize regression");}
struct Queue{std::function<void()> job;ImageResizeTask::Executor executor(){return [this](std::function<void()> fn){check(!job);job=std::move(fn);};}void run(){auto fn=std::move(job);check(bool(fn));fn();}};
void capture(ImageResizeTask& t,const Document& d){for(int n=0;n<10000&&t.phase()==Phase::Capturing;++n)t.tick(d);check(t.phase()==Phase::Working);}
int main(){try{
 for(int mode=0;mode<3;++mode)for(auto method:{ImageInterpolation::Nearest,ImageInterpolation::Smooth}){
  Document d(6,4);if(mode==1)check(d.createTilemapLayer(2,2,U"Grid"));if(mode==2)check(d.createFreeTileLayer(U"Free"));d.beginStroke({1,1},0x80123456);d.commitStroke();d.addLinkedFrame();d.previewSelection(SelectionMask{1,1,2,2,{1,0,0,1}});
  auto expected=d;expected.resizeImage(12,8,method);const auto old=d.pixels();const auto h=d.historySize();Queue q;ImageResizeTask t(d,12,8,method,q.executor());check(!t.commit(d));capture(t,d);check(d.width()==6&&d.historySize()==h);q.run();t.tick(d);check(t.phase()==Phase::Ready&&t.commit(d)&&!t.commit(d));check(d.width()==12&&d.pixels()==expected.pixels()&&selectionEqual(d.selection(),expected.selection())&&d.historySize()==h+1);d.undo();check(d.width()==6&&d.pixels()==old);d.redo();check(d.pixels()==expected.pixels());
 }
 // Attached masks, sparse origins, disabled metadata and runtime sharing use
 // exactly the synchronous transaction, including undo context.
 {Document seed(4,2);auto state=seed.timeline().state();auto& surface=*state.cels.front().surface;surface.offsetX=-1;surface.offsetY=1;surface.pixels[0]=0x80123456;
  timeline::MaskSlot mask;mask.ownerId=state.layers.front().id;mask.frameId=state.frames.front().id;mask.mask.id="mask";mask.mask.surface.width=2;mask.mask.surface.height=1;mask.mask.surface.offsetX=-1;mask.mask.surface.pixels={0xff808080,0xffffffff};state.masks.push_back(mask);
  auto d=Document::fromImported(4,2,std::move(state),seed.palette(),"async-mask",U"Mask",std::make_shared<const std::vector<std::uint8_t>>());auto expected=d;expected.resizeImage(7,5,ImageInterpolation::Smooth);Queue q;ImageResizeTask t(d,7,5,ImageInterpolation::Smooth,q.executor());capture(t,d);q.run();t.tick(d);check(t.commit(d));const auto& actual=d.timeline().state().masks.front().mask.surface;const auto& wanted=expected.timeline().state().masks.front().mask.surface;check(actual.width==wanted.width&&actual.offsetX==wanted.offsetX&&actual.pixels==wanted.pixels&&d.pixels()==expected.pixels());d.undo();check(d.width()==4&&d.timeline().state().masks.front().mask.surface.width==2);}
 for(int phase=0;phase<3;++phase)for(int mutation=0;mutation<4;++mutation){Document d(4,2);Queue q;ImageResizeTask t(d,8,4,ImageInterpolation::Smooth,q.executor());if(phase>0)capture(t,d);if(phase==2){q.run();t.tick(d);}if(mutation==0)d=Document(4,2);else if(mutation==1){d.beginStroke({0,0},0xff123456);d.commitStroke();}else if(mutation==2)d.previewSelection(SelectionMask{0,0,1,1,{}});else d.renamePaletteColor(d.palette().entries.front().id,U"Changed");const auto h=d.historySize(),r=d.revision();if(phase==2)check(!t.commit(d));else t.tick(d);check(t.phase()==Phase::Failed);if(q.job)q.run();check(d.width()==4&&d.historySize()==h&&d.revision()==r);}
 for(int phase=0;phase<3;++phase){Document d(4,2);Queue q;ImageResizeTask t(d,8,4,ImageInterpolation::Nearest,q.executor());if(phase>0)capture(t,d);if(phase==2){q.run();t.tick(d);}t.cancel();if(q.job)q.run();t.tick(d);check(t.phase()==Phase::Cancelled&&!t.commit(d)&&d.width()==4&&d.historySize()==0);}
 {Document d(4,2);Queue q;{ImageResizeTask t(d,8,4,ImageInterpolation::Nearest,q.executor());capture(t,d);}q.run();check(d.width()==4);}
 {Document d(4,2);d.previewSelection(SelectionMask{0,0,2048,1024,std::vector<unsigned char>(2048*1024,1)});Queue q;ImageResizeTask t(d,8,4,ImageInterpolation::Nearest,q.executor());t.tick(d);check(t.phase()==Phase::Capturing&&!q.job);t.cancel();}
 {Document d(1024,1024);Queue q;ImageResizeTask t(d,512,512,ImageInterpolation::Smooth,q.executor());t.tick(d);check(t.phase()==Phase::Capturing&&!q.job);t.cancel();}
 {Document d(4,2);ImageResizeTask t(d,8,4,ImageInterpolation::Nearest,[](std::function<void()>){throw std::runtime_error("dispatch");});t.tick(d);check(t.phase()==Phase::Failed&&d.historySize()==0);}
 {Document d(4,2);ImageResizeTask t(d,8192,8192,ImageInterpolation::Smooth);const auto end=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(t.busy()&&std::chrono::steady_clock::now()<end){t.tick(d);std::this_thread::sleep_for(std::chrono::milliseconds(1));}check(t.phase()==Phase::Failed&&d.width()==4&&d.historySize()==0);}
 {std::atomic<bool> cancelled{true};bool caught=false;try{ImageResizeCancellationScope scope(&cancelled);resizeImagePixels({0},1,1,8,8,ImageInterpolation::Smooth);}catch(const ImageResizeCancelled&){caught=true;}check(caught&&imageResizeCancellation==nullptr);}
 {Document d(4,2);ImageResizeTask t(d,8,4,ImageInterpolation::Smooth);const auto end=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(t.busy()&&std::chrono::steady_clock::now()<end){t.tick(d);std::this_thread::sleep_for(std::chrono::milliseconds(1));}check(t.phase()==Phase::Ready&&t.commit(d)&&d.width()==8);}
 std::cout<<"Image resize async pixels/resources/history, stale guards, bounded capture, cancellation and detached executor passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
