#pragma once
#include <array>
#include <chrono>
#include <cstddef>
#include <functional>
#include <exception>
#include <optional>
#include <ostream>
#include <utility>

namespace moon::workspace {
// Observes the existing UI poll order. It never queues, skips or reschedules work.
class TaskStageProfile {
public:
 enum class Stage {Gallery,Folder,HomeRecovery,Timelapse,Liquify,BrushPreferences,Save,BatchExport,PaletteHold,Playback,Recovery,Usage,Convolution,AntiAlias,GradientMap,Wand,Gradient,Shape,Count};
 using Clock=std::chrono::steady_clock;
 using Now=std::function<Clock::time_point()>;
 struct Sample {std::size_t calls=0,failures=0,pendingSamples=0,lastPending=0,maxPending=0,overBudget=0;double totalMs=0,maxMs=0;};
 explicit TaskStageProfile(bool enabled=false,Now now=Clock::now):enabled_(enabled),now_(std::move(now)){}
 void enable(bool value){enabled_=value;}
 bool enabled()const{return enabled_;}
 const Sample& sample(Stage stage)const{return stages_.at(std::size_t(stage));}
 const Sample& cycles()const{return cycles_;}
 class Cycle {
 public:
  Cycle(TaskStageProfile& owner,std::chrono::milliseconds budget):owner_(owner.enabled_?&owner:nullptr),budget_(budget),uncaught_(std::uncaught_exceptions()){if(owner_)started_=owner_->now_();}
  ~Cycle(){if(owner_)owner_->finishCycle(started_,budget_,std::uncaught_exceptions()>uncaught_);}
  Cycle(const Cycle&)=delete;Cycle& operator=(const Cycle&)=delete;
 private:
  TaskStageProfile* owner_;Clock::time_point started_;std::chrono::milliseconds budget_;int uncaught_;
 };
 Cycle cycle(std::chrono::milliseconds budget){return Cycle(*this,budget);}
 template<class Work,class Pending> void run(Stage stage,Work&& work,Pending&& pending){
  if(!enabled_){std::forward<Work>(work)();return;}
  auto& sample=stages_.at(std::size_t(stage));const auto start=now_();
  const std::optional<std::size_t> backlog=std::forward<Pending>(pending)();
  try{std::forward<Work>(work)();}catch(...){record(sample,start,backlog,true);throw;}
  record(sample,start,backlog,false);
 }
 template<class Work> void run(Stage stage,Work&& work){run(stage,std::forward<Work>(work),[]{return std::optional<std::size_t>{};});}
 static const char* name(Stage stage){
  static constexpr const char* names[]={"gallery","folder","home-recovery","timelapse","liquify","brush-preferences","save","batch-export","palette-hold","playback","recovery","usage","convolution","anti-alias","gradient-map","wand","gradient","shape"};
  return names[std::size_t(stage)];
 }
 void write(std::ostream& out)const{
  out<<"stage\tcalls\tfailures\ttotal_ms\tmax_ms\tpending_samples\tlast_pending\tmax_pending\tbudget_ms\tover_budget\n";
  auto row=[&](const char* name,const Sample& s,bool cycle){out<<name<<'\t'<<s.calls<<'\t'<<s.failures<<'\t'<<s.totalMs<<'\t'<<s.maxMs<<'\t'<<s.pendingSamples<<'\t';if(s.pendingSamples)out<<s.lastPending;out<<'\t';if(s.pendingSamples)out<<s.maxPending;out<<'\t';if(cycle)out<<lastBudget_.count();out<<'\t';if(cycle)out<<s.overBudget;out<<'\n';};
  row("cycle",cycles_,true);for(std::size_t i=0;i<stages_.size();++i)row(name(Stage(i)),stages_[i],false);
 }
private:
 double record(Sample& sample,Clock::time_point start,std::optional<std::size_t> pending,bool failed){
  const auto elapsed=std::chrono::duration<double,std::milli>(now_()-start).count();++sample.calls;if(failed)++sample.failures;sample.totalMs+=elapsed;if(elapsed>sample.maxMs)sample.maxMs=elapsed;
  if(pending){++sample.pendingSamples;sample.lastPending=*pending;if(*pending>sample.maxPending)sample.maxPending=*pending;}
  return elapsed;
 }
 void finishCycle(Clock::time_point start,std::chrono::milliseconds budget,bool failed){const auto elapsed=record(cycles_,start,{},failed);lastBudget_=budget;if(elapsed>budget.count())++cycles_.overBudget;}
 bool enabled_;Now now_;std::array<Sample,std::size_t(Stage::Count)> stages_{};Sample cycles_;std::chrono::milliseconds lastBudget_{0};
};
}
