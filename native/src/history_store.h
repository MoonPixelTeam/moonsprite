#pragma once
#include <algorithm>
#include <cstddef>
#include <limits>
#include <stdexcept>
#include <utility>
#include <type_traits>
#include <vector>

namespace moon {
// Chronological storage only. Domain replay and notifications stay in Document.
template<class Entry> class HistoryStore {
public:
 struct Trim {std::size_t undo=0,redo=0;};
 static constexpr std::size_t unlimited=std::numeric_limits<std::size_t>::max();
 static std::size_t normalizeLimit(std::size_t limit){return limit==unlimited?limit:std::clamp<std::size_t>(limit,1,10000);}
 explicit HistoryStore(std::size_t maxBytes,std::size_t maxEntries=unlimited):maxBytes_(maxBytes),maxEntries_(normalizeLimit(maxEntries)){}
 bool empty()const{return entries_.empty();}
 std::size_t capacity()const{return entries_.capacity();}
 std::size_t size()const{return entries_.size();}
 std::size_t position()const{return position_;}
 std::size_t bytes()const{return bytes_;}
 std::size_t limit()const{return maxEntries_;}
 // Preparation validates all storage metadata before Document commits domain state.
 class PreparedInstallation {
  friend class HistoryStore;
  std::vector<Entry> entries;
  std::size_t position=0,bytes=0,limit=unlimited;
 };
 static PreparedInstallation prepareInstallation(std::vector<Entry> entries,std::size_t position,std::size_t limit){
  if(position>entries.size())throw std::invalid_argument("History installation position exceeds entries");
  PreparedInstallation prepared;prepared.position=position;prepared.limit=std::max<std::size_t>(1,limit);
  for(std::size_t i=0;i<position;++i){const auto cost=entries[i].bytes();if(cost>unlimited-prepared.bytes)throw std::length_error("History installation byte cost exceeded");prepared.bytes+=cost;}
  prepared.entries=std::move(entries);return prepared;
 }
 void install(PreparedInstallation prepared)noexcept{
  entries_.swap(prepared.entries);position_=prepared.position;bytes_=prepared.bytes;maxEntries_=prepared.limit;
 }
 bool canUndo()const{return position_!=0;}
 bool canRedo()const{return position_<size();}
 const std::vector<Entry>& entries()const{return entries_;}
 const Entry& at(std::size_t index)const{return entries_.at(index);}
 const Entry& latest()const{return entries_.back();}
 void clear(){entries_.clear();position_=bytes_=0;}
 void reserve(std::size_t additional=1){
  const auto maximum=entries_.max_size();
  if(additional>maximum-position_)throw std::length_error("History entry capacity exceeded");
  const auto required=position_+additional,current=entries_.capacity();if(required<=current)return;
  const auto growth=std::max<std::size_t>(current/2,8);
  const auto grown=current>maximum-growth?maximum:current+growth;
  entries_.reserve(std::max(required,grown));
 }
 std::size_t push(Entry entry,bool trim=true){
  reserve();const auto cost=entry.bytes();entries_.resize(position_);
  entries_.push_back(std::move(entry));bytes_+=cost;++position_;
  return trim?trimUndo():0;
 }
 // Preserve Document's native publication point: apply -> position ->
 // projection/publication hook -> accounting. Domain replay failure does not move.
 template<class Apply,class Published> const Entry* undo(Apply apply,Published published){
  if(!canUndo())return nullptr;
  const auto& entry=entries_[position_-1];apply(entry);--position_;
  published(entry);bytes_-=entry.bytes();return &entry;
 }
 template<class Apply> const Entry* undo(Apply apply){return undo(std::move(apply),[](const Entry&){});}
 template<class Apply,class Published> const Entry* redo(Apply apply,Published published){
  if(!canRedo())return nullptr;
  const auto& entry=entries_[position_];apply(entry);++position_;
  published(entry);bytes_+=entry.bytes();return &entry;
 }
 template<class Apply> const Entry* redo(Apply apply){return redo(std::move(apply),[](const Entry&){});}
 std::size_t enforceLimits(){return trimUndo();}
 // Build sees immutable entries. All allocation/accounting finishes before
 // children are moved, so a rejected builder cannot consume the old history.
 template<class Build,class Cost> std::size_t group(std::size_t start,Build build,Cost totalCost){
  static_assert(std::is_nothrow_move_constructible_v<Entry>);
  if(start>=position_)return 0;
  std::size_t replacedBytes=0;for(auto i=start;i<position_;++i){const auto cost=entries_[i].bytes();if(cost>unlimited-replacedBytes)throw std::length_error("History group byte cost exceeded");replacedBytes+=cost;}
  auto merged=build(std::as_const(entries_),start,position_);
  if(!merged.children.empty())throw std::logic_error("History group builder must leave children to storage");
  merged.children.reserve(position_-start);
  const auto cost=totalCost(std::as_const(merged),replacedBytes);
  if(cost>unlimited-(bytes_-replacedBytes))throw std::length_error("History group byte cost exceeded");
  for(auto i=start;i<position_;++i)merged.children.push_back(std::move(entries_[i]));
  entries_.resize(start);entries_.push_back(std::move(merged));position_=entries_.size();
  bytes_=bytes_-replacedBytes+cost;return trimUndo();
 }
 template<class Change> void updateLatest(Change change){
  const auto cost=entries_.back().bytes();change(entries_.back());
  if(position_==entries_.size())bytes_=bytes_-cost+entries_.back().bytes();
 }
 // Palette view annotations can target the newest applied entry with redo retained.
 template<class Change> bool updateLatestApplied(Change change){
  if(!position_)return false;
  auto& entry=entries_[position_-1];const auto cost=entry.bytes();change(entry);bytes_=bytes_-cost+entry.bytes();return true;
 }
 // View-only annotations are excluded from Entry::bytes by the domain contract.
 template<class Change> bool annotateLatestApplied(Change change){
  if(!position_)return false;change(entries_[position_-1]);return true;
 }
 // A preview draft is consumed without replay; the caller keeps its domain result.
 Entry takeLatest(){
  if(entries_.empty())throw std::logic_error("Missing preview history");
  const auto cost=entries_.back().bytes();Entry entry=std::move(entries_.back());
  if(position_==entries_.size()){--position_;bytes_-=cost;}
  entries_.pop_back();return entry;
 }
 Trim setLimit(std::size_t limit){
  const auto next=normalizeLimit(limit);if(next==maxEntries_)return {};
  const auto previous=size();maxEntries_=next;const auto undo=trimUndo();
  if(size()>maxEntries_)entries_.resize(maxEntries_);
  return {undo,previous-size()-undo};
 }
private:
 std::size_t trimUndo(){
  std::size_t count=0;
  while(bytes_>maxBytes_&&position_-count>1)bytes_-=entries_[count++].bytes();
  while(size()-count>maxEntries_&&count<position_)bytes_-=entries_[count++].bytes();
  if(count){entries_.erase(entries_.begin(),entries_.begin()+count);position_-=count;}
  return count;
 }
 std::vector<Entry> entries_;
 std::size_t position_=0,bytes_=0,maxBytes_,maxEntries_;
};
}
