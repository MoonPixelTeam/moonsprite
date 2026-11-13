#ifdef NDEBUG
#undef NDEBUG
#endif
#include "history_store.h"
#include "history_replay.h"
#include <cassert>
#include <string>
struct Entry {int id=0;std::size_t cost=10;std::vector<Entry> children;std::size_t bytes()const{return cost;}};
using Store=moon::HistoryStore<Entry>;
int main(){
 // Parent selection/projection can reject after all child callbacks returned.
 for(bool forward:{false,true})for(bool restoreFailure:{false,true}){
  const std::vector<int> entries{1,2,3};moon::PreparedHistoryReplay replay(entries.size());
  int state=forward?0:6;const int initial=state;std::string order;
  replay.run(entries,forward,[&](int id,bool direction){state+=direction?id:-id;});
  std::exception_ptr failure;try{throw std::range_error("parent projection");}catch(...){failure=std::current_exception();}
  bool caught=false;
  try{replay.restore(entries,forward,failure,[&](int id,bool direction){order+=char('0'+id);if(restoreFailure&&id==2)throw std::logic_error("restore");state+=direction?id:-id;});}
  catch(const moon::HistoryReplayError& error){caught=restoreFailure&&error.failures().size()==2;}
  catch(const std::range_error& error){caught=!restoreFailure&&std::string(error.what())=="parent projection";}
  assert(caught&&order==(forward?"321":"123"));if(!restoreFailure)assert(state==initial);
 }
 // Legacy compound replay: undo reverses order; a failed later callback
 // restores all completed callbacks and retains the original exception type.
 for(bool forward:{false,true})for(int failing=0;failing<4;++failing){
  const std::vector<int> entries{1,2,3,4};int state=forward?0:10;const int initial=state;std::string order;
  bool caught=false;
  try{moon::replayHistoryEntries(entries,forward,[&](int id,bool direction){
   order+=direction?char('0'+id):char('a'+id);
   if(direction==forward&&id==entries[forward?failing:3-failing])throw std::range_error("replay");
   state+=direction?id:-id;
  });}catch(const std::range_error& error){caught=std::string(error.what())=="replay";}
  assert(caught&&state==initial&&order.size()==std::size_t(2*failing+1));
 }
 {const std::vector<int> entries{1,2,3};std::string order;bool caught=false;
  try{moon::replayHistoryEntries(entries,true,[&](int id,bool direction){order+=char('0'+id);if(id==3)throw std::range_error("original");if(!direction)throw std::logic_error("rollback");});}
  catch(const moon::HistoryReplayError& error){caught=error.failures().size()==3;try{std::rethrow_exception(error.failures().front());}catch(const std::range_error& original){assert(std::string(original.what())=="original");}}
  assert(caught&&order=="12321");
 }
 {const std::vector<int> entries{1,2,3};std::string order;moon::replayHistoryEntries(entries,true,[&](int id,bool){order+=char('0'+id);});moon::replayHistoryEntries(entries,false,[&](int id,bool){order+=char('0'+id);});assert(order=="123321");}
 Store timeline(10000);int state=3;
 for(int i=1;i<=3;++i)timeline.push({i});
 assert(timeline.bytes()==30&&timeline.position()==3);
 timeline.undo([&](const Entry&){--state;});assert(state==2&&timeline.bytes()==20);
 timeline.undo([&](const Entry&){--state;});timeline.undo([&](const Entry&){--state;});
 auto trim=timeline.setLimit(2);assert(trim.undo==0&&trim.redo==1&&state==0&&timeline.at(0).id==1&&timeline.at(1).id==2);
 timeline.redo([&](const Entry& e){state=e.id;});assert(state==1&&timeline.bytes()==10);
 timeline.push({4});assert(!timeline.canRedo()&&timeline.size()==2&&timeline.at(1).id==4&&timeline.bytes()==20);
 Store limited(15);limited.push({1});assert(limited.push({2})==1&&limited.latest().id==2&&limited.bytes()==10);
 limited.push({3,100});assert(limited.size()==1&&limited.bytes()==100);
 Store failures(100);failures.push({1,7});bool caught=false;
 try{failures.undo([](const Entry&){throw std::runtime_error("undo");});}catch(...){caught=true;}
 assert(caught&&failures.position()==1&&failures.bytes()==7);
 failures.undo([](const Entry&){});caught=false;
 try{failures.redo([](const Entry&){throw std::runtime_error("redo");});}catch(...){caught=true;}
 assert(caught&&failures.position()==0&&failures.bytes()==0);
 Store groups(100);groups.push({1},false);groups.push({2},false);groups.push({3},false);
 groups.group(1,[](const auto& entries,std::size_t from,std::size_t to){Entry group{9,0};for(auto i=from;i<to;++i)group.cost+=entries[i].bytes();return group;},[](const auto& group,std::size_t){return group.bytes();});
 assert(groups.size()==2&&groups.position()==2&&groups.bytes()==30&&groups.latest().children.size()==2);
 // Builders and cost preparation fail before any old child is moved.
 for(int stage=0;stage<4;++stage){
  Store preparedGroup(10000);for(int i=1;i<=3;++i)preparedGroup.push({i});
  bool rejected=false;
  try{preparedGroup.group(1,[&](const auto& entries,std::size_t from,std::size_t to){
   static_assert(std::is_const_v<std::remove_reference_t<decltype(entries[from])>>);
   assert(to-from==2&&entries[from].id==2);
   if(stage==0)throw std::bad_alloc();Entry parent{9,0};if(stage==1)parent.children.push_back({99});return parent;
  },[&](const auto&,std::size_t){if(stage==2)throw std::runtime_error("cost preparation");return Store::unlimited;});}
  catch(const std::exception&){rejected=true;}
  assert(rejected&&preparedGroup.size()==3&&preparedGroup.position()==3&&preparedGroup.bytes()==30);
  for(int i=0;i<3;++i)assert(preparedGroup.at(i).id==i+1&&preparedGroup.at(i).children.empty());
 }
 std::string order;groups.undo([&](const auto& group){for(auto i=group.children.rbegin();i!=group.children.rend();++i)order+=char('0'+i->id);});
 groups.redo([&](const auto& group){for(const auto& child:group.children)order+=char('0'+child.id);});assert(order=="3223"&&groups.bytes()==30);
 groups.updateLatest([](auto& entry){entry.cost=35;});assert(groups.bytes()==45);
 const auto draft=groups.takeLatest();assert(draft.id==9&&groups.size()==1&&groups.bytes()==10);
 Store many(Store::unlimited);for(int i=0;i<1002;++i)many.push({i});assert(many.size()==1002);
 trim=many.setLimit(2);assert(trim.undo==1000&&many.position()==2&&many.bytes()==20);
 many.setLimit(Store::unlimited);many.push({1003});assert(many.size()==3);
 many.clear();assert(!many.canUndo()&&!many.canRedo()&&many.bytes()==0);
 Store installed(10000);installed.push({99,3});
 auto prepared=Store::prepareInstallation({{1,7},{2,11},{3,13}},1,2);
 assert(installed.latest().id==99&&installed.position()==1&&installed.bytes()==3);
 installed.install(std::move(prepared));
 assert(installed.size()==3&&installed.position()==1&&installed.bytes()==7&&installed.limit()==2);
 assert(installed.canRedo()&&installed.at(installed.position()).id==2);
 assert(installed.updateLatestApplied([](auto& entry){entry.cost=17;}));
 assert(installed.at(0).cost==17&&installed.at(2).cost==13&&installed.bytes()==17);
 installed.redo([](const auto&){});assert(installed.bytes()==28&&installed.position()==2);
 installed.undo([](const auto&){});installed.undo([](const auto&){});
 assert(!installed.updateLatestApplied([](auto&){assert(false);}));
 caught=false;try{Store::prepareInstallation({{4,9}},2,4);}catch(const std::invalid_argument&){caught=true;}
 assert(caught&&installed.size()==3&&installed.position()==0&&installed.bytes()==0);
 caught=false;try{Store::prepareInstallation({{4,Store::unlimited},{5,1}},2,4);}catch(const std::length_error&){caught=true;}
 assert(caught&&installed.size()==3&&installed.position()==0&&installed.bytes()==0);
 // Hydration preserves an already prepared archive limit; it must not silently
 // clamp it, trim undo/redo, replay a domain operation or emit notifications.
 installed.install(Store::prepareInstallation({{7,41},{8,43}},1,20000));
 assert(installed.size()==2&&installed.position()==1&&installed.bytes()==41&&installed.limit()==20000);
 Store phases(100);phases.push({5,9});std::string phase;
 phases.undo([&](const auto&){assert(phases.position()==1&&phases.bytes()==9);phase+="apply-undo;";},[&](const auto&){assert(phases.position()==0&&phases.bytes()==9);phase+="publish-undo;";});
 assert(phases.position()==0&&phases.bytes()==0);
 phases.redo([&](const auto&){assert(phases.position()==0&&phases.bytes()==0);phase+="apply-redo;";},[&](const auto&){assert(phases.position()==1&&phases.bytes()==0);phase+="publish-redo;";});
 assert(phases.position()==1&&phases.bytes()==9&&phase=="apply-undo;publish-undo;apply-redo;publish-redo;");
 assert(phases.annotateLatestApplied([](auto& e){e.id=6;}));assert(phases.latest().id==6&&phases.bytes()==9);
 Store delayed(15);delayed.push({1,10},false);delayed.push({2,10},false);assert(delayed.size()==2&&delayed.bytes()==20);
 assert(delayed.enforceLimits()==1&&delayed.size()==1&&delayed.bytes()==10);
 return 0;
}
