#include "preview_task.h"
#include <deque>
#include <iostream>
#include <stdexcept>

using namespace moon::workspace;
static void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
struct ManualExecutor {
 std::deque<std::function<void()>> jobs;
 PreviewExecutor executor(){return [this](auto work){jobs.push_back(std::move(work));};}
 void step(){check(!jobs.empty(),"Expected scheduled work");auto work=std::move(jobs.front());jobs.pop_front();work();}
};
using Job=PreviewTask<int>;
static const auto now=PreviewClock::time_point{};
static std::optional<int> capture(){return 7;}
static bool run(int& value,const std::function<bool()>& cancelled){value*=2;return !cancelled();}

int main(){try{
 {ManualExecutor executor;Job job(executor.executor());
  job.request(1,PreviewIntent::Preview,now+std::chrono::milliseconds(16));
  check(!job.poll(1,capture,run,now)&&executor.jobs.empty(),"Preview ignored due time");
  check(!job.poll(1,capture,run,now+std::chrono::milliseconds(16))&&executor.jobs.size()==1,"Preview did not schedule");
  check(!job.poll(1,capture,run,now)&&job.busy(),"Poll blocked or published unfinished work");
  executor.step();const auto result=job.poll(1,capture,run,now);
  check(result&&result->task==14&&!result->cancelled&&result->error.empty()&&!job.busy(),"Valid result was not accepted once");
  check(!job.poll(1,capture,run,now),"Result delivered twice");
 }
 {ManualExecutor executor;Job job(executor.executor());
  job.request(1,PreviewIntent::Preview,now,10);job.poll(1,capture,run,now);
  job.request(1,PreviewIntent::Preview,now,11);job.request(1,PreviewIntent::Preview,now,12);
  check(!job.poll(1,capture,run,now)&&executor.jobs.size()==1,"Preview spawned concurrent replacement workers");
  executor.step();check(!job.poll(1,capture,run,now)&&executor.jobs.size()==1,"Stale A was published instead of scheduling latest A");
  executor.step();const auto result=job.poll(1,capture,run,now);
  check(result&&result->request.revision==12,"Latest pending preview did not replace intermediate options");
 }
 {ManualExecutor executor;Job job(executor.executor());
  job.request(1,PreviewIntent::Preview,now);job.poll(1,capture,run,now);
  job.cancel();executor.step();check(!job.poll(1,capture,run,now)&&!job.busy(),"Cancelled result was published");
 }
 {ManualExecutor executor;Job job(executor.executor());
  job.request(1,PreviewIntent::Preview,now);job.poll(1,capture,run,now);
  check(!job.poll(2,capture,run,now),"Switch published A into B");
  executor.step();check(!job.poll(1,capture,run,now),"Returning to A revived invalidated result");
  job.request(2,PreviewIntent::Preview,now);job.poll(2,capture,run,now);executor.step();check(bool(job.poll(2,capture,run,now)),"New owner could not continue");
 }
 {ManualExecutor executor;Job job(executor.executor());
  job.request(1,PreviewIntent::ApplyAndClose,now,20);
  check(!job.request(1,PreviewIntent::Preview,now,21)&&job.committing(),"Later preview displaced Apply");
  job.poll(1,capture,run,now);executor.step();const auto result=job.poll(1,capture,run,now);
  check(result&&result->request.intent==PreviewIntent::ApplyAndClose&&result->request.revision==20,"Apply intent was changed");
  job.acknowledge();check(!job.committing(),"Apply barrier was not released after consumption");
 }
 {ManualExecutor executor;Job job(executor.executor());
  job.request(1,PreviewIntent::Apply,now);const auto missing=job.poll(1,[]{return std::optional<int>{};},run,now);
  check(missing&&!missing->task&&missing->error.empty()&&executor.jobs.empty(),"Missing target was not observable");job.acknowledge();
  job.request(1,PreviewIntent::Preview,now);const auto failed=job.poll(1,[]()->std::optional<int>{throw std::runtime_error("capture failure");},run,now);
  check(failed&&failed->error=="capture failure","Capture exception was lost");
  job.request(1,PreviewIntent::Preview,now);job.poll(1,capture,[](int&,const auto&)->bool{throw std::runtime_error("worker failure");},now);executor.step();
  check(job.poll(1,capture,run,now)->error=="worker failure","Worker exception was lost");
  job.request(1,PreviewIntent::Preview,now);job.poll(1,capture,run,now);executor.step();check(job.poll(1,capture,run,now)->task==14,"Failure poisoned later preview");
 }
 {bool fail=true;ManualExecutor executor;Job job([&](auto work){if(fail)throw std::runtime_error("executor failure");executor.jobs.push_back(std::move(work));});
  job.request(1,PreviewIntent::Preview,now);const auto result=job.poll(1,capture,run,now);
  check(result&&result->error=="executor failure"&&!job.busy(),"Executor failure left a stuck future");
  fail=false;job.request(1,PreviewIntent::Preview,now);job.poll(1,capture,run,now);executor.step();check(job.poll(1,capture,run,now)->task==14,"Executor recovery failed");
 }
 {ManualExecutor executor;bool cancelled=false;
  {Job job(executor.executor());job.request(1,PreviewIntent::Preview,now);job.poll(1,capture,[&](int&,const auto& stop){cancelled=stop();return !cancelled;},now);}
  executor.step();check(cancelled,"Owner destruction did not cancel detached snapshot");
 }
 std::cout<<"Deterministic scheduling, coalescing, apply barrier, identity/cancel/destruction and error recovery passed\n";
 return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
