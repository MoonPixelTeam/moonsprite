#pragma once
#include "local_history_session.h"
#include <future>
#include <map>
namespace moon::local_history {
// Immutable generation preparation for writeHistoryGeneration. Run on a
// worker with retained journal nodes; never pass the mutable live Document.
struct GenerationPreparation {
 using Encoder=std::function<Data(const JournalSnapshot::Ptr&)>;
 using Compiler=std::function<std::optional<Bytes>(const JournalSnapshot::Ptr&,const JournalSnapshot::Ptr&)>;
 // A present outer optional is a cached answer; its null inner optional is
 // the legacy structural-transition answer, distinct from a cache miss.
 using CachedDelta=std::optional<std::optional<Bytes>>;
 using Cache=std::function<CachedDelta(const JournalSnapshot::Ptr&,const JournalSnapshot::Ptr&)>;
 PreparedRequest prepared;
 std::vector<Data> encodedCheckpoints;
};
// Called from preparation workers. The first caller encodes outside the lock;
// concurrent callers share that operation/result. Failure evicts the entry.
// Weak keys never retain the snapshot, its Document or a discarded base chain.
class SnapshotEncodingCache {
 struct Entry {std::weak_ptr<const JournalSnapshot> owner;std::shared_future<Data> result;};
 std::mutex mutex_;
 std::map<const JournalSnapshot*,Entry> entries_;
 const JournalSnapshot* sweepAfter_=nullptr;
public:
 Data encode(const JournalSnapshot::Ptr&,const GenerationPreparation::Encoder&);
};
// WeakMap<before, WeakMap<after, bytes|null>>. The outer optional is a
// cache hit, including a known structural null. Returned bytes are value-owned.
class TransitionDeltaCache {
 using Key=std::pair<const JournalSnapshot*,const JournalSnapshot*>;
 struct Entry {std::weak_ptr<const JournalSnapshot> before,after;std::optional<Bytes> value;};
 struct KeyLess {bool operator()(const Key& a,const Key& b)const{const std::less<const JournalSnapshot*> less;return less(a.first,b.first)||(!less(b.first,a.first)&&less(a.second,b.second));}};
 std::mutex mutex_;
 std::map<Key,Entry,KeyLess> entries_;
 std::optional<Key> sweepAfter_;
 void sweep();
public:
 GenerationPreparation::CachedDelta get(const JournalSnapshot::Ptr&,const JournalSnapshot::Ptr&);
 void set(const JournalSnapshot::Ptr&,const JournalSnapshot::Ptr&,std::optional<Bytes>);
};
// Default checkpoint encoder for the admitted native document/delta subset.
// Archive nodes bypass decoding; unknown delta kinds fail in hydration.
Data encodeJournalSnapshot(const JournalSnapshot::Ptr&,project::Limits limits={});
GenerationPreparation prepareGeneration(std::string manifestJson,const JournalSession::State&,
 const GenerationPreparation::Encoder&,const GenerationPreparation::Compiler&,
 const GenerationPreparation::Cache& cache={},project::Limits limits={});
}
