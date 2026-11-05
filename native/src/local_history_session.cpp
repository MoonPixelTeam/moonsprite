#include "local_history_session.h"
#include "local_history_committed.h"
#include "document.h"
#include "local_history_generation.h"
#include <algorithm>
#include <unordered_set>
#include <cmath>
#include <codecvt>
#include <locale>
#include <stdexcept>
namespace moon::local_history {
namespace {
void validate(const JournalSession::State& state){
 if(state.snapshots.size()!=state.labels.size()+1||state.position>state.labels.size()||std::any_of(state.snapshots.begin(),state.snapshots.end(),[](const auto& node){return !node;}))throw std::invalid_argument("Invalid journal session state");
}
}
JournalSession::JournalSession(State state,std::string shape):state_(std::move(state)){
 validate(state_);const auto& current=state_.snapshots[state_.position];shapes_.emplace(current.get(),Shape{current,std::move(shape)});shapeOwners_.emplace_back(current.get(),current);
}
void JournalSession::acknowledge(std::vector<JournalSnapshot::Ptr>& recorded,const std::vector<Data>& archives,TransitionDeltaCache& cache,double budget){
 if(recorded.empty()||recorded.size()!=archives.size()||std::isnan(budget))throw std::invalid_argument("Invalid history acknowledgement");
 if(std::any_of(recorded.begin(),recorded.end(),[](const auto& value){return !value;}))throw std::invalid_argument("Missing acknowledged history snapshot");
 if(!pressured_&&!(recorded.front()->kind()==JournalSnapshot::Kind::Increment&&state_.snapshots.front()==recorded.front()))return;
 SnapshotReplacements replacements;
 std::unordered_set<const JournalSnapshot*> live;for(const auto& node:state_.snapshots)live.insert(node.get());
 for(std::size_t index=0;index<recorded.size();++index)if(archives[index]&&!archives[index]->empty()&&live.count(recorded[index].get()))replacements.set(recorded[index],JournalSnapshot::archive(archives[index]));
 auto next=state_.snapshots;auto nextRecord=recorded;
 std::vector<std::pair<JournalSnapshot::Ptr,Shape>> shapes;
 for(auto& node:next){const auto before=node;
  if(const auto found=replacements.find(before);found!=replacements.end())node=found->second;
  else if(before->kind()==JournalSnapshot::Kind::Increment){if(const auto base=replacements.find(before->base());base!=replacements.end())node=JournalSnapshot::rebase(before,base->second);}
  replacements.set(before,node);
  const auto shape=shapes_.find(before.get());if(shape!=shapes_.end()&&shape->second.owner.lock()==before)shapes.emplace_back(node,Shape{node,shape->second.value});
 }
 for(auto& node:nextRecord)if(const auto found=replacements.find(node);found!=replacements.end())node=found->second;
 const bool pressure=pressured_&&retainedSnapshotBytes(next)>budget;
 // Cache writes only add valid mappings for immutable nodes. Publish the live
 // vectors after every potentially throwing preparation/allocation succeeds.
 for(std::size_t i=0;i+1<next.size();++i){const auto value=cache.get(state_.snapshots[i],state_.snapshots[i+1]);if(value)cache.set(next[i],next[i+1],*value);}
 shapes_.reserve(shapes_.size()+shapes.size());shapeOwners_.reserve(shapeOwners_.size()+shapes.size());
 std::unordered_map<const JournalSnapshot*,Shape> updates;updates.reserve(shapes.size());for(auto& item:shapes)updates.insert_or_assign(item.first.get(),std::move(item.second));
 for(auto& [key,value]:updates){const auto found=shapes_.find(key);if(found==shapes_.end()||found->second.owner.expired())shapeOwners_.emplace_back(key,value.owner);if(found!=shapes_.end()){found->second.owner.swap(value.owner);found->second.value.swap(value.value);}}
 shapes_.merge(updates);state_.snapshots.swap(next);recorded.swap(nextRecord);pressured_=pressure;
}
void JournalSession::recordSettled(const HistoryStackChange& source,const Document& document,Dependencies dependencies,project::Limits limits){
 Change change{Change::Kind::Clear};
 switch(source.kind){
 case HistoryStackChange::Kind::Push:change.kind=Change::Kind::Push;change.label=std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(source.label);break;
 case HistoryStackChange::Kind::Trim:change.kind=Change::Kind::Trim;break;
 case HistoryStackChange::Kind::Undo:change.kind=Change::Kind::Undo;break;
 case HistoryStackChange::Kind::Redo:change.kind=Change::Kind::Redo;break;
 case HistoryStackChange::Kind::Clear:change.kind=Change::Kind::Clear;break;
 }
 change.discardedUndo=source.discardedUndo;change.discardedRedo=source.discardedRedo;
 recordSettled(change,document,source.revision,std::move(dependencies),limits);
}
void JournalSession::recordSettled(const Change& change,const Document& document,std::uint64_t expectedHistoryRevision,Dependencies dependencies,project::Limits limits){
 if(document.active()||document.historyRevision()!=expectedHistoryRevision)throw std::invalid_argument("History notification is not settled or is stale");
 dependencies.committed=[&document,expectedHistoryRevision,limits]{return CommittedCapture::latest(document,expectedHistoryRevision,limits);};
 record(change,documentShape(document),dependencies);
}
void JournalSession::record(const Change& change,std::string shape,const Dependencies& dependencies){
 if(dependencies.limit<1||dependencies.limit>200||std::isnan(dependencies.budget))throw std::invalid_argument("Invalid journal session limits");
 // Legacy suspends and discards the session on failure. Stage this native
 // transaction first so that a caller can report that failure before teardown.
 auto next=state_;std::unordered_map<const JournalSnapshot*,Shape> updates;bool pressured=pressured_;
 const auto remember=[&](const JournalSnapshot::Ptr& node,const std::string& value){updates.insert_or_assign(node.get(),Shape{node,value});};
 const auto knownShape=[&](const JournalSnapshot::Ptr& node)->std::optional<std::string>{
  const auto pending=updates.find(node.get());if(pending!=updates.end()&&pending->second.owner.lock()==node)return pending->second.value;
  const auto found=shapes_.find(node.get());if(found!=shapes_.end()&&found->second.owner.lock()==node)return found->second.value;
  if(node->kind()==JournalSnapshot::Kind::Document)return documentShape(node->document());return {};
 };
 const auto checkpoint=[&]{if(!dependencies.checkpoint)throw std::invalid_argument("Missing journal checkpoint capture");auto node=dependencies.checkpoint();if(!node||node->kind()!=JournalSnapshot::Kind::Document)throw std::invalid_argument("Journal checkpoint must be a completed document");return node;};
 const auto discardUndo=[&](std::size_t count){
  count=std::min(count,next.labels.size());next.labels.erase(next.labels.begin(),next.labels.begin()+count);next.snapshots.erase(next.snapshots.begin(),next.snapshots.begin()+count);next.position=count>next.position?0:next.position-count;
 };
 const auto trim=[&]{
  if(next.labels.size()>dependencies.limit)discardUndo(next.labels.size()-dependencies.limit);
  const auto replacements=enforceSnapshotBudget(next.snapshots,dependencies.materialize,dependencies.budget);
  for(const auto& [before,after]:replacements){const auto value=knownShape(before);if(value&&!value->empty())remember(after,*value);}
  pressured=retainedSnapshotBytes(next.snapshots)>dependencies.budget;
 };
 switch(change.kind){
 case Change::Kind::Push:{
  const auto base=next.snapshots[next.position];const auto previous=knownShape(base);std::optional<Delta> delta;
  if(change.label&&previous&&*previous==shape&&dependencies.committed)delta=dependencies.committed();
  auto node=delta?JournalSnapshot::increment(base,*delta):checkpoint();remember(node,shape);
  next.snapshots.resize(next.position+1);next.labels.resize(next.position);next.snapshots.push_back(std::move(node));next.labels.push_back(change.label.value_or("\xe7\xbc\x96\xe8\xbe\x91"));next.position=next.labels.size();
  discardUndo(change.discardedUndo);trim();break;
 }
 case Change::Kind::Trim:{
  discardUndo(change.discardedUndo);
  if(change.discardedRedo){const auto first=std::max(next.position,change.discardedRedo>next.labels.size()?std::size_t(0):next.labels.size()-change.discardedRedo);next.labels.resize(first);next.snapshots.resize(first+1);}
  trim();break;
 }
 case Change::Kind::Undo:if(next.position)--next.position;remember(next.snapshots[next.position],shape);break;
 case Change::Kind::Redo:if(next.position<next.labels.size())++next.position;remember(next.snapshots[next.position],shape);break;
 case Change::Kind::Clear:next={{checkpoint()},{},0};remember(next.snapshots.front(),shape);pressured=false;break;
 }
 validate(next);
 // Allocate before publishing state. merge transfers preallocated nodes;
 // updates of existing weak owners/strings only swap after reserve succeeds.
 const auto required=shapes_.size()+updates.size();
 if(double(required)>double(shapes_.bucket_count())*shapes_.max_load_factor())shapes_.reserve(std::max(std::size_t(64),required*2));
 const auto ownerCount=shapeOwners_.size()+updates.size();if(ownerCount>shapeOwners_.capacity())shapeOwners_.reserve(std::max(ownerCount,std::max(std::size_t(64),shapeOwners_.capacity()*2)));
 for(auto& [key,value]:updates){const auto found=shapes_.find(key);
  if(found==shapes_.end()||found->second.owner.expired())shapeOwners_.emplace_back(key,value.owner);
  if(found!=shapes_.end()){found->second.owner.swap(value.owner);found->second.value.swap(value.value);}
 }
 shapes_.merge(updates);state_=std::move(next);pressured_=pressured;
 // WeakMap's GC needs a native counterpart. Bound work per event even if a
 // long base chain is still retained by an in-flight immutable generation.
 const auto sweepCount=std::min(std::size_t(64),shapeOwners_.size());
 for(std::size_t i=0;i<sweepCount&&!shapeOwners_.empty();++i){
  if(shapeSweep_>=shapeOwners_.size())shapeSweep_=0;
  const auto& entry=shapeOwners_[shapeSweep_];
  if(entry.second.expired()){const auto found=shapes_.find(entry.first);if(found!=shapes_.end()&&found->second.owner.expired())shapes_.erase(found);shapeOwners_[shapeSweep_]=std::move(shapeOwners_.back());shapeOwners_.pop_back();}
  else ++shapeSweep_;
 }
}
}
