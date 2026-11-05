#pragma once
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <utility>
namespace moon {
class Document;
// Legacy HistoryStackChange. This reports a stack mutation, not a guarantee
// that the surrounding native tool has finished clearing preview state.
struct HistoryStackChange {
 enum class Kind { Push, Trim, Undo, Redo, Clear };
 Kind kind;
 std::u32string label;
 std::size_t discardedUndo=0,discardedRedo=0;
 std::uint64_t revision=0;
};
struct HistoryChangeBinding {
 using Observer=std::function<void(const Document&,const HistoryStackChange&)>;
 std::shared_ptr<const Observer> observer;
 void set(Observer next){observer=next?std::make_shared<const Observer>(std::move(next)):nullptr;}
 HistoryChangeBinding()=default;
 // Document clones/checkpoints must not retain a live session observer.
 HistoryChangeBinding(const HistoryChangeBinding&){}
 HistoryChangeBinding& operator=(const HistoryChangeBinding&){observer.reset();return *this;}
 HistoryChangeBinding(HistoryChangeBinding&&)=default;
 HistoryChangeBinding& operator=(HistoryChangeBinding&&)=default;
 void publish(const Document& document,const HistoryStackChange& change)const{
  // Allow a listener to unsubscribe itself without destroying its own target
  // while it is still executing. Exception propagation matches HistoryStack.
  const auto current=observer;if(current)(*current)(document,change);
 }
};
}
