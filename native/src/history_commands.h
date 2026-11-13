#pragma once
#include <cstddef>
#include <cstdint>
#include <deque>
#include <exception>
#include <functional>

namespace moon::workspace {
enum class HistoryAction { Undo, Redo, Jump };
struct HistoryRequest {
  std::uint64_t document = 0;
  HistoryAction action = HistoryAction::Undo;
  std::size_t position = 0;
  std::function<bool()> permitted;
};
struct HistoryContext {
  std::uint64_t document = 0;
  bool modal = false;
  bool gesture = false;
};
struct HistoryCommandResult {
  enum State { Executed, Queued, Unavailable, Failed } state = Unavailable;
  std::exception_ptr error;
};

// Legacy workspace-commands-history defers against the originating document,
// then rechecks the active identity. This queue owns no document or UI object.
// Only consecutive history-panel jumps coalesce; undo/redo remain ordered.
class HistoryCommands {
public:
  using Execute = std::function<void(const HistoryRequest&)>;

  HistoryCommandResult submit(HistoryRequest request, HistoryContext context,
                              const Execute& execute) {
    discardOtherDocuments(context.document);
    if (!request.document || request.document != context.document || context.modal)
      return {};
    if (context.gesture || !pending_.empty()) {
      if (request.action == HistoryAction::Jump && !pending_.empty() &&
          pending_.back().action == HistoryAction::Jump)
        pending_.back() = request;
      else
        pending_.push_back(request);
      return {HistoryCommandResult::Queued, {}};
    }
    return apply(request, execute);
  }

  HistoryCommandResult poll(HistoryContext context, const Execute& execute) {
    discardOtherDocuments(context.document);
    if (pending_.empty()) return {};
    if (context.modal || context.gesture) return {HistoryCommandResult::Queued, {}};
    const auto request = pending_.front();
    pending_.pop_front();
    return apply(request, execute);
  }

  bool pending() const { return !pending_.empty(); }
  const HistoryRequest* next() const { return pending_.empty() ? nullptr : &pending_.front(); }

private:
  std::deque<HistoryRequest> pending_;
  void discardOtherDocuments(std::uint64_t identity) {
    // All accepted commands belong to the active document at submission time.
    // Once a different active identity is observed, these requests are revoked.
    while (!pending_.empty() && pending_.front().document != identity) pending_.pop_front();
  }
  static HistoryCommandResult apply(const HistoryRequest& request, const Execute& execute) {
    try {
      if (request.permitted && !request.permitted()) return {};
      execute(request); return {HistoryCommandResult::Executed, {}};
    }
    catch (...) { return {HistoryCommandResult::Failed, std::current_exception()}; }
  }
};
}
