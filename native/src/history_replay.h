#pragma once
#include <cstddef>
#include <exception>
#include <stdexcept>
#include <utility>
#include <vector>

namespace moon {
// Native equivalent of legacy history.ts replayHistoryEntries. The document
// still owns every domain operation; this service only orders callbacks.
class HistoryReplayError final : public std::exception {
 std::vector<std::exception_ptr> failures_;
public:
 explicit HistoryReplayError(std::vector<std::exception_ptr> failures)noexcept:failures_(std::move(failures)){}
 const char* what()const noexcept override{return "History replay and rollback failed";}
 const std::vector<std::exception_ptr>& failures()const noexcept{return failures_;}
};

class PreparedHistoryReplay {
 std::vector<std::exception_ptr> failures_;
 template<class Entries,class Apply>
 [[noreturn]] void restoreCount(const Entries& entries,bool forward,std::size_t completed,std::exception_ptr failure,Apply&& apply){
  if(!completed)std::rethrow_exception(failure);
  auto& failures=failures_;failures.clear();failures.push_back(std::move(failure));
  while(completed){
   --completed;const auto index=forward?completed:entries.size()-1-completed;
   try{apply(entries[index],!forward);}catch(...){failures.push_back(std::current_exception());}
  }
  if(failures.size()==1)std::rethrow_exception(failures.front());
  throw HistoryReplayError(std::move(failures));
 }
public:
 explicit PreparedHistoryReplay(std::size_t entries){
  if(entries>=failures_.max_size())throw std::length_error("History replay failure ledger exceeded");
  if(entries)failures_.reserve(entries+1);
 }
 template<class Entries,class Apply>
 void run(const Entries& entries,bool forward,Apply&& apply){
 // Reserve the complete failure ledger before the first callback. The success
 // path uses a counter rather than allocating one record per completed step.
 auto& failures=failures_;failures.clear();
 if(entries.empty())return;
 if(entries.size()>=failures.capacity())throw std::logic_error("History replay was not prepared");
 std::size_t completed=0;
 auto index=[&](std::size_t position){return forward?position:entries.size()-1-position;};
 try{
  for(;completed<entries.size();++completed)apply(entries[index(completed)],forward);
 }catch(...){
  restoreCount(entries,forward,completed,std::current_exception(),std::forward<Apply>(apply));
 }
 }
 // A parent can fail after all children succeeded (selection/projection). The
 // same prepared ledger restores every completed child and keeps all failures.
 template<class Entries,class Apply>
 [[noreturn]] void restore(const Entries& entries,bool forward,std::exception_ptr failure,Apply&& apply){
  if(!entries.empty()&&entries.size()>=failures_.capacity())throw std::logic_error("History replay was not prepared");
  restoreCount(entries,forward,entries.size(),std::move(failure),std::forward<Apply>(apply));
 }
};
template<class Entries,class Apply>
void replayHistoryEntries(const Entries& entries,bool forward,Apply&& apply){
 PreparedHistoryReplay prepared(entries.size());prepared.run(entries,forward,std::forward<Apply>(apply));
}
}
