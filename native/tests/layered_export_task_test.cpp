#include "layered_export_task.h"
#include "aseprite_io.h"
#include "psd_export.h"
#include "psd_import.h"
#include "layer_compositor.h"
#include <deque>
#include <iostream>
#include <stdexcept>
#include <thread>
using namespace moon;
using Task=workspace::LayeredExportTask;
static void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
struct Executor {
 std::deque<std::function<void()>> jobs;bool fail=false;
 Task::Launch launch(){return [this](std::function<Task::Bytes()> work){
  if(fail)throw std::runtime_error("encoding dispatch failure");
  auto task=std::make_shared<std::packaged_task<Task::Bytes()>>(std::move(work));auto future=task->get_future();jobs.push_back([task]{(*task)();});return future;
 };}
 void step(){check(!jobs.empty(),"Missing encoding worker");auto work=std::move(jobs.front());jobs.pop_front();work();}
};
static const auto deadline=[] {return std::chrono::steady_clock::now()+std::chrono::seconds(1);};
static void start(Task& task,const Document& source){
 for(int i=0;!task.running()&&i<100;++i)check(!task.poll(source,deadline()),"Capture failed before dispatch");
 check(task.running()&&!task.capturing()&&task.busy(),"Encoding was not dispatched");
}
static Task::Bytes encode(const Document& document,const Task::Request& request){return request.psd?encodePsd(document,request.scale):encodeAseprite(document,request.scale);}
int main(){try{
 for(bool psd:{false,true}){Executor executor;Task task(encode,executor.launch());auto source=Document::fromImage(2,1,{0xff123456,0xffaabbcc},U"Export");const auto original=source.pixels();const auto path=std::filesystem::path(psd?"export.psd":"export.aseprite");
  check(!task.busy()&&!task.poll(source,deadline()),"Idle encoding emitted result");check(task.begin(source,{path,200,psd}),"Encoding begin");start(task,source);
  check(!task.begin(source,{"replacement",100,!psd})&&!task.poll(source,deadline()),"Required running invocation replaced or blocked");
  source.beginStroke({0,0},0xff102030);source.commitStroke();const auto history=source.historyPosition();const auto dirty=source.dirty();const auto revision=source.revision();
  executor.step();check(!task.begin(source,{"unconsumed",100,!psd}),"Unconsumed encoding replaced");auto result=task.poll(source,deadline());
  check(result&&result->kind==Task::Result::Succeeded&&result->request.path==path&&result->request.scale==200&&result->request.psd==psd&&!result->bytes.empty()&&!task.busy(),"Encoding lost request or bytes");
  auto reopened=psd?decodePsd(result->bytes,U"PSD"):documentFromAseprite(decodeAseprite(result->bytes));
  check(reopened.width()==4&&reopened.height()==2,"Real encoder lost scale");const auto pixels=compositeNormalRegion(reopened.timeline(),reopened.frame().id,{0,0,4,2});
  for(int y=0;y<2;++y)for(int x=0;x<4;++x)check(pixels[y*4+x]==original[x/2],"Worker read changed live pixels");
  check(source.historyPosition()==history&&source.revision()==revision&&source.dirty()==dirty&&source.pixels()[0]==0xff102030,"Encoding edited source/history");check(!task.poll(source,deadline()),"Completion emitted twice");
 }
 {Executor executor;int calls=0;Task task([&](const auto&,const auto&){++calls;return Task::Bytes{1};},executor.launch());Document source(512,512);
  task.begin(source,{"capture",100,false});check(!task.poll(source,std::chrono::steady_clock::now())&&task.capturing(),"Expired capture budget did not yield");
  check(task.cancel()&&!task.busy()&&!task.poll(source,deadline())&&executor.jobs.empty()&&calls==0,"Capture cancellation dispatched work");
  check(task.begin(source,{"retry",100,false})&&!task.cancelling(),"Cancel state leaked to retry");start(task,source);check(!task.cancel()&&task.cancelling()&&task.busy(),"Running cancel did not wait");
  executor.step();auto result=task.poll(source,deadline());check(result&&result->kind==Task::Result::Cancelled&&result->bytes.empty()&&calls==1&&!task.busy(),"Cancelled result was published or encoder interrupted");
 }
 {Executor executor;Task task(encode,executor.launch());Document source(4,4);task.begin(source,{"stale",100,false});
  source.beginStroke({0,0},0xff123456);source.commitStroke();auto result=task.poll(source,deadline());check(result&&result->kind==Task::Result::Failed&&!result->error.empty()&&executor.jobs.empty()&&!task.busy(),"Changed capture not rejected");
  Document other(4,4);task.begin(source,{"other",100,false});result=task.poll(other,deadline());check(result&&result->kind==Task::Result::Failed&&executor.jobs.empty(),"Capture accepted another identity");
 }
 for(bool dispatch:{false,true}){Executor executor;bool failEncode=!dispatch;Task task([&](const auto&,const auto&)->Task::Bytes{if(failEncode)throw std::runtime_error("encoding failure");return {7};},executor.launch());Document source(4,4);executor.fail=dispatch;
  task.begin(source,{"failure",100,false});std::optional<Task::Result> result;
  for(int i=0;!result&&i<100;++i){result=task.poll(source,deadline());if(!executor.jobs.empty())executor.step();}
  check(result&&result->kind==Task::Result::Failed&&!result->error.empty()&&!task.busy(),"Encoding failure hidden");
  executor.fail=false;failEncode=false;check(task.begin(source,{"retry",100,false}),"Failure blocked retry");start(task,source);executor.step();result=task.poll(source,deadline());check(result&&result->kind==Task::Result::Succeeded&&result->bytes==Task::Bytes{7},"Encoding retry lost result");
 }
 {Executor executor;Task task([](const auto&,const auto&)->Task::Bytes{throw std::runtime_error("cancelled encoding failure");},executor.launch());Document source(4,4);task.begin(source,{"cancel",100,false});start(task,source);task.cancel();executor.step();auto result=task.poll(source,deadline());check(result&&result->kind==Task::Result::Cancelled&&result->error.empty(),"Cancelled worker error escaped close");}
 {Executor executor;int calls=0;Document source(4,4);const auto before=source.pixels();
  {Task task([&](const auto& copy,const auto&){++calls;check(copy.pixels()==before,"Destroyed task read live document");return Task::Bytes{1};},executor.launch());task.begin(source,{"destroyed",100,false});start(task,source);}
  executor.step();check(calls==1&&source.pixels()==before&&!source.canUndo(),"Destroyed task retained live writes");
 }
 {Document source(4,4);Task task(encode);task.begin(source,{"default",100,false});std::optional<Task::Result> result;
  const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(5);
  while(!result&&std::chrono::steady_clock::now()<until){result=task.poll(source,deadline());if(!result)std::this_thread::yield();}
  check(result&&result->kind==Task::Result::Succeeded&&!result->bytes.empty(),"Default async launcher failed");
 }
 std::cout<<"Layered export: real ASE/PSD scaling and detached snapshots, budget, cancel/drain, failures/retry, identity and destruction passed without UI\n";return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
