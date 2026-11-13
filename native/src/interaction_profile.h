#pragma once
#include "task_stage_profile.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
namespace moon::editor {
// Opt-in bounded UI diagnostics; disabled runs do not read the clock or write.
struct InteractionProfile {

  struct Entry {const char* name=nullptr;std::uint64_t calls=0;double total=0,self=0,maximum=0;};

  std::array<Entry,16> entries{};

  std::filesystem::path path,taskPath;
  workspace::TaskStageProfile tasks;

  bool referenceHitTesting=false;

  InteractionProfile(){if(const auto value=_wgetenv(L"MOONSPRITE_TASK_STAGE_PROFILE"))taskPath=value;tasks.enable(!taskPath.empty());if(const auto value=_wgetenv(L"MOONSPRITE_INTERACTION_PROFILE"))path=value;if(!path.empty())referenceHitTesting=_wgetenv(L"MOONSPRITE_HIT_TEST_REFERENCE")!=nullptr;}

  ~InteractionProfile(){if(!taskPath.empty())try{std::ofstream out(taskPath);tasks.write(out);}catch(...){}if(path.empty())return;try{std::ofstream out(path);out<<"scope\tcalls\ttotal_ms\tself_ms\tmax_ms\n";for(const auto& e:entries)if(e.calls)out<<e.name<<'\t'<<e.calls<<'\t'<<e.total<<'\t'<<e.self<<'\t'<<e.maximum<<'\n';}catch(...){}}

  static InteractionProfile& get(){static InteractionProfile value;return value;}

};

struct InteractionScope {

  InteractionProfile::Entry* entry=nullptr;InteractionScope* parent=nullptr;

  std::chrono::steady_clock::time_point start;double children=0;

  static InteractionScope*& current(){static thread_local InteractionScope* value=nullptr;return value;}

  InteractionScope(int index,const char* name){auto& profile=InteractionProfile::get();if(profile.path.empty())return;entry=&profile.entries[index];entry->name=name;parent=current();current()=this;start=std::chrono::steady_clock::now();}

  ~InteractionScope(){if(!entry)return;const auto ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();++entry->calls;entry->total+=ms;entry->self+=ms-children;entry->maximum=std::max(entry->maximum,ms);current()=parent;if(parent)parent->children+=ms;}

};

}
