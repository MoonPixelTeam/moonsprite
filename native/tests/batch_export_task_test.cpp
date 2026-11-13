#include "batch_export_task.h"
#include <deque>
#include <iostream>
using namespace moon;
using namespace moon::workspace;
static void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
struct ManualExecutor {
 std::deque<std::function<void()>> jobs;
 PreviewExecutor executor(){return [this](auto work){jobs.push_back(std::move(work));};}
 void step(){check(!jobs.empty(),"Missing export worker");auto work=std::move(jobs.front());jobs.pop_front();work();}
};
using Task=BatchExportTask;
static DocumentSnapshot capture(Task& task,const Document& document){
 for(int i=0;i<100;++i){
  auto result=task.capture(document,std::chrono::steady_clock::now()+std::chrono::seconds(1));
  if(result.kind==Task::Capture::Ready){check(result.snapshot.has_value(),"Missing captured snapshot");return std::move(*result.snapshot);}
  check(result.kind==Task::Capture::Pending,"Capture failed");
 }
 throw std::runtime_error("Unbounded capture");
}
int main(){try{
 {Task task;Document document(4,4);check(!task.busy()&&!task.poll(),"New export is busy");
  check(!task.launch([](auto){return Task::Result{};}),"Unrequested worker accepted");
  check(task.begin(document,3)&&task.capturing(),"Export did not begin");const auto token=task.progress();
  check(token.total()==3&&!task.begin(document,9)&&task.progress().total()==3,"Required export replaced");
  task.cancel();check(token.cancelled(),"Cancel did not reach captured token");
  check(task.capture(document,std::chrono::steady_clock::now()).kind==Task::Capture::Cancelled&&!task.busy(),"Cancelled capture retained job");
  check(task.begin(document,1)&&!task.progress().cancelled(),"New invocation inherited cancellation");}
 {Task task;Document source(512,512);task.begin(source,1);
  check(task.capture(source,std::chrono::steady_clock::now()).kind==Task::Capture::Pending,"Expired capture did not yield");
  source.beginStroke({1,1},0xff123456);source.commitStroke();
  const auto result=task.capture(source,std::chrono::steady_clock::now()+std::chrono::seconds(1));
  check(result.kind==Task::Capture::Failed&&!result.error.empty()&&!task.busy(),"Source mutation not rejected");
  check(task.begin(source,1),"Capture failure blocked retry");}
 {ManualExecutor executor;Task task(executor.executor());Document source(4,4);
  source.beginStroke({1,1},0xff123456);source.commitStroke();const auto pixels=source.pixels();
  task.begin(source,2);auto snapshot=std::make_shared<DocumentSnapshot>(capture(task,source));
  check(task.busy()&&!task.capturing()&&!task.begin(source,9),"Snapshot handoff released required job");
  source.beginStroke({2,2},0xffabcdef);source.commitStroke();
  task.launch([snapshot,pixels](auto progress){auto copy=snapshot->finish();check(copy.pixels()==pixels,"Worker read live source");
   progress.report(2);return Task::Result{Task::Result::Succeeded,2,{}};});
  check(task.running()&&!task.poll()&&!task.begin(source,9),"Running export replaced or synchronously waited");
  check(!task.launch([](auto){return Task::Result{};})&&executor.jobs.size()==1,"Second worker dispatched");executor.step();
  check(!task.begin(source,9),"Unconsumed completion replaced");auto result=task.poll();
  check(result&&result->kind==Task::Result::Succeeded&&result->written==2&&task.progress().written()==2&&!task.busy(),"Successful completion lost");
  check(!task.poll()&&task.begin(source,1),"Completion repeated or retry rejected");}
 {ManualExecutor executor;Task task(executor.executor());Document source(4,4);task.begin(source,3);
  task.launch([](auto progress){progress.report(1);progress.cancel();return Task::Result{Task::Result::Cancelled,progress.written(),{}};});
  executor.step();auto result=task.poll();check(result&&result->kind==Task::Result::Cancelled&&result->written==1,"Partial cancel count lost");}
 {ManualExecutor executor;Task task(executor.executor());Document source(4,4);task.begin(source,3);
  task.launch([](auto progress)->Task::Result{progress.report(1);throw std::runtime_error("write failed");});executor.step();
  auto result=task.poll();check(result&&result->kind==Task::Result::Failed&&result->written==1&&result->error=="write failed","Partial failure lost");
  check(task.begin(source,1),"Worker failure blocked retry");}
 {Task task([](auto){throw std::runtime_error("dispatch failed");});Document source(4,4);task.begin(source,1);
  task.launch([](auto){return Task::Result{};});check(task.busy(),"Scheduling failure was not pending");auto result=task.poll();
  check(result&&result->kind==Task::Result::Failed&&result->error=="dispatch failed"&&!task.busy(),"Scheduling failure lost");
  check(task.begin(source,1),"Scheduling failure blocked retry");}
 {ManualExecutor executor;Task task(executor.executor());Document source(4,4);task.begin(source,1);
  task.launch([](auto)->Task::Result{throw 7;});executor.step();auto result=task.poll();
  check(result&&result->kind==Task::Result::Failed&&!result->error.empty(),"Unknown worker failure escaped");}
 {Task task([](auto){throw 7;});Document source(4,4);task.begin(source,1);task.launch([](auto){return Task::Result{};});
  check(task.poll()->kind==Task::Result::Failed,"Unknown scheduler failure escaped");}
 {ManualExecutor executor;ExportProgress token;std::weak_ptr<DocumentSnapshot> lifetime;
  {Task task(executor.executor());Document source(4,4);task.begin(source,2);token=task.progress();
   auto snapshot=std::make_shared<DocumentSnapshot>(capture(task,source));lifetime=snapshot;
   task.launch([snapshot](auto progress){check(progress.cancelled(),"Destruction did not cancel worker");
    check(snapshot->finish().width()==4,"Worker snapshot died with UI");return Task::Result{Task::Result::Cancelled,0,{}};});}
  check(token.cancelled()&&!lifetime.expired(),"Destroyed task retained UI or destroyed snapshot");executor.step();
  check(lifetime.expired(),"Completed export retained snapshot");}
 {ManualExecutor executor;Task task(executor.executor());Document source(4,4);task.begin(source,1);
  auto snapshot=capture(task,source);task.discardCapture();
  check(!task.busy()&&task.progress().cancelled()&&task.begin(source,1),"Abandoned capture blocked retry");
  task.launch([](auto progress){return Task::Result{progress.cancelled()?Task::Result::Cancelled:Task::Result::Succeeded,0,{}};});
  task.discardCapture();check(task.running()&&!task.begin(source,1),"Capture cleanup abandoned running worker");
  executor.step();check(task.poll()->kind==Task::Result::Succeeded,"Capture cleanup cancelled running worker");}
 // Script export can retain the same token while synchronously pumping UI.
 {ExportProgress script(3);const auto worker=script;worker.report(1);check(script.total()==3&&script.written()==1,"Script progress not shared");
  script.cancel();check(worker.cancelled(),"Script cancellation not shared");script=ExportProgress{};
  check(worker.cancelled()&&worker.written()==1&&!script,"Script cleanup invalidated worker token");}
 std::cout<<"Deterministic batch export lifecycle checks passed\n";return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
