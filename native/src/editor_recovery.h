#pragma once
#include "document_snapshot.h"
#include "recovery_scheduler.h"
#include "recovery_preferences.h"
#include <chrono>
#include <filesystem>
#include <future>
#include <functional>
#include <memory>
#include <optional>
#include <string>

namespace moon::editor {
// One document's recovery work travels with its session. No widget, active-tab
// swap, layout, or global current-document access is permitted here.
struct RecoverySession {
  struct Result {std::string error;bool cleanupFailure=false;};
  recovery::Scheduler queue;
  std::optional<recovery::Ticket> ticket;
  std::future<void> worker;
  std::optional<std::pair<std::uint64_t,std::string>> cleanup;
  // Retain acknowledgement failure after tick consumes the future, so an
  // identity-bound automatic close cannot mistake it for successful cleanup.
  std::optional<std::pair<std::uint64_t,std::string>> cleanupError;
  struct CleanupOutcome {bool predecessorFailed=false;std::string predecessorError;};
  std::shared_ptr<CleanupOutcome> cleanupOutcome;
  // An executor either rejects before starting, or returns a valid future
  // owning the operation. Production uses the existing std::async path.
  using CleanupExecutor=std::function<std::future<void>(std::function<void()>)>;
  Result scheduleSavedCleanup(const std::filesystem::path&,std::uint64_t,const CleanupExecutor& executor={});
  std::optional<DocumentSnapshot> snapshot;
  std::uint64_t identity=0,ownedIdentity=0;
  std::string ownedId;
  std::string originId;
  bool suppressed=false;
  std::chrono::steady_clock::time_point due=std::chrono::steady_clock::now()+std::chrono::minutes(5);
  Result tick(Document& document,const recovery::Preferences& preferences,
              const std::filesystem::path& directory,bool force);
};
}
