#pragma once
#include "document_snapshot.h"
#include "recovery_scheduler.h"
#include "recovery_preferences.h"
#include <chrono>
#include <filesystem>
#include <future>
#include <optional>
#include <string>

namespace moon::editor {
// One document's recovery work travels with its session. No widget, active-tab
// swap, layout, or global current-document access is permitted here.
struct RecoverySession {
  recovery::Scheduler queue;
  std::optional<recovery::Ticket> ticket;
  std::future<void> worker;
  std::optional<std::pair<std::uint64_t,std::string>> cleanup;
  std::optional<DocumentSnapshot> snapshot;
  std::uint64_t identity=0,ownedIdentity=0;
  std::string ownedId;
  std::chrono::steady_clock::time_point due=std::chrono::steady_clock::now()+std::chrono::minutes(5);
  struct Result {std::string error;bool cleanupFailure=false;};
  Result tick(Document& document,const recovery::Preferences& preferences,
              const std::filesystem::path& directory,bool force);
};
}
