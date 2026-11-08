#include "sheet_import_task.h"
#include "layer_compositor.h"
#include <limits>
#include <iostream>
#include <thread>
using namespace moon;
namespace {
using Phase=SheetImportTask::Phase;
void require(bool value,const char* why){if(!value)throw std::runtime_error(why);}
struct Queue {
 std::function<void()> job;
 SheetImportTask::Executor executor(){return [this](std::function<void()> next){require(!job,"Duplicate worker");job=std::move(next);};}
 void run(){auto fn=std::move(job);require(bool(fn),"Missing worker");fn();}
};
SheetImportOptions options(){SheetImportOptions o;o.width=o.height=2;return o;}
void capture(SheetImportTask& task,const Document& d){for(int i=0;i<10000&&task.phase()==Phase::Capturing;++i)task.tick(d);require(task.phase()==Phase::Working,"Snapshot did not launch worker");}
void ready(SheetImportTask& task,const Document& d,Queue& q){capture(task,d);q.run();task.tick(d);require(task.phase()==Phase::Ready,"Worker did not publish ready");}
void guard(int point,int mutation){
 auto d=Document::fromImage(4,2,std::vector<Pixel>(8,0xff123456),U"Guard");d.addLinkedFrame();d.selectFrame(d.timeline().state().frames.front().id);Queue q;SheetImportTask task(d,options(),q.executor());
 if(point>0)capture(task,d);if(point==2){q.run();task.tick(d);require(task.phase()==Phase::Ready,"Ready guard setup");}
 if(mutation==0)d=Document(4,2);
 else if(mutation==1){d.beginStroke({0,0},0xffabcdef);d.commitStroke();}
 else d.selectFrame(d.timeline().state().frames.back().id);
 const auto revision=d.revision(),history=d.historySize(),identity=d.identity();const auto pixels=d.pixels();const auto frame=d.frame().id;
 if(point==2)require(!task.commit(d),"Stale ready committed");else task.tick(d);
 require(task.phase()==Phase::Failed&&!task.commit(d),"Stale source accepted");if(q.job)q.run();task.tick(d);
 require(d.identity()==identity&&d.revision()==revision&&d.historySize()==history&&d.pixels()==pixels&&d.frame().id==frame,"Stale worker touched live document");
}
}
int main(){try{
 for(int point=0;point<3;++point)for(int mutation=0;mutation<3;++mutation)guard(point,mutation);
 // Freeze slicing at task creation, preserve live selection/pivot at commit.
 auto d=Document::fromImage(6,2,{0xff000001,0xff000002,0xff000003,0xff000004,0xff000005,0xff000006,0xff000007,0xff000008,0xff000009,0xff00000a,0xff00000b,0xff00000c},U"Selection");
 d.previewSelection(SelectionMask{1,0,3,2,{1,0,1,0,1,1}});auto o=options();o.width=o.height=1;o.selection=true;Queue q;SheetImportTask task(d,o,q.executor());require(!task.commit(d),"Premature commit");
 d.previewSelection({});capture(task,d);d.previewSelection(SelectionMask{0,0,1,1,{}});const auto live=d.selection();const auto revision=d.revision(),history=d.historySize();q.run();task.tick(d);
 require(d.revision()==revision&&d.historySize()==history&&d.width()==6,"Worker mutated source");require(task.commit(d,TransformPoint{-2.5,3.75})&&!task.commit(d),"Single commit");
 require(d.timeline().state().cels.size()==6&&d.pixels().front()==0xff000002&&!d.selection()&&d.historySize()==history+1,"Frozen slicing/transaction");d.undo();require(d.width()==6&&selectionEqual(d.selection(),live)&&d.selectionPivotHistory().pivot->x==-2.5,"Commit-time selection/pivot undo");d.redo();require(!d.selection()&&d.width()==1,"Async redo");
 // A large capture cannot finish in one bounded UI tick.
 {auto large=Document::fromImage(1024,1024,std::vector<Pixel>(1024*1024,0xff123456),U"Chunked");auto o=options();o.width=o.height=1024;Queue q;SheetImportTask t(large,o,q.executor());t.tick(large);require(t.phase()==Phase::Capturing&&!q.job&&large.historySize()==0,"Capture blocked through full source");t.cancel();t.tick(large);require(t.phase()==Phase::Cancelled&&!q.job,"Cancelled capture launched");}
 for(int point=0;point<3;++point){Document source(4,2);Queue q;SheetImportTask t(source,options(),q.executor());if(point>0)capture(t,source);if(point==2){q.run();t.tick(source);}t.cancel();if(q.job)q.run();t.tick(source);require(t.phase()==Phase::Cancelled&&!t.commit(source)&&source.historySize()==0,"Cancel published transaction");}
 {Document source(4,2);Queue q;{SheetImportTask t(source,options(),q.executor());capture(t,source);}q.run();require(source.historySize()==0,"Destroyed task retained document");}
 {Document source(4,2);SheetImportTask t(source,options(),[](std::function<void()>){throw std::runtime_error("Injected dispatch failure");});t.tick(source);require(t.phase()==Phase::Failed&&t.error()=="Injected dispatch failure"&&source.historySize()==0,"Executor failure protection");}
 {Document source(4,2);bool cancelled=false;unsigned progress=0;try{buildSpriteSheetImport(source,options(),[&]{return cancelled;},[&](std::size_t n){progress=unsigned(n);cancelled=true;});throw std::runtime_error("No cancellation");}catch(const SheetImportCancelled&){}require(progress==1&&source.historySize()==0,"Cooperative cancellation");}
 {Document source(4,2);Queue q;SheetImportTask t(source,options(),q.executor());ready(t,source,q);require(!t.commit(source,TransformPoint{std::numeric_limits<double>::infinity(),0})&&source.historySize()==0,"Invalid pivot changed document");}
 // Metadata-only changes are allowed and must survive both import and undo.
 {Document source(4,2);Queue q;SheetImportTask t(source,options(),q.executor());capture(t,source);const auto id=source.palette().entries.front().id;const auto content=source.contentRevision();source.renamePaletteColor(id,U"During import");require(source.contentRevision()==content,"Metadata setup changed content");q.run();t.tick(source);require(t.commit(source)&&source.palette().entries.front().name==U"During import","Metadata blocked/lost");source.undo();require(source.palette().entries.front().name==U"During import","Import undo reverted unrelated metadata");}
 // Crossing the compositor chunk boundary must preserve every RGBA pixel.
 {std::vector<Pixel> pixels(257*513);for(std::size_t i=0;i<pixels.size();++i)pixels[i]=(i%7?0x80000000u:0u)|Pixel(i&0xffffff);auto source=Document::fromImage(257,513,pixels,U"Chunk boundary");SheetImportOptions o;o.width=257;o.height=513;auto expected=compositeNormalRegion(source.timeline(),source.frame().id,{0,0,257,513});for(auto& color:expected)if(!(color>>24))color=0;auto actual=buildSpriteSheetImport(source,o);require(actual.cels.front().surface->pixels==expected,"Chunked source-over pixels changed");}
 // Exercise the real detached executor, not only deterministic queued jobs.
 {Document source(4,2);SheetImportTask t(source,options());const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(t.busy()&&std::chrono::steady_clock::now()<deadline){t.tick(source);std::this_thread::sleep_for(std::chrono::milliseconds(1));}require(t.phase()==Phase::Ready&&t.completedFrames()==2&&t.commit(source),"Detached executor completion");}
 std::cout<<"Asynchronous sheet import capture, guards, cancellation and transaction passed\n";return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
