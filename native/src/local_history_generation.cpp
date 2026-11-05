#include "local_history_generation.h"
#include "local_history_hydration.h"
#include "project_encode.h"
#include "document.h"
#include <stdexcept>
#include <algorithm>
namespace moon::local_history {
Data encodeJournalSnapshot(const JournalSnapshot::Ptr& snapshot,project::Limits limits){
 if(!snapshot)throw std::invalid_argument("Missing history snapshot encoding input");
 if(snapshot->kind()==JournalSnapshot::Kind::Archive)return snapshot->archive();
 if(snapshot->kind()==JournalSnapshot::Kind::Document)return project::encodeHistoryProject(snapshot->document(),limits).bytes;
 return project::encodeHistoryProject(PixelHistory::materialize(snapshot,limits),limits).bytes;
}
Data SnapshotEncodingCache::encode(const JournalSnapshot::Ptr& snapshot,const GenerationPreparation::Encoder& encoder){
 if(!snapshot)throw std::invalid_argument("Missing snapshot encoding input");
 if(snapshot->kind()==JournalSnapshot::Kind::Archive)return snapshot->archive();
 std::shared_future<Data> result;std::shared_ptr<std::promise<Data>> promise;
 {
  std::lock_guard<std::mutex> guard(mutex_);
  auto cursor=sweepAfter_?entries_.upper_bound(sweepAfter_):entries_.begin();
  for(std::size_t count=0;count<64&&!entries_.empty();++count){
   if(cursor==entries_.end())cursor=entries_.begin();
   sweepAfter_=cursor->first;if(cursor->second.owner.expired())cursor=entries_.erase(cursor);else ++cursor;
  }
  const auto found=entries_.find(snapshot.get());
  if(found!=entries_.end()&&found->second.owner.lock()==snapshot)result=found->second.result;
  else{
   promise=std::make_shared<std::promise<Data>>();result=promise->get_future().share();
   entries_.insert_or_assign(snapshot.get(),Entry{snapshot,result});
  }
 }
 if(promise){
  try{if(!encoder)throw std::invalid_argument("Missing history snapshot encoder");auto bytes=encoder(snapshot);if(!bytes)throw std::invalid_argument("History encoder returned no bytes");promise->set_value(std::move(bytes));}
  catch(...){const auto error=std::current_exception();{std::lock_guard<std::mutex> guard(mutex_);entries_.erase(snapshot.get());}promise->set_exception(error);}
 }
 return result.get();
}
void TransitionDeltaCache::sweep(){
 auto cursor=sweepAfter_?entries_.upper_bound(*sweepAfter_):entries_.begin();
 const auto count=std::min(std::size_t(64),entries_.size());
 for(std::size_t i=0;i<count&&!entries_.empty();++i){
  if(cursor==entries_.end())cursor=entries_.begin();sweepAfter_=cursor->first;
  if(cursor->second.before.expired()||cursor->second.after.expired())cursor=entries_.erase(cursor);else ++cursor;
 }
}
GenerationPreparation::CachedDelta TransitionDeltaCache::get(const JournalSnapshot::Ptr& before,const JournalSnapshot::Ptr& after){
 if(!before||!after)throw std::invalid_argument("Missing history transition cache owner");
 std::lock_guard<std::mutex> guard(mutex_);sweep();const auto found=entries_.find({before.get(),after.get()});
 if(found==entries_.end()||found->second.before.lock()!=before||found->second.after.lock()!=after)return {};
 return GenerationPreparation::CachedDelta(std::in_place,found->second.value);
}
void TransitionDeltaCache::set(const JournalSnapshot::Ptr& before,const JournalSnapshot::Ptr& after,std::optional<Bytes> value){
 if(!before||!after)throw std::invalid_argument("Missing history transition cache owner");
 std::lock_guard<std::mutex> guard(mutex_);sweep();entries_.insert_or_assign(Key{before.get(),after.get()},Entry{before,after,std::move(value)});
}
GenerationPreparation prepareGeneration(std::string manifestJson,const JournalSession::State& state,
 const GenerationPreparation::Encoder& encode,const GenerationPreparation::Compiler& compile,
 const GenerationPreparation::Cache& cache,project::Limits limits){
 if(state.snapshots.size()!=state.labels.size()+1||state.position>state.labels.size())throw std::invalid_argument("Invalid history generation state");
 if(state.snapshots.size()>limits.maxEntries)throw project::Error(project::ErrorKind::Limit,"Too many history generation snapshots");
 GenerationPreparation result;auto& prepared=result.prepared;prepared.manifestJson=std::move(manifestJson);prepared.increments.emplace();
 prepared.snapshots.reserve(state.snapshots.size());prepared.increments->reserve(state.snapshots.size());result.encodedCheckpoints.reserve(state.snapshots.size());
 // Same identity predicate as writeHistoryGeneration: a delta can replace a
 // snapshot only when its direct base IS the immediately preceding node.
 // A trimmed first increment and nonadjacent increments need full encoding.
 for(std::size_t index=0;index<state.snapshots.size();++index){
  const auto& snapshot=state.snapshots[index];if(!snapshot)throw std::invalid_argument("Missing history generation snapshot");
  if(index&&snapshot->kind()==JournalSnapshot::Kind::Increment&&snapshot->base()==state.snapshots[index-1]){
   prepared.increments->push_back(*snapshot->delta());prepared.snapshots.push_back({});result.encodedCheckpoints.push_back({});
  }else{
   auto bytes=snapshot->kind()==JournalSnapshot::Kind::Archive?snapshot->archive():encode?encode(snapshot):Data{};
   if(!bytes)throw std::invalid_argument("Missing encoded history checkpoint");
   if(bytes->size()>limits.archiveBytes)throw project::Error(project::ErrorKind::Limit,"History checkpoint exceeds budget");
   prepared.increments->push_back({});prepared.snapshots.push_back(bytes);result.encodedCheckpoints.push_back(std::move(bytes));
  }
 }
 prepared.deltas.reserve(state.labels.size());
 for(std::size_t index=0;index<state.labels.size();++index){
  if((*prepared.increments)[index+1]){prepared.deltas.push_back({});continue;} // packPrepared encodes the canonical increment once.
  const auto cached=cache?cache(state.snapshots[index],state.snapshots[index+1]):GenerationPreparation::CachedDelta{};
  if(cached)prepared.deltas.push_back(*cached);
  else{if(!compile)throw std::invalid_argument("Missing uncached history transition compiler");prepared.deltas.push_back(compile(state.snapshots[index],state.snapshots[index+1]));}
  if(prepared.deltas.back()&&prepared.deltas.back()->size()>limits.archiveBytes)throw project::Error(project::ErrorKind::Limit,"History transition exceeds budget");
 }
 return result;
}
}
