#include "task_stage_profile.h"
#include "task_poll_schedule.h"
#include "preview_task.h"
#include <deque>
#include <vector>
#include <sstream>
#include <stdexcept>
#include <iostream>
using Profile=moon::workspace::TaskStageProfile;
using Stage=Profile::Stage;
using namespace std::chrono_literals;
static void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
static void verifyPollSchedule(){
 using Schedule=moon::workspace::TaskPollSchedule;
 std::vector<int> order;int pendingQueries=0;bool fail=false;bool saved=false;bool recovered=false;
 auto task=[&](int id){return Schedule::Task{[&,id]{order.push_back(id);if(fail&&id==6)throw std::runtime_error("save failure");if(id==6)saved=true;if(id==10){check(saved,"Recovery ran before save acknowledgement");recovered=true;}if(id==12)check(recovered,"Preview published ahead of recovery safe point");},[&]()->std::optional<std::size_t>{++pendingQueries;return 0;}};};
 Schedule schedule({task(0),task(1),task(2)},{task(3),task(4),task(5)},
  {task(6),task(7)},{task(8),task(9)},{task(10),task(11)},
  {task(12),task(13),task(14),task(15),task(16),task(17)});
 Profile profile; schedule.poll(profile);
 std::vector<int> expected;for(int i=0;i<18;++i)expected.push_back(i);
 check(order==expected&&pendingQueries==0,"Schedule changed order or sampled disabled diagnostics");
 order.clear();saved=recovered=false;profile.enable(true);schedule.poll(profile);
 check(order==expected&&pendingQueries==18&&profile.cycles().calls==1,"Schedule dropped a lane or lost observations");
 fail=true;order.clear();bool rejected=false;
 try{schedule.poll(profile);}catch(const std::runtime_error& error){rejected=std::string(error.what())=="save failure";}
 check(rejected&&order==std::vector<int>({0,1,2,3,4,5,6})&&profile.sample(Stage::Save).failures==1,"Schedule changed original exception/abort ordering");
 fail=false;order.clear();schedule.poll(profile);check(order==expected,"A failed cycle poisoned later polling");
}
int main(){try{verifyPollSchedule();
 Profile::Clock::time_point now{};int clocks=0,queries=0;std::vector<int> order;
 Profile profile(false,[&]{++clocks;return now;});
 {auto cycle=profile.cycle(16ms);profile.run(Stage::Gallery,[&]{order.push_back(1);},[&]{++queries;return std::size_t(99);});}
 check(clocks==0&&queries==0&&order==std::vector<int>{1}&&profile.cycles().calls==0,"Disabled diagnostic changed execution or sampled state");
 profile.enable(true);
 {auto cycle=profile.cycle(16ms);
  profile.run(Stage::Gallery,[&]{order.push_back(2);now+=3ms;},[&]{++queries;return std::size_t(2);});
  profile.run(Stage::Save,[&]{order.push_back(3);now+=14ms;});
 }
 check(order==std::vector<int>({1,2,3})&&profile.cycles().calls==1&&profile.cycles().totalMs==17&&profile.cycles().overBudget==1,"Observed cycle reordered work, skipped budget overrun or included extra clock calls");
 check(profile.sample(Stage::Gallery).totalMs==3&&profile.sample(Stage::Gallery).pendingSamples==1&&profile.sample(Stage::Gallery).lastPending==2&&profile.sample(Stage::Save).totalMs==14&&profile.sample(Stage::Save).pendingSamples==0,"Stage timing/backlog or unknown backlog incorrect");
 bool thrown=false;
 try{auto cycle=profile.cycle(16ms);profile.run(Stage::Gallery,[&]{now+=1ms;throw std::runtime_error("original failure");},[]{return std::size_t(0);});profile.run(Stage::Save,[&]{order.push_back(9);});}catch(const std::runtime_error& e){thrown=std::string(e.what())=="original failure";}
 check(thrown&&order.size()==3&&profile.sample(Stage::Gallery).failures==1&&profile.cycles().failures==1&&profile.sample(Stage::Gallery).calls==2&&profile.sample(Stage::Gallery).maxMs==3&&profile.sample(Stage::Gallery).maxPending==2&&profile.sample(Stage::Gallery).lastPending==0,"Diagnostic changed exception/following work or maxima");
 {auto cycle=profile.cycle(16ms);profile.run(Stage::Save,[&]{now+=16ms;});}
 check(profile.cycles().calls==3&&profile.cycles().overBudget==1&&profile.sample(Stage::Save).maxMs==16,"Equal budget incorrectly overran or later cycles lost");
 std::ostringstream report;profile.write(report);check(report.str().find("cycle\t3\t1\t34\t17\t0\t\t\t16\t1")!=std::string::npos&&report.str().find("gallery\t2\t1\t4\t3\t2\t0\t2")!=std::string::npos,"Exported observation lost budget or zero-vs-unknown backlog");
 // Exercise the production one-running/latest-pending transport, not a fake
 // future flag: the observer must report both slots without consuming either.
 std::deque<std::function<void()>> jobs;moon::workspace::PreviewTask<int> task([&](auto work){jobs.push_back(std::move(work));});
 const auto due=moon::workspace::PreviewClock::time_point{};
 check(task.pendingCount()==0,"Idle queue depth");task.request(1,moon::workspace::PreviewIntent::Preview,due);check(task.pendingCount()==1,"Queued request depth");
 task.poll(1,[]{return std::optional<int>(1);},[](int&,const auto&){return true;},due);task.request(1,moon::workspace::PreviewIntent::Preview,due);
 check(task.pendingCount()==2,"Running and latest-pending depth");task.request(1,moon::workspace::PreviewIntent::Preview,due);check(task.pendingCount()==2&&jobs.size()==1,"Latest replacement created another slot or dispatched work");task.cancel();check(task.pendingCount()==1,"Cancel discarded running ownership");jobs.front()();jobs.pop_front();task.poll(1,[]{return std::optional<int>(1);},[](int&,const auto&){return true;},due);check(task.pendingCount()==0,"Completed stale task depth");
 std::cout<<"Task stages: disabled zero-observation, ordered calls, failure propagation, exact budget, explicit unknown backlog and real bounded queue depth passed without UI\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
