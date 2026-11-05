#pragma once
#include "local_history_budget.h"
#include <optional>
namespace moon {struct HistoryStackChange;}
namespace moon::local_history {
class TransitionDeltaCache;
// Owner-thread state corresponding to recordLocalHistoryChange. Call only
// after an edit has settled; adapters must provide the real committed delta
// or a completed checkpoint, never encode the live project on every push.
class JournalSession {
public:
 struct State {
  std::vector<JournalSnapshot::Ptr> snapshots;
  std::vector<std::string> labels;
  std::size_t position=0;
 };
 struct Change {
  enum class Kind { Push, Trim, Undo, Redo, Clear };
  Kind kind;
  std::optional<std::string> label;
  std::size_t discardedUndo=0,discardedRedo=0;
 };
 struct Dependencies {
  std::function<JournalSnapshot::Ptr()> checkpoint;
  std::function<std::optional<Delta>()> committed;
  SnapshotMaterializer materialize;
  std::size_t limit=50;
  double budget=SnapshotBudget;
 };
 JournalSession(State,std::string currentShape);
 const State& state()const{return state_;}
 bool pressured()const{return pressured_;}
 // Call only after successful disk acknowledgement. Older in-flight vectors
 // remain unchanged; recordSnapshots is the acknowledged record's own vector.
 void acknowledge(std::vector<JournalSnapshot::Ptr>& recordSnapshots,const std::vector<Data>& encodedCheckpoints,
  TransitionDeltaCache&,double budget=SnapshotBudget);
 // Throws on capture/materialization failure; leaves prior state intact so
 // the future service can suspend recording without affecting normal undo.
 void record(const Change&,std::string currentShape,const Dependencies&);
 // Native adapter for one actual settled history notification. Caller still
 // supplies completed checkpoints/materialization and a validated event.
 // Stale generations/active previews throw before touching session state.
 void recordSettled(const Change&,const Document&,std::uint64_t expectedHistoryRevision,Dependencies,project::Limits limits={});
 // Preserve the native source payload; invoke after the surrounding tool has
 // settled, not directly from a raw stack listener during an active stroke.
 void recordSettled(const HistoryStackChange&,const Document&,Dependencies,project::Limits limits={});
private:
 struct Shape {std::weak_ptr<const JournalSnapshot> owner;std::string value;};
 State state_;
 std::unordered_map<const JournalSnapshot*,Shape> shapes_;
 // Bounded incremental collection of weak cache keys, avoiding a full
 // traversal/copy of the retained delta chain on every drawing event.
 std::vector<std::pair<const JournalSnapshot*,std::weak_ptr<const JournalSnapshot>>> shapeOwners_;
 std::size_t shapeSweep_=0;
 bool pressured_=false;
};
}
